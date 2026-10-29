const fs=require('node:fs');
const path=require('node:path');
const sharp=require('C:/Users/81805/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
(async()=>{
  const dir=__dirname;
  const dest=path.resolve(dir,'../../../確認用/カード持ち立ち絵_2026-10-29/chara3-cards-one-hand-v2.png');
  if(fs.existsSync(dest))throw Error('Existing output preserved');
  const old=await sharp(path.join(dir,'../chara3-raw.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const gen=await sharp(path.join(dir,'generated.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  if(gen.info.width!==1038||gen.info.height!==1515||gen.info.channels!==4)throw Error('Unexpected generated dimensions');
  if(JSON.stringify(old.info)!==JSON.stringify(gen.info))throw Error('Incompatible geometry');
  // The pose edit lies below this line. Reuse the original upper body pixels
  // to prevent generative drift in the face, hair, neck and upper suit.
  const protectedRows=660;
  const full=Buffer.from(gen.data);
  old.data.copy(full,0,0,1038*protectedRows*4);
  const baseline=await sharp(full,{raw:{width:1038,height:1515,channels:4}}).png({compressionLevel:9}).toBuffer();
  fs.writeFileSync(path.join(dir,'fullcolor.png'),baseline,{flag:'wx'});
  const final=await sharp(baseline).png({palette:true,colours:256,dither:0,effort:10,compressionLevel:9}).toBuffer();
  if(final.length>500000)throw Error('500000 byte limit exceeded');
  fs.writeFileSync(dest,final,{flag:'wx'});
  fs.writeFileSync(path.join(dir,'export.json'),JSON.stringify({output:dest,size:[1038,1515],bytes:final.length,protected_rows:[0,660],protected_source:'../chara3-raw.png',method:'Original rows 0..659 reused without modification, then 256-color PNG compression; fullcolor retained'},null,2),{flag:'wx'});
  process.stdout.write(JSON.stringify({output:dest,bytes:final.length}));
})().catch(e=>{process.stderr.write(e.stack);process.exitCode=1});
