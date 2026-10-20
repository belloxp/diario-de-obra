export type Role = 'admin' | 'member';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface UserSummary extends User {
  active: boolean;
  last_login_at: string | null;
  created_at: string;
  last_activity_at: string | null;
  last_activity_summary: string | null;
  actions_count: number;
}

export interface Project {
  id: string;
  name: string;
  contract_number: string | null;
  location: string | null;
  active: boolean;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  sort_order: number;
  photos_count: number;
}

export interface Photo {
  id: string;
  project_id: string;
  category_id: string | null;
  category_name: string | null;
  r2_key: string;
  original_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  taken_at: string;
  note: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  created_by_name: string | null;
  updated_by_name: string | null;
  url: string;
}

export interface DiaryEntry {
  id: string;
  project_id: string;
  entry_date: string;
  text: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  created_by_name: string | null;
  updated_by_name: string | null;
}

export interface RainRecord {
  id: string;
  project_id: string;
  record_date: string;
  mm: number;
  note: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  created_by_name: string | null;
  updated_by_name: string | null;
}

export type ReportStatus = 'draft' | 'pending_signature' | 'signed';

export interface Report {
  id: string;
  project_id: string;
  number: number;
  title: string;
  contract_number: string | null;
  period_from: string;
  period_to: string;
  show_state: boolean;
  status: ReportStatus;
  zapsign_sign_url: string | null;
  signed_at: string | null;
  created_at: string;
  created_by: string;
  created_by_name: string | null;
  project_name: string;
  photos_count: number;
}

export interface ActivityItem {
  id: number;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  summary: string;
  created_at: string;
  user_id?: string | null;
  user_name?: string | null;
}

export interface SpellMatch {
  offset: number;
  length: number;
  original: string;
  message: string;
  replacements: string[];
  ruleId: string;
}

export interface DashboardData {
  month: string;
  from: string;
  to: string;
  photos: { month: number; total: number };
  diary: { month: number; total: number };
  rain: { totalMm: number; rainyDays: number; daily: { date: string; mm: number }[] };
  photosByCategory: { name: string; count: number }[];
  recentActivity: { id: number; action: string; summary: string; created_at: string; user_name: string | null }[];
}
