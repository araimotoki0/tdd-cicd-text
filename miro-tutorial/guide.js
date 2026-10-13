// 案内役の3人: せりふごとに、Miro 風の画面を描き、声を流し、字幕を声に合わせて出し、キャラを動かす。
// ・「やってみる」(try) … せりふの後、光っている所を押すと次へ（操作しながら覚える）
// ・「通しで見る」(all) … 押す所は、話した人のカーソルが動いて押してくれる
// ・「この章だけ」(one) … その章だけ流して止まる
// 仕組みは AITech の guide.js / demo.js と同じ。ブラウザは人が押すまで音を出さないので、最初の1回は押してもらう。
(function () {
'use strict';
const L = window.MIRO_LINES || [];
if (!L.length) return;
const VID = new Set(window.MIRO_VIDEOS || []), OPEN = new Set(window.MIRO_OPEN || []), BLINK = new Set(window.MIRO_BLINK || []);
const DIR = 'miro-tutorial/';
const NAME = { joe: 'Joe', miho: 'Miho先生', arai: 'Arai先生' };
const COLOR = { joe: '#2b50ff', miho: '#ff5c8a', arai: '#2fbf8f' };
const RATES = [1, 1.25, 1.5, 2];
const GAP = 0.7; // 章と章のあいだ（秒）
const SC = window.MIRO_SCENES;
const $ = (s) => document.querySelector(s);
const win = $('#win'), bubble = $('.bubble'), chip = $('.bubble .chip'), say = $('.bubble .say'), dots = $('.bubble .dots'), endlinks = $('.endlinks'), again = $('.endlinks button.again'), fx = $('.fx');
const stage = $('.charstage'), spr = $('.spr'), imgBase = $('.spr .base'), imgOpen = $('.spr .open'), imgBlink = $('.spr .blink');
const vids = [$('.charstage .va'), $('.charstage .vb')];
const nametag = $('.nametag');
const g = $('.guide'), playBtn = $('.g-play');
const block = $('#win .block'), hole = $('#win .hole'), target = $('#win .target'), tap = $('#win .tap'), autocur = $('#win .autocur');
const store = {
  get(k) { try { return localStorage.getItem('miro.' + k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem('miro.' + k, v); } catch (e) { /* 保存できない環境でも動く */ } },
};
const mmss = (sec) => { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); };
const totalSec = L.reduce((a, l) => a + l.duration, 0) + GAP * (L.length - 1);

// 押す練習: せりふの後に押す所（#win の座標）と、押したときの反応
const tb = SC.tb;
const PRACTICE = {
  l03: [{ rect: [1198, 684, 66, 50], label: '＋ を押す', act: () => SC.act.zoomIn() }],
  l05: [{ rect: tb(2), label: '① 付箋', act: () => SC.act.tool(2) }, { rect: [90, 480, 220, 220], label: '② ボードを押す', act: () => SC.act.addNote() }],
  l06: [{ rect: [110, 512, 170, 170], label: '付箋を押す', act: () => SC.act.none() }],
  l07: [{ rect: tb(3), label: 'テキスト', act: () => SC.act.tool(3) }],
  l08: [{ rect: tb(6), label: 'フレーム', act: () => SC.act.tool(6) }],
  l09: [{ rect: tb(7), label: 'コメント', act: () => SC.act.tool(7) }],
  l10: [{ rect: [1106, 7, 152, 48], label: 'タイマー', act: () => SC.act.timer() }],
  l11: [{ rect: [1004, 684, 50, 50], label: '全体表示', act: () => SC.act.fit() }],
};

const S = { cur: 0, mode: '', playing: false, paused: false, started: false, waiting: false, el: 0, pstep: 0,
  rate: RATES.includes(Number(store.get('rate'))) ? Number(store.get('rate')) : 1, run: 0, raf: 0, timer: 0 };

// ── 声（Web Audio で大きさを測って口パクする。使えない環境では、字幕が進む間パクパクさせる）
const audio = new Audio();
audio.preload = 'auto';
let actx = null;
function ensureAudioGraph() {
  if (actx) { actx.resume().catch(() => {}); return; }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    actx = new AC();
  } catch (e) { actx = null; }
}
// 声の大きさ（lines.js の env: 25回/秒・0〜9）。声が鳴っていないときは null
function level() {
  const l = L[S.cur]; if (!l || !l.env || audio.paused) return null;
  const k = Math.floor(audio.currentTime * 25);
  if (k < 0 || k >= l.env.length) return null;
  return Number(l.env[k]) / 9;
}
// 効果音（押した・できた・全部できた）。音は小さめ。音が出せる状態のときだけ
function sfx(kind) {
  if (!actx || actx.state !== 'running' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const t = actx.currentTime;
  const tone = (f0, f1, at, dur, vol, type) => { const o = actx.createOscillator(), gn = actx.createGain(); o.type = type || 'sine'; o.frequency.setValueAtTime(f0, at); if (f1) o.frequency.exponentialRampToValueAtTime(f1, at + dur * .8); o.connect(gn); gn.connect(actx.destination); gn.gain.setValueAtTime(.0001, at); gn.gain.exponentialRampToValueAtTime(vol, at + .015); gn.gain.exponentialRampToValueAtTime(.0001, at + dur); o.start(at); o.stop(at + dur + .02); };
  if (kind === 'tap') tone(660, 440, t, .1, .1);
  else if (kind === 'ok') { tone(784, 0, t, .12, .12, 'triangle'); tone(1175, 0, t + .09, .3, .12, 'triangle'); }
  else if (kind === 'done') [523, 659, 784, 1047].forEach((f, i) => tone(f, 0, t + i * .12, .5, .12, 'triangle'));
}
// 紙吹雪（全部できたとき）
function confetti() {
  if (!fx || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const ctx = fx.getContext('2d'); const r = fx.parentElement.getBoundingClientRect(); const dpr = devicePixelRatio || 1;
  fx.width = r.width * dpr; fx.height = r.height * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cols = ['#ffd93b', '#ff7a59', '#2b50ff', '#2fbf8f', '#ff5c8a', '#ffffff'];
  const ps = Array.from({ length: 150 }, () => ({ x: r.width * (0.25 + Math.random() * 0.5), y: r.height * 0.45, vx: (Math.random() - .5) * 16, vy: -7 - Math.random() * 11, s: 6 + Math.random() * 9, c: cols[Math.floor(Math.random() * cols.length)], a: Math.random() * Math.PI, va: (Math.random() - .5) * .3 }));
  const t0 = performance.now();
  (function frame(now) {
    const dt = (now - t0) / 1000; ctx.clearRect(0, 0, r.width, r.height); let alive = false;
    ps.forEach((p) => { p.vy += .35; p.x += p.vx; p.y += p.vy; p.vx *= .99; p.a += p.va; if (p.y < r.height + 20) alive = true;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.globalAlpha = Math.max(0, Math.min(1, 1 - (dt - 2) / .8)); ctx.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * .66); ctx.restore(); });
    if (alive && dt < 3) requestAnimationFrame(frame); else ctx.clearRect(0, 0, r.width, r.height);
  })(t0);
}
const preloader = new Audio(); preloader.preload = 'auto';
function preloadVoice(i) { const n = L[i + 1]; if (n) preloader.src = DIR + 'voice/' + n.id + '.mp3?v=' + Math.round(n.duration * 100); }

// ── キャラ（止め絵: 口パク・まばたき・ゆらぎ ／ 動く絵: Veo の 8 秒ループ）
function pickVideo(key) {
  let v = vids.find((x) => x.dataset.p === key);
  if (!v) { v = vids.find((x) => !x.classList.contains('on')) || vids[0]; v.src = DIR + 'video/' + key + '.mp4'; v.dataset.p = key; }
  return v;
}
function preloadVideo(i) {
  const n = L[i + 1]; if (!n) return;
  const key = n.who + '_' + n.pose; if (!VID.has(key)) return;
  if (vids.some((x) => x.dataset.p === key)) return;
  const v = vids.find((x) => x.dataset.p !== curKey) || vids[1];   // いま話している人の動く絵は上書きしない
  v.src = DIR + 'video/' + key + '.mp4'; v.dataset.p = key; v.load();
}
let curKey = '';
function setChar(who, pose, speaking) {
  const key = who + '_' + pose;
  if (key !== curKey) {
    curKey = key;
    imgBase.src = DIR + 'char/' + key + '.webp';
    imgOpen.src = OPEN.has(key) ? DIR + 'char/' + key + '_open.webp' : '';
    imgBlink.src = BLINK.has(key) ? DIR + 'char/' + key + '_blink.webp' : '';
    stage.classList.remove('pop'); void stage.offsetWidth; stage.classList.add('pop');
  }
  nametag.textContent = NAME[who]; nametag.style.color = COLOR[who];
  document.documentElement.style.setProperty('--who', COLOR[who]);
  stage.classList.toggle('talking', !!speaking);
  stage.classList.toggle('cheer', pose === 'cheer');
  if (speaking && VID.has(key) && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const v = pickVideo(key);
    const show = () => { if (v.dataset.p === key && !v.paused && curKey === key) { vids.forEach((x) => x.classList.toggle('on', x === v)); stage.classList.add('moving'); } };
    v.addEventListener('playing', show, { once: true });
    v.play().then(show).catch(() => {});
  } else {
    vids.forEach((v) => { v.pause(); v.classList.remove('on'); });
    stage.classList.remove('moving');
  }
}
// 口パク（声の大きさ。ヒステリシスと最短の保持時間でパタパタしすぎないように）
let mouthOpen = false, lastMouth = 0, nextFlap = 0;
function tickFace(now) {
  const canOpen = S.playing && !stage.classList.contains('moving') && !!imgOpen.getAttribute('src');
  let want = mouthOpen;
  if (canOpen) {
    const lv = level();
    if (lv !== null) { if (!mouthOpen && lv > 0.4) want = true; else if (mouthOpen && lv < 0.2) want = false; }
    else if (now > nextFlap) { want = !mouthOpen; nextFlap = now + 90 + Math.random() * 90; }
  } else want = false;
  if (want !== mouthOpen && now - lastMouth > 65) { mouthOpen = want; lastMouth = now; spr.classList.toggle('m-open', mouthOpen); }
  requestAnimationFrame(tickFace);
}
requestAnimationFrame(tickFace);
(function blinkLoop() {
  setTimeout(() => {
    if (imgBlink.getAttribute('src')) { spr.classList.add('m-blink'); setTimeout(() => { spr.classList.remove('m-blink'); blinkLoop(); }, 110); }
    else blinkLoop();
  }, 2200 + Math.random() * 3800);
})();

// ── 練習（暗幕・押せる所・「ここを押す」）
function showPractice(step) {
  const [x, y, w, h] = step.rect, pad = 8;
  Object.assign(hole.style, { left: (x - pad) + 'px', top: (y - pad) + 'px', width: (w + pad * 2) + 'px', height: (h + pad * 2) + 'px' });
  const k = SC.scale(), min = 48 / k;
  const tw2 = Math.max(w, min), th2 = Math.max(h, min);
  Object.assign(target.style, { left: (x - (tw2 - w) / 2) + 'px', top: (y - (th2 - h) / 2) + 'px', width: tw2 + 'px', height: th2 + 'px' });
  target.setAttribute('aria-label', step.label || 'ここを押す');
  [block, hole, target, tap].forEach((e) => { e.hidden = false; });
  win.classList.add('practice');
  tap.textContent = step.label || 'ここを押す';
  const tw = tap.offsetWidth || 150, th = tap.offsetHeight || 44;
  let tx = x + w / 2 - tw / 2, ty = y - th - 14;
  if (ty < 4) ty = y + h + 12;
  tx = Math.max(12, Math.min(1290 - tw - 16, tx));
  tap.style.left = tx + 'px'; tap.style.top = ty + 'px';
  ensureVisible(target);
}
// 押す所が画面の外なら、見える所まで動かす（スマホで枠を操作したあとなど）
function ensureVisible(el) {
  const r = el.getBoundingClientRect();
  if (r.top < 60 || r.bottom > innerHeight - 10) el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
}
function hidePractice() { [block, hole, target, tap].forEach((e) => { e.hidden = true; }); win.classList.remove('practice'); }
function ripple(x, y) { const r = document.createElement('i'); r.className = 'ripple'; r.style.left = x + 'px'; r.style.top = y + 'px'; win.appendChild(r); setTimeout(() => r.remove(), 600); }
// いまの練習の1手を実行して、次の手か次の章へ
function doStep(run) {
  const pr = PRACTICE[L[S.cur].id]; if (!pr) return;
  const step = pr[S.pstep]; if (!step) return;
  const [x, y, w, h] = step.rect;
  ripple(x + w / 2, y + h / 2); sfx('ok');
  try { step.act(); } catch (e) { /* 見た目の反応だけなので止めない */ }
  S.pstep++;
  if (pr[S.pstep]) {
    showPractice(pr[S.pstep]);
    if (S.mode === 'all') S.timer = setTimeout(() => { if (run === S.run) autoPerform(run); }, 350);
    return;
  }
  S.waiting = false; hidePractice();
  if (S.mode === 'all') autocur.hidden = true;
  const next = S.cur + 1;
  if (next < L.length) S.timer = setTimeout(() => { if (run === S.run) play(next, S.mode); }, 350);
  else endAll(run);
}
// 通しで見るとき: 話した人のカーソルが押す所まで動いて押す
function autoPerform(run) {
  const pr = PRACTICE[L[S.cur].id]; const step = pr && pr[S.pstep]; if (!step) return;
  const [x, y, w, h] = step.rect;
  autocur.querySelector('span').textContent = NAME[L[S.cur].who];
  if (autocur.hidden) { autocur.hidden = false; autocur.style.left = '640px'; autocur.style.top = '420px'; void autocur.offsetWidth; }
  autocur.style.left = (x + w / 2 - 4) + 'px'; autocur.style.top = (y + h / 2 - 4) + 'px';
  S.timer = setTimeout(() => { if (run === S.run) doStep(run); }, 850 / Math.min(S.rate, 1.5));
}
target.addEventListener('click', () => { if (S.waiting) doStep(S.run); });
target.addEventListener('keydown', (e) => { if (S.waiting && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); doStep(S.run); } });

// ── 枠（章のバー・残り時間・ボタン）
const segs = L.map((l, i) => {
  const b = document.createElement('button');
  b.type = 'button'; b.title = String(i + 1).padStart(2, '0') + '. ' + l.text;
  b.innerHTML = '<i></i>';
  b.addEventListener('click', () => { ensureAudioGraph(); play(i, S.mode || 'try'); });
  g.querySelector('.g-seg').appendChild(b);
  return b;
});
function setRate(r) {
  S.rate = r; store.set('rate', String(r)); audio.playbackRate = r;
  g.querySelectorAll('.g-rates button').forEach((x) => x.classList.toggle('on', Number(x.dataset.r) === r));
  info();
}
RATES.forEach((r) => {
  const b = document.createElement('button'); b.type = 'button'; b.textContent = r + '×'; b.dataset.r = r;
  b.addEventListener('click', () => setRate(r)); g.querySelector('.g-rates').appendChild(b);
});
function info() {
  g.querySelector('.g-ch').textContent = String(S.cur + 1).padStart(2, '0') + ' / ' + String(L.length).padStart(2, '0') + ' 章';
  if (!S.started) { g.querySelector('.g-mode').textContent = ''; g.querySelector('.g-time').textContent = '通しで 約' + Math.max(1, Math.round(totalSec / S.rate / 60)) + '分'; return; }
  let rest = Math.max(0, L[S.cur].duration - S.el);
  if (S.mode !== 'one') for (let i = S.cur + 1; i < L.length; i++) rest += GAP + L[i].duration;
  g.querySelector('.g-mode').textContent = { all: '通しで再生', try: 'やってみる', one: 'この章だけ' }[S.mode] || '';
  g.querySelector('.g-time').textContent = '残り ' + mmss(rest / S.rate);
}
function setBtn() {
  playBtn.innerHTML = S.waiting ? '👉 光っている所を押してください' : S.playing ? '⏸ 一時停止' : S.paused ? '▶ 続きを再生' : S.started ? '▶ ここから再生' : bubble.classList.contains('ended') ? '🔁 もう一度 最初から' : '▶ はじめる（音が出ます）';
  bubble.classList.toggle('playing', S.playing);
  g.querySelector('.g-prev').disabled = S.cur <= 0;
  g.querySelector('.g-next').disabled = S.cur >= L.length - 1;
  g.querySelectorAll('.g-modes button').forEach((b) => b.classList.toggle('on', b.dataset.mode === S.mode));
  segs.forEach((b, i) => {
    b.classList.toggle('done', i < S.cur || (i === S.cur && S.el >= L[i].duration - 0.05));
    b.firstChild.style.width = i === S.cur && S.started ? Math.min(100, S.el / L[i].duration * 100) + '%' : '0';
  });
  document.querySelectorAll('.ch-list li').forEach((li, i) => {
    li.classList.toggle('speaking', (S.playing || S.paused || S.waiting) && i === S.cur);
    const b = li.querySelector('.listen'); const on = S.playing && i === S.cur;
    b.classList.toggle('on', on); b.textContent = on ? '説明中…' : 'この章だけ聞く';
  });
  document.querySelectorAll('.hero-btns .btn').forEach((b) => { b.classList.toggle('on', S.playing && b.dataset.mode === S.mode); });
  info();
}
function renderDots(i) { dots.innerHTML = L.map((_, k) => '<i class="' + (k === i ? 'on' : k < i ? 'done' : '') + '"></i>').join(''); }
function scrollToStage() { const r = $('#stage').getBoundingClientRect(); if (r.top < 0 || r.bottom > innerHeight) $('#stage').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); }

