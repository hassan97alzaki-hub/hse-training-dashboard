import { describe, it, expect } from 'vitest';

import { SEVERITY } from '../src/lib/contract/schema.js';
import {
  createApprovedState,
  normalizeApprovalTime,
  recordSignature,
  clearOrganizationBinding,
  bindOrganization,
  checkOrganizationBinding,
  stageBatch,
  applyBatch,
  stageAndApply,
  previousDay,
  requiredFieldsOf,
  STAGED_STATUS,
} from '../src/lib/contract/staging.js';

const ORG = 'TST-ORG';
const SYSTEM = 'TEST-LMS';
const T1 = '2027-01-05T08:00:00Z';
const T2 = '2027-02-05T08:00:00Z';
const T1_UTC = '2027-01-05T08:00:00.000Z';

const employee = (code, overrides = {}) => ({
  _row: 2,
  employee_code: code,
  full_name: `Test Employee ${code}`,
  department_code: 'OPS',
  job_title_code: 'OPR',
  employment_status: 'Active',
  ...overrides,
});

const record = (id, overrides = {}) => ({
  _row: 2,
  source_system: SYSTEM,
  source_record_id: id,
  employee_code: 'TST-0001',
  course_code: 'H2S-01',
  completion_status: 'Completed',
  completion_date: '2026-01-15',
  expiry_date: '2028-01-15',
  certificate_number: `C-${id}`,
  ...overrides,
});

const requirement = (overrides = {}) => ({
  _row: 2,
  department_code: 'OPS',
  job_title_code: 'OPR',
  course_code: 'H2S-01',
  requirement_type: 'Mandatory',
  validity_months: 24,
  effective_from: '2027-01-01',
  effective_to: '',
  approval_reference: 'TRN-DEC-0001',
  approved_by_role: 'Training Manager',
  approved_on: '2026-12-15',
  source: 'approved',
  ...overrides,
});

const batch = (overrides = {}) => ({
  batchId: 'B-1',
  packageType: 'full',
  organizationCode: ORG,
  sourceSystem: SYSTEM,
  extractDate: '2027-01-10',
  asOfDate: '2027-01-12',
  preparedByRole: 'Training Coordinator',
  approvedByRole: 'Training Manager',
  approvedAt: T1,
  ...overrides,
});

const codes = (result) => result.issues.map((entry) => entry.code);
const of = (result, code) => result.issues.filter((entry) => entry.code === code);

