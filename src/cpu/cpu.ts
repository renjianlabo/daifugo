// CPU（4章）。「今出せる手をすべて並べる（ルール処理）→ その中から選ぶ」で動く。
import { DECK_SIZE, JOKER, MAX_RANK, MIN_RANK, SUITS, cardId, isJoker, nextRandom, rankOf, shuffle, sortHand, suitOf } from '../engine/cards';
import { Play, effectsOf, isJokerSingle } from '../engine/plays';
import {
  PLAYERS, State, canPass, chooseBomber, chooseCards, cloneState, isActive, isReversed, listMoves, pass, play, topEntry,
} from '../engine/game';
import { PersonalityId } from '../characters';

export type Level = 'easy' | 'normal' | 'strong';
export const LEVEL_NAMES: Record<Level, string> = { easy: 'やさしい', normal: 'ふつう', strong: 'つよい' };

/** 作戦ルールの重み（性格で変わる） */
export interface Weights {
  revolution: number;
  keep: number;
  eight: number;
  lock: number;
}

export const PERSONALITY_WEIGHTS: Record<PersonalityId, Weights> = {
  balanced: { revolution: 1, keep: 1, eight: 1, lock: 1 },
  revolution: { revolution: 2.5, keep: 1, eight: 1, lock: 0.8 },
  keeper: { revolution: 0.8, keep: 2, eight: 0.8, lock: 1.2 },
  hasty: { revolution: 1, keep: 0.35, eight: 2, lock: 1 },
};

export interface CpuOptions {
  level: Level;
  weights: Weights;
  /** つよい：試し遊びの回数の上限（目安200） */
  rollouts?: number;
  /** つよい：考える時間の上限（ミリ秒） */
  timeLimitMs?: number;
}

export const EASY_FORGET = 0.3;
export const EASY_SECOND = 0.2;
export const STRONG_TOP = 5;
export const STRONG_ROLLOUTS = 200;
export const STRONG_TIME_MS = 1500;

type Rng = { seed: number };

// ---------------- 情報の整理 ----------------

/** みんなに見えたカード（場・捨て札） */
function publicCards(s: State): number[] {
  return [...s.discard, ...s.table.flatMap((t) => t.play.cards)];
}

/** その人から見て、まだ見ていないカード。forget の確率で「出たカード」を覚えていない扱いにする */
function unseenFor(s: State, p: number, forget: number, rng: Rng): Set<number> {
  const known = new Set<number>(s.hands[p]);
  for (const c of publicCards(s)) if (forget === 0 || nextRandom(rng) >= forget) known.add(c);
  const out = new Set<number>();
  for (let c = 0; c < DECK_SIZE; c++) if (!known.has(c)) out.add(c);
  return out;
}

/** 今の強さの向きでの強さ（0〜1、ジョーカーは1.1） */
function power(rank: number, reversed: boolean): number {
  if (rank >= 16) return 1.1;
  return reversed ? (MAX_RANK - rank) / 12 : (rank - MIN_RANK) / 12;
}
const isStrongCard = (c: number, reversed: boolean) => isJoker(c) || power(rankOf(c), reversed) >= 0.9;

function rankCounts(hand: number[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const c of hand) if (!isJoker(c)) m.set(rankOf(c), (m.get(rankOf(c)) ?? 0) + 1);
  return m;
}

/** 手札を出し切るのに必要なおおよその回数（数字の種類の数） */
function movesNeeded(hand: number[]): number {
  const n = rankCounts(hand).size;
  return n === 0 ? (hand.length > 0 ? 1 : 0) : n;
}

/** まだ見ていないカードで、この手より強い手が作れるか（作れなければ「最強」） */
function isBoss(p: Play, unseen: Set<number>, reversed: boolean): boolean {
  if (isJokerSingle(p)) return true;
  const joker = unseen.has(JOKER) ? 1 : 0;
  const stronger = (r: number) => (reversed ? r < p.rank : r > p.rank);
  if (p.type === 'single' || p.type === 'group') {
    if (p.type === 'single' && joker) return false;
    const cnt = new Map<number, number>();
    for (const c of unseen) if (!isJoker(c)) cnt.set(rankOf(c), (cnt.get(rankOf(c)) ?? 0) + 1);
    for (const [r, n] of cnt) if (stronger(r) && n + joker >= p.count) return false;
    return true;
  }
  for (const suit of SUITS) {
    for (let a = MIN_RANK; a + p.count - 1 <= MAX_RANK; a++) {
      if (!stronger(a)) continue;
      let miss = 0;
      for (let r = a; r < a + p.count; r++) if (!unseen.has(cardId(suit, r))) miss++;
      if (miss <= joker) return false;
    }
  }
  return true;
}

