import { assetUrl } from './assets.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const FIELD = { x: 42, z: 64, roof: 28, ramp: 5, goalX: 13, goalY: 10, goalDepth: 9 };
export const TEAM = [0xc1ff42, 0xff8857];
const V = THREE.Vector3;
const basic = (color, extra = {}) => new THREE.MeshBasicMaterial({ color, ...extra });
const standard = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .75, ...extra });
const box = (w, h, d, material, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material); m.position.set(x, y, z); return m; };
const rng = seed => { let a = seed; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; };
function canvasTexture(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
function glowTexture() { return canvasTexture(128, 128, (c) => { const g = c.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, '#ffffffc0'); g.addColorStop(.16, '#ffffff68'); g.addColorStop(.5, '#ffffff18'); g.addColorStop(1, '#ffffff00'); c.fillStyle = g; c.fillRect(0, 0, 128, 128); }); }
export const GLOW = glowTexture();

export class Visuals {
  constructor(container, onProgress) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x23332f, .0045);
    this.camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, .1, 550);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.onProgress = onProgress;
    this.mode = 'lobby';
    this.previewAngle = -.45;
    this.previewTargetAngle = -.45;
    this.previewPaint = '#dce3de';
    this.finish = 'gloss';
    this.quality = 'high';
    const gl = this.renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
    this.softwareRenderer = /swiftshader|llvmpipe|software/i.test(debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : '');
    if (this.softwareRenderer) { this.quality = 'low'; this.renderer.setPixelRatio(1); this.renderer.shadowMap.enabled = false; }
    this.resize();
    this.makeLights(); this.makeSky(); this.makeArena(); this.optimizeArena(); this.makePlatform();
    this.ball = createBall(); this.ball.visible = false; this.scene.add(this.ball);
    this.ballMarker = new THREE.Mesh(new THREE.RingGeometry(1.9, 2.03, 64), basic(0xe1efcd, { transparent: true, opacity: .5, depthWrite: false }));
    this.ballMarker.rotation.x = -Math.PI / 2; this.scene.add(this.ballMarker); this.ballMarker.visible = false;
    this.ballShadow = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 6.5), basic(0x000000, { map: GLOW, transparent: true, opacity: .8, depthWrite: false }));
    this.ballShadow.rotation.x = -Math.PI / 2; this.ballShadow.position.y = .026; this.scene.add(this.ballShadow); this.ballShadow.visible = false;
  }
  async load() {
    const draco = new DRACOLoader(); draco.setDecoderPath(assetUrl('draco/')); draco.setDecoderConfig({ type: 'wasm' });
    const loader = new GLTFLoader(); loader.setDRACOLoader(draco);
    const carPromise = loader.loadAsync(assetUrl('roadster-2026.glb'), e => this.onProgress?.(.15 + (e.total ? e.loaded / e.total : .6) * .6, 'Tesla Roadster 2026 · model 3D')).then(g => {
      this.template = g.scene; this.template.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(this.template); this.originalSize = bounds.getSize(new V()); this.originalCenter = bounds.getCenter(new V()); this.originalMinY = bounds.min.y;
      this.template.traverse(o => { if (o.isMesh) { this.carTexture = o.material.emissiveMap || o.material.map; this.carHasColor = !!o.geometry.attributes.color; o.geometry.computeVertexNormals(); } });
      this.onProgress?.(.82, 'Oświetlenie i ostatnie detale');
    });
    const hdrPromise = new RGBELoader().loadAsync(assetUrl('stadium-sunset.hdr')).then(t => {
      const pmrem = new THREE.PMREMGenerator(this.renderer); this.environmentMap = pmrem.fromEquirectangular(t).texture; this.scene.environment = this.environmentMap; this.scene.environmentIntensity = .55; t.dispose(); pmrem.dispose();
    }).catch(() => {});
    const lodPromises = ['roadster-game.glb','roadster-far.glb'].map((file,i) => loader.loadAsync(assetUrl(file)).then(g=>{ g.scene.traverse(o=>{if(o.isMesh)o.geometry.computeVertexNormals();}); if(i===0)this.gameTemplate=g.scene;else this.farTemplate=g.scene; }));
    await Promise.all([carPromise, hdrPromise, ...lodPromises]);
    this.preview = this.createCar(this.previewPaint, 0, true); this.scene.add(this.preview.root);
    this.preview.root.position.set(.35, .76, 0); this.preview.root.rotation.y = this.previewAngle;
    this.previewBall = createBall(1.25); this.previewBall.position.set(-3.6, 1.27, 1); this.scene.add(this.previewBall);
    this.onProgress?.(1, 'Gotowe. Widzimy się na boisku.');
  }
  makeLights() {
    this.scene.add(new THREE.HemisphereLight(0xc8ddf4, 0x293b25, 1.35));
    this.sun = new THREE.DirectionalLight(0xfff0d5, 2.1); this.sun.position.set(22, 38, 18); this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048); this.sun.shadow.camera.near = .5; this.sun.shadow.camera.far = 140;
    this.sun.shadow.camera.left = -16; this.sun.shadow.camera.right = 16; this.sun.shadow.camera.top = 16; this.sun.shadow.camera.bottom = -16;
    this.sun.shadow.normalBias = .04; this.sun.shadow.bias = -.0001; this.sun.shadow.radius = 3; this.scene.add(this.sun); this.scene.add(this.sun.target);
    const fill = new THREE.DirectionalLight(0xa1d5e2, 1.1); fill.position.set(-10, 13, -25); fill.userData.highQualityOnly=true; this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0xc7f99a, .6); rim.position.set(6, 4, -10); rim.userData.highQualityOnly=true; this.scene.add(rim);
    for (const s of [-1, 1]) { const l = new THREE.PointLight(s === 1 ? TEAM[0] : TEAM[1], 100, 35, 1.6); l.position.set(0, 7, s * 64); l.userData.highQualityOnly=true; this.scene.add(l); }
  }
  makeSky() {
    const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { zenith: { value: new THREE.Color('#101f29') }, horizon: { value: new THREE.Color('#5c7268') } },
      vertexShader: 'varying vec3 vSky; void main(){vSky=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'uniform vec3 zenith;uniform vec3 horizon;varying vec3 vSky;void main(){float h=normalize(vSky).y;vec3 c=mix(horizon,zenith,smoothstep(-.05,.8,h));c+=vec3(.18,.11,.045)*pow(max(0.,1.-abs(h)*3.),5.);gl_FragColor=vec4(c,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'
    })); this.scene.add(sky);
    // Distant architectural silhouette.
    const rand = rng(16); const mountainMat = basic(0x30443f);
    for (let i = 0; i < 42; i++) {
      const a = i / 42 * Math.PI * 2; const h = 18 + rand() * 36;
      const m = new THREE.Mesh(new THREE.ConeGeometry(18 + rand() * 15, h, 4), mountainMat);
      m.position.set(Math.sin(a) * 235, h * .26 - 13, Math.cos(a) * 235); m.rotation.y = rand() * 6; this.scene.add(m);
    }
  }
  makeArena() {
    const groundTex = canvasTexture(2048, 3072, (c, w, h) => {
      const random = rng(80); c.fillStyle = '#243b2c'; c.fillRect(0, 0, w, h);
      for (let z = 0; z < 16; z++) { c.fillStyle = z % 2 ? '#2b4432' : '#263e2d'; c.fillRect(0, z * h / 16, w, h / 16); }
      for (let i = 0; i < 180000; i++) { const a = random(); c.fillStyle = a > .5 ? '#92ad6320' : '#06160b30'; c.fillRect(random() * w, random() * h, .5 + random() * 1.5, 1 + random() * 3); }
      const px = x => (x / (FIELD.x * 2) + .5) * w, pz = z => (z / (FIELD.z * 2) + .5) * h;
      c.strokeStyle = '#c5d4ad8c'; c.lineWidth = 3;
      c.strokeRect(px(-38), pz(-60), px(38) - px(-38), pz(60) - pz(-60));
      c.beginPath(); c.moveTo(px(-38), h / 2); c.lineTo(px(38), h / 2); c.stroke();
      c.beginPath(); c.ellipse(w / 2, h / 2, 12 * w / 84, 12 * h / 128, 0, 0, Math.PI * 2); c.stroke();
      for (const s of [-1, 1]) {
        c.strokeRect(px(-20), pz(s === -1 ? -60 : 42), 40 * w / 84, 18 * h / 128);
        c.strokeRect(px(-13), pz(s === -1 ? -60 : 54), 26 * w / 84, 6 * h / 128);
        c.fillStyle = s === 1 ? '#c1ff42' : '#ff8857'; c.beginPath(); c.ellipse(w / 2, pz(s * 43), 2.4, 2.4, 0, 0, Math.PI * 2); c.fill();
        c.strokeStyle = s === 1 ? '#c1ff424d' : '#ff88574d'; c.lineWidth = 5; c.beginPath(); c.moveTo(px(-37), pz(s * 59.7)); c.lineTo(px(37), pz(s * 59.7)); c.stroke();
      }
      c.fillStyle = '#d4e3bd'; c.beginPath(); c.arc(w / 2, h / 2, 3.5, 0, 7); c.fill();
      c.save(); c.translate(w / 2, h / 2); c.rotate(-Math.PI / 2); c.font = '800 italic 190px Barlow'; c.textAlign = 'center'; c.strokeStyle = '#d3e5b21a'; c.lineWidth = 2; c.strokeText('RL', 0, 60); c.restore();
    });
    groundTex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(84, 128), standard(0xffffff, { map: groundTex, roughness: .98 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; this.scene.add(floor);
    this.scene.add(box(120, .5, 160, standard(0x18271f), 0, -.5, 0));
    const rampMat = standard(0x24342a, { metalness: .15, roughness: .72 });
    for (const s of [-1, 1]) {
      const ramp = this.rampMesh(s, 'x', 128, rampMat); this.scene.add(ramp);
      for (const side of [-1, 1]) { const endRamp = this.rampMesh(s, 'z', 29, rampMat); endRamp.position.x = side * 27.5; this.scene.add(endRamp); }
    }
    const netTex = canvasTexture(128, 128, c => { c.strokeStyle = '#d9edcc'; c.lineWidth = .9; c.beginPath(); for (let i = 0; i <= 128; i += 32) { c.moveTo(i, 0); c.lineTo(i, 128); c.moveTo(0, i); c.lineTo(128, i); } c.stroke(); }); netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping;
    const netSide = netTex.clone(); netSide.repeat.set(27, 5); netSide.needsUpdate = true;
    const wallMat = basic(0xa9c5ac, { map: netSide, transparent: true, opacity: .11, side: THREE.DoubleSide, depthWrite: false });
    const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x99c9b9, transparent: true, opacity: .045, roughness: .1, metalness: .25, side: THREE.DoubleSide, depthWrite: false });
    for (const s of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(128, 23), wallMat); wall.rotation.y = Math.PI / 2; wall.position.set(s * 42, 16.5, 0); this.scene.add(wall);
      const glass = wall.clone(); glass.material = glassMat; this.scene.add(glass);
      for (const t of [-1, 1]) {
        const endWall = new THREE.Mesh(new THREE.PlaneGeometry(29, 28), wallMat); endWall.position.set(t * 27.5, 14, s * 64); this.scene.add(endWall);
      }
      const topNet = new THREE.Mesh(new THREE.PlaneGeometry(26, 18), wallMat); topNet.position.set(0, 19, s * 64); this.scene.add(topNet);
      for (let z = -64; z <= 64; z += 16) this.scene.add(box(.12, 23.2, .12, standard(0x4f6557, { metalness: .8 }), s * 42.15, 16.5, z));
      for (const t of [-1, 1]) {
        const ledMat = basic(t === 1 ? TEAM[0] : TEAM[1]);
        this.scene.add(box(.11, .1, 63.5, ledMat, s * 42.05, 5.1, t * 32));
        this.scene.add(box(.08, .06, 63.5, basic(0xb9d3ab), s * 42.2, 28, t * 32));
      }
      this.makeGoal(s, netTex);
    }
    this.makeStands(); this.makeBanners(); this.makeFloodlights();
  }
  optimizeArena() {
    // Static scenery is batched into two vertex-coloured meshes, keeping draw calls low.
    this.scene.updateMatrixWorld(true);
    for (const kind of ['MeshStandardMaterial', 'MeshBasicMaterial']) {
      const geometries = [], originals = [];
      this.scene.traverse(o => {
        if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material) || o.material.type !== kind || o.material.map || o.material.transparent) return;
        let g = o.geometry.clone(); if (g.index) g = g.toNonIndexed();
        g.applyMatrix4(o.matrixWorld);
        for (const name of Object.keys(g.attributes)) if (!['position', 'normal'].includes(name)) g.deleteAttribute(name);
        const colors = new Float32Array(g.attributes.position.count * 3), c = o.material.color;
        for(let i=0;i<colors.length;i+=3) { colors[i]=c.r; colors[i+1]=c.g; colors[i+2]=c.b; }
        g.setAttribute('color',new THREE.BufferAttribute(colors,3));
        if (!g.attributes.normal) g.computeVertexNormals(); geometries.push(g); originals.push(o);
      });
      if (!geometries.length) continue;
      const merged = mergeGeometries(geometries, false), mat = kind === 'MeshBasicMaterial' ? new THREE.MeshBasicMaterial({vertexColors:true}) : new THREE.MeshStandardMaterial({vertexColors:true,roughness:.76,metalness:.15,side:THREE.DoubleSide});
      const mesh = new THREE.Mesh(merged,mat); mesh.receiveShadow = kind !== 'MeshBasicMaterial';
      originals.forEach(o=>o.parent.remove(o)); this.scene.add(mesh); geometries.forEach(g=>g.dispose());
    }
  }
  rampMesh(sign, axis, span, material) {
    const pos = [], uvs = [], indices = []; const N = 24;
    for (let i = 0; i <= N; i++) {
      const a = i / N * Math.PI / 2; const edge = (axis === 'x' ? FIELD.x : FIELD.z) - 5 + 5 * Math.sin(a), y = 5 - 5 * Math.cos(a);
      if (axis === 'x') pos.push(sign * edge, y, -span / 2, sign * edge, y, span / 2);
      else pos.push(-span / 2, y, sign * edge, span / 2, y, sign * edge);
      uvs.push(0, i / N, 1, i / N);
      if (i < N) { const k = i * 2; indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(indices); g.computeVertexNormals();
    const mat = material.clone(); mat.side = THREE.DoubleSide; const m = new THREE.Mesh(g, mat); m.receiveShadow = true; return m;
  }
  makeGoal(sign, gridTexture) {
    const color = sign === 1 ? TEAM[0] : TEAM[1]; const dark = standard(0x1d3027, { metalness: .6, roughness: .4 }); const neon = basic(color);
    const group = new THREE.Group(); group.position.z = sign * 64;
    for (const x of [-13, 13]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(.22, .22, 10.5, 10), neon); post.position.set(x, 5.15, 0); group.add(post);
      group.add(box(.55, 10.6, .55, dark, x, 5.15, .25 * sign));
    }
    group.add(box(26.3, .3, .25, neon, 0, 10.35, 0)); group.add(box(27, .5, .65, dark, 0, 10.6, .25 * sign));
    const tex = gridTexture.clone(); tex.repeat.set(8, 3); tex.needsUpdate = true;
    const net = basic(color, { map: tex, transparent: true, opacity: .38, side: THREE.DoubleSide, depthWrite: false });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(26, 10), net); back.position.set(0, 5, sign * 8.7); group.add(back);
    for (const x of [-13, 13]) { const side = new THREE.Mesh(new THREE.PlaneGeometry(9, 10), net); side.rotation.y = Math.PI / 2; side.position.set(x, 5, sign * 4.5); group.add(side); }
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(26, 9), net); roof.rotation.x = Math.PI / 2; roof.position.set(0, 10.1, sign * 4.5); group.add(roof);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(26, 9), standard(color, { emissive: color, emissiveIntensity: .15, metalness: .4, roughness: .6 })); floor.rotation.x = -Math.PI / 2; floor.position.set(0, -.01, sign * 4.5); group.add(floor);
    for (const x of [-9, -3, 3, 9]) group.add(box(.05, .03, 8, basic(color, { transparent: true, opacity: .4 }), x, .025, sign * 4.5));
    this.scene.add(group);
  }
  makeStands() {
    const concrete = standard(0x233229), stepMat = standard(0x344239, { metalness: .2 }); const seats = standard(0x627257, { roughness: .8 });
    for (const s of [-1, 1]) {
      for (let row = 0; row < 9; row++) {
        const x = s * (46 + row * 1.35), y = row * .85 + .7;
        this.scene.add(box(1.4, .9, 146, concrete, x, y, 0)); this.scene.add(box(.35, .55, 146, stepMat, x - s * .4, y + .6, 0));
      }
      for (let row = 0; row < 7; row++) this.scene.add(box(107, .9, 1.5, concrete, 0, row * .8 + 1, s * (78 + row * 1.4)));
      this.scene.add(box(.2, .12, 150, basic(0xc8dab3), s * 58.2, 9.8, 0));
    }
    const count = 2300, crowd = new THREE.InstancedMesh(new THREE.BoxGeometry(.38, .7, .38), seats, count); const random = rng(123), obj = new THREE.Object3D(), color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const side = i % 2 ? 1 : -1; const row = Math.floor(random() * 8);
      if (i < 1600) obj.position.set(side * (46 + row * 1.35), row * .85 + 1.7 + random() * .2, (random() - .5) * 142);
      else obj.position.set((random() - .5) * 103, row * .8 + 1.9, side * (78 + Math.min(row, 6) * 1.4));
      obj.scale.set(1, .7 + random() * .5, 1); obj.updateMatrix(); crowd.setMatrixAt(i, obj.matrix);
      color.setHSL(.19 + random() * .23, .1 + random() * .28, .15 + random() * .25); if (random() > .92) color.set(i % 2 ? TEAM[0] : TEAM[1]); crowd.setColorAt(i, color);
    }
    this.scene.add(crowd);
    const railMat = standard(0x647460, { metalness: .75, roughness: .3 });
    for (const z of [-79, 79]) {
      const points = []; for (let i = 0; i <= 36; i++) { const x = -61 + i / 36 * 122; points.push(new V(x, 36 - x * x * .006, z)); }
      this.scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 48, .27, 6, false), railMat));
      const strip = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => p.clone().add(new V(0, -.4, 0)))), 48, .055, 4, false), basic(0xceebbd)); this.scene.add(strip);
    }
  }
  makeBanners() {
    const tex = canvasTexture(2048, 128, (c, w, h) => { c.fillStyle = '#111e16'; c.fillRect(0, 0, w, h); c.fillStyle = '#bdec50'; c.font = '800 56px Barlow'; c.textBaseline = 'middle'; c.fillText('ROADSTER LIGUE', 60, 64); c.fillStyle = '#91a783'; c.font = '700 25px Manrope'; c.fillText('// HIGH VOLTAGE FOOTBALL', 540, 64); c.fillStyle = '#bdec50'; c.font = '800 56px Barlow'; c.fillText('BOOST. FLIP. SCORE.', 1210, 64); c.fillStyle = '#bdec50'; c.fillRect(0, 0, w, 3); });
    const mat = basic(0xffffff, { map: tex, side: THREE.DoubleSide });
    for (const s of [-1, 1]) {
      for (const z of [-37, 37]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(57, 3.4), mat); m.rotation.y = s === 1 ? -Math.PI / 2 : Math.PI / 2; m.position.set(s * 44.6, 3.6, z); this.scene.add(m); }
      const m = new THREE.Mesh(new THREE.PlaneGeometry(50, 3.1), mat); m.rotation.y = s === 1 ? Math.PI : 0; m.position.set(0, 9.1, s * 81); this.scene.add(m);
    }
  }
  makeFloodlights() {
    const steel = standard(0x46534a, { metalness: .8 }), lamp = basic(0xf3ffe9); const lightBack = standard(0x344339);
    for (const x of [-60, 60]) for (const z of [-55, -18, 18, 55]) {
      this.scene.add(box(.4, 31, .4, steel, x, 15.5, z));
      const group = new THREE.Group(); group.position.set(x, 31, z); group.rotation.z = x > 0 ? -.2 : .2;
      group.add(box(1.4, 2.2, 6.6, lightBack));
      for (let i = 0; i < 5; i++) group.add(box(1.5, .25, .7, lamp, 0, -.7 + i * .35, 0));
      group.add(box(1.5, .8, 6.2, lamp, 0, -.4, 0)); this.scene.add(group);
    }
  }
  makePlatform() {
    this.platform = new THREE.Group();
    const circle = new THREE.Mesh(new THREE.CylinderGeometry(7.4, 7.4, .14, 96), standard(0x202b23, { roughness: .76, metalness: .12 })); circle.position.y = -.04; circle.receiveShadow = true; this.platform.add(circle);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(7.31, .025, 6, 128), basic(0xa5d43b)); ring.rotation.x = -Math.PI / 2; ring.position.y = .04; this.platform.add(ring);
    const fine = new THREE.Mesh(new THREE.RingGeometry(6.9, 6.91, 96), basic(0x80976d, { transparent: true, opacity: .3 })); fine.rotation.x = -Math.PI / 2; fine.position.y = .038; this.platform.add(fine);
    const random = rng(1); const geo = new THREE.BufferGeometry(), positions = [];
    for (let i = -6; i <= 6; i++) { const len = Math.sqrt(49 - i * i); positions.push(-len, .035, i, len, .035, i, i, .035, -len, i, .035, len); }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); this.platform.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x8ea779, transparent: true, opacity: .075 })));
    this.scene.add(this.platform);
  }
  createCar(paint = '#c1ff42', team = 0, preview = false) {
    const root = new THREE.Group();
    let model;
    if(preview) model=this.template.clone(true);
    else { model=new THREE.LOD();model.addLevel((this.gameTemplate||this.template).clone(true),0);model.addLevel((this.farTemplate||this.gameTemplate||this.template).clone(true),24); }
    const scale = 4.95 / this.originalSize.z; model.scale.setScalar(scale);
    model.position.set(-this.originalCenter.x * scale, -this.originalMinY * scale - .76, -this.originalCenter.z * scale);
    const material = this.makeCarMaterial(paint);
    model.traverse(o => { if (o.isMesh) { o.material = material; o.castShadow = true; o.receiveShadow = true; } }); root.add(model);
    const teamColor = TEAM[team];
    const underglow = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 6.8), basic(teamColor, { map: GLOW, transparent: true, opacity: preview ? .35 : .5, depthWrite: false, blending: THREE.AdditiveBlending })); underglow.rotation.x = -Math.PI / 2; underglow.position.y = -.7; root.add(underglow);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 6.3), basic(0x000000, { map: GLOW, transparent: true, opacity: .85, depthWrite: false })); shadow.rotation.x = -Math.PI / 2; shadow.position.y = -.72; root.add(shadow);
    // Gameplay light bars and cold-gas ports are original additions to the community mesh.
    const lightGeoA = new THREE.BoxGeometry(1.6,.035,.04).translate(0,-.13,2.26), lightGeoB = new THREE.BoxGeometry(1.58,.035,.035).translate(0,.01,-2.3);
    [lightGeoA,lightGeoB].forEach((g,i)=>{const c=new THREE.Color(i?0xff4438:0xe6fff0), a=new Float32Array(g.attributes.position.count*3);for(let j=0;j<a.length;j+=3){a[j]=c.r;a[j+1]=c.g;a[j+2]=c.b;}g.setAttribute('color',new THREE.BufferAttribute(a,3));});
    root.add(new THREE.Mesh(mergeGeometries([lightGeoA,lightGeoB]),new THREE.MeshBasicMaterial({vertexColors:true})));
    const jets = new THREE.Group(); jets.position.set(0, -.2, -2.24);
    const nozzleGeos=[], flameGeos=[], coreGeos=[];
    for (const x of [-.67, -.23, .23, .67]) {
      nozzleGeos.push(new THREE.CylinderGeometry(.09,.11,.16,8).rotateX(Math.PI/2).translate(x,0,0));
      flameGeos.push(new THREE.ConeGeometry(.115,1.6,8,1,true).rotateX(-Math.PI/2).translate(x,0,-.82));
      coreGeos.push(new THREE.ConeGeometry(.055,1.05,6).rotateX(-Math.PI/2).translate(x,0,-.5));
    }
    jets.add(new THREE.Mesh(mergeGeometries(nozzleGeos),standard(0x151e21,{metalness:.7,roughness:.35})));
    const flame=new THREE.Mesh(mergeGeometries(flameGeos),basic(teamColor,{transparent:true,opacity:.8,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));flame.name='flame';jets.add(flame);
    const core=new THREE.Mesh(mergeGeometries(coreGeos),basic(0xeffff2,{transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false}));core.name='flame';jets.add(core);
    root.add(jets);
    jets.children.forEach(c => { if (c.name === 'flame') c.visible = false; });
    return { root, model, material, jets, underglow, shadow, setPaint: color => { material.userData.paint.value.set(color); }, setFinish: name => { if(material.isMeshPhysicalMaterial){material.roughness=name==='matte'?.8:name==='satin'?.4:.19;material.clearcoat=name==='matte'?.1:name==='satin'?.45:1;}else{material.shininess=name==='matte'?2:name==='satin'?24:85;} }, setBoost: (on, time = 0) => { jets.children.forEach(c => { if (c.name === 'flame') { c.visible = on; c.scale.z = .8 + Math.sin(time * 65 + c.position.x) * .16; } }); } };
  }
  makeCarMaterial(paint) {
    const options={map:this.carTexture||null,vertexColors:!!this.carHasColor,color:0xffffff,metalness:.4,roughness:.23,envMapIntensity:.8,side:THREE.FrontSide};
    const mat=this.quality==='low'?new THREE.MeshPhongMaterial({map:options.map,vertexColors:options.vertexColors,color:0xffffff,specular:0x778879,shininess:75,side:THREE.FrontSide}):new THREE.MeshPhysicalMaterial({...options,clearcoat:1,clearcoatRoughness:.16});
    const uniform = { value: new THREE.Color(paint) }; mat.userData.paint = uniform;
    mat.onBeforeCompile = shader => {
      shader.uniforms.uBodyPaint = uniform;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRawCarPosition;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRawCarPosition = position;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uBodyPaint; varying vec3 vRawCarPosition;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
        float carPaintMask=0.;
        vec4 texelCar=diffuseColor;
        #ifdef USE_MAP
          texelCar*=texture2D(map,vMapUv);
        #endif
        float lumCar=dot(texelCar.rgb,vec3(.2126,.7152,.0722));
        float satCar=max(texelCar.r,max(texelCar.g,texelCar.b))-min(texelCar.r,min(texelCar.g,texelCar.b));
        float whA=1.-smoothstep(.136,.167,length(vRawCarPosition.yz-vec2(.14,.537)));
        float whB=1.-smoothstep(.136,.167,length(vRawCarPosition.yz-vec2(.14,-.638)));
        float wh=max(whA,whB)*smoothstep(.22,.31,abs(vRawCarPosition.x));
        carPaintMask=smoothstep(.11,.34,lumCar)*(1.-smoothstep(.07,.25,satCar))*(1.-wh);
        diffuseColor=vec4(mix(texelCar.rgb,uBodyPaint*clamp(lumCar/.72,.22,1.18),carPaintMask),texelCar.a);
      `).replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor=mix(.57,roughnessFactor,carPaintMask);').replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor=mix(.18,metalnessFactor,carPaintMask);');
    }; mat.customProgramCacheKey = () => 'roadster-ligue-body-paint-2026-v1'; return mat;
  }
  setMode(mode) {
    this.mode = mode; const lobby = mode === 'lobby';
    if(this.softwareRenderer&&this.quality==='low')this.renderer.setPixelRatio(lobby?Math.min(1,1100/innerWidth):Math.min(.7,600/innerWidth));
    this.preview?.root && (this.preview.root.visible = lobby); if (this.previewBall) this.previewBall.visible = lobby;
    this.platform.visible = lobby; this.ball.visible = !lobby; this.ballMarker.visible = !lobby; this.ballShadow.visible = !lobby;
    const c = this.sun.shadow.camera; c.left = c.bottom = lobby ? -16 : -47; c.right = c.top = lobby ? 16 : 47; c.updateProjectionMatrix();
    if (lobby) { this.sun.position.set(22,38,18); this.sun.target.position.set(0,0,0); }
    this.resize();
  }
  setQuality(quality) {
    this.quality = quality;
    this.renderer.setPixelRatio(quality==='low'&&this.softwareRenderer?(this.mode==='lobby'?Math.min(1,1100/innerWidth):Math.min(.7,600/innerWidth)):Math.min(devicePixelRatio,quality==='low'?1:1.7));
    this.renderer.shadowMap.enabled = quality !== 'low';
    const cache=new Map();
    this.scene.traverse(o=>{
      if(o.isLight&&o.userData.highQualityOnly)o.visible=quality!=='low';
      if(o.isMesh&&o.material?.isMeshPhysicalMaterial&&o.material.transparent&&o.material.opacity<.1)o.visible=quality!=='low';
      if(!o.isMesh||Array.isArray(o.material))return;
      if(quality==='low'&&o.material.isMeshStandardMaterial&&!o.material.isMeshPhysicalMaterial&&!o.userData.originalMaterial){
        const original=o.material;o.userData.originalMaterial=original;
        if(!cache.has(original))cache.set(original,new THREE.MeshLambertMaterial({map:original.map,color:original.color,vertexColors:original.vertexColors,side:original.side,transparent:original.transparent,opacity:original.opacity,depthWrite:original.depthWrite,emissive:original.emissive,emissiveIntensity:original.emissiveIntensity}));
        o.material=cache.get(original);
      }else if(quality!=='low'&&o.userData.originalMaterial){o.material=o.userData.originalMaterial;delete o.userData.originalMaterial;}
    });
    this.resize();
  }
  resize() {
    const w = this.container.clientWidth || innerWidth, h = this.container.clientHeight || innerHeight;
    this.camera.aspect = w / h; this.renderer.setSize(w, h);
    if (this.mode === 'lobby') this.camera.setViewOffset(w, h, -w * (w < 601 ? .33 : .205), 0, w, h); else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }
  updateLobby(dt, time, garage = false) {
    if (!this.preview) return;
    this.previewAngle = THREE.MathUtils.damp(this.previewAngle, this.previewTargetAngle, 8, dt);
    this.preview.root.rotation.y = this.previewAngle + (garage ? 0 : Math.sin(time * .17) * .035);
    this.preview.root.position.y = .76;
    this.preview.setBoost(false); this.previewBall.rotation.y += this.reducedEffects ? 0 : dt * .07;
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, innerWidth < 601 ? 47 : 40, 5, dt); this.camera.updateProjectionMatrix();
    const mobile = innerWidth < 601;
    this.camera.position.lerp(new V(mobile ? 7.8 : 7.5, mobile ? 3.65 : 3.5, mobile ? 10.2 : 9.2), 1 - Math.exp(-dt * 4));
    this.camera.lookAt(.1, .38, 0);
  }
  render() { this.renderer.render(this.scene, this.camera); }
}

export function createBall(radius = 1.85) {
  const root = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.SphereGeometry(radius * .90, 32, 24), standard(0x172326, { metalness: .5, roughness: .35 })));
  const ico = new THREE.IcosahedronGeometry(1, 0); const a = ico.attributes.position; const vertices = [], faces = [], ids = new Map();
  for (let i = 0; i < a.count; i += 3) { const face = []; for (let k = 0; k < 3; k++) { const p = new V().fromBufferAttribute(a, i + k); const key = p.toArray().map(v => v.toFixed(4)).join(','); if (!ids.has(key)) { ids.set(key, vertices.length); vertices.push(p); } face.push(ids.get(key)); } faces.push(face); }
  const neighbors = vertices.map(() => new Set()); faces.forEach(f => { f.forEach((v, i) => { neighbors[v].add(f[(i + 1) % 3]); neighbors[v].add(f[(i + 2) % 3]); }); });
  const panels = [], colors = [];
  function panel(points, color) {
    points = points.map(p => p.clone().normalize().multiplyScalar(radius));
    let center = new V(); points.forEach(p => center.add(p)); center.divideScalar(points.length);
    const normal = center.clone().normalize(), ref = points[0].clone().sub(center).normalize(), cross = new V().crossVectors(normal, ref);
    points.sort((a, b) => Math.atan2(a.clone().sub(center).dot(cross), a.clone().sub(center).dot(ref)) - Math.atan2(b.clone().sub(center).dot(cross), b.clone().sub(center).dot(ref)));
    const inset = points.map(p => p.clone().lerp(center, .035));
    const col = new THREE.Color(color);
    for (let i = 0; i < inset.length; i++) { const tri = [center, inset[i], inset[(i + 1) % inset.length]]; tri.forEach(p => { panels.push(p.x, p.y, p.z); colors.push(col.r, col.g, col.b); }); }
  }
  faces.forEach(f => { const pts = []; for (let i = 0; i < 3; i++) { const u = vertices[f[i]], v = vertices[f[(i + 1) % 3]]; pts.push(u.clone().multiplyScalar(2).add(v).divideScalar(3), u.clone().add(v.clone().multiplyScalar(2)).divideScalar(3)); } panel(pts, 0xe3e9dd); });
  neighbors.forEach((ns, i) => { const p = vertices[i]; panel([...ns].map(n => p.clone().multiplyScalar(2).add(vertices[n]).divideScalar(3)), 0x263339); });
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(panels, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, metalness: .12, roughness: .55, side: THREE.DoubleSide })); mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh);
  return root;
}

export function makeBoostPad(scene, x, z, large = false) {
  const key=large?'largeBoostBatch':'smallBoostBatch'; scene.userData.boostBatches ||= {};
  let batch=scene.userData.boostBatches[key];
  if(!batch){
    const capacity=32, group=new THREE.Group(), color=0xf4bd47;
    const instance=(geo,mat)=>{const m=new THREE.InstancedMesh(geo,mat,capacity);m.count=0;m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);m.frustumCulled=false;group.add(m);return m;};
    const base=instance(new THREE.CylinderGeometry(large?1.55:.72,large?1.6:.77,.055,20),standard(0x333f2c,{metalness:.4,roughness:.6}));
    const ring=instance(new THREE.TorusGeometry(large?1.28:.57,large?.065:.035,4,24).rotateX(Math.PI/2),basic(0xffffff));
    const core=instance(large?new THREE.OctahedronGeometry(.55):new THREE.CylinderGeometry(.24,.36,.18,6),basic(0xffd580));
    const glow=instance(new THREE.PlaneGeometry(large?5.5:2.7,large?5.5:2.7).rotateX(-Math.PI/2),basic(color,{map:GLOW,transparent:true,opacity:.55,depthWrite:false,blending:THREE.AdditiveBlending}));
    batch={group,base,ring,core,glow,count:0};scene.userData.boostBatches[key]=batch;scene.add(group);
  }
  const id=batch.count++, obj=new THREE.Object3D(); for(const m of [batch.base,batch.ring,batch.core,batch.glow])m.count=batch.count;
  const matrix=(m,y,scale=1,rotation=0)=>{obj.position.set(x,y,z);obj.rotation.set(0,rotation,0);obj.scale.setScalar(scale);obj.updateMatrix();m.setMatrixAt(id,obj.matrix);m.instanceMatrix.needsUpdate=true;};
  matrix(batch.base,.035);matrix(batch.ring,.075);batch.ring.setColorAt(id,new THREE.Color(0xf4bd47));batch.ring.instanceColor.needsUpdate=true;
  const pad={group:batch.group,large,x,z,timer:0,lastReady:null,update(dt,time){
    if(this.timer>0)this.timer=Math.max(0,this.timer-dt);const ready=this.timer<=0;
    matrix(batch.core,large?1.1+Math.sin(time*2.4+x)*.12:.235,ready?1:0,large?time*1.6:0);
    matrix(batch.glow,.09,ready?1:0);
    if(ready!==this.lastReady){batch.ring.setColorAt(id,new THREE.Color(ready?0xf4bd47:0x514631));batch.ring.instanceColor.needsUpdate=true;this.lastReady=ready;}
  }};
  pad.update(0,0);return pad;
}
