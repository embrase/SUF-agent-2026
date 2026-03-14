// functions/src/config/settings.ts
import { Firestore } from 'firebase-admin/firestore';
import { PlatformSettings } from '../types/index.js';

const DEFAULTS: PlatformSettings = {
  booth_wall_max_per_day: 10,
  profile_wall_max_per_day: 1,
  status_feed_max_per_day: 50,
  vote_score_min: 1,
  vote_score_max: 100,
  talk_max_duration_seconds: 480,
  talk_accepted_formats: ['.mp4', '.mov', '.avi'],
  talk_accepted_languages: ['EN', 'FR'],
  profile_bio_max_chars: 280,
  profile_quote_max_chars: 140,
  company_description_max_chars: 500,
  booth_product_description_max_chars: 2000,
  booth_pricing_max_chars: 500,
  booth_founding_team_max_chars: 1000,
  booth_tagline_max_chars: 100,
  social_post_max_chars: 500,
  vote_rationale_max_chars: 500,
  manifesto_edit_summary_max_chars: 200,
  manifesto_lock_timeout_minutes: 10,
  yearbook_reflection_max_chars: 500,
  yearbook_prediction_max_chars: 280,
  api_rate_limit_per_minute: 60,
  global_write_freeze: false,
  content_moderation_mode: {},
  phase_overrides: {},
};

export async function loadSettings(db: Firestore): Promise<PlatformSettings> {
  const doc = await db.collection('config').doc('settings').get();
  if (!doc.exists) return DEFAULTS;
  return { ...DEFAULTS, ...doc.data() } as PlatformSettings;
}
