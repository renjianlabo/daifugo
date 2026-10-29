// キャラ選択の改善案の検査：Notion「アプリ共通の検査ルール」11項目と「ゲーム用UI自動化ルール」の守る数値、
// それにスワイプで切り替わるか・顔に名前やボタンがかからないかを機械で確かめる
// 使い方：node UI改善案/検査_キャラ選択.mjs → UI改善案/画面/選択_*.png と UI改善案/検査結果_キャラ選択.md
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DIR = path.resolve('UI改善案');
const PAGE = pathToFileURL(path.join(DIR, 'キャラ選択_高級版.html')).href;
const OUT = path.join(DIR, '画面');
const SIZES = [[375, 812, true], [430, 932, true], [1280, 800, false], [375, 667, false]];
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p));

const problems = [];
const logs = { art: [], swipe: [], buttons: [] };
const texts = new Set();

// 絵の左右の端に人物がいるか（いればそこも切れ目）。ファイルを直接開いた画面では画素を読めないので別のページで調べる
async function measureEdges(browser) {
  const html = fs.readFileSync(path.join(DIR, 'キャラ選択_高級版.html'), 'utf8');
  const srcs = [...html.matchAll(/src: '([^']+)'/g)].map((m) => m[1]);
  const page = await browser.newPage();
  const out = {};
  for (const src of srcs) {
    const type = src.endsWith('.webp') ? 'webp' : 'png';
    const data = `data:image/${type};base64,` + fs.readFileSync(path.join(DIR, src)).toString('base64');
    out[src] = await page.evaluate(async (data) => {
      const img = new Image(); img.src = data; await img.decode();
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      const col = (cx) => { const d = x.getImageData(cx, 0, 1, c.height).data; for (let i = 3; i < d.length; i += 4) if (d[i] > 10) return true; return false; };
      const row = (cy) => { const d = x.getImageData(0, cy, c.width, 1).data; for (let i = 3; i < d.length; i += 4) if (d[i] > 10) return true; return false; };
      return { left: col(0), right: col(c.width - 1), bottom: row(c.height - 1), top: row(0) };
    }, data);
  }
  await page.close();
  return out;
}

