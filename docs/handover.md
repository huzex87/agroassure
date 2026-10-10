# Handover checklist

For the owner, on the day the system goes to the people who will run it. Work top to bottom. Allow about two hours.

## 1. Before you meet them (about 45 minutes)

Tick each as you go.

1. **System status is all green.** Console, then *Settings → System status*. Nothing red. The "App download link" line must be green, which proves inspectors can install the app.
2. **Email really arrives.** On the same page, click **Send me a test email** and open it. If your sender is not a verified domain yet, only you will receive it, so fix that first (owner guide, section 3).
3. **One full visit works.** Install the app on a real Android phone, invite yourself as an inspector, do one visit with a photo and both signatures, then in the console review it, record a decision and authorise a certificate. The one-hour script is `phone-field-test.md`; the short version is enough today.
4. **The certificate verifies.** Scan the code on the certificate with a phone. The public page should say it is valid.
5. **Clean up the sign-in page.** Delete the five `OIDC_*` variables on Vercel (console project, *Settings, Environment Variables*) and on Render (gateway, *Environment*), then redeploy the console. The sign-in page then shows only the email form.
6. **Render is on a paid, always-on plan.** A sleeping server makes the first sign-in of the day look broken.
7. **Remove test data.** Delete any facilities, inspectors or invites you made for yourself that the client should not see.

## 2. Who owns what

Decide each row before the meeting and write the answer down. The system keeps running only as long as someone holds these.

| Thing | What it is | Handover action |
|---|---|---|
| GitHub repository | The code | Transfer to the client's organisation, or add their lead as an owner |
| Vercel project `console` | The website | Move to their team, or invite their admin as an owner |
| Render service `agroassure-gateway` | The server | Same: owner access for their admin |
| Database | The record of every inspection | Their admin as owner. **Rehearse one restore before you leave** |
| Evidence bucket | Photos and signatures, write-once | Their admin as owner. Object lock stays on |
| Resend and the sending domain | Sign-in and welcome emails | Their domain, their login |
| Expo account | Builds the Android app | Their login, so they can rebuild when the link expires |
| Secrets (`CONSOLE_SESSION_SECRET`, `DEVICE_TOKEN_SECRET`, `EMAIL_API_KEY`, storage keys) | Held in Render | Give them to a password manager the client controls. Never email them |

## 3. Give the client their own administrator (15 minutes, in the meeting)

1. In the console go to *Settings → Team → Add a colleague*.
2. Enter their lead's name and **work email**. Choose **Administrator**.
3. They open the console, enter that email, click **Email me a sign-in link** and open the link. They are in.
4. They then add their own people the same way, and invite inspectors with **Invite an inspector**.
5. Your own account (`FIRST_ADMIN_EMAIL` on Render) stays as the support login until you agree otherwise. If they want it removed, change that setting to their admin's email and redeploy.

## 4. A 15-minute demonstration

1. Home: the sentence at the top and what each tile means.
2. Facilities: search, filter, **Export**.
3. Visits: plan one for an inspector.
4. On the phone: do the visit, sign, submit.
5. Inspections: review it, record a decision, verify a finding closed, authorise the certificate.
6. Scan the certificate's code.
7. Settings: Team, Activity, System status. Show where a lost phone is signed out.

## 5. What to give them

- The **handbook** (everyone who uses it) and the **owner's guide** (whoever runs it). Both are in `docs/`, and the handbook also exists as a shareable page.
- The **phone field test** for their first week.
- The **brand guide**, if they will make documents or posters.
- This checklist, with section 2 filled in.

## 6. When something goes wrong

| Problem | First move |
|---|---|
| Nobody can sign in | *Settings → System status*. Then Render, *Logs* |
| The site shows an error after an update | Vercel, the project's **Deployments**, find the last good one, **Instant Rollback**. Render has the same under the service's **Events** |
| A phone is lost | *Settings → Team → Phones → Sign out this phone* |
| Emails stopped | System status, **Send me a test email**. The provider's own message appears on the page |
| The app link stopped working | GitHub, Actions tab, **Build Android app**, **Run workflow**, then paste the new link into `FIELD_APP_DOWNLOAD_URL` on Render |
| Everyone must be signed out | Change `CONSOLE_SESSION_SECRET` (console) or `DEVICE_TOKEN_SECRET` (phones) on Render |

Write the name and phone number of the person they call first: ______________________

## 7. Things to tell them honestly

- It records and renders certificates on behalf of the regulator. It does not issue them.
- Inspection records and evidence cannot be edited or deleted. A change of mind is a new decision.
- The phone app has been tested in a test harness and one rehearsal, not yet across a season of field use. Ask the first inspectors for feedback in week one.
- The Hausa wording should be reviewed by a native speaker.
