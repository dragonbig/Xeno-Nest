# 스테이지 시스템

> **카테고리:** FEATURES
> **최초 작성:** 2026-03-28
> **최종 갱신:** 2026-03-28
> **관련 기능:** 맵 초기화, G 객체, STAGES 배열, createGrid, initGame, 맵 에디터

## 개요

스테이지 시스템은 게임 맵을 코드에 하드코딩된 단일 구성에서 분리하여, `STAGES` 배열에 정의된 복수의 스테이지 설정을 런타임에 선택하여 로드할 수 있는 구조이다. 기존에 전역 상수(`NEST_ZONE`, `BASE_ENTRANCE`, `ENTRANCES`)로 분산 관리되던 맵 메타데이터가 단일 스테이지 설정 객체로 통합되었다.

---

## 설계 배경 및 이유

기존 구조에서는 `NEST_ZONE`, `BASE_ENTRANCE`, `ENTRANCES`가 각각 독립된 전역 상수로 선언되어 있었다. 이 구조에서 새 맵을 추가하려면 각 상수를 개별적으로 수정해야 했으며, 맵이 변경될 때 관련 상수를 누락할 위험이 있었다. 스테이지 객체로 통합하면 하나의 진입점(`STAGES` 배열)에서 모든 맵 메타데이터를 관리할 수 있고, `initGame(stageId)`를 호출하는 것만으로 완전한 맵 전환이 보장된다.

---

## 스테이지 설정 객체 구조

`STAGES` 배열의 각 요소는 다음 형태를 가진다.

```javascript
{
  id:           number,     // 스테이지 식별자 (배열 인덱스와 일치 권장)
  name:         string,     // 표시용 이름 (예: "기본 기지")
  cols:         number,     // 맵 가로 타일 수
  rows:         number,     // 맵 세로 타일 수
  rawGrid:      number[][],  // 타일 타입 2D 배열 (cols × rows)
  baseEntrance: { col: number, row: number }[],  // 기지 입구 좌표 목록 (WALL 철거 시 ENTRANCE 복원용)
  nestZone:     { colMin: number, colMax: number, rowMin: number, rowMax: number },  // NEST 배치 가능 2×2 구역
  spawnPoints:  { col: number, row: number }[],  // 적 스폰 진입 지점 목록
}
```

### 필드별 상세

| 필드 | 타입 | 설명 |
|------|------|------|
| `id` | number | 스테이지 고유 번호. `initGame(stageId)` 호출 시 매칭에 사용 |
| `name` | string | 화면 표시용 스테이지 이름 |
| `cols` | number | 맵 가로 타일 수. `tileToPixel`, `pixelToTile`, `resizeCanvas` 계산에 사용 |
| `rows` | number | 맵 세로 타일 수 |
| `rawGrid` | number[][] | 타일 타입 2D 배열. `createGrid(stageConfig)`에서 깊은 복사되어 `G.grid`가 된다 |
| `baseEntrance` | 배열 | 기지 입구 타일 좌표. `removeBuilding()` 내부에서 WALL 철거 시 이 좌표와 일치하는 타일을 EMPTY 대신 ENTRANCE로 복원한다 |
| `nestZone` | 객체 | NEST 배치 허용 구역(2×2). `isInNestZone(col, row)` 판단에 사용된다 |
| `spawnPoints` | 배열 | 적이 이 좌표에서 스폰된다. 라운드로빈으로 순차 사용 |

---

## rawGrid 타일 타입 참조

rawGrid에 사용 가능한 타일 타입은 다음과 같다. 전체 정의는 `DOCS/SYSTEM/GAME_CONSTANTS.md`의 타일 타입 표를 참조한다.

| 값 | 상수명 | rawGrid에서의 역할 |
|----|--------|--------------------|
| `0` | `EMPTY` | 건물 배치 가능 빈 공간 |
| `1` | `BLOCKED` | 배치/통과 불가 외벽 |
| `2` | `ENTRANCE` | 기지 입구 (WALL 배치만 허용) |
| `9` | `SPAWN` | 적 스폰 지점 |
| `12` | `FLOOR_NOBUILD` | 건물 배치 불가, 적 통과 가능 바닥 |

`FLOOR_NOBUILD(12)`는 `EMPTY(0)`와 달리 건물을 배치할 수 없다. 적의 BFS 경로 탐색에는 포함된다(통과 가능). `renderTerrain()`에서 `#3a3a3a` 어두운 회색으로 렌더링된다. 넓은 통로나 외부 마당처럼 시각적으로 다른 색상의 바닥이 필요하지만 건물은 세울 수 없는 구역에 사용한다.

