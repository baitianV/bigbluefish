/* 杀鲸霸拳 · Fighter 纯逻辑状态机（零 DOM，node 可直接加载冒烟）
 * 字段契约（美术卡依赖，一字不差）：
 * id name x y vx vy facing state stateFrame animT onGround hp maxHp token
 * burstFramesLeft moveKey attackPhase isCPU
 * state 枚举：idle walk jump attack_light attack_heavy attack_air block blockstun
 *   hitstun launched knockdown getup special_startup special_dash special_recovery
 *   burst_flare ko victory roundstart
 */
(function (g) {
  'use strict';
  var D = g.BFD;

  var ATK_STATES = { attack_light: 1, attack_heavy: 1, attack_air: 1, special_startup: 1, special_dash: 1, special_recovery: 1 };

  function Fighter(opt) {
    this.id = opt.id;
    this.name = opt.name;
    this.x = opt.x;
    this.y = D.stage.groundY;
    this.vx = 0;
    this.vy = 0;
    this.facing = opt.facing;
    this.state = 'idle';
    this.stateFrame = 0;
    this.stateTimer = 0;   // 计时态总帧数
    this.animT = 0;
    this.onGround = true;
    this.hp = D.fighter.hp;
    this.maxHp = D.fighter.hp;
    this.token = 0;
    this.burstFramesLeft = 0;
    this.moveKey = null;   // null | 'light' | 'heavy' | 'air' | 'special'
    this.attackPhase = null; // 'startup' | 'active' | 'recovery' | null
    this.isCPU = !!opt.isCPU;
    // 内部状态（非契约字段）
    this.hasHit = false;      // 每招每次只判一次
    this.armorLeft = 0;       // 必杀护甲剩余吸收次数
    this.dead = false;
    this.flashT = 0;          // 受击白闪剩余帧（主循环渲染用）
    this.airMoveUsed = false; // 每次腾空限一次跳击
    this.whiffPlayed = false; // 挥空音效标记（主循环消费）
  }

  /* ---------- 内部工具 ---------- */
  Fighter.prototype.setState = function (s, timer) {
    this.state = s;
    this.stateFrame = 0;
    this.stateTimer = timer || 0;
    if (!ATK_STATES[s]) { this.moveKey = null; this.attackPhase = null; }
  };

  Fighter.prototype.speed = function () {
    return D.fighter.walkSpeed * (this.burstFramesLeft > 0 ? D.burst.speedMult : 1);
  };

  Fighter.prototype.faceOpp = function (opp) {
    if (opp) this.facing = opp.x >= this.x ? 1 : -1;
  };

  Fighter.prototype.clampWalls = function () {
    if (this.x < D.stage.wallL) { this.x = D.stage.wallL; if (this.vx < 0) this.vx = 0; }
    else if (this.x > D.stage.wallR) { this.x = D.stage.wallR; if (this.vx > 0) this.vx = 0; }
  };

  Fighter.prototype.physics = function () {
    if (!this.onGround) {
      this.vy += D.fighter.gravity;
      this.y += this.vy;
      this.x += this.vx;
      if (this.y >= D.stage.groundY) {
        this.y = D.stage.groundY;
        this.vy = 0;
        this.vx = 0;
        this.onGround = true;
      }
    } else if (this.vx !== 0) {
      this.x += this.vx;
      this.vx *= D.defense.friction;
      if (Math.abs(this.vx) < 0.3) this.vx = 0;
    }
    this.clampWalls();
  };

  /* ---------- 判定框 ---------- */
  Fighter.prototype.hurtBox = function () {
    return { x: this.x - D.fighter.hurtW / 2, y: this.y - D.fighter.hurtH, w: D.fighter.hurtW, h: D.fighter.hurtH };
  };

  Fighter.prototype.attackBox = function () {
    if (!this.moveKey || this.attackPhase !== 'active') return null;
    var mv = D.moves[this.moveKey];
    var b = mv.box;
    var x0 = this.x + this.facing * b.xOff;
    var x1 = this.x + this.facing * mv.reach;
    return { x: Math.min(x0, x1), y: this.y + b.yTop, w: Math.abs(x1 - x0), h: b.yBot - b.yTop };
  };

  /* ---------- 招式进入 / 退出 ---------- */
  Fighter.prototype.startAttack = function (key) {
    this.moveKey = key;
    this.hasHit = false;
    this.whiffPlayed = false;
    this.setState(key === 'air' ? 'attack_air' : 'attack_' + key);
    this.attackPhase = 'startup';
  };

  Fighter.prototype.startSpecial = function () {
    this.token = 0;
    this.armorLeft = D.moves.special.armorHits;
    this.moveKey = 'special';
    this.hasHit = false;
    this.whiffPlayed = false;
    this.setState('special_startup');
    this.attackPhase = 'startup';
  };

  Fighter.prototype.enterSpecialRecovery = function (frames) {
    this.setState('special_recovery', frames);
    this.attackPhase = 'recovery';
  };

  Fighter.prototype.endAttack = function () {
    this.setState(this.onGround ? 'idle' : 'jump');
  };

  /* ---------- 回合重置 ---------- */
  Fighter.prototype.resetRound = function (x, facing) {
    this.x = x;
    this.y = D.stage.groundY;
    this.vx = 0;
    this.vy = 0;
    this.facing = facing;
    this.onGround = true;
    this.hp = this.maxHp;
    this.token = 0;
    this.burstFramesLeft = 0;
    this.dead = false;
    this.hasHit = false;
    this.armorLeft = 0;
    this.flashT = 0;
    this.airMoveUsed = false;
    this.whiffPlayed = false;
    this.animT = 0;
    this.setState('roundstart');
  };

  /* ---------- 主更新 ---------- */
  Fighter.prototype.update = function (input, opp) {
    this.animT++;
    if (this.flashT > 0) this.flashT--;
    if (this.burstFramesLeft > 0) this.burstFramesLeft--;
    var held = (input && input.held) || {};
    var pr = (input && input.pressed) || {};

    // 爆气：可打断受击/攻击硬直（ko/knockdown/getup/演出态中不可）
    if (pr.burst && this.token >= D.burst.cost &&
        this.state !== 'ko' && this.state !== 'knockdown' && this.state !== 'getup' &&
        this.state !== 'roundstart' && this.state !== 'victory' && this.state !== 'burst_flare') {
      this.token -= D.burst.cost;
      this.burstFramesLeft = D.burst.duration;
      this.setState('burst_flare', D.burst.flareFrames);
      return;
    }

    switch (this.state) {
      case 'ko':
      case 'victory':
      case 'roundstart':
        this.stateFrame++;
        return;

      case 'burst_flare':
        this.physics();
        if (++this.stateFrame >= this.stateTimer) this.setState(this.onGround ? 'idle' : 'jump');
        return;

      case 'hitstun':
        this.physics();
        if (++this.stateFrame >= this.stateTimer) this.setState('idle');
        return;

      case 'blockstun':
        this.physics();
        if (++this.stateFrame >= this.stateTimer) this.setState(held.down ? 'block' : 'idle');
        return;

      case 'launched':
        this.physics();
        this.stateFrame++;
        if (this.onGround) this.setState('knockdown', D.fighter.knockdownFrames);
        return;

      case 'knockdown':
        this.stateFrame++;
        // 致死者长躺等回合结束；活人起身（起身全程无敌）
        if (!this.dead && this.stateFrame >= this.stateTimer) this.setState('getup', D.fighter.getupFrames);
        return;

      case 'getup':
        if (++this.stateFrame >= this.stateTimer) this.setState('idle');
        return;

      case 'block':
        this.physics();
        this.faceOpp(opp);
        if (!held.down) this.setState('idle');
        return;

      case 'attack_light':
      case 'attack_heavy': {
        var mv = D.moves[this.moveKey];
        this.physics();
        this.stateFrame++;
        this.attackPhase = this.stateFrame < mv.startup ? 'startup'
          : this.stateFrame < mv.startup + mv.active ? 'active' : 'recovery';
        if (this.stateFrame >= mv.startup + mv.active + mv.recovery) this.endAttack();
        return;
      }

      case 'attack_air': {
        var ma = D.moves.air;
        var actEnd = ma.startup + ma.active;
        this.physics();
        this.stateFrame++;
        if (this.onGround && this.stateFrame < actEnd) this.stateFrame = actEnd; // 落地即转收招
        this.attackPhase = this.stateFrame < ma.startup ? 'startup'
          : this.stateFrame < actEnd ? 'active' : 'recovery';
        if (this.stateFrame >= actEnd + ma.recovery) this.endAttack();
        return;
      }

      case 'special_startup':
        this.physics();
        this.stateFrame++;
        if (this.stateFrame >= D.moves.special.startup) {
          this.setState('special_dash', D.moves.special.dashFrames);
          this.attackPhase = 'active';
        }
        return;

      case 'special_dash':
        this.physics();
        this.stateFrame++;
        this.vx = this.facing * D.moves.special.dashSpeed;
        if (this.hasHit) this.enterSpecialRecovery(D.moves.special.recoveryHit);
        else if (this.stateFrame >= this.stateTimer) this.enterSpecialRecovery(D.moves.special.recoveryWhiff);
        return;

      case 'special_recovery':
        this.physics();
        if (++this.stateFrame >= this.stateTimer) this.endAttack();
        return;
    }

    // —— 常规行动（idle / walk / jump）——
    this.physics();
    if (this.onGround) {
      this.faceOpp(opp);
      if (held.down) { this.setState('block'); return; }
      if (pr.up) {
        this.vy = D.fighter.jumpV;
        this.onGround = false;
        this.vx = (held.left ? -1 : held.right ? 1 : 0) * this.speed();
        this.airMoveUsed = false;
        this.setState('jump');
        return;
      }
      if (pr.special && this.token >= D.token.max) { this.startSpecial(); return; }
      if (pr.light) { this.startAttack('light'); return; }
      if (pr.heavy) { this.startAttack('heavy'); return; }
      var dir = (held.right ? 1 : 0) - (held.left ? 1 : 0);
      if (dir !== 0) { this.x += dir * this.speed(); this.setState('walk'); }
      else this.setState('idle');
    } else if (!this.airMoveUsed && (pr.light || pr.heavy)) {
      // 空中攻击键 → 跳击（每次腾空一次）
      this.airMoveUsed = true;
      this.startAttack('air');
    }
  };

  /* ---------- 战斗判定（主循环每帧对 (p1,p2)/(p2,p1) 各调一次） ---------- */
  function intersect(a, b) {
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  }

  // 致死：一律进入击飞→倒地流程（含 chip 致死与爆气/护甲吸收致死）
  function kill(f, dir) {
    f.dead = true;
    f.onGround = false;
    f.vy = D.fighter.launchVY;
    f.vx = dir * D.fighter.launchVX;
    f.armorLeft = 0;
    f.setState('launched');
  }

  Fighter.resolveCombat = function (att, def) {
    if (def.dead) return []; // 致死击飞/倒地途中不可再被追打
    var ab = att.attackBox();
    if (!ab || att.hasHit) return [];
    // 倒地/起身/阵亡/演出态不可被判定；爆气起手前 10 帧无敌
    if (def.state === 'knockdown' || def.state === 'getup' || def.state === 'ko' ||
        def.state === 'roundstart' || def.state === 'victory') return [];
    if (def.state === 'burst_flare' && def.stateFrame < D.burst.flareInvuln) return [];
    var hb = def.hurtBox();
    if (!intersect(ab, hb)) return [];
    att.hasHit = true;

    var mv = D.moves[att.moveKey];
    var dir = att.facing;
    var cx = (Math.max(ab.x, hb.x) + Math.min(ab.x + ab.w, hb.x + hb.w)) / 2;
    var cy = (Math.max(ab.y, hb.y) + Math.min(ab.y + ab.h, hb.y + hb.h)) / 2; // 真交集中心
    var dmg = Math.round(mv.dmg * (att.burstFramesLeft > 0 ? D.burst.dmgMult : 1));

    // 防御：block/blockstun 且面向攻击者
    if ((def.state === 'block' || def.state === 'blockstun') && def.facing === -dir) {
      var chip = att.moveKey === 'special' ? D.moves.special.blockedDmg : Math.round(dmg * D.defense.chip);
      def.hp -= chip;
      def.token = Math.min(D.token.max, def.token + D.defense.tokenOnBlock);
      def.vx = dir * D.defense.defenderPushback * D.defense.pushScale;
      att.vx = -dir * D.defense.attackerPushback * D.defense.pushScale;
      def.flashT = 2;
      if (def.hp <= 0) { def.hp = 0; kill(def, dir); } // chip 可击倒致死
      else def.setState('blockstun', D.defense.blockstun);
      return [{ type: 'blocked', move: att.moveKey, dmg: chip, x: cx, y: cy }];
    }

    // 爆气霸体 / 必杀护甲：只扣血不变状态（护甲吸收次数递减）
    var armor = (def.state === 'special_startup' || def.state === 'special_dash') && def.armorLeft > 0;
    if (def.burstFramesLeft > 0 || armor) {
      def.hp -= dmg;
      def.token = Math.min(D.token.max, def.token + D.token.onHurt);
      if (armor) def.armorLeft--;
      att.token = Math.min(D.token.max, att.token + mv.tokenOnHit);
      if (def.hp <= 0) { def.hp = 0; kill(def, dir); }
      return [{ type: 'hit', move: att.moveKey, dmg: dmg, x: cx, y: cy }];
    }

    // 常规命中
    def.hp -= dmg;
    def.token = Math.min(D.token.max, def.token + D.token.onHurt);
    att.token = Math.min(D.token.max, att.token + mv.tokenOnHit);
    def.flashT = 2;
    if (def.hp <= 0) { def.hp = 0; kill(def, dir); }
    else if (att.moveKey === 'special') {
      // 必杀命中：大击飞
      def.onGround = false;
      def.vy = D.fighter.launchVY;
      def.vx = dir * D.fighter.launchVX;
      def.setState('launched');
    } else {
      def.vx = dir * mv.pushback * D.defense.pushScale;
      def.setState('hitstun', mv.hitstun);
    }
    return [{ type: 'hit', move: att.moveKey, dmg: dmg, x: cx, y: cy }];
  };

  /* ---------- 身体推挤（贴墙推力转移） ---------- */
  Fighter.resolveBodies = function (a, b) {
    if (!a.onGround || !b.onGround) return;
    if (a.dead || b.dead) return;
    var busy = { knockdown: 1, ko: 1, getup: 1, launched: 1 };
    if (busy[a.state] || busy[b.state]) return;
    var minD = D.fighter.hurtW;
    var dx = b.x - a.x;
    var overlap = minD - Math.abs(dx);
    if (overlap <= 0) return;
    var dir = dx >= 0 ? 1 : -1; // a 在左则 b 往右推
    var aWall = a.x <= D.stage.wallL + 0.5 || a.x >= D.stage.wallR - 0.5;
    var bWall = b.x <= D.stage.wallL + 0.5 || b.x >= D.stage.wallR - 0.5;
    if (aWall && !bWall) b.x += dir * overlap;
    else if (bWall && !aWall) a.x -= dir * overlap;
    else { a.x -= dir * overlap / 2; b.x += dir * overlap / 2; }
    a.clampWalls();
    b.clampWalls();
  };

  g.Fighter = Fighter;
})(typeof globalThis !== 'undefined' ? globalThis : this);
