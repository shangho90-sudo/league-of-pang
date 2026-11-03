# 온라인 대전 운영

로그인 없이 닉네임으로 입장하는 1대1~4대4 모드다. 웹 화면은 GitHub Pages에서, 경기 계산과 대기실은 별도 Node.js 서버에서 실행한다. 방장 PC는 경기 서버 역할을 하지 않는다.

## 대기실 규칙

- 대기실 목록과 참가자 변경을 WebSocket으로 즉시 전송한다.
- 방장에게 ★를 표시하며 방장만 강퇴·시작할 수 있다.
- BLUE와 RED는 각각 최대 4명이다. 양 팀 인원이 같고 2명 이상이며 전원이 연결·준비 완료한 경우에만 시작한다.
- 캐릭터를 둘 이상 임시 선택할 수 있지만, 먼저 준비 완료한 한 사람만 확정된다. 같은 캐릭터의 다른 임시 선택은 해제되고 선택창은 회색으로 잠긴다. 준비 취소·퇴장·강퇴 시 잠금이 풀린다.
- 로딩 중에는 구성을 고정하고 전원이 불러오기를 끝낸 뒤 서버 시간을 시작한다. 120초 안에 완료하지 못하면 대기실로 복귀한다.
- 연결이 끊기면 해당 캐릭터를 정지시키고 60초 동안 재접속을 기다린다. 방장은 연결된 참가자에게 넘어가며 진행 중인 경기는 계속된다. 한 팀이 모두 퇴장하면 상대 팀이 승리한다.

## 서버 구조

`server/index.js`는 접속·방·권한을 관리한다. 방마다 `server/match-worker.js` 작업 스레드를 하나 생성해 기존 `Sim`을 초당 30회 실행한다. 브라우저는 자기 캐릭터의 명령만 보내며 위치·피해·골드·승패를 결정할 수 없다.

서버 상태는 초당 15회 전송한다. 유닛의 변경된 필드만 보내고 3초마다 전체 상태를 보낸다. 팀별 시야를 적용하고 화면에서는 이동을 보간한다. 4KB 메시지 제한, 초당 90개 요청 제한, 느린 연결의 송신 대기열 제한을 적용한다. 한 서버의 동시 경기 상한은 `MAX_MATCHES`로 정한다. 로그인 없는 손님 식별자는 브라우저 탭의 세션에 보관되며, 새 익명 신원 생성까지 막는 영구 계정 차단 기능은 아니다.

서버 재시작 시 메모리에 있는 방·경기는 사라진다. 새 버전 배포는 진행 중인 경기가 없는 때에 수행한다. 여러 인스턴스로 무작정 복제하지 않는다. 수평 확장을 하려면 방 배정과 세션 저장소를 추가해야 한다.

## 로컬 실행과 검증

```sh
npm ci
npm run server
npm run build
npm run serve
npm run test:online
node tools/verify-online.mjs
```

로컬 웹 주소에 `?online=1&server=http://127.0.0.1:8787`를 붙이면 로컬 대전 서버에 연결한다. 서버 주소 덮어쓰기는 localhost에서만 허용된다. 공개 사이트는 `public/online.json`의 검증된 HTTPS 주소를 읽는다.

자동 검증은 권한 우회 거부, 준비 경쟁, 캐릭터 잠금, 강퇴 후 재입장 거부, 팀 인원·준비 조건, 방장 연결 종료 중 경기 진행, 재접속, 잘못된 입력 처리, 12캐릭터 48스킬의 상태 직렬화를 검사한다. 브라우저 검증은 PC·모바일의 방 생성→참여→시작→이동·스킬→연결 복구→결과→퇴장 경로를 검사한다.

## Railway 배포 (선택한 운영 환경)

Railway 계정의 활성 요금제가 필요하다. 체험 기간이 만료되어 프로젝트 생성이 거부되면 계정 소유자가 요금제를 활성화해야 한다. 아래 설정은 배포 준비 사항이며, 실제 서버 생성·검증 전까지 `public/online.json`의 주소는 비워 둔다.