describe('organization binding (§6)', () => {
  it('binds the first full package and accepts the same organization later', () => {
    const empty = createApprovedState();
    expect(checkOrganizationBinding(empty, { packageType: 'full', organizationCode: ORG })).toEqual([]);

    const bound = bindOrganization(empty, 'tst-org');
    expect(bound.ok).toBe(true);
    expect(bound.state.organizationCode).toBe(ORG);
    expect(empty.organizationCode).toBe('');
    expect(
      checkOrganizationBinding(bound.state, { packageType: 'training', organizationCode: ORG }),
    ).toEqual([]);
  });

  it('blocks a partial package before any binding', () => {
    const empty = createApprovedState();
    for (const packageType of ['employees', 'requirements', 'training']) {
      const issues = checkOrganizationBinding(empty, { packageType, organizationCode: ORG });
      expect(issues.map((entry) => entry.code), packageType).toEqual(['ORG_NOT_LOADED']);
      expect(issues[0].severity).toBe(SEVERITY.BLOCK);
    }
  });

  it('blocks another organization', () => {
    const state = bindOrganization(createApprovedState(), ORG).state;
    const issues = checkOrganizationBinding(state, {
      packageType: 'full',
      organizationCode: 'OTHER-ORG',
    });
    expect(issues.map((entry) => entry.code)).toEqual(['ORG_MISMATCH']);
  });

  it('reports a missing organization_code', () => {
    expect(
      checkOrganizationBinding(createApprovedState(), { packageType: 'full' }).map((e) => e.code),
    ).toEqual(['CONTRACT_FIELD']);
    expect(bindOrganization(createApprovedState(), '  ').ok).toBe(false);
  });

  it('clears the binding, the data, the batches and the change log', () => {
    const state = createApprovedState({
      organizationCode: ORG,
      employees: [employee('TST-0001')],
      batches: [{ batchId: 'B-0' }],
      changeLog: [{ batchId: 'B-0', sheet: 'Employees', key: 'TST-0001', field: 'full_name' }],
      requirementsSource: 'derived',
    });
    const cleared = clearOrganizationBinding(state);
    expect(cleared).toEqual(createApprovedState());
    expect(cleared.organizationCode).toBe('');
    expect(cleared.employees).toHaveLength(0);
    expect(cleared.requirementsSource).toBe('none');
    // Nothing of one organization may travel into the next.
    expect(cleared.batches).toHaveLength(0);
    expect(cleared.changeLog).toHaveLength(0);
    // The original state is untouched.
    expect(state.employees).toHaveLength(1);
    expect(state.organizationCode).toBe(ORG);
  });

  it('refuses to move a bound state to another organization', () => {
    const bound = bindOrganization(createApprovedState({ employees: [employee('TST-0001')] }), ORG);
    const moved = bindOrganization(bound.state, 'OTHER-ORG');
    expect(moved.ok).toBe(false);
    expect(moved.issues.map((entry) => entry.code)).toEqual(['ORG_MISMATCH']);
    expect(moved.state).toBe(bound.state);
    expect(moved.state.organizationCode).toBe(ORG);
  });

  it('accepts the same organization again without touching the state', () => {
    const bound = bindOrganization(createApprovedState(), ORG);
    const again = bindOrganization(bound.state, 'tst-org');
    expect(again.ok).toBe(true);
    expect(again.state).toBe(bound.state);
  });

  it('carries nothing from the previous organization after a reset', async () => {
    const first = await stageAndApply(
      createApprovedState(),
      batch({ employees: [employee('TST-0001')], records: [record('TR-1')] }),
    );
    expect(first.state.batches).toHaveLength(1);

    const reset = clearOrganizationBinding(first.state);
    const second = await stageAndApply(
      reset,
      batch({ batchId: 'B-9', approvedAt: T2, organizationCode: 'OTHER-ORG', employees: [employee('TST-0009')] }),
    );
    expect(second.ok).toBe(true);
    expect(second.state.organizationCode).toBe('OTHER-ORG');
    expect(second.state.employees.map((row) => row.employee_code)).toEqual(['TST-0009']);
    expect(second.state.records).toHaveLength(0);
    expect(second.state.batches.map((row) => row.batchId)).toEqual(['B-9']);
    expect(second.state.changeLog.every((entry) => entry.batchId === 'B-9')).toBe(true);
  });

  it('binds on applying the first full package', async () => {
    const result = await stageAndApply(createApprovedState(), batch({ employees: [employee('TST-0001')] }));
    expect(result.ok).toBe(true);
    expect(result.state.organizationCode).toBe(ORG);
  });
});

describe('classification: new, changed, unchanged, conflict', () => {
  it('classifies a first import as new', async () => {
    const plan = await stageBatch(createApprovedState(), batch({ employees: [employee('TST-0001')] }));
    expect(plan.ok).toBe(true);
    expect(plan.sheets.Employees.entries[0]).toMatchObject({
      status: STAGED_STATUS.NEW,
      key: 'TST-0001',
    });
    expect(plan.counts['Employees.new']).toBe(1);
  });

  it('classifies an identical re-import as unchanged and changes nothing', async () => {
    const first = await stageAndApply(
      createApprovedState(),
      batch({ employees: [employee('TST-0001')] }),
    );
    const second = await stageAndApply(
      first.state,
      batch({ batchId: 'B-2', approvedAt: T2, employees: [employee('TST-0001')] }),
    );
    expect(second.plan.sheets.Employees.entries[0].status).toBe(STAGED_STATUS.UNCHANGED);
    expect(second.state.employees).toEqual(first.state.employees);
    expect(second.state.changeLog).toHaveLength(first.state.changeLog.length);
  });

  it('classifies a different value as changed and applies it', async () => {
    const first = await stageAndApply(
      createApprovedState(),
      batch({ employees: [employee('TST-0001')] }),
    );
    const second = await stageAndApply(
      first.state,
      batch({
        batchId: 'B-2',
        approvedAt: T2,
        employees: [employee('TST-0001', { department_code: 'MNT' })],
      }),
    );
    const entry = second.plan.sheets.Employees.entries[0];
    expect(entry.status).toBe(STAGED_STATUS.CHANGED);
    expect(entry.changedFields).toEqual(['department_code']);
    expect(second.state.employees[0].department_code).toBe('MNT');
    expect(first.state.employees[0].department_code).toBe('OPS');
  });

  it('refuses the whole batch when it is older than an approved value', async () => {
    const newer = await stageAndApply(
      createApprovedState(),
      batch({ approvedAt: T2, employees: [employee('TST-0001', { department_code: 'MNT' })] }),
    );
    const older = await stageAndApply(
      newer.state,
      batch({
        batchId: 'B-0',
        approvedAt: T1,
        employees: [employee('TST-0001', { department_code: 'OPS' })],
      }),
    );
    expect(of(older.plan, 'BATCH_OLDER')[0]).toMatchObject({
      sheet: 'Employees',
      field: 'department_code',
      severity: SEVERITY.BLOCK,
    });
    expect(older.plan.ok).toBe(false);
    expect(older.applied).toBe(false);
    expect(older.state).toBe(newer.state);
    expect(older.plan.sheets.Employees.entries[0].status).toBe(STAGED_STATUS.CONFLICT);
    expect(older.plan.counts.conflicts).toBe(1);
  });
});

