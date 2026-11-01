# ADR-0003: Student, staff and parent authentication

**Status:** Decided

## Context
The legacy app used a universal default password (`carmel2026`), plaintext passwords, a parent login that auto-bound any 10-digit number when `guardian_mobile` was empty, and a static MD5 parent token with a `demo` bypass. Parents had no account.

## Decision
1. Single `users` table. Passwords hashed with **Argon2id**. No plaintext storage, no "show users" screen; admins use audited reset or one-time invite links.
2. **No universal default password.** Initial credentials are random per account, single use, expiring, and force a change at first login.
3. **Student first login:** Students sign in using their Registration Number or mobile/email with an admin-generated one-time temporary password (deliverable via printable slip, email, or Tutor screen), and are forced to set a personal password and optional passkey on first login.
4. **Parent accounts** are real users of type `parent`, linked to student(s) through `guardian_links` (`user_id`, `student_id`, `relationship`, `is_primary`, `verified_by`). A link is created or changed **only** by a Tutor or Admin (or a Tutor-verified student profile flow), never by the parent logging in.
5. **Parent sign-in options**, chosen per tenant:
   - **Primary / Offline-capable fallback:** Mobile/email + one-time temporary password issued by the Tutor/Admin (must be changed at first login). Works 100% offline on an on-prem server without internet or SMS balance.
   - **Optional OTP provider:** **Firebase Phone Auth** (when internet is available and configured) or pluggable SMS/WhatsApp provider behind `OtpSenderContract`.
6. **OTP rules:** short expiry (5 minutes), max 5 attempts per challenge, per-number and per-IP rate limits, never written to application logs.
7. **Magic links** for parents are signed, single-purpose, and expiring; no static tokens.
8. **Passkeys:** use `laragear/webauthn` with full cryptographic FIDO2 verification (`rpId` bound to tenant domain, e.g. `app.carmelpoly.in`, dynamic `challenge`, `sign_count` tracking) for staff and optionally students.
9. **Second factor (MFA):** TOTP (`pragmarx/google2fa`) or Passkey. Mandatory for `super_admin`; optional or tenant-enforced for `principal`, `hod`, and staff.

## Consequences
- Works out of the box on Carmel's on-prem server (`app.carmelpoly.in`) via temporary password / email / In-App + FCM without blocking on India DLT SMS registration.
- Firebase (`FCM` for web/React Native push notifications + optional `Firebase Auth` for phone OTP) is integrated behind clean contracts so on-prem local-only operation never breaks if internet drops.
- WhatsApp Business API is deferred to post-MVP backlog behind the same notification channel interface.
