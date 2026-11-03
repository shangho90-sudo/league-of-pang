import fs from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';
const manifest = JSON.parse(fs.readFileSync('tools/tripo-hero-assets.json', 'utf8'));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
fs.mkdirSync(manifest.runtimeDirectory, {recursive: true});
fs.mkdirSync('public/art/hero-assets', {recursive: true});
const entries = [], tiles = [];
for (const asset of manifest.assets) {
  const recordPath = `_art/tripo-heroes/records/${asset.id}.json`;
  if (!fs.existsSync(recordPath)) continue;
  const record = JSON.parse(fs.readFileSync(recordPath, 'utf8').replace(/^\uFEFF/, '').trim());
  if (record.status !== 'success') continue;
  const output = `${manifest.runtimeDirectory}/${asset.id}.glb`;
  if (!fs.existsSync(output)) {
    const doc = await io.read(record.model_file);
    for (const ext of doc.getRoot().listExtensionsUsed()) {
      if (['KHR_materials_volume','KHR_materials_transmission','KHR_materials_specular'].includes(ext.extensionName)) ext.dispose();
    }
    await doc.transform(dedup(), prune(), textureCompress({encoder: sharp, targetFormat: 'webp', resize: [512,512], quality: 87}));
    await io.write(output, doc);
  }
  const doc = await io.read(output);
  let triangles = 0;
  for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) triangles += (p.getIndices()?.getCount() || p.getAttribute('POSITION').getCount()) / 3;
  const previewFile = `public/art/hero-assets/${asset.id}.webp`;
  if (!fs.existsSync(previewFile)) await sharp(record.preview).resize(384,384,{fit:'contain',background:'#101c25'}).webp({quality:86}).toFile(previewFile);
  const i = entries.length;
  const label = Buffer.from(`<svg width="240" height="36"><rect width="240" height="36" fill="#101c25"/><text x="120" y="23" text-anchor="middle" fill="#e6cf9d" font-family="sans-serif" font-size="14">${asset.id}</text></svg>`);
  const tile = await sharp(record.preview).resize(240,240,{fit:'contain',background:'#101c25'}).extend({bottom:36,background:'#101c25'}).composite([{input:label,top:240,left:0}]).png().toBuffer();
  tiles.push({input:tile,left:(i%5)*240,top:Math.floor(i/5)*276});
  entries.push({id:asset.id, label:asset.label, file:output, preview:previewFile, triangles, bytes:fs.statSync(output).size, sourceTaskId:record.task_id, credits:record.credits_consumed});
}
if (entries.length) await sharp({create:{width:1200,height:Math.ceil(entries.length/5)*276,channels:3,background:'#101c25'}}).composite(tiles).png().toFile('dev/hero-assets-contact.png');
fs.writeFileSync(`${manifest.runtimeDirectory}/manifest.json`, JSON.stringify({provider:'Tripo',model:'P1-20260311',assets:entries},null,2)+'\n');
console.log(JSON.stringify({ready:entries.length, bytes:entries.reduce((s,e)=>s+e.bytes,0), ids:entries.map(e=>e.id)}));
