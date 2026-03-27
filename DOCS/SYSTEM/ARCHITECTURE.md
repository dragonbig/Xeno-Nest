# 시스템 아키텍처

> **카테고리:** SYSTEM
> **최초 작성:** 2026-03-23
> **최종 갱신:** 2026-03-28 (스테이지 시스템 도입: G.stageConfig 필드 추가, 전역 상수 NEST_ZONE/BASE_ENTRANCE/ENTRANCES 제거, STAGES 배열 및 createGrid/initGame 시그니처 변경, 맵 에디터 모듈 추가)
> **관련 기능:** 게임 루프, 상태 관리, 렌더링 파이프라인, 스테이지 시스템

## 개요

XenoNest는 외부 라이브러리 의존성 없이 바닐라 JavaScript ES6+와 HTML5 Canvas 2D API만으로 구현된 모바일 타워 디펜스 게임이다. 모든 게임 상태는 단일 `G` 객체에 집중 관리되며, `requestAnimationFrame` 기반 게임 루프가 매 프레임 업데이트와 렌더링을 순차 실행한다.

---

## 기술 스택

| 항목 | 내용 | 선택 이유 |
|------|------|-----------|
| 렌더링 | HTML5 Canvas 2D | 2D 타일 기반 게임에 충분한 성능, WebGL 불필요 |
| 언어 | 바닐라 JavaScript ES6+ | 빌드 툴체인 없이 `index.html` 직접 실행 가능 |
| 게임 루프 | `requestAnimationFrame` | 브라우저 VSync 연동, 탭 비활성 시 자동 throttle |
| 상태 관리 | 단일 `G` 객체 | 전역 변수 분산 방지, 초기화 시 `G` 전체 교체로 완전 리셋 |
| 엔티티 모델 | 일반 객체 리터럴 배열 | 이 규모에서 ECS는 과설계 (코드 주석 명시) |
| 지형 캐싱 | offscreen Canvas | 변경 없는 타일을 매 프레임 재드로우하지 않음 |

---

## 전체 아키텍처 다이어그램

