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
