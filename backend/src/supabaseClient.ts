import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY as string | undefined;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined;

if (!SUPABASE_URL) throw new Error('Missing SUPABASE_URL (set SUPABASE_URL in .env)');
if (!SUPABASE_ANON_KEY) throw new Error('Missing SUPABASE_ANON_KEY (set SUPABASE_ANON_KEY in .env)');
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY (set SUPABASE_SERVICE_ROLE_KEY in .env)');

// Cliente admin: ignora RLS, só usado internamente (ex: validar token, bootstrap de org)
export const adminClient: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Cliente escopado ao usuário: respeita RLS, é o que as rotas devem usar
export function createClientForUser(accessToken?: string): SupabaseClient {
  return createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
    global: {
      headers: {
        Authorization: accessToken ? `Bearer ${accessToken}` : ''
      }
    }
  });
}
