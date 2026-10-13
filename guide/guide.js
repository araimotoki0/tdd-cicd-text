// 案内役の3人（Joe・Miho先生・Arai先生）: 講座のページを、章ごとに声で案内する。
// ・section[data-voice] が章。台本（guide/lines.js）の各せりふは、章（sec）と、光らせる所（spot = [data-spot]）を持つ
// ・「3人の案内を聞く」[data-play-all] … 最初から最後まで。話し終わると次の章へスクロールして続ける
// ・各章の見出しの「この章だけ聞く」 … その章のせりふだけ流して止まる
// ・枠（右下。入口の .mg-dock が見えている間はそこに入る）: 章のバー・前へ／次へ・速さ・残り時間・小さくする
// ・話している間は Veo の動く絵、それ以外は止め絵（口パク・まばたき・ゆらぎ）。字幕は声の再生位置で進み、声が出ない環境でも時計で進む
// 仕組みは AITech の声つきチュートリアル（guide.js）と同じ。ブラウザは人が押すまで音を出さないので、最初の1回は押してもらう。
(function () {
'use strict';
const L = window.MOBAI_LINES || [];
if (!L.length) return;
const VID = new Set(window.MOBAI_VIDEOS || []), OPEN = new Set(window.MOBAI_OPEN || []), BLINK = new Set(window.MOBAI_BLINK || []);
const DIR = 'guide/';
const NAME = { joe: 'Joe', miho: 'Miho先生', arai: 'Arai先生' };
const COLOR = { joe: '#2b50ff', miho: '#ff5c8a', arai: '#2fbf8f' };
const RATES = [1, 1.25, 1.5, 2];
const GAP = 0.6; // せりふのあいだ（秒）
const $ = (s, r) => (r || document).querySelector(s);
const store = {
  get(k) { try { return localStorage.getItem('mg.' + k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem('mg.' + k, v); } catch (e) { /* 保存できない環境でも動く */ } },
};
const mmss = (sec) => { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); };
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── 章（section[data-voice]）と、せりふの対応
const secOf = (id) => document.querySelector('section[data-voice="' + id + '"]');
const chapters = Array.from(document.querySelectorAll('section[data-voice]')).map((s) => s.dataset.voice).filter((id) => L.some((l) => l.sec === id));
const linesOf = (ch) => L.map((l, i) => (l.sec === ch ? i : -1)).filter((i) => i >= 0);
const chapterOf = (i) => chapters.indexOf(L[i].sec);
const chapterDur = (ch) => linesOf(ch).reduce((a, i) => a + L[i].duration + GAP, -GAP);
const totalSec = L.reduce((a, l) => a + l.duration, 0) + GAP * (L.length - 1);
const chapterTitle = (ch) => { const h = secOf(ch) && secOf(ch).querySelector('h2'); return h ? h.textContent.replace(/\s+/g, ' ').trim() : ch; };

// ── 枠
const g = document.createElement('aside');
g.className = 'mg';
g.setAttribute('aria-label', '案内役');
g.innerHTML =
  '<div class="mg-seg" aria-label="章"></div>' +
  '<div class="mg-top"><button type="button" class="mg-open" title="案内役を出す"><img src="' + DIR + 'char/joe_face.webp" alt=""></button>' +
  '<span class="mg-name"></span><span class="mg-role">CSD 講座の案内役</span><span class="mg-live">説明中</span><span class="sp"></span>' +
  '<button type="button" class="mg-min" title="小さくする">－</button></div>' +
  '<div class="mg-body">' +
  '<div class="mg-stage"><div class="spr"><img class="base" alt=""><img class="open" alt=""><img class="blink" alt=""></div>' +
  '<video class="va" muted loop playsinline preload="auto"></video><video class="vb" muted loop playsinline preload="auto"></video><canvas class="fx" aria-hidden="true"></canvas></div>' +
  '<div class="mg-say"><div class="mg-text" aria-live="polite"></div><span class="mg-tap">タップで次へ</span></div></div>' +
  '<div class="mg-prog"><i></i></div>' +
  '<div class="mg-info"><span class="mg-ch"></span><span class="mg-mode"></span><span class="mg-time"></span></div>' +
  '<div class="mg-ctrl">' +
  '<button type="button" class="mg-btn mg-prev" title="前の章へ">⏮ <span>前へ</span></button>' +
  '<button type="button" class="mg-play"></button>' +
  '<button type="button" class="mg-btn mg-next" title="次の章へ"><span>次へ</span> ⏭</button>' +
  '<button type="button" class="mg-btn mg-rate1" title="速さを変える"></button></div>' +
  '<div class="mg-rates"><span>速さ</span></div>' +
  '<div class="mg-keys"><span><kbd>Space</kbd> 再生・停止</span><span><kbd>←</kbd><kbd>→</kbd> 前・次の章</span></div>';
document.body.appendChild(g);
// 光らせる所の穴（暗幕）
const hole = document.createElement('div'); hole.className = 'mg-hole'; hole.hidden = true; document.body.appendChild(hole);

const stage = $('.mg-stage', g), spr = $('.spr', g), imgBase = $('.base', g), imgOpen = $('.open', g), imgBlink = $('.blink', g);
const vids = [$('.va', g), $('.vb', g)], fx = $('.fx', g);
const textEl = $('.mg-text', g), playBtn = $('.mg-play', g), prog = $('.mg-prog i', g);

const S = { cur: 0, mode: '', playing: false, paused: false, started: false, el: 0, run: 0, raf: 0, timer: 0, spot: null,
  rate: RATES.includes(Number(store.get('rate'))) ? Number(store.get('rate')) : 1 };

// 章のバー（押すとその章から）
const segs = chapters.map((ch, k) => {
  const b = document.createElement('button');
  b.type = 'button'; b.title = String(k + 1).padStart(2, '0') + '. ' + chapterTitle(ch);
  b.innerHTML = '<i></i>';
  b.addEventListener('click', () => { gesture(); play(linesOf(ch)[0], S.mode || 'all', { scroll: true }); });
  $('.mg-seg', g).appendChild(b);
  return b;
});

// 入口の舞台（.mg-dock）が見えている間は、枠をそこに入れる。外れたら右下に小さく出す（話している・止めているときだけ）
const dock = document.querySelector('.mg-dock');
let dockHidden = false;
function syncDock() {
  if (!dock) return;
  const float = dockHidden && (S.playing || S.paused);
  if (float && !g.classList.contains('floating')) dock.style.minHeight = dock.offsetHeight + 'px';
  g.classList.toggle('floating', float);
  if (!float) dock.style.minHeight = '';
}
if (dock) {
  dock.appendChild(g); g.classList.add('docked');
  if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => { dockHidden = !e.isIntersecting; syncDock(); }, { threshold: 0.05 }).observe(dock);
}
if (store.get('min') === '1' && !dock) g.classList.add('min');

// ── 声
const audio = new Audio(); audio.preload = 'auto';
const preloader = new Audio(); preloader.preload = 'auto';
function preloadVoice(i) { const n = L[i + 1]; if (n) preloader.src = DIR + 'voice/' + n.id + '.mp3?v=' + Math.round(n.duration * 100); }
let actx = null;
function gesture() { // 人が押したとき: 効果音用の AudioContext を用意する（声は普通の audio 要素で鳴らす）
  try { const AC = window.AudioContext || window.webkitAudioContext; if (AC && !actx) actx = new AC(); if (actx && actx.state !== 'running') actx.resume().catch(() => {}); } catch (e) { actx = null; }
}
function sfx(kind) {
  if (!actx || actx.state !== 'running' || reduce()) return;
  const t = actx.currentTime;
  const tone = (f0, f1, at, dur, vol, type) => { const o = actx.createOscillator(), gn = actx.createGain(); o.type = type || 'sine'; o.frequency.setValueAtTime(f0, at); if (f1) o.frequency.exponentialRampToValueAtTime(f1, at + dur * .8); o.connect(gn); gn.connect(actx.destination); gn.gain.setValueAtTime(.0001, at); gn.gain.exponentialRampToValueAtTime(vol, at + .015); gn.gain.exponentialRampToValueAtTime(.0001, at + dur); o.start(at); o.stop(at + dur + .02); };
  if (kind === 'tap') tone(660, 440, t, .1, .08);
  else if (kind === 'done') [523, 659, 784, 1047].forEach((f, i) => tone(f, 0, t + i * .12, .5, .1, 'triangle'));
}
// 声の大きさ（lines.js の env: 25回/秒・0〜9）で口パク
function level() {
  const l = L[S.cur]; if (!l || !l.env || audio.paused) return null;
  const k = Math.floor(audio.currentTime * 25);
  return k >= 0 && k < l.env.length ? Number(l.env[k]) / 9 : null;
}

// ── キャラ
function pickVideo(key) {
  let v = vids.find((x) => x.dataset.p === key);
  if (!v) { v = vids.find((x) => !x.classList.contains('on')) || vids[0]; v.src = DIR + 'video/' + key + '.mp4'; v.dataset.p = key; }
  return v;
}
let curKey = '';
function preloadVideo(i) {
  const n = L[i + 1]; if (!n) return;
  const key = n.who + '_' + n.pose; if (!VID.has(key) || vids.some((x) => x.dataset.p === key)) return;
  const v = vids.find((x) => x.dataset.p !== curKey) || vids[1];   // いま話している人の動く絵は上書きしない
  v.src = DIR + 'video/' + key + '.mp4'; v.dataset.p = key; v.load();
}
function setChar(who, pose, speaking) {
  const key = who + '_' + pose;
  if (key !== curKey) {
    curKey = key;
    imgBase.src = DIR + 'char/' + key + '.webp';
    imgOpen.src = OPEN.has(key) ? DIR + 'char/' + key + '_open.webp' : '';
    imgBlink.src = BLINK.has(key) ? DIR + 'char/' + key + '_blink.webp' : '';
    stage.classList.remove('pop'); void stage.offsetWidth; stage.classList.add('pop');
  }
  $('.mg-name', g).textContent = NAME[who];
  $('.mg-open img', g).src = DIR + 'char/' + who + '_face.webp';
  g.style.setProperty('--who', COLOR[who]);
  stage.classList.toggle('talking', !!speaking);
  stage.classList.toggle('cheer', pose === 'cheer');
  if (speaking && VID.has(key) && !reduce()) {
    const v = pickVideo(key);
    const show = () => { if (v.dataset.p === key && !v.paused && curKey === key) { vids.forEach((x) => x.classList.toggle('on', x === v)); stage.classList.add('moving'); } };
    v.addEventListener('playing', show, { once: true });
    v.play().then(show).catch(() => {});
  } else {
    vids.forEach((v) => { v.pause(); v.classList.remove('on'); });
    stage.classList.remove('moving');
  }
}
let mouthOpen = false, lastMouth = 0, nextFlap = 0;
(function tickFace(now) {
  const canOpen = S.playing && !stage.classList.contains('moving') && !!imgOpen.getAttribute('src');
  let want = mouthOpen;
  if (canOpen) {
    const lv = level();
    if (lv !== null) { if (!mouthOpen && lv > 0.4) want = true; else if (mouthOpen && lv < 0.2) want = false; }
    else if (now > nextFlap) { want = !mouthOpen; nextFlap = now + 90 + Math.random() * 90; }
  } else want = false;
  if (want !== mouthOpen && now - lastMouth > 65) { mouthOpen = want; lastMouth = now; spr.classList.toggle('m-open', mouthOpen); }
  requestAnimationFrame(tickFace);
})(performance.now());
(function blinkLoop() {
  setTimeout(() => {
    if (imgBlink.getAttribute('src')) { spr.classList.add('m-blink'); setTimeout(() => { spr.classList.remove('m-blink'); blinkLoop(); }, 110); }
    else blinkLoop();
  }, 2200 + Math.random() * 3800);
})();
function confetti() {
  if (!fx || reduce()) return;
  const ctx = fx.getContext('2d'); const r = stage.getBoundingClientRect(); const dpr = devicePixelRatio || 1;
  fx.width = r.width * dpr; fx.height = r.height * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cols = ['#ffd93b', '#ff7a59', '#2b50ff', '#2fbf8f', '#ff5c8a', '#ffffff'];
  const ps = Array.from({ length: 90 }, () => ({ x: r.width * (0.3 + Math.random() * 0.4), y: r.height * 0.5, vx: (Math.random() - .5) * 9, vy: -5 - Math.random() * 7, s: 4 + Math.random() * 6, c: cols[Math.floor(Math.random() * cols.length)], a: Math.random() * Math.PI, va: (Math.random() - .5) * .3 }));
  const t0 = performance.now();
  (function frame(now) {
    const dt = (now - t0) / 1000; ctx.clearRect(0, 0, r.width, r.height); let alive = false;
    ps.forEach((p) => { p.vy += .25; p.x += p.vx; p.y += p.vy; p.vx *= .99; p.a += p.va; if (p.y < r.height + 10) alive = true;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.globalAlpha = Math.max(0, Math.min(1, 1 - (dt - 1.6) / .8)); ctx.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * .66); ctx.restore(); });
    if (alive && dt < 2.6) requestAnimationFrame(frame); else ctx.clearRect(0, 0, r.width, r.height);
  })(t0);
}

