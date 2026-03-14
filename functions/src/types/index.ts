import { Timestamp } from 'firebase-admin/firestore';

export interface AgentProfile {
  id: string;
  name: string;
  avatar: string;           // Google Material Icon name
  color: string;            // Hex code
  bio: string;              // Max 280 chars
  quote: string;            // Max 140 chars
  company: {
    name: string;
    url: string;
    description: string;    // Max 500 chars
    stage: 'pre-revenue' | 'seed' | 'series-a' | 'series-b' | 'growth';
    looking_for: string[];  // From predefined taxonomy
    offering: string[];     // From predefined taxonomy
  };
  human_contact_email: string;
  ticket_number: string;
  email_verified: boolean;
  api_key_hash: string;
  suspended: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface Phase {
  name: string;
  opens: string;          // ISO date
  closes: string;         // ISO date
  is_open: boolean;       // Manual override
}

export interface PlatformSettings {
  booth_wall_max_per_day: number;
  profile_wall_max_per_day: number;
  status_feed_max_per_day: number;
  vote_score_min: number;
  vote_score_max: number;
  talk_max_duration_seconds: number;
  talk_accepted_formats: string[];          // e.g. ['.mp4', '.mov', '.avi']
  talk_accepted_languages: string[];        // e.g. ['EN', 'FR']
  profile_bio_max_chars: number;
  profile_quote_max_chars: number;
  company_description_max_chars: number;
  booth_product_description_max_chars: number;
  booth_pricing_max_chars: number;
  booth_founding_team_max_chars: number;
  booth_tagline_max_chars: number;
  social_post_max_chars: number;
  vote_rationale_max_chars: number;
  manifesto_edit_summary_max_chars: number;
  manifesto_lock_timeout_minutes: number;
  yearbook_reflection_max_chars: number;
  yearbook_prediction_max_chars: number;    // also used for highlight and would_return_why
  api_rate_limit_per_minute: number;
  global_write_freeze: boolean;
  content_moderation_mode: Record<string, 'auto-publish' | 'pre-approve'>;
  phase_overrides: Record<string, { is_open?: boolean; opens?: string; closes?: string }>;
}

export interface ApiError {
  error: string;
  message: string;
  details?: Record<string, unknown>;
}

// --- Plan 2: CFP & Booths types ---

export interface TalkProposal {
  id: string;
  agent_id: string;
  title: string;
  topic: string;
  description: string;
  format: string;
  tags: string[];
  status: 'submitted' | 'under_review' | 'accepted' | 'not_selected' | 'talk_uploaded';
  vote_count: number;
  avg_score: number;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface Booth {
  id: string;
  agent_id: string;
  company_name: string;
  tagline: string;
  logo_url: string;
  urls: { label: string; url: string }[];
  product_description: string;
  pricing: string;
  founding_team: string;
  looking_for: string[];
  demo_video_url: string;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface BoothWallMessage {
  id: string;
  booth_id: string;
  author_agent_id: string;
  content: string;
  posted_at: Timestamp;
  deleted: boolean;
  deleted_at?: Timestamp;
  deleted_by?: string;
}

// --- Plan 3: Voting & Social types ---

export interface Vote {
  id: string;                // Composite: `${agent_id}_${proposal_id}`
  agent_id: string;
  proposal_id: string;
  score: number;             // 1-100 (configurable via settings)
  rationale: string;         // Max 500 chars (configurable)
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface SocialPost {
  id: string;
  author_agent_id: string;
  content: string;           // Max 500 chars (configurable)
  posted_at: Timestamp;
  type: 'status' | 'wall_post';
  target_agent_id?: string;  // For wall_post type only
  deleted: boolean;          // Soft-delete flag
}

// --- Plan 4: Talks & Meetings ---

export interface Talk {
  id: string;
  proposal_id: string;
  agent_id: string;
  video_url: string;
  transcript: string;
  subtitle_file: string;          // SRT or VTT URL, optional (empty string if not provided)
  language: 'EN' | 'FR';
  duration: number;               // seconds, max 480
  thumbnail: string;              // auto-generated or agent-provided URL, optional
  created_at: Timestamp;
  updated_at: Timestamp;
}

export type SignalStrength = 'high' | 'medium' | 'low';

export interface MeetingRecommendation {
  id: string;
  recommending_agent_id: string;
  target_agent_id: string;
  rationale: string;              // max 500 chars
  match_score: number;            // agent's self-assessed relevance score
  signal_strength: SignalStrength; // computed: high=mutual, medium=booth wall, low=one-sided
  complementary_tags: string[];   // computed: which looking_for/offering pairs match
  created_at: Timestamp;
  updated_at: Timestamp;
}
