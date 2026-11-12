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

  let current;
  let revealed;
  let stepByStep = false;
  const show = (result, nextRevealed) => {
    current = result;
    revealed = nextRevealed;
    render(current, revealed);
  };

  // 一次抽完：全部揭曉
  $('drawAll').addEventListener('click', () => {
    stepByStep = false;
    show(draw(data, { target: TARGET }), ALL);
  });

  // 逐層抽：用同一套抽籤先抽好完整結果，只揭曉第一層
  $('drawStep').addEventListener('click', () => {
    stepByStep = true;
    show(draw(data, { target: TARGET }), 1);
  });

  $('next').addEventListener('click', () => show(current, revealed + 1));

  // 每一層的「換」：只重抽該層（含其下層），上層保留；逐層抽時下層蓋回去
  for (const button of document.querySelectorAll('[data-reroll]')) {
    const layer = button.dataset.reroll;
    button.addEventListener('click', () =>
      show(
        draw(data, { target: TARGET, previous: current, reroll: layer }),
        stepByStep ? revealedAfterReroll(layer) : ALL,
      ),
    );
  }
}

main();
