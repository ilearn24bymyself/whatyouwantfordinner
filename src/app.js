// 畫面：讀資料檔、呼叫抽籤、顯示結果。抽籤規則全部在 draw.js。
import { draw, listDistricts, districtLabel, listPlaces, selectGroups, candidateFaces } from './draw.js';
import { parseSettings } from './settings.js';
import { flickerDelays, firstAnimatedLayer } from './flicker.js';
import { visibleLayers, revealedAfterReroll, ALL } from './reveal.js';

const TARGET = 500; // 熱量目標；第 05 張票改成可設定

const $ = (id) => document.getElementById(id);

// 設定檔 data/settings.json 的招牌與結果提示（讀不到就不顯示）
let settings = parseSettings();

// 依抽籤回傳的 status 決定提示文字
const verdictByStatus = {
  within: () => '在容許範圍內，照著點就對了 👍',
  over: (result) => `目標 ${result.target}，這餐約 ${result.totalKcal} 卡，超標 ${result.diff}，要有覺悟 ⚠️`,
  under: (result) => `比目標少 ${-result.diff} 卡，可能會餓 🍃`,
};

function formatDiff(diff) {
  return diff > 0 ? `+${diff}` : String(diff);
}

function renderItems(result) {
  $('items').replaceChildren(
    ...result.items.map((item) => {
      const row = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = item.count > 1 ? `${item.name} ×${item.count}` : item.name;
      const kcal = document.createElement('span');
      kcal.className = 'kcal-each';
      kcal.textContent = `${item.kcal * item.count} 卡`;
      row.append(name, kcal);
      return row;
    }),
  );
}

function renderSummary(result) {
  $('total').textContent = result.totalKcal;
  $('target').textContent = result.target;
  $('diff').textContent = formatDiff(result.diff);
  $('verdict').textContent = verdictByStatus[result.status](result);
  $('summary').dataset.status = result.status;
}

// 營業狀態文字：營業中顯示打烊時間，快開顯示下一場開門時間；沒有營業時間的店不顯示
const availabilityText = {
  open: (time) => `營業中，${time} 打烊`,
  soon: (time) => `現在沒營業，${time} 開始`,
};

function renderAvailability(availability) {
  const el = $('availability');
  el.hidden = !availability;
  el.textContent = availability ? availabilityText[availability.state](availability.time) : '';
  el.dataset.state = availability?.state ?? '';
}

// 店家清單裡的營業狀態文字（done / rest 只有清單用得到）
const listAvailabilityText = {
  open: availabilityText.open,
  later: availabilityText.soon, // 文字相同；狀態名不同見 draw.js 的 listAvailability
  done: () => '今天已打烊',
  rest: () => '今天公休',
};

// 店家清單（口袋名單檢視，與抽籤無關）：第一眼是一排行政區標籤（標家數，連鎖店在最後），點了才列那一區的店。
// 標籤在清單內獨立運作，不影響首頁的抽籤條件。店的營業狀態每次展開或點標籤時，用當下時間重畫。
function setupPlaceList(data) {
  const details = $('placeList');
  details.hidden = false;
  const selectedKeys = () => [...document.querySelectorAll('#placeChips input:checked')].map((input) => input.value);

  const renderBody = () => {
    const groups = listPlaces(data, { now: nowFromUrl() ?? new Date() });
    const chosen = selectGroups(groups, selectedKeys());
    $('placeListHint').hidden = chosen.length > 0;
    $('placeListBody').replaceChildren(...chosen.map(renderGroup));
  };

  // 標籤只建一次（資料不會變）
  $('placeChips').replaceChildren(
    ...listPlaces(data).map((group) => {
      const label = document.createElement('label');
      label.className = 'chip';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = group.key;
      input.autocomplete = 'off';
      input.addEventListener('change', renderBody);
      const text = document.createElement('span');
      text.textContent = `${group.label} ${group.count}`;
      label.append(input, text);
      return label;
    }),
  );
  details.addEventListener('toggle', () => {
    if (details.open) renderBody();
  });
}

