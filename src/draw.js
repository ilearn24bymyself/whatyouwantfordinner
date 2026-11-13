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
// 連鎖店／品牌：沒座標也沒行政區（不受距離限制）；有行政區但沒座標的是一般店
const isChain = (place) => !hasCoordinates(place) && !place.district;

// ---- 營業時間 ----
// hours：星期日(0)到星期六(6)各一組營業時段，每段 "HH:MM-HH:MM"（結束時間可超過 24:00 表示跨午夜），空陣列＝整天休息。
const MINUTES_PER_DAY = 1440;

function parseSessions(sessions = []) {
  return sessions.map((text) => {
    const [from, to] = text.split('-').map((t) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    });
    return { from, to };
  });
}

function minutesToClock(minutes) {
  const inDay = minutes % MINUTES_PER_DAY;
  return `${String(Math.floor(inDay / 60)).padStart(2, '0')}:${String(inDay % 60).padStart(2, '0')}`;
}

// 今天還沒開始的下一段（開門最早的那一段），沒有就是 undefined
function nextSession(sessions, minute) {
  return sessions.filter((s) => s.from > minute).sort((a, b) => a.from - b.from)[0];
}

// 現在這個時間，店的營業狀態：
// { state: 'open', time: 打烊時間 } 營業中；{ state: 'soon', time: 下一場開門時間 } 快開（今天已有一段結束、後面還有下一段）；
// null 不參加（還沒到開門時間的單段店、已打烊、公休）。開門時間算營業中，打烊那一分鐘起算已打烊。
function availabilityAt(hours, now) {
  const day = now.getDay();
  const minute = now.getHours() * 60 + now.getMinutes();
  const today = parseSessions(hours[day]);
  const yesterday = parseSessions(hours[(day + 6) % 7]);
  // 前一天跨午夜的時段，延伸到今天凌晨
  const spill = yesterday.find((s) => s.to > MINUTES_PER_DAY && minute < s.to - MINUTES_PER_DAY);
  if (spill) return { state: 'open', time: minutesToClock(spill.to) };
  const current = today.find((s) => s.from <= minute && minute < s.to);
  if (current) return { state: 'open', time: minutesToClock(current.to) };
  // 快開：今天已經有一段營業結束（中間休息），後面還有下一段；單段店還沒到開門時間不算
  const ended = today.some((s) => s.to <= minute);
  const later = nextSession(today, minute);
  return ended && later ? { state: 'soon', time: minutesToClock(later.from) } : null;
}

// 哪些去哪吃參加抽籤：
// - 連鎖（沒座標也沒行政區，不受距離限制，例如連鎖店、便利商店）：includeChains 開著才參加
// - 一般店，選了行政區：只留選定行政區的店，不看定位（有沒有座標都一樣）
// - 一般店，沒選行政區：不給定位就都參加；給了定位只留附近的（只抽附近），沒座標的店算不出距離，不參加
// 有營業時間的店，只有營業中或快開的才參加；沒有營業時間的（品牌、便利商店）視為隨時營業。
// 沒有任何去哪吃的吃什麼不參加；全部都不剩時回傳空陣列（呼叫端顯示「沒有符合條件」，不退回全部）。
function eligibleMeals(meals, { position, includeChains, districts, now }) {
  const wanted = (place) => {
    if (place.hours && !place.availability) return false; // 沒營業也不快開
    if (isChain(place)) return includeChains;
    if (districts.length > 0) return districts.includes(place.district);
    // 有行政區但沒座標：算不出距離，所以只抽附近（有定位）時不參加
    if (!hasCoordinates(place)) return !position;
    return !position || distanceMeters(position, place) <= NEARBY_RADIUS_M;
  };
  return meals
    // 營業狀態只算一次，抽中後直接沿用（沒有營業時間的店沒有此欄）
    .map((meal) => ({
      ...meal,
      places: meal.places
        .map((place) => (place.hours ? { ...place, availability: availabilityAt(place.hours, now) } : place))
        .filter(wanted),
    }))
    .filter((meal) => meal.places.length > 0);
}

// 有別的選項時避開 avoidName（重抽一定看得到變化）；只剩它一個就照抽
function pickOther(list, rng, avoidName) {
  const others = list.filter((x) => x.name !== avoidName);
  return pick(others.length ? others : list, rng);
}

// 可以重抽的層，由上到下：區、吃什麼、去哪吃、點什麼（index.html 的 data-reroll 也用這幾個）
export const LAYERS = ['district', 'meal', 'place', 'items'];

// 沒有行政區的店（連鎖店、便利商店）歸在「不限地點」這一區
export const CHAIN_DISTRICT_KEY = 'chains';
export const CHAIN_DISTRICT_LABEL = '不限地點';

// 把符合條件的店依區分組：[{ key, label, count, meals: [{ name, places }] }]，依資料出現順序
function groupByDistrict(meals) {
  const groups = new Map();
  for (const meal of meals) {
    for (const place of meal.places) {
      const key = place.district ?? CHAIN_DISTRICT_KEY;
      if (!groups.has(key)) {
        groups.set(key, { key, label: key === CHAIN_DISTRICT_KEY ? CHAIN_DISTRICT_LABEL : districtLabel(key), count: 0, meals: [] });
      }
      const group = groups.get(key);
      let entry = group.meals.find((m) => m.name === meal.name);
      if (!entry) group.meals.push((entry = { name: meal.name, places: [] }));
      entry.places.push(place);
      group.count++;
    }
  }
  return [...groups.values()];
}

// 依店數加權抽一個區；有別的區就避開 avoidKey（重抽一定看得到變化）
function pickDistrict(groups, rng, avoidKey) {
  const others = groups.filter((g) => g.key !== avoidKey);
  const pool = others.length ? others : groups;
  let r = rng() * pool.reduce((sum, g) => sum + g.count, 0);
  for (const group of pool) {
    r -= group.count;
    if (r < 0) return group;
  }
  return pool[pool.length - 1];
}

