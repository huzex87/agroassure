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
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
  const insets = useSafeAreaInsets();
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
    // Keyed on the inspection alone: router comes from useRouter() and is not
    // guaranteed to be the same object between renders, so depending on it makes
    // this effect re-run on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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

  /**
   * Choosing a response.
   *
   * Yes and N/A commit on the tap. There is nothing to confirm about them, and
   * a separate Save step doubled every interaction on an instrument that can
   * run to forty checkpoints — eighty taps where forty would do, each one made
   * standing up, one-handed, sometimes in gloves.
   *
   * No is different, and deliberately so: it needs a remark, so it stays
   * uncommitted until one is written. Until then the stored answer is whatever
   * it was before, which is the honest state — the adverse observation is not
   * in the record until the inspector has said what they saw.
   */
  async function choose(ref: string, option: CheckpointResponse) {
    const next: Draft = { ...drafts[ref], response: option, saved: false };
    setDrafts((d) => ({ ...d, [ref]: next }));
    if (option !== "no") await commit(ref, next);
  }

  async function commit(ref: string, draft: Draft) {
    if (!session) return;
    setError(null);
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

  const done = rating.total === 0 ? 0 : rating.answered / rating.total;

  return (
    <View style={styles.screen}>
      {/* Outside the ScrollView on purpose. The running figure is the only
          thing telling an inspector where they are in a long instrument, and it
          used to scroll away the moment they started answering. It is computed
          on device by the same function the server verifies with, so it does
          not move when the inspection lands. */}
      <View style={styles.stickyHeader}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.h1}>{rating.percent.toFixed(1)}%</Text>
          <Text style={styles.muted}>
            {rating.answered}/{rating.total} {t("answered")}
          </Text>
        </View>
        <View
          style={styles.progressTrack}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: rating.total, now: rating.answered }}
        >
          <View style={[styles.progressFill, { width: `${done * 100}%` }]} />
        </View>
        <Text style={styles.muted}>{t("running")}</Text>
      </View>

    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
      {error ? (
        <View style={[styles.card, { borderColor: colors.warn }]}>
          <Text style={[styles.body, { color: colors.warn }]}>{error}</Text>
        </View>
      ) : null}

      {structure.sections.map((section) => {
        const answeredHere = section.checkpoints.filter(
          (c) => drafts[`${section.ordinal}.${c.ordinal}`]?.saved,
        ).length;

        return (
        <View key={section.ordinal} style={{ gap: 12 }}>
          {/* A section says how much of itself is left, so a long instrument
              can be worked in passes rather than read end to end. */}
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.h1, { flexShrink: 1 }]}>
              {section.ordinal}. {pick(section.titleEn, section.titleHa)}
            </Text>
            <Text style={styles.muted}>
              {answeredHere}/{section.checkpoints.length}
            </Text>
          </View>

          {section.checkpoints.map((checkpoint) => {
            const ref = `${section.ordinal}.${checkpoint.ordinal}`;
            const draft = drafts[ref];
            if (!draft) return null;
            const needsRemark = draft.response === "no";
            const dirty = draft.response !== null && !draft.saved;

            return (
              <View key={ref} style={[styles.card, draft.saved ? styles.cardAnswered : null]}>
                <Text style={styles.muted}>
                  {ref}
                  {draft.saved ? "  ·  recorded" : ""}
                </Text>
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
                          onPress={() => choose(ref, option)}
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

                {/* Only an adverse response reaches here: Yes and N/A commit on
                    the tap. Disabled until the remark exists, rather than
                    accepting the tap and answering it with an error — a control
                    that refuses in advance beats a good error message. */}
                {dirty ? (
                  <Pressable
                    style={[styles.button, draft.remark.trim() ? null : styles.buttonDisabled]}
                    disabled={!draft.remark.trim()}
                    onPress={() => commit(ref, draft)}
                    accessibilityRole="button"
                  >
                    <Text style={styles.buttonText}>Save</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>
        );
      })}

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
    </View>
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
