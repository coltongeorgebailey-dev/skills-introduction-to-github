const SAVE_KEY = 'farmsim_save';

export function saveGame(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Save failed:', e);
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn('Load failed:', e);
    return null;
  }
}

export function clearSave() {
  localStorage.removeItem(SAVE_KEY);
}
