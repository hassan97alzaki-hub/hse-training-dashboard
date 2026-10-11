/**
 * Import banners as data, rendered in the language on screen.
 *
 * A banner used to be built as finished text at the moment of the import, so
 * switching the language afterwards left it in the old language. The state now
 * holds a descriptor — a kind plus its numbers — and `renderImportBanner`
 * turns it into a title and lines with the current `t`.
 *
 * Only numbers, codes and messages that already come from a translated source
 * belong in a descriptor. A descriptor never carries a name, an employee code
 * or any other personal value.
 */

/** The banners the application can raise. */
export const BANNER_KIND = Object.freeze({
  DEMO_LOADED: 'demoLoaded',
  IMPORT_SUCCESS: 'importSuccess',
  IMPORT_ERROR: 'importError',
  REQUIREMENTS_LOADED: 'requirementsLoaded',
  MATRIX_APPROVED: 'matrixApproved',
  PRODUCTION_APPROVED: 'productionApproved',
  PRODUCTION_BLOCKED: 'productionBlocked',
  TRIAL_BLOCKED: 'trialBlocked',
  DATA_RESET: 'dataReset',
});

/** Build a descriptor. `data` holds numbers and already-safe strings only. */
export function banner(kind, type, data = {}) {
  return Object.freeze({ kind, type, ...data });
}

/**
 * Render a descriptor with the current translator.
 *
 * An unknown kind, or a descriptor that already carries a finished `title`,
 * is returned as it is, so a caller may still raise a one-off banner.
 */
export function renderImportBanner(descriptor, t) {
  if (!descriptor) return null;
  const lines = [];

  switch (descriptor.kind) {
    case BANNER_KIND.DEMO_LOADED:
      return {
        type: descriptor.type,
        title: t('demoLoaded'),
        lines: [
          `${t('importTrainingData')}: ${descriptor.validRecords} ${t('validRecords')}, ${descriptor.invalidRecords} ${t('invalidRecords')}, ${descriptor.duplicateGroups} ${t('duplicateGroups')}`,
          `${t('importRequirements')}: ${descriptor.requirementRows} ${t('rowsLoaded')}`,
        ],
      };

    case BANNER_KIND.IMPORT_SUCCESS:
      lines.push(
        `${descriptor.validRecords} ${t('validRecords')}, ${descriptor.invalidRecords} ${t('invalidRecords')}, ${descriptor.duplicateGroups} ${t('duplicateGroups')}`,
      );
      // Warnings arrive from the importer already written for a reader.
      lines.push(...(descriptor.warnings ?? []));
      return { type: descriptor.type, title: t('importSuccess'), lines };

    case BANNER_KIND.REQUIREMENTS_LOADED:
      return {
        type: descriptor.type,
        title: `${t('requirementsLoadedTitle')} — ${descriptor.rows} ${t('rowsLoaded')}`,
        lines: descriptor.warnings ?? [],
      };

    case BANNER_KIND.MATRIX_APPROVED:
      return {
        type: descriptor.type,
        title: t('importSuccess'),
        lines: [
          `${descriptor.importedRecords} ${t('mxBannerImported')} · ${descriptor.skippedNoEvidence} ${t('mxCountSkipped')}`,
          `${descriptor.requirementRows} ${t('mxCountRequirements')}`,
        ],
      };

    case BANNER_KIND.PRODUCTION_APPROVED:
      return {
        type: descriptor.type,
        title: t('ppApprovedTitle'),
        lines: [
          `${descriptor.rowsNew} ${t('ppApprovedRows')} · ${descriptor.changed} ${t('ppApprovedChanged')} · ${descriptor.unchanged} ${t('ppApprovedUnchanged')}`,
          `${t('ppOrgBound')}: ${descriptor.organizationCode}`,
        ],
      };

    case BANNER_KIND.PRODUCTION_BLOCKED:
      return {
        type: descriptor.type,
        title: t('ppBlockedNote'),
        lines: [`${t('ppBlocks')}: ${descriptor.blocking}`],
      };

    case BANNER_KIND.TRIAL_BLOCKED:
      return { type: descriptor.type, title: t('trialImportBlocked'), lines: [] };

    case BANNER_KIND.DATA_RESET:
      return { type: descriptor.type, title: t('dataReset'), lines: [] };

    case BANNER_KIND.IMPORT_ERROR:
      // The messages come from the importer or from an exception; they are
      // shown as they are, because no translation of them exists.
      return { type: descriptor.type, title: t('importError'), lines: descriptor.errors ?? [] };

    default:
      return descriptor.title !== undefined ? descriptor : null;
  }
}
