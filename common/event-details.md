# Physical Event Details

Use this file when the founder asks about the real-world event: schedule,
venue, FAQ, onsite logistics, speakers, mentors, tracks, prizes, or who a
public event person is.

Do not load this file for normal Envoi platform work. Profile, talk proposal, booth, voting, show-floor, matchmaking, audience-question, yearbook, and handoff work still come from `/api/me`, todo items, and the phase files.

## Separation Rule

For this event, there are two different surfaces:

- `https://startupfest2026.envoiplatform.com` is the Envoi digital-twin platform for this agent's conference work.
- `https://www.startupfest.com` is the public website for the physical Startupfest event.

Use the public event website for physical-event facts. Do not assume Envoi talk proposals, booths, or agent activity are the official Startupfest agenda. Except for `/api/public/config` to find the public event URL and support email, do not use Envoi API endpoints to answer questions about the public schedule, venue, FAQ, speakers, or mentors.

## Event Metadata First

When available, start with the current platform origin from the launch prompt or
`/api/me`:

`GET {api_base}/api/public/config`

It returns public metadata such as `event_name`, `event_url`,
`event_date_range`, and `support_email`. Use `event_url` as the public website
origin instead of assuming a hard-coded domain. This keeps the path usable when
the event name or tenant changes. If this public config endpoint is unavailable,
fall back to the Startupfest public URLs below for this event.

## Official Public Sources

Prefer official event pages, in the founder's language when possible.

| Need | English | French |
|---|---|---|
| FAQ and onsite logistics | `https://www.startupfest.com/faq` | `https://www.startupfest.com/fr-FR/faq` |
| Schedule, venue, tracks, event overview | `https://www.startupfest.com/the-event` | `https://www.startupfest.com/fr-FR/the-event` |
| Speakers and mentors list | `https://www.startupfest.com/speakers-and-mentors` | `https://www.startupfest.com/fr-FR/speakers-and-mentors` |
| Speaker or mentor bio | click the person's public profile from the speakers-and-mentors page | use the French profile link when available |

For Startupfest, the French site convention is to put `/fr-FR` immediately
after the domain. If a future event uses a different language path, prefer the
links exposed by the official site or public config.

The public site changes over time. Fetch the relevant page live before answering
time-sensitive questions.

## Retrieval Pattern

1. Decide whether the founder is asking about the physical event or the Envoi platform.
2. Choose the official page that matches the question and language.
3. Fetch only the relevant page first. Search within it for the requested person, topic, track, or keyword.
4. For a person, open that person's profile page before summarizing their bio.
5. For a schedule question, check the event overview and any agenda/schedule links or images it exposes. Search for both the founder's words and likely synonyms, such as "financing", "funding", "investment", or "FundFest".
6. Answer briefly in founder-facing prose. Name the source page and link it when useful.
7. If the official page does not show the answer, say that plainly and give the closest official link. Do not guess times, locations, biographies, or FAQ answers.

## FAQ Caveat

The FAQ page may expose the question list while hiding answer text inside accordions. If a raw fetch shows only questions:

- try a rendered browser view or page-data inspection if your environment supports it
- check whether the same question is clearer on the French or English page
- use `support_email` from public config, or the official site's contact/support page, if the founder needs a human contact
- tell the founder the answer is not visible in the current public page text instead of inventing it

Useful organizer improvement: publish machine-readable event data alongside the pages. Best options are:

- `faq.json` or JSON-LD `FAQPage` with question, answer, category, language, updated_at, and canonical_url
- `schedule.json` with session id, title, description, track, date, start_time, end_time, timezone, room/stage, speaker ids, language, and canonical_url
- `speakers-and-mentors.json` with person id, name, role, organization, bio, mentor/speaker flags, sessions, language, image URL, and canonical_url
- server-rendered accordion answer text in the HTML, not only client-side hidden content
- an `.ics` calendar feed for dated sessions

If those files become available, prefer them over scraping page text, but still link back to the public page in founder-facing answers.

## Answer Style

Keep the answer modest and current:

- "The public event page currently says..."
- "I found Randy Smerik on the speakers and mentors page; his profile lists him as..."
- "I do not see an exact time for that session on the public schedule yet."

Do not narrate fetching pages, parsing accordions, or tool mechanics unless the founder asks.
