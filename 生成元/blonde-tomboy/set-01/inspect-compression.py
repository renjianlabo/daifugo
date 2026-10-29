from pathlib import Path
from io import BytesIO
import json
from PIL import Image,ImageChops,ImageStat
run=Path(__file__).resolve().parent
raw=Image.open(run/'rank2-attempt1-visible-ribbons.png').convert('RGBA')
bbox=raw.getchannel('A').point(lambda v:255 if v>16 else 0).getbbox()
top=max(0,round(raw.height*.065)-bbox[1]);side=max(raw.width,raw.height+top)
c=Image.new('RGBA',(side,side));c.alpha_composite(raw,((side-raw.width)//2,top))
full=c.resize((1024,1024),Image.Resampling.LANCZOS)
records=[]
for step in [4,6,8,10,12,16,20]:
    lut=[min(255,((v+step//2)//step)*step) for v in range(256)]
    r,g,b,a=full.split();pic=Image.merge('RGBA',(r.point(lut),g.point(lut),b.point(lut),a))
    buf=BytesIO();pic.save(buf,format='PNG',optimize=True)
    records.append(dict(method='rgb_round',step=step,bytes=len(buf.getvalue())))
for colors in [256]:
    rgb=full.convert('RGB').quantize(colors=colors,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE).convert('RGB')
    rgb.putalpha(full.getchannel('A'))
    buf=BytesIO();rgb.save(buf,format='PNG',optimize=True)
    records.append(dict(method='palette_rgb_alpha_unchanged',colors=colors,bytes=len(buf.getvalue())))
    rgb.save(run/'compression-palette-preview.png')
for colors in [256,224,192]:
    pic=full.quantize(colors=colors,method=Image.Quantize.FASTOCTREE,dither=Image.Dither.NONE)
    buf=BytesIO();pic.save(buf,format='PNG',optimize=True)
    delta=ImageChops.difference(pic.convert('RGBA').getchannel('A'),full.getchannel('A'))
    records.append(dict(method='rgba_indexed',colors=colors,bytes=len(buf.getvalue()),alpha_mae=ImageStat.Stat(delta).mean[0],alpha_max=delta.getextrema()[1]))
    pic.save(run/f'compression-indexed-{colors}.png')
hist=full.getchannel('A').histogram()
print('alpha histogram extremes:',hist[0],sum(hist[1:255]),hist[255])
(run/'compression-inspection.json').write_text(json.dumps(records,indent=2),encoding='utf-8')
print(json.dumps(records))
