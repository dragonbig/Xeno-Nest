# 건물 시스템

> **카테고리:** FEATURES
> **최초 작성:** 2026-03-23
> **최종 갱신:** 2026-03-23 (NEST 2x2, BFS 거리맵)
> **관련 기능:** 건물 배치, 업그레이드, 철거, 건물 정보 패널, 슬로우 디버프, 구조물 수리

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

```
1. 플레이어가 하단 빌드 패널에서 건물 버튼 클릭
   → G.selectedBuild = 건물 타입 키 (배치 모드 진입)
   → 그리드 선 표시 (dirtyTerrain 호출)

2. 플레이어가 캔버스에서 타일 클릭
   → getCanvasPos()로 월드 좌표 획득
   → pixelToTile()로 (col, row) 변환
   → onTileClicked() 호출

3. onTileClicked() 내 유효성 검사
   - 건물 크기(w x h)에 해당하는 모든 타일이 EMPTY인가?
   - 자원이 충분한가? (G.resource >= def.cost)
   - NEST 배치 시: 좌상단(col, row) 기준 w x h 영역이 NEST_ZONE 내인가?
     (col >= colMin && col + w - 1 <= colMax && row >= rowMin && row + h - 1 <= rowMax)

4. createBuilding(type, col, row) 호출
   → 건물이 점유하는 모든 타일에 def.tile 타입 설정
   → G.buildings 배열에 추가 (b.w, b.h 저장)
   → buildTimer = def.buildTime (건설 타이머 시작)
   → built: false (반투명 + 녹색 진행 바 렌더링)
   → G.distanceMapDirty = true (BFS 거리맵 재계산 트리거)
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

건물을 G.buildings에서 제거하고 건물이 점유하던 모든 타일(w x h)의 그리드를 EMPTY로 복원한다.

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
생산량 = baseAmount × (1 + (level - 1) × 0.3)
```

- `baseAmount` = 15 (고정)
- 레벨당 30% 증가
- Lv.1=15, Lv.2=19.5, Lv.3=24, Lv.4=28.5, Lv.5=33

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

**SELF_REPAIR 치유량 (NEST 레벨 연동):**

| NEST 레벨 | 치유량 (HP/주기) |
|-----------|-----------------|
| Lv.1 | 8 |
| Lv.2 | 12 |
| Lv.3 | 16 |

`updateRepair()` 함수는 발동 시점에 `G.nestBuilding.level`을 읽어 치유량을 동적 계산한다. NEST가 배치되지 않은 상태에서는 `SELF_REPAIR`가 발동되지 않는다.

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
4. 액션 버튼 생성:
   - NEST: 레벨 업그레이드 버튼 (level < 3이면 업그레이드 버튼, level === 3이면 "최대 레벨") + 글로벌 업그레이드 버튼 (NEST_UPGRADES 기반)
   - THORN/SPORE/REPAIR/RESOURCE: level < 5이면 업그레이드 버튼, level === 5이면 "최대 레벨" 표시
   - WALL: level < 10이면 업그레이드 버튼, level === 10이면 "최대 레벨" 표시
   - NEST 제외 전체: 철거 버튼
```

### 패널 HP 실시간 갱신 (tickBuildingPanelHP)

매 프레임 패널 전체를 재생성하지 않고 `#bp-hp-val` element의 `textContent`만 교체한다. `openBuildingPanel` 실행 시 이 element를 `bpHpEl` 변수에 캐싱해두고 `tickBuildingPanelHP()`에서 직접 참조한다.

### 패널 닫기 (closeBuildingPanel)

```
G.selectedBuildingId = null
bpHpEl = null
building-panel에 hidden 클래스 추가
updateBuildPanel() 호출 (배치 버튼 활성화 복원)
```

---

## 주의 사항

- `building-panel`이 열려 있는 동안 하단 빌드 패널의 모든 버튼은 `disabled` 처리된다. 패널과 배치 모드는 동시에 활성화되지 않는다.
- 업그레이드 중인 건물도 BFS 거리맵에서 경로를 차단한다 (건물 타일은 거리가 기록되지만 BFS 큐에 넣지 않으므로 건물 너머로 경로가 이어지지 않음).
- 건물이 파괴될 때 `removeBuilding()`이 호출되면 해당 건물의 패널이 자동으로 닫힌다.
- REPAIR 건물 자신이 공격받아 `built: false`가 되면 수리를 멈추지 않는다. `built: true` 조건은 **대상** 건물에만 적용되며, REPAIR 건물 자신의 상태와 무관하게 `updateRepairBuildings`는 항상 실행된다. 단, 파괴되어 `G.buildings`에서 제거되면 수리가 중단된다.
