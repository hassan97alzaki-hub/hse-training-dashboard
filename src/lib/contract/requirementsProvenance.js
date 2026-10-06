/**
 * Where the loaded requirements come from, and whether the dashboard may be
 * read as a compliance result.
 *
 * Only an approved `HSE-DC-1.0` `Requirements` sheet is a production source
 * (`docs/DATA-CONTRACT.md` §3.5, §5.5). Everything else — the derived rows of
 * the three-sheet test workbook, the demo data, a legacy CSV — is test
 * scaffolding, and the interface has to say so (AT-13).
 *
 * Pure module: no clock, no storage, no network.
 */

export const REQUIREMENTS_PROVENANCE = Object.freeze({
  NONE: 'none',
  APPROVED: 'approved',
  DERIVED: 'derived',
  DEMO: 'demo',
  LEGACY: 'legacy',
});

/** Provenances that do not carry approved production requirements. */
export const TEST_PROVENANCES = Object.freeze([
  REQUIREMENTS_PROVENANCE.DERIVED,
  REQUIREMENTS_PROVENANCE.DEMO,
  REQUIREMENTS_PROVENANCE.LEGACY,
]);

/** A row produced by the department-level mapping of the test workbook. */
export function isDerivedRequirement(row) {
  return row?.Derived === true;
}

/**
 * Resolve the provenance of the loaded requirements.
 *
 * `declared` is what the import path says it loaded. A derived marker on any
 * row wins over the declaration, so a test row can never be presented as an
 * approved requirement, whatever the caller claims.
 */
export function resolveRequirementsProvenance(requirements, declared = REQUIREMENTS_PROVENANCE.NONE) {
  const rows = Array.isArray(requirements) ? requirements : [];
  if (rows.length === 0) return REQUIREMENTS_PROVENANCE.NONE;
  if (rows.some(isDerivedRequirement)) return REQUIREMENTS_PROVENANCE.DERIVED;
  if (!Object.values(REQUIREMENTS_PROVENANCE).includes(declared)) {
    return REQUIREMENTS_PROVENANCE.LEGACY;
  }
  // Rows exist, so `none` is not a possible answer any more.
  return declared === REQUIREMENTS_PROVENANCE.NONE ? REQUIREMENTS_PROVENANCE.LEGACY : declared;
}

/** True when the loaded requirements are test scaffolding, not approved data. */
export function isTestRequirements(provenance) {
  return TEST_PROVENANCES.includes(provenance);
}

/** The i18n key that explains this provenance. */
export function provenanceMessageKey(provenance) {
  switch (provenance) {
    case REQUIREMENTS_PROVENANCE.DERIVED:
      return 'trqDerived';
    case REQUIREMENTS_PROVENANCE.DEMO:
      return 'trqDemo';
    case REQUIREMENTS_PROVENANCE.LEGACY:
      return 'trqLegacy';
    default:
      return '';
  }
}
