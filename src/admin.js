// 管理頁（只在本機預覽伺服器有後端）：列出全部店家，新增、編輯、單筆與批次刪除、匯入匯出 Excel。
// 所有規則（格式檢查、差異、寫檔）都在後端 / places-sheet.js；這裡只負責畫面。

const $ = (id) => document.getElementById(id);
const HEADERS = { 'X-Dinner-Admin': '1' };
const FIELDS = ['類別', '店名', '連鎖', '行政區', '地址', '座標', '營業時間', '公休'];

let rows = [];
const selected = new Set();
let editingName; // undefined＝新增；否則是正在編輯的店名
let pendingImportRows;

function show(el, text) {
  el.textContent = text;
  el.hidden = !text;
}
const message = (text) => show($('adminMessage'), text);
const errorLine = (e) => `第 ${e.row} 列「${e.column}」：${e.message}`;
const failText = (res) => (res.json?.errors ?? []).map(errorLine).join('；') || res.json?.error || '未知錯誤';
const option = (value) => Object.assign(document.createElement('option'), { value });

async function call(url, options = {}) {
  const res = await fetch(url, { ...options, headers: { ...HEADERS, ...options.headers } });
  let json;
  try {
    json = await res.json();
  } catch {
    json = undefined;
  }
  return { ok: res.ok, status: res.status, json };
}

// 整份表格送去後端：後端檢查、備份、寫檔，成功就回最新表格
async function save(nextRows) {
  const res = await call('/api/save', { method: 'POST', body: JSON.stringify({ rows: nextRows }) });
  if (res.ok) {
    rows = res.json.rows;
    selected.clear();
    render();
  }
  return res;
}

function summaryOf(row) {
  if (row.連鎖 === '是') return '連鎖店';
  const place = [row.行政區, row.座標 ? '有座標' : '無座標'].join('・');
  const hours = row.營業時間
    ? row.營業時間.includes('\n')
      ? '營業時間：每天不同'
      : `${row.營業時間}${row.公休 ? `（週${row.公休}休）` : ''}`
    : '隨時營業';
  return `${place}｜${hours}`;
}

function renderRow(row) {
  const item = document.createElement('div');
  item.className = 'clay admin-row';
  const check = document.createElement('input');
  check.type = 'checkbox';
  check.checked = selected.has(row.店名);
  check.setAttribute('aria-label', `選取 ${row.店名}`);
  check.addEventListener('change', () => {
    if (check.checked) selected.add(row.店名);
    else selected.delete(row.店名);
    updateDeleteButton();
  });
  const text = document.createElement('div');
  text.className = 'admin-row-text';
  const title = document.createElement('strong');
  title.textContent = row.店名;
  const meal = document.createElement('small');
  meal.textContent = `　${row.類別}`;
  title.append(meal);
  const detail = document.createElement('small');
  detail.className = 'admin-row-detail';
  detail.textContent = summaryOf(row);
  text.append(title, detail);
  const edit = Object.assign(document.createElement('button'), { type: 'button', className: 'clay-btn small', textContent: '編輯' });
  edit.addEventListener('click', () => openForm(row));
  const del = Object.assign(document.createElement('button'), { type: 'button', className: 'clay-btn small', textContent: '刪除' });
  del.addEventListener('click', () => removeNames([row.店名]));
  item.append(check, text, edit, del);
  return item;
}

function render() {
  $('mealOptions').replaceChildren(...[...new Set(rows.map((r) => r.類別))].map(option));
  $('districtOptions').replaceChildren(...[...new Set(rows.map((r) => r.行政區).filter(Boolean))].map(option));
  $('placesList').replaceChildren(...rows.map(renderRow));
  updateDeleteButton();
}

function updateDeleteButton() {
  $('deleteSelected').textContent = `刪除選取（${selected.size}）`;
  $('deleteSelected').disabled = selected.size === 0;
}

async function removeNames(names) {
  const list = names.length > 8 ? `${names.slice(0, 8).join('、')}…等` : names.join('、');
  if (!confirm(`確定刪除 ${names.length} 家店？\n${list}\n\n（寫入前會備份原檔，之後也能用 git 還原）`)) return;
  const res = await save(rows.filter((r) => !names.includes(r.店名)));
  message(res.ok ? `已刪除 ${names.length} 家，原檔備份在 data/meals.json.bak。記得 commit。` : `刪除失敗：${failText(res)}`);
}

