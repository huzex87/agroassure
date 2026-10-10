// A stand-in for the gateway, with a believable registry behind it, so the smoke
// test can drive the real console in a real browser without a database. It
// answers the read endpoints the pages use and accepts every write.
import http from "node:http";

const iso = (d) => new Date(Date.now() + d * 86400000).toISOString();
const day = (d) => iso(d).slice(0, 10);

const NAMES = [
  ["Rimin Zakara Agro Ventures Ltd", "agro_dealer", "Katsina", "valid", 12.9855, 7.6189, "satisfactory"],
  ["Dutsin-Ma Farm Inputs", "agro_dealer", "Dutsin-Ma", "due_soon", 12.4531, 7.4949, "satisfactory"],
  ["Funtua Blending Company", "blending_plant", "Funtua", "overdue", 11.5232, 7.3117, "needs_improvement"],
  ["Malumfashi Agro Supply", "agro_dealer", "Malumfashi", "valid", 11.7894, 7.6168, "satisfactory"],
  ["Katsina Fertilizer Importers Ltd", "importer", "Katsina", "never_inspected", 12.9908, 7.6001, null],
  ["Daura Green Harvest", "agro_dealer", "Daura", "valid", 13.0343, 8.3188, "satisfactory"],
  ["Kankia Agro-Chem Store", "agro_dealer", "Kankia", "overdue", 12.5391, 7.8222, "critical_issues"],
  ["Northern Nutrients Manufacturing", "manufacturing", "Funtua", "due_soon", 11.5301, 7.3205, "satisfactory"],
];
const facilities = NAMES.map(([name, type, lga, status, lat, lng, band], i) => ({
  id: `f-${i}`, licence_number: `FISS/KT/${type === "agro_dealer" ? "AD" : "XX"}/2026/${String(417 + i * 13).padStart(4, "0")}`,
  facility_type: type, name, lga, lat, lng,
  last_inspected: status === "never_inspected" ? null : iso(-30 - i * 21),
  last_rating_band: band,
  certificate_serial: status === "never_inspected" ? null : `KT-2026-${String(1000 + i)}`,
  certificate_valid_to: status === "never_inspected" ? null : iso(status === "overdue" ? -14 : status === "due_soon" ? 18 : 240),
  certificate_status: status,
}));

const inspections = facilities.filter((f) => f.last_inspected).map((f, i) => ({
  id: `i-${i}`, reference: `INS-2026-${String(204 - i).padStart(4, "0")}`, status: "submitted",
  rating_percent: String([86.49, 91.2, 58.1, 79.9, 94.6, 43.2, 88.0][i % 7]),
  rating_band: f.last_rating_band, findings_count: [2, 0, 6, 1, 0, 9, 3][i % 7],
  checkin_flagged: i === 2, version_discrepancy: false, submitted_at: f.last_inspected,
  facility_name: f.name, licence_number: f.licence_number, lga: f.lga,
  inspector: ["Aisha Bello", "Musa Ibrahim", "Hauwa Sani"][i % 3], reviewed: i % 3 !== 0,
}));

const findings = [
  ["Warehouse stack height exceeds the safe limit", "critical"], ["Fertilizer bags stored without pallets", "major"],
  ["Expired product on the sales floor", "critical"], ["Fire extinguisher service tag out of date", "minor"],
  ["Weighing scale not calibrated", "major"], ["Product register missing batch numbers", "major"],
].map(([summary, severity], i) => ({
  id: `fi-${i}`, reference: `FND-2026-${String(88 - i).padStart(4, "0")}`, summary, severity,
  status: ["open", "open", "escalated", "in_progress", "open", "open"][i], due_date: day(i === 2 ? -9 : 6 + i * 4),
  owner_label: "Facility manager", escalated_to: i === 2 ? "Director, Inspectorate" : null,
  escalated_at: i === 2 ? iso(-2) : null, checkpoint_ref: `S${i + 2}.${i + 1}`, past_due: i === 2,
  days_past_due: i === 2 ? 9 : null, inspection_id: `i-${i % 6}`, inspection_reference: `INS-2026-${String(204 - (i % 6)).padStart(4, "0")}`,
  facility_id: `f-${i}`, facility_name: facilities[i].name, licence_number: facilities[i].licence_number, lga: facilities[i].lga,
}));

