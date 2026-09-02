import type { DeviceEvent } from "@agroassure/domain";

// Wire shapes for the sync surface. Validation here is structural; the ingest
// service performs the cryptographic verification that actually matters.

export interface PushEventsDto {
  deviceId: string;
  events: DeviceEvent[];
}

export interface UploadEvidenceDto {
  evidenceId: string;
  sha256: string; // hex, declared by the device
  mime: string;
  contentBase64: string; // skeleton transport; production streams multipart
}
