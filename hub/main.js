/* 鲸鱼娘游戏厅 大厅逻辑：清单加载、卡片网格、游戏模态与 postMessage 通信 */
(function () {
  'use strict';

  var TYPE_NAMES = { fighting: '格斗', platform: '闯关', td: '塔防', runner: '跑酷', sim: '模拟经营', gal: '视觉小说', other: '其他' };

  var grid = document.getElementById('game-grid');
  var errorBox = document.getElementById('hub-error');
  var modal = document.getElementById('game-modal');
  var modalTitle = document.getElementById('modal-title');
  var hudScore = document.getElementById('modal-score');
  var bestToast = document.getElementById('best-toast');
  var btnPause = document.getElementById('btn-pause');
  var btnClose = document.getElementById('btn-close');
  var iframeBox = document.getElementById('iframe-box');

  var cardBestEls = {}; // id → 卡片"历史最高"元素，破纪录后刷新
  var active = null;    // { def, iframe, paused }
  var toastTimer = null;

  function bestKey(id) { return 'bf-best-' + id; }

  function getBest(id) {
    try {
      var v = localStorage.getItem(bestKey(id));
      if (v === null) return null;
      var n = Number(v);
      return Number.isFinite(n) ? n : null;
    } catch (e) { return null; }
  }

  function setBest(id, n) {
    try { localStorage.setItem(bestKey(id), String(n)); } catch (e) { /* 存储不可用时忽略 */ }
  }

  function typeName(t) { return TYPE_NAMES[t] || TYPE_NAMES.other; }

  function showFatal(msg) {
    errorBox.hidden = false;
    errorBox.textContent = msg;
  }

  function makeBadge(type, corner) {
    var b = document.createElement('span');
    b.className = 'type-badge type-' + (type || 'other') + (corner ? ' badge-corner' : '');
    b.textContent = typeName(type);
    return b;
  }

  function makePlaceholder(def) {
    var ph = document.createElement('div');
    ph.className = 'thumb-placeholder';
    ph.textContent = '🐋';
    ph.appendChild(makeBadge(def.type, true));
    return ph;
  }

  function refreshBestText(id) {
    var el = cardBestEls[id];
    if (!el) return;
    var b = getBest(id);
    el.textContent = '历史最高：' + (b === null ? '—' : b + ' 分');
  }

  function renderCard(def) {
    var card = document.createElement('article');
    card.className = 'card';

    var thumb = document.createElement('div');
    thumb.className = 'card-thumb';
    if (def.thumb) {
      var img = document.createElement('img');
      img.src = def.thumb;
      img.alt = def.title || '';
      img.onerror = function () {
        if (img.parentNode === thumb) thumb.replaceChild(makePlaceholder(def), img);
      };
      thumb.appendChild(img);
    } else {
      thumb.appendChild(makePlaceholder(def));
    }
    card.appendChild(thumb);

    var body = document.createElement('div');
    body.className = 'card-body';

    var top = document.createElement('div');
    top.className = 'card-top';
    var title = document.createElement('h2');
    title.className = 'card-title';
    title.textContent = def.title || def.id;
    top.appendChild(title);
    top.appendChild(makeBadge(def.type, false));
    body.appendChild(top);

    var author = document.createElement('p');
    author.className = 'card-author';
    author.textContent = '作者：' + (def.author || '未知');
    body.appendChild(author);

    var desc = document.createElement('p');
    desc.className = 'card-desc';
    desc.textContent = def.description || '';
    body.appendChild(desc);

    var bestEl = document.createElement('p');
    bestEl.className = 'card-best';
    body.appendChild(bestEl);
    card.appendChild(body);
    cardBestEls[def.id] = bestEl;
    refreshBestText(def.id);

    card.addEventListener('click', function () { openGame(def); });
    return card;
  }

  function parseAspect(a) {
    var m = typeof a === 'string' ? a.match(/^(\d+)\s*:\s*(\d+)$/) : null;
    return (m && Number(m[2]) > 0) ? Number(m[1]) / Number(m[2]) : 16 / 9;
  }

  function openGame(def) {
    if (active) closeModal();
    var b = getBest(def.id);
    var sep = String(def.entry).indexOf('?') >= 0 ? '&' : '?';
    var iframe = document.createElement('iframe');
    iframe.src = def.entry + sep + 'best=' + (b === null ? 0 : b);
    iframe.allow = 'gamepad *; fullscreen *; pointer-lock *';
    iframe.title = def.title || def.id;
    iframeBox.appendChild(iframe);
    var fs = !!def.fullscreen;
    active = { def: def, iframe: iframe, paused: false, fs: fs };

    modalTitle.textContent = def.title || def.id;
    hudScore.textContent = '—';
    btnPause.textContent = '暂停';
    modal.classList.toggle('fs-mode', fs);
    modal.hidden = false;
    if (fs) {
      // 全屏接管：iframe 铺满视口，仅留退出键；顺手请求原生全屏，不支持的浏览器保持 CSS 铺满
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      try {
        var p = modal.requestFullscreen && modal.requestFullscreen();
        if (p && p.catch) p.catch(function () {});
      } catch (e) { /* 保持 CSS 全屏 */ }
    } else {
      sizeIframe();
    }
  }

  // 按游戏 aspect 计算最大等比尺寸，letterbox 居中
  function sizeIframe() {
    if (!active || active.fs) return;
    var ar = parseAspect(active.def.aspect);
    var rect = iframeBox.getBoundingClientRect();
    var w = rect.width;
    var h = w / ar;
    if (h > rect.height) { h = rect.height; w = h * ar; }
    active.iframe.style.width = Math.max(0, Math.floor(w)) + 'px';
    active.iframe.style.height = Math.max(0, Math.floor(h)) + 'px';
  }
  window.addEventListener('resize', sizeIframe);

  function postToGame(type) {
    if (!active) return;
    active.iframe.contentWindow.postMessage({ src: 'bf-hub', type: type }, '*');
  }

  function setPausedUI(paused) {
    active.paused = paused;
    btnPause.textContent = paused ? '继续' : '暂停';
  }

  btnPause.addEventListener('click', function () {
    if (!active) return;
    if (active.paused) { postToGame('resume'); setPausedUI(false); }
    else { postToGame('pause'); setPausedUI(true); }
  });

  function closeModal() {
    if (!active) return;
    postToGame('pause'); // 关模态前先暂停游戏
    var def = active.def;
    var iframe = active.iframe;
    active = null;
    iframe.remove();     // 再移除 iframe
    modal.hidden = true;
    modal.classList.remove('fs-mode');
    if (document.fullscreenElement && document.exitFullscreen) {
      var q = document.exitFullscreen();
      if (q && q.catch) q.catch(function () {});
    }
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
    bestToast.hidden = true;
    refreshBestText(def.id);
  }
  btnClose.addEventListener('click', closeModal);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && active) closeModal();
  });

  // 原生全屏被退出（Esc/F11）时，全屏接管的游戏一并关闭，回到大厅
  document.addEventListener('fullscreenchange', function () {
    if (!document.fullscreenElement && active && active.fs) closeModal();
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && active && !active.paused) {
      postToGame('pause');
      setPausedUI(true);
    }
  });

  window.addEventListener('message', function (ev) {
    if (!active || ev.source !== active.iframe.contentWindow) return;
    var d = ev.data;
    if (!d || typeof d !== 'object' || d.src !== 'bf-game') return;
    switch (d.type) {
      case 'ready':
        hudScore.textContent = '0';
        break;
      case 'score':
        if (typeof d.score === 'number') hudScore.textContent = String(d.score);
        break;
      case 'gameover': {
        var n = typeof d.score === 'number' ? d.score : 0;
        var b = getBest(active.def.id);
        if (b === null || n > b) {
          setBest(active.def.id, n);
          showToast('🎉 新纪录：' + n + ' 分');
        }
        hudScore.textContent = '最终 ' + n + ' 分';
        break;
      }
      case 'exit':
        closeModal();
        break;
    }
  });

  function showToast(text) {
    bestToast.textContent = text;
    bestToast.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      bestToast.hidden = true;
      toastTimer = null;
    }, 3000);
  }

  fetch('games.json')
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (list) {
      if (!Array.isArray(list)) throw new Error('清单格式错误');
      list.slice()
        .sort(function (a, b) { return (Number(a.order) || 0) - (Number(b.order) || 0); })
        .forEach(function (def) { grid.appendChild(renderCard(def)); });
    })
    .catch(function () {
      showFatal('游戏清单（games.json）加载失败。请通过本地 HTTP 服务器访问本页（例如：python -m http.server 8123），不要直接双击文件打开。');
    });
})();
