// 名單維護的流程：匯出、匯入（含確認、備份、寫檔）。命令列檔案與測試都從這裡進來。
import { existsSync } from 'node:fs';
import { placesToRows } from '../src/places-sheet.js';
import { writeSheet, readSheet } from './excel-io.js';
import { readData, planRows, writeData } from './data-store.js';

export function exportExcel({ dataPath, sheetPath, log = console.log }) {
  const rows = placesToRows(readData(dataPath));
  writeSheet(rows, sheetPath);
  log(`已匯出 ${rows.length} 家店：${sheetPath}`);
  return { count: rows.length };
}

const names = (list) => (list.length > 8 ? `${list.slice(0, 8).join('、')}…等` : list.join('、'));

// confirm(plan) 回傳 true 才會寫入。回傳 { status: 'applied' | 'unchanged' | 'cancelled' | 'error', ... }
export async function importExcel({ dataPath, sheetPath, confirm, log = console.log }) {
  if (!existsSync(sheetPath)) {
    log(`找不到 Excel 檔：${sheetPath}`);
    return { status: 'error' };
  }
  const sheet = readSheet(sheetPath);
  if (sheet.error) {
    log(`無法匯入：${sheet.error}`);
    return { status: 'error' };
  }
  const result = planRows(dataPath, sheet.rows);
  if (result.errors.length) {
    log(`匯入失敗，共 ${result.errors.length} 個問題，資料檔沒有任何改動：`);
    for (const e of result.errors) log(`  第 ${e.row} 列「${e.column}」：${e.message}`);
    return { status: 'error', errors: result.errors };
  }
  const { added, updated, removed, unchanged } = result.plan;
  if (!added.length && !updated.length && !removed.length) {
    log(`沒有任何變化（${unchanged} 家都跟資料檔一樣）。`);
    return { status: 'unchanged' };
  }
  log(`新增 ${added.length} 家、更新 ${updated.length} 家、刪除 ${removed.length} 家、沒變 ${unchanged} 家`);
  if (added.length) log(`  新增：${names(added)}`);
  if (updated.length) log(`  更新：${names(updated)}`);
  if (removed.length) log(`  刪除：${names(removed)}`);
  if (!(await confirm(result.plan))) {
    log('已取消，資料檔沒有任何改動。');
    return { status: 'cancelled' };
  }
  writeData(dataPath, result.data);
  log(`已寫入 ${dataPath}（原檔備份在 ${dataPath}.bak）。記得 commit。`);
  return { status: 'applied', plan: result.plan };
}
