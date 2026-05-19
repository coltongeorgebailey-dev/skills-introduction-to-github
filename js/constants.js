export const TILE_SIZE = 48;

// Walkable wild space (in tiles) around the farm fence on every side.
export const WORLD_PAD = 7;

// Buildings live outside the fence in the wild band. The player walks up to
// the NPC (stationed one tile below the building's door) and talks to enter.
// Footprint = tiles [x .. x+w-1] x [y .. y+h-1]; coords are world tiles
// (negative / beyond farm cols-rows = outside the fence).
export const BUILDINGS = [
  { id: 'market',   action: 'market',   icon: '🛒', label: 'Market',   color: '#c98a3a', x: -6, y: -4, w: 2, h: 2,
    npc: { x: -6, y: -2, name: 'Shopkeep', line: 'Welcome to the Market! Buy seeds or sell your harvest.' } },
  { id: 'barn',     action: 'barn',     icon: '🐄', label: 'Barn',     color: '#b5552f', x: -3, y: -4, w: 2, h: 2,
    npc: { x: -3, y: -2, name: 'Rancher', line: 'Come on in and check on your animals.' } },
  { id: 'home',     action: 'home',     icon: '🏠', label: 'Home',     color: '#d4a86a', x:  0, y: -4, w: 2, h: 2,
    npc: { x:  0, y: -2, name: 'Home',    line: 'Home sweet home. Decorate however you like!' } },
  { id: 'upgrades', action: 'upgrades', icon: '⭐', label: 'Upgrades', color: '#6a8fc9', x:  3, y: -4, w: 2, h: 2,
    npc: { x:  3, y: -2, name: 'Engineer', line: 'Need better tools? I can upgrade your gear.' } },
  { id: 'skins',    action: 'skins',    icon: '🎨', label: 'Skins',    color: '#b06ac9', x:  6, y: -4, w: 2, h: 2,
    npc: { x:  6, y: -2, name: 'Tailor',  line: 'Fancy a fresh new look?' } },
  { id: 'gems',     action: 'gems',     icon: '💎', label: 'Gems',     color: '#3aa0c9', x:  9, y: -4, w: 2, h: 2,
    npc: { x:  9, y: -2, name: 'Jeweler', line: 'Gems for sale — shiny, rare, and powerful!' } },
  { id: 'quests',   action: 'quests',   icon: '📜', label: 'Quests',   color: '#c9b03a', x: 12, y: -4, w: 2, h: 2,
    npc: { x: 12, y: -2, name: 'Mayor',   line: 'The town needs your help. Check the quest board!' } },
];

export const FARM_SIZES = [
  { id: 1, cols: 10, rows: 8,  name: 'Starter Plot', coinCost: 0,     gemCost: 0   },
  { id: 2, cols: 15, rows: 12, name: 'Small Farm',   coinCost: 2000,  gemCost: 50  },
  { id: 3, cols: 20, rows: 16, name: 'Medium Farm',  coinCost: 10000, gemCost: 150 },
  { id: 4, cols: 30, rows: 24, name: 'Large Farm',   coinCost: 50000, gemCost: 400 },
];

// seasons: null = grows in all seasons; array = only those seasons
// growMs: real-time ms to fully grow; waterIntervalMs: re-water within this window or crop dries
export const CROPS = {
  wheat:        { label: 'Wheat',        daysToGrow: 3,  seedCost: 5,   sellPrice: 12,  gemSeedCost: null, color: '#f5c842', darkColor: '#c8a020', seasons: null,              growMs: 180000,  waterIntervalMs: 120000 },
  tomato:       { label: 'Tomato',       daysToGrow: 5,  seedCost: 10,  sellPrice: 28,  gemSeedCost: null, color: '#e84040', darkColor: '#b02020', seasons: ['Spring','Summer'], growMs: 300000,  waterIntervalMs: 120000 },
  corn:         { label: 'Corn',         daysToGrow: 7,  seedCost: 15,  sellPrice: 70,  gemSeedCost: null, color: '#f0d050', darkColor: '#c8a800', seasons: ['Summer','Fall'],  growMs: 420000,  waterIntervalMs: 120000 },
  pumpkin:      { label: 'Pumpkin',      daysToGrow: 10, seedCost: 20,  sellPrice: 140, gemSeedCost: null, color: '#e87820', darkColor: '#b05010', seasons: ['Fall'],           growMs: 720000,  waterIntervalMs: 120000 },
  golden_wheat: { label: 'Golden Wheat', daysToGrow: 2,  seedCost: 0,   sellPrice: 80,  gemSeedCost: 5,    color: '#ffe066', darkColor: '#d4a800', seasons: null,              growMs: 120000,  waterIntervalMs: 120000 },
};

