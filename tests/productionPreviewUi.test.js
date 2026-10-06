import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import * as XLSX from 'xlsx';

import { createI18n } from '../src/lib/i18n.js';
import { createApprovedState } from '../src/lib/contract/staging.js';
import {
  readProductionWorkbook,
  validateProductionPackage,
  buildProductionPreview,
} from '../src/lib/contract/productionPackage.js';
import ProductionPackagePreview from '../src/components/ProductionPackagePreview.jsx';
import ComplianceTable from '../src/components/ComplianceTable.jsx';
import Filters from '../src/components/Filters.jsx';
import { smallFullPackage } from './fixtures/contract/smallFullPackage.js';
import { FIXED_DATES } from './fixtures/contract/generateSyntheticPackage.js';
import { STATUS } from '../src/lib/constants.js';

const AS_OF = FIXED_DATES.asOfDate;

const METADATA = Object.freeze({
  batchId: 'LOCAL-TEST-0001',
  preparedByRole: 'Training Coordinator',
  approvedByRole: 'Training Manager',
  approvedAt: '2027-01-11T08:00:00.000Z',
});

/** Values that must never appear in the preview, in the DOM or in an attribute. */
const FORBIDDEN = Object.freeze([
  'Test Employee 001',
  'Test Employee 002',
  'Test Employee 003',
  'TST-CERT-000001',
  'TST-CERT-000002',
  'example.invalid',
  '+999',
  'Test Provider',
]);

function sheets(overrides = {}) {
  return {
    _Contract: [smallFullPackage.contract],
    Departments: smallFullPackage.departments,
    Job_Titles: smallFullPackage.jobTitles,
    Employees: smallFullPackage.employees,
    Courses: smallFullPackage.courses,
    Requirements: smallFullPackage.requirements,
    Training_Records: smallFullPackage.trainingRecords,
    ...overrides,
  };
}

async function makePreview(sheetMap = sheets(), { approvedState = createApprovedState() } = {}) {
  const workbook = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheetMap)) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), name);
  }
  const parsed = await readProductionWorkbook(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
  const validated = await validateProductionPackage(parsed, { approvedState, asOfDate: AS_OF });
  const preview = await buildProductionPreview(validated, { approvedState, approvalMetadata: METADATA });
  return { ...preview, fileName: 'synthetic-package.xlsx', batchId: METADATA.batchId, asOfDate: AS_OF };
}

function renderPreview(preview, props = {}) {
  const { t } = createI18n(props.lang ?? 'en');
  return render(
    createElement(ProductionPackagePreview, {
      preview,
      fileName: preview.fileName,
      approverRole: props.approverRole ?? 'Training Manager',
      onApproverRoleChange: props.onApproverRoleChange ?? (() => {}),
      onApprove: props.onApprove ?? (() => {}),
      onCancel: props.onCancel ?? (() => {}),
      isApplying: props.isApplying ?? false,
      t,
    }),
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('production preview — summary', () => {
  it('shows the package summary with counts only', async () => {
    const preview = await makePreview();
    const { container } = renderPreview(preview);

    expect(screen.getByTestId('production-preview')).toBeInTheDocument();
    expect(screen.getByText('full')).toBeInTheDocument();
    expect(screen.getByText('TST-ORG')).toBeInTheDocument();
    expect(screen.getByText(FIXED_DATES.extractDate)).toBeInTheDocument();
    expect(screen.getByText(AS_OF)).toBeInTheDocument();
    expect(screen.getByText('Training Coordinator')).toBeInTheDocument();
    expect(screen.getByText('synthetic-package.xlsx')).toBeInTheDocument();
    expect(container.textContent).toContain('Production package — import preview');
  });

  it('leaks no name, certificate number or contact value, including in attributes', async () => {
    const preview = await makePreview();
    const { container } = renderPreview(preview);
    const markup = container.innerHTML;
    for (const value of FORBIDDEN) {
      expect(container.textContent, value).not.toContain(value);
      expect(markup, value).not.toContain(value);
    }
  });

  it('shows the per-sheet change counts', async () => {
    const preview = await makePreview();
    renderPreview(preview);
    const changes = screen.getByTestId('pp-changes');
    const row = [...changes.querySelectorAll('tr')].find((tr) => tr.textContent.startsWith('Employees'));
    expect(row.textContent).toContain('3');
  });

  it('shows the indicator impact as before and after', async () => {
    const preview = await makePreview();
    renderPreview(preview);
    expect(screen.getByTestId('pp-impact')).toBeInTheDocument();
    const row = screen.getByText('Active employees').closest('tr');
    expect(row.textContent).toContain('0');
    expect(row.textContent).toContain('2');
  });

  it('shows no impact table for a blocked package', async () => {
    const withoutEmployees = sheets();
    delete withoutEmployees.Employees;
    const preview = await makePreview(withoutEmployees);
    renderPreview(preview);
    expect(preview.plan.ok).toBe(false);
    expect(screen.getByText(/No indicator impact is shown/)).toBeInTheDocument();
    expect(screen.queryByTestId('pp-impact')).toBeNull();
  });
});

describe('production preview — technical details', () => {
  it('keeps the details closed by default', async () => {
    const preview = await makePreview();
    renderPreview(preview);
    const toggle = screen.getByTestId('pp-details-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', 'pp-technical-details');
    expect(screen.queryByTestId('pp-details')).toBeNull();
  });

  it('opens and closes the details on an explicit action', async () => {
    const preview = await makePreview();
    renderPreview(preview);
    const toggle = screen.getByTestId('pp-details-toggle');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('pp-details')).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.queryByTestId('pp-details')).toBeNull();
  });

  it('shows codes, sheet, row and field only inside the details', async () => {
    const preview = await makePreview(
      sheets({ Employees: smallFullPackage.employees.map((row) => ({ ...row, department_code: 'NOPE' })) }),
    );
    const { container } = renderPreview(preview);
    fireEvent.click(screen.getByTestId('pp-details-toggle'));
    const details = screen.getByTestId('pp-details');
    expect(details.textContent).toContain('REF_UNKNOWN');
    expect(details.textContent).toContain('department_code');
    expect(details.textContent).toContain('Employees');
    for (const value of FORBIDDEN) {
      expect(container.innerHTML, value).not.toContain(value);
    }
  });
});

