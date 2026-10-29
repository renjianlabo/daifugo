from pathlib import Path
import json,hashlib,zipfile
from PIL import Image
run=Path(__file__).resolve().parent;root=run.parents[2];dest=root/'確認用/金髪キャラ_男勝り6枚'
names=['icon','special','rank1','rank2','rank3','rank4']
sources=[('rank2-attempt1-visible-ribbons.png','rank2-prompt.txt'),('rank2.png','rank2-hidden-ribbons-prompt.txt'),('special.png','special-prompt.txt'),('rank1-attempt1-cut-fingers.png','rank1-prompt.txt'),('rank1-attempt2-no-earrings.png','rank1-fix-prompt.txt'),('rank1.png','rank1-earrings-fix-prompt.txt'),('rank3.png','rank3-prompt.txt'),('rank4-attempt1-closed-hands.png','rank4-prompt.txt'),('rank4.png','rank4-hands-fix-prompt.txt')]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
manifest=[]
for source,prompt in sources:
    assert (run/source).is_file() and (run/prompt).is_file()
    manifest.append(dict(source=source,prompt=prompt,source_sha256=sha(run/source),prompt_sha256=sha(run/prompt)))
assert sha(run/'reference.png')==sha(root/'参考イラスト/金髪キャラ_男勝り/01.png')
guard=json.loads((run/'protected-before.json').read_text(encoding='utf-8'))
assert all(sha(root/p)==h for p,h in guard.items())
for n in names:
    p=dest/(n+'.png');im=Image.open(p);im.load()
    assert im.format=='PNG' and im.size==((256,256) if n=='icon' else (1024,1024))
    assert p.stat().st_size<=500000
with zipfile.ZipFile(dest/'完成候補6枚.zip') as z:
    assert sorted(z.namelist())==sorted(n+'.png' for n in names) and z.testzip() is None
    assert all(hashlib.sha256(z.read(n+'.png')).hexdigest()==sha(dest/(n+'.png')) for n in names)
v=json.loads((run/'verification.json').read_text(encoding='utf-8'))
v.update(status='production_and_ai_checks_complete_pending_human_acceptance',generation_calls=9,output_images=9,quality_retries=3,user_condition_revision_outputs=1,generation_failures=0,source_manifest=manifest,visual_review='pass with documented embroidery and scale differences',hair_tying_ribbons_visible=False,earring_blue_tassels_preserved=True,icon_derived_from='rank2',unverified=['human acceptance','game display','existing character assignment','exact face/body/pattern pixel equality'])
text=json.dumps(v,ensure_ascii=False,indent=2)
for p in [run/'verification.json',run/'COMPLETE.json',dest/'数値検査.json']:p.write_text(text,encoding='utf-8')
print(json.dumps(dict(final_files=[dict(name=n,bytes=(dest/(n+'.png')).stat().st_size) for n in names],protected_unchanged=len(guard),source_images=len(manifest),zip_verified=True,human_acceptance=False),ensure_ascii=False))
