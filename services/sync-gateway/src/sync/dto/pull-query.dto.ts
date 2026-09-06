import { optionalScalar } from "../../common/validate";

export interface PullQueryDto {
  since?: string; // ISO cursor from the device's previous pull
}

export function parsePullQuery(query: unknown): PullQueryDto {
  const q = (query ?? {}) as Record<string, unknown>;
  return { since: optionalScalar("since", q.since, 120) };
}
