const fs=require('node:fs');
const path=require('node:path');
const sharp=require('C:/Users/81805/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const run=__dirname;
const dest=path.resolve(run,'../../../確認用/キャラ2_元絵の髪再現_2026-10-29');
(async()=>{
 const name=process.argv[2];
 const specs=JSON.parse(fs.readFileSync(path.join(run,'prompts.json'),'utf8'));
 const spec=specs.find(s=>s.name===name);if(!spec)throw Error('Unknown name');
 const cfg=JSON.parse(fs.readFileSync(path.join(run,'layouts.json'),'utf8'))[name];
 const out=path.join(dest,name+'.png');if(fs.existsSync(out))throw Error('Existing output preserved');
 const generatedPath=path.join(run,name+'-generated.png');
 const meta=await sharp(generatedPath).metadata();
 const targetW=name==='cards'?1038:1024,targetH=name==='cards'?1515:1024;
 if(Math.abs(meta.width/meta.height-targetW/targetH)>.001)throw Error('Generated aspect ratio changed');
 const gen=await sharp(generatedPath).resize(targetW,targetH,{fit:'contain',background:'#00000000'}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const w=gen.info.width,h=gen.info.height;
 if((name==='cards'&&(w!==1038||h!==1515))||(name!=='cards'&&(w!==1024||h!==1024)))throw Error('Unexpected canvas');
 const old=await sharp(spec.source).resize(w,h,{fit:'fill'}).ensureAlpha().raw().toBuffer();
 const full=Buffer.from(gen.data);
 // The body and pose are outside the edit. Reuse the exact source rows.
 old.copy(full,cfg.cut*w*4,cfg.cut*w*4);
 // Preserve each original eye/eyebrow and mouth, with a narrow edge blend.
 for(const [x0,y0,x1,y1] of cfg.face)for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
   const wt=Math.min(1,Math.min(x-x0,y-y0,x1-1-x,y1-1-y)/4);
   const j=(y*w+x)*4;for(let k=0;k<4;k++)full[j+k]=Math.round(full[j+k]*(1-wt)+old[j+k]*wt);
 }
 const baseline=await sharp(full,{raw:{width:w,height:h,channels:4}}).png({compressionLevel:9}).toBuffer();
 fs.writeFileSync(path.join(run,name+'-fullcolor.png'),baseline,{flag:'wx'});
 let png=await sharp(baseline).resize(name==='icon'?256:w,name==='icon'?256:h).png({compressionLevel:9}).toBuffer();
 if(name==='icon'){
   const small=await sharp(png).ensureAlpha().raw().toBuffer();
   const smallOld=await sharp(spec.source).ensureAlpha().raw().toBuffer();
   const smallCut=Math.floor(cfg.cut/4);smallOld.copy(small,smallCut*256*4,smallCut*256*4);
   for(const rect of cfg.face){const [x0,y0,x1,y1]=rect.map(v=>v/4);
     for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
       const wt=Math.min(1,Math.min(x-x0,y-y0,x1-1-x,y1-1-y));
       const j=(y*256+x)*4;for(let k=0;k<4;k++)small[j+k]=Math.round(small[j+k]*(1-wt)+smallOld[j+k]*wt);
     }
   }
   png=await sharp(small,{raw:{width:256,height:256,channels:4}}).png({compressionLevel:9}).toBuffer();
   fs.writeFileSync(path.join(run,'icon-fullcolor-256.png'),png,{flag:'wx'});
 }
 let method='RGBA PNG, original alpha retained';
 if(png.length>500000){png=await sharp(png).png({palette:true,colours:256,dither:0,effort:10,compressionLevel:9}).toBuffer();method='256 color PNG, RGBA approximated; fullcolor retained';}
 if(png.length>500000)throw Error('500000 byte limit exceeded');
 fs.writeFileSync(out,png,{flag:'wx'});
 fs.writeFileSync(path.join(run,name+'-export.json'),JSON.stringify({name,generated_size:[meta.width,meta.height],size:name==='icon'?[256,256]:[w,h],bytes:png.length,source:spec.source,body_protected_rows:[cfg.cut,h],face_protected_rectangles:cfg.face,method},null,2),{flag:'wx'});
 process.stdout.write(JSON.stringify({name,bytes:png.length,bodyFrom:cfg.cut}));
})().catch(e=>{process.stderr.write(e.stack);process.exitCode=1});
