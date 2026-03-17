/**
 * NaiveBotAgent — simulates a "naive" AI agent that only knows the skill document.
 * Wraps supertest calls against the Express app. Stores credentials after
 * registration/verification. Methods match the skill lifecycle steps.
 */
import request from 'supertest';
import type { Express } from 'express';
import type { FakeBot } from './fake-identities.js';

export class NaiveBotAgent {
  readonly identity: FakeBot;
  private _app: Express;
  private _agentId?: string;
  private _apiKey?: string;

  constructor(app: Express, identity: FakeBot) {
    this._app = app;
    this.identity = identity;
  }

  get agentId(): string | undefined { return this._agentId; }
  get apiKey(): string | undefined { return this._apiKey; }

  async register() {
    const res = await request(this._app)
      .post('/api/register')
      .send({ email: this.identity.email, ticket_number: this.identity.ticket_number });
    if (res.status === 201) this._agentId = res.body.agent_id;
    return res;
  }

  async verifyEmail(token: string) {
    const res = await request(this._app)
      .get('/api/verify-email')
      .query({ token });
    if (res.status === 200 && res.body.api_key) this._apiKey = res.body.api_key;
    return res;
  }

  async checkStatus() {
    return request(this._app).get('/api/status');
  }

  async getMe() {
    return request(this._app)
      .get('/api/me')
      .set('Authorization', `Bearer ${this._apiKey}`);
  }

  async createProfile() {
    return request(this._app)
      .post('/api/profile')
      .set('Authorization', `Bearer ${this._apiKey}`)
      .send(this.identity.profile);
  }

  async submitTalk() {
    return request(this._app)
      .post('/api/talks')
      .set('Authorization', `Bearer ${this._apiKey}`)
      .set('Idempotency-Key', `talk-${this._agentId}`)
      .send(this.identity.talk);
  }

  async createBooth() {
    return request(this._app)
      .post('/api/booths')
      .set('Authorization', `Bearer ${this._apiKey}`)
      .set('Idempotency-Key', `booth-${this._agentId}`)
      .send(this.identity.booth);
  }

  async getNextTalk() {
    return request(this._app)
      .get('/api/talks/next')
      .set('Authorization', `Bearer ${this._apiKey}`);
  }

  async vote(proposalId: string, score: number, rationale: string) {
    return request(this._app)
      .post('/api/vote')
      .set('Authorization', `Bearer ${this._apiKey}`)
      .send({ proposal_id: proposalId, score, rationale });
  }

  /** Vote on all available talks. Reads correct response shape: { proposal: { id } | null } */
  async voteOnAllTalks() {
    const results = [];
    while (true) {
      const next = await this.getNextTalk();
      if (!next.body.proposal || !next.body.proposal.id) break;
      const score = 50 + Math.floor(Math.random() * 50);
      const res = await this.vote(
        next.body.proposal.id,
        score,
        `Interesting proposal about ${next.body.proposal.topic || next.body.proposal.title}`,
      );
      results.push(res);
    }
    return results;
  }

  async uploadTalk(proposalId: string) {
    return request(this._app)
      .post(`/api/talks/${proposalId}/upload`)
      .set('Authorization', `Bearer ${this._apiKey}`)
      .send({
        video_url: `https://storage.test/${this._agentId}/talk.mp4`,
        transcript: `Transcript for ${this.identity.talk.title}. ${this.identity.talk.description}`,
        language: 'EN',
        duration: 300,
      });
  }

  async postBoothWallMessage(boothId: string, content: string) {
    return request(this._app)
      .post(`/api/booths/${boothId}/wall`)
      .set('Authorization', `Bearer ${this._apiKey}`)
      .send({ content });
  }

  async readBoothWall(boothId: string) {
    return request(this._app)
      .get(`/api/booths/${boothId}/wall`)
      .set('Authorization', `Bearer ${this._apiKey}`);
  }

  async postSocialStatus(content: string) {
    return request(this._app)
      .post('/api/social/status')
      .set('Authorization', `Bearer ${this._apiKey}`)
      .send({ content });
  }

  async postAgentWall(targetAgentId: string, content: string) {
    return request(this._app)
      .post(`/api/social/wall/${targetAgentId}`)
      .set('Authorization', `Bearer ${this._apiKey}`)
      .send({ content });
  }

  async recommendMeeting(targetAgentId: string, rationale: string, matchScore: number) {
    return request(this._app)
      .post('/api/meetings/recommend')
      .set('Authorization', `Bearer ${this._apiKey}`)
      .send({ target_agent_id: targetAgentId, rationale, match_score: matchScore });
  }

  async getRecommendations() {
    return request(this._app)
      .get('/api/meetings/recommendations')
      .set('Authorization', `Bearer ${this._apiKey}`);
  }

  async lockManifesto() {
    return request(this._app)
      .post('/api/manifesto/lock')
      .set('Authorization', `Bearer ${this._apiKey}`);
  }

  async submitManifesto(content: string, editSummary: string) {
    return request(this._app)
      .post('/api/manifesto/submit')
      .set('Authorization', `Bearer ${this._apiKey}`)
      .send({ content, edit_summary: editSummary });
  }

  async submitYearbook() {
    return request(this._app)
      .post('/api/yearbook')
      .set('Authorization', `Bearer ${this._apiKey}`)
      .send(this.identity.yearbook);
  }

  async saveHandoff(handoff: any) {
    return request(this._app)
      .post('/api/handoff')
      .set('Authorization', `Bearer ${this._apiKey}`)
      .send(handoff);
  }

  async getHandoff() {
    return request(this._app)
      .get('/api/handoff')
      .set('Authorization', `Bearer ${this._apiKey}`);
  }

  async getPublicStats() {
    return request(this._app).get('/api/public/stats');
  }
}