// ── 光らせる所（穴）: 要素の位置を追いかける
let holeRaf = 0;
function spotEl(name) { return name ? document.querySelector('[data-spot="' + name + '"]') : null; }
function showHole(el) {
  S.spot = el; hole.hidden = !el;
  if (!el) { cancelAnimationFrame(holeRaf); return; }
  const pad = 10;
  const tick = () => {
    if (S.spot !== el) return;
    const r = el.getBoundingClientRect();
    Object.assign(hole.style, { left: (r.left - pad) + 'px', top: (r.top - pad) + 'px', width: (r.width + pad * 2) + 'px', height: (r.height + pad * 2) + 'px' });
    holeRaf = requestAnimationFrame(tick);
  };
  cancelAnimationFrame(holeRaf); tick();
}
function scrollToLine(l) {
  const el = spotEl(l.spot) || secOf(l.sec);
  if (!el) return;
  const r = el.getBoundingClientRect(), vh = innerHeight;
  // 枠は、入口の舞台から離れると浮かぶ（左下）。その分だけ下を空けて、光らせる所が枠に隠れないようにする
  const inDock = dock && dock.contains(el);
  const guideH = inDock ? 0 : Math.min(g.classList.contains('floating') ? g.offsetHeight : (innerWidth < 900 ? 300 : 420), vh * 0.5);
  const top = 120, bottom = vh - (guideH ? guideH + 16 : 20);
  if (r.top >= top && r.bottom <= bottom) return;                       // もう見えている
  const want = r.height > bottom - top ? r.top - top : r.top - (top + (bottom - top - r.height) / 2);
  window.scrollBy({ top: want, behavior: reduce() ? 'auto' : 'smooth' });
}

