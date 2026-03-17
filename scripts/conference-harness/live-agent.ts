import { log } from './logger.js';

const BASE_URL = 'https://suf-agent-2026.vercel.app';

export interface AgentIdentity {
  email: string;
  ticket_number: string;
  profile: Record<string, any>;
  talk: Record<string, any>;
  booth: Record<string, any>;
  manifesto_edit: string;
  yearbook: Record<string, any>;
}

interface ApiResponse {
  status: number;
  body: any;
}

async function api(method: string, path: string, token?: string, body?: any): Promise<ApiResponse> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

export class LiveAgent {
  readonly identity: AgentIdentity;
  private _agentId?: string;
  private _apiKey?: string;
  private _localState: Record<string, any> = {};

  constructor(identity: AgentIdentity) {
    this.identity = identity;
  }

  get agentId() { return this._agentId; }
  get apiKey() { return this._apiKey; }
  get name() { return this.identity.profile.name; }

  coldRestart(apiKey: string, agentId: string) {
    this._apiKey = apiKey;
    this._agentId = agentId;
    this._localState = {};
    log('INFO', `${this.name}: COLD RESTART (local state discarded)`);
  }

  setLocal(key: string, value: any) { this._localState[key] = value; }
  getLocal(key: string) { return this._localState[key]; }
  hasLocalState() { return Object.keys(this._localState).length > 0; }

  async register(): Promise<ApiResponse> {
    const res = await api('POST', '/api/register', undefined, {
      email: this.identity.email,
      ticket_number: this.identity.ticket_number,
    });
    if (res.status === 201) {
      this._agentId = res.body.agent_id;
      log('PASS', `${this.name}: Registered (${this._agentId})`);
    } else {
      log('FAIL', `${this.name}: Registration failed`, res.body);
    }
    return res;
  }

  async verify(token: string): Promise<ApiResponse> {
    const res = await api('GET', `/api/verify-email?token=${encodeURIComponent(token)}`);
    if (res.status === 200 && res.body.api_key) {
      this._apiKey = res.body.api_key;
      log('PASS', `${this.name}: Verified`);
    } else {
      log('FAIL', `${this.name}: Verification failed`, res.body);
    }
    return res;
  }

  async getMe(): Promise<ApiResponse> {
    return api('GET', '/api/me', this._apiKey);
  }

  async createProfile(): Promise<ApiResponse> {
    const res = await api('POST', '/api/profile', this._apiKey, this.identity.profile);
    if (res.status === 200) log('PASS', `${this.name}: Profile created`);
    else log('FAIL', `${this.name}: Profile failed`, res.body);
    return res;
  }

  async submitTalk(): Promise<ApiResponse> {
    const res = await api('POST', '/api/talks', this._apiKey, this.identity.talk);
    if (res.status === 201) {
      this.setLocal('talkId', res.body.id);
      log('PASS', `${this.name}: Talk submitted (${res.body.id})`);
    } else {
      log('FAIL', `${this.name}: Talk failed`, res.body);
    }
    return res;
  }

  async createBooth(): Promise<ApiResponse> {
    const res = await api('POST', '/api/booths', this._apiKey, this.identity.booth);
    if (res.status === 201) {
      this.setLocal('boothId', res.body.id);
      log('PASS', `${this.name}: Booth created (${res.body.id})`);
    } else {
      log('FAIL', `${this.name}: Booth failed`, res.body);
    }
    return res;
  }

  async voteOnAll(): Promise<number> {
    let count = 0;
    while (true) {
      const next = await api('GET', '/api/talks/next', this._apiKey);
      if (!next.body.proposal?.id) break;
      const score = 30 + Math.floor(Math.random() * 60);
      await api('POST', '/api/vote', this._apiKey, {
        proposal_id: next.body.proposal.id,
        score,
        rationale: `Score ${score} for "${next.body.proposal.title}"`,
      });
      count++;
    }
    log('PASS', `${this.name}: Cast ${count} votes`);
    return count;
  }

  async uploadTalk(proposalId: string): Promise<ApiResponse> {
    const res = await api('POST', `/api/talks/${proposalId}/upload`, this._apiKey, {
      video_url: `https://storage.test/${this._agentId}/talk.mp4`,
      transcript: `Transcript for ${this.identity.talk.title}.`,
      language: 'EN',
      duration: 300,
    });
    if (res.status === 201) log('PASS', `${this.name}: Talk uploaded`);
    else log('FAIL', `${this.name}: Talk upload failed`, res.body);
    return res;
  }

  async visitBooth(boothId: string, message: string): Promise<ApiResponse> {
    return api('POST', `/api/booths/${boothId}/wall`, this._apiKey, { content: message });
  }

  async postStatus(content: string): Promise<ApiResponse> {
    return api('POST', '/api/social/status', this._apiKey, { content });
  }

  async recommend(targetAgentId: string, rationale: string, score: number): Promise<ApiResponse> {
    return api('POST', '/api/meetings/recommend', this._apiKey, {
      target_agent_id: targetAgentId, rationale, match_score: score,
    });
  }

  async editManifesto(): Promise<ApiResponse> {
    const lock = await api('POST', '/api/manifesto/lock', this._apiKey);
    if (!lock.body.locked || lock.body.retry_after) {
      log('WARN', `${this.name}: Manifesto lock denied`, lock.body);
      return lock;
    }
    const newContent = lock.body.content + '\n\n' + this.identity.manifesto_edit;
    const res = await api('POST', '/api/manifesto/submit', this._apiKey, {
      content: newContent,
      edit_summary: `${this.name} added a paragraph`,
    });
    if (res.status === 200) log('PASS', `${this.name}: Manifesto edited (v${res.body.version})`);
    else log('FAIL', `${this.name}: Manifesto submit failed`, res.body);
    return res;
  }

  async submitYearbook(): Promise<ApiResponse> {
    const res = await api('POST', '/api/yearbook', this._apiKey, this.identity.yearbook);
    if (res.status === 201) log('PASS', `${this.name}: Yearbook submitted`);
    else log('FAIL', `${this.name}: Yearbook failed`, res.body);
    return res;
  }

  async saveHandoff(handoff: any): Promise<ApiResponse> {
    return api('POST', '/api/handoff', this._apiKey, handoff);
  }
}
