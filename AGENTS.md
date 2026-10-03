# Medical Photos App — agent instructions

Android camera app for plastic-surgery clinical photography (working name). Scan the patient label → guided capture with angle guidance → photos named, tagged and filed in a folder the user picked; never in the camera roll. Owner: Jeroen Poelaert. Built with Claude Code.

**Product source of truth:** the PRD lives in the J.A.R.V.I.S cockpit repo, `projects/medical-photos-app/prd.md`. This repo holds `docs/handoff-2026-10-03.md` (the distilled build brief), `docs/architecture.md` (how the code realises it) and `docs/spike-checklist.md` (what to measure on the phone next). Strategic decisions are logged in the cockpit (`decisions/log-decision.mjs`), not here.

## Non-negotiables

1. **No patient data in git, ever.** No photos, names, labels, screenshots or OCR dumps in commits, tests or docs. Test fixtures use invented names. `.gitignore` blocks image and video files; do not weaken it.
2. **No patient bytes leave the phone except to the user's own folder.** No cloud OCR, no cloud vision, no analytics on images, no backend that sees images.
3. **Never write to the camera roll / MediaStore, never request gallery or location permissions** (`app.json` blocks them).
4. **The JPEG's embedded XMP carries opaque ids only** — never name or date of birth.
5. **The reference rule** (Jeroen, 03/10): first visit → textbook angle; every follow-up → the exact geometry recorded with the pre-op photo of that view. Lives in `src/core/guidance/targets.ts`; its tests must stay green.
6. **The folder is the database.** `patient.json` / `episode.json` / `session.json` hold all state; SQLite or any local index is a rebuildable cache.

## Layout

- `src/core/` — pure TypeScript, no React Native imports. All logic, unit-tested with Vitest (`npm test`).
- `src/platform/` — device adapters: VisionCamera 5 camera layer (`camera.ts`), on-device OCR, SAF storage, motion. Verified on the device only.

**Stack (decided 03/10, logged in the cockpit):** one Expo/React Native codebase for Android now and iOS later. Camera = `react-native-vision-camera` 5 (Nitro). Its API is hook-and-output based (`usePhotoOutput`, `useObjectOutput`, `useFaceDetectorOutput`), unlike v3/v4 tutorials; read the installed typings before using it. A community plugin that fails is replaced by our own thin native plugin (Kotlin + Swift), not by switching stacks.
- `src/spike/` + `App.tsx` — throwaway spike screens. The MVP replaces them and adopts Expo Router.

## Commands

```bash
npm run check        # typecheck + unit tests — run before every commit
npx expo lint        # lint
npm run build:dev    # EAS development build (APK) for the phone
npx expo start --dev-client
```

## Shared work contract (Claude and Codex)

- Do reversible internal work when the intent is clear. State material assumptions. Ask when ambiguity changes the outcome, a commitment, a privacy boundary or the cost.
- Plan substantial work first; respect an explicitly requested plan review before executing.
- Verify changes with fitting checks; report what was and was not tested (unit tests vs. on-device).
- Keep project-specific domain rules, privacy boundaries and external permissions.
- AGENTS.md is the shared source; CLAUDE.md imports it. Keep durable project context in repo docs, not only in agent chat memory.
- With concurrent work: check git status, claim a scoped task in `docs/agent-work/<task>.md` when work spans sessions, use separate worktrees for overlapping code changes. Never overwrite someone else's changes.
- End a handover with current state, verification, open points and the next action.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release (this repo: SDK 57). Before writing code that touches an Expo or React Native API, read the installed typings in `node_modules/<pkg>/build/*.d.ts` or the versioned docs at `https://docs.expo.dev/versions/v57.0.0/`. Use `npx expo install <package>` to add dependencies. Never create or edit `android/` or `ios/` by hand — configure native behaviour in `app.json` and config plugins. Native modules need a development build, not Expo Go.
