# 적 이동 및 공격 시스템

> **카테고리:** FEATURES
> **최초 작성:** 2026-03-23
> **최종 갱신:** 2026-03-23 (Phase 6: WALL_DEFENSE, 피해량 플로팅 텍스트, hitsSolidTile)
> **관련 기능:** 적 AI, 투사체 시스템, 충돌 처리, BFS 거리맵 길찾기

## 개요

적은 BFS 거리맵(distance map)의 경사를 따라 핵심 둥지를 향해 이동한다. NEST에서 역방향으로 계산된 거리맵에서 인접 4칸 중 거리가 가장 작은 방향으로 매 프레임 이동하며, 인접 타일에 건물이 발견되면 해당 건물을 타겟으로 설정하고 공격한다. 공격 범위에 진입하면 근접 또는 원거리 공격을 수행한다. 적끼리의 겹침은 공간 해시 기반 캡슐 충돌 해소로 처리한다. 불규칙 외벽(BLOCKED 타일) 통과 방지는 9지점 충돌 검사(`hitsBlockedTile`)로 이동과 충돌 해소 양쪽에 적용된다.

---

## BFS 거리맵 이동 (pursueTarget)

모든 적의 이동과 공격은 `pursueTarget(enemy, dt)` 함수 하나로 처리된다. 매 프레임 호출된다. ADR-007에서 직선 추적(Direct Pursuit)을 폐기하고 BFS 거리맵 방식으로 전면 재작성되었다.

### 처리 순서

```
1. 슬로우 타이머 감소 (이동/정지 무관)

2. 현재 타겟 유효성 확인
   → targetBldId로 건물 조회
   → dead이거나 built: false이면 타겟 해제

3. 타겟이 없으면 인접 타일에서 건물 탐색
   → 적의 현재 타일 좌표(ec, er)를 계산
   → G.buildings를 순회하며, 건물이 점유하는 모든 타일 중
     맨해튼 거리 <= 1인 건물을 탐색
   → 가장 가까운(유클리드 거리) 건물을 타겟으로 설정
   (※ 건물의 w×h 크기를 고려하여 모든 점유 타일을 검사)

4. 타겟이 바뀌었으면
   → 이전 타겟(성벽)의 attackers 목록에서 제거
   → e.targetBldId = target.id

5. 타겟이 있으면: 공격 범위 확인 후 이동/공격
   → 공격 범위 밖: moveToward(e, center.x, center.y, dt)
   → 공격 범위 안: 성벽 용량 확인 → 공격

6. 타겟이 없으면: 거리맵 경사 추적
   → 현재 타일의 거리값 확인
   → 거리 0 = NEST 위 도달 → NEST를 타겟으로 설정
   → 인접 4칸(상하좌우) 중 거리가 가장 작은 방향의 타일 중심으로 이동
   → moveToward(e, bestDir.x, bestDir.y, dt) 호출

7. 성벽 용량 확인 (WALL 타겟이고 근접 적에만 적용)
   → usedCap >= WALL_MAX_CAPACITY이면 대기(return)
   → canJoin이면 attackers에 추가 후 공격

8. 공격
   attackTimer -= dt
   attackTimer <= 0 이면:
     - 근접: target.hp -= dmg (WALL은 WALL_DEFENSE 감소 적용: `dmg = Math.round(attackDmg × (1 - defLv × 0.02))`, 최소 1)
     - 원거리(MAGE): fireEnemyProjectile() 호출
```

### 공격 범위 계산

```javascript
// 근접
attackRange = e.radius + TILE_SIZE * 0.55   // 약 34.4px 여유

// 원거리 (MAGE)
attackRange = e.radius + TILE_SIZE * e.rangedTiles  // 11 + 168 = 179px
```

### 거리맵 경사 추적의 동작 원리

