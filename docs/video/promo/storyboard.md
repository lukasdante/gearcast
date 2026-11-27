# GearCast MVP promo — storyboard

1920×1080 · 30 fps · about 2:45. Each scene runs as long as its narration clip (`video/public/audio/NN.wav`) plus a 0.3–0.6 s tail.
On-screen captions come from `video/src/data/captions.json`.

## Conventions
- **Shot ids:** `NN-x` (e.g. `04-b`). Each capture is saved as `video/public/captures/NN-x.webm` plus `NN-x.json` (the click timeline).
- **Devices and viewports:**
  - **L** = laptop, 1920×1200
  - **T** = tablet, 1280×800 (landscape)
  - **P** = phone, 390×844 @3x
- **Cursor:** on the laptop, an animated arrow glides to each target, squishes and bounces on click, and leaves a ripple; the target pops slightly. On tablet and phone, a finger dot with a ripple replaces the arrow.
- **Camera:**
  - It starts each device shot wide, with the whole device visible on the branded background.
  - It pushes in toward where the action happens (about 1.3–1.8×) and eases back out before the transition.
  - It never cuts mid-zoom.
- **Role badges:** a role badge (name · role · account) slides in at the first mention of a character in each scene. A feature chip (top-left) names the feature on screen.
- **Approvals:** every approval moment gets an `ApprovalToast` ("Approved by Lemuel · Supervisor").
- **Captures:** shots are recorded longer than needed (+2 s at each end) and trimmed in the edit. Actions happen at a human pace: about 0.6–1.0 s between moving to a target and clicking it.
- **Timings:** the times in each scene are approximate, measured from the clip start. The editor snaps them to the caption word times (the cue words are given).

---

## 00 — Hook · ≈18.2 s · motion graphics (no capture)
- **0–3 s:** dark, quiet plant schematic: EQ tank → P-101A / P-101B → treatment. A clock reads 06:00. Cue: "Six in the morning".
- **"trips":** P-101A flashes red with an alarm pulse.
- **"skipped its rotation":** a calendar tick shows 6 weeks without a rotation.
- **"doesn't start":** P-101B stutters, and its start command fails.
- **"Ten hours":** the clock races ahead and the EQ tank level climbs past the 2.5 h buffer line.
- **"three production lines":** the VCO, DC and coconut-water lines dim one by one.
- **"five point nine million":** the peso counter slams to ₱5,907,405.
- **"one missed check":** everything blurs except a single empty checkbox.
- **Captions:** heavy and centred, white with red emphasis.

## 01 — Meet GearCast · ≈10.2 s · motion graphics
- **"gap GearCast patches":** a hard cut to bright. The GearCast logo snaps in and the background shifts to the brand gradient.
- **"supervisor, engineer, technicians":** three role cards (Lemuel, Jun, Mia, with Ken and Rico smaller) snap in on their cue words.
- **Last 1.5 s:** the cards fly into a laptop screen showing the login page. This hands off into scene 02.

## 02 — Dashboard · Lemuel (PS-01) · ≈12.4 s · L
- **Shot 02-a:**
  1. Login page. Pick the Supervisor tab, type PS-01 and the password (fast-forwarded in the edit), click Sign in.
  2. The splash screen is skipped in the edit, and the Dashboard appears.
  3. The camera pans across the KPI row, then the process strip.
  4. Cue "one pump already flagged": the cursor hovers the 3D needs-attention asset card (P-101A, the asset the dashboard really flags). The camera pushes into it, and the condition watch row for P-101A is highlighted.
- **Feature chip:** "Dashboard".

## 03 — QR scan · Mia (MT-01) · ≈12.3 s · P
- **Device swap:** the laptop flips into a phone (`Transition` device swap).
- **Shot 03-a (phone):**
  1. Mia is logged in.
  2. Tap the floating "Scan QR" button. The camera view opens with the P-101A tag (from the fake camera feed of `qr-label.png`), the code locks, and there is a haptic-style pulse.
  3. The quick view opens.
  4. Scroll through status, work orders, readings and failures. Cue "vibration is climbing": the camera zooms into the last-readings vibration value or trend.
- **Optional overlay:** a gloved-hand illustration holding the phone at the start, from motion graphics.
- **Feature chip:** "QR scan".

## 04 — Plant overview + fault · Jun (EN-01) · ≈14.6 s · L, the hero shot
- **Shot 04-a:** the fault plays twice, so it lands on the hook's numbers.
  1. Plant Overview, 3D. Click P-101A, and the Inspector opens.
  2. Cue "what if it fails?": click **Simulate fault** (big bounce). P-101A turns red, and standby P-101B takes over at ₱0 (shown briefly).
  3. Cue "turns red": select P-101B and click **Simulate fault** too. Both pumps are red.
  4. Cue "which stage goes critical": W05 turns red on the process strip, W06–W08 show as affected, and the "Plant shutdown" banner appears.
  5. Cue "puts a price on the shutdown": in Shutdown cost, set the outage to 10 h, and the figure shows ₱5,907,405 (the hook number, LS-10). The camera zooms into it.
  6. Optional: click Reset simulation off-beat.
- **Feature chips:** "3D Plant Overview" → "Fault simulation".

## 05 — Caster AI + troubleshoot · Mia · ≈14.6 s · P → T
- **Shot 05-a (phone):**
  1. Open Caster. Mia types "P-101A vibration rising, what do I check?"
  2. Cue "calls the plant's own tools": tool-call chips animate in one by one (asset data → troubleshoot → spare stock). If the app shows tool steps, capture them; otherwise the editor overlays chips that match the tool names in the stream.
  3. The answer streams in.
