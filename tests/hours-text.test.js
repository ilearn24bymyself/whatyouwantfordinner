import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHours, formatHours } from '../src/hours-text.js';

// 星期日(0)到星期六(6)
const 每天 = (...s) => Array.from({ length: 7 }, () => s);
const data = JSON.parse(readFileSync(new URL('../data/meals.json', import.meta.url), 'utf8'));

test('一行時段加公休：每天套用，公休的日子整天休息', () => {
  const r = parseHours({ hours: '11:00-14:00、16:30-20:50', closedDays: '二、四' });
  assert.deepEqual(r.hours, [['11:00-14:00', '16:30-20:50'], ['11:00-14:00', '16:30-20:50'], [], ['11:00-14:00', '16:30-20:50'], [], ['11:00-14:00', '16:30-20:50'], ['11:00-14:00', '16:30-20:50']]);
});

test('一行時段：破折號、逗號、「到」都接受；沒有公休就是每天營業', () => {
  assert.deepEqual(parseHours({ hours: '11:00 到 14:00，16:30–20:50' }).hours, 每天('11:00-14:00', '16:30-20:50'));
  assert.deepEqual(parseHours({ hours: '9:00~17:30', closedDays: '' }).hours, 每天('09:00-17:30'));
});

test('公休欄的寫法：週二、星期四、二四、用逗號都接受', () => {
  const closed = (text) => parseHours({ hours: '11:00-14:00', closedDays: text }).hours.map((d, i) => (d.length === 0 ? i : null)).filter((i) => i !== null);
  assert.deepEqual(closed('二、四'), [2, 4]);
  assert.deepEqual(closed('週二,週四'), [2, 4]);
  assert.deepEqual(closed('星期日 星期六'), [0, 6]);
  assert.deepEqual(closed('二四'), [2, 4]);
});

test('跨午夜與午夜 12 點：結束時間不晚於開始時間就算隔天', () => {
  assert.deepEqual(parseHours({ hours: '18:00-02:00' }).hours, 每天('18:00-26:00'));
  assert.deepEqual(parseHours({ hours: '17:00 到 00:00' }).hours, 每天('17:00-24:00'));
  assert.deepEqual(parseHours({ hours: '18:00-26:00' }).hours, 每天('18:00-26:00'));
});

test('留空＝隨時營業（沒有營業時間）；有公休卻沒營業時間是錯誤', () => {
  assert.deepEqual(parseHours({ hours: '', closedDays: '' }), { hours: undefined });
  assert.deepEqual(parseHours({ hours: '  ' }), { hours: undefined });
  assert.ok(parseHours({ hours: '', closedDays: '二' }).error);
});

const google = `星期五 11:00–14:00, 16:00–20:00
星期六 休息
星期日 11:00–14:00, 16:30–20:00
星期一 11:00–14:00, 16:00–20:00
星期二 11:00–14:00, 16:00–20:00
星期三 11:00–14:00, 16:00–20:00
星期四 11:00–14:00, 16:00–20:00`;

test('貼 Google 的七行：星期順序不固定、休息、不同破折號與逗號都能讀', () => {
  const r = parseHours({ hours: google });
  assert.deepEqual(r.hours, [['11:00-14:00', '16:30-20:00'], ['11:00-14:00', '16:00-20:00'], ['11:00-14:00', '16:00-20:00'], ['11:00-14:00', '16:00-20:00'], ['11:00-14:00', '16:00-20:00'], ['11:00-14:00', '16:00-20:00'], []]);
});

test('Google 七行的其他寫法：24 小時營業、「五、11:00 到 14:00、16:30 到 19:30」、前面有標題行', () => {
  const text = `營業時間\n五、11:00 到 14:00、16:30 到 19:30\n六、24 小時營業\n日、休息\n一、休息\n二、11:00 到 14:00\n三、11:00 到 14:00\n四、11:00 到 14:00`;
  const r = parseHours({ hours: text });
  assert.deepEqual(r.hours[5], ['11:00-14:00', '16:30-19:30']);
  assert.deepEqual(r.hours[6], ['00:00-24:00']);
  assert.deepEqual(r.hours[0], []);
});

test('錯誤：缺一天、時間格式不對、一天超過兩段、時段重疊，都回報原因而不是猜', () => {
  assert.match(parseHours({ hours: google.split('\n').slice(0, 6).join('\n') }).error, /四/);
  assert.ok(parseHours({ hours: '11點到2點' }).error);
  assert.ok(parseHours({ hours: '11:00-12:00、13:00-14:00、15:00-16:00' }).error);
  assert.ok(parseHours({ hours: '11:00-14:00、13:00-15:00' }).error);
  assert.ok(parseHours({ hours: '25:61-26:00' }).error);
  assert.ok(parseHours({ hours: '10:00-10:00' }).error);
  assert.ok(parseHours({ hours: '11:00-14:00', closedDays: '禮拜八' }).error);
});

test('輸出：七天一樣寫一行；一樣但有公休寫一行加公休；每天不同寫成七行；沒有營業時間輸出空白', () => {
  assert.deepEqual(formatHours(每天('11:00-14:00', '16:30-20:50')), { hours: '11:00-14:00、16:30-20:50', closedDays: '' });
  const withClosed = 每天('11:00-14:00').map((d, i) => (i === 2 || i === 4 ? [] : d));
  assert.deepEqual(formatHours(withClosed), { hours: '11:00-14:00', closedDays: '二、四' });
  const different = 每天('11:00-14:00').map((d, i) => (i === 5 ? ['16:30-20:50'] : d));
  const out = formatHours(different);
  assert.equal(out.closedDays, '');
  assert.equal(out.hours.split('\n').length, 7);
  assert.match(out.hours, /星期五 16:30-20:50/);
  assert.deepEqual(formatHours(undefined), { hours: '', closedDays: '' });
});

test('來回一致：資料檔裡所有店的營業時間，輸出成文字再讀回來完全相同', () => {
  const withHours = data.meals.flatMap((m) => m.places).filter((p) => p.hours);
  assert.ok(withHours.length >= 24);
  for (const place of withHours) {
    const back = parseHours(formatHours(place.hours));
    assert.deepEqual(back.hours, place.hours, `${place.name} 來回不一致`);
  }
});

test('全週都休息也能來回', () => {
  const allClosed = 每天();
  assert.deepEqual(parseHours(formatHours(allClosed)).hours, allClosed);
});

test('全形冒號、星期與時間之間沒有空格、單行的「24 小時營業」都能讀', () => {
  assert.deepEqual(parseHours({ hours: '11：00-14：00' }).hours, 每天('11:00-14:00'));
  const noSpace = `星期五11:00-14:00\n星期六休息\n星期日11:00-14:00\n星期一11:00-14:00\n星期二11:00-14:00\n星期三11:00-14:00\n星期四11:00-14:00`;
  assert.deepEqual(parseHours({ hours: noSpace }).hours[5], ['11:00-14:00']);
  assert.deepEqual(parseHours({ hours: '24 小時營業', closedDays: '日' }).hours, 每天('00:00-24:00').map((d, i) => (i === 0 ? [] : d)));
});

test('貼 Google 七行時又填了公休：回報衝突，不默默忽略', () => {
  assert.match(parseHours({ hours: google, closedDays: '二' }).error, /公休/);
});
