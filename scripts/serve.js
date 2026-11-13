// 本機預覽伺服器：port 自動取得空閒的，啟動後打開瀏覽器。
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { exec } from 'node:child_process';
import { createAdminApi } from './admin-api.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 管理頁的後端：只在這個本機伺服器才有，上線的網頁沒有（見 admin-api.js 的安全規則）
const adminApi = createAdminApi({ dataPath: path.join(root, 'data', 'meals.json') });
const MAX_BODY_BYTES = 8 * 1024 * 1024;

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size <= MAX_BODY_BYTES) chunks.push(chunk);
    });
    req.on('end', () => resolve(size > MAX_BODY_BYTES ? undefined : Buffer.concat(chunks)));
  });
}

async function handleApi(req, res, urlPath) {
  const body = req.method === 'GET' ? undefined : await readBody(req);
  if (req.method !== 'GET' && body === undefined) {
    res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify({ error: '檔案太大' }));
    return;
  }
  let result;
  try {
    result = await adminApi.handle({ method: req.method, path: urlPath, headers: req.headers, body });
  } catch (err) {
    result = { status: 500, json: { error: `伺服器出錯：${err.message}` } };
  }
  if (result.binary) {
    res.writeHead(result.status, {
      'Content-Type': result.contentType,
      'Content-Disposition': 'attachment; filename="places.xlsx"',
      'Cache-Control': 'no-store',
    });
    res.end(result.binary);
    return;
  }
  res.writeHead(result.status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(result.json));
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

const server = http.createServer(async (req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (urlPath.startsWith('/api/')) {
    await handleApi(req, res, urlPath);
    return;
  }
  const filePath = path.resolve(root, '.' + (urlPath === '/' ? '/index.html' : urlPath));
  if (!filePath.startsWith(root + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': mimeTypes[path.extname(filePath)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
});

server.listen(0, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${server.address().port}/`;
  console.log(`Dinner slot running at ${url}`);
  console.log('Close this window to stop.');
  if (!process.env.NO_OPEN) {
    const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
    exec(cmd);
  }
});
