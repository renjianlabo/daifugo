from pathlib import Path
from collections import deque
import json,sys
import numpy as np
from PIL import Image,ImageDraw,ImageFont
run=Path(__file__).resolve().parent;root=run.parents[2]
dest=root/'確認用/金髪キャラ_男勝り6枚_修正版'
paths=[('rank1_before',run/'before-rank1.png'),('rank2_ref',run/'before-rank2.png'),('rank3_ref',run/'before-rank3.png')]
if len(sys.argv)>1:paths.append(('rank1_candidate',Path(sys.argv[1])))
if (dest/'rank1.png').exists():paths.append(('rank1_after',dest/'rank1.png'))
records={}
for label,path in paths:
    arr=np.asarray(Image.open(path).convert('RGBA')).astype(int)
    x0,y0,x1,y1=400,700,600,970
    a=arr[y0:y1,x0:x1]
    mask=(a[:,:,2]>a[:,:,0]+25)&(a[:,:,1]>a[:,:,0]+12)&(a[:,:,0]<110)&(a[:,:,2]>70)&(a[:,:,3]>128)
    seen=np.zeros(mask.shape,bool);components=[]
    for yy,xx in zip(*np.where(mask)):
        if seen[yy,xx]:continue
        seen[yy,xx]=True;q=deque([(int(yy),int(xx))]);pts=[]
        while q:
            y,x=q.popleft();pts.append((x+x0,y+y0))
            for dy,dx in [(0,1),(0,-1),(1,0),(-1,0)]:
                yn,xn=y+dy,x+dx
                if 0<=yn<mask.shape[0] and 0<=xn<mask.shape[1] and mask[yn,xn] and not seen[yn,xn]:seen[yn,xn]=True;q.append((yn,xn))
        components.append(pts)
    pts=max(components,key=len)
    p=np.array(pts)
    records[label]=dict(file=str(path),method='largest connected blue belt-gem region in fixed ROI',roi=[x0,y0,x1,y1],pixels=len(pts),bbox=[int(p[:,0].min()),int(p[:,1].min()),int(p[:,0].max()+1),int(p[:,1].max()+1)],center=[round(float(p[:,0].mean()),2),round(float(p[:,1].mean()),2)])
target=(records['rank2_ref']['center'][1]+records['rank3_ref']['center'][1])/2
result=dict(landmarks=records,target_blue_gem_center_y=round(target,2),tolerance_px=15)
if 'rank1_after' in records:
    result['after_delta_px']=round(records['rank1_after']['center'][1]-target,2)
    result['alignment_pass']=abs(result['after_delta_px'])<=15
(run/'waist-measurement.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
font=ImageFont.truetype('C:/Windows/Fonts/meiryo.ttc',18)
sheet=Image.new('RGB',(400*len(paths),500),'#eef1f5');d=ImageDraw.Draw(sheet)
for i,(label,path) in enumerate(paths):
    pic=Image.open(path).convert('RGBA').crop((320,650,720,1024));sheet.paste(pic,(i*400,70),pic)
    d.text((i*400+10,5),label,font=font,fill='#172438')
    d.text((i*400+10,30),'青い留め具中心 y='+str(records[label]['center'][1]),font=font,fill='#172438')
    cy=70+target-650;d.line((i*400,cy,(i+1)*400,cy),fill='#d63355',width=2)
    x,y=records[label]['center'];x=i*400+x-320;y=70+y-650
    d.ellipse((x-5,y-5,x+5,y+5),outline='#00aaff',width=2)
sheet.save(run/'waist-measurement-guide.png')
print(json.dumps(result,ensure_ascii=False))
