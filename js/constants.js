export const TILE_SIZE = 48;

export const FARM_SIZES = [
  { id: 1, cols: 10, rows: 8,  name: 'Starter Plot', coinCost: 0,     gemCost: 0   },
  { id: 2, cols: 15, rows: 12, name: 'Small Farm',   coinCost: 2000,  gemCost: 50  },
  { id: 3, cols: 20, rows: 16, name: 'Medium Farm',  coinCost: 10000, gemCost: 150 },
  { id: 4, cols: 30, rows: 24, name: 'Large Farm',   coinCost: 50000, gemCost: 400 },
];

export const CROPS = {
  wheat:        { label: 'Wheat',        daysToGrow: 3,  seedCost: 5,   sellPrice: 12,  gemSeedCost: null, color: '#f5c842', darkColor: '#c8a020' },
  tomato:       { label: 'Tomato',       daysToGrow: 5,  seedCost: 10,  sellPrice: 28,  gemSeedCost: null, color: '#e84040', darkColor: '#b02020' },
  corn:         { label: 'Corn',         daysToGrow: 7,  seedCost: 15,  sellPrice: 55,  gemSeedCost: null, color: '#f0d050', darkColor: '#c8a800' },
  pumpkin:      { label: 'Pumpkin',      daysToGrow: 10, seedCost: 20,  sellPrice: 100, gemSeedCost: null, color: '#e87820', darkColor: '#b05010' },
  golden_wheat: { label: 'Golden Wheat', daysToGrow: 2,  seedCost: 0,   sellPrice: 80,  gemSeedCost: 5,    color: '#ffe066', darkColor: '#d4a800' },
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
    { tier: 3, name: 'Auto-Drip',    aoe: 999, unlockCoins: 8000, unlockGems: 200 },
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

export const DAILY_GEM_REWARD = 3;
export const STARTING_COINS = 100;
export const STARTING_GEMS = 10;
export const HOME_COLS = 8;
export const HOME_ROWS = 6;
