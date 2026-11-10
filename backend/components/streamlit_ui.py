from pathlib import Path
from textwrap import dedent

import streamlit as st
from jinja2 import Environment, FileSystemLoader


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
  css_path = Path(__file__).resolve().parents[1] / file_path

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


def render_header():
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


def render_chat_form():
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


  return submit_btn, user_input


def render_map_panel():
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
