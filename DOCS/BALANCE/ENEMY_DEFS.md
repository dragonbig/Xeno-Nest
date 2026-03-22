# 적 유닛 정의

> **카테고리:** BALANCE
> **최초 작성:** 2026-03-23
> **최종 갱신:** 2026-03-23
> **관련 기능:** 적 시스템, 스폰 스케줄, 속성 시스템

## 개요

플레이어의 적인 인간 병사 6종의 스탯, 속성, 행동 방식, 스폰 상한을 정의한다. 모든 수치는 `game.js`의 `ENEMY_DEFS`와 `ENEMY_CAP` 상수에서 읽어온다.

---

## 적 6종 스탯

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
hpMax: 400   speed: 55    attackDmg: 50   attackRate: 0.8/s
radius: 14   slotCost: 3  reward: 60
attackType: HERO    armorType: HERO    ranged: false
color: #d0a030
```

HERO 방어구. 타워의 PHYSICAL 공격에 0.6배 감소를 받아 내구성이 매우 높다. 성벽 1개를 단독으로 점유(slotCost 3)한다.

### MAGE — 마법사 모험가

```
hpMax: 200   speed: 65    attackDmg: 30   attackRate: 1.0/s
radius: 11   slotCost: 2  reward: 50
attackType: MAGICAL    armorType: HERO    ranged: true    rangedTiles: 3.5
color: #8040c0
```

유일한 원거리 유닛. 건물로부터 `3.5 × TILE_SIZE = 168px` 거리에서 투사체(`G.enemyProjectiles`)를 발사한다. 성벽 용량 제한을 받지 않으며 성벽 뒤편 건물도 공격 가능하다. HERO 방어구로 타워 PHYSICAL에 0.6배 감소.

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

상한은 성능 보호 목적이기도 하다. SCOUT 100마리가 동시 충돌 처리에 포함되면 공간 해시 기반으로도 부하가 증가할 수 있다.

---

## 시간 기반 스폰 스케줄 (SPAWN_SCHEDULE)

WAVE 상태 진입(`G.gameTimer = 0`) 후 경과 시간 기준으로 9개 구간이 순차 적용된다. `interval`초마다 해당 구간의 유닛 구성 1배치를 스폰한다. 마지막 구간(540s~)은 게임 종료(600s)까지 유지된다.

| 구간 | timeStart | CITIZEN | SCOUT | FAST | TANKER | WARRIOR | MAGE | interval |
|------|-----------|---------|-------|------|--------|---------|------|----------|
| 0 | 0s | 2 | 0 | 0 | 0 | 0 | 0 | 7.0s |
| 1 | 120s | 0 | 4 | 0 | 0 | 0 | 0 | 6.0s |
| 2 | 180s | 0 | 6 | 1 | 0 | 0 | 0 | 5.5s |
| 3 | 240s | 0 | 8 | 2 | 0 | 0 | 0 | 5.0s |
| 4 | 300s | 0 | 10 | 3 | 1 | 0 | 0 | 4.5s |
| 5 | 360s | 0 | 12 | 5 | 2 | 0 | 0 | 4.0s |
| 6 | 420s | 0 | 14 | 6 | 2 | 1 | 1 | 4.0s |
| 7 | 480s | 0 | 15 | 7 | 3 | 1 | 1 | 3.5s |
| 8 | 540s | 0 | 15 | 7 | 3 | 2 | 2 | 3.0s |

설계 의도:
- 0~120s(구간 0): CITIZEN만 스폰. 초보 플레이어가 조작에 적응하는 시간.
- 120~300s: SCOUT 위주로 점진적 증가. 성벽/타워 기초 방어선 요구.
- 300s 이후: TANKER 등장으로 집중 화력 타워가 필요해짐.
- 420s 이후: WARRIOR + MAGE 등장. MAGE는 성벽 뒤편까지 공격해 방어 전략을 복잡하게 만든다.
- 540~600s: 최종 구간. 3.0초 간격으로 최대 밀도 지속.