```
index.html
├── style.css              (레이아웃 + HUD + 패널 스타일)
├── game.js                (전체 게임 로직)
└── map-editor.html        (독립 실행형 맵 에디터 — 스테이지 rawGrid JSON 생성 도구)
    │
    ├── 상수 정의           (TILE_SIZE, COLS, ROWS, BUILDING_DEFS, ENEMY_DEFS, ...)
    ├── G 객체              (단일 게임 상태 저장소)
    │
    ├── 게임 루프 (requestAnimationFrame)
    │   ├── update(dt)
    │   │   ├── updateBuildTimers(dt)
    │   │   ├── updateWave(dt)          ← 스폰 스케줄 관리
    │   │   ├── updateEnemies(dt)       ← pursueTarget + 충돌 해소
    │   │   ├── updateTowers(dt)        ← 타겟팅 + 발사
    │   │   ├── updateProjectiles(dt)   ← 투사체 이동 + 히트 판정
    │   │   ├── updateEnemyProjectiles(dt)
    │   │   ├── updateResourceBuildings(dt)
    │   │   └── updateRepair(dt)
    │   ├── render()
    │   │   ├── renderTerrain()         ← offscreen 캐시 (dirty 시만 재드로우)
    │   │   ├── renderBuildings()
    │   │   ├── renderEnemies()
    │   │   ├── renderProjectiles()
    │   │   └── renderEnemyProjectiles()
    │   ├── updateHUD()                 ← DOM 업데이트
    │   ├── updateBuildPanel()          ← DOM 업데이트
    │   ├── tickBuildingPanelHP()       ← DOM 부분 업데이트 (HP + 버튼 disabled)
    │   ├── updateAdBuff(dt)            ← 광고 버프 타이머
    │   ├── updateFloatingTexts(dt)     ← 피해량 플로팅 텍스트 업데이트
    │   └── renderFloatingTexts()       ← 피해량 플로팅 텍스트 렌더링
    │
    ├── 입력 처리
    │   ├── mousedown / mousemove / mouseup   (드래그 팬 + 클릭 분기)
    │   ├── touchstart / touchmove / touchend (터치 동일 처리)
    │   └── zoom-in / zoom-out 버튼
    │
    └── UI 패널 (DOM)
        ├── build-trigger-bar  (우하단 건설 버튼 1개, right:12px bottom:12px)
        ├── radial-menu        (원형 건물 선택 메뉴, DOM 오버레이)
        ├── building-radial    (건물 클릭 시 원형 액션 메뉴 — 진화/철거/정보)
        ├── building-panel     (건물 정보/진화/철거 — 정보 아이콘으로 접근)
        ├── hud-top            (자원 / 위협 단계 / 남은 시간 / 둥지 HP)
        ├── ad-buff-btn        (좌하단 광고 버프 버튼, left:12px bottom:12px)
        ├── zoom-controls      (우상단 줌 버튼, right:12px top:50px)
        ├── nest-popup         (NEST 클릭 시 업그레이드/정보 팝업)
        └── overlay            (시작 화면 / 게임 오버)

> **Phase 7 변경 — UI 버튼 위치 재배치:**
> - 건설 버튼: 중앙 하단 → 우하단 (`right:12px, bottom:12px`)
> - 광고 버프: 좌상단 → 좌하단 (`left:12px, bottom:12px`)
> - 줌 컨트롤: 우측 중앙 → 우상단 (`right:12px, top:50px`)
>
> **Phase 7 변경 — 건물 클릭 시 Radial Menu:**
> 건물 클릭 시 정보 패널이 직접 열리지 않고, `openBuildingRadialMenu()`로 원형 액션 메뉴가 먼저 표시된다. NEST는 진화+정보(2개), 일반 건물은 진화+철거+정보(3개).
>
> **Phase 7 변경 — 모바일 세로(Portrait) 최적화:**
> `@media (orientation: portrait)` 미디어 쿼리를 통해 세로 화면에서 HUD 패딩/폰트 축소, building-panel 높이 제한(40vh + overflow-y:auto), 버튼 크기 축소(줌 40px, 광고 38px, 건설 min-height 40px)가 적용된다.
>
> **Portrait 재설계 변경 — resizeCanvas portrait 분기:**
> `resizeCanvas()`에 `isPortrait` 분기가 추가되었다. portrait일 때 `bottomUI=72px`를 가용 높이에서 추가 제외하여 하단 버튼 영역이 canvas와 겹치지 않는다. HUD 높이도 `offsetHeight`로 동적으로 읽어 2줄 배치 시 자동 반영된다.
>
> **Portrait 재설계 변경 — positionNestPopup 좌표 계산:**
> `positionNestPopup()`이 `canvas.getBoundingClientRect()`로 canvas의 실제 CSS 위치를 읽어 `canvasOffsetX/Y`를 계산한다. landscape에서 canvas가 화면 중앙에 정렬될 때 발생하던 팝업 위치 오류가 수정되었다.
>
> **Portrait 재설계 변경 — resize 핸들러:**
> `window.addEventListener('resize', ...)` 핸들러에서 `G._nestPopupOpen`이 `true`이면 `positionNestPopup()`을 재호출한다. 화면 회전 시 팝업이 잘못된 위치에 남는 문제가 수정되었다.
```

---

## 게임 상태 머신

게임은 5개 상태를 순서대로 전이한다. `G.state`에 현재 상태가 저장된다.

```
IDLE
  └─(게임 시작 버튼)─→ PLACING
                          └─(NEST 배치)─→ PREP
                                           └─(건설 완료, 5초)─→ COUNTDOWN
                                                                    └─(30초 경과)─→ WAVE
                                                                                      ├─(NEST HP 0)─→ GAME_OVER
                                                                                      └─(900초 생존)─→ GAME_OVER(Victory)
```

