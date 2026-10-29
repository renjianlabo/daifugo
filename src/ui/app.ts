// 画面（5章）。タイトル → 設定 → キャラ選択 → 対戦（3回戦） → 最終結果
import { CHARACTERS, Character, characterById } from '../characters';
import { RANK_LABEL, cardId, cardLabel, isJoker, rankOf, suitOf } from '../engine/cards';
import { interpret } from '../engine/plays';
import {
  GameEvent, POINTS, RANK_NAMES, RULE_NAMES, Rules, State, canPass, chooseBomber, chooseCards, currentRanks, findPlays, giveExchange,
  isActive, isReversed, listMoves, lockKind, newGame, nextRound, pass, play, topEntry,
} from '../engine/game';
import { CpuOptions, LEVEL_NAMES, Level, PERSONALITY_WEIGHTS, cpuAct } from '../cpu/cpu';
import { FxPose, artImg, avatarBig, avatarSmall, preloadArt } from './avatar';
import { Settings, defaultSettings, loadSettings, saveSettings } from './storage';

type Screen = 'title' | 'settings' | 'select' | 'game' | 'final';

const HUMAN = 0;
const FX_MS = 1200;
/** 出せる手がないとき、自動でパスするまでの間（パスしたことが分かるように少し待つ） */
const AUTO_PASS_MS = 700;
/** 出来事のカードを一瞬見せて消す時間 */
const FLASH_MS = 1100;
// 「|」は折り返してよい場所（言葉の途中で折り返さないようにする）
const RULE_HELP: Record<keyof Rules, string> = {
  eightCut: '8を出すと|場が流れる',
  fiveSkip: '5の枚数分、|次の人を|とばす',
  elevenBack: 'Jを出すと、|場が流れるまで|強さが逆',
  twelveBomber: 'Qの枚数分、|数字を選んで|全員から捨てる',
  sevenPass: '7の枚数分、|次の人に|カードを渡す',
  tenDiscard: '10の枚数分、|手札を|捨てる',
  revolution: '同じ数字4枚か|階段4枚以上で|強さが逆',
  markLock: '同じマークが|2回続くと、|そのマークだけ',
  numLock: '数字が1つずつ|2回続くと、|次の数字だけ',
  gekiLock: 'マークと数字が|同時にそろうと|両方しばる',
  exchange: '2回戦目から、|順位で|カードを交換',
  miyakoOchi: '前の大富豪が|1位でないと|大貧民',
};
// 数字のカードのルールは数字の小さい順。そのあとに数字に関係しないルール
const RULE_ORDER: (keyof Rules)[] = [
  'fiveSkip', 'sevenPass', 'eightCut', 'tenDiscard', 'elevenBack', 'twelveBomber', 'revolution', 'markLock', 'numLock', 'gekiLock',
  'exchange', 'miyakoOchi',
];

/** 「|」を折り返し位置に変える */
const wb = (t: string) => t.split('|').map((x) => esc(x)).join('<wbr>');
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

// ---------------- 対戦の進行役 ----------------

interface Fx { char: Character; text: string; pose: FxPose }

/** 出来事のカード（12ボンバー・10捨てで捨てられたカード、交換・7渡しで自分が渡した・受け取ったカード）を一瞬見せる */
interface Flash { cards: number[]; start: number }

/** 人間がカードを選んで手放す作業（カード交換・7渡し・10捨て）。count はちょうど選ぶ枚数 */
interface HandTask { kind: 'exchange' | 'sevenPass' | 'tenDiscard'; to: number | null; count: number }

class GameController {
  s: State;
  seats: Character[];
  opts: CpuOptions[];
  rng = { seed: (Date.now() & 0x7fffffff) ^ 0x5bd1e995 };
  selected = new Set<number>();
  bomberPick = new Set<number>();
  eventIdx = 0;
  fxQueue: Fx[] = [];
  fx: Fx | null = null;
  flash: Flash | null = null;
  thinking: number | null = null;
  quitConfirm = false;
  /** 自動パスを待っている途中 */
  private autoPassWaiting = false;
  alive = true;
  /** 検査用：CPUを動かさず、画面だけ描く */
  frozen = false;
  /** 検査用：待ち時間をなくす */
  fast = false;
  private timers: number[] = [];

  constructor(public settings: Settings, private onChange: () => void, private onFinish: () => void) {
    const me = characterById(settings.character);
    this.seats = [me, ...CHARACTERS.filter((c) => c.id !== me.id)];
    preloadArt(this.seats);
    this.opts = this.seats.map((c) => ({ level: settings.level, weights: PERSONALITY_WEIGHTS[c.personality] }));
    this.s = newGame(settings.rules, Math.floor(Math.random() * 2 ** 31));
  }

