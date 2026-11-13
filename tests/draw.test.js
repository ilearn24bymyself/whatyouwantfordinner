import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { draw, listDistricts, districtLabel } from '../src/draw.js';

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

// ---- 只抽附近（定位）----
// 以原點正北方 m 公尺的座標，用來造出剛好在半徑 3000 公尺內、外的店（1 度緯度約 111,195 公尺）
const 原點 = { lat: 25, lng: 121 };
const 北方 = (m) => 25 + m / 111195;
function 有座標(name, northMeters, items) {
  const place = { name, lat: 北方(northMeters), lng: 121 };
  return items ? { ...place, mode: 'single', items } : place;
}

const 附近資料 = {
  meals: [
    { name: '麵', places: [有座標('近麵店', 2995), 有座標('遠麵店', 3005)] },
    { name: '便當', places: [有座標('遠便當店', 5000)] },
    { name: '速食', places: [{ name: '麥當勞' }, { name: '漢堡王' }] },
  ],
};

function placesSeen(data, options, n = 600) {
  const rng = seeded(31);
  const seen = new Set();
  for (let i = 0; i < n; i++) seen.add(draw(data, { target: 500, rng, ...options }).place);
  return seen;
}

test('不給定位時，所有店都參加（行為與沒有定位功能時相同）', () => {
  assert.deepEqual(
    [...placesSeen(附近資料, {})].sort(),
    ['近麵店', '遠麵店', '遠便當店', '麥當勞', '漢堡王'].sort(),
  );
});

test('給定位時，半徑 3 公里內的店與沒有座標的店參加，半徑外的店不參加', () => {
  assert.deepEqual([...placesSeen(附近資料, { position: 原點 })].sort(), ['近麵店', '麥當勞', '漢堡王'].sort());
});

test('離所有有座標的店都很遠時，仍抽得到沒有座標的店，不報錯', () => {
  const rng = seeded(32);
  for (let i = 0; i < 100; i++) {
    const result = draw(附近資料, { target: 500, rng, position: { lat: 0, lng: 0 } });
    assert.equal(result.meal, '速食');
    assert.ok(['麥當勞', '漢堡王'].includes(result.place));
  }
});

test('附近沒有店的吃什麼不參加，其餘吃什麼仍等機率', () => {
  const data = {
    meals: [
      { name: 'A', places: [有座標('A店', 1000)] },
      { name: 'B', places: [有座標('B店1', 1500), 有座標('B店2', 2000)] },
      { name: 'C', places: [有座標('C店', 9000)] },
      { name: 'D', places: [{ name: 'D品牌' }] },
    ],
  };
  const rng = seeded(33);
  const counts = { A: 0, B: 0, C: 0, D: 0 };
  const N = 9000;
  for (let i = 0; i < N; i++) counts[draw(data, { target: 500, rng, position: 原點 }).meal]++;
  assert.equal(counts.C, 0);
  for (const name of ['A', 'B', 'D']) assert.ok(Math.abs(counts[name] / N - 1 / 3) < 0.03, `${name} 佔 ${counts[name] / N}`);
});

// 重抽（換）沿用定位：麵底下有 2 家附近的店與 1 家遠的店，速食是 2 個品牌
const 附近重抽資料 = {
  meals: [
    {
      name: '麵',
      places: [
        有座標('近A', 2000, [{ name: 'A1', unit: '1 碗', kcal: 500 }, { name: 'A2', unit: '1 碗', kcal: 520 }]),
        有座標('近B', 2500, [{ name: 'B1', unit: '1 碗', kcal: 480 }, { name: 'B2', unit: '1 碗', kcal: 510 }]),
        有座標('遠C', 4000, [{ name: 'C1', unit: '1 碗', kcal: 490 }]),
      ],
    },
    { name: '速食', places: [{ name: '麥當勞' }, { name: '漢堡王' }] },
  ],
};

function drawNearbyUntil(rng, predicate) {
  let result;
  do result = draw(附近重抽資料, { target: 500, rng, position: 原點 });
  while (!predicate(result));
  return result;
}

test('給定位時重抽「吃什麼」：一定換成另一個吃什麼，且仍在篩選範圍內', () => {
  const rng = seeded(41);
  for (let i = 0; i < 200; i++) {
    const previous = drawNearbyUntil(rng, () => true);
    const next = draw(附近重抽資料, { target: 500, rng, position: 原點, previous, reroll: 'meal' });
    assert.notEqual(next.meal, previous.meal);
    if (next.meal === '麵') assert.ok(['近A', '近B'].includes(next.place), `抽到 ${next.place}`);
  }
});

