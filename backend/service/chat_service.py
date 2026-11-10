from google.genai import types

from config.chat_prompt import SYSTEM_PROMPT
from config.gemini import MODEL_NAME, client
from dto.chat import ChatResponse


async def get_chat_response(message: str) -> ChatResponse:
  user_message = message.strip()

  try:
    print(f"사용자 질문 수신: {user_message} -> Gemini 응답 요청 중…")
    response = await client.aio.models.generate_content(
      model=MODEL_NAME,
      contents=user_message,
      config=types.GenerateContentConfig(
        system_instruction=SYSTEM_PROMPT,
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