  name(i: number): string {
    return i === HUMAN ? 'あなた' : this.seats[i].name;
  }

  stop() {
    this.alive = false;
    this.timers.forEach((t) => clearTimeout(t));
    this.timers = [];
  }

  private later(fn: () => void, ms: number) {
    const id = window.setTimeout(() => {
      this.timers = this.timers.filter((x) => x !== id);
      if (this.alive) fn();
    }, ms);
    this.timers.push(id);
  }

  private consumeEvents() {
    const s = this.s;
    const shown: number[] = [];
    for (; this.eventIdx < s.events.length; this.eventIdx++) shown.push(...this.describe(s.events[this.eventIdx]));
    if (shown.length) this.showFlash(shown);
  }

  private showFlash(cards: number[]) {
    const flash = { cards, start: performance.now() };
    this.flash = flash;
    this.later(() => {
      if (this.flash !== flash) return;
      this.flash = null;
      this.onChange();
    }, this.fast ? 30 : FLASH_MS);
  }

  /** 出来事を演出に変える。文字では説明せず、一瞬見せるカードを返す */
  private describe(e: GameEvent): number[] {
    switch (e.type) {
      case 'exchange': return e.from === HUMAN || e.to === HUMAN ? e.cards : [];
      case 'bomber': return e.removed.flat();
      case 'sevenPass': return e.from === HUMAN || e.to === HUMAN ? e.cards : [];
      case 'tenDiscard': return e.cards;
      case 'joker': this.fxQueue.push({ char: this.seats[e.player], text: 'ジョーカー！', pose: 'special' }); break;
      case 'revolution': this.fxQueue.push({ char: this.seats[e.player], text: '革命！', pose: 'special' }); break;
      case 'finish': this.fxQueue.push({ char: this.seats[e.player], text: `${e.rank}位！`, pose: e.rank as FxPose }); break;
      // 都落ちした人は、その時点で4位に決まる
      case 'fall': this.fxQueue.push({ char: this.seats[e.player], text: '4位！', pose: 4 }); break;
      default: break;
    }
    return [];
  }

  /** 状態が変わるたびに呼ぶ。演出・CPUの番・人間の入力待ちを振り分ける */
  advance(): void {
    if (!this.alive) return;
    this.consumeEvents();
    if (this.frozen || this.fx) return this.onChange();
    if (this.fxQueue.length) {
      this.fx = this.fxQueue.shift()!;
      this.onChange();
      this.later(() => this.skipFx(), this.fast ? 30 : FX_MS);
      return;
    }
    const s = this.s;
    if (s.phase === 'gameEnd') return this.onFinish();
    if (s.phase === 'roundEnd') return this.onChange();
    if (s.phase === 'exchange') {
      for (const t of [...s.pendingExchange]) {
        if (t.from === HUMAN) continue;
        const a = cpuAct(s, t.from, this.opts[t.from], this.rng);
        if (a?.cards) giveExchange(s, t.from, a.cards);
      }
      this.consumeEvents();
      if (s.phase === 'exchange') return this.onChange();
      return this.advance();
    }
    if (s.phase === 'bomber') {
      const pb = s.pendingBomber!;
      if (pb.player === HUMAN) return this.onChange();
      return this.cpuTurn(pb.player);
    }
    if (s.phase === 'sevenPass' || s.phase === 'tenDiscard') {
      const pc = s.pendingCards!;
      if (pc.player === HUMAN) return this.onChange();
      return this.cpuTurn(pc.player);
    }
    if (s.turn === HUMAN) {
      if (!this.frozen && listMoves(s, HUMAN).length === 0 && canPass(s, HUMAN)) this.autoPass();
      return this.onChange();
    }
    this.cpuTurn(s.turn);
  }

  /** 出せる手がないので、少し待ってから自動でパスする */
  private autoPass() {
    if (this.autoPassWaiting) return;
    this.autoPassWaiting = true;
    this.later(() => {
      this.autoPassWaiting = false;
      const s = this.s;
      if (this.fx || s.phase !== 'play' || s.turn !== HUMAN || listMoves(s, HUMAN).length > 0 || !canPass(s, HUMAN)) return;
      this.selected.clear();
      pass(s, HUMAN);
      this.advance();
    }, this.fast ? 0 : AUTO_PASS_MS);
  }

