import { Inject, Injectable, Logger } from "@nestjs/common";
import { CONFIG, type AppConfig, type EmailConfig, type SmsConfig } from "../config/config";

// Getting an invitation to a person, by email and by SMS.
//
// Both, not one or the other. An inspector in Katsina may have a phone number
// and no email address anyone checks; an officer at the ministry may be the
// reverse. Every invitation goes to whichever of the two the administrator
// entered, and each channel's outcome is recorded separately so the console can
// say which one to tell them to look at.
//
// Providers are called over plain HTTPS rather than through their SDKs: each is
// one request, and a dependency per provider is a lot of supply chain for one
// request. A failed send never fails the invitation — the code is still valid
// and the console still shows it — because a text that did not go is a reason
// to read the code out, not a reason to start again.

export type ChannelStatus = "sent" | "failed" | "skipped";

export interface ChannelOutcome {
  to: string | null;
  status: ChannelStatus;
  detail: string | null;
}

export interface InviteMessage {
  fullName: string;
  code: string;
  link: string;
  expiresAt: Date;
  invitedBy: string | null;
  appDownloadUrl: string | null;
}

const TIMEOUT_MS = 10_000;

/**
 * A number as providers want it: +234 and the national number. Written locally
 * ("0803 123 4567"), with the country code but no plus ("2348031234567"), or
 * with punctuation — all of which is how numbers arrive from a form.
 */
