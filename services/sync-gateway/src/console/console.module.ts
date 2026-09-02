import { Module } from "@nestjs/common";
import {
  CertificatesController,
  FacilitiesController,
  FindingsController,
  InspectionsController,
  InstrumentsController,
  PlanningController,
} from "./console.controller";
import { RegistryService } from "./registry.service";
import { InstrumentsService } from "./instruments.service";
import { InspectionsService } from "./inspections.service";
import { FindingsService } from "./findings.service";
import { PlanningService } from "./planning.service";
import { DashboardService } from "./dashboard.service";
import { CertificatesService } from "./certificates.service";
import { CertificateRenderService } from "../certificate/render.service";

@Module({
  controllers: [
    FacilitiesController,
    InstrumentsController,
    InspectionsController,
    FindingsController,
    PlanningController,
    CertificatesController,
  ],
  providers: [
    RegistryService,
    InstrumentsService,
    InspectionsService,
    FindingsService,
    PlanningService,
    DashboardService,
    CertificatesService,
    CertificateRenderService,
  ],
  exports: [FindingsService],
})
export class ConsoleModule {}
