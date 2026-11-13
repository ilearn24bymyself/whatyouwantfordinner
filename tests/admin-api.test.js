import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, copyFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createAdminApi } from '../scripts/admin-api.js';
import { placesToRows } from '../src/places-sheet.js';
import { sheetBuffer } from '../scripts/excel-io.js';

function setup() {
  const dir = mkdtempSync(path.join(tmpdir(), 'dinner-admin-'));
  const dataPath = path.join(dir, 'meals.json');
  copyFileSync(new URL('../data/meals.json', import.meta.url), dataPath);
  return { dataPath, api: createAdminApi({ dataPath }) };
}
const local = { host: '127.0.0.1:5000', 'x-dinner-admin': '1' };
const json = (rows) => Buffer.from(JSON.stringify({ rows }));
const request = (api, method, url, { headers = local, body } = {}) => api.handle({ method, path: url, headers, body });

test('讀取：回傳全部店家的表格列', async () => {
  const { api, dataPath } = setup();
  const res = await request(api, 'GET', '/api/rows');
  assert.equal(res.status, 200);
  assert.equal(res.json.rows.length, placesToRows(JSON.parse(readFileSync(dataPath, 'utf8'))).length);
  assert.ok(res.json.rows.some((r) => r.店名 === '彈芽麵'));
});

test('儲存：新增、修改、刪除都以送來的整份表格為準；寫入前備份，回傳差異與最新表格', async () => {
  const { api, dataPath } = setup();
  const original = readFileSync(dataPath, 'utf8');
  const rows = (await request(api, 'GET', '/api/rows')).json.rows.filter((r) => r.店名 !== '麥當勞');
  rows.push({ 類別: '拉麵', 店名: '新拉麵店', 連鎖: '', 行政區: '台北市士林區', 地址: '', 座標: '', 營業時間: '11:00-14:00', 公休: '' });
  const res = await request(api, 'POST', '/api/save', { body: json(rows) });
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.plan.added, ['新拉麵店']);
  assert.deepEqual(res.json.plan.removed, ['麥當勞']);
  assert.equal(readFileSync(`${dataPath}.bak`, 'utf8'), original);
  assert.ok(readFileSync(dataPath, 'utf8').includes('新拉麵店'));
  assert.ok(res.json.rows.some((r) => r.店名 === '新拉麵店'));
});

test('儲存：資料有錯就回 400 並指出列與欄，資料檔與備份都不動', async () => {
  const { api, dataPath } = setup();
  const before = readFileSync(dataPath, 'utf8');
  const rows = (await request(api, 'GET', '/api/rows')).json.rows;
  rows[0].行政區 = '亂寫';
  const res = await request(api, 'POST', '/api/save', { body: json(rows) });
  assert.equal(res.status, 400);
  assert.equal(res.json.errors[0].column, '行政區');
  assert.equal(readFileSync(dataPath, 'utf8'), before);
  assert.ok(!existsSync(`${dataPath}.bak`));
});

test('儲存：送來的不是 JSON 或沒有 rows 時回 400，不報錯當掉', async () => {
  const { api } = setup();
  assert.equal((await request(api, 'POST', '/api/save', { body: Buffer.from('不是json') })).status, 400);
  assert.equal((await request(api, 'POST', '/api/save', { body: Buffer.from('{}') })).status, 400);
});

test('安全：不是本機網址（Host 不對）、沒有自訂標頭、來源網頁不是本機，一律拒絕，資料檔不動', async () => {
  const { api, dataPath } = setup();
  const before = readFileSync(dataPath, 'utf8');
  const rows = (await request(api, 'GET', '/api/rows')).json.rows.slice(0, 1);
  const body = json(rows);
  assert.equal((await request(api, 'POST', '/api/save', { headers: { host: 'evil.example.com', 'x-dinner-admin': '1' }, body })).status, 403);
  assert.equal((await request(api, 'POST', '/api/save', { headers: { host: '127.0.0.1:5000' }, body })).status, 403);
  assert.equal((await request(api, 'POST', '/api/save', { headers: { ...local, origin: 'https://evil.example.com' }, body })).status, 403);
  assert.equal((await request(api, 'GET', '/api/rows', { headers: { host: 'evil.example.com' } })).status, 403);
  assert.equal((await request(api, 'POST', '/api/save', { headers: { ...local, origin: 'http://127.0.0.1:5000' }, body })).status, 200);
  assert.notEqual(readFileSync(dataPath, 'utf8'), before); // 合法的那次有寫入
});

test('匯出 Excel：回傳可下載的 xlsx；匯入 Excel：先回傳差異預覽（不寫入），錯誤時指出列欄', async () => {
  const { api, dataPath } = setup();
  const exported = await request(api, 'GET', '/api/export.xlsx');
  assert.equal(exported.status, 200);
  assert.match(exported.contentType, /spreadsheetml/);
  assert.ok(exported.binary.length > 1000);

  const before = readFileSync(dataPath, 'utf8');
  const rows = placesToRows(JSON.parse(before)).filter((r) => r.店名 !== '麥當勞');
  const preview = await request(api, 'POST', '/api/import-excel', { body: sheetBuffer(rows) });
  assert.equal(preview.status, 200);
  assert.deepEqual(preview.json.plan.removed, ['麥當勞']);
  assert.equal(readFileSync(dataPath, 'utf8'), before, '預覽不能寫入');

  const bad = placesToRows(JSON.parse(before));
  bad.find((r) => r.店名 === '彈芽麵').座標 = '亂寫';
  const res = await request(api, 'POST', '/api/import-excel', { body: sheetBuffer(bad) });
  assert.equal(res.status, 400);
  assert.equal(res.json.errors[0].column, '座標');
  assert.equal((await request(api, 'POST', '/api/import-excel', { body: Buffer.from('不是excel') })).status, 400);
});

test('不認得的網址回 404', async () => {
  const { api } = setup();
  assert.equal((await request(api, 'GET', '/api/nothing')).status, 404);
});
