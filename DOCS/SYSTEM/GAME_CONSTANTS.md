# 게임 핵심 상수

> **카테고리:** SYSTEM
> **최초 작성:** 2026-03-23
> **최종 갱신:** 2026-03-24 (Portrait 맵 재설계: COLS 20, ROWS 28, wallProfile 재정의, NEST_ZONE/BASE_ENTRANCE/ENTRANCES 좌표 갱신, resizeCanvas portrait 분기, portrait CSS 보강)
> **관련 기능:** 맵, 게임 루프, 건물, 적, 스폰, 글로벌 업그레이드

## 개요

`game.js` 상단(섹션 1)에 정의된 핵심 상수들을 정리한다. 모든 매직 넘버는 이 섹션에 집중되어 있다. 수치를 변경할 경우 이 섹션만 수정하면 되도록 설계되었다.

---

## 맵 구성

| 상수 | 값 | 설명 |
|------|----|------|
| `TILE_SIZE` | `48` px | 그리드 한 칸의 픽셀 크기 |
| `COLS` | `20` | 열 수 (Portrait 재설계: 30→20) |
| `ROWS` | `28` | 행 수 (Portrait 재설계: 24→28) |
| 전체 월드 크기 | 960 × 1344 px | COLS × TILE_SIZE, ROWS × TILE_SIZE |

> **Portrait 재설계 변경:** 기존 30×24(가로 1440×세로 1152px, 비율 1.25:1 가로형)에서 20×28(가로 960×세로 1344px, 비율 0.71:1 세로형)으로 변경되었다. 세로(Portrait) 화면에서 스크롤 없이 맵 전체를 볼 수 있도록 비율을 반전시켰다. 내부 기지(불규칙 타원형 외벽으로 둘러싸인 건설 공간) + 외부 행진 공간 구조는 유지된다.

> **이전 변경:** 기존 12×16 맵에서 30×24 맵으로 전면 확대되었다 (Phase 6 맵 재설계). 이번 Portrait 재설계는 그 후속 변경이다.

---

## 타일 타입 (TILE enum)

| 값 | 상수명 | 의미 |
|----|--------|------|
| `0` | `EMPTY` | 건물 배치 가능한 빈 공간 |
| `1` | `BLOCKED` | 배치 불가 (외벽, 모서리 장식) |
| `2` | `ENTRANCE` | 적 입구 — 스폰 위치 |
| `3` | `NEST` | 핵심 둥지 |
| `4` | `WALL` | 성벽 |
| `5` | `THORN` | 가시 촉수 (Phase 3 교체) |
| `6` | `RESOURCE` | 자원 건물 |
| `7` | `SPORE` | 산성 포자 (Phase 3 신규) |
| `8` | `REPAIR_BLD` | 구조물 수리 건물 (Phase 3 신규) |
| `9` | `SPAWN` | 적 스폰 지점 (Phase 6 신규) |

> **Phase 3 변경:** 기존 `5: TOWER`가 `5: THORN`으로 교체되었다. TOWER 타일 값은 더 이상 사용되지 않는다. SPORE(7)와 REPAIR_BLD(8)가 신규 추가되었다.

> **Phase 6 변경:** `SPAWN(9)` 타일이 추가되었다. 기존 ENTRANCE 타일과 별개로, 맵 가장자리의 적 스폰 지점을 명시적으로 구분한다. SPAWN 타일에는 해골(💀) 마크가 렌더링되며 배경색은 `#1a0808`(어두운 빨간색)이다.

---

## 맵 특수 구역

### 핵심 둥지 배치 가능 영역 (NEST_ZONE)

```
colMin: 9, colMax: 10, rowMin: 3, rowMax: 4
```

> **Portrait 재설계 변경:** COLS=20 기준으로 중심 열(col 9~10)에 재배치되었다. 기존 COLS=30 기준 col 14~15에서 COLS=20 기준 col 9~10으로 변경. 보라색 타일 4칸(2×2) 중 어디를 터치해도 좌상단 고정 좌표(9, 3)에 NEST가 자동 배치된다.

### BLOCKED 타일 생성 조건 (createGrid)

