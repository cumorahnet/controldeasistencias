// Read-only verification of the current local build against Firebase Hosting.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..', 'dist');
const base = 'https://controldeasistencias-8308c.web.app/';
function files(directory) {
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? files(full) : [full];
  });
}
async function main() {
  const assets = files(root);
  for (let offset = 0; offset < assets.length; offset += 5) {
    await Promise.all(assets.slice(offset, offset + 5).map(async (file) => {
      const name = path.relative(root, file).split(path.sep).join('/');
      const response = await fetch(new URL(name, base), {signal: AbortSignal.timeout(30000)});
      assert.equal(response.status, 200, name);
      assert.ok(Buffer.from(await response.arrayBuffer()).equals(fs.readFileSync(file)), `Content mismatch: ${name}`);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff', name);
      assert.equal(response.headers.get('x-frame-options'), 'DENY', name);
      assert.ok(response.headers.get('content-security-policy')?.includes("frame-ancestors 'none'"), name);
      assert.match(response.headers.get('cache-control'), /\.[a-f0-9]{16}\./.test(name) ? /immutable/ : /no-cache/, name);
    }));
  }
  console.log(`Verified ${assets.length} public files: exact bytes, cache and security headers.`);
  for (const name of ['listTeachers', 'listAuditLogs', 'updateSchool']) {
    const response = await fetch(`https://us-central1-controldeasistencias-8308c.cloudfunctions.net/${name}`, {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({data: {}}), signal: AbortSignal.timeout(30000),
    });
    const result = await response.json();
    assert.equal(response.status, 401, name);
    assert.equal(result.error?.status, 'UNAUTHENTICATED', name);
  }
  console.log('Protected callables reject unauthenticated requests (3/3).');
}
main().catch((error) => {console.error(error.message); process.exitCode = 1;});
