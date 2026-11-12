// 抽籤：唯一的測試切面。
// 用詞對照（見 CONTEXT.md）：meals = 吃什麼、places = 去哪吃、items = 點什麼
// mode: 'single' = 單選一份（自選組合在第 02 張票加入）

// 容許範圍：熱量目標上下 20%
const TOLERANCE = 0.2;

function pick(list, rng) {
  return list[Math.floor(rng() * list.length)];
}

function toleranceRange(target) {
  return {
    min: Math.round(target * (1 - TOLERANCE)),
    max: Math.round(target * (1 + TOLERANCE)),
  };
}

// 回傳 'within' | 'over' | 'under'
function kcalStatus(totalKcal, range) {
  if (totalKcal > range.max) return 'over';
  if (totalKcal < range.min) return 'under';
  return 'within';
}

// 有別的選項時避開 avoidName（重抽一定看得到變化）；只剩它一個就照抽
function pickOther(list, rng, avoidName) {
  const others = list.filter((x) => x.name !== avoidName);
  return pick(others.length ? others : list, rng);
}

// 可以重抽的層，由上到下：吃什麼、去哪吃、點什麼（index.html 的 data-reroll 也用這三個）
export const LAYERS = ['meal', 'place', 'items'];

// reroll：要重抽哪一層，該層以下跟著重抽，以上保留 previous（上一次的抽籤結果）。
// 沒給 previous = 三層全抽（一次抽完）。
export function draw(data, { target, rng = Math.random, previous, reroll = 'meal' }) {
  const level = LAYERS.indexOf(reroll);
  if (level < 0) throw new Error(`不認得的重抽層：${reroll}`);
  const keep = (layer) => Boolean(previous) && LAYERS.indexOf(layer) < level;
  // 正好是要重抽的那一層：避開上一次的結果
  const previousName = { meal: previous?.meal, place: previous?.place, items: previous?.items?.[0]?.name };
  const avoid = (layer) => (layer === reroll ? previousName[layer] : undefined);

  // 保留的層照名字找回來；找不到（例如資料檔改過）就當作重抽
  const meal = (keep('meal') && data.meals.find((m) => m.name === previous.meal)) || pickOther(data.meals, rng, avoid('meal'));
  const place =
    (keep('place') && meal.places.find((p) => p.name === previous.place)) || pickOther(meal.places, rng, avoid('place'));

  // 沒有點什麼資料的去哪吃（例如便利商店、家裡煮）：只回傳兩層，不做熱量判定
  if (!place.items?.length) {
    return { meal: meal.name, place: place.name, items: [], target };
  }

  const item = pickOther(place.items, rng, avoid('items'));
  const items = [{ name: item.name, unit: item.unit, kcal: item.kcal, count: 1 }];
  const totalKcal = item.kcal;
  const range = toleranceRange(target);
  return {
    meal: meal.name,
    place: place.name,
    items,
    totalKcal,
    target,
    range,
    diff: totalKcal - target,
    status: kcalStatus(totalKcal, range),
  };
}
