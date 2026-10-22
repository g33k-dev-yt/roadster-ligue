import fs from 'node:fs/promises';
// Optimizes the CC BY 4.0 community Roadster for real-time matches.
// Original topology and silhouette retained; baked atlas becomes vertex colour.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, draco } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.encoder': await draco3d.createEncoderModule() });
const targetTriangles=Number(process.argv[2]||36000), output=process.argv[3]||'roadster-2026.glb';
try{await fs.access('roadster-2026-source.glb');}catch{const response=await fetch('https://raw.githubusercontent.com/codinguniversefromEric/roadster/main/car.glb');if(!response.ok)throw new Error('Source model download failed: '+response.status);await fs.writeFile('roadster-2026-source.glb',new Uint8Array(await response.arrayBuffer()));}
const document = await io.read('roadster-2026-source.glb');
await MeshoptSimplifier.ready; MeshoptSimplifier.useExperimentalFeatures = true;
for (const mesh of document.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
  const pos = prim.getAttribute('POSITION').getArray(), uv = prim.getAttribute('TEXCOORD_0').getArray(), indices = prim.getIndices().getArray();
  const texture = prim.getMaterial().getEmissiveTexture() || prim.getMaterial().getBaseColorTexture();
  const { data, info } = await sharp(texture.getImage()).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const map = new Map(), positions = [], colors = [], counts = [], oldToNew = new Uint32Array(pos.length / 3);
  const linear = x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4;
  for (let i = 0; i < pos.length / 3; i++) {
    const key = [0,1,2].map(k => Math.round(pos[i*3+k] * 30000)).join(',');
    let n = map.get(key);
    if (n === undefined) { n = positions.length / 3; map.set(key, n); positions.push(pos[i*3], pos[i*3+1], pos[i*3+2]); colors.push(0,0,0); counts.push(0); }
    oldToNew[i] = n; counts[n]++;
    const x = Math.min(info.width-1, Math.max(0, Math.round(uv[i*2] * (info.width-1))));
    const y = Math.min(info.height-1, Math.max(0, Math.round(uv[i*2+1] * (info.height-1))));
    const pixel = (y * info.width + x) * info.channels;
    for (let c=0;c<3;c++) colors[n*3+c] += linear(data[pixel+c]/255);
  }
  for (let i=0;i<colors.length;i++) colors[i] /= counts[Math.floor(i/3)];
  const weldedIndices = Uint32Array.from(indices, i => oldToNew[i]);
  const pArray = new Float32Array(positions), cArray = new Float32Array(colors);
  const [simplified, error] = MeshoptSimplifier.simplifyWithAttributes(weldedIndices, pArray, 3, cArray, 3, [.15,.15,.15], null, targetTriangles*3, .025, []);
  const [remap, unique] = MeshoptSimplifier.compactMesh(simplified);
  const outP = new Float32Array(unique*3), outC = new Float32Array(unique*3);
  for (let i=0;i<remap.length;i++) if (remap[i] !== 0xffffffff) for (let k=0;k<3;k++) { outP[remap[i]*3+k] = pArray[i*3+k]; outC[remap[i]*3+k] = cArray[i*3+k]; }
  // compactMesh already rewrites the index buffer in place.
  const buffer=document.getRoot().listBuffers()[0];
  const attr=(type,array)=>document.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  for(const semantic of prim.listSemantics()) prim.setAttribute(semantic,null);
  prim.setAttribute('POSITION',attr('VEC3',outP)); prim.setAttribute('COLOR_0',attr('VEC3',outC)); prim.setIndices(attr('SCALAR',unique<65535?new Uint16Array(simplified):simplified));
  prim.getMaterial().setBaseColorFactor([1,1,1,1]).setBaseColorTexture(null).setEmissiveFactor([0,0,0]).setEmissiveTexture(null).setDoubleSided(false);
  console.log('Roadster:',indices.length/3,'→',simplified.length/3,'triangles;',unique,'vertices; error',error);
}
await document.transform(prune(), draco({ method:'edgebreaker',quantizePosition:14,quantizeColor:8,quantizeNormal:10 }));
await io.write('public/assets/'+output,document);
