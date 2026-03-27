# 맵 에디터

> **카테고리:** FEATURES
> **최초 작성:** 2026-03-28
> **최종 갱신:** 2026-03-28
> **관련 기능:** 스테이지 시스템, STAGES 배열, rawGrid, FLOOR_NOBUILD

## 개요

`map-editor.html`은 XenoNest 스테이지의 rawGrid를 시각적으로 편집하고 `game.js`의 `STAGES` 배열에 바로 붙여 넣을 수 있는 JSON을 내보내는 독립 실행형 도구이다. 외부 의존성 없이 브라우저에서 직접 열어 사용한다. 빌드 과정이 없으며, 게임 본체(`game.js`)와 파일이 분리되어 있어 에디터 수정이 게임 로직에 영향을 주지 않는다.

---

## 실행 방법

```
브라우저에서 map-editor.html 직접 열기
(예: file:///C:/BIgDragonGames/XenoNest/map-editor.html)
```

로컬 파일 시스템에서 직접 열어도 동작한다. 서버가 필요하지 않다.

---

## 화면 구성

```
┌─────────────────────────────────────┐
│  [팔레트: EMPTY / FLOOR_NOBUILD /   │
│           BLOCKED / ENTRANCE / SPAWN]│
├─────────────────────────────────────┤
│                                     │
│   Grid Canvas (cols × rows 타일)    │
│   · 클릭+드래그로 페인팅           │
│   · NEST_ZONE 보라색 오버레이       │
│                                     │
├─────────────────────────────────────┤
│  [NEST_ZONE 설정 버튼]              │
│  [JSON 내보내기 버튼]               │
└─────────────────────────────────────┘
```

---

## 팔레트

에디터는 5가지 타일 타입 팔레트를 제공한다.

| 팔레트 항목 | 타일 값 | 렌더링 색상 | 설명 |
|-------------|---------|-------------|------|
| `EMPTY` | `0` | 밝은 배경 | 건물 배치 가능 빈 공간 |
| `FLOOR_NOBUILD` | `12` | `#3a3a3a` 어두운 회색 | 건물 배치 불가, 적 통과 가능 바닥 |
| `BLOCKED` | `1` | 진한 회색/검정 | 배치·통과 불가 외벽 |
| `ENTRANCE` | `2` | 강조 색상 | 기지 입구 (WALL 배치만 허용) |
| `SPAWN` | `9` | 어두운 빨간색 | 적 스폰 지점 |

팔레트에서 하나를 선택한 후 Grid Canvas 위에서 클릭하거나 드래그하면 선택한 타입으로 타일이 채워진다.

> `NEST(3)`, `WALL(4)` 등 나머지 타일 타입은 게임 런타임에 생성되므로 에디터 팔레트에는 포함되지 않는다. rawGrid는 초기 지형 배치만 정의하며, 건물 배치는 게임 내에서 플레이어가 수행한다.

---

## 페인팅 방법

페인팅은 Pointer Events API(`pointerdown`, `pointermove`, `pointerup`)를 사용한다. 마우스와 터치 입력을 통합 처리한다.

| 동작 | 입력 | 결과 |
|------|------|------|
| 단일 타일 변경 | 클릭(pointerdown) | 해당 타일을 선택한 팔레트 타입으로 변경 |
| 범위 페인팅 | 클릭 후 드래그 | 드래그 경로의 모든 타일을 선택 타입으로 변경 |
| 페인팅 종료 | pointerup / pointercancel | 드래그 상태 해제 |

`pointerdown` 시 `canvas.setPointerCapture(e.pointerId)`를 호출하여 포인터가 canvas 영역을 벗어나도 드래그가 끊기지 않는다.

---

## NEST_ZONE 설정

NEST_ZONE은 게임 내에서 플레이어가 핵심 둥지를 배치할 수 있는 2×2 구역이다. 에디터에서 별도의 버튼 또는 특수 모드로 좌상단 타일(colMin, rowMin) 좌표를 지정하면, 해당 좌표로부터 오른쪽 1칸·아래 1칸(총 2×2)이 NEST_ZONE으로 설정된다.

Grid Canvas에서 NEST_ZONE 4칸은 보라색 반투명 오버레이로 표시된다. rawGrid에 별도 타일 값으로 저장되지 않으며, 내보내기 JSON의 `nestZone` 필드로만 기록된다.

---

## JSON 내보내기

