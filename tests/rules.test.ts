// 検査7.1：ルールの自動テスト
import { describe, expect, it } from 'vitest';
import { JOKER, cardId, parseCard, rankOf } from '../src/engine/cards';
import { effectsOf, enumeratePlays, interpret } from '../src/engine/plays';
import {
  DEFAULT_RULES, Rules, State, chooseBomber, chooseCards, giveExchange, isReversed, listMoves, lockKind, makeTestState,
  newGame, nextRound, pass, play, totalCards,
} from '../src/engine/game';
import { H, P, legal } from './helpers';

const ALL_OFF: Partial<Rules> = {
  eightCut: false, fiveSkip: false, elevenBack: false, twelveBomber: false, revolution: false,
  markLock: false, numLock: false, gekiLock: false, exchange: false, miyakoOchi: false,
  sevenPass: false, tenDiscard: false,
};

function doPlay(s: State, player: number, text: string, jokerRank?: number) {
  const p = legal(s, player, text, jokerRank);
  if (!p) throw new Error(`出せない: P${player} ${text}`);
  play(s, player, p);
}

const types = (s: State) => s.events.map((e) => e.type);
/** 7渡し・10捨てを切る（ほかのルールの確認で、7・10を出しても止まらないように） */
const NO_HAND: Partial<Rules> = { sevenPass: false, tenDiscard: false };

describe('出し方の判定', () => {
  it('1枚出し・重ね数字・階段を判定できる', () => {
    expect(interpret(H('S3'))[0].type).toBe('single');
    expect(interpret(H('S3 H3'))[0].type).toBe('group');
    expect(interpret(H('S3 H3 D3 C3'))[0].count).toBe(4);
    expect(interpret(H('S3 S4 S5'))[0]).toMatchObject({ type: 'stair', rank: 3 });
    expect(interpret(H('S3 H4 S5'))).toHaveLength(0);
    expect(interpret(H('S3 S5 S6'))).toHaveLength(0);
    expect(interpret(H('S3 H4'))).toHaveLength(0);
  });
  it('ジョーカーは重ね数字・階段の穴埋め・端に使える', () => {
    expect(interpret(H('S7 JK'))[0]).toMatchObject({ type: 'group', rank: 7, suitKey: null });
    expect(interpret(H('H7 JK H9'))[0]).toMatchObject({ type: 'stair', rank: 7, jokerRank: 8 });
    const ends = interpret(H('H5 H6 JK'));
    expect(ends.map((p) => p.jokerRank).sort()).toEqual([4, 7]);
    expect(interpret(H('S3 S4 JK')).map((p) => p.jokerRank)).toEqual([5]); // 2の上はない
  });
  it('K・A・2 は階段になる', () => {
    expect(interpret(H('SK SA S2'))[0]).toMatchObject({ type: 'stair', rank: 13 });
  });
});

