# 적 유닛 정의

> **카테고리:** BALANCE
> **최초 작성:** 2026-03-23
> **최종 갱신:** 2026-03-24 (Phase 8: WARRIOR/MAGE/ARCHER 스탯 상향, 적 버프 발동 기준 조정)
> **관련 기능:** 적 시스템, 스폰 스케줄, 속성 시스템

## 개요

플레이어의 적인 인간 병사 7종의 스탯, 속성, 행동 방식, 스폰 상한을 정의한다. 모든 수치는 `game.js`의 `ENEMY_DEFS`와 `ENEMY_CAP` 상수에서 읽어온다.

Phase 7 변경: ARCHER(궁수) 유닛이 7번째 적으로 추가되었다. PHYSICAL 공격/방어의 원거리 유닛으로, 420s(7분)부터 점진적으로 등장한다. SPAWN_SCHEDULE이 9구간에서 14구간으로 확장되었고, GAME_DURATION이 600s(10분)에서 900s(15분)으로 변경되었다.

Phase 8 변경: WARRIOR/MAGE/ARCHER 3종 스탯 상향 조정. 적 버프(scheduleIdx 기반 HP/공격력 강화) 발동 기준이 scheduleIdx ≥ 9에서 ≥ 7(8단계 진입)로 앞당겨졌고 누적 공식이 변경되었다.

---

## 적 7종 스탯

| 필드 | 설명 |
|------|------|
| `hpMax` | 최대 체력 |
| `speed` | 이동 속도 (px/초) |
| `attackDmg` | 건물에 가하는 공격력 (1회당) |
| `attackRate` | 초당 공격 횟수 |
| `radius` | 충돌 반지름 (px) |
| `slotCost` | 성벽 공격 슬롯 소비량 (WALL_MAX_CAPACITY 기준) |
| `reward` | 처치 시 획득 자원 |
| `attackType` | 공격 속성 (DAMAGE_TABLE에서 배율 계산) |
| `armorType` | 방어 속성 (타워에 피격 시 배율 계산) |
| `ranged` | 원거리 여부 (true: 투사체 공격, false: 근접) |
| `rangedTiles` | 원거리 공격 사거리 (타일 단위, ranged=true 시) |

### CITIZEN — 일반 시민

```
hpMax: 30    speed: 60    attackDmg: 5    attackRate: 0.8/s
radius: 8    slotCost: 1  reward: 5
attackType: PHYSICAL    armorType: UNARMORED    ranged: false
color: #a0a080
```

초반에만 등장하는 약한 적. 빠르게 처치 가능하며 자원 보상이 낮다.

### SCOUT — 정찰병

```
hpMax: 60    speed: 70    attackDmg: 8    attackRate: 1.0/s
radius: 10   slotCost: 1  reward: 10
attackType: PHYSICAL    armorType: PHYSICAL    ranged: false
color: #c87820
```

게임 중반 이후 핵심 적. PHYSICAL 방어구로 타워의 PHYSICAL 공격에 0.7배 감소를 받는다.

### FAST — 돌격병

```
hpMax: 45    speed: 130   attackDmg: 10   attackRate: 1.2/s
radius: 12   slotCost: 2  reward: 15
attackType: PHYSICAL    armorType: PHYSICAL    ranged: false
color: #e04040
```

가장 빠른 이동 속도. 성벽을 우회하거나 얇은 방어선을 빠르게 돌파한다. slotCost 2로 성벽 용량을 많이 소비한다.

### TANKER — 중장갑

```
hpMax: 280   speed: 40    attackDmg: 35   attackRate: 0.6/s
radius: 15   slotCost: 2  reward: 30
attackType: PHYSICAL    armorType: PHYSICAL    ranged: false
color: #4060c0
```

높은 HP와 강한 공격력. 이동이 느려 타워 사정거리에 오래 노출되나, HP가 높아 소수의 타워로는 제거가 어렵다.

### WARRIOR — 전사 모험가

```
hpMax: 480   speed: 55    attackDmg: 60   attackRate: 0.8/s
radius: 14   slotCost: 3  reward: 60
attackType: HERO    armorType: HERO    ranged: false
color: #d0a030
```

> **Phase 8 변경:** hpMax 400 → 480, attackDmg 50 → 60.

HERO 방어구. 타워의 PHYSICAL 공격에 0.6배 감소를 받아 내구성이 매우 높다. 성벽 1개를 단독으로 점유(slotCost 3)한다.

