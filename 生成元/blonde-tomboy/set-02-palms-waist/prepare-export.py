from pathlib import Path
import shutil
run=Path(__file__).resolve().parent;root=run.parents[2]
old=root/'生成元/blonde-tomboy/set-01'
for name in ['icon','rank2','rank3','rank4']:
    shutil.copyfile(old/(name+'-numeric.json'),run/(name+'-numeric.json'))
shutil.copyfile(old/'reference.png',run/'reference.png')
s=(old/'export.py').read_text(encoding='utf-8')
s=s.replace("dest = root / '確認用/金髪キャラ_男勝り6枚'","dest = root / '確認用/金髪キャラ_男勝り6枚_修正版'")
start=s.index("    bbox = raw.getchannel('A')")
end=s.index('    alpha_preserved=True',start)
s=s[:start]+'''    cfg=json.loads((run/(name+'-layout.json')).read_text(encoding='utf-8'))
    size=1024
    scale=cfg['scale']
    scaled=raw.resize((round(raw.width*scale),round(raw.height*scale)),Image.Resampling.LANCZOS)
    full=Image.new('RGBA',(size,size))
    full.alpha_composite(scaled,(cfg['dx'],cfg['dy']))
'''+s[end:]
s=s.replace("record=dict(name=name,", "record=dict(layout=cfg,name=name,")
s=s.replace('金髪キャラ ／ 男勝り ／ 採用確認前','金髪キャラ ／ 決めポーズ・1位修正版 ／ 採用確認前')
(run/'export.py').write_text(s,encoding='utf-8')
s=(old/'detail-review.py').read_text(encoding='utf-8').replace('確認用/金髪キャラ_男勝り6枚','確認用/金髪キャラ_男勝り6枚_修正版')
(run/'detail-review.py').write_text(s,encoding='utf-8')
print('Export ready; edited images use recorded uniform scale and translation only')