describe('absence, blanks and explicit clearing', () => {
  it('leaves an employee untouched when the batch does not mention it', async () => {
    const first = await stageAndApply(
      createApprovedState(),
      batch({ employees: [employee('TST-0001'), employee('TST-0002')] }),
    );
    const second = await stageAndApply(
      first.state,
      batch({ batchId: 'B-2', approvedAt: T2, employees: [employee('TST-0001')] }),
    );
    expect(second.state.employees).toHaveLength(2);
    expect(second.state.employees.find((row) => row.employee_code === 'TST-0002')).toBeDefined();
  });

  it('keeps the approved value for a blank cell', async () => {
    const first = await stageAndApply(
      createApprovedState(),
      batch({ employees: [employee('TST-0001', { badge_number: 'B-1' })] }),
    );
    // A blank cell is absent from a normalised row, so nothing is cleared.
    const second = await stageAndApply(
      first.state,
      batch({ batchId: 'B-2', approvedAt: T2, employees: [employee('TST-0001')] }),
    );
    expect(second.state.employees[0].badge_number).toBe('B-1');
    expect(second.plan.sheets.Employees.entries[0].status).toBe(STAGED_STATUS.UNCHANGED);
  });

  it('clears a field only on an explicit list', async () => {
    const first = await stageAndApply(
      createApprovedState(),
      batch({ employees: [employee('TST-0001', { badge_number: 'B-1' })] }),
    );
    const second = await stageAndApply(
      first.state,
      batch({
        batchId: 'B-2',
        approvedAt: T2,
        employees: [employee('TST-0001')],
        clear: { Employees: { 'TST-0001': ['badge_number'] } },
      }),
    );
    expect(second.plan.sheets.Employees.entries[0].status).toBe(STAGED_STATUS.CHANGED);
    expect('badge_number' in second.state.employees[0]).toBe(false);
    expect(first.state.employees[0].badge_number).toBe('B-1');
  });

  it('lets an explicit clear win over a value in the same batch', async () => {
    const first = await stageAndApply(
      createApprovedState(),
      batch({ employees: [employee('TST-0001', { badge_number: 'B-1' })] }),
    );
    const second = await stageAndApply(
      first.state,
      batch({
        batchId: 'B-2',
        approvedAt: T2,
        // The row carries a new badge and the clear list names the same field.
        employees: [employee('TST-0001', { badge_number: 'B-2' })],
        clear: { Employees: { 'TST-0001': ['badge_number'] } },
      }),
    );
    expect(second.ok).toBe(true);
    expect(second.plan.sheets.Employees.entries[0].status).toBe(STAGED_STATUS.CHANGED);
    expect('badge_number' in second.state.employees[0]).toBe(false);
  });

  it('refuses to clear a required field', async () => {
    const first = await stageAndApply(
      createApprovedState(),
      batch({ employees: [employee('TST-0001')] }),
    );
    const plan = await stageBatch(
      first.state,
      batch({
        batchId: 'B-2',
        approvedAt: T2,
        employees: [employee('TST-0001')],
        clear: { Employees: { 'TST-0001': ['full_name'] } },
      }),
    );
    expect(plan.ok).toBe(false);
    expect(of(plan, 'REQUIRED_EMPTY')[0]).toMatchObject({
      sheet: 'Employees',
      field: 'full_name',
      severity: SEVERITY.BLOCK,
    });
    const applied = applyBatch(first.state, plan);
    expect(applied.applied).toBe(false);
    expect(applied.state).toBe(first.state);
    expect(requiredFieldsOf('Employees')).toContain('full_name');
    expect(requiredFieldsOf('Nope')).toEqual([]);
  });
});

