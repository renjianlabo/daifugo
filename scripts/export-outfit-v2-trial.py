"""新衣装の試作を保存。原画像を保持し、元の透明度を変えずに指定容量へ書き出す。"""
from pathlib import Path
from io import BytesIO
import hashlib
import json
from PIL import Image, ImageDraw, ImageFont, ImageChops, ImageStat

root = Path(__file__).resolve().parents[1]
src = root / '生成元/chara1/outfit-v2-trial-01.png'
dst = root / '確認用/キャラ1_新衣装試作01.png'
if dst.exists():
    raise FileExistsError('既存試作は上書きしない')
raw = Image.open(src).convert('RGBA')
assert raw.size == (1254, 1254)
# 頭上に余白を足し、正方形を維持して等比縮小。原画自体は変更しない。
canvas = Image.new('RGBA', (1354, 1354), (0, 0, 0, 0))
canvas.alpha_composite(raw, (50, 100))
full = canvas.resize((1024, 1024), Image.Resampling.LANCZOS)
buf = BytesIO()
full.save(buf, format='PNG', optimize=True)
channel_step = None
chosen = full
if len(buf.getvalue()) > 500_000:
    r, g, b, a = full.split()
    for step in (2, 3, 4, 5, 6, 8):
        lut = [min(255, ((v + step // 2) // step) * step) for v in range(256)]
        candidate = Image.merge('RGBA', (r.point(lut), g.point(lut), b.point(lut), a))
        buf = BytesIO()
        candidate.save(buf, format='PNG', optimize=True)
        if len(buf.getvalue()) <= 500_000:
            chosen, channel_step = candidate, step
            break
    else:
        raise ValueError('500KB以内に収まらない')
dst.write_bytes(buf.getvalue())
check = Image.open(dst).convert('RGBA')
assert check.size == (1024, 1024)
assert check.getchannel('A').tobytes() == full.getchannel('A').tobytes()
alpha = check.getchannel('A')
assert alpha.getextrema() == (0, 255)
bbox = alpha.point(lambda x: 255 if x > 16 else 0).getbbox()
assert bbox[1] >= 64
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
refs = [
    ('codex-clipboard-c4e98d92-ce5e-4890-806b-5b9b79e120c8.png', '参考イラスト/キャラ1/服装_v2/01.png'),
    ('codex-clipboard-d8efbd4f-ec25-47dd-bcce-546bd55dbaff.png', '参考イラスト/キャラ1/服装_v2/02.png'),
]
assert all(sha(Path('C:/Users/81805/AppData/Local/Temp') / a) == sha(root / b) for a, b in refs)
diff_stats = ImageStat.Stat(ImageChops.difference(full, check), mask=alpha.point(lambda x: 255 if x > 128 else 0))
report = {'status': 'trial_saved_pending_visual_acceptance', 'attempts': 1,
          'source_size': list(raw.size), 'export_size': list(check.size), 'export_bytes': dst.stat().st_size,
          'rgb_quantization_step': channel_step, 'rgb_mean_abs_error': diff_stats.mean[:3], 'alpha_unchanged_after_quantization': True,
          'alpha_range': list(alpha.getextrema()), 'alpha_gt16_bbox': bbox,
          'padding_before_resize': [50, 100, 50, 0], 'source_sha256': sha(src), 'export_sha256': sha(dst),
          'reference_copies_match': True, 'adopted': False, 'game_integration': False}
(root / '確認用/キャラ1_新衣装試作01_数値検査.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
font = ImageFont.truetype('C:/Windows/Fonts/meiryo.ttc', 22)
sheet = Image.new('RGB', (1200, 640), '#e8ecf2')
d = ImageDraw.Draw(sheet)
ref = Image.open(root / '参考イラスト/キャラ1/服装_v2/02.png').convert('RGB').crop((100, 0, 750, 810))
ref.thumbnail((380, 570), Image.Resampling.LANCZOS)
sheet.paste(ref, (10 + (380-ref.width)//2, 60))
d.text((20, 12), '新しい服装の基準（上半身）', font=font, fill='#172339')
for x, bg, label, textcolor in [(400, '#ffffff', '試作・明るい背景', '#172339'), (800, '#172339', '試作・暗い背景', '#ffffff')]:
    panel = Image.new('RGB', (400, 640), bg)
    p = check.resize((390, 390), Image.Resampling.LANCZOS)
    panel.paste(p, (5, 125), p)
    ImageDraw.Draw(panel).text((14, 12), label, font=font, fill=textcolor)
    sheet.paste(panel, (x, 0))
sheet.save(root / '確認用/キャラ1_新衣装試作01_比較.png', optimize=True)
print(json.dumps(report, ensure_ascii=False, indent=2))
