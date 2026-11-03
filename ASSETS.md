# 외부 자산 출처와 사용 조건

이 프로젝트에서 외부에서 가져온 자산과 직접 제작한 자산을 구분해 기록합니다. 기존 게임(리그 오브 레전드 등)의 리소스는 추출하거나 사용하지 않았습니다.

## 1. 외부 자산

### 2026-11-03 전장 모델·배경음악 업데이트

- **Tripo P1 모델 15종**: `public/models/environment/*.glb`. 포탑·넥서스·샘·상점, 활엽수·침엽수·바위·유적 성벽, 미니언 3종, 골렘·늑대·비룡·협곡 거신. 사용자 요청으로 새로 생성한 모델이며 기존 게임에서 추출한 자산을 사용하지 않았습니다. 프롬프트는 `tools/tripo-assets.json`, 최종 삼각형 수·용량·원본 작업 ID는 같은 모델 폴더의 `manifest.json`에 기록했습니다. 텍스처는 512/1024px WebP로 최적화했습니다.
- **Tripo 리깅 6종**: 근접/마법 미니언, 골렘, 늑대, 비룡, 거신. 애니메이션 변환 서비스는 `Invalid input parameter`로 실패·환급되어, 최종 게임은 생성된 뼈대를 `src/render/mapAssets.js`의 절차 동작으로 움직입니다. 유료 생성 애니메이션 클립이 포함된 것으로 표시하지 않습니다.
- **Runway 생성 음악 3곡**: `public/audio/title.mp3` (수정의 서약, 144.30초), `select.mp3` (영웅의 결의, 105.72초), `battle.mp3` (푸른 협곡의 전장, 171.42초). 사용자 요청에 따라 판타지 오케스트라 분위기의 새로운 연주곡으로 생성했습니다. 원곡 샘플이나 기존 게임 음원은 사용하지 않았습니다. 프롬프트·작업 ID는 `public/audio/manifest.json`에 기록했습니다.
- 실제 사용: Tripo **750크레딧** (모델 600 + 리깅 150), Runway **24크레딧** (3곡 × 8). 상세 내역은 `docs/asset-generation-ledger.json`입니다.
- 아래 기존 절차 모델은 네트워크/파일 로드 실패 시 대체 렌더링으로 남아 있습니다. 챔피언 12종과 효과음은 기존 자산을 사용합니다.


| 자산 | 파일 | 출처 | 사용 조건 | 비고 |
|---|---|---|---|---|
| 캐릭터 3D 모델 12종 (리깅 포함) | `public/models/m0.glb` ~ `m11.glb` | 사용자 제공 업로드 파일 12개 (Tripo 계열 자동 리깅 GLB로 추정, 뼈 이름 `Hips/Spine/Left_UpperArm…`) | **사용자 확인 필요** — 생성 도구의 상업적 이용 약관과 얼굴 모델이 된 인물의 동의를 확인하세요 | 원본 텍스처 4096px → 1024px WebP로 변환, `KHR_materials_volume/specular` 제거. 원본 파일명 매핑은 `tools/model_map.json` |
| 시작·로딩 화면 키 아트 | `public/art/keyart.jpg`, `public/art/keyart_load.jpg`(버튼 영역을 잘라낸 로딩용) | 사용자 제공 이미지 (2026-11-03 대화 중 업로드, 1672×941 PNG → JPEG 변환) | **사용자 확인 필요** — 그림 속 실제 인물의 초상 사용 동의와 이미지 생성·제작 도구의 이용 조건 | 로고·START/EXIT가 그림에 포함되어 있어, 실제 버튼은 그림 위 같은 위치에 투명하게 겹쳐 배치 |
| three.js r17x | `node_modules/three` → `dist/main.js`에 번들 | https://threejs.org | MIT License | 렌더링 엔진 |
| esbuild | 빌드 도구 (배포 파일에 미포함) | https://esbuild.github.io | MIT License | |
| gltf-transform, sharp | 모델 최적화 도구 (배포 파일에 미포함) | https://gltf-transform.dev, https://sharp.pixelplumbing.com | MIT / Apache-2.0 | |
| Noto Sans KR / CJK (사용자 기기 글꼴) | 시스템 글꼴 참조만 함, 파일 미포함 | Google Fonts | SIL OFL 1.1 | 기기에 없으면 Apple SD Gothic Neo / 맑은 고딕으로 대체 |
| `RoomEnvironment` (three.js 예제 코드) | 금속 반사용 절차 환경광 | three.js examples | MIT License | 이미지 파일 아님, 코드로 생성 |

