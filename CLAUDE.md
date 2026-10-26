# MyRivals

웹 FPS 미니게임(브라우저에서 AI 봇과 대전). 풀빌라 파티 게임과는 **별개 프로젝트**다.

## 기술 스택
- 서버: Node.js + Express (정적 파일 + 닉네임/리더보드 API) + `ws` WebSocket(친선전투). Socket.io 없음.
- 클라이언트: 순수 HTML/CSS/JS, 빌드 과정 없음. 3D는 Three.js(cdnjs CDN r128).
- 효과음은 Web Audio로 직접 합성. 음원/그림 파일 없음.

## 파일
`server.js`, `rival-server.js`(API, `data/rival.json` 저장), `rival-net.js`(친선전투 WebSocket 서버), `public/`(index.html, net.js, friendly.js, main.js, weapons.js, maps.js, map-village.js, map-harbor.js, map-snow.js, models.js, bots.js, physics.js, audio.js, style.css). 자세한 설명은 README.md.

## 최근 추가
- 로비 `🎯 사격장`(`match.mode==='range'`): 과녁은 `bots.js`의 `dummy` 봇. 라운드/타이머 규칙은 꺼짐.
- 화면 크기는 `fitApp()`이 `--app-w/--app-h` CSS 변수로 실제 보이는 크기에 맞춤(모바일 주소창 때문에 잘리는 문제 방지).
- 난이도 기본값: 폰 `입문`/PC `쉬움`. 설정 버전(`SETTINGS_VER`)을 올리면 저장된 난이도·보조 설정이 새 기본값으로 초기화됨.
- 아군 봇은 적보다 한 단계 높은 난이도로 나온다.

- 맵은 `RivalMap.register`로 등록(`maps.js`에 창고, `map-village.js`에 사막 마을, `map-harbor.js`에 항구 부두, `map-snow.js`에 설원 기지). `main.js`의 `loadMap(id)`가 맵 교체 + 봇 길찾기 격자 재생성. 사격장은 항상 창고 맵.
- 앉기: `P.eye`(1.7↔1.2). 물리(`physics.js`)와 판정은 캐릭터의 `eye` 값을 사용(없으면 1.7).
- 폰을 세로로 들면 게임 일시정지(`running()`), 창 전환 시 입력 해제.

