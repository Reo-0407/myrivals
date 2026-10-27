// 맵 "정글 유적": 덩굴에 덮인 돌 유적. 가운데 신전 안뜰(네 면에 입구) + 양쪽 무너진 돌담과 기둥. 64x64m, 남쪽(z+)이 A팀 / 북쪽(z-)이 B팀 스폰.
// 전부 평지(계단/2층 없음)라 봇이 어디든 갈 수 있음. 낮은 돌(1.2m)은 점프로 넘을 수 있음.
(function () {
  function rnd(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

  window.RivalMap.register('ruins', {
    name: '정글 유적',
    build(c) {
      const { scene, opts, boxes, W, box, deco, barrel, mirrorZ } = c;
      const GRASS = 0x5c8a45, STONE = 0xa7a69a, MOSS = 0x6f8f5a, DARK = 0x7b7a70, TRUNK = 0x6b4a2c, LEAF = 0x2e7a3a, WATER = 0x3f9fb0;

      // ---------------- 조명 (따뜻한 햇빛 + 숲 그늘) ----------------
      scene.add(new THREE.HemisphereLight(0xdff5d0, 0x4f6b3a, 1.0));
      const sun = new THREE.DirectionalLight(0xfff0c8, 0.85);
      sun.position.set(-20, 45, 25);
      if (opts.shadows) {
        sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
        const sc = sun.shadow.camera; sc.left = -50; sc.right = 50; sc.top = 50; sc.bottom = -50; sc.near = 10; sc.far = 150;
        sun.shadow.bias = -0.0008;
      }
      scene.add(sun);

      // ---------------- 바닥 / 바깥 돌담 / 먼 숲 ----------------
      box(-80, 80, -0.3, 0, -80, 80, 'plain', GRASS, false, false);
      box(-33, 33, 0, 5, -33, -32, 'concrete', DARK); box(-33, 33, 0, 5, 32, 33, 'concrete', DARK);
      box(-33, -32, 0, 5, -32, 32, 'concrete', DARK); box(32, 33, 0, 5, -32, 32, 'concrete', DARK);
      const r = rnd(77);
      for (let i = 0; i < 26; i++) { // 담장 바깥의 숲 (장식)
        const a = (i / 26) * Math.PI * 2, dist = 46 + r() * 20, bw = 6 + r() * 8, bh = 8 + r() * 12;
        const cx = Math.cos(a) * dist, cz = Math.sin(a) * dist;
        deco(cx - 0.8, cx + 0.8, 0, bh * 0.6, cz - 0.8, cz + 0.8, 'plain', TRUNK);
        deco(cx - bw / 2, cx + bw / 2, bh * 0.5, bh, cz - bw / 2, cz + bw / 2, 'plain', i % 2 ? LEAF : 0x3b8a42);
      }

      // ---------------- 도우미 ----------------
      function wall(axis, a, b, cc, th, H, gaps, color) { // 벽에 입구(gap) 구멍을 낼 수 있음
        const seg = (s0, s1, ya, yb) => {
          if (s1 <= s0 + 1e-6 || yb <= ya + 1e-6) return;
          if (axis === 'x') box(s0, s1, ya, yb, cc - th / 2, cc + th / 2, 'concrete', color);
          else box(cc - th / 2, cc + th / 2, ya, yb, s0, s1, 'concrete', color);
        };
        let cur = a;
        (gaps || []).slice().sort((p, q) => p.a - q.a).forEach((g) => { seg(cur, g.a, 0, H); seg(g.a, g.b, 3.0, H); cur = g.b; });
        seg(cur, b, 0, H);
      }
      const gap = (at) => ({ a: at - 1.5, b: at + 1.5 });
      const pillar = (x, z, h) => { box(x - 0.6, x + 0.6, 0, h, z - 0.6, z + 0.6, 'concrete', STONE); deco(x - 0.8, x + 0.8, h, h + 0.3, z - 0.8, z + 0.8, 'plain', MOSS); };
      const tree = (x, z) => {
        box(x - 0.35, x + 0.35, 0, 3.2, z - 0.35, z + 0.35, 'plain', TRUNK);
        deco(x - 2.2, x + 2.2, 2.8, 4.0, z - 2.2, z + 2.2, 'plain', LEAF);
        deco(x - 1.5, x + 1.5, 4.0, 5.2, z - 1.5, z + 1.5, 'plain', 0x3b8a42);
      };

      // ---------------- 스폰 구역 표시 ----------------
      deco(-11, 11, 0, 0.04, 22, 31, 'plain', 0x4a7ad0);
      deco(-11, 11, 0, 0.04, -31, -22, 'plain', 0xd05a62);

      // ---------------- 가운데 신전 안뜰: 12x12 돌담, 네 면 입구, 안쪽 기둥과 연못(장식) ----------------
      wall('x', -6, 6, -6, 0.8, 3.6, [gap(0)], STONE); wall('x', -6, 6, 6, 0.8, 3.6, [gap(0)], STONE);
      wall('z', -6, 6, -6, 0.8, 3.6, [gap(0)], STONE); wall('z', -6, 6, 6, 0.8, 3.6, [gap(0)], STONE);
      deco(-2.5, 2.5, 0, 0.05, -2.5, 2.5, 'plain', WATER);
      [[-3.5, -3.5], [3.5, -3.5], [-3.5, 3.5], [3.5, 3.5]].forEach(([x, z]) => pillar(x, z, 3.4));
      box(-1.0, 1.0, 0, 1.2, -1.0, 1.0, 'concrete', MOSS); // 제단 (낮은 엄폐물)

      // ---------------- 양쪽 진영 (남북 대칭) ----------------
      mirrorZ((s) => {
        // 무너진 돌담: ㄱ자
        box(-22, -14, 0, 2.6, -18 * s, -17.4 * s, 'concrete', STONE); box(-22, -21.4, 0, 2.6, -18 * s, -11 * s, 'concrete', STONE);
        box(14, 22, 0, 2.6, -18 * s, -17.4 * s, 'concrete', STONE); box(21.4, 22, 0, 2.6, -18 * s, -11 * s, 'concrete', STONE);
        // 부러진 기둥들
        pillar(-10, -14 * s, 3.2); pillar(10, -14 * s, 3.2); pillar(-16, -8 * s, 1.8); pillar(16, -8 * s, 1.8);
        pillar(-26, -4 * s, 2.6); pillar(26, -4 * s, 2.6);
        // 낮은 돌 / 이끼 낀 상자 / 드럼통
        box(-4, 4, 0, 1.2, -21 * s, -20.5 * s, 'concrete', MOSS);
        box(-8, -6, 0, 1.2, -24 * s, -22.5 * s, 'crate', W); box(6, 8, 0, 1.2, -24 * s, -22.5 * s, 'crate', W);
        box(-28, -24, 0, 1.2, -12 * s, -11.5 * s, 'concrete', MOSS); box(24, 28, 0, 1.2, -12 * s, -11.5 * s, 'concrete', MOSS);
        barrel(-17, -22 * s, 0x6e7580); barrel(17.8, -23 * s, 0xc2563c); barrel(-29, -20 * s, 0x3a7ac2);
        // 나무
        [[-29, -26], [29, -26], [-13, -27], [13, -27], [-24, -7], [24, -7], [0, -12]].forEach(([x, z]) => tree(x, z * s));
      });

      // 스폰 위치: 팀당 7곳. yaw 0 = 북쪽(-z) 바라봄, PI = 남쪽(+z) 바라봄
      const spawns = { A: [], B: [] };
      for (let i = -3; i <= 3; i++) {
        spawns.A.push({ x: i * 3, z: 27, yaw: 0 });
        spawns.B.push({ x: i * 3, z: -27, yaw: Math.PI });
      }
      return { boxes, spawns, name: '정글 유적', sky: 0xbfe3f0 };
    },
  });
})();