describe('基本ルール', () => {
  it('強さは 3<…<2<ジョーカー', () => {
    const s = makeTestState({ hands: [H('S2 JK'), H('SA'), [], []], table: [{ player: 1, play: P('HA') }], turn: 0 });
    expect(legal(s, 0, 'S2')).not.toBeNull();
    expect(legal(s, 0, 'JK')).not.toBeNull();
    const s2 = makeTestState({ hands: [H('SK'), H('C3'), [], []], table: [{ player: 1, play: P('HA') }], turn: 0 });
    expect(legal(s2, 0, 'SK')).toBeNull();
  });
  it('同じ出し方・同じ枚数でないと出せない', () => {
    const s = makeTestState({ hands: [H('S9 H9 C10'), H('C3'), [], []], table: [{ player: 1, play: P('H4') }] });
    expect(legal(s, 0, 'S9 H9')).toBeNull();
    expect(legal(s, 0, 'C10')).not.toBeNull();
  });
  it('階段は一番弱いカードどうしで比べ、マークは自由', () => {
    const s = makeTestState({ hands: [H('S5 S6 S7 D6 D7 D8'), H('C3'), [], []], table: [{ player: 1, play: P('H5 H6 H7') }] });
    expect(legal(s, 0, 'S5 S6 S7')).toBeNull();
    expect(legal(s, 0, 'D6 D7 D8')).not.toBeNull();
  });
  it('全員パスで場が流れ、最後に出した人が親になる', () => {
    const s = makeTestState({ hands: [H('S3 S4'), H('H5 H6'), H('D7 D8'), H('C9 C10')], turn: 0, rules: ALL_OFF });
    doPlay(s, 0, 'S4');
    pass(s, 1); pass(s, 2); pass(s, 3);
    expect(s.table).toHaveLength(0);
    expect(s.turn).toBe(0);
  });
  it('パスしても次の番でまた出せる', () => {
    const s = makeTestState({ hands: [H('S3 S4 S6'), H('H5 H9'), H('D8 D9'), H('C9 C10')], turn: 0, rules: ALL_OFF });
    doPlay(s, 0, 'S3');
    pass(s, 1);
    doPlay(s, 2, 'D8');
    pass(s, 3); pass(s, 0);
    expect(s.turn).toBe(1);
    expect(listMoves(s, 1).length).toBe(1);
    doPlay(s, 1, 'H9');
    expect(s.lastPlayer).toBe(1);
  });
  it('最後に出した人が上がっていたら、その次の人が親', () => {
    const s = makeTestState({ hands: [H('S9'), H('H5 H6'), H('D7 D8'), H('C9 C10')], turn: 0, rules: ALL_OFF });
    doPlay(s, 0, 'S9');
    expect(s.finished).toEqual([0]);
    pass(s, 1); pass(s, 2); pass(s, 3);
    expect(s.turn).toBe(1);
  });
  it('親のときもパスでき、次の人が親になる。全員パスしたら最初の人に戻る', () => {
    const s = makeTestState({ hands: [H('S3'), H('H5'), H('D7'), H('C9')], turn: 0 });
    pass(s, 0);
    expect(s.turn).toBe(1);
    expect(s.table).toHaveLength(0);
    pass(s, 1); pass(s, 2); pass(s, 3);
    expect(s.turn).toBe(0);
    expect(s.passed).toEqual([false, false, false, false]);
    doPlay(s, 0, 'S3');
    expect(s.turn).toBe(1);
  });
  it('ジョーカー1枚出しは革命中・11バック中も最強', () => {
    for (const st of [{ revolution: true }, { elevenBack: true }, {}]) {
      const s = makeTestState({ hands: [H('JK S3'), H('H5'), [], []], table: [{ player: 1, play: P('H2') }], ...st });
      expect(legal(s, 0, 'JK')).not.toBeNull();
    }
    const s = makeTestState({ hands: [H('S3 H3'), H('H5'), [], []], table: [{ player: 1, play: P('JK') }], revolution: true });
    expect(legal(s, 0, 'S3')).toBeNull();
  });
  it('8・2・ジョーカーで上がってよい', () => {
    for (const c of ['S8', 'S2', 'JK']) {
      const s = makeTestState({ hands: [H(c), H('H5 H6'), H('D7 D9'), H('C9 C10')], turn: 0 });
      doPlay(s, 0, c);
      expect(s.finished[0]).toBe(0);
    }
  });
});

describe('8切り', () => {
  it('8を出すと場が流れ、出した人が親', () => {
    const s = makeTestState({ hands: [H('S8 S3'), H('H5'), H('D7'), H('C9')], table: [{ player: 3, play: P('C4') }], turn: 0 });
    doPlay(s, 0, 'S8');
    expect(types(s)).toContain('eightCut');
    expect(s.table).toHaveLength(0);
    expect(s.turn).toBe(0);
  });
  it('オフなら流れない', () => {
    const s = makeTestState({ hands: [H('S8 S3'), H('H5'), H('D7'), H('C9')], turn: 0, rules: { eightCut: false } });
    doPlay(s, 0, 'S8');
    expect(s.table).toHaveLength(1);
    expect(s.turn).toBe(1);
  });
  it('8切りで上がったら、次の人が親', () => {
    const s = makeTestState({ hands: [H('S8'), H('H5'), H('D7'), H('C9')], turn: 0 });
    doPlay(s, 0, 'S8');
    expect(s.finished).toEqual([0]);
    expect(s.table).toHaveLength(0);
    expect(s.turn).toBe(1);
  });
});

describe('5スキップ', () => {
  it('5の枚数分だけ飛ばす', () => {
    const s = makeTestState({ hands: [H('S5 H5 S3'), H('H6 H7'), H('D7 D8'), H('C9 C10')], turn: 0 });
    doPlay(s, 0, 'S5 H5');
    expect(s.events.filter((e) => e.type === 'skip').map((e) => (e as { player: number }).player)).toEqual([1, 2]);
    expect(s.turn).toBe(3);
  });
  it('上がった人は数えない', () => {
    const s = makeTestState({ hands: [H('S5 S3'), [], H('D7 D8'), H('C9 C10')], turn: 0 });
    s.finished = [1];
    doPlay(s, 0, 'S5');
    expect(s.turn).toBe(3);
  });
  it('一周して出した人に戻ったら場が流れて親になる', () => {
    const s = makeTestState({ hands: [H('S5 H5 D5 S3'), H('H6'), [], []], turn: 0 });
    s.finished = [2, 3];
    doPlay(s, 0, 'S5 H5 D5');
    expect(s.table).toHaveLength(0);
    expect(s.turn).toBe(0);
  });
  it('オフなら飛ばさない', () => {
    const s = makeTestState({ hands: [H('S5 S3'), H('H6'), H('D7'), H('C9')], turn: 0, rules: { fiveSkip: false } });
    doPlay(s, 0, 'S5');
    expect(s.turn).toBe(1);
  });
});

