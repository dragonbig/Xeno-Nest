# 건물 시스템

> **카테고리:** FEATURES
> **최초 작성:** 2026-03-23
> **최종 갱신:** 2026-03-23 (Phase 6: Radial Menu 건설 UI, 둥지 자동배치, 실시간 자원 갱신, 상승값 표시, 광고 버프, hitsSolidTile, BASE_ENTRANCE)
> **관련 기능:** 건물 배치, 업그레이드, 철거, 건물 정보 패널, 슬로우 디버프, 구조물 수리, 광고 버프

## 개요

플레이어는 자원을 소비해 건물을 배치하고, 완공 후 업그레이드하거나 철거할 수 있다. Phase 4부터 모든 건물(THORN/SPORE/REPAIR/WALL/NEST/RESOURCE)이 `b.level` 기반 레벨 업그레이드로 통일되었다. `b.upgraded` 이진 플래그는 전면 제거되었다. 건물 정보 및 조작은 DOM 기반 패널(`building-panel`)을 통해 제공된다.

---

## 건물 크기

대부분의 건물은 1x1 타일을 점유한다. NEST만 2x2(4타일)을 점유한다.

| 건물 | 크기 (w x h) | 점유 타일 수 |
|------|-------------|-------------|
| NEST | 2 x 2 | 4 (row~row+1, col~col+1) |
| WALL / THORN / SPORE / REPAIR / RESOURCE | 1 x 1 | 1 |

건물 크기는 `BUILDING_DEFS`의 `w`, `h` 필드로 정의된다. 1x1 건물은 `w`, `h` 필드가 생략되어 있으며, 코드에서 `b.w || 1`, `b.h || 1`로 기본값 1을 사용한다.

### getBuildingCenter(b) 헬퍼

모든 건물의 픽셀 중심 좌표를 통일적으로 계산하는 헬퍼 함수이다. 1x1 건물과 2x2 건물(NEST) 모두 동일한 함수로 중심을 구한다.

```javascript
function getBuildingCenter(b) {
  const w = b.w || 1, h = b.h || 1;
  return {
    x: (b.col + w / 2) * TILE_SIZE,
    y: (b.row + h / 2) * TILE_SIZE,
  };
}
```

- 1x1 건물: `(col + 0.5) * 48, (row + 0.5) * 48` = 타일 중심
- 2x2 NEST: `(col + 1) * 48, (row + 1) * 48` = 4타일의 정중앙

이 함수는 사거리 계산, 투사체 히트 판정, 수리 범위 계산, 적 타겟 거리 계산, 범위 원 렌더링 등 건물 중심이 필요한 모든 곳에서 사용된다. `tileToPixel(b.col, b.row)`를 직접 사용하면 2x2 건물에서 중심이 좌상단 타일의 중심으로 잘못 계산되므로, 반드시 `getBuildingCenter`를 사용해야 한다.

---

## 건물 배치 흐름

> **Phase 6 변경:** 기존 하단 build-panel의 6개 건물 선택 버튼이 제거되고, 중앙 하단의 건설 트리거 버튼 1개 + 원형 Radial Menu 방식으로 교체되었다.

### 건설 UI 구조

```
build-trigger-bar (중앙 하단 고정)
  └─ build-trigger-btn (건설 모드 토글 버튼)

radial-menu (DOM 오버레이, game-container 내부)
  └─ radial-item × N (시계방향 원형 배치, 건물 아이콘 + 비용)
```

**BUILD_GROUPS 배열:** 건물을 그룹으로 관리한다. 현재 1그룹만 사용하며, 향후 2그룹 분리에 대비한 구조이다.

```javascript
BUILD_GROUPS = [
  [
    { key: 'WALL',     label: '성벽' },
    { key: 'THORN',    label: '가시촉수' },
    { key: 'SPORE',    label: '산성포자' },
    { key: 'REPAIR',   label: '수리' },
    { key: 'RESOURCE', label: '자원' },
  ],
];
```

NEST는 BUILD_GROUPS에 포함되지 않는다. PLACING 상태에서 별도 처리된다.

### 배치 절차

