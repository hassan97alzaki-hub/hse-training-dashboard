import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { TrainingSessionForm } from '../src/components/TrainingSessionForm.jsx';
import { createI18n } from '../src/lib/i18n.js';

const { t } = createI18n('en');

vi.mock('../src/lib/requirementsService.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    addTrainingRecords: vi.fn(async (session) => ({
      success: true,
      records: session.employeeIds.map(id => ({ id: `rec_${id}`, employee_id: id })),
    })),
  };
});

const courses = [{ code: 'H2S', name: 'H2S Awareness', validityMonths: 24 }];
const people = [
  { Employee_ID: 'EMP001', Employee_Name: 'A', Department: 'Operations', Job_Title: 'Operator' },
  { Employee_ID: 'EMP002', Employee_Name: 'B', Department: 'Maintenance', Job_Title: 'Technician' },
];
const requirements = [
  { Department: 'Operations', Job_Title: 'Operator', Course_Code: 'H2S', Mandatory: true },
];

function renderForm(props = {}) {
  return render(createElement(TrainingSessionForm, {
    courses, people, requirements, prefill: null,
    onSaved: () => {}, onClose: () => {}, t,
    ...props,
  }));
}

afterEach(cleanup);

describe('TrainingSessionForm', () => {
  it('offers only the employees the course is required for', () => {
    renderForm();
    fireEvent.change(screen.getByTestId('course-select'), { target: { value: 'H2S' } });

    expect(screen.getByTestId('attendee-EMP001')).toBeInTheDocument();
    expect(screen.queryByTestId('attendee-EMP002')).not.toBeInTheDocument();
  });

  it('offers everybody once show-all is pressed', () => {
    renderForm();
    fireEvent.change(screen.getByTestId('course-select'), { target: { value: 'H2S' } });
    fireEvent.click(screen.getByText(t('showAllEmployees')));

    expect(screen.getByTestId('attendee-EMP002')).toBeInTheDocument();
  });

  it('fills the expiry from the course validity when a completion date is entered', () => {
    renderForm();
    fireEvent.change(screen.getByTestId('course-select'), { target: { value: 'H2S' } });
    fireEvent.change(screen.getByTestId('issue-date'), { target: { value: '2026-10-13' } });

    expect(screen.getByTestId('expiry-date')).toHaveValue('2028-10-13');
  });

  it('keeps a manually typed expiry instead of recomputing it', () => {
    renderForm();
    fireEvent.change(screen.getByTestId('course-select'), { target: { value: 'H2S' } });
    fireEvent.change(screen.getByTestId('issue-date'), { target: { value: '2026-10-13' } });
    fireEvent.change(screen.getByTestId('expiry-date'), { target: { value: '2027-01-01' } });
    fireEvent.change(screen.getByTestId('issue-date'), { target: { value: '2026-10-14' } });

    expect(screen.getByTestId('expiry-date')).toHaveValue('2027-01-01');
  });

  it('reports one record per selected attendee', async () => {
    const onSaved = vi.fn();
    renderForm({ onSaved });
    fireEvent.change(screen.getByTestId('course-select'), { target: { value: 'H2S' } });
    fireEvent.change(screen.getByTestId('issue-date'), { target: { value: '2026-10-13' } });
    fireEvent.click(screen.getByTestId('attendee-EMP001'));
    fireEvent.click(screen.getByText(t('saveRecords')));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onSaved.mock.calls[0][0]).toHaveLength(1);
  });

  it('refuses to save with no attendee selected', () => {
    const onSaved = vi.fn();
    renderForm({ onSaved });
    fireEvent.change(screen.getByTestId('course-select'), { target: { value: 'H2S' } });
    fireEvent.click(screen.getByText(t('saveRecords')));

    expect(onSaved).not.toHaveBeenCalled();
  });

  it('prefills a single employee when opened from a table row', () => {
    renderForm({ prefill: { employeeId: 'EMP001', courseCode: 'H2S', issueDate: '2025-01-01' } });

    expect(screen.getByTestId('issue-date')).toHaveValue('2025-01-01');
    expect(screen.getByTestId('course-select')).toHaveValue('H2S');
  });
});
