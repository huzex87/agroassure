import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { DeviceAuthGuard, getPrincipal } from "../common/device-auth.guard";
import { Roles, RolesGuard } from "../common/rbac";
import { RegistryService } from "./registry.service";
import { InstrumentsService } from "./instruments.service";
import { InspectionsService } from "./inspections.service";
import { FindingsService } from "./findings.service";
import { PlanningService } from "./planning.service";
import { DashboardService } from "./dashboard.service";
import { CertificatesService } from "./certificates.service";
import { CertificateRenderService, type CertificateFields } from "../certificate/render.service";
import { isoDate, oneOf, optionalIsoDate, optionalString, requiredString, uuid } from "./validate";

// The regulator console surface. Every route runs behind the auth guard, and
// the role checks are evaluated here on the server from the verified principal;
// the console enforces the same rules only so the UI behaves sensibly.

const FACILITY_TYPES = ["agro_dealer", "blending_plant", "manufacturing", "importer"] as const;
const DECISION_TYPES = [
  "accept",
  "request_clarification",
  "direct_follow_up",
  "escalate",
  "authorise_certificate",
] as const;
const ASSIGNMENT_KINDS = ["routine", "risk_targeted", "follow_up"] as const;

@Controller("v1/facilities")
@UseGuards(DeviceAuthGuard, RolesGuard)
export class FacilitiesController {
  constructor(private readonly registry: RegistryService) {}

  @Get()
  list(@Req() req: Request, @Query() q: Record<string, string>) {
    return this.registry.list(getPrincipal(req), {
      facilityType: q.type,
      lga: q.lga,
      q: q.q,
    });
  }

  @Get(":id")
  detail(@Req() req: Request, @Param("id") id: string) {
    return this.registry.byId(getPrincipal(req), uuid("id", id));
  }

  @Post()
  @Roles("desk_supervisor", "authorising_officer", "state_admin")
  async register(@Req() req: Request, @Body() body: Record<string, unknown>) {
    const id = await this.registry.register(getPrincipal(req), {
      licenceNumber: requiredString("licenceNumber", body.licenceNumber, 64),
      facilityType: oneOf("facilityType", body.facilityType, FACILITY_TYPES),
      name: requiredString("name", body.name, 200),
      ownerContact: body.ownerContact as Record<string, unknown> | undefined,
      address: body.address as Record<string, unknown> | undefined,
      lga: optionalString("lga", body.lga, 80),
      registeredPoint: body.registeredPoint as
        | { lat: number; lng: number; accuracyM?: number }
        | undefined,
    });
    return { id };
  }

  @Patch(":id")
  @Roles("desk_supervisor", "authorising_officer", "state_admin")
  async update(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    await this.registry.update(getPrincipal(req), uuid("id", id), body);
    return { updated: true };
  }
}

@Controller("v1")
@UseGuards(DeviceAuthGuard, RolesGuard)
export class InstrumentsController {
  constructor(private readonly instruments: InstrumentsService) {}

  @Get("instruments")
  list(@Req() req: Request) {
    return this.instruments.list(getPrincipal(req));
  }

  @Get("instrument-versions/:id")
  version(@Param("id") id: string) {
    return this.instruments.version(uuid("id", id));
  }

  @Get("instrument-versions/:id/changes")
  changes(@Param("id") id: string) {
    return this.instruments.pendingChanges(uuid("id", id));
  }

  @Post("instruments/:id/versions")
  @Roles("state_admin")
  async createDraft(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    const versionId = await this.instruments.createDraft(getPrincipal(req), uuid("id", id), {
      versionLabel: requiredString("versionLabel", body.versionLabel, 32),
      satisfactoryMin: body.satisfactoryMin as number | undefined,
      needsImprovementMin: body.needsImprovementMin as number | undefined,
      sections: (body.sections ?? []) as never,
    });
    return { id: versionId };
  }

  @Post("instrument-versions/:id/structure")
  @Roles("state_admin")
  @HttpCode(200)
  async replaceStructure(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    await this.instruments.replaceDraftStructure(uuid("id", id), (body.sections ?? []) as never);
    return { updated: true };
  }