```
1. 플레이어가 건설 트리거 버튼 클릭
   → toggleBuildMode() 호출
   → buildModeActive = true
   → 그리드 선 표시 (dirtyTerrain 호출)
   → NEST 미건설 시 "먼저 핵심 둥지를 건설하세요." 메시지 후 리턴

2. buildModeActive 상태에서 빈 타일 클릭
   → openRadialMenu(clientX, clientY, col, row) 호출
   → 시계방향 원형 메뉴 표시 (반경 55px, 12시 방향 시작)
   → 각 아이콘에 비용 표시, 자원 부족 시 insufficient 클래스 추가

3. Radial Menu에서 건물 아이콘 클릭
   → 자원 부족 확인 → 부족 시 "자원이 부족합니다!" 메시지
   → G.selectedBuild = 선택한 건물 타입 키
   → closeRadialMenu() 호출
   → 해당 타일에 즉시 건물 배치 (onTileClicked 흐름)

4. onTileClicked() 내 유효성 검사
   - 건물 크기(w x h)에 해당하는 모든 타일이 EMPTY인가?
   - 자원이 충분한가? (G.resource >= def.cost)
   - NEST_BUILD_CAP 제한: 현재 건물 수 < NEST_BUILD_CAP[nestLv - 1]인가?
   - 외벽 내부(기지 내부)에만 건설 가능

5. createBuilding(type, col, row) 호출
   → 건물이 점유하는 모든 타일에 def.tile 타입 설정
   → G.buildings 배열에 추가 (b.w, b.h 저장)
   → buildTimer = def.buildTime (건설 타이머 시작)
   → built: false (반투명 + 녹색 진행 바 렌더링)
   → G.distanceMapDirty = true (BFS 거리맵 재계산 트리거)
```

### PLACING 상태 시 건설 버튼 숨김

`G.state === STATE.PLACING` (NEST 배치 대기) 상태에서는 건설 트리거 버튼이 숨겨진다. NEST가 건설되기 전에는 일반 건물을 배치할 수 없다.

---

### NEST 배치 편의성 (Phase 6)

NEST_ZONE이 6칸에서 2x2 = 4칸으로 축소되었다.

| 항목 | 이전 | 현재 |
|------|------|------|
| NEST_ZONE | colMin:12, colMax:16, rowMin:3, rowMax:5 (6칸) | colMin:14, colMax:15, rowMin:3, rowMax:4 (4칸) |
| 배치 방식 | 수동 좌표 선택 | 보라색 4칸 중 어디를 터치해도 (14,3)에 자동 배치 |
| 위치 | 외벽 내부 | 외벽 내부 중앙 상단 |

```
onTileClicked() 내 NEST 배치 처리:
  1. 클릭한 (col, row)가 NEST_ZONE 범위 밖이면 리턴
  2. 고정 배치 좌표: placeCol = NEST_ZONE.colMin (14), placeRow = NEST_ZONE.rowMin (3)
  3. isInNestZone(placeCol, placeRow) 유효성 확인 후 createBuilding('NEST', 14, 3) 호출
```

---

## 건물 상태 머신

Phase 4부터 모든 건물이 단일 상태 머신으로 통일되었다.

### 모든 건물 공통 — 레벨 기반 업그레이드 상태 전이

```
[배치 직후]
  built: false, upgrading: false, level: 1
  buildTimer 카운트다운 (updateBuildTimers에서 dt 차감)
        ↓ buildTimer <= 0
[건설 완료 — Lv.1]
  built: true, level: 1
  (NEST이면 PREP → COUNTDOWN 전환 트리거)
        ↓ startUpgrade() 호출 (level < maxLv일 때만 가능, 자원 차감, 유효성 검사 통과 시)
[업그레이드 중 — Lv.N → Lv.N+1]
  upgrading: true
  upgradeTimer = upgradeTime[level - 1]
  비용 = upgradeCost[level - 1]
        ↓ upgradeTimer <= 0
[업그레이드 완료 — Lv.N+1]
  upgrading: false, level = level + 1
        ↓ (반복, level < maxLv인 동안)
[최대 레벨 — Lv.maxLv]
  패널 업그레이드 버튼: "최대 레벨" 표시, disabled
```

건물별 maxLv: THORN/SPORE/REPAIR/RESOURCE = 5, NEST = 3, WALL = 10.

스탯은 `b.level - 1`을 배열 인덱스로 조회한다. 예: `THORN_STATS.damage[b.level - 1]`, `BUILDING_DEFS.WALL.hpPerLevel[b.level - 1]`.

### 상태별 렌더링

| 상태 | 렌더링 |
|------|--------|
| `built: false` | 반투명(globalAlpha 0.5) + 하단 녹색 진행 바 |
| `built: true, upgrading: false` | 불투명 + HP 바 (NEST는 항상, 나머지는 피해 시) |
| `upgrading: true` | 불투명 + 하단 파란색 진행 바 |
| 모든 건물의 `built: true` | 우하단 `Lv.N` 텍스트 표시 (Phase 4: 전체 건물로 확대) |

