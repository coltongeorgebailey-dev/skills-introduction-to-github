import {
  CROPS, FARM_SIZES, MACHINERY, SKINS, STARTING_COINS, STARTING_GEMS, DAILY_GEM_REWARD,
  SEASONS, SEASON_DAYS, WEATHER_TYPES,
  ANIMALS, FEED_BAG_COST,
  RECIPES, EXTRA_CRAFT_SLOT_COST,
  FISH,
  QUESTS,
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
    this.seedInventory = { wheat: 5, tomato: 2, corn: 0, pumpkin: 0, golden_wheat: 0 };
    this.harvestInventory = { wheat: 0, tomato: 0, corn: 0, pumpkin: 0, golden_wheat: 0 };

    // Seasons & weather
    this.season = 0;       // index into SEASONS
    this.seasonDay = 0;    // 0-based day within the season
    this.weather = 'sunny';

    // Animals
    this.animals = [];
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

    // Milestones (extended)
    this.milestones = {
      totalHarvested: 0, daysPlayed: 0,
      rainyDays: 0, eggsCollected: 0, fishCaught: 0,
      crafted: 0, seasonsCompleted: 0, legendaryFish: 0,
      cropsGrownByKind: {},
    };

    this.lastLoginDate = null;

    const size = FARM_SIZES[0];
    this.farm = new Farm(size.cols, size.rows);
    this.player = new Player();
  }

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

  canPlantCrop(kind) {
    if (this.currentSeasonName() === 'Winter') return false;
    const def = CROPS[kind];
    if (!def) return false;
    if (!def.seasons) return true;
    return def.seasons.includes(this.currentSeasonName());
  }

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
      this.season = (this.season + 1) % 4;
      if (this.season === 0) this.milestones.seasonsCompleted++;
    }
  }

  currentWeatherDef() {
    return WEATHER_TYPES.find(w => w.id === this.weather) || WEATHER_TYPES[0];
  }

  // ── Day advancement ───────────────────────────────────────────────────────

  // Delegates real-time crop growth to farm — called every frame from main loop
  tick(dt) { this.farm.tick(dt); }

  sleepToNextDay() {
    // Roll weather for the new day
    this.weather = this._rollWeather();
    const weatherDef = this.currentWeatherDef();

    // Rain/storm auto-waters all crops (resets dry timers)
    if (weatherDef.autoWater) {
      this.farm.applyWeatherWater();
      this.milestones.rainyDays++;
    }

    this._advanceSeason();
    this.day++;
    this.milestones.daysPlayed++;

    this._collectAnimalProducts();
    this._advanceCrafting();
    this._checkDailyLogin();
    this.checkQuests();
    this.autoSave();
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

  sellCrop(kind, count = 1) {
    const def = CROPS[kind];
    if (!def || (this.harvestInventory[kind] || 0) < count) return false;
    this.harvestInventory[kind] -= count;
    const earned = def.sellPrice * count;
    this.coins += earned;
    this.totalCoinsEarned += earned;
    return true;
  }

  addHarvest(harvested) {
    let total = 0;
    for (const [kind, count] of Object.entries(harvested)) {
      this.harvestInventory[kind] = (this.harvestInventory[kind] || 0) + count;
      this.milestones.cropsGrownByKind[kind] = (this.milestones.cropsGrownByKind[kind] || 0) + count;
      total += count;
    }
    this.milestones.totalHarvested += total;
    return total;
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
    this.animals.push({ id: Date.now(), kind, name: def.name, fed: false, unhappyDays: 0 });
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
      if (animal.fed) {
        this.animalProducts[def.product] = (this.animalProducts[def.product] || 0) + 1;
        this.milestones.eggsCollected++;
      } else {
        animal.unhappyDays++;
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
    const have = this.harvestInventory[recipe.input] || 0;
    if (have < recipe.qty) return false;
    this.harvestInventory[recipe.input] -= recipe.qty;
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
    if (!slot || !slot.done) return false;
    this.artisanInventory[slot.recipeKey] = (this.artisanInventory[slot.recipeKey] || 0) + 1;
    this.craftingSlots[slotIdx] = null;
    this.milestones.crafted++;
    return true;
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
    if (kind === 'legendary') this.milestones.legendaryFish++;
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

  // ── Save / Load ───────────────────────────────────────────────────────────

  autoSave() { saveGame(this.serialize()); }

  serialize() {
    return {
      savedAt: Date.now(),
      day: this.day, coins: this.coins, gems: this.gems, totalCoinsEarned: this.totalCoinsEarned,
      farmSizeId: this.farmSizeId, machineryTiers: this.machineryTiers,
      ownedSkins: this.ownedSkins, homeLayout: this.homeLayout, houseSkin: this.houseSkin,
      seedInventory: this.seedInventory, harvestInventory: this.harvestInventory,
      season: this.season, seasonDay: this.seasonDay, weather: this.weather,
      animals: this.animals, feedBags: this.feedBags, animalProducts: this.animalProducts,
      craftingSlots: this.craftingSlots, artisanInventory: this.artisanInventory, craftingSlotsUnlocked: this.craftingSlotsUnlocked,
      fishInventory: this.fishInventory,
      completedQuests: this.completedQuests, claimedQuests: this.claimedQuests,
      milestones: this.milestones, lastLoginDate: this.lastLoginDate,
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
    g.seedInventory = d.seedInventory; g.harvestInventory = d.harvestInventory;
    g.season = d.season || 0; g.seasonDay = d.seasonDay || 0; g.weather = d.weather || 'sunny';
    g.animals = d.animals || []; g.feedBags = d.feedBags ?? 10; g.animalProducts = d.animalProducts || { egg: 0, milk: 0, wool: 0 };
    g.craftingSlots = d.craftingSlots || [null, null]; g.artisanInventory = d.artisanInventory || {}; g.craftingSlotsUnlocked = d.craftingSlotsUnlocked || 1;
    g.fishInventory = d.fishInventory || {};
    g.completedQuests = d.completedQuests || []; g.claimedQuests = d.claimedQuests || [];
    g.milestones = { totalHarvested: 0, daysPlayed: 0, rainyDays: 0, eggsCollected: 0, fishCaught: 0, crafted: 0, seasonsCompleted: 0, legendaryFish: 0, cropsGrownByKind: {}, ...(d.milestones || {}) };
    g.lastLoginDate = d.lastLoginDate || null;
    g.farm = Farm.deserialize(d.farm);
    g.player = Player.deserialize(d.player);

    // Offline crop advancement — advance growth for time spent away (cap 30 min)
    const now = Date.now();
    const savedAt = d.savedAt || now;
    const offlineMs = Math.min(now - savedAt, 30 * 60 * 1000);
    if (offlineMs > 0) {
      for (let y = 0; y < g.farm.rows; y++) {
        for (let x = 0; x < g.farm.cols; x++) {
          const crop = g.farm.tiles[y][x].crop;
          if (!crop || crop.stage >= 3) continue;
          const def = CROPS[crop.kind];
          if (!def) continue;
          const timeSinceWater = now - crop.lastWateredAt;
          if (timeSinceWater > def.waterIntervalMs) {
            crop.isDry = true;
            // Only count growth up to when it dried
            const grewBeforeDry = Math.max(0, def.waterIntervalMs - Math.max(0, savedAt - crop.lastWateredAt));
            crop.totalGrownMs = Math.min(def.growMs, crop.totalGrownMs + grewBeforeDry);
          } else if (!crop.isDry) {
            crop.totalGrownMs = Math.min(def.growMs, crop.totalGrownMs + offlineMs);
          }
          const p = crop.totalGrownMs / def.growMs;
          crop.stage = p >= 1 ? 3 : Math.floor(p * 3);
        }
      }
    }

    return g;
  }
}
