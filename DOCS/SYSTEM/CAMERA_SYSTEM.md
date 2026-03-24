# 카메라 시스템

> **카테고리:** SYSTEM
> **최초 작성:** 2026-03-23
> **최종 갱신:** 2026-03-24 (Portrait 맵 재설계: 카메라 초기값 갱신, positionNestPopup 좌표 계산 추가)
> **관련 기능:** 입력 처리, 렌더링, 좌표 변환

## 개요

카메라는 줌(배율 조절)과 팬(이동)을 지원하며, `G.camera` 객체에 상태가 저장된다. 모든 렌더링 시 `ctx.scale` + `ctx.translate`로 월드-화면 변환을 적용하고, 입력 처리 시 역변환으로 화면 좌표를 월드 좌표로 환산한다.

---

## G.camera 구조

```javascript
G.camera = {
  x:    0,    // 카메라 좌상단의 월드 X 좌표 (px)
  y:    0,    // 카메라 좌상단의 월드 Y 좌표 (px)
  zoom: 1.0,  // 배율 (0.5 ~ 2.0, 0.25 단위 조절)
}
```

줌 범위: 최소 `0.5`, 최대 `2.0`. `zoom-in` / `zoom-out` 버튼으로 0.25 단위 조절.

---

## 화면 → 월드 좌표 변환 (getCanvasPos)

클릭/터치 이벤트의 `clientX, clientY`를 월드 좌표로 변환하는 절차:

```
1. getBoundingClientRect()로 CSS 상 캔버스 위치와 크기 획득
2. CSS 표시 크기 vs 논리 canvas 크기 비율(scaleX, scaleY) 계산
3. 논리 캔버스 좌표 = (clientX - rect.left) * scaleX
4. 월드 좌표 = 논리 캔버스 좌표 / zoom + camera.x
```

```javascript
function getCanvasPos(clientX, clientY) {
  const rect   = canvas.getBoundingClientRect();
  const scaleX = canvas.width  / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (clientX - rect.left) * scaleX / G.camera.zoom + G.camera.x,
    y: (clientY - rect.top)  * scaleY / G.camera.zoom + G.camera.y,
  };
}
```

이 반환값을 `pixelToTile()`에 넘기면 그리드 (col, row)를 얻는다.

---

## 렌더링 변환 (render)

매 프레임 렌더링 시작 시 카메라 변환을 적용하고, 완료 후 복원한다.

```javascript
ctx.save();
ctx.scale(G.camera.zoom, G.camera.zoom);
ctx.translate(-G.camera.x, -G.camera.y);
// ... 모든 게임 오브젝트 렌더링 ...
ctx.restore();
```

`scale` 먼저 적용 → `translate`를 zoom에 독립적으로 처리하기 위해 `-camera.x`를 넘긴다. 결과적으로 화면의 (0, 0)은 월드 (camera.x, camera.y) 위치를 표시한다.

---

## 카메라 팬 (드래그)

마우스와 터치 모두 동일한 `G.drag` 상태를 사용한다.

```javascript
G.drag = {
  active:   false,
  startX:   0,      // 드래그 시작 clientX
  startY:   0,
  camStartX: 0,     // 드래그 시작 시점의 camera.x
  camStartY: 0,
  moved:    false,  // 5px 이상 이동 시 true → 클릭으로 처리하지 않음
}
```

팬 계산 공식:
```
camera.x = camStartX - (clientX - startX) * scaleX / zoom
```

`scaleX`는 CSS 표시 크기와 논리 캔버스 크기의 비율 보정이다. `moved = false`로 종료되면 `handleTileClick()`을 호출해 타일 클릭으로 처리한다.

---

## 카메라 경계 클램핑 (clampCamera)

맵이 뷰포트보다 클 경우 카메라가 맵 밖으로 벗어나지 않도록 제한한다. 맵이 뷰포트보다 작을 경우(소형 화면에서 축소 뷰) 맵을 중앙에 고정한다.

```javascript
function clampCamera() {
  const worldW = COLS * TILE_SIZE;  // 960  (COLS=20)
  const worldH = ROWS * TILE_SIZE;  // 1344 (ROWS=28)
  const vpW = canvas.width  / G.camera.zoom;
  const vpH = canvas.height / G.camera.zoom;

  // 맵이 뷰포트보다 크면 [0, world - vp] 범위로 클램핑
  // 맵이 뷰포트보다 작으면 중앙 고정 (음수 camera 위치 허용)
  G.camera.x = worldW > vpW
    ? Math.max(0, Math.min(worldW - vpW, G.camera.x))
    : -(vpW - worldW) / 2;
  G.camera.y = worldH > vpH
    ? Math.max(0, Math.min(worldH - vpH, G.camera.y))
    : -(vpH - worldH) / 2;
}
```

`clampCamera()`는 줌 변경, 드래그 이동, 창 크기 변경 직후에 호출된다.

---

## 카메라 초기 위치

