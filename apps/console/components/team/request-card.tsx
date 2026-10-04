"use client";

import { useActionState, useState } from "react";
import { BadgeCheck, Globe, Mail, MapPin, Phone, Smartphone, X } from "lucide-react";
import type { RegistrationRow } from "../../lib/api";
import { approveRequest, rejectRequest, type FormState } from "../../app/team/actions";
import { ErrorNote, SubmitButton } from "../forms";
import { Button } from "../ui/button";

// One person asking to join, and the decision about them.
//
// Everything an administrator needs to recognise someone is on the card: who,
// both contacts with proof that each is really theirs, the state, and where
// they asked from. The role is the administrator's choice, not the
// registrant's; it starts at the likely answer so most approvals are one click.

const ROLES: Array<[string, string]> = [
  ["inspector", "Inspector (phone app)"],
  ["desk_supervisor", "Desk supervisor"],
  ["authorising_officer", "Authorising officer"],
  ["state_admin", "State administrator"],
  ["auditor", "Auditor"],
  ["national_admin", "National administrator"],
];

const IDLE: FormState = { status: "idle" };

function when(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]![0] ?? "") : "")).toUpperCase() || "?";
}

function Contact({ icon, value, verified }: { icon: React.ReactNode; value: string; verified: boolean }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-sm text-ink-muted">
      {icon}
      <span className="truncate">{value}</span>
      {verified ? (
        <BadgeCheck className="size-4 shrink-0 text-success" aria-label="confirmed" />
      ) : null}
    </span>
  );
}

export function RequestCard({ request, canGrantNational }: { request: RegistrationRow; canGrantNational: boolean }) {
  const [role, setRole] = useState(request.kind === "inspector" ? "inspector" : "desk_supervisor");
  const [rejecting, setRejecting] = useState(false);
  const [approved, approve] = useActionState(approveRequest.bind(null, request.id), IDLE);
  const [rejected, reject] = useActionState(rejectRequest.bind(null, request.id), IDLE);
  const roles = ROLES.filter(([value]) => canGrantNational || value !== "national_admin");
  const error = approved.status === "error" ? approved.message : rejected.status === "error" ? rejected.message : null;

  return (
    <li className="rounded-card border border-line bg-surface p-4 shadow-xs sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 gap-3">
          <span
            aria-hidden
            className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-50 text-sm font-semibold text-primary-700 ring-1 ring-inset ring-primary-100"
          >
            {initials(request.full_name)}
          </span>
          <div className="min-w-0 space-y-1.5">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-semibold text-ink">{request.full_name}</span>
              <span className="text-xs text-ink-faint">asked {when(request.created_at)}</span>
            </p>
            <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:gap-x-4">
              <Contact icon={<Mail className="size-3.5 shrink-0" aria-hidden />} value={request.email} verified={Boolean(request.email_verified_at)} />
              <Contact icon={<Phone className="size-3.5 shrink-0" aria-hidden />} value={request.phone} verified={Boolean(request.phone_verified_at)} />
            </div>
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden /> {request.jurisdiction_name}
              </span>
              {request.brings_phone ? (
                <span className="inline-flex items-center gap-1">
                  <Smartphone className="size-3.5" aria-hidden /> Registered in the phone app
                </span>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <Globe className="size-3.5" aria-hidden /> Registered on the website
                </span>
              )}
            </p>
          </div>
        </div>

        {rejecting ? (
          <form action={reject} className="flex w-full flex-col gap-2 lg:w-80">
            <label className="text-sm">
              <span className="font-medium text-ink">Reason</span>
              <span className="ml-1.5 text-xs text-ink-faint">optional — sent to them</span>
              <input name="reason" maxLength={500} autoFocus placeholder="e.g. Not on our staff list" className="field mt-1.5 w-full" />
            </label>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" size="lg" className="flex-1" onClick={() => setRejecting(false)}>
                Cancel
              </Button>
              <SubmitButton variant="destructive" className="flex-1" pendingText="Rejecting…">
                Reject
              </SubmitButton>
            </div>
          </form>
        ) : (
          <form action={approve} className="flex w-full flex-col gap-2 lg:w-80">
            <label className="text-sm">
              <span className="font-medium text-ink">Role</span>
              <select name="role" value={role} onChange={(e) => setRole(e.target.value)} className="field mt-1.5 w-full">
                {roles.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {request.brings_phone && role === "inspector" ? (
              <p className="text-xs text-ink-muted">Their phone starts working as soon as you approve.</p>
            ) : request.brings_phone ? (
              <p className="text-xs text-warning">Only inspectors use the phone app — they&rsquo;ll sign in to this console instead.</p>
            ) : role === "inspector" ? (
              <p className="text-xs text-ink-muted">We&rsquo;ll text and email them a code to set up the phone app.</p>
            ) : (
              <p className="text-xs text-ink-muted">They&rsquo;ll sign in to this console with their email.</p>
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="lg"
                className="hover:border-destructive-border hover:bg-destructive-muted hover:text-destructive"
                onClick={() => setRejecting(true)}
              >
                <X aria-hidden /> Reject
              </Button>
              <div className="flex-1">
                <SubmitButton pendingText="Approving…">Approve</SubmitButton>
              </div>
            </div>
          </form>
        )}
      </div>
      {error ? (
        <div className="mt-3">
          <ErrorNote message={error} />
        </div>
      ) : null}
    </li>
  );
}