  private cpuTurn(p: number) {
    this.thinking = p;
    this.onChange();
    const delay = this.fast ? 0 : 500 + Math.random() * 1000;
    const start = Date.now();
    this.later(() => {
      if (this.frozen) return;
      const a = cpuAct(this.s, p, this.opts[p], this.rng);
      const wait = Math.max(0, delay - (Date.now() - start));
      this.later(() => {
        if (this.frozen) return;
        this.thinking = null;
        if (a?.kind === 'play') play(this.s, p, a.play!);
        else if (a?.kind === 'pass') pass(this.s, p);
        else if (a?.kind === 'bomber') chooseBomber(this.s, p, a.ranks!);
        else if (a?.kind === 'cards') chooseCards(this.s, p, a.cards!);
        this.advance();
      }, wait);
    }, 30);
  }

  skipFx() {
    if (!this.fx) return;
    this.fx = null;
    this.advance();
  }

  // --- 人間の操作 ---
  humanTask(): HandTask | null {
    const s = this.s;
    if (s.phase === 'exchange') {
      const t = s.pendingExchange.find((x) => x.from === HUMAN);
      return t ? { kind: 'exchange', to: t.to, count: t.count } : null;
    }
    const pc = s.pendingCards;
    if ((s.phase === 'sevenPass' || s.phase === 'tenDiscard') && pc?.player === HUMAN) return { kind: pc.kind, to: pc.to, count: pc.count };
    return null;
  }

  canPlaySelected(): boolean {
    if (this.fx || this.s.phase !== 'play' || this.s.turn !== HUMAN) return false;
    return findPlays(this.s, HUMAN, [...this.selected]).length > 0;
  }

  toggleCard(id: number) {
    if (this.selected.has(id)) this.selected.delete(id);
    else this.selected.add(id);
    this.onChange();
  }

  playSelected() {
    if (!this.canPlaySelected()) return;
    const plays = findPlays(this.s, HUMAN, [...this.selected]);
    // ジョーカー入りの階段で2通りに読めるときは、今の強さの向きで強い方を選ぶ
    const rev = isReversed(this.s);
    plays.sort((a, b) => (rev ? a.rank - b.rank : b.rank - a.rank));
    this.selected.clear();
    play(this.s, HUMAN, plays[0]);
    this.advance();
  }

  passTurn() {
    if (this.fx || !canPass(this.s, HUMAN)) return;
    this.selected.clear();
    pass(this.s, HUMAN);
    this.advance();
  }

  giveSelected() {
    const t = this.humanTask();
    if (!t || this.selected.size !== t.count) return;
    if (t.kind === 'exchange') giveExchange(this.s, HUMAN, [...this.selected]);
    else chooseCards(this.s, HUMAN, [...this.selected]);
    this.selected.clear();
    this.advance();
  }

  toggleBomber(r: number) {
    const pb = this.s.pendingBomber;
    if (!pb || pb.player !== HUMAN) return;
    if (this.bomberPick.has(r)) this.bomberPick.delete(r);
    else if (this.bomberPick.size < pb.count) this.bomberPick.add(r);
    this.onChange();
  }

  confirmBomber() {
    const pb = this.s.pendingBomber;
    if (!pb || pb.player !== HUMAN || this.bomberPick.size !== pb.count) return;
    chooseBomber(this.s, HUMAN, [...this.bomberPick]);
    this.bomberPick.clear();
    this.advance();
  }

  nextRound() {
    if (this.s.phase !== 'roundEnd') return;
    this.selected.clear();
    nextRound(this.s);
    this.advance();
  }
}

const LOCK_NAMES = { mark: 'マークしばり', num: '数しば', geki: '激しば' } as const;
const NO_EFFECTS = { bomber: 0, sevenPass: 0, tenDiscard: 0, revolution: false, elevenBack: false, eightCut: false, skip: 0 };

// ---------------- 画面を作る ----------------