async function audit(page, where, edges) {
  const r = await page.evaluate((edges) => {
    const out = [];
    const W = innerWidth, H = innerHeight;
    const screen = document.querySelector('.screen').getBoundingClientRect();
    // 文字が何行になっているか（直下の文字の行の上端を数える。1行の中の小さなずれは同じ行とみなす）
    const lineCount = (el) => {
      const tops = [];
      for (const n of el.childNodes) {
        if (n.nodeType !== 3 || !n.textContent.trim()) continue;
        const rg = document.createRange(); rg.selectNodeContents(n);
        for (const q of rg.getClientRects()) if (q.width > 0) tops.push(q.top);
      }
      tops.sort((a, b) => a - b);
      const fs0 = parseFloat(getComputedStyle(el).fontSize);
      return tops.reduce((c, t, i) => c + (i > 0 && t - tops[i - 1] > fs0 * 0.6 ? 1 : 0), tops.length ? 1 : 0);
    };
    const label = (el) => (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).join('.') : el.tagName) + `「${(el.textContent || '').trim().slice(0, 12)}」`;
    const visible = (el) => {
      const b = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      if (!(b.width > 0 && b.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none')) return false;
      if (el.closest('[aria-hidden="true"]') && el.closest('.slide')) return false; // 横に控えているキャラ
      return true;
    };
    const all = [...document.querySelectorAll('#screen *')].filter(visible);
    const leaves = all.filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
    // 2・5・4 はみ出し・見切れ・16px未満・折り返し
    if (document.documentElement.scrollWidth > W + 1) out.push(['2', `横にはみ出し（${document.documentElement.scrollWidth}px）`]);
    for (const el of leaves) {
      const cs = getComputedStyle(el), b = el.getBoundingClientRect();
      if (parseFloat(cs.fontSize) < 16) out.push(['num-16', `文字が16px未満（${cs.fontSize}）：${label(el)}`]);
      if (el.scrollWidth > el.clientWidth + 1 && cs.overflow !== 'visible' && cs.display !== 'inline') out.push(['2', `文字の見切れ：${label(el)}`]);
      if (b.right > Math.min(W, screen.right) + 1 || b.left < Math.max(0, screen.left) - 1 || b.bottom > H + 1 || b.top < -1) out.push(['2', `画面の外にはみ出し：${label(el)}`]);
      if (lineCount(el) > 1) out.push(['4', `2行に折り返している：${label(el)}`]);
    }
    for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
      const a = leaves[i], c = leaves[j];
      if (a.contains(c) || c.contains(a)) continue;
      const p = a.getBoundingClientRect(), q = c.getBoundingClientRect();
      if (Math.min(p.right, q.right) - Math.max(p.left, q.left) > 2 && Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top) > 2) out.push(['2', `文字の重なり：${label(a)} と ${label(c)}`]);
    }
    // 押せるものどうしの重なり
    const btns = all.filter((e) => e.tagName === 'BUTTON');
    for (let i = 0; i < btns.length; i++) for (let j = i + 1; j < btns.length; j++) {
      const p = btns[i].getBoundingClientRect(), q = btns[j].getBoundingClientRect();
      if (Math.min(p.right, q.right) - Math.max(p.left, q.left) > 0 && Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top) > 0) out.push(['2', `ボタンの重なり：${label(btns[i])} と ${label(btns[j])}`]);
    }
    // 7 絵が出ているか
    for (const img of document.querySelectorAll('img')) if (!img.complete || img.naturalWidth === 0) out.push(['7', `絵が表示されない：${img.getAttribute('src')}`]);
    // 10 今のキャラの絵：下の切れ目は画面の下端。左右・上に人物が届いていれば、そこも画面の端の外
    const img = document.querySelector('.slide[aria-hidden="false"] .char-art');
    const art = img.getBoundingClientRect();
    const e = edges[img.getAttribute('src')];
    const bottom = Math.min(screen.bottom, H);
    if (e.bottom && Math.abs(art.bottom - bottom) > 1) out.push(['10', `イラストの切れ目が下端から ${Math.round(bottom - art.bottom)}px 浮いている：${img.alt}`]);
    if (e.left && art.left > screen.left + 1) out.push(['10', `イラストの左の切れ目が画面の中：${img.alt}`]);
    if (e.right && art.right < screen.right - 1) out.push(['10', `イラストの右の切れ目が画面の中：${img.alt}`]);
    // 顔に名前・ボタン・説明がかからない。頭が画面の左右で切れていない
    const [hx1, hy1, hx2, hy2] = img.dataset.head.split(',').map(Number);
    const head = { left: art.left + hx1 * art.width, right: art.left + hx2 * art.width, top: art.top + hy1 * art.height, bottom: art.top + hy2 * art.height };
    for (const el of document.querySelectorAll('button, .top, .gbar, .dots')) {
      if (!visible(el)) continue;
      const b = el.getBoundingClientRect();
      if (Math.min(b.right, head.right) - Math.max(b.left, head.left) > 0 && Math.min(b.bottom, head.bottom) - Math.max(b.top, head.top) > 0) out.push(['face', `顔（頭の範囲）に重なっている：${label(el)}（${img.alt}）`]);
    }
    if (head.left < screen.left || head.right > screen.right) out.push(['face', `頭が画面の左右で切れている（${img.alt}）`]);
    const artInfo = { name: img.alt, h: Math.round(head.bottom - head.top), top: Math.round(head.top), share: Math.round(((Math.min(art.bottom, H) - Math.max(art.top, document.querySelector('.stage').getBoundingClientRect().top)) / H) * 100) };
    // 2 隣のキャラの絵が、今のキャラの画面に見えていない（スワイプしていないとき）
    const stageR = document.querySelector('.stage').getBoundingClientRect();
    for (const s of document.querySelectorAll('.slide[aria-hidden="true"]')) {
      const sr = s.getBoundingClientRect();
      const im = s.querySelector('.char-art').getBoundingClientRect();
      const clipL = getComputedStyle(s).overflow === 'hidden' ? Math.max(im.left, sr.left) : im.left;
      const clipR = getComputedStyle(s).overflow === 'hidden' ? Math.min(im.right, sr.right) : im.right;
      if (Math.min(clipR, stageR.right) - Math.max(clipL, stageR.left) > 0.5) out.push(['2', `隣のキャラの絵が見えている：${s.querySelector('.char-art').alt}`]);
    }
    // 9 名前は1か所だけ
    const names = [...document.querySelectorAll('#screen *')].filter((el) => visible(el) && [...el.childNodes].some((n) => n.nodeType === 3 && /^キャラ\d$/.test(n.textContent.trim())));
    if (names.length !== 1) out.push(['9', `キャラの名前が${names.length}か所に出ている`]);
    // 守る数値：ボタン44px以上（幅も）
    for (const b of btns) { const r = b.getBoundingClientRect(); if (r.height < 43.5 || r.width < 43.5) out.push(['num-44', `ボタンが44px未満（${Math.round(r.width)}×${Math.round(r.height)}）：${label(b)}`]); }
    // 守る数値：コントラスト。金の光沢文字はグラデーションのいちばん暗い色、塗りがグラデーションのボタンは塗りのすべての色で測る
    const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p[3] ?? 1]; };
    const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(1);
    const bgOf = (el) => {
      const layers = [];
      for (let p = el; p; p = p.parentElement) { const c = parse(getComputedStyle(p).backgroundColor); if (c && c[3] > 0) { layers.push(c); if (c[3] >= 1) break; } }
      let col = [36, 16, 32];
      for (let i = layers.length - 1; i >= 0; i--) { const [r, g, b, a] = layers[i]; col = [r * a + col[0] * (1 - a), g * a + col[1] * (1 - a), b * a + col[2] * (1 - a)]; }
      return col;
    };
    const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
    const minRatios = [];
    for (const el of leaves) {
      if (el.closest(':disabled')) continue;
      const cs = getComputedStyle(el);
      const goldEl = el.closest('.gold-text');
      let fgs;
      if (goldEl) { const g = getComputedStyle(goldEl).backgroundImage; fgs = [...g.matchAll(/rgba?\([^)]+\)/g)].map((m) => parse(m[0])).concat([...g.matchAll(/#[0-9a-f]{6}/gi)].map((m) => hex(m[0]))); }
      else { const fg = parse(cs.color); if (!fg) continue; fgs = [fg]; }
      const btn = [el.closest('button')].find((b) => b && /gradient/.test(getComputedStyle(b).backgroundImage));
      const bgs = btn ? [...getComputedStyle(btn).backgroundImage.matchAll(/rgba?\([^)]+\)/g)].map((m) => parse(m[0]).slice(0, 3)) : [bgOf(el)];
      let worst = 99;
      for (const fg of fgs) for (const b of bgs) worst = Math.min(worst, ratio([0, 1, 2].map((i) => fg[i] * fg[3] + b[i] * (1 - fg[3])), b));
      const fs = parseFloat(cs.fontSize);
      const need = fs >= 24 || (fs >= 18.66 && parseInt(cs.fontWeight) >= 700) ? 3 : 4.5;
      minRatios.push([label(el).replace(/「.*$/, ''), +worst.toFixed(2), need]);
      if (worst < need - 0.01) out.push(['contrast', `コントラスト ${worst.toFixed(2)}:1（必要 ${need}:1）：${label(el)}`]);
    }
    // 守る数値：動きは0.3秒以内
    const dur = (v) => Math.max(...v.split(',').map((x) => parseFloat(x) * (x.includes('ms') ? 0.001 : 1)));
    for (const el of all) {
      const cs = getComputedStyle(el);
      const t = Math.max(dur(cs.transitionDuration), cs.animationName !== 'none' ? dur(cs.animationDuration) : 0);
      if (t > 0.3001) out.push(['anim', `動きが${t}秒：${label(el)}`]);
    }
    // 守る数値：押せないものは見た目で区別できる
    for (const b of btns.filter((e) => e.disabled)) { const cs = getComputedStyle(b); if (parseFloat(cs.opacity) >= 1 && cs.filter === 'none') out.push(['press', `押せないのに押せるものと同じ見た目：${label(b)}`]); }
    return { out, texts: leaves.map((e) => e.textContent.trim()), minRatios, artInfo, fontsLoaded: document.fonts.check('800 16px "Shippori Mincho B1"') };
  }, edges);
  r.out.forEach(([item, detail]) => problems.push({ item, where, detail }));
  r.texts.forEach((t) => texts.add(t));
  return r;
}