function renderGroup(group) {
  const section = document.createElement('section');
  const heading = document.createElement('h2');
  heading.textContent = `${group.label}（${group.count} 家）`;
  section.append(heading);
  for (const meal of group.meals) {
    const title = document.createElement('h3');
    title.textContent = meal.name;
    const list = document.createElement('ul');
    for (const place of meal.places) {
      const row = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = place.name;
      row.append(name);
      if (place.address) {
        const address = document.createElement('small');
        address.className = 'place-address';
        address.textContent = place.address;
        row.append(address);
      }
      if (place.availability) {
        const status = document.createElement('small');
        status.className = 'availability-inline';
        status.dataset.state = place.availability.state;
        status.textContent = listAvailabilityText[place.availability.state](place.availability.time);
        row.append(status);
      }
      list.append(row);
    }
    section.append(title, list);
  }
  return section;
}

// revealed：揭曉到第幾層（一次抽完 = ALL）。沒有點什麼資料的去哪吃只有兩層，見 reveal.js
function render(result, revealed) {
  const visible = visibleLayers(result, revealed);
  $('district').textContent = result.district;
  $('meal').textContent = result.meal;
  $('place').textContent = result.place;
  renderAvailability(result.availability);
  $('districtLayer').hidden = !visible.district;
  $('mealLayer').hidden = !visible.meal;
  $('placeLayer').hidden = !visible.place;
  $('itemsLayer').hidden = !visible.items;
  $('summary').hidden = !visible.items;
  if (visible.items) {
    renderItems(result);
    renderSummary(result);
  }
  $('next').hidden = visible.done;
  $('afterText').textContent = settings.after;
  $('afterText').hidden = !(visible.done && settings.after); // 結果提示：整個結果揭曉完才出現

  $('result').hidden = false;
}

// 瀏覽器自己的逾時（定位已允許後最久等多久）與外層保底（含使用者還沒回應詢問視窗的時間，避免永遠卡住）
const LOCATION_TIMEOUT_MS = 10000;
const LOCATION_GIVE_UP_MS = 15000;
const HINT_LOCATING = '定位中…';
const HINT_FAILED = '抓不到位置，改從全部店抽';

const setHint = (text) => {
  $('locationHint').textContent = text;
};

const selectedDistricts = () => [...document.querySelectorAll('#districtChips input:checked')].map((input) => input.value);

// 行政區標籤：資料裡有店的區，可複選；選了任何一區，「只抽附近」就不套用（開關變灰）
function setupDistrictChips(data) {
  const districts = listDistricts(data);
  $('districtBox').hidden = districts.length === 0;
  // 選了任何行政區：「只抽附近」變灰並註明原因，舊的定位提示也不再適用
  const syncNearbyToggle = () => {
    const hasDistricts = selectedDistricts().length > 0;
    $('nearby').disabled = hasDistricts;
    $('nearbyLabel').classList.toggle('disabled', hasDistricts);
    $('nearbyNote').textContent = hasDistricts ? '已選行政區' : '';
    if (hasDistricts) setHint('');
  };
  $('districtChips').replaceChildren(
    ...districts.map((district) => {
      const label = document.createElement('label');
      label.className = 'chip';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = district;
      input.autocomplete = 'off';
      input.addEventListener('change', syncNearbyToggle);
      const text = document.createElement('span');
      text.textContent = districtLabel(district);
      label.append(input, text);
      return label;
    }),
  );
  syncNearbyToggle();
}

// 測試用：網址 ?lat=…&lng=… 指定假座標（畫面上沒有入口）
function positionFromUrl() {
  const params = new URLSearchParams(location.search);
  const lat = parseFloat(params.get('lat'));
  const lng = parseFloat(params.get('lng'));
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined;
}

// 測試用：網址 ?now=2026-11-12T15:30 假裝現在的時間（畫面上沒有入口）；沒給或格式不對就用真實時間
function nowFromUrl() {
  const value = new URLSearchParams(location.search).get('now');
  const fake = value ? new Date(value) : undefined;
  return fake && !Number.isNaN(fake.getTime()) ? fake : undefined;
}

