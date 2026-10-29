from pathlib import Path
from io import BytesIO
import json
from PIL import Image,ImageChops,ImageStat,ImageDraw
run=Path(__file__).resolve().parent
raw=Image.open(run/'rank2.png').convert('RGBA')
bbox=raw.getchannel('A').point(lambda v:255 if v>16 else 0).getbbox()
top=max(0,round(raw.height*.065)-bbox[1]);side=max(raw.width,raw.height+top)
c=Image.new('RGBA',(side,side));c.alpha_composite(raw,((side-raw.width)//2,top))
full=c.resize((1024,1024),Image.Resampling.LANCZOS)
hist=full.getchannel('A').histogram()
print('Most common alpha:',sorted(enumerate(hist),key=lambda pair:pair[1],reverse=True)[:12])
records=[]
for astep in [2,4,8,16]:
    for step in [4,6,8,10,12]:
        lut=[min(255,((v+step//2)//step)*step) for v in range(256)]
        alut=[0 if v==0 else 255 if v==255 else max(1,min(254,((v+astep//2)//astep)*astep)) for v in range(256)]
        r,g,b,a=full.split();pic=Image.merge('RGBA',(r.point(lut),g.point(lut),b.point(lut),a.point(alut)))
        buf=BytesIO();pic.save(buf,format='PNG',optimize=True)
        records.append(dict(rgb_step=step,alpha_step=astep,bytes=len(buf.getvalue())))
        if len(buf.getvalue())<500000:
            pic.save(run/f'compression-rgb{step}-alpha{astep}.png')
full.save(run/'export-baseline.png')
(run/'alpha-compression-inspection.json').write_text(json.dumps(records,indent=2),encoding='utf-8')
print(json.dumps(records))
