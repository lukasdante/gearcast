# GearCast MVP promo video — design

Date: 2026-11-28 · Status: draft for approval

## Intent and why
A 2–3 minute, upbeat, story-driven product demo of the GearCast MVP (gearcast.engrlouis.dev) for **judges and
investors**. It has a short problem hook, then shows the working MVP. The hook: an unplanned failure in a
coconut plant's wastewater line is costly and needs fixing fast. The rest follows one shift where a fault
passes from technician to engineer to supervisor, and every feature appears because someone in the story
needs it. The point is "this is a real, working product", not a concept piece.

## Goals
- Hook of about 10–15 s: the problem, with real stakes from the dataset (peso losses, curtailment, the EQ
  buffer). Most of the runtime then goes to the MVP.
- Show how maintenance passes between roles: fault → field action → approvals → records update → next
  person picks it up. Include at least 1 Supervisor, 1 Engineer, and 2+ Technicians.
- Cover the current features: Dashboard, Plant Overview (3D, inspector, fault simulation, shutdown cost),
  QR scan quick view, Troubleshoot, Spare readiness and deploy (accessory vs major approval), Caster chat
  (photo → incident), Incident report (Field 3 trend with range picker, Photo 1, PDF), Repair/Replace (brand
  and supplier), Knowledge base (search and open file), PM monitoring (assign, tablet findings, scanned sheet),
  Approvals, Layout edit approval, Plant-access emergency grant, role-based login.
- The narration also appears on screen as bold, animated captions, a few words at a time, with key numbers
  emphasised. The video works on mute.
- Interactive feel: a visible cursor glides to each control, the control squishes and bounces on click with
  a ripple, then the view transitions. The camera follows the cursor.

## Non-goals
- No product changes for the video. No mockups or recreated UI.
- No investor-deck content (market size, team, financials) beyond a one-line close.
- No character voices. One narrator only.

## Anti-goals (fails even if it "works")
- Looks like a concept video or slideshow. Judges must see the real app.
- A feature tour with no story ("and here is page X").
- Invented numbers. Every figure on screen comes from the app or the dataset.
- Demo data written into the production D1.

## Constraints
- **Voice:** a single narrator, recorded by the user in Cartesia from our script, one clip per scene.
  Remotion sizes each scene to its clip, as in the earlier `docs/video/narration.md` convention.
- **Length:** 2:00–3:00, about 300–420 narration words.
- **Output:** 1920×1080, 30 fps MP4, rendered with Remotion. A new Remotion project goes in `video/`; none
  exists yet.
- **Footage source:** the live MVP code, recorded with Playwright by Claude.
- **Data:** capture against a local `wrangler dev` seeded from the same data and schema, so approvals,
  incidents and scans created on camera don't touch production. *(My call.)*
- **Knowledge search:** needs the Workers AI and Vectorize bindings. Use wrangler remote bindings for those
  two only (read-only for search), or capture that one beat from production as read-only.
- **Caster:** needs the DeepSeek key from the local `.dev.vars`.

## Approaches considered
- **A. Scripted Playwright captures of the real app, edited in Remotion — chosen.** Real MVP footage that
  can be re-recorded beat by beat. Cursor, zoom and captions are added in the edit from click data
  recorded during capture.
- B. Recreate the UI as animated Remotion components. Slickest motion, but it reads as a concept video and
  costs much more per screen. Rejected for this audience.
- C. Team-filmed hands-on footage plus captures. Most human, but depends on a shoot. Kept as an optional
  later add-on (QR scan, tablet form).

## Decided by the user
- Audience: judges and investors. Showcase the MVP, with a brief "needs fixing ASAP" problem hook.
- Single Cartesia narrator. The script also appears as on-screen text.
- Approach A. Claude does the captures with Playwright and the Remotion edit, using several specialised
  Opus agents.
- Device frames: laptop for desktop screens (Plant Overview especially), phone or tablet for field moments.
  Visible cursor with a bounce-on-click effect and a camera that follows the action.
- A fresh script built from the current features, not the old "One bad morning" script.

## Story (beat outline: the script and storyboard are the first deliverable)
Character names are **my call**, shown with role and account badges on screen:
- Lemuel, Plant Supervisor (PS-01)
- Jun, Engineer (EN-01)
- Mia, Technician (MT-01)
- Ken, Technician (MT-02)
- Rico, Technician (MT-03), for the emergency cross-site beat

