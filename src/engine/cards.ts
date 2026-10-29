// カードは 0〜52 の数字で表す。id = マーク番号*13 + (数字-3)、ジョーカーは 52。
// 数字は 3〜15（11=J, 12=Q, 13=K, 14=A, 15=2）、ジョーカーの強さは 16。

export type Suit = 'S' | 'H' | 'D' | 'C';
export const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
export const JOKER = 52;
export const JOKER_RANK = 16;
export const MIN_RANK = 3;
export const MAX_RANK = 15;
export const DECK_SIZE = 53;

export const isJoker = (id: number): boolean => id === JOKER;
export const rankOf = (id: number): number => (id === JOKER ? JOKER_RANK : (id % 13) + 3);
export const suitOf = (id: number): Suit | null => (id === JOKER ? null : SUITS[Math.floor(id / 13)]);
export const cardId = (suit: Suit, rank: number): number => SUITS.indexOf(suit) * 13 + (rank - 3);

export const RANK_LABEL: Record<number, string> = {
  3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
  11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2', 16: 'JK',
};
export const SUIT_MARK: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };

export function cardLabel(id: number): string {
  if (id === JOKER) return 'JK';
  return SUIT_MARK[suitOf(id)!] + RANK_LABEL[rankOf(id)];
}

/** テスト用：'S3' 'H10' 'DQ' 'C2' 'JK' のような文字からカードを作る */
export function parseCard(text: string): number {
  if (text === 'JK') return JOKER;
  const suit = text[0] as Suit;
  const r = text.slice(1);
  const rank = Number(Object.keys(RANK_LABEL).find((k) => RANK_LABEL[Number(k)] === r));
  if (!SUITS.includes(suit) || !rank || rank > MAX_RANK) throw new Error('bad card ' + text);
  return cardId(suit, rank);
}
export const parseCards = (text: string): number[] => text.trim().split(/\s+/).filter(Boolean).map(parseCard);

/** 普通の強さでの並び順（弱い→強い、同じ数字はマーク順） */
export function sortHand(hand: number[]): number[] {
  return [...hand].sort((a, b) => rankOf(a) - rankOf(b) || a - b);
}

// --- 乱数（状態を数字1つで持つので、ゲーム状態ごと複製できる） ---
export function nextRandom(state: { seed: number }): number {
  let t = (state.seed = (state.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function shuffle<T>(arr: T[], rng: { seed: number }): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(nextRandom(rng) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
