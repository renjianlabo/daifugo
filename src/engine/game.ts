// ゲームの進行（ルール処理の本体）。画面なしで動く。
import { DECK_SIZE, JOKER_RANK, MAX_RANK, MIN_RANK, cardId, isJoker, nextRandom, rankOf, shuffle, sortHand } from './cards';
import { Effects, Play, PlayType, effectsOf, enumeratePlays, interpret, isJokerSingle } from './plays';

export const PLAYERS = 4;
export const ROUNDS = 3;
export const POINTS = [3, 2, 1, 0];
export const RANK_NAMES = ['大富豪', '富豪', '貧民', '大貧民'];

export interface Rules {
  eightCut: boolean;
  fiveSkip: boolean;
  elevenBack: boolean;
  twelveBomber: boolean;
  revolution: boolean;
  markLock: boolean;
  numLock: boolean;
  gekiLock: boolean;
  exchange: boolean;
  miyakoOchi: boolean;
  sevenPass: boolean;
  tenDiscard: boolean;
}

export const DEFAULT_RULES: Rules = {
  eightCut: true, fiveSkip: true, elevenBack: true, twelveBomber: true, revolution: true,
  markLock: true, numLock: true, gekiLock: true, exchange: true, miyakoOchi: false,
  sevenPass: true, tenDiscard: true,
};

export const RULE_NAMES: Record<keyof Rules, string> = {
  eightCut: '8切り', fiveSkip: '5スキップ', elevenBack: '11バック', twelveBomber: '12ボンバー',
  revolution: '革命', markLock: 'マークしばり', numLock: '数しば', gekiLock: '激しば',
  exchange: 'カード交換', miyakoOchi: '都落ち', sevenPass: '7渡し', tenDiscard: '10捨て',
};

export type Phase = 'exchange' | 'play' | 'bomber' | 'sevenPass' | 'tenDiscard' | 'roundEnd' | 'gameEnd';

export interface TableEntry {
  player: number;
  play: Play;
  /** しばりの判定に使う数字（ジョーカー1枚出しは、求められた数字として扱う） */
  effRank: number;
  /** しばりの判定に使うマークの組み合わせ */
  effSuitKey: string | null;
}

export type GameEvent =
  | { type: 'roundStart'; round: number }
  | { type: 'exchange'; from: number; to: number; cards: number[] }
  | { type: 'play'; player: number; play: Play }
  | { type: 'joker'; player: number }
  | { type: 'pass'; player: number }
  | { type: 'skip'; player: number }
  | { type: 'flush'; leader: number }
  | { type: 'revolution'; player: number; active: boolean }
  | { type: 'elevenBack'; player: number; active: boolean }
  | { type: 'eightCut'; player: number }
  /** 手札を動かす効果が始まった（これから数字・カードを選ぶ）。画面の演出用 */
  | { type: 'effectStart'; kind: 'bomber' | 'sevenPass' | 'tenDiscard'; player: number }
  | { type: 'bomber'; player: number; ranks: number[]; removed: number[][] }
  | { type: 'sevenPass'; from: number; to: number; cards: number[] }
  | { type: 'tenDiscard'; player: number; cards: number[] }
  /** suits はしばったマーク（マークしばり・激しばのとき） */
  | { type: 'lock'; kind: LockKind; player: number; suits: string | null }
  | { type: 'finish'; player: number; rank: number }
  | { type: 'fall'; player: number }
  | { type: 'roundEnd'; round: number; ranks: number[]; points: number[] }
  | { type: 'gameEnd'; order: number[] };

export type LockKind = 'mark' | 'num' | 'geki';

export interface ExchangeTask { from: number; to: number; count: number }

/** 7渡し・10捨てで、カードを選んでいる途中の情報。count はちょうど選ぶ枚数（手札が少なければ手札の枚数） */
export interface PendingCards { kind: 'sevenPass' | 'tenDiscard'; player: number; count: number; to: number | null; eff: Effects }

export interface State {
  rules: Rules;
  seed: number;
  round: number;
  hands: number[][];
  table: TableEntry[];
  discard: number[];
  turn: number;
  lastPlayer: number | null;
  passed: boolean[];
  revolution: boolean;
  elevenBack: boolean;
  lockSuit: string | null;
  lockNum: boolean;
  /** 上がった順（最後に残った人も最後に入る） */
  finished: number[];
  /** 都落ちした人 */
  fallen: number[];
  phase: Phase;
  pendingBomber: { player: number; count: number; eff: Effects } | null;
  pendingCards: PendingCards | null;
  pendingExchange: ExchangeTask[];
  /** 前の回の順位（1〜4）。1回戦目は null */
  prevRanks: number[] | null;
  scores: number[];
  roundRanks: number[][];
  finalOrder: number[] | null;
  events: GameEvent[];
}