export const MACHINERY = {
  hoe: [
    { tier: 1, name: 'Hand Hoe',    aoe: 1,   unlockCoins: 0,    unlockGems: 0   },
    { tier: 2, name: 'Iron Hoe',    aoe: 2,   unlockCoins: 500,  unlockGems: 20  },
    { tier: 3, name: 'Tractor',     aoe: 6,   unlockCoins: 5000, unlockGems: 100 },
  ],
  wateringCan: [
    { tier: 1, name: 'Watering Can', aoe: 1,   unlockCoins: 0,    unlockGems: 0   },
    { tier: 2, name: 'Sprinkler',    aoe: 4,   unlockCoins: 800,  unlockGems: 30  },
    { tier: 3, name: 'Auto-Drip',    aoe: 999, unlockCoins: 3500, unlockGems: 120 },
  ],
  harvester: [
    { tier: 1, name: 'Scythe',     aoe: 1, unlockCoins: 0,    unlockGems: 0  },
    { tier: 2, name: 'Harvester',  aoe: 5, unlockCoins: 3000, unlockGems: 80 },
  ],
};

export const SKINS = {
  player: [
    { id: 'default', name: 'Farmer',      cost: 0,   currency: 'free',  bodyColor: '#4488ff', hatColor: '#8B5E3C' },
    { id: 'cowboy',  name: 'Cowboy',      cost: 200, currency: 'gems',  bodyColor: '#cc6633', hatColor: '#5c3a1e' },
    { id: 'astro',   name: 'Space Farmer',cost: 500, currency: 'gems',  bodyColor: '#888888', hatColor: '#ffffff' },
  ],
  house: [
    { id: 'classic', name: 'Classic',  cost: 0,    currency: 'free',  wallColor: '#d4a86a', roofColor: '#8B2020' },
    { id: 'rustic',  name: 'Rustic',   cost: 5000, currency: 'coins', wallColor: '#8B6040', roofColor: '#4a3020' },
    { id: 'modern',  name: 'Modern',   cost: 400,  currency: 'gems',  wallColor: '#e0e0e0', roofColor: '#404040' },
  ],
};

export const FURNITURE = [
  { id: 'bed',       label: 'Bed',       w: 2, h: 1, color: '#8888ff', cost: 200  },
  { id: 'table',     label: 'Table',     w: 2, h: 1, color: '#c8a050', cost: 150  },
  { id: 'chair',     label: 'Chair',     w: 1, h: 1, color: '#c87030', cost: 80   },
  { id: 'plant',     label: 'Pot Plant', w: 1, h: 1, color: '#30aa30', cost: 50   },
  { id: 'fireplace', label: 'Fireplace', w: 2, h: 1, color: '#888888', cost: 500  },
  { id: 'bookshelf', label: 'Bookshelf', w: 1, h: 2, color: '#8B5E3C', cost: 300  },
  { id: 'rug',       label: 'Rug',       w: 3, h: 2, color: '#aa3333', cost: 400  },
];

export const GEM_PACKS = [
  { id: 'small',  gems: 80,   label: '$0.99', stripeLink: '' },
  { id: 'medium', gems: 500,  label: '$4.99', stripeLink: '' },
  { id: 'large',  gems: 1200, label: '$9.99', stripeLink: '' },
  { id: 'xl',     gems: 2600, label: '$19.99',stripeLink: '' },
];

// ── Seasons & Weather ────────────────────────────────────────────────────────

export const SEASONS = ['Spring', 'Summer', 'Fall', 'Winter'];
export const SEASON_DAYS = 7;
export const SEASON_ICONS = ['🌸', '☀️', '🍂', '❄️'];

export const WEATHER_TYPES = [
  { id: 'sunny',  label: 'Sunny',  icon: '☀️',  weight: 50, autoWater: false, yieldBonus: 0    },
  { id: 'cloudy', label: 'Cloudy', icon: '⛅',  weight: 25, autoWater: false, yieldBonus: 0    },
  { id: 'rainy',  label: 'Rainy',  icon: '🌧️', weight: 20, autoWater: true,  yieldBonus: 0    },
  { id: 'stormy', label: 'Stormy', icon: '⛈️', weight: 5,  autoWater: true,  yieldBonus: 0.20 },
];

// ── Animals ──────────────────────────────────────────────────────────────────

export const ANIMALS = {
  chicken: { name: 'Chicken', cost: 500,  feedCost: 5,  product: 'egg',  productSell: 18, color: '#f0e060' },
  cow:     { name: 'Cow',     cost: 2000, feedCost: 12, product: 'milk', productSell: 45, color: '#e8e8e8' },
  sheep:   { name: 'Sheep',   cost: 1500, feedCost: 10, product: 'wool', productSell: 35, color: '#d8d0c8' },
};
export const FEED_BAG_COST = 8;

// ── Crafting ─────────────────────────────────────────────────────────────────

export const RECIPES = {
  flour:       { label: 'Flour',        input: 'wheat',        qty: 3, days: 1, sellPrice: 50  },
  sauce:       { label: 'Tomato Sauce', input: 'tomato',       qty: 4, days: 2, sellPrice: 95  },
  cornmeal:    { label: 'Cornmeal',     input: 'corn',         qty: 3, days: 1, sellPrice: 120 },
  pie:         { label: 'Pumpkin Pie',  input: 'pumpkin',      qty: 2, days: 2, sellPrice: 230 },
  goldenbread: { label: 'Gold Bread',   input: 'golden_wheat', qty: 5, days: 1, sellPrice: 320 },
};
export const EXTRA_CRAFT_SLOT_COST = 2000;

