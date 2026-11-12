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

// 附近：以定位為圓心、半徑 3 公里（直線距離）以內
const NEARBY_RADIUS_M = 3000;
const EARTH_RADIUS_M = 6371000;

// 兩個座標的直線距離（公尺），球面公式
function distanceMeters(a, b) {
  const rad = (deg) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

const hasCoordinates = (place) => Number.isFinite(place.lat) && Number.isFinite(place.lng);

// 只抽附近：留下附近的去哪吃與不受距離限制（沒有座標）的去哪吃；沒有任何去哪吃的吃什麼不參加。
// 不給定位，或篩完什麼都不剩（資料裡沒有不受距離限制的店、附近又沒店）時，退回全部。
function eligibleMeals(meals, position) {
  if (!position) return meals;
  const nearby = (place) => !hasCoordinates(place) || distanceMeters(position, place) <= NEARBY_RADIUS_M;
  const pool = meals
    .map((meal) => ({ ...meal, places: meal.places.filter(nearby) }))
    .filter((meal) => meal.places.length > 0);
  return pool.length > 0 ? pool : meals;
}

// 有別的選項時避開 avoidName（重抽一定看得到變化）；只剩它一個就照抽
function pickOther(list, rng, avoidName) {
  const others = list.filter((x) => x.name !== avoidName);
  return pick(others.length ? others : list, rng);
}

// 可以重抽的層，由上到下：吃什麼、去哪吃、點什麼（index.html 的 data-reroll 也用這三個）
export const LAYERS = ['meal', 'place', 'items'];

// reroll：要重抽哪一層，該層以下跟著重抽，以上保留 previous（上一次的抽籤結果）。
// 沒給 previous = 三層全抽（一次抽完）。position 是定位 { lat, lng }，給了就只抽附近（見 eligibleMeals）。
export function draw(data, { target, rng = Math.random, previous, reroll = 'meal', position }) {
  const level = LAYERS.indexOf(reroll);
  if (level < 0) throw new Error(`不認得的重抽層：${reroll}`);
  const keep = (layer) => Boolean(previous) && LAYERS.indexOf(layer) < level;
  // 正好是要重抽的那一層：避開上一次的結果
  const previousName = { meal: previous?.meal, place: previous?.place, items: previous?.items?.[0]?.name };
  const avoid = (layer) => (layer === reroll ? previousName[layer] : undefined);
  const meals = eligibleMeals(data.meals, position);

  // 保留的層照名字找回來；找不到（例如資料檔改過）就當作重抽
  const meal = (keep('meal') && meals.find((m) => m.name === previous.meal)) || pickOther(meals, rng, avoid('meal'));
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
