export const CONFIG = {
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined,
  masterSheetId: import.meta.env.VITE_MASTER_SHEET_ID as string | undefined,
  forceDemoMode: import.meta.env.VITE_DEMO_MODE === 'true',
}

/** Demo mode runs whenever we're deliberately forced into it, or whenever
 * the two real-mode prerequisites (a Google OAuth client + the master
 * sheet id) aren't both configured. That way the app is always usable
 * (against synthetic data) even before anyone has set up credentials. */
export const DEMO_MODE = CONFIG.forceDemoMode || !CONFIG.googleClientId || !CONFIG.masterSheetId

export const SHEETS_SCOPES =
  'openid email profile https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.readonly'
