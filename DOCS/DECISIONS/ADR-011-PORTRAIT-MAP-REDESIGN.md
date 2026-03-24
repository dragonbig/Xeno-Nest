# ADR-011: 모바일 Portrait 최적화를 위한 맵 비율 재설계

> **카테고리:** DECISIONS
> **최초 작성:** 2026-03-24
> **최종 갱신:** 2026-03-24
> **관련 기능:** 맵 구성, 렌더링/레이아웃, resizeCanvas, positionNestPopup

**상태:** Accepted
**날짜:** 2026-03-24

---

## 맥락

기존 맵은 COLS=30, ROWS=24(월드 크기 1440×1152px, 비율 1.25:1 가로형)으로 설계되었다. 이 비율은 데스크톱이나 landscape 태블릿에는 적합하지만, 모바일 portrait 화면(비율 약 0.56:1)에서는 다음 문제가 발생했다.

1. **캔버스 축소 과다:** `resizeCanvas()`의 `scale = min(availW/gridW, availH/gridH)` 계산에서 세로 방향 제약으로 인해 scale이 과도하게 작아졌다. 720px 기기에서 scale이 0.4 이하로 떨어져 타일이 지나치게 작게 표시되었다.
2. **하단 UI 충돌:** portrait 하단에 고정된 버튼(ad-buff-btn, pause-btn, build-trigger-bar)과 canvas가 겹치는 영역이 발생했다. `resizeCanvas()`가 이 버튼 높이를 가용 높이에서 차감하지 않았기 때문이다.
3. **HUD 높이 오계산:** portrait에서 HUD가 2줄로 배치될 때 높이가 기본값 40px을 초과하지만, `resizeCanvas()`가 상수 `HUD_TOP_H=40`을 그대로 사용하여 HUD와 canvas가 겹쳤다.
4. **팝업 위치 오류:** `positionNestPopup()`이 landscape에서 canvas가 화면 중앙에 정렬될 때 발생하는 수평 오프셋(`canvasOffsetX`)을 반영하지 않아 팝업이 잘못된 위치에 표시되었다.

---

## 결정

### 1. 맵 크기를 세로형으로 재설계

```
변경 전: COLS=30, ROWS=24 → 1440×1152px (비율 1.25:1, 가로형)
변경 후: COLS=20, ROWS=28 → 960×1344px  (비율 0.71:1, 세로형)
```

portrait 화면 비율에 맞추어 맵을 세로형으로 전환한다. 이로써 portrait에서 `scale = min(availW/960, availH/1344)` 계산 시 세로 방향이 지배 제약이 되어 타일 크기가 충분히 확보된다.

### 2. wallProfile, NEST_ZONE, BASE_ENTRANCE, ENTRANCES 재정의

COLS=20 기준으로 모든 맵 구성 요소를 재정의한다.

| 요소 | 변경 전 (COLS=30) | 변경 후 (COLS=20) |
|------|-------------------|-------------------|
| NEST_ZONE | colMin=14, colMax=15, rowMin=3, rowMax=4 | colMin=9, colMax=10, rowMin=3, rowMax=4 |
| BASE_ENTRANCE | row=13, col 14~15 | row=18, col 9~10 |
| 기지 외벽 범위 | row 1~13, col 6~23 | row 2~18, col 3~16 |
| 3시/9시 스폰 행 | row 12 | row 14 |
| 5시/7시 스폰 행 | row 22 | row 26 |

ENTRANCES는 `COLS`, `ROWS` 비율 공식(`COLS-2`, `ROWS/2`, `COLS*0.7` 등)으로 자동 계산되므로 상수 수정 없이 자동 반영된다.

### 3. resizeCanvas()에 portrait 분기 추가

```javascript
const hudH      = document.getElementById('hud-top').offsetHeight || HUD_TOP_H;
const isPortrait = window.innerHeight > window.innerWidth;
const bottomUI   = isPortrait ? 72 : 0;
const availH     = window.innerHeight - hudH - BUILD_PANEL_H - bottomUI;
```

- HUD 높이를 `offsetHeight`로 동적으로 읽어 2줄 배치 시 자동 반영
- portrait에서 하단 버튼 3개(ad-buff-btn, pause-btn, build-trigger-bar)의 점유 높이 72px을 가용 높이에서 차감

### 4. positionNestPopup()에 canvasOffset 계산 추가

```javascript
const canvasRect    = canvas.getBoundingClientRect();
const canvasOffsetX = canvasRect.left - containerRect.left;
const canvasOffsetY = canvasRect.top  - containerRect.top;
const screenX = (worldX - G.camera.x) * G.camera.zoom * G.canvasScale + canvasOffsetX;
const screenY = (worldY - G.camera.y) * G.camera.zoom * G.canvasScale + canvasOffsetY;
```

landscape 중앙 정렬 오프셋을 `getBoundingClientRect()` 차이로 계산하여 반영한다.

### 5. resize 핸들러에서 팝업 위치 재조정

```javascript
window.addEventListener('resize', () => {
  resizeCanvas();
  clampCamera();
  dirtyTerrain();
  if (G._nestPopupOpen) {
    const building = G.buildings.find(b => b.id === G.selectedBuildingId);
    if (building) positionNestPopup(building);
  }
});
```

화면 회전(portrait ↔ landscape 전환) 시 팝업이 즉시 올바른 위치로 이동한다.

### 6. CSS portrait 미디어 쿼리 보강

