import { parseCards } from '../src/engine/cards';
import { Play, interpret } from '../src/engine/plays';
import { State, findPlays } from '../src/engine/game';

export const H = parseCards;

/** カードの文字から出し方を1つ作る（複数あるときは jokerRank で選ぶ） */
export function P(text: string, jokerRank?: number): Play {
  const plays = interpret(parseCards(text));
  const p = jokerRank === undefined ? plays[0] : plays.find((x) => x.jokerRank === jokerRank);
  if (!p) throw new Error('出し方にならない: ' + text);
  return p;
}

/** その人が、そのカードで出せる出し方を返す（なければ null） */
export function legal(s: State, player: number, text: string, jokerRank?: number): Play | null {
  const plays = findPlays(s, player, parseCards(text));
  if (jokerRank !== undefined) return plays.find((p) => p.jokerRank === jokerRank) ?? null;
  return plays[0] ?? null;
}
