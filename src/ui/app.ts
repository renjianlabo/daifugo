// 画面（5章）。タイトル → 設定 → キャラ選択 → 対戦（3回戦） → 最終結果
import { CHARACTERS, Character, characterById } from '../characters';
import { JOKER, RANK_LABEL, cardId, cardLabel, isJoker, rankOf, suitOf } from '../engine/cards';
import { interpret } from '../engine/plays';
import {
  GameEvent, POINTS, RANK_NAMES, RULE_NAMES, Rules, State, canPass, chooseBomber, chooseCards, currentRanks, findPlays, giveExchange,
  isActive, isReversed, listMoves, lockKind, newGame, nextRound, pass, play, playableCards, topEntry,
} from '../engine/game';
import { CpuOptions, LEVEL_NAMES, Level, PERSONALITY_WEIGHTS, STRONG_TIME_MS, cpuAct } from '../cpu/cpu';
import { bigArt, layoutArts } from './art';
import { FxPose, artImg, avatarSmall, preloadArt } from './avatar';
import { Settings, defaultSettings, loadSettings, saveSettings } from './storage';

type Screen = 'title' | 'settings' | 'select' | 'game' | 'final';

const HUMAN = 0;
/** 絵を出す演出（革命・ジョーカー・順位）の長さ */
const FX_MS = 1200;
/** 出したカードがその場で流れるとき（8切り・5スキップで全員とばし・上がって回が終わる）、場に見せておく長さ */
const TABLE_MS = 800;
/** 帯だけの演出（8切りなど）の長さ */
const BAND_MS = 1000;
/** 回戦の始めの帯（「第1回戦」）の長さ。左から入って、止まって、右へ抜ける */
const ROUND_MS = 1500;
/** カードを配る演出の全体の長さ（1枚ずつ DEAL_FLY_MS かけて飛び、最後の1枚が届いたあと少し待つ） */
const DEAL_MS = 2600;
const DEAL_FLY_MS = 350;
const DEAL_CARDS = 53;
/** 12ボンバーで捨てられるカードを見せる長さ（表に出てから消えるまで） */
const BOMBER_MS = 2000;
/** 出せる手がないとき、自動でパスするまでの間（パスしたことが分かるように少し待つ） */
const AUTO_PASS_MS = 700;
/** 出来事のカードを一瞬見せて、捨てる・渡す動きをする時間 */
const FLASH_MS = 1300;
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
/**
 * 設定は3つのタブに分ける（スクロールなしで全部見えるようにするため。2026-10-30 ユーザー指示）。
 * 数字のカードのルールは数字の小さい順。そのあとに数字に関係しないルール
 */
type SettingsTab = 'cards' | 'special' | 'other';
const SETTINGS_TABS: { id: SettingsTab; name: string; rules: (keyof Rules)[] }[] = [
  { id: 'cards', name: 'カード', rules: ['fiveSkip', 'sevenPass', 'eightCut', 'tenDiscard', 'elevenBack', 'twelveBomber'] },
  { id: 'special', name: '革命・しばり', rules: ['revolution', 'markLock', 'numLock', 'gekiLock'] },
  { id: 'other', name: 'そのほか', rules: ['exchange', 'miyakoOchi'] },
];

/** 「|」を折り返し位置に変える */
const wb = (t: string) => t.split('|').map((x) => esc(x)).join('<wbr>');
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

// ---------------- 対戦の進行役 ----------------

/** 帯の種類（色を決める） */
type BandKind = 'round' | 'revolution' | 'joker' | 'eight' | 'five' | 'eleven' | 'bomber' | 'ten' | 'seven' | 'mark' | 'num' | 'geki'
  | 'rank1' | 'rank2' | 'rank3' | 'rank4';

/**
 * 演出：帯に効果の名前。pose があるときはキャラの絵の上に帯を重ねる。ないときは帯だけで、帯に発動したキャラのアイコンを出す。
 * char が null（回戦の始め）はアイコンなし。start は帯を出した時刻（描き直しても動きが途中から続くように）。hold は検査用（動きを止めて撮る）
 */
interface BandFx { kind: 'band'; band: BandKind; name: string; char: Character | null; pose: FxPose | null; start?: number; hold?: boolean }
/**
 * 捨てる・渡すカードを、ゲームを止めて見せる（12ボンバー・自分が関わるカード交換）。タップで先に進める。
 * text は添える短い文（12ボンバーの「2を選択」）。hide は見せ終わるまで手札に出さないカード（受け取ったカード）
 */
interface RevealFx { kind: 'reveal'; cards: number[]; text: string; move: 'discard' | 'give'; to: number | null; ms: number; hide: number[]; start?: number }
/**
 * 出したカードを場に見せて待つ（演出の幕は出さない）。そのあとの帯が終わるまで、出したカードを場に残す（GameController.ghost）。
 * unghost は、残しておいたカードを消す印（待たない）
 */
interface TableFx { kind: 'table'; ms: number; start?: number }
interface UnghostFx { kind: 'unghost'; start?: number }
/** 山札から全員へ1枚ずつ配る。first は最初に配られる人（53枚なので14枚になる人）。とばせない。hold は検査用（途中で止めて撮る） */
interface DealFx { kind: 'deal'; first: number; ms: number; start?: number; hold?: boolean }
type Fx = BandFx | RevealFx | TableFx | UnghostFx | DealFx;

/**
 * 出来事のカードを一瞬見せる。move は、そのあとの動き：
 * discard＝捨てられる（12ボンバー・10捨て）、give＝表のまま受け取る人へ（7渡しで自分が渡す・受け取る）、
 * pass＝裏向きのまま渡す人から受け取る人へ（CPUどうしの7渡し）、none＝消えるだけ（カード交換）
 */