// ── 表示
function setRate(r) {
  S.rate = r; store.set('rate', String(r)); audio.playbackRate = r;
  g.querySelectorAll('.mg-rates button').forEach((x) => x.classList.toggle('on', Number(x.dataset.r) === r));
  $('.mg-rate1', g).textContent = r + '×';
  info();
}
RATES.forEach((r) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = r + '×'; b.dataset.r = r; b.addEventListener('click', () => setRate(r)); $('.mg-rates', g).appendChild(b); });
$('.mg-rate1', g).addEventListener('click', () => setRate(RATES[(RATES.indexOf(S.rate) + 1) % RATES.length]));
function info() {
  const ch = chapterOf(S.cur);
  $('.mg-ch', g).textContent = String(ch + 1).padStart(2, '0') + ' / ' + String(chapters.length).padStart(2, '0') + ' 章';
  if (!S.started) { $('.mg-mode', g).textContent = ''; $('.mg-time', g).textContent = '通しで 約' + Math.max(1, Math.round(totalSec / S.rate / 60)) + '分'; return; }
  let rest = Math.max(0, L[S.cur].duration - S.el);
  const last = S.mode === 'all' ? L.length - 1 : linesOf(L[S.cur].sec).slice(-1)[0];
  for (let i = S.cur + 1; i <= last; i++) rest += GAP + L[i].duration;
  $('.mg-mode', g).textContent = S.mode === 'all' ? '通しで再生' : 'この章だけ';
  $('.mg-time', g).textContent = '残り ' + mmss(rest / S.rate);
}
function setBtn() {
  playBtn.innerHTML = S.playing ? '⏸ 一時停止' : S.paused ? '▶ 続きを再生' : S.started ? '▶ ここから再生' : g.classList.contains('ended') ? '🔁 もう一度 最初から' : '▶ ここから再生';
  playBtn.title = S.started ? '' : '音が出ます';
  const ch = chapterOf(S.cur);
  $('.mg-prev', g).disabled = ch <= 0;
  $('.mg-next', g).disabled = ch >= chapters.length - 1;
  g.classList.toggle('talking', S.playing);
  chapters.forEach((id, k) => {
    const s = secOf(id); const on = (S.playing || S.paused) && k === ch;
    s.classList.toggle('mg-speaking', on);
    const b = s.querySelector('.mg-listen');
    if (b) { const live = S.playing && k === ch; b.classList.toggle('on', live); b.querySelector('.lbl').textContent = live ? '説明中' : 'この章だけ聞く'; }
    const done = k < ch || (k === ch && S.cur === linesOf(id).slice(-1)[0] && S.el >= L[S.cur].duration - 0.05);
    segs[k].classList.toggle('done', done);
    const ls = linesOf(id), pos = ls.indexOf(S.cur);
    segs[k].firstChild.style.width = k === ch && S.started ? Math.min(100, ((pos + Math.min(1, S.el / L[S.cur].duration)) / ls.length) * 100) + '%' : '0';
  });
  document.querySelectorAll('[data-play-all]').forEach((b) => {
    const on = S.playing && S.mode === 'all', held = S.paused && S.mode === 'all';
    b.classList.toggle('on', on);
    b.innerHTML = on ? '⏸ 一時停止' : held ? '▶ 続きを聞く' : b.dataset.label;
  });
  syncDock(); info();
}
// 話していないとき: いま見ている章の最初のせりふを、全文で出しておく
function preview(i) {
  if (S.playing || S.paused || !L[i]) return;
  S.cur = i; S.el = 0;
  const l = L[i];
  textEl.textContent = l.text; prog.style.width = '0';
  setChar(l.who, l.pose, false);
  setBtn();
}
function stop() {
  S.run++;
  cancelAnimationFrame(S.raf); clearTimeout(S.raf); clearTimeout(S.timer);
  audio.pause();
  S.playing = false; S.paused = false;
  showHole(null);
}

