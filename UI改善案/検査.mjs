// 改善案の検査：Notion「アプリ共通の検査ルール」11項目と「ゲーム用UI自動化ルール」の守る数値を機械で確かめる
// 使い方：node UI改善案/検査.mjs → UI改善案/画面/*.png と UI改善案/検査結果.md
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DIR = path.resolve('UI改善案');
const PAGE = pathToFileURL(path.join(DIR, '対戦画面_高級版.html')).href;
const OUT = path.join(DIR, '画面');
// 写真はユーザー指定の375px・430px。1280px（共通ルール5）と、背の低い375×667は崩れの確認だけ
const SIZES = [[375, 812, true], [430, 932, true], [1280, 800, false], [375, 667, false]];
const STATES = [['', 'あなたの番'], ['cpu', 'キャラ3の番'], ['result', '回の結果'], ['bomber', '12ボンバー'], ['seven', '7渡し'], ['ten', '10捨て'], ['exchange', 'カード交換']];
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p));

const problems = []; // { item, where, detail }
const artLog = [];
const fixedLog = [];
// 5枚に減った場面の写真（空きが下の段に出ることを見る）
async function shotN(page, w, h, photo) {
  if (!photo) return;
  await page.evaluate(() => { st.hand = initial().hand.slice(0, 5); st.sel = new Set([3]); st.table = [st.table[0]]; render(); });
  await page.screenshot({ path: path.join(OUT, `${w}_手札5枚.png`) });
}
const notes = [];
const texts = new Set();

// 絵の左右の端の列に、透明でない画素があるか（あればそこも切れ目）。ファイルを直接開いた画面では画素を読めないので、別のページで1回だけ調べる
async function measureEdges(browser, html) {
  const src = html.match(/class="me-art"[^>]*src="([^"]+)"/)[1];
  const page = await browser.newPage();
  const data = 'data:image/webp;base64,' + fs.readFileSync(path.join(DIR, src)).toString('base64');
  const r = await page.evaluate(async (data) => {
    const img = new Image(); img.src = data; await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    const col = (cx) => { const d = x.getImageData(cx, 0, 1, c.height).data; for (let i = 3; i < d.length; i += 4) if (d[i] > 10) return true; return false; };
    return { left: col(0), right: col(c.width - 1) };
  }, data);
  await page.close();
  return r;
}
let EDGES;
const setEdges = (page) => page.evaluate((e) => { window.__artEdges = e; }, EDGES);