// ---------------- 作る・複製する ----------------

export function newGame(rules: Rules, seed: number): State {
  const s: State = {
    rules: { ...rules }, seed: seed | 0, round: 0,
    hands: [[], [], [], []], table: [], discard: [], turn: 0, lastPlayer: null,
    passed: [false, false, false, false], revolution: false, elevenBack: false,
    lockSuit: null, lockNum: false, finished: [], fallen: [], phase: 'play',
    pendingBomber: null, pendingCards: null, pendingExchange: [], prevRanks: null,
    scores: [0, 0, 0, 0], roundRanks: [], finalOrder: null, events: [],
  };
  startRound(s);
  return s;
}

/** 試し遊び用の複製（events は空にする） */
export function cloneState(s: State): State {
  return {
    ...s,
    rules: s.rules,
    hands: s.hands.map((h) => [...h]),
    table: [...s.table],
    discard: [...s.discard],
    passed: [...s.passed],
    finished: [...s.finished],
    fallen: [...s.fallen],
    pendingBomber: s.pendingBomber ? { ...s.pendingBomber } : null,
    pendingCards: s.pendingCards ? { ...s.pendingCards } : null,
    pendingExchange: s.pendingExchange.map((t) => ({ ...t })),
    prevRanks: s.prevRanks ? [...s.prevRanks] : null,
    scores: [...s.scores],
    roundRanks: s.roundRanks.map((r) => [...r]),
    finalOrder: s.finalOrder ? [...s.finalOrder] : null,
    events: [],
  };
}

function emit(s: State, e: GameEvent) {
  s.events.push(e);
}

// ---------------- 回の始め ----------------

const strengthNormal = (c: number) => rankOf(c) * 4 + (isJoker(c) ? 0 : 3 - Math.floor(c / 13));

function startRound(s: State) {
  s.round += 1;
  const deck = shuffle(Array.from({ length: DECK_SIZE }, (_, i) => i), s);
  const first = Math.floor(nextRandom(s) * PLAYERS);
  s.hands = [[], [], [], []];
  deck.forEach((c, i) => s.hands[(first + i) % PLAYERS].push(c));
  s.hands = s.hands.map(sortHand);
  s.table = [];
  s.discard = [];
  s.lastPlayer = null;
  s.passed = [false, false, false, false];
  s.revolution = false;
  s.elevenBack = false;
  s.lockSuit = null;
  s.lockNum = false;
  s.finished = [];
  s.fallen = [];
  s.pendingBomber = null;
  s.pendingCards = null;
  s.pendingExchange = [];
  emit(s, { type: 'roundStart', round: s.round });

  if (s.round === 1 || !s.prevRanks) {
    const d3 = cardId('D', 3);
    s.turn = s.hands.findIndex((h) => h.includes(d3));
  } else {
    s.turn = s.prevRanks.indexOf(4);
  }
  s.phase = 'play';

  if (s.round >= 2 && s.prevRanks && s.rules.exchange) {
    const who = (r: number) => s.prevRanks!.indexOf(r);
    // 貧しい側は一番強いカードを自動で渡す
    autoGive(s, who(4), who(1), 2);
    autoGive(s, who(3), who(2), 1);
    // 豊かな側は好きなカードを選んで渡す
    s.pendingExchange = [
      { from: who(1), to: who(4), count: 2 },
      { from: who(2), to: who(3), count: 1 },
    ];
    s.phase = 'exchange';
  }
}

function autoGive(s: State, from: number, to: number, count: number) {
  const give = [...s.hands[from]].sort((a, b) => strengthNormal(b) - strengthNormal(a)).slice(0, count);
  moveCards(s, from, to, give);
}

function moveCards(s: State, from: number, to: number, cards: number[]) {
  s.hands[from] = s.hands[from].filter((c) => !cards.includes(c));
  s.hands[to] = sortHand([...s.hands[to], ...cards]);
  emit(s, { type: 'exchange', from, to, cards });
}

