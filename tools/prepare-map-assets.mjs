import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';

const manifest = JSON.parse(fs.readFileSync('tools/tripo-assets.json', 'utf8'));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
fs.mkdirSync(manifest.runtimeDirectory, { recursive: true });
fs.mkdirSync('public/art/map-assets', { recursive: true });
const entries = [], tiles = [];
for (const [i, asset] of manifest.assets.entries()) {
  const record = JSON.parse(fs.readFileSync(`_art/tripo-map/records/${asset.id}${asset.rig ? '-rig' : ''}.json`, 'utf8').replace(/^\uFEFF/, '').trim());
  if (record.status !== 'success') throw new Error(`Missing successful source for ${asset.id}`);
  const source = record.model_file || `${record.output_dir}/model.glb`;
  const preview = record.preview || `${record.output_dir}/preview.png`;
  const doc = await io.read(source);
  const limit = asset.id.startsWith('tree-') || ['rock','wall'].includes(asset.id) ? 512 : 1024;
  for (const ext of doc.getRoot().listExtensionsUsed()) {
    if (['KHR_materials_volume','KHR_materials_transmission','KHR_materials_specular'].includes(ext.extensionName)) ext.dispose();
  }
  await doc.transform(dedup(), prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [limit,limit], quality: 84 }));
  const output = `${manifest.runtimeDirectory}/${asset.id}.glb`;
  await io.write(output, doc);
  let triangles = 0;
  for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) triangles += (p.getIndices()?.getCount() || p.getAttribute('POSITION').getCount()) / 3;
  const previewFile = `public/art/map-assets/${asset.id}.webp`;
  await sharp(preview).resize(384,384,{fit:'contain',background:'#101c25'}).webp({quality:85}).toFile(previewFile);
  const label = Buffer.from(`<svg width="280" height="40"><rect width="280" height="40" fill="#101c25"/><text x="140" y="25" text-anchor="middle" fill="#e6cf9d" font-family="sans-serif" font-size="16">${asset.id}</text></svg>`);
  const tile = await sharp(preview).resize(280,280,{fit:'contain',background:'#101c25'}).extend({bottom:40,background:'#101c25'}).composite([{input:label,top:280,left:0}]).png().toBuffer();
  tiles.push({input:tile,left:(i%5)*280,top:Math.floor(i/5)*320});
  entries.push({ id: asset.id, label: asset.label, file: output, preview: previewFile, triangles, bytes: fs.statSync(output).size,
    sourceTaskId: record.task_id, animation: asset.rig ? 'local procedural skeletal locomotion and combat' : null });
  console.log(asset.id, triangles, (fs.statSync(output).size/1024).toFixed(0)+' KiB');
}
await sharp({create:{width:1400,height:960,channels:3,background:'#101c25'}}).composite(tiles).png().toFile('dev/map-assets-contact.png');
fs.writeFileSync(`${manifest.runtimeDirectory}/manifest.json`, JSON.stringify({provider:'Tripo',model:'P1-20260311',assets:entries},null,2)+'\n');
console.log('Total model bytes:',entries.reduce((s,e)=>s+e.bytes,0));
