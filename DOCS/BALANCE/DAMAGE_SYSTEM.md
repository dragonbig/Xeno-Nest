# 속성 피해 시스템

> **카테고리:** BALANCE
> **최초 작성:** 2026-03-23
> **최종 갱신:** 2026-03-24 (Phase 8: BALLISTA 추가 — PHYSICAL 공격)
> **관련 기능:** 타워 공격, 적 공격, 피해 계산

## 개요

공격 속성(attackType)과 방어 속성(armorType)의 조합으로 최종 피해 배율을 결정하는 시스템이다. `DAMAGE_TABLE[attackType][armorType]`으로 배율을 조회한다. 건물은 모두 `STRUCTURE` 방어구를 가지며, 적은 유닛 종류에 따라 다른 방어 속성을 가진다.

---

## 방어 속성 (ARMOR_TYPE)

| 값 | 사용 유닛 |
|----|-----------|
| `UNARMORED` | CITIZEN |
| `PHYSICAL` | SCOUT, FAST, TANKER, ARCHER |
| `MAGICAL` | (현재 미사용, 확장 예약) |
| `HERO` | WARRIOR, MAGE |
| `STRUCTURE` | NEST, WALL, THORN, SPORE, REPAIR, RESOURCE (모든 건물) |

---

## 공격 속성 (ATTACK_TYPE)

| 값 | 사용 공격 | 추가된 시점 |
|----|-----------|-------------|
| `PHYSICAL` | THORN 공격, BALLISTA 투사체, CITIZEN/SCOUT/FAST/TANKER/WARRIOR 근접 공격, ARCHER 원거리 투사체 | Phase 1 (ARCHER: Phase 7, BALLISTA: Phase 8) |
| `MAGICAL` | MAGE 투사체 공격 | Phase 2 |
| `HERO` | WARRIOR 근접 공격 | Phase 2 |
| `ACID` | SPORE 투사체 공격 | Phase 3 |

---

## 피해 배율표 (DAMAGE_TABLE)

`DAMAGE_TABLE[attackType][armorType]`

|  | UNARMORED | PHYSICAL | MAGICAL | HERO | STRUCTURE |
|--|-----------|----------|---------|------|-----------|
| **PHYSICAL** | 1.3 | 0.7 | 1.2 | 0.6 | 1.0 |
| **MAGICAL** | 1.3 | 1.2 | 0.7 | 0.6 | 1.0 |
| **HERO** | 1.5 | 1.3 | 1.3 | 1.0 | 1.0 |
| **ACID** | 1.2 | 1.1 | 0.9 | 0.8 | 0.8 |

---

## 실제 피해 계산 예시

### THORN(Lv.1) → SCOUT 공격

```
baseDamage = 15
attackType  = PHYSICAL
armorType   = PHYSICAL (SCOUT)
mult = DAMAGE_TABLE['PHYSICAL']['PHYSICAL'] = 0.7

실제 피해 = Math.round(15 × 0.7) = 11
```

### SPORE(Lv.1) → CITIZEN 공격

```
baseDamage = 12
attackType  = ACID
armorType   = UNARMORED (CITIZEN)
mult = DAMAGE_TABLE['ACID']['UNARMORED'] = 1.2

실제 피해 = Math.round(12 × 1.2) = 14
```

### SPORE(Lv.1) → WARRIOR 공격

```
baseDamage = 12
attackType  = ACID
armorType   = HERO (WARRIOR)
mult = DAMAGE_TABLE['ACID']['HERO'] = 0.8

실제 피해 = Math.round(12 × 0.8) = 10
```

### SPORE(Lv.1) → TANKER 공격

```
baseDamage = 12
attackType  = ACID
armorType   = PHYSICAL (TANKER)
mult = DAMAGE_TABLE['ACID']['PHYSICAL'] = 1.1

실제 피해 = Math.round(12 × 1.1) = 13
```

### MAGE → 건물 공격

```
attackDmg  = 30
attackType = MAGICAL
armorType  = STRUCTURE (모든 건물)
mult = DAMAGE_TABLE['MAGICAL']['STRUCTURE'] = 1.0

실제 피해 = 30 (배율 없음)
```

코드 참고: 적이 건물을 공격할 때는 `DAMAGE_TABLE`을 거치지 않고 `attackDmg`를 직접 적용한다. 배율표는 타워(플레이어 측)가 적을 공격할 때만 `updateTowers()`에서 적용된다.

---

## 설계 의도

- HERO 방어구(WARRIOR, MAGE)는 모든 속성에 대해 0.6~0.8 이하 배율을 받아 내구성이 높다. 타워 집중 화력이 필요하다.
- STRUCTURE는 PHYSICAL/MAGICAL/HERO에 배율 1.0. ACID는 0.8로 건물끼리의 상호 수리(REPAIR 건물)를 통해 SPORE가 자신의 구조물을 공격하는 상황을 방지하는 맥락은 없으나, 포자 폭발이 구조물에 약하다는 세계관적 근거로 설계되었다.
- PHYSICAL 공격(THORN, BALLISTA)은 HERO 유닛에 0.6배 약점이 있어, 후반 WARRIOR/MAGE 등장 시 SPORE 또는 WALL 조합이 요구된다. BALLISTA는 ARCHER(PHYSICAL 방어구)를 우선 타겟하므로 0.7배 감소 배율이 적용되는 점에 유의해야 한다.
- ACID 속성(SPORE)은 UNARMORED/PHYSICAL 적에 강하고 HERO에 약하다. 초중반 물량 웨이브에 효과적이며, 후반 HERO 유닛에는 THORN과 역할이 상호 보완된다.
