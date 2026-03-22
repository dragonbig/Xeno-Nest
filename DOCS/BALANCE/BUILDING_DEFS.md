# 건물 정의

> **카테고리:** BALANCE
> **최초 작성:** 2026-03-23
> **최종 갱신:** 2026-03-23 (NEST 2x2, BFS 거리맵)
> **관련 기능:** 건물 시스템, 속성 시스템, 자원 관리, 글로벌 업그레이드

## 개요

플레이어가 배치할 수 있는 건물 6종의 비용, 건설 시간, 체력, 업그레이드 수치를 정의한다. 모든 건물의 `armorType`은 `STRUCTURE`이다. 수치 출처: `game.js`의 `BUILDING_DEFS`, `THORN_STATS`, `SPORE_STATS`, `REPAIR_STATS`, `RESOURCE_STATS`.

Phase 4 변경: WALL이 10레벨로, NEST가 3레벨로, RESOURCE가 5레벨로 확장되었다. `b.upgraded` 이진 플래그가 전면 제거되고 모든 건물이 `b.level` 기반으로 통일되었다.

Phase 5 변경: GLOBAL_UPGRADES 6종(30레벨)이 도입되어 WALL, NEST, THORN, SPORE, RESOURCE 건물에 글로벌 보너스가 적용된다. 각 건물에 영향을 주는 글로벌 업그레이드는 해당 건물 섹션에 기술한다.

---

## 건물 6종 정의 (BUILDING_DEFS)

### NEST — 핵심 둥지

```
cost: 100     buildTime: 5s
armorType: STRUCTURE
color: #9040c0
maxLv: 3
w: 2          h: 2          (4타일 점유)
```

**크기:** 2x2 타일 (row~row+1, col~col+1). 게임 내 유일한 다중 타일 건물이다.

**레벨별 수치 (BUILDING_DEFS.NEST):**

| 항목 | Lv.1 | Lv.2 | Lv.3 |
|------|------|------|------|
| hpMax | 500 | 700 | 950 |

**업그레이드 비용/시간:**

| Lv.1→2 | Lv.2→3 | Lv.3 |
|---------|---------|------|
| 비용: 1000 | 5000 | 최대 레벨 |
| 시간: 15s | 20s | — |

- 게임의 핵심 건물. HP가 0이 되면 즉시 게임 오버.
- PLACING 상태에서 NEST_ZONE(colMin 12 ~ colMax 16, rowMin 3 ~ rowMax 5) 내에 2x2 영역이 완전히 들어가야 배치 가능.
- 2x2 크기이므로 `getBuildingCenter(b)`로 중심 좌표를 계산한다: `(col+1)*48, (row+1)*48`.
- BFS 거리맵의 시작점(거리 0)으로 4타일 모두 사용된다 (multi-source BFS).
- 글로벌 업그레이드(GLOBAL_UPGRADES)는 NEST 레벨 업그레이드와 별개로 구매 가능.
- 철거 불가.

**NEST에 영향을 주는 글로벌 업그레이드:**

| 글로벌 업그레이드 | 효과 |
|-----------------|------|
| SELF_REPAIR | 치유량이 SELF_REPAIR 레벨 + NEST 레벨에 연동. 공식: `(8 + srLv × 4) + (nestLv - 1) × 4` |
| NEST_SHIELD | NEST가 받는 모든 피해를 `shieldLv × 1.5%` 감소. 근접/원거리 모두 적용. Lv.30 시 45% 감소 |

**SELF_REPAIR 치유량 표 (NEST 레벨별):**

| SELF_REPAIR Lv | NEST Lv.1 | NEST Lv.2 | NEST Lv.3 |
|----------------|-----------|-----------|-----------|
| Lv.1 | 12 | 16 | 20 |
| Lv.10 | 48 | 52 | 56 |
| Lv.20 | 88 | 92 | 96 |
| Lv.30 | 128 | 132 | 136 |

Phase 5에서 `NEST_UPGRADES` 상수와 `G.nestUpgrades`(Set), `G.selfRepairUnlocked`(boolean)가 제거되고, `G.globalUpgrades` 객체로 통합되었다.

---

### WALL — 성벽

```
cost: 30      buildTime: 3s
armorType: STRUCTURE
color: #806040
maxLv: 10
```

**레벨별 수치 (BUILDING_DEFS.WALL):**

