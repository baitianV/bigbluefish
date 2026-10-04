/* =========================================================================
 * 杀鲸霸拳 (Whale Fist) - art.js
 * 角色矢量绘制层：鲸鱼娘 (whale) & 蓝总 (villain)
 * 契约: window.BFArt = { PALETTE, drawFighter(ctx, f), drawPortrait(ctx, who, x, y, size) }
 * 纯 Canvas2D 路径绘制，零外部资源；全部动画由 f.animT / f.stateFrame 程序驱动。
 * 引擎传入 Fighter 字段（只读）：
 *   { x, y, vx, vy, facing, state, stateFrame, animT, onGround, hp, maxHp,
 *     token, burstFramesLeft, moveKey, attackPhase, isCPU }
 * 未知 state 一律回退 idle 画法。
 * ======================================================================= */
(function () {
'use strict';

var TAU = Math.PI * 2;
var OUT = '#1D2233'; // 统一描边深色

/* ---------------- 色板 ---------------- */
var PALETTE = {
  // 通用
  OUTLINE: OUT,
  // 鲸鱼娘
  W_SKIN: '#FFF3EC',      // 肤
  W_EYE: '#3D6FD8',       // 瞳
  W_HAIR_TOP: '#5B6BBF',  // 发上部
  W_HAIR_TIP: '#7FA8E8',  // 发尾
  W_HEADBAND: '#FFFFFF',  // 白蕾丝发箍
  W_BOW: '#4A7FD4',       // 蓝蝴蝶结 / 鳍
  W_FEATHER: '#F4F8FF',   // 耳侧白羽
  W_DRESS: '#2B3160',     // 深藏青裙
  W_DRESS_DARK: '#232848',
  W_HEMBAND: '#4A5298',   // 裙摆饰带
  W_APRON: '#FFFFFF',     // 白围裙
  W_PRINT: '#5B8FE8',     // 围裙鲸鱼印花
  W_TAIL: '#4A6FC8',      // 鲸尾
  W_TAIL_DARK: '#3D5FAE',
  W_SOCK: '#FFFFFF',      // 白短袜
  W_SHOE: '#2B3160',      // 深蓝 Mary Jane
  W_GEM: '#5B8FE8',       // 蓝宝石胸针
  W_CHEEK: '#F7C9C4',     // 腮红
  GOLD: '#C9A227',        // 裙摆金色点缀
  // 蓝总
  V_SKIN: '#F5EDE8',      // 苍白肤
  V_EYE: '#3D6FD8',       // 锐利蓝眼
  V_HAIR: '#2B4FD0',      // 主发色
  V_HAIR_HI: '#5B8FE8',   // 高光
  V_HAIR_DARK: '#1A2E80', // 暗部
  V_SUIT: '#1A1A20',      // 黑西装
  V_SUIT_HI: '#2A2A34',
  V_SHIRT: '#EDEFF2',     // 白衬衫
  V_TIE: '#2B5BD0',       // 宝蓝领带
  V_SHOE: '#101014',
  // 特效（前缀式，便于拼 alpha）
  STAR: '#FFFFFF',
  FX_GHOST: 'rgba(74,111,200,',
  FX_BLUE: 'rgba(91,143,232,',
  FX_RING: 'rgba(127,184,240,'
};

/* ---------------- 骨架参数（脚底锚点，本地 +x = 面朝方向） ---------------- */
var SK = {
  whale: { // 2.5 头身 Q 版
    headR: 46, headCY: -150, neckY: -112,
    shoulderY: -100, shDX: 15, hipY: -62,
    skirtTop: -72, skirtBot: -26, hemHalf: 46,
    legDX: 9, legLen: 40, armW: 11, legW: 10, maxArm: 40
  },
  villain: { // 4.5 头身瘦削青年
    headR: 23, headCY: -176, neckY: -155,
    shoulderY: -149, shDX: 10, hipY: -92,
    jacketHem: -76,
    legDX: 6.5, legLen: 92, armW: 8, legW: 7, maxArm: 52
  }
};

/* ---------------- 基础绘制工具 ---------------- */
function fillStroke(ctx, fill, lw) {
  ctx.fillStyle = fill; ctx.fill();
  if (lw) { ctx.lineWidth = lw; ctx.strokeStyle = OUT; ctx.lineJoin = 'round'; ctx.stroke(); }
}
function fillStrokeG(ctx, g, lw) {
  ctx.fillStyle = g; ctx.fill();
  if (lw) { ctx.lineWidth = lw; ctx.strokeStyle = OUT; ctx.lineJoin = 'round'; ctx.stroke(); }
}
function circle(ctx, x, y, r, fill, lw) {
  if (!fill) return;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
  fillStroke(ctx, fill, lw || 0);
}
function ell(ctx, x, y, rx, ry, rot, fill, lw) {
  if (!fill) return;
  ctx.beginPath(); ctx.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot || 0, 0, TAU);
  fillStroke(ctx, fill, lw || 0);
}
function rr(ctx, x, y, w, h, r, fill, lw) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  fillStroke(ctx, fill, lw || 0);
}
/* 四肢：深色宽描边 + 彩色窄描边叠画（二次贝塞尔圆润肢体） */
function limb2(ctx, sx, sy, hx, hy, bx, by, w, color) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.quadraticCurveTo(bx, by, hx, hy);
  ctx.strokeStyle = OUT; ctx.lineWidth = w + 5; ctx.stroke();
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke();
}
/* 四角星（蓝总粒子） */
function star4(ctx, x, y, r, rot, alpha) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(rot || 0);
  ctx.globalAlpha = alpha == null ? 1 : alpha;
  var k = r * 0.2;
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.quadraticCurveTo(k, -k, r, 0);
  ctx.quadraticCurveTo(k, k, 0, r);
  ctx.quadraticCurveTo(-k, k, -r, 0);
  ctx.quadraticCurveTo(-k, -k, 0, -r);
  ctx.closePath();
  ctx.fillStyle = PALETTE.STAR; ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
}
function bow(ctx, x, y, s, col) {
  ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(x - s, y - s * 0.62); ctx.lineTo(x - s * 0.5, y + s * 0.3); ctx.closePath();
  ctx.moveTo(x, y); ctx.lineTo(x + s, y - s * 0.62); ctx.lineTo(x + s * 0.5, y + s * 0.3); ctx.closePath();
  fillStroke(ctx, col, 2);
}
function pseudo(i) {
  var v = Math.sin(i * 12.9898) * 43758.5453;
  return v - Math.floor(v);
}

