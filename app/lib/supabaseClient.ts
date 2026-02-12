import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://bgkgqkmdeapnmayrvntt.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJna2dxa21kZWFwbm1heXJ2bnR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyODgxNDgsImV4cCI6MjA4NTg2NDE0OH0.WnrF9xuPlnqOPWHQ3bsWR2U-zim8OHEd1deeh9xNOiU';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
