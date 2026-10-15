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
      Promise.all([identity(), inspectorId()]).then(([id, who]) => {
        if (!id.deviceId || !who) router.replace("/activate");
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]),
  );

  useEffect(() => {
    if (sync.phase === "sent") load();
  }, [sync.phase, sync.lastSentAt, load]);

  function loadSampleDay() {
    setNote(null);
    try {
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
      const store = getStore();
      const jurisdictionCode = store.jurisdictionCode();
      if (!jurisdictionCode) {
        setNote(
          "This phone has not received its day list yet. Connect once so the visits can download, then try again.",
        );
        return;
      }
      const { inspection } = await inspectionSession(userId);
      const started = await inspection.start({
        facilityId: row.id,
        jurisdictionCode,
        at: await currentPosition(),
      });
      if (started.checkin.flagged) setNote(t("checkinFar"));
      router.push(`/inspection/${started.inspectionId}`);
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      load();
    }
  }

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
      ) : total > 0 ? (
        <View style={[styles.card, { gap: 12 }]}>
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
          {sync.phase === "notReady" ? null : (
            <>
              <View style={styles.divider} />
              <SendStatus sync={sync} t={t} embedded />
            </>
          )}
        </View>
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
          <View style={[styles.rowBetween, { alignItems: "flex-start" }]}>
            <Text style={[styles.h2, { flexShrink: 1 }]}>{row.name}</Text>
            {row.submitted ? null : (
              <View
                style={[
                  styles.chip,
                  { backgroundColor: row.open ? colors.cautionTint : colors.surfaceSunk },
                ]}
              >
                <View style={[styles.chipDot, { backgroundColor: row.open ? colors.caution : colors.inkFaint }]} />
                <Text style={[styles.chipText, { color: row.open ? colors.caution : colors.inkMuted }]}>
                  {t(row.open ? "statusInProgress" : "statusNotStarted")}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.muted}>
            {row.licenceNumber} · {facilityType(row.facilityType)}
            {row.lga ? ` · ${row.lga}` : ""}
          </Text>

          {row.assignmentReason ? (
            <View style={styles.reasonBlock}>
              <Text style={styles.overline}>{t("whyThisVisit")}</Text>
              <Text style={styles.body}>{row.assignmentReason}</Text>
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

function SendStatus({ sync, t, embedded = false }: { sync: SyncStatus; t: (k: StringKey) => string; embedded?: boolean }) {
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
    <View style={embedded ? { gap: 4 } : [styles.banner, waiting || sending ? null : styles.bannerQuiet]}>
      <View style={styles.rowBetween}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 }}>
          {sending ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <View style={[styles.statusDot, { backgroundColor: tone }]} />
          )}
          <Text style={embedded ? styles.body : styles.h2}>{title}</Text>
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
