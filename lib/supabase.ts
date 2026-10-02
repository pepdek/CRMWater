import { createClient } from '@supabase/supabase-js';

// One client. Public inserts and admin reads both go through RLS; no service-role key needed.
export const supabase = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
