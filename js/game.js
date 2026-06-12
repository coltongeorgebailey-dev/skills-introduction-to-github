import {
  CROPS, FARM_SIZES, MACHINERY, SKINS, STARTING_COINS, STARTING_GEMS, DAILY_GEM_REWARD,
  SEASONS, SEASON_DAYS, WEATHER_TYPES,
  ANIMALS, FEED_BAG_COST,
  RECIPES, EXTRA_CRAFT_SLOT_COST,
  FISH,
  QUESTS, ACHIEVEMENTS, QUALITY_MULT,
  DAY_MS, OFFLINE_DAY_CAP,
  WORLD_PAD, BUILDINGS,
  STARTING_ENERGY, MAX_ENERGY, STAMINA_TIERS,
  SEASON_CROP_PRICES,
} from './constants.js';
import { Farm } from './farm.js';
import { Player } from './player.js';
import { saveGame, loadGame } from './save.js';

export class Game {
  constructor() {
    this.day = 1;
    this.coins = STARTING_COINS;
    this.gems = STARTING_GEMS;
    this.totalCoinsEarned = 0;

    // Farm & player
    this.farmSizeId = 1;
    this.machineryTiers = { hoe: 1, wateringCan: 1, harvester: 1 };
    this.ownedSkins = ['default', 'classic'];
    this.homeLayout = [];
    this.houseSkin = 'classic';

    // Crop inventories
    this.seedInventory     = { ...Object.fromEntries(Object.keys(CROPS).map(k => [k, 0])), wheat: 5, tomato: 2 };
    this.harvestInventory  = Object.fromEntries(Object.keys(CROPS).map(k => [k, 0]));
    // Quality breakdown of harvested crops: { silver, gold } per kind (normal = total - silver - gold).
    this.cropQuality       = Object.fromEntries(Object.keys(CROPS).map(k => [k, { silver: 0, gold: 0 }]));

    // Time of day, 0..1 (0=midnight, 0.25=6AM, 0.5=noon, 0.75=6PM). Starts at
    // sunrise; drives the day/night lighting overlay and HUD sun/moon icon.
    this.timeOfDay = 5 / 24;

    // A.3 — set by main.js each frame; true while a modal is open or off the farm.
    this.timePaused = false;

    // B.3 — one-time tutorial nudges (saved so they don't repeat after reload).
    this.tutorialFlags = { goldStar: false, achievement: false, offSeason: false };

    // Energy / stamina (resets each day). staminaTier controls maxEnergy and
    // is upgraded at the Upgrades shop (see unlockStamina + STAMINA_TIERS).
    this.staminaTier = 1;
    this.energy    = STARTING_ENERGY;
    this.maxEnergy = MAX_ENERGY;

    // Seasons & weather
    this.season = 0;       // index into SEASONS
    this.seasonDay = 0;    // 0-based day within the season
    this.weather = 'sunny';

    // Animals
    this.animals = [];
    this._nextAnimalId = 1;
    this.feedBags = 10;
    this.animalProducts = { egg: 0, milk: 0, wool: 0 };

    // Crafting
    this.craftingSlots = [null, null];   // null | { recipeKey, daysLeft }
    this.artisanInventory = {};          // recipeKey → count
    this.craftingSlotsUnlocked = 1;

    // Fishing
    this.fishInventory = {};

    // Quests
    this.completedQuests = [];  // quest ids that are ready to claim
    this.claimedQuests = [];    // quest ids already claimed

    // Achievements (same claim model as quests)
    this.completedAchievements = [];
    this.claimedAchievements = [];

    // Milestones (extended)
    this.milestones = {
      totalHarvested: 0, daysPlayed: 0,
      rainyDays: 0, eggsCollected: 0, fishCaught: 0,
      crafted: 0, seasonsCompleted: 0, legendaryFish: 0,
      goldCropsHarvested: 0,
      cropsGrownByKind: {}, fishCaughtByKind: {},
    };

    this.lastLoginDate = null;

    // Real-time day clock
    this._dayAccumulatorMs = 0;
    this._questAccumulatorMs = 0;
    this.tutorialSeen = false;

    const size = FARM_SIZES[0];
    this.farm = new Farm(size.cols, size.rows);
    this.player = new Player();
  }

  // Walkable world bounds (tiles): the farm grid plus the wild pad on all sides.
  get worldBounds() {
    return {
      minX: -WORLD_PAD,
      minY: -WORLD_PAD,
      maxX: this.farm.cols + WORLD_PAD,
      maxY: this.farm.rows + WORLD_PAD,
    };
  }