| 레벨 | hpMax | 업그레이드 비용 | 업그레이드 시간 |
|------|-------|----------------|----------------|
| Lv.1 | 200 | 30 | — |
| Lv.2 | 260 | 50 | 5s |
| Lv.3 | 340 | 80 | 6s |
| Lv.4 | 440 | 150 | 7s |
| Lv.5 | 570 | 200 | 8s |
| Lv.6 | 740 | 300 | 9s |
| Lv.7 | 960 | 500 | 10s |
| Lv.8 | 1250 | 800 | 12s |
| Lv.9 | 1625 | 1300 | 14s |
| Lv.10 | 2100 | (최대 레벨) | 16s |

배열 인덱스 정의 (`upgradeTime`, `upgradeCost`, `hpPerLevel` 모두 인덱스 0 = Lv.1 기준):
- `hpPerLevel[i]` — Lv.(i+1)의 hpMax
- `upgradeCost[i]` — Lv.(i+1)에서 Lv.(i+2)로 올리는 비용 (i=9는 null)
- `upgradeTime[i]` — Lv.(i+1) → Lv.(i+2) 소요 시간 (인덱스 0~8, 총 9개)

- 적이 둥지로 향하는 직선 경로를 막는 장애물.
- WALL_MAX_CAPACITY(5슬롯) 초과 적은 성벽 앞에서 대기.
- 레벨 상승 시 hpMax가 증가하며, 기존 HP 비율을 유지한다 (예: HP 50% 상태에서 업그레이드 완료 시 새 hpMax의 50% 적용).
- 건설 비용 30이므로 다수 배치가 가능하나, 고레벨 없이 후반 웨이브에서 HP가 빠르게 소진된다.
- Phase 4부터 `b.level` 기반으로 동작. `b.upgraded` 이진 플래그 제거.

**WALL에 영향을 주는 글로벌 업그레이드 — WALL_FORTIFY:**

WALL_FORTIFY 레벨에 따라 모든 WALL의 hpMax가 증가한다.

```
실제 hpMax = Math.round(baseHpMax × (1 + fortifyLv × 0.03))
```

| WALL Lv | 기본 hpMax | WALL_FORTIFY Lv.10 (+30%) | WALL_FORTIFY Lv.30 (+90%) |
|---------|----------|--------------------------|--------------------------|
| Lv.1 | 200 | 260 | 380 |
| Lv.5 | 570 | 741 | 1,083 |
| Lv.10 | 2,100 | 2,730 | 3,990 |

적용 시점: WALL_FORTIFY 구매 시 `recalcWallHp()`가 호출되어 기존 WALL의 hpMax를 즉시 재계산한다. HP 비율은 보존된다(예: 50% 상태에서 구매하면 새 hpMax의 50%가 현재 HP). 신규 WALL 배치 시에도 즉시 보너스가 반영된다.

---

### THORN — 가시 촉수 (Phase 3 신규)

```
cost: 50      buildTime: 3s
hpMax: 120    armorType: STRUCTURE
color: 녹색 계열
```

**공격 스탯 (THORN_STATS) — 5레벨 배열 (인덱스 = 레벨 - 1):**

| 항목 | Lv.1 | Lv.2 | Lv.3 | Lv.4 | Lv.5 |
|------|------|------|------|------|------|
| 사거리 (타일) | 2.0 | 2.2 | 2.4 | 2.6 | 2.8 |
| 공격력 | 15 | 20 | 26 | 32 | 40 |
| 발사 속도 (/s) | 2.0 | 2.2 | 2.4 | 2.6 | 3.0 |
| 투사체 속도 (px/s) | 200 | 200 | 200 | 200 | 200 |
| 공격 속성 | PHYSICAL | PHYSICAL | PHYSICAL | PHYSICAL | PHYSICAL |

**업그레이드 비용/시간:**

| 단계 | Lv.1→2 | Lv.2→3 | Lv.3→4 | Lv.4→5 | Lv.5 |
|------|--------|--------|--------|--------|------|
| 비용 | 150 | 500 | 1500 | 3000 | 최대 레벨 |
| 시간 | 8s | 9s | 10s | 11s | — |

- 근거리 고속 공격 타입. 사거리가 짧은 대신 발사 속도가 빠르다.
- PHYSICAL 공격이므로 HERO 방어구에 감소 배율(0.6) 적용.

**THORN에 영향을 주는 글로벌 업그레이드 — THORN_BOOST:**

