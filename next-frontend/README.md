# 노원맛집산책 프론트엔드

Next.js App Router · TypeScript · Redux Toolkit · React Icons · React Markdown.

## 로컬 실행

이 폴더의 `.env.example`을 `.env`로 복사하세요. `NEXT_PUBLIC_API_URL=http://localhost:8000`을 사용하고 지도에 사용할 `KAKAO_JAVASCRIPT_KEY`를 설정하세요. FastAPI와 DB 설정은 [루트 README](../README.md)를 참고하세요.

```bash
npm ci
npm run dev
```

`http://localhost:3000/group/one/3/`에서 접속하세요. 처음 로그인한 회원은 `/group/one/3/onboarding/address/`에서 기본 주소를 저장합니다. 브라우저가 세션을 확인한 뒤 탐색·커뮤니티·마이페이지·관리자 화면을 표시합니다. FastAPI는 관리자 API마다 권한을 검사합니다.

## /group/one/3 정적 배포

배포 환경에 맞게 이 폴더의 `.env`를 설정하고 빌드하세요. Render의 FastAPI에 직접 연결하는 예시입니다.

```dotenv
NEXT_PUBLIC_API_URL=https://ai-pzdk.onrender.com
KAKAO_JAVASCRIPT_KEY=
```

```bash
npm ci
npm run build
```

`out/` **안의 내용 전체**를 웹 호스트의 `/group/one/3/`에 올리세요. `index.html`, `_next/`, `images/`와 각 페이지 폴더를 같은 구조로 배치하세요. 로컬에서 미리 보려면 동일한 `group/one/3/` 구조를 만든 뒤 `group` 폴더의 상위 디렉터리를 HTTP 서버로 제공하세요. 폴더 주소는 해당 폴더의 `index.html`을 제공해야 합니다.

`NEXT_PUBLIC_API_URL`과 카카오 JavaScript 키는 빌드할 때 브라우저 코드에 포함됩니다. 두 값 중 하나를 바꾸면 다시 빌드하고 `out/`을 배포하세요. JavaScript 키에는 실제 프론트 웹 도메인을 등록하고, 카카오 REST 키와 Client Secret은 백엔드 환경변수에 설정하세요.

Render의 백엔드에는 다음 값을 설정하세요. `FRONTEND_URL`의 프로토콜과 호스트는 브라우저에서 실제로 접속하는 주소와 일치해야 합니다. 프론트가 HTTPS로 열리면 `FRONTEND_URL`에도 `https://`를 사용하세요.

```dotenv
FRONTEND_URL=http://heartbreakkid.co.kr/group/one/3
KAKAO_REDIRECT_URI=https://ai-pzdk.onrender.com/api/auth/kakao/callback
COOKIE_SECURE=true
```

카카오 디벨로퍼스에 `KAKAO_REDIRECT_URI`와 같은 주소를 등록하세요. `/api/status`에서 API 연결 상태를 확인할 수 있습니다. 로그인 전 `/api/auth/me`는 `401`을 반환합니다.

운영 호스트는 `heartbreakkid.co.kr`와 `www.heartbreakkid.co.kr`의 `/group/one/3/`에서 같은 정적 파일을 제공하세요. 위 설정을 기준으로 API는 두 HTTP 주소를 허용하며, 카카오 로그인은 시작한 주소로 돌아갑니다. 카카오 디벨로퍼스의 JavaScript 키에 `http://heartbreakkid.co.kr`과 `http://www.heartbreakkid.co.kr`을 각각 SDK 도메인으로 등록하세요.

같은 출처에서 API를 제공할 경우 `NEXT_PUBLIC_API_URL`을 비운 뒤 빌드하세요. 웹 호스트에서 `/group/one/3/api/*`를 FastAPI의 `/api/*`로 전달하고, `KAKAO_REDIRECT_URI`에는 프론트와 같은 출처의 `/group/one/3/api/auth/kakao/callback` 전체 주소를 입력하세요. 정적 파일의 HTTP 보안 헤더는 웹 호스트에서 설정하세요.

프론트와 API의 사이트가 다르면 Chrome 시크릿 창의 서드 파티 쿠키 차단으로 로그인이 제한될 수 있습니다. 시크릿 창까지 지원하려면 프론트와 API를 같은 HTTPS 사이트의 도메인으로 운영하거나 위의 동일 출처 API 구성을 사용하세요. [Chrome의 쿠키 설정](https://support.google.com/chrome/answer/95647?hl=ko)

커뮤니티 상세와 수정 주소는 각각 `/group/one/3/community/detail/?id=42`, `/group/one/3/community/edit/?id=42`입니다. 전역 폰트는 눈누에서 제공하는 G마켓 산스를 사용합니다. [글꼴 정보](https://noonnu.cc/font_page/366)

## 검사

```bash
npm run lint
npm test
npx tsc --noEmit
npm run build
```
