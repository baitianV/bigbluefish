/* 杀鲸霸拳 · 主循环：场景状态机 / 输入 / 占位 AI / HUD / 灰盒渲染 / BFShell 集成
 * art.js / audio.js 由并行卡提供，所有调用走运行时守卫（缺文件时灰盒兜底/静默）。 */
(function () {
  'use strict';
  var D = window.BFD;
  var W = D.stage.width;
  var H = D.stage.height;
  var G = D.stage.groundY;

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  if (window.BFShell && BFShell.fitCanvas) BFShell.fitCanvas(canvas, W, H);

  var debug = /(?:\?|&)debug=1/.test(window.location.search);

  /* ================= 场景状态 ================= */
  var scene = 'TITLE';   // TITLE | FIGHT | MATCHEND
  var paused = false;
  var titleT = 0;
  var bgFrame = 0;
  var p1 = new Fighter({ id: 'whale', name: '鲸鱼娘', x: 400, facing: 1, isCPU: false });
  var p2 = new Fighter({ id: 'villain', name: '蓝总', x: 880, facing: -1, isCPU: true });
  var match = null;      // { round, wins1, wins2, score, sub, subT, frames, tutorialT, koWinner, lastDraw, disp1, disp2 }
  var matchEnd = null;   // { score, win, best, t }
  var transSeen = {};    // 状态迁移音效去重

  /* ================= 协议 / 外设守卫 ================= */
  function sfx(name) {
    if (window.BFAudio && BFAudio.ready && typeof BFAudio.play === 'function') {
      try { BFAudio.play(name); } catch (e) { /* 音效失败不影响游戏 */ }
    }
  }
  function shellScore(n) {
    if (window.BFShell && typeof BFShell.score === 'function') { try { BFShell.score(n); } catch (e) {} }
  }
  function shellGameOver(score, win) {
    if (window.BFShell && typeof BFShell.gameOver === 'function') { try { BFShell.gameOver({ score: score, win: win }); } catch (e) {} }
  }
  function shellExit() {
    if (window.BFShell && typeof BFShell.exit === 'function') { try { BFShell.exit(); } catch (e) {} }
  }

  /* ================= 输入 ================= */
  var KEYMAP = { KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down', KeyJ: 'light', KeyK: 'heavy',
                 KeyI: 'burst', KeyU: 'special', KeyP: 'pause', KeyM: 'mute', Enter: 'start', Escape: 'esc' };
  var PREVENT = { left: 1, right: 1, up: 1, down: 1, light: 1, heavy: 1, burst: 1, special: 1, pause: 1, mute: 1, start: 1, esc: 1 };
  var held = {};
  var pressed = {};
  var audioInited = false;

  function initAudioOnce() {
    if (audioInited) return;
    audioInited = true;
    if (window.BFAudio && typeof BFAudio.init === 'function') { try { BFAudio.init(); } catch (e) {} }
  }

  window.addEventListener('keydown', function (e) {
    var k = KEYMAP[e.code];
    if (!k) return;
    if ((scene === 'FIGHT' || scene === 'MATCHEND') && PREVENT[k]) e.preventDefault();
    if (!e.repeat) pressed[k] = true;
    held[k] = true;
    initAudioOnce(); // 首次用户交互后再出声（浏览器自动播放限制）
  });
  window.addEventListener('keyup', function (e) {
    var k = KEYMAP[e.code];
    if (k) held[k] = false;
  });
  // 独立运行时的失焦暂停双保险（iframe 场景 shell 已处理，回调多注册安全）
  window.addEventListener('blur', function () {
    if (scene === 'FIGHT' && !paused) paused = true;
  });
  if (window.BFShell) {
    BFShell.onPause(function () { if (scene === 'FIGHT') paused = true; });
    BFShell.onResume(function () { if (scene === 'FIGHT') paused = false; });
  }

  function blankInput() {
    return {
      held: { left: false, right: false, up: false, down: false, light: false, heavy: false, burst: false, special: false },
      pressed: { left: false, right: false, up: false, down: false, light: false, heavy: false, burst: false, special: false }
    };
  }
  var EMPTY_INPUT = blankInput();
  var plInp = blankInput();
  var aiInp = blankInput();

  function playerInput() {
    var h = plInp.held, pr = plInp.pressed, keys = ['left', 'right', 'up', 'down', 'light', 'heavy', 'burst', 'special'];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      h[k] = !!held[k];
      pr[k] = !!pressed[k];
    }
    return plInp;
  }

  /* ================= 占位 AI（正式 AI 由后续卡替换，R2 参数） ================= */
  var ai = { t: 0, dir: 0, blockT: 0, act: null };

  function aiBlockRate(lowHp) {
    return D.ai.blockRate + (lowHp ? D.ai.blockLowHpBonus : 0);
  }

  function aiInput(me, opp) {
    var inp = aiInp;
    var keys = ['left', 'right', 'up', 'down', 'light', 'heavy', 'burst', 'special'];
    var i;
    for (i = 0; i < keys.length; i++) { inp.held[keys[i]] = false; inp.pressed[keys[i]] = false; }
    var P = D.ai;
    var dx = opp.x - me.x;
    var adx = Math.abs(dx);
    var towards = dx > 0 ? 'right' : 'left';
    var away = dx > 0 ? 'left' : 'right';

    if (--ai.t <= 0) {
      ai.t = P.decideMin + ((Math.random() * (P.decideMax - P.decideMin)) | 0);
      ai.dir = 0;
      ai.blockT = 0;
      ai.act = null;
      var lowHp = me.hp < me.maxHp * P.lowHpRatio;
      var r = Math.random();
      var br = aiBlockRate(lowHp);
      if (adx <= P.attackRange) {
        if (r < P.aggression) ai.act = Math.random() < 0.6 ? 'light' : 'heavy';
        else if (r < P.aggression + br) ai.blockT = P.blockTimeMin + ((Math.random() * (P.blockTimeMax - P.blockTimeMin)) | 0);
        else ai.dir = away === 'left' ? -1 : 1;
      } else {
        if (r < P.jumpChance) { inp.pressed.up = true; ai.dir = towards === 'left' ? -1 : 1; }
        else if (r < P.jumpChance + br) ai.blockT = P.blockTimeMin + ((Math.random() * (P.blockTimeMax - P.blockTimeMin)) | 0);
        else ai.dir = towards === 'left' ? -1 : 1;
      }
    }
    if (ai.blockT > 0) { ai.blockT--; inp.held.down = true; }
    else if (ai.dir !== 0) inp.held[ai.dir < 0 ? 'left' : 'right'] = true;
    if (ai.act) { inp.pressed[ai.act] = true; ai.act = null; }
    return inp;
  }

  /* ================= 对局 / 回合流程 ================= */
  function newMatch() {
    match = { round: 0, wins1: 0, wins2: 0, score: 0, sub: 'intro', subT: 0, frames: D.round.frames,
              tutorialT: 0, koWinner: null, lastDraw: false, disp1: D.fighter.hp, disp2: D.fighter.hp };
    startRound(true);
  }

  function startRound(advance) {
    if (advance) match.round++;
    p1.resetRound(400, 1);
    p2.resetRound(880, -1);
    FX.reset();
    match.sub = 'intro';
    match.subT = D.round.bannerFrames;
    match.frames = D.round.frames;
    match.koWinner = null;
    match.lastDraw = false;
    match.disp1 = p1.maxHp;
    match.disp2 = p2.maxHp;
    FX.banner('ROUND ' + match.round, '', D.round.bannerFrames);
    sfx('round_start');
  }

  function snapDown(f) {
    f.y = G;
    f.vy = 0;
    f.vx = 0;
    f.onGround = true;
  }

  function timeUp() {
    var w = null;
    if (p1.hp > p2.hp) w = p1;
    else if (p2.hp > p1.hp) w = p2;
    if (w) {
      FX.banner('TIME UP', '', D.round.endGap);
      match.koWinner = w;
    } else {
      FX.banner('DRAW', '平局 · 重赛', D.round.endGap);
      match.koWinner = null;
    }
    endRound();
  }

  function endRound() {
    var w = match.koWinner;
    if (w) {
      if (w === p1) match.wins1++; else match.wins2++;
      match.score += 1000 + Math.max(0, Math.round(w.hp)); // 胜场×1000 + 获胜回合剩余 HP
      var l = w === p1 ? p2 : p1;
      snapDown(w);
      snapDown(l);
      w.setState('victory');
      l.setState('ko');
      sfx('round_win');
    } else {
      // 双 KO / 平局：无胜点，重赛
      snapDown(p1);
      snapDown(p2);
      p1.setState('ko');
      p2.setState('ko');
      match.lastDraw = true;
    }
    shellScore(match.score);
    match.sub = 'end';
    match.subT = D.round.endGap;
  }

  function afterRound() {
    if (match.wins1 >= D.round.winsNeeded || match.wins2 >= D.round.winsNeeded) endMatch();
    else startRound(!match.lastDraw);
  }

  function endMatch() {
    matchEnd = {
      score: match.score,
      win: match.wins1 >= D.round.winsNeeded,
      best: (window.BFShell && typeof BFShell.bestScore === 'number') ? BFShell.bestScore : null,
      t: 0
    };
    scene = 'MATCHEND';
    shellGameOver(matchEnd.score, matchEnd.win);
    sfx(matchEnd.win ? 'win' : 'lose');
  }

  function startGame() {
    scene = 'FIGHT';
    paused = false;
    newMatch();
  }

  function quitToHub() {
    if (window.BFShell && BFShell.inHub) shellExit();
    else { scene = 'TITLE'; paused = false; }
  }

  /* ================= 战斗帧逻辑 ================= */
  function onCombatEvent(ev) {
    if (ev.type === 'hit') {
      FX.hitstop(D.fx.hitstop[ev.move]);
      FX.shake(D.fx.shake[ev.move]);
      FX.spark(ev.x, ev.y, D.fx.sparks[ev.move], D.fx.colors[ev.move]);
      FX.floatText(ev.x, ev.y - 30, String(ev.dmg), D.fx.colors.dmg);
      if (ev.move === 'special') FX.flash(D.fx.flash.special);
      sfx('hit_' + ev.move);
    } else {
      FX.hitstop(D.fx.hitstop.block);
      FX.shake(D.fx.shake.block);
      FX.spark(ev.x, ev.y, D.fx.sparks.block, D.fx.colors.block);
      FX.floatText(ev.x, ev.y - 30, 'GUARD', D.fx.colors.block);
      sfx('blocked');
    }
  }

  function trackTrans(f) {
    var prev = transSeen[f.id];
    if (prev === f.state) return;
    transSeen[f.id] = f.state;
    if (f.state === 'jump') sfx('jump');
    else if (f.state === 'special_startup') sfx('special_charge');
    else if (f.state === 'special_dash') sfx('special_dash');
    else if (f.state === 'burst_flare') sfx('burst');
  }

  function tickCombat() {
    if (FX.hitstopF > 0) return; // 命中停顿：冻结斗者与计时（FX 照常更新）
    if (--match.frames <= 0) { timeUp(); return; }
    if (match.tutorialT > 0) match.tutorialT--;

    p1.update(playerInput(), p2);
    p2.update(aiInput(p2, p1), p1);
    trackTrans(p1);
    trackTrans(p2);

    var evs = Fighter.resolveCombat(p1, p2).concat(Fighter.resolveCombat(p2, p1));
    Fighter.resolveBodies(p1, p2);
    for (var i = 0; i < evs.length; i++) onCombatEvent(evs[i]);

    // 挥空音效：进入收招且未命中
    if (p1.moveKey && p1.attackPhase === 'recovery' && !p1.hasHit && !p1.whiffPlayed) { p1.whiffPlayed = true; sfx('whiff'); }
    if (p2.moveKey && p2.attackPhase === 'recovery' && !p2.hasHit && !p2.whiffPlayed) { p2.whiffPlayed = true; sfx('whiff'); }

    // KO 检测：致死者落地躺倒 → KO 定格 → 回合结束
    var d1 = p1.dead && p1.onGround;
    var d2 = p2.dead && p2.onGround;
    if (d1 || d2) {
      match.sub = 'ko';
      match.subT = D.round.koFreeze;
      match.koWinner = (d1 && d2) ? null : (d1 ? p2 : p1);
      if (match.koWinner) FX.banner('K.O.', '', D.round.koFreeze + D.round.endGap);
      else FX.banner('DOUBLE K.O.', '平局 · 重赛', D.round.koFreeze + D.round.endGap);
      FX.flash(D.fx.flash.ko);
      FX.shake(D.fx.shake.ko);
      sfx('ko');
    }
  }

  function idleUpdate() {
    // KO 定格 / 回合收尾：双斗者空输入跑物理（倒地、粒子沉降）
    p1.update(EMPTY_INPUT, p2);
    p2.update(EMPTY_INPUT, p1);
    Fighter.resolveBodies(p1, p2);
  }

  function tickFight() {
    if (paused) {
      if (pressed.pause) { paused = false; sfx('ui'); }
      else if (pressed.esc) quitToHub();
      return;
    }
    if (pressed.pause || pressed.esc) { paused = true; sfx('ui'); return; }

    switch (match.sub) {
      case 'intro':
        if (--match.subT <= 0) {
          match.sub = 'fight';
          p1.setState('idle');
          p2.setState('idle');
          if (match.round === 1) match.tutorialT = D.round.introTutorialFrames;
        }
        break;
      case 'fight':
        tickCombat();
        break;
      case 'ko':
        idleUpdate();
        if (--match.subT <= 0) endRound();
        break;
      case 'end':
        idleUpdate();
        if (--match.subT <= 0) afterRound();
        break;
    }
    FX.update();
  }

  /* ================= 每帧分发 ================= */
  function tick() {
    if (pressed.mute && window.BFAudio && typeof BFAudio.toggleMute === 'function') {
      try { BFAudio.toggleMute(); } catch (e) {}
    }
    if (scene === 'TITLE') {
      titleT++;
      if (pressed.light || pressed.start) { sfx('ui'); startGame(); }
    } else if (scene === 'FIGHT') {
      tickFight();
    } else {
      matchEnd.t++;
      if (pressed.light || pressed.start) { sfx('ui'); startGame(); }
      else if (pressed.esc) quitToHub();
    }
    for (var k in pressed) pressed[k] = false; // 每帧末清空当帧按下
  }

  /* ================= 渲染 ================= */
  function rr(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  var bgGrad = null;
  function drawBackground() {
    bgFrame++;
    if (!bgGrad) {
      bgGrad = ctx.createLinearGradient(0, 0, 0, H);
      bgGrad.addColorStop(0, '#0d2f5c');
      bgGrad.addColorStop(0.55, '#0a1f42');
      bgGrad.addColorStop(1, '#050f22');
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);
    // 深海光柱
    ctx.fillStyle = 'rgba(140,210,255,0.05)';
    for (var i = 0; i < 4; i++) {
      var bx = 140 + i * 300 + Math.sin(bgFrame * 0.008 + i * 1.7) * 40;
      ctx.beginPath();
      ctx.moveTo(bx, 0);
      ctx.lineTo(bx + 70, 0);
      ctx.lineTo(bx + 170, G);
      ctx.lineTo(bx + 40, G);
      ctx.closePath();
      ctx.fill();
    }
    // 地面
    ctx.fillStyle = '#04101f';
    ctx.fillRect(0, G, W, H - G);
    ctx.strokeStyle = 'rgba(90,190,255,0.5)';
    ctx.beginPath();
    ctx.moveTo(0, G + 0.5);
    ctx.lineTo(W, G + 0.5);
    ctx.stroke();
    // 边墙立柱
    ctx.fillStyle = 'rgba(90,190,255,0.16)';
    ctx.fillRect(D.stage.wallL - 10, G - 130, 10, 130);
    ctx.fillRect(D.stage.wallR, G - 130, 10, 130);
  }

  /* ---------- 角色绘制（BFArt 优先，缺省灰盒兜底） ---------- */
  function drawFighterArt(f) {
    if (window.BFArt && typeof BFArt.drawFighter === 'function') {
      try { BFArt.drawFighter(ctx, f, D); return; } catch (e) { /* 签名不符时落回灰盒 */ }
    }
    drawFighterGray(f);
  }

  function drawName(f, ty) {
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = D.ui.colors.dim;
    ctx.fillText(f.name, f.x, ty);
  }

  function drawShadow(f) {
    var a = Math.max(0.12, 0.35 - (G - f.y) / 900);
    ctx.fillStyle = 'rgba(0,0,0,' + a.toFixed(3) + ')';
    ctx.beginPath();
    ctx.ellipse(f.x, G + 8, 38, 8, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawFighterGray(f) {
    var C = D.ui.colors;
    var F = D.fighter;
    var x = f.x;
    var y = f.y;
    var bodyCol = f.id === 'whale' ? C.whaleBody : C.villainBody;

    // 躺地（knockdown / ko）
    if (f.state === 'knockdown' || f.state === 'ko') {
      ctx.fillStyle = bodyCol;
      rr(x - 92, y - 52, 184, 52, 26);
      ctx.fill();
      if (f.flashT > 0) {
        ctx.globalAlpha = 0.5 * (f.flashT / 2);
        ctx.fillStyle = '#fff';
        rr(x - 92, y - 52, 184, 52, 26);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      drawName(f, y - F.hurtH - 6);
      return;
    }

    var top = y - F.hurtH;
    // 爆气光环
    if (f.burstFramesLeft > 0) {
      ctx.strokeStyle = 'rgba(90,208,255,' + (0.5 + 0.3 * Math.sin(f.animT * 0.3)).toFixed(3) + ')';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y - F.hurtH / 2, 62 + Math.sin(f.animT * 0.5) * 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 2;
    }
    // 鲸鱼娘：裙后三角尾鳍
    if (f.id === 'whale') {
      var bx = x - f.facing * 26;
      ctx.fillStyle = C.whaleDark;
      ctx.beginPath();
      ctx.moveTo(bx, y - 78);
      ctx.lineTo(bx - f.facing * 34, y - 104);
      ctx.lineTo(bx - f.facing * 30, y - 48);
      ctx.closePath();
      ctx.fill();
    }
    // 身体胶囊
    ctx.fillStyle = bodyCol;
    rr(x - 28, top, 56, F.hurtH, 28);
    ctx.fill();
    if (f.id === 'villain') {
      // 蓝总：黑西装描边 + 蓝领带 + 蓝色乱发锯齿
      ctx.strokeStyle = C.villainEdge;
      rr(x - 28, top, 56, F.hurtH, 28);
      ctx.stroke();
      ctx.fillStyle = C.tie;
      ctx.fillRect(x - 5, top + 84, 10, 56);
      ctx.fillStyle = C.hair;
      ctx.beginPath();
      ctx.moveTo(x - 26, top + 30);
      var seg = 13;
      for (var i = 0; i < 4; i++) {
        ctx.lineTo(x - 26 + seg * i + seg / 2, top - 4 - (i % 2) * 6);
        ctx.lineTo(x - 26 + seg * (i + 1), top + 26);
      }
      ctx.closePath();
      ctx.fill();
    } else {
      // 鲸鱼娘：头顶呆毛曲线
      ctx.strokeStyle = C.whaleAhoge;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, top + 4);
      ctx.quadraticCurveTo(x - f.facing * 14, top - 16, x + f.facing * 8, top - 22);
      ctx.stroke();
      ctx.lineWidth = 2;
    }
    // 眼睛（朝向侧）
    ctx.fillStyle = '#fff';
    var ex = x + f.facing * 6;
    ctx.beginPath();
    ctx.arc(ex - 9, top + 40, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex + 9, top + 40, 3, 0, Math.PI * 2);
    ctx.fill();
    // 必杀蓄力提示圈
    if (f.state === 'special_startup') {
      ctx.strokeStyle = 'rgba(255,107,157,0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x + f.facing * 46, y - 110, 8 + f.stateFrame * 1.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 2;
    }
    // 攻击判定框（灰盒可读性）
    var ab = f.attackBox();
    if (ab) {
      ctx.fillStyle = 'rgba(255,120,120,0.22)';
      ctx.fillRect(ab.x, ab.y, ab.w, ab.h);
      ctx.strokeStyle = 'rgba(255,120,120,0.55)';
      ctx.strokeRect(ab.x, ab.y, ab.w, ab.h);
    }
    // 受击白闪 2 帧
    if (f.flashT > 0) {
      ctx.globalAlpha = 0.55 * (f.flashT / 2);
      ctx.fillStyle = '#fff';
      rr(x - 28, top, 56, F.hurtH, 28);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    drawName(f, top - 8);
  }

  /* ---------- 标题 / 结算 ---------- */
  function drawPortraitArt(charId, x, y, w, h, fallbackName, color) {
    if (window.BFArt && typeof BFArt.drawPortrait === 'function') {
      try { BFArt.drawPortrait(ctx, charId, x, y, w, h); return; } catch (e) { /* 落回占位 */ }
    }
    ctx.fillStyle = 'rgba(20,32,60,0.85)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fillStyle = color;
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(fallbackName, x + w / 2, y + h / 2);
    ctx.lineWidth = 1;
  }

  function renderTitle() {
    var C = D.ui.colors;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 76px sans-serif';
    ctx.fillText('杀鲸霸拳', W / 2, 190);
    ctx.font = '16px sans-serif';
    ctx.fillStyle = C.dim;
    ctx.fillText('—— 暂定名 ——', W / 2, 222);
    ctx.font = '26px sans-serif';
    ctx.fillStyle = C.accent;
    ctx.fillText('鲸鱼娘 VS 蓝总', W / 2, 264);
    drawPortraitArt('whale', 150, 300, 240, 300, '鲸鱼娘', C.whaleBody);
    drawPortraitArt('villain', 890, 300, 240, 300, '蓝总', C.tie);
    ctx.font = '16px sans-serif';
    ctx.fillStyle = C.text;
    var lines = [
      'A / D 移动      W 跳跃      S 防御',
      'J 轻击      K 重击      空中 J / K 跳击',
      'I 爆气（Token ≥ 60）      U 杀鲸霸拳（满槽 100）',
      'P / Esc 暂停'
    ];
    for (var i = 0; i < lines.length; i++) ctx.fillText(lines[i], W / 2, 452 + i * 26);
    if (titleT % 60 < 36) {
      ctx.font = 'bold 24px sans-serif';
      ctx.fillStyle = C.gold;
      ctx.fillText('按 J 开始', W / 2, 640);
    }
  }

  function renderMatchEnd() {
    var C = D.ui.colors;
    var m = matchEnd;
    ctx.fillStyle = 'rgba(3,8,18,0.78)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(16,28,54,0.92)';
    rr(390, 170, 500, 360, 16);
    ctx.fill();
    ctx.strokeStyle = C.accent;
    ctx.lineWidth = 2;
    rr(390, 170, 500, 360, 16);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.font = 'bold 52px sans-serif';
    ctx.fillStyle = m.win ? C.gold : '#e0645a';
    ctx.fillText(m.win ? '胜  利' : '败  北', W / 2, 254);
    ctx.font = '26px sans-serif';
    ctx.fillStyle = C.text;
    ctx.fillText('本局得分   ' + m.score, W / 2, 330);
    ctx.font = '20px sans-serif';
    ctx.fillStyle = C.dim;
    ctx.fillText('历史最高   ' + (m.best == null ? '—' : m.best), W / 2, 372);
    if (m.t % 60 < 36) {
      ctx.font = 'bold 22px sans-serif';
      ctx.fillStyle = C.accent;
      ctx.fillText('J 再战      Esc 退出', W / 2, 460);
    }
    ctx.lineWidth = 1;
  }

  /* ---------- HUD ---------- */
  function hpBar(frac, redFrac, x, mirror) {
    var U = D.ui;
    var C = U.colors;
    var y = U.hpY, w = U.hpW, h = U.hpH;
    ctx.fillStyle = C.hpBack;
    ctx.fillRect(x, y, w, h);
    function seg(f, col) {
      var ww = Math.max(0, Math.min(1, f)) * w;
      if (ww <= 0) return;
      ctx.fillStyle = col;
      if (mirror) ctx.fillRect(x + w - ww, y, ww, h);
      else ctx.fillRect(x, y, ww, h);
    }
    seg(redFrac, C.hpRed);
    seg(frac, frac < 0.25 ? C.hpLow : C.hpFront);
    ctx.strokeStyle = C.hpBorder;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  function dot(x, y, filled) {
    var C = D.ui.colors;
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    if (filled) { ctx.fillStyle = C.accent; ctx.fill(); }
    ctx.strokeStyle = filled ? C.accent : C.dim;
    ctx.stroke();
  }

  function tokenBar(f, x) {
    var U = D.ui;
    var C = U.colors;
    var y = U.tokenY, w = U.tokenW, h = U.tokenH;
    var full = f.token >= D.token.max;
    ctx.fillStyle = C.hpBack;
    ctx.fillRect(x, y, w, h);
    var fillW = f.token / D.token.max * w;
    if (full) { ctx.shadowColor = C.accent; ctx.shadowBlur = 14; }
    ctx.fillStyle = full ? C.gold : C.accent;
    ctx.fillRect(x, y, fillW, h);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(8,14,28,0.9)';
    for (var i = 1; i < U.tokenSegs; i++) {
      var lx = x + w * i / U.tokenSegs;
      ctx.beginPath();
      ctx.moveTo(lx, y);
      ctx.lineTo(lx, y + h);
      ctx.stroke();
    }
    ctx.strokeStyle = C.hpBorder;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    // 爆气刻度标注（60 段处）
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = f.token >= D.burst.cost ? C.gold : 'rgba(143,163,200,0.6)';
    ctx.fillText('爆气 I', x + w * (D.burst.cost / D.token.max), y - 4);
    // 满槽必杀提示（闪烁）
    if (full && (bgFrame % 30 < 18)) {
      ctx.font = 'bold 14px sans-serif';
      ctx.fillStyle = C.gold;
      ctx.fillText('必杀 U', x + w / 2, y + h + 16);
    }
  }

  function drawTutorial() {
    var C = D.ui.colors;
    ctx.globalAlpha = Math.min(1, match.tutorialT / 60) * 0.9;
    ctx.textAlign = 'center';
    ctx.font = '15px sans-serif';
    ctx.fillStyle = C.text;
    var lines = [
      'A / D 移动    W 跳跃    S 防御',
      'J 轻击    K 重击    空中 J / K 跳击',
      'I 爆气（Token ≥ 60）    U 杀鲸霸拳（Token 满 100）'
    ];
    for (var i = 0; i < lines.length; i++) ctx.fillText(lines[i], W / 2, 556 + i * 22);
    ctx.globalAlpha = 1;
  }

  function drawHUD() {
    var U = D.ui;
    var C = U.colors;
    // 延迟红条追赶
    match.disp1 += (p1.hp - match.disp1) * U.hpChase;
    match.disp2 += (p2.hp - match.disp2) * U.hpChase;
    if (Math.abs(match.disp1 - p1.hp) < 0.5) match.disp1 = p1.hp;
    if (Math.abs(match.disp2 - p2.hp) < 0.5) match.disp2 = p2.hp;
    hpBar(p1.hp / p1.maxHp, match.disp1 / p1.maxHp, U.hp1x, false);
    hpBar(p2.hp / p2.maxHp, match.disp2 / p2.maxHp, U.hp2x, true);
    // 名字 + 胜点
    ctx.font = '16px sans-serif';
    ctx.fillStyle = C.text;
    ctx.textAlign = 'left';
    ctx.fillText(p1.name, U.hp1x, U.hpY - 8);
    ctx.textAlign = 'right';
    ctx.fillText(p2.name, U.hp2x + U.hpW, U.hpY - 8);
    for (var i = 0; i < D.round.winsNeeded; i++) {
      dot(U.hp1x + U.hpW + 16 + i * 20, U.hpY + U.hpH / 2, i < match.wins1);
      dot(U.hp2x - 16 - i * 20, U.hpY + U.hpH / 2, i < match.wins2);
    }
    // 倒计时 + 回合号
    ctx.textAlign = 'center';
    ctx.font = 'bold 34px sans-serif';
    ctx.fillStyle = match.frames <= 600 ? '#ff6b6b' : C.text;
    ctx.fillText(String(Math.max(0, Math.ceil(match.frames / 60))), U.timerX, U.timerY);
    ctx.font = '13px sans-serif';
    ctx.fillStyle = C.dim;
    ctx.fillText('ROUND ' + match.round, U.timerX, U.timerY + 20);
    // Token 槽
    tokenBar(p1, U.token1x);
    tokenBar(p2, U.token2x);
    // R1 按键教学
    if (match.round === 1 && match.tutorialT > 0) drawTutorial();
  }

  function drawPause() {
    ctx.fillStyle = 'rgba(3,8,18,0.66)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 46px sans-serif';
    ctx.fillText('暂  停', W / 2, 340);
    ctx.font = '20px sans-serif';
    ctx.fillStyle = D.ui.colors.dim;
    ctx.fillText('P 继续      Esc 退出', W / 2, 390);
  }

  function drawDebug() {
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#7cfc9a';
    var fs = [p1, p2];
    for (var i = 0; i < 2; i++) {
      var f = fs[i];
      ctx.fillText(f.state + ' f' + f.stateFrame + ' tok' + f.token + ' hp' + Math.round(f.hp), f.x, f.y - D.fighter.hurtH - 22);
    }
  }

  function renderFight() {
    ctx.save();
    if (FX.shakeMag > 0) {
      ctx.translate(((Math.random() * 2 - 1) * FX.shakeMag) | 0, ((Math.random() * 2 - 1) * FX.shakeMag) | 0);
    }
    drawShadow(p1);
    drawShadow(p2);
    drawFighterArt(p1);
    drawFighterArt(p2);
    ctx.restore();
    drawHUD();
    FX.render(ctx);
    if (paused) drawPause();
    if (debug) drawDebug();
  }

  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    drawBackground();
    if (scene === 'TITLE') renderTitle();
    else if (scene === 'FIGHT') renderFight();
    else renderMatchEnd();
  }

  /* ================= 固定步长主循环 ================= */
  var STEP = 1000 / 60;
  var last = performance.now();
  var acc = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    var dt = now - last;
    last = now;
    if (dt > 100) dt = 100; // 后台回来防爆走
    acc += dt;
    var n = 0;
    while (acc >= STEP && n < 5) {
      acc -= STEP;
      n++;
      tick();
    }
    render();
  }
  requestAnimationFrame(frame);

  if (window.BFShell && typeof BFShell.ready === 'function') BFShell.ready();
})();
