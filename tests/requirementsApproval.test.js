import { describe, it, expect } from 'vitest';

import {
  createApproval,
  approve,
  markEdited,
  provenanceForApproval,
} from '../src/lib/contract/requirementsApproval.js';
import {
  REQUIREMENTS_PROVENANCE,
  TEST_PROVENANCES,
  isTestRequirements,
  resolveRequirementsProvenance,
} from '../src/lib/contract/requirementsProvenance.js';

describe('createApproval', () => {
  it('starts as an unapproved first revision', () => {
    expect(createApproval()).toEqual({
      status: 'draft',
      approvedBy: null,
      approvedAt: null,
      revision: 1,
    });
  });
});

describe('approve', () => {
  it('records who approved it and when', () => {
    const state = approve(createApproval(), {
      approvedBy: 'Hassan Ali',
      approvedAt: '2026-10-13T09:00:00.000Z',
    });

    expect(state.status).toBe('managed');
    expect(state.approvedBy).toBe('Hassan Ali');
    expect(state.approvedAt).toBe('2026-10-13T09:00:00.000Z');
    expect(state.revision).toBe(1);
  });

  it('does not mutate the state it was given', () => {
    const before = createApproval();
    approve(before, { approvedBy: 'A', approvedAt: '2026-10-13T09:00:00.000Z' });

    expect(before.status).toBe('draft');
  });

  it('refuses an approval with no approver named', () => {
    expect(() => approve(createApproval(), { approvedAt: '2026-10-13T09:00:00.000Z' }))
      .toThrow(/approver/i);
  });
});

describe('markEdited', () => {
  it('returns an approved matrix to draft and increments the revision', () => {
    const approved = approve(createApproval(), {
      approvedBy: 'Hassan Ali',
      approvedAt: '2026-10-13T09:00:00.000Z',
    });
    const edited = markEdited(approved);

    expect(edited.status).toBe('draft');
    expect(edited.revision).toBe(2);
    // The previous approval is cleared, so it can never be printed as current.
    expect(edited.approvedBy).toBeNull();
    expect(edited.approvedAt).toBeNull();
  });

  it('leaves a draft alone, so editing a draft does not inflate the revision', () => {
    const draft = createApproval();
    expect(markEdited(draft)).toEqual(draft);
  });
});

describe('provenanceForApproval', () => {
  it('maps the two states onto the two provenances', () => {
    expect(provenanceForApproval(createApproval())).toBe(REQUIREMENTS_PROVENANCE.DRAFT);
    const approved = approve(createApproval(), {
      approvedBy: 'A', approvedAt: '2026-10-13T09:00:00.000Z',
    });
    expect(provenanceForApproval(approved)).toBe(REQUIREMENTS_PROVENANCE.MANAGED);
  });
});

describe('the new provenances', () => {
  it('banners a draft matrix but not a managed one', () => {
    expect(isTestRequirements(REQUIREMENTS_PROVENANCE.DRAFT)).toBe(true);
    expect(isTestRequirements(REQUIREMENTS_PROVENANCE.MANAGED)).toBe(false);
  });

  it('keeps managed distinct from approved', () => {
    // MANAGED carries no banner, but it is not an HSE-DC-1.0 approval either.
    expect(REQUIREMENTS_PROVENANCE.MANAGED).not.toBe(REQUIREMENTS_PROVENANCE.APPROVED);
    expect(TEST_PROVENANCES).not.toContain(REQUIREMENTS_PROVENANCE.MANAGED);
  });

  it('still lets a derived row override a managed declaration', () => {
    const rows = [{ Department: 'Operations', Job_Title: 'Operator', Derived: true }];
    expect(resolveRequirementsProvenance(rows, REQUIREMENTS_PROVENANCE.MANAGED))
      .toBe(REQUIREMENTS_PROVENANCE.DERIVED);
  });
});