거리맵은 NEST 타일을 거리 0으로 시작하여 BFS로 주변 타일에 1, 2, 3... 순서로 거리를 기록한다. 적은 현재 위치의 인접 4칸 중 거리 값이 가장 작은 방향으로 이동하므로, 자연스럽게 NEST를 향한 최단 경로를 따라간다.

건물 타일은 거리가 기록되지만 BFS 큐에 넣지 않으므로, 건물 너머로 경로가 이어지지 않는다. 성벽을 여러 겹 배치하면 적은 첫 번째 성벽까지만 접근하고, 해당 성벽을 파괴해야만 내부로 진행할 수 있다.

### 건물 탐지 방식 변경

기존 `findBuildingOnPath()` 함수(직선 투영 기반)는 완전히 제거되었다. 건물 탐지는 `pursueTarget()` 내부에서 다음과 같이 처리된다:

```
적의 현재 타일 (ec, er) 기준으로:
  G.buildings를 순회 → 각 건물의 점유 타일(b.col+dc, b.row+dr) 중
  |ec - (b.col+dc)| + |er - (b.row+dr)| <= 1 인 타일이 있으면
  해당 건물이 인접한 것으로 판정 → 가장 가까운 건물을 타겟 설정
```

이 방식은 건물의 w×h 크기(예: NEST 2×2)를 자연스럽게 지원한다.

---

## 이동 헬퍼 (moveToward)

`moveToward(e, tx, ty, dt)` 함수는 적의 실제 이동을 담당한다. `pursueTarget()`에서 타겟 방향 이동과 거리맵 경사 이동 양쪽에서 호출된다.

### 처리 순서

```
1. 목표 지점(tx, ty)까지 방향 벡터 계산
2. 슬로우 적용: speedMultiplier = (slowedTimer > 0) ? (1 - slowAmount) : 1
3. 이동량 계산: speed * dt * speedMultiplier
4. 이동 실행 (x += moveX, y += moveY)
5. BLOCKED 충돌 검사 (hitsBlockedTile) 후 3단계 슬라이딩:
   - 전체 롤백 → X축만 시도 → Y축만 시도
```

### 3단계 BLOCKED 슬라이딩

```
이동 후 hitsBlockedTile(e.x, e.y, e.radius)가 true이면:

1단계: 전체 롤백
   → (oldX, oldY)로 복원

2단계: X축만 이동
   → e.x += moveX
   → hitsBlockedTile이면 e.x = oldX로 롤백

3단계: Y축만 이동
   → e.y += moveY
   → hitsBlockedTile이면 e.y = oldY로 롤백
```

이 방식으로 적은 외벽을 관통하지 못하면서도, 벽을 따라 미끄러지듯 이동하여 기지 입구를 향해 우회한다.

---

## MAGE 원거리 투사체 시스템

MAGE는 공격 범위에 진입하면 근접 공격 대신 `fireEnemyProjectile()`을 호출한다.

### fireEnemyProjectile(enemy, target)

```javascript
// 적 위치 → 타겟 건물 방향으로 투사체 생성
G.enemyProjectiles.push({
  id, x, y,
  vx: (dx / dist) * 150,  // 속도 150 px/s (하드코딩)
  vy: (dy / dist) * 150,
  damage: enemy.attackDmg,
  attackType: enemy.attackType,
  targetBldId: target.id,
})
```

### updateEnemyProjectiles(dt)

매 프레임 모든 `G.enemyProjectiles`를 이동시키고 히트 판정을 수행한다.

```
이동: p.x += p.vx * dt, p.y += p.vy * dt

히트 조건: 타겟 건물 픽셀 중심까지의 거리 < TILE_SIZE * 0.6 (28.8px)

히트 시:
  target.hp -= p.damage  (STRUCTURE 방어구: 배율 1.0, 직접 적용)
  target.hp <= 0이면:
    NEST → triggerGameOver()
    그 외 → removeBuilding(target)
  투사체 제거

제거 조건:
  - 타겟 건물이 이미 파괴됨
  - 월드 밖 이탈 (x < 0, x > 1440, y < 0, y > 1152)
```

