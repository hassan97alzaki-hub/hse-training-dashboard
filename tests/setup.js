import '@testing-library/jest-dom';
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