/** 大富豪・富豪が渡すカードを決める */
export function giveExchange(s: State, from: number, cards: number[]) {
  if (s.phase !== 'exchange') throw new Error('交換の時間ではない');
  const task = s.pendingExchange.find((t) => t.from === from);
  if (!task) throw new Error('この人は交換しない');
  if (cards.length !== task.count || new Set(cards).size !== cards.length) throw new Error('枚数が違う');
  if (cards.some((c) => !s.hands[from].includes(c))) throw new Error('持っていないカード');
  moveCards(s, from, task.to, cards);
  s.pendingExchange = s.pendingExchange.filter((t) => t !== task);
  if (s.pendingExchange.length === 0) s.phase = 'play';
}

// ---------------- 状態を調べる ----------------

export const isReversed = (s: State): boolean => s.revolution !== s.elevenBack;
export const isActive = (s: State, i: number): boolean => !s.finished.includes(i) && !s.fallen.includes(i);
export const activeCount = (s: State): number => [0, 1, 2, 3].filter((i) => isActive(s, i)).length;

export function nextActive(s: State, i: number): number {
  for (let k = 1; k <= PLAYERS; k++) {
    const j = (i + k) % PLAYERS;
    if (isActive(s, j)) return j;
  }
  return -1;
}

export function lockKind(s: State): LockKind | null {
  if (s.lockSuit && s.lockNum) return 'geki';
  if (s.lockSuit) return 'mark';
  if (s.lockNum) return 'num';
  return null;
}

export const topEntry = (s: State): TableEntry | null => (s.table.length ? s.table[s.table.length - 1] : null);

/** 数しば中に求められている数字 */
export function requiredRank(s: State): number | null {
  const top = topEntry(s);
  if (!s.lockNum || !top) return null;
  return top.effRank + (isReversed(s) ? -1 : 1);
}

function beats(top: Play, p: Play, reversed: boolean): boolean {
  if (p.type === 'single') {
    if (isJokerSingle(top)) return false;
    if (isJokerSingle(p)) return true;
  }
  return reversed ? p.rank < top.rank : p.rank > top.rank;
}

function matchesSuitLock(p: Play, lock: string): boolean {
  if (p.type === 'stair') return p.suitKey === lock;
  if (isJokerSingle(p)) return true;
  const realSuits = p.cards.filter((c) => !isJoker(c)).map((c) => 'SHDC'[Math.floor(c / 13)]);
  return realSuits.every((x) => lock.includes(x));
}

/** 場の状態を見て、その出し方が出せるか */
export function canPlay(s: State, p: Play): boolean {
  const top = topEntry(s);
  if (!top) return true;
  if (p.type !== top.play.type || p.count !== top.play.count) return false;
  if (!beats(top.play, p, isReversed(s))) return false;
  if (s.lockSuit && !matchesSuitLock(p, s.lockSuit)) return false;
  if (s.lockNum && p.type !== 'stair') {
    const req = requiredRank(s)!;
    if (isJokerSingle(p)) return req >= MIN_RANK && req <= MAX_RANK;
    if (p.rank !== req) return false;
  }
  return true;
}

/** 今出せる手をすべて並べる（パスは含まない） */
export function listMoves(s: State, player: number): Play[] {
  if (s.phase !== 'play' || s.turn !== player) return [];
  const top = topEntry(s);
  const filter = top ? { type: top.play.type, count: top.play.count } : undefined;
  return enumeratePlays(s.hands[player], filter).filter((p) => canPlay(s, p));
}

export function canPass(s: State, player: number): boolean {
  return s.phase === 'play' && s.turn === player;
}

/** 選んだカードで出せる出し方（画面用） */
export function findPlays(s: State, player: number, cards: number[]): Play[] {
  if (s.phase !== 'play' || s.turn !== player) return [];
  if (cards.some((c) => !s.hands[player].includes(c))) return [];
  return interpret(cards).filter((p) => canPlay(s, p));
}

export function totalCards(s: State): number {
  return s.hands.reduce((n, h) => n + h.length, 0) + s.table.reduce((n, t) => n + t.play.cards.length, 0) + s.discard.length;
}

// ---------------- 出す・パス ----------------