const browser = await chromium.launch({ executablePath: exe });
const EDGES = await measureEdges(browser);
const contrastLog = new Map();
let fontsLoaded = true;
fs.mkdirSync(OUT, { recursive: true });

for (const [w, h, photo] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(PAGE);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  for (let c = 1; c <= 4; c++) {
    if (c > 1) { await page.click('[data-act=next]'); await page.waitForTimeout(350); }
    const where = `${w}×${h} キャラ${c}`;
    const r = await audit(page, where, EDGES);
    fontsLoaded &&= r.fontsLoaded;
    r.minRatios.forEach(([l, v, need]) => { const k = `${l}（必要${need}）`; contrastLog.set(k, Math.min(contrastLog.get(k) ?? 99, v)); });
    if (photo || c === 1) logs.art.push(`- ${where}：頭の高さ ${r.artInfo.h}px、頭のてっぺん ${r.artInfo.top}px、絵が画面の高さの ${r.artInfo.share}%`);
    if (photo) await page.screenshot({ path: path.join(OUT, `選択_${w}_キャラ${c}.png`) });
    else if (c === 1) await page.screenshot({ path: path.join(OUT, `選択_確認_${w}x${h}.png`) });
  }
  // スワイプの途中（指について絵が動く）の写真
  if (photo) {
    await page.click('[data-act=prev]'); await page.waitForTimeout(350);
    const box = await page.locator('#stage').boundingBox();
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.6);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.6, { steps: 8 });
    await page.screenshot({ path: path.join(OUT, `選択_${w}_スワイプ途中.png`) });
    await page.mouse.up();
  }
  if (errors.length) problems.push({ item: '7', where: `${w}px`, detail: errors.join(' / ') });
  await ctx.close();
}

