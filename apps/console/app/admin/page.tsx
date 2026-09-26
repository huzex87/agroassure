import { redirect } from "next/navigation";

// "Users and devices" became "Team". The old address is kept so a bookmark or
// a link in an email written before the rename still lands somewhere useful.
export default function LegacyAdmin() {
  redirect("/team");
}
