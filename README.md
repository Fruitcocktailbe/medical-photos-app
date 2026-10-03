# Medical Photos App

Android camera app for plastic-surgery clinical photography (working name).

1. Photograph the patient's label, sheet or agenda screen → name and date of birth are read on the device.
2. Pick the visit (and the region on a first visit; the procedure is set once, at surgery).
3. Shoot with live angle guidance. **Follow-ups are guided to the exact angle, distance and framing of the pre-op photo**, so before/after pairs match.
4. Photos are named, tagged and filed in a folder you chose (Nextcloud, Drive, phone storage…). Never in the camera roll.

**Status (03/10/2026):** first full flow plus the anatomy build, not yet run on a device. Onboarding, lock, scan, confirm, body-map treatment picker (sides, several areas, skin spots, favourites), visit, guided capture and summary are built on the tested core (141 unit tests). View sets are editable under Settings › Standaardzichten. The three measurement screens live under Settings › Metingen. Next step: build it for the phone and run `docs/spike-checklist.md`, then the test run in the app itself.

```bash
npm install
npm run check          # typecheck + 80 unit tests
npx expo lint
npm run build:dev      # Android development build via EAS
```

Stack: Expo / React Native (one codebase, Android now, iOS later), camera on VisionCamera 5, ML Kit on device.

Docs: `docs/ux-flow.md` (how the app behaves) · `AGENTS.md` (rules) · `docs/handoff-2026-10-03.md` (build brief) · `docs/architecture.md` · `docs/spike-checklist.md`. Product requirements live in the J.A.R.V.I.S cockpit (`projects/medical-photos-app/prd.md`).

Private. No patient data in this repository, ever.