### 건물별 렌더링 형태

| 건물 | 형태 | 크기 | 선택 시 범위 원 색상 |
|------|------|------|---------------------|
| NEST | 2x2 타일 크기 렌더링 (renderW/renderH 기반) | 96x96 px | - |
| THORN | 마름모 + 4방향 가시 삼각형 | 48x48 px | 녹색 |
| SPORE | 중앙 원 + 6개 위성 원 | 48x48 px | 황갈색 |
| REPAIR | 십자(+) 형태 | 48x48 px | 청록색 `rgba(0,200,200,…)` |

NEST는 `b.w * TILE_SIZE`, `b.h * TILE_SIZE`로 계산된 renderW(96px), renderH(96px) 크기로 렌더링된다. 1x1 건물은 TILE_SIZE(48px) 크기로 렌더링된다.

---

## createBuilding(type, col, row)

건물 객체를 생성하고 G.buildings에 추가한다. 건물의 크기(w, h)에 따라 점유하는 모든 타일에 타일 타입을 설정한다. 타입별 부가 처리:

| 타입 | 부가 처리 |
|------|-----------|
| NEST | `G.nestTile`, `G.nestBuilding` 참조 저장. `b.w = 2, b.h = 2` 설정. 4타일(row~row+1, col~col+1) 점유 |
| WALL | `building.attackers = []` (슬롯 추적 배열) 초기화 |
| THORN | `G.thornTimers[id] = 0` 초기화 |
| SPORE | `G.sporeTimers[id] = 0` 초기화 |
| REPAIR | 별도 타이머 없음 (`updateRepairBuildings`에서 dt 직접 처리) |
| RESOURCE | `G.resourceTimers[id] = RESOURCE_STATS.interval` 초기화 |

호출 직후:
- `dirtyTerrain()`으로 지형 캐시를 무효화한다.
- `G.distanceMapDirty = true`로 BFS 거리맵 재계산을 트리거한다.

---

## removeBuilding(building)

건물을 G.buildings에서 제거하고 건물이 점유하던 모든 타일(w x h)의 그리드를 복원한다. 입구 위치(BASE_ENTRANCE 좌표)에 WALL이 있었다면 ENTRANCE로 복원하고, 그 외는 EMPTY로 복원한다.

```
BASE_ENTRANCE = [{ col: 14, row: 13 }, { col: 15, row: 13 }]
```

부가 처리:
- `G.thornTimers`, `G.sporeTimers`, `G.resourceTimers`에서 해당 id 삭제
- 이 건물을 타겟으로 삼던 모든 적의 `targetBldId = null`로 초기화 (거리맵 따라 다음 타겟 자동 탐색)
- 정보 패널이 이 건물을 표시 중이면 `closeBuildingPanel()` 호출
- `dirtyTerrain()` 호출
- `G.distanceMapDirty = true`로 BFS 거리맵 재계산을 트리거

---

## startUpgrade(building)

Phase 4부터 모든 건물에 동일한 로직이 적용된다. `building.maxLv`는 건물 생성 시 `BUILDING_DEFS`에서 복사한 값이다.

```javascript
function startUpgrade(building) {
  const def = BUILDING_DEFS[building.type];
  // 실패 조건: 아직 built 아님, upgrading 중, 최대 레벨 도달, 자원 부족
  if (!building.built || building.upgrading) return false;
  if (building.level >= building.maxLv) return false;
  const cost = def.upgradeCost[building.level - 1];
  if (G.resource < cost) return false;

  G.resource -= cost;
  building.upgrading    = true;
  building.upgradeTimer = def.upgradeTime[building.level - 1];
  dirtyTerrain();
  return true;
}
```

실패 조건 요약:
1. `built: false` — 건설 중인 건물은 업그레이드 불가
2. `upgrading: true` — 이미 업그레이드 진행 중
3. `level >= maxLv` — 최대 레벨 도달 (WALL=10, NEST=3, 나머지=5)
4. `G.resource < cost` — 자원 부족

---

## RESOURCE 자원 생산 시스템

RESOURCE 건물은 `G.resourceTimers[id]`가 0 이하로 떨어질 때마다 자원을 생산한다.

### 생산량 계산

```
생산량 = Math.round(baseAmount × (1 + (level - 1) × 0.3))
```

