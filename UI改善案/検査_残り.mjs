// タイトル・設定・最終結果の改善案の検査：Notion「アプリ共通の検査ルール」11項目と「ゲーム用UI自動化ルール」の守る数値
// 使い方：node UI改善案/検査_残り.mjs → UI改善案/画面/残り_*.png と UI改善案/検査結果_残り.md
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DIR = path.resolve('UI改善案');
const url = (f) => pathToFileURL(path.join(DIR, f)).href;
const PAGES = [
  ['タイトル', 'タイトル_高級版.html'],
  ['設定（上）', '設定_高級版.html'],
  ['設定（下）', '設定_高級版.html', 'bottom'],
  ['最終結果', '最終結果_高級版.html'],
];
const OUT = path.join(DIR, '画面');
const SIZES = [[375, 812, true], [430, 932, true], [1280, 800, false], [375, 667, false]];
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p));

const problems = [];
const logs = { buttons: [], save: [], art: [], zoom: [] };
const texts = new Set();
const contrastLog = new Map();

// 絵の端に人物がいるか（いればそこも切れ目）。ファイルを直接開いた画面では画素を読めないので別のページで調べる
async function measureEdges(browser, src) {
  const page = await browser.newPage();
  const type = src.endsWith('.webp') ? 'webp' : 'png';
  const data = `data:image/${type};base64,` + fs.readFileSync(path.join(DIR, src)).toString('base64');
  const r = await page.evaluate(async (data) => {
    const img = new Image(); img.src = data; await img.decode();
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const col = (cx) => { const d = x.getImageData(cx, 0, 1, c.height).data; for (let i = 3; i < d.length; i += 4) if (d[i] > 10) return true; return false; };
    const row = (cy) => { const d = x.getImageData(0, cy, c.width, 1).data; for (let i = 3; i < d.length; i += 4) if (d[i] > 10) return true; return false; };
    return { left: col(0), right: col(c.width - 1), top: row(0), bottom: row(c.height - 1) };
  }, data);
  await page.close();
  return r;
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
    const visible = (el) => { const b = el.getBoundingClientRect(); const cs = getComputedStyle(el); return b.width > 0 && b.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
    // スクロールする箱の外に隠れた部分は数えない
    const clipRect = (el) => {
      const b = el.getBoundingClientRect(); let t = b.top, bt = b.bottom, l = b.left, rt = b.right;
      for (let p = el.parentElement; p; p = p.parentElement) {
        const o = getComputedStyle(p).overflowY;
        if (o === 'auto' || o === 'scroll' || o === 'hidden') { const pr = p.getBoundingClientRect(); t = Math.max(t, pr.top); bt = Math.min(bt, pr.bottom); l = Math.max(l, pr.left); rt = Math.min(rt, pr.right); }
      }
      return { top: t, bottom: bt, left: l, right: rt, empty: bt - t <= 1 || rt - l <= 1 };
    };
    const all = [...document.querySelectorAll('#screen *')].filter((e) => visible(e) && !clipRect(e).empty);
    const leaves = all.filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
    if (document.documentElement.scrollWidth > W + 1) out.push(['2', `横にはみ出し（${document.documentElement.scrollWidth}px）`]);
    for (const el of leaves) {
      const cs = getComputedStyle(el), b = el.getBoundingClientRect();
      if (parseFloat(cs.fontSize) < 16) out.push(['num-16', `文字が16px未満（${cs.fontSize}）：${label(el)}`]);
      if (el.scrollWidth > el.clientWidth + 1 && cs.overflow !== 'visible' && cs.display !== 'inline') out.push(['2', `文字の見切れ：${label(el)}`]);
      if (b.right > Math.min(W, screen.right) + 1 || b.left < Math.max(0, screen.left) - 1) out.push(['2', `画面の横にはみ出し：${label(el)}`]);
      const c = clipRect(el);
      if (c.bottom > H + 1 || (b.bottom > H + 1 && !el.closest('.scroll'))) out.push(['2', `画面の下にはみ出し：${label(el)}`]);
      // 4 折り返し：1行で出すはずの文字（説明文・同点の説明・まとめて書いた行以外）が2行以上
      // .name は「あなた」の下に使ったキャラ名を小さく出す2行の作り。説明文・同点の説明・各回の順位は折り返してよい
      const multiOk = el.matches('.lead, .rule-help, .tie, .rounds, .name');
      if (!multiOk && lineCount(el) > 1) out.push(['4', `2行に折り返している：${label(el)}`]);
      // 説明文の折り返しは、言葉の途中で切れていないか（<wbr> か空白の所だけ）は目で見る
    }
    for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
      const a = leaves[i], c = leaves[j];
      if (a.contains(c) || c.contains(a)) continue;
      const p = clipRect(a), q = clipRect(c);
      if (Math.min(p.right, q.right) - Math.max(p.left, q.left) > 2 && Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top) > 2) out.push(['2', `文字の重なり：${label(a)} と ${label(c)}`]);
    }
    const btns = all.filter((e) => e.tagName === 'BUTTON');
    for (let i = 0; i < btns.length; i++) for (let j = i + 1; j < btns.length; j++) {
      const p = clipRect(btns[i]), q = clipRect(btns[j]);
      if (Math.min(p.right, q.right) - Math.max(p.left, q.left) > 0 && Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top) > 0) out.push(['2', `ボタンの重なり：${label(btns[i])} と ${label(btns[j])}`]);
    }
    // 下の帯に隠れて押せないボタンがないか（スクロールの中のボタンは、帯の上で切れていればよい）
    for (const img of document.querySelectorAll('img')) if (!img.complete || img.naturalWidth === 0) out.push(['7', `絵が表示されない：${img.getAttribute('src')}`]);
    // 10・顔：data-head のある絵（タイトル）
    let artInfo = null;
    const art = document.querySelector('img[data-head]');
    if (art) {
      const a = art.getBoundingClientRect();
      const bottom = Math.min(screen.bottom, H);
      if (edges.bottom && Math.abs(a.bottom - bottom) > 1) out.push(['10', `イラストの切れ目が下端から ${Math.round(bottom - a.bottom)}px 浮いている`]);
      if (edges.left && a.left > screen.left + 1) out.push(['10', 'イラストの左の切れ目が画面の中']);
      if (edges.right && a.right < screen.right - 1) out.push(['10', 'イラストの右の切れ目が画面の中']);
      const [hx1, hy1, hx2, hy2] = art.dataset.head.split(',').map(Number);
      const head = { left: a.left + hx1 * a.width, right: a.left + hx2 * a.width, top: a.top + hy1 * a.height, bottom: a.top + hy2 * a.height };
      for (const el of document.querySelectorAll('button, .logo h1, .lead, .suits')) {
        if (!visible(el)) continue;
        const b = el.getBoundingClientRect();
        if (Math.min(b.right, head.right) - Math.max(b.left, head.left) > 0 && Math.min(b.bottom, head.bottom) - Math.max(b.top, head.top) > 0) out.push(['face', `顔（頭の範囲）に重なっている：${label(el)}`]);
      }
      if (head.left < screen.left || head.right > screen.right) out.push(['face', '頭が画面の左右で切れている']);
      artInfo = { headH: Math.round(head.bottom - head.top), share: Math.round(((Math.min(a.bottom, H) - Math.max(a.top, 0)) / H) * 100) };
    }
    // 守る数値：ボタン44px以上
    for (const b of btns) { const r = b.getBoundingClientRect(); if (r.height < 43.5 || r.width < 43.5) out.push(['num-44', `ボタンが44px未満（${Math.round(r.width)}×${Math.round(r.height)}）：${label(b)}`]); }
    // 守る数値：アイコン56px以上
    for (const a of all.filter((e) => e.classList.contains('avatar'))) { const b = a.getBoundingClientRect(); if (Math.min(b.width, b.height) < 55.5) out.push(['icon', `アイコンが56px未満：${label(a)}`]); }
    // 守る数値：コントラスト
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
    const dur = (v) => Math.max(...v.split(',').map((x) => parseFloat(x) * (x.includes('ms') ? 0.001 : 1)));
    for (const el of all) {
      const cs = getComputedStyle(el);
      const t = Math.max(dur(cs.transitionDuration), cs.animationName !== 'none' ? dur(cs.animationDuration) : 0);
      if (t > 0.3001) out.push(['anim', `動きが${t}秒：${label(el)}`]);
    }
    for (const b of btns.filter((e) => e.disabled)) { const cs = getComputedStyle(b); if (parseFloat(cs.opacity) >= 1 && cs.filter === 'none') out.push(['press', `押せないのに押せるものと同じ見た目：${label(b)}`]); }
    // 9 同じ情報を2か所に：同じ文字の行が2回出ていないか（ルールの「オン」「オフ」、区切りの「／」、同点の点数は除く）
    const own = leaves.map((e) => [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join('')).filter((t) => t && !/^(オン|オフ)$/.test(t) && !/^[／\s]+$/.test(t) && !/回戦 /.test(t) && !/^\d+点$/.test(t));
    const dup = own.filter((t, i) => own.indexOf(t) !== i);
    if (dup.length) out.push(['9', `同じ文字が2か所：${[...new Set(dup)].join('、')}`]);
    return { out, texts: leaves.map((e) => e.textContent.trim()), minRatios, artInfo, fontsLoaded: document.fonts.check('800 16px "Shippori Mincho B1"') };
  }, edges);
  r.out.forEach(([item, detail]) => problems.push({ item, where, detail }));
  r.texts.forEach((t) => texts.add(t));
  r.minRatios.forEach(([l, v, need]) => { const k = `${l}（必要${need}）`; contrastLog.set(k, Math.min(contrastLog.get(k) ?? 99, v)); });
  return r;
}

