import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { PoolClient } from "pg";
import { canonicalize, hexToBytes, sha256Hex, utf8ToBytes } from "@agroassure/domain";
import { PgService } from "../db/pg.service";
import { EventAppender } from "../events/event-appender.service";
import type { Principal } from "../common/principal";
import { jurisdictionFilter } from "../common/rbac";

// The template versioning engine. A published version is frozen: its sections,
// checkpoints, weights, and bands never change again, and no inspection is ever
// re-pointed at a different version. Evolving an instrument means publishing a
// new version, which leaves every historical record exactly as it was worked.

export interface DraftCheckpoint {
  ordinal: number;
  promptEn: string;
  promptHa: string;
  weight?: number;
  severityOnFail?: "critical" | "major" | "minor";
  allowsNa?: boolean;
}

export interface DraftSection {
  ordinal: number;
  titleEn: string;
  titleHa: string;
  checkpoints: DraftCheckpoint[];
}

export interface DraftVersionInput {
  versionLabel: string;
  satisfactoryMin?: number;
  needsImprovementMin?: number;
  sections: DraftSection[];
}

/** The exact structure that is hashed and frozen at publish. */
export interface FrozenStructure {
  versionLabel: string;
  satisfactoryMin: number;
  needsImprovementMin: number;
  sections: Array<{
    ordinal: number;
    titleEn: string;
    titleHa: string;
    checkpoints: Array<{
      ordinal: number;
      promptEn: string;
      promptHa: string;
      weight: number;
      severityOnFail: string;
      allowsNa: boolean;
    }>;
  }>;
}

/** Hash of the frozen structure. Bound into every inspection that uses it. */
export function structureHash(s: FrozenStructure): string {
  return sha256Hex(utf8ToBytes(canonicalize(s)));
}

export interface StructureChange {
  kind: "added" | "removed" | "reworded" | "reweighted" | "severity_changed" | "bands_changed";
  ref: string;
  detail: string;
}

/**
 * The explicit change list shown before publish ("Draft v4.0, changes from
 * v3.1"). A regulator ratifying a new instrument sees exactly what moves.
 */
export function diffStructures(from: FrozenStructure, to: FrozenStructure): StructureChange[] {
  const changes: StructureChange[] = [];

  if (
    from.satisfactoryMin !== to.satisfactoryMin ||
    from.needsImprovementMin !== to.needsImprovementMin
  ) {
    changes.push({
      kind: "bands_changed",
      ref: "bands",
      detail:
        `Satisfactory ≥ ${from.satisfactoryMin}% → ≥ ${to.satisfactoryMin}%, ` +
        `Needs Improvement ≥ ${from.needsImprovementMin}% → ≥ ${to.needsImprovementMin}%`,
    });
  }

  const flatten = (s: FrozenStructure) => {
    const m = new Map<string, { promptEn: string; weight: number; severityOnFail: string }>();
    for (const sec of s.sections) {
      for (const cp of sec.checkpoints) {
        m.set(`${sec.ordinal}.${cp.ordinal}`, {
          promptEn: cp.promptEn,
          weight: cp.weight,
          severityOnFail: cp.severityOnFail,
        });
      }
    }
    return m;
  };

  const a = flatten(from);
  const b = flatten(to);

  for (const [ref, before] of a) {
    const after = b.get(ref);
    if (!after) {
      changes.push({ kind: "removed", ref, detail: `removed: ${before.promptEn}` });
      continue;
    }
    if (before.promptEn !== after.promptEn) {
      changes.push({
        kind: "reworded",
        ref,
        detail: `"${before.promptEn}" → "${after.promptEn}"`,
      });
    }
    if (before.weight !== after.weight) {
      changes.push({
        kind: "reweighted",
        ref,
        detail: `weight ${before.weight} → ${after.weight}`,
      });
    }
    if (before.severityOnFail !== after.severityOnFail) {
      changes.push({
        kind: "severity_changed",
        ref,
        detail: `severity on fail ${before.severityOnFail} → ${after.severityOnFail}`,
      });
    }
  }
  for (const [ref, after] of b) {
    if (!a.has(ref)) {
      changes.push({ kind: "added", ref, detail: `added: ${after.promptEn}` });
    }
  }

  return changes.sort((x, y) => (x.ref < y.ref ? -1 : x.ref > y.ref ? 1 : 0));
}

