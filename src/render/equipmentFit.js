import * as THREE from 'three';

// Calibrate from the actual palm joints, rather than treating the wrist as a grip.
// Finger rotations are relative to the source skeleton and follow the hand for all poses.
export function fitGrip(model, container, bone, socket, part, rig) {
  if (!part.grasp) return;
  const side = bone.name.startsWith('Left') ? 'Left' : 'Right';
  const nodes = {};
  model.traverse(o=>{if(o.isBone) nodes[o.name]=o;});
  const names = ['Index','Middle','Ring','Pinky'];
  const fingers = names.map(n=>nodes[`${side}_${n}Proximal`]).filter(Boolean);
  if(fingers.length<3) return;
  container.updateMatrixWorld(true);
  const pos = n=>bone.worldToLocal(n.getWorldPosition(new THREE.Vector3()));
  const middle = pos(nodes[`${side}_MiddleProximal`]);
  const along = middle.clone().normalize();
  const across = pos(fingers[0]).sub(pos(fingers.at(-1))).normalize();
  if(part.alignPalm && rig?.rest[bone.name]) {
    const itemQ=part.obj.getWorldQuaternion(new THREE.Quaternion());
    const currentQ=bone.getWorldQuaternion(new THREE.Quaternion());
    const from=across.clone().applyQuaternion(currentQ);
    const to=new THREE.Vector3(0,1,0).applyQuaternion(itemQ);
    if(from.dot(to)<0)to.negate();
    const turn=new THREE.Quaternion().setFromUnitVectors(from,to);
    const parentQ=bone.parent.getWorldQuaternion(new THREE.Quaternion());
    const desired=parentQ.clone().invert().multiply(turn).multiply(currentQ);
    const delta=bone.quaternion.clone().invert().multiply(desired);
    rig.rest[bone.name].local.multiply(delta);bone.quaternion.copy(desired);
    bone.updateWorldMatrix(false,true);
    const parentItemQ=part.obj.parent.getWorldQuaternion(new THREE.Quaternion());
    part.obj.quaternion.copy(parentItemQ.invert().multiply(itemQ));
    container.updateMatrixWorld(true);
  }
  const normal = new THREE.Vector3().crossVectors(along,across).normalize();
  const thumb = nodes[`${side}_ThumbDistal`];
  if(thumb && pos(thumb).dot(normal)<0) normal.negate();
  if(part.palmSign===-1)normal.negate();
  const worldScale=bone.getWorldScale(new THREE.Vector3());
  const unitScale=(worldScale.x+worldScale.y+worldScale.z)/3;
  const radius=(part.gripRadius || 0.023)/unitScale;
  const center=middle.clone().multiplyScalar(0.82).addScaledVector(normal,radius*1.2);
  socket.position.copy(center);
  // Offsets are in equipment space: bow riser, shield stand-off, pistol hilt.
  if(part.palmOffset) socket.position.add(new THREE.Vector3(...part.palmOffset).multiply(socket.scale).applyQuaternion(socket.quaternion));
  const axis=new THREE.Vector3().crossVectors(along,normal).normalize();
  const handQ=bone.getWorldQuaternion(new THREE.Quaternion());
  const worldAxis=axis.clone().applyQuaternion(handQ);
  for (const finger of names) {
    for (const [joint,degrees] of [['Proximal',48],['Intermediate',68],['Distal',34]]) {
      const b=nodes[`${side}_${finger}${joint}`]; if(!b) continue;
      const localAxis=worldAxis.clone().applyQuaternion(b.parent.getWorldQuaternion(new THREE.Quaternion()).invert());
      b.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(localAxis,THREE.MathUtils.degToRad(degrees)));
      b.updateWorldMatrix(false,true);
    }
  }
  if(thumb) {
    const base=nodes[`${side}_ThumbProximal`];
    const start=base.getWorldPosition(new THREE.Vector3());
    const old=thumb.getWorldPosition(new THREE.Vector3()).sub(start).normalize();
    const target=bone.localToWorld(center.clone().addScaledVector(across,radius*0.5)).sub(start).normalize();
    const delta=new THREE.Quaternion().setFromUnitVectors(old,target);
    const parent=base.parent.getWorldQuaternion(new THREE.Quaternion());
    const local=parent.clone().invert().multiply(delta).multiply(parent);
    base.quaternion.premultiply(local);
  }
  part.gripCenter=socket.position.clone();
}

// Sample the real skinned coat once in bind pose; attachments then follow its bones.
export function bodySurface(model, container, bone, offset, side = 1, halfWidth = 0.22, halfHeight = 0.16) {
  container.updateMatrixWorld(true);
  const anchor=container.worldToLocal(bone.getWorldPosition(new THREE.Vector3())).add(new THREE.Vector3(...offset));
  const values=[], p=new THREE.Vector3();
  model.traverse(mesh=>{
    if(!mesh.isSkinnedMesh) return;
    mesh.skeleton.update();
    for(let i=0;i<mesh.geometry.attributes.position.count;i++) {
      mesh.getVertexPosition(i,p); mesh.localToWorld(p); container.worldToLocal(p);
      if(Math.abs(p.x-anchor.x)<halfWidth && Math.abs(p.y-anchor.y)<halfHeight) values.push(p.z);
    }
  });
  if(!values.length) return offset;
  values.sort((a,b)=>a-b);
  const edge=values[Math.floor((values.length-1)*(side>0?0.98:0.02))];
  return [offset[0],offset[1],offset[2]+edge-anchor.z+side*0.025];
}
