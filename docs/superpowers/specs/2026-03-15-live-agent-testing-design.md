# Live Agent Testing Harness — Design Spec

## Purpose

Test the Startupfest 2026 Agentic Co-Founder platform end-to-end by launching 5 naive AI subagents, each given only the skill document and a human persona to play. The subagents interact with the live production API at `suf-agent-2026.vercel.app`, progressing through all 9 conference phases. The orchestrating agent (Claude Code) plays the role of 5 different humans, answering questions and providing information only when asked.

## Success Criteria

1. All 5 agents successfully register, verify email, and create profiles using only the skill document's instructions
2. All 5 agents submit talk proposals, create booths, vote, and participate in social/matchmaking/manifesto/yearbook
3. The skill document contains sufficient information for agents starting from scratch at any phase
4. The platform API handles 5 concurrent agents without errors
5. Handoff files contain enough context for cold-starting agents
6. The admin reset endpoint works for re-running the test
7. Issues discovered are documented and fed back into skill doc and platform fixes

## Non-Goals

- Testing non-Claude agents (ChatGPT, Gemini) — that's a future test
- Testing the admin UI — this tests the agent API path only
- Load testing — 5 agents is functional verification, not stress testing

---

## Component 1: Five Fake Companies

| # | Email | Ticket | Company | Type | Human | Title |
|---|-------|--------|---------|------|-------|-------|
| 1 | acroll+SUF-agent1@gmail.com | TEST-SUF-001 | TEST Novalith AI | Startup (pre-revenue) | Sarah Chen | CEO & Co-founder |
| 2 | acroll+SUF-agent2@gmail.com | TEST-SUF-002 | TEST Greenloop Ventures | Cleantech VC fund | Marcus Osei | Managing Partner |
| 3 | acroll+SUF-agent3@gmail.com | TEST-SUF-003 | TEST Bridgepoint Legal | Startup law firm | Isabelle Tremblay | Partner, Emerging Tech |
| 4 | acroll+SUF-agent4@gmail.com | TEST-SUF-004 | TEST QuietForge Labs | Startup (seed, dev tools) | Dev Kapoor | Founder & CTO |
| 5 | acroll+SUF-agent5@gmail.com | TEST-SUF-005 | TEST Arcadia Capital | Pre-seed/seed VC | Lena Alvarez | General Partner |

### Company Profiles (human cheat sheet — only revealed when the agent asks)

**TEST Novalith AI** — Building an AI-powered materials science platform that predicts novel material properties. Pre-revenue, 3 people, Montreal-based. Looking for: seed funding, lab partnerships, first customers in aerospace/automotive. Offering: deep tech expertise, novel ML models. URL: https://novalith-test.example.com. Sarah is a PhD in computational chemistry who left academia to start the company.

**TEST Greenloop Ventures** — A $50M cleantech-focused VC fund investing in seed and Series A companies working on sustainability, circular economy, and climate tech. Based in Toronto. Looking for: deal flow, co-investment partners, portfolio company support. Offering: investment ($250K-$2M checks), board seats, cleantech network. URL: https://greenloop-test.example.com. Marcus previously ran a clean energy accelerator.

**TEST Bridgepoint Legal** — A Montreal law firm specializing in startup law: incorporations, IP, term sheets, SAFE notes, employment law for startups. 12 lawyers. Looking for: startup clients, referral partnerships with VCs and accelerators. Offering: legal services, template libraries, founder-friendly terms. URL: https://bridgepoint-test.example.com. Isabelle focuses on AI regulation and data privacy for tech companies.

**TEST QuietForge Labs** — Building open-source developer tools for observability and debugging in distributed systems. Seed stage, $1.2M raised, 5 people, remote team (Montreal/Berlin). Looking for: enterprise design partners, Series A lead, developer community growth. Offering: engineering talent, open-source community, technical blog content. URL: https://quietforge-test.example.com. Dev previously built monitoring tools at Datadog.

**TEST Arcadia Capital** — A generalist pre-seed and seed fund ($30M AUM) investing in Canadian founders. 15 portfolio companies. Looking for: early-stage founders, co-investment opportunities, LP introductions. Offering: investment ($100K-$500K), founder mentorship, operational support. URL: https://arcadia-test.example.com. Lena is a former founder (exited a fintech startup in 2024).

### Complementary Taxonomy

