from pathlib import Path
import json,hashlib,zipfile
from PIL import Image
run=Path(__file__).resolve().parent;root=run.parents[2]
dest=root/'確認用/金髪キャラ_男勝り6枚_修正版';old=root/'確認用/金髪キャラ_男勝り6枚'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
names=['icon','special','rank1','rank2','rank3','rank4']
guard=json.loads((run/'protected-before.json').read_text(encoding='utf-8'))
assert all(sha(root/p)==h for p,h in guard.items())
unchanged={n:sha(dest/(n+'.png'))==sha(old/(n+'.png')) for n in ['icon','rank2','rank3','rank4']}
assert all(unchanged.values())
for n in names:
    p=dest/(n+'.png');im=Image.open(p);im.load()
    assert im.format=='PNG' and im.size==((256,256) if n=='icon' else (1024,1024))
    assert p.stat().st_size<=500000
    a=im.convert('RGBA').getchannel('A');lo,hi=a.getextrema();assert lo==0 and hi>=250
waist=json.loads((run/'waist-measurement.json').read_text(encoding='utf-8'))
assert waist['alignment_pass']
with zipfile.ZipFile(dest/'完成候補6枚.zip') as z:
    assert sorted(z.namelist())==sorted(n+'.png' for n in names) and z.testzip() is None
    assert all(hashlib.sha256(z.read(n+'.png')).hexdigest()==sha(dest/(n+'.png')) for n in names)
sources=[('special.png','special-prompt.txt'),('rank1-attempt1-edge.png','rank1-prompt.txt'),('rank1.png','rank1-fix-prompt.txt')]
for image,prompt in sources:assert (run/image).is_file() and (run/prompt).is_file()
v=json.loads((run/'verification.json').read_text(encoding='utf-8'))
v.update(status='two_edits_and_ai_checks_complete_pending_human_acceptance',edited=['special','rank1'],unchanged_images=unchanged,generation_calls=3,output_images=3,quality_retries=1,generation_failures=0,waist_measurement=waist,visual_review='pass; see report for scope and limits',hair_tying_ribbons_visible=False,earring_blue_tassels_preserved=True,unverified=['human acceptance','game display','pixel-perfect preservation inside edited images'])
s=json.dumps(v,ensure_ascii=False,indent=2)
for p in [run/'verification.json',run/'COMPLETE.json',dest/'数値検査.json']:p.write_text(s,encoding='utf-8')
print(json.dumps(dict(edited_bytes={n:(dest/(n+'.png')).stat().st_size for n in ['special','rank1']},unchanged=unchanged,protected_files_unchanged=len(guard),waist_delta_px=waist['after_delta_px'],zip_verified=True),ensure_ascii=False))
