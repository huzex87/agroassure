// The email a colleague gets when an administrator adds them to the console.
//
// It points at the sign-in page with their address already filled in, not at a
// one-time sign-in link: a link that expires in fifteen minutes is the wrong
// thing to put in a message that may be opened tomorrow. They click, press one
// button, and the sign-in link arrives in their inbox then.

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

/** Where the email sends them: the console's sign-in page, with their email filled in. */
export function staffSignInUrl(consoleUrl: string, email: string): string {
  return `${consoleUrl.replace(/\/+$/, "")}/signin?email=${encodeURIComponent(email)}`;
}

export function staffWelcomeEmail(name: string, roleLabel: string, url: string) {
  const first = name.trim().split(/\s+/)[0] ?? name;
  const text = [
    `Hello ${first},`,
    "",
    `You've been added to AgroAssure as ${roleLabel}.`,
    "",
    "To get in, open this link and press the button. We'll email you a sign-in link, and there is no password to remember:",
    url,
  ].join("\n");
  const html = `<!doctype html>
<html><body style="margin:0;background:#F1F5EF;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#0E231B">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border:1px solid #D9E2D5;border-radius:16px">
<tr><td style="padding:28px 28px 0">
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="width:36px;height:36px;background:#0B2A20;border-radius:10px;color:#fff;font-weight:700;font-size:18px;text-align:center">A</td>
    <td style="padding-left:10px;font-weight:600;font-size:16px">AgroAssure</td>
  </tr></table>
  <h1 style="margin:22px 0 8px;font-size:21px">Welcome, ${escape(first)}</h1>
  <p style="margin:0;font-size:15px;line-height:1.55;color:#435A4D">You've been added to AgroAssure as ${escape(roleLabel)}.</p>
</td></tr>
<tr><td style="padding:24px 28px" align="center">
  <a href="${escape(url)}" style="display:inline-block;background:#166A45;color:#fff;text-decoration:none;font-weight:600;padding:13px 26px;border-radius:12px">Sign in to AgroAssure</a>
</td></tr>
<tr><td style="padding:16px 28px 26px;font-size:13px;line-height:1.55;color:#587062;border-top:1px solid #D9E2D5">
  Press the button, then <strong>Email me a sign-in link</strong>. There is no password to remember.
</td></tr>
</table></td></tr></table></body></html>`;
  return { subject: "You've been added to AgroAssure", text, html };
}