외벽은 `wallProfile` 배열로 행별 좌/우 경계를 정의하는 불규칙 타원형 구조이다. COLS=20 기준으로 재설계되었다.

- **기지 외벽:** 파괴 불가능한 BLOCKED 타일로 이루어진 불규칙 타원 형태
- **기지 내부:** 건설 가능 공간 (NEST, THORN, SPORE, RESOURCE, REPAIR, WALL 배치)
- **기지 외부:** 넓은 행진 공간 (적이 스폰 지점에서 기지 입구까지 이동하는 경로), row 19~27
- **기지 입구:** 1개, 2타일 폭 (row 18, col 9~10). WALL 2개를 배치하여 봉쇄 가능. ENTRANCE 타일에는 WALL만 배치 허용

> **Portrait 재설계 변경:** COLS=20, ROWS=28 기준으로 wallProfile 전체가 재정의되었다. 기존 COLS=30 기준 입구 row 13/col 14~15에서 COLS=20 기준 row 18/col 9~10으로 변경. 기지 아래 row 19~27(9개 행)의 넓은 접근로가 확보되어 portrait에서 세로 방향 행진 거리가 길어졌다.

#### 외벽 생성 방식 (wallProfile)

외벽은 `wallProfile` 배열로 행별 좌/우 경계를 정의한다. 각 항목은 `[row, leftCol, rightCol]` 형태이다.

```
wallProfile (COLS=20 기준):
  row 2:  좌벽 col 7,  우벽 col 12  (상단 수평벽 col 7~12로 봉인)
  row 3:  좌벽 col 5,  우벽 col 14
  row 4:  좌벽 col 4,  우벽 col 15
  row 5:  좌벽 col 3,  우벽 col 16
  row 6:  좌벽 col 3,  우벽 col 16
  row 7:  좌벽 col 3,  우벽 col 16
  row 8:  좌벽 col 3,  우벽 col 16
  row 9:  좌벽 col 3,  우벽 col 16
  row 10: 좌벽 col 3,  우벽 col 16
  row 11: 좌벽 col 3,  우벽 col 16
  row 12: 좌벽 col 3,  우벽 col 16
  row 13: 좌벽 col 3,  우벽 col 16
  row 14: 좌벽 col 4,  우벽 col 15
  row 15: 좌벽 col 5,  우벽 col 14
  row 16: 좌벽 col 6,  우벽 col 13
  row 17: 좌벽 col 7,  우벽 col 12
  row 18: 좌벽 col 8,  우벽 col 11  (입구 row — col 9, 10은 ENTRANCE)
```

#### 틈 없는 외벽 보장 규칙

인접 행 간 좌벽 또는 우벽의 열 번호가 달라지면, 열 번호가 변하는 구간의 중간 타일을 모두 BLOCKED로 채운다. 이를 통해 모든 벽 타일이 상하좌우(4방향)로 연결되며, 대각선만 연결되는 틈이 발생하지 않는다.

```
예시: row 2 좌벽 col 7, row 3 좌벽 col 5
  → col 5~7 구간을 row 3에서 모두 BLOCKED 처리
  → 4방향 연결 보장
```

추가로 상단 수평벽(row 2, col 7~12)과 하단 입구 행(row 18)은 별도로 가로 방향 BLOCKED 타일을 채워 외벽을 닫는다.

> **Portrait 재설계 변경:** COLS=30 기준 wallProfile(row 1~13, 외벽 col 6~23)에서 COLS=20 기준 wallProfile(row 2~18, 외벽 col 3~16)으로 전면 재정의되었다. 외벽은 여전히 파괴 불가능하며, 적은 BLOCKED 타일을 통과할 수 없다(`hitsBlockedTile` 9지점 검사로 보장).

---

## 적 스폰 지점 (ENTRANCES)

8개 ENTRANCE 타일이 4방향(3시/5시/7시/9시)에 배치된다. 각 방향당 2타일씩, 총 8개 스폰 지점이다. 스폰 시 라운드로빈 방식으로 순차 사용된다. 적은 이 지점에서 스폰하여 BFS 거리맵을 따라 기지 입구(row 18, col 9~10)까지 이동한다.

