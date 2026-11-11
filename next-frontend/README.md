# 노원맛집산책 프론트엔드

Next.js App Router · TypeScript · Redux Toolkit · React Icons · React Markdown.

전체 서비스 초기 설정과 환경변수는 [루트 README](../README.md)를 참고하세요. 이 폴더의 `.env`에 `BACKEND_URL`과 `KAKAO_JAVASCRIPT_KEY`를 설정하세요.

```bash
npm ci
npm run dev
```

루트 페이지는 소개 화면입니다. 처음 로그인한 회원은 `/onboarding/address`에서 기본 주소를 저장합니다. `/explore`·`/community`·`/mypage`는 서버 세션 확인 후 접근합니다. `/api` 요청은 Next.js rewrite로 FastAPI에 전달합니다.

```bash
npm run lint
npm test
npx tsc --noEmit
npm run build
```

`BACKEND_URL`은 서버에서 사용합니다. `KAKAO_JAVASCRIPT_KEY`는 카카오 지도를 표시하기 위해 빌드 시 브라우저에 공개합니다. 카카오 REST 키와 Client Secret은 백엔드에 설정하세요. 전역 폰트는 눈누에서 제공하는 [G마켓 산스](https://noonnu.cc/font_page/366)를 사용합니다. 사진은 로그인 쿠키로 접근하기 위해 Next Image 최적화 프록시를 거치지 않습니다.
