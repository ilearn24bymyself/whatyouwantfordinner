// 管理頁的後端：只回應本機、讀寫 data/meals.json。純函式式處理，方便測試；實際的網路伺服器在 serve.js。
// 規則都在 src/places-sheet.js（匯入計畫、寫檔格式）；這裡只負責「誰能呼叫」「備份」「回傳什麼」。
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { placesToRows, planImport, serializeData } from '../src/places-sheet.js';

const LOCAL_HOST = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/;
const LOCAL_ORIGIN = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/;
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const reply = (status, json) => ({ status, json });

export function createAdminApi({ dataPath }) {
  const readData = () => JSON.parse(readFileSync(dataPath, 'utf8'));

  // 擋掉：不是本機網址（防 DNS 重新綁定）、來源網頁不是本機、寫入沒帶自訂標頭（瀏覽器跨網站不能偷帶這個標頭）
  const forbidden = ({ method, headers }) => {
    if (!LOCAL_HOST.test(headers.host ?? '')) return '只允許從本機網址使用';
    if (headers.origin && !LOCAL_ORIGIN.test(headers.origin)) return '不接受其他網站的請求';
    if (method !== 'GET' && headers['x-dinner-admin'] !== '1') return '缺少管理頁的驗證標頭';
    return undefined;
  };

  const save = (rows) => {
    const data = readData();
    const result = planImport(data, rows);
    if (result.errors.length) return reply(400, { errors: result.errors });
    copyFileSync(dataPath, `${dataPath}.bak`); // 寫入前備份一份（不進 git）
    writeFileSync(dataPath, serializeData(result.data));
    return reply(200, { plan: result.plan, rows: placesToRows(result.data) });
  };

  async function handle(req) {
    const denied = forbidden(req);
    if (denied) return reply(403, { error: denied });

    if (req.method === 'GET' && req.path === '/api/rows') return reply(200, { rows: placesToRows(readData()) });

    if (req.method === 'POST' && req.path === '/api/save') {
      let rows;
      try {
        rows = JSON.parse(req.body?.toString('utf8') ?? '').rows;
      } catch {
        rows = undefined;
      }
      if (!Array.isArray(rows)) return reply(400, { error: '送來的資料格式不對' });
      return save(rows);
    }

    // Excel 外掛只裝在電腦端，用到才載入；沒裝時給明確指示
    const excel = async () => {
      try {
        return await import('./excel-io.js');
      } catch {
        return undefined;
      }
    };
    if (req.method === 'GET' && req.path === '/api/export.xlsx') {
      const io = await excel();
      if (!io) return reply(500, { error: '還沒安裝 Excel 外掛，請先在專案資料夾執行 npm install' });
      return { status: 200, binary: io.sheetBuffer(placesToRows(readData())), contentType: XLSX_TYPE };
    }
    if (req.method === 'POST' && req.path === '/api/import-excel') {
      const io = await excel();
      if (!io) return reply(500, { error: '還沒安裝 Excel 外掛，請先在專案資料夾執行 npm install' });
      const sheet = io.readSheetBuffer(req.body ?? Buffer.alloc(0));
      if (sheet.error) return reply(400, { errors: [{ row: 1, column: '檔案', message: sheet.error }] });
      const result = planImport(readData(), sheet.rows); // 只預覽，不寫入；確認後由頁面呼叫 /api/save
      if (result.errors.length) return reply(400, { errors: result.errors });
      return reply(200, { plan: result.plan, rows: sheet.rows });
    }
    return reply(404, { error: '找不到' });
  }

  return { handle };
}
