const fs=require('node:fs'),path=require('node:path');
const sharp=require('C:/Users/81805/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const dir=__dirname,dest=path.resolve(dir,'../../../確認用/キャラ2_元絵の髪再現_2026-10-29');
function hairMask(d,w,h){
 let m=new Uint8Array(w*h);
 for(let y=0;y<Math.min(h,940);y++)for(let x=0;x<w;x++){
  const j=(y*w+x)*4,r=d[j],g=d[j+1],b=d[j+2];
  if(d[j+3]>16&&r>100&&r-g>12&&b>g)m[y*w+x]=1;
 }
 // Close tiny gaps and include the hair boundary; do not remove facial features.
 function morph(src,r,dilate){let out=new Uint8Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   let v=dilate?0:1; outer:for(let yy=Math.max(0,y-r);yy<=Math.min(h-1,y+r);yy++)for(let xx=Math.max(0,x-r);xx<=Math.min(w-1,x+r);xx++){
    if(dilate?src[yy*w+xx]:!src[yy*w+xx]){v=dilate?1:0;break outer;}}
   out[y*w+x]=v;
  }return out;}
 m=morph(m,2,true);m=morph(m,2,false);
 const seen=new Uint8Array(w*h);
 for(let start=0;start<m.length;start++)if(!m[start]&&!seen[start]){
  let q=[start],head=0,touches=false;seen[start]=1;
  while(head<q.length){const p=q[head++],x=p%w,y=(p/w)|0;if(x===0||y===0||x===w-1||y===h-1)touches=true;
   for(const n of [x>0?p-1:-1,x<w-1?p+1:-1,y>0?p-w:-1,y<h-1?p+w:-1])if(n>=0&&!m[n]&&!seen[n]){seen[n]=1;q.push(n);}
  }
  if(!touches&&q.length<20000)for(const p of q)m[p]=1;
 }
 m=morph(m,2,true);
 // Preserve original visible eye, eyebrow, nose, mouth and nearby skin.
 for(let y=450;y<820;y++)for(let x=0;x<w;x++)if((x>=550&&x<=734&&y<=620)||(x>=470&&x<=670&&y>=630))m[y*w+x]=0;
 return m;
}
(async()=>{
 const source=path.resolve(dir,'../../../assets/characters/chara2/icon.png');
 const old=await sharp(source).resize(1024,1024).ensureAlpha().raw().toBuffer();
 const normalized=await sharp(path.join(dir,'icon-generated.png')).resize(1024,1024).png().toBuffer();
 // Landmarks read from icon-alignment-grid.jpg; align eye and mouth before hair extraction.
 const srcEye={x:642,y:540},srcMouth={x:557,y:694};
 const dstEye={x:640,y:560},dstMouth={x:548,y:735};
 const sx=srcMouth.x-srcEye.x,sy=srcMouth.y-srcEye.y,dx=dstMouth.x-dstEye.x,dy=dstMouth.y-dstEye.y;
 const den=sx*sx+sy*sy,a=(dx*sx+dy*sy)/den,b=(dy*sx-dx*sy)/den;
 const tx=dstEye.x-a*srcEye.x+b*srcEye.y,ty=dstEye.y-b*srcEye.x-a*srcEye.y;
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1024" height="1024"><image transform="matrix(${a} ${b} ${-b} ${a} ${tx} ${ty})" width="1024" height="1024" xlink:href="data:image/png;base64,${normalized.toString('base64')}"/></svg>`;
 const generated=await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer();
 const om=hairMask(old,1024,1024),nm=hairMask(generated,1024,1024);
 const full=Buffer.from(old);
 for(let i=0;i<om.length;i++){
  const j=i*4;if(om[i])full[j+3]=0;
  const fa=full[j+3]/255,ba=nm[i]?generated[j+3]/255:0,oa=fa+ba*(1-fa);
  if(oa){for(let k=0;k<3;k++)full[j+k]=Math.round((full[j+k]*fa+generated[j+k]*ba*(1-fa))/oa);full[j+3]=Math.round(oa*255);}
 }
 const fullpng=await sharp(full,{raw:{width:1024,height:1024,channels:4}}).png().toBuffer();
 fs.writeFileSync(path.join(dir,'icon-hair-only-fullcolor.png'),fullpng,{flag:'wx'});
 const small=await sharp(fullpng).resize(256,256).ensureAlpha().raw().toBuffer();
 const smallOld=await sharp(source).ensureAlpha().raw().toBuffer();
 // The non-hair expression and shoulder region are restored at the actual output resolution.
 for(let y=0;y<256;y++)for(let x=0;x<256;x++)if(y>=225||(x>=138&&x<182&&y>=118&&y<150)||(x>=125&&x<159&&y>=172&&y<186)){
   const j=(y*256+x)*4;for(let k=0;k<4;k++)small[j+k]=smallOld[j+k];
 }
 const out=await sharp(small,{raw:{width:256,height:256,channels:4}}).png().toBuffer();
 fs.writeFileSync(path.join(dest,'icon.png'),out,{flag:'wx'});
 fs.writeFileSync(path.join(dir,'icon-repair.json'),JSON.stringify({method:'Similar-scale alignment at eye/mouth; pink hair mask only; original non-hair face and body reused',source_eye:srcEye,source_mouth:srcMouth,target_eye:dstEye,target_mouth:dstMouth,matrix:[a,b,-b,a,tx,ty],bytes:out.length},null,2),{flag:'wx'});
 process.stdout.write(JSON.stringify({bytes:out.length}));
})().catch(e=>{process.stderr.write(e.stack);process.exitCode=1});
