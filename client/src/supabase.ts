import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://jzrgfywbwjkazmujiccp.supabase.co';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_4LW3Su4Fp26SxGrMHcQ5rQ_OiP_QYNq';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/monitor`;
export const PUBLISHABLE_KEY = SUPABASE_KEY;
