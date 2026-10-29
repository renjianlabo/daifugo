// 画面をズームさせない（Notion「UI自動化ルール2」画面をズームさせない）
// ダブルタップ・連続タップの拡大は CSS の touch-action: manipulation と viewport の指定で止める。
// ここでは、それだけでは止まらない2本指の拡大を、できる範囲で打ち消す。
export function preventZoom(): void {
  // iPhone の Safari：2本指でつまむ・広げる操作（viewport の user-scalable=no を無視するため）
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
  }
  // 2本以上の指で動かす操作
  document.addEventListener('touchmove', (e) => {
    if (e.touches.length > 1) e.preventDefault();
  }, { passive: false });
  // パソコンのブラウザ：Ctrl を押しながらのホイール（トラックパッドの2本指の拡大もこれになる）
  document.addEventListener('wheel', (e) => {
    if (e.ctrlKey) e.preventDefault();
  }, { passive: false });
}
