import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://vqhxqnhqylxskwpxdhun.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxaHhxbmhxeWx4c2t3cHhkaHVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNzU1ODMsImV4cCI6MjA4Njc1MTU4M30.0j6zn_PWvudsI3GQoWydr4FPE-fgUowxYV1zqXhXR4M';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
