import '@testing-library/jest-dom';
import { configure } from '@testing-library/dom';
import { vi } from 'vitest';

// Vitest loads `.env.local` like any other build, so a developer who has
// pointed their own checkout at a real Supabase project changes what the
// tests exercise: `isSupabaseConfigured()` turns true, the application takes
// its cloud path, and every test written against the local-only build fails
// on this machine while passing on a clean one.
//
// The suite decides its own configuration. A test that needs a configured
// build stubs these two values itself; everything else runs as the
// local-only build, which is what the assertions describe.
vi.stubEnv('VITE_SUPABASE_URL', '');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

// Testing Library waits one second by default for something to appear. That
// is enough on a developer's machine and not enough on a shared CI runner,
// where a render that reads a CSV through a mocked fetch and then fails to
// open an IndexedDB that jsdom does not have takes noticeably longer. Several
// tests had already worked around it by passing `{ timeout: 5000 }` at the
// call site; the ones that had not were the ones that went red the first time
// the suite ran anywhere but a laptop.
//
// Raising the default costs nothing when a test passes — the helpers poll and
// return as soon as the element is there — and only changes how long a
// genuinely failing test takes to say so.
configure({ asyncUtilTimeout: 5000 });