describe('training record identity and versions (§3.7)', () => {
  it('appends a new version and keeps the previous one', async () => {
    const first = await stageAndApply(createApprovedState(), batch({ records: [record('TR-1')] }));
    const second = await stageAndApply(
      first.state,
      batch({
        batchId: 'B-2',
        approvedAt: T2,
        records: [record('TR-1', { expiry_date: '2028-06-30' })],
      }),
    );
    expect(second.plan.sheets.Training_Records.entries[0]).toMatchObject({
      status: STAGED_STATUS.CHANGED,
      version: 2,
    });
    expect(second.state.records).toHaveLength(2);
    expect(second.state.records.map((row) => row._version)).toEqual([1, 2]);
    expect(second.state.records[0].expiry_date).toBe('2028-01-15');
  });

  it('blocks a different employee or course for the same record key', async () => {
    const first = await stageAndApply(createApprovedState(), batch({ records: [record('TR-1')] }));
    for (const change of [{ employee_code: 'TST-0002' }, { course_code: 'FA-01' }]) {
      const plan = await stageBatch(
        first.state,
        batch({ batchId: 'B-2', approvedAt: T2, records: [record('TR-1', change)] }),
      );
      expect(plan.ok, JSON.stringify(change)).toBe(false);
      expect(of(plan, 'RECORD_IDENTITY_CHANGED')[0]).toMatchObject({
        sheet: 'Training_Records',
        field: 'source_record_id',
        severity: SEVERITY.BLOCK,
      });
      expect(applyBatch(first.state, plan).state).toBe(first.state);
    }
  });

  it('treats the same record content as a no-op', async () => {
    const first = await stageAndApply(createApprovedState(), batch({ records: [record('TR-1')] }));
    const second = await stageAndApply(
      first.state,
      batch({ batchId: 'B-2', approvedAt: T2, records: [record('TR-1')] }),
    );
    expect(codes(second.plan)).toContain('RECORD_UNCHANGED');
    expect(second.state.records).toEqual(first.state.records);
  });

  it('separates two source systems with the same record id', async () => {
    const first = await stageAndApply(createApprovedState(), batch({ records: [record('TR-1')] }));
    const second = await stageAndApply(
      first.state,
      batch({
        batchId: 'B-2',
        approvedAt: T2,
        sourceSystem: 'OTHER-LMS',
        records: [record('TR-1', { source_system: 'OTHER-LMS', certificate_number: 'C-X' })],
      }),
    );
    expect(second.plan.sheets.Training_Records.entries[0].status).toBe(STAGED_STATUS.NEW);
    expect(second.state.records).toHaveLength(2);
  });

  it('refuses an older batch that would replace a newer record version', async () => {
    const newer = await stageAndApply(
      createApprovedState(),
      batch({ approvedAt: T2, records: [record('TR-1', { expiry_date: '2029-01-15' })] }),
    );
    const older = await stageAndApply(
      newer.state,
      batch({ batchId: 'B-0', approvedAt: T1, records: [record('TR-1')] }),
    );
    expect(of(older.plan, 'BATCH_OLDER')[0]).toMatchObject({
      sheet: 'Training_Records',
      field: 'source_record_id',
      severity: SEVERITY.BLOCK,
    });
    expect(older.applied).toBe(false);
    expect(older.state).toBe(newer.state);
    expect(older.state.records).toHaveLength(1);
    expect(older.state.records[0].expiry_date).toBe('2029-01-15');
  });
});

describe('duplicates across batches', () => {
  it('warns about a badge already held by another approved employee', async () => {
    const first = await stageAndApply(
      createApprovedState(),
      batch({ employees: [employee('TST-0001', { badge_number: 'B-1' })] }),
    );
    const plan = await stageBatch(
      first.state,
      batch({
        batchId: 'B-2',
        approvedAt: T2,
        employees: [employee('TST-0002', { badge_number: 'B-1' })],
      }),
    );
    expect(of(plan, 'BADGE_DUPLICATE')[0]).toMatchObject({ severity: SEVERITY.WARN });
    expect(plan.ok).toBe(true);
  });

  it('does not warn when the same employee keeps its badge', async () => {
    const first = await stageAndApply(
      createApprovedState(),
      batch({ employees: [employee('TST-0001', { badge_number: 'B-1' })] }),
    );
    const plan = await stageBatch(
      first.state,
      batch({
        batchId: 'B-2',
        approvedAt: T2,
        employees: [employee('TST-0001', { badge_number: 'B-1' })],
      }),
    );
    expect(codes(plan)).not.toContain('BADGE_DUPLICATE');
  });

  it('warns about a certificate number already approved under another record', async () => {
    const first = await stageAndApply(createApprovedState(), batch({ records: [record('TR-1')] }));
    const plan = await stageBatch(
      first.state,
      batch({
        batchId: 'B-2',
        approvedAt: T2,
        records: [record('TR-2', { certificate_number: 'c-tr-1', course_code: 'FA-01' })],
      }),
    );
    expect(of(plan, 'CERT_DUPLICATE')[0]).toMatchObject({ severity: SEVERITY.WARN });
  });

  it('warns about an approved fingerprint under a new record id', async () => {
    const first = await stageAndApply(createApprovedState(), batch({ records: [record('TR-1')] }));
    const plan = await stageBatch(
      first.state,
      batch({
        batchId: 'B-2',
        approvedAt: T2,
        records: [record('TR-2', { certificate_number: 'C-TR-1' })],
      }),
    );
    expect(of(plan, 'POSSIBLE_DUPLICATE_RECORD')[0]).toMatchObject({ severity: SEVERITY.WARN });
    // Nothing is merged: the second record is still staged as new.
    expect(plan.sheets.Training_Records.entries[0].status).toBe(STAGED_STATUS.NEW);
  });
});

