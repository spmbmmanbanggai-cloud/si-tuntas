import { AuthGate } from './auth/AuthGate'
import SiTuntasApp from './SiTuntasApp'

export default function App() {
  return (
    <AuthGate>
      {({ profile, user, reloadProfile }) => (
        <SiTuntasApp
          role={profile.role}
          waliKelas={profile.wali_kelas}
          userId={user.id}
          userEmail={user.email ?? null}
          reloadProfile={reloadProfile}
        />
      )}
    </AuthGate>
  )
}
