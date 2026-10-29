// キャラの設定（6章）。番号・名前・性格・表示内容はここだけで決める。
// 見た目を絵に差し替えるときは、ここの表示内容と src/ui/avatar.ts だけを直せばよい。
import chara1Icon from '../assets/characters/chara1/icon_game.png';
import chara1Special from '../assets/characters/chara1/special.png';
import chara1Rank1 from '../assets/characters/chara1/rank1.png';
import chara1Rank2 from '../assets/characters/chara1/rank2.png';
import chara1Rank3 from '../assets/characters/chara1/rank3.png';
import chara1Rank4 from '../assets/characters/chara1/rank4.png';
import chara1Cards from '../assets/characters/chara1/cards.png';
import chara2Icon from '../assets/characters/chara2/icon_game.png';
import chara2Special from '../assets/characters/chara2/special.png';
import chara2Rank1 from '../assets/characters/chara2/rank1.png';
import chara2Rank2 from '../assets/characters/chara2/rank2.png';
import chara2Rank3 from '../assets/characters/chara2/rank3.png';
import chara2Rank4 from '../assets/characters/chara2/rank4.png';
import chara2Cards from '../assets/characters/chara2/cards.png';
import chara3Icon from '../assets/characters/chara3/icon_game.png';
import chara3Special from '../assets/characters/chara3/special.png';
import chara3Rank1 from '../assets/characters/chara3/rank1.png';
import chara3Rank2 from '../assets/characters/chara3/rank2.png';
import chara3Rank3 from '../assets/characters/chara3/rank3.png';
import chara3Rank4 from '../assets/characters/chara3/rank4.png';
import chara3Cards from '../assets/characters/chara3/cards.png';
// 4人目は金髪キャラ（男勝り）。黒髪の案（assets/characters/chara4/）は採用確認前のため使っていない
import chara4Icon from '../assets/characters/blonde-tomboy/icon_game.png';
import chara4Special from '../assets/characters/blonde-tomboy/special.png';
import chara4Rank1 from '../assets/characters/blonde-tomboy/rank1.png';
import chara4Rank2 from '../assets/characters/blonde-tomboy/rank2.png';
import chara4Rank3 from '../assets/characters/blonde-tomboy/rank3.png';
import chara4Rank4 from '../assets/characters/blonde-tomboy/rank4.png';
import chara4Cards from '../assets/characters/blonde-tomboy/cards.png';

export type PersonalityId = 'revolution' | 'keeper' | 'hasty' | 'balanced';

/** キャラの絵（イラスト作成_仕様書.md 2章）。rank は1位〜4位の順 */
export interface CharacterImages {
  icon: string;
  special: string;
  rank: [string, string, string, string];
  /** トランプを持った立ち絵（縦長）。キャラ選択と、対戦の自分の欄に大きく出す */
  cards: string;
  /** 絵の下にある透明な余白（絵の高さに対する割合）。切れ目を画面の下端にそろえるのに使う。順は special・1位〜4位 */
  bottomGap?: [number, number, number, number, number];
}

export interface Character {
  id: number;
  name: string;
  personality: PersonalityId;
  personalityName: string;
  /** 小さい表示（丸の中）に出す文字。絵がないときに使う */
  badge: string;
  /** 丸の色 */
  color: string;
  /** 絵。まだないキャラは番号の文字で表示する */
  images?: CharacterImages;
}

export const CHARACTERS: Character[] = [
  {
    id: 1, name: 'キャラ1', personality: 'revolution', personalityName: '革命好き', badge: '1', color: '#d9534f',
    images: {
      icon: chara1Icon, special: chara1Special, rank: [chara1Rank1, chara1Rank2, chara1Rank3, chara1Rank4], cards: chara1Cards,
      // rank4.png だけ、下の23px（1024px中）が透明
      bottomGap: [0, 0, 0, 0, 23 / 1024],
    },
  },
  {
    id: 2, name: 'キャラ2', personality: 'keeper', personalityName: '温存型', badge: '2', color: '#3a7bd5',
    images: { icon: chara2Icon, special: chara2Special, rank: [chara2Rank1, chara2Rank2, chara2Rank3, chara2Rank4], cards: chara2Cards },
  },
  {
    id: 3, name: 'キャラ3', personality: 'hasty', personalityName: 'せっかち', badge: '3', color: '#e6a019',
    images: { icon: chara3Icon, special: chara3Special, rank: [chara3Rank1, chara3Rank2, chara3Rank3, chara3Rank4], cards: chara3Cards },
  },
  {
    id: 4, name: 'キャラ4', personality: 'balanced', personalityName: 'バランス型', badge: '4', color: '#3c9d5d',
    images: { icon: chara4Icon, special: chara4Special, rank: [chara4Rank1, chara4Rank2, chara4Rank3, chara4Rank4], cards: chara4Cards },
  },
];

export const characterById = (id: number): Character => CHARACTERS.find((c) => c.id === id)!;
