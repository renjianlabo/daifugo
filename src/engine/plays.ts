// 出し方（1枚出し・重ね数字・階段）の判定と列挙。場の状態は見ない。
import { JOKER, JOKER_RANK, MAX_RANK, MIN_RANK, SUITS, Suit, cardId, isJoker, rankOf, suitOf } from './cards';

export type PlayType = 'single' | 'group' | 'stair';

export interface Play {
  cards: number[];
  type: PlayType;
  count: number;
  /** 1枚出し：数字（ジョーカーは16）／重ね数字：数字／階段：一番弱いカードの数字 */
  rank: number;
  /** マークの組み合わせ（並べ替えた文字）。ジョーカー1枚出しと、ジョーカー入り重ね数字は null */
  suitKey: string | null;
  /** 階段でジョーカーが代わりをしている数字 */
  jokerRank?: number;
}

export interface Effects {
  bomber: number;
  /** 7渡し：渡す枚数 */
  sevenPass: number;
  /** 10捨て：捨てる枚数 */
  tenDiscard: number;
  revolution: boolean;
  elevenBack: boolean;
  eightCut: boolean;
  skip: number;
}

const sortIds = (ids: number[]) => [...ids].sort((a, b) => a - b);

export function playKey(p: Play): string {
  return p.type + ':' + p.rank + ':' + (p.jokerRank ?? '') + ':' + sortIds(p.cards).join(',');
}

export function isJokerSingle(p: Play): boolean {
  return p.type === 'single' && isJoker(p.cards[0]);
}

function single(id: number): Play {
  return { cards: [id], type: 'single', count: 1, rank: rankOf(id), suitKey: isJoker(id) ? null : suitOf(id)! };
}

function group(ids: number[]): Play | null {
  if (ids.length < 2 || ids.length > 4) return null;
  const real = ids.filter((c) => !isJoker(c));
  if (real.length === 0 || ids.length - real.length > 1) return null;
  const r = rankOf(real[0]);
  if (real.some((c) => rankOf(c) !== r)) return null;
  const hasJoker = real.length < ids.length;
  return {
    cards: sortIds(ids), type: 'group', count: ids.length, rank: r,
    suitKey: hasJoker ? null : real.map((c) => suitOf(c)!).sort().join(''),
  };
}

function stairs(ids: number[]): Play[] {
  if (ids.length < 3) return [];
  const real = ids.filter((c) => !isJoker(c));
  const jokers = ids.length - real.length;
  if (jokers > 1 || real.length < 2) return [];
  const suit = suitOf(real[0])!;
  if (real.some((c) => suitOf(c) !== suit)) return [];
  const ranks = real.map(rankOf).sort((a, b) => a - b);
  for (let i = 1; i < ranks.length; i++) if (ranks[i] === ranks[i - 1]) return [];
  const lo = ranks[0];
  const hi = ranks[ranks.length - 1];
  const span = hi - lo + 1;
  const n = ids.length;
  const base = { cards: sortIds(ids), type: 'stair' as const, count: n, suitKey: suit };
  if (jokers === 0) return span === n ? [{ ...base, rank: lo }] : [];
  if (span === n) {
    // ジョーカーが穴を埋める
    const hole = Array.from({ length: span }, (_, k) => lo + k).find((r) => !ranks.includes(r))!;
    return [{ ...base, rank: lo, jokerRank: hole }];
  }
  if (span === n - 1) {
    const out: Play[] = [];
    if (lo - 1 >= MIN_RANK) out.push({ ...base, rank: lo - 1, jokerRank: lo - 1 });
    if (hi + 1 <= MAX_RANK) out.push({ ...base, rank: lo, jokerRank: hi + 1 });
    return out;
  }
  return [];
}

/** そのカードの組で出せる出し方をすべて返す（場は見ない） */
export function interpret(ids: number[]): Play[] {
  if (ids.length === 0) return [];
  if (new Set(ids).size !== ids.length) return [];
  if (ids.length === 1) return [single(ids[0])];
  const out: Play[] = [];
  const g = group(ids);
  if (g) out.push(g);
  out.push(...stairs(ids));
  return out;
}

