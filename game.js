/* ============================================================
   XenoNest — 메인 게임 스크립트
   Phase 1

   아키텍처 결정:
   - 모든 게임 상태는 단일 `G` 객체에 집중시킨다. 전역 변수 분산 방지.
   - 엔티티(buildings, enemies, projectiles)는 배열로 관리하되,
     ECS 패턴은 이 규모에서 과설계이므로 일반 객체 리터럴을 사용한다.
   - BFS 거리맵은 건물 배치/파괴 때마다 재계산되며, 결과를 G.distanceMap에 캐싱한다.
   - 지형(그리드 선)은 offscreen canvas에 한 번만 그린다.
     건물 배치 시 지형 캐시를 무효화하지 않고 건물을 별도 레이어에 그린다.
   ============================================================ */

'use strict';

// ── 1. 상수 정의 ─────────────────────────────────────────────────────────────
// 매직 넘버를 모두 여기에 모아 유지보수성을 높인다.

const TILE_SIZE  = 48;   // px, 그리드 한 칸의 크기
const COLS       = 20;   // 열 수
const ROWS       = 28;   // 행 수

// 게임 상태 머신 값
const STATE = Object.freeze({
  IDLE:      'IDLE',       // 시작 전 오버레이 표시
  PLACING:   'PLACING',    // 핵심 둥지 배치 대기
  PREP:      'PREP',       // 둥지 건설 중 (5초)
  COUNTDOWN: 'COUNTDOWN',  // 30초 카운트다운 (건설 준비)
  WAVE:      'WAVE',       // 웨이브 진행 중
  GAME_OVER: 'GAME_OVER',  // 게임 오버
});

// 타일 타입
const TILE = Object.freeze({
  EMPTY:      0,  // 건물 배치 가능한 빈 공간
  BLOCKED:    1,  // 배치 불가 (맵 외벽, 장식 등)
  ENTRANCE:   2,  // 적 입구
  NEST:       3,  // 핵심 둥지 (배치 후)
  WALL:       4,  // 성벽 (BFS 통행 불가)
  THORN:      5,  // 가시 촉수 (물리 근거리 공격)
  RESOURCE:   6,  // 자원 건물
  SPORE:      7,  // 산성 포자 (산성 원거리 + 슬로우)
  REPAIR_BLD: 8,  // 구조물 수리 (범위 수리, 공격 없음)
  SPAWN:      9,  // 적 스폰 지점 (맵 가장자리)
  BALLISTA:  10,  // 발리스타 (물리 원거리, ranged 적 우선)
});

// 건물 정의: 비용, 건설 시간, 타일 타입, 업그레이드 정보
// upgradeTime/upgradeCost는 레벨 배열 (인덱스 = 현재 레벨-1)
// upgradeCost 마지막 원소 null = 최대 레벨에서 업그레이드 불가
const BUILDING_DEFS = Object.freeze({
  NEST:     { name: '핵심 둥지',  cost: 100, buildTime: 1.7,  tile: TILE.NEST,     icon: '🟣', color: '#9040c0', hpMax: 500,  armorType: 'STRUCTURE',
              w: 2, h: 2,
              upgradeTime: [15, 20], upgradeCost: [1000, 5000, null],
              hpPerLevel: [500, 700, 950] },
  WALL:     { name: '성벽',       cost: 30,  buildTime: 3,  tile: TILE.WALL,     icon: '🟫', color: '#806040', hpMax: 200,  armorType: 'STRUCTURE',
              upgradeTime: [5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 35, 38, 41, 44, 47, 50, 53, 57, 61, 65, 70, 75],
              upgradeCost: [30, 50, 80, 150, 200, 300, 500, 800, 1300, 2000, 3000, 4500, 6500, 9000, 13000, 18000, 25000, 35000, 50000, 70000, 100000, 140000, 200000, 280000, 400000, 560000, 800000, 1100000, 1600000, null],
              hpPerLevel: [200, 260, 340, 440, 570, 740, 960, 1250, 1625, 2100, 2730, 3550, 4620, 6000, 7800, 10140, 13200, 17160, 22300, 29000, 37700, 49000, 63700, 82800, 107600, 139900, 181800, 236300, 307200, 399400] },
  THORN:    { name: '가시 촉수',  cost: 50,  buildTime: 3,  tile: TILE.THORN,    icon: '❇️', color: '#8B2500', hpMax: 120,  armorType: 'STRUCTURE',
              upgradeTime: [8, 9, 10, 11, 12], upgradeCost: [150, 500, 1500, 3000, null] },
  SPORE:    { name: '산성 포자',  cost: 70,  buildTime: 4,  tile: TILE.SPORE,    icon: '🟢', color: '#806030', hpMax: 100,  armorType: 'STRUCTURE',
              upgradeTime: [10, 11, 12, 13, 14], upgradeCost: [150, 500, 1500, 3000, null] },
  REPAIR:   { name: '구조물 수리',cost: 60,  buildTime: 4,  tile: TILE.REPAIR_BLD,icon: '🔧', color: '#305080', hpMax: 80,   armorType: 'STRUCTURE',
              upgradeTime: [8, 9, 10, 11, 12], upgradeCost: [150, 500, 1500, 3000, null] },
  RESOURCE: { name: '자원건물',   cost: 40,  buildTime: 3,  tile: TILE.RESOURCE, icon: '💎', color: '#c0a020', hpMax: 100,  armorType: 'STRUCTURE',
              upgradeTime: [8, 9, 10, 11], upgradeCost: [150, 500, 1500, 3000, null] },
  BALLISTA: { name: '외골격 가시 타워', cost: 80,  buildTime: 4,  tile: TILE.BALLISTA, icon: '🏹', color: '#704020', hpMax: 90,   armorType: 'STRUCTURE',
              upgradeTime: [9, 10, 11, 12], upgradeCost: [200, 600, 1800, 3500, null] },
});

// 자가 수리 상수
const HEAL_INTERVAL = 10; // 초
const HEAL_AMOUNT   = 8;  // HP

// 핵심 둥지 글로벌 업그레이드 정의 (6종 × 최대 30레벨)
const GLOBAL_UPGRADES = Object.freeze([
  {
    id: 'SELF_REPAIR',
    name: '자가 수리 강화',
    icon: '🔋',
    maxLv: 30,
    cost: [100,118,139,164,194,229,270,319,376,444,523,618,729,860,1015,1197,1413,1667,1967,2321,2739,3232,3814,4501,5311,6267,7395,8726,10297,12150],
    effectDesc: lv => `건물 ${8 + lv * 4}HP/10초 자동 회복`,
  },
  {
    id: 'TOWER_BOOST',
    name: '공격 타워 강화',
    icon: '⚔️',
    maxLv: 30,
    cost: [100,118,139,164,194,229,270,319,376,444,523,618,729,860,1015,1197,1413,1667,1967,2321,2739,3232,3814,4501,5311,6267,7395,8726,10297,12150],
    effectDesc: lv => `모든 공격 타워 공격력 +${lv * 3}%, 발사속도 +${lv * 2}%`,
  },
  {
    id: 'STRUCTURE_DEFENSE',
    name: '구조물 방어력',
    icon: '🛡️',
    maxLv: 30,
    cost: [100,118,139,164,194,229,270,319,376,444,523,618,729,860,1015,1197,1413,1667,1967,2321,2739,3232,3814,4501,5311,6267,7395,8726,10297,12150],
    effectDesc: lv => `모든 구조물 피해 ${(lv * 2).toFixed(0)}% 감소`,
  },
  {
    id: 'RESOURCE_BOOST',
    name: '자원 증폭',
    icon: '💎',
    maxLv: 30,
    cost: [100,118,139,164,194,229,270,319,376,444,523,618,729,860,1015,1197,1413,1667,1967,2321,2739,3232,3814,4501,5311,6267,7395,8726,10297,12150],
    effectDesc: lv => `RESOURCE 생산량 +${lv * 3}%`,
  },
  {
    id: 'STRUCTURE_FORTIFY',
    name: '구조물 체력 강화',
    icon: '🧱',
    maxLv: 30,
    cost: [100,118,139,164,194,229,270,319,376,444,523,618,729,860,1015,1197,1413,1667,1967,2321,2739,3232,3814,4501,5311,6267,7395,8726,10297,12150],
    effectDesc: lv => `모든 구조물 HP 최대치 +${lv * 3}%`,
  },
]);

// 가시 촉수 스탯 (레벨 1~5 배열)
const THORN_STATS = Object.freeze({
  range:      [4.0, 4.2, 4.4, 4.6, 4.8],
  damage:     [18,  26,  35,  45,  58 ],
  fireRate:   [2.0, 2.2, 2.4, 2.6, 3.0],
  projSpeed:  400,  // 2배 속도
  attackType: 'PHYSICAL',
  homing:     true, // 유도 투사체
});

// 산성 포자 스탯 (레벨 1~5 배열)
const SPORE_STATS = Object.freeze({
  range:        [5.0, 5.3, 5.6, 6.0, 6.5],
  damage:       [15,  22,  30,  40,  52 ],
  fireRate:     [0.6, 0.65, 0.7, 0.8, 0.9],
  projSpeed:    140,
  attackType:   'ACID',
  slowAmount:   0.3,
  slowDuration: 3.0,
  splashRadius: 1.2,  // 범위 피해 반경 (타일 단위)
});

// 외골격 가시 타워 스탯 (레벨 1~5 배열) — 물리 원거리, ranged 적 우선 타겟팅
const BALLISTA_STATS = Object.freeze({
  range:      [10.0, 10.5, 11.0, 11.5, 12.0],
  damage:     [55,  80,  110, 145, 190],
  fireRate:   [0.5, 0.55, 0.6, 0.65, 0.75],
  projSpeed:  700,
  attackType: 'PHYSICAL',
});

// 구조물 수리 스탯 (레벨 1~5 배열)
const REPAIR_STATS = Object.freeze({
  range:      [2.0, 2.5, 3.0, 3.5, 4.0],
  healPerSec: [8,   13,  19,  26,  35 ],
});

// 자원건물 스탯
const RESOURCE_STATS = Object.freeze({
  interval:   5,    // 초마다 생산
  amount:     14,   // 기본 생산량
});

// ── 속성 시스템 ──────────────────────────────────────────────────────────────
const ARMOR_TYPE = Object.freeze({
  UNARMORED: 'UNARMORED', PHYSICAL: 'PHYSICAL',
  MAGICAL:   'MAGICAL',   HERO:     'HERO',
  STRUCTURE: 'STRUCTURE',
});

const ATTACK_TYPE = Object.freeze({
  PHYSICAL: 'PHYSICAL', MAGICAL: 'MAGICAL', HERO: 'HERO', ACID: 'ACID',
});

// 피해 배율표: DAMAGE_TABLE[attackType][armorType]
const DAMAGE_TABLE = Object.freeze({
  PHYSICAL: Object.freeze({ UNARMORED:1.3, PHYSICAL:0.7, MAGICAL:1.2, HERO:0.6, STRUCTURE:1.0 }),
  MAGICAL:  Object.freeze({ UNARMORED:1.3, PHYSICAL:1.2, MAGICAL:0.7, HERO:0.6, STRUCTURE:1.0 }),
  HERO:     Object.freeze({ UNARMORED:1.5, PHYSICAL:1.3, MAGICAL:1.3, HERO:1.0, STRUCTURE:1.0 }),
  ACID:     Object.freeze({ UNARMORED:1.2, PHYSICAL:1.1, MAGICAL:0.9, HERO:0.8, STRUCTURE:0.8 }),
});

// ── 적 정의 ─────────────────────────────────────────────────────────────────
const ENEMY_DEFS = Object.freeze({
  CITIZEN: {
    name:'일반 시민', hpMax:30, speed:60, damage:15, reward:5,
    attackDmg:5, attackRate:0.8, radius:8, slotCost:1,
    attackType:'PHYSICAL', armorType:'UNARMORED',
    ranged:false,
    color:'#a0a080', outlineColor:'#606040',
  },
  SCOUT: {
    name:'정찰병', hpMax:60, speed:70, damage:25, reward:10,
    attackDmg:8, attackRate:1.0, radius:10, slotCost:1,
    attackType:'PHYSICAL', armorType:'PHYSICAL',
    ranged:false,
    color:'#c87820', outlineColor:'#7a4410',
  },
  FAST: {
    name:'돌격병', hpMax:54, speed:130, damage:20, reward:15,
    attackDmg:10, attackRate:1.2, radius:12, slotCost:2,
    attackType:'PHYSICAL', armorType:'PHYSICAL',
    ranged:false,
    color:'#e04040', outlineColor:'#901010',
  },
  TANKER: {
    name:'중장갑', hpMax:336, speed:40, damage:60, reward:30,
    attackDmg:35, attackRate:0.6, radius:15, slotCost:2,
    attackType:'PHYSICAL', armorType:'PHYSICAL',
    ranged:false,
    color:'#4060c0', outlineColor:'#203080',
  },
  WARRIOR: {
    name:'전사 모험가', hpMax:749, speed:55, damage:80, reward:60,
    attackDmg:60, attackRate:0.8, radius:14, slotCost:3,
    attackType:'PHYSICAL', armorType:'PHYSICAL',
    ranged:false,
    color:'#d0a030', outlineColor:'#805010',
  },
  MAGE: {
    name:'마법사 모험가', hpMax:406, speed:65, damage:60, reward:50,
    attackDmg:40, attackRate:1.0, radius:11, slotCost:2,
    attackType:'MAGICAL', armorType:'MAGICAL',
    ranged:true, rangedTiles:2.0, projSpeed:150,
    color:'#8040c0', outlineColor:'#401060',
  },
  ARCHER: {
    name:'궁수', hpMax:78, speed:80, damage:20, reward:20,
    attackDmg:15, attackRate:1.2, radius:10, slotCost:1,
    attackType:'PHYSICAL', armorType:'PHYSICAL',
    ranged:true, rangedTiles:2.0, projSpeed:200,
    color:'#60a040', outlineColor:'#305020',
  },
  NOVICE_HERO: {
    name:'초보 용사', hpMax:50000, speed:40, damage:0, reward:0,
    attackDmg:200, attackRate:1.5, radius:20, slotCost:10,
    attackType:'HERO', armorType:'HERO',
    ranged:false,
    color:'#FFD700', outlineColor:'#B8860B',
    skillCooldown:7, aoeRange:3 * 48, aoeDmg:300,
  },
});

// ── 시간 기반 스폰 스케줄 ─────────────────────────────────────────────────
// timeStart: 공격 시작(WAVE 상태 진입) 후 경과 시간(초)
// citizen/scout/fast/tanker/warrior/mage: 한 번에 스폰되는 각 종류 수
// interval: 다음 스폰 배치까지 대기 시간(초)
// 마지막 구간(540s~)이 게임 종료(600s)까지 유지된다.
const SPAWN_SCHEDULE = Object.freeze([
  { timeStart:   0, citizen:2, scout:0,  fast:0, tanker:0, warrior:0, mage:0, archer:0, interval:7.0 },
  { timeStart: 120, citizen:0, scout:4,  fast:0, tanker:0, warrior:0, mage:0, archer:0, interval:6.0 },
  { timeStart: 180, citizen:0, scout:6,  fast:1, tanker:0, warrior:0, mage:0, archer:0, interval:5.5 },
  { timeStart: 240, citizen:0, scout:8,  fast:2, tanker:0, warrior:0, mage:0, archer:0, interval:5.0 },
  { timeStart: 300, citizen:0, scout:10, fast:3, tanker:1, warrior:0, mage:0, archer:0, interval:4.5 },
  { timeStart: 360, citizen:0, scout:12, fast:5, tanker:2, warrior:0, mage:0, archer:0, interval:4.0 },
  { timeStart: 420, citizen:0, scout:14, fast:6, tanker:2, warrior:1, mage:1, archer:1, interval:4.0 },
  { timeStart: 480, citizen:0, scout:15, fast:7, tanker:3, warrior:1, mage:1, archer:2, interval:3.5 },
  { timeStart: 540, citizen:0, scout:15, fast:7, tanker:3, warrior:2, mage:2, archer:2, interval:3.0 },
  { timeStart: 600, citizen:0, scout:12, fast:8, tanker:4, warrior:2, mage:2, archer:3, interval:3.0 },
  { timeStart: 660, citizen:0, scout:10, fast:9, tanker:4, warrior:3, mage:3, archer:3, interval:2.8 },
  { timeStart: 720, citizen:0, scout:7,  fast:10, tanker:5, warrior:3, mage:3, archer:4, interval:2.5 },
  { timeStart: 780, citizen:0, scout:5,  fast:11, tanker:6, warrior:4, mage:4, archer:5, interval:2.3 },
  { timeStart: 840, citizen:0, scout:3,  fast:12, tanker:7, warrior:5, mage:5, archer:6, interval:2.0 },
]);

// 게임 전체 제한 시간
const GAME_DURATION      = 900; // 초 (15분)

// 성벽 1개당 최대 공격 용량 (SCOUT 크기 기준 5칸)
// SCOUT(slotCost=1)→최대 5마리, FAST/TANKER(slotCost=2)→최대 2마리
// 용량 초과 적은 성벽 앞에서 대기, 빈 공간이 생기면 자동 합류
const WALL_MAX_CAPACITY = 5;

// 등급별 동시 생존 최대 개체 수
// 한도 초과분은 pendingSpawn에 보류되어 다음 배치 타이밍에 재시도한다.
const ENEMY_CAP = Object.freeze({
  CITIZEN:80, SCOUT:100, FAST:50, TANKER:30, WARRIOR:10, MAGE:10, ARCHER:40, NOVICE_HERO:1
});

// 게임 타이밍
const COUNTDOWN_DURATION = 20;  // 초
// NEST_BUILD_TIME는 BUILDING_DEFS.NEST.buildTime으로 관리한다 (5초)
const DT_MAX             = 0.1; // 초, 탭 전환 후 큰 dt 클램핑

// 핵심 둥지 배치 가능 영역 — COLS=20 기준 중심(col 9~10), 상단부(row 3~4)
const NEST_ZONE = Object.freeze({ colMin: 9, colMax: 10, rowMin: 2, rowMax: 3 });

// NEST 레벨별 최대 건물 배치 수 (NEST 제외)
const NEST_BUILD_CAP = Object.freeze([10, 20, 40]); // Lv.1=10, Lv.2=20, Lv.3=40

// NEST 자원 생산
const NEST_RESOURCE_INTERVAL = 8;  // 초마다 생산
const NEST_RESOURCE_AMOUNT = Object.freeze([5, 10, 20]); // Lv.1=5, Lv.2=10, Lv.3=20

// 기지 입구 좌표 — WALL 제거 시 ENTRANCE 복원용 (COLS=20 기준 중심 col 9~10)
const BASE_ENTRANCE = Object.freeze([{ col: 9, row: 17 }, { col: 10, row: 17 }]);

// 초기 자원
const INITIAL_RESOURCE = 200;

// 적 스폰 지점 — 4방향 (우측, 우하, 좌하, 좌측)
const ENTRANCES = Object.freeze([
  // 3시 (우측)
  { col: COLS - 2, row: Math.floor(ROWS / 2) },
  { col: COLS - 2, row: Math.floor(ROWS / 2) + 1 },
  // 5시 (우하)
  { col: Math.floor(COLS * 0.7), row: ROWS - 2 },
  { col: Math.floor(COLS * 0.7) + 1, row: ROWS - 2 },
  // 7시 (좌하)
  { col: Math.floor(COLS * 0.3), row: ROWS - 2 },
  { col: Math.floor(COLS * 0.3) - 1, row: ROWS - 2 },
  // 9시 (좌측)
  { col: 1, row: Math.floor(ROWS / 2) },
  { col: 1, row: Math.floor(ROWS / 2) + 1 },
]);


// ── 2. 그리드 좌표 ↔ 픽셀 좌표 변환 ─────────────────────────────────────────
// 이 두 함수를 통해서만 좌표 변환을 수행한다. 분산 방지.

/** 그리드 (col, row) → 타일 중심 픽셀 좌표 */
function tileToPixel(col, row) {
  return {
    x: col * TILE_SIZE + TILE_SIZE / 2,
    y: row * TILE_SIZE + TILE_SIZE / 2,
  };
}

/** 픽셀 좌표 → 그리드 (col, row) */
function pixelToTile(px, py) {
  return {
    col: Math.floor(px / TILE_SIZE),
    row: Math.floor(py / TILE_SIZE),
  };
}

/** 건물 중심 픽셀 좌표 (w×h 크기 건물 대응) */
function getBuildingCenter(b) {
  const w = b.w || 1, h = b.h || 1;
  return {
    x: (b.col + w / 2) * TILE_SIZE,
    y: (b.row + h / 2) * TILE_SIZE,
  };
}

/** 통과 불가 타일 판정 — BLOCKED 또는 건물 타일이면 true */
function isSolidTile(tile) {
  return tile === TILE.BLOCKED || tile === TILE.WALL || tile === TILE.THORN
      || tile === TILE.SPORE || tile === TILE.REPAIR_BLD || tile === TILE.RESOURCE
      || tile === TILE.NEST  || tile === TILE.BALLISTA;
}