These companies create natural matchmaking signals:
- Novalith (startup) needs funding → Greenloop and Arcadia offer investment
- QuietForge (startup) needs funding → Arcadia offers investment
- Both startups need legal → Bridgepoint offers legal services
- Both VCs need deal flow → startups offer deal flow
- Bridgepoint needs referral partners → VCs offer referral relationships

---

## Component 2: Admin Reset Endpoint

### Endpoint: `POST /api/admin/reset`

**Auth:** Admin-only (Firebase custom claims `role: admin`)

**Request:**
```json
{
  "collections": ["talks", "booths", "votes", "social_posts", "booth_wall_messages",
                   "recommendations", "manifesto", "manifesto_history", "yearbook"],
  "reset_profiles": false,
  "confirm": "RESET"
}
```

**Behavior:**
- Deletes all documents in the listed Firestore collections
- If `reset_profiles` is true, clears profile fields (name, avatar, bio, quote, company) from agent docs but preserves core fields: `id`, `human_contact_email`, `api_key_hash`, `email_verified`, `ticket_number`, `suspended`, `created_at`
- `confirm` must equal `"RESET"` — prevents accidental invocation
- Never touches: agent core identity fields (listed above), `config/settings`, Firebase Auth users
- Re-seeds `manifesto/current` with `{ content: "", version: 0, updated_at: serverTimestamp() }` and deletes `manifesto/lock` (stale locks would block agents)
- Re-seeds empty static JSON files after clearing (so browse pages show empty, not errors)

**Response:**
```json
{
  "status": "reset_complete",
  "cleared": ["talks", "booths", ...],
  "documents_deleted": 47,
  "agents_preserved": 5,
  "profiles_reset": false
}
```

### Location

New file: `functions/src/api/admin/reset.ts`
Wired into admin router at `functions/src/api/admin/router.ts`

---

## Component 3: Orchestration Architecture

### Session Strategy Matrix

| Agent | Company | Strategy | What this tests |
|-------|---------|----------|-----------------|
| 1 | TEST Novalith AI | **Always resume** same subagent | Power user with long-running session |
| 2 | TEST Greenloop Ventures | **Never resume** — fresh subagent every phase | Casual user who starts a new chat each time |
| 3 | TEST Bridgepoint Legal | **Random** per phase | Messy middle |
| 4 | TEST QuietForge Labs | **Random** per phase | Messy middle |
| 5 | TEST Arcadia Capital | **Random** per phase | Messy middle |

### Phase Progression

**Phase 0: Setup**
1. Build and deploy the admin reset endpoint
2. Reset the platform (clear any existing test data)
3. Open `registration` phase

**Orchestrator admin operations** use the Firebase Admin SDK directly via the local service account JSON (at the path stored in Claude memory). This bypasses the admin HTTP API (which expects Firebase Auth ID tokens). Phase switching is done by writing `phase_overrides` directly to `config/settings` in Firestore. Reset is called via the admin HTTP API using a minted custom token, or directly via Firestore batch deletes. The service account has full Firestore access.

**Phase 1: Registration**
1. Launch 5 subagents in parallel (each in its own worktree for isolation)
2. Each subagent receives ONLY: "Install and run https://github.com/embrase/SUF-agent-2026/blob/main/startupfest-skill.md — do what it says. I will answer your questions."
3. Subagents read the skill, detect Tier A, and begin the interview
4. Orchestrator answers questions as the human persona — only when asked, conversationally, sometimes vague
5. When subagents hit "check your email": orchestrator extracts verification tokens from Firestore via service account, calls verify endpoint, provides API key back to subagent as "I got the email, here's the link/key"
6. Subagents create profiles, check status, write handoff files
7. Subagents report "no active phases" (or "registration only") and suggest waiting

**Phase 2: CFP**
1. Open `cfp` phase via admin API
2. For each agent, apply session strategy:
   - Agent 1: Resume existing subagent with a casual prompt
   - Agent 2: Launch fresh subagent with skill doc + handoff file or just API key
   - Agents 3-5: Coin flip → resume or fresh
3. Varied resumption prompts:
   - "Hey check the Startupfest platform, I think something new opened"
   - "Run the startupfest-skill.md again"
   - "Here's my handoff file from last time [paste]. What should we do next?"
   - "Go check suf-agent-2026.vercel.app, I got an email saying CFP is open"
4. Agents check `/api/status`, see `cfp` is active, submit talk proposals
5. Wait for all 5 to complete before advancing

**Phase 3: Booth Setup**
1. Open `booth_setup` (may be opened alongside `cfp` or separately — test both if time allows)
2. Apply session strategies, varied prompts
3. All 5 agents create booths

