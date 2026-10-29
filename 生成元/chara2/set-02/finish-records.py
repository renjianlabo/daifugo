"""画像を目で確認した後の状態を、検査結果と引き継ぎへ確定する。"""
from pathlib import Path
import json, hashlib, zipfile

run = Path(__file__).resolve().parent
root = run.parents[2]
review = root/'確認用'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
report = json.loads((run/'verification.json').read_text(encoding='utf-8'))
assert report['saved_assets'] == 6 and report['zip_verified']
guard = json.loads((run/'protected-before.json').read_text(encoding='utf-8-sig'))
assert all(sha(root/p)==h for p,h in guard.items())
assert all(sha(root/r['file'])==r['sha256'] for r in report['assets'])
with zipfile.ZipFile(root/report['zip']) as z:
    assert z.testzip() is None
    assert set(z.namelist()) == {r['name']+'.png' for r in report['assets']}
    assert all(hashlib.sha256(z.read(r['name']+'.png')).hexdigest()==r['sha256'] for r in report['assets'])

visual = {'status':'ai_visual_checks_passed_pending_human_acceptance','required_issues':0,
    'asset_sha256':{r['name']:r['sha256'] for r in report['assets']},
    'inspected':['per-image light-dark composites','キャラ2一覧.png','キャラ2_暗背景一覧.png',
        'キャラ2_順位256確認.png','キャラ2_基準比較.png','キャラ2_手の確認.png'],
    'checks':{'full_hair_hands_elbows_inside':'pass','right_eye_covered_left_eye_red':'pass',
        'short_pink_bob':'pass','white_camisole_black_jacket_blue_jeans':'pass',
        'black_buckle_small_D_ring_choker':'pass','no_other_accessories':'pass',
        'hands_anatomy_and_sleeve_contact':'pass','shy_personality_poses':'pass',
        'rank4_downcast_and_no_clenched_fist':'pass','style_consistency':'pass',
        'light_dark_edges':'pass','expressions_at_256px':'pass'},
    'limitations':['AI visual judgment; user acceptance pending.',
        'rank2 vs rank3 mouth difference is subtle at 256px; eyebrows and hand poses also distinguish them.',
        'Body position and proportions are compared visually, not pixel-identical.',
        'icon only shows the face and shoulders; full outfit is checked on the five new images.',
        'Occluded fingers are judged by visible anatomy, not claimed to be all individually visible.'],
    'human_acceptance':False,'game_integration':False}
(review/'キャラ2_目視検査.json').write_text(json.dumps(visual,ensure_ascii=False,indent=2),encoding='utf-8')
report['status'] = 'six_saved_ai_checks_passed_pending_human_acceptance'
report['visual_report'] = '確認用/キャラ2_目視検査.json'
for r in report['assets']:
    if 'export' in r:
        r['export']['visual_review'] = 'ai_passed_pending_human_acceptance'
        (run/f'{r["name"]}-numeric.json').write_text(json.dumps(r['export'],ensure_ascii=False,indent=2),encoding='utf-8')
for path in [run/'verification.json',review/'キャラ2_数値検査.json']:
    path.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
log_path = run/'generation-log.json'
log = json.loads(log_path.read_text(encoding='utf-8'))
assert len(log['calls']) == 8
log.update(status=report['status'],savedAssets=['icon','special','rank1','rank2','rank3','rank4'],
    missingAssets=[],newImages=5,generationCalls=8,outputImages=8,qualityRetries=3,
    moderationFailures=0,historicalModerationFailures=3,historicalModerationCause='unknown',
    cumulativeGenerationCalls=13,cumulativeOutputImages=10,cumulativeQualityRetries=4,
    humanAcceptance=False,gameIntegration=False,conditionsChanged=False,
    framingAndHandCorrections=True,
    notionSources=['https://app.notion.com/p/4063ea603c5381dd81d2cd5b1abe2171',
        'https://app.notion.com/p/3ef3ea603c538197b169e28b31440bf0',
        'https://app.notion.com/p/3fa3ea603c5381c08e7ac9e0b2de45f8'])
for call in log['calls']:
    if call['status']=='saved_pending_visual_acceptance':
        call['status']='saved_ai_checks_passed_pending_human_acceptance'
