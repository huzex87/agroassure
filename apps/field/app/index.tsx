import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { applyBootstrap, type AssignedFacility } from "@agroassure/field-core";
import { getStore } from "../src/db";
import { inspectorId, inspectorName, inspectionSession } from "../src/session";
import { identity } from "../src/signer";
import { currentPosition } from "../src/capture";
import { refreshQueued, syncNow, useAutoSync, type SyncStatus } from "../src/auto-sync";
import { useLanguage, type StringKey } from "../src/i18n";
import { chipTone, colors, styles } from "../src/theme";

// The day. Everything on this screen is read from the device's own database, so
// it renders identically with a full signal and with none.
//
// Sending happens on its own (see auto-sync). What this screen owes the
// inspector is the truth about it, in one line: everything is sent, or this
// many things are waiting and they are safe. The one thing an inspector must
// be able to trust here is that nothing they did has been lost.

type Row = AssignedFacility & {
  open: { id: string; reference: string } | null;
  submitted: { id: string; ratingBand: string | null } | null;
  priorOpen: number;
};

export default function Today() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, facilityType, ratingBand } = useLanguage();
  const sync = useAutoSync();
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);

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
    refreshQueued();
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      inspectorName().then(setName).catch(() => undefined);
      // A phone that has not been set up has nothing to show here. Go straight
      // to the one thing it can do: take an invite code.
      Promise.all([identity(), inspectorId()]).then(([id, who]) => {
        if (!id.deviceId || !who) router.replace("/activate");
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]),
  );

  // A finished send may have brought new visits with it.
  useEffect(() => {
    if (sync.phase === "sent") load();
  }, [sync.phase, sync.lastSentAt, load]);

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
        router.replace("/activate");
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

  // The day at a glance: who this is for, and how far through it they are. The
  // first thing an inspector wants on opening the app is "what is left", and a
  // list of cards makes them count.
  const total = rows.length;
  const finished = rows.filter((r) => r.submitted).length;
  const hour = new Date().getHours();
  const greeting = t(hour < 12 ? "greetMorning" : hour < 17 ? "greetAfternoon" : "greetEvening");
  const first = name?.trim().split(/\s+/)[0] ?? "";

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
      <View style={styles.rowBetween}>
        <View style={{ flexShrink: 1, gap: 2 }}>
          <Text style={styles.overline}>{first ? `${greeting}, ${first}` : greeting}</Text>
          <Text style={[styles.h1, { flexShrink: 1 }]}>{t("todaysVisits")}</Text>
        </View>
        <Pressable
          onPress={() => router.push("/account")}
          style={styles.pill}
          accessibilityRole="button"
          accessibilityLabel={t("account")}
        >
          <Text style={styles.pillText}>{t("account")}</Text>
        </Pressable>
      </View>

      {total > 0 ? (
        <View style={[styles.card, { gap: 10 }]}>
          <View style={styles.rowBetween}>
            <Text style={styles.h2}>
              {total} {t(total === 1 ? "visitsOne" : "visitsMany")}
            </Text>
            <Text style={styles.muted}>
              {finished} {t("visitsDone")}
            </Text>
          </View>
          <View style={styles.progressTrack} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: total, now: finished }}>
            <View style={[styles.progressFill, { width: `${(finished / total) * 100}%` }]} />
          </View>
          {finished === total ? <Text style={[styles.muted, { color: colors.good }]}>{t("allVisitsDone")}</Text> : null}
        </View>
      ) : null}

      {sync.phase === "signedOut" ? (
        <Pressable
          style={[styles.card, { borderColor: colors.critical }]}
          onPress={() => router.push("/activate")}
          accessibilityRole="button"
        >
          <Text style={styles.h2}>{t("signedOutTitle")}</Text>
          <Text style={styles.muted}>{t("signedOutBody")}</Text>
          <View style={styles.actionRow}>
            <Text style={styles.actionText}>{t("enterNewCode")}</Text>
            <Text style={styles.actionChevron}>›</Text>
          </View>
        </Pressable>
      ) : sync.phase === "notReady" ? null : (
        <SendStatus sync={sync} t={t} />
      )}

      {note ? (
        <View style={[styles.card, { borderColor: colors.primary }]}>
          <Text style={styles.body}>{note}</Text>
        </View>
      ) : null}

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
        <Pressable
          key={row.id}
          style={[styles.card, row.submitted ? styles.cardAnswered : null]}
          onPress={() => open(row)}
          disabled={Boolean(row.submitted) || busy}
          accessibilityRole="button"
        >
          <Text style={styles.h2}>{row.name}</Text>
          <Text style={styles.muted}>
            {row.licenceNumber} · {facilityType(row.facilityType)}
            {row.lga ? ` · ${row.lga}` : ""}
          </Text>

          {/* Why this facility, in words. An inspector is never handed a list
              they cannot account for. */}
          {row.assignmentReason ? (
            <View style={[styles.banner, styles.bannerQuiet]}>
              <Text style={styles.overline}>{t("whyThisVisit")}</Text>
              <Text style={styles.muted}>{row.assignmentReason}</Text>
            </View>
          ) : null}

          {row.priorOpen > 0 ? (
            <View style={[styles.chip, { backgroundColor: colors.cautionTint }]}>
              <View style={[styles.chipDot, { backgroundColor: colors.caution }]} />
              <Text style={[styles.chipText, { color: colors.caution }]}>
                {row.priorOpen} {t(row.priorOpen === 1 ? "priorFinding" : "priorFindings")}
              </Text>
            </View>
          ) : null}

          <View style={styles.divider} />

          {row.submitted ? (
            (() => {
              const band = row.submitted.ratingBand;
              const tone = chipTone(
                band === "satisfactory" ? "good" : band === "critical_issues" ? "critical" : band ? "caution" : "neutral",
              );
              return (
                <View style={[styles.chip, { backgroundColor: tone.bg }]}>
                  <View style={[styles.chipDot, { backgroundColor: tone.fg }]} />
                  <Text style={[styles.chipText, { color: tone.fg }]}>
                    {t("submitted")}
                    {band ? ` · ${ratingBand(band)}` : ""}
                  </Text>
                </View>
              );
            })()
          ) : (
            <View style={styles.actionRow}>
              <Text style={styles.actionText}>
                {row.open ? `${t("continueInspection")} · ${row.open.reference}` : t("startInspection")}
              </Text>
              <Text style={styles.actionChevron}>›</Text>
            </View>
          )}
        </Pressable>
      ))}
    </ScrollView>
  );
}

