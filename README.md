# Medical Photos App

> **Work in progress.** This app is under active development and is not finished. It runs on my own phone and on a few colleagues' as a development build; it is not in the Play Store, has not been validated for clinical use, and APIs, screens and file layout still change. Use at your own risk.

Android camera app for plastic-surgery clinical photography (working name).

1. Photograph the patient's label, sheet or agenda screen → name and date of birth are read on the device.
2. Pick the visit (and the region on a first visit; the procedure is set once, at surgery).
3. Shoot with live angle guidance. **Follow-ups are guided to the exact angle, distance and framing of the pre-op photo**, so before/after pairs match.
4. Photos are named, tagged and filed in a folder you chose (Nextcloud, Drive, phone storage…). Never in the camera roll.

**Status (22/10/2026):** full flow, anatomy build and the first Android UX batch; development build only, on a handful of phones. Earlier (03/10): first full flow plus the anatomy build. Onboarding, lock, scan, confirm, body-map treatment picker (sides, several areas, skin spots, favourites), visit, guided capture and summary are built on the tested core (141 unit tests). View sets are editable under Settings › Standaardzichten. The three measurement screens live under Settings › Metingen. Next step: build it for the phone and run `docs/spike-checklist.md`, then the test run in the app itself.

```bash
npm install
npm run check          # typecheck + 80 unit tests
npx expo lint
npm run build:dev      # Android development build via EAS
```

Stack: Expo / React Native (one codebase, Android now, iOS later), camera on VisionCamera 5, ML Kit on device.

Docs: `docs/ux-flow.md` (how the app behaves) · `AGENTS.md` (rules) · `docs/handoff-2026-10-03.md` (build brief) · `docs/architecture.md` · `docs/spike-checklist.md`. Product requirements live in the J.A.R.V.I.S cockpit (`projects/medical-photos-app/prd.md`).

Private. No patient data in this repository, ever.