export function startApp(root: HTMLElement) {
  let settings: Settings = loadSettings();
  let screen: Screen = 'title';
  let game: GameController | null = null;
  let finalState: { s: State; seats: Character[] } | null = null;
  let pickChar = settings.character;
  let fastMode = false;

  const go = (sc: Screen) => {
    screen = sc;
    render();
    window.scrollTo(0, 0);
  };

  const startGame = () => {
    game?.stop();
    game = new GameController(settings, render, () => {
      finalState = { s: game!.s, seats: game!.seats };
      game!.stop();
      game = null;
      go('final');
    });
    game.fast = fastMode;
    go('game');
    game.advance();
  };

  const update = (next: Settings) => {
    settings = next;
    saveSettings(settings);
    render();
  };

  root.addEventListener('click', (ev) => {
    const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!el || (el as HTMLButtonElement).disabled) return;
    const act = el.dataset.act!;
    const arg = el.dataset.arg ?? '';
    switch (act) {
      case 'toTitle': game?.stop(); game = null; go('title'); break;
      case 'toSettings': go('settings'); break;
      case 'toSelect': pickChar = settings.character; go('select'); break;
      case 'level': update({ ...settings, level: arg as Level }); break;
      case 'rule': {
        const k = arg as keyof Rules;
        update({ ...settings, rules: { ...settings.rules, [k]: !settings.rules[k] } });
        break;
      }
      case 'resetRules': update({ ...settings, rules: defaultSettings().rules }); break;
      case 'pickChar': pickChar = Number(arg); render(); break;
      case 'start': update({ ...settings, character: pickChar }); startGame(); break;
      case 'again': startGame(); break;
      case 'card': game?.toggleCard(Number(arg)); break;
      case 'play': game?.playSelected(); break;
      case 'pass': game?.passTurn(); break;
      case 'give': game?.giveSelected(); break;
      case 'bomberRank': game?.toggleBomber(Number(arg)); break;
      case 'bomberOk': game?.confirmBomber(); break;
      case 'fxSkip': game?.skipFx(); break;
      case 'nextRound': game?.nextRound(); break;
      case 'quit': if (game) { game.quitConfirm = true; render(); } break;
      case 'quitNo': if (game) { game.quitConfirm = false; render(); } break;
      case 'quitYes': game?.stop(); game = null; go('title'); break;
    }
  });

  // 検査用（開発サーバーのときだけ）：決まった場面を作る・待ち時間をなくす
  if (import.meta.env.DEV) {
    fastMode = new URLSearchParams(location.search).has('fast');
    (window as unknown as { __daifugo: unknown }).__daifugo = {
      scenario,
      legal: () => (game && game.s.phase === 'play' && game.s.turn === HUMAN ? listMoves(game.s, HUMAN).map((p) => p.cards) : []),
      state: () => game && { phase: game.s.phase, turn: game.s.turn, round: game.s.round, fx: !!game.fx, task: game.humanTask(), bomber: game.s.pendingBomber },
    };
  }

  function scenario(name: string) {
    settings = { ...loadSettings(), character: 1 };
    startGame();
    const g = game!;
    g.frozen = true;
    g.thinking = null;
    const s = g.s;
    const i14 = s.hands.findIndex((h) => h.length === 14);
    [s.hands[0], s.hands[i14]] = [s.hands[i14], s.hands[0]];
    Object.assign(s, { phase: 'play', pendingExchange: [], turn: 0, table: [], lastPlayer: null });
    switch (name) {
      case 'hand':
        g.selected = new Set(s.hands[0].slice(0, 2));
        break;
      case 'table': {
        const stair = [5, 6, 7, 8, 9].map((r) => cardId('H', r));
        s.hands = s.hands.map((h) => h.filter((c) => !stair.includes(c)));
        s.table = [{ player: 2, play: interpret(stair)[0], effRank: 5, effSuitKey: 'H' }];
        Object.assign(s, { lastPlayer: 2, revolution: true, elevenBack: true, lockSuit: 'H', lockNum: true, turn: 3 });
        s.passed[0] = true;
        s.passed[1] = true;
        g.thinking = 3;
        break;
      }
      case 'exchange':
        Object.assign(s, { phase: 'roundEnd', prevRanks: [1, 4, 2, 3], roundRanks: [[1, 4, 2, 3]], scores: [3, 0, 2, 1], round: 1 });
        nextRound(s);
        for (const t of [...s.pendingExchange]) if (t.from !== HUMAN) giveExchange(s, t.from, s.hands[t.from].slice(0, t.count));
        break;
      case 'bomber':
        s.phase = 'bomber';
        s.pendingBomber = { player: 0, count: 2, eff: { ...NO_EFFECTS, bomber: 2 } };
        g.bomberPick = new Set([3]);
        break;
      case 'sevenPass':
      case 'tenDiscard': {
        // 7（10）を誰かの手札から1枚取り、あなたが出したことにする
        const r = name === 'sevenPass' ? 7 : 10;
        const card = s.hands.flat().find((c) => !isJoker(c) && rankOf(c) === r)!;
        s.hands = s.hands.map((h) => h.filter((c) => c !== card));
        s.table = [{ player: 0, play: interpret([card])[0], effRank: r, effSuitKey: suitOf(card) }];
        s.lastPlayer = 0;
        s.phase = name;
        s.pendingCards = { kind: name, player: 0, count: 1, to: name === 'sevenPass' ? 1 : null, eff: { ...NO_EFFECTS } };
        g.selected = new Set([s.hands[0][0]]);
        break;
      }
      case 'flash': {
        // 12ボンバーで捨てられたカードが一瞬見えている途中
        const q = s.hands[2].find((c) => !isJoker(c) && rankOf(c) === 12) ?? cardId('S', 12);
        s.hands = s.hands.map((h) => h.filter((c) => c !== q));
        s.table = [{ player: 2, play: interpret([q])[0], effRank: 12, effSuitKey: suitOf(q) }];
        s.lastPlayer = 2;
        const gone = s.hands.flatMap((h) => h.filter((c) => !isJoker(c) && rankOf(c) === 4));
        s.hands = s.hands.map((h) => h.filter((c) => !gone.includes(c)));
        g.flash = { cards: gone, start: performance.now() - 400 };
        break;
      }
      case 'fx':
        g.fx = { char: g.seats[0], text: '革命！', pose: 'special' };
        break;
      case 'fxRank':
        g.fx = { char: g.seats[0], text: '4位！', pose: 4 };
        break;
      case 'fxC4':
        g.fx = { char: g.seats[3], text: 'ジョーカー！', pose: 'special' };
        break;
      case 'fxC2':
        g.fx = { char: g.seats[1], text: '革命！', pose: 'special' };
        break;
      case 'fxC3':
        g.fx = { char: g.seats[2], text: '1位！', pose: 1 };
        break;
      default: {
        // 「rankFx:席:順位」：本物のルール処理で、その席の人をその順位で上がらせる（4位は最後に残る）
        const rf = /^rankFx:(\d):([1-4])$/.exec(name);
        if (rf) {
          const seat = Number(rf[1]);
          const rank = Number(rf[2]);
          const others = [0, 1, 2, 3].filter((i) => i !== seat);
          // 先に上がっている人（4位のときは2人。3人目が最後の1枚を出して3位になり、その席の人が残る）
          const done = others.slice(0, Math.min(rank - 1, 2));
          const rest = others.slice(done.length);
          // 最後の1枚は効果のない ♠4。4位のときは、ほかの人が最後の1枚を出して上がり、その人だけが残る
          const card = cardId('S', 4);
          const actor = rank === 4 ? rest[0] : seat;
          s.hands = s.hands.map((h) => h.filter((c) => c !== card));
          s.finished = done;
          for (const p of done) { s.discard.push(...s.hands[p]); s.hands[p] = []; }
          s.discard.push(...s.hands[actor]);
          s.hands[actor] = [card];
          Object.assign(s, { turn: actor, table: [], lastPlayer: null });
          play(s, actor, interpret([card])[0]);
          break;
        }
        // 「fx:席:絵」（例 fx:2:4）で、その席のキャラのその絵の演出を出す
        const m = /^fx:(\d):(special|[1-4])$/.exec(name);
        if (m) {
          const pose = (m[2] === 'special' ? 'special' : Number(m[2])) as FxPose;
          g.fx = { char: g.seats[Number(m[1])], text: pose === 'special' ? '革命！' : `${pose}位！`, pose };
        }
      }
      case 'roundEnd':
        Object.assign(s, { phase: 'roundEnd', round: 2, roundRanks: [[2, 1, 3, 4], [1, 3, 4, 2]], scores: [5, 4, 1, 2] });
        break;
      case 'quit':
        g.quitConfirm = true;
        break;
      case 'final':
        Object.assign(s, { phase: 'gameEnd', round: 3, scores: [6, 5, 5, 2], roundRanks: [[1, 2, 3, 4], [2, 1, 3, 4], [2, 3, 1, 4]], finalOrder: [0, 2, 1, 3] });
        finalState = { s, seats: g.seats };
        g.stop();
        game = null;
        go('final');
        return;
    }
    g.advance();
    // rankFx：上がったときに積まれた演出のうち、その席・その順位のものを出す（なければ出さない＝不具合）
    const rf = /^rankFx:(\d):([1-4])$/.exec(name);
    if (rf) {
      const want = g.seats[Number(rf[1])];
      g.fx = g.fxQueue.find((f) => f.char === want && f.pose === Number(rf[2])) ?? null;
      g.fxQueue = [];
      render();
    }
  }

  function render() {
    if (screen === 'title') root.innerHTML = titleView(settings.character);
    else if (screen === 'settings') root.innerHTML = settingsView(settings);
    else if (screen === 'select') root.innerHTML = selectView(pickChar);
    else if (screen === 'game' && game) root.innerHTML = gameView(game);
    else if (screen === 'final' && finalState) root.innerHTML = finalView(finalState.s, finalState.seats);
    else root.innerHTML = titleView(settings.character);
  }

  render();
}

