import { Game } from './game.js';
import { Renderer } from './renderer.js';
import { UI } from './ui.js';
import { Input } from './input.js';
import { loadGame } from './save.js';
import { checkStripeReturn } from './iap.js';
import { CROPS, TILE_SIZE, BUILDINGS, SEASONS, SEASON_ICONS } from './constants.js';
import * as audio from './audio.js';
import * as particles from './particles.js';

let game, renderer, ui, input;
let currentView = 'farm';
let pendingFurniture = null;
let nearbyNpc = null;
let lastTime = 0;
let saveInterval = 0;
let leafTimer = 0;
let rafId = 0;

// A backgrounded tab freezes rAF; on return the first frame's elapsed time
// can be huge. Cap it so we never inject more than one slow frame of physics
// at once (offline progression is reconciled separately on load).
const MAX_FRAME_MS = 100;

function init() {
  const saved = loadGame();
  game = saved ? Game.fromSave(saved) : new Game();

  const canvas = document.getElementById('game-canvas');
  renderer = new Renderer(canvas);
  ui = new UI();
  input = new Input();
  input.bindCanvas(canvas);

  checkStripeReturn(game, ui);
  setupToolBar();
  setupSleepBtn();
  setupTalkBtn();
  setupMuteBtn();
  setupMobileControls();
  setupSeedCarousel();

  // Snap camera to player immediately (avoid lerp-from-origin black screen on first frame)
  snapCamera();

  // First-run tutorial
  if (!game.tutorialSeen) {
    ui.openTutorial(() => {
      game.tutorialSeen = true;
      game.autoSave();
    });
  }

  // Daily login gem reward
  const today = new Date().toDateString();
  if (game.lastLoginDate !== today) {
    game.lastLoginDate = today;
    game.gems += 3;
    game.autoSave();
    ui.notify('💎 Daily login bonus: +3 gems!', 3000);
  }

  // Pause the loop while the tab is hidden; resume cleanly on return so the
  // first visible frame starts a fresh delta instead of a multi-minute jump.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    } else if (rafId === 0) {
      lastTime = 0;
      rafId = requestAnimationFrame(loop);
    }
  });

  rafId = requestAnimationFrame(loop);
}

let _firstFrame = true;

function loop(timestamp) {
  const dt = lastTime === 0 ? 0 : Math.min(timestamp - lastTime, MAX_FRAME_MS);
  lastTime = timestamp;

  // On the very first rendered frame, the canvas has its true CSS size — snap camera now.
  if (_firstFrame) {
    renderer._resize();
    snapCamera();
    _firstFrame = false;
  }

  input.update();
  processInput(dt);
  game.tick(dt);
  particles.tick(dt);

  // Ambient drifting leaves on the farm (skip Winter)
  if (currentView === 'farm' && game.season !== 3) {
    leafTimer += dt;
    if (leafTimer > 1500) {
      leafTimer = 0;
      const lx = renderer.w * (0.4 + Math.random() * 0.6);
      particles.emit(lx, -10, game.season === 2 ? 'leafFall' : 'leaf');
    }
  }

  checkGameEvents();
  renderer.render(game, currentView, timestamp, particles);
  ui.updateHUD(game);
  syncSeedCarousel();
  updateTalkBtn();

  saveInterval += dt;
  if (saveInterval > 30000) { game.autoSave(); saveInterval = 0; }

  rafId = requestAnimationFrame(loop);
}

function processInput(dt) {
  // Global: leave a building view / close menus
  if (input.wasPressed('Escape')) {
    ui.closeAllModals();
    if (currentView !== 'farm') currentView = 'farm';
  }

  if (currentView !== 'farm') return;

  const { dx, dy } = input.getMoveDelta();
  game.player.move(dx, dy, game.worldBounds, (x, y) => game.isBlockedTile(x, y), dt);

  clampCamera();

  nearbyNpc = findNearbyNpc();

  if (input.wasPressed('1')) { game.player.tool = 'hoe';     syncToolBar(); }
  if (input.wasPressed('2')) { game.player.tool = 'water';   syncToolBar(); }
  if (input.wasPressed('3')) { game.player.tool = 'seed';    syncToolBar(); }
  if (input.wasPressed('4')) { game.player.tool = 'scythe';  syncToolBar(); }
  if (input.wasPressed('5')) { game.player.tool = 'fishing'; syncToolBar(); }

  if (input.wasPressed('q') || input.wasPressed('Q')) {
    game.player.cycleSeed(Object.keys(CROPS));
    syncSeedCarousel();
  }
  if (input.wasPressed('e') || input.wasPressed('E')) { doSleep(); }
  if (input.wasPressed('Enter') || input.wasPressed(' ')) {
    if (nearbyNpc) interactWith(nearbyNpc);
  }

  if (input.mouse.clicked) {
    handleCanvasClick(input.mouse.x, input.mouse.y);
  }
}

