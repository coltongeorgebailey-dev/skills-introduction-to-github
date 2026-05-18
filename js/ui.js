import { CROPS, FARM_SIZES, MACHINERY, SKINS, FURNITURE, GEM_PACKS } from './constants.js';

export class UI {
  constructor() {
    this.$day = document.getElementById('hud-day');
    this.$coins = document.getElementById('hud-coins');
    this.$gems = document.getElementById('hud-gems');
    this.$tool = document.getElementById('hud-tool');
    this.$seed = document.getElementById('hud-seed');
    this.$notification = document.getElementById('notification');
    this._notifTimer = null;
  }

  updateHUD(game) {
    const { player } = game;
    this.$day.textContent = `Day ${game.day}`;
    this.$coins.textContent = `🪙 ${game.coins}`;
    this.$gems.textContent = `💎 ${game.gems}`;
    const toolMap = { hoe: game.getToolName('hoe'), water: game.getToolName('wateringCan'), seed: 'Seeds', scythe: game.getToolName('harvester') };
    this.$tool.textContent = toolMap[player.tool] || player.tool;
    this.$seed.textContent = player.tool === 'seed' ? `🌱 ${CROPS[player.selectedSeed]?.label || player.selectedSeed}` : '';
    this._updateTabBar(game);
  }

  _updateTabBar(game) {}

  notify(msg, duration = 2500) {
    this.$notification.textContent = msg;
    this.$notification.classList.add('show');
    clearTimeout(this._notifTimer);
    this._notifTimer = setTimeout(() => this.$notification.classList.remove('show'), duration);
  }

  // ─── Shop Modal ──────────────────────────────────────────────────────────────

  openShop(game, onBuySeed, onSellCrop) {
    const modal = document.getElementById('modal-shop');
    modal.innerHTML = '';
    modal.classList.add('active');

    const close = this._makeClose(() => modal.classList.remove('active'));
    modal.appendChild(close);

    const title = document.createElement('h2');
    title.textContent = '🛒 Market';
    modal.appendChild(title);

    // Buy seeds
    const buyH = document.createElement('h3');
    buyH.textContent = 'Buy Seeds';
    modal.appendChild(buyH);

    Object.entries(CROPS).forEach(([kind, def]) => {
      const row = document.createElement('div');
      row.className = 'shop-row';
      const costStr = def.gemSeedCost !== null ? `${def.gemSeedCost} 💎` : `${def.seedCost} 🪙`;
      row.innerHTML = `<span>${def.label}</span><span>${costStr} each</span>`;
      const btn = document.createElement('button');
      btn.textContent = 'Buy x5';
      btn.onclick = () => { if (onBuySeed(kind, 5)) { this.notify(`Bought 5 ${def.label} seeds`); this.openShop(game, onBuySeed, onSellCrop); } else this.notify('Not enough coins!'); };
      row.appendChild(btn);
      modal.appendChild(row);
    });

    // Sell crops
    const sellH = document.createElement('h3');
    sellH.textContent = 'Sell Harvest';
    modal.appendChild(sellH);

    let hasAny = false;
    Object.entries(game.harvestInventory).forEach(([kind, count]) => {
      if (count <= 0) return;
      hasAny = true;
      const def = CROPS[kind];
      const row = document.createElement('div');
      row.className = 'shop-row';
      row.innerHTML = `<span>${def.label} ×${count}</span><span>${def.sellPrice * count} 🪙</span>`;
      const btn = document.createElement('button');
      btn.textContent = 'Sell All';
      btn.onclick = () => { onSellCrop(kind, count); this.notify(`Sold ${count} ${def.label}!`); this.openShop(game, onBuySeed, onSellCrop); };
      row.appendChild(btn);
      modal.appendChild(row);
    });
    if (!hasAny) { const p = document.createElement('p'); p.textContent = 'Nothing to sell yet.'; modal.appendChild(p); }
  }

  // ─── Progression Modal ───────────────────────────────────────────────────────