const browser = await chromium.launch({ executablePath: exe });
const EDGES = await measureEdges(browser, '素材/お試し_キャラ1.webp');
let fontsLoaded = true;
fs.mkdirSync(OUT, { recursive: true });

for (const [w, h, photo] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  for (const [name, file, mode] of PAGES) {
    await page.goto(url(file));
    await page.evaluate(() => { try { localStorage.clear(); } catch {} });
    await page.reload();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    if (mode === 'bottom') { await page.evaluate(() => { const s = document.querySelector('.scroll'); s.scrollTop = s.scrollHeight; }); await page.waitForTimeout(100); }
    const where = `${w}×${h} ${name}`;
    const r = await audit(page, where, EDGES);
    fontsLoaded &&= r.fontsLoaded;
    if (r.artInfo) logs.art.push(`- ${where}：絵が画面の高さの ${r.artInfo.share}%、頭（髪のてっぺん〜あごの下の髪）${r.artInfo.headH}px`);
    if (photo) await page.screenshot({ path: path.join(OUT, `残り_${w}_${name}.png`) });
    else if (!mode) await page.screenshot({ path: path.join(OUT, `残り_確認_${w}x${h}_${name}.png`) });
  }
  if (errors.length) problems.push({ item: '7', where: `${w}px`, detail: errors.join(' / ') });
  await ctx.close();
}

