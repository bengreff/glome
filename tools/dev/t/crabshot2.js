(async () => { const { p, V, gt } = PT; p.pos = V.add(p.pos, V.sc(p.A, 0.3)); p.settleFrame(); await gt(0.4); return 1; })()