// 話していないとき: その章の画面と、せりふの全文を出しておく
function preview(i) {
  if (S.playing || S.paused || S.waiting) return;
  const l = L[i]; S.cur = i; S.el = 0;
  SC.render(l.scene);
  chip.textContent = NAME[l.who]; chip.style.background = COLOR[l.who];
  say.textContent = l.text; renderDots(i);
  setChar(l.who, l.pose, false);
  setBtn();
}
function stop() {
  S.run++;
  cancelAnimationFrame(S.raf); clearTimeout(S.raf); clearTimeout(S.timer);
  audio.pause();
  S.playing = false; S.paused = false; S.waiting = false; S.pstep = 0;
  hidePractice(); autocur.hidden = true;
}

// i 章目を流す。mode は 'all'（通し）・'try'（やってみる）・'one'（この章だけ）
function play(i, mode, opts) {
  if (!L[i]) return;
  stop();
  const run = S.run, l = L[i];
  S.cur = i; S.mode = mode; S.playing = true; S.started = true; S.el = 0;
  if (i === 0) SC.reset();
  if (opts && opts.scroll) scrollToStage();
  SC.render(l.scene);
  chip.textContent = NAME[l.who]; chip.style.background = COLOR[l.who];
  endlinks.hidden = true; bubble.classList.remove('ended'); renderDots(i);
  setChar(l.who, l.pose, true);
  preloadVoice(i); preloadVideo(i);
  // 字幕と残り時間は「声の再生位置」で進める。声が鳴り始めるまでは進めない。声が届かないときは時計で進める
  let src = 'wait', clock = 0, last = performance.now(), shown = 0;
  const total = l.duration * 1000;
  audio.onended = null;
  audio.onplaying = () => { if (src === 'wait') src = 'voice'; };
  audio.onerror = () => { if (run === S.run && src !== 'clock') { src = 'clock'; last = performance.now(); } };
  audio.src = DIR + 'voice/' + l.id + '.mp3?v=' + Math.round(l.duration * 100);
  audio.playbackRate = S.rate;
  audio.play().catch(() => { if (run === S.run && src === 'wait') { src = 'clock'; last = performance.now(); } });
  say.innerHTML = '<span></span><i class="cur"></i>';
  const span = say.firstChild;
  setBtn();
  const from = performance.now();
  let lastInfo = 0;
  const tick = () => {
    if (run !== S.run) return;
    const now = performance.now();
    if (src === 'wait' && now - from > 4000) { src = 'clock'; last = now; }
    if (src === 'clock') clock += (now - last) * S.rate;
    last = now;
    const el = src === 'voice' ? audio.currentTime * 1000 : src === 'clock' ? clock : 0;
    S.el = el / 1000;
    shown = Math.max(shown, Math.ceil(l.text.length * Math.min(1, el / (total * 0.92))));
    span.textContent = l.text.slice(0, shown);
    segs[i].firstChild.style.width = Math.min(100, el / total * 100) + '%';
    if (now - lastInfo > 250) { info(); lastInfo = now; }
    const ended = src === 'voice' ? audio.ended : src === 'clock' && clock >= total;
    if (ended) { finish(run); return; }
    S.raf = requestAnimationFrame(tick);
  };
  S.raf = requestAnimationFrame(tick);
}
function finish(run) {
  if (run !== S.run) return;
  const l = L[S.cur];
  S.playing = false; S.el = l.duration;
  say.textContent = l.text;
  setChar(l.who, l.pose, false);
  const pr = PRACTICE[l.id];
  if (pr && S.mode !== 'one') {
    S.pstep = 0; S.waiting = true; showPractice(pr[0]); setBtn();
    if (S.mode === 'all') S.timer = setTimeout(() => { if (run === S.run) autoPerform(run); }, 300);
    else target.focus({ preventScroll: true });
    return;
  }
  const next = S.cur + 1;
  if (S.mode !== 'one' && next < L.length) { setBtn(); S.timer = setTimeout(() => { if (run === S.run) play(next, S.mode); }, GAP * 1000 / S.rate); }
  else if (S.mode !== 'one') endAll(run);
  else setBtn();
}
function endAll(run) {
  if (run !== S.run) return;
  S.started = false; S.waiting = false; hidePractice(); autocur.hidden = true;
  const l = L[S.cur];
  say.textContent = '🎉 おつかれさま！ これで Miro の基本は大丈夫です。講座で お会いしましょう。';
  setChar(l.who, 'cheer', false);
  endlinks.hidden = false; bubble.classList.add('ended');
  sfx('done'); confetti();
  setBtn();
}
function pause() {
  S.run++; cancelAnimationFrame(S.raf); clearTimeout(S.raf); clearTimeout(S.timer);
  audio.pause(); vids.forEach((v) => v.pause());
  S.playing = false; S.paused = true; stage.classList.remove('moving', 'talking'); setBtn();
}
function resume() {
  const l = L[S.cur];
  S.paused = false; S.playing = true;
  const run = ++S.run;
  say.textContent = l.text;
  setChar(l.who, l.pose, true);
  audio.onended = () => { audio.onended = null; finish(run); };
  audio.play().catch(() => {});
  const tick = () => { if (run !== S.run) return; S.el = audio.currentTime; segs[S.cur].firstChild.style.width = Math.min(100, S.el / l.duration * 100) + '%'; info(); S.raf = setTimeout(tick, 250); };
  tick(); setBtn();
}