describe('11バック', () => {
  it('Jを出すと場が流れるまで強さが逆', () => {
    const s = makeTestState({ hands: [H('SJ S3 S4'), H('H10 H5'), H('D7'), H('C9')], turn: 0 });
    doPlay(s, 0, 'SJ');
    expect(s.elevenBack).toBe(true);
    expect(legal(s, 1, 'H10')).not.toBeNull();
    pass(s, 1); pass(s, 2); pass(s, 3);
    expect(s.elevenBack).toBe(false);
  });
  it('11バック中にもう一度Jが出ても、逆のまま（4枚以上の階段で起きる）', () => {
    const r: Partial<Rules> = { ...NO_HAND, revolution: false, twelveBomber: false, eightCut: false };
    const s = makeTestState({ hands: [H('S9 S10 SJ SQ S3'), H('H8 H9 H10 HJ H3'), H('D7'), H('C9')], turn: 0, rules: r });
    doPlay(s, 0, 'S9 S10 SJ SQ');
    expect(isReversed(s)).toBe(true);
    doPlay(s, 1, 'H8 H9 H10 HJ');
    expect(s.elevenBack).toBe(true);
    expect(isReversed(s)).toBe(true);
    expect(types(s).filter((t) => t === 'elevenBack')).toHaveLength(1);
  });
  it('革命中の11バックは普通の強さに戻る', () => {
    const s = makeTestState({ hands: [H('SJ S3'), H('HQ H10'), H('D7'), H('C9')], turn: 0, revolution: true });
    doPlay(s, 0, 'SJ');
    expect(isReversed(s)).toBe(false);
    expect(legal(s, 1, 'HQ')).not.toBeNull();
    expect(legal(s, 1, 'H10')).toBeNull();
  });
  it('オフなら逆にならない', () => {
    const s = makeTestState({ hands: [H('SJ S3'), H('H10'), H('D7'), H('C9')], turn: 0, rules: { elevenBack: false } });
    doPlay(s, 0, 'SJ');
    expect(isReversed(s)).toBe(false);
  });
});

describe('12ボンバー', () => {
  it('Qの枚数分の数字を選び、全員の手札から捨てる（出した人も）', () => {
    const s = makeTestState({ hands: [H('SQ S3 S4'), H('H3 H6'), H('D3 D4 D9'), H('C9 C10')], turn: 0 });
    doPlay(s, 0, 'SQ');
    expect(s.phase).toBe('bomber');
    expect(() => chooseBomber(s, 0, [3, 4])).toThrow();
    chooseBomber(s, 0, [3]);
    expect(s.hands[0]).toEqual(H('S4'));
    expect(s.hands[1]).toEqual(H('H6'));
    expect(s.hands[2]).toEqual(H('D4 D9'));
    expect(totalCards(s)).toBe(53);
  });
  it('ジョーカーは捨てられない', () => {
    const s = makeTestState({ hands: [H('SQ S3'), H('JK H6'), H('D3'), H('C9 C10')], turn: 0 });
    doPlay(s, 0, 'SQ');
    chooseBomber(s, 0, [6]);
    expect(s.hands[1]).toEqual([JOKER]);
  });
  it('手札が0枚になった人は、出した人から順に上がる', () => {
    const s = makeTestState({ hands: [H('SQ S3'), H('H3 H4'), H('D3'), H('C9 C10')], turn: 3 , table: [] });
    s.turn = 0;
    doPlay(s, 0, 'SQ');
    chooseBomber(s, 0, [3]);
    expect(s.finished).toEqual([0, 2]);
    expect(s.phase).toBe('play');
    expect(s.turn).toBe(1);
  });
  it('ボンバーで残りが1人になったら回が終わる', () => {
    const s = makeTestState({ hands: [H('SQ S3'), H('H3'), H('D3'), H('C9 C10')], turn: 0 });
    doPlay(s, 0, 'SQ');
    chooseBomber(s, 0, [3]);
    expect(s.phase).toBe('roundEnd');
    expect(s.roundRanks[0]).toEqual([1, 2, 3, 4]);
  });
  it('オフなら選ばない', () => {
    const s = makeTestState({ hands: [H('SQ S3'), H('H3'), H('D3'), H('C9')], turn: 0, rules: { twelveBomber: false } });
    doPlay(s, 0, 'SQ');
    expect(s.phase).toBe('play');
  });
});

