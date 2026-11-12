// 畫面：讀資料檔、呼叫抽籤、顯示結果。抽籤規則全部在 draw.js。
import { draw } from './draw.js';

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

function render(result) {
  $('meal').textContent = result.meal;
  $('place').textContent = result.place;

  // 沒有點什麼資料的去哪吃：只顯示兩層，不顯示點什麼與熱量方塊
  const hasItems = result.items.length > 0;
  $('itemsLayer').hidden = !hasItems;
  $('summary').hidden = !hasItems;
  if (hasItems) {
    renderItems(result);
    renderSummary(result);
  }

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
    return;
  }

  let current;
  const show = (result) => {
    current = result;
    render(result);
  };

  // 一次抽完
  $('drawAll').addEventListener('click', () => show(draw(data, { target: TARGET })));

  // 每一層的「換」：只重抽該層（含其下層），上層保留
  for (const button of document.querySelectorAll('[data-reroll]')) {
    button.addEventListener('click', () =>
      show(draw(data, { target: TARGET, previous: current, reroll: button.dataset.reroll })),
    );
  }
}

main();
