"""生成済みiconだけを書き出し、実在する画像と未生成を区別して確認用に並べる。"""
from pathlib import Path
import hashlib
import json
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
source = ROOT / '生成元/chara1/icon.png'
out = ROOT / 'assets/characters/chara1/icon.png'
review = ROOT / '確認用'
out.parent.mkdir(parents=True, exist_ok=True)
review.mkdir(exist_ok=True)

# 元画像は変更せず、顔アップとして切り取り、指定寸法へ等比で縮小する。
# この座標は今回の1254px正方形のicon元画像を目視して決めたもの。
im = Image.open(source).convert('RGBA')
assert im.size == (1254, 1254), '未確認の別画像には今回の切り取り座標を流用しない'
icon = im.crop((230, 130, 1030, 930)).resize((256, 256), Image.Resampling.LANCZOS)
if out.exists():
    raise FileExistsError(f'既存成果物は上書きしない: {out}')
icon.save(out, optimize=True)
readback = Image.open(out).convert('RGBA')
alpha = readback.getchannel('A')
assert readback.size == (256, 256)
assert alpha.getextrema() == (0, 255)
assert out.stat().st_size <= 500_000
assert alpha.crop((0, 0, 256, 1)).getextrema() == (0, 0), '頭頂部の余白がない'

font_path = 'C:/Windows/Fonts/meiryo.ttc'
font = ImageFont.truetype(font_path, 21)
small = ImageFont.truetype(font_path, 16)
title = ImageFont.truetype(font_path, 26)
names = [('icon', '通常'), ('special', '決めポーズ'), ('rank1', '1位・大喜び'), ('rank2', '2位・笑顔'), ('rank3', '3位・苦笑い'), ('rank4', '4位・悔しい')]
sheet = Image.new('RGB', (1020, 820), '#edf0f5')
d = ImageDraw.Draw(sheet)
d.text((24, 14), 'キャラ1 ／ 1枚保存・5枚未生成', font=title, fill='#172339')
d.text((24, 52), '服装：参考1枚目・鞄なし ｜ 安全判定で中断・ゲームへの組み込み未実施', font=small, fill='#444e60')
for i, (name, label) in enumerate(names):
    x, y = 22 + (i % 3) * 336, 93 + (i // 3) * 355
    d.rounded_rectangle((x, y, x + 315, y + 333), radius=12, fill='white')
    d.text((x + 14, y + 10), f'{name}.png / {label}', font=small, fill='#172339')
    if name == 'icon':
        sheet.paste(icon, (x + 29, y + 42), icon)
        d.text((x + 18, y + 302), '256×256・透過PNG', font=small, fill='#226644')
    else:
        d.text((x + 112, y + 155), '未生成', font=font, fill='#87705a')
        reason = '安全判定で出力なし' if name in ('special', 'rank1') else '制作を停止したため未実行'
        d.text((x + 35, y + 195), reason, font=small, fill='#666666')
sheet.save(review / 'キャラ1一覧.png', optimize=True)

edges = Image.new('RGB', (580, 320), '#f3f3f3')
ed = ImageDraw.Draw(edges)
ed.rectangle((290, 0, 580, 320), fill='#172339')
edges.paste(icon, (17, 45), icon)
edges.paste(icon, (307, 45), icon)
ed.text((18, 10), '明るい背景', font=small, fill='#172339')
ed.text((308, 10), '暗い背景', font=small, fill='white')
edges.save(review / 'キャラ1_icon_明暗確認.png', optimize=True)

ref_ids = ['a72a7b36-cf89-4e62-8c22-2d8813213012', '805b29d7-9d49-44e0-846d-f91d19a555af', 'ea94d8e7-2d79-4a54-8416-849a9dd9ca27', '282800c5-8a57-4ae8-aea1-2fe7f7a6eb7a', '51a02db0-efff-404d-b0a5-fc1993c4492d', '85975eee-175a-4eaf-b12a-ae84407b94e9', 'c8941089-9306-4d07-8fac-1be19882a349']
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
refs_ok = all(sha(Path(f'C:/Users/81805/AppData/Local/Temp/codex-clipboard-{rid}.png')) == sha(ROOT / f'参考イラスト/キャラ1/{i:02}.png') for i, rid in enumerate(ref_ids, 1))
report = {'status': 'partial_stopped', 'generated_asset_count': 1, 'expected_asset_count': 6,
          'icon': {'size': list(readback.size), 'bytes': out.stat().st_size, 'png': Image.open(out).format == 'PNG',
                   'alpha_extrema': list(alpha.getextrema()), 'alpha_zero_pixels': sum(v == 0 for v in alpha.get_flattened_data()),
                   'alpha_partial_pixels': sum(0 < v < 255 for v in alpha.get_flattened_data()),
                   'sha256': sha(out), 'crop_from_source': [230, 130, 1030, 930]},
          'references_copy_hash_match': refs_ok, 'game_integration': False,
          'missing': [n for n, _ in names if n != 'icon']}
assert refs_ok
(review / 'キャラ1_数値検査.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False, indent=2))