| 상태 | 설명 | update() 동작 |
|------|------|--------------|
| `IDLE` | 시작 오버레이 표시 | 아무것도 실행하지 않음 |
| `PLACING` | 핵심 둥지 배치 대기 | 아무것도 실행하지 않음 |
| `PREP` | 둥지 건설 중 (5초) | `updateBuildTimers`만 실행 |
| `COUNTDOWN` | 30초 건설 준비 시간 | 타이머 감소 + 자원건물 생산 |
| `WAVE` | 웨이브 진행 중 | 전체 업데이트 실행 |
| `GAME_OVER` | 게임 종료 | 아무것도 실행하지 않음 |

---

## 단일 G 객체 구조

`initGame()`이 호출될 때마다 `G`가 완전히 새 객체로 교체된다. 재시작 시 이전 상태가 남지 않음을 보장한다.

```javascript
G = {
  state,            // 현재 게임 상태 (STATE enum)
  grid,             // 타일 타입 2D 배열 (stageConfig.rows × stageConfig.cols)
  stageConfig,      // 현재 스테이지 설정 객체 { id, name, cols, rows, rawGrid, baseEntrance, nestZone, spawnPoints }
  buildings,        // 건물 객체 배열
  enemies,          // 적 객체 배열
  projectiles,      // 타워 투사체 배열
  enemyProjectiles, // 적(MAGE) 투사체 배열
  resource,         // 현재 자원량
  gameTimer,        // WAVE 진입 후 경과 시간(초)
  spawnTimer,       // 다음 스폰 배치까지 남은 시간
  scheduleIdx,      // 현재 SPAWN_SCHEDULE 인덱스
  pendingSpawn,     // 캡 초과로 보류된 적 수 { CITIZEN, SCOUT, ... }
  countdown,        // COUNTDOWN 남은 시간(초)
  nestTile,         // { col, row } — 핵심 둥지 위치
  nestBuilding,     // 핵심 둥지 building 객체 참조
  selectedBuild,    // 배치 모드 선택 건물 타입 키
  selectedBuildingId, // 정보 패널에 열린 건물 id
  nextId,           // 엔티티 고유 ID 카운터
  towerTimers,      // { towerId: 다음 발사까지 남은 시간 }
  resourceTimers,   // { resourceBldId: 다음 생산까지 남은 시간 }
  globalUpgrades,   // { SELF_REPAIR, THORN_BOOST, SPORE_BOOST, WALL_DEFENSE, RESOURCE_BOOST, WALL_FORTIFY } (각 0~30)
  repairTimer,      // 자가 수리 타이머
  floatingTexts,    // 피해량 플로팅 텍스트 배열 { x, y, text, color, life, maxLife }
  adBuff,           // { active: boolean, timer: number } 광고 버프 상태
  prevTime,         // 이전 프레임 timestamp (dt 계산용)
  camera,           // { x, y, zoom }
  drag,             // { active, startX, startY, camStartX, camStartY, moved }
  canvasScale,      // CSS 표시 축소 비율 (터치 좌표 보정용)
  _loopRunning,     // 루프 중복 시작 방지 플래그
}
```

> **스테이지 시스템 변경:** `G.stageConfig`가 추가되었다. 기존에 전역 상수로 관리되던 `NEST_ZONE`, `BASE_ENTRANCE`, `ENTRANCES`가 제거되고, 해당 데이터는 `G.stageConfig.nestZone`, `G.stageConfig.baseEntrance`, `G.stageConfig.spawnPoints`로 이전되었다. 모든 참조 코드는 `G.stageConfig.*` 경로를 사용해야 한다. `G.grid`의 크기도 고정 12×16 또는 20×28이 아닌 `stageConfig.cols × stageConfig.rows`로 동적으로 결정된다.

```javascript
```

---

## 렌더링 레이어 순서

매 프레임 `render()` 함수 내에서 다음 순서로 그린다. Canvas 2D는 후순위 레이어가 전순위를 덮는다.

| 순서 | 레이어 | 구현 |
|------|--------|------|
| 1 | 지형 (타일 배경 + 그리드선) | offscreen `terrainCanvas` → `drawImage` |
| 2 | 건물 | `renderBuildings()` |
| 3 | 적 | `renderEnemies()` |
| 4 | 타워 투사체 | `renderProjectiles()` |
| 5 | 적 원거리 투사체 | `renderEnemyProjectiles()` |

