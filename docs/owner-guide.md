# AgroAssure owner's guide

For the person who runs the deployment. Setting it up is one afternoon if you do it in this order, and the **System status** page tells you what is left.

## What you need

| Account | For | Notes |
|---|---|---|
| **A Postgres database** (for example Supabase) | The database | Use the provider's pooled connection string, not the direct host. On Supabase that is the *session pooler* |
| **An S3-compatible bucket** | Evidence: photos and signatures, kept write-once | Object lock must be on. The gateway refuses to start a pilot without it |
| **Render** | The gateway (the server) | Use a paid plan. The gateway runs two background timers, and a free instance sleeps when idle, so figures go stale and findings never escalate |
| **Vercel** | The console (the website) | Root directory `apps/console`. The `sync-gateway` project on Vercel should be set to skip builds |
| **Resend** | Email: sign-in links, welcome emails, invites | Free tier is fine to start |
| **Termii** (optional) | SMS invite codes | Without it, inspectors get codes by email, or you read them out |
| **Expo** | Building the Android app | Free account |

## 1. Settings on Render

Render, then *agroassure-gateway*, then *Environment*. Make a secret with `openssl rand -hex 32`, or a password manager's generator, at 32 characters or more.

| Setting | Value |
|---|---|
| `APP_ENV` | `pilot` |
| `DATABASE_URL` | Your database's pooled connection string |
| `PUBLIC_VERIFY_DATABASE_URL` | The limited `public_verify` login for the same database |
| `PGSSLROOTCERT_PEM` | Your database provider's CA certificate, pasted whole |
| `CONSOLE_URL` | The console's address, no trailing slash, e.g. `https://your-console.vercel.app` |
| `CONSOLE_SESSION_SECRET` | A new secret |
| `DEVICE_TOKEN_SECRET` | A different new secret. Changing it later signs every phone out |
| `FIELD_APP_DOWNLOAD_URL` | Where inspectors download the app |
| `EMAIL_PROVIDER` | `resend` |
| `EMAIL_API_KEY` | From Resend, *API Keys*, sending access |
| `EMAIL_FROM` | See "Email" below |
| `EVIDENCE_STORE` | `s3`, with `EVIDENCE_S3_BUCKET`, `EVIDENCE_S3_REGION`, `EVIDENCE_S3_ACCESS_KEY_ID`, `EVIDENCE_S3_SECRET_ACCESS_KEY` |
| `FIRST_ADMIN_EMAIL` | **Your** work email. Make it the one you can receive mail at |
| `FIRST_ADMIN_NAME`, `FIRST_ADMIN_STATE` | Your name and the state |

**Leave these unset:** every `OIDC_*` setting (unless you really use an identity provider; on the console too), `AUTH_JWT_SECRET` (a pilot refuses to start with it), and `SELF_REGISTRATION` (off by default; people are invited).

## 2. Settings on Vercel

Vercel, then the *console* project, then *Settings → Environment Variables*:

| Setting | Value |
|---|---|
| `AGROASSURE_API_URL` | The Render gateway's address, e.g. `https://agroassure-gateway.onrender.com` |

Redeploy the console after changing it. Vercel applies variables only to new deployments.

## 3. Email: the one that costs a day

Resend will **not** send from `@gmail.com`, `@yahoo.com` or other free-mail addresses. It answers `403 domain is not verified`, and the person never receives their sign-in link.

- **To test:** set `EMAIL_FROM` to `AgroAssure <onboarding@resend.dev>`. It delivers only to the email your Resend account was created with, so set `FIRST_ADMIN_EMAIL` to that same address while testing.
- **For real use:** in Resend, *Domains → Add Domain*, add the DNS records it shows, wait for it to verify, then set `EMAIL_FROM` to `AgroAssure <no-reply@yourdomain>`. Anyone can then receive email.

## 4. First sign-in, then check the system

1. Open the console's `/signin` page, enter your `FIRST_ADMIN_EMAIL`, click **Email me a sign-in link**, and open the link. You are now a national administrator.
2. Open *Settings → System status*. Each line says what is working, and anything that is not says which setting to change. Fix them from the top.
3. Click **Send me a test email**. If the provider refuses, its own message appears on the page.
4. The dashboard shows a red notice for administrators whenever something is not set up.

Now follow the [handbook](handbook.md): add facilities, check checklists, invite inspectors, plan visits. Before inspectors use the phone app, run the [phone field test](phone-field-test.md) on a real handset.

## Building and sharing the phone app

The Android app is built on Expo's servers and shared as a link. **The easy way:** in GitHub, open the repository's **Actions** tab, choose **Build Android app**, then **Run workflow**. When it finishes (10 to 20 minutes) the run's summary shows the link to paste into Render. It needs the repository secret `EXPO_TOKEN` once (expo.dev, Account settings, Access tokens). The steps below do the same from a computer. Do this the first time, and again whenever the link stops working. **Settings → System status** now opens the link for you and says if it fails.

1. On a computer with Node and pnpm: `git pull`, `pnpm install`, then `cd apps/field`.
2. `npx eas-cli login` (the Expo account that owns the project), then `npx eas-cli build -p android --profile preview`. It takes 10 to 20 minutes and ends with a **link and a QR code**.
3. In Render, set `FIELD_APP_DOWNLOAD_URL` to that link. Every invite from then on carries it. Invites already sent keep the old link.
4. On a phone, open the link, download the file, and when Android asks, allow **Install unknown apps** for the browser, then **Install**.

If the app will not install:

| What you see | Why, and what to do |
|---|---|
| The link says not found or expired | Expo keeps a build for a limited time. Run the build again and update `FIELD_APP_DOWNLOAD_URL` |
| "App not installed" | An older copy signed differently is on the phone. Uninstall AgroAssure, then install again |
| "Blocked" or "Can't install unknown apps" | Settings, then allow installs from the browser that downloaded the file |
| Installs, but says it cannot reach the server | The app was built pointing at a different server. The address is `EXPO_PUBLIC_API_URL` in `apps/field/eas.json`; fix it and build again |

Do not change the app's identifier (`ng.gov.kano.agroassure` in `apps/field/app.json`) once phones have it. A different identifier is a different app: nothing updates in place and new signing credentials are needed.

## Looking after it

- **Deploying.** A push to `main` redeploys both the gateway (Render) and the console (Vercel).
- **Signing everyone out.** Changing `CONSOLE_SESSION_SECRET` ends every console session. Changing `DEVICE_TOKEN_SECRET` signs out every phone.
- **A person leaves.** *Settings → Team*; sign out their phone. Their past work stays on the record.
- **Backups.** The record is the database. Check what your database plan backs up, and try one restore before you rely on it.
- **Before you change the console,** run `pnpm --filter @agroassure/console run build` then `run smoke`. It opens the console in a real browser and clicks through every main page. The same check runs on every pull request.
- **When something is wrong,** start at *Settings → System status*, then the Render *Logs* tab.

## More detail

The longer guides in [`reference/`](reference/) keep the step-by-step detail for SMS and email providers, the Android build, and a testing script with expected results.
