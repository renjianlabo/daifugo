from pathlib import Path
from PIL import Image,ImageDraw,ImageFont,ImageChops,ImageStat
import json,sys,hashlib,zipfile
run=Path(__file__).resolve().parent;root=run.parents[2]
dest=root/'確認用/キャラ2_元絵の髪再現_2026-10-29'
specs=json.loads((run/'prompts.json').read_text())
cfgs=json.loads((run/'layouts.json').read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
font=ImageFont.truetype('C:/Windows/Fonts/meiryo.ttc',22)
bands={'cards':(360,540),'special':(280,420),'rank1':(320,480),'rank2':(330,495),'rank3':(280,410),'rank4':(310,440),'icon':(500,850)}
landmarks={'cards':((590,360),(548,471)),'special':((552,286),(518,373)),
 'rank1':((587,315),(540,417)),'rank2':((575,338),(542,434)),
 'rank3':((551,285),(516,361)),'rank4':((557,316),(514,402)),
 'icon':((640,560),(548,735))}
def pink_span(im,band):
    data=im.load();widths=[]
    for y in range(*band):
        xs=[]
        for x in range(im.width):
            r,g,b,a=data[x,y]
            if a>100 and r>130 and r-g>20 and b-g>-5 and r>b:xs.append(x)
        if xs:widths.append(xs[-1]-xs[0]+1)
    return max(widths) if widths else 0
rows=[]
for spec in specs:
    name=spec['name'];p=dest/(name+'.png')
    if not p.exists():continue
    pic=Image.open(p).convert('RGBA');full=Image.open(run/('icon-final-aligned-fullcolor.png' if name=='icon' else name+'-fullcolor.png')).convert('RGBA')
    old=Image.open(spec['source']).convert('RGBA').resize(full.size,Image.Resampling.LANCZOS)
    # Preserve-check source resize uses sharp for icon, so icon cores checked separately below.
    cfg=cfgs[name];w,h=full.size;cut=cfg['cut']
    if name!='icon':
        assert full.crop((0,cut,w,h)).tobytes()==old.crop((0,cut,w,h)).tobytes(),name+' body changed'
        for x0,y0,x1,y1 in cfg['face']:
            box=(x0+4,y0+4,x1-4,y1-4)
            assert full.crop(box).tobytes()==old.crop(box).tobytes(),name+' expression patch changed'
    if name=='icon':
        smallOld=Image.open(spec['source']).convert('RGBA')
        assert pic.crop((0,225,256,256)).tobytes()==smallOld.crop((0,225,256,256)).tobytes()
        for rect in cfg['face']:
            x0,y0,x1,y1=[v//4 for v in rect];box=(x0+1,y0+1,x1-1,y1-1)
            assert pic.crop(box).tobytes()==smallOld.crop(box).tobytes()
    expect=(1038,1515) if name=='cards' else ((256,256) if name=='icon' else (1024,1024))
    assert pic.size==expect
    lo,hi=pic.getchannel('A').getextrema();assert lo==0 and hi>=250
    assert p.stat().st_size<=500000
    previous=pink_span(old,bands[name]);current=pink_span(full,bands[name])
    row={'name':name,'size':pic.size,'bytes':p.stat().st_size,'alpha_range':[lo,hi],'sha256':sha(p),
         'body_exact_before_compression':True,'face_core_exact_before_compression':True,
         'hair_width_band':bands[name],'previous_pink_span':previous,'new_pink_span':current,
         'span_change_percent':round((current/previous-1)*100,2) if previous else None,
         'visible_bbox':pic.getchannel('A').point(lambda v:255 if v>16 else 0).getbbox()}
    rows.append(row)
    for suffix,imgs,labels,bgs in [
      ('light-dark',[pic,pic],['明背景','暗背景'],['#f4f4f4','#281727']),
      ('before-after',[Image.open(spec['source']).convert('RGBA'),pic],['修正前','今回'],['#eceff3','#eceff3'])]:
        sheet=Image.new('RGB',(1400,1100))
        for i,(im,label,bg) in enumerate(zip(imgs,labels,bgs)):
            ImageDraw.Draw(sheet).rectangle((i*700,0,(i+1)*700,1100),fill=bg)
            im=im.copy();im.thumbnail((680,1010),Image.Resampling.LANCZOS)
            sheet.paste(im,(i*700+(700-im.width)//2,65),im)
            ImageDraw.Draw(sheet).text((i*700+20,15),name+' / '+label,font=font,fill='white' if bg=='#281727' else '#172339')
        sheet.save(dest/(name+'-'+suffix+'.jpg'),quality=95)
    sheet=Image.new('RGB',(1800,750),'#eceff3')
    ref0=Image.open(run/'hair-reference.png').convert('RGBA')
    # Similarity-align the reference's visible eye and mouth for a side-volume comparison.
    # Expressions differ deliberately, so this is a viewing aid, not an identity metric.
    eye,mouth=landmarks[name]; refeye=complex(454,237);refmouth=complex(416,324)
    factor=(complex(*mouth)-complex(*eye))/(refmouth-refeye)
    offset=complex(*eye)-factor*refeye;inv=1/factor;shift=-offset*inv
    ref=ref0.transform((w,min(h,cut)),Image.Transform.AFFINE,
        (inv.real,-inv.imag,shift.real,inv.imag,inv.real,shift.imag),Image.Resampling.BICUBIC)
    # Use the same crop and scale for reference, previous and new heads.
    bb=old.crop((0,0,w,min(h,cut))).getchannel('A').point(lambda v:255 if v>40 else 0).getbbox()
    crop=(max(0,bb[0]-15),max(0,bb[1]-15),min(w,bb[2]+15),min(h,cut))
    for i,(im,label) in enumerate([(ref.crop(crop),'元絵の髪・目と口で位置合わせ'),(old.crop(crop),'修正前'),(full.crop(crop),'今回')]):
        im=im.copy();im.thumbnail((590,660),Image.Resampling.LANCZOS)
        sheet.paste(im,(i*600+(600-im.width)//2,65),im)
        ImageDraw.Draw(sheet).text((i*600+20,15),name+' / '+label,font=font,fill='#172339')
    sheet.save(dest/(name+'-hair-comparison.jpg'),quality=97)
protected=json.loads((run/'protected-before.json').read_text(encoding='utf-8-sig'))
changed=[p['path'] for p in protected if sha(Path(p['path'])).upper()!=p['sha256'].upper()]
assert not changed,changed
report={'images':rows,'generated_deliverables':len(rows),'expected_generated':7,'protected_files':len(protected),
 'changed_protected':changed,'human_acceptance':'pending','game_integration':'not performed',
 'hair_metric_note':'Maximum horizontal span of pink pixels within a recorded jaw-side band. Auxiliary metric only; not a strand-count or full hairstyle identity test.'}
(run/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
if len(rows) in (6,7) and (dest/'icon_game.png').exists() and all((dest/(n+'.png')).exists() for n in ['cards','special','rank1','rank2','rank3','icon']):
    gp=dest/'icon_game.png';game=Image.open(gp).convert('RGBA')
    assert game.size==(256,256)
    assert game.getchannel('A').getextrema()[0]==0 and game.getchannel('A').getextrema()[1]>=250
    assert gp.stat().st_size<=500000
    report['derived_icon_game']={'size':game.size,'bytes':gp.stat().st_size,'sha256':sha(gp),
         'layout':json.loads((run/'icon_game-export.json').read_text())}
    names=['icon','icon_game','special','rank1','rank2','rank3','rank4','cards']
    available=[n for n in names if (dest/(n+'.png')).exists()]
    missing=[n for n in names if n not in available]
    sheet=Image.new('RGB',(1600,1080),'#281727')
    for i,name in enumerate(names):
        x=(i%4)*400;y=(i//4)*530
        ImageDraw.Draw(sheet).text((x+15,y+15),name,font=font,fill='#efcf77')
        if name in missing:
            ImageDraw.Draw(sheet).text((x+80,y+230),'未生成',font=font,fill='white')
            ImageDraw.Draw(sheet).text((x+35,y+280),'画像生成側の安全判定で停止',font=font,fill='white')
            continue
        im=Image.open(dest/(name+'.png')).convert('RGBA');im.thumbnail((380,470),Image.Resampling.LANCZOS)
        sheet.paste(im,(x+(400-im.width)//2,y+55),im)
    sheet.save(dest/('一覧_4位未生成.jpg' if missing else '8枚一覧.jpg'),quality=95)
    zp=dest/('キャラ2_元絵の髪再現7枚_4位未生成.zip' if missing else 'キャラ2_元絵の髪再現8枚.zip')
    with zipfile.ZipFile(zp,'x',zipfile.ZIP_DEFLATED) as z:
        for name in available:z.write(dest/(name+'.png'),name+'.png')
    with zipfile.ZipFile(zp) as z:
        assert len(z.namelist())==len(available)
        for name in available:assert hashlib.sha256(z.read(name+'.png')).hexdigest()==sha(dest/(name+'.png'))
    report['zip_files']=len(available)
    report['saved_deliverables']=len(available)
    report['missing']=missing
    report['status']='partial_moderation_blocked_rank4' if missing else 'saved_pending_human_acceptance'
    (run/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