describe('革命', () => {
  it('同じ数字4枚で革命、もう一度で戻る', () => {
    const s = makeTestState({ hands: [H('S6 H6 D6 C6 S3'), H('S9 H9 D9 C9 S4'), H('D7'), H('C10')], turn: 0 });
    doPlay(s, 0, 'S6 H6 D6 C6');
    expect(s.revolution).toBe(true);
    expect(legal(s, 1, 'S9 H9 D9 C9')).toBeNull();
    pass(s, 1); pass(s, 2); pass(s, 3);
    expect(s.revolution).toBe(true); // 場が流れても続く
    const s2 = makeTestState({ hands: [H('S9 H9 D9 C9 S4'), H('S6 H6 D6 C6 S3'), H('D7'), H('C10')], turn: 0 });
    doPlay(s2, 0, 'S9 H9 D9 C9');
    doPlay(s2, 1, 'S6 H6 D6 C6');
    expect(s2.revolution).toBe(false);
  });
  it('階段4枚以上で革命', () => {
    const s = makeTestState({ hands: [H('S9 S10 SJ SQ S3'), H('H4'), H('D7'), H('C10')], turn: 0, rules: { ...NO_HAND, twelveBomber: false, elevenBack: false } });
    doPlay(s, 0, 'S9 S10 SJ SQ');
    expect(s.revolution).toBe(true);
    const s2 = makeTestState({ hands: [H('S9 S10 SJ S3'), H('H4'), H('D7'), H('C10')], turn: 0, rules: { ...NO_HAND, elevenBack: false } });
    doPlay(s2, 0, 'S9 S10 SJ');
    expect(s2.revolution).toBe(false);
  });
  it('7・7・7＋ジョーカーで革命', () => {
    const s = makeTestState({ hands: [H('S7 H7 D7 JK S3'), H('H4'), H('D9'), H('C10')], turn: 0, rules: NO_HAND });
    doPlay(s, 0, 'S7 H7 D7 JK');
    expect(s.revolution).toBe(true);
  });
  it('オフなら起きない', () => {
    const s = makeTestState({ hands: [H('S6 H6 D6 C6 S3'), H('H4'), H('D7'), H('C10')], turn: 0, rules: { revolution: false } });
    doPlay(s, 0, 'S6 H6 D6 C6');
    expect(s.revolution).toBe(false);
  });
});

describe('ジョーカーの数え方と重なり', () => {
  it('Q＋ジョーカー → 数字を2つ選ぶ', () => {
    const s = makeTestState({ hands: [H('SQ JK S3'), H('H4'), H('D7'), H('C10')], turn: 0 });
    doPlay(s, 0, 'SQ JK');
    expect(s.pendingBomber?.count).toBe(2);
  });
  it('5＋ジョーカー → 2人飛ばす', () => {
    expect(effectsOf(P('S5 JK')).skip).toBe(2);
    const s = makeTestState({ hands: [H('S5 JK S3'), H('H6 H7'), H('D7 D8'), H('C9 C10')], turn: 0 });
    doPlay(s, 0, 'S5 JK');
    expect(s.turn).toBe(3);
  });
  it('ジョーカー1枚出しは効果なし', () => {
    expect(effectsOf(P('JK'))).toEqual({ bomber: 0, sevenPass: 0, tenDiscard: 0, revolution: false, elevenBack: false, eightCut: false, skip: 0 });
  });
  it('階段のジョーカーが8の代わりなら8切りが起きる（代わりをしている数字の効果が起きる）', () => {
    const s = makeTestState({ hands: [H('H7 JK H9 S3'), H('H4'), H('D7'), H('C10')], turn: 0, rules: NO_HAND });
    doPlay(s, 0, 'H7 JK H9', 8);
    expect(types(s)).toContain('eightCut');
    expect(s.turn).toBe(0);
    expect(effectsOf(P('H4 JK H6', 5)).skip).toBe(1);
    expect(effectsOf(P('HJ JK HK', 12)).bomber).toBe(1);
    expect(effectsOf(P('H10 JK HQ', 11)).elevenBack).toBe(true);
  });
  it('階段に入った本物の5・8・Qは効果が起きる', () => {
    expect(effectsOf(P('H4 H5 H6')).skip).toBe(1);
    expect(effectsOf(P('H7 H8 H9')).eightCut).toBe(true);
    expect(effectsOf(P('HJ HQ HK')).bomber).toBe(1);
    expect(effectsOf(P('HJ HQ HK')).elevenBack).toBe(true);
    const s = makeTestState({ hands: [H('H4 H5 H6 S3'), H('C4'), H('D7'), H('C10')], turn: 0 });
    doPlay(s, 0, 'H4 H5 H6');
    expect(s.turn).toBe(2);
  });
  it('複数の効果は ボンバー→革命→11バック→8切り の順、8切りがあれば5スキップなし', () => {
    const s = makeTestState({ hands: [H('H8 H9 H10 HJ HQ S3'), H('C4'), H('D7'), H('C10')], turn: 0, rules: NO_HAND });
    doPlay(s, 0, 'H8 H9 H10 HJ HQ');
    chooseBomber(s, 0, [4]);
    const order = types(s).filter((t) => ['bomber', 'revolution', 'elevenBack', 'eightCut', 'skip'].includes(t));
    expect(order).toEqual(['bomber', 'revolution', 'elevenBack', 'eightCut']);
    const s2 = makeTestState({ hands: [H('H5 H6 H7 H8 S3'), H('C4'), H('D7'), H('C10')], turn: 0, rules: NO_HAND });
    doPlay(s2, 0, 'H5 H6 H7 H8');
    expect(types(s2)).not.toContain('skip');
    expect(s2.turn).toBe(0);
  });
});

