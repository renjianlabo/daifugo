"""実在するキャラ2のiconだけを書き出し、未生成と明確に分けて途中成果を残す。"""
from pathlib import Path
from io import BytesIO
import json
import hashlib
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1]
source = root / '生成元/chara2/set-01'
review = root / '確認用'
dest = root / 'assets/characters/chara2'
raw = Image.open(source / 'icon.png').convert('RGBA')
assert raw.size == (1254, 1254), '未確認の元画像'
pic = raw.crop((150, 30, 1110, 990)).resize((256, 256), Image.Resampling.LANCZOS)
out = dest / 'icon.png'
encoded = BytesIO()
pic.save(encoded, format='PNG', optimize=True)
if out.exists():
    assert out.read_bytes() == encoded.getvalue(), '既存iconと異なるため上書きしない'
else:
    out.write_bytes(encoded.getvalue())
check = Image.open(out).convert('RGBA')
a = check.getchannel('A')
assert check.size == (256, 256) and a.getextrema() == (0, 255)
assert out.stat().st_size <= 500_000
assert a.crop((0, 0, 256, 1)).getextrema() == (0, 0), '頭上の余白がない'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
guard = json.loads((source / 'protected-before.json').read_text(encoding='utf-8'))
unchanged = {p: sha(root / p) == h for p, h in guard.items()}
assert all(unchanged.values()), 'キャラ1またはゲームのファイルが開始時から変わった'
ids = ['9f80523e-d1da-4918-8cfb-3db5dc0853ad','689d87c3-67ae-4025-a08c-5371d81ab3bc','ff808cdb-f9d7-471e-88bc-ecf19fbcf2bf','51a09456-9887-489d-a414-a9cab7444b40','63684e68-4fae-47dc-bd8e-95b60c8d645d','fba3da08-648f-4f65-8ce7-187394300c75','94b47502-cd02-4930-a7f8-543d3faecea6']
assert all(sha(Path(f'C:/Users/81805/AppData/Local/Temp/codex-clipboard-{rid}.png')) == sha(root / f'参考イラスト/キャラ2/{i:02}.png') for i, rid in enumerate(ids, 1))
continuations = [json.loads(p.read_text(encoding='utf-8')) for p in source.glob('generation-log-continuation-*.json')]
extra_calls = [c for run in continuations for c in run['calls']]
result = {'status':'partial_stopped','expected_assets':6,'saved_assets':1,'icon':{'size':[256,256], 'bytes':out.stat().st_size,'alpha_range':list(a.getextrema()),'sha256':sha(out),'crop':[150,30,1110,990]},
          'missing':['special','rank1','rank2','rank3','rank4'],'generation_calls':4+len(extra_calls),'output_images':2,'quality_retries':1,'moderation_failures':2+sum(c['status']=='failed' and c.get('code')=='moderation_blocked' for c in extra_calls),
          'protected_files_unchanged':unchanged,'references_copy_hash_match':True,'game_integration':False,'human_acceptance':False}
(review / 'キャラ2_数値検査.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
font = ImageFont.truetype('C:/Windows/Fonts/meiryo.ttc',22)
small = ImageFont.truetype('C:/Windows/Fonts/meiryo.ttc',16)
heading = ImageFont.truetype('C:/Windows/Fonts/meiryo.ttc',28)
names = [('icon','通常'),('special','決めポーズ'),('rank1','1位・大喜び'),('rank2','2位・笑顔'),('rank3','3位・苦笑い'),('rank4','4位・しょんぼり')]
sheet = Image.new('RGB',(1080,850),'#edf0f5')
d = ImageDraw.Draw(sheet)
d.text((22,12),'キャラ2 ／ 1枚保存・5枚未生成',font=heading,fill='#172339')
d.text((22,54),'内気な性格 ／ 髪・服・チョーカーは参考1枚目 ／ ほかのアクセサリーなし',font=small,fill='#46546a')
for i,(name,label) in enumerate(names):
    x,y=18+(i%3)*354,94+(i//3)*370
    d.rounded_rectangle((x,y,x+336,y+350),radius=12,fill='white')
    d.text((x+12,y+10),f'{name}.png / {label}',font=small,fill='#172339')
    if name=='icon':
        sheet.paste(check,(x+40,y+46),check)
        d.text((x+18,y+315),f'256×256・{out.stat().st_size/1000:.0f}KB・透過',font=small,fill='#226644')
    else:
        d.text((x+122,y+155),'未生成',font=font,fill='#87705a')
        why='安全判定で出力なし' if (source/f'{name}-error.json').exists() else '制作停止により未実行'
        d.text((x+72,y+198),why,font=small,fill='#666666')
sheet.save(review/'キャラ2一覧.png',optimize=True)
edge = Image.new('RGB',(580,320),'#f3f3f3')
ed = ImageDraw.Draw(edge)
ed.rectangle((290,0,580,320),fill='#172339')
edge.paste(check,(17,45),check);edge.paste(check,(307,45),check)
ed.text((18,10),'明るい背景',font=small,fill='#172339');ed.text((308,10),'暗い背景',font=small,fill='white')
edge.save(review/'キャラ2_icon_明暗確認.png',optimize=True)
(source/'PARTIAL.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in result.items() if k!='protected_files_unchanged'},ensure_ascii=False,indent=2))
print('Protected files unchanged:',len(unchanged))