// ---- 新增、編輯表單 ----
const syncChain = () => {
  $('localFields').hidden = $('editForm').elements['連鎖'].checked;
};

function openForm(row) {
  editingName = row?.店名;
  $('formTitle').textContent = row ? `編輯：${row.店名}` : '新增店家';
  for (const name of FIELDS) {
    const input = $('editForm').elements[name];
    if (name === '連鎖') input.checked = row?.連鎖 === '是';
    else input.value = row?.[name] ?? '';
  }
  show($('formErrors'), '');
  syncChain();
  $('editForm').hidden = false;
  $('editForm').elements['類別'].focus();
  $('editForm').scrollIntoView({ block: 'nearest' });
}

function readForm() {
  const row = {};
  for (const name of FIELDS) {
    const input = $('editForm').elements[name];
    row[name] = name === '連鎖' ? (input.checked ? '是' : '') : input.value;
  }
  if (row.連鎖 === '是') for (const name of ['行政區', '地址', '座標', '營業時間', '公休']) row[name] = '';
  return row;
}

async function submitForm(event) {
  event.preventDefault();
  const row = readForm();
  const index = rows.findIndex((r) => r.店名 === editingName);
  const candidate = index >= 0 ? rows.map((r, i) => (i === index ? row : r)) : [...rows, row];
  const res = await save(candidate);
  if (res.ok) {
    $('editForm').hidden = true;
    message(`已儲存「${row.店名.trim()}」。原檔備份在 data/meals.json.bak，記得 commit。`);
    return;
  }
  const errors = res.json?.errors ?? [{ column: '', message: res.json?.error ?? '儲存失敗' }];
  const list = $('formErrors');
  list.replaceChildren(...errors.map((e) => Object.assign(document.createElement('li'), { textContent: e.column ? `「${e.column}」：${e.message}` : e.message })));
  list.hidden = false;
}

// ---- 匯入 Excel（先預覽差異，確認才寫入）----
async function previewImport(file) {
  const res = await call('/api/import-excel', { method: 'POST', body: await file.arrayBuffer() });
  if (!res.ok) {
    const lines = (res.json?.errors ?? [{ message: res.json?.error ?? '匯入失敗' }]).map((e) => (e.row ? errorLine(e) : e.message));
    show($('adminError'), `匯入失敗，資料檔沒有任何改動：\n${lines.join('\n')}`);
    return;
  }
  show($('adminError'), '');
  const { added, updated, removed, unchanged } = res.json.plan;
  if (!added.length && !updated.length && !removed.length) {
    message(`沒有任何變化（${unchanged} 家都跟資料檔一樣）。`);
    return;
  }
  pendingImportRows = res.json.rows;
  $('importSummary').textContent = `新增 ${added.length} 家、更新 ${updated.length} 家、刪除 ${removed.length} 家、沒變 ${unchanged} 家`;
  const detail = [['新增', added], ['更新', updated], ['刪除', removed]].filter(([, list]) => list.length);
  $('importDetail').replaceChildren(...detail.map(([label, list]) => Object.assign(document.createElement('li'), { textContent: `${label}：${list.join('、')}` })));
  $('importPreview').hidden = false;
}

async function applyImport() {
  const res = await save(pendingImportRows);
  $('importPreview').hidden = true;
  pendingImportRows = undefined;
  message(res.ok ? '已套用匯入。原檔備份在 data/meals.json.bak，記得 commit。' : `套用失敗：${failText(res)}`);
}

async function main() {
  const res = await call('/api/rows');
  if (!res.ok || !res.json?.rows) {
    show($('adminError'), '這一頁只能在自己電腦的預覽伺服器上使用（雙擊 01.start.bat 開啟），上線的網頁沒有管理功能。');
    $('adminActions').hidden = true;
    return;
  }
  rows = res.json.rows;
  render();

  $('addBtn').addEventListener('click', () => openForm());
  $('formCancel').addEventListener('click', () => {
    $('editForm').hidden = true;
  });
  $('editForm').addEventListener('submit', submitForm);
  $('editForm').elements['連鎖'].addEventListener('change', syncChain);
  $('deleteSelected').addEventListener('click', () => removeNames([...selected]));
  $('importFile').addEventListener('change', async (event) => {
    const [file] = event.target.files;
    event.target.value = '';
    if (file) await previewImport(file);
  });
  $('importCancel').addEventListener('click', () => {
    $('importPreview').hidden = true;
    pendingImportRows = undefined;
  });
  $('importApply').addEventListener('click', applyImport);
}

main();
