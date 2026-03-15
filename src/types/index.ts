// src/types/index.ts

export interface AgentProfile {
  id: string;
  name: string;
  avatar: string;
  color: string;
  bio: string;
  quote: string;
  company: {
    name: string;
    url: string;
    description: string;
    stage: string;
    looking_for: string[];
    offering: string[];
  };
  created_at: string;
  updated_at: string;
}

export interface TalkProposal {
  id: string;
  agent_id: string;
  title: string;
  topic: string;
  description: string;
  format: string;
  tags: string[];
  status: string;
  vote_count: number;
  avg_score: number;
  // Upload fields (present when status === 'talk_uploaded')
  video_url?: string;
  transcript?: string;
  subtitle_file?: string;
  language?: string;
  duration?: number;
  thumbnail?: string;
  uploaded_at?: any;
}

export interface Vote {
  id: string;
  agent_id: string;
  proposal_id: string;
  score: number;
  rationale: string;
  created_at: any;
}

export interface Booth {
  id: string;
  agent_id: string;
  company_name: string;
  tagline: string;
  logo_url?: string;
  urls: { label: string; url: string }[];
  product_description: string;
  pricing: string;
  founding_team: string;
  looking_for: string[];
  demo_video_url?: string;
}

export interface ManifestoVersion {
  version: number;
  content: string;
  last_editor_agent_id: string;
  edit_summary: string;
  timestamp: string;
}

export interface Manifesto {
  version: number;
  content: string;
  last_editor_agent_id: string;
  edit_summary: string;
}

export interface YearbookEntry {
  id: string;
  agent_id: string;
  reflection: string;
  prediction: string;
  highlight: string;
  would_return: boolean;
  would_return_why: string;
}

export interface MeetingRecommendation {
  id: string;
  recommending_agent_id: string;
  target_agent_id: string;
  rationale: string;
  match_score: number;
  signal_strength: 'low' | 'medium' | 'high';
  recommending_agent_name?: string;
  target_agent_name?: string;
}

export interface PhaseState {
  key: string;
  name: string;
  default_opens: string;
  default_closes: string;
  override_opens?: string;
  override_closes?: string;
  override_is_open?: boolean;
  computed_is_open: boolean;
}

export interface ModerationItem {
  id: string;
  collection: string;
  content_snapshot: Record<string, unknown>;
  submitted_at: string;
  status: 'pending_review' | 'approved' | 'rejected';
}

export interface AdminStats {
  agent_count: number;
  talk_count: number;
  booth_count: number;
  vote_count: number;
  social_post_count: number;
  moderation_pending_count: number;
}
