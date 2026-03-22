# 시스템 아키텍처

> **카테고리:** SYSTEM
> **최초 작성:** 2026-03-23
> **최종 갱신:** 2026-03-23
> **관련 기능:** 게임 루프, 상태 관리, 렌더링 파이프라인

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
└── game.js                (전체 게임 로직, ~1988줄)
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
    │   └── tickBuildingPanelHP()       ← DOM 부분 업데이트 (HP만)
    │
    ├── 입력 처리
    │   ├── mousedown / mousemove / mouseup   (드래그 팬 + 클릭 분기)
    │   ├── touchstart / touchmove / touchend (터치 동일 처리)
    │   └── zoom-in / zoom-out 버튼
    │
    └── UI 패널 (DOM)
        ├── build-panel     (하단 건물 선택)
        ├── building-panel  (건물 정보/진화/철거)
        ├── hud-top         (자원 / 위협 단계 / 남은 시간 / 둥지 HP)
        └── overlay         (시작 화면 / 게임 오버)
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
                                                                                      └─(600초 생존)─→ GAME_OVER(Victory)
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
  grid,             // 12×16 타일 타입 배열
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
  selfRepairUnlocked, // 자가 수리 업그레이드 활성 여부
  repairTimer,      // 자가 수리 타이머
  nestUpgrades,     // Set — 적용된 글로벌 업그레이드 id
  prevTime,         // 이전 프레임 timestamp (dt 계산용)
  camera,           // { x, y, zoom }
  drag,             // { active, startX, startY, camStartX, camStartY, moved }
  canvasScale,      // CSS 표시 축소 비율 (터치 좌표 보정용)
  _loopRunning,     // 루프 중복 시작 방지 플래그
}
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
| 1 | 상수 정의 (TILE_SIZE, BUILDING_DEFS, ENEMY_DEFS, SPAWN_SCHEDULE 등) |
| 2 | 그리드 ↔ 픽셀 좌표 변환 (`tileToPixel`, `pixelToTile`) |
| 3 | 맵 초기화 (`createGrid`) |
| 4 | 직선 경로 장애물 탐색 (`findBuildingOnPath`) |
| 5 | G 객체 초기화 (`initGame`) |
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
