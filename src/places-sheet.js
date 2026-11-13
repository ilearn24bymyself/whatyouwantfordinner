// 名單維護：資料檔 ⇄ Excel 表格列（匯出匯入、管理頁共用，不碰檔案也不依賴 Excel 外掛）。
// 一家店一列，欄位固定為 COLUMNS；店名是身分，匯入以表格為準（含刪除）。
import { parseHours, formatHours } from './hours-text.js';

export const COLUMNS = ['類別', '店名', '連鎖', '行政區', '地址', '座標', '營業時間', '公休'];
const DISTRICT_FORMAT = /^.+[市縣].+[區鄉鎮市]$/;
// 一家店在資料檔裡的欄位順序；其他欄位（點什麼、點法…）排在後面並原樣保留
const PLACE_KEYS = ['name', 'lat', 'lng', 'district', 'address', 'hours'];

const cell = (value) => String(value ?? '').trim();

// ---- 匯出 ----
export function placesToRows(data) {
  return data.meals.flatMap((meal) =>
    meal.places.map((place) => {
      const chain = place.lat === undefined && place.district === undefined;
      const { hours, closedDays } = formatHours(place.hours);
      return {
        類別: meal.name,
        店名: place.name,
        連鎖: chain ? '是' : '',
        行政區: place.district ?? '',
        地址: place.address ?? '',
        座標: place.lat === undefined ? '' : `${place.lat}, ${place.lng}`,
        營業時間: hours,
        公休: closedDays,
      };
    }),
  );
}

// ---- 匯入 ----
function parseCoordinates(text) {
  const parts = text.replace(/，/g, ',').split(/[,\s]+/).filter(Boolean);
  const [lat, lng] = parts.map(Number);
  if (parts.length !== 2 || !Number.isFinite(lat) || !Number.isFinite(lng)) return { error: '座標要寫成「緯度, 經度」兩個數字，例如 25.116015, 121.5178977' };
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return { error: '座標的數字不合理' };
  return { lat, lng };
}

// 一列 → 一家店；回傳 { meal, place } 或 { errors: [{ column, message }] }
function parseRow(row) {
  const get = (column) => cell(row[column]);
  const errors = [];
  const fail = (column, message) => errors.push({ column, message });
  const meal = get('類別');
  const name = get('店名');
  if (!meal) fail('類別', '沒有填類別');
  if (!name) fail('店名', '沒有填店名');
  const chainText = get('連鎖');
  if (chainText && !['是', '否'].includes(chainText)) fail('連鎖', `連鎖欄是連鎖店就填「是」，不是就留空（填「否」也可以），不能填「${chainText}」`);
  const place = { name };
  if (chainText === '是') {
    const filled = ['行政區', '地址', '座標', '營業時間', '公休'].filter((column) => get(column));
    if (filled.length) fail('連鎖', `連鎖店不用填${filled.join('、')}`);
  } else {
    const district = get('行政區');
    if (!district) fail('行政區', '不是連鎖店就要填行政區（例如 台北市北投區）');
    else if (!DISTRICT_FORMAT.test(district)) fail('行政區', `行政區要寫成「縣市加區」，例如 台北市北投區，不能是「${district}」`);
    else place.district = district;
    if (get('座標')) {
      const c = parseCoordinates(get('座標'));
      if (c.error) fail('座標', c.error);
      else Object.assign(place, { lat: c.lat, lng: c.lng });
    }
    if (get('地址')) place.address = get('地址');
    const parsed = parseHours({ hours: get('營業時間'), closedDays: get('公休') });
    if (parsed.error) fail('營業時間', parsed.error);
    else if (parsed.hours) place.hours = parsed.hours;
  }
  return errors.length ? { errors: errors.map((e) => ({ ...e, name })) } : { meal, place };
}

const ordered = (place, old) => {
  const out = {};
  for (const key of PLACE_KEYS) if (place[key] !== undefined) out[key] = place[key];
  // 同名的舊店有 Excel 沒有的欄位（點什麼、點法）就保留
  for (const [key, value] of Object.entries(old ?? {})) if (!PLACE_KEYS.includes(key)) out[key] = value;
  return out;
};

// 以表格列為準算出新資料與差異。有任何錯誤就不產生 data。
// errors：[{ row（Excel 第幾列，第 1 列是標題）, column, message }]
export function planImport(data, rows) {
  const old = new Map();
  for (const meal of data.meals) for (const place of meal.places) old.set(place.name, { meal: meal.name, place });
  const errors = [];
  const seen = new Set();
  const meals = new Map();
  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    if (COLUMNS.every((column) => !cell(row[column]))) return; // 空白列
    const parsed = parseRow(row);
    if (parsed.errors) {
      errors.push(...parsed.errors.map((e) => ({ row: rowNumber, ...e })));
      return;
    }
    if (seen.has(parsed.place.name)) {
      errors.push({ row: rowNumber, column: '店名', name: parsed.place.name, message: `店名「${parsed.place.name}」重複出現` });
      return;
    }
    seen.add(parsed.place.name);
    if (!meals.has(parsed.meal)) meals.set(parsed.meal, []);
    meals.get(parsed.meal).push(ordered(parsed.place, old.get(parsed.place.name)?.place));
  });
  if (!errors.length && meals.size === 0) errors.push({ row: 2, column: '店名', message: '名單不能是空的，至少要留一家店' });
  if (errors.length) return { errors, plan: undefined, data: undefined };

  const plan = { added: [], updated: [], removed: [], unchanged: 0 };
  for (const [mealName, places] of meals) {
    for (const place of places) {
      const before = old.get(place.name);
      if (!before) plan.added.push(place.name);
      else if (before.meal !== mealName || JSON.stringify(ordered(before.place, before.place)) !== JSON.stringify(place)) plan.updated.push(place.name);
      else plan.unchanged++;
    }
  }
  for (const name of old.keys()) if (!seen.has(name)) plan.removed.push(name);

  const next = {};
  for (const key of Object.keys(data)) if (key !== 'meals') next[key] = data[key];
  next.meals = [...meals].map(([name, places]) => ({ name, places }));
  return { errors: [], plan, data: next };
}

// ---- 寫成資料檔文字（跟現有格式一致：一家店一行，方便 git 看差異）----
const jsonValue = (key, value) =>
  key === 'hours' ? `[${value.map((day) => `[${day.map((s) => JSON.stringify(s)).join(', ')}]`).join(', ')}]` : JSON.stringify(value);
const placeLine = (place) => `        { ${Object.entries(place).map(([k, v]) => `${JSON.stringify(k)}: ${jsonValue(k, v)}`).join(', ')} }`;

export function serializeData(data) {
  const head = Object.entries(data)
    .filter(([key]) => key !== 'meals')
    .map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)},\n`)
    .join('');
  const meals = data.meals
    .map((meal) => `    {\n      "name": ${JSON.stringify(meal.name)},\n      "places": [\n${meal.places.map(placeLine).join(',\n')}\n      ]\n    }`)
    .join(',\n');
  return `{\n${head}  "meals": [\n${meals}\n  ]\n}\n`;
}
