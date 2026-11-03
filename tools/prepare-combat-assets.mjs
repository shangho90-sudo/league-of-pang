import fs from 'node:fs/promises';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {dedup,prune} from '@gltf-transform/functions';
const plan=JSON.parse(await fs.readFile('tools/runway-combat-assets.json','utf8'));
let cursor=0;const audio=[];
await Promise.all(Array.from({length:6},async()=>{while(cursor<plan.assets.length){
  const a=plan.assets[cursor++],r=JSON.parse(await fs.readFile(`_art/runway-combat/records/${a.id}.json`,'utf8'));
  if(!r.url)throw new Error('Incomplete sound '+a.id);
  const dir=`public/audio/combat/${a.champion}`,file=`${dir}/${a.kind}.mp3`;await fs.mkdir(dir,{recursive:true});
  try{await fs.access(file);}catch{const response=await fetch(r.url);if(!response.ok)throw new Error(`${a.id}: ${response.status}`);const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length<500)throw new Error('Empty sound '+a.id);await fs.writeFile(file,bytes);}
  audio.push({id:a.id,label:a.label,file,taskId:r.taskId,duration:r.meta?.durationSeconds||a.duration,bytes:(await fs.stat(file)).size});
}}));
audio.sort((a,b)=>a.id.localeCompare(b.id));
await fs.writeFile('public/audio/combat/manifest.json',JSON.stringify({provider:'Runway',estimatedCredits:plan.estimatedCredits,assets:audio},null,2)+'\n');
const indicators=JSON.parse(await fs.readFile('tools/tripo-indicator-assets.json','utf8')),models=[],io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
await fs.mkdir(indicators.runtimeDirectory,{recursive:true});
for(const a of indicators.assets){
 const r=JSON.parse((await fs.readFile(`${indicators.sourceDirectory}/records/${a.id}.json`,'utf8')).replace(/^\uFEFF/,''));
 if(r.status!=='success')throw new Error('Incomplete model '+a.id);
 const file=`${indicators.runtimeDirectory}/${a.id}.glb`,doc=await io.read(r.model_file);
 await doc.transform(dedup(),prune());await io.write(file,doc);
 let triangles=0;for(const m of doc.getRoot().listMeshes())for(const p of m.listPrimitives())triangles+=(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3;
 models.push({id:a.id,file,taskId:r.task_id,credits:r.credits_consumed,triangles,bytes:(await fs.stat(file)).size});
}
await fs.writeFile(`${indicators.runtimeDirectory}/manifest.json`,JSON.stringify({provider:'Tripo',model:indicators.model,assets:models},null,2)+'\n');
console.log(JSON.stringify({sounds:audio.length,audioBytes:audio.reduce((n,a)=>n+a.bytes,0),models}));
