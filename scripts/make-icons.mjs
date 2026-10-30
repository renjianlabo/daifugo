// 対戦用のアイコン（icon_game.png, 256×256）を作る。全キャラで顔の大きさと位置をそろえる
// Notion「ゲーム用UI自動化ルール」キャラのアイコン（2026-10-29、髪のてっぺんとあごの版）：
//   縦は「髪のてっぺん」を上から約5%、「あご」を上から約78%に置く。頭の上の髪は必ず円の中に収める
//   左右に広がった髪の外側と、あごより下に垂れる長い髪は、円の端で少し切れてよい（髪を収めるために顔を小さくしない）
//   横は頭で決める：頭の上のほう（髪のてっぺんから、あごまでの長さの HEAD_AT 下がった高さ）の髪の左右の端から、
//   円の縁までの距離を左右でそろえる（ユーザー指示 2026-10-29。顔・鼻の位置はキャラごとに少しずれてよい）
//   見本（1つ前のキャラ1・キャラ2のアイコン）と並べて比べる
// 使い方：開発サーバー（npm run dev）を動かした状態で `node scripts/make-icons.mjs`
// 1人だけ作るとき：`ONLY=chara2 node scripts/make-icons.mjs`（そのキャラの icon_game.png だけを書き、一覧画像は作らない）
// 元の icon.png・立ち絵は変えない。結果は assets/characters/<フォルダ>/icon_game.png と 確認用/アイコン一覧_補助線あり.png・_補助線なし.png
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:5173/';
const SIZE = 256;
const TOP = 0.05;
const CHIN = 0.78;
// 円のふちの線（56px の円で 2px ＝ 3.6%）
const RING = 0.036;
// 頭の左右の端を測る高さ：髪のてっぺんから、あごまでの長さの 20% 下（アイコンの上から約20%）
const HEAD_AT = 0.2;

// 元の絵で目で測った位置（px）：あご・鼻（鼻は一覧画像の補助線用）。
// 髪のてっぺんと、頭の左右の端は、透明でない画素から機械で探す（顔の輪郭は前髪で隠れて取り違えやすいので使わない）
const CHARS = [
  { name: 'キャラ1', dir: 'chara1', src: 'icon.png', chin: 197, nose: 133 },
  // キャラ2の icon.png は2026-10-30にチャットの元PNG（1254×1254）に入れ替えた（ユーザー指示）。あご・鼻はその絵で測った値
  { name: 'キャラ2', dir: 'chara2', src: 'icon.png', chin: 790, nose: 647 },
  { name: 'キャラ3', dir: 'chara3', src: 'icon.png', chin: 157, nose: 122 },
  // 金髪キャラは今の icon.png に頭のてっぺんが入っていないので、アイコンの元になった2位の絵から切り出す
  { name: 'キャラ4', dir: 'blonde-tomboy', src: 'rank2.png', chin: 405, nose: 496 },
];
// 見本：1つ前（目とあごを基準にする前）のキャラ1・キャラ2。頭のてっぺん7%・あご79%で、そのとき測った値
const SAMPLES = [
  { name: '見本 キャラ1', dir: 'chara1', src: 'icon.png', top: 21.8, chin: 198.4, cx: 135.7, topAt: 0.07, chinAt: 0.79 },
  { name: '見本 キャラ2', dir: 'chara2', src: 'icon.png', top: 21.8, chin: 204.8, cx: 147.2, topAt: 0.07, chinAt: 0.79 },
];

const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const page = await browser.newPage();
// ゲームのページを開くと、アイコンを書き換えたときに自動で読み込み直されて止まるので、画像そのものを開く
await page.goto(`${BASE}assets/characters/chara1/icon.png`);

// 元の絵の、あごより上で、透明でない画素のいちばん上（＝髪のてっぺん）と、
// 頭の上のほうの高さでの、透明でない画素のいちばん左・右（＝頭の左右の端）
const measure = (c) => page.evaluate(async ({ url, chin, HEAD_AT }) => {
  const img = new Image();
  img.src = url;
  await img.decode();
  const cv = document.createElement('canvas');
  cv.width = img.width; cv.height = img.height;
  const x = cv.getContext('2d');
  x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, cv.width, cv.height).data;
  let top = 0;
  find: for (let y = 0; y < chin; y++) for (let i = 0; i < cv.width; i++) if (d[(y * cv.width + i) * 4 + 3] > 40) { top = y; break find; }
  const y = Math.round(top + HEAD_AT * (chin - top));
  let l = -1, r = -1;
  for (let i = 0; i < cv.width; i++) if (d[(y * cv.width + i) * 4 + 3] > 40) { if (l < 0) l = i; r = i; }
  return { top, headY: y, headL: l, headR: r };
}, { url: `${BASE}assets/characters/${c.dir}/${c.src}`, chin: c.chin, HEAD_AT });

