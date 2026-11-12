import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visibleLayers, revealedAfterReroll, ALL } from '../src/reveal.js';

const withItems = { meal: '燒臘便當', place: '巷口燒臘', items: [{ name: '叉燒便當', kcal: 850, count: 1 }] };
const noItems = { meal: '麵', place: '家裡煮麵', items: [] };

test('逐層抽：揭曉 1 層只看到吃什麼，還沒結束', () => {
  assert.deepEqual(visibleLayers(withItems, 1), { meal: true, place: false, items: false, done: false });
});

test('逐層抽：揭曉 2 層看到吃什麼與去哪吃，有點什麼時還沒結束', () => {
  assert.deepEqual(visibleLayers(withItems, 2), { meal: true, place: true, items: false, done: false });
});

test('逐層抽：揭曉 3 層後顯示點什麼與熱量，結束', () => {
  assert.deepEqual(visibleLayers(withItems, 3), { meal: true, place: true, items: true, done: true });
});

test('沒有點什麼的去哪吃：揭曉到去哪吃就結束，不顯示點什麼與熱量', () => {
  assert.deepEqual(visibleLayers(noItems, 2), { meal: true, place: true, items: false, done: true });
});

test('一次抽完（ALL）：直接全部揭曉', () => {
  assert.deepEqual(visibleLayers(withItems, ALL), { meal: true, place: true, items: true, done: true });
  assert.deepEqual(visibleLayers(noItems, ALL), { meal: true, place: true, items: false, done: true });
});

test('逐層抽時重抽某一層：揭曉到那一層為止，下層蓋回去', () => {
  assert.equal(revealedAfterReroll('meal'), 1);
  assert.equal(revealedAfterReroll('place'), 2);
  assert.equal(revealedAfterReroll('items'), 3);
});
