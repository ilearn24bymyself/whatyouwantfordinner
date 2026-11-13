// 大字跳動的節奏：每次換字的間隔，越來越慢（跳動慢慢停下來），一層約 1 秒。
// 畫面用這串間隔一個一個換字，最後一個間隔後停在結果上。
const START_MS = 40;
const GROWTH = 1.25;
const STOP_OVER_MS = 280;

export function flickerDelays() {
  const delays = [];
  for (let delay = START_MS; delay <= STOP_OVER_MS; delay *= GROWTH) delays.push(Math.round(delay));
  return delays;
}

// 動畫要從哪一層開始跳（0 區、1 吃什麼、2 去哪吃），沒有就是不用跳。
// 按哪層的「換」就從那層開始；但如果上面的層也跟著變了（例如改了篩選、舊的區失效被重抽），
// 就從第一個變掉的層開始，畫面才不會直接跳變。第一次抽（沒有舊結果）從區開始。
const FACE_LAYERS = ['district', 'meal', 'place'];
const keyOf = { district: (x) => x.districtKey, meal: (x) => x.meal, place: (x) => x.place };

export function firstAnimatedLayer(rerolledLayer, previous, result) {
  if (!previous) return 0;
  const rerolled = FACE_LAYERS.indexOf(rerolledLayer);
  const changed = FACE_LAYERS.findIndex((layer) => keyOf[layer](previous) !== keyOf[layer](result));
  const candidates = [rerolled, changed].filter((i) => i >= 0);
  return candidates.length ? Math.min(...candidates) : undefined;
}
