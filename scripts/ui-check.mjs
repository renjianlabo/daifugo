// 検査7.4：画面の検査（Notion「アプリ共通の検査ルール」の①を機械で確かめる）
// 使い方：開発サーバーを動かした状態で `node scripts/ui-check.mjs`
// 結果：検査/画面/<幅>/*.png と 検査/画面/結果.md
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:5173/';
const OUT = path.resolve('検査/画面');
const SIZES = [
  [375, 667],
  [430, 932],
  [1280, 800],
];
const SCENES = ['hand', 'table', 'exchange', 'exchangeReveal', 'bomber', 'peek', 'bomberReveal', 'sevenPass', 'tenDiscard', 'flash', 'move:give:0:1', 'move:pass:1:3', 'fx', 'fxRank', 'fxC2', 'fxC3', 'fxC4',
  'band:eight:1', 'band:five:2', 'band:eleven:3', 'band:bomber:0', 'band:ten:1', 'band:seven:2', 'band:mark:3', 'band:num:0', 'band:geki:1',
  'roundEnd', 'quit', 'final'];
const SCENE_NAMES = {
  title: 'タイトル', settings: '設定（カード）', settings2: '設定（革命・しばり）', settings3: '設定（そのほか）', select: 'キャラ選択',
  hand: '対戦（手札14枚・2枚選択）', table: '対戦（場・革命・11バック・激しば）', exchange: 'カード交換',
  bomber: '12ボンバー', peek: '12ボンバー（盤面を見る）', bomberReveal: '12ボンバー（捨てられるカードと「2を選択」）', exchangeReveal: 'カード交換（自分が渡すカード）', sevenPass: '7渡し', tenDiscard: '10捨て', flash: '12ボンバーで捨てられたカード（一瞬表示）', fx: '演出（革命）', fxRank: '演出（大貧民）', fxC2: '演出（キャラ2・革命）', fxC3: '演出（キャラ3・大富豪）', fxC4: '演出（キャラ4・ジョーカー）',
  'move:give:0:1': '7渡し（自分→キャラ2。表のまま動く途中）', 'move:pass:1:3': '7渡し（キャラ2→キャラ4。裏向きのまま動く途中）',
  'band:eight:1': '帯：8切り', 'band:five:2': '帯：5スキップ', 'band:eleven:3': '帯：11バック', 'band:bomber:0': '帯：12ボンバー', 'band:ten:1': '帯：10捨て',
  'band:seven:2': '帯：7渡し', 'band:mark:3': '帯：マークしばり', 'band:num:0': '帯：数しば', 'band:geki:1': '帯：激しば', roundEnd: '回の結果', quit: 'やめる確認', final: '最終結果',
};

const problems = []; // { item, where, detail }
const fxResults = []; // 4人×1〜4位の演出の絵
const swipeLog = []; // キャラ選択のスワイプ
const seen = new Set();
const clicked = new Set();
const shots = [];
const timing = { click: 0, clicks: 0, wait: 0 };

function exe() {
  const candidates = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
  ];
  return candidates.find((p) => fs.existsSync(p));
}

