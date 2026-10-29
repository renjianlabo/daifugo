from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
run=Path(__file__).resolve().parent
dest=run.parents[2]/'確認用/金髪キャラ_男勝り6枚'
font=ImageFont.truetype('C:/Windows/Fonts/meiryo.ttc',20)
for n in ['special','rank1','rank2','rank3','rank4']:
    p=Image.open(dest/(n+'.png')).convert('RGBA')
    sheet=Image.new('RGB',(1400,1250),'#eeeeee');d=ImageDraw.Draw(sheet)
    d.text((10,5),n+' ／ 髪・耳飾り・手 ／ 原寸と拡大',font=font,fill='#162438')
    h=p.crop((190,40,860,620));sheet.paste(h,(10,40),h)
    h=p.crop((0,450,1024,1024));h.thumbnail((690,590),Image.Resampling.LANCZOS);sheet.paste(h,(700,40),h)
    # Whole hair and silhouette against a dark background.
    bg=Image.new('RGBA',p.size,'#162438');bg.alpha_composite(p)
    bg=bg.convert('RGB');bg.thumbnail((600,600),Image.Resampling.LANCZOS);sheet.paste(bg,(400,640))
    sheet.save(dest/(n+'_詳細確認.png'))
print('5 individual detail sheets saved')