  // The player's own Home + Barn (drawn as the cottage/shed on the right
  // side via _drawProps). Coords are world tiles. No NPC — the player just
  // walks up to the door and presses Enter. The pen sits between them.
  get homeHotspot() {
    // Cottage door is roughly at world tile (farm.cols + 3, 3).
    return { tx: this.farm.cols + 3, ty: 3, w: 1, h: 1, action: 'home', label: 'Home' };
  }
  get barnHotspot() {
    // Shed door (moved down so the pen can sit between cottage and shed).
    return { tx: this.farm.cols + 2, ty: 7, w: 1, h: 1, action: 'barn', label: 'Barn' };
  }
  get animalPenBounds() {
    // 2×2 fenced yard between cottage (y=0..3) and shed (y=6..8).
    return { x: this.farm.cols + 1, y: 4, w: 2, h: 2 };
  }

  // True if (tx,ty) is inside any building footprint or the animal pen
  // (all non-walkable).
  isBlockedTile(tx, ty) {
    for (const b of BUILDINGS) {
      if (tx >= b.x && tx < b.x + b.w && ty >= b.y && ty < b.y + b.h) return true;
    }
    const p = this.animalPenBounds;
    if (tx >= p.x && tx < p.x + p.w && ty >= p.y && ty < p.y + p.h) return true;
    return false;
  }

  // Auto-Drip (tier 3 watering can) keeps every crop watered with no manual taps
  _autoWaterActive() { return (this.machineryTiers.wateringCan || 1) >= 3; }

  // ── Machinery helpers ─────────────────────────────────────────────────────

  getToolAoe(toolKey) {
    const tier = this.machineryTiers[toolKey] || 1;
    const entry = (MACHINERY[toolKey] || []).find(m => m.tier === tier) || MACHINERY[toolKey][0];
    return entry.aoe;
  }

  getToolName(toolKey) {
    const tier = this.machineryTiers[toolKey] || 1;
    const entry = (MACHINERY[toolKey] || []).find(m => m.tier === tier) || MACHINERY[toolKey][0];
    return entry.name;
  }

  currentFarmSize() {
    return FARM_SIZES.find(s => s.id === this.farmSizeId) || FARM_SIZES[0];
  }

  // ── Season helpers ────────────────────────────────────────────────────────

  currentSeasonName() { return SEASONS[this.season]; }

  // Any valid crop can be planted in any season now — off-season just grows
  // slower & yields less (see isInSeason / cropGrowthFactor / addHarvest).
  canPlantCrop(kind) { return !!CROPS[kind]; }

  // True if the crop is in its preferred season (full speed & yield).
  isInSeason(kind) {
    const def = CROPS[kind];
    if (!def) return false;
    if (!def.seasons) return true;            // wheat, golden_wheat = always in-season
    return def.seasons.includes(this.currentSeasonName());
  }

  // Growth-rate multiplier applied per frame to growing crops (off-season = half speed).
  cropGrowthFactor(kind) { return this.isInSeason(kind) ? 1 : 0.5; }

  _rollWeather() {
    const total = WEATHER_TYPES.reduce((s, w) => s + w.weight, 0);
    let r = Math.random() * total;
    for (const w of WEATHER_TYPES) { r -= w.weight; if (r <= 0) return w.id; }
    return 'sunny';
  }

  _advanceSeason() {
    this.seasonDay++;
    if (this.seasonDay >= SEASON_DAYS) {
      this.seasonDay = 0;
      const prevSeason = this.season;
      this.season = (this.season + 1) % 4;
      if (this.season === 0) this.milestones.seasonsCompleted++;
      // Signal season change so main.js can fire particles + notification
      this._seasonChanged = { from: prevSeason, to: this.season };
    }
  }

  currentWeatherDef() {
    return WEATHER_TYPES.find(w => w.id === this.weather) || WEATHER_TYPES[0];
  }

  // ── Day advancement ───────────────────────────────────────────────────────

