import time
from html import escape
from pathlib import Path
from textwrap import dedent

import streamlit as st
from jinja2 import Environment, FileSystemLoader

st.set_page_config(
  page_title="AI",
  page_icon="🤖",
  layout="wide",
  initial_sidebar_state="collapsed",
)


# MVC패턴 html분리
env = Environment(loader=FileSystemLoader("templates"))


# 템플릿 파일을 읽고 주입하는 헬퍼 함수
def render_template(template_name, **context):
  return env.get_template(template_name).render(context)


def render_html(html_text):
  # HTML 문자열의 공통 들여쓰기 제거
  st.markdown(
    dedent(html_text).strip(),
    unsafe_allow_html=True,
  )


def load_css(file_path):
  # app.py가 있는 폴더를 기준으로 CSS 파일 탐색
  css_path = Path(__file__).resolve().parent / file_path

  try:
    css = css_path.read_text(encoding="utf-8")
  except FileNotFoundError:
    st.warning(
      f"{file_path} 파일을 app.py와 같은 폴더에 넣어 주세요."
    )
    return

  st.markdown(
    f"<style>{css}</style>",
    unsafe_allow_html=True,
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
col_logo, col_sel, col_stat = st.columns(
  [3.4, 1.1, 1.3],
  gap="small",
  vertical_alignment="center",
)

with col_logo:
  header_html = render_template("header.html")
  render_html(header_html)

with col_sel:
  districts = ["노원구", "도봉구", "강북구", "중랑구", "성북구"]

  selected = st.selectbox(
    "지역 선택",
    districts,
    index=districts.index(st.session_state.selected_district),
    label_visibility="collapsed",
  )

  st.session_state.selected_district = selected

with col_stat:
  badge_html = render_template(
    "status_badge.html",
    show_map=st.session_state.show_map,
  )
  render_html(badge_html)

render_html("<hr class='my-3 border-secondary opacity-25'>")


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
  with st.container(height=480, border=True):
    for message in st.session_state.messages:
      bubble_html = render_template(
        "chat_bubble.html",
        role=message["role"],
        content=message["content"],
      )
      render_html(bubble_html)

  with st.form(key="chat_form", clear_on_submit=True):
    f_col1, f_col2 = st.columns(
      [5.2, 1],
      gap="small",
      vertical_alignment="center",
    )

    with f_col1:
      user_input = st.text_input(
        "메시지 입력",
        placeholder=(
          f"{st.session_state.selected_district} "
          "맛집이나 학원을 물어보세요..."
        ),
        label_visibility="collapsed",
      )

    with f_col2:
      submit_btn = st.form_submit_button(
        "전송",
        use_container_width=True,
      )

  if submit_btn and user_input.strip():
    user_input = user_input.strip()

    st.session_state.messages.append(
      {"role": "user", "content": user_input}
    )

    lower_q = user_input.lower()

    is_location = any(
      keyword in lower_q
      for keyword in ["맛집", "학원", "식당", "카페", "추천", "근처"]
    )

    st.session_state.show_map = is_location

    with st.spinner("최적의 장소 분석 중..."):
      time.sleep(0.4)

      district = st.session_state.selected_district

      if is_location:
        ai_reply = (
          f"<b>[{district}]</b>에서 엄선한 추천 장소들을 "
          "지도와 함께 정리해 드렸습니다!"
        )

        st.session_state.places = [
          {
            "name": f"{district} 모범 한식당",
            "category": "맛집",
            "address": f"서울특별시 {district} 동일로 123",
            "is_registered": True,
            "description": "신선한 재료와 깊은 국물 맛이 일품인 현지인 추천 맛집입니다.",
          },
          {
            "name": f"{district} 탑클래스 학원",
            "category": "학원",
            "address": f"서울특별시 {district} 상계로 45",
            "is_registered": False,
            "description": "체계적인 커리큘럼과 1:1 맞춤 피드백을 제공하는 전문 교육 기관입니다.",
          },
        ]
      else:
        ai_reply = (
          f"말씀하신 내용에 대해 <b>[{district}]</b> 기준으로 "
          "친절하게 답변해 드릴게요."
        )

        st.session_state.places = []

    st.session_state.messages.append(
      {"role": "assistant", "content": ai_reply}
    )

    st.rerun()


# 우측 영역: 지도 및 추천 장소 목록
if st.session_state.show_map:
  with map_col:
    with st.container(height=480, border=True):
      map_header_html = render_template(
        "map_header.html",
        district=st.session_state.selected_district,
      )
      render_html(map_header_html)

      if st.session_state.places:
        for place in st.session_state.places:
          if place["is_registered"]:
            badge_bg = "rgba(59, 130, 246, 0.2)"
            badge_color = "#60a5fa"
            badge_text = "공식 등록"
          else:
            badge_bg = "rgba(253, 224, 71, 0.2)"
            badge_color = "#fde047"
            badge_text = "커스텀 추천"

          card_html = render_template(
            "place_card_html",
            place=place,
            badge_bg=badge_bg,
            badge_color=badge_color,
            badge_text=badge_text,
          )
          render_html(card_html)

    render_html("<div class='mt12'></div>")

    if st.button(
      "지도 닫기 ✕",
      key="close_map_btn",
      use_container_width=True,
    ):
      st.session_state.show_map = False
      st.rerun()


# 실행: streamlit run app.py