  @Post("instrument-versions/:id/publish")
  @Roles("state_admin")
  @HttpCode(200)
  publish(@Req() req: Request, @Param("id") id: string, @Body() body: Record<string, unknown>) {
    return this.instruments.publish(
      getPrincipal(req),
      uuid("id", id),
      isoDate("effectiveFrom", body.effectiveFrom),
    );
  }
}

@Controller("v1/inspections")
@UseGuards(DeviceAuthGuard, RolesGuard)
export class InspectionsController {
  constructor(
    private readonly inspections: InspectionsService,
    private readonly certificates: CertificatesService,
  ) {}

  @Get()
  list(@Req() req: Request, @Query() q: Record<string, string>) {
    return this.inspections.list(getPrincipal(req), {
      facilityId: q.facilityId,
      status: q.status,
      ratingBand: q.ratingBand,
      from: q.from,
      to: q.to,
    });
  }

  @Get(":id")
  detail(@Req() req: Request, @Param("id") id: string) {
    return this.inspections.detail(getPrincipal(req), uuid("id", id));
  }

  @Post(":id/decisions")
  @Roles("desk_supervisor", "authorising_officer")
  async decide(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    const decisionId = await this.inspections.recordDecision(
      getPrincipal(req),
      uuid("id", id),
      oneOf("decisionType", body.decisionType, DECISION_TYPES),
      optionalString("basis", body.basis),
    );
    return { id: decisionId };
  }

  // Authorising a certificate is a separate command from recording the decision
  // that permits it, and it is the only way a certificate can come into being.
  @Post(":id/certificate")
  @Roles("authorising_officer")
  authorise(@Req() req: Request, @Param("id") id: string) {
    return this.certificates.authorise(getPrincipal(req), uuid("id", id));
  }
}

@Controller("v1/findings")
@UseGuards(DeviceAuthGuard, RolesGuard)
export class FindingsController {
  constructor(private readonly findings: FindingsService) {}

  @Get()
  worklist(@Req() req: Request, @Query() q: Record<string, string>) {
    return this.findings.worklist(getPrincipal(req), {
      status: q.status,
      severity: q.severity,
      inspectionId: q.inspectionId,
      facilityId: q.facilityId,
      overdueOnly: q.overdueOnly === "true",
    });
  }

  @Post(":id/closure")
  @HttpCode(200)
  async submitClosure(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    await this.findings.submitClosure(
      getPrincipal(req),
      uuid("id", id),
      optionalString("note", body.note),
      body.evidenceIds as string[] | undefined,
    );
    return { submitted: true };
  }

  // A facility cannot close its own finding: verification needs a field or
  // supervising role, and the closure records who verified it.
  @Post(":id/verify")
  @Roles("inspector", "desk_supervisor", "authorising_officer")
  @HttpCode(200)
  async verify(@Req() req: Request, @Param("id") id: string) {
    await this.findings.verifyClosure(getPrincipal(req), uuid("id", id));
    return { closed: true };
  }

  @Post(":id/reject")
  @Roles("inspector", "desk_supervisor", "authorising_officer")
  @HttpCode(200)
  async reject(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    await this.findings.rejectClosure(
      getPrincipal(req),
      uuid("id", id),
      requiredString("reason", body.reason),
    );
    return { reopened: true };
  }
}

@Controller("v1")
@UseGuards(DeviceAuthGuard, RolesGuard)
export class PlanningController {
  constructor(
    private readonly planning: PlanningService,
    private readonly dashboard: DashboardService,
  ) {}

  @Get("assignments")
  assignments(@Req() req: Request, @Query() q: Record<string, string>) {
    const principal = getPrincipal(req);
    // An inspector sees their own list; a planner may ask for anyone's.
    const forUser =
      principal.roles.includes("desk_supervisor") ||
      principal.roles.includes("authorising_officer") ||
      principal.roles.includes("state_admin")
        ? q.userId
        : principal.userId;
    return this.planning.assignments(principal, forUser, q.status);
  }

