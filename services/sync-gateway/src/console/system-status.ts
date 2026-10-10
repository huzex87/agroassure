import type { AppConfig } from "../config/config";

// What an administrator needs to know about whether this server is set up
// properly, in the words of someone who does not read logs.
//
// Setting this platform up was most of a day of finding which one of thirty
// settings was missing or wrong, each found by a person typing an email address
// and noticing nothing arrived. Every check here is something that actually
// went wrong, and each says what it means for a person and what to change.
//
// Nothing here carries a secret. It reports whether a setting is present and
// which provider is named, never the key.

export type CheckState = "ok" | "warn" | "fail";

export interface Check {
  id: string;
  title: string;
  state: CheckState;
  /** What this means for the people using the platform. */
  detail: string;
  /** What to change, naming the setting, when something is not right. */
  fix?: string;
}

export interface SystemStatus {
  /** "ok" when nothing needs doing; "attention" for warnings; "broken" when something cannot work. */
  overall: "ok" | "attention" | "broken";
  checks: Check[];
}

export interface Facts {
  dbUp: boolean;
  projectionLag: number | null;
  /**
   * What happened when the app download link was opened: absent when it was not
   * tried, null when it answered, else a plain sentence about what went wrong.
   */
  downloadProblem?: string | null;
}

/**
 * Opens the app download link the way an inspector's phone would, and says in
 * words what went wrong, or null if it answered. An Expo build link expires and
 * a mistyped one leads nowhere; either way the first anyone hears of it was an
 * inspector who could not install the app.
 */
export async function probeDownloadLink(url: string, timeoutMs = 5000): Promise<string | null> {
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
    await res.body?.cancel();
    return res.status >= 400 ? `The link answered "${res.status}", so a phone cannot download from it.` : null;
  } catch {
    return "The link did not answer, so a phone cannot download from it.";
  }
}

// Providers that refuse to send from an address at a domain the sender does not
// own. Resend returns 403 "domain is not verified" for all of these.
const FREE_MAIL = new Set(["gmail.com", "googlemail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com"]);

/** The domain of a From header such as `AgroAssure <no-reply@example.ng>`. */
export function fromDomain(from: string | null): string | null {
  if (!from) return null;
  const address = /<([^>]+)>/.exec(from)?.[1] ?? from;
  const at = address.lastIndexOf("@");
  return at === -1
    ? null
    : address
        .slice(at + 1)
        .trim()
        .toLowerCase();
}