// ---------------- 作戦ルールで点をつける ----------------

interface Ctx {
  s: State;
  p: number;
  hand: number[];
  reversed: boolean;
  w: Weights;
  unseen: Set<number> | null;
  leading: boolean;
  dangerOpp: boolean;
  winning: boolean;
  before: number;
}

function makeCtx(s: State, p: number, w: Weights, unseen: Set<number> | null): Ctx {
  const hand = s.hands[p];
  const reversed = isReversed(s);
  const leading = s.table.length === 0;
  let dangerOpp = false;
  for (let i = 0; i < PLAYERS; i++) if (i !== p && isActive(s, i) && s.hands[i].length <= 2) dangerOpp = true;
  // 勝てる見込み：数字ごとにまとめて出したとき、最強でない組が1つ以下
  let winning = false;
  if (unseen) {
    let weak = 0;
    for (const [r, n] of rankCounts(hand)) {
      const ids = hand.filter((c) => !isJoker(c) && rankOf(c) === r);
      const pl: Play = { cards: ids, type: n === 1 ? 'single' : 'group', count: n, rank: r, suitKey: null };
      if (!isBoss(pl, unseen, reversed)) weak++;
    }
    winning = weak <= 1;
  }
  return { s, p, hand, reversed, w, unseen, leading, dangerOpp, winning, before: movesNeeded(hand) };
}

function scoreMove(ctx: Ctx, m: Play): number {
  const { s, reversed, w } = ctx;
  const after = ctx.hand.filter((c) => !m.cards.includes(c));
  if (after.length === 0) return 1000;
  const rules = s.rules;
  const eff = effectsOf(m);
  let score = 0;

  // 7渡し・10捨て：手札を減らせる。残りを全部手放せるなら、ほぼ上がり
  const handOut = (rules.sevenPass ? eff.sevenPass : 0) + (rules.tenDiscard ? eff.tenDiscard : 0);
  if (handOut > 0) score += after.length <= handOut ? 30 : handOut * 1.2;

  // 手札の「出す回数」が減るほど良い（組を崩すと減らない）
  score += (ctx.before - movesNeeded(after)) * 3;
  score += (m.count - 1) * 0.5;
  // 弱いカードから出す
  const pw = power(m.rank, reversed);
  score += (1 - Math.min(pw, 1)) * 2;

  // 強いカード（2・ジョーカー・A）は終盤まで残す
  const strongUsed = m.cards.filter((c) => isStrongCard(c, reversed)).length;
  const late = after.length <= 4 || ctx.winning;
  score -= strongUsed * 2 * w.keep * (late ? 0.15 : 1);

  // 勝てる見込みが高ければ、強いカード（最強の手）から出す
  if (ctx.winning && ctx.unseen && isBoss(m, ctx.unseen, reversed)) score += 6;
  // 相手がもうすぐ上がりそうなら、強い手で止める
  if (ctx.dangerOpp) score += pw * 2;

  // 親のとき：同じ枚数の組を多く作れる形から出す
  if (ctx.leading) {
    let same = 0;
    if (m.type === 'stair') same = 0;
    else for (const n of rankCounts(after).values()) if (m.type === 'single' ? n === 1 : n >= m.count) same++;
    score += Math.min(same, 4) * 0.6;
  }

  const strongLeft = after.filter((c) => isStrongCard(c, reversed)).length;
  const avgPower = after.reduce((a, c) => a + Math.min(power(rankOf(c), reversed), 1), 0) / after.length;

  // 8切り：親を取りたいとき（場にカードがあるとき）に使う
  if (rules.eightCut && eff.eightCut) score += w.eight * (ctx.leading ? 0.3 : 1.8);
  // 革命：手札が弱いときに起こす
  if (rules.revolution && eff.revolution) score += avgPower < 0.45 ? 4 * w.revolution : -3 / w.revolution;
  // 11バック：残りが弱いなら少し得
  if (rules.elevenBack && eff.elevenBack) score += avgPower < 0.45 ? 0.8 : -0.3;
  if (rules.fiveSkip && eff.skip) score += 0.3 * eff.skip;
  if (rules.twelveBomber && eff.bomber) score += 0.6 * eff.bomber;

  // しばり：強いカードを持っているときに起こす
  const top = topEntry(s);
  if (top && !s.lockSuit && !s.lockNum) {
    const mark = m.suitKey !== null && m.suitKey === top.effSuitKey && (rules.markLock || rules.gekiLock);
    const num = m.type !== 'stair' && !isJokerSingle(m) && m.rank === top.effRank + (reversed ? -1 : 1) && (rules.numLock || rules.gekiLock);
    if (mark || num) score += strongLeft >= 1 ? 1.5 * w.lock : -0.3;
  }
  return score;
}