/** 1画面ぶんの機械チェック（見切れ・はみ出し・重なり・文字の大きさ・ボタンの高さ） */
async function audit(page, where) {
  const found = await page.evaluate(() => {
    const out = [];
    const W = innerWidth;
    const H = innerHeight;
    // スクロールの外に隠れている部分は「見えていない」として数えない
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (!(r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none')) return false;
      for (let p = el.parentElement; p; p = p.parentElement) {
        const o = getComputedStyle(p).overflowY;
        if (o === 'auto' || o === 'scroll') {
          const pr = p.getBoundingClientRect();
          if (r.bottom <= pr.top + 1 || r.top >= pr.bottom - 1) return false;
        }
      }
      return true;
    };
    // スクロールする親で切り取られた後の、実際に見えている範囲
    const clipRect = (el) => {
      const r = el.getBoundingClientRect();
      let t = r.top, b = r.bottom, l = r.left, rt = r.right;
      for (let p = el.parentElement; p; p = p.parentElement) {
        const o = getComputedStyle(p).overflowY;
        if (o === 'auto' || o === 'scroll' || o === 'hidden') {
          const pr = p.getBoundingClientRect();
          t = Math.max(t, pr.top); b = Math.min(b, pr.bottom); l = Math.max(l, pr.left); rt = Math.min(rt, pr.right);
        }
      }
      return { top: t, bottom: b, left: l, right: rt };
    };
    const label = (el) => (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : el.tagName) + ` 「${(el.textContent || '').trim().slice(0, 20)}」`;
    const inScroll = (el) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const o = getComputedStyle(p).overflowY;
        if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight) return true;
      }
      return false;
    };
    if (document.documentElement.scrollWidth > W + 1) out.push(['2', `横にはみ出し（ページ幅 ${document.documentElement.scrollWidth}px）`]);
    // 12：スクロールできる場所（overflow が auto・scroll）で、中身がはみ出している（＝スクロールバーが出る）
    for (const el of document.querySelectorAll('#app *')) {
      const cs = getComputedStyle(el);
      const y = /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1;
      const x = /(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1;
      if (y || x) out.push(['12', `${y ? '縦' : '横'}のスクロールバー（中身 ${y ? el.scrollHeight : el.scrollWidth}px／枠 ${y ? el.clientHeight : el.clientWidth}px）：${label(el)}`]);
    }
    // キャラの絵：読み込めているか。下が切れた絵（演出・タイトル）は、切れ目が画面の下端にぴったりついているか、左右が切れていないか
    for (const img of document.querySelectorAll('#app img')) {
      if (!img.complete || img.naturalWidth === 0) out.push(['7', `絵が表示されない：${img.getAttribute('src')}`]);
      if (!img.matches('.fx-art, .title-art, .char-art, .me-art')) continue;
      if (img.closest('.slide[aria-hidden="true"]')) continue; // キャラ選択で横に控えているキャラ
      if (!img.matches('.fx-art') && document.querySelector('.fx, .modal-back')) continue; // 演出・小窓の下に隠れている
      const r = img.getBoundingClientRect();
      const screen = img.closest('.screen').getBoundingClientRect();
      const cut = r.bottom - Number(img.dataset.gap ?? 0) * r.height; // 絵が実際に切れている高さ
      const panel = img.closest('.fx-panel');
      if (panel) {
        // 演出の絵（帯の下の枠の中。ユーザー承認の改善案）：切れ目は枠の下の縁より下に出して隠す。人物の頭は枠の中に見える。帯は絵に重ならない
        const pr = panel.getBoundingClientRect();
        const [, vt] = (img.dataset.vis ?? '0,0,1').split(',').map(Number);
        if (cut < pr.bottom - 1) out.push(['10', `イラストの切れ目が枠の中に見えている（枠の下端から ${Math.round(pr.bottom - cut)}px 上）：${img.className}`]);
        if (r.top + vt * r.height < pr.top - 1) out.push(['face', `人物の頭が枠の上で切れている：${img.className}`]);
        const band = document.querySelector('.fxband')?.getBoundingClientRect();
        if (band && band.bottom > pr.top + 0.5) out.push(['face', '帯が絵の枠に重なっている']);
      } else if (Math.abs(cut - Math.min(screen.bottom, H)) > 1) out.push(['10', `イラストの切れ目が画面の下端から ${Math.round(Math.min(screen.bottom, H) - cut)}px 浮いている：${img.className}`]);
      // 顔（data-head の頭の範囲）に、文字・カード・ボタンがかからない。頭が画面の左右で切れていない
      if (img.dataset.head) {
        const [hx1, hy1, hx2, hy2] = img.dataset.head.split(',').map(Number);
        const head = { left: r.left + hx1 * r.width, right: r.left + hx2 * r.width, top: r.top + hy1 * r.height, bottom: r.top + hy2 * r.height };
        for (const el of document.querySelectorAll('#app button, #app .card, .me-label, .board, .gbar, .flags, .sel-top, .logo, .dots')) {
          const b = el.getBoundingClientRect();
          if (b.width === 0 || getComputedStyle(el).visibility === 'hidden' && !el.matches('.me-label')) continue;
          if (Math.min(b.right, head.right) - Math.max(b.left, head.left) > 0 && Math.min(b.bottom, head.bottom) - Math.max(b.top, head.top) > 0) out.push(['face', `顔に重なっている：${label(el)}（${img.className}）`]);
        }
        if (head.left < screen.left || head.right > screen.right) out.push(['face', `頭が画面の左右で切れている：${img.className}`]);
      }
    }
    // 同じ情報を2か所に出さない：場の真ん中に説明文を出さない（出してよいのは、出した人の名前とカードだけ）。パスは人の表示の側だけ
    for (const el of document.querySelectorAll('.table *')) {
      if (el.closest('.card')) continue;
      const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join('');
      if (own) out.push(['9', `場の真ん中に文章：「${own.slice(0, 20)}」`]);
    }
    for (const el of document.querySelectorAll('#app *')) {
      const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join('');
      if (own === 'パス' && !el.closest('.opp, .me-label, .actions')) out.push(['9', 'パスが人の表示以外にも出ている']);
    }
    const layer = document.querySelector('.fx') || document.querySelector('.modal-back') || document.querySelector('.flash') || document.querySelector('#app');
    const all = [...document.querySelectorAll('#app *')].filter(visible);
    const leaves = all.filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
    for (const el of leaves) {
      const cs = getComputedStyle(el);
      const fs = parseFloat(cs.fontSize);
      if (fs < 16) out.push(['5', `文字が16px未満（${fs}px）：${label(el)}`]);
      if (el.scrollWidth > el.clientWidth + 1 && cs.overflow !== 'visible' && cs.display !== 'inline') out.push(['2', `文字の見切れ：${label(el)}`]);
      const r = el.getBoundingClientRect();
      if (r.right > W + 1 || r.left < -1) out.push(['2', `画面の横にはみ出し：${label(el)}`]);
      if (r.bottom > H + 1 && !inScroll(el) && document.documentElement.scrollHeight <= H + 1) out.push(['2', `画面の下にはみ出し：${label(el)}`]);
    }
    for (const b of all.filter((el) => el.tagName === 'BUTTON' && !el.classList.contains('card'))) {
      const r = b.getBoundingClientRect();
      if (r.height < 44 - 0.5) out.push(['5', `ボタンが44px未満（${Math.round(r.height)}px）：${label(b)}`]);
    }
    // 重なり：いちばん上の層の中で、文字どうしが重なっていないか（手札は重ねて並べる作りなので除く）
    const top = leaves.filter((el) => layer.contains(el) && !el.closest('.hand'));
    for (let i = 0; i < top.length; i++) {
      for (let j = i + 1; j < top.length; j++) {
        const a = top[i], b = top[j];
        if (a.contains(b) || b.contains(a)) continue;
        if (a.closest('.card') && a.closest('.card') === b.closest('.card')) continue;
        const r1 = clipRect(a), r2 = clipRect(b);
        const ox = Math.min(r1.right, r2.right) - Math.max(r1.left, r2.left);
        const oy = Math.min(r1.bottom, r2.bottom) - Math.max(r1.top, r2.top);
        if (ox > 2 && oy > 2) out.push(['2', `文字の重なり：${label(a)} と ${label(b)}`]);
      }
    }
    // 守る数値：アイコンは直径56px以上
    for (const a of all.filter((el) => el.classList.contains('avatar'))) {
      const r = a.getBoundingClientRect();
      if (Math.min(r.width, r.height) < 56 - 0.5) out.push(['icon', `アイコンが56px未満（${Math.round(r.width)}px）：${label(a)}`]);
    }
    // 守る数値：文字と背景のコントラスト比（4.5:1以上、大きな文字は3:1以上）。背景は親をたどって重ね、最後は台の緑で近似
    const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p[3] ?? 1]; };
    const bgOf = (el) => {
      const layers = [];
      for (let p = el; p; p = p.parentElement) {
        const c = parse(getComputedStyle(p).backgroundColor);
        if (c && c[3] > 0) { layers.push(c); if (c[3] >= 1) break; }
      }
      let col = [36, 16, 32];
      for (let i = layers.length - 1; i >= 0; i--) { const [r, g, b, a] = layers[i]; col = [r * a + col[0] * (1 - a), g * a + col[1] * (1 - a), b * a + col[2] * (1 - a)]; }
      return col;
    };
    const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
    for (const el of leaves) {
      if (el.closest(':disabled') || !layer.contains(el)) continue;
      const cs = getComputedStyle(el);
      const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(1);
      const goldEl = el.closest('.gold-text');
      let fgs;
      if (goldEl) {
        const g = getComputedStyle(goldEl).backgroundImage;
        fgs = [...g.matchAll(/rgba?\([^)]+\)/g)].map((m) => parse(m[0])).concat([...g.matchAll(/#[0-9a-f]{6}/gi)].map((m) => hex(m[0])));
      } else {
        const fg = parse(cs.color);
        if (!fg) continue;
        fgs = [fg];
      }
      const btn = [el.closest('button')].find((b) => b && /gradient/.test(getComputedStyle(b).backgroundImage));
      let bgs = btn ? [...getComputedStyle(btn).backgroundImage.matchAll(/rgba?\([^)]+\)/g)].map((m) => parse(m[0]).slice(0, 3)) : [bgOf(el)];
      // 帯の名前：帯の上下のグラデーションのうち、文字の高さにある色で測る。斜めの薄い光（白16%）が重なった色も測る
      const band = el.closest('.fxband');
      if (band) {
        const g = getComputedStyle(band).backgroundImage.split('linear-gradient').pop();
        const stops = [...g.matchAll(/(rgba?\([^)]+\))\s*([\d.]+)%/g)].map((m) => [parse(m[1]), Number(m[2]) / 100]);
        const br = band.getBoundingClientRect(), tr = el.getBoundingClientRect();
        const at = (f) => {
          let i = 0;
          while (i < stops.length - 2 && stops[i + 1][1] < f) i++;
          const [[c0, p0], [c1, p1]] = [stops[i], stops[i + 1]];
          const k = Math.min(1, Math.max(0, (f - p0) / (p1 - p0 || 1)));
          return [0, 1, 2].map((j) => c0[j] + (c1[j] - c0[j]) * k);
        };
        bgs = [];
        for (let k = 0; k <= 4; k++) {
          const c = at((tr.top - br.top + (tr.height * k) / 4) / br.height);
          bgs.push(c, c.map((v) => v * 0.84 + 255 * 0.16));
        }
      }
      let ratio = 99;
      for (const fg of fgs) for (const bg of bgs) {
        const fc = [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3]));
        const [l1, l2] = [lum(fc), lum(bg)].sort((a, b) => b - a);
        ratio = Math.min(ratio, (l1 + 0.05) / (l2 + 0.05));
      }
      const fs = parseFloat(cs.fontSize);
      const need = fs >= 24 || (fs >= 18.66 && parseInt(cs.fontWeight) >= 700) ? 3 : 4.5;
      if (ratio < need - 0.01) out.push(['contrast', `コントラスト ${ratio.toFixed(2)}:1（必要 ${need}:1）：${label(el)}`]);
    }
    // 守る数値：普段の操作の動きは0.3秒以内（演出と、操作を待たせない一瞬表示のカードは除く）
    const dur = (v) => Math.max(...v.split(',').map((x) => parseFloat(x) * (x.includes('ms') ? 0.001 : 1)));
    for (const el of all) {
      if (el.closest('.fx, .flash')) continue;
      const cs = getComputedStyle(el);
      const t = Math.max(dur(cs.transitionDuration), cs.animationName !== 'none' ? dur(cs.animationDuration) : 0);
      if (t > 0.3001) out.push(['anim', `動きが${t}秒：${label(el)}`]);
    }
    // 守る数値：押せないものは見た目で区別できる（薄い・暗いなど）
    for (const b of all.filter((el) => el.matches('button:disabled'))) {
      const cs = getComputedStyle(b);
      if (parseFloat(cs.opacity) >= 1 && cs.filter === 'none') out.push(['press', `押せないのに押せるものと同じ見た目：${label(b)}`]);
    }
    const acts = [...document.querySelectorAll('[data-act]')].map((e) => e.dataset.act);
    return { out, acts };
  });
  for (const [item, detail] of found.out) problems.push({ item, where, detail });
  found.acts.forEach((a) => seen.add(a));
}