// i 番目のせりふを流す。mode は 'all'（通し）か 'one'（この章だけ）
function play(i, mode, opts) {
  if (!L[i]) return;
  stop();
  const run = S.run, l = L[i];
  S.cur = i; S.mode = mode; S.playing = true; S.started = true; S.el = 0;
  g.classList.remove('ended');
  if (g.classList.contains('min')) { g.classList.remove('min'); store.set('min', '0'); }
  if (!opts || opts.scroll !== false) scrollToLine(l);
  showHole(spotEl(l.spot));
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
  textEl.innerHTML = '<span></span><i class="cur"></i>';
  const span = textEl.firstChild;
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
    prog.style.width = Math.min(100, el / total * 100) + '%';
    if (now - lastInfo > 250) { setBtn(); lastInfo = now; }
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
  textEl.textContent = l.text; prog.style.width = '100%';
  setChar(l.who, l.pose, false);
  const next = S.cur + 1;
  const more = next < L.length && (S.mode === 'all' || L[next].sec === l.sec);
  if (more) { setBtn(); S.timer = setTimeout(() => { if (run === S.run) play(next, S.mode); }, GAP * 1000 / S.rate); return; }
  showHole(null);
  if (S.mode === 'all') {   // 通しで最後まで: お祝い
    S.started = false; g.classList.add('ended');
    textEl.textContent = '🎉 おつかれさま！ これが MobAI です。講座で お会いしましょう。';
    setChar(l.who, 'cheer', false); confetti(); sfx('done');
  }
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
  textEl.textContent = l.text;
  setChar(l.who, l.pose, true); showHole(spotEl(l.spot));
  audio.onended = () => { audio.onended = null; finish(run); };
  audio.play().catch(() => {});
  const tick = () => { if (run !== S.run) return; S.el = audio.currentTime; prog.style.width = Math.min(100, S.el / l.duration * 100) + '%'; setBtn(); S.raf = setTimeout(tick, 250); };
  tick(); setBtn();
}
function prevChapter() { const ch = chapterOf(S.cur); play(linesOf(chapters[Math.max(0, ch - 1)])[0], S.mode || 'all', { scroll: true }); }
function nextChapter() { const ch = chapterOf(S.cur); play(linesOf(chapters[Math.min(chapters.length - 1, ch + 1)])[0], S.mode || 'all', { scroll: true }); }