export function normalizePhone(raw: string, countryCode = "234"): string | null {
  const trimmed = raw.trim();
  const plus = trimmed.startsWith("+");
  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  if (!plus) {
    if (digits.startsWith("00")) digits = digits.slice(2);
    else if (digits.startsWith("0")) digits = countryCode + digits.slice(1);
    else if (!digits.startsWith(countryCode) || digits.length <= 10) digits = countryCode + digits;
  }
  return digits.length >= 10 && digits.length <= 15 ? `+${digits}` : null;
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

function day(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** Short enough for one SMS segment where the download link is absent. */
export function smsText(m: InviteMessage): string {
  const parts = [
    `AgroAssure: Hi ${firstName(m.fullName)}, your invite code is ${m.code}.`,
    `Open the AgroAssure app and enter it.`,
    m.appDownloadUrl ? `Get the app: ${m.appDownloadUrl}` : null,
    `Expires ${day(m.expiresAt)}.`,
  ];
  return parts.filter(Boolean).join(" ");
}

export function emailSubject(): string {
  return "Your AgroAssure invite code";
}

export function emailText(m: InviteMessage): string {
  return [
    `Hello ${firstName(m.fullName)},`,
    "",
    `${m.invitedBy ?? "Your administrator"} has invited you to AgroAssure, the inspection app.`,
    "",
    `Your invite code: ${m.code}`,
    "",
    "To get started:",
    m.appDownloadUrl ? `1. Install the AgroAssure app: ${m.appDownloadUrl}` : "1. Install the AgroAssure app.",
    "2. Open it and enter the code above.",
    "",
    `On the phone you are setting up, you can also open this link to fill the code in for you: ${m.link}`,
    "",
    `The code works once and expires on ${day(m.expiresAt)}. If it expires, ask for a new one.`,
    "",
    "If you were not expecting this, you can ignore this email.",
  ].join("\n");
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

/** Table layout and inline styles, because that is what email clients render. */
export function emailHtml(m: InviteMessage): string {
  const name = escape(firstName(m.fullName));
  const inviter = escape(m.invitedBy ?? "Your administrator");
  const download = m.appDownloadUrl
    ? `<a href="${escape(m.appDownloadUrl)}" style="color:#1665AD;font-weight:600">Install the AgroAssure app</a>`
    : "Install the AgroAssure app";
  return `<!doctype html>
<html><body style="margin:0;background:#F6FAFC;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#072435">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6FAFC;padding:32px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border:1px solid #E4EDF3;border-radius:16px">
<tr><td style="padding:28px 28px 8px">
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="width:36px;height:36px;background:#2F93EC;border-radius:10px;color:#fff;font-weight:700;font-size:18px;text-align:center">A</td>
    <td style="padding-left:10px;font-weight:600;font-size:16px">AgroAssure</td>
  </tr></table>
</td></tr>
<tr><td style="padding:12px 28px 0">
  <h1 style="margin:0 0 8px;font-size:22px;line-height:1.3">You're invited, ${name}</h1>
  <p style="margin:0;font-size:15px;line-height:1.55;color:#4A6B7C">${inviter} has invited you to AgroAssure, the inspection app.</p>
</td></tr>
<tr><td style="padding:22px 28px">
  <div style="background:#EAF4FE;border:1px solid #C2E0FB;border-radius:14px;padding:18px;text-align:center">
    <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#4A6B7C;font-weight:700">Your invite code</div>
    <div style="font-family:Menlo,Consolas,monospace;font-size:30px;font-weight:700;letter-spacing:.12em;margin-top:6px">${escape(m.code)}</div>
  </div>
</td></tr>
<tr><td style="padding:0 28px 8px;font-size:15px;line-height:1.6">
  <ol style="margin:0;padding-left:20px">
    <li>${download}.</li>
    <li>Open it and enter the code above.</li>
  </ol>
</td></tr>
<tr><td style="padding:16px 28px 4px" align="center">
  <a href="${escape(m.link)}" style="display:inline-block;background:#2F93EC;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:12px">Open on this phone</a>
  <p style="margin:8px 0 0;font-size:12px;color:#7C96A4">Works on the phone that has the app installed.</p>
</td></tr>
<tr><td style="padding:20px 28px 28px;font-size:13px;line-height:1.55;color:#7C96A4;border-top:1px solid #E4EDF3">
  The code works once and expires on ${escape(day(m.expiresAt))}. If you weren't expecting this, you can ignore this email.
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

async function call(url: string, init: RequestInit): Promise<void> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) {
    const body = (await response.text().catch(() => "")).slice(0, 200);
    throw new Error(`${response.status} ${body}`.trim());
  }
}

function describe(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.slice(0, 300);
}

@Injectable()
export class InviteDelivery {
  private readonly logger = new Logger("Invitations");

  constructor(@Inject(CONFIG) private readonly config: AppConfig) {}

  /** Human words for the settings page: what will happen when an invitation is sent. */
  channels(): { email: EmailConfig["provider"]; sms: SmsConfig["provider"] } {
    return { email: this.config.invites.email.provider, sms: this.config.invites.sms.provider };
  }

  async sendEmail(to: string | null, m: InviteMessage): Promise<ChannelOutcome> {
    const cfg = this.config.invites.email;
    if (!to) return { to: null, status: "skipped", detail: "no email address" };
    if (cfg.provider === "none") {
      return { to, status: "skipped", detail: "email sending is not set up" };
    }
    try {
      switch (cfg.provider) {
        case "log":
          this.logger.log(`[email to ${to}] ${emailSubject()}\n${emailText(m)}`);
          break;
        case "resend":
          await call("https://api.resend.com/emails", {
            method: "POST",
            headers: { authorization: `Bearer ${cfg.apiKey}`, "content-type": "application/json" },
            body: JSON.stringify({
              from: cfg.from,
              to: [to],
              subject: emailSubject(),
              text: emailText(m),
              html: emailHtml(m),
            }),
          });
          break;
        case "sendgrid":
          await call("https://api.sendgrid.com/v3/mail/send", {
            method: "POST",
            headers: { authorization: `Bearer ${cfg.apiKey}`, "content-type": "application/json" },
            body: JSON.stringify({
              personalizations: [{ to: [{ email: to }] }],
              from: { email: cfg.from },
              subject: emailSubject(),
              content: [
                { type: "text/plain", value: emailText(m) },
                { type: "text/html", value: emailHtml(m) },
              ],
            }),
          });
          break;
      }
      return { to, status: "sent", detail: cfg.provider === "log" ? "written to the service log" : null };
    } catch (err) {
      this.logger.warn(`email to ${to} failed: ${describe(err)}`);
      return { to, status: "failed", detail: describe(err) };
    }
  }

  async sendSms(rawTo: string | null, m: InviteMessage): Promise<ChannelOutcome> {
    const cfg = this.config.invites.sms;
    if (!rawTo) return { to: null, status: "skipped", detail: "no phone number" };
    const to = normalizePhone(rawTo, cfg.defaultCountryCode);
    if (!to) return { to: rawTo, status: "failed", detail: "that phone number does not look right" };
    if (cfg.provider === "none") {
      return { to, status: "skipped", detail: "SMS sending is not set up" };
    }

    const text = smsText(m);
    try {
      switch (cfg.provider) {
        case "log":
          this.logger.log(`[sms to ${to}] ${text}`);
          break;
        case "termii":
          await call("https://api.ng.termii.com/api/sms/send", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              api_key: cfg.apiKey,
              to: to.slice(1),
              from: cfg.senderId,
              sms: text,
              type: "plain",
              channel: cfg.channel,
            }),
          });
          break;
        case "africastalking":
          await call("https://api.africastalking.com/version1/messaging", {
            method: "POST",
            headers: {
              apiKey: cfg.apiKey!,
              accept: "application/json",
              "content-type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              username: cfg.account!,
              to,
              message: text,
              from: cfg.senderId!,
            }).toString(),
          });
          break;
        case "twilio":
          await call(`https://api.twilio.com/2010-04-01/Accounts/${cfg.account}/Messages.json`, {
            method: "POST",
            headers: {
              authorization: `Basic ${Buffer.from(`${cfg.account}:${cfg.apiKey}`).toString("base64")}`,
              "content-type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({ To: to, From: cfg.senderId!, Body: text }).toString(),
          });
          break;
      }
      return { to, status: "sent", detail: cfg.provider === "log" ? "written to the service log" : null };
    } catch (err) {
      this.logger.warn(`sms to ${to} failed: ${describe(err)}`);
      return { to, status: "failed", detail: describe(err) };
    }
  }
}
