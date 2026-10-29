"""Non-generative export and inspection sheets. Existing assets are read-only."""
from pathlib import Path
from io import BytesIO
import sys, json, hashlib, zipfile
from PIL import Image, ImageDraw, ImageFont, ImageChops

run = Path(__file__).resolve().parent
root = run.parents[2]
dest = root / '確認用/キャラ4_新ルール版6枚'
dest.mkdir(exist_ok=True)
names = ['icon','special','rank1','rank2','rank3','rank4']
labels = ['通常','決めポーズ','1位・大喜び','2位・笑顔','3位・思考','4位・落胆']
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()

def export(name):
    src = run / ('special.png' if name == 'icon' else name + '.png')
    raw = Image.open(src).convert('RGBA')
    assert raw.getchannel('A').getextrema() == (0,255), 'real alpha required'
    if name == 'icon':
        # Explicit face crop is set after visual inspection of the source.
        box = json.loads((run/'icon-crop.json').read_text())
        raw = raw.crop(box)
    bbox = raw.getchannel('A').point(lambda v:255 if v>16 else 0).getbbox()
    assert bbox, 'empty image'
    # Transparent padding and uniform scaling only. No repainting.
    top = max(0, round(raw.height*.065) - bbox[1])
    side = max(raw.width, raw.height + top)
    canvas = Image.new('RGBA',(side,side))
    canvas.alpha_composite(raw,((side-raw.width)//2,top))
    size = 256 if name == 'icon' else 1024
    full = canvas.resize((size,size),Image.Resampling.LANCZOS)
    for step in [1,2,3,4,5,6,8]:
        lut=[min(255,((v+step//2)//step)*step) for v in range(256)]
        r,g,b,a=full.split()
        pic=Image.merge('RGBA',(r.point(lut),g.point(lut),b.point(lut),a))
        buf=BytesIO(); pic.save(buf,format='PNG',optimize=True)
        if len(buf.getvalue()) <= 500000: break
    else: raise ValueError('PNG exceeds 500000 bytes')
    out=dest/(name+'.png')
    assert not out.exists(), 'do not overwrite'
    out.write_bytes(buf.getvalue())
    check=Image.open(out).convert('RGBA')
    assert check.getchannel('A').tobytes()==full.getchannel('A').tobytes()
    alpha=check.getchannel('A')
    record=dict(name=name,size=list(check.size),bytes=out.stat().st_size,alpha_range=alpha.getextrema(),
        visible_bbox=alpha.point(lambda v:255 if v>16 else 0).getbbox(),rgb_rounding_step=step,
        source=str(src),source_sha256=sha(src),sha256=sha(out),alpha_preserved_after_resize=True)
    (run/(name+'-numeric.json')).write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8')
    sheet=Image.new('RGB',(2048,1060),'#f4f4f4'); ImageDraw.Draw(sheet).rectangle((1024,0,2048,1060),fill='#162438')
    sheet.paste(check,(0,20),check); sheet.paste(check,(1024,20),check)
    sheet.save(run/(name+'-light-dark.png'))
    print(json.dumps(record,ensure_ascii=False))

def finish():
    pics={n:Image.open(dest/(n+'.png')).convert('RGBA') for n in names}
    records=[json.loads((run/(n+'-numeric.json')).read_text(encoding='utf-8')) for n in names]
    for n,p in pics.items():
        assert p.size==((256,256) if n=='icon' else (1024,1024))
        assert (dest/(n+'.png')).stat().st_size<=500000
        assert p.getchannel('A').getextrema()==(0,255)
        assert p.getchannel('A').crop((0,0,p.width,1)).getextrema()==(0,0)
    font=ImageFont.truetype('C:/Windows/Fonts/meiryo.ttc',20)
    for dark in [False,True]:
        bg='#162438' if dark else '#f1f3f7'; ink='white' if dark else '#162438'
        sheet=Image.new('RGB',(1200,920),bg); d=ImageDraw.Draw(sheet)
        d.text((20,10),'キャラ4・新ルール版 ／ ジャケットなし ／ 採用確認前',font=font,fill=ink)
        for i,(n,label) in enumerate(zip(names,labels)):
            x,y=10+(i%3)*396,55+(i//3)*430
            d.text((x+10,y),n+' / '+label,font=font,fill=ink)
            p=pics[n].copy(); p.thumbnail((370,370),Image.Resampling.LANCZOS)
            sheet.paste(p,(x+(380-p.width)//2,y+35),p)
        sheet.save(dest/('暗背景一覧.png' if dark else '一覧.png'))
    sheet=Image.new('RGB',(1080,300),'#f1f3f7'); d=ImageDraw.Draw(sheet)
    for i,n in enumerate(names[2:]):
        p=pics[n].resize((256,256),Image.Resampling.LANCZOS)
        d.text((i*270+8,4),labels[i+2],font=font,fill='#162438');sheet.paste(p,(i*270+7,40),p)
    sheet.save(dest/'順位256確認.png')
    reference=Image.open(run/'reference.png').convert('RGBA')
    sheet=Image.new('RGB',(1680,390),'#f1f3f7');d=ImageDraw.Draw(sheet)
    for i,(n,p) in enumerate([('参考',reference)]+list(pics.items())):
        p=p.copy();p.thumbnail((226,330),Image.Resampling.LANCZOS)
        d.text((i*240+8,4),n,font=font,fill='#162438');sheet.paste(p,(i*240+(240-p.width)//2,40),p)
    sheet.save(dest/'基準比較.png')
    sheet=Image.new('RGB',(1600,1000),'#eeeeee');d=ImageDraw.Draw(sheet)
    for i,n in enumerate(names[1:]):
        # Head/hair at top; full arms/hands at bottom. Resizing for QA only.
        head=pics[n].crop((190,40,850,610));head.thumbnail((310,460),Image.Resampling.LANCZOS)
        hands=pics[n].crop((0,280,1024,1024));hands.thumbnail((310,460),Image.Resampling.LANCZOS)
        x=i*320
        d.text((x+8,5),n+' 髪',font=font,fill='#162438');sheet.paste(head,(x+4,40),head)
        d.text((x+8,500),n+' 手・腕',font=font,fill='#162438');sheet.paste(hands,(x+4,540),hands)
    sheet.save(dest/'髪と手の拡大確認.png')
    sheet=Image.new('RGB',(1600,1320),'#f1f3f7');d=ImageDraw.Draw(sheet)
    for row in range(4):
        d.text((5,row*325+30),'キャラ'+str(row+1),font=font,fill='#162438')
        for col,n in enumerate(names[1:]):
            p=pics[n] if row==3 else Image.open(root/f'assets/characters/chara{row+1}/{n}.png').convert('RGBA')
            p=p.resize((290,290),Image.Resampling.LANCZOS)
            sheet.paste(p,(120+col*295,row*325+20),p)
    sheet.save(dest/'全キャラポーズ比較.png')
    guard=json.loads((run/'protected-before.json').read_text(encoding='utf-8'))
    changed=[p for p,h in guard.items() if sha(root/p)!=h]
    assert not changed, changed
    archive=dest/'完成候補6枚.zip'
    with zipfile.ZipFile(archive,'x',compression=zipfile.ZIP_DEFLATED) as z:
        for n in names:z.write(dest/(n+'.png'),n+'.png')
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None and len(z.namelist())==6
        for n in names:assert hashlib.sha256(z.read(n+'.png')).hexdigest()==sha(dest/(n+'.png'))
    report=dict(status='six_saved_pending_visual_review',assets=records,protected_files_checked=len(guard),protected_changed=changed,zip_verified=True,human_acceptance=False,game_integration=False,game_tests_run=False)
    (run/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False))

if sys.argv[1]=='finish':finish()
else:export(sys.argv[1])
