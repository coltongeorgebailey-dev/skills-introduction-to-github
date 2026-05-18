import { Game } from './game.js';
import { Renderer } from './renderer.js';
import { UI } from './ui.js';
import { Input } from './input.js';
import { loadGame } from './save.js';
import { checkStripeReturn } from './iap.js';
import { CROPS, TILE_SIZE } from './constants.js';

let game, renderer, ui, input;
let currentView = 'farm';
let pendingFurniture = null;
let lastTime = 0;
let saveInterval = 0;

function init() {
  const saved = loadGame();
  game = saved ? Game.fromSave(saved) : new Game();

  const canvas = document.getElementById('game-canvas');
  renderer = new Renderer(canvas);
  ui = new UI();
  input = new Input();
  input.bindCanvas(canvas);

  checkStripeReturn(game, ui);
  setupTabBar();
  setupToolBar();
  setupSleepBtn();
  setupMobileControls();

  // Daily login gem reward (doesn't advance the farm or day counter)
  const today = new Date().toDateString();
  if (game.lastLoginDate !== today) {
    game.lastLoginDate = today;
    game.gems += 3;
    game.autoSave();
    ui.notify('💎 Daily login bonus: +3 gems!', 3000);
  }

  requestAnimationFrame(loop);
}

function loop(timestamp) {
  const dt = lastTime === 0 ? 0 : Math.min(timestamp - lastTime, 1000);
  lastTime = timestamp;

  input.update();
  processInput(dt);
  game.tick(dt);

  renderer.render(game, currentView, timestamp);
  ui.updateHUD(game);

  saveInterval += dt;
  if (saveInterval > 30000) { game.autoSave(); saveInterval = 0; }

  requestAnimationFrame(loop);
}

function processInput(dt) {
  if (currentView !== 'farm') return;

  // Movement
  const { dx, dy } = input.getMoveDelta();
  game.player.move(dx, dy, game.farm, dt);

  clampCamera();

  // Tool selection keys
  if (input.wasPressed('1')) { game.player.tool = 'hoe'; syncToolBar(); }
  if (input.wasPressed('2')) { game.player.tool = 'water'; syncToolBar(); }
  if (input.wasPressed('3')) { game.player.tool = 'seed'; syncToolBar(); }
  if (input.wasPressed('4')) { game.player.tool = 'scythe'; syncToolBar(); }
  if (input.wasPressed('5')) { game.player.tool = 'fishing'; syncToolBar(); }

  if (input.wasPressed('q') || input.wasPressed('Q')) {
    game.player.cycleSeed(Object.keys(CROPS));
  }
  if (input.wasPressed('e') || input.wasPressed('E')) {
    doSleep();
  }
  if (input.wasPressed('b') || input.wasPressed('B')) {
    openShopModal();
  }
  if (input.wasPressed('Escape')) { ui.closeAllModals(); }

  // Click / tap → use tool on tile
  if (input.mouse.clicked) {
    handleCanvasClick(input.mouse.x, input.mouse.y);
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

  // Fishing rod + pond click
  if (game.player.tool === 'fishing') {
    if (renderer.isPondClick(screenX, screenY, game.farm)) {
      openFishingGame();
      return;
    } else {
      ui.notify('Walk to the pond to fish! 🎣');
      return;
    }
  }

  const { tileX, tileY } = renderer.pixelToTile(game.farm, screenX, screenY);
  useTool(tileX, tileY);
}

function useTool(tx, ty) {
  const { player, farm } = game;

  if (tx >= 0 && ty >= 0 && tx < farm.cols && ty < farm.rows) {
    player.gridX = Math.max(0, Math.min(farm.cols - 1, tx));
    player.gridY = Math.max(0, Math.min(farm.rows - 1, ty));
  }

  if (player.tool === 'hoe') {
    const aoe = game.getToolAoe('hoe');
    farm.till(tx, ty, aoe);
  } else if (player.tool === 'water') {
    const aoe = game.getToolAoe('wateringCan');
    farm.water(tx, ty, aoe);
  } else if (player.tool === 'seed') {
    const kind = player.selectedSeed;
    if (!game.canPlantCrop(kind)) {
      ui.notify(`Can't plant ${CROPS[kind]?.label || kind} this season!`);
      return;
    }
    if ((game.seedInventory[kind] || 0) > 0) {
      if (farm.plant(tx, ty, kind)) {
        game.seedInventory[kind]--;
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
      ui.notify(`Harvested: ${names}!`);
    }
  }

  clampCamera();
}

function doSleep() {
  game.sleepToNextDay();
  const weatherIcons = { sunny: '☀️', cloudy: '⛅', rainy: '🌧️', stormy: '⛈️' };
  const icon = weatherIcons[game.weather] || '🌅';
  ui.notify(`Day ${game.day} — Good morning! ${icon}`);
}

function openFishingGame() {
  ui.openFishingGame(game, (kind, def) => {
    game.catchFish(kind);
    if (def) ui.notify(`🐟 ${def.label} added to inventory!`);
  });
}

function openShopModal() {
  ui.openShop(game,
    (kind, n) => game.buySeed(kind, n),
    (kind, n) => game.sellCrop(kind, n)
  );
}

function placeFurniture(def, tileX, tileY) {
  if (game.coins < def.cost) { ui.notify('Not enough coins!'); return; }
  game.coins -= def.cost;
  game.homeLayout.push({ id: def.id, x: tileX, y: tileY });
  game.autoSave();
  ui.notify(`Placed ${def.label}!`);
}

function clampCamera() {
  const { farm } = game;
  const canvasW = renderer.w;
  const canvasH = renderer.h;
  const farmW = farm.cols * TILE_SIZE;
  const farmH = farm.rows * TILE_SIZE;

  const targetCamX = game.player.gridX * TILE_SIZE - canvasW / 2 + TILE_SIZE / 2;
  const targetCamY = game.player.gridY * TILE_SIZE - canvasH / 2 + TILE_SIZE / 2;

  farm.camX = Math.max(0, Math.min(targetCamX, Math.max(0, farmW - canvasW)));
  farm.camY = Math.max(0, Math.min(targetCamY, Math.max(0, farmH - canvasH)));
}

function syncToolBar() {
  const tool = game.player.tool;
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
}

function setupTabBar() {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      tabs.forEach(t => t.classList.toggle('active', t.dataset.view === view));
      pendingFurniture = null;

      if (view === 'farm') {
        currentView = 'farm';
        ui.closeAllModals();
      } else if (view === 'home') {
        currentView = 'home';
        ui.closeAllModals();
      } else if (view === 'barn') {
        currentView = 'barn';
        const feedAnimalFn = (id) => game.feedAnimal(id);
        const refreshBarn = () => ui.openBarnActions(game, feedAnimalFn, refreshBarn);
        ui.openBarnActions(game, feedAnimalFn, refreshBarn);
      } else if (view === 'quests') {
        currentView = 'farm';
        tabs.forEach(t => t.classList.toggle('active', t.dataset.view === 'farm'));
        const claimFn = (id) => { game.claimQuest(id); };
        ui.openQuestLog(game, claimFn);
      } else if (view === 'shop') {
        currentView = 'farm';
        tabs.forEach(t => t.classList.toggle('active', t.dataset.view === 'farm'));
        openShopModal();
      } else if (view === 'progression') {
        currentView = 'farm';
        tabs.forEach(t => t.classList.toggle('active', t.dataset.view === 'farm'));
        ui.openProgression(game,
          (id, gems) => game.unlockFarmSize(id, gems),
          (tool, tier, gems) => game.unlockMachinery(tool, tier, gems),
          {
            onStartCraft: (slot, recipe) => game.startCraft(slot, recipe),
            onCollect: (slot) => game.collectCraft(slot),
            onUnlockSlot: () => game.unlockExtraCraftSlot(),
          }
        );
      } else if (view === 'skins') {
        currentView = 'farm';
        tabs.forEach(t => t.classList.toggle('active', t.dataset.view === 'farm'));
        ui.openSkins(game,
          (id, cat) => game.buySkin(id, cat),
          (cat, id) => {
            if (cat === 'player') game.player.skin = id;
            else game.houseSkin = id;
            game.autoSave();
          }
        );
      } else if (view === 'gems') {
        currentView = 'farm';
        tabs.forEach(t => t.classList.toggle('active', t.dataset.view === 'farm'));
        ui.openGemStore(game);
      }
    });
  });
}

