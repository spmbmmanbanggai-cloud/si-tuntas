import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, supabaseConfigError } from '../lib/supabaseClient'

export type AppRole = 'admin' | 'guru' | 'walikelas'

type Profile = {
  id: string
  role: AppRole
  display_name: string | null
  wali_kelas: string | null
}

function isAppRole(value: unknown): value is AppRole {
  return value === 'admin' || value === 'guru' || value === 'walikelas'
}

async function fetchMyProfile(userId: string): Promise<Profile> {
  if (!supabase) {
    throw new Error(supabaseConfigError ?? 'Supabase client is not configured')
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, display_name, wali_kelas')
    .eq('id', userId)
    .single()

  if (error || !data) {
    throw error ?? new Error('Profile not found')
  }

  const role = isAppRole(data.role) ? data.role : 'guru'

  return {
    id: data.id,
    role,
    display_name: data.display_name,
    wali_kelas: data.wali_kelas,
  }
}

function LoginScreen() {
  const sb = supabase
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!sb) {
      setError(supabaseConfigError ?? 'Supabase client is not configured')
      return
    }

    setLoading(true)
    setError(null)

    const { error: signInError } = await sb.auth.signInWithPassword({ email, password })

    setLoading(false)
    if (signInError) setError(signInError.message)
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-sm p-6">
        <h1 className="text-xl font-bold text-slate-800">SI-TUNTAS</h1>
        <p className="text-sm text-slate-500 mb-6">Login untuk Admin / Guru / Wali Kelas</p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input
              className="w-full border rounded-lg p-2"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <input
              className="w-full border rounded-lg p-2"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 p-3 rounded-lg">{error}</div>}

          <button
            disabled={loading}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
            type="submit"
          >
            {loading ? 'Masuk...' : 'Masuk'}
          </button>
        </form>

        <p className="text-xs text-slate-400 mt-4">
          Akun dibuat oleh admin melalui Supabase Auth.
        </p>
      </div>
    </div>
  )
}

export function AuthGate(props: {
  children: (ctx: { session: Session; user: User; profile: Profile; reloadProfile: () => Promise<void> }) => React.ReactNode
}) {
  if (supabaseConfigError) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-slate-800">Konfigurasi Supabase belum siap</h2>
          <p className="text-sm text-slate-600 mt-2">{supabaseConfigError}</p>
          <p className="text-sm text-slate-600 mt-2">
            Pastikan file <span className="font-mono">web/.env</span> berisi <span className="font-mono">VITE_SUPABASE_URL</span> dan{' '}
            <span className="font-mono">VITE_SUPABASE_ANON_KEY</span>, lalu restart server dev.
          </p>
        </div>
      </div>
    )
  }

  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reloadProfile = useCallback(async () => {
    const sb = supabase
    const userId = session?.user?.id
    if (!sb || !userId) return

    try {
      setError(null)
      const myProfile = await fetchMyProfile(userId)
      setProfile(myProfile)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load profile'
      setError(message)
    }
  }, [session?.user?.id])

  useEffect(() => {
    let mounted = true

    const sb = supabase
    if (!sb) {
      setError(supabaseConfigError ?? 'Supabase client is not configured')
      setLoading(false)
      return
    }

    const load = async () => {
      setLoading(true)
      setError(null)

      const { data } = await sb.auth.getSession()
      const nextSession = data.session ?? null

      if (!mounted) return

      setSession(nextSession)

      if (nextSession?.user) {
        try {
          const myProfile = await fetchMyProfile(nextSession.user.id)
          if (mounted) setProfile(myProfile)
        } catch (e) {
          const message = e instanceof Error ? e.message : 'Failed to load profile'
          if (mounted) setError(message)
        }
      } else {
        setProfile(null)
      }

      if (mounted) setLoading(false)
    }

    load()

    const { data: sub } = sb.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setProfile(null)
      void load()
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const content = useMemo(() => {
    if (loading) {
      return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center text-slate-600">
          Memuat...
        </div>
      )
    }

    if (!session?.user) return <LoginScreen />

    if (error) {
      return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-bold text-slate-800">Gagal memuat profil</h2>
            <p className="text-sm text-slate-600 mt-2">{error}</p>
            <button
              className="mt-4 px-4 py-2 bg-slate-800 text-white rounded-lg"
              onClick={() => supabase?.auth.signOut()}
            >
              Keluar
            </button>
          </div>
        </div>
      )
    }

    if (!profile) {
      return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center text-slate-600">
          Memuat profil...
        </div>
      )
    }

    return props.children({ session, user: session.user, profile, reloadProfile })
  }, [error, loading, profile, props, session])

  return <>{content}</>
}