function scorePass(ctx: Ctx): number {
  // 親のパスは損なだけなので、CPUはしない
  if (ctx.leading) return -100;
  if (ctx.dangerOpp) return -3;
  return 0.8;
}

export interface Scored { play: Play | null; score: number }

/** 作戦ルールで、出せる手（とパス）に点をつけて良い順に並べる */
export function rankMoves(s: State, p: number, w: Weights, unseen: Set<number> | null): Scored[] {
  const moves = listMoves(s, p);
  const ctx = makeCtx(s, p, w, unseen);
  const out: Scored[] = moves.map((m) => ({ play: m, score: scoreMove(ctx, m) }));
  if (canPass(s, p)) out.push({ play: null, score: scorePass(ctx) });
  out.sort((a, b) => b.score - a.score);
  return out;
}

// ---------------- 手を決める ----------------

export function decideMove(s: State, p: number, opt: CpuOptions, rng: Rng): Play | null {
  if (opt.level === 'easy') {
    const ranked = rankMoves(s, p, opt.weights, unseenFor(s, p, EASY_FORGET, rng));
    if (ranked.length >= 2 && nextRandom(rng) < EASY_SECOND) return ranked[1].play;
    return ranked[0]?.play ?? null;
  }
  const unseen = unseenFor(s, p, 0, rng);
  const ranked = rankMoves(s, p, opt.weights, unseen);
  if (opt.level === 'normal' || ranked.length <= 1) return ranked[0]?.play ?? null;
  if (ranked[0].score >= 1000) return ranked[0].play;
  return searchBest(s, p, ranked.slice(0, STRONG_TOP), unseen, opt, rng);
}

/** つよい：相手の手札をランダムに予想して最後まで試し遊びし、平均順位が一番良い手を選ぶ */
function searchBest(s: State, p: number, cands: Scored[], unseen: Set<number>, opt: CpuOptions, rng: Rng): Play | null {
  const budget = opt.rollouts ?? STRONG_ROLLOUTS;
  const limit = opt.timeLimitMs ?? STRONG_TIME_MS;
  const start = Date.now();
  const sum = cands.map(() => 0);
  const cnt = cands.map(() => 0);
  const pool = [...unseen];
  let n = 0;
  // 同じ予想手札で全候補を試し、候補どうしの差だけを比べる
  while (n + cands.length <= Math.max(budget, cands.length) && Date.now() - start < limit) {
    const deal = shuffle(pool, rng);
    cands.forEach((c, i) => {
      sum[i] += rollout(s, p, c.play, deal, rng);
      cnt[i]++;
    });
    n += cands.length;
  }
  let best = 0;
  let bestAvg = Infinity;
  cands.forEach((_, i) => {
    if (cnt[i] === 0) return;
    // 同じ平均なら作戦ルールの点が高い方（先に並んでいる方）
    const avg = sum[i] / cnt[i];
    if (avg < bestAvg - 1e-9) { bestAvg = avg; best = i; }
  });
  return cands[best].play;
}

const ROLLOUT_WEIGHTS = PERSONALITY_WEIGHTS.balanced;