export function play(s: State, player: number, p: Play) {
  if (s.phase !== 'play') throw new Error('出せる時間ではない');
  if (s.turn !== player) throw new Error('自分の番ではない');
  if (p.cards.some((c) => !s.hands[player].includes(c))) throw new Error('持っていないカード');
  if (!interpret(p.cards).some((q) => q.type === p.type && q.rank === p.rank && q.jokerRank === p.jokerRank)) {
    throw new Error('出し方として正しくない');
  }
  if (!canPlay(s, p)) throw new Error('場に出せない');

  const prev = topEntry(s);
  const reversedBefore = isReversed(s);
  let effRank = p.rank;
  let effSuitKey = p.suitKey;
  if (isJokerSingle(p) && s.lockNum && prev) effRank = requiredRank(s)!;
  if (s.lockSuit && effSuitKey === null) effSuitKey = s.lockSuit;

  s.hands[player] = s.hands[player].filter((c) => !p.cards.includes(c));
  s.table = [...s.table, { player, play: p, effRank, effSuitKey }];
  s.lastPlayer = player;
  s.passed = [false, false, false, false];
  emit(s, { type: 'play', player, play: p });
  if (p.cards.some(isJoker)) emit(s, { type: 'joker', player });

  if (prev) updateLocks(s, player, prev, s.table[s.table.length - 1], reversedBefore);

  if (s.hands[player].length === 0) finishPlayer(s, player);
  if (checkRoundEnd(s)) return;

  const raw = effectsOf(p);
  const r = s.rules;
  const eff: Effects = {
    bomber: r.twelveBomber ? raw.bomber : 0,
    sevenPass: r.sevenPass ? raw.sevenPass : 0,
    tenDiscard: r.tenDiscard ? raw.tenDiscard : 0,
    revolution: r.revolution && raw.revolution,
    elevenBack: r.elevenBack && raw.elevenBack,
    eightCut: r.eightCut && raw.eightCut,
    skip: r.fiveSkip ? raw.skip : 0,
  };
  resumeEffects(s, player, eff);
}

/** 手札を動かす効果（12ボンバー → 7渡し → 10捨て）を順に待ち、終わったら場の効果へ進む */
function resumeEffects(s: State, player: number, eff: Effects) {
  if (eff.bomber > 0) {
    s.pendingBomber = { player, count: eff.bomber, eff };
    s.phase = 'bomber';
    emit(s, { type: 'effectStart', kind: 'bomber', player });
    return;
  }
  // 手札が0枚（出して上がった）なら、渡す・捨てるカードがないので起きない
  const left = s.hands[player].length;
  if (eff.sevenPass > 0 && left > 0) {
    s.pendingCards = { kind: 'sevenPass', player, count: Math.min(eff.sevenPass, left), to: nextActive(s, player), eff };
    s.phase = 'sevenPass';
    emit(s, { type: 'effectStart', kind: 'sevenPass', player });
    return;
  }
  if (eff.tenDiscard > 0 && left > 0) {
    s.pendingCards = { kind: 'tenDiscard', player, count: Math.min(eff.tenDiscard, left), to: null, eff };
    s.phase = 'tenDiscard';
    emit(s, { type: 'effectStart', kind: 'tenDiscard', player });
    return;
  }
  continueEffects(s, player, eff);
}

/** 7渡し・10捨てで渡す（捨てる）カードを決める。ちょうど count 枚 */
export function chooseCards(s: State, player: number, cards: number[]) {
  const pc = s.pendingCards;
  if ((s.phase !== 'sevenPass' && s.phase !== 'tenDiscard') || !pc || pc.player !== player) throw new Error('カードを選ぶ時間ではない');
  if (cards.length !== pc.count || new Set(cards).size !== cards.length) throw new Error('枚数が違う');
  if (cards.some((c) => !s.hands[player].includes(c))) throw new Error('持っていないカード');
  s.hands[player] = s.hands[player].filter((c) => !cards.includes(c));
  if (pc.kind === 'sevenPass') {
    s.hands[pc.to!] = sortHand([...s.hands[pc.to!], ...cards]);
    emit(s, { type: 'sevenPass', from: player, to: pc.to!, cards });
  } else {
    s.discard.push(...cards);
    emit(s, { type: 'tenDiscard', player, cards });
  }
  s.pendingCards = null;
  s.phase = 'play';
  if (s.hands[player].length === 0) finishPlayer(s, player);
  if (checkRoundEnd(s)) return;
  resumeEffects(s, player, { ...pc.eff, [pc.kind]: 0 });
}