/* ---------------- 姿态解算（全部状态 → 统一姿态参数） ---------------- */
function poseOf(f, who, sk) {
  var T = f.animT || 0;
  var st = f.state || 'idle';
  var ph = f.attackPhase || 'startup';
  var sy = sk.shoulderY, dx = sk.shDX;
  var p = {
    lean: 0, bob: Math.sin(T * 3.1) * 2, crouch: 0,
    footF: { x: sk.legDX + 2, y: 0 }, footB: { x: -sk.legDX - 2, y: 0 },
    handF: null, handB: null, bendF: 6, bendB: 6,
    headTilt: 0, mouth: 'flat', eyes: 'flat',
    tilt: 0, liftY: 0, squash: 1,
    cracks: false, rings: false, ghost: 0, armSwing: 0
  };
  switch (st) {
    case 'walk': {
      var s = Math.sin(T * 9);
      p.lean = 0.09;
      p.footF = { x: 12 + 15 * s, y: -Math.max(0, Math.cos(T * 9)) * 6 };
      p.footB = { x: -12 - 15 * s, y: -Math.max(0, -Math.cos(T * 9)) * 6 };
      p.armSwing = -s;
      break;
    }
    case 'jump':
      p.footF = { x: sk.legDX + 8, y: -sk.legLen * 0.42 };
      p.footB = { x: -sk.legDX + 5, y: -sk.legLen * 0.3 };
      p.handF = { x: dx + 11, y: sy + 4 };
      p.handB = { x: -dx - 9, y: sy };
      break;
    case 'attack_air':
      p.footF = { x: sk.legDX + 6, y: -sk.legLen * 0.36 };
      p.footB = { x: -sk.legDX + 4, y: -sk.legLen * 0.26 };
      if (ph === 'startup') { p.handF = { x: dx - 11, y: sy - 62 }; p.handB = { x: -dx - 3, y: sy - 4 }; }
      else if (ph === 'active') { p.lean = 0.2; p.squash = 1.04; p.bendF = 0; p.handF = { x: dx + 29, y: sy + 24 }; p.handB = { x: -dx - 5, y: sy }; }
      else { p.handF = { x: dx + 15, y: sy + 12 }; p.handB = { x: -dx - 1, y: sy + 4 }; }
      break;
    case 'attack_light':
      if (ph === 'startup') { p.crouch = 6; p.squash = 0.95; p.handF = { x: dx - 20, y: sy + 8 }; p.handB = { x: dx - 1, y: sy - 2 }; }
      else if (ph === 'active') { p.lean = 0.13; p.squash = 1.03; p.bendF = 0; p.handF = { x: dx + 41, y: sy + 6 }; p.handB = { x: -dx + 1, y: sy }; }
      else { p.lean = 0.05; p.handF = { x: dx + 11, y: sy + 12 }; }
      break;
    case 'attack_heavy':
      if (ph === 'startup') { p.crouch = 10; p.squash = 0.94; p.lean = -0.14; p.bendF = 9; p.handF = { x: -dx - 5, y: sy - 2 }; p.handB = { x: -dx - 1, y: sy + 10 }; }
      else if (ph === 'active') { p.lean = 0.3; p.squash = 1.06; p.bendF = 0; p.handF = { x: dx + 47, y: sy + 18 }; p.handB = { x: -dx - 9, y: sy + 4 }; }
      else { p.lean = 0.12; p.bendF = 4; p.handF = { x: dx + 9, y: sy + 10 }; }
      break;
    case 'block':
    case 'blockstun': {
      p.crouch = 12; p.lean = st === 'blockstun' ? -0.08 : 0.02;
      p.bendF = -4; p.bendB = -4;
      var j = st === 'blockstun' ? Math.sin(T * 55) * 2.2 : 0;
      p.handF = { x: dx + 9 + j, y: sy - 16 };
      p.handB = { x: dx + 1 - j, y: sy - 2 };
      p.footF = { x: 14, y: 0 }; p.footB = { x: -14, y: -2 };
      break;
    }
    case 'hitstun':
      p.lean = -0.2; p.headTilt = -0.16; p.eyes = 'angry'; p.mouth = 'open';
      p.handF = { x: dx + 11, y: sy - 18 }; p.handB = { x: -dx - 7, y: sy - 8 };
      p.footF = { x: sk.legDX + 6, y: 0 }; p.footB = { x: -sk.legDX - 6, y: -3 };
      break;
    case 'launched':
      p.tilt = -0.45; p.liftY = -8; p.eyes = 'x'; p.mouth = 'open';
      p.handF = { x: dx + 19, y: sy - 38 }; p.handB = { x: -dx - 15, y: sy - 48 };
      p.footF = { x: sk.legDX + 13, y: -12 }; p.footB = { x: -sk.legDX - 3, y: -22 };
      break;
    case 'knockdown':
      p.tilt = -1.32; p.liftY = -6; p.eyes = 'x'; p.mouth = 'open';
      p.handF = { x: dx + 5, y: sy - 18 }; p.handB = { x: -dx - 9, y: sy - 28 };
      p.footF = { x: sk.legDX + 7, y: -6 }; p.footB = { x: -sk.legDX + 3, y: -14 };
      break;
    case 'getup':
      p.tilt = -0.7; p.crouch = 16; p.liftY = -2;
      p.handF = { x: dx + 5, y: sy + 12 }; p.handB = { x: -dx - 2, y: sk.hipY + 14 };
      break;
    case 'special_startup': {
      p.crouch = 24; p.lean = 0.1; p.eyes = 'angry'; p.cracks = true;
      var tr = Math.sin(T * 42) * 1.3;
      p.handF = { x: dx + 12 + tr, y: sk.hipY - 6 };
      p.handB = { x: -dx - 12 + tr, y: sk.hipY - 6 };
      p.footF = { x: 20, y: 0 }; p.footB = { x: -20, y: 0 };
      break;
    }
    case 'special_dash':
      p.lean = 0.45; p.squash = 1.06; p.eyes = 'angry'; p.bendF = 0;
      p.handF = { x: dx + 50, y: sy + (who === 'whale' ? 0 : 26) };
      p.handB = { x: -dx - 16, y: sy + 4 };
      p.footF = { x: sk.legDX + 16, y: 0 }; p.footB = { x: -sk.legDX - 10, y: -6 };
      p.ghost = 0.34 + 0.14 * Math.sin(T * 26);
      break;
    case 'special_recovery':
      p.lean = -0.06; p.crouch = 4; p.mouth = 'open';
      p.bob = Math.sin(T * 8) * 3;
      p.handF = { x: dx + 3, y: sy + 14 }; p.handB = { x: -dx - 1, y: sy + 12 };
      break;
    case 'burst_flare':
      p.crouch = 6; p.eyes = 'wide'; p.mouth = 'open'; p.rings = true;
      p.handF = { x: dx + 23, y: sy - 50 }; p.handB = { x: -dx - 23, y: sy - 50 };
      p.footF = { x: 22, y: 0 }; p.footB = { x: -22, y: 0 };
      break;
    case 'ko':
      p.tilt = -1.5; p.liftY = -10; p.eyes = 'x'; p.mouth = 'open';
      p.handF = { x: dx + 9, y: sy - 22 }; p.handB = { x: -dx - 5, y: sy - 34 };
      p.footF = { x: sk.legDX + 9, y: -8 }; p.footB = { x: -sk.legDX + 5, y: -4 };
      break;
    case 'victory':
      if (who === 'villain') { // 整理领带冷笑
        p.headTilt = 0.06; p.mouth = 'smirk';
        p.handF = { x: dx - 2, y: sy + 30 }; p.handB = { x: -dx - 4, y: sy + 33 };
      } else { // 举双拳庆祝（表情依旧冷淡）
        p.bob = -Math.abs(Math.sin(T * 5)) * 7; p.eyes = 'shut';
        p.handF = { x: dx + 7, y: sk.headCY - sk.headR * 0.55 };
        p.handB = { x: -dx - 7, y: sk.headCY - sk.headR * 0.55 };
      }
      break;
    case 'roundstart':
      p.crouch = 3;
      p.handF = { x: dx + 5, y: sy + 14 }; p.handB = { x: -dx, y: sy + 14 };
      break;
    case 'idle':
    default: // 未知状态回退 idle 画法
      break;
  }
  return p;
}

