/* 鲸鱼快跑 —— BlueFish 接入示例（vanilla canvas，设计分辨率 960×540）
 * 可整目录复制作为新游戏起点 */
(function () {
  'use strict';

  var W = 960, H = 540;
  var PLAYER_SPEED = 300; // 玩家移速 px/s
  var PLAYER_R = 20;      // 玩家碰撞近似半径
  var MINE_R = 14;        // 水雷半径
  var RAMP_SEC = 60;      // 难度爬满（间隔/速度到上限）耗时

  var canvas = document.getElementById('game');
  BFShell.fitCanvas(canvas, W, H);
  var ctx = canvas.getContext('2d');

  var state = 'start';            // start | playing | paused | over
  var time = 0;                   // 全局动画时钟
  var elapsed = 0;                // 本局存活时长（秒，浮点）
  var score = 0;                  // 得分 = 存活整秒数
  var spawnTimer = 0;
  var bestSeen = BFShell.bestScore; // 会话内已知最高（含 hub 传入值），供结束画面显示

  var player = { x: 200, y: H / 2 };
  var mines = [];
  var bubbles = [];
  var buttons = { retry: null, exit: null };
  var keys = {};

  var bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, '#0d4f7e');
  bgGrad.addColorStop(0.55, '#073254');
  bgGrad.addColorStop(1, '#031829');

  function newBubble(anywhere) {
    return {
      x: Math.random() * W,
      y: anywhere ? Math.random() * H : H + 12,
      r: 1.5 + Math.random() * 3.5,
      v: 12 + Math.random() * 26,
      sway: Math.random() * Math.PI * 2
    };
  }
  for (var i = 0; i < 26; i++) bubbles.push(newBubble(true));

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function startGame() {
    state = 'playing';
    elapsed = 0;
    score = 0;
    spawnTimer = 0;
    mines.length = 0;
    player.x = 200;
    player.y = H / 2;
    keys = {};
  }

  function pauseGame() { if (state === 'playing') state = 'paused'; }
  function resumeGame() { if (state === 'paused') state = 'playing'; }

  function endGame() {
    state = 'over';
    bestSeen = bestSeen === null ? score : Math.max(bestSeen, score);
    BFShell.gameOver({ score: score }); // 每局结束上报一次，大厅记最高分
  }

  function update(dt) {
    elapsed += dt;
    var s = Math.floor(elapsed);
    if (s !== score) {
      score = s;
      BFShell.score(score); // 每整秒上报一次，天然满足 ≤1 次/秒
    }

    // 四向移动（限边界）
    var dx = 0, dy = 0;
    if (keys.ArrowLeft || keys.a || keys.A) dx -= 1;
    if (keys.ArrowRight || keys.d || keys.D) dx += 1;
    if (keys.ArrowUp || keys.w || keys.W) dy -= 1;
    if (keys.ArrowDown || keys.s || keys.S) dy += 1;
    if (dx !== 0 || dy !== 0) {
      var len = Math.hypot(dx, dy);
      player.x = clamp(player.x + (dx / len) * PLAYER_SPEED * dt, 40, W - 40);
      player.y = clamp(player.y + (dy / len) * PLAYER_SPEED * dt, 30, H - 30);
    }

    // 难度曲线：生成间隔 1.2s→0.45s，速度 220→520 px/s
    var t = Math.min(elapsed / RAMP_SEC, 1);
    var interval = 1.2 - (1.2 - 0.45) * t;
    var speed = 220 + (520 - 220) * t;

    spawnTimer += dt;
    if (spawnTimer >= interval) {
      spawnTimer -= interval;
      mines.push({
        x: W + MINE_R + 10,
        y: 30 + Math.random() * (H - 60),
        r: MINE_R,
        spin: Math.random() * Math.PI * 2
      });
    }

    for (var j = mines.length - 1; j >= 0; j--) {
      var m = mines[j];
      m.x -= speed * dt;
      m.spin += dt * 2;
      if (m.x < -MINE_R - 20) { mines.splice(j, 1); continue; }
      // 圆-圆近似碰撞
      if (Math.hypot(m.x - player.x, m.y - player.y) < m.r + PLAYER_R) {
        endGame();
        return;
      }
    }
  }

  function updateBubbles(dt) {
    for (var k = 0; k < bubbles.length; k++) {
      var b = bubbles[k];
      b.y -= b.v * dt;
      b.sway += dt;
      if (b.y < -12) bubbles[k] = newBubble(false);
    }
  }

  // —— 绘制 ——

  function drawBubbles() {
    ctx.fillStyle = 'rgba(190,230,255,0.28)';
    for (var i = 0; i < bubbles.length; i++) {
      var b = bubbles[i];
      ctx.beginPath();
      ctx.arc(b.x + Math.sin(b.sway * 1.4) * 6, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawWhale() {
    ctx.save();
    ctx.translate(player.x, player.y);

    // 尾鳍（摆动）
    ctx.fillStyle = '#2f8fd6';
    ctx.save();
    ctx.translate(-24, 0);
    ctx.rotate(Math.sin(time * 7) * 0.35);
    ctx.beginPath();
    ctx.moveTo(2, 0);
    ctx.quadraticCurveTo(-12, -16, -20, -10);
    ctx.quadraticCurveTo(-12, -2, -20, 8);
    ctx.quadraticCurveTo(-12, 14, 2, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 身体
    ctx.fillStyle = '#3fa9f5';
    ctx.beginPath();
    ctx.ellipse(0, 0, 30, 18, 0, 0, Math.PI * 2);
    ctx.fill();

    // 白肚
    ctx.fillStyle = '#eaf7ff';
    ctx.beginPath();
    ctx.ellipse(4, 8, 18, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // 眼睛
    ctx.fillStyle = '#0b2740';
    ctx.beginPath();
    ctx.arc(17, -4, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(18, -5, 1.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawMines() {
    for (var i = 0; i < mines.length; i++) {
      var m = mines[i];
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(m.spin);
      ctx.strokeStyle = '#5a6b78';
      ctx.lineWidth = 3;
      for (var k = 0; k < 8; k++) {
        var a = (k / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * m.r * 0.7, Math.sin(a) * m.r * 0.7);
        ctx.lineTo(Math.cos(a) * (m.r + 6), Math.sin(a) * (m.r + 6));
        ctx.stroke();
      }
      ctx.fillStyle = '#2b3642';
      ctx.beginPath();
      ctx.arc(0, 0, m.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.arc(-m.r * 0.3, -m.r * 0.3, m.r * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawHud() {
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText('分数 ' + score, W - 20, 16);
    ctx.textAlign = 'left';
  }

  function drawStart() {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#eaf7ff';
    ctx.font = 'bold 52px sans-serif';
    ctx.fillText('鲸鱼快跑', W / 2, H / 2 - 70);
    ctx.font = '20px sans-serif';
    ctx.fillStyle = '#9fd0f5';
    if (BFShell.bestScore !== null) {
      ctx.fillText('历史最高：' + BFShell.bestScore + ' 分', W / 2, H / 2 - 18);
      ctx.fillText('点击或按任意键开始', W / 2, H / 2 + 24);
    } else {
      ctx.fillText('点击或按任意键开始', W / 2, H / 2 - 18);
    }
    ctx.textAlign = 'left';
  }

  function drawPauseOverlay() {
    ctx.fillStyle = 'rgba(3,16,30,0.62)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#eaf7ff';
    ctx.font = 'bold 34px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('已暂停 - 按 P 继续', W / 2, H / 2);
    ctx.textAlign = 'left';
  }

  var BTN_W = 150, BTN_H = 48;

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawButton(x, y, label) {
    var r = { x: x, y: y, w: BTN_W, h: BTN_H };
    ctx.fillStyle = '#1e6fb8';
    roundRect(r.x, r.y, r.w, r.h, 10);
    ctx.fill();
    ctx.fillStyle = '#eaf6ff';
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2);
    return r;
  }

  function hit(r, x, y) {
    return !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  function drawOver() {
    ctx.fillStyle = 'rgba(3,16,30,0.66)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#eaf7ff';
    ctx.font = 'bold 40px sans-serif';
    ctx.fillText('游戏结束', W / 2, H / 2 - 90);
    ctx.font = '22px sans-serif';
    ctx.fillText('本局得分：' + score + ' 分', W / 2, H / 2 - 38);
    if (bestSeen !== null) ctx.fillText('历史最高：' + bestSeen + ' 分', W / 2, H / 2 - 4);

    if (BFShell.inHub) {
      buttons.retry = drawButton(W / 2 - BTN_W - 10, H / 2 + 50, '再来一局');
      buttons.exit = drawButton(W / 2 + 10, H / 2 + 50, '返回大厅');
    } else {
      buttons.exit = null; // 独立运行无大厅可返，隐藏该按钮
      buttons.retry = drawButton(W / 2 - BTN_W / 2, H / 2 + 50, '再来一局');
    }
    ctx.textAlign = 'left';
  }

  function draw() {
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);
    drawBubbles();
    if (state === 'start') { drawStart(); return; }
    drawMines();
    drawWhale();
    if (state !== 'over') drawHud();
    if (state === 'paused') drawPauseOverlay();
    if (state === 'over') drawOver();
  }

  // —— 输入 ——

  var MOVE_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '];

  window.addEventListener('keydown', function (e) {
    if (state === 'start') { startGame(); return; } // 开始画面：任意键开局
    if (state !== 'playing' && state !== 'paused') return;
    if (e.key === 'p' || e.key === 'P') {
      if (state === 'playing') pauseGame();
      else resumeGame();
      return;
    }
    keys[e.key] = true;
    if (MOVE_KEYS.indexOf(e.key) >= 0) e.preventDefault();
  });
  window.addEventListener('keyup', function (e) { keys[e.key] = false; });

  canvas.addEventListener('click', function (e) {
    var rect = canvas.getBoundingClientRect();
    var x = (e.clientX - rect.left) * (W / rect.width);
    var y = (e.clientY - rect.top) * (H / rect.height);
    if (state === 'start') { startGame(); return; }
    if (state !== 'over') return;
    if (hit(buttons.retry, x, y)) startGame();
    else if (hit(buttons.exit, x, y)) BFShell.exit();
  });

  // —— 壳回调与启动 ——

  BFShell.onPause(pauseGame);
  BFShell.onResume(resumeGame);
  BFShell.ready(); // 加载完成，通知大厅可交互

  var last = performance.now();
  function loop(now) {
    var dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    time += dt;
    if (state === 'playing') update(dt);
    updateBubbles(dt);
    draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