// 切り出して 256×256 の PNG（data URL）にする
const render = (c, r) => page.evaluate(async ({ url, r, SIZE }) => {
  const img = new Image();
  img.src = url;
  await img.decode();
  const cv = document.createElement('canvas');
  cv.width = SIZE; cv.height = SIZE;
  const x = cv.getContext('2d');
  x.imageSmoothingQuality = 'high';
  x.drawImage(img, r.x, r.y, r.side, r.side, 0, 0, SIZE, SIZE);
  return cv.toDataURL('image/png');
}, { url: `${BASE}assets/characters/${c.dir}/${c.src}`, r, SIZE });

// 頭の上の髪が円の中か：中心から真上へ左右45°以内（頭の上）にある透明でない画素の、中心からいちばん遠い距離（半径 50% のうち）
const topReach = (dataUrl) => page.evaluate(async (dataUrl) => {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const cv = document.createElement('canvas');
  cv.width = img.width; cv.height = img.height;
  const x = cv.getContext('2d');
  x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, cv.width, cv.height).data;
  let far = 0;
  for (let y = 0; y < cv.height * 0.5; y++) for (let i = 0; i < cv.width; i++) {
    if (d[(y * cv.width + i) * 4 + 3] <= 40) continue;
    const dx = (i + 0.5) / cv.width - 0.5, dy = (y + 0.5) / cv.height - 0.5;
    if (Math.abs(dx) <= -dy) far = Math.max(far, Math.hypot(dx, dy));
  }
  return far;
}, dataUrl);

const ONLY = process.env.ONLY;
for (const c of CHARS.filter((x) => !ONLY || x.dir === ONLY)) {
  Object.assign(c, await measure(c));
  const side = (c.chin - c.top) / (CHIN - TOP);
  // 頭の左右の端の中間を円のまん中にする（＝頭の左右の端から円の縁までの距離が左右で同じ）
  c.cx = (c.headL + c.headR) / 2;
  const r = { x: c.cx - side / 2, y: c.top - TOP * side, side };
  c.data = await render(c, r);
  c.reach = await topReach(c.data);
  // 頭の上の髪が円のふちの線にかかるときは、顔の大きさは変えずに、収まるまで 0.25% ずつ下へずらす
  c.shift = 0;
  while (c.reach > 0.5 - RING && c.shift < 0.05) {
    c.shift += 0.0025;
    r.y = c.top - (TOP + c.shift) * side;
    c.data = await render(c, r);
    c.reach = await topReach(c.data);
  }
  c.noseAt = 0.5 + (c.nose - c.cx) / side;
  c.headLAt = 0.5 + (c.headL - c.cx) / side;
  c.headRAt = 0.5 + (c.headR - c.cx) / side;
  c.headYAt = TOP + c.shift + HEAD_AT * (CHIN - TOP);
  const out = path.resolve('assets/characters', c.dir, 'icon_game.png');
  fs.writeFileSync(out, Buffer.from(c.data.split(',')[1], 'base64'));
  console.log(`${c.name}: 髪のてっぺん ${c.top}px・あご ${c.chin}px${c.shift ? `（頭の上の髪を円に収めるため ${(c.shift * 100).toFixed(2)}% 下へずらした）` : ''} → ${c.src} の (${r.x.toFixed(1)}, ${r.y.toFixed(1)}) から ${side.toFixed(1)}px 四方。頭の左右の端から縁まで 左${(c.headLAt * 100).toFixed(1)}%・右${((1 - c.headRAt) * 100).toFixed(1)}%。鼻 ${(c.noseAt * 100).toFixed(1)}%（参考）。頭の上の髪は中心から ${(c.reach * 100).toFixed(1)}%（ふちの線の内側は ${((0.5 - RING) * 100).toFixed(1)}% まで）→ ${path.relative(process.cwd(), out)}（${fs.statSync(out).size} バイト）`);
}
if (ONLY) {
  await browser.close();
  process.exit(0);
}
for (const s of SAMPLES) {
  const side = (s.chin - s.top) / (s.chinAt - s.topAt);
  s.data = await render(s, { x: s.cx - side / 2, y: s.top - s.topAt * side, side });
}

