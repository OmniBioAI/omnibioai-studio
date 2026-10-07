// Finite presentation contracts shared by validation and the UI primitives.
// No field in these objects is evaluated, imported, or resolved as a callback.
const FORBIDDEN_NAMES = new Set(["__proto__", "prototype", "constructor", "password", "token", "api_key", "secret", "credentials"]);
const IDENTIFIER = /^[a-z][a-z0-9_]*$/;
const URI_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
export const OPAQUE_ARTIFACT_ID = /^art_[A-Za-z0-9_-]{43}$/;
export const MAX_MULTISELECT_CHOICES = 50;
export const RESOURCE_ID = /^[A-Za-z0-9_.-]{1,128}$/;
export const RESOURCE_SLUG = /^[a-z0-9][a-z0-9_]*$/;
export const MAX_RESOURCES = 100;
const FINITE_CHOICE_VALUE = /^[A-Za-z0-9][A-Za-z0-9_.+-]{0,127}$/;
const ARTIFACT_KINDS = new Set(["archive", "file", "log", "plot", "report", "table"]);
const MEDIA_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i;
const SCIENTIFIC_REFERENCE_TYPES = Object.freeze({
  doi: { label: "DOI", maximum: 255, pattern: /^10\.\d{4,9}\/[A-Za-z0-9][A-Za-z0-9._;()/:+\-]{0,243}$/ },
  pubmed: { label: "PubMed", maximum: 10, pattern: /^[1-9]\d{0,9}$/ },
  clinvar: { label: "ClinVar", maximum: 32, pattern: /^VCV\d{9}(?:\.\d+)?$/ },
  ncbi_gene: { label: "NCBI Gene", maximum: 10, pattern: /^[1-9]\d{0,9}$/ },
  refseq: { label: "RefSeq", maximum: 32, pattern: /^(?:NC|NG|NM|NR|NT|NW|NZ|XM|XR|NP|XP|YP|WP)_\d{6,9}(?:\.\d{1,4})?$/ },
});

export const SCIENTIFIC_REFERENCE_TYPE_IDS = Object.freeze(Object.keys(SCIENTIFIC_REFERENCE_TYPES));
const PLUGIN_SCIENTIFIC_REFERENCE_TYPES = Object.freeze({
  rcsb_pdb: Object.freeze(["doi", "pubmed"]),
  dbsnp: Object.freeze(["clinvar", "ncbi_gene", "refseq"]),
});

export function scientificReferenceTypesForPlugin(pluginSlug) {
  return Object.hasOwn(PLUGIN_SCIENTIFIC_REFERENCE_TYPES, pluginSlug)
    ? PLUGIN_SCIENTIFIC_REFERENCE_TYPES[pluginSlug] : Object.freeze([]);
}

export function referenceTypeLabel(referenceType) {
  return Object.hasOwn(SCIENTIFIC_REFERENCE_TYPES, referenceType) ? SCIENTIFIC_REFERENCE_TYPES[referenceType].label : "Reference";
}

export function validScientificReference(value, allowedTypes = SCIENTIFIC_REFERENCE_TYPE_IDS) {
  if (!hasOnlyKeys(value, ["reference_type", "identifier"], ["reference_type", "identifier"]) ||
      !Array.isArray(allowedTypes) || !allowedTypes.includes(value.reference_type) ||
      !Object.hasOwn(SCIENTIFIC_REFERENCE_TYPES, value.reference_type) || typeof value.identifier !== "string") return false;
  const policy = SCIENTIFIC_REFERENCE_TYPES[value.reference_type];
  return value.identifier.length > 0 && value.identifier.length <= policy.maximum &&
    !value.identifier.includes("..") && !value.identifier.includes("\\") &&
    ![...value.identifier].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) &&
    policy.pattern.test(value.identifier);
}

export function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

export function hasOnlyKeys(value, allowed, required = []) {
  return isRecord(value) && Object.keys(value).every(key => allowed.includes(key)) &&
    required.every(key => Object.hasOwn(value, key));
}

export function validFiniteChoices(choices) {
  if (!Array.isArray(choices) || choices.length < 1 || choices.length > MAX_MULTISELECT_CHOICES) return false;
  const values = new Set();
  return choices.every(choice => {
    if (!hasOnlyKeys(choice, ["value", "label"], ["value", "label"]) ||
        typeof choice.value !== "string" || !FINITE_CHOICE_VALUE.test(choice.value) || values.has(choice.value) ||
        typeof choice.label !== "string" || !choice.label.trim() || choice.label.length > 200 ||
        /[<>\x00-\x1f\x7f]/.test(choice.label)) return false;
    values.add(choice.value);
    return true;
  });
}

