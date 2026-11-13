import type { RestaurantOption } from "./Service";

export interface AdminAction {
  id: number;
  actor_name: string;
  action:
    | "prompt_update"
    | "prompt_restore"
    | "user_delete"
    | "restaurant_delete"
    | "post_delete";
  target_label: string;
  created_at: string;
}

export interface AdminTrend {
  date: string;
  signups: number;
  experiences: number;
  reviews: number;
  search_requests: number;
}

export interface AdminStats {
  days: 7 | 30;
  totals: {
    users: number;
    new_users: number;
    experiences: number;
    reviews: number;
    restaurants: number;
    search_requests: number;
  };
  trend: AdminTrend[];
  actions: AdminAction[];
}

export type PromptName = "conditions" | "ranking";

export interface PromptRevision {
  version: number;
  editor_name: string | null;
  restored_from: number | null;
  created_at: string | null;
}

export interface PromptDetails {
  name: PromptName;
  label: string;
  version: number;
  content: string;
  required_inputs: string[];
  required_outputs: string[];
  response_schema: Record<string, unknown>;
  history: PromptRevision[];
}

export interface AdminRestaurant extends RestaurantOption {
  area: string;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  tags: string[];
  source_url: string | null;
}

export interface RestaurantRemoval {
  review_count: number;
  visit_count: number;
  menu_count: number;
}
