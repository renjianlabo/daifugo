from pathlib import Path
from PIL import Image,ImageDraw,ImageFont,ImageChops,ImageStat
import json,hashlib,zipfile
run=Path(__file__).resolve().parent
root=run.parents[2]
dest=root/'確認用/カード持ち立ち絵_2026-10-29'
p=dest/'chara3-cards-one-hand-v2.png'
im=Image.open(p).convert('RGBA')
raw=Image.open(run/'fullcolor.png').convert('RGBA')
oldraw=Image.open(run.parent/'chara3-raw.png').convert('RGBA')
old=Image.open(dest/'chara3-cards.png').convert('RGBA')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert im.size==(1038,1515)
a=im.getchannel('A');lo,hi=a.getextrema()
assert lo==0 and hi>=250
assert p.stat().st_size<=500000
assert raw.crop((0,0,1038,660)).tobytes()==oldraw.crop((0,0,1038,660)).tobytes()
protected=json.loads((run/'protected-before.json').read_text(encoding='utf-8-sig'))
changed=[v['path'] for v in protected if sha(Path(v['path'])).upper()!=v['sha256'].upper()]
assert not changed,changed
font=ImageFont.truetype('C:/Windows/Fonts/meiryo.ttc',22)
for name,images,labels,bgs in [
 ('chara3-one-hand-comparison.jpg',[old,im],['修正前・両手','修正後・片手'],['#eceff3','#eceff3']),
 ('chara3-one-hand-light-dark.jpg',[im,im],['明背景','暗背景'],['#f4f4f4','#281727'])]:
    sheet=Image.new('RGB',(1400,1100))
    for i,(pic,label,bg) in enumerate(zip(images,labels,bgs)):
        ImageDraw.Draw(sheet).rectangle((i*700,0,(i+1)*700,1100),fill=bg)
        small=pic.copy();small.thumbnail((680,1020),Image.Resampling.LANCZOS)
        sheet.paste(small,(i*700+(700-small.width)//2,65),small)
        ImageDraw.Draw(sheet).text((i*700+20,15),label,font=font,fill='white' if bg=='#281727' else '#182235')
    sheet.save(dest/name,quality=96)
error={}
for bg in ['#f4f4f4','#281727']:
    c1=Image.new('RGBA',im.size,bg);c1.alpha_composite(raw)
    c2=Image.new('RGBA',im.size,bg);c2.alpha_composite(im)
    error[bg]=ImageStat.Stat(ImageChops.difference(c1.convert('RGB'),c2.convert('RGB'))).mean
    assert max(error[bg])<5
files=[dest/'chara1-cards.png',dest/'chara2-cards.png',p,dest/'chara4-cards.png']
sheet=Image.new('RGB',(1600,680),'#281727')
for i,picpath in enumerate(files):
    small=Image.open(picpath).convert('RGBA');small.thumbnail((390,610),Image.Resampling.LANCZOS)
    sheet.paste(small,(i*400+(400-small.width)//2,55),small)
    ImageDraw.Draw(sheet).text((i*400+130,12),f'キャラ{i+1}',font=font,fill='#efcf77')
sheet.save(dest/'4人一覧_キャラ3片手版.jpg',quality=95)
zpath=dest/'カード持ち立ち絵4枚_キャラ3片手版.zip'
with zipfile.ZipFile(zpath,'x',zipfile.ZIP_DEFLATED) as z:
    for i,picpath in enumerate(files):z.write(picpath,f'chara{i+1}-cards.png')
with zipfile.ZipFile(zpath) as z:
    assert len(z.namelist())==4
    for i,picpath in enumerate(files):assert hashlib.sha256(z.read(f'chara{i+1}-cards.png')).hexdigest()==sha(picpath)
report=dict(output=str(p),size=im.size,bytes=p.stat().st_size,alpha_range=a.getextrema(),
 visible_bbox=a.point(lambda v:255 if v>16 else 0).getbbox(),sha256=sha(p),
 original_top_660_rows_exact_before_compression=True,compression_composite_mean_error=error,
 preserved_files=len(protected),changed_protected=changed,zip=str(zpath),zip_files=4,
 human_acceptance='pending',game_integration='not performed')
(run/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
