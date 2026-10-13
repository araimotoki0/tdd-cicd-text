// Miro 風の画面（#win・1290×760）の各場面を描く。guide.js が、せりふごとに render(scene) を呼ぶ。
// 座標は #win の中の固定座標。#over は上のバー（62px）の下から始まるので、#over に置くものは y から 62 を引く。
(function () {
'use strict';
const CH = 'miro-tutorial/char/';
const $ = (s) => document.querySelector(s);
const win = $('#win'), canvas = $('#canvas'), over = $('#over'), zv = $('#zv'), tools = $('#tools');

const ic = {
  select: '<svg viewBox="0 0 24 24" fill="#2a2f45"><path d="M5 3l14 8-6 1.8L10 19z"/></svg>',
  tpl: '<svg viewBox="0 0 24 24" fill="none" stroke="#2a2f45" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M10 10v10"/></svg>',
  sticky: '<svg viewBox="0 0 24 24"><path d="M4 4h16v11l-5 5H4z" fill="#ffe66d" stroke="#2a2f45" stroke-width="2" stroke-linejoin="round"/><path d="M15 20v-5h5" fill="none" stroke="#2a2f45" stroke-width="2"/></svg>',
  text: '<svg viewBox="0 0 24 24" fill="none" stroke="#2a2f45" stroke-width="2.6" stroke-linecap="round"><path d="M5 6V4h14v2M12 4v16M9 20h6"/></svg>',
  shape: '<svg viewBox="0 0 24 24" fill="none" stroke="#2a2f45" stroke-width="2.2"><rect x="3" y="11" width="9" height="9" rx="1"/><circle cx="16" cy="8" r="5"/></svg>',
  pen: '<svg viewBox="0 0 24 24" fill="none" stroke="#2a2f45" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l1-5L16 4l4 4L9 19z"/></svg>',
  frame: '<svg viewBox="0 0 24 24" fill="none" stroke="#2a2f45" stroke-width="2.4" stroke-linecap="round"><path d="M7 3v18M17 3v18M3 7h18M3 17h18"/></svg>',
  cmt: '<svg viewBox="0 0 24 24" fill="none" stroke="#2a2f45" stroke-width="2.2" stroke-linejoin="round"><path d="M4 5h16v11H11l-5 4v-4H4z"/></svg>',
};
tools.innerHTML = Object.values(ic).map((s) => '<div>' + s + '</div>').join('');
// ツールバー i 番目の枠（#win の座標）
const tb = (i) => [20, 110 + 52 * i, 60, 52];

const C = (cls, x, y, t, w, h, extra) => '<div class="note ' + cls + (extra ? ' ' + extra : '') + '" style="left:' + x + 'px;top:' + y + 'px;' + (w ? 'width:' + w + 'px;height:' + h + 'px;' : '') + '">' + t + '</div>';
const cursor = (x, y, col, name) => '<div class="cur" style="left:' + x + 'px;top:' + y + 'px"><svg viewBox="0 0 24 24" fill="' + col + '" stroke="#fff" stroke-width="1.5"><path d="M3 2l15 9-7 2-3 7z"/></svg><span style="background:' + col + '">' + name + '</span></div>';
const hl = (r, lab, lx, ly) => '<div class="hl" style="left:' + r[0] + 'px;top:' + (r[1] - 62) + 'px;width:' + r[2] + 'px;height:' + r[3] + 'px"></div>' + (lab ? '<div class="lab" style="left:' + lx + 'px;top:' + (ly - 62) + 'px">' + lab + '</div>' : '');
const keycap = (s) => '<span class="key">' + s + '</span>';
const base = () => C('y', 360, 130, 'ふせん', 150, 150) + C('p', 540, 170, 'アイデア', 150, 150) + C('g', 730, 120, '質問', 150, 150) +
  '<div class="frame" style="left:330px;top:350px;width:560px;height:250px"><b>ワーク1</b></div>' + C('b', 360, 390, 'チーム目標', 140, 140) + C('o', 520, 420, 'ふりかえり', 140, 140) +
  cursor(900, 420, '#ff5c8a', 'Miho') + cursor(960, 250, '#35a8ff', 'Joe') + cursor(560, 330, '#2fbf8f', 'Arai');
const timerbox = '<div class="timerbox"><div style="font-size:24px;font-weight:700">タイマー</div><b>05:00</b><div style="font-size:21px;font-weight:700;color:#5a6178;margin-top:8px">🗳 投票も ここから</div></div>';

// 画面の状態（練習で変わるもの）
const st = { zoom: 1, tool: -1, newNote: false, timer: false };
function paintCanvas(html) { canvas.innerHTML = '<div class="inner" style="transform:scale(' + st.zoom + ')">' + html + (st.newNote ? C('y', 110, 450, 'ここに<br>書く', 170, 170, 'new') : '') + (st.timer ? timerbox : '') + '</div>'; canvas.style.backgroundSize = st.zoom === 1 ? '' : (34 * st.zoom) + 'px ' + (34 * st.zoom) + 'px'; zv.textContent = Math.round(st.zoom * 100) + '%'; }
function paintTools() { Array.from(tools.children).forEach((d, i) => d.classList.toggle('on', i === st.tool)); }

const S = {
  title: () => '<div class="card top"><div class="big" style="font-size:124px">Miro 超入門</div><div class="mid">Joe・Miho先生・Arai先生が やさしく案内</div><div class="badge">2026年10月14日 AIと一緒に作りました</div></div>',
  board: () => { paintCanvas(base()); return '<div class="lab" style="left:130px;top:30px;background:var(--blue)">みんなで同時に書き込める白板</div>'; },
  zoom: () => { paintCanvas(base()); return hl([1058, 684, 214, 56]) + '<div class="lab" style="left:760px;top:' + (600 - 62) + 'px">拡大・縮小ボタン</div>'; },
  zoom2: () => { st.zoom = 1.5; paintCanvas(base()); return '<div class="keys" style="left:760px;top:350px">マウスの ホイール ＝ 拡大・縮小</div><div class="keys" style="left:760px;top:440px">' + keycap('Space') + '＋ ドラッグ ＝ 移動</div>'; },
  sticky: () => { st.zoom = 1; paintCanvas(base().replace(/<div class="note y".*?<\/div>/, '')); return hl(tb(2), '① 付箋をクリック', 100, 298) + '<div class="lab" style="left:620px;top:' + (330 - 62) + 'px;background:var(--blue)">② ボードをクリック</div>'; },
  sticky2: () => { st.newNote = true; paintCanvas(base()); return '<div class="keys" style="left:930px;top:40px">ショートカット ' + keycap('N') + '</div><div class="lab" style="left:300px;top:612px;background:var(--blue)">← ドラッグで動かせる</div>'; },
  shapes: () => { paintCanvas(base() + '<div class="txt" style="left:960px;top:150px">講座のメモ</div><div class="shape" style="left:960px;top:330px;width:150px;height:90px">四角</div><div class="shape" style="left:1150px;top:320px;width:110px;height:110px;border-radius:50%">丸</div><div class="abs" style="left:1110px;top:372px;width:40px;height:6px;background:#2a2f45"></div>');
    return hl([20, 110 + 52 * 3, 60, 52 * 2], '② テキスト ③ 図形', 100, 300) + '<div class="keys" style="left:960px;top:40px">テキスト ' + keycap('T') + '</div>'; },
  frame: () => { paintCanvas(base()); return hl(tb(6), 'フレーム = 仕切り', 100, 418) + '<div class="lab" style="left:560px;top:330px;background:var(--blue)">講座のワークは フレームごと</div>'; },
  comment: () => { paintCanvas(base() + '<div class="abs" style="left:950px;top:302px;width:310px;padding:16px 20px;background:#fff;border:3px solid #cfd4e4;border-radius:16px;font-weight:700;font-size:22px;box-shadow:0 8px 22px rgba(30,40,90,.25)">Miho：ここ、もう少し詳しく教えてください</div><div class="abs" style="left:1030px;top:410px;font-size:34px">👍 ❤️ 🎉</div>');
    return hl(tb(7), 'コメント・リアクション', 100, 478); },
  timer: () => { st.timer = true; paintCanvas(base()); return hl([1106, 7, 152, 48], 'ファシリテーター用', 700, 590); },
  fit: () => { st.timer = false; paintCanvas(base()); return hl([998, 684, 64, 56], '全体表示', 820, 590) + '<div class="lab" style="left:300px;top:600px;background:var(--blue)">迷子になったらここ</div>'; },
  today: () => '<div class="card"><div class="mid" style="font-size:46px">この動画は</div><div class="big" style="font-size:112px">2026年10月14日</div><div class="mid">に、AIと一緒に作りました</div></div>',
  motoki: () => '<div class="card"><div class="mid" style="font-size:44px">ちなみに…</div><div class="cols"><div class="pic" style="font-size:44px;padding:26px 44px">新井 <span style="color:var(--blue)">motoki</span></div><div class="arrow">＝</div><div class="pic" style="font-size:44px;padding:26px 44px"><span style="color:var(--coral)">motoki</span> さん</div></div><div class="mid">新井と同じ名前の人が いるんです</div></div>',
  steps1: () => '<div class="card" style="gap:14px"><div class="badge" style="background:var(--coral)">STEP 1　粗くて安い絵で見た目を決める</div><div class="cols">' + ['joe_talk', 'miho_talk', 'arai_talk'].map((n) => '<div class="pic"><img src="' + CH + 'draft_' + n + '.webp" style="height:330px;image-rendering:pixelated;width:auto;filter:blur(.6px)"><span class="tag" style="background:var(--navy)">1K ・ 約10円</span></div>').join('') + '</div><div class="mid" style="font-size:30px">gemini-3.1-flash-image で、まず候補を作る</div></div>',
  steps2: () => '<div class="card" style="gap:16px"><div class="badge" style="background:var(--blue)">STEP 2　セリフを入れて動かす</div><div class="pic" style="width:900px;text-align:left;font-size:30px;line-height:1.7"><div><span class="tag" style="background:var(--coral)">text</span> 画面に出す字幕</div><div><span class="tag" style="background:var(--blue)">say</span> 声で読む文（かな書き）</div><div class="wave">' + Array.from({ length: 44 }, (_, i) => '<i style="height:' + (18 + Math.abs(Math.sin(i * .7) * Math.cos(i * .23)) * 100) + 'px"></i>').join('') + '</div></div><div class="mid" style="font-size:30px">声は2本作って、書き起こしで合う方を選ぶ ／ 口は音の大きさで動かす</div></div>',
  steps3: () => '<div class="card" style="gap:14px"><div class="badge" style="background:var(--mint);color:var(--navy)">STEP 3　最後に 4K で仕上げる</div><div class="cols"><div class="pic"><div style="width:300px;height:300px;overflow:hidden;border-radius:10px;background:#dfe6ff"><img src="' + CH + 'draft_joe_cheer.webp" style="width:600px;margin:-40px 0 0 -150px;filter:blur(1.2px)"></div><span class="tag" style="background:var(--navy)">下書き 1K</span></div><div class="arrow">▶</div><div class="pic"><div style="width:300px;height:300px;overflow:hidden;border-radius:10px;background:#dfe6ff"><img src="' + CH + 'joe_cheer.webp" style="width:600px;margin:-40px 0 0 -150px"></div><span class="tag" style="background:var(--coral)">仕上げ 4K ・ 約36円</span></div></div><div class="mid" style="font-size:30px">gemini-3-pro-image ／ 同じ顔・色のまま 描き直す</div></div>',
  outro: () => '<div class="card top"><div class="big" style="font-size:108px">さあ、触ってみよう！</div><div class="mid">講座で お会いしましょう</div><div class="badge" style="background:var(--coral)">Agile Business Institute</div></div>',
};

function render(scene) {
  // カードの場面では画面の状態をそのまま、ボードの場面では状態を描き直す
  st.tool = -1; paintTools();
  if (!S[scene]) scene = 'board';
  over.innerHTML = S[scene]();
  win.classList.remove('fade'); void win.offsetWidth; win.classList.add('fade');
}

// 練習で押したときの、見た目の反応
const act = {
  zoomIn() { st.zoom = 1.5; paintCanvas(base()); },
  tool(i) { st.tool = i; paintTools(); },
  addNote() { st.newNote = true; st.tool = -1; paintTools(); paintCanvas(base()); over.innerHTML = ''; },
  timer() { st.timer = true; paintCanvas(base()); },
  fit() { st.zoom = 1; st.timer = false; paintCanvas(base()); },
  none() {},
};

// 画面をページの幅に合わせて縮める
const wrap = win.parentElement;
function fit() { const k = wrap.clientWidth / 1290; win.style.transform = 'scale(' + k + ')'; wrap.style.height = (760 * k) + 'px'; }
window.addEventListener('resize', fit); window.addEventListener('load', fit); fit();
if ('ResizeObserver' in window) new ResizeObserver(fit).observe(wrap);

window.MIRO_SCENES = { render, act, tb, state: st, scale: () => wrap.clientWidth / 1290, reset() { st.zoom = 1; st.tool = -1; st.newNote = false; st.timer = false; } };
})();