### G.projectiles vs G.enemyProjectiles 분리 이유

타워(플레이어 측) 투사체와 MAGE(적 측) 투사체는 히트 대상이 완전히 다르다.
- `G.projectiles`: 적(enemy) 객체를 `targetId`로 추적
- `G.enemyProjectiles`: 건물(building) 객체를 `targetBldId`로 추적

하나의 배열로 합치면 히트 판정 로직에서 매번 타겟 타입을 구분해야 한다. 분리함으로써 각 업데이트 함수가 명확한 단일 책임을 갖는다. ADR-003 참조.

---

## 캡슐 충돌 해소 (resolveCapsuleCollisions)

모든 살아있는 적끼리 원형 충돌(캡슐 = 구체)을 해소한다.

### 공간 해시 방식

```
셀 크기: TILE_SIZE = 48px
키 = Math.floor(x / 48) * 10000 + Math.floor(y / 48)

각 적: 자신이 속한 셀에 등록
충돌 검사: 자신의 셀 + 인접 8방향 셀 (3×3)만 검사
중복 방지: other.id > e.id 인 경우만 처리
```

최대 충돌 거리(FAST + FAST = 12 + 12 + 1 = 25px < 48px)이므로 인접 1칸 이내 검사로 충돌을 절대 누락하지 않는다. 검사 쌍 수: O(n²) ~16,110쌍 → 공간 분할 ~1,600쌍 (약 10배 감소). ADR-002 참조.

### 충돌 해소 규칙

```
A가 공격 중, B가 이동 중 → A: 고정(비율 0.0), B: 전량 밀려남(1.0)
A, B 모두 공격 중         → 둘 다 고정(0.0, 0.0)
A, B 모두 이동 중         → 50/50 분할(0.5, 0.5)
```

공격 중 판별: `targetBldId`가 존재하고, 타겟까지의 거리가 공격 범위 이내이며, `attackTimer`가 간격의 10% 초과인 경우.

밀어낸 후:
- `hitsSolidTile(x, y, radius)`로 BLOCKED 또는 건물 타일 진입 감지 시 push를 롤백 (Phase 6에서 `hitsBlockedTile` → `hitsSolidTile`로 변경되어 건물 타일 넘어감도 방지)
- 월드 경계 클램핑:
```
x: [radius, 1440 - radius]
y: [radius, 1152 - radius]
```

> 이동(`moveToward`)에서는 `hitsBlockedTile`(BLOCKED 타일만 검사)을, 충돌 해소(`resolveCapsuleCollisions`)에서는 `hitsSolidTile`(BLOCKED + 건물 타일 검사)을 사용한다. Phase 6에서 분리된 이유: 적이 건물 옆까지 이동하여 공격해야 하므로 이동 시에는 건물 타일을 통과 허용하지만, 분리 push 시에는 건물 타일 위로 밀려나면 안 되기 때문이다. 상세는 `DOCS/SYSTEM/GAME_CONSTANTS.md`의 "9지점 충돌 검사" 섹션을 참조한다.

---

## 스폰 시스템 (spawnBatch / spawnEnemy)

### spawnBatch(sched)

현재 SPAWN_SCHEDULE 구간의 유닛 구성을 스폰한다. 입구를 라운드로빈으로 사용해 한 곳에 집중되지 않게 한다.

```
각 유닛 타입별:
  want = newCount + G.pendingSpawn[type]
  room = ENEMY_CAP[type] - 현재 살아있는 해당 유닛 수
  actual = min(want, room)
  G.pendingSpawn[type] = want - actual  (초과분 보류)
  actual 수만큼 spawnEnemy() 호출
```

### spawnEnemy(type, entranceIndex)

지정 입구 위치에 적을 생성한다. 기존 적과 겹치면 8방향 오프셋(반지름 × 2 + 2px 간격)을 시도해 겹침을 해소한다. 8방향 모두 실패해도 스폰을 막지 않는다.
