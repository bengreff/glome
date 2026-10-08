// Saving. Two records in browser storage (everything works without storage):
//  - settings: how you like to play (mouse, volume, quality, radar view). Kept across "new world".
//  - the world: where you are, the clock, and (as later milestones add them) every object that has moved, puzzle
//    and discovery flags, creature populations and the console's laws. Versioned, with migrations.
// Both can be exported to one .hoop file (JSON) and imported again.
import { G } from './game.js';

export const SAVE_VERSION = 1;
const KEY_SETTINGS = 'glome.settings', KEY_WORLD = 'glome.world', OLD_KEY = 'hoop.settings';
const RADAR_SAVED = ['big', 'range', 'compass', 'layers', 'hidden', 'yaw', 'el'];
export const settings = { sens: 1, sound: 0.8, music: 0.7, quality: 'high' };

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

export function loadSettings() {
  try {
    const s = JSON.parse(store.get(KEY_SETTINGS) || store.get(OLD_KEY) || '{}');
    for (const key of RADAR_SAVED) if (s.radar && key in s.radar) G.state.radar[key] = s.radar[key];
    G.state.radar.grow = G.state.radar.big ? 1 : 0;
    for (const key of Object.keys(settings)) if (s.play && key in s.play) settings[key] = s.play[key];
  } catch {}
}
function settingsRecord() {
  return { radar: Object.fromEntries(RADAR_SAVED.map(key => [key, G.state.radar[key]])), play: { ...settings } };
}
export function saveSettings() { store.set(KEY_SETTINGS, JSON.stringify(settingsRecord())); }

// ---------- the world ----------
// Parts of the game register what they save: hooks[name] = { save() -> json, load(json) }.
export const hooks = {};
const r5 = v => Math.round(v * 1e5) / 1e5;
const vec = a => a.map(r5);

function worldRecord() {
  const p = G.player;
  const rec = {
    version: SAVE_VERSION, savedAt: new Date().toISOString(),
    time: G.state.time,
    player: { pos: p.pos.slice(), vel: vec(p.vel), F: vec(p.F), R: vec(p.R), A: vec(p.A), pitch: r5(p.pitch),
              dry: p.dry && { pos: p.dry.pos.slice(), F: vec(p.dry.F), R: vec(p.dry.R), A: vec(p.dry.A) } },
  };
  for (const [name, h] of Object.entries(hooks)) { try { rec[name] = h.save(); } catch (e) { console.warn('save', name, e); } }
  return rec;
}
// Old saves are brought up to date one version at a time.
const MIGRATIONS = {
  // 0: (rec) => { ...; rec.version = 1; return rec; },
};
function migrate(rec) {
  if (!rec || typeof rec !== 'object' || typeof rec.version !== 'number') throw new Error('not a Glome save');
  if (rec.version > SAVE_VERSION) throw new Error(`this save is from a newer version of Glome (v${rec.version})`);
  while (rec.version < SAVE_VERSION) {
    const m = MIGRATIONS[rec.version];
    if (!m) throw new Error(`no migration from save version ${rec.version}`);
    rec = m(rec);
  }
  return rec;
}
export function saveWorld() { if (G.player && !G.resetting) store.set(KEY_WORLD, JSON.stringify(worldRecord())); }

// Restore the world from storage, if there is a save. Returns true if one was loaded.
export function loadWorld() {
  const raw = store.get(KEY_WORLD);
  if (!raw) return false;
  try {
    const rec = migrate(JSON.parse(raw)), p = G.player, q = rec.player;
    G.state.time = rec.time;
    p.pos = q.pos; p.vel = q.vel; p.F = q.F; p.R = q.R; p.A = q.A; p.pitch = q.pitch; p.dry = q.dry || null;
    p.settleFrame();
    for (const [name, h] of Object.entries(hooks)) if (name in rec) { try { h.load(rec[name]); } catch (e) { console.warn('load', name, e); } }
    return true;
  } catch (e) { console.warn('Glome: could not load the saved world:', e.message); return false; }
}

export function startAutosave() {
  const both = () => { if (!G.resetting) { saveWorld(); saveSettings(); } };   // not while an import or reset reloads
  setInterval(both, 3000);
  addEventListener('pagehide', both);
  addEventListener('beforeunload', both);
}

// ---------- the .hoop file ----------
export function exportFile() {
  saveWorld();
  const blob = new Blob([JSON.stringify({ glome: true, settings: settingsRecord(), world: worldRecord() }, null, 1)], { type: 'application/json' });
  const d = new Date(), pad = n => String(n).padStart(2, '0');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `glome-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.hoop`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
// Check a file, store it, and restart into it. Returns an error message, or null on success.
export async function importFile(file) {
  try {
    const rec = JSON.parse(await file.text());
    if (!rec.glome || !rec.world) throw new Error('not a Glome save');
    migrate(structuredClone(rec.world));
    G.resetting = true;
    store.set(KEY_WORLD, JSON.stringify(rec.world));
    if (rec.settings) store.set(KEY_SETTINGS, JSON.stringify(rec.settings));
    location.reload();
    return null;
  } catch (e) { return e.message; }
}
export function newWorld() {
  G.resetting = true;
  store.del(KEY_WORLD);
  location.reload();
}
// for tests: the record that would be saved, and a way to load one directly
export const _debug = { worldRecord, migrate, KEY_WORLD };
