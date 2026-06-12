export const TILE_SIZE = 48;

// World render zoom — scales the whole farm view (player, crops, buildings) so
// sprite detail (e.g. pants, crop growth stages) reads clearly. Applied via
// ctx.scale in the renderer; all screen↔world conversions account for it.
export const ZOOM = 1.5;

// Walkable wild space (in tiles) around the farm fence on every side.
export const WORLD_PAD = 20;

// Buildings live outside the fence in the wild band. The player walks up to
// the NPC (stationed one tile below the building's door) and talks to enter.
// Footprint = tiles [x .. x+w-1] x [y .. y+h-1]; coords are world tiles
// (negative / beyond farm cols-rows = outside the fence).
// Shops/services — these are TOWN buildings staffed by NPCs the player talks to.
// The player's own Home and Barn live on the RIGHT side of the farm (drawn via
// _drawCottage / _drawShed in _drawProps) and have no NPC — see Game.homeHotspot
// and Game.barnHotspot for their interaction zones.
// Shops are laid out along a HALF-CIRCLE arc to the right of the player's
// cottage, forming an ARCH (∩) — peak at top, ends pointing down. Arc center
// ≈ world tile (18, 5), radius 3 tiles, sweeping the TOP half of the circle
// (angles π → 2π). Renderer draws a curved dirt path along the same arc.
export const VILLAGE_ARC = { cx: 23, cy: 5, r: 6 };
export const BUILDINGS = [
  { id: 'market',   action: 'market',   icon: '🛒', label: 'Market',   color: '#c98a3a', x: 16, y:  4, w: 2, h: 2,
    npc: { x: 16, y:  6, name: 'Shopkeep', lines: [
      'Welcome! Fresh seeds just arrived.',
      'Buy low, sell high — that\'s my motto!',
      'Pumpkins are always in demand in Fall.',
      'Heard stormy weather gives a bonus yield?',
      'Crafted goods fetch more than raw crops!',
    ]}},
  { id: 'upgrades', action: 'upgrades', icon: '⭐', label: 'Upgrades', color: '#6a8fc9', x: 18, y:  0, w: 2, h: 2,
    npc: { x: 18, y:  2, name: 'Engineer', lines: [
      'Better tools mean less work, more harvest!',
      'The Auto-Drip system changed everything for me.',
      'The Tractor can till six tiles in one pass!',
      'Save up — the Tier 3 upgrades are worth every coin.',
    ]}},
  { id: 'skins',    action: 'skins',    icon: '🎨', label: 'Skins',    color: '#b06ac9', x: 22, y: -2, w: 2, h: 2,
    npc: { x: 22, y:  0, name: 'Tailor', lines: [
      'Fancy a fresh new look?',
      'The Space Farmer suit is my personal favourite.',
      'Style matters even on the farm!',
      'New fabrics just in from the city!',
    ]}},
  { id: 'gems',     action: 'gems',     icon: '💎', label: 'Gems',     color: '#3aa0c9', x: 26, y:  0, w: 2, h: 2,
    npc: { x: 26, y:  2, name: 'Jeweler', lines: [
      'Gems — shiny, rare, and powerful!',
      'You earn a gem every day you log in.',
      'Golden Wheat seeds are only available for gems.',
      'Gems can speed up any farm expansion.',
    ]}},
  { id: 'quests',   action: 'quests',   icon: '📜', label: 'Quests',   color: '#c9b03a', x: 28, y:  4, w: 2, h: 2,
    npc: { x: 28, y:  6, name: 'Mayor', lines: [
      'The town needs your help — check the board!',
      'Complete quests to earn coins and gems.',
      'A true Farm Legend reaches Day 100!',
      'Word is someone caught a Golden Fish recently...',
    ]}},
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
  tomato:       { label: 'Tomato',       daysToGrow: 5,  seedCost: 10,  sellPrice: 38,  gemSeedCost: null, color: '#e84040', darkColor: '#b02020', seasons: ['Spring','Summer'], growMs: 300000,  waterIntervalMs: 120000 },
  corn:         { label: 'Corn',         daysToGrow: 7,  seedCost: 15,  sellPrice: 60,  gemSeedCost: null, color: '#f0d050', darkColor: '#c8a800', seasons: ['Summer','Fall'],  growMs: 420000,  waterIntervalMs: 120000 },
  pumpkin:      { label: 'Pumpkin',      daysToGrow: 10, seedCost: 20,  sellPrice: 105, gemSeedCost: null, color: '#e87820', darkColor: '#b05010', seasons: ['Fall'],           growMs: 720000,  waterIntervalMs: 120000 },
  parsnip:      { label: 'Parsnip',      daysToGrow: 4,  seedCost: 8,   sellPrice: 22,  gemSeedCost: null, color: '#f0e0b0', darkColor: '#c8b060', seasons: ['Winter'],         growMs: 240000,  waterIntervalMs: 150000 },
  potato:       { label: 'Potato',       daysToGrow: 4,  seedCost: 8,   sellPrice: 26,  gemSeedCost: null, color: '#c9a36b', darkColor: '#8f7038', seasons: ['Spring','Fall'],   growMs: 240000,  waterIntervalMs: 120000 },
  strawberry:   { label: 'Strawberry',   daysToGrow: 5,  seedCost: 15,  sellPrice: 48,  gemSeedCost: null, color: '#e8506a', darkColor: '#b02838', seasons: ['Spring','Summer'], growMs: 300000,  waterIntervalMs: 120000 },
  melon:        { label: 'Melon',        daysToGrow: 8,  seedCost: 22,  sellPrice: 90,  gemSeedCost: null, color: '#6cbf4a', darkColor: '#3f7d2c', seasons: ['Summer'],          growMs: 480000,  waterIntervalMs: 120000 },
  blueberry:    { label: 'Blueberry',    daysToGrow: 6,  seedCost: 18,  sellPrice: 64,  gemSeedCost: null, color: '#4a78d8', darkColor: '#2c4d96', seasons: ['Summer','Fall'],   growMs: 360000,  waterIntervalMs: 120000 },
  grapes:       { label: 'Grapes',       daysToGrow: 8,  seedCost: 24,  sellPrice: 95,  gemSeedCost: null, color: '#8a4fbf', darkColor: '#5e3486', seasons: ['Fall'],            growMs: 480000,  waterIntervalMs: 120000 },
  cabbage:      { label: 'Cabbage',      daysToGrow: 5,  seedCost: 12,  sellPrice: 34,  gemSeedCost: null, color: '#a8d878', darkColor: '#6f9f3a', seasons: ['Winter'],          growMs: 300000,  waterIntervalMs: 150000 },
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
  { id: 'sunny',  label: 'Sunny',  icon: '☀️',  weight: 45, autoWater: false, yieldBonus: 0    },
  { id: 'cloudy', label: 'Cloudy', icon: '⛅',  weight: 25, autoWater: false, yieldBonus: 0    },
  { id: 'rainy',  label: 'Rainy',  icon: '🌧️', weight: 25, autoWater: true,  yieldBonus: 0.10 },
  { id: 'stormy', label: 'Stormy', icon: '⛈️', weight: 5,  autoWater: true,  yieldBonus: 0.25 },
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
  flour:        { label: 'Flour',           input: 'wheat',        qty: 3, days: 1, sellPrice: 55  },
  sauce:        { label: 'Tomato Sauce',    input: 'tomato',       qty: 4, days: 2, sellPrice: 175 },
  cornmeal:     { label: 'Cornmeal',        input: 'corn',         qty: 3, days: 1, sellPrice: 210 },
  pie:          { label: 'Pumpkin Pie',     input: 'pumpkin',      qty: 2, days: 2, sellPrice: 245 },
  parsnip_stew: { label: 'Parsnip Stew',   input: 'parsnip',      qty: 3, days: 1, sellPrice: 90  },
  fries:        { label: 'French Fries',    input: 'potato',       qty: 3, days: 1, sellPrice: 100 },
  jam:          { label: 'Strawberry Jam',  input: 'strawberry',   qty: 3, days: 2, sellPrice: 185 },
  juice:        { label: 'Melon Juice',     input: 'melon',        qty: 2, days: 1, sellPrice: 215 },
  blueberry_pie:{ label: 'Blueberry Pie',   input: 'blueberry',    qty: 3, days: 2, sellPrice: 240 },
  wine:         { label: 'Wine',            input: 'grapes',       qty: 3, days: 3, sellPrice: 360 },
  sauerkraut:   { label: 'Sauerkraut',      input: 'cabbage',      qty: 3, days: 1, sellPrice: 135 },
  goldenbread:  { label: 'Gold Bread',      input: 'golden_wheat', qty: 5, days: 1, sellPrice: 440 },
  // Multi-ingredient recipes (input/qty as arrays). Margin ≈ +15-25% over raw sum.
  fruit_tart:    { label: 'Fruit Tart',     input: ['strawberry', 'blueberry'], qty: [2, 2], days: 2, sellPrice: 280 },
  farm_stew:     { label: 'Farm Stew',      input: ['potato', 'cabbage'],       qty: [2, 2], days: 1, sellPrice: 150 },
  harvest_feast: { label: 'Harvest Feast',  input: ['pumpkin', 'corn'],         qty: [1, 2], days: 2, sellPrice: 280 },
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

// ── Crop Quality ─────────────────────────────────────────────────────────────
// Harvested crops roll a quality tier; higher tiers sell for more.
export const QUALITY_MULT = { normal: 1, silver: 1.25, gold: 1.5 };

// ── Achievements (collections & milestones) ──────────────────────────────────
// Same shape as QUESTS (claimable for a reward). Conditions checked in
// game._achievementMet().
export const ACHIEVEMENTS = [
  { id: 'a1', label: 'Botanist',       desc: 'Grow all 12 crop kinds',        reward: { gems: 75   } },
  { id: 'a2', label: 'Aquarist',       desc: 'Catch all 5 fish kinds',        reward: { gems: 50   } },
  { id: 'a3', label: 'Perfectionist',  desc: 'Harvest your first gold crop',  reward: { coins: 200 } },
  { id: 'a4', label: 'Master Grower',  desc: 'Harvest 50 gold-star crops',    reward: { gems: 80   } },
  { id: 'a5', label: 'Tycoon',         desc: 'Earn 10,000 coins total',       reward: { gems: 60   } },
  { id: 'a6', label: 'Rancher',        desc: 'Own all 3 animal kinds',        reward: { coins: 400 } },
  { id: 'a7', label: 'Artisan Master', desc: 'Craft 25 artisan goods',        reward: { gems: 20   } },
  { id: 'a8', label: 'Well Rested',    desc: 'Reach max stamina',             reward: { coins: 300 } },
];

// ── Energy / Stamina ─────────────────────────────────────────────────────────

// Each tool use costs 1 energy; fishing costs 2. Energy resets on sleep.
export const STARTING_ENERGY = 20;
export const MAX_ENERGY       = 20;

// Stamina upgrade path — buy at the Upgrades shop to raise max energy.
// Tier 1 is the default (no purchase). Each subsequent tier replaces maxEnergy.
export const STAMINA_TIERS = [
  { tier: 1, name: 'Hand Stamina',    maxEnergy: 20, unlockCoins: 0,    unlockGems: 0   },
  { tier: 2, name: 'Hearty Stamina',  maxEnergy: 25, unlockCoins: 1000, unlockGems: 40  },
  { tier: 3, name: 'Iron Stamina',    maxEnergy: 30, unlockCoins: 4000, unlockGems: 100 },
];

// ── Seasonal Market Pricing ───────────────────────────────────────────────────
// Actual sell price = base sellPrice × multiplier for the current season.
// High multiplier = that crop is scarce / in demand this season.
export const SEASON_CROP_PRICES = {
  wheat:        { Spring: 1.5, Summer: 1.0, Fall: 1.0, Winter: 1.2 },
  tomato:       { Spring: 1.0, Summer: 1.0, Fall: 1.4, Winter: 1.5 },
  corn:         { Spring: 1.3, Summer: 1.0, Fall: 1.0, Winter: 1.8 },
  pumpkin:      { Spring: 2.0, Summer: 1.5, Fall: 1.0, Winter: 1.5 },
  parsnip:      { Spring: 1.5, Summer: 1.3, Fall: 1.3, Winter: 1.0 },
  potato:       { Spring: 1.0, Summer: 1.3, Fall: 1.0, Winter: 1.5 },
  strawberry:   { Spring: 1.0, Summer: 1.2, Fall: 1.5, Winter: 1.8 },
  melon:        { Spring: 1.4, Summer: 1.0, Fall: 1.3, Winter: 1.8 },
  blueberry:    { Spring: 1.3, Summer: 1.0, Fall: 1.0, Winter: 1.6 },
  grapes:       { Spring: 1.6, Summer: 1.3, Fall: 1.0, Winter: 1.6 },
  cabbage:      { Spring: 1.4, Summer: 1.4, Fall: 1.2, Winter: 1.0 },
  golden_wheat: { Spring: 1.0, Summer: 1.0, Fall: 1.0, Winter: 1.0 },
};

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
