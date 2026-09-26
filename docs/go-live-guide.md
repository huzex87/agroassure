# AgroAssure go-live guide

Three jobs, in this order:

1. [Turn on phone invites on Render](#1-turn-on-phone-invites-on-render) (about 20 minutes, plus 1–3 days for Termii to approve your SMS sender name)
2. [Stop the failing Vercel gateway build](#2-stop-the-failing-vercel-gateway-build) (about 2 minutes)
3. [Test on a real Android phone](#3-test-on-a-real-android-phone) (about 45 minutes)

> **Before you start:** merge pull request #1 into `main`. Render deploys
> automatically from `main`, and the new database table for invitations is
> created by itself when the gateway restarts. Nothing needs to be run by hand.

---

## 1. Turn on phone invites on Render

### 1a. Make the device secret

This secret signs the session each phone gets when it uses an invite code. It
must be at least 32 characters and should be random.

On any computer with a terminal, run **one** of these and copy the output:

```bash
openssl rand -base64 48
```

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

Keep it somewhere safe, such as a password manager.

> ⚠️ **Never change it once phones are in use.** Changing it signs every phone
> out, and each inspector would need a new invite code.

### 1b. Set up SMS with Termii

Termii reaches all Nigerian networks and is the default in AgroAssure.

1. Go to **termii.com** and create an account.
2. **Request a sender ID.** In the Termii dashboard, open **Sender ID** →
   **Request new Sender ID**.
   - Name: `AgroAssure`. It must be 3–11 characters with no spaces.
   - Use case: *"One-time invite codes for inspection staff of [your agency]."*
   - Approval usually takes **1–3 working days**. Texts will not deliver until
     it is approved.
3. **Ask Termii to enable the DND route.** Many Nigerian numbers are on the
   Do-Not-Disturb list, and only the DND route reaches them. Email Termii
   support: *"Please activate the DND route for sender ID AgroAssure; we send
   one-time codes."* AgroAssure uses the DND route by default.
4. **Fund your wallet.** Each SMS costs a few naira, so ₦5,000 is plenty for
   testing.
5. **Copy your API key.** It is on the dashboard, under **API key** or
   **Developer settings**.

### 1c. Set up email with Resend

1. Go to **resend.com** and create an account.
2. **Add your domain.** Open **Domains** → **Add Domain** and enter the
   domain you will send from (for example `agroassure.ng`, or your agency's
   domain).
3. **Add the DNS records.** Resend lists 3–4 records (TXT and MX). Add them at
   whoever hosts your domain's DNS, then click **Verify** in Resend. Records
   can take anywhere from a few minutes to a few hours to take effect.
4. **Create an API key.** Open **API Keys** → **Create API Key**, choose
   *Sending access*, and copy the key. It starts with `re_`.

> Using SendGrid instead? Set `EMAIL_PROVIDER=sendgrid` and use a SendGrid API
> key. The sender address must be verified in SendGrid.

### 1d. Add the settings in Render

1. Go to **dashboard.render.com** and open the **agroassure-gateway** service.
2. In the left menu, click **Environment**.
3. Click **Add Environment Variable** once for each row below:

| Key | Value | Notes |
|---|---|---|
| `DEVICE_TOKEN_SECRET` | the value from step 1a | required for phones |
| `SMS_PROVIDER` | `termii` | |
| `SMS_API_KEY` | your Termii API key | |
| `SMS_SENDER_ID` | `AgroAssure` | must match the approved sender ID |
| `EMAIL_PROVIDER` | `resend` | |
| `EMAIL_API_KEY` | your Resend key (`re_…`) | |
| `EMAIL_FROM` | `AgroAssure <no-reply@yourdomain>` | must use the verified domain |
| `FIELD_APP_DOWNLOAD_URL` | *(leave for now)* | fill in after step 3b, so every invite includes the install link |

Optional settings:
- `INVITE_TTL_HOURS`: how long a code works. The default is `72` (3 days).
- `SMS_CHANNEL`: set to `generic` only if Termii hasn't enabled DND yet.
  Codes will then not reach numbers on the DND list.

4. Click **Save, rebuild, and deploy**. The deploy takes a few minutes.

### 1e. Check it worked

1. **Check the gateway is up.** Open
   `https://agroassure-gateway.onrender.com/health`. It should show
   `"status":"ok"`.
2. **Check the logs.** In Render, open **Logs**. There should be no line
   beginning `refusing to start` or `SMS_PROVIDER=... needs`.
3. **Check the console.** Open **Team**. Under the **Send invite** button it
   should now say **"We'll send them a code by SMS and email."**
4. **Send yourself a test invite.** Use your own name and phone number. The
   dialog shows **SMS · Sent** and **Email · Sent**, and the text should
   arrive within a minute.
   - If it shows **Not delivered**, the grey line under it gives the provider's
     reason, for example "insufficient balance" or "sender ID not approved".
   - Cancel the test invite from its row afterwards.

---

## 2. Stop the failing Vercel gateway build

The gateway runs on **Render**. It keeps background timers running, which
Vercel's serverless platform can't do. The `sync-gateway` project on Vercel
fails on every change and should be switched off. **Keep the `console`
project**, which is the regulator website.

**Option A: disconnect it (recommended)**
1. Go to **vercel.com** and open the **sync-gateway** project. Make sure it is
   *not* `console`.
2. Open **Settings** → **Git**.
3. Under **Connected Git Repository**, click **Disconnect**.

**Option B: keep it, but never build**
1. In the **sync-gateway** project, open **Settings** → **Git** → **Ignored
   Build Step**.
2. Choose **Custom** and enter `exit 0`, then click **Save**.

(Option C: open **Settings** → **General**, scroll to the bottom, and click
**Delete Project**. Only do this if nobody uses its URL.)

**How to check:** push any small change or re-run the PR checks. The
*Vercel – sync-gateway* check should disappear or show *Skipped*.

---

## 3. Test on a real Android phone

### 3a. Prepare the console

Sign in to the console as an administrator and make sure you have:

- [ ] **A facility.** Use **Facilities → Add facility**, or import your
      spreadsheet. For the test, use a place you can stand in or near.
      Adding GPS coordinates is optional.
- [ ] **A checklist in force for that facility type.** Open **Checklists** and
      publish one if the type shows no version *in force*. Without one, the
      phone cannot start the inspection.
- [ ] **An inspector.** Use **Team → Invite an inspector** with the test phone
      number. Keep the code handy.

### 3b. Build and install the app

On a computer with Node 22 and pnpm:

```bash
git pull
pnpm install
cd apps/field
npx eas-cli login                 # the "huzex" Expo account
npx eas-cli build -p android --profile preview
```

- The build runs on Expo's servers and takes 10–20 minutes. When it finishes,
  it prints a **link and a QR code**.
- On the Android phone, open the link or scan the QR code, then download the
  APK.
- When Android asks, allow **"Install unknown apps"** for your browser, then
  tap **Install**.
- Put that link into Render as `FIELD_APP_DOWNLOAD_URL` (step 1d).

> The preview build is already set to talk to
> `https://agroassure-gateway.onrender.com`. If your gateway lives elsewhere,
> change `EXPO_PUBLIC_API_URL` in `apps/field/eas.json` before building.

### 3c. Walk through it

Tick each step as you go. If something doesn't match what's expected, note what
the screen said.

**First launch**
1. [ ] Open the app. It asks **English / Hausa**. Pick one.
2. [ ] It shows **"Welcome to AgroAssure"** and a code box.

**Invite code**
3. [ ] Type a wrong code (for example `AAAA-BBBB`).
       *Expected:* "That code isn't right…"
4. [ ] Type the real code from the SMS. Lowercase and spaces are fine.
       Tap **Continue**.
       *Expected:* "Welcome, [first name]" with a green tick.
5. [ ] Other way in: on the phone, open the invite **email** and tap
       **Open on this phone**.
       *Expected:* the app opens with the code already filled in. This only
       works if the code hasn't been used yet, so send a new code first if
       needed.
6. [ ] In the console, open **Team**.
       *Expected:* the inspector shows **Phone active · Last seen just now**,
       and the phone appears under **Phones**.

**Planned visit**
7. [ ] In the console, open **Plan visits**. Choose the inspector, tick the
       facility, type a reason, and click **Plan visit**.
8. [ ] On the phone, open **Account** → **Send now**, or close and reopen the
       app.
       *Expected:* the facility appears under **Today's visits**, with your
       reason under **Why this visit**.

**Inspection**
9. [ ] Tap the visit and allow **location** when asked.
10. [ ] Answer every question. Answer at least one **No**, type what you saw,
        and tap **Add photo** (allow the camera).
11. [ ] Tap **Finish and sign**. Tap **Sign**, enter the facility
        representative's name and role, then tap their **Sign**.
12. [ ] Tap **Submit inspection**.
        *Expected:* "Inspection submitted ✓".

**Offline**
13. [ ] Start a second visit if one is available, or repeat steps 7–12. Turn
        on **Airplane mode** before **Submit inspection**.
        *Expected:* the home screen shows **"1 waiting to send · saved on this
        phone"**.
14. [ ] Turn Airplane mode off.
        *Expected:* within about a minute (or when you reopen the app) it
        changes to **"Everything is sent"**.

**Console**
15. [ ] Open **Inspections**.
        *Expected:* the inspection appears with its score, the "No" answer,
        and the photo.
16. [ ] Open the **Dashboard**.
        *Expected:* **Review the first inspection** is ticked.

**Lost phone**
17. [ ] Open **Team → Phones** and click **Sign out remotely**, with the
        reason "test".
18. [ ] On the phone, open **Account** → **Send now**.
        *Expected:* "This phone was signed out… Enter a new code".
19. [ ] In the console, click **Send new code** for the inspector, then enter
        the new code on the phone.
        *Expected:* it works, and the phone shows as a new active phone.

### 3d. If something goes wrong

| What you see | Likely cause | Fix |
|---|---|---|
| "Couldn't reach the server" | No internet on the phone, or the APK was built before `eas.json` pointed at Render | Check the phone's data, or rebuild the APK (step 3b) |
| "phone invitations are not set up on this server" | `DEVICE_TOKEN_SECRET` missing | Step 1d |
| Invite dialog: SMS **Not delivered** | Sender ID not approved, no DND route, or empty wallet | The detail line says which. Fix it in Termii, then **Send new code** |
| Invite dialog: SMS **Not sent · SMS sending is not set up** | `SMS_PROVIDER` not set | Step 1d |
| SMS says **Sent** but never arrives | Number is on DND and the DND route isn't active | Ask Termii to enable DND (step 1b.3) |
| Visit never appears on the phone | Visit planned for a different inspector, or the phone hasn't synced | Check **Plan visits → Upcoming**, then **Account → Send now** |
| Tapping a visit gives an error about the checklist | No checklist in force for that facility type | Publish one under **Checklists** |
| "This code has expired" | Older than 3 days | **Send new code** |

When everything is ticked, the pilot is ready for real inspectors.