function subsets<T>(arr: T[], k: number): T[][] {
  const out: T[][] = [];
  const rec = (start: number, cur: T[]) => {
    if (cur.length === k) { out.push([...cur]); return; }
    for (let i = start; i < arr.length; i++) { cur.push(arr[i]); rec(i + 1, cur); cur.pop(); }
  };
  rec(0, []);
  return out;
}

/** 手札から作れる出し方をすべて並べる。filter があればその形だけ */
export function enumeratePlays(hand: number[], filter?: { type: PlayType; count: number }): Play[] {
  const out: Play[] = [];
  const hasJoker = hand.includes(JOKER);
  const want = (t: PlayType, n?: number) => !filter || (filter.type === t && (n === undefined || filter.count === n));

  if (want('single', 1)) for (const c of hand) out.push(single(c));

  if (want('group')) {
    const byRank = new Map<number, number[]>();
    for (const c of hand) if (!isJoker(c)) byRank.set(rankOf(c), [...(byRank.get(rankOf(c)) ?? []), c]);
    for (const cards of byRank.values()) {
      for (let k = 2; k <= 4; k++) {
        if (filter && filter.count !== k) continue;
        if (cards.length >= k) for (const s of subsets(cards, k)) out.push(group(s)!);
        if (hasJoker && cards.length >= k - 1) for (const s of subsets(cards, k - 1)) out.push(group([...s, JOKER])!);
      }
    }
  }

  if (want('stair')) {
    const handSet = new Set(hand);
    for (const suit of SUITS as Suit[]) {
      for (let a = MIN_RANK; a <= MAX_RANK - 2; a++) {
        const missing: number[] = [];
        for (let b = a; b <= MAX_RANK; b++) {
          if (!handSet.has(cardId(suit, b))) missing.push(b);
          if (missing.length > (hasJoker ? 1 : 0)) break;
          const len = b - a + 1;
          if (len < 3) continue;
          if (filter && filter.count !== len) continue;
          const realRanks: number[] = [];
          for (let r = a; r <= b; r++) if (!missing.includes(r)) realRanks.push(r);
          const ids = realRanks.map((r) => cardId(suit, r));
          if (missing.length === 1) {
            out.push({ cards: sortIds([...ids, JOKER]), type: 'stair', count: len, rank: a, suitKey: suit, jokerRank: missing[0] });
          } else {
            out.push({ cards: sortIds(ids), type: 'stair', count: len, rank: a, suitKey: suit });
            if (hasJoker) {
              // 持っているカードの代わりにジョーカーを使う出し方
              for (const r of realRanks) {
                const rest = ids.filter((c) => c !== cardId(suit, r));
                out.push({ cards: sortIds([...rest, JOKER]), type: 'stair', count: len, rank: a, suitKey: suit, jokerRank: r });
              }
            }
          }
        }
      }
    }
  }
  return out;
}

/** 特別なカードの効果（ルールのオン/オフは見ない）。3.2「ジョーカーの数え方」に従う */
export function effectsOf(p: Play): Effects {
  const special = (r: number): number => {
    if (p.type === 'group') return p.rank === r ? p.count : 0;
    // 階段のジョーカーは、代わりをしている数字として数える（例：♥6・ジョーカー・♥8 → 7が1枚）
    const real = p.cards.filter((c) => !isJoker(c) && rankOf(c) === r).length;
    return real + (p.type === 'stair' && p.jokerRank === r ? 1 : 0);
  };
  return {
    bomber: special(12),
    sevenPass: special(7),
    tenDiscard: special(10),
    revolution: (p.type === 'group' && p.count === 4) || (p.type === 'stair' && p.count >= 4),
    elevenBack: special(11) > 0,
    eightCut: special(8) > 0,
    skip: special(5),
  };
}

export { JOKER_RANK };
