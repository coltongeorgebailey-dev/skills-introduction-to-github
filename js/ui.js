import { CROPS, FARM_SIZES, MACHINERY, SKINS, FURNITURE, GEM_PACKS, SEASONS, SEASON_ICONS, WEATHER_TYPES, ANIMALS, FEED_BAG_COST, RECIPES, EXTRA_CRAFT_SLOT_COST, FISH, QUESTS } from './constants.js';

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
    const toolMap = { hoe: game.getToolName('hoe'), water: game.getToolName('wateringCan'), seed: 'Seeds', scythe: game.getToolName('harvester'), fishing: '🎣 Rod' };
    this.$tool.textContent = toolMap[player.tool] || player.tool;
    this.$seed.textContent = player.tool === 'seed' ? `🌱 ${CROPS[player.selectedSeed]?.label || player.selectedSeed}` : '';

    // Season + weather
    const seasonEl = document.getElementById('hud-season');
    if (seasonEl) {
      const wDef = WEATHER_TYPES.find(w => w.id === game.weather) || WEATHER_TYPES[0];
      seasonEl.textContent = `${SEASON_ICONS[game.season]} ${SEASONS[game.season]} ${wDef.icon} · Day ${game.seasonDay + 1}/${7}`;
    }

    // Quest badge
    const questBadge = document.getElementById('quest-badge');
    if (questBadge) {
      const count = game.unclaimedQuestCount();
      questBadge.textContent = count > 0 ? count : '';
      questBadge.style.display = count > 0 ? 'inline' : 'none';
    }

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

    // Buy seeds (with season restriction hint)
    const buyH = document.createElement('h3');
    buyH.textContent = 'Buy Seeds';
    modal.appendChild(buyH);

    Object.entries(CROPS).forEach(([kind, def]) => {
      const row = document.createElement('div');
      row.className = 'shop-row';
      const costStr = def.gemSeedCost !== null ? `${def.gemSeedCost} 💎` : `${def.seedCost} 🪙`;
      const seasonHint = def.seasons ? ` (${def.seasons.join('/')})` : '';
      row.innerHTML = `<span>${def.label}${seasonHint}</span><span>${costStr} each</span>`;
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

    let hasAnyCrop = false;
    Object.entries(game.harvestInventory).forEach(([kind, count]) => {
      if (count <= 0) return;
      hasAnyCrop = true;
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

    // Sell artisan goods
    Object.entries(game.artisanInventory || {}).forEach(([key, count]) => {
      if (count <= 0) return;
      hasAnyCrop = true;
      const recipe = (RECIPES || {})[key];
      if (!recipe) return;
      const row = document.createElement('div'); row.className = 'shop-row';
      row.innerHTML = `<span>🏺 ${recipe.label} ×${count}</span><span>${recipe.sellPrice * count} 🪙</span>`;
      const btn = document.createElement('button'); btn.textContent = 'Sell All';
      btn.onclick = () => { game.sellArtisan(key, count); this.notify(`Sold ${count} ${recipe.label}!`); this.openShop(game, onBuySeed, onSellCrop); };
      row.appendChild(btn); modal.appendChild(row);
    });

    // Sell animal products
    Object.entries(game.animalProducts || {}).forEach(([product, count]) => {
      if (count <= 0) return;
      hasAnyCrop = true;
      const animalDef = Object.values(ANIMALS).find(a => a.product === product);
      if (!animalDef) return;
      const row = document.createElement('div'); row.className = 'shop-row';
      row.innerHTML = `<span>${product === 'egg' ? '🥚' : product === 'milk' ? '🥛' : '🧶'} ${product.charAt(0).toUpperCase() + product.slice(1)} ×${count}</span><span>${animalDef.productSell * count} 🪙</span>`;
      const btn = document.createElement('button'); btn.textContent = 'Sell All';
      btn.onclick = () => { game.sellAnimalProduct(product, count); this.notify(`Sold ${count} ${product}!`); this.openShop(game, onBuySeed, onSellCrop); };
      row.appendChild(btn); modal.appendChild(row);
    });

    // Sell fish
    Object.entries(game.fishInventory || {}).forEach(([kind, count]) => {
      if (count <= 0) return;
      hasAnyCrop = true;
      const fishDef = (FISH || {})[kind];
      if (!fishDef) return;
      const row = document.createElement('div'); row.className = 'shop-row';
      row.innerHTML = `<span>🐟 ${fishDef.label} ×${count}</span><span>${fishDef.sellPrice * count} 🪙</span>`;
      const btn = document.createElement('button'); btn.textContent = 'Sell All';
      btn.onclick = () => { game.sellFish(kind, count); this.notify(`Sold ${count} ${fishDef.label}!`); this.openShop(game, onBuySeed, onSellCrop); };
      row.appendChild(btn); modal.appendChild(row);
    });

    if (!hasAnyCrop) { const p = document.createElement('p'); p.textContent = 'Nothing to sell yet.'; modal.appendChild(p); }

    // Buy animals section
    const animalH = document.createElement('h3'); animalH.textContent = '🐄 Buy Animals'; modal.appendChild(animalH);
    Object.entries(ANIMALS).forEach(([kind, def]) => {
      const row = document.createElement('div'); row.className = 'shop-row';
      row.innerHTML = `<span>${def.name}</span><span>${def.cost} 🪙</span>`;
      const btn = document.createElement('button'); btn.textContent = 'Buy';
      btn.onclick = () => { if (game.buyAnimal(kind)) { this.notify(`Bought a ${def.name}! Check the Barn.`); this.openShop(game, onBuySeed, onSellCrop); } else this.notify('Not enough coins!'); };
      row.appendChild(btn); modal.appendChild(row);
    });

    // Buy feed
    const feedRow = document.createElement('div'); feedRow.className = 'shop-row';
    feedRow.innerHTML = `<span>🌾 Feed Bags (${game.feedBags} left)</span><span>${FEED_BAG_COST * 10} 🪙 × 10</span>`;
    const feedBtn = document.createElement('button'); feedBtn.textContent = 'Buy x10';
    feedBtn.onclick = () => { if (game.buyFeedBags(10)) { this.notify('+10 feed bags!'); this.openShop(game, onBuySeed, onSellCrop); } else this.notify('Not enough coins!'); };
    feedRow.appendChild(feedBtn); modal.appendChild(feedRow);
  }

  // ─── Progression Modal ───────────────────────────────────────────────────────

  openProgression(game, onUnlockFarm, onUnlockMachinery, craftCallbacks) {
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

    // Crafting section (optional)
    if (craftCallbacks) {
      const { onStartCraft, onCollect, onUnlockSlot } = craftCallbacks;
      const cH = document.createElement('h3'); cH.textContent = '🏺 Crafting'; modal.appendChild(cH);

      for (let i = 0; i < 2; i++) {
        const row = document.createElement('div'); row.className = 'shop-row';
        const slot = game.craftingSlots[i];
        const locked = i >= game.craftingSlotsUnlocked;
        if (locked) {
          row.innerHTML = `<span>🔒 Slot ${i + 1} (locked)</span><span>${EXTRA_CRAFT_SLOT_COST} 🪙</span>`;
          const btn = document.createElement('button'); btn.textContent = 'Unlock';
          btn.onclick = () => { if (onUnlockSlot()) { this.notify('Crafting slot unlocked!'); this.openProgression(game, onUnlockFarm, onUnlockMachinery, craftCallbacks); } else this.notify('Not enough coins!'); };
          row.appendChild(btn);
        } else if (!slot) {
          row.innerHTML = `<span>Slot ${i + 1}: <em>Empty</em></span>`;
        } else if (slot.done) {
          const recipe = RECIPES[slot.recipeKey];
          row.innerHTML = `<span>Slot ${i + 1}: ✅ ${recipe?.label} ready!</span>`;
          const btn = document.createElement('button'); btn.textContent = 'Collect'; btn.style.background = '#2a8a20';
          btn.onclick = () => { onCollect(i); this.notify(`Collected ${recipe?.label}!`); this.openProgression(game, onUnlockFarm, onUnlockMachinery, craftCallbacks); };
          row.appendChild(btn);
        } else {
          const recipe = RECIPES[slot.recipeKey];
          row.innerHTML = `<span>Slot ${i + 1}: ⏳ ${recipe?.label} (${slot.daysLeft} day${slot.daysLeft !== 1 ? 's' : ''} left)</span>`;
        }
        modal.appendChild(row);
      }

      const recH = document.createElement('h3'); recH.textContent = 'Recipes'; modal.appendChild(recH);
      Object.entries(RECIPES).forEach(([key, recipe]) => {
        const have = game.harvestInventory[recipe.input] || 0;
        const canCraft = have >= recipe.qty;
        const row = document.createElement('div'); row.className = 'shop-row';
        row.innerHTML = `<span><strong>${recipe.label}</strong><br><small>${recipe.qty}× ${CROPS[recipe.input]?.label || recipe.input} → ${recipe.sellPrice} 🪙 (${recipe.days} day${recipe.days !== 1 ? 's' : ''})</small></span><span>Have: ${have}</span>`;
        const freeSlot = game.craftingSlots.findIndex((s, idx) => s === null && idx < game.craftingSlotsUnlocked);
        const btn = document.createElement('button');
        btn.textContent = 'Craft';
        btn.disabled = !canCraft || freeSlot === -1;
        btn.onclick = () => { if (onStartCraft(freeSlot, key)) { this.notify(`Crafting ${recipe.label}…`); this.openProgression(game, onUnlockFarm, onUnlockMachinery, craftCallbacks); } };
        row.appendChild(btn); modal.appendChild(row);
      });
    }
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

  // ─── Quest Log ───────────────────────────────────────────────────────────────

  openQuestLog(game, onClaim) {
    const modal = document.getElementById('modal-quests');
    modal.innerHTML = '';
    modal.classList.add('active');
    modal.appendChild(this._makeClose(() => modal.classList.remove('active')));

    const title = document.createElement('h2'); title.textContent = '📜 Quests'; modal.appendChild(title);

    QUESTS.forEach(q => {
      const claimed = game.claimedQuests.includes(q.id);
      const ready = game.completedQuests.includes(q.id);
      const row = document.createElement('div'); row.className = 'shop-row';
      row.style.opacity = claimed ? '0.5' : '1';
      const rewardStr = [q.reward.coins ? `${q.reward.coins} 🪙` : '', q.reward.gems ? `${q.reward.gems} 💎` : ''].filter(Boolean).join(' + ');
      row.innerHTML = `<span>${claimed ? '✅' : ready ? '🎉' : '◻️'} <strong>${q.label}</strong><br><small>${q.desc}</small></span><span>${rewardStr}</span>`;
      if (ready && !claimed) {
        const btn = document.createElement('button'); btn.textContent = 'Claim!'; btn.style.background = '#2a8a20';
        btn.onclick = () => { onClaim(q.id); this.notify(`Quest complete: ${q.label}!`); this.openQuestLog(game, onClaim); };
        row.appendChild(btn);
      }
      modal.appendChild(row);
    });
  }

  // ─── Barn View ────────────────────────────────────────────────────────────────

  openBarnActions(game, onFeed, onRefresh) {
    const modal = document.getElementById('modal-barn');
    modal.innerHTML = '';
    modal.classList.add('active');
    modal.appendChild(this._makeClose(() => { modal.classList.remove('active'); onRefresh(); }));

    const title = document.createElement('h2'); title.textContent = '🐄 Barn'; modal.appendChild(title);

    if (game.animals.length === 0) {
      const p = document.createElement('p'); p.textContent = 'No animals yet. Buy some in the Market!'; modal.appendChild(p);
      return;
    }

    const feedInfo = document.createElement('p');
    feedInfo.textContent = `Feed bags: ${game.feedBags}`;
    feedInfo.style.color = '#aaa';
    modal.appendChild(feedInfo);

    game.animals.forEach(animal => {
      const def = ANIMALS[animal.kind];
      const row = document.createElement('div'); row.className = 'shop-row';
      const status = animal.fed ? '✅ Fed' : (animal.unhappyDays >= 2 ? '😢 Unhappy' : '😐 Hungry');
      row.innerHTML = `<span><strong>${animal.name}</strong> (${animal.kind})<br><small>${status} · produces ${def.product}/day</small></span>`;
      if (!animal.fed) {
        const btn = document.createElement('button'); btn.textContent = `Feed (1 bag)`;
        btn.onclick = () => { if (onFeed(animal.id)) { this.notify(`Fed your ${animal.name}!`); this.openBarnActions(game, onFeed, onRefresh); } else this.notify('No feed bags! Buy more in the Market.'); };
        row.appendChild(btn);
      }
      modal.appendChild(row);
    });
  }

  // ─── Crafting ────────────────────────────────────────────────────────────────

  openCrafting(game, onStartCraft, onCollect, onUnlockSlot) {
    const modal = document.getElementById('modal-crafting');
    modal.innerHTML = '';
    modal.classList.add('active');
    modal.appendChild(this._makeClose(() => modal.classList.remove('active')));

    const title = document.createElement('h2'); title.textContent = '🏺 Crafting'; modal.appendChild(title);

    // Active slots
    const slotH = document.createElement('h3'); slotH.textContent = 'Crafting Slots'; modal.appendChild(slotH);

    for (let i = 0; i < 2; i++) {
      const row = document.createElement('div'); row.className = 'shop-row';
      const slot = game.craftingSlots[i];
      const locked = i >= game.craftingSlotsUnlocked;
      if (locked) {
        row.innerHTML = `<span>🔒 Slot ${i + 1} (locked)</span><span>${EXTRA_CRAFT_SLOT_COST} 🪙</span>`;
        const btn = document.createElement('button'); btn.textContent = 'Unlock';
        btn.onclick = () => { if (onUnlockSlot()) { this.notify('Crafting slot unlocked!'); this.openCrafting(game, onStartCraft, onCollect, onUnlockSlot); } else this.notify('Not enough coins!'); };
        row.appendChild(btn);
      } else if (!slot) {
        row.innerHTML = `<span>Slot ${i + 1}: <em>Empty</em></span>`;
      } else if (slot.done) {
        const recipe = RECIPES[slot.recipeKey];
        row.innerHTML = `<span>Slot ${i + 1}: ✅ ${recipe?.label} ready!</span>`;
        const btn = document.createElement('button'); btn.textContent = 'Collect'; btn.style.background = '#2a8a20';
        btn.onclick = () => { onCollect(i); this.notify(`Collected ${recipe?.label}!`); this.openCrafting(game, onStartCraft, onCollect, onUnlockSlot); };
        row.appendChild(btn);
      } else {
        const recipe = RECIPES[slot.recipeKey];
        row.innerHTML = `<span>Slot ${i + 1}: ⏳ ${recipe?.label} (${slot.daysLeft} day${slot.daysLeft !== 1 ? 's' : ''} left)</span>`;
      }
      modal.appendChild(row);
    }

    // Recipes
    const recH = document.createElement('h3'); recH.textContent = 'Recipes'; modal.appendChild(recH);

    Object.entries(RECIPES).forEach(([key, recipe]) => {
      const have = game.harvestInventory[recipe.input] || 0;
      const canCraft = have >= recipe.qty;
      const row = document.createElement('div'); row.className = 'shop-row';
      row.innerHTML = `<span><strong>${recipe.label}</strong><br><small>${recipe.qty}× ${CROPS[recipe.input]?.label || recipe.input} → ${recipe.sellPrice} 🪙 (${recipe.days} day${recipe.days !== 1 ? 's' : ''})</small></span><span>Have: ${have}</span>`;
      const freeSlot = game.craftingSlots.findIndex((s, i) => s === null && i < game.craftingSlotsUnlocked);
      const btn = document.createElement('button');
      btn.textContent = 'Craft';
      btn.disabled = !canCraft || freeSlot === -1;
      btn.onclick = () => { if (onStartCraft(freeSlot, key)) { this.notify(`Crafting ${recipe.label}…`); this.openCrafting(game, onStartCraft, onCollect, onUnlockSlot); } };
      row.appendChild(btn); modal.appendChild(row);
    });
  }

  // ─── Fishing Mini-Game ────────────────────────────────────────────────────────

  openFishingGame(game, onCatch) {
    const modal = document.getElementById('modal-fishing');
    modal.innerHTML = '';
    modal.classList.add('active');

    const close = this._makeClose(() => { modal.classList.remove('active'); this._stopFishing(); });
    modal.appendChild(close);

    const title = document.createElement('h2'); title.textContent = '🎣 Fishing'; modal.appendChild(title);
    const hint = document.createElement('p'); hint.textContent = 'Tap CATCH when the fish 🐟 is in the green zone!'; hint.style.textAlign = 'center'; modal.appendChild(hint);

    // Canvas for mini-game
    const cvs = document.createElement('canvas');
    cvs.width = 280; cvs.height = 300;
    cvs.style.display = 'block'; cvs.style.margin = '0 auto';
    modal.appendChild(cvs);
    const ctx = cvs.getContext('2d');

    const catchBtn = document.createElement('button');
    catchBtn.textContent = '🎣 CATCH!';
    catchBtn.style.cssText = 'display:block;margin:12px auto;padding:14px 40px;font-size:18px;background:#2a8a20;border:none;border-radius:10px;color:#fff;cursor:pointer;font-weight:bold;';
    modal.appendChild(catchBtn);

    // Mini-game state
    let fishY = 150, fishDir = 1, fishSpeed = 2.5 + Math.random() * 2;
    let zoneY = 80 + Math.random() * 100, zoneH = 60;
    let caught = false;
    let rafId;

    const draw = () => {
      ctx.clearRect(0, 0, 280, 300);
      // Water bg
      ctx.fillStyle = '#1a5070'; ctx.fillRect(0, 0, 280, 300);
      // Ripple lines
      ctx.strokeStyle = 'rgba(100,180,220,0.2)'; ctx.lineWidth = 1;
      for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.moveTo(0, 30 + i * 36); ctx.lineTo(280, 30 + i * 36); ctx.stroke(); }
      // Zone
      ctx.fillStyle = 'rgba(50,220,80,0.35)';
      ctx.fillRect(20, zoneY, 240, zoneH);
      ctx.strokeStyle = '#50dd60'; ctx.lineWidth = 2;
      ctx.strokeRect(20, zoneY, 240, zoneH);
      ctx.fillStyle = '#50ff70'; ctx.font = '11px monospace'; ctx.textAlign = 'center';
      ctx.fillText('CATCH ZONE', 140, zoneY + zoneH / 2 + 4);
      // Fish indicator
      ctx.font = '28px serif'; ctx.textAlign = 'center';
      ctx.fillText('🐟', 140, fishY);
      // Bar on right
      const barX = 260, barH = 280;
      ctx.fillStyle = '#0a3050'; ctx.fillRect(barX - 6, 10, 12, barH);
      const zP = (zoneY - 10) / barH, zHp = zoneH / barH;
      ctx.fillStyle = '#30cc50'; ctx.fillRect(barX - 5, 10 + zP * barH, 10, zHp * barH);
      const fP = (fishY - 10) / barH;
      ctx.fillStyle = '#fff'; ctx.fillRect(barX - 7, 10 + fP * barH - 4, 14, 8);
    };

    const tick = () => {
      if (caught) return;
      fishY += fishDir * fishSpeed;
      if (fishY < 20 || fishY > 280) { fishDir *= -1; fishSpeed = 2 + Math.random() * 3; }
      draw();
      rafId = requestAnimationFrame(tick);
    };

    this._stopFishing = () => { cancelAnimationFrame(rafId); };

    catchBtn.addEventListener('click', () => {
      if (caught) return;
      caught = true;
      cancelAnimationFrame(rafId);
      const inZone = fishY >= zoneY && fishY <= zoneY + zoneH;
      if (inZone) {
        // Pick fish by weighted random
        const kinds = Object.keys(FISH);
        const weights = kinds.map(k => FISH[k].weight);
        const total = weights.reduce((a, b) => a + b, 0);
        let r = Math.random() * total;
        let caught_kind = kinds[0];
        for (let i = 0; i < kinds.length; i++) { r -= weights[i]; if (r <= 0) { caught_kind = kinds[i]; break; } }
        const fishDef = FISH[caught_kind];
        onCatch(caught_kind, fishDef);
        ctx.clearRect(0, 0, 280, 300);
        ctx.fillStyle = '#1a5070'; ctx.fillRect(0, 0, 280, 300);
        ctx.font = '60px serif'; ctx.textAlign = 'center'; ctx.fillText('🎉', 140, 120);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 18px monospace'; ctx.fillText(`Caught a ${fishDef.label}!`, 140, 170);
        ctx.fillStyle = '#f5c842'; ctx.font = '14px monospace'; ctx.fillText(`Worth ${fishDef.sellPrice} 🪙 in the Market`, 140, 200);
        catchBtn.textContent = 'Close';
        catchBtn.onclick = () => { modal.classList.remove('active'); this._stopFishing = () => {}; };
      } else {
        ctx.clearRect(0, 0, 280, 300);
        ctx.fillStyle = '#1a5070'; ctx.fillRect(0, 0, 280, 300);
        ctx.font = '60px serif'; ctx.textAlign = 'center'; ctx.fillText('🎣', 140, 120);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 16px monospace'; ctx.fillText('The fish got away!', 140, 170);
        ctx.fillStyle = '#aaa'; ctx.font = '13px monospace'; ctx.fillText('Try again tomorrow', 140, 200);
        catchBtn.textContent = 'Close';
        catchBtn.onclick = () => { modal.classList.remove('active'); this._stopFishing = () => {}; };
      }
    });

    this._stopFishing = () => cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);
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
