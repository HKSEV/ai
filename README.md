# 노원맛집산책

Gemini와 대화하며 취향·지역·예산에 맞는 노원구 음식점을 찾는 서비스입니다. 기존 FastAPI의 controller/service/dto/config 구조와 Next.js App Router·TypeScript·Redux 패턴을 유지하고 Streamlit 화면과 의존성을 제거했습니다.

## 구현 내용

- 따뜻한 골목 식당 일러스트가 있는 소개 화면과 하단 카카오 시작 버튼. 포레스트 그린·테라코타·크림 팔레트, 모바일 고정 내비게이션, 공통 카드·폼·대화·모달·오류/빈 목록/로딩.
- 카카오 인가 코드·사용자 ID 확인을 **백엔드에서** 처리. 최초 가입만 랜덤 닉네임 배정, 정규화한 닉네임 중복 검사, 재로그인 시 기존 프로필 유지.
- DB에 해시로 저장하는 서버 세션과 HttpOnly 쿠키. 기본 14일 유지, 로그아웃·만료·변경 요청 출처 검사. 키가 없으면 로그인/AI를 성공으로 대체하지 않습니다.
- 이전 조건·최근 대화가 이어지는 AI 탐색. 기본 주소, 선호 음식, 1인 예산, 최근 검색, 직접 남긴 방문과 높은 별점 리뷰의 분류를 개인화에 반영합니다.
- 서비스 후기/음식점 리뷰 CRUD, 유형별 목록·최신/오래된순·페이지네이션, 본인 수정/삭제, 선택적 사진·방문 기록 연결.
- 닉네임·취향·주소와 기본 출발지 관리, 대화/검색·방문·내 글 조회/삭제. 검색·추천은 실제 방문으로 저장하지 않습니다.
- 업로드 영수증은 본인만 조회합니다. 공개 게시글에 연결된 사진만 다른 로그인 회원에게 보이며, 영수증 첨부와 실제 방문 인증은 별도 상태입니다.

음식점은 DB 또는 실제 카카오 로컬 응답에서 조회합니다. Gemini는 조건 추출 및 후보 순서·설명 근거 선택을 담당합니다. 서버가 ID와 근거를 검증하고 확인된 사실로 설명을 구성하므로 모델이 만든 음식점·가격·영업 상태를 그대로 노출하지 않습니다.

## 폴더

| 경로 | 역할 |
| --- | --- |
| `next-frontend/src/app` | 소개·AI 탐색·커뮤니티·마이페이지 라우트, 타입·API 호출 |
| `next-frontend/src/components` | 공통 UI, 화면별 컴포넌트 |
| `next-frontend/src/store` | 로그인 사용자와 현재 대화 Redux 상태 |
| `backend/controller` | 인증·회원·대화·음식점·커뮤니티·첨부 파일 API |
| `backend/service` | 권한·추천·프로필·메뉴 계산·외부 제공처 계약 |
| `backend/entity` | MySQL SQLAlchemy 모델 12개 |
| `backend/scripts` | DB 생성, 이용 가능한 데이터 등록, 미사용 파일 정리 |
| `docs/schema.sql` | MySQL DDL |
| `docs/VERIFICATION.md` | 실행한 검증과 실제 외부 연동의 한계 |

## 로컬 실행

Python **3.12 이상**, Node.js **22 이상**, uv, MySQL **8.4**가 필요합니다. 실제 값은 저장소에 올리지 않습니다.

1. 루트 `.env.example`을 `.env`로, `backend/.env.example`을 `backend/.env`로, `next-frontend/.env.example`을 `next-frontend/.env.local`로 복사하고 값을 설정합니다. Windows PowerShell에서는 `Copy-Item 원본 대상`을 사용할 수 있습니다.
2. MySQL 관리자 계정에서 DB와 앱 계정을 만듭니다. 아래 비밀번호는 실제 값으로 교체합니다.

```sql
CREATE DATABASE nowon_food CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'nowon'@'localhost' IDENTIFIED BY 'YOUR_APP_PASSWORD';
GRANT ALL PRIVILEGES ON nowon_food.* TO 'nowon'@'localhost';
```

3. 백엔드:

```bash
cd backend
uv sync --frozen
uv run python -m scripts.init_db
uv run uvicorn main:app --reload --port 8000
```

4. 별도 터미널에서 프론트엔드:

