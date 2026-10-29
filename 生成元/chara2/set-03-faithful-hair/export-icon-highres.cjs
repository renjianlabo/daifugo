const fs=require('node:fs'),path=require('node:path');
const sharp=require('C:/Users/81805/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
(async()=>{
 const dir=__dirname,dest=path.resolve(dir,'../../../確認用/キャラ2_元絵の髪再現_2026-10-29');
 const source=path.resolve(dir,'../set-01/icon.png');
 const src=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const gen=await sharp(path.join(dir,'icon-highres-generated.png')).resize(src.info.width,src.info.height,{fit:'contain',background:'#00000000'}).ensureAlpha().raw().toBuffer();
 const w=src.info.width,h=src.info.height;if(w!==1254||h!==1254)throw Error('Wrong original icon dimensions');
 const full=Buffer.from(gen);src.data.copy(full,900*w*4,900*w*4);
 const face=[[681,474,810,608],[620,694,712,750]];
 for(const [x0,y0,x1,y1] of face)for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
  const wt=Math.min(1,Math.min(x-x0,y-y0,x1-1-x,y1-1-y)/6),j=(y*w+x)*4;
  for(let k=0;k<4;k++)full[j+k]=Math.round(full[j+k]*(1-wt)+src.data[j+k]*wt);
 }
 const originalGeometry=await sharp(full,{raw:{width:w,height:h,channels:4}}).png().toBuffer();
 fs.writeFileSync(path.join(dir,'icon-highres-fullcolor.png'),originalGeometry,{flag:'wx'});
 const cropped=await sharp(originalGeometry).extract({left:150,top:30,width:960,height:960}).png().toBuffer();
 const aligned=await sharp(cropped).resize(1024,1024).png().toBuffer();
 fs.writeFileSync(path.join(dir,'icon-final-aligned-fullcolor.png'),aligned,{flag:'wx'});
 const small=await sharp(cropped).resize(256,256).ensureAlpha().raw().toBuffer();
 const old=await sharp(path.resolve(dir,'../../../assets/characters/chara2/icon.png')).ensureAlpha().raw().toBuffer();
 for(let y=0;y<256;y++)for(let x=0;x<256;x++)if(y>=225||(x>=138&&x<182&&y>=118&&y<150)||(x>=125&&x<159&&y>=172&&y<186)){
  const j=(y*256+x)*4;for(let k=0;k<4;k++)small[j+k]=old[j+k];
 }
 const png=await sharp(small,{raw:{width:256,height:256,channels:4}}).png().toBuffer();
 if(png.length>500000)throw Error('Icon too large');
 fs.writeFileSync(path.join(dest,'icon.png'),png,{flag:'wx'});
 fs.writeFileSync(path.join(dir,'icon-final-export.json'),JSON.stringify({source,generated:'icon-highres-generated.png',original_size:[w,h],crop:[150,30,1110,990],size:[256,256],bytes:png.length,original_body_rows:[900,1254],original_face_rectangles:face,restored_output_features:true},null,2),{flag:'wx'});
 process.stdout.write(JSON.stringify({bytes:png.length}));
})().catch(e=>{process.stderr.write(e.stack);process.exitCode=1});