describe('production preview — decision buttons', () => {
  it('enables approval for a sound package with a role', async () => {
    const preview = await makePreview();
    renderPreview(preview);
    expect(screen.getByTestId('pp-approve')).toBeEnabled();
    expect(screen.getByText(/Approving applies the whole batch/)).toBeInTheDocument();
  });

  it('disables approval when the package is blocked', async () => {
    const withoutEmployees = sheets();
    delete withoutEmployees.Employees;
    const preview = await makePreview(withoutEmployees);
    renderPreview(preview);
    expect(screen.getByTestId('pp-approve')).toBeDisabled();
    expect(screen.getByText(/Approval is blocked/)).toBeInTheDocument();
  });

  it('disables approval while the approver role is empty', async () => {
    const preview = await makePreview();
    renderPreview(preview, { approverRole: ' ' });
    expect(screen.getByTestId('pp-approve')).toBeDisabled();
    expect(screen.getByText(/Enter the approver role/)).toBeInTheDocument();
  });

  it('shows the applying state and blocks a second click', async () => {
    const preview = await makePreview();
    const onApprove = vi.fn();
    renderPreview(preview, { isApplying: true, onApprove });
    const button = screen.getByTestId('pp-approve');
    expect(button).toBeDisabled();
    expect(button.textContent).toContain('Applying');
    fireEvent.click(button);
    expect(onApprove).not.toHaveBeenCalled();
  });

  it('calls approve once and cancel without applying', async () => {
    const preview = await makePreview();
    const onApprove = vi.fn();
    const onCancel = vi.fn();
    renderPreview(preview, { onApprove, onCancel });
    fireEvent.click(screen.getByTestId('pp-approve'));
    expect(onApprove).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('pp-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('reports the approver role through the change handler', async () => {
    const preview = await makePreview();
    const onApproverRoleChange = vi.fn();
    renderPreview(preview, { approverRole: '', onApproverRoleChange });
    fireEvent.change(screen.getByTestId('pp-approver-role'), { target: { value: 'HSE Manager' } });
    expect(onApproverRoleChange).toHaveBeenCalledWith('HSE Manager');
  });

  it('labels the role input and the buttons for assistive technology', async () => {
    const preview = await makePreview();
    renderPreview(preview);
    const input = screen.getByTestId('pp-approver-role');
    expect(input).toHaveAttribute('aria-required', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'pp-approver-role-hint');
    expect(screen.getByLabelText('Approver role')).toBe(input);
    expect(screen.getByRole('button', { name: /Approve package/ })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Production package — import preview' })).toBeInTheDocument();
  });
});

describe('production preview — Arabic', () => {
  it('renders the Arabic texts and the same structure', async () => {
    const preview = await makePreview();
    const { container } = renderPreview(preview, { lang: 'ar' });
    expect(container.textContent).toContain('حزمة إنتاج — معاينة الاستيراد');
    expect(screen.getByRole('button', { name: /اعتماد الحزمة/ })).toBeEnabled();
    expect(screen.getByText(/الاعتماد يطبّق الدفعة كاملة/)).toBeInTheDocument();
    expect(screen.getByTestId('pp-details-toggle').textContent).toContain('عرض التفاصيل الفنية');
    // The codes stay in Latin letters, so the package summary is still readable.
    expect(container.textContent).toContain('TST-ORG');
    for (const value of FORBIDDEN) expect(container.innerHTML, value).not.toContain(value);
  });

  it('keeps the preview inside a right-to-left container', async () => {
    const preview = await makePreview();
    const { t, dir } = createI18n('ar');
    expect(dir).toBe('rtl');
    const { container } = render(
      createElement(
        'div',
        { dir },
        createElement(ProductionPackagePreview, {
          preview,
          fileName: preview.fileName,
          approverRole: 'مدير التدريب',
          onApproverRoleChange: () => {},
          onApprove: () => {},
          onCancel: () => {},
          isApplying: false,
          t,
        }),
      ),
    );
    expect(container.firstChild).toHaveAttribute('dir', 'rtl');
    expect(screen.getByTestId('production-preview')).toBeInTheDocument();
  });
});

describe('display names in the dashboard', () => {
  const lookups = {
    departments: new Map([['OPS', { name_en: 'Test Operations', name_ar: 'تشغيل اختبار' }]]),
    jobTitles: new Map([['OPR', { name_en: 'Test Operator', name_ar: 'مشغل اختبار' }]]),
    courses: new Map([['H2S-01', { name_en: 'Test H2S Awareness', name_ar: 'توعية اختبار' }]]),
  };
  const item = {
    Employee_ID: 'TST-0001',
    Employee_Name: 'Test Employee 001',
    Department: 'OPS',
    Job_Title: 'OPR',
    Course_Code: 'H2S-01',
    Course_Name: 'Test H2S Awareness',
    Status: STATUS.VALID,
    Employment_Status: 'Active',
    Mandatory: true,
    daysRemaining: 200,
  };

  it('shows the display name in the table while keeping the code as a title', async () => {
    const { projectForDisplay } = await import('../src/lib/contract/productionPackage.js');
    const { t } = createI18n('en');
    const universe = projectForDisplay([item], lookups, 'en');
    const { container } = render(
      createElement(ComplianceTable, {
        universe,
        inactiveUniverse: [],
        filters: { employeeId: '', employeeName: '', department: '', jobTitle: '', course: '', status: '', employmentStatus: '', priority: '' },
        t,
        lang: 'en',
        showInactive: false,
      }),
    );
    expect(container.textContent).toContain('Test Operations');
    expect(container.textContent).toContain('Test Operator');
    expect(container.querySelector('td[title="OPS"]')).not.toBeNull();
  });

  it('shows the Arabic display name for the Arabic interface', async () => {
    const { projectForDisplay } = await import('../src/lib/contract/productionPackage.js');
    const { t } = createI18n('ar');
    const universe = projectForDisplay([item], lookups, 'ar');
    const { container } = render(
      createElement(ComplianceTable, {
        universe,
        inactiveUniverse: [],
        filters: { employeeId: '', employeeName: '', department: '', jobTitle: '', course: '', status: '', employmentStatus: '', priority: '' },
        t,
        lang: 'ar',
        showInactive: false,
      }),
    );
    expect(container.textContent).toContain('تشغيل اختبار');
    expect(container.textContent).toContain('توعية اختبار');
  });

  it('shows display names in the filters while the value stays the code', () => {
    const { t } = createI18n('en');
    render(
      createElement(Filters, {
        filters: { employeeId: '', employeeName: '', department: '', jobTitle: '', course: '', status: '', employmentStatus: '', priority: '' },
        options: {
          departments: ['OPS'],
          jobTitles: ['OPR'],
          courses: [{ code: 'H2S-01', name: 'Test H2S Awareness' }],
          departmentNames: new Map([['OPS', 'Test Operations']]),
          jobTitleNames: new Map([['OPR', 'Test Operator']]),
        },
        t,
        onChange: () => {},
        onClear: () => {},
      }),
    );
    const option = screen.getByRole('option', { name: 'Test Operations' });
    expect(option).toHaveValue('OPS');
    expect(screen.getByRole('option', { name: 'Test Operator' })).toHaveValue('OPR');
  });
});