// 字幕の箱をタップ: 話している途中なら、このせりふを飛ばして次へ（ゲームの会話と同じ）
bubble.addEventListener('click', (e) => {
  if (e.target.closest('.endlinks, a, button')) return;
  if (!S.playing) return;
  ensureAudioGraph(); sfx('tap');
  const run = S.run;
  cancelAnimationFrame(S.raf); clearTimeout(S.raf); audio.pause();
  finish(run);
});
playBtn.addEventListener('click', () => {
  ensureAudioGraph(); sfx('tap');
  if (S.waiting) { doStep(S.run); return; }
  if (S.playing) pause();
  else if (S.paused) resume();
  else play(S.started ? S.cur : (bubble.classList.contains('ended') ? 0 : S.cur), S.mode || 'try');
});
g.querySelector('.g-prev').addEventListener('click', () => { ensureAudioGraph(); sfx('tap'); play(Math.max(0, S.cur - 1), S.mode || 'try'); });
g.querySelector('.g-next').addEventListener('click', () => { ensureAudioGraph(); sfx('tap'); play(Math.min(L.length - 1, S.cur + 1), S.mode || 'try'); });
document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
  ensureAudioGraph(); sfx('tap');
  const inHero = !!b.closest('.hero');
  if (inHero) play(0, b.dataset.mode, { scroll: true });
  else play(S.started ? S.cur : 0, b.dataset.mode);
}));
again.addEventListener('click', () => { ensureAudioGraph(); sfx('tap'); play(0, S.mode || 'try', { scroll: true }); });
document.querySelectorAll('[data-total]').forEach((t) => { t.textContent = '約' + Math.max(1, Math.round(totalSec / 60)) + '分'; });