playBtn.addEventListener('click', () => {
  gesture(); sfx('tap');
  if (S.playing) pause();
  else if (S.paused) resume();
  else play(g.classList.contains('ended') ? 0 : S.cur, S.mode || 'all', { scroll: true });
});
$('.mg-prev', g).addEventListener('click', () => { gesture(); sfx('tap'); prevChapter(); });
$('.mg-next', g).addEventListener('click', () => { gesture(); sfx('tap'); nextChapter(); });
// 字幕をタップ: 話している途中なら、このせりふを飛ばして次へ
$('.mg-say', g).addEventListener('click', () => { if (!S.playing) return; gesture(); sfx('tap'); const run = S.run; cancelAnimationFrame(S.raf); clearTimeout(S.raf); audio.pause(); finish(run); });
const minimize = () => { g.classList.add('min'); store.set('min', '1'); };
$('.mg-min', g).addEventListener('click', minimize);
$('.mg-open', g).addEventListener('click', () => { g.classList.remove('min'); store.set('min', '0'); });

// 「3人の案内を聞く」ボタン（ページ内にいくつあってもよい）。長さも書き込む
document.querySelectorAll('[data-total]').forEach((t) => { t.textContent = '約' + Math.max(1, Math.round(totalSec / 60)) + '分'; });
document.querySelectorAll('[data-play-all]').forEach((b) => {
  b.dataset.label = b.innerHTML;
  b.addEventListener('click', () => {
    gesture(); sfx('tap');
    if (S.playing && S.mode === 'all') { pause(); return; }
    if (S.paused && S.mode === 'all') { resume(); return; }
    play(0, 'all', { scroll: true });
  });
});
// 各章の見出しに「この章だけ聞く」を足す
chapters.forEach((id, k) => {
  const h = secOf(id).querySelector('h2'); if (!h) return;
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'mg-listen';
  b.innerHTML = '<span class="ear">🔊</span><span class="eq" aria-hidden="true"><i></i><i></i><i></i></span><span class="lbl">この章だけ聞く</span>';
  b.title = 'この章の案内だけを聞きます（' + mmss(chapterDur(id)) + '）';
  b.addEventListener('click', (e) => { e.stopPropagation(); gesture(); sfx('tap'); if (S.playing && chapterOf(S.cur) === k && S.mode === 'one') pause(); else play(linesOf(id)[0], 'one', { scroll: true }); });
  const w = document.createElement('p'); w.className = 'mg-listen-wrap'; w.appendChild(b);   // 見出しの中に入れると目次の項目名に混ざるので、見出しの下に置く
  h.insertAdjacentElement('afterend', w);
});
// いま見ている章（画面の上から 1/3 あたりにある章）を、話していないときの表示にする
function visibleChapter() {
  const y = innerHeight * 0.33; let best = 0;
  chapters.forEach((id, k) => { if (secOf(id).getBoundingClientRect().top <= y) best = k; });
  return best;
}
let scrollTimer = 0;
window.addEventListener('scroll', () => { clearTimeout(scrollTimer); scrollTimer = setTimeout(() => preview(linesOf(chapters[visibleChapter()])[0]), 120); }, { passive: true });
// ページの動画（解説動画など）が鳴ったら、案内は止める
document.addEventListener('play', (e) => { if (e.target.tagName === 'VIDEO' && !e.target.muted && !g.contains(e.target) && S.playing) pause(); }, true);
// キー操作: Space で再生・停止、← → で前・次の章（入力中やボタンにいるときは邪魔しない）
window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target;
  if (t && t.closest('input, textarea, select, [contenteditable], button, a, audio, video, summary')) return;
  if (e.code === 'Space') { e.preventDefault(); playBtn.click(); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); if (chapterOf(S.cur) < chapters.length - 1) $('.mg-next', g).click(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); if (chapterOf(S.cur) > 0) $('.mg-prev', g).click(); }
});
window.addEventListener('resize', () => { if (S.spot) showHole(S.spot); });

setRate(S.rate);
preview(0);
window.MOBAI_GUIDE = { play, pause, state: S, chapters };
})();
