import { useRouter } from "expo-router";
import { PinSetup } from "../src/finish-setup";

// Adding or changing the app PIN from Account. Same two steps as after setup;
// finishing or cancelling returns to Account.

export default function SetPin() {
  const router = useRouter();
  return <PinSetup onDone={() => router.back()} onCancel={() => router.back()} />;
}