// reroll：要重抽哪一層，該層以下跟著重抽，以上保留 previous（上一次的抽籤結果）。
// 沒給 previous = 全抽（一次抽完）。position 是定位 { lat, lng }，給了就只抽附近；
// includeChains 預設是，關掉就排除連鎖店；districts 是選定的行政區（空＝不限，見 eligibleMeals）；
// now 是現在時間（Date，預設當下），只有營業中或快開的店參加；結果的 availability 說明營業狀態（沒有營業時間的店沒有此欄）。
// 抽法：先照所有篩選算出符合條件的店，再依區分組、依店數加權抽一個區；區裡的吃什麼等機率、再等機率抽店。
// 篩完一個去哪吃都不剩時回傳 null（沒有符合條件）。
export function draw(
  data,
  { target, rng = Math.random, previous, reroll = 'district', position, includeChains = true, districts = [], now = new Date() },
) {
  const level = LAYERS.indexOf(reroll);
  if (level < 0) throw new Error(`不認得的重抽層：${reroll}`);
  const keep = (layer) => Boolean(previous) && LAYERS.indexOf(layer) < level;
  // 正好是要重抽的那一層：避開上一次的結果
  const previousName = { district: previous?.districtKey, meal: previous?.meal, place: previous?.place, items: previous?.items?.[0]?.name };
  const avoid = (layer) => (layer === reroll ? previousName[layer] : undefined);
  const meals = eligibleMeals(data.meals, { position, includeChains, districts, now });
  if (meals.length === 0) return null;
  const groups = groupByDistrict(meals);

  // 保留的層照名字找回來；找不到（例如改了篩選、資料檔改過）就當作重抽
  const group = (keep('district') && groups.find((g) => g.key === previous.districtKey)) || pickDistrict(groups, rng, avoid('district'));
  const meal = (keep('meal') && group.meals.find((m) => m.name === previous.meal)) || pickOther(group.meals, rng, avoid('meal'));
  const place =
    (keep('place') && meal.places.find((p) => p.name === previous.place)) || pickOther(meal.places, rng, avoid('place'));
  const base = { district: group.label, districtKey: group.key, meal: meal.name, place: place.name };

  // 沒有點什麼資料的去哪吃（例如便利商店、家裡煮）：不回傳點什麼，也不做熱量判定
  const { availability } = place;
  if (!place.items?.length) {
    return { ...base, items: [], target, availability };
  }

  const item = pickOther(place.items, rng, avoid('items'));
  const items = [{ name: item.name, unit: item.unit, kcal: item.kcal, count: 1 }];
  const totalKcal = item.kcal;
  const range = toleranceRange(target);
  return {
    ...base,
    items,
    totalKcal,
    target,
    range,
    diff: totalKcal - target,
    status: kcalStatus(totalKcal, range),
    availability,
  };
}

// 資料裡實際有店的行政區（資料存縣市加區，例如「新北市新店區」），依出現順序、不重複
export function listDistricts(data) {
  const districts = data.meals.flatMap((meal) => meal.places.map((place) => place.district)).filter(Boolean);
  return [...new Set(districts)];
}

// 畫面只顯示區名：「新北市新店區」→「新店區」
export function districtLabel(district) {
  return district.replace(/^.+?[市縣]/, '');
}

// 店家清單的營業狀態：open 營業中、later 現在沒營業但今天後面還有一段（含單段店還沒開門）、
// done 今天已打烊、rest 今天公休。later 不等於抽籤的「快開」（soon）：清單是給人看全貌，所以單段店還沒開也標開門時間。
function listAvailability(hours, now) {
  const current = availabilityAt(hours, now);
  if (current?.state === 'open') return current;
  const sessions = parseSessions(hours[now.getDay()]);
  const minute = now.getHours() * 60 + now.getMinutes();
  const later = nextSession(sessions, minute);
  if (later) return { state: 'later', time: minutesToClock(later.from) };
  return { state: sessions.length ? 'done' : 'rest' };
}

const CHAIN_GROUP_LABEL = '連鎖店與便利商店';
const CHAIN_GROUP_KEY = 'chains';

// 檢視資料庫：全部的店（不受任何篩選影響），先依行政區分組（照資料出現順序），沒有行政區的連鎖店與便利商店放最後；
// 組內依吃什麼分類；每家店帶營業狀態（沒有營業時間的店沒有此欄）。
export function listPlaces(data, { now = new Date() } = {}) {
  const groups = new Map();
  for (const meal of data.meals) {
    for (const place of meal.places) {
      const key = place.district ?? null;
      if (!groups.has(key)) {
        groups.set(key, { key: key ?? CHAIN_GROUP_KEY, district: key, label: key ? districtLabel(key) : CHAIN_GROUP_LABEL, count: 0, meals: [] });
      }
      const group = groups.get(key);
      let entry = group.meals.find((m) => m.name === meal.name);
      if (!entry) group.meals.push((entry = { name: meal.name, places: [] }));
      const availability = place.hours ? listAvailability(place.hours, now) : undefined;
      const row = { name: place.name };
      if (place.address) row.address = place.address;
      if (availability) row.availability = availability;
      entry.places.push(row);
      group.count++;
    }
  }
  const all = [...groups.values()];
  return [...all.filter((g) => g.district), ...all.filter((g) => !g.district)];
}

// 店家清單的標籤：只留 keys 選到的組（key 是行政區全名，連鎖店組是 'chains'），維持原順序；都不選就不列任何組。
export function selectGroups(groups, keys) {
  return groups.filter((group) => keys.includes(group.key));
}