interface Flash { cards: number[]; start: number; move: 'discard' | 'give' | 'pass' | 'none'; from: number | null; to: number | null; ms?: number }

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
  /**
   * ルール処理ではもう流れたが、画面の場にはまだ残しておくカード（出したカードを必ず一度は場に見せるため）。
   * 8切りの順番：①場に出したカードを見せる（TABLE_MS）→ ②8切りの帯 → ③場を流す（unghost）
   */
  ghost: number[] | null = null;
  /** 回戦の始めの帯が出てから配り終わるまで。手札を隠し、CPUの枚数を0から数える */
  dealing = false;
  thinking: number | null = null;
  quitConfirm = false;
  /**
   * 早送り（自分が上がったあとに押せる）。オンの間は帯・絵の演出を飛ばし（順位のカットインだけ通常どおり）、CPUの待ち時間とカードの動きを2倍速にする。
   * 回戦が終わったら自動でオフに戻す
   */
  ffwd = false;
  /** 選択の小窓（12ボンバーの数字）を閉じて、盤面を見ている途中。見るだけで操作はできない。選んだ内容はそのまま残す */
  peek = false;
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
    this.playInBatch = false;
    this.eightInBatch = false;
    const shown: Omit<Flash, 'start'>[] = [];
    const queued = this.fxQueue.length;
    for (; this.eventIdx < s.events.length; this.eventIdx++) {
      const f = this.describe(s.events[this.eventIdx]);
      if (f) shown.push(f);
    }
    // ジョーカーで革命したときは、絵の演出を1回にする（革命を出す）
    const added = this.fxQueue.slice(queued);
    const rev = added.find((f): f is BandFx => f.kind === 'band' && f.band === 'revolution');
    if (rev) this.fxQueue = [...this.fxQueue.slice(0, queued), ...added.filter((f) => !(f.kind === 'band' && f.band === 'joker' && f.char === rev.char))];
    if (!shown.length) return;
    // 1回に2つ以上（カード交換）のときは、まとめて見せて消すだけにする
    this.showFlash(shown.length === 1 ? shown[0] : { cards: shown.flatMap((f) => f.cards), move: 'none', from: null, to: null });
  }

  private showFlash(f: Omit<Flash, 'start'>) {
    const ms = FLASH_MS / this.speed;
    const flash = { ...f, start: performance.now(), ms };
    this.flash = flash;
    this.later(() => {
      if (this.flash !== flash) return;
      this.flash = null;
      this.onChange();
    }, this.fast ? 30 : ms);
  }

  /** 最後に出したカード（場に残しておくときに使う） */
  private lastPlay: number[] | null = null;
  /** 今回まとめて受け取った出来事の中に、カードを出したことがあるか。あれば、そのときの演出の列の位置 */
  private playInBatch = false;
  private playMark = 0;
  private eightInBatch = false;

  /**
   * 場が流れた（または回が終わった）とき、出したカードをまだ画面に見せていなければ、場に残しておく。
   * 同じ処理の中で出したカードなら、帯より先に TABLE_MS だけ場に見せる。8切りは、前に見せていても帯が終わるまで残す
   */
  private keepOnTable() {
    if (this.ghost || !this.lastPlay || !(this.playInBatch || this.eightInBatch)) return;
    if (this.playInBatch) this.fxQueue.splice(this.playMark, 0, { kind: 'table', ms: TABLE_MS });
    this.ghost = this.lastPlay;
    this.fxQueue.push({ kind: 'unghost' });
  }

  /** 最後にカードを出した人（5スキップの帯に出す人） */
  private actor = 0;
  /** 今のカードの5スキップの帯を出したか（とばされる人ごとに知らせが来るので、帯は1回だけ） */
  private skipShown = false;

  private band(band: BandKind, player: number, pose: FxPose | null = null, name = BAND_NAMES[band]) {
    this.fxQueue.push({ kind: 'band', band, name, char: this.seats[player], pose });
  }

  /**
   * 出来事を演出に変える。文字では説明しない。帯は起きた順（＝ルール処理の順：しばり → 12ボンバー → 7渡し → 10捨て → 革命 → 11バック → 8切り → 5スキップ）に積む。
   * 一瞬見せるカードがあれば返す
   */
  private describe(e: GameEvent): Omit<Flash, 'start'> | null {
    switch (e.type) {
      // ①回戦の帯 → ②カードを配る → ③手札を並べる（カード交換はそのあと）
      case 'roundStart':
        this.dealing = true;
        this.fxQueue.push({ kind: 'band', band: 'round', name: `第${e.round}回戦`, char: null, pose: null });
        this.fxQueue.push({ kind: 'deal', first: Math.max(0, this.s.hands.findIndex((h) => h.length === 14)), ms: DEAL_MS });
        break;
      case 'play':
        this.actor = e.player;
        this.skipShown = false;
        this.lastPlay = e.play.cards;
        tableLog.played.push(cardsKey(e.play.cards));
        this.playInBatch = true;
        this.playMark = this.fxQueue.length;
        break;
      case 'flush': case 'roundEnd': this.keepOnTable(); break;
      // カード交換：自分が渡すカードは受け取る人へ、受け取ったカードは手札へ動かして見せる（起きた順。自分が大富豪・富豪なら渡すのが先）
      case 'exchange':
        if (e.from === HUMAN || e.to === HUMAN) this.fxQueue.push({ kind: 'reveal', cards: e.cards, text: '', move: 'give', to: e.to, ms: FLASH_MS, hide: e.to === HUMAN ? e.cards : [] });
        break;
      case 'bomber':
        this.fxQueue.push({ kind: 'reveal', cards: e.removed.flat(), text: `${e.ranks.map((r) => RANK_LABEL[r]).join('と')}を選択`, move: 'discard', to: null, ms: BOMBER_MS, hide: [] });
        break;
      // 自分が関わる7渡しは表のまま、CPUどうしは裏向きのまま動かす
      case 'sevenPass': return { cards: e.cards, move: e.from === HUMAN || e.to === HUMAN ? 'give' : 'pass', from: e.from, to: e.to };
      case 'tenDiscard': return { cards: e.cards, move: 'discard', from: e.player, to: null };
      case 'joker': this.band('joker', e.player, 'special'); break;
      case 'revolution': this.band('revolution', e.player, 'special'); break;
      case 'lock': this.band(e.kind, e.player, null, BAND_NAMES[e.kind] + (e.kind !== 'num' && e.suits ? `<small>${marksOf(e.suits)}</small>` : '')); break;
      case 'effectStart': this.band(({ bomber: 'bomber', sevenPass: 'seven', tenDiscard: 'ten' } as const)[e.kind], e.player); break;
      case 'elevenBack': this.band('eleven', e.player); break;
      case 'eightCut': this.band('eight', e.player); this.eightInBatch = true; break;
      case 'skip': if (!this.skipShown) { this.skipShown = true; this.band('five', this.actor); } break;
      case 'finish': this.band(`rank${e.rank}` as BandKind, e.player, e.rank as FxPose); break;
      // 都落ちした人は、その時点で大貧民（4位）に決まる
      case 'fall': this.band('rank4', e.player, 4); break;
      default: break;
    }
    return null;
  }

  /** 2倍速のときは2。CPUの待ち時間とカードの動きの長さを割る */
  private get speed(): number {
    return this.ffwd ? 2 : 1;
  }

  /** 次に見せる演出を取り出す。早送り中は、順位のカットイン以外の帯を飛ばし、カードを見せる時間を半分にする */
  private nextFx(): Fx | null {
    while (this.fxQueue.length) {
      const fx = this.fxQueue.shift()!;
      // 場に残しておいたカードを消す（帯が終わった）
      if (fx.kind === 'unghost') {
        this.ghost = null;
        continue;
      }
      if (this.ffwd) {
        if (fx.kind === 'band' && !fx.band.startsWith('rank')) continue;
        if (fx.kind === 'reveal' || fx.kind === 'table') fx.ms /= 2;
      }
      return fx;
    }
    return null;
  }

  /** 早送りのオン・オフ。押せるのは自分が上がってから、回戦が終わるまで */
  toggleFfwd() {
    if (isActive(this.s, HUMAN) || this.s.phase === 'roundEnd' || this.s.phase === 'gameEnd') return;
    this.ffwd = !this.ffwd;
    this.onChange();
  }

  /** 状態が変わるたびに呼ぶ。演出・CPUの番・人間の入力待ちを振り分ける */
  advance(): void {
    if (!this.alive) return;
    this.consumeEvents();
    if (this.frozen || this.fx) return this.onChange();
    const fx = this.nextFx();
    if (fx) {
      fx.start = performance.now();
      this.fx = fx;
      this.onChange();
      const ms = fx.kind === 'reveal' || fx.kind === 'table' || fx.kind === 'deal' ? fx.ms : fx.kind === 'unghost' ? 0 : fx.band === 'round' ? ROUND_MS : fx.pose !== null ? FX_MS : BAND_MS;
      this.later(() => { if (this.fx === fx) this.skipFx(); }, this.fast ? 30 : ms);
      return;
    }
    const s = this.s;
    if (s.phase === 'gameEnd') return this.onFinish();
    if (s.phase === 'roundEnd') {
      // 回戦が終わったら早送りをオフに戻す（順位のカットインを見せ終わったあと）
      this.ffwd = false;
      return this.onChange();
    }
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
    const delay = this.fast ? 0 : (500 + Math.random() * 1000) / this.speed;
    const start = Date.now();
    this.later(() => {
      if (this.frozen) return;
      // 早送り中は、つよいCPUの考える時間の上限も半分にする
      const a = cpuAct(this.s, p, this.ffwd ? { ...this.opts[p], timeLimitMs: STRONG_TIME_MS / 2 } : this.opts[p], this.rng);
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
    if (this.fx.kind === 'deal') this.dealing = false;
    this.fx = null;
    this.advance();
  }

  /** 見せ終わるまで手札に出さないカード（カード交換で受け取ったカード） */
  hiddenCards(): Set<number> {
    return new Set([this.fx, ...this.fxQueue].flatMap((f) => (f?.kind === 'reveal' ? f.hide : [])));
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

  /**
   * 自分の番で押せるカード。何も選んでいないときは、出せる出し方のどれかに使えるカード。
   * 選んでいるときは、選んだカードと一緒に出せるカード（同じ数字・階段の続き・ジョーカー）と選んだカード。
   * 一緒に出せるカードがないとき（場が1枚など）は、選ぶ前と同じ（別のカードを押すと選び直しになる）。
   * 自分の番でないときは null（全部押せない。見た目は暗くしない）
   */
  pressableCards(): Set<number> | null {
    const s = this.s;
    if (this.fx || s.phase !== 'play' || s.turn !== HUMAN) return null;
    const sel = [...this.selected];
    const base = playableCards(s, HUMAN).cards;
    if (!sel.length) return base;
    const withSel = playableCards(s, HUMAN, sel).cards;
    return [...withSel].some((c) => !this.selected.has(c)) ? withSel : new Set([...base, ...sel]);
  }

  toggleCard(id: number) {
    if (this.selected.has(id)) this.selected.delete(id);
    else if (this.humanTask()) this.selected.add(id);
    else {
      const ok = this.pressableCards();
      if (!ok || !ok.has(id)) return;
      // 選んだカードと一緒に出せないカード（一緒に出せるカードがないときだけ押せる）は、選び直しにする
      if (!playableCards(this.s, HUMAN, [...this.selected, id]).plays.length) this.selected.clear();
      this.selected.add(id);
    }
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
    this.peek = false;
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
/** 帯に出す名前。効果は設定の名前と同じ、順位は大富豪〜大貧民 */
const BAND_NAMES: Record<BandKind, string> = {
  round: '', revolution: RULE_NAMES.revolution, joker: 'ジョーカー', eight: RULE_NAMES.eightCut, five: RULE_NAMES.fiveSkip, eleven: RULE_NAMES.elevenBack,
  bomber: RULE_NAMES.twelveBomber, ten: RULE_NAMES.tenDiscard, seven: RULE_NAMES.sevenPass, ...LOCK_NAMES,
  rank1: RANK_NAMES[0], rank2: RANK_NAMES[1], rank3: RANK_NAMES[2], rank4: RANK_NAMES[3],
};
/** しばったマーク（例 "HS"）を記号に */
const marksOf = (suits: string) => suits.split('').map((x) => ({ S: '♠', H: '♥', D: '♦', C: '♣' })[x]).join('');
const cardsKey = (cards: number[]) => [...cards].sort((a, b) => a - b).join(',');
/** 検査用：出したカードと、場に描いたことのあるカード（対戦をまたいで数える）。出したのに一度も場に出なかったものを探す */
const tableLog = { played: [] as string[], drawn: new Set<string>() };
const NO_EFFECTS = { bomber: 0, sevenPass: 0, tenDiscard: 0, revolution: false, elevenBack: false, eightCut: false, skip: 0 };

// ---------------- 画面を作る ----------------

export function startApp(root: HTMLElement) {
  let settings: Settings = loadSettings();
  let screen: Screen = 'title';
  let game: GameController | null = null;
  let finalState: { s: State; seats: Character[] } | null = null;
  let pickChar = settings.character;
  let settingsTab: SettingsTab = 'cards';
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
      case 'settingsTab': settingsTab = arg as SettingsTab; render(); break;
      case 'toSelect': pickChar = settings.character; go('select'); break;
      case 'level': update({ ...settings, level: arg as Level }); break;
      case 'rule': {
        const k = arg as keyof Rules;
        update({ ...settings, rules: { ...settings.rules, [k]: !settings.rules[k] } });
        break;
      }
      case 'resetRules': update({ ...settings, rules: defaultSettings().rules }); break;
      case 'selPrev': selectMove(-1); break;
      case 'selNext': selectMove(1); break;
      case 'start': update({ ...settings, character: pickChar }); startGame(); break;
      case 'again': startGame(); break;
      case 'card': game?.toggleCard(Number(arg)); break;
      case 'play': game?.playSelected(); break;
      case 'pass': game?.passTurn(); break;
      case 'give': game?.giveSelected(); break;
      case 'bomberRank': game?.toggleBomber(Number(arg)); break;
      case 'bomberOk': game?.confirmBomber(); break;
      case 'fxSkip': game?.skipFx(); break;
      case 'peek': if (game) { game.peek = true; render(); } break;
      case 'peekBack': if (game) { game.peek = false; render(); } break;
      case 'nextRound': game?.nextRound(); break;
      case 'ffwd': game?.toggleFfwd(); break;
      case 'quit': if (game) { game.quitConfirm = true; render(); } break;
      case 'quitNo': if (game) { game.quitConfirm = false; render(); } break;
      case 'quitYes': game?.stop(); game = null; go('title'); break;
    }
  });

  // 配ったカードがCPUのアイコンに届いたら、その人の枚数を1つ増やす（画面を描き直さず、数字だけ変える）
  root.addEventListener('animationend', (ev) => {
    if (ev.animationName !== 'deal-cpu') return;
    const seat = (ev.target as HTMLElement).dataset.seat;
    const count = root.querySelector<HTMLElement>(`.opp[data-seat="${seat}"] .opp-count`);
    if (!count) return;
    const n = Number(count.dataset.count) + 1;
    count.dataset.count = String(n);
    count.textContent = `${n}枚`;
  });

  // 検査用（開発サーバーのときだけ）：決まった場面を作る・待ち時間をなくす
  if (import.meta.env.DEV) {
    fastMode = new URLSearchParams(location.search).has('fast');
    (window as unknown as { __daifugo: unknown }).__daifugo = {
      scenario,
      // 場面を作ったあと、止めていた進行を動かす（演出の順番を確かめる検査用）
      unfreeze: () => { if (game) { game.frozen = false; game.advance(); } },
      fxNow: () => game?.fx && (game.fx.kind === 'reveal' ? { kind: 'reveal', to: game.fx.to, cards: game.fx.cards, hide: game.fx.hide } : game.fx.kind === 'band' ? { kind: 'band', band: game.fx.band } : { kind: game.fx.kind }),
      hand: () => game ? [...game.s.hands[0]] : [],
      // 出したのに一度も場に描かれなかったカード（あれば不具合）と、出した回数
      unseenPlays: () => ({ plays: tableLog.played.length, unseen: tableLog.played.filter((k) => !tableLog.drawn.has(k)) }),
      shownHand: () => [...document.querySelectorAll('.hand .card')].map((e) => Number((e as HTMLElement).dataset.arg)),
      legal: () => (game && game.s.phase === 'play' && game.s.turn === HUMAN ? listMoves(game.s, HUMAN).map((p) => p.cards) : []),
      state: () => game && { phase: game.s.phase, turn: game.s.turn, round: game.s.round, fx: !!game.fx, ffwd: game.ffwd, task: game.humanTask(), bomber: game.s.pendingBomber },
    };
  }

  /** 検査用：その席のキャラの絵の演出（決めポーズは革命、1〜4位は大富豪〜大貧民） */
  const cut = (seat: number, pose: FxPose): BandFx => {
    const band: BandKind = pose === 'special' ? 'revolution' : `rank${pose}`;
    return { kind: 'band', band, name: BAND_NAMES[band], char: game!.seats[seat], pose };
  };

  function scenario(name: string, character = 1) {
    settings = { ...loadSettings(), character };
    startGame();
    const g = game!;
    g.frozen = true;
    g.thinking = null;
    // 始めに出た「第1回戦」の帯は消して、場面だけを見せる
    g.fx = null;
    g.fxQueue = [];
    g.ghost = null;
    g.dealing = false;
    const s = g.s;
    const i14 = s.hands.findIndex((h) => h.length === 14);
    [s.hands[0], s.hands[i14]] = [s.hands[i14], s.hands[0]];
    Object.assign(s, { phase: 'play', pendingExchange: [], turn: 0, table: [], lastPlayer: null });
    switch (name) {
      case 'hand':
        g.selected = new Set(s.hands[0].slice(0, 2));
        break;
      case 'dim': {
        // 場に5が1枚。手札の3・4（と5）は出せないので暗い
        const five = s.hands.flat().find((c) => !s.hands[0].includes(c) && !isJoker(c) && rankOf(c) === 5) ?? cardId('S', 5);
        s.hands = s.hands.map((h) => h.filter((c) => c !== five));
        s.table = [{ player: 2, play: interpret([five])[0], effRank: 5, effSuitKey: suitOf(five) }];
        Object.assign(s, { lastPlayer: 2, lockSuit: null, lockNum: false });
        break;
      }
      case 'eight': case 'eightCpu': {
        // 8切りの順番を確かめる：場に♠7（キャラ4）、出す人は♥8と♣3だけを持つ。eightCpu はキャラ2が出す
        const who = name === 'eight' ? 0 : 1;
        const [s7, h8, c3] = [cardId('S', 7), cardId('H', 8), cardId('C', 3)];
        s.hands = s.hands.map((h) => h.filter((c) => c !== s7 && c !== h8 && c !== c3));
        s.discard.push(...s.hands[who]);
        s.hands[who] = [c3, h8];
        s.table = [{ player: 3, play: interpret([s7])[0], effRank: 7, effSuitKey: 'S' }];
        Object.assign(s, { lastPlayer: 3, turn: who, lockSuit: null, lockNum: false });
        break;
      }
      case 'deal':
        // カードを配っている途中（半分くらい配ったところで止めて撮る）
        g.dealing = true;
        g.fx = { kind: 'deal', first: 0, ms: DEAL_MS, start: performance.now() - DEAL_MS / 2, hold: true };
        break;
      case 'ffwd': case 'ffwdOn': case 'ffwdRun': {
        // 自分が1位で上がったあと。ffwdRun は、3人のCPUが8・ジョーカー・Jなどを持って最後まで進む場面
        s.discard.push(...s.hands[0]);
        s.hands[0] = [];
        s.finished = [0];
        s.turn = 1;
        g.ffwd = name === 'ffwdOn';
        if (name === 'ffwdRun') {
          const hands = [['S', 8], ['H', 3], ['D', 9], ['S', 3], ['D', 4], ['H', 11], ['C', 6], ['S', 5], ['C', 10], ['D', 12], ['H', 7]] as const;
          const pick = hands.map(([x, r]) => cardId(x, r));
          s.hands = [[], [pick[0], pick[1], pick[2], pick[9]], [JOKER, pick[3], pick[4], pick[10]], [pick[5], pick[6], pick[7], pick[8]]];
        }
        break;
      }
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
        // 交換を選ぶ場面だけを見せる（回戦の帯と配る演出は出さない）
        g.eventIdx = s.events.length;
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
        g.flash = { cards: gone, start: performance.now() - 400, move: 'discard', from: 2, to: null };
        break;
      }
      case 'peek':
        // 12ボンバーの数字を選んでいる途中で、盤面を見ている
        s.phase = 'bomber';
        s.pendingBomber = { player: 0, count: 2, eff: { ...NO_EFFECTS, bomber: 2 } };
        g.bomberPick = new Set([3]);
        g.peek = true;
        break;
      case 'bomberReveal': {
        // 12ボンバーで捨てられるカードを見せている途中（2を選んだ）
        const gone = s.hands.flatMap((h) => h.filter((c) => !isJoker(c) && rankOf(c) === 15));
        s.hands = s.hands.map((h) => h.filter((c) => !gone.includes(c)));
        g.fx = { kind: 'reveal', cards: gone, text: `${RANK_LABEL[15]}を選択`, move: 'discard', to: null, ms: 2000, hide: [], start: performance.now() - 500 };
        break;
      }
      case 'exchangeReveal':
        // カード交換で、自分（大富豪）が渡したカードを見せている途中
        g.fx = { kind: 'reveal', cards: s.hands[0].slice(0, 2), text: '', move: 'give', to: 1, ms: FLASH_MS, hide: [], start: performance.now() - 300 };
        break;
      case 'fx':
        g.fx = cut(0, 'special');
        break;
      case 'fxRank':
        g.fx = cut(0, 4);
        break;
      case 'fxC4':
        g.fx = { ...cut(3, 'special'), band: 'joker', name: BAND_NAMES.joker };
        break;
      case 'fxC2':
        g.fx = cut(1, 'special');
        break;
      case 'fxC3':
        g.fx = cut(2, 1);
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
        if (m) g.fx = cut(Number(m[1]), (m[2] === 'special' ? 'special' : Number(m[2])) as FxPose);
        // 「band:種類:席」（例 band:eight:2）で、帯だけの演出を出す
        const b = /^band:(\w+):(\d)$/.exec(name);
        if (b) {
          const kind = b[1] as BandKind;
          const label = kind === 'round' ? '第1回戦' : BAND_NAMES[kind] + (kind === 'mark' || kind === 'geki' ? '<small>♥</small>' : '');
          g.fx = { kind: 'band', band: kind, name: label, char: kind === 'round' ? null : g.seats[Number(b[2])], pose: null, ...(kind === 'round' ? { start: performance.now() - 500, hold: true } : {}) };
        }
        // 「move:動き:渡す人:受け取る人」（例 move:pass:1:3）で、一瞬見せるカードが動いている途中を出す
        const mv = /^move:(discard|give|pass):(\d):(\d)$/.exec(name);
        if (mv) {
          const cards = s.hands[Number(mv[2])].slice(0, mv[1] === 'discard' ? 2 : 1);
          g.flash = { cards, start: performance.now() - 450, move: mv[1] as Flash['move'], from: Number(mv[2]), to: Number(mv[3]) };
        }
        break;
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
      g.fx = g.fxQueue.find((f) => f.kind === 'band' && f.char === want && f.pose === Number(rf[2])) ?? null;
      g.fxQueue = [];
      render();
    }
  }

  function render() {
    if (screen === 'title') root.innerHTML = titleView(settings.character);
    else if (screen === 'settings') root.innerHTML = settingsView(settings, settingsTab);
    else if (screen === 'select') root.innerHTML = selectView(pickChar);
    else if (screen === 'game' && game) root.innerHTML = gameView(game);
    else if (screen === 'final' && finalState) root.innerHTML = finalView(finalState.s, finalState.seats);
    else root.innerHTML = titleView(settings.character);
    layoutArts(root);
  }

  // ---- キャラ選択：左右スワイプ・左右のボタンで切り替える。画面を描き直さず、動く部分だけ変える（切り替えの動きを見せるため） ----
  function selectShow() {
    const index = CHARACTERS.findIndex((c) => c.id === pickChar);
    const track = root.querySelector<HTMLElement>('#selTrack');
    if (!track) return;
    track.style.transform = `translateX(${-index * 100}%)`;
    [...track.children].forEach((el, i) => el.setAttribute('aria-hidden', String(i !== index)));
    root.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('on', i === index));
    root.querySelector('#selName')!.textContent = CHARACTERS[index].name;
    root.querySelector<HTMLButtonElement>('.nav.prev')!.disabled = index === 0;
    root.querySelector<HTMLButtonElement>('.nav.next')!.disabled = index === CHARACTERS.length - 1;
  }
  function selectMove(d: number) {
    const index = CHARACTERS.findIndex((c) => c.id === pickChar);
    pickChar = CHARACTERS[Math.max(0, Math.min(CHARACTERS.length - 1, index + d))].id;
    selectShow();
  }
  // 指（マウス）について絵が動き、幅の2割以上（または素早く）動かしたら次のキャラへ。縦の動きでは切り替えない
  let drag: { id: number; x: number; y: number; t: number; dx: number; horizontal: boolean | null } | null = null;
  root.addEventListener('pointerdown', (e) => {
    const stage = (e.target as HTMLElement).closest<HTMLElement>('#selStage');
    if (screen !== 'select' || !stage || (e.target as HTMLElement).closest('button')) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), dx: 0, horizontal: null };
    stage.setPointerCapture(e.pointerId);
  });
  root.addEventListener('pointermove', (e) => {
    const stage = root.querySelector<HTMLElement>('#selStage');
    if (!drag || !stage || e.pointerId !== drag.id) return;
    drag.dx = e.clientX - drag.x;
    if (drag.horizontal === null && Math.hypot(drag.dx, e.clientY - drag.y) > 8) drag.horizontal = Math.abs(drag.dx) > Math.abs(e.clientY - drag.y);
    if (!drag.horizontal) return;
    stage.classList.add('dragging');
    const index = CHARACTERS.findIndex((c) => c.id === pickChar);
    // 端のキャラでは引っぱりを弱くする
    const edge = (index === 0 && drag.dx > 0) || (index === CHARACTERS.length - 1 && drag.dx < 0);
    root.querySelector<HTMLElement>('#selTrack')!.style.transform = `translateX(calc(${-index * 100}% + ${edge ? drag.dx / 3 : drag.dx}px))`;
  });
  const dragEnd = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const stage = root.querySelector<HTMLElement>('#selStage');
    const fast = Math.abs(drag.dx) / (performance.now() - drag.t) > 0.5;
    stage?.classList.remove('dragging');
    if (stage && drag.horizontal && (Math.abs(drag.dx) > stage.clientWidth * 0.2 || (fast && Math.abs(drag.dx) > 30))) selectMove(drag.dx < 0 ? 1 : -1);
    else selectShow();
    drag = null;
  };
  root.addEventListener('pointerup', dragEnd);
  root.addEventListener('pointercancel', dragEnd);
  document.addEventListener('keydown', (e) => {
    if (screen !== 'select') return;
    if (e.key === 'ArrowLeft') selectMove(-1);
    if (e.key === 'ArrowRight') selectMove(1);
  });
  // 画面の大きさが変わったら描き直す（手札の列・段の数と、絵の位置が変わるため）。キャラ選択は動かしている途中を消さないよう絵だけ
  window.addEventListener('resize', () => (screen === 'select' ? layoutArts(root) : render()));

  render();
}

