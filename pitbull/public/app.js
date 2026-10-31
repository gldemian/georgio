// One <audio> per tile so clips overlap freely. HTMLAudio (not Web Audio) on purpose:
// iOS mutes Web Audio when the ringer switch is off, but plays media elements.

const $ = (id) => document.getElementById(id);
const grid = $('grid');
const board = grid.parentElement;
const face = $('face');
const status = $('status');
const ledPlays = $('led-plays');
const ledLive = $('led-live');

const led = (n) => String(Math.max(0, Math.min(999, n))).padStart(3, '0');
let plays = Number(localStorage.getItem('pit.plays') || 0);
ledPlays.textContent = led(plays);

/** @type {{ el: HTMLButtonElement, audio: HTMLAudioElement, label: string }[]} */
const tiles = [];
let raf = 0;

function refresh() {
  const live = tiles.filter((t) => !t.audio.paused).length;
  ledLive.textContent = led(live);
  face.classList.toggle('live', live > 0);
  if (live && !raf) raf = requestAnimationFrame(tickProgress);
}

function tickProgress() {
  raf = 0;
  let any = false;
  for (const t of tiles) {
    const d = t.audio.duration;
    if (d) t.el.style.setProperty('--p', String(t.audio.currentTime / d));
    if (!t.audio.paused) any = true;
  }
  if (any) raf = requestAnimationFrame(tickProgress);
}

function setState(t, state) {
  t.el.classList.toggle('playing', state === 'playing');
  t.el.classList.toggle('paused', state === 'paused');
  t.el.setAttribute('aria-pressed', String(state === 'playing'));
  if (state === 'idle') t.el.style.setProperty('--p', '0');
}

function toggle(t) {
  const a = t.audio;
  if (!a.paused) {
    a.pause();
    return;
  }
  if (a.ended) a.currentTime = 0;
  if (a.currentTime === 0) {
    plays += 1;
    localStorage.setItem('pit.plays', String(plays));
    ledPlays.textContent = led(plays);
  }
  board.classList.remove('rattle'); void board.offsetWidth; board.classList.add('rattle');
  navigator.vibrate?.(12);
  a.play().catch(() => { status.textContent = `Couldn't play ${t.label}`; });
}

function stopAll() {
  for (const t of tiles) {
    t.audio.pause();
    t.audio.currentTime = 0;
    setState(t, 'idle');
  }
  status.textContent = 'Silence. For now.';
  refresh();
}

function render(sounds) {
  grid.innerHTML = '';
  sounds.forEach((s, i) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.id = `tile-${s.id}`;
    el.className = `tile c${(i % 6) + 1}`;
    el.setAttribute('aria-pressed', 'false');
    el.innerHTML = '<span class="state" aria-hidden="true"></span><span class="num"></span><span class="label"></span><span class="bar"></span>';
    el.querySelector('.num').textContent = String(i + 1);
    el.querySelector('.label').textContent = s.label;

    const audio = new Audio(`sounds/${s.file}`);
    audio.preload = 'auto';
    const t = { el, audio, label: s.label };

    audio.addEventListener('play', () => { setState(t, 'playing'); status.textContent = `▶ ${s.label}`; refresh(); });
    audio.addEventListener('pause', () => { if (!audio.ended && audio.currentTime > 0) setState(t, 'paused'); refresh(); });
    audio.addEventListener('ended', () => { audio.currentTime = 0; setState(t, 'idle'); refresh(); });

    el.addEventListener('click', () => toggle(t));
    el.addEventListener('contextmenu', (e) => e.preventDefault());

    tiles.push(t);
    grid.appendChild(el);
  });
}

face.addEventListener('click', stopAll);

fetch('sounds/manifest.json')
  .then((r) => r.json())
  .then(render)
  .catch(() => { status.textContent = 'Could not load sounds/manifest.json'; });