  // Master clock — called every frame from the main loop.
  // Crops grow continuously; a game day passes every DAY_MS of real time,
  // which drives seasons, weather, animals, crafting and quests.
  tick(dt) {
    // Crops grow even when the day-clock is paused — real-time growth contract.
    this.farm.tick(dt, this._autoWaterActive(), (kind) => this.cropGrowthFactor(kind));

    // A.3: pause the day clock & time-of-day when a modal is open / off-farm view.
    if (!this.timePaused) {
      this._dayAccumulatorMs += dt;
      let guard = 0;
      while (this._dayAccumulatorMs >= DAY_MS && guard < 100) {
        this._dayAccumulatorMs -= DAY_MS;
        this._advanceGameDay();
        guard++;
      }
      // Time-of-day clock: 0=midnight, 0.25=6AM, 0.5=noon, 0.75=6PM. The game day
      // starts at sunrise (5/24), so the visible cycle runs sunrise→noon→dusk→night.
      this.timeOfDay = (5 / 24 + this.dayProgress()) % 1;
    }

    // Quest progress re-checked ~1×/sec so real-time goals complete live
    this._questAccumulatorMs += dt;
    if (this._questAccumulatorMs >= 1000) {
      this._questAccumulatorMs = 0;
      this.checkQuests();
      this.checkAchievements();
    }
  }

  // Progress within the current game day, 0..1 (for HUD display)
  dayProgress() { return Math.min(1, this._dayAccumulatorMs / DAY_MS); }

  // One game day elapses — weather, season, animals, crafting, quests
  _advanceGameDay() {
    this.weather = this._rollWeather();
    const weatherDef = this.currentWeatherDef();

    // Rain/storm auto-waters all crops (resets dry timers)
    if (weatherDef.autoWater) {
      this.farm.applyWeatherWater();
      this.milestones.rainyDays++;
    }

    this._seasonChanged = null; // reset before _advanceSeason may set it
    this._advanceSeason();
    this.day++;
    this.milestones.daysPlayed++;

    // Reset energy each new day
    this.energy = this.maxEnergy;

    this._collectAnimalProducts();
    this._advanceCrafting();
    this._checkDailyLogin();
    this.checkQuests();
    this.checkAchievements();
    this.autoSave();
  }

  // Manual "skip ahead" button — fast-forwards to the next day immediately
  sleepToNextDay() {
    this._dayAccumulatorMs = 0;
    this.timeOfDay = 5 / 24;   // wake at sunrise
    this._advanceGameDay();
  }

  _checkDailyLogin() {
    const today = new Date().toDateString();
    if (this.lastLoginDate !== today) {
      this.gems += DAILY_GEM_REWARD;
      this.lastLoginDate = today;
    }
  }

  // ── Economy ───────────────────────────────────────────────────────────────

  buySeed(kind, count = 1) {
    const def = CROPS[kind];
    if (!def) return false;
    if (def.gemSeedCost !== null) {
      const total = def.gemSeedCost * count;
      if (this.gems < total) return false;
      this.gems -= total;
    } else {
      const total = def.seedCost * count;
      if (this.coins < total) return false;
      this.coins -= total;
    }
    this.seedInventory[kind] = (this.seedInventory[kind] || 0) + count;
    return true;
  }

  // Remove `count` crops, draining quality tiers. fromTop=true takes gold→silver→normal
  // (selling, max value); fromTop=false takes normal→silver→gold (crafting, keep stars).
  // Returns { gold, silver, normal } actually consumed.
  _consumeQuality(kind, count, fromTop = false) {
    const q = this.cropQuality[kind] || { silver: 0, gold: 0 };
    const total = this.harvestInventory[kind] || 0;
    const normal = Math.max(0, total - q.silver - q.gold);
    let remaining = Math.min(count, total);
    const taken = { gold: 0, silver: 0, normal: 0 };
    const order = fromTop ? ['gold', 'silver', 'normal'] : ['normal', 'silver', 'gold'];
    const avail = { gold: q.gold, silver: q.silver, normal };
    for (const tier of order) {
      const t = Math.min(remaining, avail[tier]);
      taken[tier] = t; remaining -= t;
      if (remaining <= 0) break;
    }
    q.gold -= taken.gold; q.silver -= taken.silver;
    this.harvestInventory[kind] = total - (taken.gold + taken.silver + taken.normal);
    return taken;
  }

  sellCrop(kind, count = 1) {
    const def = CROPS[kind];
    if (!def || (this.harvestInventory[kind] || 0) < count) return 0;
    const unit = this.effectiveSellPrice(kind);
    const taken = this._consumeQuality(kind, count, true);   // sell best first
    const earned = Math.round(unit * QUALITY_MULT.gold) * taken.gold
                 + Math.round(unit * QUALITY_MULT.silver) * taken.silver
                 + unit * taken.normal;
    this.coins += earned;
    this.totalCoinsEarned += earned;
    this.checkAchievements();
    return earned;
  }

