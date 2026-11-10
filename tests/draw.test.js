import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draw } from '../src/draw.js';

// 固定亂數：讓測試每次結果相同
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const 燒臘 = {
  name: '燒臘便當',
  places: [
    {
      name: '巷口燒臘',
      mode: 'single',
      items: [
        { name: '三寶便當', unit: '1 份', kcal: 1000 },
        { name: '叉燒便當', unit: '1 份', kcal: 850 },
      ],
    },
  ],
};

test('單選一份的去哪吃只給一份點什麼，總熱量就是那一份的熱量', () => {
  const result = draw({ meals: [燒臘] }, { target: 500, rng: seeded(1) });
  assert.equal(result.meal, '燒臘便當');
  assert.equal(result.place, '巷口燒臘');
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].count, 1);
  const picked = 燒臘.places[0].items.find((i) => i.name === result.items[0].name);
  assert.ok(picked);
  assert.equal(result.totalKcal, picked.kcal);
});

// 單選一份的去哪吃，只有一個點什麼
function single(name, kcal = 500) {
  return { name, mode: 'single', items: [{ name: `${name}的餐`, unit: '1 份', kcal }] };
}

// 只有一個點什麼可抽的資料，用來檢查熱量判定
function onlyOneItem(kcal) {
  return { meals: [{ name: '便當', places: [single('某店', kcal)] }] };
}

test('結果超出容許範圍時回報超標及差距：目標 500、1000 卡 → 超標 500', () => {
  const result = draw(onlyOneItem(1000), { target: 500, rng: seeded(1) });
  assert.equal(result.diff, 500);
  assert.equal(result.status, 'over');
});

test('容許範圍是熱量目標上下 20%：目標 500 時 600 卡仍在範圍內、399 卡低於範圍', () => {
  const at600 = draw(onlyOneItem(600), { target: 500, rng: seeded(1) });
  assert.equal(at600.status, 'within');
  assert.equal(at600.diff, 100);
  const at399 = draw(onlyOneItem(399), { target: 500, rng: seeded(1) });
  assert.equal(at399.status, 'under');
  assert.equal(at399.diff, -101);
  assert.deepEqual(at399.range, { min: 400, max: 600 });
});

const 多店資料 = {
  meals: [
    { name: '麵', places: [single('麵店A'), single('麵店B'), single('麵店C'), single('麵店D')] },
    { name: '沙威瑪', places: [single('沙威瑪店')] },
  ],
};

test('每個吃什麼被抽到的機率相同，不受底下去哪吃數量影響', () => {
  const rng = seeded(42);
  const counts = { 麵: 0, 沙威瑪: 0 };
  const N = 10000;
  for (let i = 0; i < N; i++) counts[draw(多店資料, { target: 500, rng }).meal]++;
  // 等機率應各約 50%；若攤平抽去哪吃，麵會約 80%
  assert.ok(Math.abs(counts.麵 / N - 0.5) < 0.03, `麵佔 ${counts.麵 / N}`);
});

test('去哪吃只會從抽中的吃什麼底下選出', () => {
  const rng = seeded(7);
  for (let i = 0; i < 500; i++) {
    const r = draw(多店資料, { target: 500, rng });
    const meal = 多店資料.meals.find((m) => m.name === r.meal);
    assert.ok(meal.places.some((p) => p.name === r.place), `${r.meal} 底下沒有 ${r.place}`);
  }
});