export function validArtifactPresentation(value) {
  return hasOnlyKeys(value, ["presentation", "max_items"], ["presentation", "max_items"]) &&
    value.presentation === "list" && Number.isInteger(value.max_items) &&
    value.max_items >= 1 && value.max_items <= 100;
}

export function validateArtifactPayload(payload, maxItems = 100) {
  if (!hasOnlyKeys(payload, ["artifacts", "render"], ["artifacts"]) || !Array.isArray(payload.artifacts) ||
      !Number.isInteger(maxItems) || maxItems < 1 || maxItems > 100 || payload.artifacts.length > maxItems) {
    throw new Error("Invalid artifact response.");
  }
  const ids = new Set();
  for (const artifact of payload.artifacts) {
    if (!hasOnlyKeys(artifact, ["artifact_id", "display_name", "label", "media_type", "size_bytes", "kind"],
      ["artifact_id", "display_name", "label", "media_type", "size_bytes", "kind"]) ||
      !OPAQUE_ARTIFACT_ID.test(artifact.artifact_id) || ids.has(artifact.artifact_id) ||
      typeof artifact.display_name !== "string" || !artifact.display_name || artifact.display_name.length > 255 ||
      /[\x00-\x1f\x7f/\\]/.test(artifact.display_name) ||
      typeof artifact.label !== "string" || !artifact.label || artifact.label.length > 200 ||
      typeof artifact.media_type !== "string" || !MEDIA_TYPE.test(artifact.media_type) ||
      !Number.isSafeInteger(artifact.size_bytes) || artifact.size_bytes < 0 ||
      !ARTIFACT_KINDS.has(artifact.kind)) {
      throw new Error("Invalid artifact response.");
    }
    ids.add(artifact.artifact_id);
  }
  return payload.artifacts;
}

export function validateResourcePayload(payload) {
  if (!hasOnlyKeys(payload, ["results"], ["results"]) || !Array.isArray(payload.results) ||
      payload.results.length > MAX_RESOURCES) {
    throw new Error("Invalid resource response.");
  }
  const ids = new Set();
  for (const resource of payload.results) {
    if (!hasOnlyKeys(resource, ["id", "label", "source_plugin"], ["id", "label", "source_plugin"]) ||
        typeof resource.id !== "string" || !RESOURCE_ID.test(resource.id) || resource.id.includes("..") ||
        ids.has(resource.id) ||
        typeof resource.label !== "string" || !resource.label.trim() || resource.label.length > 200 ||
        /[\x00-\x1f\x7f]/.test(resource.label) ||
        typeof resource.source_plugin !== "string" || !RESOURCE_SLUG.test(resource.source_plugin)) {
      throw new Error("Invalid resource response.");
    }
    ids.add(resource.id);
  }
  return payload.results;
}

export function isDataPath(path) {
  return typeof path === "string" && path.split(".").every(part => IDENTIFIER.test(part) && !FORBIDDEN_NAMES.has(part));
}

export function valueAt(row, path) {
  if (!isDataPath(path)) return undefined;
  return path.split(".").reduce((value, key) =>
    isRecord(value) && Object.hasOwn(value, key) ? value[key] : undefined, row);
}

export function scalarText(value) {
  if (typeof value === "string" || typeof value === "boolean") return String(value);
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "—";
}

export function validColumns(columns) {
  return Array.isArray(columns) && columns.length > 0 &&
    new Set(columns.map(column => column?.key)).size === columns.length &&
    columns.every(column => hasOnlyKeys(column, ["key", "label"], ["key", "label"]) &&
      isDataPath(column.key) && typeof column.label === "string" && column.label.trim().length > 0);
}

export function validScalarFields(fields) {
  return Array.isArray(fields) && fields.length > 0 &&
    new Set(fields.map(field => field?.key)).size === fields.length &&
    fields.every(field => hasOnlyKeys(field, ["key", "label"], ["key", "label"]) &&
      typeof field.key === "string" && IDENTIFIER.test(field.key) && !FORBIDDEN_NAMES.has(field.key) &&
      typeof field.label === "string" && field.label.trim().length > 0);
}

