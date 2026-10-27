// MyRivals 상점: 코인 지갑 + 무기 스킨/조준점 색 + 상점 화면(3D 미리보기)
// 코인과 보유 목록은 이 브라우저(localStorage)에만 저장돼요. 서버/리더보드와는 상관없는 꾸미기 전용이에요.
(function () {
  const $ = (id) => document.getElementById(id);

  // ---- 판매 목록 ----  main/sub: 총 몸체/보조 부분 색, glow: 빛남, rainbow: 색이 계속 변함
  const SKINS = [
    { kind: 'skin', id: 'classic', name: '기본',   price: 0,   main: null },
    { kind: 'skin', id: 'camo',    name: '위장',   price: 120, main: 0x55683f, sub: 0x3a4a2a },
    { kind: 'skin', id: 'pink',    name: '핑크',   price: 120, main: 0xff80c8, sub: 0xc2468f },
    { kind: 'skin', id: 'ice',     name: '아이스', price: 200, main: 0x7fd0ff, sub: 0x3a86c4 },
    { kind: 'skin', id: 'ruby',    name: '루비',   price: 200, main: 0xe0243d, sub: 0x80101f },
    { kind: 'skin', id: 'neon',    name: '네온 (빛남)', price: 300, main: 0x39ff88, sub: 0x12a85a, glow: true },
    { kind: 'skin', id: 'gold',    name: '황금',   price: 450, main: 0xffd24a, sub: 0xc99a1e },
    { kind: 'skin', id: 'snow',    name: '눈꽃',   price: 120, main: 0xf2f6fb, sub: 0xb8c4d4 },
    { kind: 'skin', id: 'mint',    name: '민트',   price: 150, main: 0x6fe0c0, sub: 0x2f9c84 },
    { kind: 'skin', id: 'carbon',  name: '카본',   price: 180, main: 0x2b2f36, sub: 0x14161a },
    { kind: 'skin', id: 'ocean',   name: '바다',   price: 200, main: 0x1f6fb8, sub: 0x0d3a66 },
    { kind: 'skin', id: 'sunset',  name: '노을',   price: 250, main: 0xff8a4d, sub: 0xb83a6a },
    { kind: 'skin', id: 'toxic',   name: '독 (빛남)', price: 330, main: 0xa6ff2e, sub: 0x4f9a10, glow: true },
    { kind: 'skin', id: 'lava',    name: '용암 (빛남)', price: 380, main: 0xff5a1f, sub: 0xa8200a, glow: true },
    { kind: 'skin', id: 'ghost',   name: '유령 (빛남)', price: 420, main: 0x9ff3ff, sub: 0x3a9fc0, glow: true },
    { kind: 'skin', id: 'galaxy',  name: '은하 (빛남)', price: 520, main: 0x8a4dff, sub: 0x2a1a7a, glow: true },
    { kind: 'skin', id: 'royal',   name: '로열',   price: 600, main: 0x6a2fb8, sub: 0xe0b83a },
    { kind: 'skin', id: 'rainbow', name: '무지개 (색이 변함)', price: 800, main: 0xff0000, sub: 0x00ff00, rainbow: true },
    // 출석 보상 한정 스킨: 코인으로는 못 사고, 연속 출석 N일을 채우면 자동으로 받음
    { kind: 'skin', id: 'streak7',  name: '출석 7일 (한정)',  price: 0, exclusive: 7,  main: 0x39d0ff, sub: 0x1b6fa8, glow: true },
    { kind: 'skin', id: 'streak14', name: '출석 14일 (한정)', price: 0, exclusive: 14, main: 0xff5ad8, sub: 0x8a1f7a, glow: true },
    { kind: 'skin', id: 'streak30', name: '출석 30일 (전설)', price: 0, exclusive: 30, main: 0xff0000, sub: 0x00ff00, rainbow: true },
  ];
  const XHS = [
    { kind: 'xh', id: 'xh_white',  name: '흰색',   price: 0,  color: '#ffffff' },
    { kind: 'xh', id: 'xh_green',  name: '초록',   price: 40, color: '#4dff7a' },
    { kind: 'xh', id: 'xh_cyan',   name: '하늘',   price: 40, color: '#4de8ff' },
    { kind: 'xh', id: 'xh_yellow', name: '노랑',   price: 40, color: '#ffe44d' },
    { kind: 'xh', id: 'xh_pink',   name: '분홍',   price: 60, color: '#ff7ad1' },
    { kind: 'xh', id: 'xh_red',    name: '빨강',   price: 60, color: '#ff4d4d' },
    { kind: 'xh', id: 'xh_orange', name: '주황',   price: 60, color: '#ff9a3d' },
    { kind: 'xh', id: 'xh_lime',   name: '연두',   price: 60, color: '#b6ff3d' },
    { kind: 'xh', id: 'xh_purple', name: '보라',   price: 80, color: '#b06bff' },
  ];
  // 조준점 모양
  const SHAPES = [
    { kind: 'xs', id: 'xs_cross', name: '십자 (기본)', price: 0, shape: 'cross' },
    { kind: 'xs', id: 'xs_dot',   name: '점',         price: 80,  shape: 'dot' },
    { kind: 'xs', id: 'xs_ring',  name: '동그라미',   price: 120, shape: 'ring' },
    { kind: 'xs', id: 'xs_x',     name: 'X자',        price: 120, shape: 'x' },
    { kind: 'xs', id: 'xs_tri',   name: '세모',       price: 160, shape: 'tri' },
  ];
  // 무기 잠금 해제: 가격(price)이 있는 무기들 (weapons.js 의 표에서 자동으로 만듦)
  const WEAPONS = Object.keys(window.RivalWeapons.list).filter((k) => window.RivalWeapons.list[k].price).map((k) => {
    const w = window.RivalWeapons.list[k];
    return { kind: 'weapon', id: 'wp_' + k, weapon: k, slot: w.slot, name: w.name, price: w.price, desc: w.desc };
  });
  // 소모품(쓰면 줄어드는 것)
  const BOOSTS = [
    { kind: 'boost', id: 'bo_coin2',  name: '코인 2배 (5경기)', price: 300, add: { coin2: 5 }, desc: '다음 5경기 동안 경기가 끝나고 받는 코인이 2배가 돼요' },
    { kind: 'boost', id: 'bo_shield', name: '출석 보호권',      price: 200, add: { shield: 1 }, desc: '하루 출석을 깜빡해도 연속 출석이 끊기지 않아요 (1장)' },
  ];
  const byId = Object.create(null); // 프로토타입 없는 객체: 저장값에 "__proto__" 같은 이름이 있어도 물건으로 착각하지 않음
  SKINS.concat(XHS, SHAPES, WEAPONS, BOOSTS).forEach((i) => { byId[i.id] = i; });
  const FREE = { skin: 'classic', xh: 'xh_white', xs: 'xs_cross' };

  // ---- 지갑 (저장/불러오기) ----
  const KEY = 'rival_wallet';
  let wallet = load();
  function load() {
    const w = { coins: 0, owned: [FREE.skin, FREE.xh, FREE.xs], equip: { skin: FREE.skin, xh: FREE.xh, xs: FREE.xs }, boost: { coin2: 0, shield: 0 } };
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (raw && typeof raw === 'object') {
        if (Number.isFinite(raw.coins)) w.coins = Math.max(0, Math.min(9999999, Math.floor(raw.coins)));
        if (Array.isArray(raw.owned)) raw.owned.forEach((id) => { if (byId[id] && byId[id].kind !== 'boost' && !w.owned.includes(id)) w.owned.push(id); });
        if (raw.boost && typeof raw.boost === 'object') ['coin2', 'shield'].forEach((k) => { const v = raw.boost[k]; if (Number.isFinite(v)) w.boost[k] = Math.max(0, Math.min(999, Math.floor(v))); });
        const eq = raw.equip || {};
        ['skin', 'xh', 'xs'].forEach((k) => { if (byId[eq[k]] && byId[eq[k]].kind === k && w.owned.includes(eq[k])) w.equip[k] = eq[k]; });
      }
    } catch (e) {}
    return w;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(wallet)); } catch (e) {} }

  const owns = (id) => wallet.owned.includes(id) || (byId[id] && byId[id].kind === 'weapon' && !byId[id].price);
  const equippedSkin = () => byId[wallet.equip.skin] || byId[FREE.skin];
  const equippedXh = () => byId[wallet.equip.xh] || byId[FREE.xh];
  const isEquipped = (item) => (item.kind === 'weapon' ? opts.isWeaponEquipped(item.weapon) : item.kind === 'boost' ? false : wallet.equip[item.kind] === item.id);

  function addCoins(n) { wallet.coins = Math.max(0, Math.min(9999999, wallet.coins + Math.floor(n))); save(); refreshBadge(); }
  function buy(id) {
    const it = byId[id];
    if (!it) return { ok: false, err: '없는 물건이에요' };
    if (it.kind === 'boost') { // 소모품은 여러 번 살 수 있음
      if (wallet.coins < it.price) return { ok: false, err: '코인이 부족해요' };
      wallet.coins -= it.price; Object.keys(it.add).forEach((k) => { wallet.boost[k] = Math.min(999, (wallet.boost[k] || 0) + it.add[k]); }); save(); refreshBadge();
      return { ok: true };
    }
    if (owns(id)) return { ok: false, err: '이미 가지고 있어요' };
    if (it.exclusive) return { ok: false, err: '출석 보상으로만 받을 수 있어요' };
    if (wallet.coins < it.price) return { ok: false, err: '코인이 부족해요' };
    wallet.coins -= it.price; wallet.owned.push(id); save(); refreshBadge();
    return { ok: true };
  }
  // 무기를 쓸 수 있는가: 가격이 없는 무기는 처음부터, 가격이 있는 무기는 산 뒤에
  const hasWeapon = (wid) => { const w = window.RivalWeapons.list[wid]; return !!w && (!w.price || wallet.owned.includes('wp_' + wid)); };
  const equippedShape = () => byId[wallet.equip.xs] || byId[FREE.xs];
  function equip(id) {
    const it = byId[id];
    if (!it || it.kind === 'boost' || it.kind === 'weapon' || !owns(id)) return false;
    wallet.equip[it.kind] = id; save();
    return true;
  }

  // 경기가 끝났을 때 받는 코인: 참가 10 + 처치당 4(최대 40) + 승리 40 + 이긴 라운드당 5, 난이도 배율
  const MULT = { rookie: 0.6, easy: 0.8, normal: 1, hard: 1.4, insane: 2 };
  const WINS_MULT = { 1: 0.4, 2: 0.6, 3: 0.8, 5: 1, 7: 1.2, 10: 1.5 };
  function rewardFor(r) {
    const base = 10 + Math.min(40, (r.kills || 0) * 4) + (r.won ? 40 : 0) + (r.roundsWon || 0) * 5;
    return Math.round(base * (MULT[r.diff] || 1) * (WINS_MULT[r.wins] || 1)); // 짧은 매치(1선승 등)는 코인을 적게, 긴 매치는 더 줌
  }
  let lastBoosted = false;
  function reward(r) { // 코인 2배 부스터가 남아 있으면 이번 경기 보상이 2배 (한 경기에 1개 소모)
    let n = rewardFor(r); lastBoosted = false;
    if (wallet.boost.coin2 > 0) { wallet.boost.coin2--; n *= 2; lastBoosted = true; }
    addCoins(n); return n;
  }

  function refreshBadge() {
    const b = $('coin-badge'); if (b) b.textContent = '💰 ' + wallet.coins;
    const c = $('shop-coins'); if (c) c.textContent = '💰 ' + wallet.coins;
  }

  // ---- 상점 화면 ----
  let opts = { getWeapon: () => 'ar', onChange: () => {}, equipWeapon: () => {}, isWeaponEquipped: () => false };
  let tab = 'skin', selected = null, pv = null, isOpen = false;
  const css = (n) => '#' + n.toString(16).padStart(6, '0');
  const TAB_ITEMS = () => ({ skin: SKINS, xh: XHS, xs: SHAPES, weapon: WEAPONS, boost: BOOSTS })[tab] || [];
  const SLOT_NAME = { primary: '주무기', secondary: '보조', melee: '근접', utility: '유틸' };

  function swatch(it) {
    if (it.kind === 'xh') return it.color;
    if (it.kind === 'xs' || it.kind === 'weapon') return 'linear-gradient(135deg,#2a2d34,#454a55)';
    if (it.kind === 'boost') return 'linear-gradient(135deg,#1f6fb8,#3fd0ff)';
    if (!it.main) return 'linear-gradient(135deg,#2a2d34,#454a55)';
    if (it.rainbow) return 'linear-gradient(135deg,#f33,#fc3,#3f3,#3cf,#93f)';
    return 'linear-gradient(135deg,' + css(it.main) + ',' + css(it.sub) + ')';
  }
  const SHAPE_ICON = { cross: '＋', dot: '●', ring: '◎', x: '✕', tri: '▲' };

  function renderGrid() {
    const grid = $('shop-grid'); grid.innerHTML = '';
    TAB_ITEMS().forEach((it) => {
      const b = document.createElement('button');
      b.className = 'item' + (selected === it.id ? ' sel' : '') + (isEquipped(it) ? ' eq' : '');
      const sw = document.createElement('span'); sw.className = 'sw'; sw.style.background = swatch(it);
      if (it.kind === 'xs') sw.textContent = SHAPE_ICON[it.shape] || '';
      if (it.kind === 'weapon') sw.textContent = SLOT_NAME[it.slot] || '';
      if (it.kind === 'boost') sw.textContent = it.id === 'bo_coin2' ? '💰×2' : '🛡️';
      const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = it.name;
      const st = document.createElement('small');
      st.textContent = it.exclusive && !owns(it.id) ? '🔒 출석 ' + it.exclusive + '일' : it.kind === 'boost' ? '💰 ' + it.price + (wallet.boost[Object.keys(it.add)[0]] ? ' · 보유 ' + wallet.boost[Object.keys(it.add)[0]] : '') : isEquipped(it) ? '장착 중' : owns(it.id) ? '보유' : '💰 ' + it.price;
      b.appendChild(sw); b.appendChild(nm); b.appendChild(st);
      b.onclick = () => { selected = it.id; render(); };
      grid.appendChild(b);
    });
  }

  function renderDetail() {
    const it = byId[selected]; if (!it) return;
    $('shop-name').textContent = it.name;
    const btn = $('shop-action'); btn.disabled = false;
    if (it.kind === 'boost') {
      const k = Object.keys(it.add)[0];
      if (wallet.coins >= it.price) { btn.textContent = '구매 (💰 ' + it.price + ')'; btn.onclick = () => { buy(it.id); render(); }; }
      else { btn.textContent = '코인이 부족해요 (💰 ' + it.price + ')'; btn.disabled = true; btn.onclick = null; }
      $('shop-msg').textContent = it.desc + ' · 지금 ' + (wallet.boost[k] || 0) + '개 있어요';
      return;
    }
    if (isEquipped(it)) { btn.textContent = '장착 중'; btn.disabled = true; btn.onclick = null; }
    else if (owns(it.id)) { btn.textContent = '장착하기'; btn.onclick = () => { equipItem(it); render(); }; }
    else if (it.exclusive) { btn.textContent = '연속 출석 ' + it.exclusive + '일 달성하면 받아요'; btn.disabled = true; btn.onclick = null; }
    else if (wallet.coins >= it.price) { btn.textContent = '구매하고 장착 (💰 ' + it.price + ')'; btn.onclick = () => { if (buy(it.id).ok) equipItem(it); render(); }; }
    else { btn.textContent = '코인이 부족해요 (💰 ' + it.price + ')'; btn.disabled = true; btn.onclick = null; }
    $('shop-msg').textContent = it.kind === 'skin' ? '무기 몸체 색이 바뀌어요 (손에 든 모든 무기에 적용)' : it.kind === 'xh' ? '화면 가운데 조준점의 색이 바뀌어요' : it.kind === 'xs' ? '화면 가운데 조준점의 모양이 바뀌어요' : (SLOT_NAME[it.slot] || '') + ' · ' + (it.desc || '');
  }
  function equipItem(it) { if (it.kind === 'weapon') opts.equipWeapon(it.weapon); else equip(it.id); opts.onChange(); }

  function render() {
    refreshBadge();
    document.querySelectorAll('#shop .tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    renderGrid(); renderDetail();
    // 미리보기: 스킨/무기 탭이면 3D 무기, 조준점 탭이면 조준점 그림, 모양 탭은 모양 그림, 부스터는 없음
    const it = byId[selected];
    $('shop-canvas').classList.toggle('hidden', tab !== 'skin' && tab !== 'weapon');
    $('shop-xh').classList.toggle('hidden', tab !== 'xh' && tab !== 'xs');
    const xh = $('shop-xh');
    if (tab === 'xh' && it) { xh.style.setProperty('--xhc', it.color || '#fff'); xh.dataset.shape = 'cross'; }
    if (tab === 'xs' && it) { xh.style.setProperty('--xhc', equippedXh().color); xh.dataset.shape = it.shape; }
    if (tab === 'skin' && it) setPreview(opts.getWeapon(), it);
    if (tab === 'weapon' && it) setPreview(it.weapon, equippedSkin());
  }

  // ---- 3D 미리보기 (상점이 열려 있는 동안만 돌림) ----
  function ensurePreview() {
    if (pv) return pv;
    let r;
    try { r = new THREE.WebGLRenderer({ canvas: $('shop-canvas'), antialias: true, alpha: true }); } catch (e) { return null; }
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const dl = new THREE.DirectionalLight(0xffffff, 0.8); dl.position.set(1, 2, 2); scene.add(dl);
    const pivot = new THREE.Group(); scene.add(pivot);
    pv = { r, scene, cam: new THREE.PerspectiveCamera(32, 2, 0.05, 20), pivot, model: null, raf: 0, key: '' };
    return pv;
  }
  function disposeModel() {
    if (!pv || !pv.model) return;
    pv.pivot.remove(pv.model);
    (pv.model.userData.own || []).forEach((m) => m.dispose());
    pv.model = null;
  }
  function setPreview(weaponId, skin) {
    const p = ensurePreview(); if (!p) return;
    const key = weaponId + ':' + skin.id;
    if (p.key === key && p.model) return;
    disposeModel(); p.key = key;
    const m = RivalModels.weapon(weaponId, skin.main ? skin : null);
    const bb = new THREE.Box3().setFromObject(m), c = bb.getCenter(new THREE.Vector3()), size = bb.getSize(new THREE.Vector3()).length();
    m.position.sub(c); p.pivot.add(m); p.model = m;
    p.cam.position.set(0, size * 0.14, size * 1.3); p.cam.lookAt(0, 0, 0);
  }
  function fitPreview() {
    if (!pv) return;
    const cv = $('shop-canvas'), w = cv.clientWidth || 300, h = cv.clientHeight || 150;
    pv.r.setSize(w, h, false); pv.cam.aspect = w / h; pv.cam.updateProjectionMatrix();
  }
  function loop(t) {
    if (!isOpen || !pv) return;
    pv.raf = requestAnimationFrame(loop);
    pv.pivot.rotation.y = t * 0.0008;
    const rb = pv.model && pv.model.userData.rainbow;
    if (rb) rb.forEach((m, i) => m.color.setHSL(((t * 0.0003) + i * 0.13) % 1, 0.85, 0.55));
    pv.r.render(pv.scene, pv.cam);
  }

  function open() {
    isOpen = true;
    $('shop').classList.remove('hidden');
    if (!selected || !byId[selected] || byId[selected].kind !== tab) selected = tab === 'weapon' || tab === 'boost' ? TAB_ITEMS()[0].id : wallet.equip[tab];
    render(); fitPreview();
    if (ensurePreview()) { cancelAnimationFrame(pv.raf); pv.raf = requestAnimationFrame(loop); }
  }
  function close() {
    isOpen = false;
    $('shop').classList.add('hidden');
    if (pv) { cancelAnimationFrame(pv.raf); disposeModel(); pv.key = ''; }
  }

  // 출석 보상: 아이템을 그냥 줌(한정 스킨 등) / 소모품 개수 늘리기
  function grant(id) { const it = byId[id]; if (!it || it.kind === 'boost' || wallet.owned.includes(id)) return false; wallet.owned.push(id); save(); return true; }
  function addBoost(k, n) { if (k in wallet.boost) { wallet.boost[k] = Math.max(0, Math.min(999, wallet.boost[k] + n)); save(); } }
  // 출석 보호권 1장 사용 (있으면 true)
  function useShield() { if (wallet.boost.shield > 0) { wallet.boost.shield--; save(); return true; } return false; }

  function init(o) {
    opts = Object.assign(opts, o || {});
    $('shop-btn').onclick = open;
    $('shop-close').onclick = close;
    document.querySelectorAll('#shop .tabs button').forEach((b) => { b.onclick = () => { tab = b.dataset.tab; selected = tab === 'weapon' || tab === 'boost' ? TAB_ITEMS()[0].id : wallet.equip[tab]; render(); fitPreview(); }; });
    window.addEventListener('resize', () => { if (isOpen) fitPreview(); });
    refreshBadge();
  }

    // 로드아웃 화면에서 잠긴 무기를 눌렀을 때: 상점의 무기 탭을 그 무기로 열어 줌
  function openWeapon(wid) { tab = 'weapon'; selected = 'wp_' + wid; open(); }
  window.RivalShop = { SKINS, XHS, SHAPES, WEAPONS, BOOSTS, init, open, close, owns, buy, equip, addCoins, reward, rewardFor, refreshBadge, equippedSkin, equippedXh, equippedShape, hasWeapon, openWeapon, grant, addBoost, boosts: () => wallet.boost, useShield, coins: () => wallet.coins, get lastBoosted() { return lastBoosted; }, _wallet: () => wallet, _pv: () => pv };
})();
