import type { FacilityRow } from "../lib/api";
import { CERTIFICATE_STATUS_LABEL, label } from "../lib/format";

// Where the facilities are, drawn from their own coordinates.
//
// There is no basemap. A tile layer would mean sending the coordinates of every
// regulated facility in the state to whoever serves the tiles, on every page
// view, and that is a residency and disclosure decision belonging to the
// institution rather than a rendering choice made here. Relative position
// answers the question this screen actually raises — is the overdue cluster in
// one LGA, is that facility nowhere near the others — and it answers it without
// telling anyone outside the building anything.
//
// If the institution later approves a tile source, this component is where it
// goes, and nothing else changes.

const MARGIN = 16;
const WIDTH = 720;
const HEIGHT = 320;

type Plotted = FacilityRow & { lat: number; lng: number };

/**
 * Size and a ring carry the status as well as the tint does, so the map stays
 * readable to a colour-blind reader and in a printed export — the same rule the
 * badges follow. The palette stays monochromatic on purpose: one saturated
 * colour in this interface means "act here", and a map is not the place to
 * introduce a second hue.
 */
function marker(status: string): { fill: string; radius: number; ring: boolean } {
  switch (status) {
    case "valid":
      return { fill: "var(--color-primary)", radius: 5, ring: false };
    case "due_soon":
      return { fill: "var(--color-primary-700)", radius: 6, ring: true };
    case "overdue":
      return { fill: "var(--color-primary-700)", radius: 7, ring: true };
    default:
      return { fill: "var(--color-ink-muted)", radius: 4, ring: false };
  }
}

/**
 * Latitude and longitude onto the SVG box. Exported because getting this wrong
 * is silent — a stretched or upside-down map still looks like a map — so it is
 * checked rather than eyeballed.
 */
export function project<T extends { lat: number; lng: number }>(
  points: T[],
): Array<T & { x: number; y: number }> {
  const minLat = Math.min(...points.map((p) => p.lat));
  const maxLat = Math.max(...points.map((p) => p.lat));
  const minLng = Math.min(...points.map((p) => p.lng));
  const maxLng = Math.max(...points.map((p) => p.lng));

  // Longitude degrees are shorter than latitude degrees away from the equator;
  // at Katsina's latitude, ignoring that stretches the map east-west by ~2.5%.
  const cos = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180));
  const spanLng = (maxLng - minLng) * cos;
  const spanLat = maxLat - minLat;

  // One facility, or several registered at one address, has no extent to scale
  // to. Scaling a zero span puts everything in a corner rather than nowhere, so
  // it is degenerate rather than merely small: draw the cluster in the middle.
  if (spanLng < 1e-9 && spanLat < 1e-9) {
    return points.map((p) => ({ ...p, x: WIDTH / 2, y: HEIGHT / 2 }));
  }

  // One scale for both axes, so a kilometre is the same length in any
  // direction rather than the cluster being stretched to fill the box. A row of
  // facilities along one road is a zero span on the other axis; that is real
  // geography, and the min() keeps it inside the box rather than magnifying it.
  const scale = Math.min(
    spanLng > 0 ? (WIDTH - MARGIN * 2) / spanLng : Infinity,
    spanLat > 0 ? (HEIGHT - MARGIN * 2) / spanLat : Infinity,
  );
  const offsetX = (WIDTH - spanLng * scale) / 2;
  const offsetY = (HEIGHT - spanLat * scale) / 2;

  return points.map((p) => ({
    ...p,
    x: offsetX + (p.lng - minLng) * cos * scale,
    // SVG y grows downward; north goes up.
    y: offsetY + (maxLat - p.lat) * scale,
  }));
}

export function RegistryMap({ facilities }: { facilities: FacilityRow[] }) {
  const plotted = facilities.filter(
    (f): f is Plotted => typeof f.lat === "number" && typeof f.lng === "number",
  );

  // Paper never recorded a point for some sites. Saying so is better than
  // drawing a map that silently omits them.
  const missing = facilities.length - plotted.length;
  if (plotted.length === 0) return null;

  const markers = project(plotted);

  return (
    <figure className="space-y-3">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full rounded-[12px] border border-line bg-canvas"
        role="img"
        aria-label={`Relative positions of ${plotted.length} facilities. The table below carries the same information.`}
      >
        {markers.map((f) => {
          const { x, y } = f;
          const { fill, radius, ring } = marker(f.certificate_status);
          return (
            <g key={f.id}>
              {ring && (
                <circle cx={x} cy={y} r={radius + 4} fill="none" stroke={fill} strokeWidth={1.5} />
              )}
              <circle cx={x} cy={y} r={radius} fill={fill}>
                <title>
                  {f.name} — {label(CERTIFICATE_STATUS_LABEL, f.certificate_status)}
                  {f.lga ? ` — ${f.lga}` : ""}
                </title>
              </circle>
            </g>
          );
        })}
      </svg>

      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-muted">
        {(["valid", "due_soon", "overdue", "never_inspected"] as const).map((status) => {
          const { fill, radius } = marker(status);
          return (
            <span key={status} className="inline-flex items-center gap-1.5">
              <svg width={16} height={16} aria-hidden="true">
                <circle cx={8} cy={8} r={radius} fill={fill} />
              </svg>
              {label(CERTIFICATE_STATUS_LABEL, status)}
            </span>
          );
        })}
        <span className="ml-auto">
          Relative position only, from registered coordinates. No basemap.
          {missing > 0 &&
            ` ${missing} ${missing === 1 ? "facility has" : "facilities have"} no recorded point.`}
        </span>
      </figcaption>
    </figure>
  );
}
