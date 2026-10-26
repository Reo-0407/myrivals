// MyRivals 서버: 정적 파일(게임) + 닉네임/리더보드 API 만 담당. 경기는 전부 브라우저에서 진행됨.
const http = require('http');
const express = require('express');
const path = require('path');

const app = express();
app.set('trust proxy', 1);          // Render 같은 프록시 뒤에서도 접속자 주소를 제대로 읽음
app.disable('x-powered-by');
app.use((req, res, next) => {       // 기본 보안 헤더
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});
app.use(express.static(path.join(__dirname, 'public')));
const api = require('./rival-server');
app.use('/api', api);
app.use('/api', (req, res) => res.status(404).json({ error: '없는 주소예요.' }));

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
require('./rival-net').attach(server, { getNick: api.getNick }); // 친선전투(WebSocket /ws)
server.listen(PORT, () => {
  console.log(`MyRivals 서버 실행 중: http://localhost:${PORT}`);
});
