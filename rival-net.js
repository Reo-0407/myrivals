// MyRivals 친선전투 서버: 접속자 목록 + 방(초대/팀 변경/설정) + 경기 중 메시지 중계.
// 경기 규칙/봇/판정은 전부 방장의 브라우저가 맡고, 서버는 "누가 접속해 있는지 / 어느 방 어느 팀인지 / 메시지 전달"만 함.
// WebSocket 주소: /ws  (메시지는 JSON 한 줄)
const { WebSocketServer } = require('ws');

const ID_RE = /^[A-Za-z0-9_-]{8,40}$/;
const MAP_RE = /^[a-z0-9_-]{1,24}$/;
const WINS = [1, 2, 3, 5, 7, 10];
const DIFFS = ['rookie', 'easy', 'normal', 'hard', 'insane'];
const MODES = ['round', 'tdm']; // round: 라운드제(전멸시키면 승리) / tdm: 팀 데스매치(죽어도 다시 나오고, 먼저 목표 킬 수를 채우면 승리)
const LIMITS = [10, 20, 30, 50];
const MAX_TEAM = 4;
const INVITE_TTL = 60 * 1000;

function attach(httpServer, { getNick }) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws', maxPayload: 16 * 1024 });
  const conns = new Map();   // id -> { ws, id, nick, roomCode, bucket, alive, invites: Map(code -> {from, nick, t}) }
  const rooms = new Map();   // code -> room

  const send = (c, obj) => { if (c && c.ws.readyState === 1) { try { c.ws.send(JSON.stringify(obj)); } catch (e) {} } };
  const status = (c) => { const r = c.roomCode && rooms.get(c.roomCode); return r ? (r.state === 'playing' ? 'ingame' : 'inroom') : 'idle'; };

  // ---- 접속자 목록 (너무 자주 보내지 않게 모아서) ----
  let onlineTimer = null;
  function broadcastOnline() {
    if (onlineTimer) return;
    onlineTimer = setTimeout(() => {
      onlineTimer = null;
      const list = Array.from(conns.values()).map((c) => ({ id: c.id, nick: c.nick, st: status(c) }));
      const msg = { k: 'online', list };
      conns.forEach((c) => send(c, msg));
    }, 250);
  }

  // ---- 방 ----
  const defaults = () => ({ map: 'warehouse', size: 2, wins: 5, ai: true, diff: 'normal', gear: false, mode: 'round', limit: 20 });
  function newCode() {
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let tries = 0; tries < 50; tries++) {
      let s = ''; for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)];
      if (!rooms.has(s)) return s;
    }
    return null;
  }
  const humans = (r, team) => Array.from(r.members.values()).filter((m) => !team || m.team === team).length;
  function roomView(r) {
    return { code: r.code, host: r.hostId, state: r.state, matchId: r.matchId, settings: r.settings, members: Array.from(r.members.values()).map((m) => ({ id: m.id, nick: m.nick, team: m.team })) };
  }
  function pushRoom(r) { const v = { k: 'room', room: roomView(r) }; r.members.forEach((m) => send(conns.get(m.id), v)); broadcastOnline(); }

  function joinRoom(c, r, team) {
    if (c.roomCode) leaveRoom(c, 'switch');
    r.members.set(c.id, { id: c.id, nick: c.nick, team });
    c.roomCode = r.code;
    c.invites.delete(r.code);
    pushRoom(r);
  }
  function leaveRoom(c, why) {
    const r = c.roomCode && rooms.get(c.roomCode);
    c.roomCode = null;
    if (!r) return;
    r.members.delete(c.id);
    if (!r.members.size) { rooms.delete(r.code); broadcastOnline(); return; }
    const wasHost = r.hostId === c.id;
    if (wasHost) r.hostId = r.members.keys().next().value; // 방장이 나가면 다음 사람이 방장
    if (r.state === 'playing') {
      if (wasHost) { // 경기를 돌리던 방장이 나가면 계속할 수 없으므로 모두 방 화면으로 되돌림
        r.state = 'lobby';
        r.members.forEach((m) => send(conns.get(m.id), { k: 'ended', reason: '방장이 나가서 경기가 끝났어요' }));
      } else r.members.forEach((m) => send(conns.get(m.id), { k: 'left', id: c.id, nick: c.nick })); // 그 외에는 경기 계속
    }
    pushRoom(r);
  }
  function freeTeam(r) { // 새로 들어오는 사람은 사람이 더 적은 팀으로 (친구 한 명이 들어오면 자동으로 반대 팀 → 바로 서로 싸울 수 있음)
    const order = humans(r, 'A') <= humans(r, 'B') ? ['A', 'B'] : ['B', 'A'];
    for (const t of order) if (humans(r, t) < r.settings.size) return t;
    return null;
  }

  function validSettings(r, s) {
    const out = Object.assign({}, r.settings);
    if (typeof s.map === 'string' && MAP_RE.test(s.map)) out.map = s.map;
    if (Number.isInteger(s.size) && s.size >= 1 && s.size <= MAX_TEAM) out.size = s.size;
    if (WINS.includes(s.wins)) out.wins = s.wins;
    if (typeof s.ai === 'boolean') out.ai = s.ai;
    if (DIFFS.includes(s.diff)) out.diff = s.diff;
    if (typeof s.gear === 'boolean') out.gear = s.gear;
    if (MODES.includes(s.mode)) out.mode = s.mode;
    if (LIMITS.includes(s.limit)) out.limit = s.limit;
    if (humans(r, 'A') > out.size || humans(r, 'B') > out.size) return null; // 한 팀 사람 수보다 작은 인원으로는 못 바꿈
    return out;
  }

  // ---- 메시지 처리 ----
  function handle(c, m) {
    switch (m.k) {
      case 'room:create': {
        if (c.roomCode) return send(c, { k: 'err', msg: '이미 방에 있어요.' });
        const code = newCode(); if (!code) return send(c, { k: 'err', msg: '방을 만들 수 없어요.' });
        const r = { code, hostId: c.id, members: new Map(), settings: defaults(), state: 'lobby', matchId: 0 };
        rooms.set(code, r); joinRoom(c, r, 'A');
        break;
      }
      case 'room:join': { // 코드로 입장
        const r = typeof m.code === 'string' && rooms.get(m.code.toUpperCase().slice(0, 4));
        if (!r) return send(c, { k: 'err', msg: '그 코드의 방이 없어요.' });
        if (r.state !== 'lobby') return send(c, { k: 'err', msg: '이미 경기 중인 방이에요.' });
        const t = freeTeam(r); if (!t) return send(c, { k: 'err', msg: '방이 가득 찼어요.' });
        joinRoom(c, r, t);
        break;
      }
      case 'room:invite': {
        const r = c.roomCode && rooms.get(c.roomCode); if (!r || r.state !== 'lobby') return;
        const t = typeof m.to === 'string' && conns.get(m.to);
        if (!t || t === c) return send(c, { k: 'err', msg: '그 사람은 접속 중이 아니에요.' });
        if (status(t) !== 'idle') return send(c, { k: 'err', msg: t.nick + '님은 지금 다른 방/경기 중이에요.' });
        if (!freeTeam(r)) return send(c, { k: 'err', msg: '방이 가득 찼어요.' });
        t.invites.set(r.code, { from: c.id, nick: c.nick, t: Date.now() });
        send(t, { k: 'invite', code: r.code, from: { id: c.id, nick: c.nick }, settings: r.settings });
        send(c, { k: 'toast', msg: t.nick + '님을 초대했어요' });
        break;
      }
      case 'room:accept': {
        const code = typeof m.code === 'string' ? m.code.toUpperCase().slice(0, 4) : '';
        const inv = c.invites.get(code), r = rooms.get(code);
        if (!inv || Date.now() - inv.t > INVITE_TTL || !r) { c.invites.delete(code); return send(c, { k: 'err', msg: '초대가 만료됐어요.' }); }
        if (r.state !== 'lobby') return send(c, { k: 'err', msg: '이미 경기가 시작됐어요.' });
        const t = freeTeam(r); if (!t) return send(c, { k: 'err', msg: '방이 가득 찼어요.' });
        joinRoom(c, r, t);
        break;
      }
      case 'room:decline': { if (typeof m.code === 'string') c.invites.delete(m.code.toUpperCase().slice(0, 4)); break; }
      case 'room:leave': leaveRoom(c, 'leave'); break;
      case 'room:team': { // 내 팀 바꾸기 (브롤스타즈처럼 원하는 팀 칸 누르기)
        const r = c.roomCode && rooms.get(c.roomCode); if (!r || r.state !== 'lobby') return;
        const me = r.members.get(c.id), t = m.team === 'A' || m.team === 'B' ? m.team : null;
        if (!t || me.team === t) return;
        if (humans(r, t) >= r.settings.size) return send(c, { k: 'err', msg: '그 팀은 가득 찼어요.' });
        me.team = t; pushRoom(r);
        break;
      }
      case 'room:move': { // 방장이 다른 사람 팀 옮기기 / 내보내기
        const r = c.roomCode && rooms.get(c.roomCode); if (!r || r.hostId !== c.id || r.state !== 'lobby') return;
        const tgt = typeof m.id === 'string' && r.members.get(m.id); if (!tgt) return;
        if (m.kick === true && tgt.id !== c.id) { const tc = conns.get(tgt.id); if (tc) { leaveRoom(tc, 'kick'); send(tc, { k: 'room', room: null }); send(tc, { k: 'toast', msg: '방장이 방에서 내보냈어요' }); } return; }
        const t = m.team === 'A' || m.team === 'B' ? m.team : null; if (!t || tgt.team === t) return;
        if (humans(r, t) >= r.settings.size) return send(c, { k: 'err', msg: '그 팀은 가득 찼어요.' });
        tgt.team = t; pushRoom(r);
        break;
      }
      case 'room:host': { // 방장 넘기기
        const r = c.roomCode && rooms.get(c.roomCode); if (!r || r.hostId !== c.id || r.state !== 'lobby') return;
        if (typeof m.id === 'string' && r.members.has(m.id)) { r.hostId = m.id; pushRoom(r); }
        break;
      }
      case 'room:settings': {
        const r = c.roomCode && rooms.get(c.roomCode); if (!r || r.hostId !== c.id || r.state !== 'lobby') return;
        const s = m.s && typeof m.s === 'object' ? m.s : {};
        const out = validSettings(r, s); if (!out) return send(c, { k: 'err', msg: '지금 팀 인원보다 작게는 못 바꿔요.' });
        r.settings = out; pushRoom(r);
        break;
      }
      case 'room:chat': {
        const r = c.roomCode && rooms.get(c.roomCode); if (!r) return;
        const text = String(m.text || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 80); if (!text) return;
        r.members.forEach((mm) => send(conns.get(mm.id), { k: 'chat', from: c.nick, text }));
        break;
      }
      case 'room:start': {
        const r = c.roomCode && rooms.get(c.roomCode); if (!r || r.hostId !== c.id || r.state !== 'lobby') return;
        const a = humans(r, 'A'), b = humans(r, 'B');
        if (!r.settings.ai && (!a || !b)) return send(c, { k: 'err', msg: 'AI를 끄면 양쪽 팀에 사람이 한 명 이상 있어야 해요.' });
        r.state = 'playing'; r.matchId++;
        pushRoom(r);
        r.members.forEach((mm) => send(conns.get(mm.id), { k: 'start', matchId: r.matchId, room: roomView(r) }));
        break;
      }
      case 'room:end': { // 방장이 경기 끝을 알림 → 모두 방 화면으로
        const r = c.roomCode && rooms.get(c.roomCode); if (!r || r.hostId !== c.id || r.state !== 'playing') return;
        r.state = 'lobby';
        r.members.forEach((mm) => send(conns.get(mm.id), { k: 'ended', reason: '' }));
        pushRoom(r);
        break;
      }
      case 'relay': { // 경기 중 메시지 전달: to = 'all'(방 전체) | 'host' | 사람 id
        const r = c.roomCode && rooms.get(c.roomCode); if (!r || r.state !== 'playing') return;
        if (typeof m.t !== 'string' || m.t.length > 16) return;
        const msg = { k: 'm', from: c.id, t: m.t, d: m.d };
        if (m.to === 'all') r.members.forEach((mm) => { if (mm.id !== c.id) send(conns.get(mm.id), msg); });
        else if (m.to === 'host') { if (r.hostId !== c.id) send(conns.get(r.hostId), msg); }
        else if (typeof m.to === 'string' && r.members.has(m.to)) send(conns.get(m.to), msg);
        break;
      }
      default: break;
    }
  }

  wss.on('connection', (ws) => {
    let c = null;
    const bucket = { n: 400, t: Date.now() };
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('message', (data) => {
      const now = Date.now(); bucket.n = Math.min(400, bucket.n + (now - bucket.t) * 0.25); bucket.t = now; // 초당 250개, 한 번에 최대 400개 (방장은 봇 상태/발사까지 보내서 많음)
      if (--bucket.n < 0) return;
      let m; try { m = JSON.parse(data.toString()); } catch (e) { return; }
      if (!m || typeof m !== 'object' || typeof m.k !== 'string') return;
      if (!c) { // 첫 메시지는 반드시 hello
        if (m.k !== 'hello' || typeof m.id !== 'string' || !ID_RE.test(m.id)) return ws.close();
        const nick = getNick(m.id); if (!nick) { send({ ws }, { k: 'err', msg: '먼저 닉네임을 등록하세요.' }); return ws.close(); }
        const old = conns.get(m.id); if (old) { leaveRoom(old, 'close'); try { old.ws.close(); } catch (e) {} }
        c = { ws, id: m.id, nick, roomCode: null, invites: new Map() };
        conns.set(c.id, c);
        send(c, { k: 'hi', id: c.id, nick });
        broadcastOnline();
        return;
      }
      handle(c, m);
    });
    ws.on('close', () => {
      if (!c || conns.get(c.id) !== c) return;
      leaveRoom(c, 'close');
      conns.delete(c.id);
      broadcastOnline();
    });
    ws.on('error', () => {});
  });

  // 끊긴 연결 정리 (20초마다 핑)
  const beat = setInterval(() => {
    wss.clients.forEach((ws) => { if (!ws.isAlive) return ws.terminate(); ws.isAlive = false; try { ws.ping(); } catch (e) {} });
  }, 20000);
  beat.unref();
  return { wss, conns, rooms };
}

module.exports = { attach };