/* ---------------- 特效件 ---------------- */
function drawCracks(ctx) { // special_startup 脚下裂纹
  ctx.save();
  ctx.strokeStyle = OUT; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  var angs = [0.15, 0.8, 1.5, -0.5, -1.2, 2.4];
  for (var i = 0; i < angs.length; i++) {
    var a = angs[i], dx = Math.cos(a), dy = Math.sin(a) * 0.3;
    ctx.beginPath();
    ctx.moveTo(dx * 14, -2 + dy * 14);
    ctx.lineTo(dx * 24, -2 + dy * 24);
    ctx.lineTo(dx * 34 + 3, -2 + dy * 34 - 2);
    ctx.stroke();
  }
  ctx.restore();
}
function drawRings(ctx, fr) { // burst_flare 环形冲击波
  var k = fr % 26;
  ctx.save();
  ctx.strokeStyle = PALETTE.FX_RING + '0.9)';
  ctx.lineCap = 'round';
  for (var i = 0; i < 2; i++) {
    var t = (k + i * 13) % 26;
    var r = 26 + t * 4.6;
    ctx.globalAlpha = Math.max(0, 1 - t / 26);
    ctx.lineWidth = Math.max(1.2, 4 - t * 0.08);
    ctx.beginPath();
    ctx.ellipse(0, -95, r, r * 0.92, 0, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}
function drawGhostWhale(ctx, x, y, alpha) { // special_dash 蓝鲸虚影（剪影+眼+尾鳍）
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = PALETTE.FX_GHOST + '0.55)';
  ctx.beginPath();
  ctx.moveTo(44, 0);
  ctx.quadraticCurveTo(26, -20, -6, -17);
  ctx.quadraticCurveTo(-30, -14, -46, -4);
  ctx.quadraticCurveTo(-58, -16, -70, -13);   // 尾鳍上叶
  ctx.quadraticCurveTo(-62, -6, -66, 0);
  ctx.quadraticCurveTo(-62, 7, -70, 14);      // 尾鳍下叶
  ctx.quadraticCurveTo(-56, 16, -46, 5);
  ctx.quadraticCurveTo(-28, 15, -4, 17);
  ctx.quadraticCurveTo(28, 20, 44, 0);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath(); // 胸鳍
  ctx.moveTo(-2, 10); ctx.quadraticCurveTo(-8, 22, -18, 26); ctx.quadraticCurveTo(-12, 14, -10, 8);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath(); ctx.arc(28, -5, 3.2, 0, TAU); ctx.fill(); // 眼白
  ctx.fillStyle = '#16336E';
  ctx.beginPath(); ctx.arc(29, -5, 1.6, 0, TAU); ctx.fill(); // 瞳
  ctx.strokeStyle = PALETTE.FX_GHOST + '0.4)'; // 运动残影线
  ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-52, -18); ctx.lineTo(-84, -22);
  ctx.moveTo(-58, 8); ctx.lineTo(-88, 12);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
}
function drawHalo(ctx, sk, T) { // burstFramesLeft>0 蓝色火焰光环
  var fl = 0.6 + 0.25 * Math.sin(T * 24) + 0.12 * Math.sin(T * 41 + 1.7);
  var cy = sk.headCY * 0.62;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  var layers = [[46, 0.1], [58, 0.07], [72, 0.05]];
  for (var i = 0; i < layers.length; i++) {
    ctx.beginPath();
    ctx.ellipse(0, cy, layers[i][0] * (0.92 + 0.08 * Math.sin(T * 18 + i)), layers[i][0] * 1.85, 0, 0, TAU);
    ctx.fillStyle = PALETTE.FX_BLUE + (layers[i][1] * Math.max(0.3, fl)).toFixed(3) + ')';
    ctx.fill();
  }
  ctx.restore();
}
function drawStars(ctx, T) { // 蓝总常驻白色四角星粒子（自绘，不依赖引擎）
  for (var i = 0; i < 6; i++) {
    var ph = i * 1.13;
    var x = -36 + i * 14 + Math.sin(T * 1.5 + ph) * 8;
    var y = -168 + ((i * 37) % 110) + Math.cos(T * 1.2 + ph) * 9;
    var r = 3 + (i % 3) * 1.7;
    var a = 0.4 + 0.28 * (0.5 + 0.5 * Math.sin(T * 2.1 + ph * 2));
    star4(ctx, x, y, r, T * 0.5 + i, a);
  }
}

/* ---------------- 鲸鱼娘部件 ---------------- */
function whaleTail(ctx, T, lean) { // 裙后鲸尾
  var sway = Math.sin(T * 2.2) * 0.16 + lean * 0.4;
  ctx.save();
  ctx.translate(-16, -50);
  ctx.rotate(sway);
  ctx.beginPath();
  ctx.moveTo(2, -10);
  ctx.quadraticCurveTo(-18, -16, -30, -8);
  ctx.quadraticCurveTo(-44, -20, -56, -16);   // 尾鳍上叶
  ctx.quadraticCurveTo(-48, -8, -42, -2);
  ctx.quadraticCurveTo(-46, 0, -42, 3);
  ctx.quadraticCurveTo(-50, 10, -54, 20);     // 尾鳍下叶
  ctx.quadraticCurveTo(-42, 18, -30, 8);
  ctx.quadraticCurveTo(-16, 14, 2, 10);
  ctx.quadraticCurveTo(6, 0, 2, -10);
  ctx.closePath();
  fillStroke(ctx, PALETTE.W_TAIL, 3);
  ctx.strokeStyle = PALETTE.W_TAIL_DARK; ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-12, -4); ctx.quadraticCurveTo(-22, 0, -30, 4);
  ctx.moveTo(-14, 4); ctx.quadraticCurveTo(-22, 6, -28, 8);
  ctx.stroke();
  ctx.restore();
}
function whaleBackHairAt(ctx, R, T) { // 头中心为原点的背发大形体
  var sw = Math.sin(T * 1.6) * 3;
  var g = ctx.createLinearGradient(0, -R, 0, R * 2.55);
  g.addColorStop(0, PALETTE.W_HAIR_TOP); g.addColorStop(1, PALETTE.W_HAIR_TIP);
  ctx.beginPath();
  ctx.moveTo(0, -R - 4);
  ctx.quadraticCurveTo(R + 8, -R * 0.7, R + 7, 0);
  ctx.quadraticCurveTo(R + 10, R * 0.9, R - 2 + sw, 64);
  ctx.quadraticCurveTo(R + 6 + sw, 86, R - 14 + sw, 102);
  ctx.quadraticCurveTo(R - 26 + sw, 112, R - 30 + sw, 104);
  ctx.quadraticCurveTo(R - 34 + sw, 114, sw * 0.5, 118);
  ctx.quadraticCurveTo(-R + 34 + sw, 114, -R + 30 + sw, 104);
  ctx.quadraticCurveTo(-R + 26 + sw, 112, -R + 14 + sw, 102);
  ctx.quadraticCurveTo(-R + 6 + sw, 86, -R + 2 + sw, 64);
  ctx.quadraticCurveTo(-R - 10, R * 0.9, -R - 7, 0);
  ctx.quadraticCurveTo(-R - 8, -R * 0.7, 0, -R - 4);
  ctx.closePath();
  fillStrokeG(ctx, g, 3);
}
function finWing(ctx, sgn, R) { // 耳侧鲸鳍翼：白羽 + 蓝鳍
  var x = sgn * R * 0.88, y = R * 0.22;
  ctx.save();
  ctx.translate(x, y);
  ell(ctx, sgn * 14, -2, 15, 5, sgn * 0.25, PALETTE.W_FEATHER, 2);
  ell(ctx, sgn * 12, 5, 13, 4.5, sgn * 0.5, PALETTE.W_FEATHER, 2);
  ctx.beginPath();
  ctx.moveTo(-sgn * 4, -6);
  ctx.quadraticCurveTo(sgn * 18, -2, sgn * 24, 6);
  ctx.quadraticCurveTo(sgn * 14, 8, sgn * 6, 9);
  ctx.quadraticCurveTo(sgn * 2, 2, -sgn * 4, -6);
  ctx.closePath();
  fillStroke(ctx, PALETTE.W_BOW, 2.5);
  ctx.restore();
}
function sideLock(ctx, sgn, R) { // 脸侧长卷发绺
  var g = ctx.createLinearGradient(0, -R * 0.4, 0, R * 1.6);
  g.addColorStop(0, PALETTE.W_HAIR_TOP); g.addColorStop(1, PALETTE.W_HAIR_TIP);
  ctx.beginPath();
  ctx.moveTo(sgn * R * 0.86, -R * 0.28);
  ctx.quadraticCurveTo(sgn * R * 1.18, R * 0.25, sgn * R * 0.98, R * 1.05);
  ctx.quadraticCurveTo(sgn * R * 0.9, R * 1.3, sgn * R * 0.78, R * 1.42);
  ctx.quadraticCurveTo(sgn * R * 0.82, R * 0.7, sgn * R * 0.62, R * 0.2);
  ctx.quadraticCurveTo(sgn * R * 0.6, -R * 0.15, sgn * R * 0.7, -R * 0.3);
  ctx.closePath();
  fillStrokeG(ctx, g, 2.5);
}
function headband(ctx, R) { // 白蕾丝发箍 + 扇贝蕾丝边
  ctx.beginPath();
  ctx.arc(0, -R * 0.06, R * 0.98, Math.PI * 1.02, Math.PI * 1.98);
  ctx.arc(0, -R * 0.06, R * 0.62, Math.PI * 1.98, Math.PI * 1.02, true);
  ctx.closePath();
  fillStroke(ctx, PALETTE.W_HEADBAND, 3);
  for (var i = 0; i < 5; i++) {
    var a = Math.PI * (1.1 + 0.2 * i);
    circle(ctx, Math.cos(a) * R * 0.99, -R * 0.06 + Math.sin(a) * R * 0.99, 4.5, PALETTE.W_HEADBAND, 2);
  }
}
function ahoge(ctx, R, T) { // 大弯钩呆毛（喷水卷曲）
  var sway = Math.sin(T * 2.6) * 0.12;
  ctx.save();
  ctx.translate(R * 0.06, -R * 0.98);
  ctx.rotate(sway - 0.15);
  ctx.beginPath();
  ctx.moveTo(0, 3);
  ctx.quadraticCurveTo(R * 0.15, -R * 0.5, R * 0.62, -R * 0.72);
  ctx.quadraticCurveTo(R * 0.85, -R * 0.8, R * 0.98, -R * 0.62);
  ctx.quadraticCurveTo(R * 0.8, -R * 0.6, R * 0.6, -R * 0.52);
  ctx.quadraticCurveTo(R * 0.28, -R * 0.36, R * 0.12, 0);
  ctx.closePath();
  fillStroke(ctx, PALETTE.W_HAIR_TOP, 2.5);
  ctx.restore();
}
function eyeWhale(ctx, x, y, R, mode) {
  var rx = R * 0.155, ry = R * 0.21;
  ctx.lineCap = 'round';
  if (mode === 'x') {
    ctx.strokeStyle = OUT; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 6, y - 6); ctx.lineTo(x + 6, y + 6);
    ctx.moveTo(x + 6, y - 6); ctx.lineTo(x - 6, y + 6);
    ctx.stroke(); return;
  }
  if (mode === 'shut') {
    ctx.strokeStyle = OUT; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y + 3, R * 0.16, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke(); return;
  }
  if (mode === 'wide') {
    circle(ctx, x, y, R * 0.2, '#FFFFFF', 2);
    circle(ctx, x, y, R * 0.1, PALETTE.W_EYE, 0);
  } else {
    ell(ctx, x, y, mode === 'angry' ? rx * 0.9 : rx, mode === 'angry' ? ry * 0.62 : ry, 0, PALETTE.W_EYE, 2);
    ell(ctx, x, y + ry * 0.35, rx * 0.6, ry * 0.42, 0, '#7FA8E8', 0);
    circle(ctx, x, y, ry * 0.16 + 1.5, '#22355F', 0);
    circle(ctx, x - rx * 0.35, y - ry * 0.4, R * 0.05, '#FFFFFF', 0);
    circle(ctx, x + rx * 0.3, y + ry * 0.25, R * 0.025, '#FFFFFF', 0);
  }
  ctx.strokeStyle = OUT; ctx.lineWidth = 3;
  ctx.beginPath();
  if (mode === 'angry') { ctx.moveTo(x - R * 0.2, y - R * 0.3); ctx.lineTo(x + R * 0.2, y - R * 0.18); }
  else { ctx.moveTo(x - R * 0.19, y - R * 0.16); ctx.lineTo(x + R * 0.19, y - R * 0.19); } // 冷淡垂睑
  ctx.stroke();
}
function mouthWhale(ctx, x, y, R, mode) {
  ctx.strokeStyle = '#8A4A52'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  if (mode === 'open') { ell(ctx, x, y, R * 0.07, R * 0.09, 0, '#6B3A44', 2); return; }
  ctx.beginPath();
  if (mode === 'frown') { ctx.moveTo(x - R * 0.08, y + 1); ctx.quadraticCurveTo(x, y - R * 0.07, x + R * 0.08, y + 1); }
  else if (mode === 'smirk') { ctx.moveTo(x - 4, y + 1); ctx.lineTo(x + 6, y - 2); }
  else { ctx.moveTo(x - R * 0.08, y); ctx.lineTo(x + R * 0.08, y); } // 默认：面无表情平嘴
  ctx.stroke();
}
function whaleHeadAt(ctx, R, p, T) { // 头中心为原点
  circle(ctx, 0, 0, R, PALETTE.W_SKIN, 3); // 脸
  finWing(ctx, -1, R); finWing(ctx, 1, R); // 鳍翼
  // 刘海
  var g = ctx.createLinearGradient(0, -R, 0, R * 0.2);
  g.addColorStop(0, PALETTE.W_HAIR_TOP); g.addColorStop(1, PALETTE.W_HAIR_TIP);
  ctx.beginPath();
  ctx.moveTo(-R * 0.98, -R * 0.12);
  ctx.quadraticCurveTo(-R * 1.02, -R * 0.75, -R * 0.45, -R * 0.98);
  ctx.quadraticCurveTo(0, -R * 1.1, R * 0.45, -R * 0.98);
  ctx.quadraticCurveTo(R * 1.02, -R * 0.75, R * 0.98, -R * 0.12);
  ctx.quadraticCurveTo(R * 0.8, -R * 0.34, R * 0.62, -R * 0.3);
  ctx.quadraticCurveTo(R * 0.5, -R * 0.52, R * 0.3, -R * 0.5);
  ctx.quadraticCurveTo(R * 0.15, -R * 0.68, -R * 0.02, -R * 0.52);
  ctx.quadraticCurveTo(-R * 0.2, -R * 0.72, -R * 0.38, -R * 0.5);
  ctx.quadraticCurveTo(-R * 0.55, -R * 0.56, -R * 0.66, -R * 0.32);
  ctx.quadraticCurveTo(-R * 0.85, -R * 0.3, -R * 0.98, -R * 0.12);
  ctx.closePath();
  fillStrokeG(ctx, g, 3);
  sideLock(ctx, -1, R); sideLock(ctx, 1, R);
  headband(ctx, R);
  bow(ctx, -R * 0.66, -R * 0.66, 8, PALETTE.W_BOW);
  bow(ctx, R * 0.66, -R * 0.66, 8, PALETTE.W_BOW);
  ahoge(ctx, R, T);
  eyeWhale(ctx, -R * 0.36, R * 0.06, R, p.eyes);
  eyeWhale(ctx, R * 0.36, R * 0.06, R, p.eyes);
  ctx.globalAlpha = 0.5;
  ell(ctx, -R * 0.58, R * 0.3, R * 0.13, R * 0.075, 0, PALETTE.W_CHEEK, 0);
  ell(ctx, R * 0.58, R * 0.3, R * 0.13, R * 0.075, 0, PALETTE.W_CHEEK, 0);
  ctx.globalAlpha = 1;
  mouthWhale(ctx, 0, R * 0.52, R, p.mouth);
}
function whaleHeadGroup(ctx, sk, p, T) {
  ctx.save();
  ctx.translate(0, sk.headCY);
  if (p.headTilt) {
    ctx.translate(0, sk.headR * 0.8); ctx.rotate(p.headTilt); ctx.translate(0, -sk.headR * 0.8);
  }
  whaleHeadAt(ctx, sk.headR, p, T);
  ctx.restore();
}
function drawWhalePrint(ctx, x, y) { // 围裙中央鲸鱼印花
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(13, 0);
  ctx.quadraticCurveTo(8, -7, -2, -6.5);
  ctx.quadraticCurveTo(-10, -6, -12, -1);
  ctx.lineTo(-17, -6); ctx.quadraticCurveTo(-15, -1, -17, 3); // 尾鳍
  ctx.lineTo(-12, 0.5);
  ctx.quadraticCurveTo(-8, 5, 0, 5.5);
  ctx.quadraticCurveTo(9, 6, 13, 0);
  ctx.closePath();
  fillStroke(ctx, PALETTE.W_PRINT, 1.5);
  circle(ctx, 8, -1.5, 1.1, '#FFFFFF', 0);
  ctx.strokeStyle = PALETTE.W_PRINT; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
  ctx.beginPath(); // 喷水
  ctx.moveTo(4, -9); ctx.lineTo(2, -13);
  ctx.moveTo(7, -9); ctx.lineTo(7, -14);
  ctx.moveTo(10, -9); ctx.lineTo(12, -13);
  ctx.stroke();
  ctx.restore();
}
function whaleTorso(ctx, sk, T) {
  var sway = Math.sin(T * 1.8) * 0.035; // 裙摆微摆
  ctx.save();
  ctx.translate(0, sk.waistY || sk.skirtTop); ctx.rotate(sway); ctx.translate(0, -(sk.waistY || sk.skirtTop));
  // 大裙摆（扇贝下缘）
  var n = 5, hw = sk.hemHalf, w2 = hw * 2, i, x0, x1;
  ctx.beginPath();
  ctx.moveTo(-16, sk.skirtTop);
  ctx.quadraticCurveTo(-34, -52, -hw, sk.skirtBot);
  for (i = 0; i < n; i++) {
    x0 = -hw + (w2 / n) * i; x1 = x0 + w2 / n;
    ctx.quadraticCurveTo((x0 + x1) / 2, sk.skirtBot + 8, x1, sk.skirtBot);
  }
  ctx.quadraticCurveTo(34, -52, 16, sk.skirtTop);
  ctx.closePath();
  fillStroke(ctx, PALETTE.W_DRESS, 3);
  // 裙摆饰带 + 金色点缀
  ctx.strokeStyle = PALETTE.W_HEMBAND; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  ctx.beginPath();
  for (i = 0; i < n; i++) {
    x0 = -hw + (w2 / n) * i; x1 = x0 + w2 / n;
    ctx.moveTo(x0, sk.skirtBot - 6);
    ctx.quadraticCurveTo((x0 + x1) / 2, sk.skirtBot + 2, x1, sk.skirtBot - 6);
  }
  ctx.stroke();
  bow(ctx, -18, sk.skirtBot - 5, 4.5, PALETTE.GOLD);
  bow(ctx, 18, sk.skirtBot - 5, 4.5, PALETTE.GOLD);
  // 白蕾丝围裙
  ctx.beginPath();
  ctx.moveTo(-14, sk.skirtTop - 8);
  ctx.quadraticCurveTo(-24, -58, -21, -36);
  ctx.quadraticCurveTo(-14, -30, -7, -34);
  ctx.quadraticCurveTo(0, -28, 7, -34);
  ctx.quadraticCurveTo(14, -30, 21, -36);
  ctx.quadraticCurveTo(24, -58, 14, sk.skirtTop - 8);
  ctx.closePath();
  fillStroke(ctx, PALETTE.W_APRON, 2.5);
  rr(ctx, -13, sk.skirtTop - 12, 26, 6, 3, PALETTE.W_APRON, 2); // 腰绑带
  drawWhalePrint(ctx, 1, -50);
  ctx.restore();
  // 上身衣身
  ctx.beginPath();
  ctx.moveTo(-16, -104);
  ctx.quadraticCurveTo(-20, -88, -14, sk.skirtTop);
  ctx.lineTo(14, sk.skirtTop);
  ctx.quadraticCurveTo(20, -88, 16, -104);
  ctx.quadraticCurveTo(0, -110, -16, -104);
  ctx.closePath();
  fillStroke(ctx, PALETTE.W_DRESS, 3);
  circle(ctx, 0, -106, 7, PALETTE.W_APRON, 2); // 白领
  // 白蕾丝泡泡袖
  circle(ctx, -sk.shDX - 2, sk.shoulderY + 1, 9.5, PALETTE.W_DRESS, 3);
  circle(ctx, sk.shDX + 2, sk.shoulderY + 1, 9.5, PALETTE.W_DRESS, 3);
  // 胸前黑蝴蝶结 + 蓝宝石胸针
  bow(ctx, 0, -93, 9, OUT);
  circle(ctx, 0, -93, 3.6, PALETTE.W_GEM, 2);
  circle(ctx, -1.2, -94.2, 1.2, '#FFFFFF', 0);
}

