import { createClient } from '@supabase/supabase-js'
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) console.error('Missing Supabase env vars — copy .env.example to .env')
export const supabase = createClient(url || 'http://localhost', key || 'anon')
export const isConfigured = Boolean(url && key)