test('給定位時重抽「去哪吃」：吃什麼不變，換成另一家附近的店，不會抽到半徑外的店', () => {
  const rng = seeded(42);
  for (let i = 0; i < 200; i++) {
    const previous = drawNearbyUntil(rng, (r) => r.meal === '麵');
    const next = draw(附近重抽資料, { target: 500, rng, position: 原點, previous, reroll: 'place' });
    assert.equal(next.meal, '麵');
    assert.notEqual(next.place, previous.place);
    assert.ok(['近A', '近B'].includes(next.place), `抽到 ${next.place}`);
  }
});

test('給定位時重抽「點什麼」：吃什麼與去哪吃不變，點什麼一定換成另一份', () => {
  const rng = seeded(43);
  for (let i = 0; i < 200; i++) {
    const previous = drawNearbyUntil(rng, (r) => r.place === '近A');
    const next = draw(附近重抽資料, { target: 500, rng, position: 原點, previous, reroll: 'items' });
    assert.equal(next.place, '近A');
    assert.notEqual(next.items[0].name, previous.items[0].name);
  }
});

test('不給定位時，同樣的亂數抽出的結果跟給 undefined 完全一樣', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const without = draw(附近資料, { target: 500, rng: seeded(seed) });
    const withUndefined = draw(附近資料, { target: 500, rng: seeded(seed), position: undefined });
    assert.deepEqual(withUndefined, without);
  }
});

// ---- 包含連鎖店與便利商店（沒有座標的去哪吃）----
test('不包含連鎖店時，沒有座標的店不出現；包含時照原本規則', () => {
  assert.deepEqual(
    [...placesSeen(附近資料, { includeChains: false })].sort(),
    ['近麵店', '遠麵店', '遠便當店'].sort(),
  );
  assert.deepEqual([...placesSeen(附近資料, { position: 原點, includeChains: false })], ['近麵店']);
  assert.deepEqual(
    [...placesSeen(附近資料, { includeChains: true })].sort(),
    ['近麵店', '遠麵店', '遠便當店', '麥當勞', '漢堡王'].sort(),
  );
});

test('篩完一個去哪吃都不剩時，回傳 null（沒有符合條件），不報錯、也不退回全部', () => {
  assert.equal(draw(附近資料, { target: 500, rng: seeded(51), position: { lat: 0, lng: 0 }, includeChains: false }), null);
  const onlyFar = { meals: [{ name: '便當', places: [有座標('遠便當店', 5000)] }] };
  assert.equal(draw(onlyFar, { target: 500, rng: seeded(52), position: 原點 }), null);
});

test('不包含連鎖店時重抽（換）：仍只在符合條件的店裡換，且有別的選項就一定換到不同的', () => {
  const rng = seeded(53);
  for (let i = 0; i < 200; i++) {
    const previous = draw(附近重抽資料, { target: 500, rng, position: 原點, includeChains: false });
    assert.equal(previous.meal, '麵');
    const byPlace = draw(附近重抽資料, { target: 500, rng, position: 原點, includeChains: false, previous, reroll: 'place' });
    assert.ok(['近A', '近B'].includes(byPlace.place));
    assert.notEqual(byPlace.place, previous.place);
    // 只剩一個吃什麼可選時，重抽吃什麼維持原樣
    const byMeal = draw(附近重抽資料, { target: 500, rng, position: 原點, includeChains: false, previous, reroll: 'meal' });
    assert.equal(byMeal.meal, '麵');
    assert.ok(['近A', '近B'].includes(byMeal.place));
  }
});

test('抽完後改了設定再重抽：原本的店已不符合條件時，改抽符合條件的店，不報錯', () => {
  const rng = seeded(61);
  for (let i = 0; i < 100; i++) {
    let previous;
    do previous = draw(附近重抽資料, { target: 500, rng, position: 原點 });
    while (previous.meal !== '速食');
    for (const reroll of ['meal', 'place', 'items']) {
      const next = draw(附近重抽資料, { target: 500, rng, position: 原點, includeChains: false, previous, reroll });
      assert.equal(next.meal, '麵');
      assert.ok(['近A', '近B'].includes(next.place), `抽到 ${next.place}`);
    }
  }
});