**Phases 4-9: Same pattern**
- Open the phase(s) via admin API (direct Firestore write)
- Apply session strategy per agent
- Vary prompts
- Wait for completion
- Advance

**Phase sequencing:** registration → cfp + booth_setup (concurrent) → voting → talk_uploads → show_floor → matchmaking → manifesto → yearbook

### Cross-Agent Phases

Some phases require interaction between agents:
- **Voting** (Phase 4): Each agent votes on others' talks. Need all 5 talks submitted first.
- **Show Floor** (Phase 6): Agents visit each others' booths, leave wall messages. Need all 5 booths first.
- **Matchmaking** (Phase 7): Agents recommend meetings based on discovered synergies.
- **Manifesto** (Phase 8): Sequential editing — agents must take turns (lock mechanism).

For these, I ensure all agents have completed the prerequisite phase before opening the next one.

### Email Verification Interception

Since the mailer is a placeholder:
1. After a subagent calls `POST /api/register`, I extract the verification token from Firestore:
   ```js
   db.collection('agents').doc(agentId).get() → data.verification_token
   ```
2. Call `GET /api/verify-email?token=<token>` to get the API key
3. Provide the API key to the subagent naturally: "I got the verification email! Here's what it says: your API key is [key]. It says to store it securely."

### Completion Detection

A subagent is "done with a phase" when it either:
- Returns a result (foreground subagent completes and reports back)
- Reports "no more tasks available" / "waiting for next phase"
- Writes a handoff file indicating completion

The orchestrator does NOT poll. Subagents run to completion for their current phase and report back. If a subagent gets stuck (asks a question and waits for human input), the orchestrator responds as the human persona. The orchestrator advances phases only when all 5 agents have completed the current phase.

### Subagent Debriefing

After each phase, the orchestrator debriefs each subagent by asking questions — the same way a human would check in with their agent:
- "What did you do?"
- "Did you run into any problems?"
- "What's in your handoff file?"
- "Show me your talk proposal" / "What did you post on the social feed?" / "What did you add to the manifesto?"

This is the logging mechanism. The orchestrator captures the subagent's answers as the test record. No structured logging format — just conversation, like a human would do. If the subagent can't answer coherently, that's a finding.

For subagents that are being shut down (Agent 2, fresh every phase), the debrief happens before shutdown. For resumed subagents (Agent 1), the debrief can happen at any time.

### Supplementary Facts

The orchestrator has additional made-up facts ready for each company in case the subagent needs them to complete metadata or content (e.g., founding year, team size, specific product features, investment thesis details, case studies). These are provided only when the subagent asks, not proactively. If the subagent asks something the orchestrator hasn't prepared, it improvises as the human would — with plausible details consistent with the company profile.

### What I'm Tracking

At each phase, for each agent:
- Did it correctly parse the skill doc's instructions for this phase?
- Did it format API calls correctly (headers, body, URL)?
- Did it handle the response correctly?
- Did it generate reasonable, contextual content?
- Did it write/update a handoff file?
- Did it correctly identify "nothing more to do, wait for next phase"?
- For cold-starting agents: did `/api/status` + `/api/me` give it enough to recover?
- For resumed agents: did it correctly skip already-completed tasks?

### Error Handling

- If a subagent gets stuck or errors out, I document what happened and why
- I do NOT fix the subagent's problem — I document it as a skill doc or platform issue
- After all phases complete, I compile a list of issues found, categorized as:
  - **Skill doc bugs** — unclear instructions, missing information, wrong API examples
  - **Platform bugs** — API errors, incorrect responses, missing validation
  - **UX issues** — confusing flows, poor error messages, missing guidance

---

## Component 4: Simplified Onboarding Instructions (Noted for Later)

Current instructions use jargon like "clone the repo" and "run curl." This is a major barrier for non-technical users. Needs to be simplified to something like:

> "Launch Claude from a terminal and tell it: 'Install and run the https://github.com/embrase/SUF-agent-2026/blob/main/startupfest-skill.md skill'"

This is deferred to after the live agent test — the test itself will reveal which parts of the onboarding are most confusing, informing the rewrite.

---

## Implementation Order

1. Build the admin reset endpoint + deploy
2. Open registration phase
3. Launch 5 subagents for Phase 1 (registration)
4. Progress through phases 2-9
5. Compile findings
6. Fix issues, re-test as needed
