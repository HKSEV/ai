LOCATION_KEYWORDS = ["맛집", "학원", "식당", "카페", "추천", "근처"]


def is_location_message(message):
  lower_q = message.lower()
  return any(keyword in lower_q for keyword in LOCATION_KEYWORDS)


def create_local_reply(district, is_location):
  if is_location:
    ai_reply = (
      f"<b>[{district}]</b>에서 엄선한 추천 장소들을 "
      "지도와 함께 정리해 드렸습니다!"
    )

    places = [
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

    places = []

  return ai_reply, places
