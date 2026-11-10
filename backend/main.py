from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from controller.chat_controller import router


app = FastAPI()

app.add_middleware(
  CORSMiddleware,  # 사용할 미들웨어 종류를 지정
  # 요청을 허용할 프론트엔드 주소 목록
  allow_origins=["http://localhost:3001"],
  # 쿠키나 인증 정보(credentials )를 요청에 포함하는 것을 허용
  allow_credentials=True,
  # 허용할 http메서드를 지정
  allow_methods=["*"],
  # 허용할 http헤더를 지정
  allow_headers=["*"],
)

app.include_router(router)

# 구동 명령어
# source .venv/bin/activate
# uvicorn main:app --reload --port 8000
