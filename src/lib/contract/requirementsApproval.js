/**
 * The approval state of a requirements matrix built inside the interface.
 *
 * A matrix entered by hand is not an approved `HSE-DC-1.0` sheet, so it cannot
 * carry the same weight. It starts as a draft and carries the test banner. An
 * explicit internal approval — an approver's name and a timestamp — moves it
 * to `managed`: no banner, but reports print who approved it rather than
 * claiming the data contract.
 *
 * Any edit after an approval returns the matrix to `draft` and increments the
 * revision, so an edited matrix can never be read as an approved one.
 *
 * Pure module: no clock, no storage, no network. `approvedAt` is a parameter.
 */

import { REQUIREMENTS_PROVENANCE } from './requirementsProvenance.js';

/** A fresh, unapproved matrix. */
export function createApproval() {
  return { status: 'draft', approvedBy: null, approvedAt: null, revision: 1 };
}

/**
 * Approve a matrix internally.
 * @param {object} state - the current approval state
 * @param {{approvedBy: string, approvedAt: string}} by - approver and ISO timestamp
 * @returns {object} a new state
 */
export function approve(state, { approvedBy, approvedAt } = {}) {
  if (!approvedBy || !String(approvedBy).trim()) {
    throw new Error('An approval needs a named approver');
  }
  return {
    ...state,
    status: 'managed',
    approvedBy: String(approvedBy).trim(),
    approvedAt: approvedAt ?? null,
  };
}

/**
 * Record that a row changed. An approved matrix returns to draft; a draft is
 * already unapproved, so editing it changes nothing and does not inflate the
 * revision number.
 */
export function markEdited(state) {
  if (state.status !== 'managed') return state;
  return {
    status: 'draft',
    approvedBy: null,
    approvedAt: null,
    revision: state.revision + 1,
  };
}

/** The provenance this state declares. */
export function provenanceForApproval(state) {
  return state?.status === 'managed'
    ? REQUIREMENTS_PROVENANCE.MANAGED
    : REQUIREMENTS_PROVENANCE.DRAFT;
}
