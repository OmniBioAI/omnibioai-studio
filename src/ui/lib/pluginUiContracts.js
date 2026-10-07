// Finite presentation contracts shared by validation and the UI primitives.
// No field in these objects is evaluated, imported, or resolved as a callback.
const FORBIDDEN_NAMES = new Set(["__proto__", "prototype", "constructor", "password", "token", "api_key", "secret", "credentials"]);
const IDENTIFIER = /^[a-z][a-z0-9_]*$/;
const URI_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
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
