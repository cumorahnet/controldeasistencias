const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'dist');
if (fs.existsSync(out) && fs.lstatSync(out).isSymbolicLink()) throw new Error('dist must be a real build directory');
fs.mkdirSync(out, {recursive: true});
// Only reviewed browser entry points may be published.
const assets = ['app.js', 'app-check-config.js', 'app-startup.js', 'school-timetable.js',
  'attendance-report-export.js', 'camera-data-scanner.js', 'pwa-install.js', 'vendor/xlsx.full.min.js'];
for (const name of fs.readdirSync(path.join(root, 'icons'))) {
  if (/\.(png|svg|ico)$/.test(name)) assets.push(`icons/${name}`);
}
const known = new Set(assets);
const names = new Map();
const published = new Set(['index.html', 'manifest.webmanifest', 'sw.js', 'vendor/SHEETJS-LICENSE.txt']);
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
  if (name.endsWith('.js') && !name.startsWith('vendor/')) content = Buffer.from(rewrite(content.toString('utf8')));
  const hash = createHash('sha256').update(content).digest('hex').slice(0, 16);
  const ext = path.extname(name);
  const target = `${name.slice(0, -ext.length)}.${hash}${ext}`;
  published.add(name);
  published.add(target);
  fs.mkdirSync(path.dirname(path.join(out, target)), {recursive: true});
  fs.writeFileSync(path.join(out, target), content);
  // Keep legacy URLs revalidated for open clients and external references.
  fs.writeFileSync(path.join(out, name), fs.readFileSync(path.join(root, name)));
  names.set(name, target);
  visiting.delete(name);
  return target;
}
for (const name of assets) build(name);
fs.copyFileSync(path.join(root, 'vendor/SHEETJS-LICENSE.txt'), path.join(out, 'vendor/SHEETJS-LICENSE.txt'));
for (const name of ['index.html', 'manifest.webmanifest']) {
  fs.writeFileSync(path.join(out, name), rewrite(fs.readFileSync(path.join(root, name), 'utf8')));
}
let worker = rewrite(fs.readFileSync(path.join(root, 'sw.js'), 'utf8'));
const releaseHash = createHash('sha256').update([...names.values()].join('\n') + fs.readFileSync(path.join(out, 'index.html')) + fs.readFileSync(path.join(out, 'manifest.webmanifest')) + worker).digest('hex').slice(0, 16);
worker = worker.replace(/const CACHE_NAME = "[^"]+";/, `const CACHE_NAME = "control-asistencia-${releaseHash}";`);
fs.writeFileSync(path.join(out, 'sw.js'), worker);
// Remove obsolete build output, including files left by earlier deployments.
// The destination is fixed above; never follow directory symlinks.
function prune(directory) {
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      prune(file);
      if (!fs.readdirSync(file).length) fs.rmdirSync(file);
    } else if (entry.isSymbolicLink() || !published.has(path.relative(out, file).split(path.sep).join('/'))) {
      fs.unlinkSync(file);
    }
  }
}
prune(out);
console.log(`Hosting prepared: ${names.size} content-versioned assets in dist/`);
