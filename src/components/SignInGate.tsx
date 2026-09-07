interface Props {
  onSignIn: () => void
  error?: string | null
}

export function SignInGate({ onSignIn, error }: Props) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-app)' }}>
      <div
        style={{
          width: 360,
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 32,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 14,
          textAlign: 'center',
        }}
      >
        <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--accent)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
          DR
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Sign in to review documents</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 6 }}>
            Use the Google account that's been granted access to the master sheet. Every read and write happens with your own
            login — nothing is shared through a service account.
          </div>
        </div>
        {error && <div style={{ fontSize: 12, color: 'var(--danger)', background: 'var(--danger-tint)', padding: '8px 12px', borderRadius: 8 }}>{error}</div>}
        <button
          onClick={onSignIn}
          style={{ width: '100%', padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'white', fontSize: 13, fontWeight: 600 }}
        >
          Sign in with Google
        </button>
      </div>
    </div>
  )
}
