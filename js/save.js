// Saving. For now: the radar settings, remembered between visits (everything works without storage).
import { G } from './game.js';

const RADAR_SAVED = ['big', 'range', 'compass', 'layers', 'hidden', 'yaw', 'el'];
const KEY = 'glome.settings', OLD_KEY = 'hoop.settings';   // the game was called Hoop until 2026-10-07

export function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY) || '{}');
    for (const key of RADAR_SAVED) if (s.radar && key in s.radar) G.state.radar[key] = s.radar[key];
    G.state.radar.grow = G.state.radar.big ? 1 : 0;
  } catch {}
}
export function saveSettings() {
  try {
    const s = { radar: Object.fromEntries(RADAR_SAVED.map(key => [key, G.state.radar[key]])) };
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}
