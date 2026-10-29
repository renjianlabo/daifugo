from pathlib import Path
from PIL import Image,ImageDraw,ImageFont,ImageChops,ImageStat
import json,hashlib,zipfile
run=Path(__file__).resolve().parent
root=run.parents[1]
dest=root/'確認用/カード持ち立ち絵_2026-10-29'
spec=json.loads((run/'prompts.json').read_text(encoding='utf-8'))
font=ImageFont.truetype('C:/Windows/Fonts/meiryo.ttc',22)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
rows=[]
for c in spec:
    idx=c['id']; p=dest/f'chara{idx}-cards.png'
    if not p.exists(): continue
    pic=Image.open(p).convert('RGBA'); alpha=pic.getchannel('A')
    assert pic.size==(1038,1515)
    lo,hi=alpha.getextrema()
    assert lo==0 and hi>=250
    assert p.stat().st_size<=500000
    full=Image.open(run/f'chara{idx}-fullcolor.png').convert('RGBA')
    delta=ImageChops.difference(alpha,full.getchannel('A'))
    row=dict(id=idx,filename=p.name,size=pic.size,bytes=p.stat().st_size,alpha_range=alpha.getextrema(),
             visible_bbox=alpha.point(lambda v:255 if v>16 else 0).getbbox(),
             sha256=sha(p),alpha_mean_error=ImageStat.Stat(delta).mean[0],alpha_max_error=delta.getextrema()[1])
    row['composite_mean_error']={}
    for bg in ['#f4f4f4','#281727']:
        a=Image.new('RGBA',pic.size,bg);a.alpha_composite(full)
        b=Image.new('RGBA',pic.size,bg);b.alpha_composite(pic)
        row['composite_mean_error'][bg]=ImageStat.Stat(ImageChops.difference(a.convert('RGB'),b.convert('RGB'))).mean
        assert max(row['composite_mean_error'][bg])<5
    rows.append(row)
    sheet=Image.new('RGB',(1400,1080),'#f4f4f4');d=ImageDraw.Draw(sheet)
    d.rectangle((700,0,1400,1080),fill='#281727')
    for j,bg in enumerate(['#f4f4f4','#281727']):
        p2=pic.copy();p2.thumbnail((680,1000),Image.Resampling.LANCZOS)
        sheet.paste(p2,(j*700+(700-p2.width)//2,60),p2)
        d.text((j*700+20,15),f'キャラ{idx} / '+('明背景' if j==0 else '暗背景'),font=font,fill='#152135' if j==0 else 'white')
    sheet.save(dest/f'chara{idx}-light-dark.jpg',quality=94)
    ref=Image.open(c['reference']).convert('RGBA')
    sheet=Image.new('RGB',(1400,1100),'#eceff3');d=ImageDraw.Draw(sheet)
    for j,img in enumerate([ref,pic]):
        img.thumbnail((680,1000),Image.Resampling.LANCZOS)
        sheet.paste(img,(j*700+(700-img.width)//2,60),img)
        d.text((j*700+20,15),f'キャラ{idx} / '+('元絵' if j==0 else '今回・カード持ち'),font=font,fill='#152135')
    sheet.save(dest/f'chara{idx}-comparison.jpg',quality=95)
    # Enlarged crown-to-chin regions remain visual checks, not pixel-equality claims.
    for tag,img in [('reference',Image.open(c['reference']).convert('RGBA')),('new',pic)]:
        bb=img.getchannel('A').point(lambda v:255 if v>16 else 0).getbbox()
        crop=img.crop((0,max(0,bb[1]-8),img.width,min(img.height,int(img.height*.48))))
        crop.thumbnail((900,900),Image.Resampling.LANCZOS)
        canvas=Image.new('RGBA',crop.size,'#eceff3');canvas.alpha_composite(crop)
        canvas.convert('RGB').save(dest/f'chara{idx}-head-{tag}.jpg',quality=97)
sheet=Image.new('RGB',(1600,680),'#281727');d=ImageDraw.Draw(sheet)
for c in spec:
    idx=c['id'];p=dest/f'chara{idx}-cards.png'
    if not p.exists(): continue
    pic=Image.open(p).convert('RGBA');pic.thumbnail((390,610),Image.Resampling.LANCZOS)
    x=(idx-1)*400
    sheet.paste(pic,(x+(400-pic.width)//2,55),pic)
    d.text((x+130,12),f'キャラ{idx}',font=font,fill='#efcf77')
sheet.save(dest/'4人一覧.jpg',quality=95)
protected=json.loads((run/'protected-before.json').read_text(encoding='utf-8-sig'))
changed=[p['path'] for p in protected if sha(Path(p['path'])).upper()!=p['sha256'].upper()]
assert not changed,changed
report=dict(images=rows,protected_files=len(protected),protected_changed=changed,
            in_game_display='not performed',human_acceptance='pending',visual_review='see 検査結果.md')
(run/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
if len(rows)==4:
    with zipfile.ZipFile(dest/'カード持ち立ち絵4枚.zip','x',zipfile.ZIP_DEFLATED) as z:
        for row in rows:z.write(dest/row['filename'],row['filename'])
    with zipfile.ZipFile(dest/'カード持ち立ち絵4枚.zip') as z:
        assert len(z.namelist())==4
        for row in rows:assert hashlib.sha256(z.read(row['filename'])).hexdigest()==row['sha256']
print(json.dumps(report,ensure_ascii=False))
