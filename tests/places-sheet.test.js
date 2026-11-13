import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COLUMNS, placesToRows, planImport, serializeData } from '../src/places-sheet.js';

const fileText = readFileSync(new URL('../data/meals.json', import.meta.url), 'utf8');
const data = JSON.parse(fileText);
const allPlaces = data.meals.flatMap((m) => m.places);
const clone = (x) => JSON.parse(JSON.stringify(x));

test('匯出：一家一列，欄位固定；連鎖填「是」，座標與營業時間轉成文字', () => {
  const rows = placesToRows(data);
  assert.equal(rows.length, allPlaces.length);
  assert.deepEqual(Object.keys(rows[0]), COLUMNS);
  const mcd = rows.find((r) => r.店名 === '麥當勞');
  assert.equal(mcd.連鎖, '是');
  assert.equal(mcd.行政區, '');
  const tan = rows.find((r) => r.店名 === '彈芽麵');
  assert.equal(tan.類別, '麵');
  assert.equal(tan.連鎖, '');
  assert.equal(tan.行政區, '台北市北投區');
  assert.equal(tan.座標, '25.116015, 121.5178977');
  assert.equal(tan.公休, '');
  assert.match(tan.營業時間, /星期五 16:30-20:50/);
});

test('匯出再匯入：資料完全相同（沒有新增、更新、刪除），連檔案文字都一樣', () => {
  const result = planImport(data, placesToRows(data));
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.plan, { added: [], updated: [], removed: [], unchanged: allPlaces.length });
  assert.deepEqual(result.data, data);
  assert.equal(serializeData(result.data), fileText.replace(/\r\n/g, '\n'));
});

test('匯入：新增一列＝新增；改一欄＝更新；刪一列＝刪除；新類別排在最後', () => {
  const rows = placesToRows(data).filter((r) => r.店名 !== '麥當勞');
  rows.find((r) => r.店名 === '彈芽麵').行政區 = '台北市士林區';
  rows.push({ 類別: '拉麵', 店名: '新拉麵店', 連鎖: '', 行政區: '台北市士林區', 地址: '士林路1號', 座標: '', 營業時間: '11:00-14:00、17:00-20:00', 公休: '一' });
  const { errors, plan, data: next } = planImport(data, rows);
  assert.deepEqual(errors, []);
  assert.deepEqual(plan.added, ['新拉麵店']);
  assert.deepEqual(plan.updated, ['彈芽麵']);
  assert.deepEqual(plan.removed, ['麥當勞']);
  assert.equal(next.meals.at(-1).name, '拉麵');
  const added = next.meals.at(-1).places[0];
  assert.deepEqual(added, { name: '新拉麵店', district: '台北市士林區', address: '士林路1號', hours: [['11:00-14:00', '17:00-20:00'], [], ['11:00-14:00', '17:00-20:00'], ['11:00-14:00', '17:00-20:00'], ['11:00-14:00', '17:00-20:00'], ['11:00-14:00', '17:00-20:00'], ['11:00-14:00', '17:00-20:00']].map((d, i) => (i === 1 ? [] : ['11:00-14:00', '17:00-20:00'])) });
  assert.ok(!next.meals.some((m) => m.places.some((p) => p.name === '麥當勞')));
});

test('匯入：換類別算更新；整個類別的店都刪掉，這個類別就消失', () => {
  const rows = placesToRows(data);
  rows.find((r) => r.店名 === '彈芽麵').類別 = '小吃';
  const { plan, data: next } = planImport(data, rows);
  assert.deepEqual(plan.updated, ['彈芽麵']);
  assert.ok(next.meals.find((m) => m.name === '小吃').places.some((p) => p.name === '彈芽麵'));
  const without = placesToRows(data).filter((r) => r.類別 !== '披薩');
  assert.ok(!planImport(data, without).data.meals.some((m) => m.name === '披薩'));
});

test('匯入：同名店保留 Excel 沒有的欄位（點什麼、點法），資料檔其他頂層欄位也保留', () => {
  const base = { _note: '備註', meals: [{ name: '麵', places: [{ name: '某店', district: '台北市北投區', mode: 'single', items: [{ name: 'x', unit: '1', kcal: 1 }] }] }] };
  const { data: next, plan } = planImport(base, placesToRows(base));
  assert.deepEqual(next, base);
  assert.equal(plan.unchanged, 1);
  assert.equal(next._note, '備註');
});

test('匯入：空白列略過；儲存格是數字或前後有空白也能處理', () => {
  const rows = [
    { 類別: '麵', 店名: ' 某店 ', 連鎖: '', 行政區: '台北市北投區', 地址: '', 座標: '25.1，121.5', 營業時間: '', 公休: '' },
    { 類別: '', 店名: '', 連鎖: '', 行政區: '', 地址: '', 座標: '', 營業時間: '', 公休: '' },
    { 類別: '麵', 店名: 123, 連鎖: '是' },
  ];
  const { errors, data: next } = planImport({ meals: [] }, rows);
  assert.deepEqual(errors, []);
  assert.deepEqual(next.meals[0].places, [{ name: '某店', lat: 25.1, lng: 121.5, district: '台北市北投區' }, { name: '123' }]);
});

