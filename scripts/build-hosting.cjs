const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'dist');
fs.mkdirSync(out, {recursive: true});
const assets = fs.readdirSync(root).filter(name => name.endsWith('.js') && name !== 'sw.js');
for (const name of fs.readdirSync(path.join(root, 'icons'))) {
  if (/\.(png|svg|ico)$/.test(name)) assets.push(`icons/${name}`);
}
const known = new Set(assets);
const names = new Map();
const visiting = new Set();
function rewrite(source) {
  return source.replace(/(["'])(\.\/)?([^"'\s?]+)(?:\?[^"'\s]*)?\1/g, (match, quote, prefix, name) => {
    if (!known.has(name)) return match;
    return `${quote}${prefix || ''}${build(name)}${quote}`;
  });
}
function build(name) {
  if (names.has(name)) return names.get(name);
  if (visiting.has(name)) throw new Error(`Circular asset dependency: ${name}`);
  visiting.add(name);
  let content = fs.readFileSync(path.join(root, name));
  if (name.endsWith('.js')) content = Buffer.from(rewrite(content.toString('utf8')));
  const hash = createHash('sha256').update(content).digest('hex').slice(0, 16);
  const ext = path.extname(name);
  const target = `${name.slice(0, -ext.length)}.${hash}${ext}`;
  fs.mkdirSync(path.dirname(path.join(out, target)), {recursive: true});
  fs.writeFileSync(path.join(out, target), content);
  // Keep legacy URLs revalidated for open clients and external references.
  fs.writeFileSync(path.join(out, name), fs.readFileSync(path.join(root, name)));
  names.set(name, target);
  visiting.delete(name);
  return target;
}
for (const name of assets) build(name);
for (const name of ['index.html', 'manifest.webmanifest']) {
  fs.writeFileSync(path.join(out, name), rewrite(fs.readFileSync(path.join(root, name), 'utf8')));
}
let worker = rewrite(fs.readFileSync(path.join(root, 'sw.js'), 'utf8'));
const releaseHash = createHash('sha256').update([...names.values()].join('\n') + fs.readFileSync(path.join(out, 'index.html')) + fs.readFileSync(path.join(out, 'manifest.webmanifest'))).digest('hex').slice(0, 16);
worker = worker.replace(/const CACHE_NAME = "[^"]+";/, `const CACHE_NAME = "control-asistencia-${releaseHash}";`);
fs.writeFileSync(path.join(out, 'sw.js'), worker);
console.log(`Hosting prepared: ${names.size} content-versioned assets in dist/`);
