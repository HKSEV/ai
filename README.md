# 노원맛집산책

AI와 대화하며 취향·지역·예산에 맞는 노원구 음식점을 찾는 서비스입니다. 기존 FastAPI의 controller/service/dto/config 구조와 Next.js App Router·TypeScript·Redux 패턴을 유지하고 Streamlit 화면과 의존성을 제거했습니다.

## 구현 내용

- 따뜻한 골목 식당 일러스트가 있는 소개 화면과 하단 카카오 시작 버튼. 포레스트 그린·테라코타·크림 팔레트, 모바일 고정 내비게이션, 공통 카드·폼·대화·모달·오류/빈 목록/로딩.
- 카카오 인가 코드·사용자 ID 확인을 **백엔드에서** 처리. 최초 가입만 랜덤 닉네임 배정, 정규화한 닉네임 중복 검사, 재로그인 시 기존 프로필 유지.
- DB에 해시로 저장하는 서버 세션과 HttpOnly 쿠키. 기본 14일 유지, 로그아웃·만료·변경 요청 출처 검사. 키가 없으면 로그인/AI를 성공으로 대체하지 않습니다.
- 이전 조건·최근 대화가 이어지는 AI 탐색. 기본 주소, 선호 음식, 1인 예산, 최근 검색, 직접 남긴 방문과 높은 별점 리뷰의 분류를 개인화에 반영합니다.
- 추천 음식점의 마커를 카카오 지도에 표시합니다. 현재 위치, 저장 주소, 지도에서 선택한 위치를 기준으로 직선거리 반경 검색을 지원합니다.
- 처음 카카오로 로그인하면 지도에서 기본 주소를 지정합니다. 제공된 카카오계정 이메일은 마이페이지에서 읽기 전용으로 표시합니다.
- 서비스 후기/음식점 리뷰 CRUD, 유형별 목록·최신/오래된순·페이지네이션, 본인 수정/삭제, 선택적 사진·방문 기록 연결.
- 닉네임·취향·주소와 기본 출발지 관리, 대화/검색·방문·내 글 조회/삭제. 검색·추천은 실제 방문으로 저장하지 않습니다.
- 업로드 영수증은 본인만 조회합니다. 공개 게시글에 연결된 사진만 다른 로그인 회원에게 보이며, 영수증 첨부와 실제 방문 인증은 별도 상태입니다.

음식점은 DB 또는 카카오 로컬 응답에서 조회합니다. AI는 새 탐색과 후속 요청을 구분하고, 식당별로 카드용 추천 이유와 채팅용 설명을 작성합니다. 서버는 음식점 ID와 해당 식당의 근거를 검증합니다. 채팅과 추천 카드는 같은 추천 메뉴와 예상 금액을 표시합니다.

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
| `docs/mysql-verification.md` | 실제 MySQL 8.4.13 통합 검증 결과와 재실행 방법 |
| `docs/ASSETS.md` | 생성한 소개 화면 배경과 제작 요구사항 |

## 로컬 실행

Python **3.12 이상**, Node.js **22 이상**, uv, MySQL **8.4**가 필요합니다. 실제 값은 저장소에 올리지 않습니다.

1. 아래 환경변수 표에 따라 `backend/.env`와 `next-frontend/.env`를 설정하세요.
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

`init_db`는 새 데이터베이스에 테이블을 생성합니다. 기존 DB는 백엔드를 재시작하기 전에 다음 명령으로 `users.email`과 `users.address_setup_pending` 컬럼을 추가하세요.

```bash
cd backend
uv run python -m scripts.migrate_kakao_profile
```

마이그레이션은 기존 회원과 주소를 유지합니다. 기존 회원의 주소 지정 상태는 완료로 초기화하며, 이후 가입하는 회원에게 첫 주소 지정 화면을 표시합니다.

## Docker Compose

루트 `.env`에 MySQL 비밀번호 2개와 `KAKAO_JAVASCRIPT_KEY`를 설정하세요. `backend/.env`에 외부 서비스 키를 입력하세요.

```bash
docker compose up -d db
docker compose run --rm init
docker compose up --build -d backend frontend
```

DB와 업로드는 각각 named volume에 보관됩니다. 프론트 주소는 localhost:3000입니다. Compose의 DB 비밀번호는 루트 `MYSQL_PASSWORD`가 사용되며 `backend/.env`의 호스트·비밀번호를 컨테이너 연결에 맞게 덮어씁니다.

기존 MySQL 볼륨을 업데이트할 때는 `docker compose run --rm init python -m scripts.migrate_kakao_profile`을 실행하세요.

## 환경변수

