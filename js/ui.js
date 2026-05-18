import { CROPS, FARM_SIZES, MACHINERY, SKINS, FURNITURE, GEM_PACKS, SEASONS, SEASON_ICONS, WEATHER_TYPES, ANIMALS, FEED_BAG_COST, RECIPES, EXTRA_CRAFT_SLOT_COST, FISH, QUESTS } from './constants.js';

export class UI {
  constructor() {
    this.$coins = document.getElementById('hud-coins');
    this.$gems = document.getElementById('hud-gems');
    this.$notification = document.getElementById('notification');
    this._notifTimer = null;
  }

  updateHUD(game) {
    this.$coins.textContent = `🪙 ${game.coins.toLocaleString()}`;
    this.$gems.textContent = `💎 ${game.gems}`;

    const seasonEl = document.getElementById('hud-season');
    if (seasonEl) {
      const wDef = WEATHER_TYPES.find(w => w.id === game.weather) || WEATHER_TYPES[0];
      seasonEl.textContent = `${SEASON_ICONS[game.season]} ${SEASONS[game.season]} ${wDef.icon} · D${game.seasonDay + 1}/7`;
    }

    const questBadge = document.getElementById('quest-badge');
    if (questBadge) {
      const count = game.unclaimedQuestCount();
      questBadge.textContent = count > 0 ? count : '';
      questBadge.style.display = count > 0 ? 'inline' : 'none';
    }
  }