export function validScalarRecord(record, fields, { strict = false } = {}) {
  if (!isRecord(record) || !validScalarFields(fields)) return false;
  const allowed = new Set(fields.map(field => field.key));
  if (strict && Object.keys(record).some(key => !allowed.has(key))) return false;
  return fields.every(field => {
    const value = Object.hasOwn(record, field.key) ? record[field.key] : null;
    return value === null || typeof value === "string" || typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value));
  });
}

export function validDetailDescriptor(value, allowedReferenceTypes = SCIENTIFIC_REFERENCE_TYPE_IDS) {
  if (!hasOnlyKeys(value, ["component", "title", "fields", "sections"], ["component", "title"]) ||
      value.component !== "detail" || typeof value.title !== "string" || !value.title.trim() ||
      (value.fields === undefined) === (value.sections === undefined)) return false;
  if (value.fields !== undefined) return validScalarFields(value.fields);
  return validDetailSections(value.sections, allowedReferenceTypes);
}

export function validDetailSections(sections, allowedReferenceTypes = SCIENTIFIC_REFERENCE_TYPE_IDS) {
  if (!Array.isArray(sections) || sections.length === 0 ||
      new Set(sections.map(section => section?.id)).size !== sections.length) return false;
  return sections.every(section => {
    if (!isRecord(section) || typeof section.id !== "string" || !IDENTIFIER.test(section.id) || FORBIDDEN_NAMES.has(section.id) ||
        typeof section.title !== "string" || !section.title.trim() ||
        (section.optional !== undefined && typeof section.optional !== "boolean")) return false;
    const common = ["id", "title", "presentation", "optional"];
    if (["scalar", "provenance"].includes(section.presentation)) {
      return hasOnlyKeys(section, [...common, "fields"], ["id", "title", "presentation", "fields"]) &&
        validScalarFields(section.fields);
    }
    if (section.presentation === "references") {
      return hasOnlyKeys(section, [...common, "reference_types", "max_items"],
        ["id", "title", "presentation", "reference_types", "max_items"]) &&
        Array.isArray(section.reference_types) && section.reference_types.length > 0 &&
        new Set(section.reference_types).size === section.reference_types.length &&
        section.reference_types.every(type => allowedReferenceTypes.includes(type) && SCIENTIFIC_REFERENCE_TYPE_IDS.includes(type)) &&
        Number.isSafeInteger(section.max_items) && section.max_items >= 1 && section.max_items <= 100;
    }
    return section.presentation === "table" &&
      hasOnlyKeys(section, [...common, "columns", "row_key", "max_rows"], ["id", "title", "presentation", "columns", "row_key", "max_rows"]) &&
      validColumns(section.columns) && section.columns.every(column => !column.key.includes(".")) &&
      typeof section.row_key === "string" && section.columns.some(column => column.key === section.row_key) &&
      Number.isSafeInteger(section.max_rows) && section.max_rows >= 1 && section.max_rows <= 500;
  });
}

export function validStructuredDetailRecord(record, sections, { strict = false } = {}) {
  if (!isRecord(record) || !validDetailSections(sections)) return false;
  const allowed = new Set(sections.map(section => section.id));
  if (strict && Object.keys(record).some(key => !allowed.has(key))) return false;
  return sections.every(section => {
    if (!Object.hasOwn(record, section.id)) return section.optional === true;
    const value = record[section.id];
    if (["scalar", "provenance"].includes(section.presentation)) {
      return validScalarRecord(value, section.fields, { strict: true }) &&
        (section.presentation !== "provenance" || section.fields.every(field => {
          const provenanceValue = Object.hasOwn(value, field.key) ? value[field.key] : null;
          return typeof provenanceValue !== "string" || !URI_SCHEME.test(provenanceValue.trim());
        }));
    }
    if (section.presentation === "references") {
      return Array.isArray(value) && value.length <= section.max_items &&
        value.every(reference => validScientificReference(reference, section.reference_types)) &&
        new Set(value.map(reference => `${reference.reference_type}:${reference.identifier}`)).size === value.length;
    }
    if (!Array.isArray(value) || value.length > section.max_rows || rowKeys(value, section.row_key) === null) return false;
    const columns = new Set(section.columns.map(column => column.key));
    return value.every(row => Object.keys(row).every(key => columns.has(key)) &&
      section.columns.every(column => {
        const cell = Object.hasOwn(row, column.key) ? row[column.key] : null;
        return cell === null || typeof cell === "string" || typeof cell === "boolean" ||
          (typeof cell === "number" && Number.isFinite(cell));
      }));
  });
}