- `baseAmount` = 14 (Phase 6에서 15 → 7 → 14로 조정)
- 레벨당 30% 증가
- Lv.1=14, Lv.2=18, Lv.3=22, Lv.4=27, Lv.5=31
- 광고 버프(G.adBuff) 활성 시 생산량 2배

### 생산 간격

`RESOURCE_STATS.interval = 5초`. 타이머가 소진되면 즉시 `interval` 값으로 재설정된다.

### COUNTDOWN 상태 생산

`G.phase === 'COUNTDOWN'` 상태에서도 타이머가 정상 진행되므로 웨이브 시작 전 준비 시간 동안 자원이 생산된다. 이를 활용해 웨이브 직전 자원을 비축할 수 있다.

---

## SPORE 슬로우 디버프 시스템

SPORE의 ACID 투사체가 명중할 때 대상 적에게 이동속도 감소 디버프를 부여한다.

### 적 객체 필드

```
enemy.slowedTimer  : 0   (남은 슬로우 지속 시간, 초)
enemy.slowAmount   : 0   (슬로우 강도, 0.0~1.0)
```

### 디버프 부여 — ACID 투사체 명중 시

```
target.slowedTimer = 3.0   (slowDuration)
target.slowAmount  = 0.3   (30% 이동속도 감소)
```

중복 명중 시 타이머를 3.0초로 갱신한다 (누적하지 않음).

### 매 프레임 처리 — pursueTarget(enemy, dt)

```javascript
if (enemy.slowedTimer > 0) {
  enemy.slowedTimer -= dt;
}
const speedMultiplier = (enemy.slowedTimer > 0) ? (1 - enemy.slowAmount) : 1;
// 이동 계산 시 enemy.speed * speedMultiplier 적용
```

slowedTimer가 0 이하로 떨어지면 speedMultiplier가 1.0으로 복구된다. 별도 "디버프 해제" 로직 없이 타이머 소진으로 자연 해제된다.

### 슬로우 효과 예시

| 적 타입 | 기본 이동속도 | 슬로우 적용 시 |
|---------|---------------|----------------|
| CITIZEN | 60 px/s | 42 px/s |
| FAST | 120 px/s | 84 px/s |
| WARRIOR | 50 px/s | 35 px/s |

---

## REPAIR 건물 수리 시스템

REPAIR 건물은 `updateRepairBuildings(dt)`에서 매 프레임 범위 내 건물을 수리한다.

### 수리 조건

```
대상 건물의 조건:
1. built: true (건설 완료 상태)
2. 수리 건물 자기 자신이 아님
3. REPAIR 건물 중심에서 대상 건물 중심까지의 거리 <= range * TILE_SIZE
```

### 수리 계산

```
회복량 = healPerSec * dt
대상.hp = Math.min(대상.hp + 회복량, 대상.hpMax)
```

매 프레임 실수 단위로 HP를 더하며 hpMax를 초과하지 않는다.

### 글로벌 SELF_REPAIR와의 관계

`NEST_UPGRADES`의 `SELF_REPAIR`는 일정 주기(`HEAL_INTERVAL = 10s`)마다 모든 건물에 HP를 회복한다. Phase 4부터 회복량은 고정값이 아닌 NEST 레벨에 연동된다. REPAIR 건물의 지속 수리와 독립적으로 중복 적용된다. 두 효과가 동시에 활성화되면 대상 건물은 두 소스에서 각각 HP를 회복한다.

**SELF_REPAIR 치유량 (SELF_REPAIR 레벨 + NEST 레벨 연동):**

Phase 5부터 치유량은 SELF_REPAIR 글로벌 업그레이드 레벨과 NEST 레벨 양쪽에 연동된다.

```
healAmt = (8 + srLv × 4) + (nestLv - 1) × 4
```

| SELF_REPAIR Lv | NEST Lv.1 | NEST Lv.2 | NEST Lv.3 |
|----------------|-----------|-----------|-----------|
| Lv.1 | 12 | 16 | 20 |
| Lv.10 | 48 | 52 | 56 |
| Lv.30 | 128 | 132 | 136 |

`updateRepair()` 함수는 발동 시점에 `G.globalUpgrades.SELF_REPAIR`와 `G.nestBuilding.level`을 읽어 치유량을 동적 계산한다. NEST가 배치되지 않은 상태에서는 `SELF_REPAIR`가 발동되지 않는다.

### 수리 가능 범위 예시 (REPAIR Lv.1, range=2.0타일, TILE_SIZE=48px)

