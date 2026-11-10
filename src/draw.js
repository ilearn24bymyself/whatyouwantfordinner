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

export function draw(data, { target, rng = Math.random }) {
  const meal = pick(data.meals, rng);
  const place = pick(meal.places, rng);
  const item = pick(place.items, rng);
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
