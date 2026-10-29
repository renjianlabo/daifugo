"""Uniform layout only: crown and central blue belt jewel anchor the placement."""
from pathlib import Path
import json,subprocess,sys
import numpy as np
from PIL import Image
run=Path(__file__).resolve().parent
raw=Image.open(run/'rank1.png').convert('RGBA')
preview=raw.resize((1024,1024),Image.Resampling.LANCZOS)
path=run/'rank1-normalized-preview.png';preview.save(path)
subprocess.run([sys.executable,str(run/'measure-waist.py'),str(path)],check=True)
measure=json.loads((run/'waist-measurement.json').read_text(encoding='utf-8'))
gem=measure['landmarks']['rank1_candidate']['center'][1]
alpha=np.asarray(preview.getchannel('A'))[:,256:768]
rows=(alpha>128).sum(axis=1)
crown=next(y for y in range(200) if all(rows[y:y+4]>=20))
target_crown=64
target_gem=measure['target_blue_gem_center_y']
ratio=(target_gem-target_crown)/(gem-crown)
scale=1024/raw.width*ratio
dx=round((1024-raw.width*scale)/2)
dy=round(target_crown-crown*ratio)
cfg=dict(scale=scale,dx=dx,dy=dy,normalized_crown_y=crown,normalized_gem_center_y=gem,target_crown_y=target_crown,target_gem_center_y=target_gem,uniform_scale_ratio=ratio,reason='Uniform scale and translation to match crown and measured blue waist jewel; no local stretching')
(run/'rank1-layout.json').write_text(json.dumps(cfg,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(cfg,ensure_ascii=False))