```
수리 반경 = 2.0 × 48 = 96 px
REPAIR 중심 픽셀 좌표 (cx, cy) 기준 반경 96 px 이내의 건물만 수리
```

---

## 건물 정보 패널 (openBuildingPanel / closeBuildingPanel)

DOM 기반 패널로 구현된다. `building-panel` div가 `hidden` 클래스 토글로 표시/숨김된다.

### 패널 열기 (openBuildingPanel)

트리거: 배치 모드가 아닌 상태에서 건물 타일 클릭.

```
1. G.selectedBuildingId = building.id
2. G.selectedBuild = null (배치 모드 해제)
3. 패널에 건물 정보 렌더링:
   - 아이콘, 이름
   - 상태 문자열 (건설 중 / 업그레이드 중 / Lv.N 등)
   - HP / hpMax
   - 타입별 스펙 (THORN/SPORE: 공격력/사거리/레벨, REPAIR: 수리범위/회복량/레벨,
                  WALL: 슬롯, RESOURCE: 생산량)
   - 타입별 스펙 (Phase 6 — "기본+보너스" 형태 표시):
     - THORN: 공격력 `기본+보너스`, 사거리, 발사속도 `기본+보너스` (보너스 0이면 기본값만)
     - SPORE: 공격력 `기본+보너스`, 사거리, 슬로우 `30%/기본+보너스s` (보너스 0이면 기본값만)
     - RESOURCE: 생산량 `기본+보너스`, 생산 간격 (보너스 0이면 기본값만)
     - REPAIR: 범위, 수리량
     - WALL: 레벨, HP, 최대 공격자 슬롯
4. 액션 버튼 생성:
   - NEST: 레벨 업그레이드 버튼 (level < 3이면 업그레이드 버튼, level === 3이면 "최대 레벨") + 글로벌 업그레이드 버튼 (GLOBAL_UPGRADES 기반, WALL_DEFENSE/WALL_FORTIFY 나란히 묶음)
   - THORN/SPORE/REPAIR/RESOURCE: level < 5이면 업그레이드 버튼, level === 5이면 "최대 레벨" 표시
   - WALL: level < 10이면 업그레이드 버튼, level === 10이면 "최대 레벨" 표시
   - NEST 제외 전체: 철거 버튼
   - 모든 업그레이드/진화 버튼에 data-cost 속성을 설정하여 tickBuildingPanelHP()에서 실시간 토글
```

### 패널 HP 실시간 갱신 (tickBuildingPanelHP)

매 프레임 패널 전체를 재생성하지 않고 `#bp-hp-val` element의 `textContent`만 교체한다. `openBuildingPanel` 실행 시 이 element를 `bpHpEl` 변수에 캐싱해두고 `tickBuildingPanelHP()`에서 직접 참조한다.

**Phase 6 확장 — 업그레이드/진화 버튼 실시간 활성/비활성 토글:**

`tickBuildingPanelHP()`가 HP 갱신 외에 `data-cost` 속성을 가진 모든 버튼의 활성 상태를 매 프레임 갱신한다.

```
bpActions.querySelectorAll('.bp-btn[data-cost]') 순회:
  cost = parseInt(btn.dataset.cost)
  G.resource < cost  → btn.classList.add('disabled')
  G.resource >= cost → btn.classList.remove('disabled')
```

자원이 실시간으로 변동하므로(자원 생산, 광고 버프 등) 패널을 열어둔 채로도 업그레이드 버튼이 자원 보유량에 맞게 즉시 반응한다.

### 패널 닫기 (closeBuildingPanel)

```
G.selectedBuildingId = null
bpHpEl = null
building-panel에 hidden 클래스 추가
updateBuildPanel() 호출 (배치 버튼 활성화 복원)
```

---

---

## 광고 버프 시스템 (Phase 6 추가)

좌측 상단에 위치한 원형 버튼(44px, id: `ad-buff-btn`)으로 자원 생산량 2배 버프를 활성화한다.

### UI 구성

- 기본 상태: "AD" 텍스트 표시
- 활성 중: 남은 시간(초) 표시, `active` 클래스 추가
- COUNTDOWN / WAVE 상태에서만 사용 가능

### 동작 흐름

