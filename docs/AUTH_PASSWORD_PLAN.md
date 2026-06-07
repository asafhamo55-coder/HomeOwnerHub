# Auth: Email + Password (and a later second factor)

**Status:** Phase 1 in progress · **Scope:** `apps/hoa` only · **Owner:** —
**Decision date:** 2026-06-07

## Goal

Add **email + password** sign-in to the HOA app, *alongside* the existing
magic-link flow (not replacing it). The email address is the username. Later,
add a **user-selectable second factor** ("send me a code"), shipping
**email-code first** and **SMS later** once the SMS provider is reliable.

## Why this shape

- The app already runs on **Supabase Auth** (`@supabase/ssr`), which natively
  supports password sign-in, password reset, and MFA. We are configuring and
  extending it, not building our own auth.
- Password is **additive**: existing magic-link users are unaffected; both
  methods resolve to the **same Supabase user** (keyed by email), so no
  duplicate accounts.

## Security posture (Supabase)

What Supabase gives us, and what we must turn on:

| Control | Default | Action |
|---|---|---|
| Password hashing (bcrypt) | on | — |
| httpOnly cookie sessions (JWT + rotating refresh) | on (via `@supabase/ssr`) | — |
| Leaked-password check (HaveIBeenPwned) | **off** | **turn on** |
| Min length / strength policy | weak | set min ≥ 10 |
| Confirm-email-before-login | varies | **require** |
| Auth-endpoint rate limiting | on | — |
| CAPTCHA (Turnstile/hCaptcha) | off | optional, recommended |
| Row-Level Security (real backstop) | per-table | already enforced |

Security depends on **us** flipping these on — the defaults are permissive.

## ⚠️ Key constraint for Phase 2

Supabase **native MFA supports only `totp` and `phone` (SMS)** factor types.
There is **no built-in "email code as a second factor."** So:

- **Email 2FA (Phase 2a):** a small **custom step-up** flow we build — after
  password succeeds, generate a one-time code, email it, verify it, then mark
  the session elevated and gate sensitive routes on that flag.
- **SMS 2FA (Phase 2b):** native Supabase **Phone MFA**
  (`mfa.enroll` / `mfa.challenge` / `mfa.verify`), swapped in behind the same
  per-user factor preference once the SMS provider is solid.

The 2FA UI is built to show both options from day one, with **SMS disabled
("coming soon")** until 2b — so enabling it later is a config flip, not a
redesign.

---

## Phase 1 — Email + password (ship now)

### Supabase dashboard (no code)
1. Enable **Email** provider password sign-in (keep magic-link/OTP on).
2. Enable **leaked-password protection**; set **min length ≥ 10**.
3. Set **Confirm email = required**.
4. (Optional) Enable **CAPTCHA** on auth endpoints.

### Code (`apps/hoa/src`)
- `app/(auth)/login/PasswordForm.tsx` — `signInWithPassword`.
- `app/(auth)/login/LoginMethods.tsx` — client toggle: **Password** ↔
  **Email me a link** (reuses `MagicLinkForm`).
- `app/(auth)/login/page.tsx` — render `LoginMethods`.
- `app/(auth)/signup/SignupForm.tsx` — `signUp({ email, password })` with
  `emailRedirectTo → /auth/callback`; magic-link offered as the alternative.
- `app/(auth)/signup/page.tsx` — render the new signup with method toggle.
- `app/(auth)/forgot-password/page.tsx` + `ForgotPasswordForm.tsx` —
  `resetPasswordForEmail(email, { redirectTo: /auth/callback?next=/reset-password })`.
- `app/(auth)/reset-password/page.tsx` + `ResetPasswordForm.tsx` —
  `updateUser({ password })` inside the recovery session.
- `middleware.ts` — add `/forgot-password`, `/reset-password` to
  `PUBLIC_PREFIXES`.
- `app/auth/callback/route.ts` — already supports `?next=`; recovery links
  route through it to `/reset-password`. No type-detection needed.

### Edge cases (handled by design)
- **Magic-link-only users have no password** → "Forgot password" doubles as
  "Set a password." Same email = same single user.
- **Unverified password signup** → blocked from login until they confirm
  (Confirm-email = required).

---

## Phase 2 — Second factor (design now, build later)

- Per-user `factor_preference` (`email` | `sms`), default `email`.
- **2a Email step-up (first):** custom code issue/verify → elevated session →
  gate board/admin actions.
- **2b SMS (later):** native Supabase Phone MFA behind the same preference.
- UI shows both; SMS disabled until 2b.
