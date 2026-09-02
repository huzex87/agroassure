import { Inject, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import QRCode from "qrcode";
import { CONFIG, type AppConfig } from "../config/config";

// Certificate rendering is server-side and deterministic: the same certificate
// record always produces the same document. The issuing authority's own mark is
// composited from an asset that authority supplied; the platform never invents
// or applies an official mark of any kind.

export interface CertificateFields {
  serial: string;
  verificationToken: string;
  businessName: string;
  licenceNumber: string;
  facilityType: string;
  lga: string | null;
  inspectionReference: string;
  ratingBand: string;
  ratingPercent: number;
  issuedOn: string;
  validTo: string;
  nextDueOn: string;
  authorisingOfficerName: string;
  issuingAuthority: string;
  issuingAuthorityLegal: string;
  markAssetUrl: string | null;
}

const BAND_LABEL: Record<string, string> = {
  satisfactory: "Satisfactory",
  needs_improvement: "Needs Improvement",
  critical_issues: "Critical Issues",
};

const TYPE_LABEL: Record<string, string> = {
  agro_dealer: "Agro-dealer warehouse",
  blending_plant: "Fertilizer processing and blending plant",
  manufacturing: "Manufacturing plant",
  importer: "Importer",
};

@Injectable()
export class CertificateRenderService {
  private readonly logger = new Logger("CertificateRender");

  constructor(@Inject(CONFIG) private readonly config: AppConfig) {}

  verifyUrl(token: string): string {
    return `${this.config.publicVerifyBaseUrl.replace(/\/+$/, "")}/${token}`;
  }

  /** The certificate as HTML. Deterministic, and the input to the PDF render. */
  async html(c: CertificateFields): Promise<string> {
    const qrSvg = await QRCode.toString(this.verifyUrl(c.verificationToken), {
      type: "svg",
      margin: 0,
      errorCorrectionLevel: "M",
    });

    const mark = c.markAssetUrl
      ? `<img class="mark" src="${esc(c.markAssetUrl)}" alt="${esc(c.issuingAuthority)} mark" />`
      : `<div class="mark mark-absent">Authority mark not supplied</div>`;

    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>Certificate of Compliance ${esc(c.serial)}</title>
<style>
  @page { size: A4; margin: 18mm; }
  :root { --primary:#409EF2; --ink:#072435; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: "Segoe UI", Inter, system-ui, sans-serif; color: var(--ink); }
  .sheet { border: 2px solid var(--primary); border-radius: 16px; padding: 28px 32px; }
  header { display:flex; justify-content:space-between; align-items:flex-start; gap:24px; }
  .authority { font-size: 13px; line-height: 1.5; }
  .authority strong { display:block; font-size: 15px; }
  .mark { max-width: 110px; max-height: 110px; }
  .mark-absent { width:110px; height:110px; border:1px dashed #9bb; border-radius:12px;
                 display:flex; align-items:center; justify-content:center; text-align:center;
                 font-size:10px; color:#5a7; padding:6px; }
  h1 { font-size: 25px; margin: 26px 0 4px; letter-spacing: .2px; }
  .subtitle { color:#4a6b7c; font-size: 13px; margin: 0 0 22px; }
  .business { font-size: 21px; font-weight: 700; margin: 0 0 2px; }
  .licence { color:#4a6b7c; font-size: 13px; margin: 0 0 20px; }
  table.fields { width:100%; border-collapse: collapse; font-size: 13px; }
  table.fields td { padding: 7px 0; border-bottom: 1px solid #e6eef4; vertical-align: top; }
  table.fields td.k { color:#4a6b7c; width: 42%; }
  .rating { display:inline-block; padding: 4px 12px; border-radius: 999px;
            background: #eaf4fe; color: var(--primary); font-weight: 600; }
  footer { display:flex; justify-content:space-between; align-items:flex-end;
           gap: 24px; margin-top: 26px; }
  .officer { font-size: 13px; }
  .officer .name { font-weight: 700; font-size: 15px; }
  .officer .role { color:#4a6b7c; }
  .verify { text-align:center; font-size: 10px; color:#4a6b7c; }
  .verify svg { width: 108px; height: 108px; display:block; margin: 0 auto 6px; }
  .token { font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
           font-size: 9px; letter-spacing: .3px; }
  .disclaimer { margin-top: 22px; padding-top: 14px; border-top: 1px solid #e6eef4;
                font-size: 11px; color:#4a6b7c; line-height: 1.6; }
</style></head>
<body><div class="sheet">
  <header>
    <div class="authority">
      <strong>${esc(c.issuingAuthority)}</strong>
      ${esc(c.issuingAuthorityLegal)}
    </div>
    ${mark}
  </header>

  <h1>Certificate of Compliance</h1>
  <p class="subtitle">Serial ${esc(c.serial)} &middot; issued under the National Fertilizer Quality Control Act 2019</p>

  <p class="business">${esc(c.businessName)}</p>
  <p class="licence">Licence ${esc(c.licenceNumber)} &middot; ${esc(
    TYPE_LABEL[c.facilityType] ?? c.facilityType,
  )}${c.lga ? ` &middot; ${esc(c.lga)} LGA` : ""}</p>

  <table class="fields">
    <tr><td class="k">Inspection reference</td><td>${esc(c.inspectionReference)}</td></tr>
    <tr><td class="k">Rating</td><td><span class="rating">${esc(
      BAND_LABEL[c.ratingBand] ?? c.ratingBand,
    )} &middot; ${Math.round(c.ratingPercent)}%</span></td></tr>
    <tr><td class="k">Issued on</td><td>${esc(c.issuedOn)}</td></tr>
    <tr><td class="k">Valid to</td><td>${esc(c.validTo)}</td></tr>
    <tr><td class="k">Next inspection due</td><td>${esc(c.nextDueOn)}</td></tr>
  </table>

  <footer>
    <div class="officer">
      Authorised by<br />
      <span class="name">${esc(c.authorisingOfficerName)}</span><br />
      <span class="role">Authorising Officer, ${esc(c.issuingAuthority)}</span>
    </div>
    <div class="verify">
      ${qrSvg}
      Scan to verify<br />
      <span class="token">${esc(c.verificationToken)}</span>
    </div>
  </footer>

  <p class="disclaimer">
    Issued under the authority of the mandated regulator. AgroAssure records and
    renders this certificate; it does not issue it. Verify this certificate at
    ${esc(this.config.publicVerifyBaseUrl)} using the code above.
  </p>
</div></body></html>`;
  }

  /**
   * HTML to PDF via headless Chromium.
   *
   * ponytail: Playwright is an optional dependency, so `pnpm install` on a field
   * laptop does not pull a browser download. The HTML route always works; this
   * one fails loudly with an install instruction rather than silently returning
   * something that is not a PDF. Install with `pnpm add playwright && npx
   * playwright install chromium` on the render host.
   */
  async pdf(c: CertificateFields): Promise<Buffer> {
    const html = await this.html(c);
    let chromium: typeof import("playwright").chromium;
    try {
      ({ chromium } = await import("playwright"));
    } catch {
      this.logger.error("playwright is not installed; cannot render PDF");
      throw new ServiceUnavailableException(
        "PDF rendering is unavailable on this host: install playwright and its chromium browser",
      );
    }

    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "load" });
      return await page.pdf({ format: "A4", printBackground: true });
    } finally {
      await browser.close();
    }
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) =>
    ch === "&"
      ? "&amp;"
      : ch === "<"
        ? "&lt;"
        : ch === ">"
          ? "&gt;"
          : ch === '"'
            ? "&quot;"
            : "&#39;",
  );
}
