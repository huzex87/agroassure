import type { SetupProgress } from "./api";

// What the getting-started list says, and when each step counts as done. Kept
// apart from the component that draws it so the rules can be tested without a
// browser: each step ticks itself from the record, never from a click.

export interface Step {
  title: string;
  detail: string;
  done: boolean;
  href: string;
  action: string;
}

export function setupSteps(p: SetupProgress): Step[] {
  return [
    {
      title: "Add your facilities",
      detail:
        p.facilities > 0
          ? `${p.facilities} ${p.facilities === 1 ? "facility" : "facilities"} in the registry`
          : "Import the spreadsheet you already keep, or add them one at a time",
      done: p.facilities > 0,
      href: "/facilities/new?tab=import",
      action: "Import facilities",
    },
    {
      title: "Check your checklists",
      detail:
        p.checklistsInForce > 0
          ? `Checklists ready for ${p.checklistsInForce} of 4 facility types`
          : "Publish the questions inspectors will answer on site",
      done: p.checklistsInForce > 0,
      href: "/instruments",
      action: "Open checklists",
    },
    {
      title: "Invite your inspectors",
      detail:
        p.inspectorsWithPhone > 0
          ? `${p.inspectorsWithPhone} of ${p.inspectors} inspectors have a working phone`
          : p.invitesWaiting > 0
            ? `${p.invitesWaiting} ${p.invitesWaiting === 1 ? "invite" : "invites"} sent, waiting to be used`
            : "Send each one a code by SMS and email",
      done: p.inspectorsWithPhone > 0,
      href: "/team",
      action: "Invite inspectors",
    },
    {
      title: "Plan the first visits",
      detail:
        p.plannedVisits > 0
          ? `${p.plannedVisits} ${p.plannedVisits === 1 ? "visit" : "visits"} planned`
          : "Choose who goes where; visits appear on their phone",
      done: p.plannedVisits > 0 || p.submittedInspections > 0,
      href: "/plan",
      action: "Plan visits",
    },
  ];
}