function setupToolBar() {
  const toolDefs = [
    { id: 'hoe',     icon: '⛏',  key: '1' },
    { id: 'water',   icon: '💧',  key: '2' },
    { id: 'seed',    icon: '🌱',  key: '3' },
    { id: 'scythe',  icon: '🌾',  key: '4' },
    { id: 'fishing', icon: '🎣',  key: '5' },
  ];
  const bar = document.getElementById('toolbar');
  toolDefs.forEach(({ id, icon, key }) => {
    const btn = document.createElement('button');
    btn.className = 'tool-btn';
    btn.dataset.tool = id;
    btn.innerHTML = `<span class="tool-icon">${icon}</span><span class="tool-key">${key}</span>`;
    btn.title = `${id} (${key})`;
    btn.addEventListener('click', () => {
      game.player.tool = id;
      if (id === 'seed') game.player.cycleSeed(Object.keys(CROPS));
      syncToolBar();
    });
    bar.appendChild(btn);
  });
  document.querySelector('[data-tool="hoe"]')?.classList.add('active');
}

function setupSleepBtn() {
  document.getElementById('btn-sleep').addEventListener('click', doSleep);
  document.getElementById('btn-furniture').addEventListener('click', () => {
    if (currentView !== 'home') { currentView = 'home'; }
    ui.openFurniturePicker(game, def => { pendingFurniture = def; });
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
    let interval = null;
    const start = () => {
      game.player.move(dx, dy, game.farm, 999);
      interval = setInterval(() => game.player.move(dx, dy, game.farm, 999), 150);
    };
    const stop = () => clearInterval(interval);
    btn.addEventListener('touchstart', e => { e.preventDefault(); start(); }, { passive: false });
    btn.addEventListener('touchend', e => { e.preventDefault(); stop(); }, { passive: false });
    btn.addEventListener('mousedown', start);
    btn.addEventListener('mouseup', stop);
  });
}

window.addEventListener('DOMContentLoaded', init);
