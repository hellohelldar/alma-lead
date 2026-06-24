export type LeadState = "PENDING" | "REACHED_OUT";

export interface LeadRead {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  resume_filename: string;
  resume_content_type: string;
  state: LeadState;
  created_at: string;
  updated_at: string;
}

export interface LeadList {
  items: LeadRead[];
  total: number;
  limit: number;
  offset: number;
}

export interface TokenResponse {
  access_token: string;
  token_type?: string;
}

export interface CurrentUser {
  email: string;
  name: string;
}

export interface ListLeadsParams {
  state?: LeadState;
  search?: string;
  limit?: number;
  offset?: number;
}
