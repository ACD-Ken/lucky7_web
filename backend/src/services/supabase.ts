import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY)!;
const supabaseAnonKey = (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_PUBLIC_KEY)!;
if (!supabaseAnonKey) throw new Error('SUPABASE_ANON_KEY environment variable is not set');

// Service client (admin, bypasses RLS) — use only for privileged operations
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

// Returns a per-request client scoped to the user's JWT.
// This client respects RLS policies — auth.uid() resolves to the user's id
// because signToken() includes sub: userId in the payload.
// Use this instead of supabaseAdmin for any query that should be user-scoped.
export function supabaseForUser(userJwt: string) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${userJwt}` } },
    auth:   { persistSession: false },
  });
}

export default supabaseAdmin;