async function audit(page, where) {
  const r = await page.evaluate(() => {
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
    const layer = document.querySelector('.modal-back:not([hidden])') || document.querySelector('#screen');
    const all = [...layer.querySelectorAll('*')].filter(visible);
    const leaves = all.filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
    const own = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join('');

    // 2・5 はみ出し・見切れ・16px未満
    if (document.documentElement.scrollWidth > W + 1) out.push(['2', `横にはみ出し（${document.documentElement.scrollWidth}px）`]);
    for (const el of leaves) {
      const cs = getComputedStyle(el), b = el.getBoundingClientRect();
      if (parseFloat(cs.fontSize) < 16) out.push(['num-16', `文字が16px未満（${cs.fontSize}）：${label(el)}`]);
      if (el.scrollWidth > el.clientWidth + 1 && cs.overflow !== 'visible' && cs.display !== 'inline') out.push(['2', `文字の見切れ：${label(el)}`]);
      if (b.right > Math.min(W, screen.right) + 1 || b.left < Math.max(0, screen.left) - 1 || b.bottom > H + 1 || b.top < -1) out.push(['2', `画面の外にはみ出し：${label(el)}`]);
      // 4 折り返し：1行で出すはずの文字が2行以上になっていないか
      if (el.closest('.modal p') == null && lineCount(el) > 1) out.push(['4', `2行に折り返している：${label(el)}`]);
    }
    // 2 重なり：文字どうし（同じカードの中は除く）
    for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
      const a = leaves[i], c = leaves[j];
      if (a.contains(c) || c.contains(a) || (a.closest('.card') && a.closest('.card') === c.closest('.card'))) continue;
      if (!layer.contains(a) || !layer.contains(c)) continue;
      const p = a.getBoundingClientRect(), q = c.getBoundingClientRect();
      if (Math.min(p.right, q.right) - Math.max(p.left, q.left) > 2 && Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top) > 2) out.push(['2', `文字の重なり：${label(a)} と ${label(c)}`]);
    }
    // 2 カードどうしの重なり（選んで持ち上げたカードを含む）
    const cards = [...document.querySelectorAll('.card')].map((e) => e.getBoundingClientRect());
    for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
      const p = cards[i], q = cards[j];
      if (Math.min(p.right, q.right) - Math.max(p.left, q.left) > 0.5 && Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top) > 0.5) out.push(['2', `カードが重なっている（${i}と${j}）`]);
    }
    // 7 絵が出ているか
    for (const img of document.querySelectorAll('img')) if (!img.complete || img.naturalWidth === 0) out.push(['7', `絵が表示されない：${img.getAttribute('src')}`]);
    // 10 下が切れた絵の切れ目は画面の下端に。左右は画面の中で切れていない（はみ出た分は画面の端で切れる）
    const art = document.querySelector('.me-art').getBoundingClientRect();
    const bottom = Math.min(screen.bottom, H);
    if (Math.abs(art.bottom - bottom) > 1) out.push(['10', `イラストの切れ目が下端から ${Math.round(bottom - art.bottom)}px 浮いている`]);
    // 左右：絵の左右の端に人物が届いていれば、そこも切れ目。画面の端より内側に出ていたら不合格
    const edge = window.__artEdges;
    if (edge.left && art.left > screen.left + 1) out.push(['10', 'イラストの左の切れ目が画面の中に見えている']);
    if (edge.right && art.right < screen.right - 1) out.push(['10', 'イラストの右の切れ目が画面の中に見えている']);
    // 顔に手札がかからない：絵の中の頭の範囲（data-head）に、カード・ボタン・「あなたの番」・盤が重ならない。頭が画面の左右で切れていない
    const ai = document.querySelector('.me-art');
    const [hx1, hy1, hx2, hy2] = ai.dataset.head.split(',').map(Number);
    const head = { left: art.left + hx1 * art.width, right: art.left + hx2 * art.width, top: art.top + hy1 * art.height, bottom: art.top + hy2 * art.height };
    for (const el of document.querySelectorAll('.card, button, .me-label, .board, .gbar')) {
      if (!visible(el) || el.closest('.modal-back')) continue;
      const b = el.getBoundingClientRect();
      if (Math.min(b.right, head.right) - Math.max(b.left, head.left) > 0 && Math.min(b.bottom, head.bottom) - Math.max(b.top, head.top) > 0) out.push(['face', `顔（頭の範囲）に重なっている：${label(el)}`]);
    }
    if (head.left < screen.left || head.right > screen.right) out.push(['face', '頭が画面の左右で切れている']);
    const artInfo = { h: Math.round(art.height), headH: Math.round(head.bottom - head.top), share: +(art.height / H).toFixed(2) };
    // 9 同じ情報を2か所に：場に名前・文章を出さない。パスは人の表示の側だけ
    for (const el of document.querySelectorAll('.table *')) if (!el.closest('.card') && own(el)) out.push(['9', `場に文字：「${own(el)}」`]);
    for (const el of document.querySelectorAll('*')) if (own(el) === 'パス' && !el.closest('.opp, .me-label, .actions')) out.push(['9', 'パスが人の表示以外に出ている']);
    // 守る数値：ボタン44px以上
    for (const b of all.filter((e) => e.tagName === 'BUTTON' && !e.classList.contains('card'))) {
      const h = b.getBoundingClientRect().height;
      if (h < 43.5) out.push(['num-44', `ボタンが44px未満（${h.toFixed(1)}px）：${label(b)}`]);
    }
    // 守る数値：アイコン56px以上
    for (const a of all.filter((e) => e.classList.contains('avatar'))) {
      const b = a.getBoundingClientRect();
      if (Math.min(b.width, b.height) < 55.5) out.push(['icon', `アイコンが56px未満（${b.width}px）：${label(a)}`]);
    }
    // 守る数値：コントラスト。金の光沢文字は、グラデーションのいちばん暗い色で測る
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
      if (el.closest(':disabled') || !layer.contains(el)) continue;
      const cs = getComputedStyle(el);
      const bg = bgOf(el);
      let fgs;
      const goldEl = el.closest('.gold-text');
      if (goldEl) {
        // 光沢の文字：グラデーションの色（rgb() と #hex）をすべて取り出す
        const g = getComputedStyle(goldEl).backgroundImage;
        fgs = [...g.matchAll(/rgba?\([^)]+\)/g)].map((m) => parse(m[0])).concat([...g.matchAll(/#[0-9a-f]{6}/gi)].map((m) => hex(m[0])));
      } else {
        const fg = parse(cs.color); if (!fg) continue; fgs = [fg];
      }
      // ボタンの塗りがグラデーションのとき（出す）は、塗りの色をすべて背景の候補にする
      const btn = [el.closest('button')].find((b) => b && /gradient/.test(getComputedStyle(b).backgroundImage));
      const bgs = btn ? [...getComputedStyle(btn).backgroundImage.matchAll(/rgba?\([^)]+\)/g)].map((m) => parse(m[0]).slice(0, 3)) : [bg];
      let worst = 99;
      for (const fg of fgs) for (const b of bgs) {
        const fc = [0, 1, 2].map((i) => fg[i] * fg[3] + b[i] * (1 - fg[3]));
        worst = Math.min(worst, ratio(fc, b));
      }
      const fs = parseFloat(cs.fontSize);
      const need = fs >= 24 || (fs >= 18.66 && parseInt(cs.fontWeight) >= 700) ? 3 : 4.5;
      minRatios.push([label(el), +worst.toFixed(2), need]);
      if (worst < need - 0.01) out.push(['contrast', `コントラスト ${worst.toFixed(2)}:1（必要 ${need}:1）：${label(el)}`]);
    }
    // 守る数値：普段の操作の動きは0.3秒以内
    const dur = (v) => Math.max(...v.split(',').map((x) => parseFloat(x) * (x.includes('ms') ? 0.001 : 1)));
    for (const el of all) {
      const cs = getComputedStyle(el);
      const t = Math.max(dur(cs.transitionDuration), cs.animationName !== 'none' ? dur(cs.animationDuration) : 0);
      if (t > 0.3001) out.push(['anim', `動きが${t}秒：${label(el)}`]);
    }
    // 守る数値：押せないものは見た目で区別できる
    for (const b of all.filter((e) => e.matches('button:disabled') && !e.closest('.table'))) {
      const cs = getComputedStyle(b);
      if (parseFloat(cs.opacity) >= 1 && cs.filter === 'none') out.push(['press', `押せないのに押せるものと同じ見た目：${label(b)}`]);
    }
    // 守る数値：判断に使う情報（カードの数字・マーク・枚数）は飾りのない書体で16px以上・斜めや変形なし
    for (const el of document.querySelectorAll('.c-rank, .c-suit, .opp-count')) {
      const cs = getComputedStyle(el);
      if (/Mincho|serif/i.test(cs.fontFamily.split(',')[0])) out.push(['font', `判断に使う情報に飾りの書体：${label(el)}`]);
      if (cs.fontStyle !== 'normal' || cs.transform !== 'none') out.push(['font', `判断に使う情報が斜め・変形：${label(el)}`]);
    }
    const texts = leaves.filter((e) => layer.contains(e)).map((e) => e.textContent.trim());
    const fonts = [...new Set(leaves.map((e) => getComputedStyle(e).fontFamily.split(',')[0].trim()))];
    return { out, texts, minRatios, fonts, artInfo, fontsLoaded: document.fonts.check('800 16px "Shippori Mincho B1"') };
  });
  r.out.forEach(([item, detail]) => problems.push({ item, where, detail }));
  r.texts.forEach((t) => texts.add(t));
  return r;
}

