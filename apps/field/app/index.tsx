import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { applyBootstrap, drain, type AssignedFacility } from "@agroassure/field-core";
import { getStore } from "../src/db";
import { identity } from "../src/signer";
import { inspectorId, inspectionSession } from "../src/session";
import { currentPosition } from "../src/capture";
import { readFileBytes } from "../src/capture";
import { fetchBootstrap, httpTransport } from "../src/transport";
import { useLanguage } from "../src/i18n";
import { colors, styles } from "../src/theme";

// The day. Everything on this screen is read from the device's own database, so
// it renders identically with a full signal and with none. Sync is a button the
// inspector presses, not a thing that silently happens to their work: they are
// told what is queued and told when it has landed.

type Row = AssignedFacility & {
  open: { id: string; reference: string } | null;
  submitted: { id: string; ratingBand: string | null } | null;
  priorOpen: number;
};

export default function Today() {
  const router = useRouter();
  const { t, language, setLanguage } = useLanguage();
  const [rows, setRows] = useState<Row[]>([]);
  const [queued, setQueued] = useState(0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [enrolled, setEnrolled] = useState(true);

  const load = useCallback(() => {
    const store = getStore();
    setRows(
      store.facilities().map((f) => ({
        ...f,
        open: store.openInspectionFor(f.id),
        submitted: store.submittedInspectionFor(f.id),
        priorOpen: store.priorFindings(f.id).length,
      })),
    );
    setQueued(store.pendingCount());
  }, []);

  useFocusEffect(
    useCallback(() => {
      identity().then((id) => setEnrolled(Boolean(id.deviceId)));
      load();
    }, [load]),
  );

  async function sync() {
    setBusy(true);
    setNote(null);
    try {
      const store = getStore();
      const id = await identity();
      if (!id.deviceId) {
        router.push("/enrol");
        return;
      }
      // Push first. Work already done outranks work not yet collected: if the
      // signal drops halfway, the inspection is safe on the server and the
      // bundle can wait for the next attempt.
      const result = await drain(store, id.deviceId, {
        transport: httpTransport(),
        readFile: readFileBytes,
      });
      applyBootstrap(store, await fetchBootstrap());
      setNote(
        result.blocked
          ? result.blocked
          : `Sent ${result.eventsPushed}, uploaded ${result.evidenceUploaded}.`,
      );
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      load();
    }
  }

  function loadSampleDay() {
    setNote(null);
    try {
      // Required inside the handler rather than imported at the top so the
      // fixture is not part of the module graph a release build starts from.
      const { sampleBundle } = require("../src/dev-seed") as typeof import("../src/dev-seed");
      applyBootstrap(getStore(), sampleBundle());
      load();
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    }
  }

  async function open(row: Row) {
    if (row.submitted) return;
    if (row.open) return router.push(`/inspection/${row.open.id}`);

    setBusy(true);
    setNote(null);
    try {
      const userId = await inspectorId();
      if (!userId) {
        router.push("/enrol");
        return;
      }
      const { inspection } = await inspectionSession(userId);
      const started = await inspection.start({
        facilityId: row.id,
        jurisdictionCode: "KT",
        at: await currentPosition(),
      });
      // A check-in outside the geofence is recorded and flagged, never blocked.
      // Registered coordinates are often wrong; the inspector is standing there
      // and the supervisor can see the distance.
      if (started.checkin.flagged) setNote(t("checkinFar"));
      router.push(`/inspection/${started.inspectionId}`);
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      load();
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.banner}>
        <Text style={styles.h2}>
          {queued > 0 ? `${queued} ${t("queued")}` : t("online")}
        </Text>
        <Text style={styles.muted}>{t("nothingLost")}</Text>
        <Pressable
          style={[styles.button, { marginTop: 8 }]}
          onPress={sync}
          disabled={busy}
          accessibilityRole="button"
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>{t("syncNow")}</Text>
          )}
        </Pressable>
      </View>

      {note ? (
        <View style={[styles.card, { borderColor: colors.primary }]}>
          <Text style={styles.body}>{note}</Text>
        </View>
      ) : null}

      {!enrolled ? (
        <Pressable style={styles.card} onPress={() => router.push("/enrol")}>
          <Text style={styles.h2}>{t("enrolTitle")}</Text>
          <Text style={styles.muted}>{t("enrolBody")}</Text>
        </Pressable>
      ) : null}

      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={styles.h1}>{t("todaysVisits")}</Text>
        <Pressable
          onPress={() => setLanguage(language === "en" ? "ha" : "en")}
          style={styles.pill}
          accessibilityRole="button"
        >
          <Text style={styles.pillText}>{t("language")}</Text>
        </Pressable>
      </View>

      {rows.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.body}>{t("noVisits")}</Text>

          {/* Development only. A day's work normally arrives by sync; this puts
              a bundle straight into the device store so the field path can be
              walked on a handset with no server. __DEV__ is false in a release
              build, so this control cannot ship. */}
          {__DEV__ ? (
            <Pressable
              style={[styles.button, styles.buttonQuiet]}
              onPress={loadSampleDay}
              accessibilityRole="button"
            >
              <Text style={[styles.buttonText, styles.buttonQuietText]}>
                Load a sample day (development only)
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {rows.map((row) => (
        <Pressable key={row.id} style={styles.card} onPress={() => open(row)}>
          <Text style={styles.h2}>{row.name}</Text>
          <Text style={styles.muted}>
            {row.licenceNumber} · {row.facilityType.replace(/_/g, " ")}
            {row.lga ? ` · ${row.lga}` : ""}
          </Text>

          {/* Why this facility, in words. An inspector is never handed a list
              they cannot account for. */}
          {row.assignmentReason ? (
            <View style={styles.banner}>
              <Text style={styles.muted}>{row.assignmentReason}</Text>
            </View>
          ) : null}

          {row.priorOpen > 0 ? (
            <Text style={[styles.muted, { color: colors.warn }]}>
              {row.priorOpen} {t("priorFindings")}
            </Text>
          ) : null}

          <View style={styles.divider} />
          <Text style={[styles.body, { color: colors.primaryDark, fontWeight: "600" }]}>
            {row.submitted
              ? `${t("signOff")} · ${row.submitted.ratingBand ?? ""}`
              : row.open
                ? `${t("continueInspection")} · ${row.open.reference}`
                : t("startInspection")}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
