from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import shutil
run=Path(__file__).resolve().parent;dest=run.parents[2]/'確認用/金髪キャラ_男勝り6枚_修正版'
font=ImageFont.truetype('C:/Windows/Fonts/meiryo.ttc',24)
sheet=Image.new('RGB',(1200,1240),'#eef1f5');d=ImageDraw.Draw(sheet)
for row,name in enumerate(['special','rank1']):
    for col,kind in enumerate(['修正前','修正後']):
        path=run/('before-'+name+'.png') if col==0 else dest/(name+'.png')
        pic=Image.open(path).convert('RGBA');pic.thumbnail((570,570),Image.Resampling.LANCZOS)
        x,y=col*600+15,row*620+45
        d.text((x,y-35),name+' ／ '+kind,font=font,fill='#172438');sheet.paste(pic,(x,y),pic)
sheet.save(dest/'修正前後.png')
sheet=Image.new('RGB',(1200,650),'#eef1f5');d=ImageDraw.Draw(sheet)
for col,name in enumerate(['special','rank1']):
    pic=Image.open(dest/(name+'.png')).convert('RGBA');pic.thumbnail((580,580),Image.Resampling.LANCZOS)
    x=col*600+10;d.text((x+10,8),'決めポーズ・合掌' if name=='special' else '1位・高さ調整後',font=font,fill='#172438');sheet.paste(pic,(x,55),pic)
sheet.save(dest/'修正後2枚.png')
shutil.copyfile(run/'waist-measurement-guide.png',dest/'腰帯の高さ比較.png')
print('Before-after and 2 edited sprites preview saved')
