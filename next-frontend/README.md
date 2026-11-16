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

`BACKEND_URL`은 로컬 개발과 Next.js 서버에서 사용합니다. `KAKAO_JAVASCRIPT_KEY`는 카카오 지도를 표시하기 위해 빌드 시 브라우저에 공개합니다. 카카오 REST 키와 Client Secret은 백엔드에 설정하세요. 전역 폰트는 눈누에서 제공하는 [G마켓 산스](https://noonnu.cc/font_page/366)를 사용합니다. 사진은 로그인 쿠키를 사용하는 원본 URL에서 불러옵니다.

## /group/one/3 정적 배포

`npm run build`의 결과는 `out/`에 생성됩니다. `out/`의 내용 전체를 웹 서버의 `/group/one/3/`에 배포하고, 같은 도메인의 `/group/one/3/api/`를 FastAPI의 `/api/`로 프록시하세요. API 요청과 업로드 파일에 배포 경로를 적용합니다.

예시 도메인이 `https://example.com`이라면 백엔드에 다음 값을 설정하세요. `KAKAO_REDIRECT_URI`와 같은 주소를 카카오 디벨로퍼스에도 등록하세요.

```dotenv
FRONTEND_URL=https://example.com/group/one/3
KAKAO_REDIRECT_URI=https://example.com/group/one/3/api/auth/kakao/callback
COOKIE_SECURE=true
```

Nginx를 사용하고 `out/`의 내용을 `/srv/www/group/one/3/`에 배치했다면 `server` 블록에 다음과 같이 설정할 수 있습니다.

```nginx
location = /group/one/3 {
  return 308 /group/one/3/$is_args$args;
}

location /group/one/3/api/ {
  client_max_body_size 6m;
  proxy_pass http://127.0.0.1:8000/api/;
}

location /group/one/3/ {
  root /srv/www;
  index index.html;
  try_files $uri $uri/ =404;
  add_header X-Content-Type-Options nosniff always;
  add_header Referrer-Policy strict-origin-when-cross-origin always;
  add_header X-Frame-Options DENY always;
}
```

커뮤니티 상세와 수정은 각각 `/community/detail/?id=42`, `/community/edit/?id=42`를 사용합니다. 관리자 화면은 브라우저에서 로그인과 역할을 확인한 뒤 표시하고 FastAPI는 관리자 API마다 권한을 검사합니다.

`npm run dev`와 Docker Compose는 기존 루트 경로의 Next.js 서버를 사용합니다. Docker 없이 Next.js 서버 빌드를 실행하려면 빌드와 실행 환경 모두에 `NOWON_NEXT_SERVER=true`를 설정한 뒤 `npm run build`와 `npm run start`를 실행하세요.
