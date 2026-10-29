"""目視確認後、実在する画像に対応した検査・引き継ぎを保存する。"""
from pathlib import Path
import json, hashlib, zipfile

run = Path(__file__).resolve().parent
root = run.parents[2]
review = root/'確認用'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
report = json.loads((run/'verification.json').read_text(encoding='utf-8'))
guard = json.loads((run/'protected-before.json').read_text(encoding='utf-8-sig'))
assert len(guard)==54 and all(sha(root/p)==h for p,h in guard.items())
source = Path('C:/github/anima-prompt/output/2026-10-26T05-50-36-289Z_c062e9e0-2423-4c8c-bc29-474c64dc8799.png')
assert sha(source)==sha(root/'参考イラスト/キャラ3/01.png')
assert report['saved_assets']==6 and all(sha(root/r['file'])==r['sha256'] for r in report['assets'])
with zipfile.ZipFile(root/report['zip']) as z:
    assert z.testzip() is None
    assert set(z.namelist())=={r['name']+'.png' for r in report['assets']}
    assert all(hashlib.sha256(z.read(r['name']+'.png')).hexdigest()==r['sha256'] for r in report['assets'])

visual = {'status':'ai_visual_checks_passed_pending_human_acceptance','required_issues':0,
    'asset_sha256':{r['name']:r['sha256'] for r in report['assets']},
    'inspected':['per-image light-dark composites','キャラ3一覧.png','キャラ3_暗背景一覧.png',
        'キャラ3_順位256確認.png','キャラ3_基準比較.png','キャラ3_手の確認.png','キャラ1〜3_ポーズ比較.png'],
    'checks':{'hair_head_hands_elbows_inside':'pass','black_hair_blue_eyes_identity':'pass',
        'black_suit_white_shirt_black_tie_belt':'pass','small_lapel_bar_no_new_accessories':'pass',
        'visible_hand_anatomy_and_arm_connections':'pass','narcissistic_personality':'pass',
        'rank4_dejection_no_anger_or_fists':'pass','style_consistency':'pass',
        'light_dark_edges':'pass','expressions_at_256px':'pass','different_poses_from_chara1_and_chara2':'pass'},
    'pose_comparison':{'special':'raised index finger and wink, rather than extended open palm',
        'rank1':'both hands on hips and laughing rather than raised fists or clasped hands',
        'rank2':'adjusting tie, rather than peace sign or cheek touch',
        'rank3':'classic folded arms across chest, rather than hand behind head or low sleeve pinching',
        'rank4':'palm on front forehead and other open hand by waist, rather than hands in front or sleeve self-hug'},
    'limitations':['User visual acceptance pending.',
        'Different male physique is preserved; head size and shoulder locations are not numerically identical across poses.',
        'Hands inside pocket or behind crossed sleeve are naturally occluded; unseen fingers cannot be individually counted.',
        'The front forehead touch differs from chara1 back-of-head touch by contact and context.',
        'icon face portrait purpose is shared across characters; expression is intentionally more self-satisfied.'],
    'human_acceptance':False,'game_integration':False}
(review/'キャラ3_目視検査.json').write_text(json.dumps(visual,ensure_ascii=False,indent=2),encoding='utf-8')
report.update(status='six_saved_ai_checks_passed_pending_human_acceptance',
    visual_report='確認用/キャラ3_目視検査.json',
    pose_comparison='確認用/キャラ1〜3_ポーズ比較.png',reference_original_sha256=sha(source))
for r in report['assets']:
    r['export']['visual_review']='ai_passed_pending_human_acceptance'
    (run/f'{r["name"]}-numeric.json').write_text(json.dumps(r['export'],ensure_ascii=False,indent=2),encoding='utf-8')
for p in [review/'キャラ3_数値検査.json',run/'verification.json']:
    p.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
log_path = run/'generation-log.json'
log = json.loads(log_path.read_text(encoding='utf-8'))
assert len(log['calls'])==8 and sum(c['status']=='quality_rejected' for c in log['calls'])==2
for call in log['calls']:
    if call['status']=='saved_pending_human_acceptance':
        call['status']='saved_ai_checks_passed_pending_human_acceptance'
