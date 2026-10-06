import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  TRAINING_CONTRACT_VERSION,
  CONTACT_CONTRACT_VERSION,
  CONTRACT_VERSIONS,
  PACKAGE_TYPES,
  SHEET_NAMES,
  CONTACT_SHEET_NAMES,
  PRESENCE,
  PACKAGE_SHEETS,
  REFERENCE_LIST_SHEETS,
  REFERENCE_CODE_PATTERN,
  EMPLOYEE_CODE_PATTERN,
  REFERENCE_CODE_FIELDS,
  CASE_PRESERVED_FIELDS,
  NORMALIZATION_RULES,
  normalizeReferenceCode,
  normalizeIdentifier,
  duplicateKeyFor,
  ENUMS,
  FIELD_TYPES,
  CONTRACT_FIELDS,
  CONTACT_CONTRACT_FIELDS,
  ENTITIES,
  VALIDATION_CODES,
  VALIDATION_CODE_NAMES,
  SEVERITY,
  sheetPresence,
  requiredSheets,
  allowedSheets,
  mayWriteReferenceLists,
  fieldDefinition,
  severityOf,
} from '../src/lib/contract/schema.js';

const DOC = readFileSync(resolve(process.cwd(), 'docs/DATA-CONTRACT.md'), 'utf8');
const CONTACT_DOC = readFileSync(resolve(process.cwd(), 'docs/CONTACT-CONTRACT.md'), 'utf8');

describe('contract versions and package names match the documents literally', () => {
  it('uses the literal version strings', () => {
    expect(TRAINING_CONTRACT_VERSION).toBe('HSE-DC-1.0');
    expect(CONTACT_CONTRACT_VERSION).toBe('HSE-CONTACT-1.0');
    expect(CONTRACT_VERSIONS).toEqual({
      training: 'HSE-DC-1.0',
      contact: 'HSE-CONTACT-1.0',
    });
  });

  it('version strings appear in the specification documents', () => {
    expect(DOC).toContain(TRAINING_CONTRACT_VERSION);
    expect(CONTACT_DOC).toContain(CONTACT_CONTRACT_VERSION);
  });

  it('declares exactly the four documented package types', () => {
    expect(PACKAGE_TYPES).toEqual(['full', 'employees', 'requirements', 'training']);
  });

  it('declares exactly the documented sheet names', () => {
    expect(SHEET_NAMES).toEqual([
      '_Contract',
      'Departments',
      'Job_Titles',
      'Employees',
      'Courses',
      'Requirements',
      'Training_Records',
    ]);
    expect(CONTACT_SHEET_NAMES).toEqual(['_Contract', 'Contacts']);
  });
});

describe('required and allowed sheets per package type', () => {
  it('covers every package type and every sheet', () => {
    expect(Object.keys(PACKAGE_SHEETS)).toEqual([...PACKAGE_TYPES]);
    for (const type of PACKAGE_TYPES) {
      expect(Object.keys(PACKAGE_SHEETS[type])).toEqual([...SHEET_NAMES]);
    }
  });

  it('full requires every sheet', () => {
    expect(requiredSheets('full')).toEqual([...SHEET_NAMES]);
    expect(allowedSheets('full')).toEqual([...SHEET_NAMES]);
  });

  it('employees requires _Contract and Employees only', () => {
    expect(requiredSheets('employees')).toEqual(['_Contract', 'Employees']);
    expect(allowedSheets('employees')).toEqual(['_Contract', 'Employees']);
  });

  it('requirements requires _Contract and Requirements, allows Courses', () => {
    expect(requiredSheets('requirements')).toEqual(['_Contract', 'Requirements']);
    expect(allowedSheets('requirements')).toEqual(['_Contract', 'Courses', 'Requirements']);
    expect(sheetPresence('requirements', 'Courses')).toBe(PRESENCE.OPTIONAL);
  });

  it('training requires _Contract and Training_Records, allows Courses', () => {
    expect(requiredSheets('training')).toEqual(['_Contract', 'Training_Records']);
    expect(allowedSheets('training')).toEqual(['_Contract', 'Courses', 'Training_Records']);
  });

  it('treats unknown sheets and unknown package types safely', () => {
    expect(sheetPresence('training', 'Random_Sheet')).toBe(PRESENCE.FORBIDDEN);
    expect(sheetPresence('nope', '_Contract')).toBeUndefined();
    expect(requiredSheets('nope')).toEqual([]);
    expect(allowedSheets('nope')).toEqual([]);
  });

  it('uses only documented presence values', () => {
    const allowed = [PRESENCE.REQUIRED, PRESENCE.OPTIONAL, PRESENCE.FORBIDDEN];
    for (const type of PACKAGE_TYPES) {
      for (const value of Object.values(PACKAGE_SHEETS[type])) {
        expect(allowed).toContain(value);
      }
    }
  });
});