async function shotsAndAudit(browser) {
  const contrastLog = new Map();
  let fontsLoaded = true;
  for (const [w, h, photo] of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    for (const [s, name] of STATES) {
      await page.goto(PAGE + (s ? `?s=${s}` : ''));
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(300);
      await setEdges(page);
      const where = `${w}×${h} ${name}`;
      const r = await audit(page, where);
      fontsLoaded &&= r.fontsLoaded;
      artLog.push(`- ${where}：絵の高さ ${r.artInfo.h}px（画面の高さの${Math.round(r.artInfo.share * 100)}%）、頭（髪のてっぺん〜あごの下の髪）${r.artInfo.headH}px`);
      r.minRatios.forEach(([l, v, need]) => { const k = l.replace(/「.*$/, '') + `（必要${need}）`; contrastLog.set(k, Math.min(contrastLog.get(k) ?? 99, v)); });
      if (photo) await page.screenshot({ path: path.join(OUT, `${w}_${name}.png`) });
      else if (s === '') await page.screenshot({ path: path.join(OUT, `確認_${w}x${h}.png`) });
    }
    // 「あなたの番」と上の段のカードの位置が、手札の枚数で動かない。上の段は列の数ぶん埋まり、空きは下の段に出る
    await page.goto(PAGE);
    await page.evaluate(() => document.fonts.ready);
    const pos = [];
    for (const n of [14, 12, 5, 1]) {
      pos.push(await page.evaluate((n) => {
        st.hand = initial().hand.slice(0, n); st.sel = new Set(); render();
        const hand = document.getElementById('hand');
        const cols = Number(getComputedStyle(hand).getPropertyValue('--cols'));
        const cards = [...hand.querySelectorAll('.card')].map((c) => c.getBoundingClientRect());
        const firstRow = cards.filter((r) => Math.abs(r.top - cards[0].top) < 1).length;
        return { n, cols, label: document.getElementById('meLabel').getBoundingClientRect().top, top: cards[0].top, firstRow };
      }, n));
    }
    const base = pos[0];
    for (const p of pos) {
      if (Math.abs(p.label - base.label) > 0.5) problems.push({ item: 'fixed', where: `${w}×${h} ${p.n}枚`, detail: `「あなたの番」が ${Math.round(p.label - base.label)}px 動いた` });
      if (Math.abs(p.top - base.top) > 0.5) problems.push({ item: 'fixed', where: `${w}×${h} ${p.n}枚`, detail: `上の段が ${Math.round(p.top - base.top)}px 動いた` });
      if (p.firstRow !== Math.min(p.n, p.cols)) problems.push({ item: 'fixed', where: `${w}×${h} ${p.n}枚`, detail: `上の段が ${p.firstRow}枚（${Math.min(p.n, p.cols)}枚のはず）` });
    }
    fixedLog.push(`- ${w}×${h}：` + pos.map((p) => `${p.n}枚→「あなたの番」上端${Math.round(p.label)}px・上の段${Math.round(p.top)}px・上の段${p.firstRow}枚`).join('／'));
    await shotN(page, w, h, photo);
    // やめる確認の小窓
    await page.goto(PAGE);
    await page.click('[data-act=quit]');
    await page.waitForTimeout(150);
    await setEdges(page);
    await audit(page, `${w}×${h} やめる確認`);
    if (photo) await page.screenshot({ path: path.join(OUT, `${w}_やめる確認.png`) });
    if (errors.length) problems.push({ item: '7', where: `${w}px`, detail: errors.join(' / ') });
    await ctx.close();
  }
  return { contrastLog, fontsLoaded };
}