describe('requirements: versions, closing and derived data', () => {
  it('closes the rows of the listed department only, on a new version', async () => {
    const opsOld = requirement({ effective_from: '2026-01-01' });
    const mntOld = requirement({ effective_from: '2026-01-01', department_code: 'MNT' });
    const state = createApprovedState({
      organizationCode: ORG,
      requirements: [opsOld, mntOld],
      requirementsSource: 'approved',
    });
    const result = await stageAndApply(
      state,
      batch({
        packageType: 'requirements',
        requirementsEffectiveFrom: '2027-01-01',
        requirements: [requirement()],
        rowsToClose: [opsOld],
      }),
    );
    expect(result.ok).toBe(true);
    const ops = result.state.requirements.filter((row) => row.department_code === 'OPS');
    const mnt = result.state.requirements.filter((row) => row.department_code === 'MNT');
    expect(ops.find((row) => row.effective_from === '2026-01-01').effective_to).toBe('2026-12-31');
    expect(ops.find((row) => row.effective_from === '2027-01-01')).toBeDefined();
    // The other department keeps its approved row open and unchanged.
    expect(mnt).toHaveLength(1);
    expect(mnt[0].effective_to).toBe('');
    // The original row is kept in the history, and the input is unchanged.
    expect(result.state.requirementHistory).toHaveLength(1);
    expect(opsOld.effective_to).toBe('');
  });

  it('computes the closing day as the day before the new version', () => {
    expect(previousDay('2027-01-01')).toBe('2026-12-31');
    expect(previousDay('2027-03-01')).toBe('2027-02-28');
    expect(previousDay('')).toBe('');
    expect(previousDay('nonsense')).toBe('');
  });

  it('blocks a production batch sitting on derived requirements', async () => {
    const state = createApprovedState({ organizationCode: ORG, requirementsSource: 'derived' });
    const blocked = await stageBatch(state, batch({ packageType: 'training', records: [record('TR-1')] }));
    expect(of(blocked, 'REQ_ON_DERIVED')[0]).toMatchObject({ severity: SEVERITY.BLOCK });
    expect(applyBatch(state, blocked).state).toBe(state);

    const replacing = await stageAndApply(
      state,
      batch({
        packageType: 'full',
        requirementsEffectiveFrom: '2027-01-01',
        requirements: [requirement()],
      }),
    );
    expect(replacing.ok).toBe(true);
    expect(replacing.state.requirementsSource).toBe('approved');
  });

  it('marks an identical requirements version as unchanged', async () => {
    const first = await stageAndApply(
      createApprovedState({ organizationCode: ORG }),
      batch({ requirementsEffectiveFrom: '2027-01-01', requirements: [requirement()] }),
    );
    const second = await stageAndApply(
      first.state,
      batch({
        batchId: 'B-2',
        approvedAt: T2,
        requirementsEffectiveFrom: '2027-01-01',
        requirements: [requirement()],
      }),
    );
    expect(second.plan.sheets.Requirements.entries[0].status).toBe(STAGED_STATUS.UNCHANGED);
    expect(second.state.requirements).toEqual(first.state.requirements);
  });
});

