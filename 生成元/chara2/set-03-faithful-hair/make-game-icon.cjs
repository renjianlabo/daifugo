const fs=require('node:fs');const path=require('node:path');
const sharp=require('C:/Users/81805/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
(async()=>{
 const dir=__dirname,dest=path.resolve(dir,'../../../確認用/キャラ2_元絵の髪再現_2026-10-29');
 const src=path.join(dest,'icon.png'),out=path.join(dest,'icon_game.png');
 if(fs.existsSync(out))throw Error('Existing output preserved');
 const buf=fs.readFileSync(src);const raw=await sharp(buf).ensureAlpha().raw().toBuffer();
 const a=(x,y)=>raw[(y*256+x)*4+3];const chin=204;let top=-1;
 for(let y=0;y<chin&&top<0;y++)for(let x=0;x<256;x++)if(a(x,y)>40){top=y;break;}
 if(top<0)throw Error('No head pixels');
 const headY=Math.round(top+.2*(chin-top));let left=-1,right=-1;
 for(let x=0;x<256;x++)if(a(x,headY)>40){if(left<0)left=x;right=x;}
 const cx=(left+right)/2,side=(chin-top)/.73,scale=256/side;
 const cropX=cx-side/2;let shift=0,cropY=top-.05*side,png,reach;
 while(true){
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="256" height="256"><image x="${-cropX*scale}" y="${-cropY*scale}" width="${256*scale}" height="${256*scale}" xlink:href="data:image/png;base64,${buf.toString('base64')}"/></svg>`;
  png=await sharp(Buffer.from(svg)).png().toBuffer();
  const d=await sharp(png).ensureAlpha().raw().toBuffer();reach=0;
  for(let y=0;y<128;y++)for(let x=0;x<256;x++)if(d[(y*256+x)*4+3]>40){const dx=(x+.5)/256-.5,dy=(y+.5)/256-.5;if(Math.abs(dx)<=-dy)reach=Math.max(reach,Math.hypot(dx,dy));}
  if(reach<=.464||shift>=.05)break;
  shift+=.0025;cropY=top-(.05+shift)*side;
 }
 if(png.length>500000)throw Error('Icon too large');
 fs.writeFileSync(out,png,{flag:'wx'});
 const record={source:'icon.png',size:[256,256],bytes:png.length,chin_source:chin,top_source:top,head_y:headY,head_left:left,head_right:right,cx,cropX,cropY,side,shift,top_reach:reach,top_reach_pass:reach<=.464};
 fs.writeFileSync(path.join(dir,'icon_game-export.json'),JSON.stringify(record,null,2),{flag:'wx'});
 process.stdout.write(JSON.stringify(record));
})().catch(e=>{process.stderr.write(e.stack);process.exitCode=1});