describe('しばり', () => {
  it('マークしばり：同じマークが2回続くと、そのマークしか出せない', () => {
    const s = makeTestState({ hands: [H('S3 S5 H6 S9'), H('S5 H6 S6'), H('D7 S8'), H('C10 S10')], turn: 0, rules: { fiveSkip: false } });
    doPlay(s, 0, 'S3');
    doPlay(s, 1, 'S5');
    expect(lockKind(s)).toBe('mark');
    expect(legal(s, 2, 'D7')).toBeNull();
    expect(legal(s, 2, 'S8')).not.toBeNull();
  });
  it('重ね数字のマークしばりは組み合わせが完全に同じとき', () => {
    const s = makeTestState({ hands: [H('S3 H3 S8'), H('S4 H4'), H('S6 D6 S7 H7'), H('C10')], turn: 0, rules: { numLock: false, gekiLock: false } });
    doPlay(s, 0, 'S3 H3');
    doPlay(s, 1, 'S4 H4');
    expect(lockKind(s)).toBe('mark');
    expect(legal(s, 2, 'S6 D6')).toBeNull();
    expect(legal(s, 2, 'S7 H7')).not.toBeNull();
  });
  it('数しば：数字が1つずつ2回続くと次の数字しか出せない（革命中は1つ前）', () => {
    const s = makeTestState({ hands: [H('S3 D9'), H('H4'), H('D5 C6'), H('C7 H6')], turn: 0, rules: { markLock: false, fiveSkip: false } });
    doPlay(s, 0, 'S3');
    doPlay(s, 1, 'H4');
    expect(lockKind(s)).toBe('num');
    expect(legal(s, 2, 'C6')).toBeNull();
    expect(legal(s, 2, 'D5')).not.toBeNull();
    const r = makeTestState({ hands: [H('S10 D9'), H('H9'), H('D8 C6'), H('C7')], turn: 0, revolution: true, rules: { ...NO_HAND, markLock: false } });
    doPlay(r, 0, 'S10');
    doPlay(r, 1, 'H9');
    expect(lockKind(r)).toBe('num');
    expect(legal(r, 2, 'C6')).toBeNull();
    expect(legal(r, 2, 'D8')).not.toBeNull();
  });
  it('数しばは階段には適用しない', () => {
    const s = makeTestState({ hands: [H('S3 S4 S5 D9'), H('H4 H5 H6'), H('D5'), H('C7')], turn: 0, rules: { fiveSkip: false } });
    doPlay(s, 0, 'S3 S4 S5');
    doPlay(s, 1, 'H4 H5 H6');
    expect(s.lockNum).toBe(false);
  });
  it('激しば：同じマークで次の数字しか出せない', () => {
    const s = makeTestState({ hands: [H('S3 D9'), H('S4'), H('D5 S5 S6'), H('C7')], turn: 0, rules: { fiveSkip: false } });
    doPlay(s, 0, 'S3');
    doPlay(s, 1, 'S4');
    expect(lockKind(s)).toBe('geki');
    expect(legal(s, 2, 'D5')).toBeNull();
    expect(legal(s, 2, 'S6')).toBeNull();
    expect(legal(s, 2, 'S5')).not.toBeNull();
  });
  it('激しばがオフなら、マークしばりだけになる', () => {
    const s = makeTestState({ hands: [H('S3 D9'), H('S4'), H('D5 S6'), H('C7')], turn: 0, rules: { gekiLock: false } });
    doPlay(s, 0, 'S3');
    doPlay(s, 1, 'S4');
    expect(lockKind(s)).toBe('mark');
    expect(legal(s, 2, 'S6')).not.toBeNull();
  });
  it('しばり中のジョーカーは、求められたマーク・数字として出せる', () => {
    const s = makeTestState({ hands: [H('S3 D9'), H('S4'), H('JK D5'), H('C7')], turn: 0 });
    doPlay(s, 0, 'S3');
    doPlay(s, 1, 'S4');
    expect(legal(s, 2, 'JK')).not.toBeNull();
    doPlay(s, 2, 'JK');
    expect(s.table[s.table.length - 1].effRank).toBe(5);
    const g = makeTestState({ hands: [H('S3 H3 D9'), H('S4 H4'), H('S6 JK D6'), H('C7')], turn: 0, rules: { numLock: false, gekiLock: false } });
    doPlay(g, 0, 'S3 H3');
    doPlay(g, 1, 'S4 H4');
    expect(legal(g, 2, 'S6 JK')).not.toBeNull();
    expect(legal(g, 2, 'D6 JK')).toBeNull();
  });
  it('ジョーカー1枚出しではしばりは成立しない', () => {
    const s = makeTestState({ hands: [H('S3 D9'), H('JK'), H('D5'), H('C7')], turn: 0 });
    doPlay(s, 0, 'S3');
    doPlay(s, 1, 'JK');
    expect(lockKind(s)).toBeNull();
  });
  it('場が流れたら解除', () => {
    const s = makeTestState({ hands: [H('S3 S9 D9'), H('S4 H3'), H('D5'), H('C7')], turn: 0, rules: { numLock: false } });
    doPlay(s, 0, 'S3');
    doPlay(s, 1, 'S4');
    pass(s, 2); pass(s, 3); pass(s, 0);
    expect(lockKind(s)).toBeNull();
  });
  it('オフならしばりは起きない', () => {
    const s = makeTestState({ hands: [H('S3 D9'), H('S4'), H('D5'), H('C7')], turn: 0, rules: { markLock: false, numLock: false, gekiLock: false } });
    doPlay(s, 0, 'S3');
    doPlay(s, 1, 'S4');
    expect(lockKind(s)).toBeNull();
  });
});

