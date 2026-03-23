# 글로벌 업그레이드 시스템

> **카테고리:** FEATURES
> **최초 작성:** 2026-03-23
> **최종 갱신:** 2026-03-23 (Phase 6: NEST_SHIELD→WALL_DEFENSE 교체, 6종 비용 통일, 방벽 업그레이드 묶음 표시)
> **관련 기능:** 핵심 둥지 패널, 자가 수리, 건물 강화, 자원 생산

## 개요

핵심 둥지(NEST)를 클릭해 건물 정보 패널을 열면 글로벌 업그레이드 6종을 구매할 수 있다. 글로벌 업그레이드는 개별 건물 진화와 달리 게임 전체에 영구 효과를 부여한다. 각 업그레이드는 최대 30레벨까지 반복 구매 가능하며, 레벨이 올라갈수록 비용이 기하급수적으로 증가한다.

> **Phase 5 변경:** Phase 4까지의 `NEST_UPGRADES` 상수(1종, boolean 방식)가 전면 제거되었다. `GLOBAL_UPGRADES`(6종, 30레벨 시스템)로 교체되었으며, `G.nestUpgrades`(Set)와 `G.selfRepairUnlocked`(boolean) 대신 `G.globalUpgrades` 객체 하나로 통합되었다.

> **Phase 6 변경:**
> - `NEST_SHIELD`(둥지 보호막)가 제거되고 `WALL_DEFENSE`(방벽 방어력)로 교체되었다. NEST 피해 감소 대신 WALL이 받는 피해를 감소시킨다.
> - 6종 글로벌 업그레이드의 비용이 모두 통일되었다: 시작 100, 배율 x1.18, Lv.30 = 12,150.
> - NEST 패널에서 WALL_DEFENSE와 WALL_FORTIFY가 한 줄에 나란히 표시된다.

---

## GLOBAL_UPGRADES 상수 정의

6종의 업그레이드가 배열로 정의되며, 각 항목은 아래 형태를 갖는다.

```javascript
{
  id:         'SELF_REPAIR',     // 고유 식별자
  name:       '자가 수리 강화',   // UI 표시명
  icon:       '🔋',              // 아이콘
  maxLv:      30,                // 최대 레벨
  cost:       [150, 200, ...],   // cost[lv] = Lv.(lv+1)로 올리는 비용 (30개 원소)
  effectDesc: lv => `...`,       // 레벨별 효과 설명 함수
}
```

---

## 6종 업그레이드 상세

### 1. SELF_REPAIR — 자가 수리 강화 (🔋)

**효과:** 매 `HEAL_INTERVAL`(10초)마다 완성된 모든 건물의 HP를 자동 회복한다.

**회복량 공식:**
```
healAmt = (8 + srLv × 4) + (nestLv - 1) × 4
```
- `srLv`: SELF_REPAIR 현재 레벨 (1~30)
- `nestLv`: NEST 건물 레벨 (1~3)

**레벨별 회복량 (NEST Lv.1 기준):**

| SELF_REPAIR Lv | 회복량 (HP/10초) |
|----------------|-----------------|
| Lv.1 | 12 |
| Lv.5 | 28 |
| Lv.10 | 48 |
| Lv.15 | 68 |
| Lv.20 | 88 |
| Lv.25 | 108 |
| Lv.30 | 128 |

NEST 레벨 보너스: Lv.2이면 +4, Lv.3이면 +8 추가.

**비용 (6종 통일, 일부 발췌):**

| Lv | 비용 |
|----|------|
| 1 | 100 |
| 5 | 194 |
| 10 | 444 |
| 15 | 1,015 |
| 20 | 2,321 |
| 25 | 5,311 |
| 30 | 12,150 |

> **Phase 6 변경:** 기존 150~553,500 범위에서 100~12,150 범위로 대폭 조정. 6종 모두 동일한 비용 배열을 사용한다 (시작 100, 배율 x1.18).

**활성화 조건:** `G.globalUpgrades.SELF_REPAIR > 0`이면 `updateRepair(dt)`가 동작한다. 첫 구매(레벨 0 → 1) 시 `G.repairTimer = HEAL_INTERVAL`로 타이머가 초기화되어 10초 후 첫 발동한다.

**회복 대상:** `built === true`이고 `upgrading === false`인 모든 건물.

---

### 2. THORN_BOOST — 촉수 강화 (🌿)

