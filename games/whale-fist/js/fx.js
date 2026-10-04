/* 杀鲸霸拳 · FX：命中停顿 / 震屏 / 粒子 / 飘字 / 横幅 / 白闪
 * 粒子用固定数组对象池（round-robin 复用），稳态零分配，每局 reset。 */
(function (w) {
  'use strict';
  var CFG = w.BFD.fx;

  function FX() {
    this.pool = [];
    for (var i = 0; i < CFG.pool; i++) {
      this.pool.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 2, color: '#fff' });
    }
    this.cursor = 0;
    this.texts = [];
    this.bannerObj = null;
    this.hitstopF = 0;
    this.shakeMag = 0;
    this.flashA = 0;
  }

  var P = FX.prototype;

  P.hitstop = function (f) { if (f > this.hitstopF) this.hitstopF = f; };
  P.shake = function (m) { if (m > this.shakeMag) this.shakeMag = m; };
  P.flash = function (a) { if (a > this.flashA) this.flashA = a; };

  P.spark = function (x, y, n, color) {
    for (var i = 0; i < n; i++) {
      var p = this.pool[this.cursor];
      this.cursor = (this.cursor + 1) % this.pool.length;
      var ang = Math.random() * Math.PI * 2;
      var sp = 2 + Math.random() * 5;
      p.active = true;
      p.x = x; p.y = y;
      p.vx = Math.cos(ang) * sp;
      p.vy = Math.sin(ang) * sp - 1.5;
      p.maxLife = p.life = CFG.particleLifeMin + ((Math.random() * (CFG.particleLifeMax - CFG.particleLifeMin)) | 0);
      p.size = 2 + Math.random() * 3;
      p.color = color || '#fff';
    }
  };

  P.floatText = function (x, y, text, color) {
    this.texts.push({ x: x, y: y, text: text, color: color || '#fff', life: CFG.textLife, maxLife: CFG.textLife });
  };

  P.banner = function (text, sub, frames) {
    this.bannerObj = { text: text, sub: sub || '', frames: frames, total: frames };
  };

  P.update = function () {
    // 冻结期间本函数仍被主循环调用（FX 不受 hitstop 影响）
    if (this.hitstopF > 0) this.hitstopF--;
    this.shakeMag *= CFG.shakeDecay;
    if (this.shakeMag < 0.3) this.shakeMag = 0;
    this.flashA *= CFG.flashDecay;
    if (this.flashA < 0.02) this.flashA = 0;
    var i, p;
    for (i = 0; i < this.pool.length; i++) {
      p = this.pool[i];
      if (!p.active) continue;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += CFG.particleGravity;
      if (--p.life <= 0) p.active = false;
    }
    for (i = this.texts.length - 1; i >= 0; i--) {
      var t = this.texts[i];
      t.y -= CFG.textRise;
      if (--t.life <= 0) this.texts.splice(i, 1);
    }
    if (this.bannerObj && --this.bannerObj.frames <= 0) this.bannerObj = null;
  };

  P.render = function (ctx) {
    var W = w.BFD.stage.width;
    var H = w.BFD.stage.height;
    var i, p, t;
    // 粒子
    ctx.fillStyle = '#fff';
    for (i = 0; i < this.pool.length; i++) {
      p = this.pool[i];
      if (!p.active) continue;
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    // 飘字
    ctx.textAlign = 'center';
    for (i = 0; i < this.texts.length; i++) {
      t = this.texts[i];
      ctx.globalAlpha = Math.min(1, t.life / (t.maxLife * 0.5));
      ctx.font = 'bold 18px sans-serif';
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 3;
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;
    // 横幅（ROUND n / K.O. / TIME UP / DRAW）
    var b = this.bannerObj;
    if (b) {
      var el = b.total - b.frames;
      var a = el < 8 ? el / 8 : (b.frames < 20 ? b.frames / 20 : 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(4,10,24,0.72)';
      ctx.fillRect(0, 288, W, 136);
      ctx.font = 'bold 64px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.fillText(b.text, W / 2, 366);
      if (b.sub) {
        ctx.font = '22px sans-serif';
        ctx.fillStyle = '#8fd8ff';
        ctx.fillText(b.sub, W / 2, 404);
      }
      ctx.globalAlpha = 1;
    }
    // 白闪
    if (this.flashA > 0) {
      ctx.globalAlpha = this.flashA;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  };

  P.reset = function () {
    for (var i = 0; i < this.pool.length; i++) this.pool[i].active = false;
    this.texts.length = 0;
    this.bannerObj = null;
    this.hitstopF = 0;
    this.shakeMag = 0;
    this.flashA = 0;
  };

  w.FX = new FX();
})(window);