- **Shot 05-b (tablet, from cue "steps from the plant's manuals"):**
  1. Troubleshoot page for P-101A: steps with manual citations.
  2. Cue "parts needed, and where they're stored": the materials panel (part, stock, location, supplier), highlighted.
- **Feature chips:** "Caster AI · tools" → "Troubleshoot".

## 06 — Spares + approval · Mia → Lemuel · ≈8.6 s · T → L
- **Shot 06-a (tablet):** Spare Readiness. Cue "deploys it on the spot": deploy grease SPP-018 (for motor M-101A) → instant "Deployed" toast. Cue "major spare": deploy bearing SPP-003 (drive end, 6309-2Z) → "Sent for approval" badge.
- **Shot 06-b (laptop, Lemuel):** the Approvals queue shows the bearing kit. Cue "approved in one tap": click Approve, and the `ApprovalToast` pops.
- **Feature chip:** "Spares · approvals".

## 07 — Incident report · Mia · ≈15.0 s · P → L
- **Shot 07-a (phone):**
  1. In Caster, attach a photo (`worn-bearing.png`; the editor also shows it as a "snap" flash).
  2. Type "write an incident report for P-101A".
  3. A confirm card appears; tap Confirm.
- **Shot 07-b (laptop):**
  1. The incident report: Photo 1 beside the summary (cue "photo sits beside the summary").
  2. Scroll to Field 3. Cue "one week to one year": click 1w → 1m → 1y, and the chart re-draws each time. The camera zooms into the failure-date marker on "failure date marked".
  3. A quick flash of the PDF (download/open) at the end.
- **Feature chips:** "Caster → incident report" → "Field 3 trends".

## 08 — Repair or replace · Jun · ≈11.8 s · L
- **Shot 08-a:**
  1. Repair / Replace page. Select P-101A and run the prediction.
  2. The verdict card animates. Expect "Repair – watch". The narration is conditional ("if it is replace"), so show the "If replaced" line. The camera zooms into the verdict, with "Model" text visible if shown.
  3. Cue "names the brand, the supplier, and the lead time": move down to the "Replace with" line, highlighting brand → supplier → lead time in sequence (editor highlight boxes).
- **Feature chip:** "Repair / Replace · ML".

## 09 — Knowledge base · Jun · ≈6.3 s · L
- **Shot 09-a:**
  1. Knowledge base. Type "bearing replacement transfer pump" and run the search.
  2. Click the top result, and the manual PDF opens at the cited page.
  3. The camera pushes into the highlighted passage.
- No upload; at most the cursor brushes past the upload button.
- **Feature chip:** "Knowledge base".

## 10 — Layout approval · Jun → Lemuel · ≈6.5 s · L
- **Shot 10-a (Jun):** Edit layout. Drag one item slightly, or add a label, then click Submit → "Sent to supervisor".
- **Shot 10-b (Lemuel):** Approvals → layout change → Approve → toast. This is fast-paced, with a split screen allowed (Jun left, Lemuel right).
- **Feature chip:** "Layout · approval".

## 11 — PM findings · Ken (MT-02) → Jun · ≈11.5 s · T → L
- **Shot 11-a (tablet, Ken):**
  1. My tasks → PS-024 (P-101A alignment & coupling check, assigned to MT-02 in the seed) → Record findings.
  2. Tick the checklist (fast), enter a vibration reading, attach `pm-findings-1.png` and `pm-findings-2.png`, then File.
  3. Optional inset: the scanned `job-sheet.png` upload.
- **Shot 11-b (laptop, Jun):**
  1. Approvals → findings with readings and photo thumbs → Approve.
  2. Cue "record updates itself": cut to the PM table, where the last-done date flips to today and is highlighted.
- **Feature chips:** "PM findings (tablet)" → "Approval".

## 12 — Emergency access · Lemuel → Rico (MT-03) · ≈7.8 s · L
- **Shot 12-a:** Plant Overview → Plant access → grant MT-03 access to Plant 2, with an expiry (pick 12 h). Confirm. The access row appears with a countdown.
- **Optional:** a split-second phone inset of Rico's plant switcher now listing Plant 2.
- **Feature chip:** "Emergency plant access".

## 13 — Close · ≈7.4 s · motion graphics + L
- **"One pump, caught early":** a quick montage (0.4 s each) of the strongest frames: red pump → approval toast → green dashboard.
- **"stayed in the plant":** the peso counter shows ₱5.9 M with a "saved" label (LS-11 counterfactual).
- **End card:** GearCast logo, "Maintenance that sees it coming.", gearcast.engrlouis.dev. Hold 1.5 s past the audio.

---
## Story-state facts (from the demo environment, video/capture/README.md)
- Story clock: pinned at 2026-11-28 14:00 (`CAPTURE_AS_OF`), so re-takes are identical on any day.
- Hero pump: **P-101A**. It is the dashboard's needs-attention asset, with vibration rising 1.3 → 1.6 mm/s over 30 days.
- Fault: one pump alone costs ₱0 (the standby covers it). Both pumps for 10 h gives ₱5,907,405 and "Plant shutdown".
- Spares: SPP-003 bearing is major and needs approval (PS-01 or EN-01). SPP-018 grease is an accessory and deploys instantly.
- PM: PS-024 (P-101A alignment & coupling) is assigned to MT-02. Approvals come from EN-01. Layout changes are approved by PS-01 only.
- Access: only PS-01 can grant it. MT-03 → plant-2 with an expiry.
- Built-in manual PDFs need full Chromium (`channel: 'chromium'`). The default headless shell has no PDF viewer.
