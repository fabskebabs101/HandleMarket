import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://bvzdhcndhutybpibetwi.supabase.co'
const SUPABASE_KEY = 'sb_publishable_fnBWel5JTvzeinQDVOUxQA_kEGtKTUO'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
