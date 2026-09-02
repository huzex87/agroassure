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
  enrolTitle: { en: "Enrol this device", ha: "Yi rijistar wannan na'urar" },
  enrolBody: {
    en: "Give this code to your administrator. The key that signs your work stays on this device and is never sent.",
    ha: "Ba wa shugabanka wannan lambar. Makullin da ke sa hannu kan aikinka yana nan a wannan na'urar, ba a taɓa aika shi ba.",
  },
  language: { en: "Hausa", ha: "English" },
  priorFindings: { en: "Open findings here", ha: "Abubuwan da ba a gyara ba" },
} as const;

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
  };
}
