/* 杀鲸霸拳 · 正式 AI 控制器（纯逻辑零 DOM，node 可直接加载冒烟）
 * 用法: var ai = new BFAI(BFD.ai.levels.R2); 每帧 inp = ai.update(self, opp)
 * 返回 {held, pressed}，键集与引擎 input 恰等（8 键布尔）。
 * 等级参数见 BFD.ai.levels（R1/R2/R3）；反应防御用延迟队列实现——
 * 只消费过去帧的信息（对手进入 startup 时刻），延迟 reactFrames 后结算，不许未来信息。
 * 蓝总行为约束：永远不出必杀（不置 pressed.special）。
 */
(function (g) {
  'use strict';
  var D = g.BFD;

  var KEYS = ['left', 'right', 'up', 'down', 'light', 'heavy', 'burst', 'special'];
  var ATK_STARTUP = { attack_light: 1, attack_heavy: 1, attack_air: 1 };

  function BFAI(lv) {
    this.lv = lv;
    this.telegraph = 0;      // 重击预告剩余帧（main.js 据此画头顶气泡）
    this.heavyReady = false; // 预告归零，等待可行动帧真正出重击
    this.thinkT = 0;
    this.dir = 0;            // -1 后撤 / 1 逼近 / 0 原地
    this.blockT = 0;
    this.reactQ = [];        // 延迟反应队列 [{t: framesLeft}]
    this.oppWasStarting = false;
    this.antiSpLock = false; // 反必杀边沿锁（威胁持续期间只触发一次）
  }

  BFAI.prototype.blank = function () {
    var inp = { held: {}, pressed: {} };
    for (var i = 0; i < KEYS.length; i++) { inp.held[KEYS[i]] = false; inp.pressed[KEYS[i]] = false; }
    return inp;
  };

  BFAI.prototype.blockDur = function () {
    var P = D.ai;
    return P.blockTimeMin + ((Math.random() * (P.blockTimeMax - P.blockTimeMin)) | 0);
  };

  BFAI.prototype.blockRate = function (me) {
    var P = D.ai;
    return this.lv.blockRate + (me.hp < me.maxHp * P.lowHpRatio ? P.blockLowHpBonus : 0);
  };

  BFAI.prototype.update = function (me, opp) {
    var inp = this.blank();
    var lv = this.lv;
    var P = D.ai;
    var dx = opp.x - me.x;
    var adx = Math.abs(dx);
    var towards = dx > 0 ? 1 : -1;
    var away = -towards;

    /* 1) R3 爆气博弈：每帧检查（爆气可打断 hitstun）；发动后 token 归零自然复位 */
    if (lv.burstEnabled && me.token >= D.burst.cost) {
      var hpGap = opp.hp / opp.maxHp - me.hp / me.maxHp;
      if (hpGap >= 0.15 || opp.burstFramesLeft > 0 || me.state === 'hitstun') {
        inp.pressed.burst = true; // 持续按住直到引擎在合法状态消耗；非法态引擎忽略
      }
    }

    /* 2) 反必杀博弈：对手满槽或必杀前摇 → 边沿触发，0.6 跳躲 / 否则防御 */
    var spThreat = opp.token >= D.token.max || opp.state === 'special_startup';
    if (spThreat && !this.antiSpLock) {
      this.antiSpLock = true;
      if (Math.random() < 0.6) { inp.pressed.up = true; this.dir = away; this.blockT = 0; }
      else this.blockT = this.blockDur();
    } else if (!spThreat) {
      this.antiSpLock = false;
    }

    /* 3) 反应防御：对手在己方 reach 内进入攻击 startup → 入队延迟 reactFrames 结算 */
    var starting = !!ATK_STARTUP[opp.state] && opp.attackPhase === 'startup' && adx <= P.attackRange;
    if (starting && !this.oppWasStarting) this.reactQ.push({ t: lv.reactFrames });
    this.oppWasStarting = starting;
    for (var i = this.reactQ.length - 1; i >= 0; i--) {
      if (--this.reactQ[i].t <= 0) {
        this.reactQ.splice(i, 1);
        if (Math.random() < this.blockRate(me)) { this.blockT = this.blockDur(); this.dir = 0; }
      }
    }

    /* 4) 重击预告：倒计时归零后的首个可行动帧才真正出重击 */
    if (this.telegraph > 0) {
      this.telegraph--;
      if (this.telegraph === 0) this.heavyReady = true;
    }
    var canAct = (me.state === 'idle' || me.state === 'walk') && me.onGround;

    /* 5) 周期决策（防御持续期间不重新决策） */
    if (--this.thinkT <= 0) {
      this.thinkT = lv.thinkInterval;
      this.dir = 0;
      if (this.blockT <= 0) {
        var r = Math.random();
        if (adx > 320) {
          this.dir = towards; // 远距：逼近
        } else if (adx > P.attackRange) {
          if (r < lv.aggression) this.dir = towards;
          else if (r < lv.aggression + lv.jumpChance) { inp.pressed.up = true; this.dir = towards; } // 跳入
          // 其余：原地等待
        } else if (r < lv.aggression) {
          if (Math.random() < 0.6) inp.pressed.light = true;
          else this.telegraph = P.telegraph; // 重击先预告再出手
        } else if (r < lv.aggression + this.blockRate(me)) {
          this.blockT = this.blockDur();
        } else {
          this.dir = away; // 后撤
        }
      }
    }

    /* 6) 输出合成 */
    if (this.blockT > 0) { this.blockT--; inp.held.down = true; this.dir = 0; }
    else if (this.dir !== 0) inp.held[this.dir < 0 ? 'left' : 'right'] = true;
    if (this.heavyReady && canAct) { inp.pressed.heavy = true; this.heavyReady = false; }
    return inp;
  };

  g.BFAI = BFAI;
  if (typeof window !== 'undefined') window.BFAI = BFAI; // 浏览器约定（node 冒烟读 globalThis.BFAI）
})(typeof globalThis !== 'undefined' ? globalThis : this);
