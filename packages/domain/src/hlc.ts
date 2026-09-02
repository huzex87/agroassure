// Hybrid Logical Clock. Combines physical time with a logical counter so events
// have a stable causal order that does not depend on any single device clock
// being correct. Ordering never implies overwrite (see the integrity design).
//
// Serialized form: "<physicalMillis>:<counter>:<nodeId>" zero-padded so the
// string sorts in the same order as the logical order.

export interface HlcState {
  physical: number; // last physical time seen (ms)
  counter: number; // logical counter
  nodeId: string; // device or server node id
}

const PHYS_WIDTH = 15; // ms fits comfortably; pad for lexical sort
const CTR_WIDTH = 5;

export function hlcInit(nodeId: string): HlcState {
  return { physical: 0, counter: 0, nodeId };
}

/** Advance the clock for a locally generated event. */
export function hlcSend(state: HlcState, now: number = Date.now()): {
  state: HlcState;
  stamp: string;
} {
  const physical = Math.max(state.physical, now);
  const counter = physical === state.physical ? state.counter + 1 : 0;
  const next: HlcState = { ...state, physical, counter };
  return { state: next, stamp: encode(next) };
}

/** Merge a received stamp into the local clock (used when applying remote events). */
export function hlcReceive(
  state: HlcState,
  remoteStamp: string,
  now: number = Date.now(),
): HlcState {
  const remote = decode(remoteStamp);
  const physical = Math.max(state.physical, remote.physical, now);
  let counter: number;
  if (physical === state.physical && physical === remote.physical) {
    counter = Math.max(state.counter, remote.counter) + 1;
  } else if (physical === state.physical) {
    counter = state.counter + 1;
  } else if (physical === remote.physical) {
    counter = remote.counter + 1;
  } else {
    counter = 0;
  }
  return { ...state, physical, counter };
}

export function encode(state: Pick<HlcState, "physical" | "counter" | "nodeId">): string {
  const p = String(state.physical).padStart(PHYS_WIDTH, "0");
  const c = String(state.counter).padStart(CTR_WIDTH, "0");
  return `${p}:${c}:${state.nodeId}`;
}

export function decode(stamp: string): { physical: number; counter: number; nodeId: string } {
  const parts = stamp.split(":");
  if (parts.length < 3) throw new Error(`invalid HLC stamp: ${stamp}`);
  const physical = Number(parts[0]);
  const counter = Number(parts[1]);
  const nodeId = parts.slice(2).join(":");
  if (!Number.isFinite(physical) || !Number.isFinite(counter)) {
    throw new Error(`invalid HLC stamp: ${stamp}`);
  }
  return { physical, counter, nodeId };
}

/** Total order comparator for HLC stamps. Returns <0, 0, or >0. */
export function hlcCompare(a: string, b: string): number {
  const da = decode(a);
  const db = decode(b);
  if (da.physical !== db.physical) return da.physical - db.physical;
  if (da.counter !== db.counter) return da.counter - db.counter;
  return da.nodeId < db.nodeId ? -1 : da.nodeId > db.nodeId ? 1 : 0;
}