  // Total coin value of the entire stack of `kind` (for market labels/messages).
  cropStackValue(kind) {
    const q = this.cropQuality[kind] || { silver: 0, gold: 0 };
    const total = this.harvestInventory[kind] || 0;
    const normal = Math.max(0, total - q.silver - q.gold);
    const unit = this.effectiveSellPrice(kind);
    return Math.round(unit * QUALITY_MULT.gold) * q.gold
         + Math.round(unit * QUALITY_MULT.silver) * q.silver
         + unit * normal;
  }

  addHarvest(harvested, wellTended = {}) {
    let total = 0;
    let goldThisHarvest = 0;
    let silverThisHarvest = 0;
    const weatherDef = this.currentWeatherDef();
    const bonus = weatherDef.yieldBonus || 0;
    const wet = this.weather === 'rainy' || this.weather === 'stormy';
    const bonusApplied = {};
    const qualityPerKind = {};   // B.1: { kind: { silver, gold } } for the harvest notify
    for (const [kind, count] of Object.entries(harvested)) {
      // Off-season harvests yield less (70%, but never zero)
      const seasonMul = this.isInSeason(kind) ? 1 : 0.7;
      const base = Math.max(1, Math.round(count * seasonMul));
      // Weather yield bonus: extra crops dropped on rainy/stormy days
      const extra = bonus > 0 ? Math.floor(base * bonus) : 0;
      const finalCount = base + extra;

      // Roll quality per unit: in-season crops (and wet days) produce more stars.
      // D.1: "well-tended" crops (never let to dry) get an extra +5% gold chance,
      // applied to the well-tended fraction of the harvest.
      const inSeason = this.isInSeason(kind);
      const baseGold   = 0.05 + (inSeason ? 0.10 : 0) + (wet ? 0.05 : 0);
      const silverChance = 0.20 + (inSeason ? 0.10 : 0);
      const wtFrac = count > 0 ? (wellTended[kind] || 0) / count : 0;
      const wtUnits = Math.round(finalCount * wtFrac);   // first N units get the tended bonus
      const q = this.cropQuality[kind] || (this.cropQuality[kind] = { silver: 0, gold: 0 });
      const perKind = { silver: 0, gold: 0 };
      for (let i = 0; i < finalCount; i++) {
        const goldChance = baseGold + (i < wtUnits ? 0.05 : 0);
        const r = Math.random();
        if (r < goldChance) { q.gold++; perKind.gold++; goldThisHarvest++; }
        else if (r < goldChance + silverChance) { q.silver++; perKind.silver++; silverThisHarvest++; }
      }
      qualityPerKind[kind] = perKind;

      this.harvestInventory[kind] = (this.harvestInventory[kind] || 0) + finalCount;
      this.milestones.cropsGrownByKind[kind] = (this.milestones.cropsGrownByKind[kind] || 0) + finalCount;
      total += finalCount;
      if (extra > 0) bonusApplied[kind] = extra;
    }
    this.milestones.totalHarvested += total;
    this.milestones.goldCropsHarvested += goldThisHarvest;
    this._lastHarvestBonus = Object.keys(bonusApplied).length > 0 ? bonusApplied : null;
    this._lastHarvestGold = goldThisHarvest;       // for harvest juice in main.js
    this._lastHarvestSilver = silverThisHarvest;
    this._lastHarvestQuality = qualityPerKind;     // for B.1 stars in harvest notify
    this.checkAchievements();
    return total;
  }

  // Returns the effective sell price of a crop given the current season.
  effectiveSellPrice(kind) {
    const def = CROPS[kind];
    if (!def) return 0;
    const seasonName = SEASONS[this.season];
    const mult = SEASON_CROP_PRICES[kind]?.[seasonName] ?? 1;
    return Math.round(def.sellPrice * mult);
  }

  unlockFarmSize(id, useGems = false) {
    const target = FARM_SIZES.find(s => s.id === id);
    if (!target || id <= this.farmSizeId) return false;
    if (useGems) {
      if (this.gems < target.gemCost) return false;
      this.gems -= target.gemCost;
    } else {
      if (this.coins < target.coinCost) return false;
      this.coins -= target.coinCost;
    }
    this.farmSizeId = id;
    this.farm.resize(target.cols, target.rows);
    return true;
  }

  unlockMachinery(toolKey, tier, useGems = false) {
    const list = MACHINERY[toolKey];
    if (!list) return false;
    const entry = list.find(m => m.tier === tier);
    if (!entry || tier <= (this.machineryTiers[toolKey] || 1)) return false;
    if (useGems) {
      if (this.gems < entry.unlockGems) return false;
      this.gems -= entry.unlockGems;
    } else {
      if (this.coins < entry.unlockCoins) return false;
      this.coins -= entry.unlockCoins;
    }
    this.machineryTiers[toolKey] = tier;
    return true;
  }

