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

test('去哪吃沒有點什麼資料時，結果沒有點什麼、也不帶熱量判定，且不報錯', () => {
  const data = {
    meals: [
      {
        name: '麵',
        places: [{ name: '回家路上的便利商店' }, { name: '家裡煮麵', items: [] }],
      },
    ],
  };
  const rng = seeded(3);
  for (let i = 0; i < 20; i++) {
    const result = draw(data, { target: 500, rng });
    assert.equal(result.meal, '麵');
    assert.deepEqual(result.items, []);
    assert.equal(result.totalKcal, undefined);
    assert.equal(result.diff, undefined);
    assert.equal(result.status, undefined);
  }
});

test('同一個吃什麼底下混有「有點什麼」與「沒有點什麼」的去哪吃，各自依資料決定是否帶熱量', () => {
  const data = { meals: [{ name: '麵', places: [{ name: '家裡煮麵' }, single('巷口麵店', 550)] }] };
  const rng = seeded(11);
  const seen = new Set();
  for (let i = 0; i < 50; i++) {
    const result = draw(data, { target: 500, rng });
    seen.add(result.place);
    if (result.place === '巷口麵店') {
      assert.equal(result.items.length, 1);
      assert.equal(result.totalKcal, 550);
      assert.equal(result.status, 'within');
    } else {
      assert.deepEqual(result.items, []);
      assert.equal(result.status, undefined);
    }
  }
  assert.equal(seen.size, 2);
});

// 重抽用的資料：兩個吃什麼，各有多個去哪吃，去哪吃各有多個點什麼
const 重抽資料 = {
  meals: [
    {
      name: '麵',
      places: [
        { name: '麵店A', mode: 'single', items: [{ name: 'A1', unit: '1 碗', kcal: 500 }, { name: 'A2', unit: '1 碗', kcal: 520 }] },
        { name: '麵店B', mode: 'single', items: [{ name: 'B1', unit: '1 碗', kcal: 480 }, { name: 'B2', unit: '1 碗', kcal: 510 }] },
        { name: '家裡煮麵' },
      ],
    },
    {
      name: '便當',
      places: [
        { name: '便當店C', mode: 'single', items: [{ name: 'C1', unit: '1 份', kcal: 800 }, { name: 'C2', unit: '1 份', kcal: 850 }] },
      ],
    },
  ],
};

// 一直抽到符合條件為止，用來準備「上一次的結果」
function drawUntil(rng, predicate) {
  let result;
  do result = draw(重抽資料, { target: 500, rng });
  while (!predicate(result));
  return result;
}

function findMeal(name) {
  return 重抽資料.meals.find((m) => m.name === name);
}

test('重抽「去哪吃」時，吃什麼不變；有別的去哪吃時一定換掉，點什麼來自新的去哪吃', () => {
  const rng = seeded(21);
  for (let i = 0; i < 200; i++) {
    const previous = drawUntil(rng, (r) => r.meal === '麵');
    const next = draw(重抽資料, { target: 500, rng, previous, reroll: 'place' });
    assert.equal(next.meal, '麵');
    assert.notEqual(next.place, previous.place);
    const place = findMeal('麵').places.find((p) => p.name === next.place);
    assert.ok(place, `麵底下沒有 ${next.place}`);
    for (const item of next.items) assert.ok(place.items.some((candidate) => candidate.name === item.name));
  }
});

test('重抽「點什麼」時，吃什麼與去哪吃都不變，點什麼一定換成同一個去哪吃的另一份', () => {
  const rng = seeded(22);
  for (let i = 0; i < 200; i++) {
    const previous = drawUntil(rng, (r) => r.place === '麵店A');
    const next = draw(重抽資料, { target: 500, rng, previous, reroll: 'items' });
    assert.equal(next.meal, '麵');
    assert.equal(next.place, '麵店A');
    assert.ok(['A1', 'A2'].includes(next.items[0].name));
    assert.notEqual(next.items[0].name, previous.items[0].name);
  }
});

test('重抽「吃什麼」時，一定換成別的吃什麼，去哪吃與點什麼都屬於新的吃什麼', () => {
  const rng = seeded(23);
  for (let i = 0; i < 200; i++) {
    const previous = draw(重抽資料, { target: 500, rng });
    const next = draw(重抽資料, { target: 500, rng, previous, reroll: 'meal' });
    assert.notEqual(next.meal, previous.meal);
    const place = findMeal(next.meal).places.find((p) => p.name === next.place);
    assert.ok(place, `${next.meal} 底下沒有 ${next.place}`);
    for (const item of next.items) assert.ok(place.items.some((candidate) => candidate.name === item.name));
  }
});

test('吃什麼底下只有 1 個去哪吃時，重抽「去哪吃」不出錯，維持同一個去哪吃並重配點什麼', () => {
  const rng = seeded(24);
  const seenItems = new Set();
  for (let i = 0; i < 100; i++) {
    const previous = drawUntil(rng, (r) => r.meal === '便當');
    const next = draw(重抽資料, { target: 500, rng, previous, reroll: 'place' });
    assert.equal(next.meal, '便當');
    assert.equal(next.place, '便當店C');
    seenItems.add(next.items[0].name);
  }
  assert.equal(seenItems.size, 2);
});

test('只有一個選項可換時，重抽維持原樣不出錯', () => {
  const data = { meals: [{ name: '沙威瑪', places: [single('沙威瑪店')] }] };
  const previous = draw(data, { target: 500, rng: seeded(1) });
  for (const reroll of ['meal', 'place', 'items']) {
    const next = draw(data, { target: 500, rng: seeded(2), previous, reroll });
    assert.equal(next.meal, '沙威瑪');
    assert.equal(next.place, '沙威瑪店');
    assert.equal(next.items[0].name, '沙威瑪店的餐');
  }
});

test('重抽的層名稱打錯時直接報錯，不默默變成全部重抽', () => {
  const previous = draw(重抽資料, { target: 500, rng: seeded(1) });
  assert.throws(() => draw(重抽資料, { target: 500, rng: seeded(2), previous, reroll: 'plcae' }));
});
