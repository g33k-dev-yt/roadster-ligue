import './style.css';
import './responsive-extra.css';
import './opening.css';
import { openUrl } from '@tauri-apps/plugin-opener';
import * as THREE from 'three';
import { Visuals, TEAM, FIELD } from './visuals.js';
import { Particles, GameAudio } from './effects.js';
import { Game } from './game.js';
import { emptyInput } from './vehicle.js';

const $ = id => document.getElementById(id);
const show = (element, yes = true) => element.classList.toggle('hidden', !yes);
let saved = {};
try { saved = JSON.parse(localStorage.getItem('roadster-ligue-settings') || '{}'); } catch {}
saved.reduced ??= true;
if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) saved.reduced = true;
let selectedSize = saved.size || 2, selectedPaint = saved.paint || '#dce3de', selectedFinish = saved.finish || 'gloss', selectedDifficulty = saved.difficulty || 'pro';
let garage = false, ready = false, visuals, game, particles, latestOptions, toastTimer;
const audio = new GameAudio(); audio.volume = saved.volume ?? .4; audio.enabled = saved.sound ?? true;
const keys = new Set(); let jumpPressed = false, mouseBoost = false, mouseDrift = false, touchBoost = false, touchJump = false, touchThrottle = 0, touchSteer = 0;
let gamepadOld = [], gamepadThrottle = 0, gamepadSteer = 0, gamepadRoll = 0, gamepadBoost = false, gamepadDrift = false, gamepadJumpHeld = false;
const nameplates = new Map();
function persist() { try { localStorage.setItem('roadster-ligue-settings', JSON.stringify({ ...saved, size: selectedSize, paint: selectedPaint, finish: selectedFinish, difficulty: selectedDifficulty, volume: audio.volume, sound: audio.enabled })); } catch {} }
function toast(text) { $('toast').textContent = text; show($('toast')); clearTimeout(toastTimer); toastTimer = setTimeout(() => show($('toast'), false), 2700); }
function updateSoundButtons() { document.querySelectorAll('.sound-button').forEach(b => { b.querySelector('use').setAttribute('href', audio.enabled ? '#i-volume' : '#i-muted'); b.title = audio.enabled ? 'Wycisz dźwięk' : 'Włącz dźwięk'; }); }
updateSoundButtons();

