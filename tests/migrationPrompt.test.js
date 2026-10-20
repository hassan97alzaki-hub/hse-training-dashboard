/**
 * The prompt that offers to move a browser's data into a workspace.
 *
 * It is the only place the user sees this decision, so what it says when the
 * move fails matters as much as what it does when it succeeds: a failed
 * migration deletes nothing, and the prompt has to say so plainly or the user
 * will assume the worst.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

import { MigrationPrompt } from '../src/components/MigrationPrompt.jsx';
import { createI18n } from '../src/lib/i18n.js';

const { t } = createI18n('en');
const { t: tAr } = createI18n('ar');

afterEach(cleanup);

const show = (props = {}) =>
  render(
    createElement(MigrationPrompt, {
      t,
      localCount: 42,
      workspaceCount: 0,
      onMigrate: async () => ({ status: 'migrated', moved: 42 }),
      onDismiss: () => {},
      ...props,
    }),
  );

describe('the offer', () => {
  it('says how much is being moved', () => {
    show();
    expect(screen.getByText(/42 records/)).toBeInTheDocument();
  });

  // Merging into a workspace that already holds data is a decision only the
  // person who imported both can make, so it is named rather than taken.
  it('warns when the workspace is not empty', () => {
    show({ workspaceCount: 7 });
    expect(screen.getByText(/already holds 7 records/)).toBeInTheDocument();
    expect(screen.getByText(/nothing already there is replaced/)).toBeInTheDocument();
  });

  it('says nothing about merging when the workspace is empty', () => {
    show();
    expect(screen.queryByText(/already holds/)).toBeNull();
  });

  it('can be put off', () => {
    const onDismiss = vi.fn();
    show({ onDismiss });
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(onDismiss).toHaveBeenCalled();
  });
});

describe('after it runs', () => {
  it('reports what arrived and that a copy was kept', async () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Move my data' }));
    expect(await screen.findByText(/42 records are in your workspace/)).toBeInTheDocument();
    expect(screen.getByText(/seven days/)).toBeInTheDocument();
  });

  // The reassurance is the point. A user who is told only that it failed will
  // assume their records are gone.
  it('says plainly that nothing was deleted when it fails', async () => {
    show({ onMigrate: async () => ({ status: 'incomplete', cleared: false }) });
    fireEvent.click(screen.getByRole('button', { name: 'Move my data' }));
    expect(await screen.findByText(/none were deleted here/)).toBeInTheDocument();
    expect(screen.getByText(/exactly as it was/)).toBeInTheDocument();
  });

  it('offers another attempt after a failure', async () => {
    const onMigrate = vi
      .fn()
      .mockResolvedValueOnce({ status: 'incomplete' })
      .mockResolvedValueOnce({ status: 'migrated', moved: 42 });

    show({ onMigrate });
    fireEvent.click(screen.getByRole('button', { name: 'Move my data' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    expect(await screen.findByText(/42 records are in your workspace/)).toBeInTheDocument();
    expect(onMigrate).toHaveBeenCalledTimes(2);
  });

  // Two migrations started by an impatient double-click would be two passes
  // over the same rows.
  it('cannot be started twice', async () => {
    let release;
    const onMigrate = vi.fn(() => new Promise((resolve) => { release = resolve; }));
    show({ onMigrate });

    const button = screen.getByRole('button', { name: 'Move my data' });
    fireEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    fireEvent.click(button);

    expect(onMigrate).toHaveBeenCalledTimes(1);
    release({ status: 'migrated', moved: 42 });
  });
});

describe('in Arabic', () => {
  it('is translated, not left in English', () => {
    render(
      createElement(MigrationPrompt, {
        t: tAr,
        localCount: 42,
        workspaceCount: 0,
        onMigrate: async () => ({ status: 'migrated', moved: 42 }),
        onDismiss: () => {},
      }),
    );
    expect(screen.getByText(/بياناتك لا تزال في هذا المتصفح/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'انقل بياناتي' })).toBeInTheDocument();
  });
});