function findNearbyNpc() {
  const { gridX, gridY } = game.player;
  for (const b of BUILDINGS) {
    const n = b.npc;
    if (Math.max(Math.abs(gridX - n.x), Math.abs(gridY - n.y)) <= 1) {
      return { action: b.action, name: n.name, lines: n.lines || [n.line] };
    }
  }
  // Home and Barn hotspots — no NPC, the player walks up to their own door.
  for (const h of [game.homeHotspot, game.barnHotspot]) {
    if (Math.max(Math.abs(gridX - h.tx), Math.abs(gridY - h.ty)) <= 1) {
      return { action: h.action, label: h.label, isHotspot: true };
    }
  }
  return null;
}

function interactWith(npc) {
  // Hotspots (own home/barn) skip the dialogue line — you just enter your own place.
  if (!npc.isHotspot) {
    const lines = npc.lines || (npc.line ? [npc.line] : ['Hello!']);
    const line = lines[Math.floor(Math.random() * lines.length)];
    ui.notify(`${npc.name}: ${line}`, 2600);
  }
  const a = npc.action;
  if (a === 'market') openShopModal();
  else if (a === 'upgrades') openProgressionModal();
  else if (a === 'skins') openSkinsModal();
  else if (a === 'gems') ui.openGemStore(game);
  else if (a === 'quests') {
    const claimFn = (id) => {
      if (game.claimQuest(id)) {
        audio.playQuestComplete();
        particles.emit(renderer.w / 2, renderer.h / 2, 'levelUp');
        renderer.shake(5, 200);
      }
    };
    ui.openQuestLog(game, claimFn);
  } else if (a === 'barn') {
    currentView = 'barn';
    const feedAnimalFn = (id) => { if (game.feedAnimal(id)) audio.playFeed(); };
    const refreshBarn = () => ui.openBarnActions(game, feedAnimalFn, refreshBarn);
    ui.openBarnActions(game, feedAnimalFn, refreshBarn);
  } else if (a === 'home') {
    currentView = 'home';
    ui.closeAllModals();
  }
}

function handleCanvasClick(screenX, screenY) {
  if (currentView === 'home') {
    if (pendingFurniture) {
      const { tileX, tileY } = renderer.pixelToHomeTile(screenX, screenY);
      placeFurniture(pendingFurniture, tileX, tileY);
      pendingFurniture = null;
    }
    return;
  }

  if (currentView !== 'farm') return;

  const tappedNpc = renderer.npcAt(screenX, screenY);
  if (tappedNpc) {
    const n = game.player;
    let close;
    if (tappedNpc.isHotspot) {
      const h = tappedNpc.action === 'home' ? game.homeHotspot : game.barnHotspot;
      close = Math.max(Math.abs(n.gridX - h.tx), Math.abs(n.gridY - h.ty)) <= 1;
    } else {
      close = BUILDINGS.some(b => b.action === tappedNpc.action &&
        Math.max(Math.abs(n.gridX - b.npc.x), Math.abs(n.gridY - b.npc.y)) <= 1);
    }
    if (close) { interactWith(tappedNpc); return; }
    const who = tappedNpc.isHotspot ? `your ${tappedNpc.label}` : `the ${tappedNpc.name}`;
    ui.notify(`Walk closer to enter ${who}.`);
    return;
  }

  if (game.player.tool === 'fishing') {
    if (renderer.isPondClick(screenX, screenY, game.farm)) {
      openFishingGame();
    } else {
      ui.notify('Walk to the pond to fish! 🎣');
    }
    return;
  }

  const { tileX, tileY } = renderer.pixelToTile(game.farm, screenX, screenY);
  useTool(tileX, tileY);
}

function _tileScreenCenter(tx, ty) {
  return {
    px: tx * TILE_SIZE - game.farm.camX + TILE_SIZE / 2,
    py: ty * TILE_SIZE - game.farm.camY + TILE_SIZE / 2,
  };
}