/* ---------------- 蓝总部件 ---------------- */
function spikeHair(ctx, R, col, seed) { // 炸毛（刺猬乱发）多边形
  var a0 = -Math.PI * 1.28, a1 = Math.PI * 0.25, n = 9, i;
  ctx.beginPath();
  for (i = 0; i <= n * 2; i++) {
    var a = a0 + (a1 - a0) * (i / (n * 2));
    var peak = (i % 2 === 1);
    var rad = peak ? R * (1.55 + 0.28 * pseudo(i + seed)) : R * 0.92;
    var x = Math.cos(a) * rad, y = Math.sin(a) * rad - R * 0.12;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  fillStroke(ctx, col, 3);
}
function fringe(ctx, R) { // 前额碎刘海（尖齿垂下遮眼）
  ctx.beginPath();
  ctx.moveTo(-R * 0.9, -R * 0.35);
  ctx.quadraticCurveTo(-R * 0.4, -R * 0.55, R * 0.1, -R * 0.5);
  ctx.quadraticCurveTo(R * 0.55, -R * 0.46, R * 0.95, -R * 0.25);
  ctx.lineTo(R * 0.78, R * 0.12);
  ctx.lineTo(R * 0.52, -R * 0.18);
  ctx.lineTo(R * 0.3, R * 0.34);
  ctx.lineTo(R * 0.05, -R * 0.14);
  ctx.lineTo(-R * 0.2, R * 0.1);
  ctx.lineTo(-R * 0.42, -R * 0.2);
  ctx.lineTo(-R * 0.62, R * 0.02);
  ctx.closePath();
  fillStroke(ctx, PALETTE.V_HAIR, 2);
}
function eyeVillain(ctx, x, y, R, mode) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (mode === 'x') {
    ctx.strokeStyle = OUT; ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x - 4, y - 4); ctx.lineTo(x + 4, y + 4);
    ctx.moveTo(x + 4, y - 4); ctx.lineTo(x - 4, y + 4);
    ctx.stroke(); return;
  }
  if (mode === 'shut') {
    ctx.strokeStyle = OUT; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x - R * 0.24, y + R * 0.02); ctx.lineTo(x + R * 0.26, y - R * 0.04); ctx.stroke(); return;
  }
  // 细长眼白
  ctx.beginPath();
  ctx.moveTo(x - R * 0.26, y + R * 0.08);
  ctx.lineTo(x + R * 0.26, y - R * 0.04);
  ctx.lineTo(x + R * 0.22, y + R * 0.1);
  ctx.lineTo(x - R * 0.24, y + R * 0.16);
  ctx.closePath();
  fillStroke(ctx, '#FFFFFF', 2);
  circle(ctx, x + R * 0.01, y + R * 0.05, R * 0.11, PALETTE.V_EYE, 0);
  circle(ctx, x + R * 0.01, y + R * 0.05, R * 0.05, '#16336E', 0);
  circle(ctx, x - R * 0.03, y + R * 0.01, R * 0.035, '#FFFFFF', 0);
  ctx.strokeStyle = OUT; ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(x - R * 0.28, y + R * 0.04); ctx.lineTo(x + R * 0.28, y - R * 0.08);
  ctx.stroke();
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  if (mode === 'angry') { ctx.moveTo(x - R * 0.24, y - R * 0.34); ctx.lineTo(x + R * 0.3, y - R * 0.2); }
  else { ctx.moveTo(x - R * 0.26, y - R * 0.28); ctx.lineTo(x + R * 0.3, y - R * 0.3); } // 冷漠平眉
  ctx.stroke();
}
function mouthVillain(ctx, x, y, R, mode) {
  ctx.strokeStyle = '#7A4A50'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  if (mode === 'open') { ell(ctx, x + 2, y, R * 0.09, R * 0.1, 0, '#5A3038', 2); return; }
  ctx.beginPath();
  if (mode === 'smirk') { ctx.moveTo(x - 6, y + 1); ctx.lineTo(x + 8, y - 3); ctx.lineTo(x + 10, y - 6); }
  else if (mode === 'frown') { ctx.moveTo(x - 7, y - 1); ctx.quadraticCurveTo(x, y - 5, x + 8, y); }
  else { ctx.moveTo(x - 7, y); ctx.lineTo(x + 7, y - 1); }
  ctx.stroke();
}
function villainHeadAt(ctx, R, p, T) {
  spikeHair(ctx, R * 1.22, PALETTE.V_HAIR_DARK, 3.7);   // 后层暗炸毛
  spikeHair(ctx, R * 1.02, PALETTE.V_HAIR, 0);          // 主层炸毛
  ell(ctx, R * 0.03, 0, R, R * 1.06, 0, PALETTE.V_SKIN, 3); // 脸
  eyeVillain(ctx, -R * 0.34, -R * 0.02, R, p.eyes);
  eyeVillain(ctx, R * 0.38, -R * 0.04, R, p.eyes);
  ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(R * 0.22, R * 0.22); ctx.lineTo(R * 0.26, R * 0.3); ctx.stroke(); // 鼻
  mouthVillain(ctx, R * 0.08, R * 0.52, R, p.mouth);
  fringe(ctx, R); // 刘海遮眼（必保特征）
  ctx.strokeStyle = PALETTE.V_HAIR_HI; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); // 发丝高光
  ctx.moveTo(-R * 0.55, -R * 0.75); ctx.quadraticCurveTo(-R * 0.2, -R * 1.05, R * 0.2, -R * 0.95);
  ctx.moveTo(-R * 0.7, -R * 0.45); ctx.quadraticCurveTo(-R * 0.5, -R * 0.7, -R * 0.25, -R * 0.75);
  ctx.stroke();
}
function villainHeadGroup(ctx, sk, p, T) {
  ctx.save();
  ctx.translate(0, sk.headCY);
  if (p.headTilt) {
    ctx.translate(0, sk.headR * 0.8); ctx.rotate(p.headTilt); ctx.translate(0, -sk.headR * 0.8);
  }
  villainHeadAt(ctx, sk.headR, p, T);
  ctx.restore();
}
function villainTorso(ctx, sk) {
  // 脖子
  rr(ctx, -3.5, sk.neckY, 7, sk.shoulderY - sk.neckY + 8, 3, PALETTE.V_SKIN, 2.5);
  // 白衬衫 V 领
  ctx.beginPath();
  ctx.moveTo(-7, sk.shoulderY - 3); ctx.lineTo(0, -128); ctx.lineTo(7, sk.shoulderY - 3);
  ctx.closePath();
  fillStroke(ctx, PALETTE.V_SHIRT, 2);
  // 领带（略松歪，必保特征）
  ctx.save();
  ctx.translate(0.5, sk.shoulderY + 1); ctx.rotate(0.06);
  ctx.beginPath();
  ctx.moveTo(-3, 0); ctx.lineTo(3, 0); ctx.lineTo(4.5, 4); ctx.lineTo(0, 30); ctx.lineTo(-4.5, 25);
  ctx.closePath();
  fillStroke(ctx, PALETTE.V_TIE, 2);
  ctx.restore();
  // 西装外套两片（中间露衬衫领带）
  ctx.beginPath();
  ctx.moveTo(-sk.shDX - 1, sk.shoulderY - 3);
  ctx.quadraticCurveTo(-sk.shDX - 5, -120, -sk.shDX - 3, sk.jacketHem);
  ctx.lineTo(-3, sk.jacketHem + 3);
  ctx.lineTo(-2, -126);
  ctx.quadraticCurveTo(-6, -140, -8, sk.shoulderY - 1);
  ctx.closePath();
  fillStroke(ctx, PALETTE.V_SUIT, 3);
  ctx.beginPath();
  ctx.moveTo(sk.shDX + 1, sk.shoulderY - 3);
  ctx.quadraticCurveTo(sk.shDX + 5, -120, sk.shDX + 3, sk.jacketHem);
  ctx.lineTo(3, sk.jacketHem + 3);
  ctx.lineTo(2, -126);
  ctx.quadraticCurveTo(6, -140, 8, sk.shoulderY - 1);
  ctx.closePath();
  fillStroke(ctx, PALETTE.V_SUIT, 3);
  // 领口一颗扣未系：左侧翻领 + 豁口
  ctx.strokeStyle = '#101014'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-sk.shDX - 1, sk.shoulderY - 2); ctx.lineTo(-3, -130);
  ctx.moveTo(sk.shDX + 1, sk.shoulderY - 2); ctx.lineTo(4, -132); // 右领短一截 = 敞领
  ctx.stroke();
  // 肩线高光
  ctx.strokeStyle = PALETTE.V_SUIT_HI; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-sk.shDX, sk.shoulderY); ctx.quadraticCurveTo(-4, sk.shoulderY - 4, 0, sk.shoulderY - 4);
  ctx.stroke();
}