function rollout(s: State, p: number, first: Play | null, cards: number[], rng: Rng): number {
  const t = cloneState(s);
  let k = 0;
  for (let i = 0; i < PLAYERS; i++) {
    if (i === p) continue;
    const n = t.hands[i].length;
    t.hands[i] = sortHand(cards.slice(k, k + n));
    k += n;
  }
  if (first) play(t, p, first);
  else pass(t, p);
  let steps = 0;
  while (t.phase === 'play' || t.phase === 'bomber' || t.phase === 'sevenPass' || t.phase === 'tenDiscard') {
    if (++steps > 3000) break;
    if (t.phase === 'bomber') {
      const pb = t.pendingBomber!;
      chooseBomber(t, pb.player, decideBomber(t, pb.player, rng, 0));
      continue;
    }
    if (t.phase === 'sevenPass' || t.phase === 'tenDiscard') {
      const pc = t.pendingCards!;
      chooseCards(t, pc.player, decideHandOut(t, pc.player, pc.count));
      continue;
    }
    const q = t.turn;
    const ranked = rankMoves(t, q, ROLLOUT_WEIGHTS, null);
    const m = ranked[0]?.play ?? null;
    if (m) play(t, q, m);
    else pass(t, q);
  }
  if (t.phase === 'roundEnd' || t.phase === 'gameEnd') return t.prevRanks![p];
  return 2.5;
}

/** 12ボンバー：自分が持っておらず、相手が持っていそうな数字を選ぶ */
export function decideBomber(s: State, p: number, rng: Rng, forget = 0): number[] {
  const unseen = unseenFor(s, p, forget, rng);
  const mine = rankCounts(s.hands[p]);
  const reversed = isReversed(s);
  const scores: { r: number; v: number }[] = [];
  for (let r = MIN_RANK; r <= MAX_RANK; r++) {
    let u = 0;
    for (const c of unseen) if (!isJoker(c) && rankOf(c) === r) u++;
    scores.push({ r, v: u * 2 - (mine.get(r) ?? 0) * 10 + power(r, reversed) + nextRandom(rng) * 0.01 });
  }
  scores.sort((a, b) => b.v - a.v);
  return scores.slice(0, s.pendingBomber?.count ?? 1).map((x) => x.r);
}

/** カード交換：弱いカードを渡す（組になっていないカードを優先） */
export function decideExchange(s: State, p: number, count: number): number[] {
  const hand = s.hands[p];
  const counts = rankCounts(hand);
  const key = (c: number) => (isJoker(c) ? 1000 : (counts.get(rankOf(c))! > 1 ? 100 : 0) + rankOf(c) * 4 + (suitOf(c) ? SUITS.indexOf(suitOf(c)!) : 0));
  return [...hand].sort((a, b) => key(a) - key(b)).slice(0, count);
}

/** 7渡し・10捨て：今の強さで弱い・組になっていないカードから選び、強いカードは残す */
export function decideHandOut(s: State, p: number, count: number): number[] {
  const hand = s.hands[p];
  if (hand.length <= count) return [...hand];
  const reversed = isReversed(s);
  const counts = rankCounts(hand);
  const key = (c: number) => (isJoker(c) ? 1000 : (counts.get(rankOf(c))! > 1 ? 10 : 0) + power(rankOf(c), reversed) * 5);
  return [...hand].sort((a, b) => key(a) - key(b)).slice(0, count);
}

/** 1手を決める（画面・テスト共通の入口） */
export interface CpuAction { kind: 'play' | 'pass' | 'bomber' | 'exchange' | 'cards'; play?: Play; ranks?: number[]; cards?: number[] }

export function cpuAct(s: State, p: number, opt: CpuOptions, rng: Rng): CpuAction | null {
  if (s.phase === 'exchange') {
    const t = s.pendingExchange.find((x) => x.from === p);
    return t ? { kind: 'exchange', cards: decideExchange(s, p, t.count) } : null;
  }
  if (s.phase === 'bomber' && s.pendingBomber?.player === p) {
    return { kind: 'bomber', ranks: decideBomber(s, p, rng, opt.level === 'easy' ? EASY_FORGET : 0) };
  }
  if ((s.phase === 'sevenPass' || s.phase === 'tenDiscard') && s.pendingCards?.player === p) {
    return { kind: 'cards', cards: decideHandOut(s, p, s.pendingCards.count) };
  }
  if (s.phase === 'play' && s.turn === p) {
    const m = decideMove(s, p, opt, rng);
    return m ? { kind: 'play', play: m } : { kind: 'pass' };
  }
  return null;
}
