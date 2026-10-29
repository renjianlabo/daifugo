"""実際に輪郭を見た画像だけ、明示引数で薄い上端画素の確認記録を残す。"""
from pathlib import Path
import sys,json,hashlib
from PIL import Image
assert sys.argv[3]=='--complete-crown-inspected', '目視確認してから実行する'
run=Path(__file__).resolve().parent
name,source=sys.argv[1],Path(sys.argv[2])
assert name in ['icon','special','rank1','rank2','rank3','rank4']
im=Image.open(source).convert('RGBA');a=im.getchannel('A')
top=a.crop((0,0,im.width,1)).getextrema()[1]
assert top<=16, '上端に明確な輪郭がある。確認例外を適用せず停止する'
p=run/'source-edge-review.json'
reviews=json.loads(p.read_text(encoding='utf-8')) if p.exists() else {}
reviews[name]={'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
    'complete_crown':True,'top_alpha_max':top,
    'visible_bbox_top_at_alpha_over_16':a.point(lambda v:255 if v>16 else 0).getbbox()[1],
    'decision':'Native output visually inspected; preserve source and all alpha; add transparent margin only.'}
p.write_text(json.dumps(reviews,ensure_ascii=False,indent=2),encoding='utf-8')
print(name,'source top alpha:',top)
