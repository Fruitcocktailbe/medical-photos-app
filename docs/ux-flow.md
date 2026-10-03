# UX flow — how the app works

Designed 03/10/2026 with Jeroen (16 scoping answers + 8 UX answers). This is the behavioural spec for the screens; the PRD (`J.A.R.V.I.S/projects/medical-photos-app/prd.md`) stays the product source.

## The situation we design for

A consult room, ward or OR corridor. The phone comes out of a pocket, the patient is in front of you, you keep talking while you shoot, and the next patient is eight minutes away. So:

- **Pocket to first photo of a known patient: unlock + 4 taps.** Scan, confirm, treatment, visit (proposed) and you're shooting.
- **The one error that must never happen silently is the wrong patient.** Everything else (a missing view, a blurry shot) is fixable later; a photo in the wrong folder is a medical-record error. So identity always gets one explicit tap, with the birth date highlighted.
- **Eyes on the patient, not the screen.** Big targets, one decision per screen, the app proposes and you accept.
- **Nothing patient-related outside the app.** No gallery, no screenshots, no previews left behind.

## Decisions (Jeroen, 03/10)

| # | Topic | Decision |
|---|---|---|
| U1 | Start screen | **Camera, ready to scan.** Recent patients below the camera. |
| U2 | Confirm | **Always one tap, birth date highlighted.** Never auto-accept. |
| U3 | Consent | **Only when exporting.** No consent step while shooting; the export asks and blocks until answered. |
| U4 | Shutter | **Manual shutter; the app advances to the next missing view.** The ring says when it's right, you decide when to shoot. |
| U5 | Onboarding | **Minimum: folder + lock, then a short test run.** Name, title, signature and logo are asked at the first export. |
| U6 | Returning patient | **Same surname + first name + birth date = same patient, same folder.** Then: which treatment (procedure)? Then the visit, proposed. |
| U7 | Already operated | **A patient can enter the app already post-op.** New treatment can start with the procedure and surgery date right away. |
| U8 | Review | **Thumbnail strip while shooting** (tap: retake / delete / mark as reference) **+ summary screen before closing** (missing views shown, not blocking). |
| U9 | Hands | **Screen only** in v1. No volume key, voice or remote. |
| U10 | Favourites | **Star (☆/★) any procedure; starred ones are always on top**, in the order you starred them, then "Vaak gebruikt" (most used, not starred), then the rest. Stored in the photo folder (`.medical-photos/preferences.json`), so the tablet and a new phone keep them. |

**Consequence of U7 for the reference rule:** when a treatment has no pre-op or consult session in the app, the **earliest earlier session** becomes the reference. So a patient first photographed at 6 weeks post-op gets matching 3-month and 1-year photos. Order: manual override → latest pre-op → latest consult → earliest session.

## Screen map

```
first launch: Onboarding (folder → lock → test run?) ─┐
                                                      ▼
            ┌──────────────── Scan (home) ◀──────────────────────────┐
            │  camera + "Lees etiket" · Typ · recent patients        │
            ▼                                                        │
         Confirm  (label photo, name, °birth date, match card)       │
            ▼                                                        │
         Treatment (this patient's treatments  + Nieuwe behandeling) │
            │                 ▼                                      │
            │          New treatment (procedure │ region only,       │
            │                         optional surgery date)         │
            ▼                 ▼                                      │
         Visit (proposal + chips; procedure asked when post-op       │
                and still unknown)                                   │
            ▼                                                        │
         Capture (view rail, ring, ghost, manual shutter, strip)     │
            ▼                                                        │
         Summary (grid per view, missing tiles, note) ──── Klaar ────┘

Lock screen: on launch and after 60 s in the background, over everything.
Settings (gear on Scan): folder, lock, sync, measurement spikes.
```

Android back: Confirm/Treatment → Scan; New treatment → Treatment; Visit → Treatment; Capture → Summary (photos are already filed; nothing is lost); Summary → Capture; Settings → Scan.

## Screens

### Onboarding (first launch only)

1. **Waar bewaren we je foto's?** One sentence: never in your gallery, always in a folder you choose. Button "Kies of maak een map" opens the system folder picker, which can also create a folder in Nextcloud, Drive or phone storage. The app checks it can list the folder.
2. **Beveilig de app.** Fingerprint or device PIN via the system prompt. If the phone has no screen lock at all, the app says so plainly; you can continue, but a banner stays in Settings.
3. **Klaar.** "Proefrit met testpatiënt" runs the whole flow on *Demo Proef °01/01/2000* (photograph any object), and the summary offers "Proefbestanden verwijderen". Or "Start".

### Lock screen

The system biometric prompt, nothing else on screen. Locks on launch and after 60 s in the background. The app switcher shows a blank screen and screenshots are blocked everywhere (already in place).

### Scan (home)