log.update(status=report['status'],savedAssets=[r['name'] for r in report['assets']],
    missingAssets=[],generationCalls=8,outputImages=8,qualityRetries=2,moderationFailures=0,
    humanAcceptance=False,gameIntegration=False,
    originalReference=str(source),referenceSha256=sha(source),
    notionSources=['https://app.notion.com/p/4063ea603c5381dd81d2cd5b1abe2171',
        'https://app.notion.com/p/3ef3ea603c538197b169e28b31440bf0',
        'https://app.notion.com/p/3fa3ea603c5381c08e7ac9e0b2de45f8'])
log_path.write_text(json.dumps(log,ensure_ascii=False,indent=2),encoding='utf-8')
(run/'COMPLETE.json').write_text(json.dumps({'status':report['status'],
    'assets':visual['asset_sha256'],'protected_files_unchanged':54,'zip_sha256':report['zip_sha256'],
    'human_acceptance':False,'game_integration':False},ensure_ascii=False,indent=2),encoding='utf-8')

qa = '''# キャラ3 検査結果（2026-10-28）

状態：6枚の素材制作・AIの検査は完了。人間の見た目の採用、ゲーム組み込みは未実施。

## 基準と性格
- 添付の男性1枚を参考イラスト/キャラ3/01.pngに保存。黒い短めの波のある髪、青い両目、細い顔、色白、自然な男性の体格、黒いスーツ、白いシャツ、黒いネクタイとベルト、参考の小さい襟の金具を共通基準にした。新しい装飾は追加していない。
- ナルシスト感が強いキャラ。顎を上げた得意顔・高笑い・身だしなみを整える仕草で表し、低い順位では気まずさと落胆に切り替えた。
- 前2キャラの一覧と特徴メモを制作前に読み、5つのポーズを分けた。ゲームのCPU設定は変更していない。
- 内蔵image_genで1枚ずつ実行。Notionの立ち絵スキルと必須参照を最新版で取得した。

## 数値による検査
| 画像 | 寸法 | バイト数 | PNG・透明度・500,000以下 |
|---|---|---:|---|
| icon | 256×256 | 73,170 | 合格 |
| special | 1024×1024 | 472,588 | 合格 |
| rank1 | 1024×1024 | 469,252 | 合格 |
| rank2 | 1024×1024 | 465,207 | 合格 |
| rank3 | 1024×1024 | 479,719 | 合格 |
| rank4 | 1024×1024 | 473,494 | 合格 |

- 6枚を保存後に再読込み。透明度0〜255、透明・半透明・不透明画素を確認。市松模様を描いた画像ではない。
- 原画像は全て1254×1254。髪全体を確認後、必要な透明余白を追加して等比縮小。容量調整のRGB丸め幅はicon 1（変更なし）、special 5、rank1 5、rank2 4、rank3 3、rank4 3。縮小後の透明度は容量調整の前後で完全一致。
- iconの可視領域の上端は18px、ほか5枚は72px。体は下端で切るが、髪・手の指先・ひじに画像端での欠損はない。
- キャラ1・2のPNG全12枚、src、tests、設定、参考原本など54ファイルが開始時のSHA-256と一致。添付元の画像と参考コピーも同じ内容。
- ZIPはicon.png、special.png、rank1.png〜rank4.pngの完成候補6枚だけ。破損なし、ZIP内部の全画像も保存先と一致。

## 目で見た検査
| 項目 | 結果 | 確認内容 |
|---|---|---|
| 頭・髪・手・ひじの収まり | 合格 | rank1の頭上余白、rank4の下の手を修正後に再確認 |
| 手の形・腕のつながり | 合格 | 明暗の実寸比較と手の拡大で確認。ポケットの中や腕組みの下に隠れた指は個別には見えない |
| 顔・髪・目・服 | 目視合格 | 元絵と6枚を並べ、黒髪・青い目・黒スーツ・白シャツ・黒ネクタイ・ベルトと襟の小金具を確認 |
| 画風・体格 | 目視合格 | 男性の体格を維持。前2キャラの体格へ寄せていない。各絵の顔の大きさ・肩の位置の厳密な数値一致は未検証 |
| 不要な小物 | 合格 | 新しい眼鏡・時計・指輪・ピアス・鞄・文字・演出記号なし |
| 性格 | 合格 | 得意顔、上を指すウインク、腰に手を当てた高笑い、ネクタイ調整で自分を魅せる仕草 |
| 順位表情の違い | 合格 | 256pxで高笑い／余裕の笑顔／困り眉の苦笑い／額に手を当てた落胆を区別できる |
| 前2キャラとポーズを分ける | 合格 | 下の比較表と3キャラ一覧で確認 |
| 明暗背景での縁 | 合格 | 黒髪・スーツの目立つ白縁、欠け、不要な点なし |
| ゲーム内表示・人間の採用 | 未実施 | 素材の確認段階。今回ゲームに組み込んでいない |

## ポーズの比較
| 用途 | キャラ3 | 前2キャラとの違い |
|---|---|---|
| special | 人差し指を上へ、ウインク | 手のひらを広げる仕草と分けた |
| rank1 | 両手を腰に当て、高笑い | こぶしを上げる／胸元で手を合わせる仕草と分けた |
| rank2 | ネクタイを整え、片手はポケット | ピース／頬に手と分けた |
| rank3 | 胸の前で腕組み、困り眉と横目 | 後頭部に手／腰近くで袖をつまむ仕草と分けた |
| rank4 | 額の前に手、片手は腰の横で開く | 両手を腰前へ／片腕の袖を抱く仕草と分けた。キャラ1の後頭部タッチとも接点が異なる |

iconは顔アップという用途が共通。キャラ3は顎・目線・口元で自信と自己陶酔を表した。

## 修正と実行記録
- 生成8回、画像出力8回、完成候補6枚。品質修正2回：rank1の頭上余白不足、rank4の下端に近すぎる指先。元画像を保存し、構図／下の手だけを修正する指示で各1回実施した。
- 安全判定による停止0回。生成できなかったものを完成品へ混ぜていない。別サービス・APIには切り替えていない。
- 全文の生成指示、参照パス、結果、各回の秒数は生成元/chara3/set-01/generation-log.jsonと各request.json。参照は毎回同じ男性1枚。修正時は保存済みの対象画像を使用。
- 検査は付属Python/Pillowでexport-and-check.pyとbuild-review.pyを実行。目視した後にfinish-records.pyで記録を確定。ゲームテストは実行していない。
- 既存キャラ2の書き出し処理をコピーしてキャラ3専用へ変更。元の処理は変更せず、原画像・既存完成品の上書き防止、上端接触の検出、容量上限、透明度保持、ZIP内容照合を引き継いだ。
- 確認画像はキャラ3一覧.png、キャラ3_暗背景一覧.png、キャラ3_順位256確認.png、キャラ3_基準比較.png、キャラ3_手の確認.png、キャラ1〜3_ポーズ比較.png。詳細数値はキャラ3_数値検査.json、目視記録はキャラ3_目視検査.json。

## 残る確認
- 人間によるナルシストらしさ、表情、見た目の採用判断。画素単位の外見完全一致やゲーム上での見やすさは保証していない。
- 4位はキャラ1の後頭部タッチとは別の額タッチ。比較一覧で仕草の差を見てもらえる状態にした。
'''
(review/'キャラ3_検査結果.md').write_text(qa,encoding='utf-8')

