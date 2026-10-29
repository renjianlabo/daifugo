"""原画像を保持し、等比縮小・容量調整と明暗背景の検査画像を保存する。"""
from pathlib import Path
from io import BytesIO
import sys, json, hashlib, shutil, math
from PIL import Image, ImageDraw, ImageFont, ImageChops, ImageStat

run = Path(__file__).resolve().parent
root = run.parents[2]
name = sys.argv[1]
assert name in ['icon', 'special', 'rank1', 'rank2', 'rank3', 'rank4']
target_size = 256 if name == 'icon' else 1024
src = Path(sys.argv[2])
raw_path = run / f'{name}.png'
assert not raw_path.exists()
shutil.copyfile(src, raw_path)
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
raw = Image.open(raw_path).convert('RGBA')
assert raw.width == raw.height
assert raw.getchannel('A').getextrema() == (0, 255)
assert raw.getchannel('A').crop((0, 0, raw.width, 1)).getextrema() == (0, 0), '頭頂が上端に触れる'
raw_box = raw.getchannel('A').point(lambda v: 255 if v > 16 else 0).getbbox()
top_pad = max(0, math.ceil((raw.height * .07 - raw_box[1]) / .93))
side = raw.height + top_pad
canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
canvas.alpha_composite(raw, ((side - raw.width) // 2, top_pad))
full = canvas.resize((target_size, target_size), Image.Resampling.LANCZOS)
alpha = full.getchannel('A')
step_used = 1
for step in (1, 2, 3, 4, 5, 6, 8):
    lut = [min(255, ((v + step // 2) // step) * step) for v in range(256)]
    r, g, b, a = full.split()
    candidate = Image.merge('RGBA', (r.point(lut), g.point(lut), b.point(lut), a))
    buf = BytesIO()
    candidate.save(buf, format='PNG', optimize=True)
    if len(buf.getvalue()) <= 500_000:
        step_used = step
        break
else:
    raise ValueError('500KBを超える。完成候補へは保存しない')
dst = root / 'assets/characters/chara3' / f'{name}.png'
assert not dst.exists(), '既存画像を上書きしない'
dst.write_bytes(buf.getvalue())
with Image.open(dst) as png:
    assert png.format == 'PNG'
    check = png.convert('RGBA')
assert check.size == (target_size, target_size)
assert check.getchannel('A').tobytes() == alpha.tobytes()
assert check.getchannel('A').getextrema() == (0, 255)
assert dst.stat().st_size <= 500_000
bbox = alpha.point(lambda v: 255 if v > 16 else 0).getbbox()
assert bbox[1] >= (10 if name == 'icon' else 20) and bbox[0] > 0 and bbox[2] < target_size
stats = ImageStat.Stat(ImageChops.difference(full, check), mask=alpha.point(lambda v: 255 if v > 128 else 0))
record = dict(name=name, source=str(raw_path.relative_to(root)), source_size=list(raw.size),
    source_sha256=sha(raw_path), size=list(check.size), bytes=dst.stat().st_size,
    alpha_range=[0,255], alpha_preserved_after_resize=True, visible_bbox=bbox,
    rgb_rounding_step=step_used, rgb_mean_abs_error=stats.mean[:3], sha256=sha(dst),
    top_padding_pixels=top_pad,
    transformation='transparent top padding if needed, uniform resize to target size, RGB rounding only; alpha unchanged after resize',
    visual_review='pending')
(run / f'{name}-numeric.json').write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding='utf-8')
font = ImageFont.truetype('C:/Windows/Fonts/meiryo.ttc', 24)
sheet = Image.new('RGB', (2048,1080), '#f0f0f0')
d = ImageDraw.Draw(sheet)
d.rectangle((1024,0,2048,1080),fill='#172339')
sheet.paste(check,(0,56),check)
sheet.paste(check,(1024,56),check)
d.text((20,12),f'{name} / 明るい背景',font=font,fill='#172339')
d.text((1044,12),f'{name} / 暗い背景',font=font,fill='white')
sheet.save(run/f'{name}-light-dark.png', optimize=True)
print(json.dumps(record, ensure_ascii=False))
