// 検査7.3：CPUの強さテスト ＋ 7.2をCPU4人でもう一度
import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../src/characters';
import { CpuOptions, LEVEL_NAMES, Level, PERSONALITY_WEIGHTS, decideBomber, decideExchange, decideHandOut, decideMove } from '../src/cpu/cpu';
import * as gameApi from '../src/engine/game';
import { DEFAULT_RULES } from '../src/engine/game';
import { Policy, runGame } from './sim';

declare const process: { env: Record<string, string | undefined> };

const GAMES = Number(process.env.CPU_GAMES ?? 500);
const TEST_ROLLOUTS = Number(process.env.CPU_ROLLOUTS ?? 40);

function cpuPolicy(opt: CpuOptions, rng: { seed: number }): Policy {
  return {
    move: (s, p) => decideMove(s, p, opt, rng),
    bomber: (s, p) => decideBomber(s, p, rng, opt.level === 'easy' ? 0.3 : 0),
    exchange: (s, p, count) => decideExchange(s, p, count),
    cards: (s, p, count) => decideHandOut(s, p, count),
  };
}

function finalRanks(order: number[]): number[] {
  const r = [0, 0, 0, 0];
  order.forEach((p, i) => (r[p] = i + 1));
  return r;
}

describe('CPUの強さ（7.3）', () => {
  it(`${GAMES}試合で平均順位が つよい＞ふつう＞やさしい`, () => {
    const levels: Level[] = ['strong', 'normal', 'easy'];
    const sum: Record<Level, number> = { strong: 0, normal: 0, easy: 0 };
    const cnt: Record<Level, number> = { strong: 0, normal: 0, easy: 0 };
    const errors: string[] = [];
    const t0 = Date.now();
    for (let g = 0; g < GAMES; g++) {
      // 3段階を1人ずつ＋4人目は順番に入れ替え。席と性格も試合ごとにずらす
      const seatLevels: Level[] = [...levels, levels[g % 3]];
      const rot = g % 4;
      const lv = [0, 1, 2, 3].map((i) => seatLevels[(i + rot) % 4]);
      const rng = { seed: 1000 + g };
      const policies = lv.map((l, i) =>
        cpuPolicy({ level: l, weights: PERSONALITY_WEIGHTS[CHARACTERS[(i + g) % 4].personality], rollouts: TEST_ROLLOUTS, timeLimitMs: 1500 }, rng),
      );
      const r = runGame(DEFAULT_RULES, 20000 + g, policies, { check: false });
      errors.push(...r.errors);
      if (!r.finalOrder) continue;
      const fr = finalRanks(r.finalOrder);
      lv.forEach((l, i) => { sum[l] += fr[i]; cnt[l]++; });
    }
    const avg = (l: Level) => sum[l] / cnt[l];
    console.log(
      `CPU強さ: ${GAMES}試合 試し遊び${TEST_ROLLOUTS}回 / ` +
      levels.map((l) => `${LEVEL_NAMES[l]} 平均${avg(l).toFixed(3)}位(${cnt[l]}人分)`).join(' / ') +
      ` / ${((Date.now() - t0) / 1000).toFixed(1)}秒`,
    );
    expect(errors).toEqual([]);
    expect(avg('strong')).toBeLessThan(avg('normal'));
    expect(avg('normal')).toBeLessThan(avg('easy'));
  });
});

describe('CPU4人のランダム対戦（7.2）', () => {
  it('1000試合でエラー・止まる・ルール違反が0件、カードは常に53枚', () => {
    const N = Number(process.env.CPU_RANDOM_GAMES ?? 1000);
    const errors: string[] = [];
    let done = 0;
    for (let g = 0; g < N; g++) {
      const rng = { seed: 50000 + g };
      const levels: Level[] = ['easy', 'normal', 'strong', 'normal'];
      const policies = [0, 1, 2, 3].map((i) =>
        cpuPolicy({ level: levels[(i + g) % 4], weights: PERSONALITY_WEIGHTS[CHARACTERS[i].personality], rollouts: 6 }, rng),
      );
      const r = runGame({ ...DEFAULT_RULES, miyakoOchi: g % 2 === 0 }, 60000 + g, policies);
      errors.push(...r.errors.map((e) => `game${g}: ${e}`));
      if (r.finalOrder) done++;
    }
    console.log(`CPU4人の対戦: ${N}試合 / 最後まで終わった ${done}試合 / 問題 ${errors.length}件`);
    expect(errors.slice(0, 10)).toEqual([]);
    expect(done).toBe(N);
  });
});

describe('性格（4.4）', () => {
  it('革命好きは革命が多く、せっかちは強いカードを早く使う', () => {
    const rev: Record<string, number> = {};
    const earlyStrong: Record<string, number> = {};
    for (let g = 0; g < 200; g++) {
      const rng = { seed: 7000 + g };
      // 同じ配り方で、席0の性格だけを変えて比べる
      for (const pers of ['revolution', 'keeper', 'hasty', 'balanced'] as const) {
        const policies = [0, 1, 2, 3].map((i) =>
          cpuPolicy({ level: 'normal', weights: PERSONALITY_WEIGHTS[i === 0 ? pers : 'balanced'] }, { seed: rng.seed + i }),
        );
        const { newGame, listMoves, play, pass, chooseBomber, chooseCards, giveExchange, nextRound } = gameApi;
        const s = newGame(DEFAULT_RULES, 9000 + g);
        let moves0 = 0;
        while (s.phase !== 'gameEnd') {
          if (s.phase === 'roundEnd') nextRound(s);
          else if (s.phase === 'exchange') { const t = s.pendingExchange[0]; giveExchange(s, t.from, policies[t.from].exchange(s, t.from, t.count)); }
          else if (s.phase === 'bomber') chooseBomber(s, s.pendingBomber!.player, policies[s.pendingBomber!.player].bomber(s, s.pendingBomber!.player, s.pendingBomber!.count));
          else if (s.phase === 'sevenPass' || s.phase === 'tenDiscard') { const pc = s.pendingCards!; chooseCards(s, pc.player, policies[pc.player].cards(s, pc.player, pc.count)); }
          else {
            const p = s.turn;
            const m = policies[p].move(s, p, listMoves(s, p));
            if (m) {
              if (p === 0) {
                moves0++;
                if (moves0 <= 4 && m.cards.some((c) => c === 52 || c % 13 >= 11)) earlyStrong[pers] = (earlyStrong[pers] ?? 0) + 1;
              }
              play(s, p, m);
            } else pass(s, p);
          }
          if (s.phase === 'roundEnd' || s.phase === 'exchange') moves0 = 0;
        }
        rev[pers] = (rev[pers] ?? 0) + s.events.filter((e) => e.type === 'revolution' && e.player === 0).length;
      }
    }
    console.log('性格ごと（200試合）: 革命の回数', JSON.stringify(rev), '/ 序盤4手で強いカード(A・2・JK)を使った回数', JSON.stringify(earlyStrong));
    expect(rev.revolution).toBeGreaterThan(rev.balanced);
    expect(rev.revolution).toBeGreaterThan(rev.keeper);
    expect(earlyStrong.hasty).toBeGreaterThan(earlyStrong.balanced);
    expect(earlyStrong.keeper).toBeLessThan(earlyStrong.balanced);
  });
});