카메라 변환(`ctx.save` → `scale` → `translate` → ... → `ctx.restore`)은 레이어 1~5 전체를 감싼다. HUD와 DOM 패널은 Canvas 외부이므로 카메라 영향을 받지 않는다.

---

## offscreen Terrain Canvas 캐싱

지형 레이어(타일 배경 색상, 그리드선, 입구 표시, 핵심 둥지 배치 가능 영역 하이라이트)는 변경이 드물다. 다음 조건에서만 `terrainDirty = true`로 플래그를 세우고, 다음 프레임에 `renderTerrain()`을 1회 실행한다.

- 건물 생성 / 제거 (`createBuilding`, `removeBuilding`)
- 업그레이드 시작 / 완료 (`startUpgrade`, `updateBuildTimers`)
- 배치 모드 진입 / 해제 (`setSelectedBuild`)
- 줌 변경 (`zoom-in`, `zoom-out` 버튼)
- 창 크기 변경 (`resize` 이벤트)

매 프레임 재드로우 대비 CPU 절감 효과: 건물 배치 이벤트 사이 구간(게임 진행 대부분의 시간) 동안 `terrainCanvas`는 재사용된다.

---

## dt 클램핑

탭 전환 후 복귀 시 `requestAnimationFrame`의 `timestamp` 간격이 수백 ms에 달할 수 있다. 이 경우 물리 계산(이동, 충돌)이 폭발하는 것을 방지하기 위해 `dt`를 `DT_MAX = 0.1초`로 클램핑한다.

```javascript
dt = Math.min((timestamp - G.prevTime) / 1000, DT_MAX);
```

---

## 모듈 구성 (game.js 섹션 목록)

| 섹션 | 내용 |
|------|------|
| 1 | 상수 정의 (TILE_SIZE, BUILDING_DEFS, ENEMY_DEFS, SPAWN_SCHEDULE, STAGES 배열 등) |
| 2 | 그리드 ↔ 픽셀 좌표 변환 (`tileToPixel`, `pixelToTile`) |
| 3 | 맵 초기화 (`createGrid(stageConfig)`) |
| 4 | 직선 경로 장애물 탐색 (`findBuildingOnPath`) |
| 5 | G 객체 초기화 (`initGame(stageId)`) |
| 6 | 건물 생성/제거 헬퍼 (`createBuilding`, `removeBuilding`, `startUpgrade`) |
| 7 | 적 생성 헬퍼 (`spawnEnemy`) |
| 8 | Canvas & offscreen 캐시 설정 (`resizeCanvas`, `dirtyTerrain`, `clampCamera`) |
| 9 | 터치/클릭 입력 처리 (`getCanvasPos`, 이벤트 리스너) |
| 10 | 타일 클릭 로직 (`onTileClicked`, `isInNestZone`) |
| 11 | 건물 선택 패널 UI (`buildBuildPanel`, `updateBuildPanel`) |
| 12 | HUD 업데이트 (`updateHUD`) |
| 13 | 오버레이 UI (`showOverlay`, `startNewGame`) |
| 14 | 상태 메시지 플래시 (`showStatus`) |
| 15 | 렌더링 (`renderTerrain`, `renderBuildings`, `renderEnemies`, `render`) |
| 16 | 게임 업데이트 로직 (`update`, `updateWave`, `updateEnemies`, `updateTowers`, ...) |
| 17 | 건물 정보/관리 패널 UI (`openBuildingPanel`, `closeBuildingPanel`) |
| 18 | 메인 게임 루프 (`gameLoop`) + 초기화 진입점 |

> **스테이지 시스템 변경:** 섹션 1에 `STAGES` 배열이 추가되었다. 섹션 3의 `createGrid()`는 이전 `rawGrid` 고정 참조 대신 `stageConfig` 객체를 인수로 받아 rawGrid를 깊은 복사한다. 섹션 5의 `initGame()`은 `stageId` 인수(기본값 0)를 받아 해당 스테이지 설정을 `G.stageConfig`에 저장한다. `stageId`가 범위를 초과하면 `STAGES[0]`으로 폴백한다.
