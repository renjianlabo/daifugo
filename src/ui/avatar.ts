// キャラの見た目（6章）。絵があるキャラは絵、ないキャラは番号の文字で表示する。
import { Character } from '../characters';

/** 演出の場面：決めポーズ（革命・ジョーカー）か、上がった順位 */
export type FxPose = 'special' | 1 | 2 | 3 | 4;

/** 小さい表示：丸の中にアイコン（絵がなければキャラ番号） */
export function avatarSmall(c: Character, extraClass = ''): string {
  const inner = c.images ? `<img src="${c.images.icon}" alt="" draggable="false">` : c.badge;
  return `<span class="avatar ${c.images ? 'has-img' : ''} ${extraClass}" style="--avatar:${c.color}" aria-label="${c.name}">${inner}</span>`;
}

/**
 * 決めポーズ・順位の絵。絵がないキャラは空文字。
 * 絵は下が切れているので、置く側で画面の下端にぴったりつける。絵の下の透明な余白の分だけ下にずらす
 */
export function artImg(c: Character, pose: FxPose, cls: string): string {
  if (!c.images) return '';
  const i = pose === 'special' ? 0 : pose;
  const src = i === 0 ? c.images.special : c.images.rank[i - 1];
  const gap = c.images.bottomGap?.[i] ?? 0;
  return `<img class="${cls}" src="${src}" alt="${c.name}" draggable="false" data-gap="${gap}" style="translate: 0 ${(gap * 100).toFixed(3)}%">`;
}

/** 演出：画面中央に大きく決めポーズ・順位の絵（絵がなければキャラ番号） */
export function avatarBig(c: Character, pose: FxPose): string {
  if (!c.images) return `<span class="avatar avatar-big" style="--avatar:${c.color}" aria-label="${c.name}">${c.badge}</span>`;
  return artImg(c, pose, 'fx-art');
}

/** 演出の絵を先に読み込んでおく（演出が出たときに絵が遅れて出ないように） */
export function preloadArt(chars: Character[]): void {
  for (const c of chars) {
    if (!c.images) continue;
    for (const src of [c.images.icon, c.images.special, ...c.images.rank]) new Image().src = src;
  }
}
