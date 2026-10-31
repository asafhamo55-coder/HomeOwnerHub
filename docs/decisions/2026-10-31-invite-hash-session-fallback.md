# Invite links: hash-session fallback (2026-10-31)

## Inference (not yet proven)
Board and owner invites use `admin.auth.admin.inviteUserByEmail(email, { redirectTo: appUrl('/auth/callback') })`
on the service-role client. An admin-generated link has no PKCE verifier, so Supabase most likely returns the
session in the URL hash (`#access_token=...&refresh_token=...&type=invite`) rather than `?code=`. The
`/auth/callback` route is server-side and cannot see a hash, so it redirects to `/login?error=missing_code`
(the browser keeps the hash across the same-origin redirect). Nothing then consumed the hash, so invitees were
probably never signed in.

## Change
`components/auth/HashSessionHandler.tsx`, mounted in `LoginView`. On mount it reads `location.hash` and acts only
when it holds both `access_token` and `refresh_token`: `auth.setSession`, confirm with `auth.getUser`, strip the
hash with `history.replaceState`, then route to a safe `next` (or `redirect`), `/reset-password` for
`type=recovery`, otherwise `/`. An `error`/`error_description` hash, or a failed setSession, just clears the
hash; the page stays as it was. While handling it shows "Signing you in…".

## Why it is safe
- Runs only when both tokens are present; with no hash it does nothing.
- Uses Supabase's own `setSession` and verifies with `getUser`; no hand-rolled cookies.
- Destination goes through `safeNextPath`, so external, protocol-relative and `javascript:` targets collapse to `/`.
- Tokens and emails are never logged. Invite sending, `redirectTo`, the PKCE callback, cookies and middleware are untouched.

## Verify
Asaf should invite his own address once (board or owner invite) and click the link. Expected: lands signed in.
If it still fails, the hash theory is wrong and the failing URL shape is the next clue.