// 向手機要目前位置；拒絕、逾時、不支援、出錯都回 undefined（呼叫端會改從全部店抽）
function requestLocation() {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), LOCATION_GIVE_UP_MS);
    const finish = (position) => {
      clearTimeout(timer);
      resolve(position);
    };
    try {
      if (!navigator.geolocation) return finish(undefined);
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => finish({ lat: coords.latitude, lng: coords.longitude }),
        () => finish(undefined),
        { timeout: LOCATION_TIMEOUT_MS },
      );
    } catch {
      finish(undefined);
    }
  });
}

// 這次抽籤要用的定位：開關關閉 → 不抽附近（也不詢問）；網址有假座標 → 用假座標；其餘向手機要。
// 等待時顯示「定位中…」；抓不到時顯示提示並回傳 undefined（= 從全部店抽）。
async function locateForDraw() {
  setHint('');
  if (selectedDistricts().length > 0 || !$('nearby').checked) return undefined;
  const fake = positionFromUrl();
  if (fake) return fake;
  setHint(HINT_LOCATING);
  const found = await requestLocation();
  // 等待定位時使用者改選了行政區：以行政區為準，不顯示定位提示
  if (selectedDistricts().length > 0) {
    setHint('');
    return undefined;
  }
  setHint(found ? '' : HINT_FAILED);
  return found;
}

