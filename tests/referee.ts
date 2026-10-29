// ルール処理とは別に書いた「審判」。出された手がルール違反でないかを確かめる。
import { JOKER, MAX_RANK, MIN_RANK, isJoker, rankOf, suitOf } from '../src/engine/cards';
import { Play } from '../src/engine/plays';
import { State, findPlays, listMoves, totalCards } from '../src/engine/game';

export function refereeCheck(s: State, player: number, p: Play): string | null {
  const hand = s.hands[player];
  if (s.phase !== 'play' || s.turn !== player) return '番ではない';
  if (p.cards.some((c) => !hand.includes(c))) return '持っていないカード';
  if (new Set(p.cards).size !== p.cards.length) return '同じカードを2回';
  const real = p.cards.filter((c) => !isJoker(c));
  const jokers = p.cards.length - real.length;
  if (p.count !== p.cards.length) return '枚数が合わない';
  if (p.type === 'single' && p.count !== 1) return '1枚出しが1枚でない';
  if (p.type === 'group') {
    if (p.count < 2 || p.count > 4 || real.length < 1) return '重ね数字の枚数';
    if (real.some((c) => rankOf(c) !== p.rank)) return '重ね数字の数字が違う';
  }
  if (p.type === 'stair') {
    if (p.count < 3) return '階段が短い';
    if (new Set(real.map(suitOf)).size !== 1) return '階段のマークが違う';
    const need = Array.from({ length: p.count }, (_, k) => p.rank + k);
    if (need[0] < MIN_RANK || need[need.length - 1] > MAX_RANK) return '階段が範囲外';
    const have = real.map(rankOf);
    const missing = need.filter((r) => !have.includes(r));
    if (have.some((r) => !need.includes(r))) return '階段の数字が飛んでいる';
    if (missing.length !== jokers) return '階段の穴とジョーカーの数が合わない';
  }
  const top = s.table[s.table.length - 1];
  if (!top) return null;
  const tp = top.play;
  if (tp.type !== p.type || tp.count !== p.count) return '出し方・枚数が場と違う';
  const reversed = s.revolution !== s.elevenBack;
  const isJS = (x: Play) => x.type === 'single' && x.cards[0] === JOKER;
  if (isJS(tp)) return 'ジョーカーの上に出した';
  if (!isJS(p)) {
    if (reversed ? !(p.rank < tp.rank) : !(p.rank > tp.rank)) return '場より弱い';
  }
  if (s.lockSuit) {
    if (p.type === 'stair') {
      if (suitOf(real[0]) !== s.lockSuit) return 'マークしばり違反（階段）';
    } else if (real.some((c) => !s.lockSuit!.includes(suitOf(c)!))) return 'マークしばり違反';
  }
  if (s.lockNum && p.type !== 'stair') {
    const req = top.effRank + (reversed ? -1 : 1);
    if (isJS(p)) {
      if (req < MIN_RANK || req > MAX_RANK) return '数しば違反（ジョーカー）';
    } else if (p.rank !== req) return '数しば違反';
  }
  return null;
}

/** 状態がおかしくないか（カードの合計53枚・重複なし など） */
export function invariantCheck(s: State): string | null {
  if (totalCards(s) !== 53) return `カードの合計が ${totalCards(s)} 枚`;
  const all = [...s.hands.flat(), ...s.table.flatMap((t) => t.play.cards), ...s.discard];
  if (new Set(all).size !== 53) return 'カードが重複している';
  if (s.phase === 'play' && (s.finished.includes(s.turn) || s.fallen.includes(s.turn))) return '上がった人の番になっている';
  if (s.phase === 'sevenPass' || s.phase === 'tenDiscard') {
    const pc = s.pendingCards;
    if (!pc || pc.kind !== s.phase) return '7渡し・10捨ての情報がない';
    if (pc.count < 1 || pc.count > s.hands[pc.player].length) return '7渡し・10捨ての枚数がおかしい';
    if (pc.kind === 'sevenPass' && (pc.to === null || pc.to === pc.player || s.finished.includes(pc.to) || s.fallen.includes(pc.to))) return '7渡しの相手がおかしい';
  }
  return null;
}

/** 列挙した手と、選んだカードの判定が一致するか（手札の一部をランダムに選んで確かめる） */
export function consistencyCheck(s: State, player: number, rand: () => number, tries = 6): string | null {
  const moves = listMoves(s, player);
  const keys = new Set(moves.map((m) => [...m.cards].sort((a, b) => a - b).join(',') + m.type + m.rank));
  for (const m of moves) {
    const err = refereeCheck(s, player, m);
    if (err) return '列挙した手が違反: ' + err;
  }
  const hand = s.hands[player];
  for (let t = 0; t < tries; t++) {
    const size = 1 + Math.floor(rand() * Math.min(5, hand.length));
    const sub = [...hand].sort(() => rand() - 0.5).slice(0, size);
    for (const p of findPlays(s, player, sub)) {
      if (!keys.has([...p.cards].sort((a, b) => a - b).join(',') + p.type + p.rank)) return '列挙にない手が出せる判定';
    }
  }
  return null;
}
