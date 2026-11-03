# 범위 표시 제작 계획

첨부 이미지의 푸른 발광 경계, 별 모양 크리스털 장식, 얼음 화살촉을 참고한다. 이미지 속 캐릭터나 바닥을 모델에 포함하지 않도록 두 장식을 각각 텍스트로 생성한다. 정확한 영문 프롬프트는 `tools/tripo-indicator-assets.json`에 기록했다.

모델: CLI `tripo-p1`, API `P1-20260311`. 무료 dry-run 두 건 모두 valid=true, 경고 없음. 각 요청은 텍스처 없는 GLB 1개를 생성한다. 색·투명도·발광은 게임에서 적용한다.

1. `POST /v3/generation/text-to-model`: 별 모양 크리스털 장식. `face_limit=1800`, `texture=false`, `pbr=false`. 예상 30 Tripo 크레딧.
2. `POST /v3/generation/text-to-model`: 긴 크리스털 화살촉. `face_limit=2400`, `texture=false`, `pbr=false`. 예상 30 Tripo 크레딧.

합계 예상 60 크레딧. 실패 작업은 환급된다. 추가 유료 변환·리깅·재생성은 계획에 없다. `toy` dry-run의 deliverables에 STL 안내가 있지만 steps에는 변환 단계가 없으며 GLB만 사용한다.

각 명령: `tripo make <해당 prompt> --for toy -p face_limit=<faces> -p texture=false -p pbr=false --name <name> -o ./_art/tripo-indicators --json --yes`.

원본은 `C:/Users/shang/Documents/ChatGPT/팽롤/_art/tripo-indicators/tripo-out/<name>-<id8>/`의 `model.glb`, `preview.png`, `task.json`에 저장된다. 최종 게임 파일은 `C:/Users/shang/Documents/ChatGPT/팽롤/public/models/indicators/crystal-star.glb`와 `C:/Users/shang/Documents/ChatGPT/팽롤/public/models/indicators/crystal-arrow.glb`에 최적화해 저장한다.

원형·직사각형·부채꼴 경계는 게임의 실제 사거리·너비·반경·각도를 따른다. 얇은 흰색 중심선, 푸른 발광 테두리, 반투명 내부 문양, 움직이는 빛, 두 Tripo 모델을 조합한다. 사용 불가는 붉은색, 아군 대상은 녹색으로 구분한다. 모바일에서는 장식 수와 밝기를 제한한다.
