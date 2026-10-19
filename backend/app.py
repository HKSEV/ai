import fastapi
import streamlit as st
import requests

# head streamlit 코드 중에서 반드시 맨 처음에 실행
st.set_page_config(
  page_title="나만의 AI 챗봇",
  page_icon="🤖",
  layout="centered" # wide 시 화면 100%
)

# 페이지 상단 제목 및 설명
st.title("🤖 나만의 AI 어시스턴트")
st.caption("FastAPI 백엔드와 연동된 AI 챗봇입니다.")

if "messages" not in st.session_state:
  st.session_state.messages = [
    {"role": "assistant", "content": "안녕하세요! 무엇이든 물어보세요. 오늘 어떤 도움이 필요하신가요?"}
  ]

# 화면에 이전 대화 내용(말풍선)들을 차례대로 그려주기
for message in st.session_state.messages:
  with st.chat_message(message["role"]):
    st.markdown(message["content"])

# 화면 아래에 채팅창 픽스
# := : 변수에 값을 넣는 것과 동시에 조건문 검사
if user_input := st.chat_input("메세지를 입력하세요...."):
  # 1. 사용자가 방금 입력한 질문을 기억 공간에 추가
  st.session_state.messages.append(
    {"role": "user", "content": user_input}
  )
  # 2. 화면에
  with st.chat_message("user"):
    st.markdown(user_input)

  # FastAPI 백엔드 호출 및 AI 답변 출력
  with st.chat_message("assistant"):
    # 백엔드 답변이 올 때 까지의 로딩화면
    with st.spinner("생각하는 중..."):
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
      st.markdown(ai_reply)
      st.session_state.messages.append(
        {"role": "assistant", "content": ai_reply}
      )