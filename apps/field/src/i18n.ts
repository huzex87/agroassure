import { createContext, useContext } from "react";

// English and Hausa are both first-class. The instrument's own content is
// bilingual in the data model — paired columns in one row — so a checkpoint
// prompt can never appear in one language and not the other. These are the
// strings the app itself owns.

export type Language = "en" | "ha";

const STRINGS = {
  todaysVisits: { en: "Today's visits", ha: "Ziyarce-ziyarcen yau" },
  noVisits: {
    en: "No visits assigned. Sync before you leave to collect your day.",
    ha: "Babu ziyarar da aka ba ka. Yi sync kafin ka tafi don karɓar aikin ranarka.",
  },
  offline: { en: "Offline", ha: "Babu haɗi" },
  online: { en: "Online", ha: "Akwai haɗi" },
  queued: { en: "queued", ha: "a jira" },
  syncNow: { en: "Sync now", ha: "Yi sync yanzu" },
  nothingLost: {
    en: "Saved on this device. It will sync automatically.",
    ha: "An adana a wannan na'urar. Zai yi sync da kansa.",
  },
  startInspection: { en: "Start inspection", ha: "Fara binciken" },
  continueInspection: { en: "Continue", ha: "Ci gaba" },
  yes: { en: "Yes", ha: "Ee" },
  no: { en: "No", ha: "A'a" },
  na: { en: "N/A", ha: "Ba ya shafa" },
  remark: { en: "Remark", ha: "Bayani" },
  remarkRequired: {
    en: "A remark is required for an adverse response.",
    ha: "Ana buƙatar bayani domin amsa mara kyau.",
  },
  addPhoto: { en: "Add photo", ha: "Ƙara hoto" },
  photoBound: {
    en: "Checksummed at capture. It cannot be replaced after submission.",
    ha: "An lissafa checksum lokacin ɗauka. Ba za a iya maye gurbinsa ba bayan mikawa.",
  },
  running: { en: "Compliance so far", ha: "Bin ka'ida ya zuwa yanzu" },
  answered: { en: "answered", ha: "an amsa" },
  signOff: { en: "Sign off", ha: "Sanya hannu" },
  inspectorSignature: { en: "Inspector", ha: "Mai binciken" },
  facilityRep: { en: "Facility representative", ha: "Wakilin ma'aikata" },
  repName: { en: "Full name", ha: "Cikakken suna" },
  repRole: { en: "Role", ha: "Matsayi" },
  sign: { en: "Sign", ha: "Sanya hannu" },
  submit: { en: "Submit inspection", ha: "Mika binciken" },
  findings: { en: "Findings", ha: "Abubuwan da aka gano" },
  unanswered: { en: "still unanswered", ha: "ba a amsa ba tukuna" },
  checkinFar: {
    en: "You are further from the registered location than expected. This is recorded for your supervisor; carry on.",
    ha: "Kana nesa da wurin da aka yi rijista fiye da yadda ake tsammani. An rubuta wannan don shugabanka; ci gaba.",
  },
  whoAreYou: { en: "Who are you?", ha: "Wane ne kai?" },
  signInBody: {
    en: "Choose your name. This device will then ask your administrator to approve it.",
    ha: "Zaɓi sunanka. Sannan wannan na'urar za ta nemi shugabanka ya amince da ita.",
  },
  noSignInAvailable: {
    en: "This server does not offer sign-in. Ask your administrator to enrol this device.",
    ha: "Wannan sabar ba ta bayar da shiga ba. Ka nemi shugabanka ya yi rijistar na'urar.",
  },
  awaitingApproval: { en: "Waiting for approval", ha: "Ana jiran amincewa" },
  awaitingApprovalBody: {
    en: "Your administrator can see this device now. Your work is saved here in the meantime and will sync once it is approved.",
    ha: "Shugabanka na iya ganin wannan na'urar yanzu. Aikinka na nan a adane, zai yi sync bayan an amince.",
  },
  thisDevice: { en: "This device's key", ha: "Makullin wannan na'urar" },
  checkAgain: { en: "Check again", ha: "Sake dubawa" },
  deviceReady: { en: "This device is ready", ha: "Wannan na'urar a shirye take" },
  deviceReadyBody: {
    en: "Approved. Everything queued on this device can sync now.",
    ha: "An amince. Duk abin da ke jira zai iya yin sync yanzu.",
  },
  signOutDevice: { en: "Sign out of this device", ha: "Fita daga wannan na'urar" },
  enrolTitle: { en: "Enrol this device", ha: "Yi rijistar wannan na'urar" },
  enrolBody: {
    en: "Give this code to your administrator. The key that signs your work stays on this device and is never sent.",
    ha: "Ba wa shugabanka wannan lambar. Makullin da ke sa hannu kan aikinka yana nan a wannan na'urar, ba a taɓa aika shi ba.",
  },
  language: { en: "Hausa", ha: "English" },
  // Why sign-off is not available yet. Short and imperative: these sit under a
  // disabled button, and a dimmed control that will not say why is a dead end.
  blockedUnanswered: {
    en: "Answer every checkpoint first.",
    ha: "Ka amsa dukkan tambayoyi tukuna.",
  },
  blockedInspector: {
    en: "You have not signed yet.",
    ha: "Ba ka sanya hannu ba tukuna.",
  },
  blockedRepName: {
    en: "Name the facility representative.",
    ha: "Rubuta sunan wakilin ma'aikata.",
  },
  blockedRepSign: {
    en: "The representative has not signed yet.",
    ha: "Wakilin bai sanya hannu ba tukuna.",
  },
  priorFinding: { en: "open finding here", ha: "abin da ba a gyara ba" },
  priorFindings: { en: "open findings here", ha: "abubuwan da ba a gyara ba" },
  device: { en: "Device", ha: "Na'ura" },
  submitted: { en: "Submitted", ha: "An mika" },
} as const;

