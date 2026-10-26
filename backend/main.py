'''
fastapi : 빠르고 간편한 파이선 프레임워크
uvicorn : 서버를 실행 시켜주는도구
pydantic : 프론트엔드에서 넘어온 메세지 형식이 맞는지 검사
'''
import os
# AI가 보내준 JSON 문자열 데이터를 파이썬 딕셔너리로 변환하기 위해
import json
from pathlib import Path
# 리스트나 선택적 값 같은 데이터 타입을 명확히 지정하기 위해
from typing import List, Optional
from dotenv import load_dotenv

# from app import ai_reply

'''
FastAPI 라이브러리에서 FastAPI 클래스를 가져오고
파이썬으로 API 서버를 빠르게 만들 수 있게 해주는 도구
'''

from fastapi import FastAPI

'''
CORS(Cross-Origin Resource Sharing) 미들웨어를 가져옵니다.
미들웨어란 요청과 응답 사이에서 중간 처리를 담당하는 기능
다른 주소(포트)에서 오는 요청을 허용할지 말지"를 결정하는 보안 정책
'''

from fastapi.middleware.cors import CORSMiddleware

'''
pydantic: 프론트엔드에서 넘어온 데이터(메시지)의 형식이 맞는지 검사
Pydantic 라이브러리에서 BaseModel 클래스를 가져옵니다
'''

from pydantic import BaseModel
# from groq import Groq
from google import genai
from google.genai import types
load_dotenv()

# GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
# if not GROQ_API_KEY:
#     print("warning: .env 파일에서 api키를 찾을 수 없음!!!!!")
if not GEMINI_API_KEY:
    raise RuntimeError(
        ".env 파일에서 GEMINI_API_KEY를 찾을 수 없습니다."
    )

client = genai.Client(api_key=GEMINI_API_KEY)
# 사용할 Gemini 모델
MODEL_NAME = os.getenv("GEMINI_MODEL")

app = FastAPI()

'''
FastAPI 앱(서버) 인스턴스를 생성
모든 설정과 API는 이 app에 등록됩니다
'''

#app에 cors미들웨어를 추가
app.add_middleware(
    CORSMiddleware, #사용할 미들웨어 종류를 지정
    #요청을 허용할 프론트엔드 주소 목록
    allow_origins=["http://localhost:3001"],
    # 쿠키나 인증 정보(credentials )를 요청에 포함하는 것을 허용
    allow_credentials=True,
    # 허용할 http메서드를 지정
    allow_methods=["*"],
    # 허용할 http헤더를 지정
    allow_headers=["*"],
)

'''
프론트엔드에서 서버로 보내는 요청(Request)데이터의 구조를 정의
BaseModel을 상속받아 Pydantic이 데이터 타입를 자동으로 검증
'''

class ChatRequest(BaseModel):
    message: str
    #사용자가 입력한 채팅 메세지를 받는 필드 str은 문자열 텍스트 타입

class PlaceInfo(BaseModel):
    name: str
    category: str
    address: str
    lat: float
    lng: float
    is_registered: bool
    description: str

class ChatResponse(BaseModel):
    reply: str
    # 프론트엔드가 지도를 화면에 띄울지 말지 결정하는 상태값
    show_map: bool = False
    places: List[PlaceInfo] = []

'''
/api/chat 경로로 POST요청이 들어왓을때 실행될 함수를 등록
response_model=ChatResponse는 
이 함수가 반환하는 데이터 형식을 ChatResponse로 강제
'''

@app.post("/api/chat", response_model=ChatResponse)
# 실제로 요청을 처리하는 비동기 함수 여러 요청을 동시에 효율적으로 처리
async def chat_endpoint(request: ChatRequest):
    #request객체에서 사용자가 보낸 메세지 텍스트만 꺼내 변수에 저장
    user_message = request.message.strip()

    system_prompt = (
        "당신은 서울 노원구(노원역 문화의거리, 공릉동 경춘선숲길, 석계역, 수락산, 마들역, 중계역 등)의 "
        "맛집을 잘 아는 친절한 맛집 추천 AI 에이전트입니다. "
        "사용자가 질문을 하면 노원구 내의 실제 유명한 식당 이름, 위치, 대표 메뉴, "
        "분위기나 특징을 포함해 친근하고 보기 쉽게 답변해 주세요. "
        "반드시 완벽하고 자연스러운 한국어로만 답변하세요.\n\n"
        "응답은 반드시 아래의 JSON 형식으로만 작성해야 합니다.:\n"
        "{\n"
        '  "reply": "사용자에게 보여줄 친절한 답변 (마크다운 문법 사용 가능)",\n'
        '  "show_map": true 또는 false (맛집, 학원, 카페, 식당, 장소 추천 등 지도가 필요한 질문이면 true, 일반 대화면 false),\n'
        '  "places": [\n'
        "    {\n"
        '      "name": "업체명",\n'
        '      "category": "맛집 또는 학원 등 카테고리",\n'
        '      "address": "서울 노원구 상세 주소",\n'
        '      "lat": 37.6551 (실제 노원구 해당 지역의 대략적인 위도 숫자),\n'
        '      "lng": 127.0614 (실제 노원구 해당 지역의 대략적인 경도 숫자),\n'
        '      "is_registered": true 또는 false (유명 프랜차이즈나 다음맵에 등록된 유명 업체면 true, 숨은 골목식당이나 가상의 추천/미등록 업체면 false),\n'
        '      "description": "대표 메뉴나 학원 특징 요약"\n'
        "    }\n"
        "  ]\n"
        "}\n"
        "주의: 일반 대화(show_map=false)인 경우 places는 빈 배열 []로 보내세요."
    )

    try:
        print(f"사용자 질문 수신: {user_message} -> Gemini 응답 요청 중…")
        # chat_completion = client.chat.completions.create(
        #     model = "llama-3.3-70b-versatile",
        #     messages = [
        #         {"role": "system", "content": system_prompt},
        #         {"role": "user", "content": user_message},
        #     ],
        #     temperature = 0.6,
        # )
        response = await client.aio.models.generate_content(
            model=MODEL_NAME,
            contents=user_message,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                temperature=0.6,
                # 다른 사족 없이 JSON 형태로만
                response_mime_type="application/json",
                response_schema=ChatResponse,
            ),
        )

        # AI가 생성한 답변
        raw_content = response.text
        print("Gemini 응답 완료")
        result = ChatResponse.model_validate_json(raw_content)
        # 지도가 필요 없는 응답에는 장소 목록을 보내지 않음
        if not result.show_map:
            result.places = []
        return result
    except Exception as e:
        print(f"Gemini AI 호출 중 에러 발생: {e}")
        ai_reply = (
            "죄송합니다. 현재 AI 응답을 가져오는 중 문제가 발생했습니다. "
            "GEMINI_API_KEY 설정과 서버 콘솔을 확인해 주세요."
        )
        return ChatResponse(
            reply=ai_reply,
            show_map=False,
            places=[]
        )

#구동 명령어
# source .venv/bin/activate
# uvicorn main:app --reload --port 8000