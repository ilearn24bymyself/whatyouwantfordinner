import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { listDistricts } from '../src/draw.js';

// 資料檔的基本檢查：筆誤（座標只填一半、數值離譜）會讓「只抽附近」悄悄放行或篩錯，所以在這裡擋下
const data = JSON.parse(readFileSync(new URL('../data/meals.json', import.meta.url), 'utf8'));
const places = data.meals.flatMap((meal) => meal.places.map((place) => ({ meal: meal.name, ...place })));

test('每個吃什麼至少有 1 個去哪吃，每個去哪吃都有名字', () => {
  for (const meal of data.meals) {
    assert.ok(meal.name, '有吃什麼沒有名字');
    assert.ok(meal.places.length > 0, `${meal.name} 底下沒有去哪吃`);
  }
  for (const place of places) assert.ok(place.name, `${place.meal} 底下有去哪吃沒有名字`);
});

test('座標要嘛都沒有（不受距離限制），要嘛緯度經度成對且是合理的數值', () => {
  for (const place of places) {
    const hasLat = place.lat !== undefined;
    const hasLng = place.lng !== undefined;
    assert.equal(hasLat, hasLng, `${place.name} 的座標只填了一半`);
    if (hasLat) {
      assert.ok(Number.isFinite(place.lat) && place.lat >= -90 && place.lat <= 90, `${place.name} 的緯度不合理`);
      assert.ok(Number.isFinite(place.lng) && place.lng >= -180 && place.lng <= 180, `${place.name} 的經度不合理`);
    }
  }
});

test('有座標的去哪吃一定有行政區（格式為縣市加區）；有行政區的可以沒座標', () => {
  for (const place of places) {
    if (place.lat !== undefined) assert.ok(place.district, `${place.name} 有座標卻沒有行政區`);
    if (place.district !== undefined) assert.match(place.district, /^.+[市縣].+[區鄉鎮市]$/, `${place.name} 的行政區格式不對`);
  }
});

test('資料檔實際列出的行政區（目前資料）', () => {
  assert.deepEqual(listDistricts(data), [
    '新北市新店區',
    '新北市中和區',
    '台北市北投區',
    '台北市內湖區',
    '台北市中山區',
    '台北市南港區',
  ]);
});

test('有營業時間的店：星期日到星期六七組，每組最多兩段 HH:MM-HH:MM，開門早於打烊，且不重疊', () => {
  const toMinutes = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  for (const place of places) {
    if (place.hours === undefined) continue;
    assert.equal(place.hours.length, 7, `${place.name} 的營業時間不是七天`);
    for (const day of place.hours) {
      assert.ok(Array.isArray(day) && day.length <= 2, `${place.name} 一天最多兩段`);
      let lastEnd = -1;
      for (const session of day) {
        assert.match(session, /^\d{2}:[0-5]\d-\d{2}:[0-5]\d$/, `${place.name} 的時段格式不對：${session}`);
        const [from, to] = session.split('-').map(toMinutes);
        assert.ok(from >= 0 && from < 1440 && to > from && to <= 2880, `${place.name} 的時段不合理：${session}`);
        assert.ok(from >= lastEnd, `${place.name} 的時段重疊：${session}`);
        lastEnd = to;
      }
    }
  }
});

test('每個去哪吃的名字在整份資料裡不重複（店家清單才不會同一家列兩次）', () => {
  const names = places.map((place) => place.name);
  assert.equal(new Set(names).size, names.length, `重複的店名：${names.filter((n, i) => names.indexOf(n) !== i)}`);
});
