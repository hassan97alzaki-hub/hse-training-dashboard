import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { RoleScopePicker } from '../src/components/RoleScopePicker.jsx';
import { createI18n } from '../src/lib/i18n.js';

const { t } = createI18n('en');

const people = [
  { Employee_ID: 'EMP001', Department: 'Operations', Job_Title: 'Operator' },
  { Employee_ID: 'EMP002', Department: 'Operations', Job_Title: 'Operator' },
  { Employee_ID: 'EMP003', Department: 'Operations', Job_Title: 'Supervisor' },
  { Employee_ID: 'EMP004', Department: 'Maintenance', Job_Title: 'Technician' },
];

afterEach(cleanup);

describe('RoleScopePicker', () => {
  it('lists every department and job title found in the people', () => {
    render(createElement(RoleScopePicker, { people, value: [], onChange: () => {}, t }));

    expect(screen.getByText('Operations')).toBeInTheDocument();
    expect(screen.getByText('Maintenance')).toBeInTheDocument();
    expect(screen.getByText(/Operator/)).toBeInTheDocument();
    expect(screen.getByText(/Technician/)).toBeInTheDocument();
  });

  it('shows how many people hold each job title', () => {
    render(createElement(RoleScopePicker, { people, value: [], onChange: () => {}, t }));
    const operator = screen.getByTestId('role-count-Operations-Operator');

    expect(operator).toHaveTextContent('2');
  });

  it('selects one job title', () => {
    const onChange = vi.fn();
    render(createElement(RoleScopePicker, { people, value: [], onChange, t }));
    fireEvent.click(screen.getByTestId('role-Operations-Operator'));

    expect(onChange).toHaveBeenCalledWith([{ department: 'Operations', jobTitle: 'Operator' }]);
  });

  it('selects a whole department as an empty job title', () => {
    // An empty job title covers job titles added to that department later.
    const onChange = vi.fn();
    render(createElement(RoleScopePicker, { people, value: [], onChange, t }));
    fireEvent.click(screen.getByTestId('department-Operations'));

    expect(onChange).toHaveBeenCalledWith([{ department: 'Operations', jobTitle: '' }]);
  });

  it('drops the individual job titles when the whole department is selected', () => {
    const onChange = vi.fn();
    render(createElement(RoleScopePicker, {
      people,
      value: [{ department: 'Operations', jobTitle: 'Operator' }],
      onChange,
      t,
    }));
    fireEvent.click(screen.getByTestId('department-Operations'));

    expect(onChange).toHaveBeenCalledWith([{ department: 'Operations', jobTitle: '' }]);
  });

  it('unselects a job title that was selected', () => {
    const onChange = vi.fn();
    render(createElement(RoleScopePicker, {
      people,
      value: [{ department: 'Operations', jobTitle: 'Operator' }],
      onChange,
      t,
    }));
    fireEvent.click(screen.getByTestId('role-Operations-Operator'));

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('counts how many people the selection requires', () => {
    render(createElement(RoleScopePicker, {
      people,
      value: [{ department: 'Operations', jobTitle: 'Operator' }],
      onChange: () => {},
      t,
    }));

    expect(screen.getByTestId('required-count')).toHaveTextContent('2');
  });

  it('counts a whole department as everyone in it', () => {
    render(createElement(RoleScopePicker, {
      people,
      value: [{ department: 'Operations', jobTitle: '' }],
      onChange: () => {},
      t,
    }));

    expect(screen.getByTestId('required-count')).toHaveTextContent('3');
  });

  it('says so plainly when nothing is selected', () => {
    render(createElement(RoleScopePicker, { people, value: [], onChange: () => {}, t }));

    expect(screen.getByText(t('noRolesSelected'))).toBeInTheDocument();
  });

  it('renders nothing to pick when no people are loaded', () => {
    render(createElement(RoleScopePicker, { people: [], value: [], onChange: () => {}, t }));

    expect(screen.queryByTestId('department-Operations')).not.toBeInTheDocument();
  });
});
