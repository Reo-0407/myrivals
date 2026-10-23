// 맵 "설원 기지": 얼어붙은 호수를 가운데 두고 통나무집 4채 + 눈 방벽 + 소나무. 64x64m, 남쪽(z+)이 A팀 / 북쪽(z-)이 B팀 스폰.
// 호수는 걸어 다닐 수 있음(얼음). 집은 문(폭 2.4m)으로 드나들고, 큰 창문은 점프로 넘을 수 있음. 지붕은 못 올라감(봇은 지상만 다님).
(function () {
  function rnd(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

  window.RivalMap.register('snow', {
    name: '설원 기지',
    build(c) {
      const { scene, opts, boxes, W, box, deco, barrel, mirrorZ } = c;
      const SNOW = 0xdfe9f2, ICE = 0x6fb4e6, LOG = 0x8a5a36, DARKLOG = 0x5e3d24, PINE = 0x2f6b4a, ROCK = 0xb5c3d1;

      // ---------------- 조명 (차가운 하늘 + 낮은 햇빛) ----------------
      scene.add(new THREE.HemisphereLight(0xe6f1ff, 0x9fb0c4, 1.05));
      const sun = new THREE.DirectionalLight(0xfff4e0, 0.75);
      sun.position.set(25, 45, 30);
      if (opts.shadows) {
        sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
        const sc = sun.shadow.camera; sc.left = -50; sc.right = 50; sc.top = 50; sc.bottom = -50; sc.near = 10; sc.far = 150;
        sun.shadow.bias = -0.0008;
      }
      scene.add(sun);

      // ---------------- 바닥(눈) / 호수(얼음) / 바깥 담장 / 먼 설산 ----------------
      box(-80, 80, -0.3, 0, -80, 80, 'plain', SNOW, false, false);
      deco(-10, 10, 0, 0.04, -8, 8, 'plain', ICE);   // 얼어붙은 호수 (걸을 수 있음)
      const FENCE = 0x9aa7b5;
      box(-33, 33, 0, 5, -33, -32, 'metal', FENCE); box(-33, 33, 0, 5, 32, 33, 'metal', FENCE);
      box(-33, -32, 0, 5, -32, 32, 'metal', FENCE); box(32, 33, 0, 5, -32, 32, 'metal', FENCE);
      const r = rnd(31);
      for (let i = 0; i < 22; i++) { // 담장 바깥의 설산 (장식)
        const a = (i / 22) * Math.PI * 2, dist = 52 + r() * 22, bw = 10 + r() * 16, bh = 6 + r() * 20;
        const cx = Math.cos(a) * dist, cz = Math.sin(a) * dist;
        deco(cx - bw / 2, cx + bw / 2, 0, bh, cz - bw / 2, cz + bw / 2, 'plain', i % 2 ? 0xe8f0f8 : 0xc8d6e4);
        deco(cx - bw / 4, cx + bw / 4, bh, bh + 3, cz - bw / 4, cz + bw / 4, 'plain', 0xffffff);
      }

      // ---------------- 도우미: 벽(문/창문 구멍 포함) ----------------
      function wall(axis, a, b, cc, th, H, gaps, kind, color) {
        const seg = (s0, s1, ya, yb) => {
          if (s1 <= s0 + 1e-6 || yb <= ya + 1e-6) return;
          if (axis === 'x') box(s0, s1, ya, yb, cc - th / 2, cc + th / 2, kind, color);
          else box(cc - th / 2, cc + th / 2, ya, yb, s0, s1, kind, color);
        };
        let cur = a;
        (gaps || []).slice().sort((p, q) => p.a - q.a).forEach((g) => { seg(cur, g.a, 0, H); seg(g.a, g.b, 0, g.y0); seg(g.a, g.b, g.y1, H); cur = g.b; });
        seg(cur, b, 0, H);
      }
      const door = (at) => ({ a: at - 1.2, b: at + 1.2, y0: 0, y1: 3.0 });
      const win = (at) => ({ a: at - 1.1, b: at + 1.1, y0: 1.0, y1: 2.6 });

      // 통나무집: x0..x1, z0..z1. doorSide 'x0'|'x1', doorZ 문 위치(z), zWindowSide 'z0'|'z1' 쪽 벽에 창문
      function cabin(x0, x1, z0, z1, doorSide, doorZ, winZ, furnish) {
        const H = 3.2, T = 0.5, mx = (x0 + x1) / 2;
        const zWall = (z) => wall('x', x0, x1, z, T, H, (z === winZ.z ? [win(mx)] : null), 'crate', LOG);
        zWall(z0); zWall(z1);
        wall('z', z0, z1, x0, T, H, [doorSide === 'x0' ? door(doorZ) : win(winZ.zc)], 'crate', LOG);
        wall('z', z0, z1, x1, T, H, [doorSide === 'x1' ? door(doorZ) : win(winZ.zc)], 'crate', LOG);
        box(x0 - 0.35, x1 + 0.35, H, H + 0.4, Math.min(z0, z1) - 0.35, Math.max(z0, z1) + 0.35, 'plain', 0xf4f8fc); // 눈 덮인 지붕
        if (furnish) furnish();
      }

      // ---------------- 스폰 구역 표시 ----------------
      deco(-11, 11, 0, 0.04, 22, 31, 'plain', 0x4a7ad0);
      deco(-11, 11, 0, 0.04, -31, -22, 'plain', 0xd05a62);

      // ---------------- 통나무집 4채 + 엄폐물 (남북 대칭) ----------------
      mirrorZ((s) => {
        const zA = -17 * s, zB = -9 * s, zc = -13 * s;
        // 서쪽 집: 문은 호수 쪽(동쪽 벽 x1)
        cabin(-23, -15, zA, zB, 'x1', zc, { z: zB, zc }, () => { box(-21, -19.6, 0, 1.0, zc - 0.7, zc + 0.7, 'crate', W); });
        // 동쪽 집: 문은 호수 쪽(서쪽 벽 x0)
        cabin(15, 23, zA, zB, 'x0', zc, { z: zB, zc }, () => { box(19.6, 21, 0, 1.0, zc - 0.7, zc + 0.7, 'crate', W); });

        // 눈 방벽(낮은 엄폐물)과 상자, 드럼통
        box(-8, -3.5, 0, 1.4, -22 * s, -21.5 * s, 'plain', 0xf1f6fb);
        box(3.5, 8, 0, 1.4, -22 * s, -21.5 * s, 'plain', 0xf1f6fb);
        box(-1.5, 1.5, 0, 1.4, -17 * s, -16.5 * s, 'plain', 0xf1f6fb);
        box(-30, -26, 0, 1.4, -6.5 * s, -6 * s, 'plain', 0xf1f6fb);
        box(26, 30, 0, 1.4, -6.5 * s, -6 * s, 'plain', 0xf1f6fb);
        box(-13, -12, 0, 1.2, -19 * s, -17.8 * s, 'crate', W); box(-13, -12, 1.2, 2.4, -19 * s, -17.8 * s, 'crate', W);
        box(12, 13.2, 0, 1.2, -19 * s, -17.8 * s, 'crate', W);
        barrel(-27.5, -22 * s, 0xc2563c); barrel(-26.3, -23 * s, 0x3a7ac2);
        barrel(27, -21 * s, 0x6e7580); barrel(25.8, -22 * s, 0xc2563c);
        // 호수 주변 얼음 바위
        [[-12.5, -3], [12.5, -4], [-6, -10.5], [7, -11]].forEach(([x, z]) => {
          box(x - 1.3, x + 1.3, 0, 1.9, (z - 1.1) * s, (z + 1.1) * s, 'concrete', ROCK);
          deco(x - 0.8, x + 0.8, 1.9, 2.5, (z - 0.7) * s, (z + 0.7) * s, 'plain', 0xf4f8fc);
        });
        // 소나무 (줄기는 부딪힘, 잎은 장식)
        [[-29, -27], [29, -27], [-18, -24], [18, -24], [-5.5, -29], [5.5, -29.5], [-30, -10], [30, -11]].forEach(([x, z]) => {
          box(x - 0.3, x + 0.3, 0, 3, (z - 0.3) * s, (z + 0.3) * s, 'plain', DARKLOG);
          deco(x - 1.9, x + 1.9, 2.4, 3.4, (z - 1.9) * s, (z + 1.9) * s, 'plain', PINE);
          deco(x - 1.3, x + 1.3, 3.4, 4.6, (z - 1.3) * s, (z + 1.3) * s, 'plain', 0x3a7d58);
          deco(x - 0.7, x + 0.7, 4.6, 5.8, (z - 0.7) * s, (z + 0.7) * s, 'plain', 0xf4f8fc);
        });
      });

      // ---------------- 양옆 감시탑 (랜드마크 + 큰 엄폐물) ----------------
      [-27, 27].forEach((x) => {
        [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]].forEach(([dx, dz]) => box(x + dx - 0.3, x + dx + 0.3, 0, 7, dz - 0.3, dz + 0.3, 'plain', DARKLOG));
        box(x - 2.4, x + 2.4, 7, 7.5, -2.4, 2.4, 'plain', LOG);
        deco(x - 2.6, x + 2.6, 7.5, 9.3, -2.6, 2.6, 'plain', 0xf4f8fc);
      });

      // 스폰 위치: 팀당 7곳. yaw 0 = 북쪽(-z) 바라봄, PI = 남쪽(+z) 바라봄
      const spawns = { A: [], B: [] };
      for (let i = -3; i <= 3; i++) {
        spawns.A.push({ x: i * 3, z: 27, yaw: 0 });
        spawns.B.push({ x: i * 3, z: -27, yaw: Math.PI });
      }
      return { boxes, spawns, name: '설원 기지', sky: 0xcfe3f2 };
    },
  });
})();
