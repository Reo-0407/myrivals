# MyRivals

웹 FPS 미니게임(브라우저에서 AI 봇과 대전). 풀빌라 파티 게임과는 **별개 프로젝트**다.

## 기술 스택
- 서버: Node.js + Express (정적 파일 + 닉네임/리더보드 API만). Socket.io 없음.
- 클라이언트: 순수 HTML/CSS/JS, 빌드 과정 없음. 3D는 Three.js(cdnjs CDN r128).
- 효과음은 Web Audio로 직접 합성. 음원/그림 파일 없음.

## 파일
`server.js`, `rival-server.js`(API, `data/rival.json` 저장), `public/`(index.html, main.js, weapons.js, maps.js, models.js, bots.js, physics.js, audio.js, style.css). 자세한 설명은 README.md.

## 규칙
- 접속하면 닉네임 입력 → 로비. 관리자/로그인 화면은 만들지 않는다.
- 무기 밸런스는 `public/weapons.js` 맨 위 표의 숫자만 고친다.
- API는 `/api/join`, `/api/report`, `/api/leaderboard`.
- 테스트용 주소 옵션: `?debug`(`__rival` 노출), `?rounds=1`.
- 리더보드는 Render 무료 플랜에서 재시작 시 초기화될 수 있다(DB 없음).

## 배포
Render Web Service (Build `npm install`, Start `npm start`, 또는 `render.yaml` 블루프린트). push하면 자동 재배포.
