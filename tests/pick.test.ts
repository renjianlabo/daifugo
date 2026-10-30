import { describe, expect, it } from 'vitest';
import { pickLocked, togglePick } from '../src/ui/pick';
import { DEFAULT_RULES, newGame, nextRound } from '../src/engine/game';

describe('対戦の回数', () => {
  for (const rounds of [1, 3, 5]) {
    it(`${rounds}回で最終結果になる。カード交換は2回戦目から`, () => {
      const s = newGame(DEFAULT_RULES, 7, rounds);
      for (let r = 1; r <= rounds; r++) {
        expect(s.round).toBe(r);
        expect(s.phase).toBe(r === 1 ? 'play' : 'exchange');
        s.phase = 'roundEnd';
        s.prevRanks = [1, 2, 3, 4];
        s.roundRanks.push([1, 2, 3, 4]);
        nextRound(s);
      }
      expect(s.phase).toBe('gameEnd');
    });
  }

  it('5回で同点のときは最後の回の順位が上の人が上', () => {
    const s = newGame(DEFAULT_RULES, 7, 5);
    Object.assign(s, { phase: 'roundEnd', round: 5, scores: [8, 8, 8, 6], roundRanks: [[1, 2, 3, 4], [3, 1, 2, 4]] });
    nextRound(s);
    expect(s.finalOrder).toEqual([1, 2, 0, 3]);
  });
});

describe('選び方（7渡し・10捨て・12ボンバーで共通）', () => {
  it('1つしか選べないとき：別のものを押すと切り替わる。もう一度押すと解除', () => {
    const p = new Set<number>();
    togglePick(p, 3, 1);
    togglePick(p, 4, 1);
    expect([...p]).toEqual([4]);
    expect(pickLocked(p, 3, 1)).toBe(false);
    togglePick(p, 4, 1);
    expect([...p]).toEqual([]);
  });

  it('2つ以上選べるとき：上限まで選ぶと残りは押せない。解除すると元に戻る', () => {
    const p = new Set<number>();
    togglePick(p, 3, 2);
    expect(pickLocked(p, 4, 2)).toBe(false);
    togglePick(p, 4, 2);
    expect(pickLocked(p, 5, 2)).toBe(true);
    expect(pickLocked(p, 3, 2)).toBe(false);
    togglePick(p, 5, 2);
    expect([...p]).toEqual([3, 4]);
    togglePick(p, 3, 2);
    expect([...p]).toEqual([4]);
    expect(pickLocked(p, 5, 2)).toBe(false);
  });
});
