// Excel 檔案的讀寫（電腦端腳本用；網頁本身不用這個外掛）。
// 表格列的規則在 src/places-sheet.js，這裡只負責 .xlsx / .xls 檔案本身。
import * as fs from 'node:fs';
import * as XLSX from 'xlsx';
import { COLUMNS } from '../src/places-sheet.js';

XLSX.set_fs(fs); // 以模組方式載入時，要先告訴外掛怎麼讀寫檔案

function buildBook(rows) {
  const sheet = XLSX.utils.json_to_sheet(rows, { header: COLUMNS });
  sheet['!cols'] = [10, 24, 6, 14, 24, 24, 34, 10].map((wch) => ({ wch }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, '店家名單');
  return book;
}

// rows → Excel 檔（副檔名 .xls 寫舊版格式，其餘寫 .xlsx）
export function writeSheet(rows, filePath) {
  XLSX.writeFile(buildBook(rows), filePath, { bookType: filePath.toLowerCase().endsWith('.xls') ? 'biff8' : 'xlsx' });
}

// rows → .xlsx 的內容（管理頁下載用）
export function sheetBuffer(rows) {
  return XLSX.write(buildBook(rows), { type: 'buffer', bookType: 'xlsx' });
}

// 讀進來的活頁簿 → rows（每個儲存格都當文字讀）；標題列缺欄位時回傳 { error }
function booksToRows(book) {
  const sheet = book.Sheets[book.SheetNames[0]];
  if (!sheet) return { error: '這個 Excel 檔沒有任何工作表' };
  const header = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })[0] ?? [];
  const missing = COLUMNS.filter((column) => !header.map((h) => String(h).trim()).includes(column));
  if (missing.length) return { error: `第 1 列的標題缺少：${missing.join('、')}（標題必須是：${COLUMNS.join('、')}）` };
  return { rows: XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false }) };
}

export function readSheet(filePath) {
  return booksToRows(XLSX.readFile(filePath));
}

export function readSheetBuffer(buffer) {
  try {
    return booksToRows(XLSX.read(buffer, { type: 'buffer' }));
  } catch {
    return { error: '讀不懂這個檔案，請選 Excel 檔（.xlsx 或 .xls）' };
  }
}
