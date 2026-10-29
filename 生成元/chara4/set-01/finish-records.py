"""実物と照合した検査、3位の指定変更、保持対象の結果を確定記録する。"""
from pathlib import Path
import json,hashlib,zipfile

run=Path(__file__).resolve().parent
root=run.parents[2]
review=root/'確認用'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
report=json.loads((run/'verification.json').read_text(encoding='utf-8'))
guard=json.loads((run/'protected-before.json').read_text(encoding='utf-8-sig'))
assert len(guard)==61 and all(sha(root/p)==h for p,h in guard.items())
source=Path('C:/Users/81805/AppData/Local/Temp/codex-clipboard-a7dc75d9-b4b7-43b9-bc67-4ed7bcd3f367.png')
assert sha(source)==sha(root/'参考イラスト/キャラ4/01.png')
assert report['saved_assets']==6 and all(sha(root/r['file'])==r['sha256'] for r in report['assets'])
with zipfile.ZipFile(root/report['zip']) as z:
    assert z.testzip() is None
    assert set(z.namelist())=={r['name']+'.png' for r in report['assets']}
    assert all(hashlib.sha256(z.read(r['name']+'.png')).hexdigest()==r['sha256'] for r in report['assets'])
guards=json.loads((run/'guard-verification.json').read_text(encoding='utf-8'))
assert len(guards)==2 and all(g['expected_failure_detected'] and g['protected_files_unchanged'] for g in guards)

visual={'status':'ai_visual_checks_passed_pending_human_acceptance','required_issues':0,
    'asset_sha256':{r['name']:r['sha256'] for r in report['assets']},
    'inspected':['per-image light-dark composites','キャラ4一覧.png','キャラ4_暗背景一覧.png',
        'キャラ4_順位256確認.png','キャラ4_基準比較.png','キャラ4_手の確認.png',
        'キャラ1〜4_ポーズ比較.png','キャラ1〜4_3位表情比較.png'],
    'checks':{'no_white_jacket_or_outer_layer':'pass','black_sleeveless_high_neck_top_and_skirt':'pass',
        'black_bob_green_eyes_reference_identity':'pass','reference_earrings_necklace_no_extra_jewelry':'pass',
        'hair_hands_fingertips_elbows_inside':'pass','visible_hand_anatomy_and_support_contact':'pass',
        'calculating_composed_adult_personality':'pass','rank3_neutral_thinking_not_wry_smile':'pass',
        'rank4_dejected_no_anger_or_fists':'pass','light_dark_edges':'pass','style_consistency':'pass',
        'expressions_at_256px':'pass','rank3_distinct_from_previous_three':'pass'},
    'limitations':['User acceptance pending.',
        'Face and body are compared visually; pixel-identical geometry is not claimed.',
        'Fingers obscured by the paired-hand gesture or elbow support cannot all be individually traced.',
        'Skirt full length is outside waist-level framing.',
        'Interpretation: new chara4 rank3 is changed; previous three rank3 images are preserved.'],
    'human_acceptance':False,'game_integration':False}
(review/'キャラ4_目視検査.json').write_text(json.dumps(visual,ensure_ascii=False,indent=2),encoding='utf-8')
report.update(status='six_saved_ai_checks_passed_pending_human_acceptance',
    visual_report='確認用/キャラ4_目視検査.json',rank3_expression='neutral analytical thinking',
    rank3_override='user requested a different expression from prior wry smiles',
    previous_three_characters_unchanged=True,processing_errors=1,processing_error_resolved=True,
    guard_verification=guards,source_edge_review='生成元/chara4/set-01/source-edge-review.json',
    reference_original_sha256=sha(source))
for r in report['assets']:
    r['export']['visual_review']='ai_passed_pending_human_acceptance'
    (run/f'{r["name"]}-numeric.json').write_text(json.dumps(r['export'],ensure_ascii=False,indent=2),encoding='utf-8')
for p in [review/'キャラ4_数値検査.json',run/'verification.json']:
    p.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
log_path=run/'generation-log.json'
log=json.loads(log_path.read_text(encoding='utf-8'))
assert len(log['calls'])==8 and sum(c['status']=='quality_rejected' for c in log['calls'])==2
for call in log['calls']:
    if call['status']=='saved_pending_human_acceptance':
        call['status']='saved_ai_checks_passed_pending_human_acceptance'
