import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSettings } from '../src/settings.js';
import { flickerDelays, firstAnimatedLayer } from '../src/flicker.js';

test('設定檔：有招牌與結果提示就讀進來，前後空白去掉', () => {
  assert.deepEqual(parseSettings({ sign: ' 減肥中 🥗 ', after: '七分飽就好' }), { sign: '減肥中 🥗', after: '七分飽就好' });
});

test('設定檔：留空、缺欄位、不是文字、整個壞掉，都當成不顯示，不報錯', () => {
  const none = { sign: '', after: '' };
  assert.deepEqual(parseSettings({ sign: '', after: '   ' }), none);
  assert.deepEqual(parseSettings({}), none);
  assert.deepEqual(parseSettings({ sign: 123, after: null }), none);
  assert.deepEqual(parseSettings(undefined), none);
  assert.deepEqual(parseSettings('壞掉'), none);
  assert.deepEqual(parseSettings(null), none);
});

test('設定檔：太長的文字截短，避免版面被撐壞', () => {
  assert.equal(parseSettings({ sign: 'a'.repeat(500) }).sign.length, 40);
  assert.equal(parseSettings({ after: 'b'.repeat(500) }).after.length, 80);
});

test('跳動節奏：越來越慢，一層約 1 秒，次數足夠看得出在跳', () => {
  const delays = flickerDelays();
  assert.ok(delays.length >= 6, `只有 ${delays.length} 次`);
  assert.equal(delays[0], 40);
  for (let i = 1; i < delays.length; i++) assert.ok(delays[i] > delays[i - 1]);
  const total = delays.reduce((a, b) => a + b, 0);
  assert.ok(total >= 700 && total <= 1300, `總共 ${total} 毫秒`);
});

const r = (districtKey, meal, place) => ({ districtKey, meal, place });

test('動畫從哪一層開始：按哪層的「換」就從那層；沒有舊結果（第一次抽）從區開始', () => {
  const previous = r('新北市新店區', '麵', 'A');
  assert.equal(firstAnimatedLayer('district', previous, r('台北市北投區', '麵', 'B')), 0);
  assert.equal(firstAnimatedLayer('meal', previous, r('新北市新店區', '便當', 'C')), 1);
  assert.equal(firstAnimatedLayer('place', previous, r('新北市新店區', '麵', 'B')), 2);
  assert.equal(firstAnimatedLayer('district', undefined, r('x', 'y', 'z')), 0);
});

test('動畫從哪一層開始：上層被偷偷改掉（改了篩選、舊的區失效）時，從第一個變掉的層開始，畫面才不會直接跳', () => {
  const previous = r('新北市新店區', '麵', 'A');
  assert.equal(firstAnimatedLayer('meal', previous, r('台北市北投區', '麵', 'B')), 0);
  assert.equal(firstAnimatedLayer('place', previous, r('新北市新店區', '便當', 'C')), 1);
});

test('動畫從哪一層開始：換「點什麼」且上面都沒變，不需要跳動', () => {
  const previous = r('新北市新店區', '麵', 'A');
  assert.equal(firstAnimatedLayer('items', previous, r('新北市新店區', '麵', 'A')), undefined);
  assert.equal(firstAnimatedLayer('items', previous, r('台北市北投區', '麵', 'B')), 0);
});