### 유효성 검사

내보내기 버튼을 누르면 다음 조건을 먼저 검사한다. 하나라도 통과하지 못하면 내보내기가 차단되고 오류 메시지가 표시된다.

| 조건 | 오류 메시지 예시 |
|------|-----------------|
| `ENTRANCE` 타일 최소 1개 이상 | "ENTRANCE 타일이 없습니다. 최소 1개 배치하세요." |
| `SPAWN` 타일 최소 1개 이상 | "SPAWN 타일이 없습니다. 최소 1개 배치하세요." |
| NEST_ZONE 설정 완료 | "NEST_ZONE을 설정하세요." |

### 출력 형식

유효성 검사 통과 시 브라우저 콘솔 또는 화면의 텍스트 영역에 다음 형태의 JSON이 출력된다.

```json
{
  "rawGrid": [
    [1, 1, 1, 0, 0, 0, 1, 1],
    [1, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 2, 2, 1, 1, 1]
  ],
  "baseEntrance": [
    { "col": 3, "row": 3 },
    { "col": 4, "row": 3 }
  ],
  "nestZone": {
    "colMin": 2, "colMax": 3,
    "rowMin": 0, "rowMax": 1
  },
  "spawnPoints": [
    { "col": 0, "row": 1 },
    { "col": 7, "row": 1 }
  ]
}
```

`baseEntrance`는 rawGrid에서 `ENTRANCE(2)` 타입인 타일 좌표를 자동 수집한다. `spawnPoints`는 rawGrid에서 `SPAWN(9)` 타입인 타일 좌표를 자동 수집한다. 별도로 지정할 필요 없다.

### game.js 적용 방법

내보낸 JSON을 `game.js`의 `STAGES` 배열에 아래와 같이 붙여 넣는다.

```javascript
const STAGES = [
  {
    id: 0,
    name: "기본 기지",
    cols: 20,
    rows: 28,
    rawGrid: /* 기존 rawGrid */,
    baseEntrance: /* 기존 baseEntrance */,
    nestZone: /* 기존 nestZone */,
    spawnPoints: /* 기존 spawnPoints */,
  },
  {
    id: 1,
    name: "새 스테이지",
    cols: 8,   // 에디터에서 설정한 cols
    rows: 4,   // 에디터에서 설정한 rows
    rawGrid: [ /* 내보낸 rawGrid */ ],
    baseEntrance: [ /* 내보낸 baseEntrance */ ],
    nestZone: { /* 내보낸 nestZone */ },
    spawnPoints: [ /* 내보낸 spawnPoints */ ],
  },
];
```

`cols`와 `rows`는 에디터에서 설정한 그리드 크기와 일치해야 한다. `rawGrid.length`가 `rows`와 다르거나 `rawGrid[0].length`가 `cols`와 다르면 BFS 거리맵 계산에서 범위 오류가 발생한다.

---

## 기술 구현 사항

| 항목 | 구현 방식 | 선택 이유 |
|------|-----------|-----------|
| 입력 처리 | Pointer Events API (`pointerdown/move/up/cancel`) | 마우스와 터치를 단일 이벤트 핸들러로 통합 처리 가능 |
| 포인터 캡처 | `canvas.setPointerCapture(e.pointerId)` | 드래그 중 canvas 영역 이탈 시에도 이벤트 수신 유지 |
| 외부 의존성 | 없음 | 빌드 툴 없이 브라우저에서 직접 실행 가능하도록 설계 |
| 파일 구조 | `game.js`와 완전히 분리된 독립 HTML 파일 | 에디터 수정이 게임 로직에 영향을 주지 않음 |

---

## 제약 사항

- 에디터는 rawGrid 초기화 도구이다. 건물 배치, BFS 경로 검증, 밸런스 테스트는 게임 본체에서 수행한다.
- 에디터에서 `FLOOR_NOBUILD(12)` 타일에 건물이 배치되지 않는다는 것은 검증하지 않는다. 해당 검증은 `game.js`의 `onTileClicked()` 내 배치 가능 조건 분기에서 처리된다.
- NEST_ZONE을 rawGrid 외부 좌표로 설정하면 `isInNestZone()` 함수가 항상 false를 반환하여 NEST를 배치할 수 없게 된다. 에디터는 NEST_ZONE 좌표가 그리드 범위 내에 있는지 별도로 경고하지 않는다.