test('抽完後改了設定、已經沒有符合條件的店時，重抽回傳 null', () => {
  const previous = draw(附近重抽資料, { target: 500, rng: seeded(62), position: 原點 });
  for (const reroll of ['meal', 'place', 'items']) {
    const options = { target: 500, rng: seeded(63), position: { lat: 0, lng: 0 }, includeChains: false, previous, reroll };
    assert.equal(draw(附近重抽資料, options), null);
  }
});

// ---- 行政區篩選 ----
const 新店 = '新北市新店區';
const 中和 = '新北市中和區';
function 區的店(name, district, northMeters) {
  return { ...有座標(name, northMeters), district };
}

const 區資料 = {
  meals: [
    { name: '麵', places: [區的店('新店麵店', 新店, 1000), 區的店('中和麵店', 中和, 9000)] },
    { name: '便當', places: [區的店('中和便當店', 中和, 9500)] },
    { name: '滷味', places: [區的店('新店滷味1', 新店, 1200), 區的店('新店滷味2', 新店, 1300)] },
    { name: '速食', places: [{ name: '麥當勞' }] },
  ],
};

test('選一個行政區：只抽到該區的店（連鎖店照「包含連鎖店」參加）', () => {
  assert.deepEqual(
    [...placesSeen(區資料, { districts: [新店] })].sort(),
    ['新店麵店', '新店滷味1', '新店滷味2', '麥當勞'].sort(),
  );
  assert.deepEqual(
    [...placesSeen(區資料, { districts: [中和] })].sort(),
    ['中和麵店', '中和便當店', '麥當勞'].sort(),
  );
});

test('選多個行政區：兩區的店都參加；一個都不選＝不限', () => {
  assert.equal(placesSeen(區資料, { districts: [新店, 中和] }).size, 6);
  assert.equal(placesSeen(區資料, { districts: [] }).size, 6);
});

test('選了行政區就不看定位：定位在很遠的地方，仍抽得到選定區的店', () => {
  const seen = placesSeen(區資料, { districts: [新店], position: { lat: 0, lng: 0 } });
  assert.deepEqual([...seen].sort(), ['新店麵店', '新店滷味1', '新店滷味2', '麥當勞'].sort());
});

test('選了行政區、不包含連鎖店：只剩該區的店', () => {
  assert.deepEqual(
    [...placesSeen(區資料, { districts: [新店], includeChains: false })].sort(),
    ['新店麵店', '新店滷味1', '新店滷味2'].sort(),
  );
});

test('選了行政區：該區沒有店的吃什麼不參加，其餘吃什麼仍等機率', () => {
  const rng = seeded(71);
  const counts = { 麵: 0, 便當: 0, 滷味: 0, 速食: 0 };
  const N = 9000;
  for (let i = 0; i < N; i++) counts[draw(區資料, { target: 500, rng, districts: [新店] }).meal]++;
  assert.equal(counts.便當, 0);
  for (const name of ['麵', '滷味', '速食']) assert.ok(Math.abs(counts[name] / N - 1 / 3) < 0.03, `${name} 佔 ${counts[name] / N}`);
});

test('選了資料裡沒有店的行政區、又不包含連鎖店：回傳 null', () => {
  assert.equal(draw(區資料, { target: 500, rng: seeded(72), districts: ['台北市北投區'], includeChains: false }), null);
});

test('選了行政區時重抽（換）：仍只在該區的店裡換，有別的選項就一定換到不同的', () => {
  const rng = seeded(73);
  for (let i = 0; i < 200; i++) {
    const options = { target: 500, rng, districts: [新店], includeChains: false };
    const previous = draw(區資料, { ...options, previous: undefined });
    for (const reroll of ['meal', 'place']) {
      const next = draw(區資料, { ...options, previous, reroll });
      assert.ok(['新店麵店', '新店滷味1', '新店滷味2'].includes(next.place), `抽到 ${next.place}`);
      if (reroll === 'meal') assert.notEqual(next.meal, previous.meal);
    }
    if (previous.meal === '滷味') {
      assert.notEqual(draw(區資料, { ...options, previous, reroll: 'place' }).place, previous.place);
    }
  }
});

test('列出行政區：只列資料裡實際有店的區，不重複，沒有行政區的店不算', () => {
  assert.deepEqual(listDistricts(區資料), [新店, 中和]);
  assert.deepEqual(listDistricts({ meals: [{ name: '速食', places: [{ name: '麥當勞' }] }] }), []);
});

