/* =========================================================================
 * 杀鲸霸拳 (Whale Fist) - audio.js
 * WebAudio 程序合成音效层，零音频文件。
 * 契约: window.BFAudio = {
 *   init(), get ready(), setMuted(m), get muted(),
 *   hit(kind), block(), whiff(), jump(), burst(), specialCharge(),
 *   specialHit(), ko(), roundStart(), ui(), win(), lose()
 * }
 * init() 由引擎在首次用户手势时调用（幂等）；未 init 或 muted 时全部静默 no-op。
 * 顶层只定义函数与常量，不触碰 AudioContext / DOM。
 * ======================================================================= */
(function () {
'use strict';

var actx = null;     // AudioContext，惰性创建
var master = null;   // 总线 GainNode
var muted = false;
var noiseBuf = null; // 复用的 1s 白噪声 buffer

/* ---------------- 内部基建 ---------------- */
function ensureCtx() {
  if (actx) {
    if (actx.state === 'suspended') { try { actx.resume(); } catch (e) { /* ignore */ } }
    return actx;
  }
  try {
    var AC = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return null;
    actx = new AC();
    master = actx.createGain();
    master.gain.value = 0.85;
    master.connect(actx.destination);
  } catch (e) {
    actx = null; master = null;
  }
  return actx;
}
function getNoise() {
  if (!actx) return null;
  if (noiseBuf) return noiseBuf;
  try {
    var len = Math.floor(actx.sampleRate);
    noiseBuf = actx.createBuffer(1, len, actx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { noiseBuf = null; }
  return noiseBuf;
}
/* 振荡器音：{t0,type,f0,f1,dur,g,attack,dest}，包络 exponential 防爆音 */
function tone(o) {
  if (!actx || muted) return;
  try {
    var t0 = o.t0 != null ? o.t0 : actx.currentTime;
    var osc = actx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(Math.max(1, o.f0), t0);
    if (o.f1 && o.f1 !== o.f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t0 + o.dur);
    var g = actx.createGain();
    var atk = o.attack != null ? o.attack : 0.006;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, o.g), t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    osc.connect(g); g.connect(o.dest || master);
    osc.start(t0);
    osc.stop(t0 + o.dur + 0.06);
  } catch (e) { /* 单个音效失败不影响其它 */ }
}
/* 滤波噪声：{t0,dur,g,filter('bandpass'|'lowpass'|'highpass'),f0,f1,q,attack,dest} */
function noise(o) {
  if (!actx || muted) return;
  try {
    var buf = getNoise();
    if (!buf) return;
    var t0 = o.t0 != null ? o.t0 : actx.currentTime;
    var src = actx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    var flt = actx.createBiquadFilter();
    flt.type = o.filter || 'bandpass';
    flt.frequency.setValueAtTime(Math.max(10, o.f0 || 1000), t0);
    if (o.f1) flt.frequency.exponentialRampToValueAtTime(Math.max(10, o.f1), t0 + o.dur);
    flt.Q.value = o.q != null ? o.q : 1;
    var g = actx.createGain();
    var atk = o.attack != null ? o.attack : 0.004;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, o.g), t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(flt); flt.connect(g); g.connect(o.dest || master);
    src.start(t0);
    src.stop(t0 + o.dur + 0.06);
  } catch (e) { /* ignore */ }
}
/* 软削波曲线（heavy 低音的轻微失真感） */
function distCurve(k) {
  var n = 256, c = new Float32Array(n);
  for (var i = 0; i < n; i++) {
    var x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(x * k);
  }
  return c;
}

/* ---------------- 对外契约 ---------------- */
window.BFAudio = {
  /** 首次用户手势时调用；创建 / resume AudioContext；幂等 */
  init: function () {
    var c = ensureCtx();
    if (c && c.state === 'suspended') { try { c.resume(); } catch (e) { /* ignore */ } }
    return !!c;
  },
  /** AudioContext 可用返回 true */
  get ready() { return !!(actx && actx.state !== 'closed'); },
  setMuted: function (m) { muted = !!m; },
  get muted() { return muted; },

  /** 命中音: 'light' | 'heavy' | 'air' */
  hit: function (kind) {
    if (!actx || muted) return;
    var t = actx.currentTime;
    if (kind === 'heavy') {
      noise({ t0: t, dur: 0.12, g: 0.55, filter: 'lowpass', f0: 900, f1: 250, q: 0.8 });
      try { // 80Hz 低正弦 + waveshaper 轻失真
        var osc = actx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(95, t);
        osc.frequency.exponentialRampToValueAtTime(55, t + 0.16);
        var ws = actx.createWaveShaper();
        ws.curve = distCurve(2.2); ws.oversample = '2x';
        var g = actx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.9, t + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        osc.connect(ws); ws.connect(g); g.connect(master);
        osc.start(t); osc.stop(t + 0.24);
      } catch (e) { /* ignore */ }
    } else if (kind === 'air') { // 中频噪声嗖
      noise({ t0: t, dur: 0.13, g: 0.4, filter: 'bandpass', f0: 1400, f1: 500, q: 1.4 });
    } else { // light：60ms 噪声爆 + 180Hz 正弦短促
      noise({ t0: t, dur: 0.06, g: 0.45, filter: 'bandpass', f0: 2200, f1: 900, q: 0.9 });
      tone({ t0: t, type: 'sine', f0: 190, f1: 120, dur: 0.09, g: 0.4 });
    }
  },
  /** 格挡：金属方波 blip + 高通噪声 click */
  block: function () {
    if (!actx || muted) return;
    var t = actx.currentTime;
    tone({ t0: t, type: 'square', f0: 1250, f1: 900, dur: 0.05, g: 0.16 });
    noise({ t0: t, dur: 0.035, g: 0.3, filter: 'highpass', f0: 3000, q: 0.7 });
  },
  /** 挥空：带通 800→300Hz 噪声扫频 */
  whiff: function () {
    if (!actx || muted) return;
    noise({ t0: actx.currentTime, dur: 0.12, g: 0.3, filter: 'bandpass', f0: 800, f1: 300, q: 2 });
  },
  /** 跳跃：上滑正弦 + 小噪声气声 */
  jump: function () {
    if (!actx || muted) return;
    var t = actx.currentTime;
    tone({ t0: t, type: 'sine', f0: 260, f1: 540, dur: 0.13, g: 0.22 });
    noise({ t0: t, dur: 0.05, g: 0.12, filter: 'bandpass', f0: 1200, f1: 800, q: 1 });
  },
  /** 爆发：上升噪声扫 300→3kHz + 低频 rumble 余韵 */
  burst: function () {
    if (!actx || muted) return;
    var t = actx.currentTime;
    noise({ t0: t, dur: 0.4, g: 0.5, filter: 'bandpass', f0: 300, f1: 3000, q: 1.1, attack: 0.05 });
    noise({ t0: t + 0.05, dur: 0.6, g: 0.35, filter: 'lowpass', f0: 120, f1: 60, q: 0.5 });
    tone({ t0: t, type: 'sine', f0: 70, f1: 45, dur: 0.5, g: 0.35 });
  },
  /** 必杀蓄力：锯齿波 100→400Hz 上升 0.3s */
  specialCharge: function () {
    if (!actx || muted) return;
    tone({ t0: actx.currentTime, type: 'sawtooth', f0: 100, f1: 400, dur: 0.3, g: 0.16, attack: 0.02 });
  },
  /** 必杀命中：大爆炸（噪声 600ms 衰减 + 50Hz 正弦 + 次低频下滑） */
  specialHit: function () {
    if (!actx || muted) return;
    var t = actx.currentTime;
    noise({ t0: t, dur: 0.6, g: 0.75, filter: 'lowpass', f0: 2200, f1: 150, q: 0.6, attack: 0.005 });
    tone({ t0: t, type: 'sine', f0: 52, f1: 38, dur: 0.55, g: 0.6 });
    tone({ t0: t, type: 'triangle', f0: 130, f1: 28, dur: 0.5, g: 0.3 });
  },
  /** KO：慢爆炸 + 下滑音 */
  ko: function () {
    if (!actx || muted) return;
    var t = actx.currentTime;
    noise({ t0: t, dur: 0.9, g: 0.5, filter: 'lowpass', f0: 900, f1: 80, q: 0.5, attack: 0.01 });
    tone({ t0: t, type: 'sine', f0: 320, f1: 55, dur: 0.85, g: 0.4 });
  },
  /** 回合开始：锣感（220Hz 长衰减 + 泛音 + 敲击噪声） */
  roundStart: function () {
    if (!actx || muted) return;
    var t = actx.currentTime;
    tone({ t0: t, type: 'sine', f0: 220, f1: 214, dur: 1.2, g: 0.4, attack: 0.004 });
    tone({ t0: t, type: 'sine', f0: 332, dur: 0.8, g: 0.18 });
    tone({ t0: t, type: 'sine', f0: 445, dur: 0.5, g: 0.1 });
    noise({ t0: t, dur: 0.06, g: 0.2, filter: 'highpass', f0: 2000, q: 0.7 });
  },
  /** UI：短 click */
  ui: function () {
    if (!actx || muted) return;
    var t = actx.currentTime;
    tone({ t0: t, type: 'square', f0: 880, f1: 860, dur: 0.035, g: 0.1 });
    noise({ t0: t, dur: 0.02, g: 0.08, filter: 'highpass', f0: 4000, q: 0.7 });
  },
  /** 胜利：三音上行 jingle */
  win: function () {
    if (!actx || muted) return;
    var t = actx.currentTime;
    var notes = [[523, 0], [659, 0.14], [784, 0.28]];
    for (var i = 0; i < notes.length; i++) {
      tone({ t0: t + notes[i][1], type: 'sine', f0: notes[i][0], dur: 0.22, g: 0.25 });
      tone({ t0: t + notes[i][1], type: 'triangle', f0: notes[i][0] * 2, dur: 0.18, g: 0.08 });
    }
  },
  /** 失败：三音下行 jingle */
  lose: function () {
    if (!actx || muted) return;
    var t = actx.currentTime;
    var notes = [[392, 0], [311, 0.2], [233, 0.42]];
    for (var i = 0; i < notes.length; i++) {
      tone({ t0: t + notes[i][1], type: 'sine', f0: notes[i][0], dur: 0.3, g: 0.25 });
    }
  },

  /* ---- snake_case 分发器（main.js sfx 适配层专用；未登记的名字静默忽略）---- */
  play: function (name) {
    switch (name) {
      case 'ui': this.ui(); break;
      case 'round_start': this.roundStart(); break;
      case 'round_win': this.ui(); break;
      case 'ko': this.ko(); break;
      case 'win': this.win(); break;
      case 'lose': this.lose(); break;
      case 'hit_light': this.hit('light'); break;
      case 'hit_heavy': this.hit('heavy'); break;
      case 'hit_air': this.hit('air'); break;
      case 'hit_special': this.specialHit(); break;
      case 'blocked': this.block(); break;
      case 'whiff': this.whiff(); break;
      case 'jump': this.jump(); break;
      case 'burst': this.burst(); break;
      case 'special_charge': this.specialCharge(); break;
      case 'special_dash': this.whiff(); break; // 短扫频近似
    }
  },
  /** 静音开关（main.js M 键调用） */
  toggleMute: function () { this.setMuted(!muted); }
};

})();
