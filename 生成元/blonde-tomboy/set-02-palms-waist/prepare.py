from pathlib import Path
import json,hashlib,shutil
from PIL import Image,ImageDraw,ImageFont
run=Path(__file__).resolve().parent;root=run.parents[2]
old=root/'確認用/金髪キャラ_男勝り6枚';dest=root/'確認用/金髪キャラ_男勝り6枚_修正版'
dest.mkdir(exist_ok=False)
names=['icon','special','rank1','rank2','rank3','rank4']
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
for n in names:
    shutil.copyfile(old/(n+'.png'),run/('before-'+n+'.png'))
    if n not in ['special','rank1']:shutil.copyfile(old/(n+'.png'),dest/(n+'.png'))
shutil.copyfile(root/'引き継ぎ.md',run/'引き継ぎ_開始前.md')
paths=[p for d in ['assets','src','参考イラスト'] for p in (root/d).rglob('*') if p.is_file()]+[old/(n+'.png') for n in names]
(run/'protected-before.json').write_text(json.dumps({str(p.relative_to(root)):sha(p) for p in paths},ensure_ascii=False,indent=2),encoding='utf-8')
shutil.copyfile(root/'生成元/blonde-tomboy/set-01/compress-png.cjs',run/'compress-png.cjs')
font=ImageFont.truetype('C:/Windows/Fonts/meiryo.ttc',18)
sheet=Image.new('RGB',(1600,460),'#eef1f5');d=ImageDraw.Draw(sheet)
for i,n in enumerate(['rank1','rank2','rank3','rank4']):
    p=Image.open(old/(n+'.png')).convert('RGBA').crop((320,680,720,1024))
    sheet.paste(p,(i*400,65),p);d.text((i*400+10,10),n+' 元画像y=680〜1024',font=font,fill='#172438')
    for y in range(700,1001,25):
        v=65+y-680
        d.line((i*400,v,(i+1)*400,v),fill='#bb6666',width=1)
        d.text((i*400+2,v+1),str(y),font=font,fill='#882222')
sheet.save(run/'before-waist-grid.png')
print('Old 6 retained; unchanged 4 copied; protected',len(paths))