describe('atomicity, purity and metadata', () => {
  it('applies everything on success', async () => {
    const result = await stageAndApply(
      createApprovedState(),
      batch({
        departments: [{ _row: 2, department_code: 'OPS', name_en: 'Operations', name_ar: 'التشغيل', active: true }],
        employees: [employee('TST-0001')],
        requirementsEffectiveFrom: '2027-01-01',
        requirements: [requirement()],
        records: [record('TR-1')],
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.state.departments).toHaveLength(1);
    expect(result.state.employees).toHaveLength(1);
    expect(result.state.requirements).toHaveLength(1);
    expect(result.state.records).toHaveLength(1);
    expect(result.state.batches).toHaveLength(1);
  });

  it('changes nothing at all when any issue blocks', async () => {
    const state = await stageAndApply(
      createApprovedState(),
      batch({ employees: [employee('TST-0001')], records: [record('TR-1')] }),
    ).then((result) => result.state);

    const plan = await stageBatch(
      state,
      batch({
        batchId: 'B-2',
        approvedAt: T2,
        employees: [employee('TST-0002')],
        records: [record('TR-1', { employee_code: 'TST-0002' })],
      }),
    );
    expect(plan.ok).toBe(false);
    const applied = applyBatch(state, plan);
    expect(applied.applied).toBe(false);
    expect(applied.state).toBe(state);
    // The employee of the same batch is not applied either.
    expect(state.employees).toHaveLength(1);
    expect(state.batches).toHaveLength(1);
  });

  it('does not change the rows or the state it receives', async () => {
    const state = createApprovedState({ organizationCode: ORG, employees: [employee('TST-0001')] });
    const stateSnapshot = JSON.parse(JSON.stringify(state));
    const input = batch({
      employees: [employee('TST-0001', { department_code: 'MNT' })],
      records: [record('TR-1')],
    });
    const inputSnapshot = JSON.parse(JSON.stringify(input));
    await stageAndApply(state, input);
    expect(JSON.parse(JSON.stringify(state))).toEqual(stateSnapshot);
    expect(input).toEqual(inputSnapshot);
  });

  it('is idempotent: the same batch twice leaves the state equal', async () => {
    const input = batch({ employees: [employee('TST-0001')], records: [record('TR-1')] });
    const once = await stageAndApply(createApprovedState(), input);
    const twice = await stageAndApply(once.state, input);
    expect(twice.state.employees).toEqual(once.state.employees);
    expect(twice.state.records).toEqual(once.state.records);
    expect(twice.state.changeLog).toEqual(once.state.changeLog);
  });

  it('freezes the state and the plan', async () => {
    const result = await stageAndApply(createApprovedState(), batch({ employees: [employee('TST-0001')] }));
    expect(Object.isFrozen(result.state)).toBe(true);
    expect(Object.isFrozen(result.state.employees)).toBe(true);
    expect(Object.isFrozen(result.state.employees[0])).toBe(true);
    expect(Object.isFrozen(result.plan)).toBe(true);
    expect(Object.isFrozen(result.plan.issues)).toBe(true);
  });

  it('records the batch metadata as roles only', async () => {
    const result = await stageAndApply(createApprovedState(), batch({ employees: [employee('TST-0001')] }));
    const stored = result.state.batches[0];
    expect(stored).toMatchObject({
      batchId: 'B-1',
      packageType: 'full',
      organizationCode: ORG,
      sourceSystem: SYSTEM,
      preparedByRole: 'Training Coordinator',
      approvedByRole: 'Training Manager',
      approvedAt: T1_UTC,
    });
    // Four-eyes is recorded as two roles and never enforced here.
    const sameRole = await stageAndApply(
      createApprovedState(),
      batch({ preparedByRole: 'Training Manager', approvedByRole: 'Training Manager', employees: [employee('TST-0001')] }),
    );
    expect(sameRole.ok).toBe(true);
    expect(JSON.stringify(result.state.batches)).not.toContain('Test Employee');
  });

  it('writes a change log of keys and field names only', async () => {
    const first = await stageAndApply(
      createApprovedState(),
      batch({ employees: [employee('TST-0001')] }),
    );
    const second = await stageAndApply(
      first.state,
      batch({
        batchId: 'B-2',
        approvedAt: T2,
        employees: [employee('TST-0001', { department_code: 'MNT' })],
      }),
    );
    const entry = second.state.changeLog.at(-1);
    expect(Object.keys(entry).sort()).toEqual(['batchId', 'field', 'key', 'sheet']);
    expect(entry).toMatchObject({ sheet: 'Employees', field: 'department_code' });
    expect(JSON.stringify(second.state.changeLog)).not.toContain('Test Employee');
    expect(JSON.stringify(second.state.changeLog)).not.toContain('MNT');
  });

  it('summarises the staging with numbers only', async () => {
    const plan = await stageBatch(
      createApprovedState(),
      batch({ employees: [employee('TST-0001'), employee('TST-0002')], records: [record('TR-1')] }),
    );
    for (const value of Object.values(plan.counts)) expect(typeof value).toBe('number');
    const serialised = JSON.stringify(plan.counts);
    for (const leak of ['TST-0001', 'Test Employee', 'C-TR-1']) {
      expect(serialised, leak).not.toContain(leak);
    }
    expect(plan.counts['Employees.new']).toBe(2);
    expect(plan.counts['Training_Records.new']).toBe(1);
  });

  it('leaves a sheet absent from the batch out of the plan', async () => {
    const plan = await stageBatch(createApprovedState(), batch({ employees: [employee('TST-0001')] }));
    expect(Object.keys(plan.sheets)).toEqual(['Employees']);
    expect(plan.rowsToClose).toHaveLength(0);
  });

  it('survives an empty batch', async () => {
    const state = createApprovedState({ organizationCode: ORG });
    const result = await stageAndApply(state, batch({}));
    expect(result.ok).toBe(true);
    expect(result.state.batches).toHaveLength(1);
    expect(result.state.employees).toHaveLength(0);
  });
});

describe('approval time', () => {
  it('normalises any time zone to the same UTC instant', () => {
    expect(normalizeApprovalTime('2027-01-05T08:00:00Z')).toBe(T1_UTC);
    expect(normalizeApprovalTime('2027-01-05T11:00:00+03:00')).toBe(T1_UTC);
    expect(normalizeApprovalTime('2027-01-05T03:00:00-05:00')).toBe(T1_UTC);
    expect(normalizeApprovalTime('')).toBe('');
    expect(normalizeApprovalTime('last Tuesday')).toBe('');
  });

  it('treats two time zones of one instant as the same approval time', async () => {
    const riyadh = await stageAndApply(
      createApprovedState(),
      batch({ approvedAt: '2027-01-05T11:00:00+03:00', employees: [employee('TST-0001')] }),
    );
    expect(riyadh.state.batches[0].approvedAt).toBe(T1_UTC);

    // The same instant spelled in another zone is not older, so the change
    // applies instead of being refused.
    const utc = await stageAndApply(
      riyadh.state,
      batch({
        batchId: 'B-2',
        approvedAt: '2027-01-05T08:00:00Z',
        employees: [employee('TST-0001', { department_code: 'MNT' })],
      }),
    );
    expect(codes(utc.plan)).not.toContain('BATCH_OLDER');
    expect(utc.ok).toBe(true);
    expect(utc.state.employees[0].department_code).toBe('MNT');
  });

  it('compares instants, not raw strings', async () => {
    const first = await stageAndApply(
      createApprovedState(),
      batch({ approvedAt: '2027-01-05T08:00:00Z', employees: [employee('TST-0001')] }),
    );
    // Lexically "2027-01-05T06:00:00-05:00" sorts before the approved value,
    // but as an instant it is three hours later.
    const later = await stageAndApply(
      first.state,
      batch({
        batchId: 'B-2',
        approvedAt: '2027-01-05T06:00:00-05:00',
        employees: [employee('TST-0001', { department_code: 'MNT' })],
      }),
    );
    expect(codes(later.plan)).not.toContain('BATCH_OLDER');
    expect(later.ok).toBe(true);
  });

  it('requires an approval time and every batch metadata field', async () => {
    for (const [field, contractName] of [
      ['batchId', 'batch_id'],
      ['preparedByRole', 'prepared_by_role'],
      ['approvedByRole', 'approved_by_role'],
      ['approvedAt', 'approved_at'],
    ]) {
      const plan = await stageBatch(
        createApprovedState(),
        batch({ [field]: '', employees: [employee('TST-0001')] }),
      );
      expect(plan.ok, field).toBe(false);
      expect(of(plan, 'CONTRACT_FIELD').map((entry) => entry.field), field).toContain(contractName);
      const state = createApprovedState();
      expect(applyBatch(state, plan).state, field).toBe(state);
    }
  });

  it('reports an unreadable approval time as CONTRACT_FIELD', async () => {
    const plan = await stageBatch(
      createApprovedState(),
      batch({ approvedAt: 'yesterday', employees: [employee('TST-0001')] }),
    );
    expect(of(plan, 'CONTRACT_FIELD')[0]).toMatchObject({ field: 'approved_at' });
    expect(plan.ok).toBe(false);
  });
});

describe('issues coming from the validators', () => {
  it('refuses the batch when a validator reported a block', async () => {
    const state = createApprovedState({ organizationCode: ORG });
    const plan = await stageBatch(
      state,
      batch({
        employees: [employee('TST-0001')],
        validationIssues: [
          { code: 'KEY_DUPLICATE', severity: SEVERITY.BLOCK, sheet: 'Employees', row: 3 },
        ],
      }),
    );
    expect(plan.ok).toBe(false);
    expect(codes(plan)).toContain('KEY_DUPLICATE');
    const applied = applyBatch(state, plan);
    expect(applied.applied).toBe(false);
    expect(applied.state).toBe(state);
    expect(state.employees).toHaveLength(0);
    expect(state.batches).toHaveLength(0);
  });

  it('keeps a validator warning without refusing the batch', async () => {
    const result = await stageAndApply(
      createApprovedState(),
      batch({
        employees: [employee('TST-0001')],
        validationIssues: [
          { code: 'CERT_MISSING', severity: SEVERITY.WARN, sheet: 'Training_Records', row: 2 },
        ],
      }),
    );
    expect(result.ok).toBe(true);
    expect(codes(result.plan)).toContain('CERT_MISSING');
    expect(result.state.employees).toHaveLength(1);
  });
});

describe('record content signature', () => {
  it('covers every contract field of Training_Records', () => {
    const base = record('TR-1');
    expect(recordSignature(base)).toBe(recordSignature({ ...base, _row: 99, _version: 7 }));
    for (const change of [
      { completion_status: 'In Progress' },
      { completion_date: '2026-02-15' },
      { expiry_date: '2028-02-15' },
      { certificate_number: 'C-OTHER' },
      { training_provider: 'Other Provider' },
      { remarks: 'Corrected' },
      { employee_code: 'TST-0002' },
      { course_code: 'FA-01' },
    ]) {
      expect(recordSignature({ ...base, ...change }), JSON.stringify(change)).not.toBe(
        recordSignature(base),
      );
    }
  });

  it('creates a new version for a field the fingerprint does not cover', async () => {
    const first = await stageAndApply(createApprovedState(), batch({ records: [record('TR-1')] }));
    for (const change of [{ training_provider: 'Other Provider' }, { remarks: 'Corrected' }]) {
      const next = await stageAndApply(
        first.state,
        batch({ batchId: 'B-2', approvedAt: T2, records: [record('TR-1', change)] }),
      );
      expect(next.plan.sheets.Training_Records.entries[0], JSON.stringify(change)).toMatchObject({
        status: STAGED_STATUS.CHANGED,
        version: 2,
      });
      expect(next.state.records, JSON.stringify(change)).toHaveLength(2);
    }
  });
});

describe('internal fields', () => {
  it('keeps an internal field of the batch out of the stored row', async () => {
    const result = await stageAndApply(
      createApprovedState(),
      batch({
        employees: [employee('TST-0001', { _version: 9, _batchId: 'FAKE', _approvedAt: T2 })],
        records: [record('TR-1', { _fingerprint: 'fp1:0000', _version: 9 })],
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.state.employees[0]._batchId).toBe('B-1');
    expect(result.state.employees[0]._approvedAt).toBe(T1_UTC);
    expect(result.state.records[0]._version).toBe(1);
    expect(result.state.records[0]._fingerprint).toMatch(/^fp1:[0-9a-f]{64}$/);
  });

  it('does not let an internal field make a row look changed', async () => {
    const first = await stageAndApply(
      createApprovedState(),
      batch({ employees: [employee('TST-0001')] }),
    );
    const second = await stageAndApply(
      first.state,
      batch({
        batchId: 'B-2',
        approvedAt: T2,
        employees: [employee('TST-0001', { _row: 7, _batchId: 'FAKE', _fingerprint: 'x' })],
      }),
    );
    expect(second.plan.sheets.Employees.entries[0].status).toBe(STAGED_STATUS.UNCHANGED);
    expect(second.state.employees).toEqual(first.state.employees);
  });
});

describe('atomicity of a mixed batch', () => {
  it('applies no row when one row is older than the approved value', async () => {
    const newer = await stageAndApply(
      createApprovedState(),
      batch({ approvedAt: T2, employees: [employee('TST-0001', { department_code: 'MNT' })] }),
    );
    const plan = await stageBatch(
      newer.state,
      batch({
        batchId: 'B-0',
        approvedAt: T1,
        employees: [
          employee('TST-0002'),
          employee('TST-0001', { department_code: 'OPS' }),
        ],
        records: [record('TR-1')],
      }),
    );
    expect(plan.ok).toBe(false);
    expect(codes(plan)).toContain('BATCH_OLDER');
    // The valid rows of the same batch were staged, and none is applied.
    expect(plan.sheets.Employees.entries[0].status).toBe(STAGED_STATUS.NEW);

    const applied = applyBatch(newer.state, plan);
    expect(applied.applied).toBe(false);
    expect(applied.state).toBe(newer.state);
    expect(applied.state.employees).toHaveLength(1);
    expect(applied.state.records).toHaveLength(0);
    expect(applied.state.batches.map((row) => row.batchId)).toEqual(['B-1']);
    expect(applied.state.changeLog.every((entry) => entry.batchId === 'B-1')).toBe(true);
  });

  it('records no blocked batch in batches or in the change log', async () => {
    const state = createApprovedState({ organizationCode: ORG });
    const plan = await stageBatch(
      state,
      batch({ packageType: 'employees', organizationCode: 'OTHER-ORG', employees: [employee('TST-0001')] }),
    );
    expect(codes(plan)).toContain('ORG_MISMATCH');
    const applied = applyBatch(state, plan);
    expect(applied.state.batches).toHaveLength(0);
    expect(applied.state.changeLog).toHaveLength(0);
  });
});
