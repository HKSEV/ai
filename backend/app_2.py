import streamlit as st

from service.api_chat_service import request_chat_reply

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
      ai_reply = request_chat_reply(user_input)
      st.markdown(ai_reply)
      st.session_state.messages.append(
        {"role": "assistant", "content": ai_reply}
      )
