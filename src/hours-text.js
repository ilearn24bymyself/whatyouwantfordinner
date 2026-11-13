// 營業時間的文字讀寫（匯入匯出、管理頁共用，電腦與瀏覽器都能跑）。
// 資料格式：hours＝星期日(0)到星期六(6)各一組時段，每段 "HH:MM-HH:MM"，結束時間可超過 24:00 表示跨午夜，空陣列＝整天休息。
// 文字有兩種寫法：
//  1. 一行時段（每天套用）加「公休」欄，例如 hours="11:00-14:00、16:30-20:50"、closedDays="二、四"
//  2. Google 店家頁的七行，例如「星期五 11:00–14:00, 16:00–20:00」「星期六 休息」「星期日 24 小時營業」
// 留空＝沒有營業時間（隨時營業）。

const DAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];
const MINUTES_PER_DAY = 1440;
const RANGE = /(\d{1,2}):(\d{2})\s*(?:-|–|—|~|～|到|至)\s*(\d{1,2}):(\d{2})/g;
const SEPARATORS = /[\s、,，;；/]/g;
// 一行以星期開頭：「星期五 …」「週五 …」「五、…」「五 …」
const DAY_LINE = /^\s*(?:(?:星期|週|周|禮拜)\s*)?([日一二三四五六天])\s*[、,，:：\s]\s*(.*)$/;

const pad = (n) => String(n).padStart(2, '0');
const clock = (minutes) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

// 一段文字裡的時段（可多段）→ ["HH:MM-HH:MM", …]；有問題回傳 { error }
function parseSessions(text) {
  const matches = [...text.matchAll(RANGE)];
  if (matches.length === 0) return { error: `看不懂營業時間「${text.trim()}」（請寫成 11:00-14:00、16:30-20:50）` };
  const leftover = text.replace(RANGE, '').replace(SEPARATORS, '');
  if (leftover) return { error: `營業時間裡有看不懂的字「${leftover}」` };
  const sessions = [];
  for (const m of matches) {
    const [h1, m1, h2, m2] = m.slice(1).map(Number);
    if (h1 > 24 || h2 > 30 || m1 > 59 || m2 > 59) return { error: `時間不合理「${m[0]}」` };
    const from = h1 * 60 + m1;
    let to = h2 * 60 + m2;
    if (to === from) return { error: `開始與結束時間相同「${m[0]}」` };
    if (to <= from) to += MINUTES_PER_DAY; // 17:00 到 00:00、18:00-02:00：算隔天
    sessions.push({ from, to });
  }
  sessions.sort((a, b) => a.from - b.from);
  if (sessions.length > 2) return { error: '一天最多兩段營業時間' };
  if (sessions.length === 2 && sessions[1].from < sessions[0].to) return { error: '同一天的兩段時間重疊' };
  return { sessions: sessions.map((s) => `${clock(s.from)}-${clock(s.to)}`) };
}

// 公休欄：「二、四」「週二,週四」「星期日 星期六」「二四」→ [2, 4]
function parseClosedDays(text) {
  const rest = text.replace(/星期|週|周|禮拜/g, '').replace(SEPARATORS, '');
  const days = new Set();
  for (const ch of rest) {
    const index = ch === '天' ? 0 : DAY_LABELS.indexOf(ch);
    if (index < 0) return { error: `公休欄看不懂「${text.trim()}」（請寫成 二、四）` };
    days.add(index);
  }
  return { days };
}

function parseGoogleLines(lines) {
  const hours = Array(7);
  for (const { day, rest } of lines) {
    if (hours[day]) return { error: `星期${DAY_LABELS[day]}重複出現` };
    if (/休息|公休|未營業/.test(rest)) hours[day] = [];
    else if (/24\s*小時/.test(rest)) hours[day] = ['00:00-24:00'];
    else {
      const parsed = parseSessions(rest);
      if (parsed.error) return { error: `星期${DAY_LABELS[day]}：${parsed.error}` };
      hours[day] = parsed.sessions;
    }
  }
  const missing = DAY_LABELS.map((label, i) => (hours[i] ? null : label)).filter(Boolean);
  if (missing.length) return { error: `缺少星期${missing.join('、')}的營業時間` };
  return { hours };
}

// 回傳 { hours: 每週時間 }、{ hours: undefined }（留空＝隨時營業）或 { error: 原因 }
export function parseHours({ hours: text = '', closedDays = '' } = {}) {
  if (!text.trim()) {
    return closedDays.trim() ? { error: '有填公休，但沒有填營業時間' } : { hours: undefined };
  }
  const dayLines = text
    .split(/\r?\n/)
    .map((line) => line.match(DAY_LINE))
    .filter(Boolean)
    .map((m) => ({ day: m[1] === '天' ? 0 : DAY_LABELS.indexOf(m[1]), rest: m[2] }));
  if (dayLines.length > 0) return parseGoogleLines(dayLines);

  const sessions = parseSessions(text);
  if (sessions.error) return sessions;
  const closed = parseClosedDays(closedDays);
  if (closed.error) return closed;
  return { hours: Array.from({ length: 7 }, (_, day) => (closed.days.has(day) ? [] : sessions.sessions)) };
}

const sessionsText = (sessions) => sessions.join('、');

// 每週時間 → { hours, closedDays } 文字；七天（除公休外）一樣就寫一行加公休，不一樣寫成七行；沒有營業時間輸出空白
export function formatHours(hours) {
  if (!hours) return { hours: '', closedDays: '' };
  const open = hours.map((sessions, day) => ({ sessions, day })).filter((d) => d.sessions.length > 0);
  const same = open.length > 0 && open.every((d) => sessionsText(d.sessions) === sessionsText(open[0].sessions));
  const order = [1, 2, 3, 4, 5, 6, 0]; // 星期一到星期日
  if (same) {
    const closed = order.filter((day) => hours[day].length === 0).map((day) => DAY_LABELS[day]);
    return { hours: sessionsText(open[0].sessions), closedDays: closed.join('、') };
  }
  const lines = order.map((day) => `星期${DAY_LABELS[day]} ${hours[day].length ? sessionsText(hours[day]) : '休息'}`);
  return { hours: lines.join('\n'), closedDays: '' };
}
