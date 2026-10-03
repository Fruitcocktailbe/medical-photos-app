# Architecture

How the code realises the PRD (`J.A.R.V.I.S/projects/medical-photos-app/prd.md`). Read with `handoff-2026-10-03.md`.

## Shape

```
CameraView ─▶ ML Kit (on device) ─▶ src/core ─▶ Outbox ─▶ user-chosen folder (SAF)
                                        │                       ▲
                                        └── registry (memory) ◀─┘ rebuildIndex()  ◀── tablet viewer
```

No backend. The phone reads labels, measures angles, names and tags files, and writes them to the folder the user picked. A tablet running the same app reads that folder.

## Decisions in code

| Decision | Where | Note |
|---|---|---|
| Folder is the database | `core/index/rebuild.ts`, `core/archive.ts` | Folder names on disk win over names stored in JSON, so an interrupted rename never orphans data. |
| Reference rule | `core/guidance/targets.ts` | Override → latest pre-op → latest consult; keeper shot → last shot. Reference shot without geometry still feeds the ghost overlay. |
| Canonical geometry | `core/types.ts` `CaptureGeometry` | yaw + = patient turned to own right (left side to camera). Device signs are isolated in `core/guidance/detectors.ts` `BACK_CAMERA_SIGNS`, **unverified until spike (b)**. |
| Two tolerance sets | `targets.ts` | Reference: tight (face ±5° yaw, ±10 % distance). Textbook: angle tight, framing loose. Starting values, tuned on device. |
| Procedure per episode, backfilled | `archive.ts` `planProcedureBackfill` | Retag photos → write `episode.json` → rename folder **last**; safe to re-run. **Deviation from PRD §6:** the procedure is not mirrored into each `session.json`; it lives in `episode.json` and in every photo's XMP. One source, fewer writes. |
| Offline-first | `core/storage/Outbox.ts` | Ordered op log in app-private storage; replay stops at the first failure; each write is read back and compared before the local blob is deleted. |
| Tags inside the JPEG | `core/metadata/xmp.ts` | `dc:subject` (`view:`, `visit:`, `region:`, `procedure:`) + `mpa:` namespace with opaque ids and capture geometry. No names, no DOB. Exports must strip all metadata (Phase 2/3). |
| Name normalisation | `identity/parseLabel.ts` `displayCase`, `archive.ts` | "JANSSENS" and "Janssens" are the same patient folder. Belgian particles: "Van den Broeck". |
| National-number cross-check | `identity/nationalNumber.ts` | If the label carries a valid rijksregisternummer whose birth date disagrees with the read date, the confirm screen blocks. |

## Known unknowns (answered by the spikes)

1. **ML Kit packages on the New Architecture.** `@react-native-ml-kit/*` are legacy-bridge modules flagged "untested on New Architecture" by expo-doctor. RN's interop layer should run them. If the dev build fails or they return nothing: fall back to `react-native-vision-camera` v5 + a Nitro face-detector/OCR plugin, or a small local Expo module wrapping ML Kit in Kotlin (~100 lines). Decide after spike (a).
2. **Live update rate.** Spike (b) uses repeated still captures (simple, all JS). If the period is far above ~150 ms the MVP moves to a vision-camera frame processor.
3. **Yaw at full profile.** ML Kit face detection weakens towards ±90°. If lateral views lose the face, use pose landmarks (ear/nose visibility) for head yaw.
4. **SAF behaviour per provider.** Exact file names (no appended extension), directory rename, persisted permission after restart, speed on Nextcloud/Drive. Spike (c) reports each.
5. **Phone tilt mapping.** `platform/motion.ts` assumes beta ≈ 90° upright in portrait. Spike (b) shows raw values.

## Not built yet (MVP slices)

Identify → confirm flow with patient matching UI · region/visit pickers · guided capture screen with view set, auto tag and ghost toggle · browse, compare, drawing · consent taps · app lock · Expo Router. All core functions they need exist and are tested.