// ── Fishing ──────────────────────────────────────────────────────────────────

export const FISH = {
  minnow:    { label: 'Minnow',      sellPrice: 8,   weight: 50 },
  carp:      { label: 'Carp',        sellPrice: 22,  weight: 30 },
  salmon:    { label: 'Salmon',      sellPrice: 55,  weight: 15 },
  catfish:   { label: 'Catfish',     sellPrice: 85,  weight: 4  },
  legendary: { label: 'Golden Fish', sellPrice: 250, weight: 1  },
};

// ── Quests ───────────────────────────────────────────────────────────────────

export const QUESTS = [
  { id: 'q1',  label: 'First Harvest',   desc: 'Harvest any 5 crops',             reward: { coins: 50   } },
  { id: 'q2',  label: 'Market Day',      desc: 'Earn 200 coins from selling',     reward: { gems: 3     } },
  { id: 'q3',  label: 'Green Thumb',     desc: 'Grow all 4 basic crop types',     reward: { coins: 200  } },
  { id: 'q4',  label: 'Rainy Days',      desc: 'Sleep through 3 rainy days',      reward: { gems: 5     } },
  { id: 'q5',  label: 'Animal Lover',    desc: 'Buy your first animal',           reward: { gems: 5     } },
  { id: 'q6',  label: 'Egg Collector',   desc: 'Collect 10 animal products',      reward: { coins: 150  } },
  { id: 'q7',  label: 'Master Angler',   desc: 'Catch 10 fish',                   reward: { coins: 300  } },
  { id: 'q8',  label: 'Artisan',         desc: 'Craft 5 artisan goods',           reward: { gems: 10    } },
  { id: 'q9',  label: 'Four Seasons',    desc: 'Survive all 4 seasons',           reward: { gems: 20    } },
  { id: 'q10', label: 'Big Farm Energy', desc: 'Expand to the Large Farm',        reward: { gems: 15    } },
  { id: 'q11', label: 'Century Harvest', desc: 'Harvest 100 crops total',         reward: { coins: 500  } },
  { id: 'q12', label: 'Legendary Catch', desc: 'Catch a Golden Fish',             reward: { gems: 25    } },
  { id: 'q13', label: 'Full House',      desc: 'Place 5 furniture items',         reward: { coins: 200  } },
  { id: 'q14', label: 'Automation Age',  desc: 'Unlock all Tier 3 machinery',     reward: { gems: 30    } },
  { id: 'q15', label: 'Farm Legend',     desc: 'Reach Day 100',                   reward: { coins: 1000, gems: 50 } },
];

// ── Misc ─────────────────────────────────────────────────────────────────────

// One in-game day passes automatically every DAY_MS of real time.
// Seasons, weather, animals, crafting and quests all advance off this clock.
export const DAY_MS = 60000; // 1 real minute = 1 game day
export const OFFLINE_DAY_CAP = 20; // max days to fast-forward when returning
export const DAILY_GEM_REWARD = 3;
export const STARTING_COINS = 100;
export const STARTING_GEMS = 10;
export const HOME_COLS = 8;
export const HOME_ROWS = 6;

// ── Art palette (Cozy Forest Cottage look) ───────────────────────────────────
// Centralized warm tones so the renderer stays consistent. Per-season sky pairs
// are [top, horizon]. foliage is a dark→light 3-tone ramp for tree canopies.
export const PALETTE = {
  sky: [
    ['#9fd0e8', '#e9f1d6'], // Spring  — soft blue → pale cream
    ['#bfe0ec', '#fdf2cf'], // Summer  — bright, warm horizon
    ['#cdbf9a', '#f3d6a0'], // Fall    — hazy amber
    ['#aebfcf', '#dfe7ee'], // Winter  — cool grey-blue
  ],
  treeline: ['#3a5a28', '#46683a', '#324f24', '#6b6a44'], // per season
  foliage:  ['#2f6a26', '#4a9a34', '#79c64a'],            // dark, mid, highlight
  foliageFall: ['#7a5a1c', '#c08828', '#e6b048'],         // autumn canopy
  trunk:     '#6b4524',
  trunkHi:   '#8f6238',
  cloud:     'rgba(255,255,255,0.88)',
  cloudSoft: 'rgba(255,255,255,0.55)',
  plaster:   '#efe2c4', // cottage wall infill
  timber:    '#6b4a2c', // half-timber beams
  timberHi:  '#8a6440',
  stone:     '#8d8a82', // chimney
  stoneHi:   '#a8a59c',
  roof:      '#7a4a2a', // shingle base
  roofHi:    '#9a6438',
  roofShade: '#5c3720',
  glassWarm: '#f6d98a', // lit windows
  path:      '#caa46a',
  pathShade: '#a9824a',
  shadow:    'rgba(0,0,0,0.18)',
  warmGlow:  'rgba(255,210,130,0.06)',
  vignette:  'rgba(0,0,0,0.13)',
};
