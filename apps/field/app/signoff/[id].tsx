import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { FindingSeverity } from "@agroassure/domain";
import type { FieldInspection } from "@agroassure/field-core";
import { inspectionSession, inspectorId } from "../../src/session";
import { useLanguage } from "../../src/i18n";
import { colors, styles } from "../../src/theme";

// Sign-off, standing in the facility with the manager beside you. Both
// signatures are captured here and the rating is shown before either is given,
// because a person signing a compliance record is entitled to see what they are
// agreeing they were shown.
//
// Everything on this screen works with no connection. Nothing is sent; the
// events are written to the outbox and the visit is over.

export default function Signoff() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useLanguage();

  const [inspection, setInspection] = useState<FieldInspection | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [rating, setRating] = useState<{ percent: number; band: string } | null>(null);
  const [findings, setFindings] = useState<
    Array<{ checkpointRef: string; severity: FindingSeverity; summary: string }>
  >([]);
  const [missing, setMissing] = useState<string[]>([]);

  const [inspectorSignedAt, setInspectorSignedAt] = useState<string | null>(null);
  const [repName, setRepName] = useState("");
  const [repRole, setRepRole] = useState("");
  const [repSignedAt, setRepSignedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const load = useCallback(
    (session: FieldInspection) => {
      // One call, not two: rating() rescores the whole inspection each time.
      const scored = session.rating(String(id));
      setRating({ percent: scored.ratingPercent, band: scored.band });
      setFindings(session.provisionalFindings(String(id)));
      setMissing(session.unanswered(String(id)));
    },
    [id],
  );

  // Deliberately keyed on the inspection alone. router came from useRouter()
  // and is not guaranteed to be the same object between renders; with it in the
  // dependencies this effect re-ran on every render, and because it sets fresh
  // state objects each time, that was an infinite loop waiting for a router
  // implementation that does not memoise.
  useEffect(() => {
    (async () => {
      const who = await inspectorId();
      if (!who) return router.replace("/enrol");
      setUserId(who);
      const session = await inspectionSession(who);
      setInspection(session.inspection);
      load(session.inspection);
    })().catch((e) => setError(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, load]);

  async function submit() {
    if (!inspection || !userId || !inspectorSignedAt || !repSignedAt) return;
    setError(null);
    try {
      await inspection.submit(String(id), {
        inspectorUserId: userId,
        inspectorSignedAt,
        facilityRep: { name: repName.trim(), role: repRole.trim(), signedAt: repSignedAt },
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (done) {
    return (
      <View style={[styles.screen, styles.content]}>
        <View style={styles.card}>
          <Text style={styles.h1}>{t("signOff")}</Text>
          <Text style={styles.body}>{t("nothingLost")}</Text>
          <Pressable style={styles.button} onPress={() => router.replace("/")}>
            <Text style={styles.buttonText}>{t("todaysVisits")}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const complete = missing.length === 0;
  const ready = complete && inspectorSignedAt && repSignedAt && repName.trim() && repRole.trim();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.banner}>
        <Text style={styles.h1}>{rating ? `${rating.percent.toFixed(1)}%` : "…"}</Text>
        {/* Colour is never the only carrier: the band is written out. */}
        <Text style={styles.h2}>{rating?.band.replace(/_/g, " ")}</Text>
      </View>

      {!complete ? (
        <View style={[styles.card, { borderColor: colors.warn }]}>
          <Text style={[styles.body, { color: colors.warn }]}>
            {missing.length} {t("unanswered")}: {missing.slice(0, 8).join(", ")}
            {missing.length > 8 ? "…" : ""}
          </Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.h2}>
          {t("findings")} ({findings.length})
        </Text>
        {findings.map((finding) => (
          <View key={finding.checkpointRef} style={{ gap: 2 }}>
            <Text style={styles.muted}>
              {finding.checkpointRef} · {finding.severity.replace(/_/g, " ")}
            </Text>
            <Text style={styles.body}>{finding.summary}</Text>
          </View>
        ))}
      </View>

      {/* ponytail: a signature here is an explicit, timestamped tap by a named
          person, not a drawn mark. A drawn signature needs a canvas dependency
          and adds no evidentiary weight the device signature does not already
          carry. Add one if the regulator's form requires the image itself. */}
      <View style={styles.card}>
        <Text style={styles.h2}>{t("inspectorSignature")}</Text>
        <Pressable
          style={[styles.button, inspectorSignedAt ? styles.buttonQuiet : null]}
          onPress={() => setInspectorSignedAt(new Date().toISOString())}
        >
          <Text style={[styles.buttonText, inspectorSignedAt ? styles.buttonQuietText : null]}>
            {inspectorSignedAt ? new Date(inspectorSignedAt).toLocaleString() : t("sign")}
          </Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>{t("facilityRep")}</Text>
        <TextInput
          style={styles.input}
          value={repName}
          onChangeText={(v) => {
            setRepName(v);
            setRepSignedAt(null);
          }}
          placeholder={t("repName")}
        />
        <TextInput
          style={styles.input}
          value={repRole}
          onChangeText={(v) => {
            setRepRole(v);
            setRepSignedAt(null);
          }}
          placeholder={t("repRole")}
        />
        <Pressable
          style={[styles.button, repSignedAt ? styles.buttonQuiet : null]}
          disabled={!repName.trim() || !repRole.trim()}
          onPress={() => setRepSignedAt(new Date().toISOString())}
        >
          <Text style={[styles.buttonText, repSignedAt ? styles.buttonQuietText : null]}>
            {repSignedAt ? new Date(repSignedAt).toLocaleString() : t("sign")}
          </Text>
        </Pressable>
      </View>

      {error ? (
        <View style={[styles.card, { borderColor: colors.warn }]}>
          <Text style={[styles.body, { color: colors.warn }]}>{error}</Text>
        </View>
      ) : null}

      <Pressable style={[styles.button, !ready ? { opacity: 0.5 } : null]} disabled={!ready} onPress={submit}>
        <Text style={styles.buttonText}>{t("submit")}</Text>
      </Pressable>
    </ScrollView>
  );
}
