// Supabase Edge Function: create-user
// Creates a new teacher account (Auth user + profiles row).
// Security: only callers with profiles.role = 'admin' may use.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

type CreateUserBody = {
  email: string
  password: string
  display_name?: string | null
}

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(500, { error: 'Missing Supabase env vars (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY).' })
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return json(401, { error: 'Missing Authorization bearer token.' })
  }

  // Client to validate caller's JWT.
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData?.user) {
    return json(401, {
      error: 'Invalid session.',
      detail: userError?.message ?? null,
    })
  }

  const callerId = userData.user.id

  // Admin client to bypass RLS and create auth users.
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const { data: callerProfile, error: profileError } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', callerId)
    .maybeSingle()

  if (profileError) return json(500, { error: profileError.message })
  if (!callerProfile || callerProfile.role !== 'admin') {
    return json(403, { error: 'Forbidden: admin only.' })
  }

  let body: CreateUserBody
  try {
    body = await req.json()
  } catch {
    return json(400, { error: 'Invalid JSON body.' })
  }

  const email = (body.email ?? '').trim().toLowerCase()
  const password = body.password ?? ''
  const displayName = (body.display_name ?? '').trim()

  if (!email || !email.includes('@')) {
    return json(400, { error: 'Email tidak valid.' })
  }
  if (!password || password.length < 6) {
    return json(400, { error: 'Password minimal 6 karakter.' })
  }

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (createError) {
    return json(400, { error: createError.message })
  }

  const newUserId = created.user?.id
  if (!newUserId) {
    return json(500, { error: 'Failed to create user.' })
  }

  // Ensure profile exists and set role to 'guru'.
  const { error: upsertError } = await adminClient.from('profiles').upsert(
    {
      id: newUserId,
      role: 'guru',
      email,
      display_name: displayName ? displayName : null,
    },
    { onConflict: 'id' },
  )

  if (upsertError) {
    return json(500, { error: upsertError.message })
  }

  return json(200, {
    ok: true,
    user: {
      id: newUserId,
      email,
      role: 'guru',
      display_name: displayName ? displayName : null,
    },
  })
})