// 角の小さな飾り（枠の4隅）
const CORNERS = '<i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>';

function titleView(pick: number): string {
  // 最後に選んだキャラに絵があればその絵、なければ絵のあるキャラ。絵は下が切れているので画面の下端につける
  const c = [characterById(pick), ...CHARACTERS].find((x) => x.images);
  return `
  <main class="screen title-screen">
    <section class="logo">
      <div class="suits" aria-hidden="true"><span>♠</span><span class="r">♥</span><span class="r">♦</span><span>♣</span></div>
      <h1 class="gold-text">大富豪</h1>
      <p class="lead">CPU 3人と 3回戦。<br>合計ポイントで 1位を めざそう。</p>
    </section>
    <section class="title-stage">${c ? bigArt(c, 'title-art', 'special') : ''}</section>
    <div class="title-start"><button class="btn primary" data-act="toSettings">はじめる</button></div>
  </main>`;
}

/** 見出し：戻るを左、見出しをまん中（戻るがない画面は左を空ける） */
function headerBar(title: string, backAct: string | null): string {
  const back = backAct ? `<button class="btn ghost small" data-act="${backAct}">戻る</button>` : '<span></span>';
  return `<header class="gbar sub">${back}<h1 class="round gold-text">${title}</h1><span></span></header>`;
}

