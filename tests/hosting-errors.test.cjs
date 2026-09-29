const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const root = path.resolve(__dirname, '..');
test('Hosting usa contenido inmutable y la PWA precarga las mismas URLs', () => {
  execFileSync(process.execPath, ['scripts/build-hosting.cjs'], {cwd:root});
  const dir = path.join(root,'dist');
  const html = fs.readFileSync(path.join(dir,'index.html'),'utf8');
  const sw = fs.readFileSync(path.join(dir,'sw.js'),'utf8');
  const scripts = [...html.matchAll(/src="\.\/([^"?]+\.js)"/g)].map(m=>m[1]);
  assert.ok(scripts.length >= 5);
  for (const name of scripts) {
    assert.match(name, /\.[a-f0-9]{16}\.js$/);
    const content = fs.readFileSync(path.join(dir,name));
    assert.ok(name.includes(createHash('sha256').update(content).digest('hex').slice(0,16)));
    assert.ok(sw.includes(`"${name}"`));
    for (const m of content.toString().matchAll(/from "\.\/([^"?]+\.js)"/g)) {
      assert.match(m[1], /\.[a-f0-9]{16}\.js$/);
      assert.ok(fs.existsSync(path.join(dir,m[1])));
      assert.ok(sw.includes(`"${m[1]}"`));
    }
  }
  assert.ok(!fs.existsSync(path.join(dir,'functions')));
  assert.ok(!fs.existsSync(path.join(dir,'.env')));
  const first = fs.readFileSync(path.join(dir,'sw.js'),'utf8');
  execFileSync(process.execPath,['scripts/build-hosting.cjs'],{cwd:root});
  assert.equal(fs.readFileSync(path.join(dir,'sw.js'),'utf8'),first);
});
test('errores de acceso y solicitudes agotadas tienen mensajes claros', () => {
  const source=fs.readFileSync(path.join(root,'app.js'),'utf8');
  const fn=source.slice(source.indexOf('function functionError('), source.indexOf('function backendUnavailable('));
  const ctx={}; vm.createContext(ctx); vm.runInContext(fn,ctx);
  assert.match(ctx.functionError({code:'functions/permission-denied'}), /permisos/);
  assert.match(ctx.functionError({code:'functions/unauthenticated'}), /verificar el acceso/);
  assert.match(ctx.functionError({code:'functions/deadline-exceeded'}), /si el cambio se guardó/);
  assert.equal(ctx.functionError({message:'Mensaje específico'}), 'Mensaje específico');
});

test('App Check se inicializa antes de Firestore solo con clave configurada', () => {
  const source=fs.readFileSync(path.join(root,'app.js'),'utf8');
  const fragment=source.slice(source.indexOf('const firebaseApp ='),source.indexOf('const api ='));
  for (const siteKey of ['', 'public-test-site-key']) {
    const calls=[];
    const ctx={firebaseConfig:{}, window:{FirebaseAppCheckConfig:{siteKey}},
      initializeApp:()=>({}), initializeAppCheck:(app,options)=>calls.push(['check',options]),
      ReCaptchaEnterpriseProvider: function(key){this.key=key;},
      getFirestore:()=>calls.push(['db']),getAuth:()=>({}),getFunctions:()=>({})};
    vm.runInNewContext(fragment,ctx);
    assert.equal(calls[0][0],siteKey ? 'check':'db');
    if(siteKey){assert.equal(calls[0][1].provider.key,siteKey);assert.equal(calls[0][1].isTokenAutoRefreshEnabled,true);}
  }
});