### MAGE — 마법사 모험가

```
hpMax: 260   speed: 65    attackDmg: 40   attackRate: 1.0/s
radius: 11   slotCost: 2  reward: 50
attackType: MAGICAL    armorType: HERO    ranged: true    rangedTiles: 3.5
color: #8040c0
```

> **Phase 8 변경:** hpMax 200 → 260, attackDmg 30 → 40.

2종의 원거리 유닛 중 하나(ARCHER와 함께). 건물로부터 `3.5 × TILE_SIZE = 168px` 거리에서 투사체(`G.enemyProjectiles`)를 발사한다. 성벽 용량 제한을 받지 않으며 성벽 뒤편 건물도 공격 가능하다. HERO 방어구로 타워 PHYSICAL에 0.6배 감소. 투사체 속도 150 px/s.

### ARCHER — 궁수

```
hpMax: 65    speed: 80    attackDmg: 15   attackRate: 1.2/s
radius: 10   slotCost: 1  reward: 20
attackType: PHYSICAL    armorType: PHYSICAL    ranged: true    rangedTiles: 2.5    projSpeed: 200
color: #60a040    outlineColor: #305020
```

> **Phase 8 변경:** hpMax 50 → 65, attackDmg 12 → 15.

Phase 7에서 추가된 원거리 유닛. PHYSICAL 공격과 PHYSICAL 방어구를 가진다. MAGE와 달리 물리 속성이므로 HERO 방어구(WARRIOR, MAGE)에 0.6배 감소를 받지만, UNARMORED(CITIZEN)에 1.3배 효과적이다. 사거리 `2.5 × TILE_SIZE = 120px`로 MAGE(168px)보다 짧지만, 투사체 속도가 200 px/s로 MAGE(150 px/s)보다 빠르다. PHYSICAL 방어구를 가지므로 THORN(PHYSICAL 공격)에 0.7배 감소를 받아 내구성이 있다. 동시 생존 상한이 40으로 MAGE(10)보다 훨씬 많아 물량으로 압박한다. Phase 8에서 BALLISTA의 1순위 타겟으로 지정되었다.

렌더링: 활 표식(반원 호 + 시위 직선)이 녹색으로 그려진다.

---

## 동시 생존 상한 (ENEMY_CAP)

한 유닛 종류가 맵에 동시에 존재할 수 있는 최대 개체 수. 이 한도를 초과하는 스폰 요청은 `G.pendingSpawn`에 보류되며, 다음 배치 타이밍에 재시도한다.

| 유닛 | 상한 |
|------|------|
| CITIZEN | 80 |
| SCOUT | 100 |
| FAST | 50 |
| TANKER | 30 |
| WARRIOR | 10 |
| MAGE | 10 |
| ARCHER | 40 |

상한은 성능 보호 목적이기도 하다. SCOUT 100마리가 동시 충돌 처리에 포함되면 공간 해시 기반으로도 부하가 증가할 수 있다.

---

## 시간 기반 스폰 스케줄 (SPAWN_SCHEDULE)

WAVE 상태 진입(`G.gameTimer = 0`) 후 경과 시간 기준으로 14개 구간이 순차 적용된다. `interval`초마다 해당 구간의 유닛 구성 1배치를 스폰한다. 마지막 구간(840s~)은 게임 종료(900s)까지 유지된다.

> **Phase 7 변경:** 9구간 → 14구간으로 확장. ARCHER 필드 추가. GAME_DURATION이 600s → 900s(15분)로 변경되어 후반 구간이 추가되었다. 후반으로 갈수록 SCOUT가 감소하고 FAST/TANKER/WARRIOR/MAGE/ARCHER가 증가하는 고난도 구성이다.

