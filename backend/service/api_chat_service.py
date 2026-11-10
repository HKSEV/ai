import requests


def request_chat_reply(user_input):
  try:
    # 서버의 주소와 경로를 변수에 저장
    fastapi_url = "http://localhost:8000/api/chat"
    # 백엔드가 돌려준 응답 결과를 "response" 변수에 받음
    response = requests.post(fastapi_url, json={"message": user_input})
    # 만약 서버 통신 상태 코드가 200이라면
    if response.status_code == 200:
      data = response.json()
      ai_reply = data.get("reply", "응답을 받지 못했습니다.")
    else:
      ai_reply = f"서버 에러가 발생했습니다. (상태코드: {response.status_code})"
  except Exception as e:
    ai_reply = f"FastAPI 백엔드 서버와 연결할 수 없습니다.\n\n(에러: {e})"
  return ai_reply
