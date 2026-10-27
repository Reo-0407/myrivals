// MyRivals 클라이언트: 닉네임/로비/리더보드 + 매치(봇 대전, 라운드제) + 사격/재장전/조준 + 모바일 조작
(function () {
  const $ = (id) => document.getElementById(id);
  const W = window.RivalWeapons, Sfx = window.Sfx, Phys = window.RivalPhys;
  const DEG = Math.PI / 180, EYE = 1.7;
  const ROUND_TIME = 90, COUNTDOWN = 3, BETWEEN = 3.2;
  const qs = new URLSearchParams(location.search);
  const URL_ROUNDS = Math.max(0, parseInt(qs.get('rounds'), 10) || 0); // 테스트용 ?rounds=1 (있으면 로비 설정보다 우선)
  const WIN_CHOICES = [1, 2, 3, 5, 7, 10];
  const DEBUG = qs.has('debug');
  const isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  // =====================================================================
  // 저장소 / 내 정체성 / 서버 통신
  // =====================================================================
  function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  let myId = safeGet('rival_id');
  if (!myId) { myId = 'p' + Math.random().toString(36).slice(2) + Date.now().toString(36); safeSet('rival_id', myId); }
  let myNick = safeGet('rival_nick') || '';
  let myStats = null;

  async function api(path, body) {
    const res = await fetch('/api' + path, body
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : undefined);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '서버 오류');
    return data;
  }

  function show(name) {
    ['screen-nick', 'screen-lobby', 'screen-friendly', 'game'].forEach((id) => $(id).classList.toggle('hidden', id !== name));
  }

  // =====================================================================
  // 설정 (브라우저에 저장)
  // =====================================================================
  const SETTINGS_VER = 2; // 올리면 모든 사람의 난이도/보조 설정이 새 기본값으로 한 번 초기화됨
  const defaults = { v: SETTINGS_VER, sens: 1, fov: 80, auto: isTouch, assist: isTouch ? 2 : 0, mode: 2, diff: isTouch ? 'rookie' : 'easy', map: 'warehouse', wins: 5, randomGear: false, loadout: { primary: 'ar', secondary: 'pistol', melee: 'knife', utility: 'frag' } };
  let settings = Object.assign({}, defaults);
  try {
    const saved = JSON.parse(safeGet('rival_settings') || '{}');
    if (saved.v !== SETTINGS_VER) { delete saved.diff; delete saved.auto; delete saved.assist; delete saved.mode; } // 이전 버전 설정은 새 기본값(쉬운 난이도 + 조작 보조)으로
    Object.assign(settings, saved);
  } catch (e) {}
  settings.v = SETTINGS_VER;
  // 저장된 설정값이 이상해도(손으로 고쳤거나 깨졌어도) 게임이 멈추지 않게 값 범위/종류를 검사해서 기본값으로 되돌림
  const num = (v, a, b, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(a, Math.min(b, v)) : d);
  settings.sens = num(settings.sens, 0.3, 3, 1);
  settings.fov = num(settings.fov, 60, 100, 80);
  settings.mode = [1, 2, 3, 4].includes(settings.mode) ? settings.mode : 2;
  settings.assist = [0, 1, 2].includes(settings.assist) ? settings.assist : defaults.assist;
  settings.wins = WIN_CHOICES.includes(settings.wins) ? settings.wins : 5;
  settings.randomGear = settings.randomGear === true;
  const winRounds = () => URL_ROUNDS || settings.wins;
  settings.auto = typeof settings.auto === 'boolean' ? settings.auto : defaults.auto;
  if (!['rookie', 'easy', 'normal', 'hard', 'insane'].includes(settings.diff)) settings.diff = defaults.diff;
  if (typeof settings.map !== 'string' || !RivalMap.has(settings.map)) settings.map = 'warehouse';
  settings.loadout = Object.assign({}, defaults.loadout, settings.loadout);
  ['primary', 'secondary', 'melee', 'utility'].forEach((s) => { const id = settings.loadout[s]; if (!W.list[id] || W.list[id].slot !== s) settings.loadout[s] = defaults.loadout[s]; });
  const saveSettings = () => safeSet('rival_settings', JSON.stringify(settings));

  // =====================================================================
  // 닉네임
  // =====================================================================
  async function submitNick() {
    $('nick-err').textContent = '';
    try {
      const r = await api('/join', { id: myId, nick: $('nick-input').value });
      myNick = r.nick; myStats = r.stats;
      safeSet('rival_nick', myNick);
      enterLobby();
    } catch (e) { $('nick-err').textContent = e.message; }
  }
  $('nick-btn').onclick = submitNick;
  $('nick-input').onkeydown = (e) => { if (e.key === 'Enter') submitNick(); };
  $('nick-change').onclick = () => { $('nick-input').value = myNick; show('screen-nick'); };

  // =====================================================================
  // 로비: 리더보드 / 로드아웃 / 설정
  // =====================================================================
  async function loadBoard() {
    try {
      const rows = await api('/leaderboard');
      const tb = $('board').querySelector('tbody');
      tb.innerHTML = '';
      rows.forEach((r, i) => {
        const tr = document.createElement('tr');
        const medal = ['🥇', '🥈', '🥉'][i] || i + 1;
        [medal, r.nick, r.wins, r.kills, r.deaths].forEach((v, ci) => {
          const td = document.createElement('td');
          td.textContent = v; // textContent: 닉네임에 HTML이 들어가도 그냥 글자로만 표시됨
          if (ci === 1 && r.nick === myNick) td.style.color = '#ff4d5e';
          tr.appendChild(td);
        });
        tb.appendChild(tr);
      });
      $('board-empty').textContent = '아직 기록이 없어요. 첫 번째 주인공이 되세요!';
      $('board-empty').classList.toggle('hidden', rows.length > 0);
    } catch (e) {
      $('board-empty').textContent = '리더보드를 불러오지 못했어요.';
      $('board-empty').classList.remove('hidden');
    }
  }

  function weaponInfoText(id) {
    const w = W.list[id];
    if (w.util) return w.name + ': ' + w.desc;
    if (w.melee) return w.name + ': ' + w.desc + ' — 데미지 ' + w.dmg + ', 초당 ' + (w.rpm / 60).toFixed(1) + '회';
    const reload = w.shell ? '한 발씩 ' + w.shell + '초' : w.reload + '초';
    return w.name + ': ' + w.desc + ' — 데미지 ' + w.dmg + (w.pellets ? '×' + w.pellets : '') + ', 탄창 ' + w.mag + '발, 재장전 ' + reload;
  }

  // 무기 고르기 칩 목록을 box 안에 그림. 로비와 사격장(일시정지 화면)에서 같이 씀.
  function renderLoadoutInto(box, infoEl, onPick) {
    box.innerHTML = '';
    [['primary', '주무기'], ['secondary', '보조'], ['melee', '근접'], ['utility', '유틸']].forEach(([slot, label]) => {
      const row = document.createElement('div'); row.className = 'slotrow';
      const sp = document.createElement('span'); sp.textContent = label; row.appendChild(sp);
      W.bySlot(slot).forEach((id) => {
        const b = document.createElement('button');
        b.className = 'chip' + (settings.loadout[slot] === id ? ' on' : '');
        b.textContent = W.list[id].name;
        b.onclick = () => { settings.loadout[slot] = id; saveSettings(); renderLoadoutInto(box, infoEl, onPick); infoEl.textContent = weaponInfoText(id); if (onPick) onPick(slot); };
        row.appendChild(b);
      });
      box.appendChild(row);
    });
  }
  function renderLoadout() { renderLoadoutInto($('loadout'), $('weapon-info'), null); }

  function initSettingsUI() {
    $('set-mode').value = String(settings.mode);
    const mapSel = $('set-map'); mapSel.innerHTML = '';
    RivalMap.list().forEach((m) => { const o = document.createElement('option'); o.value = m.id; o.textContent = m.name; mapSel.appendChild(o); });
    if (!RivalMap.has(settings.map)) settings.map = 'warehouse';
    mapSel.value = settings.map;
    mapSel.onchange = (e) => { settings.map = e.target.value; saveSettings(); };
    $('set-diff').value = settings.diff;
    $('set-sens').value = settings.sens; $('v-sens').textContent = settings.sens;
    $('set-fov').value = settings.fov; $('v-fov').textContent = settings.fov;
    $('set-auto').checked = !!settings.auto;
    $('set-assist').value = String(settings.assist);
    $('set-assist').onchange = (e) => { settings.assist = +e.target.value; saveSettings(); };
    $('set-mode').onchange = (e) => { settings.mode = +e.target.value; saveSettings(); };
    const showMem = () => {
      const k = settings.diff, mem = RivalBots.memory(), cap = RivalBots.LEARN_CAP[k];
      $('ai-mem').textContent = cap ? '🧠 이 난이도의 AI는 내 습관을 학습해요 (기억한 경기 ' + mem.matches + '판' + (mem.shotDist ? ' · 내 교전 거리 약 ' + mem.shotDist + 'm' : '') + ')' : '이 난이도의 AI는 학습하지 않아요 (보통 이상에서 학습)';
    };
    $('set-diff').onchange = (e) => { settings.diff = e.target.value; saveSettings(); showMem(); };
    $('set-wins').value = String(settings.wins);
    $('set-wins').onchange = (e) => { const v = +e.target.value; settings.wins = WIN_CHOICES.includes(v) ? v : 5; saveSettings(); };
    $('set-rand').checked = settings.randomGear;
    $('set-rand').onchange = (e) => { settings.randomGear = e.target.checked; saveSettings(); };
    $('set-mem').onclick = () => { RivalBots.resetMemory(); showMem(); };
    showMem();
    $('set-sens').oninput = (e) => { settings.sens = +e.target.value; $('v-sens').textContent = settings.sens; saveSettings(); };
    $('set-fov').oninput = (e) => { settings.fov = +e.target.value; $('v-fov').textContent = settings.fov; saveSettings(); };
    $('set-auto').onchange = (e) => { settings.auto = e.target.checked; saveSettings(); };
    renderLoadout();
    $('weapon-info').textContent = weaponInfoText(settings.loadout.primary);
    $('controls-hint').innerHTML = isTouch
      ? '왼쪽 화면: 이동(끝까지 밀면 달리기) · 오른쪽 화면: 드래그로 시점<br>발사/조준(누를 때마다 켜기·끄기)/장전/점프 버튼 · 아래 버튼으로 무기 교체<br>폰을 <b>가로</b>로 돌려서 플레이하세요.'
      : 'PC: WASD 이동 · 마우스 시점 · 좌클릭 발사 · 우클릭 조준 · R 장전<br>1·2·3·4 또는 휠 무기 교체(4=유틸) · Tab 점수판 · Space 점프 · Shift 달리기 · Esc 일시정지';
  }

  function helpHtml() {
    return isTouch
      ? '<p><b>이동</b>: 왼쪽 화면을 누른 채 밀기 (끝까지 밀면 달리기)</p>' +
        '<p><b>시점</b>: 오른쪽 화면을 드래그</p>' +
        '<p><b>발사</b>: 빨간 발사 버튼을 누르는 동안 발사. <b>누른 채로 손가락을 움직이면 시점도 같이 돌아가요!</b> (왼쪽에도 작은 발사 버튼이 있어요)</p>' +
        '<p><b>조준</b>: 파란 버튼 (한 번 누르면 켜지고 다시 누르면 꺼져요) · <b>장전</b>: 노란 버튼 · <b>점프</b>: 회색 버튼 · <b>앉기</b>: 작은 회색 버튼(누를 때마다 앉기/서기, 낮은 상자 뒤에 숨을 수 있어요)</p>' +
        '<p><b>무기 교체</b>: 화면 아래쪽 무기 이름 버튼 · <b>점수판</b>: 위쪽 점수 상자 탭</p>' +
        '<p>💡 <b>에임 보조</b>와 <b>자동 발사</b>가 켜져 있어서, 적 쪽을 대충 보면 시점이 살짝 끌려가고 자동으로 쏴요. (로비 설정에서 끌 수 있어요)</p>' +
        '<p>💡 처음엔 <b>🎯 사격장</b>에서 연습하고, 난이도는 <b>입문</b>으로 시작해 보세요. 폰은 <b>가로</b>로 돌려서 하세요.</p>'
      : '<p><b>이동</b>: WASD · <b>달리기</b>: Shift · <b>점프</b>: Space · <b>앉기</b>: C 누르는 동안</p>' +
        '<p><b>시점</b>: 마우스 · <b>발사</b>: 좌클릭 · <b>조준</b>: 우클릭 · <b>장전</b>: R</p>' +
        '<p><b>무기 교체</b>: 1·2·3·4 또는 마우스 휠, Q(직전 무기) · <b>점수판</b>: Tab</p>' +
        '<p><b>일시정지</b>: Esc (사격장에서는 이때 무기를 바꿀 수 있어요)</p>' +
        '<p>💡 처음엔 <b>🎯 사격장</b>에서 연습해 보세요.</p>';
  }
  function showHelp() { $('help-body').innerHTML = helpHtml(); $('help').classList.remove('hidden'); }
  $('help-btn').onclick = showHelp;
  $('help-close').onclick = () => { $('help').classList.add('hidden'); safeSet('rival_help', '1'); };

  const applyCrosshair = () => { $('xh').style.setProperty('--xhc', RivalShop.equippedXh().color); }; // 장착한 조준점 색

  if (window.RivalFriendly) RivalFriendly.onBack = () => enterLobby();

  function enterLobby() {
    $('lobby-nick').textContent = myNick;
    $('my-stats').textContent = myStats ? '내 전적: ' + myStats.wins + '승 ' + myStats.losses + '패 · ' + myStats.kills + '킬 ' + myStats.deaths + '데스' : '';
    show('screen-lobby');
    if (window.RivalNet) RivalNet.connect(myId); // 친선전투 서버에 접속 (접속자 목록/초대 받기)
    RivalShop.refreshBadge();
    loadBoard();
    if (!safeGet('rival_help')) showHelp(); // 처음 들어온 사람에게 한 번 보여줌
  }

  // =====================================================================
  // 3D 세계
  // =====================================================================
  let renderer, scene, camera, gunScene, gunCam, world, phys, botsApi;
  let started = false, raf = 0, last = 0, now = 0, mobilePlaying = false;
  const boxes = [];
  const keys = {};
  const joy = { x: 0, y: 0 };
  const inp = { fire: false, adsHold: false, adsToggle: false };

  // 플레이어 (봇과 같은 모양의 entity)
  const P = { id: 'me', name: '나', team: 'A', isBot: false, x: 0, y: EYE, eye: EYE, z: 27, vy: 0, onGround: true, yaw: 0, pitch: 0, hp: 100, alive: true, firedT: 0, kills: 0, deaths: 0, flashT: 0 };
  let guns = [], cur = 0, lastCur = 0, switchT = 0;
  let adsT = 0, recoilAcc = 0, vmKick = 0, vmRaise = 0, swingT = 0, flashT = 0, dmgT = 0, hmT = 0, xhGap = 8, bannerT = 0, deadCamY = EYE;
  let lastHurt = 0, vm = null, curFov = 80, spawnPoint = { x: 0, z: 27, yaw: 0 };

  const all = () => [P].concat(botsApi ? botsApi.bots : []);
  const enemiesOf = (team) => all().filter((e) => e.team !== team && e.alive);

  function initGL() {
    renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: !isTouch });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouch ? 1.5 : 2));
    renderer.autoClear = false;
    if (!isTouch) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; }
    camera = new THREE.PerspectiveCamera(80, 1, 0.05, 220);
    camera.rotation.order = 'YXZ';
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x9db7d4);
    scene.fog = new THREE.Fog(0x9db7d4, 45, 130);
    // 손에 든 총은 별도 장면에 그려서 벽에 파묻히지 않게 함
    gunScene = new THREE.Scene();
    gunScene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const dl = new THREE.DirectionalLight(0xffffff, 0.7); dl.position.set(1, 2, 1); gunScene.add(dl);
    gunCam = new THREE.PerspectiveCamera(55, 1, 0.01, 10);
    makeFx();
    resize();
  }

  // 맵을 (다시) 불러옴: 이전 맵을 지우고 새로 만든 뒤, 봇 길찾기 격자도 그 맵에 맞게 새로 만듦
  let mapGroup = null, curMap = null;
  function loadMap(id) {
    if (!RivalMap.has(id)) id = 'warehouse';
    if (curMap === id && mapGroup) return;
    if (botsApi) botsApi.clear(true);
    clearThrown(); clearRange();
    if (mapGroup) { scene.remove(mapGroup); mapGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
    boxes.length = 0; // phys가 같은 배열을 계속 쓰므로 비우고 다시 채움
    mapGroup = new THREE.Group(); scene.add(mapGroup);
    world = RivalMap.build(mapGroup, { shadows: !isTouch }, id);
    world.boxes.forEach((b) => boxes.push(b));
    scene.background = new THREE.Color(world.sky || 0x9db7d4);
    scene.fog = new THREE.Fog(world.sky || 0x9db7d4, 45, 130);
    if (!phys) phys = Phys.create(boxes);
    botsApi = RivalBots.create({ scene, phys, boxes, phase: () => match.phase, enemiesOf, shoot, smoked, mapId: () => id, throwUtil: botThrow });
    curMap = id;
  }

  // 모바일 브라우저는 주소창 때문에 CSS의 100vh가 실제 보이는 높이보다 커서 화면이 잘림.
  // 그래서 지금 실제로 보이는 크기(innerWidth/innerHeight)를 CSS 변수로 넘겨서 모든 화면이 그 크기에 딱 맞게 함.
  function fitApp() {
    const w = window.innerWidth, h = window.innerHeight;
    document.documentElement.style.setProperty('--app-w', w + 'px');
    document.documentElement.style.setProperty('--app-h', h + 'px');
    resize();
  }
  window.addEventListener('resize', fitApp);
  window.addEventListener('orientationchange', () => { setTimeout(fitApp, 150); setTimeout(fitApp, 600); });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', fitApp);
  fitApp();

  function resize() {
    if (!renderer) return;
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = gunCam.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix(); gunCam.updateProjectionMatrix();
  }

  // =====================================================================
  // 효과 (총알 궤적, 불꽃)
  // =====================================================================
  const tracers = [], sparks = [];
  let tIdx = 0, sIdx = 0;
  function makeFx() {
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 1), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.85 }));
      m.visible = false; scene.add(m); tracers.push({ m, t: 0 });
    }
    for (let i = 0; i < 28; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), new THREE.MeshBasicMaterial({ color: 0xffc060 }));
      m.visible = false; scene.add(m); sparks.push({ m, t: 0 });
    }
  }
  function tracer(ax, ay, az, bx, by, bz) {
    const len = Math.hypot(bx - ax, by - ay, bz - az);
    if (len < 1.5) return;
    const tr = tracers[tIdx++ % tracers.length];
    tr.m.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    tr.m.scale.z = len;
    tr.m.lookAt(bx, by, bz);
    tr.m.visible = true; tr.t = 0.07;
  }
  function spark(x, y, z, color) {
    const s = sparks[sIdx++ % sparks.length];
    s.m.position.set(x, y, z); s.m.material.color.setHex(color); s.m.scale.setScalar(1); s.m.visible = true; s.t = 0.25;
  }
  function updateFx(dt) {
    tracers.forEach((tr) => { if (tr.t > 0) { tr.t -= dt; if (tr.t <= 0) tr.m.visible = false; } });
    sparks.forEach((s) => { if (s.t > 0) { s.t -= dt; s.m.scale.setScalar(Math.max(0.01, s.t / 0.25)); if (s.t <= 0) s.m.visible = false; } });
  }

  // =====================================================================
  // 전투: 총알 계산 / 데미지 / 처치
  // =====================================================================
  function spreadDir(dx, dy, dz, deg) {
    if (deg <= 0.001) return [dx, dy, dz];
    let ux, uy, uz; // d 와 수직인 기준축 u, v
    if (Math.abs(dy) < 0.99) { ux = dz; uy = 0; uz = -dx; } else { ux = 1; uy = 0; uz = 0; }
    const ul = Math.hypot(ux, uy, uz); ux /= ul; uy /= ul; uz /= ul;
    const vx = dy * uz - dz * uy, vy = dz * ux - dx * uz, vz = dx * uy - dy * ux;
    const r = Math.tan(deg * DEG) * Math.sqrt(Math.random()), a = Math.random() * Math.PI * 2;
    const k1 = r * Math.cos(a), k2 = r * Math.sin(a);
    const x = dx + ux * k1 + vx * k2, y = dy + uy * k1 + vy * k2, z = dz + uz * k1 + vz * k2;
    const l = Math.hypot(x, y, z);
    return [x / l, y / l, z / l];
  }

  // 광선을 쏴서 가장 먼저 맞는 것(벽 또는 적의 머리/몸)을 찾음
  function castRay(shooter, ox, oy, oz, dx, dy, dz, max) {
    const tWall = phys.rayBoxes(ox, oy, oz, dx, dy, dz, max);
    let best = isFinite(tWall) ? tWall : max, hitE = null, head = false;
    const list = all();
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e === shooter || !e.alive || e.team === shooter.team) continue;
      const feet = e.y - (e.eye || EYE);
      const th = Phys.raySphere(ox, oy, oz, dx, dy, dz, e.x, e.y - 0.1, e.z, 0.24); // 머리
      const tb = Phys.rayAABB(ox, oy, oz, dx, dy, dz, e.x - 0.32, e.x + 0.32, feet, e.y - 0.25, e.z - 0.32, e.z + 0.32); // 몸통
      let t = -1, h = false;
      if (th >= 0 && (tb < 0 || th <= tb)) { t = th; h = true; } else if (tb >= 0) t = tb;
      if (t >= 0 && t < best) { best = t; hitE = e; head = h; }
    }
    return { t: best, e: hitE, head, wall: !hitE && isFinite(tWall) };
  }

  function muzzlePos(s, dx, dy, dz) {
    if (s === P) { // 화면 오른쪽 아래, 총구 쪽
      const rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
      return [P.x + dx * 0.6 + rx * 0.2, P.y + dy * 0.6 - 0.15, P.z + dz * 0.6 + rz * 0.2];
    }
    const c = Math.cos(s.yaw), n = Math.sin(s.yaw);
    return [s.x + 0.2 * c - 0.55 * n, s.y - 0.55, s.z - 0.2 * n - 0.55 * c];
  }

  // 한 번 발사 (플레이어/봇 공용). 펠릿(샷건)은 여러 알이 각자 날아감.
  const BOT_HIT_CAP = 60, BOT_VOLLEY_CAP = 55, BOT_NADE_CAP = 80; // 봇의 공격이 나를 한 방에 쓰러뜨리지 않게 하는 상한 (아래 shoot/explode)
  function shoot(shooter, ox, oy, oz, dx, dy, dz, w, spread) {
    shooter.firedT = 0.8;
    if (shooter.isBot) shooter.muzzleT = 0.05;
    const isMe = shooter === P;
    const dP = isMe ? 0 : Math.hypot(shooter.x - P.x, shooter.y - P.y, shooter.z - P.z);
    Sfx.shot(w.sfx, isMe ? 1 : Math.max(0, 1 - dP / 60) * 0.7);
    const mz = muzzlePos(shooter, dx, dy, dz);
    const n = w.pellets || 1;
    let anyHit = false, hitMe = false, volleyOnMe = 0;
    for (let i = 0; i < n; i++) {
      const d = spreadDir(dx, dy, dz, spread);
      const r = castRay(shooter, ox, oy, oz, d[0], d[1], d[2], 300);
      const px = ox + d[0] * r.t, py = oy + d[1] * r.t, pz = oz + d[2] * r.t;
      if (r.e) {
        let dmg = w.dmg * W.falloff(w, r.t);
        if (r.head) dmg *= w.head; else if (py < r.e.y - (r.e.eye || EYE) + 0.7) dmg *= 0.85; // 다리는 약간 약함
        if (shooter.isBot && shooter.diff) dmg *= shooter.diff.dmg; // 낮은 난이도 봇은 데미지가 약함
        if (shooter.isBot && (r.e === P || r.e.human)) { // 봇이 사람을 한 방에 죽이지 못하게: 총알 한 발 최대 60, 샷건 한 번(알갱이 합계) 최대 55
          dmg = Math.min(dmg, BOT_HIT_CAP);
          if (n > 1) { dmg = Math.min(dmg, Math.max(0, BOT_VOLLEY_CAP - volleyOnMe)); volleyOnMe += dmg; if (dmg < 1) { spark(px, py, pz, 0xff3030); anyHit = true; hitMe = true; tracer(mz[0], mz[1], mz[2], px, py, pz); continue; } }
        }
        spark(px, py, pz, 0xff3030); anyHit = true; if (r.e === P) hitMe = true;
        if (isMe && r.e.isBot && !r.e.dummy && match.mode === 'match' && !match.net) botsApi.observeShot(r.t);
        damage(r.e, dmg, r.head, shooter, w);
      } else if (r.wall) spark(px, py, pz, 0xffc060);
      tracer(mz[0], mz[1], mz[2], px, py, pz);
    }
    if (match.net && (isMe || (shooter.isBot && !shooter.remote)) && (!shooter.fireRelT || now - shooter.fireRelT > 0.08)) { shooter.fireRelT = now; relay('all', 'fire', { i: idOf(shooter), o: [r2(ox), r2(oy), r2(oz)], d: [r2(dx), r2(dy), r2(dz)], w: w.id }); } // 소리/총알 궤적 보여주기용 (연사는 초당 12번까지만 알림: 메시지가 너무 많으면 중요한 피격/사망 알림이 밀릴 수 있음)
    if (isMe) { rangeStats.shots++; if (anyHit) rangeStats.hits++; if (match.mode === 'match') { match.shots++; if (anyHit) match.hits++; } }
    else if (shooter.isBot && shooter.team === 'B') { botStats.shots++; if (hitMe) botStats.hitsOnMe++; }
  }

  function damage(t, amount, head, attacker, w) {
    if (!t.alive || match.phase !== 'live') return;
    amount = Math.max(1, Math.round(amount));
    if (match.net && t.remote) { // 다른 기기가 주인인 캐릭터: 맞혔다고 알려주면 그쪽이 체력을 깎고, 죽으면 직접 알려줌
      t.flash = 0.12;
      if (attacker === P) { hitmark(head); Sfx.hit(head); if (head) match.heads++; }
      const msg = { f: idOf(attacker), d: amount, h: head ? 1 : 0, w: w ? w.id : 'ar' };
      if (t.human) relay(t.id, 'hit', msg); else { msg.b = t.id; relay('host', 'hit', msg); }
      t.hp = Math.max(1, t.hp - amount); // 다음 상태 전송 때 진짜 값으로 맞춰짐
      return;
    }
    t.hp = Math.max(0, t.hp - amount);
    if (t.isBot) { t.flinchT = 0.5; if (attacker && attacker !== t) t.hurtFrom = attacker; } // 맞으면 움찔하고 쏜 쪽을 확인
    if (t === P && attacker && attacker !== P) showHitDir(attacker);
    if (t === P) { dmgT = Math.min(0.8, dmgT + 0.4); if (now - lastHurt > 0.12) { lastHurt = now; Sfx.hurt(); } } else t.flash = 0.12;
    if (attacker === P && t !== P) { hitmark(head); Sfx.hit(head); if (head) { rangeStats.heads++; if (match.mode === 'match') match.heads++; } rangeStats.last = amount + (head ? ' (헤드샷)' : ''); }
    if (t.hp <= 0) kill(t, attacker, head, w);
  }

  function kill(t, a, head, w) {
    t.alive = false; t.deaths++;
    if (a !== t) a.kills++; // 수류탄 자폭은 킬로 세지 않음
    if (a === P && a !== t) { match.kills++; rangeStats.kills++; Sfx.kill(); }
    if (t === P) { match.deaths++; inp.adsToggle = false; inp.crouch = false; $('btn-ads').classList.remove('on'); $('btn-crouch').classList.remove('on'); P.flashT = 0; }
    feed(a === t ? t.name + '  [' + w.name + ' 자폭]' : a.name + '  [' + w.name + (head ? ' · 헤드샷' : '') + ']  ' + t.name, a === P || t === P);
    if (match.net && !t.remote) relay('all', 'dead', { v: idOf(t), k: idOf(a), h: head ? 1 : 0, w: w.id }); // 내(또는 방장의 봇) 죽음은 주인이 모두에게 알림
    if (match.tdm) { if (t === P) NET.respT = 3; tdmScore(t, a); }
    checkRoundEnd();
  }

  // 맞았을 때 쏜 사람 방향으로 빨간 화살표
  function showHitDir(a) {
    const ang = -(Math.atan2(-(a.x - P.x), -(a.z - P.z)) - P.yaw);
    const el = document.createElement('i'); el.className = 'hd';
    el.style.transform = 'rotate(' + ang.toFixed(3) + 'rad) translateY(-95px)';
    $('hitdirs').appendChild(el);
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 900);
  }

  // 레이더: 위쪽이 내가 보는 방향. 아군은 항상, 적은 가까이 있거나 방금 쏜 경우에만(쉬운 난이도는 더 넓게) 표시.
  let radarT = 0;
  function drawRadar(dt) {
    radarT -= dt; if (radarT > 0) return; radarT = 0.1;
    const cv = $('radar'), g = cv.getContext('2d'), R = 50, rng = 32;
    g.clearRect(0, 0, 100, 100);
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.arc(R, R, R - 1, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 1; g.beginPath(); g.arc(R, R, R / 2, 0, Math.PI * 2); g.stroke();
    const sy = Math.sin(P.yaw), cy = Math.cos(P.yaw), wide = match.diff === 'rookie' || match.diff === 'easy';
    all().forEach((e) => {
      if (e === P || !e.alive) return;
      const dx = e.x - P.x, dz = e.z - P.z, dist = Math.hypot(dx, dz), ally = e.team === 'A';
      if (!ally && !(e.firedT > 0 || dist < 14 || (wide && dist < 34))) return;
      const fwd = dx * -sy + dz * -cy, rgt = dx * cy + dz * -sy; // 내 시점 기준: 앞쪽 / 오른쪽 거리
      const sx = rgt, sz = -fwd;                                   // 화면 좌표(앞쪽이 위)
      const m = Math.min(1, (R - 6) / (Math.hypot(sx, sz) * (R / rng) || 1));
      const px = R + sx * (R / rng) * m, py = R + sz * (R / rng) * m;
      g.fillStyle = ally ? '#5aa2ff' : '#ff4d5e'; g.beginPath(); g.arc(px, py, 3.2, 0, Math.PI * 2); g.fill();
    });
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(R, R - 6); g.lineTo(R + 4, R + 4); g.lineTo(R - 4, R + 4); g.closePath(); g.fill(); // 나
  }

  function hitmark(head) {
    const h = $('hitmark');
    h.className = 'on' + (head ? ' head' : '');
    hmT = 0.12;
  }

  function feed(text, mine) {
    const d = document.createElement('div');
    d.textContent = text; if (mine) d.className = 'me';
    const box = $('feed'); box.appendChild(d);
    while (box.children.length > 5) box.removeChild(box.firstChild);
    setTimeout(() => { if (d.parentNode) d.parentNode.removeChild(d); }, 4500);
  }

  function setBanner(html, sec) { $('banner').innerHTML = html; bannerT = sec || 0; }

  // =====================================================================
  // 매치 / 라운드
  // =====================================================================
  const match = { net: false, tdm: false, limit: 20, gear: false, shots: 0, hits: 0, heads: 0, wins: 5, mode: 'match', phase: 'idle', round: 0, score: { A: 0, B: 0 }, timer: 0, phaseT: 0, teamSize: 2, diff: 'normal', kills: 0, deaths: 0, lastCount: 99 };

  // =====================================================================
  // 친선전투(온라인) 공용 상태: 방장의 기기가 라운드 진행/AI 봇을 맡고, 모두가 자기 캐릭터의 위치·발사·피격을 서로에게 알려 줌
  // =====================================================================
  const NET = { respT: 0, on: false, host: false, myTeam: 'A', room: null, settings: null, ids: Object.create(null), sendT: 0, bsT: 0, phT: 0, ready: new Set(), waiting: false, readyT: 0 };
  const lt = (rt) => (rt === NET.myTeam ? 'A' : 'B');                               // 방 팀(A/B) → 내 화면 기준 (우리편 = A)
  const rtOf = (l) => (l === 'A' ? NET.myTeam : NET.myTeam === 'A' ? 'B' : 'A');    // 내 화면 기준 → 방 팀
  const idOf = (e) => (e === P ? myId : e.id);
  const entById = (id) => (id === myId ? P : NET.ids[id] || (botsApi && botsApi.bots.find((b) => b.id === id)) || null);
  const scoreRoom = () => { const s = { A: 0, B: 0 }; s[NET.myTeam] = match.score.A; s[NET.myTeam === 'A' ? 'B' : 'A'] = match.score.B; return s; };
  const relay = (to, t, d) => { if (NET.on) RivalNet.relay(to, t, d); };
  const r2 = (v) => Math.round(v * 100) / 100;
  const TDM_TIME = 300; // 팀 데스매치 제한 시간(초)
  // 팀 데스매치: 상대 팀을 처치하면 우리 팀 점수. 점수는 방장이 세고 모두에게 알림
  function tdmScore(v, k) {
    if (!NET.host || match.phase !== 'live' || !k || k === v || k.team === v.team) return;
    match.score[k.team]++;
    broadcastPhase();
    if (match.score[k.team] >= match.limit) finishMatch();
  }

  function startMatch() {
    match.mode = 'match'; match.net = false; match.tdm = false; $('res-again').classList.remove('hidden'); $('res-lobby').textContent = '로비로';
    P.name = myNick || '나';
    match.teamSize = settings.mode; match.diff = settings.diff; match.wins = winRounds(); // 매치 도중에는 선승 수가 바뀌지 않게 시작할 때 고정
    match.round = 0; match.score.A = match.score.B = 0; match.kills = match.deaths = 0; match.shots = match.hits = match.heads = 0; match.phase = 'ready';
    P.kills = P.deaths = 0;
    $('result').classList.add('hidden'); sbOpen = false;
    $('feed').innerHTML = '';
    setBanner('');
    applyCrosshair();
    botsApi.beginMatch();
    showOverlay('준비 완료', (world.name + ' · ' + match.teamSize + ' vs ' + match.teamSize + ' · ' + botsApi.DIFFS[match.diff].name + ' · ' + match.wins + '선승'), '시작');
  }


  // =====================================================================
  // 사격장 (연습 모드): 고정/움직이는 과녁, 거리 표시, 명중률 통계, 무기 자유 교체
  // =====================================================================
  const rangeStats = { shots: 0, hits: 0, heads: 0, kills: 0, last: '-' };
  const botStats = { shots: 0, hitsOnMe: 0, nearMiss: 0 }; // 봇이 나를 향해 쏜 횟수 / 맞힌 횟수 / 아슬아슬하게 빗나간 횟수(튜닝용)
  const rangeLabels = [];
  let rangeT = 1.5, rangeUtilT = 2;

  function resetRangeStats() { rangeStats.shots = rangeStats.hits = rangeStats.heads = rangeStats.kills = 0; rangeStats.last = '-'; }

  function startRange() {
    match.mode = 'range'; match.phase = 'ready'; match.round = 0;
    match.score.A = match.score.B = 0; match.kills = match.deaths = 0;
    P.name = myNick || '나'; P.kills = P.deaths = 0;
    $('result').classList.add('hidden'); sbOpen = false; $('feed').innerHTML = ''; setBanner('');
    showOverlay('🎯 사격장', '과녁을 쏴서 연습해요. 무기는 일시정지(PC: Esc / 폰: 무기 버튼)에서 바꿀 수 있어요.', '입장');
  }

  function clearRange() {
    rangeLabels.forEach((l) => { scene.remove(l); l.material.map.dispose(); l.material.dispose(); });
    rangeLabels.length = 0;
  }

  function startRangeSession() {
    match.mode = 'range'; match.phase = 'live';
    botsApi.clear(); clearThrown(); clearRange(); resetRangeStats();
    setupGuns();
    spawnPoint = { x: 12, z: 18.5, yaw: 0 };
    inp.crouch = false; $('btn-crouch').classList.remove('on');
    Object.assign(P, { x: 12, y: EYE, eye: EYE, z: 18.5, vy: 0, onGround: true, yaw: 0, pitch: 0, hp: 100, alive: true, firedT: 0, flashT: 0 });
    deadCamY = EYE; recoilAcc = 0; rangeT = 1.5; rangeUtilT = 2;
    const dummy = (x, z, track) => botsApi.spawn({ team: 'B', name: '과녁', diff: 'easy', x, z, yaw: Math.PI, primary: 'ar', dummy: true, track });
    [[8.5, '10m'], [-1.5, '20m'], [-11.5, '30m'], [-21.5, '40m']].forEach(([z, label]) => { // 고정 과녁 + 거리 표지
      dummy(12, z, null);
      const tag = RivalModels.nameTag(label, 'A'); tag.position.set(8.2, 2.0, z); scene.add(tag); rangeLabels.push(tag);
    });
    dummy(12, 13, { x0: 9.6, x1: 16, speed: 2 });   // 움직이는 과녁 (가까움/보통/빠름)
    dummy(12, 3, { x0: 9.6, x1: 16, speed: 3.5 });
    dummy(12, -7, { x0: 9.6, x1: 16, speed: 5 });
    setBanner('🎯 과녁을 쏴 보세요<small>왼쪽 숫자는 거리(m) · 과녁은 죽어도 2초 뒤 다시 나와요</small>', 4);
  }

  // 사격장에서만 필요한 갱신: 내가 죽으면 되살리기, 유틸리티 다시 채우기
  function updateRange(dt) {
    if (match.mode !== 'range' || match.phase !== 'live') return;
    if (!P.alive) {
      rangeT -= dt;
      if (rangeT <= 0) { P.alive = true; P.hp = 100; Object.assign(P, { x: spawnPoint.x, z: spawnPoint.z, y: EYE, eye: EYE, vy: 0, flashT: 0 }); deadCamY = EYE; setBanner(''); rangeT = 1.5; }
    }
    const u = guns[3];
    if (u && u.ammo <= 0 && nades.length === 0) { rangeUtilT -= dt; if (rangeUtilT <= 0) { u.ammo = 1; rangeUtilT = 2; } } else rangeUtilT = 2;
  }

  // 무기를 바꾸면 그 칸 무기를 손에 듦
  function applyLoadoutInRange(slot) {
    const idx = { primary: 0, secondary: 1, melee: 2, utility: 3 }[slot];
    setupGuns();
    cur = idx; lastCur = 0; setViewmodel(guns[cur].id); renderSlots();
  }

  // 랜덤 무기 모드: 매치에서 라운드마다 주무기/보조/근접/유틸리티를 무작위로 받음 (내가 고른 로드아웃은 그대로 저장돼 있음)
  const pickRandom = (slot) => { const ids = Object.keys(W.list).filter((k) => W.list[k].slot === slot); return ids[Math.floor(Math.random() * ids.length)]; };
  function setupGuns() {
    let lo = settings.loadout;
    if ((match.net ? match.gear : settings.randomGear) && match.mode === 'match') {
      lo = { primary: pickRandom('primary'), secondary: pickRandom('secondary'), melee: pickRandom('melee'), utility: pickRandom('utility') };
      feed('🎲 이번 라운드 무기: ' + [lo.primary, lo.secondary, lo.melee, lo.utility].map((id) => W.list[id].name).join(' · '), true);
    }
    guns = [W.create(lo.primary), W.create(lo.secondary), W.create(lo.melee), W.create(lo.utility)];
    cur = 0; lastCur = 0; switchT = 0.3; adsT = 0; vmRaise = 1;
    inp.adsToggle = false; $('btn-ads').classList.remove('on');
    setViewmodel(guns[0].id);
    renderSlots();
  }

  function startRound() {
    if (match.net) { startRoundNet(); return; }
    match.round++;
    match.phase = 'countdown'; match.phaseT = COUNTDOWN; match.lastCount = 99;
    botsApi.clear(); clearThrown(); P.flashT = 0; specTarget = null; specIdx = 0;
    const sA = shuffle(world.spawns.A.slice()), sB = shuffle(world.spawns.B.slice());
    const n = match.teamSize, names = shuffle(botsApi.NAMES.slice());
    spawnPoint = sA[0];
    inp.crouch = false; $('btn-crouch').classList.remove('on');
    Object.assign(P, { x: spawnPoint.x, y: EYE, eye: EYE, z: spawnPoint.z, vy: 0, onGround: true, yaw: spawnPoint.yaw, pitch: 0, hp: 100, alive: true, firedT: 0 });
    deadCamY = EYE; recoilAcc = 0;
    setupGuns();
    const allyDiff = { rookie: 'easy', easy: 'normal', normal: 'hard', hard: 'hard', insane: 'insane' }[match.diff] || match.diff; // 아군은 한 단계 더 잘 싸움
    for (let i = 1; i < n; i++) botsApi.spawn({ team: 'A', name: '🤖' + names.pop(), diff: allyDiff, x: sA[i].x, z: sA[i].z, yaw: sA[i].yaw });
    for (let i = 0; i < n; i++) botsApi.spawn({ team: 'B', name: '🤖' + names.pop(), diff: match.diff, x: sB[i].x, z: sB[i].z, yaw: sB[i].yaw });
  }

  function aliveCount(team) { return all().filter((e) => e.team === team && e.alive).length; }
  function hpSum(team) { return all().filter((e) => e.team === team && e.alive).reduce((s, e) => s + e.hp, 0); }

  function checkRoundEnd(timeUp) {
    if (match.phase !== 'live' || match.mode === 'range') return;
    if (match.net && !NET.host) return; // 친선전투: 라운드 승패는 방장이 정함
    if (match.tdm) return; // 팀 데스매치는 전멸로 끝나지 않음
    const a = aliveCount('A'), b = aliveCount('B');
    if (b === 0) endRound('A', '적을 모두 처치!');
    else if (a === 0) endRound('B', '팀이 전멸했어요');
    else if (timeUp) {
      const ha = hpSum('A'), hb = hpSum('B');
      endRound(ha > hb ? 'A' : hb > ha ? 'B' : null, '시간 종료 · 남은 체력 ' + ha + ' : ' + hb);
    }
  }

  function endRound(winner, why) {
    match.phase = 'between'; match.phaseT = BETWEEN;
    if (winner) match.score[winner]++;
    const mine = winner === 'A';
    if (!match.net) botsApi.roundEnd(winner ? mine : null);
    const li = !match.net && match.diff && botsApi.learnInfo(match.diff);
    if (winner) (mine ? Sfx.win : Sfx.lose)();
    setBanner((winner ? (mine ? '🏆 라운드 승리!' : '라운드 패배') : '무승부') + '<small>' + why + ' · ' + match.score.A + ' : ' + match.score.B + (li && li.cap ? ' · 🧠 AI 학습 ' + Math.round(li.L * 100) + '%' : '') + '</small>', BETWEEN);
    inp.fire = false;
    if (match.net) { relay('all', 'er', { w: winner ? rtOf(winner) : null, why, s: scoreRoom() }); broadcastPhase(); }
  }

  function updateMatch(dt) {
    if (match.phase === 'countdown') {
      match.phaseT -= dt;
      const c = Math.ceil(match.phaseT);
      if (c !== match.lastCount && c > 0) { match.lastCount = c; Sfx.beep(false); setBanner(c + '<small>라운드 ' + match.round + '</small>', 0); }
      if (match.phaseT <= 0 && (!match.net || NET.host)) { match.phase = 'live'; match.timer = match.tdm ? TDM_TIME : ROUND_TIME; Sfx.beep(true); setBanner('시작!', 0.8); if (match.net) broadcastPhase(); }
    } else if (match.phase === 'live' && match.mode !== 'range') {
      match.timer -= dt;
      if (match.timer <= 0) { match.timer = 0; if (match.tdm) { if (NET.host) finishMatch(); } else if (!match.net || NET.host) checkRoundEnd(true); }
    } else if (match.phase === 'between') {
      match.phaseT -= dt;
      if (match.phaseT <= 0 && (!match.net || NET.host)) {
        if (match.score.A >= match.wins || match.score.B >= match.wins) finishMatch();
        else startRound();
      }
    }
  }

  async function finishMatch() {
    if (match.net) { relay('all', 'ov', { s: scoreRoom() }); showNetResult(); RivalNet.endMatch(); return; }
    match.phase = 'over';
    const won = match.score.A > match.score.B;
    botsApi.endMatch(won, match.diff);
    setBanner('');
    if (document.pointerLockElement) document.exitPointerLock();
    $('res-title').textContent = won ? '🏆 승리!' : '패배';
    $('res-score').textContent = '라운드 ' + match.score.A + ' : ' + match.score.B + (match.shots ? ' · 명중률 ' + Math.round(100 * match.hits / match.shots) + '% · 헤드샷 ' + match.heads : '');
    const gain = RivalShop.reward({ won, kills: match.kills, roundsWon: match.score.A, diff: match.diff, wins: settings.wins });
    $('res-coins').textContent = '💰 +' + gain + ' 코인 (보유 ' + RivalShop.coins() + ')';
    $('res-stats').textContent = '이번 매치: ' + match.kills + '킬 ' + match.deaths + '데스 · 기록을 저장하는 중…';
    $('result').classList.remove('hidden');
    try {
      const r = await api('/report', { id: myId, kills: Math.min(match.kills, 50), deaths: Math.min(match.deaths, 50), won });
      myStats = r.stats;
      $('res-stats').textContent = '이번 매치: ' + match.kills + '킬 ' + match.deaths + '데스 · 리더보드에 기록됐어요!';
    } catch (e) {
      $('res-stats').textContent = '이번 매치: ' + match.kills + '킬 ' + match.deaths + '데스 · (기록 저장 실패: ' + e.message + ')';
    }
  }

  // =====================================================================
  // 플레이어: 이동 / 조준 / 사격 / 재장전 / 무기 교체
  // =====================================================================
  let lookMul = 1; // 적 근처에서는 시점 감도를 낮춰서 조준하기 쉽게 (에임 보조)
  const angDiffM = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

  // 조준점 근처(원뿔 안)에서 보이는 가장 가까운 적을 찾음. 가까울수록 범위가 넓음.
  function findAssistTarget(w) {
    if (!settings.assist || !w || w.melee || w.util) return null;
    const k = settings.assist === 2 ? 1 : 0.5, d = camDir();
    let best = null, bestAng = 1e9;
    for (const e of enemiesOf('A')) {
      const dx = e.x - P.x, dy = (e.y - 0.55) - P.y, dz = e.z - P.z, dist = Math.hypot(dx, dy, dz);
      if (dist > Math.min(w.range[1], 70)) continue;
      const cos = (dx * d[0] + dy * d[1] + dz * d[2]) / dist;
      if (cos <= 0) continue;
      const ang = Math.acos(Math.min(1, cos));
      if (ang > Math.atan2(1.4 * k, dist) + (3 + 4 * k) * DEG || ang >= bestAng) continue;
      if (phys.rayBoxes(P.x, P.y, P.z, dx / dist, dy / dist, dz / dist, dist) < dist - 0.5) continue; // 벽 뒤는 제외
      if (smoked(P.x, P.y, P.z, e.x, e.y - 0.55, e.z)) continue;
      best = { e, dx, dy, dz, dist }; bestAng = ang;
    }
    return best;
  }

  const camDir = () => { const cp = Math.cos(P.pitch); return [-Math.sin(P.yaw) * cp, Math.sin(P.pitch), -Math.cos(P.yaw) * cp]; };

  function switchTo(i) {
    if (i === cur || i < 0 || i > 3 || !P.alive) return;
    W.cancelReload(guns[cur]);
    lastCur = cur; cur = i; switchT = 0.28; vmRaise = 1; adsT = 0;
    inp.adsToggle = false; $('btn-ads').classList.remove('on');
    setViewmodel(guns[cur].id);
    renderSlots();
  }

  function doReload() {
    if (!P.alive || match.phase !== 'live') return;
    if (W.reload(guns[cur])) Sfx.reload();
  }

  function meleeAttack(w) {
    const d = camDir();
    let best = null, bd = 1e9;
    for (const e of enemiesOf('A')) {
      const dx = e.x - P.x, dy = (e.y - 0.6) - P.y, dz = e.z - P.z, dist = Math.hypot(dx, dy, dz);
      if (dist > w.range[0] + 0.4 || dist >= bd) continue;
      if ((dx * d[0] + dy * d[1] + dz * d[2]) / dist < 0.72) continue; // 정면 약 45도 안
      if (phys.rayBoxes(P.x, P.y, P.z, dx / dist, dy / dist, dz / dist, dist) < dist - 0.3) continue;
      best = e; bd = dist;
    }
    swingT = 0.22; Sfx.shot('swing', 1);
    rangeStats.shots++; if (best) rangeStats.hits++;
    if (best) damage(best, w.dmg, false, P, w);
  }

  function autoFireProbe(w) {
    if (!(settings.auto && isTouch) || w.melee || w.util) return false; // 근접/유틸리티는 사거리 값이 없음
    const d = camDir();
    return !!castRay(P, P.x, P.y, P.z, d[0], d[1], d[2], w.range[1]).e;
  }

  function updatePlayer(dt) {
    const live = match.phase === 'live';
    const g = guns[cur], w = g.w;
    if (P.firedT > 0) P.firedT -= dt;
    if (switchT > 0) switchT -= dt;

    // 이동
    let fx = joy.x, fz = joy.y;
    if (keys['KeyW']) fz -= 1; if (keys['KeyS']) fz += 1;
    if (keys['KeyA']) fx -= 1; if (keys['KeyD']) fx += 1;
    const canMove = P.alive && (live || match.phase === 'ready');
    if (!canMove) { fx = 0; fz = 0; }
    // 앉기: PC는 C키를 누르는 동안, 폰은 앉기 버튼(토글). 눈높이가 1.7m→1.2m로 낮아짐. 머리 위가 막혀 있으면 일어서지 못하고 계속 앉아 있음.
    const eyeT = P.alive && (keys['KeyC'] || inp.crouch) ? 1.2 : EYE;
    if (P.alive && P.eye !== eyeT) {
      const stp = 4.5 * dt, ne = P.eye < eyeT ? Math.min(eyeT, P.eye + stp) : Math.max(eyeT, P.eye - stp), dEye = ne - P.eye;
      if (dEye < 0 || !phys.hitsBox(P.x, P.y + dEye, P.z, ne)) { P.y += dEye; P.eye = ne; }
    }
    const crouched = P.eye < 1.5;
    const joyMag = Math.hypot(joy.x, joy.y);
    const sprint = (keys['ShiftLeft'] || keys['ShiftRight'] || joyMag > 0.95) && !(inp.fire) && !crouched;
    const wantAds = P.alive && live && !w.melee && !w.util && !g.reload && (inp.adsHold || inp.adsToggle);
    const len = Math.max(1, Math.hypot(fx, fz));
    fx /= len; fz /= len;
    const speed = 5.5 * w.move * (wantAds ? 0.7 : 1) * (sprint ? 1.3 : 1) * (crouched ? 0.55 : 1);
    const sin = Math.sin(P.yaw), cos = Math.cos(P.yaw);
    const px = P.x, pz = P.z;
    if (P.alive) {
      phys.tryMove(P, P.x + (fx * cos + fz * sin) * speed * dt, P.z);
      phys.tryMove(P, P.x, P.z + (-fx * sin + fz * cos) * speed * dt);
      phys.gravity(P, dt, !!keys['Space'] && live);
      if (P.y < -20) Object.assign(P, { x: spawnPoint.x, z: spawnPoint.z, y: EYE, eye: EYE, vy: 0 });
    }
    const moving = Math.hypot(P.x - px, P.z - pz) / Math.max(dt, 1e-4) > 1;

    // 조준(ADS)
    adsT += ((wantAds ? 1 : 0) - adsT) * Math.min(1, dt * 12);

    // 사격
    const assistT = P.alive && live ? findAssistTarget(w) : null;
    lookMul = assistT ? (settings.assist === 2 ? 0.55 : 0.8) : 1;
    // 자동 발사: 조준점이 적에 닿았거나, 에임 보조(강)가 적을 잡았을 때
    const auto = P.alive && live && switchT <= 0 && !sprint && (autoFireProbe(w) || (isTouch && settings.auto && settings.assist === 2 && !!assistT));
    const trigger = P.alive && live && switchT <= 0 && (inp.fire || auto);
    if (assistT && (trigger || adsT > 0.3)) { // 쏘거나 조준하는 동안 시점이 적 쪽으로 부드럽게 끌려감
      const wy = Math.atan2(-assistT.dx, -assistT.dz), wp = Math.atan2(assistT.dy, Math.hypot(assistT.dx, assistT.dz));
      const f = 1 - Math.exp(-(settings.assist === 2 ? 9 : 4) * dt);
      P.yaw += angDiffM(P.yaw, wy) * f; P.pitch = clamp(P.pitch + (wp - P.pitch) * f, -1.5, 1.5);
    }
    const shots = W.update(g, dt, trigger);
    if (g.empty) { Sfx.empty(); Sfx.reload(); }
    if (P.flashT > 0) P.flashT = Math.max(0, P.flashT - dt);
    if (shots > 0) {
      if (w.util) useUtility(g, w);
      else if (w.melee) meleeAttack(w);
      else {
        const d = camDir();
        let sp = lerp(w.spread[0], w.spread[1], adsT);
        sp *= moving ? lerp(1.6, 1.25, adsT) : 1;
        if (!P.onGround) sp *= 2.2;
        if (crouched) sp *= 0.75; // 앉으면 더 정확
        shoot(P, P.x, P.y, P.z, d[0], d[1], d[2], w, sp);
        const rk = w.recoil * (1 - 0.4 * adsT) * DEG;
        P.pitch = clamp(P.pitch + rk, -1.5, 1.5); recoilAcc += rk;
        P.yaw += (Math.random() - 0.5) * rk * 0.6;
        vmKick = 1; flashT = 0.045;
      }
    }
    if (!w.melee && !w.util && g.ammo <= 0 && !g.reload && live && P.alive) doReload();
    // 반동 회복 (쏘고 있지 않을 때 화면이 천천히 내려옴)
    if (!trigger && recoilAcc > 0) {
      const rec = Math.min(recoilAcc, (recoilAcc * 5 + 0.6 * DEG) * dt);
      P.pitch -= rec; recoilAcc -= rec;
    }

    // 시야각 / 감도 / 조준점
    curFov = lerp(settings.fov, w.fov || settings.fov, adsT);
    if (Math.abs(camera.fov - curFov) > 0.01) { camera.fov = curFov; camera.updateProjectionMatrix(); }
    const spreadNow = w.melee || w.util ? 1 : lerp(w.spread[0], w.spread[1], adsT) * (moving ? 1.4 : 1) * (P.onGround ? 1 : 2) * (crouched ? 0.75 : 1);
    const gapTarget = 4 + Math.tan(spreadNow * DEG) / Math.tan(curFov * 0.5 * DEG) * (window.innerHeight / 2);
    xhGap += (Math.min(gapTarget, 90) - xhGap) * Math.min(1, dt * 15);
    $('xh').style.setProperty('--gap', xhGap.toFixed(1) + 'px');
    $('xh').classList.toggle('off', !!(w.scope && adsT > 0.5) || !P.alive);
    $('scope').classList.toggle('hidden', !(w.scope && adsT > 0.85 && P.alive));

    // 죽었을 때 카메라가 바닥으로 내려감
    deadCamY = P.alive ? P.y : lerp(deadCamY, 0.45, Math.min(1, dt * 4));
    updateViewmodel(dt, moving && P.onGround);
  }

  // =====================================================================
  // 유틸리티: 수류탄 / 섬광탄 / 연막탄 / 치료 음료
  // =====================================================================
  const nades = [], smokes = [], blasts = [];
  const NADE_COLOR = { frag: 0x3f5a2e, flash: 0xb8bcc4, smoke: 0x6e7580 };
  let nadeGeo = null, sbOpen = false, sbT = 0;

  function useUtility(g, w) {
    if (w.util === 'heal') {
      if (P.hp >= 100) { g.ammo = 1; Sfx.empty(); return; } // 체력이 가득이면 안 씀(돌려줌)
      P.hp = Math.min(100, P.hp + w.heal); Sfx.drink(); feed('치료 음료로 체력 ' + w.heal + ' 회복', true);
    } else throwNade(w);
    swingT = 0.22;
    if (g.ammo <= 0) switchTo(lastCur === 3 ? 0 : lastCur); // 다 쓰면 직전 무기로 복귀
  }

  function inBox(x, y, z) {
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (x > b.minX - 0.08 && x < b.maxX + 0.08 && y > b.minY - 0.08 && y < b.maxY + 0.08 && z > b.minZ - 0.08 && z < b.maxZ + 0.08) return true;
    }
    return false;
  }

  function throwNade(w) {
    const d = camDir();
    if (!nadeGeo) nadeGeo = new THREE.SphereGeometry(0.08, 10, 8);
    const m = new THREE.Mesh(nadeGeo, new THREE.MeshLambertMaterial({ color: NADE_COLOR[w.util] }));
    scene.add(m);
    let x = P.x + d[0] * 0.5, y = P.y - 0.1 + d[1] * 0.5, z = P.z + d[2] * 0.5;
    if (inBox(x, y, z)) { x = P.x; y = P.y - 0.1; z = P.z; } // 벽에 바싹 붙어 던지면 벽 속으로 들어가지 않게
    nades.push({ w, type: w.util, x, y, z, vx: d[0] * 15, vy: d[1] * 15 + 3.2, vz: d[2] * 15, t: w.fuse, m, owner: P });
    if (match.net) relay('all', 'nade', { w: w.id, p: [r2(x), r2(y), r2(z)], v: [r2(d[0] * 15), r2(d[1] * 15 + 3.2), r2(d[2] * 15)], o: myId });
    Sfx.shot('swing', 1);
  }

  // 봇이 던지는 유틸리티: 목표 지점(tx,tz)에 떨어지도록 포물선 속도를 계산 (벽에 맞고 튀면 빗나갈 수 있음)
  function botThrow(b, type, tx, tz) {
    const w = W.list[type]; if (!w || !w.util) return;
    if (!nadeGeo) nadeGeo = new THREE.SphereGeometry(0.08, 10, 8);
    const m = new THREE.Mesh(nadeGeo, new THREE.MeshLambertMaterial({ color: NADE_COLOR[w.util] }));
    scene.add(m);
    const dx = tx - b.x, dz = tz - b.z, D = Math.max(1, Math.hypot(dx, dz)), T = clamp(D / 14, 0.4, 1.3);
    const sp = D / T, vy = (9 * T * T - (b.y - 0.3)) / T;
    let x = b.x, y = b.y - 0.1, z = b.z;
    nades.push({ w, type: w.util, x, y, z, vx: dx / D * sp, vy, vz: dz / D * sp, t: w.fuse, m, owner: b });
    if (match.net) relay('all', 'nade', { w: w.id, p: [r2(x), r2(y), r2(z)], v: [r2(dx / D * sp), r2(vy), r2(dz / D * sp)], o: b.id });
    Sfx.shot('swing', Math.max(0, 1 - Math.hypot(b.x - P.x, b.z - P.z) / 50));
  }

  function addBlast(x, y, z, r, color) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }));
    m.position.set(x, y, z); scene.add(m);
    blasts.push({ m, t: 0.35, r });
  }

  function addSmoke(x, z, r) {
    const group = new THREE.Group(); group.position.set(x, 1.3, z);
    const mt = new THREE.MeshBasicMaterial({ color: 0xb4b8bf, transparent: true, opacity: 0.92, depthWrite: false });
    const geo = new THREE.SphereGeometry(r * 0.6, 12, 10);
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(geo, mt);
      m.position.set((Math.random() - 0.5) * r * 0.9, (Math.random() - 0.5) * r * 0.5, (Math.random() - 0.5) * r * 0.9);
      group.add(m);
    }
    group.scale.setScalar(0.3);
    scene.add(group);
    smokes.push({ x, y: 1.3, z, r, age: 0, life: 10, group, mt, geo });
  }

  // 선분(a→b)이 연막 구 안을 지나가는지 (봇의 시야 차단용)
  function smoked(ax, ay, az, bx, by, bz) {
    for (let i = 0; i < smokes.length; i++) {
      const s = smokes[i];
      if (s.age < 0.5) continue;
      const dx = bx - ax, dy = by - ay, dz = bz - az, l2 = dx * dx + dy * dy + dz * dz || 1;
      const t = clamp(((s.x - ax) * dx + (s.y - ay) * dy + (s.z - az) * dz) / l2, 0, 1);
      if (Math.hypot(ax + dx * t - s.x, ay + dy * t - s.y, az + dz * t - s.z) <= s.r * 0.8) return true;
    }
    return false;
  }

  function explode(n) {
    const w = n.w, dP = Math.hypot(n.x - P.x, n.y - P.y, n.z - P.z);
    const auth = !match.net || n.owner === P || (NET.host && n.owner.isBot && !n.owner.remote); // 친선전투: 피해는 던진 기기만 계산(중복 방지), 눈부심은 각자
    if (n.type === 'smoke') { Sfx.smokePop(); addSmoke(n.x, n.z, w.radius); return; }
    const flashing = n.type === 'flash';
    if (flashing) { Sfx.flashBang(Math.max(0.2, 1 - dP / 60)); addBlast(n.x, n.y, n.z, 1.4, 0xffffff); }
    else { Sfx.boom(Math.max(0.15, 1 - dP / 50)); addBlast(n.x, n.y, n.z, w.radius * 0.5, 0xffa040); }
    all().forEach((e) => {
      if (!e.alive || (e.team === n.owner.team && e !== n.owner)) return; // 아군은 안전, 던진 본인은 영향받음
      if (!auth && e !== P) return;
      const cy = e.y - (flashing ? 0.2 : 0.6);
      const dx = e.x - n.x, dy = cy - (n.y + 0.2), dz = e.z - n.z, d = Math.hypot(dx, dy, dz);
      if (d > w.radius) return;
      if (d > 0.4 && phys.rayBoxes(n.x, n.y + 0.2, n.z, dx / d, dy / d, dz / d, d) < d - 0.3) return; // 벽이 막아줌
      if (!flashing) { if (!auth) return; let nd = w.dmg * (1 - d / w.radius); if ((e === P || e.human) && n.owner.isBot) nd = Math.min(nd, BOT_NADE_CAP); damage(e, nd, false, n.owner, w); return; }
      const toB = [-dx / (d || 1), -dy / (d || 1), -dz / (d || 1)];
      if (e === P) { // 폭발 쪽을 쳐다보고 있을수록 오래 멂
        const v = camDir(), f = (v[0] * toB[0] + v[1] * toB[1] + v[2] * toB[2] + 1) / 2;
        P.flashT = Math.max(P.flashT, (0.8 + 3.2 * f) * (1 - 0.5 * d / w.radius));
      } else {
        const front = (-Math.sin(e.yaw)) * toB[0] + (-Math.cos(e.yaw)) * toB[2];
        e.blindT = Math.max(e.blindT || 0, front > -0.2 ? 3 : 0.8);
      }
    });
  }

  function updateThrown(dt) {
    for (let i = nades.length - 1; i >= 0; i--) {
      const n = nades[i];
      n.t -= dt; n.vy -= 18 * dt;
      const nx = n.x + n.vx * dt;
      if (inBox(nx, n.y, n.z)) { n.vx *= -0.45; n.vz *= 0.8; } else n.x = nx;
      const nz = n.z + n.vz * dt;
      if (inBox(n.x, n.y, nz)) { n.vz *= -0.45; n.vx *= 0.8; } else n.z = nz;
      let ny = n.y + n.vy * dt;
      if (ny < 0.08) { ny = 0.08; n.vy = Math.abs(n.vy) > 1.5 ? -n.vy * 0.4 : 0; n.vx *= 0.85; n.vz *= 0.85; }
      else if (inBox(n.x, ny, n.z)) { n.vy = n.vy < 0 && Math.abs(n.vy) > 1.5 ? -n.vy * 0.4 : n.vy < 0 ? 0 : -n.vy * 0.3; n.vx *= 0.85; n.vz *= 0.85; ny = n.y; }
      n.y = ny;
      n.m.position.set(n.x, n.y, n.z);
      if (n.t <= 0) { explode(n); scene.remove(n.m); n.m.material.dispose(); nades.splice(i, 1); }
    }
    for (let i = blasts.length - 1; i >= 0; i--) {
      const b = blasts[i]; b.t -= dt;
      const k = 1 - Math.max(0, b.t) / 0.35;
      b.m.scale.setScalar(Math.max(0.05, b.r * k)); b.m.material.opacity = Math.max(0, 0.85 * (1 - k));
      if (b.t <= 0) { scene.remove(b.m); b.m.geometry.dispose(); b.m.material.dispose(); blasts.splice(i, 1); }
    }
    for (let i = smokes.length - 1; i >= 0; i--) {
      const sm = smokes[i]; sm.age += dt;
      sm.group.scale.setScalar(Math.min(1, 0.3 + sm.age * 1.2));
      sm.mt.opacity = sm.age > sm.life - 2 ? Math.max(0, 0.92 * (sm.life - sm.age) / 2) : 0.92;
      if (sm.age >= sm.life) { scene.remove(sm.group); sm.mt.dispose(); sm.geo.dispose(); smokes.splice(i, 1); }
    }
  }

  function clearThrown() {
    nades.forEach((n) => { scene.remove(n.m); n.m.material.dispose(); }); nades.length = 0;
    blasts.forEach((b) => { scene.remove(b.m); b.m.geometry.dispose(); b.m.material.dispose(); }); blasts.length = 0;
    smokes.forEach((sm) => { scene.remove(sm.group); sm.mt.dispose(); sm.geo.dispose(); }); smokes.length = 0;
  }

  // =====================================================================
  // 점수판 (Tab 키 / 모바일은 위쪽 점수 상자를 탭)
  // =====================================================================
  function renderScoreboard() {
    const rows = all().slice().sort((a, b) => (a.team === b.team ? 0 : a.team === 'A' ? -1 : 1) || b.kills - a.kills);
    const body = $('sb-body'); body.innerHTML = '';
    rows.forEach((e) => {
      const tr = document.createElement('tr'); tr.className = e.team === 'A' ? 'a' : 'b';
      [e === P ? (myNick || '나') + ' (나)' : e.name, e.team === 'A' ? '우리' : '상대', e.kills, e.deaths, e.alive ? e.hp : '사망'].forEach((v) => {
        const td = document.createElement('td'); td.textContent = v; tr.appendChild(td);
      });
      body.appendChild(tr);
    });
  }

  // =====================================================================
  // 손에 든 총 (뷰모델)
  // =====================================================================
  function setViewmodel(id) {
    if (vm) { gunScene.remove(vm); (vm.userData.own || []).forEach((m) => m.dispose()); } // 빛나는/무지개 스킨의 전용 재질 정리
    const skin = RivalShop.equippedSkin();
    vm = RivalModels.viewmodel(id, 0x3b82f6, skin.main ? skin : null); // 파란 팀 소매 + 장착한 스킨
    gunScene.add(vm);
  }
  function updateViewmodel(dt, moving) {
    if (!vm) return;
    const g = guns[cur], w = g.w;
    const hip = w.melee || w.util ? [0.2, -0.2, -0.36] : [0.24, -0.25, -0.42], ads = [0, -0.105, -0.34];
    let x = lerp(hip[0], ads[0], adsT), y = lerp(hip[1], ads[1], adsT), z = lerp(hip[2], ads[2], adsT), rx = 0, rz = 0, ry = 0;
    if (moving) { x += Math.sin(now * 8) * 0.008 * (1 - adsT); y += Math.abs(Math.sin(now * 8)) * 0.008 * (1 - adsT); }
    vmKick = Math.max(0, vmKick - dt * 10); z += vmKick * 0.05; rx += vmKick * 0.1;
    if (g.reload && !w.shell) { const p = clamp(g.reload.t / g.reload.total, 0, 1), k = Math.sin(Math.PI * p); y -= 0.13 * k; rz += 0.5 * k; rx -= 0.35 * k; }
    else if (g.reload && w.shell) { const k = 0.5 + 0.5 * Math.sin(now * 12); y -= 0.06; rx -= 0.25; z += 0.02 * k; }
    vmRaise = Math.max(0, vmRaise - dt * 4.5); y -= vmRaise * 0.35;
    if (swingT > 0) { swingT -= dt; const k = Math.sin(Math.PI * (1 - clamp(swingT / 0.22, 0, 1))); rx -= k * 0.9; ry += k * 0.5; x -= k * 0.16; }
    vm.position.set(x, y, z); vm.rotation.set(rx, ry, rz); vm.scale.setScalar(0.88);
    const rb = vm.userData.rainbow; // 무지개 스킨: 색이 계속 바뀜
    if (rb) rb.forEach((m, i) => m.color.setHSL((now * 0.25 + i * 0.13) % 1, 0.85, 0.55));
    vm.visible = P.alive && !(w.scope && adsT > 0.8);
    if (vm.userData.flash) { vm.userData.flash.visible = flashT > 0; if (flashT > 0) flashT -= dt; }
  }

  // =====================================================================
  // HUD
  // =====================================================================
  const hudCache = {};
  function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }
  function renderSlots() {
    const box = $('slots'), tbox = $('touch-slots');
    box.innerHTML = ''; tbox.innerHTML = '';
    guns.forEach((g, i) => {
      const s = document.createElement('div'); s.className = 's' + (i === cur ? ' on' : ''); s.textContent = (i + 1) + ' ' + g.w.name; box.appendChild(s);
      const b = document.createElement('button'); b.className = i === cur ? 'on' : ''; b.textContent = g.w.name;
      b.addEventListener('touchstart', (e) => { e.preventDefault(); switchTo(i); }, { passive: false });
      tbox.appendChild(b);
    });
  }
  function updateHud(dt) {
    const g = guns[cur], w = g.w;
    setText('hp-text', String(P.hp));
    const hf = $('hp-fill'); hf.style.width = P.hp + '%'; hf.style.background = P.hp > 60 ? '#4cd964' : P.hp > 30 ? '#ffcc00' : '#ff3b30';
    setText('ammo-main', w.melee ? '—' : String(g.ammo));
    setText('ammo-name', w.name + (w.melee ? '' : w.util ? (g.ammo > 0 ? ' · 발사 버튼으로 사용' : ' · 사용함') : ' · ' + (g.reload ? '장전 중…' : '∞')));
    const rb = $('reloadbar');
    if (g.reload) { rb.classList.remove('hidden'); rb.firstElementChild.style.width = Math.min(100, g.reload.t / g.reload.total * 100) + '%'; } else rb.classList.add('hidden');
    setText('sc-me', String(match.score.A)); setText('sc-foe', String(match.score.B));
    const t = Math.max(0, Math.ceil(match.timer));
    setText('sc-timer', match.phase === 'live' || match.phase === 'between' ? Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0') : '--');
    setText('sc-round', match.tdm ? '팀 데스매치 · 목표 ' + match.limit + '킬 · ' + aliveCount('A') + ' vs ' + aliveCount('B') + ' 생존' : '라운드 ' + Math.max(1, match.round) + ' · ' + match.wins + '선승 · 생존 ' + aliveCount('A') + ' vs ' + aliveCount('B'));
    // 맞춤 표시 / 피격 화면 / 배너 시간
    if (hmT > 0) { hmT -= dt; if (hmT <= 0) $('hitmark').className = ''; }
    dmgT = Math.max(0, dmgT - dt * 1.4); $('dmgflash').style.opacity = dmgT.toFixed(2);
    $('flashov').style.opacity = clamp(P.flashT / 1.5, 0, 1).toFixed(2);
    $('sb').classList.toggle('hidden', !sbOpen);
    if (sbOpen) { sbT -= dt; if (sbT <= 0) { sbT = 0.3; renderScoreboard(); } }
    if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0 && match.phase === 'live') $('banner').innerHTML = ''; }
    const inRange = match.mode === 'range';
    $('hud-top').style.display = inRange ? 'none' : '';
    $('range-hud').classList.toggle('hidden', !inRange);
    if (inRange) {
      const acc = rangeStats.shots ? Math.round(rangeStats.hits / rangeStats.shots * 100) : 0;
      setText('range-hud', '🎯 명중률 ' + acc + '% (' + rangeStats.hits + '/' + rangeStats.shots + ') · 헤드샷 ' + rangeStats.heads + ' · 처치 ' + rangeStats.kills + ' · 마지막 ' + rangeStats.last + (isTouch ? '  [탭: 초기화]' : '  [T: 초기화]'));
    }
    if (!P.alive && match.phase === 'live' && !inRange) { if (!hudCache.dead) { hudCache.dead = 1; setBanner('사망<small>' + (match.tdm ? '3초 뒤 다시 나와요' : botsApi.bots.some((b) => b.team === 'A' && b.alive) ? '아군 시점으로 관전 중이에요' : '라운드가 끝날 때까지 기다려 주세요') + '</small>', 3); } } else hudCache.dead = 0;
  }

  // =====================================================================
  // 메인 루프
  // =====================================================================
  // 폰을 세로로 들면("가로로 돌려주세요" 안내가 뜰 때) 게임을 멈춤 — 안 멈추면 그 사이에 봇에게 맞음
  const portrait = () => isTouch && window.innerHeight > window.innerWidth;
  const running = () => (((NET.on && match.phase !== 'over') || !!document.pointerLockElement || mobilePlaying)) && !portrait(); // 친선전투는 일시정지가 없음(다른 사람이 계속 움직이니까)

  function update(dt) {
    now += dt;
    updateMatch(dt);
    if (NET.on) netTick(dt);
    updatePlayer(dt);
    updateRange(dt);
    if (match.mode === 'match' && !match.net && match.phase === 'live') botsApi.observePlayer(dt, P);
    botsApi.update(dt, now, match.phase === 'live');
    updateThrown(dt);
    updateFx(dt);
    updateSpectate();
    updateHud(dt);
    $('radar').classList.toggle('hidden', match.mode === 'range');
    if (match.mode !== 'range') drawRadar(dt);
  }

  // 관전: 내가 죽었을 때 살아 있는 아군 시점으로 봄(탭/클릭하면 다음 아군). 아군이 없으면 쓰러진 자리에서 바닥 시점.
  let specIdx = 0, specTarget = null;
  function updateSpectate() {
    let t = null;
    if (!P.alive && match.phase === 'live' && match.mode !== 'range') {
      const allies = botsApi.bots.filter((b) => b.team === 'A' && b.alive);
      if (allies.length) t = allies[((specIdx % allies.length) + allies.length) % allies.length];
    }
    if (t !== specTarget) {
      if (specTarget && specTarget.mesh) specTarget.mesh.root.visible = true; // 이전에 보던 아군 몸 다시 보이게
      specTarget = t;
    }
    if (t) t.mesh.root.visible = false; // 그 아군의 눈 위치에서 보니까 몸이 시야를 가리지 않게 숨김
    const el = $('spec');
    el.classList.toggle('hidden', !t);
    if (t) setText('spec', '👁 관전 중: ' + t.name + (isTouch ? '  (화면을 탭하면 다음 아군)' : '  (클릭하면 다음 아군)'));
  }

  function render() {
    if (specTarget) { camera.position.set(specTarget.x, specTarget.y, specTarget.z); camera.rotation.set(specTarget.pitch, specTarget.yaw, 0); }
    else {
      camera.position.set(P.x, deadCamY, P.z);
      camera.rotation.set(P.pitch + (P.alive ? 0 : -0.5), P.yaw, 0);
    }
    renderer.clear();
    renderer.render(scene, camera);
    if (vm && vm.visible) { renderer.clearDepth(); renderer.render(gunScene, gunCam); }
  }

  function loop(t) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (t - (last || t)) / 1000);
    last = t;
    if (running()) update(dt);
    render();
  }

  // =====================================================================
  // 시작 / 일시정지 / 나가기
  // =====================================================================
  function showOverlay(title, sub, btn) {
    $('ov-title').textContent = title; $('ov-sub').textContent = sub; $('ov-resume').textContent = btn;
    $('overlay').classList.remove('hidden');
    const arm = match.mode === 'range'; // 사격장이면 무기 고르기 목록을 보여줌
    $('ov-arm').classList.toggle('hidden', !arm);
    if (arm) { renderLoadoutInto($('ov-loadout'), $('ov-info'), applyLoadoutInRange); $('ov-info').textContent = weaponInfoText(settings.loadout.primary); }
    Object.keys(keys).forEach((k) => { keys[k] = false; });
    inp.fire = false; inp.adsHold = false; joy.x = joy.y = 0;
  }
  function hideOverlay() { $('overlay').classList.add('hidden'); }

  function enterGame(mode) {
    show('game');
    if (!started) { started = true; initGL(); }
    loadMap(mode === 'range' ? 'warehouse' : settings.map); // 사격장은 항상 창고 맵(과녁 차선이 정해져 있음)
    Sfx.init();
    $('touch-ui').classList.toggle('hidden', !isTouch);
    camera.fov = settings.fov; camera.updateProjectionMatrix();
    mobilePlaying = false;
    $('btn-arm').classList.toggle('hidden', mode !== 'range');
    if (mode === 'range') startRange(); else startMatch();
    last = 0; cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
  }

  function resume() {
    Sfx.init();
    if (match.phase === 'ready') { if (match.net) netReady(); else if (match.mode === 'range') startRangeSession(); else startRound(); }
    if (!isTouch) { try { const pr = $('c').requestPointerLock(); if (pr && pr.catch) pr.catch(() => {}); } catch (e) {} return; } // 잠금 요청이 취소돼도 에러 없이 넘어감
    mobilePlaying = true; hideOverlay();
    try { // 전체화면 + 가로 고정 시도 (아이폰 사파리는 막혀 있어서 실패해도 괜찮음)
      const el = document.documentElement, req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req) Promise.resolve(req.call(el)).catch(() => {});
      if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
    } catch (e) {}
  }

  function leaveGame() {
    cancelAnimationFrame(raf);
    mobilePlaying = false; joy.x = joy.y = 0;
    Object.keys(keys).forEach((k) => { keys[k] = false; });
    inp.fire = false; inp.adsHold = false; inp.adsToggle = false;
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) {}
    if (document.pointerLockElement) document.exitPointerLock();
    if (botsApi) { botsApi.clear(true); clearThrown(); clearRange(); }
    const wasNet = NET.on, finished = match.phase === 'over';
    if (wasNet) { NET.on = false; NET.waiting = false; if (!finished) RivalNet.leave(); } // 경기 중에 나가면 방에서도 나감, 경기가 끝난 뒤면 방으로 돌아감
    match.phase = 'idle'; match.mode = 'match'; match.net = false; match.tdm = false; $('res-again').classList.remove('hidden');
    $('result').classList.add('hidden'); showOverlayHidden();
    if (wasNet && finished && RivalNet.room) { show('screen-friendly'); RivalFriendly.show(); } else enterLobby();
  }
  function showOverlayHidden() { $('overlay').classList.add('hidden'); }

  $('play-btn').onclick = () => enterGame('match');
  $('range-btn').onclick = () => enterGame('range');
  $('ov-resume').onclick = resume;
  $('ov-exit').onclick = leaveGame;
  $('res-lobby').onclick = leaveGame;
  $('res-again').onclick = () => { $('result').classList.add('hidden'); startMatch(); };

  // 친선전투: 마우스가 풀려 있는 채로 화면을 누르면 다시 게임에 잡음 (안 그러면 시점 이동/발사가 안 돼서 "서로 안 쏴져요"가 됨)
  document.addEventListener('click', () => {
    if (!NET.on || isTouch || $('game').classList.contains('hidden') || document.pointerLockElement || match.phase === 'over') return;
    if (!$('overlay').classList.contains('hidden') || !$('result').classList.contains('hidden')) return;
    try { const pr = $('c').requestPointerLock(); if (pr && pr.catch) pr.catch(() => {}); } catch (e) {}
  });
  document.addEventListener('pointerlockchange', () => {
    if ($('game').classList.contains('hidden')) return;
    if (document.pointerLockElement) hideOverlay();
    else if (match.phase !== 'over' && match.phase !== 'idle') showOverlay(match.mode === 'range' ? '🎯 사격장 일시정지' : match.net ? '친선전투 (일시정지 없음 · 게임은 계속돼요)' : '일시정지', '', '계속하기');
  });

  // =====================================================================
  // 입력: 키보드 / 마우스
  // =====================================================================
  const inGame = () => !$('game').classList.contains('hidden');
  document.addEventListener('keydown', (e) => {
    if (!inGame()) return;
    keys[e.code] = true;
    if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
    if (e.code === 'Tab') { sbOpen = true; sbT = 0; }
    if (!document.pointerLockElement) return;
    if (e.code === 'KeyR') doReload();
    else if (e.code === 'Digit1') switchTo(0);
    else if (e.code === 'Digit2') switchTo(1);
    else if (e.code === 'Digit3') switchTo(2);
    else if (e.code === 'Digit4') switchTo(3);
    else if (e.code === 'KeyT' && match.mode === 'range') resetRangeStats();
    else if (e.code === 'KeyQ') switchTo(lastCur);
  });
  document.addEventListener('keyup', (e) => { keys[e.code] = false; if (e.code === 'Tab') sbOpen = false; });
  document.addEventListener('mousemove', (e) => {
    if (!document.pointerLockElement) return;
    const k = 0.0022 * settings.sens * lookMul * (Math.tan(curFov * 0.5 * DEG) / Math.tan(settings.fov * 0.5 * DEG)); // 확대하면 감도도 같이 줄임
    P.yaw -= e.movementX * k;
    P.pitch = clamp(P.pitch - e.movementY * k, -1.5, 1.5);
  });
  document.addEventListener('mousedown', (e) => {
    if (!document.pointerLockElement) return;
    if (e.button === 0) { inp.fire = true; if (!P.alive) specIdx++; } else if (e.button === 2) inp.adsHold = true;
  });
  document.addEventListener('mouseup', (e) => {
    if (e.button === 0) inp.fire = false; else if (e.button === 2) inp.adsHold = false;
  });
  document.addEventListener('contextmenu', (e) => { if (inGame()) e.preventDefault(); });
  document.addEventListener('wheel', (e) => {
    if (!document.pointerLockElement) return;
    switchTo((cur + (e.deltaY > 0 ? 1 : 3)) % 4);
  }, { passive: true });

  // =====================================================================
  // 입력: 모바일 터치
  // =====================================================================
  (function setupTouch() {
    const JOY_R = 58;
    const base = $('joy-base'), knob = $('joy-knob');
    let joyId = null, joyOrigin = null, lookId = null, lookLast = null;
    const applyTouchLook = (dx, dy) => {
      const k = 0.0045 * settings.sens * lookMul * (Math.tan(curFov * 0.5 * DEG) / Math.tan(settings.fov * 0.5 * DEG));
      P.yaw -= dx * k; P.pitch = clamp(P.pitch - dy * k, -1.5, 1.5);
    };
    const findTouch = (list, id) => { for (const t of list) if (t.identifier === id) return t; return null; };

    // 왼쪽: 손가락을 처음 댄 자리가 조이스틱 중심(떠다니는 조이스틱)
    $('joy-zone').addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (joyId !== null) return;
      const t = e.changedTouches[0];
      joyId = t.identifier; joyOrigin = { x: t.clientX, y: t.clientY };
      base.style.left = t.clientX + 'px'; base.style.top = t.clientY + 'px';
      knob.style.transform = 'translate(0,0)'; base.classList.remove('hidden');
    }, { passive: false });
    $('joy-zone').addEventListener('touchmove', (e) => {
      e.preventDefault();
      const t = findTouch(e.changedTouches, joyId);
      if (!t) return;
      let dx = t.clientX - joyOrigin.x, dy = t.clientY - joyOrigin.y;
      const d = Math.hypot(dx, dy);
      if (d > JOY_R) { dx = dx / d * JOY_R; dy = dy / d * JOY_R; }
      knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      joy.x = dx / JOY_R; joy.y = dy / JOY_R;
      const mag = Math.hypot(joy.x, joy.y); if (mag < 0.12) { joy.x = joy.y = 0; } // 살짝 닿은 건 무시(데드존)
    }, { passive: false });
    const joyEnd = (e) => { if (!findTouch(e.changedTouches, joyId)) return; joyId = null; joy.x = joy.y = 0; base.classList.add('hidden'); };
    $('joy-zone').addEventListener('touchend', joyEnd);
    $('joy-zone').addEventListener('touchcancel', joyEnd);

    // 오른쪽: 드래그로 시점 회전
    $('look-zone').addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (!P.alive) specIdx++; // 죽어서 관전 중이면 탭 = 다음 아군
      if (lookId !== null) return;
      const t = e.changedTouches[0];
      lookId = t.identifier; lookLast = { x: t.clientX, y: t.clientY };
    }, { passive: false });
    $('look-zone').addEventListener('touchmove', (e) => {
      e.preventDefault();
      const t = findTouch(e.changedTouches, lookId);
      if (!t || !mobilePlaying) return;
      applyTouchLook(t.clientX - lookLast.x, t.clientY - lookLast.y);
      lookLast = { x: t.clientX, y: t.clientY };
    }, { passive: false });
    const lookEnd = (e) => { if (findTouch(e.changedTouches, lookId)) lookId = null; };
    $('look-zone').addEventListener('touchend', lookEnd);
    $('look-zone').addEventListener('touchcancel', lookEnd);

    // 버튼들
    const hold = (el, down, up) => {
      el.addEventListener('touchstart', (e) => { e.preventDefault(); down(); }, { passive: false });
      const end = (e) => { e.preventDefault(); up(); };
      el.addEventListener('touchend', end, { passive: false });
      el.addEventListener('touchcancel', end, { passive: false });
    };
    // 발사 버튼 두 개(오른쪽/왼쪽). 어느 쪽이든 누르고 있으면 발사, 누른 채로 손가락을 움직이면 시점도 회전.
    const fireHeld = new Set();
    ['btn-fire', 'btn-fire2'].forEach((id) => {
      const el = $(id); let tid = null, last = null;
      el.addEventListener('touchstart', (e) => { e.preventDefault(); const t = e.changedTouches[0]; tid = t.identifier; last = { x: t.clientX, y: t.clientY }; fireHeld.add(id); inp.fire = true; el.classList.add('on'); }, { passive: false });
      el.addEventListener('touchmove', (e) => { e.preventDefault(); const t = findTouch(e.changedTouches, tid); if (!t || !mobilePlaying) return; applyTouchLook(t.clientX - last.x, t.clientY - last.y); last = { x: t.clientX, y: t.clientY }; }, { passive: false });
      const end = (e) => { e.preventDefault(); fireHeld.delete(id); inp.fire = fireHeld.size > 0; el.classList.remove('on'); tid = null; };
      el.addEventListener('touchend', end, { passive: false });
      el.addEventListener('touchcancel', end, { passive: false });
    });
    hold($('btn-jump'), () => { keys['Space'] = true; }, () => { keys['Space'] = false; });
    $('btn-ads').addEventListener('touchstart', (e) => { e.preventDefault(); inp.adsToggle = !inp.adsToggle; $('btn-ads').classList.toggle('on', inp.adsToggle); }, { passive: false });
    $('btn-crouch').addEventListener('touchstart', (e) => { e.preventDefault(); inp.crouch = !inp.crouch; $('btn-crouch').classList.toggle('on', inp.crouch); }, { passive: false });
    $('btn-reload').addEventListener('touchstart', (e) => { e.preventDefault(); doReload(); }, { passive: false });
    $('hud-top').addEventListener('touchstart', (e) => { e.preventDefault(); sbOpen = !sbOpen; sbT = 0; }, { passive: false });
    $('range-hud').addEventListener('touchstart', (e) => { e.preventDefault(); resetRangeStats(); }, { passive: false });
    $('btn-arm').addEventListener('touchstart', (e) => { e.preventDefault(); mobilePlaying = false; joy.x = joy.y = 0; showOverlay('🎯 사격장 일시정지', '', '계속하기'); }, { passive: false });
    $('btn-exit').addEventListener('touchstart', (e) => { e.preventDefault(); if (confirm('매치를 나갈까요? (기록은 저장되지 않아요)')) leaveGame(); }, { passive: false });
  })();


  // =====================================================================
  // 친선전투(온라인): 시작 / 상태 주고받기 / 라운드 진행 / 결과
  // =====================================================================
  function startNet(room) {
    NET.on = true; NET.room = room; NET.host = room.host === myId;
    const me = room.members.find((x) => x.id === myId); NET.myTeam = me ? me.team : 'A';
    const s = room.settings; NET.settings = s;
    show('game');
    if (!started) { started = true; initGL(); }
    loadMap(RivalMap.has(s.map) ? s.map : 'warehouse');
    botsApi.clear(true); clearThrown(); clearRange();
    Sfx.init();
    $('touch-ui').classList.toggle('hidden', !isTouch);
    camera.fov = settings.fov; camera.updateProjectionMatrix();
    mobilePlaying = false; $('btn-arm').classList.add('hidden');
    match.mode = 'match'; match.net = true; match.gear = !!s.gear; match.tdm = s.mode === 'tdm'; match.limit = s.limit || 20;
    match.gear = false; setupGuns(); match.gear = !!s.gear; // 라운드가 시작되기 전에도 손에 들 무기가 있어야 화면 갱신이 안 깨짐
    P.name = myNick || '나'; P.kills = P.deaths = 0;
    match.teamSize = s.size; match.diff = s.diff; match.wins = s.wins;
    match.round = 0; match.score.A = match.score.B = 0; match.kills = match.deaths = 0; match.shots = match.hits = match.heads = 0; match.phase = 'ready';
    $('result').classList.add('hidden'); sbOpen = false; $('feed').innerHTML = ''; setBanner(''); applyCrosshair();
    NET.ids = Object.create(null); NET.ready = new Set(); NET.waiting = false; NET.readyT = 0; NET.sendT = NET.bsT = NET.phT = 0;
    room.members.forEach((mm) => {
      if (mm.id === myId) return;
      const e = botsApi.spawn({ netId: mm.id, name: mm.nick, team: lt(mm.team), human: true, persist: true, remote: true, diff: 'normal', x: 0, z: 0, yaw: 0, primary: 'ar' });
      e.alive = false; e.mesh.root.visible = false; // 라운드가 시작되고 첫 위치를 받을 때까지 숨김
      NET.ids[mm.id] = e;
    });
    showOverlay('🤝 친선전투', world.name + ' · ' + s.size + ' vs ' + s.size + ' · ' + s.wins + '선승 · ' + (s.ai ? 'AI ' + botsApi.DIFFS[s.diff].name : 'AI 없음') + (s.gear ? ' · 무기 랜덤' : '') + ' — 준비되면 눌러 주세요', '입장');
    last = 0; cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
  }

  // 라운드가 시작됐는데 아직 "입장"을 안 눌러서 마우스가 게임에 잡혀 있지 않으면(= 조준/발사가 안 됨) 안내창을 남겨 둠
  function netOverlay() {
    const active = isTouch ? mobilePlaying : !!document.pointerLockElement;
    if (active) hideOverlay(); else showOverlay('🤝 경기가 시작됐어요!', isTouch ? '화면을 눌러 입장하세요' : '버튼을 눌러 입장하세요 (마우스가 게임에 잡혀야 조준하고 쏠 수 있어요)', '▶ 눌러서 입장');
  }

  function netReady() { // "입장" 버튼: 나는 준비됨. 방장은 모두 준비되면(최대 20초) 첫 라운드를 시작
    setBanner(NET.host ? '다른 사람을 기다리는 중…' : '방장이 시작하길 기다리는 중…', 0);
    if (NET.host) { NET.ready.add(myId); NET.waiting = true; NET.readyT = 0; } else RivalNet.relay('host', 'rdy', {});
  }

  function broadcastPhase() { relay('all', 'ph', { p: match.phase, r: match.round, t: Math.round(match.timer), pt: r2(match.phaseT), s: scoreRoom() }); }

  // 방장: 새 라운드 (사람 자리 배정 + 봇 소환 + 모두에게 알림)
  function startRoundNet() {
    match.round++;
    match.phase = 'countdown'; match.phaseT = COUNTDOWN; match.lastCount = 99;
    botsApi.clear(); clearThrown(); P.flashT = 0; specTarget = null; specIdx = 0;
    const s = NET.settings, members = (RivalNet.room && RivalNet.room.members) || NET.room.members;
    const sp = { A: shuffle(world.spawns.A.slice()), B: shuffle(world.spawns.B.slice()) }, used = { A: 0, B: 0 };
    const nextSpawn = (t) => sp[t][used[t]++ % sp[t].length];
    const assign = {};
    members.forEach((mm) => { const p = nextSpawn(mm.team); assign[mm.id] = { x: p.x, z: p.z, yaw: p.yaw }; });
    placePlayer(assign[myId] || nextSpawn(NET.myTeam));
    setupGuns();
    members.forEach((mm) => {
      const e = NET.ids[mm.id]; if (!e) return;
      const a = assign[mm.id]; botsApi.revive(e); e.team = lt(mm.team);
      botsApi.setRemote(e, { x: a.x, y: EYE, z: a.z, yaw: a.yaw, pitch: 0, eye: EYE }, true);
    });
    const roster = [], names = shuffle(botsApi.NAMES.slice());
    if (s.ai) ['A', 'B'].forEach((t) => {
      const n = s.size - members.filter((mm) => mm.team === t).length;
      for (let i = 0; i < n; i++) {
        const p = nextSpawn(t), b = botsApi.spawn({ team: lt(t), name: '🤖' + names.pop(), diff: s.diff, x: p.x, z: p.z, yaw: p.yaw, noLearn: true });
        roster.push({ id: b.id, team: t, name: b.name, x: p.x, z: p.z, yaw: p.yaw, g: b.gun.id });
      }
    });
    relay('all', 'rs', { r: match.round, a: assign, b: roster });
    broadcastPhase();
  }
  const pickSpawn = (roomTeam) => { const l = world.spawns[roomTeam]; return l[Math.floor(Math.random() * l.length)]; };
  function respawnSelf() {
    const p = pickSpawn(NET.myTeam);
    placePlayer(p); P.flashT = 0; setupGuns(); setBanner('');
    relay('all', 'rv', { id: myId, x: p.x, z: p.z, yaw: p.yaw });
  }
  function placePlayer(p) {
    spawnPoint = p; inp.crouch = false; $('btn-crouch').classList.remove('on');
    Object.assign(P, { x: p.x, y: EYE, eye: EYE, z: p.z, vy: 0, onGround: true, yaw: p.yaw, pitch: 0, hp: 100, alive: true, firedT: 0 });
    deadCamY = EYE; recoilAcc = 0;
  }
  // 참가자: 방장이 알려준 라운드 시작
  function netRoundStart(d) {
    match.round = d.r; match.phase = 'countdown'; match.phaseT = COUNTDOWN; match.lastCount = 99;
    botsApi.clear(); clearThrown(); P.flashT = 0; specTarget = null; specIdx = 0;
    const members = (RivalNet.room && RivalNet.room.members) || NET.room.members;
    placePlayer(d.a[myId] || { x: 0, z: NET.myTeam === 'A' ? 27 : -27, yaw: NET.myTeam === 'A' ? 0 : Math.PI });
    setupGuns();
    members.forEach((mm) => {
      const e = NET.ids[mm.id], a = d.a[mm.id]; if (!e || !a) return;
      botsApi.revive(e); e.team = lt(mm.team);
      botsApi.setRemote(e, { x: a.x, y: EYE, z: a.z, yaw: a.yaw, pitch: 0, eye: EYE }, true);
    });
    (d.b || []).forEach((b) => botsApi.spawn({ netId: b.id, name: b.name, team: lt(b.team), remote: true, diff: 'normal', x: b.x, z: b.z, yaw: b.yaw, primary: W.list[b.g] ? b.g : 'ar' }));
    netOverlay();
  }
  function netRoundEnd(d) {
    match.phase = 'between'; match.phaseT = BETWEEN;
    match.score.A = d.s[NET.myTeam]; match.score.B = d.s[NET.myTeam === 'A' ? 'B' : 'A'];
    const winner = d.w ? lt(d.w) : null, mine = winner === 'A';
    if (winner) (mine ? Sfx.win : Sfx.lose)();
    setBanner((winner ? (mine ? '🏆 라운드 승리!' : '라운드 패배') : '무승부') + '<small>' + String(d.why || '').slice(0, 60) + ' · ' + match.score.A + ' : ' + match.score.B + '</small>', BETWEEN);
    inp.fire = false;
  }
  function showNetResult(sc) {
    if (sc) { match.score.A = sc[NET.myTeam]; match.score.B = sc[NET.myTeam === 'A' ? 'B' : 'A']; }
    match.phase = 'over'; setBanner('');
    if (document.pointerLockElement) document.exitPointerLock();
    const a = match.score.A, b = match.score.B;
    $('res-title').textContent = a > b ? '🏆 승리!' : a < b ? '패배' : '무승부';
    $('res-score').textContent = (match.tdm ? '팀 킬 ' : '라운드 ') + a + ' : ' + b + (match.shots ? ' · 명중률 ' + Math.round(100 * match.hits / match.shots) + '% · 헤드샷 ' + match.heads : '');
    $('res-stats').textContent = '이번 경기: ' + match.kills + '킬 ' + match.deaths + '데스 · 친선전투라서 기록/코인은 없어요';
    $('res-coins').textContent = '';
    $('res-again').classList.add('hidden'); $('res-lobby').textContent = '방으로 돌아가기';
    $('result').classList.remove('hidden');
  }

  // 매 프레임: 내 상태 보내기(약 15번/초), 방장은 봇 상태/단계 보내기, 방장은 모두 준비됐는지 확인
  function netTick(dt) {
    NET.sendT -= dt;
    if (NET.sendT <= 0) { NET.sendT = 0.066; relay('all', 'st', { x: r2(P.x), y: r2(P.y), z: r2(P.z), a: r2(P.yaw), p: r2(P.pitch), e: r2(P.eye), h: P.hp, l: P.alive ? 1 : 0 }); }
    if (match.tdm && match.phase === 'live') { // 팀 데스매치: 죽으면 3초 뒤 같은 팀 자리에서 다시 나옴
      if (!P.alive) { NET.respT -= dt; if (NET.respT <= 0) respawnSelf(); }
      if (NET.host) botsApi.bots.forEach((b) => { if (!b.remote && b.isBot && !b.alive && b.deadT > 3) { const p = pickSpawn(b.team === 'A' ? NET.myTeam : rtOf('B')); botsApi.respawn(b, p); relay('all', 'rv', { id: b.id, x: p.x, z: p.z, yaw: p.yaw }); } });
    }
    if (!NET.host) return;
    NET.bsT -= dt;
    if (NET.bsT <= 0 && botsApi.bots.length) {
      NET.bsT = 0.1;
      const list = [];
      botsApi.bots.forEach((b) => { if (!b.remote && b.isBot) list.push([b.id, r2(b.x), r2(b.y), r2(b.z), r2(b.yaw), r2(b.pitch), b.hp, b.alive ? 1 : 0]); });
      if (list.length) relay('all', 'bs', list);
    }
    NET.phT -= dt; if (NET.phT <= 0) { NET.phT = 1; if (match.phase !== 'ready') broadcastPhase(); }
    if (NET.waiting && match.phase === 'ready') {
      NET.readyT += dt;
      const need = ((RivalNet.room && RivalNet.room.members) || NET.room.members).length;
      if (NET.ready.size >= need || NET.readyT > 10) { NET.waiting = false; startRoundNet(); netOverlay(); }
    }
  }

  // 다른 기기에서 온 메시지
  function netMsg(from, t, d) {
    if (!NET.on || !d) return;
    switch (t) {
      case 'st': { const e = NET.ids[from]; if (!e) break; botsApi.setRemote(e, { x: +d.x, y: +d.y, z: +d.z, yaw: +d.a, pitch: +d.p, eye: +d.e }, false); e.hp = +d.h || 0; break; }
      case 'bs': {
        if (NET.host || !Array.isArray(d)) break;
        d.forEach((r) => { const e = botsApi.bots.find((b) => b.id === r[0]); if (!e) return; botsApi.setRemote(e, { x: r[1], y: r[2], z: r[3], yaw: r[4], pitch: r[5], eye: EYE }, false); e.hp = r[6]; });
        break;
      }
      case 'fire': netFire(d); break;
      case 'hit': { // 내가(또는 방장이 봇 대신) 맞았다는 알림
        const att = entById(d.f) || { name: '?', team: 'B', x: P.x, y: P.y, z: P.z, yaw: 0 };
        const wdef = W.list[d.w] || W.list.ar;
        const dmg = Math.min(200, Math.max(1, +d.d || 1));
        if (d.b) { if (!NET.host) break; const bot = botsApi.bots.find((b) => b.id === d.b && !b.remote); if (bot) damage(bot, dmg, !!d.h, att, wdef); }
        else damage(P, dmg, !!d.h, att, wdef);
        break;
      }
      case 'dead': netDead(d); break;
      case 'nade': {
        const w = W.list[d.w], owner = entById(d.o); if (!w || !w.util || !owner || !Array.isArray(d.p) || !Array.isArray(d.v)) break;
        if (!nadeGeo) nadeGeo = new THREE.SphereGeometry(0.08, 10, 8);
        const mesh = new THREE.Mesh(nadeGeo, new THREE.MeshLambertMaterial({ color: NADE_COLOR[w.util] })); scene.add(mesh);
        nades.push({ w, type: w.util, x: d.p[0], y: d.p[1], z: d.p[2], vx: d.v[0], vy: d.v[1], vz: d.v[2], t: w.fuse, m: mesh, owner });
        break;
      }
      case 'rv': { const e = entById(d.id); if (e && e !== P && e.remote) { botsApi.revive(e); botsApi.setRemote(e, { x: d.x, y: EYE, z: d.z, yaw: d.yaw, pitch: 0, eye: EYE }, true); } break; }
      case 'rdy': if (NET.host) NET.ready.add(from); break;
      case 'rs': if (!NET.host) netRoundStart(d); break;
      case 'ph': {
        if (NET.host) break;
        const prev = match.phase; match.round = d.r; match.timer = d.t; match.phaseT = d.pt;
        match.score.A = d.s[NET.myTeam]; match.score.B = d.s[NET.myTeam === 'A' ? 'B' : 'A'];
        if (d.p !== prev && prev !== 'over') { match.phase = d.p; if (d.p === 'live') { Sfx.beep(true); setBanner('시작!', 0.8); } }
        break;
      }
      case 'er': if (!NET.host) netRoundEnd(d); break;
      case 'ov': if (!NET.host) showNetResult(d.s); break;
      default: break;
    }
  }

  // 남이 쏜 총: 소리와 총알 궤적만 보여줌 (맞았는지는 쏜 사람이 계산해서 따로 알려 줌)
  function netFire(d) {
    const e = entById(d.i); if (!e || e === P || !Array.isArray(d.o) || !Array.isArray(d.d)) return;
    const w = W.list[d.w] || W.list.ar;
    e.firedT = 0.8; e.muzzleT = 0.05;
    const dist = Math.hypot(e.x - P.x, e.y - P.y, e.z - P.z);
    Sfx.shot(w.sfx, Math.max(0, 1 - dist / 60) * 0.7);
    const dl = Math.hypot(d.d[0], d.d[1], d.d[2]) || 1, dx = d.d[0] / dl, dy = d.d[1] / dl, dz = d.d[2] / dl;
    const t = Math.min(isFinite(phys.rayBoxes(d.o[0], d.o[1], d.o[2], dx, dy, dz, 80)) ? phys.rayBoxes(d.o[0], d.o[1], d.o[2], dx, dy, dz, 80) : 80, 80);
    const mz = muzzlePos(e, dx, dy, dz);
    tracer(mz[0], mz[1], mz[2], d.o[0] + dx * t, d.o[1] + dy * t, d.o[2] + dz * t);
  }

  // 남(또는 방장의 봇)이 죽었다는 알림
  function netDead(d) {
    const v = entById(d.v), k = entById(d.k);
    if (!v || v === P || !v.alive) return;
    v.alive = false; v.hp = 0; v.deaths++;
    if (k && k !== v) k.kills++;
    const w = W.list[d.w] || W.list.ar;
    if (k === P && k !== v) { match.kills++; Sfx.kill(); if (d.h) match.heads++; }
    feed(k === v ? v.name + '  [' + w.name + ' 자폭]' : (k ? k.name : '?') + '  [' + w.name + (d.h ? ' · 헤드샷' : '') + ']  ' + v.name, k === P || v === P);
    if (match.tdm) tdmScore(v, k); else checkRoundEnd();
  }

  RivalNet.on('msg', netMsg);
  RivalNet.on('left', (id, nick) => { // 경기 중 누가 나감
    if (!NET.on) return;
    const e = NET.ids[id]; if (e) { e.alive = false; e.mesh.root.visible = false; feed((nick || '?') + '님이 나갔어요', false); delete NET.ids[id]; const i = botsApi.bots.indexOf(e); if (i >= 0) { botsApi.bots.splice(i, 1); e.mesh.root.parent && e.mesh.root.parent.remove(e.mesh.root); } checkRoundEnd(); }
  });
  RivalNet.on('ended', (reason) => { // 방장이 나가는 등으로 경기가 끝남
    if (!NET.on || match.phase === 'over') return;
    match.phase = 'over'; leaveGame(); if (reason) RivalFriendly.toast(reason); // 방은 그대로 남아 있으니 방 화면으로
  });
  RivalNet.on('status', (ok) => { if (!ok && NET.on && match.phase !== 'over') { match.phase = 'over'; leaveGame(); RivalFriendly.toast('서버와 연결이 끊겨서 경기가 끝났어요'); } });
  if (window.RivalFriendly) RivalFriendly.startNet = startNet;

  // 다른 창/탭으로 갔다 오면 키보드/버튼이 눌린 채로 남을 수 있어서 전부 해제
  const releaseInputs = () => { Object.keys(keys).forEach((k) => { keys[k] = false; }); inp.fire = false; inp.adsHold = false; joy.x = joy.y = 0; sbOpen = false; };
  window.addEventListener('blur', releaseInputs);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseInputs(); });

  // 주소 끝에 ?debug 를 붙였을 때만 테스트용으로 내부 상태를 노출
  if (DEBUG) {
    window.__rival = {
      P, keys, inp, boxes, match, W, joy, NET, get now() { return now; },
      get guns() { return guns; }, get cur() { return cur; }, get bots() { return botsApi.bots; },
      all, switchTo, doReload, startRound, castRay, get nav() { return botsApi.nav; },
      get ads() { return adsT; }, botStats, get vm() { return vm; }, shop: RivalShop, get spec() { return specTarget; }, settings, get world() { return world; }, loadMap, get curMap() { return curMap; }, mem: () => ({ children: scene.children.length, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, nades: nades.length, smokes: smokes.length, blasts: blasts.length }), step: (n, dt) => { for (let i = 0; i < n; i++) update(dt); }, rangeStats, startRangeSession, resetRangeStats, nades, smokes, blasts, smoked, get sbOpen() { return sbOpen; },
    };
  }

  // ---- 시작 ----
  RivalShop.init({ getWeapon: () => settings.loadout.primary, onChange: applyCrosshair });
  applyCrosshair();
  initSettingsUI();
  if (myNick) {
    // 저장된 닉네임을 서버에 다시 등록(서버가 재시작돼 기록이 날아갔어도 복구)
    api('/join', { id: myId, nick: myNick }).then((r) => { myStats = r.stats; enterLobby(); }).catch((e) => {
      // 서버가 재시작돼서 다른 사람이 같은 닉네임을 먼저 쓴 경우 등
      show('screen-nick'); $('nick-input').value = myNick;
      $('nick-err').textContent = /이미/.test(e.message) ? '"' + myNick + '" 닉네임을 다른 사람이 쓰고 있어요. 다른 닉네임을 정해 주세요.' : '서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요. (' + e.message + ')';
    });
  } else {
    show('screen-nick');
  }
})();
