// 設定をブラウザに保存する（3.6）
import { DEFAULT_RULES, Rules } from '../engine/game';
import { Level } from '../cpu/cpu';

export interface Settings {
  rules: Rules;
  level: Level;
  character: number;
}

const KEY = 'daifugo-settings-v1';

export function defaultSettings(): Settings {
  return { rules: { ...DEFAULT_RULES }, level: 'normal', character: 1 };
}

export function loadSettings(): Settings {
  const d = defaultSettings();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const v = JSON.parse(raw) as Partial<Settings>;
    const rules = { ...d.rules };
    for (const k of Object.keys(rules) as (keyof Rules)[]) if (typeof v.rules?.[k] === 'boolean') rules[k] = v.rules[k];
    const level = v.level === 'easy' || v.level === 'normal' || v.level === 'strong' ? v.level : d.level;
    const character = typeof v.character === 'number' && v.character >= 1 && v.character <= 4 ? v.character : d.character;
    return { rules, level, character };
  } catch {
    return d;
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // 保存できない環境（プライベートモードなど）でも遊べるようにする
  }
}
