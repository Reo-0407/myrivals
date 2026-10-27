// MyRivals 봇 AI v2
//  - 길찾기(A*) + 시야 판정 + 교전(조준/좌우 이동/재장전)
//  - 동선 다양화: 봇마다 역할(돌격/우회/매복/순찰), 팀 레인, 길마다 다른 비용(소음+지나간 길 기피)
//  - 학습: 보통 이상 난이도는 플레이어가 자주 있는 곳/싸우는 거리를 기억해서 점점 잘 싸움 (localStorage `rival_profile`)
//  - 빗나감: 조준 흔들림, 처음 몇 발 일부러 빗나가는 "미스 버스트", 맞았을 때 움찔, 연사 반동
(function () {
  const W = window.RivalWeapons;

  // 난이도 설정값
  //   react 적을 처음 본 뒤 쏘기까지 걸리는 시간(초)   aim 기본 조준 오차(도)   moveAim 적(나)이 움직일 때 추가되는 오차(도 per m/s)
  //   head 머리를 노릴 확률   turn 조준 회전 속도(rad/s)   strafe 좌우 이동 정도   dmg 봇 데미지 배율
  //   fov 시야 반각(라디안)   hear 총소리를 알아채는 거리(m)   burstOn/Off 연사 시간/쉬는 시간 범위(초)   pool 들고 나오는 주무기 후보
  //   wob 조준 흔들림(도)   pMiss 한 번 쏠 때마다 일부러 빗나가는 연사가 될 확률   miss 빗나갈 때 어긋나는 각도 범위(도)   rec 연사 반동 배율
  const ALL = ['ar', 'ar', 'burst', 'smg', 'smg', 'shotgun', 'sniper', 'lmg', 'dmr']; // 어려움/지옥 후보 (dmr 은 산 사람과 상관없이 봇이 사용. 연발 샷건은 좌우로 움직여도 90% 맞아서 제외)
  const DIFFS = {
    rookie: { name: '입문',   react: 1.5,  aim: 4.5, moveAim: 1.0,  head: 0.0,  turn: 1.8,  strafe: 0.15, dmg: 0.5,  fov: 0.95, hear: 12, burstOn: [0.25, 0.5], burstOff: [0.9, 1.7], pool: ['ar', 'smg'],                    wob: 2.2,  pMiss: 0.6,  miss: [4, 9],     rec: 1.0 },
    easy:   { name: '쉬움',   react: 1.0,  aim: 3.6, moveAim: 0.7,  head: 0.02, turn: 2.4,  strafe: 0.35, dmg: 0.65, fov: 1.0,  hear: 18, burstOn: [0.3, 0.7],  burstOff: [0.6, 1.3], pool: ['ar', 'smg', 'burst'],           wob: 1.8,  pMiss: 0.5,  miss: [3.5, 8],   rec: 0.9 },
    normal: { name: '보통',   react: 0.7,  aim: 3.0, moveAim: 0.55, head: 0.07, turn: 4.2,  strafe: 0.7,  dmg: 0.7,  fov: 1.1,  hear: 26, burstOn: [0.5, 1.0],  burstOff: [0.5, 1.1], pool: ['ar', 'smg', 'burst', 'shotgun'], wob: 1.3,  pMiss: 0.38, miss: [3, 7],     rec: 0.75 },
    hard:   { name: '어려움', react: 0.35, aim: 1.8, moveAim: 0.25, head: 0.18, turn: 7.0,  strafe: 1.0,  dmg: 1.0,  fov: 1.15, hear: 32, burstOn: [0.8, 1.6],  burstOff: [0.2, 0.6], pool: ALL,                             wob: 0.9,  pMiss: 0.3, miss: [2.5, 6],   rec: 0.55 },
    insane: { name: '지옥',   react: 0.22, aim: 1.3, moveAim: 0.32,  head: 0.4,  turn: 14.0, strafe: 1.25, dmg: 1.1,  fov: 1.15, hear: 40, burstOn: [1.2, 2.4],  burstOff: [0.1, 0.3], pool: ALL,                             wob: 0.8,  pMiss: 0.38, miss: [2.5, 6],   rec: 0.5 },
  };
  Object.keys(DIFFS).forEach((k) => { DIFFS[k].key = k; });
  const NAMES = ['Viper', 'Ghost', 'Nova', 'Blaze', 'Echo', 'Rogue', 'Hawk', 'Frost', 'Zed', 'Pixel', 'Kuma', 'Rex', 'Luna', 'Orca', 'Jinx', 'Volt'];
  const PRIMARIES = ALL;

  // 난이도별 역할 비율 (돌격 / 우회 / 매복 / 순찰)
  const STYLE_W = {
    rookie: { rush: 0.4, flank: 0.1, hold: 0.1, roam: 0.4 },
    easy:   { rush: 0.4, flank: 0.15, hold: 0.1, roam: 0.35 },
    normal: { rush: 0.3, flank: 0.3, hold: 0.2, roam: 0.2 },
    hard:   { rush: 0.2, flank: 0.3, hold: 0.35, roam: 0.15 },
    insane: { rush: 0.2, flank: 0.3, hold: 0.35, roam: 0.15 },
  };
  // 라운드 시작 때 유틸리티(수류탄/섬광탄/연막탄)를 들고 나올 확률
  const UTIL_P = { rookie: 0, easy: 0.1, normal: 0.3, hard: 0.6, insane: 0.9 };
  // 학습으로 얼마나 강해질 수 있는지 (입문/쉬움은 학습 안 함)
  const LEARN_CAP = { normal: 0.35, hard: 0.7, insane: 1 };

  const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const feet = (e) => e.y - (e.eye || 1.7); // 눈 높이 → 발 높이
  // 적 위치 근처로 약간 흐트러뜨린 목적지. 위층(발 높이 0.5m 이상)은 흐트러뜨리면 허공/난간이 될 수 있어 정확히 그 자리로
  const jit = (e, r) => { const y = feet(e); return y > 0.5 ? { x: e.x, z: e.z, y } : { x: e.x + rnd(-r, r), z: e.z + rnd(-r, r), y }; };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const DEG = Math.PI / 180;
  function hash(i, s) { let h = (Math.imul(i, 374761393) + Math.imul(s, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

  // =====================================================================
  // 플레이어 기억 (브라우저에 저장). 어디에 자주 있는지(16x16 칸) / 어느 거리에서 싸우는지 / 몇 경기 했는지
  // =====================================================================
  const PKEY = 'rival_profile', GN = 16, GCELL = 4; // 격자 16x16, 한 칸 4m (맵 64m)
  const idOk = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{1,24}$/.test(s) && s !== '__proto__' && s !== 'constructor' && s !== 'prototype';
  function emptyProfile() { return { v: 1, matches: 0, lv: { normal: 0, hard: 0, insane: 0 }, shot: { n: 0, sum: 0 }, maps: Object.create(null) }; }
  function sanitizeProfile(raw) {
    const p = emptyProfile();
    if (!raw || typeof raw !== 'object') return p;
    const n = (v, a, b) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, a, b) : 0);
    p.matches = Math.floor(n(raw.matches, 0, 100000));
    if (raw.lv && typeof raw.lv === 'object') Object.keys(p.lv).forEach((k) => { p.lv[k] = n(raw.lv[k], 0, 1); });
    if (raw.shot && typeof raw.shot === 'object') { p.shot.n = Math.floor(n(raw.shot.n, 0, 1e6)); p.shot.sum = n(raw.shot.sum, 0, 1e9); }
    if (raw.maps && typeof raw.maps === 'object') {
      Object.keys(raw.maps).slice(0, 20).forEach((id) => {
        const h = raw.maps[id] && raw.maps[id].heat;
        if (!idOk(id) || !Array.isArray(h) || h.length !== GN * GN) return;
        p.maps[id] = { heat: h.map((v) => n(v, 0, 1)) };
      });
    }
    return p;
  }
  function loadProfile() { try { return sanitizeProfile(JSON.parse(localStorage.getItem(PKEY) || 'null')); } catch (e) { return emptyProfile(); } }
  let profile = loadProfile();
  function saveProfile() { try { localStorage.setItem(PKEY, JSON.stringify(profile)); } catch (e) {} }

  // 이번 경기에서 관찰한 것
  const sess = { heat: new Float32Array(GN * GN), total: 0, mapId: 'x', shotN: 0, shotSum: 0, adapt: 0, rounds: 0 };
  const gridIdx = (x, z) => clamp(Math.floor((z + 32) / GCELL), 0, GN - 1) * GN + clamp(Math.floor((x + 32) / GCELL), 0, GN - 1);

  // 학습 수준 0~1 (경기 누적 기억 + 이번 경기에서 플레이어가 라운드를 이기는 만큼 + 난이도 상한)
  function learnLevel(key) {
    const cap = LEARN_CAP[key]; if (!cap) return 0;
    return clamp((profile.lv[key] || 0) * 0.6 + sess.adapt, 0, 1) * cap;
  }
  const avgShotDist = () => {
    const n = profile.shot.n + sess.shotN; if (n < 12) return 0;
    return (profile.shot.sum + sess.shotSum) / n;
  };

  function create(G) {
    const phys = G.phys;
    const bots = [];
    const mapId = typeof G.mapId === 'function' ? G.mapId() : 'x';

    // ---------------- 길찾기용 격자 (층 구분) ----------------
    // 한 칸(1m)마다 "설 수 있는 높이"가 여러 개일 수 있음(바닥, 계단 위, 지붕, 컨테이너 위 ...). 길찾기는 (칸, 높이) 쌍을 점으로 삼음.
    // 이웃 칸으로는 0.55m 이하 턱은 걸어서 오르고(계단), 그보다 낮은 쪽(최대 4m)으로는 뛰어내림.
    const HALF = 32, N = 64, K = 5, STEP = 0.55, NAVR = 0.5; // NAVR: 길 칸이 비어 있어야 하는 반경(몸 반지름 0.4보다 조금 넉넉히)
    const solid = G.boxes;
    const obs = solid.filter((b) => b.minY < 1.8 && b.maxY > 0.3); // 지상에서 걸어서 못 지나가는 것들 (직선 이동 검사용)
    const nodeH = new Float32Array(N * N * K).fill(NaN); // 칸마다 설 수 있는 높이 (낮은 순)
    const nodeN = new Uint8Array(N * N);
    const walk = new Uint8Array(N * N);                  // 바닥(높이 0)에서 걸을 수 있는 칸 (2D 호환용)
    for (let iz = 0; iz < N; iz++) {
      for (let ix = 0; ix < N; ix++) {
        const cx = -HALF + ix + 0.5, cz = -HALF + iz + 0.5, ci = iz * N + ix;
        const cand = [0];
        for (let i = 0; i < solid.length; i++) {
          const b = solid[i];
          if (b.maxY > 0.05 && b.maxY < 9 && cx + 0.4 > b.minX && cx - 0.4 < b.maxX && cz + 0.4 > b.minZ && cz - 0.4 < b.maxZ) cand.push(b.maxY); // 몸(반지름 0.4)이 닿는 상자의 윗면. 계단 옆에 서면 몸이 높은 쪽 단 위로 올라서기 때문
        }
        cand.sort((a, b) => a - b);
        const hs = [];
        for (const h of cand) if (!hs.length || h - hs[hs.length - 1] > 0.06) hs.push(h);
        for (const h of hs) {
          if (nodeN[ci] >= K) break;
          let ok = true;
          for (let i = 0; i < solid.length; i++) { // 몸(반지름 0.55)이 들어갈 공간이 비어 있는가
            const b = solid[i];
            if (b.minY >= h + 1.9) continue; // 머리 위 천장은 상관없음
            if (b.maxY > h + 0.01 && cx + 0.4 > b.minX && cx - 0.4 < b.maxX && cz + 0.4 > b.minZ && cz - 0.4 < b.maxZ) { ok = false; break; } // 몸이 이 높이에 서면 다른 상자와 겹침 (실제 이동 규칙과 같음)
            if (b.maxY > h + 0.5 && cx + NAVR > b.minX && cx - NAVR < b.maxX && cz + NAVR > b.minZ && cz - NAVR < b.maxZ) { ok = false; break; } // 벽 옆은 조금 더 여유
          }
          if (ok) { nodeH[ci * K + nodeN[ci]] = h; nodeN[ci]++; }
        }
        if (nodeN[ci] && nodeH[ci * K] < 0.06) walk[ci] = 1;
      }
    }
    const cellOf = (x, z) => [clamp(Math.floor(x + HALF), 0, N - 1), clamp(Math.floor(z + HALF), 0, N - 1)];
    const cellCenter = (i) => [-HALF + (i % N) + 0.5, -HALF + ((i / N) | 0) + 0.5];
    // 높이 y 에 가장 가까운 점(칸*K+층). 가까운 칸부터 찾되 높이가 0.8m 안으로 맞는 점을 우선.
    function nearestNode(x, z, y) {
      const [cx, cz] = cellOf(x, z);
      let fb = -1, fbs = 1e9;
      for (let r = 0; r <= 8; r++) {
        let best = -1, bd = 1e9;
        for (let dz = -r; dz <= r; dz++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
            const ix = cx + dx, iz = cz + dz;
            if (ix < 0 || iz < 0 || ix >= N || iz >= N) continue;
            const ci = iz * N + ix;
            for (let k = 0; k < nodeN[ci]; k++) {
              const dh = Math.abs(nodeH[ci * K + k] - y);
              if (dh <= 0.8 && dh < bd) { bd = dh; best = ci * K + k; }
              const sc = r * 3 + dh;
              if (sc < fbs) { fbs = sc; fb = ci * K + k; }
            }
          }
        }
        if (best >= 0) return best;
      }
      return fb;
    }
    function nearestWalkable(x, z) { // 바닥 칸(2D)
      const n = nearestNode(x, z, 0);
      return n < 0 ? -1 : (n / K) | 0;
    }

    // 선분(a→b)이 장애물에 걸리는지. 장애물을 0.45m 부풀려서 검사(몸 두께 고려). 바닥 높이에서만 씀
    function segBlocked(ax, az, bx, bz) {
      const dx = bx - ax, dz = bz - az;
      for (let i = 0; i < obs.length; i++) {
        const b = obs[i];
        const minX = b.minX - 0.45, maxX = b.maxX + 0.45, minZ = b.minZ - 0.45, maxZ = b.maxZ + 0.45;
        let t0 = 0, t1 = 1, hit = true;
        if (Math.abs(dx) < 1e-9) { if (ax < minX || ax > maxX) hit = false; }
        else {
          let a = (minX - ax) / dx, c = (maxX - ax) / dx;
          if (a > c) { const s = a; a = c; c = s; }
          t0 = Math.max(t0, a); t1 = Math.min(t1, c); if (t0 > t1) hit = false;
        }
        if (hit) {
          if (Math.abs(dz) < 1e-9) { if (az < minZ || az > maxZ) hit = false; }
          else {
            let a = (minZ - az) / dz, c = (maxZ - az) / dz;
            if (a > c) { const s = a; a = c; c = s; }
            t0 = Math.max(t0, a); t1 = Math.min(t1, c); if (t0 > t1) hit = false;
          }
        }
        if (hit) return true;
      }
      return false;
    }

    const NN = N * N * K;
    // 오르막 이웃(계단 한 칸 등)이 정말 걸어서 올라가지는지 실제 이동 규칙(phys.tryMove)으로 시험해 봄. 옆에서 비스듬히 계단에 붙으면 두 단이 한꺼번에 닿아 막히는 경우가 있음.
    const climbCache = new Map();
    function climbOk(a, bn) {
      const key = a * NN + bn;
      let v = climbCache.get(key);
      if (v !== undefined) return v;
      const ac = (a / K) | 0, bc = (bn / K) | 0, ax = cellCenter(ac), bx = cellCenter(bc);
      const e = { x: ax[0], z: ax[1], y: nodeH[a] + 1.7, vy: 0, onGround: true };
      const dx = bx[0] - ax[0], dz = bx[1] - ax[1], steps = 10;
      for (let i = 1; i <= steps; i++) phys.tryMove(e, ax[0] + dx * i / steps, ax[1] + dz * i / steps);
      v = Math.hypot(e.x - bx[0], e.z - bx[1]) < 0.15 && Math.abs(e.y - 1.7 - nodeH[bn]) < 0.2;
      climbCache.set(key, v);
      return v;
    }
    const gScore = new Float32Array(NN), parent = new Int32Array(NN), closed = new Uint8Array(NN);
    const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];

    // 팀별 "지나간 길" 기록: 많이 지나간 칸은 다음 길찾기에서 비싸게 쳐서 다른 길로 돌아가게 함 (라운드가 지나면 절반씩 옅어짐)
    const traffic = { A: new Float32Array(N * N), B: new Float32Array(N * N) };
    const teamIntel = { A: null, B: null }; // 팀이 마지막으로 적을 본 곳 (무전)

    // opt: { seed, noise, team, sy(내 발 높이), ty(목적지 발 높이) } — 봇마다 다른 길 비용을 줘서 같은 곳에서 출발해도 다른 길을 고르게 함
    // 결과: [[x, z, 높이], ...]
    function findPath(sx, sz, tx, tz, opt) {
      const s = nearestNode(sx, sz, opt && opt.sy || 0), g = nearestNode(tx, tz, opt && opt.ty || 0);
      if (s < 0 || g < 0) return null;
      gScore.fill(1e9); closed.fill(0); parent.fill(-1);
      const gc = (g / K) | 0, gx = gc % N, gz = (gc / N) | 0;
      const seed = opt ? opt.seed | 0 : 0, noise = opt ? opt.noise || 0 : 0;
      const tr = opt && opt.team ? traffic[opt.team] : null;
      const h = (i) => { const c = (i / K) | 0, dx = Math.abs((c % N) - gx), dz = Math.abs(((c / N) | 0) - gz); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
      const open = [[h(s), s]]; // [f, 점번호] 최소 힙
      gScore[s] = 0;
      const push = (item) => { open.push(item); let i = open.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (open[p][0] <= open[i][0]) break; [open[p], open[i]] = [open[i], open[p]]; i = p; } };
      const pop = () => {
        const top = open[0], last = open.pop();
        if (open.length) { open[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, m = i; if (l < open.length && open[l][0] < open[m][0]) m = l; if (r < open.length && open[r][0] < open[m][0]) m = r; if (m === i) break; [open[m], open[i]] = [open[i], open[m]]; i = m; } }
        return top;
      };
      // 점 n 에서 이웃 칸 nc 로 가는 점들 (걸어서 오르내림 / 뛰어내림)
      const hasStep = (hA, nc) => { for (let k = 0; k < nodeN[nc]; k++) { const d = nodeH[nc * K + k] - hA; if (d <= 0.9 && d >= -4) return true; } return false; };
      let found = false;
      while (open.length) {
        const cur = pop()[1];
        if (closed[cur]) continue;
        closed[cur] = 1;
        if (cur === g) { found = true; break; }
        const cc = (cur / K) | 0, cx = cc % N, cz = (cc / N) | 0, hA = nodeH[cur];
        for (const [dx, dz, cost] of DIRS) {
          const nx = cx + dx, nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
          const nc = nz * N + nx;
          if (!nodeN[nc]) continue;
          if (dx && dz && (!hasStep(hA, cz * N + nx) || !hasStep(hA, nz * N + cx))) continue; // 모서리 파고들기 금지
          for (let k = 0; k < nodeN[nc]; k++) {
            const ni = nc * K + k, dh = nodeH[ni] - hA;
            if (closed[ni] || dh > 0.9 || dh < -4) continue; // 오르막은 0.9m까지 후보 (1m 칸 하나 사이에 계단이 두 단일 수 있음) → 아래 climbOk 로 실제로 걸어 올라가는지 확인
            if (dh > 0.1 && !climbOk(cur, ni)) continue;
            let c = cost + (dh < -STEP ? -dh * 1.2 : 0); // 뛰어내리는 건 조금 비싸게
            if (noise) c *= 1 + noise * hash(nc, seed);
            if (tr) c *= 1 + Math.min(2.5, tr[nc] * 2.5);
            const ng = gScore[cur] + c;
            if (ng < gScore[ni]) { gScore[ni] = ng; parent[ni] = cur; push([ng + h(ni), ni]); }
          }
        }
      }
      if (!found) return null;
      const cells = [];
      for (let i = g; i !== -1; i = parent[i]) cells.push(i);
      cells.reverse();
      const pts = [[sx, sz, nodeH[s]]].concat(cells.map((i) => { const c = cellCenter((i / K) | 0); return [c[0], c[1], nodeH[i]]; }));
      // 바닥에서 직선으로 갈 수 있는 구간은 건너뛰어 부드럽게 (높이가 다른 구간은 그대로 둠)
      const out = [];
      let i = 0;
      while (i < pts.length - 1) {
        let j = pts.length - 1;
        while (j > i + 1 && (pts[i][2] > 0.06 || pts[j][2] > 0.06 || segBlocked(pts[i][0], pts[i][1], pts[j][0], pts[j][1]) || pts.slice(i, j + 1).some((p) => p[2] > 0.06))) j--;
        out.push(pts[j]);
        i = j;
      }
      return out;
    }

    // 가장 큰 이어진 지역(다른 곳과 길이 이어진 칸들). 막힌 틈새 칸은 목적지/매복 후보에서 뺌
    const reach = new Uint8Array(N * N);
    (function labelMain() {
      const lab = new Int32Array(N * N).fill(-1); let best = -1, bestN = 0, id = 0;
      for (let s0 = 0; s0 < N * N; s0++) {
        if (!walk[s0] || lab[s0] >= 0) continue;
        const q = [s0]; lab[s0] = id; let n = 0;
        while (q.length) {
          const c = q.pop(); n++;
          const cx = c % N, cz = (c / N) | 0;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx, nz = cz + dz;
            if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
            const ni = nz * N + nx;
            if (walk[ni] && lab[ni] < 0) { lab[ni] = id; q.push(ni); }
          }
        }
        if (n > bestN) { bestN = n; best = id; }
        id++;
      }
      for (let i = 0; i < N * N; i++) if (lab[i] === best) reach[i] = 1;
    })();

    // ---------------- 매복 자리 후보: 시야가 트이면서 근처에 엄폐물이 있는 곳 ----------------
    const hotspots = [];
    (function buildHotspots() {
      const cells = [];
      for (let i = 0; i < N * N; i++) if (reach[i]) cells.push(i);
      if (!cells.length) return;
      const scored = [];
      for (let k = 0; k < 260; k++) {
        const i = cells[Math.floor(Math.random() * cells.length)], c = cellCenter(i);
        let clear = 0, near = 0;
        for (let d = 0; d < 12; d++) {
          const a = d * Math.PI / 6, dx = Math.cos(a), dz = Math.sin(a);
          const t = phys.rayBoxes(c[0], 1.4, c[1], dx, 0, dz, 18);
          if (t >= 17.9) clear++; else if (t < 2.2) near++;
        }
        if (clear < 3 || near < 2) continue;
        scored.push({ x: c[0], z: c[1], s: clear + near * 1.5 + Math.random() * 2 });
      }
      scored.sort((a, b) => b.s - a.s);
      for (const sp of scored) {
        if (hotspots.length >= 28) break;
        if (hotspots.every((h) => Math.hypot(h.x - sp.x, h.z - sp.z) > 6)) hotspots.push(sp);
      }
    })();

    // ---------------- 플레이어 기억을 합친 "자주 있는 곳" 지도 ----------------
    let heatMix = null; // 합쳐서 합이 1인 256칸. 없으면 null
    function buildHeatMix() {
      heatMix = null;
      const old = profile.maps[mapId], out = new Float32Array(GN * GN);
      let sum = 0;
      if (old) for (let i = 0; i < out.length; i++) { out[i] += old.heat[i] * 0.5; sum += old.heat[i] * 0.5; }
      if (sess.total > 6) for (let i = 0; i < out.length; i++) { const v = sess.heat[i] / sess.total * 0.5; out[i] += v; sum += v; }
      if (sum < 0.2) return;
      for (let i = 0; i < out.length; i++) out[i] /= sum;
      heatMix = out;
    }
    function sampleHeat() {
      if (!heatMix) return null;
      let tot = 0; const wts = new Float32Array(heatMix.length);
      for (let i = 0; i < wts.length; i++) { wts[i] = Math.pow(heatMix[i], 1.4); tot += wts[i]; }
      if (tot <= 0) return null;
      let r = Math.random() * tot;
      for (let i = 0; i < wts.length; i++) {
        r -= wts[i];
        if (r <= 0) return { x: -32 + (i % GN) * GCELL + rnd(0, GCELL), z: -32 + Math.floor(i / GN) * GCELL + rnd(0, GCELL) };
      }
      return null;
    }
    function heatNear(x, z) {
      if (!heatMix) return 0;
      const gx = clamp(Math.floor((x + 32) / GCELL), 0, GN - 1), gz = clamp(Math.floor((z + 32) / GCELL), 0, GN - 1);
      let s = 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const ix = gx + dx, iz = gz + dz; if (ix >= 0 && iz >= 0 && ix < GN && iz < GN) s += heatMix[iz * GN + ix]; }
      return s;
    }

    // ---------------- 봇 생성/제거 ----------------
    let laneSeq = { A: shuffle([-1, 0, 1]), B: shuffle([-1, 0, 1]) }, laneN = { A: 0, B: 0 };
    function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
    function pickStyle(key) {
      const w = STYLE_W[key] || STYLE_W.normal; let r = Math.random();
      for (const k of Object.keys(w)) { r -= w[k]; if (r <= 0) return k; }
      return 'rush';
    }

    // 학습 수준을 반영한 이번 라운드용 난이도 값 (원본 DIFFS는 건드리지 않음)
    function effDiff(D, L) {
      if (!L) return D;
      const e = Object.assign({}, D);
      e.react = D.react * (1 - 0.4 * L);
      e.aim = D.aim * (1 - 0.35 * L);
      e.head = Math.min(0.5, D.head + 0.1 * L);
      e.turn = D.turn * (1 + 0.4 * L);
      e.hear = D.hear + 8 * L;
      e.pMiss = D.pMiss * (1 - 0.2 * L);
      e.wob = D.wob * (1 - 0.25 * L);
      return e;
    }

    function spawn(opts) { // opts: { team, name, diff, x, z, yaw, primary }
      const D0 = DIFFS[opts.diff] || DIFFS.normal;
      const L = !opts.dummy && !opts.remote && !opts.noLearn && opts.team === 'B' ? learnLevel(D0.key) : 0; // 학습은 적(B팀)만 (친선전투/원격 캐릭터는 제외)
      const pid = opts.primary || D0.pool[Math.floor(Math.random() * D0.pool.length)];
      const m = RivalModels.humanoid(opts.team, pid, opts.name);
      m.tag.visible = opts.team === 'A' && !opts.dummy; // 이름표는 아군만(과녁 제외)
      const sd = Math.floor(Math.random() * 1e9);
      const b = {
        isBot: !opts.human, id: opts.netId || 'bot' + Math.random().toString(36).slice(2, 7), name: opts.name, team: opts.team,
        remote: !!opts.remote, human: !!opts.human, persist: !!opts.persist, tx: opts.x, ty: 1.7, tz: opts.z, tyaw: opts.yaw, tpitch: 0, eye: 1.7, // remote: 친선전투에서 다른 기기가 조종하는 캐릭터(사람 또는 방장의 봇)
        x: opts.x, z: opts.z, y: 1.7, vy: 0, onGround: true, yaw: opts.yaw, pitch: 0,
        hp: 100, alive: true, firedT: 0, kills: 0, deaths: 0,
        diff: effDiff(D0, L), L, bursting: false, burstT: 0.2, tgtPrev: null, tgtSpeed: 0, hadSight: false,
        gun: W.create(pid), pistol: W.create('pistol'),
        mesh: m, target: null, targetVisible: false, lastSeen: null, lastSeenT: -99, reactT: 0.5, aimHead: false,
        percT: Math.random() * 0.12, strafeDir: 0, strafeT: 0, path: null, pathT: 0, goal: null,
        stuckT: 0, stuckN: 0, lastPX: opts.x, lastPZ: opts.z, stuckCheckT: 0.5, walkPhase: 0, moving: false, flash: 0, deadT: 0, blindT: 0, muzzleT: 0,
        dummy: !!opts.dummy, track: opts.track || null, trackT: 0, homeX: opts.x,
        // v2: 역할/경로/흔들림/미스
        seed: sd, style: pickStyle(D0.key), lane: opts.dummy ? 0 : laneSeq[opts.team][laneN[opts.team]++ % 3], route: [], holding: false, holdT: 0, holdDir: 0, holdSpot: null,
        age: 0, planT: -99, pauseT: opts.dummy ? 0 : rnd(0, 0.6), nextPause: rnd(5, 11), spdK: rnd(0.92, 1.08),
        wobA: Math.random() * 6.28, wobB: Math.random() * 6.28, wobPh: Math.random() * 20,
        util: !opts.dummy && Math.random() < (UTIL_P[D0.key] || 0) ? ['frag', 'flash', 'flash', 'smoke'][Math.floor(Math.random() * 4)] : null, spinT: 0, spinDir: 1, miss: null, recoil: 0, flinchT: 0, hurtFrom: null, scanPh: Math.random() * 6.28,
      };
      m.root.position.set(b.x, 0, b.z);
      m.root.rotation.y = b.yaw;
      G.scene.add(m.root);
      bots.push(b);
      if (G.touch) G.touch(); // 목록 캐시 갱신
      return b;
    }

    // 라운드마다 봇을 지울 때 전용 재질/이름표 텍스처를 반납(공유 조각은 그대로 둠)
    function dispose(b) {
      G.scene.remove(b.mesh.root);
      b.mesh.torso.material.dispose();
      b.mesh.tag.material.map.dispose(); b.mesh.tag.material.dispose();
      (b.mesh.geos || []).forEach((g) => g.dispose()); // 합쳐 만든 전용 지오메트리 반납
    }
    function clear(all) {
      if (G.touch) G.touch(); // 기본: 라운드용 봇만 지움. 친선전투의 상대 사람(persist)은 라운드가 바뀌어도 남김. all=true 면 전부.
      for (let i = bots.length - 1; i >= 0; i--) { if (all || !bots[i].persist) { dispose(bots[i]); bots.splice(i, 1); } }
      // 지나간 길 기록은 절반 가까이 옅게 남겨서 "지난 라운드와 다른 길"을 고르게 함
      for (const t of ['A', 'B']) { const a = traffic[t]; for (let i = 0; i < a.length; i++) a[i] *= 0.45; teamIntel[t] = null; laneSeq[t] = shuffle([-1, 0, 1]); laneN[t] = 0; }
      buildHeatMix();
    }

    // ---------------- 인지: 가장 가까운 "보이는" 적 찾기 ----------------
    function perceive(b, now) {
      if (b.blindT > 0) { b.targetVisible = false; return; } // 섬광탄에 눈이 멂
      const enemies = G.enemiesOf(b.team);
      let best = null, bd = 1e9;
      for (const e of enemies) {
        if (!e.alive) continue;
        const dx = e.x - b.x, dz = e.z - b.z, dy = (e.y - 0.5) - b.y;
        const dist = Math.hypot(dx, dy, dz);
        if (dist > 75 || dist >= bd) continue;
        const ang = angDiff(b.yaw, Math.atan2(-dx, -dz));
        const heard = e.firedT > 0 && dist < b.diff.hear; // 총소리가 들리면 방향을 알아챔 (난이도마다 거리 다름)
        if (Math.abs(ang) > b.diff.fov && dist > 5 && !heard) continue; // 시야각 (난이도마다 다름)
        const t = phys.rayBoxes(b.x, b.y, b.z, dx / dist, dy / dist, dz / dist, dist);
        if (t < dist - 0.6) continue; // 중간에 벽이 있음
        if (G.smoked(b.x, b.y, b.z, e.x, e.y - 0.5, e.z)) continue; // 연막 속
        best = e; bd = dist;
      }
      if (best) {
        // 목표가 얼마나 빨리 움직이는지(움직이는 적은 맞히기 어렵게 오차에 반영)
        if (b.tgtPrev && b.tgtPrev.id === best.id && now - b.tgtPrev.t > 0.05) {
          const sp = Math.hypot(best.x - b.tgtPrev.x, best.z - b.tgtPrev.z) / (now - b.tgtPrev.t);
          b.tgtSpeed = b.tgtSpeed * 0.6 + Math.min(sp, 9) * 0.4;
        }
        b.tgtPrev = { id: best.id, x: best.x, z: best.z, t: now };
        if (b.target !== best) {
          b.target = best; b.reactT = b.diff.react * (0.8 + Math.random() * 0.4) * (b.holding ? 0.75 : 1); b.aimHead = Math.random() < b.diff.head;
          b.miss = null; b.bursting = false; b.burstT = 0.05;
        } else if (!b.hadSight) b.reactT = Math.max(b.reactT, b.diff.react * 0.5); // 숨었다가 다시 나타난 적에게도 반응 시간이 필요
        b.targetVisible = true; b.hadSight = true;
        b.lastSeen = { x: best.x, z: best.z, y: feet(best) };
        b.lastSeenT = now;
        teamIntel[b.team] = { x: best.x, z: best.z, y: feet(best), t: now };
      } else {
        b.targetVisible = false; b.hadSight = false; b.tgtSpeed = 0;
        if (b.target && now - b.lastSeenT > 3.5) b.target = null;
      }
    }

    // ---------------- 경로 계획: 역할에 따라 서로 다른 목적지/우회점 ----------------
    const aliveEnemies = (b) => G.enemiesOf(b.team).filter((e) => e.alive);
    // 적이 있을 법한 곳. 학습한 봇은 플레이어가 자주 있던 곳을 노림. 아니면 아무 적 근처(가장 가까운 적만 쫓지 않음)
    function enemyGuess(b) {
      // 가까이(22m 안) 있는 적은 발소리로 위치를 알아챔: 집 안이든 어디든 그 자리로 곧장 찾아감
      let near = null, nd = 22;
      for (const e of aliveEnemies(b)) { const d = Math.hypot(e.x - b.x, e.z - b.z); if (d < nd) { nd = d; near = e; } }
      if (near) return jit(near, 1.2);
      if (b.L > 0.05 && Math.random() < 0.15 + 0.7 * b.L) { const h = sampleHeat(); if (h) return h; }
      const en = aliveEnemies(b);
      if (!en.length) return null;
      const e = en[Math.floor(Math.random() * en.length)];
      return { x: e.x + rnd(-8, 8), z: e.z + rnd(-8, 8), y: feet(e) };
    }
    // 출발점→목표 선분 옆으로 비껴난 우회점 (레인마다 다른 쪽, 간격도 다르게)
    function viaPoint(b, g, side) {
      const dx = g.x - b.x, dz = g.z - b.z, d = Math.hypot(dx, dz) || 1;
      const px = -dz / d, pz = dx / d, off = (side || 1) * rnd(7, 14), t = rnd(0.35, 0.65);
      const v = { x: b.x + dx * t + px * off, z: b.z + dz * t + pz * off };
      const c = nearestWalkable(v.x, v.z); if (c < 0) return null;
      const cc = cellCenter(c); return { x: cc[0], z: cc[1] };
    }
    function chooseHold(b, guess) {
      if (!hotspots.length) return null;
      const taken = bots.filter((o) => o !== b && o.alive && o.holdSpot).map((o) => o.holdSpot);
      let tot = 0; const wts = hotspots.map((h) => {
        const d = Math.hypot(h.x - b.x, h.z - b.z);
        let w = d < 6 || d > 45 ? 0.05 : 1;
        if (taken.some((t) => Math.hypot(t.x - h.x, t.z - h.z) < 8)) w *= 0.1;
        if (guess) { const dg = Math.hypot(h.x - guess.x, h.z - guess.z); if (dg < 10) w *= 0.3; } // 적 바로 옆은 피함
        w *= 1 + 8 * heatNear(h.x, h.z) * b.L * 2; // 학습한 봇은 플레이어가 자주 지나는 곳이 보이는 자리를 선호
        tot += w; return w;
      });
      let r = Math.random() * tot;
      for (let i = 0; i < hotspots.length; i++) { r -= wts[i]; if (r <= 0) return hotspots[i]; }
      return hotspots[0];
    }

    function planRoute(b, now) {
      b.planT = now; b.route = []; b.path = null; b.pathT = 0; b.holding = false;
      const intel = teamIntel[b.team], fresh = intel && now - intel.t < 9;
      if (b.lastSeen && now - b.lastSeenT < 6) { // 방금 본 곳 (쫓아가기). 레인마다 살짝 다른 지점으로
        const hi = (b.lastSeen.y || 0) > 0.5, g = { x: b.lastSeen.x + (hi ? 0 : rnd(-2.5, 2.5)), z: b.lastSeen.z + (hi ? 0 : rnd(-2.5, 2.5)), y: b.lastSeen.y || 0, chase: true };
        const v = b.age > 8 && b.lane ? viaPoint(b, g, b.lane) : null;
        if (v && Math.random() < 0.5) b.route.push(v);
        b.route.push(g); return;
      }
      b.lastSeen = null;
      let style = b.style;
      if (style === 'hold' && b.age > 45) style = 'rush'; // 너무 오래 숨어 있으면 움직임
      { // 가까이 있는 적이 있으면 무전보다 그쪽이 먼저 (발소리). 매복 중인 봇은 14m 안일 때만
        const R = style === 'hold' ? 14 : 22;
        const ne = aliveEnemies(b).filter((e) => Math.hypot(e.x - b.x, e.z - b.z) < R).sort((p, q) => Math.hypot(p.x - b.x, p.z - b.z) - Math.hypot(q.x - b.x, q.z - b.z))[0];
        if (ne) { b.route.push(jit(ne, 1.2)); return; }
      }
      if (fresh && style !== 'hold') { // 무전으로 들은 곳으로 가되, 레인별로 다른 방향에서 접근
        const hiI = (intel.y || 0) > 0.5, g = { x: intel.x + (hiI ? 0 : rnd(-4, 4)), z: intel.z + (hiI ? 0 : rnd(-4, 4)), y: intel.y || 0 };
        const v = b.lane || Math.random() < 0.5 ? viaPoint(b, g, b.lane || (Math.random() < 0.5 ? 1 : -1)) : null;
        if (v) b.route.push(v);
        b.route.push(g); return;
      }
      const guess = enemyGuess(b);
      if (!guess) { b.route.push({ x: rnd(-20, 20), z: rnd(-20, 20) }); return; }
      if (style === 'hold') {
        const sp = chooseHold(b, guess);
        if (sp) { b.holdSpot = sp; b.holdDir = Math.atan2(-(guess.x - sp.x), -(guess.z - sp.z)); b.route.push({ x: sp.x, z: sp.z, hold: true }); return; }
        style = 'rush';
      }
      if (style === 'flank') {
        const v = viaPoint(b, guess, b.lane || (Math.random() < 0.5 ? 1 : -1));
        const v2 = v ? viaPoint({ x: v.x, z: v.z }, guess, b.lane || 1) : null;
        if (v) b.route.push(v);
        if (v2 && Math.random() < 0.5) b.route.push(v2);
        b.route.push(guess); return;
      }
      if (style === 'roam') { // 맵 이곳저곳을 돌아다니다가 적 쪽으로
        const cells = []; for (let k = 0; k < 6; k++) { const i = Math.floor(Math.random() * N * N); if (reach[i]) cells.push(i); }
        if (cells.length) { const c = cellCenter(cells[0]); b.route.push({ x: c[0], z: c[1] }); }
        b.route.push(guess); return;
      }
      // rush: 곧장. 대신 가끔 한 번 꺾어서
      if (Math.random() < 0.4) { const v = viaPoint(b, guess, Math.random() < 0.5 ? 1 : -1); if (v) b.route.push(v); }
      b.route.push(guess);
    }

    function preferredDist(b, w) {
      let d;
      if (w.melee) return 1.5;
      if (w.scope) d = 34;
      else if (w.pellets) d = 7;
      else if (w.range[0] < 25) d = 11;
      else d = 20;
      if (b.L > 0.15) { const s = avgShotDist(); if (s) { if (s < 9) d += 7 * b.L; else if (s > 26) d -= 6 * b.L; } } // 플레이어가 잘하는 거리를 피함
      return d;
    }

    function turnToward(b, wantYaw, wantPitch, dt) {
      const maxTurn = b.diff.turn * dt;
      b.yaw += clamp(angDiff(b.yaw, wantYaw), -maxTurn, maxTurn);
      b.pitch += clamp(wantPitch - b.pitch, -maxTurn, maxTurn);
    }

    // ---------------- 봇 한 마리 한 프레임 ----------------
    function think(b, dt, now) {
      const D = b.diff, w = b.gun.w;
      b.age += dt;
      if (b.target && !b.target.alive) { b.target = null; b.targetVisible = false; }
      b.percT -= dt;
      if (b.percT <= 0) { b.percT = 0.12; perceive(b, now); }
      if (b.firedT > 0) b.firedT -= dt;
      if (b.blindT > 0) b.blindT -= dt;
      if (b.flinchT > 0) b.flinchT -= dt;
      if (b.recoil > 0) b.recoil = Math.max(0, b.recoil - 3 * dt);
      b.wobPh += dt;
      // 어디선가 맞았으면 쏜 쪽을 확인하러 감
      if (b.hurtFrom) {
        const a = b.hurtFrom; b.hurtFrom = null;
        if (a.alive && a.team !== b.team && !b.targetVisible) { b.lastSeen = { x: a.x, z: a.z, y: feet(a) }; b.lastSeenT = now; b.route = []; b.holding = false; b.path = null; b.pauseT = 0; }
      }

      let trigger = false, mx = 0, mz = 0, speed = 0;
      const sin = Math.sin(b.yaw), cos = Math.cos(b.yaw);
      const fwdX = -sin, fwdZ = -cos, rightX = cos, rightZ = -sin;

      if (b.target && b.targetVisible && b.target.alive) {
        const t = b.target;
        b.holding = false; b.pauseT = 0;
        const ty = t.y - (b.aimHead ? 0.1 : 0.55);
        const dx = t.x - b.x, dz = t.z - b.z, dy = ty - b.y, hd = Math.hypot(dx, dz), dist = Math.hypot(hd, dy);
        const wantYaw = Math.atan2(-dx, -dz), wantPitch = Math.atan2(dy, hd);
        turnToward(b, wantYaw, wantPitch, dt);
        b.reactT -= dt;
        const err = Math.abs(angDiff(b.yaw, wantYaw)) + Math.abs(wantPitch - b.pitch);
        if (b.reactT <= 0 && err < 0.07 && dist < w.range[1] * 0.9) {
          trigger = true;
          // 사람처럼 짧게 몰아 쏘고 쉬기를 반복(난이도가 낮을수록 쉬는 시간이 김)
          b.burstT -= dt;
          if (b.burstT <= 0) {
            b.bursting = !b.bursting;
            const r = b.bursting ? D.burstOn : D.burstOff; b.burstT = r[0] + Math.random() * (r[1] - r[0]);
            if (b.bursting) { // 새 연사를 시작할 때마다 "이번엔 빗나가는 연사"인지 정함: 처음엔 옆으로 어긋나다가 보정함
              const pm = clamp(D.pMiss + Math.min(0.2, b.tgtSpeed * 0.03) + (b.flinchT > 0 ? 0.2 : 0) + (w.pellets ? 0.2 : 0), 0, 0.9); // 샷건은 알갱이가 퍼져서 더 자주 빗나가게
              if (Math.random() < pm) {
                const a = rnd(D.miss[0], D.miss[1]), sgn = Math.random() < 0.5 ? -1 : 1, T = rnd(0.35, 0.8);
                b.miss = { y: sgn * a, p: rnd(-0.5, 0.5) * a, t: T, T };
              } else b.miss = null;
            }
          }
          if (!b.bursting) trigger = false;
        }

        // 거리 유지 + 좌우 이동(스트레이프). 매복 중이던 봇은 제자리에서 버팀
        const pref = preferredDist(b, w), stand = b.style === 'hold' && b.holdSpot && Math.hypot(b.x - b.holdSpot.x, b.z - b.holdSpot.z) < 4;
        const radial = stand ? 0 : hd > pref + 3 ? 1 : hd < pref - 3 ? -1 : 0;
        b.strafeT -= dt;
        if (b.strafeT <= 0) { b.strafeDir = [-1, 0, 1, 1, -1][Math.floor(Math.random() * 5)]; b.strafeT = 0.4 + Math.random() * 1.1; }
        const sk = D.strafe * (stand ? 0.45 : 1);
        mx = fwdX * radial + rightX * b.strafeDir * sk;
        mz = fwdZ * radial + rightZ * b.strafeDir * sk;
        speed = 3.4 * w.move * b.spdK;
        if (b.gun.reload) speed *= 0.7;
        b.path = null;
        // 체력이 낮으면 연막을 앞에 깔고 물러남 / 가까운 적에게 섬광탄 / 숨은 적 위치엔 수류탄
        if (b.util === 'smoke' && b.hp < 45 && hd > 6) throwUtil(b, 'smoke', b.x + (dx / hd) * 4, b.z + (dz / hd) * 4);
        else if (b.util === 'flash' && hd > 9 && hd < 22 && b.reactT > 0) throwUtil(b, 'flash', t.x, t.z);
      } else {
        // 이동(수색/순찰/매복)
        if (b.util && b.util !== 'smoke' && b.lastSeen && now - b.lastSeenT < 5 && now - b.lastSeenT > 0.8) {
          const ud = Math.hypot(b.lastSeen.x - b.x, b.lastSeen.z - b.z);
          if (ud > 8 && ud < 24) throwUtil(b, b.util, b.lastSeen.x, b.lastSeen.z);
        }
        if (b.spinT > 0) { // 목적지에 도착했는데 적이 안 보이면 제자리에서 한 바퀴 둘러봄
          b.spinT -= dt; b.yaw += b.spinDir * 4.2 * dt;
        } else if (b.pauseT > 0) { // 잠깐 멈춰서 주변을 살핌
          b.pauseT -= dt;
          turnToward(b, b.yaw + Math.sin(b.age * 1.6 + b.scanPh) * 0.5, 0, dt);
        } else if (b.holding) {
          b.holdT -= dt;
          if (b.age > 3 && aliveEnemies(b).some((e) => Math.hypot(e.x - b.x, e.z - b.z) < 14)) b.holdT = 0; // 바로 옆에 적이 있으면 매복을 풀고 찾으러 감
          turnToward(b, b.holdDir + Math.sin(b.age * 0.9 + b.scanPh) * 0.9, 0, dt); // 매복: 적이 올 방향을 좌우로 훑음
          if (b.holdT <= 0) { b.holding = false; b.style = Math.random() < 0.5 ? 'flank' : 'rush'; b.route = []; }
        } else {
          if (!b.route.length) planRoute(b, now);
          // 새로운 무전 정보가 오면 일부는 계획을 바꿈 (모두가 같은 곳으로 몰리지 않게 확률적으로)
          if (now - b.planT > 3 && b.style !== 'hold') { // 가까운 적이 있는데 엉뚱한 곳으로 가고 있으면 다시 계획
            const g0 = b.route[0], ne = aliveEnemies(b).find((e) => Math.hypot(e.x - b.x, e.z - b.z) < 22);
            if (ne && g0 && Math.hypot(g0.x - ne.x, g0.z - ne.z) > 12) planRoute(b, now);
          }
          const it = teamIntel[b.team];
          if (it && it.t > b.planT + 1 && now - b.planT > 2.5 && b.style !== 'hold' && Math.random() < dt * 0.6) planRoute(b, now);
          const g = b.route[0];
          if (g) {
            b.pathT -= dt;
            if (!b.path || b.pathT <= 0) {
              b.path = findPath(b.x, b.z, g.x, g.z, { seed: b.seed, noise: 0.5 + 0.4 * hash(b.seed, 7), team: b.team, sy: feet(b), ty: g.y || 0 });
              b.pathT = 1.5 + rnd(0, 0.7);
              if (!b.path) { b.route.shift(); b.path = null; b.pauseT = 0.3; } // 길이 없으면 잠깐 쉬었다가 다시 계획 (매 프레임 길찾기 방지)
            }
            if (b.path && b.path.length) {
              const p = b.path[0];
              const dx = p[0] - b.x, dz = p[1] - b.z, d = Math.hypot(dx, dz);
              const final = b.path.length === 1;
              const fy = feet(b), ph = p[2] || 0, stairs = ph > 0.06 || Math.abs(ph - fy) > 0.3 || (b.path[1] && Math.abs((b.path[1][2] || 0) - ph) > 0.3); // 계단/층 이동 구간은 지점을 정확히 밟아야 함 (옆으로 스치면 턱에 막힘)
              if (d < (stairs ? 0.6 : final && !b.route[1] ? 0.7 : 1.3) && Math.abs(fy - ph) < (stairs ? 0.6 : 1.0)) { // 같은 층일 때만 도착으로 침 (다리 밑을 지나가며 착각하지 않게)
                b.path.shift();
                if (!b.path.length) { // 이 지점에 도착
                  const done = b.route.shift(); b.path = null; b.pathT = 0;
                  if (done && done.chase) b.lastSeen = null;
                  if (done && done.hold) { b.holding = true; b.holdT = rnd(6, 14); }
                  else if (done && !b.route.length) { b.spinT = 1.5; b.spinDir = Math.random() < 0.5 ? -1 : 1; }
                }
              } else {
                mx = dx / d; mz = dz / d; speed = 4.6 * w.move * b.spdK;
                turnToward(b, Math.atan2(-dx, -dz), 0, dt);
              }
            } else if (b.path && !b.path.length) { b.route.shift(); b.path = null; }
          }
          b.nextPause -= dt;
          if (b.nextPause <= 0) { b.nextPause = rnd(6, 12); if (Math.random() < 0.5) b.pauseT = rnd(0.35, 0.9); }
        }
        if (b.gun.ammo < w.mag * 0.5) { b.stuckT = 0; W.reload(b.gun); } // 싸움이 없을 때 미리 장전
      }

      // 이동 적용 (같은 충돌 규칙)
      const len = Math.hypot(mx, mz);
      b.moving = len > 0.01 && speed > 0;
      if (b.moving) {
        const k = speed * dt / Math.max(1, len);
        phys.tryMove(b, b.x + mx * k, b.z);
        phys.tryMove(b, b.x, b.z + mz * k);
        const ci = cellOf(b.x, b.z); traffic[b.team][ci[1] * N + ci[0]] += dt;
      }
      phys.gravity(b, dt, false);

      // 끼임 감지 → 길을 새로 찾음 (계속 끼이면 계획 자체를 다시 세움)
      b.stuckCheckT -= dt;
      if (b.stuckCheckT <= 0) {
        b.stuckCheckT = 0.6;
        if (b.moving && Math.hypot(b.x - b.lastPX, b.z - b.lastPZ) < 0.25) {
          b.path = null; b.pathT = 0; b.stuckN++;
          if (b.stuckN >= 3) { b.route = []; b.stuckN = 0; }
        } else if (b.moving) b.stuckN = 0;
        b.lastPX = b.x; b.lastPZ = b.z;
      }

      // 탄이 없으면 재장전
      if (b.gun.ammo <= 0 && !b.gun.reload) W.reload(b.gun);

      // 발사
      const shots = W.update(b.gun, dt, trigger);
      if (shots > 0) {
        // 조준 흔들림 + (미스 연사일 때) 어긋난 각도 + 연사 반동 + 움찔
        let yaw = b.yaw, pitch = b.pitch;
        const wob = D.wob * DEG;
        yaw += (Math.sin(b.wobPh * 1.7 + b.wobA) + 0.5 * Math.sin(b.wobPh * 3.1 + b.wobB)) * wob;
        pitch += (Math.sin(b.wobPh * 2.1 + b.wobB) + 0.5 * Math.sin(b.wobPh * 3.7 + b.wobA)) * wob * 0.7;
        if (b.miss) {
          const k = Math.max(0, b.miss.t / b.miss.T); // 시간이 지날수록 보정해서 점점 맞아 들어감
          yaw += b.miss.y * k * DEG; pitch += b.miss.p * k * DEG;
          b.miss.t -= 0.12;
        }
        if (b.flinchT > 0) { yaw += rnd(-1, 1) * 3 * (b.flinchT / 0.5) * DEG; pitch += rnd(-1, 1) * 2 * (b.flinchT / 0.5) * DEG; }
        pitch += b.recoil * 0.5 * DEG;
        const dirX = -Math.sin(yaw) * Math.cos(pitch), dirY = Math.sin(pitch), dirZ = -Math.cos(yaw) * Math.cos(pitch);
        const base = w.scope ? w.spread[1] : (w.spread[0] + w.spread[1]) / 2;
        // 오차 = 기본 오차 + 상대가 움직이는 속도 + 내가 좌우로 움직이는 중이면 조금 더 + 연사 반동
        const aimErr = D.aim + b.tgtSpeed * D.moveAim + (b.strafeDir ? D.aim * 0.25 : 0) + b.recoil * D.rec * 0.5;
        b.recoil = Math.min(4, b.recoil + 0.45);
        G.shoot(b, b.x, b.y, b.z, dirX, dirY, dirZ, w, Math.hypot(base * 0.6, aimErr));
      }
    }

    // 유틸리티 던지기 (한 라운드에 한 번). 실제 던지기/폭발은 main.js 가 처리
    function throwUtil(b, type, tx, tz) {
      if (!G.throwUtil || !b.util || b.util !== type) return;
      b.util = null; b.pauseT = 0.45;
      G.throwUtil(b, type, tx, tz);
    }

    // 친선전투: 다른 기기가 보내온 위치로 부드럽게 따라감 (생각/이동은 그쪽 기기가 함)
    function stepRemote(b, dt) {
      const k = Math.min(1, dt * 14), ox = b.x, oz = b.z;
      b.x += (b.tx - b.x) * k; b.y += (b.ty - b.y) * k; b.z += (b.tz - b.z) * k;
      b.yaw += angDiff(b.yaw, b.tyaw) * k; b.pitch += (b.tpitch - b.pitch) * k;
      b.moving = Math.hypot(b.x - ox, b.z - oz) / Math.max(dt, 1e-4) > 0.6;
    }
    // 받은 상태를 반영. snap=true 면 순간이동(라운드 시작/부활)
    function setRemote(b, st, snap) {
      b.tx = st.x; b.ty = st.y; b.tz = st.z; b.tyaw = st.yaw; b.tpitch = st.pitch; b.eye = st.eye || 1.7;
      if (snap || Math.hypot(b.tx - b.x, b.tz - b.z) > 8) { b.x = b.tx; b.y = b.ty; b.z = b.tz; b.yaw = b.tyaw; b.pitch = b.tpitch; }
    }
    function revive(b) { b.alive = true; b.deadT = 0; b.hp = 100; b.mesh.root.rotation.x = 0; b.mesh.root.visible = true; b.mesh.tag.visible = b.team === 'A'; }

    // 팀 데스매치: 죽은 봇을 같은 자리에서 새로 살려냄
    function respawn(b, p) {
      b.alive = true; b.hp = 100; b.deadT = 0; b.x = p.x; b.z = p.z; b.y = 1.7; b.vy = 0; b.yaw = p.yaw; b.pitch = 0; b.onGround = true;
      b.mesh.root.rotation.x = 0; b.mesh.root.visible = true; b.mesh.tag.visible = b.team === 'A' && !b.dummy;
      b.target = null; b.targetVisible = false; b.lastSeen = null; b.route = []; b.path = null; b.holding = false; b.pauseT = 0.3;
      b.flinchT = 0; b.miss = null; b.recoil = 0; b.firedT = 0; b.blindT = 0; b.age = 0; b.hurtFrom = null; b.bursting = false;
      b.gun = W.create(b.gun.id);
    }

    // 사격장 과녁: 생각하지 않고 서 있거나 좌우로 왕복만 함 (항상 플레이어 쪽(+z)을 봄)
    function stepDummy(b, dt) {
      b.yaw = Math.PI;
      if (b.track) {
        const t = b.track;
        b.trackT += dt * t.speed / (t.x1 - t.x0);
        const ph = b.trackT % 2, tri = ph < 1 ? ph : 2 - ph;
        b.x = t.x0 + (t.x1 - t.x0) * tri;
        b.moving = true;
      } else b.moving = false;
    }

    // ---------------- 매 프레임 ----------------
    function update(dt, now, live) {
      for (const b of bots) {
        const m = b.mesh;
        if (!b.alive) { // 쓰러지는 연출
          b.deadT += dt; m.tag.visible = false; if (m.flash) m.flash.visible = false;
          if (b.dummy && b.deadT > 2.2) { b.alive = true; b.hp = 100; b.deadT = 0; m.root.rotation.x = 0; m.root.position.y = 0; continue; } // 과녁은 2초 뒤 다시 나옴
          m.root.rotation.x = Math.min(Math.PI / 2, b.deadT * 4);
          m.root.position.y = Math.min(0.15, b.deadT * 0.6); // 누운 몸이 바닥에 닿도록 살짝 띄움
          continue;
        }
        if (b.remote) stepRemote(b, dt); else if (b.dummy) stepDummy(b, dt); else if (live) think(b, dt, now); else { b.moving = false; phys.gravity(b, dt, false); }
        m.root.position.set(b.x, b.y - (b.eye || 1.7), b.z);
        m.root.rotation.y = b.yaw;
        if (b.moving) b.walkPhase += dt * 9;
        const sw = b.moving ? Math.sin(b.walkPhase) * 0.7 : 0;
        m.legs[0].rotation.x = sw; m.legs[1].rotation.x = -sw;
        if (m.flash) { if (b.muzzleT > 0) b.muzzleT -= dt; m.flash.visible = b.muzzleT > 0; }
        if (b.flash > 0) { b.flash -= dt; m.torso.material.emissive.setHex(b.flash > 0 ? 0xaa1111 : 0x000000); }
      }
    }

    // ---------------- 플레이어 관찰 / 학습 (main.js 가 호출) ----------------
    function beginMatch() { // 새 경기 시작: 이번 경기 관찰 기록 초기화
      sess.heat.fill(0); sess.total = 0; sess.mapId = mapId; sess.shotN = 0; sess.shotSum = 0; sess.adapt = 0; sess.rounds = 0;
      buildHeatMix();
    }
    function observePlayer(dt, P) { if (P && P.alive) { sess.heat[gridIdx(P.x, P.z)] += dt; sess.total += dt; } }
    function observeShot(dist) { if (Number.isFinite(dist) && dist > 0 && dist < 120) { sess.shotN++; sess.shotSum += dist; } }
    function roundEnd(playerWon) { // 라운드가 끝날 때마다 AI가 더 배움 (플레이어가 이기면 더 많이)
      sess.rounds++;
      sess.adapt = clamp(sess.adapt + (playerWon === true ? 0.14 : 0.03), 0, 0.6); // 학습은 줄어들지 않고 계속 쌓임 (이기면 많이, 져도 조금 더 관찰)
      buildHeatMix();
    }
    function endMatch(playerWon, diffKey) { // 경기 끝: 기억을 저장
      if (sess.total > 20) {
        const old = profile.maps[mapId], nw = new Array(GN * GN);
        const norm = sess.heat.reduce((s, v) => s + v, 0) || 1;
        for (let i = 0; i < nw.length; i++) { const nv = sess.heat[i] / norm; nw[i] = Math.round((old ? old.heat[i] * 0.65 + nv * 0.35 : nv) * 10000) / 10000; }
        profile.maps[mapId] = { heat: nw };
      }
      profile.matches++;
      profile.shot.n += sess.shotN; profile.shot.sum += sess.shotSum;
      if (profile.shot.n > 4000) { profile.shot.sum *= 0.5; profile.shot.n = Math.floor(profile.shot.n * 0.5); }
      if (LEARN_CAP[diffKey]) profile.lv[diffKey] = clamp((profile.lv[diffKey] || 0) + (playerWon ? 0.12 : 0.04), 0, 1);
      saveProfile();
    }
    function learnInfo(diffKey) { return { L: learnLevel(diffKey), cap: LEARN_CAP[diffKey] || 0, matches: profile.matches }; }

    return { bots, spawn, clear, update, setRemote, revive, respawn, DIFFS, NAMES, PRIMARIES, nav: { walk, findPath, nodeH, nodeN, K }, beginMatch, observePlayer, observeShot, roundEnd, endMatch, learnInfo, _hot: hotspots, _traffic: traffic };
  }

  // 기억 보기/지우기 (로비 화면용)
  function memory() {
    const maps = Object.keys(profile.maps).length;
    return { matches: profile.matches, lv: Object.assign({}, profile.lv), maps, shotDist: profile.shot.n >= 12 ? Math.round(profile.shot.sum / profile.shot.n) : 0 };
  }
  function resetMemory() { profile = emptyProfile(); sess.adapt = 0; sess.heat.fill(0); sess.total = 0; saveProfile(); }

  window.RivalBots = { create, DIFFS, NAMES, memory, resetMemory, sanitizeProfile, LEARN_CAP };
})();