/** 9지점 고체 타일 충돌 검사 — 적 이동 및 분리 양쪽에서 사용 */
function hitsSolidTile(px, py, rad) {
  const offsets = [
    [0,0], [-rad,0], [rad,0], [0,-rad], [0,rad],
    [-rad,-rad], [rad,-rad], [-rad,rad], [rad,rad],
  ];
  for (const [ox, oy] of offsets) {
    const c = Math.floor((px + ox) / TILE_SIZE);
    const r = Math.floor((py + oy) / TILE_SIZE);
    if (c >= 0 && c < COLS && r >= 0 && r < ROWS && isSolidTile(G.grid[r][c])) return true;
  }
  return false;
}

/** 9지점 BLOCKED 충돌 검사 — 이동 전용 (건물 타일은 통과 허용, 인접 건물 공격을 위해) */
function hitsBlockedTile(px, py, rad) {
  const offsets = [
    [0,0], [-rad,0], [rad,0], [0,-rad], [0,rad],
    [-rad,-rad], [rad,-rad], [-rad,rad], [rad,rad],
  ];
  for (const [ox, oy] of offsets) {
    const c = Math.floor((px + ox) / TILE_SIZE);
    const r = Math.floor((py + oy) / TILE_SIZE);
    if (c >= 0 && c < COLS && r >= 0 && r < ROWS && G.grid[r][c] === TILE.BLOCKED) return true;
  }
  return false;
}


// ── 3. 맵 초기화 ─────────────────────────────────────────────────────────────

/**
 * 30×24 그리드 생성.
 * 중앙에 불규칙 외벽으로 둘러싸인 내부 기지 (~120타일 건설 공간)
 * 기지 하단 중앙: 2타일 폭 입구 (WALL로 봉쇄 가능)
 * 외벽은 모든 벽 타일이 상하좌우(4방향)로 연결되도록 설계 — 대각선만 연결되는 틈 제거
 */
function createGrid() {
  const grid = Array.from({length: ROWS}, () => Array(COLS).fill(TILE.EMPTY));

  // 맵 최외곽 벽
  for (let c = 0; c < COLS; c++) { grid[0][c] = TILE.BLOCKED; grid[ROWS - 1][c] = TILE.BLOCKED; }
  for (let r = 0; r < ROWS; r++) { grid[r][0] = TILE.BLOCKED; grid[r][COLS - 1] = TILE.BLOCKED; }

  // 내부 기지 외벽 — 행별 좌측/우측 경계 정의 (COLS=20 기준, 중심 col 9~10)
  // 규칙: 인접 행 간 열 번호 차이 ≤ 2, 차이 발생 시 중간 타일도 채움
  // 입구: row 18, col 9~10 (하단 중앙)
  // row 19~27은 적 진입로 — 기지 외벽 없음
  const wallProfile = [
    // [row, leftCol, rightCol]
    [1,  7, 12],
    [2,  5, 14],
    [3,  4, 15],
    [4,  3, 16],
    [5,  3, 16],
    [6,  3, 16],
    [7,  3, 16],
    [8,  3, 16],
    [9,  3, 16],
    [10, 3, 16],
    [11, 3, 16],
    [12, 3, 16],
    [13, 4, 15],
    [14, 5, 14],
    [15, 6, 13],
    [16, 7, 12],
    [17, 8, 11],  // 입구 row — col 9,10은 ENTRANCE
  ];

  for (let i = 0; i < wallProfile.length; i++) {
    const [row, left, right] = wallProfile[i];
    // 좌벽
    grid[row][left] = TILE.BLOCKED;
    // 우벽
    grid[row][right] = TILE.BLOCKED;

    // 행 간 열 차이 보정 — 대각선 틈 방지
    // 벽이 바깥으로 확장(left 감소 / right 증가)하면 이전 행을 채워야 내부가 보존된다.
    // 벽이 안으로 수렴(left 증가 / right 감소)하면 현재 행을 채워야 틈이 막힌다.
    if (i > 0) {
      const [prevRow, prevLeft, prevRight] = wallProfile[i - 1];
      // 좌벽
      if (left < prevLeft) {
        // 확장: 이전 행에 채움
        for (let c = left; c < prevLeft; c++) grid[prevRow][c] = TILE.BLOCKED;
      } else if (left > prevLeft) {
        // 수렴: 현재 행에 채움
        for (let c = prevLeft; c <= left; c++) grid[row][c] = TILE.BLOCKED;
      }
      // 우벽
      if (right > prevRight) {
        // 확장: 이전 행에 채움
        for (let c = prevRight + 1; c <= right; c++) grid[prevRow][c] = TILE.BLOCKED;
      } else if (right < prevRight) {
        // 수렴: 현재 행에 채움
        for (let c = right; c <= prevRight; c++) grid[row][c] = TILE.BLOCKED;
      }
    }
  }

  // 상단 수평벽: row 1 (col 7~12) — wallProfile row 1이 좌우벽이므로 사이 채움
  for (let c = 7; c <= 12; c++) grid[1][c] = TILE.BLOCKED;
  // row 17 하단벽 (입구 col 9,10 제외) — wallProfile 루프에서 left=8, right=11은 이미 채워지나
  // ENTRANCE 덮어쓰기를 방지하기 위해 명시적으로 재확인
  grid[17][8]  = TILE.BLOCKED;
  grid[17][11] = TILE.BLOCKED;

  // 기지 입구 — 2타일 폭 (WALL 2개로 봉쇄 가능)
  grid[17][9]  = TILE.ENTRANCE;
  grid[17][10] = TILE.ENTRANCE;

  // 적 스폰 지점 — SPAWN 타일로 표시 (ENTRANCE와 별개)
  for (const e of ENTRANCES) {
    grid[e.row][e.col] = TILE.SPAWN;
  }

  return grid;
}


// ── 4. BFS 거리맵 길찾기 ─────────────────────────────────────────────────────
// NEST 타일을 시작점으로 multi-source BFS를 수행하여 거리맵을 생성한다.
// 적은 거리맵의 경사를 따라 NEST 방향으로 이동하며, 경로 상 건물을 자동 탐지한다.

/**
 * NEST 타일부터 BFS를 수행하여 각 타일까지의 거리(타일 단위)를 계산한다.
 * BLOCKED만 통행 불가. 건물 타일 포함 나머지는 모두 전파한다.
 * 적은 거리맵을 따라 이동하되, 건물 타일에 도달하면 해당 건물을 공격한다.
 */
function computeDistanceMap() {
  const dm = Array.from({length: ROWS}, () => new Float32Array(COLS).fill(Infinity));
  const queue = [];

  // NEST 타일들을 시작점으로 (multi-source BFS)
  if (G.nestBuilding && G.nestBuilding.built) {
    const nb = G.nestBuilding;
    const w = nb.w || 1, h = nb.h || 1;
    for (let dr = 0; dr < h; dr++) {
      for (let dc = 0; dc < w; dc++) {
        dm[nb.row + dr][nb.col + dc] = 0;
        queue.push([nb.col + dc, nb.row + dr]);
      }
    }
  }

  // BFS — 4방향
  let head = 0;
  while (head < queue.length) {
    const [cc, cr] = queue[head++];
    const nd = dm[cr][cc] + 1;
    for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nc = cc + dc, nr = cr + dr;
      if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
      if (dm[nr][nc] <= nd) continue;
      const tile = G.grid[nr][nc];
      if (tile === TILE.BLOCKED) continue;
      dm[nr][nc] = nd;
      queue.push([nc, nr]);
    }
  }

  G.distanceMap = dm;
  G.distanceMapDirty = false;
}

/**
 * 이동 헬퍼 — 슬로우 적용, BLOCKED 충돌(hitsBlockedTile), 축별 슬라이딩 포함.
 */
function moveToward(e, tx, ty, dt) {
  const dx = tx - e.x;
  const dy = ty - e.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return;

  const speedMultiplier = (e.slowedTimer > 0) ? (1 - e.slowAmount) : 1;
  const speedPx = e.speed * dt * speedMultiplier;
  const moveX = (dx / dist) * speedPx;
  const moveY = (dy / dist) * speedPx;
  const oldX = e.x;
  const oldY = e.y;

  e.x += moveX;
  e.y += moveY;
  if (hitsBlockedTile(e.x, e.y, e.radius)) {
    e.x = oldX;
    e.y = oldY;
    // X축만 이동
    e.x += moveX;
    if (hitsBlockedTile(e.x, e.y, e.radius)) {
      e.x = oldX;
    }
    // Y축만 이동
    e.y += moveY;
    if (hitsBlockedTile(e.x, e.y, e.radius)) {
      e.y = oldY;
    }
  }
}


// ── 5. 게임 상태(G) 초기화 ───────────────────────────────────────────────────

let G = {}; // 게임 상태 단일 진실 공급원

function initGame() {
  G = {
    state:        STATE.IDLE,
    grid:         createGrid(),
    buildings:    [],   // { id, type, col, row, hp, hpMax, buildTimer, built, upgrading, upgradeTimer, level, ... }
    enemies:      [],   // { id, type, x, y, hp, hpMax, speed, targetBldId, ... }
    projectiles:  [],   // { id, x, y, vx, vy, damage, targetId }
    resource:      INITIAL_RESOURCE,
    gameTimer:     0,    // WAVE 상태 진입 후 경과 시간(초) — 스폰 스케줄 기준
    spawnTimer:    0,    // 다음 스폰 배치까지 남은 시간(초)
    scheduleIdx:   0,    // 현재 적용 중인 SPAWN_SCHEDULE 인덱스
    pendingSpawn:  { CITIZEN: 0, SCOUT: 0, FAST: 0, TANKER: 0, WARRIOR: 0, MAGE: 0, ARCHER: 0, NOVICE_HERO: 0 }, // 캡 초과로 보류된 스폰 수
    enemyProjectiles: [], // 적(원거리)이 발사한 투사체
    countdown:     COUNTDOWN_DURATION,
    nestTile:     null, // { col, row } — 핵심 둥지 위치
    nestBuilding: null, // 핵심 둥지 building 객체 참조
    distanceMap:     null,  // BFS 거리맵 (Float32Array[][])
    distanceMapDirty: true, // 건물 변경 시 true로 설정 → update 시작 시 재계산
    floatingTexts:   [],    // 피해량 플로팅 텍스트 { x, y, text, color, life, maxLife }
    selectedBuild:      null, // 현재 선택된 건물 타입 키 (배치 모드)
    selectedBuildingId: null, // 현재 정보 패널에 열려 있는 건물 id
    nextId:       1,    // 엔티티 고유 ID 생성용
    towerTimers:          {},  // towerId → 다음 발사까지 남은 시간
    resourceTimers:       {},  // resourceBuildingId → 다음 생산까지 남은 시간
    repairBuildingTimers: {},  // repairBuildingId → (미사용, 예약) 타이머
    statusTimer:  0,    // 상태 메시지 표시 타이머
    repairTimer:  0,
    globalUpgrades: {
      SELF_REPAIR:       0,
      TOWER_BOOST:       0,
      STRUCTURE_DEFENSE: 0,
      RESOURCE_BOOST:    0,
      STRUCTURE_FORTIFY: 0,
    },
    gameSpeed:     1,
    bossSpawned:   false,
    bossDefeated:  false,
    aoeFlashes:    [],
    paused:        false,
    adBuff:        { active: false, timer: 0, cooldown: 0 },
    _nestPopupOpen: false,
    _radialOpen:   false,
    _radialCol:    0,
    _radialRow:    0,
    _lastClientX:  0,
    _lastClientY:  0,
    prevTime:      null,
    // 카메라 초기 위치: zoom=1.0에서 맵 전체(960×1344)가 논리 캔버스와 일치하므로 (0,0) 고정
    camera: {
      x: 0,
      y: 0,
      zoom: 1.0
    },
    drag:   { active: false, startX: 0, startY: 0, camStartX: 0, camStartY: 0, moved: false },
  };
}


// ── 6. 건물 생성/제거 헬퍼 ───────────────────────────────────────────────────

function createBuilding(type, col, row) {
  const def = BUILDING_DEFS[type];
  const id  = G.nextId++;
  const building = {
    id,
    type,
    col,
    row,
    w:            def.w || 1,
    h:            def.h || 1,
    hp:           def.hpMax,
    hpMax:        def.hpMax,
    buildTimer:   def.buildTime, // 건설 중 남은 시간 (0이 되면 완료)
    built:        false,
    upgrading:    false,
    upgradeTimer: 0,
    level:        1,             // 건물 레벨 (1~5), THORN/SPORE/REPAIR에서 스탯 배열 인덱스로 사용
    color:        def.color,
    armorType:    def.armorType, // 피해 배율 계산에 사용
  };
  G.buildings.push(building);

  // 타일 설정 — 다중 타일 건물(NEST 2×2) 대응
  const bw = building.w, bh = building.h;
  for (let dr = 0; dr < bh; dr++) {
    for (let dc = 0; dc < bw; dc++) {
      G.grid[row + dr][col + dc] = def.tile;
    }
  }

  if (type === 'NEST') {
    G.nestTile    = { col, row };
    G.nestBuilding = building;
  }
  if (type === 'WALL') {
    // 현재 공격 중인 적 ID 목록. 용량 계산에 사용한다.
    building.attackers = [];
  }
  // STRUCTURE_FORTIFY 보너스를 신규 건물에 즉시 반영
  {
    const fortifyLv = G.globalUpgrades ? G.globalUpgrades.STRUCTURE_FORTIFY : 0;
    if (fortifyLv > 0) {
      const baseHpMax = def.hpPerLevel ? def.hpPerLevel[0] : def.hpMax;
      const newHpMax  = Math.round(baseHpMax * (1 + fortifyLv * 0.03));
      building.hp     = newHpMax;
      building.hpMax  = newHpMax;
    }
  }
  if (type === 'THORN' || type === 'SPORE' || type === 'BALLISTA') {
    G.towerTimers[id] = 0;
  }
  if (type === 'REPAIR') {
    G.repairBuildingTimers[id] = 0;
  }
  if (type === 'RESOURCE') {
    G.resourceTimers[id] = RESOURCE_STATS.interval;
  }

  // 스폰 직후 기존 적과 겹침 해소: 8방향 오프셋 시도 (건물 스폰이 아니므로 적에 해당 없음)
  dirtyTerrain(); // 지형 캐시 무효화
  G.distanceMapDirty = true; // BFS 거리맵 재계산 필요
  return building;
}

function removeBuilding(building) {
  G.buildings = G.buildings.filter(b => b.id !== building.id);

  // 타일 복원 — 다중 타일 건물(NEST 2×2) 대응
  const bw = building.w || 1, bh = building.h || 1;
  for (let dr = 0; dr < bh; dr++) {
    for (let dc = 0; dc < bw; dc++) {
      const c = building.col + dc, r = building.row + dr;
      // 입구 위치에 WALL이 있었다면 ENTRANCE로 복원
      const isEntrance = BASE_ENTRANCE.some(e => e.col === c && e.row === r);
      G.grid[r][c] = isEntrance ? TILE.ENTRANCE : TILE.EMPTY;
    }
  }

  if (building.type === 'NEST') {
    G.nestTile    = null;
    G.nestBuilding = null;
  }
  if (building.type === 'THORN' || building.type === 'SPORE' || building.type === 'BALLISTA') {
    delete G.towerTimers[building.id];
  }
  if (building.type === 'REPAIR') {
    delete G.repairBuildingTimers[building.id];
  }
  delete G.resourceTimers[building.id];

  // 이 건물을 타겟으로 삼던 적 즉시 재타겟팅
  for (const e of G.enemies) {
    if (e.targetBldId === building.id) {
      e.targetBldId = null;
    }
  }

  // 건물 정보 패널이 열려 있던 건물이면 닫는다
  if (G.selectedBuildingId === building.id) {
    closeBuildingPanel();
  }

  dirtyTerrain();
  G.distanceMapDirty = true; // BFS 거리맵 재계산 필요
}

/**
 * STRUCTURE_FORTIFY 업그레이드 구매 시 기존 모든 구조물의 hpMax를 재계산한다.
 * HP 비율을 유지하여 업그레이드가 즉각적으로 반영된다.
 */
function recalcStructureHp() {
  const fortifyLv = G.globalUpgrades.STRUCTURE_FORTIFY;
  for (const b of G.buildings) {
    if (!b.built) continue;
    const def = BUILDING_DEFS[b.type];
    let baseHpMax;
    if (def.hpPerLevel) {
      baseHpMax = def.hpPerLevel[b.level - 1];
    } else if (b.level <= 1) {
      baseHpMax = def.hpMax;
    } else {
      baseHpMax = Math.round(def.hpMax * (1 + b.level * 0.15));
    }
    const newHpMax = Math.round(baseHpMax * (1 + fortifyLv * 0.03));
    const ratio    = b.hpMax > 0 ? b.hp / b.hpMax : 1;
    b.hpMax = newHpMax;
    b.hp    = Math.min(b.hpMax, Math.round(b.hpMax * ratio));
  }
}

/**
 * 건물 업그레이드 시작.
 * 모든 건물(THORN/SPORE/REPAIR/WALL/NEST/RESOURCE)이 레벨 배열 기반으로 동작한다.
 * 최대 레벨: WALL=10, NEST=3, 나머지=5
 */
function startUpgrade(building) {
  const def = BUILDING_DEFS[building.type];
  if (!building.built || building.upgrading) return false;

  const LEVEL_BASED = ['THORN', 'SPORE', 'REPAIR', 'WALL', 'NEST', 'RESOURCE', 'BALLISTA'];
  if (!LEVEL_BASED.includes(building.type)) return false;

  // 건물 유형별 최대 레벨
  const maxLv = building.type === 'WALL' ? 30 : building.type === 'NEST' ? 3 : 5;

  if (building.level >= maxLv) { showStatus('최대 레벨입니다'); return false; }

  const cost = def.upgradeCost[building.level - 1];
  if (cost === null) { showStatus('최대 레벨입니다'); return false; }
  if (G.resource < cost) { showStatus('자원 부족'); return false; }

  G.resource -= cost;
  building.upgrading    = true;
  building.upgradeTimer = def.upgradeTime[building.level - 1];
  dirtyTerrain();
  updateHUD();
  return true;
}


// 타워 일괄 진화: 선택한 건물과 동일 타입·레벨의 건물을 자원이 허용하는 만큼 업그레이드
function calcBatchUpgrade(selectedBuilding) {
  const { type, level } = selectedBuilding;
  const def = BUILDING_DEFS[type];
  if (!def || !def.upgradeCost) return { count: 0, totalCost: 0, targets: [] };
  const maxLv = type === 'WALL' ? 30 : 5;
  if (level >= maxLv) return { count: 0, totalCost: 0, targets: [] };
  const costPerUnit = def.upgradeCost[level - 1];
  if (costPerUnit == null) return { count: 0, totalCost: 0, targets: [] };

  const targets = G.buildings.filter(b =>
    b.type === type && b.built && !b.upgrading && b.level === level
  );
  const affordable = Math.floor(G.resource / costPerUnit);
  const count = Math.min(targets.length, affordable);
  return { count, totalCost: count * costPerUnit, targets };
}

function execBatchUpgrade(selectedBuilding) {
  const info = calcBatchUpgrade(selectedBuilding);
  if (info.count === 0) return 0;
  const costPerUnit = BUILDING_DEFS[selectedBuilding.type].upgradeCost[selectedBuilding.level - 1];
  let upgraded = 0;
  for (const b of info.targets) {
    if (G.resource < costPerUnit) break;
    if (startUpgrade(b)) upgraded++;
  }
  return upgraded;
}

// ── 7. 적 생성 헬퍼 ──────────────────────────────────────────────────────────

// 위협 단계 8 이후 모든 적 체력/공격력 단계당 +10% 증가
function getEnemyScalePercent() {
  const stagesAbove = Math.max(0, G.scheduleIdx - 6); // 인덱스 7(8단계) 진입 시 즉시 +10%
  return stagesAbove * 10; // 퍼센트
}
function scaleEnemyStat(base) {
  return Math.round(base * (1 + getEnemyScalePercent() / 100));
}

function spawnEnemy(type, entranceIndex) {
  const def    = ENEMY_DEFS[type];
  const idx    = entranceIndex % ENTRANCES.length;
  const ent    = ENTRANCES[idx];
  const px     = tileToPixel(ent.col, ent.row);
  const id     = G.nextId++;

  // 스폰 위치 겹침 해소: 기존 적과 겹치면 8방향 오프셋 시도
  let spawnX = px.x;
  let spawnY = px.y;
  const living = G.enemies.filter(e => !e.dead);
  const isOverlap = (x, y) => living.some(e => Math.hypot(e.x - x, e.y - y) < e.radius + def.radius + 1);

  if (isOverlap(spawnX, spawnY)) {
    const offsets = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [1, 1], [-1, 1], [1, -1], [-1, -1],
    ];
    const step = def.radius * 2 + 2;
    let resolved = false;
    for (const [ox, oy] of offsets) {
      const nx = spawnX + ox * step;
      const ny = spawnY + oy * step;
      if (!isOverlap(nx, ny)) {
        spawnX = nx;
        spawnY = ny;
        resolved = true;
        break;
      }
    }
    // 해소 실패해도 그냥 스폰 (스폰 막지 않음)
  }

  const enemy = {
    id,
    type,
    x:           spawnX,
    y:           spawnY,
    hp:          scaleEnemyStat(def.hpMax),
    hpMax:       scaleEnemyStat(def.hpMax),
    speed:       def.speed,
    damage:      def.damage,
    reward:      def.reward,
    attackDmg:   scaleEnemyStat(def.attackDmg),
    attackRate:  def.attackRate,
    attackTimer: 0,
    targetBldId: null, // 현재 공격 중인 건물 id (직선 추적 시 갱신됨)
    radius:      def.radius,
    color:       def.color,
    outlineColor:def.outlineColor,
    dead:        false,
    attackType:  def.attackType,
    armorType:   def.armorType,
    ranged:      def.ranged || false,
    rangedTiles: def.rangedTiles || 0,
    slowedTimer: 0,  // 슬로우 남은 시간(초) — SPORE 산성 디버프
    slowAmount:  0,  // 슬로우 비율 (0~1)
    stuckTimer:  0,  // 끼임 감지 누적 시간(초)
    stuckLastX:  spawnX,
    stuckLastY:  spawnY,
  };

  // NOVICE_HERO: 스킬 타이머 초기화 (10초 후 첫 AoE 발동)
  if (type === 'NOVICE_HERO') {
    enemy.skillTimer = 10;
  }

  G.enemies.push(enemy);
}


