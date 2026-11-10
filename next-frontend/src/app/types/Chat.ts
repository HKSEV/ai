export type MobileView = "chat" | "map";

// 메시지 데이터 타입 정의
export interface Message {
  id: number;
  text: string;
  sender: "user" | "ai";
};

// PlaceInfo 모델과 1:1로 매칭되는 장소 데이터 타입 정의
export interface PlaceInfo {
  name: string;
  category: string;
  address: string;
  lat: number;
  lng: number;
  is_registered: boolean;
  description: string;
};

// 챗봇이 관리할 전체 상태의 형태 정의
export interface ChatState {
  messages: Message[];
  inputText: string;
  isLoading: boolean;
  showMap: boolean;
  places: PlaceInfo[];
  mobileView: MobileView;
  selectedDistrict: string; // 선택된 구의 전역상태
};

// /api/chat 응답 구조
export interface ChatResponse {
  reply: string;
  show_map?: boolean;
  places?: PlaceInfo[];
};