// 章の一覧
const list = $('.ch-list');
L.forEach((l, i) => {
  const li = document.createElement('li');
  li.innerHTML = '<span class="no">' + String(i + 1).padStart(2, '0') + '</span><img class="face" src="' + DIR + 'char/' + l.who + '_face.webp" alt="">' +
    '<span><span class="who" style="--who:' + COLOR[l.who] + '">' + NAME[l.who] + '</span><span class="t">' + l.text + '</span></span>' +
    '<button type="button" class="listen" title="この章だけ（' + mmss(l.duration) + '）">この章だけ聞く</button>';
  li.querySelector('.listen').addEventListener('click', () => { ensureAudioGraph(); if (S.playing && S.cur === i && S.mode === 'one') pause(); else play(i, 'one', { scroll: true }); });
  list.appendChild(li);
});

// キー操作: Space で再生・停止、← → で前・次の章（入力中やボタンにいるときは邪魔しない）
window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target;
  if (t && t.closest('input, textarea, select, [contenteditable], button, a, audio, video')) return;
  if (e.code === 'Space') { e.preventDefault(); playBtn.click(); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); if (S.cur < L.length - 1) g.querySelector('.g-next').click(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); if (S.cur > 0) g.querySelector('.g-prev').click(); }
});
// ほかの音（4K 動画など）が鳴ったら止める
document.addEventListener('play', (e) => { if (e.target.tagName === 'VIDEO' && !e.target.muted && S.playing) pause(); }, true);

$('#y').textContent = new Date().getFullYear();
setRate(S.rate);
preview(0);
window.MIRO = { play, pause, state: S };
})();
