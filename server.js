// MyRivals 서버: 정적 파일(게임) + 닉네임/리더보드 API 만 담당. 경기는 전부 브라우저에서 진행됨.
const express = require('express');
const path = require('path');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', require('./rival-server'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MyRivals 서버 실행 중: http://localhost:${PORT}`);
});