게임 시작 시 카메라는 기지 중앙 부근에 위치하도록 초기화된다. 맵이 20×28(960×1344px)로 세로형이므로 세로 방향으로 스크롤이 필요하다.

```javascript
G.camera = {
  x: (NEST_ZONE.colMin + 1) * TILE_SIZE - 480 / 2,  // = (9+1)*48 - 240 = 240
  y: 180,
  zoom: 1.0,
}
```

```
초기 카메라 중심: 약 col 10, row 6.4 부근 (기지 내부 중앙 상단)
카메라 좌상단: (240, 180) px
```

- `x = 240`: NEST_ZONE 중심(col 10)이 가로 480px 뷰포트의 정중앙에 오도록 설정. `(NEST_ZONE.colMin + 1) * TILE_SIZE - vp_half`
- `y = 180`: 기지 상단(row 2, 96px)과 NEST(row 3~4) 위를 약간 여유 있게 포함하는 값

카메라 초기 위치는 `initGame()` 직후 `resizeCanvas()` + `clampCamera()` 호출에 의해 실제 뷰포트 크기에 맞게 보정된다.

> **Portrait 재설계 변경:** 기존 카메라 초기값 x=720, y=180(COLS=30 기준)에서 x=240, y=180(COLS=20 기준)으로 변경되었다. NEST_ZONE 위치가 col 14→9로 이동함에 따라 수평 오프셋이 조정되었다.

---

## 줌 버튼 동작

```
zoom-in  버튼: zoom = min(2.0, zoom + 0.25)
zoom-out 버튼: zoom = max(0.5, zoom - 0.25)
```

줌 변경 후 `clampCamera()` → `dirtyTerrain()` 순으로 호출한다. `dirtyTerrain()`이 필요한 이유: offscreen terrain canvas의 드로우는 카메라 변환 밖에서 수행되므로 줌이 바뀌어도 terrain 자체는 재드로우 불필요하지만, 배치 모드 그리드 표시 여부가 zoom에 의해 시각적으로 달라 보일 수 있어 일관성을 위해 호출한다.

---

## DOM 팝업 월드→화면 좌표 변환 (positionNestPopup)

NEST 팝업(`#nest-popup`)은 DOM 요소이므로 카메라 변환이 자동 적용되지 않는다. 월드 좌표로 저장된 건물 위치를 화면 좌표(CSS `left`, `top`)로 직접 변환해야 한다.

```
screenX = (worldX - camera.x) * camera.zoom * canvasScale + canvasOffsetX
screenY = (worldY - camera.y) * camera.zoom * canvasScale + canvasOffsetY
```

- `worldX, worldY`: 건물 중심 픽셀 좌표 (`getBuildingCenter()` 반환값)
- `camera.x, camera.y`: 카메라 좌상단 월드 좌표
- `camera.zoom`: 현재 줌 배율
- `canvasScale`: CSS 표시 크기 / 논리 캔버스 크기 비율 (`G.canvasScale`, `resizeCanvas()`에서 갱신)
- `canvasOffsetX, canvasOffsetY`: `canvas.getBoundingClientRect()`와 `container.getBoundingClientRect()`의 차이

### canvasOffset 계산 방식

```javascript
const containerRect = container.getBoundingClientRect();
const canvasRect    = canvas.getBoundingClientRect();
const canvasOffsetX = canvasRect.left - containerRect.left;
const canvasOffsetY = canvasRect.top  - containerRect.top;
```

landscape 모드에서는 canvas가 화면 중앙에 정렬(`margin: auto`)되어 `canvasOffsetX`가 0보다 클 수 있다. `getBoundingClientRect()`로 실제 CSS 위치를 읽음으로써 이 오프셋이 자동 반영된다.

> **Portrait 재설계 변경:** 이전 구현은 `canvasOffsetX/Y`를 계산하지 않고 팝업 좌표를 `screenX = worldX * canvasScale ...` 형태로 단순 계산했다. landscape에서 canvas가 화면 중앙에 오면 팝업이 왼쪽으로 치우치는 버그가 있었다. `getBoundingClientRect()` 기반 계산으로 수정되었다.

### resize 시 팝업 위치 재조정

`window.addEventListener('resize', ...)` 핸들러에서 팝업이 열려 있을 때 위치를 재계산한다.

```javascript
if (G._nestPopupOpen) {
  const building = G.buildings.find(b => b.id === G.selectedBuildingId);
  if (building) positionNestPopup(building);
}
```

화면 회전(portrait ↔ landscape 전환) 시 resize 이벤트가 발생하며, 이 핸들러로 팝업이 올바른 위치로 즉시 이동한다.

---

## 좌표 변환 요약

```
clientX/Y (브라우저 화면 좌표)
    ↓ getBoundingClientRect + scaleX/Y 보정
논리 캔버스 좌표 (canvas.width/height 기준)
    ↓ / zoom + camera.x/y
월드 좌표 (px, TILE_SIZE 기준)
    ↓ Math.floor / TILE_SIZE
그리드 좌표 (col, row)
```