| 위치 | 변수 | 용도 |
| --- | --- | --- |
| 루트 `.env` | `MYSQL_ROOT_PASSWORD`, `MYSQL_PASSWORD` | Compose 관리자/앱 DB 비밀번호 |
| 백엔드 | `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | MySQL 연결. `DATABASE_URL`이 있으면 우선 사용 |
| 백엔드 | `FRONTEND_URL` | 정확한 서비스 origin. 기본 http://localhost:3000 |
| 백엔드 | `KAKAO_REST_API_KEY` | 카카오 로그인 REST API 키 |
| 백엔드 | `KAKAO_CLIENT_SECRET` | 카카오 앱에서 Client Secret을 사용한다면 설정 |
| 백엔드 | `KAKAO_REDIRECT_URI` | 기본 http://localhost:3000/api/auth/kakao/callback |
| 백엔드 | `KAKAO_LOCAL_REST_API_KEY` | 실제 장소 검색과 텍스트 출발지의 좌표 조회 |
| 백엔드 | `KAKAO_PLACE_STORAGE_ALLOWED` | 저장·재이용 권한 확인 후 true. 기본 false |
| 백엔드 | `KAKAO_MOBILITY_REST_API_KEY` | 자동차 길찾기 API 이용 권한을 부여받은 앱의 REST API 키 |
| 백엔드 | `GEMINI_API_KEY`, `GEMINI_MODEL` | Google GenAI 인증 및 사용 가능한 구조화 출력 지원 모델 ID |
| 백엔드 | `SESSION_DAYS`, `COOKIE_SECURE` | 기본 14일, HTTPS 운영 시 COOKIE_SECURE=true |
| 백엔드 | `INCLUDE_DEMO_DATA` | 개발 예시 노출 여부. 기본 false |
| 백엔드 | `DATA_MAX_AGE_DAYS` | 메뉴·영업시간 신뢰 기한. 기본 30일 |
| 백엔드 | `UPLOADS_DIR` | 기본 backend/uploads. 운영 시 영속 볼륨 |
| 프론트 | `BACKEND_URL` | 서버 전용 백엔드 주소. 배포 빌드 시 적용 |
| 프론트 | `KAKAO_JAVASCRIPT_KEY` | 지도에 사용하는 카카오 JavaScript 키. 빌드 시 브라우저에 공개 |

Gemini API 키에서 사용할 수 있는 모델 ID를 설정하세요. 카카오 REST 키, Client Secret, Gemini 키와 DB 연결 정보는 백엔드 환경변수에 설정하세요.

### 카카오 설정

- 카카오 디벨로퍼스에서 카카오맵을 활성화하고 JavaScript 키에 실제 웹 서비스 도메인을 등록하세요. 로컬 개발은 `http://localhost:3000`을 등록하고 같은 주소로 접속하세요.
- 카카오 로그인을 활성화하고 `KAKAO_REDIRECT_URI`와 일치하는 Redirect URI를 등록하세요. 동의항목에서 **카카오계정(이메일)**을 **선택 동의**로 설정하세요. 카카오가 이메일을 제공하지 않으면 `미제공`으로 표시합니다.
- 카카오 로컬 음식점 검색과 저장을 사용할 때는 `KAKAO_LOCAL_REST_API_KEY`와 `KAKAO_PLACE_STORAGE_ALLOWED=true`를 설정하세요. `/api/status`에서 `kakao_local_configured`를 확인할 수 있습니다.
- [카카오모빌리티 길찾기](https://developers.kakaomobility.com/guide/navi-api/directions) 사용 권한을 확인하고 `KAKAO_MOBILITY_REST_API_KEY`를 설정하세요. 지정한 출발지 또는 기본 주소에서 음식점까지 자동차 예상 소요 시간을 조회합니다. `/api/status`에서 `kakao_mobility_configured`를 확인할 수 있습니다.

카카오 access token은 서버가 계정 정보를 조회하는 데 사용합니다. 로그아웃은 이 서비스의 세션을 종료합니다. 현재 위치를 조회할 때 브라우저 위치 권한을 사용하며, 배포 환경에서는 HTTPS가 필요합니다.

## 음식점 데이터와 추천의 범위

최초 DB는 빈 상태입니다. **실제 음식점을 가상 데이터로 채우지 않습니다.** 데이터 사용 권한이 있는 JSON을 등록하거나, 이용 조건을 확인한 카카오 로컬 연동을 활성화해야 추천 후보가 생깁니다.

```bash
cd backend
uv run python -m scripts.import_restaurants /path/to/licensed-restaurants.json
```

JSON 필드는 `backend/data/restaurants.example.json`을 참고하세요. 기본 정보·영업시간·메뉴 각각 출처와 확인 시각을 따로 등록합니다. `servings`는 해당 메뉴나 세트가 식사를 제공하는 인원입니다. 밑반찬·추가 공깃밥을 완전한 1인 식사로 등록하지 마세요.

개발용 가상 식당은 명시적으로 다음처럼 등록하며, 노출하려면 `INCLUDE_DEMO_DATA=true`도 필요합니다.

```bash
uv run python -m scripts.import_restaurants data/restaurants.example.json --demo
```

- 카카오 로컬 검색은 노원구 음식점·카페의 이름·주소·분류·좌표·상세 페이지 링크와 제공된 전화번호를 조회합니다. 요일별 영업시간, 공휴일·임시 휴무, 가격은 카카오 로컬 응답에 포함되지 않습니다. [카카오 로컬 응답 필드](https://developers.kakao.com/docs/ko/local/dev-guide#search-by-keyword-response-body)
- 추천 카드의 `상세정보`에서 카카오 장소 페이지를 열어 영업시간을 확인합니다. 음식 분류는 분류 경로의 뒤에서 두 번째 항목을 표시하고, 분류가 하나면 해당 값을 표시합니다. 방문 시각의 영업 여부 판단에는 등록된 요일별·날짜별 일정을 사용합니다.
- 영업시간은 [매장 공식 안내](https://www.shinsegaefood.com/nobrandburger/index.sf?category1Seq=1&goodId=140)나 [한국관광공사 공개 데이터](https://www.data.go.kr/data/15101578/openapi.do)에서 해당 식당과 일정의 적용 범위 및 이용 조건을 확인한 뒤 등록하세요. 확인된 요일·날짜만 입력하세요.
- Gemini는 등록 메뉴와 가격을 우선 참고하고, 정보가 부족하면 음식 분류에 맞는 주문 예시와 예상 총액을 제안합니다. 인원이 있으면 예상 총액을 기준으로 1인당 금액을 표시합니다.
- 위치 좌표가 있을 때 직선거리를 계산하여 명시합니다. 반경 검색은 기준 위치와 음식점 좌표 사이의 직선거리로 필터링합니다. 위치 권한을 거부하면 저장한 좌표를 사용하거나 지도에서 기준점을 선택할 수 있습니다. 반경 검색의 기준점은 후속 탐색에 사용할 수 있도록 해당 대화의 조건과 함께 보관합니다.
- 외부 리뷰·실시간 영업·대기·결제 추정액·재방문율·외부 방문 인증·영수증 검증은 제공처 미연동 상태입니다. 해당 지표는 null/정보 없음으로 유지하고 `service/provider_contracts.py`에 교체 가능한 인터페이스를 두었습니다.
- 조건 추출에는 입력 대화, 출발지, 취향·예산, 최근 검색과 방문·리뷰의 음식 분류를 사용합니다. 운영 시 개인정보 처리 안내와 제공처의 보관 조건을 적용하십시오.

### 이미 등록된 음식점의 영업 일정 갱신

카카오에서 찾은 음식점은 장소 ID에 `kakao:`를 붙여 `external_id`를 입력하십시오. `hours`에 요일별 일정, `hours.exceptions`에 날짜별 변경이나 임시 휴무를 등록하십시오. 기존 `closed_dates`도 날짜별 휴무로 적용합니다. 같은 날짜에 두 종류를 등록하면 `closed_dates`의 휴무를 적용합니다. 확인한 출처, 출처 링크, 시간대가 포함된 확인 시각을 함께 기록하십시오.

```json
[
  {
    "external_id": "kakao:장소ID",
    "hours_source": "매장 공식 안내",
    "hours_source_url": "https://example.com/store",
    "hours_checked_at": "2026-11-11T12:00:00+09:00",
    "hours": {
      "mon": {"open": "11:00", "close": "21:00"},
      "exceptions": {
        "2026-12-25": {"open": "12:00", "close": "18:00"},
        "2026-12-31": {"closed": true}
      }
    }
  }
]
```

확인한 값으로 바꾼 뒤 다음 명령을 실행하십시오. 영업 일정은 기존 JSON 열에 저장합니다.

```bash
cd backend
uv run python -m scripts.import_restaurants /path/to/verified-hours.json --hours-only
```

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

PowerShell은 `$env:APP_ENV="test"`로 설정 후 Python 검사를 실행합니다. 실제 MySQL 8.4.13에서도 API/저장 테스트와 36개 통합 확인 항목이 통과했습니다. [MySQL 검증 기록](docs/mysql-verification.md)의 전용 테스트 DB 설정으로 다시 실행할 수 있습니다. GitHub Actions의 전용 MySQL 8.4.13 DB 검증과 프론트 검사도 통과했습니다. SQLite 테스트는 오직 APP_ENV=test에서 허용됩니다. 상세 결과와 실제 외부 API 및 화면 검증 범위는 [검증 기록](docs/VERIFICATION.md)을 참고하세요.

공식 연동 문서: [카카오 로그인](https://developers.kakao.com/docs/ko/kakaologin/rest-api), [카카오 로컬](https://developers.kakao.com/docs/ko/local/dev-guide), [Gemini 구조화 출력](https://ai.google.dev/gemini-api/docs/structured-output?hl=ko).
