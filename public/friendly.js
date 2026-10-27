// MyRivals 친선전투 화면: 접속자 목록 / 초대 / 방(팀 칸, 설정) / 채팅. 서버와의 통신은 net.js (RivalNet).
(function () {
  const $ = (id) => document.getElementById(id);
  const N = window.RivalNet;
  const DIFF_NAMES = { rookie: '입문', easy: '쉬움', normal: '보통', hard: '어려움', insane: '지옥' };
  const ST = { idle: '대기 중', inroom: '방에 있음', ingame: '경기 중' };
  let opened = false, pendingInvite = null;
  const F = { onBack: null, startNet: null };

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }; // textContent: 닉네임에 HTML이 있어도 글자로만 표시됨
  const myRoom = () => N.room;
  const iAmHost = () => N.room && N.room.host === N.id;
  const countTeam = (r, t) => r.members.filter((m) => m.team === t).length;

  function showScreen() {
    document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
    $('screen-friendly').classList.remove('hidden');
    opened = true; render();
  }
  function back() { opened = false; $('screen-friendly').classList.add('hidden'); if (F.onBack) F.onBack(); }

  function toast(msg) {
    const t = $('fr-toast'); t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), 3000);
  }

  // ---- 접속자 목록 ----
  function renderOnline() {
    const box = $('fr-online'); box.innerHTML = '';
    const others = N.online.filter((p) => p.id !== N.id);
    $('fr-online-empty').classList.toggle('hidden', others.length > 0);
    others.forEach((p) => {
      const row = el('div', 'fr-row');
      row.appendChild(el('b', '', p.nick));
      row.appendChild(el('span', 'hint', ST[p.st] || ''));
      const r = myRoom();
      const b = el('button', 'btn small', '초대');
      b.disabled = (r && r.state !== 'lobby') || p.st !== 'idle';
      b.onclick = () => { if (r) N.invite(p.id); else { pendingInvite = p.id; N.createRoom(); } }; // 방이 없으면 방을 만들면서 바로 초대
      row.appendChild(b);
      box.appendChild(row);
    });
  }

  // ---- 방 ----
  let settingsBuilt = false;
  function buildSettings() {
    if (settingsBuilt) return; settingsBuilt = true;
    const mapSel = $('fr-map'); mapSel.innerHTML = '';
    window.RivalMap.list().forEach((m) => { const o = el('option', '', m.name); o.value = m.id; mapSel.appendChild(o); });
    const push = () => N.setSettings({
      map: $('fr-map').value, size: +$('fr-size').value, wins: +$('fr-wins').value, ai: $('fr-ai').checked, diff: $('fr-diff').value, gear: $('fr-gear').checked, mode: $('fr-mode').value, limit: +$('fr-limit').value,
    });
    ['fr-map', 'fr-size', 'fr-wins', 'fr-diff', 'fr-mode', 'fr-limit'].forEach((id) => { $(id).onchange = push; });
    ['fr-ai', 'fr-gear'].forEach((id) => { $(id).onchange = push; });
  }

  function slot(team, idx, m, r) {
    const host = iAmHost();
    const s = el('div', 'fr-slot' + (m ? ' filled' : ''));
    if (m) {
      s.appendChild(el('b', '', m.nick + (m.id === r.host ? ' 👑' : '') + (m.id === N.id ? ' (나)' : '')));
      if (host && m.id !== N.id) {
        const tools = el('span', 'fr-tools');
        const mv = el('button', 'mini', '↔'); mv.title = '다른 팀으로'; mv.onclick = (e) => { e.stopPropagation(); N.moveMember(m.id, team === 'A' ? 'B' : 'A'); };
        const hs = el('button', 'mini', '👑'); hs.title = '방장 넘기기'; hs.onclick = (e) => { e.stopPropagation(); N.giveHost(m.id); };
        const kk = el('button', 'mini', '✕'); kk.title = '내보내기'; kk.onclick = (e) => { e.stopPropagation(); N.kick(m.id); };
        tools.appendChild(mv); tools.appendChild(hs); tools.appendChild(kk); s.appendChild(tools);
      }
    } else {
      const me = r.members.find((x) => x.id === N.id);
      const canJoin = me && me.team !== team && countTeam(r, team) < r.settings.size;
      s.textContent = r.settings.ai ? '🤖 AI 자리' : '빈 자리';
      if (canJoin) { s.classList.add('can'); s.title = '여기로 옮기기'; s.onclick = () => N.setTeam(team); s.appendChild(el('small', '', ' (눌러서 이 팀으로)')); }
    }
    return s;
  }

  function renderRoom() {
    const r = myRoom();
    $('fr-noroom').classList.toggle('hidden', !!r);
    $('fr-room').classList.toggle('hidden', !r);
    if (!r) return;
    buildSettings();
    $('fr-code').textContent = r.code;
    const nA = countTeam(r, 'A'), nB = countTeam(r, 'B');
    $('fr-hint').textContent = nA + nB < 2 ? '친구를 초대하거나 코드를 알려 주세요.' : nA && nB ? '👊 서로 다른 팀이라 서로 싸워요.' : '🤝 모두 같은 팀이라 서로 못 쏴요. 서로 싸우려면 한 명이 반대 팀 칸을 눌러 옮기세요.';
    ['A', 'B'].forEach((team) => {
      const col = $('fr-team' + team); col.innerHTML = '';
      const ms = r.members.filter((m) => m.team === team);
      for (let i = 0; i < r.settings.size; i++) col.appendChild(slot(team, i, ms[i], r));
    });
    const host = iAmHost(), s = r.settings;
    $('fr-map').value = s.map; $('fr-size').value = String(s.size); $('fr-wins').value = String(s.wins);
    $('fr-ai').checked = s.ai; $('fr-diff').value = s.diff; $('fr-gear').checked = s.gear;
    $('fr-mode').value = s.mode; $('fr-limit').value = String(s.limit);
    $('fr-winsrow').classList.toggle('hidden', s.mode === 'tdm'); $('fr-limitrow').classList.toggle('hidden', s.mode !== 'tdm');
    ['fr-map', 'fr-size', 'fr-wins', 'fr-ai', 'fr-diff', 'fr-gear', 'fr-mode', 'fr-limit'].forEach((id) => { $(id).disabled = !host; });
    $('fr-diff').disabled = !host || !s.ai;
    $('fr-start').classList.toggle('hidden', !host);
    $('fr-wait').classList.toggle('hidden', host);
    const a = countTeam(r, 'A'), b = countTeam(r, 'B');
    $('fr-start').disabled = !s.ai && (!a || !b);
    $('fr-start').textContent = !s.ai && (!a || !b) ? 'AI를 끄면 양 팀에 사람이 필요해요' : '▶ 경기 시작';
  }

  function updateBadge() { const badge = $('friendly-badge'); if (badge) badge.textContent = N.connected ? '· ' + Math.max(0, N.online.length - 1) + '명 접속 중' : ''; }
  function render() { updateBadge(); if (!opened) return; $('fr-status').textContent = N.connected ? '🟢 연결됨' : '🔴 연결 중…'; renderOnline(); renderRoom(); }

  // ---- 초대 알림 (어느 화면에서든 위에 뜸) ----
  function renderInvites() {
    const box = $('invite-toast'); box.innerHTML = '';
    N.invites = N.invites.filter((i) => Date.now() - i.t < 60000);
    N.invites.forEach((inv) => {
      const row = el('div', 'inv');
      row.appendChild(el('span', '', '🤝 ' + inv.from.nick + '님이 친선전투에 초대했어요'));
      const ok = el('button', 'btn small', '수락'), no = el('button', 'btn small ghost', '거절');
      ok.onclick = () => { N.accept(inv.code); showScreen(); renderInvites(); };
      no.onclick = () => { N.decline(inv.code); renderInvites(); };
      row.appendChild(ok); row.appendChild(no); box.appendChild(row);
    });
    box.classList.toggle('hidden', !N.invites.length);
  }
  setInterval(() => { if (N.invites.length) renderInvites(); }, 5000);

  // ---- 채팅 ----
  const log = [];
  function addChat(from, text) {
    log.push(from + ': ' + text); while (log.length > 6) log.shift();
    const box = $('fr-chatlog'); box.innerHTML = ''; log.forEach((l) => box.appendChild(el('div', '', l)));
    box.scrollTop = box.scrollHeight;
  }

  // ---- 연결 ----
  $('friendly-btn').onclick = showScreen;
  $('fr-back').onclick = back;
  $('fr-create').onclick = () => N.createRoom();
  $('fr-leave').onclick = () => N.leave();
  $('fr-start').onclick = () => N.start();
  $('fr-joincode').onclick = () => { const c = $('fr-codein').value.trim().toUpperCase(); if (c.length === 4) N.joinCode(c); else toast('방 코드는 4글자예요'); };
  $('fr-chatsend').onclick = () => { const i = $('fr-chatin'); if (i.value.trim()) N.chat(i.value); i.value = ''; };
  $('fr-chatin').onkeydown = (e) => { if (e.key === 'Enter') $('fr-chatsend').onclick(); };

  N.on('online', render);
  N.on('room', (r) => { if (r && pendingInvite) { N.invite(pendingInvite); pendingInvite = null; } render(); });
  N.on('status', render);
  N.on('invite', renderInvites);
  N.on('toast', toast);
  N.on('chat', addChat);
  N.on('start', (room, matchId) => { opened = false; $('screen-friendly').classList.add('hidden'); if (F.startNet) F.startNet(room, matchId); });

  F.show = showScreen; F.render = render; F.isOpen = () => opened; F.toast = toast; F.hideInvites = () => { $('invite-toast').classList.add('hidden'); };
  window.RivalFriendly = F;
})();