// 1・8 すべてのボタンを押して反応を確かめる。6 設定は再読み込みしても消えない
{
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await ctx.newPage();
  const snap = () => page.evaluate(() => document.getElementById('screen').innerHTML + (document.body.dataset.last ?? ''));
  const press = async (sel, name, file) => {
    await page.evaluate(() => { delete document.body.dataset.last; });
    const before = await snap();
    await page.locator(sel).scrollIntoViewIfNeeded();
    await page.click(sel);
    await page.waitForTimeout(80);
    const ok = before !== (await snap());
    logs.buttons.push(`- ${file}「${name}」：${ok ? '反応した' : '反応しない'}`);
    if (!ok) problems.push({ item: '1', where: file, detail: `押しても反応しない：${name}` });
  };
  await page.goto(url('タイトル_高級版.html'));
  await press('[data-act=start]', 'はじめる', 'タイトル');
  await page.goto(url('設定_高級版.html'));
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
  await page.reload();
  await press('[data-act=back]', '戻る', '設定');
  for (const [k, n] of [['easy', 'やさしい'], ['strong', 'つよい'], ['normal', 'ふつう']]) await press(`[data-act=level][data-arg=${k}]`, n, '設定');
  const ruleKeys = await page.locator('[data-act=rule]').evaluateAll((els) => els.map((e) => [e.dataset.arg, e.getAttribute('aria-label')]));
  for (const [k, n] of ruleKeys) await press(`[data-act=rule][data-arg=${k}]`, `${n}（1回目）`, '設定');
  await press('[data-act=reset]', '初期設定に戻す', '設定');
  await press('[data-act=next]', '次へ（キャラ選択）', '設定');
  // 6：変えて再読み込み
  await page.click('[data-act=level][data-arg=strong]');
  await page.click('[data-act=rule][data-arg=eightCut]');
  await page.click('[data-act=rule][data-arg=miyakoOchi]');
  await page.reload();
  const kept = await page.evaluate(() => ({
    level: document.querySelector('[data-act=level][aria-pressed=true]').dataset.arg,
    eight: document.querySelector('[data-act=rule][data-arg=eightCut]').getAttribute('aria-pressed'),
    miyako: document.querySelector('[data-act=rule][data-arg=miyakoOchi]').getAttribute('aria-pressed'),
  }));
  const ok6 = kept.level === 'strong' && kept.eight === 'false' && kept.miyako === 'true';
  logs.save.push(`- 強さ「つよい」・8切りオフ・都落ちオンにして再読み込み → 強さ ${kept.level}・8切り ${kept.eight === 'true' ? 'オン' : 'オフ'}・都落ち ${kept.miyako === 'true' ? 'オン' : 'オフ'}（${ok6 ? '消えなかった' : '消えた'}）`);
  if (!ok6) problems.push({ item: '6', where: '設定', detail: '再読み込みで設定が消えた' });
  await page.click('[data-act=reset]');
  await page.reload();
  const reset = await page.evaluate(() => document.querySelector('[data-act=level][aria-pressed=true]').dataset.arg === 'normal' && document.querySelector('[data-act=rule][data-arg=miyakoOchi]').getAttribute('aria-pressed') === 'false' && document.querySelector('[data-act=rule][data-arg=eightCut]').getAttribute('aria-pressed') === 'true');
  logs.save.push(`- 「初期設定に戻す」のあと再読み込み → ${reset ? '初期設定のまま（ふつう・都落ちだけオフ）' : '初期設定になっていない'}`);
  if (!reset) problems.push({ item: '6', where: '設定', detail: '初期設定に戻したあと再読み込みで戻らない' });
  await page.goto(url('最終結果_高級版.html'));
  await press('[data-act=toTitle]', 'タイトルへ', '最終結果');
  await press('[data-act=again]', 'もう一度あそぶ', '最終結果');
  const tie = await page.locator('#tie').isVisible();
  logs.buttons.push(`- 最終結果：同点（5点が2人）の説明 → ${tie ? '出ている' : '出ていない'}`);
  if (!tie) problems.push({ item: '9', where: '最終結果', detail: '同点なのに説明が出ない' });
  await ctx.close();
}

