// 大きく出すキャラの絵（キャラ選択・対戦の自分の欄）。新しいUIの目的の一つは、キャラの絵を目立たせること。
// キャラ選択と対戦の自分の欄はトランプを持った立ち絵（cards.png）を使う（ユーザー指示 2026-10-30）。タイトルにキャラの絵は出さない（ユーザー指示 2026-10-31）。
// 絵を差し替えたら、下の HEAD・HEAD_CARDS の数字だけを直せばよい。
import { Character } from '../characters';

/**
 * 絵の中の頭（髪のてっぺん〜あごの下の髪）の範囲：左,上,右,下（絵の幅・高さに対する割合）。
 * 顔に文字・カード・ボタンがかからないようにするのと、頭を画面のまん中に置くのに使う。
 * 値は透明でない画素の範囲を機械で測ったもの（2026-10-29）
 */
const HEAD: Record<number, [number, number, number, number]> = {
  1: [0.31, 0.09, 0.68, 0.43],
  2: [0.29, 0.07, 0.69, 0.42],
  3: [0.30, 0.07, 0.68, 0.37],
  4: [0.33, 0.07, 0.69, 0.40],
};
/** トランプを持った立ち絵（cards.png・1038×1515。チャットの元の絵）の頭の範囲。値は透明でない画素の幅と目で測ったもの（2026-10-30。キャラ2・3は元の絵に入れ替えたあと測り直した） */
const HEAD_CARDS: Record<number, [number, number, number, number]> = {
  1: [0.27, 0.01, 0.71, 0.32],
  2: [0.25, 0.01, 0.73, 0.35],
  3: [0.34, 0.02, 0.71, 0.28],
  4: [0.31, 0.05, 0.72, 0.30],
};
/** 測っていない絵のときの大まかな範囲 */
const HEAD_DEFAULT: [number, number, number, number] = [0.3, 0.05, 0.7, 0.42];

/** 大きく出す絵。kind は決めポーズ（special）かトランプを持った立ち絵（cards）。絵がないキャラは空文字 */
export function bigArt(c: Character, cls: string, kind: 'special' | 'cards'): string {
  if (!c.images) return '';
  const head = ((kind === 'cards' ? HEAD_CARDS : HEAD)[c.id] ?? HEAD_DEFAULT).join(',');
  return `<img class="${cls}" src="${c.images[kind]}" alt="" draggable="false" data-head="${head}">`;
}

const headOf = (img: HTMLImageElement) => img.dataset.head!.split(',').map(Number);

/**
 * 頭をまん中に置く絵（キャラ選択）：入れ物の下端につけ、頭のてっぺんを入れ物の上端から8px下に置く。
 * 頭の横のまん中を、入れ物の横のまん中に合わせる
 */
function centerArt(img: HTMLImageElement, box: HTMLElement) {
  const [hx1, hy1, hx2] = headOf(img);
  const H = (box.clientHeight - 8) / (1 - hy1);
  const W = (H * img.naturalWidth) / img.naturalHeight;
  Object.assign(img.style, { height: `${H}px`, width: `${W}px`, left: `${box.clientWidth / 2 - ((hx1 + hx2) / 2) * W}px` });
}

/**
 * 対戦の自分の絵：下端は画面の下端、高さは盤の下から画面の下端まで。
 * 頭が手札の列の左の空き（左右の余白4px・列との間8px）に入りきらないときだけ小さくし、頭を空きのまん中に置く
 */
function gameArt(img: HTMLImageElement) {
  const art = img.parentElement!;
  const lower = art.parentElement!.getBoundingClientRect();
  const col = art.parentElement!.querySelector('.hand')!.getBoundingClientRect();
  const [hx1, , hx2] = headOf(img);
  const ratio = img.naturalWidth / img.naturalHeight;
  const free = col.left - lower.left - 8 - 4;
  const h = Math.min(lower.height, free / (hx2 - hx1) / ratio);
  const w = h * ratio;
  const headLeft = 4 + (free - (hx2 - hx1) * w) / 2;
  Object.assign(art.style, { height: `${h}px`, width: `${w}px`, left: `${headLeft - hx1 * w}px` });
}

/** 絵の中で人物が写っている範囲（透明でない画素）：左,上,右（絵の幅・高さに対する割合）。絵ごとに1回だけ測る */
const visCache = new Map<string, [number, number, number]>();
function visibleBox(img: HTMLImageElement): [number, number, number] {
  const hit = visCache.get(img.src);
  if (hit) return hit;
  const W = 256, H = Math.round((256 * img.naturalHeight) / img.naturalWidth);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(img, 0, 0, W, H);
  const d = x.getImageData(0, 0, W, H).data;
  let l = W, r = -1, t = H;
  for (let y = 0; y < H; y++) for (let i = 0; i < W; i++) {
    if (d[(y * W + i) * 4 + 3] < 40) continue;
    if (i < l) l = i;
    if (i > r) r = i;
    if (y < t) t = y;
  }
  const box: [number, number, number] = r < 0 ? [0, 0, 1] : [l / W, t / H, (r + 1) / W];
  visCache.set(img.src, box);
  return box;
}

/**
 * 演出の絵（帯の下の枠の中）：どの絵も「髪のてっぺんから絵の下端（切れ目）まで」を枠の高さの1.2倍にそろえる（ユーザー承認の改善案 2026-10-30）。
 * 髪のてっぺんは枠の上の縁から20px下。切れ目は枠の下の縁より下に出るので見えない。横は、人物の写っている範囲のまん中を枠のまん中に合わせる
 */