function useTool(tx, ty) {
  const { player, farm } = game;

  // Adjacency check — you must be standing on, or within 1 tile of, the target.
  // Chebyshev distance ≤ 1 means the 8 surrounding tiles + the tile you stand on.
  const adx = Math.abs(tx - player.gridX), ady = Math.abs(ty - player.gridY);
  if (Math.max(adx, ady) > 1) {
    ui.notify('Move closer to do that here.');
    return;
  }

  // Energy check — each tool use costs 1 energy
  if (game.energy <= 0) {
    ui.notify('⚡ Out of energy! Sleep to restore it.');
    return;
  }

  if (tx >= 0 && ty >= 0 && tx < farm.cols && ty < farm.rows) {
    const ddx = tx - player.gridX, ddy = ty - player.gridY;
    if (Math.abs(ddx) > Math.abs(ddy)) { player.facingDX = Math.sign(ddx); player.facingDY = 0; }
    else if (ddy !== 0) { player.facingDX = 0; player.facingDY = Math.sign(ddy); }
  }

  const { px, py } = _tileScreenCenter(tx, ty);

  let didAct = false;
  if (player.tool === 'hoe') {
    const aoe = game.getToolAoe('hoe');
    const count = farm.till(tx, ty, aoe);
    if (count > 0) { audio.playTill(); particles.emit(px, py, 'plant'); didAct = true; }
  } else if (player.tool === 'water') {
    const aoe = game.getToolAoe('wateringCan');
    farm.water(tx, ty, aoe);
    audio.playWater();
    particles.emit(px, py, 'water');
    didAct = true;
  } else if (player.tool === 'seed') {
    const kind = player.selectedSeed;
    if ((game.seedInventory[kind] || 0) > 0) {
      if (farm.plant(tx, ty, kind)) {
        game.seedInventory[kind]--;
        audio.playPlant();
        particles.emit(px, py, 'plant');
        didAct = true;
        if (!game.isInSeason(kind)) {
          ui.notify(`🌱 ${CROPS[kind].label} is out of season — slower growth & lower yield.`);
        }
      } else {
        ui.notify('Tile must be tilled first!');
      }
    } else {
      ui.notify(`No ${CROPS[kind]?.label} seeds! Buy more in the Market.`);
    }
  } else if (player.tool === 'scythe') {
    const aoe = game.getToolAoe('harvester');
    const harvested = farm.harvest(tx, ty, aoe);
    const total = game.addHarvest(harvested);
    if (total > 0) {
      const names = Object.entries(harvested).map(([k, v]) => `${v} ${CROPS[k]?.label}`).join(', ');
      let msg = `Harvested: ${names}!`;
      if (game._lastHarvestBonus) {
        const bonusStr = Object.entries(game._lastHarvestBonus).map(([k,v])=>`+${v} ${CROPS[k]?.label}`).join(', ');
        msg += ` ☔ Weather bonus: ${bonusStr}`;
      }
      ui.notify(msg);
      audio.playHarvest();
      particles.emit(px, py, 'harvest');
      renderer.shake(3, 150);
      didAct = true;
    }
  }

  // Deduct energy only when something actually happened
  if (didAct) game.energy = Math.max(0, game.energy - 1);

  clampCamera();
}

// Checks game-state flags set during game.tick (season change, etc.)
// and fires particles/notifications in the UI layer.
function checkGameEvents() {
  if (game._seasonChanged) {
    const { to } = game._seasonChanged;
    const name = SEASONS[to];
    const icon = SEASON_ICONS[to];
    ui.notify(`${icon} Welcome to ${name}! Prices have changed — check the Market.`, 4000);
    particles.emit(renderer.w / 2, renderer.h / 2, 'levelUp');
    renderer.shake(4, 250);
    renderer.flashScreen('#ffffff18', 500);
    game._seasonChanged = null;
  }
}

function doSleep() {
  renderer.flashScreen('#000020', 320);
  game.sleepToNextDay();
  const weatherIcons = { sunny: '☀️', cloudy: '⛅', rainy: '🌧️', stormy: '⛈️' };
  const icon = weatherIcons[game.weather] || '🌅';
  ui.notify(`⏭️ Day ${game.day} · ${icon} ${game.weather} · ⚡${game.energy}/${game.maxEnergy}`);
}

function openFishingGame() {
  if (game.energy < 2) { ui.notify('⚡ Need at least 2 energy to fish!'); return; }
  game.energy = Math.max(0, game.energy - 2);
  ui.openFishingGame(game, (kind, def) => {
    game.catchFish(kind);
    if (def) {
      ui.notify(`🐟 ${def.label} added to inventory!`);
      if (kind === 'legendary') {
        audio.playQuestComplete();
        particles.emit(renderer.w / 2, renderer.h / 2, 'levelUp');
        renderer.shake(8, 400);
      } else {
        audio.playCoin();
      }
    }
  });
}

