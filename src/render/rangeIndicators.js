import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {groundHeight} from '../map/grid.js';
const templates=new Map();let loading;
export function loadIndicatorAssets(){
  return loading??=(async()=>{const loader=new GLTFLoader();for(const id of ['crystal-star','crystal-arrow']){try{
    const gltf=await loader.loadAsync(`public/models/indicators/${id}.glb`);gltf.scene.updateMatrixWorld(true);const parts=[];
    gltf.scene.traverse(o=>{if(o.isMesh){let g=o.geometry.clone().applyMatrix4(o.matrixWorld);if(g.index){const flat=g.toNonIndexed();g.dispose();g=flat;}for(const name of Object.keys(g.attributes))if(!['position','normal'].includes(name))g.deleteAttribute(name);parts.push(g);}});
    const geo=mergeGeometries(parts);parts.forEach(g=>g.dispose());geo.computeBoundingBox();let size=geo.boundingBox.getSize(new THREE.Vector3()),center=geo.boundingBox.getCenter(new THREE.Vector3());geo.translate(-center.x,-center.y,-center.z);
    if(id==='crystal-arrow'){
      // Align the generated diagonal silhouette with the spell direction.
      const p=geo.attributes.position,cov=new Array(9).fill(0),v=new THREE.Vector3();
      for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);const a=[v.x,v.y,v.z];for(let j=0;j<3;j++)for(let k=0;k<3;k++)cov[j*3+k]+=a[j]*a[k];}
      let axis=new THREE.Vector3(1,.7,.4).normalize();for(let n=0;n<20;n++)axis.set(cov[0]*axis.x+cov[1]*axis.y+cov[2]*axis.z,cov[3]*axis.x+cov[4]*axis.y+cov[5]*axis.z,cov[6]*axis.x+cov[7]*axis.y+cov[8]*axis.z).normalize();
      geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(axis,new THREE.Vector3(0,0,1)));geo.computeBoundingBox();size=geo.boundingBox.getSize(size);if(size.x<size.y)geo.rotateZ(Math.PI/2);
    }else{
      const thin=[size.x,size.y,size.z].indexOf(Math.min(size.x,size.y,size.z));if(thin===0)geo.rotateZ(Math.PI/2);else if(thin===2)geo.rotateX(-Math.PI/2);
    }
    geo.computeBoundingBox();size=geo.boundingBox.getSize(size);center=geo.boundingBox.getCenter(center);geo.translate(-center.x,-center.y,-center.z);geo.scale(1/Math.max(size.x,.001),.09/Math.max(size.y,.001),1/Math.max(size.z,.001));if(id==='crystal-arrow')geo.rotateY(Math.PI);geo.computeVertexNormals();templates.set(id,geo);
  }catch(e){console.warn('Range ornament unavailable:',id,e.message);}}return {loaded:templates.size};})();
}
const vertex=`varying vec2 vP;void main(){vP=position.xz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const fragment=`
varying vec2 vP;uniform vec3 uColor;uniform float uTime,uShape,uRadius,uWidth,uLength,uAngle,uOutline,uOpacity;
float line(float d,float w){return exp(-abs(d)/w);}
void main(){
 vec2 p=vP;float r=length(p),a=atan(p.x,p.y);float d=r-uRadius;
 if(uShape>0.5&&uShape<1.5){vec2 q=abs(p)-vec2(uWidth*.5,uLength*.5);d=length(max(q,0.))+min(max(q.x,q.y),0.);}
 if(uShape>1.5){float edge=sin(min(1.5708,abs(a)-uAngle*.5))*r;d=max(r-uRadius,edge);}
 float inside=1.-smoothstep(-.012,.018,d);float rim=line(d,.025),halo=line(d,.11)*.32;
 float polar=abs(fract(a/6.283185*24.+.5)-.5);
 float ticks=(1.-smoothstep(.025,.06,polar))*line(r-uRadius+.14,.055);
 float rune=(line(r-uRadius*.67,.016)+line(r-uRadius*.7,.009))*.20;
 float spokes=pow(max(0.,cos(a*8.)),32.)*line(r-uRadius*.7,.08)*.5;
 float spark=pow(max(0.,sin(a*9.-uTime*1.8)),34.)*line(d,.075);
 float weave=pow(max(0.,sin(p.x*5.+sin(p.y*3.+uTime*.45))),30.)*.025;
 float fill=(.035+weave+rune+spokes)*inside*(1.-uOutline);
 if(uShape>.5&&uShape<1.5){float beam=line(p.x,.04)*(.4+.6*sin(p.y*6.-uTime*5.)*sin(p.y*6.-uTime*5.));fill+=beam*.20*inside;}
 float strength=rim*.85+halo+spark*.35+ticks*.16*inside+fill;
 if(strength<.008)discard;
 vec3 color=mix(uColor,vec3(.83,.97,1.),clamp(rim*.78+spark*.5,0.,.9));
 gl_FragColor=vec4(color,strength*uOpacity);
 #include <colorspace_fragment>
}`;
class Field {
  constructor(){this.geometry=new THREE.PlaneGeometry(2,2,24,24).rotateX(-Math.PI/2);this.uv=this.geometry.attributes.uv;this.root=new THREE.Mesh(this.geometry,new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,uniforms:{uColor:{value:new THREE.Color(0x43bfff)},uTime:{value:0},uShape:{value:0},uRadius:{value:1},uWidth:{value:1},uLength:{value:1},uAngle:{value:1},uOutline:{value:0},uOpacity:{value:1}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,toneMapped:false}));this.root.frustumCulled=false;this.root.renderOrder=7;this.root.visible=false;}
  set({x,z,angle=0,shape=0,radius=1,width=1,length=1,cone=1,color=0x43bfff,outline=0,opacity=1}){
    const u=this.root.material.uniforms;u.uShape.value=shape;u.uRadius.value=radius;u.uWidth.value=width;u.uLength.value=length;u.uAngle.value=cone;u.uOutline.value=outline;u.uOpacity.value=opacity;u.uColor.value.set(color);this.root.visible=true;this.root.position.set(x,0,z);this.root.rotation.y=angle;
    const ex=(shape===1?width*.5:radius)+.28,ez=(shape===1?length*.5:radius)+.28,key=[x,z,angle,ex,ez].join('/');
    if(this.key!==key){this.key=key;const p=this.geometry.attributes.position,c=Math.cos(angle),s=Math.sin(angle);for(let i=0;i<p.count;i++){const lx=(this.uv.getX(i)*2-1)*ex,lz=(this.uv.getY(i)*2-1)*ez;p.setXYZ(i,lx,groundHeight(x+lx*c+lz*s,z-lx*s+lz*c)+.085,lz);}p.needsUpdate=true;this.geometry.computeBoundingSphere();}
    this.params={x,z,angle,shape,radius,width,length,cone};
  }
  dispose(){this.geometry.dispose();this.root.material.dispose();}
}
export class RangeIndicators {
  constructor(scene,quality){
    this.root=new THREE.Group();scene.add(this.root);this.range=new Field();this.area=new Field();this.root.add(this.range.root,this.area.root);this.low=quality.particles<.7;this.matrix=new THREE.Object3D();this.materials=[];
    const material=(wireframe=false)=>{const m=new THREE.MeshBasicMaterial({color:0x51caff,transparent:true,opacity:wireframe?.10:.65,blending:wireframe?THREE.AdditiveBlending:THREE.NormalBlending,depthWrite:false,toneMapped:false,wireframe,side:THREE.FrontSide});this.materials.push(m);return m;};
    const star=templates.get('crystal-star');this.stars=[];if(star)for(const wire of [false,true]){const mesh=new THREE.InstancedMesh(star,material(wire),16);mesh.count=0;mesh.frustumCulled=false;mesh.renderOrder=8;this.root.add(mesh);this.stars.push(mesh);}
    this.arrow=new THREE.Group();const geo=templates.get('crystal-arrow');if(geo)for(const wire of [false,true]){const mesh=new THREE.Mesh(geo,material(wire));mesh.renderOrder=8;this.arrow.add(mesh);}this.root.add(this.arrow);this.hide();
  }
  hide(){this.range.root.visible=false;this.area.root.visible=false;this.arrow.visible=false;for(const m of this.stars)m.count=0;this.starCount=0;}
  star(x,z,scale=.38,angle=0){if(this.starCount>=16)return;this.matrix.position.set(x,groundHeight(x,z)+.13,z);this.matrix.rotation.set(0,angle,0);this.matrix.scale.set(scale,1,scale);this.matrix.updateMatrix();for(const m of this.stars){m.setMatrixAt(this.starCount,this.matrix.matrix);m.count=this.starCount+1;m.instanceMatrix.needsUpdate=true;}this.starCount++;}
  ringStars(x,z,r,count=8){for(let i=0;i<count;i++){const a=i/count*Math.PI*2;this.star(x+Math.sin(a)*r,z+Math.cos(a)*r,Math.min(.45,r*.18),a);}}
  showRange(u,r,color=0x43bfff){this.hide();this.range.set({x:u.x,z:u.z,radius:r,color,outline:1});this.color(color);this.ringStars(u.x,u.z,r,this.low?4:8);}
  color(color){this.materials.forEach(m=>m.color.set(color));}
  aim(u,sk,point,dir,invalid){
    this.hide();const color=invalid?0xff675c:sk.t==='ally'?0x67edb4:0x43bfff;this.color(color);const angle=Math.atan2(dir.x,dir.z);
    if(sk.range)this.range.set({x:u.x,z:u.z,radius:sk.range,color,outline:1,opacity:.38});
    if(sk.t==='point'||sk.t==='self'&&sk.radius){const p=sk.t==='point'?point:u,r=sk.radius||1;this.area.set({x:p.x,z:p.z,radius:r,color});this.ringStars(p.x,p.z,r,this.low?4:8);}
    else if(sk.t==='dir'){
      if(sk.angle){const cone=sk.angle*Math.PI/180;this.area.set({x:u.x,z:u.z,shape:2,radius:sk.range,angle,cone,color});for(const a of [-cone/2,0,cone/2])this.star(u.x+Math.sin(angle+a)*sk.range,u.z+Math.cos(angle+a)*sk.range,.38,angle+a);}
      else{const length=sk.range,width=sk.width||1.2;this.area.set({x:u.x+dir.x*length/2,z:u.z+dir.z*length/2,angle,shape:1,length,width,color});for(const l of [0,length])for(const side of [-1,1])this.star(u.x+dir.x*l+Math.cos(angle)*width/2*side,u.z+dir.z*l-Math.sin(angle)*width/2*side,Math.min(.42,width*.45),angle);}
      if(this.arrow.children.length){const len=Math.min(2,sk.range*.4),x=u.x+dir.x*(sk.range-len*.6),z=u.z+dir.z*(sk.range-len*.6);this.arrow.visible=true;this.arrow.position.set(x,groundHeight(x,z)+.18,z);this.arrow.rotation.y=angle;this.arrow.scale.set(Math.min(sk.width||1.2,.75),1,len);}
    }else if(sk.range)this.ringStars(u.x,u.z,sk.range,4);
  }
  update(time){this.range.root.material.uniforms.uTime.value=time;this.area.root.material.uniforms.uTime.value=time;}
  dispose(){this.range.dispose();this.area.dispose();this.materials.forEach(m=>m.dispose());this.stars.forEach(m=>m.dispose());this.root.removeFromParent();}
}
