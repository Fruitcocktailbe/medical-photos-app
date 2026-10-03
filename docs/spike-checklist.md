# Spike checklist — on the phone

Goal: replace every "unverified" in `architecture.md` with a number. About one evening. Use a test person or yourself, never a patient, except for spike (a) where real labels are the point. Nothing from spike (a) is stored; only the tally stays on screen.

## 0 · Get the app on the phone (once)

On your PC, in `D:\GithubLocal\medical-photos-app`:

```powershell
npm install
npx eas-cli@latest login            # free Expo account
npm run build:dev                   # cloud build, ~15 min, gives an APK link/QR
```

Install the APK on the Android phone (allow "install unknown apps" for the browser once). Then on the PC:

```powershell
npx expo start --dev-client
```

Open the app on the phone; it connects to the PC on the same Wi-Fi. Onboarding asks for a folder and the lock. The measurement screens below are under **Instellingen › Metingen**.

**Check 0 — native modules load.** Open spike (a): the camera preview must appear (VisionCamera works). Press "Lees": if you get "doesn't seem to be linked" or no text at all, the OCR package's New-Architecture risk is real: stop and report. Open spike (b): numbers must move when a face is in view (face-detector output works).

## (a) Etiket lezen — target ≥ 95 % on labels

1. Pick the source type (etiket / briefje / scherm).
2. Point at the label, press **Lees naam en geboortedatum**.
3. Judge **Juist** only if surname, first name AND date of birth are all right.
4. Do 20 labels, 10 handwritten sheets, 10 agenda screens.

Report: the three percentages, typical ms, and for every "Fout" what went wrong in words (no names): order swapped, date missed, wrong line taken, accent lost…

## (b) Hoek live — stability, sign, the reference rule

1. **Sign check.** Start meting. Test person faces the camera: yaw ≈ 0, "Frontaal". Person turns to their own right (left cheek to the camera): yaw must go **positive** and show "¾ links". If negative, toggle **Yaw omkeren** and confirm it now reads positive.
2. **Pitch/roll.** Chin up → pitch positive? Head tilted to the left shoulder → roll positive? Note yes/no.
3. **Accuracy.** Put a protractor or a paper with 0/45/90° lines on the floor; person turns to each mark. Note the displayed yaw at 0, 45, 90 both sides. Does the face get lost near 90°?
4. **Stability.** Person holds still for 10 s: how much does yaw wander?
5. **Live rate and frame.** Note "Analyses per seconde" (expect well above 10) and "Frame (b×h)": the height must be larger than the width.
6. **The reference rule.** Choose ¾ links, get to green, press **Leg vast als referentie**. Target switches to "REFERENTIE". Person walks away, comes back, and you guide them back to green with the hints alone. Does the second pose look like the first? How long did it take?
7. **Phone tilt.** Hold the phone upright: pitch/roll ≈ 0? Tilt it: do the numbers move the expected way?

Report: sign result, accuracy table, wander in °, analyses per second, frame size, and how the rule felt in the hand.

## (c) Map kiezen — storage end to end

1. Create a **new empty folder** in the provider you want to test (Nextcloud app, Google Drive, phone storage).
2. **Kies map** → select that folder.
3. **Testfoto** of an object, then **Start test**. Every line should turn ✓, ending with "ALLES GESLAAGD".
4. Close the app completely, reopen spike (c): the first line must say "Toegang na herstart: JA".
5. Look in the folder from the provider's own app or the PC: `Test_Spike_2000-01-01/<YYYY-MM>_facelift/<today>_preop/` with one JPEG and `session.json`.
6. **Opruimen**.

Repeat per provider (at least: phone storage and the one you'd use for real). Report the log lines per provider, especially any ✗.

## Bring back to Claude

Paste the numbers and ✗ lines into the next session. Each answer maps to a decision: keep or replace ML Kit, still captures vs frame processor, tolerance values, sign constants, which storage provider for the pilot.

## (d) Body map and view sets — in the app itself

1. New treatment for the test patient: tap the **left** forearm on the front view (it is on the right of the screen). The chip should preselect *Links*. Add *Litteken* at the same spot and check the label reads "linker onderarm, voorzijde".
2. Turn to the back view and tap the left forearm again: the side should stay *Links*.
3. Choose *Brachioplastie* from the list: *Bovenarm beide* is added; Start shows both areas.
4. In capture, check the rail: area headers, per-side chips ("Volair links").
5. Settings › Standaardzichten › Oogleden: hide *Opwaartse blik*, add "Ptosis close-up", start a new eyelid session and check the rail.
6. Eyelid close-ups: does the live ring find the face, or does it show "Geen gezicht in beeld" all the time? If the latter, those views become ghost-only.
