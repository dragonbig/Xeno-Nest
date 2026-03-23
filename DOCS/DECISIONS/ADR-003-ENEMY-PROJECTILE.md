# ADR-003: MAGE 투사체를 G.enemyProjectiles 별도 배열로 관리

> **카테고리:** DECISIONS
> **최초 작성:** 2026-03-23
> **최종 갱신:** 2026-03-23
> **관련 기능:** MAGE 원거리 공격, 투사체 시스템

**상태:** Accepted
**날짜:** 2026-03-23

---

## 맥락

Phase 2에서 MAGE(마법사 모험가) 유닛의 원거리 공격이 추가되었다. 투사체를 어느 배열로 관리할지 결정해야 했다. 기존에 `G.projectiles` 배열이 이미 타워(플레이어 측) 투사체를 관리하고 있었다.

---

## 결정

MAGE가 발사하는 투사체를 `G.projectiles`에 합치지 않고, `G.enemyProjectiles`라는 별도 배열을 생성해 분리 관리한다.

---

## 이유

### 히트 대상이 완전히 다르다

| 배열 | 발사 주체 | 히트 대상 | targetId 필드 |
|------|-----------|-----------|---------------|
| `G.projectiles` | 타워 (플레이어) | 적 (enemy 객체) | `targetId` (적 id) |
| `G.enemyProjectiles` | MAGE (적) | 건물 (building 객체) | `targetBldId` (건물 id) |

두 타입을 하나의 배열에 넣으면 `updateProjectiles()`에서 매 투사체마다 "이게 플레이어 것인가, 적 것인가?"를 판별하는 분기가 필요해진다. 분리하면 `updateProjectiles()`와 `updateEnemyProjectiles()`가 각각 단일 책임을 가진다.

### 렌더링 구분

`G.projectiles`: 녹색 구슬 (`#80ff80`)
`G.enemyProjectiles`: 보라색 구슬 (`#c060ff`, 반지름 4px)

같은 배열이면 렌더링 시 타입 분기가 필요하다. 별도 배열로 `renderProjectiles()`와 `renderEnemyProjectiles()`를 분리한다.

### 충돌 처리 로직 단순화

플레이어 투사체는 적 사망 시 즉시 제거되어야 한다(target이 dead이면 제거). 적 투사체는 타겟 건물이 파괴되면 제거된다. 두 조건이 다르다. 분리하면 각 함수가 자신의 제거 조건만 처리한다.

---

## 검토한 대안

### G.projectiles 배열에 합치고 owner 필드로 구분

```javascript
G.projectiles.push({ ..., owner: 'TOWER' })  // 플레이어
G.projectiles.push({ ..., owner: 'MAGE' })   // 적
```

- 장점: 배열 하나로 관리
- 단점: 업데이트, 렌더링, 히트 판정 모두에서 `owner` 분기 추가. 코드 복잡도 증가. 향후 다른 원거리 적 추가 시 분기가 더 늘어남.

---

## 결과

- `G.enemyProjectiles`는 `initGame()`에서 `[]`로 초기화된다
- `fireEnemyProjectile(enemy, target)`: 투사체 생성, 속도는 `ENEMY_DEFS[enemy.type].projSpeed || 150` px/s (Phase 7: 동적 참조로 변경)
- `updateEnemyProjectiles(dt)`: 이동 + 히트 판정 + 제거
- `renderEnemyProjectiles()`: attackType에 따라 색상 분기 — PHYSICAL→황갈색(`#c0a040`), MAGICAL→보라색(`#c060ff`) (Phase 7 변경)
- WAVE 루프에서 `updateEnemyProjectiles(dt)`는 `updateProjectiles(dt)` 다음에 호출된다
- Phase 7에서 ARCHER가 추가되어 `G.enemyProjectiles`에 `fireEnemyProjectile` 패턴이 재사용되었다. 설계 시 예측한 확장성이 검증됨
