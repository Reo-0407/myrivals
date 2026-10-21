# MyRivals

웹에서 하는 1인칭 슈팅(FPS) 미니게임. 친구/팀원은 전부 **AI 봇**이고, PC와 모바일에서 모두 할 수 있어요.

- 접속하면 **닉네임 입력 → 로비 → 매치 시작**. 로그인/관리자 화면 없음
- 모드 1v1 ~ 4v4, 5선승, AI 난이도 4단계
- 무기 14종 (주무기 6 / 보조 2 / 근접 2 / 유틸리티 4), 무기마다 다른 재장전 시간
- 리더보드 (승/킬/데스)

## 실행
```bash
npm install
npm start
```
`http://localhost:3000` 접속. 같은 와이파이의 폰은 PC의 로컬 IP(`ipconfig`)로 접속.

## 공개 링크로 배포 (Render)
1. [Render](https://dashboard.render.com) → **New → Blueprint** → 이 저장소 선택 (`render.yaml`이 설정을 채워줌)
   - 또는 **New → Web Service**: Build `npm install`, Start `npm start`
2. 배포가 끝나면 `https://○○○.onrender.com` 이 게임 주소. 이후 `git push` 하면 자동 재배포.

무료 플랜은 한동안 접속이 없으면 잠들어서 첫 접속이 느리고, **재시작/재배포 때 리더보드 기록이 지워질 수 있어요.**

## 조작
| | PC | 모바일(가로 화면) |
|---|---|---|
| 이동 | WASD | 왼쪽 화면 조이스틱 (끝까지 밀면 달리기) |
| 시점 | 마우스 | 오른쪽 화면 드래그 |
| 발사 / 조준 | 좌클릭 / 우클릭 | 발사 버튼 / 조준 버튼(토글) |
| 장전 / 점프 | R / Space | 장전 / 점프 버튼 |
| 무기 교체 | 1·2·3·4, 휠, Q | 아래쪽 무기 버튼 |
| 점수판 | Tab | 위쪽 점수 상자 탭 |

## 구조
```
server.js          정적 파일 + 닉네임/리더보드 API (Express)
rival-server.js    API 구현 (data/rival.json 에 저장)
public/
  index.html       닉네임 / 로비 / 게임 화면
  main.js          로비, HUD, 매치(라운드), 입력(PC/모바일)
  weapons.js       무기 수치표 + 발사/재장전 상태 머신 (밸런스는 여기 숫자만 고치면 됨)
  maps.js          맵 (상자 조합)
  models.js        3D 모델 (무기/캐릭터)
  bots.js          봇 AI (A* 길찾기, 난이도)
  physics.js       충돌/총알 계산
  audio.js         효과음 (코드로 합성, 음원 파일 없음)
```

테스트용 주소 옵션: `?debug`(콘솔에서 `__rival` 접근), `?rounds=1`(1선승).

## 알려진 한계
- 봇은 지상만 다니고(계단/2층 이용 불가) 유틸리티를 쓰지 않아요.
- 기록은 브라우저가 보내는 값을 믿는 구조라 조작할 수 있어요(15초 간격 제한만 있음).
- 앉기, 활, 상점/스킨은 아직 없어요.