@Injectable()
export class InstrumentsService {
  constructor(
    private readonly pg: PgService,
    private readonly events: EventAppender,
  ) {}

  async list(principal: Principal) {
    return this.pg.query(
      `SELECT i.id, i.facility_type, i.name,
              json_agg(json_build_object(
                'id', v.id, 'version_label', v.version_label, 'status', v.status,
                'effective_from', v.effective_from, 'published_at', v.published_at,
                'satisfactory_min', v.satisfactory_min,
                'needs_improve_min', v.needs_improve_min,
                'inspections_bound',
                  (SELECT count(*) FROM inspection insp WHERE insp.instrument_version_id = v.id)
              ) ORDER BY v.version_label) AS versions
       FROM instrument i
       LEFT JOIN instrument_version v ON v.instrument_id = i.id
       WHERE ($1::uuid IS NULL OR i.jurisdiction_id = $1)
       GROUP BY i.id
       ORDER BY i.name`,
      [jurisdictionFilter(principal)],
    );
  }

  /** The full structure of one version, for the field bundle and the console. */
  async version(versionId: string): Promise<FrozenStructure & { id: string; status: string }> {
    const rows = await this.pg.query<{
      id: string;
      status: string;
      version_label: string;
      satisfactory_min: string;
      needs_improve_min: string;
    }>(
      `SELECT id, status, version_label, satisfactory_min, needs_improve_min
       FROM instrument_version WHERE id = $1`,
      [versionId],
    );
    const v = rows[0];
    if (!v) throw new NotFoundException("instrument version");

    const sections = await this.pg.query<{
      ordinal: number;
      title_en: string;
      title_ha: string;
      checkpoints: DraftCheckpoint[] | null;
    }>(
      `SELECT s.ordinal, s.title_en, s.title_ha,
              json_agg(json_build_object(
                'ordinal', c.ordinal, 'promptEn', c.prompt_en, 'promptHa', c.prompt_ha,
                'weight', c.weight, 'severityOnFail', c.severity_on_fail,
                'allowsNa', c.allows_na
              ) ORDER BY c.ordinal) FILTER (WHERE c.id IS NOT NULL) AS checkpoints
       FROM section s LEFT JOIN checkpoint c ON c.section_id = s.id
       WHERE s.instrument_version_id = $1
       GROUP BY s.id ORDER BY s.ordinal`,
      [versionId],
    );

    return {
      id: v.id,
      status: v.status,
      versionLabel: v.version_label,
      satisfactoryMin: Number(v.satisfactory_min),
      needsImprovementMin: Number(v.needs_improve_min),
      sections: sections.map((s) => ({
        ordinal: s.ordinal,
        titleEn: s.title_en,
        titleHa: s.title_ha,
        checkpoints: (s.checkpoints ?? []).map((c) => ({
          ordinal: c.ordinal,
          promptEn: c.promptEn,
          promptHa: c.promptHa,
          weight: c.weight ?? 1,
          severityOnFail: c.severityOnFail ?? "minor",
          allowsNa: c.allowsNa ?? true,
        })),
      })),
    };
  }

  /** Create a draft version. Drafts are the only editable thing here. */
  async createDraft(
    principal: Principal,
    instrumentId: string,
    input: DraftVersionInput,
  ): Promise<string> {
    return this.pg.transaction(async (client) => {
      const existing = await client.query(
        `SELECT 1 FROM instrument WHERE id = $1 AND ($2::uuid IS NULL OR jurisdiction_id = $2)`,
        [instrumentId, jurisdictionFilter(principal)],
      );
      if (existing.rowCount === 0) throw new NotFoundException("instrument");

      const v = await client.query<{ id: string }>(
        `INSERT INTO instrument_version
           (instrument_id, version_label, status, satisfactory_min, needs_improve_min)
         VALUES ($1,$2,'draft',$3,$4)
         RETURNING id`,
        [
          instrumentId,
          input.versionLabel,
          input.satisfactoryMin ?? 80,
          input.needsImprovementMin ?? 60,
        ],
      );
      const versionId = v.rows[0]!.id;
      await this.writeStructure(client, versionId, input.sections);
      return versionId;
    });
  }

