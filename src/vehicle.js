import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { FIELD, TEAM } from './visuals.js';
const UP = new CANNON.Vec3(0, 1, 0), FWD = new CANNON.Vec3(0, 0, 1), RIGHT = new CANNON.Vec3(1, 0, 0);
const clamp = THREE.MathUtils.clamp;
export const emptyInput = () => ({ throttle: 0, steer: 0, roll: 0, boost: false, drift: false, jump: false, jumpHeld: false });
export const blankStats = () => ({ points: 0, goals: 0, assists: 0, shots: 0, saves: 0, demos: 0 });
export class Vehicle {
  constructor(game, options) {
    Object.assign(this, options); this.game = game; this.stats = blankStats(); this.boost = 34; this.jumpCount = 0; this.jumpTime = -9; this.jumpLock = 0; this.flipTime = 0; this.demolished = 0; this.lastHit = -10; this.lastGrounded = -10; this.boosting = false; this.grounded = false; this.speed = 0; this.supersonic = false; this.control = emptyInput(); this.particleBudget = 0;
    this.body = new CANNON.Body({ mass: 180, material: game.carMaterial, shape: new CANNON.Box(new CANNON.Vec3(1.01, .43, 2.12)), linearDamping: .025, angularDamping: .3, allowSleep: false, collisionFilterGroup: 2, collisionFilterMask: 7 });
    this.body.vehicle = this; this.body.userData = { kind: 'car' }; this.body.position.set(0, .8, 0);
    this.visual = game.visuals.createCar(this.paint || (this.team === 0 ? '#b8df67' : '#ff8857'), this.team); game.visuals.scene.add(this.visual.root); game.world.addBody(this.body);
    this.forward = new CANNON.Vec3(); this.right = new CANNON.Vec3(); this.up = new CANNON.Vec3(); this.normal = new CANNON.Vec3(0, 1, 0);
    this.rays = Array.from({ length: 4 }, () => new CANNON.RaycastResult());
    this.body.addEventListener('collide', e => game.handleCollision(this, e));
    this.reset(this.spawn.x, this.spawn.z, this.spawn.yaw);
  }
  reset(x, z, yaw = 0) {
    this.body.position.set(x, .82, z); this.body.previousPosition.copy(this.body.position); this.body.interpolatedPosition.copy(this.body.position);
    this.body.quaternion.setFromEuler(0, yaw, 0); this.body.previousQuaternion.copy(this.body.quaternion); this.body.interpolatedQuaternion.copy(this.body.quaternion);
    this.body.velocity.setZero(); this.body.angularVelocity.setZero(); this.body.force.setZero(); this.body.torque.setZero(); this.body.collisionFilterMask = 7; this.body.aabbNeedsUpdate = true; this.body.wakeUp();
    this.jumpCount = 0; this.jumpLock = .05; this.flipTime = 0; this.demolished = 0; this.grounded = true; this.boosting = false; this.visual.root.visible = true; this.sync(0, 0);
  }
  recover() { if (this.demolished > 0) return; const b = this.body, forward = b.quaternion.vmult(FWD); const yaw = Math.atan2(forward.x, forward.z); b.position.y = Math.max(.9, b.position.y); b.quaternion.setFromEuler(0, yaw, 0); b.angularVelocity.setZero(); b.velocity.scale(.35, b.velocity); this.jumpCount = 0; this.flipTime = 0; this.jumpLock = .1; this.game.audio.tone(250, .1, .05, 'sine', 440); }
  destroy() { this.game.world.removeBody(this.body); this.game.visuals.scene.remove(this.visual.root); this.visual.material.dispose(); }
  jump(time, input) {
    if (this.demolished > 0 || this.jumpLock > 0) return;
    const b = this.body;
    if (this.grounded || (this.jumpCount === 0 && time - this.lastGrounded < .1)) {
      this.jumpCount = 1; this.jumpTime = time; this.jumpLock = .19; this.grounded = false;
      b.velocity.x += this.up.x * 9.4; b.velocity.y += this.up.y * 9.4; b.velocity.z += this.up.z * 9.4;
      if (this.isPlayer) this.game.audio.jump(false);
    } else if (this.jumpCount < 2 && time - this.jumpTime <= 1.55) {
      this.jumpCount = 2; this.jumpLock = .16;
      const t = input.throttle, s = input.steer;
      if (Math.abs(t) + Math.abs(s) > .25) {
        const direction = this.forward.scale(t).vadd(this.right.scale(s)); direction.normalize();
        b.velocity.x += direction.x * 11.5; b.velocity.y += direction.y * 11.5 + 2.8; b.velocity.z += direction.z * 11.5;
        const axis = this.right.scale(t).vadd(this.forward.scale(-s)); axis.normalize(); this.flipAxis = axis; this.flipTime = .54;
        b.angularVelocity.copy(axis.scale(11.6));
        if (this.isPlayer) this.game.notify('FLIP', '+10');
      } else { b.velocity.x += this.up.x * 8.5; b.velocity.y += this.up.y * 8.5; b.velocity.z += this.up.z * 8.5; }
      if (this.isPlayer) this.game.audio.jump(true);
    }
  }
  update(dt, time, input) {
    if (this.demolished > 0) {
      this.demolished -= dt;
      if (this.demolished <= 0) { this.reset(this.spawn.x, this.spawn.z, this.spawn.yaw); this.boost = 34; if (this.isPlayer) this.game.notify('Z POWROTEM W GRZE'); }
      return;
    }
    this.control = input; const b = this.body, m = b.mass;
    this.jumpLock = Math.max(0, this.jumpLock - dt);
    b.quaternion.vmult(FWD, this.forward); b.quaternion.vmult(RIGHT, this.right); b.quaternion.vmult(UP, this.up);
    let count = 0, distance = 0; const normal = new CANNON.Vec3();
    const wheelPoints = [[-.88, 1.48], [.88, 1.48], [-.88, -1.52], [.88, -1.52]];
    for (let i = 0; i < 4; i++) {
      const from = b.quaternion.vmult(new CANNON.Vec3(wheelPoints[i][0], 0, wheelPoints[i][1])).vadd(b.position);
      const to = from.vadd(this.up.scale(-1.4)); const hit = this.rays[i]; hit.reset();
      this.game.world.raycastClosest(from, to, { collisionFilterMask: 1, collisionFilterGroup: 2, skipBackfaces: true, checkCollisionResponse: true }, hit);
      if (hit.hasHit && hit.distance < 1.18 && hit.hitNormalWorld.dot(this.up) > .12) { normal.vadd(hit.hitNormalWorld, normal); distance += hit.distance; count++; }
    }
    this.grounded = count >= 2 && this.jumpLock <= 0 && this.flipTime <= 0;
    if (this.grounded) {
      normal.normalize(); this.normal.copy(normal); this.lastGrounded = time; this.jumpCount = 0;
      // Magnetic/suction adhesion rotates gravity into the supporting surface, allowing walls and ceiling driving.
      b.force.y += 20 * m; normal.scale(-20 * m, this._gravityForce ||= new CANNON.Vec3()); b.force.vadd(this._gravityForce, b.force);
      const align = new CANNON.Quaternion().setFromVectors(this.up, normal), target = align.mult(b.quaternion);
      b.quaternion.slerp(target, 1 - Math.exp(-dt * 18), b.quaternion); b.quaternion.normalize();
      b.quaternion.vmult(FWD, this.forward); b.quaternion.vmult(RIGHT, this.right); b.quaternion.vmult(UP, this.up);
      const vNormal = b.velocity.dot(normal), rest = .79, spring = clamp(20 + (rest - distance / count) * 140 - vNormal * 14, 0, 100);
      b.force.vadd(normal.scale(m * spring), b.force);
      const lateral = b.velocity.dot(this.right), grip = input.drift ? 1.4 : 11;
      b.velocity.vsub(this.right.scale(lateral * (1 - Math.exp(-grip * dt))), b.velocity);
      const fs = b.velocity.dot(this.forward), throttle = input.throttle;
      let accel = throttle * 30;
      if (Math.abs(throttle) < .05) accel = -fs * 1.5;
      else if (Math.sign(throttle) !== Math.sign(fs) && Math.abs(fs) > 1) accel = throttle * 53;
      if (fs > 32.5 && accel > 0) accel *= clamp((35 - fs) / 3, 0, 1);
      if (fs < -16 && accel < 0) accel = 0;
      b.force.vadd(this.forward.scale(accel * m), b.force);
      const turning = (input.drift ? 3.15 : 2.05) * (.3 + Math.min(Math.abs(fs), 18) / 18 * .7) * (fs < -1 ? -1 : 1);
      b.angularVelocity.copy(normal.scale(input.steer * turning));
    } else {
      if (this.jumpCount === 0 && time - this.lastGrounded > .12) { this.jumpCount = 1; this.jumpTime = time; }
      if (this.jumpCount === 1 && time - this.jumpTime > 1.55) this.jumpCount = 2;
      if (this.flipTime > 0) { this.flipTime -= dt; b.angularVelocity.copy(this.flipAxis.scale(11.6)); }
      else {
        const angular = b.angularVelocity; angular.scale(Math.exp(-dt * 1.3), angular);
        angular.vadd(this.right.scale(input.throttle * dt * 6), angular); angular.vadd(this.up.scale(input.steer * dt * 4), angular); angular.vadd(this.forward.scale(input.roll * dt * 8), angular);
        const as = angular.length(); if (as > 5.5) angular.scale(5.5 / as, angular);
      }
      if (input.jumpHeld && this.jumpCount === 1 && time - this.jumpTime < .19) b.force.vadd(this.up.scale(m * 25), b.force);
    }
    if (input.jump) this.jump(time, input);
    this.boosting = input.boost && this.boost > .1;
    if (this.game.freeplay) this.boost = 100;
    if (this.boosting) { this.boost = Math.max(0, this.boost - dt * 28); b.force.vadd(this.forward.scale(m * 32), b.force); }
    const speed = b.velocity.length(); if (speed > 50) b.velocity.scale(50 / speed, b.velocity);
    this.speed = b.velocity.length(); this.supersonic = speed > 43;
    if (b.position.y < -8 || Math.abs(b.position.x) > 95 || Math.abs(b.position.z) > 105) this.reset(this.spawn.x, this.spawn.z, this.spawn.yaw);
    if (this.isPlayer && !this.grounded && b.position.y < 1 && this.up.y < -.3 && Math.abs(input.throttle) > .2) { b.angularVelocity.z += dt * 6; }
  }
  sync(dt, time) {
    if (this.demolished > 0) return;
    const root = this.visual.root, b = this.body; root.position.copy(b.position); root.quaternion.copy(b.quaternion); this.visual.setBoost(this.boosting, time);
    if (this.boosting && dt > 0) {
      this.particleBudget += dt * (this.isPlayer ? 100 : 60);
      const p = b.quaternion.vmult(new CANNON.Vec3(0, -.13, -2.8)).vadd(b.position), v = b.quaternion.vmult(new CANNON.Vec3(0, 0, -15));
      while (this.particleBudget >= 1) { this.game.particles.emit(p, v, TEAM[this.team], .45 + Math.random() * .4, .35 + Math.random() * .2, 3, -.3); this.particleBudget--; }
    }
    if (this.supersonic && dt > 0 && Math.random() < .7) {
      for (const x of [-.9, .9]) { const p = b.quaternion.vmult(new CANNON.Vec3(x, -.25, -2.1)).vadd(b.position); this.game.particles.emit(p, { x: 0, y: 0, z: 0 }, TEAM[this.team], .22, .45, .2, 0); }
    }
    if (this.control.drift && this.grounded && this.speed > 8 && Math.random() < .4) {
      const p = b.quaternion.vmult(new CANNON.Vec3((Math.random() > .5 ? -1 : 1), -.65, -1.5)).vadd(b.position); this.game.particles.emit(p, { x: 0, y: .5, z: 0 }, 0x758064, 1, .4, 1, -.3);
    }
  }
  aiInput(time) {
    const input = emptyInput(); if (this.demolished > 0) return input;
    const ball = this.game.ball.position, bv = this.game.ball.velocity, p = this.body.position, attack = this.team === 0 ? -1 : 1, difficulty = this.game.difficulty;
    const ballD = Math.hypot(ball.x - p.x, ball.z - p.z), predict = Math.min(.48, ballD / 65);
    const bx = clamp(ball.x + bv.x * predict, -35, 35), bz = clamp(ball.z + bv.z * predict, -59, 59);
    const teammates = this.game.cars.filter(c => c.team === this.team && c.demolished <= 0);
    let closest = this, minDist = Infinity;
    for (const c of teammates) { const d = Math.hypot(c.body.position.x - bx, c.body.position.z - bz); if (d < minDist) { minDist = d; closest = c; } }
    let dx = -bx, dz = attack * 67 - bz, l = Math.hypot(dx, dz); dx /= l; dz /= l;
    let tx = bx - dx * 5, tz = bz - dz * 5;
    if (closest !== this && ballD > 9 && this.game.cars.length > 2) {
      const index = teammates.indexOf(this), offset = index % 2 ? 11 : -11;
      tx = clamp(bx * .55 + offset, -29, 29); tz = clamp(bz - attack * (16 + index * 4), -53, 53);
      if (bz * attack > 10) { tx = bx * .3; tz = -attack * (this.game.cars.length > 4 && index === 2 ? 53 : 20); }
    } else {
      const behind = (p.x - bx) * dx + (p.z - bz) * dz;
      if (behind < -1.5 && ballD < 14) { tx = bx + dx * 3; tz = bz + dz * 3; }
      else if (behind > 0 && ballD < 13) { tx = bx + (p.x > bx ? 8 : -8); tz = bz - attack * 8; }
    }
    tx = clamp(tx, -36, 36); tz = clamp(tz, -58, 58);
    const forward = this.body.quaternion.vmult(FWD), heading = Math.atan2(forward.x, forward.z), desired = Math.atan2(tx - p.x, tz - p.z);
    let angle = desired - heading; while (angle > Math.PI) angle -= Math.PI * 2; while (angle < -Math.PI) angle += Math.PI * 2;
    input.steer = clamp(angle * 2.2, -1, 1); input.throttle = Math.abs(angle) > 1.5 ? .5 : 1; input.drift = Math.abs(angle) > 1 && this.speed > 13;
    input.boost = Math.abs(angle) < .28 && Math.hypot(tx - p.x, tz - p.z) > 15 && this.boost > 8 && difficulty !== 'rookie';
    if (difficulty === 'rookie') input.throttle *= .72;
    if (difficulty === 'allstar' && this.boost < 20 && ballD > 25) input.boost = false;
    if (ballD < 6.5 && Math.abs(angle) < .65 && ball.y > 3 && ball.y < 10 && this.grounded && time - (this.aiJumpAt || 0) > 1.5 && difficulty !== 'rookie') { input.jump = true; input.jumpHeld = true; this.aiJumpAt = time; }
    if (!this.grounded) {
      input.throttle = ball.y > p.y + 2 ? -.5 : .2;
      input.boost = ballD < 12 && ball.y > p.y && Math.abs(angle) < .5 && this.boost > 10;
      if (this.jumpCount === 1 && time - this.jumpTime > .25 && ballD < 7 && difficulty === 'allstar') { input.jump = true; input.throttle = 1; }
    }
    if (p.y < 1.5 && this.up.y < .2 && time - (this.aiRecovery || 0) > 1.4) { this.recover(); this.aiRecovery = time; }
    return input;
  }
}
