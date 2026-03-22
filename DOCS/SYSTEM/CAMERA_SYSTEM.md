# 카메라 시스템

> **카테고리:** SYSTEM
> **최초 작성:** 2026-03-23
> **최종 갱신:** 2026-03-23 (맵 재설계)
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
  const worldW = COLS * TILE_SIZE;  // 1440
  const worldH = ROWS * TILE_SIZE;  // 1152
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

게임 시작 시 카메라는 기지 중앙 부근에 위치하도록 초기화된다. 맵 재설계로 맵이 30×24로 확대되었으므로, 전체 맵이 아닌 기지 영역이 화면에 표시된다.

```
초기 카메라 중심: col 15, row 7 부근 (기지 내부 중앙)
픽셀 좌표: (720, 336) 부근
```

카메라 초기 위치는 뷰포트 크기에 따라 `clampCamera()`로 보정된다.

> **맵 재설계 변경:** 기존에는 12×16 맵 전체가 화면에 들어왔으나, 30×24로 확대되면서 카메라 초기 위치를 기지 중앙으로 명시적으로 설정해야 한다.

---

## 줌 버튼 동작

```
zoom-in  버튼: zoom = min(2.0, zoom + 0.25)
zoom-out 버튼: zoom = max(0.5, zoom - 0.25)
```

줌 변경 후 `clampCamera()` → `dirtyTerrain()` 순으로 호출한다. `dirtyTerrain()`이 필요한 이유: offscreen terrain canvas의 드로우는 카메라 변환 밖에서 수행되므로 줌이 바뀌어도 terrain 자체는 재드로우 불필요하지만, 배치 모드 그리드 표시 여부가 zoom에 의해 시각적으로 달라 보일 수 있어 일관성을 위해 호출한다.

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