test('行政區的顯示名稱只留區名，不帶縣市', () => {
  assert.equal(districtLabel('新北市新店區'), '新店區');
  assert.equal(districtLabel('台北市北投區'), '北投區');
  assert.equal(districtLabel('新竹縣竹北市'), '竹北市');
});

test('抽完後改了行政區再重抽（換）：只在新選的區裡換，原本的店不在新區時改抽新區的店', () => {
  const rng = seeded(74);
  const inZhonghe = ['中和麵店', '中和便當店'];
  for (let i = 0; i < 200; i++) {
    const previous = draw(區資料, { target: 500, rng, districts: [新店], includeChains: false });
    for (const reroll of ['meal', 'place', 'items']) {
      const next = draw(區資料, { target: 500, rng, districts: [中和], includeChains: false, previous, reroll });
      assert.ok(inZhonghe.includes(next.place), `抽到 ${next.place}`);
    }
  }
});

// ---- 營業時間 ----
// hours：星期日(0)到星期六(6)各一組營業時段，每段 "HH:MM-HH:MM"，空陣列＝整天休息；結束時間可超過 24:00 表示跨午夜
const 每天 = (...sessions) => Array.from({ length: 7 }, () => sessions);
// 2026-11-12 是星期四；2026-11-10 是星期二
const 週四 = (h, m) => new Date(2026, 10, 12, h, m);
const 週二 = (h, m) => new Date(2026, 10, 10, h, m);
function 營業店(hours) {
  return { meals: [{ name: '麵', places: [{ ...有座標('兩段店', 1000), hours }, { name: '品牌' }] }] };
}
const 兩段 = 每天('11:00-13:55', '16:30-20:50');
// 只看那家店（不含品牌）在 now 時間的抽籤結果
const 抽營業店 = (hours, now, seed = 80) => draw(營業店(hours), { target: 500, rng: seeded(seed), now, includeChains: false });

test('營業中的店參加抽籤，結果標明「營業中」與打烊時間', () => {
  const result = 抽營業店(兩段, 週四(11, 30), 81);
  assert.equal(result.place, '兩段店');
  assert.deepEqual(result.availability, { state: 'open', time: '13:55' });
  assert.equal(抽營業店(兩段, 週四(18, 0), 81).availability.time, '20:50');
});

test('兩段店中間休息時是「快開」，結果標明下一場開門時間', () => {
  const result = 抽營業店(兩段, 週四(15, 30), 82);
  assert.deepEqual(result.availability, { state: 'soon', time: '16:30' });
});

test('單段店還沒到營業時間、最後一段已打烊，都不參加', () => {
  const 單段 = 每天('16:30-20:50');
  assert.equal(抽營業店(單段, 週四(15, 30), 83), null);
  assert.equal(抽營業店(兩段, 週四(21, 0), 83), null);
});

test('今天公休的店不參加，即使其他天有營業', () => {
  const hours = 兩段.map((day, i) => (i === 2 ? [] : day));
  assert.equal(抽營業店(hours, 週二(12, 0), 84), null);
  assert.equal(抽營業店(hours, 週四(12, 0), 84).place, '兩段店');
});

test('開門時間算營業中，打烊時間整點起算已打烊', () => {
  const 單段 = 每天('16:30-20:50');
  assert.equal(抽營業店(單段, 週四(16, 30), 85).availability.state, 'open');
  assert.equal(抽營業店(單段, 週四(20, 49), 85).availability.state, 'open');
  assert.equal(抽營業店(單段, 週四(20, 50), 85), null);
});

test('跨午夜的營業時段：開門當天晚上與隔天凌晨都算營業中，打烊時間顯示當天時鐘', () => {
  const hours = 每天('18:00-26:00'); // 到隔天凌晨 2 點
  const evening = 抽營業店(hours, 週四(23, 0), 86);
  assert.deepEqual(evening.availability, { state: 'open', time: '02:00' });
  const lateNight = 抽營業店(hours, new Date(2026, 10, 13, 1, 0), 86);
  assert.deepEqual(lateNight.availability, { state: 'open', time: '02:00' });
  assert.equal(抽營業店(hours, new Date(2026, 10, 13, 2, 0), 86), null);
});

test('沒有跨午夜的時段時，凌晨不會被誤認營業中，單段店也不算快開', () => {
  const hours = 每天('18:00-20:00');
  assert.equal(抽營業店(hours, 週四(1, 0), 87), null);
});

