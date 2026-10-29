"""承認済み基準から作った6枚を、原画像と透明度を保って書き出し・検査する。"""
from pathlib import Path
from io import BytesIO
import argparse
import hashlib
import json
import math
import shutil
import zipfile
from PIL import Image, ImageDraw, ImageFont, ImageChops, ImageStat

root = Path(__file__).resolve().parents[1]
source_dir = root / '生成元/chara1/v2-set-01'
stage = source_dir / '書き出し'
review = root / '確認用'
names = ['icon', 'special', 'rank1', 'rank2', 'rank3', 'rank4']
labels = ['通常', '決めポーズ', '1位・大喜び', '2位・笑顔', '3位・苦笑い', '4位・しょんぼり']
parser = argparse.ArgumentParser()
parser.add_argument('--save-final', action='store_true', help='6枚の目視検査記録を確認して所定フォルダへコピー')
args = parser.parse_args()
stage.mkdir(exist_ok=True)
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
approved = source_dir / 'base-approved.png'
assert sha(approved) == sha(root / '生成元/chara1/outfit-v2-trial-01.png')
revisions_path = source_dir / 'revisions.json'
revisions = json.loads(revisions_path.read_text(encoding='utf-8')) if revisions_path.exists() else {}
assert set(revisions) <= {'rank4'}, '今回許可された修正はrank4のみ'
records = []
for name in names:
    src = approved if name == 'icon' else source_dir / f'{name}.png'
    rev = revisions.get(name)
    if rev:
        src = (source_dir / rev['source']).resolve()
        assert src.is_relative_to(root), '元画像が作業フォルダ外'
    raw = Image.open(src).convert('RGBA')
    assert raw.width == raw.height
    if name == 'icon':
        full = raw.crop((290, -35, 930, 605)).resize((256, 256), Image.Resampling.LANCZOS)
        placement = {'crop': [290, -35, 930, 605]}
    else:
        box = raw.getchannel('A').point(lambda v: 255 if v > 16 else 0).getbbox()
        assert box, '空の画像'
        bottom_pad = rev.get('bottom_pad', 0) if rev else 0
        top_pad = max(0, math.ceil(((raw.height + bottom_pad) * .08 - box[1]) / .92))
        side = raw.height + top_pad + bottom_pad
        canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
        canvas.alpha_composite(raw, ((side - raw.width) // 2, top_pad))
        full = canvas.resize((1024, 1024), Image.Resampling.LANCZOS)
        placement = {'top_pad': top_pad, 'bottom_pad': bottom_pad, 'square_canvas': side}
    original_alpha = full.getchannel('A')
    buf = BytesIO()
    full.save(buf, format='PNG', optimize=True)
    step_used = None
    if len(buf.getvalue()) > 500_000:
        r, g, b, a = full.split()
        for step in (2, 3, 4, 5, 6, 8):
            lut = [min(255, ((v + step // 2) // step) * step) for v in range(256)]
            candidate = Image.merge('RGBA', (r.point(lut), g.point(lut), b.point(lut), a))
            buf = BytesIO()
            candidate.save(buf, format='PNG', optimize=True)
            if len(buf.getvalue()) <= 500_000:
                step_used = step
                break
        else:
            raise ValueError(f'{name}: 500KBを超える')
    dst = stage / f'{name}.png'
    if dst.exists():
        if dst.read_bytes() != buf.getvalue():
            assert rev, f'{name}: 許可されていない画像の変更'
            saved_old = (source_dir / rev['stage_backup']).resolve()
            assert saved_old.is_relative_to(root)
            assert sha(saved_old) == sha(dst) == rev['old_sha256'], '旧書き出し画像の保存を照合できない'
            dst.write_bytes(buf.getvalue())
    else:
        dst.write_bytes(buf.getvalue())
    with Image.open(dst) as png:
        assert png.format == 'PNG'
        check = png.convert('RGBA')
    expected = (256, 256) if name == 'icon' else (1024, 1024)
    assert check.size == expected
    a = check.getchannel('A')
    assert a.tobytes() == original_alpha.tobytes()
    assert a.getextrema() == (0, 255)
    assert dst.stat().st_size <= 500_000
    visible = a.point(lambda v: 255 if v > 16 else 0).getbbox()
    assert visible[1] >= (10 if name == 'icon' else 64)
    stats = ImageStat.Stat(ImageChops.difference(full, check), mask=a.point(lambda v: 255 if v > 128 else 0))
    records.append({'name': name, 'file': str(dst.relative_to(root)), 'source': str(src.relative_to(root)),
                    'source_size': list(raw.size), 'size': list(check.size), 'bytes': dst.stat().st_size,
                    'alpha_range': list(a.getextrema()), 'alpha_preserved': True, 'visible_bbox': visible,
                    'rgb_rounding_step': step_used, 'rgb_mean_abs_error': stats.mean[:3],
                    'placement': placement, 'source_sha256': sha(src), 'sha256': sha(dst)})
assert sorted(p.name for p in stage.glob('*.png')) == sorted(f'{n}.png' for n in names)
report = {'status': 'six_exported_pending_final_visual_acceptance', 'reference_sha256': sha(approved),
          'generation_calls': 5 + sum(r['generation_calls'] for r in revisions.values()), 'generation_failures': 0,
          'generation_retries': sum(r['quality_retries'] for r in revisions.values()),
          'quality_rejected_outputs': sum(r['quality_rejected_outputs'] for r in revisions.values()),
          'user_requested_revisions': list(revisions),
          'icon_method': 'crop from approved source, no regeneration', 'assets': records,
          'game_integration': False}
report_path = review / 'キャラ1_新衣装6枚_数値検査.json'
report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')

font_path = 'C:/Windows/Fonts/meiryo.ttc'
font = ImageFont.truetype(font_path, 24)
small = ImageFont.truetype(font_path, 17)
heading = ImageFont.truetype(font_path, 30)
sheet = Image.new('RGB', (1200, 960), '#eaf0f5')
d = ImageDraw.Draw(sheet)
d.text((25, 12), 'キャラ1 ／ 新衣装 6枚', font=heading, fill='#172339')
d.text((25, 54), '白いシャツ・青いリボン・紺スカート ／ 鞄なし ／ ゲームへの組み込み前', font=small, fill='#46546a')
dark_sheet = Image.new('RGB', (1200, 960), '#142035')
dd = ImageDraw.Draw(dark_sheet)
dd.text((25, 12), 'キャラ1 ／ 暗い背景で輪郭を確認', font=heading, fill='white')
for i, (name, label, record) in enumerate(zip(names, labels, records)):
    x, y = 16 + (i % 3) * 396, 92 + (i // 3) * 428
    d.rounded_rectangle((x, y, x + 380, y + 411), radius=14, fill='white')
    d.text((x + 15, y + 8), f'{name}.png  {label}', font=font, fill='#172339')
    pic = Image.open(stage / f'{name}.png').convert('RGBA')
    pic = pic.resize((330, 330), Image.Resampling.LANCZOS) if name != 'icon' else pic
    px, py = x + (380 - pic.width) // 2, y + 48
    sheet.paste(pic, (px, py), pic)
    d.text((x + 15, y + 383), f'{record["size"][0]}×{record["size"][1]} ／ {record["bytes"]/1000:.0f}KB', font=small, fill='#46546a')
    dd.text((x + 15, y + 8), f'{name}.png  {label}', font=font, fill='white')
    dark_sheet.paste(pic, (px, py), pic)
sheet.save(review / 'キャラ1一覧_v2.png', optimize=True)
dark_sheet.save(review / 'キャラ1_新衣装6枚_暗背景.png', optimize=True)

small_sheet = Image.new('RGB', (1064, 320), '#ffffff')
sd = ImageDraw.Draw(small_sheet)
for i, name in enumerate(names[2:]):
    pic = Image.open(stage / f'{name}.png').convert('RGBA').resize((256, 256), Image.Resampling.LANCZOS)
    x = 8 + i * 264
    sd.text((x + 10, 4), labels[i + 2], font=small, fill='#172339')
    small_sheet.paste(pic, (x, 40), pic)
small_sheet.save(review / 'キャラ1_順位256確認.png', optimize=True)

base_comparison = Image.new('RGB', (1450, 300), '#eef0f4')
bd = ImageDraw.Draw(base_comparison)
for i, name in enumerate(['base-approved', 'icon', 'special', 'rank1', 'rank2', 'rank3', 'rank4']):
    src = approved if i == 0 else stage / f'{name}.png'
    pic = Image.open(src).convert('RGBA').resize((200, 200), Image.Resampling.LANCZOS)
    x = 8 + i * 205
    bd.text((x, 6), '承認済み基準' if i == 0 else name, font=small, fill='#172339')
    base_comparison.paste(pic, (x, 52), pic)
base_comparison.save(review / 'キャラ1_基準と6枚比較.png', optimize=True)

if args.save_final:
    visual_path = review / 'キャラ1_新衣装6枚_目視検査.json'
    visual = json.loads(visual_path.read_text(encoding='utf-8'))
    assert visual['required_issues'] == 0
    assert visual['asset_sha256'] == {r['name']: r['sha256'] for r in records}
    dest = root / 'assets/characters/chara1'
    for r in records:
        target = dest / f'{r["name"]}.png'
        if target.exists() and sha(target) != r['sha256']:
            if r['name'] == 'icon':
                backup = root / '生成元/chara1/旧衣装/icon-256.png'
                assert backup.exists() and sha(backup) == sha(target), '旧iconのバックアップを照合できない'
            else:
                rev = revisions.get(r['name'])
                assert rev, '想定外の既存素材を上書きしない'
                backup = (source_dir / rev['backup']).resolve()
                assert backup.is_relative_to(root) and backup.exists()
                assert sha(backup) == sha(target) == rev['old_sha256'], '旧版とバックアップの内容が一致しない'
        if not target.exists() or sha(target) != r['sha256']:
            shutil.copyfile(stage / f'{r["name"]}.png', target)
        assert sha(target) == r['sha256']
    for rev in revisions.values():
        for protected_name, expected_hash in rev['protected_asset_hashes'].items():
            assert sha(dest / f'{protected_name}.png') == expected_hash, f'{protected_name}: 変更禁止の画像が変わった'
    report['protected_five_unchanged'] = bool(revisions)
    previous_sheet = review / 'キャラ1一覧.png'
    if previous_sheet.exists():
        backup_sheet = source_dir / '旧一覧_未完成.png'
        if not backup_sheet.exists():
            shutil.copyfile(previous_sheet, backup_sheet)
    shutil.copyfile(review / 'キャラ1一覧_v2.png', previous_sheet)
    zip_path = review / 'キャラ1_新衣装6枚.zip'
    with zipfile.ZipFile(zip_path, 'w', compression=zipfile.ZIP_DEFLATED) as z:
        for name in names:
            z.write(dest / f'{name}.png', arcname=f'{name}.png')
    with zipfile.ZipFile(zip_path) as z:
        assert sorted(z.namelist()) == sorted(f'{n}.png' for n in names)
        assert z.testzip() is None
        for r in records:
            assert hashlib.sha256(z.read(f'{r["name"]}.png')).hexdigest() == r['sha256']
    (source_dir / 'COMPLETE.json').write_text(json.dumps({'status': 'files_ready_for_human_review',
        'assets': {r['name']: r['sha256'] for r in records}, 'human_visual_acceptance': False,
        'game_integration': False}, ensure_ascii=False, indent=2), encoding='utf-8')
    report['status'] = 'six_saved_ai_checks_passed_pending_human_review'
    report['final_files'] = {r['name']: str((dest / f'{r["name"]}.png').relative_to(root)) for r in records}
    report['human_visual_acceptance'] = False
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
for r in records:
    print(f'{r["name"]}: {r["size"]}, {r["bytes"]} bytes, RGB step {r["rgb_rounding_step"]}, alpha preserved')
print('Saved final assets' if args.save_final else 'Staged for visual review')