  /** Replace a draft's structure. Refuses anything that is not a draft. */
  async replaceDraftStructure(versionId: string, sections: DraftSection[]): Promise<void> {
    await this.pg.transaction(async (client) => {
      const rows = await client.query<{ status: string }>(
        `SELECT status FROM instrument_version WHERE id = $1 FOR UPDATE`,
        [versionId],
      );
      const status = rows.rows[0]?.status;
      if (!status) throw new NotFoundException("instrument version");
      if (status !== "draft") {
        throw new ConflictException("a published version is immutable; create a new draft");
      }
      await client.query(
        `DELETE FROM checkpoint WHERE section_id IN
           (SELECT id FROM section WHERE instrument_version_id = $1)`,
        [versionId],
      );
      await client.query(`DELETE FROM section WHERE instrument_version_id = $1`, [versionId]);
      await this.writeStructure(client, versionId, sections);
    });
  }

  /** The change list between a draft and the version it would supersede. */
  async pendingChanges(versionId: string): Promise<{
    from: string | null;
    changes: StructureChange[];
  }> {
    const draft = await this.version(versionId);
    const current = await this.pg.query<{ id: string; version_label: string }>(
      `SELECT v.id, v.version_label FROM instrument_version v
       WHERE v.instrument_id = (SELECT instrument_id FROM instrument_version WHERE id = $1)
         AND v.status = 'in_force'`,
      [versionId],
    );
    const inForce = current[0];
    if (!inForce) return { from: null, changes: [] };
    const before = await this.version(inForce.id);
    return { from: inForce.version_label, changes: diffStructures(before, draft) };
  }

  /**
   * Publish a draft: freeze its structure, stamp who published it and when, and
   * demote the version it supersedes. Historical inspections are never touched.
   */
  async publish(
    principal: Principal,
    versionId: string,
    effectiveFrom: string,
  ): Promise<{ versionId: string; structureHash: string }> {
    const structure = await this.version(versionId);
    if (structure.status !== "draft") {
      throw new ConflictException("only a draft can be published");
    }
    if (structure.sections.length === 0) {
      throw new ConflictException("cannot publish a version with no sections");
    }
    const hash = structureHash({
      versionLabel: structure.versionLabel,
      satisfactoryMin: structure.satisfactoryMin,
      needsImprovementMin: structure.needsImprovementMin,
      sections: structure.sections,
    });

    await this.pg.transaction(async (client) => {
      await client.query(
        `UPDATE instrument_version SET status = 'superseded'
         WHERE instrument_id = (SELECT instrument_id FROM instrument_version WHERE id = $1)
           AND status = 'in_force'`,
        [versionId],
      );
      await client.query(
        `UPDATE instrument_version
            SET status = 'in_force', effective_from = $2::date, published_by = $3,
                published_at = now(), structure_hash = $4
          WHERE id = $1`,
        [versionId, effectiveFrom, principal.userId, Buffer.from(hexToBytes(hash))],
      );
    });

    // Publishing is an attributed act, so it is a fact in the store too.
    await this.events.append({
      aggregateType: "instrument_version",
      aggregateId: versionId,
      eventType: "InstrumentVersionPublished",
      payload: {
        versionLabel: structure.versionLabel,
        effectiveFrom,
        structureHash: hash,
        publishedBy: principal.userId,
      },
      actorUserId: principal.userId,
    });

    return { versionId, structureHash: hash };
  }

  private async writeStructure(
    client: PoolClient,
    versionId: string,
    sections: DraftSection[],
  ): Promise<void> {
    for (const s of sections) {
      const sec = await client.query<{ id: string }>(
        `INSERT INTO section (instrument_version_id, ordinal, title_en, title_ha)
         VALUES ($1,$2,$3,$4) RETURNING id`,
        [versionId, s.ordinal, s.titleEn, s.titleHa],
      );
      const sectionId = sec.rows[0]!.id;
      for (const c of s.checkpoints) {
        await client.query(
          `INSERT INTO checkpoint
             (section_id, ordinal, prompt_en, prompt_ha, weight, severity_on_fail, allows_na)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            sectionId,
            c.ordinal,
            c.promptEn,
            c.promptHa,
            c.weight ?? 1,
            c.severityOnFail ?? "minor",
            c.allowsNa ?? true,
          ],
        );
      }
    }
  }
}
