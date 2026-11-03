import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
const W=1600,H=700; const r=new THREE.WebGLRenderer({antialias:true}); r.setSize(W,H); document.body.appendChild(r.domElement);
const s=new THREE.Scene(); s.background=new THREE.Color(0x667788);
s.add(new THREE.HemisphereLight(0xffffff,0x445566,1.5)); const d=new THREE.DirectionalLight(0xffffff,2); d.position.set(2,4,5); s.add(d);
const cam=new THREE.OrthographicCamera(-5.2,5.2,2.3,-2.3,0.1,100); cam.position.set(0,1,10); cam.lookAt(0,1,0);
const L=new GLTFLoader(); let n=0; const info=[];
for(let i=0;i<10;i++) L.load(`../public/models/m${i}.glb`, g=>{
  const o=g.scene; const b=new THREE.Box3().setFromObject(o); const sz=b.getSize(new THREE.Vector3());
  info[i]={size:sz.toArray().map(v=>+v.toFixed(2)), min:b.min.toArray().map(v=>+v.toFixed(2)), anims:g.animations.map(a=>a.name+':'+a.duration.toFixed(2))};
  const sc=1.8/sz.y; o.scale.setScalar(sc); o.position.set((i%5)*2.1-4.2 - (b.min.x+b.max.x)/2*sc, (i<5?2.3:0)-0.1 - b.min.y*sc -1.1, 0);
  s.add(o); if(++n===10){ r.render(s,cam); window.INFO=info; window.DONE=true; }
});