**효과:** THORN 건물의 공격력과 발사 속도를 증가시킨다.

**적용 공식:**
```
effectiveDamage   = Math.round(baseDamage × (1 + thornLv × 0.03) × armorMult)
effectiveFireRate = baseFireRate × (1 + thornLv × 0.02)
```

**레벨별 보너스:**

| THORN_BOOST Lv | 공격력 증가 | 발사속도 증가 |
|----------------|-----------|-------------|
| Lv.1 | +3% | +2% |
| Lv.10 | +30% | +20% |
| Lv.20 | +60% | +40% |
| Lv.30 | +90% | +60% |

**비용:** 6종 통일 비용 배열 참조 (SELF_REPAIR와 동일).

---

### 3. SPORE_BOOST — 포자 강화 (🟤)

**효과:** SPORE 건물의 공격력과 슬로우 디버프 지속시간을 증가시킨다.

**적용 공식:**
```
effectiveDamage    = Math.round(baseDamage × (1 + sporeLv × 0.03) × armorMult)
effectiveSlowDur   = SPORE_STATS.slowDuration × (1 + sporeLv × 0.05)
```

슬로우 지속시간은 투사체 명중 시(`updateEnemyProjectiles` 내부) 적용된다.

**레벨별 보너스:**

| SPORE_BOOST Lv | 공격력 증가 | 슬로우 지속 증가 |
|----------------|-----------|----------------|
| Lv.1 | +3% | +5% |
| Lv.10 | +30% | +50% |
| Lv.20 | +60% | +100% |
| Lv.30 | +90% | +150% |

**비용:** 6종 통일 비용 배열 참조 (SELF_REPAIR와 동일).

---

### 4. WALL_DEFENSE — 방벽 방어력 (🛡️)

> **Phase 6 변경:** 기존 `NEST_SHIELD`(둥지 보호막, NEST 피해 감소 1.5%/lv)가 제거되고 `WALL_DEFENSE`로 교체되었다. NEST가 아닌 WALL 건물의 피해를 감소시킨다.

**효과:** 모든 WALL 건물이 받는 피해를 감소시킨다.

**적용 공식:**
```
dmg = Math.round(originalDmg × (1 - defLv × 0.02))
if (dmg < 1) dmg = 1;  // 최소 1 피해 보장
```

두 곳에서 적용된다:
1. `pursueTarget()` — 근접 적이 WALL을 타격할 때 (`target.type === 'WALL'` 조건)
2. `updateEnemyProjectiles()` — 원거리 투사체가 WALL에 명중할 때

**레벨별 피해 감소:**

| WALL_DEFENSE Lv | 피해 감소율 |
|-----------------|-----------|
| Lv.1 | 2% |
| Lv.10 | 20% |
| Lv.20 | 40% |
| Lv.30 | 60% |

**비용:** 6종 통일 비용 배열 참조 (SELF_REPAIR와 동일).

---

### 5. RESOURCE_BOOST — 자원 증폭 (💎)

**효과:** RESOURCE 건물의 자원 생산량을 증가시킨다.

**적용 공식:**
```
baseAmount = Math.round(RESOURCE_STATS.amount × (1 + (buildingLevel - 1) × 0.3))
amount     = Math.round(baseAmount × (1 + rbLv × 0.03))
```

건물 자체 레벨 보너스와 곱연산으로 중첩된다.

**레벨별 보너스:**

| RESOURCE_BOOST Lv | 생산량 증가 |
|-------------------|-----------|
| Lv.1 | +3% |
| Lv.10 | +30% |
| Lv.20 | +60% |
| Lv.30 | +90% |

**비용:** 6종 통일 비용 배열 참조 (SELF_REPAIR와 동일).

---

### 6. WALL_FORTIFY — 방벽 강화 (🧱)

**효과:** 모든 WALL 건물의 hpMax를 증가시킨다.

**적용 공식:**
```
newHpMax = Math.round(baseHpMax × (1 + fortifyLv × 0.03))
```

`baseHpMax`는 `BUILDING_DEFS.WALL.hpPerLevel[level - 1]` 값이다.

**적용 시점 3곳:**
1. `recalcWallHp()` — WALL_FORTIFY 구매 직후 호출. 기존 모든 WALL의 hpMax를 재계산하며 HP 비율을 보존한다.
2. `startUpgrade()` 완료 시 — WALL 레벨업 완료 시 새 hpMax에 WALL_FORTIFY 보너스를 반영한다.
3. 신규 WALL 배치 시 — `createBuilding()` 내부에서 즉시 보너스를 반영한다.

