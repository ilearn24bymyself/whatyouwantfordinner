// 資料檔的讀寫：匯入流程（Excel 腳本）與管理頁後端共用同一份，備份規則只在這裡。
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { planImport, serializeData } from '../src/places-sheet.js';

export const readData = (dataPath) => JSON.parse(readFileSync(dataPath, 'utf8'));

// 以表格列為準，算出新資料與差異（不寫入）：{ errors, plan, data }
export const planRows = (dataPath, rows) => planImport(readData(dataPath), rows);

// 寫入前備份原檔一份（dataPath.bak，不進 git），再寫入新資料
export function writeData(dataPath, data) {
  copyFileSync(dataPath, `${dataPath}.bak`);
  writeFileSync(dataPath, serializeData(data));
}