function titleView(pick: number): string {
  // 最後に選んだキャラに絵があればその絵、なければ絵のあるキャラ。絵は下が切れているので画面の下端につける
  const c = [characterById(pick), ...CHARACTERS].find((x) => x.images);
  return `
  <main class="screen title-screen">
    <div class="title-logo">
      <div class="title-suits"><span>♠</span><span class="red">♥</span><span class="red">♦</span><span>♣</span></div>
      <h1>大富豪</h1>
      <p class="lead">CPU 3人と 3回戦。<br>合計ポイントで 1位を めざそう。</p>
    </div>
    ${c ? artImg(c, 'special', 'title-art') : ''}
    <div class="title-start">
      <button class="btn primary big" data-act="toSettings">はじめる</button>
    </div>
  </main>`;
}

function headerBar(title: string, backAct: string): string {
  return `<header class="bar"><button class="btn ghost" data-act="${backAct}">戻る</button><h2>${title}</h2><span class="bar-space"></span></header>`;
}

function settingsView(st: Settings): string {
  const levels: Level[] = ['easy', 'normal', 'strong'];
  return `
  <main class="screen settings-screen">
    ${headerBar('設定', 'toTitle')}
    <div class="scroll">
      <section class="panel">
        <h3>CPUの強さ</h3>
        <div class="seg" role="group" aria-label="CPUの強さ">
          ${levels.map((l) => `<button class="seg-btn ${st.level === l ? 'on' : ''}" aria-pressed="${st.level === l}" data-act="level" data-arg="${l}">${LEVEL_NAMES[l]}</button>`).join('')}
        </div>
      </section>
      <section class="panel">
        <h3>ルール</h3>
        <ul class="rules">
          ${RULE_ORDER.map((k) => `
            <li class="rule-row">
              <div class="rule-text"><span class="rule-name">${RULE_NAMES[k]}</span><span class="rule-help">${wb(RULE_HELP[k])}</span></div>
              <button class="toggle ${st.rules[k] ? 'on' : ''}" aria-pressed="${st.rules[k]}" aria-label="${RULE_NAMES[k]}" data-act="rule" data-arg="${k}">${st.rules[k] ? 'オン' : 'オフ'}</button>
            </li>`).join('')}
        </ul>
        <button class="btn ghost wide" data-act="resetRules">初期設定に戻す</button>
      </section>
    </div>
    <footer class="foot"><button class="btn primary wide" data-act="toSelect">次へ（キャラ選択）</button></footer>
  </main>`;
}