/** ルールが初期設定のままか（そのときは「初期設定に戻す」を押せなくする。ほかのタブのルールだけ変えたときも、押すと押せない見た目に変わって分かる） */
const isDefaultRules = (r: Rules) => (Object.keys(r) as (keyof Rules)[]).every((k) => r[k] === defaultSettings().rules[k]);

function settingsView(st: Settings, tabId: SettingsTab): string {
  const levels: Level[] = ['easy', 'normal', 'strong'];
  const tab = SETTINGS_TABS.find((t) => t.id === tabId)!;
  return `
  <main class="screen settings-screen">
    ${headerBar('設定', 'toTitle')}
    <div class="scroll">
      <div class="tabs" role="tablist" aria-label="設定の種類">
        ${SETTINGS_TABS.map((t) => `<button class="tab ${t.id === tabId ? 'on' : ''}" role="tab" aria-selected="${t.id === tabId}" data-act="settingsTab" data-arg="${t.id}">${t.name}</button>`).join('')}
      </div>
      <section class="panel frame" role="tabpanel">
        ${CORNERS}
        ${tabId === 'other' ? `
        <h2 class="panel-title gold-text">CPUの強さ</h2>
        <div class="seg" role="group" aria-label="CPUの強さ">
          ${levels.map((l) => `<button class="btn ${st.level === l ? 'primary' : 'ghost'}" aria-pressed="${st.level === l}" data-act="level" data-arg="${l}">${LEVEL_NAMES[l]}</button>`).join('')}
        </div>` : ''}
        <ul class="rules">
          ${tab.rules.map((k) => `
            <li class="rule">
              <span class="rule-name">${RULE_NAMES[k]}</span>
              <button class="btn toggle ${st.rules[k] ? 'primary' : 'ghost'}" aria-pressed="${st.rules[k]}" aria-label="${RULE_NAMES[k]}" data-act="rule" data-arg="${k}">${st.rules[k] ? 'オン' : 'オフ'}</button>
              <span class="rule-help">${wb(RULE_HELP[k])}</span>
            </li>`).join('')}
        </ul>
        ${tabId === 'other' ? `<button class="btn ghost wide" data-act="resetRules" ${isDefaultRules(st.rules) ? 'disabled' : ''}>ルールを初期設定に戻す</button>` : ''}
      </section>
    </div>
    <footer class="foot-bar"><button class="btn primary" data-act="toSelect">次へ（キャラ選択）</button></footer>
  </main>`;
}

