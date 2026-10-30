// 選び方の決まり（7渡し・10捨て・カード交換・12ボンバーの数字で共通。2026-10-30 ユーザー指示）。
// 画面の表示（暗くする）と押したときの処理の両方から、ここの判定を使う

/**
 * 押したときの選択の変化。選んだものをもう一度押すと解除。
 * 1つしか選べないときは、別のものを押すと選択が切り替わる。2つ以上選べるときは、上限までは足していく
 */
export function togglePick<T>(picked: Set<T>, item: T, limit: number) {
  if (picked.has(item)) picked.delete(item);
  else if (limit === 1) {
    picked.clear();
    picked.add(item);
  } else if (picked.size < limit) picked.add(item);
}

/** 上限まで選んだので押せないもの（暗くする）。1つしか選べないときは切り替えられるので、押せないものはない */
export function pickLocked<T>(picked: Set<T>, item: T, limit: number): boolean {
  return limit > 1 && picked.size >= limit && !picked.has(item);
}