function selectView(pick: number): string {
  return `
  <main class="screen select-screen">
    ${headerBar('キャラ選択', 'toSettings')}
    <div class="scroll">
      <p class="note">${wb('あなたが使う|キャラを|選んでください。|残りの3人が|CPUになります。')}</p>
      <div class="char-grid">
        ${CHARACTERS.map((c) => `
          <button class="char-card ${c.id === pick ? 'on' : ''}" aria-pressed="${c.id === pick}" data-act="pickChar" data-arg="${c.id}">
            ${avatarSmall(c, 'avatar-mid')}
            <span class="char-name">${c.name}</span>
          </button>`).join('')}
      </div>
    </div>
    <footer class="foot"><button class="btn primary wide" data-act="start">このキャラではじめる</button></footer>
  </main>`;
}

function cardFace(id: number, opts: { act?: boolean; sel?: boolean; style?: string; disabled?: boolean } = {}): string {
  const joker = isJoker(id);
  const suit = suitOf(id);
  const red = suit === 'H' || suit === 'D';
  const rank = joker ? 'JK' : RANK_LABEL[rankOf(id)];
  const mark = joker ? '★' : { S: '♠', H: '♥', D: '♦', C: '♣' }[suit!];
  const cls = `card ${red ? 'red' : ''} ${joker ? 'joker' : ''} ${opts.sel ? 'sel' : ''}`;
  const inner = `<span class="c-rank">${rank}</span><span class="c-suit">${mark}</span><span class="c-center">${mark}</span>`;
  if (opts.act) {
    return `<button class="${cls}" style="${opts.style ?? ''}" data-act="card" data-arg="${id}" aria-label="${cardLabel(id)}" aria-pressed="${!!opts.sel}" ${opts.disabled ? 'disabled' : ''}>${inner}</button>`;
  }
  return `<div class="${cls}" style="${opts.style ?? ''}" aria-label="${cardLabel(id)}">${inner}</div>`;
}

function handView(g: GameController, selectable: boolean): string {
  const hand = g.s.hands[HUMAN];
  const n = hand.length;
  if (n === 0) return `<div class="hand empty"><span>手札はありません</span></div>`;
  const cards = hand.map((id, i) => {
    const f = n === 1 ? 0 : i / (n - 1);
    const style = `left: calc((100% - var(--card-w)) * ${f.toFixed(4)})`;
    return cardFace(id, { act: true, sel: g.selected.has(id), style, disabled: !selectable });
  });
  return `<div class="hand" style="--n:${n}">${cards.join('')}</div>`;
}

