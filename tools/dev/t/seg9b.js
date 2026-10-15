(async () => { try { const { g, p, d, O, w, V, len, nz, gt } = PT, G = g.G, out = {};
const map = JSON.parse(document.querySelector('script[type=importmap]').textContent).imports, RD = await import(map['./js/radar.js']);
const R = RD.radar, cv = document.getElementById('view'), k = document.getElementById('overlay').width / innerWidth;
out.picks = R.picks.length;
const pk = R.picks.find(q => q.ref && q.ref.kind === 'raft') || R.picks.find(q => q.ref === 'launcher') || R.picks[0];
if (!pk) return JSON.stringify(out);
out.pickKind = pk.ref.kind || pk.ref;
const click = (x, y) => { cv.dispatchEvent(new MouseEvent('mousedown', { clientX: x / k, clientY: y / k, button: 0, bubbles: true })); window.dispatchEvent(new MouseEvent('mouseup', { clientX: x / k, clientY: y / k, button: 0, bubbles: true })); };
click(pk.x, pk.y); await gt(0.3);
out.goalAfter1 = d.guide.goal && d.guide.goal.kind; out.userSet = !!d.guide.user;
const pk2 = R.picks.find(q => q.ref === pk.ref); click(pk2.x, pk2.y); await gt(0.3);
out.userAfter2 = !!d.guide.user; out.goalAfter2 = d.guide.goal && d.guide.goal.kind;
out.errors = G.errors || 0; out.lastError = G.lastError || null;
return JSON.stringify(out);
} catch (e) { return 'ERR ' + e.message; } })()