describe('回の流れ・交換・都落ち・点数', () => {
  it('1回戦目は♦3を持つ人から', () => {
    for (let seed = 1; seed < 20; seed++) {
      const s = newGame(DEFAULT_RULES, seed);
      expect(s.hands[s.turn]).toContain(cardId('D', 3));
      expect(s.hands.map((h) => h.length).sort()).toEqual([13, 13, 13, 14]);
    }
  });
  it('2回戦目は交換し、大貧民から始める', () => {
    const s = newGame(DEFAULT_RULES, 5);
    s.phase = 'roundEnd';
    s.prevRanks = [2, 4, 1, 3];
    s.roundRanks = [[2, 4, 1, 3]];
    nextRound(s);
    expect(s.round).toBe(2);
    expect(s.phase).toBe('exchange');
    expect(s.hands[2]).toHaveLength(s.hands[2].length);
    const ex = s.events.filter((e) => e.type === 'exchange');
    expect(ex).toHaveLength(2);
    // 大貧民(1)→大富豪(2) 一番強い2枚
    const strong = (ex[0] as { cards: number[] }).cards;
    expect(strong).toHaveLength(2);
    const maxRank = Math.max(...s.hands[1].map(rankOf));
    expect(Math.min(...strong.map(rankOf))).toBeGreaterThanOrEqual(maxRank);
    expect(listMoves(s, s.turn)).toHaveLength(0);
    giveExchange(s, 2, s.hands[2].slice(0, 2));
    expect(s.phase).toBe('exchange');
    giveExchange(s, 0, s.hands[0].slice(0, 1));
    expect(s.phase).toBe('play');
    expect(s.turn).toBe(1);
    expect(totalCards(s)).toBe(53);
  });
  it('交換オフなら交換しない', () => {
    const s = newGame({ ...DEFAULT_RULES, exchange: false }, 5);
    s.phase = 'roundEnd';
    s.prevRanks = [2, 4, 1, 3];
    s.roundRanks = [[2, 4, 1, 3]];
    nextRound(s);
    expect(s.phase).toBe('play');
    expect(s.turn).toBe(1);
  });
  it('都落ち：前の大富豪が1位で上がれなければ大貧民', () => {
    const s = makeTestState({ hands: [H('S3'), H('H5 H6'), H('D7 D8'), H('C9 C10')], turn: 0, rules: { miyakoOchi: true }, prevRanks: [2, 1, 3, 4], round: 2 });
    doPlay(s, 0, 'S3');
    expect(s.fallen).toEqual([1]);
    expect(s.hands[1]).toHaveLength(0);
    expect(totalCards(s)).toBe(53);
    expect(s.turn).toBe(2);
  });
  it('都落ちオフなら起きない', () => {
    const s = makeTestState({ hands: [H('S3'), H('H5 H6'), H('D7 D8'), H('C9 C10')], turn: 0, prevRanks: [2, 1, 3, 4], round: 2 });
    doPlay(s, 0, 'S3');
    expect(s.fallen).toEqual([]);
  });
  it('順位ポイントと同点のときは3回戦目の順位で決める', () => {
    const s = newGame(DEFAULT_RULES, 3);
    s.round = 3;
    s.phase = 'roundEnd';
    s.scores = [4, 4, 5, 5];
    s.roundRanks = [[1, 2, 3, 4], [4, 3, 2, 1], [3, 1, 4, 2]];
    nextRound(s);
    expect(s.phase).toBe('gameEnd');
    expect(s.finalOrder).toEqual([3, 2, 1, 0]);
  });
  it('上がった順に 大富豪・富豪・貧民・大貧民', () => {
    const s = makeTestState({ hands: [H('S3'), H('H5'), H('D7'), H('C9 C10')], turn: 0, rules: ALL_OFF });
    doPlay(s, 0, 'S3');
    doPlay(s, 1, 'H5');
    doPlay(s, 2, 'D7');
    expect(s.phase).toBe('roundEnd');
    expect(s.roundRanks[0]).toEqual([1, 2, 3, 4]);
    expect(s.scores).toEqual([3, 2, 1, 0]);
  });
});

