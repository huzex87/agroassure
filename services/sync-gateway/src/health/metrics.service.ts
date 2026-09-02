import { Injectable } from "@nestjs/common";

// Counters, in Prometheus text format.
//
// ponytail: a Map of numbers rather than a metrics library. What is worth
// watching here is a short, known list — the things that mean the platform is
// quietly failing rather than loudly — and a client library plus its registry
// would be more code than the thing it measures. Swap it for prom-client if
// histograms or exemplars are ever needed.
//
// Nothing here is per-user or per-facility: a label with an id in it turns a
// metrics endpoint into a personal-data export, and this one is meant to be
// scrapeable by the institution's monitoring without that being a disclosure.

export type Counter =
  | "events_ingested"
  | "events_rejected"
  | "evidence_stored"
  | "evidence_rejected"
  | "findings_escalated"
  | "certificates_issued"
  | "public_verifications"
  | "auth_failures";

const HELP: Record<Counter, string> = {
  events_ingested: "Device events accepted into the event store",
  events_rejected: "Device events refused: bad hash, bad signature, or a broken chain",
  evidence_stored: "Exhibits written to immutable storage",
  evidence_rejected: "Exhibit uploads refused, chiefly on a checksum mismatch",
  findings_escalated: "Findings escalated by the overdue sweep",
  certificates_issued: "Certificates minted from an authorising decision",
  public_verifications: "Lookups against the public verification surface",
  auth_failures: "Requests refused for an invalid or missing token",
};

@Injectable()
export class MetricsService {
  private readonly counts = new Map<Counter, number>();

  increment(counter: Counter, by = 1): void {
    this.counts.set(counter, (this.counts.get(counter) ?? 0) + by);
  }

  /**
   * Prometheus exposition format. Counters are reported from process start, so
   * a restart resets them; that is what `counter` means to a scraper and it
   * handles the reset itself.
   */
  render(extra: Record<string, number> = {}): string {
    const lines: string[] = [];

    for (const counter of Object.keys(HELP) as Counter[]) {
      lines.push(`# HELP agroassure_${counter} ${HELP[counter]}`);
      lines.push(`# TYPE agroassure_${counter} counter`);
      lines.push(`agroassure_${counter} ${this.counts.get(counter) ?? 0}`);
    }

    for (const [name, value] of Object.entries(extra)) {
      lines.push(`# TYPE agroassure_${name} gauge`);
      lines.push(`agroassure_${name} ${value}`);
    }

    return `${lines.join("\n")}\n`;
  }
}
