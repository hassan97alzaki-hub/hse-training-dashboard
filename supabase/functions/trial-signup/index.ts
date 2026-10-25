// trial-signup — turns a request from /trial into a working trial account.
//
// Runs on Supabase with the service-role key, which Supabase provides to
// every Edge Function as SUPABASE_SERVICE_ROLE_KEY; it is never in the page.
// The work itself is in ../_shared/provisionTrial.js so it can be tested
// without Deno. JWT verification is off for this function (config.toml):
// the caller is an anonymous visitor, and the publishable key is not a JWT.
//
// Deploy: npx supabase functions deploy trial-signup --no-verify-jwt

import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { provisionTrial } from '../_shared/provisionTrial.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (request.method !== 'POST') return reply({ status: 'invalid', errors: {} }, 405);

  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch {
    return reply({ status: 'invalid', errors: {} }, 400);
  }

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !serviceKey) {
    console.error('trial-signup: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set');
    return reply({ status: 'failed' }, 500);
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    return reply(await provisionTrial(admin, input));
  } catch (error) {
    console.error('trial-signup', error);
    return reply({ status: 'failed' }, 500);
  }
});
