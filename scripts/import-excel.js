// 匯入：讀 Excel（.xlsx 或 .xls，預設 data/places.xlsx，也可以把檔案拖到 .bat 上），以 Excel 為準更新 data/meals.json
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { importExcel } from './places-tools.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const yes = args.includes('--yes');
const sheetPath = path.resolve(args.find((a) => !a.startsWith('--')) ?? path.join(root, 'data', 'places.xlsx'));

const confirm = async () => {
  if (yes) return true;
  if (!process.stdin.isTTY) return false;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('確定要套用嗎？（y 套用 / 其他取消）');
  rl.close();
  return answer.trim().toLowerCase() === 'y';
};

const result = await importExcel({ dataPath: path.join(root, 'data', 'meals.json'), sheetPath, confirm });
process.exitCode = result.status === 'error' ? 1 : 0;