async function main() {
  let data;
  try {
    const res = await fetch('data/meals.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    $('error').textContent = `讀不到資料檔：${err.message}`;
    $('error').hidden = false;
    $('drawAll').disabled = true;
    $('drawStep').disabled = true;
    return;
  }

  try {
    const res = await fetch('data/settings.json', { cache: 'no-store' });
    if (res.ok) settings = parseSettings(await res.json());
  } catch {
    // 設定檔讀不到或壞掉：不顯示招牌與提示
  }
  $('sign').textContent = settings.sign;
  $('sign').hidden = !settings.sign;

  setupDistrictChips(data);

  setupPlaceList(data);
  // 管理名單的入口只在自己電腦（本機網址）出現，上線的網頁看不到
  $('adminLinkBox').hidden = !['127.0.0.1', 'localhost'].includes(location.hostname);

  // 定位在按下抽籤時才取得；「換」沿用最近一次抽籤的定位，不重新詢問，但開關關閉時從全部店換
  let position;
  let locating = false;
  let current;
  let revealed;
  let stepByStep = false;
  // ---- 大字跳動：區、吃什麼、去哪吃一個接一個快速跳動、越來越慢，停在結果上 ----
  const FACE_LAYERS = ['district', 'meal', 'place'];
  let animating = false;
  let skipRequested = false;
  let finishCurrent = () => {};
  const skipAnimation = () => {
    skipRequested = true;
    finishCurrent();
  };
  const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const controls = () => [$('drawAll'), $('drawStep'), $('next'), ...document.querySelectorAll('[data-reroll]')];

  // 一個字的跳動：轉過 pool 裡的字，最後停在 finalText；skipAnimation 可以立刻停
  const flicker = (element, pool, finalText) =>
    new Promise((resolve) => {
      const delays = flickerDelays();
      let i = 0;
      let timer;
      const finish = () => {
        clearTimeout(timer);
        element.textContent = finalText;
        element.classList.remove('spinning');
        resolve();
      };
      finishCurrent = finish;
      const step = () => {
        if (i >= delays.length || pool.length < 2) return finish();
        element.textContent = pool[Math.floor(Math.random() * pool.length)];
        timer = setTimeout(step, delays[i++]);
        return undefined;
      };
      element.classList.add('spinning');
      step();
    });

  // fromLayer：從第幾層開始動（0 區、1 吃什麼、2 去哪吃），上面的層直接顯示；faces 是各層轉過的候選字
  async function playReveal(result, fromLayer, faces) {
    animating = true;
    skipRequested = false;
    controls().forEach((b) => (b.disabled = true));
    try {
      render(result, ALL); // 先擺好最終結果，再把要動的層蓋成跳動；點什麼、熱量、提示等動完才出現
      for (const id of ['itemsLayer', 'summary', 'afterText']) $(id).hidden = true;
      for (const layer of FACE_LAYERS.slice(fromLayer)) $(layer).textContent = '—'; // 還沒輪到的層先不顯示答案
      for (const layer of FACE_LAYERS.slice(fromLayer)) {
        if (skipRequested) break;
        await flicker($(layer), faces[layer], result[layer]);
      }
    } finally {
      animating = false; // 不論中間出什麼錯，按鈕都要救回來
      controls().forEach((b) => (b.disabled = false));
      render(result, ALL);
    }
  }

  // result 是 null＝篩完沒有符合條件的店：顯示提示，不顯示結果
  // animateFrom 有給（且使用者沒開「減少動態效果」）就用大字跳動揭曉，從那一層開始動
  const show = (result, nextRevealed, animateFrom, faces) => {
    current = result;
    revealed = nextRevealed;
    $('emptyMessage').hidden = result !== null;
    if (result === null) {
      $('result').hidden = true;
      return;
    }
    if (animateFrom !== undefined && !reduceMotion()) {
      playReveal(current, animateFrom, faces);
      return;
    }
    render(current, revealed);
  };

  const drawOptions = (extra) => ({
    target: TARGET,
    position: $('nearby').checked ? position : undefined,
    includeChains: $('chains').checked,
    districts: selectedDistricts(),
    now: nowFromUrl() ?? new Date(), // 每次按下都取當下時間，營業狀態才準
    ...extra,
  });

  // 抽一次並顯示。抽籤與動畫轉過的候選字用同一份條件，才不會對不上；
  // animate(result) 回傳從哪一層開始跳（沒有就不跳，見 firstAnimatedLayer）
  const drawAndShow = ({ extra, revealedAfter, animate }) => {
    const options = drawOptions(extra);
    const result = draw(data, options);
    const from = result && animate ? animate(result) : undefined;
    show(result, revealedAfter, from, from === undefined ? undefined : candidateFaces(data, options, result));
  };

  // 按下抽籤：先取得定位（等待時按鈕變灰），再用同一套抽籤抽出完整結果
  const startDraw = async (isStepByStep) => {
    if (locating || animating) return;
    locating = true;
    $('drawAll').disabled = true;
    $('drawStep').disabled = true;
    try {
      position = await locateForDraw();
    } finally {
      locating = false;
      $('drawAll').disabled = false;
      $('drawStep').disabled = false;
    }
    stepByStep = isStepByStep;
    // 一次抽完：全部揭曉；逐層抽：只揭曉第一層
    drawAndShow({ revealedAfter: isStepByStep ? 1 : ALL, animate: isStepByStep ? undefined : () => 0 });
  };
  $('drawAll').addEventListener('click', () => startDraw(false));
  $('drawStep').addEventListener('click', () => startDraw(true));

  $('next').addEventListener('click', () => show(current, revealed + 1));
  $('result').addEventListener('click', (event) => {
    if (animating && !event.target.closest('button')) skipAnimation(); // 點一下結果就立刻停（按鈕不算，不然按「換」會立刻被略過）
  });

  // 每一層的「換」：只重抽該層（含其下層），上層保留；逐層抽時下層蓋回去
  for (const button of document.querySelectorAll('[data-reroll]')) {
    const layer = button.dataset.reroll;
    button.addEventListener('click', () => {
      if (locating || animating) return;
      const previous = current;
      drawAndShow({
        extra: { previous, reroll: layer },
        revealedAfter: stepByStep ? revealedAfterReroll(layer) : ALL,
        animate: stepByStep ? undefined : (result) => firstAnimatedLayer(layer, previous, result),
      });
    });
  }
}

main();