const ARROW_PREV = '<svg viewBox="0 0 16 24" aria-hidden="true"><path d="M13 2 3 12l10 10" fill="none" stroke="#f0d184" stroke-width="2.4"/></svg>';
const ARROW_NEXT = '<svg viewBox="0 0 16 24" aria-hidden="true"><path d="M3 2l10 10L3 22" fill="none" stroke="#f0d184" stroke-width="2.4"/></svg>';

/** キャラ選択：1人ずつ大きく出し、左右スワイプ（または左右のボタン）で切り替える。決定で対戦を始める */
function selectView(pick: number): string {
  const index = Math.max(0, CHARACTERS.findIndex((c) => c.id === pick));
  return `
  <main class="screen select-screen">
    ${headerBar('キャラ選択', 'toSettings')}
    <section class="sel-top">
      <p class="nameplate"><span class="char-name gold-text" id="selName">${CHARACTERS[index].name}</span></p>
      <p class="note">残りの3人がCPUになります。</p>
    </section>
    <section class="sel-stage" id="selStage" aria-roledescription="カルーセル">
      <div class="track" id="selTrack" style="transform: translateX(${-index * 100}%)">
        ${CHARACTERS.map((c, i) => `<div class="slide" aria-hidden="${i !== index}">${c.images ? bigArt(c, 'char-art', 'cards') : `<span class="avatar avatar-big" style="--avatar:${c.color}; position:absolute; left:50%; top:30%; translate:-50% 0" aria-label="${c.name}">${c.badge}</span>`}</div>`).join('')}
      </div>
      <button class="nav prev" data-act="selPrev" aria-label="前のキャラ" ${index === 0 ? 'disabled' : ''}>${ARROW_PREV}</button>
      <button class="nav next" data-act="selNext" aria-label="次のキャラ" ${index === CHARACTERS.length - 1 ? 'disabled' : ''}>${ARROW_NEXT}</button>
    </section>
    <footer class="sel-foot">
      <div class="dots" aria-hidden="true">${CHARACTERS.map((_, i) => `<i class="dot ${i === index ? 'on' : ''}"></i>`).join('')}</div>
      <button class="btn primary" data-act="start">このキャラに決定</button>
    </footer>
  </main>`;
}

