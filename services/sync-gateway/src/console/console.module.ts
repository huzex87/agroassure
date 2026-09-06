import { DevAuthController } from "./dev-auth.controller";
import { Module } from "@nestjs/common";
import {
  CertificatesController,
  FacilitiesController,
  FindingsController,
  InspectionsController,
  InstrumentsController,
  PlanningController,
  UsersController,
  DevicesController,
  AuditController,
} from "./console.controller";
import { RegistryService } from "./registry.service";
import { InstrumentsService } from "./instruments.service";
import { InspectionsService } from "./inspections.service";
import { FindingsService } from "./findings.service";
import { PlanningService } from "./planning.service";
import { DashboardService } from "./dashboard.service";
import { ExecutiveService } from "./executive.service";
import { CertificatesService } from "./certificates.service";
import { CertificateRenderService } from "../certificate/render.service";
import { AdminService } from "./admin.service";
import { AuditService } from "./audit.service";

@Module({
  controllers: [
    DevAuthController,
    FacilitiesController,
    InstrumentsController,
    InspectionsController,
    FindingsController,
    PlanningController,
    CertificatesController,
    UsersController,
    DevicesController,
    AuditController,
  ],
  providers: [
    RegistryService,
    InstrumentsService,
    InspectionsService,
    FindingsService,
    PlanningService,
    DashboardService,
    ExecutiveService,
    CertificatesService,
    CertificateRenderService,
    AdminService,
    AuditService,
  ],
  exports: [FindingsService],
})
export class ConsoleModule {}
