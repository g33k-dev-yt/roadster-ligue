import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { FIELD, TEAM, makeBoostPad } from './visuals.js';
import { Vehicle, emptyInput } from './vehicle.js';
const Vec = CANNON.Vec3;
const clamp = THREE.MathUtils.clamp;
export class Game {
  constructor(visuals, audio, particles, hooks = {}) {
    this.visuals = visuals; this.audio = audio; this.particles = particles; this.hooks = hooks;
    this.world = new CANNON.World({ gravity: new Vec(0, -20, 0), allowSleep: true }); this.world.broadphase = new CANNON.SAPBroadphase(this.world); this.world.solver.iterations = 12;
    this.world.defaultContactMaterial.friction = .05; this.world.defaultContactMaterial.restitution = .15;
    this.world.defaultContactMaterial.contactEquationStiffness = 1e8; this.world.defaultContactMaterial.contactEquationRelaxation = 4;
    this.fieldMaterial = new CANNON.Material('arena'); this.carMaterial = new CANNON.Material('roadster'); this.ballMaterial = new CANNON.Material('ball');
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.fieldMaterial, this.carMaterial, { friction: .02, restitution: .02 }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.fieldMaterial, this.ballMaterial, { friction: .14, restitution: .72 }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.ballMaterial, this.carMaterial, { friction: .1, restitution: .63 }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.carMaterial, this.carMaterial, { friction: .1, restitution: .22 }));
    this.makePhysicsArena();
    this.ball = new CANNON.Body({ mass: 30, material: this.ballMaterial, shape: new CANNON.Sphere(1.85), position: new Vec(0, 1.87, 0), linearDamping: .085, angularDamping: .14, collisionFilterGroup: 4, collisionFilterMask: 7 }); this.ball.userData = { kind: 'ball' }; this.world.addBody(this.ball);
    this.ball.addEventListener('collide', e => { if (this.state !== 'playing' || e.body.mass !== 0) return; const impact = Math.abs(e.contact.getImpactVelocityAlongNormal()); if (impact > 4 && this.time - (this.lastBounce || -5) > .12) { this.lastBounce = this.time; this.audio.hit(Math.min(1, impact / 35)); } });
    this.pads = []; for (const x of [-30, 30]) for (const z of [-49, 49]) this.pads.push(makeBoostPad(visuals.scene, x, z, true)); for (const x of [-35, 35]) this.pads.push(makeBoostPad(visuals.scene, x, 0, true));
    for (const z of [-40, -24, 0, 24, 40]) for (const x of [-16, 16]) this.pads.push(makeBoostPad(visuals.scene, x, z)); for (const z of [-51, -33, -15, 15, 33, 51]) this.pads.push(makeBoostPad(visuals.scene, 0, z));
    this.pads.forEach(p => p.group.visible = false);
    this.state = 'lobby'; this.paused = false; this.cars = []; this.score = [0, 0]; this.time = 0; this.timeRemaining = 180; this.overtime = false; this.overtimeTime = 0; this.ballCam = true; this.shakeEnabled = true; this.shake = 0; this.accumulator = 0; this.replayBuffer = []; this.cameraDirection = new THREE.Vector3(0, 0, -1); this.cameraLook = new THREE.Vector3();
  }
  makePhysicsArena() {
    const addBox = (x, y, z, hx, hy, hz, axis = null, angle = 0) => { const b = new CANNON.Body({ mass: 0, material: this.fieldMaterial, shape: new CANNON.Box(new Vec(hx, hy, hz)), position: new Vec(x, y, z), collisionFilterGroup: 1, collisionFilterMask: 6 }); if (axis) b.quaternion.setFromAxisAngle(axis, angle); b.updateAABB(); this.world.addBody(b); return b; };
    addBox(0, -.5, 0, 100, .5, 110);
    for (const s of [-1, 1]) {
      addBox(s * 42.65, 16.5, 0, .65, 11.5, 65);
      for (const t of [-1, 1]) addBox(t * 27.85, 14, s * 64.65, 14.85, 14, .65);
      addBox(0, 19.25, s * 64.65, 13.1, 8.75, .65);
      addBox(0, 5, s * 73.5, 13.4, 5, .6);
      addBox(0, 10.55, s * 68.5, 13.5, .35, 4.6);
      for (const t of [-1, 1]) { addBox(t * 13.4, 5, s * 69, .4, 5, 4.5); addBox(t * 13.1, 5.15, s * 64, .25, 5.15, .3); }
      for (let i = 0; i < 14; i++) {
        const da = Math.PI / 2 / 14, a = (i + .5) * da, y = 5 - 5 * Math.cos(a), e = 37 + 5 * Math.sin(a), thick = .35, half = 5 * da / 2 + .035;
        const nx = -s * Math.sin(a), ny = Math.cos(a);
        addBox(s * e - nx * thick, y - ny * thick, 0, half, thick, 64.3, new Vec(0, 0, 1), s * a);
        const ez = 59 + 5 * Math.sin(a), nz = -s * Math.sin(a);
        for (const t of [-1, 1]) addBox(t * 27.7, y - ny * thick, s * ez - nz * thick, 14.3, thick, half, new Vec(1, 0, 0), -s * a);
      }
      for (const t of [-1, 1]) addBox(t * 40.4, 14, s * 62.4, 3.9, 14, .45, new Vec(0, 1, 0), t * s * Math.PI / 4);
    }
    addBox(0, 28.5, 0, 43, .5, 65);
  }
  start(options = {}) {
    this.cars.forEach(c => c.destroy()); this.cars = [];
    this.size = options.size || 2; this.difficulty = options.difficulty || 'pro'; this.freeplay = !!options.freeplay; this.score = [0, 0]; this.timeRemaining = 180; this.overtime = false; this.overtimeTime = 0; this.time = 0; this.paused = false; this.accumulator = 0; this.lastTouch = null; this.previousTouch = null; this.replayBuffer = []; this.lastCapture = 0; this.zeroAnnounced = false; this.oneMinute = false; this.jumpQueued = false; this.ballCam = true; this.goalFinal = false;
    this.visuals.setMode('game'); this.particles.clear(); this.pads.forEach(p => { p.group.visible = true; p.timer = 0; });
    const names = [['TY', 'AMPER', 'NOVA'], ['SPARK', 'BLAZE', 'ION']];
    for (let team = 0; team < (this.freeplay ? 1 : 2); team++) for (let i = 0; i < (this.freeplay ? 1 : this.size); i++) {
      const sign = team === 0 ? 1 : -1, x = i === 0 ? 0 : i === 1 ? -15 : 15, z = sign * (i === 0 ? 36 : 44), yaw = team === 0 ? Math.PI : 0;
      const car = new Vehicle(this, { id: `${team}-${i}`, name: names[team][i], team, isPlayer: team === 0 && i === 0, spawn: { x, z, yaw }, paint: team === 0 && i === 0 ? options.paint : team === 0 ? ['#c1ff42', '#a4c962', '#819e55'][i] : ['#ff8857', '#d9774c', '#e29c64'][i] });
      car.visual.setFinish(options.finish || 'gloss'); this.cars.push(car);
    }
    this.player = this.cars[0]; this.resetBall(); this.shake = 0;
    this.visuals.camera.clearViewOffset(); this.visuals.camera.position.set(0, 6, 48); this.cameraLook.set(0, 2, 15); this.visuals.camera.lookAt(this.cameraLook); this.cameraDirection.set(0, 0, -1);
    if (this.freeplay) { this.state = 'playing'; this.stateTime = 0; this.player.boost = 100; this.notify('SWOBODNY TRENING', '∞ DOPALACZA'); this.hooks.onCount?.(null); }
    else this.kickoff();
    this.hooks.onStart?.(this);
  }
  kickoff() {
    this.cars.forEach(c => { c.reset(c.spawn.x, c.spawn.z, c.spawn.yaw); c.boost = 34; }); this.resetBall(); this.pads.forEach(p => p.timer = 0);
    this.state = 'kickoff'; this.stateTime = 0; this.lastCount = 4; this.goUntil = -1; this.lastTouch = null; this.previousTouch = null; this.replayBuffer = [];
    this.hooks.onReplay?.(false); this.hooks.onGoalEnd?.();
  }
  resetBall() { this.ball.position.set(0, 1.87, 0); this.ball.velocity.setZero(); this.ball.angularVelocity.setZero(); this.ball.quaternion.set(0, 0, 0, 1); this.ball.force.setZero(); this.ball.aabbNeedsUpdate = true; this.ball.wakeUp(); }
  centerBall() { if (!this.freeplay) return; this.resetBall(); this.notify('PIŁKA NA ŚRODKU'); }
  leave() { this.state = 'lobby'; this.paused = false; this.cars.forEach(c => c.visual.root.visible = false); this.pads.forEach(p => p.group.visible = false); this.visuals.setMode('lobby'); this.audio.update(0, false, 0, false); this.particles.clear(); this.hooks.onCount?.(null); this.hooks.onReplay?.(false); }
  setPaused(value) { if (this.state === 'lobby' || this.state === 'ended') return; this.paused = value; this.audio.update(0, false, 0, false); this.hooks.onPause?.(value); }
  notify(title, points = '') { this.hooks.onNotify?.(title, points); }
  update(dt, input, realTime) {
    if (this.state === 'lobby' || this.state === 'ended' || this.paused) return;
    this.time += dt; this.stateTime += dt;
    this.pads.forEach(p => p.update(this.state === 'playing' ? dt : 0, realTime));
    if (this.state === 'kickoff') {
      const number = Math.ceil(3.15 - this.stateTime);
      if (number !== this.lastCount && number > 0) { this.lastCount = number; this.hooks.onCount?.(number); this.audio.beep(); }
      if (this.stateTime >= 3.15) { this.state = 'playing'; this.stateTime = 0; this.goUntil = this.time + .8; this.hooks.onCount?.('START!'); this.audio.beep(true); }
      this.syncVisuals(dt, realTime); this.updateCamera(dt, realTime); return;
    }
    if (this.state === 'goal') {
      if (input.jump && this.stateTime > .8) { this.finishGoal(); return; }
      const replay = this.stateTime > 1.25 && this.replayFrames?.length > 2;
      if (replay) {
        if (!this.replayStarted) { this.replayStarted = true; this.hooks.onReplay?.(true); this.hooks.onGoalEnd?.(); }
        const first = this.replayFrames[0], last = this.replayFrames[this.replayFrames.length - 1], t = Math.min(last.t, first.t + (this.stateTime - 1.25) * .8);
        this.applyReplay(t);
      }
      this.updateGoalCamera(dt, realTime);
      if (this.stateTime > 6) this.finishGoal();
      return;
    }
    if (this.goUntil > 0 && this.time > this.goUntil) { this.hooks.onCount?.(null); this.goUntil = -1; }
    this.jumpQueued = this.jumpQueued || input.jump;
    this.accumulator += dt; const fixed = 1 / 120; let steps = 0;
    while (this.accumulator >= fixed && steps < 60 && this.state === 'playing') {
      const playerInput = { ...input, jump: !!this.jumpQueued }; this.jumpQueued = false;
      const stepTime=this.time-this.accumulator+fixed;
      for (const car of this.cars) {
        if (!car.isPlayer && (!car.cachedAI || stepTime - (car.aiTick || 0) > .055)) { car.cachedAI = car.aiInput(stepTime); car.aiTick = stepTime; }
        const control = car.isPlayer ? playerInput : car.cachedAI;
        car.update(fixed, stepTime, control); if (!car.isPlayer) control.jump = false;
      }
      this.world.step(fixed); this.accumulator -= fixed; steps++;
      const ballSpeed = this.ball.velocity.length(); if (ballSpeed > 64) this.ball.velocity.scale(64 / ballSpeed, this.ball.velocity);
      this.checkPads(); this.checkBallAwards(); this.checkGoal();
      if (this.ball.position.y < -6 || Math.abs(this.ball.position.x) > 85 || Math.abs(this.ball.position.z) > 95) this.resetBall();
    }
    if (steps >= 60) this.accumulator = Math.min(this.accumulator, fixed);
    if (this.state === 'playing' && !this.freeplay) {
      if (this.overtime) this.overtimeTime += dt;
      else {
        this.timeRemaining = Math.max(0, this.timeRemaining - dt);
        if (this.timeRemaining <= 60 && !this.oneMinute) { this.oneMinute = true; this.notify('ZOSTAŁA MINUTA'); }
        if (this.timeRemaining <= 0) {
          if (!this.zeroAnnounced) { this.zeroAnnounced = true; this.notify('OSTATNIA PIŁKA', 'NIE POZWÓL JEJ SPAŚĆ'); }
          if (this.ball.position.y <= 2.05 && Math.abs(this.ball.velocity.y) < 5) { if (this.score[0] === this.score[1]) this.beginOvertime(); else this.endMatch(); }
        }
      }
    }
    if (this.state === 'playing' && this.time - this.lastCapture >= .04) { this.captureFrame(); this.lastCapture = this.time; }
    this.syncVisuals(dt, realTime); this.updateCamera(dt, realTime);
    this.audio.update(this.player.speed, this.player.boosting, this.player.control.throttle, this.state === 'playing' && this.player.demolished <= 0);
  }
  syncVisuals(dt, time) {
    this.cars.forEach(c => c.sync(dt, time));
    this.visuals.ball.position.copy(this.ball.position); this.visuals.ball.quaternion.copy(this.ball.quaternion);
    const p = this.ball.position; this.visuals.ballMarker.position.set(p.x, .04, p.z); this.visuals.ballMarker.material.opacity = clamp(.7 - p.y * .01, .2, .7);
    this.visuals.ballShadow.position.set(p.x, .026, p.z); const s = 1 + p.y * .055; this.visuals.ballShadow.scale.setScalar(s); this.visuals.ballShadow.material.opacity = clamp(.9 - p.y * .025, .15, .9);
    if (this.ball.velocity.length() > 25 && Math.random() < .65 && this.state === 'playing') this.particles.emit(p, { x: 0, y: 0, z: 0 }, this.lastTouch ? TEAM[this.lastTouch.car.team] : 0xe0f0d5, .33, .36, .2, 0);
  }
  updateCamera(dt, time) {
    const car = this.player; if (!car) return; const p = car.body.position, b = this.ball.position, cam = this.visuals.camera;
    let direction = new THREE.Vector3();
    if (this.ballCam) { direction.set(b.x - p.x, 0, b.z - p.z); if (direction.length() < 4) direction.copy(this.cameraDirection); else direction.normalize(); }
    else { const f = car.body.quaternion.vmult(new Vec(0, 0, 1)); direction.set(f.x, 0, f.z); if (direction.length() < .2) direction.copy(this.cameraDirection); direction.normalize(); }
    this.cameraDirection.lerp(direction, 1 - Math.exp(-dt * 5.5)).normalize();
    const speed = car.speed || 0, distance = 11.3 + speed * .035, height = 5.1 + Math.min(4, Math.max(0, b.y - p.y - 3) * .08);
    const desired = new THREE.Vector3(p.x - this.cameraDirection.x * distance, Math.max(3, p.y + height), p.z - this.cameraDirection.z * distance);
    desired.x = clamp(desired.x, -41.4, 41.4); desired.z = clamp(desired.z, -72, 72); desired.y = Math.min(26, desired.y);
    cam.position.lerp(desired, 1 - Math.exp(-dt * 6));
    const target = this.ballCam ? new THREE.Vector3(p.x + (b.x - p.x) * .3, p.y + 1.4 + Math.max(0, b.y - p.y) * .27, p.z + (b.z - p.z) * .3) : new THREE.Vector3(p.x + direction.x * 9, p.y + 1.2, p.z + direction.z * 9);
    this.cameraLook.lerp(target, 1 - Math.exp(-dt * 7)); cam.lookAt(this.cameraLook);
    cam.fov = THREE.MathUtils.damp(cam.fov, 64 + (this.reducedEffects ? 0 : (car.boosting ? 9 : 0) + Math.max(0, speed - 30) * .12), 3, dt); cam.updateProjectionMatrix();
    this.shake *= Math.exp(-dt * 10); if (this.shakeEnabled && this.shake > .005) { cam.position.x += (Math.random() - .5) * this.shake; cam.position.y += (Math.random() - .5) * this.shake; }
    if (this.visuals.quality === 'high') { this.visuals.sun.target.position.set(p.x * .6, 0, p.z * .55); this.visuals.sun.position.set(p.x * .6 + 22, 38, p.z * .55 + 18); }
  }
  checkPads() {
    for (const car of this.cars) {
      if (car.demolished > 0 || car.boost > 99 || car.body.position.y > 2.3) continue;
      for (const pad of this.pads) {
        if (pad.timer > 0) continue; const d = Math.hypot(car.body.position.x - pad.x, car.body.position.z - pad.z);
        if (d < (pad.large ? 2.35 : 1.65)) { car.boost = pad.large ? 100 : Math.min(100, car.boost + 12); pad.timer = pad.large ? 10 : 4; if (car.isPlayer) { this.audio.pickup(pad.large); if (pad.large) this.notify('PEŁNE NAŁADOWANIE', '100'); } this.particles.burst({ x: pad.x, y: .6, z: pad.z }, 0xffce64, pad.large ? 25 : 9, 4); }
      }
    }
  }
  checkBallAwards() {
    const touch=this.lastTouch;if(!touch||touch.shotAwarded||this.time-touch.time>1.2)return;
    const car=touch.car,attack=car.team===0?-1:1,b=this.ball;
    const travel=(attack*64-b.position.z)/(Math.abs(b.velocity.z)>.1?b.velocity.z:.1);
    const x=b.position.x+b.velocity.x*travel;
    if(b.velocity.z*attack>9&&travel>0&&travel<4.5&&Math.abs(x)<15&&this.time-(car.lastShot||-9)>1.4){
      touch.shotAwarded=true;car.lastShot=this.time;car.stats.shots++;car.stats.points+=10;
      if(car.isPlayer)this.notify('STRZAŁ NA BRAMKĘ','+10');
    }
  }
  handleCollision(car, e) {
    if (this.state !== 'playing' || car.demolished > 0) return;
    if (e.body === this.ball) {
      if (this.time - car.lastHit < .16) return; car.lastHit = this.time;
      const p = car.body.position, b = this.ball, dir = b.position.vsub(p); dir.normalize();
      const oldZ = b.velocity.z, relative = car.body.velocity.vsub(b.velocity).dot(dir), push = clamp(3 + Math.max(0, relative) * .26, 3, 13);
      if (relative > -3) b.applyImpulse(new Vec(dir.x * 30 * push, (dir.y * push + (b.position.y < 3.2 ? 1.3 : 0)) * 30, dir.z * 30 * push));
      const ownSign = car.team === 0 ? 1 : -1;
      if (oldZ * ownSign > 6 && b.position.z * ownSign > 43 && b.velocity.z * ownSign < oldZ * ownSign - 3 && Math.abs(b.position.x) < 17) { car.stats.saves++; car.stats.points += 50; if (car.isPlayer) this.notify('OBRONA!', '+50'); }
      const enemyDirection = -ownSign, travel = (enemyDirection * 64 - b.position.z) / (Math.abs(b.velocity.z) > .1 ? b.velocity.z : .1), estimatedX = b.position.x + b.velocity.x * travel;
      if (b.velocity.z * enemyDirection > 8 && travel > 0 && travel < 4 && Math.abs(estimatedX) < 17 && this.time - (car.lastShot || -9) > 1.5) { car.stats.shots++; car.stats.points += 10; car.lastShot = this.time; if (car.isPlayer) this.notify('STRZAŁ NA BRAMKĘ', '+10'); }
      if (!this.lastTouch || this.lastTouch.car !== car) this.previousTouch = this.lastTouch;
      this.lastTouch = { car, time: this.time, shotAwarded: this.time-car.lastShot<.1 }; if (car.isPlayer) this.shake = Math.min(.35, .08 + car.speed * .005);
      this.audio.hit(Math.min(1.2, .2 + car.speed / 40)); this.particles.burst(b.position, TEAM[car.team], 14, 6);
    } else if (e.body.vehicle && e.body.vehicle.team !== car.team) {
      const other = e.body.vehicle; if (other.demolished > 0) return;
      const toward = other.body.position.vsub(car.body.position); toward.normalize(); const speed = car.body.velocity.dot(toward);
      if (speed > 42) this.demolish(other, car);
      else if (car.isPlayer && Math.abs(e.contact.getImpactVelocityAlongNormal()) > 12) { this.shake = .28; this.audio.hit(.7); }
    }
  }
  demolish(victim, attacker) {
    victim.demolished = 3; victim.visual.root.visible = false; victim.body.collisionFilterMask = 0; victim.boosting = false;
    this.particles.burst(victim.body.position, TEAM[attacker.team], 160, 23); this.audio.demo(); attacker.stats.demos++; attacker.stats.points += 20;
    if (attacker.isPlayer) this.notify('DEMOLKA!', '+20'); if (victim.isPlayer) { this.notify('ZDEMOLÓWANY', 'POWRÓT ZA 3 S'); this.shake = 1.2; }
    victim.body.position.set(0, -70, 0); victim.body.velocity.setZero(); victim.body.angularVelocity.setZero(); victim.body.force.setZero();
  }
  checkGoal() {
    const b = this.ball.position;
    if (Math.abs(b.z) > 65.85 && Math.abs(b.x) < 12.1 && b.y < 9.5 && b.y > .2) {
      if (this.freeplay) { this.notify('GOOOL!', 'PIĘKNIE!'); this.audio.goal(); this.particles.goal(b, TEAM[0]); this.resetBall(); return; }
      const scoringTeam = b.z < 0 ? 0 : 1; this.score[scoringTeam]++; this.hooks.onCount?.(null); this.state = 'goal'; this.stateTime = 0; this.replayStarted = false; this.goalSign = b.z > 0 ? 1 : -1; this.goalPosition = new THREE.Vector3(b.x, b.y, b.z);
      let scorer = this.lastTouch?.car; const ownGoal = scorer && scorer.team !== scoringTeam;
      if (scorer && !ownGoal) { scorer.stats.goals++; scorer.stats.points += 100; }
      const assist = this.previousTouch; if (!ownGoal && assist && scorer && assist.car !== scorer && assist.car.team === scoringTeam && this.time - assist.time < 9) { assist.car.stats.assists++; assist.car.stats.points += 50; }
      this.captureFrame(); this.replayFrames = this.replayBuffer.slice();
      this.audio.goal(); this.particles.goal(b, TEAM[scoringTeam]); this.shake = 1.8; this.audio.update(0, false, 0, false);
      this.hooks.onGoal?.({ team: scoringTeam, scorer: scorer ? scorer.name : 'DRUŻYNA', ownGoal, score: this.score });
    }
  }
  captureFrame() {
    const frame = { t: this.time, ball: [...this.ball.position.toArray(), ...this.ball.quaternion.toArray()], cars: this.cars.map(c => [...c.body.position.toArray(), ...c.body.quaternion.toArray(), c.demolished > 0 ? 0 : 1]) };
    this.replayBuffer.push(frame); while (this.replayBuffer.length > 1 && this.time - this.replayBuffer[0].t > 3.65) this.replayBuffer.shift();
  }
  applyReplay(time) {
    const frames = this.replayFrames; let i = 0; while (i < frames.length - 2 && frames[i + 1].t < time) i++;
    const a = frames[i], b = frames[Math.min(i + 1, frames.length - 1)], t = clamp((time - a.t) / Math.max(.001, b.t - a.t), 0, 1);
    const apply = (root, v, w) => { root.position.set(THREE.MathUtils.lerp(v[0], w[0], t), THREE.MathUtils.lerp(v[1], w[1], t), THREE.MathUtils.lerp(v[2], w[2], t)); root.quaternion.set(v[3], v[4], v[5], v[6]).slerp(new THREE.Quaternion(w[3], w[4], w[5], w[6]), t); };
    apply(this.visuals.ball, a.ball, b.ball); this.cars.forEach((c, j) => { apply(c.visual.root, a.cars[j], b.cars[j]); c.visual.root.visible = a.cars[j][7] !== 0; c.visual.setBoost(false); });
    this.visuals.ballMarker.position.set(this.visuals.ball.position.x, .04, this.visuals.ball.position.z);
  }
  updateGoalCamera(dt, time) {
    const cam = this.visuals.camera, ball = this.visuals.ball.position;
    const target = new THREE.Vector3(ball.x * .55, Math.max(3, ball.y * .7), ball.z);
    const desired = this.replayStarted ? new THREE.Vector3(25, 15, this.goalSign * 34) : new THREE.Vector3(this.goalPosition.x + 18, 11, this.goalSign * 43);
    cam.position.lerp(desired, 1 - Math.exp(-dt * 2.5)); this.cameraLook.lerp(target, 1 - Math.exp(-dt * 4)); cam.lookAt(this.cameraLook); cam.fov = THREE.MathUtils.damp(cam.fov, 63, 3, dt); cam.updateProjectionMatrix();
  }
  finishGoal() {
    this.hooks.onGoalEnd?.(); this.hooks.onReplay?.(false);
    if (this.overtime || (this.timeRemaining <= 0 && this.score[0] !== this.score[1])) this.endMatch();
    else if (this.timeRemaining <= 0) this.beginOvertime();
    else this.kickoff();
  }
  beginOvertime() { this.overtime = true; this.overtimeTime = 0; this.kickoff(); this.notify('DOGRYWKA', 'ZŁOTY GOL WYGRYWA'); }
  endMatch() { this.state = 'ended'; this.paused = false; this.hooks.onCount?.(null); this.hooks.onEnd?.(this); this.audio.update(0, false, 0, false); }
  toggleCamera() { this.ballCam = !this.ballCam; return this.ballCam; }
}
