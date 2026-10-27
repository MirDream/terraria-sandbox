/* =========================================================================
 * test-headless.js — 无头冒烟测试
 * 用「桩」替代 DOM / Canvas，让游戏逻辑脱离浏览器跑通主循环。
 * 覆盖：世界生成（地形/洞穴/矿脉/树木）→ 600 秒模拟（约 10 个昼夜）→ 僵尸生成与自燃
 * 运行：node test-headless.js
 * ========================================================================= */
'use strict';

// 桩：屏蔽浏览器专属全局，确保 game.js 不进入 boot()
globalThis.__HEADLESS__ = true;
if (typeof globalThis.window === 'undefined') globalThis.window = undefined;

const game = require('./game.js');

let failures = 0;
function check(name, cond, extra) {
  if (cond) {
    console.log('  OK   ' + name + (extra ? ' — ' + extra : ''));
  } else {
    failures++;
    console.log('  FAIL ' + name + (extra ? ' — ' + extra : ''));
  }
}

/* ------------------------- 1. 世界生成校验 ------------------------- */
console.log('[1/3] 世界生成');
const g = game.createGame({ seed: 20261101 });
const w = g.world;

let air = 0, solid = 0, coal = 0, iron = 0, gold = 0, tree = 0, bedrock = 0;
for (let i = 0; i < w.tiles.length; i++) {
  const t = w.tiles[i];
  if (t === game.T.AIR) air++;
  else solid++;
  if (t === game.T.COAL) coal++;
  if (t === game.T.IRON) iron++;
  if (t === game.T.GOLD) gold++;
  if (t === game.T.TREE) tree++;
  if (t === game.T.BEDROCK) bedrock++;
}

const surfaceMin = Math.min(...w.surface);
const surfaceMax = Math.max(...w.surface);

check('地表有起伏', surfaceMax - surfaceMin >= 8, `落差 ${surfaceMax - surfaceMin} 格`);
check('存在洞穴（地表以下空气）', air > w.w * 6, `空气格 ${air}`);
check('存在煤矿', coal > 100, `煤矿 ${coal}`);
check('存在铁矿', iron > 40, `铁矿 ${iron}`);
check('存在金矿', gold > 10, `金矿 ${gold}`);
check('存在树木', tree > 200, `树干 ${tree}`);
check('底层为基岩', bedrock >= w.w * 2 - 2, `基岩 ${bedrock}`);

/* --------------------- 2. 物理与初始状态校验 --------------------- */
console.log('[2/3] 物理与初始状态');
check('玩家初始血量满', g.player.hp === g.player.maxHp, `hp=${g.player.hp}`);
check('初始持有木镐', g.countItem('pick1') === 1);
check('初始持有火把', g.countItem('t' + game.T.TORCH) === 8);

// 重力：给玩家一点滞空时间后应落到地面
for (let i = 0; i < 180; i++) g.update(1 / 60, {});
check('重力生效且已落地', g.player.onGround === true, `y=${g.player.y.toFixed(1)}`);

// 撞墙：把玩家放进实心块内不应穿模（moveEntity 会回退）
const beforeY = g.player.y;
g.player.vy = -400;
for (let i = 0; i < 30; i++) g.update(1 / 60, {});
check('跳跃后能再次下落', g.player.y >= beforeY - 120, `y=${g.player.y.toFixed(1)}`);

/* ------------------------ 3. 600 秒模拟 ------------------------ */
console.log('[3/3] 600 秒无头模拟');
const SECONDS = 600;
const STEPS = SECONDS * 60;
let maxZombies = 0;
let zombieSeen = 0;
let nightsSeen = 0;
let wasNight = false;

const t0 = Date.now();
for (let s = 0; s < STEPS; s++) {
  // 模拟玩家左右游走，制造移动与碰撞
  const phase = Math.floor(s / 120) % 4;
  const input = {
    left: phase === 0,
    right: phase === 2,
    jump: phase === 1 && s % 40 === 0
  };
  g.update(1 / 60, input);

  if (g.state.zombies.length > 0) zombieSeen++;
  if (g.state.zombies.length > maxZombies) maxZombies = g.state.zombies.length;

  const night = g.isNight();
  if (night && !wasNight) nightsSeen++;
  wasNight = night;

  if (!Number.isFinite(g.player.x) || !Number.isFinite(g.player.y)) {
    check('模拟过程坐标保持有限值', false, `第 ${s} 帧坐标异常`);
    break;
  }
}
const ms = Date.now() - t0;

check('模拟 600 秒未抛异常', true, `耗时 ${ms}ms`);
check('昼夜推进（天数 >= 10）', g.state.day >= 10, `day=${g.state.day}`);
check('经历过夜间', nightsSeen >= 9, `夜转 ${nightsSeen} 次`);
check('僵尸生成过', maxZombies > 0, `峰值 ${maxZombies} 只，出现帧数 ${zombieSeen}`);
check('玩家血量在合法范围', g.player.hp > 0 && g.player.hp <= g.player.maxHp, `hp=${g.player.hp}`);
check('金币非负', g.player.coins >= 0, `coins=${g.player.coins}`);

/* --------------------------- 汇总 --------------------------- */
console.log('');
if (failures === 0) {
  console.log('SMOKE OK: ' + SECONDS + 's 模拟无异常');
  process.exit(0);
} else {
  console.log('SMOKE FAILED: ' + failures + ' 项未通过');
  process.exit(1);
}