| 구간 | timeStart | CITIZEN | SCOUT | FAST | TANKER | WARRIOR | MAGE | ARCHER | interval |
|------|-----------|---------|-------|------|--------|---------|------|--------|----------|
| 0 | 0s | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 7.0s |
| 1 | 120s | 0 | 4 | 0 | 0 | 0 | 0 | 0 | 6.0s |
| 2 | 180s | 0 | 6 | 1 | 0 | 0 | 0 | 0 | 5.5s |
| 3 | 240s | 0 | 8 | 2 | 0 | 0 | 0 | 0 | 5.0s |
| 4 | 300s | 0 | 10 | 3 | 1 | 0 | 0 | 0 | 4.5s |
| 5 | 360s | 0 | 12 | 5 | 2 | 0 | 0 | 0 | 4.0s |
| 6 | 420s | 0 | 14 | 6 | 2 | 1 | 1 | 1 | 4.0s |
| 7 | 480s | 0 | 15 | 7 | 3 | 1 | 1 | 2 | 3.5s |
| 8 | 540s | 0 | 15 | 7 | 3 | 2 | 2 | 2 | 3.0s |
| 9 | 600s | 0 | 12 | 8 | 4 | 2 | 2 | 3 | 3.0s |
| 10 | 660s | 0 | 10 | 9 | 4 | 3 | 3 | 3 | 2.8s |
| 11 | 720s | 0 | 7 | 10 | 5 | 3 | 3 | 4 | 2.5s |
| 12 | 780s | 0 | 5 | 11 | 6 | 4 | 4 | 5 | 2.3s |
| 13 | 840s | 0 | 3 | 12 | 7 | 5 | 5 | 6 | 2.0s |

설계 의도:
- 0~120s(구간 0): CITIZEN만 스폰. 초보 플레이어가 조작에 적응하는 시간.
- 120~300s: SCOUT 위주로 점진적 증가. 성벽/타워 기초 방어선 요구.
- 300s 이후: TANKER 등장으로 집중 화력 타워가 필요해짐.
- 420s 이후: WARRIOR + MAGE + ARCHER 등장. MAGE는 성벽 뒤편까지 공격하고, ARCHER는 물량으로 원거리 압박을 가한다.
- 600s 이후 (Phase 7 추가 구간): SCOUT 수가 점진적으로 감소하고 FAST/TANKER/특수유닛이 대거 증가. 스폰 간격도 3.0s → 2.0s로 가속되어 고밀도 후반전이 펼쳐진다.
- 840~900s: 최종 구간. 2.0초 간격으로 ARCHER 6, WARRIOR/MAGE 각 5로 최대 밀도 지속.

---

## 스케줄 진행 기반 적 버프 (Phase 8)

게임이 진행될수록(scheduleIdx 증가) 적 전체에 HP와 공격력이 비례하여 강화된다.

**적용 공식:**

```javascript
buffMult = Math.max(0, scheduleIdx - 6) * 0.10
실제 hpMax   = basehpMax   × (1 + buffMult)
실제 attackDmg = baseAttackDmg × (1 + buffMult)
```

**발동 기준 및 변경 이유:**

| 항목 | Phase 8 이전 | Phase 8 이후 |
|------|-------------|-------------|
| 발동 시작 scheduleIdx | 9 (구간 9, 600s~) | 7 (구간 7, 480s~) |
| 기준 공식 | `Math.max(0, scheduleIdx - 9)` | `Math.max(0, scheduleIdx - 6)` |

Phase 7에서 WARRIOR/MAGE/ARCHER가 구간 6(420s)에 처음 등장함에도, 적 버프 발동이 구간 9(600s)로 늦어 후반 압박이 부족하다는 밸런스 문제가 확인되었다. Phase 8에서 버프 발동을 구간 7(480s) 진입 시점으로 앞당겼다.

**구간별 적용 배율표:**

| scheduleIdx | 해당 구간 시작 시간 | buffMult | HP/공격력 보정 |
|-------------|------------------|----------|---------------|
| 0 ~ 6 | 0s ~ 420s | 0% | 버프 없음 |
| 7 | 480s | +10% | 전 유닛 HP/공격력 ×1.10 |
| 8 | 540s | +20% | 전 유닛 HP/공격력 ×1.20 |
| 9 | 600s | +30% | 전 유닛 HP/공격력 ×1.30 |
| 10 | 660s | +40% | 전 유닛 HP/공격력 ×1.40 |
| 11 | 720s | +50% | 전 유닛 HP/공격력 ×1.50 |
| 12 | 780s | +60% | 전 유닛 HP/공격력 ×1.60 |
| 13 | 840s | +70% | 전 유닛 HP/공격력 ×1.70 |

버프는 스폰 시점에 각 유닛 인스턴스에 적용된다. 이미 필드에 존재하는 유닛에게는 소급 적용되지 않는다. 버프 배율은 이 문서에 기재된 기본 스탯(hpMax, attackDmg)에 곱산된다.
