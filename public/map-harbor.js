// 맵 "항구 부두": 컨테이너 골목 + 가운데 관리동 + 양옆 크레인. 64x64m, 남쪽(z+)이 A팀 / 북쪽(z-)이 B팀 스폰.
// 컨테이너 사이 길은 3m 이상이라 봇도 잘 다님. 관리동은 문 2개(대각선)와 큰 창문 4개.
(function () {
  window.RivalMap.register('harbor', {
    name: '항구 부두',
    build(c) {
      const { scene, opts, boxes, W, box, deco, barrel, mirrorZ } = c;
      const RED = 0xb23a2e, BLUE = 0x2f5f9e, GREEN = 0x3a7a4e, ORANGE = 0xd98a2b, GREY = 0x8a929c, YEL = 0xd9b82b;

      // ---------------- 조명 (맑은 바닷가 햇빛) ----------------
      scene.add(new THREE.HemisphereLight(0xe8f2ff, 0x7d8794, 1.0));
      const sun = new THREE.DirectionalLight(0xfff6e0, 0.8);
      sun.position.set(30, 60, -20);
      if (opts.shadows) {
        sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
        const sc = sun.shadow.camera; sc.left = -50; sc.right = 50; sc.top = 50; sc.bottom = -50; sc.near = 10; sc.far = 150;
        sun.shadow.bias = -0.0008;
      }
      scene.add(sun);

      // ---------------- 바닥(콘크리트) / 바다 / 바깥 담장 ----------------
      deco(-120, 120, -0.6, -0.35, -120, 120, 'plain', 0x2f6f9a);          // 담장 바깥은 바다
      box(-33, 33, -0.3, 0, -33, 33, 'concrete', 0xb4b8bd, false, false);   // 부두 바닥
      const FENCE = 0x7d8794;
      box(-33, 33, 0, 5, -33, -32, 'metal', FENCE); box(-33, 33, 0, 5, 32, 33, 'metal', FENCE);
      box(-33, -32, 0, 5, -32, 32, 'metal', FENCE); box(32, 33, 0, 5, -32, 32, 'metal', FENCE);
      // 멀리 보이는 쌓인 컨테이너와 배 (장식)
      const cols = [RED, BLUE, GREEN, ORANGE, GREY, YEL];
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2, d = 55 + (i % 3) * 8;
        const cx = Math.cos(a) * d, cz = Math.sin(a) * d;
        deco(cx - 3, cx + 3, 0, 2.6 + (i % 2) * 2.6, cz - 1.3, cz + 1.3, 'metal', cols[i % cols.length]);
      }
      deco(-50, 50, 0, 5, -70, -60, 'metal', 0x3d4a5c); deco(-30, 30, 5, 9, -68, -62, 'plain', 0xdde2e8); // 먼 배

      // ---------------- 도우미: 컨테이너 / 벽(문·창문 구멍) ----------------
      const cont = (x0, x1, z0, z1, color, h) => { // 컨테이너: 속은 꽉 찬 엄폐물, 위에 줄무늬 장식
        box(x0, x1, 0, h || 2.6, z0, z1, 'metal', color);
      };
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

      // ---------------- 가운데 관리동 ----------------
      const OX0 = -7, OX1 = 7, OZ0 = -5, OZ1 = 5, OH = 3.4, T = 0.5;
      const win = (at) => ({ a: at - 1.1, b: at + 1.1, y0: 1.0, y1: 2.6 });
      const door = (at) => ({ a: at - 1.2, b: at + 1.2, y0: 0, y1: 3.0 });
      wall('x', OX0, OX1, OZ0, T, OH, [win(-3.5), win(3.5)], 'brick', 0xa86b4c);
      wall('x', OX0, OX1, OZ1, T, OH, [win(-3.5), win(3.5)], 'brick', 0xa86b4c);
      wall('z', OZ0, OZ1, OX0, T, OH, [door(-1.8)], 'brick', 0xa86b4c); // 서쪽 문은 북쪽, 동쪽 문은 남쪽 (대각선)
      wall('z', OZ0, OZ1, OX1, T, OH, [door(1.8)], 'brick', 0xa86b4c);
      box(OX0 - 0.3, OX1 + 0.3, OH, OH + 0.35, OZ0 - 0.3, OZ1 + 0.3, 'concrete', 0x8a8e94);
      box(-2.4, -0.4, 0, 1.1, -1.2, 0.2, 'crate', W);   // 집 안 엄폐물
      box(1.0, 3.0, 0, 1.1, -0.2, 1.2, 'crate', W);
      box(-5.6, -4.6, 0, 1.0, 2.6, 4.2, 'crate', W);

      // ---------------- 스폰 구역 표시 ----------------
      deco(-11, 11, 0, 0.04, 22, 31, 'plain', 0x2a52a8);
      deco(-11, 11, 0, 0.04, -31, -22, 'plain', 0xa83a3f);

      // ---------------- 컨테이너 골목 (남북 대칭) ----------------
      mirrorZ((s) => {
        cont(-26, -20, -16.5 * s, -14 * s, RED);
        cont(20, 26, -16.5 * s, -14 * s, BLUE);
        cont(-14, -8, -20.5 * s, -18 * s, GREEN);
        cont(8, 14, -20.5 * s, -18 * s, ORANGE);
        cont(5, 11, -23.5 * s, -21 * s, GREY);
        cont(-11, -5, -23.5 * s, -21 * s, YEL);
        cont(-29, -26.5, -11 * s, -5 * s, BLUE);       // 세로로 놓인 컨테이너
        cont(26.5, 29, -11 * s, -5 * s, RED);
        cont(-17, -14.5, -11 * s, -7 * s, ORANGE, 1.3); // 낮게 쌓인 컨테이너(뛰어넘기)
        cont(14.5, 17, -11 * s, -7 * s, GREEN, 1.3);
        // 시멘트 방벽(낮은 엄폐물)과 상자, 드럼통
        box(-4, 0, 0, 1.1, -13 * s, -12.4 * s, 'concrete', 0xa0a4aa);
        box(0, 4, 0, 1.1, -16.5 * s, -15.9 * s, 'concrete', 0xa0a4aa);
        box(-21, -18.4, 0, 1.1, -26 * s, -25.4 * s, 'concrete', 0xa0a4aa);
        box(18.4, 21, 0, 1.1, -26 * s, -25.4 * s, 'concrete', 0xa0a4aa);
        box(-24, -22.8, 0, 1.2, -22 * s, -20.8 * s, 'crate', W); box(-24, -22.8, 1.2, 2.4, -22 * s, -20.8 * s, 'crate', W);
        box(22.8, 24, 0, 1.2, -22 * s, -20.8 * s, 'crate', W);
        box(-1.2, 0, 0, 1.2, -29.4 * s, -28.2 * s, 'crate', W);
        barrel(-27, -17 * s, 0xb23a2e); barrel(-25.8, -18 * s, 0x6e7580);
        barrel(26.5, -17.5 * s, 0xd98a2b); barrel(25.4, -18.5 * s, 0x3a7a4e);
        // 가로등 기둥
        [[-12, -12], [12, -12]].forEach(([x, z]) => { box(x - 0.15, x + 0.15, 0, 5, (z - 0.15) * s, (z + 0.15) * s, 'metal', 0x4a5260); deco(x - 0.6, x + 0.6, 5, 5.2, (z - 0.25) * s, (z + 0.25) * s, 'plain', 0xfff2b0); });
      });

      // ---------------- 양옆 크레인 (랜드마크 + 큰 엄폐물) ----------------
      [-26, 26].forEach((x) => {
        [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]].forEach(([dx, dz]) => box(x + dx - 0.35, x + dx + 0.35, 0, 8, dz - 0.35, dz + 0.35, 'metal', YEL));
        box(x - 2.2, x + 2.2, 8, 8.8, -9, 9, 'metal', YEL);                 // 위의 큰 보
        deco(x - 0.6, x + 0.6, 4.5, 8, -0.3, 0.3, 'plain', 0x333a44);        // 매달린 케이블
      });

      // 스폰 위치: 팀당 7곳. yaw 0 = 북쪽(-z) 바라봄, PI = 남쪽(+z) 바라봄
      const spawns = { A: [], B: [] };
      for (let i = -3; i <= 3; i++) {
        spawns.A.push({ x: i * 3, z: 27, yaw: 0 });
        spawns.B.push({ x: i * 3, z: -27, yaw: Math.PI });
      }
      return { boxes, spawns, name: '항구 부두', sky: 0xa9c8e0 };
    },
  });
})();
