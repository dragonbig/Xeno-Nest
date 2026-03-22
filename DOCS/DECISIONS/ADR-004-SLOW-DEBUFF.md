# ADR-004: 슬로우 디버프를 타이머 필드로 적 객체에 직접 보관

> **카테고리:** DECISIONS
> **최초 작성:** 2026-03-23
> **최종 갱신:** 2026-03-23
> **관련 기능:** SPORE 산성 포자, 적 이동 시스템

**상태:** Accepted
**날짜:** 2026-03-23

---

## 맥락

Phase 3에서 SPORE 건물이 추가되면서 투사체 명중 시 적의 이동속도를 30%/3초 감소시키는 슬로우 디버프가 도입되었다. 디버프 상태를 어떻게 저장하고 매 프레임 처리할지 설계 결정이 필요했다.

게임에는 이미 `pursueTarget(enemy, dt)`가 매 프레임 모든 적의 이동을 처리하고 있었다.

---

## 결정

별도 디버프 배열이나 디버프 매니저를 만들지 않는다. `slowedTimer`와 `slowAmount` 두 필드를 **적 객체에 직접 추가**하고, `pursueTarget()`에서 인라인으로 처리한다.

```javascript
// 적 객체 초기 상태
enemy.slowedTimer = 0;
enemy.slowAmount  = 0;

// pursueTarget 내 처리
if (enemy.slowedTimer > 0) enemy.slowedTimer -= dt;
const speedMultiplier = (enemy.slowedTimer > 0) ? (1 - enemy.slowAmount) : 1;
// 이동 계산 시 enemy.speed * speedMultiplier 사용
```

---

## 이유

### 단일 슬로우 효과만 존재한다

현재 슬로우 효과를 부여하는 공격 주체는 SPORE 하나뿐이다. 여러 종류의 디버프를 동시에 관리해야 하는 상황이 아니다. 디버프 배열 구조는 이 단계에서는 과도한 설계이다.

### 처리 위치가 이미 정해져 있다

적의 이동은 `pursueTarget(dt)`에서 한 곳에서만 처리된다. 슬로우 감속을 이 함수 외부에서 처리하면 이동 계산이 두 곳으로 분산된다. 타이머와 감속 계수를 적 객체에 두면 `pursueTarget` 단일 함수 내에서 모든 이동 관련 로직이 완결된다.

### 상태 조회 비용이 없다

`slowedTimer > 0` 조건 하나로 활성 여부를 판단한다. 별도 배열을 순회하거나 Map 조회를 하지 않아도 된다.

### 타이머 소진으로 자연 해제된다

별도 "디버프 해제" 이벤트나 정리 로직이 필요 없다. `slowedTimer`가 0 이하로 소진되면 `speedMultiplier`가 자동으로 1.0이 된다.

---

## 검토한 대안

### G.debuffs 배열에 디버프 객체를 별도 관리

```javascript
G.debuffs.push({ targetId: enemy.id, type: 'SLOW', amount: 0.3, timer: 3.0 });
```

- 장점: 여러 종류의 디버프를 타입별로 확장하기 쉽다.
- 단점: 현재 슬로우 1종만 존재하므로 구조가 불필요하게 복잡해진다. 매 프레임 `G.debuffs` 배열 순회와 `enemy.id` 매칭 조회가 추가된다. 적이 파괴될 때 디버프 배열 정리 로직이 별도로 필요하다.

### statusEffects Map을 적 객체 내에 보관

```javascript
enemy.statusEffects = new Map();
enemy.statusEffects.set('SLOW', { amount: 0.3, timer: 3.0 });
```

- 장점: 다종 디버프 확장이 편리하다.
- 단점: 단일 슬로우를 위해 Map 객체 생성 비용을 치른다. 직렬화/역직렬화 시 Map은 JSON 비호환이다.

---

## 결과

- 모든 적 생성 시 `slowedTimer: 0`, `slowAmount: 0` 초기화가 필요하다.
- ACID 투사체 명중 처리에서 `target.slowedTimer = 3.0`, `target.slowAmount = 0.3`을 설정한다.
- 중복 명중 시 `slowedTimer`를 3.0으로 갱신한다 (누적하지 않음). 이는 의도된 설계로, SPORE를 여러 대 배치해도 슬로우 강도가 중첩되지 않는다.
- 향후 두 번째 슬로우 소스(새 건물 또는 글로벌 업그레이드)가 추가될 경우, 강도를 `Math.max(existing, new)`로 갱신하거나 디버프 배열 방식으로 리팩토링을 검토한다.