### 모델 ↔ 캐릭터 배정 (`src/data/champions.js`의 `model` 값)

배정은 임의로 했습니다. 실제 인물과 맞춰야 하면 `model` 숫자만 바꾸면 됩니다.

| model | 원본 업로드 파일 | 배정 캐릭터 |
|---|---|---|
| m0 | 007a1e57-doctor_figurine_3d_model.glb | 김두영 |
| m1 | 0fbb05c7-doctor_character_3d_model.glb | 구자현 |
| m2 | 14c30796-3d_chibi_doctor_model_1.glb | 방지욱 |
| m3 | 1bb4af40-3d_cartoon_scientist.glb | 팽재현 |
| m4 | 20aabac4-stylized_scientist_3d_model_1.glb | 이선용 |
| m5 | 3b5f8963-stylized_scientist_3d_model.glb | 사공민 |
| m6 | 454676d2-cartoon_scientist_3d_model_1.glb | 차동호 |
| m7 | 4bca1407-3d_character_model.glb | 조강희 |
| m8 | 79659921-cartoon_scientist_3d_model.glb | 정석호 |
| m9 | d249af17-3d_chibi_doctor_model.glb | 박철호 |
| m10 | d7d9c42c-cartoon_scientist_3d_model_2.glb | 최길용 (신규) |
| m11 | e47b59bc-cartoon_doctor_character_3d_model_1.glb | 불꽃남자 (신규) |

## 2. 직접 제작한 자산 (코드로 생성, 외부 파일 없음)

| 분류 | 위치 | 내용 |
|---|---|---|
| 지형 텍스처 6종 (잔디·흙·암석·모래·숲 바닥·판석) | `src/render/textures.js` | 캔버스 노이즈와 붓 터치로 그린 타일링 텍스처 |
| 지형·강물·절벽 | `src/render/terrain.js`, `src/map/*` | 높이맵, 스플랫 셰이더, 강물 셰이더(깊이·흐름·거품) |
| 나무 5종·바위·양치·풀·덤불 | `src/render/props.js` | 정점 색상 절차 모델링, 인스턴싱, 바람 셰이더 |
| 포탑·핵심 수정·회복 샘·상점·깃발 | `src/render/structures.js` | 독자 디자인 |
| 캐릭터별 장비·갑옷·망토·부유 장치 | `src/render/champVisual.js` | 유봉·방패·쌍검·망치·장검·기계 장궁·천체 장치·곡창·마력포·공명 악기 |
| 캐릭터 애니메이션 전부 | `src/render/rig.js` | 대기·이동·방향 전환 기울기·공격(준비→타격→회수)·스킬·피격·사망·귀환 절차 애니메이션 |
| 미니언 3종, 정글 몬스터 3종, 비룡, 협곡 거신 | `src/client/units.js` | **임시 자산** — 기본 도형 조립 모델 (교체 대상) |
| 이펙트 텍스처 8종·파티클·텔레그래프 | `src/render/textures.js`, `src/client/fx.js` | |
| 스킬 아이콘 50종 (패시브 포함) | `src/client/icons.js` | 캔버스 벡터 문양 |
| 초상화 | `src/client/icons.js` | 실제 3D 모델을 실시간 렌더링 |
| 로고·엠블럼 | `src/main.js` (SVG) | 독자 디자인 |
| 효과음·배경음 | `src/client/audio.js` | WebAudio 실시간 합성, 독자 작곡(절차 생성), 음원 파일 없음 |

## 3. 교체 권장 임시 자산

1. **미니언·정글 몬스터·비룡·협곡 거신**: 기본 도형 조립 모델 + 단순 절차 애니메이션. 리깅된 전용 모델로 교체 권장.
2. **캐릭터 몸체**: 12명 모두 흰 가운 치비 체형을 공유합니다. 장비·가운 색·체형 비율로 구분했지만, 갑옷·로브 등을 입힌 전용 의상 모델이 있으면 실루엣이 더 분명해집니다.
3. **효과음**: 합성음입니다. 전용 녹음·디자인 음원으로 교체하면 타격감이 좋아집니다.
