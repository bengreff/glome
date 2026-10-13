(async () => { const { g, p, d, V, nz, gt } = PT, L = d.launcher;
const up = nz(L.site), cam = p.camera(); p.pos = V.add(L.site, V.sc(up, 0.05)); p.vel = [0, 0, 0, 0];
// face the barrel's post
const T = d.launcher.aim.R; p.settleFrame(); await gt(0.3);
const dd = V.sub(L.aim.top, p.camera().eye), u = p.up(); let h = V.sub(dd, V.sc(u, V.dot(dd, u))); h = V.sub(h, V.sc(p.A, V.dot(h, p.A))); p.F = nz(h); p.settleFrame(); p.pitch = 0.05;
L.setAim([0.6, 0.35, 1.1]); L.setSpeed(58); await gt(0.6);
return 1; })()