  // Buy the next Stamina tier — raises maxEnergy and tops the player off so the
  // purchase feels instantly useful (rather than waiting until tomorrow).
  unlockStamina(tier, useGems = false) {
    const entry = STAMINA_TIERS.find(t => t.tier === tier);
    if (!entry) return false;
    if (tier <= this.staminaTier) return false;
    if (useGems) {
      if (this.gems < entry.unlockGems) return false;
      this.gems -= entry.unlockGems;
    } else {
      if (this.coins < entry.unlockCoins) return false;
      this.coins -= entry.unlockCoins;
    }
    this.staminaTier = tier;
    this.maxEnergy   = entry.maxEnergy;
    this.energy      = entry.maxEnergy;   // instant top-off
    this.autoSave();
    return true;
  }

  buySkin(skinId, category) {
    if (this.ownedSkins.includes(skinId)) return false;
    const list = SKINS[category];
    const skin = list?.find(s => s.id === skinId);
    if (!skin || skin.currency === 'free') { this.ownedSkins.push(skinId); return true; }
    if (skin.currency === 'gems') {
      if (this.gems < skin.cost) return false;
      this.gems -= skin.cost;
    } else {
      if (this.coins < skin.cost) return false;
      this.coins -= skin.cost;
    }
    this.ownedSkins.push(skinId);
    return true;
  }

  addGems(count) { this.gems += count; this.autoSave(); }

  // ── Animals ───────────────────────────────────────────────────────────────

  buyAnimal(kind) {
    const def = ANIMALS[kind];
    if (!def || this.coins < def.cost) return false;
    this.coins -= def.cost;
    this.animals.push({ id: this._nextAnimalId++, kind, name: def.name, fed: false, unhappyDays: 0 });
    return true;
  }

  feedAnimal(id) {
    const animal = this.animals.find(a => a.id === id);
    if (!animal || animal.fed) return false;
    const def = ANIMALS[animal.kind];
    if (this.feedBags < 1) return false;
    this.feedBags--;
    animal.fed = true;
    animal.unhappyDays = 0;
    return true;
  }

  buyFeedBags(count = 10) {
    const cost = FEED_BAG_COST * count;
    if (this.coins < cost) return false;
    this.coins -= cost;
    this.feedBags += count;
    return true;
  }

  _collectAnimalProducts() {
    for (const animal of this.animals) {
      const def = ANIMALS[animal.kind];
      animal.productionCooldown = animal.productionCooldown || 0;
      if (animal.fed) {
        if (animal.productionCooldown > 0) {
          // D.2: recovering from neglect — fed days count down the cooldown,
          // but no product until it reaches 0.
          animal.productionCooldown--;
        } else {
          this.animalProducts[def.product] = (this.animalProducts[def.product] || 0) + 1;
          this.milestones.eggsCollected++;
        }
      } else {
        animal.unhappyDays++;
        // D.2: neglecting 3+ days sets a 2-day recovery cooldown — feeding alone
        // won't immediately restore products; the animal has to recover first.
        if (animal.unhappyDays >= 3) animal.productionCooldown = 2;
      }
      animal.fed = false;
    }
  }

  sellAnimalProduct(product, count = 1) {
    if ((this.animalProducts[product] || 0) < count) return false;
    const price = Object.values(ANIMALS).find(a => a.product === product)?.productSell || 0;
    this.animalProducts[product] -= count;
    const earned = price * count;
    this.coins += earned;
    this.totalCoinsEarned += earned;
    return true;
  }

  // ── Crafting ──────────────────────────────────────────────────────────────

  startCraft(slotIdx, recipeKey) {
    if (slotIdx >= this.craftingSlotsUnlocked) return false;
    if (this.craftingSlots[slotIdx] !== null) return false;
    const recipe = RECIPES[recipeKey];
    if (!recipe) return false;
    // C.3: input/qty may be a string or an array (multi-ingredient).
    const inputs = Array.isArray(recipe.input) ? recipe.input : [recipe.input];
    const qtys   = Array.isArray(recipe.qty)   ? recipe.qty   : [recipe.qty];
    for (let i = 0; i < inputs.length; i++) {
      if ((this.harvestInventory[inputs[i]] || 0) < qtys[i]) return false;
    }
    for (let i = 0; i < inputs.length; i++) {
      this._consumeQuality(inputs[i], qtys[i], false);   // use normal crops first, keep stars
    }
    this.craftingSlots[slotIdx] = { recipeKey, daysLeft: recipe.days };
    return true;
  }

