import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { writeSheet, readSheet } from '../scripts/excel-io.js';
import { placesToRows, planImport } from '../src/places-sheet.js';

const data = JSON.parse(readFileSync(new URL('../data/meals.json', import.meta.url), 'utf8'));
const dir = mkdtempSync(path.join(tmpdir(), 'dinner-excel-'));

for (const ext of ['xlsx', 'xls']) {
  test(`實際的 .${ext} 檔：匯出寫檔、讀回來、匯入計畫沒有任何變化（中文、換行的營業時間都完整）`, () => {
    const file = path.join(dir, `places.${ext}`);
    writeSheet(placesToRows(data), file);
    const { rows, error } = readSheet(file);
    assert.equal(error, undefined);
    const result = planImport(data, rows);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.plan, { added: [], updated: [], removed: [], unchanged: placesToRows(data).length });
    assert.deepEqual(result.data, data);
  });
}

test('使用者在 Excel 改過的檔：新增一列、刪一列，匯入計畫看得出來', () => {
  const file = path.join(dir, 'edited.xlsx');
  const rows = placesToRows(data).filter((r) => r.店名 !== '麥當勞');
  rows.push({ 類別: '拉麵', 店名: '新拉麵店', 連鎖: '', 行政區: '台北市士林區', 地址: '', 座標: '25.1, 121.5', 營業時間: '11:00-14:00', 公休: '日' });
  writeSheet(rows, file);
  const result = planImport(data, readSheet(file).rows);
  assert.deepEqual(result.plan.added, ['新拉麵店']);
  assert.deepEqual(result.plan.removed, ['麥當勞']);
});

test('標題列缺欄位時回報缺哪些，不當成空資料', () => {
  const file = path.join(dir, 'bad-header.xlsx');
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['類別', '店名'], ['麵', 'A']]), 'S');
  XLSX.writeFile(book, file);
  assert.match(readSheet(file).error, /行政區/);
});

// ---- 匯入流程：確認、備份、寫檔 ----
import { copyFileSync, writeFileSync, existsSync } from 'node:fs';
import { importExcel, exportExcel } from '../scripts/places-tools.js';

function workspace() {
  const base = mkdtempSync(path.join(tmpdir(), 'dinner-flow-'));
  const dataPath = path.join(base, 'meals.json');
  copyFileSync(new URL('../data/meals.json', import.meta.url), dataPath);
  return { dataPath, sheetPath: path.join(base, 'places.xlsx') };
}
const quiet = () => {};

test('匯入流程：確認後才寫入，寫入前備份原檔，內容是 Excel 的結果', async () => {
  const { dataPath, sheetPath } = workspace();
  exportExcel({ dataPath, sheetPath, log: quiet });
  const original = readFileSync(dataPath, 'utf8');
  const rows = readSheet(sheetPath).rows.filter((r) => r.店名 !== '麥當勞');
  writeSheet(rows, sheetPath);
  const result = await importExcel({ dataPath, sheetPath, confirm: async (plan) => plan.removed.length === 1, log: quiet });
  assert.equal(result.status, 'applied');
  assert.equal(readFileSync(`${dataPath}.bak`, 'utf8'), original);
  assert.ok(!readFileSync(dataPath, 'utf8').includes('麥當勞'));
});

test('匯入流程：使用者不確認就完全不動資料檔；沒有變化也不動', async () => {
  const { dataPath, sheetPath } = workspace();
  exportExcel({ dataPath, sheetPath, log: quiet });
  assert.equal((await importExcel({ dataPath, sheetPath, confirm: async () => true, log: quiet })).status, 'unchanged');
  const rows = readSheet(sheetPath).rows.filter((r) => r.店名 !== '麥當勞');
  writeSheet(rows, sheetPath);
  const before = readFileSync(dataPath, 'utf8');
  assert.equal((await importExcel({ dataPath, sheetPath, confirm: async () => false, log: quiet })).status, 'cancelled');
  assert.equal(readFileSync(dataPath, 'utf8'), before);
  assert.ok(!existsSync(`${dataPath}.bak`));
});

test('匯入流程：有錯誤時列出哪一列哪一欄，資料檔與備份都不動', async () => {
  const { dataPath, sheetPath } = workspace();
  exportExcel({ dataPath, sheetPath, log: quiet });
  const rows = readSheet(sheetPath).rows;
  rows[2].營業時間 = '11點到2點';
  writeSheet(rows, sheetPath);
  const before = readFileSync(dataPath, 'utf8');
  const lines = [];
  const result = await importExcel({ dataPath, sheetPath, confirm: async () => true, log: (l) => lines.push(l) });
  assert.equal(result.status, 'error');
  assert.ok(lines.some((l) => l.includes('第 4 列') && l.includes('營業時間')));
  assert.equal(readFileSync(dataPath, 'utf8'), before);
  assert.ok(!existsSync(`${dataPath}.bak`));
});

test('匯入流程：找不到檔案、不是店家名單的檔，都回報錯誤而不是當成空資料', async () => {
  const { dataPath, sheetPath } = workspace();
  assert.equal((await importExcel({ dataPath, sheetPath, confirm: async () => true, log: quiet })).status, 'error');
});