스폰 좌표는 상수가 아닌 `COLS`, `ROWS` 비율 공식으로 자동 계산된다. COLS/ROWS 변경 시 재계산 없이 자동 반영된다.

| 인덱스 | 방향 | col | row | 픽셀 중심 | 계산식 |
|--------|------|-----|-----|-----------|--------|
| 0 | 3시 (우측) | 18 | 14 | (888, 696) | col=COLS-2, row=floor(ROWS/2) |
| 1 | 3시 (우측) | 18 | 15 | (888, 744) | col=COLS-2, row=floor(ROWS/2)+1 |
| 2 | 5시 (우하) | 14 | 26 | (696, 1272) | col=floor(COLS*0.7), row=ROWS-2 |
| 3 | 5시 (우하) | 15 | 26 | (744, 1272) | col=floor(COLS*0.7)+1, row=ROWS-2 |
| 4 | 7시 (좌하) | 6 | 26 | (312, 1272) | col=floor(COLS*0.3), row=ROWS-2 |
| 5 | 7시 (좌하) | 5 | 26 | (264, 1272) | col=floor(COLS*0.3)-1, row=ROWS-2 |
| 6 | 9시 (좌측) | 1 | 14 | (72, 696) | col=1, row=floor(ROWS/2) |
| 7 | 9시 (좌측) | 1 | 15 | (72, 744) | col=1, row=floor(ROWS/2)+1 |

ENTRANCE 타일은 맵 최외곽 벽 위에 ENTRANCE로 덮어씌워진다. 기지 입구(row 18, col 9~10)의 ENTRANCE 타일과는 별도로, 스폰 전용 ENTRANCE 타일이다.

> **Portrait 재설계 변경:** COLS=20, ROWS=28 기준으로 스폰 좌표가 자동 재계산되었다. 비율 공식이 유지되므로 별도 하드코딩 수정 없이 반영된다. 3시/9시 스폰 행이 row 12→14로, 5시/7시 스폰 행이 row 22→26으로 이동하였다.

> **이전 4방향 스폰 변경:** 기존에는 5개 스폰 지점이 모두 맵 하단에 균등 배치되었다. BFS 거리맵 도입과 함께 스폰 지점이 4방향으로 분산되었다 (ADR-007 참조).

---

## NEST 레벨별 건물 배치 제한 (NEST_BUILD_CAP)

| 상수 | 값 | 설명 |
|------|----|------|
| `NEST_BUILD_CAP` | `[5, 10, 25]` | NEST 레벨별 배치 가능 건물 수 (NEST 제외) |

| NEST Lv | 최대 건물 수 |
|---------|------------|
| Lv.1 | 5 |
| Lv.2 | 10 |
| Lv.3 | 25 |

---

## NEST 자원 생산 상수

| 상수 | 값 | 설명 |
|------|----|------|
| `NEST_RESOURCE_INTERVAL` | `8` 초 | NEST 자원 생산 간격 |
| `NEST_RESOURCE_AMOUNT` | `[5, 10, 20]` | NEST 레벨별 생산량 (Lv.1=5, Lv.2=10, Lv.3=20) |

NEST 건물이 `built: true && !upgrading` 상태일 때 자원을 생산한다. 광고 버프 활성 시 2배.

---

## 기지 입구 좌표 (BASE_ENTRANCE)

| 상수 | 값 | 설명 |
|------|----|------|
| `BASE_ENTRANCE` | `[{col:9, row:18}, {col:10, row:18}]` | WALL 철거 시 ENTRANCE 복원용 좌표 |

`removeBuilding()` 내부에서 타일 복원 시 이 좌표와 일치하면 EMPTY 대신 ENTRANCE로 복원한다.

> **Portrait 재설계 변경:** 기존 `[{col:14, row:13}, {col:15, row:13}]`에서 `[{col:9, row:18}, {col:10, row:18}]`으로 변경. 입구 위치가 맵 하단(row 18)의 중앙(col 9~10)으로 이동하였다.

---

## 광고 버프 상태 (G.adBuff)