  @Post("assignments")
  @Roles("desk_supervisor", "authorising_officer", "state_admin")
  async createAssignment(@Req() req: Request, @Body() body: Record<string, unknown>) {
    const id = await this.planning.createAssignment(getPrincipal(req), {
      facilityId: uuid("facilityId", body.facilityId),
      assignedToUserId: uuid("assignedToUserId", body.assignedToUserId),
      kind: oneOf("kind", body.kind, ASSIGNMENT_KINDS),
      reason: optionalString("reason", body.reason),
      dueBy: optionalIsoDate("dueBy", body.dueBy),
    });
    return { id };
  }

  @Post("assignments/:id/cancel")
  @Roles("desk_supervisor", "authorising_officer", "state_admin")
  @HttpCode(200)
  async cancel(@Req() req: Request, @Param("id") id: string) {
    await this.planning.cancelAssignment(getPrincipal(req), uuid("id", id));
    return { cancelled: true };
  }

  @Get("risk-suggestions")
  @Roles("desk_supervisor", "authorising_officer", "state_admin", "national_admin")
  suggestions(@Req() req: Request, @Query("limit") limit?: string) {
    return this.planning.riskSuggestions(getPrincipal(req), Number(limit ?? 20));
  }

  @Get("dashboard")
  @Roles("desk_supervisor", "authorising_officer", "state_admin", "national_admin", "auditor")
  dashboardSummary(@Req() req: Request) {
    return this.dashboard.summary(getPrincipal(req));
  }
}

@Controller("v1/certificates")
@UseGuards(DeviceAuthGuard, RolesGuard)
export class CertificatesController {
  constructor(
    private readonly certificates: CertificatesService,
    private readonly renderer: CertificateRenderService,
  ) {}

  @Get(":id")
  detail(@Req() req: Request, @Param("id") id: string) {
    return this.certificates.byId(getPrincipal(req), uuid("id", id));
  }

  @Get(":id/certificate.html")
  @Header("Content-Type", "text/html; charset=utf-8")
  async html(@Req() req: Request, @Param("id") id: string) {
    const cert = await this.certificates.byId(getPrincipal(req), uuid("id", id));
    return this.renderer.html(toFields(cert));
  }

  @Get(":id/certificate.pdf")
  async pdf(@Req() req: Request, @Param("id") id: string, @Res() res: Response) {
    const cert = await this.certificates.byId(getPrincipal(req), uuid("id", id));
    const fields = toFields(cert);
    const buffer = await this.renderer.pdf(fields);
    res
      .status(200)
      .setHeader("Content-Type", "application/pdf")
      .setHeader("Content-Disposition", `inline; filename="${fields.serial}.pdf"`)
      .send(buffer);
  }

  @Post(":id/revoke")
  @Roles("authorising_officer", "state_admin")
  @HttpCode(200)
  async revoke(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    await this.certificates.revoke(
      getPrincipal(req),
      uuid("id", id),
      requiredString("reason", body.reason),
    );
    return { revoked: true };
  }
}

function toFields(row: Record<string, unknown>): CertificateFields {
  return {
    serial: String(row.serial),
    verificationToken: String(row.verification_token),
    businessName: String(row.business_name),
    licenceNumber: String(row.licence_number),
    facilityType: String(row.facility_type),
    lga: (row.lga as string | null) ?? null,
    inspectionReference: String(row.inspection_reference),
    ratingBand: String(row.rating_band),
    ratingPercent: Number(row.rating_percent),
    issuedOn: String(row.issued_on).slice(0, 10),
    validTo: String(row.valid_to).slice(0, 10),
    nextDueOn: String(row.next_due_on).slice(0, 10),
    authorisingOfficerName: String(row.authorising_officer_name),
    issuingAuthority: String(row.issuing_authority),
    issuingAuthorityLegal: String(row.issuing_authority_legal),
    markAssetUrl: (row.mark_asset_url as string | null) ?? null,
  };
}
