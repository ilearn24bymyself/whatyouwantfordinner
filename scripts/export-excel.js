// 匯出：把 data/meals.json 變成 Excel（預設 data/places.xlsx，也可以在後面指定檔名）
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportExcel } from './places-tools.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sheetPath = path.resolve(process.argv[2] ?? path.join(root, 'data', 'places.xlsx'));
exportExcel({ dataPath: path.join(root, 'data', 'meals.json'), sheetPath });
