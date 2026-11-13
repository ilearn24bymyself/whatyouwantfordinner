// 本機預覽伺服器本體（只綁 127.0.0.1，啟動在 serve.js）：提供網頁、資料檔，以及管理頁的後端。
// 只回應本機網址的請求，而且只提供網頁真正需要的檔案（白名單），備份檔、node_modules、隱藏資料夾都讀不到。
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createAdminApi, isLocalHost } from './admin-api.js';

const MAX_BODY_BYTES = 8 * 1024 * 1024;

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

// 網頁需要的檔案：頁面、樣式、src 底下的程式、資料檔
const STATIC_ALLOWED = /^\/(index\.html|admin\.html|styles\.css|data\/(meals|settings)\.json|src\/[A-Za-z0-9._-]+\.js)$/;

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

const sendJson = (res, status, json) =>
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(JSON.stringify(json));

export function createAppServer({ root }) {
  const adminApi = createAdminApi({ dataPath: path.join(root, 'data', 'meals.json') });

  async function handleApi(req, res, urlPath) {
    const body = req.method === 'GET' ? undefined : await readBody(req);
    if (req.method !== 'GET' && body === undefined) return sendJson(res, 413, { error: '檔案太大' });
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
      return undefined;
    }
    return sendJson(res, result.status, result.json);
  }

  async function handle(req, res) {
    if (!isLocalHost(req.headers.host)) return res.writeHead(403).end('Forbidden');
    let urlPath;
    try {
      urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      return res.writeHead(400).end('Bad request'); // 壞掉的網址（例如 /%）不能讓伺服器當掉
    }
    if (urlPath.startsWith('/api/')) return handleApi(req, res, urlPath);
    const wanted = urlPath === '/' ? '/index.html' : urlPath;
    if (!STATIC_ALLOWED.test(wanted)) return res.writeHead(404).end('Not found');
    try {
      const body = await readFile(path.join(root, wanted));
      res.writeHead(200, { 'Content-Type': mimeTypes[path.extname(wanted)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      return res.end(body);
    } catch {
      return res.writeHead(404).end('Not found');
    }
  }

  return http.createServer((req, res) => {
    handle(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });
}