```bash
cd next-frontend
npm ci
npm run dev
```

`http://localhost:3000`으로 접속합니다. 프론트의 `/api/*` 요청은 Next.js rewrite를 통해 백엔드로 전달됩니다. 쿠키 호스트를 일치시키기 위해 localhost와 127.0.0.1을 브라우저에서 섞어 사용하지 마세요. API 명세는 `http://127.0.0.1:8000/docs`에서 확인할 수 있습니다. 변경 API를 직접 호출할 때는 `X-Requested-With: nowon-walk` 헤더와 로그인 쿠키가 필요합니다.

`init_db`는 테이블이 없을 때 생성하고 기존 데이터는 유지합니다. 이전 별도 스키마가 있다면 백업과 마이그레이션이 필요하며, 자동으로 기존 컬럼을 변경하지는 않습니다.

## Docker Compose

루트 `.env`에 MySQL 비밀번호 2개를 설정하고 `backend/.env`에 외부 서비스 키를 입력합니다.

```bash
docker compose up -d db
docker compose run --rm init
docker compose up --build -d backend frontend
```

DB와 업로드는 각각 named volume에 보관됩니다. 프론트 주소는 localhost:3000입니다. Compose의 DB 비밀번호는 루트 `MYSQL_PASSWORD`가 사용되며 `backend/.env`의 호스트·비밀번호를 컨테이너 연결에 맞게 덮어씁니다.

## 환경변수

