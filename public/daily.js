// MyRivals 출석 체크 + 오늘의 미션.
// 기록은 이 브라우저(localStorage 'rival_daily')에만 저장돼요. 기기 날짜를 바꾸면 속일 수 있지만 혼자 즐기는 꾸미기용이라 괜찮아요.
(function () {
  const KEY = 'rival_daily';
  const $ = (id) => document.getElementById(id);

  // 7일 주기 출석 보상. boost: coin2(코인 2배 N경기), shield(출석 보호권)
  const REWARDS = [
    { coins: 50 },
    { coins: 70 },
    { coins: 100, boost: { coin2: 1 } },
    { coins: 130 },
    { coins: 170, boost: { shield: 1 } },
    { coins: 220 },
    { coins: 400, boost: { coin2: 3, shield: 1 } },
  ];
  // 연속 일수를 채우면 받는 한정 스킨 (shop.js 의 exclusive)
  const MILESTONES = [{ days: 7, skin: 'streak7' }, { days: 14, skin: 'streak14' }, { days: 30, skin: 'streak30' }];

  // 미션 후보: stat 은 main.js 가 알려주는 종류, goals 는 난이도(쉬움/보통/어려움)별 목표, rewards 는 그에 맞는 코인
  const POOL = [
    { stat: 'kills', text: (n) => '적 ' + n + '명 처치하기', goals: [8, 15, 25], rewards: [40, 70, 110] },
    { stat: 'heads', text: (n) => '헤드샷 ' + n + '번 맞히기', goals: [3, 6, 10], rewards: [50, 80, 120] },
    { stat: 'wins', text: (n) => '매치 ' + n + '번 이기기', goals: [1, 2, 3], rewards: [60, 100, 150] },
    { stat: 'matches', text: (n) => '매치 ' + n + '번 끝까지 하기', goals: [1, 2, 3], rewards: [40, 70, 100] },
    { stat: 'nades', text: (n) => '수류탄으로 ' + n + '명 처치하기', goals: [1, 2, 4], rewards: [60, 100, 160] },
  ];

  function dayNum(str) { const [y, m, d] = str.split('-').map(Number); return Math.floor(Date.UTC(y, m - 1, d) / 86400000); }
  const today = () => { const t = new Date(), p = (n) => String(n).padStart(2, '0'); return t.getFullYear() + '-' + p(t.getMonth() + 1) + '-' + p(t.getDate()); };
  const okDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

  function load() {
    const d = { v: 1, last: null, streak: 0, claimed: null, total: 0, missions: { date: null, list: [] } };
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (raw && typeof raw === 'object') {
        if (okDate(raw.last)) d.last = raw.last;
        if (okDate(raw.claimed)) d.claimed = raw.claimed;
        if (Number.isFinite(raw.streak)) d.streak = Math.max(0, Math.min(9999, Math.floor(raw.streak)));
        if (Number.isFinite(raw.total)) d.total = Math.max(0, Math.min(99999, Math.floor(raw.total)));
        const ms = raw.missions;
        if (ms && okDate(ms.date) && Array.isArray(ms.list)) {
          d.missions.date = ms.date;
          d.missions.list = ms.list.slice(0, 3).map((m) => ({ stat: POOL.some((p) => p.stat === m.stat) ? m.stat : 'kills', goal: Math.max(1, Math.min(999, Math.floor(+m.goal || 1))), reward: Math.max(0, Math.min(999, Math.floor(+m.reward || 0))), progress: Math.max(0, Math.min(9999, Math.floor(+m.progress || 0))), claimed: m.claimed === true }));
        }
      }
    } catch (e) {}
    return d;
  }
  let data = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} };

  // 오늘의 미션 3개: 날짜로 정해져서 하루 동안은 같음 (종류 3가지 + 난이도 섞임)
  function rollMissions(date) {
    let s = dayNum(date) * 2654435761 % 2147483647 || 1;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const pool = POOL.slice(); const list = [];
    for (let i = 0; i < 3; i++) {
      const p = pool.splice(Math.floor(rnd() * pool.length), 1)[0], lv = i; // 첫 번째는 쉬움, 두 번째 보통, 세 번째 어려움
      list.push({ stat: p.stat, goal: p.goals[lv], reward: p.rewards[lv], progress: 0, claimed: false });
    }
    return list;
  }

  // 출석: 오늘 처음이면 연속 일수를 갱신. 어제 빠졌다면 출석 보호권으로 이어 붙일 수 있음.
  function checkIn() {
    const t = today();
    if (data.missions.date !== t) { data.missions = { date: t, list: rollMissions(t) }; save(); }
    if (data.last === t) return false;
    if (data.last && dayNum(t) < dayNum(data.last)) return false; // 기기 날짜가 과거로 돌아감: 무시
    let note = '';
    if (!data.last) data.streak = 1;
    else {
      const gap = dayNum(t) - dayNum(data.last), missed = gap - 1;
      if (missed <= 0) data.streak += 1;
      else if (missed <= window.RivalShop.boosts().shield) { for (let i = 0; i < missed; i++) window.RivalShop.useShield(); data.streak += 1; note = '출석 보호권 ' + missed + '장으로 연속 출석을 지켰어요!'; }
      else data.streak = 1;
    }
    data.last = t; data.note = note; save();
    return true;
  }

  const pending = () => data.last === today() && data.claimed !== today();
  const dayIndex = () => ((Math.max(1, data.streak) - 1) % 7);

  function claimToday() {
    if (!pending()) return null;
    const r = REWARDS[dayIndex()], got = [];
    window.RivalShop.addCoins(r.coins); got.push('💰 ' + r.coins);
    if (r.boost) Object.keys(r.boost).forEach((k) => { window.RivalShop.addBoost(k, r.boost[k]); got.push((k === 'coin2' ? '코인 2배 ' + r.boost[k] + '경기' : '출석 보호권 ' + r.boost[k] + '장')); });
    MILESTONES.forEach((m) => { if (data.streak >= m.days && window.RivalShop.grant(m.skin)) got.push('🎁 한정 스킨!'); });
    data.claimed = today(); data.total++; save();
    return got;
  }

  // main.js 가 알려주는 기록: stat 은 kills/heads/wins/matches/nades
  function add(stat, n) {
    const t = today(); if (data.missions.date !== t) { data.missions = { date: t, list: rollMissions(t) }; }
    data.missions.list.forEach((m) => { if (m.stat === stat && !m.claimed) m.progress = Math.min(9999, m.progress + (n || 1)); });
    save(); updateBadge();
  }
  function claimMission(i) {
    const m = data.missions.list[i]; if (!m || m.claimed || m.progress < m.goal) return false;
    m.claimed = true; window.RivalShop.addCoins(m.reward); save(); updateBadge(); return true;
  }
  const claimable = () => data.missions.list.filter((m) => !m.claimed && m.progress >= m.goal).length;

  // ---- 화면 ----
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  function updateBadge() {
    const b = $('daily-badge'); if (!b) return;
    const n = (pending() ? 1 : 0) + claimable();
    b.textContent = n ? ' ●' + n : ''; b.style.color = '#ffcc00';
  }
  function render() {
    $('daily-streak').textContent = data.streak ? '🔥 연속 ' + data.streak + '일째 출석!' : '아직 출석 기록이 없어요';
    $('daily-note').textContent = data.note || '';
    const grid = $('daily-days'); grid.innerHTML = '';
    const cur = dayIndex();
    REWARDS.forEach((r, i) => {
      const done = data.streak > 0 && (i < cur || (i === cur && !pending()));
      const d = el('div', 'dd' + (i === cur ? ' cur' : '') + (done ? ' done' : '') + (i === 6 ? ' big' : ''));
      d.appendChild(el('b', '', (i + 1) + '일'));
      d.appendChild(el('span', '', '💰' + r.coins));
      if (r.boost) d.appendChild(el('small', '', Object.keys(r.boost).map((k) => (k === 'coin2' ? '×2 ' + r.boost[k] : '🛡' + r.boost[k])).join(' ')));
      if (done) d.appendChild(el('i', 'ck', '✔'));
      grid.appendChild(d);
    });
    const next = MILESTONES.find((m) => data.streak < m.days);
    $('daily-miles').textContent = next ? '🎁 ' + next.days + '일 연속 출석하면 한정 스킨! (지금 ' + data.streak + '일)' : '🏆 모든 출석 한정 스킨을 모았어요!';
    const btn = $('daily-claim');
    btn.disabled = !pending();
    btn.textContent = pending() ? '오늘 보상 받기 (' + (dayIndex() + 1) + '일차)' : '오늘은 이미 받았어요 ✔';
    btn.onclick = () => { const got = claimToday(); if (got) $('daily-note').textContent = '받았어요: ' + got.join(' · '); render(); updateBadge(); };
    const box = $('daily-missions'); box.innerHTML = '';
    data.missions.list.forEach((m, i) => {
      const def = POOL.find((p) => p.stat === m.stat) || POOL[0];
      const row = el('div', 'dm' + (m.claimed ? ' done' : ''));
      row.appendChild(el('span', 'dt', def.text(m.goal)));
      const bar = el('div', 'bar'); const fill = el('i'); fill.style.width = Math.min(100, Math.round(100 * m.progress / m.goal)) + '%'; bar.appendChild(fill); row.appendChild(bar);
      row.appendChild(el('small', '', Math.min(m.progress, m.goal) + ' / ' + m.goal));
      const b = el('button', 'btn small', m.claimed ? '완료' : '💰' + m.reward + ' 받기');
      b.disabled = m.claimed || m.progress < m.goal;
      b.onclick = () => { if (claimMission(i)) render(); };
      row.appendChild(b); box.appendChild(row);
    });
    RivalShop.refreshBadge();
  }
  function open() { checkIn(); render(); $('daily').classList.remove('hidden'); updateBadge(); }
  function close() { $('daily').classList.add('hidden'); updateBadge(); }

  function init() {
    $('daily-btn').onclick = open;
    $('daily-close').onclick = close;
    checkIn(); updateBadge();
  }
  // 로비에 들어왔을 때: 새 날이면 출석창을 자동으로 보여줌 (한 번만)
  let shown = false;
  function lobbyEntered() { checkIn(); updateBadge(); if (!shown && pending()) { shown = true; open(); } }

  window.RivalDaily = { init, open, close, add, lobbyEntered, REWARDS, MILESTONES, _data: () => data, _reset: () => { data = load(); }, _today: today };
})();
