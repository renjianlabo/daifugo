from PIL import Image, ImageChops, ImageStat, ImageDraw
from pathlib import Path
import json, hashlib

root = Path(__file__).parent
old = Image.open(root / 'input.png').convert('RGBA')
new = Image.open(root / 'candidate.png').convert('RGBA')
def info(path, im):
    hist = im.getchannel('A').histogram()
    return dict(size=im.size, mode=im.mode, bytes=path.stat().st_size,
                sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                alpha_zero=hist[0], alpha_partial=sum(hist[1:255]), alpha_opaque=hist[255],
                alpha_bbox=im.getchannel('A').getbbox())
def on_background(im, rgb):
    bg = Image.new('RGBA', im.size, (*rgb,255))
    return Image.alpha_composite(bg,im).convert('RGB')
qa = dict(input=info(root/'input.png',old), candidate=info(root/'candidate.png',new),
          generation_calls=1, adopted=False, game_display_test=False)
if old.size == new.size:
    qa['non_hair_region_checks'] = {}
    for name,box in {'face_interior':(540,435,710,585),'top_interior':(400,880,920,1120)}.items():
        d=ImageChops.difference(old.crop(box),new.crop(box))
        qa['non_hair_region_checks'][name]=dict(box=box,mean_abs_rgba=ImageStat.Stat(d).mean,
            identical_pixels=sum(1 for p in d.get_flattened_data() if p==(0,0,0,0)),pixels=d.width*d.height)
canvas=Image.new('RGB',(1280,1352),(230,230,230)); draw=ImageDraw.Draw(canvas)
for row,rgb in enumerate([(248,248,248),(38,41,47)]):
    for col,im in enumerate([old,new]):
        tile=on_background(im,rgb); tile.thumbnail((640,640),Image.Resampling.LANCZOS)
        x=col*640; y=row*676
        draw.text((x+12,y+8),'BEFORE' if col==0 else 'AFTER',fill=(15,15,15))
        canvas.paste(tile,(x,y+32))
canvas.save(root/'comparison.png')
zoom=Image.new('RGB',(1360,1560),(230,230,230)); dz=ImageDraw.Draw(zoom)
for row,box in enumerate([(430,200,850,530),(305,420,575,760),(740,370,970,750)]):
    for col,im in enumerate([old,new]):
        tile=on_background(im,(245,245,245)).crop(box)
        tile.thumbnail((680,480),Image.Resampling.LANCZOS)
        tile=tile.resize((int(tile.width*min(680/tile.width,480/tile.height)),int(tile.height*min(680/tile.width,480/tile.height))),Image.Resampling.LANCZOS)
        x=col*680; y=row*520
        dz.text((x+12,y+8),('BEFORE' if col==0 else 'AFTER')+' / '+['FRINGE + TEMPLES','LEFT SIDE','RIGHT SIDE'][row],fill=(15,15,15))
        zoom.paste(tile,(x,y+32))
zoom.save(root/'hair-detail.png')
protected=json.loads((root/'protected-before.json').read_text(encoding='utf-8-sig'))
changes=[]
for entry in protected:
    p=Path(entry['Path'])
    if not p.exists() or hashlib.sha256(p.read_bytes()).hexdigest().upper()!=entry['Hash']:
        changes.append(str(p))
qa['existing_files_checked']=len(protected)
qa['existing_files_changed_before_handoff_update']=changes
(root/'inspection.json').write_text(json.dumps(qa,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(qa,ensure_ascii=False,indent=2))