log_path.write_text(json.dumps(log,ensure_ascii=False,indent=2),encoding='utf-8')
(run/'COMPLETE.json').write_text(json.dumps({'status':report['status'],
    'assets':visual['asset_sha256'],'protected_files_unchanged':len(guard),
    'zip_sha256':report['zip_sha256'],'human_acceptance':False,'game_integration':False},ensure_ascii=False,indent=2),encoding='utf-8')

handoff = '''# 引き継ぎ

## 目的
- キャラ2の残り5枚を制作し、既存iconと合わせた6枚を確認できる状態にする。今回は素材制作まで。

## 決まったこと
- 髪・服・チョーカーは参考イラスト/キャラ2/服装/01.pngで固定。02〜07.pngは表情だけの参考。性格は内気。
- 淡いピンクの短いボブ。本人右目を前髪で隠し、見える左目は赤。白い細い肩ひものキャミソール、肩から落とした黒い革ジャケット、青いジーンズ。
- 黒いチョーカーの留め具と小さいD型リングを維持し、それ以外のアクセサリーは付けない。4位は怒りではなく、しょんぼりした姿。
- iconは256×256、ほか5枚は1024×1024。すべて透過PNG、各500,000バイト以下。

## 終わったこと
- special・rank1〜4の5枚を保存。既存iconを含め6枚がそろい、寸法・容量・透明度・明暗の縁・手・髪と服・256pxでの表情を確認した。
- 今回の生成は8回、画像出力8回。修正はrank3の頭上余白と袖を持つ手、rank4の握りこぶしの計3回。修正前の画像も保存した。
- 今回の安全判定による停止は0回。過去のspecial・rank1・rank2の停止記録は保持し、原因は不明のままとした。
- 一覧・明暗背景・基準との比較・順位256px・手の拡大画像、検査記録、完成候補PNG6枚だけのZIPを作成した。
- 既存icon・キャラ1・ゲームのコードと設定・参考画像など37ファイルが作業前と同じことを確認した。Notionの最新立ち絵スキルと必須参照を取得した。

## 残っていること
- 人間による見た目の確認と採用判断。2位と3位は口元の差が小さく、眉と手の仕草でも区別する。
- ゲームへの組み込み・ゲーム内表示確認は未実施。今回の対象外。キャラ3・4も未着手。

## 注意点
- 素材6枚の制作・AIの検査は完了。人間の採用、ゲーム内での確認は別に行う。画風・体格は目で比較しており、画素単位の完全一致は保証していない。
- 過去の安全判定は出力段階のmoderation_blocked / sexual。具体的な判定箇所は不明。今回生成できた理由も断定しない。別サービスへの切り替えや安全判定を回避する操作はしていない。
- scripts/export-chara2-review.pyはiconだけの古い途中成果用。最新の一覧・検査を上書きするため、そのまま実行しない。
- 既存icon、キャラ1、コード・設定、参考原本は変更していない。ゲームの検査、組み込み、公開、pushはしていない。

## 関係するファイル
- assets/characters/chara2/：icon.png、special.png、rank1.png、rank2.png、rank3.png、rank4.png
- 確認用/：キャラ2一覧.png、キャラ2_暗背景一覧.png、キャラ2_基準比較.png、キャラ2_順位256確認.png、キャラ2_手の確認.png、キャラ2_完成候補6枚.zip、キャラ2_検査結果.md、キャラ2_数値検査.json、キャラ2_目視検査.json
- 生成元/chara2/set-02/：今回の原画像、生成指示、実行記録、修正前の退避、保持確認、検査用処理、COMPLETE.json。set-01/は過去の画像・停止記録として保持。
- 引き継ぎプロンプト_キャラ2_残り5枚.md、イラスト作成_仕様書.md、特徴メモ/キャラ2.md、振り返り_イラスト.md、参考イラスト/キャラ2/
- 以前のゲームの進捗は引き継ぎ_キャラ2制作前_2026-10-28.md。今回開始前の引き継ぎは生成元/chara2/set-02/引き継ぎ_開始前.md。

## 最終更新日
2026-10-28
'''
(root/'引き継ぎ.md').write_text(handoff,encoding='utf-8')

