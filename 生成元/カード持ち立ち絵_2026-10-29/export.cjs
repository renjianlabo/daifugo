const fs = require('node:fs');
const path = require('node:path');
const sharp = require('C:/Users/81805/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const run = __dirname;
const dest = path.resolve(run, '../../確認用/カード持ち立ち絵_2026-10-29');
(async () => {
  const id = Number(process.argv[2]);
  if (![1,2,3,4].includes(id)) throw new Error('Character id required');
  const src = path.join(run, `chara${id}-raw.png`);
  const out = path.join(dest, `chara${id}-cards.png`);
  if (fs.existsSync(out)) throw new Error('Existing deliverable preserved');
  const meta = await sharp(src).metadata();
  if (!meta.hasAlpha) throw new Error('Alpha channel missing');
  const full = await sharp(src).resize(1038,1515,{fit:'contain',position:'centre',background:'#00000000'}).png({compressionLevel:9}).toBuffer();
  fs.writeFileSync(path.join(run,`chara${id}-fullcolor.png`),full,{flag:'wx'});
  let final = full, method='Lossless RGBA PNG';
  if (final.length > 500000) {
    final = await sharp(full).png({palette:true,colours:256,dither:0,effort:10,compressionLevel:9}).toBuffer();
    method='libimagequant 256 color PNG, no dithering; source retained';
  }
  if (final.length > 500000) throw new Error('500000-byte size limit not met');
  fs.writeFileSync(out,final,{flag:'wx'});
  const record={id,source:src,sourceSize:[meta.width,meta.height],output:out,outputSize:[1038,1515],bytes:final.length,method};
  fs.writeFileSync(path.join(run,`chara${id}-export.json`),JSON.stringify(record,null,2),{flag:'wx'});
  process.stdout.write(JSON.stringify(record));
})().catch(e=>{process.stderr.write(e.stack);process.exitCode=1});