| 필드 | 타입 | 초기값 | 설명 |
|------|------|--------|------|
| `G.adBuff.active` | boolean | false | 버프 활성 여부 |
| `G.adBuff.timer` | number | 0 | 남은 버프 시간(초) |

COUNTDOWN / WAVE 상태에서만 활성화 가능. 60초간 RESOURCE 건물 + NEST 자원 생산량 2배.

---

## 게임 타이밍

| 상수 | 값 | 설명 |
|------|----|------|
| `GAME_DURATION` | `900` 초 | 전체 제한 시간 (15분 생존 시 승리). Phase 7에서 600s(10분)에서 900s(15분)으로 변경 |
| `COUNTDOWN_DURATION` | `30` 초 | PREP → WAVE 전환 전 건설 준비 시간 |
| `DT_MAX` | `0.1` 초 | 탭 전환 후 dt 클램핑 한계값 |
| NEST 건설 시간 | `5` 초 | `BUILDING_DEFS.NEST.buildTime`으로 관리 |

---

## 성벽 용량

| 상수 | 값 | 설명 |
|------|----|------|
| `WALL_MAX_CAPACITY` | `5` 슬롯 | 성벽 1개당 동시 공격 가능 최대 용량 |

slotCost에 따른 실제 수용 인원:
- `CITIZEN` (slotCost 1): 최대 5마리 동시 공격
- `FAST`, `TANKER` (slotCost 2): 최대 2마리 동시 공격
- `WARRIOR` (slotCost 3): 최대 1마리 동시 공격
- 용량 초과 적은 성벽 앞에서 대기하며, 빈 슬롯이 생기면 자동 합류한다.

---

## 자가 수리 상수

| 상수 | 값 | 설명 |
|------|----|------|
| `HEAL_INTERVAL` | `10` 초 | 자가 수리 발동 주기 |
| `HEAL_AMOUNT` | 동적 계산 | 1회 회복량 (Phase 5: SELF_REPAIR 레벨 + NEST 레벨 연동) |

`G.globalUpgrades.SELF_REPAIR > 0`이면 활성화된다. Phase 3에서 추가된 REPAIR 건물의 지속 수리와는 별개로 동작한다.

**Phase 5 변경 — HEAL_AMOUNT 동적 계산:**

Phase 4까지 NEST 레벨에만 연동되던 회복량이 Phase 5에서 SELF_REPAIR 글로벌 업그레이드 레벨(1~30)과 NEST 레벨(1~3) 양쪽에 연동된다. 기존 `NEST_UPGRADES` 상수와 `G.selfRepairUnlocked` 플래그는 제거되었다.

**공식:**
```
healAmt = (8 + srLv × 4) + (nestLv - 1) × 4
```

| SELF_REPAIR Lv | NEST Lv.1 | NEST Lv.2 | NEST Lv.3 |
|----------------|-----------|-----------|-----------|
| Lv.1 | 12 | 16 | 20 |
| Lv.10 | 48 | 52 | 56 |
| Lv.20 | 88 | 92 | 96 |
| Lv.30 | 128 | 132 | 136 |

---

## 건물 레벨 상한 (maxLv)

Phase 4에서 도입된 값으로, 각 건물 타입의 최대 업그레이드 레벨을 정의한다. `BUILDING_DEFS[type].maxLv`에 저장되며 `startUpgrade()`에서 상한 체크에 사용된다.

| 건물 타입 | maxLv |
|----------|-------|
| `THORN` | 5 |
| `SPORE` | 5 |
| `REPAIR` | 5 |
| `RESOURCE` | 5 |
| `NEST` | 3 |
| `WALL` | 10 |

---

## 초기 자원

| 상수 | 값 |
|------|----|
| `INITIAL_RESOURCE` | `200` |

게임 시작(initGame) 시 플레이어가 보유하는 자원량.

---

## 레이아웃 상수

| 상수 | 값 | 설명 |
|------|----|------|
| `HUD_TOP_H` | `40` px | 상단 HUD 높이 (기본값; 실제 높이는 `offsetHeight`로 동적 읽음) |
| `BUILD_PANEL_H` | `72` px | 하단 건물 선택 패널 높이 |