function flagsView(s: State): string {
  const flags: string[] = [];
  if (s.revolution) flags.push('<span class="flag rev">革命中</span>');
  if (s.elevenBack) flags.push('<span class="flag back">11バック中</span>');
  const lk = lockKind(s);
  if (lk) {
    const marks = s.lockSuit ? ' ' + s.lockSuit.split('').map((x) => ({ S: '♠', H: '♥', D: '♦', C: '♣' })[x]).join('') : '';
    flags.push(`<span class="flag lock">${LOCK_NAMES[lk]}${lk !== 'num' ? marks : ''}</span>`);
  }
  return flags.join('');
}

function gameView(g: GameController): string {
  const s = g.s;
  const ranks = currentRanks(s);
  const task = g.humanTask();
  const myTurn = s.phase === 'play' && s.turn === HUMAN && !g.fx;
  const status = (i: number) => {
    if (!isActive(s, i) || ranks[i]) return `<span class="opp-status done">${RANK_NAMES[ranks[i] - 1] ?? ''}</span>`;
    if (g.thinking === i || (s.phase === 'play' && s.turn === i)) return `<span class="opp-status think">考え中…</span>`;
    if (s.phase === 'play' && s.passed[i]) return `<span class="opp-status pass">パス</span>`;
    return `<span class="opp-status"></span>`;
  };
  const isTurn = (i: number) => (s.phase === 'play' && s.turn === i) || (s.phase === 'bomber' && s.pendingBomber?.player === i)
    || ((s.phase === 'sevenPass' || s.phase === 'tenDiscard') && s.pendingCards?.player === i);

  const opps = [1, 2, 3].map((i) => `
    <div class="opp ${isTurn(i) ? 'turn' : ''}">
      ${avatarSmall(g.seats[i])}
      <span class="opp-name">${g.seats[i].name}</span>
      <span class="opp-count">${s.hands[i].length}枚</span>
      ${status(i)}
    </div>`).join('');

  const top = topEntry(s);
  const center = top
    ? `<div class="table-who">${avatarSmall(g.seats[top.player])}<span>${g.name(top.player)}</span></div>
      <div class="table-cards">${top.play.cards.map((c) => cardFace(c)).join('')}</div>`
    : '';
  const flash = g.flash
    ? `<div class="flash" style="animation-delay: -${Math.round(performance.now() - g.flash.start)}ms" aria-hidden="true"><div class="table-cards">${g.flash.cards.map((c) => cardFace(c)).join('')}</div></div>`
    : '';

  let actions: string;
  if (task) {
    const verb = task.kind === 'tenDiscard' ? '捨てる' : `${g.name(task.to!)}に渡す`;
    actions = `<button class="btn primary wide" data-act="give" ${g.selected.size === task.count ? '' : 'disabled'}>${verb}（${g.selected.size}/${task.count}枚）</button>`;
  } else {
    actions = `
      <button class="btn secondary" data-act="pass" ${myTurn && canPass(s, HUMAN) ? '' : 'disabled'}>パス</button>
      <button class="btn primary" data-act="play" ${g.canPlaySelected() ? '' : 'disabled'}>出す</button>`;
  }

  const meStatus = ranks[HUMAN]
    ? `<span class="me-turn done">${RANK_NAMES[ranks[HUMAN] - 1]}</span>`
    : myTurn ? `<span class="me-turn on">あなたの番</span>`
    : s.phase === 'bomber' && s.pendingBomber?.player === HUMAN ? `<span class="me-turn on">数字を選ぶ</span>`
    : task && task.kind !== 'exchange' ? `<span class="me-turn on">カードを選ぶ</span>`
    : s.phase === 'play' && s.passed[HUMAN] ? `<span class="me-turn pass">パス</span>` : '';

  return `
  <main class="screen game-screen ${isReversed(s) ? 'reversed' : ''}">
    <header class="gbar">
      <span class="round">第${s.round}回戦</span>
      <div class="flags">${flagsView(s)}</div>
      <button class="btn ghost small" data-act="quit">やめる</button>
    </header>
    <section class="opps">${opps}</section>
    <section class="table">
      ${center}
      ${flash}
    </section>
    <section class="me ${isTurn(HUMAN) ? 'turn' : ''}">
      <div class="me-info">${avatarSmall(g.seats[HUMAN])}<span class="me-name">あなた</span><span class="me-count">${s.hands[HUMAN].length}枚</span>${meStatus}</div>
      ${handView(g, (myTurn || !!task) && !g.fx)}
      <div class="actions">${actions}</div>
    </section>
    ${s.phase === 'bomber' && s.pendingBomber?.player === HUMAN && !g.fx ? bomberView(g) : ''}
    ${s.phase === 'roundEnd' && !g.fx ? roundEndView(g) : ''}
    ${g.quitConfirm ? quitView() : ''}
    ${g.fx ? fxView(g.fx) : ''}
  </main>`;
}