function notify(title, points) {
  const element = document.createElement('div'); element.className = 'notification'; element.textContent = title;
  if (points) { const p = document.createElement('small'); p.textContent = points; element.appendChild(p); }
  $('notifications').replaceChildren(element); setTimeout(() => { if (element.isConnected) element.remove(); }, 2200);
}
function resetInputs() { keys.clear(); jumpPressed = false; mouseBoost = mouseDrift = touchBoost = touchJump = false; touchThrottle = touchSteer = 0; gamepadOld = []; }
function setPage(page) {
  if (!ready) return;
  show($('opening-menu'), false); show($('lobby')); document.body.dataset.phase = 'lobby';
  if (page === 'training') { startMatch(true); return; }
  garage = page === 'garage'; $('lobby').classList.toggle('garage-active', garage); show($('play-panel'), !garage); show($('garage-panel'), garage);
  document.querySelectorAll('.nav-link').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  if (garage) visuals.previewTargetAngle = -.45;
}
async function startMatch(freeplay = false) {
  if (!ready) return;
  resetInputs(); garage = false; show($('opening-menu'), false); document.body.dataset.phase = 'game'; show($('lobby'), false); show($('hud')); show($('pause-screen'), false); show($('results'), false); show($('scoreboard'), false); show($('goal-banner'), false); show($('replay-tag'), false);
  $('notifications').replaceChildren(); $('chat-feed').replaceChildren();
  latestOptions = { size: selectedSize, difficulty: selectedDifficulty, paint: selectedPaint, finish: selectedFinish, freeplay };
  void audio.init().catch(() => {});
  game.start(latestOptions); document.activeElement?.blur();
  if (freeplay) toast('Trening: B — piłka na środek · R — postaw auto · ESC — menu');
}
function returnMenu() {
  resetInputs(); show($('opening-menu'), false); game.leave(); show($('hud'), false); show($('pause-screen'), false); show($('results'), false); show($('scoreboard'), false); show($('lobby')); show($('goal-banner'), false); setPage('play');
}
function refreshNames() {
  $('nameplates').replaceChildren(); nameplates.clear();
  game.cars.filter(c => !c.isPlayer).forEach(c => { const el = document.createElement('div'); el.className = `nameplate${c.team ? ' away' : ''}`; el.textContent = c.name; $('nameplates').appendChild(el); nameplates.set(c, el); });
}
function onCount(value) {
  show($('countdown'), value !== null); if (value === null) return;
  $('countdown-number').textContent = value; $('countdown').classList.toggle('go', typeof value === 'string'); $('countdown').querySelector('small').textContent = typeof value === 'string' ? 'PODŁOGA TO DOPIERO POCZĄTEK' : game?.overtime ? 'DOGRYWKA · ZŁOTY GOL' : 'PRZYGOTUJ SIĘ';
  $('countdown-number').style.animation = 'none'; void $('countdown-number').offsetWidth; $('countdown-number').style.animation = '';
}
function onGoal(event) {
  $('score-home').textContent = event.score[0]; $('score-away').textContent = event.score[1];
  $('notifications').replaceChildren(); show($('goal-banner')); $('goal-banner').classList.toggle('away', event.team === 1); $('goal-team').textContent = `DRUŻYNA ${event.team === 0 ? 'VOLT' : 'EMBER'}`;
  $('goal-scorer').textContent = event.ownGoal ? `${event.scorer} · BRAMKA SAMOBÓJCZA` : event.scorer === 'TY' ? 'ZDOBYWASZ BRAMKĘ!' : `${event.scorer} ZDOBYWA BRAMKĘ`;
  $('goal-banner').querySelector('.goal-points').textContent = event.team === 0 ? '+100' : 'DOBRA OKAZJA NA REWANŻ';
}
function onStart() {
  $('hud').classList.toggle('freeplay', game.freeplay); $('score-home').textContent = '0'; $('score-away').textContent = '0'; $('match-mode').textContent = game.freeplay ? 'SWOBODNY TRENING · BEZ LIMITU' : `MECZ TOWARZYSKI · ${game.size}v${game.size}`; refreshNames(); updateHUD();
}
function onEnd() {
  show($('results')); show($('goal-banner'), false); show($('replay-tag'), false); show($('scoreboard'), false);
  const win = game.score[0] > game.score[1]; $('result-title').textContent = win ? 'ZWYCIĘSTWO.' : 'JESZCZE REWANŻ?'; $('result-title').style.color = win ? 'var(--lime)' : 'var(--orange)';
  $('result-home').textContent = game.score[0]; $('result-away').textContent = game.score[1]; const s = game.player.stats;
  $('result-stats').innerHTML = [['points', 'PUNKTY'], ['goals', 'GOLE'], ['shots', 'STRZAŁY'], ['saves', 'OBRONY']].map(([key, label]) => `<div><b>${s[key]}</b><span>${label}</span></div>`).join('');
}
function scoreboard() {
  if (!game?.player) return;
  $('scoreboard-rows').innerHTML = [0, 1].map(team => `<div class="scoreboard-team ${team ? 'away' : ''}">${team ? 'EMBER' : 'VOLT'} / ${game.score[team]}</div>` + game.cars.filter(c => c.team === team).sort((a, b) => b.stats.points - a.stats.points).map(c => `<div class="scoreboard-row ${c.isPlayer ? 'you' : ''}"><span><svg><use href="${c.isPlayer ? '#i-gamepad' : '#i-bolt'}"/></svg>${c.name}${c.isPlayer ? ' / TY' : ' / AI'}</span><span>${c.stats.points}</span><span>${c.stats.goals}</span><span>${c.stats.assists}</span><span>${c.stats.shots}</span><span>${c.stats.saves}</span></div>`).join('')).join('');
}
let dialogResume = false;
function openDialog(id) { const d = $(id); if (d.open) return; dialogResume = game && game.state !== 'lobby' && game.state !== 'ended' && !game.paused; if (dialogResume) game.setPaused(true); d.showModal(); }
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(d => { d.addEventListener('close', () => { resetInputs(); if (dialogResume) game?.setPaused(false); dialogResume = false; }); d.addEventListener('click', e => { if (e.target === d) { const r = d.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close(); } }); });
document.querySelectorAll('.controls-button').forEach(b => b.addEventListener('click', () => openDialog('controls-dialog')));
$('settings-button').addEventListener('click', () => openDialog('settings-dialog')); $('credits-button').addEventListener('click', () => openDialog('credits-dialog'));
document.querySelectorAll('.nav-link').forEach(b => b.addEventListener('click', () => setPage(b.dataset.page)));
$('brand-home').addEventListener('click', e => { e.preventDefault(); showOpeningMenu(); }); $('customize-button').addEventListener('click', () => setPage('garage')); $('save-garage').addEventListener('click', () => { persist(); setPage('play'); toast('Lakier zapisany. Twój Roadster jest gotowy.'); });
$('play-button').addEventListener('click', () => startMatch()); $('freeplay-button').addEventListener('click', () => startMatch(true));
document.querySelectorAll('.mode-option').forEach(b => { b.addEventListener('click', () => { selectedSize = Number(b.dataset.size); document.querySelectorAll('.mode-option').forEach(el => { el.classList.toggle('selected', el === b); const check = el.querySelector('svg'); if (check) check.remove(); }); b.insertAdjacentHTML('beforeend', '<svg><use href="#i-check"/></svg>'); persist(); }); if (Number(b.dataset.size) === selectedSize) b.click(); });
$('difficulty').value = selectedDifficulty; $('difficulty').addEventListener('change', e => { selectedDifficulty = e.target.value; persist(); });
function applyPaint(button) { selectedPaint = button.dataset.color; document.querySelectorAll('.paint-swatch').forEach(b => b.classList.toggle('selected', b === button)); $('paint-name').textContent = button.dataset.name; visuals?.preview?.setPaint(selectedPaint); persist(); }
document.querySelectorAll('.paint-swatch').forEach(b => { b.addEventListener('click', () => applyPaint(b)); if (b.dataset.color === selectedPaint) { b.classList.add('selected'); $('paint-name').textContent = b.dataset.name; } else b.classList.remove('selected'); });
document.querySelectorAll('[data-finish]').forEach(b => { b.classList.toggle('selected', b.dataset.finish === selectedFinish); b.addEventListener('click', () => { selectedFinish = b.dataset.finish; document.querySelectorAll('[data-finish]').forEach(el => el.classList.toggle('selected', el === b)); visuals?.preview?.setFinish(selectedFinish); persist(); }); });
document.querySelectorAll('.sound-button').forEach(b => b.addEventListener('click', async () => { try { await audio.init(); } catch {} audio.toggle(); updateSoundButtons(); persist(); }));
$('pause-button').addEventListener('click', () => { resetInputs(); game.setPaused(!game.paused); }); $('resume-button').addEventListener('click', () => { resetInputs(); game.setPaused(false); });
$('quit-button').addEventListener('click', returnMenu); $('results-menu-button').addEventListener('click', returnMenu); $('restart-button').addEventListener('click', () => startMatch(latestOptions?.freeplay)); $('rematch-button').addEventListener('click', () => startMatch(false));
function toggleCamera() { if (!game?.player) return; game.toggleCamera(); updateHUD(); }
$('camera-button').addEventListener('click', toggleCamera);
$('fullscreen-button').addEventListener('click', async () => { try { if (!document.fullscreenElement) await $('app').requestFullscreen(); else await document.exitFullscreen(); } catch { toast('Pełny ekran nie jest dostępny w tym podglądzie.'); } });
$('volume-setting').value = Math.round(audio.volume * 100); $('volume-value').textContent = `${Math.round(audio.volume * 100)}%`;
$('volume-setting').addEventListener('input', e => { audio.setVolume(Number(e.target.value) / 100); $('volume-value').textContent = `${e.target.value}%`; persist(); });
$('quality-setting').value = saved.quality || 'high'; $('quality-setting').addEventListener('change', e => { saved.quality = e.target.value; visuals?.setQuality(saved.quality); persist(); });
$('shake-setting').addEventListener('change', e => { saved.shake = e.target.checked; applyReducedEffects(); persist(); });
$('reduced-setting').addEventListener('change', e => { saved.reduced = e.target.checked; applyReducedEffects(); persist(); });
$('hints-setting').checked = saved.hints !== false; show($('context-hint'), saved.hints !== false); $('hints-setting').addEventListener('change', e => { saved.hints = e.target.checked; show($('context-hint'), saved.hints); persist(); });