/* ---------------- 通用肢体 ---------------- */
function drawLeg(ctx, who, sk, hipX, foot, crouch) {
  var kx = (hipX + foot.x) / 2 + (who === 'whale' ? 5 : 2.5) + crouch * 0.25;
  var ky = (sk.hipY + foot.y) / 2;
  var col = who === 'whale' ? PALETTE.W_SKIN : PALETTE.V_SUIT;
  var fy = foot.y - (who === 'whale' ? 4 : 2);
  limb2(ctx, hipX, sk.hipY, foot.x, fy, kx, ky, sk.legW, col);
  if (who === 'whale') {
    var ax = foot.x, ay = foot.y - 4;
    var sx2 = hipX + (ax - hipX) * 0.62, sy2 = sk.hipY + (ay - sk.hipY) * 0.62;
    limb2(ctx, sx2, sy2, ax, ay, (sx2 + ax) / 2 + 2, (sy2 + ay) / 2, sk.legW - 1, PALETTE.W_SOCK);
    ell(ctx, foot.x + 2, foot.y - 3, 8.5, 5, 0, PALETTE.W_SHOE, 2.5); // Mary Jane
    ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(foot.x - 3, foot.y - 8); ctx.lineTo(foot.x + 5, foot.y - 8); ctx.stroke(); // 鞋袢
  } else {
    ell(ctx, foot.x + 3, foot.y - 2.5, 9, 4.5, 0, PALETTE.V_SHOE, 2.5);
  }
}
function drawArm(ctx, who, sk, sx, sy, hand, bend) {
  var dx = hand.x - sx, dy = hand.y - sy;
  var dist = Math.hypot(dx, dy) || 1;
  var hx = hand.x, hy = hand.y;
  if (dist > sk.maxArm) { hx = sx + dx / dist * sk.maxArm; hy = sy + dy / dist * sk.maxArm; dist = sk.maxArm; }
  var b = bend || 0;
  var nx = -dy / dist, ny = dx / dist;
  var bx = (sx + hx) / 2 + nx * b, by = (sy + hy) / 2 + ny * b;
  var col = who === 'whale' ? PALETTE.W_DRESS : PALETTE.V_SUIT;
  limb2(ctx, sx, sy + 2, hx, hy, bx, by, sk.armW, col);
  if (who === 'whale') { // 白蕾丝袖口
    var t = 7 / (Math.hypot(hx - sx, hy - sy) || 1);
    circle(ctx, hx + (sx - hx) * t, hy + (sy - hy) * t, sk.armW * 0.58, PALETTE.W_APRON, 2);
  }
  circle(ctx, hx, hy, sk.armW * 0.55, who === 'whale' ? PALETTE.W_SKIN : PALETTE.V_SKIN, 2.5); // 拳
}