describe('出せる手の列挙', () => {
  it('列挙と、選んだカードの判定が一致する', () => {
    const hand = H('S3 S4 S5 S6 H5 D5 C5 JK H9 HJ HQ C2');
    const plays = enumeratePlays(hand);
    const keys = new Set(plays.map((p) => p.cards.join(',') + p.type + p.rank));
    // 全部分集合（4096通り）で突き合わせ
    for (let m = 1; m < 1 << hand.length; m++) {
      const sub = hand.filter((_, i) => m & (1 << i));
      for (const p of interpret(sub)) expect(keys.has(p.cards.join(',') + p.type + p.rank)).toBe(true);
    }
    expect(plays.some((p) => p.type === 'stair' && p.count === 5)).toBe(true);
  });
  it('parseCard が正しい', () => {
    expect(rankOf(parseCard('C2'))).toBe(15);
  });
});

describe('7渡し・10捨て', () => {
  it('7を1枚出すと、次の人に1枚渡す。渡したあとは次の人の番', () => {
    const s = makeTestState({ hands: [H('S7 S3 D4'), H('H9 HK'), H('D9'), H('C10')], turn: 0 });
    doPlay(s, 0, 'S7');
    expect(s.phase).toBe('sevenPass');
    expect(s.pendingCards).toMatchObject({ kind: 'sevenPass', player: 0, count: 1, to: 1 });
    expect(() => chooseCards(s, 0, H('S3 D4'))).toThrow();
    expect(() => chooseCards(s, 0, [])).toThrow();
    expect(() => chooseCards(s, 1, H('H9'))).toThrow();
    chooseCards(s, 0, H('S3'));
    expect(s.hands[0]).toEqual(H('D4'));
    expect(s.hands[1]).toEqual(H('S3 H9 HK'));
    expect(s.phase).toBe('play');
    expect(s.turn).toBe(1);
    expect(totalCards(s)).toBe(53);
  });
  it('7・7＋ジョーカーなら3枚渡す。手札が足りなければ手札の枚数', () => {
    const s = makeTestState({ hands: [H('S7 H7 JK S3 D4 C5 C6'), H('H9'), H('D9'), H('C10')], turn: 0 });
    doPlay(s, 0, 'S7 H7 JK');
    expect(s.pendingCards?.count).toBe(3);
    expect(() => chooseCards(s, 0, H('S3 D4'))).toThrow();
    chooseCards(s, 0, H('S3 D4 C5'));
    expect(s.hands[0]).toEqual(H('C6'));
    expect(s.hands[1]).toHaveLength(4);
    expect(s.turn).toBe(1);
    const t = makeTestState({ hands: [H('S7 H7 S3'), H('H9'), H('D9'), H('C10')], turn: 0 });
    doPlay(t, 0, 'S7 H7');
    expect(t.pendingCards?.count).toBe(1);
  });
  it('階段で7・10の代わりをしたジョーカーでも、7渡し・10捨てが起きる', () => {
    expect(effectsOf(P('H6 JK H8', 7)).sevenPass).toBe(1);
    expect(effectsOf(P('H9 JK HJ', 10)).tenDiscard).toBe(1);
    expect(effectsOf(P('H7 H8 H9')).sevenPass).toBe(1);
    // 端のジョーカーは、どちらの数字として出したかで決まる
    expect(effectsOf(P('H5 H6 JK', 7)).sevenPass).toBe(1);
    expect(effectsOf(P('H5 H6 JK', 4)).sevenPass).toBe(0);
    const s = makeTestState({ hands: [H('H6 JK H8 S3'), H('C9'), H('D9'), H('C10')], turn: 0 });
    doPlay(s, 0, 'H6 JK H8', 7);
    expect(s.phase).toBe('sevenPass');
    chooseCards(s, 0, H('S3'));
    expect(s.hands[1]).toEqual(H('S3 C9'));
  });
  it('次の人が上がっていれば、その次の人に渡す', () => {
    const s = makeTestState({ hands: [H('S7 S3'), [], H('D9'), H('C10')], turn: 0 });
    s.finished = [1];
    doPlay(s, 0, 'S7');
    expect(s.pendingCards?.to).toBe(2);
  });
  it('渡して手札がなくなったら上がる', () => {
    const s = makeTestState({ hands: [H('S7 S3'), H('H9'), H('D9 D4'), H('C10 C4')], turn: 0 });
    doPlay(s, 0, 'S7');
    chooseCards(s, 0, H('S3'));
    expect(s.finished).toEqual([0]);
    expect(types(s)).toContain('finish');
    expect(s.turn).toBe(1);
  });
  it('7を出して上がったときは7渡しは起きない', () => {
    const s = makeTestState({ hands: [H('S7'), H('H9'), H('D9'), H('C10')], turn: 0 });
    doPlay(s, 0, 'S7');
    expect(s.phase).toBe('play');
    expect(s.finished).toEqual([0]);
  });
  it('10を1枚出すと、手札から1枚捨てる', () => {
    const s = makeTestState({ hands: [H('S10 S3 D4'), H('HJ'), H('D9'), H('CQ')], turn: 0 });
    const before = s.discard.length;
    doPlay(s, 0, 'S10');
    expect(s.phase).toBe('tenDiscard');
    expect(() => chooseCards(s, 0, H('S3 D4'))).toThrow();
    chooseCards(s, 0, H('D4'));
    expect(s.hands[0]).toEqual(H('S3'));
    expect(s.discard.length).toBe(before + 1);
    expect(s.turn).toBe(1);
    expect(totalCards(s)).toBe(53);
  });
  it('順番は 7渡し → 10捨て → 革命 → 8切り', () => {
    const s = makeTestState({ hands: [H('H7 H8 H9 H10 S3 S4 S5'), H('C4'), H('D7'), H('C10')], turn: 0 });
    doPlay(s, 0, 'H7 H8 H9 H10');
    expect(s.phase).toBe('sevenPass');
    chooseCards(s, 0, H('S3'));
    expect(s.phase).toBe('tenDiscard');
    chooseCards(s, 0, H('S4'));
    const order = types(s).filter((t) => ['sevenPass', 'tenDiscard', 'revolution', 'eightCut'].includes(t));
    expect(order).toEqual(['sevenPass', 'tenDiscard', 'revolution', 'eightCut']);
    expect(s.turn).toBe(0);
  });
  it('12ボンバーのあとに7渡し。ボンバーで手札がなくなったら7渡しはない', () => {
    const only: Partial<Rules> = { eightCut: false, elevenBack: false, revolution: false, tenDiscard: false };
    const s = makeTestState({ hands: [H('S7 S8 S9 S10 SJ SQ S3 D4'), H('C5'), H('D7'), H('C10')], turn: 0, rules: only });
    doPlay(s, 0, 'S7 S8 S9 S10 SJ SQ');
    expect(s.phase).toBe('bomber');
    chooseBomber(s, 0, [3]);
    expect(s.phase).toBe('sevenPass');
    const t = makeTestState({ hands: [H('S7 S8 S9 S10 SJ SQ S3'), H('C5'), H('D7'), H('C10')], turn: 0, rules: only });
    doPlay(t, 0, 'S7 S8 S9 S10 SJ SQ');
    chooseBomber(t, 0, [3]);
    expect(t.finished).toEqual([0]);
    expect(t.phase).toBe('play');
    expect(types(t)).not.toContain('sevenPass');
  });
  it('ルールがオフなら起きない', () => {
    const s = makeTestState({ hands: [H('S7 S3'), H('H9'), H('D9'), H('C10')], turn: 0, rules: NO_HAND });
    doPlay(s, 0, 'S7');
    expect(s.phase).toBe('play');
    expect(s.turn).toBe(1);
    const t = makeTestState({ hands: [H('S10 S3'), H('HJ'), H('D9'), H('CQ')], turn: 0, rules: { tenDiscard: false } });
    doPlay(t, 0, 'S10');
    expect(t.phase).toBe('play');
  });
});

