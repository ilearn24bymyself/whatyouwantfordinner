// 揭曉：抽籤結果要顯示到第幾層。抽籤本身全部在 draw.js，這裡只管畫面揭曉的節奏。
// 逐層抽 = 一開始就抽好完整結果，每按一次多揭曉一層；一次抽完 = 直接全部揭曉（ALL）。
import { LAYERS } from './draw.js';

export const ALL = Infinity;

// 沒有點什麼資料的去哪吃只有「吃什麼、去哪吃」兩層
const LAYERS_WITHOUT_ITEMS = LAYERS.indexOf('items');

// 回傳每一塊要不要顯示（熱量方塊跟著 items 一起顯示或隱藏），以及是否已揭曉完畢
export function visibleLayers(result, revealed) {
  const layerCount = result.items.length > 0 ? LAYERS.length : LAYERS_WITHOUT_ITEMS;
  const shown = Math.min(revealed, layerCount);
  const reached = (layer) => shown > LAYERS.indexOf(layer);
  return { meal: reached('meal'), place: reached('place'), items: reached('items'), done: shown >= layerCount };
}

// 逐層抽時重抽某一層：揭曉到那一層為止，下層蓋回去等再揭曉
export function revealedAfterReroll(layer) {
  return LAYERS.indexOf(layer) + 1;
}
