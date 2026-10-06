import { describe, it, expect } from 'vitest';

import { SEVERITY } from '../src/lib/contract/schema.js';
import {
  createApprovedState,
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

  it('clears the binding and the approved data, keeping the audit trail', () => {
    const state = createApprovedState({
      organizationCode: ORG,
      employees: [employee('TST-0001')],
      batches: [{ batchId: 'B-0' }],
      changeLog: [{ batchId: 'B-0', sheet: 'Employees', key: 'TST-0001', field: 'full_name' }],
      requirementsSource: 'derived',
    });
    const cleared = clearOrganizationBinding(state);
    expect(cleared.organizationCode).toBe('');
    expect(cleared.employees).toHaveLength(0);
    expect(cleared.requirementsSource).toBe('none');
    expect(cleared.batches).toHaveLength(1);
    expect(cleared.changeLog).toHaveLength(1);
    // The original state is untouched.
    expect(state.employees).toHaveLength(1);
    expect(state.organizationCode).toBe(ORG);
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

  it('does not let an older batch overwrite a newer value', async () => {
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
    expect(older.plan.sheets.Employees.entries[0].status).toBe(STAGED_STATUS.CONFLICT);
    expect(older.state.employees[0].department_code).toBe('MNT');
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

  it('does not let an older batch replace a newer record version', async () => {
    const newer = await stageAndApply(
      createApprovedState(),
      batch({ approvedAt: T2, records: [record('TR-1', { expiry_date: '2029-01-15' })] }),
    );
    const older = await stageAndApply(
      newer.state,
      batch({ batchId: 'B-0', approvedAt: T1, records: [record('TR-1')] }),
    );
    expect(older.plan.sheets.Training_Records.entries[0].status).toBe(STAGED_STATUS.CONFLICT);
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
      approvedAt: T1,
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
