// 出せるカードの判定（playableCards）。画面で暗くするカードと、選んだあとに一緒に出せるカード
import { describe, expect, it } from 'vitest';
import { parseCards } from '../src/engine/cards';
import { makeTestState, playableCards } from '../src/engine/game';
import { H, P } from './helpers';

/** 出せるカード（並びは手札の順） */
const cardsOf = (s: ReturnType<typeof makeTestState>, sel = '') => {
  const set = playableCards(s, 0, parseCards(sel)).cards;
  return parseCards(handText(s)).filter((c) => set.has(c)).sort((a, b) => a - b);
};
const handText = (s: ReturnType<typeof makeTestState>) => s.hands[0].map((c) => LABEL[c]).join(' ');
const LABEL: string[] = [];
for (const suit of 'SHDC') for (const r of ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2']) LABEL.push(suit + r);
LABEL.push('JK');
const set = (text: string) => [...parseCards(text)].sort((a, b) => a - b);

describe('出せるカードの判定', () => {
  it('場に5が1枚なら、3・4・5は出せない', () => {
    const s = makeTestState({ hands: [H('S3 H4 D5 C6 S9'), H('S7'), [], []], table: [{ player: 1, play: P('H5') }], turn: 0 });
    expect(cardsOf(s)).toEqual(set('C6 S9'));
  });

  it('場が空なら全部出せる。自分の番でなければ何も出せない', () => {
    const s = makeTestState({ hands: [H('S3 H4 D5'), H('S7'), [], []], turn: 0 });
    expect(cardsOf(s)).toEqual(set('S3 H4 D5'));
    s.turn = 1;
    expect(cardsOf(s)).toEqual([]);
  });

  it('場の枚数：2枚出しには、2枚そろう数字とジョーカーだけ', () => {
    const s = makeTestState({ hands: [H('S3 H6 D6 S9 HK JK'), H('S7'), [], []], table: [{ player: 1, play: P('S5 H5') }], turn: 0 });
    // 6のペア、9＋ジョーカー、K＋ジョーカー。3は弱いので出せない
    expect(cardsOf(s)).toEqual(set('H6 D6 S9 HK JK'));
  });

  it('革命中・11バック中は弱い方が出せる', () => {
    const s = makeTestState({ hands: [H('S3 H4 C9'), H('S7'), [], []], table: [{ player: 1, play: P('H5') }], turn: 0, revolution: true });
    expect(cardsOf(s)).toEqual(set('S3 H4'));
    const s2 = makeTestState({ hands: [H('S3 H4 C9'), H('S7'), [], []], table: [{ player: 1, play: P('H5') }], turn: 0, elevenBack: true });
    expect(cardsOf(s2)).toEqual(set('S3 H4'));
    // 革命中の11バックは元の向き
    const s3 = makeTestState({ hands: [H('S3 H4 C9'), H('S7'), [], []], table: [{ player: 1, play: P('H5') }], turn: 0, revolution: true, elevenBack: true });
    expect(cardsOf(s3)).toEqual(set('C9'));
  });

  it('マークしばり・数しば・激しば', () => {
    const base = () => makeTestState({ hands: [H('H6 S6 H9 S7 JK'), H('S3'), [], []], table: [{ player: 1, play: P('H5') }], turn: 0 });
    const mark = base();
    mark.lockSuit = 'H';
    expect(cardsOf(mark)).toEqual(set('H6 H9 JK'));
    const num = base();
    num.lockNum = true;
    expect(cardsOf(num)).toEqual(set('H6 S6 JK'));
    const geki = base();
    geki.lockSuit = 'H';
    geki.lockNum = true;
    expect(cardsOf(geki)).toEqual(set('H6 JK'));
  });

  it('ジョーカー1枚には何も出せない', () => {
    const s = makeTestState({ hands: [H('S2 S3'), H('S7'), [], []], table: [{ player: 1, play: P('JK') }], turn: 0 });
    expect(cardsOf(s)).toEqual([]);
  });

  it('階段：同じマークの3枚以上の連番。ジョーカーで穴を埋められる', () => {
    const s = makeTestState({ hands: [H('H6 H8 H9 S7 C4'), H('S3'), [], []], table: [{ player: 1, play: P('D3 D4 D5') }], turn: 0 });
    // ♥6・♥8・♥9は7がないので階段にならない
    expect(cardsOf(s)).toEqual([]);
    const s2 = makeTestState({ hands: [H('H6 H8 H9 S7 C4 JK'), H('S3'), [], []], table: [{ player: 1, play: P('D3 D4 D5') }], turn: 0 });
    // ♥6・JK・♥8 や ♥8・♥9・JK など
    expect(cardsOf(s2)).toEqual(set('H6 H8 H9 JK'));
  });

  it('選んだカードと一緒に出せるカード（同じ数字・階段の続き・ジョーカー）', () => {
    const s = makeTestState({ hands: [H('H5 H6 H7 S5 C9 JK'), H('S3'), [], []], turn: 0 });
    // ♥5を選ぶと、♠5（ペア）、♥6・♥7（階段）、ジョーカー。♣9は一緒に出せない
    expect(cardsOf(s, 'H5')).toEqual(set('H5 H6 H7 S5 JK'));
    // ♥5と♠5を選ぶと、ジョーカーだけ（3枚の重ね数字）
    expect(cardsOf(s, 'H5 S5')).toEqual(set('H5 S5 JK'));
    // ♥5と♥6を選ぶと、階段の続き
    expect(cardsOf(s, 'H5 H6')).toEqual(set('H5 H6 H7 JK'));
  });

  it('場が1枚なら、選んだカードと一緒に出せるカードはない', () => {
    const s = makeTestState({ hands: [H('H6 S6 C9'), H('S3'), [], []], table: [{ player: 1, play: P('H5') }], turn: 0 });
    expect(cardsOf(s, 'H6')).toEqual(set('H6'));
  });
});