// 1・8 すべてのボタンを押して反応を確かめる。小窓から戻れるか
async function buttons(browser) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await ctx.newPage();
  const res = [];
  const snap = () => page.evaluate(() => document.getElementById('screen').innerHTML + document.getElementById('quit').hidden);
  const press = async (sel, name) => {
    const before = await snap();
    await page.click(sel);
    await page.waitForTimeout(80);
    const ok = before !== (await snap());
    res.push([name, ok]);
    if (!ok) problems.push({ item: '1', where: '375px', detail: `押しても反応しない：${name}` });
  };
  await page.goto(PAGE);
  await press('.hand .card >> nth=0', '手札のカード（選ぶ）');
  await press('.hand .card >> nth=0', '手札のカード（選び直す）');
  await press('[data-act=play]', '出す');
  await page.goto(PAGE);
  await press('[data-act=pass]', 'パス');
  await press('[data-act=quit]', 'やめる');
  await press('[data-act=quitNo]', '続ける（小窓を閉じる）');
  await press('[data-act=quit]', 'やめる（もう一度）');
  await press('[data-act=quitYes]', 'やめる（決定）');
  await page.goto(PAGE + '?s=result');
  await press('[data-act=nextRound]', '第2回戦へ');
  await page.goto(PAGE + '?s=bomber');
  await press('.rank-btn >> nth=5', '12ボンバーの数字（選び直す）');
  await press('.rank-btn >> nth=0', '12ボンバーの数字（選ぶ）');
  await press('[data-act=bomberOk]', '12ボンバーの決定');
  // 7渡し・10捨て・カード交換：枚数が合うまでボタンは押せない。合ったら押せる
  for (const [sc, name] of [['seven', '7渡し'], ['ten', '10捨て'], ['exchange', 'カード交換']]) {
    await page.goto(PAGE + `?s=${sc}`);
    if (sc === 'exchange') await press('.hand .card >> nth=1', `${name}：カードを選び直す`);
    const before = await page.locator('[data-act=give]').isDisabled();
    res.push([`${name}：枚数が合わないときのボタン`, before, '押せない（正しい）', '押せてしまう']);
    if (!before) problems.push({ item: '1', where: '375px', detail: `${name}：枚数が合わないのにボタンが押せる` });
    await press('.hand .card >> nth=2', `${name}：カードを選ぶ`);
    await press('[data-act=give]', `${name}：${await page.locator('[data-act=give]').textContent()}`);
  }
  // 選んだ枚数が場と合わないときは「出す」を押せない
  await page.goto(PAGE);
  await page.click('.hand .card >> nth=7');
  const disabled = await page.locator('[data-act=play]').isDisabled();
  res.push(['場と枚数が合わないときの「出す」', disabled, '押せない（正しい）', '押せてしまう']);
  if (!disabled) problems.push({ item: '1', where: '375px', detail: '場と枚数が合わないのに「出す」が押せる' });
  await ctx.close();
  return res;
}