`resizeCanvas()`에서 캔버스 가용 높이 계산 시 이 두 값을 제외한다.

### resizeCanvas() 로직

```
1. HUD 실제 높이를 동적으로 읽는다
   hudH = document.getElementById('hud-top').offsetHeight || HUD_TOP_H
   (portrait에서 HUD가 2줄로 배치되면 기본값 40px보다 커질 수 있다)

2. portrait 여부를 판단하여 하단 버튼 여백 추가 확보
   isPortrait = window.innerHeight > window.innerWidth
   bottomUI   = isPortrait ? 72 : 0
   (portrait에서 ad-buff-btn, pause-btn, build-trigger-bar가 canvas 아래에 고정되므로
    72px의 공간을 추가로 제외하여 버튼과 canvas가 겹치지 않도록 한다)

3. 가용 영역 계산
   availW = window.innerWidth
   availH = window.innerHeight - hudH - BUILD_PANEL_H - bottomUI

4. 맵 비율을 유지하며 표시 크기 결정 (최대 1.0배 — 확대 없음)
   scale    = min(availW / gridW, availH / gridH, 1.0)
   displayW = floor(gridW * scale)
   displayH = floor(gridH * scale)

5. canvas의 논리 크기는 항상 월드 크기(960×1344px)를 유지
   canvas.width  = COLS * TILE_SIZE  (= 960)
   canvas.height = ROWS * TILE_SIZE  (= 1344)

6. canvas를 HUD 아래에 배치
   canvas.style.marginTop = hudH + 'px'

7. G.canvasScale = scale  (터치 좌표 보정용)
```

> **Portrait 재설계 변경:** portrait 분기(`isPortrait`, `bottomUI=72px`)가 추가되었다. HUD 높이도 `offsetHeight`로 동적으로 읽도록 변경되어, portrait에서 HUD가 2줄로 배치될 때 높이가 자동 반영된다.

### UI 버튼 배치

| 버튼 | CSS 위치 | 기본 크기 | Portrait 크기 |
|------|----------|-----------|--------------|
| 건설 트리거 (`#build-trigger-btn`) | right:12px, bottom:12px | min-width:80px, min-height:48px | min-height:40px |
| 광고 버프 (`#ad-buff-btn`) | left:12px, bottom:12px | 44x44px | 38x38px, bottom:10px, left:10px |
| 일시정지 (`#pause-btn`) | — | — | 38x38px, bottom:10px, left:60px |
| 줌 컨트롤 (`#zoom-controls`) | right:12px, top:50px | 48x48px (각 버튼) | 40x40px |
| 건설 트리거 바 (`#build-trigger-bar`) | bottom:12px | — | bottom:10px |

> **Phase 7 변경:** 건설 버튼=우하단, 광고 버프=좌하단, 줌=우상단. 하단 양쪽 모서리에 주요 액션 버튼을 배치하여 엄지 접근성을 높이고, 줌은 자주 쓰지 않으므로 우상단으로 이동시켰다.

### 모바일 세로(Portrait) 미디어 쿼리

`@media (orientation: portrait)` 조건으로 세로 화면 최적화가 적용된다.

| 요소 | Portrait 조정 내용 | 이유 |
|------|-------------------|------|
| `#hud-top` | flex-wrap: wrap, padding: 3px 6px, gap: 2px 6px, font-size: 11px | 세로폭 부족 시 HUD 항목을 2줄로 자동 배치 |
| `.hud-item` | flex: 1 0 auto, min-width: 55px | 줄바꿈 시 최소 너비 확보 |
| `.hud-label` | font-size: 9px | 공간 절약 |
| `.hud-value` | font-size: 12px | 공간 절약 |
| `#hud-wave .hud-value` | min-width: 60px, font-size: 11px | 웨이브 텍스트가 길어질 때 여유 확보 |
| `#building-panel` | max-height: 40vh, overflow-y: auto | 패널이 화면 절반 이상을 차지하지 않도록 제한 |
| `.bp-btn` | min-height: 30px, font-size: 11px | 공간 절약 |
| `#build-trigger-btn` | min-height: 40px, font-size: 12px | 터치 영역 최소 확보 |
| `#zoom-controls button` | 40x40px | 공간 절약 |
| `#ad-buff-btn` | 38x38px, bottom:10px, left:10px | 버튼 위치 일관화 |
| `#pause-btn` | 38x38px, bottom:10px, left:60px | ad-buff-btn 옆에 나란히 배치 |
| `#build-trigger-bar` | bottom: 10px | 다른 하단 버튼과 기준선 일치 |
| `#nest-popup` | min-width: 170px, max-height: 60vh | 세로 공간 제한 |
| `.nest-popup-btn` | font-size: 10px, padding: 5px 6px | 공간 절약 |