/**
 * One line about sending, and a way to hurry it.
 *
 * Green when there is nothing waiting, blue while it goes, amber when work is
 * waiting — and every state says in words that the work is safe, because the
 * colour alone would leave an inspector guessing whether amber means lost.
 */
function SendStatus({ sync, t }: { sync: SyncStatus; t: (k: StringKey) => string }) {
  const sending = sync.phase === "sending";
  const waiting = sync.queued > 0;
  const tone = sending ? colors.primary : waiting ? colors.caution : colors.good;

  const title = sending
    ? t("sending")
    : waiting
      ? `${sync.queued} ${t("waitingToSend")}`
      : t("allSent");
  const body = waiting
    ? sync.phase === "offline"
      ? t("noSignal")
      : t("savedOnPhone")
    : sync.lastSentAt
      ? `${t("lastSent")} ${sync.lastSentAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
      : null;

  return (
    <View style={[styles.banner, waiting || sending ? null : styles.bannerQuiet]}>
      <View style={styles.rowBetween}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 }}>
          {sending ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <View style={[styles.statusDot, { backgroundColor: tone }]} />
          )}
          <Text style={styles.h2}>{title}</Text>
        </View>
        {waiting && !sending ? (
          <Pressable
            onPress={() => void syncNow()}
            style={styles.pill}
            accessibilityRole="button"
          >
            <Text style={styles.pillText}>{t("sendNow")}</Text>
          </Pressable>
        ) : null}
      </View>
      {body ? <Text style={styles.muted}>{body}</Text> : null}
    </View>
  );
}