test('匯入錯誤：指出第幾列、哪一欄；有任何錯誤就不產生結果', () => {
  const ok = { 類別: '麵', 店名: 'A', 連鎖: '', 行政區: '台北市北投區', 地址: '', 座標: '', 營業時間: '', 公休: '' };
  const cases = [
    [{ ...ok, 類別: '' }, '類別'],
    [{ ...ok, 店名: '' }, '店名'],
    [{ ...ok, 行政區: '' }, '行政區'],
    [{ ...ok, 行政區: '北投區' }, '行政區'],
    [{ ...ok, 座標: '25.1' }, '座標'],
    [{ ...ok, 座標: '95, 121' }, '座標'],
    [{ ...ok, 營業時間: '11點到2點' }, '營業時間'],
    [{ ...ok, 公休: '二' }, '營業時間'],
    [{ ...ok, 連鎖: '是' }, '連鎖'],
    [{ ...ok, 連鎖: '也許' }, '連鎖'],
  ];
  for (const [row, column] of cases) {
    const result = planImport({ meals: [] }, [ok, { ...row, 店名: row.店名 === '' ? '' : 'B' }]);
    assert.ok(result.errors.length > 0, `${column} 的錯誤沒被抓到`);
    assert.equal(result.errors[0].row, 3, '第二筆資料在 Excel 是第 3 列（第 1 列是標題）');
    assert.equal(result.errors[0].column, column);
    assert.equal(result.data, undefined);
  }
});

test('匯入錯誤：店名重複、連鎖店填了行政區或營業時間都要擋下', () => {
  const a = { 類別: '麵', 店名: 'A', 連鎖: '', 行政區: '台北市北投區' };
  assert.equal(planImport({ meals: [] }, [a, { ...a, 類別: '飯' }]).errors[0].column, '店名');
  const chain = { 類別: '速食', 店名: 'C', 連鎖: '是' };
  assert.equal(planImport({ meals: [] }, [{ ...chain, 行政區: '台北市北投區' }]).errors[0].column, '連鎖');
  assert.equal(planImport({ meals: [] }, [{ ...chain, 座標: '25.1, 121.5' }]).errors[0].column, '連鎖');
  assert.equal(planImport({ meals: [] }, [{ ...chain, 地址: '某路' }]).errors[0].column, '連鎖');
});

test('輸出的檔案文字：一家店一行、可以被讀回、跟資料檔格式一致（含新增的店與地址）', () => {
  const next = clone(data);
  next.meals[0].places.push({ name: '新店', district: '台北市士林區', address: '某路1號', hours: [['11:00-14:00'], [], [], [], [], [], []] });
  const text = serializeData(next);
  assert.deepEqual(JSON.parse(text), next);
  assert.ok(text.endsWith('\n'));
  assert.match(text, /\{ "name": "新店", "district": "台北市士林區", "address": "某路1號", "hours": \[\["11:00-14:00"\], \[\], /);
});

test('匯入結果不能是零家店（空檔、只有標題列、全部刪光）：擋下並說明，不產生結果', () => {
  for (const rows of [[], [{ 類別: '', 店名: '' }]]) {
    const result = planImport(data, rows);
    assert.equal(result.data, undefined);
    assert.match(result.errors[0].message, /至少/);
  }
});

test('錯誤帶店名（管理頁用店名而不是列號指出問題）；連鎖欄的錯誤說明「是」或留空，「否」也接受', () => {
  const result = planImport({ meals: [] }, [{ 類別: '麵', 店名: 'A', 連鎖: '也許', 行政區: '台北市北投區' }]);
  assert.equal(result.errors[0].name, 'A');
  assert.match(result.errors[0].message, /是/);
  assert.match(result.errors[0].message, /否/);
  assert.deepEqual(planImport({ meals: [] }, [{ 類別: '麵', 店名: 'A', 連鎖: '否', 行政區: '台北市北投區' }]).errors, []);
});

test('資料檔裡鍵的順序不同，也不會把沒改的店誤判成更新', () => {
  const shuffled = { meals: [{ name: '麵', places: [{ district: '台北市北投區', name: 'A' }] }] };
  const result = planImport(shuffled, placesToRows(shuffled));
  assert.deepEqual(result.plan, { added: [], updated: [], removed: [], unchanged: 1 });
});

test('連鎖店可以選填營業時間與公休（例如麥味登只賣早餐）；匯出匯入來回一致；公休沒搭營業時間仍是錯誤', () => {
  const rows = [{ 類別: '早餐', 店名: '早餐連鎖', 連鎖: '是', 營業時間: '06:00-14:00', 公休: '日' }, { 類別: '速食', 店名: '全天連鎖', 連鎖: '是' }];
  const { errors, data: next } = planImport({ meals: [] }, rows);
  assert.deepEqual(errors, []);
  const [breakfast] = next.meals[0].places;
  assert.deepEqual(Object.keys(breakfast), ['name', 'hours']);
  assert.deepEqual(breakfast.hours[0], []);
  assert.deepEqual(breakfast.hours[1], ['06:00-14:00']);
  assert.equal(next.meals[1].places[0].hours, undefined);
  const back = planImport(next, placesToRows(next));
  assert.deepEqual(back.plan, { added: [], updated: [], removed: [], unchanged: 2 });
  assert.equal(placesToRows(next)[0].連鎖, '是');
  assert.equal(planImport({ meals: [] }, [{ 類別: '速食', 店名: 'X', 連鎖: '是', 公休: '日' }]).errors[0].column, '營業時間');
});
