import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visibleLayers, revealedAfterReroll, ALL } from '../src/reveal.js';

const withItems = { district: '新店區', meal: '燒臘便當', place: '巷口燒臘', items: [{ name: '叉燒便當', kcal: 850, count: 1 }] };
const noItems = { district: '新店區', meal: '麵', place: '家裡煮麵', items: [] };

test('逐層抽：揭曉 1 層只看到區，還沒結束', () => {
  assert.deepEqual(visibleLayers(withItems, 1), { district: true, meal: false, place: false, items: false, done: false });
});

test('逐層抽：揭曉 2、3 層依序多看到吃什麼、去哪吃；有點什麼時還沒結束', () => {
  assert.deepEqual(visibleLayers(withItems, 2), { district: true, meal: true, place: false, items: false, done: false });
  assert.deepEqual(visibleLayers(withItems, 3), { district: true, meal: true, place: true, items: false, done: false });
});

test('逐層抽：揭曉 4 層後顯示點什麼與熱量，結束', () => {
  assert.deepEqual(visibleLayers(withItems, 4), { district: true, meal: true, place: true, items: true, done: true });
});

test('沒有點什麼的去哪吃：揭曉到去哪吃（第 3 層）就結束，不顯示點什麼與熱量', () => {
  assert.deepEqual(visibleLayers(noItems, 3), { district: true, meal: true, place: true, items: false, done: true });
});

test('一次抽完（ALL）：直接全部揭曉', () => {
  assert.deepEqual(visibleLayers(withItems, ALL), { district: true, meal: true, place: true, items: true, done: true });
  assert.deepEqual(visibleLayers(noItems, ALL), { district: true, meal: true, place: true, items: false, done: true });
});

test('逐層抽時重抽某一層：揭曉到那一層為止，下層蓋回去', () => {
  assert.equal(revealedAfterReroll('district'), 1);
  assert.equal(revealedAfterReroll('meal'), 2);
  assert.equal(revealedAfterReroll('place'), 3);
  assert.equal(revealedAfterReroll('items'), 4);
});
