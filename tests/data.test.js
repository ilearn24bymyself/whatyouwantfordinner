import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