log.update(status=report['status'],savedAssets=[r['name'] for r in report['assets']],missingAssets=[],
    generationCalls=8,outputImages=8,qualityRetries=2,moderationFailures=0,
    processingErrors=1,processingErrorResolved=True,humanAcceptance=False,gameIntegration=False,
    originalReference=str(source),referenceSha256=sha(source),
    outfitChange='remove white jacket; black sleeveless high-neck top and black skirt',
    rank3Override='neutral analytical thinking, not prior wry smile',previousThreeUnchanged=True,
    notionSources=['https://app.notion.com/p/4063ea603c5381dd81d2cd5b1abe2171',
        'https://app.notion.com/p/3ef3ea603c538197b169e28b31440bf0',
        'https://app.notion.com/p/3fa3ea603c5381c08e7ac9e0b2de45f8'])
log_path.write_text(json.dumps(log,ensure_ascii=False,indent=2),encoding='utf-8')
(run/'COMPLETE.json').write_text(json.dumps({'status':report['status'],'assets':visual['asset_sha256'],
    'protected_files_unchanged':61,'zip_sha256':report['zip_sha256'],
    'human_acceptance':False,'game_integration':False},ensure_ascii=False,indent=2),encoding='utf-8')

table='\n'.join(f'| {a["name"]} | {a["size"][0]}×{a["size"][1]} | {a["bytes"]:,} | 合格 |' for a in report['assets'])
qa=f'''# キャラ4 検査結果（2026-10-28）

状態：素材6枚の制作・AIの検査は完了。人間の見た目の採用、ゲームへの組み込みは未実施。

## 指定内容と制作基準
- 添付の成人女性を顔・髪・緑の目・体格・画風の基準として、白い羽織を除去。黒無地のノースリーブのハイネックトップスと黒スカートに統一した。金色のピアスと細いチェーンの楕円ペンダントは参考どおり維持し、新しい小物は追加していない。
- 性格は計算高く余裕のある大人の女性。3位はユーザー指定を優先し、定型の苦笑いから、顎に指・反対の手でひじを支える冷静な思考表情に変更した。
- 今回はキャラ4の3位を変える理解で進めた。既存キャラ1〜3の画像は変更していない。ゲームのコード・CPU設定も変更していない。
- 内蔵image_genで1枚ずつ制作。Notionの最新立ち絵スキルと必須参照を取得した。

## 数値による検査
| 画像 | 寸法 | バイト数 | PNG・透明度・500,000以下 |
|---|---|---:|---|
{table}

- 6枚を保存後に再読込み。透明度0〜255、透明・半透明・不透明画素を確認。各画像は実際の透明背景。
- 原画像は全て1254×1254。iconだけは[160,-70,1160,930]で髪全体とペンダントを残して切り出し、等比縮小。ほかは髪全体を確認後に透明余白を追加して1024へ縮小。完成候補の可視領域上端はicon 20px、ほか72px。
- 容量調整はRGBの小さい丸め。幅はicon 1（変更なし）、special 4、rank1 4、rank2 4、rank3 3、rank4 4。縮小後の透明度は容量調整前後で完全一致。原画像の透明度を背景除去などで書き換えていない。
- キャラ1〜3のPNG全18枚、src、tests、設定、参考原本など61ファイルのSHA-256が開始時と一致。添付元と参考コピーの内容も一致した。
- ZIPはicon.png、special.png、rank1.png〜rank4.pngの完成候補6枚だけ。破損なし、ZIP内部の各画像も完成候補と一致。

## 目で見た検査
| 項目 | 結果 | 確認内容 |
|---|---|---|
| ジャケットなし・服装統一 | 合格 | 全6枚の見える範囲に白い羽織・袖なし。黒いハイネックのノースリーブと黒スカート |
| 顔・髪・目・装飾 | 目視合格 | 黒ボブ、緑の目、顔立ち、元のピアスとペンダントを基準比較で確認 |
| 頭・髪・手・ひじの収まり | 合格 | rank2の手とrank3の頭上を修正。rank4の両手も左右の余白内に収まる |
| 手と腕の接点 | 目視合格 | 指先合わせ、口元・胸元・腰の手、顎とひじの実際の支持、上向きの掌を拡大確認。重なりで隠れる指の全輪郭までは個別に数えられない |
| 計算高い大人の女性 | 目視合格 | 確信の笑み、上品な喜び、静かな満足、冷静な思考を分けた |
| 3位を前3人から変える | 合格 | 困り眉やゆがんだ笑いを使わず、口角を上げない真顔寄りの思考。4人の3位の顔を拡大比較した |
| 256pxで順位を区別 | 合格 | 閉眼の喜び／目を開けた満足／顎に指の思考／下向きのため息を区別できる |
| 明暗背景での縁 | 合格 | 明暗の実寸比較で、目立つ白縁・髪の欠け・不要な点なし |
| 画風・体格 | 目視合格 | 参考と6枚を並べて確認。顔や体の画素単位の完全一致は保証していない |
| スカートの全丈 | 未検査 | 頭から腰付近の構図で、裾全体は対象外 |
| 人間の採用・ゲーム内表示 | 未実施 | 素材の採用確認待ち。今回は組み込んでいない |

## 生成・修正・書き出し時の停止
- 生成8回、画像出力8回、完成候補6枚、品質修正2回。rank2初回の下の手が切れ、rank3初回の髪先が上端に触れたため、元画像を保存して各1回修正した。安全判定による停止0回。
- specialの書き出しが、原画像の上端に透明度1/255の薄い縁があるため停止した。上部の比較画像と数値で髪の全輪郭が入ることを確認したうえで、全画素と透明度を保って余白を追加し、再生成せず再開した。
- 再発防止：薄い上端画素の例外には、画像の内容識別値が一致する目視記録を必須とした。上端に16/255を超える画素がある場合は例外を許可しない。異なる原画像の上書きも禁止。同じ原画像からのみ書き出しを再開できる。
- guard-verification.json：上端23/255の旧rank3が例外登録できないこと、異なる原画像が既存rawを上書きできないことの2件を実際の処理で確認。どちらも想定どおり拒否し、確認記録・原画像・完成PNGの内容を保持した。
- 生成指示全文、参照、結果、各回の時間はset-01/generation-log.jsonと各request.json。処理停止と原因はprocessing-error-special.json、輪郭確認はsource-edge-review.json。別サービスやAPIへ切り替えていない。
- 付属Python/Pillowで、export-and-check.py、build-review.py、目視後にfinish-records.pyを実行。ゲームのテストは実行していない。

## 確認用画像と残ること
- キャラ4一覧.png、キャラ4_暗背景一覧.png、キャラ4_順位256確認.png、キャラ4_基準比較.png、キャラ4_手の確認.png、キャラ1〜4_ポーズ比較.png、キャラ1〜4_3位表情比較.png。
- 数値詳細はキャラ4_数値検査.json、目視記録はキャラ4_目視検査.json。全て現在の完成候補の内容識別値に対応。
- 人間による服装・大人らしさ・計算高い雰囲気・新しい3位の採用判断が残る。既存3人の3位の作り直しは今回実施していない。
'''
(review/'キャラ4_検査結果.md').write_text(qa,encoding='utf-8')