```css
@media (orientation: portrait) {
  #hud-top   { flex-wrap: wrap; }
  .hud-item  { min-width: 55px; }
  #ad-buff-btn    { bottom: 10px; left: 10px; }
  #pause-btn      { bottom: 10px; left: 60px; }
  #build-trigger-bar { bottom: 10px; }
}
```

HUD의 `flex-wrap: wrap` + `.hud-item min-width: 55px`로 항목이 자동으로 2줄에 배치된다. 하단 버튼 3개를 모두 `bottom: 10px`으로 일관화하여 시각적 정렬을 맞춘다.

---

## 이유

### 맵 비율을 landscape → portrait으로 전환한 이유

타깃 플랫폼이 모바일 portrait 환경이다. landscape 비율 맵을 portrait 화면에 표시하면 `scale` 계산의 제약이 세로 방향에서 결정되어 타일이 과도하게 작아진다. 맵 자체를 portrait 비율로 설계하면 화면을 최대한 활용하면서 타일 크기가 충분히 확보된다.

COLS=20, ROWS=28은 960×1344px(비율 0.71:1)으로 일반적인 모바일 portrait 화면(비율 0.46~0.56:1)보다 가로가 약간 넓어, scale < 1.0이 되어 세로 방향에서 여유가 생긴다. 이 여유가 HUD, 하단 버튼, canvas가 자연스럽게 배치되는 공간을 만든다.

### COLS와 ROWS의 구체적인 수치 선택 이유

| 후보 | 월드 크기 | 비율 | 기각 이유 |
|------|-----------|------|-----------|
| 20×28 | 960×1344 | 0.71 | **채택** — 기지 내부 폭(col 3~16 = 13타일)과 깊이(row 2~18 = 16행)의 균형이 적절 |
| 18×30 | 864×1440 | 0.60 | 가로폭이 너무 좁아 기지 내부 건물 배치 공간 부족 |
| 16×28 | 768×1344 | 0.57 | 좌우 외벽 바깥 행진 공간이 거의 없어 3시/9시 스폰 경로가 짧아짐 |

### bottomUI=72px의 근거

하단 버튼 중 가장 큰 요소는 `#build-trigger-btn`(min-height: 40px) + `#build-trigger-bar`의 패딩(10+10px) + 여유 = 약 60~70px. 이를 올림하여 72px로 설정한다. `BUILD_PANEL_H=72`와 동일한 값을 의도적으로 사용하여 코드 내 의미를 일관시킨다.

### HUD 높이를 상수 대신 offsetHeight로 읽는 이유

portrait에서 HUD 항목이 2줄로 배치되면 실제 높이가 `HUD_TOP_H=40px`을 초과한다. 상수를 사용하면 초과분만큼 canvas가 HUD 아래에 올라오는 겹침이 발생한다. `offsetHeight`로 읽으면 레이아웃이 변해도 자동 보정된다. `|| HUD_TOP_H` 폴백은 DOM이 아직 렌더링되지 않은 초기 호출 시 안전장치이다.

---

## 검토한 대안

### 대안 A: 맵 크기 유지, CSS transform으로 portrait 대응

맵을 그대로 두고 landscape canvas를 portrait 화면에서 90도 회전하는 방식.

기각 이유: 입력 좌표 변환(터치 → 월드)이 회전 각도를 추가로 고려해야 하며, 기존 `getCanvasPos()`, `positionNestPopup()` 등 좌표 관련 로직 전체에 영향을 준다. 코드 복잡도 대비 이점이 없다.

### 대안 B: 맵 크기 유지, portrait에서 zoom을 자동 축소

portrait 진입 시 `G.camera.zoom`을 자동으로 0.5로 낮춰 맵 전체를 보이도록 하는 방식.

기각 이유: 타일이 매우 작아져 터치 입력 정확도가 크게 떨어진다. 또한 하단 버튼 충돌 문제와 HUD 겹침 문제는 해결되지 않는다.

### 대안 C: 맵 크기 유지, portrait 전용 스크롤 뷰

portrait에서 맵이 화면보다 넓으므로 수평 스크롤을 허용하는 방식.

기각 이유: 기존 팬(드래그) 입력과 수평 스크롤이 충돌한다. 사용자가 맵을 팬할 때 브라우저의 기본 스크롤이 동시에 발생하여 UX가 나빠진다.

---

## 결과

- `COLS`가 30 → 20으로 변경되었다.
- `ROWS`가 24 → 28으로 변경되었다.
- 월드 크기가 1440×1152px → 960×1344px으로 변경되었다.
- `NEST_ZONE`이 `{colMin:9, colMax:10, rowMin:3, rowMax:4}`로 변경되었다.
- `BASE_ENTRANCE`가 `[{col:9, row:18}, {col:10, row:18}]`로 변경되었다.
- `wallProfile`이 COLS=20, row 2~18 기준으로 전면 재정의되었다.
- `ENTRANCES`는 비율 공식 유지로 자동 재계산되었다 (col 값 변경됨).
- `resizeCanvas()`에 `isPortrait`, `bottomUI`, `offsetHeight` 기반 동적 HUD 높이 읽기가 추가되었다.
- `positionNestPopup()`이 `canvas.getBoundingClientRect()` 기반 `canvasOffsetX/Y` 계산으로 개선되었다.
- `window.addEventListener('resize', ...)` 핸들러에서 `G._nestPopupOpen` 시 `positionNestPopup()` 재호출이 추가되었다.
- `@media (orientation: portrait)`에 `#hud-top flex-wrap: wrap`, `.hud-item min-width: 55px`, 하단 버튼 `bottom: 10px` 일관화가 추가되었다.
- 카메라 초기값이 `x=240, y=180`으로 변경되었다.