const users = [
  ["Aisha Bello", "aisha.bello@agency.gov.ng", "08031234567", ["inspector"], 1, iso(-0.02)],
  ["Musa Ibrahim", "musa.ibrahim@agency.gov.ng", "08051112222", ["inspector"], 1, iso(-1.5)],
  ["Hauwa Sani", null, "07044556677", ["inspector"], 0, null, true],
  ["Dr. Zainab Yusuf", "z.yusuf@agency.gov.ng", null, ["state_admin"], 0, null],
  ["Bashir Danladi", "b.danladi@agency.gov.ng", null, ["desk_supervisor"], 0, null],
].map(([full_name, email, phone, roles, active_phones, seen, invite], i) => ({
  id: `u-${i}`, full_name, email, phone, status: "active", roles, created_at: iso(-40 + i),
  active_phones, phone_last_seen_at: seen ?? null,
  invitation_id: invite ? "inv-1" : null, invitation_expires_at: invite ? iso(2) : null,
  invitation_email_status: invite ? "skipped" : null, invitation_sms_status: invite ? "sent" : null,
}));

const trend = Array.from({ length: 8 }, (_, i) => ({
  month: new Date(Date.now() - (7 - i) * 30 * 86400000).toISOString().slice(0, 7) + "-01",
  avg_rating: [71, 74, 72, 78, 81, 79, 84, 86][i], inspections: [6, 9, 11, 10, 14, 13, 17, 19][i], satisfactory: [3, 5, 6, 6, 9, 9, 13, 15][i],
}));