> **Portrait 재설계 변경:** `#hud-top`에 `flex-wrap: wrap`과 `.hud-item min-width: 55px`가 추가되어 HUD 항목이 2줄로 자동 배치된다. 하단 버튼 3개(ad-buff-btn, pause-btn, build-trigger-bar) 모두 `bottom: 10px`로 일관화되었다.

---

## 글로벌 업그레이드 상수 (GLOBAL_UPGRADES)

Phase 5에서 도입된 `GLOBAL_UPGRADES` 상수 배열. 6종 업그레이드를 정의하며 각 30레벨이다. Phase 4까지 사용되던 `NEST_UPGRADES`(1종, boolean)를 전면 교체한다.

| ID | 이름 | maxLv | 레벨당 효과 | Lv.30 최대 효과 |
|----|------|-------|-----------|----------------|
| `SELF_REPAIR` | 자가 수리 강화 | 30 | +4 HP/주기 | 128 HP/10s (NEST Lv.1 기준) |
| `THORN_BOOST` | 촉수 강화 | 30 | +3% 공격력, +2% 발사속도 | +90% / +60% |
| `SPORE_BOOST` | 포자 강화 | 30 | +3% 공격력, +5% 슬로우 지속 | +90% / +150% |
| `WALL_DEFENSE` | 방벽 방어력 | 30 | +2% WALL 피해 감소 | 60% |
| `RESOURCE_BOOST` | 자원 증폭 | 30 | +3% 생산량 | +90% |
| `WALL_FORTIFY` | 방벽 강화 | 30 | +3% WALL hpMax | +90% |

> **Phase 6 변경:** `NEST_SHIELD`(둥지 보호막, +1.5% NEST 피해 감소)가 제거되고 `WALL_DEFENSE`(방벽 방어력, +2% WALL 피해 감소)로 교체되었다. 6종 모두 동일한 비용 배열을 사용한다 (시작 100, 배율 x1.18, Lv.30 = 12,150). 상세 비용표와 적용 공식은 `DOCS/FEATURES/GLOBAL_UPGRADES.md`를 참고한다.

---

## G.globalUpgrades 객체

`initGame()`에서 초기화되는 게임 상태 객체. 각 업그레이드의 현재 레벨(0~30 정수)을 저장한다.

```javascript
G.globalUpgrades = {
  SELF_REPAIR:    0,
  THORN_BOOST:    0,
  SPORE_BOOST:    0,
  WALL_DEFENSE:   0,
  RESOURCE_BOOST: 0,
  WALL_FORTIFY:   0,
};
```

Phase 4까지 사용되던 `G.nestUpgrades`(Set)와 `G.selfRepairUnlocked`(boolean)는 제거되었다. 게임 재시작 시 모든 레벨이 0으로 초기화된다.

---

## 9지점 BLOCKED 충돌 검사 (hitsBlockedTile)

적의 이동(`moveToward`)과 충돌 해소(`resolveCapsuleCollisions`) 양쪽에서 사용되는 공용 함수이다. 적의 원형 몸체가 BLOCKED 타일에 겹치는지를 9개 검사 지점으로 판정한다.

### 검사 지점 (9개)

```
중심(0,0) + 상하좌우 4방향(±rad, 0), (0, ±rad) + 대각선 4방향(±rad, ±rad)

offsets = [
  [0,0],                              // 중심
  [-rad,0], [rad,0], [0,-rad], [0,rad], // 상하좌우
  [-rad,-rad], [rad,-rad], [-rad,rad], [rad,rad]  // 대각선
]
```

