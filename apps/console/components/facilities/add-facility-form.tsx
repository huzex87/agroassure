"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { MapPin, Plus } from "lucide-react";
import { addFacility, type AddFacilityState } from "../../app/facilities/actions";
import { ErrorNote, Field, SubmitButton, SuccessNote } from "../forms";

// One facility, typed in. Everything but the name, licence and type is
// optional: a paper registry rarely has coordinates, and a facility with none
// can still be visited — the inspector's check-in records where it really is.

const TYPES: Array<[string, string, string]> = [
  ["agro_dealer", "Agro-dealer", "Sells or stores fertilizer"],
  ["blending_plant", "Blending plant", "Processes and blends"],
  ["manufacturing", "Manufacturer", "Produces fertilizer"],
  ["importer", "Importer", "Brings fertilizer into the country"],
];

export function AddFacilityForm() {
  const [state, action] = useActionState<AddFacilityState, FormData>(addFacility, { status: "idle" });
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "added") form.current?.reset();
  }, [state]);

  return (
    <form ref={form} action={action} className="space-y-5">
      {state.status === "added" ? (
        <SuccessNote>
          <strong>{state.name}</strong> is in the registry.{" "}
          <Link href={`/facilities/${state.id}`} className="font-semibold underline underline-offset-2">
            View it
          </Link>{" "}
          or add another below.
        </SuccessNote>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Business name">
          <input name="name" required autoComplete="off" placeholder="Rimin Zakara Agro Ventures Ltd" className="field w-full" />
        </Field>
        <Field label="Licence number">
          <input name="licenceNumber" required autoComplete="off" placeholder="FISS/KT/AD/2026/0417" className="field w-full font-mono" />
        </Field>
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-ink">Type of facility</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {TYPES.map(([value, title, description], i) => (
            <label
              key={value}
              className="flex cursor-pointer items-start gap-2.5 rounded-control border border-line px-3 py-2.5 transition-colors hover:bg-surface-sunk has-[:checked]:border-primary-200 has-[:checked]:bg-primary-50"
            >
              <input type="radio" name="facilityType" value={value} defaultChecked={i === 0} className="mt-1 accent-[var(--primary)]" />
              <span>
                <span className="block text-sm font-medium text-ink">{title}</span>
                <span className="block text-xs text-ink-muted">{description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Local government area" hint="optional">
          <input name="lga" autoComplete="off" placeholder="Katsina" className="field w-full" />
        </Field>
        <Field label="Address" hint="optional">
          <input name="address" autoComplete="off" placeholder="12 Kofar Soro Road" className="field w-full" />
        </Field>
        <Field label="Owner or manager" hint="optional">
          <input name="ownerName" autoComplete="off" className="field w-full" />
        </Field>
        <Field label="Owner's phone" hint="optional">
          <input name="ownerPhone" type="tel" inputMode="tel" autoComplete="off" className="field w-full" />
        </Field>
      </div>

      <div className="rounded-control border border-line bg-surface-sunk p-4">
        <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
          <MapPin className="size-4 text-primary" aria-hidden /> Location
          <span className="text-xs font-normal text-ink-faint">optional</span>
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          If you don&rsquo;t have coordinates, leave these empty. The inspector&rsquo;s first check-in records where the facility is.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Latitude">
            <input name="lat" inputMode="decimal" autoComplete="off" placeholder="12.98547" className="field w-full font-mono" />
          </Field>
          <Field label="Longitude">
            <input name="lng" inputMode="decimal" autoComplete="off" placeholder="7.61893" className="field w-full font-mono" />
          </Field>
        </div>
      </div>

      {state.status === "error" ? <ErrorNote message={state.message} /> : null}

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingText="Adding…" className="sm:w-56">
          <Plus className="size-4" aria-hidden /> Add facility
        </SubmitButton>
        <Link href="/facilities" className="text-sm font-medium text-ink-muted hover:text-ink">
          Back to facilities
        </Link>
      </div>
    </form>
  );
}