  _advanceCrafting() {
    for (let i = 0; i < this.craftingSlots.length; i++) {
      const slot = this.craftingSlots[i];
      if (!slot) continue;
      slot.daysLeft--;
      if (slot.daysLeft <= 0) {
        this.craftingSlots[i] = { recipeKey: slot.recipeKey, daysLeft: 0, done: true };
      }
    }
  }

  collectCraft(slotIdx) {
    const slot = this.craftingSlots[slotIdx];
    if (!slot || !slot.done) return null;
    this.artisanInventory[slot.recipeKey] = (this.artisanInventory[slot.recipeKey] || 0) + 1;
    this.craftingSlots[slotIdx] = null;
    this.milestones.crafted++;
    return RECIPES[slot.recipeKey] || { label: 'item' };
  }

  sellArtisan(recipeKey, count = 1) {
    if ((this.artisanInventory[recipeKey] || 0) < count) return false;
    const recipe = RECIPES[recipeKey];
    if (!recipe) return false;
    this.artisanInventory[recipeKey] -= count;
    const earned = recipe.sellPrice * count;
    this.coins += earned;
    this.totalCoinsEarned += earned;
    return true;
  }

  unlockExtraCraftSlot() {
    if (this.craftingSlotsUnlocked >= 2) return false;
    if (this.coins < EXTRA_CRAFT_SLOT_COST) return false;
    this.coins -= EXTRA_CRAFT_SLOT_COST;
    this.craftingSlotsUnlocked = 2;
    return true;
  }

  // ── Fishing ───────────────────────────────────────────────────────────────

  catchFish(kind) {
    this.fishInventory[kind] = (this.fishInventory[kind] || 0) + 1;
    this.milestones.fishCaught++;
    this.milestones.fishCaughtByKind[kind] = (this.milestones.fishCaughtByKind[kind] || 0) + 1;
    if (kind === 'legendary') this.milestones.legendaryFish++;
    this.checkAchievements();
  }

  sellFish(kind, count = 1) {
    if ((this.fishInventory[kind] || 0) < count) return false;
    const def = FISH[kind];
    if (!def) return false;
    this.fishInventory[kind] -= count;
    const earned = def.sellPrice * count;
    this.coins += earned;
    this.totalCoinsEarned += earned;
    return true;
  }

  // ── Quests ────────────────────────────────────────────────────────────────

  checkQuests() {
    for (const q of QUESTS) {
      if (this.claimedQuests.includes(q.id) || this.completedQuests.includes(q.id)) continue;
      if (this._questMet(q)) this.completedQuests.push(q.id);
    }
  }

  _questMet(q) {
    const m = this.milestones;
    switch (q.id) {
      case 'q1':  return m.totalHarvested >= 5;
      case 'q2':  return this.totalCoinsEarned >= 200;
      case 'q3':  return this._allBasicCropsGrown();
      case 'q4':  return m.rainyDays >= 3;
      case 'q5':  return this.animals.length >= 1;
      case 'q6':  return m.eggsCollected >= 10;
      case 'q7':  return m.fishCaught >= 10;
      case 'q8':  return m.crafted >= 5;
      case 'q9':  return m.seasonsCompleted >= 4;
      case 'q10': return this.farmSizeId >= 4;
      case 'q11': return m.totalHarvested >= 100;
      case 'q12': return m.legendaryFish >= 1;
      case 'q13': return this.homeLayout.length >= 5;
      case 'q14': return this._allTier3();
      case 'q15': return this.day >= 100;
      default: return false;
    }
  }

  claimQuest(id) {
    if (!this.completedQuests.includes(id) || this.claimedQuests.includes(id)) return false;
    const q = QUESTS.find(q => q.id === id);
    if (!q) return false;
    if (q.reward.coins) this.coins += q.reward.coins;
    if (q.reward.gems)  this.gems  += q.reward.gems;
    this.completedQuests = this.completedQuests.filter(i => i !== id);
    this.claimedQuests.push(id);
    return true;
  }

  unclaimedQuestCount() {
    return this.completedQuests.filter(id => !this.claimedQuests.includes(id)).length;
  }

  _allBasicCropsGrown() {
    const basic = ['wheat', 'tomato', 'corn', 'pumpkin'];
    return basic.every(k => (this.milestones.cropsGrownByKind[k] || 0) > 0);
  }

