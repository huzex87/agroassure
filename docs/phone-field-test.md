# Phone app: field test

One real phone, one real visit. About an hour. Do this before inspectors are asked to use the app.

The app has been tested in code and in a simulator. It has not been tested on a handset, in sunlight, or on a weak connection. This page is how to find out.

## Before you start

1. **Get the app onto a phone.** From `apps/field`, run `eas build -p android --profile preview`. It builds an installable `.apk` that already points at the live server. Send the link to the phone and open it. (You need a free Expo account.)
2. **Use a modest phone.** An older Android with 2 GB of memory is the right test. If it works there, it works on a better one.
3. **Invite a test inspector.** In the console: *Settings → Team → Invite an inspector*. Use your own phone number or email.
4. **Plan one visit** for that inspector: *Visits → choose the inspector → tick a facility → Plan visit*.

## The checks

Tick each one. Write down anything that felt slow, small, confusing or wrong, even if it worked.

| # | Do this | It should |
|---|---|---|
| 1 | Open the app for the first time | Open in a few seconds, in the language you chose |
| 2 | Tap the link in the invite message, or type the code | Sign you in with no other step |
| 3 | Look at the **Today** screen | Show the planned visit, with the facility name and why |
| 4 | **Go outside in direct sun**, brightness up | Every label, button and status be readable |
| 5 | Hold the phone in one hand and answer a whole checklist | Every button reachable with a thumb; no mis-taps |
| 6 | **Turn on airplane mode**, then complete the inspection | Work normally and say the work is waiting to send |
| 7 | Answer **No**, add a note, add a photo | Keep the note and photo; say photos can't change after submit |
| 8 | Finish, have someone sign with a finger, tap Submit | Accept the signature and submit |
| 9 | **Turn airplane mode off** | Send by itself within a minute, with no button to press |
| 10 | Open *Inspections* in the console | Show the inspection with its answers. **Note whether the photo and signature appear too** |
| 11 | Set an app PIN, lock the phone, reopen | Ask for the PIN; **Forgot PIN?** lead to a clear next step |
| 12 | Switch to **Hausa** | Show Hausa on every screen. Ask a native speaker to read them |
| 13 | Mid-inspection, take a phone call or lock the screen | Return to exactly where you were, with nothing lost |
| 14 | Scroll the longest checklist quickly | Stay smooth, with no freezing or jumping |
| 15 | In the console: *Settings → Team → Phones → Sign out this phone* | Stop working at once. What it already sent stays in the console. **Write down what happens to work that had not been sent** |

## What to send back

For each check that did not pass: the number, the phone model and Android version, what happened, and a screenshot or a short screen recording. Group them into three piles: **can't do the job**, **slow or confusing**, and **would be nicer**. Fix the first pile before any inspector uses the app.