```
1. 플레이어가 ad-buff-btn 클릭
   → G.state가 COUNTDOWN 또는 WAVE인지 확인
   → G.adBuff.active가 이미 true이면 무시
   → confirm('광고를 시청하시겠습니까?...') 대화상자 (광고 시뮬레이션)
   → 확인 클릭 시:
     G.adBuff.active = true
     G.adBuff.timer = 60 (1분)
     버튼에 '60s' 표시 + active 클래스

2. 매 프레임 updateAdBuff(dt) 호출
   → G.adBuff.timer -= dt
   → 남은 시간을 버튼에 갱신 (Math.ceil)
   → timer <= 0이면:
     G.adBuff.active = false
     버튼 텍스트를 'AD'로 복원
     "자원 2배 버프가 종료되었습니다" 상태 메시지
```

### 적용 범위

| 생산 소스 | 버프 적용 |
|-----------|----------|
| RESOURCE 건물 생산 | O (amount *= 2) |
| NEST 자원 생산 | O (nestAmt *= 2) |
| 적 처치 보상 | X |

### G.adBuff 상태

```javascript
G.adBuff = { active: false, timer: 0 }
```

`initGame()` 시 초기화되어 게임 재시작 시 버프가 리셋된다.

---

## 피해량 플로팅 텍스트 시스템 (Phase 6 추가)

건물이 피해를 받거나 적이 피해를 받을 때 피해량이 화면에 떠오르는 텍스트로 표시된다.

### spawnFloatingText(x, y, text, color)

```javascript
G.floatingTexts.push({ x, y, text, color, life: 0.8, maxLife: 0.8 });
```

### 색상 구분

| 상황 | 텍스트 | 색상 |
|------|--------|------|
| 타워 투사체가 적 타격 | `-{피해량}` | `#ffff60` (노란색) |
| 적이 건물 타격 (근접/원거리) | `-{피해량}` | `#ff6060` (빨간색) |

### 업데이트 및 렌더링

- `updateFloatingTexts(dt)`: life -= dt, y -= 30 * dt (위로 떠오름). life <= 0인 텍스트 제거.
- `renderFloatingTexts()`: alpha = life / maxLife로 페이드아웃. bold 12px monospace.

---

## separation 시 건물 타일 넘어감 방지 (Phase 6)

기존 `hitsBlockedTile()`은 BLOCKED 타일만 검사했다. Phase 6에서 `hitsSolidTile()`이 추가되어 BLOCKED 타일뿐 아니라 건물 타일(WALL, THORN, SPORE, REPAIR_BLD, RESOURCE, NEST)도 통과 불가로 처리한다.

```javascript
function isSolidTile(tile) {
  return tile === TILE.BLOCKED || tile === TILE.WALL || tile === TILE.THORN
      || tile === TILE.SPORE || tile === TILE.REPAIR_BLD
      || tile === TILE.RESOURCE || tile === TILE.NEST;
}
```

`hitsSolidTile()`은 `hitsBlockedTile()`과 동일한 9지점 검사 구조를 사용하되 `isSolidTile()`로 판정한다. `resolveCapsuleCollisions()`에서 separation push 후 적이 건물 타일 위로 밀려나는 것을 방지한다.

| 함수 | 사용처 | 검사 대상 |
|------|--------|----------|
| `hitsBlockedTile()` | `moveToward()` (이동) | BLOCKED 타일만 |
| `hitsSolidTile()` | `resolveCapsuleCollisions()` (충돌 해소) | BLOCKED + 건물 타일 |

---

## 주의 사항

- `building-panel`이 열려 있는 동안에도 건설 트리거 버튼은 독립적으로 동작한다. 패널과 건설 모드는 동시에 활성화될 수 있다.
- 업그레이드 중인 건물도 BFS 거리맵에서 경로를 차단한다 (건물 타일은 거리가 기록되지만 BFS 큐에 넣지 않으므로 건물 너머로 경로가 이어지지 않음).
- 건물이 파괴될 때 `removeBuilding()`이 호출되면 해당 건물의 패널이 자동으로 닫힌다.
- REPAIR 건물 자신이 공격받아 `built: false`가 되면 수리를 멈추지 않는다. `built: true` 조건은 **대상** 건물에만 적용되며, REPAIR 건물 자신의 상태와 무관하게 `updateRepairBuildings`는 항상 실행된다. 단, 파괴되어 `G.buildings`에서 제거되면 수리가 중단된다.
- 외벽 안에서만 건설 가능하다. 기지 외부 타일에는 건물을 배치할 수 없다.
- NEST가 건설되기 전에는 일반 건물 배치가 차단된다 (건설 트리거 버튼에서 확인).
- WALL을 기지 입구(BASE_ENTRANCE 좌표)에 배치 가능하다. 철거 시 ENTRANCE 타일로 복원된다.
