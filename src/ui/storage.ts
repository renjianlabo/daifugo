// 設定と、対戦の途中の状態をブラウザに保存する（3.6）
import { DEFAULT_RULES, Rules, State, totalCards } from '../engine/game';
import { DECK_SIZE } from '../engine/cards';
import { Level } from '../cpu/cpu';

/** 対戦の回数。1回はポイントなしで順位だけ、3回・5回はポイント制 */
export type Rounds = 1 | 3 | 5;
export const ROUND_CHOICES: Rounds[] = [1, 3, 5];

export interface Settings {
  rules: Rules;
  level: Level;
  character: number;
  rounds: Rounds;
}

const KEY = 'daifugo-settings-v1';
const GAME_KEY = 'daifugo-game-v1';

export function defaultSettings(): Settings {
  return { rules: { ...DEFAULT_RULES }, level: 'normal', character: 1, rounds: 3 };
}

const validLevel = (v: unknown): v is Level => v === 'easy' || v === 'normal' || v === 'strong';
const validCharacter = (v: unknown): v is number => typeof v === 'number' && v >= 1 && v <= 4;
const validRounds = (v: unknown): v is Rounds => v === 1 || v === 3 || v === 5;

export function loadSettings(): Settings {
  const d = defaultSettings();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const v = JSON.parse(raw) as Partial<Settings>;
    const rules = { ...d.rules };
    for (const k of Object.keys(rules) as (keyof Rules)[]) if (typeof v.rules?.[k] === 'boolean') rules[k] = v.rules[k];
    const level = validLevel(v.level) ? v.level : d.level;
    const character = validCharacter(v.character) ? v.character : d.character;
    const rounds = validRounds(v.rounds) ? v.rounds : d.rounds;
    return { rules, level, character, rounds };
  } catch {
    return d;
  }
}

/** 保存できたら true。保存できない環境（プライベートモードなど）でも遊べるようにする */
export function saveSettings(s: Settings): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

/** 中断した対戦。キャラと強さも、始めたときのものを残す（設定をあとで変えても、続きは同じ条件で遊ぶ） */
export interface SavedGame {
  state: State;
  character: number;
  level: Level;
}

/** 保存できたら true。出来事の記録（events）は演出にしか使わないので残さない */
export function saveGame(g: SavedGame): boolean {
  try {
    localStorage.setItem(GAME_KEY, JSON.stringify({ ...g, state: { ...g.state, events: [] } }));
    return true;
  } catch {
    return false;
  }
}

/** 中断した対戦を読む。ないとき・壊れているときは null（壊れたデータは再開に使わない） */
export function loadGame(): SavedGame | null {
  try {
    const raw = localStorage.getItem(GAME_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as SavedGame;
    const s = v.state;
    const ok = validLevel(v.level) && validCharacter(v.character) && validRounds(s.rounds)
      && Array.isArray(s.hands) && s.hands.length === 4 && totalCards(s) === DECK_SIZE && s.round >= 1 && s.round <= s.rounds;
    return ok ? v : null;
  } catch {
    return null;
  }
}

export function clearGame() {
  try {
    localStorage.removeItem(GAME_KEY);
  } catch {
    // 消せなくても遊びは続けられる
  }
}
