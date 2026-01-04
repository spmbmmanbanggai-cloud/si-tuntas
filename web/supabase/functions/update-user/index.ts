// Supabase Edge Function: update-user
// Admin-only: update an existing teacher account (Auth user + profiles row).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

type UpdateUserBody = {
  user_id: string
  email?: string | null
  password?: string | null
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

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(500, {
      error: 'Missing Supabase env vars (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY).',
    })
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return json(401, { error: 'Missing Authorization bearer token.' })
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData?.user) {
    return json(401, { error: 'Invalid session.', detail: userError?.message ?? null })
  }

  const callerId = userData.user.id

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

  let body: UpdateUserBody
  try {
    body = await req.json()
  } catch {
    return json(400, { error: 'Invalid JSON body.' })
  }

  const userId = (body.user_id ?? '').trim()
  if (!userId || !isUuid(userId)) {
    return json(400, { error: 'user_id tidak valid.' })
  }

  const email = body.email === undefined ? undefined : (body.email ?? '').trim().toLowerCase()
  const password = body.password === undefined ? undefined : (body.password ?? '')
  const displayName = body.display_name === undefined ? undefined : (body.display_name ?? '').trim()

  if (email !== undefined) {
    if (!email || !email.includes('@')) {
      return json(400, { error: 'Email tidak valid.' })
    }
  }

  if (password !== undefined) {
    if (!password || password.length < 6) {
      return json(400, { error: 'Password minimal 6 karakter.' })
    }
  }

  // Update auth user if needed
  if (email !== undefined || password !== undefined) {
    const { error: updateAuthError } = await adminClient.auth.admin.updateUserById(userId, {
      ...(email !== undefined ? { email, email_confirm: true } : {}),
      ...(password !== undefined ? { password } : {}),
    })

    if (updateAuthError) {
      return json(400, { error: updateAuthError.message })
    }
  }

  // Update profiles fields if provided
  if (email !== undefined || displayName !== undefined) {
    const payload: Record<string, unknown> = { id: userId }
    if (email !== undefined) payload.email = email
    if (displayName !== undefined) payload.display_name = displayName ? displayName : null

    const { error: updateProfileError } = await adminClient.from('profiles').upsert(payload, { onConflict: 'id' })
    if (updateProfileError) {
      return json(500, { error: updateProfileError.message })
    }
  }

  return json(200, { ok: true })
})