const sections = ["Premises and storage","Product handling","Records and traceability","Weights and measures","Safety and environment"];
const prompts = [
  ["Fertilizer is stored off the floor on pallets","Stack heights are within the safe limit","Storage area is dry and free of leaks"],
  ["Products are within their expiry dates","Opened bags are resealed and labelled"],
  ["A current stock register is kept","Batch numbers are recorded on every receipt"],
  ["Weighing scales are calibrated","Scale calibration certificate is displayed"],
  ["Fire extinguishers are serviced and visible","Emergency exits are clear"],
];
const responses = [];
prompts.forEach((list, si) => list.forEach((p, ci) => {
  const ref = `${si + 1}.${ci + 1}`;
  const bad = ["1.2","2.1","3.2","5.1"].includes(ref);
  responses.push({ checkpoint_ref: ref, response: bad ? "no" : (ref === "4.2" ? "na" : "yes"), remark: bad ? ({ "1.2":"Bags stacked eight high against the east wall.", "2.1":"Three bags of NPK past their expiry date still on the shelf.", "3.2":"Batch numbers missing on the last two deliveries.", "5.1":"Extinguisher service tag expired in March." })[ref] : null, weight: 1, section_title_en: sections[si], prompt_en: p, prompt_ha: p });
}));
const detail = {
  inspection: { reference: "INS-2026-0204", rating_band: "needs_improvement", rating_percent: "72.7", facility_name: facilities[0].name, licence_number: facilities[0].licence_number, inspector_name: "Aisha Bello", submitted_at: iso(-30), version_label: "v4.0", checkin_distance_m: 38, checkin_accuracy_m: 6, checkin_flagged: false, inspector_signed_at: iso(-30), facility_rep_name: "Sani Abdullahi", facility_signed_at: iso(-30), structure_hash_hex: "9f2c1ab47e0d5538c6b1f0a2de49b7731c58aa04e6d2f9b813ce7054ad1b62f0", version_discrepancy: false },
  responses,
  evidence: [{ id: "e1", checkpoint_ref: "1.2", sha256: "a1b2c3d4e5f60718293a4b5c6d7e8f90", object_key: "k", mime: "image/jpeg", captured_at: iso(-30), locked: true, lat: 12.98551, lng: 7.61897, accuracy_m: "5" }, { id: "e2", checkpoint_ref: "2.1", sha256: "ff00112233445566778899aabbccddee", object_key: "k2", mime: "image/jpeg", captured_at: iso(-30), locked: true, lat: 12.98551, lng: 7.61897, accuracy_m: "5" }],
  findings: findings.slice(0, 4).map((f, i) => ({ id: f.id, reference: f.reference, checkpoint_ref: ["1.2","2.1","3.2","5.1"][i], summary: f.summary, severity: f.severity, status: ["open","awaiting_verification","escalated","open"][i], due_date: f.due_date, owner_label: "Facility manager", escalated_to: i === 2 ? "director" : null, escalated_at: i === 2 ? iso(-2) : null, closed_at: null })),
  decisions: [{ id: "d1", decision_type: "direct_follow_up", basis: "Re-inspect within 30 days. Expired stock to be removed and destroyed with a receipt.", decided_at: iso(-28), officer: "Bashir Danladi" }],
};
const facilityDetail = (id) => { const f = facilities.find((x) => x.id === id) ?? facilities[0]; return { facility: { ...f, registered_accuracy_m: 4, registered_at: iso(-200) }, inspections: inspections.slice(0, 3).map((i) => ({ id: i.id, reference: i.reference, submitted_at: i.submitted_at, rating_percent: i.rating_percent, rating_band: i.rating_band, findings_count: i.findings_count, checkin_flagged: i.checkin_flagged, inspector: i.inspector })), certificates: [{ id: "c-1", serial: "KT-2026-1000", rating_band: "satisfactory", issued_on: day(-120), valid_to: day(240), next_due_on: day(210), status: "valid" }, { id: "c-0", serial: "KT-2025-0871", rating_band: "satisfactory", issued_on: day(-480), valid_to: day(-115), next_due_on: day(-145), status: "superseded" }] }; };
const certificate = { id: "c-1", serial: "KT-2026-1000", verification_token: "vK3m9QpX7tLw2Zr8", business_name: facilities[0].name, licence_number: facilities[0].licence_number, facility_type: "agro_dealer", lga: "Katsina", inspection_reference: "INS-2026-0204", inspection_id: "i-0", facility_id: "f-0", rating_band: "satisfactory", rating_percent: "86.49", issued_on: day(-120), valid_to: day(240), next_due_on: day(210), status: "valid", authorising_officer_name: "Dr. Zainab Yusuf", issuing_authority: "Katsina State Ministry of Agriculture", issuing_authority_legal: "National Fertilizer Quality Control Act 2019", mark_asset_url: null };
const version = { id: "v-0", status: "in_force", versionLabel: "v4.0", satisfactoryMin: 80, needsImprovementMin: 60, sections: sections.map((t, si) => ({ ordinal: si + 1, titleEn: t, titleHa: t, checkpoints: prompts[si].map((p, ci) => ({ ordinal: ci + 1, promptEn: p, promptHa: p, weight: ci === 0 ? 3 : 1, severityOnFail: ["critical","major","minor"][(si + ci) % 3], allowsNa: ci % 2 === 1 })) })) };
const planned = users.filter((u) => u.roles.includes("inspector")).slice(0, 2).flatMap((u, ui) => facilities.slice(ui * 2, ui * 2 + 2).map((f, i) => ({ id: `a-${ui}${i}`, kind: ["routine","follow_up","risk_targeted"][(ui + i) % 3], reason: ["Licence renewal due next month","Two findings from the last visit are still open","Certificate lapsed 14 days ago"][(ui + i) % 3], due_by: day(5 + i * 6), status: "planned", created_at: iso(-3), inspection_id: null, facility_id: f.id, facility_name: f.name, licence_number: f.licence_number, facility_type: f.facility_type, lga: f.lga, assigned_to: u.full_name })));
const executive = { coverage: { total: 214, inspected12m: 131, neverInspected: 38, lapsedOverAYear: 45, percent: 61 }, ratingTrend: trend.map((t) => ({ month: t.month.slice(0, 7), avg_rating: t.avg_rating, inspections: t.inspections })), findingsFlow: trend.map((t, i) => ({ month: t.month.slice(0, 7), raised: 18 + i * 3, closed: 10 + i * 4 })), closure: { medianDays: 17, closedCount: 142 }, byLga: ["Katsina","Funtua","Daura","Malumfashi","Dutsin-Ma"].map((lga, i) => ({ lga, facilities: 60 - i * 9, inspected: 40 - i * 7, avg_rating: [86, 78, 71, 82, 64][i], open_findings: [6, 14, 9, 5, 21][i] })), repeatFailures: [{ facility: facilities[2].name, lga: "Funtua", checkpoint_ref: "1.2", times: 3, last_raised: iso(-12) }, { facility: facilities[6].name, lga: "Kankia", checkpoint_ref: "3.2", times: 2, last_raised: iso(-40) }], promises: { overdueFindings: 9, certificatesDueSoon: 12, devicesAwaitingApproval: 0, decisionsWithin30Days: { decided: 38, total: 44, percent: 86 } } };

