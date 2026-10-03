# Architecture

How the code realises the PRD (`J.A.R.V.I.S/projects/medical-photos-app/prd.md`). Read with `handoff-2026-10-03.md`.

## Shape

```
VisionCamera 5 ─┬─ photo output (JPEG bytes) ───────────────┐
                ├─ face-detector output (ML Kit, every frame) ─▶ src/core ─▶ Outbox ─▶ user-chosen folder (SAF)
                └─ object output (barcodes)                  │                              ▲
   still photo ─▶ ML Kit text recognition (OCR) ─────────────┘   registry ◀── rebuildIndex() ┘ ◀── tablet viewer
```

**Stack (decided 03/10, `J.A.R.V.I.S/decisions/log.md`):** one Expo/React Native codebase for Android now and iOS later. Camera on `react-native-vision-camera` 5 (Nitro, New Architecture). ML Kit on both platforms, so a pre-op shot on Android and a post-op on an iPhone measure angles the same way.

No backend. The phone reads labels, measures angles, names and tags files, and writes them to the folder the user picked. A tablet running the same app reads that folder.

## Decisions in code

| Decision | Where | Note |
|---|---|---|
| Folder is the database | `core/index/rebuild.ts`, `core/archive.ts` | Folder names on disk win over names stored in JSON, so an interrupted rename never orphans data. |
| Reference rule | `core/guidance/targets.ts` | Override → latest pre-op → latest consult → **earliest earlier session** (patients who enter the app already operated, UX U7); keeper shot → last shot. Reference shot without geometry still feeds the ghost overlay. |
| Canonical geometry | `core/types.ts` `CaptureGeometry` | yaw + = patient turned to own right (left side to camera). Device signs are isolated in `core/guidance/detectors.ts` `BACK_CAMERA_SIGNS`, **unverified until spike (b)**. |
| Two tolerance sets | `targets.ts` | Reference: tight (face ±5° yaw, ±10 % distance). Textbook: angle tight, framing loose. Starting values, tuned on device. |
| Procedure per episode, backfilled | `archive.ts` `planProcedureBackfill` | Retag photos → write `episode.json` → rename folder **last**; safe to re-run. **Deviation from PRD §6:** the procedure is not mirrored into each `session.json`; it lives in `episode.json` and in every photo's XMP. One source, fewer writes. |
| Offline-first | `core/storage/Outbox.ts` | Ordered op log in app-private storage; replay stops at the first failure; each write is read back and compared before the local blob is deleted. Reads and listings show a **merged view** (folder + pending writes, renames, removes), so an index rebuilt after a restart while offline still sees every patient. |
| Navigation | `core/flow/flow.ts` | A pure state machine instead of Expo Router: the flow is linear and camera-centric, every path and Android back press is unit-tested, and screens only dispatch results. Behaviour spec: `docs/ux-flow.md`. |
| App state | `app/ArchiveProvider.tsx` | One archive over `Outbox(app-private, chosen folder)`; screens call `changed()` after a mutation, which re-renders and schedules a sync (also on foreground and every 30 s while work waits). |
| Previews | `platform/previewCache.ts` | Thumbnails and the ghost image live in the app cache per open session; wiped at Klaar and at every app start. |
| Tags inside the JPEG | `core/metadata/xmp.ts` | `dc:subject` (`view:`, `visit:`, `region:`, `procedure:`) + `mpa:` namespace with opaque ids and capture geometry. No names, no DOB. Exports must strip all metadata (Phase 2/3). |
| Camera layer | `platform/camera.ts` | Photos: JPEG bytes straight from the photo output, `containerFormat: 'jpeg'` forced (iPhones default to HEIC), no temp file. Faces: `useFaceDetectorOutput` with `autoMode` off, so the face box and `frameWidth/frameHeight` share the same upright space. The screen redraws at ~10 Hz from a ref written on every analysed frame. |
| Name normalisation | `identity/parseLabel.ts` `displayCase`, `archive.ts` | "JANSSENS" and "Janssens" are the same patient folder. Belgian particles: "Van den Broeck". |
| National-number cross-check | `identity/nationalNumber.ts` | If the label carries a valid rijksregisternummer whose birth date disagrees with the read date, the confirm screen blocks. |

## Known unknowns (answered by the spikes)

1. **OCR package on the New Architecture.** `@react-native-ml-kit/text-recognition` is the one remaining legacy-bridge module (expo-doctor: "untested on New Architecture"). RN's interop layer should run it. If spike (a) shows it does not load or returns nothing: write a thin native text-recognition plugin (Kotlin + Swift) next to the face-detector output, or run OCR as a VisionCamera output. The face path no longer depends on it.
2. **Live analysis rate and frame orientation.** Spike (b) shows "analyses per second" and the frame size. Expect well above 10/s; the frame must be portrait (height > width). If not, the box needs rotating before distance/centring are computed (`core/guidance/detectors.ts`).
3. **Yaw at full profile.** ML Kit face detection weakens towards ±90°. If lateral views lose the face, use pose landmarks (ear/nose visibility) for head yaw.
4. **SAF behaviour per provider.** Exact file names (no appended extension), directory rename, persisted permission after restart, speed on Nextcloud/Drive. Spike (c) reports each.
5. **iOS (when it starts):** Apple Developer account; check the ML Kit pods' minimum iOS version against Expo's deployment target; rerun spike (b) on an iPhone for the sign constants; confirm photos arrive as JPEG.
6. **Phone tilt mapping.** `platform/motion.ts` assumes beta ≈ 90° upright in portrait. Spike (b) shows raw values.

## Built (03/10, unverified on device)

Onboarding (folder, lock, test run) · app lock · scan home with recent patients · confirm with match card · treatment and new treatment (procedure or region, optional surgery date) · visit with proposal, interval and inline procedure · capture with view rail, live ring for face views, ghost toggle, manual shutter advancing to the next missing view, thumbnail strip (retake, delete, reference) · summary with missing tiles and note · settings (folder, lock, sync, spikes).

## Not built yet

Patient timeline and before/after compare · drawing · dictation · export with the consent prompt and personal mark · tablet viewer mode · live body-pose guidance (needs a pose plugin for VisionCamera 5) · iOS build.
