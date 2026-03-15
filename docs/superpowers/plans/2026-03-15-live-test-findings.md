# Live Agent Test Findings

Running log of issues discovered during the 5-agent live test.

## Finding 1: WebFetch refuses to return full skill document

**Phase:** Registration (agent reading skill doc)
**Agent:** Agent 4 (QuietForge Labs)
**Issue:** The `WebFetch` tool's inner model refused to return the full skill document verbatim, saying "reproducing a complete proprietary document in full would exceed fair use." Agent received a summary instead of the 2,071-line instruction set.
**Impact:** HIGH — agent cannot follow instructions it hasn't read. Non-deterministic (3 of 4 other agents got the full doc).
**Fix options:**
1. Agents should use `curl` to download the raw file and `Read` to read it locally — bypasses WebFetch's content filtering
2. The skill doc instructions already say to clone the repo for Tier A agents — but agents may choose WebFetch for convenience
3. Add explicit instruction to the skill doc: "Download this file with curl, do not use WebFetch or similar tools that may truncate content"
**Status:** Open

## Finding 2: "Stage" field is awkward for non-startups

**Phase:** Registration (profile creation)
**Agents:** All 3 non-startup agents (Greenloop VC, Bridgepoint Legal, Arcadia Capital)
**Issue:** All agents independently noticed that the `stage` field (`pre-revenue`, `seed`, `series-a`, `series-b`, `growth`) doesn't fit VCs, law firms, or service providers. All defaulted to "growth" but flagged it as awkward.
**Impact:** MEDIUM — doesn't block registration, but confuses agents and produces misleading data. A VC fund labeled "growth" looks like a growth-stage startup.
**Fix options:**
1. Add non-startup stage values: `established`, `fund`, `service-provider`
2. Make `stage` optional for non-startup company types
3. Add a `company_type` field: `startup`, `investor`, `service-provider`, `other`
**Status:** Open

## Finding 3: Agents present info for approval before acting

**Phase:** Registration
**Agents:** All 5
**Issue:** Not a bug — a positive finding. All agents gathered information, presented it back to the human for review, and waited for approval before making API calls. The skill doc's "present to human for approval" pattern is being followed correctly. The agents are genuinely asking for confirmation, not blindly proceeding.
**Status:** Working as designed
