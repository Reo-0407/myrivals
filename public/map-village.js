// 맵 "사막 마을": 중앙 광장 + 흙벽돌 집들 + 좁은 골목. 64x64m, 남쪽(z+)이 A팀 / 북쪽(z-)이 B팀 스폰.
// 집은 문(폭 2.4m)으로 드나들고, 큰 창문은 점프로 넘을 수 있음. 지붕은 집 바깥 계단으로 올라감(봇은 지상만 다님).
(function () {
  function rnd(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

  window.RivalMap.register('village', {
    name: '사막 마을',
    build(c) {
      const { scene, opts, boxes, W, box, deco, stairsZ, stairsX, barrel, mirrorZ } = c;
      const ADOBE = 0xe6d0a8, DARKADOBE = 0xc9a06c, CLAY = 0xb8643c, WOODB = 0x7a5a38, GREEN = 0x3f7a3a;

      // ---------------- 조명 (따뜻한 햇빛) ----------------
      scene.add(new THREE.HemisphereLight(0xfff0d8, 0x8a7458, 1.0));
      const sun = new THREE.DirectionalLight(0xfff0cc, 0.85);
      sun.position.set(-30, 60, 25);
      if (opts.shadows) {
        sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
        const sc = sun.shadow.camera; sc.left = -50; sc.right = 50; sc.top = 50; sc.bottom = -50; sc.near = 10; sc.far = 150;
        sun.shadow.bias = -0.0008;
      }
      scene.add(sun);

      // ---------------- 바닥 / 바깥 담장 / 먼 사막 ----------------
      box(-80, 80, -0.3, 0, -80, 80, 'sand', 0xc9b58a, false, false); // 너무 하얗지 않게 색을 살짝 어둡게
      box(-33, 33, 0, 6, -33, -32, 'adobe', ADOBE); box(-33, 33, 0, 6, 32, 33, 'adobe', ADOBE);
      box(-33, -32, 0, 6, -32, 32, 'adobe', ADOBE); box(32, 33, 0, 6, -32, 32, 'adobe', ADOBE);
      const r = rnd(77);
      for (let i = 0; i < 24; i++) { // 담장 바깥의 모래 언덕과 바위산 (장식)
        const a = (i / 24) * Math.PI * 2, dist = 50 + r() * 25, bw = 8 + r() * 14, bh = 3 + r() * 16;
        const cx = Math.cos(a) * dist, cz = Math.sin(a) * dist;
        deco(cx - bw / 2, cx + bw / 2, 0, bh, cz - bw / 2, cz + bw / 2, 'adobe', i % 3 === 0 ? 0xc79a62 : 0xd6b27c);
      }

      // ---------------- 도우미: 벽(문/창문 구멍 포함), 집 ----------------
      // axis 'x': x방향으로 a→b 로 뻗는 벽(z=cc), 'z': z방향 벽(x=cc). gaps = [{a,b,y0(구멍 아래 높이),y1(구멍 위 높이)}]
      function wall(axis, a, b, cc, th, H, gaps, kind, color, yBase) {
        const y0 = yBase || 0;
        const seg = (s0, s1, ya, yb) => {
          if (s1 <= s0 + 1e-6 || yb <= ya + 1e-6) return;
          if (axis === 'x') box(s0, s1, ya, yb, cc - th / 2, cc + th / 2, kind, color);
          else box(cc - th / 2, cc + th / 2, ya, yb, s0, s1, kind, color);
        };
        let cur = a;
        (gaps || []).slice().sort((p, q) => p.a - q.a).forEach((g) => { seg(cur, g.a, y0, H); seg(g.a, g.b, y0, g.y0); seg(g.a, g.b, g.y1, H); cur = g.b; });
        seg(cur, b, y0, H);
      }

      // 집: (x0..x1, z 두 값). door = {side:'x0'|'x1'|'zin'|'zout', at}, windows = [{side, at}], stairSide = 'x0'|'x1'(지붕 계단), H = 벽 높이
      function house(x0, x1, za, zb, cfg) {
        const z0 = Math.min(za, zb), z1 = Math.max(za, zb), H = cfg.H || 3.8, T = 0.5;
        const zin = Math.abs(z0) < Math.abs(z1) ? z0 : z1, zout = zin === z0 ? z1 : z0; // 광장(z=0) 쪽 / 바깥쪽 벽
        const sideKey = (side) => side === 'zin' ? 'z:' + zin : side === 'zout' ? 'z:' + zout : side;
        const gapsFor = (key) => {
          const g = [];
          if (cfg.door && sideKey(cfg.door.side) === key) g.push({ a: cfg.door.at - 1.2, b: cfg.door.at + 1.2, y0: 0, y1: 3.0 });
          (cfg.windows || []).forEach((w) => { if (sideKey(w.side) === key) g.push({ a: w.at - 1.1, b: w.at + 1.1, y0: 1.0, y1: 3.2 }); });
          return g;
        };
        wall('x', x0, x1, z0, T, H, gapsFor('z:' + z0), 'adobe', ADOBE);
        if (z1 !== z0) wall('x', x0, x1, z1, T, H, gapsFor('z:' + z1), 'adobe', ADOBE);
        wall('z', z0, z1, x0, T, H, gapsFor('x0'), 'adobe', ADOBE);
        wall('z', z0, z1, x1, T, H, gapsFor('x1'), 'adobe', ADOBE);
        // 지붕 + 낮은 난간(엄폐물). 계단이 닿는 쪽 끝은 난간을 비워 둠
        box(x0 - 0.25, x1 + 0.25, H, H + 0.4, z0 - 0.25, z1 + 0.25, 'adobe', DARKADOBE);
        const top = H + 1.1;
        const stairKey = cfg.stairSide;
        wall('x', x0 - 0.25, x1 + 0.25, z0 - 0.15, 0.3, top, null, 'adobe', ADOBE, H + 0.4);
        wall('x', x0 - 0.25, x1 + 0.25, z1 + 0.15, 0.3, top, null, 'adobe', ADOBE, H + 0.4);
        wall('z', z0 - 0.25, z1 + 0.25, x0 - 0.15, 0.3, top, stairKey === 'x0' ? [{ a: z0 - 0.3, b: z0 + 1.8, y0: 0, y1: 99 }] : null, 'adobe', ADOBE, H + 0.4);
        wall('z', z0 - 0.25, z1 + 0.25, x1 + 0.15, 0.3, top, stairKey === 'x1' ? [{ a: z0 - 0.3, b: z0 + 1.8, y0: 0, y1: 99 }] : null, 'adobe', ADOBE, H + 0.4);
        // 바깥 계단: 벽을 따라 올라가며 끝(꼭대기)이 지붕과 같은 높이
        if (stairKey) {
          const n = 11, rise = (H + 0.4) / n, run = 0.7;
          const xs = stairKey === 'x0' ? x0 - 1.8 : x1 + 0.4;
          stairsZ(xs, xs + 1.4, z1 - 0.2, -1, n, rise, run, 'adobe', DARKADOBE);
        }
        if (cfg.furnish) cfg.furnish(); // 집 안 가구/엄폐물
      }

      // ---------------- 스폰 구역 ----------------
      deco(-11, 11, 0, 0.04, 22, 31, 'plain', 0x2a52a8);
      deco(-11, 11, 0, 0.04, -31, -22, 'plain', 0xa83a3f);
      mirrorZ((s) => { // 스폰 앞 낮은 담
        box(-10, -5.5, 0, 1.3, 20 * s, 20.5 * s, 'adobe', ADOBE);
        box(5.5, 10, 0, 1.3, 20 * s, 20.5 * s, 'adobe', ADOBE);
      });

      // ---------------- 집들 (남북 대칭) ----------------
      mirrorZ((s) => {
        // 서쪽 큰 집: 문은 광장 쪽(동쪽 벽), 바깥 골목 쪽 창문, 지붕 계단은 서쪽 골목
        house(-23, -15, -17 * s, -9 * s, {
          door: { side: 'x1', at: -13 * s }, windows: [{ side: 'x0', at: -13 * s }, { side: 'zin', at: -19 }], stairSide: 'x0',
          furnish: () => { box(-20.5, -19, 0, 1.0, -14.5 * s, -13.5 * s, 'crate', W); box(-18, -16.8, 0, 1.2, -16 * s, -15 * s, 'crate', W); },
        });
        // 동쪽 집: 문은 광장 쪽(서쪽 벽), 지붕 계단은 동쪽 골목
        house(13, 22, -16 * s, -8 * s, {
          door: { side: 'x0', at: -12 * s }, windows: [{ side: 'x1', at: -12 * s }, { side: 'zin', at: 17 }], stairSide: 'x1',
          furnish: () => { box(16, 18.4, 0, 1.0, -13 * s, -11.5 * s, 'crate', W); },
        });
        // 광장 앞쪽 작은 창고: 문은 광장 쪽(스폰 앞을 가리지 않게 광장 가까이에 둠)
        house(-4, 4, -16 * s, -11 * s, { H: 3.2, door: { side: 'zin', at: 0 }, windows: [{ side: 'x1', at: -13.5 * s }] });
      });

      // ---------------- 광장: 우물 + 시장 가판대 ----------------
      box(-1.6, 1.6, 0, 1.2, -1.6, 1.6, 'adobe', DARKADOBE);          // 우물
      deco(-1.1, 1.1, 1.2, 1.3, -1.1, 1.1, 'plain', 0x3a6fa8);        // 우물 물
      mirrorZ((s) => {
        [[-7, -4.5, 0xc2563c], [7, -4.5, 0x3a7ac2]].forEach(([x, z, color]) => { // 가판대: 계산대(엄폐) + 차양(장식)
          box(x - 1.6, x + 1.6, 0, 1.0, (z - 0.5) * s, (z + 0.5) * s, 'crate', W);
          deco(x - 2, x + 2, 2.55, 2.7, (z - 1.6) * s, (z + 1.6) * s, 'plain', color);
          [[-1.9, -1.5], [1.9, -1.5], [-1.9, 1.5], [1.9, 1.5]].forEach(([px, pz]) => deco(x + px - 0.06, x + px + 0.06, 0, 2.55, (z + pz) * s - 0.06, (z + pz) * s + 0.06, 'plain', WOODB));
        });
        // 골목 엄폐물: 낮은 담, 상자, 드럼통
        box(-13, -8, 0, 1.4, -24.6 * s, -24.1 * s, 'adobe', ADOBE);
        box(11.5, 16.5, 0, 1.4, -27 * s, -26.5 * s, 'adobe', ADOBE);
        box(-30, -26, 0, 1.4, -6 * s, -5.5 * s, 'adobe', ADOBE);
        box(26, 30, 0, 1.4, -4 * s, -3.5 * s, 'adobe', ADOBE);
        box(-28, -26.8, 0, 1.2, -21 * s, -19.8 * s, 'crate', W); box(-28, -26.8, 1.2, 2.4, -21 * s, -19.8 * s, 'crate', W);
        box(25, 26.2, 0, 1.2, -19 * s, -17.8 * s, 'crate', W);
        box(-9, -7.8, 0, 1.2, -14 * s, -12.8 * s, 'crate', W);
        box(7.8, 9, 0, 1.2, -13 * s, -11.8 * s, 'crate', W);
        box(1.2, 2.4, 0, 1.2, -30.4 * s, -29.2 * s, 'crate', W);
        barrel(-29, -12 * s, 0xb8643c); barrel(-27.8, -13 * s, 0x6e7580);
        barrel(28.5, -10 * s, 0x3c7a4a); barrel(27.3, -11 * s, 0xb8643c);
        // 야자수 (줄기는 부딪힘, 잎은 장식)
        [[-29, -29], [29, -29], [-9, -17], [10, -17.5]].forEach(([x, z]) => {
          box(x - 0.25, x + 0.25, 0, 4.2, (z - 0.25) * s, (z + 0.25) * s, 'plain', WOODB);
          deco(x - 2.2, x + 2.2, 4.2, 4.45, (z - 0.5) * s, (z + 0.5) * s, 'plain', GREEN);
          deco(x - 0.5, x + 0.5, 4.2, 4.45, (z - 2.2) * s, (z + 2.2) * s, 'plain', GREEN);
          deco(x - 1.4, x + 1.4, 4.5, 4.7, (z - 1.4) * s, (z + 1.4) * s, 'plain', 0x4f9444);
        });
      });

      // ---------------- 양옆 급수탑 (랜드마크 + 큰 엄폐물) ----------------
      [-27, 27].forEach((x) => {
        [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]].forEach(([dx, dz]) => box(x + dx - 0.3, x + dx + 0.3, 0, 6, dz - 0.3, dz + 0.3, 'metal', 0x7a6a58));
        box(x - 2.2, x + 2.2, 6, 9, -2.2, 2.2, 'metal', 0x9a8470);
        deco(x - 2.3, x + 2.3, 9, 9.3, -2.3, 2.3, 'plain', 0x6a5a48);
      });

      // 스폰 위치: 팀당 7곳. yaw 0 = 북쪽(-z) 바라봄, PI = 남쪽(+z) 바라봄
      const spawns = { A: [], B: [] };
      for (let i = -3; i <= 3; i++) {
        spawns.A.push({ x: i * 3, z: 27, yaw: 0 });
        spawns.B.push({ x: i * 3, z: -27, yaw: Math.PI });
      }
      return { boxes, spawns, name: '사막 마을', sky: 0xe9cf9c };
    },
  });
})();
