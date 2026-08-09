# design/

claude.ai/design 프로젝트 `5b8804ed-775d-4ad9-a490-d36698c90f32`에서 반입한 **참조 자료**. 빌드에 포함되지 않는다.

화면 사양은 `docs/DESIGN.md`가 정본이다. 이 폴더는 그 근거 자료다.

```
kijun-design-system/    토큰 CSS 7개 + styles.css + readme + 컴포넌트 번들
```

## 주의

- **`kijun-design-system/readme.md`의 Index 절반은 실재하지 않는다.** `components/`, `guidelines/`, `ui_kits/`, `templates/`를 나열하지만 원격 프로젝트에 없다. 컴포넌트 구현은 `_ds_bundle.js`(16종 컴파일본) 안에만 있다. readme는 원문 그대로 두었다 — `docs/DESIGN.md` §9 참조.
- **readme의 브랜드 서사는 다른 제품의 것이다.** "저장소를 읽는 에디터"로 서술돼 있다. 토큰은 그대로 쓰고, 브랜드 카피와 타임라인 파스텔 5색은 적용 대상이 아니다.
- **프로토타입 소스는 반입하지 않았다.** 규준 수치를 코드에 하드코딩하는 등 ADR-002·014와 충돌한다. 화면 사양은 `docs/DESIGN.md`로 옮겼고, 충돌 8건은 §10에 정리했다.
- **`fonts.css`가 Google Fonts를 `@import`한다.** 제품에 편입할 때는 `next/font` 셀프호스팅으로 바꾼다.
