import Link from "next/link";
import { FileSpreadsheet, Plus } from "lucide-react";
import { PageHeader, Panel } from "../../../components/ui";
import { AddFacilityForm } from "../../../components/facilities/add-facility-form";
import { ImportSheet } from "../../../components/facilities/import-sheet";

// Getting facilities into the registry: one at a time, or a whole sheet.
// Most states start with the sheet they already keep, so that is offered as
// plainly as the form.

export const dynamic = "force-dynamic";

export default async function NewFacilityPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const importing = tab === "import";

  const tabClass = (on: boolean) =>
    `inline-flex items-center gap-2 rounded-control px-3.5 py-2 text-sm font-medium transition-colors ${
      on
        ? "bg-card text-primary-700 shadow-raised ring-1 ring-inset ring-primary-100"
        : "text-ink-muted hover:text-ink"
    }`;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Facilities", href: "/facilities" }, { label: "Add facilities" }]}
        title="Add facilities"
        summary="Put the premises you regulate into the registry, so inspectors can be sent to them."
      />

      <nav aria-label="How to add" className="inline-flex gap-1 rounded-card border border-line bg-surface-sunk p-1">
        <Link href="/facilities/new" aria-current={!importing ? "page" : undefined} className={tabClass(!importing)}>
          <Plus className="size-4" aria-hidden /> One facility
        </Link>
        <Link
          href="/facilities/new?tab=import"
          aria-current={importing ? "page" : undefined}
          className={tabClass(importing)}
        >
          <FileSpreadsheet className="size-4" aria-hidden /> Import a spreadsheet
        </Link>
      </nav>

      {importing ? (
        <Panel
          title="Import a spreadsheet"
          subtitle="Check every row first, then import the ones that are ready. Nothing is saved until you confirm."
        >
          <ImportSheet />
        </Panel>
      ) : (
        <Panel title="Add one facility">
          <AddFacilityForm />
        </Panel>
      )}
    </>
  );
}