/** カードの裏 */
const CARD_BACK = '<div class="card big back"></div>';

function cardFace(id: number, opts: { act?: boolean; sel?: boolean; disabled?: boolean; dim?: boolean; big?: boolean } = {}): string {
  const joker = isJoker(id);
  const suit = suitOf(id);
  const red = suit === 'H' || suit === 'D';
  const rank = joker ? 'JK' : RANK_LABEL[rankOf(id)];
  const mark = joker ? '★' : { S: '♠', H: '♥', D: '♦', C: '♣' }[suit!];
  const cls = `card ${red ? 'red' : ''} ${joker ? 'joker' : ''} ${opts.sel ? 'sel' : ''} ${opts.dim ? 'dim' : ''} ${opts.big ? 'big' : ''}`;
  const inner = `<span class="c-rank">${rank}</span><span class="c-suit">${mark}</span><span class="c-center">${mark}</span>`;
  if (opts.act) {
    return `<button class="${cls}" data-act="card" data-arg="${id}" aria-label="${cardLabel(id)}" aria-pressed="${!!opts.sel}" ${opts.disabled ? 'disabled' : ''}>${inner}</button>`;
  }
  return `<div class="${cls}" aria-label="${cardLabel(id)}">${inner}</div>`;
}

/**
 * 手札：右の列に並べ、上の段から詰める（空きは下の段に出る）。場所の高さは配られる最大の14枚ぶんで固定するので、
 * 14枚までは「あなたの番」と上の段の位置が枚数で動かない。ふだんは4列×4段、背の低い画面は5列×3段。
 * それより多いとき（交換・7渡しで受け取った）は段を増やし、カードを小さくして画面に収める。背の低い画面で16枚以上は6列
 */
function handView(g: GameController, selectable: boolean): string {
  const hidden = g.hiddenCards();
  const hand = g.s.hands[HUMAN].filter((c) => !hidden.has(c));
  // 配っている間：カードは置いておくが見せない（配るカードが飛んでいく先の位置に使う）
  const dealing = g.dealing ? 'dealing' : '';
  const short = window.matchMedia('(max-height: 760px)').matches;
  const cols = short ? (hand.length > 15 ? 6 : 5) : 4;
  const rows = Math.max(short ? 3 : 4, Math.ceil(hand.length / cols));
  const style = `style="--cols:${cols}; --rows:${rows}"`;
  if (hand.length === 0) return `<div class="hand empty" ${style}><span>手札はありません</span></div>`;
  // 自分の番：出せる組み合わせに使えないカードは暗くして押せなくする。自分の番でないときは、見た目はそのままで押せない
  const ok = g.pressableCards();
  const face = (id: number) => (ok && selectable
    ? cardFace(id, { act: true, sel: g.selected.has(id), disabled: !ok.has(id), dim: !ok.has(id) })
    : cardFace(id, { act: true, sel: g.selected.has(id), disabled: !selectable }));
  return `<div class="hand ${cols === 6 ? 'wide' : ''} ${dealing}" ${style}>${hand.map(face).join('')}</div>`;
}