handoff='''# 引き継ぎ

## 目的
- 添付の女性をキャラ4として6枚制作する。白いジャケットを外し、黒いノースリーブのハイネックトップスとスカートにする。計算高い大人の女性の雰囲気を出す。

## 決まったこと
- 顔・黒髪ボブ・緑の目・体格・画風は参考イラスト/キャラ4/01.pngを基準とする。参考の金色のピアスと楕円ペンダントは維持し、別の小物は足さない。
- キャラ4の3位は、困った苦笑いから「顎に指を添え、反対の手でひじを支える冷静な思考表情」に変える。既存キャラ1〜3は保持する理解で制作した。
- iconは256×256、ほか5枚は1024×1024。全6枚が透明PNG、各500,000バイト以下。素材制作までで、ゲームには組み込まない。

## 終わったこと
- キャラ4の6枚を保存し、服装・顔・髪・目・手・明暗の縁・256pxの表情と、寸法・容量・透明度を確認した。
- 4人のポーズ比較と3位の顔比較を作成。キャラ4は苦笑いではなく真顔寄りの思考として、前3人と違いを出した。
- 生成8回、画像出力8回、品質修正2回。2位の切れた手と3位の頭上余白を各1回修正した。安全判定による停止0回。修正前画像も保存済み。
- specialの書き出し停止は、ごく薄い上端画素が原因と確認。元画像を削らず透明余白を足して再開した。異なる画像の上書き防止など2件の確認も合格した。
- 完成候補PNG6枚だけのZIP、一覧、比較、検査、生成指示・時間・結果を保存。Notionの最新立ち絵スキルと必須参照を取得した。
- キャラ1〜3の全18画像、ゲームのコード・設定、参考原本など61ファイルが作業前と同じことを確認した。

## 残っていること
- 人間によるキャラ4の服装・雰囲気・新しい3位の見た目の採用判断。
- 既存3人の3位を作り直す作業は実施していない。必要なら別途変更範囲を決める。
- キャラ2〜4のゲームへの組み込みとゲーム内表示確認は未実施。今回は対象外。

## 注意点
- 素材6枚の制作とAIの検査は完了。人間の採用とは分けて扱う。顔・体格は目で比較し、画素単位の完全一致は保証していない。
- スカートの裾全体は今回の腰付近までの構図では確認対象外。手の重なりで隠れる指の全輪郭も個別には見えない。
- キャラ1〜3、ゲームのコード・CPU設定、参考原本は変更していない。ゲームテスト、組み込み、公開、pushはしていない。
- 薄い上端画素の確認例外は、同じ画像の目視記録がある場合だけ。濃い輪郭が上端に触れる画像を、余白追加だけで合格にしない。

## 関係するファイル
- assets/characters/chara4/：icon.png、special.png、rank1.png〜rank4.png
- 確認用/：キャラ4一覧.png、キャラ4_暗背景一覧.png、キャラ4_順位256確認.png、キャラ4_基準比較.png、キャラ4_手の確認.png、キャラ1〜4_ポーズ比較.png、キャラ1〜4_3位表情比較.png、キャラ4_完成候補6枚.zip、キャラ4_検査結果.md、キャラ4_数値検査.json、キャラ4_目視検査.json
- 生成元/chara4/set-01/：元画像、修正前画像、生成指示・結果・時間、保持確認、書き出し停止と原因、輪郭確認、検査用処理、COMPLETE.json
- 参考イラスト/キャラ4/01.png、特徴メモ/キャラ4.md、振り返り_イラスト.md、イラスト作成_仕様書.md
- 開始前の状態は引き継ぎ_キャラ4制作前_2026-10-28.md。以前の制作記録は生成元/chara1〜3/。

## 最終更新日
2026-10-28
'''
(root/'引き継ぎ.md').write_text(handoff,encoding='utf-8')
reflection_path=root/'振り返り_イラスト.md'
reflection=reflection_path.read_text(encoding='utf-8')
addition='''
## キャラ4の制作（最新・2026-10-28）
- ユーザー指定で白い羽織を除き、黒いノースリーブのハイネックトップスとスカートへ統一。黒髪・緑の目・元の金色の装飾を基準に、計算高い大人の女性を6枚で表した。
- 人間から「前3人の3位が同じ感じ」と指摘されたため、キャラ4では困り眉の苦笑いを使わず、顎に指とひじの支持、水平に近い口元の冷静な思考へ変更した。既存3人は保持する理解で進め、4人の3位の顔を並べて確認した。既存3人も直す意図だった場合、その変更は未実施。
- 読み取りにくかったのは、黒い服の素材と、指先合わせ・ひじを支える手の重なり。明暗背景、原画比較、手の拡大で確認。スカートの全丈や隠れた指の全輪郭まで検証したとは扱わない。
- 2位の下の手が切れ、3位の髪先が上端に触れたため、元画像を残して各1回修正。生成8回・画像出力8回・品質修正2回・安全判定停止0回で完成候補6枚を保存した。
- specialの上端に透明度1/255の薄い縁があり、厳密な書き出し検査が停止した。髪全体が入ることを目で確認し、全画素を残して余白を足す方法で再開。例外は画像の内容識別値と目視記録を必須とし、濃い上端画素の拒否・異なる原画像の上書き拒否の2件も実際に確認した。無条件に検査を緩めていない。
- 全6枚の透明度・寸法・容量、明暗の縁、256pxの表情、ZIP内部一致、61ファイルの保持を確認。人間の最終採用とゲーム組み込みはまだ行っていない。
- 次回の仕様書に足す候補：3位を全員同じ困り眉の苦笑いへ自動で寄せず、性格に合わせて思考・平静・割り切りなどを使い分ける。微小な透明度の縁と実際の輪郭切れは、原画像を残して切り分ける。

'''
break_at=reflection.index('\n')
reflection_path.write_text(reflection[:break_at+1]+addition+reflection[break_at+1:],encoding='utf-8')
print('Final: six PNGs, ZIP and visual record match; protected 61 unchanged; rank3 is neutral thinking.')