// 11 ズーム：viewport の指定、touch-action、2本指・連続タップ・ダブルタップ
async function zoom(browser) {
  const where = '375px ズーム';
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
  const r = {};
  await page.setContent(`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><body>${'<p>ふつうのページ</p>'.repeat(40)}</body>`);
  r.control = await pinch();
  await page.goto(PAGE);
  r.meta = await page.evaluate(() => document.querySelector('meta[name=viewport]').content);
  if (!/maximum-scale=1\b/.test(r.meta) || !/user-scalable=no/.test(r.meta)) problems.push({ item: '11', where, detail: `viewport の指定が足りない：${r.meta}` });
  const bad = await page.evaluate(() => [document.documentElement, document.body, ...document.querySelectorAll('button')].filter((e) => getComputedStyle(e).touchAction !== 'manipulation').length);
  if (bad) problems.push({ item: '11', where, detail: `touch-action: manipulation が付いていないもの ${bad}個` });
  r.pinch = await pinch();
  const pos = await page.locator('.hand .card').evaluateAll((els) => els.map((e) => { const b = e.getBoundingClientRect(); return [b.left + 10, b.top + 20]; }));
  for (let i = 0; i < 20; i++) { const [x, y] = pos[i % 3]; await touch('touchStart', [{ x, y, id: 1 }]); await touch('touchEnd', []); await page.waitForTimeout(40); }
  await page.waitForTimeout(400);
  r.taps = await scale();
  await cdp.send('Input.synthesizeTapGesture', { x: pos[0][0], y: pos[0][1], tapCount: 2, gestureSourceType: 'touch' });
  await page.waitForTimeout(400);
  r.dbl = await scale();
  for (const k of ['pinch', 'taps', 'dbl']) if (r[k] !== 1) problems.push({ item: '11', where, detail: `${k} で ${r[k]} 倍に拡大した` });
  await ctx.close();
  return r;
}

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: exe });
EDGES = await measureEdges(browser, fs.readFileSync(path.join(DIR, '対戦画面_高級版.html'), 'utf8'));
notes.push(`絵の左右の端に人物があるか：左 ${EDGES.left ? 'ある' : 'ない'}・右 ${EDGES.right ? 'ある' : 'ない'}${EDGES.left || EDGES.right ? '' : '（切れ目は下だけ）'}`);
const { contrastLog, fontsLoaded } = await shotsAndAudit(browser);
const btn = await buttons(browser);
const zm = await zoom(browser);
await browser.close();