/* ---------------- 角色识别（防御式） ---------------- */
function detectWho(f) {
  var keys = ['token', 'who', 'charId', 'character', 'name', 'type', 'id', 'kind'];
  var parts = [];
  for (var i = 0; i < keys.length; i++) {
    var v = f[keys[i]];
    if (v != null) parts.push(String(v));
  }
  if (f.isCPU) parts.push('cpu');
  var b = parts.join('|').toLowerCase();
  if (/whale|kujira|maid/.test(b)) return 'whale';
  if (/villain|boss|ceo|lan/.test(b)) return 'villain';
  if (/p2|enemy|cpu/.test(b)) return 'villain';
  return 'whale';
}

/* ================= 对外契约 ================= */
function drawFighter(ctx, f) {
  if (!ctx || !f) return;
  var who = detectWho(f);
  var sk = SK[who];
  var T = f.animT || 0;
  var p = poseOf(f, who, sk);

  if (!p.handF) p.handF = { x: sk.shDX + 6, y: sk.shoulderY + 36 }; // 默认垂手
  if (!p.handB) p.handB = { x: -sk.shDX + 2, y: sk.shoulderY + 38 };
  if (p.armSwing) { p.handF.x += 9 * p.armSwing; p.handB.x -= 9 * p.armSwing; }
  var dy = p.crouch + p.bob;

  ctx.save();
  ctx.translate(f.x, f.y);              // 脚底锚点
  ctx.scale(f.facing === -1 ? -1 : 1, 1); // 本地 +x = 面朝方向
  if (p.liftY) ctx.translate(0, p.liftY);
  if (p.squash !== 1) ctx.scale(2 - p.squash, p.squash);
  if (p.tilt) { ctx.translate(0, -6); ctx.rotate(p.tilt); ctx.translate(0, 6); }

  // 背景层：裂纹 / 鲸尾 / 背发
  if (p.cracks) drawCracks(ctx);
  if (who === 'whale') {
    whaleTail(ctx, T, p.lean);
    ctx.save(); ctx.translate(0, sk.headCY); whaleBackHairAt(ctx, sk.headR, T); ctx.restore();
  }

  // 上半身组：绕髋 pivot 前倾旋转 + 呼吸/蹲姿下沉
  ctx.save();
  ctx.translate(0, sk.hipY);
  ctx.rotate(p.lean);
  ctx.translate(0, -sk.hipY + dy);

  drawLeg(ctx, who, sk, -sk.legDX, p.footB, p.crouch);
  drawLeg(ctx, who, sk, sk.legDX, p.footF, p.crouch);
  drawArm(ctx, who, sk, -sk.shDX, sk.shoulderY, p.handB, p.bendB);   // 后臂
  if (who === 'whale') whaleTorso(ctx, sk, T); else villainTorso(ctx, sk);
  if (who === 'whale') whaleHeadGroup(ctx, sk, p, T); else villainHeadGroup(ctx, sk, p, T);
  drawArm(ctx, who, sk, sk.shDX, sk.shoulderY, p.handF, p.bendF);    // 前臂

  ctx.restore();

  // 前景层：冲击波 / 蓝鲸虚影 / 星粒子 / 爆发光环
  if (p.rings) drawRings(ctx, f.stateFrame || 0);
  if (p.ghost > 0.02) drawGhostWhale(ctx, p.handF.x + 14, p.handF.y + 2, p.ghost);
  if (who === 'villain') drawStars(ctx, T);
  if ((f.burstFramesLeft || 0) > 0) drawHalo(ctx, sk, T);

  ctx.restore();
}