// 11 ズーム（タイトル・設定）
for (const [name, file] of [['タイトル', 'タイトル_高級版.html'], ['設定', '設定_高級版.html'], ['最終結果', '最終結果_高級版.html']]) {
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
  await page.goto(url(file));
  const meta = await page.evaluate(() => document.querySelector('meta[name=viewport]').content);
  if (!/maximum-scale=1\b/.test(meta) || !/user-scalable=no/.test(meta)) problems.push({ item: '11', where: name, detail: `viewport の指定が足りない：${meta}` });
  const bad = await page.evaluate(() => [document.documentElement, document.body, ...document.querySelectorAll('button')].filter((e) => getComputedStyle(e).touchAction !== 'manipulation').length);
  if (bad) problems.push({ item: '11', where: name, detail: `touch-action: manipulation が付いていないもの ${bad}個` });
  const p = await pinch();
  for (let i = 0; i < 20; i++) { await touch('touchStart', [{ x: 187, y: 400, id: 1 }]); await touch('touchEnd', []); await page.waitForTimeout(40); }
  await page.waitForTimeout(400);
  const t = await scale();
  await cdp.send('Input.synthesizeTapGesture', { x: 187, y: 400, tapCount: 2, gestureSourceType: 'touch' });
  await page.waitForTimeout(400);
  const d = await scale();
  logs.zoom.push(`- ${name}：2本指 ${p} 倍／連続タップ ${t} 倍／ダブルタップ ${d} 倍`);
  if (p !== 1 || t !== 1 || d !== 1) problems.push({ item: '11', where: name, detail: `拡大した（${p}・${t}・${d}）` });
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
  ['anim', '普段の操作の動きは0.3秒以内'], ['press', '押せるものと押せないものを見た目で区別できる'], ['icon', 'アイコンは直径56px以上'],
  ['face', '（イラストを目立たせる要件）タイトルのキャラの顔に文字・ボタンがかからない'],
];
const mark = (id) => (problems.some((p) => p.item === id) ? '不合格' : '合格');
const lines = [
  '# タイトル・設定・最終結果の改善案の検査結果', '', `日時：${new Date().toLocaleString('ja-JP')}　対象：UI改善案/タイトル_高級版.html・設定_高級版.html・最終結果_高級版.html（アプリには入れていない）`,
  '幅：375×812・430×932（写真）、1280×800・375×667（崩れの確認だけ）', '',
  '## アプリ共通の検査ルール（11項目）', '',
  ...ITEMS.map(([id, t]) => `- ${id}. ${t}：${id === '3' ? '目で確認（下の文字一覧）' : id === '8' ? `${mark(id)}（設定に「戻る」、最終結果に「タイトルへ」「もう一度あそぶ」。画面どうしのつながりはアプリに入れるときに確認）` : mark(id)}`), '',
  '## ゲーム用UI自動化ルール（守る数値）', '', ...NUMS.map(([id, t]) => `- ${t}：${mark(id)}`),
  '- 判断に使う情報は飾りのない書体：最終結果の点・各回の順位はゴシック（名前・順位の「1位」は見出しとして明朝）', '',
  '## 保存（設定）', '', ...logs.save, '', '## ボタン', '', ...logs.buttons, '', '## タイトルの絵', '', ...logs.art, '', '## ズーム', '', ...logs.zoom, '',
  '## コントラスト（いちばん低かった値）', '', ...[...contrastLog].map(([k, v]) => `- ${k}：${v}:1`), '',
  `## 明朝の書体が読み込めたか：${fontsLoaded ? 'はい' : 'いいえ'}`, '',
  '## 不合格の内容', '', ...(problems.length ? problems.map((p) => `- [${p.item}] ${p.where}：${p.detail}`) : ['なし']), '',
  '## 画面に出ている文字の一覧', '', [...texts].join('／'), '',
];
fs.writeFileSync(path.join(DIR, '検査結果_残り.md'), lines.join('\n'));
console.log(`不合格 ${problems.length} 件`);
problems.slice(0, 50).forEach((p) => console.log(p.item, p.where, p.detail));