  openProgression(game, onUnlockFarm, onUnlockMachinery) {
    const modal = document.getElementById('modal-progression');
    modal.innerHTML = '';
    modal.classList.add('active');

    const close = this._makeClose(() => modal.classList.remove('active'));
    modal.appendChild(close);

    const title = document.createElement('h2');
    title.textContent = '⭐ Progression';
    modal.appendChild(title);

    // Farm sizes
    const fH = document.createElement('h3'); fH.textContent = 'Farm Expansions'; modal.appendChild(fH);
    FARM_SIZES.forEach(size => {
      const row = document.createElement('div');
      row.className = 'shop-row';
      const owned = size.id <= game.farmSizeId;
      const costStr = `${size.coinCost} 🪙 or ${size.gemCost} 💎`;
      row.innerHTML = `<span>${size.name}</span><span>${owned ? '✅ Owned' : costStr}</span>`;
      if (!owned) {
        const btn = document.createElement('button');
        btn.textContent = 'Buy (coins)';
        btn.onclick = () => { if (onUnlockFarm(size.id, false)) { this.notify(`Unlocked ${size.name}!`); this.openProgression(game, onUnlockFarm, onUnlockMachinery); } else this.notify('Not enough coins!'); };
        row.appendChild(btn);
        const btnG = document.createElement('button');
        btnG.textContent = 'Buy (gems)';
        btnG.onclick = () => { if (onUnlockFarm(size.id, true)) { this.notify(`Unlocked ${size.name}!`); this.openProgression(game, onUnlockFarm, onUnlockMachinery); } else this.notify('Not enough gems!'); };
        row.appendChild(btnG);
      }
      modal.appendChild(row);
    });

    // Machinery
    const mH = document.createElement('h3'); mH.textContent = 'Machinery Upgrades'; modal.appendChild(mH);
    Object.entries(MACHINERY).forEach(([toolKey, tiers]) => {
      tiers.forEach(entry => {
        const owned = entry.tier <= game.machineryTiers[toolKey];
        const row = document.createElement('div');
        row.className = 'shop-row';
        const costStr = `${entry.unlockCoins} 🪙 or ${entry.unlockGems} 💎`;
        row.innerHTML = `<span>${entry.name} (AoE ${entry.aoe})</span><span>${owned ? '✅' : costStr}</span>`;
        if (!owned && entry.tier === (game.machineryTiers[toolKey] || 1) + 1) {
          const btn = document.createElement('button');
          btn.textContent = 'Upgrade (coins)';
          btn.onclick = () => { if (onUnlockMachinery(toolKey, entry.tier, false)) { this.notify(`Upgraded to ${entry.name}!`); this.openProgression(game, onUnlockFarm, onUnlockMachinery); } else this.notify('Not enough coins!'); };
          row.appendChild(btn);
          const btnG = document.createElement('button');
          btnG.textContent = 'Upgrade (gems)';
          btnG.onclick = () => { if (onUnlockMachinery(toolKey, entry.tier, true)) { this.notify(`Upgraded to ${entry.name}!`); this.openProgression(game, onUnlockFarm, onUnlockMachinery); } else this.notify('Not enough gems!'); };
          row.appendChild(btnG);
        }
        modal.appendChild(row);
      });
    });
  }

  // ─── Skins Modal ─────────────────────────────────────────────────────────────

