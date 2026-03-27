# ADR-012: 스테이지 시스템 도입 — 맵 설정의 전역 상수 분리

> **카테고리:** DECISIONS
> **최초 작성:** 2026-03-28
> **최종 갱신:** 2026-03-28
> **관련 기능:** 스테이지 시스템, STAGES 배열, G.stageConfig, createGrid, initGame, 맵 에디터

**상태:** Accepted
**날짜:** 2026-03-28

---

## 맥락

ADR-011(Portrait 맵 재설계)에서 맵 크기가 COLS=20, ROWS=28로 변경되었다. 이 시점까지 맵 메타데이터(`NEST_ZONE`, `BASE_ENTRANCE`, `ENTRANCES`)는 각각 독립된 전역 상수로 `game.js` 상단에 선언되어 있었다.

이 구조에서 두 가지 문제가 구체적으로 식별되었다.

**문제 1: 새 맵 추가 시 변경점이 분산된다.**
맵을 하나 추가하면 `rawGrid` 배열 외에도 `NEST_ZONE`, `BASE_ENTRANCE`, `ENTRANCES` 세 상수를 별도로 수정해야 한다. 이 상수들이 코드 내 서로 다른 위치에 있어 하나를 누락할 경우 런타임 오류가 즉시 드러나지 않는다(예: `ENTRANCES`를 업데이트하지 않으면 스폰 좌표가 구 맵을 참조하게 된다).

**문제 2: 맵 설계 도구(에디터)의 출력과 코드 구조가 다르다.**
맵 에디터를 별도 도구로 운영할 때 에디터가 출력해야 할 JSON 구조가 `rawGrid` + 분산된 상수로 나뉘어 있으면 에디터 출력 → 코드 적용 절차가 번거롭다. 단일 객체 구조이면 에디터 출력을 배열에 그대로 붙여 넣는 것으로 작업이 완료된다.

---

## 결정

맵 메타데이터를 단일 스테이지 설정 객체로 통합하고, 이를 `STAGES` 배열로 관리한다.

### 1. STAGES 배열 도입

```javascript
const STAGES = [
  {
    id: 0,
    name: "기본 기지",
    cols: 20,
    rows: 28,
    rawGrid:      [...],        // 타일 타입 2D 배열
    baseEntrance: [{col:9, row:18}, {col:10, row:18}],
    nestZone:     {colMin:9, colMax:10, rowMin:3, rowMax:4},
    spawnPoints:  [{col:18,row:14}, {col:18,row:15}, ...],
  },
  // 추가 스테이지...
];
```

### 2. 전역 상수 제거

`NEST_ZONE`, `BASE_ENTRANCE`, `ENTRANCES` 전역 상수를 삭제한다. 동일한 데이터는 `G.stageConfig.*`를 통해서만 접근한다.

### 3. createGrid 시그니처 변경

```javascript
// 변경 전
function createGrid() { /* NEST_ZONE, BASE_ENTRANCE 전역 참조 */ }

// 변경 후
function createGrid(stageConfig) {
  return stageConfig.rawGrid.map(row => [...row]);  // 깊은 복사
}
```

rawGrid 깊은 복사를 사용하는 이유: 게임 진행 중 타일 타입이 변경(건물 배치/철거)되어도 원본 `STAGES[n].rawGrid`가 보존되어야 재시작 시 초기 상태를 올바르게 복원할 수 있다.

### 4. initGame 시그니처 변경

```javascript
// 변경 전
function initGame() { /* COLS, ROWS, NEST_ZONE 등 전역 참조 */ }

// 변경 후
function initGame(stageId = 0) {
  const config = STAGES.find(s => s.id === stageId) || STAGES[0];
  G.stageConfig = config;
  G.grid = createGrid(config);
  // ...
}
```

`stageId` 기본값을 0으로 설정하여 기존 `initGame()` 호출부를 수정하지 않아도 동작한다. `STAGES[0]` 폴백은 잘못된 stageId로 인해 게임이 시작 불가 상태가 되는 것을 방지한다.

### 5. FLOOR_NOBUILD(12) 타일 추가

스테이지 시스템과 함께, 맵 디자인에서 "건물 배치는 불가하지만 적은 통과 가능한 바닥"을 표현할 수단이 필요해졌다. 기존 `EMPTY(0)`은 건물 배치를 허용하고, `BLOCKED(1)`은 적도 통과할 수 없다. 두 경우의 중간 값으로 `FLOOR_NOBUILD(12)`를 신규 정의한다.

```
EMPTY(0)         : 적 통과 가능 + 건물 배치 가능
FLOOR_NOBUILD(12): 적 통과 가능 + 건물 배치 불가
BLOCKED(1)       : 적 통과 불가 + 건물 배치 불가
```

