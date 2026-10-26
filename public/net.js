// MyRivals 친선전투: 서버(/ws)와 주고받는 부분. 화면은 friendly.js, 경기 중 동기화는 main.js 가 맡음.
// WebSocket 이란? 브라우저와 서버가 계속 연결을 유지한 채로 서로 메시지를 즉시 주고받는 통로예요.
(function () {
  const listeners = Object.create(null);
  const N = { connected: false, id: null, nick: null, online: [], room: null, invites: [], ws: null };
  let wanted = false, retry = 0, timer = 0;

  const emit = (ev, a, b, c) => { (listeners[ev] || []).forEach((f) => { try { f(a, b, c); } catch (e) { console.error(e); } }); };
  N.on = (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); };
  const send = (o) => { if (N.ws && N.ws.readyState === 1) N.ws.send(JSON.stringify(o)); };
  N.send = send;

  function open() {
    clearTimeout(timer);
    if (!wanted || !N.id) return;
    let ws;
    try { ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws'); } catch (e) { return schedule(); }
    N.ws = ws;
    ws.onopen = () => { retry = 0; send({ k: 'hello', id: N.id }); };
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      switch (m.k) {
        case 'hi': N.connected = true; N.nick = m.nick; emit('status', true); break;
        case 'online': N.online = m.list || []; emit('online', N.online); break;
        case 'room': N.room = m.room; emit('room', N.room); break;
        case 'invite': N.invites.push({ code: m.code, from: m.from, settings: m.settings, t: Date.now() }); emit('invite', N.invites[N.invites.length - 1]); break;
        case 'toast': emit('toast', m.msg); break;
        case 'err': emit('toast', m.msg); break;
        case 'chat': emit('chat', m.from, m.text); break;
        case 'start': N.room = m.room; emit('start', m.room, m.matchId); break;
        case 'ended': emit('ended', m.reason || ''); break;
        case 'left': emit('left', m.id, m.nick); break;
        case 'm': emit('msg', m.from, m.t, m.d); break;
        default: break;
      }
    };
    ws.onclose = () => {
      if (N.ws !== ws) return;
      const was = N.connected;
      N.connected = false; N.ws = null; N.room = null; N.online = [];
      if (was) { emit('status', false); emit('room', null); }
      schedule();
    };
    ws.onerror = () => {};
  }
  function schedule() { if (!wanted) return; retry = Math.min(retry + 1, 6); timer = setTimeout(open, Math.min(8000, 800 * retry)); }

  N.connect = (id) => { N.id = id; wanted = true; if (!N.ws) open(); };
  N.disconnect = () => { wanted = false; clearTimeout(timer); if (N.ws) { try { N.ws.close(); } catch (e) {} } };

  N.createRoom = () => send({ k: 'room:create' });
  N.joinCode = (code) => send({ k: 'room:join', code });
  N.invite = (to) => send({ k: 'room:invite', to });
  N.accept = (code) => { N.invites = N.invites.filter((i) => i.code !== code); send({ k: 'room:accept', code }); };
  N.decline = (code) => { N.invites = N.invites.filter((i) => i.code !== code); send({ k: 'room:decline', code }); };
  N.leave = () => { send({ k: 'room:leave' }); N.room = null; emit('room', null); };
  N.setTeam = (team) => send({ k: 'room:team', team });
  N.moveMember = (id, team) => send({ k: 'room:move', id, team });
  N.kick = (id) => send({ k: 'room:move', id, kick: true });
  N.giveHost = (id) => send({ k: 'room:host', id });
  N.setSettings = (s) => send({ k: 'room:settings', s });
  N.chat = (text) => send({ k: 'room:chat', text });
  N.start = () => send({ k: 'room:start' });
  N.endMatch = () => send({ k: 'room:end' });
  N.relay = (to, t, d) => send({ k: 'relay', to, t, d }); // to: 'all' | 'host' | 사람 id

  window.RivalNet = N;
})();
