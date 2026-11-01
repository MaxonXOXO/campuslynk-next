# ADR-0011: Token Lifetimes, Login Throttling, and Credential Policies

**Status:** Proposed  
**Date:** 2026-11-01  
**Deciders:** Core Engineering Team  
**Consulted:** ADR-0001, ADR-0003, `docs/foundation_spec.md` (§3.2, §3.4)  

---

## Context

Academic Suite (Carmel LINX / CampusLynk Next) serves polytechnic colleges across on-premises appliances and cloud environments. Users include staff (faculty, HODs, Principal, administrators), students, and guardians.

Per **ADR-0003**:
- Universal default passwords (e.g., legacy `carmel2026`) are prohibited.
- Passwords must be hashed with Argon2id.
- Initial credentials are one-time, randomly generated, single-use, and force a password change upon first authentication.
- Authentication tokens are issued via Laravel Sanctum and physically stored in the tenant database, ensuring cross-tenant token invalidation.

We require definitive operational policies for:
1. Personal access token lifetimes and renewal across client types (web vs mobile).
2. Per-tenant login throttling, anti-enumeration, and temporary account lockout.
3. Password complexity policy avoiding composition theatre while mitigating breached/dictionary attacks.

---

## Decision

### 1. Token Lifetimes & Client Scopes

Sanctum personal access tokens are stored in the tenant's `personal_access_tokens` table with ULID keys and explicit `expires_at` timestamps determined at login:
- **Web Client (`client: "web"`)**: Default lifetime of **12 hours** (`now()->addHours(12)`). Aligns with standard academic workstation shifts without forcing unnecessary re-authentication during daily campus operations.
- **Mobile App Client (`client: "mobile"`)**: Default lifetime of **30 days** (`now()->addDays(30)`). Provides a seamless mobile experience for faculty and students on personal smartphones while maintaining an upper bound on token validity.
- **Tenant Settings Override**: Default durations can be tuned per tenant via `tenant_settings` (`auth.token_lifetime_web_hours`, `auth.token_lifetime_mobile_days`).

### 2. Forced Password Change & Token Abilities

When a user account has `must_change_password = true`:
- The issued Sanctum token is restricted exclusively to abilities `['password:change', 'auth:logout']`.
- All standard business API endpoints require standard abilities and reject tokens bearing only `password:change` with HTTP **403 Forbidden** (`Password Change Required`).
- Upon successful execution of `POST /api/v1/auth/password/change`, the user's `must_change_password` flag is cleared, and all other active tokens for that user are revoked immediately.

### 3. Per-Tenant Multi-Tier Login Rate Limiting & Trusted Proxies (Prompt 04b)

To protect institutional credentials against distributed brute-force attacks and credential stuffing while preventing cross-institution denial of service:
- **Tenant Isolation**: Rate limits are strictly partitioned per tenant. A brute-force attempt against institution A never impacts rate limits or availability for the same user identifier or IP in institution B.
- **Three Defense Tiers**:
  1. **Tier 1 (Per-account from single IP)**: Key `auth:throttle:account_ip:{tenant_id}:{sha256(identifier)}:{ip}`. Maximum **5 failed attempts** within a **5-minute window** (`DECAY_SECONDS = 300`).
  2. **Tier 2 (Per-account across all IPs - Anti-Distributed Brute Force)**: Key `auth:throttle:account:{tenant_id}:{sha256(identifier)}`. Maximum **15 failed attempts** within a **15-minute window** (`DECAY_IDENTIFIER_SECONDS = 900`). Prevents attackers rotating IPs from guessing an identifier indefinitely.
  3. **Tier 3 (Per-IP across all accounts - Anti-Credential Stuffing)**: Key `auth:throttle:ip:{tenant_id}:{ip}`. Maximum **30 failed attempts** within a **15-minute window** (`DECAY_IP_SECONDS = 900`). Prevents an attacker on a single IP from stuffing credentials against multiple accounts.
- **Lockout Response**: Exceeding any tier triggers HTTP **429 Too Many Requests** with RFC 7807 problem details and `Retry-After` header reflecting the maximum remaining decay.
- **Trusted Proxies (`TRUSTED_PROXIES`)**: Reverse proxy and tunnel peers (ADR-0008, Cloudflare, AWS ALB) are explicitly configured via `TRUSTED_PROXIES` in `config/app.php` and `bootstrap/app.php`. Untrusted client connections cannot spoof `X-Forwarded-For` headers.

### 4. Zero User Enumeration & Timing Attack Defense

- **Identical Error Envelope**: Regardless of whether an identifier does not exist, the password is incorrect, or the account is `suspended`/`pending`, the endpoint returns identical HTTP **401 Unauthorized** responses:
  ```json
  {
    "type": "https://errors.campuslynk.net/auth/unauthorized",
    "title": "Authentication Failed",
    "status": 401,
    "detail": "Invalid credentials provided."
  }
  ```
- **Constant-Time Verification**: When an unknown identifier is submitted, the backend verifies against a pre-computed dummy Argon2id hash. This ensures constant CPU processing time (~50–80ms) and prevents timing-based user enumeration.

### 5. Password Policy (No Composition Theatre)

Aligned with modern NIST SP 800-63B guidelines:
- **Length**: Minimum **8 characters**, maximum **128 characters**.
- **No Composition Theatre**: No arbitrary mandates requiring combinations of uppercase, lowercase, numbers, and special symbols (which encourage predictable substitutions like `P@ssword1`).
- **Breached & Common Password Check**: Passwords are checked against a local dictionary of top common, leaked, and institution-predictable passwords (e.g., `carmel2026`, `password123`, `admin1234`).
- **Trivial Repeat Rejection**: Single repeated characters (e.g., `aaaaaaaa`) are rejected.

---

## Consequences

- ✅ **Defense-in-depth**: Brute-force attacks are constrained by rate limits, timing mitigation, and tenant isolation.
- ✅ **Clean operational UX**: Web tokens last a full working day; mobile devices maintain authenticated sessions across academic terms.
- ✅ **Zero cross-tenant leakage**: Token storage and throttling counters are isolated per institution database and Redis prefix.

