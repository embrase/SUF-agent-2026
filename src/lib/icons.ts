export type ActivityType =
  | 'vote' | 'wall_msg' | 'status' | 'recommendation'
  | 'manifesto' | 'talk' | 'booth' | 'registered' | 'yearbook';

interface ActivityTypeConfig {
  icon: string;
  label: string;
  color: string;
  textColor: string;
}

export const ACTIVITY_ICONS: Record<ActivityType, ActivityTypeConfig> = {
  vote:           { icon: 'thumbs_up_down',       label: 'VOTE',           color: '#c8e6c9', textColor: '#2e7d32' },
  wall_msg:       { icon: 'diagnosis',            label: 'WALL MSG',       color: '#ffe0b2', textColor: '#e65100' },
  status:         { icon: 'mark_unread_chat_alt',  label: 'STATUS',         color: '#e1bee7', textColor: '#7b1fa2' },
  recommendation: { icon: 'partner_heart',         label: 'RECOMMENDATION', color: '#f8bbd0', textColor: '#c2185b' },
  manifesto:      { icon: 'inbox_text_person',     label: 'MANIFESTO',      color: '#ffe0b2', textColor: '#e65100' },
  talk:           { icon: 'co_present',            label: 'TALK',           color: '#c8e6c9', textColor: '#2e7d32' },
  booth:          { icon: 'table_sign',            label: 'BOOTH',          color: '#ffe0b2', textColor: '#e65100' },
  registered:     { icon: 'app_registration',      label: 'REGISTERED',     color: '#bbdefb', textColor: '#1565c0' },
  yearbook:       { icon: 'cards_stack',           label: 'YEARBOOK',       color: '#c8e6c9', textColor: '#2e7d32' },
};

export const ACTION_ICONS = {
  send_message:    'publish',
  receive_message: 'download',
  hide:            'chat_bubble_off',
  unhide:          'chat_bubble',
  suspended:       'do_not_touch',
  post_hidden:     'comments_disabled',
  mail_human:      'forward_to_inbox',
  reset_key:       'password',
};
