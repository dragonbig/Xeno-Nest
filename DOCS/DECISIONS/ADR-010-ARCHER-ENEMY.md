# ADR-010: ARCHER(궁수) 적 유닛 도입 및 게임 시간 확장

> **카테고리:** DECISIONS
> **최초 작성:** 2026-03-23
> **최종 갱신:** 2026-03-23
> **관련 기능:** 적 시스템, 투사체 시스템, 스폰 스케줄, 밸런스

**상태:** Accepted
**날짜:** 2026-03-23

---

## 맥락

Phase 6까지 원거리 적은 MAGE 1종뿐이었다. MAGE는 MAGICAL 공격 + HERO 방어구를 가진 고급 유닛으로, 동시 생존 상한이 10으로 낮아 물량 압박이 불가능했다. 플레이어가 성벽을 두텁게 쌓으면 원거리 위협이 MAGE의 소수 투사체로 제한되어, 후반부 긴장감이 부족했다.

또한 GAME_DURATION이 600s(10분)으로, 9개 스폰 구간이 540s까지만 정의되어 마지막 60초가 단조로웠다.

---

## 결정

### ARCHER(궁수) 유닛 추가

7번째 적 유닛 ARCHER를 추가한다. PHYSICAL 공격/PHYSICAL 방어의 원거리 유닛으로, MAGE와 다른 역할을 담당한다.

| 항목 | ARCHER | MAGE (비교) |
|------|--------|------------|
| attackType | PHYSICAL | MAGICAL |
| armorType | PHYSICAL | HERO |
| hpMax | 50 | 200 |
| attackDmg | 12 | 30 |
| rangedTiles | 2.5 | 3.5 |
| projSpeed | 200 px/s | 150 px/s |
| ENEMY_CAP | 40 | 10 |

### SPAWN_SCHEDULE 확장

9구간 → 14구간으로 확장한다. ARCHER는 420s(7분)부터 1마리로 시작하여 840s에 6마리까지 점진 증가한다. 600s 이후 구간에서는 SCOUT가 감소하고 FAST/TANKER/특수유닛이 증가하는 후반 고난도 구성이 추가된다.

### GAME_DURATION 변경

600s(10분) → 900s(15분)으로 확장하여 새로운 후반 구간에 대응할 시간을 확보한다.

### 투사체 시스템 일반화

`fireEnemyProjectile()`이 하드코딩된 속도(150) 대신 `ENEMY_DEFS[enemy.type].projSpeed`를 동적으로 참조하도록 변경한다. 투사체 렌더링도 `attackType`에 따라 색상을 분기한다(PHYSICAL→황갈색, MAGICAL→보라색).

---

## 이유

### MAGE와의 역할 분리

MAGE는 "소수 정예 마법 공격"이고 ARCHER는 "물량 물리 공격"이다. MAGE는 HERO 방어구로 THORN의 PHYSICAL 공격에 0.6배 감소를 받아 격파가 어렵다. ARCHER는 PHYSICAL 방어구로 THORN에 0.7배 감소를 받지만 HP가 50으로 낮아 집중 화력으로 빠르게 격파 가능하다. 대신 동시 40마리가 존재할 수 있어 물량으로 성벽 뒤편에 분산 피해를 준다.

### 짧은 사거리 + 빠른 투사체

rangedTiles 2.5(120px)는 MAGE의 3.5(168px)보다 짧아, ARCHER가 건물에 더 가까이 접근해야 한다. 이로 인해 THORN의 사거리(2.0~2.8타일) 안에 진입할 확률이 높아져, 타워 배치 전략이 ARCHER 대응에 유효하다. 투사체 속도 200 px/s는 MAGE(150)보다 빨라 회피가 어렵지만, 피해량(12)이 낮아 개별 위협은 작다.

### 후반 구간의 전략적 깊이

600s 이후 추가 구간에서 SCOUT가 줄고 FAST/특수유닛이 늘어나면, 단순 성벽+THORN 조합만으로는 대응이 어려워진다. ARCHER 물량과 MAGE의 장거리 마법이 동시에 오는 상황에서, SPORE의 AoE 슬로우와 REPAIR의 지속 수리를 전략적으로 배치해야 한다.

---

## 검토한 대안

### 대안 A: MAGE의 동시 상한만 올리기

- ENEMY_CAP.MAGE를 10 → 30으로 올려 물량을 확보.
- 기각 이유: MAGE의 HERO 방어구(PHYSICAL 0.6배)와 높은 HP(200)로 인해 물량이 늘면 밸런스가 크게 붕괴된다. 기존 타워 조합으로 대응이 거의 불가능해진다.

### 대안 B: 근접 고속 유닛 추가

- 빠른 근접 유닛을 추가하여 성벽 우회 압박.
- 기각 이유: FAST가 이미 이 역할을 담당하고 있다. 성벽 뒤편의 건물을 직접 위협하는 원거리 유닛이 더 전략적 다양성을 제공한다.

---

## 결과

- `ENEMY_DEFS.ARCHER` 상수가 추가되었다.
- `ENEMY_CAP`에 `ARCHER: 40`이 추가되었다.
- `SPAWN_SCHEDULE`이 14구간으로 확장되었다 (기존 9구간 + 5구간 추가).
- `GAME_DURATION`이 600 → 900으로 변경되었다.
- `fireEnemyProjectile()`이 `ENEMY_DEFS[enemy.type].projSpeed || 150`으로 속도를 동적 참조한다.
- `MAGE`에 `projSpeed: 150` 필드가 명시적으로 추가되었다 (기존 하드코딩 → 상수화).
- `renderEnemyProjectiles()`에서 `attackType`에 따라 PHYSICAL→황갈색(`#c0a040`), MAGICAL→보라색(`#c060ff`)으로 분기한다.
- 적 렌더링에 ARCHER 전용 표식(반원 호 + 시위 직선, 녹색)이 추가되었다.
- `G.pendingSpawn`에 `ARCHER: 0` 초기값이 추가되었다.
