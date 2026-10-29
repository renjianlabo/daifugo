"""完成候補6枚の実体・保持対象・ZIPを検査し、確認用画像を作る。"""
from pathlib import Path
import json, hashlib, zipfile
from PIL import Image, ImageDraw, ImageFont

run = Path(__file__).resolve().parent
root = run.parents[2]
review = root / '確認用'
dest = root / 'assets/characters/chara2'
names = ['icon','special','rank1','rank2','rank3','rank4']
labels = ['通常（既存）','決めポーズ','1位・大喜び','2位・笑顔','3位・苦笑い','4位・しょんぼり']
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
guard = json.loads((run/'protected-before.json').read_text(encoding='utf-8-sig'))
unchanged = {p:sha(root/p)==h for p,h in guard.items()}
assert all(unchanged.values()), '変更禁止ファイルの内容が変わった'
assert sorted(p.name for p in dest.glob('*.png')) == sorted(f'{n}.png' for n in names)
records = []
images = {}
for name in names:
    path = dest/f'{name}.png'
    with Image.open(path) as im:
        assert im.format == 'PNG'
        im.load()
        pic = im.convert('RGBA')
    expected = (256,256) if name=='icon' else (1024,1024)
    assert pic.size == expected and path.stat().st_size <= 500_000
    alpha = pic.getchannel('A')
    assert alpha.getextrema() == (0,255)
    assert alpha.crop((0,0,pic.width,1)).getextrema() == (0,0)
    record = {'name':name,'file':str(path.relative_to(root)), 'size':list(pic.size),
        'bytes':path.stat().st_size,'alpha_range':list(alpha.getextrema()),
        'transparent_pixels':alpha.histogram()[0], 'opaque_pixels':alpha.histogram()[255],
        'semi_transparent_pixels':sum(alpha.histogram()[1:255]),
        'visible_bbox':alpha.point(lambda v:255 if v>16 else 0).getbbox(),'sha256':sha(path)}
    if name!='icon':
        export = json.loads((run/f'{name}-numeric.json').read_text(encoding='utf-8'))
        assert export['sha256'] == record['sha256']
        record['export'] = export
    records.append(record)
    images[name] = pic

fontfile = 'C:/Windows/Fonts/meiryo.ttc'
font = ImageFont.truetype(fontfile,24)
small = ImageFont.truetype(fontfile,17)
title = ImageFont.truetype(fontfile,30)
for dark in [False,True]:
    sheet = Image.new('RGB',(1200,960),'#172339' if dark else '#edf0f5')
    d = ImageDraw.Draw(sheet)
    ink = 'white' if dark else '#172339'
    d.text((24,12),'キャラ2 ／ 6枚保存・見た目の採用確認前',font=title,fill=ink)
    d.text((24,55),'内気 ／ 髪・服・チョーカーは参考1枚目 ／ ゲームへの組み込みなし',font=small,fill=ink)
    for i,(name,label,r) in enumerate(zip(names,labels,records)):
        x,y = 16+(i%3)*396,94+(i//3)*428
        if not dark:
            d.rounded_rectangle((x,y,x+380,y+410),radius=12,fill='white')
        d.text((x+12,y+8),f'{name}.png / {label}',font=small,fill=ink)
        pic = images[name] if name=='icon' else images[name].resize((330,330),Image.Resampling.LANCZOS)
        sheet.paste(pic,(x+(380-pic.width)//2,y+43),pic)
        d.text((x+12,y+382),f'{r["size"][0]}×{r["size"][1]} / {r["bytes"]:,}バイト',font=small,fill=ink)
    sheet.save(review/('キャラ2_暗背景一覧.png' if dark else 'キャラ2一覧.png'),optimize=True)

sheet = Image.new('RGB',(1080,305),'#f0f0f0')
d = ImageDraw.Draw(sheet)
for i,name in enumerate(names[2:]):
    pic = images[name].resize((256,256),Image.Resampling.LANCZOS)
    d.text((i*270+10,7),labels[i+2],font=small,fill='#172339')
    sheet.paste(pic,(i*270+7,42),pic)
sheet.save(review/'キャラ2_順位256確認.png',optimize=True)

sheet = Image.new('RGB',(1680,400),'#edf0f5')
d = ImageDraw.Draw(sheet)
reference = Image.open(root/'参考イラスト/キャラ2/服装/01.png').convert('RGBA')
for i,name in enumerate(['reference']+names):
    pic = reference.copy() if name=='reference' else images[name].copy()
    pic.thumbnail((226,330),Image.Resampling.LANCZOS)
    x = i*240
    d.text((x+6,6),'固定基準1枚目' if name=='reference' else name,font=small,fill='#172339')
    sheet.paste(pic,(x+(240-pic.width)//2,50),pic)
sheet.save(review/'キャラ2_基準比較.png',optimize=True)

boxes = {'special':[(330,500,550,750),(640,740,820,930)],
    'rank1':[(420,420,620,740)], 'rank2':[(340,300,540,590),(350,690,580,900)],
    'rank3':[(320,600,680,860)], 'rank4':[(325,540,555,760),(400,800,630,1024)]}
sheet = Image.new('RGB',(1600,710),'#eeeeee')
d = ImageDraw.Draw(sheet)
i = 0
for name,regions in boxes.items():
    for j,box in enumerate(regions):
        pic = images[name].crop(box)
        pic.thumbnail((300,310),Image.Resampling.LANCZOS)
        x,y = (i%5)*320,(i//5)*355
        d.text((x+8,y+5),f'{name} 手{j+1}',font=small,fill='#172339')
        sheet.paste(pic,(x+10,y+40),pic)
        i += 1
sheet.save(review/'キャラ2_手の確認.png',optimize=True)

zip_path = review/'キャラ2_完成候補6枚.zip'
if not zip_path.exists():
    with zipfile.ZipFile(zip_path,'w',compression=zipfile.ZIP_DEFLATED) as z:
        for name in names:
            z.write(dest/f'{name}.png',arcname=f'{name}.png')
with zipfile.ZipFile(zip_path) as z:
    assert sorted(z.namelist()) == sorted(f'{n}.png' for n in names)
    assert z.testzip() is None
    assert all(hashlib.sha256(z.read(f'{r["name"]}.png')).hexdigest()==r['sha256'] for r in records)
report = {'status':'six_saved_pending_final_visual_review','expected_assets':6,'saved_assets':6,
    'missing':[],'assets':records,'protected_files_unchanged':unchanged,
    'this_run_generation_calls':8,'this_run_output_images':8,'this_run_quality_retries':3,
    'this_run_moderation_failures':0,'historical_moderation_failures':3,
    'historical_moderation_cause':'unknown','zip':str(zip_path.relative_to(root)),
    'zip_entries':[f'{n}.png' for n in names],'zip_verified':True,'zip_sha256':sha(zip_path),
    'game_integration':False,'game_tests_run':False,'human_acceptance':False,
    'notes':['Alpha equality is against padded and resized image, not against raw dimensions.',
        'Numerical equality of face geometry or body proportions is not asserted.']}
(review/'キャラ2_数値検査.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
(run/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'assets':[{k:r[k] for k in ['name','size','bytes']} for r in records],
    'protected_unchanged':len(unchanged),'zip_verified':True},ensure_ascii=False,indent=2))
