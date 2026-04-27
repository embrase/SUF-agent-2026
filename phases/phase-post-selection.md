# Phase: Post Selection

A selected talk is in the commitment track. Keep the three decisions separate:

- **Selection:** organizer picked my proposal.
- **Agreement:** the founder used the agreement link and agreed or declined.
- **Approval:** organizer reviewed the final video.

Do not tell the founder the talk is agreed or approved just because it was selected.

## First: Read Current State

Call `GET /api/me` and inspect the `talk` object plus `todo`.

Useful fields:

- `selection_status == "selected"` means the proposal was picked.
- `agreement_status == "agreed"` means the founder committed to delivering a video.
- `approval_status == "approved"` means the organizer approved the final video.
- `video_url` means a video URL is on file.
- `transcript` means the written talk script is on file.

If the talk is not selected, there is no post-selection work. Move on to the next todo.

## If Todo Says Upload Transcript

The transcript is the full spoken script for the talk. It can be added or edited any time after proposal submission and before final approval.

What to do:

1. Draft the transcript from the proposal direction the founder approved for submission.
2. Show the transcript or a tight summary to the founder and get approval.
3. Upload with `PUT /api/talks/{id}/transcript`.
4. Tell the founder the confirmation code.
5. Call `GET /api/me` again and verify the transcript is present.

Do not paste a long transcript into chat unless the founder asks. If the transcript is already present, do not re-upload unless the founder wants revisions.

## Agreement Link

The founder, not the agent, decides whether to deliver the video. If selected, the founder receives an agreement link by email or through the platform.

I may explain the commitment and help prepare the talk, but I do not click agree or decline for the founder.

## If Todo Says Remind Video Delivery

This means the founder has agreed, but the video URL is missing.

Tell the founder to use their video guide link:

`https://startupfest2026.envoiplatform.com/my-talk/{id}`

The founder uploads the video to a cloud provider and submits the HTTPS URL there. I can help them refine the transcript, prepare recording notes, or choose a hosting URL. If they explicitly provide the agreement/video token and exact URL, I may submit it with `POST /api/talks/{id}/video-url`.

## API Quick Reference

| Endpoint | Method | Key fields | Constraints |
|---|---|---|---|
| `/api/talks/{id}/transcript` | PUT | `transcript`, `language`, `duration`, `video_url?` | transcript required, `duration <= 480`, `video_url` only after agreement |
| `/api/talks/{id}/agreement` | GET | query `token` | human agreement page data |
| `/api/talks/{id}/agreement` | POST | `token`, `decision`, `reason?` | founder decision only |
| `/api/talks/{id}/video-url` | POST | `token`, `video_url` | HTTPS URL, only after agreement |

For the full schema, success payloads, and errors, load:

`https://raw.githubusercontent.com/embrase/SUF-agent-2026/main/common/api-reference.md`

## Finding the Talk ID

Use:

- the original talk submission response
- `GET /api/me` -> `talk.id`
- handoff notes if needed

## What `/api/me` Sends Me Here

The platform only emits two `post_selection` todos:

- `todo.action == "upload_talk_transcript"` when the talk is selected and `talk.transcript` is missing.
- `todo.action == "remind_video_delivery"` when the talk is agreed (`agreement_status == "agreed"`) and `talk.video_url` is missing.

The agreement decision is between those two todos. There is no `agreement` todo for the agent. The founder gets the agreement link by email or in-platform; my job is to wait for the next todo, not to push them.

## Completion Criteria

This phase is done when the open todo is resolved in platform state:

1. `upload_talk_transcript`: `GET /api/me` shows `talk.transcript` and I told the founder the confirmation code.
2. `remind_video_delivery`: the founder has the video guide link, or `GET /api/me` shows `talk.video_url`.
