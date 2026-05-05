# envoiplatform.com — marketing site

Single-page HTML marketing site for Envoi (the company). Served at <https://envoiplatform.com/>.

## TL;DR — "push these changes to /apps/marketing"

To update the marketing homepage:

1. Edit `apps/marketing/index.html` (and any sibling assets here).
2. Commit + push the change to `main`.
3. The Vercel `envoiplatform` project auto-deploys, and `envoiplatform.com` updates within ~30 seconds.

That is the whole workflow for trivial copy edits. **No** ticket flow, no QA preview, no separate deploy script. The simple iron-rule docs-only exception (per `CLAUDE.md`) applies — explicit human approval, then a direct commit.

For structural changes (new pages, layout, build pipeline), use the standard nominate-qa → promote-to-production path so the QA preview catches anything weird before production sees it.

## How the deploy works

Linked to the Vercel `envoiplatform` project (`prj_ig2Mj6Vkj4yzHJEONbgRnEsljLRr`) with **Root Directory** set to `apps/marketing/`. Pushes to `main` in this repo trigger an auto-deploy of this directory only — Vercel treats `apps/marketing/` as the project root, so `index.html` is served at `envoiplatform.com/` (the directory name is invisible to URLs).

The platform Vercel project (`suf-agent-2026`, root directory `/`) also auto-deploys on every `main` push. Marketing-only changes produce a byte-identical platform build; the redeploy is wasted work but not visible to users. If we ever need to suppress it, an `ignoreCommand` in `vercel.json` can skip the platform build when only `apps/marketing/**` changed.

## Full path (structural changes)

```bash
git checkout -b copy/some-edit main
# edit apps/marketing/<file>
git commit -m "marketing: <what you changed>"
node scripts/github/nominate-qa.mjs copy/some-edit --as <author>
# verify on the QA alias (Vercel generates a preview subdomain per branch)
node scripts/github/promote-to-production.mjs --as <author>
# Alistair merges the PR → Vercel auto-deploys → envoiplatform.com updates
```

## History

Moved into this monorepo on 2026-04-16 (DNS-M01). Previous location was `/Users/acroll/coding/envoiplatform/`, deployed manually via a `deploy.sh` script that ran `npx vercel --prod` directly from a local working tree (i.e. bypassing the iron-rule path and any review). That script lived alongside this README as `deploy.sh.legacy` until 2026-04-25, when the monorepo pipeline had proven itself across multiple deploys and the script was removed (the manual-push behavior would now be actively unsafe — pushes to production must go through `main`).

## Deploy history

- 2026-04-16 — first Git-sourced deploy after move into monorepo (DNS-M01).
- 2026-04-25 — `deploy.sh.legacy` removed; monorepo pipeline confirmed as sole deploy path (REFAC-D7).