function openShopModal() {
  ui.openShop(game,
    (kind, n) => game.buySeed(kind, n),
    (kind, n) => {
      const ok = game.sellCrop(kind, n);
      if (ok) { audio.playCoin(); particles.emit(renderer.w / 2, renderer.h / 2, 'coin'); }
      return ok;
    }
  );
}

function openProgressionModal() {
  ui.openProgression(game,
    (id, gems) => game.unlockFarmSize(id, gems),
    (tool, tier, gems) => game.unlockMachinery(tool, tier, gems),
    {
      onStartCraft: (slot, recipe) => game.startCraft(slot, recipe),
      onCollect: (slot) => game.collectCraft(slot),
      onUnlockSlot: () => game.unlockExtraCraftSlot(),
    },
    (tier, gems) => game.unlockStamina(tier, gems),
  );
}

function openSkinsModal() {
  ui.openSkins(game,
    (id, cat) => game.buySkin(id, cat),
    (cat, id) => {
      if (cat === 'player') game.player.skin = id;
      else game.houseSkin = id;
      game.autoSave();
    }
  );
}

function placeFurniture(def, tileX, tileY) {
  if (game.coins < def.cost) { ui.notify('Not enough coins!'); return; }
  game.coins -= def.cost;
  game.homeLayout.push({ id: def.id, x: tileX, y: tileY });
  game.autoSave();
  ui.notify(`Placed ${def.label}!`);
}

// Hard-snap camera to player (called once on init to avoid lerp-from-zero black screen)
function snapCamera() {
  const { farm } = game;
  const canvasW = renderer.w;
  const canvasH = renderer.h;
  const b = game.worldBounds;
  const worldMinX = b.minX * TILE_SIZE;
  const worldMinY = b.minY * TILE_SIZE;
  const worldW = (b.maxX - b.minX) * TILE_SIZE;
  const worldH = (b.maxY - b.minY) * TILE_SIZE;
  const targetCamX = game.player.gridX * TILE_SIZE - canvasW / 2 + TILE_SIZE / 2;
  const targetCamY = game.player.gridY * TILE_SIZE - canvasH / 2 + TILE_SIZE / 2;
  farm.camX = Math.max(worldMinX, Math.min(targetCamX, worldMinX + Math.max(0, worldW - canvasW)));
  farm.camY = Math.max(worldMinY, Math.min(targetCamY, worldMinY + Math.max(0, worldH - canvasH)));
}

function clampCamera() {
  const { farm } = game;
  const canvasW = renderer.w;
  const canvasH = renderer.h;
  const b = game.worldBounds;
  const worldMinX = b.minX * TILE_SIZE;
  const worldMinY = b.minY * TILE_SIZE;
  const worldW = (b.maxX - b.minX) * TILE_SIZE;
  const worldH = (b.maxY - b.minY) * TILE_SIZE;

  const targetCamX = game.player.gridX * TILE_SIZE - canvasW / 2 + TILE_SIZE / 2;
  const targetCamY = game.player.gridY * TILE_SIZE - canvasH / 2 + TILE_SIZE / 2;

  const clampedX = Math.max(worldMinX, Math.min(targetCamX, worldMinX + Math.max(0, worldW - canvasW)));
  const clampedY = Math.max(worldMinY, Math.min(targetCamY, worldMinY + Math.max(0, worldH - canvasH)));

  // Smooth camera follow (lerp) — feels like Stardew Valley instead of instant snap
  farm.camX += (clampedX - farm.camX) * 0.14;
  farm.camY += (clampedY - farm.camY) * 0.14;
}

function syncToolBar() {
  const tool = game.player.tool;
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
  syncSeedCarousel();
}

const CROP_ICONS = { wheat: '🌾', tomato: '🍅', corn: '🌽', pumpkin: '🎃', parsnip: '🥕', potato: '🥔', strawberry: '🍓', melon: '🍈', blueberry: '🫐', grapes: '🍇', cabbage: '🥬', golden_wheat: '✨' };

function syncSeedCarousel() {
  const carousel = document.getElementById('seed-carousel');
  const label = document.getElementById('seed-label');
  if (!carousel) return;
  const isSeed = game.player.tool === 'seed';
  carousel.style.display = isSeed ? 'flex' : 'none';
  if (isSeed && label) {
    const kind = game.player.selectedSeed;
    const def = CROPS[kind];
    const icon = CROP_ICONS[kind] || '🌱';
    const qty = game.seedInventory[kind] || 0;
    label.textContent = def ? `${icon} ${def.label} ×${qty}` : kind;
    label.classList.toggle('seed-empty', qty === 0);
  }
  const seedBtn = document.querySelector('[data-tool="seed"]');
  if (seedBtn) {
    let badge = seedBtn.querySelector('.seed-count');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'seed-count';
      seedBtn.appendChild(badge);
    }
    const qty = game.seedInventory[game.player.selectedSeed] || 0;
    badge.textContent = qty;
    badge.classList.toggle('seed-empty', qty === 0);
  }
}