function updateLocks(s: State, player: number, prev: TableEntry, cur: TableEntry, reversed: boolean) {
  const r = s.rules;
  const markCond = !s.lockSuit && prev.effSuitKey !== null && prev.effSuitKey === cur.effSuitKey && !isJokerSingle(cur.play);
  const numCond = !s.lockNum && cur.play.type !== 'stair' && !isJokerSingle(prev.play) && !isJokerSingle(cur.play)
    && cur.effRank === prev.effRank + (reversed ? -1 : 1);
  let newMark = markCond && r.markLock;
  let newNum = numCond && r.numLock;
  if (markCond && numCond && r.gekiLock) { newMark = true; newNum = true; }
  // 激しばがオフなら、マークしばりと数しばは同時に効かない（マークしばりを優先）
  if (!r.gekiLock && (s.lockSuit !== null || newMark) && (s.lockNum || newNum)) {
    if (newNum) newNum = false;
    else newMark = false;
  }
  if (!newMark && !newNum) return;
  if (newMark) s.lockSuit = cur.effSuitKey;
  if (newNum) s.lockNum = true;
  emit(s, { type: 'lock', kind: lockKind(s)!, player, suits: s.lockSuit });
}

function continueEffects(s: State, player: number, eff: Effects) {
  if (eff.revolution) {
    s.revolution = !s.revolution;
    emit(s, { type: 'revolution', player, active: s.revolution });
  }
  // 11バック中にもう一度Jが出ても、逆のまま変わらない
  if (eff.elevenBack && !s.elevenBack) {
    s.elevenBack = true;
    emit(s, { type: 'elevenBack', player, active: true });
  }
  if (eff.eightCut) {
    emit(s, { type: 'eightCut', player });
    flush(s, leaderAfter(s, player));
    return;
  }
  advanceTurn(s, player, eff.skip);
}

/** 12ボンバーで捨てる数字を選ぶ */
export function chooseBomber(s: State, player: number, ranks: number[]) {
  const pb = s.pendingBomber;
  if (s.phase !== 'bomber' || !pb || pb.player !== player) throw new Error('数字を選ぶ時間ではない');
  if (ranks.length !== pb.count || new Set(ranks).size !== ranks.length) throw new Error('数字の数が違う');
  if (ranks.some((r) => r < MIN_RANK || r > MAX_RANK)) throw new Error('選べない数字');
  const removed: number[][] = [];
  for (let i = 0; i < PLAYERS; i++) {
    const out = s.hands[i].filter((c) => !isJoker(c) && ranks.includes(rankOf(c)));
    s.hands[i] = s.hands[i].filter((c) => !out.includes(c));
    s.discard.push(...out);
    removed.push(out);
  }
  emit(s, { type: 'bomber', player, ranks: [...ranks].sort((a, b) => a - b), removed });
  s.pendingBomber = null;
  s.phase = 'play';
  // 手札が0枚になった人は、出した人から順に上がる
  for (let k = 0; k < PLAYERS; k++) {
    const i = (player + k) % PLAYERS;
    if (isActive(s, i) && s.hands[i].length === 0) finishPlayer(s, i);
  }
  if (checkRoundEnd(s)) return;
  resumeEffects(s, player, { ...pb.eff, bomber: 0 });
}

export function pass(s: State, player: number) {
  if (!canPass(s, player)) throw new Error('パスできない');
  s.passed[player] = true;
  emit(s, { type: 'pass', player });
  // 親（場が空）のパス：次の人が親になる。全員がパスしたら、パスの印を消して続ける
  if (s.table.length === 0) {
    if ([0, 1, 2, 3].every((i) => !isActive(s, i) || s.passed[i])) s.passed = [false, false, false, false];
    s.turn = nextActive(s, player);
    return;
  }
  if (allOthersPassed(s)) {
    flush(s, leaderAfter(s, s.lastPlayer!));
    return;
  }
  s.turn = nextActive(s, player);
}

function allOthersPassed(s: State): boolean {
  for (let i = 0; i < PLAYERS; i++) if (isActive(s, i) && i !== s.lastPlayer && !s.passed[i]) return false;
  return true;
}

/** 親になる人：その人がまだ残っていればその人、上がっていれば次の人 */
function leaderAfter(s: State, player: number): number {
  return isActive(s, player) ? player : nextActive(s, player);
}

function advanceTurn(s: State, player: number, skip: number) {
  let cur = nextActive(s, player);
  let remaining = skip;
  while (remaining > 0 && !allOthersPassed(s)) {
    if (cur === s.lastPlayer) break;
    s.passed[cur] = true;
    emit(s, { type: 'skip', player: cur });
    remaining--;
    cur = nextActive(s, cur);
  }
  if (allOthersPassed(s)) {
    flush(s, leaderAfter(s, s.lastPlayer!));
    return;
  }
  s.turn = cur;
}

