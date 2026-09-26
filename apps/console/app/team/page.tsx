import { get, type DeviceRow, type UserRow } from "../../lib/api";
import { Badge, Button, Panel, Cell, Empty, Row, DataTable, PageHeader } from "../../components/ui";
import { formatDate, formatDateTime } from "../../lib/format";
import { approveDevice, revokeDevice } from "./actions";

// The team: who works here, in what role, and the phones inspectors use.
//
// A phone's signing key is what makes field attribution provable rather than
// clerical, but nobody on this page needs to see one. What an administrator
// needs is who is on the team, which phones are working, and a way to cut one
// off when it goes missing.

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  inspector: "Inspector",
  desk_supervisor: "Desk Supervisor",
  authorising_officer: "Authorising Officer",
  state_admin: "State Administrator",
  national_admin: "National Administrator",
  auditor: "Auditor",
};

export default async function AdminPage() {
  const [users, devices] = await Promise.all([
    get<UserRow[]>("/v1/users"),
    get<DeviceRow[]>("/v1/devices"),
  ]);

  return (
    <>
      <PageHeader
        title="Team"
        summary="Everyone with access in this state, and the phones your inspectors use."
      />

      <Panel title="People" subtitle={`${users.length} on the team`}>
        <DataTable
          head={["Name", "Contact", "Roles", "Status", "Added"]}
          empty={users.length === 0 ? <Empty>No user has been created yet.</Empty> : undefined}
        >
          {users.map((u) => (
            <Row key={u.id}>
              <Cell className="font-medium">{u.full_name}</Cell>
              <Cell className="text-ink-muted">{u.email ?? u.phone ?? "—"}</Cell>
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
                {u.status === "active" ? (
                  <Badge variant="success" dot>Active</Badge>
                ) : (
                  <Badge variant="warning" dot>Suspended</Badge>
                )}
              </Cell>
              <Cell className="text-ink-muted">{formatDate(u.created_at)}</Cell>
            </Row>
          ))}
        </DataTable>
      </Panel>

      <Panel
        title="Phones"
        subtitle="Each inspector's phone signs their work, so every inspection shows who did it and on which phone."
      >
        <DataTable
          head={["Phone", "Inspector", "Since", "Records sent", "Status", ""]}
          empty={
            devices.length === 0 ? (
              <Empty>No phone has been set up yet.</Empty>
            ) : undefined
          }
        >
          {devices.map((d) => (
            <Row key={d.id}>
              <Cell className="font-medium">{d.label ?? "Phone"}</Cell>
              <Cell className="text-ink-muted">{d.assigned_to ?? "—"}</Cell>
              <Cell className="text-ink-muted">{formatDate(d.enrolled_at)}</Cell>
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
                {/* Confirming a phone is the moment its work is accepted, so
                    it is a deliberate act by a named administrator. */}
                {d.status === "pending" && (
                  <form action={approveDevice.bind(null, d.id)}>
                    <Button>Confirm phone</Button>
                  </form>
                )}
                {d.status === "active" && (
                  <form action={revokeDevice.bind(null, d.id)} className="flex items-center gap-2">
                    <input
                      name="reason"
                      required
                      placeholder="Why? e.g. lost"
                      aria-label={`Reason for signing out ${d.label ?? "this phone"}`}
                      className="field w-36 py-1.5 text-xs"
                    />
                    <Button variant="outline">Sign out remotely</Button>
                  </form>
                )}
              </Cell>
            </Row>
          ))}
        </DataTable>
        <p className="mt-4 text-xs text-ink-muted">
          Lost or replaced a phone? Sign it out remotely and it can send nothing more. Work it
          already sent stays on record and stays credited to the inspector.
        </p>
      </Panel>
    </>
  );
}
