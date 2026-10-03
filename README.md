# Medical Photos App

Android camera app for plastic-surgery clinical photography (working name).

1. Photograph the patient's label, sheet or agenda screen → name and date of birth are read on the device.
2. Pick the visit (and the region on a first visit; the procedure is set once, at surgery).
3. Shoot with live angle guidance. **Follow-ups are guided to the exact angle, distance and framing of the pre-op photo**, so before/after pairs match.
4. Photos are named, tagged and filed in a folder you chose (Nextcloud, Drive, phone storage…). Never in the camera roll.

**Status (03/10/2026):** spike build. The tested core is done (label parsing, naming, episodes and procedure backfill, the reference rule, guidance, tags in the JPEG, offline sync, index rebuild). Three spike screens measure what only the phone can tell us. Next step: `docs/spike-checklist.md`.

```bash
npm install
npm run check          # typecheck + 80 unit tests
npx expo lint
npm run build:dev      # Android development build via EAS
```

Docs: `AGENTS.md` (rules) · `docs/handoff-2026-10-03.md` (build brief) · `docs/architecture.md` · `docs/spike-checklist.md`. Product requirements live in the J.A.R.V.I.S cockpit (`projects/medical-photos-app/prd.md`).

Private. No patient data in this repository, ever.