값 12를 선택한 이유: 기존 타일 값 0~9가 사용 중이고 10, 11은 미래 확장을 위해 예약하지 않았으나, 12는 기존 범위와 명확히 구분되어 rawGrid에서 시각적으로 식별하기 쉽다.

### 6. 맵 에디터(map-editor.html) 독립 도구로 제공

스테이지 rawGrid를 코드에서 직접 수작업으로 편집하는 것은 오류 가능성이 높다. 시각적 에디터를 `map-editor.html`로 분리하여 제공한다. 에디터는 `game.js`를 포함하지 않는 독립 HTML 파일로, 에디터 자체의 버그가 게임에 영향을 주지 않는다.

---

## 이유

### 전역 상수 방식을 유지하지 않은 이유

전역 상수 방식은 맵이 1개일 때는 충분하다. 그러나 스테이지 추가 가능성을 염두에 두면, 각 맵마다 전역 상수를 새로 추가하거나 기존 상수를 덮어쓰는 구조는 코드가 일관성을 잃는다. 객체 배열 구조는 스테이지 수에 관계없이 일정한 패턴을 유지한다.

### STAGES 배열 인덱스 대신 id 필드를 사용하는 이유

배열 인덱스만으로 스테이지를 참조하면 STAGES 배열에서 중간 항목을 삭제할 때 이후 모든 스테이지의 인덱스가 바뀐다. `id` 필드는 삭제와 순서 변경에 독립적이다. `initGame(stageId)`가 `STAGES.find(s => s.id === stageId)`로 조회하므로 배열 순서가 바뀌어도 동작이 변하지 않는다.

### 깊은 복사(deep copy)를 사용하는 이유

`G.grid = stageConfig.rawGrid`처럼 참조를 직접 할당하면, 게임 중 타일 타입 변경이 `STAGES[n].rawGrid`를 직접 수정하게 된다. 이후 `initGame()`을 다시 호출해도 rawGrid가 이미 오염되어 있어 초기 상태로 복원되지 않는다. 깊은 복사로 이 문제를 원천적으로 차단한다.

---

## 검토한 대안

### 대안 A: 전역 상수 유지 + 스테이지 전환 시 상수 교체

`initGame(stageId)` 호출 시 `NEST_ZONE = STAGES[stageId].nestZone` 방식으로 전역 상수를 동적으로 교체하는 방식.

기각 이유: 전역 상수를 let으로 재선언해야 하며, 코드 내 어디서든 상수를 재할당할 수 있게 된다. 상수(const)의 의미가 사라지고 의도하지 않은 시점에 값이 변경될 위험이 생긴다.

### 대안 B: 별도 파일 분리 (stages.js)

각 스테이지를 별도 `stages.js` 파일로 분리하여 `index.html`에서 로드하는 방식.

기각 이유: XenoNest는 의도적으로 단일 파일(`game.js`) 구조를 유지한다. 빌드 툴체인 없이 `index.html`을 직접 실행 가능하도록 설계된 프로젝트 원칙과 충돌한다. 스테이지 수가 수십 개를 넘지 않는 이상 파일 분리의 이점이 없다.

### 대안 C: rawGrid만 배열로 관리, 나머지는 전역 상수 유지

`const STAGE_GRIDS = [rawGrid0, rawGrid1, ...]`와 같이 rawGrid만 배열로 관리하고, `NEST_ZONE`, `BASE_ENTRANCE`, `ENTRANCES`는 전역 상수로 유지하는 방식.

기각 이유: 새 스테이지 추가 시 여전히 여러 곳을 수정해야 하는 문제가 해결되지 않는다. 맵 에디터 출력 구조와도 맞지 않는다.

---

## 결과

- 전역 상수 `NEST_ZONE`, `BASE_ENTRANCE`, `ENTRANCES`가 삭제되었다.
- `STAGES` 배열이 `game.js` 섹션 1에 추가되었다.
- `G.stageConfig` 필드가 `G` 객체에 추가되었다.
- `createGrid(stageConfig)` 시그니처가 변경되었다. 인수 없는 호출은 불가하다.
- `initGame(stageId = 0)` 시그니처가 변경되었다. 기존 `initGame()` 호출은 stageId=0(폴백 포함)으로 동작하여 하위 호환된다.
- `TILE.FLOOR_NOBUILD = 12`가 신규 정의되었다.
- `map-editor.html`이 신규 추가되었다.
- 맵 메타데이터를 참조하는 모든 코드가 `G.stageConfig.*` 경로로 교체되었다.
