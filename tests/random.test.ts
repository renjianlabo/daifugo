// 検査7.2：ランダム対戦テスト（1000試合）と、7.1のルールのオン/オフ組み合わせ
import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, RULE_NAMES, Rules } from '../src/engine/game';
import { randomPolicy, runGame } from './sim';

const KEYS = Object.keys(RULE_NAMES) as (keyof Rules)[];
const allOff = Object.fromEntries(KEYS.map((k) => [k, false])) as unknown as Rules;
const allOn = Object.fromEntries(KEYS.map((k) => [k, true])) as unknown as Rules;

function runMany(rules: Rules, games: number, seedBase: number) {
  const errors: string[] = [];
  let rounds = 0;
  for (let g = 0; g < games; g++) {
    const seed = seedBase + g;
    const rng = { seed: seed * 31 + 7 };
    const pol = randomPolicy(rng);
    const r = runGame(rules, seed, [pol, pol, pol, pol]);
    errors.push(...r.errors.map((e) => `seed${seed}: ${e}`));
    if (!r.finalOrder) errors.push(`seed${seed}: 最後まで終わらなかった`);
    rounds += r.roundRanks.length;
  }
  return { errors, rounds };
}

describe('ランダム対戦（出せる手からランダムに選ぶ4人）', () => {
  it('1000試合でエラー・止まる・ルール違反が0件、カードは常に53枚', () => {
    const { errors, rounds } = runMany(DEFAULT_RULES, 1000, 1);
    console.log(`ランダム対戦: 1000試合 / ${rounds}回戦 / 問題 ${errors.length}件`);
    expect(errors.slice(0, 10)).toEqual([]);
    expect(rounds).toBe(3000);
  });
});

describe('ルールのオン/オフ（7.1）', () => {
  const configs: [string, Rules][] = [['すべてオン', allOn], ['すべてオフ', allOff]];
  for (const k of KEYS) {
    configs.push([`${RULE_NAMES[k]}だけオン`, { ...allOff, [k]: true }]);
    configs.push([`${RULE_NAMES[k]}だけオフ`, { ...allOn, [k]: false }]);
  }
  for (const [name, rules] of configs) {
    it(`${name} で30試合動く`, () => {
      const { errors } = runMany(rules, 30, 5000);
      expect(errors.slice(0, 5)).toEqual([]);
    });
  }
});

describe('審判そのものの確認', () => {
  it('わざと違反した手を審判が見つける', async () => {
    const { makeTestState } = await import('../src/engine/game');
    const { refereeCheck } = await import('./referee');
    const { H, P } = await import('./helpers');
    const s = makeTestState({ hands: [H('S3 S9 H9 D4'), H('C5'), [], []], table: [{ player: 1, play: P('H8') }] });
    expect(refereeCheck(s, 0, P('S3'))).toBe('場より弱い');
    expect(refereeCheck(s, 0, P('S9 H9'))).toBe('出し方・枚数が場と違う');
    expect(refereeCheck(s, 0, P('C10'))).toBe('持っていないカード');
    s.lockSuit = 'H';
    expect(refereeCheck(s, 0, P('S9'))).toBe('マークしばり違反');
  });
  it('ランダム対戦の中で特別なルールが実際に起きている', async () => {
    const { newGame, listMoves, play, pass, canPass, chooseBomber, chooseCards, giveExchange, nextRound } = await import('../src/engine/game');
    const { randomPolicy: rp } = await import('./sim');
    const counts: Record<string, number> = {};
    for (let g = 0; g < 100; g++) {
      const s = newGame({ ...DEFAULT_RULES, miyakoOchi: true }, 900 + g);
      const pol = rp({ seed: g });
      while (s.phase !== 'gameEnd') {
        if (s.phase === 'roundEnd') nextRound(s);
        else if (s.phase === 'exchange') { const t = s.pendingExchange[0]; giveExchange(s, t.from, pol.exchange(s, t.from, t.count)); }
        else if (s.phase === 'bomber') chooseBomber(s, s.pendingBomber!.player, pol.bomber(s, 0, s.pendingBomber!.count));
        else if (s.phase === 'sevenPass' || s.phase === 'tenDiscard') { const pc = s.pendingCards!; chooseCards(s, pc.player, pol.cards(s, pc.player, pc.count)); }
        else { const m = pol.move(s, s.turn, listMoves(s, s.turn)); if (m) play(s, s.turn, m); else if (canPass(s, s.turn)) pass(s, s.turn); }
      }
      for (const e of s.events) {
        const key = e.type === 'lock' ? 'lock-' + e.kind : e.type;
        counts[key] = (counts[key] ?? 0) + 1;
      }
    }
    console.log('100試合で起きた回数', JSON.stringify(counts));
    for (const k of ['eightCut', 'skip', 'elevenBack', 'bomber', 'sevenPass', 'tenDiscard', 'revolution', 'lock-mark', 'lock-num', 'lock-geki', 'exchange', 'fall', 'joker'])
      expect(counts[k] ?? 0, k).toBeGreaterThan(0);
  });
});

describe('順位の知らせ（演出のもと）', () => {
  it('毎回、4人全員に1〜4位の知らせが1回ずつ出て、回の結果の順位と同じ（都落ちは4位）', async () => {
    const { newGame, listMoves, play, pass, canPass, chooseBomber, chooseCards, giveExchange, nextRound } = await import('../src/engine/game');
    const { randomPolicy: rp } = await import('./sim');
    const errors: string[] = [];
    const seen = new Set<string>();
    for (let g = 0; g < 200; g++) {
      const s = newGame({ ...DEFAULT_RULES, miyakoOchi: g % 2 === 0 }, 3000 + g);
      const pol = rp({ seed: g });
      let from = 0;
      while (s.phase !== 'gameEnd') {
        if (s.phase === 'roundEnd') {
          // この回で出た知らせ：上がった順位、都落ちは4位
          const got = [0, 0, 0, 0];
          const count = [0, 0, 0, 0];
          for (const e of s.events.slice(from)) {
            if (e.type === 'finish') { got[e.player] = e.rank; count[e.player]++; }
            if (e.type === 'fall') { got[e.player] = 4; count[e.player]++; }
          }
          const want = s.roundRanks[s.roundRanks.length - 1];
          if (count.some((n) => n !== 1) || got.join() !== want.join()) errors.push(`seed${3000 + g} 第${s.round}回戦：知らせ ${got.join()}（回数 ${count.join()}）／結果 ${want.join()}`);
          want.forEach((r, p) => seen.add(`${p}:${r}`));
          nextRound(s);
          from = s.events.length;
        } else if (s.phase === 'exchange') { const t = s.pendingExchange[0]; giveExchange(s, t.from, pol.exchange(s, t.from, t.count)); }
        else if (s.phase === 'bomber') chooseBomber(s, s.pendingBomber!.player, pol.bomber(s, 0, s.pendingBomber!.count));
        else if (s.phase === 'sevenPass' || s.phase === 'tenDiscard') { const pc = s.pendingCards!; chooseCards(s, pc.player, pol.cards(s, pc.player, pc.count)); }
        else { const m = pol.move(s, s.turn, listMoves(s, s.turn)); if (m) play(s, s.turn, m); else if (canPass(s, s.turn)) pass(s, s.turn); }
      }
    }
    expect(errors.slice(0, 5)).toEqual([]);
    // 自分（席0）とCPU（席1〜3）の全員が、1〜4位をすべて経験している
    expect(seen.size).toBe(16);
  });
});