function bomberView(g: GameController): string {
  const pb = g.s.pendingBomber!;
  const ranks = Array.from({ length: 13 }, (_, i) => i + 3);
  return `
  <div class="modal-back">
    <div class="modal" role="dialog" aria-label="12ボンバー">
      <h3>12ボンバー</h3>
      <div class="rank-grid">
        ${ranks.map((r) => `<button class="rank-btn ${g.bomberPick.has(r) ? 'on' : ''}" aria-pressed="${g.bomberPick.has(r)}" data-act="bomberRank" data-arg="${r}">${RANK_LABEL[r]}</button>`).join('')}
      </div>
      <button class="btn primary wide" data-act="bomberOk" ${g.bomberPick.size === pb.count ? '' : 'disabled'}>決定（${g.bomberPick.size}/${pb.count}）</button>
    </div>
  </div>`;
}

function roundEndView(g: GameController): string {
  const s = g.s;
  const ranks = s.roundRanks[s.roundRanks.length - 1];
  const order = [0, 1, 2, 3].sort((a, b) => ranks[a] - ranks[b]);
  const last = s.round >= 3;
  return `
  <div class="modal-back">
    <div class="modal" role="dialog" aria-label="第${s.round}回戦の結果">
      <h3>結果</h3>
      <table class="result">
        <thead><tr><th>順位</th><th>キャラ</th><th>今回</th><th>合計</th></tr></thead>
        <tbody>
          ${order.map((p) => `<tr class="${p === HUMAN ? 'me-row' : ''}">
            <td>${RANK_NAMES[ranks[p] - 1]}</td>
            <td class="who">${avatarSmall(g.seats[p])}${g.name(p)}</td>
            <td>+${POINTS[ranks[p] - 1]}</td>
            <td>${s.scores[p]}点</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <button class="btn primary wide" data-act="nextRound">${last ? '最終結果へ' : `第${s.round + 1}回戦へ`}</button>
    </div>
  </div>`;
}

function quitView(): string {
  return `
  <div class="modal-back">
    <div class="modal" role="dialog" aria-label="確認">
      <h3>対戦をやめますか？</h3>
      <p>${wb('この対戦の結果は|残りません。')}</p>
      <div class="row2">
        <button class="btn secondary" data-act="quitNo">続ける</button>
        <button class="btn primary" data-act="quitYes">やめる</button>
      </div>
    </div>
  </div>`;
}

function fxView(fx: Fx): string {
  // 絵は下が切れているので画面の下端につける。絵のないキャラは番号の丸を真ん中に出す
  const art = fx.char.images ? 'art' : 'no-art';
  return `
  <div class="fx ${art}" data-act="fxSkip" role="status">
    <span class="fx-hint">タップでとばす</span>
    <div class="fx-box"><span class="fx-text">${fx.text}</span>${avatarBig(fx.char, fx.pose)}</div>
  </div>`;
}

function finalView(s: State, seats: Character[]): string {
  const order = s.finalOrder ?? [0, 1, 2, 3];
  const name = (i: number) => (i === HUMAN ? 'あなた' : seats[i].name);
  const tie = new Set(s.scores).size < s.scores.length;
  return `
  <main class="screen final-screen">
    <header class="bar"><span class="bar-space"></span><h2>最終結果</h2><span class="bar-space"></span></header>
    <div class="scroll">
      <ol class="final-list">
        ${order.map((p, i) => `
          <li class="final-row ${p === HUMAN ? 'me-row' : ''}">
            <span class="final-place">${i + 1}位</span>
            ${avatarSmall(seats[p])}
            <span class="final-name">${name(p)}${p === HUMAN ? `<small>${seats[p].name}</small>` : ''}</span>
            <span class="final-score">${s.scores[p]}点</span>
            <span class="final-rounds">${s.roundRanks.map((r, k) => `<span>${k + 1}回戦 ${RANK_NAMES[r[p] - 1]}</span>`).join(' ／ ')}</span>
          </li>`).join('')}
      </ol>
      ${tie ? `<p class="note">${wb('同点のときは、|3回戦目の順位が|上の人が上です。')}</p>` : ''}
    </div>
    <footer class="foot row2">
      <button class="btn secondary" data-act="toTitle">タイトルへ</button>
      <button class="btn primary" data-act="again">もう一度あそぶ</button>
    </footer>
  </main>`;
}