---

## 핵심 함수

### `createGrid(stageConfig)`

`stageConfig.rawGrid`를 깊은 복사하여 독립적인 2D 배열 `G.grid`를 생성한다. 참조 복사가 아닌 깊은 복사를 사용하는 이유는, 게임 중 건물 배치/철거로 타일 타입이 변경될 때 원본 `STAGES` 배열의 rawGrid가 오염되지 않도록 하기 위함이다. 재시작 시 `initGame()`이 다시 `createGrid()`를 호출하므로 rawGrid 원본에서 항상 깨끗한 복사본을 얻는다.

```javascript
// rawGrid 깊은 복사 방식
G.grid = stageConfig.rawGrid.map(row => [...row]);
```

### `initGame(stageId = 0)`

`stageId`에 해당하는 `STAGES` 항목을 찾아 `G.stageConfig`에 저장하고 `createGrid(G.stageConfig)`를 호출한다.

- `stageId`가 `STAGES` 배열 범위를 초과하면 `STAGES[0]`으로 폴백한다. 이는 잘못된 stageId가 전달되어 게임이 시작되지 않는 상황을 방지하기 위함이다.
- `G` 전체가 새 객체로 교체되므로 이전 상태는 완전히 제거된다.

```javascript
// stageId 폴백 예시
const config = STAGES.find(s => s.id === stageId) || STAGES[0];
G.stageConfig = config;
G.grid = createGrid(config);
```

---

## G.stageConfig 필드 접근 패턴

스테이지 시스템 도입 전에는 전역 상수를 직접 참조했다. 도입 후에는 반드시 `G.stageConfig.*`를 통해 접근한다.

| 이전 (전역 상수) | 이후 (stageConfig 경로) |
|-----------------|------------------------|
| `NEST_ZONE.colMin` | `G.stageConfig.nestZone.colMin` |
| `BASE_ENTRANCE[0]` | `G.stageConfig.baseEntrance[0]` |
| `ENTRANCES[i]` | `G.stageConfig.spawnPoints[i]` |
| `COLS` | `G.stageConfig.cols` |
| `ROWS` | `G.stageConfig.rows` |

> `COLS`, `ROWS` 전역 상수는 렌더링(`resizeCanvas`)이나 좌표 변환(`tileToPixel`) 등 스테이지와 무관한 고정 연산에서는 여전히 사용될 수 있다. 맵 메타데이터(입구, 스폰, 둥지 구역)에 관한 로직만 `G.stageConfig`를 통해야 한다.

---

## 새 스테이지 추가 방법

1. `map-editor.html`을 브라우저에서 열어 맵을 그린다.
2. 팔레트로 각 타일 타입을 지정하고, NEST_ZONE 2×2 구역을 설정하고, ENTRANCE/SPAWN 타일 유효성 검사를 통과한 후 JSON을 내보낸다.
3. 내보낸 JSON의 `rawGrid`, `baseEntrance`, `nestZone`, `spawnPoints`를 `game.js`의 `STAGES` 배열에 새 항목으로 추가한다.
4. `id`와 `name`을 지정한다. `cols`와 `rows`는 rawGrid 배열의 실제 크기와 일치해야 한다.
5. `initGame(새id)`를 호출하면 해당 스테이지로 게임이 시작된다.

맵 에디터 상세 사용법은 `DOCS/FEATURES/MAP_EDITOR.md`를 참조한다.

---

## 유효성 조건 (런타임 보장 사항)

| 조건 | 근거 |
|------|------|
| `rawGrid.length === rows` | `createGrid`에서 행 수 불일치 시 BFS 거리맵이 범위를 벗어난다 |
| `rawGrid[i].length === cols` | 동일한 이유 |
| `nestZone`은 2×2 구역 (`colMax - colMin === 1 && rowMax - rowMin === 1`) | `isInNestZone()`이 4칸을 가정하고 동작한다 |
| `baseEntrance` 타일은 rawGrid에서 `ENTRANCE(2)` 타입이어야 함 | `removeBuilding()` 내 복원 로직이 ENTRANCE 타일을 전제한다 |
| `spawnPoints`는 최소 1개 이상 | 스폰 라운드로빈 인덱스가 비어 있는 배열을 참조하면 undefined가 된다 |

이 조건들은 맵 에디터의 내보내기 유효성 검사로 사전에 걸러지며, 코드 단에서는 별도 런타임 assertion 없이 신뢰한다.
