import { CROPS, FARM_SIZES, MACHINERY, SKINS, STARTING_COINS, STARTING_GEMS, DAILY_GEM_REWARD } from './constants.js';
import { Farm } from './farm.js';
import { Player } from './player.js';
import { saveGame, loadGame } from './save.js';

export class Game {
  constructor() {
    this.day = 1;
    this.coins = STARTING_COINS;
    this.gems = STARTING_GEMS;
    this.farmSizeId = 1;
    this.machineryTiers = { hoe: 1, wateringCan: 1, harvester: 1 };
    this.ownedSkins = ['default', 'classic'];
    this.homeLayout = [];
    this.houseSkin = 'classic';

    this.seedInventory = { wheat: 5, tomato: 2, corn: 0, pumpkin: 0, golden_wheat: 0 };
    this.harvestInventory = { wheat: 0, tomato: 0, corn: 0, pumpkin: 0, golden_wheat: 0 };

    this.milestones = { totalHarvested: 0, daysPlayed: 0, milestone10Claimed: false, milestone50Claimed: false };
    this.lastLoginDate = null;

    const size = FARM_SIZES[0];
    this.farm = new Farm(size.cols, size.rows);
    this.player = new Player();
  }

  getToolAoe(toolKey) {
    const tier = this.machineryTiers[toolKey] || 1;
    const list = MACHINERY[toolKey];
    const entry = list.find(m => m.tier === tier) || list[0];
    return entry.aoe;
  }

  getToolName(toolKey) {
    const tier = this.machineryTiers[toolKey] || 1;
    const list = MACHINERY[toolKey];
    const entry = list.find(m => m.tier === tier) || list[0];
    return entry.name;
  }

  currentFarmSize() {
    return FARM_SIZES.find(s => s.id === this.farmSizeId) || FARM_SIZES[0];
  }

  sleepToNextDay() {
    this.farm.advanceDay();
    this.day++;
    this.milestones.daysPlayed++;
    this._checkDailyLogin();
    this._checkMilestones();
    this.autoSave();
  }

  _checkDailyLogin() {
    const today = new Date().toDateString();
    if (this.lastLoginDate !== today) {
      this.gems += DAILY_GEM_REWARD;
      this.lastLoginDate = today;
    }
  }

  _checkMilestones() {
    if (!this.milestones.milestone10Claimed && this.milestones.totalHarvested >= 10) {
      this.gems += 5;
      this.milestones.milestone10Claimed = true;
      return '5 gems! (Harvested 10 crops)';
    }
    if (!this.milestones.milestone50Claimed && this.milestones.totalHarvested >= 50) {
      this.gems += 10;
      this.milestones.milestone50Claimed = true;
      return '10 gems! (Harvested 50 crops)';
    }
    return null;
  }

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
    this.coins += def.sellPrice * count;
    return true;
  }

  addHarvest(harvested) {
    let total = 0;
    for (const [kind, count] of Object.entries(harvested)) {
      this.harvestInventory[kind] = (this.harvestInventory[kind] || 0) + count;
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
    if (!entry || tier <= this.machineryTiers[toolKey]) return false;
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
    if (!list) return false;
    const skin = list.find(s => s.id === skinId);
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

  addGems(count) {
    this.gems += count;
    this.autoSave();
  }

  autoSave() {
    saveGame(this.serialize());
  }

  serialize() {
    return {
      day: this.day, coins: this.coins, gems: this.gems,
      farmSizeId: this.farmSizeId, machineryTiers: this.machineryTiers,
      ownedSkins: this.ownedSkins, homeLayout: this.homeLayout, houseSkin: this.houseSkin,
      seedInventory: this.seedInventory, harvestInventory: this.harvestInventory,
      milestones: this.milestones, lastLoginDate: this.lastLoginDate,
      farm: this.farm.serialize(),
      player: this.player.serialize(),
    };
  }

  static fromSave(data) {
    const g = new Game();
    g.day = data.day; g.coins = data.coins; g.gems = data.gems;
    g.farmSizeId = data.farmSizeId; g.machineryTiers = data.machineryTiers;
    g.ownedSkins = data.ownedSkins || ['default', 'classic'];
    g.homeLayout = data.homeLayout || [];
    g.houseSkin = data.houseSkin || 'classic';
    g.seedInventory = data.seedInventory; g.harvestInventory = data.harvestInventory;
    g.milestones = data.milestones || { totalHarvested: 0, daysPlayed: 0 };
    g.lastLoginDate = data.lastLoginDate || null;
    g.farm = Farm.deserialize(data.farm);
    g.player = Player.deserialize(data.player);
    return g;
  }
}
