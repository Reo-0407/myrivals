// MyRivals 서버 로직: 닉네임 등록 + 리더보드
// 데이터는 data/rival.json 에 저장. Render 무료 플랜은 재배포/재시작 때 이 파일이 지워질 수 있음.
const fs = require('fs');
const path = require('path');
const express = require('express');

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'rival.json');

const ID_RE = /^[A-Za-z0-9_-]{8,40}$/;               // 브라우저가 만든 랜덤 id 형식
const BAD_IDS = new Set(['__proto__', 'constructor', 'prototype']); // 객체 키로 쓰면 위험한 이름
const isValidId = (id) => typeof id === 'string' && ID_RE.test(id) && !BAD_IDS.has(id);
const num = (v) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

// id -> { nick, wins, losses, kills, deaths, updatedAt, lastReport }
// Object.create(null): 프로토타입이 없는 객체라서 "__proto__" 같은 키로 서버가 오염되지 않음
let players = Object.create(null);

try {
  const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  Object.keys(raw).forEach((id) => { // 파일 내용도 믿지 않고 한 번 걸러서 읽음
    const p = raw[id];
    if (!isValidId(id) || !p || typeof p.nick !== 'string') return;
    players[id] = { nick: cleanNick(p.nick), wins: num(p.wins), losses: num(p.losses), kills: num(p.kills), deaths: num(p.deaths), updatedAt: num(p.updatedAt), lastReport: num(p.lastReport) };
  });
} catch (e) {
  players = Object.create(null);
}

let saveTimer = null;
function saveNow() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(players));
  } catch (e) {
    console.error('MyRivals 저장 실패:', e.message);
  }
}
function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; saveNow(); }, 2000);
}
// 재배포/종료 신호를 받으면 기다리지 않고 바로 저장 (최근 몇 초 기록이 사라지는 것 방지)
['SIGTERM', 'SIGINT'].forEach((sig) => process.on(sig, () => { if (saveTimer) clearTimeout(saveTimer); saveNow(); process.exit(0); }));

// 기록이 하나도 없는 오래된 계정부터 지워서 플레이어 수가 무한히 늘지 않게 함
const MAX_PLAYERS = 5000;
function prune() {
  const ids = Object.keys(players);
  if (ids.length <= MAX_PLAYERS) return;
  ids.filter((id) => !(players[id].wins + players[id].losses + players[id].kills))
    .sort((a, b) => (players[a].updatedAt || 0) - (players[b].updatedAt || 0))
    .slice(0, ids.length - MAX_PLAYERS)
    .forEach((id) => { delete players[id]; });
}

function cleanNick(raw) {
  return String(raw || '').replace(/[^\p{L}\p{N}_ ]/gu, '').trim().slice(0, 12);
}

function nickTaken(nick, exceptId) {
  const low = nick.toLowerCase();
  return Object.keys(players).some((id) => id !== exceptId && players[id].nick.toLowerCase() === low);
}

const clampInt = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
const publicStats = (p) => ({ nick: p.nick, wins: p.wins, losses: p.losses, kills: p.kills, deaths: p.deaths });

// 접속 등록 남용 방지: 같은 주소에서 10분에 30번까지 (계정을 무한히 만드는 것 방지)
const JOIN_LIMIT = Number(process.env.JOIN_LIMIT) || 30; // 테스트할 때만 환경변수 JOIN_LIMIT 로 크게 열어 둠
const joinLog = new Map();
function joinAllowed(ip) {
  const now = Date.now(), e = joinLog.get(ip);
  if (!e || now > e.reset) { joinLog.set(ip, { n: 1, reset: now + 10 * 60 * 1000 }); return true; }
  e.n++;
  if (joinLog.size > 5000) joinLog.clear();
  return e.n <= JOIN_LIMIT;
}

const router = express.Router();
router.use(express.json({ limit: '2kb' }));
// 요청 본문이 없거나 객체가 아니면 빈 객체로 취급 (배열/문자열 등이 와도 에러 나지 않게)
router.use((req, res, next) => { if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) req.body = {}; next(); });

// 닉네임 등록/확인. 같은 id면 닉네임 변경도 가능.
router.post('/join', (req, res) => {
  const id = req.body.id;
  const nick = cleanNick(req.body.nick);
  if (!isValidId(id)) return res.status(400).json({ error: '잘못된 접속입니다.' });
  if (nick.length < 2) return res.status(400).json({ error: '닉네임은 2글자 이상이에요.' });
  if (nickTaken(nick, id)) return res.status(409).json({ error: '이미 쓰고 있는 닉네임이에요.' });
  if (!players[id] && !joinAllowed(req.ip)) return res.status(429).json({ error: '잠시 뒤에 다시 시도해 주세요.' });
  const p = players[id] || { wins: 0, losses: 0, kills: 0, deaths: 0, lastReport: 0 };
  p.nick = nick;
  p.updatedAt = Date.now();
  players[id] = p;
  prune();
  save();
  res.json({ ok: true, nick, stats: publicStats(p) });
});

// 경기 결과 보고 (한 경기에서 늘어난 값만 보냄). 클라이언트 값을 믿는 구조라 부정행위 방지는 약함 → 상한만 둠.
router.post('/report', (req, res) => {
  const id = req.body.id;
  const p = isValidId(id) ? players[id] : null;
  if (!p) return res.status(404).json({ error: '먼저 닉네임을 등록하세요.' });
  // 한 매치는 최소 몇십 초는 걸리므로, 15초 안의 연속 보고는 막음 (리더보드 조작 완화)
  if (p.lastReport && Date.now() - p.lastReport < 15000) return res.status(429).json({ error: '기록 저장이 너무 빨라요.' });
  p.lastReport = Date.now();
  p.kills += clampInt(req.body.kills, 50);
  p.deaths += clampInt(req.body.deaths, 50);
  if (req.body.won === true) p.wins += 1;
  else if (req.body.won === false) p.losses += 1;
  p.updatedAt = Date.now();
  save();
  res.json({ ok: true, stats: publicStats(p) });
});

router.get('/leaderboard', (req, res) => {
  const rows = Object.keys(players)
    .map((id) => publicStats(players[id]))
    .sort((a, b) => b.wins - a.wins || b.kills - a.kills || a.deaths - b.deaths)
    .slice(0, 20);
  res.json(rows);
});

// 깨진 JSON 등 요청 오류는 서버 내부 정보(스택) 없이 짧은 JSON으로만 응답
router.use((err, req, res, next) => {
  res.status(err && err.status === 413 ? 413 : 400).json({ error: '잘못된 요청이에요.' });
});

// 친선전투 서버(rival-net.js)가 접속자 닉네임을 확인할 때 씀
router.getNick = (id) => (isValidId(id) && players[id] ? players[id].nick : null);

module.exports = router;
