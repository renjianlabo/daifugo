from pathlib import Path
from PIL import Image
import shutil,hashlib,json,zipfile
root=Path(__file__).resolve().parents[3]
run=Path(__file__).resolve().parent
dest=root/'確認用/キャラ2_チャット元PNG_2026-10-30'
dest.mkdir(exist_ok=True)
chat=Path('C:/Users/81805/.codex/generated_images/01a18727-e3cd-78c3-8c1d-d531e74b7769')
mapping={
 'special':('special-generated.png','exec-10bee4a8-b39e-4d06-afe8-7004fce0604e.png'),
 'rank1':('rank1-generated.png','exec-285210bc-6aa8-4e7c-a8ec-24a890c60587.png'),
 'rank2':('rank2-generated.png','exec-a92582f3-07d7-484e-8591-984510626478.png'),
 'rank3':('rank3-generated.png','exec-c385cedd-4114-4035-8f6e-edba3710a187.png'),
 'rank4':('rank4-generated.png','exec-63c8a92f-76b1-42c2-9bc1-65bd3b5c994f.png'),
 'cards':('cards-generated.png','exec-c4eb6ac9-f000-4e11-af5a-23902c8121f6.png'),
 'icon':('icon-highres-generated.png','exec-91946814-4a47-45de-8e32-7dab16e9faa0.png')}
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
rows=[]
for name,(local,original) in mapping.items():
    source=run/local; original=chat/original;out=dest/(name+'.png')
    assert not out.exists(),out
    assert sha(source)==sha(original),(name,'source differs from chat original')
    shutil.copyfile(source,out)
    assert sha(out)==sha(original)
    with Image.open(out) as im:
        assert im.format=='PNG'
        rgba=im.convert('RGBA');assert rgba.getchannel('A').getextrema()==(0,255)
        rows.append(dict(name=name,filename=out.name,size=im.size,mode=im.mode,bytes=out.stat().st_size,
             sha256=sha(out),chat_original=str(original),workspace_source=str(source),byte_identical=True))
zp=dest/'元PNG7枚.zip'
with zipfile.ZipFile(zp,'x',zipfile.ZIP_DEFLATED) as z:
    for r in rows:z.write(dest/r['filename'],r['filename'])
with zipfile.ZipFile(zp) as z:
    assert len(z.namelist())==7
    for r in rows:assert hashlib.sha256(z.read(r['filename'])).hexdigest()==r['sha256']
(dest/'元PNG対応表.json').write_text(json.dumps(dict(images=rows,zip_files=7,no_resize=True,
    no_color_reduction=True,no_generation=True,all_identical_to_chat_originals=True),ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps([{'name':r['name'],'size':r['size'],'bytes':r['bytes'],'same_as_chat':True} for r in rows],ensure_ascii=False))