// ── 8. Canvas & 오프스크린 캐시 설정 ────────────────────────────────────────

const canvas  = document.getElementById('game-canvas');
const ctx     = canvas.getContext('2d');

// 오프스크린 캔버스: 지형(그리드 선 + 타일 배경)을 캐싱한다.
// 건물 배치가 일어날 때만 재드로우하여 성능을 아낀다.
const terrainCanvas  = document.createElement('canvas');
const terrainCtx     = terrainCanvas.getContext('2d');
let   terrainDirty   = true;

function dirtyTerrain() {
  terrainDirty = true;
}

/**
 * 카메라 위치를 월드 경계 안으로 클램핑한다.
 * 맵이 뷰포트보다 작을 경우 중앙 고정, 클 경우 경계 클램핑.
 */
function clampCamera() {
  const worldW = COLS * TILE_SIZE;
  const worldH = ROWS * TILE_SIZE;
  const vpW = canvas.width  / G.camera.zoom;
  const vpH = canvas.height / G.camera.zoom;
  G.camera.x = worldW > vpW
    ? Math.max(0, Math.min(worldW - vpW, G.camera.x))
    : -(vpW - worldW) / 2;
  G.camera.y = worldH > vpH
    ? Math.max(0, Math.min(worldH - vpH, G.camera.y))
    : -(vpH - worldH) / 2;
}

/**
 * 캔버스 크기를 뷰포트에 맞게 조정한다.
 * 게임 그리드 비율을 유지하면서 가능한 크게 표시.
 * 상단 HUD (40px) + 하단 패널 (72px) 높이를 제외한다.
 */
const HUD_TOP_H    = 40;
const BUILD_PANEL_H = 0; // build-panel 숨김 상태이므로 높이 0

function resizeCanvas() {
  // HUD 실제 높이를 동적으로 읽는다 — portrait에서 2줄 배치 시 높이가 달라진다
  const hudH = document.getElementById('hud-top').offsetHeight || HUD_TOP_H;

  // portrait에서 하단 버튼(트리거바/일시정지/광고버튼) 영역 72px 추가 확보
  const isPortrait = window.innerHeight > window.innerWidth;
  const bottomUI  = isPortrait ? 72 : 0;

  const availW = window.innerWidth;
  const availH = window.innerHeight - hudH - BUILD_PANEL_H - bottomUI;

  // 그리드 전체 픽셀 크기
  const gridW = COLS * TILE_SIZE;
  const gridH = ROWS * TILE_SIZE;

  const scale = Math.min(availW / gridW, availH / gridH, 1.0); // 최대 1.0 (확대 없음)

  const displayW = Math.floor(gridW * scale);
  const displayH = Math.floor(gridH * scale);

  canvas.width  = gridW;
  canvas.height = gridH;
  canvas.style.width  = displayW + 'px';
  canvas.style.height = displayH + 'px';
  // canvas 위치: HUD 실제 높이 아래에 배치
  canvas.style.marginTop = hudH + 'px';

  terrainCanvas.width  = gridW;
  terrainCanvas.height = gridH;

  // 화면 비율이 변하면 터치 좌표 보정을 위해 scale 저장
  G.canvasScale = scale;

  dirtyTerrain();
}


// ── 9. 터치/클릭 입력 처리 ───────────────────────────────────────────────────
// getBoundingClientRect()로 실제 화면상의 캔버스 위치와 크기를 얻어
// 클릭 좌표를 논리 캔버스 좌표로 변환한다.

function getCanvasPos(clientX, clientY) {
  const rect   = canvas.getBoundingClientRect();
  const scaleX = canvas.width  / rect.width;
  const scaleY = canvas.height / rect.height;
  const canvasX = (clientX - rect.left) * scaleX;
  const canvasY = (clientY - rect.top)  * scaleY;
  // 카메라 역변환: 화면 좌표 → 월드 좌표
  return {
    x: canvasX / G.camera.zoom + G.camera.x,
    y: canvasY / G.camera.zoom + G.camera.y,
  };
}

function handleTileClick(clientX, clientY) {
  const pos  = getCanvasPos(clientX, clientY);
  const tile = pixelToTile(pos.x, pos.y);

  if (tile.col < 0 || tile.col >= COLS || tile.row < 0 || tile.row >= ROWS) return;

  // radial menu용 화면 좌표 저장
  G._lastClientX = clientX;
  G._lastClientY = clientY;

  onTileClicked(tile.col, tile.row);
}

// ── 마우스 드래그 입력 ─────────────────────────────────────────────────────────
// click 대신 mousedown/mousemove/mouseup 트리오로 처리한다.
// 5px 미만 이동은 클릭으로 간주해 handleTileClick을 호출한다.

canvas.addEventListener('mousedown', e => {
  e.preventDefault();
  G.drag = { active: true, startX: e.clientX, startY: e.clientY,
             camStartX: G.camera.x, camStartY: G.camera.y, moved: false };
});

canvas.addEventListener('mousemove', e => {
  if (!G.drag.active) return;
  if (G._radialOpen || G._nestPopupOpen || G.selectedBuildingId !== null) return;
  const dx = e.clientX - G.drag.startX;
  const dy = e.clientY - G.drag.startY;
  if (Math.hypot(dx, dy) > 5) {
    G.drag.moved = true;
    const rect   = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    G.camera.x = G.drag.camStartX - dx * scaleX / G.camera.zoom;
    G.camera.y = G.drag.camStartY - dy * scaleY / G.camera.zoom;
    clampCamera();
  }
});

canvas.addEventListener('mouseup', e => {
  e.preventDefault();
  if (!G.drag.moved) {
    handleTileClick(e.clientX, e.clientY);
  }
  G.drag.active = false;
  G.drag.moved  = false;
});

// ── 터치 드래그 입력 ───────────────────────────────────────────────────────────

canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  const t = e.touches[0];
  G.drag = { active: true, startX: t.clientX, startY: t.clientY,
             camStartX: G.camera.x, camStartY: G.camera.y, moved: false };
}, { passive: false });

canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  if (!G.drag.active) return;
  if (G._radialOpen || G._nestPopupOpen || G.selectedBuildingId !== null) return;
  const t  = e.touches[0];
  const dx = t.clientX - G.drag.startX;
  const dy = t.clientY - G.drag.startY;
  if (Math.hypot(dx, dy) > 5) {
    G.drag.moved = true;
    const rect   = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    G.camera.x = G.drag.camStartX - dx * scaleX / G.camera.zoom;
    G.camera.y = G.drag.camStartY - dy * scaleY / G.camera.zoom;
    clampCamera();
  }
}, { passive: false });

canvas.addEventListener('touchend', e => {
  e.preventDefault();
  if (!G.drag.moved && e.changedTouches.length > 0) {
    const t = e.changedTouches[0];
    handleTileClick(t.clientX, t.clientY);
  }
  G.drag.active = false;
  G.drag.moved  = false;
}, { passive: false });


// ── 줌 버튼 ──────────────────────────────────────────────────────────────────

document.getElementById('zoom-in').addEventListener('click', () => {
  G.camera.zoom = Math.min(2.0, +(G.camera.zoom + 0.25).toFixed(2));
  clampCamera();
  dirtyTerrain();
});

document.getElementById('zoom-out').addEventListener('click', () => {
  G.camera.zoom = Math.max(0.5, +(G.camera.zoom - 0.25).toFixed(2));
  clampCamera();
  dirtyTerrain();
});

// ── 2배속 버튼 ───────────────────────────────────────────────────────────

const speedBtn = document.getElementById('speed-btn');

speedBtn.addEventListener('click', () => {
  // GAME_OVER, IDLE, PLACING 상태에서는 무시
  if (G.state === STATE.GAME_OVER || G.state === STATE.IDLE || G.state === STATE.PLACING) return;
  G.gameSpeed = G.gameSpeed === 1 ? 2 : 1;
  const is2x = G.gameSpeed === 2;
  speedBtn.textContent = is2x ? '2x' : '1x';
  speedBtn.classList.toggle('active', is2x);
});


// ── 10. 타일 클릭 로직 ───────────────────────────────────────────────────────

function onTileClicked(col, row) {
  if (G.state === STATE.IDLE || G.state === STATE.GAME_OVER) return;

  const currentTile = G.grid[row][col];
  const sel = G.selectedBuild;

  // PLACING: 핵심 둥지 배치 대기 중 — 보라색 타일 아무 곳이나 터치 시 좌상단(14,3)에 자동 배치
  if (G.state === STATE.PLACING) {
    if (sel !== 'NEST') return;
    // 보라색 영역(NEST_ZONE) 안이면 자동으로 좌상단 고정 좌표에 배치
    if (!(col >= NEST_ZONE.colMin && col <= NEST_ZONE.colMax
       && row >= NEST_ZONE.rowMin && row <= NEST_ZONE.rowMax)) {
      showStatus('보라색 타일을 터치하여 둥지를 배치하세요');
      return;
    }
    // 고정 배치 좌표: NEST_ZONE 좌상단
    const placeCol = NEST_ZONE.colMin;
    const placeRow = NEST_ZONE.rowMin;
    // NEST 2×2: 4타일 모두 EMPTY인지 확인
    const nw = BUILDING_DEFS.NEST.w || 1, nh = BUILDING_DEFS.NEST.h || 1;
    for (let dr = 0; dr < nh; dr++) {
      for (let dc = 0; dc < nw; dc++) {
        if (placeRow + dr >= ROWS || placeCol + dc >= COLS || G.grid[placeRow + dr][placeCol + dc] !== TILE.EMPTY) {
          showStatus('빈 공간에만 배치할 수 있습니다.');
          return;
        }
      }
    }
    if (G.resource < BUILDING_DEFS.NEST.cost) {
      showStatus('자원이 부족합니다!');
      return;
    }
    G.resource -= BUILDING_DEFS.NEST.cost;
    createBuilding('NEST', placeCol, placeRow);
    G.state = STATE.PREP;
    setSelectedBuild(null);
    updateBuildPanel();
    showStatus('핵심 둥지 건설 시작...');
    return;
  }

  // PREP / COUNTDOWN / WAVE 상태
  if (G.state === STATE.PREP || G.state === STATE.COUNTDOWN || G.state === STATE.WAVE) {
    // NEST 팝업이 열려 있으면 닫기
    if (G._nestPopupOpen) {
      closeNestPopup();
      G.selectedBuildingId = null;
      return;
    }

    // radial menu가 열려 있으면 닫기 (메뉴 바깥 클릭)
    if (G._radialOpen) {
      closeRadialMenu();
      G.selectedBuildingId = null;
      return;
    }

    // 건설 모드 활성 상태에서 빈 타일 클릭 → radial menu 표시
    if (buildModeActive) {
      // NEST 건설 전에는 다른 건물 배치 불가
      if (!G.nestBuilding || !G.nestBuilding.built) {
        showStatus('먼저 핵심 둥지를 건설하세요.');
        return;
      }
      // 외벽 안에서만 건설 가능
      // row 상한: BASE_ENTRANCE row 바로 위까지 (입구 row는 WALL 전용)
      const entranceRow = BASE_ENTRANCE[0].row;
      const isInsideBase = row >= 1 && row < entranceRow
        && G.distanceMap && G.distanceMap[row][col] < Infinity;
      const isEntrance = currentTile === TILE.ENTRANCE;

      // 건물이 있는 타일 클릭 시 → 건물 radial menu 열기 (NEST는 전용 팝업)
      const existingBuilding = G.buildings.find(b => col >= b.col && col < b.col + (b.w||1) && row >= b.row && row < b.row + (b.h||1));
      if (existingBuilding) {
        deactivateBuildMode();
        if (existingBuilding.type === 'NEST') {
          openNestUpgradePopup(existingBuilding);
        } else {
          openBuildingRadialMenu(G._lastClientX, G._lastClientY, existingBuilding);
        }
        return;
      }

      if (!isInsideBase && !isEntrance) {
        showStatus('외벽 안에서만 건설할 수 있습니다.');
        return;
      }

      // ENTRANCE 타일은 WALL만 가능 → WALL 직접 건설 시도
      if (isEntrance) {
        if (G.resource < BUILDING_DEFS.WALL.cost) {
          showStatus('자원이 부족합니다!');
          return;
        }
        G.resource -= BUILDING_DEFS.WALL.cost;
        createBuilding('WALL', col, row);
        updateHUD();
        return;
      }

      if (currentTile !== TILE.EMPTY) {
        showStatus('빈 공간에만 배치할 수 있습니다.');
        return;
      }

      // 빈 타일 → radial menu 열기 (화면 좌표 필요)
      // G._lastClientX/Y는 handleTileClick에서 저장
      openRadialMenu(G._lastClientX, G._lastClientY, col, row);
      return;
    }

    // 건설 모드가 아닐 때: 건물 클릭이면 radial menu 열기, 빈 타일이면 패널 닫기 (다중 타일 대응)
    const clicked = G.buildings.find(b => col >= b.col && col < b.col + (b.w||1) && row >= b.row && row < b.row + (b.h||1));
    if (clicked) {
      if (clicked.type === 'NEST') {
        openNestUpgradePopup(clicked);
      } else {
        openBuildingRadialMenu(G._lastClientX, G._lastClientY, clicked);
      }
    } else {
      closeBuildingPanel();
    }
    return;
  }
}

function isInNestZone(col, row) {
  const nw = BUILDING_DEFS.NEST.w || 1, nh = BUILDING_DEFS.NEST.h || 1;
  return col >= NEST_ZONE.colMin && col + nw - 1 <= NEST_ZONE.colMax
      && row >= NEST_ZONE.rowMin && row + nh - 1 <= NEST_ZONE.rowMax;
}


// ── 11. 건물 선택 패널 UI ─────────────────────────────────────────────────────

const buildPanel = document.getElementById('build-panel');

function buildBuildPanel() {
  buildPanel.innerHTML = '';

  const entries = [
    { key: 'NEST',     label: '핵심둥지' },
    { key: 'WALL',     label: '성벽' },
    { key: 'THORN',    label: '가시촉수' },
    { key: 'SPORE',    label: '산성포자' },
    { key: 'REPAIR',   label: '구조물수리' },
    { key: 'RESOURCE', label: '자원건물' },
  ];

  for (const { key, label } of entries) {
    const def = BUILDING_DEFS[key];
    const btn = document.createElement('button');
    btn.className = 'build-btn';
    btn.dataset.key = key;
    btn.innerHTML = `
      <span class="btn-icon">${def.icon}</span>
      <span class="btn-name">${label}</span>
      <span class="btn-cost">${def.cost}자원</span>
    `;
    btn.addEventListener('click', () => onBuildBtnClick(key));
    btn.addEventListener('touchend', e => { e.preventDefault(); onBuildBtnClick(key); }, { passive: false });
    buildPanel.appendChild(btn);
  }
}

function onBuildBtnClick(key) {
  if (G.state === STATE.IDLE || G.state === STATE.GAME_OVER) return;

  // NEST 버튼은 PLACING 상태에서만 유효
  if (key === 'NEST' && G.state !== STATE.PLACING) {
    showStatus('핵심 둥지는 이미 건설되었습니다.');
    return;
  }
  if (key !== 'NEST' && G.state === STATE.PLACING) {
    showStatus('먼저 핵심 둥지를 배치하세요.');
    return;
  }
  // 토글 선택
  if (G.selectedBuild === key) {
    setSelectedBuild(null);
  } else {
    setSelectedBuild(key);
  }
}

function setSelectedBuild(key) {
  G.selectedBuild = key;
  // 배치 모드 진입 시 건물 정보 패널 닫기 (buildingPanel은 섹션 17에서 초기화됨)
  if (key !== null && G.selectedBuildingId !== null) {
    closeBuildingPanel();
  }
  dirtyTerrain(); // 그리드 선 표시/숨김 전환
  updateBuildPanel();
}

function updateBuildPanel() {
  const btns = buildPanel.querySelectorAll('.build-btn');
  // 건물 정보 패널이 열려 있으면 배치 버튼 전체 disabled
  const panelOpen = !!G.selectedBuildingId;

  btns.forEach(btn => {
    const key = btn.dataset.key;
    const def = BUILDING_DEFS[key];
    btn.classList.toggle('selected', G.selectedBuild === key);

    // 비활성화: 자원 부족 또는 상태 불일치, 또는 건물 패널이 열려 있음
    const cantAfford = G.resource < def.cost;
    const isNestPlaced = !!G.nestTile;
    const isNestBtn = key === 'NEST';
    const inactive = panelOpen || cantAfford || (isNestBtn && isNestPlaced);
    btn.classList.toggle('disabled', inactive);
  });
}


// ── 12. HUD 업데이트 ──────────────────────────────────────────────────────────

const elResource = document.getElementById('val-resource');
const elWave     = document.getElementById('val-wave');
const elTimer    = document.getElementById('val-timer');
const elHP       = document.getElementById('val-hp');

function updateHUD() {
  elResource.textContent = G.resource;


  if (G.state === STATE.COUNTDOWN) {
    elTimer.textContent = Math.ceil(G.countdown) + 's';
  } else if (G.state === STATE.WAVE) {
    if (G.bossSpawned && !G.bossDefeated) {
      // 보스 등장 후: 보스 HP 표시
      const boss = G.enemies.find(e => e.type === 'NOVICE_HERO' && !e.dead);
      elTimer.textContent = boss ? `👑 ${Math.ceil(boss.hp)}` : '보스 처치!';
    } else {
      // 남은 게임 시간 MM:SS 형식
      const remaining = Math.max(0, GAME_DURATION - G.gameTimer);
      const mm = Math.floor(remaining / 60);
      const ss = Math.floor(remaining % 60);
      elTimer.textContent = `${mm}:${ss.toString().padStart(2, '0')}`;
    }
  } else if (G.state === STATE.PREP) {
    const nb = G.nestBuilding;
    elTimer.textContent = nb ? Math.ceil(nb.buildTimer) + 's' : '-';
  } else {
    elTimer.textContent = '-';
  }

  if (G.nestBuilding && G.nestBuilding.built) {
    elHP.textContent = G.nestBuilding.hp + '/' + G.nestBuilding.hpMax;
  } else {
    elHP.textContent = '-';
  }

  // 적 강화 배율 표시
  const scalePct = getEnemyScalePercent();
  const scaleEl = document.getElementById('hud-enemy-scale');
  const scaleValEl = document.getElementById('val-enemy-scale');
  if (scalePct > 0) {
    scaleEl.style.display = '';
    scaleValEl.textContent = `+${scalePct}%`;
    scaleValEl.style.color = scalePct >= 30 ? '#ff4040' : scalePct >= 20 ? '#ff8040' : '#f0c040';
  } else {
    scaleEl.style.display = 'none';
  }

  // 위협 공세 단계 바 업데이트
  const threatBar = document.getElementById('threat-bar');
  if (threatBar) {
    if (G.state === STATE.WAVE) {
      const s = SPAWN_SCHEDULE[G.scheduleIdx];
      const threatLv = G.scheduleIdx + 1;
      const totalPhases = SPAWN_SCHEDULE.length;
      const pct = Math.round((threatLv / totalPhases) * 100);
      const barColor = threatLv <= 4 ? '#40b060' : threatLv <= 8 ? '#e0a030' : '#e04040';
      threatBar.innerHTML = `
        <span class="threat-label">공세 ${threatLv}/${totalPhases}단계</span>
        <div class="threat-progress"><div class="threat-fill" style="width:${pct}%;background:${barColor}"></div></div>
      `;
      threatBar.style.display = 'flex';
    } else if (G.state === STATE.COUNTDOWN) {
      threatBar.innerHTML = `<span class="threat-label">건설 준비 중 — ${Math.ceil(G.countdown)}초 후 공세 시작</span>`;
      threatBar.style.display = 'flex';
    } else {
      threatBar.style.display = 'none';
    }
  }
}



// ── 13. 오버레이 UI ───────────────────────────────────────────────────────────

const overlay      = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlaySub   = document.getElementById('overlay-subtitle');
const overlayBtn   = document.getElementById('overlay-btn');

function showOverlay(title, subtitle, btnText) {
  overlayTitle.textContent = title;
  overlaySub.innerHTML = subtitle;
  overlayBtn.textContent = btnText;
  overlay.classList.remove('hidden');
}

function hideOverlay() {
  overlay.classList.add('hidden');
}

overlayBtn.addEventListener('click', onOverlayBtn);
overlayBtn.addEventListener('touchend', e => { e.preventDefault(); onOverlayBtn(); }, { passive: false });

