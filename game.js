/* =========================================================================
 * TerraSandbox — 泰拉瑞亚风格 2D 侧视沙盒生存游戏
 * 纯 HTML5 Canvas + 原生 JavaScript，无任何第三方依赖
 * 结构：常量/图块 → 噪声 → 世界生成 → 物理 → 玩家 → 僵尸 → 光照 → 渲染 → 合成 → 主循环
 * ========================================================================= */
(function (global) {
  'use strict';

  /* ----------------------------- 常量与图块 ----------------------------- */
  var TILE = 16;
  var WORLD_W = 420;
  var WORLD_H = 150;
  var DAY_LENGTH = 60;          // 一个完整昼夜 60 秒
  var GRAVITY = 1500;           // 像素/秒²
  var MAX_FALL = 900;

  var T = {
    AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, COAL: 4, IRON: 5, GOLD: 6,
    TREE: 7, LEAF: 8, PLANK: 9, WORKBENCH: 10, TORCH: 11, BEDROCK: 12
  };

  // 数据驱动：新增方块只需往这张表加一项
  var TILEINFO = {};
  TILEINFO[T.GRASS] = { name: '草地', hard: 0.28, pick: 1, drop: T.DIRT, solid: true, color: '#3f9a4a' };
  TILEINFO[T.DIRT] = { name: '泥土', hard: 0.32, pick: 1, drop: T.DIRT, solid: true, color: '#7a5230' };
  TILEINFO[T.STONE] = { name: '石块', hard: 0.85, pick: 1, drop: T.STONE, solid: true, color: '#6b7280' };
  TILEINFO[T.COAL] = { name: '煤矿', hard: 1.05, pick: 1, drop: T.COAL, solid: true, color: '#2f3540' };
  TILEINFO[T.IRON] = { name: '铁矿', hard: 1.35, pick: 2, drop: T.IRON, solid: true, color: '#b08468' };
  TILEINFO[T.GOLD] = { name: '金矿', hard: 1.7, pick: 3, drop: T.GOLD, solid: true, color: '#d8b43a' };
  TILEINFO[T.TREE] = { name: '树干', hard: 0.55, pick: 1, drop: T.TREE, solid: false, color: '#5a3d22' };
  TILEINFO[T.LEAF] = { name: '树叶', hard: 0.12, pick: 1, drop: -1, solid: false, color: '#2f7a3d' };
  TILEINFO[T.PLANK] = { name: '木板', hard: 0.4, pick: 1, drop: T.PLANK, solid: true, color: '#8a6a3f' };
  TILEINFO[T.WORKBENCH] = { name: '工作台', hard: 0.5, pick: 1, drop: T.WORKBENCH, solid: true, color: '#9a7346' };
  TILEINFO[T.TORCH] = { name: '火把', hard: 0.05, pick: 1, drop: T.TORCH, solid: false, color: '#ffb648' };
  TILEINFO[T.BEDROCK] = { name: '基岩', hard: Infinity, pick: 9, drop: -1, solid: true, color: '#1a1d24' };

  // 物品表：tile 类可放置，pick/sword 为工具
  var ITEM = {
    pick1: { name: '木镐', kind: 'pick', level: 1, color: '#8a6a3f' },
    pick2: { name: '石镐', kind: 'pick', level: 2, color: '#8c93a1' },
    pick3: { name: '铁镐', kind: 'pick', level: 3, color: '#c08a6a' },
    pick4: { name: '金镐', kind: 'pick', level: 4, color: '#e5c452' },
    sword1: { name: '木剑', kind: 'sword', level: 1, dmg: 18, color: '#8a6a3f' },
    sword2: { name: '石剑', kind: 'sword', level: 2, dmg: 28, color: '#8c93a1' },
    sword3: { name: '铁剑', kind: 'sword', level: 3, dmg: 40, color: '#c08a6a' },
    sword4: { name: '金剑', kind: 'sword', level: 4, dmg: 56, color: '#e5c452' }
  };
  var TILE_ITEM = {};
  [T.DIRT, T.STONE, T.COAL, T.IRON, T.GOLD, T.TREE, T.PLANK, T.WORKBENCH, T.TORCH].forEach(function (t) {
    var id = 't' + t;
    ITEM[id] = { name: TILEINFO[t].name, kind: 'tile', tile: t, color: TILEINFO[t].color };
    TILE_ITEM[t] = id;
  });

  /* ------------------------------- 噪声 ------------------------------- */
  function hash1(x, seed) {
    var h = (Math.imul(x | 0, 374761393) + Math.imul(seed | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function hash2(x, y, seed) {
    var h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function noise1(x, seed) {
    var i = Math.floor(x), f = x - i;
    var a = hash1(i, seed), b = hash1(i + 1, seed);
    return a + (b - a) * smooth(f);
  }
  function noise2(x, y, seed) {
    var ix = Math.floor(x), iy = Math.floor(y);
    var fx = x - ix, fy = y - iy;
    var a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed);
    var c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
    var u = smooth(fx), v = smooth(fy);
    return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
  }
  function fbm(x, seed, oct) {
    var v = 0, amp = 0.5, freq = 1;
    for (var i = 0; i < (oct || 4); i++) {
      v += noise1(x * freq, seed + i * 97) * amp;
      amp *= 0.5; freq *= 2;
    }
    return v;
  }

  /* ----------------------------- 世界生成 ----------------------------- */
  function createWorld(seed) {
    seed = seed || ((Math.random() * 1e9) | 0);
    var tiles = new Uint8Array(WORLD_W * WORLD_H);
    var light = new Float32Array(WORLD_W * WORLD_H);
    var surface = new Int16Array(WORLD_W);
    var x, y, i;

    // 1) 1D 噪声定地表起伏（fbm 归一化后展开到 ±20 格）
    for (x = 0; x < WORLD_W; x++) {
      var h = 42 + (fbm(x * 0.018, seed, 4) - 0.5) * 76;
      surface[x] = Math.max(8, Math.min(WORLD_H - 40, Math.round(h)));
    }

    // 2) 填充土石
    for (x = 0; x < WORLD_W; x++) {
      for (y = 0; y < WORLD_H; y++) {
        var idx = y * WORLD_W + x;
        if (y < surface[x]) { tiles[idx] = T.AIR; continue; }
        if (y === surface[x]) { tiles[idx] = T.GRASS; continue; }
        if (y > surface[x] + 6 && y < WORLD_H - 2) tiles[idx] = T.STONE;
        else tiles[idx] = T.DIRT;
        if (y >= WORLD_H - 2) tiles[idx] = T.BEDROCK;
      }
    }

    // 3) 2D 噪声掏洞穴
    for (x = 1; x < WORLD_W - 1; x++) {
      for (y = surface[x] + 4; y < WORLD_H - 3; y++) {
        var n = noise2(x * 0.09, y * 0.12, seed + 777);
        if (n > 0.62) {
          var ci = y * WORLD_W + x;
          if (tiles[ci] !== T.BEDROCK) tiles[ci] = T.AIR;
        }
      }
    }

    // 4) 随机游走画矿脉：煤浅、铁中、金深
    veins(tiles, surface, seed, T.COAL, 150, 8, 0.10, 0.55);
    veins(tiles, surface, seed + 11, T.IRON, 90, 6, 0.30, 0.85);
    veins(tiles, surface, seed + 23, T.GOLD, 45, 4, 0.55, 1.00);

    // 5) 种树
    for (x = 4; x < WORLD_W - 4; x++) {
      if (hash1(x, seed + 5) > 0.93 && tiles[surface[x] * WORLD_W + x] === T.GRASS) {
        var trunk = 4 + Math.floor(hash1(x, seed + 6) * 4);
        for (var t = 1; t <= trunk; t++) {
          var ty = surface[x] - t;
          if (ty > 0) tiles[ty * WORLD_W + x] = T.TREE;
        }
        var top = surface[x] - trunk;
        for (var dx = -2; dx <= 2; dx++) {
          for (var dy = -2; dy <= 1; dy++) {
            var lx = x + dx, ly = top + dy;
            if (lx > 0 && lx < WORLD_W && ly > 0 && Math.abs(dx) + Math.abs(dy) <= 3) {
              var li = ly * WORLD_W + lx;
              if (tiles[li] === T.AIR) tiles[li] = T.LEAF;
            }
          }
        }
      }
    }

    return { tiles: tiles, light: light, surface: surface, seed: seed, w: WORLD_W, h: WORLD_H };
  }

  function veins(tiles, surface, seed, type, count, size, minDepth, maxDepth) {
    for (var i = 0; i < count; i++) {
      var x = 3 + Math.floor(hash1(i * 3, seed) * (WORLD_W - 6));
      var span = surface[x] + Math.floor((WORLD_H - surface[x]) * (minDepth + hash1(i * 7, seed) * (maxDepth - minDepth)));
      var y = Math.min(WORLD_H - 4, span);
      var len = 3 + Math.floor(hash1(i * 11, seed) * size);
      for (var s = 0; s < len; s++) {
        if (x < 1 || x >= WORLD_W - 1 || y < 1 || y >= WORLD_H - 1) break;
        var idx = y * WORLD_W + x;
        if (tiles[idx] === T.STONE || tiles[idx] === T.DIRT) tiles[idx] = type;
        var dir = hash1(i * 13 + s, seed) > 0.5 ? 1 : -1;
        y += hash1(i * 17 + s, seed) > 0.35 ? -1 : 1;
        if (hash1(i * 19 + s, seed) > 0.6) x += dir;
      }
    }
  }

  /* ------------------------------- 物理 ------------------------------- */
  function tileAt(world, tx, ty) {
    if (tx < 0 || tx >= WORLD_W || ty < 0 || ty >= WORLD_H) return T.BEDROCK;
    return world.tiles[ty * WORLD_W + tx];
  }
  function isSolid(world, tx, ty) {
    var t = tileAt(world, tx, ty);
    var info = TILEINFO[t];
    return !!(info && info.solid);
  }

  // AABB 与图块网格碰撞：先 X 后 Y 分轴解算
  function collides(world, x, y, w, h) {
    var x0 = Math.floor(x / TILE), x1 = Math.floor((x + w - 1) / TILE);
    var y0 = Math.floor(y / TILE), y1 = Math.floor((y + h - 1) / TILE);
    for (var ty = y0; ty <= y1; ty++) {
      for (var tx = x0; tx <= x1; tx++) {
        if (isSolid(world, tx, ty)) return true;
      }
    }
    return false;
  }

  function moveEntity(world, e, dt) {
    var dx = e.vx * dt;
    var dy = e.vy * dt;

    // X 轴
    e.x += dx;
    if (collides(world, e.x, e.y, e.w, e.h)) {
      e.x -= dx;
      e.vx = 0;
      e.hitWall = true;
    } else {
      e.hitWall = false;
    }

    // Y 轴
    e.y += dy;
    e.onGround = false;
    if (collides(world, e.x, e.y, e.w, e.h)) {
      e.y -= dy;
      if (dy > 0) e.onGround = true;
      e.vy = 0;
    }
    return e;
  }

  /* ------------------------------- 游戏 ------------------------------- */
  function createGame(opts) {
    opts = opts || {};
    var seed = opts.seed || 20261101;
    var world = createWorld(seed);

    var player = {
      x: (WORLD_W / 2) * TILE,
      y: (world.surface[Math.floor(WORLD_W / 2)] - 4) * TILE,
      w: 12, h: 26,
      vx: 0, vy: 0,
      onGround: false, hitWall: false,
      hp: 100, maxHp: 100,
      coins: 0,
      facing: 1,
      hurtTimer: 0
    };

    var state = {
      world: world,
      player: player,
      zombies: [],
      time: DAY_LENGTH * 0.34,
      day: 1,
      inventory: new Array(10),
      selected: 0,
      mining: { tx: -1, ty: -1, progress: 0 },
      attackCd: 0,
      message: '',
      messageTimer: 0,
      paused: false
    };

    // 起始物品：木镐 + 木剑 + 少量火把
    state.inventory[0] = { id: 'pick1', count: 1 };
    state.inventory[1] = { id: 'sword1', count: 1 };
    state.inventory[2] = { id: 't' + T.TORCH, count: 8 };

    function say(msg, sec) {
      state.message = msg;
      state.messageTimer = sec || 2.2;
    }

    /* -------------------------- 昼夜与光照 -------------------------- */
    function skyBrightness() {
      var phase = (state.time % DAY_LENGTH) / DAY_LENGTH;
      // phase=0 深夜、0.5 正午；用余弦曲线得到平滑日出日落
      var s = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
      return Math.max(0.07, Math.min(1, s));
    }
    function isNight() {
      return skyBrightness() < 0.32;
    }

    /* ---------------------------- 背包 ---------------------------- */
    function addItem(id, n) {
      n = n || 1;
      var inv = state.inventory;
      for (var i = 0; i < inv.length; i++) {
        if (inv[i] && inv[i].id === id) { inv[i].count += n; return true; }
      }
      for (var j = 0; j < inv.length; j++) {
        if (!inv[j]) { inv[j] = { id: id, count: n }; return true; }
      }
      say('背包已满');
      return false;
    }
    function countItem(id) {
      var c = 0;
      state.inventory.forEach(function (s) { if (s && s.id === id) c += s.count; });
      return c;
    }
    function consume(id, n) {
      var left = n;
      for (var i = 0; i < state.inventory.length && left > 0; i++) {
        var s = state.inventory[i];
        if (s && s.id === id) {
          var take = Math.min(s.count, left);
          s.count -= take; left -= take;
          if (s.count <= 0) state.inventory[i] = null;
        }
      }
    }
    function held() {
      var s = state.inventory[state.selected];
      return s ? { slot: s, def: ITEM[s.id] } : null;
    }

    /* ---------------------------- 合成 ---------------------------- */
    var RECIPES = [
      { out: 't' + T.PLANK, n: 4, cost: [['t' + T.TREE, 1]], bench: false, label: '木板 x4' },
      { out: 't' + T.WORKBENCH, n: 1, cost: [['t' + T.TREE, 10]], bench: false, label: '工作台' },
      { out: 't' + T.TORCH, n: 4, cost: [['t' + T.TREE, 1], ['t' + T.COAL, 1]], bench: false, label: '火把 x4' },
      { out: 'pick2', n: 1, cost: [['t' + T.TREE, 3], ['t' + T.STONE, 10]], bench: true, label: '石镐' },
      { out: 'pick3', n: 1, cost: [['t' + T.TREE, 3], ['t' + T.IRON, 12]], bench: true, label: '铁镐' },
      { out: 'pick4', n: 1, cost: [['t' + T.TREE, 3], ['t' + T.GOLD, 15]], bench: true, label: '金镐' },
      { out: 'sword2', n: 1, cost: [['t' + T.TREE, 3], ['t' + T.STONE, 8]], bench: true, label: '石剑' },
      { out: 'sword3', n: 1, cost: [['t' + T.TREE, 3], ['t' + T.IRON, 10]], bench: true, label: '铁剑' },
      { out: 'sword4', n: 1, cost: [['t' + T.TREE, 3], ['t' + T.GOLD, 12]], bench: true, label: '金剑' },
      { out: 't' + T.PLANK, n: 6, cost: [['t' + T.STONE, 2]], bench: false, label: '木板 x6（碎石压制）' }
    ];

    function nearWorkbench() {
      var px = Math.floor((player.x + player.w / 2) / TILE);
      var py = Math.floor((player.y + player.h / 2) / TILE);
      for (var dy = -3; dy <= 3; dy++) {
        for (var dx = -4; dx <= 4; dx++) {
          if (tileAt(world, px + dx, py + dy) === T.WORKBENCH) return true;
        }
      }
      return false;
    }
    function canCraft(r) {
      if (r.bench && !nearWorkbench()) return false;
      for (var i = 0; i < r.cost.length; i++) {
        if (countItem(r.cost[i][0]) < r.cost[i][1]) return false;
      }
      return true;
    }
    function craft(r) {
      if (!canCraft(r)) { say(r.bench ? '需要靠近工作台且材料足够' : '材料不足'); return false; }
      r.cost.forEach(function (c) { consume(c[0], c[1]); });
      addItem(r.out, r.n);
      say('合成 ' + ITEM[r.out].name);
      return true;
    }

    /* ---------------------------- 挖掘/放置 ---------------------------- */
    function mineAt(tx, ty, dt) {
      var t = tileAt(world, tx, ty);
      var info = TILEINFO[t];
      if (!info || t === T.BEDROCK) return;
      var h = held();
      if (!h || h.def.kind !== 'pick') { say('需要手持镐子'); return; }
      if (h.def.level < info.pick) { say(info.name + ' 需要 ' + info.pick + ' 级镐'); return; }

      if (state.mining.tx !== tx || state.mining.ty !== ty) {
        state.mining.tx = tx; state.mining.ty = ty; state.mining.progress = 0;
      }
      state.mining.progress += dt * (1.2 + h.def.level * 0.55);
      if (state.mining.progress >= info.hard) {
        world.tiles[ty * WORLD_W + tx] = T.AIR;
        if (info.drop >= 0) addItem(TILE_ITEM[info.drop], 1);
        // 树叶破坏时上面悬空的树也可能掉落，简化：仅记录
        state.mining.progress = 0;
        state.mining.tx = -1; state.mining.ty = -1;
      }
    }

    function placeAt(tx, ty) {
      if (tx < 1 || tx >= WORLD_W - 1 || ty < 1 || ty >= WORLD_H - 1) return;
      if (tileAt(world, tx, ty) !== T.AIR) return;
      var h = held();
      if (!h || h.def.kind !== 'tile') return;
      // 火把可悬空，其它需相邻支撑
      if (h.def.tile !== T.TORCH) {
        var support = isSolid(world, tx - 1, ty) || isSolid(world, tx + 1, ty) ||
                      isSolid(world, tx, ty - 1) || isSolid(world, tx, ty + 1);
        if (!support) { say('需要相邻方块支撑'); return; }
      }
      // 不能放在玩家身上
      var px0 = Math.floor(player.x / TILE), px1 = Math.floor((player.x + player.w - 1) / TILE);
      var py0 = Math.floor(player.y / TILE), py1 = Math.floor((player.y + player.h - 1) / TILE);
      if (tx >= px0 && tx <= px1 && ty >= py0 && ty <= py1) return;

      world.tiles[ty * WORLD_W + tx] = h.def.tile;
      h.slot.count -= 1;
      if (h.slot.count <= 0) state.inventory[state.selected] = null;
    }

    /* ---------------------------- 僵尸 ---------------------------- */
    function spawnZombie() {
      var side = Math.random() > 0.5 ? 1 : -1;
      var sx = player.x + side * (420 + Math.random() * 150);
      var sy = player.y - 40 - Math.random() * 80;
      var z = {
        x: sx, y: sy, w: 12, h: 26,
        vx: 0, vy: 0,
        onGround: false, hitWall: false,
        hp: 40 + state.day * 6,
        maxHp: 40 + state.day * 6,
        burn: 0, hurt: 0, facing: -side
      };
      state.zombies.push(z);
    }

    function updateZombies(dt) {
      var night = isNight();
      var maxZ = night ? Math.min(6, 2 + Math.floor(state.day / 2)) : 0;

      if (night && state.zombies.length < maxZ && Math.random() < dt * 0.55) spawnZombie();

      for (var i = state.zombies.length - 1; i >= 0; i--) {
        var z = state.zombies[i];

        if (!night) {
          z.burn += dt;
          if (z.burn > 2.2) { state.zombies.splice(i, 1); continue; }
        } else {
          z.burn = 0;
        }

        var dx = (player.x + player.w / 2) - (z.x + z.w / 2);
        z.facing = dx >= 0 ? 1 : -1;
        z.vx = z.facing * 62;

        // 遇墙或被挡住就跳
        if (z.onGround && z.hitWall) z.vy = -520;
        // 玩家在上方也跳
        if (z.onGround && player.y + player.h < z.y - 6 && Math.random() < dt * 2.2) z.vy = -520;

        z.vy = Math.min(MAX_FALL, z.vy + GRAVITY * dt);
        moveEntity(world, z, dt);

        // 接触伤害
        if (rectsOverlap(z, player) && player.hurtTimer <= 0) {
          player.hp -= 8 + state.day;
          player.hurtTimer = 0.85;
          say('被僵尸击中 -' + (8 + state.day));
          if (player.hp <= 0) respawn();
        }
      }
    }

    function rectsOverlap(a, b) {
      return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    }

    function attack() {
      if (state.attackCd > 0) return;
      var h = held();
      if (!h || h.def.kind !== 'sword') return;
      state.attackCd = 0.35;
      var reach = 34;
      var cx = player.x + player.w / 2 + player.facing * reach * 0.6;
      var cy = player.y + player.h / 2;
      var hitAny = false;
      for (var i = state.zombies.length - 1; i >= 0; i--) {
        var z = state.zombies[i];
        var zx = z.x + z.w / 2, zy = z.y + z.h / 2;
        if (Math.abs(zx - cx) < reach && Math.abs(zy - cy) < 30) {
          z.hp -= h.def.dmg;
          z.hurt = 0.18;
          hitAny = true;
          if (z.hp <= 0) {
            state.zombies.splice(i, 1);
            var gain = 3 + Math.floor(Math.random() * 5);
            player.coins += gain;
            say('击杀僵尸 +' + gain + ' 金币');
          }
        }
      }
      if (!hitAny) say('挥空');
    }

    function respawn() {
      player.hp = player.maxHp;
      player.x = (WORLD_W / 2) * TILE;
      player.y = (world.surface[Math.floor(WORLD_W / 2)] - 4) * TILE;
      player.vx = 0; player.vy = 0;
      say('你倒下了，已回到出生点');
    }

    /* ---------------------------- 更新 ---------------------------- */
    function update(dt, input) {
      input = input || {};
      state.time += dt;

      var newDay = 1 + Math.floor(state.time / DAY_LENGTH);
      if (newDay !== state.day) {
        state.day = newDay;
        say('第 ' + state.day + ' 天');
      }

      if (state.messageTimer > 0) state.messageTimer -= dt;
      if (player.hurtTimer > 0) player.hurtTimer -= dt;
      if (state.attackCd > 0) state.attackCd -= dt;

      // 玩家水平移动
      var speed = 130;
      if (input.left) { player.vx = -speed; player.facing = -1; }
      else if (input.right) { player.vx = speed; player.facing = 1; }
      else player.vx = 0;

      if (input.jump && player.onGround) {
        player.vy = -520;
        player.onGround = false;
      }

      player.vy = Math.min(MAX_FALL, player.vy + GRAVITY * dt);
      moveEntity(world, player, dt);

      // 掉出世界保护
      if (player.y > WORLD_H * TILE) respawn();

      updateZombies(dt);
    }

    /* ---------------------------- 渲染 ---------------------------- */
    function drawTile(ctx, t, sx, sy, tx, ty) {
      if (t === T.AIR) return;
      var info = TILEINFO[t];
      var base = info.color;
      ctx.fillStyle = base;
      ctx.fillRect(sx, sy, TILE, TILE);

      // 哈希驱动的伪随机纹理像素
      var n = hash2(tx, ty, 7);
      ctx.fillStyle = 'rgba(0,0,0,' + (0.05 + n * 0.10).toFixed(3) + ')';
      var px = Math.floor(n * 8);
      ctx.fillRect(sx + px, sy + ((tx * 7 + ty * 3) % 8), 3, 3);
      ctx.fillStyle = 'rgba(255,255,255,' + (0.03 + n * 0.05).toFixed(3) + ')';
      ctx.fillRect(sx + ((px + 5) % 12), sy + ((ty * 5) % 12), 2, 2);

      // 顶面高光，制造层次
      if (t === T.GRASS) {
        ctx.fillStyle = 'rgba(120,220,140,0.35)';
        ctx.fillRect(sx, sy, TILE, 3);
      }
      if (t === T.TORCH) {
        ctx.fillStyle = '#6b4a22';
        ctx.fillRect(sx + 7, sy + 6, 2, 10);
        ctx.fillStyle = '#ffcf6b';
        ctx.fillRect(sx + 6, sy + 2, 4, 5);
      }
      if (t === T.WORKBENCH) {
        ctx.fillStyle = '#6d4f2c';
        ctx.fillRect(sx + 2, sy + 9, 12, 5);
        ctx.fillStyle = '#c8a06a';
        ctx.fillRect(sx + 2, sy + 5, 12, 4);
      }
    }

    function drawHumanoid(ctx, e, sx, sy, bodyColor, isZombie) {
      var w = e.w, h = e.h;
      ctx.fillStyle = bodyColor;
      ctx.fillRect(sx + 2, sy + 8, w - 4, h - 12);       // 躯干
      ctx.fillStyle = '#e8c9a0';
      ctx.fillRect(sx + 2, sy, w - 4, 8);                 // 头
      ctx.fillStyle = '#1b2330';
      var eye = e.facing > 0 ? sx + w - 6 : sx + 3;
      ctx.fillRect(eye, sy + 3, 2, 2);                    // 眼
      ctx.fillStyle = bodyColor;
      ctx.fillRect(sx, sy + 10, 2, 8);                    // 手臂
      ctx.fillRect(sx + w - 2, sy + 10, 2, 8);
      ctx.fillRect(sx + 2, sy + h - 4, 4, 4);             // 腿
      ctx.fillRect(sx + w - 6, sy + h - 4, 4, 4);
      if (isZombie) {
        ctx.fillStyle = 'rgba(150,220,140,0.5)';
        ctx.fillRect(sx + 2, sy, w - 4, 3);
      }
    }

    function drawDarkness(ctx, cam, vw, vh, torchList) {
      var sky = skyBrightness();
      var tx0 = Math.floor(cam.x / TILE), ty0 = Math.floor(cam.y / TILE);
      var txc = Math.ceil(vw / TILE) + 1, tyc = Math.ceil(vh / TILE) + 1;
      var pxc = player.x + player.w / 2, pyc = player.y + player.h / 2;

      for (var ty = ty0; ty <= ty0 + tyc; ty++) {
        for (var tx = tx0; tx <= tx0 + txc; tx++) {
          var wx = tx * TILE + TILE / 2, wy = ty * TILE + TILE / 2;

          // 天空光：越深越暗
          var depth = Math.max(0, ty - world.surface[Math.max(0, Math.min(WORLD_W - 1, tx))]);
          var skyAt = sky * Math.max(0, 1 - depth / 13);

          var lit = skyAt;

          // 火把光晕
          for (var i = 0; i < torchList.length; i++) {
            var t2 = torchList[i];
            var dx = (t2.x - wx), dy = (t2.y - wy);
            var d2 = dx * dx + dy * dy;
            var R = 92;
            if (d2 < R * R) lit = Math.max(lit, 0.95 * (1 - Math.sqrt(d2) / R));
          }
          // 玩家微光
          var pdx = pxc - wx, pdy = pyc - wy;
          var pd2 = pdx * pdx + pdy * pdy;
          if (pd2 < 92 * 92) lit = Math.max(lit, 0.78 * (1 - Math.sqrt(pd2) / 92));

          var alpha = Math.max(0, Math.min(0.93, 1 - lit));
          if (alpha <= 0.02) continue;
          ctx.fillStyle = 'rgba(2,4,10,' + alpha.toFixed(3) + ')';
          ctx.fillRect(tx * TILE - cam.x, ty * TILE - cam.y, TILE + 1, TILE + 1);
        }
      }
    }

    function render(ctx, vw, vh) {
      var cam = {
        x: Math.max(0, Math.min(WORLD_W * TILE - vw, player.x + player.w / 2 - vw / 2)),
        y: Math.max(0, Math.min(WORLD_H * TILE - vh, player.y + player.h / 2 - vh / 2))
      };

      // 天空渐变
      var sky = skyBrightness();
      var g = ctx.createLinearGradient(0, 0, 0, vh);
      if (sky > 0.5) {
        g.addColorStop(0, 'rgb(' + Math.round(90 + sky * 60) + ',' + Math.round(150 + sky * 60) + ',' + Math.round(220 + sky * 30) + ')');
        g.addColorStop(1, 'rgb(' + Math.round(180 + sky * 50) + ',' + Math.round(205 + sky * 40) + ',' + Math.round(235 + sky * 20) + ')');
      } else {
        g.addColorStop(0, 'rgb(' + Math.round(8 + sky * 20) + ',' + Math.round(12 + sky * 26) + ',' + Math.round(30 + sky * 40) + ')');
        g.addColorStop(1, 'rgb(' + Math.round(14 + sky * 24) + ',' + Math.round(20 + sky * 28) + ',' + Math.round(42 + sky * 36) + ')');
      }
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, vw, vh);

      // 星星
      if (sky < 0.35) {
        for (var s = 0; s < 60; s++) {
          var sx = (hash1(s, 3) * vw + cam.x * 0.15) % vw;
          var sy = hash1(s, 9) * vh * 0.55;
          ctx.fillStyle = 'rgba(255,255,255,' + ((0.35 + hash1(s, 5) * 0.55) * (1 - sky / 0.35)).toFixed(3) + ')';
          ctx.fillRect(sx, sy, 2, 2);
        }
      }

      // 日月
      var phase = (state.time % DAY_LENGTH) / DAY_LENGTH;
      var ang = phase * Math.PI * 2 - Math.PI / 2;
      var orbitX = vw / 2 + Math.cos(ang) * vw * 0.42;
      var orbitY = vh * 0.52 + Math.sin(ang) * vh * 0.42;
      ctx.fillStyle = sky > 0.4 ? 'rgba(255,238,170,0.95)' : 'rgba(232,238,255,0.9)';
      ctx.beginPath();
      ctx.arc(orbitX, orbitY, sky > 0.4 ? 22 : 16, 0, Math.PI * 2);
      ctx.fill();

      // 图块
      var tx0 = Math.floor(cam.x / TILE), ty0 = Math.floor(cam.y / TILE);
      var txc = Math.ceil(vw / TILE) + 1, tyc = Math.ceil(vh / TILE) + 1;
      var torches = [];

      for (var ty = ty0; ty <= ty0 + tyc; ty++) {
        for (var tx = tx0; tx <= tx0 + txc; tx++) {
          var t = tileAt(world, tx, ty);
          if (t === T.AIR) continue;
          drawTile(ctx, t, tx * TILE - cam.x, ty * TILE - cam.y, tx, ty);
          if (t === T.TORCH) torches.push({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 });
        }
      }

      // 僵尸
      state.zombies.forEach(function (z) {
        drawHumanoid(ctx, z, z.x - cam.x, z.y - cam.y, z.hurt > 0 ? '#ff8a8a' : '#4f6b4a', true);
        // 血条
        var w = 20;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(z.x - cam.x - 4, z.y - cam.y - 8, w, 3);
        ctx.fillStyle = '#6ee27a';
        ctx.fillRect(z.x - cam.x - 4, z.y - cam.y - 8, w * Math.max(0, z.hp / z.maxHp), 3);
      });

      // 玩家
      drawHumanoid(ctx, player, player.x - cam.x, player.y - cam.y,
        player.hurtTimer > 0 ? '#ff9b9b' : '#5b8def', false);

      // 火光与暗部
      drawDarkness(ctx, cam, vw, vh, torches);

      // 挖掘进度
      if (state.mining.tx >= 0 && state.mining.progress > 0) {
        var mx = state.mining.tx * TILE - cam.x, my = state.mining.ty * TILE - cam.y;
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 1;
        ctx.strokeRect(mx + 0.5, my + 0.5, TILE - 1, TILE - 1);
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        var info = TILEINFO[tileAt(world, state.mining.tx, state.mining.ty)];
        if (info) ctx.fillRect(mx, my + TILE - 3, TILE * Math.min(1, state.mining.progress / info.hard), 3);
      }

      drawHUD(ctx, vw, vh);
    }

    function drawHUD(ctx, vw, vh) {
      // 红心生命条
      var hearts = 10;
      var per = player.maxHp / hearts;
      for (var i = 0; i < hearts; i++) {
        var hx = 16 + i * 22, hy = 16;
        var filled = Math.max(0, Math.min(1, (player.hp - i * per) / per));
        ctx.fillStyle = '#ff5a6e';
        ctx.beginPath();
        ctx.arc(hx + 5, hy + 6, 4, 0, Math.PI * 2);
        ctx.arc(hx + 12, hy + 6, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(hx + 1, hy + 8);
        ctx.lineTo(hx + 8.5, hy + 15);
        ctx.lineTo(hx + 16, hy + 8);
        ctx.closePath();
        ctx.fill();
        if (filled < 1) {
          ctx.fillStyle = 'rgba(10,12,18,0.82)';
          ctx.fillRect(hx + 12 * filled, hy, 18, 18);
        }
      }

      // 快捷栏
      var slot = 34, gap = 6;
      var total = 10 * slot + 9 * gap;
      var startX = (vw - total) / 2;
      var y = vh - slot - 18;
      for (var k = 0; k < 10; k++) {
        var x = startX + k * (slot + gap);
        ctx.fillStyle = 'rgba(8,11,18,0.78)';
        ctx.fillRect(x, y, slot, slot);
        ctx.strokeStyle = k === state.selected ? 'rgba(140,180,255,0.95)' : 'rgba(255,255,255,0.18)';
        ctx.lineWidth = k === state.selected ? 2 : 1;
        ctx.strokeRect(x + 0.5, y + 0.5, slot - 1, slot - 1);

        var it = state.inventory[k];
        if (it) {
          var def = ITEM[it.id];
          if (def.kind === 'tile') {
            ctx.fillStyle = def.color;
            ctx.fillRect(x + 8, y + 8, 18, 18);
          } else {
            ctx.fillStyle = def.color;
            ctx.fillRect(x + 12, y + 6, 3, 22);      // 柄
            ctx.fillRect(x + 6, y + 6, 16, 5);       // 头
          }
          if (it.count > 1) {
            ctx.fillStyle = '#fff';
            ctx.font = '10px monospace';
            ctx.textAlign = 'right';
            ctx.fillText(String(it.count), x + slot - 3, y + slot - 4);
          }
        }
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.font = '9px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(String((k + 1) % 10), x + 3, y + 11);
      }

      // 金币与天数
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.arc(vw - 108, 22, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '13px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(String(player.coins), vw - 96, 27);

      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = '13px monospace';
      ctx.textAlign = 'right';
      ctx.fillText('第 ' + state.day + ' 天 · ' + (isNight() ? '夜晚' : '白天'), vw - 16, 27);

      // 提示消息
      if (state.messageTimer > 0) {
        ctx.fillStyle = 'rgba(255,255,255,' + Math.min(1, state.messageTimer) + ')';
        ctx.font = '14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(state.message, vw / 2, vh - 76);
      }

      // 手持物提示
      var h = held();
      if (h) {
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.font = '12px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(h.def.name, 16, vh - slot - 32);
      }
    }

    /* ---------------------------- 鼠标行为 ---------------------------- */
    function handleMouse(worldX, worldY, dt) {
      var tx = Math.floor(worldX / TILE), ty = Math.floor(worldY / TILE);
      var h = held();
      if (!h) return;
      if (h.def.kind === 'pick') mineAt(tx, ty, dt);
      else if (h.def.kind === 'tile') placeAt(tx, ty);
      else if (h.def.kind === 'sword') attack();
    }

    return {
      world: world,
      player: player,
      state: state,
      update: update,
      render: render,
      handleMouse: handleMouse,
      addItem: addItem,
      countItem: countItem,
      craft: craft,
      canCraft: canCraft,
      RECIPES: RECIPES,
      nearWorkbench: nearWorkbench,
      skyBrightness: skyBrightness,
      isNight: isNight,
      spawnZombie: spawnZombie,
      moveEntity: moveEntity,
      collides: collides,
      tileAt: tileAt,
      TILE: TILE,
      T: T,
      ITEM: ITEM
    };
  }

  /* ------------------------------ 引导 ------------------------------ */
  function boot() {
    var canvas = document.getElementById('game');
    var ctx = canvas.getContext('2d');
    var game = createGame({ seed: (Date.now() % 100000) | 0 });
    // 暴露给控制台便于调试与验收
    window.__g = game;
    var input = { left: false, right: false, jump: false };
    var mouse = { x: 0, y: 0, down: false };
    var panel = document.getElementById('panel');
    var panelBox = document.getElementById('panelBox');
    var panelMode = null;

    function resize() {
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    window.addEventListener('resize', resize);
    resize();

    window.addEventListener('keydown', function (e) {
      var k = e.key.toLowerCase();
      if (k === 'a' || k === 'arrowleft') input.left = true;
      if (k === 'd' || k === 'arrowright') input.right = true;
      if (k === ' ' || k === 'w' || k === 'arrowup') { input.jump = true; e.preventDefault(); }
      if (k >= '1' && k <= '9') game.state.selected = Number(k) - 1;
      if (k === '0') game.state.selected = 9;
      if (k === 'e' || k === 'tab') { e.preventDefault(); togglePanel('craft'); }
      if (k === 'h') togglePanel('help');
      if (k === 'escape') togglePanel(null);
    });
    window.addEventListener('keyup', function (e) {
      var k = e.key.toLowerCase();
      if (k === 'a' || k === 'arrowleft') input.left = false;
      if (k === 'd' || k === 'arrowright') input.right = false;
      if (k === ' ' || k === 'w' || k === 'arrowup') input.jump = false;
    });

    canvas.addEventListener('mousemove', function (e) {
      mouse.x = e.clientX; mouse.y = e.clientY;
    });
    canvas.addEventListener('mousedown', function (e) {
      if (e.button === 0) mouse.down = true;
    });
    window.addEventListener('mouseup', function () { mouse.down = false; });
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      var d = e.deltaY > 0 ? 1 : -1;
      game.state.selected = (game.state.selected + d + 10) % 10;
    }, { passive: false });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    function togglePanel(mode) {
      if (panelMode === mode) mode = null;
      panelMode = mode;
      if (!mode) { panel.classList.remove('show'); return; }
      panel.classList.add('show');
      if (mode === 'help') {
        panelBox.innerHTML =
          '<h2>操作说明</h2>' +
          '<p class="sub">泰拉瑞亚式 2D 沙盒生存 · 纯 Canvas 实现</p>' +
          '<div class="keys">' +
          '<div><b>A / D</b>左右移动</div>' +
          '<div><b>空格 / W</b>跳跃</div>' +
          '<div><b>鼠标左键</b>持镐挖掘 · 持方块放置 · 持剑攻击</div>' +
          '<div><b>1 ~ 0 / 滚轮</b>切换快捷栏</div>' +
          '<div><b>E / Tab</b>打开合成面板</div>' +
          '<div><b>H</b>帮助 · <b>Esc</b>关闭</div>' +
          '</div>';
      } else {
        renderCraftPanel();
      }
    }

    function renderCraftPanel() {
      var html = '<h2>合成</h2><p class="sub">' +
        (game.nearWorkbench() ? '已靠近工作台，可合成高级物品' : '靠近工作台可解锁高级配方') + '</p>';
      game.RECIPES.forEach(function (r, i) {
        var ok = game.canCraft(r);
        var costText = r.cost.map(function (c) {
          return game.ITEM[c[0]].name + ' ×' + c[1];
        }).join('，');
        html += '<div class="recipe"><div><div>' + game.ITEM[r.out].name +
          (r.n > 1 ? ' ×' + r.n : '') + (r.bench ? ' <span style="color:#8fb4ff">[工作台]</span>' : '') +
          '</div><div class="cost">' + costText + '</div></div>' +
          '<button data-i="' + i + '"' + (ok ? '' : ' disabled') + '>合成</button></div>';
      });
      html += '<p class="sub" style="margin-top:12px">按 E 或 Esc 关闭</p>';
      panelBox.innerHTML = html;
      panelBox.querySelectorAll('button[data-i]').forEach(function (b) {
        b.addEventListener('click', function () {
          game.craft(game.RECIPES[Number(b.dataset.i)]);
          renderCraftPanel();
        });
      });
    }

    // 固定时间步 60Hz
    var STEP = 1 / 60;
    var acc = 0;
    var last = performance.now();

    function loop(now) {
      var dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      acc += dt;

      var guard = 0;
      while (acc >= STEP && guard++ < 5) {
        game.update(STEP, panelMode ? { left: false, right: false, jump: false } : input);
        if (mouse.down && !panelMode) {
          var wx = mouse.x + Math.max(0, Math.min(WORLD_W * TILE - canvas.clientWidth,
            game.player.x + game.player.w / 2 - canvas.clientWidth / 2));
          var wy = mouse.y + Math.max(0, Math.min(WORLD_H * TILE - canvas.clientHeight,
            game.player.y + game.player.h / 2 - canvas.clientHeight / 2));
          game.handleMouse(wx, wy, STEP);
        }
        acc -= STEP;
      }

      game.render(ctx, canvas.clientWidth, canvas.clientHeight);
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  /* ------------------------------ 导出 ------------------------------ */
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      createGame: createGame,
      createWorld: createWorld,
      noise1: noise1, noise2: noise2, fbm: fbm,
      TILE: TILE, T: T, TILEINFO: TILEINFO, ITEM: ITEM,
      DAY_LENGTH: DAY_LENGTH
    };
  }

  if (typeof document !== 'undefined' && !global.__HEADLESS__) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