| 위치 | 변수 | 용도 |
| --- | --- | --- |
| 루트 `.env` | `MYSQL_ROOT_PASSWORD`, `MYSQL_PASSWORD` | Compose 관리자/앱 DB 비밀번호 |
| 백엔드 | `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | MySQL 연결. `DATABASE_URL`이 있으면 우선 사용 |
| 백엔드 | `FRONTEND_URL` | 정확한 서비스 origin. 기본 http://localhost:3000 |
| 백엔드 | `KAKAO_REST_API_KEY` | 카카오 로그인 REST API 키 |
| 백엔드 | `KAKAO_CLIENT_SECRET` | 카카오 앱에서 Client Secret을 사용한다면 설정 |
| 백엔드 | `KAKAO_REDIRECT_URI` | 기본 http://localhost:3000/api/auth/kakao/callback |
| 백엔드 | `KAKAO_LOCAL_REST_API_KEY` | 선택적 실제 장소 검색 |
| 백엔드 | `KAKAO_PLACE_STORAGE_ALLOWED` | 저장·재이용 권한 확인 후 true. 기본 false |
| 백엔드 | `GEMINI_API_KEY`, `GEMINI_MODEL` | Google GenAI 인증 및 사용 가능한 구조화 출력 지원 모델 ID |
| 백엔드 | `SESSION_DAYS`, `COOKIE_SECURE` | 기본 14일, HTTPS 운영 시 COOKIE_SECURE=true |
| 백엔드 | `INCLUDE_DEMO_DATA` | 개발 예시 노출 여부. 기본 false |
| 백엔드 | `DATA_MAX_AGE_DAYS` | 메뉴·영업시간 신뢰 기한. 기본 30일 |
| 백엔드 | `UPLOADS_DIR` | 기본 backend/uploads. 운영 시 영속 볼륨 |
| 프론트 | `BACKEND_URL` | 서버 전용 백엔드 주소. 배포 빌드 시 적용 |

Gemini 모델은 예시 ID를 무조건 사용하지 말고 해당 API 키에서 접근 가능한 모델로 설정합니다. 키와 DB 연결 정보는 프론트의 NEXT_PUBLIC 변수로 전달하지 않습니다.

카카오 개발자 콘솔에서 카카오 로그인을 활성화하고 서비스 URL과 정확히 일치하는 Redirect URI를 등록해야 합니다. 필요한 동의 항목을 설정하고, 키·쿼터·앱 상태를 확인해 주세요. 카카오 access token은 브라우저로 전달하거나 DB에 보관하지 않고 계정 식별 확인 후 폐기합니다. 로그아웃은 이 서비스의 세션을 종료합니다.

## 음식점 데이터와 추천의 범위

최초 DB는 빈 상태입니다. **실제 음식점을 가상 데이터로 채우지 않습니다.** 데이터 사용 권한이 있는 JSON을 등록하거나, 이용 조건을 확인한 카카오 로컬 연동을 활성화해야 추천 후보가 생깁니다.

```bash
cd backend
uv run python -m scripts.import_restaurants /path/to/licensed-restaurants.json
```

JSON 필드는 `backend/data/restaurants.example.json`을 참고합니다. 기본 정보·영업시간·메뉴 각각 출처와 확인 시각을 따로 등록합니다. `servings`는 해당 메뉴/세트가 식사를 제공하는 인원입니다. 밑반찬·추가 공깃밥을 완전한 1인 식사로 등록하지 마세요. 메뉴 조합은 확인된 메뉴를 반복 주문하여 인원을 충족하는 최소 예상액이며 맛의 조합이나 재고를 보장하지 않습니다.

개발용 가상 식당은 명시적으로 다음처럼 등록하며, 노출하려면 `INCLUDE_DEMO_DATA=true`도 필요합니다.

```bash
uv run python -m scripts.import_restaurants data/restaurants.example.json --demo
```

- 카카오 검색은 노원구 음식점·카페만 저장하며 전화·주소·분류·좌표·출처·조회 시각을 제공합니다. 영업시간이나 가격이 있는 것처럼 보완하지 않습니다.
- 일반 영업시간으로 계산한 상태와 실시간 상태는 분리합니다. 요일/시각/휴무/브레이크타임 및 자정 넘김을 처리하며, 정보가 없거나 오래되면 확인 필요로 표시합니다.
- 메뉴 가격이 최신 범위에 있을 때만 실제 가격·세트 인원수로 총액과 1인 예상액을 계산합니다. 가격 미확인은 예산을 충족했다고 표시하지 않습니다.
- 위치 좌표가 있을 때 직선거리를 계산하여 명시합니다. 경로·교통수단 데이터가 없으므로 이동 시간을 생성하지 않습니다. 위치 거부 시 직접 지역·역명·주소를 입력할 수 있습니다.
- 외부 리뷰·실시간 영업·대기·결제 추정액·재방문율·외부 방문 인증·영수증 검증은 제공처 미연동 상태입니다. 해당 지표는 null/정보 없음으로 유지하고 `service/provider_contracts.py`에 교체 가능한 인터페이스를 두었습니다.
- Gemini에 보낼 수 있는 정보는 입력 대화, 기본 출발지, 음식 취향·예산, 최근 검색 및 직접 기록한 방문/리뷰 분류와 추천 후보입니다. 영수증 이미지, 카카오 토큰과 식별값은 전달하지 않습니다. 실제 운영 시 개인정보 처리 안내와 제공처 보관 조건을 적용해야 합니다.

## 기록과 파일 관리

대화 삭제 시 연결 메시지·검색 조건·추천 이력도 DB 외래키로 삭제됩니다. 직접 남긴 방문 기록과 게시글은 각각 관리합니다. 방문을 삭제해도 이미 공개한 리뷰는 유지되며 연결 인증 상태만 해제됩니다. 리뷰의 사진은 글 삭제/첨부 해제 시 정리하고, 영수증은 방문 기록에서 제거 시 정리합니다.

작성 취소 등으로 연결되지 않은 첨부는 하루가 지난 후 다음 명령으로 정리할 수 있습니다.

```bash
cd backend
uv run python -m scripts.cleanup_uploads
```

## 검증

```bash
cd backend
APP_ENV=test uv run python -m unittest discover -s tests -v

cd ../next-frontend
npm run lint
npm test
npx tsc --noEmit
npm run build
```

PowerShell은 `$env:APP_ENV="test"`로 설정 후 Python 검사를 실행합니다. GitHub Actions는 전용 MySQL 8.4 DB에서 API/저장 테스트를 실행합니다. 로컬의 SQLite 테스트는 오직 APP_ENV=test에서 허용되며 서비스 실행용 DB를 대체하지 않습니다. 상세 결과와 실제 외부 API 및 화면 검증 범위는 [검증 기록](docs/VERIFICATION.md)을 참고하세요.

공식 연동 문서: [카카오 로그인](https://developers.kakao.com/docs/ko/kakaologin/rest-api), [카카오 로컬](https://developers.kakao.com/docs/ko/local/dev-guide), [Gemini 구조화 출력](https://ai.google.dev/gemini-api/docs/structured-output?hl=ko).