| # | Beat | Who · device | Feature shown |
|---|---|---|---|
| 0 | **Hook:** one pump fails, the EQ tank fills, the lines curtail, pesos per hour. "It needs fixing now." | Motion graphics with real figures | Problem and stakes |
| 1 | GearCast title; three role logins | Laptop | Role-based login |
| 2 | 6 AM: Lemuel's dashboard flags P-101B (needs attention, condition watch) | Lemuel · laptop | Dashboard, 3D needs-attention asset |
| 3 | On rounds, Mia scans P-101B's QR tag and sees its history and rising vibration | Mia · phone | QR scan quick view |
| 4 | Jun opens Plant Overview, inspects P-101B and simulates the trip: the standby takes over, then the shutdown cost | Jun · laptop | 3D overview, inspector, fault simulation, shutdown cost |
| 5 | The pump trips for real. Mia troubleshoots: manual-grounded steps, past repairs, the parts and where they are | Mia · tablet | Troubleshoot |
| 6 | Mia deploys grease (accessory, instant); the bearing kit (major) goes to Lemuel, who approves it | Mia · tablet → Lemuel · laptop | Spare deploy and approval |
| 7 | Mia sends Caster a photo, which becomes an incident report: Photo 1, Field 3 trend (range picked, failure marked), PDF | Mia · phone → laptop | Caster, incident report |
| 8 | Repair or replace? Jun gets the verdict, the brand and supplier, and the lead time | Jun · laptop | Repair/Replace |
| 9 | Jun opens the exact manual page from a search, then indexes a new manual | Jun · laptop | Knowledge base |
| 10 | Jun proposes a layout change, which goes to Lemuel, who approves it | Jun → Lemuel · laptop | Layout edit approval |
| 11 | Lemuel assigns follow-up PM to Ken. Ken files findings on a tablet (checklist, readings, photos), Jun approves, and the record updates | Lemuel → Ken · tablet → Jun | PM monitoring, findings, approvals |
| 12 | A sister plant is short-handed: Lemuel grants Rico temporary access with an expiry | Lemuel · laptop | Plant-access emergency grant |
| 13 | Dashboard turns green. Recap of the numbers, "GearCast — maintenance that sees it coming", URL | Laptop + end card | Close |

About 10–12 s per beat, landing at 2:30–2:50.

## Production design
- **Capture (Playwright):** one script per beat that logs in as that beat's account and performs the
  clicks at a fixed viewport:
  - laptop 1920×1200 at DPR 1
  - tablet 1280×800
  - phone 390×844 at DPR 3

  Each beat records a clean video plus a JSON timeline of `{t, x, y, action, selector}` for every click,
  hover and keystroke. The real cursor stays hidden. Waits are deterministic: no fixed sleeps, wait for
  network-idle or the target element. Seed and reset scripts put the app in the same state before every
  take. The QR scan uses a fake camera stream of a printed label, as in the earlier e2e test.
- **Edit (Remotion):**
  - Components: `DeviceFrame` (laptop, tablet, phone), `Cursor` (eased path, squish-and-bounce, ripple)
    driven by the click timeline, `Camera` (zoom and pan keyed to the timeline), `Caption` (kinetic text
    lines with keyword emphasis), `RoleBadge` (name · role · account), `SceneTransition`, `HookGraphics`,
    `EndCard`.
  - Each scene's duration is its Cartesia clip plus a tail. Captions are timed by phrase within the clip.
    Word-level timing is optional, using Cartesia timestamps if exported.
- **Audio:** narrator clips `00_hook.wav` … `13_close.wav`, recorded by the user. Background music: an
  upbeat royalty-free track supplied by the user, mixed under the voice (ducked). There is a slot for it
  until it's chosen.
- **Agents:** a Capture agent (Playwright beats, seed and reset), a Remotion agent (project and
  components), and Claude (script, storyboard, timing, assembly, review renders).

## Deliverables
1. `docs/video/promo/script.md`: the narration per scene, about 300–420 words, voice-friendly with asset tags
   spelled out, plus Cartesia notes.
2. `docs/video/promo/storyboard.md`: per scene, the device, account, on-screen actions (click list), camera
   moves, caption lines, transitions and duration target.
3. `video/`: the Remotion project, captured clips, and the rendered `gearcast-promo.mp4`.

Checkpoint: the user approves the script and storyboard before capture starts, and records Cartesia from the
approved script. Captures can be made before the audio arrives and are retimed once it does.

## Left to the builder
Caption typography and colour (GearCast app palette), transition style, exact camera easing, the music
level, and whether word-level caption timing is worth it.

## Decisions after review (2026-11-28)
- **Supervisor name:** Lemuel. *(User.)*
- **Hook:** loss scenario LS-10, ₱5,907,405 (P-101A trips, standby P-101B skipped rotation and fails to start,
  10 h). Counterfactual LS-11 is ₱0. The close reuses this. *(My call, from the data.)*
- **Story:** the failure is caught early; there is no "real trip". The fault visuals come from the app's fault
  simulation: the asset turns red, the process strip shows the critical stage, and the shutdown cost appears.
  The "Simulation only" note may be in frame. *(User wants red and critical-process shown.)*
- **Must-show:** the AI tools (Caster's MCP-style tool calls with confirm cards), incident report generation,
  and Repair/Replace narrated as "XGBoost model" at the user's request. The code describes it as
  gradient-boosted trees, but today it is rules plus a cost model.
- **No real photos.** Field photos (the worn bearing or coupling) and the job sheet are React-built
  illustrations. They are rendered to PNG and used as the uploaded photo in the app, and shown animated in
  Remotion. The whole edit is Remotion React components plus Playwright captures, with strong motion design.
- **Plant 2:** a demo-only second plant, seeded in local D1 only.
- **Knowledge base:** show search and open the cited page; hover over the upload button only. No indexing on
  camera, because the Vectorize index is production.
- **Build:** capture from the deployed code (version db7b792b, matches the working tree).
- **Clips:** `00_hook` … `13_close`, 14 clips. The user records them as soon as the script is validated.