### 판정 로직

```
각 오프셋(ox, oy)에 대해:
  타일 좌표 = (floor((px+ox)/TILE_SIZE), floor((py+oy)/TILE_SIZE))
  해당 타일이 BLOCKED이면 → true 반환
모든 지점이 통과하면 → false 반환
```

맵 경계 밖(col < 0, col >= COLS, row < 0, row >= ROWS)은 false로 처리한다 (BLOCKED가 아닌 것으로 간주).

### 9지점을 사용하는 이유

단일 중심점만 검사하면 적의 반지름(radius = 7~12px) 크기의 몸체가 BLOCKED 타일과 겹치는 경우를 놓칠 수 있다. 특히 대각선 이동 시 몸체 가장자리가 벽 모서리에 걸리는 경우가 빈번하다. 상하좌우 4방향만으로는 대각선 방향 겹침을 감지하지 못하므로, 대각선 4방향을 추가하여 총 9지점으로 완전한 커버리지를 확보했다.

### 사용처

| 함수 | 용도 |
|------|------|
| `moveToward(e, tx, ty, dt)` | 이동 후 BLOCKED 진입 시 3단계 슬라이딩 (전체 롤백 → X축만 → Y축만) |
| `resolveCapsuleCollisions()` | separation push 후 건물 타일 포함 고체 진입 시 push 롤백 |

---

## 9지점 고체 타일 충돌 검사 (hitsSolidTile) — Phase 6 추가

`hitsBlockedTile`과 동일한 9지점 검사 구조이지만, `isSolidTile()` 함수로 BLOCKED 타일뿐 아니라 건물 타일(WALL, THORN, SPORE, REPAIR_BLD, RESOURCE, NEST)도 통과 불가로 판정한다.

```javascript
function isSolidTile(tile) {
  return tile === TILE.BLOCKED || tile === TILE.WALL || tile === TILE.THORN
      || tile === TILE.SPORE || tile === TILE.REPAIR_BLD
      || tile === TILE.RESOURCE || tile === TILE.NEST;
}
```

`hitsSolidTile()`은 `resolveCapsuleCollisions()`에서 separation push 후 적이 건물 타일 위로 밀려나는 것을 방지한다. 이동(`moveToward`)에서는 기존 `hitsBlockedTile()`을 계속 사용한다 (적이 건물에 인접하여 공격하기 위해 건물 타일 옆까지 이동할 수 있어야 하므로).

---

## BFS 거리맵 상태 (G.distanceMap / G.distanceMapDirty)

BFS 거리맵 길찾기에서 사용되는 게임 상태 필드이다. ADR-007 참조.

| 필드 | 타입 | 초기값 | 설명 |
|------|------|--------|------|
| `G.distanceMap` | `Float32Array[][]` | `null` | NEST에서 각 타일까지의 BFS 거리 (타일 단위). 도달 불가 타일은 `Infinity` |
| `G.distanceMapDirty` | `boolean` | `true` | 건물 변경 시 `true`로 설정. 다음 프레임 시작 시 `computeDistanceMap()` 호출 트리거 |

> **Phase 6 변경 — BFS 거리맵 건물 타일 전파:** 기존에는 "건물 타일에 거리를 기록하되 BFS 큐에 넣지 않음"이었으나, Phase 6에서 건물 타일도 BFS 큐에 넣어 전파하도록 변경되었다. BLOCKED 타일만 통행 불가이다. 적은 거리맵을 따라 이동하되, 인접 타일에 건물이 있으면 해당 건물을 공격 타겟으로 설정한다. 이 변경으로 건물 배치가 적의 경로를 완전히 차단하지 않으며, 적은 건물 위치까지 접근한 후 공격한다.

### dirty 설정 시점

| 이벤트 | 함수 |
|--------|------|
| 건물 배치 | `createBuilding()` |
| 건물 제거/파괴 | `removeBuilding()` |
| 건설 완료 | `updateBuildTimers()` 내 `built = true` 전환 시 |
