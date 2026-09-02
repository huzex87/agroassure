import { useCallback, useEffect, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import type { CheckpointResponse, InstrumentStructure } from "@agroassure/domain";
import type { FieldInspection, FieldStore } from "@agroassure/field-core";
import { getStore } from "../../src/db";
import { inspectionSession, inspectorId } from "../../src/session";
import { describeCapture } from "../../src/capture";
import { useLanguage } from "../../src/i18n";
import { colors, styles } from "../../src/theme";

// The checklist. Three responses and no more, because the paper instrument has
// three: a fourth would mean the record no longer says what the regulator's form
// says. Selecting No expands the checkpoint in place — the remark becomes
// required and the camera is offered — which is what turns a subjective note
// into an evidenced finding at the moment it is observed, rather than a
// recollection typed up that evening.

interface Draft {
  response: CheckpointResponse | null;
  remark: string;
  evidenceIds: string[];
  photos: string[];
  saved: boolean;
}

export default function Checklist() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t, pick } = useLanguage();

  const [session, setSession] = useState<{
    inspection: FieldInspection;
    store: FieldStore;
  } | null>(null);
  const [structure, setStructure] = useState<InstrumentStructure | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [rating, setRating] = useState<{ percent: number; answered: number; total: number }>({
    percent: 0,
    answered: 0,
    total: 0,
  });
  const [camera, setCamera] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permission, requestPermission] = useCameraPermissions();

  useEffect(() => {
    (async () => {
      const userId = await inspectorId();
      if (!userId) return router.replace("/enrol");
      setSession(await inspectionSession(userId));
    })().catch((e) => setError(String(e)));
  }, [id, router]);

  const refresh = useCallback(
    (s: { inspection: FieldInspection; store: FieldStore }) => {
      const store = getStore();
      const record = store.inspection(String(id));
      if (!record) return setError("This inspection is not on this device.");
      const version = store.instrumentVersion(String(record.instrument_version_id));
      if (!version) return setError("The instrument version is not on this device.");

      setStructure(version.structure);

      const answered = store.responses(String(id));
      const next: Record<string, Draft> = {};
      for (const section of version.structure.sections) {
        for (const checkpoint of section.checkpoints) {
          const ref = `${section.ordinal}.${checkpoint.ordinal}`;
          const existing = answered.find((a) => a.checkpointRef === ref);
          const evidence = store.evidenceFor(String(id), ref);
          next[ref] = {
            response: existing?.response ?? null,
            remark: existing?.remark ?? "",
            evidenceIds: evidence.map((e) => e.evidenceId),
            photos: evidence.map((e) => e.localUri),
            saved: Boolean(existing),
          };
        }
      }
      setDrafts(next);

      const total = version.structure.sections.reduce(
        (n, section) => n + section.checkpoints.length,
        0,
      );
      setRating({
        percent: s.inspection.rating(String(id)).ratingPercent,
        answered: answered.length,
        total,
      });
    },
    [id],
  );

  useEffect(() => {
    if (session) refresh(session);
  }, [session, refresh]);

  function set(ref: string, patch: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [ref]: { ...d[ref], ...patch, saved: false } }));
  }

  async function save(ref: string) {
    if (!session) return;
    setError(null);
    const draft = drafts[ref];
    try {
      await session.inspection.recordResponse(String(id), {
        checkpointRef: ref,
        response: draft.response as CheckpointResponse,
        remark: draft.remark.trim() || undefined,
        evidenceIds: draft.evidenceIds,
      });
      refresh(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function shoot(ref: string, uri: string) {
    if (!session) return;
    setCamera(null);
    setError(null);
    try {
      const captured = await describeCapture(uri);
      await session.inspection.captureEvidence(String(id), {
        checkpointRef: ref,
        ...captured,
      });
      refresh(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function openCamera(ref: string) {
    if (!permission?.granted) {
      const granted = await requestPermission();
      if (!granted.granted) {
        return setError("Camera permission is needed to attach an exhibit.");
      }
    }
    setCamera(ref);
  }

  if (!structure) {
    return (
      <View style={[styles.screen, styles.content]}>
        <Text style={styles.body}>{error ?? "…"}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {/* The running figure, computed on device by the same function the server
          verifies with, so it does not move when the inspection lands. */}
      <View style={styles.banner}>
        <Text style={styles.h1}>{rating.percent.toFixed(1)}%</Text>
        <Text style={styles.muted}>
          {t("running")} · {rating.answered}/{rating.total} {t("answered")}
        </Text>
      </View>

      {error ? (
        <View style={[styles.card, { borderColor: colors.warn }]}>
          <Text style={[styles.body, { color: colors.warn }]}>{error}</Text>
        </View>
      ) : null}

      {structure.sections.map((section) => (
        <View key={section.ordinal} style={{ gap: 12 }}>
          <Text style={styles.h1}>
            {section.ordinal}. {pick(section.titleEn, section.titleHa)}
          </Text>

          {section.checkpoints.map((checkpoint) => {
            const ref = `${section.ordinal}.${checkpoint.ordinal}`;
            const draft = drafts[ref];
            if (!draft) return null;
            const needsRemark = draft.response === "no";
            const dirty = draft.response !== null && !draft.saved;

            return (
              <View key={ref} style={styles.card}>
                <Text style={styles.muted}>{ref}</Text>
                <Text style={styles.body}>
                  {pick(checkpoint.promptEn, checkpoint.promptHa)}
                </Text>

                <View style={styles.responseRow}>
                  {(["yes", "no", "na"] as const)
                    .filter((option) => option !== "na" || checkpoint.allowsNa)
                    .map((option) => {
                      const selected = draft.response === option;
                      return (
                        <Pressable
                          key={option}
                          accessibilityRole="radio"
                          accessibilityState={{ selected }}
                          style={[
                            styles.responseButton,
                            selected ? styles.responseSelected : null,
                          ]}
                          onPress={() => set(ref, { response: option })}
                        >
                          <Text
                            style={[
                              styles.responseText,
                              selected ? styles.responseTextSelected : null,
                            ]}
                          >
                            {t(option)}
                          </Text>
                        </Pressable>
                      );
                    })}
                </View>

                {needsRemark ? (
                  <View style={{ gap: 8 }}>
                    <Text style={styles.muted}>{t("remarkRequired")}</Text>
                    <TextInput
                      style={[styles.input, { minHeight: 80 }]}
                      value={draft.remark}
                      onChangeText={(remark) => set(ref, { remark })}
                      placeholder={t("remark")}
                      multiline
                    />
                    <Pressable
                      style={[styles.button, styles.buttonQuiet]}
                      onPress={() => openCamera(ref)}
                    >
                      <Text style={[styles.buttonText, styles.buttonQuietText]}>
                        {t("addPhoto")}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}

                {draft.photos.length > 0 ? (
                  <View style={{ gap: 6 }}>
                    <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                      {draft.photos.map((uri) => (
                        <Image
                          key={uri}
                          source={{ uri }}
                          style={{ width: 72, height: 72, borderRadius: 12 }}
                        />
                      ))}
                    </View>
                    <Text style={styles.muted}>{t("photoBound")}</Text>
                  </View>
                ) : null}

                {dirty ? (
                  <Pressable style={styles.button} onPress={() => save(ref)}>
                    <Text style={styles.buttonText}>Save</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>
      ))}

      <Pressable
        style={styles.button}
        onPress={() => router.push(`/signoff/${String(id)}`)}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>{t("signOff")}</Text>
      </Pressable>

      <Modal visible={camera !== null} animationType="slide">
        <CameraShot onCapture={(uri) => shoot(camera as string, uri)} onCancel={() => setCamera(null)} />
      </Modal>
    </ScrollView>
  );
}

function CameraShot({
  onCapture,
  onCancel,
}: {
  onCapture: (uri: string) => void;
  onCancel: () => void;
}) {
  const [view, setView] = useState<CameraView | null>(null);
  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <CameraView ref={setView} style={{ flex: 1 }} facing="back" />
      <View style={{ flexDirection: "row", gap: 12, padding: 16 }}>
        <Pressable style={[styles.button, styles.buttonQuiet, { flex: 1 }]} onPress={onCancel}>
          <Text style={[styles.buttonText, styles.buttonQuietText]}>Cancel</Text>
        </Pressable>
        <Pressable
          style={[styles.button, { flex: 2 }]}
          onPress={async () => {
            const photo = await view?.takePictureAsync({ quality: 0.6 });
            if (photo?.uri) onCapture(photo.uri);
          }}
        >
          <Text style={styles.buttonText}>Capture</Text>
        </Pressable>
      </View>
    </View>
  );
}
