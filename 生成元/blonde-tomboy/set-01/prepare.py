from pathlib import Path
import shutil, json, hashlib
from PIL import Image

run=Path(__file__).resolve().parent
root=run.parents[2]
original=Path('C:/Users/81805/AppData/Local/Temp/codex-clipboard-b399d9e9-e64e-495c-bb9a-29117001e3aa.png')
ref=root/'参考イラスト/金髪キャラ_男勝り/01.png'
ref.parent.mkdir(parents=True,exist_ok=True)
for source,dest in [(original,run/'reference.png'),(original,ref),(root/'引き継ぎ.md',run/'引き継ぎ_開始前.md')]:
    assert not dest.exists(), 'Do not overwrite'
    shutil.copyfile(source,dest)
paths=[p for d in ['assets','src','参考イラスト'] for p in (root/d).rglob('*') if p.is_file()]
(run/'protected-before.json').write_text(json.dumps({str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},ensure_ascii=False,indent=2),encoding='utf-8')
s=(root/'生成元/chara4/set-03-current-rules/export.py').read_text(encoding='utf-8')
s=s.replace('確認用/キャラ4_新ルール版6枚','確認用/金髪キャラ_男勝り6枚').replace('3位・思考','3位・苦笑い')
s=s.replace('キャラ4・新ルール版 ／ ジャケットなし ／ 採用確認前','金髪キャラ ／ 男勝り ／ 採用確認前')
s=s.replace("('special.png' if name == 'icon' else name + '.png')","('rank2.png' if name == 'icon' else name + '.png')")
s=s.replace('range(4):','range(5):').replace('(1600,1320)','(1600,1640)').replace("pics[n] if row==3", "pics[n] if row==4")
(run/'export.py').write_text(s,encoding='utf-8')
assert (run/'export.py').is_file()
assert Image.open(run/'reference.png').size==(832,1216)
print('Reference saved, export prepared, protected files:',len(paths))