function flush(s: State, leader: number) {
  for (const t of s.table) s.discard.push(...t.play.cards);
  s.table = [];
  s.lastPlayer = null;
  s.passed = [false, false, false, false];
  s.elevenBack = false;
  s.lockSuit = null;
  s.lockNum = false;
  s.turn = leader;
  emit(s, { type: 'flush', leader });
}

function finishPlayer(s: State, player: number) {
  s.finished.push(player);
  emit(s, { type: 'finish', player, rank: s.finished.length });
  // 都落ち
  if (s.rules.miyakoOchi && s.prevRanks && s.finished.length === 1) {
    const prevTop = s.prevRanks.indexOf(1);
    if (prevTop !== player && isActive(s, prevTop)) {
      s.fallen.push(prevTop);
      s.discard.push(...s.hands[prevTop]);
      s.hands[prevTop] = [];
      emit(s, { type: 'fall', player: prevTop });
    }
  }
}

/** ランク（1〜4）を人ごとに返す */
export function currentRanks(s: State): number[] {
  const ranks = [0, 0, 0, 0];
  s.finished.forEach((p, i) => (ranks[p] = i + 1));
  s.fallen.forEach((p, j) => (ranks[p] = PLAYERS - j));
  return ranks;
}

function checkRoundEnd(s: State): boolean {
  if (activeCount(s) > 1) return false;
  const last = [0, 1, 2, 3].find((i) => isActive(s, i));
  if (last !== undefined) {
    s.finished.push(last);
    s.discard.push(...s.hands[last]);
    s.hands[last] = [];
    // 最後に残った人も、その順位で上がったことを知らせる（4位の演出を出すため）
    emit(s, { type: 'finish', player: last, rank: s.finished.length });
  }
  for (const t of s.table) s.discard.push(...t.play.cards);
  s.table = [];
  s.pendingBomber = null;
  s.pendingCards = null;
  const ranks = currentRanks(s);
  const points = ranks.map((r) => POINTS[r - 1]);
  points.forEach((p, i) => (s.scores[i] += p));
  s.roundRanks.push(ranks);
  s.prevRanks = ranks;
  s.phase = 'roundEnd';
  emit(s, { type: 'roundEnd', round: s.round, ranks, points });
  return true;
}

/** 次の回へ。3回戦が終わっていれば最終結果にする */
export function nextRound(s: State) {
  if (s.phase !== 'roundEnd') throw new Error('回が終わっていない');
  if (s.round >= ROUNDS) {
    const last = s.roundRanks[s.roundRanks.length - 1];
    s.finalOrder = [0, 1, 2, 3].sort((a, b) => s.scores[b] - s.scores[a] || last[a] - last[b]);
    s.phase = 'gameEnd';
    emit(s, { type: 'gameEnd', order: s.finalOrder });
    return;
  }
  startRound(s);
}

/** 自動テスト用：状態を直接作る */
export function makeTestState(opts: {
  hands: number[][];
  rules?: Partial<Rules>;
  turn?: number;
  table?: { player: number; play: Play }[];
  revolution?: boolean;
  elevenBack?: boolean;
  prevRanks?: number[] | null;
  round?: number;
}): State {
  const s = newGame({ ...DEFAULT_RULES, ...opts.rules }, 1);
  s.round = opts.round ?? 1;
  s.phase = 'play';
  s.pendingExchange = [];
  s.events = [];
  s.hands = opts.hands.map(sortHand);
  const used = new Set(s.hands.flat());
  s.table = [];
  s.discard = [];
  s.turn = opts.turn ?? 0;
  s.revolution = !!opts.revolution;
  s.elevenBack = !!opts.elevenBack;
  s.prevRanks = opts.prevRanks ?? null;
  for (const t of opts.table ?? []) {
    s.table.push({ player: t.player, play: t.play, effRank: t.play.rank, effSuitKey: t.play.suitKey });
    t.play.cards.forEach((c) => used.add(c));
    s.lastPlayer = t.player;
  }
  for (let c = 0; c < DECK_SIZE; c++) if (!used.has(c)) s.discard.push(c);
  return s;
}

export type { Play, PlayType };
export { JOKER_RANK };