test('沒有營業時間的去哪吃（品牌、便利商店）一律參加，結果沒有營業狀態', () => {
  const seen = placesSeen(營業店(每天()), { now: 週四(3, 0) }, 60);
  assert.deepEqual([...seen], ['品牌']);
  const result = draw({ meals: [{ name: '麵', places: [{ name: '品牌' }] }] }, { target: 500, rng: seeded(88), now: 週四(3, 0) });
  assert.equal(result.availability, undefined);
});

test('沒營業的吃什麼不參加，其餘吃什麼仍等機率', () => {
  const data = {
    meals: [
      { name: 'A', places: [{ name: 'A店', hours: 每天('08:00-10:00') }] },
      { name: 'B', places: [{ name: 'B店', hours: 每天('11:00-14:00') }, { name: 'B店2', hours: 每天('11:00-14:00') }] },
      { name: 'C', places: [{ name: 'C品牌' }] },
    ],
  };
  const rng = seeded(89);
  const counts = { A: 0, B: 0, C: 0 };
  const N = 6000;
  for (let i = 0; i < N; i++) counts[draw(data, { target: 500, rng, now: 週四(12, 0) }).meal]++;
  assert.equal(counts.A, 0);
  for (const name of ['B', 'C']) assert.ok(Math.abs(counts[name] / N - 0.5) < 0.03, `${name} 佔 ${counts[name] / N}`);
});

test('營業時間與行政區、定位篩選一起生效', () => {
  const data = {
    meals: [
      {
        name: '麵',
        places: [
          { ...區的店('開著的新店店', 新店, 1000), hours: 每天('09:00-22:00') },
          { ...區的店('關著的新店店', 新店, 1100), hours: 每天('05:00-07:00') },
          { ...區的店('開著的中和店', 中和, 9000), hours: 每天('09:00-22:00') },
        ],
      },
    ],
  };
  assert.deepEqual([...placesSeen(data, { now: 週四(12, 0), districts: [新店] }, 100)], ['開著的新店店']);
  assert.deepEqual([...placesSeen(data, { now: 週四(12, 0), position: 原點 }, 100)], ['開著的新店店']);
});

test('重抽（換）也依 now 篩選：只換到營業中或快開的店，原本的店已打烊時改抽別家', () => {
  const data = {
    meals: [
      {
        name: '麵',
        places: [
          { name: '甲', hours: 每天('09:00-22:00') },
          { name: '乙', hours: 每天('09:00-22:00') },
          { name: '丙', hours: 每天('05:00-07:00') },
        ],
      },
    ],
  };
  const rng = seeded(90);
  for (let i = 0; i < 100; i++) {
    const previous = draw(data, { target: 500, rng, now: 週四(12, 0) });
    const next = draw(data, { target: 500, rng, now: 週四(12, 0), previous, reroll: 'place' });
    assert.ok(['甲', '乙'].includes(next.place));
    assert.notEqual(next.place, previous.place);
    assert.equal(next.availability.state, 'open');
    const afterClose = draw(data, { target: 500, rng, now: 週四(23, 0), previous: { meal: '麵', place: '甲', items: [] }, reroll: 'items' });
    assert.equal(afterClose, null);
  }
});

test('不給 now 時使用現在時間，不報錯', () => {
  const result = draw(營業店(每天('00:00-30:00')), { target: 500, rng: seeded(91), includeChains: false });
  assert.equal(result.availability.state, 'open');
});

// 真實資料：彈芽麵週二休、週五只有晚上 16:30–20:50（Maps 的 04:30 是輸入錯誤）
test('彈芽麵（真實資料）：週二休息、週五中午不營業、週五 17:00 營業中', () => {
  const data = JSON.parse(readFileSync(new URL('../data/meals.json', import.meta.url), 'utf8'));
  const 只有彈芽麵 = { meals: [{ name: '麵', places: data.meals.flatMap((m) => m.places).filter((p) => p.name === '彈芽麵') }] };
  const at = (now) => draw(只有彈芽麵, { target: 500, rng: seeded(92), now, includeChains: false });
  assert.equal(at(週二(12, 0)), null);
  assert.equal(at(new Date(2026, 10, 13, 12, 0)), null);
  assert.deepEqual(at(new Date(2026, 10, 13, 17, 0)).availability, { state: 'open', time: '20:50' });
  assert.deepEqual(at(週四(15, 30)).availability, { state: 'soon', time: '16:30' });
});
