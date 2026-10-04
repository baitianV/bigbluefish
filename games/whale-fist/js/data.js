/* 杀鲸霸拳 · 数值基准 v0（60fps 固定步长；速度单位 px/帧，时间单位帧）
 * 调数只改这里；字段名被 fighter.js / main.js / fx.js 按名引用，勿随意改名。 */
(function (g) {
  'use strict';
  var BFD = {
    stage: { width: 1280, height: 720, groundY: 620, wallL: 70, wallR: 1210 },

    fighter: {
      hp: 1000, walkSpeed: 4.4, jumpV: -12.7, gravity: 0.61,
      hurtW: 70, hurtH: 190,
      knockdownFrames: 20, getupFrames: 30,   // 倒地躺 / 起身（起身无敌）
      launchVY: -8, launchVX: 6               // 击飞与致死倒地的抛物线初速
    },

    moves: {
      light: { dmg: 40, startup: 4, active: 3, recovery: 8, reach: 85, hitstun: 10, pushback: 40, tokenOnHit: 8,
               box: { xOff: 35, yTop: -150, yBot: -30 } },
      heavy: { dmg: 70, startup: 10, active: 4, recovery: 16, reach: 110, hitstun: 18, pushback: 90, tokenOnHit: 14,
               box: { xOff: 35, yTop: -160, yBot: -20 } },
      air:   { dmg: 50, startup: 6, active: 16, recovery: 8, reach: 95, hitstun: 12, pushback: 60, tokenOnHit: 10,
               box: { xOff: 20, yTop: -60, yBot: 40 } },  // 跳击斜下：判定框延伸到脚线下方
      special: {
        dmg: 250, startup: 18, reach: 100, tokenOnHit: 0,
        box: { xOff: 35, yTop: -180, yBot: 0 },          // 拳判定框随身体前伸
        dashFrames: 20, dashSpeed: 26, recoveryHit: 20, recoveryWhiff: 45,
        blockedDmg: 100, armorHits: 1
      }
    },

    defense: {
      chip: 0.2,            // 防御减伤后剩余比例
      blockstun: 8,
      tokenOnBlock: 3,
      attackerPushback: 60, // 防御成功时攻方被弹开
      defenderPushback: 20,
      pushScale: 0.25,      // pushback(px) → 初速(px/帧) 换算
      friction: 0.82        // 地面滑动摩擦
    },

    burst: { cost: 60, duration: 480, dmgMult: 1.3, speedMult: 1.15, flareFrames: 20, flareInvuln: 10 },

    token: { max: 100, onHurt: 6 },

    round: { frames: 3600, koFreeze: 45, endGap: 120, winsNeeded: 2, bannerFrames: 60, introTutorialFrames: 300 },

    /* AI 参数：base 为各档共享，levels 按回合取档（R1/R2/R3，第 4 回合起循环 R3）；
       R2 = 原占位档参数。telegraph 为重击预告帧数（蓝总彩蛋）。 */
    ai: {
      attackRange: 135, blockTimeMin: 20, blockTimeMax: 45, blockLowHpBonus: 0.2, lowHpRatio: 0.3,
      telegraph: 22,
      levels: {
        R1: { reactFrames: 16, blockRate: 0.10, aggression: 0.5, thinkInterval: 20, jumpChance: 0.08 },
        R2: { reactFrames: 12, blockRate: 0.25, aggression: 0.7, thinkInterval: 15, jumpChance: 0.12 },
        R3: { reactFrames: 8, blockRate: 0.45, aggression: 0.9, thinkInterval: 10, jumpChance: 0.16, burstEnabled: true }
      }
    },

    fx: {
      hitstop: { light: 3, heavy: 6, air: 4, special: 12, block: 3 },
      shake: { light: 5, heavy: 9, air: 6, special: 16, block: 3, ko: 18 },
      sparks: { light: 8, heavy: 14, air: 10, special: 26, block: 6 },
      flash: { special: 0.55, ko: 0.8 },
      colors: { light: '#bfe3ff', heavy: '#ffd76b', air: '#a5f0ff', special: '#ff6b9d', block: '#9fb4d0', dmg: '#ffffff' },
      particleGravity: 0.25, shakeDecay: 0.88, flashDecay: 0.85,
      textRise: 0.8, textLife: 50, particleLifeMin: 16, particleLifeMax: 30, pool: 256
    },

    ui: {
      hp1x: 40, hp2x: 800, hpY: 26, hpW: 440, hpH: 22, hpChase: 0.06,
      token1x: 40, token2x: 800, tokenY: 682, tokenW: 440, tokenH: 14, tokenSegs: 10,
      timerX: 640, timerY: 58,
      colors: {
        hpBack: '#1b2436', hpRed: '#c0303c', hpFront: '#43d06a', hpLow: '#e0b020', hpBorder: '#0a1220',
        text: '#dfe8ff', dim: '#8fa3c8', accent: '#5ad0ff', gold: '#ffd76b',
        whaleBody: '#5B6BBF', whaleDark: '#4a58a8', whaleAhoge: '#8f9de0',
        villainBody: '#1A1A20', villainEdge: '#32323f', tie: '#2B5BD0', hair: '#2f66e0'
      }
    }
  };
  g.BFD = BFD;
  if (typeof window !== 'undefined') window.BFD = BFD; // 浏览器约定（node 冒烟读 globalThis.BFD）
})(typeof globalThis !== 'undefined' ? globalThis : this);