function quickchat(index) {
  const messages = ['Dobry strzał!', 'Mam ją!', 'Co za obrona!', 'Dzięki!']; const el = document.createElement('div'), name = document.createElement('b'); name.textContent = '[DRUŻYNA] TY:'; el.append(name, document.createTextNode(messages[index])); $('chat-feed').appendChild(el); if ($('chat-feed').children.length > 4) $('chat-feed').firstChild.remove(); setTimeout(() => el.remove(), 6500);
}
window.addEventListener('keydown', e => {
  if (document.querySelector('dialog[open]')) return;
  const active = game && game.state !== 'lobby' && game.state !== 'ended';
  if (!active) return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Backspace'].includes(e.code)) e.preventDefault();
  if (!e.repeat) {
    if (e.code === 'Escape' || e.code === 'KeyP') { resetInputs(); game.setPaused(!game.paused); return; }
    if (e.code === 'Tab') { scoreboard(); show($('scoreboard')); }
    if (e.code === 'KeyC') toggleCamera();
    if (e.code === 'KeyR' && !game.paused) game.player.recover();
    if ((e.code === 'KeyB' || e.code === 'Backspace') && !game.paused) game.centerBall();
    if (e.code === 'Space' && !game.paused) jumpPressed = true;
    if (/Digit[1-4]/.test(e.code) && !game.paused) quickchat(Number(e.code.slice(-1)) - 1);
  }
  keys.add(e.code);
});
window.addEventListener('keyup', e => { keys.delete(e.code); if (e.code === 'Tab') { e.preventDefault(); show($('scoreboard'), false); } });
window.addEventListener('blur', () => { resetInputs(); if (game && game.state !== 'lobby' && game.state !== 'ended' && !document.querySelector('dialog[open]')) game.setPaused(true); });
document.addEventListener('visibilitychange', () => { if (document.hidden && game && game.state !== 'lobby' && game.state !== 'ended') { resetInputs(); game.setPaused(true); } });
window.addEventListener('resize', () => visuals?.resize());
window.addEventListener('gamepadconnected', () => toast('Pad podłączony. RT — gaz · A — skok · B — dopalacz'));
function readGamepad() {
  gamepadThrottle = gamepadSteer = gamepadRoll = 0; gamepadBoost = gamepadDrift = gamepadJumpHeld = false;
  let pads;try{pads=navigator.getGamepads?.();}catch{gamepadOld=[];return;}
  const pad = Array.from(pads||[]).find(p=>p); if (!pad) { gamepadOld = []; return; }
  const pressed = pad.buttons.map(b => b.pressed), edge = i => pressed[i] && !gamepadOld[i];
  const trigger = (pad.buttons[7]?.value || 0) - (pad.buttons[6]?.value || 0);
  gamepadThrottle = Math.abs(trigger) > .08 ? trigger : Math.abs(pad.axes[1]) > .14 ? -pad.axes[1] : 0; gamepadSteer = Math.abs(pad.axes[0]) > .12 ? pad.axes[0] : 0;
  gamepadRoll = (pressed[4] ? 1 : 0) - (pressed[5] ? 1 : 0); gamepadBoost = !!pressed[1]; gamepadDrift = !!pressed[2]; gamepadJumpHeld = !!pressed[0];
  if (game && game.state !== 'lobby' && game.state !== 'ended') { if (edge(0)) jumpPressed = true; if (edge(3)) toggleCamera(); if (edge(9)) { game.setPaused(!game.paused); } }
  gamepadOld = pressed;
}
function readInput() {
  readGamepad(); const input = emptyInput();
  input.throttle = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  input.steer = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  input.roll = (keys.has('KeyQ') ? 1 : 0) - (keys.has('KeyE') ? 1 : 0);
  if (Math.abs(touchThrottle) > .08) input.throttle = touchThrottle; else if (gamepadThrottle) input.throttle = gamepadThrottle;
  if (Math.abs(touchSteer) > .08) input.steer = touchSteer; else if (gamepadSteer) input.steer = gamepadSteer;
  input.roll ||= gamepadRoll;
  input.boost = mouseBoost || touchBoost || keys.has('KeyF') || keys.has('ControlLeft') || gamepadBoost;
  input.drift = keys.has('ShiftLeft') || keys.has('ShiftRight') || mouseDrift || gamepadDrift;
  input.jump = jumpPressed; input.jumpHeld = keys.has('Space') || touchJump || gamepadJumpHeld; jumpPressed = false;
  return input;
}
const stick = $('touch-stick'); let stickPointer = null;
function moveStick(e) { const r = stick.getBoundingClientRect(), x = (e.clientX - r.left - r.width / 2) / (r.width * .4), y = (e.clientY - r.top - r.height / 2) / (r.height * .4), len = Math.hypot(x, y), s = len > 1 ? 1 / len : 1; touchSteer = x * s; touchThrottle = -y * s; stick.querySelector('i').style.transform = `translate(${touchSteer * 33}px,${-touchThrottle * 33}px)`; }
stick.addEventListener('pointerdown', e => { e.preventDefault(); stickPointer = e.pointerId; stick.setPointerCapture(e.pointerId); moveStick(e); }); stick.addEventListener('pointermove', e => { if (e.pointerId === stickPointer) moveStick(e); });
function endStick() { stickPointer = null; touchThrottle = touchSteer = 0; stick.querySelector('i').style.transform = ''; } stick.addEventListener('pointerup', endStick); stick.addEventListener('pointercancel', endStick);
for (const [id, type] of [['touch-boost', 'boost'], ['touch-jump', 'jump']]) { const b = $(id); b.addEventListener('pointerdown', e => { e.preventDefault(); b.setPointerCapture(e.pointerId); b.classList.add('pressed'); if (type === 'boost') touchBoost = true; else { touchJump = true; jumpPressed = true; } }); const end = () => { b.classList.remove('pressed'); if (type === 'boost') touchBoost = false; else touchJump = false; }; b.addEventListener('pointerup', end); b.addEventListener('pointercancel', end); }

