# 노원맛집산책 프론트엔드

Next.js App Router · TypeScript · Redux Toolkit · React Icons · React Markdown.

전체 서비스 초기 설정과 환경변수는 [루트 README](../README.md)를 참고하세요.

```bash
cp .env.example .env.local
npm ci
npm run dev
```

루트 페이지는 소개 화면, /explore·/community·/mypage는 서버 세션 확인 후 접근합니다. /api 요청은 Next.js rewrite로 FastAPI에 전달합니다. BACKEND_URL은 서버 전용이며 빌드 시 반영됩니다.

```bash
npm run lint
npm test
npx tsc --noEmit
npm run build
```

공개할 인증키를 프론트 설정에 넣지 않습니다. 사진은 로그인 쿠키로 접근하기 위해 Next Image 최적화 프록시를 거치지 않습니다.