function setupSeedCarousel() {
  const seedKeys = Object.keys(CROPS);
  document.getElementById('seed-prev')?.addEventListener('click', () => {
    const cur = seedKeys.indexOf(game.player.selectedSeed);
    game.player.selectedSeed = seedKeys[(cur - 1 + seedKeys.length) % seedKeys.length];
    syncSeedCarousel();
  });
  document.getElementById('seed-next')?.addEventListener('click', () => {
    const cur = seedKeys.indexOf(game.player.selectedSeed);
    game.player.selectedSeed = seedKeys[(cur + 1) % seedKeys.length];
    syncSeedCarousel();
  });
}

function setupTalkBtn() {
  document.getElementById('btn-talk')?.addEventListener('click', () => {
    if (nearbyNpc) interactWith(nearbyNpc);
  });
}

function updateTalkBtn() {
  const btn = document.getElementById('btn-talk');
  if (!btn) return;
  const show = currentView === 'farm' && !!nearbyNpc;
  btn.style.display = show ? '' : 'none';
  if (show) btn.textContent = `💬 Talk to ${nearbyNpc.name}`;
}

function setupToolBar() {
  const toolDefs = [
    { id: 'hoe',     icon: '⛏',  label: 'Hoe',    key: '1' },
    { id: 'water',   icon: '💧',  label: 'Water',  key: '2' },
    { id: 'seed',    icon: '🌱',  label: 'Seed',   key: '3' },
    { id: 'scythe',  icon: '🌾',  label: 'Harvest',key: '4' },
    { id: 'fishing', icon: '🎣',  label: 'Fish',   key: '5' },
  ];
  const bar = document.getElementById('toolbar');
  toolDefs.forEach(({ id, icon, label, key }) => {
    const btn = document.createElement('button');
    btn.className = 'tool-btn';
    btn.dataset.tool = id;
    btn.title = `${label} (${key})`;
    btn.innerHTML =
      `<span class="tool-key-badge">${key}</span>` +
      `<span class="tool-icon">${icon}</span>` +
      `<span class="tool-label">${label}</span>`;
    btn.addEventListener('click', () => {
      game.player.tool = id;
      if (id === 'seed') game.player.cycleSeed(Object.keys(CROPS));
      syncToolBar();
    });
    bar.appendChild(btn);
  });
  document.querySelector('[data-tool="hoe"]')?.classList.add('active');
  syncSeedCarousel();
}

function setupSleepBtn() {
  document.getElementById('btn-sleep')?.addEventListener('click', doSleep);
}

function setupMuteBtn() {
  const btn = document.getElementById('btn-mute');
  if (!btn) return;
  btn.textContent = audio.isMuted() ? '🔇' : '🔊';
  btn.addEventListener('click', () => {
    btn.textContent = audio.toggleMute() ? '🔇' : '🔊';
  });
}

function setupMobileControls() {
  const dpad = document.getElementById('dpad');
  if (!dpad) return;
  const dirs = [
    { id: 'dpad-up',    dx: 0,  dy: -1 },
    { id: 'dpad-down',  dx: 0,  dy:  1 },
    { id: 'dpad-left',  dx: -1, dy:  0 },
    { id: 'dpad-right', dx: 1,  dy:  0 },
  ];
  dirs.forEach(({ id, dx, dy }) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    // Set a held direction; processInput() consumes it each frame through the
    // same delta-timed game.player.move() path as the keyboard, so mobile and
    // desktop movement share one physics/throttle.
    const press = () => { input.pad.dx = dx; input.pad.dy = dy; };
    const release = () => {
      if (input.pad.dx === dx && input.pad.dy === dy) { input.pad.dx = 0; input.pad.dy = 0; }
    };
    btn.addEventListener('touchstart', e => { e.preventDefault(); press(); }, { passive: false });
    btn.addEventListener('touchend', e => { e.preventDefault(); release(); }, { passive: false });
    btn.addEventListener('touchcancel', e => { e.preventDefault(); release(); }, { passive: false });
    btn.addEventListener('mousedown', press);
    btn.addEventListener('mouseup', release);
    btn.addEventListener('mouseleave', release);
  });
}

window.addEventListener('DOMContentLoaded', init);
