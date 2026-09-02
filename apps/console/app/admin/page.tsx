import { get, type DeviceRow, type UserRow } from "../../lib/api";
import { Badge, Button, Card, Cell, Empty, Row, Table } from "../../components/ui";
import { formatDate, formatDateTime } from "../../lib/format";
import { enrollDevice, revokeDevice } from "./actions";

// Users, roles, and devices. Enrolling a device is what makes field attribution
// cryptographic rather than clerical: from that point the server can prove which
// device authored an event, and the device cannot repudiate it.

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

  const inspectors = users.filter((u) => u.roles.includes("inspector"));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-ink">Users and devices</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Roles are scoped to this jurisdiction and evaluated on the server for every request.
        </p>
      </header>

      <Card title="Users" subtitle={`${users.length} in this jurisdiction`}>
        <Table
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
                      <Badge key={r} tone="quiet">
                        {ROLE_LABEL[r] ?? r}
                      </Badge>
                    ))
                  )}
                </div>
              </Cell>
              <Cell>
                {u.status === "active" ? (
                  <Badge tone="primary">Active</Badge>
                ) : (
                  <Badge tone="quiet">Suspended</Badge>
                )}
              </Cell>
              <Cell className="text-ink-muted">{formatDate(u.created_at)}</Cell>
            </Row>
          ))}
        </Table>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Enrol a device" className="lg:col-span-1">
          <p className="mb-4 text-sm text-ink-muted">
            The device generates its own keypair and keeps the private half in its Keystore,
            where it cannot be exported. Enrolment registers only the public half, which is what
            verifies the signature on every event that device authors.
          </p>
          <form action={enrollDevice} className="space-y-3">
            <label className="block text-sm">
              <span className="text-ink-muted">Assign to</span>
              <select
                name="assignedUserId"
                required
                className="mt-1 w-full rounded-[12px] border border-line px-3 py-2 text-sm"
              >
                {inspectors.length === 0 && <option value="">No inspector available</option>}
                {inspectors.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-ink-muted">Label</span>
              <input
                name="label"
                placeholder="Field tablet 04"
                className="mt-1 w-full rounded-[12px] border border-line px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="text-ink-muted">Public key (base64)</span>
              <textarea
                name="publicKeyBase64"
                required
                rows={3}
                placeholder="Shown by the device on its enrolment screen"
                className="mt-1 w-full rounded-[12px] border border-line px-3 py-2 font-mono text-xs"
              />
            </label>
            <Button disabled={inspectors.length === 0}>Enrol device</Button>
          </form>
        </Card>

        <Card title="Devices" className="lg:col-span-2">
          <Table
            head={["Label", "Assigned to", "Enrolled", "Events", "Status", ""]}
            empty={
              devices.length === 0 ? <Empty>No device has been enrolled yet.</Empty> : undefined
            }
          >
            {devices.map((d) => (
              <Row key={d.id}>
                <Cell>
                  <span className="font-medium">{d.label ?? "Unlabelled"}</span>
                  <p className="break-all font-mono text-[10px] text-ink-muted">
                    {d.public_key.slice(0, 24)}…
                  </p>
                </Cell>
                <Cell className="text-ink-muted">{d.assigned_to ?? "—"}</Cell>
                <Cell className="text-ink-muted">{formatDate(d.enrolled_at)}</Cell>
                <Cell className="tabular-nums">{d.events_authored}</Cell>
                <Cell>
                  {d.status === "active" ? (
                    <Badge tone="primary">Active</Badge>
                  ) : (
                    <div>
                      <Badge tone="quiet">Revoked</Badge>
                      <p className="mt-1 text-xs text-ink-muted">
                        {formatDateTime(d.revoked_at)}
                      </p>
                    </div>
                  )}
                </Cell>
                <Cell>
                  {d.status === "active" && (
                    <form action={revokeDevice.bind(null, d.id)} className="space-y-2">
                      <input
                        name="reason"
                        required
                        placeholder="Reason"
                        aria-label={`Reason for revoking ${d.label ?? "device"}`}
                        className="w-32 rounded-[12px] border border-line px-2 py-1 text-xs"
                      />
                      <Button variant="quiet">Revoke</Button>
                    </form>
                  )}
                </Cell>
              </Row>
            ))}
          </Table>
          <p className="mt-4 text-xs text-ink-muted">
            Revoking a device stops the server accepting anything new signed with its key. Every
            event it already authored stays valid and stays attributed: it was signed by a key
            the regulator trusted at the time, and rewriting that would be the tampering the
            hash chain exists to prevent.
          </p>
        </Card>
      </div>
    </div>
  );
}