qa = '''# キャラ2 検査結果（2026-10-28・set-02）

状態：6枚の制作とAIの検査は完了。人間の見た目の採用、ゲームへの組み込みは未実施。

## 制作基準
- 髪・服・チョーカーは参考イラスト/キャラ2/服装/01.pngだけを基準。02〜07.pngは表情だけを参考にした。
- 本人右目を隠す淡いピンクの短いボブ、赤い左目、白い細い肩ひものキャミソール、肩から落とした黒い革ジャケット、青いジーンズ。黒い留め具・小さいD型リングのチョーカー以外の小物なし。
- 内気な姿勢を維持。4位はしょんぼり、握りこぶしなし。
- 内蔵image_genを1枚ずつ使用。外見の固定条件は変更していない。Notionの立ち絵スキルと必須参照を最新版で取得した。

## ファイル検査
| 画像 | 寸法 | バイト数 | PNG・透過・500,000以下 |
|---|---|---:|---|
| icon | 256×256 | 88,332 | 合格・既存画像を保持 |
| special | 1024×1024 | 498,485 | 合格 |
| rank1 | 1024×1024 | 493,730 | 合格 |
| rank2 | 1024×1024 | 479,431 | 合格 |
| rank3 | 1024×1024 | 497,663 | 合格 |
| rank4 | 1024×1024 | 475,797 | 合格 |

- 全6枚を保存後に再読込み。実際の透明度0〜255と、透明・半透明・不透明画素を確認した。
- 新規原画像は1254×1254。頭頂が描けていることを確認後、必要な透明余白を追加し、縦横比を保って1024へ縮小。RGBの丸め幅はspecial 6、rank1 8、rank2 8、rank3 5、rank4 6。縮小後の透明度は容量調整前後で完全一致。
- 新規5枚の可視領域の上端は72〜73px。左右に余白あり。体は下端で切るが、頭・指先・ひじは入っている。
- 既存icon、キャラ1全6枚、src、tests、ゲーム設定、参考画像など37ファイルのSHA-256が開始時と一致。
- ZIPはicon.png、special.png、rank1.png〜rank4.pngだけ。ZIPの破損検査と、展開内容が完成候補6枚と同じことを確認した。

## 目で見た検査
| 項目 | 結果 | 確認内容 |
|---|---|---|
| 頭・手・ひじの収まり | 合格 | 全5枚で髪全体と指先が入る |
| 前髪と目の左右・色 | 合格 | 本人右目が隠れ、開眼する左目は赤。rank1は閉眼 |
| 髪・衣装・チョーカー | 合格 | 基準と並べ、短いボブ、白キャミソール、黒革ジャケット、ジーンズ、留め具と小リングを確認 |
| 不要なアクセサリー | 合格 | ピアス・ネックレス・指輪・髪飾りなどの混入なし |
| 手と腕、布の重なり | 合格 | 拡大画像で確認。rank3は袖口付近の布を持つ手へ修正。rank4の腰近くの手は開いた形 |
| 内気な性格・指定ポーズ | 合格 | 控えめな仕草。rank4は落胆の顔で、怒り顔なし |
| 画風・体格 | 目視合格 | 既存iconと基準を含め比較。細い線、髪の色、塗り、自然な体格。厳密な形状・位置の数値一致は未検証 |
| 明暗背景での縁 | 合格 | 目立つ白縁、輪郭の欠け、孤立した不要な点なし |
| 256pxでの順位表情 | 合格 | 閉眼の大喜び、穏やかな笑顔、困り眉の苦笑い、下向きの落胆。2位・3位の口元差は小さめで、眉と仕草でも区別 |
| ゲーム内表示 | 未実施 | 今回の対象外 |
| 人間の採用 | 未実施 | 完成候補として見た目の確認待ち |

## 生成・修正・過去の停止
- 今回8回呼び出し、8枚出力、新規完成候補5枚。品質修正3回：rank3の頭頂切れ、rank4の握りこぶし、rank3の袖を持つ接点。修正前の原画像・完成候補・ZIPはset-02内へ退避した。
- 今回の安全判定による停止0回。過去のspecial・rank1・rank2のmoderation_blocked / sexualはset-01内に保持。判定箇所は不明で、衣装が原因とも今回の成功理由とも断定しない。安全判定を回避する操作や別サービスへの切り替えは実施していない。
- 過去分を含む累計は呼び出し13回、画像出力10回、安全判定の停止3回、品質修正4回。完成候補は6枚。
- 全文の生成指示・参照パス・時間・結果はset-02/generation-log.jsonと各request.json。画像編集後に指定外の画素が完全一致するという保証はしていない。

## 実施方法・記録
- Pythonの既存環境にはPillowがなかったため、追加インストールせず、アプリ付属のPython/Pillowを使用した。
- 実行：生成元/chara2/set-02/export-and-check.py（1枚ごとの書き出し）、build-review.py（6枚とZIPの検査）、finish-records.py（目視確認後の記録）。ゲームのコード・設定は変更せず、ゲームテストも実行していない。
- 確認画像：キャラ2一覧.png、キャラ2_暗背景一覧.png、キャラ2_基準比較.png、キャラ2_順位256確認.png、キャラ2_手の確認.png。各画像の実寸明暗比較はset-02/*-light-dark.png。
- 自動検査の詳細はキャラ2_数値検査.json、目視記録はキャラ2_目視検査.json。現在の画像の内容識別値と一致させて記録した。
- 再発防止：元画像の上端接触は書き出し前に停止。既存iconを作り直す旧スクリプトは再利用せず、存在する完成候補を上書きしない書き出しを用いた。ZIPは内容照合を必須とし、失敗画像を混ぜない。安全判定の原因そのものは未解決で、生成の成功を保証する対策はない。
'''
(review/'キャラ2_検査結果.md').write_text(qa,encoding='utf-8')

