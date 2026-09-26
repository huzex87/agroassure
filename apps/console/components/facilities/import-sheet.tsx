"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { CircleAlert, CircleCheck, Download, FileSpreadsheet, RotateCw, Upload } from "lucide-react";
import { importFacilities, type ImportState } from "../../app/facilities/actions";
import {
  FACILITY_TEMPLATE_EXAMPLE,
  FACILITY_TEMPLATE_HEADERS,
  parseSheet,
  toCsv,
} from "../../lib/csv";
import { ErrorNote, SuccessNote } from "../forms";

// A whole registry from a spreadsheet, in three moves: choose the file, see
// what will happen to every row, import the ones that are ready.
//
// Nothing is written until the last step. The check runs on the server — the
// same rules the import uses — so what the preview promises is what happens.

const MAX_ROWS = 2000;

function downloadTemplate() {
  const csv = toCsv(FACILITY_TEMPLATE_HEADERS, [FACILITY_TEMPLATE_EXAMPLE]);
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "agroassure-facilities-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportSheet() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<Array<Record<string, string>>>([]);
  const [state, setState] = useState<ImportState>({ status: "idle" });
  const [problem, setProblem] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  function load(text: string, name: string) {
    setProblem(null);
    setState({ status: "idle" });
    setShowAll(false);
    const sheet = parseSheet(text);
    if (sheet.rows.length === 0) {
      setRows([]);
      setFileName(null);
      setProblem("That file has no rows under its heading row.");
      return;
    }
    if (sheet.rows.length > MAX_ROWS) {
      setRows([]);
      setFileName(null);
      setProblem(`That file has ${sheet.rows.length} rows. Import at most ${MAX_ROWS} at a time — split it into smaller files.`);
      return;
    }
    setRows(sheet.rows);
    setFileName(name);
    // Check straight away: there is nothing to decide before seeing the result.
    start(async () => setState(await importFacilities(sheet.rows, true)));
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (/\.xlsx?$/i.test(file.name)) {
      setProblem("That's an Excel file. In Excel choose File → Save As → CSV (Comma delimited), then choose the CSV here.");
      return;
    }
    load(await file.text(), file.name);
  }

  function reset() {
    setRows([]);
    setFileName(null);
    setState({ status: "idle" });
    setProblem(null);
    if (input.current) input.current.value = "";
  }

  const result = state.status === "checked" || state.status === "imported" ? state : null;
  const failures = result?.rows.filter((r) => r.errors.length > 0) ?? [];
  const shown = showAll ? result?.rows ?? [] : failures.length > 0 ? failures : (result?.rows ?? []).slice(0, 8);

  if (state.status === "imported") {
    return (
      <div className="space-y-4">
        <SuccessNote>
          <strong>
            {state.imported} {state.imported === 1 ? "facility" : "facilities"}
          </strong>{" "}
          added to the registry.
          {state.invalid > 0 ? ` ${state.invalid} ${state.invalid === 1 ? "row was" : "rows were"} left out — fix them in your sheet and import that file again; rows already added are recognised and skipped.` : ""}
        </SuccessNote>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/facilities"
            className="inline-flex h-10 items-center rounded-control bg-primary px-4 text-sm font-semibold text-white shadow-raised hover:bg-primary-600"
          >
            See the registry
          </Link>
          <Link
            href="/plan"
            className="inline-flex h-10 items-center rounded-control border border-line bg-card px-4 text-sm font-medium hover:bg-surface-sunk"
          >
            Plan the first visits
          </Link>
          <button type="button" onClick={reset} className="h-10 px-2 text-sm font-medium text-ink-muted hover:text-ink">
            Import another file
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {!fileName ? (
        <>
          <label
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void onFile(e.dataTransfer.files[0]);
            }}
            className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-card border-2 border-dashed border-line-firm bg-surface-sunk px-6 py-10 text-center transition-colors hover:border-primary-200 hover:bg-primary-50"
          >
            <span className="grid size-12 place-items-center rounded-full bg-card text-primary shadow-raised">
              <Upload className="size-5" aria-hidden />
            </span>
            <span>
              <span className="block text-sm font-semibold text-ink">Choose a CSV file, or drop it here</span>
              <span className="mt-1 block text-xs text-ink-muted">
                Saved from Excel or Google Sheets. The first row should be the column headings.
              </span>
            </span>
            <input
              ref={input}
              type="file"
              accept=".csv,text/csv,.tsv,text/tab-separated-values,.xlsx,.xls"
              className="sr-only"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
          </label>

          <div className="flex flex-wrap items-start justify-between gap-4 rounded-control border border-line p-4">
            <div className="max-w-xl text-sm">
              <p className="font-medium text-ink">What the sheet needs</p>
              <p className="mt-1 text-ink-muted">
                <strong className="text-ink">Name</strong>, <strong className="text-ink">Licence number</strong> and{" "}
                <strong className="text-ink">Type</strong> (Agro-dealer, Blending plant, Manufacturer or Importer).
                LGA, address, owner, phone and GPS are optional. Common column names such as
                &ldquo;Business name&rdquo; or &ldquo;Licence No.&rdquo; are recognised.
              </p>
            </div>
            <button
              type="button"
              onClick={downloadTemplate}
              className="inline-flex h-9 items-center gap-1.5 rounded-control border border-line bg-card px-3 text-sm font-medium shadow-xs hover:bg-surface-sunk"
            >
              <Download className="size-4" aria-hidden /> Download template
            </button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-line bg-surface-sunk px-4 py-3">
          <p className="flex items-center gap-2 text-sm">
            <FileSpreadsheet className="size-4 text-primary" aria-hidden />
            <span className="font-medium text-ink">{fileName}</span>
            <span className="text-ink-muted">· {rows.length} rows</span>
          </p>
          <button type="button" onClick={reset} className="text-sm font-medium text-ink-muted hover:text-ink">
            Choose a different file
          </button>
        </div>
      )}

      {problem ? <ErrorNote message={problem} /> : null}
      {state.status === "error" ? <ErrorNote message={state.message} /> : null}

      {pending && !result ? (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <RotateCw className="size-4 animate-spin" aria-hidden /> Checking {rows.length} rows…
        </p>
      ) : null}

      {result ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-control border border-success-border bg-success-muted px-4 py-3">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-success">
                <CircleCheck className="size-4" aria-hidden /> {result.valid} ready to import
              </p>
            </div>
            <div
              className={`rounded-control border px-4 py-3 ${result.invalid > 0 ? "border-destructive-border bg-destructive-muted" : "border-line bg-surface-sunk"}`}
            >
              <p className={`flex items-center gap-1.5 text-sm font-semibold ${result.invalid > 0 ? "text-destructive" : "text-ink-muted"}`}>
                <CircleAlert className="size-4" aria-hidden /> {result.invalid} need fixing
              </p>
            </div>
          </div>

          <div className="overflow-hidden rounded-control border border-line">
            <table className="w-full text-sm">
              <thead className="bg-surface-sunk text-left text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-ink-faint">
                <tr>
                  <th className="px-3 py-2">Row</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Licence</th>
                  <th className="px-3 py-2">Result</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.row} className="border-t border-line align-top">
                    <td className="px-3 py-2 tabular-nums text-ink-muted">{r.row}</td>
                    <td className="px-3 py-2 font-medium text-ink">{r.name || "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs text-ink-muted">{r.licenceNumber || "—"}</td>
                    <td className="px-3 py-2">
                      {r.errors.length === 0 ? (
                        <span className="inline-flex items-center gap-1 text-success">
                          <CircleCheck className="size-3.5" aria-hidden /> Ready
                        </span>
                      ) : (
                        <ul className="space-y-0.5 text-destructive">
                          {r.errors.map((e) => (
                            <li key={e}>{e}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {result.rows.length > shown.length ? (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="w-full border-t border-line bg-surface-sunk py-2 text-xs font-medium text-ink-muted hover:text-ink"
              >
                Show all {result.rows.length} rows
              </button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={pending || result.valid === 0}
              onClick={() => start(async () => setState(await importFacilities(rows, false)))}
              className="inline-flex h-10 items-center gap-2 rounded-control bg-primary px-4 text-sm font-semibold text-white shadow-raised transition-colors hover:bg-primary-600 disabled:opacity-60"
            >
              {pending ? <RotateCw className="size-4 animate-spin" aria-hidden /> : <Upload className="size-4" aria-hidden />}
              {pending
                ? "Importing…"
                : `Import ${result.valid} ${result.valid === 1 ? "facility" : "facilities"}`}
            </button>
            {result.invalid > 0 && result.valid > 0 ? (
              <p className="text-xs text-ink-muted">
                Rows that need fixing are left out. You can fix them and import the same file again later.
              </p>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