| 보너스 | 레벨당 | Lv.30 최대 |
|--------|--------|-----------|
| 공격력 | +3% | +90% |
| 발사속도 | +2% | +60% |

공식: `effectiveDamage = Math.round(baseDamage × (1 + thornLv × 0.03) × armorMult)`, `effectiveFireRate = baseFireRate × (1 + thornLv × 0.02)`

---

### SPORE — 산성 포자 (Phase 3 신규)

```
cost: 70      buildTime: 4s
hpMax: 100    armorType: STRUCTURE
color: 황갈색 계열
```

**공격 스탯 (SPORE_STATS) — 5레벨 배열 (인덱스 = 레벨 - 1):**

| 항목 | Lv.1 | Lv.2 | Lv.3 | Lv.4 | Lv.5 |
|------|------|------|------|------|------|
| 사거리 (타일) | 4.0 | 4.3 | 4.6 | 5.0 | 5.5 |
| 공격력 | 12 | 16 | 20 | 25 | 30 |
| 발사 속도 (/s) | 0.6 | 0.65 | 0.7 | 0.8 | 0.9 |
| 투사체 속도 (px/s) | 140 | 140 | 140 | 140 | 140 |
| 공격 속성 | ACID | ACID | ACID | ACID | ACID |

**슬로우 디버프 (모든 레벨 공통):**

| 항목 | 값 |
|------|----|
| slowAmount | 0.3 (이동속도 30% 감소) |
| slowDuration | 3.0초 |

**업그레이드 비용/시간:**

| 단계 | Lv.1→2 | Lv.2→3 | Lv.3→4 | Lv.4→5 | Lv.5 |
|------|--------|--------|--------|--------|------|
| 비용 | 150 | 500 | 1500 | 3000 | 최대 레벨 |
| 시간 | 10s | 11s | 12s | 13s | — |

- 원거리 타입. 사거리가 길고 명중 시 슬로우 디버프를 부여한다.
- ACID 공격 속성: UNARMORED에 1.2배, PHYSICAL에 1.1배로 효과적이나 HERO에는 0.8배 감소.
- 발사 속도가 느리므로 전방 THORN 또는 WALL과 조합해 피해 집중 효과를 낸다.

**SPORE에 영향을 주는 글로벌 업그레이드 — SPORE_BOOST:**

| 보너스 | 레벨당 | Lv.30 최대 |
|--------|--------|-----------|
| 공격력 | +3% | +90% |
| 슬로우 지속시간 | +5% | +150% |

공격력: `effectiveDamage = Math.round(baseDamage × (1 + sporeLv × 0.03) × armorMult)`
슬로우 지속: `effectiveSlowDur = SPORE_STATS.slowDuration × (1 + sporeLv × 0.05)` — 투사체 명중 시 적용

---

### REPAIR — 구조물 수리 (Phase 3 신규)

```
cost: 60      buildTime: 4s
hpMax: 80     armorType: STRUCTURE
color: 청록색 계열
```

**수리 스탯 (REPAIR_STATS) — 5레벨 배열 (인덱스 = 레벨 - 1):**

| 항목 | Lv.1 | Lv.2 | Lv.3 | Lv.4 | Lv.5 |
|------|------|------|------|------|------|
| 수리 범위 (타일) | 2.0 | 2.5 | 3.0 | 3.5 | 4.0 |
| 초당 회복량 (HP/s) | 5 | 8 | 12 | 16 | 22 |

**업그레이드 비용/시간:**

| 단계 | Lv.1→2 | Lv.2→3 | Lv.3→4 | Lv.4→5 | Lv.5 |
|------|--------|--------|--------|--------|------|
| 비용 | 150 | 500 | 1500 | 3000 | 최대 레벨 |
| 시간 | 8s | 9s | 10s | 11s | — |

- 공격 기능 없음. 범위 내 건설 완료(`built: true`) 상태의 건물 HP를 지속 회복한다.
- 자기 자신은 수리 대상에서 제외된다.
- 글로벌 업그레이드 `SELF_REPAIR`와 별개로 중복 적용된다.
- HP가 가장 낮아 보호가 필요하다.

---

### RESOURCE — 자원건물

```
cost: 40      buildTime: 3s
hpMax: 100    armorType: STRUCTURE
color: #c0a020
maxLv: 5
```

