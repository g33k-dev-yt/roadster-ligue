import * as THREE from 'three';

export class Particles {
  constructor(scene, count = 1800) {
    this.count = count; this.next = 0; this.items = new Array(count).fill(0).map(() => ({ life: 0, maxLife: 1, x: 0, y: -100, z: 0, vx: 0, vy: 0, vz: 0, size: 0, r: 0, g: 0, b: 0, drag: 2, gravity: 2 }));
    this.positions = new Float32Array(count * 3); this.colors = new Float32Array(count * 3); this.sizes = new Float32Array(count); this.alpha = new Float32Array(count);
    this.positions.fill(-1000);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage)); geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage)); geo.setAttribute('pointSize', new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage)); geo.setAttribute('pointAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry = geo;
    this.mesh = new THREE.Points(geo, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true, uniforms: { pixelRatio: { value: Math.min(devicePixelRatio, 1.7) } }, vertexShader: 'attribute float pointSize;attribute float pointAlpha;varying vec3 vCol;varying float vAlpha;uniform float pixelRatio;void main(){vCol=color;vAlpha=pointAlpha;vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=clamp(pointSize*220.*pixelRatio/ max(1.,-mv.z),0.,90.);gl_Position=projectionMatrix*mv;}', fragmentShader: 'varying vec3 vCol;varying float vAlpha;void main(){float d=length(gl_PointCoord-.5)*2.;float a=pow(max(0.,1.-d),1.7)*vAlpha;if(a<.01)discard;gl_FragColor=vec4(vCol,a);}' }));
    this.mesh.frustumCulled = false; scene.add(this.mesh);
  }
  emit(pos, vel, color, size = .4, life = .6, spread = 1, gravity = 2) {
    if (this.reduced) return;
    const p = this.items[this.next++ % this.count], c = new THREE.Color(color);
    Object.assign(p, { x: pos.x, y: pos.y, z: pos.z, vx: vel.x + (Math.random() - .5) * spread, vy: vel.y + (Math.random() - .5) * spread, vz: vel.z + (Math.random() - .5) * spread, r: c.r, g: c.g, b: c.b, life, maxLife: life, size, gravity, drag: gravity < 0 ? .6 : 2 });
  }
  burst(pos, color, n = 80, power = 13) {
    for (let i = 0; i < n; i++) { const v = new THREE.Vector3(Math.random() - .5, Math.random() - .3, Math.random() - .5).normalize().multiplyScalar((.25 + Math.random() * .75) * power); this.emit(pos, v, i % 6 === 0 ? 0xffffff : color, .15 + Math.random() * .65, .5 + Math.random() * 1.2, 1, 7); }
  }
  goal(pos, color) { this.burst(pos, color, 450, 37); for (let i = 0; i < 140; i++) { const a = i / 140 * Math.PI * 2; this.emit(pos, { x: Math.cos(a) * 32, y: Math.sin(a) * 32 + 2, z: 0 }, color, .9, 1.3, .3, 0); } }
  update(dt) {
    for (let i = 0; i < this.count; i++) {
      const p = this.items[i], j = i * 3;
      if (p.life <= 0) { this.sizes[i] = 0; continue; }
      p.life -= dt; const drag = Math.exp(-p.drag * dt); p.vx *= drag; p.vz *= drag; p.vy -= p.gravity * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < .03 && p.gravity > 0) { p.y = .03; p.vy *= -.3; }
      this.positions[j] = p.x; this.positions[j + 1] = p.y; this.positions[j + 2] = p.z; this.colors[j] = p.r; this.colors[j + 1] = p.g; this.colors[j + 2] = p.b;
      const t = Math.max(0, p.life / p.maxLife); this.sizes[i] = p.size * (.4 + .6 * t); this.alpha[i] = t * .9;
    }
    for (const a of Object.values(this.geometry.attributes)) a.needsUpdate = true;
  }
  clear() { this.items.forEach(p => p.life = 0); this.sizes.fill(0); this.geometry.attributes.pointSize.needsUpdate = true; }
}

export class GameAudio {
  constructor() { this.enabled = true; this.volume = .4; this.active = false; this.ctx = null; }
  async init() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      this.ctx = new AC(); this.master = this.ctx.createGain(); this.master.gain.value = this.volume; this.master.connect(this.ctx.destination);
      this.engine = this.ctx.createOscillator(); this.engine.type = 'sawtooth'; this.engine.frequency.value = 60;
      this.engineFilter = this.ctx.createBiquadFilter(); this.engineFilter.type = 'lowpass'; this.engineFilter.frequency.value = 260;
      this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0; this.engine.connect(this.engineFilter); this.engineFilter.connect(this.engineGain); this.engineGain.connect(this.master); this.engine.start();
      const n = this.ctx.sampleRate * 2, buffer = this.ctx.createBuffer(1, n, this.ctx.sampleRate), data = buffer.getChannelData(0); for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
      this.noise = this.ctx.createBufferSource(); this.noise.buffer = buffer; this.noise.loop = true;
      const filter = this.ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 950; filter.Q.value = .4;
      this.boostGain = this.ctx.createGain(); this.boostGain.gain.value = 0; this.noise.connect(filter); filter.connect(this.boostGain); this.boostGain.connect(this.master); this.noise.start();
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume(); this.applyVolume();
  }
  applyVolume() { if (this.ctx) this.master.gain.setTargetAtTime(this.enabled ? this.volume : 0, this.ctx.currentTime, .08); }
  toggle() { this.enabled = !this.enabled; this.applyVolume(); return this.enabled; }
  setVolume(value) { this.volume = value; this.applyVolume(); }
  tone(freq, dur, gain = .2, type = 'sine', endFreq = null, delay = 0) {
    if (!this.ctx || !this.enabled) return; const t = this.ctx.currentTime + delay, osc = this.ctx.createOscillator(), g = this.ctx.createGain(); osc.type = type; osc.frequency.setValueAtTime(freq, t); if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 1), t + dur); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + .008); g.gain.exponentialRampToValueAtTime(.001, t + dur); osc.connect(g); g.connect(this.master); osc.start(t); osc.stop(t + dur + .01);
  }
  beep(go = false) { this.tone(go ? 880 : 440, go ? .38 : .15, .16, 'sine'); }
  hit(strength = .5) { this.tone(110 + strength * 130, .17, Math.min(.35, strength * .25), 'triangle', 38); this.tone(1250, .035, .06 * strength, 'sine', 220); }
  jump(double = false) { this.tone(double ? 420 : 210, .18, .09, 'triangle', double ? 700 : 520); }
  pickup(big = false) { this.tone(big ? 620 : 900, .13, .09, 'sine', 1600); if (big) this.tone(1200, .2, .08, 'sine', 1900, .06); }
  goal() { [261.63, 329.63, 392, 523.25].forEach((f, i) => this.tone(f, 1.2, .11, 'triangle', null, i * .075)); this.tone(70, 1, .2, 'sine', 25); }
  demo() { this.tone(90, .8, .35, 'sawtooth', 20); this.tone(170, .3, .2, 'triangle', 30); }
  update(speed = 0, boost = false, throttle = 0, playing = true) {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this.engine.frequency.setTargetAtTime(44 + speed * 3.4 + Math.abs(throttle) * 20, t, .1); this.engineFilter.frequency.setTargetAtTime(180 + speed * 9, t, .1);
    this.engineGain.gain.setTargetAtTime(playing ? .018 + Math.abs(throttle) * .035 + speed / 2000 : 0, t, .12);
    this.boostGain.gain.setTargetAtTime(playing && boost ? .095 : 0, t, .09);
  }
}