/* ---------------- 胸像（标题 / HUD） ---------------- */
function drawBust(ctx, isV) { // 头中心为原点， caller 已 translate/scale/clip
  var R = isV ? 23 : 46;
  var p = { eyes: 'flat', mouth: 'flat', headTilt: 0 };
  var i;
  if (isV) {
    ctx.beginPath(); // 西装肩
    ctx.moveTo(-40, 92);
    ctx.quadraticCurveTo(-38, 52, -22, 44);
    ctx.lineTo(22, 44);
    ctx.quadraticCurveTo(38, 52, 40, 92);
    ctx.closePath();
    fillStroke(ctx, PALETTE.V_SUIT, 3);
    ctx.beginPath(); // 衬衫
    ctx.moveTo(-8, 46); ctx.lineTo(0, 72); ctx.lineTo(8, 46); ctx.closePath();
    fillStroke(ctx, PALETTE.V_SHIRT, 2);
    ctx.beginPath(); // 领带
    ctx.moveTo(-3.5, 47); ctx.lineTo(3.5, 47); ctx.lineTo(5, 52); ctx.lineTo(1, 78); ctx.lineTo(-4, 72);
    ctx.closePath();
    fillStroke(ctx, PALETTE.V_TIE, 2);
    rr(ctx, -4, 26, 8, 22, 3, PALETTE.V_SKIN, 2.5); // 脖子
    villainHeadAt(ctx, R, p, 0);
    for (i = 0; i < 5; i++) star4(ctx, -32 + i * 16, -22 + ((i * 23) % 42), 3 + (i % 2) * 2, i * 0.7, 0.75);
  } else {
    ctx.save(); whaleBackHairAt(ctx, R, 0); ctx.restore(); // 背发
    ctx.beginPath(); // 裙装肩
    ctx.moveTo(-44, 96);
    ctx.quadraticCurveTo(-42, 54, -24, 46);
    ctx.lineTo(24, 46);
    ctx.quadraticCurveTo(42, 54, 44, 96);
    ctx.closePath();
    fillStroke(ctx, PALETTE.W_DRESS, 3);
    rr(ctx, -20, 62, 40, 34, 8, PALETTE.W_APRON, 2.5); // 围裙上缘
    circle(ctx, 0, 44, 9, PALETTE.W_APRON, 2.5);       // 白领
    bow(ctx, 0, 58, 10, OUT);
    circle(ctx, 0, 58, 4, PALETTE.W_GEM, 2);
    circle(ctx, -1.3, 56.7, 1.3, '#FFFFFF', 0);
    rr(ctx, -4, 28, 8, 20, 3, PALETTE.W_SKIN, 2.5);    // 脖子
    whaleHeadAt(ctx, R, p, 0);
  }
}
function drawPortrait(ctx, who, x, y, size, hOpt) {
  if (!ctx || !(size > 0)) return;
  var h = (typeof hOpt === 'number' && hOpt > 0) ? hOpt : size; // 缺省正方形（兼容旧签名）
  var side = Math.min(size, h);       // 圆形裁剪取短边，水平垂直居中于 w×h 区域
  var isV = who === 'villain';
  var cx = x + size / 2, cy = y + h / 2, r = side / 2;
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); // 背景圆
  var g = ctx.createLinearGradient(x, cy - r, x, cy + r);
  if (isV) { g.addColorStop(0, '#232B45'); g.addColorStop(1, '#0D1018'); }
  else { g.addColorStop(0, '#D9E9FB'); g.addColorStop(1, '#A9C7EF'); }
  ctx.fillStyle = g; ctx.fill();
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.clip();
  ctx.translate(cx, cy + r * 0.42);
  var s = isV ? side / 95 : side / 155;
  ctx.scale(s, s);
  drawBust(ctx, isV);
  ctx.restore();
  ctx.beginPath(); // 主题描边环
  ctx.arc(cx, cy, r - 2, 0, TAU);
  ctx.lineWidth = 3; ctx.strokeStyle = isV ? PALETTE.V_TIE : PALETTE.W_BOW; ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r - 5.5, 0, TAU);
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(29,34,51,0.5)'; ctx.stroke();
  ctx.restore();
}

window.BFArt = {
  PALETTE: PALETTE,
  drawFighter: drawFighter,
  drawPortrait: drawPortrait,
  /** cut-in 用大蓝鲸虚影：签名 (ctx, x, y, scale, alpha)，内部转发到 special_dash 版本 */
  drawGhostWhale: function (ctx, x, y, scale, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale || 1, scale || 1);
    drawGhostWhale(ctx, 0, 0, alpha);
    ctx.restore();
  }
};

})();