**자원 생산 스탯 (RESOURCE_STATS):**

| 항목 | 값 |
|------|----|
| 기본 생산량 (baseAmount) | 15 자원/회 |
| 생산 간격 (interval) | 5초 |

**레벨별 생산량 — 공식: `baseAmount × (1 + (level - 1) × 0.3)`**

| 레벨 | 생산량 (자원/회) | 계산 |
|------|----------------|------|
| Lv.1 | 15 | 15 × 1.0 |
| Lv.2 | 19.5 | 15 × 1.3 |
| Lv.3 | 24 | 15 × 1.6 |
| Lv.4 | 28.5 | 15 × 1.9 |
| Lv.5 | 33 | 15 × 2.2 |

소수점 생산량은 누적되며, 정수 단위로 반올림되지 않고 `G.resource`에 실수 가산 후 표시 시 내림 처리한다.

**업그레이드 비용/시간:**

| 단계 | Lv.1→2 | Lv.2→3 | Lv.3→4 | Lv.4→5 | Lv.5 |
|------|--------|--------|--------|--------|------|
| 비용 | 150 | 500 | 1500 | 3000 | 최대 레벨 |
| 시간 | 8s | 9s | 10s | 11s | — |

- COUNTDOWN 상태에서도 자원을 생산한다 (웨이브 전 준비 시간 활용).
- HP가 낮아 적의 우선 타겟이 될 수 있다. 타워나 성벽으로 보호할 위치에 배치해야 한다.
- Phase 4부터 `b.level` 기반으로 동작. `b.upgraded` 이진 플래그 제거.

**RESOURCE에 영향을 주는 글로벌 업그레이드 — RESOURCE_BOOST:**

레벨당 +3%, Lv.30에서 +90% 생산량 증가.

공식: `amount = Math.round(baseAmount × (1 + rbLv × 0.03))` — 건물 자체 레벨 보너스(`baseAmount`)에 곱연산으로 중첩된다.

---

## 건물 건설/업그레이드 상태 흐름

Phase 4부터 모든 건물이 `b.level` 기반 레벨 업그레이드로 통일되었다. `b.upgraded` 이진 플래그는 전면 제거되었다.

### 모든 건물 공통 — 레벨 기반 업그레이드

`built`, `upgrading`, `level` (1~maxLv) 필드로 상태를 추적한다.

```
배치 직후
  built: false, upgrading: false, level: 1
  buildTimer 카운트다운 중 (반투명 + 녹색 진행 바)
        ↓ buildTimer === 0
  built: true, level: 1
        ↓ startUpgrade() 호출 (level < maxLv일 때만 가능)
  upgrading: true
  upgradeTimer = upgradeTime[level - 1]
  비용 = upgradeCost[level - 1]
        ↓ upgradeTimer === 0
  upgrading: false, level: level + 1
        ↓ (반복, level < maxLv인 동안)
  level === maxLv
  패널에 "최대 레벨" 표시, 업그레이드 버튼 비활성화
```

건물별 maxLv:

| 건물 | maxLv |
|------|-------|
| THORN | 5 |
| SPORE | 5 |
| REPAIR | 5 |
| RESOURCE | 5 |
| NEST | 3 |
| WALL | 10 |

스탯 참조: 배열 인덱스 = `b.level - 1`. 예시: `THORN_STATS.range[b.level - 1]`, `WALL_DEFS.hpPerLevel[b.level - 1]`.

- `upgrading: true` 상태의 건물도 BFS 거리맵에서 경로를 차단한다 (건물 타일은 거리가 기록되지만 BFS 큐에 넣지 않음).

---

## 건물 우하단 레벨 표시

THORN / SPORE / REPAIR / WALL / NEST / RESOURCE 모두 렌더링 시 우하단에 `Lv.N` 텍스트를 표시한다. Phase 4부터 모든 건물이 레벨 기반으로 전환되었으므로 레벨 표시 대상이 전체 건물로 확대되었다.

---

## 철거 환불 규칙

건물 패널의 철거 버튼 클릭 시 자원을 돌려받는다.

| 조건 | 환불 비율 | 계산 예시 (THORN, cost=50) |
|------|-----------|--------------------------|
| 건설 중 (`built: false`) | 100% | 50 자원 |
| 건설 완료 (`built: true`) | 50% | 25 자원 |

NEST는 철거 불가 (철거 버튼이 생성되지 않는다).