function flagsView(s: State): string {
  const flags: string[] = [];
  if (s.revolution) flags.push('<span class="flag rev">革命中</span>');
  if (s.elevenBack) flags.push('<span class="flag back">11バック中</span>');
  const lk = lockKind(s);
  if (lk) {
    const marks = s.lockSuit ? ' ' + marksOf(s.lockSuit) : '';
    flags.push(`<span class="flag lock">${LOCK_NAMES[lk]}${lk !== 'num' ? marks : ''}</span>`);
  }
  return flags.join('');
}

function gameView(g: GameController): string {
  const s = g.s;
  const ranks = currentRanks(s);
  const task = g.humanTask();
  const myTurn = s.phase === 'play' && s.turn === HUMAN && !g.fx;
  const isTurn = (i: number) => (s.phase === 'play' && s.turn === i) || (s.phase === 'bomber' && s.pendingBomber?.player === i)
    || ((s.phase === 'sevenPass' || s.phase === 'tenDiscard') && s.pendingCards?.player === i);
  // CPUの状態：上がった人は順位、パスした人は朱色の枠の札（アイコンを暗く）。手番はアイコンを金色に光らせる（文字は出さない）
  const opp = (i: number) => {
    const done = !isActive(s, i) || !!ranks[i];
    const passed = !done && s.phase === 'play' && s.passed[i] && !isTurn(i);
    const status = done ? `<span class="rank-tag">${RANK_NAMES[ranks[i] - 1] ?? ''}</span>` : passed ? '<span class="pass-tag">パス</span>' : '';
    return `
    <div class="opp ${!done && !g.dealing && isTurn(i) ? 'turn' : ''} ${passed ? 'passed' : ''}" data-seat="${i}">
      ${avatarSmall(g.seats[i])}
      <span class="opp-name">${g.seats[i].name}</span>
      <span class="opp-count" data-count="0">${g.dealing ? 0 : s.hands[i].length}枚</span>
      <span class="opp-status">${status}</span>
    </div>`;
  };

  // 場：出したカードだけ（出した人の名前は出さない）
  const top = topEntry(s);
  // ルール処理で流れたあとも、帯が終わるまでは出したカードを残す（g.ghost）
  const shown = top ? top.play.cards : g.ghost;
  if (shown) tableLog.drawn.add(cardsKey(shown));
  const center = shown ? `<div class="table-cards">${shown.map((c) => cardFace(c, { big: true })).join('')}</div>` : '';
  // 一瞬見せるカード：表を見せてから捨てる・渡す動き。CPUどうしの7渡しは裏向きのまま動かす（動く先は art.ts の layoutFlash() が決める）
  const fl = g.flash;
  const flash = fl
    ? `<div class="flash ${fl.move}" style="--delay: -${Math.round(performance.now() - fl.start)}ms; --ms: ${fl.ms ?? FLASH_MS}ms" data-from="${fl.from ?? ''}" data-to="${fl.to ?? ''}" aria-hidden="true"><div class="table-cards">${fl.cards.map((c) => (fl.move === 'pass' ? CARD_BACK : cardFace(c, { big: true }))).join('')}</div></div>`
    : '';

  // 盤面を見ている途中：選択に戻るボタンだけ（見るだけで操作はできない）
  const peeking = g.peek && s.phase === 'bomber' && s.pendingBomber?.player === HUMAN;
  let actions: string;
  if (peeking) {
    actions = '<button class="btn primary give" data-act="peekBack">選択に戻る</button>';
  } else if (task) {
    const verb = task.kind === 'tenDiscard' ? '捨てる' : `${g.name(task.to!)}に渡す`;
    actions = `<button class="btn primary give" data-act="give" ${g.selected.size === task.count ? '' : 'disabled'}>${verb}（${g.selected.size}/${task.count}枚）</button>`;
  } else if (!isActive(s, HUMAN)) {
    // 自分が上がったあとは、パス・出すの代わりに早送り。オンの間は金色で「早送り中」
    actions = `<button class="btn ${g.ffwd ? 'primary' : 'ghost'} give" data-act="ffwd" aria-pressed="${g.ffwd}" ${s.phase === 'roundEnd' || s.phase === 'gameEnd' ? 'disabled' : ''}>${g.ffwd ? '早送り中' : '早送り'}</button>`;
  } else {
    actions = `
      <button class="btn ghost" data-act="pass" ${myTurn && canPass(s, HUMAN) ? '' : 'disabled'}>パス</button>
      <button class="btn primary" data-act="play" ${g.canPlaySelected() ? '' : 'disabled'}>出す</button>`;
  }

  // 手札の上の表示。何も出さないときも場所は残す（手札の位置が動かないように）
  const meStatus = ranks[HUMAN] ? `<span class="rank-tag">${RANK_NAMES[ranks[HUMAN] - 1]}</span>`
    : myTurn ? '<span class="gold-text">あなたの番</span>'
    : s.phase === 'bomber' && s.pendingBomber?.player === HUMAN ? '<span class="gold-text">数字を選ぶ</span>'
    : task && task.kind !== 'exchange' ? '<span class="gold-text">カードを選ぶ</span>'
    : s.phase === 'play' && s.passed[HUMAN] ? '<span class="pass-tag">パス</span>' : '';

  const flags = flagsView(s);
  return `
  <main class="screen game-screen ${isReversed(s) ? 'reversed' : ''}">
    <header class="gbar">
      <h1 class="round gold-text">第${s.round}回戦</h1>
      <button class="btn ghost small" data-act="quit">やめる</button>
    </header>
    <div class="flags">${flags}</div>
    <section class="board frame">
      ${CORNERS}
      <div class="opps">${[1, 2, 3].map(opp).join('')}</div>
      <div class="table">
        ${center}
        ${flash}
      </div>
    </section>
    <section class="lower">
      <div class="me-art-box">${bigArt(g.seats[HUMAN], 'me-art', 'cards')}</div>
      <div class="mine">
        <p class="me-label ${meStatus ? '' : 'off'}">${meStatus || '<span class="gold-text">あなたの番</span>'}</p>
        ${handView(g, (myTurn || !!task) && !g.fx && !peeking)}
      </div>
      <footer class="actions">${actions}</footer>
    </section>
    ${s.phase === 'bomber' && s.pendingBomber?.player === HUMAN && !g.fx && !peeking ? bomberView(g) : ''}
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
    <div class="modal frame" role="dialog" aria-label="12ボンバー">
      ${CORNERS}
      <h2 class="modal-title gold-text">12ボンバー</h2>
      <div class="rank-grid">
        ${ranks.map((r) => `<button class="rank-btn ${g.bomberPick.has(r) ? 'on' : ''}" aria-pressed="${g.bomberPick.has(r)}" data-act="bomberRank" data-arg="${r}">${RANK_LABEL[r]}</button>`).join('')}
      </div>
      <div class="row">
        <button class="btn ghost" data-act="peek">盤面を見る</button>
        <button class="btn primary" data-act="bomberOk" ${g.bomberPick.size === pb.count ? '' : 'disabled'}>決定（${g.bomberPick.size}/${pb.count}）</button>
      </div>
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
    <div class="modal frame" role="dialog" aria-label="第${s.round}回戦の結果">
      ${CORNERS}
      <h2 class="modal-title gold-text">結果</h2>
      <table class="result">
        <thead><tr><th>順位</th><th>キャラ</th><th class="num">今回</th><th class="num">合計</th></tr></thead>
        <tbody>
          ${order.map((p) => `<tr class="${p === HUMAN ? 'me' : ''}">
            <td class="place">${RANK_NAMES[ranks[p] - 1]}</td>
            <td class="who">${avatarSmall(g.seats[p])}${g.name(p)}</td>
            <td class="num">+${POINTS[ranks[p] - 1]}</td>
            <td class="num">${s.scores[p]}点</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <button class="btn primary" data-act="nextRound">${last ? '最終結果へ' : `第${s.round + 1}回戦へ`}</button>
    </div>
  </div>`;
}

function quitView(): string {
  return `
  <div class="modal-back">
    <div class="modal frame" role="dialog" aria-label="対戦をやめる確認">
      ${CORNERS}
      <p>${wb('この対戦の結果は|残りません。')}</p>
      <div class="row">
        <button class="btn ghost" data-act="quitNo">続ける</button>
        <button class="btn primary" data-act="quitYes">やめる</button>
      </div>
    </div>
  </div>`;
}

/** 絵の枠の角の菱の飾り */
const PANEL_CORNERS = '<i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>';

/**
 * 演出：帯に効果の名前。キャラの絵を出す場面（革命・ジョーカー・順位）は、帯の下の枠に絵を出す（帯は頭より上で、絵と重ならない）。
 * 帯だけの場面と、絵のないキャラは、帯に発動したキャラのアイコンを出す
 */
function fxView(fx: Fx): string {
  if (fx.kind === 'reveal') return revealView(fx);
  // 出したカードを場に見せて待つ間は、幕を出さない
  if (fx.kind === 'table' || fx.kind === 'unghost') return '';
  if (fx.kind === 'deal') return dealView(fx);
  const art = fx.pose !== null && fx.char ? artImg(fx.char, fx.pose, 'fx-art') : '';
  const icon = art || !fx.char ? '' : avatarSmall(fx.char);
  // 回戦の始めの帯は、左から入って右へ抜ける（全体の長さ --ms、描き直したときは --delay で途中から）
  const round = fx.band === 'round' ? ` style="--ms: ${ROUND_MS}ms; --delay: -${Math.round(performance.now() - (fx.start ?? performance.now()))}ms"` : '';
  return `
  <div class="fx ${art ? 'cutin' : 'band-only'} ${fx.hold ? 'hold' : ''}" data-act="fxSkip" role="status"${round}>
    <span class="fx-hint">タップでとばす</span>
    <div class="fx-group">
      <div class="fxband ${fx.band} ${icon ? 'has-icon' : ''}">${icon}<span class="fx-name">${fx.name}</span></div>
      ${art ? `<div class="fx-panel"><div class="art-clip">${art}</div>${PANEL_CORNERS}</div>` : ''}
    </div>
  </div>`;
}

/**
 * カードを配る：場のまん中の山札から、最初の人から順に1枚ずつ飛ばす。自分のカードは手札の並ぶ位置へ、CPUのカードはアイコンへ（位置は art.ts の layoutDeal() が決める）。
 * 画面全体を覆って、配っている間は何も押せない。描き直しても動きが続くよう、始まってからの時間を引いた遅れで動かす
 */
function dealView(fx: DealFx): string {
  const elapsed = Math.round(performance.now() - (fx.start ?? performance.now()));
  const step = (fx.ms - DEAL_FLY_MS - 150) / (DEAL_CARDS - 1);
  const slots = [0, 0, 0, 0];
  const cards = Array.from({ length: DEAL_CARDS }, (_, k) => {
    const seat = (fx.first + k) % 4;
    const slot = slots[seat]++;
    return `<div class="deal-card ${seat === HUMAN ? 'me' : 'cpu'}" data-seat="${seat}" data-slot="${slot}" style="--d: ${Math.round(k * step) - elapsed}ms">${CARD_BACK}</div>`;
  }).join('');
  return `
  <div class="fx deal ${fx.hold ? 'hold' : ''}" role="status" aria-label="カードを配っています" style="--ms: ${fx.ms}ms; --fly: ${DEAL_FLY_MS}ms; --delay: -${elapsed}ms">
    <div class="deal-deck">${CARD_BACK}</div>
    ${cards}
  </div>`;
}

/**
 * 捨てる・渡すカードを、場の上で表にして見せる（12ボンバーは「2を選択」の短い文も）。そのあと捨てる（下へ消える）・渡す（受け取る人へ動く）。
 * 画面のどこをタップしても先に進む。場の上に置く位置と動く先は art.ts の layoutFlash() が決める
 */
function revealView(fx: RevealFx): string {
  const elapsed = Math.round(performance.now() - (fx.start ?? performance.now()));
  return `
  <div class="fx reveal" data-act="fxSkip" role="status">
    <span class="fx-hint">タップでとばす</span>
    <div class="reveal-box ${fx.move}" style="--delay: -${elapsed}ms; --ms: ${fx.ms}ms" data-to="${fx.to ?? ''}" aria-hidden="true">
      <div class="table-cards">${fx.cards.map((c) => cardFace(c, { big: true })).join('')}</div>
      ${fx.text ? `<p class="reveal-text">${esc(fx.text)}</p>` : ''}
    </div>
  </div>`;
}

function finalView(s: State, seats: Character[]): string {
  const order = s.finalOrder ?? [0, 1, 2, 3];
  const name = (i: number) => (i === HUMAN ? 'あなた' : seats[i].name);
  const tie = new Set(s.scores).size < s.scores.length;
  return `
  <main class="screen final-screen">
    ${headerBar('最終結果', null)}
    <div class="scroll">
      <ol class="final-list">
        ${order.map((p, i) => `
          <li class="final-row ${i === 0 ? 'first frame' : ''} ${p === HUMAN ? 'me' : ''}">
            ${i === 0 ? CORNERS : ''}
            <span class="final-place ${i === 0 ? 'gold-text' : ''}">${i + 1}位</span>
            ${avatarSmall(seats[p])}
            <span class="final-name">${name(p)}${p === HUMAN ? `<small>${seats[p].name}</small>` : ''}</span>
            <span class="final-score">${s.scores[p]}点</span>
            <span class="final-rounds">${s.roundRanks.map((r, k) => `<span>${k + 1}回戦 ${RANK_NAMES[r[p] - 1]}</span>`).join(' ／ ')}</span>
          </li>`).join('')}
      </ol>
      ${tie ? `<p class="tie">${wb('同点のときは、|3回戦目の順位が|上の人が上です。')}</p>` : ''}
    </div>
    <footer class="foot-bar two">
      <button class="btn ghost" data-act="toTitle">タイトルへ</button>
      <button class="btn primary" data-act="again">もう一度あそぶ</button>
    </footer>
  </main>`;
}
