import { createContext, useContext } from "react";
import * as SecureStore from "expo-secure-store";

// English and Hausa are both first-class. The instrument's own content is
// bilingual in the data model — paired columns in one row — so a checkpoint
// prompt can never appear in one language and not the other. These are the
// strings the app itself owns.

export type Language = "en" | "ha";

const STRINGS = {
  todaysVisits: { en: "Today's visits", ha: "Ziyarce-ziyarcen yau" },
  noVisits: {
    en: "No visits yet. Your supervisor's assignments appear here as soon as your phone has a signal.",
    ha: "Babu ziyara tukuna. Ayyukan da shugabanka ya ba ka za su bayyana a nan da zarar wayarka ta sami sigina.",
  },
  startInspection: { en: "Start inspection", ha: "Fara binciken" },
  continueInspection: { en: "Continue", ha: "Ci gaba" },
  yes: { en: "Yes", ha: "Ee" },
  no: { en: "No", ha: "A'a" },
  na: { en: "N/A", ha: "Ba ya shafa" },
  remark: { en: "What did you see?", ha: "Me ka gani?" },
  remarkRequired: {
    en: "Say what you saw. A \"No\" needs a short note.",
    ha: "Faɗi abin da ka gani. Amsar \"A'a\" tana buƙatar ɗan bayani.",
  },
  save: { en: "Save", ha: "Adana" },
  addPhoto: { en: "Add photo", ha: "Ƙara hoto" },
  photoBound: {
    en: "🔒 Saved as evidence. Photos can't be changed after you submit.",
    ha: "🔒 An adana a matsayin shaida. Ba za a iya canza hotuna ba bayan ka mika.",
  },
  running: { en: "Score so far", ha: "Maki ya zuwa yanzu" },
  answered: { en: "answered", ha: "an amsa" },
  signOff: { en: "Finish and sign", ha: "Kammala ka sa hannu" },
  inspectorSignature: { en: "Your signature", ha: "Sa hannunka" },
  facilityRep: { en: "Facility representative", ha: "Wakilin wurin" },
  repName: { en: "Full name", ha: "Cikakken suna" },
  repRole: { en: "Role", ha: "Matsayi" },
  sign: { en: "Sign", ha: "Sanya hannu" },
  submit: { en: "Submit inspection", ha: "Mika binciken" },
  submittedTitle: { en: "Inspection submitted", ha: "An mika binciken" },
  submittedBody: {
    en: "It is saved on this phone and will be sent to your office automatically.",
    ha: "An adana shi a wannan wayar kuma za a aika shi ofishinku da kansa.",
  },
  backToVisits: { en: "Back to today's visits", ha: "Koma ziyarce-ziyarcen yau" },
  findings: { en: "Issues found", ha: "Matsalolin da aka gano" },
  unanswered: { en: "still unanswered", ha: "ba a amsa ba tukuna" },
  checkinFar: {
    en: "You seem to be some distance from this facility's address. That's fine — it's noted for your supervisor. Carry on.",
    ha: "Da alama kana nesa da adireshin wannan wurin. Ba komai — an rubuta wa shugabanka. Ci gaba.",
  },
  // Getting a phone ready to use.
  whoAreYou: { en: "Who are you?", ha: "Wane ne kai?" },
  signInBody: {
    en: "Choose your name to set up this phone.",
    ha: "Zaɓi sunanka don saita wannan wayar.",
  },
  noSignInAvailable: {
    en: "Ask your administrator for an invite code.",
    ha: "Ka nemi shugabanka ya ba ka lambar gayyata.",
  },
  awaitingApproval: { en: "Almost ready", ha: "Kusan a shirye" },
  awaitingApprovalBody: {
    en: "Your administrator needs to confirm this phone. You can start working now — everything is saved here and will be sent once it's confirmed.",
    ha: "Shugabanka yana buƙatar ya tabbatar da wannan wayar. Za ka iya fara aiki yanzu — komai na adane a nan, za a aika bayan an tabbatar.",
  },
  checkAgain: { en: "Check again", ha: "Sake dubawa" },
  deviceReady: { en: "You're all set", ha: "Komai ya shirya" },
  deviceReadyBody: {
    en: "This phone is ready. Your visits will appear automatically.",
    ha: "Wannan wayar ta shirya. Ziyarce-ziyarcenka za su bayyana da kansu.",
  },
  setUpPhone: { en: "Set up this phone", ha: "Saita wannan wayar" },
  setUpPhoneBody: {
    en: "This phone isn't linked to your account yet. Tap here to finish setting it up.",
    ha: "Ba a haɗa wannan wayar da asusunka ba tukuna. Taɓa nan don kammala saitawa.",
  },
  // Sending.
  allSent: { en: "Everything is sent", ha: "An aika komai" },
  sending: { en: "Sending…", ha: "Ana aikawa…" },
  waitingToSend: { en: "waiting to send", ha: "suna jiran aikawa" },
  savedOnPhone: {
    en: "Saved on this phone. It will send by itself when there's a signal.",
    ha: "An adana a wannan wayar. Zai aika da kansa idan akwai sigina.",
  },
  noSignal: {
    en: "No connection right now. Your work is safe on this phone.",
    ha: "Babu haɗi yanzu. Aikinka na nan lafiya a wannan wayar.",
  },
  lastSent: { en: "Last sent", ha: "An aika na ƙarshe" },
  sendNow: { en: "Send now", ha: "Aika yanzu" },
  // Account.
  account: { en: "Account", ha: "Asusu" },
  language: { en: "Language", ha: "Harshe" },
  switchLanguage: { en: "Hausa", ha: "English" },
  chooseLanguage: { en: "Choose your language", ha: "Zaɓi harshenka" },
  chooseLanguageBody: {
    en: "You can change this later in Account.",
    ha: "Za ka iya canza wannan daga baya a Asusu.",
  },
  signedInAs: { en: "Signed in as", ha: "An shiga a matsayin" },
  signOut: { en: "Sign out of this phone", ha: "Fita daga wannan wayar" },
  signOutUnsent: {
    en: "Some work hasn't been sent yet. Signing out now would lose it. Send it first.",
    ha: "Akwai aikin da ba a aika ba tukuna. Fita yanzu zai sa a rasa shi. Ka fara aikawa.",
  },
  signOutConfirm: { en: "Sign out", ha: "Fita" },
  cancel: { en: "Cancel", ha: "Soke" },
  // Why sign-off is not available yet. Short and imperative: these sit under a
  // disabled button, and a dimmed control that will not say why is a dead end.
  blockedUnanswered: {
    en: "Answer every question first.",
    ha: "Ka amsa dukkan tambayoyi tukuna.",
  },
  blockedInspector: {
    en: "You have not signed yet.",
    ha: "Ba ka sanya hannu ba tukuna.",
  },
  blockedRepName: {
    en: "Add the facility representative's name and role.",
    ha: "Rubuta sunan wakilin wurin da matsayinsa.",
  },
  blockedRepSign: {
    en: "The representative has not signed yet.",
    ha: "Wakilin bai sanya hannu ba tukuna.",
  },
  priorFinding: { en: "issue still open here", ha: "matsalar da ba a gyara ba" },
  priorFindings: { en: "issues still open here", ha: "matsalolin da ba a gyara ba" },
  submitted: { en: "Submitted", ha: "An mika" },
  recorded: { en: "Saved", ha: "An adana" },
  whyThisVisit: { en: "Why this visit", ha: "Dalilin wannan ziyarar" },
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

// The choice survives a restart. It is asked once, on first launch, and after
// that lives in Account — an inspector who reads Hausa should never have to
// find a toggle before they can read the screen that tells them where it is.
const LANGUAGE_KEY = "agroassure.language";

export async function storedLanguage(): Promise<Language | null> {
  const value = await SecureStore.getItemAsync(LANGUAGE_KEY);
  return value === "en" || value === "ha" ? value : null;
}

export async function storeLanguage(language: Language): Promise<void> {
  await SecureStore.setItemAsync(LANGUAGE_KEY, language);
}

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