**레벨별 보너스:**

| WALL_FORTIFY Lv | hpMax 증가 |
|-----------------|-----------|
| Lv.1 | +3% |
| Lv.10 | +30% |
| Lv.20 | +60% |
| Lv.30 | +90% |

**비용:** 6종 통일 비용 배열 참조 (SELF_REPAIR와 동일).

---

## recalcWallHp() 헬퍼 함수

WALL_FORTIFY 구매 시 호출되어 기존 모든 WALL의 hpMax를 재계산한다.

```javascript
function recalcWallHp() {
  const fortifyLv = G.globalUpgrades.WALL_FORTIFY;
  for (const b of G.buildings) {
    if (b.type !== 'WALL') continue;
    const def = BUILDING_DEFS.WALL;
    const baseHpMax = def.hpPerLevel[b.level - 1];
    const newHpMax  = Math.round(baseHpMax * (1 + fortifyLv * 0.03));
    const ratio     = b.hpMax > 0 ? b.hp / b.hpMax : 1;
    b.hpMax = newHpMax;
    b.hp    = Math.min(b.hpMax, Math.round(b.hpMax * ratio));
  }
}
```

HP 비율 보존 로직: 현재 HP 비율(`hp / hpMax`)을 계산한 후, 새 hpMax에 동일 비율을 곱한다. 예를 들어 HP가 50% 상태에서 WALL_FORTIFY를 구매하면, 새 hpMax의 50%가 현재 HP로 설정된다.

---

## 글로벌 업그레이드 상태 저장

구매된 업그레이드 레벨은 `G.globalUpgrades` 객체에 정수로 저장된다.

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

- 각 값은 0(미구매)부터 30(최대)까지의 정수
- `initGame()` 호출 시 모든 값이 0으로 초기화됨 (이전 게임 내역 초기화)
- Phase 4까지 사용되던 `G.nestUpgrades`(Set)와 `G.selfRepairUnlocked`(boolean)는 제거됨

---

## 패널 UI 동작

`openBuildingPanel()`에서 NEST 선택 시 6종 업그레이드 버튼이 생성된다. 방벽 관련 업그레이드(WALL_DEFENSE, WALL_FORTIFY)는 나란히 한 줄로 묶여 표시된다.

각 버튼 표시 형식:
- **구매 가능:** `"{icon} {name} Lv.{현재} → {다음} ({비용}자원)"` — 자원 부족 시 `disabled` 클래스 추가
- **최대 레벨:** `"{icon} {name} Lv.30 (MAX)"` — `disabled` 처리

구매 클릭 시 처리 순서:
1. 레벨 상한(maxLv) 체크
2. 자원 보유량 체크 → 부족 시 `showStatus('자원 부족')` 후 리턴
3. 자원 차감 → 해당 업그레이드 레벨 +1
4. SELF_REPAIR 첫 구매 시: `G.repairTimer = HEAL_INTERVAL` 타이머 초기화
5. WALL_FORTIFY 구매 시: `recalcWallHp()` 호출
6. HUD 갱신 → 패널 갱신

---

## 비용 구조 설계 근거

> **Phase 6 변경:** 6종 모두 동일한 비용 배열로 통일되었다. 기존에는 업그레이드별로 비용이 달랐으나, 전략적 선택을 명확히 하기 위해 비용 차이를 제거했다.

6종 모두 30레벨이며 동일한 비용 배열을 공유한다. 증가 비율은 약 x1.18이다.

```
비용 배열: [100, 118, 139, 164, 194, 229, 270, 319, 376, 444,
           523, 618, 729, 860, 1015, 1197, 1413, 1667, 1967, 2321,
           2739, 3232, 3814, 4501, 5311, 6267, 7395, 8726, 10297, 12150]
```

| 업그레이드 | Lv.1 비용 | Lv.30 비용 |
|-----------|----------|-----------|
| 6종 공통 | 100 | 12,150 |

모든 업그레이드의 비용이 동일하므로, 플레이어는 순수하게 전략적 판단(어떤 효과가 현재 게임 상황에 더 유리한지)으로 투자 순서를 결정해야 한다. RESOURCE_BOOST를 먼저 올려 자원 수급을 강화한 뒤 나머지를 올리는 전략이 여전히 경제적으로 유리하다.
