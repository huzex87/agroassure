import { Mail, MessageSquare } from "lucide-react";
import { get, tryGet, type DeviceRow, type InviteChannels, type Me, type RegistrationRow, type UserRow } from "../../lib/api";
import { Badge, Button, Panel, Cell, Empty, Row, DataTable, PageHeader } from "../../components/ui";
import { formatDate, formatDateTime } from "../../lib/format";
import { AddColleagueForm, InviteInspectorForm, ResendCodeButton } from "../../components/team/invite-form";
import { RequestCard } from "../../components/team/request-card";
import { approveDevice, cancelInvitation, revokeDevice } from "./actions";

// The team: who works here, in what role, and the phones inspectors use.
//
// Getting an inspector working is one form: their name and number. They get a
// code by SMS and email, type it into the app, and they are in — the invite was
// the approval, so there is nothing to come back and click. A phone's signing
// key is still what makes field attribution provable, but nobody on this page
// needs to see one. What an administrator needs is who is set up, who is not
// yet, and a way to cut a phone off when it goes missing.

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  inspector: "Inspector",
  desk_supervisor: "Desk supervisor",
  authorising_officer: "Authorising officer",
  state_admin: "State administrator",
  national_admin: "National administrator",
  auditor: "Auditor",
};

/** "3 hours ago", for when a phone was last heard from. */
function ago(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return days < 30 ? `${days} day${days === 1 ? "" : "s"} ago` : formatDate(iso);
}

function ChannelDot({ status, icon, label }: { status?: string | null; icon: React.ReactNode; label: string }) {
  if (!status) return null;
  const tone =
    status === "sent" ? "text-success" : status === "failed" ? "text-destructive" : "text-ink-faint";
  const word = status === "sent" ? "sent" : status === "failed" ? "failed" : "not sent";
  return (
    <span className={`inline-flex items-center gap-1 ${tone}`} title={`${label} ${word}`}>
      {icon}
      <span className="sr-only">
        {label} {word}
      </span>
    </span>
  );
}

/** Where this person's phone stands, in one line and a badge. */
function PhoneStatus({ user }: { user: UserRow }) {
  if (!user.roles.includes("inspector")) {
    return <span className="text-xs text-ink-faint">Console only</span>;
  }
  if ((user.active_phones ?? 0) > 0) {
    const seen = ago(user.phone_last_seen_at);
    return (
      <div>
        <Badge variant="success" dot>Phone active</Badge>
        <p className="mt-1 text-xs text-ink-muted">{seen ? `Last seen ${seen}` : "Not seen yet"}</p>
      </div>
    );
  }
  if (user.invitation_id) {
    const expired = user.invitation_expires_at && new Date(user.invitation_expires_at) < new Date();
    return (
      <div>
        {expired ? (
          <Badge variant="destructive" dot>Invite expired</Badge>
        ) : (
          <Badge variant="warning" dot>Invite sent</Badge>
        )}
        <p className="mt-1 flex items-center gap-2 text-xs text-ink-muted">
          {!expired && user.invitation_expires_at ? <span>Until {formatDateTime(user.invitation_expires_at)}</span> : null}
          <ChannelDot status={user.invitation_sms_status} icon={<MessageSquare className="size-3.5" aria-hidden />} label="SMS" />
          <ChannelDot status={user.invitation_email_status} icon={<Mail className="size-3.5" aria-hidden />} label="Email" />
        </p>
      </div>
    );
  }
  return <Badge variant="secondary">Not set up</Badge>;
}

const STEPS: Array<[string, string]> = [
  ["Invite", "Enter the inspector's name and phone number. They get a code by SMS and email."],
  ["Enter the code", "They install the AgroAssure app and type the code — or tap the link, or scan the QR code."],
  ["Start inspecting", "The phone is ready straight away. Assigned visits appear on it automatically."],
];