  _allTier3() {
    return this.machineryTiers.hoe >= 3 &&
           this.machineryTiers.wateringCan >= 3 &&
           this.machineryTiers.harvester >= 2; // harvester only has 2 tiers
  }

  // ── Achievements (mirror the quest claim model) ─────────────────────────────

  checkAchievements() {
    const before = this.completedAchievements.length;
    for (const a of ACHIEVEMENTS) {
      if (this.claimedAchievements.includes(a.id) || this.completedAchievements.includes(a.id)) continue;
      if (this._achievementMet(a)) this.completedAchievements.push(a.id);
    }
    // B.3 one-time tutorial: first achievement completion. Flagged here; main.js
    // / ui.js show the toast when they update HUD next frame.
    if (this.completedAchievements.length > before && !this.tutorialFlags.achievement) {
      this.tutorialFlags.achievement = true;
      this._pendingAchievementTutorial = true;
    }
  }

  _achievementMet(a) {
    const m = this.milestones;
    switch (a.id) {
      case 'a1': return Object.keys(CROPS).every(k => (m.cropsGrownByKind[k] || 0) > 0);
      case 'a2': return Object.keys(FISH).every(k => (m.fishCaughtByKind[k] || 0) > 0);
      case 'a3': return m.goldCropsHarvested >= 1;
      case 'a4': return m.goldCropsHarvested >= 50;
      case 'a5': return this.totalCoinsEarned >= 10000;
      case 'a6': return ['chicken', 'cow', 'sheep'].every(k => this.animals.some(an => an.kind === k));
      case 'a7': return m.crafted >= 25;
      case 'a8': return this.staminaTier >= STAMINA_TIERS.length;
      default: return false;
    }
  }

  claimAchievement(id) {
    if (!this.completedAchievements.includes(id) || this.claimedAchievements.includes(id)) return false;
    const a = ACHIEVEMENTS.find(a => a.id === id);
    if (!a) return false;
    if (a.reward.coins) this.coins += a.reward.coins;
    if (a.reward.gems)  this.gems  += a.reward.gems;
    this.completedAchievements = this.completedAchievements.filter(i => i !== id);
    this.claimedAchievements.push(id);
    return true;
  }

  unclaimedAchievementCount() {
    return this.completedAchievements.filter(id => !this.claimedAchievements.includes(id)).length;
  }

  // ── Save / Load ───────────────────────────────────────────────────────────

  autoSave() { saveGame(this.serialize()); }

  serialize() {
    return {
      savedAt: Date.now(),
      day: this.day, coins: this.coins, gems: this.gems, totalCoinsEarned: this.totalCoinsEarned,
      farmSizeId: this.farmSizeId, machineryTiers: this.machineryTiers,
      ownedSkins: this.ownedSkins, homeLayout: this.homeLayout, houseSkin: this.houseSkin,
      seedInventory: this.seedInventory, harvestInventory: this.harvestInventory, cropQuality: this.cropQuality,
      energy: this.energy, maxEnergy: this.maxEnergy, staminaTier: this.staminaTier,
      timeOfDay: this.timeOfDay,
      season: this.season, seasonDay: this.seasonDay, weather: this.weather,
      animals: this.animals, feedBags: this.feedBags, animalProducts: this.animalProducts,
      craftingSlots: this.craftingSlots, artisanInventory: this.artisanInventory, craftingSlotsUnlocked: this.craftingSlotsUnlocked,
      fishInventory: this.fishInventory,
      completedQuests: this.completedQuests, claimedQuests: this.claimedQuests,
      completedAchievements: this.completedAchievements, claimedAchievements: this.claimedAchievements,
      milestones: this.milestones, lastLoginDate: this.lastLoginDate,
      dayAccumulatorMs: this._dayAccumulatorMs, tutorialSeen: this.tutorialSeen,
      tutorialFlags: this.tutorialFlags,
      farm: this.farm.serialize(),
      player: this.player.serialize(),
    };
  }