describe('partial packages cannot modify the HR reference lists', () => {
  it('names the two reference-list sheets', () => {
    expect(REFERENCE_LIST_SHEETS).toEqual(['Departments', 'Job_Titles']);
  });

  it('allows the lists only in a full package', () => {
    expect(mayWriteReferenceLists('full')).toBe(true);
    for (const type of PACKAGE_TYPES.filter((t) => t !== 'full')) {
      expect(mayWriteReferenceLists(type)).toBe(false);
      for (const sheet of REFERENCE_LIST_SHEETS) {
        expect(sheetPresence(type, sheet)).toBe(PRESENCE.FORBIDDEN);
        expect(allowedSheets(type)).not.toContain(sheet);
      }
    }
  });

  it('classifies such a sheet as a warning that is ignored', () => {
    expect(severityOf('SHEET_UNEXPECTED')).toBe(SEVERITY.WARN);
  });
});

describe('field definitions', () => {
  const entityNames = Object.keys(ENTITIES);

  it('defines every training sheet except _Contract, plus Contacts', () => {
    const expected = SHEET_NAMES.filter((name) => name !== '_Contract');
    for (const name of expected) expect(entityNames).toContain(name);
    expect(entityNames).toContain('Contacts');
  });

  it('has no duplicate field name inside a sheet', () => {
    for (const [sheet, entity] of Object.entries(ENTITIES)) {
      const names = entity.fields.map((f) => f.name);
      expect(new Set(names).size, `duplicate field in ${sheet}`).toBe(names.length);
    }
    for (const fields of [CONTRACT_FIELDS, CONTACT_CONTRACT_FIELDS]) {
      const names = fields.map((f) => f.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('uses only documented presence values and known types', () => {
    const presences = Object.values(PRESENCE);
    const types = Object.values(FIELD_TYPES);
    const all = [
      ...CONTRACT_FIELDS,
      ...CONTACT_CONTRACT_FIELDS,
      ...Object.values(ENTITIES).flatMap((e) => e.fields),
    ];
    for (const field of all) {
      expect(presences, field.name).toContain(field.presence);
      expect(types, field.name).toContain(field.type);
    }
  });

  it('gives every conditional field a documented condition', () => {
    const all = [
      ...CONTRACT_FIELDS,
      ...CONTACT_CONTRACT_FIELDS,
      ...Object.values(ENTITIES).flatMap((e) => e.fields),
    ];
    const conditional = all.filter((f) => f.presence === PRESENCE.CONDITIONAL);
    expect(conditional.length).toBeGreaterThan(0);
    for (const field of conditional) {
      expect(typeof field.condition, field.name).toBe('string');
      expect(field.condition.trim().length, field.name).toBeGreaterThan(10);
    }
  });

  it('marks the conditional fields the specification names', () => {
    const conditional = (sheet) =>
      ENTITIES[sheet].fields.filter((f) => f.presence === PRESENCE.CONDITIONAL).map((f) => f.name);
    expect(conditional('Employees')).toEqual(['status_effective_date']);
    expect(conditional('Training_Records')).toEqual(['completion_date', 'expiry_date']);
    expect(conditional('Contacts')).toEqual([
      'authorization_reference',
      'authorization_recorded_at',
    ]);
    expect(
      CONTRACT_FIELDS.filter((f) => f.presence === PRESENCE.CONDITIONAL).map((f) => f.name),
    ).toEqual(['source_system', 'requirements_effective_from']);
  });

  it('ties _Contract conditional fields to package types', () => {
    const byName = Object.fromEntries(CONTRACT_FIELDS.map((f) => [f.name, f]));
    expect(byName.source_system.requiredForPackageTypes).toEqual(['full', 'training']);
    expect(byName.requirements_effective_from.requiredForPackageTypes).toEqual([
      'full',
      'requirements',
    ]);
    expect(byName.contract_version.literal).toBe(TRAINING_CONTRACT_VERSION);
    expect(byName.package_type.values).toEqual([...PACKAGE_TYPES]);
  });

  it('declares keys that exist among the fields', () => {
    for (const [sheet, entity] of Object.entries(ENTITIES)) {
      expect(entity.key.length, sheet).toBeGreaterThan(0);
      for (const keyField of entity.key) {
        const def = fieldDefinition(sheet, keyField);
        expect(def, `${sheet}.${keyField}`).toBeDefined();
        expect(def.presence).toBe(PRESENCE.REQUIRED);
        expect(def.key).toBe(true);
      }
    }
  });

  it('uses the documented requirement key', () => {
    expect(ENTITIES.Requirements.key).toEqual([
      'department_code',
      'job_title_code',
      'course_code',
      'effective_from',
    ]);
  });

  it('keeps every enum field bound to a declared value list', () => {
    const lists = Object.values(ENUMS);
    const all = [
      ...CONTRACT_FIELDS,
      ...CONTACT_CONTRACT_FIELDS,
      ...Object.values(ENTITIES).flatMap((e) => e.fields),
    ];
    for (const field of all.filter((f) => f.type === FIELD_TYPES.ENUM)) {
      expect(Array.isArray(field.values), field.name).toBe(true);
      const known = field.name === 'package_type' || lists.some((l) => l === field.values);
      expect(known, field.name).toBe(true);
    }
  });

  it('accepts only not_defined as communication basis while P-01 is pending', () => {
    expect(ENUMS.communication_authorization_basis).toEqual(['not_defined']);
  });

  it('returns undefined for unknown sheets or fields', () => {
    expect(fieldDefinition('Nope', 'x')).toBeUndefined();
    expect(fieldDefinition('Employees', 'nope')).toBeUndefined();
  });
});

describe('unified reference-code pattern', () => {
  it('matches the documented pattern exactly', () => {
    expect(REFERENCE_CODE_PATTERN.source).toBe('^[A-Z0-9_-]{2,20}$');
    expect(DOC).toContain('`^[A-Z0-9_-]{2,20}$`');
  });

  it('accepts documented codes and rejects invalid ones', () => {
    for (const code of ['OPS', 'MNT', 'H2S-01', 'TEST_LMS', 'A1']) {
      expect(REFERENCE_CODE_PATTERN.test(code), code).toBe(true);
    }
    for (const code of ['O', 'ops', 'OPS 1', 'OPS.1', 'A'.repeat(21), '']) {
      expect(REFERENCE_CODE_PATTERN.test(code), code).toBe(false);
    }
  });

  it('applies the same pattern to every reference code field', () => {
    const codeFields = Object.values(ENTITIES)
      .flatMap((e) => e.fields)
      .concat(CONTRACT_FIELDS, CONTACT_CONTRACT_FIELDS)
      .filter((f) => f.type === FIELD_TYPES.CODE);
    expect(codeFields.length).toBeGreaterThan(0);
    for (const field of codeFields) {
      expect(REFERENCE_CODE_FIELDS, field.name).toContain(field.name);
      // Code fields must not carry a competing pattern of their own.
      expect(field.pattern, field.name).toBeUndefined();
    }
  });

  it('keeps employee_code and source_record_id out of the code pattern', () => {
    for (const name of CASE_PRESERVED_FIELDS) {
      expect(REFERENCE_CODE_FIELDS).not.toContain(name);
    }
    expect(EMPLOYEE_CODE_PATTERN.test('TST-0001')).toBe(true);
    expect(EMPLOYEE_CODE_PATTERN.test('tst-0001')).toBe(true);
  });
});

describe('normalisation makes ops and OPS one duplicate-detection key', () => {
  it('trims and upper-cases reference codes', () => {
    expect(normalizeReferenceCode('  ops ')).toBe('OPS');
    expect(normalizeReferenceCode('OPS')).toBe('OPS');
    expect(normalizeReferenceCode(null)).toBe('');
  });

  it('collapses ops and OPS to the same key', () => {
    expect(duplicateKeyFor('department_code', 'ops')).toBe(
      duplicateKeyFor('department_code', 'OPS'),
    );
    expect(duplicateKeyFor('course_code', ' h2s-01 ')).toBe('H2S-01');
  });

  it('keeps case-preserved identifiers distinct', () => {
    expect(normalizeIdentifier('  TST-0001 ')).toBe('TST-0001');
    expect(duplicateKeyFor('employee_code', 'tst-0001')).not.toBe(
      duplicateKeyFor('employee_code', 'TST-0001'),
    );
    expect(duplicateKeyFor('source_record_id', 'tr-1')).not.toBe(
      duplicateKeyFor('source_record_id', 'TR-1'),
    );
  });

  it('records the rule in the normalisation definitions', () => {
    expect(NORMALIZATION_RULES.referenceCode.upperCase).toBe(true);
    expect(NORMALIZATION_RULES.referenceCode.duplicateDetectionAfterNormalization).toBe(true);
    expect(NORMALIZATION_RULES.referenceCode.matchByDisplayName).toBe(false);
    expect(NORMALIZATION_RULES.caseSensitiveIdentifier.compare).toBe('exact');
    expect(NORMALIZATION_RULES.caseSensitiveIdentifier.upperCase).toBe(false);
    expect(NORMALIZATION_RULES.date.acceptExcelSerialWithDayFraction).toBe(false);
    expect(NORMALIZATION_RULES.date.acceptSlashSeparators).toBe(false);
    expect(NORMALIZATION_RULES.date.timeZone).toBe('Asia/Riyadh');
  });
});

describe('validation code register', () => {
  it('has no duplicate code name', () => {
    expect(new Set(VALIDATION_CODE_NAMES).size).toBe(VALIDATION_CODE_NAMES.length);
  });

  it('gives every code a documented severity', () => {
    const severities = Object.values(SEVERITY);
    for (const [code, entry] of Object.entries(VALIDATION_CODES)) {
      expect(severities, code).toContain(entry.severity);
    }
  });

  it('matches the severities stated in the specification', () => {
    expect(severityOf('KEY_DUPLICATE')).toBe(SEVERITY.BLOCK);
    expect(severityOf('JOB_TITLE_SCOPE')).toBe(SEVERITY.BLOCK);
    expect(severityOf('COMPLETED_WITHOUT_EXPIRY')).toBe(SEVERITY.BLOCK);
    expect(severityOf('REQ_VERSION_EXISTS')).toBe(SEVERITY.BLOCK);
    expect(severityOf('CONTACT_BASIS_UNKNOWN')).toBe(SEVERITY.BLOCK);
    expect(severityOf('EXPIRY_VALIDITY_MISMATCH')).toBe(SEVERITY.WARN);
    expect(severityOf('SHEET_UNEXPECTED')).toBe(SEVERITY.WARN);
    expect(severityOf('CERT_MISSING')).toBe(SEVERITY.WARN);
    expect(severityOf('SUGGESTED_VALIDITY_DIFFERS')).toBe(SEVERITY.INFO);
    expect(severityOf('RECORD_UNCHANGED')).toBe(SEVERITY.INFO);
    expect(severityOf('NOT_A_CODE')).toBeUndefined();
  });

  it('declares every code that the specification lists', () => {
    const fromDoc = new Set(
      [...DOC.matchAll(/^\| `([A-Z][A-Z0-9_]+)` \| (block|warn|info)/gm)].map((m) => m[1]),
    );
    expect(fromDoc.size).toBeGreaterThan(30);
    for (const code of fromDoc) expect(VALIDATION_CODE_NAMES).toContain(code);
  });

  it('declares the contact codes with their contract', () => {
    for (const code of [
      'CONTACT_EMAIL_INVALID',
      'CONTACT_PHONE_INVALID',
      'CONTACT_BASIS_UNKNOWN',
      'CONTACT_BASIS_EVIDENCE_MISSING',
      'CONTACT_CHANNEL_WITHOUT_VALUE',
      'CONTACT_FOR_INACTIVE',
    ]) {
      expect(VALIDATION_CODES[code].contract).toBe(CONTACT_CONTRACT_VERSION);
    }
  });
});

describe('definitions cannot be changed by accident', () => {
  it('freezes the exported structures deeply', () => {
    expect(Object.isFrozen(PACKAGE_SHEETS)).toBe(true);
    expect(Object.isFrozen(PACKAGE_SHEETS.full)).toBe(true);
    expect(Object.isFrozen(ENTITIES.Employees.fields)).toBe(true);
    expect(Object.isFrozen(ENTITIES.Employees.fields[0])).toBe(true);
    expect(Object.isFrozen(VALIDATION_CODES.KEY_DUPLICATE)).toBe(true);
    expect(Object.isFrozen(PACKAGE_TYPES)).toBe(true);
  });

  it('does not let a mutation take effect', () => {
    expect(() => {
      'use strict';
      PACKAGE_SHEETS.employees.Departments = PRESENCE.REQUIRED;
    }).toThrow();
    expect(PACKAGE_SHEETS.employees.Departments).toBe(PRESENCE.FORBIDDEN);
  });

  it('returns copies-by-reference that callers cannot grow', () => {
    expect(() => {
      'use strict';
      PACKAGE_TYPES.push('other');
    }).toThrow();
    expect(PACKAGE_TYPES).toHaveLength(4);
  });
});

describe('module scope', () => {
  const SOURCE = readFileSync(resolve(process.cwd(), 'src/lib/contract/schema.js'), 'utf8');

  it('contains no XLSX parsing, network or new dependency', () => {
    expect(SOURCE).not.toMatch(/from\s+['"]xlsx['"]/);
    expect(SOURCE).not.toMatch(/\bfetch\s*\(/);
    expect(SOURCE).not.toMatch(/XMLHttpRequest|supabase/i);
    expect(SOURCE).not.toMatch(/^import /m);
  });
});
