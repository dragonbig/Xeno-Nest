# ADR-005: REPAIR 건물을 공격 타워와 별도 업데이트 루프로 분리

> **카테고리:** DECISIONS
> **최초 작성:** 2026-03-23
> **최종 갱신:** 2026-03-23
> **관련 기능:** REPAIR 구조물 수리 건물, 건물 업데이트 루프

**상태:** Accepted
**날짜:** 2026-03-23

---

## 맥락

Phase 3에서 공격 기능이 없고 범위 내 건물을 지속 수리하는 REPAIR 건물이 추가되었다. 기존 공격 타워(THORN, SPORE)는 `updateTowers(dt)` 또는 개별 타이머 기반 루프에서 처리된다. REPAIR를 어느 루프에 포함할지 결정이 필요했다.

REPAIR는 다음 두 가지 면에서 공격 타워와 근본적으로 다르다:
1. 투사체를 발사하지 않는다 (피해 계산, DAMAGE_TABLE 조회 없음).
2. 대상이 "적(enemy)"이 아니라 "같은 팀 건물(building)"이다.

---

## 결정

REPAIR 처리를 `updateTowers(dt)` 내부에 포함하지 않고, `updateRepairBuildings(dt)`라는 **독립된 함수**로 분리한다. WAVE 게임 루프에서 `updateTowers(dt)` 이후에 호출된다.

```javascript
// 게임 루프 (WAVE 상태)
updateTowers(dt);           // THORN, SPORE 공격 처리
updateRepairBuildings(dt);  // REPAIR 수리 처리
```

---

## 이유

### 히트 대상과 로직 구조가 완전히 다르다

`updateTowers()`는 `G.enemies` 배열을 순회해 타겟을 찾고, 투사체 생성 및 `DAMAGE_TABLE` 조회를 수행한다. REPAIR는 `G.buildings` 배열을 순회해 범위 내 건물에 직접 HP를 더한다. 두 루프를 하나의 함수에 넣으면 "타워 처리인가, 수리 처리인가"를 타입마다 분기해야 한다.

### 발사 타이머가 필요 없다

THORN과 SPORE는 `fireRate`에 따른 발사 타이머(`thornTimers[id]`, `sporeTimers[id]`)가 필요하다. REPAIR는 매 프레임 `healPerSec * dt`를 연속적으로 적용하므로 별도 타이머 없이 `dt`만으로 충분하다. 타이머 없는 건물을 타이머 기반 루프에 포함하면 조건 분기가 늘어난다.

### SELF_REPAIR 글로벌 업그레이드와 명확히 구분된다

`HEAL_INTERVAL` 주기로 동작하는 `SELF_REPAIR`는 별도 타이머로 관리된다. REPAIR 건물 수리를 같은 루프에 넣으면 "이 회복은 SELF_REPAIR인가, REPAIR 건물인가"를 코드에서 구분하기 어렵다. 함수를 분리하면 두 회복 메커니즘의 책임이 명확히 나뉜다.

---

## 검토한 대안

### updateTowers(dt) 내부에서 타입 분기로 처리

```javascript
function updateTowers(dt) {
  for (const b of G.buildings) {
    if (b.type === 'THORN' || b.type === 'SPORE') {
      // 공격 처리
    } else if (b.type === 'REPAIR') {
      // 수리 처리
    }
  }
}
```

- 장점: 함수 하나로 모든 능동 건물을 처리.
- 단점: `updateTowers`라는 이름이 의미를 잃는다. 공격 로직과 수리 로직이 같은 루프 안에서 섞여 유지보수 시 혼란을 준다. REPAIR 처리만 디버깅할 때 전체 함수를 읽어야 한다.

### REPAIR를 `updateBuildTimers(dt)`에 포함

건설/업그레이드 타이머를 관리하는 `updateBuildTimers(dt)` 내부에서 수리도 처리.

- 단점: `updateBuildTimers`의 책임이 "타이머 관리"에서 "수리 시뮬레이션"으로 확장된다. 단일 책임 원칙 위반.

---

## 결과

- `updateRepairBuildings(dt)` 함수가 신설된다.
- `G.buildings`를 순회하며 `b.type === 'REPAIR' && b.built && !b.upgrading` 조건을 만족하는 건물마다 수리 처리를 실행한다.
- REPAIR 건물 자체는 수리 대상에서 제외된다 (`target !== repairBuilding`).
- `built: true`인 건물만 수리한다. 건설 중이거나 파괴된 건물은 대상이 아니다.
- REPAIR 건물이 파괴(`removeBuilding`)되면 `G.buildings`에서 제거되어 자동으로 수리가 중단된다.
