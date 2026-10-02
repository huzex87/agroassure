import { createContext, useContext } from "react";
import { I18nManager } from "react-native";
import * as SecureStore from "expo-secure-store";

// English and Hausa are both first-class. The instrument's own content is
// bilingual in the data model — paired columns in one row — so a checkpoint
// prompt can never appear in one language and not the other. These are the
// strings the app itself owns.

export type Language = "en" | "ha";

const STRINGS = {
  todaysVisits: { en: "Today's visits", ha: "Ziyarce-ziyarcen yau" },
  greetMorning: { en: "Good morning", ha: "Barka da safiya" },
  greetAfternoon: { en: "Good afternoon", ha: "Barka da rana" },
  greetEvening: { en: "Good evening", ha: "Barka da yamma" },
  visitsDone: { en: "done", ha: "an kammala" },
  visitsOne: { en: "visit", ha: "ziyara" },
  visitsMany: { en: "visits", ha: "ziyarce-ziyarce" },
  allVisitsDone: { en: "All visits done. Well done.", ha: "An kammala dukkan ziyarce-ziyarce. Madalla." },
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
  welcome: { en: "Welcome to AgroAssure", ha: "Barka da zuwa AgroAssure" },
  enterCode: {
    en: "Enter the invite code from your email or SMS.",
    ha: "Shigar da lambar gayyata daga imel ko saƙon SMS ɗinka.",
  },
  inviteCode: { en: "Invite code", ha: "Lambar gayyata" },
  continue: { en: "Continue", ha: "Ci gaba" },
  settingUp: { en: "Setting up your phone…", ha: "Ana saita wayarka…" },
  noCode: {
    en: "No code? Ask your supervisor to invite you. The code arrives by SMS and email.",
    ha: "Ba ka da lamba? Ka nemi shugabanka ya gayyace ka. Ana aika lambobi ta imel da SMS.",
  },
  // Asking to join, for someone without an invite code.
  newHere: { en: "No invite code?", ha: "Ba ka da lambar gayyata?" },
  registerInstead: { en: "Register instead", ha: "Yi rajista maimakon haka" },
  registerTitle: { en: "Ask to join", ha: "Nemi shiga" },
  registerBody: {
    en: "Fill in your details. Your administrator approves you, and this phone is set up at the same time.",
    ha: "Cika bayananka. Shugabanka zai amince da kai, kuma za a saita wannan wayar a lokaci guda.",
  },
  stepDetails: { en: "Details", ha: "Bayanai" },
  stepConfirm: { en: "Verify", ha: "Tantancewa" },
  stepApproval: { en: "Approval", ha: "Amincewa" },
  fullName: { en: "Full name", ha: "Cikakken suna" },
  phoneNumber: { en: "Phone number", ha: "Lambar waya" },
  emailAddress: { en: "Email address", ha: "Adireshin imel" },
  yourState: { en: "State you work in", ha: "Jihar da kake aiki" },
  chooseState: { en: "Choose your state", ha: "Zaɓi jiharka" },
  fillEveryField: { en: "Fill in every field and choose your state.", ha: "Cika kowane fili ka zaɓi jiharka." },
  sendCodes: { en: "Send my codes", ha: "Aika min lambobi" },
  sendingCodes: { en: "Sending codes…", ha: "Ana aika lambobi…" },
  confirmTitle: { en: "Confirm it's you", ha: "Tabbatar kai ne" },
  confirmBody: {
    en: "We sent a 6-digit code by SMS and another to your email.",
    ha: "Mun aika lamba mai lambobi 6 ta SMS, da wata zuwa imel ɗinka.",
  },
  smsCode: { en: "Code from SMS", ha: "Lamba daga SMS" },
  emailCode: { en: "Code from email", ha: "Lamba daga imel" },
  phoneConfirmed: { en: "Phone confirmed", ha: "An tabbatar da waya" },
  emailConfirmed: { en: "Email confirmed", ha: "An tabbatar da imel" },
  confirm: { en: "Confirm", ha: "Tabbatar" },
  checking: { en: "Checking…", ha: "Ana dubawa…" },
  sendNewCodes: { en: "Send new codes", ha: "Aika sababbin lambobi" },
  newCodesSent: { en: "New codes sent. Use the newest ones.", ha: "An aika sababbin lambobi. Yi amfani da na ƙarshe." },
  startAgain: { en: "Start again", ha: "Sake farawa" },
  waitingTitle: { en: "Waiting for approval", ha: "Ana jiran amincewa" },
  waitingBody: {
    en: "Your administrator has been told. You'll get an SMS when they decide, and this screen updates by itself.",
    ha: "An sanar da shugabanka. Za ka sami SMS idan sun yanke shawara, kuma wannan allon zai sabunta da kansa.",
  },
  checkNow: { en: "Check now", ha: "Duba yanzu" },
  notApprovedTitle: { en: "Request not approved", ha: "Ba a amince da buƙatarka ba" },
  reasonGiven: { en: "Reason", ha: "Dalili" },
  notApprovedBody: {
    en: "If you think this is a mistake, speak to your administrator.",
    ha: "Idan kana ganin kuskure ne, ka yi magana da shugabanka.",
  },
  approvedElsewhereTitle: { en: "You're approved", ha: "An amince da kai" },
  approvedElsewhereBody: {
    en: "Your role works from the AgroAssure website, not this app. Sign in there with your email address.",
    ha: "Matsayinka yana aiki ne daga shafin yanar gizo na AgroAssure, ba wannan manhaja ba. Shiga can da imel ɗinka.",
  },
  registrationClosed: {
    en: "Registration isn't open on this server. Ask your administrator for an invite code.",
    ha: "Ba a buɗe rajista a wannan sabar ba. Ka nemi lambar gayyata daga shugabanka.",
  },
  haveCode: { en: "Have an invite code?", ha: "Kana da lambar gayyata?" },
  enterItHere: { en: "Enter it here", ha: "Shigar da ita a nan" },
  back: { en: "Back", ha: "Koma" },
  cannotReach: {
    en: "Couldn't reach the server. Check your internet connection and try again.",
    ha: "Ba a iya kaiwa sabar ba. Duba haɗin intanet ɗinka ka sake gwadawa.",
  },
  welcomeName: { en: "Welcome", ha: "Barka da zuwa" },
  deviceReadyBody: {
    en: "Your phone is ready. Your visits will appear here automatically.",
    ha: "Wayarka ta shirya. Ziyarce-ziyarcenka za su bayyana a nan da kansu.",
  },
  seeVisits: { en: "See today's visits", ha: "Duba ziyarce-ziyarcen yau" },
  alreadySetUp: { en: "This phone is already set up", ha: "An riga an saita wannan wayar" },
  alreadySetUpBody: {
    en: "To use it for someone else, sign out in Account first.",
    ha: "Don amfani da ita ga wani, ka fara fita a Asusu.",
  },
  signedOutTitle: { en: "This phone was signed out", ha: "An fitar da wannan wayar" },
  signedOutBody: {
    en: "Your administrator signed this phone out. Ask them for a new invite code to continue.",
    ha: "Shugabanka ya fitar da wannan wayar. Ka nemi sabuwar lambar gayyata don ci gaba.",
  },
  enterNewCode: { en: "Enter a new code", ha: "Shigar da sabuwar lamba" },
  setUpPhone: { en: "Set up this phone", ha: "Saita wannan wayar" },
  // The PIN.
  choosePin: { en: "Choose a 4-digit PIN", ha: "Zaɓi PIN mai lambobi 4" },
  choosePinBody: {
    en: "You'll enter it each time you open AgroAssure. It keeps your inspections safe if the phone is lost.",
    ha: "Za ka shigar da shi duk lokacin da ka buɗe AgroAssure. Yana kare bincikenka idan wayar ta ɓace.",
  },
  confirmPin: { en: "Enter the same PIN again", ha: "Sake shigar da PIN ɗin" },
  pinMismatch: { en: "Those didn't match. Choose your PIN again.", ha: "Ba su yi daidai ba. Sake zaɓar PIN ɗinka." },
  enterPin: { en: "Enter your PIN", ha: "Shigar da PIN ɗinka" },
  wrongPin: { en: "Wrong PIN. Tries left:", ha: "PIN ba daidai ba. Sauran gwaji:" },
  forgotPin: { en: "Forgot PIN?", ha: "Ka manta PIN?" },
  forgotPinBody: {
    en: "You'll need a new invite code from your administrator. Work saved on this phone is kept and will send once you're back in.",
    ha: "Za ka buƙaci sabuwar lambar gayyata daga shugabanka. Aikin da ke wannan wayar zai kasance, kuma za a aika shi bayan ka dawo.",
  },
  signOutAndReset: { en: "Sign out and reset PIN", ha: "Fita ka sake saita PIN" },
  lockedOut: {
    en: "Too many wrong tries. Ask your administrator for a new invite code.",
    ha: "Kuskure ya yi yawa. Ka nemi sabuwar lambar gayyata daga shugabanka.",
  },
  deletePin: { en: "Delete", ha: "Goge" },
  addPin: { en: "Add a PIN", ha: "Ƙara PIN" },
  addPinBody: {
    en: "Optional. Protects your work if the phone is lost or borrowed.",
    ha: "Ba dole ba ne. Yana kare aikinka idan wayar ta ɓace ko an aro ta.",
  },
  pinTitle: { en: "App PIN", ha: "PIN ɗin manhaja" },
  pinIsOff: {
    en: "Not set. Anyone who can open this phone can open the app.",
    ha: "Ba a saita ba. Duk mai iya buɗe wannan wayar zai iya buɗe manhajar.",
  },
  pinIsOn: {
    en: "On. It is asked each time you open the app.",
    ha: "A kunne. Ana tambaya duk lokacin da ka buɗe manhajar.",
  },
  setPin: { en: "Set a PIN", ha: "Saita PIN" },
  changePin: { en: "Change PIN", ha: "Canza PIN" },
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

/**
 * The phone's own language, for someone who has not chosen one. Hausa if the
 * phone is set to Hausa, English otherwise — nobody is asked a question before
 * they have seen anything. A switch in Account, or on the code screen, sticks.
 */
export function phoneLanguage(): Language {
  try {
    const id = (I18nManager.getConstants() as { localeIdentifier?: string }).localeIdentifier ?? "";
    return id.toLowerCase().startsWith("ha") ? "ha" : "en";
  } catch {
    return "en";
  }
}

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