handoff = '''# 引き継ぎ

## 目的
- 添付のスーツ姿の男性をキャラ3として6枚制作する。ナルシスト感を強く出し、前2キャラとポーズを分ける。今回は素材制作まで。

## 決まったこと
- 顔・髪・服・体格は参考イラスト/キャラ3/01.pngを基準にする。黒髪、青い目、黒いスーツ、白いシャツ、黒いネクタイとベルト。参考の襟の小さい金具を維持し、新しい小物は足さない。
- specialは人差し指を上げてウインク。1位は両手を腰に高笑い。2位はネクタイ調整。3位は腕組みの苦笑い。4位は額に手を当てた落胆。怒り顔にはしない。
- iconは256×256、ほか5枚は1024×1024。全6枚が透明PNG、各500,000バイト以下。

## 終わったこと
- キャラ3の6枚を保存し、寸法・容量・透明度、髪・目・服、手、明暗の縁、256pxの表情を確認した。
- 前2キャラとのポーズ比較画像を作り、5つの仕草が重ならないことを目で確認した。
- 生成8回、画像出力8回、品質修正2回。1位の頭上余白と4位の下の手を各1回修正した。修正前の原画像も保存済み。安全判定による停止0回。
- 一覧・比較・検査記録、完成候補PNG6枚だけのZIPを保存した。Notionの最新立ち絵スキルと必須参照を取得した。
- キャラ1・2の画像全12枚、ゲームのコード・設定、参考画像など54ファイルの内容が開始時と同じことを確認した。

## 残っていること
- 人間によるキャラ3の見た目、ナルシストらしさ、ポーズの採用判断。
- キャラ2も前回の制作・AI検査まで完了。人間の採用判断とゲーム組み込みは未実施。キャラ3もゲーム組み込み・ゲーム内表示確認は未実施。
- キャラ4の制作は未着手。

## 注意点
- 素材6枚の制作とAIの検査は完了。人間の採用とは分けて扱う。顔・体格は目で比較し、画素単位の完全一致は保証していない。
- 3位の腕組みや2位のポケットで隠れる指は自然な重なりとして確認。隠れた指を個別に数えた扱いにはしない。
- ゲームのコード・CPU設定、キャラ1・2、参考原本は変更していない。ゲームテスト、組み込み、公開、pushはしていない。
- キャラ2の過去の安全判定と原因不明の記録はset-01および制作前引き継ぎに保持。今回のキャラ3とは混同しない。

## 関係するファイル
- assets/characters/chara3/：icon.png、special.png、rank1.png〜rank4.png
- 確認用/：キャラ3一覧.png、キャラ3_暗背景一覧.png、キャラ3_順位256確認.png、キャラ3_基準比較.png、キャラ3_手の確認.png、キャラ1〜3_ポーズ比較.png、キャラ3_完成候補6枚.zip、キャラ3_検査結果.md、キャラ3_数値検査.json、キャラ3_目視検査.json
- 生成元/chara3/set-01/：元画像、修正前画像、生成指示、時間・結果、保持確認、検査用処理、COMPLETE.json
- 参考イラスト/キャラ3/01.png、特徴メモ/キャラ3.md、イラスト作成_仕様書.md、振り返り_イラスト.md
- 前回までの状態は引き継ぎ_キャラ3制作前_2026-10-28.md。キャラ2の制作記録は生成元/chara2/set-02/。

## 最終更新日
2026-10-28
'''
(root/'引き継ぎ.md').write_text(handoff,encoding='utf-8')
reflection_path = root/'振り返り_イラスト.md'
reflection = reflection_path.read_text(encoding='utf-8')
addition = '''
## キャラ3の制作（最新・2026-10-28）
- ユーザー指定の「ナルシスト感が強い」「前2キャラとポーズをかぶらせない」を最優先に、先に両キャラの特徴メモと完成一覧を読んだ。上を指すウインク・両手を腰に高笑い・ネクタイ調整・胸前の腕組み・額への手で仕草を分け、最後に15枚の比較一覧で確認した。
- 元絵1枚を顔・髪・服・体格・画風の基準にした。黒髪の分け目、青い目、黒いスーツとネクタイ、白いシャツを維持。襟の小さな金具も元絵の要素として扱い、装飾を増やさないよう明記した。
- 読み取りにくかったのは、腕組みで隠れる手と襟の金具。手の拡大と基準との比較で確認し、隠れた指を全て見た扱いにはしなかった。
- 1位は頭上余白がほぼなく、4位は下の手が下端に近すぎた。元画像を残して各1回修正。生成8回・画像出力8回・品質修正2回・安全判定停止0回で、6枚を保存した。余白追加だけで欠損を直したとは扱わない。
- 縦横比と縮小後の透明度を保ち、必要なRGB丸めで容量を調整。全6枚の寸法・透過・500,000バイト以下、明暗の縁、256pxの表情、完成PNGだけのZIPを検査した。
- キャラ1・2やゲームを含む54ファイルを保持確認した。今回は人間から新しい見た目の修正意見はまだなく、採用・ゲーム組み込みは保留。
- 次回の仕様書に足す候補：キャラを追加する前に既存全員のポーズを表にし、完成後は全員を同じ用途の列で比較する。単純な片手上げの有無だけでなく、指の形・接点・体の向きで違いを確認する。

'''
break_at = reflection.index('\n')
reflection_path.write_text(reflection[:break_at+1]+addition+reflection[break_at+1:],encoding='utf-8')
print('Final records saved: 6 PNGs, ZIP verified, 54 protected files unchanged.')