function onOverlayBtn() {
  if (G.state === STATE.IDLE || G.state === STATE.GAME_OVER) {
    startNewGame();
  }
}

function startNewGame() {
  // initGame()이 G를 완전히 교체하므로, 루프 중복 시작 방지를 위해
  // 루프 실행 여부를 지역 변수로 먼저 확인한다.
  const wasRunning = G._loopRunning;

  initGame();
  resizeCanvas();
  buildBuildPanel();
  // 게임 재시작 시 건물 패널 닫기 (DOM 상태 초기화)
  buildingPanel.classList.add('hidden');
  bpHpEl = null;
  // 건설 모드 초기화
  buildModeActive = false;
  _updateBuildBtnActive();
  closeRadialMenu();
  // 광고 버프 초기화
  adBuffBtn.classList.remove('active');
  adBuffBtn.textContent = 'AD';
  // 게임 속도 버튼 리셋 (initGame에서 G.gameSpeed=1로 이미 초기화됨)
  speedBtn.textContent = '1x';
  speedBtn.classList.remove('active');
  G.state = STATE.PLACING;
  setSelectedBuild('NEST');
  hideOverlay();
  showStatus('보라색 타일을 터치하여 둥지를 배치하세요');
  updateHUD();

  if (!wasRunning) {
    G._loopRunning = true;
    requestAnimationFrame(gameLoop);
  } else {
    G._loopRunning = true;
  }
}


// ── 14. 상태 메시지 플래시 ───────────────────────────────────────────────────

const statusMsg = document.getElementById('status-msg');
let statusTimeout = null;

function showStatus(msg, duration = 2500) {
  statusMsg.textContent = msg;
  statusMsg.classList.add('visible');
  if (statusTimeout) clearTimeout(statusTimeout);
  statusTimeout = setTimeout(() => {
    statusMsg.classList.remove('visible');
  }, duration);
}

function spawnFloatText(b, amount) {
  const canvas    = document.getElementById('game-canvas');
  const container = document.getElementById('game-container');
  const cr        = canvas.getBoundingClientRect();
  const pr        = container.getBoundingClientRect();
  const offX      = cr.left - pr.left;
  const offY      = cr.top  - pr.top;
  const worldX    = b.col * TILE_SIZE + TILE_SIZE / 2;
  const worldY    = b.row * TILE_SIZE;
  const sx = (worldX - G.camera.x) * G.camera.zoom * G.canvasScale + offX;
  const sy = (worldY - G.camera.y) * G.camera.zoom * G.canvasScale + offY;
  const el = document.createElement('div');
  el.className   = 'float-text';
  el.textContent = '+' + amount;
  el.style.left  = sx + 'px';
  el.style.top   = sy + 'px';
  container.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}


// ── 15. 렌더링 ────────────────────────────────────────────────────────────────

/**
 * 지형 레이어를 오프스크린 캔버스에 그린다.
 * terrainDirty === true 일 때만 호출된다.
 */
function renderTerrain() {
  const tc = terrainCtx;
  tc.clearRect(0, 0, terrainCanvas.width, terrainCanvas.height);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const t = G.grid[r][c];
      const x = c * TILE_SIZE;
      const y = r * TILE_SIZE;

      // 타일 배경색 — 의사랜덤 노이즈로 단조로움 제거
      let bg;
      if (t === TILE.EMPTY || t >= TILE.WALL) {
        // EMPTY 및 건물 타일: 약한 갈색 계열 노이즈
        const noise = Math.sin(c * 3.7 + r * 2.3) * Math.cos(c * 1.9 + r * 4.1);
        const brightness = Math.floor(noise * 8); // -8 ~ +8
        const base = 22 + brightness; // 14~30 범위
        bg = `rgb(${base + 4}, ${base + 2}, ${base - 4})`;
      } else if (t === TILE.BLOCKED) {
        // BLOCKED: 밝은 돌벽 텍스처
        const noise1 = Math.sin(c * 5.1 + r * 3.7) * 0.5;
        const noise2 = Math.cos(c * 2.3 + r * 6.1) * 0.3;
        const b = Math.floor(55 + noise1 * 12 + noise2 * 8);
        bg = `rgb(${b + 5}, ${b + 3}, ${b - 2})`;
      } else if (t === TILE.ENTRANCE) {
        bg = '#3a2010';
      } else if (t === TILE.SPAWN) {
        bg = '#1a0808';
      } else {
        bg = '#141428';
      }

      tc.fillStyle = bg;
      tc.fillRect(x, y, TILE_SIZE, TILE_SIZE);

      // BLOCKED 타일 — 돌벽 무늬 (균열 + 테두리)
      if (t === TILE.BLOCKED) {
        // 타일 테두리 (벽돌 느낌)
        tc.strokeStyle = 'rgba(0, 0, 0, 0.35)';
        tc.lineWidth = 1;
        tc.strokeRect(x + 0.5, y + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
        // 내부 균열선 — 의사랜덤 패턴
        tc.strokeStyle = 'rgba(0, 0, 0, 0.15)';
        tc.lineWidth = 0.5;
        const s1 = (c * 7 + r * 13) % 5;
        tc.beginPath();
        if (s1 < 2) {
          tc.moveTo(x + 8, y + TILE_SIZE / 2);
          tc.lineTo(x + TILE_SIZE - 8, y + TILE_SIZE / 2);
        } else if (s1 < 4) {
          tc.moveTo(x + TILE_SIZE / 2, y + 6);
          tc.lineTo(x + TILE_SIZE / 2, y + TILE_SIZE - 6);
        } else {
          tc.moveTo(x + 6, y + 10);
          tc.lineTo(x + TILE_SIZE - 10, y + TILE_SIZE - 6);
        }
        tc.stroke();
        // 밝은 하이라이트 (입체감)
        tc.fillStyle = 'rgba(255, 255, 255, 0.06)';
        tc.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE / 3);
      }


      // 스폰 지점 표시 — 해골 마크
      if (t === TILE.SPAWN) {
        tc.font = 'bold 20px serif';
        tc.textAlign = 'center';
        tc.textBaseline = 'middle';
        tc.fillText('💀', x + TILE_SIZE / 2, y + TILE_SIZE / 2);
      }

      // 핵심 둥지 배치 가능 영역 하이라이트 (PLACING 상태에서만)
      if (G.state === STATE.PLACING && t === TILE.EMPTY
          && c >= NEST_ZONE.colMin && c <= NEST_ZONE.colMax
          && r >= NEST_ZONE.rowMin && r <= NEST_ZONE.rowMax) {
        tc.fillStyle = 'rgba(128, 50, 200, 0.18)';
        tc.fillRect(x, y, TILE_SIZE, TILE_SIZE);
      }

      // 그리드 선: 건물 배치 모드(또는 건설 모드) 활성 시 표시
      if (G.selectedBuild !== null || buildModeActive) {
        tc.strokeStyle = '#2a2a4a';
        tc.lineWidth = 0.5;
        tc.strokeRect(x + 0.5, y + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
      }
    }
  }

  terrainDirty = false;
}

