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
  const byId = Object.create(null); // 프로토타입 없는 객체: 저장값에 "__proto__" 같은 이름이 있어도 물건으로 착각하지 않음
  SKINS.concat(XHS).forEach((i) => { byId[i.id] = i; });
  const FREE = { skin: 'classic', xh: 'xh_white' };

  // ---- 지갑 (저장/불러오기) ----
  const KEY = 'rival_wallet';
  let wallet = load();
  function load() {
    const w = { coins: 0, owned: [FREE.skin, FREE.xh], equip: { skin: FREE.skin, xh: FREE.xh } };
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (raw && typeof raw === 'object') {
        if (Number.isFinite(raw.coins)) w.coins = Math.max(0, Math.min(9999999, Math.floor(raw.coins)));
        if (Array.isArray(raw.owned)) raw.owned.forEach((id) => { if (byId[id] && !w.owned.includes(id)) w.owned.push(id); });
        const eq = raw.equip || {};
        ['skin', 'xh'].forEach((k) => { if (byId[eq[k]] && byId[eq[k]].kind === k && w.owned.includes(eq[k])) w.equip[k] = eq[k]; });
      }
    } catch (e) {}
    return w;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(wallet)); } catch (e) {} }

  const owns = (id) => wallet.owned.includes(id);
  const equippedSkin = () => byId[wallet.equip.skin] || byId[FREE.skin];
  const equippedXh = () => byId[wallet.equip.xh] || byId[FREE.xh];
  const isEquipped = (item) => wallet.equip[item.kind] === item.id;

  function addCoins(n) { wallet.coins = Math.max(0, Math.min(9999999, wallet.coins + Math.floor(n))); save(); refreshBadge(); }
  function buy(id) {
    const it = byId[id];
    if (!it) return { ok: false, err: '없는 물건이에요' };
    if (owns(id)) return { ok: false, err: '이미 가지고 있어요' };
    if (wallet.coins < it.price) return { ok: false, err: '코인이 부족해요' };
    wallet.coins -= it.price; wallet.owned.push(id); save(); refreshBadge();
    return { ok: true };
  }
  function equip(id) {
    const it = byId[id];
    if (!it || !owns(id)) return false;
    wallet.equip[it.kind] = id; save();
    return true;
  }

  // 경기가 끝났을 때 받는 코인: 참가 10 + 처치당 4(최대 40) + 승리 40 + 이긴 라운드당 5, 난이도 배율
  const MULT = { rookie: 0.6, easy: 0.8, normal: 1, hard: 1.4, insane: 2 };
  function rewardFor(r) {
    const base = 10 + Math.min(40, (r.kills || 0) * 4) + (r.won ? 40 : 0) + (r.roundsWon || 0) * 5;
    return Math.round(base * (MULT[r.diff] || 1));
  }
  function reward(r) { const n = rewardFor(r); addCoins(n); return n; }

  function refreshBadge() {
    const b = $('coin-badge'); if (b) b.textContent = '💰 ' + wallet.coins;
    const c = $('shop-coins'); if (c) c.textContent = '💰 ' + wallet.coins;
  }

  // ---- 상점 화면 ----
  let opts = { getWeapon: () => 'ar', onChange: () => {} };
  let tab = 'skin', selected = null, pv = null, isOpen = false;
  const css = (n) => '#' + n.toString(16).padStart(6, '0');

  function swatch(it) {
    if (it.kind === 'xh') return it.color;
    if (!it.main) return 'linear-gradient(135deg,#2a2d34,#454a55)';
    if (it.rainbow) return 'linear-gradient(135deg,#f33,#fc3,#3f3,#3cf,#93f)';
    return 'linear-gradient(135deg,' + css(it.main) + ',' + css(it.sub) + ')';
  }

  function renderGrid() {
    const grid = $('shop-grid'); grid.innerHTML = '';
    (tab === 'skin' ? SKINS : XHS).forEach((it) => {
      const b = document.createElement('button');
      b.className = 'item' + (selected === it.id ? ' sel' : '') + (isEquipped(it) ? ' eq' : '');
      const sw = document.createElement('span'); sw.className = 'sw'; sw.style.background = swatch(it);
      const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = it.name;
      const st = document.createElement('small'); st.textContent = isEquipped(it) ? '장착 중' : owns(it.id) ? '보유' : '💰 ' + it.price;
      b.appendChild(sw); b.appendChild(nm); b.appendChild(st);
      b.onclick = () => { selected = it.id; render(); };
      grid.appendChild(b);
    });
  }

  function renderDetail() {
    const it = byId[selected]; if (!it) return;
    $('shop-name').textContent = it.name;
    const btn = $('shop-action'); btn.disabled = false;
    if (isEquipped(it)) { btn.textContent = '장착 중'; btn.disabled = true; btn.onclick = null; }
    else if (owns(it.id)) { btn.textContent = '장착하기'; btn.onclick = () => { equip(it.id); opts.onChange(); render(); }; }
    else if (wallet.coins >= it.price) { btn.textContent = '구매하고 장착 (💰 ' + it.price + ')'; btn.onclick = () => { if (buy(it.id).ok) { equip(it.id); opts.onChange(); } render(); }; }
    else { btn.textContent = '코인이 부족해요 (💰 ' + it.price + ')'; btn.disabled = true; btn.onclick = null; }
    $('shop-msg').textContent = it.kind === 'skin' ? '무기 몸체 색이 바뀌어요 (손에 든 모든 무기에 적용)' : '화면 가운데 조준점의 색이 바뀌어요';
  }

  function render() {
    refreshBadge();
    document.querySelectorAll('#shop .tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    renderGrid(); renderDetail();
    // 미리보기: 스킨 탭이면 3D 무기, 조준점 탭이면 조준점 그림
    const it = byId[selected];
    $('shop-canvas').classList.toggle('hidden', tab !== 'skin');
    $('shop-xh').classList.toggle('hidden', tab !== 'xh');
    if (tab === 'xh' && it) $('shop-xh').style.setProperty('--xhc', it.color || '#fff');
    if (tab === 'skin' && it) setPreview(opts.getWeapon(), it);
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
    if (!selected || !byId[selected] || byId[selected].kind !== tab) selected = wallet.equip[tab];
    render(); fitPreview();
    if (ensurePreview()) { cancelAnimationFrame(pv.raf); pv.raf = requestAnimationFrame(loop); }
  }
  function close() {
    isOpen = false;
    $('shop').classList.add('hidden');
    if (pv) { cancelAnimationFrame(pv.raf); disposeModel(); pv.key = ''; }
  }

  function init(o) {
    opts = Object.assign(opts, o || {});
    $('shop-btn').onclick = open;
    $('shop-close').onclick = close;
    document.querySelectorAll('#shop .tabs button').forEach((b) => { b.onclick = () => { tab = b.dataset.tab; selected = wallet.equip[tab]; render(); fitPreview(); }; });
    window.addEventListener('resize', () => { if (isOpen) fitPreview(); });
    refreshBadge();
  }

  window.RivalShop = { SKINS, XHS, init, open, close, owns, buy, equip, addCoins, reward, rewardFor, refreshBadge, equippedSkin, equippedXh, coins: () => wallet.coins, _wallet: () => wallet, _pv: () => pv };
})();