- 상점(`shop.js`): 코인/보유/장착은 localStorage `rival_wallet`(서버 저장 없음). 스킨은 `models.js`의 `partMat`이 색을 입힘(빛남/무지개는 전용 재질이라 `userData.own`을 dispose). 경기 후 코인은 `RivalShop.reward`.
- 관전: 죽으면 `updateSpectate()`가 살아 있는 아군 시점으로 카메라를 옮김.
- 봇 AI v2(`bots.js`): 봇마다 역할(돌격/우회/매복/순찰)·팀 레인·길 비용 소음·지나간 길 기피로 동선이 매번 다름. 보통 이상 난이도는 플레이어의 위치 분포(16x16 열지도)·교전 거리를 기억해(`localStorage rival_profile`) 학습 수준 L(난이도별 상한 normal .35/hard .7/insane 1)만큼 반응·조준이 좋아지고 자주 있는 곳을 노림. 입문/쉬움은 학습 안 함. 빗나감: 조준 흔들림 `wob`, 연사마다 `pMiss` 확률로 어긋난 연사, 맞으면 움찔(`flinchT`), 연사 반동. 값은 `DIFFS` 표에서 조절. main.js 연결: `beginMatch/observePlayer/observeShot/roundEnd/endMatch`.
- 봇 유틸리티: 난이도별 확률(`UTIL_P`)로 라운드당 1개. 숨은 적 위치엔 수류탄/섬광탄, 체력 낮으면 연막. 던지기·폭발은 `main.js`의 `botThrow`. 막힌 틈새 칸은 `reach`로 목적지에서 제외.
- 봇 탐색: 22m 안의 적은 발소리로 위치를 알아채 `planRoute`가 그쪽으로 직행(매복 봇은 14m), 목적지에 도착하면 `spinT`로 한 바퀴 둘러봄.
- 밸런스(`main.js` `shoot/explode`): 봇이 나를 한 방에 못 죽이게 총알 1발 최대 60(`BOT_HIT_CAP`), 샷건 1회 합계 최대 55(`BOT_VOLLEY_CAP`), 수류탄 최대 80. 플레이어→봇 데미지는 그대로. 어려움/지옥은 조준 오차·빗나감 확률을 높여 명중률을 낮춤(`DIFFS`).
- 매치 설정: 몇 선승(`settings.wins` 1/2/3/5/7/10, 시작 때 `match.wins`로 고정, `?rounds=N`이 있으면 우선), 무기 랜덤(`settings.randomGear`, 라운드마다 `setupGuns`가 무작위 4슬롯). 코인은 선승 수에 따라 배율(`WINS_MULT`). 결과 화면에 명중률/헤드샷 표시.
- 활(`bow`, 보조무기): 한 발 장전식 히트스캔(화살 궤적은 트레이서). 봇은 안 씀. 모델 `models.js`, 소리 `audio.js` GUN.bow.
- 봇 길찾기는 층 구분(`bots.js`): 칸마다 설 수 있는 높이 목록(`nodeH/nodeN`, K=5), 점=(칸,높이). 오르막은 `climbOk`가 실제 `phys.tryMove`로 걸어 올라가는지 시험(계단 옆에서 비스듬히 붙으면 막히는 것 방지). 위층 목적지는 흐트러뜨리지 않음. 계단/층 이동 구간은 지점을 정확히(0.6m) 밟아야 다음으로 넘어감. 창고 2층 계단 위 통로를 넓히려고 난간을 얇게 함(`maps.js`).
- AI 학습은 라운드마다 계속 쌓임(져도 줄지 않음). 지옥은 조준 오차/빗나감 확률을 높여 쉬워짐, 기관총은 약하고 퍼지게 조정, 기관단총 14/점사 24.
- 친선전투(온라인): `rival-net.js`가 접속자 목록/방(코드·초대·팀 A/B·설정)/경기 중 메시지 중계(`relay`)만 담당. 경기 규칙·AI 봇·라운드 진행은 **방장 브라우저**(main.js `NET.host`)가 하고, 각자는 자기 위치/체력을 `st`(15회/초)로 보냄. 원격 캐릭터는 `bots.js`의 `remote` 엔티티(`spawn({remote,human,persist,netId})`, `setRemote`, `revive`, `clear(true)`). 팀은 방 기준 A/B 이지만 화면에서는 항상 내 팀=A(`lt()/rtOf()`). 메시지: st(상태) bs(방장 봇 상태) fire(발사 연출) hit(피격 알림→주인이 체력 깎음) dead(사망) nade(수류탄) rdy/rs/ph/er/ov(준비·라운드시작·단계·라운드끝·경기끝). 피해는 던진/쏜 쪽이 계산(클라이언트 신뢰, 치트 방지 없음). 친선전투는 기록/코인/AI학습 없음. 모드: `round`(라운드제) / `tdm`(팀 데스매치: `match.tdm`, 5분 제한 `TDM_TIME`, 죽으면 3초 뒤 `respawnSelf`/방장이 봇 `botsApi.respawn`, 점수는 방장이 `tdmScore`로 세고 `ph`로 알림, 목표 킬 `limit` 10/20/30/50).
- 보안: 저장소/목록 객체는 `Object.create(null)`("__proto__" 오염 방지), 서버는 id 형식 검증. 설정/지갑은 불러올 때 값 검사.

## 규칙
- 접속하면 닉네임 입력 → 로비. 관리자/로그인 화면은 만들지 않는다.
- 무기 밸런스는 `public/weapons.js` 맨 위 표의 숫자만 고친다.
- API는 `/api/join`, `/api/report`, `/api/leaderboard`.
- 테스트용 주소 옵션: `?debug`(`__rival` 노출), `?rounds=1`.
- 리더보드는 Render 무료 플랜에서 재시작 시 초기화될 수 있다(DB 없음).

## 배포
Render Web Service (Build `npm install`, Start `npm start`, 또는 `render.yaml` 블루프린트). push하면 자동 재배포.