export function validFilterDescriptor(value, inputs) {
  if (!hasOnlyKeys(value, ["component", "title", "field_ids"], ["component", "title", "field_ids"]) ||
      value.component !== "filters" || typeof value.title !== "string" || !value.title.trim() ||
      !Array.isArray(inputs) || !Array.isArray(value.field_ids) || value.field_ids.length === 0 ||
      new Set(value.field_ids).size !== value.field_ids.length || value.field_ids.length === inputs.length) return false;
  const fields = new Map(inputs.map(input => [input.id, input]));
  return value.field_ids.every(id => typeof id === "string" && IDENTIFIER.test(id) && !FORBIDDEN_NAMES.has(id) &&
    fields.has(id) && fields.get(id).required === false && ["text", "select", "number"].includes(fields.get(id).component));
}

export function rowKeys(rows, rowKey) {
  if (!Array.isArray(rows) || rows.some(row => !isRecord(row))) return null;
  if (rowKey === undefined) return rows.map((_, index) => `row-${index}`);
  if (!isDataPath(rowKey)) return null;
  const keys = rows.map(row => valueAt(row, rowKey));
  if (keys.some(key => (typeof key !== "string" || key.length === 0) &&
      (typeof key !== "number" || !Number.isFinite(key)))) return null;
  const normalized = keys.map(key => `${typeof key}:${key}`);
  return new Set(normalized).size === rows.length ? normalized : null;
}

export function validPaginationDescriptor(value) {
  return hasOnlyKeys(value, ["component", "mode"], ["component", "mode"]) &&
    value.component === "pagination" && value.mode === "page";
}

export function validPagination(value) {
  if (!hasOnlyKeys(value, ["mode", "page", "page_size", "total_items", "has_previous", "has_next"],
    ["mode", "page", "page_size", "total_items", "has_previous", "has_next"])) return false;
  return value.mode === "page" && Number.isSafeInteger(value.page) && value.page >= 1 &&
    Number.isSafeInteger(value.page_size) && value.page_size >= 1 &&
    Number.isSafeInteger(value.total_items) && value.total_items >= 0 &&
    typeof value.has_previous === "boolean" && typeof value.has_next === "boolean" &&
    value.has_previous === (value.page > 1) &&
    (!value.has_next || value.page < Math.ceil(value.total_items / value.page_size));
}

const COMMON_FIELD_KEYS = ["id", "component", "label", "description", "required", "format", "default", "placeholder"];
export function validBatchField(field) {
  if (!isRecord(field)) return false;
  const component = field.component;
  const extra = component === "number" ? ["min", "max", "step", "unit"] : component === "select" ? ["choices"] : [];
  if (!["text", "textarea", "number", "select"].includes(component) ||
      !hasOnlyKeys(field, [...COMMON_FIELD_KEYS, ...extra], ["id", "component", "label", "description", "required", "format"]) ||
      typeof field.id !== "string" || !IDENTIFIER.test(field.id) || FORBIDDEN_NAMES.has(field.id) ||
      typeof field.label !== "string" || !field.label.trim() || typeof field.description !== "string" ||
      typeof field.required !== "boolean" || (field.placeholder !== undefined && typeof field.placeholder !== "string")) return false;
  if (component !== "number") {
    if (field.format !== "text" || (field.default !== undefined && typeof field.default !== "string")) return false;
    return component !== "select" || (Array.isArray(field.choices) && field.choices.length > 0 &&
      field.choices.every(choice => typeof choice === "string") && new Set(field.choices).size === field.choices.length &&
      (field.default === undefined || field.choices.includes(field.default)));
  }
  if (!["integer", "float"].includes(field.format)) return false;
  const validNumber = number => typeof number === "number" && Number.isFinite(number) &&
    (field.format !== "integer" || Number.isSafeInteger(number));
  if (["min", "max", "default"].some(key => field[key] !== undefined && !validNumber(field[key]))) return false;
  if (field.min !== undefined && field.max !== undefined && field.min > field.max) return false;
  if (field.default !== undefined && ((field.min !== undefined && field.default < field.min) ||
      (field.max !== undefined && field.default > field.max))) return false;
  if (field.step !== undefined && !(field.step === "any" && field.format === "float") &&
      !(validNumber(field.step) && field.step > 0)) return false;
  return field.unit === undefined || (typeof field.unit === "string" && field.unit.trim().length > 0 && field.unit.length <= 32);
}
