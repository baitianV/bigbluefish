/* BlueFish 游戏壳：game↔hub postMessage 通信封装（无依赖，IIFE 挂 window.BFShell）
 * 信封 { src, type, ... }；game→hub: ready / score / gameover / exit；hub→game: pause / resume */
(function (window, document) {
  'use strict';

  var HUB_SRC = 'bf-hub';
  var GAME_SRC = 'bf-game';

  var pauseCbs = [];
  var resumeCbs = [];

  function inHub() { return window.parent !== window; }

  function post(type, extra) {
    if (!inHub()) return; // 非 iframe 独立运行：安全 no-op
    var msg = Object.assign({ src: GAME_SRC, type: type }, extra || {});
    window.parent.postMessage(msg, '*');
  }

  function fire(cbs) {
    for (var i = 0; i < cbs.length; i++) {
      try { cbs[i](); } catch (e) { /* 单个回调异常不阻断其余回调 */ }
    }
  }

  window.addEventListener('message', function (ev) {
    var d = ev.data;
    if (!d || typeof d !== 'object' || d.src !== HUB_SRC) return;
    if (d.type === 'pause') fire(pauseCbs);
    else if (d.type === 'resume') fire(resumeCbs);
  });

  // 页面隐藏自动触发暂停回调；恢复可见不自动 resume，由 hub 或游戏自身决定
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) fire(pauseCbs);
  });

  window.BFShell = {
    inHub: inHub(),

    ready: function () { post('ready'); },

    score: function (n) {
      if (typeof n !== 'number' || !isFinite(n)) return;
      post('score', { score: n });
    },

    gameOver: function (result) {
      result = result || {};
      var extra = { score: typeof result.score === 'number' ? result.score : 0 };
      if (typeof result.win === 'boolean') extra.win = result.win;
      post('gameover', extra);
    },

    exit: function () { post('exit'); },

    onPause: function (cb) { if (typeof cb === 'function') pauseCbs.push(cb); },
    onResume: function (cb) { if (typeof cb === 'function') resumeCbs.push(cb); },

    bestScore: (function () {
      var v = new URLSearchParams(window.location.search).get('best');
      if (v === null) return null;
      var n = Number(v);
      return Number.isFinite(n) ? n : null;
    })(),

    // 画布固定为设计分辨率，CSS 尺寸等比缩放填满窗口（letterbox 居中），随 resize 自适应
    fitCanvas: function (canvas, w, h) {
      canvas.width = w;
      canvas.height = h;
      canvas.style.position = 'absolute';
      canvas.style.left = '50%';
      canvas.style.top = '50%';
      canvas.style.transform = 'translate(-50%, -50%)';
      function resize() {
        var s = Math.min(window.innerWidth / w, window.innerHeight / h);
        if (!isFinite(s) || s <= 0) s = 1;
        canvas.style.width = Math.floor(w * s) + 'px';
        canvas.style.height = Math.floor(h * s) + 'px';
      }
      window.addEventListener('resize', resize);
      resize();
    }
  };
})(window, document);
