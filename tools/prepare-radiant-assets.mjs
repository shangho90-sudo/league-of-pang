import fs from 'node:fs';
import {NodeIO} from '@gltf-transform/core';
import {dedup,prune} from '@gltf-transform/functions';
import sharp from 'sharp';
const plan=JSON.parse(fs.readFileSync('tools/tripo-radiant-assets.json','utf8'));
const io=new NodeIO(),assets=[];
for(const a of plan.assets){
  const record=JSON.parse(fs.readFileSync(`${plan.outputParent}/records/${a.id}.json`,'utf8').replace(/^\uFEFF/,''));
  if(record.status!=='success')throw new Error(`Missing successful asset ${a.id}`);
  const doc=await io.read(record.model_file);await doc.transform(dedup(),prune());
  const file=`public/models/heroes/${a.id}.glb`;
  await io.write(file,doc);
  const preview=`public/art/hero-assets/${a.id}.webp`;
  await sharp(record.preview).resize(384,384).webp({quality:88}).toFile(preview);
  let triangles=0;for(const m of doc.getRoot().listMeshes())for(const p of m.listPrimitives())triangles+=(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3;
  assets.push({id:a.id,file,preview,triangles,bytes:fs.statSync(file).size,taskId:record.task_id,credits:record.credits_consumed});
}
const ledger={provider:'Tripo',model:plan.model,assets,totalCredits:assets.reduce((n,a)=>n+a.credits,0)};
fs.writeFileSync('public/models/heroes/radiant-manifest.json',JSON.stringify(ledger,null,2)+'\n');
console.log(JSON.stringify(ledger));
