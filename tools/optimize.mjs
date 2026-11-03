import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { textureCompress, prune, dedup } from '@gltf-transform/functions';
import sharp from 'sharp';
import fs from 'fs';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const src='/mnt/user-data/uploads/'; const files=fs.readdirSync(src).sort();
let i=0; const map={};
for (const f of files) {
  const doc = await io.read(src+f);
  for (const e of doc.getRoot().listExtensionsUsed()) if (e.extensionName==='KHR_materials_volume'||e.extensionName==='KHR_materials_specular') e.dispose();
  await doc.transform(dedup(), prune(), textureCompress({encoder: sharp, targetFormat:'webp', resize:[1024,1024], quality:85}));
  const out = `public/models/m${i}.glb`; await io.write(out, doc); map['m'+i]=f; i++;
  console.log(out, (fs.statSync(out).size/1e6).toFixed(2)+'MB');
}
fs.writeFileSync('tools/model_map.json', JSON.stringify(map,null,1));