export function buildSystemStatus(config: AppConfig, facts: Facts): SystemStatus {
  const checks: Check[] = [];
  const add = (c: Check) => checks.push(c);

  add(
    facts.dbUp
      ? { id: "database", title: "Database", state: "ok", detail: "Connected." }
      : {
          id: "database",
          title: "Database",
          state: "fail",
          detail: "The server cannot reach its database, so nothing can be saved or shown.",
          fix: "Check DATABASE_URL, and that the database is running.",
        },
  );

  if (facts.dbUp && facts.projectionLag !== null) {
    add(
      facts.projectionLag > 50
        ? {
            id: "freshness",
            title: "Figures up to date",
            state: "warn",
            detail: `The dashboard is ${facts.projectionLag} updates behind the latest inspections.`,
            fix: "This usually clears by itself. If it keeps growing, restart the service.",
          }
        : { id: "freshness", title: "Figures up to date", state: "ok", detail: "Dashboard figures are current." },
    );
  }

  // How people get into the console.
  const email = config.emailSignIn;
  add(
    email
      ? {
          id: "signin",
          title: "Sign-in by email link",
          state: "ok",
          detail: `Links point to ${email.consoleUrl}.`,
        }
      : {
          id: "signin",
          title: "Sign-in by email link",
          state: config.oidc ? "warn" : "fail",
          detail: config.oidc
            ? "Staff can only sign in through the identity provider. Email links are off."
            : "Nobody can get a sign-in link.",
          fix: "Set CONSOLE_URL to the console's address (for example https://your-console.vercel.app) and CONSOLE_SESSION_SECRET to a random string of 32 or more characters.",
        },
  );

  if (config.oidc && email) {
    add({
      id: "provider",
      title: "Work-account sign-in",
      state: "warn",
      detail:
        "An identity provider is configured as well as email links, so the sign-in page offers a second button. If you do not use one, it leads nowhere.",
      fix: "Remove the OIDC_* settings on the gateway and on the console to keep sign-in to one simple form.",
    });
  }

  // Email: without it, no sign-in link, welcome email or invite arrives.
  const mail = config.invites.email;
  const domain = fromDomain(mail.from);
  if (mail.provider === "resend" || mail.provider === "sendgrid") {
    if (mail.provider === "resend" && domain && FREE_MAIL.has(domain)) {
      add({
        id: "email",
        title: "Email sending",
        state: "fail",
        detail: `Email is sent from an @${domain} address, which Resend refuses. Sign-in links will not arrive.`,
        fix: "Set EMAIL_FROM to an address at a domain you have verified in Resend. To test, use AgroAssure <onboarding@resend.dev>, which delivers only to the email your Resend account was created with.",
      });
    } else if (domain === "resend.dev") {
      add({
        id: "email",
        title: "Email sending",
        state: "warn",
        detail:
          "Email goes out from Resend's shared test address. It reaches only the email your Resend account was created with, so other people will not receive their links.",
        fix: "Verify your own domain in Resend, then set EMAIL_FROM to an address on it.",
      });
    } else {
      add({
        id: "email",
        title: "Email sending",
        state: "ok",
        detail: `Sending through ${mail.provider} from ${domain ?? "your address"}. Use the test below to be sure.`,
      });
    }
  } else {
    add({
      id: "email",
      title: "Email sending",
      state: email ? "fail" : "warn",
      detail:
        mail.provider === "log"
          ? "Email is only written to the server log; nobody receives it."
          : "Email sending is not set up, so no sign-in link, welcome email or invite will arrive.",
      fix: "Set EMAIL_PROVIDER to resend or sendgrid, with EMAIL_API_KEY and EMAIL_FROM.",
    });
  }

  // Text messages carry the inspector's invite code.
  const sms = config.invites.sms;
  const smsReal = sms.provider !== "none" && sms.provider !== "log";
  add(
    smsReal
      ? {
          id: "sms",
          title: "Text messages",
          state: "ok",
          detail: `Invite codes go out by SMS through ${sms.provider}.`,
        }
      : {
          id: "sms",
          title: "Text messages",
          state: "warn",
          detail:
            "Invite codes are not sent by SMS. Inspectors get theirs by email only, or you read the code out to them.",
          fix: "Optional. To send codes by SMS, set SMS_PROVIDER, SMS_API_KEY and SMS_SENDER_ID.",
        },
  );

  add(
    config.invites.deviceTokenSecret
      ? { id: "phones", title: "Phone activation", state: "ok", detail: "Phones can be activated with an invite code." }
      : {
          id: "phones",
          title: "Phone activation",
          state: "fail",
          detail: "A phone cannot be activated, because there is no secret to sign its session with.",
          fix: "Set DEVICE_TOKEN_SECRET to a random string of 32 or more characters.",
        },
  );

  add(
    config.invites.appDownloadUrl && facts.downloadProblem
      ? {
          id: "download",
          title: "App download link",
          state: "warn",
          detail: `${facts.downloadProblem} Invites carry this link, so new inspectors cannot install the app.`,
          fix: "Build the app again (see the owner's guide, \"Building and sharing the phone app\"), then set FIELD_APP_DOWNLOAD_URL to the new link.",
        }
      : config.invites.appDownloadUrl
      ? {
          id: "download",
          title: "App download link",
          state: "ok",
          detail: "Invites include a link to download the app.",
        }
      : {
          id: "download",
          title: "App download link",
          state: "warn",
          detail: "Invites do not say where to get the phone app, so each inspector has to be told separately.",
          fix: "Set FIELD_APP_DOWNLOAD_URL to where inspectors download the app.",
        },
  );

  // Where photos and signatures are kept.
  add(
    config.evidenceStore === "s3"
      ? {
          id: "evidence",
          title: "Evidence storage",
          state: "ok",
          detail: "Photos and signatures are kept write-once in object storage.",
        }
      : {
          id: "evidence",
          title: "Evidence storage",
          state: "fail",
          detail:
            "Photos and signatures are kept on this server's own disk. On most hosts that disk is wiped when the service restarts, and it cannot promise a record is never changed.",
          fix: "Set EVIDENCE_STORE=s3 with the EVIDENCE_S3_* settings.",
        },
  );

  add(
    config.publicVerifyUsesOwnRole
      ? {
          id: "verify",
          title: "Public certificate check",
          state: "ok",
          detail: "The public page can read one view and nothing else.",
        }
      : {
          id: "verify",
          title: "Public certificate check",
          state: "warn",
          detail: "The public certificate page shares the main database login instead of a limited one.",
          fix: "Set PUBLIC_VERIFY_DATABASE_URL to a login that can read only the public certificate view.",
        },
  );

  const rank = { ok: 0, warn: 1, fail: 2 } as const;
  const worst = checks.reduce<number>((n, c) => Math.max(n, rank[c.state]), 0);
  return { overall: worst === 2 ? "broken" : worst === 1 ? "attention" : "ok", checks };
}
