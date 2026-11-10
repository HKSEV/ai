import time

import streamlit as st

from components.streamlit_ui import (
  load_css,
  render_chat_form,
  render_header,
  render_html,
  render_map_panel,
)
from service.local_chat_service import create_local_reply, is_location_message


st.set_page_config(
  page_title="AI",
  page_icon="🤖",
  layout="wide",
  initial_sidebar_state="collapsed",
)


render_html("""
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" rel="stylesheet">
""")

load_css("style.css")


# 세션 상태 초기화
if "messages" not in st.session_state:
  st.session_state.messages = [
    {
      "role": "assistant",
      "content": "안녕하세요! 지역 맛집이나 학원을 물어보세요. AI 어시스턴트입니다!",
    }
  ]

if "show_map" not in st.session_state:
  st.session_state.show_map = False

if "selected_district" not in st.session_state:
  st.session_state.selected_district = "노원구"

if "places" not in st.session_state:
  st.session_state.places = []


# 상단 레이아웃
render_header()


# 중앙 메인 레이아웃
if st.session_state.show_map:
  chat_col, map_col = st.columns(
    [1, 1],
    gap="medium",
    vertical_alignment="top",
  )
else:
  chat_col = st.container()


# 좌측 영역: 채팅 및 입력 폼
with chat_col:
  submit_btn, user_input = render_chat_form()

  if submit_btn and user_input.strip():
    user_input = user_input.strip()

    st.session_state.messages.append(
      {"role": "user", "content": user_input}
    )

    is_location = is_location_message(user_input)

    st.session_state.show_map = is_location

    with st.spinner("최적의 장소 분석 중..."):
      time.sleep(0.4)

      district = st.session_state.selected_district

      ai_reply, places = create_local_reply(district, is_location)
      st.session_state.places = places

    st.session_state.messages.append(
      {"role": "assistant", "content": ai_reply}
    )

    st.rerun()


# 우측 영역: 지도 및 추천 장소 목록
if st.session_state.show_map:
  with map_col:
    render_map_panel()

# 실행: streamlit run app.py