// 1・8 ボタンとスワイプ：マウスのドラッグと、指（タッチ）のスワイプで切り替わるか
{
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto(PAGE);
  await page.waitForTimeout(300);
  const name = () => page.locator('#name').textContent();
  const check = async (what, expect, run) => {
    await run();
    await page.waitForTimeout(350);
    const got = await name();
    logs.swipe.push(`- ${what}：${got}${got === expect ? '' : `（${expect}のはず）`}`);
    if (got !== expect) problems.push({ item: '1', where: '375px', detail: `${what}で${expect}にならない（${got}）` });
  };
  const cdp = await ctx.newCDPSession(page);
  const swipe = async (from, to, y = 450) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from, y }] });
    for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from + ((to - from) * i) / 10, y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  await check('指で左へスワイプ', 'キャラ2', () => swipe(300, 80));
  await check('指で左へスワイプ', 'キャラ3', () => swipe(300, 80));
  await check('指で右へスワイプ', 'キャラ2', () => swipe(80, 300));
  await check('指で少しだけ左へ（戻る）', 'キャラ2', () => swipe(200, 170));
  await check('指で縦に動かす（切り替わらない）', 'キャラ2', () => swipe(200, 205, 300).then(() => cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 300 }] })).then(() => cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 205, y: 500 }] })).then(() => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })));
  await page.goto(PAGE);
  await page.waitForTimeout(300);
  const mdrag = async (from, to) => { await page.mouse.move(from, 450); await page.mouse.down(); await page.mouse.move(to, 450, { steps: 10 }); await page.mouse.up(); };
  await check('マウスで左へドラッグ', 'キャラ2', () => mdrag(320, 60));
  await check('右のボタン', 'キャラ3', () => page.click('[data-act=next]'));
  await check('右のボタン', 'キャラ4', () => page.click('[data-act=next]'));
  logs.swipe.push(`- 最後のキャラで右のボタン：${(await page.locator('[data-act=next]').isDisabled()) ? '押せない（正しい）' : '押せる'}`);
  await check('最後のキャラで左へスワイプ（そのまま）', 'キャラ4', () => mdrag(320, 60));
  await check('左のボタン', 'キャラ3', () => page.click('[data-act=prev]'));
  await check('キーボードの←', 'キャラ2', () => page.keyboard.press('ArrowLeft'));
  for (const [act, expect] of [['decide', '決定:キャラ2'], ['back', '戻る']]) {
    await page.click(`[data-act=${act}]`);
    const got = await page.evaluate(() => document.body.dataset.last);
    logs.buttons.push(`- ${act === 'decide' ? '「このキャラに決定」' : '「戻る」'}：${got === expect ? '反応した' : '反応しない'}`);
    if (got !== expect) problems.push({ item: '1', where: '375px', detail: `${act} が反応しない` });
  }
  await ctx.close();
}

// 11 ズーム
const zoom = {};
{
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const scale = () => page.evaluate(() => window.visualViewport.scale);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  const pinch = async () => {
    const pts = (d) => [{ x: 180 - d, y: 300, id: 1 }, { x: 180 + d, y: 300, id: 2 }];
    await touch('touchStart', pts(20));
    for (let d = 25; d <= 150; d += 5) await touch('touchMove', pts(d));
    await touch('touchEnd', []);
    await page.waitForTimeout(400);
    return scale();
  };
  await page.setContent(`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><body>${'<p>ふつうのページ</p>'.repeat(40)}</body>`);
  zoom.control = await pinch();
  await page.goto(PAGE);
  const meta = await page.evaluate(() => document.querySelector('meta[name=viewport]').content);
  if (!/maximum-scale=1\b/.test(meta) || !/user-scalable=no/.test(meta)) problems.push({ item: '11', where: '375px', detail: `viewport の指定が足りない：${meta}` });
  const bad = await page.evaluate(() => [document.documentElement, document.body, ...document.querySelectorAll('button')].filter((e) => getComputedStyle(e).touchAction !== 'manipulation').length);
  if (bad) problems.push({ item: '11', where: '375px', detail: `touch-action: manipulation が付いていないもの ${bad}個` });
  zoom.pinch = await pinch();
  for (let i = 0; i < 20; i++) { await touch('touchStart', [{ x: 187, y: 300, id: 1 }]); await touch('touchEnd', []); await page.waitForTimeout(40); }
  await page.waitForTimeout(400);
  zoom.taps = await scale();
  await cdp.send('Input.synthesizeTapGesture', { x: 187, y: 300, tapCount: 2, gestureSourceType: 'touch' });
  await page.waitForTimeout(400);
  zoom.dbl = await scale();
  for (const k of ['pinch', 'taps', 'dbl']) if (zoom[k] !== 1) problems.push({ item: '11', where: '375px', detail: `${k} で ${zoom[k]} 倍に拡大した` });
  await ctx.close();
}
await browser.close();

