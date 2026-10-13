import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import ComplianceTable from '../src/components/ComplianceTable.jsx';
import { createI18n } from '../src/lib/i18n.js';

const { t } = createI18n('en');

afterEach(cleanup);

describe('the row edit button', () => {
  it('passes the row to the handler', () => {
    const onRecordEdit = vi.fn();
    const item = {
      Employee_ID: 'EMP001',
      Employee_Name: 'A',
      Department: 'Operations',
      Job_Title: 'Operator',
      Course_Code: 'H2S',
      Course_Name: 'H2S Awareness',
      Status: 'MISSING',
      Issue_Date: null,
      Expiry_Date: null,
      Certificate_Number: null,
      daysRemaining: null,
      Employment_Status: 'Active',
    };
    render(createElement(ComplianceTable, {
      universe: [item],
      inactiveUniverse: [],
      filters: {},
      t,
      lang: 'en',
      showInactive: false,
      onRecordEdit,
    }));
    fireEvent.click(screen.getByTestId('edit-record-EMP001-H2S'));

    expect(onRecordEdit).toHaveBeenCalledWith(item);
  });

  it('renders no button when no handler is given', () => {
    const item = {
      Employee_ID: 'EMP001',
      Employee_Name: 'A',
      Department: 'Operations',
      Job_Title: 'Operator',
      Course_Code: 'H2S',
      Course_Name: 'H2S Awareness',
      Status: 'MISSING',
      Issue_Date: null,
      Expiry_Date: null,
      Certificate_Number: null,
      daysRemaining: null,
      Employment_Status: 'Active',
    };
    render(createElement(ComplianceTable, {
      universe: [item],
      inactiveUniverse: [],
      filters: {},
      t,
      lang: 'en',
      showInactive: false,
    }));

    expect(screen.queryByTestId(/^edit-record-/)).not.toBeInTheDocument();
  });
});