describe('階段で数字の代わりをしたジョーカー（実際に出して確かめる）', () => {
  it('5の代わり → 5スキップで1人とばす', () => {
    const s = makeTestState({ hands: [H('H4 JK H6 S3'), H('C9'), H('D9'), H('C10')], turn: 0, rules: NO_HAND });
    doPlay(s, 0, 'H4 JK H6', 5);
    expect(types(s)).toContain('skip');
    expect(s.turn).toBe(2);
  });
  it('8の代わり → 8切りで場が流れる', () => {
    const s = makeTestState({ hands: [H('H7 JK H9 S3'), H('C9'), H('D9'), H('C10')], turn: 0, rules: NO_HAND });
    doPlay(s, 0, 'H7 JK H9', 8);
    expect(types(s)).toContain('eightCut');
    expect(s.table).toHaveLength(0);
    expect(s.turn).toBe(0);
  });
  it('11の代わり → 11バックで強さが逆になる', () => {
    const s = makeTestState({ hands: [H('H10 JK HQ S3'), H('C9'), H('D9'), H('C10')], turn: 0, rules: { ...NO_HAND, twelveBomber: false } });
    doPlay(s, 0, 'H10 JK HQ', 11);
    expect(types(s)).toContain('elevenBack');
    expect(isReversed(s)).toBe(true);
  });
  it('12の代わり → 12ボンバーで数字を選ぶ', () => {
    const s = makeTestState({ hands: [H('HJ JK HK S3'), H('C9'), H('D9'), H('C10')], turn: 0, rules: { ...NO_HAND, elevenBack: false } });
    doPlay(s, 0, 'HJ JK HK', 12);
    expect(s.phase).toBe('bomber');
    expect(s.pendingBomber?.count).toBe(1);
  });
  it('ジョーカー1枚だけで出したときは効果なし', () => {
    expect(effectsOf(P('JK'))).toEqual({ bomber: 0, sevenPass: 0, tenDiscard: 0, revolution: false, elevenBack: false, eightCut: false, skip: 0 });
  });
});