reflection_path = root/'振り返り_イラスト.md'
reflection = reflection_path.read_text(encoding='utf-8')
reflection = reflection.replace('# イラスト制作の振り返り（途中／2026-10-28）', '# イラスト制作の振り返り（2026-10-28）',1)
reflection = reflection.replace('## キャラ2の制作（最新・中断）','## キャラ2の初回制作（過去の中断記録）',1)
addition = '''
## キャラ2・残り5枚の制作（最新・set-02）
- 髪・服・チョーカーを参考1枚目だけ、ほかを表情だけに分け、内気な性格と指定ポーズを維持して5枚を制作した。既存iconは再生成せず、6枚を一覧とZIPにまとめた。人間の見た目の採用とゲーム組み込みはまだ行っていない。
- 基準画像と表情参考には別の服・小物があるため、役割を毎回明記した。今回の完成候補に、チョーカー以外のアクセサリーは見当たらない。体格・画風は並べて目で比較し、完全な形状一致とは扱わない。
- 読み取りにくかったのは袖を持つ指と布の接点。全体だけでは気づきにくく、手の拡大確認でrank3の修正が必要になった。rank3の頭頂切れとrank4の握りこぶしも修正し、計8回の出力、品質修正3回。修正前の画像を保持した。
- 頭上余白の指示だけでは出力に反映しきれない場合がある。頭頂が描けているかを先に確認し、完全な輪郭のある絵には透明余白と等比縮小を使った。頭頂の欠損を余白だけで直した扱いにはしない。
- PNGの容量は縮小後の透明度を変えず、RGBの小さい丸めで調整。全6枚が500,000バイト以下。明暗の縁、256pxの表情、ZIP内部の画像も確認した。2位と3位の口元差は小さめで、眉と手の仕草も見比べる。
- 今回の安全判定による停止は0回。過去3回の停止履歴を残し、その原因や今回成功した理由は断定しない。別サービスや判定回避の方法は使っていない。
- 今回、人間から新たな見た目の修正意見は受けていない。採用判断は一覧を見てもらってから行う。
- 次回の仕様書に足す候補：手の拡大で布との接点も確認する、頭頂が描けていない画像は余白追加だけで合格にしない、古い途中成果用の書き出し処理で完成後の検査を上書きしない。

'''
first_break = reflection.index('\n')
reflection = reflection[:first_break+1]+addition+reflection[first_break+1:]
reflection_path.write_text(reflection,encoding='utf-8')
print('Final records saved. Six PNGs and ZIP verified. Protected files unchanged:',len(guard))
