/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string
  readonly VITE_MASTER_SHEET_ID?: string
  readonly VITE_DEMO_MODE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Loaded via <script src="https://accounts.google.com/gsi/client"> in
// index.html. Typed loosely (not @types/google.accounts) to avoid an
// extra dependency for what is a small surface — see lib/googleAuth.ts for
// the only place this is touched.
interface Window {
  google?: {
    accounts: {
      oauth2: {
        initTokenClient(config: {
          client_id: string
          scope: string
          callback: (response: { access_token?: string; error?: string; expires_in?: number }) => void
        }): { requestAccessToken: (opts?: { prompt?: string }) => void }
        revoke(token: string, done: () => void): void
      }
      id: {
        initialize(config: { client_id: string; callback: (resp: { credential: string }) => void }): void
        renderButton(parent: HTMLElement, options: Record<string, unknown>): void
      }
    }
  }
}
