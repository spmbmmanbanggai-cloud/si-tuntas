import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

function validateHttpUrl(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return 'Must be a valid HTTP or HTTPS URL.'
    }
    return null
  } catch {
    return 'Must be a valid HTTP or HTTPS URL.'
  }
}

let configError: string | null = null

if (!supabaseUrl || !supabaseAnonKey) {
  configError = 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. If you just edited .env, restart the Vite dev server.'
} else {
  const urlError = validateHttpUrl(supabaseUrl.trim())
  if (urlError) {
    configError = `Invalid VITE_SUPABASE_URL: ${urlError}`
  }
}

export const supabaseConfigError = configError

export const supabase = supabaseConfigError ? null : createClient(supabaseUrl!.trim(), supabaseAnonKey!)