- Live camera with a frame hint: *richt op etiket, briefje of scherm*. Barcodes are read continuously in the background.
- Big **Lees etiket** button: one still photo, on-device OCR, then Confirm.
- **Typ**: Confirm with empty fields (handwriting failed, no label).
- **Recent**: the last patients, newest first, with their latest treatment and visit. Tapping one skips the scan (the identity was confirmed before) and goes to Treatment.
- Top bar: sync dot (green = all in the folder · orange + count = waiting · red = error, tap for detail) and the settings gear.

### Confirm

- The label photo (cropped view), then **SURNAME / First name / ° dd/mm/yyyy** in large type, the birth date highlighted. Patient number small, if found.
- All three fields are editable in place.
- Match card under the fields:
  - **exact** → green "Bekende patiënt · 2 behandelingen". Confirm opens that folder.
  - **probable typo** (same birth date, name 1–2 letters off) → orange "Bedoel je JANSSENS Marie, °12/03/1985?" with **Ja, die** / **Nee, nieuwe patiënt**.
  - **same name, other birth date** → grey "Er bestaat een andere patiënt met deze naam (°…). Dit wordt een nieuwe patiënt."
  - **conflict** (barcode or national number disagrees) → red, confirm disabled until a field is edited.
- **Klopt ✓** (big) · Opnieuw scannen. The label photo is deleted from the cache when leaving this screen, whatever the outcome.

### Treatment

- Patient header (name, birth date).
- One card per treatment, newest first: procedure (or "Borst — nog geen ingreep"), surgery date if known, last visit and date.
- **+ Nieuwe behandeling**. A new patient skips this screen and lands in New treatment.

### New treatment

- Search field over the procedure list: **★ Favorieten** (tap the star on any row to add or remove), then **Vaak gebruikt**, then all procedures. Search filters all three and keeps the stars on top.
- **Nog geen ingreep** (consult, pre-op): pick the region only. This is enough to choose the views.
- **Al geopereerd?** optional surgery date (dd/mm/yyyy). Covers patients who enter the app post-op (U7).

### Visit

- One big **proposal** button, computed from the treatment:
  - surgery date known and in the past → **Post-op** with the nearest interval (1w, 6w, 3m, 6m, 1j), labelled with the exact time ("6 weken + 2 dagen");
  - surgery date is today → **Intra-op**;
  - no surgery date, earlier sessions exist → **Pre-op**;
  - nothing yet → **Consult**.
- Chips for the other visit types and intervals.
- If post-op or intra-op is chosen and the procedure is still unknown, the procedure picker appears inline; choosing it backfills the earlier photos (PRD §6). If post-op is chosen without a surgery date, an optional date field appears.
- **Start** creates the session and opens Capture.

### Capture

- Banner: **JANSSENS M. · Borstvergroting · post-op 6w** (initial only, the patient may see the screen).
- **View rail**: chips for every view of the set, ticked when shot; the current view is highlighted. Tap a chip to jump. "+ Vrij" adds a free shot outside the set. Intra-op uses free mode only.
- Camera with:
  - for face views: the **ring** (green / orange / red) and at most two hints, live from the face detector, against the target from the reference rule (textbook on a first visit, the reference photo's geometry on follow-ups);
  - when the detector recognises another view than the current one: a chip "Herkend: ¾ rechts — wissel?";
  - for body and hand views (no live detector yet): no ring, ghost overlay only;
  - **ghost toggle** (reference photo at 30 %), remembered.
- **Shutter** (big, bottom centre). After each photo the rail ticks and jumps to the next missing view.
- **Thumbnail strip** with this session's photos. Tap: Opnieuw (delete and reshoot that view) · Verwijder · Markeer als referentie ★.
- **Klaar** goes to Summary. Every photo is already filed the moment it is taken; nothing is waiting for "Klaar".

### Summary

- A grid with one tile per view of the set: thumbnail or an empty tile "ontbreekt" (not blocking). Extra and free shots after it.
- Note field (one note per session).
- **Verder fotograferen** · **Klaar** (back to Scan). Demo sessions add "Proefbestanden verwijderen".

### Settings

Storage folder (change), lock on/off, sync status with "Nu synchroniseren" and the number waiting, measurement spikes (the three from `spike-checklist.md`), version.

## States and edge cases

| Situation | Behaviour |
|---|---|
| No network or cloud app offline | Shooting never waits. Photos queue in app-private storage; the dot turns orange; sync retries on every new photo, on return to the app and every 30 s. |
| Folder access lost (permission revoked, folder deleted) | Red dot; Settings asks to pick the folder again. The queue is kept. |
| App killed mid-session | Photos already taken are filed. Reopening starts at Scan; the patient is at the top of Recent. |
| Label unreadable | Confirm opens with what was read; Typ is always available. |
| Two people, same name and birth date, different patient numbers | Kept apart (`…-2` folder), as in the archive rules. |
| Detector loses the face at full profile | Ring turns red "Geen gezicht in beeld"; the shutter still works. |
| Previews | Thumbnails live in the app cache only for the open session and are wiped at Klaar and at app start. |

## Not in this build

Patient timeline and before/after compare (step 4), drawing on photos, dictation, export with consent prompt and personal mark, tablet viewer mode, live body-pose guidance (needs a pose plugin for VisionCamera 5), iOS build.
