// 畫面：讀資料檔、呼叫抽籤、顯示結果。抽籤規則全部在 draw.js。
import { draw } from './draw.js';
import { visibleLayers, revealedAfterReroll, ALL } from './reveal.js';

const TARGET = 500; // 熱量目標；第 05 張票改成可設定

const $ = (id) => document.getElementById(id);

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

// revealed：揭曉到第幾層（一次抽完 = ALL）。沒有點什麼資料的去哪吃只有兩層，見 reveal.js
function render(result, revealed) {
  const visible = visibleLayers(result, revealed);
  $('meal').textContent = result.meal;
  $('place').textContent = result.place;
  $('mealLayer').hidden = !visible.meal;
  $('placeLayer').hidden = !visible.place;
  $('itemsLayer').hidden = !visible.items;
  $('summary').hidden = !visible.items;
  if (visible.items) {
    renderItems(result);
    renderSummary(result);
  }
  $('next').hidden = visible.done;

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

// 測試用：網址 ?lat=…&lng=… 指定假座標（畫面上沒有入口）
function positionFromUrl() {
  const params = new URLSearchParams(location.search);
  const lat = parseFloat(params.get('lat'));
  const lng = parseFloat(params.get('lng'));
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined;
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
  if (!$('nearby').checked) return undefined;
  const fake = positionFromUrl();
  if (fake) return fake;
  setHint(HINT_LOCATING);
  const found = await requestLocation();
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

  // 定位在按下抽籤時才取得；「換」沿用最近一次抽籤的定位，不重新詢問，但開關關閉時從全部店換
  let position;
  let locating = false;
  let current;
  let revealed;
  let stepByStep = false;
  const show = (result, nextRevealed) => {
    current = result;
    revealed = nextRevealed;
    render(current, revealed);
  };

  const drawOptions = (extra) => ({ target: TARGET, position: $('nearby').checked ? position : undefined, ...extra });

  // 按下抽籤：先取得定位（等待時按鈕變灰），再用同一套抽籤抽出完整結果
  const startDraw = async (isStepByStep) => {
    if (locating) return;
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
    show(draw(data, drawOptions()), isStepByStep ? 1 : ALL);
  };
  $('drawAll').addEventListener('click', () => startDraw(false));
  $('drawStep').addEventListener('click', () => startDraw(true));

  $('next').addEventListener('click', () => show(current, revealed + 1));

  // 每一層的「換」：只重抽該層（含其下層），上層保留；逐層抽時下層蓋回去
  for (const button of document.querySelectorAll('[data-reroll]')) {
    const layer = button.dataset.reroll;
    button.addEventListener('click', () => {
      if (locating) return;
      show(draw(data, drawOptions({ previous: current, reroll: layer })), stepByStep ? revealedAfterReroll(layer) : ALL);
    });
  }
}

main();