  static fromSave(d) {
    const g = new Game();
    g.day = d.day; g.coins = d.coins; g.gems = d.gems; g.totalCoinsEarned = d.totalCoinsEarned || 0;
    g.farmSizeId = d.farmSizeId; g.machineryTiers = d.machineryTiers;
    g.ownedSkins = d.ownedSkins || ['default', 'classic'];
    g.homeLayout = d.homeLayout || []; g.houseSkin = d.houseSkin || 'classic';
    // Merge saved inventories over a zero-filled map of ALL crops so any newly
    // added crop automatically appears (at 0) in older saves.
    const zeroInv = Object.fromEntries(Object.keys(CROPS).map(k => [k, 0]));
    g.seedInventory    = { ...zeroInv, ...d.seedInventory };
    g.harvestInventory = { ...zeroInv, ...d.harvestInventory };
    const zeroQ = Object.fromEntries(Object.keys(CROPS).map(k => [k, { silver: 0, gold: 0 }]));
    g.cropQuality = { ...zeroQ, ...(d.cropQuality || {}) };
    g.timeOfDay = d.timeOfDay ?? (5 / 24);
    g.staminaTier = d.staminaTier ?? 1;
    const staminaEntry = STAMINA_TIERS.find(t => t.tier === g.staminaTier) || STAMINA_TIERS[0];
    g.maxEnergy = d.maxEnergy ?? staminaEntry.maxEnergy;
    g.energy    = d.energy    ?? g.maxEnergy;
    g.season = d.season || 0; g.seasonDay = d.seasonDay || 0; g.weather = d.weather || 'sunny';
    g.animals = d.animals || []; g.feedBags = d.feedBags ?? 10; g.animalProducts = d.animalProducts || { egg: 0, milk: 0, wool: 0 };
    // Migrate old saves: re-assign unique sequential ids so feed lookups can't collide.
    // Also default the D.2 productionCooldown so existing animals don't crash.
    g._nextAnimalId = 1;
    for (const a of g.animals) { a.id = g._nextAnimalId++; a.productionCooldown ??= 0; }
    g.craftingSlots = d.craftingSlots || [null, null]; g.artisanInventory = d.artisanInventory || {}; g.craftingSlotsUnlocked = d.craftingSlotsUnlocked || 1;
    g.fishInventory = d.fishInventory || {};
    g.completedQuests = d.completedQuests || []; g.claimedQuests = d.claimedQuests || [];
    g.completedAchievements = d.completedAchievements || []; g.claimedAchievements = d.claimedAchievements || [];
    g.milestones = { totalHarvested: 0, daysPlayed: 0, rainyDays: 0, eggsCollected: 0, fishCaught: 0, crafted: 0, seasonsCompleted: 0, legendaryFish: 0, goldCropsHarvested: 0, cropsGrownByKind: {}, fishCaughtByKind: {}, ...(d.milestones || {}) };
    g.lastLoginDate = d.lastLoginDate || null;
    g._dayAccumulatorMs = d.dayAccumulatorMs || 0;
    g.tutorialSeen = d.tutorialSeen || false;
    g.tutorialFlags = { goldStar: false, achievement: false, offSeason: false, ...(d.tutorialFlags || {}) };
    g.farm = Farm.deserialize(d.farm);
    g.player = Player.deserialize(d.player);

    // ── Offline catch-up ──────────────────────────────────────────────────
    const now = Date.now();
    const savedAt = d.savedAt || now;
    const offlineMs = Math.min(Math.max(0, now - savedAt), OFFLINE_DAY_CAP * DAY_MS);

    if (offlineMs > 0) {
      const autoWater = g._autoWaterActive();

      // Crops kept growing while away — until they dried (unless Auto-Drip)
      for (let y = 0; y < g.farm.rows; y++) {
        for (let x = 0; x < g.farm.cols; x++) {
          const crop = g.farm.tiles[y][x].crop;
          if (!crop || crop.stage >= 3) continue;
          const def = CROPS[crop.kind];
          if (!def) continue;

          // Absolute time the crop stops growing without water
          const dryAt = autoWater ? Infinity : crop.lastWateredAt + def.waterIntervalMs;
          // It only accrues growth during the offline window [savedAt, now]
          const growEnd = Math.min(now, dryAt);
          const offlineGrow = Math.max(0, growEnd - savedAt);
          crop.totalGrownMs = Math.min(def.growMs, crop.totalGrownMs + offlineGrow);
          if (!autoWater && now >= dryAt) crop.isDry = true;

          const p = crop.totalGrownMs / def.growMs;
          crop.stage = p >= 1 ? 3 : Math.floor(p * 3);
        }
      }

      // Game days also passed while away (seasons/animals/crafting/quests)
      g._dayAccumulatorMs += offlineMs;
      let days = 0;
      while (g._dayAccumulatorMs >= DAY_MS && days < OFFLINE_DAY_CAP) {
        g._dayAccumulatorMs -= DAY_MS;
        g._advanceGameDay();
        days++;
      }
      if (g._dayAccumulatorMs > DAY_MS) g._dayAccumulatorMs = 0; // discard overflow past the cap
    }

    return g;
  }
}