// 一覧画像：上の段に見本（1つ前のキャラ1・キャラ2）、下の段に今回の4人。同じ大きさの円で並べる
const sheetPage = await browser.newPage();
const sheet = async (guides, file) => {
  const ring = (src, big, lines) => `<span class="ring ${big ? 'big' : ''}"><img src="${src}">${lines ?? ''}</span>`;
  const lines = (c) => guides ? `<i class="h" style="top:${TOP * 100}%"></i><i class="h" style="top:${CHIN * 100}%"></i>${c.shift ? `<i class="h m" style="top:${(TOP + c.shift) * 100}%"></i><i class="h m" style="top:${(CHIN + c.shift) * 100}%"></i>` : ''}<i class="n" style="left:${c.noseAt * 100}%"></i><i class="v"></i><i class="hh" style="top:${c.headYAt * 100}%"></i><i class="e" style="left:${c.headLAt * 100}%;top:${c.headYAt * 100}%"></i><i class="e" style="left:${c.headRAt * 100}%;top:${c.headYAt * 100}%"></i>` : '';
  const sampleLines = (s) => guides ? `<i class="h s" style="top:${s.topAt * 100}%"></i><i class="h s" style="top:${s.chinAt * 100}%"></i>` : '';
  const cells = CHARS.map((c) => `<div class="c"><div class="t">${c.name}</div>${ring(c.data, true, lines(c))}<div class="row">${ring(c.data, false)}</div></div>`).join('');
  const samples = SAMPLES.map((s) => `<div class="c"><div class="t">${s.name}</div>${ring(s.data, true, sampleLines(s))}<div class="row">${ring(s.data, false)}</div></div>`).join('');
  const legend = guides ? `<div class="lg">黄の横線：上＝髪のてっぺん（${TOP * 100}%）・下＝あご（${CHIN * 100}%）／白の点線：まん中／赤い点：頭の上のほうの髪の左右の端（縁までの距離が左右同じ）／水色の短い線：鼻（参考）／見本の灰色の線：見本の基準（頭のてっぺん7%・あご79%）／赤の細い線：下へずらしたキャラの、実際の髪のてっぺん・あご</div>` : '';
  await sheetPage.setViewportSize({ width: 4 * 230 + 20, height: 705 });
  await sheetPage.setContent(`<style>body{margin:0;padding:10px;font:16px sans-serif;background:#0d3b20;color:#fff}
  .w{display:flex;gap:10px;margin-bottom:12px}.c{width:220px}.t{height:26px;font-weight:700}.sec{margin:4px 0 8px;color:#f5c542;font-weight:700}
  .ring{position:relative;display:block;border-radius:50%;overflow:hidden;border:2px solid #fff;background:#3a7bd5;margin:0 auto;width:56px;height:56px}
  .ring.big{width:200px;height:200px}.ring img{width:100%;height:100%;display:block}
  .h{position:absolute;left:0;right:0;border-top:2px dashed #f5c542}.h.s{border-top-color:#bbb}.h.m{border-top:1px solid #ff8a8a}
  .v{position:absolute;top:0;bottom:0;left:50%;border-left:2px dashed #fff}.n{position:absolute;top:30%;bottom:40%;border-left:3px solid #7fe3ff}
  .hh{position:absolute;left:0;right:0;border-top:1px dashed #ffb3b3}.e{position:absolute;width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:50%;background:#ff5a5a;border:1px solid #fff}
  .row{display:flex;justify-content:center;margin-top:10px}.lg{font-size:14px;color:#ddd}</style>
  <div class="sec">見本（1つ前のキャラ1・キャラ2）</div><div class="w">${samples}</div>
  <div class="sec">今回</div><div class="w">${cells}</div>${legend}`);
  await sheetPage.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
  await sheetPage.screenshot({ path: file });
};
fs.mkdirSync('確認用', { recursive: true });
await sheet(true, '確認用/アイコン一覧_補助線あり.png');
await sheet(false, '確認用/アイコン一覧_補助線なし.png');
console.log('一覧画像 → 確認用/アイコン一覧_補助線あり.png・確認用/アイコン一覧_補助線なし.png');
await browser.close();