/** 건물 렌더링 */
function renderBuildings() {
  for (const b of G.buildings) {
    const x = b.col * TILE_SIZE;
    const y = b.row * TILE_SIZE;
    const def = BUILDING_DEFS[b.type];
    const bw = b.w || 1, bh = b.h || 1;
    const renderW = TILE_SIZE * bw;
    const renderH = TILE_SIZE * bh;

    if (!b.built) {
      // 건설 중: 반투명 + 진행 바 (녹색)
      ctx.globalAlpha = 0.5;
      drawBuildingShape(ctx, b.type, x, y, b.color, renderW, renderH, b.level);
      ctx.globalAlpha = 1.0;

      const progress = 1 - b.buildTimer / def.buildTime;
      const barW = renderW - 8;
      const barH = 4;
      const bx   = x + 4;
      const by   = y + renderH - 8;
      ctx.fillStyle = '#333';
      ctx.fillRect(bx, by, barW, barH);
      ctx.fillStyle = '#60e060'; // 건설: 녹색
      ctx.fillRect(bx, by, barW * progress, barH);
    } else {
      drawBuildingShape(ctx, b.type, x, y, b.color, renderW, renderH, b.level);

      // HP 바 (건물 최상단, NEST만 항상 표시. 나머지는 피해 입었을 때만)
      if (b.type === 'NEST' || b.hp < b.hpMax) {
        drawHPBar(ctx, x + 2, y + 2, renderW - 4, 4, b.hp / b.hpMax);
      }

      // 업그레이드 진행 바 (파란색, 건설 완료 후 upgrading 중일 때)
      if (b.upgrading) {
        const upgDef    = BUILDING_DEFS[b.type];
        const totalTime = Array.isArray(upgDef.upgradeTime)
          ? upgDef.upgradeTime[b.level - 1]
          : upgDef.upgradeTime;
        const progress = 1 - b.upgradeTimer / totalTime;
        const barW = renderW - 8;
        const barH = 4;
        const bx   = x + 4;
        const by   = y + renderH - 8;
        ctx.fillStyle = '#222244';
        ctx.fillRect(bx, by, barW, barH);
        ctx.fillStyle = '#4080e0'; // 업그레이드: 파란색
        ctx.fillRect(bx, by, barW * progress, barH);
      }

      // 레벨 표시: NEST/THORN/SPORE/REPAIR/WALL/RESOURCE/BALLISTA
      if (!b.upgrading && ['NEST', 'THORN', 'SPORE', 'REPAIR', 'WALL', 'RESOURCE', 'BALLISTA'].includes(b.type)) {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`Lv.${b.level}`, x + renderW - 2, y + renderH - 2);
      }
    }
  }

  // 선택된 건물의 사거리/범위 원 — getBuildingCenter 사용
  if (G.selectedBuildingId) {
    const sel = G.buildings.find(b => b.id === G.selectedBuildingId);
    if (sel && sel.built) {
      const bp  = getBuildingCenter(sel);
      const lv  = (sel.level || 1) - 1;
      if (sel.type === 'THORN') {
        ctx.strokeStyle = 'rgba(80, 128, 48, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(bp.x, bp.y, THORN_STATS.range[lv] * TILE_SIZE, 0, Math.PI * 2);
        ctx.stroke();
      } else if (sel.type === 'SPORE') {
        ctx.strokeStyle = 'rgba(128, 96, 48, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(bp.x, bp.y, SPORE_STATS.range[lv] * TILE_SIZE, 0, Math.PI * 2);
        ctx.stroke();
      } else if (sel.type === 'REPAIR') {
        ctx.strokeStyle = 'rgba(0, 200, 200, 0.4)';
        ctx.fillStyle   = 'rgba(0, 200, 200, 0.08)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(bp.x, bp.y, REPAIR_STATS.range[lv] * TILE_SIZE, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (sel.type === 'BALLISTA') {
        ctx.strokeStyle = 'rgba(160, 80, 20, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(bp.x, bp.y, BALLISTA_STATS.range[lv] * TILE_SIZE, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }
}

function drawBuildingShape(ctx, type, x, y, color, renderW, renderH, level) {
  // renderW/renderH: 건물 전체 렌더 크기 (NEST 2×2는 TILE_SIZE*2)
  renderW = renderW || TILE_SIZE;
  renderH = renderH || TILE_SIZE;
  level = level || 1;
  const cx = x + renderW / 2;
  const cy = y + renderH / 2;
  const h  = Math.min(renderW, renderH) / 2 - 4;

  ctx.fillStyle = color;

  switch (type) {
    case 'NEST': {
      if (level <= 1) {
        // Lv.1: 기존 형태 — 불규칙 다각형 + 내부원
        ctx.beginPath();
        ctx.moveTo(cx, cy - h);
        ctx.lineTo(cx + h * 0.7, cy - h * 0.3);
        ctx.lineTo(cx + h * 0.9, cy + h * 0.6);
        ctx.lineTo(cx, cy + h);
        ctx.lineTo(cx - h * 0.9, cy + h * 0.6);
        ctx.lineTo(cx - h * 0.7, cy - h * 0.3);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#c060ff';
        ctx.beginPath();
        ctx.arc(cx, cy, h * 0.4, 0, Math.PI * 2);
        ctx.fill();
      } else if (level === 2) {
        // Lv.2: 꼭짓점 8~10개 + 촉수 4~6개 + 밝은 내부원 + 외곽선
        const verts = 9;
        ctx.beginPath();
        for (let i = 0; i < verts; i++) {
          const ang = (i / verts) * Math.PI * 2 - Math.PI / 2;
          const r = h * (0.75 + 0.2 * Math.sin(i * 2.3));
          const px = cx + Math.cos(ang) * r;
          const py = cy + Math.sin(ang) * r;
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#d080ff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // 촉수 돌기 (5개)
        for (let i = 0; i < 5; i++) {
          const ang = (i / 5) * Math.PI * 2 - Math.PI / 2;
          const bx = cx + Math.cos(ang) * h * 0.85;
          const by = cy + Math.sin(ang) * h * 0.85;
          const tx = cx + Math.cos(ang) * h * 1.15;
          const ty = cy + Math.sin(ang) * h * 1.15;
          const perpX = -Math.sin(ang) * h * 0.12;
          const perpY =  Math.cos(ang) * h * 0.12;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.moveTo(bx + perpX, by + perpY);
          ctx.lineTo(tx, ty);
          ctx.lineTo(bx - perpX, by - perpY);
          ctx.closePath();
          ctx.fill();
        }
        // 내부원 (밝은 보라)
        ctx.fillStyle = '#d080ff';
        ctx.beginPath();
        ctx.arc(cx, cy, h * 0.4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Lv.3: 꼭짓점 12개 + 촉수 8개 + 이중원 + 글로우
        ctx.save();
        ctx.shadowColor = '#ff80ff';
        ctx.shadowBlur = 12;
        const verts = 12;
        ctx.beginPath();
        for (let i = 0; i < verts; i++) {
          const ang = (i / verts) * Math.PI * 2 - Math.PI / 2;
          const r = h * (0.8 + 0.15 * Math.sin(i * 1.7));
          const px = cx + Math.cos(ang) * r;
          const py = cy + Math.sin(ang) * r;
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#ff80ff';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore(); // shadowBlur 리셋
        // 촉수 돌기 (8개)
        for (let i = 0; i < 8; i++) {
          const ang = (i / 8) * Math.PI * 2 - Math.PI / 2;
          const bx = cx + Math.cos(ang) * h * 0.85;
          const by = cy + Math.sin(ang) * h * 0.85;
          const tx = cx + Math.cos(ang) * h * 1.2;
          const ty = cy + Math.sin(ang) * h * 1.2;
          const perpX = -Math.sin(ang) * h * 0.1;
          const perpY =  Math.cos(ang) * h * 0.1;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.moveTo(bx + perpX, by + perpY);
          ctx.lineTo(tx, ty);
          ctx.lineTo(bx - perpX, by - perpY);
          ctx.closePath();
          ctx.fill();
        }
        // 이중원: 외부 반투명 + 내부 밝은 핑크
        ctx.fillStyle = 'rgba(255, 128, 255, 0.25)';
        ctx.beginPath();
        ctx.arc(cx, cy, h * 0.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ff80ff';
        ctx.beginPath();
        ctx.arc(cx, cy, h * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'WALL': {
      // 성벽: 사각형 + 총안 표현
      ctx.fillRect(x + 4, y + 10, TILE_SIZE - 8, TILE_SIZE - 14);
      // 총안
      ctx.fillRect(x + 4,  y + 4, 8, 8);
      ctx.fillRect(x + TILE_SIZE - 12, y + 4, 8, 8);
      break;
    }
    case 'THORN': {
      // 가시 촉수: 중앙 마름모 + 4방향 삼각형 돌기
      ctx.beginPath();
      ctx.moveTo(cx,         cy - h * 0.5);
      ctx.lineTo(cx + h * 0.5, cy);
      ctx.lineTo(cx,         cy + h * 0.5);
      ctx.lineTo(cx - h * 0.5, cy);
      ctx.closePath();
      ctx.fill();
      // 4방향 가시 돌기
      const thornDirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
      for (const [nx, ny] of thornDirs) {
        ctx.beginPath();
        ctx.moveTo(cx + nx * h * 0.5, cy + ny * h * 0.5);
        ctx.lineTo(cx + nx * h - ny * h * 0.3, cy + ny * h + nx * h * 0.3);
        ctx.lineTo(cx + nx * h + ny * h * 0.3, cy + ny * h - nx * h * 0.3);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'SPORE': {
      // 산성 포자: 중앙 큰 원 + 주변 6개 작은 원
      ctx.beginPath();
      ctx.arc(cx, cy, h * 0.45, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2;
        const sx  = cx + Math.cos(ang) * h * 0.75;
        const sy  = cy + Math.sin(ang) * h * 0.75;
        ctx.beginPath();
        ctx.arc(sx, sy, h * 0.18, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'REPAIR': {
      // 구조물 수리: 두꺼운 십자(+) 형태
      const armW = h * 0.35;
      const armL = h * 0.9;
      ctx.fillRect(cx - armW, cy - armL, armW * 2, armL * 2); // 세로
      ctx.fillRect(cx - armL, cy - armW, armL * 2, armW * 2); // 가로
      break;
    }
    case 'RESOURCE': {
      // 자원건물: 다이아몬드
      ctx.beginPath();
      ctx.moveTo(cx, cy - h);
      ctx.lineTo(cx + h, cy);
      ctx.lineTo(cx, cy + h);
      ctx.lineTo(cx - h, cy);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#ffe060';
      ctx.beginPath();
      ctx.arc(cx, cy, h * 0.35, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'BALLISTA': {
      // 발리스타: 진한 갈색 배경 + 포신(수평 막대) + 양쪽 날개(삼각형)
      // 레벨이 오를수록 색상이 밝아진다
      const brightFactor = 1 + (level - 1) * 0.12;
      const baseColor = color; // '#704020'

      // 배경 직사각형
      ctx.fillStyle = baseColor;
      ctx.fillRect(x + 6, y + 8, renderW - 12, renderH - 16);

      // 포신 (수평 막대, 중앙)
      const barrelColor = `rgba(${Math.min(255, Math.round(0x90 * brightFactor))}, ${Math.min(255, Math.round(0x50 * brightFactor))}, ${Math.min(255, Math.round(0x10 * brightFactor))}, 1)`;
      ctx.fillStyle = barrelColor;
      ctx.fillRect(x + 4, cy - h * 0.14, renderW - 8, h * 0.28);

      // 왼쪽 날개 (삼각형)
      ctx.fillStyle = barrelColor;
      ctx.beginPath();
      ctx.moveTo(x + 6,          cy);
      ctx.lineTo(x + 6 + h * 0.5, cy - h * 0.45);
      ctx.lineTo(x + 6 + h * 0.5, cy + h * 0.45);
      ctx.closePath();
      ctx.fill();

      // 오른쪽 날개 (삼각형, 대칭)
      ctx.beginPath();
      ctx.moveTo(x + renderW - 6,            cy);
      ctx.lineTo(x + renderW - 6 - h * 0.5,  cy - h * 0.45);
      ctx.lineTo(x + renderW - 6 - h * 0.5,  cy + h * 0.45);
      ctx.closePath();
      ctx.fill();

      // 중앙 볼트 (원형 강조)
      ctx.fillStyle = `rgba(255, 200, 80, ${0.5 + (level - 1) * 0.1})`;
      ctx.beginPath();
      ctx.arc(cx, cy, h * 0.18, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
}

function drawHPBar(ctx, x, y, w, h, ratio) {
  ctx.fillStyle = '#400';
  ctx.fillRect(x, y, w, h);
  const color = ratio > 0.6 ? '#40e040' : ratio > 0.3 ? '#e0e020' : '#e04020';
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * Math.max(0, ratio), h);
}

/** 적 렌더링 */
function renderEnemies() {
  for (const e of G.enemies) {
    if (e.dead) continue;

    // NOVICE_HERO: 전용 외형 렌더링
    if (e.type === 'NOVICE_HERO') {
      const bigR = e.radius * 1.5;
      // 황금색 큰 원
      ctx.beginPath();
      ctx.arc(e.x, e.y, bigR, 0, Math.PI * 2);
      ctx.fillStyle = e.color;
      ctx.fill();
      // 두꺼운 황금 테두리
      ctx.strokeStyle = e.outlineColor;
      ctx.lineWidth = 4;
      ctx.stroke();
      // 중앙 검 이모지
      ctx.font = `bold ${Math.round(e.radius * 1.5)}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⚔️', e.x, e.y);
      // HP 바 (더 두껍게, 더 넓게)
      const hpBarW = e.radius * 4;
      const hpBarH = 8;
      drawHPBar(ctx, e.x - hpBarW / 2, e.y - bigR - 12, hpBarW, hpBarH, e.hp / e.hpMax);
      continue;
    }

    // 몸통: 원
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
    ctx.fillStyle = e.color;
    ctx.fill();
    ctx.strokeStyle = e.outlineColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    // 인간 병사 표식: 십자 (군인 느낌)
    ctx.strokeStyle = '#f0e0c0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(e.x - 4, e.y);
    ctx.lineTo(e.x + 4, e.y);
    ctx.moveTo(e.x, e.y - 4);
    ctx.lineTo(e.x, e.y + 4);
    ctx.stroke();

    // MAGE: 마법 원형 외곽선 (원거리 표시)
    if (e.type === 'MAGE') {
      ctx.strokeStyle = 'rgba(192, 96, 255, 0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    // WARRIOR: 영웅 강조 외곽선 (금색)
    if (e.type === 'WARRIOR') {
      ctx.strokeStyle = 'rgba(220, 180, 50, 0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius + 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    // ARCHER: 활 모양 (반원 호 + 시위 직선, 녹색)
    if (e.type === 'ARCHER') {
      ctx.strokeStyle = '#a0e060';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius + 3, -Math.PI * 0.6, Math.PI * 0.6);
      ctx.stroke();
      // 시위 (호의 양 끝을 직선 연결)
      const r = e.radius + 3;
      const x1 = e.x + Math.cos(-Math.PI * 0.6) * r;
      const y1 = e.y + Math.sin(-Math.PI * 0.6) * r;
      const x2 = e.x + Math.cos(Math.PI * 0.6) * r;
      const y2 = e.y + Math.sin(Math.PI * 0.6) * r;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // HP 바
    const barW = e.radius * 2 + 4;
    drawHPBar(ctx, e.x - barW / 2, e.y - e.radius - 6, barW, 3, e.hp / e.hpMax);
  }
}

/** 투사체 렌더링 — PHYSICAL(THORN)은 녹색, ACID(SPORE)는 황록색 */
/** 피해량 플로팅 텍스트 생성 */
function spawnFloatingText(x, y, text, color) {
  G.floatingTexts.push({ x, y, text, color, life: 0.8, maxLife: 0.8 });
}

/** 플로팅 텍스트 업데이트 */
function updateFloatingTexts(dt) {
  for (const ft of G.floatingTexts) {
    ft.life -= dt;
    ft.y -= 30 * dt; // 위로 떠오름
  }
  G.floatingTexts = G.floatingTexts.filter(ft => ft.life > 0);
}

/** 플로팅 텍스트 렌더링 */
function renderFloatingTexts() {
  for (const ft of G.floatingTexts) {
    const alpha = Math.max(0, ft.life / ft.maxLife);
    ctx.globalAlpha = alpha;
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = ft.color;
    ctx.fillText(ft.text, ft.x, ft.y);
  }
  ctx.globalAlpha = 1;
}

function renderProjectiles() {
  for (const p of G.projectiles) {
    const isAcid  = p.attackType === 'ACID';
    const color   = p.fromBallista ? '#c060ff'
                  : isAcid         ? '#c0e030'
                  : '#80ff80';
    const tailClr = p.fromBallista ? 'rgba(192, 96, 255, 0.4)'
                  : isAcid         ? 'rgba(192, 224, 48, 0.4)'
                  : 'rgba(128, 255, 128, 0.4)';

    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    // 꼬리 효과
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - p.vx * 0.08, p.y - p.vy * 0.08);
    ctx.strokeStyle = tailClr;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

/** 적 원거리 투사체 렌더링 — PHYSICAL(궁수)는 황갈색, MAGICAL(마법사)은 보라색 */
function renderEnemyProjectiles() {
  for (const p of G.enemyProjectiles) {
    const isPhysical = p.attackType === 'PHYSICAL';
    const fillColor = isPhysical ? '#c0a040' : '#c060ff';
    const tailColor = isPhysical ? 'rgba(192, 160, 64, 0.4)' : 'rgba(192, 96, 255, 0.4)';

    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = fillColor;
    ctx.fill();
    // 꼬리 효과
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - p.vx * 0.06, p.y - p.vy * 0.06);
    ctx.strokeStyle = tailColor;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

/** NOVICE_HERO AoE 범위 플래시 렌더링 — 적 렌더링 이후 카메라 변환 내에서 호출 */
function renderAoeFlashes() {
  for (const f of G.aoeFlashes) {
    const alpha = f.life / f.maxLife;
    ctx.save();
    if (f.tiles) {
      // 직선 3타일 플래시 — 각 타일을 1×1 사각형으로 표시
      for (const t of f.tiles) {
        const rx = t.x - TILE_SIZE / 2;
        const ry = t.y - TILE_SIZE / 2;
        ctx.globalAlpha = alpha * 0.5;
        ctx.fillStyle = '#ff4400';
        ctx.fillRect(rx, ry, TILE_SIZE, TILE_SIZE);
        ctx.globalAlpha = alpha * 0.9;
        ctx.strokeStyle = '#ff8800';
        ctx.lineWidth = 2;
        ctx.strokeRect(rx, ry, TILE_SIZE, TILE_SIZE);
      }
    } else {
      // 구형 원형 플래시 (호환용)
      ctx.globalAlpha = alpha * 0.45;
      ctx.fillStyle = '#ff4400';
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = alpha * 0.8;
      ctx.strokeStyle = '#ff8800';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.restore();
  }
}

/** 메인 렌더 함수 */
function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.scale(G.camera.zoom, G.camera.zoom);
  ctx.translate(-G.camera.x, -G.camera.y);

  // 1. 지형 레이어 (캐시)
  if (terrainDirty) renderTerrain();
  ctx.drawImage(terrainCanvas, 0, 0);

  // 2. 건물
  renderBuildings();

  // 3. 적
  renderEnemies();

  // 3-1. NOVICE_HERO AoE 플래시 (적 렌더링 직후)
  renderAoeFlashes();

  // 4. 투사체 (타워)
  renderProjectiles();

  // 5. 적 원거리 투사체
  renderEnemyProjectiles();

  // 6. 피해량 플로팅 텍스트
  renderFloatingTexts();

  ctx.restore();
}


// ── 16. 게임 업데이트 로직 ───────────────────────────────────────────────────

function update(dt) {
  if (G.state === STATE.IDLE || G.state === STATE.GAME_OVER || G.state === STATE.PLACING) return;

  // BFS 거리맵 재계산 (건물 변경 시)
  if (G.distanceMapDirty && G.nestBuilding && G.nestBuilding.built) {
    computeDistanceMap();
  }

  // 건물 건설 타이머 처리
  updateBuildTimers(dt);

  if (G.state === STATE.PREP) {
    // 핵심 둥지 건설 완료 대기
    if (G.nestBuilding && G.nestBuilding.built) {
      G.state = STATE.COUNTDOWN;
      G.countdown = COUNTDOWN_DURATION;
      showStatus('웨이브까지 ' + COUNTDOWN_DURATION + '초! 방어선을 구축하세요.');
    }
    return;
  }

  if (G.state === STATE.COUNTDOWN) {
    G.countdown -= dt;
    // 카운트다운 중에도 자원건물은 생산한다 (준비 시간 활용)
    updateResourceBuildings(dt);
    updateAdBuff(dt);
    if (G.countdown <= 0) {
      G.countdown = 0;
      startWave();
    }
    return;
  }

  if (G.state === STATE.WAVE) {
    updateWave(dt);
    updateEnemies(dt);
    updateTowers(dt);
    updateProjectiles(dt);
    updateEnemyProjectiles(dt);
    updateResourceBuildings(dt);
    updateRepair(dt);
    updateRepairBuildings(dt);
    updateFloatingTexts(dt);
    updateAoeFlashes(dt);
    updateAdBuff(dt);
    // checkWaveEnd 제거: 시간 기반 시스템에서 종료는 updateWave 내 triggerVictory가 처리한다
  }
}

function updateBuildTimers(dt) {
  for (const b of G.buildings) {
    if (!b.built) {
      b.buildTimer -= dt;
      if (b.buildTimer <= 0) {
        b.buildTimer = 0;
        b.built = true;
        if (b.type === 'NEST') {
          showStatus('핵심 둥지 건설 완료!');
        }
        dirtyTerrain(); // 건설 완료 시 지형 캐시 갱신
        G.distanceMapDirty = true; // BFS 거리맵 재계산
      }
    } else if (b.upgrading) {
      b.upgradeTimer -= dt;
      if (b.upgradeTimer <= 0) {
        b.upgradeTimer = 0;
        b.upgrading    = false;
        const def = BUILDING_DEFS[b.type];

        // 모든 레벨 기반 건물: 레벨 증가 + 유형별 hpMax 갱신
        b.level += 1;
        const oldMax = b.hpMax;
        if (b.type === 'WALL') {
          // STRUCTURE_FORTIFY 보너스를 포함한 hpMax 계산
          const fortifyLv = G.globalUpgrades.STRUCTURE_FORTIFY;
          b.hpMax = Math.round(def.hpPerLevel[b.level - 1] * (1 + fortifyLv * 0.03));
        } else if (b.type === 'NEST') {
          // hpPerLevel 배열로 직접 지정 + STRUCTURE_FORTIFY 보너스
          const fortifyLv = G.globalUpgrades.STRUCTURE_FORTIFY;
          b.hpMax = Math.round(def.hpPerLevel[b.level - 1] * (1 + fortifyLv * 0.03));
        } else {
          // THORN/SPORE/REPAIR/RESOURCE/BALLISTA: 기준 hpMax + STRUCTURE_FORTIFY 보너스
          const fortifyLv = G.globalUpgrades.STRUCTURE_FORTIFY;
          b.hpMax = Math.round(def.hpMax * (1 + b.level * 0.15) * (1 + fortifyLv * 0.03));
        }
        b.hp = Math.min(b.hpMax, b.hp + (b.hpMax - oldMax));

        showStatus(`${def.name} 업그레이드 완료!`);
        dirtyTerrain();
        // 패널이 열려 있으면 갱신
        if (G.selectedBuildingId === b.id) {
          openBuildingPanel(b);
        }
      }
    }
  }
}

/** WAVE 상태 진입 — 타이머 초기화 */
function startWave() {
  G.state       = STATE.WAVE;
  G.gameTimer   = 0;
  G.spawnTimer  = SPAWN_SCHEDULE[0].interval; // 첫 배치 전 7초 유예
  G.scheduleIdx = 0;
  showStatus('인간 병사가 접근하고 있다! 둥지를 지켜라!', 3000);
}

/**
 * 시간 기반 연속 스폰 업데이트.
 * gameTimer가 GAME_DURATION(600s)을 넘으면 승리 판정.
 * SPAWN_SCHEDULE의 timeStart를 기준으로 현재 구간(scheduleIdx)을 자동 갱신한다.
 */
function updateWave(dt) {
  // 보스 등장 후에는 타이머가 GAME_DURATION에 고정되도록 증가를 막는다
  if (!G.bossSpawned) {
    G.gameTimer  += dt;
    G.spawnTimer -= dt;
  }

  // GAME_DURATION 경과 → 보스 스폰 (최초 1회)
  if (G.gameTimer >= GAME_DURATION && !G.bossSpawned) {
    G.bossSpawned = true;
    // 기존 생존 몬스터 HP +100% 버프
    for (const e of G.enemies) {
      if (e.type === 'NOVICE_HERO') continue;
      e.hp    = Math.round(e.hp    * 2.0);
      e.hpMax = Math.round(e.hpMax * 2.0);
    }
    spawnEnemy('NOVICE_HERO', 0);
    for (let i = 0; i < 30; i++) spawnEnemy('WARRIOR', i % BASE_ENTRANCE.length);
    for (let i = 0; i < 20; i++) spawnEnemy('MAGE', i % BASE_ENTRANCE.length);
    showStatus('보스 등장! 초보 용사와 부하들이 나타났다!', 5000);
    return;
  }

  // 보스가 등장한 후에는 일반 스폰 로직 전부 건너뜀
  if (G.bossSpawned) return;

  // 스케줄 구간 갱신: 다음 구간의 timeStart에 도달했으면 인덱스를 올린다
  const nextIdx = G.scheduleIdx + 1;
  if (nextIdx < SPAWN_SCHEDULE.length &&
      G.gameTimer >= SPAWN_SCHEDULE[nextIdx].timeStart) {
    G.scheduleIdx = nextIdx;
    const s = SPAWN_SCHEDULE[nextIdx];
    let threatMsg = `위협 증가! 정찰병 ${s.scout} / 돌격병 ${s.fast} / 중장갑 ${s.tanker}`;
    if (s.warrior > 0) threatMsg += ` / 전사 ${s.warrior}`;
    if (s.mage    > 0) threatMsg += ` / 마법사 ${s.mage}`;
    if (s.archer  > 0) threatMsg += ` / 궁수 ${s.archer}`;
    showStatus(threatMsg, 3000);
  }

  // 스폰 타이머 만료 → 현재 구간의 배치를 스폰
  if (G.spawnTimer <= 0) {
    const sched = SPAWN_SCHEDULE[G.scheduleIdx];
    spawnBatch(sched);
    G.spawnTimer = sched.interval;
  }
}

/**
 * 한 배치(citizen/scout/fast/tanker/warrior/mage)를 스폰한다.
 * - 이번 배치 수 + 보류(pendingSpawn)를 합산해 실제 시도할 수를 구한다.
 * - 동시 생존 수(ENEMY_CAP)를 초과하는 분은 다시 pendingSpawn에 보관한다.
 * - 실제 스폰은 입구를 교대로 사용해 한 곳에 몰리지 않게 한다.
 */
function spawnBatch(sched) {
  let entranceRobin = 0;

  function trySpawn(type, newCount) {
    const want  = newCount + G.pendingSpawn[type];          // 이번에 내보내고 싶은 총 수
    const alive = G.enemies.filter(e => !e.dead && e.type === type).length;
    const room  = Math.max(0, ENEMY_CAP[type] - alive);    // 캡 여유분
    const actual = Math.min(want, room);                    // 실제 스폰 수
    G.pendingSpawn[type] = want - actual;                   // 초과분 보류

    for (let i = 0; i < actual; i++) {
      spawnEnemy(type, entranceRobin % ENTRANCES.length);
      entranceRobin++;
    }
  }

  trySpawn('CITIZEN', sched.citizen);
  trySpawn('SCOUT',   sched.scout);
  trySpawn('FAST',    sched.fast);
  trySpawn('TANKER',  sched.tanker);
  trySpawn('WARRIOR', sched.warrior);
  trySpawn('MAGE',    sched.mage);
  trySpawn('ARCHER',  sched.archer);
}

/** 10분 생존 성공 처리 */
function triggerVictory() {
  if (G.state === STATE.GAME_OVER) return; // 이미 처리됨
  G.state = STATE.GAME_OVER;
  showOverlay(
    '괴생명체 생존!',
    '인간의 공격을 모두 막아냈다.<br>둥지는 계속 진화한다…',
    '다시 플레이'
  );
}

function updateEnemies(dt) {
  for (const e of G.enemies) {
    if (e.dead) continue;

    // NOVICE_HERO: 스킬 타이머 및 AoE 처리
    if (e.type === 'NOVICE_HERO') {
      e.skillTimer = (e.skillTimer || 10) - dt;
      if (e.skillTimer <= 0) {
        e.skillTimer = 10;
        fireNoviceHeroAoe(e);
      }
    }

    // 직선 추적: 매 프레임 경로 상 장애물을 재평가해 이동/공격한다
    pursueTarget(e, dt);

    // ── 끼임 감지: 건물 공격 중이 아닌데 10초간 거의 이동 없으면 재스폰 ──
    if (e.type !== 'NOVICE_HERO' && !e.targetBldId) {
      const moved   = Math.hypot(e.x - e.stuckLastX, e.y - e.stuckLastY);
      const minMove = e.speed * dt * 0.1; // 정상 이동속도의 10% 미만이면 정지로 간주
      if (moved < minMove) {
        e.stuckTimer += dt;
        if (e.stuckTimer >= 10) {
          // 재스폰: 현재 적 제거 후 동일 타입 새로 스폰
          e.dead = true;
          spawnEnemy(e.type, Math.floor(Math.random() * BASE_ENTRANCE.length));
        }
      } else {
        e.stuckTimer = 0;
      }
    } else {
      // 공격 중이거나 NOVICE_HERO: 스턱 타이머 리셋
      e.stuckTimer = 0;
    }
    e.stuckLastX = e.x;
    e.stuckLastY = e.y;
  }

  // 모든 살아있는 적끼리 캡슐 충돌 해소
  resolveCapsuleCollisions();

  G.enemies = G.enemies.filter(e => !e.dead);
}

/**
 * NOVICE_HERO 스킬 — 현재 공격 중인 건물을 기준점으로, NEST 방향으로
 * 1·2·3칸 타일을 1자로 순서대로 타격한다.
 * 공격 중인 건물이 없으면 자기 위치를 기준점으로 사용한다.
 */
function fireNoviceHeroAoe(enemy) {
  if (!G.nestBuilding || !G.nestBuilding.built) return;

  // 기준점: 현재 공격 중인 건물 중심, 없으면 자기 위치
  const targetBld = enemy.targetBldId
    ? G.buildings.find(b => b.id === enemy.targetBldId && b.built && !b.dead)
    : null;
  const origin = targetBld ? getBuildingCenter(targetBld) : { x: enemy.x, y: enemy.y };

  // 방향: 초보 용사 자신 → 공격 대상 방향 (공격 대상 없으면 NEST 방향)
  const nestCenter = getBuildingCenter(G.nestBuilding);
  const refX = targetBld ? origin.x : nestCenter.x;
  const refY = targetBld ? origin.y : nestCenter.y;
  const dx   = refX - enemy.x;
  const dy   = refY - enemy.y;
  const dist = Math.hypot(dx, dy);

  const ux = dist > 0 ? dx / dist : 0;
  const uy = dist > 0 ? dy / dist : 0;

  const aoeDmg = ENEMY_DEFS.NOVICE_HERO.aoeDmg;

  // 기준점에서 공격 방향으로 1~3칸 타일 중심 좌표
  const tileHits = [];
  for (let i = 1; i <= 3; i++) {
    tileHits.push({
      x: origin.x + ux * TILE_SIZE * i,
      y: origin.y + uy * TILE_SIZE * i,
    });
  }

  // 중복 피해 방지 Set
  const damagedIds = new Set();
  for (const t of tileHits) {
    const hitCol = Math.floor(t.x / TILE_SIZE);
    const hitRow = Math.floor(t.y / TILE_SIZE);
    for (const b of G.buildings) {
      if (!b.built || damagedIds.has(b.id)) continue;
      const bw = b.w || 1, bh = b.h || 1;
      let hit = false;
      for (let dr = 0; dr < bh && !hit; dr++) {
        for (let dc = 0; dc < bw && !hit; dc++) {
          if (b.col + dc === hitCol && b.row + dr === hitRow) hit = true;
        }
      }
      if (!hit) continue;
      damagedIds.add(b.id);
      const mult = (DAMAGE_TABLE['HERO'] || {})[b.armorType] || 1.0;
      let dmg = Math.round(aoeDmg * mult);
      const defLv = G.globalUpgrades.STRUCTURE_DEFENSE;
      dmg = Math.round(dmg * (1 - defLv * 0.02));
      if (dmg < 1) dmg = 1;
      const bc = getBuildingCenter(b);
      b.hp -= dmg;
      spawnFloatingText(bc.x, bc.y, `-${dmg}`, '#ff8800');
      if (b.hp <= 0) {
        if (b.type === 'NEST') { triggerGameOver(); return; }
        else removeBuilding(b);
      }
    }
  }

  // 플래시 효과: 3개 타일 위치를 직사각형으로 표시
  G.aoeFlashes.push({ tiles: tileHits, life: 0.5, maxLife: 0.5 });
}

/** AoE 플래시 수명 감소 및 만료 제거 */
function updateAoeFlashes(dt) {
  for (const f of G.aoeFlashes) {
    f.life -= dt;
  }
  G.aoeFlashes = G.aoeFlashes.filter(f => f.life > 0);
}

/**
 * 살아있는 적끼리 캡슐 충돌을 해소한다.
 *
 * [공간 분할 방식 — Spatial Hashing]
 * 캔버스를 TILE_SIZE(48px) 격자로 나누고 각 적을 해당 셀에 등록한다.
 * 충돌 검사는 "같은 셀 + 인접 8방향 셀" 안의 적끼리만 수행한다.
 * 최대 충돌 거리(FAST+FAST=41px) < CELL(48px) 이므로 충돌 쌍을 절대 누락하지 않는다.
 * 검사 쌍: O(n²) ~16,110쌍 → 공간 분할 ~1,600쌍 (약 10분의 1 감소)
 *
 * 충돌 해소 규칙:
 *   공격 중인 적 → 위치 고정(비율 0.0), 이동 중인 적이 양보(1.0)
 *   둘 다 이동 중 → 0.5/0.5 동등 분할
 */
function resolveCapsuleCollisions() {
  const living = G.enemies.filter(e => !e.dead);
  if (living.length < 2) return;

  // ── 공격 중 여부 판별 ────────────────────────────────────────────────
  function isAttacking(e) {
    if (!e.targetBldId) return false;
    const target = G.buildings.find(b => b.id === e.targetBldId);
    if (!target) return false;
    const bp   = getBuildingCenter(target);
    const dist = Math.hypot(bp.x - e.x, bp.y - e.y);
    if (dist > e.radius + TILE_SIZE * 0.55) return false;
    return e.attackTimer > (1 / e.attackRate) * 0.1;
  }

  // ── 두 적 사이 충돌 해소 ────────────────────────────────────────────
  function resolvePair(a, b) {
    const minDist = a.radius + b.radius + 1;
    const dx   = b.x - a.x;
    const dy   = b.y - a.y;
    const dist = Math.hypot(dx, dy);
    if (dist >= minDist || dist < 0.001) return;

    const overlap = minDist - dist;
    const nx = dx / dist;
    const ny = dy / dist;

    const aAtt = isAttacking(a);
    const bAtt = isAttacking(b);
    let ratioA, ratioB;
    if      (aAtt && bAtt) { ratioA = 0.0; ratioB = 0.0; }
    else if (aAtt)         { ratioA = 0.0; ratioB = 1.0; }
    else if (bAtt)         { ratioA = 1.0; ratioB = 0.0; }
    else                   { ratioA = 0.5; ratioB = 0.5; }

    const aOldX = a.x, aOldY = a.y;
    const bOldX = b.x, bOldY = b.y;
    a.x -= nx * overlap * ratioA;
    a.y -= ny * overlap * ratioA;
    b.x += nx * overlap * ratioB;
    b.y += ny * overlap * ratioB;

    // 경계 클램핑 — 월드 좌표 기준 (zoom 독립적)
    a.x = Math.max(a.radius, Math.min(COLS * TILE_SIZE - a.radius, a.x));
    a.y = Math.max(a.radius, Math.min(ROWS * TILE_SIZE - a.radius, a.y));
    b.x = Math.max(b.radius, Math.min(COLS * TILE_SIZE - b.radius, b.x));
    b.y = Math.max(b.radius, Math.min(ROWS * TILE_SIZE - b.radius, b.y));

    // 고체 타일(BLOCKED + 건물) 진입 방지 — 분리 push로 벽/건물 너머로 밀려나는 것 차단
    if (hitsSolidTile(a.x, a.y, a.radius)) { a.x = aOldX; a.y = aOldY; }
    if (hitsSolidTile(b.x, b.y, b.radius)) { b.x = bOldX; b.y = bOldY; }
  }

  // ── 공간 분할 그리드 구성 ───────────────────────────────────────────
  const CELL = TILE_SIZE; // 48px — 최대 충돌 거리(41px)보다 크므로 누락 없음
  const grid = new Map();

  for (const e of living) {
    const key = Math.floor(e.x / CELL) * 10000 + Math.floor(e.y / CELL);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(e);
  }

  // ── 쌍 검사: id 대소 비교로 각 쌍을 정확히 1회만 처리 ───────────────
  for (const e of living) {
    const cx = Math.floor(e.x / CELL);
    const cy = Math.floor(e.y / CELL);

    for (let ddx = -1; ddx <= 1; ddx++) {
      for (let ddy = -1; ddy <= 1; ddy++) {
        const neighbors = grid.get((cx + ddx) * 10000 + (cy + ddy));
        if (!neighbors) continue;
        for (const other of neighbors) {
          if (other.id <= e.id) continue; // 중복 처리 방지
          resolvePair(e, other);
        }
      }
    }
  }
}

/**
 * BFS 거리맵 기반 이동/공격 — 모든 적 이동은 이 함수 하나로 처리한다.
 *
 * 매 프레임:
 *   1. 거리맵이 없으면 대기
 *   2. 현재 타겟 건물 유효성 확인
 *   3. 인접 타일에 건물이 있으면 타겟 설정
 *   4. 타겟이 있으면 공격 범위 진입 체크 후 공격/이동
 *   5. 타겟 없으면 거리맵 경사를 따라 이동
 */
function pursueTarget(e, dt) {
  if (!G.nestBuilding || !G.nestBuilding.built) return;
  if (!G.distanceMap) return;

  // 슬로우 타이머는 이동/정지 무관하게 항상 감소한다
  if (e.slowedTimer > 0) {
    e.slowedTimer -= dt;
  }

  // ── 현재 타겟 유효성 확인 ──
  let target = e.targetBldId ? G.buildings.find(b => b.id === e.targetBldId) : null;
  if (target && (target.dead || !target.built)) { target = null; e.targetBldId = null; }

  // ── 타겟이 없으면 건물 탐색 ──
  // 원거리 적: 공격 사거리 내 가장 가까운 건물
  // 근접 적: 인접 타일(맨해튼 거리 ≤ 1) 내 건물
  if (!target) {
    const ec = Math.floor(e.x / TILE_SIZE);
    const er = Math.floor(e.y / TILE_SIZE);
    const scanRange = e.ranged
      ? e.radius + TILE_SIZE * e.rangedTiles
      : TILE_SIZE * 1.5;
    let bestBld = null, bestDist = Infinity;
    for (const b of G.buildings) {
      if (!b.built || b.dead) continue;
      const center = getBuildingCenter(b);
      const d = Math.hypot(e.x - center.x, e.y - center.y);
      if (e.ranged) {
        if (d <= scanRange && d < bestDist) { bestDist = d; bestBld = b; }
      } else {
        const bw = b.w || 1, bh = b.h || 1;
        for (let dr = 0; dr < bh; dr++) {
          for (let dc = 0; dc < bw; dc++) {
            if (Math.abs(ec - (b.col + dc)) + Math.abs(er - (b.row + dr)) <= 1) {
              if (d < bestDist) { bestDist = d; bestBld = b; }
            }
          }
        }
      }
    }
    if (bestBld) {
      target = bestBld;
    }
  }

  // ── 타겟 변경 시 이전 성벽의 attackers에서 제거 ──
  if (target && e.targetBldId !== target.id) {
    const prev = G.buildings.find(b => b.id === e.targetBldId);
    if (prev && prev.attackers) {
      prev.attackers = prev.attackers.filter(id => id !== e.id);
    }
    e.targetBldId = target.id;
  }

  // ── 타겟이 있으면 공격 범위 진입 체크 후 이동/공격 ──
  if (target) {
    const center = getBuildingCenter(target);
    const dx = center.x - e.x;
    const dy = center.y - e.y;
    const dist = Math.hypot(dx, dy);
    const attackRange = e.ranged
      ? e.radius + TILE_SIZE * e.rangedTiles
      : e.radius + TILE_SIZE * 0.55;

    if (dist > attackRange) {
      // 타겟을 향해 이동
      moveToward(e, center.x, center.y, dt);
      return;
    }

    // ── 성벽 용량 확인 (WALL이고 근접 적에만 적용) ──
    if (target.type === 'WALL' && !e.ranged) {
      target.attackers = target.attackers.filter(id => {
        const ae = G.enemies.find(x => x.id === id);
        return ae && !ae.dead;
      });

      const usedCap = target.attackers.reduce((sum, id) => {
        const ae = G.enemies.find(x => x.id === id);
        return ae ? sum + ENEMY_DEFS[ae.type].slotCost : sum;
      }, 0);
      const alreadyIn = target.attackers.includes(e.id);
      const canJoin = usedCap + ENEMY_DEFS[e.type].slotCost <= WALL_MAX_CAPACITY;

      if (!alreadyIn && canJoin) target.attackers.push(e.id);
      if (!alreadyIn && !canJoin) return; // 대기
    }

    // ── 공격 ──
    e.attackTimer -= dt;
    if (e.attackTimer <= 0) {
      e.attackTimer = 1 / e.attackRate;
      if (e.ranged) {
        fireEnemyProjectile(e, target);
      } else {
        let dmg = e.attackDmg;
        {
          const defLv = G.globalUpgrades.STRUCTURE_DEFENSE;
          dmg = Math.round(dmg * (1 - defLv * 0.02));
          if (dmg < 1) dmg = 1; // 최소 1 피해
        }
        target.hp -= dmg;
        const tc = getBuildingCenter(target);
        spawnFloatingText(tc.x, tc.y, `-${dmg}`, '#ff6060');
        if (target.hp <= 0) {
          if (target.type === 'NEST') {
            triggerGameOver();
          } else {
            removeBuilding(target);
            e.targetBldId = null;
          }
        }
      }
    }
    return;
  }

  // ── 타겟 없으면 거리맵 따라 이동 ──
  const ec = Math.floor(e.x / TILE_SIZE);
  const er = Math.floor(e.y / TILE_SIZE);
  const curDist = (er >= 0 && er < ROWS && ec >= 0 && ec < COLS) ? G.distanceMap[er][ec] : Infinity;

  if (curDist === 0) {
    // NEST 위에 도달 — NEST 공격
    if (G.nestBuilding) { e.targetBldId = G.nestBuilding.id; }
    return;
  }

  // 인접 4칸 중 거리가 가장 작은 방향으로 이동
  let bestDir = null, bestVal = curDist;
  for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    const nc = ec + dc, nr = er + dr;
    if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
    if (G.distanceMap[nr][nc] < bestVal) {
      bestVal = G.distanceMap[nr][nc];
      bestDir = { x: (nc + 0.5) * TILE_SIZE, y: (nr + 0.5) * TILE_SIZE };
    }
  }

  if (bestDir) {
    moveToward(e, bestDir.x, bestDir.y, dt);
  } else {
    // fallback: NEST 방향으로 직선 이동
    if (G.nestBuilding) {
      const nc = getBuildingCenter(G.nestBuilding);
      moveToward(e, nc.x, nc.y, dt);
    }
  }
}

function updateTowers(dt) {
  const livingEnemies = G.enemies.filter(e => !e.dead);
  if (livingEnemies.length === 0) return;

  for (const b of G.buildings) {
    if (!b.built) continue;
    if (b.type !== 'THORN' && b.type !== 'SPORE' && b.type !== 'BALLISTA') continue;

    // ── BALLISTA: ranged 적 우선 타겟팅 ──────────────────────────────────────
    if (b.type === 'BALLISTA') {
      const lv = b.level - 1;
      const rangePixels = BALLISTA_STATS.range[lv] * TILE_SIZE;
      const bpx = getBuildingCenter(b);
      G.towerTimers[b.id] = (G.towerTimers[b.id] || 0) - dt;
      if (G.towerTimers[b.id] > 0) continue;

      // 1순위: MAGE / ARCHER 우선
      let target = null, bestDist = Infinity;
      for (const e of livingEnemies) {
        if (e.type !== 'MAGE' && e.type !== 'ARCHER') continue;
        const d = Math.hypot(e.x - bpx.x, e.y - bpx.y);
        if (d <= rangePixels && d < bestDist) { bestDist = d; target = e; }
      }
      // 2순위: 일반 적 fallback
      if (!target) {
        bestDist = Infinity;
        for (const e of livingEnemies) {
          const d = Math.hypot(e.x - bpx.x, e.y - bpx.y);
          if (d <= rangePixels && d < bestDist) { bestDist = d; target = e; }
        }
      }

      // 타겟 없어도 타이머 리셋 — 다음 프레임에 즉시 재탐색하지 않도록
      G.towerTimers[b.id] = 1 / BALLISTA_STATS.fireRate[lv];
      if (!target) continue;

      const towerBoostLv = G.globalUpgrades.TOWER_BOOST;
      const ballistaDmg  = Math.round(BALLISTA_STATS.damage[lv] * (1 + towerBoostLv * 0.03));
      const ballistaRate = BALLISTA_STATS.fireRate[lv] * (1 + towerBoostLv * 0.02);
      G.towerTimers[b.id] = 1 / ballistaRate;
      fireProjectile(b, target, bpx, ballistaDmg, BALLISTA_STATS.attackType);
      continue;
    }
    // ─────────────────────────────────────────────────────────────────────────

    G.towerTimers[b.id] = (G.towerTimers[b.id] || 0) - dt;
    if (G.towerTimers[b.id] > 0) continue;

    const lv    = b.level - 1;
    const stats = b.type === 'THORN' ? THORN_STATS : SPORE_STATS;
    const rangePixels = stats.range[lv] * TILE_SIZE;
    const bpx = getBuildingCenter(b);

    let target   = null;
    let bestDist = Infinity;

    for (const e of livingEnemies) {
      const d = Math.hypot(e.x - bpx.x, e.y - bpx.y);
      if (d <= rangePixels && d < bestDist) {
        bestDist = d;
        target   = e;
      }
    }

    if (target) {
      const attackType = stats.attackType;
      const mult       = (DAMAGE_TABLE[attackType] || {})[target.armorType] || 1.0;

      // TOWER_BOOST: 모든 공격 타워 공격력 +3%/lv, 발사속도 +2%/lv
      const towerBoostLv    = G.globalUpgrades.TOWER_BOOST;
      const effectiveDamage   = Math.round(stats.damage[lv] * (1 + towerBoostLv * 0.03) * mult);
      const effectiveFireRate = stats.fireRate[lv] * (1 + towerBoostLv * 0.02);
      fireProjectile(b, target, bpx, effectiveDamage, attackType);
      G.towerTimers[b.id] = 1 / effectiveFireRate;
    }
  }
}

function fireProjectile(building, target, towerPixel, damage, attackType) {
  const dx   = target.x - towerPixel.x;
  const dy   = target.y - towerPixel.y;
  const dist = Math.hypot(dx, dy);
  const spd  = building.type === 'SPORE'     ? SPORE_STATS.projSpeed
             : building.type === 'BALLISTA'  ? BALLISTA_STATS.projSpeed
             : THORN_STATS.projSpeed;
  const isHoming = building.type === 'THORN'; // 촉수 투사체만 유도

  G.projectiles.push({
    id:           G.nextId++,
    x:            towerPixel.x,
    y:            towerPixel.y,
    vx:           (dx / dist) * spd,
    vy:           (dy / dist) * spd,
    speed:        spd,
    damage,
    targetId:     target.id,
    homing:       isHoming,
    attackType,
    fromBallista: building.type === 'BALLISTA',
  });
}

function fireEnemyProjectile(enemy, target) {
  const tp   = getBuildingCenter(target);
  const dx   = tp.x - enemy.x;
  const dy   = tp.y - enemy.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return;
  const spd = ENEMY_DEFS[enemy.type].projSpeed || 150; // px/s
  G.enemyProjectiles.push({
    id:          G.nextId++,
    x:           enemy.x,
    y:           enemy.y,
    vx:          (dx / dist) * spd,
    vy:          (dy / dist) * spd,
    damage:      enemy.attackDmg,
    attackType:  enemy.attackType,
    targetBldId: target.id,
  });
}

function updateProjectiles(dt) {
  const toRemove = [];

  for (const p of G.projectiles) {
    // 유도 투사체 — 타겟 방향으로 속도 벡터 갱신
    if (p.homing) {
      const ht = G.enemies.find(e => e.id === p.targetId && !e.dead);
      if (ht) {
        const hdx = ht.x - p.x;
        const hdy = ht.y - p.y;
        const hd  = Math.hypot(hdx, hdy);
        if (hd > 1) {
          p.vx = (hdx / hd) * p.speed;
          p.vy = (hdy / hd) * p.speed;
        }
      }
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // 목표 적 추적 히트 판정
    const target = G.enemies.find(e => e.id === p.targetId && !e.dead);
    if (target) {
      const d = Math.hypot(p.x - target.x, p.y - target.y);
      if (d < target.radius + 4) {
        target.hp -= p.damage;
        spawnFloatingText(target.x, target.y - target.radius, `-${p.damage}`, '#ffff60');
        // ACID 투사체 — 범위 피해 + 슬로우 디버프
        if (p.attackType === 'ACID') {
          const sporeLv = G.globalUpgrades.TOWER_BOOST;
          const splashPx = SPORE_STATS.splashRadius * TILE_SIZE;
          // 명중 대상에 슬로우
          target.slowedTimer = SPORE_STATS.slowDuration * (1 + sporeLv * 0.05);
          target.slowAmount  = SPORE_STATS.slowAmount;
          // 범위 내 다른 적에게도 피해 + 슬로우
          for (const other of G.enemies) {
            if (other.dead || other.id === target.id) continue;
            const sd = Math.hypot(p.x - other.x, p.y - other.y);
            if (sd <= splashPx) {
              const splashDmg = Math.round(p.damage * 0.5);
              other.hp -= splashDmg; // 범위 피해 50%
              spawnFloatingText(other.x, other.y - other.radius, `-${splashDmg}`, '#c0e030');
              other.slowedTimer = SPORE_STATS.slowDuration * (1 + sporeLv * 0.05);
              other.slowAmount  = SPORE_STATS.slowAmount;
              if (other.hp <= 0) {
                other.dead = true;
                G.resource += other.reward;
              }
            }
          }
        }
        if (target.hp <= 0) {
          target.dead = true;
          G.resource += target.reward; // 처치 보상
          if (target.type === 'NOVICE_HERO') {
            G.bossDefeated = true;
            triggerVictory();
          }
        }
        toRemove.push(p.id);
      }
    } else {
      // 타겟이 죽었으면 유도 해제, 직선으로 계속 날아감
      p.homing = false;
      // 경로 상 다른 적과 충돌 판정
      for (const e of G.enemies) {
        if (e.dead) continue;
        const d = Math.hypot(p.x - e.x, p.y - e.y);
        if (d < e.radius + 4) {
          e.hp -= p.damage;
          spawnFloatingText(e.x, e.y - e.radius, `-${p.damage}`, '#ffff60');
          if (p.attackType === 'ACID') {
            const sporeLv = G.globalUpgrades.TOWER_BOOST;
            const splashPx = SPORE_STATS.splashRadius * TILE_SIZE;
            e.slowedTimer = SPORE_STATS.slowDuration * (1 + sporeLv * 0.05);
            e.slowAmount  = SPORE_STATS.slowAmount;
            for (const other of G.enemies) {
              if (other.dead || other.id === e.id) continue;
              const sd = Math.hypot(p.x - other.x, p.y - other.y);
              if (sd <= splashPx) {
                const splashDmg = Math.round(p.damage * 0.5);
                other.hp -= splashDmg;
                spawnFloatingText(other.x, other.y - other.radius, `-${splashDmg}`, '#c0e030');
                other.slowedTimer = SPORE_STATS.slowDuration * (1 + sporeLv * 0.05);
                other.slowAmount  = SPORE_STATS.slowAmount;
                if (other.hp <= 0) { other.dead = true; G.resource += other.reward; }
              }
            }
          }
          if (e.hp <= 0) {
            e.dead = true;
            G.resource += e.reward;
            if (e.type === 'NOVICE_HERO') {
              G.bossDefeated = true;
              triggerVictory();
            }
          }
          toRemove.push(p.id);
          break;
        }
      }
    }

    // 월드 밖 투사체 제거 (zoom 독립적) — 여유 범위 포함
    const margin = TILE_SIZE * 2;
    if (p.x < -margin || p.x > COLS * TILE_SIZE + margin || p.y < -margin || p.y > ROWS * TILE_SIZE + margin) {
      toRemove.push(p.id);
    }
  }

  if (toRemove.length > 0) {
    const removeSet = new Set(toRemove);
    G.projectiles = G.projectiles.filter(p => !removeSet.has(p.id));
  }
}

function updateResourceBuildings(dt) {
  for (const b of G.buildings) {
    // RESOURCE 건물 생산
    if (b.type === 'RESOURCE' && b.built) {
      G.resourceTimers[b.id] = (G.resourceTimers[b.id] || RESOURCE_STATS.interval) - dt;
      if (G.resourceTimers[b.id] <= 0) {
        const rbLv       = G.globalUpgrades.RESOURCE_BOOST;
        const baseAmount = Math.round(RESOURCE_STATS.amount * Math.pow(1.5, b.level - 1));
        let   amount     = Math.round(baseAmount * (1 + rbLv * 0.03));
        if (G.adBuff.active) amount *= 2;
        G.resource += amount;
        G.resourceTimers[b.id] = RESOURCE_STATS.interval;
        spawnFloatText(b, amount);
      }
    }
    // NEST 자원 생산 — 레벨별 생산량 증가
    if (b.type === 'NEST' && b.built && !b.upgrading) {
      G.resourceTimers[b.id] = (G.resourceTimers[b.id] || NEST_RESOURCE_INTERVAL) - dt;
      if (G.resourceTimers[b.id] <= 0) {
        let nestAmt = NEST_RESOURCE_AMOUNT[b.level - 1] || NEST_RESOURCE_AMOUNT[0];
        if (G.adBuff.active) nestAmt *= 2;
        G.resource += nestAmt;
        G.resourceTimers[b.id] = NEST_RESOURCE_INTERVAL;
        spawnFloatText(b, nestAmt);
      }
    }
  }
}

/**
 * 자가 수리 업그레이드 활성화 시 HEAL_INTERVAL마다 모든 완성 건물 HP 회복.
 * 치유량은 NEST 레벨에 따라 증가: Lv.1=8, Lv.2=12, Lv.3=16 (HEAL_AMOUNT + (nestLv-1)*4)
 */
function updateRepair(dt) {
  if (G.globalUpgrades.SELF_REPAIR <= 0) return;
  G.repairTimer -= dt;
  if (G.repairTimer <= 0) {
    G.repairTimer = HEAL_INTERVAL;
    const srLv   = G.globalUpgrades.SELF_REPAIR;
    const nestLv = (G.nestBuilding && G.nestBuilding.built) ? G.nestBuilding.level : 1;
    const healAmt = (8 + srLv * 4) + (nestLv - 1) * 4;
    for (const b of G.buildings) {
      if (b.built) {
        b.hp = Math.min(b.hpMax, b.hp + healAmt);
      }
    }
  }
}

/**
 * REPAIR 건물의 범위 수리 처리.
 * 매 프레임 범위 내 건설 완료된 모든 건물을 healPerSec * dt만큼 회복한다.
 */
function updateRepairBuildings(dt) {
  for (const b of G.buildings) {
    if (b.type !== 'REPAIR' || !b.built || b.upgrading) continue;
    const lv     = b.level - 1;
    const radius = REPAIR_STATS.range[lv] * TILE_SIZE;
    const healAmt = REPAIR_STATS.healPerSec[lv] * dt;
    const bc = getBuildingCenter(b);
    for (const target of G.buildings) {
      if (target === b || !target.built) continue;
      const tc = getBuildingCenter(target);
      const dx = tc.x - bc.x;
      const dy = tc.y - bc.y;
      if (Math.sqrt(dx * dx + dy * dy) <= radius) {
        target.hp = Math.min(target.hpMax, target.hp + healAmt);
      }
    }
  }
}

/**
 * 적 원거리 투사체 업데이트.
 * 건물 타겟에 도달하면 피해를 입히고 제거한다.
 * STRUCTURE 방어는 배율표에서 1.0이므로 attackDmg 그대로 적용.
 */
function updateEnemyProjectiles(dt) {
  const toRemove = [];
  for (const p of G.enemyProjectiles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    const target = G.buildings.find(b => b.id === p.targetBldId);
    if (target) {
      const tp = getBuildingCenter(target);
      const d  = Math.hypot(p.x - tp.x, p.y - tp.y);
      if (d < TILE_SIZE * 0.6) {
        let dmg = p.damage;
        {
          const defLv = G.globalUpgrades.STRUCTURE_DEFENSE;
          dmg = Math.round(dmg * (1 - defLv * 0.02));
          if (dmg < 1) dmg = 1;
        }
        target.hp -= dmg;
        const btc = getBuildingCenter(target);
        spawnFloatingText(btc.x, btc.y, `-${dmg}`, '#ff6060');
        if (target.hp <= 0) {
          if (target.type === 'NEST') triggerGameOver();
          else removeBuilding(target);
        }
        toRemove.push(p.id);
      }
    } else {
      toRemove.push(p.id);
    }

    // 월드 밖 제거
    if (p.x < 0 || p.x > COLS * TILE_SIZE || p.y < 0 || p.y > ROWS * TILE_SIZE) {
      toRemove.push(p.id);
    }
  }
  if (toRemove.length > 0) {
    const s = new Set(toRemove);
    G.enemyProjectiles = G.enemyProjectiles.filter(p => !s.has(p.id));
  }
}

function triggerGameOver() {
  // 여러 적이 같은 프레임에 도달했을 때 중복 호출 방지
  if (G.state === STATE.GAME_OVER) return;
  G.state = STATE.GAME_OVER;
  setTimeout(() => {
    showOverlay(
      '게임 오버',
      '핵심 둥지가 파괴되었습니다.<br>인간 병사들에게 영토를 빼앗겼습니다.',
      '다시 시작'
    );
  }, 800);
}


// ── 17. 건물 정보/관리 패널 UI ────────────────────────────────────────────────

const buildingPanel    = document.getElementById('building-panel');
const bpIcon           = document.getElementById('bp-icon');
const bpName           = document.getElementById('bp-name');
const bpClose          = document.getElementById('bp-close');
const bpStats          = document.getElementById('bp-stats');
const bpActions        = document.getElementById('bp-actions');

// HP 표시 전용 element — 매 프레임 textContent만 갱신해 DOM 재생성 비용 방지
let bpHpEl = null;

bpClose.addEventListener('click', () => closeBuildingPanel());

/**
 * 건물 정보 패널을 열고 내용을 채운다.
 * 선택된 건물 id를 G.selectedBuildingId에 저장하며,
 * 배치 모드를 비활성화한다.
 */
function openBuildingPanel(building) {
  G.selectedBuildingId = building.id;
  G.selectedBuild = null; // 배치 모드 비활성화
  // 건설 모드 비활성화
  buildModeActive = false;
  _updateBuildBtnActive();
  closeRadialMenu();
  updateBuildPanel();

  const def = BUILDING_DEFS[building.type];

  bpIcon.textContent = def.icon;
  bpName.textContent = def.name;

  // 상태 문자열
  const maxLv = building.type === 'WALL' ? 30 : building.type === 'NEST' ? 3 : 5;
  const isLevelBased = ['THORN', 'SPORE', 'REPAIR', 'WALL', 'NEST', 'RESOURCE', 'BALLISTA'].includes(building.type);

  let statusStr = '';
  if (!building.built) {
    statusStr = `<span style="color:#e0e040">건설 중 (${Math.ceil(building.buildTimer)}s)</span>`;
  } else if (building.upgrading) {
    statusStr = `<span style="color:#4080e0">업그레이드 중 (${Math.ceil(building.upgradeTimer)}s)</span>`;
  } else if (isLevelBased) {
    // 레벨 기반 건물: 레벨 표시
    const lvLabel = building.level >= maxLv
      ? `<span style="color:#ffd700">Lv.${building.level} (최대)</span>`
      : `<span style="color:#9090b0">Lv.${building.level}</span>`;
    statusStr = lvLabel;
  } else {
    statusStr = `<span style="color:#9090b0">완료</span>`;
  }

  // 유형별 스펙 — 기본값 + 보너스값 형태로 표시
  const _defLv = G.globalUpgrades.STRUCTURE_DEFENSE;
  const _defStr = _defLv > 0 ? ` | 피해감소: ${_defLv * 2}%` : '';

  let specStr = '';
  if (building.type === 'THORN') {
    const lv = (building.level || 1) - 1;
    const thornBoostLv = G.globalUpgrades.TOWER_BOOST;
    const baseDmg = THORN_STATS.damage[lv];
    const bonusDmg = Math.round(baseDmg * thornBoostLv * 0.03);
    const dmgStr = bonusDmg > 0 ? `${baseDmg}+${bonusDmg}` : `${baseDmg}`;
    const baseRate = THORN_STATS.fireRate[lv];
    const bonusRate = +(baseRate * thornBoostLv * 0.02).toFixed(2);
    const rateStr = bonusRate > 0 ? `${baseRate}+${bonusRate}` : `${baseRate}`;
    specStr = `공격력: ${dmgStr} | 사거리: ${THORN_STATS.range[lv]}타일 | 속도: ${rateStr}/s${_defStr}`;
  } else if (building.type === 'SPORE') {
    const lv = (building.level || 1) - 1;
    const sporeBoostLv = G.globalUpgrades.TOWER_BOOST;
    const baseDmg = SPORE_STATS.damage[lv];
    const bonusDmg = Math.round(baseDmg * sporeBoostLv * 0.03);
    const dmgStr = bonusDmg > 0 ? `${baseDmg}+${bonusDmg}` : `${baseDmg}`;
    const baseSlowDur = SPORE_STATS.slowDuration;
    const bonusSlowDur = +(baseSlowDur * sporeBoostLv * 0.05).toFixed(1);
    const slowStr = bonusSlowDur > 0 ? `30%/${baseSlowDur}+${bonusSlowDur}s` : `30%/${baseSlowDur}s`;
    specStr = `공격력: ${dmgStr} | 사거리: ${SPORE_STATS.range[lv]}타일 | 슬로우: ${slowStr}${_defStr}`;
  } else if (building.type === 'REPAIR') {
    const lv = (building.level || 1) - 1;
    const baseHeal = REPAIR_STATS.healPerSec[lv];
    specStr = `범위: ${REPAIR_STATS.range[lv]}타일 | 수리: ${baseHeal}HP/s${_defStr}`;
  } else if (building.type === 'WALL') {
    specStr = `Lv.${building.level} | HP: ${building.hpMax} | 최대 공격자: ${WALL_MAX_CAPACITY}슬롯${_defStr}`;
  } else if (building.type === 'RESOURCE') {
    const rbLv = G.globalUpgrades.RESOURCE_BOOST;
    const baseAmt = Math.round(RESOURCE_STATS.amount * Math.pow(1.5, building.level - 1));
    const bonusAmt = Math.round(baseAmt * rbLv * 0.03);
    const amtStr = bonusAmt > 0 ? `${baseAmt}+${bonusAmt}` : `${baseAmt}`;
    specStr = `Lv.${building.level} | 생산량: ${amtStr} | 생산 간격: ${RESOURCE_STATS.interval}s${_defStr}`;
  } else if (building.type === 'BALLISTA') {
    const lv = (building.level || 1) - 1;
    const balBoostLv = G.globalUpgrades.TOWER_BOOST;
    const balBaseDmg = BALLISTA_STATS.damage[lv];
    const balBonusDmg = Math.round(balBaseDmg * balBoostLv * 0.03);
    const balDmgStr = balBonusDmg > 0 ? `${balBaseDmg}+${balBonusDmg}` : `${balBaseDmg}`;
    specStr = `공격력: ${balDmgStr} | 사거리: ${BALLISTA_STATS.range[lv]}타일 | 속도: ${BALLISTA_STATS.fireRate[lv]}/s | 원거리 우선${_defStr}`;
  } else if (building.type === 'NEST') {
    specStr = `거점 건물 — 파괴 시 게임 오버${_defStr}`;
  }

  // bpStats 내부 구성
  bpStats.innerHTML = `
    <div>상태: ${statusStr}</div>
    <div id="bp-hp-line">HP: <span id="bp-hp-val">${building.hp}</span> / ${building.hpMax}</div>
    <div>${specStr}</div>
  `;
  bpHpEl = document.getElementById('bp-hp-val');

  // bpActions 구성
  bpActions.innerHTML = '';

  if (building.type === 'NEST') {
    // NEST: 건물 레벨 업그레이드 버튼 (3레벨 상한)
    const nestUpgBtn = document.createElement('button');
    nestUpgBtn.className = 'bp-btn upgrade';
    if (building.level >= 3) {
      nestUpgBtn.textContent = '최대 레벨 (Lv.3)';
      nestUpgBtn.classList.add('disabled');
    } else if (building.upgrading) {
      nestUpgBtn.textContent = `진화 중... (${Math.ceil(building.upgradeTimer)}s)`;
      nestUpgBtn.classList.add('disabled');
    } else if (!building.built) {
      const cost = def.upgradeCost[building.level - 1];
      const time = def.upgradeTime[building.level - 1];
      nestUpgBtn.textContent = `Lv.${building.level + 1}로 진화 (${cost}자원 / ${time}s)`;
      nestUpgBtn.classList.add('disabled');
    } else {
      const cost = def.upgradeCost[building.level - 1];
      const time = def.upgradeTime[building.level - 1];
      nestUpgBtn.textContent = `Lv.${building.level + 1}로 진화 (${cost}자원 / ${time}s)`;
      nestUpgBtn.dataset.cost = cost;
      if (G.resource < cost) nestUpgBtn.classList.add('disabled');
      nestUpgBtn.addEventListener('click', () => {
        if (startUpgrade(building)) {
          openBuildingPanel(building);
        } else {
          showStatus('업그레이드 불가: 자원 부족 또는 조건 미충족');
        }
      });
    }
    bpActions.appendChild(nestUpgBtn);

    // 글로벌 업그레이드 섹션 헤더
    const secHeader = document.createElement('div');
    secHeader.style.cssText = 'font-size:11px;color:#7070a0;margin-top:4px;width:100%';
    secHeader.textContent = '── 글로벌 업그레이드 ──';
    bpActions.appendChild(secHeader);

    // 방벽 업그레이드 묶음 (방어력 + 강화)를 한 줄에 표시
    const STRUCTURE_UPG_IDS = ['STRUCTURE_DEFENSE', 'STRUCTURE_FORTIFY'];

    for (const upg of GLOBAL_UPGRADES) {
      // 방벽 업그레이드는 아래에서 묶어서 표시
      if (STRUCTURE_UPG_IDS.includes(upg.id)) continue;

      const curLv = G.globalUpgrades[upg.id];
      const btn = document.createElement('button');
      btn.className = 'bp-btn upgrade';

      if (curLv >= upg.maxLv) {
        btn.textContent = `${upg.icon} ${upg.name} Lv.${curLv} (최대)`;
        btn.classList.add('disabled');
      } else {
        const cost     = upg.cost[curLv];
        const canAfford = G.resource >= cost;
        btn.textContent = `${upg.icon} ${upg.name} Lv.${curLv}→${curLv + 1} (${cost}자원)`;
        btn.title = `현재: ${upg.effectDesc(curLv)}\n다음: ${upg.effectDesc(curLv + 1)}`;
        btn.dataset.cost = cost;
        if (!canAfford) btn.classList.add('disabled');
        btn.addEventListener('click', () => {
          if (G.globalUpgrades[upg.id] >= upg.maxLv) return;
          const c = upg.cost[G.globalUpgrades[upg.id]];
          if (G.resource < c) { showStatus('자원 부족'); return; }
          G.resource -= c;
          G.globalUpgrades[upg.id]++;
          if (upg.id === 'SELF_REPAIR' && G.globalUpgrades.SELF_REPAIR === 1) {
            G.repairTimer = HEAL_INTERVAL;
          }
          updateHUD();
          openBuildingPanel(building);
        });
      }
      bpActions.appendChild(btn);
    }

    // ── 방벽 업그레이드 묶음 (나란히 표시) ──
    const wallHeader = document.createElement('div');
    wallHeader.style.cssText = 'font-size:11px;color:#7070a0;margin-top:4px;width:100%';
    wallHeader.textContent = '── 방벽 업그레이드 ──';
    bpActions.appendChild(wallHeader);

    const wallRow = document.createElement('div');
    wallRow.style.cssText = 'display:flex;gap:6px;width:100%';

    for (const uid of STRUCTURE_UPG_IDS) {
      const upg = GLOBAL_UPGRADES.find(u => u.id === uid);
      if (!upg) continue;
      const curLv = G.globalUpgrades[upg.id];
      const btn = document.createElement('button');
      btn.className = 'bp-btn upgrade';
      btn.style.flex = '1';

      if (curLv >= upg.maxLv) {
        btn.textContent = `${upg.icon} ${upg.name} Lv.${curLv} (최대)`;
        btn.classList.add('disabled');
      } else {
        const cost = upg.cost[curLv];
        const canAfford = G.resource >= cost;
        btn.textContent = `${upg.icon} ${upg.name} Lv.${curLv}→${curLv+1} (${cost})`;
        btn.title = `현재: ${upg.effectDesc(curLv)}\n다음: ${upg.effectDesc(curLv+1)}`;
        btn.dataset.cost = cost;
        if (!canAfford) btn.classList.add('disabled');
        btn.addEventListener('click', () => {
          if (G.globalUpgrades[upg.id] >= upg.maxLv) return;
          const c = upg.cost[G.globalUpgrades[upg.id]];
          if (G.resource < c) { showStatus('자원 부족'); return; }
          G.resource -= c;
          G.globalUpgrades[upg.id]++;
          if (upg.id === 'STRUCTURE_FORTIFY') recalcStructureHp();
          updateHUD();
          openBuildingPanel(building);
        });
      }
      wallRow.appendChild(btn);
    }
    bpActions.appendChild(wallRow);
  } else {
    // 진화 버튼 (NEST 제외) — 모든 건물이 레벨 배열 기반
    if (def.upgradeCost) {
      const upgBtn = document.createElement('button');
      upgBtn.className = 'bp-btn upgrade';

      if (building.level >= maxLv) {
        upgBtn.textContent = `최대 레벨 (Lv.${maxLv})`;
        upgBtn.classList.add('disabled');
      } else if (building.upgrading) {
        upgBtn.textContent = `진화 중... (${Math.ceil(building.upgradeTimer)}s)`;
        upgBtn.classList.add('disabled');
      } else if (!building.built) {
        const cost = def.upgradeCost[building.level - 1];
        const time = def.upgradeTime[building.level - 1];
        upgBtn.textContent = `Lv.${building.level + 1}로 진화 (${cost}자원 / ${time}s)`;
        upgBtn.classList.add('disabled');
      } else {
        const cost = def.upgradeCost[building.level - 1];
        const time = def.upgradeTime[building.level - 1];
        upgBtn.textContent = `Lv.${building.level + 1}로 진화 (${cost}자원 / ${time}s)`;
        upgBtn.dataset.cost = cost;
        if (G.resource < cost) upgBtn.classList.add('disabled');
        upgBtn.addEventListener('click', () => {
          if (startUpgrade(building)) {
            openBuildingPanel(building);
          } else {
            showStatus('업그레이드 불가: 자원 부족 또는 조건 미충족');
          }
        });
      }
      bpActions.appendChild(upgBtn);
    }

  }

  // 철거 버튼 (NEST 제외)
  if (building.type !== 'NEST') {
    const delBtn = document.createElement('button');
    delBtn.className = 'bp-btn demolish';
    const refundRate = building.built ? 0.5 : 1.0;
    const refund     = Math.floor(def.cost * refundRate);
    delBtn.textContent = `철거 (${refund}자원 환불)`;
    delBtn.addEventListener('click', () => {
      G.resource += refund;
      removeBuilding(building);
      updateBuildPanel();
    });
    bpActions.appendChild(delBtn);
  }

  buildingPanel.classList.remove('hidden');
}

/**
 * 건물 정보 패널을 닫는다.
 */
function closeBuildingPanel() {
  G.selectedBuildingId = null;
  bpHpEl = null;
  if (buildingPanel) buildingPanel.classList.add('hidden');
  updateBuildPanel();
}

/**
 * 매 프레임 HP 갱신 + 버튼 disabled 상태 실시간 토글.
 * openBuildingPanel에서 생성한 #bp-hp-val element를 직접 참조한다.
 * data-cost 속성이 있는 버튼은 G.resource와 비교하여 disabled를 토글한다.
 */
function tickBuildingPanelHP() {
  if (!G.selectedBuildingId || !bpHpEl) return;
  const b = G.buildings.find(b => b.id === G.selectedBuildingId);
  if (!b) return;
  bpHpEl.textContent = b.hp;

  // data-cost가 있는 버튼의 disabled 클래스를 실시간 토글
  const costBtns = bpActions.querySelectorAll('.bp-btn[data-cost]');
  for (const btn of costBtns) {
    const cost = parseInt(btn.dataset.cost, 10);
    const shouldDisable = G.resource < cost;
    if (shouldDisable && !btn.classList.contains('disabled')) {
      btn.classList.add('disabled');
    } else if (!shouldDisable && btn.classList.contains('disabled')) {
      btn.classList.remove('disabled');
    }
  }
}


// ── 건설 트리거 바 + 원형 메뉴 시스템 ─────────────────────────────────────────

// 건물 그룹 정의 (NEST는 제외 — 기능 3에서 별도 처리)
// 그룹 0: 방어/지원,  그룹 1: 공격 타워
const BUILD_GROUPS = Object.freeze([
  [
    { key: 'WALL',     label: '성벽' },
    { key: 'REPAIR',   label: '수리' },
    { key: 'RESOURCE', label: '자원' },
  ],
  [
    { key: 'THORN',    label: '가시촉수' },
    { key: 'SPORE',    label: '산성포자' },
    { key: 'BALLISTA', label: '외골격가시' },
  ],
]);

const buildTriggerBar  = document.getElementById('build-trigger-bar');
const buildDefenseBtn  = document.getElementById('build-defense-btn');
const buildAttackBtn   = document.getElementById('build-attack-btn');
const radialMenu       = document.getElementById('radial-menu');

// 건설 모드 활성화 상태
let buildModeActive  = false;
let activeBuildGroup = 0; // 0=방어/지원, 1=공격

function _updateBuildBtnActive() {
  buildDefenseBtn.classList.toggle('active', buildModeActive && activeBuildGroup === 0);
  buildAttackBtn.classList.toggle('active',  buildModeActive && activeBuildGroup === 1);
}

function _handleBuildBtnClick(groupIdx) {
  if (G.state !== STATE.PREP && G.state !== STATE.COUNTDOWN && G.state !== STATE.WAVE) return;
  if (!G.nestBuilding || !G.nestBuilding.built) {
    showStatus('먼저 핵심 둥지를 건설하세요.');
    return;
  }
  if (buildModeActive && activeBuildGroup === groupIdx) {
    // 같은 버튼 재클릭 → 건설 모드 종료
    deactivateBuildMode();
  } else {
    // 다른 그룹 전환 또는 신규 활성화
    activeBuildGroup = groupIdx;
    buildModeActive  = true;
    closeRadialMenu();
    setSelectedBuild(null);
    _updateBuildBtnActive();
    dirtyTerrain();
  }
}

buildDefenseBtn.addEventListener('click', () => _handleBuildBtnClick(0));
buildAttackBtn.addEventListener('click',  () => _handleBuildBtnClick(1));

function toggleBuildMode() {
  // 하위 호환 — 현재 activeBuildGroup 기준으로 토글
  if (buildModeActive) {
    deactivateBuildMode();
  } else {
    buildModeActive = true;
    _updateBuildBtnActive();
    dirtyTerrain();
  }
}

function deactivateBuildMode() {
  buildModeActive = false;
  _updateBuildBtnActive();
  dirtyTerrain();
  setSelectedBuild(null);
  closeRadialMenu();
}

/**
 * 화면 좌표(clientX, clientY)에 radial menu를 표시한다.
 * 시계방향으로 건물 아이콘을 배치한다 (12시 시작).
 */
function openRadialMenu(clientX, clientY, col, row) {
  const items = BUILD_GROUPS[activeBuildGroup];
  radialMenu.innerHTML = '';
  radialMenu.classList.remove('hidden');

  // 반경 (아이콘 중심까지의 거리)
  const radius = 55;
  // 시작 각도: -90도(12시 방향), 시계방향으로 분배
  const startAngle = -Math.PI / 2;
  const step = (2 * Math.PI) / items.length;

  // 메뉴 표시 위치: game-container 기준 좌표
  const container = document.getElementById('game-container');
  const containerRect = container.getBoundingClientRect();
  const cx = clientX - containerRect.left;
  const cy = clientY - containerRect.top;

  for (let i = 0; i < items.length; i++) {
    const { key } = items[i];
    const def = BUILDING_DEFS[key];
    const angle = startAngle + step * i;
    const ix = cx + Math.cos(angle) * radius;
    const iy = cy + Math.sin(angle) * radius;

    const el = document.createElement('div');
    el.className = 'radial-item';
    el.innerHTML = `<span class="ri-icon">${def.icon}</span><span class="ri-cost">${def.cost}</span>`;
    el.style.left = ix + 'px';
    el.style.top  = iy + 'px';

    if (G.resource < def.cost) {
      el.classList.add('insufficient');
    }

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (G.resource < def.cost) {
        showStatus('자원이 부족합니다!');
        closeRadialMenu();
        return;
      }
      // NEST 레벨별 자원 건물 개수 제한 체크
      if (key === 'RESOURCE' && G.nestBuilding) {
        const nestLv = G.nestBuilding.level || 1;
        const maxRes = NEST_BUILD_CAP[nestLv - 1] || 5;
        const currentRes = G.buildings.filter(b => b.type === 'RESOURCE').length;
        if (currentRes >= maxRes) {
          showStatus(`자원 건물 최대 ${maxRes}개 (둥지 Lv.${nestLv})`);
          closeRadialMenu();
          return;
        }
      }
      G.resource -= def.cost;
      createBuilding(key, col, row);
      closeRadialMenu();
      updateHUD();
    });

    radialMenu.appendChild(el);

    // 애니메이션: 약간의 딜레이 후 표시
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.classList.add('show');
      });
    });
  }

  // radial menu 저장 (다른 곳 클릭 시 닫기 위해)
  G._radialOpen = true;
  G._radialCol  = col;
  G._radialRow  = row;
}

function closeRadialMenu() {
  radialMenu.classList.add('hidden');
  radialMenu.innerHTML = '';
  G._radialOpen = false;
}

/**
 * 건물 클릭 시 radial menu를 표시한다.
 * NEST: 진화 + 정보 (2개), 일반: 진화 + 철거 + 정보 (3개)
 */
function openBuildingRadialMenu(clientX, clientY, building) {
  radialMenu.innerHTML = '';
  radialMenu.classList.remove('hidden');
  closeBuildingPanel();
  G.selectedBuildingId = building.id; // 범위 원 표시용

  const def = BUILDING_DEFS[building.type];
  const maxLv = building.type === 'WALL' ? 30 : building.type === 'NEST' ? 3 : 5;
  const isNest = building.type === 'NEST';

  // 액션 목록 구성
  const actions = [];

  // 진화 액션
  const atMax = building.level >= maxLv;
  const upgCost = atMax ? null : def.upgradeCost[building.level - 1];
  let upgradeLabel = '';
  let upgradeDisabled = false;
  if (atMax) {
    upgradeLabel = 'MAX';
    upgradeDisabled = true;
  } else if (building.upgrading) {
    upgradeLabel = `${Math.ceil(building.upgradeTimer)}s`;
    upgradeDisabled = true;
  } else if (!building.built) {
    upgradeLabel = `${upgCost}`;
    upgradeDisabled = true;
  } else {
    upgradeLabel = `${upgCost}`;
    if (G.resource < upgCost) upgradeDisabled = true;
  }
  actions.push({
    icon: '⬆',
    label: upgradeLabel,
    cls: 'action-upgrade',
    insufficient: !atMax && !building.upgrading && building.built && upgCost !== null && G.resource < upgCost,
    disabled: upgradeDisabled,
    onClick: () => {
      if (startUpgrade(building)) {
        openBuildingPanel(building);
      } else {
        showStatus('업그레이드 불가: 자원 부족 또는 조건 미충족');
      }
    }
  });

  // 철거 액션 (NEST 제외)
  if (!isNest) {
    const refundRate = building.built ? 0.5 : 1.0;
    const refund = Math.floor(def.cost * refundRate);
    actions.push({
      icon: '🗑',
      label: `${refund}`,
      cls: 'action-demolish',
      insufficient: false,
      disabled: false,
      onClick: () => {
        G.resource += refund;
        removeBuilding(building);
        closeRadialMenu();
        G.selectedBuildingId = null;
        updateHUD();
        updateBuildPanel();
      }
    });
  }

  // 일괄 진화 액션 (NEST 제외, 진화 가능한 모든 타워)
  if (!isNest && building.built && !atMax) {
    const batchInfo = calcBatchUpgrade(building);
    const batchDisabled = batchInfo.count === 0;
    actions.push({
      icon: '⏫',
      label: batchInfo.count > 0 ? `${batchInfo.count}개/${batchInfo.totalCost}` : '불가',
      cls: 'action-upgrade',
      insufficient: batchDisabled,
      disabled: batchDisabled,
      onClick: () => {
        const result = execBatchUpgrade(building);
        if (result > 0) {
          showStatus(`${BUILDING_DEFS[building.type].name} ${result}개 일괄 진화 완료`);
          closeRadialMenu();
          G.selectedBuildingId = null;
          updateHUD();
        } else {
          showStatus('일괄 진화 불가: 자원 부족 또는 대상 없음');
        }
      }
    });
  }

  // 정보 액션
  actions.push({
    icon: 'ℹ',
    label: '정보',
    cls: 'action-info',
    insufficient: false,
    disabled: false,
    onClick: () => {
      closeRadialMenu();
      openBuildingPanel(building);
    }
  });

  // 배치 좌표 계산
  const container = document.getElementById('game-container');
  const containerRect = container.getBoundingClientRect();
  const menuCX = clientX - containerRect.left;
  const menuCY = clientY - containerRect.top;

  const radius = 55;
  const startAngle = -Math.PI / 2;
  const step = (2 * Math.PI) / actions.length;

  for (let i = 0; i < actions.length; i++) {
    const act = actions[i];
    const angle = startAngle + step * i;
    const ix = menuCX + Math.cos(angle) * radius;
    const iy = menuCY + Math.sin(angle) * radius;

    const el = document.createElement('div');
    el.className = `radial-item ${act.cls}`;
    el.innerHTML = `<span class="ri-icon">${act.icon}</span><span class="ri-cost">${act.label}</span>`;
    el.style.left = ix + 'px';
    el.style.top  = iy + 'px';

    if (act.insufficient) el.classList.add('insufficient');
    if (act.disabled) el.style.pointerEvents = 'none';
    // MAX 레벨에 insufficient 스타일 적용
    if (act.cls === 'action-upgrade' && atMax) el.classList.add('insufficient');

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      act.onClick();
    });

    radialMenu.appendChild(el);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => el.classList.add('show'));
    });
  }

  // 중앙 라벨: 건물 이름 + HP + 레벨
  const centerEl = document.createElement('div');
  centerEl.className = 'radial-center-label';
  centerEl.style.left = menuCX + 'px';
  centerEl.style.top  = menuCY + 'px';
  centerEl.innerHTML = `${def.name}<br>HP ${building.hp}/${building.hpMax}<br>Lv.${building.level}`;
  radialMenu.appendChild(centerEl);

  G._radialOpen = true;
  G._radialCol  = building.col;
  G._radialRow  = building.row;
}

// ── NEST 전용 업그레이드 팝업 ─────────────────────────────────────────────────

const nestPopup = document.getElementById('nest-popup');

function openNestUpgradePopup(building) {
  closeRadialMenu();
  closeBuildingPanel();
  G.selectedBuildingId = building.id;
  G._nestPopupOpen = true;

  nestPopup.innerHTML = '';
  nestPopup.classList.remove('hidden');

  const def = BUILDING_DEFS.NEST;

  // 헤더: 둥지 정보
  const header = document.createElement('div');
  header.className = 'nest-popup-header';
  header.innerHTML = `${def.icon} ${def.name} Lv.${building.level} | HP ${building.hp}/${building.hpMax}`;
  nestPopup.appendChild(header);

  // 둥지 진화 버튼
  const maxNestLv = 3;
  const atMax = building.level >= maxNestLv;
  const upgCost = atMax ? null : def.upgradeCost[building.level - 1];
  const nestBtn = document.createElement('button');
  nestBtn.className = 'nest-popup-btn';
  if (atMax) {
    nestBtn.innerHTML = `<span class="npb-left"><span class="npb-icon">⬆</span><span class="npb-name">둥지 진화</span><span class="npb-lv">Lv.${building.level}</span></span><span class="npb-cost max">MAX</span>`;
    nestBtn.classList.add('disabled');
  } else if (building.upgrading) {
    nestBtn.innerHTML = `<span class="npb-left"><span class="npb-icon">⬆</span><span class="npb-name">둥지 진화</span><span class="npb-lv">Lv.${building.level}→${building.level+1}</span></span><span class="npb-cost">${Math.ceil(building.upgradeTimer)}s</span>`;
    nestBtn.classList.add('disabled');
  } else {
    const canAfford = G.resource >= upgCost;
    nestBtn.innerHTML = `<span class="npb-left"><span class="npb-icon">⬆</span><span class="npb-name">둥지 진화</span><span class="npb-lv">Lv.${building.level}→${building.level+1}</span></span><span class="npb-cost">${upgCost}</span>`;
    nestBtn.dataset.cost = upgCost;
    if (!canAfford) nestBtn.classList.add('disabled');
    nestBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (startUpgrade(building)) {
        openNestUpgradePopup(building); // 갱신
      } else {
        showStatus('업그레이드 불가: 자원 부족');
      }
    });
  }
  nestPopup.appendChild(nestBtn);

  // 구분선: 글로벌 업그레이드
  const secHeader = document.createElement('div');
  secHeader.className = 'nest-popup-section';
  secHeader.textContent = '── 글로벌 업그레이드 ──';
  nestPopup.appendChild(secHeader);

  // 방벽 업그레이드 묶음 ID
  const STRUCTURE_UPG_IDS = ['STRUCTURE_DEFENSE', 'STRUCTURE_FORTIFY'];

  // 일반 글로벌 업그레이드
  for (const upg of GLOBAL_UPGRADES) {
    if (STRUCTURE_UPG_IDS.includes(upg.id)) continue;
    nestPopup.appendChild(createNestUpgBtn(upg, building));
  }

  // 방벽 업그레이드 섹션
  const wallSec = document.createElement('div');
  wallSec.className = 'nest-popup-section';
  wallSec.textContent = '── 방벽 업그레이드 ──';
  nestPopup.appendChild(wallSec);

  for (const uid of STRUCTURE_UPG_IDS) {
    const upg = GLOBAL_UPGRADES.find(u => u.id === uid);
    if (upg) nestPopup.appendChild(createNestUpgBtn(upg, building));
  }

  // 팝업 위치: 둥지 화면 좌표 기준
  positionNestPopup(building);
}

function createNestUpgBtn(upg, nestBuilding) {
  const curLv = G.globalUpgrades[upg.id];
  const btn = document.createElement('button');
  btn.className = 'nest-popup-btn';

  if (curLv >= upg.maxLv) {
    btn.innerHTML = `<span class="npb-left"><span class="npb-icon">${upg.icon}</span><span class="npb-name">${upg.name}</span><span class="npb-lv">Lv.${curLv}</span></span><span class="npb-cost max">MAX</span>`;
    btn.classList.add('disabled');
  } else {
    const cost = upg.cost[curLv];
    const canAfford = G.resource >= cost;
    btn.innerHTML = `<span class="npb-left"><span class="npb-icon">${upg.icon}</span><span class="npb-name">${upg.name}</span><span class="npb-lv">Lv.${curLv}→${curLv+1}</span></span><span class="npb-cost">${cost}</span>`;
    btn.dataset.cost = cost;
    if (!canAfford) btn.classList.add('disabled');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (G.globalUpgrades[upg.id] >= upg.maxLv) return;
      const c = upg.cost[G.globalUpgrades[upg.id]];
      if (G.resource < c) { showStatus('자원 부족'); return; }
      G.resource -= c;
      G.globalUpgrades[upg.id]++;
      if (upg.id === 'SELF_REPAIR' && G.globalUpgrades.SELF_REPAIR === 1) {
        G.repairTimer = HEAL_INTERVAL;
      }
      updateHUD();
      openNestUpgradePopup(nestBuilding); // 갱신
    });
  }
  return btn;
}

function positionNestPopup(building) {
  const container = document.getElementById('game-container');
  const containerRect = container.getBoundingClientRect();
  const bc = getBuildingCenter(building);

  // canvas의 실제 CSS 위치를 읽어 landscape 중앙 정렬 오프셋을 자동 반영
  const canvas = document.getElementById('gameCanvas');
  const canvasRect = canvas.getBoundingClientRect();
  const canvasOffsetX = canvasRect.left - containerRect.left;
  const canvasOffsetY = canvasRect.top  - containerRect.top;
  const hudH = canvasOffsetY; // 클램핑 하한 계산에 재사용
  const screenX = (bc.x - G.camera.x) * G.camera.zoom * G.canvasScale + canvasOffsetX;
  const screenY = (bc.y - G.camera.y) * G.camera.zoom * G.canvasScale + canvasOffsetY;

  // 팝업을 둥지 오른쪽에 배치, 화면 밖이면 왼쪽으로
  const popupW = 220;
  let left = screenX + 40;
  if (left + popupW > containerRect.width) {
    left = screenX - popupW - 20;
  }
  // 팝업 높이는 실제 렌더 후 offsetHeight로 읽어야 정확하나,
  // 팝업이 hidden 상태에서 호출되므로 최대 예상치(300px)로 클램핑
  const popupH = nestPopup.offsetHeight || 300;
  let top = screenY - 60;
  top = Math.max(hudH + 5, Math.min(top, containerRect.height - popupH - 10));

  nestPopup.style.left = left + 'px';
  nestPopup.style.top  = top + 'px';
}

// 팝업 클릭 시 캔버스 이벤트 전파 방지
nestPopup.addEventListener('click', (e) => e.stopPropagation());
nestPopup.addEventListener('pointerdown', (e) => e.stopPropagation());

function closeNestPopup() {
  nestPopup.classList.add('hidden');
  nestPopup.innerHTML = '';
  G._nestPopupOpen = false;
}

// NEST 팝업 실시간 갱신: 자원 변동 시 버튼 활성/비활성 토글
function tickNestPopup() {
  if (!G._nestPopupOpen) return;
  const btns = nestPopup.querySelectorAll('.nest-popup-btn[data-cost]');
  for (const btn of btns) {
    const cost = parseInt(btn.dataset.cost, 10);
    const shouldDisable = G.resource < cost;
    if (shouldDisable && !btn.classList.contains('disabled')) btn.classList.add('disabled');
    else if (!shouldDisable && btn.classList.contains('disabled')) btn.classList.remove('disabled');
  }
}

/** PLACING 상태에서 건설 버튼 숨기기 */
function updateBuildTriggerVisibility() {
  if (G.state === STATE.PLACING || G.state === STATE.IDLE || G.state === STATE.GAME_OVER) {
    buildTriggerBar.style.display = 'none';
  } else {
    buildTriggerBar.style.display = '';
  }
}

// ── 광고 버프 시스템 ──────────────────────────────────────────────────────────

const adBuffBtn = document.getElementById('ad-buff-btn');

/** 광고 버프 타이머 업데이트 — 매 프레임 호출 */
function updateAdBuff(dt) {
  if (G.adBuff.active) {
    G.adBuff.timer -= dt;
    if (G.adBuff.timer <= 0) {
      G.adBuff.active   = false;
      G.adBuff.timer    = 0;
      G.adBuff.cooldown = 120; // 2분 쿨타임 시작
      adBuffBtn.classList.remove('active');
      adBuffBtn.classList.add('cooldown');
      showStatus('자원 2배 버프가 종료되었습니다');
    } else {
      adBuffBtn.textContent = Math.ceil(G.adBuff.timer) + 's';
    }
  } else if (G.adBuff.cooldown > 0) {
    G.adBuff.cooldown -= dt;
    if (G.adBuff.cooldown <= 0) {
      G.adBuff.cooldown = 0;
      adBuffBtn.classList.remove('cooldown');
      adBuffBtn.textContent = 'AD';
      showStatus('광고 시청 가능!');
    } else {
      const mm = Math.floor(G.adBuff.cooldown / 60);
      const ss = Math.ceil(G.adBuff.cooldown % 60);
      adBuffBtn.textContent = mm > 0 ? `${mm}:${ss.toString().padStart(2,'0')}` : `${ss}s`;
    }
  }
}

adBuffBtn.addEventListener('click', () => {
  if (G.state !== STATE.COUNTDOWN && G.state !== STATE.WAVE) return;
  if (G.adBuff.active || G.adBuff.cooldown > 0) return;
  // 광고 시뮬레이션 (confirm 대화상자)
  const ok = confirm('광고를 시청하시겠습니까?\n60초 동안 자원 생산량이 2배가 됩니다.');
  if (!ok) return;
  G.adBuff.active = true;
  G.adBuff.timer  = 60;
  adBuffBtn.classList.add('active');
  adBuffBtn.textContent = '60s';
  showStatus('자원 2배 버프 활성화! (60초)');
});

// ── 18. 메인 게임 루프 ────────────────────────────────────────────────────────
// requestAnimationFrame 기반. dt는 최대 DT_MAX(0.1s)로 클램핑.
// 탭 전환 후 복귀 시 큰 dt가 들어오면 물리가 폭발하는 것을 방지한다.

function gameLoop(timestamp) {
  if (!G._loopRunning) return;

  let dt = 0;
  if (G.prevTime !== null) {
    dt = (timestamp - G.prevTime) / 1000;
    dt = Math.min(dt, DT_MAX);
    dt *= G.gameSpeed; // 2배속 적용 (DT_MAX 클램핑 이후에 곱함)
  }
  G.prevTime = timestamp;

  if (G.paused) {
    render();
    // 일시정지 오버레이 텍스트
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#f0c040';
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('일시정지', canvas.width / 2, canvas.height / 2);
    ctx.restore();
    requestAnimationFrame(gameLoop);
    return;
  }

  update(dt);
  render();
  updateHUD();
  updateBuildPanel();
  tickBuildingPanelHP();
  tickNestPopup();
  updateBuildTriggerVisibility();

  requestAnimationFrame(gameLoop);
}


// ── 18. 초기화 및 리사이즈 핸들러 ───────────────────────────────────────────

window.addEventListener('resize', () => {
  resizeCanvas();
  clampCamera();
  dirtyTerrain();
  // 팝업이 열려 있으면 회전/리사이즈 후 위치 재조정
  if (G._nestPopupOpen) {
    const building = G.buildings.find(b => b.id === G.selectedBuildingId);
    if (building) positionNestPopup(building);
  }
});

// 인게임 메뉴
const menuBtn       = document.getElementById('menu-btn');
const gameMenu      = document.getElementById('game-menu');
const menuPauseBtn  = document.getElementById('menu-pause-btn');
const menuRestartBtn= document.getElementById('menu-restart-btn');
const menuCloseBtn  = document.getElementById('menu-close-btn');

function openGameMenu() {
  const canPause = G.state === STATE.COUNTDOWN || G.state === STATE.WAVE;
  menuPauseBtn.style.display = canPause ? '' : 'none';
  menuPauseBtn.textContent = G.paused ? '▶  재개' : '❚❚  일시 정지';
  menuPauseBtn.classList.toggle('paused', G.paused);
  // 일시정지 상태로 메뉴 열기
  if (canPause && !G.paused) {
    G.paused = true;
    G.prevTime = null;
  }
  gameMenu.classList.remove('hidden');
}

function closeGameMenu() {
  gameMenu.classList.add('hidden');
}

menuBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (gameMenu.classList.contains('hidden')) {
    openGameMenu();
  } else {
    closeGameMenu();
  }
});

menuPauseBtn.addEventListener('click', () => {
  G.paused = !G.paused;
  menuPauseBtn.textContent = G.paused ? '▶  재개' : '❚❚  일시 정지';
  menuPauseBtn.classList.toggle('paused', G.paused);
  if (!G.paused) {
    G.prevTime = null;
    closeGameMenu();
  }
});

menuRestartBtn.addEventListener('click', () => {
  closeGameMenu();
  G.paused = false;
  initGame();
  resizeCanvas();
  clampCamera();
  buildBuildPanel();
  // 게임 속도 버튼 리셋
  speedBtn.textContent = '1x';
  speedBtn.classList.remove('active');
  showOverlay(
    'XenoNest',
    '핵심 둥지를 건설하고<br>인간 병사로부터 영토를 지켜라!',
    '게임 시작'
  );
});

menuCloseBtn.addEventListener('click', () => {
  // 닫기: 일시정지 해제 후 게임 재개
  if (G.paused) {
    G.paused = false;
    G.prevTime = null;
  }
  closeGameMenu();
});

// 최초 초기화
initGame();
resizeCanvas();
clampCamera();
buildBuildPanel();

// 시작 오버레이 표시
showOverlay(
  'XenoNest',
  '핵심 둥지를 건설하고<br>인간 병사로부터 영토를 지켜라!',
  '게임 시작'
);

// 게임 루프 시작 (오버레이는 있지만 루프는 돌려야 화면이 그려짐)
G._loopRunning = true;
requestAnimationFrame(gameLoop);
