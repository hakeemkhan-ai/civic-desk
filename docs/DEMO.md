# Three-minute demonstration script

## Before recording

Use a non-production database with the synthetic seed. Start MongoDB and `npm run dev`, then verify the whole flow once. Set the demo password locally; never display `.env` or developer tools containing cookies. Keep two browser profiles ready: resident and staff. No real complaint or personal information should enter the demonstration.

If the OpenAI key is configured, wait for seeded embeddings to become ready and verify the actual response mode. Otherwise explicitly demonstrate **manual drafting / word matching**. Do not narrate an offline template as a model response. Live metrics should be shown only after `npm run eval:live` has completed.

## 0:00–0:25 — Context and reporting

Show the visible demonstration label and community reports.

“Civic Desk helps residents report local issues and see what staff did. This is an independent Hyderabad demo, not an official municipal service; these reports are synthetic.”

Choose **Report an issue**. Enter:

> There is a pothole outside the community library. I noticed it this morning. Not sure how long it has been there.

Location: `Afzal Gunj · State Central Library`. Select South Hyderabad (informal demo area) and approximate position. Optionally add synthetic coordinates `17.3713, 78.4803`. Leave duration unknown. Show the optional private-photo field without implying image analysis.

## 0:25–0:55 — Draft and uncertainty

With AI available, choose **Help me draft this**. Point out the editable title, category, extracted facts, and missing-information questions. Edit one phrase.

“The assistant structures what was reported. It cannot verify severity or invent duration. The original notes and its suggestion are saved separately from the text I approve.”

Without a key, show the unavailable message and select **Write it myself**. State that this is the manual fallback. Choose roads explicitly.

## 0:55–1:25 — Similarity versus identity

Choose **Check similar reports**. Compare the library report's location, time, and status. Open its detail in a new tab if helpful.

“Similar words don't prove this is the same incident. The matching method and any uncertainty are visible. I can follow an existing report, reject a suggestion with a reason, or submit a new one.”

Show **Follow this incident**, then return and create the demonstration's new report. Avoid implying that a low-similarity or uncertain match was confirmed automatically. When in word mode, state that semantic retrieval has not run.

## 1:25–2:15 — Staff owns decisions

In the staff profile, open the new report from **Staff review**. Confirm or correct its category and department, add a factual decision note, and choose **Confirm review**. Move submitted → under review → assigned → in progress, adding a note each time. Assignment requires confirmed review.

“Only the server-authorized staff role can make these decisions. Every change appends an audit event. Corrections become feedback for future evaluation.”

Optionally show duplicate candidates and confirm a link to the earlier library incident, with a reason. Explain that both records remain intact.

## 2:15–2:40 — Resident tracking

Return to the resident profile and refresh the report. Show its chronological timeline, staff-confirmed team, and following state. Explain the difference between an AI suggestion and a staff decision.

“Residents can see what changed and when. Other residents cannot see my original notes, account contact details, or private attachment.”

## 2:40–3:00 — Evidence and honest limits

Open the case study or actual result JSON. State the raw keyword test figures: 46% candidate recall@5, 15.5% precision, and 36% recall on 80 synthetic held-out queries.

“The benchmark separates related incidents before splitting. It exposes keyword failures. Live embedding and drafting results are unverified until real provider runs complete; human review is pending.”

Close with the next verification work, not an invented claim of municipal impact.

## Browser verification checklist

Browser execution is **still pending as of 2026-10-16**: browser inventory is empty and opening the in-app browser returns `Browser is not available: iab`. Backend equivalents and API/database restart persistence passed via real HTTP and MongoDB checks; they do not establish UI behavior. Record date/browser/viewport and result when performing this checklist:

- Resident sign-in; wrong password error; keyboard navigation and visible focus.
- Manual report creation, AI-unavailable notice, and retry without losing input.
- Missing-location submission and honest low-confidence duplicate explanations.
- Follow/unfollow an existing report; reject a candidate with a reason; continue with a new report.
- Private valid-image preview; invalid/oversized upload errors.
- Category/status filters, empty states, pagination, back navigation.
- Resident receives 403 from direct staff API calls even if UI controls are manipulated.
- Staff review, valid/invalid transitions, conflicting revision rejection, duplicate link without merge.
- Resident observes timeline after refresh and after API/database restart.
- Desktop and 390px mobile layouts; no horizontal overflow; text remains readable at 200% zoom.
- Sign out and verify protected data no longer loads.

Map check: place, drag and clear a pin; change manual coordinates and verify marker synchronization; go forward/back between draft steps; submit and reload the detail map. Test keyboard Use map center, mobile layout, failed tiles, and visible attribution. Verify the Charminar favicon and branding.
