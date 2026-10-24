import { describe, it, expect } from 'vitest';
import { createElement as h } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { trialDaysRemaining, fetchCloudTrial } from '../src/lib/cloudTrial.js';
import CloudTrialBanner from '../src/components/CloudTrialBanner.jsx';
import { createI18n } from '../src/lib/i18n.js';

// A trial started on 2026-10-24 ends at midnight Riyadh (UTC+3) on 2026-10-31.
const END = '2026-10-30T21:00:00+00:00';
const atRiyadh = (local) => new Date(`${local}+03:00`);

describe('trialDaysRemaining', () => {
  it('counts seven days on the first day and one on the last', () => {
    expect(trialDaysRemaining(END, atRiyadh('2026-10-24T09:00:00'))).toBe(7);
    expect(trialDaysRemaining(END, atRiyadh('2026-10-30T23:59:00'))).toBe(1);
  });

  it('has nothing to count once the trial has ended', () => {
    expect(trialDaysRemaining(END, atRiyadh('2026-10-31T00:00:00'))).toBeNull();
    expect(trialDaysRemaining(END, atRiyadh('2026-11-05T12:00:00'))).toBeNull();
  });

  it('has nothing to count for a workspace that is not a trial', () => {
    expect(trialDaysRemaining(null)).toBeNull();
    expect(trialDaysRemaining('not a date')).toBeNull();
  });
});

function fakeClient({ userId = 'u1', workspaceId = 'w1', role = 'owner', trialEndsAt = END } = {}) {
  const rows = { workspace_members: { role }, workspaces: { trial_ends_at: trialEndsAt } };
  return {
    auth: { getSession: async () => ({ data: { session: userId ? { user: { id: userId } } : null } }) },
    rpc: async () => ({ data: workspaceId, error: null }),
    from: (table) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: rows[table], error: null }),
      };
      return chain;
    },
  };
}

describe('fetchCloudTrial', () => {
  it('reads the role and the end date of the default workspace', async () => {
    expect(await fetchCloudTrial(fakeClient())).toEqual({ role: 'owner', trialEndsAt: END });
  });

  it('returns nothing without a backend or a session', async () => {
    expect(await fetchCloudTrial(null)).toBeNull();
    expect(await fetchCloudTrial(fakeClient({ userId: null }))).toBeNull();
  });
});

describe('CloudTrialBanner', () => {
  const { t } = createI18n('en');
  const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000 - 60 * 1000).toISOString();

  it('shows the owner the days left', async () => {
    render(h(CloudTrialBanner, { t, load: async () => ({ role: 'owner', trialEndsAt: future }) }));
    await waitFor(() => expect(screen.getByTestId('cloud-trial-days').textContent).toContain('Days remaining: 3'));
  });

  it('shows nothing to any other role', async () => {
    let resolved = false;
    render(h(CloudTrialBanner, { t, load: async () => { resolved = true; return { role: 'supervisor', trialEndsAt: future }; } }));
    await waitFor(() => expect(resolved).toBe(true));
    expect(screen.queryByTestId('cloud-trial-banner')).toBeNull();
  });

  it('shows nothing once the trial has ended, or when there is no trial', async () => {
    const past = new Date(Date.now() - 60 * 1000).toISOString();
    const first = render(h(CloudTrialBanner, { t, load: async () => ({ role: 'owner', trialEndsAt: past }) }));
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId('cloud-trial-banner')).toBeNull();
    first.unmount();
    render(h(CloudTrialBanner, { t, load: async () => ({ role: 'owner', trialEndsAt: null }) }));
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId('cloud-trial-banner')).toBeNull();
  });

  it('speaks Arabic in the Arabic interface', async () => {
    const ar = createI18n('ar').t;
    render(h(CloudTrialBanner, { t: ar, load: async () => ({ role: 'owner', trialEndsAt: future }) }));
    await waitFor(() => expect(screen.getByTestId('cloud-trial-days').textContent).toContain('الأيام المتبقية: 3'));
    expect(screen.getByTestId('cloud-trial-banner').textContent).toContain('بتوقيت الرياض');
  });
});