const routes = {
  "/v1/me": () => ({ userId: "u-3", fullName: "Dr. Zainab Yusuf", email: "z.yusuf@agency.gov.ng", roles: ["state_admin"], jurisdictionId: "j-1", jurisdictionName: "Katsina State" }),
  "/v1/dashboard": () => ({
    tiles: { facilities: 214, inspections30d: 46, openFindings: 63, overdueFindings: 9, validCertificates: 131, certificatesDueSoon: 12 },
    decisionsWithin30Days: { decided: 38, total: 44, percent: 86 },
    complianceTrend: trend,
    findingsBySection: [
      ["1", "Premises and storage", 21, 5], ["2", "Product handling", 14, 2], ["3", "Records and traceability", 12, 1],
      ["4", "Weights and measures", 8, 0], ["5", "Safety and environment", 6, 2], ["6", "Licensing", 2, 0],
    ].map(([section_ordinal, section_title, findings, critical]) => ({ section_ordinal, section_title, findings, critical })),
    findingsQueue: [],
  }),
  "/v1/risk-suggestions": () => facilities.filter((f) => f.certificate_status !== "valid").slice(0, 5).map((f, i) => ({
    facilityId: f.id, facilityName: f.name, licenceNumber: f.licence_number, lga: f.lga, score: [91, 84, 77, 70, 62][i],
    reasons: ["Three critical findings from the last visit are still open", "Certificate lapsed 14 days ago", "No inspection in 14 months"],
    leadingReason: ["Three critical findings from the last visit are still open", "Certificate lapsed 14 days ago", "Never inspected since registration", "Two follow-ups overdue", "Rated unsatisfactory last visit"][i],
  })),
  "/v1/setup": () => ({ facilities: 214, checklistsInForce: 4, inspectors: 3, inspectorsWithPhone: 2, invitesWaiting: 1, plannedVisits: 0, submittedInspections: 0 }),
  "/v1/registrations": () => [],
  "/v1/facilities": () => facilities,
  "/v1/inspections": () => inspections,
  "/v1/findings": () => findings,
  "/v1/audit/processing-log": () => ({
    generatedAt: iso(0), period: { from: day(-29), to: day(0) }, residency: "Nigeria: no personal data is processed outside the country.",
    byActivity: [
      { event_type: "InspectionSubmitted", events: 46, actors: 3, devices: 3, first_at: iso(-28), last_at: iso(-1) },
      { event_type: "ResponseRecorded", events: 1420, actors: 3, devices: 3, first_at: iso(-28), last_at: iso(-1) },
      { event_type: "DecisionRecorded", events: 38, actors: 2, devices: 0, first_at: iso(-27), last_at: iso(-2) },
    ],
    byActor: users.slice(0, 3).map((u, i) => ({ full_name: u.full_name, events: 400 - i * 120, first_at: iso(-28), last_at: iso(-i) })),
  }),
  "/v1/inspectors": () => users.filter((u) => u.roles.includes("inspector")).map((u) => ({ id: u.id, full_name: u.full_name, has_phone: u.active_phones > 0, open_visits: 3 })),
  "/v1/assignments": () => planned,
  "/v1/users": () => users,
  "/v1/devices": () => [{ id: "d-1", label: "Tecno Spark 10", status: "active", enrolled_at: iso(-9), revoked_at: null, assigned_to: "Musa Ibrahim", public_key: "ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12", events_authored: 41, last_seen_at: iso(-1) }],
  "/v1/invitations/channels": () => ({ email: "resend", sms: "termii" }),
  "/v1/instruments": () => ["agro_dealer", "blending_plant", "manufacturing", "importer"].map((t, i) => ({
    id: `ins-${i}`, facility_type: t, name: `${t.replace("_", " ")} inspection checklist`,
    versions: [{ id: `v-${i}`, version_label: "v4.0", status: "in_force", effective_from: day(-60), published_at: iso(-61), satisfactory_min: "80", needs_improve_min: "60", inspections_bound: 41 - i * 7 }],
  })),
  "/v1/executive": () => executive,
  "/v1/system/status": () => ({ overall: "broken", checks: [
    { id: "database", title: "Database", state: "ok", detail: "Connected." },
    { id: "signin", title: "Sign-in by email link", state: "ok", detail: "Links point to https://console-five-phi.vercel.app." },
    { id: "provider", title: "Work-account sign-in", state: "warn", detail: "An identity provider is configured as well as email links, so the sign-in page offers a second button. If you do not use one, it leads nowhere.", fix: "Remove the OIDC_* settings on the gateway and on the console to keep sign-in to one simple form." },
    { id: "email", title: "Email sending", state: "fail", detail: "Email is sent from an @gmail.com address, which Resend refuses. Sign-in links will not arrive.", fix: "Set EMAIL_FROM to an address at a domain you have verified in Resend. To test, use AgroAssure <onboarding@resend.dev>, which delivers only to the email your Resend account was created with." },
    { id: "evidence", title: "Evidence storage", state: "fail", detail: "Photos and signatures are kept on this server's own disk. On most hosts that disk is wiped when the service restarts, and it cannot promise a record is never changed.", fix: "Set EVIDENCE_STORE=s3 with the EVIDENCE_S3_* settings." },
    { id: "sms", title: "Text messages", state: "warn", detail: "Invite codes are not sent by SMS. Inspectors get theirs by email only, or you read the code out to them.", fix: "Optional. To send codes by SMS, set SMS_PROVIDER, SMS_API_KEY and SMS_SENDER_ID." },
  ] }),
  "/auth/methods": () => ({ oidc: false, email: true, dev: false }),
};

