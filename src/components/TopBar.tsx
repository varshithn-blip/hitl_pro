import type { AuthedUser } from '../lib/googleAuth'
import { ChevronDown } from './icons'

interface Props {
  user: AuthedUser | null
  demoMode: boolean
  onSignIn: () => void
  onSignOut: () => void
}

export function TopBar({ user, demoMode, onSignIn, onSignOut }: Props) {
  return (
    <div
      style={{
        height: 58,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        background: 'var(--bg-panel)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: 'var(--accent)',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          DR
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Document Review</span>
          <span style={{ fontSize: 10.5, fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Reviewer Console
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: demoMode ? 'var(--warning)' : 'var(--success)',
              display: 'inline-block',
            }}
          />
          {demoMode ? 'Demo mode — sample data' : 'Connected to Google Sheets'}
        </div>

        <div style={{ width: 1, height: 24, background: 'var(--border)' }} />

        {user ? (
          <button
            onClick={onSignOut}
            title="Sign out"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'none',
              border: 'none',
              padding: 0,
              color: 'var(--text-primary)',
            }}
          >
            {user.picture ? (
              <img src={user.picture} alt="" style={{ width: 28, height: 28, borderRadius: '50%' }} />
            ) : (
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: 'oklch(90% 0.04 255)',
                  color: 'oklch(38% 0.09 255)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {user.name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <span style={{ fontSize: 12.5, fontWeight: 500 }}>{user.name}</span>
            <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />
          </button>
        ) : (
          <button
            onClick={onSignIn}
            style={{
              padding: '7px 14px',
              borderRadius: 7,
              border: '1px solid var(--border-strong)',
              background: 'white',
              fontSize: 12.5,
              fontWeight: 600,
            }}
          >
            Sign in with Google
          </button>
        )}
      </div>
    </div>
  )
}