  notify(msg, duration = 2500) {
    this.$notification.textContent = msg;
    this.$notification.classList.add('show');
    clearTimeout(this._notifTimer);
    this._notifTimer = setTimeout(() => this.$notification.classList.remove('show'), duration);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  _makeModalHeader(icon, title, closeFn) {
    const header = document.createElement('div');
    header.className = 'modal-header';
    header.innerHTML = `<span class="modal-header-icon">${icon}</span><span class="modal-header-title">${title}</span>`;
    const closeBtn = document.createElement('button');
    closeBtn.className = 'modal-close';
    closeBtn.textContent = '✕';
    closeBtn.onclick = closeFn;
    header.appendChild(closeBtn);
    return header;
  }

  _makeBody() {
    const body = document.createElement('div');
    body.className = 'modal-body';
    return body;
  }

  _makeSection(title) {
    const section = document.createElement('div');
    section.className = 'modal-section';
    if (title) {
      const t = document.createElement('div');
      t.className = 'section-title';
      t.textContent = title;
      section.appendChild(t);
    }
    return section;
  }

  _makeItemRow(iconHtml, name, detail, rightEl) {
    const row = document.createElement('div');
    row.className = 'item-row';
    const info = document.createElement('div');
    info.className = 'item-info';
    info.innerHTML = `<div class="item-name">${iconHtml} ${name}</div>${detail ? `<div class="item-detail">${detail}</div>` : ''}`;
    row.appendChild(info);
    if (rightEl) row.appendChild(rightEl);
    return row;
  }

  _makeCostBadge(text, isGem = false) {
    const badge = document.createElement('span');
    badge.className = 'cost-badge' + (isGem ? ' gem-badge' : '');
    badge.textContent = text;
    return badge;
  }

  _makeBtn(text, cls, onClick) {
    const btn = document.createElement('button');
    btn.className = cls;
    btn.textContent = text;
    btn.onclick = onClick;
    return btn;
  }

  _makeClose(fn) {
    const btn = document.createElement('button');
    btn.className = 'modal-close';
    btn.textContent = '✕';
    btn.onclick = fn;
    return btn;
  }

  // ─── Market Modal (tabbed) ────────────────────────────────────────────────────

  openShop(game, onBuySeed, onSellCrop, initialTab = 'seeds') {
    const modal = document.getElementById('modal-shop');
    modal.innerHTML = '';
    modal.classList.add('active');

    const closeFn = () => modal.classList.remove('active');
    modal.appendChild(this._makeModalHeader('🛒', 'Market', closeFn));

    // Inner tab strip
    const tabs = document.createElement('div');
    tabs.className = 'inner-tabs';
    const tabDefs = [
      { id: 'seeds',   label: '🌱 Seeds' },
      { id: 'sell',    label: '📦 Sell' },
      { id: 'animals', label: '🐄 Animals' },
    ];
    const contentWrap = document.createElement('div');
    contentWrap.style.cssText = 'flex:1;overflow-y:auto;padding:12px 14px 16px;display:flex;flex-direction:column;gap:10px;';

    const renderTab = (tabId) => {
      contentWrap.innerHTML = '';
      tabDefs.forEach(t => {
        const btn = tabs.querySelector(`[data-tab="${t.id}"]`);
        if (btn) btn.classList.toggle('active', t.id === tabId);
      });
      if (tabId === 'seeds') this._shopSeeds(contentWrap, game, onBuySeed, () => this.openShop(game, onBuySeed, onSellCrop, 'seeds'));
      if (tabId === 'sell')  this._shopSell(contentWrap, game, onSellCrop, () => this.openShop(game, onBuySeed, onSellCrop, 'sell'));
      if (tabId === 'animals') this._shopAnimals(contentWrap, game, () => this.openShop(game, onBuySeed, onSellCrop, 'animals'));
    };

    tabDefs.forEach(({ id, label }) => {
      const btn = document.createElement('button');
      btn.className = 'inner-tab' + (id === initialTab ? ' active' : '');
      btn.dataset.tab = id;
      btn.textContent = label;
      btn.onclick = () => renderTab(id);
      tabs.appendChild(btn);
    });

    modal.appendChild(tabs);
    modal.appendChild(contentWrap);
    renderTab(initialTab);
  }

  _shopSeeds(wrap, game, onBuySeed, refresh) {
    const section = this._makeSection('Buy Seeds');
    Object.entries(CROPS).forEach(([kind, def]) => {
      const costStr = def.gemSeedCost !== null ? `${def.gemSeedCost} 💎` : `${def.seedCost} 🪙`;
      const seasonHint = def.seasons ? def.seasons.join(' & ') : 'All seasons';
      const right = document.createElement('div');
      right.style.cssText = 'display:flex;gap:6px;align-items:center;flex-shrink:0;';
      right.appendChild(this._makeCostBadge(costStr, def.gemSeedCost !== null));
      right.appendChild(this._makeBtn('Buy ×5', 'btn-primary', () => {
        if (onBuySeed(kind, 5)) { this.notify(`+5 ${def.label} seeds`); refresh(); }
        else this.notify('Not enough!');
      }));
      section.appendChild(this._makeItemRow('', def.label, seasonHint, right));
    });
    wrap.appendChild(section);
  }

  _shopSell(wrap, game, onSellCrop, refresh) {
    let hasItems = false;

    const addSection = (title, items) => {
      if (items.length === 0) return;
      hasItems = true;
      const section = this._makeSection(title);
      items.forEach(({ icon, label, count, value, onSell }) => {
        const right = document.createElement('div');
        right.style.cssText = 'display:flex;gap:6px;align-items:center;flex-shrink:0;';
        right.appendChild(this._makeCostBadge(`${value} 🪙`));
        right.appendChild(this._makeBtn('Sell All', 'btn-primary', () => { onSell(); refresh(); }));
        section.appendChild(this._makeItemRow(icon, label, `×${count}`, right));
      });
      wrap.appendChild(section);
    };

    addSection('Crops', Object.entries(game.harvestInventory)
      .filter(([, count]) => count > 0)
      .map(([kind, count]) => {
        const def = CROPS[kind];
        return { icon: '', label: def.label, count, value: def.sellPrice * count,
          onSell: () => { onSellCrop(kind, count); this.notify(`Sold ${count} ${def.label}!`); }};
      }));

    addSection('Artisan Goods', Object.entries(game.artisanInventory || {})
      .filter(([, count]) => count > 0)
      .map(([key, count]) => {
        const recipe = RECIPES[key];
        return { icon: '🏺', label: recipe?.label || key, count, value: (recipe?.sellPrice || 0) * count,
          onSell: () => { game.sellArtisan(key, count); this.notify(`Sold ${count} ${recipe?.label}!`); }};
      }));

    addSection('Animal Products', Object.entries(game.animalProducts || {})
      .filter(([, count]) => count > 0)
      .map(([product, count]) => {
        const animalDef = Object.values(ANIMALS).find(a => a.product === product);
        const icon = product === 'egg' ? '🥚' : product === 'milk' ? '🥛' : '🧶';
        const label = product.charAt(0).toUpperCase() + product.slice(1);
        return { icon, label, count, value: (animalDef?.productSell || 0) * count,
          onSell: () => { game.sellAnimalProduct(product, count); this.notify(`Sold ${count} ${label}!`); }};
      }));

    addSection('Fish', Object.entries(game.fishInventory || {})
      .filter(([, count]) => count > 0)
      .map(([kind, count]) => {
        const fishDef = FISH[kind];
        return { icon: '🐟', label: fishDef?.label || kind, count, value: (fishDef?.sellPrice || 0) * count,
          onSell: () => { game.sellFish(kind, count); this.notify(`Sold ${count} ${fishDef?.label}!`); }};
      }));

    if (!hasItems) {
      const p = document.createElement('div');
      p.className = 'empty-state';
      p.textContent = 'Nothing to sell yet. Harvest crops or catch fish!';
      wrap.appendChild(p);
    }
  }

  _shopAnimals(wrap, game, refresh) {
    const buySection = this._makeSection('Buy Animals');
    Object.entries(ANIMALS).forEach(([kind, def]) => {
      const right = document.createElement('div');
      right.style.cssText = 'display:flex;gap:6px;align-items:center;flex-shrink:0;';
      right.appendChild(this._makeCostBadge(`${def.cost} 🪙`));
      right.appendChild(this._makeBtn('Buy', 'btn-primary', () => {
        if (game.buyAnimal(kind)) { this.notify(`Bought a ${def.name}! Visit the Barn.`); refresh(); }
        else this.notify('Not enough coins!');
      }));
      const icon = kind === 'chicken' ? '🐔' : kind === 'cow' ? '🐄' : '🐑';
      buySection.appendChild(this._makeItemRow(icon, def.name, `Produces ${def.product}/day`, right));
    });
    wrap.appendChild(buySection);

    const feedSection = this._makeSection('Feed Bags');
    const right = document.createElement('div');
    right.style.cssText = 'display:flex;gap:6px;align-items:center;flex-shrink:0;';
    right.appendChild(this._makeCostBadge(`${FEED_BAG_COST * 10} 🪙`));
    right.appendChild(this._makeBtn('Buy ×10', 'btn-primary', () => {
      if (game.buyFeedBags(10)) { this.notify('+10 feed bags!'); refresh(); }
      else this.notify('Not enough coins!');
    }));
    feedSection.appendChild(this._makeItemRow('🌾', 'Feed Bags', `${game.feedBags} in stock`, right));
    wrap.appendChild(feedSection);
  }

  // ─── Progression Modal ────────────────────────────────────────────────────────

  openProgression(game, onUnlockFarm, onUnlockMachinery, craftCallbacks) {
    const modal = document.getElementById('modal-progression');
    modal.innerHTML = '';
    modal.classList.add('active');

    const closeFn = () => modal.classList.remove('active');
    modal.appendChild(this._makeModalHeader('⭐', 'Upgrades', closeFn));

    const body = this._makeBody();

    // Farm sizes
    const farmSection = this._makeSection('Farm Expansions');
    FARM_SIZES.forEach(size => {
      const owned = size.id <= game.farmSizeId;
      const right = document.createElement('div');
      right.style.cssText = 'display:flex;gap:6px;align-items:center;flex-shrink:0;';
      if (owned) {
        right.innerHTML = `<span class="owned-badge">✅ Owned</span>`;
      } else {
        right.appendChild(this._makeCostBadge(`${size.coinCost} 🪙`));
        right.appendChild(this._makeBtn('Buy', 'btn-primary', () => {
          if (onUnlockFarm(size.id, false)) { this.notify(`Unlocked ${size.name}!`); this.openProgression(game, onUnlockFarm, onUnlockMachinery, craftCallbacks); }
          else this.notify('Not enough coins!');
        }));
        right.appendChild(this._makeBtn(`${size.gemCost} 💎`, 'btn-gem', () => {
          if (onUnlockFarm(size.id, true)) { this.notify(`Unlocked ${size.name}!`); this.openProgression(game, onUnlockFarm, onUnlockMachinery, craftCallbacks); }
          else this.notify('Not enough gems!');
        }));
      }
      farmSection.appendChild(this._makeItemRow('🗺️', size.name, `${size.cols}×${size.rows} tiles`, right));
    });
    body.appendChild(farmSection);

    // Machinery
    const machSection = this._makeSection('Machinery Upgrades');
    const toolIcons = { hoe: '⛏️', wateringCan: '💧', harvester: '🌾' };
    Object.entries(MACHINERY).forEach(([toolKey, tiers]) => {
      tiers.forEach(entry => {
        const owned = entry.tier <= (game.machineryTiers[toolKey] || 1);
        const isNext = entry.tier === (game.machineryTiers[toolKey] || 1) + 1;
        const right = document.createElement('div');
        right.style.cssText = 'display:flex;gap:6px;align-items:center;flex-shrink:0;';
        if (owned) {
          right.innerHTML = `<span class="owned-badge">✅</span>`;
        } else if (isNext) {
          right.appendChild(this._makeCostBadge(`${entry.unlockCoins} 🪙`));
          right.appendChild(this._makeBtn('Upgrade', 'btn-primary', () => {
            if (onUnlockMachinery(toolKey, entry.tier, false)) { this.notify(`Upgraded to ${entry.name}!`); this.openProgression(game, onUnlockFarm, onUnlockMachinery, craftCallbacks); }
            else this.notify('Not enough coins!');
          }));
          right.appendChild(this._makeBtn(`${entry.unlockGems} 💎`, 'btn-gem', () => {
            if (onUnlockMachinery(toolKey, entry.tier, true)) { this.notify(`Upgraded to ${entry.name}!`); this.openProgression(game, onUnlockFarm, onUnlockMachinery, craftCallbacks); }
            else this.notify('Not enough gems!');
          }));
        } else {
          right.appendChild(this._makeCostBadge(`${entry.unlockCoins} 🪙`));
          const btn = this._makeBtn('Locked', 'btn-secondary', null);
          btn.disabled = true;
          right.appendChild(btn);
        }
        machSection.appendChild(this._makeItemRow(toolIcons[toolKey] || '🔧', entry.name, `Area of effect: ${entry.aoe === 999 ? 'All' : entry.aoe}`, right));
      });
    });
    body.appendChild(machSection);

    // Crafting
    if (craftCallbacks) {
      const { onStartCraft, onCollect, onUnlockSlot } = craftCallbacks;
      const craftSection = this._makeSection('Crafting Slots');

      for (let i = 0; i < 2; i++) {
        const slot = game.craftingSlots[i];
        const locked = i >= game.craftingSlotsUnlocked;
        const right = document.createElement('div');
        right.style.cssText = 'display:flex;gap:6px;align-items:center;flex-shrink:0;';
        let name, detail;

        if (locked) {
          name = `🔒 Slot ${i + 1}`;
          detail = 'Locked';
          right.appendChild(this._makeCostBadge(`${EXTRA_CRAFT_SLOT_COST} 🪙`));
          right.appendChild(this._makeBtn('Unlock', 'btn-primary', () => {
            if (onUnlockSlot()) { this.notify('Crafting slot unlocked!'); this.openProgression(game, onUnlockFarm, onUnlockMachinery, craftCallbacks); }
            else this.notify('Not enough coins!');
          }));
        } else if (!slot) {
          name = `Slot ${i + 1}`;
          detail = 'Empty — start a recipe below';
        } else if (slot.done) {
          const recipe = RECIPES[slot.recipeKey];
          name = `Slot ${i + 1}: ${recipe?.label}`;
          detail = '✅ Ready to collect!';
          right.appendChild(this._makeBtn('Collect', 'btn-collect', () => {
            onCollect(i); this.notify(`Collected ${recipe?.label}!`); this.openProgression(game, onUnlockFarm, onUnlockMachinery, craftCallbacks);
          }));
        } else {
          const recipe = RECIPES[slot.recipeKey];
          name = `Slot ${i + 1}: ${recipe?.label}`;
          detail = `⏳ ${slot.daysLeft} day${slot.daysLeft !== 1 ? 's' : ''} remaining`;
        }
        craftSection.appendChild(this._makeItemRow('🏺', name, detail, right));
      }
      body.appendChild(craftSection);

      const recipeSection = this._makeSection('Recipes');
      Object.entries(RECIPES).forEach(([key, recipe]) => {
        const have = game.harvestInventory[recipe.input] || 0;
        const canCraft = have >= recipe.qty;
        const freeSlot = game.craftingSlots.findIndex((s, idx) => s === null && idx < game.craftingSlotsUnlocked);
        const right = document.createElement('div');
        right.style.cssText = 'display:flex;gap:6px;align-items:center;flex-shrink:0;';
        right.appendChild(this._makeCostBadge(`${recipe.sellPrice} 🪙`));
        const btn = this._makeBtn('Craft', 'btn-primary', () => {
          if (onStartCraft(freeSlot, key)) { this.notify(`Crafting ${recipe.label}…`); this.openProgression(game, onUnlockFarm, onUnlockMachinery, craftCallbacks); }
        });
        btn.disabled = !canCraft || freeSlot === -1;
        right.appendChild(btn);
        const inputName = CROPS[recipe.input]?.label || recipe.input;
        recipeSection.appendChild(this._makeItemRow('🏺', recipe.label, `${recipe.qty}× ${inputName} · ${recipe.days}d · Have: ${have}`, right));
      });
      body.appendChild(recipeSection);
    }

    modal.appendChild(body);
  }

  // ─── Skins Modal ──────────────────────────────────────────────────────────────

  openSkins(game, onBuySkin, onEquipSkin) {
    const modal = document.getElementById('modal-skins');
    modal.innerHTML = '';
    modal.classList.add('active');

    const closeFn = () => modal.classList.remove('active');
    modal.appendChild(this._makeModalHeader('🎨', 'Skins', closeFn));

    const body = this._makeBody();
    Object.entries(SKINS).forEach(([cat, list]) => {
      const section = this._makeSection(cat === 'player' ? 'Farmer Skins' : 'House Skins');
      list.forEach(skin => {
        const owned = game.ownedSkins.includes(skin.id);
        const equipped = cat === 'player' ? game.player.skin === skin.id : game.houseSkin === skin.id;
        const right = document.createElement('div');
        right.style.cssText = 'display:flex;gap:6px;align-items:center;flex-shrink:0;';
        if (owned && equipped) {
          right.innerHTML = `<span class="owned-badge">✨ Equipped</span>`;
        } else if (owned) {
          right.appendChild(this._makeBtn('Equip', 'btn-primary', () => {
            onEquipSkin(cat, skin.id); this.notify(`Equipped ${skin.name}!`); this.openSkins(game, onBuySkin, onEquipSkin);
          }));
        } else {
          const isGem = skin.currency === 'gems';
          right.appendChild(this._makeCostBadge(skin.currency === 'free' ? 'Free' : `${skin.cost} ${isGem ? '💎' : '🪙'}`, isGem));
          right.appendChild(this._makeBtn('Buy', 'btn-primary', () => {
            if (onBuySkin(skin.id, cat)) { this.notify(`Bought ${skin.name}!`); this.openSkins(game, onBuySkin, onEquipSkin); }
            else this.notify('Not enough!');
          }));
        }
        section.appendChild(this._makeItemRow('', skin.name, '', right));
      });
      body.appendChild(section);
    });
    modal.appendChild(body);
  }

  // ─── Furniture Picker ─────────────────────────────────────────────────────────

  openFurniturePicker(game, onPlace) {
    const modal = document.getElementById('modal-furniture');
    modal.innerHTML = '';
    modal.classList.add('active');

    const closeFn = () => modal.classList.remove('active');
    modal.appendChild(this._makeModalHeader('🏠', 'Furniture', closeFn));

    const body = this._makeBody();
    const section = this._makeSection('Place Items');

    FURNITURE.forEach(def => {
      const right = document.createElement('div');
      right.style.cssText = 'display:flex;gap:6px;align-items:center;flex-shrink:0;';
      right.appendChild(this._makeCostBadge(`${def.cost} 🪙`));
      right.appendChild(this._makeBtn('Place', 'btn-primary', () => {
        if (game.coins < def.cost) { this.notify('Not enough coins!'); return; }
        modal.classList.remove('active');
        this.notify(`Tap the home grid to place ${def.label}`);
        onPlace(def);
      }));
      section.appendChild(this._makeItemRow('', def.label, `${def.w}×${def.h} tiles`, right));
    });
    body.appendChild(section);

    const clearSection = this._makeSection('');
    const clearRow = document.createElement('div');
    clearRow.className = 'item-row';
    clearRow.style.justifyContent = 'center';
    clearRow.appendChild(this._makeBtn('🗑️ Clear All Furniture', 'btn-secondary', () => {
      game.homeLayout = []; game.autoSave(); modal.classList.remove('active'); this.notify('Cleared!');
    }));
    clearSection.appendChild(clearRow);
    body.appendChild(clearSection);

    modal.appendChild(body);
  }

  // ─── Gem Store ────────────────────────────────────────────────────────────────

  openGemStore(game) {
    const modal = document.getElementById('modal-gems');
    modal.innerHTML = '';
    modal.classList.add('active');

    const closeFn = () => modal.classList.remove('active');
    modal.appendChild(this._makeModalHeader('💎', 'Gem Store', closeFn));

    const body = this._makeBody();
    const note = document.createElement('div');
    note.className = 'empty-state';
    note.textContent = 'Gems are also earned through daily login and quests.';
    body.appendChild(note);

    const section = this._makeSection('Gem Packs');
    GEM_PACKS.forEach(pack => {
      const right = document.createElement('div');
      right.style.cssText = 'display:flex;gap:6px;align-items:center;flex-shrink:0;';
      right.appendChild(this._makeCostBadge(pack.label));
      right.appendChild(this._makeBtn('Buy', 'btn-gem', () => {
        if (pack.stripeLink) window.location.href = pack.stripeLink + `?client_reference_id=gems_${pack.gems}`;
        else this.notify('Stripe not configured yet. Edit GEM_PACKS in constants.js.');
      }));
      section.appendChild(this._makeItemRow('💎', `${pack.gems} Gems`, '', right));
    });
    body.appendChild(section);
    modal.appendChild(body);
  }

  // ─── Quest Log ────────────────────────────────────────────────────────────────

  openQuestLog(game, onClaim) {
    const modal = document.getElementById('modal-quests');
    modal.innerHTML = '';
    modal.classList.add('active');

    const closeFn = () => modal.classList.remove('active');
    modal.appendChild(this._makeModalHeader('📜', 'Quests', closeFn));

    const body = this._makeBody();

    const readyIds = game.completedQuests;
    const claimedIds = game.claimedQuests;

    const claimable = QUESTS.filter(q => readyIds.includes(q.id) && !claimedIds.includes(q.id));
    const pending   = QUESTS.filter(q => !readyIds.includes(q.id) && !claimedIds.includes(q.id));
    const claimed   = QUESTS.filter(q => claimedIds.includes(q.id));

    const addSection = (title, quests, isClaimed) => {
      if (quests.length === 0) return;
      const section = this._makeSection(title);
      quests.forEach(q => {
        const rewardStr = [q.reward.coins ? `${q.reward.coins} 🪙` : '', q.reward.gems ? `${q.reward.gems} 💎` : ''].filter(Boolean).join(' + ');
        const right = document.createElement('div');
        right.style.cssText = 'display:flex;gap:6px;align-items:center;flex-shrink:0;';
        if (!isClaimed && readyIds.includes(q.id)) {
          right.appendChild(this._makeBtn('Claim!', 'btn-collect', () => {
            onClaim(q.id); this.notify(`Quest complete: ${q.label}!`); this.openQuestLog(game, onClaim);
          }));
        } else {
          right.appendChild(this._makeCostBadge(rewardStr));
        }
        const icon = isClaimed ? '✅' : readyIds.includes(q.id) ? '🎉' : '◻️';
        const row = this._makeItemRow(icon, q.label, q.desc, right);
        if (isClaimed) row.style.opacity = '0.45';
        section.appendChild(row);
      });
      body.appendChild(section);
    };

    addSection('Ready to Claim', claimable, false);
    addSection('In Progress', pending, false);
    addSection('Completed', claimed, true);

    modal.appendChild(body);
  }

  // ─── Barn Actions ─────────────────────────────────────────────────────────────

  openBarnActions(game, onFeed, onRefresh) {
    const modal = document.getElementById('modal-barn');
    modal.innerHTML = '';
    modal.classList.add('active');

    const closeFn = () => { modal.classList.remove('active'); };
    modal.appendChild(this._makeModalHeader('🐄', 'Barn', closeFn));

    const body = this._makeBody();

    if (game.animals.length === 0) {
      const p = document.createElement('div');
      p.className = 'empty-state';
      p.textContent = 'No animals yet. Buy some in the Market!';
      body.appendChild(p);
    } else {
      const section = this._makeSection(`Animals · ${game.feedBags} feed bags`);
      game.animals.forEach(animal => {
        const def = ANIMALS[animal.kind];
        const status = animal.fed ? '✅ Fed' : (animal.unhappyDays >= 2 ? '😢 Unhappy' : '😐 Hungry');
        const right = document.createElement('div');
        right.style.cssText = 'display:flex;gap:6px;align-items:center;flex-shrink:0;';
        if (!animal.fed) {
          right.appendChild(this._makeBtn('Feed 🌾', 'btn-primary', () => {
            if (onFeed(animal.id)) { this.notify(`Fed your ${animal.name}!`); this.openBarnActions(game, onFeed, onRefresh); }
            else this.notify('No feed bags! Buy more in the Market.');
          }));
        } else {
          right.innerHTML = `<span class="owned-badge">✅ Fed</span>`;
        }
        const icon = animal.kind === 'chicken' ? '🐔' : animal.kind === 'cow' ? '🐄' : '🐑';
        section.appendChild(this._makeItemRow(icon, animal.name, `${status} · ${def.product}/day`, right));
      });
      body.appendChild(section);
    }

    modal.appendChild(body);
  }

  // ─── Tutorial ─────────────────────────────────────────────────────────────────

  openTutorial(onClose) {
    const modal = document.getElementById('modal-tutorial');
    modal.innerHTML = '';
    modal.classList.add('active');

    const header = document.createElement('div');
    header.className = 'modal-header';
    header.innerHTML = '<span class="modal-header-icon">🌾</span><span class="modal-header-title">Welcome to Harvest Haven!</span>';
    modal.appendChild(header);

    const body = document.createElement('div');
    body.style.cssText = 'flex:1;overflow-y:auto;padding:8px 0;';

    const steps = [
      ['⛏️', '<strong>Till</strong> — pick the Hoe (key 1), tap grass tiles to make soil.'],
      ['🌱', '<strong>Plant</strong> — pick Seeds (key 3), tap tilled soil to plant. Buy seeds in the Market.'],
      ['💧', '<strong>Water</strong> — use the Watering Can (key 2). Crops dry out every ~2 min and pause growing. Re-water to resume, or unlock Auto-Drip to water everything forever.'],
      ['✂️', '<strong>Harvest</strong> — when a tile shows <em>✂ Ready</em>, use the Scythe (key 4) to harvest.'],
      ['🛒', '<strong>Sell</strong> — open the Market (tab bar) to sell crops for coins and expand your farm.'],
      ['⏱️', '<strong>Time flows</strong> — seasons, animals & crafting advance in real time. Rain auto-waters crops. Tap <em>⏭️ Skip Day</em> to fast-forward.'],
    ];
    steps.forEach(([icon, text]) => {
      const row = document.createElement('div');
      row.className = 'tutorial-step';
      row.innerHTML = `<span class="tutorial-icon">${icon}</span><span>${text}</span>`;
      body.appendChild(row);
    });

    const btn = document.createElement('button');
    btn.textContent = "Let's farm! 🚜";
    btn.className = 'tutorial-start';
    btn.onclick = () => { modal.classList.remove('active'); onClose(); };
    body.appendChild(btn);
    modal.appendChild(body);
  }

  // ─── Fishing Mini-Game ────────────────────────────────────────────────────────

  openFishingGame(game, onCatch) {
    const modal = document.getElementById('modal-fishing');
    modal.innerHTML = '';
    modal.classList.add('active');

    const closeFn = () => { modal.classList.remove('active'); this._stopFishing && this._stopFishing(); };
    modal.appendChild(this._makeModalHeader('🎣', 'Fishing', closeFn));

    const body = document.createElement('div');
    body.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;padding:12px 16px;gap:10px;';

    const hint = document.createElement('p');
    hint.textContent = 'Tap CATCH when the fish 🐟 is in the green zone!';
    hint.style.cssText = 'text-align:center;color:rgba(255,255,255,0.6);font-size:13px;';
    body.appendChild(hint);

    const cvs = document.createElement('canvas');
    cvs.width = 280; cvs.height = 290;
    cvs.style.cssText = 'display:block;border-radius:12px;';
    body.appendChild(cvs);
    const ctx = cvs.getContext('2d');

    const catchBtn = document.createElement('button');
    catchBtn.textContent = '🎣 CATCH!';
    catchBtn.className = 'btn-collect';
    catchBtn.style.cssText = 'padding:14px 40px;font-size:18px;border-radius:12px;width:100%;max-width:280px;';
    body.appendChild(catchBtn);

    let fishY = 145, fishDir = 1, fishSpeed = 2.5 + Math.random() * 2;
    let zoneY = 80 + Math.random() * 100, zoneH = 60;
    let caught = false;
    let rafId;

    const draw = () => {
      ctx.clearRect(0, 0, 280, 290);
      ctx.fillStyle = '#1a5070'; ctx.fillRect(0, 0, 280, 290);
      ctx.strokeStyle = 'rgba(100,180,220,0.18)'; ctx.lineWidth = 1;
      for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.moveTo(0, 28 + i * 34); ctx.lineTo(280, 28 + i * 34); ctx.stroke(); }
      ctx.fillStyle = 'rgba(50,220,80,0.32)';
      ctx.fillRect(20, zoneY, 240, zoneH);
      ctx.strokeStyle = '#50dd60'; ctx.lineWidth = 2;
      ctx.strokeRect(20, zoneY, 240, zoneH);
      ctx.fillStyle = '#50ff70'; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('CATCH ZONE', 140, zoneY + zoneH / 2 + 4);
      ctx.font = '28px serif'; ctx.textAlign = 'center';
      ctx.fillText('🐟', 140, fishY);
      const barX = 262, barH = 270;
      ctx.fillStyle = '#0a3050'; ctx.fillRect(barX - 6, 10, 12, barH);
      const zP = (zoneY - 10) / barH, zHp = zoneH / barH;
      ctx.fillStyle = '#30cc50'; ctx.fillRect(barX - 5, 10 + zP * barH, 10, zHp * barH);
      const fP = (fishY - 10) / barH;
      ctx.fillStyle = '#fff'; ctx.fillRect(barX - 7, 10 + fP * barH - 4, 14, 8);
    };

    const tick = () => {
      if (caught) return;
      fishY += fishDir * fishSpeed;
      if (fishY < 20 || fishY > 270) { fishDir *= -1; fishSpeed = 2 + Math.random() * 3; }
      draw();
      rafId = requestAnimationFrame(tick);
    };

    this._stopFishing = () => cancelAnimationFrame(rafId);

    catchBtn.addEventListener('click', () => {
      if (caught) return;
      caught = true;
      cancelAnimationFrame(rafId);
      const inZone = fishY >= zoneY && fishY <= zoneY + zoneH;
      if (inZone) {
        const kinds = Object.keys(FISH);
        const weights = kinds.map(k => FISH[k].weight);
        const total = weights.reduce((a, b) => a + b, 0);
        let r = Math.random() * total;
        let caughtKind = kinds[0];
        for (let i = 0; i < kinds.length; i++) { r -= weights[i]; if (r <= 0) { caughtKind = kinds[i]; break; } }
        const fishDef = FISH[caughtKind];
        onCatch(caughtKind, fishDef);
        ctx.clearRect(0, 0, 280, 290);
        ctx.fillStyle = '#1a5070'; ctx.fillRect(0, 0, 280, 290);
        ctx.font = '60px serif'; ctx.textAlign = 'center'; ctx.fillText('🎉', 140, 110);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 18px system-ui'; ctx.fillText(`Caught a ${fishDef.label}!`, 140, 165);
        ctx.fillStyle = '#f5c842'; ctx.font = '14px system-ui'; ctx.fillText(`Worth ${fishDef.sellPrice} 🪙 in the Market`, 140, 195);
        catchBtn.textContent = 'Close';
        catchBtn.onclick = () => closeFn();
      } else {
        ctx.clearRect(0, 0, 280, 290);
        ctx.fillStyle = '#1a5070'; ctx.fillRect(0, 0, 280, 290);
        ctx.font = '60px serif'; ctx.textAlign = 'center'; ctx.fillText('🎣', 140, 110);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 16px system-ui'; ctx.fillText('The fish got away!', 140, 165);
        ctx.fillStyle = '#aaa'; ctx.font = '13px system-ui'; ctx.fillText('Try again', 140, 195);
        catchBtn.textContent = 'Close';
        catchBtn.onclick = () => closeFn();
      }
    });

    rafId = requestAnimationFrame(tick);
    modal.appendChild(body);
  }

  closeAllModals() {
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
  }
}