http.createServer((req, res) => {
  const path = new URL(req.url, "http://x").pathname;
  const key = Object.keys(routes).find((k) => path === k || path === `/auth${k}` || path.startsWith(k + "/"));
  res.setHeader("content-type", "application/json");
  if (req.method === "POST") { if (path.includes("test-email")) return res.end(JSON.stringify({ ok: false, to: "z.yusuf@agency.gov.ng", message: "403 {\"message\":\"The gmail.com domain is not verified. Please, add and verify your domain on https://resend.com/domains\"}" })); if (path.includes("revoke")) { res.statusCode = 409; return res.end(JSON.stringify({ message: "This phone was already signed out." })); } return res.end("{}"); }
  if (path.includes("methods")) return res.end(JSON.stringify({ oidc: false, email: true, dev: false }));
  if (path.includes("register/options")) return res.end(JSON.stringify({ available: false, jurisdictions: [], consoleSignIn: true }));
  if (!key && !/^\/v1\/(inspections|facilities|certificates|instrument-versions)\//.test(path)) { res.statusCode = 404; return res.end(JSON.stringify({ message: "not mocked: " + path })); }
  if (path.startsWith("/v1/inspections/")) return res.end(JSON.stringify(detail));
  if (path.startsWith("/v1/facilities/")) return res.end(JSON.stringify(facilityDetail(path.split("/").pop())));
  if (path.startsWith("/v1/certificates/")) return res.end(JSON.stringify(certificate));
  if (path.endsWith("/changes")) return res.end(JSON.stringify({ from: "v3.1", changes: [{ kind: "reworded", ref: "1.2", detail: "Stack heights are within the safe limit (was: Stacks are stable)" }, { kind: "added", ref: "5.2", detail: "Emergency exits are clear" }, { kind: "reweighted", ref: "2.1", detail: "Weight 2 to 3" }] }));
  if (path.startsWith("/v1/instrument-versions/")) return res.end(JSON.stringify(version));
  res.end(JSON.stringify(routes[key]()));
}).listen(Number(process.env.STUB_PORT ?? 3001), () => console.log("stub gateway up"));