function fxArt(img: HTMLImageElement) {
  const panel = img.closest<HTMLElement>('.fx-panel');
  if (!panel) return;
  const [l, t, r] = visibleBox(img);
  img.dataset.vis = [l, t, r].join(',');
  const h = (panel.clientHeight * 1.2) / (1 - t);
  const w = (h * img.naturalWidth) / img.naturalHeight;
  Object.assign(img.style, { width: `${w}px`, height: `${h}px`, top: `${20 - t * h}px`, left: `${panel.clientWidth / 2 - ((l + r) / 2) * w}px` });
}

/** 帯の名前が長くて入りきらないときだけ、文字を小さくする（最小24px） */
function fitBandName(root: HTMLElement) {
  const band = root.querySelector<HTMLElement>('.fxband');
  const name = band?.querySelector<HTMLElement>('.fx-name');
  if (!band || !name) return;
  const icon = band.querySelector<HTMLElement>('.avatar');
  // 使える幅：帯の幅から左右の余白16pxずつと、アイコンと右の空き（アイコンと同じ幅）・すき間14pxずつを引いたもの
  const avail = band.clientWidth - 32 - (icon ? 2 * (icon.offsetWidth + 14) : 0);
  name.style.fontSize = '';
  let size = parseFloat(getComputedStyle(name).fontSize);
  while (name.offsetWidth > avail && size > 24) {
    size -= 2;
    name.style.fontSize = `${size}px`;
  }
}

/**
 * 一瞬見せるカードの動く先：受け取る人のアイコン（自分なら手札）。CPUどうしの7渡しは、渡す人のアイコンから動き始める。
 * 場のまん中からのずれを --tx・--ty（動く先）と --sx・--sy（動き始め）に入れる
 */
function layoutFlash(root: HTMLElement) {
  // 12ボンバー・カード交換で、ゲームを止めて見せるカード（演出の層）は、場と同じ位置・大きさに置く
  const reveal = root.querySelector<HTMLElement>('.reveal-box');
  const table = root.querySelector('.table');
  if (reveal && table) {
    const t = table.getBoundingClientRect(), o = reveal.offsetParent!.getBoundingClientRect();
    // 高さは場以上（12ボンバーの短い文が入るように）。上下のまん中を場のまん中にそろえる
    Object.assign(reveal.style, { left: `${t.left - o.left}px`, top: `${t.top - o.top + t.height / 2}px`, width: `${t.width}px`, minHeight: `${t.height}px`, translate: '0 -50%' });
  }
  const flash = root.querySelector<HTMLElement>('.flash') ?? reveal;
  if (!flash) return;
  const box = flash.getBoundingClientRect();
  const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
  const at = (seat: string) => {
    if (seat === '') return null;
    const el = seat === '0' ? root.querySelector('.mine .hand') : root.querySelector(`.opp[data-seat="${seat}"] .avatar`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return [r.left + r.width / 2 - cx, r.top + r.height / 2 - cy];
  };
  const to = at(flash.dataset.to ?? ''), from = at(flash.dataset.from ?? '');
  if (to) flash.style.cssText += `;--tx:${to[0]}px;--ty:${to[1]}px`;
  if (from) flash.style.cssText += `;--sx:${from[0]}px;--sy:${from[1]}px`;
}

/** 配るカードの位置：山札は場のまん中。自分のカードは手札の並ぶ位置へ、CPUのカードはアイコンへ（山札からのずれを --tx・--ty に入れる） */
function layoutDeal(root: HTMLElement) {
  const box = root.querySelector<HTMLElement>('.fx.deal');
  const table = root.querySelector('.table');
  if (!box || !table) return;
  const o = box.getBoundingClientRect(), t = table.getBoundingClientRect();
  const cx = t.left + t.width / 2, cy = t.top + t.height / 2;
  box.style.setProperty('--deck-x', `${cx - o.left}px`);
  box.style.setProperty('--deck-y', `${cy - o.top}px`);
  const slots = [...root.querySelectorAll('.hand.dealing .card')];
  if (slots[0]) box.style.setProperty('--deal-cw', `${slots[0].getBoundingClientRect().width}px`);
  for (const card of box.querySelectorAll<HTMLElement>('.deal-card')) {
    const seat = card.dataset.seat;
    const el = seat === '0' ? slots[Number(card.dataset.slot)] : root.querySelector(`.opp[data-seat="${seat}"] .avatar`);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    card.style.setProperty('--tx', `${r.left + r.width / 2 - cx}px`);
    card.style.setProperty('--ty', `${r.top + r.height / 2 - cy}px`);
  }
}

/** 画面を描いたあとに呼ぶ。絵が読み込み前なら、読み込んだときに置く */
export function layoutArts(root: HTMLElement) {
  fitBandName(root);
  // 明朝の書体があとから読み込まれると名前の幅が変わるので、読み込み後にもう一度合わせる
  document.fonts?.ready.then(() => fitBandName(root));
  layoutFlash(root);
  layoutDeal(root);
  for (const img of root.querySelectorAll<HTMLImageElement>('img[data-head], img.fx-art')) {
    const place = () => {
      if (!img.isConnected || !img.naturalWidth) return;
      if (img.classList.contains('fx-art')) fxArt(img);
      else if (img.classList.contains('me-art')) gameArt(img);
      else centerArt(img, img.parentElement!);
    };
    if (img.complete) place();
    else img.addEventListener('load', place, { once: true });
  }
}