// The two enumerations an inspector actually sees. They were reaching the
// screen as their raw database values with the underscores swapped for spaces
// — "blending plant", "critical issues" — which is a schema leaking into a
// user interface, and which had no Hausa at all.
const FACILITY_TYPE = {
  agro_dealer: { en: "Agro-dealer warehouse", ha: "Ma'ajiyar dillalin noma" },
  blending_plant: { en: "Processing and blending plant", ha: "Masana'antar sarrafawa da haɗawa" },
  manufacturing: { en: "Manufacturing plant", ha: "Masana'antar ƙerawa" },
  importer: { en: "Importer", ha: "Mai shigo da kaya" },
} as const;

const RATING_BAND = {
  satisfactory: { en: "Satisfactory", ha: "Ya gamsar" },
  needs_improvement: { en: "Needs improvement", ha: "Yana buƙatar gyara" },
  critical_issues: { en: "Critical issues", ha: "Manyan matsaloli" },
} as const;

/**
 * A value from a fixed set, in the reader's language. Anything unrecognised
 * falls back to a readable form of the value itself rather than to an empty
 * string: a facility type this build has not been taught is still better shown
 * than silently dropped from the card.
 */
function fromTable(
  table: Record<string, { en: string; ha: string }>,
  value: string,
  language: Language,
): string {
  const entry = table[value];
  if (entry) return entry[language];
  return value.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

export function facilityTypeLabel(value: string, language: Language): string {
  return fromTable(FACILITY_TYPE, value, language);
}

export function ratingBandLabel(value: string, language: Language): string {
  return fromTable(RATING_BAND, value, language);
}

export type StringKey = keyof typeof STRINGS;

export function t(key: StringKey, language: Language): string {
  return STRINGS[key][language];
}

export const LanguageContext = createContext<{
  language: Language;
  setLanguage: (l: Language) => void;
}>({ language: "en", setLanguage: () => {} });

export function useLanguage() {
  const { language, setLanguage } = useContext(LanguageContext);
  return {
    language,
    setLanguage,
    t: (key: StringKey) => t(key, language),
    /** Pick the right half of a bilingual pair from the instrument itself. */
    pick: (en: string, ha: string) => (language === "ha" ? ha : en),
    facilityType: (value: string) => facilityTypeLabel(value, language),
    ratingBand: (value: string) => ratingBandLabel(value, language),
  };
}
