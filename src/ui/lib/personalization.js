// Personal presentation choices only. Instructions are untrusted plain text,
// never system prompts, policy, workflow parameters or executable content.
export const RESPONSE_STYLES = { concise: "Concise", balanced: "Balanced", detailed: "Detailed" };
export const TECHNICAL_LEVELS = { general: "General", bioinformatics: "Bioinformatics", expert: "Expert" };
export const PREFERRED_LANGUAGES = { en: "English", es: "Spanish", fr: "French", de: "German", pt: "Portuguese", hi: "Hindi", ja: "Japanese", ko: "Korean", zh: "Chinese", ar: "Arabic" };
export const PERSONAL_INSTRUCTIONS_MAX_LENGTH = 2000;
export const PERSONALIZATION_DEFAULTS = { response_style: "balanced", technical_level: "general", preferred_language: null, personal_instructions: "" };
export const PERSONALIZATION_FIELDS = Object.keys(PERSONALIZATION_DEFAULTS);
export const instructionLength = value => Array.from(value).length;

export function validatePersonalization(values) {
  const errors = {};
  if (typeof values.response_style !== "string" || !Object.hasOwn(RESPONSE_STYLES, values.response_style)) errors.response_style = "Choose a response style.";
  if (typeof values.technical_level !== "string" || !Object.hasOwn(TECHNICAL_LEVELS, values.technical_level)) errors.technical_level = "Choose a technical level.";
  if (values.preferred_language !== null && (typeof values.preferred_language !== "string" || !Object.hasOwn(PREFERRED_LANGUAGES, values.preferred_language))) errors.preferred_language = "Choose a supported language or use the AI default.";
  if (typeof values.personal_instructions !== "string" || instructionLength(values.personal_instructions) > PERSONAL_INSTRUCTIONS_MAX_LENGTH) {
    errors.personal_instructions = `Use no more than ${PERSONAL_INSTRUCTIONS_MAX_LENGTH.toLocaleString("en")} characters.`;
  }
  return errors;
}

export const personalizationValues = data => Object.fromEntries(PERSONALIZATION_FIELDS.map(field => [field, data[field]]));