  openSkins(game, onBuySkin, onEquipSkin) {
    const modal = document.getElementById('modal-skins');
    modal.innerHTML = '';
    modal.classList.add('active');

    const close = this._makeClose(() => modal.classList.remove('active'));
    modal.appendChild(close);

    const title = document.createElement('h2'); title.textContent = '🎨 Skins'; modal.appendChild(title);

    Object.entries(SKINS).forEach(([cat, list]) => {
      const h = document.createElement('h3'); h.textContent = cat === 'player' ? 'Farmer Skins' : 'House Skins'; modal.appendChild(h);
      list.forEach(skin => {
        const owned = game.ownedSkins.includes(skin.id);
        const equipped = cat === 'player' ? game.player.skin === skin.id : game.houseSkin === skin.id;
        const row = document.createElement('div'); row.className = 'shop-row';
        const costStr = skin.currency === 'free' ? 'Free' : `${skin.cost} ${skin.currency === 'gems' ? '💎' : '🪙'}`;
        row.innerHTML = `<span>${skin.name}</span><span>${owned ? (equipped ? '✨ Equipped' : '✅ Owned') : costStr}</span>`;
        if (owned && !equipped) {
          const btn = document.createElement('button'); btn.textContent = 'Equip';
          btn.onclick = () => { onEquipSkin(cat, skin.id); this.notify(`Equipped ${skin.name}!`); this.openSkins(game, onBuySkin, onEquipSkin); };
          row.appendChild(btn);
        } else if (!owned) {
          const btn = document.createElement('button'); btn.textContent = 'Buy';
          btn.onclick = () => { if (onBuySkin(skin.id, cat)) { this.notify(`Bought ${skin.name}!`); this.openSkins(game, onBuySkin, onEquipSkin); } else this.notify('Not enough!'); };
          row.appendChild(btn);
        }
        modal.appendChild(row);
      });
    });
  }

  // ─── Home Modal (furniture picker) ───────────────────────────────────────────

  openFurniturePicker(game, onPlace) {
    const modal = document.getElementById('modal-furniture');
    modal.innerHTML = '';
    modal.classList.add('active');

    const close = this._makeClose(() => modal.classList.remove('active'));
    modal.appendChild(close);

    const title = document.createElement('h2'); title.textContent = '🏠 Furniture'; modal.appendChild(title);

    FURNITURE.forEach(def => {
      const row = document.createElement('div'); row.className = 'shop-row';
      row.innerHTML = `<span>${def.label}</span><span>${def.cost} 🪙</span>`;
      const btn = document.createElement('button'); btn.textContent = 'Place';
      btn.onclick = () => {
        if (game.coins < def.cost) { this.notify('Not enough coins!'); return; }
        modal.classList.remove('active');
        this.notify(`Tap the home grid to place ${def.label}`);
        onPlace(def);
      };
      row.appendChild(btn);
      modal.appendChild(row);
    });

    // Clear all button
    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear All Furniture';
    clearBtn.style.marginTop = '12px';
    clearBtn.onclick = () => { game.homeLayout = []; game.autoSave(); modal.classList.remove('active'); this.notify('Cleared!'); };
    modal.appendChild(clearBtn);
  }

  // ─── Gem Store Modal ─────────────────────────────────────────────────────────

  openGemStore(game) {
    const modal = document.getElementById('modal-gems');
    modal.innerHTML = '';
    modal.classList.add('active');

    const close = this._makeClose(() => modal.classList.remove('active'));
    modal.appendChild(close);

    const title = document.createElement('h2'); title.textContent = '💎 Gem Store'; modal.appendChild(title);

    const note = document.createElement('p');
    note.textContent = 'Gems can also be earned through daily login and milestones.';
    note.style.fontSize = '0.85em';
    modal.appendChild(note);

    GEM_PACKS.forEach(pack => {
      const row = document.createElement('div'); row.className = 'shop-row';
      row.innerHTML = `<span>💎 ${pack.gems} Gems</span><span>${pack.label}</span>`;
      const btn = document.createElement('button'); btn.textContent = 'Buy';
      btn.onclick = () => {
        if (pack.stripeLink) {
          window.location.href = pack.stripeLink + `?client_reference_id=gems_${pack.gems}`;
        } else {
          this.notify('Stripe not configured yet. Edit GEM_PACKS in constants.js.');
        }
      };
      row.appendChild(btn);
      modal.appendChild(row);
    });
  }

  _makeClose(fn) {
    const btn = document.createElement('button');
    btn.className = 'modal-close';
    btn.textContent = '✕';
    btn.onclick = fn;
    return btn;
  }

  closeAllModals() {
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
  }
}