const ITEMS = [
  ['1', '押しても反応しないボタン・リンクがない'], ['2', '文字・画像の見切れ、はみ出し、重なりがない'], ['3', '誤字脱字・表記揺れがない'],
  ['4', '文章の改行や折り返しが崩れていない'], ['5', 'スマホ幅（375px）とPC幅（1280px）の両方で表示が崩れない'], ['6', '再読み込みや画面移動で、保存したデータが消えない'],
  ['7', 'エラー表示や真っ白な画面が出ない'], ['8', '戻れない・行き止まりの画面がない'], ['9', '同じ情報を2か所に表示していない'],
  ['10', '途中で切れたイラストの切れ目が、画面の端についている'], ['11', 'ダブルタップ・連続タップで画面が拡大しない'],
];
const NUMS = [
  ['num-44', 'ボタンは高さ44px以上'], ['contrast', 'コントラスト比4.5:1以上（大きな見出しは3:1以上）'], ['num-16', '文字は16px以上'],
  ['font', '判断に使う情報は飾りのない書体・斜めや変形なし'], ['anim', '普段の操作の動きは0.3秒以内'], ['press', '押せるものと押せないものを見た目で区別できる'], ['icon', 'アイコンは直径56px以上'],
  ['face', '（今回の指示）キャラの顔に手札・ボタンがかからない'],
  ['fixed', '（今回の指示）「あなたの番」と上の段が枚数で動かない・上の段は埋まり空きは下の段'],
];
const mark = (id) => (problems.some((p) => p.item === id) ? '不合格' : '合格');
const lines = [
  '# 改善案の検査結果', '', `日時：${new Date().toLocaleString('ja-JP')}　対象：UI改善案/対戦画面_高級版.html（アプリには入れていない）`,
  '幅：375×812・430×932（写真）、1280×800・375×667（崩れの確認だけ）。場面：あなたの番／キャラ3の番／やめる確認', '',
  '## アプリ共通の検査ルール（11項目）', '',
  ...ITEMS.map(([id, t]) => `- ${id}. ${t}：${id === '3' ? '目で確認（下の文字一覧）' : id === '6' ? '確認できなかった（見本の画面に保存するデータがない）' : mark(id)}`), '',
  '## ゲーム用UI自動化ルール（守る数値）', '', ...NUMS.map(([id, t]) => `- ${t}：${mark(id)}`), '',
  '## イラストの大きさ', '', ...artLog, ...notes.map((n) => `- ${n}`), '',
  '## 「あなたの番」と上の段の位置（14・12・5・1枚）', '', ...fixedLog, '',
  '## 不合格の内容', '', ...(problems.length ? problems.map((p) => `- [${p.item}] ${p.where}：${p.detail}`) : ['なし']), '',
  '## ボタンを押した結果', '', ...btn.map(([n, ok, yes = '反応した', no = '反応しない']) => `- ${n}：${ok ? yes : no}`), '',
  `## ズーム（2本指の確かめ方の試し：ふつうのページは ${zm.control} 倍）`, '', `- 2本指：${zm.pinch} 倍／カード連続タップ20回：${zm.taps} 倍／ダブルタップ：${zm.dbl} 倍`, '',
  '## コントラスト（いちばん低かった値。金の光沢文字はグラデーションのいちばん暗い色で測った）', '',
  ...[...contrastLog].map(([k, v]) => `- ${k}：${v}:1`), '',
  `## 明朝の書体（Shippori Mincho B1）が読み込めたか：${fontsLoaded ? 'はい' : 'いいえ（代わりの書体で表示）'}`, '',
  '## 画面に出ている文字の一覧（誤字・表記揺れを目で見る用）', '', [...texts].join('／'), '',
];
fs.writeFileSync(path.join(DIR, '検査結果.md'), lines.join('\n'));
console.log(lines.slice(4, 30).join('\n'));
console.log('不合格', problems.length, '件');
problems.slice(0, 40).forEach((p) => console.log(p.item, p.where, p.detail));
