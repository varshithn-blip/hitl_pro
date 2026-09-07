import { CONFIG, SHEETS_SCOPES } from './config'

export interface AuthedUser {
  accessToken: string
  /** Expiry as an epoch-ms timestamp, so callers can tell a stale token
   * apart from "never signed in" without re-parsing expires_in. */
  expiresAt: number
  name: string
  email: string
  picture?: string
}

const STORAGE_KEY = 'hitl-review-portal.auth'

let tokenClient: ReturnType<NonNullable<Window['google']>['accounts']['oauth2']['initTokenClient']> | null = null

function loadStoredUser(): AuthedUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AuthedUser
    if (!parsed.accessToken || parsed.expiresAt < Date.now()) return null
    return parsed
  } catch {
    // localStorage can throw in some contexts (private browsing, blocked
    // site data) — treat as "not signed in" rather than crashing.
    return null
  }
}

function storeUser(user: AuthedUser | null) {
  try {
    if (user) localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Non-fatal: session just won't survive a reload.
  }
}

async function fetchProfile(accessToken: string): Promise<{ name: string; email: string; picture?: string }> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Failed to fetch Google profile (${res.status})`)
  const data = await res.json()
  return { name: data.name ?? data.email, email: data.email, picture: data.picture }
}

/** Every reviewer signs in with their own Google account (see plan notes —
 * no shared service account); this just wraps Google Identity Services'
 * token-client flow so callers get back a plain access token + profile.
 * NOTE: unverified against a live Google Cloud OAuth client in this build
 * pass — see README "Known gaps". */
export function signIn(): Promise<AuthedUser> {
  return new Promise((resolve, reject) => {
    if (!CONFIG.googleClientId) {
      reject(new Error('VITE_GOOGLE_CLIENT_ID is not configured'))
      return
    }
    if (!window.google) {
      reject(new Error('Google Identity Services script has not loaded yet'))
      return
    }

    if (!tokenClient) {
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.googleClientId,
        scope: SHEETS_SCOPES,
        callback: async (response) => {
          if (response.error || !response.access_token) {
            reject(new Error(response.error ?? 'Sign-in failed'))
            return
          }
          try {
            const profile = await fetchProfile(response.access_token)
            const user: AuthedUser = {
              accessToken: response.access_token,
              expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000,
              ...profile,
            }
            storeUser(user)
            resolve(user)
          } catch (err) {
            reject(err)
          }
        },
      })
    }

    tokenClient.requestAccessToken({ prompt: 'select_account' })
  })
}

export function getStoredUser(): AuthedUser | null {
  return loadStoredUser()
}

export function signOut(user: AuthedUser | null) {
  storeUser(null)
  if (user?.accessToken && window.google) {
    window.google.accounts.oauth2.revoke(user.accessToken, () => {})
  }
}