function clock(value) { const v = Math.max(0, Math.ceil(value)); return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`; }
function updateHUD() {
  if (!game?.player) return; const p = game.player;
  $('speed').textContent = String(Math.round(p.speed * 3.6)).padStart(3, '0'); $('boost').textContent = game.freeplay ? '∞' : Math.round(p.boost);
  $('boost-arc').style.strokeDashoffset = 292.17 * (1 - (game.freeplay ? 1 : p.boost / 100)); $('hud').classList.toggle('boosting', p.boosting);
  $('jump-one').classList.toggle('ready', p.jumpCount < 1); $('jump-two').classList.toggle('ready', p.jumpCount < 2);
  $('camera-status').textContent = game.ballCam ? 'WŁ.' : 'WYŁ.'; $('camera-status').style.color = game.ballCam ? 'var(--lime)' : '#a1b18d'; $('camera-button').querySelector('.status-dot').style.background = game.ballCam ? 'var(--lime)' : '#77856a'; show($('supersonic'), !!p.supersonic && p.demolished <= 0);
  $('clock').textContent = game.freeplay ? 'TRENING' : game.overtime ? '+' + clock(game.overtimeTime) : clock(game.timeRemaining);
  $('period').textContent = game.freeplay ? 'DOPALACZ BEZ LIMITU' : game.overtime ? 'ZŁOTY GOL' : game.timeRemaining <= 0 ? 'OSTATNIA PIŁKA' : 'CZAS MECZU'; $('clock').parentElement.classList.toggle('overtime', game.overtime);
  $('score-home').textContent = game.score[0]; $('score-away').textContent = game.score[1];
  if (!$('scoreboard').classList.contains('hidden')) scoreboard(); drawMinimap();
}
const projection = new THREE.Vector3();
function updateMarkers() {
  if (!game?.player || game.state === 'lobby') return; const camera = visuals.camera, w = innerWidth, h = innerHeight;
  for (const [car, el] of nameplates) {
    projection.copy(car.visual.root.position).add(new THREE.Vector3(0, 2.35, 0)).project(camera); const visible = car.visual.root.visible && projection.z < 1 && projection.z > -1 && Math.abs(projection.x) < 1.05 && Math.abs(projection.y) < 1.05;
    el.style.display = visible ? '' : 'none'; if (visible) { const dist = camera.position.distanceTo(car.visual.root.position); el.style.transform = `translate(${(projection.x * .5 + .5) * w}px,${(-projection.y * .5 + .5) * h}px) translate(-50%,-100%)`; el.style.opacity = Math.min(1, 55 / Math.max(1, dist)); }
  }
  projection.copy(visuals.ball.position).project(camera); const outside = projection.z > 1 || Math.abs(projection.x) > .93 || Math.abs(projection.y) > .88;
  show($('ball-arrow'), outside && game.state === 'playing'); if (outside) { let x = projection.x, y = projection.y; if (projection.z > 1) { x *= -1; y *= -1; } const px = THREE.MathUtils.clamp((x * .5 + .5) * w, 25, w - 80), py = THREE.MathUtils.clamp((-y * .5 + .5) * h, 100, h - 140); $('ball-arrow').style.left = `${px}px`; $('ball-arrow').style.top = `${py}px`; }
}
function drawMinimap() {
  const canvas = $('minimap'), c = canvas.getContext('2d'), w = canvas.width, h = canvas.height; c.clearRect(0, 0, w, h);
  const px = x => w / 2 + x / 84 * (w - 16), pz = z => h / 2 + z / 128 * (h - 24);
  c.strokeStyle = '#d4ecbd33'; c.lineWidth = 1; c.strokeRect(8, 12, w - 16, h - 24); c.beginPath(); c.moveTo(8, h / 2); c.lineTo(w - 8, h / 2); c.stroke(); c.beginPath(); c.arc(w / 2, h / 2, 13, 0, 7); c.stroke();
  c.strokeStyle = '#c1ff4299'; c.lineWidth = 3; c.beginPath(); c.moveTo(px(-13), h - 12); c.lineTo(px(13), h - 12); c.stroke(); c.strokeStyle = '#ff885799'; c.beginPath(); c.moveTo(px(-13), 12); c.lineTo(px(13), 12); c.stroke();
  for (const pad of game.pads.filter(p => p.large && p.timer <= 0)) { c.fillStyle = '#e6bc6c77'; c.beginPath(); c.arc(px(pad.x), pz(pad.z), 2, 0, 7); c.fill(); }
  for (const car of game.cars) { if (car.demolished > 0) continue; const p = car.body.position; const f = car.body.quaternion.vmult({ x: 0, y: 0, z: 1 }); c.save(); c.translate(px(p.x), pz(p.z)); c.rotate(-Math.atan2(f.x, f.z)); c.fillStyle = car.team ? '#ff8857' : '#c1ff42'; c.beginPath(); c.moveTo(0, 4); c.lineTo(-3, -3); c.lineTo(3, -3); c.closePath(); c.fill(); if (car.isPlayer) { c.strokeStyle = '#ffffff'; c.lineWidth = 1.5; c.stroke(); } c.restore(); }
  const b = game.ball.position; c.fillStyle = '#ffffff'; c.beginPath(); c.arc(px(b.x), pz(b.z), 3.2, 0, 7); c.fill();
}

async function init() {
  try {
    visuals = new Visuals($('viewport'), (p, text) => { $('loading-progress').style.width = `${Math.round(p * 100)}%`; $('loading-status').textContent = text; });
    particles = new Particles(visuals.scene); await visuals.load();
    visuals.preview.setPaint(selectedPaint); visuals.preview.setFinish(selectedFinish); visuals.setQuality(saved.quality || (visuals.softwareRenderer ? 'low' : 'high')); $('quality-setting').value = visuals.quality;
    game = new Game(visuals, audio, particles, { onCount, onNotify: notify, onGoal, onGoalEnd: () => show($('goal-banner'), false), onReplay: value => show($('replay-tag'), value), onPause: value => { show($('pause-screen'), value); show($('scoreboard'), false); }, onStart, onEnd });
    applyReducedEffects();
    const canvas = visuals.renderer.domElement; let dragging = false, dragX = 0;
    canvas.addEventListener('pointerdown', e => {
      if (game.state === 'lobby') { if (e.button === 0) { dragging = true; dragX = e.clientX; canvas.setPointerCapture(e.pointerId); } }
      else if (!game.paused && e.pointerType !== 'touch') { if (e.button === 0) mouseBoost = true; if (e.button === 2) mouseDrift = true; }
    });
    canvas.addEventListener('pointermove', e => { if (dragging && game.state === 'lobby') { visuals.previewTargetAngle += (e.clientX - dragX) * .008; dragX = e.clientX; } });
    const endPointer = e => { dragging = false; if (e.button === 0) mouseBoost = false; if (e.button === 2) mouseDrift = false; };
    window.addEventListener('pointerup', endPointer); canvas.addEventListener('pointercancel', () => { dragging = false; mouseBoost = mouseDrift = false; }); canvas.addEventListener('contextmenu', e => e.preventDefault());
    ready = true; visuals.camera.position.set(7.5, 3.5, 9.2); visuals.updateLobby(.1, 0); visuals.render();
    $('loading').classList.add('loaded');
    for (const id of ['intro-play','intro-training','intro-garage']) $(id).disabled = false;
    window.__ROADSTER__ = { game, visuals, particles, ready: true, start: startMatch, menu: returnMenu, opening: showOpeningMenu };
    $('intro-play').focus({ preventScroll: true });
    let previous = performance.now(), uiTime = 0, time = 0;
    function frame(now) {
      requestAnimationFrame(frame); const dt = Math.min(.5, Math.max(.001, (now - previous) / 1000)); previous = now; time += dt;
      const input = readInput(); if (game.state === 'lobby') visuals.updateLobby(dt, saved.reduced ? 0 : time, garage); else game.update(dt, input, time);
      if (!game.paused) particles.update(dt); if (game.state !== 'lobby') updateMarkers();
      uiTime += dt; if (uiTime > .05) { uiTime = 0; if (game.state !== 'lobby') updateHUD(); }
      visuals.render();
    }
    requestAnimationFrame(frame);
  } catch (error) {
    console.error('Roadster Ligue initialization failed:', error); $('loading-status').textContent = 'Nie udało się uruchomić grafiki 3D. Włącz WebGL i odśwież stronę.'; $('loading-status').style.color = '#ffab77'; $('loading').querySelector('p').textContent = 'POTRZEBUJEMY JESZCZE JEDNEJ PRÓBY';
    const retry = document.createElement('button'); retry.className = 'outline-button'; retry.textContent = 'ODŚWIEŻ STRONĘ'; retry.style.marginTop = '25px'; retry.addEventListener('click', () => location.reload()); $('loading').append(retry);
  }
}
// First launch always stops on the static warning, even when settings were saved.
function applyReducedEffects() {
  const reduced = saved.reduced !== false;
  document.body.classList.toggle('reduced-effects', reduced);
  $('safety-reduced').checked = $('reduced-setting').checked = reduced;
  $('shake-setting').checked = !reduced && saved.shake !== false;
  $('shake-setting').disabled = reduced;
  if (particles) { particles.reduced = reduced; if (reduced) particles.clear(); }
  if (visuals) visuals.reducedEffects = reduced;
  if (game) { game.reducedEffects = reduced; game.shakeEnabled = !reduced && saved.shake !== false; }
}
function showOpeningMenu() {
  if (!ready) return;
  returnMenu(); show($('lobby'), false); show($('opening-menu'));
  document.body.dataset.phase = 'intro'; $('intro-play').focus({ preventScroll: true });
}
$('intro-play').addEventListener('click', () => { setPage('play'); $('play-button').focus({ preventScroll: true }); });
$('intro-training').addEventListener('click', () => startMatch(true));
$('intro-garage').addEventListener('click', () => setPage('garage'));
$('lobby-opening').addEventListener('click', showOpeningMenu);
for (const [id, dialog] of [['intro-settings','settings-dialog'], ['intro-controls','controls-dialog'], ['intro-credits','credits-dialog'], ['intro-safety','safety-dialog']]) {
  $(id).addEventListener('click', () => openDialog(dialog));
}
const desktop = Boolean(window.__TAURI_INTERNALS__);
$('runtime-label').textContent = desktop ? 'TAURI · DESKTOP' : 'BROWSER · WEBGL';
if (desktop) document.addEventListener('click', e => {
  const link = e.target.closest?.('a[href^="https://"]');
  if (link) { e.preventDefault(); void openUrl(link.href).catch(() => toast('Nie udało się otworzyć odnośnika w przeglądarce systemowej.')); }
});
let bootStarted = false;
$('safety-continue').addEventListener('click', () => {
  if (bootStarted) return;
  bootStarted = true; $('safety-continue').disabled = true;
  saved.reduced = $('safety-reduced').checked; applyReducedEffects(); persist();
  show($('safety-screen'), false); document.body.classList.remove('preflight');
  show($('opening-menu')); show($('loading')); document.body.dataset.phase = 'intro';
  void init();
});
$('safety-exit').addEventListener('click', () => {
  $('safety-status').textContent = 'Gra nie została uruchomiona. Możesz zamknąć tę kartę lub okno, albo wrócić do gry, gdy będziesz gotowy.';
  show($('safety-status'));
});
applyReducedEffects();
