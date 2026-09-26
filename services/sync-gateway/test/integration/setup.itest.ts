import { describe, it, expect, beforeAll } from "vitest";
import { ConflictException } from "@nestjs/common";
import type { AppConfig } from "../../src/config/config";
import { PgService } from "../../src/db/pg.service";
import { ProjectorService } from "../../src/projections/projector.service";
import { EventAppender } from "../../src/events/event-appender.service";
import { RegistryService } from "../../src/console/registry.service";
import { PlanningService } from "../../src/console/planning.service";
import { SetupService } from "../../src/console/setup.service";
import type { Principal } from "../../src/common/principal";

// A new state setting itself up: facilities from a spreadsheet, a first visit
// planned, and the checklist on the dashboard ticking as it goes.
//
// The part only a real database can check is the one that matters most: a
// duplicate licence number must be turned away before an event is written.
// The event store cannot take one back, and a duplicate that reached it would
// fail at the projection's unique key on every replay.

const DATABASE_URL = process.env.DATABASE_URL;
const ALLOWED = process.env.ALLOW_DESTRUCTIVE_TEST_DB === "1";
const runIf = DATABASE_URL && ALLOWED ? describe : describe.skip;

runIf("setting up a new state", () => {
  let pg: PgService;
  let registry: RegistryService;
  let planning: PlanningService;
  let setup: SetupService;
  let supervisor: Principal;
  let inspectorId: string;
  let prefix: string;

  const events = async () =>
    Number(
      (
        await pg.query<{ n: string }>(
          `SELECT count(*) AS n FROM event_store WHERE event_type = 'FacilityRegistered'`,
        )
      )[0]!.n,
    );

  beforeAll(async () => {
    pg = new PgService({ databaseUrl: DATABASE_URL } as AppConfig);
    const projector = new ProjectorService(pg);
    registry = new RegistryService(pg, new EventAppender(pg, projector));
    planning = new PlanningService(pg);
    setup = new SetupService(pg);

    const code = `S${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    prefix = `FISS/${code}`;
    const jurisdictionId = (
      await pg.query<{ id: string }>(
        `INSERT INTO jurisdiction (name, code) VALUES ($1, $2) RETURNING id`,
        [`Setup ${code}`, code],
      )
    )[0]!.id;
    const supervisorId = (
      await pg.query<{ id: string }>(
        `INSERT INTO app_user (jurisdiction_id, full_name) VALUES ($1, 'Setup Supervisor') RETURNING id`,
        [jurisdictionId],
      )
    )[0]!.id;
    inspectorId = (
      await pg.query<{ id: string }>(
        `INSERT INTO app_user (jurisdiction_id, full_name) VALUES ($1, 'Setup Inspector') RETURNING id`,
        [jurisdictionId],
      )
    )[0]!.id;
    await pg.query(
      `INSERT INTO user_role (user_id, role_code, jurisdiction_id) VALUES ($1, 'inspector', $2)`,
      [inspectorId, jurisdictionId],
    );
    supervisor = { userId: supervisorId, deviceId: null, jurisdictionId, roles: ["desk_supervisor"] };
  });

  it("starts with nothing done", async () => {
    expect(await setup.progress(supervisor)).toEqual({
      facilities: 0,
      checklistsInForce: 0,
      inspectors: 1,
      inspectorsWithPhone: 0,
      invitesWaiting: 0,
      plannedVisits: 0,
      submittedInspections: 0,
    });
  });

  it("previews an import without writing anything", async () => {
    const before = await events();
    const plan = await registry.importFacilities(
      supervisor,
      [
        { Name: "Kofar Soro Agro", "Licence No": `${prefix}/001`, Type: "Agro dealer", LGA: "Katsina" },
        { Name: "", "Licence No": `${prefix}/002`, Type: "Agro dealer" },
      ],
      true,
    );
    expect(plan).toMatchObject({ valid: 1, invalid: 1, imported: 0 });
    expect(await events()).toBe(before);
  });

  it("imports the rows that passed, together, and reports the rest", async () => {
    const before = await events();
    const plan = await registry.importFacilities(
      supervisor,
      [
        { Name: "Kofar Soro Agro", "Licence No": `${prefix}/001`, Type: "Agro dealer", GPS: "12.9855, 7.6189" },
        { Name: "Danmarke Blenders", "Licence No": `${prefix}/003`, Type: "Blending plant" },
        { Name: "No licence" , Type: "Importer" },
      ],
      false,
    );
    expect(plan).toMatchObject({ valid: 2, invalid: 1, imported: 2 });
    expect(await events()).toBe(before + 2);

    const listed = await registry.list(supervisor, {});
    expect(listed.map((f: { name: string }) => f.name).sort()).toEqual([
      "Danmarke Blenders",
      "Kofar Soro Agro",
    ]);
  });

  it("refuses a duplicate licence before any event is written, however it is cased", async () => {
    const before = await events();
    await expect(
      registry.register(supervisor, {
        name: "A second Kofar Soro",
        licenceNumber: `${prefix}/001`.toLowerCase(),
        facilityType: "agro_dealer",
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    const again = await registry.importFacilities(
      supervisor,
      [{ Name: "Copy", "Licence No": `${prefix}/003`, Type: "Blending plant" }],
      false,
    );
    expect(again).toMatchObject({ valid: 0, imported: 0 });
    expect(again.rows[0]!.errors).toEqual(["This licence number is already registered"]);
    expect(await events()).toBe(before);
  });

  it("ticks off facilities and a planned visit", async () => {
    const [facility] = await registry.list(supervisor, { q: "Kofar Soro" });
    await planning.createAssignment(supervisor, {
      facilityId: (facility as { id: string }).id,
      assignedToUserId: inspectorId,
      kind: "routine",
      reason: "First visit after registration.",
    });
    expect(await setup.progress(supervisor)).toMatchObject({ facilities: 2, plannedVisits: 1 });
  });

  it("plans a week in one go, all or nothing, and never twice", async () => {
    const facilities = (await registry.list(supervisor, {})) as Array<{ id: string; name: string }>;
    const kofar = facilities.find((f) => f.name === "Kofar Soro Agro")!;
    const danmarke = facilities.find((f) => f.name === "Danmarke Blenders")!;

    // Kofar Soro was planned above, so the batch is refused as a whole and
    // Danmarke is not quietly planned on its own.
    await expect(
      planning.createAssignments(supervisor, {
        facilityIds: [kofar.id, danmarke.id],
        assignedToUserId: inspectorId,
        kind: "routine",
      }),
    ).rejects.toThrow(/Kofar Soro Agro already has a visit planned/);
    expect(await setup.progress(supervisor)).toMatchObject({ plannedVisits: 1 });

    const ids = await planning.createAssignments(supervisor, {
      facilityIds: [danmarke.id],
      assignedToUserId: inspectorId,
      kind: "follow_up",
      reason: "Blending records were incomplete.",
      dueBy: "2026-10-15",
    });
    expect(ids).toHaveLength(1);

    const [inspector] = (await planning.inspectors(supervisor)) as Array<Record<string, unknown>>;
    expect(inspector).toMatchObject({ full_name: "Setup Inspector", has_phone: false, open_visits: 2 });
  });

  it("will not send someone who is not an inspector", async () => {
    const facilities = (await registry.list(supervisor, {})) as Array<{ id: string }>;
    await expect(
      planning.createAssignments(supervisor, {
        facilityIds: [facilities[0]!.id],
        assignedToUserId: supervisor.userId,
        kind: "routine",
      }),
    ).rejects.toThrow(/active inspector/);
  });

  it("says who is asking, with the roles every request is authorised by", async () => {
    expect(await setup.me(supervisor)).toMatchObject({
      fullName: "Setup Supervisor",
      roles: ["desk_supervisor"],
      jurisdictionName: expect.stringMatching(/^Setup /),
    });
  });
});
