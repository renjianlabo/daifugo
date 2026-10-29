const sharp=require('C:/Users/81805/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
  const input=process.argv[2] || path.join(__dirname,'export-baseline.png');
  const output=process.argv[3] || path.join(__dirname,'compression-sharp-256.png');
  if(fs.existsSync(output)) throw new Error('Do not overwrite');
  await sharp(input).png({palette:true,colours:256,quality:100,effort:10,dither:0,compressionLevel:9}).toFile(output);
  console.log(JSON.stringify({input,output,bytes:fs.statSync(output).size,metadata:await sharp(output).metadata()}));
})().catch(e=>{console.error(e);process.exit(1)});
