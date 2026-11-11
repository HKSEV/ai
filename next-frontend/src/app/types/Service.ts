export interface User {
  id: number;
  nickname: string;
  email: string | null;
  address_setup_pending: boolean;
  preferences: string[];
  budget_min: number | null;
  budget_max: number | null;
  created_at: string;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface MapLocation extends Coordinates {
  address: string;
}

export interface Address {
  id: number;
  label: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  is_default: boolean;
}

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pages: number;
}

export interface Conditions {
  area?: string | null;
  cuisine?: string | null;
  budget_total?: number | null;
  party_size?: number | null;
  visit_at?: string | null;
  atmosphere?: string | null;
  purpose?: string | null;
  radius_metres?: number | null;
  search_origin?: (Coordinates & { label: string }) | null;
}

export interface RestaurantOption {
  id: number;
  name: string;
  address: string;
  category: string;
  is_demo: boolean;
}

export interface Restaurant extends RestaurantOption {
  area: string;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  tags: string[];
  source: string;
  source_url: string | null;
  checked_at: string | null;
  hours_source: string | null;
  hours_source_url: string | null;
  hours_checked_at: string | null;
  opening: { label: string; basis: string; is_realtime: boolean };
  menus: { id: number; name: string; price: number | null; servings: number; available: boolean; source: string; source_url: string | null; checked_at: string | null; is_current: boolean }[];
  menu_combination: { items: { menu_id: number; name: string; price: number; quantity: number; servings: number }[]; total: number; per_person: number; party_size: number; basis: string } | null;
  distance_metres: number | null;
  distance_basis: string;
  map_url: string;
  directions_url: string;
  review_summary: { id: number; rating: number; excerpt: string; created_at: string }[];
  reason?: string;
  confirmed_matches?: string[];
  budget_note?: string | null;
}

export interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  recommendations: Restaurant[];
  created_at: string;
}

export interface Conversation {
  id: number;
  title: string;
  conditions: Conditions;
  updated_at: string;
  messages: ChatMessage[];
}

export type ConversationSummary = Omit<Conversation, "messages">;

export interface Post {
  id: number;
  kind: "experience" | "review";
  title: string;
  content: string;
  author: string;
  is_owner: boolean;
  restaurant_id: number | null;
  restaurant_name: string | null;
  rating: number | null;
  visited_on: string | null;
  visit_id: number | null;
  receipt_uploaded: boolean;
  verification_status: string;
  photo_ids: string[];
  photo_urls: string[];
  created_at: string;
  updated_at: string;
}

export interface Visit {
  id: number;
  restaurant_id: number;
  restaurant_name: string;
  visited_on: string;
  note: string;
  receipt_id: string | null;
  receipt_uploaded: boolean;
  verification_status: string;
  created_at: string;
}

export interface UploadedFile {
  id: string;
  url: string;
  kind: string;
  verification_status: string;
}