1. 전용 `league-of-pang-online` 프로젝트를 만들고 이 GitHub 저장소의 `online-multiplayer` 브랜치를 연결한다. 기본 서비스는 루트 `Dockerfile`로 빌드한다. 서버 이미지는 웹 렌더링 자산을 포함하지 않는다.
2. 싱가포르 리전(`asia-southeast1-eqsg3a`), 인스턴스 1개, 절전 비활성화로 설정한다. 초기 자원 상한은 CPU 1개·메모리 1GB, 동시 경기 상한은 3개로 시작하고 실제 부하를 관찰한다. 상한 설정은 고정 요금이나 성능 보장을 뜻하지 않는다.
3. `NODE_ENV=production`, `PORT=8787`, `MAX_MATCHES=3`을 설정한다. 시작 명령은 Dockerfile의 `node server/index.js`, 상태 확인 경로는 `/health`를 사용한다.
4. 8787 포트를 대상으로 Railway 공개 HTTPS 도메인을 발급한다. `/health` 응답과 두 클라이언트의 WSS 연결·경기 진행을 검사한다.
5. `public/online.json`을 검증된 HTTPS 주소로 바꾼다. 메인 브랜치에 적용해 GitHub Pages를 배포한 뒤 공개 주소에서도 경기 시작·동기화를 검사한다.
6. 운영 소스 브랜치를 최종 메인 브랜치로 맞춘다. 진행 중인 경기가 있는 동안 자동 재배포하지 않도록 운영한다.

Railway의 새 서비스 설정은 연결 도구나 서비스 설정 화면에서 관리한다. 더 이상 권장되지 않는 `railway.json`/`railway.toml`은 추가하지 않는다. 참고: [Railway 요금제](https://docs.railway.com/pricing/plans), [리전](https://docs.railway.com/reference/regions), [기존 Config as Code 안내](https://docs.railway.com/config-as-code/reference).

## Oracle Cloud 무료 배포 (대안)

무료 허용량과 남은 용량은 생성 직전 콘솔에서 확인한다. 2026-11-04 확인한 Oracle 문서의 Ampere A1 Always Free 범위는 합계 **2 OCPU, 12GB 메모리**이다. 이미 사용 중인 자원이 있으면 그만큼 줄여야 한다. 목표는 Ubuntu 24.04 ARM64, A1 Flex, 2 OCPU/12GB, 기본 50GB 부팅 디스크이며 무료 표기를 확인한 뒤 생성한다. 유료 용량·예약·추가 저장소로 자동 전환하지 않는다.

1. 홈 리전에 무료 인스턴스를 생성한다. 게임용 공개 서브넷과 공인 IP를 할당한다.
2. 인스턴스의 네트워크 규칙에서 TCP 80·443을 공개한다. SSH 22는 관리자의 IP로 제한한다. 기존 네트워크와 방화벽 규칙을 유지한다.
3. Ubuntu에 공식 패키지의 Docker와 Compose를 설치하고 이 저장소의 검증된 커밋을 내려받는다.
4. `deploy/.env.example`을 `deploy/.env`로 복사하고 `GAME_HOST`를 공인 IP로 연결되는 실제 도메인으로 지정한다. 별도 도메인이 없으면 `pang.<공인IP>.sslip.io`를 사용할 수 있다. 이 경우 DNS 서비스는 sslip.io에 의존한다.
5. `docker compose --env-file deploy/.env -f deploy/compose.yaml up -d --build`로 실행한다. ARM64와 AMD64 공용 이미지이며 렌더링 자산은 서버 이미지에 포함하지 않는다.
6. Caddy의 공개 인증서 발급, `https://<도메인>/health`, 두 클라이언트의 WSS 연결을 확인한다.
7. `public/online.json`을 검증된 주소로 변경하고 GitHub Pages를 배포한다. 공개 게임에서 다시 경기 시작·동기화를 검증한다.

컨테이너와 HTTPS 인증서는 자동 재시작·갱신된다. 경기 프로세스는 일반 사용자 권한, 읽기 전용 파일 시스템으로 실행하며 8787 포트는 컨테이너 내부에서만 노출한다.

Oracle의 무료 서버는 지역 용량에 따라 생성이 제한될 수 있고 유휴 상태에서 회수될 수 있다. 가동률 보장 상품이 아니다. 참고: [Oracle Always Free](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm), [Caddy 자동 HTTPS](https://caddyserver.com/docs/automatic-https), [sslip.io](https://sslip.io/).
