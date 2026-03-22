# 실행 및 개발 환경 가이드

> **카테고리:** OPERATIONS
> **최초 작성:** 2026-03-23
> **최종 갱신:** 2026-03-23
> **관련 기능:** 로컬 실행, 파일 구성, 개발 환경

## 개요

XenoNest는 외부 라이브러리, 빌드 도구, 서버 없이 동작한다. `index.html`을 브라우저에서 열면 즉시 게임이 실행된다.

---

## 파일 구성

```
C:\XenoNest\
├── index.html    진입점 — 캔버스, HUD, 패널 DOM 정의 + game.js 로드
├── style.css     레이아웃, HUD, 패널, 오버레이 스타일
└── game.js       전체 게임 로직 (~1988줄)
```

세 파일이 같은 디렉토리에 있어야 한다. `game.js`와 `style.css`는 `index.html`에서 상대 경로로 참조한다.

---

## 브라우저에서 직접 실행

1. `C:\XenoNest\index.html`을 브라우저로 열기.
   - Windows 탐색기에서 더블 클릭
   - 브라우저 주소창에 `file:///C:/XenoNest/index.html` 입력

2. XenoNest 타이틀 오버레이가 표시되면 "게임 시작" 버튼을 클릭한다.

3. 게임이 즉시 시작된다.

**`file://` 프로토콜 제한:** 이 게임은 파일 시스템 API나 외부 리소스를 사용하지 않으므로 `file://` 프로토콜에서 제한 없이 동작한다.

---

## 로컬 개발 서버 (선택)

변경 사항을 즉시 확인할 목적이면 간단한 HTTP 서버를 띄울 수 있다. 게임 동작 자체에는 필요하지 않다.

```bash
# Python 3가 설치된 경우
cd C:\XenoNest
python -m http.server 8000
# 브라우저에서 http://localhost:8000 접속
```

---

## 지원 환경

| 환경 | 상태 |
|------|------|
| Chrome / Edge (최신) | 정상 동작 |
| Firefox (최신) | 정상 동작 |
| iOS Safari | 정상 동작 (터치 입력 지원) |
| Android Chrome | 정상 동작 (터치 입력 지원) |
| Internet Explorer | 미지원 (ES6+ 사용) |

---

## 외부 의존성

없음. 다음 기술만 사용한다:

- HTML5 Canvas 2D API
- 바닐라 JavaScript ES6+
- CSS3

npm, node_modules, CDN 링크, 이미지/오디오 파일 없음.

---

## 코드 수정 후 반영 방법

`game.js` 또는 `style.css`를 수정한 후 브라우저에서 `F5` 또는 `Ctrl+Shift+R`(강제 새로고침)로 변경 사항이 반영된다.

---

## 게임 재시작

브라우저를 새로고침하거나, 게임 오버/승리 화면에서 "다시 시작" / "다시 플레이" 버튼을 클릭한다. 버튼 클릭 시 `startNewGame()` → `initGame()`이 호출되어 `G` 객체가 완전히 초기화된다.
