// テスト用：ゲームを最後まで自動で進める
import { MAX_RANK, MIN_RANK, nextRandom, shuffle } from '../src/engine/cards';
import { Play } from '../src/engine/plays';
import { Rules, State, canPass, chooseBomber, chooseCards, giveExchange, listMoves, newGame, nextRound, pass, play } from '../src/engine/game';
import { consistencyCheck, invariantCheck, refereeCheck } from './referee';

export interface Policy {
  move(s: State, player: number, moves: Play[]): Play | null;
  bomber(s: State, player: number, count: number): number[];
  exchange(s: State, player: number, count: number): number[];
  /** 7渡し・10捨て：ちょうど count 枚を選ぶ */
  cards(s: State, player: number, count: number): number[];
}

export function randomPolicy(rng: { seed: number }): Policy {
  return {
    move: (s, p, moves) => {
      const passOk = canPass(s, p);
      if (moves.length === 0) return null;
      if (passOk && nextRandom(rng) < 0.25) return null;
      return moves[Math.floor(nextRandom(rng) * moves.length)];
    },
    bomber: (_s, _p, count) => shuffle(Array.from({ length: MAX_RANK - MIN_RANK + 1 }, (_, i) => i + MIN_RANK), rng).slice(0, count),
    exchange: (s, p, count) => shuffle(s.hands[p], rng).slice(0, count),
    cards: (s, p, count) => shuffle(s.hands[p], rng).slice(0, count),
  };
}

export interface SimResult {
  errors: string[];
  steps: number;
  finalOrder: number[] | null;
  roundRanks: number[][];
}

/** 1試合（3回戦）を最後まで進める。policies[i] が i 番の人の動き方 */
export function runGame(rules: Rules, seed: number, policies: Policy[], opts: { check?: boolean; maxSteps?: number } = {}): SimResult {
  const check = opts.check ?? true;
  const maxSteps = opts.maxSteps ?? 5000;
  const s = newGame(rules, seed);
  const rng = { seed: seed * 7 + 1 };
  const errors: string[] = [];
  let steps = 0;
  try {
    while (s.phase !== 'gameEnd') {
      if (++steps > maxSteps) { errors.push('止まった（手数が多すぎる）'); break; }
      if (s.phase === 'roundEnd') { nextRound(s); continue; }
      if (s.phase === 'exchange') {
        const t = s.pendingExchange[0];
        giveExchange(s, t.from, policies[t.from].exchange(s, t.from, t.count));
      } else if (s.phase === 'bomber') {
        const pb = s.pendingBomber!;
        chooseBomber(s, pb.player, policies[pb.player].bomber(s, pb.player, pb.count));
      } else if (s.phase === 'sevenPass' || s.phase === 'tenDiscard') {
        const pc = s.pendingCards!;
        chooseCards(s, pc.player, policies[pc.player].cards(s, pc.player, pc.count));
      } else {
        const p = s.turn;
        const moves = listMoves(s, p);
        if (check) {
          const c = consistencyCheck(s, p, () => nextRandom(rng));
          if (c) errors.push(c);
        }
        if (moves.length === 0 && !canPass(s, p)) { errors.push('親なのに出せる手がない'); break; }
        const m = policies[p].move(s, p, moves);
        if (m) {
          const err = refereeCheck(s, p, m);
          if (err) errors.push('ルール違反: ' + err);
          play(s, p, m);
        } else pass(s, p);
      }
      if (check) {
        const inv = invariantCheck(s);
        if (inv) { errors.push(inv); break; }
      }
    }
  } catch (e) {
    errors.push('エラー: ' + (e as Error).message);
  }
  return { errors, steps, finalOrder: s.finalOrder, roundRanks: s.roundRanks };
}