async function shot(page, w, name) {
  const dir = path.join(OUT, String(w));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${String(shots.filter((s) => s.w === w).length + 1).padStart(2, '0')}_${name.replaceAll(':', '_')}.png`);
  await page.screenshot({ path: file });
  shots.push({ w, name, file: path.relative(process.cwd(), file).replaceAll('\\', '/') });
  await audit(page, `${w}px ${SCENE_NAMES[name] ?? name}`);
}

/** クリックして、画面が変わったか確かめる（変わらなければ「押しても反応しない」） */
async function tap(page, locator, where, opts = {}) {
  const el = locator.first();
  const act = await el.getAttribute('data-act');
  const before = await page.locator('#app').innerHTML();
  const tc = Date.now();
  await el.click(opts);
  timing.click += Date.now() - tc;
  timing.clicks++;
  if (act) clicked.add(act);
  try {
    await page.waitForFunction((b) => document.querySelector('#app').innerHTML !== b, before, { timeout: 1500 });
  } catch {
    problems.push({ item: '1', where, detail: `押しても反応しない：${act ?? ''} ${(await el.textContent().catch(() => ''))?.trim()}` });
  }
}

const state = (page) => page.evaluate(() => window.__daifugo.state());

async function screensFor(browser, w, h) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: w < 768, hasTouch: w < 768 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(BASE + '?fast');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 5000 }).catch(() => {});
  await shot(page, w, 'title');
  await tap(page, page.locator('[data-act=toSettings]'), `${w}px タイトル`);
  await shot(page, w, 'settings');
  await tap(page, page.locator('[data-act=settingsTab][data-arg=special]'), `${w}px 設定`);
  await shot(page, w, 'settings2');
  await tap(page, page.locator('[data-act=settingsTab][data-arg=other]'), `${w}px 設定`);
  await shot(page, w, 'settings3');
  await tap(page, page.locator('[data-act=toSelect]'), `${w}px 設定`);
  await shot(page, w, 'select');
  for (const sc of SCENES) {
    await page.evaluate((n) => window.__daifugo.scenario(n), sc);
    await page.waitForTimeout(150);
    await page.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 5000 }).catch(() => {});
    // 演出の絵・背景が出てくる動きが終わってから撮る（一瞬表示するカード・ゲームを止めて見せるカードは途中のまま）
    await page.evaluate(() => Promise.all([...document.querySelectorAll('.fx:not(.reveal), .fx:not(.reveal) *')].flatMap((e) => e.getAnimations().map((a) => a.finished)))).catch(() => {});
    await shot(page, w, sc);
  }
  // 4人の絵すべて（決めポーズ・1〜4位）を演出に出し、切れ目が画面の下端にあるかを確かめる（撮影はしない）
  for (const seat of [0, 1, 2, 3]) {
    for (const pose of ['special', '1', '2', '3', '4']) {
      await page.evaluate((n) => window.__daifugo.scenario(n), `fx:${seat}:${pose}`);
      await page.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 5000 }).catch(() => {});
      await page.evaluate(() => Promise.all([...document.querySelectorAll('.fx, .fx *')].flatMap((e) => e.getAnimations().map((a) => a.finished)))).catch(() => {});
      await audit(page, `${w}px 演出（席${seat}・${pose}）`);
    }
  }
  // 自分・CPUの全員について、1〜4位すべてで正しい順位の絵が出るか（本物のルール処理で上がらせる）
  if (w === 375) {
    const dirs = ['chara1', 'chara2', 'chara3', 'blonde-tomboy'];
    for (let seat = 0; seat < 4; seat++) {
      for (let rank = 1; rank <= 4; rank++) {
        await page.evaluate((n) => window.__daifugo.scenario(n), `rankFx:${seat}:${rank}`);
        const src = await page.evaluate(() => document.querySelector('.fx-art')?.getAttribute('src') ?? null);
        const ok = !!src && src.includes(`/${dirs[seat]}/rank${rank}.`);
        fxResults.push({ seat, rank, ok, src });
        if (!ok) problems.push({ item: 'fx', where: `席${seat}（${seat === 0 ? '自分' : 'CPU'}）${rank}位`, detail: `出た絵：${src ?? 'なし'}` });
      }
    }
  }
  for (const e of errors) problems.push({ item: '7', where: `${w}px`, detail: 'エラー：' + e });
  await page.close();
}

/** 11. ダブルタップ・連続タップ・2本指で画面が拡大しないか（スマホの幅・タッチで確かめる） */
async function zoomCheck(browser) {
  const where = '375px ズーム';
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
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
  // 確かめ方の試し：ズーム止めのない普通のページなら、2本指で広げると拡大される
  await page.setContent(`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><body style="margin:0">${'<p>ふつうのページ</p>'.repeat(40)}</body>`);
  r.control = await pinch();
  await page.goto(BASE + '?fast');
  r.meta = await page.evaluate(() => document.querySelector('meta[name=viewport]')?.content ?? '');
  if (!/maximum-scale=1\b/.test(r.meta) || !/user-scalable=no/.test(r.meta)) problems.push({ item: '11', where, detail: `viewport の指定が足りない：${r.meta}` });
  r.title = await pinch();
  if (r.title !== 1) problems.push({ item: '11', where: where + '（タイトル）', detail: `2本指で ${r.title} 倍に拡大した` });
  await page.evaluate(() => window.__daifugo.scenario('hand'));
  await page.waitForTimeout(200);
  // iPhone のダブルタップ拡大を止める指定が、ページ全体と押せるもの全部に付いているか
  const bad = await page.evaluate(() => [document.documentElement, document.body, ...document.querySelectorAll('button, [data-act]')]
    .filter((e) => getComputedStyle(e).touchAction !== 'manipulation').map((e) => e.className || e.tagName));
  if (bad.length) problems.push({ item: '11', where, detail: `touch-action: manipulation が付いていない：${[...new Set(bad)].slice(0, 5).join('、')}` });
  // カードを素早く何回もタップする（40ms おきに20回）
  const pos = await page.locator('.hand .card').evaluateAll((els) => els.map((e) => { const b = e.getBoundingClientRect(); return [b.left + 10, b.top + 40]; }));
  for (let i = 0; i < 20; i++) {
    const [x, y] = pos[i % 3];
    await touch('touchStart', [{ x, y, id: 1 }]);
    await touch('touchEnd', []);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(400);
  r.taps = await scale();
  if (r.taps !== 1) problems.push({ item: '11', where, detail: `カードの連続タップで ${r.taps} 倍に拡大した` });
  await cdp.send('Input.synthesizeTapGesture', { x: pos[0][0], y: pos[0][1], tapCount: 2, gestureSourceType: 'touch' });
  await page.waitForTimeout(400);
  r.dbl = await scale();
  if (r.dbl !== 1) problems.push({ item: '11', where, detail: `ダブルタップで ${r.dbl} 倍に拡大した` });
  r.game = await pinch();
  if (r.game !== 1) problems.push({ item: '11', where: where + '（対戦）', detail: `2本指で ${r.game} 倍に拡大した` });
  await ctx.close();
  return r;
}

/** 375px で、ボタンを実際に押して1試合（3回戦）を最後まで遊ぶ */
async function playThrough(browser) {
  const where = '375px 通しプレイ';
  const page = await browser.newPage({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(BASE + '?fast');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await tap(page, page.locator('[data-act=toSettings]'), where);
  // 戻る・進む
  await tap(page, page.locator('[data-act=toTitle]'), where);
  await tap(page, page.locator('[data-act=toSettings]'), where);
  // 設定はタブに分かれている（カード／革命・しばり／そのほか）
  await tap(page, page.locator('[data-act=rule][data-arg=eightCut]'), where);
  await tap(page, page.locator('[data-act=settingsTab][data-arg=other]'), where);
  await tap(page, page.locator('[data-act=level][data-arg=easy]'), where);
  await tap(page, page.locator('[data-act=resetRules]'), where);
  await tap(page, page.locator('[data-act=rule][data-arg=miyakoOchi]'), where);
  // 6. 再読み込みしても設定が消えない
  await page.reload();
  await page.locator('[data-act=toSettings]').click();
  await page.locator('[data-act=settingsTab][data-arg=other]').click();
  const kept = await page.locator('[data-act=rule][data-arg=miyakoOchi]').getAttribute('aria-pressed');
  const lvl = await page.locator('[data-act=level][data-arg=easy]').getAttribute('aria-pressed');
  if (kept !== 'true' || lvl !== 'true') problems.push({ item: '6', where, detail: '再読み込みで設定が消えた' });
  await tap(page, page.locator('[data-act=toSelect]'), where);
  await tap(page, page.locator('[data-act=toSettings]'), where); // キャラ選択の「戻る」
  await tap(page, page.locator('[data-act=toSelect]'), where);
  await tap(page, page.locator('[data-act=selNext]'), where);
  await tap(page, page.locator('[data-act=selNext]'), where);
  await tap(page, page.locator('[data-act=selPrev]'), where);
  // マウスで左へドラッグ → 次のキャラ（キャラ3）
  {
    const box = await page.locator('#selStage').boundingBox();
    const before = await page.locator('#selName').textContent();
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(350);
    const after = await page.locator('#selName').textContent();
    swipeLog.push(`${before} → 左へドラッグ → ${after}`);
    if (before !== 'キャラ2' || after !== 'キャラ3') problems.push({ item: '1', where, detail: `キャラ選択のスワイプで切り替わらない（${before} → ${after}）` });
  }
  await tap(page, page.locator('[data-act=start]'), where);

  const t0 = Date.now();
  let rounds = 0, humanPlays = 0, humanPasses = 0, autoPasses = 0, fxSkips = 0;
  let rnd = 12345;
  const rand = () => ((rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  while (Date.now() - t0 < Number(process.env.PLAY_LIMIT ?? 240000)) {
    const ts = Date.now();
    if (await page.locator('.final-screen').count()) break;
    const st = await state(page);
    timing.state = (timing.state ?? 0) + Date.now() - ts;
    timing.loops = (timing.loops ?? 0) + 1;
    if (st && st.phase === 'play' && st.turn !== 0 && !st.fx) timing.cpuLoops = (timing.cpuLoops ?? 0) + 1;
    if (!st) { await page.waitForTimeout(30); continue; }
    if (st.fx) {
      if (fxSkips < 30) { await page.locator('.fx').click({ timeout: 300 }).catch(() => {}); clicked.add('fxSkip'); fxSkips++; }
      else await page.waitForTimeout(40);
      continue;
    }
    if (st.phase === 'roundEnd' && (await page.locator('[data-act=nextRound]').count())) {
      await tap(page, page.locator('[data-act=nextRound]'), where);
      rounds++;
      continue;
    }
    if (st.task) {
      const ids = await page.locator('.hand .card').evaluateAll((els) => els.map((e) => e.dataset.arg));
      for (const id of ids.slice(0, st.task.count)) await tap(page, page.locator(`.hand .card[data-arg="${id}"]`), where, { position: { x: 10, y: 40 } });
      await tap(page, page.locator('[data-act=give]'), where);
      continue;
    }
    if (st.phase === 'bomber' && st.bomber?.player === 0) {
      const btns = page.locator('[data-act=bomberRank]');
      for (let k = 0; k < st.bomber.count; k++) await tap(page, btns.nth(k * 3), where);
      await tap(page, page.locator('[data-act=bomberOk]'), where);
      continue;
    }
    if (st.phase === 'play' && st.turn === 0) {
      const legal = await page.evaluate(() => window.__daifugo.legal());
      // 出せる手がないときは、パスを押さずに自動でパスされるのを待つ
      if (!legal.length) {
        const ok = await page.waitForFunction(() => { const s = window.__daifugo.state(); return !s || s.turn !== 0 || s.phase !== 'play' || s.fx; }, null, { timeout: 3000 }).then(() => true).catch(() => false);
        if (ok) autoPasses++;
        else { problems.push({ item: '8', where, detail: '出せる手がないのに自動でパスされない' }); break; }
        continue;
      }
      const canPass = await page.locator('[data-act=pass]').isEnabled();
      if (!(canPass && rand() < 0.2)) {
        const pick = legal[Math.floor(rand() * legal.length)];
        for (const id of pick) await tap(page, page.locator(`.hand .card[data-arg="${id}"]`), where, { position: { x: 10, y: 40 } });
        const ok = await page.locator('[data-act=play]').isEnabled();
        if (!ok) { problems.push({ item: '1', where, detail: `出せる手を選んだのに「出す」が押せない（${pick.join(',')}）` }); break; }
        await tap(page, page.locator('[data-act=play]'), where);
        humanPlays++;
      } else {
        await tap(page, page.locator('[data-act=pass]'), where);
        humanPasses++;
      }
      continue;
    }
    const tw = Date.now();
    await page.waitForTimeout(25);
    timing.wait += Date.now() - tw;
  }
  const finished = (await page.locator('.final-screen').count()) > 0;
  if (!finished) problems.push({ item: '8', where, detail: '時間内に最終結果まで進まなかった' });
  else {
    await tap(page, page.locator('[data-act=again]'), where);
    await tap(page, page.locator('[data-act=quit]'), where);
    await tap(page, page.locator('[data-act=quitNo]'), where);
    await tap(page, page.locator('[data-act=quit]'), where);
    await tap(page, page.locator('[data-act=quitYes]'), where);
    if (!(await page.locator('.title-screen').count())) problems.push({ item: '8', where, detail: '「やめる」でタイトルに戻れない' });
  }
  // 最終結果の「タイトルへ」と、12ボンバー・交換の操作（場面を作って押す）
  await page.evaluate(() => window.__daifugo.scenario('final'));
  await tap(page, page.locator('.final-screen [data-act=toTitle]'), where);
  await page.evaluate(() => window.__daifugo.scenario('bomber'));
  await tap(page, page.locator('[data-act=bomberRank]').nth(5), where);
  await tap(page, page.locator('[data-act=bomberOk]'), where);
  await page.evaluate(() => window.__daifugo.scenario('exchange'));
  for (const k of [0, 1]) await tap(page, page.locator('.hand .card').nth(k), where, { position: { x: 10, y: 40 } });
  await tap(page, page.locator('[data-act=give]'), where);
  // 12ボンバーの「盤面を見る」→「選択に戻る」
  await page.evaluate(() => window.__daifugo.scenario('bomber'));
  await tap(page, page.locator('[data-act=peek]'), where);
  await tap(page, page.locator('[data-act=peekBack]'), where);
  await page.evaluate(() => window.__daifugo.scenario('fx'));
  await tap(page, page.locator('.fx'), where);
  for (const e of errors) problems.push({ item: '7', where, detail: 'エラー：' + e });
  await page.close();
  return { finished, rounds, humanPlays, humanPasses, autoPasses, seconds: Math.round((Date.now() - t0) / 1000) };
}

const browser = await chromium.launch({ executablePath: exe(), headless: true });
fs.rmSync(OUT, { recursive: true, force: true });
if (!process.env.ONLY_PLAY) for (const [w, h] of SIZES) await screensFor(browser, w, h);
const play = await playThrough(browser);
const zoom = await zoomCheck(browser);
await browser.close();

for (const a of seen) if (!clicked.has(a) && a !== 'card') problems.push({ item: '1', where: '全体', detail: `一度も押して確かめていないボタン：${a}` });

// 同じ指摘をまとめる
const uniq = [...new Map(problems.map((p) => [p.item + p.detail, p])).values()];
const ITEMS = {
  1: '押しても反応しないボタン・リンクがない', 2: '文字・画像の見切れ、はみ出し、重なりがない', 3: '誤字脱字・表記揺れがない',
  4: '文章の改行や折り返しが崩れていない', 5: 'スマホ幅（375px）とPC幅（1280px）の両方で表示が崩れない', 6: '再読み込みや画面移動で、保存したデータが消えない',
  7: 'エラー表示や真っ白な画面が出ない', 8: '戻れない・行き止まりの画面がない',
  9: '同じ情報を2か所に表示していない', 10: '途中で切れたイラストの切れ目が、画面の端についている（画面の中に浮いていない）',
  11: 'ダブルタップ・連続タップで画面が拡大しない',
  12: '画面や枠（ダイアログ・表など）の中に、縦・横のスクロールバーが出ていない（中身がはみ出していない）',
};
let md = `# 画面の検査結果（機械チェック）\n\n- 撮影：${SIZES.map(([w, h]) => `${w}×${h}`).join('・')} で ${shots.length / SIZES.length} 画面ずつ（計${shots.length}枚）\n`;
md += `- 通しプレイ（375px・ボタンを実際に押す）：最後まで${play.finished ? '進んだ' : '進まなかった'}／${play.rounds}回戦／自分が出した${play.humanPlays}回・パス${play.humanPasses}回・自動パス${play.autoPasses}回／${play.seconds}秒\n`;
md += `- 押して確かめたボタンの種類：${[...clicked].sort().join('・')}\n\n## 項目ごと\n\n`;
for (const k of Object.keys(ITEMS)) {
  const ps = uniq.filter((p) => p.item === k);
  const auto = ['1', '2', '5', '6', '7', '8', '9', '10', '11', '12'].includes(k);
  md += `- ${k}. ${ITEMS[k]}：${ps.length ? `不合格（${ps.length}件）` : auto ? '機械チェックでは問題なし' : '機械では判定できない（目で確認）'}\n`;
  for (const p of ps.slice(0, 30)) md += `  - ${p.where}：${p.detail}\n`;
}
md += `\n## 演出の絵（自分・CPUの4人×1〜4位の16通り）\n\n- 正しい絵：${fxResults.filter((x) => x.ok).length}/${fxResults.length}\n`;
for (const p of uniq.filter((p) => p.item === 'fx')) md += `  - ${p.where}：${p.detail}\n`;
md += `\n## キャラ選択のスワイプ\n\n${swipeLog.map((x) => `- ${x}`).join('\n')}\n`;
md += `\n## ズーム（11）の数字\n\n- 確かめ方の試し（ズーム止めのない普通のページを2本指で広げる）：${zoom.control}倍\n- タイトル画面を2本指で広げる：${zoom.title}倍\n- 対戦画面でカードを40msおきに20回タップ：${zoom.taps}倍／ダブルタップ：${zoom.dbl}倍／2本指で広げる：${zoom.game}倍\n- viewport：${zoom.meta}\n- 注意：このブラウザ（Chrome系）はスマホ向けページでダブルタップ拡大をしないので、ダブルタップは「iPhoneで拡大を止める指定（touch-action: manipulation）がページ全体と押せるもの全部に付いているか」で判定した。本物のiPhoneでは確かめていない\n`;
const NUMS = [
  ['ボタンの高さ44px以上', (p) => p.detail.startsWith('ボタンが44px未満')],
  ['文字16px以上', (p) => p.detail.startsWith('文字が16px未満')],
  ['コントラスト比 4.5:1以上（大きな文字は3:1以上）', (p) => p.item === 'contrast'],
  ['アイコンの直径56px以上', (p) => p.item === 'icon'],
  ['普段の操作の動きは0.3秒以内', (p) => p.item === 'anim'],
  ['押せるものと押せないものを見た目で区別できる', (p) => p.item === 'press'],
  ['（新しいUIの要件）大きく出すキャラの顔に、文字・カード・ボタンがかからない', (p) => p.item === 'face'],
];
md += `\n## ゲーム用UI自動化ルールの守る数値（機械チェック）\n\n`;
for (const [name, f] of NUMS) {
  const ps = uniq.filter(f);
  md += `- ${name}：${ps.length ? `不合格（${ps.length}件）` : '機械チェックでは問題なし'}\n`;
  for (const p of ps.slice(0, 20)) md += `  - ${p.where}：${p.detail}\n`;
}
md += `\n## スクリーンショット\n\n${shots.map((s) => `- ${s.w}px ${SCENE_NAMES[s.name] ?? s.name}：${s.file}`).join('\n')}\n`;
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, '結果.md'), md);
console.log(md.split('## スクリーンショット')[0]);
