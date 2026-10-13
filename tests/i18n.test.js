import { describe, it, expect } from 'vitest';
import { createI18n } from '../src/lib/i18n.js';

describe('the requirements matrix keys', () => {
  const KEYS = [
    'appliesTo', 'appliesToHint', 'selectAll', 'employeeCount', 'requiredCount',
    'noRolesSelected', 'recordTraining', 'completionDate', 'expiryDateLabel',
    'certificateNumberLabel', 'attendees', 'showAllEmployees', 'saveRecords',
    'editRecord', 'approveMatrix', 'approvedBy', 'approvalPending',
    'importReplaceTitle', 'importReplaceBody', 'importReplaceConfirm',
    'trqDraft', 'trqManaged',
  ];

  for (const lang of ['en', 'ar']) {
    it(`has every key in ${lang}`, () => {
      const { t } = createI18n(lang);
      for (const key of KEYS) {
        expect(t(key), `${lang}.${key}`).toBeTruthy();
        // A missing key must not fall through to the key name itself.
        expect(t(key), `${lang}.${key}`).not.toBe(key);
      }
    });
  }
});
