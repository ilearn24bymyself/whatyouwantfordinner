// 設定檔 data/settings.json：招牌（畫面最上方固定顯示）與結果提示（抽完結果下方顯示）。
// 留空、缺欄位、檔案不存在或壞掉，都當成「不顯示」，不能讓頁面出錯。
const SIGN_MAX = 40;
const AFTER_MAX = 80;

const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

export function parseSettings(json) {
  const source = json && typeof json === 'object' ? json : {};
  return { sign: text(source.sign, SIGN_MAX), after: text(source.after, AFTER_MAX) };
}