export default async function TeamPage() {
  const [users, devices, channels, requests, me] = await Promise.all([
    get<UserRow[]>("/v1/users"),
    get<DeviceRow[]>("/v1/devices"),
    // Only administrators may ask; anyone else simply gets the generic wording.
    get<InviteChannels>("/v1/invitations/channels").catch(() => null),
    // Likewise the queue of people asking to join: administrators only.
    tryGet<RegistrationRow[]>("/v1/registrations"),
    tryGet<Me>("/v1/me"),
  ]);
  const waitingToJoin = requests ?? [];

  const inspectors = users.filter((u) => u.roles.includes("inspector"));
  const ready = inspectors.filter((u) => (u.active_phones ?? 0) > 0).length;
  const waiting = inspectors.filter((u) => (u.active_phones ?? 0) === 0 && u.invitation_id).length;

  return (
    <>
      <PageHeader
        title="Team"
        summary={
          <>
            {users.length} {users.length === 1 ? "person" : "people"} · {ready} of {inspectors.length}{" "}
            inspectors have a working phone{waiting > 0 ? ` · ${waiting} invite${waiting === 1 ? "" : "s"} waiting` : ""}
          </>
        }
      />

      {waitingToJoin.length > 0 ? (
        <div id="requests" className="scroll-mt-20">
        <Panel
          title={`Requests to join · ${waitingToJoin.length}`}
          subtitle="These people confirmed their email and phone. Choose a role and approve, or reject."
        >
          <ul className="space-y-3">
            {waitingToJoin.map((r) => (
              <RequestCard key={r.id} request={r} canGrantNational={me?.roles.includes("national_admin") ?? false} />
            ))}
          </ul>
        </Panel>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-5">
        <Panel
          title="Invite an inspector"
          subtitle="They'll be able to inspect from their phone in a couple of minutes."
          className="lg:col-span-2"
        >
          <InviteInspectorForm channels={channels} />
        </Panel>

        <Panel title="How phone setup works" className="lg:col-span-3">
          <ol className="grid gap-4 sm:grid-cols-3">
            {STEPS.map(([title, body], i) => (
              <li key={title} className="rounded-control border border-line bg-surface-sunk p-4">
                <span className="grid size-7 place-items-center rounded-full bg-primary text-sm font-semibold text-white shadow-raised">
                  {i + 1}
                </span>
                <p className="mt-3 text-sm font-semibold text-ink">{title}</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">{body}</p>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs leading-relaxed text-ink-muted">
            Each code works once and expires after a few days. Sending a new code cancels the old one.
            Every inspection is still signed by the phone it was done on, so the record always shows
            who did it and where.
          </p>
        </Panel>
      </div>

      <Panel title="People" subtitle="Everyone with access in this state" flush>
        <DataTable
          head={["Name", "Role", "Phone app", ""]}
          empty={users.length === 0 ? <Empty>Nobody has been added yet. Start by inviting an inspector.</Empty> : undefined}
        >
          {users.map((u) => {
            const isInspector = u.roles.includes("inspector");
            const hasPhone = (u.active_phones ?? 0) > 0;
            return (
              <Row key={u.id}>
                <Cell>
                  <p className="font-medium text-ink">{u.full_name}</p>
                  <p className="text-xs text-ink-muted">
                    {[u.phone, u.email].filter(Boolean).join(" · ") || "No contact details"}
                  </p>
                  {u.status !== "active" ? (
                    <Badge variant="warning" dot className="mt-1">Suspended</Badge>
                  ) : null}
                </Cell>
                <Cell>
                  <div className="flex flex-wrap gap-1">
                    {u.roles.length === 0 ? (
                      <span className="text-ink-muted">No role</span>
                    ) : (
                      u.roles.map((r) => (
                        <Badge key={r} variant="secondary">
                          {ROLE_LABEL[r] ?? r}
                        </Badge>
                      ))
                    )}
                  </div>
                </Cell>
                <Cell>
                  <PhoneStatus user={u} />
                </Cell>
                <Cell>
                  {isInspector && u.status === "active" ? (
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <ResendCodeButton
                        userId={u.id}
                        label={hasPhone ? "Set up another phone" : u.invitation_id ? "Send new code" : "Send invite"}
                      />
                      {u.invitation_id && !hasPhone ? (
                        <form action={cancelInvitation.bind(null, u.invitation_id)}>
                          <button
                            type="submit"
                            className="h-8 rounded-control px-2.5 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-sunk hover:text-destructive"
                          >
                            Cancel invite
                          </button>
                        </form>
                      ) : null}
                    </div>
                  ) : null}
                </Cell>
              </Row>
            );
          })}
        </DataTable>
      </Panel>

      <Panel
        title="Phones"
        subtitle="Each inspector's phone signs their work, so every inspection shows who did it and on which phone."
        flush
      >
        <DataTable
          head={["Phone", "Inspector", "Last seen", "Records sent", "Status", ""]}
          empty={devices.length === 0 ? <Empty>No phone has been set up yet.</Empty> : undefined}
        >
          {devices.map((d) => (
            <Row key={d.id}>
              <Cell>
                <p className="font-medium">{d.label ?? "Phone"}</p>
                <p className="text-xs text-ink-muted">Since {formatDate(d.enrolled_at)}</p>
              </Cell>
              <Cell className="text-ink-muted">{d.assigned_to ?? "—"}</Cell>
              <Cell className="text-ink-muted">{ago(d.last_seen_at) ?? "—"}</Cell>
              <Cell className="tabular-nums">{d.events_authored}</Cell>
              <Cell>
                {d.status === "active" ? (
                  <Badge variant="success" dot>Active</Badge>
                ) : d.status === "pending" ? (
                  <Badge variant="warning" dot>Needs confirming</Badge>
                ) : (
                  <div>
                    <Badge variant="destructive" dot>Signed out</Badge>
                    <p className="mt-1 text-xs text-ink-muted">{formatDateTime(d.revoked_at)}</p>
                  </div>
                )}
              </Cell>
              <Cell>
                {/* Only phones set up the old way can be waiting here; an
                    invited phone is active the moment its code is used. */}
                {d.status === "pending" && (
                  <form action={approveDevice.bind(null, d.id)}>
                    <Button size="sm">Confirm phone</Button>
                  </form>
                )}
                {d.status === "active" && (
                  <form action={revokeDevice.bind(null, d.id)} className="flex items-center justify-end gap-2">
                    <input
                      name="reason"
                      required
                      placeholder="Why? e.g. lost"
                      aria-label={`Reason for signing out ${d.label ?? "this phone"}`}
                      className="field w-36 py-1.5 text-xs"
                    />
                    <Button variant="outline" size="sm">Sign out this phone</Button>
                  </form>
                )}
              </Cell>
            </Row>
          ))}
        </DataTable>
        <p className="px-5 py-4 text-xs text-ink-muted">
          Lost or replaced a phone? Sign it out and it stops working straight away. Work it
          already sent stays on record and stays credited to the inspector.
        </p>
      </Panel>

      <Panel
        title="Add a colleague"
        subtitle="Supervisors, authorising officers and administrators use this console rather than the phone app."
      >
        <AddColleagueForm />
      </Panel>
    </>
  );
}
