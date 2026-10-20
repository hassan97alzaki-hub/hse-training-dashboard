/**
 * The sign-in paths.
 *
 * The point of these tests is as much what is still here as what is new: the
 * password path predates the magic link and belongs to real accounts, so the
 * magic link is an addition and nothing about the password may change.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import * as supabaseClient from '../src/lib/supabaseClient.js';
import {
  signIn,
  signUp,
  signInWithMagicLink,
  requestPasswordReset,
  ensureWorkspace,
} from '../src/lib/auth.js';

/** Records what the client was asked to do, and answers how the test says. */
function fakeAuthClient({ otpError = null, rpcError = null, rpcData = 'ws-1' } = {}) {
  const calls = [];
  return {
    calls,
    auth: {
      signInWithPassword(args) {
        calls.push(['signInWithPassword', args]);
        return Promise.resolve({ data: {}, error: null });
      },
      signUp(args) {
        calls.push(['signUp', args]);
        return Promise.resolve({ data: { session: {} }, error: null });
      },
      signInWithOtp(args) {
        calls.push(['signInWithOtp', args]);
        return Promise.resolve({ data: {}, error: otpError });
      },
      resetPasswordForEmail(email) {
        calls.push(['resetPasswordForEmail', email]);
        return Promise.resolve({ error: null });
      },
    },
    rpc(name, args) {
      calls.push(['rpc', name, args]);
      return Promise.resolve({ data: rpcError ? null : rpcData, error: rpcError });
    },
  };
}

let client;

beforeEach(() => {
  client = fakeAuthClient();
  vi.spyOn(supabaseClient, 'getSupabaseClient').mockImplementation(() => client);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('signInWithMagicLink', () => {
  it('asks for a one-time link', async () => {
    const result = await signInWithMagicLink('person@example.com');
    expect(result.success).toBe(true);
    const [name, args] = client.calls.at(-1);
    expect(name).toBe('signInWithOtp');
    expect(args.email).toBe('person@example.com');
  });

  it('trims the address, because an address with a space is a typo not a user', async () => {
    await signInWithMagicLink('  person@example.com  ');
    expect(client.calls.at(-1)[1].email).toBe('person@example.com');
  });

  // There is no separate registration for this path: the link is the whole
  // sign-up. Turning this off would send a link that goes nowhere for anyone
  // who has not already registered with a password.
  it('creates the account if there is none', async () => {
    await signInWithMagicLink('new@example.com');
    expect(client.calls.at(-1)[1].options.shouldCreateUser).toBe(true);
  });

  it('sends the reader back to the dashboard', async () => {
    await signInWithMagicLink('person@example.com');
    expect(client.calls.at(-1)[1].options.emailRedirectTo).toMatch(/\/app$/);
  });

  it('reports why it failed rather than claiming it sent', async () => {
    client = fakeAuthClient({ otpError: { message: 'rate limit exceeded' } });
    const result = await signInWithMagicLink('person@example.com');
    expect(result).toEqual({ success: false, error: 'rate limit exceeded' });
  });

  it('refuses an empty address without calling out', async () => {
    const result = await signInWithMagicLink('   ');
    expect(result.success).toBe(false);
    expect(client.calls).toHaveLength(0);
  });
});

describe('the password paths, which the magic link does not replace', () => {
  it('still signs in with a password', async () => {
    const result = await signIn('person@example.com', 'hunter2hunter2');
    expect(result.success).toBe(true);
    expect(client.calls.at(-1)[0]).toBe('signInWithPassword');
  });

  it('still registers with a password', async () => {
    const result = await signUp('person@example.com', 'hunter2hunter2');
    expect(result.success).toBe(true);
    expect(client.calls.at(-1)[0]).toBe('signUp');
  });

  it('still sends a reset link', async () => {
    const result = await requestPasswordReset('person@example.com');
    expect(result.success).toBe(true);
    expect(client.calls.at(-1)[0]).toBe('resetPasswordForEmail');
  });
});

describe('ensureWorkspace', () => {
  it('asks the database to bootstrap one', async () => {
    const result = await ensureWorkspace();
    expect(result).toEqual({ success: true, workspaceId: 'ws-1' });
    expect(client.calls.at(-1)).toEqual(['rpc', 'bootstrap_workspace_for_user', undefined]);
  });

  it('reports a failure instead of pretending there is a workspace', async () => {
    client = fakeAuthClient({ rpcError: { message: 'permission denied' } });
    const result = await ensureWorkspace();
    expect(result).toEqual({ success: false, error: 'permission denied' });
  });
});

describe('a build with no backend', () => {
  beforeEach(() => {
    vi.spyOn(supabaseClient, 'getSupabaseClient').mockImplementation(() => null);
  });

  it.each([
    ['signInWithMagicLink', () => signInWithMagicLink('person@example.com')],
    ['ensureWorkspace', () => ensureWorkspace()],
  ])('%s says so rather than throwing', async (_name, call) => {
    const result = await call();
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no account backend/i);
  });
});
