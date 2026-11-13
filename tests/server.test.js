import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAppServer } from '../scripts/server.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let server;
let port;

before(async () => {
  server = createAppServer({ root });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});
after(() => new Promise((resolve) => server.close(resolve)));

// 用 http.request 才能自己指定 Host（模擬 DNS 重新綁定）；回傳 { status }
function get(urlPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: urlPath, headers }, (res) => {
      res.resume();
      res.on('end', () => resolve({ status: res.statusCode }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('正常的頁面與資料檔可以讀', async () => {
  for (const p of ['/', '/index.html', '/admin.html', '/styles.css', '/src/app.js', '/src/draw.js', '/data/meals.json', '/data/settings.json']) {
    assert.equal((await get(p)).status, 200, p);
  }
});

test('網址壞掉（例如 /%）時回 400，伺服器不會當掉，之後還能正常回應', async () => {
  assert.equal((await get('/%')).status, 400);
  assert.equal((await get('/%E0%A4%A')).status, 400);
  assert.equal((await get('/index.html')).status, 200);
});

test('不該公開的檔案讀不到：備份檔、node_modules、隱藏資料夾、規格與票檔、其他專案檔', async () => {
  for (const p of ['/data/meals.json.bak', '/node_modules/xlsx/package.json', '/.git/config', '/.scratch/dinner-slot/spec-hours.md', '/package.json', '/package-lock.json', '/scripts/serve.js', '/data/places.xlsx', '/tests/draw.test.js', '/%2e%2e/package.json', '/src/../package.json']) {
    assert.ok([403, 404].includes((await get(p)).status), `${p} 不該讀得到`);
  }
});

test('不是本機網址（Host 不對）的請求，連頁面也不給', async () => {
  assert.equal((await get('/index.html', { host: 'evil.example.com' })).status, 403);
  assert.equal((await get('/data/meals.json', { host: 'evil.example.com:80' })).status, 403);
  assert.equal((await get('/index.html', { host: `localhost:${port}` })).status, 200);
});