const ITEMS = [
  ['1', '押しても反応しないボタン・リンクがない'], ['2', '文字・画像の見切れ、はみ出し、重なりがない'], ['3', '誤字脱字・表記揺れがない'],
  ['4', '文章の改行や折り返しが崩れていない'], ['5', 'スマホ幅（375px）とPC幅（1280px）の両方で表示が崩れない'], ['6', '再読み込みや画面移動で、保存したデータが消えない'],
  ['7', 'エラー表示や真っ白な画面が出ない'], ['8', '戻れない・行き止まりの画面がない'], ['9', '同じ情報を2か所に表示していない'],
  ['10', '途中で切れたイラストの切れ目が、画面の端についている'], ['11', 'ダブルタップ・連続タップで画面が拡大しない'],
];
const NUMS = [
  ['num-44', 'ボタンは高さ44px以上'], ['contrast', 'コントラスト比4.5:1以上（大きな見出しは3:1以上）'], ['num-16', '文字は16px以上'],
  ['anim', '普段の操作の動きは0.3秒以内'], ['press', '押せるものと押せないものを見た目で区別できる'],
  ['face', '（イラストを目立たせる要件）キャラの顔に名前・ボタンがかからない'],
];
const mark = (id) => (problems.some((p) => p.item === id) ? '不合格' : '合格');
const lines = [
  '# キャラ選択の改善案の検査結果', '', `日時：${new Date().toLocaleString('ja-JP')}　対象：UI改善案/キャラ選択_高級版.html（アプリには入れていない）`,
  '幅：375×812・430×932（写真）、1280×800・375×667（崩れの確認だけ）。場面：キャラ1〜4', '',
  '## アプリ共通の検査ルール（11項目）', '',
  ...ITEMS.map(([id, t]) => `- ${id}. ${t}：${id === '3' ? '目で確認（下の文字一覧）' : id === '6' ? '確認できなかった（見本の画面に保存するデータがない。前に選んだキャラを開く仕組みは ?c=番号 で確認用に用意）' : id === '8' ? `${mark(id)}（「戻る」があり、1人目・4人目からも反対側へ戻れる）` : mark(id)}`), '',
  '## ゲーム用UI自動化ルール（守る数値）', '', ...NUMS.map(([id, t]) => `- ${t}：${mark(id)}`),
  '- 判断に使う情報は飾りのない書体：対象なし（この画面に数字・マークはない）', '',
  '## スワイプと左右のボタン', '', ...logs.swipe, '', '## ボタン', '', ...logs.buttons, '',
  '## イラストの大きさ', '', ...logs.art, '',
  `## ズーム（ふつうのページは ${zoom.control} 倍）`, '', `- 2本指：${zoom.pinch} 倍／連続タップ20回：${zoom.taps} 倍／ダブルタップ：${zoom.dbl} 倍`, '',
  '## コントラスト（いちばん低かった値）', '', ...[...contrastLog].map(([k, v]) => `- ${k}：${v}:1`), '',
  `## 明朝の書体が読み込めたか：${fontsLoaded ? 'はい' : 'いいえ'}`, '',
  '## 不合格の内容', '', ...(problems.length ? problems.map((p) => `- [${p.item}] ${p.where}：${p.detail}`) : ['なし']), '',
  '## 画面に出ている文字の一覧', '', [...texts].join('／'), '',
];
fs.writeFileSync(path.join(DIR, '検査結果_キャラ選択.md'), lines.join('\n'));
console.log(`不合格 ${problems.length} 件`);
problems.slice(0, 40).forEach((p) => console.log(p.item, p.where, p.detail));
console.log(logs.swipe.join('\n'));
