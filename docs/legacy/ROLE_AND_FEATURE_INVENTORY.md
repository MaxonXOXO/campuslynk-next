# CARMEL LINX — Role & Feature Inventory (Legacy Re-Architecture Blueprint)

> **Codebase Analyzed**: Carmel-linx-legacy/academic-platform/carmel-linx-laravel (Laravel 12.x / PHP 8.2 / Blade / MySQL / SQLite)
> **Privacy & Data Hygiene**: Zero personal data (names, phone numbers, email addresses) is included in this document. All findings are strictly code-level facts with exact ile:line citations relative to carmel-linx-laravel/.

## Table of Contents
1. [Section 1: Authentication & Session Architecture](#section-1-authentication--session-architecture)
2. [Section 2: Role Inventory & Access Control Architecture](#section-2-role-inventory--access-control-architecture)
3. [Section 2b: Regulations Architecture (SBTE Kerala R21 vs R26)](#section-2b-regulations-architecture-sbte-kerala-r21-vs-r26)
4. [Section 3: Role × Feature Matrix](#section-3-role-x-feature-matrix)
5. [Section 4: Routes & Screens (588 Routes & All Dashboards)](#section-4-routes--screens)
6. [Section 5: Core System Workflows (13 End-to-End Lifecycles)](#section-5-core-system-workflows)
7. [Section 6: Exhaustive Business Rules & Hard-Coded Thresholds](#section-6-exhaustive-business-rules--hard-coded-thresholds)
8. [Section 7: Integrations & Jobs](#section-7-integrations--jobs)
9. [Section 8: Architectural & Codebase Pain Points](#section-8-pain-points)

---

# Section 1: Authentication & Session Architecture

## 1.1 Auth Guards, Providers, Session Configuration & Middleware

### 1.1.1 Laravel Auth Configuration (`config/auth.php`)
- **Default Guard & Password Broker**:
  - `'defaults.guard'` is set to `env('AUTH_GUARD', 'web')` (`config/auth.php:19`).
  - `'defaults.passwords'` is set to `env('AUTH_PASSWORD_BROKER', 'users')` (`config/auth.php:20`).
- **Guards**:
  - Only a single guard `'web'` is defined with `'driver' => 'session'` and `'provider' => 'users'` (`config/auth.php:38-45`).
- **User Providers**:
  - Only a single provider `'users'` is defined with `'driver' => 'eloquent'` and `'model' => env('AUTH_MODEL', App\Models\User::class)` (`config/auth.php:62-68`).
- **Password Reset Broker (`passwords.users`)**:
  - Configured with `'provider' => 'users'`, `'table' => env('AUTH_PASSWORD_RESET_TOKEN_TABLE', 'password_reset_tokens')`, `'expire' => 60` (minutes), and `'throttle' => 60` (seconds) (`config/auth.php:93-102`).
  - `'password_timeout'` is set to `env('AUTH_PASSWORD_TIMEOUT', 10800)` (3 hours) (`config/auth.php:115`).
- **Architectural Reality (Custom Session Auth vs. Laravel Guard)**:
  - Although `config/auth.php:67` references `App\Models\User::class`, **no `app/Models/User.php` model or `users` database table exists** in `app/Models/` or `database/migrations/`.
  - Neither `Auth::attempt()`, `Auth::login()`, nor Laravel's built-in `auth` middleware is used anywhere in the application.
  - Instead, authentication is implemented via custom session keys written through `Illuminate\Support\Facades\Session` (`Session::put(...)`) against three domain models/tables:
    1. `App\Models\Student` (`students` table, primary key `reg_no`) (`app/Models/Student.php:12-16`, `database/migrations/2026_06_21_000003_create_students_table.php:11-12`).
    2. `App\Models\StaffProfile` (`staff_profiles` table, auto-increment `id` with unique `mobile_no`) (`app/Models/StaffProfile.php:9-23`, `database/migrations/2026_06_21_000001_create_staff_profiles_table.php:11-14`).
    3. Parent sessions backed by `App\Models\Student` (`app/Http/Controllers/ParentDashboardController.php:82-87`).

### 1.1.2 Session Configuration (`config/session.php` & Database Schema)
- **Driver & Storage**:
  - `'driver' => env('SESSION_DRIVER', 'database')` (`config/session.php:21`).
  - `'table' => env('SESSION_TABLE', 'sessions')` (`config/session.php:89`).
  - The `sessions` table (`database/migrations/2026_06_21_033735_create_sessions_table.php`) stores server-side session payloads.
- **Lifetime & Cookie Settings**:
  - `'lifetime' => (int) env('SESSION_LIFETIME', 120)` (120 minutes) (`config/session.php:35`).
  - `'expire_on_close' => env('SESSION_EXPIRE_ON_CLOSE', false)` (`config/session.php:37`).
  - `'encrypt' => env('SESSION_ENCRYPT', false)` (`config/session.php:50`).
  - `'cookie' => env('SESSION_COOKIE', Str::slug(env('APP_NAME', 'laravel')).'-session')` (`config/session.php:127`).
  - `'http_only' => env('SESSION_HTTP_ONLY', true)` (`config/session.php:185`).
  - `'same_site' => env('SESSION_SAME_SITE', 'lax')` (`config/session.php:202`).
  - `'partitioned' => env('SESSION_PARTITIONED_COOKIE', false)` (`config/session.php:215`).

### 1.1.3 Middleware Pipeline (`bootstrap/app.php` & `app/Http/Middleware/*`)
- **Bootstrap Configuration (`bootstrap/app.php`)**:
  - Configures web routes (`routes/web.php`) and console routes (`routes/console.php`) with health check `/up` (`bootstrap/app.php:7-12`).
  - **CSRF Token Exceptions**: Disables CSRF verification (`validateCsrfTokens(except: [...])`) for `'login'` and `'api/*'` (`bootstrap/app.php:14-17`).
  - **Global Web Middleware**: Appends `\App\Http\Middleware\UpdateUserOnlineStatus::class` to the `web` middleware group (`bootstrap/app.php:18-20`).
- **`UpdateUserOnlineStatus` Middleware (`app/Http/Middleware/UpdateUserOnlineStatus.php`)**:
  - Runs on every `web` request (`app/Http/Middleware/UpdateUserOnlineStatus.php:16-29`).
  - Checks `Session::has('userId')` and reads `$userId = Session::get('userId')` (`app/Http/Middleware/UpdateUserOnlineStatus.php:19-20`).
  - When `$userId` is non-empty, writes three cache entries via `Illuminate\Support\Facades\Cache` (`app/Http/Middleware/UpdateUserOnlineStatus.php:21-26`):
    - `user_online_{$userId}` => `true` (TTL: 5 minutes, `now()->addMinutes(5)`).
    - `user_ip_{$userId}` => `$request->ip()` (TTL: 15 minutes, `now()->addMinutes(15)`).
    - `user_last_seen_{$userId}` => `now()->toDateTimeString()` (TTL: 15 minutes, `now()->addMinutes(15)`).
- **Heartbeat & Session-Check Endpoint (`routes/web.php:54-71`)**:
  - `GET /api/system/session-check` checks `Session::get('userId')` and `Session::get('userRole')` (`routes/web.php:55-56`).
  - If `$userId` is present, refreshes `user_online_{$userId}` (5 min), `user_ip_{$userId}` (15 min), and `user_last_seen_{$userId}` (15 min), returning `['status' => 'ACTIVE', 'role' => $userRole]` (`routes/web.php:58-68`).
  - Otherwise returns HTTP 401 `['status' => 'EXPIRED']` (`routes/web.php:69-70`).
- **Absence of Route-Level Auth Middleware**:
  - No custom role or authentication middleware classes exist in `app/Http/Middleware/` other than `UpdateUserOnlineStatus.php`.
  - Every route in `routes/web.php` and controller method performs inline session checks via `Session::get('userId')`, `Session::get('userRole')`, `Session::get('userBranch')`, or `session('userRole')`.

---

## 1.2 Multi-Persona Login Mechanisms

### 1.2.1 Entry Point (`GET /` and `GET /login`)
- **Landing Route (`GET /`, `routes/web.php:25-51`)**:
  - Reads `$role = Session::get('userRole')` (`routes/web.php:26`).
  - If a session role is already active, redirects immediately to the role's dashboard (`routes/web.php:27-48`):
    - `'Student'` -> `/dashboard/student` (`routes/web.php:28`).
    - `'Super_Admin'` -> `/dashboard/superadmin` (`routes/web.php:29`).
    - `'Chairman'` -> `/dashboard/chairman` (`routes/web.php:30`).
    - `'Admin'` -> `/dashboard/admin` (`routes/web.php:31`).
    - `'Principal'` -> `/dashboard/principal` (`routes/web.php:32`).
    - `'HOD'` -> `/dashboard/hod` (`routes/web.php:33`).
    - `'Tutor'` -> `/dashboard/tutor` (`routes/web.php:34`).
    - `'Gen_Dept_Coordinator_Aided'` -> `/dashboard/general-coordinator-aided` (`routes/web.php:35`).
    - `'Gen_Dept_Coordinator_Self_Finance'` -> `/dashboard/general-coordinator-sf` (`routes/web.php:36`).
    - `['Academic_Coordinator', 'Academic Coordinator', 'Academic_Coordinator_SF']` -> `/dashboard/academic-coordinator` (`routes/web.php:37-38`).
    - `'SF_Office'` -> `/dashboard/sf-office` (`routes/web.php:39`).
    - `'Lecturer'` -> `/dashboard/lecturer` (`routes/web.php:40`).
    - `'Demonstrator'` -> `/dashboard/demonstrator` (`routes/web.php:41`).
    - `'Trade_Instructor'` -> `/dashboard/tradeinstructor` (`routes/web.php:42`).
    - `'Workshop_Superintendent'` -> `/dashboard/workshop` (`routes/web.php:43`).
    - `['Workshop_Instructor', 'Workshop Instructor', 'Tradesman']` -> `/dashboard/lecturer` (`routes/web.php:44-45`).
    - `['Physical_Instructor', 'Physical Instructor']` -> `/dashboard/lecturer` (`routes/web.php:46-47`).
  - If unauthenticated, renders `view('login')` (`resources/views/login.blade.php`) (`routes/web.php:50`).
- **Named Login Fallback (`GET /login`, `routes/web.php:74-76`)**:
  - Redirects to `/` with route name `'login'`.

### 1.2.2 Student Password Login (`POST /login` -> `AuthController::login`)
- **Frontend UI (`resources/views/login.blade.php:213-229,993-1036`)**:
  - User selects the "Student" tab (`toggleRoleTab('student')`, `resources/views/login.blade.php:214,670-693`), enters Register / Admission / SBTE Number in `#loginUserId` (`resources/views/login.blade.php:227`) and password in `#loginPassword` (`resources/views/login.blade.php:267`), and submits JSON `{ userId, password, roleType: 'student' }` to `POST /login` (`resources/views/login.blade.php:1014-1018`).
- **Backend Lookup (`app/Http/Controllers/AuthController.php:20-44`)**:
  - Validates `userId` (`required|string`), `password` (`required|string`), `roleType` (`required|in:student,staff`) (`app/Http/Controllers/AuthController.php:22-26`).
  - Normalizes `$cleanAdmId = trim(strtok($userId, '/'))` to extract the numeric part of admission numbers formatted like `5842/25` (`app/Http/Controllers/AuthController.php:31-32`).
  - Queries `App\Models\Student` matching any of (`app/Http/Controllers/AuthController.php:34-43`):
    - `reg_no = strtoupper($userId)`
    - `adm_no = strtoupper($userId)`
    - `adm_no = $userId`
    - `adm_no = $cleanAdmId`
    - `adm_no = strtoupper($cleanAdmId)`
    - `sbte_reg_no = strtoupper($userId)`
    - `reg_no LIKE "%{$userId}%"`
    - `adm_no LIKE "{$cleanAdmId}/%"`
- **Dual-Mode Password Verification & Default Password Fallback (`app/Http/Controllers/AuthController.php:46-58,795-814`)**:
  - Calls `$this->verifyPassword($password, $student->password)` (`app/Http/Controllers/AuthController.php:46`).
  - `verifyPassword` (`app/Http/Controllers/AuthController.php:795-814`) checks:
    1. Direct plain-text match: `if ($storedPassword === $inputPassword) return true;` (`app/Http/Controllers/AuthController.php:801-803`).
    2. Bcrypt hash match: if `$storedPassword` starts with `$2y$`, `$2a$`, or `$2b$`, calls `Hash::check($inputPassword, $storedPassword)` (`app/Http/Controllers/AuthController.php:806-811`).
  - **Legacy Default Password Auto-Upgrade (`app/Http/Controllers/AuthController.php:48-54`)**: If `$password === 'carmel2026'` and `$student->password` matches `'Carmel@123'` (plain or Bcrypt), login is permitted and `$student->password` is automatically updated to `Hash::make('carmel2026')`.
- **Approval Gate (`app/Http/Controllers/AuthController.php:60-62`)**:
  - Checks `if (strtoupper($student->status) !== 'APPROVED')`. If not approved, returns JSON `status => 'ERROR'` with `"Your registration is pending approval by your Class Tutor."`.
- **Session Population (`app/Http/Controllers/AuthController.php:65-85`)**:
  - Sets `Session::put('must_update_profile', true)` if `$password === 'carmel2026'` or `$this->verifyPassword('carmel2026', $student->password)`, else `Session::forget('must_update_profile')` (`app/Http/Controllers/AuthController.php:65-71`).
  - Populates session keys (`app/Http/Controllers/AuthController.php:73-84`):
    - `'userRole' => 'Student'`
    - `'userId' => $student->reg_no`
    - `'userName' => $student->name`
    - `'userBranch' => $student->branch`
    - `'userAdmissionType' => $student->admission_type`
    - `'userPhoto' => $student->photo_url ?? ''`
    - `'classroomId' => $student->classroom_id`
    - `'sbteRegNo' => $student->sbte_reg_no`
    - `'userEmail' => $student->email`
    - `'semester' => $student->semester ?? 1`
- **Audit & Persistent Token (`app/Http/Controllers/AuthController.php:87-105`)**:
  - Logs `'User Login'` to `AuditLog` (`app/Http/Controllers/AuthController.php:87`).
  - Generates a 60-character random token (`Str::random(60)`), stores it in `students.remember_token`, and queues 5-year (`60 * 24 * 365 * 5` minutes) non-HttpOnly (`false`) cookies `carmel_remember_token` and `carmel_remember_role = 'student'` (`app/Http/Controllers/AuthController.php:90-94`).
  - Returns `route => '/dashboard/student'` and `remember_token` (which the frontend also saves to `localStorage`, `resources/views/login.blade.php:1022-1025`) (`app/Http/Controllers/AuthController.php:96-105`).

### 1.2.3 Staff Password Login (`POST /login` -> `AuthController::login`)
- **Frontend UI (`resources/views/login.blade.php:217-220,231-239,993-1036`)**:
  - Defaults to the "Staff Portal" tab on page load (`activeRole = "staff"`, `resources/views/login.blade.php:518,556`).
  - Staff enter their 10-digit mobile number in `#loginMobileId` (`resources/views/login.blade.php:235`, restricted to 10 numeric digits in JS at `resources/views/login.blade.php:565-575`) and password in `#loginPassword` (`resources/views/login.blade.php:267`).
- **Backend Lookup (`app/Http/Controllers/AuthController.php:107-121`)**:
  - Strips non-digits via `$cleanMobile = preg_replace('/[^0-9]/', '', $userId)` (`app/Http/Controllers/AuthController.php:109`).
  - Queries `App\Models\StaffProfile` where `mobile_no = $userId`, `mobile_no = $cleanMobile` (if non-empty), `email = $userId`, or `name = $userId` (`app/Http/Controllers/AuthController.php:111-117`).
- **Password & Approval Verification (`app/Http/Controllers/AuthController.php:123-130`)**:
  - Verifies password via `$this->verifyPassword($password, $staff->password)` (supporting plain text and Bcrypt) (`app/Http/Controllers/AuthController.php:123`).
  - Checks `if (strtoupper($staff->account_status) !== 'APPROVED')` (`app/Http/Controllers/AuthController.php:128`). If not `'APPROVED'`, returns error `"Your staff account is pending approval by Super Admin."` (`app/Http/Controllers/AuthController.php:129`).
- **Session Population & Role Routing (`app/Http/Controllers/AuthController.php:133-191`)**:
  - Sets session keys (`app/Http/Controllers/AuthController.php:133-139`):
    - `'userRole' => $staff->designation`
    - `'userId' => $staff->mobile_no`
    - `'userName' => $staff->name`
    - `'userBranch' => $staff->branch`
    - `'userPhoto' => $staff->photo_url ?? ''`
  - Logs `'Staff Login'` to `AuditLog` (`app/Http/Controllers/AuthController.php:142`).
  - Maps `$staff->designation` to target dashboard URL (`app/Http/Controllers/AuthController.php:145-174`):
    - `'Super_Admin'` -> `/dashboard/superadmin`
    - `'Chairman'` -> `/dashboard/chairman`
    - `'Admin'` -> `/dashboard/admin`
    - `'Principal'` -> `/dashboard/principal`
    - `'HOD'` -> `/dashboard/hod`
    - `'Tutor'` -> `/dashboard/tutor`
    - `'Gen_Dept_Coordinator_Aided'` -> `/dashboard/general-coordinator-aided`
    - `'Gen_Dept_Coordinator_Self_Finance'` -> `/dashboard/general-coordinator-sf`
    - `['Academic_Coordinator', 'Academic Coordinator', 'Academic_Coordinator_SF']` -> `/dashboard/academic-coordinator`
    - `'SF_Office'` -> `/dashboard/sf-office`
    - `'Lecturer'` -> `/dashboard/lecturer`
    - `'Demonstrator'` -> `/dashboard/demonstrator`
    - `'Trade_Instructor'` -> `/dashboard/tradeinstructor`
    - `'Workshop_Superintendent'` -> `/dashboard/workshop`
    - `['Workshop_Instructor', 'Workshop Instructor', 'Tradesman']` -> `/dashboard/lecturer`
    - `['Physical_Instructor', 'Physical Instructor']` -> `/dashboard/lecturer`
    - Fallback -> `/dashboard/lecturer`
  - Generates 60-char `remember_token`, saves to `staff_profiles.remember_token`, queues 5-year cookies `carmel_remember_token` and `carmel_remember_role = 'staff'`, and returns JSON (`app/Http/Controllers/AuthController.php:177-191`).

### 1.2.4 Persistent Token Auto-Login (`POST /api/auth/auto-login` -> `AuthController::autoLoginViaToken`)
- **Route**: `POST /api/auth/auto-login` (`routes/web.php:85`).
- **Frontend Trigger (`resources/views/login.blade.php:521-554`)**:
  - On `DOMContentLoaded`, if `localStorage.getItem('carmel_remember_token')` has length > 10, posts `{ token, roleType }` to `/api/auth/auto-login`.
- **Backend Verification (`app/Http/Controllers/AuthController.php:491-579`)**:
  - Reads token from `$request->input('token') ?: $request->cookie('carmel_remember_token') ?: $request->header('X-Remember-Token')` (`app/Http/Controllers/AuthController.php:493`) and role from `$request->input('roleType') ?: $request->cookie('carmel_remember_role') ?: $request->header('X-Remember-Role') ?: 'staff'` (`app/Http/Controllers/AuthController.php:494`).
  - Rejects tokens shorter than 10 characters with HTTP 401 (`app/Http/Controllers/AuthController.php:496-498`).
  - For `'student'`, looks up `Student::where('remember_token', $token)->first()`, verifies `strtoupper($student->status) === 'APPROVED'`, restores student session keys, rotates `remember_token` with a new `Str::random(60)`, refreshes 5-year cookies, and returns `/dashboard/student` (`app/Http/Controllers/AuthController.php:501-531`).
  - For `'staff'`, looks up `StaffProfile::where('remember_token', $token)->first()`, verifies `strtoupper($staff->account_status) === 'APPROVED'`, restores staff session keys, rotates `remember_token`, refreshes 5-year cookies, and returns the designation-based dashboard route (`app/Http/Controllers/AuthController.php:533-576`).

### 1.2.5 Staff WebAuthn / Fingerprint Biometric Login (`WebAuthnController.php`)
- **Database Table**: `staff_biometric_credentials` (`database/migrations/2026_08_18_000001_create_staff_biometric_credentials_table.php:14-22`) with columns `id`, `staff_mobile_no`, `credential_id`, `public_key`, `device_name`, `counter`, `timestamps`.
- **Routes (`routes/web.php:159-164`)**:
  - `POST /api/webauthn/register-options` -> `WebAuthnController::registerOptions`
  - `POST /api/webauthn/register` -> `WebAuthnController::register`
  - `POST /api/webauthn/auth-options` -> `WebAuthnController::authOptions`
  - `POST /api/webauthn/authenticate` -> `WebAuthnController::authenticate`
  - `GET /api/webauthn/status` -> `WebAuthnController::status`
  - `POST /api/webauthn/remove` -> `WebAuthnController::remove`
- **Enrollment Flow (`app/Http/Controllers/WebAuthnController.php:19-133`)**:
  - Restricted to logged-in staff (`if (!$userId || $userRole === 'Student')` returns 401) (`app/Http/Controllers/WebAuthnController.php:24-26,79-81`).
  - `registerOptions` generates a 32-byte random challenge stored in `Session::put('webauthn_register_challenge', $challenge)` and returns WebAuthn `publicKey` creation options (`platform` authenticator, `userVerification => 'required'`, algorithms `-7` ES256 and `-257` RS256) (`app/Http/Controllers/WebAuthnController.php:40-68`).
  - `register` verifies `Session::get('webauthn_register_challenge')` is present (`app/Http/Controllers/WebAuthnController.php:92-95`), detects device OS from `User-Agent` (`app/Http/Controllers/WebAuthnController.php:98-105`), and stores `credential_id` and `public_key` (defaulting to `'WEBAUTHN_PUBLIC_KEY'`) in `StaffBiometricCredential::updateOrCreate` (`app/Http/Controllers/WebAuthnController.php:107-116`).
- **Biometric Login Flow (`app/Http/Controllers/WebAuthnController.php:138-311`, `resources/views/login.blade.php:629-647,710-790`)**:
  - On `login.blade.php`, if `window.PublicKeyCredential` exists and `localStorage.getItem('carmel_biometric_cred_id')` is set while on the Staff tab, `#biometricFirstCard` ("Quick Fingerprint Login") is shown instead of password fields (`resources/views/login.blade.php:242-258,629-647`).
  - `authOptions` (`app/Http/Controllers/WebAuthnController.php:138-205`):
    - Looks up `StaffProfile` by `mobileNo` (`mobile_no`, cleaned digits, `email`, or `name`) or falls back to resolving via `credentialId` in `staff_biometric_credentials` (`app/Http/Controllers/WebAuthnController.php:146-168`).
    - Rejects unapproved accounts (`strtoupper($staff->account_status) !== 'APPROVED'`) (`app/Http/Controllers/WebAuthnController.php:174-176`).
    - Requires at least one registered credential in `StaffBiometricCredential` (`app/Http/Controllers/WebAuthnController.php:178-181`).
    - Stores 32-byte challenge in `Session::put('webauthn_auth_challenge', $challenge)` and target mobile in `Session::put('webauthn_auth_mobile', $staff->mobile_no)` (`app/Http/Controllers/WebAuthnController.php:184-185`).
  - `authenticate` (`app/Http/Controllers/WebAuthnController.php:210-311`):
    - Checks `Session::get('webauthn_auth_challenge')` exists (`app/Http/Controllers/WebAuthnController.php:220-223`).
    - Resolves `StaffProfile` by `$mobileNo` or by matching `credential_id` in `StaffBiometricCredential` (`app/Http/Controllers/WebAuthnController.php:225-244`).
    - Checks that a `StaffBiometricCredential` row exists for `$staff->mobile_no` and `$credentialId` (`app/Http/Controllers/WebAuthnController.php:246-251`). *(Note: cryptographic signature verification against `authenticatorData`/`clientDataJSON`/`public_key` is not performed server-side; matching `credential_id` after an active challenge session suffices.)*
    - Verifies `strtoupper($staff->account_status) === 'APPROVED'` (`app/Http/Controllers/WebAuthnController.php:253-255`).
    - Populates `Session::put(['userRole', 'userId', 'userName', 'userBranch', 'userPhoto'])`, increments `$cred->increment('counter')`, logs `'Biometric Login'` to `AuditLog`, and returns the role dashboard route (`app/Http/Controllers/WebAuthnController.php:256-310`).

### 1.2.6 Parent Portal Login (`ParentDashboardController.php`)
- **Routes (`routes/web.php:2423-2426`)**:
  - `GET /parent` -> `ParentDashboardController::showLogin` (`app/Http/Controllers/ParentDashboardController.php:16-19`, renders `resources/views/parent_login.blade.php`).
  - `POST /parent/login` -> `ParentDashboardController::login` (`app/Http/Controllers/ParentDashboardController.php:24-93`).
  - `GET /parent/dashboard/{regNo}` -> `ParentDashboardController::showDashboard` (`app/Http/Controllers/ParentDashboardController.php:98-180`).
  - `GET /parent/logout` -> `ParentDashboardController::logout` (`app/Http/Controllers/ParentDashboardController.php:651-656`).
- **Passwordless Mobile + Register Number Login (`POST /parent/login`, `app/Http/Controllers/ParentDashboardController.php:24-93`)**:
  - Validates `regNo` (`required|string`) and `guardianMobile` (`required|string|min:10`) (`app/Http/Controllers/ParentDashboardController.php:26-29`).
  - Strips non-digits from `guardianMobile` (`$cleanMobile = preg_replace('/[^0-9]/', '', $guardianMobile)`) (`app/Http/Controllers/ParentDashboardController.php:32`).
  - Finds `Student` by `reg_no`, `adm_no`, or `sbte_reg_no` (`app/Http/Controllers/ParentDashboardController.php:35-39`).
  - **Mobile Verification & Auto-Binding (`app/Http/Controllers/ParentDashboardController.php:46-79`)**:
    - Cleans `$student->guardian_mobile` and `$student->phone` (`app/Http/Controllers/ParentDashboardController.php:46-47`).
    - If `$studentGuardian` is non-empty, requires `$cleanMobile` to match `$studentGuardian` or `$studentPhone` (exact match or 10+ digit substring match) (`app/Http/Controllers/ParentDashboardController.php:55-60`).
    - If `$studentGuardian` is empty (`app/Http/Controllers/ParentDashboardController.php:61-72`), **any** 10+ digit `$cleanMobile` is accepted and automatically saved into `$student->guardian_mobile` (`$student->save()`).
  - Sets session keys (`app/Http/Controllers/ParentDashboardController.php:82-87`):
    - `'userRole' => 'Parent'`
    - `'parentRegNo' => $student->reg_no`
    - `'studentName' => $student->name`
    - `'guardianMobile' => $cleanMobile`
  - Returns redirect URL `/parent/dashboard/{$student->reg_no}` (`app/Http/Controllers/ParentDashboardController.php:91`).
- **Direct SMS Token Auto-Authentication & Staff Preview (`GET /parent/dashboard/{regNo}`, `app/Http/Controllers/ParentDashboardController.php:98-129`)**:
  - If query parameter `?token=...` is present, computes `$expectedToken = substr(md5($student->reg_no . ($student->guardian_mobile ?: $student->phone) . 'CarmelR26ParentSecret'), 0, 12)` (`app/Http/Controllers/ParentDashboardController.php:111-112`).
  - If `hash_equals($expectedToken, $token)` (or `$token === 'demo'`), sets `Session::put(['userRole' => 'Parent', 'parentRegNo' => $student->reg_no, 'studentName' => $student->name])` without requiring login (`app/Http/Controllers/ParentDashboardController.php:113-119`).
  - **Staff Preview Bypass (`app/Http/Controllers/ParentDashboardController.php:123-128`)**: Allows access if `$parentRegNo === $student->reg_no` OR if `Session::get('userRole')` is in `['Tutor', 'HOD', 'Lecturer', 'Principal', 'Super_Admin']`.

### 1.2.7 SF Staff Biometric Face Recognition + Liveness + GPS Geofence Time Punch (`StaffAttendanceMobileController.php`)
- **Purpose & Scope**:
  - Used for daily attendance In/Out time punching (`sf_staff_time_punches` and `sf_staff_face_registrations` tables, `database/migrations/2026_08_10_000001_create_sf_attendance_tables.php:42-82`), restricted to Self-Financing (`EL`, `CT`, `AU`, `GEN_SF`, `SF`) staff (`app/Http/Controllers/StaffAttendanceMobileController.php:55-69,180-196`).
- **Mechanism (`app/Http/Controllers/StaffAttendanceMobileController.php:101-353`)**:
  - **Face Enrollment (`POST /api/staff/attendance/register-face`, `StaffAttendanceMobileController.php:101-148`)**: Stores a 128-float JSON facial embedding vector in `sf_staff_face_registrations.face_descriptor` and base64 snapshot in `storage/app/public/sf_face_profiles/`.
  - **Verification & Punch (`POST /api/staff/attendance/punch`, `StaffAttendanceMobileController.php:154-353`)**:
    1. **Cosine Similarity**: Computes cosine similarity between live 128-float `face_descriptor` and stored descriptor (`computeCosineSimilarity`, `StaffAttendanceMobileController.php:827-848`); requires similarity >= `0.42` (`StaffAttendanceMobileController.php:217-223`).
    2. **Liveness**: Records `liveness_type = 'SMILE'` and `liveness_score` (`StaffAttendanceMobileController.php:276-277`).
    3. **Haversine GPS Geofence**: Computes distance (`calculateHaversineDistance`, `StaffAttendanceMobileController.php:19-35`) against active `SfCampusGeofenceSetting` (`centroid_lat`, `centroid_lng`, `radius_meters`, `StaffAttendanceMobileController.php:201-209,231-247`); blocks punches when `distanceMeters > $geofence->radius_meters` (`OUTSIDE_PREMISES`).

### 1.2.8 Absence of OTP Login and End-User Google OAuth Login
- **No OTP Login**: There is no SMS/Email OTP login flow in the codebase.
- **No End-User Google OAuth Login**: Google OAuth 2.0 (`GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `GOOGLE_DRIVE_REFRESH_TOKEN`) is used exclusively server-side in `BackupController::uploadFileToGoogleDrive` (`app/Http/Controllers/BackupController.php:173-228`) to upload SQL backups to Google Drive, not for user authentication.

### 1.2.9 Logout Flows (`AuthController::logout` & `ParentDashboardController::logout`)
- **Standard Logout (`POST /logout` or `GET /logout` -> `AuthController::logout`, `routes/web.php:77-78`, `app/Http/Controllers/AuthController.php:584-639`)**:
  - Clears `remember_token = null` in `students` or `staff_profiles` for the active `$userId` (`app/Http/Controllers/AuthController.php:591-604`) or cookie token (`app/Http/Controllers/AuthController.php:607-612`).
  - Removes online cache keys `user_online_{$userId}` and `user_last_seen_{$userId}` (`app/Http/Controllers/AuthController.php:599-600`).
  - Calls `Session::flush()` and expires cookies `carmel_remember_token` and `carmel_remember_role` (`app/Http/Controllers/AuthController.php:615-617`).
  - Returns an HTML script that clears `carmel_remember_token` and `carmel_remember_role` from `localStorage` and redirects to `/` (`app/Http/Controllers/AuthController.php:624-638`).
- **Parent Logout (`GET /parent/logout` -> `ParentDashboardController::logout`, `app/Http/Controllers/ParentDashboardController.php:651-656`)**:
  - Calls `Session::forget(['userRole', 'parentRegNo', 'studentName', 'guardianMobile'])` and redirects to `/parent`.

---

## 1.3 First-Login Flow, Registration & Account Approval Flows

### 1.3.1 Account Status Values Stored in DB
- **Students (`students` table)**:
  - `students.status` (string, default `'Pending'`, `database/migrations/2026_06_21_000003_create_students_table.php:23`):
    - `'Pending'`: Set upon student self-registration (`app/Http/Controllers/AuthController.php:291`). Blocked from login (`app/Http/Controllers/AuthController.php:60`).
    - `'Approved'`: Set upon Tutor/HOD/Admin approval (`app/Http/Controllers/DataController.php:203,954`), direct admin registration (`app/Http/Controllers/DataController.php:1032`), or bulk Excel/CSV upload (`app/Http/Controllers/BatchStudentUploadController.php:163,184,252,268`, `app/Http/Controllers/DataController.php:3751`). Required for login (`strtoupper($student->status) !== 'APPROVED'`, `app/Http/Controllers/AuthController.php:60`).
    - `'Suspended'`: Set when an authorized actor toggles an `'Approved'` student via `DataController::toggleUserStatus` (`app/Http/Controllers/DataController.php:953-954`).
  - `students.academic_status` (string, default `'Active'`, `database/migrations/2026_06_23_154303_add_academic_status_to_students_table.php`):
    - Tracks enrollment lifecycle (`'Active'`, `'Dropped'`, `'Discontinued'`, `'Passed_Out'`). Filtered by `Student::scopeActive` (`WHERE academic_status = 'Active' OR academic_status IS NULL`, `app/Models/Student.php:48-54`).
- **Staff (`staff_profiles` table)**:
  - `staff_profiles.account_status` (string, default `'Pending'`, `database/migrations/2026_06_21_000001_create_staff_profiles_table.php:20`):
    - `'Pending'`: Set upon staff self-registration for all designations except `'Principal'` (`app/Http/Controllers/AuthController.php:379`). Blocked from login (`app/Http/Controllers/AuthController.php:128`).
    - `'Approved'`: Set automatically on self-registration if `$designation === 'Principal'` (`app/Http/Controllers/AuthController.php:379`), on direct admin/HOD registration (`app/Http/Controllers/DataController.php:1061`), or when approved via `DataController::approveAccount` (`app/Http/Controllers/DataController.php:220`) or `DataController::toggleUserStatus` (`app/Http/Controllers/DataController.php:972`). Required for password, auto-token, and biometric login (`app/Http/Controllers/AuthController.php:128,535`, `app/Http/Controllers/WebAuthnController.php:174,253`).
    - `'Suspended'`: Set when an `'Approved'` staff account is toggled off in `DataController::toggleUserStatus` (`app/Http/Controllers/DataController.php:971-972`).

### 1.3.2 Student Registration, Bulk Import & First-Login Compulsory Profile Update
1. **Student Self-Registration (`POST /register/student` -> `AuthController::registerStudent`, `routes/web.php:79`, `app/Http/Controllers/AuthController.php:201-316`)**:
   - Validates `name`, `email` (`unique:students,email`), `admNo` (`unique:students,adm_no`), `branch`, `admissionYear`, `admissionType`, `semester`, `password` (`min:4`), and optional `photo` (`app/Http/Controllers/AuthController.php:203-214`).
   - Generates `reg_no = substr($year, -2) . strtoupper($branch) . strtoupper($admNo) . ($type === 'LET' ? 'L' : '')` (`app/Http/Controllers/AuthController.php:236-240`).
   - Auto-resolves or creates classroom in `ClassManagement` (`{BRANCH}_{BATCH_YEAR}_{BATCH_YEAR+3}`) (`app/Http/Controllers/AuthController.php:248-267`).
   - Creates `Student` with plain-text `password`, `status => 'Pending'`, and logs `'Student Registration'` (`app/Http/Controllers/AuthController.php:278-299`).
2. **Bulk Student Uploads & Default Password (`carmel2026`)**:
   - **`POST /api/admin/batch-student-upload` (`BatchStudentUploadController::uploadBatchStudents`, `app/Http/Controllers/BatchStudentUploadController.php:20-303`)**:
     - Permitted roles: `['Super_Admin', 'Admin', 'HOD', 'Principal', 'Workshop_Superintendent']` (`app/Http/Controllers/BatchStudentUploadController.php:23`).
     - Creates/updates students with `password => Hash::make('carmel2026')`, `status => 'Approved'`, `academic_status => 'Active'` (`app/Http/Controllers/BatchStudentUploadController.php:39,163-164,184-185,252-253,268-269`).
   - **`POST /api/students/bulk-import` (`DataController::bulkImportStudents`, `app/Http/Controllers/DataController.php:3682-3810`)**:
     - Permitted roles: `['Super_Admin', 'Admin', 'HOD', 'Principal', 'Lecturer', 'Demonstrator', 'Workshop_Instructor', 'Tradesman', 'Trade_Instructor']` (`app/Http/Controllers/DataController.php:3685-3686`).
     - Sets `password => Hash::make('carmel2026')`, `status => 'Approved'`, `academic_status => 'Active'` (`app/Http/Controllers/DataController.php:3742,3751-3752`).
3. **First-Login Detection & Mandatory Profile Completion (`BatchStudentUploadController::completeFirstLoginProfile`)**:
   - During `AuthController::login`, if `$password === 'carmel2026'` or `$this->verifyPassword('carmel2026', $student->password)`, `Session::put('must_update_profile', true)` is set (`app/Http/Controllers/AuthController.php:65-68`).
   - When the student lands on `/dashboard/student` (`resources/views/student_dashboard.blade.php`), `must_update_profile` triggers a non-dismissible profile & password update modal that posts to `POST /api/student/complete-first-login-profile` (`routes/web.php:401`, `app/Http/Controllers/BatchStudentUploadController.php:344-441`).
   - `completeFirstLoginProfile` (`app/Http/Controllers/BatchStudentUploadController.php:344-441`):
     - Requires `Session::get('userRole') === 'Student'` (`app/Http/Controllers/BatchStudentUploadController.php:348`).
     - Validates `email` (`required|email`), `phone` (`required|string|min:10|max:15`), `sbte_reg_no` (`nullable|string`), `new_password` (`required|string|min:6`), and `photo` (`nullable|image|max:5120`) (`app/Http/Controllers/BatchStudentUploadController.php:360-366`).
     - Explicitly rejects `'carmel2026'` (case-insensitive) as `new_password` (`if (strtolower(trim($request->input('new_password'))) === 'carmel2026')`) (`app/Http/Controllers/BatchStudentUploadController.php:368-373`).
     - Hashes the new password via `Hash::make($request->input('new_password'))`, updates `email`, `phone`, `sbte_reg_no`, and `photo_url`, clears `Session::forget('must_update_profile')`, and logs `'First Login Profile Update'` to `AuditLog` (`app/Http/Controllers/BatchStudentUploadController.php:384-427`).

### 1.3.3 Staff Self-Registration & Direct Registration
1. **Staff Self-Registration (`POST /register/staff` -> `AuthController::registerStaff`, `routes/web.php:80`, `app/Http/Controllers/AuthController.php:321-414`)**:
   - Validates `name`, `email` (`unique:staff_profiles,email`), `mobileNo` (`unique:staff_profiles,mobile_no`), `branch`, `designation`, `password` (`min:4`), and optional `photo` (`app/Http/Controllers/AuthController.php:323-331`).
   - **Singleton Role Constraints**:
     - If `$designation === 'Principal'` and `StaffProfile::where('designation', 'Principal')->exists()`, registration is rejected (`app/Http/Controllers/AuthController.php:345-350`).
     - If `$designation` is in `['Academic_Coordinator', 'Academic Coordinator', 'Academic_Coordinator_SF']` and an `'Approved'` profile with that designation already exists, registration is rejected (`app/Http/Controllers/AuthController.php:352-359`).
   - Sets `account_status => ($designation === 'Principal') ? 'Approved' : 'Pending'` (`app/Http/Controllers/AuthController.php:379`) and stores `password` in plain text (`app/Http/Controllers/AuthController.php:377`).
2. **Direct User Registration by Admin / HOD (`POST /api/admin/user/register-direct` -> `DataController::registerUserDirect`, `routes/web.php:394`, `app/Http/Controllers/DataController.php:999-1071`)**:
   - Creates a student (`status => 'Approved'`) or staff profile (`account_status => 'Approved'`) directly with plain-text password (`app/Http/Controllers/DataController.php:1022-1062`).
   - Enforces the singleton `'Principal'` check (`app/Http/Controllers/DataController.php:1049-1052`).

### 1.3.4 Who Approves Whom (Approval & Status Toggle Matrix)
1. **`POST /api/approve-account` (`DataController::approveAccount`, `routes/web.php:344`, `app/Http/Controllers/DataController.php:196-236`)**:
   - Accepts `type` (`'student'` or `'staff'`) and `id` (`reg_no` or `mobile_no`) (`app/Http/Controllers/DataController.php:198-200`).
   - Sets `student->status = 'Approved'` or `staff->account_status = 'Approved'` (`app/Http/Controllers/DataController.php:203,220`).
   - Enforces singleton check when approving an `Academic_Coordinator` (`app/Http/Controllers/DataController.php:212-218`).
   - *(Code-level fact: `approveAccount` does not call `checkUserManagementPermission`, relying on UI visibility in Tutor, HOD, and Admin dashboards.)*
2. **`POST /api/admin/user/toggle-status` (`DataController::toggleUserStatus`, `routes/web.php:393`, `app/Http/Controllers/DataController.php:926-994`)**:
   - Enforces `$this->checkUserManagementPermission($type, $id)` (`app/Http/Controllers/DataController.php:937-942`).
   - `checkUserManagementPermission` (`app/Http/Controllers/DataController.php:620-681`) defines the exact authorization hierarchy for approving/suspending/deleting/resetting passwords:
     - **Global Approvers (`['Super_Admin', 'Principal', 'Admin', 'Chairman', 'Workshop_Superintendent']`)**: Can approve, suspend, reset password, or delete **any** student or staff account across all branches (`app/Http/Controllers/DataController.php:629-631`).
     - **Departmental Approver (`'HOD'`)**:
       - Can manage **students** belonging to their own branch (`strtoupper($student->branch) === strtoupper($actorBranch)`) (`app/Http/Controllers/DataController.php:635-637`).
       - Can manage **staff** belonging to their own branch (`strtoupper($staff->branch) === strtoupper($actorBranch)`) only if the target staff's designation is in `['Faculty', 'Lecturer', 'Demonstrator', 'Trade_Instructor', 'Trade Instructor', 'Physical_Instructor', 'Physical Instructor', 'Workshop_Instructor', 'Workshop Instructor', 'Tradesman']` (or if the HOD is editing their own profile) (`app/Http/Controllers/DataController.php:638-648`).
     - **Classroom Approver (Class Tutor / Mentor)**:
       - Any staff member whose `mobile_no` matches `tutor_mobile_no` or `mentor_mobile_no` in `ClassManagement` or `R26ClassManagement` for `$student->classroom_id` (or same branch + semester fallback) can approve/suspend/reset passwords for **students** in their supervised classroom (`app/Http/Controllers/DataController.php:652-673`).

---

## 1.4 Password Reset & Change Flows

1. **Self-Service Email Account Recovery (`POST /api/auth/recover-account`, `routes/web.php:166-240`)**:
   - Triggered from the "Forgot ID / Password?" modal on `login.blade.php` (`resources/views/login.blade.php:280,454-487,933-969`).
   - Searches `students` by `email` first, then `staff_profiles` by `email` (`routes/web.php:172-186`).
   - Generates an 8-character random plain-text password via `$tempPassword = \Illuminate\Support\Str::random(8)` (`routes/web.php:196`).
   - Overwrites `$student->password = $tempPassword` or `$staff->password = $tempPassword` in plain text (`routes/web.php:199-205`).
   - Emails the user's Login ID (`reg_no` or `mobile_no`) and temporary password via `Mail::send` (`routes/web.php:208-226`) and records `'Account Recovery (Password Reset)'` in `AuditLog` (`routes/web.php:228-235`).
2. **Unwired Token Reset Stub (`AuthController::forgotPassword`, `app/Http/Controllers/AuthController.php:416-449`)**:
   - Validates `email`, checks `students` and `staff_profiles`, writes a 64-character token (`Str::random(64)`) to `password_reset_tokens` (`app/Http/Controllers/AuthController.php:431-438`), has `Mail::to` commented out (`app/Http/Controllers/AuthController.php:441`), and is not bound to any route in `routes/web.php`.
3. **Admin / HOD / Tutor Direct Password Reset (`POST /api/admin/user/reset-password` -> `DataController::resetUserPassword`, `routes/web.php:395`, `app/Http/Controllers/DataController.php:1076-1125`)**:
   - Protected by `$this->checkUserManagementPermission($type, $id)` (`app/Http/Controllers/DataController.php:1088-1093`).
   - Validates `newPassword` (`required|string|min:4`) (`app/Http/Controllers/DataController.php:1081`).
   - Writes `$newPassword` in **plain text** to `students.password` (`app/Http/Controllers/DataController.php:1098`) or `staff_profiles.password` (`app/Http/Controllers/DataController.php:1108`) and logs `'Password Reset'` to `AuditLog` (`app/Http/Controllers/DataController.php:1101,1111`).
4. **Student Self-Service Password Change (Two Endpoints)**:
   - **`POST /api/student/change-password` (`AuthController::changeStudentPassword`, `routes/web.php:81`, `app/Http/Controllers/AuthController.php:454-486`)**:
     - Requires `Session::get('userRole') === 'Student'` (`app/Http/Controllers/AuthController.php:458`).
     - Validates `oldPassword` and `newPassword` (`min:6`) (`app/Http/Controllers/AuthController.php:462-465`).
     - Verifies `oldPassword` via `$this->verifyPassword` and saves `$student->password = $request->input('newPassword')` in **plain text** (`app/Http/Controllers/AuthController.php:471-475`).
   - **`POST /api/student/profile/update-self` (`DataController::updateSelfStudentProfile`, `routes/web.php:433`, `app/Http/Controllers/DataController.php:3956-4001`)**:
     - Requires `Session::get('userRole') === 'Student'` (`app/Http/Controllers/DataController.php:3960`).
     - If `new_password` (`min:4`) is supplied, verifies `old_password` (supporting plain text and Bcrypt) and saves `$student->password = Hash::make($request->input('new_password'))` (Bcrypt hashed) (`app/Http/Controllers/DataController.php:3972-3984`).
5. **Staff Self-Service Password Change (Two Endpoints)**:
   - **`POST /api/staff/change-password` (`AuthController::changeStaffPassword`, `routes/web.php:83`, `app/Http/Controllers/AuthController.php:741-790`)**:
     - Requires a logged-in non-Student session (`!$userId || $userRole === 'Student'`) (`app/Http/Controllers/AuthController.php:746-748`).
     - Validates `oldPassword` and `newPassword` (`min:4`), verifies `oldPassword` via `$this->verifyPassword`, and saves `$staff->password = $request->input('newPassword')` in **plain text** (`app/Http/Controllers/AuthController.php:750-776`).
   - **`POST /api/executive/profile/update` (`AuthController::updateExecutiveProfile`, `routes/web.php:82`, `app/Http/Controllers/AuthController.php:646-736`)**:
     - Used by executive/staff profile settings modals (`resources/views/admin_control_desk.blade.php:228`).
     - Updates `name`, `email`, `mobile_no` (cascading across `class_management`, `mentoring_batches`, and `subject_staff_assignments` if changed, `app/Http/Controllers/AuthController.php:683-694`), `photo_url`, and if `new_password` (`min:4`) is provided, overwrites `$staff->password = $request->input('new_password')` in **plain text** without requiring the old password (`app/Http/Controllers/AuthController.php:697-699`).

---

# Section 2: Role Inventory & Access Control Architecture

## 2.1 Storage Schema for Roles, Designations, Branches & Admin Flags

1. **Absence of `users.role` and `users.is_admin`**:
   - There is **no** `users` table, `users.role` column, or `is_admin` column anywhere in `database/migrations/` or `app/Models/`.
2. **`staff_profiles` Table (`database/migrations/2026_06_21_000001_create_staff_profiles_table.php:11-22`, `app/Models/StaffProfile.php:11-23`)**:
   - `mobile_no` (`string(15)`, unique): Staff login ID, stored in `Session::get('userId')` (`app/Http/Controllers/AuthController.php:134`).
   - `designation` (`string(100)`): Primary staff role string, stored directly in `Session::get('userRole')` (`app/Http/Controllers/AuthController.php:133`).
   - `branch` (`string(50)`): Department/stream code (`'EL'`, `'ME'`, `'CE'`, `'EEE'`, `'CT'`, `'AU'`, `'GEN_AIDED'`, `'GEN_SF'`, `'Admin'`, `'Administration'`), stored in `Session::get('userBranch')` (`app/Http/Controllers/AuthController.php:136`).
   - Virtual accessor `StaffProfile::getDepartmentAttribute()` aliases `$this->branch` as `$staff->department` (`app/Models/StaffProfile.php:28-31`).
3. **`students` Table (`database/migrations/2026_06_21_000003_create_students_table.php:11-34`, `app/Models/Student.php:12-43`)**:
   - Students do not have a role column in `students`; upon login, `AuthController::login` hardcodes `Session::put('userRole', 'Student')` (`app/Http/Controllers/AuthController.php:73`).
4. **Parent Sessions**:
   - Parents do not have a separate database table; `ParentDashboardController::login` sets `Session::put('userRole', 'Parent')` and `Session::put('parentRegNo', $student->reg_no)` after validating against `students.guardian_mobile` / `students.phone` (`app/Http/Controllers/ParentDashboardController.php:82-87`).

---

## 2.2 Exhaustive Role & Designation Inventory

### 2.2.1 `Super_Admin`
- **Exact DB Values**:
  - `staff_profiles.designation = 'Super_Admin'` (`database/seeders/DatabaseSeeder.php:23`, `app/Http/Controllers/AuthController.php:145`).
  - `staff_profiles.branch = 'Administration'` or `'Admin'` (`database/seeders/DatabaseSeeder.php:22`, `resources/views/admin_control_desk.blade.php:1144`).
- **Who Creates / Assigns / Approves**:
  - Seeded in `DatabaseSeeder::run` (`database/seeders/DatabaseSeeder.php:18-26`).
  - Can be assigned to any staff member via `POST /api/admin/user/update-designation` (`DataController::updateStaffDesignation`, `app/Http/Controllers/DataController.php:1130-1155`) or `POST /api/admin/staff/update-details` (`DataController::updateStaffDetails`, `app/Http/Controllers/DataController.php:1160-1208`) from the Executive Control Desk (`resources/views/admin_control_desk.blade.php:1163,1808`).
- **Route & Controller Checks**:
  - Dashboard route `GET /dashboard/superadmin` (`routes/web.php:108-115`): requires `Session::get('userRole') === 'Super_Admin'`, renders `view('admin_control_desk')`.
  - Raw credential table `GET /superadmin/show-users` (`routes/web.php:2432-2446`): strictly checks `if (Session::get('userRole') !== 'Super_Admin') return redirect('/');` and displays `resources/views/superadmin_users.blade.php` with plain-text/stored passwords for all staff and students.
  - Executive Control Desk telemetry APIs (`app/Http/Controllers/ExecutiveControlDeskController.php:16-19`): `checkAccess()` allows `['Super_Admin', 'Principal', 'Chairman', 'Admin']`.
  - User management permission (`app/Http/Controllers/DataController.php:629-631`): global access to approve, suspend, delete, or reset passwords for any user.
  - Database backup & restore (`app/Http/Controllers/BackupController.php:78,130`): allowed for `['Super_Admin', 'Principal', 'Admin']`.
  - SF Office Console (`app/Http/Controllers/SfOfficeController.php:21-29`): allowed via `in_array($role, ['SF_Office', 'Super_Admin', 'Principal', 'Admin'])`.
  - Live Online Staff Monitor Desk in `admin_control_desk.blade.php` (`resources/views/admin_control_desk.blade.php:218,1024,1091,1587`): UI tab gated by `@if(session('userRole') === 'Super_Admin')`.
- **Scope**: **Global** across all streams (Aided & Self-Financing), all branches, all classrooms, and all system settings.

### 2.2.2 `Principal`
- **Exact DB Values**:
  - `staff_profiles.designation = 'Principal'` (`database/seeders/DatabaseSeeder.php:33`, `app/Http/Controllers/AuthController.php:345`).
  - `staff_profiles.branch = 'Administration'` or `'Admin'` (`database/seeders/DatabaseSeeder.php:32`, `resources/views/login.blade.php:378`).
- **Who Creates / Assigns / Approves**:
  - Singleton constraint enforced in `AuthController::registerStaff` (`app/Http/Controllers/AuthController.php:345-350`) and `DataController::registerUserDirect` (`app/Http/Controllers/DataController.php:1049-1052`): only one `StaffProfile` with `designation = 'Principal'` can exist.
  - Self-registration with `designation = 'Principal'` is **auto-approved** (`'account_status' => ($designation === 'Principal') ? 'Approved' : 'Pending'`, `app/Http/Controllers/AuthController.php:379`).
- **Route & Controller Checks**:
  - Dashboard route `GET /dashboard/principal` (`routes/web.php:96-102`): allows `in_array(Session::get('userRole'), ['Principal', 'Super_Admin', 'Chairman'])`, renders `view('principal_dashboard')`.
  - Principal Analytics APIs (`app/Http/Controllers/PrincipalDashboardController.php:17-54`): `GET /api/principal/analytics` (`routes/web.php:518`) aggregates institutional KPIs across all 6 diploma programs (`CE`, `ME`, `EEE`, `EL`, `CT`, `AU`) and general departments (`GEN_AIDED`, `GEN_SF`).
  - Final Stage-3 Staff Leave Approver (`app/Http/Controllers/StaffLeaveController.php:281-333`): `POST /api/staff/leave/action` with `stage = 'principal'` requires `in_array($userRole, ['Principal', 'Super_Admin', 'Admin'])` and transitions `overall_status` from `'Pending_Principal'` to `'Approved'` or `'Rejected'`.
  - Consolidated CIA Report Stage-3 Verifier (`app/Http/Controllers/ConsolidatedCiaReportController.php:1016-1089`): `POST /api/consolidated-cia/approve` with `stage = 'principal'` requires `in_array($role, ['Principal', 'Super_Admin', 'Admin'])`.
  - Executive Flash Notices & Scheduled Campus Events (`app/Http/Controllers/ExecutiveFlashNoticeController.php:19,101,126`, `app/Http/Controllers/PrincipalScheduledEventController.php:19,99,195`).
- **Scope**: **Global** institutional authority across both Aided and Self-Financing streams.

### 2.2.3 `Chairman`
- **Exact DB Values**:
  - `staff_profiles.designation = 'Chairman'` (`database/seeders/DatabaseSeeder.php:73`, `resources/views/login.blade.php:396`).
  - `staff_profiles.branch = 'Administration'` or `'Admin'` (`database/seeders/DatabaseSeeder.php:72`).
- **Who Creates / Assigns / Approves**:
  - Seeded in `DatabaseSeeder` (`database/seeders/DatabaseSeeder.php:68-76`) or registered via `/register/staff` (`resources/views/login.blade.php:396`) and approved by `Super_Admin` / `Principal` / `Admin`.
- **Route & Controller Checks**:
  - Dashboard route `GET /dashboard/chairman` (`routes/web.php:103-107`): allows `in_array(Session::get('userRole'), ['Chairman', 'Super_Admin'])`, renders `view('principal_dashboard')` (shares the Principal Executive Dashboard view).
  - Included in `checkUserManagementPermission` (`app/Http/Controllers/DataController.php:629`), `ExecutiveControlDeskController::checkAccess` (`app/Http/Controllers/ExecutiveControlDeskController.php:18`), `ExecutiveFlashNoticeController` (`app/Http/Controllers/ExecutiveFlashNoticeController.php:19,101,126`), and `PrincipalScheduledEventController` (`app/Http/Controllers/PrincipalScheduledEventController.php:19,99,195`).
- **Scope**: **Global** executive authority across all streams and branches.

### 2.2.4 `Admin`
- **Exact DB Values**:
  - `staff_profiles.designation = 'Admin'` (`database/seeders/DatabaseSeeder.php:63`, `resources/views/admin_control_desk.blade.php:1164,1809`).
  - `staff_profiles.branch = 'Administration'` or `'Admin'` (`database/seeders/DatabaseSeeder.php:62`).
- **Who Creates / Assigns / Approves**:
  - Seeded in `DatabaseSeeder` (`database/seeders/DatabaseSeeder.php:58-66`) or assigned by an existing admin via `DataController::updateStaffDesignation` (`app/Http/Controllers/DataController.php:1130`) / `DataController::updateStaffDetails` (`app/Http/Controllers/DataController.php:1160`). Note: `'Admin'` is **not** in the public self-registration dropdown `#regStaffDesig` in `resources/views/login.blade.php:383-398`.
- **Route & Controller Checks**:
  - Dashboard route `GET /dashboard/admin` (`routes/web.php:117-121`): allows `in_array(Session::get('userRole'), ['Admin', 'Super_Admin'])` and renders `view('admin_control_desk')`.
  - Shares `checkUserManagementPermission` (`app/Http/Controllers/DataController.php:629`), `ExecutiveControlDeskController::checkAccess` (`app/Http/Controllers/ExecutiveControlDeskController.php:18`), `BackupController` (`app/Http/Controllers/BackupController.php:78,130`), and `SfOfficeController::checkAccess` (`app/Http/Controllers/SfOfficeController.php:29`).
- **Scope**: **Global** administrative access across all branches and streams (see Section 2.4 for exact differences between `Super_Admin`, `Principal`, and `Admin`).

### 2.2.5 `HOD` (Head of the Department)
- **Exact DB Values**:
  - `staff_profiles.designation = 'HOD'` (`database/seeders/DatabaseSeeder.php:43,117,128,139,150,161`, `resources/views/login.blade.php:384`).
  - Some legacy queries also match `'LIKE %Head of Department%'` alongside `'HOD'` (`app/Http/Controllers/ConsolidatedCiaReportController.php:137-138`, `app/Models/BatchSubject.php:53`).
  - `staff_profiles.branch`: One of the 6 engineering branches (`'EL'`, `'CT'`, `'AU'`, `'CE'`, `'ME'`, `'EEE'`) (`database/seeders/DatabaseSeeder.php:42,116,127,138,149,160`).
- **Who Creates / Assigns / Approves**:
  - Registered via `/register/staff` (`resources/views/login.blade.php:384`) or `/api/admin/user/register-direct` (`resources/views/admin_control_desk.blade.php:1337`), approved by `Super_Admin` / `Principal` / `Admin` (`app/Http/Controllers/DataController.php:629-631`).
- **Route & Controller Checks**:
  - Desktop Dashboard `GET /dashboard/hod` (`routes/web.php:122-146`):
    - Allows `in_array($role, ['HOD', 'Gen_Dept_Coordinator_Aided', 'Gen_Dept_Coordinator_Self_Finance', 'Super_Admin', 'Principal', 'Admin'])` (`routes/web.php:125`).
    - Auto-redirects mobile devices (unless `?desktop=1` or `?mode=desktop`) to `/hod/mobile` (`routes/web.php:129-131`).
    - Renders `view('hod_dashboard', ['activeBranch' => $branch])` (`routes/web.php:145`).
  - Mobile Dashboard `GET /hod/mobile` (`routes/web.php:292-293` -> `HodMobileController::showDashboard`, `app/Http/Controllers/HodMobileController.php:19-46`):
    - Allows `in_array($role, ['HOD', 'Gen_Dept_Coordinator_Aided', 'Gen_Dept_Coordinator_Self_Finance', 'Super_Admin', 'Principal', 'Admin'])`.
  - User Management (`app/Http/Controllers/DataController.php:634-649,849-852`):
    - Scoped to `strtoupper($userBranch)`: can view, approve, suspend, reset passwords, or delete students and departmental staff (`Lecturer`, `Demonstrator`, `Trade_Instructor`, `Physical_Instructor`, `Workshop_Instructor`, `Tradesman`) in their own branch.
  - Classroom & Subject Allocation (`app/Http/Controllers/DataController.php:1214-1420`, `app/Http/Controllers/R26DataController.php:20-235`):
    - Creates classrooms, assigns Class Tutors (`tutor_mobile_no`) and Mentors (`mentor_mobile_no`), registers batch subjects, and assigns subject teachers (`subject_staff_assignments`).
  - Stage-1 Staff Leave Approver (`app/Http/Controllers/StaffLeaveController.php:205-248`):
    - Approves/rejects leaves at `stage = 'hod'` (`hod_status`), advancing `overall_status` from `'Pending_HOD'` to `'Pending_Coordinator'`.
  - Stage-2 Consolidated CIA Verifier (`app/Http/Controllers/ConsolidatedCiaReportController.php:1016-1089`).
- **Scope**: **Branch/Department-scoped** (`Session::get('userBranch')`, or `?branch=` override when accessed by `Super_Admin`/`Principal`/`Admin`, `routes/web.php:134-137`, `app/Http/Controllers/HodMobileController.php:31-35`).

### 2.2.6 `Gen_Dept_Coordinator_Aided` & `Gen_Dept_Coordinator_Self_Finance`
- **Exact DB Values**:
  - `staff_profiles.designation = 'Gen_Dept_Coordinator_Aided'` with `staff_profiles.branch = 'GEN_AIDED'` (`database/seeders/DatabaseSeeder.php:227-228`, `resources/views/login.blade.php:376,385`).
  - `staff_profiles.designation = 'Gen_Dept_Coordinator_Self_Finance'` with `staff_profiles.branch = 'GEN_SF'` (`database/seeders/DatabaseSeeder.php:262-263`, `resources/views/login.blade.php:377,386`).
- **Who Creates / Assigns / Approves**:
  - Seeded in `DatabaseSeeder` (`database/seeders/DatabaseSeeder.php:223-231,258-266`) or registered via `/register/staff` (`resources/views/login.blade.php:385-386`) and approved by `Super_Admin` / `Principal` / `Admin`.
- **Route & Controller Checks**:
  - `GET /dashboard/general-coordinator-aided` (`routes/web.php:236-247`): requires `in_array($role, ['Gen_Dept_Coordinator_Aided', 'Super_Admin', 'Principal', 'Admin'])`, sets `Session::put('userBranch', 'GEN_AIDED')`, and renders `view('hod_dashboard', ['activeBranch' => 'GEN_AIDED', 'generalStream' => 'AIDED', ...])`.
  - `GET /dashboard/general-coordinator-sf` (`routes/web.php:249-260`): requires `in_array($role, ['Gen_Dept_Coordinator_Self_Finance', 'Super_Admin', 'Principal', 'Admin'])`, sets `Session::put('userBranch', 'GEN_SF')`, and renders `view('hod_dashboard', ['activeBranch' => 'GEN_SF', 'generalStream' => 'SF', ...])`.
  - In `DataController::getHodDashboardData` (`app/Http/Controllers/DataController.php:1425-1520`) and `R26DataController` (`app/Http/Controllers/R26DataController.php:28-65`), when `$branch === 'GEN_AIDED'`, S1/S2 classrooms for Aided branches (`['CE', 'ME', 'EEE']`) are queried; when `$branch === 'GEN_SF'`, S1/S2 classrooms for Self-Financing branches (`['EL', 'CT', 'AU']`) are queried.
  - In `StaffLeaveController::actionLeave` (`app/Http/Controllers/StaffLeaveController.php:205-248`), both designations are authorized to act on `stage = 'hod'` for staff in their respective general department (`GEN_AIDED` or `GEN_SF`).
- **Scope**: **Stream + First-Year General Department Scoped** (`GEN_AIDED` covers S1/S2 across `CE`, `ME`, `EEE`; `GEN_SF` covers S1/S2 across `EL`, `CT`, `AU`).

### 2.2.7 `Academic_Coordinator` / `Academic Coordinator` / `Academic_Coordinator_SF`
- **Exact DB Values & Dual-Resolution Mechanism**:
  - Can be stored directly in `staff_profiles.designation` as `'Academic_Coordinator'`, `'Academic Coordinator'`, or `'Academic_Coordinator_SF'` (`app/Http/Controllers/AuthController.php:159,352`, `resources/views/admin_control_desk.blade.php:883,1152`).
  - **Dynamic System-Setting Overlay (`StaffProfile::isSfAcademicCoordinator`, `app/Models/StaffProfile.php:66-80`)**:
    - Any staff member (typically an SF HOD or Lecturer) whose `mobile_no` matches the `system_settings` key `'sf_academic_coordinator_mobile'` (or a hardcoded 10-digit fallback mobile number in `app/Models/StaffProfile.php:75`) is dynamically recognized as the **Self-Financing Academic Coordinator** even while retaining their primary `designation` (such as `'HOD'`).
    - The active coordinator mobile number is configurable by `Super_Admin`, `Principal`, or `Admin` via `POST /api/staff/leave/coordinator-config` (`StaffLeaveController::updateCoordinatorConfig`, `app/Http/Controllers/StaffLeaveController.php:446-471`).
- **Who Creates / Assigns / Approves**:
  - Singleton check in `AuthController::registerStaff` (`app/Http/Controllers/AuthController.php:352-359`) and `DataController::approveAccount` (`app/Http/Controllers/DataController.php:212-218`) prevents approving more than one `Academic_Coordinator`.
  - Dynamic assignment via `StaffLeaveController::updateCoordinatorConfig` (`app/Http/Controllers/StaffLeaveController.php:446-471`).
- **Route & Controller Checks**:
  - `GET /dashboard/academic-coordinator` (`routes/web.php:262-273`): allows `in_array($role, ['Academic_Coordinator', 'Academic Coordinator', 'Academic_Coordinator_SF', 'Gen_Dept_Coordinator_Self_Finance', 'Super_Admin', 'Principal', 'Admin'])` OR `\App\Models\StaffProfile::isSfAcademicCoordinator($userId)`, rendering `view('academic_coordinator_dashboard')`.
  - Stage-2 Staff Leave Approver (`app/Http/Controllers/StaffLeaveController.php:250-279`): `POST /api/staff/leave/action` with `stage = 'coordinator'` requires `in_array($userRole, ['Academic_Coordinator', 'Academic Coordinator', 'Academic_Coordinator_SF', 'Gen_Dept_Coordinator_Self_Finance', 'Super_Admin', 'Principal', 'Admin']) || $isDesignatedCoordinator`, advancing `overall_status` from `'Pending_Coordinator'` to `'Pending_Principal'`.
  - User Directory scoping (`app/Http/Controllers/DataController.php:853-863`): in `DataController::getAllUsers`, if `$userRole` is an Academic Coordinator variant (or `$isDesignatedCoord && $request->input('scope') === 'sf'`), queries are restricted to Self-Financing branches `['EL', 'AU', 'CT', 'GEN_SF']`.
- **Scope**: **Self-Financing Stream Scoped** (`EL`, `AU`, `CT`, `GEN_SF`).

### 2.2.8 `SF_Office` (Self-Financing Office Desk / Administrative Superintendent)
- **Exact DB Values**:
  - `staff_profiles.designation = 'SF_Office'`, `staff_profiles.branch = 'GEN_SF'` (`database/migrations/2026_10_08_000001_create_sf_office_tables.php:89-90`).
- **Who Creates / Assigns / Approves**:
  - Seeded automatically by migration `2026_10_08_000001_create_sf_office_tables.php:82-98` with `account_status => 'Approved'`.
- **Route & Controller Checks**:
  - Dashboard route `GET /dashboard/sf-office` (`routes/web.php:2463`) and 22 API endpoints under `/api/sf-office/*` (`routes/web.php:2464-2492`) handled by `SfOfficeController` (`app/Http/Controllers/SfOfficeController.php:18-981`).
  - `SfOfficeController::checkAccess()` (`app/Http/Controllers/SfOfficeController.php:21-31`) grants access if:
    - `Session::get('userId')` exists AND
    - `in_array($role, ['SF_Office', 'Super_Admin', 'Principal', 'Admin'])` OR `$userId` equals the seeded SF Office mobile number (`app/Http/Controllers/SfOfficeController.php:29`).
  - Manages SF leave forwarding (`office_status` on `staff_leave_requests`), historical leave backfilling, manual time-punch overrides (`sf_staff_time_punches`), holiday/Saturday Compensatory Casual Leave credits (`sf_staff_ccl_credits`), and SF leave policy settings (`sf_office_leave_year_start`, `sf_office_leave_year_end`, `sf_office_annual_cl_quota`, `sf_office_ccl_validity_days`) (`app/Http/Controllers/SfOfficeController.php:66-980`).
- **Scope**: **Self-Financing Stream Scoped** (`EL`, `AU`, `CT`, `GEN_SF`, excluding non-SF admins, `app/Http/Controllers/SfOfficeController.php:36-61`).

### 2.2.9 `Tutor` (Class Advisor / Class Tutor / Mentor-1)
- **Exact DB Values**:
  - Can exist as an explicit designation `staff_profiles.designation = 'Tutor'` (`database/seeders/DatabaseSeeder.php:53`, `resources/views/admin_control_desk.blade.php:1814`), **OR** (more commonly) as a functional role held by a `Lecturer` whose `mobile_no` is assigned to `class_management.tutor_mobile_no` or `r26_class_management.tutor_mobile_no` (see Section 2.3.1 for full resolution details).
- **Who Creates / Assigns / Approves**:
  - Assigned to a classroom by the branch `HOD` (or `Gen_Dept_Coordinator_*` / `Admin`) via `POST /api/hod/assign-tutor` (`DataController::assignClassTutor`, `app/Http/Controllers/DataController.php:1291-1350`) or `POST /api/r26/hod/assign-tutor` (`R26DataController::assignTutor`, `app/Http/Controllers/R26DataController.php:108-158`).
- **Route & Controller Checks**:
  - `GET /dashboard/tutor` (`routes/web.php:148-152`): checks `if (!Session::get('userRole')) return redirect('/');` and redirects to `/dashboard/lecturer?tab=InteractiveClass&subtab=subtab-mentoring` (`routes/web.php:151`).
  - Authorized to approve/suspend/reset passwords for students in their assigned classroom (`DataController::checkUserManagementPermission`, `app/Http/Controllers/DataController.php:652-673`), verify student Activity Point claims (`ActivityPointsController::getClassroomClaims`, `app/Http/Controllers/ActivityPointsController.php:75-98`), approve student leaves (`MentoringController::approveLeaveRecord`, `app/Http/Controllers/MentoringController.php:1740-1766`), manage mentoring batches (`MentoringController::assignStudentBatches`, `app/Http/Controllers/MentoringController.php:167-225`), upload/manage Tutor Class Attendance & Exam Eligibility (`TutorSpecialAttendanceController`, `app/Http/Controllers/TutorSpecialAttendanceController.php:20-71`), and submit Stage-1 Consolidated CIA approvals (`ConsolidatedCiaReportController::approveReport`, `app/Http/Controllers/ConsolidatedCiaReportController.php:1016-1055`).
- **Scope**: **Classroom/Batch-scoped** (`class_management.classroom_id` / `r26_class_management.classroom_id`).

### 2.2.10 `Mentor` (Mentor-2 / Batch Mentor)
- **Exact DB Values**:
  - Not a standalone `staff_profiles.designation` option in registration dropdowns; instead, a functional role stored via:
    1. `class_management.mentor_mobile_no` (`database/migrations/2026_06_21_000002_create_class_management_table.php:16`).
    2. `r26_class_management.mentor_mobile_no` (`database/migrations/2026_07_19_000002_create_r26_class_management_table.php:16`).
    3. `mentoring_batches.mentor_no` with `batch_label` (`'A'` = Mentor-1/Tutor, `'B'` = Mentor-2) (`database/migrations/2026_06_21_060000_create_mentoring_batches_table.php:15-16`).
    4. `students.mentor_mobile_no` (`database/migrations/2026_06_21_000003_create_students_table.php:25`).
- **Who Creates / Assigns / Approves**:
  - Assigned at the classroom level by the `HOD` via `DataController::assignClassTutor` (`app/Http/Controllers/DataController.php:1291-1350`) or `R26DataController::assignTutor` (`app/Http/Controllers/R26DataController.php:108-158`).
  - Student sub-batches (`Batch A` vs `Batch B`) are split and assigned by the Class Tutor via `POST /api/mentoring/assign-batches` (`MentoringController::assignStudentBatches`, `app/Http/Controllers/MentoringController.php:167-225`).
- **Scope**: **Classroom / Sub-batch (`A` or `B`) Scoped**.

### 2.2.11 `Lecturer`
- **Exact DB Values**:
  - `staff_profiles.designation = 'Lecturer'` (`database/seeders/DatabaseSeeder.php:83,179,238,273`, `resources/views/login.blade.php:387`).
- **Who Creates / Assigns / Approves**:
  - Self-registered via `/register/staff` (`resources/views/login.blade.php:387`) or created by Admin/HOD (`resources/views/hod_dashboard.blade.php:1201`), approved by branch `HOD` or `Super_Admin`/`Principal`/`Admin` (`app/Http/Controllers/DataController.php:629-648`).
- **Route & Controller Checks**:
  - Desktop Dashboard `GET /dashboard/lecturer` (`routes/web.php:166-197`):
    - Allows `in_array($role, ['Lecturer', 'Demonstrator', 'Trade_Instructor', 'Tradesman', 'Workshop_Instructor', 'Workshop Instructor', 'Workshop_Superintendent', 'Physical_Instructor', 'Physical Instructor', 'Tutor', 'HOD', 'Gen_Dept_Coordinator_Aided', 'Gen_Dept_Coordinator_Self_Finance', 'Academic_Coordinator', 'Academic Coordinator', 'Academic_Coordinator_SF', 'Principal', 'Super_Admin', 'Admin'])` (`routes/web.php:169-174`).
    - Redirects mobile browsers (without `?mode=desktop` or `?desktop=1`) to `/staff/mobile` (`routes/web.php:178-180`).
    - Renders `view('tutor_dashboard')` (`routes/web.php:196`).
  - Mobile Dashboard `GET /staff/mobile` (`routes/web.php:290` -> `MentoringController::showStaffMobileDashboard`, `app/Http/Controllers/MentoringController.php:2037-2756`).
  - Single-period Practicum Theory Rule (`app/Http/Controllers/MentoringController.php:2292-2360`, `resources/views/hod_dashboard.blade.php:3088-3092,3372-3376`, `resources/views/r26_practicum/timetable_print.blade.php:351-358`): For Revision 2026 Practicum subjects, 1-hour timetable slots are treated as Theory lectures and displayed/assigned **only** to `Lecturer` (and `HOD`/`Coordinator`) roles, filtering out `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_*`, and `Physical_Instructor`.
- **Scope**: **Subject-assignment (`subject_staff_assignments`) and Classroom-mentoring Scoped**, within their `branch`.

### 2.2.12 `Demonstrator`
- **Exact DB Values**:
  - `staff_profiles.designation = 'Demonstrator'` (`database/seeders/DatabaseSeeder.php:93,192`, `resources/views/login.blade.php:388`).
- **Who Creates / Assigns / Approves**:
  - Self-registered or created by HOD/Admin, approved by branch `HOD` or `Super_Admin`/`Principal`/`Admin` (`app/Http/Controllers/DataController.php:641`).
- **Route & Controller Checks**:
  - `GET /dashboard/demonstrator` (`routes/web.php:199-210`): requires `in_array($role, ['Demonstrator', 'Super_Admin', 'Principal', 'Admin'])`, redirects mobile devices to `/staff/mobile`, and renders `view('tutor_dashboard')` on desktop.
  - Ranked 3rd in faculty display order (`BatchSubject::getFacultyListForSubject`, `app/Models/BatchSubject.php:55`).
  - Filtered out of single-period Practicum theory timetable slots (`app/Http/Controllers/MentoringController.php:2293,2332-2360`).
- **Scope**: **Subject / Practical Lab Scoped** within their `branch`.

### 2.2.13 `Trade_Instructor` (and `'Trade Instructor'`)
- **Exact DB Values**:
  - `staff_profiles.designation = 'Trade_Instructor'` (`database/seeders/DatabaseSeeder.php:103,215,321`, `resources/views/login.blade.php:390`).
  - Code checks also match space-separated `'Trade Instructor'` (`app/Http/Controllers/DataController.php:642`, `app/Http/Controllers/MentoringController.php:2293`).
- **Who Creates / Assigns / Approves**:
  - Self-registered or created by HOD/Admin, approved by branch `HOD` or `Super_Admin`/`Principal`/`Admin` (`app/Http/Controllers/DataController.php:641-642`).
- **Route & Controller Checks**:
  - `GET /dashboard/tradeinstructor` (`routes/web.php:212-222`): requires `in_array($role, ['Trade_Instructor', 'Super_Admin', 'Principal', 'Admin'])`, redirects mobile devices to `/staff/mobile`, and renders `view('tutor_dashboard')` on desktop.
  - Ranked 5th in `BatchSubject::getFacultyListForSubject` (`app/Models/BatchSubject.php:57`).
  - Filtered out of single-period Practicum theory timetable slots (`app/Http/Controllers/MentoringController.php:2293,2332-2360`).
- **Scope**: **Subject / Lab / Workshop Scoped** within their `branch`.

### 2.2.14 `Tradesman`
- **Exact DB Values**:
  - `staff_profiles.designation = 'Tradesman'` (`database/seeders/DatabaseSeeder.php:204`, `resources/views/login.blade.php:391`).
- **Who Creates / Assigns / Approves**:
  - Self-registered or created by HOD/Admin, approved by branch `HOD` or `Super_Admin`/`Principal`/`Admin` (`app/Http/Controllers/DataController.php:645`).
- **Route & Controller Checks**:
  - On login (`app/Http/Controllers/AuthController.php:169-170`, `app/Http/Controllers/WebAuthnController.php:289-290`, `routes/web.php:44-45`), redirects to `/dashboard/lecturer` (which redirects mobile users to `/staff/mobile`).
  - Ranked 5th in `BatchSubject::getFacultyListForSubject` (`app/Models/BatchSubject.php:57`).
  - Filtered out of single-period Practicum theory timetable slots (`app/Http/Controllers/MentoringController.php:2294,2332-2360`).
- **Scope**: **Subject / Lab / Workshop Scoped** within their `branch`.

### 2.2.15 `Workshop_Superintendent`
- **Exact DB Values**:
  - `staff_profiles.designation = 'Workshop_Superintendent'` (`database/seeders/DatabaseSeeder.php:298`, `resources/views/login.blade.php:394`).
- **Who Creates / Assigns / Approves**:
  - Seeded in `DatabaseSeeder` under `branch = 'ME'` (`database/seeders/DatabaseSeeder.php:293-301`) or registered via `/register/staff` (`resources/views/login.blade.php:394`) and approved by `Super_Admin`/`Principal`/`Admin`.
- **Route & Controller Checks**:
  - `GET /dashboard/workshop` (`routes/web.php:224-234`): allows `in_array($role, ['Workshop_Superintendent', 'Super_Admin', 'Principal', 'Admin'])`, redirects mobile devices to `/staff/mobile`, and renders `view('tutor_dashboard')` on desktop.
  - **Elevated Privileges**:
    - Included in `DataController::checkUserManagementPermission` (`app/Http/Controllers/DataController.php:629-631`) alongside `Super_Admin`, `Principal`, `Admin`, and `Chairman` with global user management permission.
    - Included in `BatchStudentUploadController::uploadBatchStudents` (`app/Http/Controllers/BatchStudentUploadController.php:23`) to upload student batches.
    - Included in `ActivityPointsController::getStudentSummary` (`app/Http/Controllers/ActivityPointsController.php:129`).
- **Scope**: Primarily Mechanical Workshop (`ME`) & S1/S2 Engineering Workshop courses across branches, with global user-management and batch-upload privileges in `DataController:629` and `BatchStudentUploadController:23`.

### 2.2.16 `Workshop_Instructor` (and `'Workshop Instructor'`)
- **Exact DB Values**:
  - `staff_profiles.designation = 'Workshop_Instructor'` (`database/seeders/DatabaseSeeder.php:309`, `resources/views/login.blade.php:393`).
  - Code checks also match space-separated `'Workshop Instructor'` (`app/Http/Controllers/AuthController.php:169`, `app/Http/Controllers/DataController.php:644`, `app/Http/Controllers/MentoringController.php:2073-2074,2294`).
- **Who Creates / Assigns / Approves**:
  - Self-registered or created by HOD/Admin, approved by branch `HOD` or `Super_Admin`/`Principal`/`Admin` (`app/Http/Controllers/DataController.php:644`).
- **Route & Controller Checks**:
  - Redirects on login to `/dashboard/lecturer` (`app/Http/Controllers/AuthController.php:169-170`, `routes/web.php:44-45`).
  - Ranked 4th in `BatchSubject::getFacultyListForSubject` (`app/Models/BatchSubject.php:56`).
  - Evaluates Revision 2021 Workshop continuous assessments (`R21VirtualClassroomWorkshopController`, `app/Http/Controllers/MentoringController.php:2497-2530`).
- **Scope**: **Workshop / Subject Scoped** within their `branch`.

### 2.2.17 `Physical_Instructor` (and `'Physical Instructor'`)
- **Exact DB Values**:
  - `staff_profiles.designation = 'Physical_Instructor'` (`database/seeders/DatabaseSeeder.php:251,285`, `resources/views/login.blade.php:389`).
  - Code checks also match `'Physical Instructor'` (`app/Http/Controllers/AuthController.php:171`, `app/Http/Controllers/DataController.php:643`, `app/Http/Controllers/MentoringController.php:2077-2078,2296`).
- **Who Creates / Assigns / Approves**:
  - Seeded for both `GEN_AIDED` (`database/seeders/DatabaseSeeder.php:245-255`) and `GEN_SF` (`database/seeders/DatabaseSeeder.php:279-289`), or self-registered/created by HOD/Admin and approved by `HOD` or `Super_Admin`/`Principal`/`Admin` (`app/Http/Controllers/DataController.php:643`).
- **Route & Controller Checks**:
  - Redirects on login to `/dashboard/lecturer` (`app/Http/Controllers/AuthController.php:171-172`, `routes/web.php:46-47`).
  - Evaluates Revision 2026 Health & Physical Education (Course Code `1009`) via `R26VirtualClassroomHealthPhysicalController` (`routes/web.php:1964-1988`).
- **Scope**: **Stream / Subject Scoped** (`GEN_AIDED` or `GEN_SF`).

### 2.2.18 `Laboratory_Assistant`
- **Exact DB Values**:
  - `staff_profiles.designation = 'Laboratory_Assistant'` (`database/seeders/DatabaseSeeder.php:333`, `resources/views/login.blade.php:392`).
- **Who Creates / Assigns / Approves**:
  - Seeded in `DatabaseSeeder` (`database/seeders/DatabaseSeeder.php:327-337`) or registered via `/register/staff` (`resources/views/login.blade.php:392`) / HOD direct registration (`resources/views/hod_dashboard.blade.php:1206`).
  - *(Notable CodeQuirk)*: `DataController::checkUserManagementPermission` (`app/Http/Controllers/DataController.php:640-646`) lists `['Faculty', 'Lecturer', 'Demonstrator', 'Trade_Instructor', 'Trade Instructor', 'Physical_Instructor', 'Physical Instructor', 'Workshop_Instructor', 'Workshop Instructor', 'Tradesman']` for HOD management, omitting `'Laboratory_Assistant'` from the HOD's toggle/reset array even though `'Laboratory_Assistant'` appears in `hod_dashboard.blade.php:425,1206`; global admins (`Super_Admin`, `Principal`, `Admin`, `Chairman`, `Workshop_Superintendent`) can manage `'Laboratory_Assistant'` accounts without restriction (`app/Http/Controllers/DataController.php:629-631`).
- **Route & Controller Checks**:
  - Falls into the `else` branch on login (`app/Http/Controllers/AuthController.php:173-174`, `app/Http/Controllers/MentoringController.php:2079-2080`), routing to `/dashboard/lecturer` (or `/staff/mobile` on mobile). Note: `/dashboard/lecturer` (`routes/web.php:169-174`) does not explicitly list `'Laboratory_Assistant'` in its `in_array` check, so a desktop `Laboratory_Assistant` visiting `/dashboard/lecturer` directly is redirected to `/`, whereas `/staff/mobile` (`app/Http/Controllers/MentoringController.php:2042`) allows any non-`Student` role!
- **Scope**: **Lab / Department Scoped**.

### 2.2.19 `Student`
- **Exact DB Values**:
  - Stored in `students` table (`database/migrations/2026_06_21_000003_create_students_table.php:11-34`); session role set to `Session::put('userRole', 'Student')` (`app/Http/Controllers/AuthController.php:73`).
- **Who Creates / Assigns / Approves**:
  - Self-registered via `/register/student` (`status = 'Pending'`, `app/Http/Controllers/AuthController.php:201-316`) and approved by Class Tutor, branch HOD, or Admin (`app/Http/Controllers/DataController.php:629-673`).
  - Bulk imported with `status = 'Approved'` via `BatchStudentUploadController::uploadBatchStudents` (`app/Http/Controllers/BatchStudentUploadController.php:20-303`) or `DataController::bulkImportStudents` (`app/Http/Controllers/DataController.php:3682-3810`).
- **Route & Controller Checks**:
  - Desktop Dashboard `GET /dashboard/student` (`routes/web.php:88-95`): requires `Session::get('userRole') === 'Student'`, renders `view('student_dashboard')`.
  - Mobile Dashboard `GET /dashboard/student/mobile` (`routes/web.php:286-288`): renders `view('student_mobile_dashboard')`.
  - Explicitly blocked from all staff endpoints via `if ($role === 'Student')` checks (e.g., `app/Http/Controllers/MentoringController.php:1746,1778,1805,1898,2042`, `app/Http/Controllers/WebAuthnController.php:24,79,321,344`).
- **Scope**: **Self-scoped** to `Session::get('userId')` (`reg_no`) and enrolled `classroom_id`.

### 2.2.20 `Parent`
- **Exact DB Values**:
  - Ephemeral session role `Session::put('userRole', 'Parent')` with `Session::put('parentRegNo', $student->reg_no)` (`app/Http/Controllers/ParentDashboardController.php:82-87,114-118`).
- **Who Creates / Assigns / Approves**:
  - Authenticated via `POST /parent/login` against `students.guardian_mobile` / `students.phone` (or auto-bound on first login if `guardian_mobile` is empty, `app/Http/Controllers/ParentDashboardController.php:61-72`), or via signed MD5 SMS token on `GET /parent/dashboard/{regNo}?token=...` (`app/Http/Controllers/ParentDashboardController.php:110-120`).
- **Route & Controller Checks**:
  - `GET /parent/dashboard/{regNo}` (`app/Http/Controllers/ParentDashboardController.php:98-180`) and `/api/parent/*` endpoints (`routes/web.php:2427-2430`): checks `$parentRegNo === $student->reg_no` (or staff preview role) (`app/Http/Controllers/ParentDashboardController.php:123-128`).
- **Scope**: **Single-Student Read/Feedback Scoped** (`parentRegNo`).

---

## 2.3 Exact Resolution of Tutor, Mentor, HOD, and Subject-Teacher Status

### 2.3.1 How Tutor & Mentor Status Are Determined
A staff member's status as a **Class Tutor (Mentor-1)** or **Co-Mentor (Mentor-2)** is resolved dynamically at runtime rather than relying solely on `staff_profiles.designation`:

1. **Classroom-Level Tables (`class_management` & `r26_class_management`)**:
   - **Revision 2021 Classrooms (`class_management` table, `app/Models/ClassManagement.php:9-20`, `database/migrations/2026_06_21_000002_create_class_management_table.php:11-22`)**:
     - Columns: `classroom_id` (PK, e.g. `EL_2025_2028`), `branch`, `batch_year`, `current_semester`, `tutor_mobile_no` (Mentor-1 / Class Tutor), `mentor_mobile_no` (Mentor-2).
   - **Revision 2026 Classrooms (`r26_class_management` table, `app/Models/R26ClassManagement.php:9-21`, `database/migrations/2026_07_19_000002_create_r26_class_management_table.php:11-23`)**:
     - Columns: `classroom_id` (PK, e.g. `EL_2026_2029`), `branch`, `batch_year`, `current_semester`, `tutor_mobile_no`, `mentor_mobile_no`.
   - **Resolution Query Pattern** (used in `MentoringController::getTutorClassrooms` at `app/Http/Controllers/MentoringController.php:24-112`, `MentoringController::showStaffMobileDashboard` at `app/Http/Controllers/MentoringController.php:2111-2131`, `TutorController::getProgressReportData` at `app/Http/Controllers/TutorController.php:58-75`, `TutorSpecialAttendanceController::resolveTutorClassroom` at `app/Http/Controllers/TutorSpecialAttendanceController.php:39-56`, `ConsolidatedCiaReportController::resolveClassroom` at `app/Http/Controllers/ConsolidatedCiaReportController.php:40-56`, and `DataController::checkUserManagementPermission` at `app/Http/Controllers/DataController.php:654-662`):
     - Queries both `class_management` and `r26_class_management` where `tutor_mobile_no = $userId OR mentor_mobile_no = $userId` (also matching digits-only `$cleanMobile = preg_replace('/[^0-9]/', '', $userId)`).
     - In `MentoringController::getTutorClassrooms` (`app/Http/Controllers/MentoringController.php:100-108`), if `$c->tutor_mobile_no === $mobileNo`, the staff member's classroom role is labeled `'Tutor (Mentor-1)'` (`is_tutor = true`); otherwise it is labeled `'Mentor-2'` (`is_tutor = false`).
2. **Student Sub-Batch Mentoring (`mentoring_batches` & `students.mentor_mobile_no`)**:
   - `mentoring_batches` (`app/Models/MentoringBatch.php:9-19`, `database/migrations/2026_06_21_060000_create_mentoring_batches_table.php:11-27`) maps each student (`classroom_id`, `reg_no`) to `mentor_no` (staff `mobile_no`) and `batch_label` (`'A'` for Mentor-1/Tutor, `'B'` for Mentor-2).
   - When the Class Tutor splits a class in `MentoringController::assignStudentBatches` (`app/Http/Controllers/MentoringController.php:167-225`), rows are upserted into `mentoring_batches` (`app/Http/Controllers/MentoringController.php:205-214`) AND `students.mentor_mobile_no` is updated to the assigned mentor's mobile number (`app/Http/Controllers/MentoringController.php:217`).
   - When fetching mentee lists in `MentoringController::getClassroomStudents` (`app/Http/Controllers/MentoringController.php:118-161`), if `?my_batch_only=1` is passed and batches exist for that classroom, students are filtered to those whose `mentoring_batches.mentor_no === $mobileNo` (`app/Http/Controllers/MentoringController.php:141-147`).

### 2.3.2 How HOD Status Is Determined
1. **Session & Profile Designation**:
   - Primary check: `Session::get('userRole') === 'HOD'` (populated from `staff_profiles.designation` at login, `app/Http/Controllers/AuthController.php:133`) paired with `Session::get('userBranch')` (`staff_profiles.branch`, `app/Http/Controllers/AuthController.php:136`).
2. **First-Year General Department Coordinator Equivalence**:
   - For S1/S2 classrooms, `Gen_Dept_Coordinator_Aided` (`branch = 'GEN_AIDED'`) and `Gen_Dept_Coordinator_Self_Finance` (`branch = 'GEN_SF'`) act as HODs over first-year classrooms of Aided (`CE`, `ME`, `EEE`) and Self-Financing (`EL`, `CT`, `AU`) branches respectively (`routes/web.php:125,236-260`, `app/Http/Controllers/DataController.php:1425-1520`, `app/Http/Controllers/R26DataController.php:28-65`).
3. **Database Lookup for Reports & Approvals**:
   - When generating department headers/signatures (e.g., `ConsolidatedCiaReportController::getConsolidatedCiaData`, `app/Http/Controllers/ConsolidatedCiaReportController.php:134-139`) or routing staff leave requests (`StaffLeaveController::submitLeave`, `app/Http/Controllers/StaffLeaveController.php:126-149`), the system queries `staff_profiles` where `branch = $branchCode` and `(designation = 'HOD' OR designation LIKE '%Head of Department%')` (or `Gen_Dept_Coordinator_*` for `GEN_AIDED`/`GEN_SF`).

### 2.3.3 How Subject-Teacher Status Is Determined
A staff member's assignment to teach and evaluate a specific subject is determined through **three layered mechanisms**:

1. **Primary Database Mapping (`subject_staff_assignments` joined with `batch_subjects`)**:
   - `batch_subjects` (`database/migrations/2026_06_22_135148_create_batch_subjects_table.php:14-24`, `app/Models/BatchSubject.php:9-16`) defines each course (`id`, `classroom_id`, `semester`, `subject_code`, `subject_name`, `subject_type`, `syllabus_revision_code`).
   - `subject_staff_assignments` (`database/migrations/2026_06_22_135226_create_subject_staff_assignments_table.php:14-21`) links `batch_subject_id` to `staff_mobile_no` (`staff_profiles.mobile_no`).
   - Assigned by HODs via `POST /api/hod/assign-subject-staff` (`DataController::assignSubjectStaff`, `app/Http/Controllers/DataController.php:1388-1420`) or `POST /api/r26/hod/assign-subject-staff` (`R26DataController::assignSubjectStaff`, `app/Http/Controllers/R26DataController.php:196-235`).
2. **Branch-Staff Fallback in Classroom Controllers (`ClassroomController.php:31-40`)**:
   - In `ClassroomController::uploadSyllabus` (`app/Http/Controllers/ClassroomController.php:31-40`), access is granted if a row exists in `subject_staff_assignments` for `($subjectId, $userId)`, OR if `$userRole` is in `['HOD', 'Principal']`, OR if `$userRole` is in `['Lecturer', 'Demonstrator', 'Workshop_Instructor', 'Tradesman', 'Trade_Instructor', 'Physical_Instructor']` and `strtoupper($userBranch) === strtoupper($batchSubject->classroom->branch)`.
3. **JSON Timetable Slot Matching (`storage/app/timetables/{classroom_id}.json`, `MentoringController::showStaffMobileDashboard`, `app/Http/Controllers/MentoringController.php:2184-2474`)**:
   - In `MentoringController::showStaffMobileDashboard`, the system scans all timetable JSON files in `storage/app/timetables/*.json` (`app/Http/Controllers/MentoringController.php:2247-2253`).
   - A timetable period slot matches the logged-in staff (`$isStaffMatched`, `app/Http/Controllers/MentoringController.php:2184-2245`) if:
     - The staff is assigned to that `subject_code` and `classroom_id` in `subject_staff_assignments` (`app/Http/Controllers/MentoringController.php:2188-2193`), **OR**
     - The slot's `staff` field in the JSON timetable matches the staff member's `mobile_no` or normalized name tokens (ignoring honorifics `['fr', 'dr', 'mr', 'mrs', 'prof']`, `app/Http/Controllers/MentoringController.php:2214-2241`).
   - Any subject matched via timetable JSON that was not in `subject_staff_assignments` is dynamically merged into `$assignments` (`app/Http/Controllers/MentoringController.php:2450-2473`).

---

## 2.4 Exact Differences Between `Super_Admin`, `Principal`, and `Admin`

| Capability / Attribute | `Super_Admin` | `Principal` | `Admin` | Code Citations |
| :--- | :--- | :--- | :--- | :--- |
| **DB Storage (`staff_profiles.designation`)** | `'Super_Admin'` | `'Principal'` | `'Admin'` | `database/seeders/DatabaseSeeder.php:23,33,63` |
| **No `is_admin` Flag in DB** | Uses `designation` & `Session::get('userRole')` | Uses `designation` & `Session::get('userRole')` | Uses `designation` & `Session::get('userRole')` | `app/Http/Controllers/AuthController.php:133` |
| **Self-Registration Allowed (`/register/staff`)** | **No** (Not in `#regStaffDesig` dropdown) | **Yes** (Singleton check; **Auto-Approved** on registration) | **No** (Not in `#regStaffDesig` dropdown) | `resources/views/login.blade.php:383-398`, `app/Http/Controllers/AuthController.php:345-350,379` |
| **Default Landing Route** | `/dashboard/superadmin` (`admin_control_desk.blade.php`) | `/dashboard/principal` (`principal_dashboard.blade.php`) | `/dashboard/admin` (`admin_control_desk.blade.php`) | `routes/web.php:29-32,96-121` |
| **Access to `/dashboard/superadmin`** | **Yes** (Exclusive) | **No** (Redirects to `/`) | **No** (Redirects to `/`) | `routes/web.php:108-115` |
| **Access to `/dashboard/admin`** | **Yes** | **No** (Uses `/dashboard/principal` instead) | **Yes** | `routes/web.php:117-121` |
| **Access to `/dashboard/principal`** | **Yes** | **Yes** | **No** (Only `Principal`, `Super_Admin`, `Chairman`) | `routes/web.php:96-102` |
| **Access to `/superadmin/show-users` (Plain-Text / Raw Credentials Table)** | **Yes (Exclusive)** | **No** | **No** | `routes/web.php:2432-2446`, `resources/views/admin_control_desk.blade.php:236-240` |
| **Live Online Staff Monitor Panel (`#panelLiveStaff` in `admin_control_desk.blade.php`)** | **Yes** (Sidebar & Audit button gated by `session('userRole') === 'Super_Admin'`) | **Yes** (Via `principal_dashboard.blade.php` & `ExecutiveControlDeskController`) | **Hidden in UI** on `admin_control_desk.blade.php` (`@if(session('userRole') === 'Super_Admin')`), though backend API `ExecutiveControlDeskController::checkAccess` permits `'Admin'` | `resources/views/admin_control_desk.blade.php:218,1024,1091,1587`, `app/Http/Controllers/ExecutiveControlDeskController.php:16-19` |
| **Executive Control Desk APIs (`/api/executive/*`)** | **Yes** | **Yes** | **Yes** | `app/Http/Controllers/ExecutiveControlDeskController.php:16-19` |
| **Global User Management (`checkUserManagementPermission`)** | **Yes** | **Yes** | **Yes** | `app/Http/Controllers/DataController.php:629-631` |
| **Stage-3 Final Staff Leave Approval & Stage-3 CIA Approval** | **Yes** | **Yes** (Primary designated authority) | **Yes** | `app/Http/Controllers/StaffLeaveController.php:281-283`, `app/Http/Controllers/ConsolidatedCiaReportController.php:1058` |
| **Classroom Syllabus Upload Override (`ClassroomController::uploadSyllabus`)** | **No** (Unless assigned or matching branch) | **Yes** (`in_array($userRole, ['HOD', 'Principal'])`) | **No** | `app/Http/Controllers/ClassroomController.php:38` |
| **Parent Portal Preview Bypass (`GET /parent/dashboard/{regNo}`)** | **Yes** | **Yes** | **No** (`['Tutor', 'HOD', 'Lecturer', 'Principal', 'Super_Admin']`) | `app/Http/Controllers/ParentDashboardController.php:124-125` |

---

## 2.5 Aided vs. Self-Financing (SF) Stream Architecture

### 2.5.1 How Stream (Aided vs. SF) Is Determined for Branches, Staff, and Students
The institution operates 6 engineering diploma programs and 2 first-year general departments split strictly into two streams:

1. **Aided Stream Branches**:
   - **Engineering Branches**:
     - `'CE'` (Civil Engineering)
     - `'ME'` (Mechanical Engineering)
     - `'EEE'` (Electrical & Electronics Engineering)
   - **First-Year General Department**:
     - `'GEN_AIDED'` (General Department Aided — manages S1 & S2 classrooms for `CE`, `ME`, and `EEE`) (`app/Http/Controllers/DataController.php:1430-1445`, `app/Http/Controllers/R26DataController.php:28-35`, `app/Http/Controllers/PrincipalDashboardController.php:29-31`).
2. **Self-Financing (SF) Stream Branches**:
   - **Engineering Branches**:
     - `'EL'` / `'ECE'` (Electronics Engineering)
     - `'CT'` / `'CS'` (Computer Engineering)
     - `'AU'` / `'AE'` (Automobile Engineering)
   - **First-Year General Department**:
     - `'GEN_SF'` (General Department Self-Financing — manages S1 & S2 classrooms for `EL`, `CT`, and `AU`) (`app/Http/Controllers/DataController.php:1430-1445`, `app/Http/Controllers/R26DataController.php:28-35`, `app/Http/Controllers/PrincipalDashboardController.php:32-34`).
3. **Code-Level Stream Helper Functions**:
   - **`StaffAttendanceMobileController` (`app/Http/Controllers/StaffAttendanceMobileController.php:55-69,180-196`)**:
     - Defines `$sfBranches = ['EL', 'ECE', 'CT', 'CS', 'AU', 'AE', 'GEN_SF', 'SF', 'ELECTRONICS', 'COMPUTER', 'AUTOMOBILE']`.
     - Determines `$isSfStaff` by checking if `strtoupper(trim($staff->branch ?? $staff->department))` is in `$sfBranches`, or contains `'SF'` / `'SELF'`, or if `$role` is in `['Academic_Coordinator', 'Academic Coordinator', 'Academic_Coordinator_SF', 'Gen_Dept_Coordinator_Self_Finance']`.
   - **`SfOfficeController::getSfStaffQuery` (`app/Http/Controllers/SfOfficeController.php:36-61`)**:
     - Filters `StaffProfile` where `UPPER(TRIM(branch))` is in `['EL', 'ECE', 'AU', 'AE', 'CT', 'CS', 'GEN_SF', 'SF']` or `LIKE '%ELECTRONICS%'`, `'%AUTOMOBILE%'`, `'%COMPUTER%'`, `'%SELF%'`, `'%SF%'`, while excluding `['Super_Admin', 'Principal', 'Chairman', 'Admin', 'SF_Office']` and excluding `'GEN_AIDED'`.
   - **`StaffLeaveController::isAidedBranch` (`app/Http/Controllers/StaffLeaveController.php:22-30`)**:
     - Checks `in_array(strtoupper(trim($dept)), ['CE', 'ME', 'EEE', 'GEN_AIDED', 'CIVIL', 'MECHANICAL', 'ELECTRICAL']) || str_contains($d, 'AIDED')`.
   - **Students**:
     - A student's stream is determined implicitly by `students.branch` (`'CE'`, `'ME'`, `'EEE'` = Aided; `'EL'`, `'CT'`, `'AU'` = Self-Financing) and in S1/S2 by whether their classroom is managed under `GEN_AIDED` or `GEN_SF` (`app/Http/Controllers/DataController.php:1430-1445`).

### 2.5.2 Features, Workflows & Rules That Differ Between Aided and Self-Financing (SF)

| Feature / Subsystem | Aided Stream (`CE`, `ME`, `EEE`, `GEN_AIDED`) | Self-Financing Stream (`EL`, `CT`, `AU`, `GEN_SF`) | Code Citations |
| :--- | :--- | :--- | :--- |
| **First-Year (S1/S2) General Department Governance** | Managed by `Gen_Dept_Coordinator_Aided` (`branch = 'GEN_AIDED'`) at `/dashboard/general-coordinator-aided` | Managed by `Gen_Dept_Coordinator_Self_Finance` (`branch = 'GEN_SF'`) at `/dashboard/general-coordinator-sf` | `routes/web.php:236-260`, `app/Http/Controllers/DataController.php:1430-1445`, `app/Http/Controllers/R26DataController.php:28-65` |
| **Stream-Level Academic Coordinator** | None (HODs report directly to Principal) | Dedicated **SF Academic Coordinator** (`/dashboard/academic-coordinator`, resolved via `StaffProfile::isSfAcademicCoordinator` or designation `Academic_Coordinator*`) | `routes/web.php:262-273`, `app/Models/StaffProfile.php:66-80`, `resources/views/academic_coordinator_dashboard.blade.php:636-641` |
| **Dedicated Stream Administrative Office Console (`SfOfficeController`)** | None | **SF Office Console** (`/dashboard/sf-office`, `/api/sf-office/*`) manages SF staff directory, leave quotas, CCL credits, manual time punches, and monthly/yearly attendance reports | `routes/web.php:2463-2492`, `app/Http/Controllers/SfOfficeController.php:18-981` |
| **Mobile Biometric Face + Smile Liveness + GPS Geofence Time Punch** | **Disabled / Blocked** (`showMobilePunchScreen` and `verifyAndPunch` reject non-SF staff with `"Biometric GPS Time Punch is enabled exclusively for Self-Financing (SF) stream staff."`) | **Mandatory / Enabled** (`/staff/attendance/mobile`, `/api/staff/attendance/*`, writes to `sf_staff_face_registrations` & `sf_staff_time_punches`, late threshold `09:15`, early-out `16:00`) | `app/Http/Controllers/StaffAttendanceMobileController.php:55-69,180-196`, `app/Http/Controllers/MentoringController.php:1975-1979` |
| **Compensatory Casual Leave (CCL) Credits (`sf_staff_ccl_credits`)** | Not tracked in `sf_staff_ccl_credits` | Tracked in `sf_staff_ccl_credits` (earned via holiday/Saturday biometric punches or SF Office credit grants; default validity 60 days via `sf_office_ccl_validity_days`; annual CL quota 15 days via `sf_office_annual_cl_quota`) | `database/migrations/2026_10_08_000001_create_sf_office_tables.php:41-80`, `app/Http/Controllers/SfOfficeController.php:405-550` |
| **Staff Leave Approval Workflow (`StaffLeaveController`)** | `StaffLeaveController::isAidedBranch` helper exists (`app/Http/Controllers/StaffLeaveController.php:22-30`), and `staff_leave_requests` has columns for `office_status`, `hod_status`, `coordinator_status`, `principal_status` | Multi-stage pipeline: Staff submits -> SF Office verification (`office_status`, `SfOfficeController::verifyLeaveRequest`, `app/Http/Controllers/SfOfficeController.php:197-265`) -> Stage 1 HOD (`Pending_HOD`) -> Stage 2 SF Academic Coordinator (`Pending_Coordinator`) -> Stage 3 Principal (`Pending_Principal` -> `Approved`) | `app/Http/Controllers/StaffLeaveController.php:22-30,115-333`, `app/Http/Controllers/SfOfficeController.php:197-265` |
| **Principal Dashboard Stream Analytics** | Grouped under Aided Programs (`CE`, `ME`, `EEE`, `GEN_AIDED`) | Grouped under Self-Financing Programs (`EL`, `CT`, `AU`, `GEN_SF`) | `app/Http/Controllers/PrincipalDashboardController.php:28-35` |

### 2.5.3 Features & Rules Shared Across Both Streams
- **Curriculum & Evaluation Engines**: Both Aided and Self-Financing branches share the exact same Revision 2021 (`class_management`) and Revision 2026 (`r26_class_management`) virtual classrooms, CIA calculation rules, CO/PO attainment engines (`AttainmentService`), series exams, online MCQ tests (`TestEngineController`), and SBTE exam eligibility/condonation rules (`TutorSpecialAttendanceController::evaluateEligibility`, `app/Http/Controllers/TutorSpecialAttendanceController.php:102-200`).
- **Mentoring, Activity Points & Parent Portal**: Shared identically across all 6 branches (`MentoringController`, `ActivityPointsController`, `ParentDashboardController`).

---

## 2.6 Exhaustive Sources of Designation & Branch Dropdowns

### 2.6.1 Public Login & Registration View (`resources/views/login.blade.php`)
1. **Student Self-Registration Branch Select (`#regStudentBranch`, `resources/views/login.blade.php:322-329`)**:
   - `value="EL"` -> `Electronics Engineering (EL)`
   - `value="ME"` -> `Mechanical Engineering (ME)`
   - `value="CE"` -> `Civil Engineering (CE)`
   - `value="EEE"` -> `Electrical & Electronics Engineering (EEE)`
   - `value="CT"` -> `Computer Engineering (CT)`
   - `value="AU"` -> `Automobile Engineering (AU)`
2. **Staff Self-Registration Branch Select (`#regStaffBranch`, `resources/views/login.blade.php:369-379`)**:
   - `value="EL"` -> `Electronics Engineering (EL)`
   - `value="ME"` -> `Mechanical Engineering (ME)`
   - `value="CE"` -> `Civil Engineering (CE)`
   - `value="EEE"` -> `Electrical & Electronics Engineering (EEE)`
   - `value="CT"` -> `Computer Engineering (CT)`
   - `value="AU"` -> `Automobile Engineering (AU)`
   - `value="GEN_AIDED"` -> `General Department Aided (GEN_AIDED)`
   - `value="GEN_SF"` -> `General Department Self Finance (GEN_SF)`
   - `value="Admin"` -> `Administration`
3. **Staff Self-Registration Designation Select (`#regStaffDesig`, `resources/views/login.blade.php:383-397`)**:
   - `value="HOD"` -> `Head of the Department (HOD)`
   - `value="Gen_Dept_Coordinator_Aided"` -> `Gen Dept Coordinator Aided`
   - `value="Gen_Dept_Coordinator_Self_Finance"` -> `Gen Dept Coordinator Self Finance`
   - `value="Lecturer"` -> `Lecturer`
   - `value="Demonstrator"` -> `Demonstrator`
   - `value="Physical_Instructor"` -> `Physical Instructor`
   - `value="Trade_Instructor"` -> `Trade Instructor`
   - `value="Tradesman"` -> `Tradesman`
   - `value="Laboratory_Assistant"` -> `Laboratory Assistant`
   - `value="Workshop_Instructor"` -> `Workshop Instructor`
   - `value="Workshop_Superintendent"` -> `Workshop Superintendent`
   - `value="Principal"` -> `Principal`
   - `value="Chairman"` -> `Chairman`

### 2.6.2 Executive Control Desk View (`resources/views/admin_control_desk.blade.php`)
1. **User Directory Role Filter (`#filterRole`, `resources/views/admin_control_desk.blade.php:875-894`)**:
   - `value=""` -> `All Roles`
   - `value="student"` -> `Students Only`
   - `value="Super_Admin"` -> `Super Admin`
   - `value="Chairman"` -> `Chairman`
   - `value="Admin"` -> `Admin`
   - `value="Principal"` -> `Principal`
   - `value="HOD"` -> `Head of Department (HOD)`
   - `value="Academic_Coordinator"` -> `Academic Coordinator (Self-Financing)`
   - `value="Gen_Dept_Coordinator_Aided"` -> `Gen Dept Coordinator Aided`
   - `value="Gen_Dept_Coordinator_Self_Finance"` -> `Gen Dept Coordinator Self Finance`
   - `value="Lecturer"` -> `Lecturers`
   - `value="Demonstrator"` -> `Demonstrators`
   - `value="Physical_Instructor"` -> `Physical Instructors`
   - `value="Trade_Instructor"` -> `Trade Instructors`
   - `value="Tradesman"` -> `Tradesmen`
   - `value="Laboratory_Assistant"` -> `Laboratory Assistants`
   - `value="Workshop_Instructor"` -> `Workshop Instructors`
   - `value="Workshop_Superintendent"` -> `Workshop Superintendent`
2. **Edit Staff Modal Designation Select (`#editStaffDesig`, `resources/views/admin_control_desk.blade.php:1149-1165`)**:
   - `value="Principal"` -> `Principal`
   - `value="HOD"` -> `Head of Department (HOD)`
   - `value="Academic_Coordinator"` -> `Academic Coordinator (Self-Financing)`
   - `value="Gen_Dept_Coordinator_Aided"` -> `Gen Dept Coordinator Aided`
   - `value="Gen_Dept_Coordinator_Self_Finance"` -> `Gen Dept Coordinator Self Finance`
   - `value="Lecturer"` -> `Lecturer`
   - `value="Demonstrator"` -> `Demonstrator`
   - `value="Physical_Instructor"` -> `Physical Instructor`
   - `value="Trade_Instructor"` -> `Trade Instructor`
   - `value="Tradesman"` -> `Tradesman`
   - `value="Laboratory_Assistant"` -> `Laboratory Assistant`
   - `value="Workshop_Instructor"` -> `Workshop Instructor`
   - `value="Workshop_Superintendent"` -> `Workshop Superintendent`
   - `value="Super_Admin"` -> `Super Admin`
   - `value="Admin"` -> `Admin`
3. **Direct Register Staff Modal Designation Select (`#directRegStaffDesig`, `resources/views/admin_control_desk.blade.php:1336-1349`)**:
   - `value="HOD"` -> `Head of Department (HOD)`
   - `value="Gen_Dept_Coordinator_Aided"` -> `Gen Dept Coordinator Aided`
   - `value="Gen_Dept_Coordinator_Self_Finance"` -> `Gen Dept Coordinator Self Finance`
   - `value="Lecturer"` -> `Lecturer` (selected)
   - `value="Demonstrator"` -> `Demonstrator`
   - `value="Physical_Instructor"` -> `Physical Instructor`
   - `value="Trade_Instructor"` -> `Trade Instructor`
   - `value="Tradesman"` -> `Tradesman`
   - `value="Laboratory_Assistant"` -> `Laboratory Assistant`
   - `value="Workshop_Instructor"` -> `Workshop Instructor`
   - `value="Workshop_Superintendent"` -> `Workshop Superintendent`
   - `value="Principal"` -> `Principal`
4. **Inline Table Row Designation Updater (`updateDesignation(id, value)`, `resources/views/admin_control_desk.blade.php:1807-1823`)**:
   - `value="Super_Admin"` -> `Super Admin`
   - `value="Admin"` -> `Admin`
   - `value="Principal"` -> `Principal`
   - `value="HOD"` -> `HOD`
   - `value="Gen_Dept_Coordinator_Aided"` -> `Gen Dept Coordinator Aided`
   - `value="Gen_Dept_Coordinator_Self_Finance"` -> `Gen Dept Coordinator Self Finance`
   - `value="Tutor"` -> `Tutor`
   - `value="Lecturer"` -> `Lecturer`
   - `value="Demonstrator"` -> `Demonstrator`
   - `value="Physical_Instructor"` -> `Physical Instructor`
   - `value="Trade_Instructor"` -> `Trade Instructor`
   - `value="Tradesman"` -> `Tradesman`
   - `value="Laboratory_Assistant"` -> `Laboratory Assistant`
   - `value="Workshop_Instructor"` -> `Workshop Instructor`
   - `value="Workshop_Superintendent"` -> `Workshop Superintendent`

### 2.6.3 HOD Dashboard View (`resources/views/hod_dashboard.blade.php`)
1. **Departmental Directory Role Filter (`#filterRole`, `resources/views/hod_dashboard.blade.php:417-427`)**:
   - `value=""` -> `All Roles`
   - `value="student"` -> `Students Only`
   - `value="Lecturer"` -> `Lecturers Only`
   - `value="Demonstrator"` -> `Demonstrators Only`
   - `value="Physical_Instructor"` -> `Physical Instructors Only`
   - `value="Trade_Instructor"` -> `Trade Instructors Only`
   - `value="Tradesman"` -> `Tradesman Only`
   - `value="Laboratory_Assistant"` -> `Laboratory Assistants Only`
   - `value="Workshop_Instructor"` -> `Workshop Instructors Only`
2. **HOD Direct Staff Registration Select (`#directRegStaffDesig`, `resources/views/hod_dashboard.blade.php:1200-1208`)**:
   - `value="Lecturer"` -> `Lecturer` (selected)
   - `value="Demonstrator"` -> `Demonstrator`
   - `value="Physical_Instructor"` -> `Physical Instructor`
   - `value="Trade_Instructor"` -> `Trade Instructor`
   - `value="Tradesman"` -> `Tradesman`
   - `value="Laboratory_Assistant"` -> `Laboratory Assistant`
   - `value="Workshop_Instructor"` -> `Workshop Instructor`

### 2.6.4 SF Academic Coordinator Dashboard View (`resources/views/academic_coordinator_dashboard.blade.php`)
1. **Mobile & Desktop Role Filter (`#mobileFilterRole` at `resources/views/academic_coordinator_dashboard.blade.php:290-296` and `#filterRole` at `resources/views/academic_coordinator_dashboard.blade.php:645-651`)**:
   - `value=""` -> `All Roles`
   - `value="HOD"` -> `HOD`
   - `value="Lecturer"` -> `Lecturer`
   - `value="Demonstrator"` -> `Demonstrator`
   - `value="Trade_Instructor"` -> `Trade Instructor`
2. **SF Branch Filter (`#filterBranch`, `resources/views/academic_coordinator_dashboard.blade.php:281-287,635-641`)**:
   - `value=""` -> `All SF Departments (EL, AU, CT, GEN SF)`
   - `value="EL"` -> `Electronics (EL)`
   - `value="AU"` -> `Automobile (AU)`
   - `value="CT"` -> `Computer Engineering (CT)`
   - `value="GEN_SF"` -> `General SF (GEN_SF)`

---

# Section 2b: Regulations Architecture (SBTE Kerala R21 vs R26)

This section documents the complete code-level implementation of the **SBTE Kerala Revision 2021 (`R21` / `REV2021`)** and **Revision 2026 (`R26` / `REV2026`)** academic regulations across all controllers, Eloquent models, database migrations, and route dispatchers in `carmel-linx-laravel/`.

---

## 2b.1 Master Side-by-Side Comparison: R21 vs R26

| Dimension | Revision 2021 (`R21` / `REV2021`) | Revision 2026 (`R26` / `REV2026`) | Primary Code Citations |
| :--- | :--- | :--- | :--- |
| **Classroom Registry Table** | `class_management` (`ClassManagement`) | `r26_class_management` (`R26ClassManagement`) | `app/Models/ClassManagement.php:14`, `app/Models/R26ClassManagement.php:14`, `database/migrations/2026_06_21_000002_create_class_management_table.php:14`, `database/migrations/2026_07_19_154513_create_r26_class_management_table.php:14` |
| **Batch Subject Revision Tag** | `batch_subjects.syllabus_revision_code = 'R-2021'` (default) or `'REV2021'` | `batch_subjects.syllabus_revision_code = 'REV2026'` or `'R26'` | `database/migrations/2026_06_26_182643_add_syllabus_revision_code_to_batch_subjects.php:15`, `app/Models/BatchSubject.php:27, 46-54` |
| **Program Outcomes (POs) & PSOs** | **7 POs** (`PO1`–`PO7`) + **2–3 PSOs** (`PSO1`–`PSO3`) | **11 POs** (`PO1`–`PO11`) + **2–3 PSOs** (`PSO1`–`PSO3`) *(Exception: R26 English `1001` uses `PO1`–`PO7`)* | `app/Http/Controllers/ClassroomController.php:4076-4090`, `app/Http/Controllers/R26ClassroomController.php:3191-3202`, `app/Http/Controllers/ProgramAttainmentController.php:80-108`, `app/Http/Controllers/R26VirtualClassroomEnglishController.php:1183-1187` |
| **Theory CIA : ESE Split** | **50 CIA + 75 ESE = 125 Total** *(Note: `ConsolidatedCiaReportController` displays ESE max as `100` for R21 Theory)* | **40 CIA + 60 ESE = 100 Total** | `app/Services/AttainmentService.php:196-205`, `app/Http/Controllers/ClassroomController.php:3381, 4160`, `app/Http/Controllers/R26ClassroomController.php:2729, 2934`, `app/Http/Controllers/ConsolidatedCiaReportController.php:677` |
| **Theory CIA Breakdown** | **Formative (Assignments)**: Best 2 of 4 COs (each `/20`) averaged = **20M**<br>**Summative (Series Tests)**: Best 2 of 4 COs (each `/20`) averaged = **20M**<br>**Attendance**: Proportional = **10M** | **Attendance**: Step-slab = **5M**<br>**Self-Learning (CA1–CA4)**: Avg of 4 COs (each `/15`: Assignment 5 + MCQ 5 + Case Study/Act3 5) = **15M**<br>**Series Exams**: Avg of Series 1 (`/50`: CO1 25 + CO2 25) & Series 2 (`/50`: CO3 25 + CO4 25) scaled to **20M** | `app/Http/Controllers/ClassroomController.php:3289-3383`, `app/Models/R26TheoryEvaluation.php:19-33`, `app/Http/Controllers/R26ClassroomController.php:2595-2729` |
| **Theory Pass Minimums** | **CIA**: `>= 20 / 50` (40%)<br>**ESE**: Grade `S`–`E` (`>= 40%`) | **CIA**: No standalone CIA cutoff in `R26ClassroomController` (`>= 16 / 40` in `ConsolidatedCiaReportController:801`)<br>**ESE**: `>= 24 / 60` (40%) or Grade `S`–`E`<br>**Combined**: `>= 40 / 100` (40%) | `app/Http/Controllers/ClassroomController.php:3383`, `app/Http/Controllers/R26ClassroomController.php:2945-2965`, `app/Http/Controllers/ConsolidatedCiaReportController.php:801` |
| **Practical / Lab CIA : ESE Split** | **75 CIA + 50 ESE = 125 Total** | **60 CIA + 40 ESE = 100 Total** | `app/Http/Controllers/VirtualClassroomPracticalController.php:534, 1823`, `app/Http/Controllers/R26VirtualClassroomPracticalController.php:98, 108` |
| **Practical / Lab CIA Breakdown** | **Continuous Lab Work**: Avg of experiments (each `/37.5` across 5 rubrics: Rough 5, Fair 7.5, Obs/Prep 7.5, Proc 7.5, Viva 10) = **37.5M**<br>**Open-Ended / Micro-Project**: **7.5M**<br>**Series Tests**: Avg of Test 1 (`/15`) & Test 2 (`/15`) = **15M**<br>**Attendance**: Proportional = **15M** | **Day Work (Table 2.2)**: Avg of experiments (each `/50` across 6 rubrics: `10+10+5+10+10+5`) scaled to **30M**<br>**Open-Ended Project (Table 2.3)**: `/50` across 5 rubrics (`10x5`) scaled to **10M** *(Combined CE = 40M)*<br>**Series Exams (Table 3.1)**: Avg of S1 (`/40`) & S2 (`/40`) across 5 rubrics (`10+15+5+5+5`) scaled to **15M**<br>**Attendance (Table 2.1)**: Step-slab = **5M** | `app/Http/Controllers/VirtualClassroomPracticalController.php:491-536, 618-623, 1174-1208`, `app/Http/Controllers/R26VirtualClassroomPracticalController.php:47-98, 887-959` |
| **Practicum (Integrated Theory + Lab)** | *Not a separate classroom type in R21* | **Basic Science Practicum** (`2001`/`2002`/`2003`, Physics/Chemistry): **40 CIA + 60 ESE (Theory only) = 100 Total**<br>**Program Core Practicum** (`3:0:3:0`, 90h, 4.5 cr): **40 CIA + 100 ESE (60 Theory + 40 Practical) = 140 Total**<br>**CIA (40M)**: Att **5M** + Self-Learning **5M** + Continuous Practical (Table 2.2 `/50`) **10M** + Theory Series (`/50`) **10M** + Practical Series (Table 3.1 `/40`) **10M** | `app/Http/Controllers/R26VirtualClassroomPracticumController.php:309-585, 1918-1957, 4866-4884` |
| **Drawing / Engineering Graphics** | **75 CIA + 50 ESE = 125 Total**<br>Sheets (`/100`: `50+50` -> **37.5M**) + Open-Ended (**7.5M**) + 2 Series Tests (`/100`: `40+30+20+10` -> **15M**) + Attendance (**15M**)<br>*(Exception: AU `3055` / ID `110` -> R21 Theory)* | **Active Model (`r26_drawing_evaluations`)**: **40 CIA + 60 ESE = 100 Total**<br>Attendance (**5M**) + Self-Learning CA1–CA4 (each `/15` -> **15M**) + Series 1 & 2 (each `/40` -> `/20` -> **20M**)<br>**Legacy Lab Tables (`r26_drawing_slot_evaluations` etc.)**: **60 CIA + 40 ESE = 100** | `app/Http/Controllers/R21VirtualClassroomDrawingController.php:23-44, 158-255`, `app/Http/Controllers/R26VirtualClassroomDrawingController.php:132-237, 857-1023`, `app/Models/R26DrawingEvaluation.php:12-95` |
| **Mechanical Workshop** | **75 CIA + 50 ESE = 125 Total**<br>6 sections split into Batch 1 (`Fitting`, `Smithy`, `Welding`) & Batch 2 (`Machine shop`, `Sheet metal`, `Foundry`).<br>Work (`/20` -> **37.5M**) + Record (`Rough 10 + Fair 10 = 20` -> **7.5M**) + Trade Tests (`3 x /15` avg -> **15M**) + Attendance (**15M**) | Dispatched to `R26VirtualClassroomPracticalController` (no separate `R26Workshop` controller) | `app/Http/Controllers/R21VirtualClassroomWorkshopController.php:25-118, 251-360`, `app/Http/Controllers/DataController.php:1419-1427` |
| **Major Project** | **75 CIA + 50 ESE = 125 Total (Ratio 3:2, 4.0 Cr, 5 COs)**<br>**CIA**: Formative Diary (**30M**) + Summative Dept Review (**30M**) + Attendance (**15M**)<br>**ESE**: 8 rubrics (`10+5+7.5+2.5+7.5+7.5+5+5` = **50M**)<br>*(Exception: CT `5002` / ID `147` -> R21 Theory)* | *Not yet instantiated for R26 (S5/S6)* | `app/Http/Controllers/R21VirtualClassroomMajorProjectController.php:20-69, 316-344, 494-555` |
| **Seminar** | **75 CIA + 0 ESE = 75 Total (1.5 Cr, Sem 5, 3 COs)**<br>Relevance (**7.5M**) + Literature (**7.5M**) + Presentation (**37.5M**) + Interaction (**7.5M**) + Report (**7.5M**) + Attendance (**7.5M**). Multi-assessor averaged; requires `avg_report > 0` for completion. | *Not yet instantiated for R26 (S5)* | `app/Http/Controllers/R21VirtualClassroomSeminarController.php:20-30, 214-250, 525-540, 1116-1200` |
| **English for Communication (`1001`)** | Handled as standard R21 Theory (`ClassroomController`) | **Dedicated `R26VirtualClassroomEnglishController` (`2:0:2:0`, 3.0 Cr)**:<br>**40 CIA + 60 ESE (Internal Lab Exam) = 100 Total**<br>**CIA**: Att (**5M**) + CA1 Self-Learning M1–M4 (`/10` -> **5M**) + CE M1–M4 (`/50` -> **10M**) + CA2/CA3 Practical Tests 1&2 (`/40` -> **10M**) + CA4/CA5 Series 1&2 (`/50` -> **10M**) | `app/Http/Controllers/R26VirtualClassroomEnglishController.php:21-30, 209-296`, `app/Models/R26EnglishEvaluation.php:115-144` |
| **Health & Physical Education (`1009`) / Life Skills** | Handled under R21 Practical/Lab | **Dedicated `R26VirtualClassroomHealthPhysicalController` (`0:0:2:0`, 1.0 Cr)**:<br>**60 CIA + 40 ESE = 100 Total**<br>**CIA**: Att (**5M**) + 8 Activities (`/50` across 5 criteria -> **30M**) + 2 Fitness Tests (`/40` each -> `7.5 + 7.5 =` **15M**) + Logbook (**10M** defined, omitted in sum at `line 201` -> effective max **50M** unless overridden)<br>**ESE**: 4 components = **40M** | `app/Http/Controllers/R26VirtualClassroomHealthPhysicalController.php:60-110, 168-215, 474, 725-746` |
| **Attendance Mark Formula** | **Proportional Formula**:<br>- Theory (`/10`): `round(($pct / 100) * 10)` (nearest integer `1.0`)<br>- Practical / Drawing / Workshop / Project (`/15`): `round((($pct / 100) * 15) * 2) / 2` (nearest `0.5`)<br>- Seminar (`/7.5`): `round((($pct / 100) * 7.5) * 2) / 2` (nearest `0.5`) | **6-Tier Step-Slab Rubric (Max 5M across all R26 courses)**:<br>- `>= 90%`: **5.0M**<br>- `80% – 89.99%`: **4.0M**<br>- `75% – 79.99%`: **3.0M**<br>- `70% – 74.99%`: **2.0M**<br>- `65% – 69.99%`: **1.0M**<br>- `< 65%`: **0.0M** | `app/Services/AttainmentService.php:37-54`, `app/Models/R26TheoryEvaluation.php:84-94`, `app/Models/R26DrawingEvaluation.php:84-94`, `app/Models/R26EnglishEvaluation.php:115-125`, `app/Http/Controllers/R26VirtualClassroomPracticalController.php:47-55`, `app/Http/Controllers/R26VirtualClassroomPracticumController.php:316-323` |
| **Exam Eligibility & Condonation Cutoffs** | **Clause 10**:<br>- `>= 75.0%`: **Eligible** (Clause 10.1)<br>- `65.0% – 74.9%`: **Condonation** (Clause 10.2, Rs. 750 fee)<br>- `< 65.0%`: **Detained** (Clause 10.3, repeat semester) | **Rule 7**:<br>- Base `>= 75.0%` (**73.0%** with Menstrual Leave `-2%`; **70.0%** with PWD `-5%`): **Eligible** (Rule 7.1)<br>- `60.0% – (Threshold - 0.1)%`: **Regular Condonation** (Rule 7.3, Rs. 750 fee)<br>- `50.0% – 59.9%`: **Special Condonation** by DTE (one-time, passed `>=50%` courses, **Rs. 1500** fee, Rule 7.3)<br>- `< 50.0%`: **Detained** (repeat semester) | `app/Http/Controllers/TutorSpecialAttendanceController.php:98-201, 820, 835` |
| **CO Attainment Formula** | **Direct**: `0.30 * CIE_Level + 0.70 * ESE_Level` *(Seminar: `1.00 * CIE_Level`; Practical fallback: `1.00 * CIE_Level` if ESE not entered)*<br>**Overall CO**: `0.80 * Direct + 0.20 * Indirect` (Exit Survey)<br>**Attendance excluded** from CO CIE attainment | **Direct**: `0.30 * CIE_Level + 0.70 * ESE_Level` *(Exception: R26 English `1001` uses `0.40 * CIE_Level + 0.60 * ESE_Level`)*<br>**Overall CO**: `0.80 * Direct + 0.20 * Indirect`<br>**Attendance excluded** from CO CIE attainment | `app/Services/AttainmentService.php:59-325`, `app/Http/Controllers/R26ClassroomController.php:3110-3189`, `app/Http/Controllers/R26VirtualClassroomEnglishController.php:1114-1164` |

---

## 2b.2 Regulation Detection & Virtual Classroom Dispatch Mechanisms

The application determines whether a classroom, batch, or subject belongs to **R21** or **R26**, and routes it to one of **10 specialized virtual classroom controllers**, using five distinct detection layers:

### 1. Classroom Table Separation (`class_management` vs `r26_class_management`)
- **R21 Classrooms** are stored in `class_management` (`app/Models/ClassManagement.php:14`), while **R26 Classrooms** are stored in `r26_class_management` (`app/Models/R26ClassManagement.php:14`).
- In `TutorSpecialAttendanceController::detectScheme($classroom)` (`app/Http/Controllers/TutorSpecialAttendanceController.php:76-93`), the regulation is resolved in priority order:
  1. Checks `r26_class_management` for `$classroom->classroom_id` -> returns `'R26'` (`lines 80-83`).
  2. Checks if `$classroom->classroom_id` or `$classroom->batch_year` contains `'2026'`, `'R26'`, or `'REV2026'` -> returns `'R26'` (`lines 85-89`).
  3. Checks if any `batch_subjects` row for that `classroom_id` has `syllabus_revision_code IN ('REV2026', 'R26')` -> returns `'R26'` (`lines 90-91`).
  4. Otherwise returns `'R21'` (`line 92`).
- In `TutorController::getProgressReportData` (`app/Http/Controllers/TutorController.php:356-365`), a classroom is classified as `$isR26` if it was loaded from `r26_class_management`, if `classroom_id` contains `'2026'` or `'R26'`, or if `batch_year` starts with `'2026'`.

### 2. Subject-Level Revision & Formatting (`BatchSubject` & `syllabus_registry`)
- `batch_subjects.syllabus_revision_code` defaults to `'R-2021'` in `database/migrations/2026_06_26_182643_add_syllabus_revision_code_to_batch_subjects.php:15`, and is set to `'REV2026'` for R26 courses (`app/Http/Controllers/R26DataController.php:82, 224`).
- `BatchSubject::getFormattedSubjectCodeAttribute()` (`app/Models/BatchSubject.php:46-54`) prefixes raw 4-digit codes with `'REV2026-'` when `syllabus_revision_code === 'REV2026'`.
- `syllabus_registry` (`database/migrations/2026_06_21_000004_create_syllabus_registry_table.php:14-24`, `2026_08_12_000002_add_cia_ese_credits_to_syllabus_registry_table.php:14-21`) stores `revision_code`, `subject_code`, `subject_title`, `course_type` (`Theory`, `Practical`, `Practicum`, `Project`, `Seminar`), `credits`, `cia_marks`, and `ese_marks`.
- During R26 subject provisioning (`R26DataController::createBatchSubject`, `app/Http/Controllers/R26DataController.php:32-75`), the controller auto-detects `subject_type` from `syllabus_registry.course_type` or title keywords:
  - Contains `'practicum'` -> `'Practicum'` (`lines 39, 53`).
  - Contains `'lab'`, `'practical'`, `'workshop'`, `'drawing'`, `'graphics'`, or `'health'` -> `'Practical / Lab'` (`lines 42, 55-63`).
  - Default -> `'Theory'` (`line 34`).

### 3. Virtual Classroom Route Dispatcher (`routes/web.php:345-413`)
When a user navigates to `/classroom/{subjectId}`, the closure in `routes/web.php:345-413` inspects `BatchSubject` and dispatches as follows:
1. **R26 Branch** (`$batchSubject->syllabus_revision_code === 'REV2026'`, `line 350`):
   - **R26 Practicum**: If `stripos($sType, 'practicum') !== false` or `stripos($sName, 'practicum') !== false` -> `R26VirtualClassroomPracticumController::show` (`lines 355-357`).
   - **R26 Drawing / Graphics**: If `$sName` or `$sType` contains `'drawing'` or `'graphics'` -> `R26VirtualClassroomDrawingController::show` (`lines 359-364`).
   - **R26 Health & Physical Education / Life Skills**: If `$sName` contains `'health'`, `'physical'`, `'yoga'`, `'sports'`, or `'life skill'`, or `$sCode` contains `'1009'` -> `R26VirtualClassroomHealthPhysicalController::show` (`lines 366-374`).
   - **R26 Practical / Lab**: If `$sType === 'Practical / Lab'` or `stripos($sType, 'practical') !== false` or `stripos($sType, 'lab') !== false` -> `R26VirtualClassroomPracticalController::show` (`lines 376-378`).
   - **R26 English (`1001`)**: If `str_contains($sCode, '1001')` or `stripos($sName, 'English for Communication') !== false` -> `R26VirtualClassroomEnglishController::show` (`lines 380-382`).
   - **R26 Theory (Default)**: -> `R26ClassroomController::showClassroom` (`line 384`).
2. **R21 Branch** (`syllabus_revision_code !== 'REV2026'`, `lines 386-411`):
   - **R21 Drawing**: If `$sType === 'Drawing'` or `$sName` contains `'engineering graphics'` or `'drawing'`, **AND** `$sCode !== '3055'` and `$subjectId != 110` -> `R21VirtualClassroomDrawingController::show` (`lines 391-395`). *(Hard-coded exception: Automobile Engineering subject code `3055` / `batch_subjects.id == 110` "Production Drawing" is forced to R21 Theory, also enforced inside `R21VirtualClassroomDrawingController.php:41-44` and `ClassroomController.php:2978`).*
   - **R21 Workshop**: If `$sType === 'Workshop'` or `$sName` contains `'workshop'` -> `R21VirtualClassroomWorkshopController::show` (`lines 397-399`).
   - **R21 Major Project**: If (`$sType === 'Major Project'` or `$sType === 'Project'` or `$sName` contains `'major project'` or `'project'`) **AND** not `'project management'`, `$sCode !== '5002'`, and `$subjectId != 147` -> `R21VirtualClassroomMajorProjectController::show` (`lines 401-403`). *(Hard-coded exception: Computer Engineering subject code `5002` / `batch_subjects.id == 147` "Project Management and Software Engineering" is forced to R21 Theory, also enforced in `R21VirtualClassroomMajorProjectController.php:33-36` and `ClassroomController.php:2988`).*
   - **R21 Seminar**: If `$sType === 'Seminar'` or `$sName` contains `'seminar'` -> `R21VirtualClassroomSeminarController::show` (`lines 405-407`).
   - **R21 Theory & R21 Practical/Lab (Default)**: -> `ClassroomController::showClassroom` (`line 411`), which internally checks `$isPractical` (`lines 2977-2995`) and renders `virtual_classroom_practical` for R21 Practical/Lab (`line 3142`) or `virtual_classroom` for R21 Theory (`line 3682`).

### 4. Dedicated Direct Classroom Routes (`routes/web.php:416-672`)
In addition to `/classroom/{subjectId}`, direct routes exist for each specialized controller:
- `/r26/classroom/{subjectId}` -> `R26ClassroomController::showClassroom` (`routes/web.php:416`), which also self-redirects Practicum, Practical/Lab, Drawing, Health, and English `1001` subjects (`app/Http/Controllers/R26ClassroomController.php:41-69`).
- `/classroom/r26-practical/{subjectId}` -> `R26VirtualClassroomPracticalController::show` (`routes/web.php:467`), which self-redirects Drawing and Health (`1009`) subjects (`app/Http/Controllers/R26VirtualClassroomPracticalController.php:212-227`).
- `/classroom/r26-drawing/{subjectId}` -> `R26VirtualClassroomDrawingController::show` (`routes/web.php:493`).
- `/classroom/r26-health/{subjectId}` -> `R26VirtualClassroomHealthPhysicalController::show` (`routes/web.php:526`).
- `/classroom/r21-drawing/{subjectId}` -> `R21VirtualClassroomDrawingController::show` (`routes/web.php:543`).
- `/classroom/r21-workshop/{subjectId}` -> `R21VirtualClassroomWorkshopController::show` (`routes/web.php:558`).
- `/classroom/r21-major-project/{subjectId}` -> `R21VirtualClassroomMajorProjectController::show` (`routes/web.php:575`).
- `/classroom/r21-seminar/{subjectId}` -> `R21VirtualClassroomSeminarController::show` (`routes/web.php:596`).
- `/classroom/r26-practicum/{subjectId}` -> `R26VirtualClassroomPracticumController::show` (`routes/web.php:613`).
- `/classroom/r26-english/{subjectId}` -> `R26VirtualClassroomEnglishController::show` (`routes/web.php:657`).

### 5. Dashboard Classroom Link Resolver (`DataController::resolveClassroomUrl`, `app/Http/Controllers/DataController.php:1376-1444`)
When generating subject cards for Lecturer, Demonstrator, HOD, Tutor, and Principal dashboards, `DataController::resolveClassroomUrl($subject)` inspects `syllabus_revision_code`, `subject_type`, `subject_name`, and `subject_code` using the exact same rules (`1001` -> `/classroom/r26-english/{id}`, `1009` -> `/classroom/r26-health/{id}`, `3055`/`110` -> `/classroom/{id}`, `5002`/`147` -> `/classroom/{id}`, etc.) so staff click directly into the appropriate virtual classroom URL.

---

## 2b.3 Per-Course-Type Detailed Breakdown (Controllers, Models, Tables, Formulas)

### 1. R21 Theory Courses
- **Controllers**: `ClassroomController` (`app/Http/Controllers/ClassroomController.php`), `CourseFileController` (`app/Http/Controllers/CourseFileController.php`).
- **Models & Database Tables**:
  - `AcademicMark` -> `academic_marks` (`app/Models/AcademicMark.php:12`, `database/migrations/2026_06_21_000008_create_academic_marks_table.php:14-27`): stores per-student, per-CO assessment rows with `reg_no`, `subject_code`, `evaluation_type` (`'Formative'`, `'Summative'`, `'Series_1'`, `'Series_2'`, `'Assignment_1'`, `'Assignment_2'`, `'Assignment'`, `'MCQ'`), `co_tag` (`'CO1'`..`'CO4'`), `marks_obtained`, `max_marks` (default `20`), `entered_by`.
  - `CourseFile` -> `course_files` (`app/Models/CourseFile.php:11`, `database/migrations/2026_06_22_150235_create_course_files_table.php:14-31`, `2026_09_19_030500_add_attainment_settings_to_course_files_table.php:14-23`): stores `batch_subject_id`, `syllabus_code`, `co_po_mapping` (JSON), `attainment_target_pct` (default `50`), `level_1_threshold` (`50`), `level_2_threshold` (`60`), `level_3_threshold` (`70`), `direct_weight_cie` (`30`), `direct_weight_ese` (`70`), `overall_weight_direct` (`80`), `overall_weight_indirect` (`20`), `po_target_level` (`1.80`).
  - `CfCourseFile` -> `cf_course_files` (`app/Models/CfCourseFile.php`, `database/migrations/2026_06_25_070632_create_nba_course_file_tables.php:16-30`, `2026_06_26_121136_add_attainment_settings_to_cf_course_files_table.php:14-24`): NBA course file header table with identical attainment settings plus `cf_course_outcomes`, `cf_co_po_mappings`, `cf_co_pso_mappings`, and `cf_course_file_documents`.
  - `LessonPlan` -> `lesson_plans` (`database/migrations/2026_06_22_151808_create_lesson_plans_table.php:14-27`).
  - `SubjectOfficialAttendance` -> `subject_official_attendances` (`database/migrations/2026_10_09_120000_create_subject_official_attendances_table.php:15-36`).
  - `StudentBoardGrade` -> `student_board_grades` (`database/migrations/2026_06_24_210434_create_student_board_grades_table.php:14-24`).
- **CIA & ESE Evaluation Structure (Max 50 CIA + 75 ESE = 125 Total)**:
  1. **Formative Assessment (Assignments — Max 20M)**:
     - 4 Course Outcomes (`CO1`, `CO2`, `CO3`, `CO4`), each scored out of **20M** (`ClassroomController.php:3262-3288, 3725`).
     - **Best 2 out of 4 COs** are sorted descending and averaged: `$assignAvg = round(($assignScores[0] + $assignScores[1]) / 2.0, 1)` (`ClassroomController.php:3289-3298`; also replicated in `ConsolidatedCiaReportController.php:273-286`).
  2. **Summative Assessment (Series / Written Tests — Max 20M)**:
     - 4 Course Outcomes (`CO1`, `CO2`, `CO3`, `CO4`), each scored out of **20M** (`ClassroomController.php:3300-3316, 3726`).
     - **Best 2 out of 4 COs** are sorted descending and averaged: `$summAvg = round(($summScores[0] + $summScores[1]) / 2.0, 1)` (`ClassroomController.php:3317-3326`; also in `ConsolidatedCiaReportController.php:288-301`).
  3. **Attendance Marks (Max 10M)**:
     - Attendance % is resolved from `subject_official_attendances` (`final_percentage` / `final_mark`) if uploaded, else from `student_attendance`, else from `class_logs_attendance` (`ClassroomController.php:3331-3377`).
     - Proportional formula via `AttainmentService::calculateR21AttendanceMark($attPercent, 10.0)`: `round(($attPercent / 100.0) * 10.0)` to the **nearest whole integer** (`app/Services/AttainmentService.php:48-49`).
  4. **Total CIA (Max 50M)**:
     - `$totalCie = (int) round($assignAvg + $summAvg + $attMarks)` (`ClassroomController.php:3381`).
     - **CIA Pass Minimum**: `$totalCie >= 20` (40% of 50) -> `'Pass'`, else `'Fail'` (`ClassroomController.php:3383`).
  5. **ESE (End Semester Examination)**:
     - Stored in `student_board_grades.grade` (`S`, `A`, `B`, `C`, `D`, `E`, `F`, `Ab`, `FE`, `I`).
     - Converted to numerical marks out of **75M** in `AttainmentService::gradeToMarks($grade, 75.0)` (`app/Services/AttainmentService.php:17-29`, `ClassroomController.php:4160, 4258`): `S=95% (71.25)`, `A=85% (63.75)`, `B=75% (56.25)`, `C=65% (48.75)`, `D=55% (41.25)`, `E=45% (33.75)`, `F/Ab=0`.
     - *Codebase Discrepancy*: `ConsolidatedCiaReportController::getCourseConfig` sets `ese_max => 100` for R21 Theory (`app/Http/Controllers/ConsolidatedCiaReportController.php:677`), whereas `AttainmentService.php:201` and `ClassroomController.php:4160, 4258` use `75.0`.

---

### 2. R26 Theory Courses
- **Controllers**: `R26ClassroomController` (`app/Http/Controllers/R26ClassroomController.php`), `R26DataController` (`app/Http/Controllers/R26DataController.php`).
- **Models & Database Tables**:
  - `R26TheoryEvaluation` -> `r26_theory_evaluations` (`app/Models/R26TheoryEvaluation.php:12`, `database/migrations/2026_10_15_180755_create_r26_theory_evaluations_table.php:14-60`): stores per-student evaluation columns:
    - Attendance: `attendance_pct` (`decimal(5,2)`), `attendance_5` (`decimal(5,2)`).
    - Self-Learning (`CA1`..`CA4`): `ca1_15`, `ca2_15`, `ca3_15`, `ca4_15` (each `/15`), `self_learning_15` (`/15`).
    - Series 1 (`/50` -> `/20`): `series_1_co1_25` (`/25`), `series_1_co2_25` (`/25`), `series_1_50` (`/50`), `series_1_20` (`/20`).
    - Series 2 (`/50` -> `/20`): `series_2_co3_25` (`/25`), `series_2_co4_25` (`/25`), `series_2_50` (`/50`), `series_2_20` (`/20`).
    - Totals & ESE: `series_20` (`/20`), `total_cia_40` (`/40`), `ese_mark_60` (`/60`), `ese_grade` (`varchar(10)`), `total_marks_100` (`/100`), `status` (`Pass`/`Failed`/`Incomplete`).
  - `R26CourseFile` -> `r26_course_files` (`app/Models/R26CourseFile.php:11`, `database/migrations/2026_07_21_060000_create_r26_course_files_tables.php:16-39`): stores `co_po_mapping` (JSON, 11 POs + 3 PSOs), `attainment_target_pct` (`50`), `level_1_threshold` (`50`), `level_2_threshold` (`60`), `level_3_threshold` (`70`), `direct_weight_cie` (`30`), `direct_weight_ese` (`70`), `overall_weight_direct` (`80`), `overall_weight_indirect` (`20`), `po_target_level` (`1.80`).
  - `r26_self_study_configs` (`database/migrations/2026_07_21_060000_create_r26_course_files_tables.php:42-53`): stores JSON `config_json` for self-learning sub-activities per CO.
  - `r26_series_exam_qps` (`database/migrations/2026_07_25_000000_create_r26_series_exam_qps_table.php:14-31`) & `r26_question_bank` (`database/migrations/2026_07_25_100000_create_r26_question_bank_table.php:14-33`).
- **CIA & ESE Evaluation Structure (Max 40 CIA + 60 ESE = 100 Total)**:
  1. **Attendance Marks (Max 5M)**:
     - Calculated via `R26TheoryEvaluation::calculateAttendanceMarks($pct)` (`app/Models/R26TheoryEvaluation.php:84-94`, `R26ClassroomController.php:2642-2654`):
       - `>= 90%` -> **5.0M**; `>= 80%` -> **4.0M**; `>= 75%` -> **3.0M**; `>= 70%` -> **2.0M**; `>= 65%` -> **1.0M**; `< 65%` -> **0.0M**.
  2. **Self-Learning / Continuous Assessment (`CA1`–`CA4` — Max 15M)**:
     - Default activity schema per CO (`R26ClassroomController.php:2595-2601`): `assignment` (Max **5M**), `mcq` (Max **5M**), `act3` "Case Study" (Max **5M**), `act4` "Activity 4" (Max **0M**), `act5` "Activity 5" (Max **0M**) = **15M per CO**.
     - Each CO (`CO1`..`CO4`) total is capped at `15.0` (`R26ClassroomController.php:2698`).
     - In `R26ClassroomController::showClassroom` (`line 2721`), `$selfLearningMarks = round($totalAvgSum / 4, 2)`. In `R26ClassroomController::saveTheoryEvaluations` (`lines 2852-2860`), `$selfLearning15 = count($caEntered) > 0 ? round((array_sum($caEntered) / count($caEntered)) * 2) / 2 : 0` (rounded to nearest `0.5`).
  3. **Series Examinations (Series 1 & Series 2 — Max 20M)**:
     - **Series 1 (Max 50M)**: `CO1` (Max **25M**) + `CO2` (Max **25M**) = **50M** (`R26TheoryEvaluation.php:25-28`). Converted to `/20` via `round((($s1_50 / 50.0) * 20.0) * 2) / 2` (`R26ClassroomController.php:2883`).
     - **Series 2 (Max 50M)**: `CO3` (Max **25M**) + `CO4` (Max **25M**) = **50M** (`R26TheoryEvaluation.php:29-32`). Converted to `/20` via `round((($s2_50 / 50.0) * 20.0) * 2) / 2` (`R26ClassroomController.php:2892`).
     - **Combined Series Marks (`/20`)**:
       - In `showClassroom` (`R26ClassroomController.php:2678`): `$seriesExamMarks = round((($s1Total + $s2Total) / 100.0) * 20.0, 2)`.
       - In `saveTheoryEvaluations` (`R26ClassroomController.php:2896-2905`): average of `series_1_20` and `series_2_20` rounded to nearest `0.5` (`round((($s1_20 + $s2_20) / 2.0) * 2) / 2`).
  4. **Total CIA (Max 40M)**:
     - In `showClassroom` (`line 2729`): `$totalCia = round($attMarks + $selfLearningMarks + $seriesExamMarks)` (nearest integer).
     - In `saveTheoryEvaluations` (`line 2911`): `$totalCia40 = min(40, round(($attMarks + $selfLearning15 + $series20) * 2) / 2)`.
  5. **ESE (Max 60M) & Pass Criteria (`R26ClassroomController.php:2926-2965`)**:
     - If `ese_mark_60` is not manually entered, `ese_grade` is converted to midpoint marks out of 60 (`lines 2934-2943`): `S=57`, `A=51`, `B=45`, `C=39`, `D=33`, `E=27`, `F/FE/I/AB=0`.
     - **Pass Criteria**:
       - Fails (`'Failed'`) if `ese_grade` is `'F'`, `'FE'`, `'I'`, `'AB'`, `'ABSENT'`, or `'WITHHELD'` (`line 2948`).
       - Fails (`'Failed'`) if numeric `ese_mark_60 < 24.0` (40% of 60) (`line 2950`).
       - Passes (`'Pass'`) if ESE passed AND `total_marks_100 >= 40.0` (40% of 100), else `'Failed'` (`lines 2954-2960`).

---

### 3. R21 Practical / Lab Courses
- **Controllers**: `VirtualClassroomPracticalController` (`app/Http/Controllers/VirtualClassroomPracticalController.php`), `StaffMobileVirtualLabController` (`app/Http/Controllers/StaffMobileVirtualLabController.php`), and `ClassroomController` (`app/Http/Controllers/ClassroomController.php:5276-7076`).
- **Models & Database Tables**:
  - `PracticalEvaluation` -> `practical_evaluations` (`app/Models/PracticalEvaluation.php`, `database/migrations/2026_07_06_095658_create_practical_evaluations_table.php:14-31`, `2026_09_27_150000_add_lab_work_marks_to_practical_evaluations_table.php:14-20`): stores per-student `micro_project` (Max `7.50`), `attendance_marks` (Max `15.00`), `lab_work_marks` (nullable manual override `/37.50`).
  - `PracticalExperiment` -> `practical_experiments` (`app/Models/PracticalExperiment.php`, `database/migrations/2026_07_06_095658_create_practical_evaluations_table.php:33-46`): stores `experiment_no`, `title`, `co_tag` (`CO1`..`CO4`), `conducted_date`, `max_mark` (`37.50`).
  - `PracticalExperimentMark` -> `practical_experiment_marks` (`app/Models/PracticalExperimentMark.php`, `database/migrations/2026_07_06_095658_create_practical_evaluations_table.php:48-67`, `2026_09_07_140000_add_evaluation_date_to_practical_experiment_marks.php:14-20`): stores 5 rubrics per student per experiment: `rough_record` (`5.0`), `fair_record` (`7.5`), `prerequisites` (`7.5`), `work_done` (`7.5`), `result` (`10.0`), `total_mark` (`37.5`), `is_present`, `evaluation_date`.
  - `PracticalTest` -> `practical_tests` & `PracticalTestMark` -> `practical_test_marks` (`database/migrations/2026_07_06_095658_create_practical_evaluations_table.php:69-98`): stores `test_no` (`1` or `2`), `max_mark` (`15.00`), `mark_obtained` (`15.00`).
- **CIA & ESE Evaluation Structure (Max 75 CIA + 50 ESE = 125 Total)**:
  1. **Continuous Lab Work (`avg_lab_work_375` — Max 37.5M, 50% of CIA)**:
     - Each experiment is evaluated out of **37.5M** across 5 rubrics (`VirtualClassroomPracticalController.php:618-623`):
       - `rough_record`: Max **5.0M**
       - `fair_record`: Max **7.5M**
       - `prerequisites` (Observation & Prep): Max **7.5M**
       - `work_done` (Procedure & Punctuality): Max **7.5M**
       - `result` (Viva / Output): Max **10.0M**
     - Student's total experiment marks are divided by `$divisor = max($totalCompletedExps, $gradedExpCount, 1)` and rounded to 2 decimal places (`VirtualClassroomPracticalController.php:1174-1180`, `StaffMobileVirtualLabController.php:283-285`).
     - **Manual Override Back-Calculation**: If `practical_evaluations.lab_work_marks` is set (`/37.5`), it overrides the experiment average and back-calculates the 5 rubric columns proportionally (`5/37.5`, `7.5/37.5`, `7.5/37.5`, `7.5/37.5`, and remainder `10/37.5`) (`VirtualClassroomPracticalController.php:1183-1197`).
  2. **Open-Ended / Micro-Project (`micro_project` — Max 7.5M, 10% of CIA)**:
     - Stored in `practical_evaluations.micro_project` (`0` to `7.5`, `VirtualClassroomPracticalController.php:681, 851`).
  3. **Practical Series Tests (`avg_series_15` — Max 15.0M, 20% of CIA)**:
     - 2 Series Tests (`Test 1` covering `CO1` 7.5M + `CO2` 7.5M = **15M**; `Test 2` covering `CO3` 7.5M + `CO4` 7.5M = **15M**, `ClassroomController.php:6769-6801`).
     - Averaged: `round(($t1 + $t2) / 2, 2)` (`VirtualClassroomPracticalController.php:526, 1200`).
     - If marks were entered on a `/40` scale (`$avgTest > 15.0`), they are automatically scaled via `round(($avgTest / 40) * 15, 2)` (`VirtualClassroomPracticalController.php:951-955`).
  4. **Attendance (`attendance_marks` — Max 15.0M, 20% of CIA)**:
     - Calculated via `AttainmentService::calculateR21AttendanceMark($pct, 15.0)` -> `round((($pct / 100.0) * 15.0) * 2) / 2` (nearest `0.5`) (`VirtualClassroomPracticalController.php:237, 1140`).
  5. **Total CIA (Max 75M) & ESE (Max 50M)**:
     - `$totalCia = (int) round($avgLabWork + $microProject + $avgTests + $attendanceMarks)` (`VirtualClassroomPracticalController.php:534, 1207`).
     - **CIA Pass Minimum**: `>= 30 / 75` (40%) (`ConsolidatedCiaReportController.php:401, 684`).
     - **ESE Max**: **50M** (`VirtualClassroomPracticalController.php:1823-1827`).

---

### 4. R26 Practical / Lab Courses
- **Controllers**: `R26VirtualClassroomPracticalController` (`app/Http/Controllers/R26VirtualClassroomPracticalController.php`).
- **Models & Database Tables**:
  - `R26PracticalCourseFile` -> `r26_practical_course_files` (`app/Models/R26PracticalCourseFile.php`, `database/migrations/2026_07_22_200000_create_r26_practical_course_files_table.php:14-35`, `2026_10_26_140000_add_parsed_modules_to_r26_practical_course_files_table.php:14-22`): stores `co_po_mapping`, `parsed_cos`, `parsed_modules`, `parsed_experiments`, and attainment thresholds (`50`/`60`/`70`, `30:70` CIE:ESE, `80:20` Direct:Indirect, `po_target_level = 1.80`).
  - `R26PracticalExperimentEvaluation` -> `r26_practical_experiment_evaluations` (`app/Models/R26PracticalExperimentEvaluation.php`, `database/migrations/2026_07_21_210000_create_r2026_practical_evaluations_tables.php:15-31`).
  - `R26OpenEndedEvaluation` -> `r26_open_ended_evaluations` (`app/Models/R26OpenEndedEvaluation.php`, `database/migrations/2026_07_21_210000_create_r2026_practical_evaluations_tables.php:34-50`).
  - `R26PracticalSeriesEvaluation` -> `r26_practical_series_evaluations` (`app/Models/R26PracticalSeriesEvaluation.php`, `database/migrations/2026_07_21_210000_create_r2026_practical_evaluations_tables.php:53-70`).
  - `R26PracticalSeriesExam` -> `r26_practical_series_exams` (`app/Models/R26PracticalSeriesExam.php`, `database/migrations/2026_07_22_100000_create_r26_practical_series_exams_table.php:14-32`).
  - `R26PracticalEseMark` -> `r26_practical_ese_marks` (`app/Models/R26PracticalEseMark.php`, `database/migrations/2026_07_22_101000_create_r26_practical_ese_marks_table.php:14-27`).
  - `R26StudentLabBatch` -> `r26_student_lab_batches` (`app/Models/R26StudentLabBatch.php`, `database/migrations/2026_07_22_000000_create_r26_student_lab_batches_table.php:14-25`).
- **CIA & ESE Evaluation Structure (Max 60 CIA + 40 ESE = 100 Total)**:
  1. **Day Work — Continuous Experiment Evaluation (Table 2.2 — Max 30M)**:
     - Each experiment is scored out of **50M** across 6 rubrics (`R26VirtualClassroomPracticalController.php:887-905`):
       - `prep_punctuality`: Max **10M**
       - `setup_procedure`: Max **10M**
       - `observation_recording`: Max **5M**
       - `analysis_interpretation`: Max **10M**
       - `viva_voce`: Max **10M**
       - `teamwork_discipline`: Max **5M**
     - Averaged across conducted/evaluated experiments (`$avgExp50`) and scaled to **30M**: `$scaled30 = round(($avgExp50 / 50) * 30, 2)` (`R26VirtualClassroomPracticalController.php:66-73`).
  2. **Open-Ended Project / Assessment (Table 2.3 — Max 10M)**:
     - Scored out of **50M** across 5 rubrics (`R26VirtualClassroomPracticalController.php:921-932`):
       - `originality_relevance` (**10M**) + `objectives_plan` (**10M**) + `execution_recording` (**10M**) + `analysis_presentation` (**10M**) + `teamwork_innovation` (**10M**) = **50M**.
     - Scaled to **10M**: `$scaled10 = round(($open50 / 50) * 10, 2)` (`line 78`).
     - Combined Continuous Evaluation (`CE`) = `$scaled30 + $scaled10` = **40M** (`line 81`).
  3. **Practical Series Examinations (Table 3.1 — Max 15M)**:
     - Series 1 (`series_no = 1`) and Series 2 (`series_no = 2`) are each scored out of **40M** across 5 rubrics (`R26VirtualClassroomPracticalController.php:949-959`):
       - `writeup_procedure` (**10M**) + `setup_execution` (**15M**) + `observation_result` (**5M**) + `viva_voce` (**5M**) + `record_completion` (**5M**) = **40M**.
     - Average of Series 1 and Series 2 (`$avg40 = ($s1_40 + $s2_40) / 2`) is scaled to **15M**: `$scaled15 = round(($avg40 / 40) * 15, 2)` (`lines 84-92`).
  4. **Attendance (Table 2.1 — Max 5M)**:
     - 6-tier R26 step-slab (`>=90`->5, `>=80`->4, `>=75`->3, `>=70`->2, `>=65`->1, `<65`->0, `lines 47-55`).
  5. **Total CIA (Max 60M) & ESE (Max 40M)**:
     - `$totalCia60 = (int) round($scaled30 + $scaled10 + $scaled15 + $att5)` (`line 98`).
     - **ESE (`R26PracticalEseMark`)**: Max **40M** (`ese_score`, `line 108`).
     - **Pass Minimums**:
       - ESE minimum: `ese_score >= 16.0 / 40` (40%). If `$ese40 < 16.0 && $ese40 > 0`, student is forced to Grade `'F'` (`line 111`).
       - Grand Total minimum: `$grandTotal100 >= 40` (40% of 100) for Grade `'E'` (`line 123`).
       - In `ConsolidatedCiaReportController.php:698`, CIA pass minimum is `24 / 60` (40%).

---

### 5. R26 Practicum & Basic Science Practicum Courses
- **Controller**: `R26VirtualClassroomPracticumController` (`app/Http/Controllers/R26VirtualClassroomPracticumController.php`).
- **Models & Database Tables** (`database/migrations/2026_07_24_000000_create_r26_practicum_tables.php:14-160`, `2026_07_25_081426_add_ese_theory_grade_to_r26_practicum_ese_marks.php:14-20`):
  - `R26PracticumCourseFile` -> `r26_practicum_course_files` (`subject_type_category` default `'basic_science'` or `'program_core'`, `co_po_mapping`, `self_study_config`, attainment thresholds).
  - `R26PracticumSelfLearning` -> `r26_practicum_self_learning` (`co_tag`, `assignment_mark` `/5`, `mcq_mark` `/5`, `activity3_mark`, `total_10` `/10`).
  - `R26PracticumExperiment` -> `r26_practicum_experiments` (`experiment_no`, `part_tag` `'A'`/`'B'`, `title`, `co_tag`, `conducted_date`, `max_mark` `50`).
  - `R26PracticumExperimentEvaluation` -> `r26_practicum_experiment_evaluations` (Table 2.2 rubrics: `prep_punctuality` `10`, `setup_procedure` `10`, `observation_recording` `5`, `analysis_interpretation` `10`, `viva_voce` `10`, `workmanship_discipline` `5`, `total_50` `50`).
  - `R26PracticumOpenEnded` -> `r26_practicum_open_ended` (Table 2.3 rubrics `/50`: `originality_relevance` `10`, `objectives_plan` `10`, `execution_recording` `10`, `analysis_presentation` `10`, `teamwork_innovation` `10`).
  - `R26PracticumSeriesTheory` -> `r26_practicum_series_theory` (`series_no` `1`/`2`, `co1_mark` `25`, `co2_mark` `25`, `total_50` `50`).
  - `R26PracticumSeriesPractical` -> `r26_practicum_series_practical` (Table 3.1 rubrics `/40`: `writeup_procedure` `10`, `setup_execution` `15`, `observation_result` `5`, `viva_voce` `5`, `record_completion` `5`, `co1_mark` `20`, `co2_mark` `20`, `total_40` `40`).
  - `R26PracticumEseMark` -> `r26_practicum_ese_marks` (`ese_theory_60`, `ese_theory_grade`, `ese_practical_40`, `is_absent_theory`, `is_absent_practical`).
  - `R26PracticumAttendanceOverride` -> `r26_practicum_attendance_overrides` (`attendance_percentage`, `attendance_mark_5`).
- **3 Practicum Subtypes (`resolveSubjectType`, `R26VirtualClassroomPracticumController.php:1918-1957`)**:
  1. **`design_paper`**: Matched if title contains `'design'`, `'drawing'`, `'cad'`, or `'drafting'` -> pattern `'table_4_2_design'`, ESE default `60M` (`lines 1924-1932`).
  2. **`basic_science` (Basic Science Practicum)**: Matched if `subject_type` contains `'basic science'`, title contains `'chemistry'` or `'physics'`, code contains `'2001'`, `'2002'`, `'2003'`, or `ese_marks <= 60` (`lines 1934-1949`).
     - **Split**: **40 CIA + 60 ESE (Theory only; Practical ESE = 0) = 100 Total** (`lines 4866-4874`).
     - **Pass Minimums**: ESE Theory `>= 24.0 / 60` (40%, or letter grade `S`..`E`/`P`) AND Combined Total `>= 40.0 / 100` (40%) (`lines 560-562, 4872-4874`).
  3. **`program_core` (Program Core Practicum — `3:0:3:0`, 90 hours: 45L + 45P, 4.5 credits)**:
     - **Split**: **40 CIA + 100 ESE (60 Theory + 40 Practical) = 140 Total** (`lines 1951-1956, 4875-4884`).
     - **Pass Minimums**: ESE Theory `>= 24.0 / 60` (40%) AND Combined Total `>= 56.0 / 140` (40% of 140) (`lines 573-575, 4881-4883`).
- **CIA Component Breakdown (Max 40M across all Practicum subtypes, `R26VirtualClassroomPracticumController.php:309-521, 4342-4494`)**:
  1. **Attendance (Max 5M)**: R26 6-tier slab (`>=90`->5, `>=80`->4, `>=75`->3, `>=70`->2, `>=65`->1, `<65`->0, `lines 309-324`).
  2. **Self-Learning Assessment (Max 5M)**: 4 Modules (`M1`..`M4` / `CO1`..`CO4`), each scored out of **10M** (`assignment_mark` 5M + `mcq_mark` 5M). Average of 4 modules (`/10`) scaled to **5M** and rounded to nearest `0.5`: `round((($rawAvg10 / 10.0) * 5.0) * 2) / 2` (`lines 327-371, 4374-4412`).
  3. **Continuous Practical Evaluation (Table 2.2 — Max 10M)**: Average of conducted experiments (each `/50` across 6 rubrics) scaled to **10M** and rounded to nearest `0.5`: `round((($ceScore50Effective / 50.0) * 10.0) * 2) / 2` (`lines 373-385, 4414-4425`).
  4. **Theory Series Exam (Max 10M)**: Series 1 (`CO1` 25M + `CO2` 25M = 50M) and Series 2 (`CO3` 25M + `CO4` 25M = 50M). Average out of 50 scaled to **10M** and rounded to nearest `0.5`: `round((($avgTheorySeries50 / 50.0) * 10.0) * 2) / 2` (`lines 387-429, 4427-4460`).
  5. **Practical Series Exam (Table 3.1 — Max 10M)**: Series 1 (`CO1` 20M + `CO2` 20M = 40M) and Series 2 (`CO3` 20M + `CO4` 20M = 40M). Average out of 40 scaled to **10M** and rounded to nearest `0.5`: `round((($avgPracticalSeries40 / 40.0) * 10.0) * 2) / 2` (`lines 431-518, 4462-4490`).
  6. **Total CIA (Max 40M)**: `round($attMarks + $slMarks + $continuousEvalMarks + $seriesTheoryMarks + $seriesPracticalMarks)` (`line 521`).

---

### 6. R21 Drawing Courses
- **Controller**: `R21VirtualClassroomDrawingController` (`app/Http/Controllers/R21VirtualClassroomDrawingController.php`).
- **Models & Database Tables** (`database/migrations/2026_09_10_000001_create_r21_drawing_tables.php:14-92`, `2026_10_12_000001_add_override_percentage_to_r21_drawing_attendance_evaluations_table.php:14-20`):
  - `R21DrawingCourseFile` -> `r21_drawing_course_files` (`co_po_mapping`, `sheet_configs`, attainment settings).
  - `R21DrawingSheetEvaluation` -> `r21_drawing_sheet_evaluations` (`sheet_no`, `co_tag`, `timely_completion` `/50`, `appearance_organization` `/50`, `total_100` `/100`, `scaled_375` `/37.5`).
  - `R21DrawingSeriesTest` -> `r21_drawing_series_tests` (`test_no` `1`/`2`, `co_tag`, `procedure_drawing` `/40`, `final_drawing` `/30`, `dimensioning` `/20`, `neatness` `/10`, `total_100` `/100`, `scaled_15` `/15`).
  - `R21DrawingAttendanceEvaluation` -> `r21_drawing_attendance_evaluations` (`conducted_hours`, `attended_hours`, `attendance_pct`, `override_percentage`, `attendance_mark_15` `/15`).
  - Uses `practical_evaluations` for `micro_project` (Open-Ended `/7.5`) and `lab_work_marks` (override `/37.5`) (`R21VirtualClassroomDrawingController.php:208-218`).
- **CIA & ESE Evaluation Structure (Max 75 CIA + 50 ESE = 125 Total, `R21VirtualClassroomDrawingController.php:158-255`)**:
  1. **Continuous Drawing Sheets (Max 37.5M, 50% of CIA)**: Each sheet scored out of **100M** (`timely_completion` 50M + `appearance_organization` 50M, `lines 561-570`). Average sheet score scaled to 37.5 and rounded to nearest `0.5`: `round((($avgSheetScore100 / 100.0) * 37.5) * 2) / 2` (`line 205`).
  2. **Open-Ended Evaluation (Max 7.5M, 10% of CIA)**: Stored in `practical_evaluations.micro_project` (`lines 217-218`).
  3. **Summative Series Tests (Max 15.0M, 20% of CIA)**: 2 tests (`Test 1` & `Test 2`), each scored out of **100M** across 4 rubrics (`procedure_drawing` 40M, `final_drawing` 30M, `dimensioning` 20M, `neatness` 10M, `lines 482-485, 619-622`), scaled to **15M** (`round(($tRaw / 100.0) * 15.0, 2)`) and averaged (`lines 230-242`).
  4. **Attendance (Max 15.0M, 20% of CIA)**: `AttainmentService::calculateR21AttendanceMark($effectivePct, 15.0)` (`line 198`).
  5. **Total CIA & ESE**: `$totalCia75 = (int) round($finalContinuousMark + $openEndedMark + $avgSeries15 + $finalAttMark)` (`line 245`). Pass minimums: CIA `>= 30 / 75` (40%) and ESE `>= 20.0 / 50` (40%) (`lines 250-255`).

---

### 7. R26 Drawing / Engineering Graphics Courses
- **Controller**: `R26VirtualClassroomDrawingController` (`app/Http/Controllers/R26VirtualClassroomDrawingController.php`).
- **Dual Evaluation Architecture**:
  1. **Active Evaluation Model (`R26DrawingEvaluation` -> `r26_drawing_evaluations`)**:
     - Created by migrations `2026_10_15_132018_create_r26_drawing_evaluations_table.php` and `2026_10_15_150710_add_co_marks_to_r26_drawing_evaluations_table.php`, and used in `R26VirtualClassroomDrawingController::show` (`lines 132-271`) and `saveDrawingEvaluations` (`lines 548-715`).
     - **Split**: **40 CIA + 60 ESE = 100 Total** (`R26DrawingEvaluation.php:12-95`):
       - **Attendance (Max 5M)**: R26 6-tier step-slab (`R26DrawingEvaluation::calculateAttendanceMarks`, `R26DrawingEvaluation.php:84-94`).
       - **Self-Learning Continuous Assessment (Max 15M)**: 4 COs (`ca1_15`..`ca4_15`, each `/15`), averaged and rounded to nearest `0.5`: `round((array_sum($caEntered) / 4.0) * 2) / 2` (`R26VirtualClassroomDrawingController.php:156-174`).
       - **Series Exams (Max 20M)**: Series 1 (`series_1_co1_20` [20M] + `series_1_co2_20` [20M] = `series_1_40` [40M] -> halved to `series_1_20` [20M]) and Series 2 (`series_2_co3_20` [20M] + `series_2_co4_20` [20M] = `series_2_40` [40M] -> halved to `series_2_20` [20M]), averaged to `series_20` (rounded to nearest `0.5`, `lines 176-217`).
       - **Total CIA (Max 40M)**: `round(($attMarks + $selfLearning15 + $series20) * 2) / 2` (`lines 221-222`).
       - **ESE (Max 60M)**: `ese_mark_60` or `ese_grade` (`S=57, A=51, B=45, C=39, D=33, E=27, F=0`, `lines 224-232`). Pass requires `ese_mark_60 >= 24.0 / 60` (40%) and `total_marks_100 >= 40.0 / 100` (`lines 234-237`).
  2. **Legacy Lab-Style Tables (`database/migrations/2026_07_29_000000_create_r26_drawing_tables.php`)**:
     - `R26DrawingCourseFile` -> `r26_drawing_course_files`
     - `R26DrawingSlotEvaluation` -> `r26_drawing_slot_evaluations` (5 rubrics `/50`: `instrument_handling_10` + `dimensioning_linework_15` + `geometric_accuracy_15` + `viva_voce_5` + `timely_submission_5` = `50M`, scaled to `30M` in `printCeConsolidatedReport` at `line 2011`).
     - `R26DrawingPracticalTest` -> `r26_drawing_practical_tests` (`part_a_manual_20` + `part_b_cad_20` = `40M`).
     - `R26DrawingOeeEvaluation` -> `r26_drawing_oee_evaluations` (`problem_understanding_10` + `manual_sketching_15` + `cad_execution_15` + `printout_viva_10` = `50M`).
     - `R26DrawingEseMark` -> `r26_drawing_ese_marks` (`part_a_mcq` 10M + `part_b_cad` 20M + `part_c_viva` 5M + `part_d_record` 5M = `40M`).

---

### 8. R21 Mechanical Workshop Courses
- **Controller**: `R21VirtualClassroomWorkshopController` (`app/Http/Controllers/R21VirtualClassroomWorkshopController.php`).
- **Models & Database Tables** (`database/migrations/2026_10_13_000001_create_r21_workshop_tables.php:14-105`, `2026_10_14_000001_update_r21_workshop_machine_sheet_metal_columns.php:14-36`):
  - `R21WorkshopCourseFile` -> `r21_workshop_course_files` (`batch_split_cutoff`, `batch_1_sections`, `batch_2_sections`, `co_po_mapping`, attainment settings).
  - `R21WorkshopWorkEvaluation` -> `r21_workshop_work_evaluations` (`section_name`, `work_1` `/20`, `work_2` `/20`, `work_3` `/20`, `work_4` `/20`, `alum_work_mark` `/20`, `avg_work_20` `/20`).
  - `R21WorkshopSectionEvaluation` -> `r21_workshop_section_evaluations` (`section_name`, `rough_record_10` `/10`, `fair_record_10` `/10`, `alum_rough_10` `/10`, `alum_fair_10` `/10`, `open_ended_20` `/20`, `test_mark_15` `/15`).
  - `R21WorkshopAttendanceEvaluation` -> `r21_workshop_attendance_evaluations` (`conducted_hours`, `attended_hours`, `attendance_pct`, `override_percentage`, `attendance_mark_15` `/15`).
- **6 Workshop Sections & Batch Allocation (`R21VirtualClassroomWorkshopController.php:25-32, 66-69, 98-118`)**:
  - Standard sections: `'Machine shop'`, `'Fitting'`, `'Smithy'`, `'Welding'`, `'Sheet metal'`, `'Foundry'`.
  - Default split: **Batch 1** is assigned `['Fitting', 'Smithy', 'Welding']`; **Batch 2** is assigned `['Machine shop', 'Sheet metal', 'Foundry']` (3 sections per student).
- **CIA & ESE Evaluation Structure (Max 75 CIA + 50 ESE = 125 Total, `R21VirtualClassroomWorkshopController.php:251-360`)**:
  1. **Continuous Work Evaluation (Max 37.5M, 50% of CIA)**:
     - Each trade work is scored out of **20M**:
       - `Machine shop`: 4 works (`work_1`..`work_4`), averaged over 4 (`lines 255-258`).
       - `Sheet metal`: 2 Sheet Metal works (`work_1`, `work_2`) + 1 Aluminium Fabrication work (`alum_work_mark`), averaged over 3 if `alum > 0` else over 2 (`lines 259-265`).
       - All other sections (`Fitting`, `Smithy`, `Welding`, `Foundry`): 2 works (`work_1`, `work_2`), averaged over 2 (`lines 266-269`).
     - Averaged across the student's 3 assigned sections (`$avgWork20`) and scaled to **37.5M**: `round(($avgWork20 / 20.0) * 37.5, 2)` (`lines 278-282`).
  2. **Open-Ended Record Evaluation (Max 7.5M, 10% of CIA)**:
     - Per section: `rough_record_10` (**10M**) + `fair_record_10` (**10M**) = **20M** (for `Sheet metal`, averaged with `alum_rough_10 + alum_fair_10` if `> 0`, `lines 296-306`).
     - Averaged across 3 sections (`$avgRecord20`) and scaled to **7.5M**: `round(($avgRecord20 / 20.0) * 7.5, 2)` (`lines 318-322`).
  3. **Trade Tests (Max 15.0M, 20% of CIA)**:
     - 1 trade test per assigned section (each out of **15M**), averaged across the 3 sections (`round($sumTests / count($testScores), 2)`, `lines 324-336`).
  4. **Attendance (Max 15.0M, 20% of CIA)**:
     - `AttainmentService::calculateR21AttendanceMark($finalAttPct, 15.0)` (if no attendance logs exist, defaults to `85.0%` benchmark, `lines 352-353`).
  5. **Total CIA (Max 75M)**: `(int) round($finalWork375 + $finalOpenEnded75 + $finalTestAvg15 + $finalAtt15)`; pass minimum `>= 30 / 75` (40%) (`lines 357-360`).

---

### 9. R21 Major Project
- **Controller**: `R21VirtualClassroomMajorProjectController` (`app/Http/Controllers/R21VirtualClassroomMajorProjectController.php`).
- **Models & Database Tables** (`database/migrations/2026_09_12_000001_create_r21_major_project_tables.php:14-87`):
  - `R21MajorProjectCourseFile` -> `r21_major_project_course_files` (`co_descriptions` for **5 COs** `CO1`..`CO5`, `co_po_mapping`, `project_groups` JSON, attainment settings).
  - `R21MajorProjectEvaluation` -> `r21_major_project_evaluations`.
- **CIA & ESE Evaluation Structure (Max 75 CIA + 50 ESE = 125 Total, Ratio 3:2, 4.0 Credits)**:
  1. **CIA Components (Clause 11.2.5 — Max 75M, `R21VirtualClassroomMajorProjectController.php:316-318, 334-344`)**:
     - `formative_diary_marks` (Formative Project Diary Assessment): Max **30.0M**
     - `summative_dept_marks` (Summative Departmental Presentation / Review): Max **30.0M**
     - `attendance_marks` (Attendance): Max **15.0M** via `AttainmentService::calculateR21AttendanceMark($attPercentage, 15.0)` (`line 116`; defaults to `15.0` in `saveGroupCia` at `line 645`).
     - `total_cia_75 = min(75, (int) round($formative + $summative + $attendance))` (`line 344`).
  2. **ESE Components (Clause 11.3.4 — Max 50M across 8 Rubrics: 5 Group + 3 Individual, `lines 319-327, 494-550`)**:
     - `ese_prototype` (Prototype / Working Model — Group): Max **10.0M**
     - `ese_modern_tools` (Modern Tools Usage — Group): Max **5.0M**
     - `ese_presentation` (Presentation — Individual): Max **7.5M**
     - `ese_innovativeness` (Innovativeness — Group): Max **2.5M**
     - `ese_viva` (Viva Voce — Individual): Max **7.5M**
     - `ese_individual_contrib` (Individual Contribution — Individual): Max **7.5M**
     - `ese_group_activity` (Group Activity / Teamwork — Group): Max **5.0M**
     - `ese_project_report` (Project Report — Group): Max **5.0M**
     - `total_ese_50 = min(50.0, round(sum_of_8_rubrics, 2))` (`line 548`).
  3. **Pass Minimums (`lines 151, 374, 554, 653`)**:
     - Requires **all three**: `total_cia_75 >= 30.0` (40% of 75) **AND** `total_ese_50 >= 20.0` (40% of 50) **AND** `grand_total_125 >= 50.0` (40% of 125).

---

### 10. R21 Seminar
- **Controller**: `R21VirtualClassroomSeminarController` (`app/Http/Controllers/R21VirtualClassroomSeminarController.php`).
- **Models & Database Tables** (`database/migrations/2026_07_05_000001_create_seminar_tables.php:14-49`):
  - `StudentSeminarRegistration` -> `student_seminar_registrations` (`reg_no`, `classroom_id`, `semester`, `topic_title`, `abstract_text`, `guide_mobile_no`, `presentation_date`, `report_file_path`, `slides_file_path`, `status`).
  - `SeminarEvaluation` -> `seminar_evaluations` (`reg_no`, `classroom_id`, `semester`, `assessor_mobile_no`, `relevance` `/7.5`, `literature` `/7.5`, `presentation` `/37.5`, `interaction` `/7.5`, `report` `/7.5`, `attendance` `/7.5`, `total_score` `/75`).
- **CIA-Only Evaluation Structure (Max 75 CIA + 0 ESE = 75 Total, 1.5 Credits, Semester 5, Clause 11.2.6)**:
  - Evaluated by multiple committee assessors; each rubric is averaged across all valid assessors (`R21VirtualClassroomSeminarController.php:219-235, 390-395`):
    1. `relevance` (Relevance of Topic — 10%): Max **7.5M**
    2. `literature` (Literature Survey — 10%): Max **7.5M**
    3. `presentation` (Presentation Slides & Delivery — 50%): Max **37.5M**
    4. `interaction` (Interaction / Discussion — 10%): Max **7.5M**
    5. `report` (Seminar Report — 10%): Max **7.5M**
       *(Subtotal Seminar Presentation Component = **67.5M**)*
    6. `attendance` (Attendance — 10%): Max **7.5M** via `AttainmentService::calculateR21AttendanceMark($attPercentage, 7.5)` (`line 216`).
  - **Total Score**: `$avgTotal = min(75, (int) round($seminarComponent + $avgAttendance))` (`lines 234, 525`).
  - **Decisive Completion & Pass Rule (`lines 244-250, 1041-1065`)**:
    - A student is marked `$isCompleted = true` **ONLY** if `$avgReport > 0` (`line 246`).
    - Graded on the 75M scale (`calculateSbteGrade`, `lines 1041-1065`): `>= 30 / 75` (`40%`) is `'Pass'` (Grade `E` or above); `< 30 / 75` is `'Failed'` (Grade `F`).

---

### 11. R26 English for Communication (Course Code `1001`)
- **Controller**: `R26VirtualClassroomEnglishController` (`app/Http/Controllers/R26VirtualClassroomEnglishController.php`).
- **Models & Database Tables** (`database/migrations/2026_10_21_000001_create_r26_english_1001_tables.php:14-120`, `app/Models/R26EnglishEvaluation.php`, `app/Models/R26EnglishCourseFile.php`, `app/Models/R26EnglishLessonPlan.php`):
  - `R26EnglishCourseFile` -> `r26_english_course_files`
  - `R26EnglishLessonPlan` -> `r26_english_lesson_plans`
  - `R26EnglishEvaluation` -> `r26_english_evaluations`
- **CIA & ESE Evaluation Structure (`2:0:2:0`, 60 Hours: 30L + 30P, 3.0 Credits, Max 40 CIA + 60 ESE = 100 Total, `R26VirtualClassroomEnglishController.php:21-30, 67-80, 209-296`)**:
  1. **Attendance (Max 5M)**: `R26EnglishEvaluation::calculateAttendanceMarks($attPct)` (R26 6-tier slab: `90/80/75/70/65` -> `5/4/3/2/1/0`, `R26EnglishEvaluation.php:115-125`).
  2. **CA1 — Self-Learning (Max 5M)**: 4 Modules (`sl_m1_10`..`sl_m4_10`, each out of **10M**). Averaged (`$slAvg10 = round($slSum / 4.0, 2)`) and scaled to **5M** (rounded to nearest `0.5`): `min(5.0, round((($slAvg10 / 10.0) * 5.0) * 2) / 2)` (`R26VirtualClassroomEnglishController.php:221-230`).
  3. **CE — Continuous Evaluation (Max 10M)**: Combined M1–M4 entry out of **50M** (`ce_m1_50` / `ce_avg_50`), scaled to **10M** (rounded to nearest `0.5`): `min(10.0, round((($ceAvg50 / 50.0) * 10.0) * 2) / 2)` (`lines 232-243`).
  4. **CA2 & CA3 — Practical Tests (Max 10M)**: Practical Test 1 (`prac_test1_40`, `/40`) and Practical Test 2 (`prac_test2_40`, `/40`). Averaged (`$pracAvg40`) and scaled to **10M** (rounded to nearest `0.5`): `min(10.0, round((($pracAvg40 / 40.0) * 10.0) * 2) / 2)` (`lines 245-259`).
  5. **CA4 & CA5 — Series Exams (Max 10M)**: Series Exam 1 (`series1_50`, `/50`) and Series Exam 2 (`series2_50`, `/50`). Averaged (`$seriesAvg50`) and scaled to **10M** (rounded to nearest `0.5`): `min(10.0, round((($seriesAvg50 / 50.0) * 10.0) * 2) / 2)` (`lines 261-275`).
  6. **Total CIA (Max 40M)**: `min(40.0, round($attMark5 + $slConv5 + $ceConv10 + $pracConv10 + $seriesConv10))` (rounded to whole number, `line 279`).
  7. **ESE (Max 60M — Internal Lab Exam, 2.5 Hours) & Pass Criteria (`lines 281-296`)**:
     - `ese_mark_60` or `ese_grade` converted via `R26EnglishEvaluation::gradeToMarks60` (`S=57, A=51, B=45, C=39, D=33, E=27, P=24, F/FE/I/AB=0`, `R26EnglishEvaluation.php:130-144`).
     - Pass requires: not absent in ESE **AND** (`ese_mark_60 >= 24.0` or grade in `S..E/P`) **AND** `total_100 >= 40.0` (`R26VirtualClassroomEnglishController.php:293-295`).

---

### 12. R26 Health & Physical Education (Course Code `1009`) / Life Skills
- **Controller**: `R26VirtualClassroomHealthPhysicalController` (`app/Http/Controllers/R26VirtualClassroomHealthPhysicalController.php`).
- **Models & Database Tables** (`database/migrations/2026_07_29_000002_create_r26_health_physical_tables.php:14-105`):
  - `R26HealthPhysicalCourseFile` -> `r26_health_physical_course_files`
  - `R26HealthPhysicalEvaluation` -> `r26_health_physical_evaluations`
  - `R26HealthPhysicalFitnessTest` -> `r26_health_physical_fitness_tests`
  - `R26HealthPhysicalEseMark` -> `r26_health_physical_ese_marks`
- **CIA & ESE Evaluation Structure (`0:0:2:0`, 30 Hours, 1.0 Credit, Max 60 CIA + 40 ESE = 100 Total, `R26VirtualClassroomHealthPhysicalController.php:60-110, 168-215`)**:
  1. **Attendance (Max 5M)**: R26 6-tier slab (`>=90`->5, `>=80`->4, `>=75`->3, `>=70`->2, `>=65`->1, `<65`->0, `lines 168-179`).
  2. **Continuous Activity Log (`R26HealthPhysicalEvaluation` — Max 30M)**:
     - 8 default activities (`ACT-01`..`ACT-08`, `lines 112-121`), each scored out of **50M** across 5 dynamic criteria (`lines 101-110`): `c1` Physical Fitness & Warm-Up (**10M**) + `c2` Skill Execution & Technique (**15M**) + `c3` Activity Logbook / Record (**10M**) + `c4` Viva-Voce & Game Rules (**10M**) + `c5` Sportsmanship & Attendance (**5M**) = **50M**.
     - Averaged across evaluated activities (`$avgScore50`) and scaled to **30M** (nearest `0.5`): `round((($avgScore50 / 50.0) * 30.0) * 2) / 2` (`lines 181-184`).
  3. **Physical Fitness & Skill Tests (`R26HealthPhysicalFitnessTest` — Max 15M)**:
     - `CA1` (`test_no = 1`, `/40` -> scaled to **7.5M** via `round((($ca1Score40 / 40.0) * 7.5) * 2) / 2`) + `CA2` (`test_no = 2`, `/40` -> scaled to **7.5M**) = **15M** (`lines 186-195`).
  4. **Logbook / Posture & Activity Record (Max 10M — with Code Bug)**:
     - `$logbookMarks = 10.0` is initialized at `line 198` (and `line 472`), **but** at `line 201` (and `line 474`), `$totalCieMarks = round(($attMarks + $activityMarks + $testMarks) * 2) / 2;` omits `+ $logbookMarks`, capping the computed sum at `5 + 30 + 15 = 50.0` instead of `60.0`.
  5. **ESE (`R26HealthPhysicalEseMark` — Max 40M) & Pass Criteria (`lines 204-215, 492, 725-746`)**:
     - 4 ESE components: `fitness_test_score` + `skill_demo_score` + `viva_score` + `record_score` = `total_ese_40` (Max **40M**).
     - *Pass Criteria Discrepancy*: In `show()` (`line 213`), pass requires `$totalEse >= 16.0` (40% of 40) **AND** `$totalCourseMarks >= 40.0` (40% of 100). In `printReport()` (`line 492`), pass requires `$totalCourseMarks >= 40.0 && $totalCieMarks >= 24.0` (40% of 60).

---

## 2b.4 CO–PO / PSO Mapping & NBA Attainment Calculation Engine

### 1. Core Attainment Service (`app/Services/AttainmentService.php`)
- **Default NBA Settings (`AttainmentService::getSettings`, `lines 61-86`)**:
  - `attainment_target_pct`: **50.0%** (minimum score % a student must achieve in a CO/assessment to be counted as having attained that CO).
  - Attainment Level Thresholds (based on % of students achieving `>= attainment_target_pct`, `AttainmentService::percentageToLevel`, `lines 91-97`):
    - **Level 3 (High)**: `>= 70%` of students attained (`level_3_threshold = 70`).
    - **Level 2 (Medium)**: `>= 60%` and `< 70%` of students attained (`level_2_threshold = 60`).
    - **Level 1 (Low)**: `>= 50%` and `< 60%` of students attained (`level_1_threshold = 50`).
    - **Level 0 (Nil)**: `< 50%` of students attained.
  - **Direct Attainment Weights**: `direct_weight_cie = 30%`, `direct_weight_ese = 70%` (`lines 68-69`).
    - Formula (`lines 234-243`): If ESE board grades exist (`$eseLevel > 0` or board grades recorded), `Direct_CO = round(($cieLevel * 0.30) + ($eseLevel * 0.70), 2)`; otherwise `Direct_CO = round($cieLevel, 2)` (100% CIE fallback).
  - **Overall CO Attainment Weights**: `overall_weight_direct = 80%`, `overall_weight_indirect = 20%` (`lines 70-71`).
    - Formula (`lines 256-263`): If Course Exit Survey responses exist (`$indirectCount > 0`), `Overall_CO = round(($directAttainment * 0.80) + ($indirectLevel * 0.20), 2)`; otherwise `Overall_CO = $directAttainment`.
  - **PO / PSO Target Benchmark**: `po_target_level = 1.80` on a 3.00 scale (`line 72`).
- **Exclusion of Attendance Marks from CO Attainment**:
  - Across all controllers (`AttainmentService.php:141-193`, `ClassroomController.php:4044, 4476`, `R26ClassroomController.php:3110-3148`, `R21VirtualClassroomMajorProjectController.php:1032`, `R21VirtualClassroomSeminarController.php:1181`, `R26VirtualClassroomHealthPhysicalController.php:302`), **attendance marks are strictly excluded** from CO direct attainment so that only academic evaluations measure outcome achievement.
- **PO & PSO Aggregation Formula (`AttainmentService.php:276-314`, `ProgramAttainmentController.php:110-189`)**:
  - Each CO (`CO1`..`CO4` or `CO1`..`CO5`) is mapped to each PO (`PO1`..`PO7` in R21; `PO1`..`PO11` in R26) and PSO (`PSO1`..`PSO3`) with correlation levels **`1` (Low), `2` (Medium), or `3` (High)** (`0` or `-` = unmapped).
  - For a given `PO_k` in a course:
    $$\text{Course PO Attainment} = \text{round}\left(\frac{\sum_{i} \left(\text{Overall\_CO}_i \times \frac{\text{Mapping}_{i,k}}{3.0}\right)}{\text{Count of mapped COs}}, 2\right)$$
    *(Note: `AttainmentService.php:285, 304` and `R26ClassroomController.php:3212` weight each CO by `( Overall_CO * Mapping ) / 3.0` and average over mapped COs, whereas `ClassroomController.php:4097-4106` and `R26VirtualClassroomEnglishController.php:1192-1197` compute the weighted average $\frac{\sum (\text{Overall\_CO}_i \times \text{Mapping}_{i,k})}{\sum \text{Mapping}_{i,k}}$).*
- **Program-Level Attainment (`ProgramAttainmentController`, `app/Http/Controllers/ProgramAttainmentController.php:43-253`, table `program_attainments`)**:
  - Averages course-level PO/PSO attainments across all courses in a batch (`direct_score = round($sum / $cnt, 2)`, `line 172`).
  - Blends **80% Direct** (course average) + **20% Indirect** (`indirect_inputs` JSON per PO/PSO from Program Exit / Alumni / Employer surveys):
    $$\text{Final Program PO Attainment} = \text{round}(0.80 \times \text{Direct\_PO} + 0.20 \times \text{Indirect\_PO}, 2)$$
    (`lines 174-184`, with target level default `1.8` at `line 30`).

### 2. Course-Specific CO Attainment Variations & Discrepancies
1. **R21 Theory (`ClassroomController.php:4044-4051` vs `4476-4488`)**:
   - In `printAttainmentReport` (`lines 4044-4051`), each CO's CIE score is `$valAssign (20M) + $valSumm (20M)` divided by `40.0` (`$pct = ($totalScore / 40.0) * 100`).
   - In `getAttainmentSummary` (`lines 4476-4488`), `$fScore` is capped at `5.0` and `$sScore` is capped at `5.0`, dividing by `$maxCoCie = 10.0`.
2. **R26 Theory (`R26ClassroomController.php:3110-3148`)**:
   - Each CO's CIE score is `selfStudyScore (max 15M) + seriesScore (max 10M, i.e., CO series mark /25 halved)` out of `$maxCoCie = 25.0`.
3. **R26 Practical (`R26VirtualClassroomPracticalController.php:175-185`)**:
   - Maps components to specific COs: `CO1 = scaled_open_ended_10` (10M), `CO2 = 0.5 * scaled_lab_work_30` (15M), `CO3 = 0.5 * scaled_lab_work_30` (15M), `CO4 = scaled_series_15` (15M), plus `eseCo = ese_score_40 / 4` (10M), each divided by `25` (`(($coScore + $eseCo) / 25) * 100 >= 60%`).
4. **R26 English `1001` (`R26VirtualClassroomEnglishController.php:981-1200`)**:
   - Uses a **40% CIA + 60% ESE** direct attainment ratio (`round(($avgCiaDirectLevel * 0.40) + ($eseLevel * 0.60), 2)`, `line 1115`) instead of `30:70`, and maps to **7 POs (`PO1`–`PO7`)** (`line 1183`).
   - Evaluates each module `M1..M4` out of **150M** (`sl_m{m}_10 [10] + ce_50 [50] + prac_test [40] + series [50] = 150`, `lines 998-1038`).

---

## 2b.5 Complete Inventory of `r21_*`, `r26_*`, and Legacy Regulation Tables & Models

| Database Table | Eloquent Model | Regulation & Course Type | Purpose & Key Columns | Migration Citation |
| :--- | :--- | :--- | :--- | :--- |
| `class_management` | `ClassManagement` | R21 All Courses | R21 classroom registry (`classroom_id` PK, `branch`, `batch_year`, `tutor_mobile_no`, `mentor_mobile_no`, `current_semester`) | `database/migrations/2026_06_21_000002_create_class_management_table.php:14` |
| `r26_class_management` | `R26ClassManagement` | R26 All Courses | R26 classroom registry (`classroom_id` PK, `branch`, `batch_year`, `tutor_mobile_no`, `mentor_mobile_no`, `current_semester`) | `database/migrations/2026_07_19_154513_create_r26_class_management_table.php:14` |
| `academic_marks` | `AcademicMark` | R21 Theory (also legacy R26 fallback) | Per-CO Formative (`20M`) & Summative (`20M`) marks (`reg_no`, `subject_code`, `evaluation_type`, `co_tag`, `marks_obtained`, `max_marks`) | `database/migrations/2026_06_21_000008_create_academic_marks_table.php:14` |
| `course_files` | `CourseFile` | R21 Theory / Practical | Syllabus mapping (`co_po_mapping`) and NBA attainment settings (`50`/`60`/`70`, `30:70`, `80:20`, `1.80`) | `database/migrations/2026_06_22_150235_create_course_files_table.php:14`, `2026_09_19_030500_add_attainment_settings_to_course_files_table.php:14` |
| `cf_course_files`, `cf_course_outcomes`, `cf_co_po_mappings`, `cf_co_pso_mappings`, `cf_course_file_documents` | `CfCourseFile`, `CfCourseOutcome`, `CfCoPoMapping`, `CfCoPsoMapping`, `CfCourseFileDocument` | R21 & R26 Course File Builder | 19-point NBA Course File builder (`CourseFileController`) | `database/migrations/2026_06_25_070632_create_nba_course_file_tables.php:16-86`, `2026_06_25_163807_create_cf_course_file_documents_table.php:14` |
| `practical_evaluations` | `PracticalEvaluation` | R21 Practical / Drawing | Per-student `micro_project` (`/7.5`), `attendance_marks` (`/15`), `lab_work_marks` (`/37.5` override) | `database/migrations/2026_07_06_095658_create_practical_evaluations_table.php:14`, `2026_09_27_150000_add_lab_work_marks_to_practical_evaluations_table.php:14` |
| `practical_experiments` | `PracticalExperiment` | R21 & R26 Practical | Experiment definitions (`experiment_no`, `title`, `co_tag`, `conducted_date`, `max_mark` `37.50`) | `database/migrations/2026_07_06_095658_create_practical_evaluations_table.php:33` |
| `practical_experiment_marks` | `PracticalExperimentMark` | R21 Practical | 5-rubric experiment scores (`rough_record` 5, `fair_record` 7.5, `prerequisites` 7.5, `work_done` 7.5, `result` 10, `total_mark` 37.5) | `database/migrations/2026_07_06_095658_create_practical_evaluations_table.php:48` |
| `practical_tests`, `practical_test_marks` | `PracticalTest`, `PracticalTestMark` | R21 Practical | Practical Series Test 1 & 2 (`max_mark` `15.00`, `mark_obtained` `15.00`) | `database/migrations/2026_07_06_095658_create_practical_evaluations_table.php:69-98` |
| `r21_drawing_course_files`, `r21_drawing_sheet_evaluations`, `r21_drawing_series_tests`, `r21_drawing_attendance_evaluations` | `R21DrawingCourseFile`, `R21DrawingSheetEvaluation`, `R21DrawingSeriesTest`, `R21DrawingAttendanceEvaluation` | R21 Drawing | Sheets (`/100` -> `/37.5`), Series Tests (`/100` -> `/15`), Attendance (`/15`) | `database/migrations/2026_09_10_000001_create_r21_drawing_tables.php:14-92` |
| `r21_workshop_course_files`, `r21_workshop_work_evaluations`, `r21_workshop_section_evaluations`, `r21_workshop_attendance_evaluations` | `R21WorkshopCourseFile`, `R21WorkshopWorkEvaluation`, `R21WorkshopSectionEvaluation`, `R21WorkshopAttendanceEvaluation` | R21 Workshop | 6 trade sections, Work (`/20` -> `/37.5`), Rough+Fair Record (`/20` -> `/7.5`), Trade Tests (`/15`), Attendance (`/15`) | `database/migrations/2026_10_13_000001_create_r21_workshop_tables.php:14-105`, `2026_10_14_000001_update_r21_workshop_machine_sheet_metal_columns.php:14` |
| `r21_major_project_course_files`, `r21_major_project_evaluations` | `R21MajorProjectCourseFile`, `R21MajorProjectEvaluation` | R21 Major Project | 5 COs, CIA (`30+30+15=75`), ESE 8 rubrics (`10+5+7.5+2.5+7.5+7.5+5+5=50`) | `database/migrations/2026_09_12_000001_create_r21_major_project_tables.php:14-87` |
| `student_seminar_registrations`, `seminar_evaluations` | `StudentSeminarRegistration`, `SeminarEvaluation` | R21 Seminar | Multi-assessor 6-rubric CIA evaluation (`7.5+7.5+37.5+7.5+7.5+7.5=75`) | `database/migrations/2026_07_05_000001_create_seminar_tables.php:14-49` |
| `r26_course_files`, `r26_self_study_configs` | `R26CourseFile` | R26 Theory | 11-PO mapping, attainment settings, self-study sub-activity config | `database/migrations/2026_07_21_060000_create_r26_course_files_tables.php:16-53` |
| `r26_theory_evaluations` | `R26TheoryEvaluation` | R26 Theory | Unified R26 Theory CIA (`5+15+20=40`) & ESE (`60`) ledger | `database/migrations/2026_10_15_180755_create_r26_theory_evaluations_table.php:14` |
| `r26_series_exam_qps`, `r26_question_bank` | `R26SeriesExamQp`, `R26QuestionBank` | R26 Theory & Practicum | Series 1 & 2 question paper builder (Part A `10x2=20`, Part B `2x5x3=30` = `50M`) | `database/migrations/2026_07_25_000000_create_r26_series_exam_qps_table.php:14`, `2026_07_25_100000_create_r26_question_bank_table.php:14` |
| `r26_practical_course_files`, `r26_practical_experiment_evaluations`, `r26_open_ended_evaluations`, `r26_practical_series_evaluations`, `r26_practical_series_exams`, `r26_practical_ese_marks`, `r26_student_lab_batches` | `R26PracticalCourseFile`, `R26PracticalExperimentEvaluation`, `R26OpenEndedEvaluation`, `R26PracticalSeriesEvaluation`, `R26PracticalSeriesExam`, `R26PracticalEseMark`, `R26StudentLabBatch` | R26 Practical / Lab | Day Work (Table 2.2 `/50` -> `30M`), Open-Ended (Table 2.3 `/50` -> `10M`), Series (Table 3.1 `/40` -> `15M`), Att (`5M`), ESE (`40M`), Lab Batch (`1`/`2`) | `database/migrations/2026_07_21_210000_create_r2026_practical_evaluations_tables.php:15-70`, `2026_07_22_000000_create_r26_student_lab_batches_table.php:14`, `2026_07_22_100000_create_r26_practical_series_exams_table.php:14`, `2026_07_22_101000_create_r26_practical_ese_marks_table.php:14`, `2026_07_22_200000_create_r26_practical_course_files_table.php:14` |
| `r26_practicum_course_files`, `r26_practicum_self_learning`, `r26_practicum_experiments`, `r26_practicum_experiment_evaluations`, `r26_practicum_open_ended`, `r26_practicum_series_theory`, `r26_practicum_series_practical`, `r26_practicum_ese_marks`, `r26_practicum_attendance_overrides` | `R26Practicum*` (9 models) | R26 Practicum (`basic_science`, `program_core`, `design_paper`) | CIA (`5+5+10+10+10=40M`), ESE (`60M` Basic Science or `60+40=100M` Program Core) | `database/migrations/2026_07_24_000000_create_r26_practicum_tables.php:14-160`, `2026_07_25_081426_add_ese_theory_grade_to_r26_practicum_ese_marks.php:14` |
| `r26_drawing_evaluations`, `r26_drawing_course_files`, `r26_drawing_slot_evaluations`, `r26_drawing_practical_tests`, `r26_drawing_oee_evaluations`, `r26_drawing_ese_marks` | `R26DrawingEvaluation`, `R26DrawingCourseFile`, `R26DrawingSlotEvaluation`, `R26DrawingPracticalTest`, `R26DrawingOeeEvaluation`, `R26DrawingEseMark` | R26 Drawing / Engineering Graphics | Active `r26_drawing_evaluations` (`5+15+20=40 CIA` + `60 ESE`) plus legacy slot/test/OEE tables | `database/migrations/2026_07_29_000000_create_r26_drawing_tables.php:14-118`, `2026_10_15_132018_create_r26_drawing_evaluations_table.php:14`, `2026_10_15_150710_add_co_marks_to_r26_drawing_evaluations_table.php:14` |
| `r26_english_course_files`, `r26_english_lesson_plans`, `r26_english_evaluations` | `R26EnglishCourseFile`, `R26EnglishLessonPlan`, `R26EnglishEvaluation` | R26 English (`1001`) | CIA (`5+5+10+10+10=40M`) + Internal Lab ESE (`60M`) = `100M` | `database/migrations/2026_10_21_000001_create_r26_english_1001_tables.php:14-120` |
| `r26_health_physical_course_files`, `r26_health_physical_evaluations`, `r26_health_physical_fitness_tests`, `r26_health_physical_ese_marks` | `R26HealthPhysicalCourseFile`, `R26HealthPhysicalEvaluation`, `R26HealthPhysicalFitnessTest`, `R26HealthPhysicalEseMark` | R26 Health & Physical Education (`1009`) | CIA (`5+30+15[+10]=60M`) + ESE (`40M`) = `100M` | `database/migrations/2026_07_29_000002_create_r26_health_physical_tables.php:14-105` |
| `consolidated_cia_approvals` | `ConsolidatedCiaApproval` | R21 & R26 Consolidated CIA | 3-stage digital verification (`Tutor` -> `HOD` -> `Principal`) of class-level CIA registers | `database/migrations/2026_10_08_050000_create_consolidated_cia_approvals_table.php:14-35`, `app/Http/Controllers/ConsolidatedCiaReportController.php:37-115` |
| `program_attainments` | `ProgramAttainment` | R21 & R26 Program Attainment | Batch-level PO/PSO direct (`80%`) + indirect (`20%`) attainment storage | `database/migrations/2026_09_10_232359_create_program_attainments_table.php:14-27` |

---


---

# SECTION 3: ROLE × FEATURE MATRIX

## 3.1 Role Taxonomy & Authorization Architecture

Carmel Linx enforces role-based access control (RBAC) without custom Laravel route middleware aliases (`bootstrap/app.php:8-23`). Instead, authorization is evaluated dynamically per request using four mechanisms:

1. **Primary Session Role (`Session::get('userRole')`)**: Populated at login (`app/Http/Controllers/AuthController.php:108-145`) and verified inside route closures (`routes/web.php:282`, `routes/web.php:311`, `routes/web.php:317`) or controller methods (`app/Http/Controllers/DataController.php:247`, `app/Http/Controllers/ExecutiveControlDeskController.php:18`).
2. **Stream & Department Scope (`Session::get('userBranch')`, `StaffProfile::AIDED_DEPARTMENTS`, `StaffProfile::SF_DEPARTMENTS`)**: Aided stream branches (`EL`, `ME`, `CE`) and Self-Financing stream branches (`EEE`, `CT`, `AU`) are partitioned via model constants (`app/Models/StaffProfile.php`, `app/Http/Controllers/StaffLeaveController.php:23-39`, `app/Http/Controllers/StaffAttendanceMobileController.php:38-87`). General Department Coordinators are scoped to `GEN_AIDED` (`routes/web.php:357-364`) or `GEN_SF` (`routes/web.php:366-373`).
3. **Dynamic Capability Flags (`isSfAcademicCoordinator`, `isTutor`, `isMentor`)**:
   - **SF Academic Coordinator**: Checked via `StaffProfile::isSfAcademicCoordinator(Session::get('userId'))` (`routes/web.php:378`, `app/Http/Controllers/StaffLeaveController.php:181`), allowing designated HODs or staff to switch into `/dashboard/academic-coordinator` (`resources/views/hod_dashboard.blade.php:4`, `275-283`).
   - **Tutor / Class Advisor**: Checked dynamically against `class_management.tutor_mobile_no` and `r26_class_management.tutor_mobile_no` (`resources/views/lecturer_dashboard.blade.php:954-960`, `app/Http/Controllers/AttendanceController.php:668-680`). Any non-Student staff member assigned to a batch can reach `/dashboard/tutor` (`routes/web.php:444-454`).
   - **Mentor**: Checked dynamically against `class_management.mentor_mobile_no`, `r26_class_management.mentor_mobile_no`, and `student_mentor_assignments.mentor_mobile_no` (`resources/views/lecturer_dashboard.blade.php:962-968`, `app/Http/Controllers/MentoringController.php:31-75`). There is no standalone `mentor_dashboard.blade.php`; mentors open `/dashboard/tutor` with `sessionStorage.setItem('openMentoring', 'true')` (`resources/views/lecturer_dashboard.blade.php:988`, `resources/views/tutor_dashboard.blade.php:892-1011`).
4. **Role Consolidation Redirects**:
   - `Principal` and `Super_Admin` both render `resources/views/admin_control_desk.blade.php` via 1-line `@include('admin_control_desk')` wrappers (`resources/views/principal_dashboard.blade.php:1`, `resources/views/super_admin_dashboard.blade.php:1`).
   - `Physical_Instructor`, `Workshop_Instructor`, and `Tradesman` have no standalone desktop dashboard views (`physical_instructor_dashboard.blade.php` and `tradesman_dashboard.blade.php` do not exist in `resources/views/`); they redirect to `/dashboard/lecturer` (`routes/web.php:102-105`, `app/Http/Controllers/AuthController.php:165-169`) or `/staff/mobile` on mobile user-agents (`routes/web.php:385-399`, `app/Http/Controllers/MentoringController.php:1084`).
   - `SF_Office` is authenticated when `userRole` is in `['SF_Office', 'Self_Office', 'Office_SF', 'Office']` or via a fallback 10-digit account ID check (`app/Http/Controllers/SfOfficeController.php:30-35`).

---

## 3.2 Exhaustive Role × Feature Matrix

**Legend**:
- **Actions**: `none` (no access), `view` (read/print/export), `create` (add/upload/initiate), `edit` (modify/grade/configure), `approve` (verify/lock/sanction/revoke), `delete` (remove/reset).
- **Scopes**: `own` (self or personally assigned records), `class` (supervised classroom/batch or mentee group), `branch` (own engineering/general department), `stream` (Aided `EL/ME/CE` or Self-Financing `EEE/CT/AU`), `institution` (entire polytechnic college).

| Feature / Page / Module | `Super_Admin` | `Principal` | `Chairman` | `Admin` | `Academic_Coordinator` | `Gen_Dept_Coordinator (Aided/SF)` | `HOD` | `Tutor` | `Mentor` | `Lecturer / Subject Staff` | `Demonstrator / Trade_Instructor / Tradesman / Workshop` | `Physical_Instructor` | `SF_Office` | `Student` | `Parent` | Code Citations (`file:line`) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **GROUP 1: EXECUTIVE & SYSTEM ADMIN** | | | | | | | | | | | | | | | | |
| **Executive Control Desk & Institutional KPIs** (`/dashboard/superadmin`, `/dashboard/principal`, `/api/admin/executive-kpis`, `/api/admin/executive-compliance`) | `view`, `edit` (`institution`) | `view`, `edit` (`institution`) | `view` (`institution`) | `view` (`institution`) | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `routes/web.php:281-285`, `310-320`, `2430-2434`; `app/Http/Controllers/ExecutiveControlDeskController.php:18-24`, `31-185`, `310-360` |
| **Executive Board Digest A4 PDF** (`/admin/executive-digest/pdf`) | `view` (`institution`) | `view` (`institution`) | `view` (`institution`) | `view` (`institution`) | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `routes/web.php:2434`; `app/Http/Controllers/ExecutiveControlDeskController.php:18-24`, `395-450` |
| **Chairman Control Desk** (`/dashboard/chairman`) | `view`, `create`, `edit`, `approve`, `delete` (`institution`) | `view`, `create`, `edit`, `approve`, `delete` (`institution`) | `view`, `create`, `edit`, `approve`, `delete` (`institution`) | `view`, `create`, `edit`, `approve`, `delete` (`institution`) | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `routes/web.php:316-320`; `resources/views/chairman_dashboard.blade.php:190-321`, `740-870` |
| **Legacy Admin Console** (`/dashboard/admin`) | `none` (uses `/dashboard/superadmin`) | `none` | `none` | `view`, `create`, `edit`, `approve`, `delete` (`institution`) | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `routes/web.php:305-308`; `resources/views/admin_dashboard.blade.php:58-375` |
| **User Directory & Staff/Student Account Management** (`/api/admin/users`, `/api/approve-account`, `/api/admin/user/toggle-status`, `/api/admin/user/reset-password`, `/api/admin/user/change-role`, `/api/admin/user/delete`) | `view`, `create`, `edit`, `approve`, `delete` (`institution`) | `view`, `create`, `edit`, `approve`, `delete` (`institution`) | `view`, `create`, `edit`, `approve`, `delete` (`institution`) | `view`, `create`, `edit`, `approve`, `delete` (`institution`) | `view`, `create`, `edit`, `approve`, `delete` (`stream`) | `view`, `create`, `edit`, `approve`, `delete` (`stream`) | `view`, `create`, `edit`, `approve`, `delete` (`branch`) | `view`, `create`, `edit`, `approve`, `delete` (`class` students) | `none` | `none` | `view`, `create` (`branch` workshop staff/students for `Workshop_Superintendent`) | `none` | `none` | `none` | `none` | `routes/web.php:485-488`, `512-518`; `app/Http/Controllers/DataController.php:18-105`, `245-498` |
| **Plaintext/Hashed User Credentials Table** (`/superadmin/show-users`) | `view` (`institution`) | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `routes/web.php:287-303`; `resources/views/admin_show_users_table.blade.php:1-194` |
| **Live Online Staff Monitor & Presence Log** (`panelLiveStaff`, `/api/admin/online-staff-log`, `/api/users/online-status`) | `view` (`institution`) | `view` (`institution` via API) | `view` (`institution` via API) | `view` (`institution` via API) | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `routes/web.php:73-88`, `520`; `resources/views/admin_control_desk.blade.php:218-226`, `1092-1107`; `app/Http/Controllers/DataController.php:619-688` |
| **Google Drive & Local SQLite System Backups / Restore** (`/api/system/backup`, `/api/system/backup/download`, `/api/system/restore`) | `view`, `create`, `edit` (`institution`) | `view`, `create`, `edit` (`institution`) | `none` | `view`, `create`, `edit` (`institution`) | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `routes/web.php:490-492`; `app/Http/Controllers/BackupController.php:18-190`; `resources/views/admin_control_desk.blade.php:930-1013` |
| **System Settings & AI Assistant Configuration** (`/api/admin/settings`, `/api/system/ai-status`) | `view`, `edit` (`institution`) | `view`, `edit` (`institution`) | `view` (`institution`) | `view`, `edit` (`institution`) | `view` (`institution`) | `view` (`institution`) | `view` (`institution`) | `view` (`institution`) | `view` (`institution`) | `view` (`institution`) | `view` (`institution`) | `view` (`institution`) | `view` (`institution`) | `view` (`institution`) | `none` | `routes/web.php:879-881`; `app/Http/Controllers/SystemSettingController.php:15-95`; `resources/views/admin_control_desk.blade.php:1057-1090` |
| **Institutional Audit Trail Log** (`/api/audit-logs`) | `view` (`institution`) | `view` (`institution`) | `view` (`institution`) | `view` (`institution`) | `view` (`stream`) | `view` (`stream`) | `view` (`branch`) | `view` (`own`/`class`) | `none` | `none` | `view` (`branch` for `Workshop_Superintendent`) | `none` | `none` | `none` | `none` | `routes/web.php:519`; `app/Http/Controllers/DataController.php:550-617`; `resources/views/admin_control_desk.blade.php:1015-1055` |
| **Institutional Today's Master Timetable Desk** (`/dashboard/principal/today-timetable`, `/api/principal/today-timetable`) | `view` (`institution`) | `view` (`institution`) | `view` (`institution`) | `view` (`institution`) | `view` (`institution`) | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `routes/web.php:353-354`; `app/Http/Controllers/PrincipalDashboardController.php:15-58`; `resources/views/principal_today_timetable.blade.php:1-432` |
| **Institutional Day Order Setter** (`/api/system/set-day-order`, `/api/system/get-day-order`) | `view`, `edit` (`institution`) | `view`, `edit` (`institution`) | `view`, `edit` (`institution`) | `view`, `edit` (`institution`) | `view`, `edit` (`institution`) | `view`, `edit` (`institution`) | `view`, `edit` (`institution`) | `view`, `edit` (`institution`) | `view`, `edit` (`institution`) | `view`, `edit` (`institution`) | `view`, `edit` (`institution`) | `view`, `edit` (`institution`) | `view` (`institution`) | `view` (`institution`) | `view` (`institution`) | `routes/web.php:495-510`; `resources/views/hod_mobile_dashboard.blade.php:423`, `1438`; `resources/views/staff_mobile_dashboard.blade.php:966` |
| **GROUP 2: DEPARTMENT & BATCH MANAGEMENT** | | | | | | | | | | | | | | | | |
| **Principal Department HOD Supervision Override** (`/dashboard/principal/department/{branch}`) | `view`, `create`, `edit`, `approve`, `delete` (`institution`) | `view`, `create`, `edit`, `approve`, `delete` (`institution`) | `view`, `create`, `edit`, `approve`, `delete` (`institution`) | `view`, `create`, `edit`, `approve`, `delete` (`institution`) | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `routes/web.php:343-350`; `resources/views/hod_dashboard.blade.php:1-5`, `269-273` |
| **HOD Desktop & Mobile Consoles** (`/dashboard/hod`, `/hod/mobile`) | `view`, `create`, `edit`, `approve`, `delete` (`institution`) | `view`, `create`, `edit`, `approve`, `delete` (`institution`) | `view`, `create`, `edit`, `approve`, `delete` (`institution`) | `view`, `create`, `edit`, `approve`, `delete` (`institution`) | `view`, `create`, `edit`, `approve`, `delete` (`stream` if HOD) | `none` | `view`, `create`, `edit`, `approve`, `delete` (`branch`) | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `routes/web.php:322-334`; `app/Http/Controllers/HodMobileController.php:23-45` |
| **General Department Coordinator Desks (Aided & SF)** (`/dashboard/general-coordinator-aided`, `/dashboard/general-coordinator-sf`) | `view`, `create`, `edit`, `approve`, `delete` (`institution`) | `view`, `create`, `edit`, `approve`, `delete` (`institution`) | `none` | `view`, `create`, `edit`, `approve`, `delete` (`institution`) | `none` | `view`, `create`, `edit`, `approve`, `delete` (`stream`: `GEN_AIDED` or `GEN_SF`) | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `routes/web.php:357-373`; `resources/views/general_coordinator_aided_dashboard.blade.php:1-692`; `resources/views/general_coordinator_sf_dashboard.blade.php:1-700` |
| **SF Academic Coordinator Desk** (`/dashboard/academic-coordinator`) | `view`, `create`, `edit`, `approve`, `delete` (`institution`) | `none` | `none` | `view`, `create`, `edit`, `approve`, `delete` (`institution`) | `view`, `create`, `edit`, `approve`, `delete` (`stream`: SF) | `view`, `create`, `edit`, `approve`, `delete` (`stream`: SF for `Gen_Dept_Coordinator_Self_Finance`) | `view`, `create`, `edit`, `approve`, `delete` (`stream`: SF if `isSfAcademicCoordinator`) | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `routes/web.php:375-383`; `resources/views/academic_coordinator_dashboard.blade.php:1-1397` |
| **Batch Creation, Graduation, Semester Promotion & Deletion (R21 & R26)** (`/api/hod/batches`, `/api/r26/hod/batches`, `/api/hod/batches/{id}/update-semester`, `/api/hod/batches/{id}/graduate`, `DELETE /api/hod/batches/{id}`) | `view`, `create`, `edit`, `delete` (`institution`) | `view`, `create`, `edit`, `delete` (`institution`) | `view`, `create`, `edit`, `delete` (`institution`) | `view`, `create`, `edit`, `delete` (`institution`) | `view`, `create`, `edit`, `delete` (`stream`: SF) | `view`, `create`, `edit`, `delete` (`stream`: S1/S2 batches) | `view`, `create`, `edit`, `delete` (`branch`) | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `routes/web.php:531-536`, `579-580`, `813-819`; `app/Http/Controllers/DataController.php:690-895`; `app/Http/Controllers/R26DataController.php:15-120` |
| **Tutor & Mentor Batch Assignment** (`/api/hod/batches/assign-tutor`, `/api/hod/batches/assign-mentor`, `/api/mentoring/assign-mentor2`) | `create`, `edit` (`institution`) | `create`, `edit` (`institution`) | `create`, `edit` (`institution`) | `create`, `edit` (`institution`) | `create`, `edit` (`stream`: SF) | `create`, `edit` (`stream`: S1/S2) | `create`, `edit` (`branch`) | `create`, `edit` (`class` co-mentor via `/api/mentoring/assign-mentor2`) | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `routes/web.php:533-534`, `945`; `app/Http/Controllers/DataController.php:760-835`; `app/Http/Controllers/MentoringController.php:145-190` |
| **Subject Creation, Allocation & Staff Assignment** (`/api/hod/batches/{id}/subjects`, `/api/hod/batches/subjects/create`, `PUT/DELETE /api/hod/batches/subjects/{id}`, `/api/hod/batches/subjects/{id}/assign-staff`) | `view`, `create`, `edit`, `delete` (`institution`) | `view`, `create`, `edit`, `delete` (`institution`) | `view`, `create`, `edit`, `delete` (`institution`) | `view`, `create`, `edit`, `delete` (`institution`) | `view`, `create`, `edit`, `delete` (`stream`: SF) | `view`, `create`, `edit`, `delete` (`stream`: S1/S2) | `view`, `create`, `edit`, `delete` (`branch`) | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `routes/web.php:806-810`; `app/Http/Controllers/DataController.php:900-1120` |
| **Batch Timetable Configuration & Consolidated Printing** (`/api/hod/batches/{id}/timetable`, `/hod/report-centre/workload-panel`, `/hod/consolidated-timetable/print`, `/hod/workload-report/print`) | `view`, `create`, `edit` (`institution`) | `view`, `create`, `edit` (`institution`) | `view`, `create`, `edit` (`institution`) | `view`, `create`, `edit` (`institution`) | `view`, `create`, `edit` (`stream`: SF) | `view`, `create`, `edit` (`stream`: S1/S2) | `view`, `create`, `edit` (`branch`) | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `routes/web.php:1055-1110`, `1532-1885`; `resources/views/hod_workload_panel.blade.php:1-265` |
| **Bulk Student Excel/CSV Upload & Credential Sheet Print** (`/api/students/bulk-import`, `/api/admin/batch-student-upload`, `/hod/batches/{id}/credentials/print`) | `view`, `create` (`institution`) | `view`, `create` (`institution`) | `view`, `create` (`institution`) | `view`, `create` (`institution`) | `view`, `create` (`stream`: SF) | `view`, `create` (`stream`) | `view`, `create` (`branch`) | `create` (`class` via `/api/students/bulk-import`) | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `routes/web.php:540-576`, `981-984`; `app/Http/Controllers/BatchStudentUploadController.php:18-140`; `app/Http/Controllers/DataController.php:1350-1490` |
| **Department Semester Pass % Matrix Entry** (`/api/hod/department-pass-stats`) | `view`, `edit` (`institution`) | `view`, `edit` (`institution`) | `view` (`institution`) | `view`, `edit` (`institution`) | `none` | `none` | `view`, `edit` (`branch`) | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `routes/web.php:2433`; `app/Http/Controllers/ExecutiveControlDeskController.php:362-393` |
| **GROUP 3: SUBJECT & VIRTUAL CLASSROOM** | | | | | | | | | | | | | | | | |
| **My Batches & Subject Allocation Workspace** (`/dashboard/lecturer`, `/api/lecturer/my-batches`) | `view`, `edit` (`institution`) | `view`, `edit` (`institution`) | `none` | `view`, `edit` (`institution`) | `view`, `edit` (`own` subjects) | `view`, `edit` (`own` subjects) | `view`, `edit` (`own` & `branch` subjects) | `view`, `edit` (`own` subjects) | `view`, `edit` (`own` subjects) | `view`, `edit` (`own` subjects) | `view`, `edit` (`own` subjects; Demonstrator uses `/dashboard/demonstrator`, Trade Instructor uses `/dashboard/tradeinstructor`) | `view`, `edit` (`own` subjects) | `none` | `none` | `none` | `routes/web.php:385-437`, `822`; `app/Http/Controllers/DataController.php:1125-1240` |
| **R2021 Theory Virtual Classroom** (`panelClassroom` in `lecturer_dashboard.blade.php`, `/api/classroom/{subjectId}/*`, `/classroom/{subjectId}/*`) | `view`, `create`, `edit`, `approve`, `delete` (`institution`) | `view`, `create`, `edit`, `approve`, `delete` (`institution`) | `none` | `view`, `create`, `edit`, `approve`, `delete` (`institution`) | `view`, `create`, `edit`, `approve`, `delete` (`own`) | `view`, `create`, `edit`, `approve`, `delete` (`own`) | `view`, `create`, `edit`, `approve`, `delete` (`own`/`branch`) | `view`, `create`, `edit`, `approve`, `delete` (`own`) | `view`, `create`, `edit`, `approve`, `delete` (`own`) | `view`, `create`, `edit`, `approve`, `delete` (`own`) | `none` | `none` | `none` | `none` | `none` | `routes/web.php:841-885`; `resources/views/lecturer_dashboard.blade.php:1095-1595`; `app/Http/Controllers/ClassroomController.php:25-950` |
| **R2026 Theory Virtual Classroom** (`/r26/classroom/theory/{subjectId}`, `/r26/classroom/{subjectId}`, `/api/r26/classroom/{subjectId}/*`) | `view`, `create`, `edit`, `approve`, `delete` (`institution`) | `view`, `create`, `edit`, `approve`, `delete` (`institution`) | `none` | `view`, `create`, `edit`, `approve`, `delete` (`institution`) | `view`, `create`, `edit`, `approve`, `delete` (`own`) | `view`, `create`, `edit`, `approve`, `delete` (`own`) | `view`, `create`, `edit`, `approve`, `delete` (`own`/`branch`) | `view`, `create`, `edit`, `approve`, `delete` (`own`) | `view`, `create`, `edit`, `approve`, `delete` (`own`) | `view`, `create`, `edit`, `approve`, `delete` (`own`) | `none` | `none` | `none` | `none` | `none` | `routes/web.php:581-617`; `app/Http/Controllers/R26ClassroomController.php:20-980`; `resources/views/r26/virtual_classroom_theory.blade.php:1-5847` |
| **R2021 Practical / Virtual Lab Classroom (Desktop & Mobile)** (`/classroom/practical/{subjectId}`, `/staff/mobile/virtual-lab/{subjectId}`, `/api/classroom/{subjectId}/practical/*`) | `view`, `create`, `edit`, `delete` (`institution`) | `view`, `create`, `edit`, `delete` (`institution`) | `none` | `view`, `create`, `edit`, `delete` (`institution`) | `view`, `create`, `edit`, `delete` (`own`) | `view`, `create`, `edit`, `delete` (`own`) | `view`, `create`, `edit`, `delete` (`own`/`branch`) | `view`, `create`, `edit`, `delete` (`own`) | `view`, `create`, `edit`, `delete` (`own`) | `view`, `create`, `edit`, `delete` (`own`) | `view`, `create`, `edit`, `delete` (`own` lab subjects for `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Instructor`) | `none` | `none` | `none` | `none` | `routes/web.php:899-938`; `app/Http/Controllers/VirtualClassroomPracticalController.php:18-450`; `app/Http/Controllers/StaffMobileVirtualLabController.php:18-120`; `resources/views/virtual_classroom_practical.blade.php:1-3113` |
| **R2026 Practical Virtual Classroom** (`/r26/classroom/practical/{subjectId}`, `/api/r26/classroom/practical/{subjectId}/*`) | `view`, `create`, `edit`, `delete` (`institution`) | `view`, `create`, `edit`, `delete` (`institution`) | `none` | `view`, `create`, `edit`, `delete` (`institution`) | `view`, `create`, `edit`, `delete` (`own`) | `view`, `create`, `edit`, `delete` (`own`) | `view`, `create`, `edit`, `delete` (`own`/`branch`) | `view`, `create`, `edit`, `delete` (`own`) | `view`, `create`, `edit`, `delete` (`own`) | `view`, `create`, `edit`, `delete` (`own`) | `view`, `create`, `edit`, `delete` (`own`) | `none` | `none` | `none` | `none` | `routes/web.php:628-646`; `app/Http/Controllers/R26VirtualClassroomPracticalController.php:20-620`; `resources/views/r26_practical/virtual_classroom_practical.blade.php:1-3030` |
| **R2026 Practicum & Basic Science Practicum Virtual Classrooms** (`/r26/classroom/practicum/{subjectId}`, `/api/r26/classroom/practicum/{subjectId}/*`) | `view`, `create`, `edit`, `delete` (`institution`) | `view`, `create`, `edit`, `delete` (`institution`) | `none` | `view`, `create`, `edit`, `delete` (`institution`) | `view`, `create`, `edit`, `delete` (`own`) | `view`, `create`, `edit`, `delete` (`own`) | `view`, `create`, `edit`, `delete` (`own`/`branch`) | `view`, `create`, `edit`, `delete` (`own`) | `view`, `create`, `edit`, `delete` (`own`) | `view`, `create`, `edit`, `delete` (`own`) | `view`, `create`, `edit`, `delete` (`own`) | `none` | `none` | `none` | `none` | `routes/web.php:649-694`; `app/Http/Controllers/R26VirtualClassroomPracticumController.php:22-1150`; `resources/views/r26_practicum/virtual_classroom_practicum.blade.php:1-3666`; `resources/views/r26_practicum/virtual_classroom_basic_science_practicum.blade.php:1-8545` |
| **R2021 & R2026 Engineering Drawing Virtual Classrooms** (`/r21/classroom/drawing/{subjectId}`, `/r26/classroom/drawing/{subjectId}`) | `view`, `create`, `edit` (`institution`) | `view`, `create`, `edit` (`institution`) | `none` | `view`, `create`, `edit` (`institution`) | `view`, `create`, `edit` (`own`) | `view`, `create`, `edit` (`own`) | `view`, `create`, `edit` (`own`/`branch`) | `view`, `create`, `edit` (`own`) | `view`, `create`, `edit` (`own`) | `view`, `create`, `edit` (`own`) | `view`, `create`, `edit` (`own`) | `none` | `none` | `none` | `none` | `routes/web.php:712-749`; `app/Http/Controllers/R26VirtualClassroomDrawingController.php:20-580`; `app/Http/Controllers/R21VirtualClassroomDrawingController.php:20-490` |
| **R2021 Engineering Workshop Virtual Classroom (Desktop & Mobile)** (`/r21/classroom/workshop/{subjectId}`, `/staff/mobile/workshop/{subjectId}`, `/dashboard/workshop`) | `view`, `create`, `edit` (`institution`) | `view`, `create`, `edit` (`institution`) | `none` | `view`, `create`, `edit` (`institution`) | `view`, `create`, `edit` (`own`) | `view`, `create`, `edit` (`own`) | `view`, `create`, `edit` (`own`/`branch`) | `view`, `create`, `edit` (`own`) | `view`, `create`, `edit` (`own`) | `view`, `create`, `edit` (`own`) | `view`, `create`, `edit` (`own`/`branch` for `Workshop_Superintendent`, `Trade_Instructor`, `Tradesman`, `Workshop_Instructor`, `Demonstrator`) | `none` | `none` | `none` | `none` | `routes/web.php:456-463`, `774-793`; `app/Http/Controllers/R21VirtualClassroomWorkshopController.php:20-640`; `resources/views/r21_workshop/virtual_classroom_workshop.blade.php:1-1909`; `resources/views/r21_workshop/mobile_workshop.blade.php:1-1919` |
| **R2021 Major Project Virtual Classroom** (`/r21/classroom/project/{subjectId}`) | `view`, `create`, `edit`, `delete` (`institution`) | `view`, `create`, `edit`, `delete` (`institution`) | `none` | `view`, `create`, `edit`, `delete` (`institution`) | `view`, `create`, `edit`, `delete` (`own`) | `none` | `view`, `create`, `edit`, `delete` (`own`/`branch`) | `view`, `create`, `edit`, `delete` (`own`) | `view`, `create`, `edit`, `delete` (`own`) | `view`, `create`, `edit`, `delete` (`own`) | `none` | `none` | `none` | `none` | `none` | `routes/web.php:761-771`; `app/Http/Controllers/R21VirtualClassroomMajorProjectController.php:20-430`; `resources/views/r21_project/virtual_classroom_project.blade.php:1-1962` |
| **R2021 Seminar Virtual Classroom & Peer Panel Evaluation** (`/r21/classroom/seminar/{subjectId}`, `/api/classroom/{subjectId}/seminar/*`, `/api/lecturer/today-seminars`, `/api/student/seminar/register`) | `view`, `create`, `edit` (`institution`) | `view`, `create`, `edit` (`institution`) | `none` | `view`, `create`, `edit` (`institution`) | `view`, `create`, `edit` (`own`) | `none` | `view`, `create`, `edit` (`own`/`branch`) | `view`, `create`, `edit` (`own`) | `view`, `create`, `edit` (`own`) | `view`, `create`, `edit` (`own` & invited seminars) | `none` | `none` | `none` | `view`, `create`, `edit` (`own` seminar topic, guide, PPT/PDF/Word uploads) | `none` | `routes/web.php:752-758`, `888-894`; `app/Http/Controllers/R21VirtualClassroomSeminarController.php:20-390`; `resources/views/r21_seminar/virtual_classroom_seminar.blade.php:1-3248`; `resources/views/student_dashboard.blade.php:760-839` |
| **R2026 Communication Skills in English (Code 1001) Classroom** (`/r26/classroom/english-1001/{subjectId}`) | `view`, `create`, `edit` (`institution`) | `view`, `create`, `edit` (`institution`) | `none` | `view`, `create`, `edit` (`institution`) | `view`, `create`, `edit` (`own`) | `view`, `create`, `edit` (`own`) | `view`, `create`, `edit` (`own`/`branch`) | `view`, `create`, `edit` (`own`) | `view`, `create`, `edit` (`own`) | `view`, `create`, `edit` (`own`) | `none` | `none` | `none` | `none` | `none` | `routes/web.php:696-709`; `app/Http/Controllers/R26VirtualClassroomEnglishController.php:20-520`; `resources/views/r26_english/virtual_classroom_english.blade.php:1-2652` |
| **R2026 Health & Physical Education (Code 1009) Classroom & Mobile Assessment** (`/r26/classroom/health-physical/{subjectId}`, `tab-remedial` in `staff_mobile_dashboard.blade.php`) | `view`, `create`, `edit` (`institution`) | `view`, `create`, `edit` (`institution`) | `none` | `view`, `create`, `edit` (`institution`) | `view`, `create`, `edit` (`own`) | `view`, `create`, `edit` (`own`) | `view`, `create`, `edit` (`own`/`branch`) | `none` | `none` | `view`, `create`, `edit` (`own`) | `none` | `view`, `create`, `edit` (`own` subjects across institution) | `none` | `none` | `none` | `routes/web.php:796-803`; `app/Http/Controllers/R26VirtualClassroomHealthPhysicalController.php:20-360`; `resources/views/r26_health_physical/virtual_classroom_health_physical.blade.php:1-1064`; `resources/views/staff_mobile_dashboard.blade.php:1224-1312`, `1663-1667` |
| **Pre-Class Learning Hub / Virtual Learning Vault (VLM)** (`/api/virtual-room/materials/*`, `/api/student/pre-class-alerts`) | `view`, `create`, `delete` (`institution`) | `view`, `create`, `delete` (`institution`) | `none` | `view`, `create`, `delete` (`institution`) | `view`, `create`, `delete` (`own`) | `view`, `create`, `delete` (`own`) | `view`, `create`, `delete` (`own`) | `view`, `create`, `delete` (`own`) | `view`, `create`, `delete` (`own`) | `view`, `create`, `delete` (`own`) | `view`, `create`, `delete` (`own`) | `view`, `create`, `delete` (`own`) | `none` | `view`, `edit` (`class`: view materials & mark alerts read) | `none` | `routes/web.php:246-252`; `app/Http/Controllers/VirtualLearningMaterialController.php:18-195`; `resources/views/partials/virtual_learning_hub_tab.blade.php:1-462` |
| **Remedial Coaching Rooms, Attendance & Assessments** (`/remedial-sessions`, `/api/remedial/*`, `/remedial/rooms/*`, `/hod/remedial-report/print`) | `view`, `create`, `edit`, `delete` (`institution`) | `view`, `create`, `edit`, `delete` (`institution`) | `none` | `view`, `create`, `edit`, `delete` (`institution`) | `view`, `create`, `edit`, `delete` (`own`/`stream`) | `view`, `create`, `edit`, `delete` (`own`/`stream`) | `view`, `create`, `edit`, `delete` (`own` + `branch` audit report) | `view`, `create`, `edit`, `delete` (`own`) | `view`, `create`, `edit`, `delete` (`own`) | `view`, `create`, `edit`, `delete` (`own`) | `view`, `create`, `edit`, `delete` (`own`) | `none` | `none` | `none` | `none` | `routes/web.php:1026-1030`, `1322-1398`, `1887-1907`; `app/Http/Controllers/RemedialController.php:18-410`; `resources/views/remedial_dashboard.blade.php:1-1076` |
| **GROUP 4: ATTENDANCE & SBTE LOGS** | | | | | | | | | | | | | | | | |
| **Period-Wise Class Attendance & Teaching Log Entry** (`/staff/attendance-log`, `/api/staff/attendance/*`) | `view`, `create`, `edit`, `delete` (`institution`) | `view`, `create`, `edit`, `delete` (`institution`) | `none` | `view`, `create`, `edit`, `delete` (`institution`) | `view`, `create`, `edit`, `delete` (`own`) | `view`, `create`, `edit`, `delete` (`own`) | `view`, `create`, `edit`, `delete` (`own`) | `view`, `create`, `edit`, `delete` (`own`) | `view`, `create`, `edit`, `delete` (`own`) | `view`, `create`, `edit`, `delete` (`own`) | `view`, `create`, `edit`, `delete` (`own`) | `view`, `create`, `edit`, `delete` (`own`) | `none` | `none` | `none` | `routes/web.php:1910-1915`, `1944`; `app/Http/Controllers/AttendanceController.php:20-520`; `resources/views/staff_attendance.blade.php:1-1255` |
| **SBTE TEAMS Subject Log PDF Import & Lesson Plan Date Sync** (`/api/staff/attendance/import-sbte-pdf`, `/api/staff/attendance/sync-from-lesson-plan`, `/api/classroom/subject/{id}/upload-teams-attendance`) | `create`, `edit` (`institution`) | `create`, `edit` (`institution`) | `none` | `create`, `edit` (`institution`) | `create`, `edit` (`own`) | `create`, `edit` (`own`) | `create`, `edit` (`own`) | `create`, `edit` (`own`) | `create`, `edit` (`own`) | `create`, `edit` (`own`) | `create`, `edit` (`own`) | `create`, `edit` (`own`) | `none` | `none` | `none` | `routes/web.php:707-708`, `1916-1917`; `app/Http/Controllers/SbteSubjectLogImportController.php:18-240` |
| **Tutor Semester Attendance Register & Student Roll Numbers** (`/api/tutor/attendance/students`, `/api/tutor/attendance/roll-numbers`, `/api/tutor/attendance/consolidated`, `/tutor/attendance/report/print`) | `view`, `edit` (`institution`) | `view`, `edit` (`institution`) | `none` | `view`, `edit` (`institution`) | `view`, `edit` (`class` if Tutor) | `view`, `edit` (`class` if Tutor) | `view`, `edit` (`class` if Tutor) | `view`, `edit` (`class`) | `none` | `none` | `view`, `edit` (`class` if Tutor) | `none` | `none` | `none` | `none` | `routes/web.php:1918-1923`; `app/Http/Controllers/AttendanceController.php:665-960`; `resources/views/tutor_dashboard.blade.php:443-682` |
| **Tutor Special Attendance / Condonation Register (Clause 10 / Rule 7)** (`/api/tutor/attendance/condonation-register`, `/api/tutor/attendance/special/*`, `/tutor/attendance/condonation-certificate*`) | `view`, `create`, `delete` (`institution`) | `view`, `create`, `delete` (`institution`) | `none` | `view`, `create`, `delete` (`institution`) | `view`, `create`, `delete` (`class` if Tutor) | `view`, `create`, `delete` (`class` if Tutor) | `view`, `create`, `delete` (`class` if Tutor) | `view`, `create`, `delete` (`class`) | `none` | `none` | `view`, `create`, `delete` (`class` if Tutor) | `none` | `none` | `none` | `none` | `routes/web.php:1926-1932`; `app/Http/Controllers/TutorSpecialAttendanceController.php:18-320`; `resources/views/tutor_dashboard.blade.php:4367-4448` |
| **Department Attendance & Log Summary Report** (`/hod/attendance-summary/print`) | `view` (`institution`) | `view` (`institution`) | `none` | `view` (`institution`) | `view` (`stream`: SF) | `view` (`stream`: S1/S2) | `view` (`branch`) | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `routes/web.php:1112-1320`; `resources/views/hod_report_centre.blade.php:76-98` |
| **Student Attendance Review, Certificate & No-Due Slip** (`/student/attendance`, `/student/attendance-certificate/print`, `/student/nodue-slip/print`, `tab-attendance` in `parent_dashboard.blade.php`) | `none` | `view` (`institution` via Parent view) | `none` | `none` | `none` | `none` | `view` (`branch` via Parent view) | `view` (`class` via Parent view) | `none` | `view` (`class` via Parent view) | `none` | `none` | `none` | `view`, `create` (`own` attendance & leave application) | `view` (`own` ward attendance) | `routes/web.php:270-272`, `2426`; `app/Http/Controllers/StudentAttendanceController.php:25-390`; `app/Http/Controllers/ParentDashboardController.php:115-260` |
| **GROUP 5: EXAMS / SERIES / QP / ONLINE TESTS** | | | | | | | | | | | | | | | | |
| **Question Bank Management & AI Question Seeding** (`/api/classroom/{id}/question-bank*`, `/api/classroom/question-bank/template`) | `view`, `create`, `edit` (`institution`) | `view`, `create`, `edit` (`institution`) | `none` | `view`, `create`, `edit` (`institution`) | `view`, `create`, `edit` (`own`) | `view`, `create`, `edit` (`own`) | `view`, `create`, `edit` (`own`) | `view`, `create`, `edit` (`own`) | `view`, `create`, `edit` (`own`) | `view`, `create`, `edit` (`own`) | `none` | `none` | `none` | `none` | `none` | `routes/web.php:883-885`, `895-896`; `app/Http/Controllers/ClassroomController.php:960-1180` |
| **Series Exam Blueprint, AI QP Generation, Scheme & Marks Entry (R21 & R26)** (`/api/classroom/{id}/generate-summative-paper`, `/api/r26/classroom/{id}/series-exams/*`, `/api/r26/classroom/practicum/{id}/series-qp/*`) | `view`, `create`, `edit`, `approve` (`institution`) | `view`, `create`, `edit`, `approve` (`institution`) | `none` | `view`, `create`, `edit`, `approve` (`institution`) | `view`, `create`, `edit`, `approve` (`own`) | `view`, `create`, `edit`, `approve` (`own`) | `view`, `create`, `edit`, `approve` (`own`) | `view`, `create`, `edit`, `approve` (`own`) | `view`, `create`, `edit`, `approve` (`own`) | `view`, `create`, `edit`, `approve` (`own`) | `view`, `create`, `edit` (`own` lab/workshop tests) | `view`, `create`, `edit` (`own` fitness tests CA1/CA2) | `none` | `view` (`own` series marks) | `view` (`own` ward series marks) | `routes/web.php:605-614`, `689-694`, `855-859`; `app/Http/Controllers/R26ClassroomController.php:480-720` |
| **Online Test Engine (Publish, Take Test, Auto-Grade, Answer Key)** (`/api/classroom/{id}/publish-online-test`, `/student/online-tests/{id}/start`, `/api/student/online-tests/*`, `/api/test-engine/report/{id}`) | `view`, `create`, `delete` (`institution`) | `view`, `create`, `delete` (`institution`) | `none` | `view`, `create`, `delete` (`institution`) | `view`, `create`, `delete` (`own`) | `view`, `create`, `delete` (`own`) | `view`, `create`, `delete` (`own`) | `view`, `create`, `delete` (`own`) | `view`, `create`, `delete` (`own`) | `view`, `create`, `delete` (`own`) | `none` | `none` | `none` | `view`, `create` (`own`: take active test & view key) | `view` (`own` ward test status) | `routes/web.php:860-863`, `995-999`, `1005-1006`; `app/Http/Controllers/TestEngineController.php:18-360` |
| **Student Mock Practice Test Engine** (`/student/mock-test`, `/api/student/mock-test/*`) | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `view`, `create` (`own`) | `none` | `routes/web.php:1002-1004`; `app/Http/Controllers/StudentMockTestController.php:15-140` |
| **GROUP 6: CIA CONSOLIDATION, COURSE FILES & NBA ATTAINMENT** | | | | | | | | | | | | | | | | |
| **Consolidated Batch CIA Mark Report, Tutor Submission & HOD Lock** (`/api/consolidated-cia`, `/api/consolidated-cia/submit`, `/api/consolidated-cia/lock`, `/consolidated-cia/print`) | `view`, `approve` (`institution`: lock/unlock) | `view`, `approve` (`institution`: lock/unlock) | `none` | `view`, `approve` (`institution`: lock/unlock) | `view` (`stream`: SF) | `view` (`stream`: S1/S2) | `view`, `approve` (`branch`: lock/unlock batch CIA) | `view`, `edit` (`class`: verify & submit to HOD) | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `routes/web.php:1939-1942`; `app/Http/Controllers/ConsolidatedCiaReportController.php:27-95`; `resources/views/hod_dashboard.blade.php:607-703`; `resources/views/tutor_dashboard.blade.php:769-849` |
| **Course Files (R2021 15-Doc Dashboard & R2026 Course File Views)** (`/course-files`, `/api/course-files/*`, `/r26/classroom/course-file/{id}`, `/hod/course-files-report/print`) | `view`, `create`, `edit` (`institution`) | `view`, `create`, `edit` (`institution`) | `none` | `view`, `create`, `edit` (`institution`) | `view`, `create`, `edit` (`own` + `stream` audit) | `view`, `create`, `edit` (`own` + `stream` audit) | `view`, `create`, `edit` (`own` + `branch` audit) | `view`, `create`, `edit` (`own`) | `view`, `create`, `edit` (`own`) | `view`, `create`, `edit` (`own`) | `view`, `create`, `edit` (`own`) | `none` | `none` | `none` | `none` | `routes/web.php:584-587`, `644-646`, `650-651`, `823-836`, `1400-1468`; `app/Http/Controllers/CourseFileController.php:18-380`; `resources/views/course_files_dashboard.blade.php:1-895` |
| **Mid-Semester & Course Exit Surveys (Indirect Attainment)** (`/api/classroom/{id}/survey/*`, `/api/classroom/{id}/course-exit/*`, `/api/r26/classroom/{id}/midsem-survey/*`, `/api/r26/classroom/{id}/exit-survey/*`, `/student/survey/{id}`, `/student/course-exit/{id}`) | `view`, `create`, `edit` (`institution`) | `view`, `create`, `edit` (`institution`) | `none` | `view`, `create`, `edit` (`institution`) | `view`, `create`, `edit` (`own`) | `view`, `create`, `edit` (`own`) | `view`, `create`, `edit` (`own`) | `view`, `create`, `edit` (`own`) | `view`, `create`, `edit` (`own`) | `view`, `create`, `edit` (`own`: initiate/close/print) | `none` | `view`, `create`, `edit` (`own`) | `none` | `view`, `create` (`own`: submit survey responses) | `none` | `routes/web.php:620-625`, `1009-1023`; `app/Http/Controllers/MidSemSurveyController.php:15-210`; `app/Http/Controllers/CourseExitSurveyController.php:15-220` |
| **Course CO-PO Attainment & NBA Program Attainment (Criterion 3)** (`/api/classroom/{id}/attainment-summary`, `/api/r26/classroom/{id}/attainment-summary`, `/hod/program-attainment/{classroomId}*`) | `view`, `create`, `edit` (`institution`) | `view`, `create`, `edit` (`institution`) | `none` | `view`, `create`, `edit` (`institution`) | `view`, `create`, `edit` (`stream`: SF) | `view`, `create`, `edit` (`stream`: S1/S2) | `view`, `create`, `edit` (`branch` PO/PSO attainment) | `view`, `edit` (`own` subject CO-PO) | `view`, `edit` (`own` subject CO-PO) | `view`, `edit` (`own` subject CO-PO) | `view`, `edit` (`own` workshop/lab CO-PO) | `view`, `edit` (`own` subject CO-PO) | `none` | `none` | `none` | `routes/web.php:611`, `875`, `1051-1053`; `app/Http/Controllers/ProgramAttainmentController.php:18-210`; `resources/views/hod/program_attainment_dashboard.blade.php:1-258` |
| **HOD SBTE Academic Audit & NBA 9-Criteria Audit Consoles** (`/hod/sbte-audit*`, `/api/hod/sbte-audit/*`, `/hod/nba-audit*`) | `view`, `create`, `edit` (`institution`) | `view`, `create`, `edit` (`institution`) | `none` | `view`, `create`, `edit` (`institution`) | `view`, `create`, `edit` (`stream`: SF) | `view`, `create`, `edit` (`stream`: S1/S2) | `view`, `create`, `edit` (`branch`) | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `routes/web.php:1947-2305`; `resources/views/hod_sbte_audit.blade.php:1-466`; `resources/views/hod_nba_audit.blade.php:1-233` |
| **Staff Professional Activities (FDPs, Workshops, Publications)** (`/staff/professional-activities*`, `/api/hod/sbte-audit/fetch-staff-activities`) | `view`, `create`, `delete` (`own` + `institution` view) | `view`, `create`, `delete` (`own` + `institution` view) | `none` | `view`, `create`, `delete` (`own`) | `view`, `create`, `delete` (`own` + `stream` audit) | `view`, `create`, `delete` (`own` + `stream` audit) | `view`, `create`, `delete` (`own` + `branch` audit) | `view`, `create`, `delete` (`own`) | `view`, `create`, `delete` (`own`) | `view`, `create`, `delete` (`own`) | `view`, `create`, `delete` (`own`) | `view`, `create`, `delete` (`own`) | `none` | `none` | `none` | `routes/web.php:2307-2407`; `resources/views/staff_professional_activities.blade.php:1-214` |
| **GROUP 7: TUTORING, MENTORING & ACTIVITY POINTS** | | | | | | | | | | | | | | | | |
| **Tutor Progress Report & Individual Student Progress Card** (`/api/tutor/progress-report`, `/tutor/progress-report/print`, `/tutor/progress-report/student*`) | `view` (`institution`) | `view` (`institution`) | `none` | `view` (`institution`) | `view` (`class` if Tutor) | `view` (`class` if Tutor) | `view` (`class` if Tutor) | `view` (`class`) | `none` | `none` | `view` (`class` if Tutor) | `none` | `none` | `none` | `none` | `routes/web.php:1933-1936`; `app/Http/Controllers/TutorController.php:18-240`; `resources/views/tutor_dashboard.blade.php:684-767` |
| **Student Mentoring Diary, Sessions, Backlogs & Disciplinary Records** (`/api/mentoring/*`, `/tutor/mentoring-diary/{regNo}`, `/student/mentoring-diary`, `/diary/{regNo}/print`) | `view`, `create`, `edit`, `approve`, `delete` (`institution`) | `view`, `create`, `edit`, `approve`, `delete` (`institution`) | `none` | `view`, `create`, `edit`, `approve`, `delete` (`institution`) | `view`, `create`, `edit`, `approve`, `delete` (`class` if Tutor/Mentor) | `view`, `create`, `edit`, `approve`, `delete` (`class` if Tutor/Mentor) | `view`, `create`, `edit`, `approve`, `delete` (`branch`) | `view`, `create`, `edit`, `approve`, `delete` (`class`) | `view`, `create`, `edit`, `approve`, `delete` (`class` assigned mentees) | `none` (unless Mentor/Tutor) | `view`, `create`, `edit`, `approve`, `delete` (`class` if Mentor/Tutor) | `none` (unless Mentor) | `none` | `view`, `create`, `edit` (`own` profile, family, education, academic, board, extra-curricular, leaves; read-only meetings) | `view` (`own` ward remarks & backlogs) | `routes/web.php:274-279`, `941-966`; `app/Http/Controllers/MentoringController.php:25-1080`; `resources/views/mentoring_diary_modal.blade.php:1-519`; `resources/views/student_mentoring_diary_full.blade.php:1-1534` |
| **Student Leave Application & Tutor/Mentor Leave Approval** (`/api/mentoring/leave/save`, `/api/mentoring/leave/approve`, `/diary/{regNo}/leave-report`, `/classroom/{id}/condonation-report`) | `view`, `create`, `approve` (`institution`) | `view`, `create`, `approve` (`institution`) | `none` | `view`, `create`, `approve` (`institution`) | `view`, `create`, `approve` (`class` if Tutor/Mentor) | `view`, `create`, `approve` (`class` if Tutor/Mentor) | `view`, `create`, `approve` (`branch`/`class`) | `view`, `create`, `approve` (`class`) | `view`, `create`, `approve` (`class` mentees) | `none` | `view`, `create`, `approve` (`class` if Tutor/Mentor) | `none` | `none` | `view`, `create` (`own` leave request) | `none` | `routes/web.php:943`, `950-951`, `959-960`; `app/Http/Controllers/MentoringController.php:420-520`; `resources/views/tutor_dashboard.blade.php:1052-1124` |
| **Extra-Curricular Activity Points Claim & Tutor Verification** (`/api/student/activity-points*`, `/api/tutor/activity-points*`, `/hod/activity-points-report/print`) | `view`, `approve` (`institution`) | `view`, `approve` (`institution`) | `none` | `view`, `approve` (`institution`) | `view` (`stream`: SF) | `view` (`stream`) | `view` (`branch` report) | `view`, `approve` (`class`: verify/reject claims) | `view` (`class` mentee diary) | `none` | `view`, `approve` (`class` if Tutor) | `none` | `none` | `view`, `create` (`own` activity claim + certificate upload) | `none` | `routes/web.php:969-973`, `1470-1530`; `app/Http/Controllers/ActivityPointsController.php:15-190`; `resources/views/tutor_dashboard.blade.php:1013-1050`; `resources/views/student_dashboard.blade.php:650-758` |
| **GROUP 8: LEAVE / CCL, TIME PUNCH & SF OFFICE** | | | | | | | | | | | | | | | | |
| **Staff Leave Governance Portal (Apply, History, PDF Slip, Master Ledger)** (`/api/staff/leave/*`, `/staff/leave/{id}/pdf`, `/staff/leave/reports`) | `view`, `approve` (`institution`: Stage 3 Aided / Stage 4 SF final approval & master ledger) | `view`, `approve` (`institution`: Stage 3 Aided / Stage 4 SF final approval & master ledger) | `view` (`institution` snapshot) | `view` (`institution` master ledger) | `view`, `create`, `approve` (`own` apply + `stream` Stage 3 SF approval & ledger) | `view`, `create`, `approve` (`own` apply + `stream` Stage 2 approval & ledger) | `view`, `create`, `approve` (`own` apply + `branch` Stage 1 Aided / Stage 2 SF approval & ledger) | `view`, `create` (`own` apply & history) | `view`, `create` (`own` apply & history) | `view`, `create` (`own` apply & history) | `view`, `create` (`own` apply & history) | `view`, `create` (`own` apply & history) | `view`, `approve` (`stream`: Stage 1 SF Office quota verification) | `none` | `none` | `routes/web.php:2413-2418`; `app/Http/Controllers/StaffLeaveController.php:18-620`; `resources/views/staff_leave_reports.blade.php:1-862` |
| **SF Office Administration Console (Leave Queue, Backfill, Manual CCL, Rules, Balances)** (`/dashboard/sf-office`, `/api/sf-office/*`) | `view`, `create`, `edit`, `approve`, `delete` (`stream`: SF) | `view`, `create`, `edit`, `approve`, `delete` (`stream`: SF) | `none` | `view`, `create`, `edit`, `approve`, `delete` (`stream`: SF) | `view`, `create`, `edit`, `approve`, `delete` (`stream`: SF) | `view`, `create`, `edit`, `approve`, `delete` (`stream`: SF for `Gen_Dept_Coordinator_Self_Finance`) | `none` | `none` | `none` | `none` | `none` | `none` | `view`, `create`, `edit`, `approve`, `delete` (`stream`: SF) | `none` | `none` | `routes/web.php:465-483`; `app/Http/Controllers/SfOfficeController.php:22-580`; `resources/views/sf_office_dashboard.blade.php:1-2607` |
| **SF Biometric Face Registration & Geofenced Mobile Punch** (`/sf-attendance/face-punch`, `/sf-attendance/register-face`, `/sf-attendance/verify-and-punch`, `/api/staff/my-punch-log`) | `view`, `create` (`institution`) | `view`, `create` (`institution`) | `none` | `view`, `create` (`institution`) | `view`, `create` (`own` SF punch) | `view`, `create` (`own` if SF; blocked for Aided) | `view`, `create` (`own` if SF branch `EEE/CT/AU`) | `view`, `create` (`own` if SF) | `view`, `create` (`own` if SF) | `view`, `create` (`own` if SF) | `view`, `create` (`own` if SF) | `view`, `create` (`own` if SF) | `none` | `none` | `none` | `routes/web.php:2419`, `2452-2454`; `app/Http/Controllers/StaffAttendanceMobileController.php:38-350`; `resources/views/sf_staff_face_punch.blade.php:1-1436` |
| **SF Campus Geofence Setup & Master Biometric Attendance Report** (`/sf-attendance/geofence-setup`, `/sf-attendance/attendance-report`, `/sf-attendance/delete-punch/{id}`, `/sf-attendance/reset-face/{staffId}`) | `view`, `edit`, `delete` (`institution`) | `view`, `edit`, `delete` (`institution`) | `none` | `view`, `edit`, `delete` (`institution`) | `view`, `edit`, `delete` (`stream`: SF) | `view`, `edit`, `delete` (`stream`: SF for `Gen_Dept_Coordinator_Self_Finance`) | `none` | `none` | `none` | `none` | `none` | `none` | `view` (`stream`: SF via `/api/sf-office/punches`) | `none` | `none` | `routes/web.php:2455-2459`; `app/Http/Controllers/StaffAttendanceMobileController.php:355-560`; `resources/views/sf_campus_geofence_setup.blade.php:1-504`; `resources/views/sf_staff_attendance_report.blade.php:1-1992` |
| **GROUP 9: NOTICES, EVENTS, CALENDAR, SUPPORT & AI ASSISTANT** | | | | | | | | | | | | | | | | |
| **Executive Flash Notice Broadcast & Revocation** (`/api/admin/flash-notices*`, `/api/flash-notices/active`) | `view`, `create`, `delete` (`institution`) | `view`, `create`, `delete` (`institution`) | `view`, `create`, `delete` (`institution`) | `view`, `create`, `delete` (`institution`) | `view` (`institution`) | `view` (`institution`) | `view` (`institution`) | `view` (`institution`) | `view` (`institution`) | `view` (`institution`) | `view` (`institution`) | `view` (`institution`) | `view` (`institution`) | `view` (`institution`) | `none` | `routes/web.php:2437-2440`; `app/Http/Controllers/ExecutiveFlashNoticeController.php:15-160`; `resources/views/admin_control_desk.blade.php:606-643`, `2845-3000` |
| **Department Notice Creation & Deletion** (`/api/hod/notice/create`, `/api/hod/notice/delete`) | `view`, `create`, `delete` (`institution`) | `view`, `create`, `delete` (`institution`) | `none` | `view`, `create`, `delete` (`institution`) | `view`, `create`, `delete` (`stream`: SF) | `view` (`stream`) | `view`, `create`, `delete` (`branch`) | `view` (`branch`) | `view` (`branch`) | `view` (`branch`) | `view` (`branch`) | `view` (`branch`) | `none` | `view` (`branch`) | `view` (`branch`) | `routes/web.php:333-334`; `app/Http/Controllers/HodMobileController.php:250-320`; `resources/views/hod_mobile_dashboard.blade.php:953-1033` |
| **College Targeted Event Scheduler & Campus Event Feed** (`/api/principal/events*`, `/api/campus-event/today`) | `view`, `create`, `delete` (`institution`) | `view`, `create`, `delete` (`institution`) | `view`, `create`, `delete` (`institution`) | `view`, `create`, `delete` (`institution`) | `view` (`institution`) | `view` (`institution`) | `view` (`institution`) | `view` (`institution`) | `view` (`institution`) | `view` (`institution`) | `view` (`institution`) | `view` (`institution`) | `view` (`institution`) | `view` (`institution`) | `none` | `routes/web.php:2443-2447`; `app/Http/Controllers/PrincipalScheduledEventController.php:15-210`; `resources/views/admin_control_desk.blade.php:645-683`, `3003-3222` |
| **HOD Academic Calendar Preparation & SITTTR PDF Parser** (`/hod/academic-calendar*`, `/api/academic-calendar/*`) | `view`, `create`, `edit` (`institution`) | `view`, `create`, `edit` (`institution`) | `none` | `view`, `create`, `edit` (`institution`) | `view`, `create`, `edit` (`stream`: SF) | `view`, `create`, `edit` (`stream`: S1/S2) | `view`, `create`, `edit` (`branch`) | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `none` | `routes/web.php:338-341`; `app/Http/Controllers/AcademicCalendarController.php:18-260`; `resources/views/hod_academic_calendar.blade.php:1-225` |
| **WebRTC Live Remote Support Desk** (`/api/support/request`, `/api/support/sessions`, `/api/support/accept`, `/api/support/signal*`, `/api/support/end`) | `view`, `create`, `approve`, `delete` (`institution`: accept & view remote screen) | `view`, `create`, `approve`, `delete` (`institution`: accept & view remote screen) | `none` | `view`, `create`, `approve`, `delete` (`institution`: accept & view remote screen) | `create`, `delete` (`own`: request assist) | `create`, `delete` (`own`: request assist) | `create`, `delete` (`own`: request assist) | `create`, `delete` (`own`: request assist) | `create`, `delete` (`own`: request assist) | `create`, `delete` (`own`: request assist) | `create`, `delete` (`own`: request assist) | `create`, `delete` (`own`: request assist) | `none` | `none` | `none` | `routes/web.php:523-528`; `app/Http/Controllers/SupportDeskController.php:15-165`; `resources/views/partials/admin_support_desk_window.blade.php:1-293`; `resources/views/partials/support_desk_overlay.blade.php:1-462` |
| **Carmie AI Assistant** (`/api/carmie/ask`, `/api/carmie/suggestions`) | `view`, `create` (`institution`) | `view`, `create` (`institution`) | `none` | `view`, `create` (`institution`) | `view`, `create` (`own`) | `view`, `create` (`own`) | `view`, `create` (`own`) | `view`, `create` (`own`) | `view`, `create` (`own`) | `view`, `create` (`own`) | `view`, `create` (`own`) | `view`, `create` (`own`) | `none` | `none` | `none` | `routes/web.php:684-685`; `app/Http/Controllers/CarmieAssistantController.php:18-190`; `resources/views/partials/carmie_assistant.blade.php:1-434` |
| **Staff Birthday Wishes & DOB Self-Service** (`/api/staff/birthdays/today`, `/api/staff/birthdays/wish`, `/api/staff/profile/update-dob`) | `view`, `create`, `edit` (`institution`) | `view`, `create`, `edit` (`institution`) | `view`, `create`, `edit` (`institution`) | `view`, `create`, `edit` (`institution`) | `view`, `create`, `edit` (`institution`) | `view`, `create`, `edit` (`institution`) | `view`, `create`, `edit` (`institution`) | `view`, `create`, `edit` (`institution`) | `view`, `create`, `edit` (`institution`) | `view`, `create`, `edit` (`institution`) | `view`, `create`, `edit` (`institution`) | `view`, `create`, `edit` (`institution`) | `view`, `create`, `edit` (`institution`) | `none` | `none` | `routes/web.php:991-993`; `app/Http/Controllers/StaffBirthdayController.php:15-130`; `resources/views/partials/birthday_wish_modal.blade.php:1-306` |
| **WebAuthn Biometric Passkeys & Push Notifications** (`/api/webauthn/*`, `/api/notifications/subscribe`, `/api/notifications/broadcast`) | `view`, `create`, `delete` (`own` passkeys + `institution` broadcast) | `view`, `create`, `delete` (`own` passkeys + `institution` broadcast) | `view`, `create`, `delete` (`own` passkeys) | `view`, `create`, `delete` (`own` passkeys + `institution` broadcast) | `view`, `create`, `delete` (`own` passkeys) | `view`, `create`, `delete` (`own` passkeys) | `view`, `create`, `delete` (`own` passkeys) | `view`, `create`, `delete` (`own` passkeys) | `view`, `create`, `delete` (`own` passkeys) | `view`, `create`, `delete` (`own` passkeys) | `view`, `create`, `delete` (`own` passkeys) | `view`, `create`, `delete` (`own` passkeys) | `view`, `create`, `delete` (`own` passkeys) | `view`, `create`, `delete` (`own` passkeys & push subscribe) | `none` | `routes/web.php:152-153`, `159-164`; `app/Http/Controllers/WebAuthnController.php:18-240`; `app/Http/Controllers/PushNotificationController.php:15-110` |

---

---

# SECTION 4: ROUTES & SCREENS

## 4.1 Complete Route Inventory (`routes/web.php` & `bootstrap/app.php`)

### Route Architecture & Middleware Notes
- **Route Files on Disk**: Only `routes/web.php` (`routes/web.php:1-2464`) exists in the `routes/` directory. Neither `routes/api.php` nor `routes/console.php` exists on disk (although `bootstrap/app.php:8-12` passes `commands: __DIR__.'/../routes/console.php'` and registers the built-in health check route `GET /up` via `health: '/up'`).
- **Global `web` Middleware Group**: Because `routes/web.php` is loaded via `withRouting(web: __DIR__.'/../routes/web.php')` in `bootstrap/app.php:9`, **every route in `routes/web.php` automatically runs under the `web` middleware group**, which includes `\App\Http\Middleware\UpdateUserOnlineStatus::class` (`bootstrap/app.php:14-16`, `app/Http/Middleware/UpdateUserOnlineStatus.php:15-28`). Additionally, lines `243-2420`, `2429-2448`, and `2451-2460` wrap routes in an explicit nested `Route::middleware(['web'])->group(...)`.
- **Prefix Groups**:
  - `Route::prefix('api/sf-office')->group(...)` (`routes/web.php:468-482`): Prepends `/api/sf-office` to 13 routes (`routes/web.php:469-481`).
  - `Route::prefix('api/remedial')->group(...)` (`routes/web.php:1892-1907`): Prepends `/api/remedial` to 14 routes (`routes/web.php:1893-1906`).
- **Total Routes**: **588 routes** (`1` built-in health route in `bootstrap/app.php:11` + `587` `Route::` definitions in `routes/web.php:19-2460`). Every single route is listed in order below without omission.

| # | HTTP Method(s) | URI | Route Name | Controller@method or Closure (`file:line`) | Route Middleware | Role(s) That Can Reach It |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 0 | `GET` | `/up` | - | Laravel Built-in Health Check (`bootstrap/app.php:11`) | None (Framework Health Endpoint) | Public / Unauthenticated Infrastructure Health Probe (`bootstrap/app.php:11`) |
| 1 | `GET` | `/api/system/session-check` | - | Closure (`routes/web.php:54-71`) | `web` (`UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:54`) |
| 2 | `GET` | `/api/users/online-status` | - | Closure (`routes/web.php:73-87`) | `web` (`UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:73`) |
| 3 | `GET` | `/` | `login` | Closure (`routes/web.php:90-113`) | `web` (`UpdateUserOnlineStatus`) | Public (Unauthenticated login screen / POST credential handler; redirects authenticated session to role dashboard; `routes/web.php:90-185`) |
| 4 | `GET` | `/login` | - | Closure (`routes/web.php:115-117`) | `web` (`UpdateUserOnlineStatus`) | Public (Unauthenticated login screen / POST credential handler; redirects authenticated session to role dashboard; `routes/web.php:90-185`) |
| 5 | `GET` | `/virtual-lab/user-manual` | - | Closure (`routes/web.php:121-129`) | `web` (`UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:121`) |
| 6 | `GET` | `/virtual-lab/manual` | - | Closure (`routes/web.php:131-133`) | `web` (`UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:131`) |
| 7 | `GET` | `/virtual-lab/user-manual/pdf` | - | Closure (`routes/web.php:135-144`) | `web` (`UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:135`) |
| 8 | `GET` | `/virtual-lab/pdf` | - | Closure (`routes/web.php:146-148`) | `web` (`UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:146`) |
| 9 | `POST` | `/login` | - | `AuthController@login` (`routes/web.php:150` -> `app/Http/Controllers/AuthController.php`) | `web` (`UpdateUserOnlineStatus`) | Public (Unauthenticated login screen / POST credential handler; redirects authenticated session to role dashboard; `routes/web.php:90-185`) |
| 10 | `POST` | `/api/auth/auto-login` | - | `AuthController@autoLoginViaToken` (`routes/web.php:151` -> `app/Http/Controllers/AuthController.php`) | `web` (`UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:151`) |
| 11 | `POST` | `/api/notifications/subscribe` | - | `PushNotificationController@subscribe` (`routes/web.php:152` -> `app/Http/Controllers/PushNotificationController.php`) | `web` (`UpdateUserOnlineStatus`) | All Authenticated Users (Staff, Executives, `Student`, `Parent` for read; Staff/HOD/Executives for write; `routes/web.php:152`) |
| 12 | `POST` | `/api/notifications/broadcast` | - | `PushNotificationController@sendBroadcast` (`routes/web.php:153` -> `app/Http/Controllers/PushNotificationController.php`) | `web` (`UpdateUserOnlineStatus`) | All Authenticated Users (Staff, Executives, `Student`, `Parent` for read; Staff/HOD/Executives for write; `routes/web.php:153`) |
| 13 | `POST` | `/register/student` | - | `AuthController@registerStudent` (`routes/web.php:154` -> `app/Http/Controllers/AuthController.php`) | `web` (`UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:154`) |
| 14 | `POST` | `/register/staff` | - | `AuthController@registerStaff` (`routes/web.php:155` -> `app/Http/Controllers/AuthController.php`) | `web` (`UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:155`) |
| 15 | `GET` | `/logout` | - | `AuthController@logout` (`routes/web.php:156` -> `app/Http/Controllers/AuthController.php`) | `web` (`UpdateUserOnlineStatus`) | All Authenticated Users (clears session & redirects to `/`; `routes/web.php:156` -> `AuthController@logout`) |
| 16 | `POST` | `/api/webauthn/register-options` | - | `WebAuthnController@getRegisterOptions` (`routes/web.php:159` -> `app/Http/Controllers/WebAuthnController.php`) | `web` (`UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:159`) |
| 17 | `POST` | `/api/webauthn/register` | - | `WebAuthnController@registerCredential` (`routes/web.php:160` -> `app/Http/Controllers/WebAuthnController.php`) | `web` (`UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:160`) |
| 18 | `POST` | `/api/webauthn/auth-options` | - | `WebAuthnController@getAuthOptions` (`routes/web.php:161` -> `app/Http/Controllers/WebAuthnController.php`) | `web` (`UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:161`) |
| 19 | `POST` | `/api/webauthn/authenticate` | - | `WebAuthnController@authenticate` (`routes/web.php:162` -> `app/Http/Controllers/WebAuthnController.php`) | `web` (`UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:162`) |
| 20 | `GET` | `/api/webauthn/credentials` | - | `WebAuthnController@listUserCredentials` (`routes/web.php:163` -> `app/Http/Controllers/WebAuthnController.php`) | `web` (`UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:163`) |
| 21 | `DELETE` | `/api/webauthn/credentials/{id}` | - | `WebAuthnController@deleteCredential` (`routes/web.php:164` -> `app/Http/Controllers/WebAuthnController.php`) | `web` (`UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:164`) |
| 22 | `POST` | `/api/auth/recover-account` | - | Closure (`routes/web.php:166-240`) | `web` (`UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:166`) |
| 23 | `POST` | `/api/virtual-room/materials/upload` | - | `VirtualLearningMaterialController@uploadMaterial` (`routes/web.php:246` -> `app/Http/Controllers/VirtualLearningMaterialController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:246`) |
| 24 | `GET` | `/api/virtual-room/materials/{subjectId}` | - | `VirtualLearningMaterialController@getSubjectMaterials` (`routes/web.php:247` -> `app/Http/Controllers/VirtualLearningMaterialController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:247`) |
| 25 | `GET` | `/api/student/pre-class-alerts` | - | `VirtualLearningMaterialController@getStudentPreClassAlerts` (`routes/web.php:248` -> `app/Http/Controllers/VirtualLearningMaterialController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Student` (authenticated student session), plus `Tutor`/`HOD`/`Admin`/`Super_Admin` on administrative student endpoints (`routes/web.php:248`) |
| 26 | `GET` | `/api/student/materials/pre-class-notices` | - | `VirtualLearningMaterialController@getStudentPreClassAlerts` (`routes/web.php:249` -> `app/Http/Controllers/VirtualLearningMaterialController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Student` (authenticated student session), plus `Tutor`/`HOD`/`Admin`/`Super_Admin` on administrative student endpoints (`routes/web.php:249`) |
| 27 | `POST` | `/api/student/materials/mark-read` | - | `VirtualLearningMaterialController@markAlertAsRead` (`routes/web.php:250` -> `app/Http/Controllers/VirtualLearningMaterialController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Student` (authenticated student session), plus `Tutor`/`HOD`/`Admin`/`Super_Admin` on administrative student endpoints (`routes/web.php:250`) |
| 28 | `POST` | `/api/student/materials/{id}/read` | - | `VirtualLearningMaterialController@markAlertAsRead` (`routes/web.php:251` -> `app/Http/Controllers/VirtualLearningMaterialController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Student` (authenticated student session), plus `Tutor`/`HOD`/`Admin`/`Super_Admin` on administrative student endpoints (`routes/web.php:251`) |
| 29 | `DELETE` | `/api/virtual-room/materials/{id}` | - | `VirtualLearningMaterialController@deleteMaterial` (`routes/web.php:252` -> `app/Http/Controllers/VirtualLearningMaterialController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:252`) |
| 30 | `GET` | `/dashboard/student` | - | Closure (`routes/web.php:254-262`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Student`, `Super_Admin` (`Session::get("role") === "Student"`; `routes/web.php:254-269`) |
| 31 | `GET` | `/student/mobile` | `student.mobile` | `StudentAttendanceController@showStudentMobileDashboard` (`routes/web.php:264` -> `app/Http/Controllers/StudentAttendanceController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Student`, `Super_Admin` (`Session::get("role") === "Student"`; `routes/web.php:254-269`) |
| 32 | `GET` | `/dashboard/student/mobile` | - | Closure (`routes/web.php:265-268`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Student`, `Super_Admin` (`Session::get("role") === "Student"`; `routes/web.php:254-269`) |
| 33 | `GET` | `/student/attendance` | - | `StudentAttendanceController@showStudentAttendance` (`routes/web.php:270` -> `app/Http/Controllers/StudentAttendanceController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Student` (authenticated student session), plus `Tutor`/`HOD`/`Admin`/`Super_Admin` on administrative student endpoints (`routes/web.php:270`) |
| 34 | `GET` | `/student/attendance-certificate/print` | `student.attendance.certificate.print` | `StudentAttendanceController@printStudentAttendanceCertificate` (`routes/web.php:271` -> `app/Http/Controllers/StudentAttendanceController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Student` (authenticated student session), plus `Tutor`/`HOD`/`Admin`/`Super_Admin` on administrative student endpoints (`routes/web.php:271`) |
| 35 | `GET` | `/student/nodue-slip/print` | `student.nodue.slip.print` | `StudentAttendanceController@printStudentNoDueSlip` (`routes/web.php:272` -> `app/Http/Controllers/StudentAttendanceController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Student` (authenticated student session), plus `Tutor`/`HOD`/`Admin`/`Super_Admin` on administrative student endpoints (`routes/web.php:272`) |
| 36 | `GET` | `/student/mentoring-diary` | - | Closure (`routes/web.php:274-277`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Student` (own diary), plus `Mentor`/`Tutor`/`HOD`/`Principal` where `regNo` param is passed (`MentoringController`; `app/Http/Controllers/MentoringController.php:990-1430`) |
| 37 | `GET` | `/tutor/mentoring-diary/{regNo}` | - | `MentoringController@tutorViewFullDiary` (`routes/web.php:279` -> `app/Http/Controllers/MentoringController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Mentor`, `Tutor`, `HOD`, `Principal`, `Super_Admin`, plus `Student` on shared diary endpoints (`MentoringController`; `app/Http/Controllers/MentoringController.php:15-985`) |
| 38 | `GET` | `/dashboard/superadmin` | - | Closure (`routes/web.php:281-285`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Super_Admin` (`Session::get("role") !== "Super_Admin"` redirects to `/`; `routes/web.php:281-285`) |
| 39 | `GET` | `/superadmin/show-users` | - | Closure (`routes/web.php:287-303`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Super_Admin`, `Principal`, `Admin` (`routes/web.php:287-303` -> `admin_show_users_table.blade.php`) |
| 40 | `GET` | `/dashboard/admin` | - | Closure (`routes/web.php:305-308`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Admin`, `Principal`, `Chairman`, `Super_Admin` (`routes/web.php:305-309` -> `admin_dashboard.blade.php`) |
| 41 | `GET` | `/dashboard/principal` | - | Closure (`routes/web.php:310-314`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Principal`, `Super_Admin` (`routes/web.php:310-315` -> `principal_dashboard.blade.php`) |
| 42 | `GET` | `/dashboard/chairman` | - | Closure (`routes/web.php:316-320`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Chairman`, `Super_Admin` (`routes/web.php:316-320` -> `chairman_dashboard.blade.php`) |
| 43 | `GET` | `/dashboard/hod` | - | Closure (`routes/web.php:322-330`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `HOD`, `Principal`, `Chairman`, `Admin`, `Super_Admin` (`routes/web.php:322-330` -> `hod_dashboard.blade.php`) |
| 44 | `GET` | `/hod/mobile` | - | `HodMobileController@index` (`routes/web.php:332` -> `app/Http/Controllers/HodMobileController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`HodMobileController::resolveAccess`; `app/Http/Controllers/HodMobileController.php:17-62`) |
| 45 | `POST` | `/api/hod/notice/create` | - | `HodMobileController@createNotice` (`routes/web.php:333` -> `app/Http/Controllers/HodMobileController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Admin`, `Super_Admin` (`routes/web.php:333`) |
| 46 | `POST` | `/api/hod/notice/delete` | - | `HodMobileController@deleteNotice` (`routes/web.php:334` -> `app/Http/Controllers/HodMobileController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Admin`, `Super_Admin` (`routes/web.php:334`) |
| 47 | `GET` | `/hod/academic-calendar` | - | `AcademicCalendarController@index` (`routes/web.php:338` -> `app/Http/Controllers/AcademicCalendarController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Admin`, `Super_Admin` (`routes/web.php:338`) |
| 48 | `POST` | `/api/academic-calendar/save` | - | `AcademicCalendarController@store` (`routes/web.php:339` -> `app/Http/Controllers/AcademicCalendarController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:339`) |
| 49 | `GET` | `/hod/academic-calendar/{id}/print` | - | `AcademicCalendarController@printCalendar` (`routes/web.php:340` -> `app/Http/Controllers/AcademicCalendarController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Admin`, `Super_Admin` (`routes/web.php:340`) |
| 50 | `POST` | `/api/academic-calendar/parse-pdf` | - | `AcademicCalendarController@parsePdf` (`routes/web.php:341` -> `app/Http/Controllers/AcademicCalendarController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:341`) |
| 51 | `GET` | `/dashboard/principal/department/{branch}` | - | Closure (`routes/web.php:343-350`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Super_Admin`, `Principal`, `Chairman`, `Admin` (`ExecutiveControlDeskController` / `PrincipalDashboardController`; `routes/web.php:343`) |
| 52 | `GET` | `/dashboard/principal/today-timetable` | - | `PrincipalDashboardController@showTodayTimetable` (`routes/web.php:353` -> `app/Http/Controllers/PrincipalDashboardController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Super_Admin`, `Principal`, `Chairman`, `Admin` (`ExecutiveControlDeskController` / `PrincipalDashboardController`; `routes/web.php:353`) |
| 53 | `GET` | `/api/principal/today-timetable` | - | `PrincipalDashboardController@getTodayTimetableData` (`routes/web.php:354` -> `app/Http/Controllers/PrincipalDashboardController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:354`) |
| 54 | `GET` | `/dashboard/general-coordinator-aided` | - | Closure (`routes/web.php:357-364`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Gen_Dept_Coordinator` (Aided), `HOD`, `Principal`, `Admin`, `Super_Admin` (`routes/web.php:357-364` -> `general_coordinator_aided_dashboard.blade.php`) |
| 55 | `GET` | `/dashboard/general-coordinator-sf` | - | Closure (`routes/web.php:366-373`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Gen_Dept_Coordinator` (SF), `HOD`, `Principal`, `Admin`, `Super_Admin` (`routes/web.php:366-373` -> `general_coordinator_sf_dashboard.blade.php`) |
| 56 | `GET` | `/dashboard/academic-coordinator` | - | Closure (`routes/web.php:375-383`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Academic_Coordinator`, `Principal`, `Chairman`, `Admin`, `Super_Admin` (`routes/web.php:375-383` -> `academic_coordinator_dashboard.blade.php`) |
| 57 | `GET` | `/dashboard/lecturer` | - | Closure (`routes/web.php:385-399`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `HOD`, `Tutor`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:385-399`) |
| 58 | `GET` | `/dashboard/demonstrator` | - | Closure (`routes/web.php:401-428`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Demonstrator`, `Super_Admin` (`routes/web.php:401-428` -> `demonstrator_dashboard.blade.php`) |
| 59 | `GET` | `/dashboard/tradeinstructor` | - | Closure (`routes/web.php:430-437`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Trade_Instructor`, `Super_Admin` (`routes/web.php:430-437` -> `trade_instructor_dashboard.blade.php`) |
| 60 | `GET` | `/staff/mobile` | - | `MentoringController@showStaffMobileDashboard` (`routes/web.php:439` -> `app/Http/Controllers/MentoringController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | All Staff Roles (`Lecturer`, `Tutor`, `Mentor`, `HOD`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `SF_Office`, `Admin`, `Principal`, `Super_Admin`; `routes/web.php:439`) |
| 61 | `GET` | `/dashboard/staff/mobile` | - | Closure (`routes/web.php:440-442`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | All Staff Roles (`Lecturer`, `Tutor`, `Mentor`, `HOD`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `SF_Office`, `Admin`, `Principal`, `Super_Admin`; `routes/web.php:440`) |
| 62 | `GET` | `/dashboard/tutor` | - | Closure (`routes/web.php:444-454`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Tutor` (or staff with `is_tutor` / `tutor_batches`), `HOD`, `Principal`, `Super_Admin` (`routes/web.php:444-454` -> `tutor_dashboard.blade.php`) |
| 63 | `GET` | `/dashboard/workshop` | - | Closure (`routes/web.php:456-463`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Workshop_Superintendent`, `HOD`, `Principal`, `Super_Admin` (`routes/web.php:456-463` -> `workshop_superintendent_dashboard.blade.php`) |
| 64 | `GET` | `/dashboard/sf-office` | - | `SfOfficeController@index` (`routes/web.php:465` -> `app/Http/Controllers/SfOfficeController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `SF_Office`, `Super_Admin`, `Principal`, `Chairman`, `Admin` (`SfOfficeController@index`; `app/Http/Controllers/SfOfficeController.php:14-21`) |
| 65 | `GET` | `/api/sf-office/stats` | - | `SfOfficeController@getStats` (`routes/web.php:469` -> `app/Http/Controllers/SfOfficeController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `SF_Office`, `Super_Admin`, `Principal`, `Chairman`, `Admin` (session/role check via `SfOfficeController`; `app/Http/Controllers/SfOfficeController.php:14-1420`) |
| 66 | `GET` | `/api/sf-office/staff` | - | `SfOfficeController@getStaffList` (`routes/web.php:470` -> `app/Http/Controllers/SfOfficeController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `SF_Office`, `Super_Admin`, `Principal`, `Chairman`, `Admin` (session/role check via `SfOfficeController`; `app/Http/Controllers/SfOfficeController.php:14-1420`) |
| 67 | `GET` | `/api/sf-office/punches` | - | `SfOfficeController@getPunchLogs` (`routes/web.php:471` -> `app/Http/Controllers/SfOfficeController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `SF_Office`, `Super_Admin`, `Principal`, `Chairman`, `Admin` (session/role check via `SfOfficeController`; `app/Http/Controllers/SfOfficeController.php:14-1420`) |
| 68 | `GET` | `/api/sf-office/leaves` | - | `SfOfficeController@getLeaveRequests` (`routes/web.php:472` -> `app/Http/Controllers/SfOfficeController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `SF_Office`, `Super_Admin`, `Principal`, `Chairman`, `Admin` (session/role check via `SfOfficeController`; `app/Http/Controllers/SfOfficeController.php:14-1420`) |
| 69 | `POST` | `/api/sf-office/leaves/approve` | - | `SfOfficeController@processOfficeApproval` (`routes/web.php:473` -> `app/Http/Controllers/SfOfficeController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `SF_Office`, `Super_Admin`, `Principal`, `Chairman`, `Admin` (session/role check via `SfOfficeController`; `app/Http/Controllers/SfOfficeController.php:14-1420`) |
| 70 | `POST` | `/api/sf-office/past-leaves` | - | `SfOfficeController@savePastLeaveEntry` (`routes/web.php:474` -> `app/Http/Controllers/SfOfficeController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `SF_Office`, `Super_Admin`, `Principal`, `Chairman`, `Admin` (session/role check via `SfOfficeController`; `app/Http/Controllers/SfOfficeController.php:14-1420`) |
| 71 | `DELETE` | `/api/sf-office/past-leaves/{id}` | - | `SfOfficeController@deletePastLeaveEntry` (`routes/web.php:475` -> `app/Http/Controllers/SfOfficeController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `SF_Office`, `Super_Admin`, `Principal`, `Chairman`, `Admin` (session/role check via `SfOfficeController`; `app/Http/Controllers/SfOfficeController.php:14-1420`) |
| 72 | `POST` | `/api/sf-office/ccl/credit` | - | `SfOfficeController@creditCcl` (`routes/web.php:476` -> `app/Http/Controllers/SfOfficeController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `SF_Office`, `Super_Admin`, `Principal`, `Chairman`, `Admin` (session/role check via `SfOfficeController`; `app/Http/Controllers/SfOfficeController.php:14-1420`) |
| 73 | `GET` | `/api/sf-office/ccl/ledger` | - | `SfOfficeController@getCclLedger` (`routes/web.php:477` -> `app/Http/Controllers/SfOfficeController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `SF_Office`, `Super_Admin`, `Principal`, `Chairman`, `Admin` (session/role check via `SfOfficeController`; `app/Http/Controllers/SfOfficeController.php:14-1420`) |
| 74 | `GET` | `/api/sf-office/reports/monthly` | - | `SfOfficeController@getMonthlyReport` (`routes/web.php:478` -> `app/Http/Controllers/SfOfficeController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `SF_Office`, `Super_Admin`, `Principal`, `Chairman`, `Admin` (session/role check via `SfOfficeController`; `app/Http/Controllers/SfOfficeController.php:14-1420`) |
| 75 | `GET` | `/api/sf-office/reports/yearly` | - | `SfOfficeController@getYearlyReport` (`routes/web.php:479` -> `app/Http/Controllers/SfOfficeController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `SF_Office`, `Super_Admin`, `Principal`, `Chairman`, `Admin` (session/role check via `SfOfficeController`; `app/Http/Controllers/SfOfficeController.php:14-1420`) |
| 76 | `GET` | `/api/sf-office/settings` | - | `SfOfficeController@getSettings` (`routes/web.php:480` -> `app/Http/Controllers/SfOfficeController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `SF_Office`, `Super_Admin`, `Principal`, `Chairman`, `Admin` (session/role check via `SfOfficeController`; `app/Http/Controllers/SfOfficeController.php:14-1420`) |
| 77 | `POST` | `/api/sf-office/settings` | - | `SfOfficeController@updateSettings` (`routes/web.php:481` -> `app/Http/Controllers/SfOfficeController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `SF_Office`, `Super_Admin`, `Principal`, `Chairman`, `Admin` (session/role check via `SfOfficeController`; `app/Http/Controllers/SfOfficeController.php:14-1420`) |
| 78 | `POST` | `/api/approve-account` | - | `DataController@approveAccount` (`routes/web.php:485` -> `app/Http/Controllers/DataController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:485`) |
| 79 | `POST` | `/api/student/update-sbte-reg` | - | `DataController@updateSbteRegNo` (`routes/web.php:486` -> `app/Http/Controllers/DataController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Student` (authenticated student session), plus `Tutor`/`HOD`/`Admin`/`Super_Admin` on administrative student endpoints (`routes/web.php:486`) |
| 80 | `POST` | `/api/student/update/{regNo}` | - | `DataController@updateStudentProfile` (`routes/web.php:487` -> `app/Http/Controllers/DataController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Student` (authenticated student session), plus `Tutor`/`HOD`/`Admin`/`Super_Admin` on administrative student endpoints (`routes/web.php:487`) |
| 81 | `DELETE` | `/api/student/delete/{regNo}` | - | `DataController@deleteStudentProfile` (`routes/web.php:488` -> `app/Http/Controllers/DataController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Student` (authenticated student session), plus `Tutor`/`HOD`/`Admin`/`Super_Admin` on administrative student endpoints (`routes/web.php:488`) |
| 82 | `GET` | `/api/tutor/classroom/{tutorMobile}` | - | `DataController@getTutorClassroomRoster` (`routes/web.php:489` -> `app/Http/Controllers/DataController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Tutor`, `HOD`, `Principal`, `Super_Admin` (`TutorController` / `TutorSpecialAttendanceController` / `DataController`; `routes/web.php:489`) |
| 83 | `POST` | `/api/system/backup` | - | `BackupController@backupDatabaseToDrive` (`routes/web.php:490` -> `app/Http/Controllers/BackupController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:490`) |
| 84 | `GET` | `/api/system/backup/download` | - | `BackupController@downloadLocalBackup` (`routes/web.php:491` -> `app/Http/Controllers/BackupController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:491`) |
| 85 | `POST` | `/api/system/restore` | - | `BackupController@restoreDatabase` (`routes/web.php:492` -> `app/Http/Controllers/BackupController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:492`) |
| 86 | `POST` | `/api/system/set-day-order` | - | Closure (`routes/web.php:495-503`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:495`) |
| 87 | `GET` | `/api/system/get-day-order` | - | Closure (`routes/web.php:505-509`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:505`) |
| 88 | `GET` | `/api/admin/stats` | - | `DataController@getAdminStats` (`routes/web.php:512` -> `app/Http/Controllers/DataController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Admin`, `Principal`, `Chairman`, `Super_Admin` (`routes/web.php:512`) |
| 89 | `GET` | `/api/admin/users` | - | `DataController@getUsersList` (`routes/web.php:513` -> `app/Http/Controllers/DataController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Admin`, `Principal`, `Chairman`, `Super_Admin` (`routes/web.php:513`) |
| 90 | `POST` | `/api/admin/user/toggle-status` | - | `DataController@toggleUserStatus` (`routes/web.php:514` -> `app/Http/Controllers/DataController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Admin`, `Principal`, `Chairman`, `Super_Admin` (`routes/web.php:514`) |
| 91 | `POST` | `/api/admin/user/reset-password` | - | `DataController@resetUserPassword` (`routes/web.php:515` -> `app/Http/Controllers/DataController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Admin`, `Principal`, `Chairman`, `Super_Admin` (`routes/web.php:515`) |
| 92 | `POST` | `/api/admin/user/update-staff/{mobileNo}` | - | `DataController@updateStaffProfileDirect` (`routes/web.php:516` -> `app/Http/Controllers/DataController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Admin`, `Principal`, `Chairman`, `Super_Admin` (`routes/web.php:516`) |
| 93 | `POST` | `/api/admin/user/change-role` | - | `DataController@changeUserRole` (`routes/web.php:517` -> `app/Http/Controllers/DataController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Admin`, `Principal`, `Chairman`, `Super_Admin` (`routes/web.php:517`) |
| 94 | `POST` | `/api/admin/user/delete` | - | `DataController@deleteUser` (`routes/web.php:518` -> `app/Http/Controllers/DataController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Admin`, `Principal`, `Chairman`, `Super_Admin` (`routes/web.php:518`) |
| 95 | `GET` | `/api/audit-logs` | - | `DataController@getAuditLogs` (`routes/web.php:519` -> `app/Http/Controllers/DataController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:519`) |
| 96 | `GET` | `/api/admin/online-staff-log` | - | `DataController@getOnlineStaffStatusLog` (`routes/web.php:520` -> `app/Http/Controllers/DataController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Admin`, `Principal`, `Chairman`, `Super_Admin` (`routes/web.php:520`) |
| 97 | `POST` | `/api/support/request` | - | `SupportDeskController@requestAssist` (`routes/web.php:523` -> `app/Http/Controllers/SupportDeskController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | All Authenticated Users (Staff, Executives, `Student`, `Parent` for read; Staff/HOD/Executives for write; `routes/web.php:523`) |
| 98 | `GET` | `/api/support/sessions` | - | `SupportDeskController@getActiveSessions` (`routes/web.php:524` -> `app/Http/Controllers/SupportDeskController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | All Authenticated Users (Staff, Executives, `Student`, `Parent` for read; Staff/HOD/Executives for write; `routes/web.php:524`) |
| 99 | `POST` | `/api/support/accept` | - | `SupportDeskController@acceptSession` (`routes/web.php:525` -> `app/Http/Controllers/SupportDeskController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | All Authenticated Users (Staff, Executives, `Student`, `Parent` for read; Staff/HOD/Executives for write; `routes/web.php:525`) |
| 100 | `POST` | `/api/support/signal` | - | `SupportDeskController@postSignal` (`routes/web.php:526` -> `app/Http/Controllers/SupportDeskController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | All Authenticated Users (Staff, Executives, `Student`, `Parent` for read; Staff/HOD/Executives for write; `routes/web.php:526`) |
| 101 | `GET` | `/api/support/signals/{sessionId}` | - | `SupportDeskController@getSignals` (`routes/web.php:527` -> `app/Http/Controllers/SupportDeskController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | All Authenticated Users (Staff, Executives, `Student`, `Parent` for read; Staff/HOD/Executives for write; `routes/web.php:527`) |
| 102 | `POST` | `/api/support/end` | - | `SupportDeskController@endSession` (`routes/web.php:528` -> `app/Http/Controllers/SupportDeskController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | All Authenticated Users (Staff, Executives, `Student`, `Parent` for read; Staff/HOD/Executives for write; `routes/web.php:528`) |
| 103 | `GET` | `/api/hod/batches` | - | `DataController@getHodBatches` (`routes/web.php:531` -> `app/Http/Controllers/DataController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Admin`, `Super_Admin` (`routes/web.php:531`) |
| 104 | `POST` | `/api/hod/batches` | - | `DataController@createHodBatch` (`routes/web.php:532` -> `app/Http/Controllers/DataController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Admin`, `Super_Admin` (`routes/web.php:532`) |
| 105 | `POST` | `/api/hod/batches/assign-tutor` | - | `DataController@assignBatchTutor` (`routes/web.php:533` -> `app/Http/Controllers/DataController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Admin`, `Super_Admin` (`routes/web.php:533`) |
| 106 | `POST` | `/api/hod/batches/assign-mentor` | - | `DataController@assignBatchMentor` (`routes/web.php:534` -> `app/Http/Controllers/DataController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Admin`, `Super_Admin` (`routes/web.php:534`) |
| 107 | `GET` | `/api/hod/batches/{classroomId}/students` | - | `DataController@getBatchStudents` (`routes/web.php:535` -> `app/Http/Controllers/DataController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Admin`, `Super_Admin` (`routes/web.php:535`) |
| 108 | `POST` | `/api/hod/batches/{classroomId}/update-semester` | - | `DataController@updateBatchSemester` (`routes/web.php:536` -> `app/Http/Controllers/DataController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Admin`, `Super_Admin` (`routes/web.php:536`) |
| 109 | `GET` | `/api/hod/dept-staff` | - | `DataController@getDeptStaff` (`routes/web.php:537` -> `app/Http/Controllers/DataController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Admin`, `Super_Admin` (`routes/web.php:537`) |
| 110 | `GET` | `/hod/batches/{classroomId}/credentials/print` | - | Closure (`routes/web.php:540-576`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Admin`, `Super_Admin` (`routes/web.php:540`) |
| 111 | `GET` | `/api/r26/hod/batches` | - | `R26DataController@getBatches` (`routes/web.php:579` -> `app/Http/Controllers/R26DataController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `HOD`, `Tutor`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26ClassroomController` / `R26DataController`; `routes/web.php:579`) |
| 112 | `POST` | `/api/r26/hod/batches` | - | `R26DataController@createBatch` (`routes/web.php:580` -> `app/Http/Controllers/R26DataController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `HOD`, `Tutor`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26ClassroomController` / `R26DataController`; `routes/web.php:580`) |
| 113 | `GET` | `/r26/classroom/theory/{subjectId}` | - | `R26ClassroomController@viewTheoryClassroom` (`routes/web.php:581` -> `app/Http/Controllers/R26ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `HOD`, `Tutor`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26ClassroomController` / `R26DataController`; `routes/web.php:581`) |
| 114 | `GET` | `/r26/classroom/{subjectId}` | - | `R26ClassroomController@show` (`routes/web.php:582` -> `app/Http/Controllers/R26ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `HOD`, `Tutor`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26ClassroomController` / `R26DataController`; `routes/web.php:582`) |
| 115 | `POST` | `/api/r26/classroom/{subjectId}/theory-evaluations/save` | - | `R26ClassroomController@saveConsolidatedTheoryEvaluations` (`routes/web.php:583` -> `app/Http/Controllers/R26ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `HOD`, `Tutor`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26ClassroomController` / `R26DataController`; `routes/web.php:583`) |
| 116 | `GET` | `/r26/classroom/course-file/{subjectId}` | - | `R26ClassroomController@viewCourseFile` (`routes/web.php:584` -> `app/Http/Controllers/R26ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `HOD`, `Tutor`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26ClassroomController` / `R26DataController`; `routes/web.php:584`) |
| 117 | `POST` | `/api/r26/classroom/course-file/{subjectId}/save-doc` | - | `R26ClassroomController@saveCourseFileDoc` (`routes/web.php:585` -> `app/Http/Controllers/R26ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `HOD`, `Tutor`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26ClassroomController` / `R26DataController`; `routes/web.php:585`) |
| 118 | `POST` | `/api/r26/classroom/course-file/{subjectId}/upload-doc` | - | `R26ClassroomController@uploadCourseFileDocAttachment` (`routes/web.php:586` -> `app/Http/Controllers/R26ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `HOD`, `Tutor`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26ClassroomController` / `R26DataController`; `routes/web.php:586`) |
| 119 | `GET` | `/r26/classroom/course-file/{subjectId}/print-pdf` | - | `R26ClassroomController@printCourseFilePdf` (`routes/web.php:587` -> `app/Http/Controllers/R26ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `HOD`, `Tutor`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26ClassroomController` / `R26DataController`; `routes/web.php:587`) |
| 120 | `POST` | `/api/r26/classroom/{subjectId}/syllabus` | - | `R26ClassroomController@uploadSyllabus` (`routes/web.php:588` -> `app/Http/Controllers/R26ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `HOD`, `Tutor`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26ClassroomController` / `R26DataController`; `routes/web.php:588`) |
| 121 | `GET` | `/r26/classroom/lesson-plan/print/{subjectId}` | - | `R26ClassroomController@printLessonPlan` (`routes/web.php:589` -> `app/Http/Controllers/R26ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `HOD`, `Tutor`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26ClassroomController` / `R26DataController`; `routes/web.php:589`) |
| 122 | `GET` | `/r26/classroom/self-learning/print/{subjectId}` | - | `R26ClassroomController@printSelfLearningReport` (`routes/web.php:590` -> `app/Http/Controllers/R26ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `HOD`, `Tutor`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26ClassroomController` / `R26DataController`; `routes/web.php:590`) |
| 123 | `POST` | `/api/r26/classroom/{subjectId}/lesson-plans/bulk-update` | - | `R26ClassroomController@bulkUpdateLessonPlans` (`routes/web.php:591` -> `app/Http/Controllers/R26ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `HOD`, `Tutor`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26ClassroomController` / `R26DataController`; `routes/web.php:591`) |
| 124 | `POST` | `/api/r26/classroom/{subjectId}/cia-marks/bulk-update` | - | `R26ClassroomController@bulkUpdateCiaMarks` (`routes/web.php:592` -> `app/Http/Controllers/R26ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `HOD`, `Tutor`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26ClassroomController` / `R26DataController`; `routes/web.php:592`) |
| 125 | `POST` | `/api/r26/classroom/theory/{subjectId}/evaluate/consolidated-save` | - | `R26ClassroomController@saveConsolidatedMarks` (`routes/web.php:593` -> `app/Http/Controllers/R26ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `HOD`, `Tutor`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26ClassroomController` / `R26DataController`; `routes/web.php:593`) |
| 126 | `POST` | `/api/r26/classroom/{subjectId}/evaluate/consolidated-save` | - | `R26ClassroomController@saveConsolidatedMarks` (`routes/web.php:594` -> `app/Http/Controllers/R26ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `HOD`, `Tutor`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26ClassroomController` / `R26DataController`; `routes/web.php:594`) |
| 127 | `GET` | `/r26/classroom/theory/{subjectId}/print/cia-register` | - | `R26ClassroomController@printCiaRegister` (`routes/web.php:595` -> `app/Http/Controllers/R26ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `HOD`, `Tutor`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26ClassroomController` / `R26DataController`; `routes/web.php:595`) |
| 128 | `GET` | `/r26/classroom/theory/{subjectId}/print/series-register` | - | `R26ClassroomController@printSeriesRegister` (`routes/web.php:596` -> `app/Http/Controllers/R26ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `HOD`, `Tutor`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26ClassroomController` / `R26DataController`; `routes/web.php:596`) |
| 129 | `POST` | `/api/r26/classroom/{subjectId}/self-learning/bulk-update` | - | `R26ClassroomController@bulkUpdateSelfLearningMarks` (`routes/web.php:597` -> `app/Http/Controllers/R26ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `HOD`, `Tutor`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26ClassroomController` / `R26DataController`; `routes/web.php:597`) |
| 130 | `POST` | `/api/r26/classroom/{subjectId}/copo-matrix/save` | - | `R26ClassroomController@saveCoPoMatrix` (`routes/web.php:598` -> `app/Http/Controllers/R26ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `HOD`, `Tutor`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26ClassroomController` / `R26DataController`; `routes/web.php:598`) |
| 131 | `POST` | `/api/r26/classroom/{subjectId}/assignment/{coTag}` | - | `R26ClassroomController@saveAssignment` (`routes/web.php:599` -> `app/Http/Controllers/R26ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `HOD`, `Tutor`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26ClassroomController` / `R26DataController`; `routes/web.php:599`) |
| 132 | `POST` | `/api/r26/classroom/{subjectId}/assignment/{coTag}/notify` | - | `R26ClassroomController@notifyAssignment` (`routes/web.php:600` -> `app/Http/Controllers/R26ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `HOD`, `Tutor`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26ClassroomController` / `R26DataController`; `routes/web.php:600`) |
| 133 | `GET` | `/r26/classroom/assignment/{subjectId}/print-qp/{coTag}` | - | `R26ClassroomController@printAssignmentQp` (`routes/web.php:601` -> `app/Http/Controllers/R26ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `HOD`, `Tutor`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26ClassroomController` / `R26DataController`; `routes/web.php:601`) |
| 134 | `GET` | `/r26/classroom/assignment/{subjectId}/print-scheme/{coTag}` | - | `R26ClassroomController@printAssignmentScheme` (`routes/web.php:602` -> `app/Http/Controllers/R26ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `HOD`, `Tutor`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26ClassroomController` / `R26DataController`; `routes/web.php:602`) |
| 135 | `POST` | `/api/r26/classroom/{subjectId}/series-exams/configure` | - | `R26ClassroomController@configureSeriesExams` (`routes/web.php:605` -> `app/Http/Controllers/R26ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `HOD`, `Tutor`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26ClassroomController` / `R26DataController`; `routes/web.php:605`) |
| 136 | `POST` | `/api/r26/classroom/{subjectId}/series-exams/{examId}` | - | `R26ClassroomController@saveSeriesExam` (`routes/web.php:606` -> `app/Http/Controllers/R26ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `HOD`, `Tutor`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26ClassroomController` / `R26DataController`; `routes/web.php:606`) |
| 137 | `POST` | `/api/r26/classroom/{subjectId}/series-exams/{examId}/lock` | - | `R26ClassroomController@lockSeriesExam` (`routes/web.php:607` -> `app/Http/Controllers/R26ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `HOD`, `Tutor`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26ClassroomController` / `R26DataController`; `routes/web.php:607`) |
| 138 | `POST` | `/api/r26/classroom/{subjectId}/series-exams/marks/bulk-update` | - | `R26ClassroomController@bulkUpdateSeriesExamMarks` (`routes/web.php:608` -> `app/Http/Controllers/R26ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `HOD`, `Tutor`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26ClassroomController` / `R26DataController`; `routes/web.php:608`) |
| 139 | `GET` | `/api/r26/classroom/{subjectId}/ese-marks` | - | `R26ClassroomController@getEseMarks` (`routes/web.php:609` -> `app/Http/Controllers/R26ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `HOD`, `Tutor`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26ClassroomController` / `R26DataController`; `routes/web.php:609`) |
| 140 | `POST` | `/api/r26/classroom/{subjectId}/ese-marks/bulk-update` | - | `R26ClassroomController@bulkUpdateEseMarks` (`routes/web.php:610` -> `app/Http/Controllers/R26ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `HOD`, `Tutor`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26ClassroomController` / `R26DataController`; `routes/web.php:610`) |
| 141 | `GET` | `/api/r26/classroom/{subjectId}/attainment-summary` | - | `R26ClassroomController@getAttainmentSummary` (`routes/web.php:611` -> `app/Http/Controllers/R26ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `HOD`, `Tutor`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26ClassroomController` / `R26DataController`; `routes/web.php:611`) |
| 142 | `GET` | `/r26/classroom/series-exams/{examId}/print-qp` | - | `R26ClassroomController@printSeriesExamQp` (`routes/web.php:612` -> `app/Http/Controllers/R26ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `HOD`, `Tutor`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26ClassroomController` / `R26DataController`; `routes/web.php:612`) |
| 143 | `GET` | `/r26/classroom/series-exams/{examId}/print-scheme` | - | `R26ClassroomController@printSeriesExamScheme` (`routes/web.php:613` -> `app/Http/Controllers/R26ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `HOD`, `Tutor`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26ClassroomController` / `R26DataController`; `routes/web.php:613`) |
| 144 | `GET` | `/r26/classroom/{subjectId}/series-exams/print-marks` | - | `R26ClassroomController@printSeriesExamMarks` (`routes/web.php:614` -> `app/Http/Controllers/R26ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `HOD`, `Tutor`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26ClassroomController` / `R26DataController`; `routes/web.php:614`) |
| 145 | `GET` | `/r26/classroom/{subjectId}/internals/print-cie` | - | `R26ClassroomController@printInternalMarksheet` (`routes/web.php:615` -> `app/Http/Controllers/R26ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `HOD`, `Tutor`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26ClassroomController` / `R26DataController`; `routes/web.php:615`) |
| 146 | `GET` | `/r26/classroom/{subjectId}/final-results/print` | - | `R26ClassroomController@printFinalResults` (`routes/web.php:616` -> `app/Http/Controllers/R26ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `HOD`, `Tutor`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26ClassroomController` / `R26DataController`; `routes/web.php:616`) |
| 147 | `GET` | `/r26/classroom/{subjectId}/nba/attainment-report` | - | `R26ClassroomController@printAttainmentReport` (`routes/web.php:617` -> `app/Http/Controllers/R26ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `HOD`, `Tutor`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26ClassroomController` / `R26DataController`; `routes/web.php:617`) |
| 148 | `GET` | `/api/r26/classroom/{subjectId}/midsem-survey/status` | - | `MidSemSurveyController@getSurveyResults` (`routes/web.php:620` -> `app/Http/Controllers/MidSemSurveyController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `HOD`, `Tutor`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26ClassroomController` / `R26DataController`; `routes/web.php:620`) |
| 149 | `POST` | `/api/r26/classroom/{subjectId}/midsem-survey/initiate` | - | `MidSemSurveyController@initiateSurvey` (`routes/web.php:621` -> `app/Http/Controllers/MidSemSurveyController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `HOD`, `Tutor`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26ClassroomController` / `R26DataController`; `routes/web.php:621`) |
| 150 | `POST` | `/api/r26/classroom/{subjectId}/midsem-survey/close` | - | `MidSemSurveyController@closeSurvey` (`routes/web.php:622` -> `app/Http/Controllers/MidSemSurveyController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `HOD`, `Tutor`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26ClassroomController` / `R26DataController`; `routes/web.php:622`) |
| 151 | `GET` | `/api/r26/classroom/{subjectId}/exit-survey/status` | - | `CourseExitSurveyController@getSurveyResults` (`routes/web.php:623` -> `app/Http/Controllers/CourseExitSurveyController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `HOD`, `Tutor`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26ClassroomController` / `R26DataController`; `routes/web.php:623`) |
| 152 | `POST` | `/api/r26/classroom/{subjectId}/exit-survey/initiate` | - | `CourseExitSurveyController@initiateSurvey` (`routes/web.php:624` -> `app/Http/Controllers/CourseExitSurveyController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `HOD`, `Tutor`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26ClassroomController` / `R26DataController`; `routes/web.php:624`) |
| 153 | `POST` | `/api/r26/classroom/{subjectId}/exit-survey/close` | - | `CourseExitSurveyController@closeSurvey` (`routes/web.php:625` -> `app/Http/Controllers/CourseExitSurveyController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `HOD`, `Tutor`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26ClassroomController` / `R26DataController`; `routes/web.php:625`) |
| 154 | `GET` | `/r26/classroom/practical/{subjectId}` | - | `R26VirtualClassroomPracticalController@show` (`routes/web.php:628` -> `app/Http/Controllers/R26VirtualClassroomPracticalController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticalController`; `routes/web.php:628`) |
| 155 | `POST` | `/api/r26/classroom/practical/{subjectId}/syllabus` | - | `R26VirtualClassroomPracticalController@uploadSyllabus` (`routes/web.php:629` -> `app/Http/Controllers/R26VirtualClassroomPracticalController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticalController`; `routes/web.php:629`) |
| 156 | `POST` | `/api/r26/classroom/practical/{subjectId}/copo` | - | `R26VirtualClassroomPracticalController@saveCoPoMapping` (`routes/web.php:630` -> `app/Http/Controllers/R26VirtualClassroomPracticalController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticalController`; `routes/web.php:630`) |
| 157 | `POST` | `/api/r26/classroom/practical/{subjectId}/experiments` | - | `R26VirtualClassroomPracticalController@saveExperimentsList` (`routes/web.php:631` -> `app/Http/Controllers/R26VirtualClassroomPracticalController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticalController`; `routes/web.php:631`) |
| 158 | `POST` | `/api/r26/classroom/practical/{subjectId}/lesson-plan/generate` | - | `R26VirtualClassroomPracticalController@generateLessonPlan` (`routes/web.php:632` -> `app/Http/Controllers/R26VirtualClassroomPracticalController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticalController`; `routes/web.php:632`) |
| 159 | `POST` | `/api/r26/classroom/practical/{subjectId}/lesson-plans/bulk-update` | - | `R26VirtualClassroomPracticalController@bulkUpdateLessonPlans` (`routes/web.php:633` -> `app/Http/Controllers/R26VirtualClassroomPracticalController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticalController`; `routes/web.php:633`) |
| 160 | `DELETE` | `/api/r26/classroom/practical/{subjectId}/lesson-plans/{planId}` | - | `R26VirtualClassroomPracticalController@deleteLessonPlanRow` (`routes/web.php:634` -> `app/Http/Controllers/R26VirtualClassroomPracticalController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticalController`; `routes/web.php:634`) |
| 161 | `POST` | `/api/r26/classroom/practical/{subjectId}/evaluate/experiment` | - | `R26VirtualClassroomPracticalController@saveExperimentMarks` (`routes/web.php:635` -> `app/Http/Controllers/R26VirtualClassroomPracticalController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticalController`; `routes/web.php:635`) |
| 162 | `POST` | `/api/r26/classroom/practical/{subjectId}/evaluate/open-ended` | - | `R26VirtualClassroomPracticalController@saveOpenEndedMarks` (`routes/web.php:636` -> `app/Http/Controllers/R26VirtualClassroomPracticalController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticalController`; `routes/web.php:636`) |
| 163 | `POST` | `/api/r26/classroom/practical/{subjectId}/evaluate/series` | - | `R26VirtualClassroomPracticalController@saveSeriesExamMarks` (`routes/web.php:637` -> `app/Http/Controllers/R26VirtualClassroomPracticalController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticalController`; `routes/web.php:637`) |
| 164 | `POST` | `/api/r26/classroom/practical/{subjectId}/evaluate/series-bulk` | - | `R26VirtualClassroomPracticalController@saveSeriesBulkDirect` (`routes/web.php:638` -> `app/Http/Controllers/R26VirtualClassroomPracticalController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticalController`; `routes/web.php:638`) |
| 165 | `POST` | `/api/r26/classroom/practical/{subjectId}/series-exams/configure` | - | `R26VirtualClassroomPracticalController@configureSeriesExam` (`routes/web.php:639` -> `app/Http/Controllers/R26VirtualClassroomPracticalController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticalController`; `routes/web.php:639`) |
| 166 | `POST` | `/api/r26/classroom/practical/{subjectId}/ese-marks` | - | `R26VirtualClassroomPracticalController@saveEseMarks` (`routes/web.php:640` -> `app/Http/Controllers/R26VirtualClassroomPracticalController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticalController`; `routes/web.php:640`) |
| 167 | `GET` | `/r26/classroom/practical/{subjectId}/print/{type}` | - | `R26VirtualClassroomPracticalController@printReport` (`routes/web.php:641` -> `app/Http/Controllers/R26VirtualClassroomPracticalController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticalController`; `routes/web.php:641`) |
| 168 | `POST` | `/api/r26/classroom/practical/{subjectId}/lab-batch` | - | `R26VirtualClassroomPracticalController@assignLabBatch` (`routes/web.php:642` -> `app/Http/Controllers/R26VirtualClassroomPracticalController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticalController`; `routes/web.php:642`) |
| 169 | `POST` | `/api/r26/classroom/practical/{subjectId}/attendance-override` | - | `R26VirtualClassroomPracticalController@saveAttendanceOverride` (`routes/web.php:643` -> `app/Http/Controllers/R26VirtualClassroomPracticalController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticalController`; `routes/web.php:643`) |
| 170 | `GET` | `/r26/classroom/practical/course-file/{subjectId}` | - | `R26VirtualClassroomPracticalController@viewCourseFile` (`routes/web.php:644` -> `app/Http/Controllers/R26VirtualClassroomPracticalController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticalController`; `routes/web.php:644`) |
| 171 | `POST` | `/api/r26/classroom/practical/course-file/{subjectId}/save-doc` | - | `R26VirtualClassroomPracticalController@saveCourseFileDoc` (`routes/web.php:645` -> `app/Http/Controllers/R26VirtualClassroomPracticalController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticalController`; `routes/web.php:645`) |
| 172 | `POST` | `/api/r26/classroom/practical/course-file/{subjectId}/upload-doc` | - | `R26VirtualClassroomPracticalController@uploadCourseFileDocAttachment` (`routes/web.php:646` -> `app/Http/Controllers/R26VirtualClassroomPracticalController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticalController`; `routes/web.php:646`) |
| 173 | `GET` | `/r26/classroom/practicum/{subjectId}` | - | `R26VirtualClassroomPracticumController@show` (`routes/web.php:649` -> `app/Http/Controllers/R26VirtualClassroomPracticumController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticumController`; `routes/web.php:649`) |
| 174 | `GET` | `/r26/classroom/practicum/course-file/{subjectId}` | - | `R26VirtualClassroomPracticumController@viewCourseFile` (`routes/web.php:650` -> `app/Http/Controllers/R26VirtualClassroomPracticumController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticumController`; `routes/web.php:650`) |
| 175 | `POST` | `/api/r26/classroom/practicum/course-file/{subjectId}/save-doc` | - | `R26VirtualClassroomPracticumController@saveCourseFileDoc` (`routes/web.php:651` -> `app/Http/Controllers/R26VirtualClassroomPracticumController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticumController`; `routes/web.php:651`) |
| 176 | `GET` | `/r26/classroom/practicum/{subjectId}/print-lesson-plan` | - | `R26VirtualClassroomPracticumController@printLessonPlanPdf` (`routes/web.php:652` -> `app/Http/Controllers/R26VirtualClassroomPracticumController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticumController`; `routes/web.php:652`) |
| 177 | `GET` | `/r26/classroom/practicum/{subjectId}/print-timetable` | - | `R26VirtualClassroomPracticumController@printClassroomTimetable` (`routes/web.php:653` -> `app/Http/Controllers/R26VirtualClassroomPracticumController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticumController`; `routes/web.php:653`) |
| 178 | `POST` | `/api/r26/classroom/practicum/{subjectId}/syllabus` | - | `R26VirtualClassroomPracticumController@uploadSyllabus` (`routes/web.php:654` -> `app/Http/Controllers/R26VirtualClassroomPracticumController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticumController`; `routes/web.php:654`) |
| 179 | `POST` | `/api/r26/classroom/practicum/{subjectId}/upload-syllabus` | - | `R26VirtualClassroomPracticumController@uploadSyllabus` (`routes/web.php:655` -> `app/Http/Controllers/R26VirtualClassroomPracticumController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticumController`; `routes/web.php:655`) |
| 180 | `POST` | `/api/r26/classroom/practicum/{subjectId}/copo-matrix/save` | - | `R26VirtualClassroomPracticumController@saveCoPoMatrix` (`routes/web.php:656` -> `app/Http/Controllers/R26VirtualClassroomPracticumController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticumController`; `routes/web.php:656`) |
| 181 | `POST` | `/api/r26/classroom/practicum/{subjectId}/lesson-plan/save` | - | `R26VirtualClassroomPracticumController@saveLessonPlanRow` (`routes/web.php:657` -> `app/Http/Controllers/R26VirtualClassroomPracticumController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticumController`; `routes/web.php:657`) |
| 182 | `POST` | `/api/r26/classroom/practicum/{subjectId}/lesson-plan/save-all` | - | `R26VirtualClassroomPracticumController@saveAllLessonPlans` (`routes/web.php:658` -> `app/Http/Controllers/R26VirtualClassroomPracticumController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticumController`; `routes/web.php:658`) |
| 183 | `POST` | `/api/r26/classroom/practicum/{subjectId}/lesson-plan/delete` | - | `R26VirtualClassroomPracticumController@deleteLessonPlanRows` (`routes/web.php:659` -> `app/Http/Controllers/R26VirtualClassroomPracticumController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticumController`; `routes/web.php:659`) |
| 184 | `POST` | `/api/r26/classroom/practicum/{subjectId}/evaluate/experiment` | - | `R26VirtualClassroomPracticumController@saveExperimentMarks` (`routes/web.php:661` -> `app/Http/Controllers/R26VirtualClassroomPracticumController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticumController`; `routes/web.php:661`) |
| 185 | `POST` | `/api/r26/classroom/practicum/{subjectId}/evaluate/series-theory` | - | `R26VirtualClassroomPracticumController@saveSeriesTheoryMarks` (`routes/web.php:662` -> `app/Http/Controllers/R26VirtualClassroomPracticumController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticumController`; `routes/web.php:662`) |
| 186 | `POST` | `/api/r26/classroom/practicum/{subjectId}/evaluate/series-practical` | - | `R26VirtualClassroomPracticumController@saveSeriesPracticalMarks` (`routes/web.php:663` -> `app/Http/Controllers/R26VirtualClassroomPracticumController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticumController`; `routes/web.php:663`) |
| 187 | `POST` | `/api/r26/classroom/practicum/{subjectId}/evaluate/ese` | - | `R26VirtualClassroomPracticumController@saveEseMarks` (`routes/web.php:664` -> `app/Http/Controllers/R26VirtualClassroomPracticumController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticumController`; `routes/web.php:664`) |
| 188 | `POST` | `/api/r26/classroom/practicum/{subjectId}/evaluate/self-learning/configs` | - | `R26VirtualClassroomPracticumController@saveSelfLearningConfigs` (`routes/web.php:665` -> `app/Http/Controllers/R26VirtualClassroomPracticumController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticumController`; `routes/web.php:665`) |
| 189 | `POST` | `/api/r26/classroom/practicum/{subjectId}/evaluate/self-learning/marks` | - | `R26VirtualClassroomPracticumController@saveSelfLearningMarks` (`routes/web.php:666` -> `app/Http/Controllers/R26VirtualClassroomPracticumController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticumController`; `routes/web.php:666`) |
| 190 | `POST` | `/api/r26/classroom/practicum/{subjectId}/evaluate/attendance-override` | - | `R26VirtualClassroomPracticumController@saveAttendanceOverride` (`routes/web.php:667` -> `app/Http/Controllers/R26VirtualClassroomPracticumController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticumController`; `routes/web.php:667`) |
| 191 | `GET` | `/r26/classroom/practicum/{subjectId}/print-cia-register` | - | `R26VirtualClassroomPracticumController@printCiaRegisterPdf` (`routes/web.php:668` -> `app/Http/Controllers/R26VirtualClassroomPracticumController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticumController`; `routes/web.php:668`) |
| 192 | `GET` | `/r26/classroom/practicum/{subjectId}/print-internal-marks` | - | `R26VirtualClassroomPracticumController@printInternalMarks` (`routes/web.php:669` -> `app/Http/Controllers/R26VirtualClassroomPracticumController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticumController`; `routes/web.php:669`) |
| 193 | `GET` | `/r26/classroom/practicum/{subjectId}/print-series-report` | - | `R26VirtualClassroomPracticumController@printSeriesReport` (`routes/web.php:670` -> `app/Http/Controllers/R26VirtualClassroomPracticumController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticumController`; `routes/web.php:670`) |
| 194 | `GET` | `/r26/classroom/practicum/{subjectId}/print-ese-report` | - | `R26VirtualClassroomPracticumController@printEseReport` (`routes/web.php:671` -> `app/Http/Controllers/R26VirtualClassroomPracticumController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticumController`; `routes/web.php:671`) |
| 195 | `GET` | `/r26/classroom/practicum/{subjectId}/print-course-file` | - | `R26VirtualClassroomPracticumController@printCourseFilePdf` (`routes/web.php:672` -> `app/Http/Controllers/R26VirtualClassroomPracticumController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticumController`; `routes/web.php:672`) |
| 196 | `GET` | `/r26/classroom/practicum/{subjectId}/print-self-learning-splitup` | - | `R26VirtualClassroomPracticumController@printSelfLearningSplitupPdf` (`routes/web.php:673` -> `app/Http/Controllers/R26VirtualClassroomPracticumController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticumController`; `routes/web.php:673`) |
| 197 | `GET` | `/r26/classroom/practicum/{subjectId}/print-self-learning-summary` | - | `R26VirtualClassroomPracticumController@printSelfLearningSummaryPdf` (`routes/web.php:674` -> `app/Http/Controllers/R26VirtualClassroomPracticumController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticumController`; `routes/web.php:674`) |
| 198 | `GET` | `/r26/classroom/practicum/{subjectId}/attendance-report` | - | `R26VirtualClassroomPracticumController@printAttendanceReport` (`routes/web.php:675` -> `app/Http/Controllers/R26VirtualClassroomPracticumController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticumController`; `routes/web.php:675`) |
| 199 | `GET` | `/r26/classroom/practicum/{subjectId}/attendance-consolidated` | - | `R26VirtualClassroomPracticumController@printConsolidatedAttendanceReport` (`routes/web.php:676` -> `app/Http/Controllers/R26VirtualClassroomPracticumController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticumController`; `routes/web.php:676`) |
| 200 | `GET` | `/r26/classroom/practicum/{subjectId}/attendance-log-report` | - | `R26VirtualClassroomPracticumController@printLogAttendanceReport` (`routes/web.php:677` -> `app/Http/Controllers/R26VirtualClassroomPracticumController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticumController`; `routes/web.php:677`) |
| 201 | `POST` | `/api/r26/classroom/practicum/{subjectId}/experiments/save` | - | `R26VirtualClassroomPracticumController@saveCustomExperimentsRoster` (`routes/web.php:678` -> `app/Http/Controllers/R26VirtualClassroomPracticumController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticumController`; `routes/web.php:678`) |
| 202 | `GET` | `/r26/classroom/practicum/{subjectId}/print-experiment-list` | - | `R26VirtualClassroomPracticumController@printExperimentList` (`routes/web.php:679` -> `app/Http/Controllers/R26VirtualClassroomPracticumController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticumController`; `routes/web.php:679`) |
| 203 | `GET` | `/r26/classroom/practicum/{subjectId}/print-experiments-log` | - | `R26VirtualClassroomPracticumController@printExperimentsLog` (`routes/web.php:680` -> `app/Http/Controllers/R26VirtualClassroomPracticumController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticumController`; `routes/web.php:680`) |
| 204 | `GET` | `/r26/classroom/practicum/{subjectId}/export-experiments-log-csv` | - | `R26VirtualClassroomPracticumController@exportExperimentsLogCsv` (`routes/web.php:681` -> `app/Http/Controllers/R26VirtualClassroomPracticumController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticumController`; `routes/web.php:681`) |
| 205 | `POST` | `/api/carmie/ask` | - | `CarmieAssistantController@ask` (`routes/web.php:684` -> `app/Http/Controllers/CarmieAssistantController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Staff (`Lecturer`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin`) & `Student` (`CarmieAssistantController`; `routes/web.php:684`) |
| 206 | `GET` | `/api/carmie/suggestions` | - | `CarmieAssistantController@getSuggestions` (`routes/web.php:685` -> `app/Http/Controllers/CarmieAssistantController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Staff (`Lecturer`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin`) & `Student` (`CarmieAssistantController`; `routes/web.php:685`) |
| 207 | `POST` | `/api/r26/classroom/practicum/{subjectId}/series-qp/generate/{seriesNo}` | - | `R26VirtualClassroomPracticumController@generateSeriesQp` (`routes/web.php:689` -> `app/Http/Controllers/R26VirtualClassroomPracticumController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticumController`; `routes/web.php:689`) |
| 208 | `POST` | `/api/r26/classroom/practicum/{subjectId}/series-qp/save/{seriesNo}` | - | `R26VirtualClassroomPracticumController@saveSeriesQp` (`routes/web.php:690` -> `app/Http/Controllers/R26VirtualClassroomPracticumController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticumController`; `routes/web.php:690`) |
| 209 | `POST` | `/api/r26/classroom/practicum/{subjectId}/series-qp/reset/{seriesNo}` | - | `R26VirtualClassroomPracticumController@resetSeriesQp` (`routes/web.php:691` -> `app/Http/Controllers/R26VirtualClassroomPracticumController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticumController`; `routes/web.php:691`) |
| 210 | `GET` | `/r26/classroom/practicum/{subjectId}/series-qp/print-qp/{seriesNo}` | - | `R26VirtualClassroomPracticumController@printSeriesQpPdf` (`routes/web.php:692` -> `app/Http/Controllers/R26VirtualClassroomPracticumController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticumController`; `routes/web.php:692`) |
| 211 | `GET` | `/r26/classroom/practicum/{subjectId}/series-qp/print-scheme/{seriesNo}` | - | `R26VirtualClassroomPracticumController@printSeriesSchemePdf` (`routes/web.php:693` -> `app/Http/Controllers/R26VirtualClassroomPracticumController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticumController`; `routes/web.php:693`) |
| 212 | `GET` | `/r26/classroom/practicum/{subjectId}/series-qp/print-key/{seriesNo}` | - | `R26VirtualClassroomPracticumController@printSeriesAnswerKeyPdf` (`routes/web.php:694` -> `app/Http/Controllers/R26VirtualClassroomPracticumController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticumController`; `routes/web.php:694`) |
| 213 | `GET` | `/r26/classroom/english-1001/{subjectId}` | - | `R26VirtualClassroomEnglishController@show` (`routes/web.php:696` -> `app/Http/Controllers/R26VirtualClassroomEnglishController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer` (English faculty), `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomEnglishController`; `routes/web.php:696`) |
| 214 | `POST` | `/api/r26/classroom/english-1001/{subjectId}/evaluate/consolidated-save` | - | `R26VirtualClassroomEnglishController@saveConsolidatedMarks` (`routes/web.php:697` -> `app/Http/Controllers/R26VirtualClassroomEnglishController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer` (English faculty), `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomEnglishController`; `routes/web.php:697`) |
| 215 | `POST` | `/api/r26/classroom/english-1001/{subjectId}/syllabus` | - | `R26VirtualClassroomEnglishController@uploadSyllabus` (`routes/web.php:698` -> `app/Http/Controllers/R26VirtualClassroomEnglishController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer` (English faculty), `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomEnglishController`; `routes/web.php:698`) |
| 216 | `POST` | `/api/r26/classroom/english-1001/{subjectId}/outline/save` | - | `R26VirtualClassroomEnglishController@saveCourseOutline` (`routes/web.php:699` -> `app/Http/Controllers/R26VirtualClassroomEnglishController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer` (English faculty), `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomEnglishController`; `routes/web.php:699`) |
| 217 | `POST` | `/api/r26/classroom/english-1001/{subjectId}/lesson-plan/save` | - | `R26VirtualClassroomEnglishController@bulkUpdateLessonPlans` (`routes/web.php:700` -> `app/Http/Controllers/R26VirtualClassroomEnglishController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer` (English faculty), `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomEnglishController`; `routes/web.php:700`) |
| 218 | `POST` | `/api/r26/classroom/english-1001/{subjectId}/lesson-plan/generate` | - | `R26VirtualClassroomEnglishController@generateLessonPlanApi` (`routes/web.php:701` -> `app/Http/Controllers/R26VirtualClassroomEnglishController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer` (English faculty), `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomEnglishController`; `routes/web.php:701`) |
| 219 | `POST` | `/api/r26/classroom/english-1001/{subjectId}/attainment/save-settings` | - | `R26VirtualClassroomEnglishController@saveAttainmentSettings` (`routes/web.php:702` -> `app/Http/Controllers/R26VirtualClassroomEnglishController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer` (English faculty), `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomEnglishController`; `routes/web.php:702`) |
| 220 | `GET` | `/r26/classroom/english-1001/{subjectId}/print/cia-register` | - | `R26VirtualClassroomEnglishController@printCiaRegister` (`routes/web.php:703` -> `app/Http/Controllers/R26VirtualClassroomEnglishController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer` (English faculty), `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomEnglishController`; `routes/web.php:703`) |
| 221 | `GET` | `/r26/classroom/english-1001/{subjectId}/print/lesson-plan` | - | `R26VirtualClassroomEnglishController@printLessonPlan` (`routes/web.php:704` -> `app/Http/Controllers/R26VirtualClassroomEnglishController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer` (English faculty), `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomEnglishController`; `routes/web.php:704`) |
| 222 | `GET` | `/r26/classroom/english-1001/{subjectId}/print/course-log` | - | `R26VirtualClassroomEnglishController@printLessonPlan` (`routes/web.php:705` -> `app/Http/Controllers/R26VirtualClassroomEnglishController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer` (English faculty), `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomEnglishController`; `routes/web.php:705`) |
| 223 | `GET` | `/r26/classroom/english-1001/{subjectId}/print/{reportType}` | - | `R26VirtualClassroomEnglishController@printReport` (`routes/web.php:706` -> `app/Http/Controllers/R26VirtualClassroomEnglishController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer` (English faculty), `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomEnglishController`; `routes/web.php:706`) |
| 224 | `POST` | `/api/r26/classroom/english-1001/{subjectId}/upload-teams-attendance` | - | `R26VirtualClassroomEnglishController@uploadTeamsAttendance` (`routes/web.php:707` -> `app/Http/Controllers/R26VirtualClassroomEnglishController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer` (English faculty), `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomEnglishController`; `routes/web.php:707`) |
| 225 | `POST` | `/api/classroom/subject/{subjectId}/upload-teams-attendance` | - | `R26VirtualClassroomEnglishController@uploadTeamsAttendance` (`routes/web.php:708` -> `app/Http/Controllers/R26VirtualClassroomEnglishController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:708`) |
| 226 | `POST` | `/api/r26/classroom/english-1001/{subjectId}/lesson-plan/sync-dates` | - | `R26VirtualClassroomEnglishController@syncLessonPlanDates` (`routes/web.php:709` -> `app/Http/Controllers/R26VirtualClassroomEnglishController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer` (English faculty), `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomEnglishController`; `routes/web.php:709`) |
| 227 | `GET` | `/r26/classroom/drawing/{subjectId}` | - | `R26VirtualClassroomDrawingController@show` (`routes/web.php:712` -> `app/Http/Controllers/R26VirtualClassroomDrawingController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomDrawingController`; `routes/web.php:712`) |
| 228 | `POST` | `/api/r26/classroom/drawing/{subjectId}/syllabus` | - | `R26VirtualClassroomDrawingController@uploadSyllabus` (`routes/web.php:713` -> `app/Http/Controllers/R26VirtualClassroomDrawingController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomDrawingController`; `routes/web.php:713`) |
| 229 | `POST` | `/api/r26/classroom/drawing/{subjectId}/lesson-plan/generate` | - | `R26VirtualClassroomDrawingController@generateLessonPlanApi` (`routes/web.php:714` -> `app/Http/Controllers/R26VirtualClassroomDrawingController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomDrawingController`; `routes/web.php:714`) |
| 230 | `POST` | `/api/r26/classroom/drawing/{subjectId}/lesson-plan/save` | - | `R26VirtualClassroomDrawingController@bulkUpdateLessonPlans` (`routes/web.php:715` -> `app/Http/Controllers/R26VirtualClassroomDrawingController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomDrawingController`; `routes/web.php:715`) |
| 231 | `GET` | `/r26/classroom/drawing/lesson-plan/print/{subjectId}` | - | `R26VirtualClassroomDrawingController@printLessonPlan` (`routes/web.php:716` -> `app/Http/Controllers/R26VirtualClassroomDrawingController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomDrawingController`; `routes/web.php:716`) |
| 232 | `POST` | `/api/r26/classroom/drawing/{subjectId}/evaluate/consolidated-save` | - | `R26VirtualClassroomDrawingController@saveConsolidatedMarks` (`routes/web.php:717` -> `app/Http/Controllers/R26VirtualClassroomDrawingController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomDrawingController`; `routes/web.php:717`) |
| 233 | `POST` | `/api/r26/classroom/drawing/{subjectId}/attainment/save-settings` | - | `R26VirtualClassroomDrawingController@saveAttainmentSettings` (`routes/web.php:718` -> `app/Http/Controllers/R26VirtualClassroomDrawingController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomDrawingController`; `routes/web.php:718`) |
| 234 | `GET` | `/r26/classroom/drawing/{subjectId}/print/cia-register` | - | `R26VirtualClassroomDrawingController@printCiaRegister` (`routes/web.php:719` -> `app/Http/Controllers/R26VirtualClassroomDrawingController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomDrawingController`; `routes/web.php:719`) |
| 235 | `GET` | `/r26/classroom/drawing/{subjectId}/print/series-register` | - | `R26VirtualClassroomDrawingController@printSeriesRegister` (`routes/web.php:720` -> `app/Http/Controllers/R26VirtualClassroomDrawingController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomDrawingController`; `routes/web.php:720`) |
| 236 | `POST` | `/api/r26/classroom/drawing/{subjectId}/evaluate/slot` | - | `R26VirtualClassroomDrawingController@saveSlotMarks` (`routes/web.php:721` -> `app/Http/Controllers/R26VirtualClassroomDrawingController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomDrawingController`; `routes/web.php:721`) |
| 237 | `POST` | `/api/r26/classroom/drawing/{subjectId}/evaluate/practical-test` | - | `R26VirtualClassroomDrawingController@savePracticalTestMarks` (`routes/web.php:722` -> `app/Http/Controllers/R26VirtualClassroomDrawingController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomDrawingController`; `routes/web.php:722`) |
| 238 | `POST` | `/api/r26/classroom/drawing/{subjectId}/evaluate/oee` | - | `R26VirtualClassroomDrawingController@saveOeeMarks` (`routes/web.php:723` -> `app/Http/Controllers/R26VirtualClassroomDrawingController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomDrawingController`; `routes/web.php:723`) |
| 239 | `POST` | `/api/r26/classroom/drawing/{subjectId}/evaluate/ese` | - | `R26VirtualClassroomDrawingController@saveEseMarks` (`routes/web.php:724` -> `app/Http/Controllers/R26VirtualClassroomDrawingController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomDrawingController`; `routes/web.php:724`) |
| 240 | `GET` | `/r26/classroom/drawing/series-test/print/{subjectId}/{testNo}` | - | `R26VirtualClassroomDrawingController@printSeriesTestQP` (`routes/web.php:725` -> `app/Http/Controllers/R26VirtualClassroomDrawingController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomDrawingController`; `routes/web.php:725`) |
| 241 | `GET` | `/api/r26/classroom/drawing/{subjectId}/series-qp/{testNo}` | - | `R26VirtualClassroomDrawingController@getSeriesQpApi` (`routes/web.php:726` -> `app/Http/Controllers/R26VirtualClassroomDrawingController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomDrawingController`; `routes/web.php:726`) |
| 242 | `POST` | `/api/r26/classroom/drawing/{subjectId}/series-qp/save` | - | `R26VirtualClassroomDrawingController@saveSeriesQpApi` (`routes/web.php:727` -> `app/Http/Controllers/R26VirtualClassroomDrawingController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomDrawingController`; `routes/web.php:727`) |
| 243 | `GET` | `/r26/classroom/drawing/{subjectId}/attendance-report` | - | `R26VirtualClassroomDrawingController@printAttendanceReport` (`routes/web.php:728` -> `app/Http/Controllers/R26VirtualClassroomDrawingController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomDrawingController`; `routes/web.php:728`) |
| 244 | `GET` | `/r26/classroom/drawing/{subjectId}/attendance-consolidated` | - | `R26VirtualClassroomDrawingController@printConsolidatedAttendanceReport` (`routes/web.php:729` -> `app/Http/Controllers/R26VirtualClassroomDrawingController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomDrawingController`; `routes/web.php:729`) |
| 245 | `POST` | `/api/r26/classroom/drawing/{subjectId}/exercises/add` | - | `R26VirtualClassroomDrawingController@addExerciseApi` (`routes/web.php:730` -> `app/Http/Controllers/R26VirtualClassroomDrawingController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomDrawingController`; `routes/web.php:730`) |
| 246 | `GET` | `/r26/classroom/drawing/exercises/print/{subjectId}` | - | `R26VirtualClassroomDrawingController@printExerciseList` (`routes/web.php:731` -> `app/Http/Controllers/R26VirtualClassroomDrawingController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomDrawingController`; `routes/web.php:731`) |
| 247 | `GET` | `/r26/classroom/drawing/ce-consolidated/print/{subjectId}` | - | `R26VirtualClassroomDrawingController@printCeConsolidatedReport` (`routes/web.php:732` -> `app/Http/Controllers/R26VirtualClassroomDrawingController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomDrawingController`; `routes/web.php:732`) |
| 248 | `GET` | `/r21/classroom/drawing/{subjectId}` | - | `R21VirtualClassroomDrawingController@show` (`routes/web.php:736` -> `app/Http/Controllers/R21VirtualClassroomDrawingController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R21VirtualClassroomDrawingController`; `routes/web.php:736`) |
| 249 | `POST` | `/r21/classroom/drawing/{subjectId}/syllabus` | - | `R21VirtualClassroomDrawingController@uploadSyllabus` (`routes/web.php:737` -> `app/Http/Controllers/R21VirtualClassroomDrawingController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R21VirtualClassroomDrawingController`; `routes/web.php:737`) |
| 250 | `POST` | `/r21/classroom/drawing/{subjectId}/sheets/save` | - | `R21VirtualClassroomDrawingController@saveSheetMarks` (`routes/web.php:738` -> `app/Http/Controllers/R21VirtualClassroomDrawingController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R21VirtualClassroomDrawingController`; `routes/web.php:738`) |
| 251 | `POST` | `/r21/classroom/drawing/{subjectId}/tests/save` | - | `R21VirtualClassroomDrawingController@saveSeriesTestMarks` (`routes/web.php:739` -> `app/Http/Controllers/R21VirtualClassroomDrawingController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R21VirtualClassroomDrawingController`; `routes/web.php:739`) |
| 252 | `POST` | `/r21/classroom/drawing/{subjectId}/series-fast/save` | - | `R21VirtualClassroomDrawingController@saveSeriesFast` (`routes/web.php:740` -> `app/Http/Controllers/R21VirtualClassroomDrawingController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R21VirtualClassroomDrawingController`; `routes/web.php:740`) |
| 253 | `POST` | `/r21/classroom/drawing/{subjectId}/fast-cia/save` | - | `R21VirtualClassroomDrawingController@saveFastCiaRegister` (`routes/web.php:741` -> `app/Http/Controllers/R21VirtualClassroomDrawingController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R21VirtualClassroomDrawingController`; `routes/web.php:741`) |
| 254 | `POST` | `/r21/classroom/drawing/{subjectId}/sheets-config/save` | - | `R21VirtualClassroomDrawingController@saveSheetsConfig` (`routes/web.php:742` -> `app/Http/Controllers/R21VirtualClassroomDrawingController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R21VirtualClassroomDrawingController`; `routes/web.php:742`) |
| 255 | `POST` | `/r21/classroom/drawing/{subjectId}/attendance/save` | - | `R21VirtualClassroomDrawingController@saveAttendanceMarks` (`routes/web.php:743` -> `app/Http/Controllers/R21VirtualClassroomDrawingController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R21VirtualClassroomDrawingController`; `routes/web.php:743`) |
| 256 | `GET` | `/r21/classroom/drawing/{subjectId}/print/sheets` | - | `R21VirtualClassroomDrawingController@printFormativeRegister` (`routes/web.php:744` -> `app/Http/Controllers/R21VirtualClassroomDrawingController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R21VirtualClassroomDrawingController`; `routes/web.php:744`) |
| 257 | `GET` | `/r21/classroom/drawing/{subjectId}/print/tests` | - | `R21VirtualClassroomDrawingController@printSummativeRegister` (`routes/web.php:745` -> `app/Http/Controllers/R21VirtualClassroomDrawingController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R21VirtualClassroomDrawingController`; `routes/web.php:745`) |
| 258 | `GET` | `/r21/classroom/drawing/{subjectId}/print/cia` | - | `R21VirtualClassroomDrawingController@printConsolidatedCia` (`routes/web.php:746` -> `app/Http/Controllers/R21VirtualClassroomDrawingController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R21VirtualClassroomDrawingController`; `routes/web.php:746`) |
| 259 | `POST` | `/r21/classroom/drawing/{subjectId}/sheets-bulk-average/apply` | - | `R21VirtualClassroomDrawingController@applySheetsAverageToCia` (`routes/web.php:747` -> `app/Http/Controllers/R21VirtualClassroomDrawingController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R21VirtualClassroomDrawingController`; `routes/web.php:747`) |
| 260 | `POST` | `/r21/classroom/drawing/{subjectId}/lesson-plans/save` | - | `R21VirtualClassroomDrawingController@saveLessonPlans` (`routes/web.php:748` -> `app/Http/Controllers/R21VirtualClassroomDrawingController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R21VirtualClassroomDrawingController`; `routes/web.php:748`) |
| 261 | `GET` | `/r21/classroom/drawing/{subjectId}/print/lesson-plan` | - | `R21VirtualClassroomDrawingController@printLessonPlan` (`routes/web.php:749` -> `app/Http/Controllers/R21VirtualClassroomDrawingController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R21VirtualClassroomDrawingController`; `routes/web.php:749`) |
| 262 | `GET` | `/r21/classroom/seminar/{subjectId}` | - | `R21VirtualClassroomSeminarController@show` (`routes/web.php:752` -> `app/Http/Controllers/R21VirtualClassroomSeminarController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer` (Seminar Coordinator/Guide), `HOD`, `Principal`, `Super_Admin` (`R21VirtualClassroomSeminarController`; `routes/web.php:752`) |
| 263 | `POST` | `/r21/classroom/seminar/{subjectId}/syllabus` | - | `R21VirtualClassroomSeminarController@uploadSyllabus` (`routes/web.php:753` -> `app/Http/Controllers/R21VirtualClassroomSeminarController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer` (Seminar Coordinator/Guide), `HOD`, `Principal`, `Super_Admin` (`R21VirtualClassroomSeminarController`; `routes/web.php:753`) |
| 264 | `POST` | `/r21/classroom/seminar/{subjectId}/evaluate` | - | `R21VirtualClassroomSeminarController@saveEvaluation` (`routes/web.php:754` -> `app/Http/Controllers/R21VirtualClassroomSeminarController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer` (Seminar Coordinator/Guide), `HOD`, `Principal`, `Super_Admin` (`R21VirtualClassroomSeminarController`; `routes/web.php:754`) |
| 265 | `POST` | `/r21/classroom/seminar/{subjectId}/evaluate-batch` | - | `R21VirtualClassroomSeminarController@saveBatchEvaluations` (`routes/web.php:755` -> `app/Http/Controllers/R21VirtualClassroomSeminarController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer` (Seminar Coordinator/Guide), `HOD`, `Principal`, `Super_Admin` (`R21VirtualClassroomSeminarController`; `routes/web.php:755`) |
| 266 | `POST` | `/r21/classroom/seminar/{subjectId}/schedule` | - | `R21VirtualClassroomSeminarController@updateSeminarSchedule` (`routes/web.php:756` -> `app/Http/Controllers/R21VirtualClassroomSeminarController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer` (Seminar Coordinator/Guide), `HOD`, `Principal`, `Super_Admin` (`R21VirtualClassroomSeminarController`; `routes/web.php:756`) |
| 267 | `GET` | `/r21/classroom/seminar/{subjectId}/print` | - | `R21VirtualClassroomSeminarController@printReport` (`routes/web.php:757` -> `app/Http/Controllers/R21VirtualClassroomSeminarController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer` (Seminar Coordinator/Guide), `HOD`, `Principal`, `Super_Admin` (`R21VirtualClassroomSeminarController`; `routes/web.php:757`) |
| 268 | `GET` | `/r21/classroom/seminar/{subjectId}/attainment-summary` | - | `R21VirtualClassroomSeminarController@getAttainmentSummary` (`routes/web.php:758` -> `app/Http/Controllers/R21VirtualClassroomSeminarController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer` (Seminar Coordinator/Guide), `HOD`, `Principal`, `Super_Admin` (`R21VirtualClassroomSeminarController`; `routes/web.php:758`) |
| 269 | `GET` | `/r21/classroom/project/{subjectId}` | - | `R21VirtualClassroomMajorProjectController@show` (`routes/web.php:761` -> `app/Http/Controllers/R21VirtualClassroomMajorProjectController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer` (Project Guide/Coordinator), `HOD`, `Principal`, `Super_Admin` (`R21VirtualClassroomMajorProjectController`; `routes/web.php:761`) |
| 270 | `POST` | `/r21/classroom/project/{subjectId}/syllabus` | - | `R21VirtualClassroomMajorProjectController@uploadSyllabus` (`routes/web.php:762` -> `app/Http/Controllers/R21VirtualClassroomMajorProjectController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer` (Project Guide/Coordinator), `HOD`, `Principal`, `Super_Admin` (`R21VirtualClassroomMajorProjectController`; `routes/web.php:762`) |
| 271 | `POST` | `/r21/classroom/project/{subjectId}/save-groups` | - | `R21VirtualClassroomMajorProjectController@saveGroups` (`routes/web.php:763` -> `app/Http/Controllers/R21VirtualClassroomMajorProjectController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer` (Project Guide/Coordinator), `HOD`, `Principal`, `Super_Admin` (`R21VirtualClassroomMajorProjectController`; `routes/web.php:763`) |
| 272 | `POST` | `/r21/classroom/project/{subjectId}/save-evaluation` | - | `R21VirtualClassroomMajorProjectController@saveEvaluation` (`routes/web.php:764` -> `app/Http/Controllers/R21VirtualClassroomMajorProjectController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer` (Project Guide/Coordinator), `HOD`, `Principal`, `Super_Admin` (`R21VirtualClassroomMajorProjectController`; `routes/web.php:764`) |
| 273 | `GET` | `/r21/classroom/project/{subjectId}/ese-marks` | - | `R21VirtualClassroomMajorProjectController@getEseMarks` (`routes/web.php:765` -> `app/Http/Controllers/R21VirtualClassroomMajorProjectController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer` (Project Guide/Coordinator), `HOD`, `Principal`, `Super_Admin` (`R21VirtualClassroomMajorProjectController`; `routes/web.php:765`) |
| 274 | `POST` | `/r21/classroom/project/{subjectId}/ese-marks/bulk-update` | - | `R21VirtualClassroomMajorProjectController@bulkUpdateEseMarks` (`routes/web.php:766` -> `app/Http/Controllers/R21VirtualClassroomMajorProjectController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer` (Project Guide/Coordinator), `HOD`, `Principal`, `Super_Admin` (`R21VirtualClassroomMajorProjectController`; `routes/web.php:766`) |
| 275 | `GET` | `/r21/classroom/project/{subjectId}/attainment-summary` | - | `R21VirtualClassroomMajorProjectController@getAttainmentSummary` (`routes/web.php:767` -> `app/Http/Controllers/R21VirtualClassroomMajorProjectController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer` (Project Guide/Coordinator), `HOD`, `Principal`, `Super_Admin` (`R21VirtualClassroomMajorProjectController`; `routes/web.php:767`) |
| 276 | `POST` | `/r21/classroom/project/{subjectId}/examiners` | - | `R21VirtualClassroomMajorProjectController@saveExaminers` (`routes/web.php:768` -> `app/Http/Controllers/R21VirtualClassroomMajorProjectController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer` (Project Guide/Coordinator), `HOD`, `Principal`, `Super_Admin` (`R21VirtualClassroomMajorProjectController`; `routes/web.php:768`) |
| 277 | `POST` | `/r21/classroom/project/{subjectId}/group-ese` | - | `R21VirtualClassroomMajorProjectController@saveGroupEse` (`routes/web.php:769` -> `app/Http/Controllers/R21VirtualClassroomMajorProjectController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer` (Project Guide/Coordinator), `HOD`, `Principal`, `Super_Admin` (`R21VirtualClassroomMajorProjectController`; `routes/web.php:769`) |
| 278 | `POST` | `/r21/classroom/project/{subjectId}/group-cia` | - | `R21VirtualClassroomMajorProjectController@saveGroupCia` (`routes/web.php:770` -> `app/Http/Controllers/R21VirtualClassroomMajorProjectController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer` (Project Guide/Coordinator), `HOD`, `Principal`, `Super_Admin` (`R21VirtualClassroomMajorProjectController`; `routes/web.php:770`) |
| 279 | `GET` | `/r21/classroom/project/{subjectId}/report/print` | - | `R21VirtualClassroomMajorProjectController@printReport` (`routes/web.php:771` -> `app/Http/Controllers/R21VirtualClassroomMajorProjectController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer` (Project Guide/Coordinator), `HOD`, `Principal`, `Super_Admin` (`R21VirtualClassroomMajorProjectController`; `routes/web.php:771`) |
| 280 | `GET` | `/r21/classroom/workshop/{subjectId}` | - | `R21VirtualClassroomWorkshopController@show` (`routes/web.php:774` -> `app/Http/Controllers/R21VirtualClassroomWorkshopController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Workshop_Superintendent`, `Trade_Instructor`, `Tradesman`, `Demonstrator`, `Lecturer`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R21VirtualClassroomWorkshopController`; `routes/web.php:774`) |
| 281 | `POST` | `/r21/classroom/workshop/{subjectId}/batch-setup` | - | `R21VirtualClassroomWorkshopController@saveBatchSetup` (`routes/web.php:775` -> `app/Http/Controllers/R21VirtualClassroomWorkshopController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Workshop_Superintendent`, `Trade_Instructor`, `Tradesman`, `Demonstrator`, `Lecturer`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R21VirtualClassroomWorkshopController`; `routes/web.php:775`) |
| 282 | `POST` | `/r21/classroom/workshop/{subjectId}/work-marks` | - | `R21VirtualClassroomWorkshopController@saveWorkMarks` (`routes/web.php:776` -> `app/Http/Controllers/R21VirtualClassroomWorkshopController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Workshop_Superintendent`, `Trade_Instructor`, `Tradesman`, `Demonstrator`, `Lecturer`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R21VirtualClassroomWorkshopController`; `routes/web.php:776`) |
| 283 | `POST` | `/r21/classroom/workshop/{subjectId}/record-marks` | - | `R21VirtualClassroomWorkshopController@saveRecordMarks` (`routes/web.php:777` -> `app/Http/Controllers/R21VirtualClassroomWorkshopController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Workshop_Superintendent`, `Trade_Instructor`, `Tradesman`, `Demonstrator`, `Lecturer`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R21VirtualClassroomWorkshopController`; `routes/web.php:777`) |
| 284 | `POST` | `/r21/classroom/workshop/{subjectId}/test-marks` | - | `R21VirtualClassroomWorkshopController@saveTestMarks` (`routes/web.php:778` -> `app/Http/Controllers/R21VirtualClassroomWorkshopController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Workshop_Superintendent`, `Trade_Instructor`, `Tradesman`, `Demonstrator`, `Lecturer`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R21VirtualClassroomWorkshopController`; `routes/web.php:778`) |
| 285 | `POST` | `/r21/classroom/workshop/{subjectId}/fast-cia/save` | - | `R21VirtualClassroomWorkshopController@saveFastCia` (`routes/web.php:779` -> `app/Http/Controllers/R21VirtualClassroomWorkshopController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Workshop_Superintendent`, `Trade_Instructor`, `Tradesman`, `Demonstrator`, `Lecturer`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R21VirtualClassroomWorkshopController`; `routes/web.php:779`) |
| 286 | `POST` | `/r21/classroom/workshop/{subjectId}/attendance/save` | - | `R21VirtualClassroomWorkshopController@saveAttendance` (`routes/web.php:780` -> `app/Http/Controllers/R21VirtualClassroomWorkshopController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Workshop_Superintendent`, `Trade_Instructor`, `Tradesman`, `Demonstrator`, `Lecturer`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R21VirtualClassroomWorkshopController`; `routes/web.php:780`) |
| 287 | `POST` | `/r21/classroom/workshop/{subjectId}/syllabus` | - | `R21VirtualClassroomWorkshopController@uploadSyllabus` (`routes/web.php:781` -> `app/Http/Controllers/R21VirtualClassroomWorkshopController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Workshop_Superintendent`, `Trade_Instructor`, `Tradesman`, `Demonstrator`, `Lecturer`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R21VirtualClassroomWorkshopController`; `routes/web.php:781`) |
| 288 | `GET` | `/r21/classroom/workshop/{subjectId}/print/cia` | - | `R21VirtualClassroomWorkshopController@printConsolidatedCia` (`routes/web.php:782` -> `app/Http/Controllers/R21VirtualClassroomWorkshopController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Workshop_Superintendent`, `Trade_Instructor`, `Tradesman`, `Demonstrator`, `Lecturer`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R21VirtualClassroomWorkshopController`; `routes/web.php:782`) |
| 289 | `GET` | `/r21/classroom/workshop/{subjectId}/print/works` | - | `R21VirtualClassroomWorkshopController@printWorkRegister` (`routes/web.php:783` -> `app/Http/Controllers/R21VirtualClassroomWorkshopController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Workshop_Superintendent`, `Trade_Instructor`, `Tradesman`, `Demonstrator`, `Lecturer`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R21VirtualClassroomWorkshopController`; `routes/web.php:783`) |
| 290 | `GET` | `/r21/classroom/workshop/{subjectId}/print/consolidated-3-section` | - | `R21VirtualClassroomWorkshopController@printConsolidated3Section` (`routes/web.php:784` -> `app/Http/Controllers/R21VirtualClassroomWorkshopController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Workshop_Superintendent`, `Trade_Instructor`, `Tradesman`, `Demonstrator`, `Lecturer`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R21VirtualClassroomWorkshopController`; `routes/web.php:784`) |
| 291 | `GET` | `/r21/classroom/workshop/{subjectId}/print/summary` | - | `R21VirtualClassroomWorkshopController@printSummaryReport` (`routes/web.php:785` -> `app/Http/Controllers/R21VirtualClassroomWorkshopController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Workshop_Superintendent`, `Trade_Instructor`, `Tradesman`, `Demonstrator`, `Lecturer`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R21VirtualClassroomWorkshopController`; `routes/web.php:785`) |
| 292 | `GET` | `/r21/classroom/workshop/{subjectId}/print/internal` | - | `R21VirtualClassroomWorkshopController@printInternalReport` (`routes/web.php:786` -> `app/Http/Controllers/R21VirtualClassroomWorkshopController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Workshop_Superintendent`, `Trade_Instructor`, `Tradesman`, `Demonstrator`, `Lecturer`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R21VirtualClassroomWorkshopController`; `routes/web.php:786`) |
| 293 | `GET` | `/r21/classroom/workshop/{subjectId}/print/dual-batch` | - | `R21VirtualClassroomWorkshopController@printDualBatchInternal` (`routes/web.php:787` -> `app/Http/Controllers/R21VirtualClassroomWorkshopController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Workshop_Superintendent`, `Trade_Instructor`, `Tradesman`, `Demonstrator`, `Lecturer`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R21VirtualClassroomWorkshopController`; `routes/web.php:787`) |
| 294 | `GET` | `/r21/classroom/workshop/{subjectId}/print/attendance-log` | - | `R21VirtualClassroomWorkshopController@printAttendanceClassLog` (`routes/web.php:788` -> `app/Http/Controllers/R21VirtualClassroomWorkshopController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Workshop_Superintendent`, `Trade_Instructor`, `Tradesman`, `Demonstrator`, `Lecturer`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R21VirtualClassroomWorkshopController`; `routes/web.php:788`) |
| 295 | `POST` | `/r21/classroom/workshop/{subjectId}/attainment/save` | - | `R21VirtualClassroomWorkshopController@saveAttainmentSettings` (`routes/web.php:789` -> `app/Http/Controllers/R21VirtualClassroomWorkshopController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Workshop_Superintendent`, `Trade_Instructor`, `Tradesman`, `Demonstrator`, `Lecturer`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R21VirtualClassroomWorkshopController`; `routes/web.php:789`) |
| 296 | `GET` | `/staff/mobile/workshop/{subjectId}` | - | `R21VirtualClassroomWorkshopController@showMobile` (`routes/web.php:790` -> `app/Http/Controllers/R21VirtualClassroomWorkshopController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | All Staff Roles (`Lecturer`, `Tutor`, `Mentor`, `HOD`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `SF_Office`, `Admin`, `Principal`, `Super_Admin`; `routes/web.php:790`) |
| 297 | `POST` | `/api/staff/mobile/workshop/{subjectId}/quick-save` | - | `R21VirtualClassroomWorkshopController@saveMobileSectionData` (`routes/web.php:791` -> `app/Http/Controllers/R21VirtualClassroomWorkshopController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | All Staff Roles (`Lecturer`, `Tutor`, `Mentor`, `HOD`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `SF_Office`, `Admin`, `Principal`, `Super_Admin`; `routes/web.php:791`) |
| 298 | `GET` | `/api/staff/mobile/workshop/{subjectId}/section-attendance` | - | `R21VirtualClassroomWorkshopController@getMobileAttendance` (`routes/web.php:792` -> `app/Http/Controllers/R21VirtualClassroomWorkshopController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | All Staff Roles (`Lecturer`, `Tutor`, `Mentor`, `HOD`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `SF_Office`, `Admin`, `Principal`, `Super_Admin`; `routes/web.php:792`) |
| 299 | `POST` | `/api/staff/mobile/workshop/{subjectId}/section-attendance` | - | `R21VirtualClassroomWorkshopController@saveMobileSectionAttendance` (`routes/web.php:793` -> `app/Http/Controllers/R21VirtualClassroomWorkshopController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | All Staff Roles (`Lecturer`, `Tutor`, `Mentor`, `HOD`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `SF_Office`, `Admin`, `Principal`, `Super_Admin`; `routes/web.php:793`) |
| 300 | `GET` | `/r26/classroom/health-physical/{subjectId}` | - | `R26VirtualClassroomHealthPhysicalController@show` (`routes/web.php:796` -> `app/Http/Controllers/R26VirtualClassroomHealthPhysicalController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Physical_Instructor`, `Lecturer`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomHealthPhysicalController`; `routes/web.php:796`) |
| 301 | `GET` | `/r26/classroom/health-physical/{subjectId}/syllabus/view` | - | `R26VirtualClassroomHealthPhysicalController@viewSyllabus` (`routes/web.php:797` -> `app/Http/Controllers/R26VirtualClassroomHealthPhysicalController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Physical_Instructor`, `Lecturer`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomHealthPhysicalController`; `routes/web.php:797`) |
| 302 | `POST` | `/api/r26/classroom/health-physical/{subjectId}/syllabus` | - | `R26VirtualClassroomHealthPhysicalController@uploadSyllabus` (`routes/web.php:798` -> `app/Http/Controllers/R26VirtualClassroomHealthPhysicalController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Physical_Instructor`, `Lecturer`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomHealthPhysicalController`; `routes/web.php:798`) |
| 303 | `POST` | `/api/r26/classroom/health-physical/{subjectId}/lesson-plan/save` | - | `R26VirtualClassroomHealthPhysicalController@bulkUpdateLessonPlans` (`routes/web.php:799` -> `app/Http/Controllers/R26VirtualClassroomHealthPhysicalController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Physical_Instructor`, `Lecturer`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomHealthPhysicalController`; `routes/web.php:799`) |
| 304 | `POST` | `/api/r26/classroom/health-physical/{subjectId}/evaluate/activity` | - | `R26VirtualClassroomHealthPhysicalController@saveActivityMarks` (`routes/web.php:800` -> `app/Http/Controllers/R26VirtualClassroomHealthPhysicalController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Physical_Instructor`, `Lecturer`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomHealthPhysicalController`; `routes/web.php:800`) |
| 305 | `POST` | `/api/r26/classroom/health-physical/{subjectId}/evaluate/fitness-test` | - | `R26VirtualClassroomHealthPhysicalController@saveFitnessTestMarks` (`routes/web.php:801` -> `app/Http/Controllers/R26VirtualClassroomHealthPhysicalController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Physical_Instructor`, `Lecturer`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomHealthPhysicalController`; `routes/web.php:801`) |
| 306 | `POST` | `/api/r26/classroom/health-physical/{subjectId}/evaluate/ese` | - | `R26VirtualClassroomHealthPhysicalController@saveEseMarks` (`routes/web.php:802` -> `app/Http/Controllers/R26VirtualClassroomHealthPhysicalController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Physical_Instructor`, `Lecturer`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomHealthPhysicalController`; `routes/web.php:802`) |
| 307 | `GET` | `/r26/classroom/health-physical/{subjectId}/print/{type}` | - | `R26VirtualClassroomHealthPhysicalController@printReport` (`routes/web.php:803` -> `app/Http/Controllers/R26VirtualClassroomHealthPhysicalController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Physical_Instructor`, `Lecturer`, `HOD`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomHealthPhysicalController`; `routes/web.php:803`) |
| 308 | `GET` | `/api/hod/batches/{classroomId}/subjects` | - | `DataController@getBatchSubjects` (`routes/web.php:806` -> `app/Http/Controllers/DataController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Admin`, `Super_Admin` (`routes/web.php:806`) |
| 309 | `POST` | `/api/hod/batches/subjects/create` | - | `DataController@createBatchSubject` (`routes/web.php:807` -> `app/Http/Controllers/DataController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Admin`, `Super_Admin` (`routes/web.php:807`) |
| 310 | `PUT` | `/api/hod/batches/subjects/{subjectId}` | - | `DataController@updateBatchSubject` (`routes/web.php:808` -> `app/Http/Controllers/DataController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Admin`, `Super_Admin` (`routes/web.php:808`) |
| 311 | `POST` | `/api/hod/batches/subjects/{subjectId}/assign-staff` | - | `DataController@assignSubjectStaff` (`routes/web.php:809` -> `app/Http/Controllers/DataController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Admin`, `Super_Admin` (`routes/web.php:809`) |
| 312 | `DELETE` | `/api/hod/batches/subjects/{subjectId}` | - | `DataController@deleteBatchSubject` (`routes/web.php:810` -> `app/Http/Controllers/DataController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Admin`, `Super_Admin` (`routes/web.php:810`) |
| 313 | `GET` | `/api/hod/batches/{classroomId}/semester/{semester}/snapshot` | - | `DataController@getBatchSemesterSnapshot` (`routes/web.php:813` -> `app/Http/Controllers/DataController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Admin`, `Super_Admin` (`routes/web.php:813`) |
| 314 | `PUT` | `/api/hod/batches/{classroomId}/graduate` | - | `DataController@graduateBatch` (`routes/web.php:816` -> `app/Http/Controllers/DataController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Admin`, `Super_Admin` (`routes/web.php:816`) |
| 315 | `DELETE` | `/api/hod/batches/{classroomId}` | - | `DataController@deleteHodBatch` (`routes/web.php:819` -> `app/Http/Controllers/DataController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Admin`, `Super_Admin` (`routes/web.php:819`) |
| 316 | `GET` | `/api/lecturer/my-batches` | - | `DataController@getLecturerBatches` (`routes/web.php:822` -> `app/Http/Controllers/DataController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:822`) |
| 317 | `GET` | `/course-files` | - | Closure (`routes/web.php:823-827`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`CourseFileController`; `routes/web.php:823`) |
| 318 | `GET` | `/api/course-files/subjects` | - | `CourseFileController@getStaffSubjects` (`routes/web.php:829` -> `app/Http/Controllers/CourseFileController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`CourseFileController`; `routes/web.php:829`) |
| 319 | `GET` | `/api/course-files/{id}` | - | `CourseFileController@getCourseFile` (`routes/web.php:830` -> `app/Http/Controllers/CourseFileController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`CourseFileController`; `routes/web.php:830`) |
| 320 | `POST` | `/api/course-files/{id}` | - | `CourseFileController@saveCourseFile` (`routes/web.php:831` -> `app/Http/Controllers/CourseFileController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`CourseFileController`; `routes/web.php:831`) |
| 321 | `GET` | `/api/course-files/{id}/preview/{docNo}` | - | `CourseFileController@previewDocument` (`routes/web.php:832` -> `app/Http/Controllers/CourseFileController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`CourseFileController`; `routes/web.php:832`) |
| 322 | `POST` | `/api/course-files/{id}/document/{docNo}/save` | - | `CourseFileController@saveDocumentPayload` (`routes/web.php:833` -> `app/Http/Controllers/CourseFileController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`CourseFileController`; `routes/web.php:833`) |
| 323 | `POST` | `/api/course-files/{id}/document/5/upload-cis` | - | `CourseFileController@uploadCisPdf` (`routes/web.php:834` -> `app/Http/Controllers/CourseFileController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`CourseFileController`; `routes/web.php:834`) |
| 324 | `POST` | `/api/course-files/{id}/document/6/save-copo` | - | `CourseFileController@saveCoPoMapping` (`routes/web.php:835` -> `app/Http/Controllers/CourseFileController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`CourseFileController`; `routes/web.php:835`) |
| 325 | `GET` | `/api/course-files/{id}/pdf` | - | `CourseFileController@generatePdf` (`routes/web.php:836` -> `app/Http/Controllers/CourseFileController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`CourseFileController`; `routes/web.php:836`) |
| 326 | `GET` | `/api/student/academic-report` | - | `DataController@getAcademicReport` (`routes/web.php:839` -> `app/Http/Controllers/DataController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Student` (authenticated student session), plus `Tutor`/`HOD`/`Admin`/`Super_Admin` on administrative student endpoints (`routes/web.php:839`) |
| 327 | `POST` | `/api/classroom/{subjectId}/syllabus` | - | `ClassroomController@uploadSyllabus` (`routes/web.php:841` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:841`) |
| 328 | `GET` | `/api/classroom/{subjectId}/syllabus/download` | - | `ClassroomController@downloadSyllabusFile` (`routes/web.php:842` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:842`) |
| 329 | `GET` | `/api/classroom/{subjectId}/details` | - | `ClassroomController@getCourseDetails` (`routes/web.php:843` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:843`) |
| 330 | `POST` | `/api/classroom/{subjectId}/lesson-plans/regenerate` | - | `ClassroomController@regenerateLessonPlans` (`routes/web.php:844` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:844`) |
| 331 | `POST` | `/api/classroom/{subjectId}/lesson-plans/bulk-update` | - | `ClassroomController@bulkUpdateLessonPlans` (`routes/web.php:845` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:845`) |
| 332 | `POST` | `/api/classroom/{subjectId}/save-lesson-plans` | - | `ClassroomController@bulkUpdateLessonPlans` (`routes/web.php:846` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:846`) |
| 333 | `DELETE` | `/api/classroom/{subjectId}/lesson-plans/{planId}` | - | `ClassroomController@deleteLessonPlanRow` (`routes/web.php:847` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:847`) |
| 334 | `POST` | `/api/classroom/{subjectId}/lesson-plans/save-as-template` | - | `ClassroomController@saveAsTemplate` (`routes/web.php:848` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:848`) |
| 335 | `GET` | `/api/classroom/{subjectId}/lesson-plans/load-template` | - | `ClassroomController@loadTemplate` (`routes/web.php:849` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:849`) |
| 336 | `GET` | `/api/classroom/{subjectId}/generate-questions` | - | `ClassroomController@generateAssignmentQuestions` (`routes/web.php:850` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:850`) |
| 337 | `POST` | `/api/classroom/{subjectId}/save-assignment-questions` | - | `ClassroomController@saveAssignmentQuestions` (`routes/web.php:851` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:851`) |
| 338 | `POST` | `/api/classroom/{subjectId}/upload-assignment-image` | - | `ClassroomController@uploadAssignmentImage` (`routes/web.php:852` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:852`) |
| 339 | `POST` | `/api/classroom/{subjectId}/save-assignment-deadline` | - | `ClassroomController@saveAssignmentDeadline` (`routes/web.php:853` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:853`) |
| 340 | `POST` | `/api/classroom/{subjectId}/save-assignment-marks` | - | `ClassroomController@saveAssignmentMarks` (`routes/web.php:854` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:854`) |
| 341 | `POST` | `/api/classroom/{subjectId}/generate-summative-paper` | - | `ClassroomController@generateSummativePaper` (`routes/web.php:855` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:855`) |
| 342 | `POST` | `/api/classroom/{subjectId}/save-summative-config` | - | `ClassroomController@saveSummativeConfig` (`routes/web.php:856` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:856`) |
| 343 | `POST` | `/api/classroom/{subjectId}/save-written-test-marks` | - | `ClassroomController@saveWrittenTestMarks` (`routes/web.php:857` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:857`) |
| 344 | `POST` | `/api/classroom/{subjectId}/attendance-override` | - | `ClassroomController@saveAttendanceOverride` (`routes/web.php:858` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:858`) |
| 345 | `POST` | `/api/classroom/generate-scheme-answers` | - | `ClassroomController@generateAnswerKeyForScheme` (`routes/web.php:859` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:859`) |
| 346 | `POST` | `/api/classroom/{subjectId}/publish-online-test` | - | `TestEngineController@publishOnlineTest` (`routes/web.php:860` -> `app/Http/Controllers/TestEngineController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:860`) |
| 347 | `POST` | `/api/classroom/{subjectId}/preview-online-test-questions` | - | `TestEngineController@previewOnlineTestQuestions` (`routes/web.php:861` -> `app/Http/Controllers/TestEngineController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:861`) |
| 348 | `GET` | `/api/classroom/{subjectId}/active-online-tests` | - | `TestEngineController@getActiveTestsLecturer` (`routes/web.php:862` -> `app/Http/Controllers/TestEngineController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:862`) |
| 349 | `GET` | `/api/test-engine/report/{testId}` | - | `TestEngineController@generateTestReport` (`routes/web.php:863` -> `app/Http/Controllers/TestEngineController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:863`) |
| 350 | `GET` | `/classroom/{subjectId}/assignment-report` | - | `ClassroomController@printAssignmentReport` (`routes/web.php:864` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:864`) |
| 351 | `GET` | `/classroom/{subjectId}/assignment-print/{coTag}` | - | `ClassroomController@printAssignmentQuestionPaperAndRubrics` (`routes/web.php:865` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:865`) |
| 352 | `GET` | `/classroom/{subjectId}/summative-report` | - | `ClassroomController@printSummativeReport` (`routes/web.php:866` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:866`) |
| 353 | `GET` | `/classroom/{subjectId}/lesson-plan/print` | - | `ClassroomController@printLessonPlan` (`routes/web.php:867` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:867`) |
| 354 | `GET` | `/classroom/{subjectId}/attainment-report` | - | `ClassroomController@printAttainmentReport` (`routes/web.php:868` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:868`) |
| 355 | `GET` | `/classroom/{subjectId}/final-results/print` | - | `ClassroomController@printTheoryFinalResults` (`routes/web.php:869` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:869`) |
| 356 | `GET` | `/classroom/{subjectId}/class-roster/print` | - | `ClassroomController@printTheoryClassRoster` (`routes/web.php:870` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:870`) |
| 357 | `GET` | `/classroom/{subjectId}/class-log/print` | - | `ClassroomController@printTheoryClassLog` (`routes/web.php:871` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:871`) |
| 358 | `GET` | `/classroom/{subjectId}/course-file/print` | - | `ClassroomController@printCourseFileA4` (`routes/web.php:872` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:872`) |
| 359 | `GET` | `/api/classroom/{subjectId}/ese-marks` | - | `ClassroomController@getEseMarks` (`routes/web.php:873` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:873`) |
| 360 | `POST` | `/api/classroom/{subjectId}/ese-marks/bulk-update` | - | `ClassroomController@bulkUpdateEseMarks` (`routes/web.php:874` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:874`) |
| 361 | `GET` | `/api/classroom/{subjectId}/attainment-summary` | - | `ClassroomController@getAttainmentSummary` (`routes/web.php:875` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:875`) |
| 362 | `GET` | `/api/admin/settings` | - | `SystemSettingController@getSettings` (`routes/web.php:879` -> `app/Http/Controllers/SystemSettingController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Admin`, `Principal`, `Chairman`, `Super_Admin` (`routes/web.php:879`) |
| 363 | `POST` | `/api/admin/settings` | - | `SystemSettingController@saveSettings` (`routes/web.php:880` -> `app/Http/Controllers/SystemSettingController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Admin`, `Principal`, `Chairman`, `Super_Admin` (`routes/web.php:880`) |
| 364 | `GET` | `/api/system/ai-status` | - | `SystemSettingController@getAiStatus` (`routes/web.php:881` -> `app/Http/Controllers/SystemSettingController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:881`) |
| 365 | `GET` | `/api/classroom/{subjectId}/question-bank` | - | `ClassroomController@getQuestionBank` (`routes/web.php:883` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:883`) |
| 366 | `GET` | `/api/classroom/question-bank/template` | - | `ClassroomController@downloadQuestionTemplate` (`routes/web.php:884` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:884`) |
| 367 | `POST` | `/api/classroom/{subjectId}/question-bank/upload` | - | `ClassroomController@uploadQuestionBank` (`routes/web.php:885` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:885`) |
| 368 | `GET` | `/api/classroom/{subjectId}/seminar/evaluations` | - | `ClassroomController@getSeminarEvaluations` (`routes/web.php:888` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:888`) |
| 369 | `POST` | `/api/classroom/{subjectId}/seminar/evaluate` | - | `ClassroomController@saveSeminarEvaluation` (`routes/web.php:889` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:889`) |
| 370 | `POST` | `/api/student/seminar/register` | - | `ClassroomController@registerSeminarDetails` (`routes/web.php:890` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Student` (authenticated student session), plus `Tutor`/`HOD`/`Admin`/`Super_Admin` on administrative student endpoints (`routes/web.php:890`) |
| 371 | `GET` | `/api/student/seminar/guides` | - | `ClassroomController@getSeminarGuides` (`routes/web.php:891` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Student` (authenticated student session), plus `Tutor`/`HOD`/`Admin`/`Super_Admin` on administrative student endpoints (`routes/web.php:891`) |
| 372 | `GET` | `/classroom/{subjectId}/seminar-report` | - | `ClassroomController@printSeminarReport` (`routes/web.php:892` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:892`) |
| 373 | `GET` | `/api/lecturer/today-seminars` | - | `ClassroomController@getTodaySeminars` (`routes/web.php:893` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:893`) |
| 374 | `POST` | `/api/lecturer/seminar/accept` | - | `ClassroomController@acceptSeminarInvitation` (`routes/web.php:894` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:894`) |
| 375 | `POST` | `/api/classroom/{subjectId}/question-bank/seed-ai` | - | `ClassroomController@seedQuestionBankWithAi` (`routes/web.php:895` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:895`) |
| 376 | `POST` | `/api/classroom/{subjectId}/question-bank/upload-json` | - | `ClassroomController@uploadQuestionBankJson` (`routes/web.php:896` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:896`) |
| 377 | `GET` | `/api/classroom/{subjectId}/practical/experiments` | - | `ClassroomController@getPracticalExperiments` (`routes/web.php:899` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:899`) |
| 378 | `POST` | `/api/classroom/{subjectId}/practical/experiments/save` | - | `ClassroomController@savePracticalExperiment` (`routes/web.php:900` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:900`) |
| 379 | `DELETE` | `/api/classroom/{subjectId}/practical/experiments/{experimentId}` | - | `ClassroomController@deletePracticalExperiment` (`routes/web.php:901` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:901`) |
| 380 | `GET` | `/api/classroom/{subjectId}/practical/evaluations` | - | `ClassroomController@getPracticalEvaluations` (`routes/web.php:902` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:902`) |
| 381 | `POST` | `/api/classroom/{subjectId}/practical/evaluate` | - | `ClassroomController@savePracticalEvaluation` (`routes/web.php:903` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:903`) |
| 382 | `POST` | `/api/classroom/{subjectId}/practical/evaluate-bulk` | - | `ClassroomController@saveBulkPracticalEvaluations` (`routes/web.php:904` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:904`) |
| 383 | `POST` | `/api/classroom/{subjectId}/practical/experiment-date` | - | `ClassroomController@updatePracticalExperimentDate` (`routes/web.php:905` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:905`) |
| 384 | `POST` | `/api/classroom/{subjectId}/practical/tests/save` | - | `ClassroomController@savePracticalTestConfig` (`routes/web.php:906` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:906`) |
| 385 | `POST` | `/api/classroom/{subjectId}/practical/tests/evaluate` | - | `ClassroomController@savePracticalTestMarks` (`routes/web.php:907` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:907`) |
| 386 | `GET` | `/classroom/{subjectId}/practical-report` | - | `ClassroomController@printPracticalReport` (`routes/web.php:908` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:908`) |
| 387 | `GET` | `/api/classroom/{subjectId}/practical/experiments/databank` | - | `ClassroomController@getPracticalExperimentsDatabank` (`routes/web.php:909` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:909`) |
| 388 | `POST` | `/api/classroom/{subjectId}/practical/experiments/import` | - | `ClassroomController@importPracticalExperiments` (`routes/web.php:910` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:910`) |
| 389 | `POST` | `/api/classroom/{subjectId}/practical/lesson-plans/generate` | - | `ClassroomController@generateLessonPlansFromExperiments` (`routes/web.php:911` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:911`) |
| 390 | `POST` | `/api/classroom/{subjectId}/practical/lesson-plans/sync-dates` | - | `ClassroomController@syncLessonPlanDatesFromLogs` (`routes/web.php:912` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:912`) |
| 391 | `POST` | `/api/r26/classroom/practical/{subjectId}/lesson-plans/sync-dates` | - | `ClassroomController@syncLessonPlanDatesFromLogs` (`routes/web.php:913` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Super_Admin` (`R26VirtualClassroomPracticalController`; `routes/web.php:913`) |
| 392 | `POST` | `/api/classroom/{subjectId}/lesson-plans/sync-dates` | - | `ClassroomController@syncLessonPlanDatesFromLogs` (`routes/web.php:914` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:914`) |
| 393 | `GET` | `/api/classroom/{subjectId}/practical/copo-mapping` | - | `ClassroomController@getPracticalCoPoMapping` (`routes/web.php:915` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:915`) |
| 394 | `POST` | `/api/classroom/{subjectId}/practical/copo-mapping/save` | - | `ClassroomController@savePracticalCoPoMapping` (`routes/web.php:916` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:916`) |
| 395 | `POST` | `/api/classroom/{subjectId}/copo-mapping/save` | - | `ClassroomController@saveTheoryCoPoMapping` (`routes/web.php:917` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:917`) |
| 396 | `GET` | `/classroom/{subjectId}/practical-report/print` | - | `ClassroomController@printPracticalReportByType` (`routes/web.php:918` -> `app/Http/Controllers/ClassroomController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:918`) |
| 397 | `GET` | `/classroom/practical/{subjectId}` | - | `VirtualClassroomPracticalController@show` (`routes/web.php:921` -> `app/Http/Controllers/VirtualClassroomPracticalController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:921`) |
| 398 | `POST` | `/classroom/practical/{subjectId}/experiment` | - | `VirtualClassroomPracticalController@saveExperimentMarks` (`routes/web.php:922` -> `app/Http/Controllers/VirtualClassroomPracticalController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:922`) |
| 399 | `POST` | `/classroom/practical/{subjectId}/open-ended` | - | `VirtualClassroomPracticalController@saveOpenEndedMarks` (`routes/web.php:923` -> `app/Http/Controllers/VirtualClassroomPracticalController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:923`) |
| 400 | `POST` | `/classroom/practical/{subjectId}/series-exam` | - | `VirtualClassroomPracticalController@saveSeriesExamMarks` (`routes/web.php:924` -> `app/Http/Controllers/VirtualClassroomPracticalController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:924`) |
| 401 | `POST` | `/classroom/practical/{subjectId}/lab-batch` | - | `VirtualClassroomPracticalController@assignLabBatch` (`routes/web.php:925` -> `app/Http/Controllers/VirtualClassroomPracticalController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:925`) |
| 402 | `GET` | `/classroom/practical/{subjectId}/report/print` | - | `VirtualClassroomPracticalController@printReport` (`routes/web.php:926` -> `app/Http/Controllers/VirtualClassroomPracticalController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:926`) |
| 403 | `GET` | `/classroom/practical/{subjectId}/series-report/print` | - | `VirtualClassroomPracticalController@printSeriesReport` (`routes/web.php:927` -> `app/Http/Controllers/VirtualClassroomPracticalController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:927`) |
| 404 | `GET` | `/classroom/practical/{subjectId}/final-results/print` | - | `VirtualClassroomPracticalController@printFinalResults` (`routes/web.php:928` -> `app/Http/Controllers/VirtualClassroomPracticalController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:928`) |
| 405 | `GET` | `/classroom/practical/{subjectId}/experiments/print` | - | `VirtualClassroomPracticalController@printExperimentsLog` (`routes/web.php:929` -> `app/Http/Controllers/VirtualClassroomPracticalController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:929`) |
| 406 | `GET` | `/classroom/practical/{subjectId}/student/{regNo}/print` | - | `VirtualClassroomPracticalController@printStudentReport` (`routes/web.php:930` -> `app/Http/Controllers/VirtualClassroomPracticalController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:930`) |
| 407 | `GET` | `/classroom/practical/{subjectId}/student-print` | - | `VirtualClassroomPracticalController@printStudentReport` (`routes/web.php:931` -> `app/Http/Controllers/VirtualClassroomPracticalController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:931`) |
| 408 | `GET` | `/api/classroom/{subjectId}/practical/attendance-log` | - | `VirtualClassroomPracticalController@getAttendanceLog` (`routes/web.php:932` -> `app/Http/Controllers/VirtualClassroomPracticalController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:932`) |
| 409 | `POST` | `/api/classroom/{subjectId}/practical/cia-summary` | - | `VirtualClassroomPracticalController@saveStudentCiaSummary` (`routes/web.php:933` -> `app/Http/Controllers/VirtualClassroomPracticalController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:933`) |
| 410 | `GET` | `/api/classroom/{subjectId}/practical/batch-setup` | - | `AttendanceController@getLabBatchSetup` (`routes/web.php:934` -> `app/Http/Controllers/AttendanceController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:934`) |
| 411 | `POST` | `/api/classroom/{subjectId}/practical/batch-setup` | - | `AttendanceController@saveLabBatchAssignments` (`routes/web.php:935` -> `app/Http/Controllers/AttendanceController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:935`) |
| 412 | `GET` | `/staff/mobile/virtual-lab/{subjectId}` | - | `StaffMobileVirtualLabController@show` (`routes/web.php:938` -> `app/Http/Controllers/StaffMobileVirtualLabController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | All Teaching & Lab Staff (`Lecturer`, `HOD`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Tutor`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Super_Admin`; `StaffMobileVirtualLabController::resolveStaff`; `app/Http/Controllers/StaffMobileVirtualLabController.php:18-48`) |
| 413 | `GET` | `/api/mentoring/my-batches` | - | `MentoringController@getMyBatches` (`routes/web.php:941` -> `app/Http/Controllers/MentoringController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Mentor`, `Tutor`, `HOD`, `Principal`, `Super_Admin`, plus `Student` on shared diary endpoints (`MentoringController`; `app/Http/Controllers/MentoringController.php:15-985`) |
| 414 | `GET` | `/api/mentoring/students/{classroomId}` | - | `MentoringController@getClassroomStudents` (`routes/web.php:942` -> `app/Http/Controllers/MentoringController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Mentor`, `Tutor`, `HOD`, `Principal`, `Super_Admin`, plus `Student` on shared diary endpoints (`MentoringController`; `app/Http/Controllers/MentoringController.php:15-985`) |
| 415 | `GET` | `/api/mentoring/classroom/{classroomId}/leaves` | - | `MentoringController@getClassroomLeaves` (`routes/web.php:943` -> `app/Http/Controllers/MentoringController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Mentor`, `Tutor`, `HOD`, `Principal`, `Super_Admin`, plus `Student` on shared diary endpoints (`MentoringController`; `app/Http/Controllers/MentoringController.php:15-985`) |
| 416 | `POST` | `/api/mentoring/assign-batch` | - | `MentoringController@assignBatch` (`routes/web.php:944` -> `app/Http/Controllers/MentoringController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Mentor`, `Tutor`, `HOD`, `Principal`, `Super_Admin`, plus `Student` on shared diary endpoints (`MentoringController`; `app/Http/Controllers/MentoringController.php:15-985`) |
| 417 | `POST` | `/api/mentoring/assign-mentor2` | - | `MentoringController@assignMentor2` (`routes/web.php:945` -> `app/Http/Controllers/MentoringController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Mentor`, `Tutor`, `HOD`, `Principal`, `Super_Admin`, plus `Student` on shared diary endpoints (`MentoringController`; `app/Http/Controllers/MentoringController.php:15-985`) |
| 418 | `GET` | `/api/mentoring/diary/{regNo}` | - | `MentoringController@getStudentDiary` (`routes/web.php:946` -> `app/Http/Controllers/MentoringController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Mentor`, `Tutor`, `HOD`, `Principal`, `Super_Admin`, plus `Student` on shared diary endpoints (`MentoringController`; `app/Http/Controllers/MentoringController.php:15-985`) |
| 419 | `POST` | `/api/mentoring/diary/add` | - | `MentoringController@addDiaryEntry` (`routes/web.php:947` -> `app/Http/Controllers/MentoringController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Mentor`, `Tutor`, `HOD`, `Principal`, `Super_Admin`, plus `Student` on shared diary endpoints (`MentoringController`; `app/Http/Controllers/MentoringController.php:15-985`) |
| 420 | `POST` | `/api/mentoring/diary/approve` | - | `MentoringController@approveDiaryEntry` (`routes/web.php:948` -> `app/Http/Controllers/MentoringController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Mentor`, `Tutor`, `HOD`, `Principal`, `Super_Admin`, plus `Student` on shared diary endpoints (`MentoringController`; `app/Http/Controllers/MentoringController.php:15-985`) |
| 421 | `POST` | `/api/mentoring/diary/delete` | - | `MentoringController@deleteDiaryEntry` (`routes/web.php:949` -> `app/Http/Controllers/MentoringController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Mentor`, `Tutor`, `HOD`, `Principal`, `Super_Admin`, plus `Student` on shared diary endpoints (`MentoringController`; `app/Http/Controllers/MentoringController.php:15-985`) |
| 422 | `POST` | `/api/mentoring/leave/save` | - | `MentoringController@saveLeaveRecord` (`routes/web.php:950` -> `app/Http/Controllers/MentoringController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Mentor`, `Tutor`, `HOD`, `Principal`, `Super_Admin`, plus `Student` on shared diary endpoints (`MentoringController`; `app/Http/Controllers/MentoringController.php:15-985`) |
| 423 | `POST` | `/api/mentoring/leave/approve` | - | `MentoringController@approveLeaveRecord` (`routes/web.php:951` -> `app/Http/Controllers/MentoringController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Mentor`, `Tutor`, `HOD`, `Principal`, `Super_Admin`, plus `Student` on shared diary endpoints (`MentoringController`; `app/Http/Controllers/MentoringController.php:15-985`) |
| 424 | `POST` | `/api/mentoring/disciplinary/save` | - | `MentoringController@saveDisciplinary` (`routes/web.php:952` -> `app/Http/Controllers/MentoringController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Mentor`, `Tutor`, `HOD`, `Principal`, `Super_Admin`, plus `Student` on shared diary endpoints (`MentoringController`; `app/Http/Controllers/MentoringController.php:15-985`) |
| 425 | `POST` | `/api/mentoring/disciplinary/delete` | - | `MentoringController@deleteDisciplinary` (`routes/web.php:953` -> `app/Http/Controllers/MentoringController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Mentor`, `Tutor`, `HOD`, `Principal`, `Super_Admin`, plus `Student` on shared diary endpoints (`MentoringController`; `app/Http/Controllers/MentoringController.php:15-985`) |
| 426 | `POST` | `/api/student/mentoring/extra-curricular/save` | - | `MentoringController@studentSaveExtraCurricular` (`routes/web.php:954` -> `app/Http/Controllers/MentoringController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Student` (authenticated student session), plus `Tutor`/`HOD`/`Admin`/`Super_Admin` on administrative student endpoints (`routes/web.php:954`) |
| 427 | `GET` | `/api/mentoring/report/{classroomId}` | - | `MentoringController@getMentoringReport` (`routes/web.php:955` -> `app/Http/Controllers/MentoringController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Mentor`, `Tutor`, `HOD`, `Principal`, `Super_Admin`, plus `Student` on shared diary endpoints (`MentoringController`; `app/Http/Controllers/MentoringController.php:15-985`) |
| 428 | `GET` | `/api/mentoring/backlog-report/{classroomId}` | - | `MentoringController@getBacklogReport` (`routes/web.php:956` -> `app/Http/Controllers/MentoringController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Mentor`, `Tutor`, `HOD`, `Principal`, `Super_Admin`, plus `Student` on shared diary endpoints (`MentoringController`; `app/Http/Controllers/MentoringController.php:15-985`) |
| 429 | `GET` | `/diary/{regNo}/print` | - | `MentoringController@printDiary` (`routes/web.php:958` -> `app/Http/Controllers/MentoringController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:958`) |
| 430 | `GET` | `/diary/{regNo}/leave-report` | - | `MentoringController@printLeaveReport` (`routes/web.php:959` -> `app/Http/Controllers/MentoringController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:959`) |
| 431 | `GET` | `/classroom/{classroomId}/condonation-report` | - | `MentoringController@printCondonationReport` (`routes/web.php:960` -> `app/Http/Controllers/MentoringController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:960`) |
| 432 | `POST` | `/api/student/mentoring/self-entry` | - | `MentoringController@studentSelfEntry` (`routes/web.php:963` -> `app/Http/Controllers/MentoringController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Student` (authenticated student session), plus `Tutor`/`HOD`/`Admin`/`Super_Admin` on administrative student endpoints (`routes/web.php:963`) |
| 433 | `POST` | `/api/student/mentoring/extended-profile` | - | `MentoringController@saveExtendedProfile` (`routes/web.php:964` -> `app/Http/Controllers/MentoringController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Student` (authenticated student session), plus `Tutor`/`HOD`/`Admin`/`Super_Admin` on administrative student endpoints (`routes/web.php:964`) |
| 434 | `GET` | `/api/student/mentoring/diary` | - | `MentoringController@studentViewDiary` (`routes/web.php:965` -> `app/Http/Controllers/MentoringController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Student` (authenticated student session), plus `Tutor`/`HOD`/`Admin`/`Super_Admin` on administrative student endpoints (`routes/web.php:965`) |
| 435 | `POST` | `/api/student/mentoring/save-all` | - | `MentoringController@saveStudentMentoringData` (`routes/web.php:966` -> `app/Http/Controllers/MentoringController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Student` (authenticated student session), plus `Tutor`/`HOD`/`Admin`/`Super_Admin` on administrative student endpoints (`routes/web.php:966`) |
| 436 | `GET` | `/api/student/activity-points` | - | `ActivityPointsController@getStudentPoints` (`routes/web.php:969` -> `app/Http/Controllers/ActivityPointsController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Student` (authenticated student session), plus `Tutor`/`HOD`/`Admin`/`Super_Admin` on administrative student endpoints (`routes/web.php:969`) |
| 437 | `POST` | `/api/student/activity-points` | - | `ActivityPointsController@submitClaim` (`routes/web.php:970` -> `app/Http/Controllers/ActivityPointsController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Student` (authenticated student session), plus `Tutor`/`HOD`/`Admin`/`Super_Admin` on administrative student endpoints (`routes/web.php:970`) |
| 438 | `GET` | `/api/student/activity-points/summary/{regNo}` | - | `ActivityPointsController@getStudentSummary` (`routes/web.php:971` -> `app/Http/Controllers/ActivityPointsController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Student` (authenticated student session), plus `Tutor`/`HOD`/`Admin`/`Super_Admin` on administrative student endpoints (`routes/web.php:971`) |
| 439 | `GET` | `/api/tutor/activity-points` | - | `ActivityPointsController@getClassroomClaims` (`routes/web.php:972` -> `app/Http/Controllers/ActivityPointsController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Tutor`, `HOD`, `Principal`, `Super_Admin` (`TutorController` / `TutorSpecialAttendanceController` / `DataController`; `routes/web.php:972`) |
| 440 | `POST` | `/api/tutor/activity-points/{id}/verify` | - | `ActivityPointsController@verifyClaim` (`routes/web.php:973` -> `app/Http/Controllers/ActivityPointsController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Tutor`, `HOD`, `Principal`, `Super_Admin` (`TutorController` / `TutorSpecialAttendanceController` / `DataController`; `routes/web.php:973`) |
| 441 | `GET` | `/api/executive/profile/details` | - | `AuthController@getExecutiveProfile` (`routes/web.php:976` -> `app/Http/Controllers/AuthController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:976`) |
| 442 | `POST` | `/api/executive/profile/update` | - | `AuthController@updateExecutiveProfile` (`routes/web.php:977` -> `app/Http/Controllers/AuthController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:977`) |
| 443 | `POST` | `/api/student/profile/upload-photo` | - | `DataController@uploadStudentPhoto` (`routes/web.php:978` -> `app/Http/Controllers/DataController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Student` (authenticated student session), plus `Tutor`/`HOD`/`Admin`/`Super_Admin` on administrative student endpoints (`routes/web.php:978`) |
| 444 | `POST` | `/api/student/profile/update-self` | - | `DataController@updateSelfStudentProfile` (`routes/web.php:979` -> `app/Http/Controllers/DataController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Student` (authenticated student session), plus `Tutor`/`HOD`/`Admin`/`Super_Admin` on administrative student endpoints (`routes/web.php:979`) |
| 445 | `POST` | `/api/student/update-email` | - | `DataController@updateStudentEmail` (`routes/web.php:980` -> `app/Http/Controllers/DataController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Student` (authenticated student session), plus `Tutor`/`HOD`/`Admin`/`Super_Admin` on administrative student endpoints (`routes/web.php:980`) |
| 446 | `POST` | `/api/students/bulk-import` | - | `DataController@bulkImportStudents` (`routes/web.php:981` -> `app/Http/Controllers/DataController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:981`) |
| 447 | `POST` | `/api/admin/batch-student-upload` | - | `BatchStudentUploadController@uploadBatchStudents` (`routes/web.php:982` -> `app/Http/Controllers/BatchStudentUploadController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Admin`, `Principal`, `Chairman`, `Super_Admin` (`routes/web.php:982`) |
| 448 | `POST` | `/api/student/complete-first-login-profile` | - | `BatchStudentUploadController@completeFirstLoginProfile` (`routes/web.php:983` -> `app/Http/Controllers/BatchStudentUploadController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Student` (authenticated student session), plus `Tutor`/`HOD`/`Admin`/`Super_Admin` on administrative student endpoints (`routes/web.php:983`) |
| 449 | `GET` | `/api/students/template/download` | - | `DataController@downloadStudentImportTemplate` (`routes/web.php:984` -> `app/Http/Controllers/DataController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:984`) |
| 450 | `POST` | `/api/staff/profile/upload-photo` | - | `DataController@uploadStaffPhoto` (`routes/web.php:985` -> `app/Http/Controllers/DataController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:985`) |
| 451 | `POST` | `/api/staff/profile/save-avatar-framing` | - | `DataController@saveStaffAvatarFraming` (`routes/web.php:986` -> `app/Http/Controllers/DataController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:986`) |
| 452 | `POST` | `/api/staff/update-photo` | - | `DataController@uploadStaffPhoto` (`routes/web.php:987` -> `app/Http/Controllers/DataController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:987`) |
| 453 | `POST` | `/api/staff/change-password` | - | `AuthController@changeStaffPassword` (`routes/web.php:988` -> `app/Http/Controllers/AuthController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:988`) |
| 454 | `GET` | `/api/staff/birthdays/today` | - | `StaffBirthdayController@getTodayBirthdays` (`routes/web.php:991` -> `app/Http/Controllers/StaffBirthdayController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:991`) |
| 455 | `POST` | `/api/staff/birthdays/wish` | - | `StaffBirthdayController@sendWish` (`routes/web.php:992` -> `app/Http/Controllers/StaffBirthdayController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:992`) |
| 456 | `POST` | `/api/staff/profile/update-dob` | - | `StaffBirthdayController@updateSelfDob` (`routes/web.php:993` -> `app/Http/Controllers/StaffBirthdayController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:993`) |
| 457 | `POST` | `/api/student/tasks/submit` | - | `DataController@submitManualTask` (`routes/web.php:994` -> `app/Http/Controllers/DataController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Student` (authenticated student session), plus `Tutor`/`HOD`/`Admin`/`Super_Admin` on administrative student endpoints (`routes/web.php:994`) |
| 458 | `GET` | `/api/student/online-tests` | - | `TestEngineController@getAvailableTests` (`routes/web.php:995` -> `app/Http/Controllers/TestEngineController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Student` (authenticated student session), plus `Tutor`/`HOD`/`Admin`/`Super_Admin` on administrative student endpoints (`routes/web.php:995`) |
| 459 | `GET` | `/student/online-tests/{testId}/start` | `student.online-test.start` | `TestEngineController@showOnlineTest` (`routes/web.php:996` -> `app/Http/Controllers/TestEngineController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Student` (`OnlineTestController` verifies student session/reg_no; `app/Http/Controllers/OnlineTestController.php:490-720`) |
| 460 | `POST` | `/api/student/online-tests/{testId}/start` | - | `TestEngineController@startTest` (`routes/web.php:997` -> `app/Http/Controllers/TestEngineController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Student` (authenticated student session), plus `Tutor`/`HOD`/`Admin`/`Super_Admin` on administrative student endpoints (`routes/web.php:997`) |
| 461 | `POST` | `/api/student/online-tests/{testId}/submit` | - | `TestEngineController@submitTest` (`routes/web.php:998` -> `app/Http/Controllers/TestEngineController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Student` (authenticated student session), plus `Tutor`/`HOD`/`Admin`/`Super_Admin` on administrative student endpoints (`routes/web.php:998`) |
| 462 | `GET` | `/api/student/online-tests/{testId}/answer-key` | - | `TestEngineController@getAnswerKey` (`routes/web.php:999` -> `app/Http/Controllers/TestEngineController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Student` (authenticated student session), plus `Tutor`/`HOD`/`Admin`/`Super_Admin` on administrative student endpoints (`routes/web.php:999`) |
| 463 | `GET` | `/student/mock-test` | - | `StudentMockTestController@index` (`routes/web.php:1002` -> `app/Http/Controllers/StudentMockTestController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:1002`) |
| 464 | `GET` | `/api/student/mock-test/subjects` | - | `StudentMockTestController@getSubjects` (`routes/web.php:1003` -> `app/Http/Controllers/StudentMockTestController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Student` (authenticated student session), plus `Tutor`/`HOD`/`Admin`/`Super_Admin` on administrative student endpoints (`routes/web.php:1003`) |
| 465 | `POST` | `/api/student/mock-test/start` | - | `StudentMockTestController@startMockTest` (`routes/web.php:1004` -> `app/Http/Controllers/StudentMockTestController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Student` (authenticated student session), plus `Tutor`/`HOD`/`Admin`/`Super_Admin` on administrative student endpoints (`routes/web.php:1004`) |
| 466 | `DELETE` | `/api/classroom/online-tests/{testId}` | - | `TestEngineController@deleteOnlineTest` (`routes/web.php:1005` -> `app/Http/Controllers/TestEngineController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:1005`) |
| 467 | `GET` | `/api/classroom/online-tests/{testId}/key` | - | `TestEngineController@getLecturerAnswerKey` (`routes/web.php:1006` -> `app/Http/Controllers/TestEngineController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:1006`) |
| 468 | `POST` | `/api/classroom/{subjectId}/survey/initiate` | - | `MidSemSurveyController@initiateSurvey` (`routes/web.php:1009` -> `app/Http/Controllers/MidSemSurveyController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:1009`) |
| 469 | `POST` | `/api/classroom/{subjectId}/survey/close` | - | `MidSemSurveyController@closeSurvey` (`routes/web.php:1010` -> `app/Http/Controllers/MidSemSurveyController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:1010`) |
| 470 | `GET` | `/api/classroom/{subjectId}/survey/results` | - | `MidSemSurveyController@getSurveyResults` (`routes/web.php:1011` -> `app/Http/Controllers/MidSemSurveyController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:1011`) |
| 471 | `POST` | `/api/classroom/{subjectId}/survey/save-notes` | - | `MidSemSurveyController@saveNotes` (`routes/web.php:1012` -> `app/Http/Controllers/MidSemSurveyController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:1012`) |
| 472 | `GET` | `/classroom/{subjectId}/survey/report` | - | `MidSemSurveyController@printSurveyReport` (`routes/web.php:1013` -> `app/Http/Controllers/MidSemSurveyController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:1013`) |
| 473 | `GET` | `/student/survey/{surveyId}` | - | `MidSemSurveyController@studentViewSurvey` (`routes/web.php:1014` -> `app/Http/Controllers/MidSemSurveyController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:1014`) |
| 474 | `POST` | `/api/student/survey/submit` | - | `MidSemSurveyController@studentSubmitSurvey` (`routes/web.php:1015` -> `app/Http/Controllers/MidSemSurveyController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Student` (authenticated student session), plus `Tutor`/`HOD`/`Admin`/`Super_Admin` on administrative student endpoints (`routes/web.php:1015`) |
| 475 | `POST` | `/api/classroom/{subjectId}/course-exit/initiate` | - | `CourseExitSurveyController@initiateSurvey` (`routes/web.php:1018` -> `app/Http/Controllers/CourseExitSurveyController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:1018`) |
| 476 | `POST` | `/api/classroom/{subjectId}/course-exit/close` | - | `CourseExitSurveyController@closeSurvey` (`routes/web.php:1019` -> `app/Http/Controllers/CourseExitSurveyController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:1019`) |
| 477 | `GET` | `/api/classroom/{subjectId}/course-exit/results` | - | `CourseExitSurveyController@getSurveyResults` (`routes/web.php:1020` -> `app/Http/Controllers/CourseExitSurveyController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Demonstrator`, `Trade_Instructor`, `Tradesman`, `Workshop_Superintendent`, `Physical_Instructor`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin` (`routes/web.php:1020`) |
| 478 | `GET` | `/classroom/{subjectId}/course-exit/report` | - | `CourseExitSurveyController@printSurveyReport` (`routes/web.php:1021` -> `app/Http/Controllers/CourseExitSurveyController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:1021`) |
| 479 | `GET` | `/student/course-exit/{surveyId}` | - | `CourseExitSurveyController@studentViewSurvey` (`routes/web.php:1022` -> `app/Http/Controllers/CourseExitSurveyController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:1022`) |
| 480 | `POST` | `/api/student/course-exit/submit` | - | `CourseExitSurveyController@studentSubmitSurvey` (`routes/web.php:1023` -> `app/Http/Controllers/CourseExitSurveyController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Student` (authenticated student session), plus `Tutor`/`HOD`/`Admin`/`Super_Admin` on administrative student endpoints (`routes/web.php:1023`) |
| 481 | `GET` | `/remedial-sessions` | - | Closure (`routes/web.php:1026-1030`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:1026`) |
| 482 | `GET` | `/hod/report-centre` | - | Closure (`routes/web.php:1032-1048`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Admin`, `Super_Admin` (`routes/web.php:1032`) |
| 483 | `GET` | `/hod/program-attainment/{classroomId}` | - | `ProgramAttainmentController@index` (`routes/web.php:1051` -> `app/Http/Controllers/ProgramAttainmentController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Admin`, `Super_Admin` (`routes/web.php:1051`) |
| 484 | `POST` | `/hod/program-attainment/{classroomId}/save` | - | `ProgramAttainmentController@saveConfig` (`routes/web.php:1052` -> `app/Http/Controllers/ProgramAttainmentController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Admin`, `Super_Admin` (`routes/web.php:1052`) |
| 485 | `GET` | `/hod/program-attainment/{classroomId}/print` | - | `ProgramAttainmentController@printReport` (`routes/web.php:1053` -> `app/Http/Controllers/ProgramAttainmentController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Admin`, `Super_Admin` (`routes/web.php:1053`) |
| 486 | `GET` | `/hod/report-centre/workload-panel` | - | Closure (`routes/web.php:1055-1072`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Admin`, `Super_Admin` (`routes/web.php:1055`) |
| 487 | `GET` | `/hod/consolidated-timetable/print` | - | Closure (`routes/web.php:1074-1110`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Admin`, `Super_Admin` (`routes/web.php:1074`) |
| 488 | `GET` | `/hod/attendance-summary/print` | - | Closure (`routes/web.php:1112-1320`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Admin`, `Super_Admin` (`routes/web.php:1112`) |
| 489 | `GET` | `/hod/remedial-report/print` | - | Closure (`routes/web.php:1322-1398`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Admin`, `Super_Admin` (`routes/web.php:1322`) |
| 490 | `GET` | `/hod/course-files-report/print` | - | Closure (`routes/web.php:1400-1468`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Admin`, `Super_Admin` (`routes/web.php:1400`) |
| 491 | `GET` | `/hod/activity-points-report/print` | - | Closure (`routes/web.php:1470-1530`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Admin`, `Super_Admin` (`routes/web.php:1470`) |
| 492 | `GET` | `/hod/workload-report/print` | - | Closure (`routes/web.php:1532-1859`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Admin`, `Super_Admin` (`routes/web.php:1532`) |
| 493 | `GET` | `/api/hod/batches/{classroomId}/timetable` | - | Closure (`routes/web.php:1861-1872`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Admin`, `Super_Admin` (`routes/web.php:1861`) |
| 494 | `POST` | `/api/hod/batches/{classroomId}/timetable` | - | Closure (`routes/web.php:1874-1886`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Admin`, `Super_Admin` (`routes/web.php:1874`) |
| 495 | `GET` | `/remedial/rooms/{roomId}/assessments/{assessmentId}/report` | - | `RemedialController@printAssessmentReport` (`routes/web.php:1887` -> `app/Http/Controllers/RemedialController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:1887`) |
| 496 | `GET` | `/remedial/rooms/{roomId}/attendance/report` | - | `RemedialController@printAttendanceReport` (`routes/web.php:1888` -> `app/Http/Controllers/RemedialController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:1888`) |
| 497 | `GET` | `/remedial/rooms/{roomId}/analysis/report` | - | `RemedialController@printAnalysisReport` (`routes/web.php:1889` -> `app/Http/Controllers/RemedialController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:1889`) |
| 498 | `GET` | `/api/remedial/assigned-subjects` | - | `RemedialController@getAssignedSubjects` (`routes/web.php:1893` -> `app/Http/Controllers/RemedialController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin`, plus `Student` for remedial view (`RemedialController`; `routes/web.php:1893`) |
| 499 | `GET` | `/api/remedial/student-performance` | - | `RemedialController@getStudentPerformance` (`routes/web.php:1894` -> `app/Http/Controllers/RemedialController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin`, plus `Student` for remedial view (`RemedialController`; `routes/web.php:1894`) |
| 500 | `POST` | `/api/remedial/rooms` | - | `RemedialController@createRoom` (`routes/web.php:1895` -> `app/Http/Controllers/RemedialController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin`, plus `Student` for remedial view (`RemedialController`; `routes/web.php:1895`) |
| 501 | `GET` | `/api/remedial/rooms` | - | `RemedialController@getRooms` (`routes/web.php:1896` -> `app/Http/Controllers/RemedialController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin`, plus `Student` for remedial view (`RemedialController`; `routes/web.php:1896`) |
| 502 | `GET` | `/api/remedial/rooms/{roomId}` | - | `RemedialController@getRoomDetails` (`routes/web.php:1897` -> `app/Http/Controllers/RemedialController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin`, plus `Student` for remedial view (`RemedialController`; `routes/web.php:1897`) |
| 503 | `DELETE` | `/api/remedial/rooms/{roomId}` | - | `RemedialController@deleteRoom` (`routes/web.php:1898` -> `app/Http/Controllers/RemedialController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin`, plus `Student` for remedial view (`RemedialController`; `routes/web.php:1898`) |
| 504 | `PATCH` | `/api/remedial/rooms/{roomId}/status` | - | `RemedialController@updateRoomStatus` (`routes/web.php:1899` -> `app/Http/Controllers/RemedialController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin`, plus `Student` for remedial view (`RemedialController`; `routes/web.php:1899`) |
| 505 | `POST` | `/api/remedial/rooms/{roomId}/students` | - | `RemedialController@addStudent` (`routes/web.php:1900` -> `app/Http/Controllers/RemedialController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin`, plus `Student` for remedial view (`RemedialController`; `routes/web.php:1900`) |
| 506 | `DELETE` | `/api/remedial/rooms/{roomId}/students` | - | `RemedialController@removeStudent` (`routes/web.php:1901` -> `app/Http/Controllers/RemedialController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin`, plus `Student` for remedial view (`RemedialController`; `routes/web.php:1901`) |
| 507 | `POST` | `/api/remedial/rooms/{roomId}/logs` | - | `RemedialController@saveLog` (`routes/web.php:1902` -> `app/Http/Controllers/RemedialController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin`, plus `Student` for remedial view (`RemedialController`; `routes/web.php:1902`) |
| 508 | `GET` | `/api/remedial/rooms/{roomId}/assessments` | - | `RemedialController@getAssessments` (`routes/web.php:1903` -> `app/Http/Controllers/RemedialController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin`, plus `Student` for remedial view (`RemedialController`; `routes/web.php:1903`) |
| 509 | `POST` | `/api/remedial/rooms/{roomId}/assessments` | - | `RemedialController@createAssessment` (`routes/web.php:1904` -> `app/Http/Controllers/RemedialController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin`, plus `Student` for remedial view (`RemedialController`; `routes/web.php:1904`) |
| 510 | `POST` | `/api/remedial/rooms/{roomId}/assessments/{assessmentId}/scores` | - | `RemedialController@saveAssessmentScores` (`routes/web.php:1905` -> `app/Http/Controllers/RemedialController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin`, plus `Student` for remedial view (`RemedialController`; `routes/web.php:1905`) |
| 511 | `POST` | `/api/remedial/rooms/{roomId}/assessments/{assessmentId}/sync` | - | `RemedialController@syncOnlineScores` (`routes/web.php:1906` -> `app/Http/Controllers/RemedialController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Lecturer`, `Tutor`, `HOD`, `Academic_Coordinator`, `Gen_Dept_Coordinator`, `Principal`, `Super_Admin`, plus `Student` for remedial view (`RemedialController`; `routes/web.php:1906`) |
| 512 | `GET` | `/staff/attendance-log` | - | `AttendanceController@viewPage` (`routes/web.php:1910` -> `app/Http/Controllers/AttendanceController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:1910`) |
| 513 | `GET` | `/api/staff/attendance/subjects` | - | `AttendanceController@getActiveSubjects` (`routes/web.php:1911` -> `app/Http/Controllers/AttendanceController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:1911`) |
| 514 | `GET` | `/api/staff/attendance/subjects/{id}/details` | - | `AttendanceController@getSubjectDetails` (`routes/web.php:1912` -> `app/Http/Controllers/AttendanceController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:1912`) |
| 515 | `GET` | `/api/staff/attendance/session-check` | - | `AttendanceController@checkSessionAttendance` (`routes/web.php:1913` -> `app/Http/Controllers/AttendanceController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:1913`) |
| 516 | `POST` | `/api/staff/attendance/save` | - | `AttendanceController@saveAttendance` (`routes/web.php:1914` -> `app/Http/Controllers/AttendanceController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:1914`) |
| 517 | `POST` | `/api/staff/attendance/delete-log` | - | `AttendanceController@deleteAttendanceLog` (`routes/web.php:1915` -> `app/Http/Controllers/AttendanceController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:1915`) |
| 518 | `POST` | `/api/staff/attendance/import-sbte-pdf` | - | `SbteSubjectLogImportController@importPdf` (`routes/web.php:1916` -> `app/Http/Controllers/SbteSubjectLogImportController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:1916`) |
| 519 | `POST` | `/api/staff/attendance/sync-from-lesson-plan` | - | `SbteSubjectLogImportController@syncFromLessonPlan` (`routes/web.php:1917` -> `app/Http/Controllers/SbteSubjectLogImportController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:1917`) |
| 520 | `GET` | `/api/tutor/attendance/students` | - | `AttendanceController@getTutorStudents` (`routes/web.php:1918` -> `app/Http/Controllers/AttendanceController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Tutor`, `HOD`, `Principal`, `Super_Admin` (`TutorController` / `TutorSpecialAttendanceController` / `DataController`; `routes/web.php:1918`) |
| 521 | `POST` | `/api/tutor/attendance/roll-numbers` | - | `AttendanceController@updateRollNumbers` (`routes/web.php:1919` -> `app/Http/Controllers/AttendanceController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Tutor`, `HOD`, `Principal`, `Super_Admin` (`TutorController` / `TutorSpecialAttendanceController` / `DataController`; `routes/web.php:1919`) |
| 522 | `GET` | `/api/tutor/attendance/consolidated` | - | `AttendanceController@getConsolidatedTutorAttendance` (`routes/web.php:1920` -> `app/Http/Controllers/AttendanceController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Tutor`, `HOD`, `Principal`, `Super_Admin` (`TutorController` / `TutorSpecialAttendanceController` / `DataController`; `routes/web.php:1920`) |
| 523 | `GET` | `/tutor/attendance/report/print` | - | `AttendanceController@printTutorAttendanceReport` (`routes/web.php:1921` -> `app/Http/Controllers/AttendanceController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:1921`) |
| 524 | `GET` | `/tutor/attendance/student-print` | - | `AttendanceController@printStudentAttendanceReport` (`routes/web.php:1922` -> `app/Http/Controllers/AttendanceController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:1922`) |
| 525 | `GET` | `/tutor/attendance/student/{regNo}/print` | - | `AttendanceController@printStudentAttendanceReport` (`routes/web.php:1923` -> `app/Http/Controllers/AttendanceController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:1923`) |
| 526 | `GET` | `/api/tutor/attendance/condonation-register` | - | `TutorSpecialAttendanceController@getCondonationRegister` (`routes/web.php:1926` -> `app/Http/Controllers/TutorSpecialAttendanceController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Tutor`, `HOD`, `Principal`, `Super_Admin` (`TutorController` / `TutorSpecialAttendanceController` / `DataController`; `routes/web.php:1926`) |
| 527 | `POST` | `/api/tutor/attendance/special/save` | - | `TutorSpecialAttendanceController@saveSpecialAttendance` (`routes/web.php:1927` -> `app/Http/Controllers/TutorSpecialAttendanceController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Tutor`, `HOD`, `Principal`, `Super_Admin` (`TutorController` / `TutorSpecialAttendanceController` / `DataController`; `routes/web.php:1927`) |
| 528 | `POST` | `/api/tutor/attendance/special/delete/{id}` | - | `TutorSpecialAttendanceController@deleteSpecialAttendance` (`routes/web.php:1928` -> `app/Http/Controllers/TutorSpecialAttendanceController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Tutor`, `HOD`, `Principal`, `Super_Admin` (`TutorController` / `TutorSpecialAttendanceController` / `DataController`; `routes/web.php:1928`) |
| 529 | `POST` | `/api/tutor/attendance/special/upload-teams-log` | - | `TutorSpecialAttendanceController@uploadTeamsAttendanceLog` (`routes/web.php:1929` -> `app/Http/Controllers/TutorSpecialAttendanceController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Tutor`, `HOD`, `Principal`, `Super_Admin` (`TutorController` / `TutorSpecialAttendanceController` / `DataController`; `routes/web.php:1929`) |
| 530 | `GET` | `/tutor/attendance/condonation-certificate` | - | `TutorSpecialAttendanceController@printCondonationCertificate` (`routes/web.php:1930` -> `app/Http/Controllers/TutorSpecialAttendanceController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:1930`) |
| 531 | `GET` | `/tutor/attendance/condonation-certificate/{regNo}` | - | `TutorSpecialAttendanceController@printCondonationCertificate` (`routes/web.php:1931` -> `app/Http/Controllers/TutorSpecialAttendanceController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:1931`) |
| 532 | `GET` | `/tutor/attendance/condonation-register/print` | - | `TutorSpecialAttendanceController@printCondonationRegister` (`routes/web.php:1932` -> `app/Http/Controllers/TutorSpecialAttendanceController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:1932`) |
| 533 | `GET` | `/api/tutor/progress-report` | - | `TutorController@getProgressReportData` (`routes/web.php:1933` -> `app/Http/Controllers/TutorController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Tutor`, `HOD`, `Principal`, `Super_Admin` (`TutorController` / `TutorSpecialAttendanceController` / `DataController`; `routes/web.php:1933`) |
| 534 | `GET` | `/tutor/progress-report/print` | - | `TutorController@printProgressReport` (`routes/web.php:1934` -> `app/Http/Controllers/TutorController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:1934`) |
| 535 | `GET` | `/tutor/progress-report/student-print` | - | `TutorController@printStudentProgressCard` (`routes/web.php:1935` -> `app/Http/Controllers/TutorController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:1935`) |
| 536 | `GET` | `/tutor/progress-report/student/{regNo}/print` | - | `TutorController@printStudentProgressCard` (`routes/web.php:1936` -> `app/Http/Controllers/TutorController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:1936`) |
| 537 | `GET` | `/api/consolidated-cia` | - | `ConsolidatedCiaReportController@getConsolidatedCiaData` (`routes/web.php:1939` -> `app/Http/Controllers/ConsolidatedCiaReportController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:1939`) |
| 538 | `POST` | `/api/consolidated-cia/lock` | - | `ConsolidatedCiaReportController@toggleLock` (`routes/web.php:1940` -> `app/Http/Controllers/ConsolidatedCiaReportController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:1940`) |
| 539 | `POST` | `/api/consolidated-cia/submit` | - | `ConsolidatedCiaReportController@submitToHod` (`routes/web.php:1941` -> `app/Http/Controllers/ConsolidatedCiaReportController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:1941`) |
| 540 | `GET` | `/consolidated-cia/print` | - | `ConsolidatedCiaReportController@printReport` (`routes/web.php:1942` -> `app/Http/Controllers/ConsolidatedCiaReportController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:1942`) |
| 541 | `GET` | `/api/staff/attendance/subjects/{id}/reports` | - | `AttendanceController@getReports` (`routes/web.php:1944` -> `app/Http/Controllers/AttendanceController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:1944`) |
| 542 | `GET` | `/hod/sbte-audit` | - | Closure (`routes/web.php:1947-1987`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Admin`, `Super_Admin` (`routes/web.php:1947`) |
| 543 | `POST` | `/hod/sbte-audit/save` | - | Closure (`routes/web.php:1989-2038`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Admin`, `Super_Admin` (`routes/web.php:1989`) |
| 544 | `GET / POST` | `/hod/sbte-audit/print` | - | Closure (`routes/web.php:2040-2119`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Admin`, `Super_Admin` (`routes/web.php:2040`) |
| 545 | `GET` | `/api/hod/sbte-audit/generate-perf` | - | Closure (`routes/web.php:2121-2169`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Admin`, `Super_Admin` (`routes/web.php:2121`) |
| 546 | `GET` | `/api/hod/sbte-audit/generate-course-files` | - | Closure (`routes/web.php:2170-2203`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Admin`, `Super_Admin` (`routes/web.php:2170`) |
| 547 | `GET` | `/hod/nba-audit` | - | Closure (`routes/web.php:2207-2256`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Admin`, `Super_Admin` (`routes/web.php:2207`) |
| 548 | `POST` | `/hod/nba-audit/upload` | - | Closure (`routes/web.php:2258-2287`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Admin`, `Super_Admin` (`routes/web.php:2258`) |
| 549 | `GET` | `/hod/nba-audit/print` | - | Closure (`routes/web.php:2289-2305`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Admin`, `Super_Admin` (`routes/web.php:2289`) |
| 550 | `GET` | `/staff/professional-activities` | - | Closure (`routes/web.php:2307-2326`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:2307`) |
| 551 | `POST` | `/staff/professional-activities/save` | - | Closure (`routes/web.php:2328-2348`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:2328`) |
| 552 | `POST` | `/staff/professional-activities/delete/{id}` | - | Closure (`routes/web.php:2350-2360`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:2350`) |
| 553 | `GET` | `/api/hod/sbte-audit/fetch-staff-activities` | - | Closure (`routes/web.php:2362-2408`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Admin`, `Super_Admin` (`routes/web.php:2362`) |
| 554 | `POST` | `/api/student/change-password` | - | `AuthController@changeStudentPassword` (`routes/web.php:2410` -> `app/Http/Controllers/AuthController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Student` (authenticated student session), plus `Tutor`/`HOD`/`Admin`/`Super_Admin` on administrative student endpoints (`routes/web.php:2410`) |
| 555 | `POST` | `/api/staff/leave/apply` | - | `StaffLeaveController@applyLeave` (`routes/web.php:2413` -> `app/Http/Controllers/StaffLeaveController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:2413`) |
| 556 | `GET` | `/api/staff/leave/my-history` | - | `StaffLeaveController@getMyLeaveHistory` (`routes/web.php:2414` -> `app/Http/Controllers/StaffLeaveController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:2414`) |
| 557 | `GET` | `/api/staff/leave/pending-approvals` | - | `StaffLeaveController@getPendingApprovals` (`routes/web.php:2415` -> `app/Http/Controllers/StaffLeaveController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:2415`) |
| 558 | `POST` | `/api/staff/leave/process-approval` | - | `StaffLeaveController@processApproval` (`routes/web.php:2416` -> `app/Http/Controllers/StaffLeaveController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:2416`) |
| 559 | `GET` | `/staff/leave/{id}/pdf` | - | `StaffLeaveController@generateLeavePDF` (`routes/web.php:2417` -> `app/Http/Controllers/StaffLeaveController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:2417`) |
| 560 | `GET` | `/staff/leave/reports` | - | `StaffLeaveController@getLeaveReports` (`routes/web.php:2418` -> `app/Http/Controllers/StaffLeaveController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:2418`) |
| 561 | `GET` | `/api/staff/my-punch-log` | - | `MentoringController@getMyMonthlyPunchLog` (`routes/web.php:2419` -> `app/Http/Controllers/MentoringController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:2419`) |
| 562 | `GET` | `/parent` | `parent.login` | `ParentDashboardController@showLoginPage` (`routes/web.php:2423` -> `app/Http/Controllers/ParentDashboardController.php`) | `web` (`UpdateUserOnlineStatus`) | `Parent` (dedicated `parent_reg_no` session via `ParentDashboardController`; `/parent/demo` & `/parent/dashboard/{regNo}` also reachable by `Principal`, `HOD`, `Tutor`, `Super_Admin`; `app/Http/Controllers/ParentDashboardController.php:19-410`) |
| 563 | `POST` | `/parent/login` | - | `ParentDashboardController@verifyLogin` (`routes/web.php:2424` -> `app/Http/Controllers/ParentDashboardController.php`) | `web` (`UpdateUserOnlineStatus`) | `Parent` (dedicated `parent_reg_no` session via `ParentDashboardController`; `/parent/demo` & `/parent/dashboard/{regNo}` also reachable by `Principal`, `HOD`, `Tutor`, `Super_Admin`; `app/Http/Controllers/ParentDashboardController.php:19-410`) |
| 564 | `GET` | `/parent/demo` | `parent.demo` | `ParentDashboardController@showDemoDashboard` (`routes/web.php:2425` -> `app/Http/Controllers/ParentDashboardController.php`) | `web` (`UpdateUserOnlineStatus`) | `Parent` (dedicated `parent_reg_no` session via `ParentDashboardController`; `/parent/demo` & `/parent/dashboard/{regNo}` also reachable by `Principal`, `HOD`, `Tutor`, `Super_Admin`; `app/Http/Controllers/ParentDashboardController.php:19-410`) |
| 565 | `GET` | `/parent/dashboard/{regNo}` | `parent.dashboard` | `ParentDashboardController@showDashboard` (`routes/web.php:2426` -> `app/Http/Controllers/ParentDashboardController.php`) | `web` (`UpdateUserOnlineStatus`) | `Parent` (dedicated `parent_reg_no` session via `ParentDashboardController`; `/parent/demo` & `/parent/dashboard/{regNo}` also reachable by `Principal`, `HOD`, `Tutor`, `Super_Admin`; `app/Http/Controllers/ParentDashboardController.php:19-410`) |
| 566 | `GET` | `/api/admin/executive-kpis` | - | `ExecutiveControlDeskController@getInstitutionalKpis` (`routes/web.php:2430` -> `app/Http/Controllers/ExecutiveControlDeskController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Admin`, `Principal`, `Chairman`, `Super_Admin` (`routes/web.php:2430`) |
| 567 | `GET` | `/api/admin/executive-compliance` | - | `ExecutiveControlDeskController@getComplianceSummary` (`routes/web.php:2431` -> `app/Http/Controllers/ExecutiveControlDeskController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Admin`, `Principal`, `Chairman`, `Super_Admin` (`routes/web.php:2431`) |
| 568 | `GET` | `/api/admin/executive-supervision-badges` | - | `ExecutiveControlDeskController@getDepartmentSupervisionBadges` (`routes/web.php:2432` -> `app/Http/Controllers/ExecutiveControlDeskController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Admin`, `Principal`, `Chairman`, `Super_Admin` (`routes/web.php:2432`) |
| 569 | `POST` | `/api/hod/department-pass-stats` | - | `ExecutiveControlDeskController@saveDepartmentPassStats` (`routes/web.php:2433` -> `app/Http/Controllers/ExecutiveControlDeskController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `HOD`, `Gen_Dept_Coordinator`, `Academic_Coordinator`, `Principal`, `Admin`, `Super_Admin` (`routes/web.php:2433`) |
| 570 | `GET` | `/admin/executive-digest/pdf` | - | `ExecutiveControlDeskController@generateExecutiveBoardDigestPdf` (`routes/web.php:2434` -> `app/Http/Controllers/ExecutiveControlDeskController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:2434`) |
| 571 | `POST` | `/api/admin/flash-notices/broadcast` | - | `ExecutiveFlashNoticeController@broadcast` (`routes/web.php:2437` -> `app/Http/Controllers/ExecutiveFlashNoticeController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Admin`, `Principal`, `Chairman`, `Super_Admin` (`routes/web.php:2437`) |
| 572 | `GET` | `/api/admin/flash-notices` | - | `ExecutiveFlashNoticeController@getNotices` (`routes/web.php:2438` -> `app/Http/Controllers/ExecutiveFlashNoticeController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Admin`, `Principal`, `Chairman`, `Super_Admin` (`routes/web.php:2438`) |
| 573 | `POST` | `/api/admin/flash-notices/revoke/{id}` | - | `ExecutiveFlashNoticeController@revokeNotice` (`routes/web.php:2439` -> `app/Http/Controllers/ExecutiveFlashNoticeController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | `Admin`, `Principal`, `Chairman`, `Super_Admin` (`routes/web.php:2439`) |
| 574 | `GET` | `/api/flash-notices/active` | - | `ExecutiveFlashNoticeController@getActiveNotices` (`routes/web.php:2440` -> `app/Http/Controllers/ExecutiveFlashNoticeController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:2440`) |
| 575 | `POST` | `/api/principal/events/schedule` | - | `PrincipalScheduledEventController@schedule` (`routes/web.php:2443` -> `app/Http/Controllers/PrincipalScheduledEventController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:2443`) |
| 576 | `GET` | `/api/principal/events` | - | `PrincipalScheduledEventController@index` (`routes/web.php:2444` -> `app/Http/Controllers/PrincipalScheduledEventController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:2444`) |
| 577 | `GET` | `/api/principal/events/feed` | - | `PrincipalScheduledEventController@feed` (`routes/web.php:2445` -> `app/Http/Controllers/PrincipalScheduledEventController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:2445`) |
| 578 | `GET` | `/api/campus-event/today` | - | `PrincipalScheduledEventController@getTodayCampusEvent` (`routes/web.php:2446` -> `app/Http/Controllers/PrincipalScheduledEventController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:2446`) |
| 579 | `DELETE` | `/api/principal/events/{id}` | - | `PrincipalScheduledEventController@destroy` (`routes/web.php:2447` -> `app/Http/Controllers/PrincipalScheduledEventController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:2447`) |
| 580 | `GET` | `/sf-attendance/face-punch` | - | `StaffAttendanceMobileController@showFacePunch` (`routes/web.php:2452` -> `app/Http/Controllers/StaffAttendanceMobileController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:2452`) |
| 581 | `POST` | `/sf-attendance/register-face` | - | `StaffAttendanceMobileController@saveFaceRegistration` (`routes/web.php:2453` -> `app/Http/Controllers/StaffAttendanceMobileController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:2453`) |
| 582 | `POST` | `/sf-attendance/verify-and-punch` | - | `StaffAttendanceMobileController@verifyAndPunch` (`routes/web.php:2454` -> `app/Http/Controllers/StaffAttendanceMobileController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:2454`) |
| 583 | `GET` | `/sf-attendance/geofence-setup` | - | `StaffAttendanceMobileController@showGeofenceSetup` (`routes/web.php:2455` -> `app/Http/Controllers/StaffAttendanceMobileController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:2455`) |
| 584 | `POST` | `/sf-attendance/geofence-setup` | - | `StaffAttendanceMobileController@saveGeofenceSetup` (`routes/web.php:2456` -> `app/Http/Controllers/StaffAttendanceMobileController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:2456`) |
| 585 | `GET` | `/sf-attendance/attendance-report` | - | `StaffAttendanceMobileController@showAttendanceReport` (`routes/web.php:2457` -> `app/Http/Controllers/StaffAttendanceMobileController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:2457`) |
| 586 | `POST / DELETE` | `/sf-attendance/delete-punch/{id}` | - | `StaffAttendanceMobileController@deletePunch` (`routes/web.php:2458` -> `app/Http/Controllers/StaffAttendanceMobileController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:2458`) |
| 587 | `POST / DELETE` | `/sf-attendance/reset-face/{staffId}` | - | `StaffAttendanceMobileController@resetFaceRegistration` (`routes/web.php:2459` -> `app/Http/Controllers/StaffAttendanceMobileController.php`) | `web` (explicit `Route::middleware(['web'])` + global `UpdateUserOnlineStatus`) | Authenticated Session Users (`Session::get("user")` / role-scoped handler at `routes/web.php:2459`) |



---

## 4.2 Role-by-Role Dashboard & Virtual Classroom Breakdown

Every role dashboard view, companion mobile view, and subject virtual classroom in `resources/views/` is documented below with its serving controller/route, sidebar/navigation menu items, tabs/panels, widgets/cards, modals, included partials, and data displayed, cited to `file:line` relative to `carmel-linx-laravel/`.

---

### 4.2.1 Principal, Super Admin & Admin Dashboards
- **Views & Controllers**:
  - `resources/views/principal_dashboard.blade.php:1`: 1-line wrapper (`@include('admin_control_desk', ['isPrincipal' => true])`) served by `GET /dashboard/principal` (`routes/web.php:310-315`) and `PrincipalDashboardController` (`app/Http/Controllers/PrincipalDashboardController.php:14-642`).
  - `resources/views/super_admin_dashboard.blade.php:1`: 1-line wrapper (`@include('admin_control_desk', ['isSuperAdmin' => true])`) served by `GET /dashboard/superadmin` (`routes/web.php:281-285`).
  - `resources/views/admin_control_desk.blade.php:1-4015`: Unified Executive & System Control Desk shared by `Super_Admin`, `Principal`, and `Admin` (`ExecutiveControlDeskController` at `app/Http/Controllers/ExecutiveControlDeskController.php:16-390`, `DataController` at `app/Http/Controllers/DataController.php:18-620`, `BackupController` at `app/Http/Controllers/BackupController.php:15-210`).
  - `resources/views/admin_dashboard.blade.php:1-377`: Dedicated Admin Overview & Course File Library view served by `GET /dashboard/admin` (`routes/web.php:305-309`).
  - `resources/views/admin_show_users_table.blade.php:1-194`: Printable/searchable Master Users Directory table served by `GET /superadmin/show-users` (`routes/web.php:287-303`).
  - `resources/views/principal_today_timetable.blade.php:1-432`: Institution-wide Live Today's Timetable & Class Conduction Monitor served by `GET /dashboard/principal/today-timetable` (`PrincipalDashboardController@showTodayTimetable` at `app/Http/Controllers/PrincipalDashboardController.php:520-642`, `routes/web.php:353-354`).

#### A. `resources/views/admin_control_desk.blade.php` (`:1-4015`)
- **Sidebar / Navigation Menu Items (`resources/views/admin_control_desk.blade.php:162-265`)**:
  - Executive Profile Header Card (`onclick="openExecutiveProfileModal()"`, `:173-190`)
  - `Dashboard Overview` (`#navDashboard`, `onclick="switchPanel('dashboard')"`, `:193-196`)
  - `Biometric Staff Attendance Report` link (`href="/sf-staff/attendance-report"`, `:197-201`)
  - `Campus Geofence Setup` link (`href="/sf-campus/geofence-setup"`, `:202-205`)
  - `User Directory` (`#navDirectory`, `onclick="switchPanel('directory')"`, `:206-209`)
  - `Drive Backups & Restore` (`#navBackups`, `onclick="switchPanel('backups')"`, `:210-213`)
  - `Security Audit Trail` (`#navAudit`, `onclick="switchPanel('audit')"`, `:214-217`)
  - `Live Online Staff Monitor` (`#navLiveStaff`, `onclick="switchPanel('liveStaff')"`, `:220-226`, visible when `$isSuperAdmin` is true)
  - `My Profile & Security` (`#navProfile`, `onclick="openExecutiveProfileModal()"`, `:228-231`)
  - `System Settings` (`#navSettings`, `onclick="switchPanel('settings')"`, `:232-235`)
  - `Sign Out` link (`href="/logout"`, `:239-253`)
  - `Remote Support Assist` trigger card (`onclick="openStaffSupportModal()"`, `:263-265`)
- **Top Header Controls (`resources/views/admin_control_desk.blade.php:275-305`)**:
  - Active Panel Title (`#panelTitle`, `:279`), AI System Status Badge (`#topAiStatusBadge`, `:282-287`), Fullscreen Toggle (`@include('partials.fullscreen_btn')`, `:289`), Light/Dark Theme Toggle (`#themeToggleBtn`, `:292-295`), Live Remote Support Desk Drawer Button (`onclick="toggleAdminSupportDeskDrawer()"`, `:297-302`).
- **Panels, Widgets/Cards & Data Shown**:
  1. **Panel 1 — Dashboard Overview (`#panelDashboard`, `:315-814`)**:
     - **Executive KPI Strip (`:320-388`)**:
       - *Staff In Campus* card (`onclick="openStaffCampusModal()"`, `:329-338`) showing live present vs. on-leave staff counts.
       - *Students In Campus* card (`onclick="openStudentCampusModal()"`, `:339-348`) showing active student attendance vs. leave counts.
       - *Pending Approvals* card (`onclick="openPendingApprovalsModal()"`, `:349-368`) showing unapproved account registrations and pending leave escalations.
       - *Today's Scheduled Events* card (`onclick="openTodayEventsModal()"`, `:369-378`) showing institutional calendar events for today.
       - *Department Timetables & Conduction* card (`onclick="openDepartmentTimetables()"`, `:379-388`) linking to `/dashboard/principal/today-timetable`.
     - **Institutional Day Order & Semester Control Widget (`:390-518`)**: Displays active institutional Day Order (`Day 1`–`Day 5` or `Holiday`), semester dates, and allows immediate override via `POST /api/system/set-day-order` (`routes/web.php:495-504`).
     - **Flash Notice Broadcast & History Card (`:625-660`)**: Buttons for `Broadcast Flash Notice` (`onclick="openFlashNoticeModal()"`, `:636`) and `Notice History` (`onclick="openFlashNoticeHistoryModal()"`, `:639`).
     - **Institutional Schedule Event & Academic Calendar Card (`:662-700`)**: Buttons for `Schedule Institutional Event` (`onclick="openPrincipalScheduleEventModal()"`, `:675`) and `Event History` (`onclick="openPrincipalScheduleEventHistoryModal()"`, `:678`).
     - **Department-Wise Performance & Drill-Down Cards (`:702-812`)**: Grid of all diploma branches (`CT`, `EL`, `ME`, `CE`, `EEE`, `AU`, `GEN_AIDED`, `GEN_SF`) showing faculty count, batch count, average attendance %, and CIA completion, with drill-down to `GET /dashboard/principal/department/{branch}` (`routes/web.php:343-351`).
  2. **Panel 2 — User Directory (`#panelDirectory`, `:816-928`)**:
     - Role/Branch/Status filter bar and search input (`:820-865`), `Batch Upload Students` button (`onclick="openBatchUploadModal()"`, `:826`), `Register New User` button (`onclick="openRegisterModal()"`, `:829`), and paginated Staff & Student accounts table (`:870-925`) with actions to approve account (`POST /api/approve-account`), toggle active status (`POST /api/admin/user/toggle-status`), reset password (`POST /api/admin/user/reset-password`), edit staff profile (`onclick="openEditStaffModal(...)"`, `:1831`), change role (`POST /api/admin/user/change-role`), or delete user (`POST /api/admin/user/delete`).
  3. **Panel 3 — Drive Backups & Restore (`#panelBackups`, `:930-1013`)**:
     - Google Drive Cloud Backup trigger (`POST /api/system/backup`), Local SQLite/SQL Backup Download (`GET /api/system/backup/download`), and Database Restore Upload (`POST /api/system/restore`) handled by `BackupController` (`app/Http/Controllers/BackupController.php:15-210`).
  4. **Panel 4 — Security Audit Trail (`#panelAudit`, `:1015-1055`)**:
     - Real-time security and operations audit log table (`GET /api/audit-logs`, `:1030-1052`) plus shortcut button to `Live Online Staff Desk` (`onclick="openLiveOnlineStaffDesk()"`, `:1025`).
  5. **Panel 5 — System Settings (`#panelSettings`, `:1057-1090`)**:
     - AI API provider key configuration, WebAuthn/Passkey security toggles, and global academic session settings (`ExecutiveControlDeskController`, `:1060-1089`).
  6. **Panel 6 — Live Online Staff Monitor (`#panelLiveStaff`, `:1092-1110`)**:
     - Embeds `@include('partials.live_online_staff_widget')` (`:1106`) polling `GET /api/users/online-status` (`routes/web.php:73-88`) and `GET /api/admin/online-staff-log` (`routes/web.php:520`).
- **Modals & Partials (`resources/views/admin_control_desk.blade.php:1114-4014`)**:
  - `#editStaffModal` (`:1114-1184`): Edit staff name, email, branch, role, and DOB.
  - `#passwordModal` (`:1186-1213`): Admin password reset dialog.
  - `#auditModal` (`:1215-1251`): Per-user audit log modal (`#modalAuditTableBody`, `:1239`).
  - `#registerModal` (`:1253-1387`): Register new staff or student account.
  - `#batchStudentUploadModal` (`:1389-1460`): CSV/Excel bulk student registration modal.
  - `#flashNoticeModal` (`:2845-2968`) & `#flashNoticeHistoryModal` (`:2970-3001`): Create and review institutional flash notices.
  - `#principalScheduleEventModal` (`:3003-3188`) & `#principalScheduleEventHistoryModal` (`:3190-3222`): Create and review institutional calendar events.
  - `#executiveProfileModal` (`:3224-3310`): Update executive avatar, name, mobile ID, email, and password.
  - `#pendingApprovalsModal` (`:3756-3802`): Approve/reject pending accounts and escalated staff leaves.
  - `#staffCampusModal` (`:3804-3861`): Live breakdown of `#modalTotalStaffCount` (`:3828`), `#modalStaffInCampusCount` (`:3832`), `#modalStaffOnLeaveCount` (`:3836`), and `#modalStaffOnLeaveList` (`:3845`).
  - `#studentCampusModal` (`:3863-3909`): Live breakdown of `#modalTotalStudentsCount` (`:3887`), `#modalStudentsInCampusCount` (`:3891`), and `#modalStudentsOnLeaveCount` (`:3895`).
  - `#todayEventsModal` (`:3911-3990`): Detailed list of today's scheduled events (`#modalEventsListContainer`, `:3976`).
  - Included Partials: `@include('partials.admin_support_desk_window')` (`:3992`), `@include('partials.support_desk_overlay')` (`:3993`), `@include('partials.birthday_wish_modal')` (`:4013`).

#### B. `resources/views/admin_dashboard.blade.php` (`:1-377`), `admin_show_users_table.blade.php` (`:1-194`) & `principal_today_timetable.blade.php` (`:1-432`)
- **`admin_dashboard.blade.php` (`:1-377`)**:
  - **Sidebar Navigation (`:147-193`)**: `Overview` (`#navDashboard`, `:171`), `Course File Library` (`#navCourseFileLibrary`, `:174`), `Security Log` (`#navSecurity`, `:178`), and `Sign Out` (`:187`).
  - **Panels**: `#panelDashboard` (`:215-224`, system KPI summary cards), `#panelSecurity` (`:226-250`, audit trail table), and `#panelCourseFileLibrary` (`:252-275`, institutional course file archive browser). Includes `@include('partials.fullscreen_btn')` (`:202`) and `@include('partials.birthday_wish_modal')` (`:375`).
- **`admin_show_users_table.blade.php` (`:1-194`)**:
  - Top navigation & print header (`:20-44`), instant client-side search & role filter bar (`:45-58`), **Staff Profiles Table** (`:59-110`, showing role, branch, login ID, status, and hashed/reset status), and **Student Profiles Table** (`:112-190`, showing registration number, roll number, batch, branch, semester, and status).
- **`principal_today_timetable.blade.php` (`:1-432`)**:
  - Top navigation bar (`:62-77`), Target Date Picker (`:80-85`), Active Day Order Badge (`:86-91`), Sync button (`:92-99`), 4 KPI summary cards (`:104-153`: *Total Scheduled Slots* `:106`, *Conducted Sessions* `:118`, *Overall Student Attendance* `:130`, *Target Departments* `:142`), Branch filter tabs (`:155-180`: `ALL`, `CT`, `EL`, `ME`, `CE`, `EEE`, `AU` via `filterBranch()`), and the Period 1–6 Live Timetable & Conduction Grid (`:193-425`) fetched from `GET /api/principal/today-timetable` (`PrincipalDashboardController@getTodayTimetableData`).

---

### 4.2.2 Chairman Dashboard (`resources/views/chairman_dashboard.blade.php`)
- **View & Route**: `resources/views/chairman_dashboard.blade.php:1-3056`, served by `GET /dashboard/chairman` (`routes/web.php:316-320`).
- **Sidebar / Navigation Menu Items (`resources/views/chairman_dashboard.blade.php:160-210`)**:
  - `Executive Overview` (`#navDashboard`, `onclick="switchPanel('dashboard')"`, `:191-193`)
  - `Personnel Directory` (`#navDirectory`, `onclick="switchPanel('directory')"`, `:194-196`)
  - `Audit Trail Log` (`#navAudit`, `onclick="switchPanel('audit')"`, `:197-199`)
  - `My Profile & Security` (`onclick="openExecutiveProfileModal()"`, `:200-202`)
  - `Sign Out` (`href="/logout"`, `:204-209`)
- **Panels, Widgets/Cards & Data Shown**:
  1. **Panel 1 — Executive Overview (`#panelDashboard`, `:248-738`)**:
     - **5 Executive KPI Cards (`:255-322`)**: *Staff In Campus* (`onclick="openStaffCampusModal()"`, `:262`), *Students In Campus* (`onclick="openStudentCampusModal()"`, `:272`), *Pending Approvals* (`onclick="openPendingApprovalsModal()"`, `:282`), *Today's Events* (`onclick="openTodayEventsModal()"`, `:302`), and *Department Timetables* (`onclick="openDepartmentTimetables()"`, `:312`).
     - **Broadcast & Event Widgets (`:550-625`)**: Flash Notice creation (`onclick="openFlashNoticeModal()"`, `:563`) & history (`:566`), and Institutional Event scheduler (`onclick="openPrincipalScheduleEventModal()"`, `:602`) & history (`:605`).
     - **Departmental Academic & Attendance Summary Grid (`:628-737`)**: Read/drill-down cards across Aided and Self-Financing branches.
  2. **Panel 2 — Personnel Directory (`#panelDirectory`, `:740-837`)**:
     - Staff and student directory with branch/role filters and account management actions (`:745-835`).
  3. **Panel 3 — Audit Trail Log (`#panelAudit`, `:839-874`)**:
     - Chronological security audit table (`:845-872`).
- **Modals & Partials (`resources/views/chairman_dashboard.blade.php:876-3055`)**:
  - `#editStaffModal` (`:876`), `#passwordModal` (`:940`), `#auditModal` (`:969`), `#registerModal` (`:1007`), `#flashNoticeModal` (`:1931`), `#flashNoticeHistoryModal` (`:2056`), `#principalScheduleEventModal` (`:2089`), `#principalScheduleEventHistoryModal` (`:2253`), `#executiveProfileModal` (`:2287`), `#pendingApprovalsModal` (`:2819`), `#staffCampusModal` (`:2867`), `#studentCampusModal` (`:2926`), `#todayEventsModal` (`:2974`), plus `@include('partials.fullscreen_btn')` (`:228`) and `@include('partials.birthday_wish_modal')` (`:3054`).

---

### 4.2.3 Academic Coordinator Dashboard (`resources/views/academic_coordinator_dashboard.blade.php`)
- **View & Route**: `resources/views/academic_coordinator_dashboard.blade.php:1-1397`, served by `GET /dashboard/academic-coordinator` (`routes/web.php:375-383`).
- **Responsive Dual Layout**:
  1. **Mobile Layout (`< 768px`, `resources/views/academic_coordinator_dashboard.blade.php:185-398`)**:
     - Mobile Header (`:191-206`), Coordinator Identity Card (`:210-246`), Global Alert Banner (`:247-249`), and Bottom Mobile Tab Bar (`:375-397`) switching between 4 mobile tabs:
       - **Tab 1: Pending Approvals (`:250-269`)**: Stage-2 Self-Financing (SF) staff leave clearance queue (`Computer`, `Automobile`, `EEE`, `General SF`).
       - **Tab 2: SF Staff Directory (`:270-304`)**: Searchable SF faculty roster with live leave balances.
       - **Tab 3: Staff Leave Master Ledger & Reports (`:305-360`)**: Category summary totals pill card (`:343`) and filterable leave ledger.
       - **Tab 4: Security Log (`:361-374`)**: Coordinator profile and security audit log.
  2. **Desktop Layout (`>= 768px`, `resources/views/academic_coordinator_dashboard.blade.php:400-789`)**:
     - **Sidebar Navigation (`:404-472`)**:
       - `Overview & Clearances` (`#navDashboard`, `onclick="switchPanel('dashboard')"`, `:437-440`)
       - `SF Staff Directory` (`#navDirectory`, `onclick="switchPanel('directory')"`, `:441-444`)
       - `Leave Master Ledger & Reports` (`#navReports`, `onclick="switchPanel('reports')"`, `:445-448`)
       - `My Teaching Batches / Virtual Classroom` link (`href="/dashboard/lecturer"`, `:449-452`)
       - `My Profile & Security` (`#navSecurity`, `onclick="switchPanel('security')"`, `:453-456`)
       - `Remote Support Assist` (`onclick="openStaffSupportModal()"`, `:465`)
     - **Desktop Panels**:
       - `#panelDashboard` (`:510-625`): Executive Stats Strip (*Pending Clearances* `:514`, *Supervised Branches* `:533`, *3-Tier Workflow Status* `:551`, *Quick Actions* `:570`) and Pending Leave Applications Table (`:588-624`) with one-click Approve (forwards to Principal) or Reject (`onclick="openRejectModal()"`).
       - `#panelDirectory` (`:627-671`): SF Staff Directory table with branch filter (`CT`, `AU`, `EEE`, `GEN_SF`).
       - `#panelReports` (`:673-780`): Staff Leave Master Ledger with date/branch/leave-type filters (`:688`), category summary cards (`:724`), and printable ledger table (`:756`).
       - `#panelSecurity` (`:782-789`): Embeds `@include('partials.staff_profile_panel')` (`:783`).
- **Modals & Partials**: `#rejectModal` (`:791-815`, rejection remarks dialog), `@include('partials.fullscreen_btn')` (`:494`), `@include('partials.support_desk_overlay')` (`:1394`), and `@include('partials.birthday_wish_modal')` (`:1395`).

---

### 4.2.4 General Department Coordinator Dashboards (Aided & Self-Financing)
- **Views & Routes**:
  - `resources/views/general_coordinator_aided_dashboard.blade.php:1-692`, served by `GET /dashboard/general-coordinator-aided` (`routes/web.php:357-364`).
  - `resources/views/general_coordinator_sf_dashboard.blade.php:1-700`, served by `GET /dashboard/general-coordinator-sf` (`routes/web.php:366-373`).
- **Sidebar / Navigation Menu Items (`aided:221-329`, `sf:229-337`)**:
  - `Overview & My Batches` (`#navDashboard`, `onclick="switchPanel('dashboard')"`, `aided:245`, `sf:253`)
  - `General Dept Staff Directory` (`#navDirectory`, `onclick="switchPanel('directory')"`, `aided:253`, `sf:261`)
  - Quick links to `HOD Mobile Approvals / Leave Desk` (`href="/hod/mobile"`), `Lecturer Virtual Classrooms` (`href="/dashboard/lecturer"`), and `Staff Mobile App` (`href="/staff/mobile"`, `aided:257-307`, `sf:265-315`)
  - `My Profile & Security` (`#navSecurity`, `onclick="switchPanel('security')"`, `aided:309`, `sf:317`)
  - `Remote Support Assist` (`onclick="openStaffSupportModal()"`, `aided:321`, `sf:329`)
- **Panels & Widgets (`aided:347-425`, `sf:355-433`)**:
  - **Panel 1 — Overview & My Batches (`#panelDashboard`, `aided:351-375`, `sf:359-383`)**: Displays first-year General Department KPI cards and the interactive Batch Grid (`aided:369`, `sf:377`) for S1/S2 Science, Mathematics, English, Engineering Graphics, and Workshop subjects.
  - **Panel 2 — Directory (`#panelDirectory`, `aided:377-414`, `sf:385-422`)**: Stream-scoped (`Aided` vs. `Self-Financing`) General Department faculty and student directory with search and filter controls (`aided:378-409`, `sf:386-417`).
  - **Panel 3 — My Profile (`#panelSecurity`, `aided:416-423`, `sf:424-431`)**: Embeds `@include('partials.staff_profile_panel')` (`aided:417`, `sf:425`).
- **Partials**: `@include('partials.fullscreen_btn')` (`aided:338`, `sf:346`), `@include('partials.support_desk_overlay')` (`aided:689`, `sf:697`), `@include('partials.birthday_wish_modal')` (`aided:690`, `sf:698`).

---

### 4.2.5 HOD Dashboards & Departmental Audit Consoles
- **Views & Controllers**:
  1. `resources/views/hod_dashboard.blade.php:1-5454`: Main Desktop HOD Console served by `GET /dashboard/hod` (`routes/web.php:322-330`, `DataController`, `R26DataController`).
  2. `resources/views/hod_mobile_dashboard.blade.php:1-1475`: Mobile HOD Command Center served by `GET /hod/mobile` (`HodMobileController@index` at `app/Http/Controllers/HodMobileController.php:64-245`, `routes/web.php:332-334`).
  3. `resources/views/hod_report_centre.blade.php:1-630`: Departmental Statutory Report & Audit Hub served by `GET /hod/report-centre` (`routes/web.php:1828-1836`).
  4. `resources/views/hod_workload_panel.blade.php:1-265`: Faculty Workload & Master Timetable Printer served by `GET /hod/workload` (`routes/web.php:1838-1846`).
  5. `resources/views/hod_academic_calendar.blade.php:1-225`: Semester Academic Calendar Builder & PDF Parser served by `GET /hod/academic-calendar` (`AcademicCalendarController@index` at `app/Http/Controllers/AcademicCalendarController.php:15-190`, `routes/web.php:338-341`).
  6. `resources/views/hod_sbte_audit.blade.php:1-466`: SBTE Kerala Compliance Audit Console served by `GET /hod/sbte-audit` (`routes/web.php:1848-1856`).
  7. `resources/views/hod_nba_audit.blade.php:1-233`: NBA Criteria Audit Console served by `GET /hod/nba-audit` (`routes/web.php:1858-1866`).
  8. `resources/views/hod/program_attainment_dashboard.blade.php:1-258`: NBA Criterion 3 PO/PSO Program Attainment Engine served by `GET /hod/program-attainment/{batchId}` (`ProgramAttainmentController@index` at `app/Http/Controllers/ProgramAttainmentController.php:16-240`).

#### A. Main Desktop HOD Dashboard (`resources/views/hod_dashboard.blade.php:1-5454`)
- **Sidebar / Navigation Menu Items (`resources/views/hod_dashboard.blade.php:238-336`)**:
  - `Batch & Class Management` (`#navBatches`, `onclick="switchPanel('batches')"`, `:287-289`, default active)
  - `Department Directory` (`#navDirectory`, `onclick="switchPanel('directory')"`, `:284-286`)
  - `Curriculum Subject Allocation` (`#navSubjects`, `onclick="switchPanel('subjects')"`, `:290-292`)
  - `Security Audit Trail` (`#navAudit`, `onclick="switchPanel('audit')"`, `:293-295`)
  - `Consolidated CIA Mark Report` (`#navConsolidatedCia`, `onclick="switchPanel('consolidatedCia')"`, `:296-298`)
  - External Module Launchers (`:299-320`): Links to `HOD Report & Audit Centre` (`/hod/report-centre`), `Faculty Workload & Timetables` (`/hod/workload`), `Academic Calendar` (`/hod/academic-calendar`), `HOD Mobile Approvals` (`/hod/mobile`), and `My Teaching Classroom` (`/dashboard/lecturer`).
  - `My Profile & Security` (`#navProfile`, `onclick="switchPanel('profile')"`, `:321-323`)
  - `Remote Support Assist` (`onclick="openStaffSupportModal()"`, `:333`)
- **Panels & Widgets**:
  1. **Panel 1 — User Directory (`#panelDirectory`, `:373-470`)**: Branch-scoped staff and student directory with `Bulk Import Students` (`onclick="openBulkImportModal()"`, `:385`) and `Register User` (`onclick="openRegisterModal()"`, `:388`).
  2. **Panel 2 — Batch Management (`#panelBatches`, `:472-518`)**: Displays active diploma batches (R2021 & R2026) with `Create New Batch` (`onclick="openCreateBatchModal()"`, `:495`) and `Manage Batch` (`onclick="openBatchDetail(...)"`, `:2305`).
  3. **Panel 3 — Subject Allocation (`#panelSubjects`, `:520-571`)**: Semester-wise curriculum subject registry with `Add Curriculum Subject` (`onclick="openSubjectModal()"`, `:546`), `Edit Subject` (`onclick="openEditSubjectModal(...)"`, `:4100`), and `Assign Staff` (`onclick="openAssignStaffModal(...)"`, `:4101`).
  4. **Panel 4 — Audit Trail (`#panelAudit`, `:573-606`)**: Branch-scoped security and mark-modification audit log.
  5. **Panel 5 — Consolidated CIA Mark Report (`#panelConsolidatedCia`, `:608-704`)**: Full A4 landscape branch/batch consolidated internal marksheet with **HOD Lock/Unlock Controls** (`#btnHodLockCia` at `:628`, `#btnHodUnlockCia` at `:631` calling `toggleHodCiaLock('lock'|'unlock')`).
  6. **Panel 6 — My Profile (`#panelProfile`, `:706-712`)**: Embeds `@include('partials.staff_profile_panel')` (`:707`).
- **Modals in `hod_dashboard.blade.php`**:
  - `#createBatchModal` (`:714-800`): Create R2021/R2026 batch (`POST /api/hod/batches` or `POST /api/r26/hod/batches`).
  - `#batchDetailModal` (`:802-1043`): 5-tab Batch Command Modal (`:823-829`):
    - **Tab 1: `Tutor & Mentor` (`#tabBtn_tutorMentor`, `:825`, `:833-878`)**: Assign Class Tutor (`POST /api/hod/batches/assign-tutor`) and Batch Mentors (`POST /api/hod/batches/assign-mentor`).
    - **Tab 2: `Allocated Subjects` (`#tabBtn_subjects`, `:826`, `:879-916`)**: Filter by semester (`#modalSubjectSemester`, `:884`), add subject (`:893`), and assign teaching/lab staff (`:3870`).
    - **Tab 3: `Enrolled Students` (`#tabBtn_students`, `:827`, `:917-951`)**: Student roster with SBTE Reg No editor, credentials printout (`/hod/batches/{classroomId}/credentials/print`), and Mentoring Diary launcher (`onclick="openStudentDiary()"`, `:4030`).
    - **Tab 4: `Time Table` (`#tabBtn_timetable`, `:828`, `:952-1002`)**: Interactive 5-Day × 6-Period class timetable editor (`#btnEditTimetable`, `:963`).
    - **Tab 5: `Semester History` (`#tabBtn_semesterHistory`, `:829`, `:1003-1018`)**: Promote semester (`POST /api/hod/batches/{classroomId}/update-semester`), view historical semester snapshots (`GET /api/hod/batches/{classroomId}/semester/{semester}/snapshot`), or graduate batch (`PUT /api/hod/batches/{classroomId}/graduate`).
  - `#passwordModal` (`:1045`), `#auditModal` (`:1076`), `#registerModal` (`:1114`), `#subjectModal` (`:1237`), `#assignStaffModal` (`:1312`), `#bulkImportModal` (`:5409`), plus `@include('mentoring_diary_modal')` (`:5450`), `@include('partials.support_desk_overlay')` (`:5451`), and `@include('partials.birthday_wish_modal')` (`:5452`).

#### B. Mobile HOD Dashboard (`resources/views/hod_mobile_dashboard.blade.php:1-1475`)
- **Bottom Navigation Bar (`:1035-1068`) & 5 Mobile Tabs**:
  1. **Tab 1 — Overview & Dashboard (`#tab-overview`, `:210-595`, `#navBtn-overview` at `:1036`)**: Biometric punch status card (`:218`), Institutional Day Order changer (`onclick="openDayOrderModal()"`, `:423`), live department staff attendance breakdown, and today's class conduction progress.
  2. **Tab 2 — Approvals Hub (`#tab-approvals`, `:598-859`, `#navBtn-approvals` at `:1041`)**: Stage-1 HOD Staff Leave Approval Queue (`:661-664`), Coordinator Leave Approval Queue (`:794-797`), and Student Leave Escalations.
  3. **Tab 3 — My Batches / Faculty Mode (`#tab-mybatches`, `:862-907`, `#navBtn-mybatches` at `:1054`)**: Direct mobile shortcuts to the HOD's own teaching subjects and virtual classrooms.
  4. **Tab 4 — Dept Batches & Staff Roster (`#tab-deptbatches`, `:910-952`, `#navBtn-deptbatches` at `:1059`)**: Live status of all department batches and faculty members.
  5. **Tab 5 — Notices & Announcement Generator (`#tab-notices`, `:955-1033`, `#navBtn-notices` at `:1064`)**: Create and delete department notices (`POST /api/hod/notice/create`, `POST /api/hod/notice/delete`, `routes/web.php:333-334`).
- **Modals**: `#staffLeaveModal` (`:1071-1095`, approve/reject staff leave with remarks) and `#dayOrderModal` (`:1438-1470`).

#### C. HOD Report Centre & Companion Consoles (`hod_report_centre`, `hod_workload_panel`, `hod_academic_calendar`, `hod_sbte_audit`, `hod_nba_audit`, `hod/program_attainment_dashboard`)
- **`hod_report_centre.blade.php` (`:1-630`)**: 13-card statutory audit launcher grid:
  - Card 1: *Attendance & Log Analysis* (`:76-98`, `openAttendanceModal()`)
  - Card 2: *Remedial Session Analysis* (`:99-121`, `openRemedialModal()`)
  - Card 3: *Faculty Workload Report* (`:122-144`, links to `/hod/workload`)
  - Card 4: *Extra-Curricular Activity Points Claims* (`:145-167`, `openActivityPointsModal()`)
  - Card 5: *Department Course Files* (`:168-190`, `openCourseFilesModal()`)
  - Card 6: *Mentoring Diaries* (`:191-213`)
  - Card 7: *SBTE Audit Console* (`:214-236`, links to `/hod/sbte-audit`)
  - Card 8: *NBA Criteria Audit Console* (`:237-259`, links to `/hod/nba-audit`)
  - Card 8B: *Program Attainment (PO/PSO) Engine - NBA Criterion 3* (`:260-282`, `openProgramAttainmentModal()`, modal at `:586`)
  - Card 9: *Academic Calendar Preparation* (`:283-305`, links to `/hod/academic-calendar`)
  - Card 10: *Security & Operations Audit* (`:306-328`)
  - Card 11: *Staff Leave Master Ledger & Audit Reports* (`:329-351`)
  - Card 12: *Consolidated CIA Mark Report (SBTE Regulation)* (`:352-425`, `openConsolidatedCiaModal()`, `openCiaInHodConsole()`)
- **`hod_workload_panel.blade.php` (`:1-265`)**: Card 1: *Department Faculty Workload* (`:89-122`), Card 2: *Individual Batch Timetable Printer* (`:123-168`), Card 3: *Multi-Batch Consolidated Timetable Sheet* (`:169-260`).
- **`hod_academic_calendar.blade.php` (`:1-225`)**: Collapsible semester panels (`#panel_{{ $sem }}`, `:108`), AI/regex PDF calendar parser (`POST /api/academic-calendar/parse-pdf`), event editor (`POST /api/academic-calendar/save`), and official A4 printout (`GET /hod/academic-calendar/{id}/print`).
- **`hod_sbte_audit.blade.php` (`:1-466`) & `hod_nba_audit.blade.php` (`:1-233`)**: Subject-by-subject compliance checklists verifying syllabus upload, CO-PO mapping, lesson plan completion, series test QP blueprints, CIA locks, and survey completion.
- **`hod/program_attainment_dashboard.blade.php` (`:1-258`)**: Header panel (`:28`), **Table 3.1: Course-PO Articulation Matrix & Direct Attainment** (`:127-191`), and **Table 3.2: Indirect Survey Scores & Final Attainment Configuration (80% Direct + 20% Indirect)** (`:192-255`).

---

### 4.2.6 Lecturer Dashboard & All Subject Virtual Classrooms
- **Main Lecturer View**: `resources/views/lecturer_dashboard.blade.php:1-15013`, served by `GET /dashboard/lecturer` (`routes/web.php:385-399`, `ClassroomController`, `PracticalClassroomController`, `DataController`).
- **Sidebar / Navigation Menu Items (`resources/views/lecturer_dashboard.blade.php:920-1035`)**:
  - `My Batches & Subjects` (`#navDashboard`, `onclick="switchPanel('dashboard')"`, `:945-950`)
  - Dynamic Role Switcher Links (`:952-1010`): Conditionally renders links to `Tutor Console` (`/dashboard/tutor`), `HOD Console` (`/dashboard/hod`), `Course Files Hub` (`/course-files`), `Remedial Classrooms` (`/virtual-classroom/remedial`), `Online Tests` (`/lecturer/online-tests`), and `Staff Mobile App` (`/staff/mobile`).
  - `My Profile & Security` (`#navSecurity`, `onclick="switchPanel('security')"`, `:1013-1015`)
  - `Remote Support Assist` (`onclick="openStaffSupportModal()"`, `:1025`)
- **Panels & Embedded R2021 Virtual Classroom Workspace in `lecturer_dashboard.blade.php`**:
  1. **Panel 1 — Dashboard / Batch Cards (`#panelDashboard`, `:1067-1093`)**: Renders allocated subject cards across batches; clicking a card invokes `openClassroom(...)` (`:2333`), which either routes to a dedicated R2026/R2021 specialized classroom URL or opens the embedded `#panelClassroom` workspace.
  2. **Panel 2 — Embedded R2021 Theory/Practical/Seminar Virtual Classroom (`#panelClassroom`, `:1095-1804`)**:
     - **Card 1: Subject Header (`:1097-1141`)**, **Card 2: Academic Metadata Row (`:1142-1156`)**, and **Card 3: 10-Tab Horizontal Navigation Strip (`:1157-1190`)**:
       - `Course Structure & CO-PO` (`#tabStructure`, `toggleClassroomTab('structure')`, `:1160`)
       - `Lesson Planner` (`#tabPlanner`, `toggleClassroomTab('planner')`, `:1163`)
       - `Formative Assessment / Assignments` (`#tabAssessment`, `toggleClassroomTab('assessment')`, `:1166`)
       - `Summative Series Tests` (`#tabSummative`, `toggleClassroomTab('summative')`, `:1169`)
       - `Seminar Evaluation` (`#tabSeminar`, `toggleClassroomTab('seminar_evaluation')`, `:1172`)
       - `Lab Evaluation` (`#tabLab`, `toggleClassroomTab('lab_evaluation')`, `:1175`, with toolbar buttons for Class Attendance Log `:1654`, Continuous Lab Work Grading `#btnToolbarLwGrade` `:1657`, Open-Ended Project `:1660`, Lab Batch Setup `:1672`, Manage Experiments `:1675`, Completed Experiments `:1689`, and Direct 37.5M Override `#btnDashboardDirectLw` `:1732`)
       - `Course Surveys` (`#tabSurvey`, `toggleClassroomTab('survey')`, `:1178`)
       - `Course Attainment (NBA)` (`#tabCourseAttainment`, `toggleClassroomTab('course_attainment')`, `:1181`, with `openEseMarksModal()` at `:1540`)
       - `CIA Calculation Register` (`#tabCiaCalculation`, `toggleClassroomTab('cia_calculation')`, `:1184`, with `openCiaRegisterPrint()` at `:1570`)
       - `Statutory Reports Hub` (`#tabReports`, `toggleClassroomTab('reports')`, `:1187`, containing 3 report cards at `:1342-1445`: *Card 1: Surveys & Attainment* [Course Exit, Mid-Sem, NBA Attainment], *Card 2: Curriculum & Planning* [Lesson Plan, Course File, Assignment QP], and *Card 3: Marks & Evaluations* [CIE Marksheet, Series Marks, Class Roster, Final Results, Class Log]).
  3. **Panel 3 — Security & Profile (`#panelSecurity`, `:1806-1809`)**: Embeds `@include('partials.staff_profile_panel')` (`:1807`).
  4. **Panel 4 — Mobile Seminar Evaluation Workspace (`#panelMobileSeminar`, `:1812-1910`)**: Step 1 Pending Invitations (`:1835`) & Step 2 Student Evaluation Form (`:1864`).
- **Modals in `lecturer_dashboard.blade.php` (`:10009-15011`)**:
  - `#editQuestionsModal` (`:10009`), `#vcStudentsModal` (`:10048`), `#seminarEvaluationModal` (`:10071`), `#modalEseMarks` (`:14042`), `#dashboardDirectLwConfirmModal` (`:14202`), `#labworkGradeModal` (`:14243`), `#openEndedGradeModal` (`:14386`), `#studentLabModal` (`:14456` with sub-tabs `#labModalTab_exp` `:14482`, `#labModalTab_test` `:14516`, `#labModalTab_project` `:14569`, `#labModalTab_board` `:14606`), `#manageExperimentsModal` (`:14640`), `#completedExperimentsModal` (`:14716`), `#editExpDateModal` (`:14842`), `#manageTestsModal` (`:14925`), `#generatePlannerModal` (`:14981`), plus `@include('partials.support_desk_overlay')` (`:15009`), `@include('partials.birthday_wish_modal')` (`:15010`), and `@include('partials.lab_batch_setup_modal')` (`:15011`).

#### Specialized Virtual Classroom Views (R2026 & R2021)
1. **R2026 Theory Virtual Classroom (`resources/views/r26/virtual_classroom_theory.blade.php:1-5850`, `R26ClassroomController`)**:
   - **8 Tabs (`:442-473`)**: `Course Outline` (`#btn-outline` `:442`, `#tab-outline` `:487`), `Lesson Planner` (`#btn-planner` `:446`, `#tab-planner` `:947`), `Continuous Internal Assessment (CIA)` (`#btn-cia` `:450`, `#tab-cia` `:1064`), `Series Exams` (`#btn-series` `:454`, `#tab-series` `:1479`), `Self-Learning (SLA)` (`#btn-selflearning` `:458`, `#tab-selflearning` `:1298`), `Course Attainment & Surveys` (`#btn-attainment` `:462`, `#tab-attainment` `:1771`), `Study Materials / Pre-Class Hub` (`#btn-materials` `:466`, `#tab-materials` `:2139` embedding `@include('partials.virtual_learning_hub_tab', ['roomType' => 'Theory'])`), and `Reports & Consolidated Marks Register` (`#btn-reports` `:470`, `#tab-reports` `:2144` with 4 cards: *CIA Reports 40M* `:2165`, *Series Exam Reports 20M* `:2212`, *Final Results 100M* `:2249`, *Course File Documents R2026* `:2286`).
   - **Modals & Partials**: `#modal-student-roster` (`:1426`), `#modal-midsem-survey-init` (`:2010`), `#modal-exit-survey-init` (`:2071`), LaTeX/image Question Editor modal (`:4463-4585`), and `@include('partials.carmie_assistant')` (`:5846`).
2. **R2026 Practical Virtual Classroom (`resources/views/r26_practical/virtual_classroom_practical.blade.php:1-3032`, `R26VirtualClassroomPracticalController`)**:
   - **8 Tabs (`:353-399`)**: `Course Outline` (`#tab-content-outline`, `:407`), `Lesson Planner` (`#tab-content-lesson_plan`, `:705`), `Continuous Evaluation (CE)` (`#tab-content-ce`, `:841`), `Series Test` (`#tab-content-series_test`, `:1059`), `CIA Register` (`#tab-content-cia_register`, `:1230`), `Attainment Table` (`#tab-content-attainment`, `:1367`), `Reports` (`#tab-content-reports`, `:1459`), and `Pre-Class Hub` (`#tab-content-preclass_hub`, `:1596`). Includes Interactive Slider Grading Modal (`:1609-1630`) and `@include('partials.carmie_assistant')` (`:3029`).
3. **R2026 Practicum Virtual Classrooms (`resources/views/r26_practicum/virtual_classroom_practicum.blade.php:1-3667` & `virtual_classroom_basic_science_practicum.blade.php:1-8540`, `R26VirtualClassroomPracticumController`)**:
   - **12 Tabs (`virtual_classroom_practicum.blade.php:621-688`)**:
     - Tab 1: `Modules & Course Outcomes (Outline)` (`#tab-outline`, `:691`)
     - Tab 2: `Unified Lesson Planner (90 Contact Hours)` (`#tab-planner`, `:890`)
     - Tab 3: `Self Learning Activities (Max 5 CIA)` (`#tab-sl`, `:1028`)
     - Tab 4: `Theory Series Exams (Series 1 & 2, Max 10 CIA)` (`#tab-theoryseries`, `:1139`)
     - Tab 5: `Lab Series Exams (Series 1 & 2, Max 10 CIA)` (`#tab-labseries`, `:1266`)
     - Tab 6: `Continuous Practical Evaluation (Max 10 CIA)` (`#tab-continuouseval`, `:1384`)
     - Tab 7: `Lab Sessions & Experiment Roster` (`#tab-sessions`, `:1463`)
     - Tab 8: `Consolidated CIE Register (40M)` (`#tab-cie`, `:1574`)
     - Tab 9: `End Semester Evaluation (ESE)` (`#tab-ese`, `:1715`)
     - Tab 10: `Attainment & Surveys` (`#tab-attainment`, `:1859`)
     - Tab 11: `Reports & Consolidated Marks Register` (`#tab-reports`, `:1978`)
     - Tab 12: `Pre-Class Hub & Study Materials` (`#tab-materials`, `:2227`)
   - **`virtual_classroom_basic_science_practicum.blade.php` (`:1-8540`)**: Dual-subject Physics & Chemistry integrated practicum workspace with split Section A (Physics) / Section B (Chemistry) tabs, AI & Manual QP blueprint modals (`:1214-1300`, `:2522-2526`), Theory & Lab Series mark entry modals (`:1349`, `:2482`), and survey initiation modals (`:8416`, `:8477`).
4. **R2026 Engineering Drawing Virtual Classroom (`resources/views/r26_drawing/virtual_classroom_drawing.blade.php:1-1980`, `R26VirtualClassroomDrawingController`)**:
   - **7 Tabs (`:300-340`)**: `Course Outline` (`#tab-content-outline`, `:347`), `Lesson Plan` (`#tab-content-lessonplan`, `:454`), `CIA Register` (`#tab-content-cia`, `:558`), `Series Test` (`#tab-content-series`, `:868`), `Attainment Calculator` (`#tab-content-attainment`, `:1050`), `Reports` (`#tab-content-reports`, `:1158`), and `Study Material & Preclass Hub` (`#tab-content-materials`, `:1255`).
5. **R2026 Communication Skills in English Virtual Classroom (`resources/views/r26_english/virtual_classroom_english.blade.php:1-2180`, `R26VirtualClassroomEnglishController`)**:
   - **9 Tabs (`:329-382`)**: `Course Outline` (`#tab-content-outline`, `:390`), `Lesson Planner` (`#tab-content-lessonplan`, `:622`), `Self Learning (CA1: 5M)` (`#tab-content-selflearning`, `:748`), `Continuous Evaluation (CE: 10M)` (`#tab-content-ce`, `:818`), `Practical Test (CA2 & CA3: 10M)` (`#tab-content-practicaltest`, `:879`), `Series Test (CA4 & CA5: 10M)` (`#tab-content-seriestest`, `:986`), `Consolidated CIA Register (40M + 60M ESE)` (`#tab-content-cia`, `:1093`), `Attainment & Surveys` (`#tab-content-attainment`, `:1302`), and `Reports` (`#tab-content-reports`, `:1632`). Includes TEAMS Attendance PDF Sync modal (`openTeamsAttendanceModal()`, `:296`).
6. **R2026 Health & Physical Education Virtual Classroom (`resources/views/r26_health_physical/virtual_classroom_health_physical.blade.php:1-920`, `R26VirtualClassroomHealthPhysicalController`)**:
   - **7 Tabs (`:142-165`)**: `Overview & Dynamic Rubric Titles` (`#tab-overview`, `:168`), `CO-PO Matrix` (`#tab-copo`, `:276`), `30-Hour Plan` (`#tab-lesson`, `:308`), `Continuous Fitness & Activity Log` (`#tab-activity`, `:369`), `Physical Fitness Tests CA1 & CA2` (`#tab-fitness`, `:523`), `Consolidated CIE & ESE Summary` (`#tab-summary`, `:582`), and `Surveys & Indirect Attainment` (`#tab-surveys`, `:640`).
7. **R2021 Practical Virtual Classroom (`resources/views/virtual_classroom_practical.blade.php:1-3115`, `PracticalClassroomController`)**:
   - **4 Tabs (`:230-248`)**: `Table 2.2: Continuous Lab Work Evaluation (37.5M)` (`#tab-table22`, `:277`), `Table 2.3: Open-Ended Experiment / Micro-Project (7.5M)` (`#tab-table23`, `:371`), `Table 3.1: Practical Series Examination (15M)` (`#tab-table31`, `:439`), and `Consolidated CIA Summary (75M)` (`#tab-summary`, `:515`).
8. **R2021 Drawing Virtual Classroom (`resources/views/r21_drawing/virtual_classroom_drawing.blade.php:1-2420`, `R21VirtualClassroomDrawingController`)**:
   - **6 Tabs (`:1152-1192`)**: `Consolidated CIA Register` (`#tab-cia`, `:1201`), `Sheet Mark Entry` (`#tab-sheets`, `:1336`), `Series Mark Entry (15M)` (`#tab-series`, `:1530`), `Attendance Register (15M)` (`#tab-attendance`, `:1616`), `Lesson Planner (60 Hours)` (`#tab-lessonplan`, `:1705`), and `Reports & Downloads` (`#tab-reports`, `:1801`). Modals: `#modalManageSheets` (`:1964`), `#modalUploadSyllabus` (`:1995`).
9. **R2021 Workshop Virtual Classroom (`resources/views/r21_workshop/virtual_classroom_workshop.blade.php:1-2150`, `R21VirtualClassroomWorkshopController`)**:
   - **8 Tabs (`:549-602`)**: `CIA Register` (`#tab-cia`, `:612`), `Work Status Matrix` (`#tab-matrix`, `:795`), `Continuous Work Evaluation (37.5M)` (`#tab-work`, `:1133`), `Rough & Fair Record (7.5M)` (`#tab-record`, `:1197`), `Trade Tests (15M)` (`#tab-test`, `:1261`), `Attendance Register (15M)` (`#tab-attendance`, `:1333`), `Attainment Calculation` (`#tab-attainment`, `:1398`), and `Official Statutory Reports Hub` (`#tab-reports`, `:1534`). Modals: `#modalUploadSyllabus` (`:1651`), `#modalBatchSetup` (`:1683`), `#modalAttainmentSettings` (`:1830`).
10. **R2021 Major Project Virtual Classroom (`resources/views/r21_project/virtual_classroom_project.blade.php:1-1980`, `R21VirtualClassroomMajorProjectController`)**:
    - **7 Tabs (`:277-305`)**: `Consolidated Marksheet` (`#tab-register`, `:312`), `Continuous Internal Assessment (CIA 75M)` (`#tab-cia`, `:431`), `End Semester Evaluation (ESE 50M)` (`#tab-ese`, `:627`), `Reports & Statements` (`#tab-reports`, `:879`), `Project Groups & Batches` (`#tab-groups`, `:1196`), `Attainment Analysis` (`#tab-attainment`, `:1267`), and `SBTE Kerala Guidelines` (`#tab-rubrics`, `:1355`).
11. **R2021 Seminar Virtual Classroom (`resources/views/r21_seminar/virtual_classroom_seminar.blade.php:1-3250`, `R21VirtualClassroomSeminarController`)**:
    - **5 Tabs (`:361-380`)**: `Seminar Continuous Assessment (75M)` (`#tabContent-evaluation`, `:390`), `Seminar Presentation Schedule & Log` (`#tabContent-schedule`, `:664`), `Consolidated CIA & SBTE Grades` (`#tabContent-grades`, `:795`), `Statutory Reports & Print Hub` (`#tabContent-reports`, `:946`), and `Course Exit Survey & Attainment` (`#tabContent-survey`, `:1067`).
12. **Remedial Classroom Hub (`resources/views/remedial_dashboard.blade.php:1-1076`, `RemedialController`) & Course Files Hub (`resources/views/course_files_dashboard.blade.php:1-895`, `CourseFileController`)**:
    - `remedial_dashboard.blade.php`: 2 tabs (`Active Rooms` `#panel_roomsList` at `:75`, `Create New Room` `#panel_createRoom` at `:82`) and Remedial Room Management Modal (`:140-310`) for student enrollment, attendance logs, and remedial test gradebooks.
    - `course_files_dashboard.blade.php`: 5 sidebar tabs (`Section A: Planning` `#tabBtnA` `:138`, `Section B: Materials` `#tabBtnB` `:139`, `Section C: Assessments` `#tabBtnC` `:140`, `Section D: Attainment` `#tabBtnD` `:141`, and `Master Checklist` `#tabBtnChecklist` `:142`) managing all 18 NBA/SBTE statutory course file documents.

---

### 4.2.7 Tutor Dashboard (`resources/views/tutor_dashboard.blade.php`)
- **View & Controllers**: `resources/views/tutor_dashboard.blade.php:1-4494`, served by `GET /dashboard/tutor` (`routes/web.php:444-454`, `DataController`, `TutorSpecialAttendanceController` at `app/Http/Controllers/TutorSpecialAttendanceController.php:15-340`, `MentoringController` at `app/Http/Controllers/MentoringController.php:15-1430`).
- **Sidebar / Navigation Menu Items (`resources/views/tutor_dashboard.blade.php:216-310`)**:
  - `Supervised Class Roster` (`#navRoster`, `onclick="switchPanel('roster')"`, `:245-247`, default active)
  - `Student Roll Numbers` (`#navRollNumbers`, `onclick="switchPanel('rollNumbers')"`, `:248-251`)
  - `Semester Attendance Report (Clause 10 / Rule 7)` (`#navAttendanceReport`, `onclick="switchPanel('attendanceReport')"`, `:252-254`)
  - `Student Progress Report (REV2021)` (`#navProgressReport`, `onclick="switchPanel('progressReport')"`, `:255-257`)
  - `Consolidated CIA Mark Report` (`#navConsolidatedCia`, `onclick="switchPanel('consolidatedCia')"`, `:258-261`)
  - `Mentoring Batches & Sub-Groups` (`#navMentoring`, `onclick="switchPanel('mentoring')"`, `:262-264`)
  - `Student Leave Approvals & Reports` (`#navLeaveApproval`, `onclick="switchPanel('leaveApproval')"`, `:265-267`)
  - `Activity Points Verification` (`#navActivity`, `onclick="switchPanel('activity')"`, `:268-270`)
  - `Security Audit Log` (`onclick="switchPanel('audit')"`, `:271-275`)
  - `My Profile & Security` (`onclick="switchPanel('profile')"`, `:276-280`)
  - Quick role switcher links (`:281-292`) to `Lecturer Virtual Classroom` (`/dashboard/lecturer`) and `Staff Mobile App` (`/staff/mobile`)
  - `Remote Support Assist` (`onclick="openStaffSupportModal()"`, `:302`)
- **Panels, Widgets/Cards & Data Shown (`resources/views/tutor_dashboard.blade.php:333-1125`)**:
  1. **Panel 1 — Supervised Class Roster (`#panelRoster`, `:340-442`)**:
     - Collapsible Batch Roster Header (`onclick="toggleRoster()"`, `:343`), `Bulk Import Students` button (`onclick="openBulkImportModal()"`, `:409`), and full student table showing Roll No, Reg No, SBTE Reg No, Student Name, Mobile, Parent Contact, Mentoring Group, and per-student actions (edit profile, reset password, open Mentoring Diary modal, view Backlog Report `#backlogReportModal`).
  2. **Panel 2 — Student Roll Numbers (`#panelRollNumbers`, `:444-479`)**:
     - Alphabetical auto-numbering and manual roll number assignment grid (`POST /api/tutor/classroom/{classroomId}/roll-numbers`).
  3. **Panel 3 — Consolidated Semester Attendance (`#panelAttendanceReport`, `:481-683`)**:
     - **Table 1: Subject-wise & Consolidated Attendance Matrix** (`:485-618`) computing total conducted hours, present hours, duty/medical leave credits, and net attendance percentage against the 75% SBTE threshold.
     - **Table 2: TEAMS Official Tutor Log & Special Attendance Override (`:619-682`)**: Launches `#specialAttendanceModal` (`onclick="openSpecialAttendanceModal(null, 'upload')"`, `:495`, `:620`) handled by `TutorSpecialAttendanceController`.
  4. **Panel 4 — Student Progress Report (`#panelProgressReport`, `:685-768`)**:
     - Batch-wide and individual student academic progress report generator (Series 1, Series 2, Assignments, CIA, Attendance, and Arrears/Backlogs) with printable A4 progress cards.
  5. **Panel 5 — Consolidated CIA Mark Report (`#panelConsolidatedCia`, `:770-850`)**:
     - A4 Landscape multi-subject CIA marksheet for the supervised batch with Tutor verification status and print export (`:836`).
  6. **Panel 6 — Security Audit Trail (`#panelAudit`, `:852-885`)**:
     - Class-level audit log table.
  7. **Panel 7 — My Profile (`#panelProfile`, `:887-890`)**:
     - Embeds `@include('partials.staff_profile_panel')` (`:888`).
  8. **Panel 8 — Mentoring Batches (`#panelMentoring`, `:892-1012`)**:
     - Sub-batch mentor allocation console (`onclick="toggleBatchAssignment()"`, `:917`) allowing the Tutor to divide the class roster among faculty Mentors and inspect each mentee's diary.
  9. **Panel 9 — Activity Points Verification (`#panelActivity`, `:1014-1051`)**:
     - Student extra-curricular/AICTE activity point claims review table (`onclick="toggleActivity()"`, `:1017`) with certificate preview and Approve/Reject actions.
  10. **Panel 10 — Student Leave Approval & Reports (`#panelLeaveApproval`, `:1053-1124`)**:
      - Pending student leave/medical/duty leave applications queue and historical leave register.
- **Modals & Partials (`resources/views/tutor_dashboard.blade.php:1126-4493`)**:
  - `@include('mentoring_diary_modal')` (`:1126`)
  - `#backlogReportModal` (`:1129-1180`): Semester-wise student backlog/arrear tracker.
  - `#passwordModal` (`:1182-1209`), `#auditModal` (`:1211-1248`).
  - `#specialAttendanceModal` (`:4367-4448`): 2-tab modal (`#modalBtnTabUpload` `:4386` -> `#modalTabUploadTeams` `:4395` for uploading TEAMS Tutor Log PDFs; `#modalBtnTabRecords` `:4389` -> `#modalTabRecordsList` `:4421` for managing active special/duty attendance records).
  - `#bulkImportModal` (`:4450-4489`), `@include('partials.support_desk_overlay')` (`:4491`), `@include('partials.birthday_wish_modal')` (`:4492`).

---

### 4.2.8 Mentoring Views & `MentoringController` (`mentor_dashboard` Architecture)
- **Architectural Fact**: There is **no standalone `resources/views/mentor_dashboard.blade.php` file** in `resources/views/`. Instead, faculty Mentors access mentoring workflows through four dedicated Blade views managed by `MentoringController` (`app/Http/Controllers/MentoringController.php:15-1430`):
  1. **`resources/views/mentoring_diary_modal.blade.php:1-519`** (Embedded in `hod_dashboard.blade.php:5450` and `tutor_dashboard.blade.php:1126`):
     - **7 Sidebar Tabs (`:38-73`)**:
       - Tab 1: `Personal & Family Profile` (`#tab-profile`, `:75-128`)
       - Tab 2: `Prior Education` (`#tab-education`, `:130-194`)
       - Tab 3: `Academic Progress` (`#tab-academic`, `:196-211`) & `Board Exams` (`#tab-board`, `:213-262`)
       - Tab 4: `Extra-Curricular` (`#tab-extracurricular`, `:264-316`, `openActivityModal()` at `:270`)
       - Tab 5: `Mentor Meetings` (`#tab-meetings`, `:318-375`, `toggleDiaryAddForm()` at `:324`)
       - Tab 6: `Leave Record` (`#tab-leaves`, `:377-429`, `openLeaveModal()` at `:383`)
       - Tab 7: `Disciplinary` (`#tab-discipline`, `:431-518`, `openDiscModal()` at `:437`)
  2. **`resources/views/tutor_student_diary_full.blade.php:1-1565`** (Served by `GET /tutor/mentoring-diary/{regNo}` at `routes/web.php:279` -> `MentoringController@tutorViewFullDiary`):
     - Full-page 9-tab Mentoring Diary (`:245-272`): `Profile` (`#tabBtn_smdProfile`, `:245`), `Family` (`#tabBtn_smdFamily`, `:248`), `Education` (`#tabBtn_smdEducation`, `:251`), `Academic` (`#tabBtn_smdAcademic`, `:254`), `Board Exams` (`#tabBtn_smdBoard`, `:257`), `Extra-Curricular` (`#tabBtn_smdExtra`, `:260`, `openStudentActivityModal()` at `:494`), `Leave` (`#tabBtn_smdLeave`, `:263`), `Disciplinary` (`#tabBtn_smdDiscipline`, `:266`, `openDiscModal()` at `:574`), and `Meetings` (`#tabBtn_smdMeetings`, `:269`, `openSessionModal()` at `:602`). Includes `@include('student_mentoring_scripts')` (`:1564`).
  3. **`resources/views/student_mentoring_panel.blade.php:1-315` & `resources/views/student_mentoring_diary_full.blade.php:1-1534`**:
     - Student-facing 8-tab Mentoring Diary (`#tabBtn_smdProfile` through `#tabBtn_smdMeetings`, `student_mentoring_panel.blade.php:52-75`, `student_mentoring_diary_full.blade.php:275-298`; omits the staff-only Disciplinary creation button) served inside `student_dashboard.blade.php:841` and standalone via `GET /student/mentoring-diary` (`routes/web.php:274-278`).
  4. **Mobile Mentoring Tab (`#tab-mentoring` in `resources/views/staff_mobile_dashboard.blade.php:1314-1386`)**:
     - Served by `MentoringController@showStaffMobileDashboard` (`GET /staff/mobile`, `routes/web.php:439`), providing mobile mentee cards, counseling session logging, and mentee leave approvals.

---

### 4.2.9 Demonstrator, Trade Instructor, Tradesman, Workshop Superintendent & Physical Instructor Dashboards
- **View Existence & Routing Summary**:
  - `resources/views/demonstrator_dashboard.blade.php:1-606` (**Exists** — served by `GET /dashboard/demonstrator` at `routes/web.php:401-428`).
  - `resources/views/trade_instructor_dashboard.blade.php:1-412` (**Exists** — served by `GET /dashboard/tradeinstructor` at `routes/web.php:430-437`).
  - `resources/views/workshop_superintendent_dashboard.blade.php:1-1085` (**Exists** — served by `GET /dashboard/workshop` at `routes/web.php:456-463`).
  - `tradesman_dashboard.blade.php` (**Does NOT exist as a separate file** — `Tradesman` role is routed by `/dashboard` at `routes/web.php:215-225` and `/dashboard/lecturer` at `routes/web.php:385-399` to `lecturer_dashboard.blade.php`, `trade_instructor_dashboard.blade.php`, and `/staff/mobile`).
  - `physical_instructor_dashboard.blade.php` (**Does NOT exist as a separate file** — `Physical_Instructor` role is routed by `/dashboard` at `routes/web.php:215-225` to `lecturer_dashboard.blade.php` and `/r26/classroom/health-physical/{subjectId}` rendered by `resources/views/r26_health_physical/virtual_classroom_health_physical.blade.php:1-920`).

#### A. Demonstrator Dashboard (`resources/views/demonstrator_dashboard.blade.php:1-606`)
- **Sidebar Navigation (`:272-366`)**:
  - `Lab Workspaces` (`#navDashboard`, `onclick="switchPanel('dashboard')"`, `:296`)
  - Quick links (`:300-350`) to `Mobile Virtual Lab` (`/staff/mobile/virtual-lab`), `Staff Mobile Attendance & Leave` (`/staff/mobile`), `Course Files` (`/course-files`), and `Remedial Classrooms` (`/virtual-classroom/remedial`)
  - `My Profile & Security` (`#navSecurity`, `onclick="switchPanel('security')"`, `:352`)
  - `Remote Support Assist` (`onclick="openStaffSupportModal()"`, `:364`)
- **Panels & Widgets**:
  - `#panelDashboard` (`:389-528`): Displays allocated Practical & Practicum batch cards (`:417-525`) with experiment conduction progress bars (`:504`) and direct launchers into `virtual_classroom_practical.blade.php`, `r26_practical/virtual_classroom_practical.blade.php`, and `r26_practicum/virtual_classroom_practicum.blade.php`.
  - `#panelSecurity` (`:530-535`): Embeds `@include('partials.staff_profile_panel')` (`:531`).

#### B. Trade Instructor Dashboard (`resources/views/trade_instructor_dashboard.blade.php:1-412`)
- **Sidebar Navigation (`:217-305`)**:
  - `Trade & Workshops` (`#navDashboard`, `onclick="switchPanel('dashboard')"`, `:241`)
  - Quick links (`:245-287`) to `Mobile Workshop Evaluator` (`/staff/mobile`), `Mobile Virtual Lab` (`/staff/mobile/virtual-lab`), and `Lecturer Workspace` (`/dashboard/lecturer`)
  - `My Profile & Security` (`#navSecurity`, `onclick="switchPanel('security')"`, `:289`)
  - `Remote Support Assist` (`onclick="openStaffSupportModal()"`, `:301`)
- **Panels & Widgets**:
  - `#panelDashboard` (`:326-335`): Dynamically populated grid of assigned Engineering Workshop trade sections (Carpentry, Fitting, Welding, Sheet Metal, Smithy, Foundry, Masonry, Electrical Wiring) and Practical labs with one-click launchers into `r21_workshop/virtual_classroom_workshop.blade.php` and `r21_workshop/mobile_workshop.blade.php`.
  - `#panelSecurity` (`:337-342`): Embeds `@include('partials.staff_profile_panel')` (`:338`).

#### C. Workshop Superintendent Dashboard (`resources/views/workshop_superintendent_dashboard.blade.php:1-1085`)
- **Sidebar Navigation (`:217-315`)**:
  - `Workshop Overview` (`#navOverview`, `onclick="switchPanel('overview')"`, `:241`)
  - `Workshop Staff Directory` (`#navStaff`, `onclick="switchPanel('staff')"`, `:244`)
  - `Student Roster` (`#navStudents`, `onclick="switchPanel('students')"`, `:247`)
  - `Audit Trail` (`#navAudit`, `onclick="switchPanel('audit')"`, `:250`)
  - Quick links (`:253-296`) to `Workshop Virtual Classrooms`, `Staff Mobile App` (`/staff/mobile`), and `Course Files` (`/course-files`)
  - `My Profile & Security` (`#navSecurity`, `onclick="switchPanel('security')"`, `:298`)
  - `Remote Support Assist` (`onclick="openStaffSupportModal()"`, `:310`)
- **Panels & Modals**:
  1. **Panel 1 — Workshop Overview (`#panelOverview`, `:342-398`)**: KPI cards for Workshop Staff count, active trade sections, enrolled first-year batches, and quick actions (`Manage Workshop Staff` `:379`, `View Student Roster` `:380`).
  2. **Panel 2 — Workshop Staff Directory (`#panelStaff`, `:400-448`)**: Directory of Trade Instructors, Tradesmen, and Demonstrators with `Register Workshop Staff` button (`onclick="openRegisterStaffModal()"`, `:407`).
  3. **Panel 3 — Student Roster (`#panelStudents`, `:450-518`)**: Filterable roster of all students enrolled in Workshop Practice across branches.
  4. **Panel 4 — Audit Trail (`#panelAudit`, `:520-551`)**: Workshop operations audit log.
  5. **Panel 5 — My Profile & Security (`#panelSecurity`, `:553-559`)**: Embeds `@include('partials.staff_profile_panel')` (`:554`).
  - **Modals**: `#passwordModal` (`:561`), `#auditModal` (`:587`), `#registerStaffModal` (`:618`), plus `@include('partials.support_desk_overlay')` (`:1082`) and `@include('partials.birthday_wish_modal')` (`:1083`).

---

### 4.2.10 Self-Financing (SF) Office Dashboard (`resources/views/sf_office_dashboard.blade.php`)
- **View & Controller**: `resources/views/sf_office_dashboard.blade.php:1-2607`, served by `GET /dashboard/sf-office` (`SfOfficeController@index` at `app/Http/Controllers/SfOfficeController.php:14-1420`, `routes/web.php:465-482`).
- **Sidebar Navigation (`resources/views/sf_office_dashboard.blade.php:242-345`)**:
  - `Overview & Live Metrics` (`#navBtn-overview`, `onclick="switchPanel('overview')"`, `:265-271`)
  - `Leave Approvals & Special Actions` (`#navBtn-approvals`, `onclick="switchPanel('approvals')"`, `:272-279`)
  - `Mobile Time Punch Logs` (`#navBtn-punches`, `onclick="switchPanel('punches')"`, `:280-288`)
  - `Monthly Leave Report` (`#navBtn-monthly`, `onclick="switchPanel('monthly')"`, `:289-295`)
  - `Annual Leave Report (Apr 1 – Mar 31)` (`#navBtn-yearly`, `onclick="switchPanel('yearly')"`, `:296-302`)
  - `SF Staff Directory & Live Balances` (`#navBtn-directory`, `onclick="switchPanel('directory')"`, `:303-312`)
  - `Office Rules & System Settings` (`#navBtn-settings`, `onclick="switchPanel('settings')"`, `:313-319`)
  - `Salary Slip, Accounts & ITR Docs` (`#navBtn-salary`, `onclick="switchPanel('salary')"`, `:320-327`)
  - `My Profile & Password Change` (`#navBtn-security`, `onclick="switchPanel('security')"`, `:328-333`)
- **Panels, Tabs & Widgets (`resources/views/sf_office_dashboard.blade.php:358-1348`)**:
  1. **Panel 1 — Overview & Live Metrics (`#panel-overview`, `:360-529`)**:
     - Live KPI cards (`:390-465`) for Total SF Staff, Present Today (Biometric IN), Pending Stage-1 Office Leave Reviews (`onclick="switchPanel('approvals')"`, `:428`), CCL Holiday Credit Desk (`onclick="switchPanel('ccl')"`, `:440`), and Past Leaves Backfill Desk (`onclick="switchPanel('backfill')"`, `:452`), plus Today's Recent Biometric Punches preview (`:470-500`) and Pending Leave Queue preview (`:501-528`).
  2. **Panel 2 — Leave Management & Special Actions (`#panel-approvals`, `:532-865`)**:
     - **Sub-Tab 1: `Regular Leave Approvals Queue` (`:537-645`)**: Stage-1 SF Office quota verification queue (`GET /api/sf-office/leaves`, `POST /api/sf-office/leaves/approve`).
     - **Sub-Tab 2: `Past Leaves Backfill` (`:544`, `:646-775`)**: Backfill historical leave entries (`POST /api/sf-office/past-leaves`, `DELETE /api/sf-office/past-leaves/{id}`).
     - **Sub-Tab 3: `CCL Holiday Duty Credits` (`:551`, `:776-864`)**: Compensatory Casual Leave ledger (`GET /api/sf-office/ccl/ledger`) and `Grant Manual CCL Credit` button (`onclick="openManualCclModal()"`, `:785`, `POST /api/sf-office/ccl/credit`).
  3. **Panel 3 — Mobile Time Punch Logs (`#panel-punches`, `:869-948`)**:
     - Filterable daily biometric IN/OUT punch log (`GET /api/sf-office/punches`) with GPS distance, geofence verification status, and liveness score.
  4. **Panel 4 — Monthly Leave Report (`#panel-monthly`, `:952-1045`)**:
     - Month/Year/Branch filterable payroll & leave deduction summary (`GET /api/sf-office/reports/monthly`) with CSV/Print export.
  5. **Panel 5 — Cumulative & Annual Leave Report (`#panel-yearly`, `:1049-1129`)**:
     - Financial/Academic year (`Apr 1 – Mar 31`) cumulative CL, ML, DL, CCL, and LOP balance ledger (`GET /api/sf-office/reports/yearly`).
  6. **Panel 6 — SF Staff Directory & Live Balances (`#panel-directory`, `:1133-1183`)**:
     - Complete SF staff roster (`GET /api/sf-office/staff`) with live quota usage and remaining balances.
  7. **Panel 7 — Office Rules & System Settings (`#panel-settings`, `:1187-1246`)**:
     - Configure annual CL quota, grace period minutes, late-punch LOP conversion rules, and office timings (`GET/POST /api/sf-office/settings`).
  8. **Panel 8 — Salary Slip, Accounts & ITR Docs (`#panel-salary`, `:1250-1286`)**:
     - Payroll & ITR document workspace.
  9. **Panel 9 — My Profile & Password Change (`#panel-security`, `:1290-1347`)**:
     - SF Office account security settings.
- **Modals**: `#leaveActionModal` (`:1351-1396`, process Stage-1 approval/rejection with `#modalOfficeRemarks`), `#manualCclModal` (`:1400-1465`, credit holiday duty CCL), and `@include('partials.birthday_wish_modal')` (`:2605`).

---

### 4.2.11 Student Dashboards (`student_dashboard.blade.php`, `student_mobile_dashboard.blade.php` & `student_attendance.blade.php`)
- **Views & Controllers**:
  1. `resources/views/student_dashboard.blade.php:1-2648`: Desktop Student Portal served by `GET /dashboard/student` (`routes/web.php:254-263`).
  2. `resources/views/student_mobile_dashboard.blade.php:1-2912`: Mobile Student Portal served by `GET /student/mobile` (named `student.mobile`, `StudentAttendanceController@showStudentMobileDashboard` at `app/Http/Controllers/StudentAttendanceController.php:18-195`, `routes/web.php:264-269`).
  3. `resources/views/student_attendance.blade.php:1-419`: Dedicated Student Attendance & Leave Portal served by `GET /student/attendance` (`StudentAttendanceController@showStudentAttendance` at `app/Http/Controllers/StudentAttendanceController.php:197-310`, `routes/web.php:270`).

#### A. Desktop Student Dashboard (`resources/views/student_dashboard.blade.php:1-2648`)
- **Sidebar Navigation (`:118-185`)**:
  - `Works To Do (Assignments & Online Tests)` (`#navExams`, `onclick="switchPanel('exams')"`, `:152-154`, default active)
  - `Academic Marks & CIA` (`#navMarks`, `onclick="switchPanel('marks')"`, `:155-157`)
  - `My Profile` (`#navProfile`, `onclick="switchPanel('profile')"`, `:158-160`)
  - `Mentoring Diary` (`#navMentoring`, `onclick="switchPanel('mentoring')"`, `:161-163`)
  - `Activity Points` (`#navActivity`, `onclick="switchPanel('activity')"`, `:164-166`)
  - `My Seminar` (`#navSeminar`, `onclick="switchPanel('seminar')"`, `:167-169`, shown dynamically for seminar semesters)
  - `My Attendance & Leave` link (`#navAttendance`, `href="/student/attendance"`, `:170-172`)
  - `Mock Test Practice` link (`#navMockTest`, `href="/student/mock-test"`, `:173-175`)
- **Top Header & Quick Launchers (`:190-308`)**:
  - Pre-Class Learning Hub / Study Material Vault button (`onclick="openVlmVaultModal()"`, `:299`).
- **Panels**:
  1. **Panel 1 — Active Exams & Works To Do (`#panelExams`, `:312-413`)**: Lists active MCQ/Descriptive Online Tests (`GET /api/student/online-tests`), pending CO Assignments, and Mid-Sem / Course Exit Surveys.
  2. **Panel 2 — Academic Marks (`#panelMarks`, `:415-518`)**: Subject-wise CIA breakdown (Series 1, Series 2, Assignments/SLA, Lab/Workshop Marks, Attendance Marks, Total CIA) fetched via `GET /api/student/academic-report` (`routes/web.php:839`).
  3. **Panel 3 — My Profile (`#panelProfile`, `:520-649`)**: Student personal details, contact info, parent details, SBTE registration number, and password change form.
  4. **Panel 4 — Activity Points (`#panelActivity`, `:651-759`)**: AICTE/SBTE activity point progress bar, category breakdown, and certificate upload form.
  5. **Panel 5 — My Seminar (`#panelSeminar`, `:761-839`)**: Seminar topic submission, abstract/presentation upload, and peer/faculty evaluation status.
  6. **Panel 6 — Mentoring Diary (`#panelMentoring`, `:841`)**: Embeds `@include('student_mentoring_panel')` (`:841`) and `@include('student_mentoring_scripts')` (`:2645`).
- **Modals (`:2281-2560`)**:
  - `#testEngineModal` (`:2281-2305`): Fullscreen timed online test-taking interface.
  - `#testResultModal` (`:2307-2329`): Instant score & result summary modal.
  - `#answerKeyModal` (`:2331-2349`): Question-by-question answer key & explanation viewer.
  - `#vlmVaultModal` (`:2351-2512`): Virtual Learning Materials Vault (PDF notes, video lectures, pre-class alerts).
  - `#firstLoginProfileModal` (`:2514-2560`): Mandatory first-login profile completion & password update modal.

#### B. Mobile Student Dashboard (`resources/views/student_mobile_dashboard.blade.php:1-2912`) & `student_attendance.blade.php` (`:1-419`)
- **Bottom Mobile Navigation Bar (`:1560-1610`) & 6 Mobile Tabs**:
  1. **Tab 1 — Home / Overview (`#tab-home`, `:421-707`)**: Student identity banner, pre-class material alert pill (`openMobileMaterialsModal()`, `:440`, `:683`), **No-Due Slip & Attendance Certificate** generator button (`openNoDueModal()`, `:500`, printing via `GET /student/attendance-certificate/print` and `GET /student/nodue-slip/print` at `routes/web.php:271-272`), today's 6-period timetable status, and quick leave button (`toggleMobileLeaveForm()`, `:697`).
  2. **Tab 2 — Attendance Detailed Review (`#tab-attendance`, `:709-822`)**: Hero 6-working-hour Attendance Gauge (`:711`), subject-wise attendance percentage cards, and daily period-by-period P/A/DL/ML log.
  3. **Tab 3 — Tasks & Works To Do (`#tab-tasks`, `:824-922`)**: Active online tests, pending assignments, and course surveys.
  4. **Tab 4 — Stats & Academic Evaluation (`#tab-stats`, `:924-1295`)**: Subject-wise internal marks, series test scores, and inline Activity Point claim submission form (`toggleActivityForm()`, `:1006`, `:1225`).
  5. **Tab 5 — Leave Application & History (`#tab-leave`, `:1297-1382`)**: Mobile leave/medical/duty application form (`toggleMobileLeaveForm()`, `:1304`) and approval status timeline.
  6. **Tab 6 — Profile & Account Settings (`#tab-profile`, `:1384-1558`)**: 5 profile cards (*Avatar & Basic Info* `:1406`, *Personal Contact* `:1445`, *Parent/Guardian Info* `:1485`, *SBTE Registration* `:1516`, *Account Security / Change Password* `:1528`).
- **Modals in `student_mobile_dashboard.blade.php`**: `#mobileMaterialsModal` (`:2347`), `#leaveModal` (`:2368`), `#firstLoginProfileModalMobile` (`:2418`), `#noDueSlipModal` (`:2799`), and `@include('partials.push_notification_prompt')` (`:2909`).
- **`student_attendance.blade.php` (`:1-419`)**: Standalone responsive view with the Hero 6-Hour Attendance Gauge (`:179`), collapsible Leave Application Form (`toggleLeaveForm()`, `:235`), and daily/subject-wise attendance breakdown.

---

### 4.2.12 Parent Portal (`resources/views/parent_dashboard.blade.php` & `parent_login.blade.php`)
- **Views & Controller**:
  - `resources/views/parent_login.blade.php:1-184`: Served by `GET /parent` (named `parent.login`, `ParentDashboardController@showLogin` at `app/Http/Controllers/ParentDashboardController.php:19-30`, `routes/web.php:2423`). Authenticates via `POST /parent/login` (`routes/web.php:2424`) using Student Registration Number + Date of Birth (or Parent Mobile), and supports one-click demo access via `GET /parent/demo` (`routes/web.php:2425`).
  - `resources/views/parent_dashboard.blade.php:1-668`: Served by `GET /parent/dashboard/{regNo}` (named `parent.dashboard`, `ParentDashboardController@showDashboard` at `app/Http/Controllers/ParentDashboardController.php:75-410`, `routes/web.php:2426`).
- **Top Header & Controls (`resources/views/parent_dashboard.blade.php:250-318`)**:
  - Ward Identity Card (Student Name, Reg No, Branch, Semester, Roll No), Bilingual **English / Malayalam (`മലയാളം`) Language Toggle** (`toggleLanguage()`), Light/Dark Theme Toggle (`toggleTheme()`, `:271`), and Logout button (`GET /parent/logout`, `routes/web.php:2427`).
- **Bottom Mobile Navigation Bar (`:608-628`) & 4 Tabs**:
  1. **Tab 1 — Today's Attendance & Hero Gauge (`#tab-attendance`, `:321-418`, nav link at `:610`)**:
     - Hero Overall Semester Attendance Gauge (`:323`), Today's 6-Period Live Roll-Call Status strip (Period 1–6 Present/Absent/Unmarked indicators), and recent absence dates list.
  2. **Tab 2 — Ward Academic Status & Performance (`#tab-academic`, `:420-526`, nav link at `:614`)**:
     - Subject-wise Series Test 1, Series Test 2, Assignment/Practical scores, Consolidated CIA marks, and Subject Attendance %.
  3. **Tab 3 — Assignments & Tests (`#tab-tasks`, `:528-568`, nav link at `:618`)**:
     - Upcoming/pending assignments, scheduled series exams, and online test completion status for the ward.
  4. **Tab 4 — Faculty Remarks & Mentoring Comments (`#tab-remarks`, `:570-606`, nav link at `:622`)**:
     - Tutor/Mentor counseling notes, disciplinary notices, leave statuses, and direct contact links for the Class Tutor and HOD.

---

### 4.2.13 Staff Mobile Portal, Biometric Face Punch, Geofence & Mobile Virtual Lab
- **Views & Controllers**:
  1. `resources/views/staff_mobile_dashboard.blade.php:1-6289`: Unified Staff Mobile & Desktop-Responsive Portal served by `GET /staff/mobile` and `GET /dashboard/staff/mobile` (`MentoringController@showStaffMobileDashboard` at `app/Http/Controllers/MentoringController.php:18-310`, `routes/web.php:439-442`).
  2. `resources/views/sf_staff_face_punch.blade.php:1-1436`: Biometric Face Recognition & GPS Geofence Time Punch Terminal served by `GET /sf-staff/face-punch` (`StaffAttendanceMobileController@showFacePunch` at `app/Http/Controllers/StaffAttendanceMobileController.php:18-165`).
  3. `resources/views/sf_campus_geofence_setup.blade.php:1-504`: Interactive Map & Polygon/Radius Geofence Configurator served by `GET /sf-campus/geofence-setup` (`StaffAttendanceMobileController@showGeofenceSetup` at `app/Http/Controllers/StaffAttendanceMobileController.php:167-230`).
  4. `resources/views/sf_staff_attendance_report.blade.php:1-1992`: Biometric Face Audit & Attendance Report Console served by `GET /sf-staff/attendance-report` (`StaffAttendanceMobileController@showAttendanceReport` at `app/Http/Controllers/StaffAttendanceMobileController.php:232-610`).
  5. `resources/views/staff_mobile_virtual_lab.blade.php:1-1238`: Mobile Continuous Lab Evaluation Workspace served by `GET /staff/mobile/virtual-lab/{subjectId?}` (`StaffMobileVirtualLabController@index` at `app/Http/Controllers/StaffMobileVirtualLabController.php:18-340`).
  6. `resources/views/r21_workshop/mobile_workshop.blade.php:1-1919`: Mobile Workshop 3-Section Evaluator served by `GET /staff/mobile/workshop/{subjectId}` (`R21VirtualClassroomWorkshopController@showMobile` at `routes/web.php:790-793`).

#### A. Unified Staff Mobile Dashboard (`resources/views/staff_mobile_dashboard.blade.php:1-6289`)
- **Navigation (`:1653-1688` Mobile Bottom Nav & `:5528-5554` Desktop Sidebar Nav) & 6 Tabs**:
  1. **Tab 1 — Today's Timetable & Attendance (`#tab-classes`, `:845-1109`)**:
     - Biometric Morning IN / Evening OUT status & `Monthly Punch Log` button (`openMobileMonthlyPunchModal()`, `:878`, `:882`), Interactive Day Order Picker badge (`#selectedDayBadge`, `onclick="toggleDayPicker()"`, `:966`), Timetable Override toggle (`onclick="toggleStaffTimetableOverride()"`, `:1097`), and today's scheduled Period 1–6 class cards with one-click `Take Attendance` (`openClassAttendanceModal(...)`, `:3016`, `:3185`), `Mobile Virtual Lab` (`openMobileVirtualLab(...)`, `:3085`), and `Mobile Workshop` (`openMobileWorkshop(...)`, `:3066`).
  2. **Tab 2 — To-Do Works (`#tab-todo`, `:1111-1223`)**:
     - Pending class logs, unmarked attendance alerts, lab evaluation shortcuts (`:1154`, `:1184`), and pending leave/proxy notifications.
  3. **Tab 3 — Remedial / Continuous Assessment (`#tab-remedial`, `:1225-1313`)**:
     - Mobile remedial session logger and continuous assessment quick-entry cards.
  4. **Tab 4 — Mentoring & Student Leave Approvals (`#tab-mentoring`, `:1316-1386`)**:
     - Assigned mentee roster, mobile counseling log form, and student leave approval queue.
  5. **Tab 5 — Staff Leave Governance Portal & Leave Ledger (`#tab-leave`, `:1388-1513`)**:
     - Live CL / ML / DL / CCL / LOP balance cards, `Apply for Leave / Duty / Proxy` button (`onclick="openStaffLeaveModal()"`, `:1401`, `:5737`), Proxy Period Substitution request responses, and multi-stage leave status tracker (HOD / SF Office -> Coordinator -> Principal).
  6. **Tab 6 — Profile & Security (`#tab-profile`, `:1515-1652`)**:
     - Staff profile editor, WebAuthn biometric passkey registration, and password change.
- **Modals in `staff_mobile_dashboard.blade.php` (`:1693-2245`)**:
  - `#staffLeaveModal` (`:1693-1785`): Staff leave application modal with period-wise proxy faculty selector.
  - `#mobileMonthlyPunchModal` (`:1787-1877`): Personal monthly biometric IN/OUT punch calendar & time ledger.
  - `#classAttendanceModal` (`:1879-2105`): 2-tab mobile roll-call modal (`#tabBtnTakeAtt` `:1903` -> `Tab 1: Take Attendance & Log Form` `:1920-2082` with interactive student grid `toggleAttStudentGrid()` `:4250`; `#tabBtnPastLogs` `:1908` -> `Tab 2: Past Class Logs` `:2083-2104` with `openExtraExpPopup()` `:4671`).
  - `#addExtraExpModal` (`:2107-2152`): Add an additional experiment conducted in the same lab session.
  - `#assignedSubjectsModal` (`:2154-2245`): Quick switcher modal for all subjects assigned to the staff member (`:732`, `:757`).

#### B. Biometric Face Punch, Geofence & Attendance Report Views (`sf_staff_face_punch`, `sf_campus_geofence_setup`, `sf_staff_attendance_report`)
- **`resources/views/sf_staff_face_punch.blade.php` (`:1-1436`)**:
  - Live WebRTC camera viewfinder with client-side face detection/descriptor matching, liveness blink/movement check, GPS coordinate distance computation against campus geofence, Morning IN / Evening OUT punch submission, `#regConfirmModal` (`:492-523`) for initial biometric face enrollment, and `#facePunchLogModal` (`:525-605`, triggered at `:474`) showing personal punch history.
- **`resources/views/sf_campus_geofence_setup.blade.php` (`:1-504`)**:
  - Interactive Leaflet/Map canvas for configuring campus center coordinates, allowed radius in meters, and polygon boundary vertices (`POST /api/sf-campus/geofence-save`).
- **`resources/views/sf_staff_attendance_report.blade.php` (`:1-1992`)**:
  - Segmented Navigation Bar (`:626-653`) switching between Daily Biometric Punch Register (`:720-930`), Monthly Consolidated Staff Attendance Sheet (`:933-1145`), Individual Staff Punch & Liveness Audit (`:1148-1360`), and Enrolled Biometric Face Registry (`:1366-1450`).
  - **Modals**: `#modalFaceCompare` (`:1739-1790`, side-by-side comparison of Registered Face `#regFace`, Morning IN Snapshot `#inSnap`, Evening OUT Snapshot `#outSnap`, and Liveness Score `:821-827`) and `#modalPhotoZoom` (`:1793-1820`).

#### C. Mobile Virtual Lab & Mobile Workshop Views (`staff_mobile_virtual_lab.blade.php` & `r21_workshop/mobile_workshop.blade.php`)
- **`resources/views/staff_mobile_virtual_lab.blade.php` (`:1-1238`)**:
  - **5 Mobile Tabs (`:166-442`)**:
    - Tab 1: `Lab Work Evaluation (37.5M)` (`#tab-labwork`, `:167-269`, launching `#gradingModal` via `openGradingModal()` at `:243`)
    - Tab 2: `Open-Ended Evaluation (7.5M)` (`#tab-openended`, `:271-301`)
    - Tab 3: `Lab Tests Evaluation (15M)` (`#tab-labtests`, `:303-338`)
    - Tab 4: `Attendance Override (15M)` (`#tab-attendance`, `:340-395`, `toggleMobileAttLog()` at `:375`)
    - Tab 5: `CIA Summary (75M)` (`#tab-summary`, `:397-441`)
  - **Modals**: `#studentDetailModalMobile` (`:469-557`, full student lab dossier) and `#gradingModal` (`:559-670`, touch-friendly rubric slider grading modal with date picker `#modalExpDate` `:585` and live total `#modalTotalMark` `:656`).
- **`resources/views/r21_workshop/mobile_workshop.blade.php` (`:1-1919`)**:
  - **5 Mobile Tabs (`:292-340`)**: `Tab 1: Works (20M)` (`:292`), `Tab 2: Record (20M)` (`:302`), `Tab 3: Test (15M)` (`:312`, `toggleMobileTestAbsent()` at `:879`), `Tab 4: Roll Call` (`:322`, `toggleMobileAttendance()` at `:999`), and `Tab 5: Status (3-Section Completion & CIA 75M)` (`:332`), plus Mobile Workshop Report Modal (`openMobileReportModal()`, `:334-440`).

---

# Section 5: Core System Workflows

This section documents the 13 primary end-to-end operational workflows in the `carmel-linx-laravel` application. Every workflow details the step-by-step execution flow (routes $\rightarrow$ controller methods $\rightarrow$ services/helpers $\rightarrow$ views), participating actors, state/status values and transitions, approval/locking mechanisms, and database tables/columns read and written.

---

## 5.1 Batch Creation & Student Registration

### 5.1.1 Actors
- **Initiators**:
  - **HOD / Admin / Super_Admin / Principal**: Creates curriculum batches (`R2021` or `R2026`), uploads bulk student rosters (`.csv` / `.xlsx`), approves pending accounts, promotes semesters, and graduates batches (`routes/web.php:531-580, 816, 981-984`).
  - **Student**: Self-registers (`POST /register/student`, `routes/web.php:154`) or logs in with generated credentials and completes mandatory first-login profile setup (`POST /api/student/complete-first-login-profile`, `routes/web.php:983`).
- **Participants / Viewers**:
  - **Class Tutor / Mentor**: Views batch student roster, prints credential sheets (`GET /hod/batches/{classroomId}/credentials/print`, `routes/web.php:540-576`), and verifies student profiles (`app/Http/Controllers/MentoringController.php:1231-1269`).

### 5.1.2 Step-by-Step Execution Flow

#### A. HOD Batch Creation (R2021 vs. R2026 Routing)
1. **Listing Batches**:
   - `GET /api/hod/batches` $\rightarrow$ `DataController@getHodBatches` (`routes/web.php:531`, `app/Http/Controllers/DataController.php:1539-1620`).
   - Queries both `class_management` (`R2021`, `DataController.php:1549-1556`) and `r26_class_management` (`R2026`, `DataController.php:1559-1568`) filtered by `branch`, attaches `BatchSubject` records and `Student` counts (`DataController.php:1572-1615`), and returns a unified JSON list.
2. **Creating a Batch**:
   - `POST /api/hod/batches` $\rightarrow$ `DataController@createHodBatch` (`routes/web.php:532`, `app/Http/Controllers/DataController.php:1627-1792`).
   - Also directly routable for R2026 via `POST /api/r26/hod/batches` $\rightarrow$ `R26DataController@createBatch` (`routes/web.php:580`, `app/Http/Controllers/R26DataController.php:122-236`).
   - **Revision Delegation**: Inside `DataController@createHodBatch`, if `admission_year >= 2026`, execution immediately delegates to `app(R26DataController::class)->createBatch($request)` (`DataController.php:1637-1640`).
   - **Classroom ID & Year Calculation**:
     - For `Regular` admission (`batch_type = 'Regular'`): `baseYear = admission_year`, `endYear = baseYear + 3`, `classroomId = "{BRANCH}_{baseYear}_{endYear}"`, `initialSem = 1` (`DataController.php:1666-1673`, `R26DataController.php:151-158`).
     - For `Lateral Entry` (`batch_type = 'LET'`): `baseYear = admission_year - 1` (maps to the parent regular cohort), `classroomId = "{baseClassroomId}_LET"`, `initialSem = 3` (`DataController.php:1649-1665`, `R26DataController.php:137-150`).
   - **Auto-Populating Subjects from Syllabus Registry**:
     - Queries `syllabus_registry` matching `semester` (`1` for Regular, `3` for LET), `revision` (`'2021'` or `'2026'`), and `branch` (plus `'GEN'` common courses for Semester 1/2) (`DataController.php:1694-1713`, `R26DataController.php:185-199`).
     - Inserts matched courses into `batch_subjects` with `classroom_id`, `subject_code`, `subject_name`, `subject_type`, `semester`, `credits`, `max_marks` (`75` for R21, `100` for R26), `internal_Max`, and `external_Max` (`DataController.php:1715-1741`, `R26DataController.php:201-218`).

#### B. Bulk Student Upload & Credential Generation
1. **Template Download**:
   - `GET /api/students/template/download` $\rightarrow$ `DataController@downloadStudentImportTemplate` (`routes/web.php:984`, `app/Http/Controllers/DataController.php:3656-3677`) streams a CSV template with headers `Admission_No,Roll_No,Student_Name,Gender,DOB,Mobile_No,Email,Guardian_Name,Guardian_Mobile,Admission_Type(Regular/LET)`.
2. **Batch Student Upload (CSV / Excel)**:
   - `POST /api/admin/batch-student-upload` $\rightarrow$ `BatchStudentUploadController@uploadBatchStudents` (`routes/web.php:982`, `app/Http/Controllers/BatchStudentUploadController.php:20-73`).
   - Validates `classroom_id`, `branch`, `semester`, and file extension (`csv`, `txt`, `xlsx`, `xls`) (`BatchStudentUploadController.php:22-37`).
   - Pre-hashes the default institutional password once per batch via `Hash::make('carmel2026')` (`BatchStudentUploadController.php:39`).
   - Dispatches to `processExcelUpload` (`PhpOffice\PhpSpreadsheet\IOFactory::load`, `BatchStudentUploadController.php:193-339`) for `.xlsx/.xls` or `processCsvUpload` (`BatchStudentUploadController.php:78-188`) for `.csv`:
     - Extracts `adm_no`, `name`, `roll_no`, `sbte_reg_no` (`PRN`), `dob`, `gender`, `doj`, and `admission_type` (`'LET'` or `'Regular'`).
     - **System Registration Number (`reg_no`) Generation**: Formats `reg_no = "{YY}{BRANCH}{admNoClean}"` (appending `'L'` if `admission_type === 'LET'`), where `YY` is the 2-digit batch year from `classroom_id` (`BatchStudentUploadController.php:129-132, 225-228`).
     - **Default Email Generation**: Sets `email = strtolower($admNoClean) . '@carmelpoly.in'` (`BatchStudentUploadController.php:145, 236`).
     - Upserts into `students` with `status = 'Approved'`, `academic_status = 'Active'`, and `password_hash = $defaultPasswordHash` (`BatchStudentUploadController.php:136-152, 231-265`).
   - Alternative bulk import endpoint: `POST /api/students/bulk-import` $\rightarrow$ `DataController@bulkImportStudents` (`routes/web.php:981`, `app/Http/Controllers/DataController.php:3682-3810`).
3. **Printing Student Credentials**:
   - `GET /hod/batches/{classroomId}/credentials/print` (`routes/web.php:540-576`) queries `class_management` / `r26_class_management` and `students` ordered by `roll_no` and renders `resources/views/batch_student_credentials_print.blade.php` (`routes/web.php:567`).

#### C. Student First-Login Profile Completion & Self-Registration
1. **Authentication & Default Password Detection**:
   - `POST /login` $\rightarrow$ `AuthController@login` (`routes/web.php:151`, `app/Http/Controllers/AuthController.php:16-196`).
   - When `role === 'Student'`, looks up `Student` by `reg_no`, `adm_no`, `sbte_reg_no`, `email`, or `phone` (`AuthController.php:27-39`).
   - If the student logs in with `'carmel2026'` (or legacy `'Carmel@123'`, which is transparently re-hashed to `'carmel2026'`), sets `Session::put('must_update_profile', true)` (`AuthController.php:48-68`).
2. **Mandatory Profile & Password Update**:
   - `POST /api/student/complete-first-login-profile` $\rightarrow$ `BatchStudentUploadController@completeFirstLoginProfile` (`routes/web.php:983`, `app/Http/Controllers/BatchStudentUploadController.php:344-441`).
   - Rejects `new_password === 'carmel2026'` (`BatchStudentUploadController.php:368-373`), updates `phone`, `email`, `dob`, `gender`, `blood_group`, `religion`, `community`, `category`, `aadhar_no`, `father_name`, `father_occupation`, `mother_name`, `mother_occupation`, `guardian_name`, `guardian_mobile`, `annual_income`, `address`, `Permanent_Address`, `pin_code`, and `password_hash`, and clears `must_update_profile` from the session (`BatchStudentUploadController.php:379-415`).
3. **Public Self-Registration & Admin Approval**:
   - `POST /register/student` $\rightarrow$ `AuthController@registerStudent` (`routes/web.php:154`, `app/Http/Controllers/AuthController.php:201-316`) creates a `students` row with `status = 'Pending'` (`AuthController.php:291`).
   - Approved via `POST /api/approve-account` $\rightarrow$ `DataController@approveAccount` (`routes/web.php:485`, `app/Http/Controllers/DataController.php:196-236`) or toggled via `POST /api/admin/user/toggle-status` $\rightarrow$ `DataController@toggleUserStatus` (`routes/web.php:514`, `DataController.php:926-994`).

#### D. Semester Promotion & Batch Graduation
1. **Semester Update (1 to 6)**:
   - `POST /api/hod/batches/{classroomId}/update-semester` $\rightarrow$ `DataController@updateBatchSemester` (`routes/web.php:536`, `app/Http/Controllers/DataController.php:1797-1830`).
   - Updates `current_semester` (1–6) on `class_management` or `r26_class_management` and updates `semester` on all `students` in that `classroom_id` (`DataController.php:1805-1823`).
   - Auto-seeds `batch_subjects` for the new semester from `syllabus_registry` when `DataController@getHodBatches` is next loaded (`DataController.php:1580-1605`).
2. **Batch Graduation**:
   - `PUT /api/hod/batches/{classroomId}/graduate` $\rightarrow$ `DataController@graduateBatch` (`routes/web.php:816`, `app/Http/Controllers/DataController.php:2369-2411`).
   - Sets `current_semester = 7` on `class_management` / `r26_class_management` (`DataController.php:2395-2396`) and updates all batch `students` to `status = 'Graduated'`, `academic_status = 'Graduated'` (`DataController.php:2399-2402`).

### 5.1.3 States, Approvals & Locking
- **`students.status`**: `'Pending'` (self-registered, blocked from login at `AuthController.php:42-46`) $\rightarrow$ `'Approved'` (active login) $\rightarrow$ `'Graduated'` (`DataController.php:2401`) or `'Suspended'` (`DataController.php:955`).
- **`students.academic_status`**: `'Active'` $\rightarrow$ `'Graduated'` / `'Dropped'` / `'Detained'`.
- **`class_management.current_semester` / `r26_class_management.current_semester`**: `1..6` (Active semesters) $\rightarrow$ `7` (Graduated/Archived cohort, `DataController.php:2395`).
- **First-Login Gate**: `Session::get('must_update_profile')` forces password change and profile completion before normal student portal use (`AuthController.php:63-67`, `BatchStudentUploadController.php:415`).

### 5.1.4 Database Tables Read / Written
| Table | Operation | Key Columns |
| :--- | :--- | :--- |
| `class_management` | R/W | `classroom_id`, `batch_name`, `branch`, `batch_year`, `current_semester`, `tutor_mobile_no`, `mentor_mobile_no`, `batch_type` (`DataController.php:1675-1684, 1805, 2395`) |
| `r26_class_management` | R/W | `classroom_id`, `batch_name`, `branch`, `batch_year`, `current_semester`, `tutor_mobile_no`, `mentor_mobile_no`, `batch_type`, `revision` (`R26DataController.php:160-170`) |
| `syllabus_registry` | Read | `subject_code`, `subject_name`, `subject_type`, `semester`, `branch`, `revision`, `credits`, `max_marks` (`DataController.php:1694-1713`) |
| `batch_subjects` | Write | `classroom_id`, `subject_code`, `subject_name`, `subject_type`, `semester`, `credits`, `max_marks`, `internal_Max`, `external_Max` (`DataController.php:1718-1739`) |
| `students` | R/W | `reg_no`, `adm_no`, `roll_no`, `sbte_reg_no`, `name`, `branch`, `semester`, `classroom_id`, `admission_type`, `doj`, `dob`, `gender`, `email`, `phone`, `guardian_name`, `guardian_mobile`, `password_hash`, `status`, `academic_status` (`BatchStudentUploadController.php:136-152, 379-413`) |
| `audit_logs` | Write | `performed_by`, `performed_by_name`, `target_id`, `target_name`, `action`, `details`, `ip_address` (`BatchStudentUploadController.php:417-425`, `DataController.php:2404`) |

---

## 5.2 Tutor / Mentor Assignment & Mentoring Lifecycle

### 5.2.1 Actors
- **Initiators**:
  - **HOD / Admin / Principal**: Assigns primary Class Tutor (`tutor_mobile_no`) and Mentor (`mentor_mobile_no`) to a batch (`routes/web.php:533-534`).
  - **Class Tutor (Mentor-1)**: Optionally assigns a Co-Mentor (`Mentor-2`) and splits batch students into Mentoring Sub-Batch `'A'` (`Mentor-1`) and Sub-Batch `'B'` (`Mentor-2`) (`routes/web.php:944-945`).
- **Participants / Viewers**:
  - **Mentors (`Mentor-1` & `Mentor-2`)**: Conduct mentoring sessions, record diary notes, review student-submitted diary updates, log parent communications, manage interventions, and verify student profiles (`routes/web.php:942-960`).
  - **Students**: Update extended bio-data, log self-service achievements/grievances (`POST /api/student/mentoring/diary/save`, `routes/web.php:958`), and upload certificates (`routes/web.php:959`).

### 5.2.2 Step-by-Step Execution Flow
1. **HOD Assigns Class Tutor & Batch Mentor**:
   - **Assign Tutor**: `POST /api/hod/batches/assign-tutor` $\rightarrow$ `DataController@assignBatchTutor` (`routes/web.php:533`, `app/Http/Controllers/DataController.php:1835-1907`) and `POST /api/r26/hod/batches/assign-tutor` $\rightarrow$ `R26DataController@assignTutor` (`routes/web.php:581`, `app/Http/Controllers/R26DataController.php:37-77`). Updates `tutor_mobile_no` on `class_management` / `r26_class_management` and sets `students.tutor_mobile_no` for all students in `classroom_id` (`DataController.php:1857-1878`).
   - **Assign Mentor**: `POST /api/hod/batches/assign-mentor` $\rightarrow$ `DataController@assignBatchMentor` (`routes/web.php:534`, `app/Http/Controllers/DataController.php:1912-1984`) and `POST /api/r26/hod/batches/assign-mentor` $\rightarrow$ `R26DataController@assignMentor` (`routes/web.php:582`, `app/Http/Controllers/R26DataController.php:79-120`). Updates `mentor_mobile_no` on `class_management` / `r26_class_management` and `students.mentor_mobile_no` (`DataController.php:1934-1955`).
2. **Tutor Assigns Mentor-2 & Splits Mentoring Batches A / B**:
   - `POST /api/mentoring/assign-mentor2` $\rightarrow$ `MentoringController@assignMentor2` (`routes/web.php:945`, `app/Http/Controllers/MentoringController.php:275-321`) updates `mentor_mobile_no` on `class_management` / `r26_class_management`.
   - `POST /api/mentoring/assign-batch` $\rightarrow$ `MentoringController@assignBatch` (`routes/web.php:944`, `app/Http/Controllers/MentoringController.php:224-268`):
     - Accepts `classroom_id`, `batch_name` (`'A'` or `'B'`), and `student_reg_nos`.
     - Resolves `mentorMobile`: Batch `'A'` maps to `tutor_mobile_no` (Mentor-1); Batch `'B'` maps to `mentor_mobile_no` (Mentor-2) (`MentoringController.php:244`).
     - Upserts `mentoring_batches` (`classroom_id`, `reg_no`, `batch_name`, `mentor_mobile_no`, `academic_year`) and updates `students.mentor_mobile_no` (`MentoringController.php:247-263`).
3. **Accessing Tutor & Mentor Panels**:
   - **Mentor Dashboard**: `GET /api/mentoring/dashboard` $\rightarrow$ `MentoringController@getMentorDashboard` (`routes/web.php:943`, `MentoringController.php:32-219`) resolves batches where the logged-in staff is `tutor_mobile_no`, `mentor_mobile_no`, or assigned in `mentoring_batches`, computes risk scores (attendance $<75\%$, arrears, active interventions), and returns mentee rosters.
   - **Student 360 Dossier**: `GET /api/mentoring/student/{regNo}` $\rightarrow$ `MentoringController@getStudentDossier` (`routes/web.php:946`, `MentoringController.php:326-499`) aggregates bio-data, family info, semester attendance, CIA marks, board grades, diary entries, parent communications, and interventions.
4. **Mentoring Diary, Interventions & Profile Verification**:
   - **Staff Diary & Interventions**: `POST /api/mentoring/diary/save` $\rightarrow$ `MentoringController@saveDiaryEntry` (`routes/web.php:948`, `MentoringController.php:504-563`, sets `entry_source = 'Staff'`, `approval_status = 'Approved'`); `POST /api/mentoring/parent-comm/save` $\rightarrow$ `saveParentComm` (`routes/web.php:949`, `MentoringController.php:647-686`); `POST /api/mentoring/intervention/save` $\rightarrow$ `saveIntervention` (`routes/web.php:950`, `MentoringController.php:691-739`); `POST /api/mentoring/intervention/close` $\rightarrow$ `closeIntervention` (`routes/web.php:951`, `MentoringController.php:744-769`).
   - **Student Self-Service Diary & Mentor Approval**: Student submits `POST /api/student/mentoring/diary/save` $\rightarrow$ `MentoringController@studentSaveDiaryEntry` (`routes/web.php:958`, `MentoringController.php:568-614`), creating `mentoring_diaries` with `entry_source = 'Student'` and `approval_status = 'Pending'`. Mentor approves or rejects via `POST /api/mentoring/diary/approve` $\rightarrow$ `MentoringController@approveDiaryEntry` (`routes/web.php:952`, `MentoringController.php:619-642`).
   - **Profile Verification**: `POST /api/mentoring/student/{regNo}/verify-profile` $\rightarrow$ `MentoringController@verifyStudentProfile` (`routes/web.php:960`, `MentoringController.php:1231-1269`) sets `students.profile_verified_at = now()` and `students.profile_verified_by = $staffMobile`.

### 5.2.3 States, Approvals & Locking
- **`mentoring_diaries.approval_status`**: `'Pending'` (when `entry_source = 'Student'`) $\rightarrow$ `'Approved'` or `'Rejected'` by Mentor (`MentoringController.php:596, 634`).
- **`mentoring_interventions.status`**: `'Open'` / `'In Progress'` $\rightarrow$ `'Resolved'` / `'Closed'` (`MentoringController.php:730, 761`).
- **`students.profile_verified_at`**: `NULL` (Unverified) $\rightarrow$ Timestamp (Verified by Tutor/Mentor, `MentoringController.php:1257`).

### 5.2.4 Database Tables Read / Written
| Table | Operation | Key Columns |
| :--- | :--- | :--- |
| `class_management` / `r26_class_management` | R/W | `classroom_id`, `tutor_mobile_no`, `mentor_mobile_no` (`DataController.php:1857, 1934`, `MentoringController.php:297-304`) |
| `mentoring_batches` | R/W | `classroom_id`, `reg_no`, `batch_name` (`'A'`/`'B'`), `mentor_mobile_no`, `academic_year` (`MentoringController.php:248-257`) |
| `students` | R/W | `reg_no`, `tutor_mobile_no`, `mentor_mobile_no`, `profile_verified_at`, `profile_verified_by` (`DataController.php:1866, 1943`, `MentoringController.php:260, 1256-1259`) |
| `mentoring_diaries` | R/W | `reg_no`, `mentor_mobile_no`, `semester`, `meeting_date`, `meeting_mode`, `discussion_category`, `summary_notes`, `action_plan`, `student_mood`, `follow_up_date`, `is_confidential`, `entry_source`, `approval_status` (`MentoringController.php:518-555, 585-606, 634`) |
| `mentoring_parent_comms` | R/W | `reg_no`, `staff_mobile_no`, `semester`, `comm_date`, `comm_mode`, `parent_name_contacted`, `relationship`, `contact_number`, `reason`, `discussion_summary`, `parent_response` (`MentoringController.php:661-679`) |
| `mentoring_interventions` | R/W | `reg_no`, `initiated_by_mobile`, `semester`, `risk_category`, `severity`, `description`, `action_taken`, `outcome_notes`, `status`, `closed_at` (`MentoringController.php:706-733, 759-763`) |

---

## 5.3 Subject-Staff Assignment & Lab Sub-Batch Configuration

### 5.3.1 Actors
- **Initiators**:
  - **HOD / Admin / Super_Admin / Principal**: Adds/edits/deletes batch subjects from `syllabus_registry` or manually, and assigns Primary Lecturer, Co-Staff, and Lab Instructors (`routes/web.php:535, 811-818`).
  - **Subject Staff / Lab Instructor**: Configures lab sub-batches (`Batch 1` / `Batch 2`) in the Virtual Lab Classroom or Mobile Virtual Lab (`routes/web.php:1525, 1545, 2008`).

### 5.3.2 Step-by-Step Execution Flow
1. **Adding, Updating & Deleting Subjects in a Batch**:
   - **Add Subject**: `POST /api/hod/batches/subjects` $\rightarrow$ `DataController@addBatchSubject` (`routes/web.php:535`, `app/Http/Controllers/DataController.php:1989-2142`).
     - Looks up `syllabus_registry` by `subject_code` to auto-fill `subject_name`, `subject_type` (`Theory`, `Practical`, `Practicum`, `Drawing`, `Workshop`, `Seminar`, `Major Project`), `credits`, `max_marks`, `internal_Max`, and `external_Max` (`DataController.php:2011-2065`).
     - Creates the `BatchSubject` row in `batch_subjects`. If `staff_mobile_no` is supplied in the payload, creates a `'Primary'` record in `subject_staff_assignments` (`DataController.php:2077-2114`).
   - **Update Subject**: `PUT /api/hod/batches/subjects/{subjectId}` $\rightarrow$ `DataController@updateBatchSubject` (`routes/web.php:817`, `DataController.php:2257-2328`).
   - **Delete Subject**: `DELETE /api/hod/batches/subjects/{subjectId}` $\rightarrow$ `DataController@deleteBatchSubject` (`routes/web.php:818`, `DataController.php:2333-2364`) deletes `subject_staff_assignments` and `batch_subjects`.
2. **Assigning Primary Staff, Co-Staff & Lab Staff**:
   - **Primary Staff Assignment**: `POST /api/hod/subjects/assign-staff` $\rightarrow$ `DataController@assignSubjectStaff` (`routes/web.php:811`, `app/Http/Controllers/DataController.php:2479-2656`).
     - Accepts `subject_id` (or `classroom_id` + `subject_code`), `staff_mobile_no`, and `role` (default `'Primary'`).
     - Removes or replaces existing `'Primary'` assignment for that `batch_subject_id` in `subject_staff_assignments` and inserts the new assignment (`DataController.php:2591-2625`).
   - **Add Co-Staff / Lab Instructor**: `POST /api/hod/subjects/add-co-staff` $\rightarrow$ `DataController@addSubjectCoStaff` (`routes/web.php:812`, `app/Http/Controllers/DataController.php:2661-2735`).
     - Validates `role` (`'Co-Staff'`, `'Lab_Instructor'`, `'Assistant'`) and creates a `SubjectStaffAssignment` row without overwriting the `'Primary'` lecturer (`DataController.php:2695-2715`).
   - **Remove Co-Staff**: `DELETE /api/hod/subjects/remove-co-staff/{assignmentId}` $\rightarrow$ `DataController@removeSubjectCoStaff` (`routes/web.php:813`, `DataController.php:2740-2777`).
3. **Lab Sub-Batch Configuration (`Batch 1` / `Batch 2`)**:
   - **Roll Cutoff / Split Mode**: Stored on `batch_subjects` via `lab_batch_mode` (`'split'` vs `'full'`) and `lab_batch_cutoff` (roll number threshold splitting Batch 1 and Batch 2) (`app/Http/Controllers/SbteSubjectLogImportController.php:683-687`).
   - **Per-Student Lab Batch Allocation (`r26_student_lab_batches`)**:
     - R2021 Practical: `POST /classroom/practical/{batchSubjectId}/assign-batch` $\rightarrow$ `VirtualClassroomPracticalController@assignLabBatch` (`routes/web.php:1525`, `app/Http/Controllers/VirtualClassroomPracticalController.php:742-759`).
     - R2026 Practical: `POST /r26/classroom/practical/{batchSubjectId}/assign-batch` $\rightarrow$ `R26VirtualClassroomPracticalController@assignLabBatch` (`routes/web.php:2008`, `app/Http/Controllers/R26VirtualClassroomPracticalController.php:1052-1065`).
     - Mobile Virtual Lab: `POST /api/staff/mobile/virtual-lab/{batchSubjectId}/batches` $\rightarrow$ `StaffMobileVirtualLabController@saveBatches` (`routes/web.php:1545`, `app/Http/Controllers/StaffMobileVirtualLabController.php:135-179`) supports auto-splitting by `cutoff_roll` (`lines 150-166`) or explicit `batches` map (`reg_no => '1'|'2'`, `lines 167-174`).

### 5.3.3 States, Approvals & Locking
- **`subject_staff_assignments.role`**: `'Primary'`, `'Co-Staff'`, `'Lab_Instructor'`, `'Assistant'` (`DataController.php:2591, 2695`).
- **`r26_student_lab_batches.lab_batch`**: `'1'` (Batch 1), `'2'` (Batch 2), or `'All'` (`StaffMobileVirtualLabController.php:160-173`).

### 5.3.4 Database Tables Read / Written
| Table | Operation | Key Columns |
| :--- | :--- | :--- |
| `syllabus_registry` | Read | `subject_code`, `subject_name`, `subject_type`, `semester`, `branch`, `revision`, `credits`, `max_marks` (`DataController.php:2011-2040`) |
| `batch_subjects` | R/W | `id`, `classroom_id`, `subject_code`, `subject_name`, `subject_type`, `semester`, `credits`, `max_marks`, `internal_Max`, `external_Max`, `lab_batch_mode`, `lab_batch_cutoff` (`DataController.php:2077-2092`, `SbteSubjectLogImportController.php:683-687`) |
| `subject_staff_assignments` | R/W | `id`, `batch_subject_id`, `staff_mobile_no`, `role` (`DataController.php:2601-2615, 2705-2712, 2759`) |
| `r26_student_lab_batches` | R/W | `batch_subject_id`, `reg_no`, `lab_batch` (`VirtualClassroomPracticalController.php:750-753`, `StaffMobileVirtualLabController.php:161, 170`) |

---

## 5.4 Attendance Marking (Classroom, Mobile Lab, Tutor, Special Duty & PWA)

### 5.4.1 Actors
- **Initiators**:
  - **Subject Staff (Lecturer / Demonstrator / Co-Staff)**: Marks period-wise theory/lab attendance and lesson plan completion (`routes/web.php:1084, 1096, 1547`).
  - **Class Tutor / HOD**: Marks or edits full-day 6-period grid attendance, approves student leave applications, logs parent alerts, and awards Special / Duty / Grace attendance (`routes/web.php:1100-1135`).
- **Viewers**:
  - **Students**: View daily/subject-wise attendance, condonation status, and No-Due clearance on desktop and mobile dashboards (`routes/web.php:460-465`).
  - **Parents / Guardians**: Access passwordless or tokenized parent portal (`routes/web.php:469-472`).

### 5.4.2 Step-by-Step Execution Flow

#### A. Period-Wise Classroom & Quick-Log Attendance
1. **Virtual Classroom Period Attendance**:
   - `POST /api/classroom/{subjectId}/attendance/save` $\rightarrow$ `AttendanceController@saveAttendance` (`routes/web.php:1084`, `app/Http/Controllers/AttendanceController.php:228-555`).
   - Validates `date`, `period` (1–7), `lesson_plan_id`, `topics_covered`, `present_students` (array of `reg_no`), `absent_students` (array of `reg_no`), and optional `sub_batch` (`'All'`, `'Batch 1'`, `'Batch 2'`) (`AttendanceController.php:235-275`).
   - **Principal Event / Holiday Guard**: Checks `principal_scheduled_events` to verify whether classes are suspended for that date/session (`AttendanceController.php:280-315`).
   - Upserts `class_logs_attendance` (`batch_subject_id`, `date`, `period`, `sub_batch`, `lesson_plan_id`, `topics_covered`, `present_students` JSON, `absent_students` JSON, `recorded_by`) (`AttendanceController.php:365-410`).
   - Upserts individual rows in `student_attendance` (`reg_no`, `subject_code`, `date`, `status` `'Present'`/`'Absent'`, `sub_batch`, `lesson_plan_id`) (`AttendanceController.php:415-465`).
   - Marks linked `lesson_plans` row as `status = 'Completed'`, setting `actual_date` and `actual_hours` (`AttendanceController.php:470-495`).
   - Dispatches Web Push notifications to absent students via `PushNotificationService::notifyUser` (`AttendanceController.php:505-530`).
2. **Mobile / Dashboard Quick-Log**:
   - `POST /api/attendance/quick-log` $\rightarrow$ `AttendanceController@quickLogAttendance` (`routes/web.php:1096`, `app/Http/Controllers/AttendanceController.php:1114-1290`) provides one-tap mobile attendance logging using roll-number/absentee toggles and syncs both `class_logs_attendance` and `student_attendance`.

#### B. Mobile Virtual Lab Attendance & Daily Experiment Scoring
- `GET /dashboard/staff/mobile/virtual-lab/{batchSubjectId}` $\rightarrow$ `StaffMobileVirtualLabController@index` (`routes/web.php:1543`, `app/Http/Controllers/StaffMobileVirtualLabController.php:19-130`) renders `staff_mobile_virtual_lab`.
- `POST /api/staff/mobile/virtual-lab/{batchSubjectId}/attendance-marks` $\rightarrow$ `StaffMobileVirtualLabController@saveAttendanceAndMarks` (`routes/web.php:1547`, `StaffMobileVirtualLabController.php:248-358`):
  - Saves lab session attendance to `class_logs_attendance` (`sub_batch = "Batch {$labBatch}"`) and `student_attendance` (`StaffMobileVirtualLabController.php:276-312`).
  - Simultaneously upserts 5-component daily experiment marks (`rough_record`, `fair_record`, `prerequisites`, `work_done`, `result`, `total_mark`, `is_absent`) into `practical_experiment_marks` (`StaffMobileVirtualLabController.php:315-348`).

#### C. Class Tutor Daily Grid, Leave Approval & Parent Alerts
- **Tutor Attendance Grid**: `GET /api/tutor/attendance/dashboard` $\rightarrow$ `TutorController@getTutorAttendanceDashboard` (`routes/web.php:1100`, `app/Http/Controllers/TutorController.php:40-310`) aggregates Periods 1–6 across all batch subjects for the selected date, plus monthly/semester cumulative summaries.
- **Bulk Period Save**: `POST /api/tutor/attendance/save-bulk` $\rightarrow$ `TutorController@saveBulkPeriodAttendance` (`routes/web.php:1111`, `TutorController.php:493-612`) lets the Class Tutor mark or override multiple periods (`1..6`) across subjects in a single transaction.
- **Student Leave Approval**: `POST /api/tutor/leave/update-status` $\rightarrow$ `TutorController@updateLeaveStatus` (`routes/web.php:1107`, `TutorController.php:443-488`) updates `leave_records.status` (`'Approved'` or `'Rejected'`).
- **Parent Alert Logging**: `POST /api/tutor/attendance/parent-alert` $\rightarrow$ `TutorController@logParentAlert` (`routes/web.php:1112`, `TutorController.php:617-654`) records call/SMS/WhatsApp alerts in `parent_alert_logs`.

#### D. Special / Duty / Grace Attendance & Condonation Eligibility
- Managed by `TutorSpecialAttendanceController` (`app/Http/Controllers/TutorSpecialAttendanceController.php:1-883`, routes `routes/web.php:1126-1135`).
- **Granting Special Attendance**:
  - `POST /api/tutor/special-attendance/store` $\rightarrow$ `TutorSpecialAttendanceController@storeSpecialAttendance` (`routes/web.php:1128`, `TutorSpecialAttendanceController.php:385-505`).
  - Validates `duty_type` $\in$ `['Official Duty', 'NCC / NSS', 'Sports / Games', 'Medical / Grace', 'Principal Special Permission']`, `date`, `periods` (array of periods `1..6`), and `credited_hours` (`1..6`).
  - Enforces a **10% ceiling** on special attendance hours (`maxSpecialAllowed = floor(totalWorkingHours * 0.10)`, `TutorSpecialAttendanceController.php:435-465`) except when `duty_type === 'Principal Special Permission'`.
  - Writes to `student_special_attendances` with `status = 'Approved'` (`TutorSpecialAttendanceController.php:470-495`).
- **Medical / Grace 5% Relaxation (R2026)**:
  - `POST /api/tutor/special-attendance/toggle-relaxation` $\rightarrow$ `TutorSpecialAttendanceController@toggleRelaxation` (`routes/web.php:1130`, `TutorSpecialAttendanceController.php:535-590`) toggles a 5% medical/maternity/grace relaxation in `student_attendance_relaxations` (`relaxation_percentage = 5.0`).
- **Eligibility & Condonation Rules (`evaluateEligibility`, `TutorSpecialAttendanceController.php:31-125`)**:
  - **Revision 2021**:
    - Effective attendance $\ge 75\%$: `'Eligible'` (No fee).
    - $65\% \le \text{attendance} < 75\%$: `'Condonation Required'` (Fee: Rs. 750).
    - $< 65\%$: `'Detained / Ineligible (FE)'`.
  - **Revision 2026**:
    - Effective attendance $\ge 75\%$ (or $\ge 70\%$ with 5% relaxation): `'Eligible'`.
    - $60\% \le \text{attendance} < 75\%$: `'Condonation Required'` (Regular Condonation, Fee: Rs. 750).
    - $50\% \le \text{attendance} < 60\%$: `'Special Condonation'` (Principal/SBTE Special Condonation, Fee: Rs. 1500).
    - $< 50\%$: `'Detained / Ineligible (FE)'`.
- **Certificate Printing**: `GET /tutor/special-attendance/print-certificate` $\rightarrow$ `TutorSpecialAttendanceController@printCondonationCertificate` (`routes/web.php:1132`, `TutorSpecialAttendanceController.php:722-805`) and `printBatchCertificates` (`routes/web.php:1133`, `lines 810-882`).

#### E. Offline / PWA Behavior
- `public/sw.js` (`public/sw.js:1-74`) registers a Progressive Web App Service Worker handling `install` (`skipWaiting`, `lines 4-6`), `activate` (`clients.claim`, `lines 8-10`), `push` (`showNotification` with icon `/images/carmel-logo.png` and vibration pattern, `lines 12-43`), and `notificationclick` (focusing or opening target client URL, `lines 45-73`).
- Neither `public/sw.js` nor the Blade views implement an IndexedDB offline queue for attendance writes; `localStorage` is used strictly for UI state persistence (theme selection, active tabs, dismissal flags), while attendance mutations require live HTTP `fetch` calls to `/api/classroom/{subjectId}/attendance/save` or `/api/attendance/quick-log`.

#### F. Student & Parent Visibility
- **Student Portal**: `GET /student/attendance` $\rightarrow$ `StudentAttendanceController@showStudentAttendance` (`routes/web.php:461`, `app/Http/Controllers/StudentAttendanceController.php:14-182`) and `GET /dashboard/student/mobile` $\rightarrow$ `showStudentMobileDashboard` (`routes/web.php:460`, `lines 187-889`).
  - Period 7 (`period == 7`) is treated as a Special/Remedial hour and explicitly excluded from regular 6-period daily attendance denominators (`StudentAttendanceController.php:120-160, 338-378`).
  - Displays live No-Due Clearance checklist across all subjects + Library/Office (`StudentAttendanceController.php:535-567, 913-1029`).
- **Parent Portal**: `POST /parent/login` $\rightarrow$ `ParentDashboardController@authenticate` (`routes/web.php:470`, `app/Http/Controllers/ParentDashboardController.php:24-93`) authenticates via `reg_no` + `guardian_mobile` (auto-binding `guardian_mobile` if blank on first login, `lines 59-64`) or via MD5 token link `GET /parent/view/{token}` (`routes/web.php:472`, `ParentDashboardController.php:111-121`).

### 5.4.3 States, Approvals & Locking
- **`student_attendance.status`**: `'Present'`, `'Absent'`, `'Duty Leave'` (`AttendanceController.php:420-455`).
- **`lesson_plans.status`**: `'Pending'` $\rightarrow$ `'Completed'` when linked in `saveAttendance` (`AttendanceController.php:475`).
- **`leave_records.status`**: `'Pending'` $\rightarrow$ `'Approved'` / `'Rejected'` by Tutor or HOD (`TutorController.php:462`).
- **`student_special_attendances.status`**: `'Approved'` (`TutorSpecialAttendanceController.php:485`).

### 5.4.4 Database Tables Read / Written
| Table | Operation | Key Columns |
| :--- | :--- | :--- |
| `class_logs_attendance` | R/W | `batch_subject_id`, `date`, `period`, `sub_batch`, `lesson_plan_id`, `topics_covered`, `present_students`, `absent_students`, `recorded_by` (`AttendanceController.php:365-410`) |
| `student_attendance` | R/W | `reg_no`, `subject_code`, `date`, `status`, `sub_batch`, `lesson_plan_id` (`AttendanceController.php:415-465`) |
| `lesson_plans` | R/W | `id`, `batch_subject_id`, `status`, `actual_date`, `actual_hours` (`AttendanceController.php:470-495`) |
| `student_special_attendances` | R/W | `reg_no`, `classroom_id`, `semester`, `date`, `duty_type`, `periods`, `credited_hours`, `reason`, `reference_no`, `approved_by`, `status` (`TutorSpecialAttendanceController.php:470-495`) |
| `student_attendance_relaxations` | R/W | `reg_no`, `classroom_id`, `semester`, `is_granted`, `relaxation_percentage`, `reason`, `granted_by` (`TutorSpecialAttendanceController.php:555-580`) |
| `leave_records` | R/W | `id`, `reg_no`, `leave_date`, `reason`, `status` (`TutorController.php:455-470`) |
| `parent_alert_logs` | R/W | `reg_no`, `tutor_mobile_no`, `alert_type`, `message`, `attendance_percentage` (`TutorController.php:625-645`) |

---

## 5.5 Official SBTE Attendance Import & Override

### 5.5.1 Actors
- **Initiators**:
  - **Subject Staff / HOD**: Uploads official SBTE TEAMS Attendance Statement or Subject Log files (`.pdf`, `.xlsx`, `.xls`, `.csv`, `.html`) for a subject (`routes/web.php:1089-1094`) or overrides subject attendance percentages (`routes/web.php:1058`).
  - **Class Tutor / HOD**: Uploads official SBTE Class-Level Attendance Statement for the batch or overrides class attendance (`routes/web.php:1114-1115`).

### 5.5.2 Step-by-Step Execution Flow
1. **Subject-Level SBTE File Upload & Detection**:
   - `POST /api/classroom/import-sbte-subject-log` $\rightarrow$ `SbteSubjectLogImportController@importPdf` (`routes/web.php:1089`, `app/Http/Controllers/SbteSubjectLogImportController.php:31-202`).
   - Inspects uploaded file extension (`pdf`, `xlsx`, `xls`, `csv`, `html`, `htm`):
     - For spreadsheets/HTML: calls `extractSpreadsheetSessions` (`SbteSubjectLogImportController.php:370-628`) using `PhpOffice\PhpSpreadsheet\IOFactory` or DOM table parsing.
     - For PDFs: extracts text via `Smalot\PdfParser\Parser` (`SbteSubjectLogImportController.php:80-115`).
   - Distinguishes between two SBTE TEAMS document formats:
     - **Format 1: TEAMS Attendance Statement Matrix** (contains date/period columns and `'P'`/`'A'`/`'X'` grid + summary columns) $\rightarrow$ dispatches to `processAttendanceStatement` (`SbteSubjectLogImportController.php:633-1314`).
     - **Format 2: TEAMS Subject Log Vertical Table** (contains `Sl.No`, `Date`, `Period`, `Portion Covered`, `Absentees`) $\rightarrow$ dispatches to `processSubjectLog` & `saveSubjectLogRecords` (`SbteSubjectLogImportController.php:1319-1691`).
2. **Processing TEAMS Attendance Statement (`processAttendanceStatement`, `lines 633-1314`)**:
   - Resolves `BatchSubject` and batch students (`students`), mapping each row by `sbte_reg_no` (`PRN`) or `reg_no` (`lines 650-740`).
   - **Lab Sub-Batch Filtering**: For Practical/Lab subjects, reads `r26_student_lab_batches` or `batch_subjects.lab_batch_cutoff` so that sessions belonging to `Batch 1` or `Batch 2` only count toward students in that sub-batch (`lines 680-720, 880-915`).
   - **Lateral Entry (`LET`) Date-of-Joining Filter**: Skips session dates prior to a `LET` student's `doj` (`lines 803-808, 921-931`).
   - Writes period-by-period rows into `class_logs_attendance` (`lines 1030-1062`) and `student_attendance` (`lines 1069-1118`).
   - **Automatic Attendance Mark Calculation**:
     - For R2021 (`maxAttMarks = 15.0`): uses `AttainmentService::calculateR21AttendanceMark($pct)` (proportional `round(($pct / 100) * 15, 2)` when $\ge 75\%$ or `round(($pct / 100) * 15, 1)` down to $65\%$, else `0`) and updates `practical_evaluations.attendance_marks` for lab subjects (`lines 1137-1255`).
     - For R2026 (`maxAttMarks = 5.0` or `10.0`): applies SBTE Table 2.1 slabs ($\ge 90\% \rightarrow 5$, $\ge 80\% \rightarrow 4$, $\ge 75\% \rightarrow 3$, $\ge 70\% \rightarrow 2$, $\ge 65\% \rightarrow 1$, $< 65\% \rightarrow 0$, scaled by `maxAttMarks / 5.0`) (`lines 1220-1245`).
   - Upserts `subject_official_attendances`:
     - Preserves any manual staff override via `final_percentage = $existing->override_percentage ?? $teamsPct` and `final_mark = $existing->override_mark ?? $attMark` (`lines 1267-1285`).
3. **Lesson Plan Sync from Imported Logs**:
   - `POST /api/classroom/sync-lesson-plan-logs` $\rightarrow$ `SbteSubjectLogImportController@syncFromLessonPlan` (`routes/web.php:1091`, `SbteSubjectLogImportController.php:1696-1845`) and `POST /api/classroom/execute-lesson-plan-sync` $\rightarrow$ `executeLessonPlanSync` (`routes/web.php:1092`, `lines 1850-2057`) align `lesson_plans` dates/statuses with imported `class_logs_attendance` sessions.
4. **Subject Staff Attendance Percentage Override**:
   - `POST /api/classroom/{subjectId}/attendance/override` $\rightarrow$ `ClassroomController@saveAttendanceOverride` (`routes/web.php:1058`, `app/Http/Controllers/ClassroomController.php:2674-2801`).
   - Checks `ConsolidatedCiaApproval::isLockedForSubject($subjectId)` and returns HTTP 403 if locked (`ClassroomController.php:2678-2684`).
   - Upserts `subject_official_attendances` with `override_percentage`, `final_percentage = override_percentage`, `override_mark`, `final_mark`, and `source = 'manual_override'`, and syncs the updated attendance mark to `academic_marks` (`category = 'Attendance'`) or `practical_evaluations.attendance_marks` (`ClassroomController.php:2715-2790`).
5. **Tutor Official Class-Level Attendance Import & Override**:
   - **Upload**: `POST /api/tutor/official-attendance/upload` $\rightarrow$ `SbteSubjectLogImportController@importTutorClassAttendance` (`routes/web.php:1114`, `SbteSubjectLogImportController.php:207-365`) parses multi-subject TEAMS class attendance statements and upserts `tutor_class_attendances` (`classroom_id`, `semester`, `reg_no`, `total_hours`, `attended_hours`, `teams_percentage`, `final_percentage`, `subject_breakdown` JSON, `source = 'teams_upload'`).
   - **Override**: `POST /api/tutor/official-attendance/override` $\rightarrow$ `SbteSubjectLogImportController@overrideTutorClassAttendance` (`routes/web.php:1115`, `SbteSubjectLogImportController.php:325-365`) sets `override_percentage`, `final_percentage`, and `remarks` in `tutor_class_attendances`.

### 5.5.3 States, Approvals & Locking
- **`subject_official_attendances.source`**: `'teams_pdf'`, `'teams_excel'`, `'lesson_plan_sync'`, `'manual_override'` (`SbteSubjectLogImportController.php:1280`, `ClassroomController.php:2745`).
- **Override Precedence**: `final_percentage = COALESCE(override_percentage, teams_percentage)` and `final_mark = COALESCE(override_mark, attendance_mark)` (`SbteSubjectLogImportController.php:1269-1272`).
- **Locking**: Blocked when `ConsolidatedCiaApproval::isLockedForSubject($subjectId)` is `true` (`ClassroomController.php:2678`).

### 5.5.4 Database Tables Read / Written
| Table | Operation | Key Columns |
| :--- | :--- | :--- |
| `subject_official_attendances` | R/W | `batch_subject_id`, `reg_no`, `sbte_reg_no`, `total_hours`, `attended_hours`, `leave_hours`, `duty_hours`, `teams_percentage`, `override_percentage`, `final_percentage`, `max_attendance_marks`, `attendance_mark`, `override_mark`, `final_mark`, `source`, `uploaded_by` (`SbteSubjectLogImportController.php:1267-1285`, `ClassroomController.php:2730-2755`) |
| `tutor_class_attendances` | R/W | `classroom_id`, `semester`, `reg_no`, `total_hours`, `attended_hours`, `duty_leave_hours`, `teams_percentage`, `override_percentage`, `final_percentage`, `subject_breakdown`, `source`, `remarks`, `updated_by` (`SbteSubjectLogImportController.php:285-315, 340-360`) |
| `class_logs_attendance` | R/W | `batch_subject_id`, `date`, `period`, `sub_batch`, `topics_covered`, `present_students`, `absent_students` (`SbteSubjectLogImportController.php:1030-1062, 1610-1645`) |
| `student_attendance` | R/W | `reg_no`, `subject_code`, `date`, `status`, `sub_batch` (`SbteSubjectLogImportController.php:1069-1118`) |
| `practical_evaluations` | R/W | `batch_subject_id`, `reg_no`, `attendance_marks`, `total_cia` (`SbteSubjectLogImportController.php:1137-1196`) |

---

## 5.6 Series Exams, Mark Entry & Online Test Engine

### 5.6.1 Actors
- **Initiators**:
  - **Subject Staff (Lecturer / HOD)**: Configures Series Exams & Formative Assessments, maps questions to Course Outcomes (CO1–CO4), enters/imports student marks, flags absentees, and publishes Online MCQ/Descriptive Tests (`routes/web.php:1012-1062, 1412-1455, 1950-1998`).
- **Participants**:
  - **Students**: Take proctored online exams (`TestEngineController`, `routes/web.php:1412-1445`) and AI-generated self-practice mock tests (`StudentMockTestController`, `routes/web.php:466-468`), or submit assignment uploads (`routes/web.php:1048`).

### 5.6.2 Step-by-Step Execution Flow

#### A. Revision 2021 Theory Series Exams & Formative Assessments (`ClassroomController`)
1. **Assessment Configuration (`test_configs`)**:
   - `POST /api/classroom/{subjectId}/test-config/save` $\rightarrow$ `ClassroomController@saveTestConfig` (`routes/web.php:1022`, `app/Http/Controllers/ClassroomController.php:1135-1225`) saves test structure (`test_name` e.g. `'Series Test 1'`, `'Series Test 2'`, `'Assignment 1'`, `max_marks`, `co_mapping` JSON, `question_structure` JSON) in `test_configs`.
2. **Question-Level CO Mark Entry & Total Mark Sync**:
   - `POST /api/classroom/{subjectId}/marks/save` $\rightarrow$ `ClassroomController@saveMarks` (`routes/web.php:1020`, `app/Http/Controllers/ClassroomController.php:830-1130`).
   - Checks `ConsolidatedCiaApproval::isLockedForSubject($subjectId)` (`ClassroomController.php:836-841`) and per-category lock in `test_configs.is_locked` (`lines 850-865`).
   - Saves question-by-question CO scores (`question_no`, `co_code`, `marks_obtained`, `max_marks`) in `student_question_marks` (`lines 940-985`) and total category marks (`marks_obtained`, `max_marks`, `is_absent`) in `academic_marks` (`lines 900-938`).
   - **Absentee Handling**: When `marks_obtained === 'AB'` or `is_absent == true`, stores `is_absent = true` and `marks_obtained = 0` (`ClassroomController.php:910-925`).
   - **R2021 Theory CIA Formula (50M Total)**:
     - Series Test 1 (20M scaled to 10M) + Series Test 2 (20M scaled to 10M) = **20M**
     - Formative Assessments / Assignments 1, 2, 3 (each out of 10M, sum/avg scaled) = **20M**
     - Attendance (`AttainmentService::calculateR21AttendanceMark` or `subject_official_attendances.final_mark`, scaled to 10M for Theory) = **10M**
     - Total Theory CIA = **50M** (`ConsolidatedCiaReportController.php:720-785`).
3. **Category Locking & Hardcopy Submission Tracking**:
   - `POST /api/classroom/{subjectId}/assessment/toggle-lock` $\rightarrow$ `ClassroomController@toggleAssessmentLock` (`routes/web.php:1050`, `ClassroomController.php:2350-2410`) toggles `is_locked` on `test_configs` / `student_tasks`.
   - `POST /api/classroom/{subjectId}/task/toggle-hardcopy` $\rightarrow$ `ClassroomController@toggleHardcopySubmission` (`routes/web.php:1049`, `ClassroomController.php:2290-2348`) records physical assignment submission status in `student_task_submissions`.

#### B. Revision 2026 Theory Series Exams & Self-Learning (`R26ClassroomController`)
1. **R2026 Theory CIE Structure (40M CIE + 60M ESE = 100M)**:
   - Managed in `R26ClassroomController` (`app/Http/Controllers/R26ClassroomController.php:1-3504`, routes `routes/web.php:1950-1998`).
   - **Attendance (5M)**: Table 2.1 slab (`>=90%` $\rightarrow$ 5, `>=80%` $\rightarrow$ 4, `>=75%` $\rightarrow$ 3, `>=70%` $\rightarrow$ 2, `>=65%` $\rightarrow$ 1, `<65%` $\rightarrow$ 0) (`R26ClassroomController.php:260-285`).
   - **Self-Learning / CA1–CA4 (15M)**: Table 2.2 module-wise micro-tasks (4 modules $\times 10\text{M}$, averaged and scaled to **15M**), saved via `POST /api/r26/classroom/{subjectId}/self-learning/save` $\rightarrow$ `R26ClassroomController@saveSelfLearningMarks` (`routes/web.php:1965`, `R26ClassroomController.php:1120-1245`) into `r26_self_learning_marks` and `academic_marks`.
   - **Series Exams 1 & 2 (20M)**:
     - Series Exam 1 (CO1 + CO2, 50M raw $\rightarrow$ scaled to 10M) and Series Exam 2 (CO3 + CO4, 50M raw $\rightarrow$ scaled to 10M) = **20M**.
     - Saved via `POST /api/r26/classroom/{subjectId}/series-marks/save` $\rightarrow$ `R26ClassroomController@saveSeriesMarks` (`routes/web.php:1968`, `R26ClassroomController.php:1380-1560`) into `r26_series_exam_marks` (`series_no`, `reg_no`, `co_marks` JSON, `part_a_marks`, `part_b_marks`, `part_c_marks`, `total_50`, `scaled_10`, `is_absent`) and synced to `academic_marks`.

#### C. Online Test Engine & Anti-Cheat Proctoring (`TestEngineController`)
1. **Creating & Publishing an Online Test**:
   - `POST /api/test-engine/create` $\rightarrow$ `TestEngineController@createTest` (`routes/web.php:1415`, `app/Http/Controllers/TestEngineController.php:45-165`) creates a `tests` record (`test_id`, `batch_subject_id`, `title`, `test_type`, `duration_minutes`, `max_marks`, `start_time`, `end_time`, `shuffle_questions`, `strict_proctoring`, `status = 'draft'`) and populates `test_questions` (`question_id`, `question_text`, `question_type` `'mcq'`/`'descriptive'`, `options` JSON, `correct_answer`, `marks`, `co_code`, `blooms_level`).
   - `POST /api/test-engine/{testId}/status` $\rightarrow$ `TestEngineController@updateTestStatus` (`routes/web.php:1418`, `TestEngineController.php:210-255`) transitions `tests.status` between `'draft'`, `'published'`, `'active'`, and `'completed'`.
2. **Student Test Attempt, Heartbeat & Malpractice / Violation Auto-Termination**:
   - **Start Attempt**: `POST /api/test-engine/{testId}/start` $\rightarrow$ `TestEngineController@startAttempt` (`routes/web.php:1428`, `TestEngineController.php:490-585`) creates a `test_attempts` row (`attempt_id`, `test_id`, `reg_no`, `started_at = now()`, `status = 'in_progress'`, `violation_count = 0`).
   - **Autosave & Proctoring Violation Logging**: `POST /api/test-engine/attempt/{attemptId}/save-answer` $\rightarrow$ `TestEngineController@saveAnswer` (`routes/web.php:1430`, `TestEngineController.php:590-665`) saves responses in `test_responses`, and `POST /api/test-engine/attempt/{attemptId}/violation` $\rightarrow$ `TestEngineController@logViolation` (`routes/web.php:1432`, `TestEngineController.php:670-735`) increments `test_attempts.violation_count` and appends the violation reason (tab switch, fullscreen exit, window blur, copy/paste) to `violation_logs` JSON.
   - **Malpractice Auto-Lock**: When `violation_count >= 3` (or configured limit), `logViolation` automatically sets `test_attempts.status = 'terminated_malpractice'` (or auto-submits the attempt) and blocks further answer edits (`TestEngineController.php:700-725`).
   - **Submission & Grading**: `POST /api/test-engine/attempt/{attemptId}/submit` $\rightarrow$ `TestEngineController@submitAttempt` (`routes/web.php:1431`, `TestEngineController.php:740-865`) auto-grades MCQs, optionally calls Gemini AI to evaluate descriptive answers (`lines 790-835`), sets `test_attempts.status = 'submitted'`, computes `total_score` and CO-wise breakdown, and syncs scores to `academic_marks` when staff clicks `POST /api/test-engine/{testId}/sync-cia` $\rightarrow$ `TestEngineController@syncScoresToCia` (`routes/web.php:1422`, `lines 340-420`).

#### D. Student AI Mock Tests (`StudentMockTestController`)
- `POST /api/student/mock-test/generate` $\rightarrow$ `StudentMockTestController@generateMockTest` (`routes/web.php:467`, `app/Http/Controllers/StudentMockTestController.php:20-195`) pulls questions from `question_bank` / `r26_question_banks` for the selected subject and module (or generates MCQs via Gemini API if the bank is sparse, `lines 95-165`), and `POST /api/student/mock-test/submit` $\rightarrow$ `submitMockTest` (`routes/web.php:468`, `lines 200-274`) scores the attempt in `student_mock_test_attempts`.

### 5.6.3 States, Approvals & Locking
- **`tests.status`**: `'draft'` $\rightarrow$ `'published'` / `'active'` $\rightarrow$ `'completed'` (`TestEngineController.php:225`).
- **`test_attempts.status`**: `'in_progress'` $\rightarrow$ `'submitted'` / `'completed'` / `'terminated_malpractice'` (`TestEngineController.php:550, 710, 845`).
- **`academic_marks.is_absent`**: `false` (0) $\leftrightarrow$ `true` (1) (`ClassroomController.php:915`).
- **Locking**:
  - Category-level lock: `test_configs.is_locked` (`ClassroomController.php:2350-2410`).
  - Batch-level CIA lock: `ConsolidatedCiaApproval::isLockedForSubject($subjectId)` blocks `saveMarks` (`ClassroomController.php:836`).

### 5.6.4 Database Tables Read / Written
| Table | Operation | Key Columns |
| :--- | :--- | :--- |
| `test_configs` | R/W | `id`, `batch_subject_id`, `classroom_id`, `subject_code`, `test_name`, `max_marks`, `co_mapping`, `question_structure`, `is_locked` (`ClassroomController.php:1135-1225, 2350-2410`) |
| `academic_marks` | R/W | `reg_no`, `subject_code`, `semester`, `category`, `marks_obtained`, `max_marks`, `is_absent`, `recorded_by` (`ClassroomController.php:900-938`) |
| `student_question_marks` | R/W | `batch_subject_id`, `reg_no`, `test_name`, `question_no`, `co_code`, `marks_obtained`, `max_marks` (`ClassroomController.php:940-985`) |
| `r26_self_learning_marks` | R/W | `batch_subject_id`, `reg_no`, `m1_mark`, `m2_mark`, `m3_mark`, `m4_mark`, `total_40`, `scaled_15` (`R26ClassroomController.php:1160-1220`) |
| `r26_series_exam_marks` | R/W | `batch_subject_id`, `series_no`, `reg_no`, `co_marks`, `part_a_marks`, `part_b_marks`, `part_c_marks`, `total_50`, `scaled_10`, `is_absent` (`R26ClassroomController.php:1420-1510`) |
| `tests` | R/W | `test_id`, `batch_subject_id`, `title`, `test_type`, `duration_minutes`, `max_marks`, `start_time`, `end_time`, `strict_proctoring`, `status` (`TestEngineController.php:75-115, 225`) |
| `test_questions` | R/W | `question_id`, `test_id`, `question_text`, `question_type`, `options`, `correct_answer`, `marks`, `co_code`, `blooms_level` (`TestEngineController.php:120-155`) |
| `test_attempts` | R/W | `attempt_id`, `test_id`, `reg_no`, `started_at`, `submitted_at`, `total_score`, `violation_count`, `violation_logs`, `status` (`TestEngineController.php:545-575, 700-725, 840-860`) |
| `test_responses` | R/W | `attempt_id`, `question_id`, `selected_answer`, `marks_awarded`, `ai_feedback` (`TestEngineController.php:620-650, 800-835`) |
| `student_mock_test_attempts` | R/W | `reg_no`, `subject_code`, `module_no`, `score`, `total_questions`, `responses` (`StudentMockTestController.php:220-265`) |

---

## 5.7 Practical, Workshop, Drawing, Seminar, Major Project & Specialized Lab Evaluation

### 5.7.1 Actors
- **Initiators**:
  - **Subject Staff / Lab Instructor / Workshop Instructor / Seminar Guide / Project Coordinator**: Configures experiments/sheets/trades/groups, evaluates daily rubrics, records series practical tests, enters Open-Ended Project marks, and logs End-Semester Examination (ESE) scores (`routes/web.php:1519-1540, 2002-2302`).
- **Viewers**:
  - **Class Tutor / HOD / Principal**: Reviews consolidated CIA registers and prints statutory SBTE valuation sheets.
  - **Students**: View practical experiment scores, lab attendance, and seminar/project milestones.

### 5.7.2 Step-by-Step Execution Flow by Specialized Classroom

#### A. Revision 2021 Practical / Laboratory (`VirtualClassroomPracticalController`)
- **Workspace View**: `GET /classroom/practical/{batchSubjectId}` $\rightarrow$ `VirtualClassroomPracticalController@show` (`routes/web.php:1519`, `app/Http/Controllers/VirtualClassroomPracticalController.php:40-584`).
- **R2021 Practical CIA Breakdown (75M Total + 50M ESE)**:
  1. **Continuous Lab Work (37.5M)**:
     - Evaluated per experiment across 5 rubrics in `practical_experiment_marks` via `POST /classroom/practical/{batchSubjectId}/experiment-marks` $\rightarrow$ `saveExperimentMarks` (`routes/web.php:1522`, `VirtualClassroomPracticalController.php:590-661`):
       - `rough_record` (Max 5.0)
       - `fair_record` (Max 7.5)
       - `prerequisites` / observation (Max 7.5)
       - `work_done` / procedure (Max 7.5)
       - `result` / viva (Max 10.0)
       - Sum = **37.5M** per experiment, averaged across experiments (or directly overridden in `practical_evaluations.lab_work_marks` via `saveStudentCiaSummary`, `lines 824-998`).
  2. **Open-Ended Experiment / Micro-Project (7.5M)**:
     - Saved via `POST /classroom/practical/{batchSubjectId}/open-ended-marks` $\rightarrow$ `saveOpenEndedMarks` (`routes/web.php:1523`, `VirtualClassroomPracticalController.php:667-695`) into `practical_evaluations.micro_project` and `open_ended_topic`.
  3. **Practical Series Tests (15.0M)**:
     - Test 1 (`CO1`) and Test 2 (`CO3`) stored in `practical_tests` and `practical_test_marks` via `POST /classroom/practical/{batchSubjectId}/series-exam-marks` $\rightarrow$ `saveSeriesExamMarks` (`routes/web.php:1524`, `VirtualClassroomPracticalController.php:702-737`), averaged to **15.0M** (`practical_evaluations.test_marks`).
  4. **Lab Attendance (15.0M)**:
     - Computed via `AttainmentService::calculateR21AttendanceMark` from `subject_official_attendances` or `class_logs_attendance` and stored in `practical_evaluations.attendance_marks` (`VirtualClassroomPracticalController.php:315-360, 880-910`).
  5. **Board ESE Marks (50M)**:
     - Stored in `practical_evaluations.board_exam_marks` (`saveStudentCiaSummary`, `VirtualClassroomPracticalController.php:824-998`).
- **Printable Reports**: `printReport` (`lines 1265-1268`), `printSeriesReport` (`lines 1273-1276`), `printFinalResults` (`lines 1281-1284`), `printExperimentsLog` (`lines 1289-1529`).

#### B. Revision 2026 Practical / Laboratory (`R26VirtualClassroomPracticalController`)
- **Workspace View**: `GET /r26/classroom/practical/{batchSubjectId}` $\rightarrow$ `R26VirtualClassroomPracticalController@show` (`routes/web.php:2002`, `app/Http/Controllers/R26VirtualClassroomPracticalController.php:151-396`).
- **Syllabus Parser**: `POST /r26/classroom/practical/{batchSubjectId}/upload-syllabus` $\rightarrow$ `uploadSyllabus` (`routes/web.php:2004`, `R26VirtualClassroomPracticalController.php:401-504`) runs `app/Services/r26_syllabus_parser.py` to populate `r26_practical_course_files`.
- **R2026 Practical CIE Breakdown (60M CIE + 40M ESE = 100M)** (`buildConsolidatedScores`, `R26VirtualClassroomPracticalController.php:60-146`):
  1. **Continuous Experiment Evaluation (30M)**:
     - `POST /r26/classroom/practical/{batchSubjectId}/experiment-marks` $\rightarrow$ `saveExperimentMarks` (`routes/web.php:2005`, `R26VirtualClassroomPracticalController.php:879-911`) saves 6 criteria in `r26_practical_experiment_evaluations`: `prep_punctuality` (10) + `setup_procedure` (10) + `observation_recording` (5) + `analysis_interpretation` (10) + `viva_voce` (10) + `teamwork_discipline` (5) = `total_score_50`, averaged across experiments and scaled to **30M**.
  2. **Open-Ended Project Evaluation (10M)**:
     - `POST /r26/classroom/practical/{batchSubjectId}/open-ended-marks` $\rightarrow$ `saveOpenEndedMarks` (`routes/web.php:2006`, `R26VirtualClassroomPracticalController.php:916-938`) saves 5 criteria in `r26_open_ended_evaluations` (`originality_relevance`, `objectives_plan`, `execution_recording`, `analysis_presentation`, `teamwork_innovation` = `total_score_50`) scaled to **10M**.
  3. **Practical Series Exams 1 & 2 (15M)**:
     - `POST /r26/classroom/practical/{batchSubjectId}/series-exam-marks` $\rightarrow$ `saveSeriesExamMarks` (`routes/web.php:2007`, `R26VirtualClassroomPracticalController.php:943-965`) or `saveSeriesBulkDirect` (`lines 970-1013`) saves 5 rubrics (`writeup_procedure`, `setup_execution`, `observation_result`, `viva_voce`, `record_completion` = 40M per test) in `r26_practical_series_evaluations`, averaged and scaled to **15M**.
  4. **Attendance (5M)**:
     - `computeAttendanceMark` (`R26VirtualClassroomPracticalController.php:47-55`) applies Table 2.1 slabs (`>=90%` $\rightarrow$ 5, `>=80%` $\rightarrow$ 4, `>=75%` $\rightarrow$ 3, `>=70%` $\rightarrow$ 2, `>=65%` $\rightarrow$ 1, `<65%` $\rightarrow$ 0).
  5. **ESE Practical Exam (40M)**:
     - `POST /r26/classroom/practical/{batchSubjectId}/ese-marks` $\rightarrow$ `saveEseMarks` (`routes/web.php:2009`, `R26VirtualClassroomPracticalController.php:1037-1047`) saves `ese_marks` (out of 40, min 16.0 to pass; $<16.0$ forces Grade `'F'`) in `r26_practical_ese_marks`.

#### C. Revision 2026 Practicum (90-Hour Combined Theory + Lab) (`R26VirtualClassroomPracticumController`)
- **Workspace View**: `GET /r26/classroom/practicum/{batchSubjectId}` $\rightarrow$ `R26VirtualClassroomPracticumController@show` (`routes/web.php:2026`, `app/Http/Controllers/R26VirtualClassroomPracticumController.php:45-580`).
- **R2026 Practicum CIA Breakdown (40M CIA)** (`R26VirtualClassroomPracticumController.php:283-522`):
  - **Attendance**: **5M** (Table 2.1 slab).
  - **Self-Learning (CA1)**: **5M** (`academic_marks` category `'Self Study: ...'` across M1..M4 out of 10 $\rightarrow$ scaled to 5M).
  - **Continuous Practical Evaluation**: **10M** (`r26_practicum_experiment_evaluations` out of 50 $\rightarrow$ scaled to 10M).
  - **Theory Series Exams**: **10M** (`r26_practicum_series_theories`, Series 1 [CO1+CO2 = 50] & Series 2 [CO3+CO4 = 50] $\rightarrow$ averaged and scaled to 10M).
  - **Practical Series Exams**: **10M** (`r26_practicum_series_practicals`, S1 [40M] & S2 [40M] $\rightarrow$ averaged and scaled to 10M).
- **ESE (`r26_practicum_ese_marks`)**: Basic Science Practicum = 60M Theory ESE (Total 100M); Program Core Practicum = 60M Theory ESE + 40M Practical ESE = 100M ESE (Total 140M) (`R26VirtualClassroomPracticumController.php:290-335`).

#### D. Revision 2021 Mechanical Workshop (`R21VirtualClassroomWorkshopController`)
- **Workspace View**: `GET /classroom/workshop/{batchSubjectId}` $\rightarrow$ `R21VirtualClassroomWorkshopController@show` (`routes/web.php:2193`, `app/Http/Controllers/R21VirtualClassroomWorkshopController.php:40-191`).
- **Trade Sections & Rotations**:
  - Defines 6 statutory trade sections in `WORKSHOP_SECTIONS` (`R21VirtualClassroomWorkshopController.php:25-32`): `'Machine shop'`, `'Fitting'`, `'Smithy'`, `'Welding'`, `'Sheet metal'`, `'Foundry'`.
  - `POST /classroom/workshop/{batchSubjectId}/batch-setup` $\rightarrow$ `saveBatchSetup` (`routes/web.php:2196`, `R21VirtualClassroomWorkshopController.php:393-433`) splits students into Batch `'1'` (3 trade sections, default Fitting/Smithy/Welding) and Batch `'2'` (3 trade sections, default Machine shop/Sheet metal/Foundry) in `r21_workshop_course_files` and `r21_workshop_student_allocations`.
- **R2021 Workshop CIA Calculation (75M Total)** (`calculateContinuousCia`, `R21VirtualClassroomWorkshopController.php:196-388`):
  1. **Continuous Trade Work (37.5M)**: `POST /classroom/workshop/{batchSubjectId}/work-marks` $\rightarrow$ `saveWorkMarks` (`routes/web.php:2197`, `lines 438-489`) saves `work_1_mark`..`work_4_mark` (4 works for Machine shop, 2 works + Aluminium fabrication `alum_work_mark` for Sheet metal, 2 works for others, each out of 20) in `r21_workshop_work_evaluations`, averaged across the student's 3 allocated sections and scaled to **37.5M**.
  2. **Open-Ended / Rough & Fair Record (7.5M)**: `POST /classroom/workshop/{batchSubjectId}/record-marks` $\rightarrow$ `saveRecordMarks` (`routes/web.php:2198`, `lines 494-545`) saves `rough_record_mark` (10M) and `fair_record_mark` (10M) (plus `alum_rough_record_mark` & `alum_fair_record_mark` for Sheet metal) in `r21_workshop_section_evaluations`, scaled to **7.5M**.
  3. **Trade Tests (15.0M)**: `POST /classroom/workshop/{batchSubjectId}/test-marks` $\rightarrow$ `saveTestMarks` (`routes/web.php:2199`, `lines 550-586`) saves 1 trade test per section out of 15M (`test_mark`, `is_test_absent`), averaged across 3 sections for **15.0M**.
  4. **Attendance (15.0M)**: `POST /classroom/workshop/{batchSubjectId}/attendance` $\rightarrow$ `saveAttendance` (`routes/web.php:2201`, `lines 671-711`) saves `r21_workshop_attendance_evaluations`.
  5. **Fast CIA Override**: `POST /classroom/workshop/{batchSubjectId}/fast-cia` $\rightarrow$ `saveFastCia` (`routes/web.php:2200`, `lines 591-666`) writes direct overrides to `r21_workshop_cia_summaries` and syncs to `student_semester_marks`.

#### E. Revision 2021 & Revision 2026 Engineering / Building Drawing
- **R2021 Drawing (`R21VirtualClassroomDrawingController`, `app/Http/Controllers/R21VirtualClassroomDrawingController.php:1-800`, routes `routes/web.php:2158-2189`)**:
  - Exception: Subject `AU 3055` (Automobile Engineering Drawing) is redirected to the Theory classroom (`R21VirtualClassroomDrawingController.php:41-44`).
  - **Total = 75M CIA + 50M ESE = 125M**:
    1. **Drawing Sheets (37.5M)**: `saveSheetMarks` (`lines 545-595`) saves `timely_completion` (50) + `appearance_organization` (50) = `total_score_100` in `r21_drawing_sheet_evaluations`, averaged and scaled to **37.5M**.
    2. **Open-Ended Evaluation (7.5M)**: Stored in `practical_evaluations.micro_project` (`saveFastCiaRegister`, `lines 344-453`).
    3. **Series Tests 1 & 2 (15.0M)**: `saveSeriesTestMarks` (`lines 600-648`) or `saveSeriesFast` (`lines 458-520`) saves 4 drafting rubrics (`procedure_drawing` 40 + `final_drawing` 30 + `dimensioning` 20 + `neatness` 10 = 100) in `r21_drawing_series_tests`, scaled to **15.0M**.
    4. **Attendance (15.0M)**: Stored in `r21_drawing_attendance_evaluations` (`saveAttendanceMarks`, `lines 653-715`).
    5. **ESE (50.0M)**: Stored in `practical_evaluations.board_exam_marks`.
- **R2026 Engineering Graphics / Drawing (`R26VirtualClassroomDrawingController`, `app/Http/Controllers/R26VirtualClassroomDrawingController.php:1-800`, routes `routes/web.php:2079-2114`)**:
  - Parses syllabus via `app/Services/r26_drawing_syllabus_parser.py` into `r26_drawing_course_files` (`uploadSyllabus`, `lines 463-545`).
  - Consolidated evaluation in `r26_drawing_evaluations` (`saveConsolidatedMarks`, `lines 552-715`): Attendance (**5M**) + Self-Learning CA1..CA4 (`ca1_15`..`ca4_15` averaged out of **15M**) + Series Exams (`series_1_co1_20` + `series_1_co2_20` = 40M $\rightarrow$ 20M; `series_2_co3_20` + `series_2_co4_20` = 40M $\rightarrow$ 20M; averaged to **20M**) = **40M CIE** + `ese_mark_60` (**60M ESE**) = **100M** (alongside granular slot/CAD/OEE tables `r26_drawing_slot_evaluations`, `r26_drawing_practical_tests`, `r26_drawing_oee_evaluations`, `r26_drawing_ese_marks`).

#### F. Revision 2021 Seminar (`R21VirtualClassroomSeminarController`) & Major Project (`R21VirtualClassroomMajorProjectController`)
- **R2021 Seminar (`app/Http/Controllers/R21VirtualClassroomSeminarController.php:1-800`, routes `routes/web.php:2226-2246`)**:
  - **75M CIA Only (No ESE, Clause 11.2.6)**: Topics and guides registered in `student_seminar_registrations`. Evaluated by multiple assessors (Guide + Review Committee) in `seminar_evaluations` (`saveEvaluation`, `lines 372-631`; `saveBatchEvaluations`, `lines 636-777`): `relevance` (7.5M) + `literature` (7.5M) + `presentation` (37.5M) + `interaction` (7.5M) + `report` (7.5M) = 67.5M averaged across assessors + `attendance` (7.5M) = **75M**, synced to `academic_marks` (`category = 'Seminar'`).
- **R2021 Major Project (`app/Http/Controllers/R21VirtualClassroomMajorProjectController.php:1-800`, routes `routes/web.php:2249-2277`)**:
  - **75M CIA + 50M ESE = 125M**: Groups configured in `r21_major_project_course_files.project_groups` (`saveGroups`, `lines 253-293`).
  - Evaluations saved in `r21_major_project_evaluations` (`saveEvaluation`, `lines 298-458`; `saveGroupCia`, `lines 598-678`; `saveGroupEse`, `lines 496-593`):
    - **CIA (75M)**: `formative_diary_marks` (30M) + `summative_dept_marks` (30M) + `attendance_marks` (15M) = `total_cia_75` (min 30.0 to pass).
    - **ESE (50M)**: Joint evaluation by Internal & External Examiners across 8 rubrics (`ese_prototype` 10 + `ese_modern_tools` 5 + `ese_presentation` 7.5 + `ese_innovativeness` 2.5 + `ese_viva` 7.5 + `ese_individual_contrib` 7.5 + `ese_group_activity` 5 + `ese_project_report` 5 = `total_ese_50`, min 20.0 to pass).

#### G. R2026 English for Communication (`1001`) & Health & Physical Education (`1009`)
- **English (`R26VirtualClassroomEnglishController`, `app/Http/Controllers/R26VirtualClassroomEnglishController.php:1-800`, routes `routes/web.php:2117-2154`)**: Saves in `r26_english_evaluations` (`saveConsolidatedMarks`, `lines 397-620`): Attendance (5M) + Self-Learning (`sl_m1_10`..`sl_m4_10` $\rightarrow$ 5M) + CE (`ce_m1_50` $\rightarrow$ 10M) + Practical Tests (`prac_test1_40`, `prac_test2_40` $\rightarrow$ 10M) + Series Exams (`series1_50`, `series2_50` $\rightarrow$ 10M) = **40M CIA** + **60M Internal Lab ESE**.
- **Health & Physical Education (`R26VirtualClassroomHealthPhysicalController`, `app/Http/Controllers/R26VirtualClassroomHealthPhysicalController.php:1-800`, routes `routes/web.php:2280-2302`)**: Saves in `r26_health_physical_evaluations` (5 dynamic criteria out of 50 $\rightarrow$ 30M), `r26_health_physical_fitness_tests` (CA1 & CA2 out of 40 $\rightarrow$ 15M), Attendance (5M), and Logbook (10M) = **60M CIE** + `r26_health_physical_ese_marks` (**40M ESE**).

### 5.7.3 States, Approvals & Locking
- **Batch CIA Lock Enforcement**: Every mark-saving endpoint across `VirtualClassroomPracticalController`, `R21VirtualClassroomWorkshopController`, `R21VirtualClassroomDrawingController`, `R21VirtualClassroomSeminarController`, and `R21VirtualClassroomMajorProjectController` checks `ConsolidatedCiaApproval::isLockedForSubject($batchSubjectId)` and aborts with HTTP 403 when locked (`VirtualClassroomPracticalController.php:592, 669, 704, 826`).

### 5.7.4 Database Tables Read / Written
| Table | Operation | Key Columns |
| :--- | :--- | :--- |
| `practical_evaluations` | R/W | `batch_subject_id`, `reg_no`, `lab_work_marks`, `micro_project`, `open_ended_topic`, `test_marks`, `attendance_marks`, `total_cia`, `board_exam_marks` (`VirtualClassroomPracticalController.php:675-690, 845-960`) |
| `practical_experiment_marks` | R/W | `batch_subject_id`, `experiment_no`, `reg_no`, `rough_record`, `fair_record`, `prerequisites`, `work_done`, `result`, `total_mark`, `is_absent` (`VirtualClassroomPracticalController.php:610-650`) |
| `practical_tests` / `practical_test_marks` | R/W | `batch_subject_id`, `test_no`, `reg_no`, `marks_obtained`, `is_absent` (`VirtualClassroomPracticalController.php:710-732`) |
| `r26_practical_experiment_evaluations` | R/W | `batch_subject_id`, `experiment_no`, `reg_no`, `prep_punctuality`, `setup_procedure`, `observation_recording`, `analysis_interpretation`, `viva_voce`, `teamwork_discipline`, `total_score_50` (`R26VirtualClassroomPracticalController.php:885-906`) |
| `r26_open_ended_evaluations` | R/W | `batch_subject_id`, `reg_no`, `originality_relevance`, `objectives_plan`, `execution_recording`, `analysis_presentation`, `teamwork_innovation`, `total_score_50` (`R26VirtualClassroomPracticalController.php:920-935`) |
| `r26_practical_series_evaluations` / `r26_practical_ese_marks` | R/W | `batch_subject_id`, `series_no`, `reg_no`, `total_score_40`, `ese_marks`, `ese_grade` (`R26VirtualClassroomPracticalController.php:950-1010, 1040-1046`) |
| `r21_workshop_work_evaluations` / `r21_workshop_section_evaluations` / `r21_workshop_cia_summaries` | R/W | `batch_subject_id`, `reg_no`, `section_name`, `work_1_mark`..`work_4_mark`, `alum_work_mark`, `rough_record_mark`, `fair_record_mark`, `test_mark`, `override_total_cia` (`R21VirtualClassroomWorkshopController.php:445-660`) |
| `r21_drawing_sheet_evaluations` / `r21_drawing_series_tests` / `r26_drawing_evaluations` | R/W | `batch_subject_id`, `reg_no`, `sheet_no`, `timely_completion`, `appearance_organization`, `total_score_100`, `ca1_15`..`ca4_15`, `series_1_co1_20`..`series_2_co4_20`, `total_cie_40`, `ese_mark_60` (`R21VirtualClassroomDrawingController.php:550-645`, `R26VirtualClassroomDrawingController.php:560-710`) |
| `seminar_evaluations` | R/W | `batch_subject_id`, `reg_no`, `assessor_role`, `relevance`, `literature`, `presentation`, `interaction`, `report`, `attendance`, `total_marks` (`R21VirtualClassroomSeminarController.php:400-625`) |
| `r21_major_project_evaluations` | R/W | `batch_subject_id`, `reg_no`, `formative_diary_marks`, `summative_dept_marks`, `attendance_marks`, `total_cia_75`, `ese_prototype`..`ese_project_report`, `total_ese_50`, `grand_total_125` (`R21VirtualClassroomMajorProjectController.php:310-675`) |

---

## 5.8 CIA Consolidation & Multi-Tier Approval

### 5.8.1 Actors
- **Subject Staff**: Enters and verifies subject-level formative, series, attendance, and lab marks (`routes/web.php:1020, 1522, 2005`).
- **Class Tutor**: Reviews the batch-wide Consolidated CIA Broadsheet across all subjects and submits it to the HOD (`POST /api/cia/consolidated-report/submit-to-hod`, `routes/web.php:1120`).
- **HOD / Principal / Admin / Super_Admin**: Audits, approves, and locks (or unlocks) the batch's Consolidated CIA report (`POST /api/cia/consolidated-report/toggle-lock`, `routes/web.php:1119`).

### 5.8.2 Step-by-Step Execution Flow
1. **Generating the Consolidated CIA Broadsheet**:
   - `GET /api/cia/consolidated-report` $\rightarrow$ `ConsolidatedCiaReportController@getConsolidatedCiaData` (`routes/web.php:1117`, `app/Http/Controllers/ConsolidatedCiaReportController.php:95-668`).
   - Resolves the batch (`class_management` or `r26_class_management`), active `semester`, and all `batch_subjects` ordered by priority: Theory (`1`) $\rightarrow$ Practical/Lab/Practicum (`2`) $\rightarrow$ Drawing (`3`) $\rightarrow$ Seminar (`4`) $\rightarrow$ Major Project (`5`) (`ConsolidatedCiaReportController.php:165-235`).
   - For each subject and student, invokes `calculateSubjectCia` (`ConsolidatedCiaReportController.php:704-1015`) to compute live component breakdowns and total CIA marks (`50M` for R21 Theory, `75M` for R21 Practical/Workshop/Drawing/Seminar/Major Project, `40M` for R26 Theory/Practicum/Drawing/English, `60M` for R26 Practical/Health & Physical).
   - Automatically synchronizes computed totals into `student_semester_marks` via `syncToSemesterMarksTable` (`ConsolidatedCiaReportController.php:1020-1041`).
   - Computes batch-wide attendance percentage and condonation status (`Eligible`, `Condonation`, `FE / Detained`) from `tutor_class_attendances` or aggregated subject logs + `student_special_attendances` (`ConsolidatedCiaReportController.php:544-580`).
2. **Class Tutor Verification & Submission to HOD**:
   - `POST /api/cia/consolidated-report/submit-to-hod` $\rightarrow$ `ConsolidatedCiaReportController@submitToHod` (`routes/web.php:1120`, `ConsolidatedCiaReportController.php:1106-1142`).
   - Verifies that the report is not already locked (`$approval->is_locked`), then updates `consolidated_cia_approvals` with `submitted_by_tutor = true`, `tutor_user_id`, `tutor_name`, and `submitted_at = now()` (`lines 1118-1135`).
3. **HOD / Principal Approval & Locking (or Unlocking)**:
   - `POST /api/cia/consolidated-report/toggle-lock` $\rightarrow$ `ConsolidatedCiaReportController@toggleLock` (`routes/web.php:1119`, `ConsolidatedCiaReportController.php:1046-1101`).
   - Restricted to roles `['HOD', 'Principal', 'Admin', 'Super_Admin']` (`lines 1052-1057`).
   - When `action === 'lock'` (or `'approve'`): sets `is_locked = true`, `approved_by_hod = true`, `hod_user_id`, `hod_name`, `approved_at = now()`, and `remarks` (`lines 1068-1082`).
   - When `action === 'unlock'`: sets `is_locked = false`, `approved_by_hod = false`, and `approved_at = null`, reopening mark entry for subject staff (`lines 1083-1090`).
4. **Print Broadsheet**:
   - `GET /cia/consolidated-report/print` $\rightarrow$ `ConsolidatedCiaReportController@printConsolidatedCia` (`routes/web.php:1118`, `ConsolidatedCiaReportController.php:673-699`) renders `consolidated_cia_print`.

### 5.8.3 States, Transitions & Lock Enforcement
- **`consolidated_cia_approvals` State Machine**:
  1. **Draft / Open**: `submitted_by_tutor = false`, `approved_by_hod = false`, `is_locked = false`.
  2. **Submitted to HOD**: `submitted_by_tutor = true`, `submitted_at != null`, `is_locked = false` (`ConsolidatedCiaReportController.php:1125-1132`).
  3. **Approved & Locked**: `approved_by_hod = true`, `approved_at != null`, `is_locked = true` (`ConsolidatedCiaReportController.php:1072-1081`).
  4. **Unlocked (Re-opened)**: `approved_by_hod = false`, `approved_at = null`, `is_locked = false` (`ConsolidatedCiaReportController.php:1084-1089`).
- **System-Wide Lock Guard**: `ConsolidatedCiaApproval::isLockedForSubject($batchSubjectId)` (`app/Models/ConsolidatedCiaApproval.php:51-56`) resolves the `BatchSubject`'s `classroom_id` and `semester` and checks `consolidated_cia_approvals.is_locked`. When `true`, all mark mutation endpoints across Theory, Practical, Workshop, Drawing, Seminar, and Major Project controllers reject edits with HTTP 403.

### 5.8.4 Database Tables Read / Written
| Table | Operation | Key Columns |
| :--- | :--- | :--- |
| `consolidated_cia_approvals` | R/W | `classroom_id`, `semester`, `is_locked`, `submitted_by_tutor`, `tutor_user_id`, `tutor_name`, `submitted_at`, `approved_by_hod`, `hod_user_id`, `hod_name`, `approved_at`, `remarks` (`app/Models/ConsolidatedCiaApproval.php:13-38`, `ConsolidatedCiaReportController.php:1065-1135`) |
| `student_semester_marks` | R/W | `reg_no`, `classroom_id`, `semester`, `subject_code`, `cia_marks`, `max_cia_marks`, `attendance_percentage`, `is_eligible` (`ConsolidatedCiaReportController.php:1020-1041`) |

---

## 5.9 Question Paper Generation, Question Bank & AI Usage

### 5.9.1 Actors
- **Initiators**:
  - **Subject Staff (Lecturer / HOD)**: Uploads syllabus PDFs, generates AI-assisted Lesson Plans, Question Bank items, Series Exam Question Papers, Answer Keys, and Valuation Schemes, or manually curates questions mapped to Course Outcomes (COs) and Revised Bloom's Taxonomy (RBT) levels (`routes/web.php:1015-1046, 1955-1988`).

### 5.9.2 Step-by-Step Execution Flow

#### A. Revision 2021 Question Bank, Series QP & AI Generation (`ClassroomController`)
1. **Question Bank CRUD (`question_bank`)**:
   - `GET /api/classroom/{subjectId}/question-bank` $\rightarrow$ `ClassroomController@getQuestionBank` (`routes/web.php:1032`, `app/Http/Controllers/ClassroomController.php:1540-1595`) and `POST /api/classroom/{subjectId}/question-bank/save` $\rightarrow$ `saveQuestionBank` (`routes/web.php:1033`, `lines 1600-1685`) manage questions in `question_bank` (`batch_subject_id`, `subject_code`, `module_no`, `co_code`, `blooms_level` `L1..L6` / `R,U,A`, `question_type`, `marks`, `question_text`, `options` JSON, `answer_key`, `diagram_url`).
2. **AI Question Bank & Lesson Plan Generation (Google Gemini API)**:
   - **AI Lesson Planner**: `POST /api/classroom/{subjectId}/lesson-plan/ai-generate` $\rightarrow$ `ClassroomController@generateAiLessonPlan` (`routes/web.php:1017`, `ClassroomController.php:580-740`) sends syllabus module content to Google Gemini (`generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`) and populates `lesson_plans`.
   - **AI Question Generator**: `POST /api/classroom/{subjectId}/question-bank/ai-generate` $\rightarrow$ `ClassroomController@generateAiQuestions` (`routes/web.php:1035`, `ClassroomController.php:1730-1890`) constructs a structured prompt specifying `subject_name`, `module_no`, `co_code`, `blooms_level` (Remembering `R`, Understanding `U`, Applying `A`), and mark weightages (`1M`, `3M`, `7M`), parses the JSON response from Gemini, and inserts rows into `question_bank`.
3. **Series Exam Question Paper, Answer Key & Valuation Scheme**:
   - `POST /api/classroom/{subjectId}/question-paper/save` $\rightarrow$ `ClassroomController@saveQuestionPaper` (`routes/web.php:1036`, `ClassroomController.php:1895-2040`) saves structured series exam papers (Part A: $5 \times 1 = 5\text{M}$, Part B: $3 \times 3 = 9\text{M}$, Part C: $1 \times 6 = 6\text{M}$ or $20\text{M}$ / $40\text{M}$ templates) with CO tags, RBT cognitive levels, and `answer_key` / `scheme_of_valuation` into `test_configs` / `series_question_papers`.
   - **AI Answer Key & Scheme Generator**: `POST /api/classroom/{subjectId}/question-paper/ai-answer-key` $\rightarrow$ `ClassroomController@generateAiAnswerKey` (`routes/web.php:1038`, `ClassroomController.php:2045-2165`) prompts Gemini to generate step-by-step marking schemes and model answers for each question on the paper.
   - **Printable QP & Scheme Views**: `GET /classroom/{subjectId}/question-paper/{testId}/print` (`routes/web.php:1039`, `ClassroomController.php:2170-2230`) renders `series_question_paper_print` and `series_answer_key_print`.

#### B. Revision 2026 Question Bank & Statutory 50-Mark Series QP (`R26ClassroomController`)
1. **R2026 Question Bank (`r26_question_banks`)**:
   - `POST /api/r26/classroom/{subjectId}/question-bank/save` $\rightarrow$ `R26ClassroomController@saveQuestionBankItem` (`routes/web.php:1972`, `app/Http/Controllers/R26ClassroomController.php:1780-1890`) and `POST /api/r26/classroom/{subjectId}/question-bank/ai-generate` $\rightarrow$ `aiGenerateQuestions` (`routes/web.php:1974`, `lines 1930-2110`) store questions in `r26_question_banks` with `module_no` (`1..4`), `co_code` (`CO1..CO4`), `blooms_level` (`R`, `U`, `A`), `mark_category` (`1`, `3`, `7`), `question_text`, and `answer_key`.
2. **R2026 Statutory 50-Mark Series Exam QP (`r26_series_exam_qps`)**:
   - `POST /api/r26/classroom/{subjectId}/series-qp/save` $\rightarrow$ `R26ClassroomController@saveSeriesQp` (`routes/web.php:1976`, `R26ClassroomController.php:2120-2310`) and `POST /api/r26/classroom/{subjectId}/series-qp/auto-generate` $\rightarrow$ `autoGenerateSeriesQp` (`routes/web.php:1977`, `lines 2315-2520`):
     - Enforces the SBTE R2026 50-mark blueprint (`duration = 2 Hours`, `max_marks = 50`):
       - **Part A**: 9 short questions $\times 1\text{ Mark} = 9\text{ Marks}$ (`Q1`–`Q9`).
       - **Part B**: Answer any 9 out of 11 questions $\times 3\text{ Marks} = 27\text{ Marks}$ (`Q10`–`Q20`).
       - **Part C**: 2 Either/Or pairs $\times 7\text{ Marks} = 14\text{ Marks}$ (`Q21A/B`, `Q22A/B`).
     - Series 1 maps to `CO1` & `CO2` (Modules 1 & 2); Series 2 maps to `CO3` & `CO4` (Modules 3 & 4).
     - Stores `questions_json`, `answer_key_json`, `blooms_distribution`, `co_distribution`, and `status` (`'Draft'` / `'Finalized'`) in `r26_series_exam_qps`.
   - **Print QP & Scheme**: `GET /r26/classroom/{subjectId}/series-qp/{seriesNo}/print` $\rightarrow$ `R26ClassroomController@printSeriesQp` (`routes/web.php:1979`, `lines 2525-2590`) renders `r26_series_qp_print`.

### 5.9.3 States, Approvals & Locking
- **AI Feature Kill-Switch**: `system_settings` key `gemini_ai_active` (`'1'` vs `'0'`/`'false'`) controls whether Gemini AI generation is enabled across classrooms and Carmie (`CarmieAssistantController.php:51-54`).
- **`r26_series_exam_qps.status`**: `'Draft'` $\rightarrow$ `'Finalized'` (`R26ClassroomController.php:2285`).

### 5.9.4 Database Tables Read / Written
| Table | Operation | Key Columns |
| :--- | :--- | :--- |
| `question_bank` | R/W | `id`, `batch_subject_id`, `subject_code`, `module_no`, `co_code`, `blooms_level`, `question_type`, `marks`, `question_text`, `options`, `answer_key`, `diagram_url` (`ClassroomController.php:1600-1685`) |
| `r26_question_banks` | R/W | `id`, `batch_subject_id`, `subject_code`, `module_no`, `co_code`, `blooms_level`, `mark_category`, `question_text`, `answer_key`, `diagram_path` (`R26ClassroomController.php:1780-1890`) |
| `r26_series_exam_qps` | R/W | `id`, `batch_subject_id`, `series_no`, `exam_date`, `duration_hours`, `max_marks`, `questions_json`, `answer_key_json`, `co_distribution`, `blooms_distribution`, `status` (`R26ClassroomController.php:2120-2310`) |

---

## 5.10 Course File / NBA Documents, Surveys & CO-PO Attainment

### 5.10.1 Actors
- **Initiators**:
  - **Subject Staff (Lecturer / Lab Instructor)**: Compiles the 25-point NBA Course File checklist, launches Mid-Semester and Course Exit Surveys, configures CO-PO/PSO correlation matrices, and generates PDF Course File dossiers (`routes/web.php:964-974, 1066-1080, 1985-1995`).
  - **HOD / Program Coordinator**: Configures cohort-level PO/PSO targets, enters indirect survey metrics, records NBA Criterion 3 action plans, and prints Program Attainment reports (`routes/web.php:821-823`).
- **Participants**:
  - **Students**: Submit online Mid-Semester Feedback and Course Exit Survey ratings (`routes/web.php:1070-1071, 1078-1079`).

### 5.10.2 Step-by-Step Execution Flow

#### A. 25-Document NBA Course File Compilation (`CourseFileController` & `R26ClassroomController`)
1. **Revision 2021 Course File (`CourseFileController`, `app/Http/Controllers/CourseFileController.php:1-958`, routes `routes/web.php:964-974`)**:
   - `GET /course-file/{batchSubjectId}` $\rightarrow$ `CourseFileController@show` (`routes/web.php:964`, `CourseFileController.php:26-143`) auto-initializes `cf_course_files` (`status = 'Draft'`), section tables (`cf_section_a_planning`, `cf_section_b_materials`, `cf_section_c_assessments`, `cf_section_d_attainments`), and all 25 rows (`document_number` `1..25`) in `cf_course_file_documents` (`initializeChecklistDocuments`, `lines 301-334`).
   - **Saving Sections & Checklist Items**: `POST /course-file/{courseFileId}/save-section` $\rightarrow$ `saveSection` (`routes/web.php:965`, `lines 145-194`), `POST /course-file/{courseFileId}/save-document` $\rightarrow$ `saveDocument` (`routes/web.php:967`, `lines 336-380`), and `POST /course-file/{courseFileId}/upload-cis-pdf` $\rightarrow$ `uploadCisPdf` (`routes/web.php:969`, `lines 412-440`).
   - **Live Document Previews**: `GET /course-file/{courseFileId}/document/{docNumber}/preview` $\rightarrow$ `previewDocument` (`routes/web.php:968`, `lines 228-299`) dynamically synthesizes printable HTML documents from live database tables for Doc 3 (Course Syllabus), Doc 4 (Course Plan), Doc 5 (Timetable), Doc 6 (Student Roll List), Doc 8 (Assignment Questions), Doc 11 & 12 (Series QPs & Keys), Doc 14 (Attendance Log), Doc 15 (CIA Marksheet), Doc 16 (Remedial Records), and Doc 18 (CO-PO Attainment).
   - **Auto-Compliance Check**: `ClassroomController@getCourseFileCompliance` (`app/Http/Controllers/ClassroomController.php:5839-6120`) inspects live tables (`lesson_plans`, `class_logs_attendance`, `test_configs`, `academic_marks`, `course_exit_surveys`, `remedial_rooms`) to compute real-time completion percentages for each of the 25 documents.
   - **DomPDF Compilation**: `GET /course-file/{courseFileId}/generate-pdf` $\rightarrow$ `CourseFileController@generatePdf` (`routes/web.php:966`, `CourseFileController.php:196-226`) renders `course_file.pdf_template` via `Barryvdh\DomPDF\Facade\Pdf`, stores the PDF in `storage/app/public/course_files/CF_{id}.pdf`, updates `cf_course_files.generated_pdf_path` and `status = 'Complete'`, and streams the download.
2. **Revision 2026 Course File (`R26ClassroomController` & `R26VirtualClassroomPracticalController`)**:
   - `GET /r26/classroom/{subjectId}/course-file` $\rightarrow$ `R26ClassroomController@viewCourseFile` (`routes/web.php:1985`, `app/Http/Controllers/R26ClassroomController.php:3210-3285`) and `POST /api/r26/classroom/{subjectId}/course-file/save-doc` $\rightarrow$ `saveCourseFileDoc` (`routes/web.php:1986`, `lines 3287-3318`) manage `r26_course_files` and `r26_course_file_documents` (`document_number` `1..25`, `is_checked`, `content_json`, `attachment_path`).
   - When all 25 documents have `is_checked == true`, `r26_course_files.status` automatically transitions from `'Draft'` to `'Complete'` (`R26ClassroomController.php:3305-3310`).

#### B. Mid-Semester Feedback Survey (`MidSemSurveyController`)
- **Initiation**: `POST /api/classroom/{subjectId}/survey/initiate` $\rightarrow$ `MidSemSurveyController@initiateSurvey` (`routes/web.php:1066`, `app/Http/Controllers/MidSemSurveyController.php:19-59`) creates `mid_semester_surveys` with `status = 'Active'` and `initiated_at = now()`.
- **Student Submission**: `GET /student/survey/{surveyId}` $\rightarrow$ `studentViewSurvey` (`routes/web.php:1070`, `lines 232-276`) and `POST /api/student/survey/submit` $\rightarrow$ `studentSubmitSurvey` (`routes/web.php:1071`, `lines 281-352`) record 1–3 scale ratings across 9 structured pedagogical items (`q5_co_communication`..`q13_branch_specific`) plus open-ended feedback (`q17_difficult_topics`, `q18_suggestions`) in `student_survey_responses`.
- **Closure & Action Taken**: `POST /api/classroom/{subjectId}/survey/close` $\rightarrow$ `closeSurvey` (`routes/web.php:1067`, `lines 64-88`) sets `status = 'Completed'`, `closed_at = now()`; `POST /api/classroom/{subjectId}/survey/notes` $\rightarrow$ `saveNotes` (`routes/web.php:1069`, `lines 185-227`) saves `improvements_noted`, `action_taken`, `action_taken_by_tutor`, and `action_taken_by_hod`.

#### C. Course Exit Survey (`CourseExitSurveyController`)
- **Initiation**: `POST /api/classroom/{subjectId}/exit-survey/initiate` $\rightarrow$ `CourseExitSurveyController@initiateSurvey` (`routes/web.php:1075`, `app/Http/Controllers/CourseExitSurveyController.php:24-63`) creates `course_exit_surveys` (`status = 'Active'`).
- **Student Submission**: `POST /api/student/exit-survey/submit` $\rightarrow$ `studentSubmitSurvey` (`routes/web.php:1079`, `lines 243-303`) saves 10 CO attainment ratings (`co1_q1`..`co_overall_q10`, scale 1–3) in `student_course_exit_responses`.
- **Indirect CO Attainment Calculation**: `GET /api/classroom/{subjectId}/exit-survey/results` $\rightarrow$ `getSurveyResults` (`routes/web.php:1077`, `lines 96-197`) calculates the percentage of students rating $\ge 2$ (or mean score on 3-point scale) per CO to feed the 20% Indirect Attainment component.

#### D. CO-PO/PSO Course & Cohort Program Attainment (`AttainmentService` & `ProgramAttainmentController`)
1. **Mathematical Formulas in `AttainmentService` (`app/Services/AttainmentService.php:1-405`)**:
   - **Threshold Attainment Level (`calculateAttainmentLevel`, `lines 92-122`)**: Computes `% of students scoring >= target threshold` (e.g. 50% or 60% of max marks) and maps to NBA levels:
     - $\ge 70\%$ of students reaching threshold $\rightarrow$ **Level 3.0**
     - $\ge 60\%$ $\rightarrow$ **Level 2.0**
     - $\ge 50\%$ $\rightarrow$ **Level 1.0**
     - $< 50\%$ $\rightarrow$ **Level 0.0**
   - **Direct CO Attainment (`calculateDirectAttainment`, `line 134`)**:
     $$\text{Direct CO} = (0.30 \times \text{CIA Level}) + (0.70 \times \text{ESE Level})$$
     *(or $0.40 \times \text{CIA} + 0.60 \times \text{ESE}$ where configured in R26)*.
   - **Overall CO Attainment (`calculateOverallAttainment`, `line 143`)**:
     $$\text{Overall CO} = (0.80 \times \text{Direct CO}) + (0.20 \times \text{Indirect Exit Survey Level})$$
   - **Course PO/PSO Contribution (`calculateCoursePoContribution`, `lines 332-361`)**:
     $$\text{PO}_k = \frac{\sum_{i=1}^{4} (\text{Overall CO}_i \times \text{Mapping Weight}_{i,k})}{\sum_{i=1}^{4} \text{Mapping Weight}_{i,k}}$$
2. **Cohort-Level Program Attainment (`ProgramAttainmentController`, `app/Http/Controllers/ProgramAttainmentController.php:1-254`, routes `routes/web.php:821-823`)**:
   - `GET /hod/program-attainment/{classroomId}` $\rightarrow$ `ProgramAttainmentController@index` (`routes/web.php:821`, `lines 20-128`) aggregates PO1–PO7 and PSO1–PSO3 contributions across all 6 semesters for the cohort (`calculateProgramDirectAttainment`, `AttainmentService.php:366-385`).
   - `POST /hod/program-attainment/{classroomId}/save` $\rightarrow$ `saveConfig` (`routes/web.php:822`, `ProgramAttainmentController.php:133-179`) saves `po_targets` JSON, `indirect_surveys` JSON (Program Exit, Alumni, Employer surveys), `action_plans` JSON, and `status` in `program_attainments`.
   - Computes Final Program Attainment = $0.80 \times \text{Direct Cohort PO} + 0.20 \times \text{Indirect Program Survey}$ (`AttainmentService::calculateProgramFinalAttainment`, `lines 390-404`) and flags gap analysis (`achieved >= target`).

### 5.10.3 States, Approvals & Locking
- **`cf_course_files.status` / `r26_course_files.status`**: `'Draft'` $\rightarrow$ `'Complete'` (`CourseFileController.php:215`, `R26ClassroomController.php:3308`).
- **`mid_semester_surveys.status` / `course_exit_surveys.status`**: `'Active'` $\rightarrow$ `'Completed'` (`MidSemSurveyController.php:78`, `CourseExitSurveyController.php:81`).
- **`program_attainments.status`**: `'Draft'` $\rightarrow$ `'Finalized'` (`ProgramAttainmentController.php:167`).

### 5.10.4 Database Tables Read / Written
| Table | Operation | Key Columns |
| :--- | :--- | :--- |
| `cf_course_files` / `cf_course_file_documents` | R/W | `batch_subject_id`, `status`, `generated_pdf_path`, `document_number`, `title`, `is_checked`, `data_payload` (`CourseFileController.php:40-100, 210-220, 336-380`) |
| `r26_course_files` / `r26_course_file_documents` | R/W | `batch_subject_id`, `status`, `document_number`, `is_checked`, `content_json`, `attachment_path` (`R26ClassroomController.php:3210-3350`) |
| `mid_semester_surveys` / `student_survey_responses` | R/W | `batch_subject_id`, `status`, `improvements_noted`, `action_taken`, `action_taken_by_tutor`, `action_taken_by_hod`, `reg_no`, `q5_co_communication`..`q18_suggestions` (`MidSemSurveyController.php:35-55, 195-220, 300-345`) |
| `course_exit_surveys` / `student_course_exit_responses` | R/W | `batch_subject_id`, `status`, `reg_no`, `co1_q1`..`co_overall_q10` (`CourseExitSurveyController.php:40-58, 260-298`) |
| `program_attainments` | R/W | `classroom_id`, `branch`, `batch_name`, `po_targets`, `indirect_surveys`, `action_plans`, `status` (`ProgramAttainmentController.php:145-172`) |

---

## 5.11 Staff Leave & Compensatory Casual Leave (CCL)

### 5.11.1 Actors
- **Applicant (Staff)**: Applies for Casual Leave (CL), Compensatory Casual Leave (CCL), Duty Leave, Medical Leave, Special Leave, or Loss of Pay (LOP) with alternate class/period arrangements (`POST /api/staff/leave/apply`, `routes/web.php:1551`).
- **Tier-1 Approvers**:
  - **Department HOD**: Recommends/approves Tier-1 leave requests for department staff (`POST /api/staff/leave/approve`, `routes/web.php:1553`).
  - **SF Office Admin**: Verifies leave balances, processes Tier-1 verification for Self-Financing (SF) staff (`POST /api/sf-office/leave/approve`, `routes/web.php:1583`), logs historical backfill leaves (`routes/web.php:1584`), and credits CCL from holiday/weekend biometric punches (`routes/web.php:1586`).
- **Tier-2 Final Approvers**:
  - **SF Academic Coordinator**: Grants final approval for **Self-Financing (`EL`, `CT`, `AU`, `GEN_SF`, `SF`)** leave requests (`StaffLeaveController.php:330-343`).
  - **Principal**: Grants final approval for **Aided (`EEE`, `ME`, `CE`, `GEN_AIDED`)** leave requests (`StaffLeaveController.php:344-351`).

### 5.11.2 Step-by-Step Execution Flow
1. **Staff Leave Application**:
   - `POST /api/staff/leave/apply` $\rightarrow$ `StaffLeaveController@applyLeave` (`routes/web.php:1551`, `app/Http/Controllers/StaffLeaveController.php:16-85`).
   - Validates `leave_type`, `from_date`, `to_date`, `session_type` (`'Full Day'`, `'FN'`, `'AN'`), `ccl_date` (worked holiday date if applying for CCL), `total_days`, `reason`, and `work_arrangement` (JSON array of alternate period/faculty arrangements).
   - Generates a unique reference code `leave_code = 'SLV-' . date('Y') . '-' . strtoupper(Str::random(6))` and cryptographic SHA-256 `staff_signature_hash` (`StaffLeaveController.php:43-50`).
   - Inserts into `staff_leave_requests` with `hod_status = 'Pending'`, `coordinator_status = 'Pending'`, `principal_status = 'Pending'`, and `overall_status = 'Pending_HOD'` (`lines 52-75`).
2. **Stream-Specific Two-Tier Approval Routing (`isSelfFinancingDepartment`, `StaffLeaveController.php:239-249`)**:
   - `POST /api/staff/leave/approve` $\rightarrow$ `StaffLeaveController@processApproval` (`routes/web.php:1553`, `StaffLeaveController.php:254-365`) and `POST /api/sf-office/leave/approve` $\rightarrow$ `SfOfficeController@processOfficeApproval` (`routes/web.php:1583`, `app/Http/Controllers/SfOfficeController.php:482-537`):
   - **Stream A: Self-Financing Stream (`EL`, `CT`, `AU`, `GEN_SF`, `SF`)**:
     - **Stage 1 (HOD or SF Office Verification)**: HOD (`stage = 'HOD'`, `StaffLeaveController.php:311-324`) or SF Office (`SfOfficeController@processOfficeApproval`, `lines 495-530`) approves $\rightarrow$ sets `hod_status = 'Approved'`, `hod_signature_hash`, `coordinator_status = 'Pending'`, `principal_status = 'N/A'`, and transitions `overall_status = 'Pending_Coordinator'`.
     - **Stage 2 (SF Academic Coordinator Final Approval)**: SF Academic Coordinator (`StaffProfile::isSfAcademicCoordinator($userId)`, `stage = 'Coordinator'`, `StaffLeaveController.php:330-343`) approves $\rightarrow$ sets `coordinator_status = 'Approved'`, `coordinator_signature_hash`, and transitions `overall_status = 'Approved'` (Principal approval is bypassed for SF stream).
   - **Stream B: Aided Stream (`EEE`, `ME`, `CE`, `GEN_AIDED`)**:
     - **Stage 1 (HOD Recommendation)**: HOD approves (`stage = 'HOD'`, `StaffLeaveController.php:325-329`) $\rightarrow$ sets `hod_status = 'Approved'`, `coordinator_status = 'N/A'`, and transitions `overall_status = 'Pending_Principal'`.
     - **Stage 2 (Principal Final Approval)**: Principal approves (`stage = 'Principal'`, `StaffLeaveController.php:344-351`) $\rightarrow$ sets `principal_status = 'Approved'`, `principal_signature_hash`, and transitions `overall_status = 'Approved'`.
   - **Rejection at Any Stage**: Sets the respective stage status to `'Rejected'` and immediately transitions `overall_status = 'Rejected'` (`StaffLeaveController.php:285-309`).
3. **Leave Financial Year Cycle, Quotas & CCL Credit Ledger (`SfOfficeController`)**:
   - **Financial Year Cycle**: Runs from **April 1 to March 31** (`getLeaveCycleDates`, `SfOfficeController.php:48-76`), governed by `system_settings` keys `sf_office_leave_year_start` (`'04-01'`), `sf_office_leave_year_end` (`'03-31'`), `sf_office_annual_cl_quota` (`15` days), and `sf_office_ccl_validity_days` (`60` days) (`saveSettings`, `lines 695-745`).
   - **Holiday Punch Detection & CCL Eligibility**: `SfOfficeController@index` (`lines 335-375`) scans `sf_staff_time_punches` on Sundays, Second Saturdays, or `principal_scheduled_events` holidays; punches with $\ge 4.0$ hours (with `out_time`) or $\ge 5.5$ hours qualify for `1.0` day CCL (`0.5` day otherwise).
   - **Crediting CCL**: `POST /api/sf-office/ccl/credit` $\rightarrow$ `SfOfficeController@creditCcl` (`routes/web.php:1586`, `SfOfficeController.php:635-690`) creates an active credit in `sf_staff_ccl_credits` (`staff_mobile`, `duty_date`, `session_type`, `earned_days`, `used_days = 0`, `valid_until = duty_date + 60 days`, `source_punch_id`, `status = 'Active'`).
   - **Historical Leave Backfill**: `POST /api/sf-office/leave/past-entry` $\rightarrow$ `SfOfficeController@savePastLeaveEntry` (`routes/web.php:1584`, `lines 542-605`) logs pre-approved historical leaves (`leave_code = 'HIST-...'`, `is_historical = true`, `overall_status = 'Approved'`).

### 5.11.3 States, Approvals & Locking
- **`staff_leave_requests.overall_status` Transitions**:
  - **SF Stream**: `'Pending_HOD'` $\rightarrow$ `'Pending_Coordinator'` $\rightarrow$ `'Approved'` (or `'Rejected'`).
  - **Aided Stream**: `'Pending_HOD'` $\rightarrow$ `'Pending_Principal'` $\rightarrow$ `'Approved'` (or `'Rejected'`).
- **`sf_staff_ccl_credits.status`**: `'Active'` $\rightarrow$ `'Used'` / `'Expired'` (after `valid_until` = 60 days from `duty_date`, `SfOfficeController.php:655-680`).

### 5.11.4 Database Tables Read / Written
| Table | Operation | Key Columns |
| :--- | :--- | :--- |
| `staff_leave_requests` | R/W | `leave_code`, `staff_mobile`, `staff_name`, `department`, `designation`, `leave_type`, `from_date`, `to_date`, `session_type`, `ccl_date`, `total_days`, `reason`, `work_arrangement`, `hod_status`, `hod_mobile`, `hod_remarks`, `hod_action_at`, `hod_signature_hash`, `coordinator_status`, `coordinator_mobile`, `coordinator_remarks`, `coordinator_action_at`, `coordinator_signature_hash`, `principal_status`, `principal_remarks`, `principal_action_at`, `principal_signature_hash`, `overall_status`, `is_historical`, `office_verified_by` (`StaffLeaveController.php:52-75, 285-355`, `SfOfficeController.php:495-600`) |
| `sf_staff_ccl_credits` | R/W | `staff_mobile`, `staff_name`, `department`, `duty_date`, `session_type`, `earned_days`, `used_days`, `reason`, `source_punch_id`, `valid_until`, `credited_by`, `status` (`SfOfficeController.php:660-685`) |
| `system_settings` | R/W | `setting_key` (`sf_office_leave_year_start`, `sf_office_leave_year_end`, `sf_office_annual_cl_quota`, `sf_office_ccl_validity_days`), `setting_value` (`SfOfficeController.php:695-745`) |

---

## 5.12 Staff Biometric Time Punch, Geofence, Face Recognition & WebAuthn

### 5.12.1 Actors
- **Self-Financing (SF) Staff (`EL`, `CT`, `AU`, `GEN_SF`, `SF`)**: Registers 128-float facial feature descriptors and logs daily Morning `IN` and Evening `OUT` punches with smile liveness and GPS coordinates (`routes/web.php:1560-1565`).
- **All Staff Members**: Registers device-bound WebAuthn platform authenticators (fingerprint / FaceID) for passwordless mobile login (`routes/web.php:185-192`).
- **Super_Admin / Principal / SF Academic Coordinator / SF Office**: Configures campus GPS geofence parameters (`routes/web.php:1566-1567`), audits daily/monthly/individual attendance and LOP reports (`routes/web.php:1568, 1580`), and deletes/resets erroneous punches or face profiles (`routes/web.php:1569-1570`).

### 5.12.2 Step-by-Step Execution Flow

#### A. Biometric Face Registration & Cosine Similarity Matching (`StaffAttendanceMobileController`)
1. **SF Role & Branch Guard**:
   - `GET /dashboard/staff/mobile/face-punch` $\rightarrow$ `StaffAttendanceMobileController@showFacePunch` (`routes/web.php:1560`, `app/Http/Controllers/StaffAttendanceMobileController.php:40-96`) and `POST /api/staff/mobile/face-punch/verify` $\rightarrow$ `verifyAndPunch` (`routes/web.php:1562`, `lines 153-353`).
   - Enforces that only Self-Financing branches (`['EL', 'CT', 'AU', 'GEN_SF', 'SF']`), SF Coordinators (`'GEN_DEPT_COORDINATOR_SELF_FINANCE'`, `'ACADEMIC_COORDINATOR_SF'`), or executive roles (`'SUPER_ADMIN'`, `'PRINCIPAL'`, `'ADMIN'`, `'CHAIRMAN'`) can access biometric punching (`StaffAttendanceMobileController.php:55-69, 180-196`).
2. **Face Enrollment (`sf_staff_face_registrations`)**:
   - `POST /api/staff/mobile/face-punch/register` $\rightarrow$ `StaffAttendanceMobileController@saveFaceRegistration` (`routes/web.php:1561`, `StaffAttendanceMobileController.php:101-148`).
   - Decodes the base64 reference snapshot to `storage/app/public/sf_faces/{staffId}_{timestamp}.{ext}` (`lines 113-127`) and upserts the 128-element float descriptor JSON into `sf_staff_face_registrations` (`staff_id`, `mobile_no`, `staff_name`, `face_descriptor`, `photo_url`) (`lines 129-141`).
3. **Time Punch Verification (`verifyAndPunch`, `lines 153-353`)**:
   - **Step 1 — Facial Vector Comparison**: Computes Cosine Similarity between the stored 128-float `face_descriptor` and the live `face_descriptor` via `calculateCosineSimilarity` (`StaffAttendanceMobileController.php:213-229, 827-848`):
     $$\text{similarity} = \frac{\vec{A} \cdot \vec{B}}{\|\vec{A}\| \|\vec{B}\|}$$
     If $\text{similarity} < 0.42$ ($42\%$ threshold), rejects the punch with HTTP 422 (`Biometric Mismatch!`, `lines 222-227`).
   - **Step 2 — Haversine GPS Geofence Enforcement**:
     - Reads active campus centroid (`centroid_lat`, `centroid_lng`, default `10.23120000, 76.20450000`) and `radius_meters` (default `150` meters) from `sf_campus_geofence_settings` (`lines 232-236`).
     - Computes distance in meters via `calculateHaversineDistance` (`earthRadius = 6371000`, `lines 19-35, 237`).
     - If `distance > allowedRadius`, rejects the punch with HTTP 422 (`OUTSIDE_PREMISES`, `lines 241-247`).
   - **Step 3 — Session Timing & Status Classification (`sf_staff_time_punches`)**:
     - **Morning `IN` Punch (`punchType === 'IN'`, `lines 279-294`)**:
       - Saves `in_time`, `in_gps_lat`, `in_gps_lng`, `in_gps_distance_meters`, `in_premises_status = 'INSIDE_PREMISES'`, `in_snapshot_url`, `liveness_type = 'SMILE'`, and `liveness_score`.
       - Classifies `punch_status`:
         - `in_time < '08:45'` $\rightarrow$ `'EARLY_IN'`
         - `'08:45' <= in_time <= '09:15'` $\rightarrow$ `'PRESENT'`
         - `in_time > '09:15'` $\rightarrow$ `'LATE_IN'`
     - **Evening `OUT` Punch (`punchType === 'OUT'`, `lines 295-336`)**:
       - Requires an existing `in_time` on the same `punch_date` (`lines 297-302`) and enforces a minimum 30-second cooldown after `in_time` (`lines 304-311`).
       - Saves `out_time`, `out_gps_lat`, `out_gps_lng`, `out_gps_distance_meters`, `out_premises_status`, `out_snapshot_url`.
       - Appends afternoon status to the morning prefix (`EARLY_IN` / `PRESENT` / `LATE_IN`):
         - `out_time < '16:00'` $\rightarrow$ `"{inPrefix} & EARLY_OUT"`
         - `'16:00' <= out_time <= '16:30'` $\rightarrow$ `"{inPrefix} & COMPLETED"`
         - `out_time > '16:30'` $\rightarrow$ `"{inPrefix} & LATE_OUT"`
4. **FN / AN Session Breakdown, Late Count & LOP Calculation (`SfOfficeController`)**:
   - In `SfOfficeController@index` (`app/Http/Controllers/SfOfficeController.php:180-330`) and `getStaffMonthlySummary` (`lines 750-885`), daily punches are evaluated against working days, approved leaves (`staff_leave_requests`), and campus holidays (`principal_scheduled_events`):
     - Working days with neither a biometric punch nor an approved leave are counted as **Unauthorised Absence / Loss of Pay (LOP)** (`SfOfficeController.php:275-315`).
     - Half-day leaves (`session_type = 'FN'` or `'AN'`) are cross-checked against half-day punch hours to compute net LOP days (`0.5` or `1.0`) and remaining CL/CCL balances.
5. **Geofence Setup & Admin Reset**:
   - `GET /dashboard/sf-attendance/geofence-setup` $\rightarrow$ `StaffAttendanceMobileController@showGeofenceSetup` (`routes/web.php:1566`, `lines 358-375`) and `POST /api/sf-attendance/geofence-setup` $\rightarrow$ `saveGeofenceSetup` (`routes/web.php:1567`, `lines 380-411`).
   - `DELETE /api/sf-attendance/punch/{id}` $\rightarrow$ `deletePunch` (`routes/web.php:1569`, `lines 783-796`) and `DELETE /api/sf-attendance/registration/{staffId}` $\rightarrow$ `resetFaceRegistration` (`routes/web.php:1570`, `lines 801-821`).

#### B. WebAuthn Biometric Fingerprint / Passkey Login (`WebAuthnController`)
1. **Device Enrollment**:
   - `GET /api/webauthn/register/options` $\rightarrow$ `WebAuthnController@getRegisterOptions` (`routes/web.php:186`, `app/Http/Controllers/WebAuthnController.php:19-69`) generates a 32-byte challenge in `Session::put('webauthn_register_challenge', $challenge)` with `authenticatorAttachment = 'platform'` and algorithms `ES256 (-7)`, `RS256 (-257)`, `Ed25519 (-8)`.
   - `POST /api/webauthn/register/verify` $\rightarrow$ `WebAuthnController@registerCredential` (`routes/web.php:187`, `WebAuthnController.php:74-133`) stores `(staff_mobile_no, credential_id, public_key, device_name, counter)` in `staff_biometric_credentials` and writes an `AuditLog` (`action = 'Biometric Registered'`).
2. **Passwordless Biometric Login**:
   - `POST /api/webauthn/login/options` $\rightarrow$ `WebAuthnController@getAuthOptions` (`routes/web.php:188`, `WebAuthnController.php:138-205`) looks up registered `credential_id`s for the staff member (verifying `staff_profiles.account_status === 'APPROVED'`) and stores `webauthn_auth_challenge` in session.
   - `POST /api/webauthn/login/verify` $\rightarrow$ `WebAuthnController@authenticate` (`routes/web.php:189`, `WebAuthnController.php:210-311`) verifies the `credential_id` in `staff_biometric_credentials`, populates session keys (`userRole`, `userId`, `userName`, `userBranch`, `userPhoto`), logs `'Biometric Login'` in `audit_logs`, and returns the role-specific dashboard redirect URL (`lines 264-291`).
3. **Credential Management**:
   - Listed via `GET /api/webauthn/credentials` $\rightarrow$ `listUserCredentials` (`routes/web.php:190`, `lines 316-334`) and revoked via `DELETE /api/webauthn/credentials/{id}` $\rightarrow$ `deleteCredential` (`routes/web.php:191`, `lines 339-372`).

### 5.12.3 States, Approvals & Locking
- **`sf_staff_time_punches.punch_status`**:
  - Morning only: `'EARLY_IN'`, `'PRESENT'`, `'LATE_IN'` (`StaffAttendanceMobileController.php:288-294`).
  - Completed day: `'{EARLY_IN|PRESENT|LATE_IN} & {EARLY_OUT|COMPLETED|LATE_OUT}'` (`lines 329-335`).
- **`sf_staff_time_punches.in_premises_status` / `out_premises_status`**: `'INSIDE_PREMISES'` vs `'OUTSIDE_PREMISES'` (rejected if `distance > radius_meters`, `lines 238-247`).
- **`staff_profiles.account_status`**: Must be `'APPROVED'` for WebAuthn biometric login (`WebAuthnController.php:164, 242`).

### 5.12.4 Database Tables Read / Written
| Table | Operation | Key Columns |
| :--- | :--- | :--- |
| `sf_campus_geofence_settings` | R/W | `campus_name`, `centroid_lat`, `centroid_lng`, `radius_meters`, `max_accuracy_meters`, `is_active` (`StaffAttendanceMobileController.php:78-87, 360-401`) |
| `sf_staff_face_registrations` | R/W | `staff_id`, `mobile_no`, `staff_name`, `face_descriptor`, `photo_url` (`StaffAttendanceMobileController.php:133-141, 199-204, 806-810`) |
| `sf_staff_time_punches` | R/W | `staff_id`, `staff_name`, `punch_date`, `in_time`, `out_time`, `in_gps_lat`, `in_gps_lng`, `in_gps_distance_meters`, `in_premises_status`, `in_snapshot_url`, `out_gps_lat`, `out_gps_lng`, `out_gps_distance_meters`, `out_premises_status`, `out_snapshot_url`, `liveness_type`, `liveness_score`, `punch_status` (`StaffAttendanceMobileController.php:270-338`) |
| `staff_biometric_credentials` | R/W | `id`, `staff_mobile_no`, `credential_id`, `public_key`, `device_name`, `counter` (`WebAuthnController.php:104-114, 170, 246-248, 348-356`) |

---

## 5.13 Remedial Classes, Notices, Push Notifications, Birthdays & Carmie Assistant

### 5.13.1 Actors
- **Lecturers / Demonstrators**: Create Remedial Coaching Rooms for slow learners, log remedial sessions, conduct remedial assessments, and print NBA remedial reports (`routes/web.php:1460-1476`).
- **Principal / Super_Admin / Chairman / Admin**: Broadcast Executive Flash Notices (`routes/web.php:225-230`) and schedule Campus Events / Timetable Suspensions (`routes/web.php:233-239`).
- **Department HOD**: Publishes and deletes Department Notices on the HOD Mobile Portal (`routes/web.php:1505-1506`).
- **All Staff & Students**: Subscribe to Web Push notifications (`routes/web.php:195-196`), send/receive Staff Birthday Wishes (`routes/web.php:200-203`), and query the **Carmie** AI / Playbook Assistant (`routes/web.php:215-217`).

### 5.13.2 Step-by-Step Execution Flow

#### A. Remedial Coaching Rooms & Improvement Analysis (`RemedialController`)
1. **Identifying Slow Learners & Provisioning a Room**:
   - `GET /api/remedial/subjects` $\rightarrow$ `RemedialController@getAssignedSubjects` (`routes/web.php:1460`, `app/Http/Controllers/RemedialController.php:20-51`) lists active subjects (`current_semester <= 6`) assigned to the logged-in staff in `subject_staff_assignments`.
   - `GET /api/remedial/students` $\rightarrow$ `RemedialController@getStudentPerformance` (`routes/web.php:1461`, `RemedialController.php:56-85`) sums `academic_marks.marks_obtained` per student for the subject and sorts ascending so lowest-scoring students appear first.
   - `POST /api/remedial/rooms` $\rightarrow$ `RemedialController@createRoom` (`routes/web.php:1462`, `RemedialController.php:87-125`) creates a `remedial_rooms` record (`room_id` UUID, `classroom_id`, `subject_code`, `created_by_mobile`, `status = 'active'`) and enrolls selected slow learners into `remedial_students` (`room_id`, `reg_no`).
2. **Logging Sessions & Conducting Remedial Assessments**:
   - **Add/Remove Student**: `POST /api/remedial/rooms/{roomId}/students` (`addStudent`, `lines 240-248`) and `DELETE /api/remedial/rooms/{roomId}/students` (`removeStudent`, `lines 250-255`).
   - **Session Attendance Log**: `POST /api/remedial/rooms/{roomId}/logs` $\rightarrow$ `RemedialController@saveLog` (`routes/web.php:1467`, `RemedialController.php:257-270`) creates a `remedial_session_logs` record (`log_id` UUID, `room_id`, `session_date`, `start_time`, `duration_minutes`, `topic_covered`, `attendance_data` JSON array of present `reg_no`s).
   - **Remedial Assessments & Online Test Sync**:
     - `POST /api/remedial/rooms/{roomId}/assessments` $\rightarrow$ `createAssessment` (`routes/web.php:1469`, `lines 278-292`) creates `remedial_assessments` (`assessment_id` UUID, `room_id`, `type`, `linked_test_id`, `title`, `max_marks`, `co_structure` JSON).
     - `POST /api/remedial/rooms/{roomId}/assessments/{assessmentId}/scores` $\rightarrow$ `saveAssessmentScores` (`routes/web.php:1470`, `lines 294-306`) saves `score` and `co_scores` JSON in `remedial_assessment_scores`.
     - `POST /api/remedial/rooms/{roomId}/assessments/{assessmentId}/sync` $\rightarrow$ `syncOnlineScores` (`routes/web.php:1471`, `lines 308-328`) pulls `total_score` from `test_attempts` (`status IN ('submitted', 'completed')`) for `linked_test_id` into `remedial_assessment_scores`.
3. **Improvement Status Calculation & Printable Reports**:
   - `GET /remedial/rooms/{roomId}/analysis/print` $\rightarrow$ `RemedialController@printAnalysisReport` (`routes/web.php:1474`, `RemedialController.php:454-560`) classifies each remedial student's latest test score (`latestPercent = (score / max_marks) * 100`, `lines 511-534`):
     - `testsAttended == 0` $\rightarrow$ `improvement_status = 'No Tests'`, `remark = 'Requires attention'`
     - `latestPercent >= 50` $\rightarrow$ `improvement_status = 'Improved'`, `remark = 'Satisfactory progress'`
     - `latestPercent < 50` $\rightarrow$ `improvement_status = 'Marginal'`, `remark = 'Need improvement'`
     - If $100\%$ session attendance (`presentCount == count($logs)`), overrides `remark = 'Regular & Active'`.
   - Also provides `printAssessmentReport` (`lines 330-383`) and `printAttendanceReport` (`lines 385-452`), plus `updateRoomStatus` (`'active'` / `'completed'` / `'archived'`, `lines 589-601`) and cascading `deleteRoom` (`lines 562-587`).

#### B. Executive Flash Notices, Scheduled Campus Events & Department Notices
1. **Executive Flash Notices (`ExecutiveFlashNoticeController`, `app/Http/Controllers/ExecutiveFlashNoticeController.php:1-200`, routes `routes/web.php:225-230`)**:
   - `POST /api/executive/flash-notices/broadcast` $\rightarrow$ `ExecutiveFlashNoticeController@broadcast` (`lines 16-93`):
     - Restricted to `['Principal', 'Super_Admin', 'Chairman', 'Admin']` (`line 19`).
     - Validates `priority` (`'Normal'`, `'Urgent'`, `'Circular'`), `target_audience` (`'ALL_CAMPUS'`, `'STAFF_ALL'`, `'STAFF_DEPT'`, `'STUDENTS_ALL'`, `'STUDENTS_DEPT_SEM'`), `dispatch_type` (`'immediate'`, `'scheduled'`), and optional file attachment (`flash_notices/`, max 10MB).
     - Inserts into `executive_flash_notices` (`is_published = ($dispatchType === 'immediate')`, `lines 55-72`).
     - If immediate, dispatches Web Push notifications via `PushNotificationService::notifyAll` or `notifyRole` (`lines 74-86`).
   - `GET /api/flash-notices/active` $\rightarrow$ `getActiveNotices` (`lines 147-199`) returns up to 10 published notices matching the user's role and department, ordered by priority (`Urgent` $\rightarrow$ `Circular` $\rightarrow$ `Normal`).
   - `DELETE /api/executive/flash-notices/{id}` $\rightarrow$ `revokeNotice` (`lines 123-142`) deletes the attachment and database record.
2. **Principal Scheduled Campus Events & Timetable Suppression (`PrincipalScheduledEventController`, `app/Http/Controllers/PrincipalScheduledEventController.php:1-308`, routes `routes/web.php:233-239`)**:
   - `POST /api/principal/events/schedule` $\rightarrow$ `PrincipalScheduledEventController@schedule` (`lines 16-91`) creates a `principal_scheduled_events` row with `event_category` (`Academic`, `Exam`, `Meeting`, `Cultural`, `Sports`, `Workshop`, `Holiday`, `Other`), `event_date`, `end_date`, `reopen_date`, `is_full_day`, `suppress_timetable` (default `true`), `suspension_type` (`'full_day'`, `'half_day_fn'`, `'half_day_an'`), and `target_audience`.
   - `GET /api/campus-events/today` $\rightarrow$ `getTodayCampusEvent` (`lines 216-307`) checks if an active event covers today's date for the user's role/department and returns a formatted banner (`"Regular classes suspended..."`) used by dashboards and attendance controllers.
3. **HOD Department Notices (`HodMobileController`, `app/Http/Controllers/HodMobileController.php:450-509`, routes `routes/web.php:1505-1506`)**:
   - `POST /api/hod/mobile/notice/create` $\rightarrow$ `HodMobileController@createNotice` (`lines 450-485`) inserts into `department_notices` (`department`, `title`, `content`, `target_audience`, `priority`, `created_by`, `author_name`).
   - `POST /api/hod/mobile/notice/delete` $\rightarrow$ `HodMobileController@deleteNotice` (`lines 490-509`) deletes from `department_notices`.

#### C. Web Push Notifications (`PushNotificationController` & `PushNotificationService`)
- **Device Subscription**: `POST /api/push/subscribe` $\rightarrow$ `PushNotificationController@subscribe` (`routes/web.php:195`, `app/Http/Controllers/PushNotificationController.php:14-39`) calls `PushNotificationService::subscribe` (`app/Services/PushNotificationService.php:13-27`) to upsert `push_subscriptions` (`endpoint`, `user_id`, `role` `'student'`/`'staff'`, `p256dh_key`, `auth_key`, `device_type`).
- **Dispatches**: `POST /api/push/broadcast` $\rightarrow$ `PushNotificationController@sendBroadcast` (`routes/web.php:196`, `lines 44-75`) and internal service calls (`notifyUser`, `notifyRole`, `notifyAll` in `PushNotificationService.php:73-95`) POST JSON payloads (`title`, `body`, `url`, `tag`, `timestamp`) with `TTL: 86400` to subscriber endpoints via cURL (`lines 32-68`), which are rendered on client devices by `public/sw.js` (`public/sw.js:12-43`).

#### D. Staff Birthday Celebrations & Wishes (`StaffBirthdayController`)
- `GET /api/staff/birthdays/today` $\rightarrow$ `StaffBirthdayController@getTodayBirthdays` (`routes/web.php:200`, `app/Http/Controllers/StaffBirthdayController.php:16-107`) queries `staff_profiles` where `account_status = 'Approved'` and `MONTH(dob) = m AND DAY(dob) = d`, aggregates emoji reactions (`🎉`, `🎂`, `🎈`, `🎁`, `❤️`, `👏`) and messages from `staff_birthday_wishes` for `wish_date = today`, and flags `has_wished`.
- `POST /api/staff/birthdays/wish` $\rightarrow$ `StaffBirthdayController@sendWish` (`routes/web.php:201`, `lines 112-173`) inserts into `staff_birthday_wishes`, logs an `AuditLog` (`action = 'Birthday Wish Sent'`), and dispatches a real-time Web Push notification to the celebrant via `PushNotificationService::notifyUser` (`lines 161-167`).
- `POST /api/staff/profile/update-dob` $\rightarrow$ `StaffBirthdayController@updateSelfDob` (`routes/web.php:202`, `lines 178-214`) lets staff update their own `staff_profiles.dob`.

#### E. Carmie Academic Assistant (`CarmieAssistantController` & `CarmiePlaybookService`)
- `POST /api/carmie/ask` $\rightarrow$ `CarmieAssistantController@ask` (`routes/web.php:215`, `app/Http/Controllers/CarmieAssistantController.php:23-147`):
  1. **Query Normalization & Local Playbook Search**: Calls `CarmiePlaybookService::normalizeQuery` (`app/Services/CarmiePlaybookService.php:37-68`) to fix domain typos and `CarmiePlaybookService::search` (`lines 73-275`) to score topics in `storage/app/carmie_playbook.json` (or `database/data/carmie_playbook.json`) using phrase matches, keyword hits, URL/revision context boosters (`2021` vs `2026`), and role disambiguation rules (e.g., routing HOD batch creation strictly to `Batch Management` rather than `My Batches`, `lines 221-237`).
  2. **Hybrid Gemini 2.5 Flash Grounded Generation**: Checks if `GEMINI_API_KEY` is configured and `system_settings.gemini_ai_active` is not `'0'`/`'false'` (`CarmieAssistantController.php:46-57`). If active, calls `queryGemini` (`lines 152-228`), injecting the matched playbook topic and strict R2021/R2026 syllabus isolation rules into the system prompt sent to `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`.
  3. **Zero-Cost Offline Playbook Fallback**: If Gemini is disabled or times out, formats the matched playbook topic's badge (`📘 [Revision 2021]` or `📙 [Revision 2026]`), summary, step-by-step instructions, and User Manual citation directly (`CarmieAssistantController.php:82-121`).
  4. **Query Memory Logging**: Appends the interaction (retaining the latest 300 queries) to `storage/app/carmie_query_model.json` via `CarmiePlaybookService::logUserQuestion` (`CarmiePlaybookService.php:280-315`).
- `GET /api/carmie/suggestions` $\rightarrow$ `CarmieAssistantController@getSuggestions` (`routes/web.php:216`, `CarmieAssistantController.php:233-245`) returns context-aware starter prompt chips from `CarmiePlaybookService::getStarterSuggestions` (`CarmiePlaybookService.php:456-522`).

### 5.13.3 States, Approvals & Locking
- **`remedial_rooms.status`**: `'active'` $\rightarrow$ `'completed'` / `'archived'` (`RemedialController.php:113, 597-598`).
- **`executive_flash_notices.is_published`**: `true` (when `dispatch_type = 'immediate'`) or `false` (when `dispatch_type = 'scheduled'` until `scheduled_at <= now()`, `ExecutiveFlashNoticeController.php:55, 163-171`).
- **`principal_scheduled_events.suspension_type`**: `'full_day'`, `'half_day_fn'`, `'half_day_an'` with `suppress_timetable = true|false` (`PrincipalScheduledEventController.php:68-69, 284-290`).

### 5.13.4 Database Tables Read / Written
| Table | Operation | Key Columns |
| :--- | :--- | :--- |
| `remedial_rooms` / `remedial_students` | R/W | `room_id`, `classroom_id`, `subject_code`, `created_by_mobile`, `status`, `reg_no`, `added_at` (`RemedialController.php:108-122, 243-254, 581-598`) |
| `remedial_session_logs` | R/W | `log_id`, `room_id`, `session_date`, `start_time`, `duration_minutes`, `topic_covered`, `attendance_data` (`RemedialController.php:259-267`) |
| `remedial_assessments` / `remedial_assessment_scores` | R/W | `assessment_id`, `room_id`, `type`, `linked_test_id`, `title`, `max_marks`, `co_structure`, `reg_no`, `score`, `co_scores` (`RemedialController.php:281-303, 320-324`) |
| `executive_flash_notices` | R/W | `sender_id`, `sender_role`, `sender_name`, `title`, `content`, `priority`, `target_audience`, `target_department`, `target_semester`, `attachment_path`, `attachment_type`, `dispatch_type`, `scheduled_at`, `is_published` (`ExecutiveFlashNoticeController.php:57-72, 139`) |
| `principal_scheduled_events` | R/W | `title`, `description`, `event_category`, `venue`, `event_date`, `end_date`, `reopen_date`, `start_time`, `end_time`, `is_full_day`, `suppress_timetable`, `suspension_type`, `target_audience`, `target_department`, `target_semester`, `target_role`, `special_group_name`, `requires_rsvp`, `attachment_path`, `is_published`, `created_by` (`PrincipalScheduledEventController.php:59-84, 208`) |
| `department_notices` | R/W | `id`, `department`, `title`, `content`, `target_audience`, `priority`, `created_by`, `author_name` (`HodMobileController.php:470-478, 503`) |
| `push_subscriptions` | R/W | `user_id`, `role`, `endpoint`, `p256dh_key`, `auth_key`, `device_type` (`PushNotificationService.php:15-26`) |
| `staff_birthday_wishes` | R/W | `wish_date`, `celebrant_mobile_no`, `sender_mobile_no`, `sender_name`, `emoji`, `message` (`StaffBirthdayController.php:52-56, 138-147`) |

---

# Section 6: Exhaustive Business Rules & Hard-Coded Thresholds

Every hard-coded constant, threshold, formula, slab, and institutional rule in `carmel-linx-laravel/` is catalogued below with exact `file:line` citations.

---

## 6.1 Student Attendance Rules, Timings, Eligibility Cutoffs & Attendance Marks

### 1. Academic Day Period Timings & 6-Hour Standard Rule
- **7 Daily Periods (`StudentAttendanceController.php:45-54`)**:
  - **Period 1**: `9:00 AM - 10:00 AM`
  - **Period 2**: `10:00 AM - 11:00 AM`
  - **Period 3**: `11:10 AM - 12:10 PM`
  - **Period 4**: `1:00 PM - 2:00 PM`
  - **Period 5**: `2:00 PM - 3:00 PM`
  - **Period 6**: `3:00 PM - 4:00 PM`
  - **Period 7**: `Special / Extra Class`
- **6-Hour Academic Day Filter**:
  - Standard semester attendance calculations strictly filter `where('period', '<=', 6)` so that 7th-hour special/remedial/extra classes do not inflate or penalize regular conducted/attended hours (`app/Http/Controllers/StudentAttendanceController.php:120-128, 962`).
  - Maximum duty/grace leave hours creditable on a single calendar day is capped at **`min(6, (int)$r->hours_credited)`** (`app/Http/Controllers/TutorSpecialAttendanceController.php:271, 463`).

### 2. Authoritative Attendance Source Hierarchy
1. **Class-Level Overall Attendance & ESE Eligibility**:
   - **Priority 1**: `tutor_class_attendances` (`TutorClassAttendance`), populated by the Tutor uploading the official **TEAMS Class Attendance PDF** (`TutorSpecialAttendanceController::uploadTeamsClassAttendance`, `app/Http/Controllers/TutorSpecialAttendanceController.php:515-720`). When present, `total_hours`, `attended_hours`, `final_percentage`, and `eligibility_status` from `tutor_class_attendances` override all daily logs (`app/Http/Controllers/AttendanceController.php:1030-1035`, `app/Http/Controllers/StudentAttendanceController.php:105-118, 944-957`, `app/Http/Controllers/TutorController.php:372-377`).
   - **Priority 2 (Fallback)**: Sum of daily `class_logs_attendance` / `student_attendance` across all subjects in the classroom (`AttendanceController.php:1037`, `StudentAttendanceController.php:120-152, 958-977`).
2. **Subject-Level Attendance & CIA Attendance Marks**:
   - **Priority 1**: `subject_official_attendances` (`SubjectOfficialAttendance`), populated via TEAMS Subject Attendance PDF/Excel import (`SbteSubjectLogImportController.php:1267-1285, 1645-1663`) or manual override (`override_percentage`, `override_mark` using `DB::raw("COALESCE(override_percentage, ...)")`).
   - **Priority 2**: `student_attendance` records where `status IN ('Present', 'Late')` divided by total records for that student/sub-batch (`AttendanceController.php:983-1000`, `VirtualClassroomPracticalController.php:1114-1143`).
   - **Priority 3**: `class_logs_attendance` JSON `present_students` count divided by conducted slots for that student's lab sub-batch (`AttendanceController.php:945-975`).
   - **Zero-Log Default Benchmark**:
     - If `conducted === 0` in `AttendanceController.php:996, 1002, 1037` or `VirtualClassroomPracticalController.php:1129`, attendance defaults to **`100.0%`**.
     - In `R21VirtualClassroomWorkshopController.php:352-353`, if no attendance is recorded and no override exists, attendance defaults to **`85.0%`**.
- **Lateral Entry (LET) Pre-Admission Date Exclusion**:
  - During TEAMS attendance import (`SbteSubjectLogImportController.php:803-808, 921-931, 1154-1157, 1485-1489`), any session date prior to `$student->date_of_joining` — or prior to hard-coded default **`"2026-07-15"`** if `admission_type === "LET"` and `date_of_joining` is null — is skipped so LET students are not marked absent before joining.

### 3. SBTE ESE Eligibility & Condonation Cutoffs (`TutorSpecialAttendanceController::evaluateEligibility`)
Defined in `app/Http/Controllers/TutorSpecialAttendanceController.php:98-201, 820, 835`:

| Regulation | Attendance % Range | Status Code | Clause / Rule & Action | Condonation Fee |
| :--- | :--- | :--- | :--- | :--- |
| **R21 (Clause 10)** | `>= 75.0%` | `Eligible` | **Clause 10.1**: Directly eligible to appear for End Semester Examination (`lines 169-178`). | Rs. 0 |
| **R21 (Clause 10)** | `65.0% – 74.9%` | `Condonation` | **Clause 10.2**: Condonation by Principal recommended on medical/genuine grounds (`lines 180-190`). | **Rs. 750** (`lines 820, 835`) |
| **R21 (Clause 10)** | `< 65.0%` | `Detained` | **Clause 10.3**: Ineligible for condonation (`< 65%`); detained and must repeat semester (`lines 191-200`). | Not Condonable |
| **R26 (Rule 7)** | `>= 75.0%` *(Base)*<br>`>= 73.0%` *(Menstrual Leave `-2%`)*<br>`>= 70.0%` *(PWD `-5%`)* | `Eligible` | **Rule 7.1**: Directly eligible for ESE. Statutory relaxations: `'Menstrual Leave'` reduces threshold by `2.0%` (`73.0%`, `lines 110-113`); `'PWD'` reduces threshold by `5.0%` (`70.0%`, `lines 114-117`). | Rs. 0 |
| **R26 (Rule 7)** | `60.0% – (Threshold - 0.1)%` | `Condonation` | **Rule 7.3**: Regular Condonation approval by Principal / RDTE / DTE (`lines 130-140`). | **Rs. 750** (`lines 820, 835`) |
| **R26 (Rule 7)** | `50.0% – 59.9%` | `Special Condonation` | **Rule 7.3**: Special Condonation by DTE (one-time in diploma programme, subject to passing `>= 50%` courses, `lines 141-151`). | **Rs. 1,500** (`lines 147, 820, 835`) |
| **R26 (Rule 7)** | `< 50.0%` | `Detained` | **Rule 7.3**: Severe shortage (`< 50%`); ineligible for condonation, must repeat semester (`lines 152-163`). | Not Condonable |

- **Shortage Hours Formula (`TutorSpecialAttendanceController.php:816-820, 831-835`)**:
  - `$requiredHours = (int) ceil(($requiredThreshold / 100.0) * $totalConductedHours)`
  - `$grossShortageHours = max(0, $requiredHours - $totalAttendedHours)`
  - `$netShortageHours = max(0, $requiredHours - $effectiveAttended)` (after adding approved Duty/Special Leave hours).

### 4. CIA Attendance Mark Formulas (R21 vs R26)
1. **R21 Proportional Formula (`AttainmentService::calculateR21AttendanceMark`, `app/Services/AttainmentService.php:37-54`)**:
   - Clamps percentage to `[0.0, 100.0]`: `$pct = max(0.0, min(100.0, $percentage))` (`line 43`).
   - Raw proportional score: `$raw = ($pct / 100.0) * $maxMark` (`line 44`).
   - **Rounding Rule (`lines 48-52`)**:
     - If `$maxMark == 10.0` (R21 Theory): rounded to **nearest whole integer** (`round($raw)`).
     - If `$maxMark == 15.0` (R21 Practical, Drawing, Workshop, Major Project) or `$maxMark == 7.5` (R21 Seminar): rounded to **nearest `0.5`** (`round($raw * 2) / 2`).
   - *Note*: In `ClassroomController::getSubjectAttendanceStats` (`app/Http/Controllers/ClassroomController.php:5219-5221`), a legacy helper awards `0` marks if `$pct < 75%` and `round(($pct / 100) * 10, 1)` if `>= 75%`, whereas the main CIA sheet (`ClassroomController.php:3378`) and `AttainmentService.php:44` award proportional marks across `0–100%` without a `<75%` zero cliff.
2. **R26 6-Tier Step-Slab Rubric (Max 5.0M across all R26 courses)**:
   - Implemented identically in `R26TheoryEvaluation.php:84-94`, `R26DrawingEvaluation.php:84-94`, `R26EnglishEvaluation.php:115-125`, `R26ClassroomController.php:2646-2653`, `R26VirtualClassroomPracticalController.php:47-55`, `R26VirtualClassroomPracticumController.php:316-323`, and `R26VirtualClassroomHealthPhysicalController.php:172-179`:
     - `>= 90.0%` -> **5.0M**
     - `>= 80.0%` and `< 90.0%` -> **4.0M**
     - `>= 75.0%` and `< 80.0%` -> **3.0M**
     - `>= 70.0%` and `< 75.0%` -> **2.0M**
     - `>= 65.0%` and `< 70.0%` -> **1.0M**
     - `< 65.0%` -> **0.0M**

---

## 6.2 CIA / ESE Splits, Pass Minimums & Moderation Rules

### 1. Comprehensive CIA / ESE Split & Pass Minimum Matrix
Compiled from individual classroom controllers and `ConsolidatedCiaReportController::getCourseConfig` (`app/Http/Controllers/ConsolidatedCiaReportController.php:631-720`):

| Regulation & Course Type | CIA Max | CIA Pass Min | ESE Max | ESE Pass Min | Combined Max | Combined Pass Min | Code Citations |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **R21 Theory** | **50** | **20** (40%) | **75** *(or **100** in Consolidated CIA)* | **40%** (`Grade E` / `30/75`) | **125** *(or **150**)* | **40%** (`50/125`) | `ClassroomController.php:3381-3383, 4160`, `ConsolidatedCiaReportController.php:676-679` |
| **R21 Practical / Lab** | **75** | **30** (40%) | **50** | **20** (40%) | **125** | **50** (40%) | `VirtualClassroomPracticalController.php:534, 1823`, `ConsolidatedCiaReportController.php:682-686` |
| **R21 Drawing** | **75** | **30** (40%) | **50** | **20** (40%) | **125** | **50** (40%) | `R21VirtualClassroomDrawingController.php:245-255` |
| **R21 Workshop** | **75** | **30** (40%) | **50** | **20** (40%) | **125** | **50** (40%) | `R21VirtualClassroomWorkshopController.php:82-83, 357-360` |
| **R21 Major Project** | **75** | **30** (40%) | **50** | **20** (40%) | **125** | **50** (40%) | `R21VirtualClassroomMajorProjectController.php:151, 374, 554, 653` |
| **R21 Seminar** | **75** | **30** (40% + `report > 0`) | **0** | N/A | **75** | **30** (40%) | `R21VirtualClassroomSeminarController.php:246, 525, 1041-1065` |
| **R26 Theory** | **40** | **16** (40% in Consolidated CIA; no CIA floor in ESE pass check) | **60** | **24** (40% or Grade `S`–`E`) | **100** | **40** (40%) | `R26ClassroomController.php:2729, 2945-2960`, `ConsolidatedCiaReportController.php:715-718` |
| **R26 Practical / Lab** | **60** | **24** (40% in Consolidated CIA) | **40** | **16** (40%) | **100** | **40** (40%) | `R26VirtualClassroomPracticalController.php:98, 108-125`, `ConsolidatedCiaReportController.php:696-700` |
| **R26 Basic Science Practicum** (`2001`–`2003`) | **40** | **16** (40% in Consolidated CIA) | **60** (Theory only) | **24** (40% or Grade `S`–`E`/`P`) | **100** | **40** (40%) | `R26VirtualClassroomPracticumController.php:560-562, 1945-1949, 4866-4874` |
| **R26 Program Core Practicum** (`3:0:3:0`) | **40** | **16** (40% in Consolidated CIA) | **100** (`60` Theory + `40` Prac) | **24 / 60** in Theory ESE | **140** | **56** (40% of 140) | `R26VirtualClassroomPracticumController.php:573-575, 1951-1956, 4875-4884` |
| **R26 Drawing / Graphics** (Active Table) | **40** | **16** (40%) | **60** | **24** (40% or Grade `S`–`E`) | **100** | **40** (40%) | `R26VirtualClassroomDrawingController.php:221-237` |
| **R26 English (`1001`)** | **40** | **16** (40%) | **60** (Internal Lab Exam) | **24** (40% or Grade `S`–`E`/`P`) | **100** | **40** (40%) | `R26VirtualClassroomEnglishController.php:279-296` |
| **R26 Health & Physical Ed (`1009`)** | **60** *(50 effective)* | **24** (40% in `printReport`) | **40** | **16** (40% in `show`) | **100** | **40** (40%) | `R26VirtualClassroomHealthPhysicalController.php:201, 213, 474, 492` |

### 2. Grace Marks / Moderation Rules
- There is **no automated grace mark addition** in CIA or ESE calculation; however, staff/tutors are provided explicit **manual override columns**:
  - `practical_evaluations.lab_work_marks` (`/37.5` manual override for R21 Practical and R21 Drawing continuous marks, `VirtualClassroomPracticalController.php:1183-1197`, `R21VirtualClassroomDrawingController.php:208-214`).
  - `subject_official_attendances.override_percentage` and `override_mark` (`ClassroomController.php:5235-5270`).
  - `r26_practicum_attendance_overrides.attendance_percentage` and `attendance_mark_5` (`R26VirtualClassroomPracticumController.php:312-324`).
  - `r21_drawing_attendance_evaluations.override_percentage` (`R21VirtualClassroomDrawingController.php:190-198`).
  - `r21_workshop_attendance_evaluations.override_percentage` (`R21VirtualClassroomWorkshopController.php:344-354`).

---

## 6.3 Grading Scales, Grade Points, Midpoint Conversions & SGPA / CGPA Formulas

### 1. SBTE Letter Grade Scale & Grade Points
Defined across `StudentAttendanceController.php:595-606`, `R26VirtualClassroomPracticalController.php:110-126`, `R26VirtualClassroomPracticumController.php:550-585`, `R21VirtualClassroomMajorProjectController.php:362-372`, and `R21VirtualClassroomSeminarController.php:1041-1065`:

| Letter Grade | Percentage Range | Grade Point (`GP`) | Classification / Meaning | Midpoint % (`AttainmentService.php:19-28`) | Midpoint `/60` (`R26ClassroomController.php:2934-2943`) | Midpoint `/75` (`AttainmentService.php:19-28`) |
| :---: | :---: | :---: | :--- | :---: | :---: | :---: |
| **`S`** | `>= 90%` | **10** | Outstanding / Superior | `95%` | **57.0** | **71.25** |
| **`A`** | `80% – 89.99%` | **9** | Excellent | `85%` | **51.0** | **63.75** |
| **`B`** | `70% – 79.99%` | **8** | Very Good | `75%` | **45.0** | **56.25** |
| **`C`** | `60% – 69.99%` | **7** | Good | `65%` | **39.0** | **48.75** |
| **`D`** | `50% – 59.99%` | **6** | Satisfactory / Above Average | `55%` | **33.0** | **41.25** |
| **`E`** | `40% – 49.99%` | **5** | Pass / Adequate | `45%` | **27.0** | **33.75** |
| **`P`** | Pass Floor (`40%`) | **5** *(or Pass)* | Pass (supported in R26 English & Practicum) | `40%` | **24.0** (`R26EnglishEvaluation.php:139`) | **30.0** |
| **`F` / `FE` / `I` / `AB`** | `< 40%` or ESE Fail | **0** | Failed (`F`), Failed External (`FE`), Incomplete (`I`), Absent (`AB`) | `0%` | **0.0** | **0.0** |

### 2. SGPA, CGPA & Diploma Classification Formulas (`StudentAttendanceController.php:595-665`)
- **Semester Grade Point Average (SGPA)**:
  - Stored in `student_semester_summary` (`sgpa`, `cgpa`, `total_credits_earned`, `backlogs_count`, `database/migrations/2026_06_23_143102_create_student_semester_summary_table.php:14-25`) or computed from `student_board_grades` (`StudentAttendanceController.php:614-642`):
  - When computing from board grades (`lines 614-635`), each subject's grade is mapped to `GP` (`S=10, A=9, B=8, C=7, D=6, E=5, F=0`), averaged per semester (`$semGpSum / $semSubjCount`), and rounded to **2 decimal places** (`round($semGpSum / $semSubjCount, 2)`).
- **Cumulative Grade Point Average (CGPA)**:
  - Averaged across completed semesters (`round($totalGp / $semCount, 2)`, `line 636`), or taken from the latest semester's `student_semester_summary.cgpa` (`line 646`).
- **Diploma Classification Thresholds (`StudentAttendanceController.php:649-658`)**:
  - `CGPA >= 8.0` -> **`'First Class with Distinction'`** (`line 651`)
  - `CGPA >= 6.5` and `< 8.0` -> **`'First Class'`** (`line 653`)
  - `CGPA > 0` and `< 6.5` -> **`'Second Class'`** (`line 655`)
- **Progress Report Class Rank Tie-Breaking (`TutorController.php:805-841`)**:
  - Students in a classroom are sorted by:
    1. `has_marks` descending (`lines 808-810`)
    2. `grand_total_marks` descending (`lines 811-813`)
    3. `overall_attendance` descending (`lines 814-816`)
    4. `roll_no` ascending (`lines 817-819`)
  - Competition ranking assigns the same rank if `abs($st['grand_total_marks'] - $prevScore) < 0.01` (`line 829`).

---

## 6.4 Lab Batch Split Cutoffs & Workshop Section Allocation Rules

### 1. Lab Batch Split Modes & Roll Number Cutoffs (`batch_subjects` & `r26_student_lab_batches`)
- **Database Columns**:
  - `batch_subjects.lab_batch_mode` (`'full'` or `'split'`, default `'full'`) and `batch_subjects.lab_batch_cutoff` (nullable integer) (`database/migrations/2026_09_09_191438_add_lab_batch_config_to_batch_subjects.php:14-21`).
  - `r26_student_lab_batches` (`batch_subject_id`, `reg_no`, `lab_batch` `'1'` or `'2'`, `database/migrations/2026_07_22_000000_create_r26_student_lab_batches_table.php:14-25`).
- **Default Cutoff Constants & Resolution Hierarchy**:
  1. **Explicit Student Mapping (`r26_student_lab_batches`)**: Checked first (`AttendanceController.php:933-935`, `VirtualClassroomPracticalController.php:271-276`, `R26VirtualClassroomPracticalController.php:267-278`).
  2. **Subject Roll Number Cutoff (`batch_subjects.lab_batch_cutoff`)**:
     - If `roll_no <= lab_batch_cutoff` -> **Batch 1 (Batch A)**; if `roll_no > lab_batch_cutoff` -> **Batch 2 (Batch B)** (`AttendanceController.php:936-937`, `VirtualClassroomPracticalController.php:100-108`).
     - In `VirtualClassroomPracticalController::saveLabBatchConfig` (`app/Http/Controllers/VirtualClassroomPracticalController.php:85-115`), when `mode === 'split'`, the default `cutoff_roll_no` is **`25`** (`(int) $request->input('cutoff_roll_no', 25)` at `line 86`, validated `min:1|max:120` at `line 79`).
  3. **50/50 Half-Roster Fallback (`ceil(count / 2)`)**:
     - When no explicit mapping or cutoff exists, the student list (sorted by `roll_no ASC, LET last, name ASC`) is split at `$halfIndex = (int) ceil($totalStudents / 2.0)`: indices `< $halfIndex` become **Batch 1**, and indices `>= $halfIndex` become **Batch 2** (`R26VirtualClassroomPracticalController.php:275-282`, `R21VirtualClassroomWorkshopController.php:98-118`).
- **Auto-Detection of Split Lab Sessions During TEAMS PDF Import (`SbteSubjectLogImportController.php:885-905`)**:
  - When importing a TEAMS attendance sheet with `subBatch === 'Whole'` on a split lab subject:
    - If `b1PresCount > 0 && b2PresCount === 0` -> auto-tagged as Batch `"1"`.
    - If `b2PresCount > 0 && b1PresCount === 0` -> auto-tagged as Batch `"2"`.
    - If `b1PresCount >= 8 && b2PresCount <= 3` -> auto-tagged as Batch `"1"` (`line 898`).
    - If `b2PresCount >= 8 && b1PresCount <= 3` -> auto-tagged as Batch `"2"` (`line 900`).

### 2. Mechanical Workshop 6-Section Split (`R21VirtualClassroomWorkshopController.php:25-32, 66-69, 98-118`)
- **6 Trade Sections**: `['Machine shop', 'Fitting', 'Smithy', 'Welding', 'Sheet metal', 'Foundry']`.
- **Batch 1 Default Sections**: `['Fitting', 'Smithy', 'Welding']` (`line 67`).
- **Batch 2 Default Sections**: `['Machine shop', 'Sheet metal', 'Foundry']` (`line 68`).

---

## 6.5 Staff Leave Quotas, CCL Rules & Aided vs Self-Financing Workflows

### 1. Leave Financial Cycle & Quotas (`SfOfficeController.php`, `StaffLeaveController.php`)
- **Leave Financial Year Cycle (`SfOfficeController::getLeaveCycleDates`, `app/Http/Controllers/SfOfficeController.php:48-76`)**:
  - Runs from **April 1 (`04-01`) to March 31 (`03-31`)** of the following year (stored in `system_settings` keys `sf_office_leave_year_start = '04-01'` and `sf_office_leave_year_end = '03-31'`, `database/migrations/2026_10_08_000001_create_sf_office_tables.php:64-65`).
- **Casual Leave (CL) Annual Quota**:
  - **15.0 days per financial year** (`system_settings` key `sf_office_annual_cl_quota` default `'15'`, configurable between `1` and `50` at `SfOfficeController.php:51, 101, 187, 934, 955` and `StaffLeaveController.php:104`).
  - Remaining CL formula: `max(0.0, $clQuota - $clTaken)` (`SfOfficeController.php:249, 885`, `StaffLeaveController.php:113`).
- **Supported Leave Categories (`StaffLeaveController.php:176`, `SfOfficeController.php:760, 771-792`)**:
  - `'Casual Leave'` (`CL`)
  - `'Compensatory Casual Leave'` / `'Compensatory Leave (CCL)'` (`CCL`)
  - `'Duty Leave'` (`DL`)
  - `'Official Duty Leave'` (`ODL`)
  - `'Medical Leave'` (`ML`)
  - `'Loss of Pay'` / `'Loss of Pay (LOP)'` (`LOP`)
  - `'Maternity Leave'` / `'Other'` (`OTHERS`)
- **Session Types & Minimum Increment**:
  - `'Full Day'` (`1.0` day per calendar date: `abs(strtotime($toDate) - strtotime($fromDate)) / 86400 + 1`) or Half-Day `'FN'` / `'AN'` (`0.5` day, `StaffLeaveController.php:179-189`, `SfOfficeController.php:553-554`).

### 2. Compensatory Casual Leave (CCL) Earning & Validity Rules (`SfOfficeController.php:328-382, 635-690`)
- **Holiday / Weekend Eligibility (`lines 328-331, 353-358`)**:
  - Only biometric punches on **Sunday (`dayOfWeek === 0`)** or **Saturday (`dayOfWeek === 6`)** are flagged as `$isHoliday = true` and `$cclEligible = true`.
- **Duration Threshold for Full Day vs Half Day CCL (`line 357`)**:
  - If `$durationHours >= 5.5` **OR** (`$p->in_time && $p->out_time && $durationHours >= 4.0`) -> earns **`1.0` day** (`Full Day`).
  - Otherwise (if punched in on Saturday/Sunday with shorter duration or missing out-punch) -> earns **`0.5` day** (`Half Day`).
- **CCL Expiration Window (`lines 664-666, 714, 935, 956`)**:
  - Default validity is **60 days (2 months)** from `duty_date` (`system_settings` key `sf_office_ccl_validity_days = '60'`, configurable between `7` and `365` days):
    `$validUntil = Carbon::parse($request->duty_date)->addDays($validityDays)->format('Y-m-d')`.
  - Any credit with `valid_until < $today` and `status === 'Active'` is automatically marked `'Expired'` and excluded from `ccl_balance` (`lines 153-155, 206-209, 714-725`).
- **Duplicate Guard (`lines 656-662`)**:
  - Only one CCL credit row in `sf_staff_ccl_credits` is permitted per `staff_mobile` + `duty_date`.

### 3. Aided vs Self-Financing (SF) Stream Classification & Approval Hierarchy
- **Department Stream Classification (`StaffLeaveController::isSelfFinancingDepartment`, `app/Http/Controllers/StaffLeaveController.php:239-249`)**:
  - **Self-Financing (SF) Stream**: `'EL'`, `'CT'`, `'AU'`, `'SF'`, `'GEN_SF'`, `'GEN SF'`, `'GENERAL SF'`, `'ELECTRONICS'`, `'COMPUTER'`, `'AUTOMOBILE'`, `'COMPUTER TECH'`.
  - **Aided Stream**: `'CE'`, `'ME'`, `'EEE'`, `'GEN_AIDED'`, `'GEN AIDED'` (all other departments).
- **Approval Workflows**:
  1. **Standard Staff Leave Workflow (`StaffLeaveController.php:65-69, 200-204, 251-352`)**:
     - Initial submission status: `'Pending_HOD'` (`hod_status = 'Pending'`, `line 201`).
     - **Self-Financing Stream (`AU`, `CT`, `EL`, `GEN_SF`)**:
       - **Tier 1**: **HOD** approves -> sets `overall_status = 'Pending_Coordinator'`, `principal_status = 'N/A'` (`lines 296-298`).
       - **Tier 2 (Final)**: **SF Academic Coordinator** approves -> sets `overall_status = 'Approved'`, `principal_status = 'N/A'` (`lines 324-327`). *(Principal approval is completely bypassed for SF staff).*
     - **Aided Stream (`CE`, `ME`, `EEE`, `GEN_AIDED`)**:
       - **Tier 1**: **HOD** approves -> sets `overall_status = 'Pending_Principal'`, `coordinator_status = 'N/A'` (`lines 300-302`).
       - **Tier 2 (Final)**: **Principal** approves -> sets `overall_status = 'Approved'`, `coordinator_status = 'N/A'` (`lines 340-344`).
  2. **SF Office Verification Workflow (`SfOfficeController::processOfficeApproval`, `app/Http/Controllers/SfOfficeController.php:482-537`)**:
     - When processed via the SF Office console, SF Office approval sets `office_status = 'Approved'`, `overall_status = 'Pending_Coordinator'`, and forwards to the **SF Academic Coordinator** as final authority (`lines 516-525`).

---

## 6.6 Biometric Face Attendance, Geofence Coordinates & Punch Time Windows

Implemented in `StaffAttendanceMobileController` (`app/Http/Controllers/StaffAttendanceMobileController.php`) and `database/migrations/2026_08_10_000001_create_sf_attendance_tables.php`:

1. **Staff Eligibility Guard (`StaffAttendanceMobileController.php:55-69, 180-196`)**:
   - Biometric GPS/face punching is restricted exclusively to **Self-Financing (SF)** branches (`'EL'`, `'CT'`, `'AU'`, `'GEN_SF'`, `'SF'`) and management roles (`SUPER_ADMIN`, `PRINCIPAL`, `ADMIN`, `CHAIRMAN`, `ACADEMIC_COORDINATOR_SF`, `GEN_DEPT_COORDINATOR_SELF_FINANCE`).
2. **Campus Geofence Coordinates & Radius (`StaffAttendanceMobileController.php:19-35, 78-87, 231-247, 360-387`, `2026_08_10_000001_create_sf_attendance_tables.php:17-38`)**:
   - Default Campus Centroid: **Latitude `10.23120000`**, **Longitude `76.20450000`** (`Carmel Polytechnic College Campus`).
   - Default Allowed Geofence Radius: **`150` meters** (configurable via `saveGeofenceSetup` between `min:10` and `max:5000` meters, `line 385`).
   - Default Max GPS Accuracy Tolerance: **`30` meters** (configurable between `min:5` and `max:200` meters, `line 386`).
   - Distance Formula: **Haversine great-circle formula** with Earth radius **`6371000` meters** (`lines 19-35`).
   - Strict Enforcement: If `$distance > $allowedRadius`, the punch is rejected with HTTP `422` (`OUTSIDE_PREMISES`, `lines 238-247`).
3. **Biometric Face Match & Liveness Thresholds (`StaffAttendanceMobileController.php:168, 212-229, 276-277, 827-848`)**:
   - Embedding Format: **128-float** facial feature descriptor vector (`2026_08_10_000001_create_sf_attendance_tables.php:48`).
   - Comparison Metric: **Cosine Similarity** ($\frac{A \cdot B}{\|A\|\|B\|}$, `lines 827-848`).
   - **Minimum Face Match Threshold**: **`similarity >= 0.42` (42% match)** (`line 222`). Any similarity `< 0.42` is rejected with HTTP `422` (`"❌ Biometric Mismatch!"`).
   - **Liveness Detection**: `liveness_type = 'SMILE'`, default `liveness_score = 0.85` (`lines 168, 276-277`), default schema `biometric_confidence = 95.00` (`2026_08_10_000001_create_sf_attendance_tables.php:73`).
4. **Punch-In & Punch-Out Time Windows (`StaffAttendanceMobileController.php:287-336`)**:
   - **Morning IN Windows (`lines 287-294`)**:
     - `< '08:45'`: **`'EARLY_IN'`**
     - `'08:45'` to `'09:15'` (inclusive): **`'PRESENT'`**
     - `> '09:15'`: **`'LATE_IN'`**
   - **Minimum Cooldown Between IN and OUT (`lines 304-311`)**:
     - Requires Morning IN to exist first (`lines 297-302`) and at least **`30` seconds** (`$elapsedSeconds < 30`) to have elapsed since `in_time`.
   - **Evening OUT Windows (`lines 320-335`)**:
     - `< '16:00'`: **`'{IN_STATUS} & EARLY_OUT'`**
     - `'16:00'` to `'16:30'` (inclusive): **`'{IN_STATUS} & COMPLETED'`**
     - `> '16:30'`: **`'{IN_STATUS} & LATE_OUT'`**

---

## 6.7 Activity Points Categories, Caps & Goal Thresholds

Implemented in `ActivityPointsController.php` (`app/Http/Controllers/ActivityPointsController.php`), `StudentAttendanceController.php:668-672`, `TutorController.php:425-427`, `routes/web.php:1509-1510`, and `resources/views/student_dashboard.blade.php:696-727`:

1. **8 Activity Segments (`resources/views/student_dashboard.blade.php:699-706`)**:
   - `'NCC'`
   - `'NSS'`
   - `'Sports & Games'`
   - `'Cultural Activities'`
   - `'Professional Self Initiatives'`
   - `'Entrepreneurship and Innovation'`
   - `'Leadership & Management'`
   - `'Disaster Management'`
2. **5 Participation Levels (`resources/views/student_dashboard.blade.php:717-721`)**:
   - `'Level I - College'`
   - `'Level II - Zonal'`
   - `'Level III - State/Univ'`
   - `'Level IV - National'`
   - `'Level V - International'`
3. **Per-Claim Input Cap**:
   - Student claim form enforces `min="1" max="50"` points per single claim (`resources/views/student_dashboard.blade.php:726`).
   - Only claims with `status === 'Verified'` by the Tutor count toward `total_points` (`ActivityPointsController.php:24-25, 115-121, 133-134`).
4. **Cumulative Diploma Activity Point Goal (with Codebase Discrepancy)**:
   - **Student & Tutor Dashboards (`StudentAttendanceController.php:670-671`, `TutorController.php:426-427`)**:
     - **Regular Students**: **60 points** (`$activityGoal = 60`).
     - **Lateral Entry (`LET`) Students** (`admission_type === 'LET'` or `reg_no` / `sbte_reg_no` ending with `'L'`): **40 points** (`$activityGoal = 40`).
   - **HOD Activity Points Print Audit (`routes/web.php:1509-1510`, `resources/views/hod_activity_points_report_print.blade.php:100, 125-130, 161`)**:
     - Uses a hard-coded threshold of **75 points** (`$completionStatus = $awardedTotal >= 75 ? 'Met' : 'Deficient'`) for all students without a Lateral Entry reduction.

---

## 6.8 Remedial Coaching & Indirect Survey Thresholds

### 1. Remedial Coaching Rules (`RemedialController.php`, `app/Http/Controllers/RemedialController.php`)
- **Active Semester Filter**: Only subjects belonging to classrooms with `current_semester <= 6` are listed for remedial room creation (`RemedialController.php:33`).
- **Default Parameters**:
  - Default session duration: **`60` minutes** (`line 264`).
  - Default remedial assessment max marks: **`20` marks** (`line 287`; fallback `100` in analysis calculation if missing at `line 519`).
- **Remedial Improvement Threshold (`RemedialController.php:510-535`)**:
  - Evaluates the student's latest remedial assessment percentage (`$latestPercent = ($latestScoreVal / $maxMark) * 100`, `line 521`):
    - **`>= 50%`**: `improvement_status = 'Improved'`, `remark = 'Satisfactory progress'` (`lines 523-525`).
    - **`< 50%`**: `improvement_status = 'Marginal'`, `remark = 'Need improvement'` (`lines 526-529`).
    - **0 Tests Attended**: `improvement_status = 'No Tests'`, `remark = 'Requires attention'` (`lines 511-512`).
  - If a student attended **100% of conducted remedial sessions** (`$presentCount == count($logs) && count($logs) > 0`), `$remark` is overridden to **`'Regular & Active'`** (`lines 532-534`).

### 2. Mid-Semester & Course Exit Survey Rating Scales (`MidSemSurveyController.php`, `CourseExitSurveyController.php`)
- **Rating Scale (`MidSemSurveyController.php:290-298`, `CourseExitSurveyController.php:252-261`)**:
  - All quantitative survey questions use a **3-point Likert scale** (`min:1|max:3`: `3` = High/Good, `2` = Medium/Satisfactory, `1` = Low/Needs Improvement).
- **Satisfaction Rate Threshold (`MidSemSurveyController.php:428-429`, `CourseExitSurveyController.php:382-383`)**:
  - Percentage of respondents scoring **`>= 2`** (`round(($satisfied / $respondedCount) * 100, 1)`).
- **Survey CO Attainment Percentage & Level Mapping (`CourseExitSurveyController.php:144-180, 401-428`, `AttainmentService.php:106-135`)**:
  - Average score on the `1..3` scale is converted to percentage via `round(($avgCo / 3) * 100, 1)`.
  - Mapped to NBA Indirect Attainment Levels:
    - `>= 70%` -> **Level 3 (`High`)**
    - `>= 60%` and `< 70%` -> **Level 2 (`Medium`)**
    - `>= 50%` and `< 60%` -> **Level 1 (`Low`)**
    - `< 50%` -> **Level 0 (`Nil`)**

---

# SECTION 7: INTEGRATIONS & JOBS

---

## 7.1 Scheduled Commands, Artisan Commands & Deployment Daemons

### Missing Console Router & Custom Artisan Commands
- **Broken Console Route Registration**: `bootstrap/app.php:10` registers `commands: __DIR__.'/../routes/console.php'`, but the file `routes/console.php` does **not** exist in the repository (`routes/` contains only `routes/web.php:1-2464`).
- **Zero Custom Artisan Commands**: The `app/Console/` directory does **not** exist (`app/` contains only `app/Http/`, `app/Models/`, `app/Providers/`, and `app/Services/`). There are no `app/Console/Commands/*` classes or `Schedule::` definitions anywhere in the codebase.

### Container & Server Process Configuration (No Cron or Queue Daemons)
- **Supervisor Configuration**: `docker/supervisord.conf:1-21` supervises only two foreground processes:
  - `[program:php-fpm]` running `php-fpm -F` (`docker/supervisord.conf:7-13`).
  - `[program:nginx]` running `nginx -g "daemon off;"` (`docker/supervisord.conf:15-21`).
  - No `[program:cron]`, `php artisan schedule:run`, or `php artisan queue:work` process is configured in `docker/supervisord.conf:1-21` or `Dockerfile:1-41`.
- **Host Provisioning Script**: `deploy/setup_server.sh:1-63` installs Apache2, MariaDB, PHP 8.2, Composer, and Node.js (`deploy/setup_server.sh:9-23`), runs `php artisan migrate --force` (`deploy/setup_server.sh:47`), and restarts `apache2` (`deploy/setup_server.sh:56`), with zero cron tab installation or systemd queue worker service definitions.

### Pseudo-Scheduled Features Implemented via Lazy Read-Time Evaluation
Because no scheduler daemon exists, features labelled as "scheduled" in the UI store timestamps in the database and rely on read-time filtering during HTTP requests:
1. **Executive Flash Notices (`app/Http/Controllers/ExecutiveFlashNoticeController.php:17-199`)**:
   - `broadcast()` validates `dispatch_type` as `in:instant,scheduled` and `scheduled_at` as `nullable|date` (`app/Http/Controllers/ExecutiveFlashNoticeController.php:27-28`).
   - When `dispatch_type === 'scheduled'`, it sets `$isPublished = false` (`app/Http/Controllers/ExecutiveFlashNoticeController.php:53-55`) and skips Web Push dispatch because push only triggers `if ($isPublished)` (`app/Http/Controllers/ExecutiveFlashNoticeController.php:74-86`).
   - **Critical Logic Bug**: When dashboards poll `GET /api/flash-notices/active` (`routes/web.php:2440`), `getActiveNotices()` filters by `where('is_published', true)` at the top level (`app/Http/Controllers/ExecutiveFlashNoticeController.php:163`) before checking `->where(function ($q) { $q->where('dispatch_type', 'instant')->orWhere(function ($sq) { $sq->where('dispatch_type', 'scheduled')->where('scheduled_at', '<=', now()); }); })` (`app/Http/Controllers/ExecutiveFlashNoticeController.php:165-171`). Because no background command ever transitions `is_published` from `false` to `true`, scheduled flash notices never appear in `getActiveNotices()` and never trigger push notifications.
2. **Principal Scheduled Campus Events (`app/Http/Controllers/PrincipalScheduledEventController.php:18-308`)**:
   - Stores `event_date`, `start_time`, and `end_time` (`app/Http/Controllers/PrincipalScheduledEventController.php:50-71`) and evaluates `whereDate('event_date', '>=', now()->toDateString())` on HTTP read (`app/Http/Controllers/PrincipalScheduledEventController.php:141, 169-170`).
3. **Auto-Scheduled Online Tests (`app/Http/Controllers/TestEngineController.php:487-537`)**:
   - `publishOnlineTest()` stores `start_time`, `end_time`, and `is_auto_scheduled` in `test_configs` (`app/Http/Controllers/TestEngineController.php:497-506`) and immediately sends a Web Push notification at publish time (`app/Http/Controllers/TestEngineController.php:521-531`) rather than at `start_time`.

---

## 7.2 Queues & Synchronous Background Processing

### Queue Configuration vs Reality
- **Configuration (`config/queue.php:1-129`)**:
  - Default connection is `'default' => env('QUEUE_CONNECTION', 'database')` (`config/queue.php:16`).
  - Database queue driver points to table `env('DB_QUEUE_TABLE', 'jobs')` (`config/queue.php:39`), while `batching.database` (`config/queue.php:106`) and `failed.database` (`config/queue.php:125`) default to `env('DB_CONNECTION', 'sqlite')`.
  - `.env.example:1-36` does **not** define `QUEUE_CONNECTION`.
- **Zero Queue Jobs**:
  - The `app/Jobs/` directory does **not** exist.
  - Zero calls to `dispatch()`, `dispatchSync()`, `Queue::push()`, or `ShouldQueue` exist anywhere in `app/` or `routes/`.

### Heavy Operations Run Synchronously Inside HTTP Request Lifecycle
All compute-intensive, I/O-bound, and external network operations block the PHP-FPM worker synchronously during user HTTP requests:
1. **Runtime `set_time_limit()` Mutations for Multi-Call AI Loops**:
   - `app/Http/Controllers/ClassroomController.php:1940` calls `set_time_limit(300)` inside `generateAssignmentQuestions()` before looping over Course Outcomes (`CO1`–`CO6`) and making sequential synchronous HTTP requests (up to 60s timeout each) to the Gemini API (`app/Http/Controllers/ClassroomController.php:1975-2010`).
   - `app/Http/Controllers/ClassroomController.php:4911-4914` calls `session_write_close()` (`line 4913`) and `set_time_limit(180)` (`line 4914`) inside `generateAnswerKeyForScheme()` to avoid locking the user's file/DB session while waiting up to 60 seconds (`line 4963`) for Gemini to generate an answer key.
2. **Synchronous Subprocess Execution (`shell_exec`) for Python PDF Parsing**:
   - Syllabus upload endpoints spawn Python 3 child processes synchronously via `shell_exec()` during the HTTP POST request (`app/Http/Controllers/R26ClassroomController.php:543`, `app/Http/Controllers/R26VirtualClassroomPracticalController.php:428, 458`, `app/Http/Controllers/R26VirtualClassroomDrawingController.php:491`, `app/Http/Controllers/R26VirtualClassroomHealthPhysicalController.php:582`, `app/Http/Controllers/R26VirtualClassroomPracticumController.php:884`).
3. **Synchronous cURL Loop Over Push Notification Subscriptions**:
   - `app/Services/PushNotificationService.php:45-65` iterates over every row in `push_subscriptions` matching the target audience and executes a blocking `curl_exec($ch)` with `CURLOPT_TIMEOUT => 3` (`app/Services/PushNotificationService.php:54`) inside a `foreach` loop on the caller's HTTP thread.
4. **Synchronous Full-Database Dump & Google Drive Upload**:
   - `app/Http/Controllers/BackupController.php:15-70` (`triggerGoogleDriveBackup`) and `lines 76-127` (`downloadLocalBackup`) run `SHOW TABLES` (`lines 21, 88`) and `SELECT * FROM {$tableName}` (`lines 36, 100`) for every table in memory, build a single monolithic `$sqlContent` string, and upload it over OAuth2 to Google Drive (`lines 56, 173-229`) within the synchronous request cycle.

---

## 7.3 Mail, SMS, WhatsApp & Web Push Notification Providers

### Mail (`config/mail.php`, `.env.example`, `routes/web.php`, `AuthController.php`)
- **Configuration**:
  - `config/mail.php:17` sets `'default' => env('MAIL_MAILER', 'log')`.
  - `.env.example:29-36` configures Gmail SMTP (`MAIL_MAILER=smtp`, `MAIL_HOST=smtp.gmail.com`, `MAIL_PORT=587`, `MAIL_ENCRYPTION=tls`, `MAIL_FROM_NAME="Carmel Linx Support"`).
- **Single Active Mail Call (`routes/web.php:166-240`)**:
  - `POST /api/auth/recover-account` looks up the submitted email in `students` (`routes/web.php:174`) or `staff_profiles` (`routes/web.php:181`), overwrites the user's `password` column in plaintext with `Str::random(8)` (`routes/web.php:196-203`), and sends an inline HTML email synchronously via `Illuminate\Support\Facades\Mail::send([], [], function ($message) ...)` (`routes/web.php:206-228`).
- **Stubbed/Unimplemented Forgot-Password Endpoint (`app/Http/Controllers/AuthController.php:416-449`)**:
  - `AuthController::forgotPassword()` generates a 64-character token and upserts it into `password_reset_tokens` (`app/Http/Controllers/AuthController.php:438-443`), has `// Mail::to($email)->send(new ResetPasswordMail($token));` commented out (`line 446`, and no `App\Mail` namespace exists in the project), yet still returns `{'status': 'SUCCESS', 'message': 'A password reset link has been securely sent to your email address!'}` (`line 448`).

### SMS & WhatsApp (Client-Side Deep Links Only — Zero Server Gateways)
- No server-side SMS or WhatsApp SDK/API exists in `composer.json:1-65` or `config/services.php:1-42`.
- **Native `sms:` URI Scheme for Parent Portal**:
  - `app/Http/Controllers/ParentDashboardController.php:112, 392-395` computes a 12-character deterministic MD5 token:
    `$expectedToken = substr(md5($student->reg_no . ($student->guardian_mobile ?: $student->phone) . 'CarmelR26ParentSecret'), 0, 12);`
    and builds `$smsShareUrl = url("/parent/dashboard/{$student->reg_no}?token={$expectedToken}")` (`line 395`).
  - `resources/views/parent_dashboard.blade.php:599-600` embeds this URL in an HTML `<a href="sms:{{ $student->guardian_mobile ?: $student->phone }}?body={{ urlencode('Carmel Poly: View ward status: ' . $smsShareUrl) }}">` anchor tag so the user's mobile device opens its native SMS app.
- **Clipboard Copy for WhatsApp/SMS Survey Sharing**:
  - `resources/views/r21_project/virtual_classroom_project.blade.php:2539-2543` copies the survey link via `navigator.clipboard.writeText(url)` and displays an alert instructing staff to paste it into WhatsApp or SMS.

### Web Push Notifications (`PushNotificationController.php`, `PushNotificationService.php`, `push_notification_prompt.blade.php`, `public/sw.js`)
- **Missing Server Library**: `composer.json:8-14` does **not** install `minishlink/web-push` or any Web Push encryption/VAPID library; `config/services.php:1-42` and `.env.example:1-36` contain no `VAPID_PUBLIC_KEY` or `VAPID_PRIVATE_KEY`.
- **Client-Side Registration & Hardcoded Dummy VAPID Key (`resources/views/partials/push_notification_prompt.blade.php:1-136`)**:
  - Included in `resources/views/student_mobile_dashboard.blade.php:2909` and `resources/views/staff_mobile_dashboard.blade.php:6286`.
  - Registers `/sw.js` via `navigator.serviceWorker.register('/sw.js')` (`resources/views/partials/push_notification_prompt.blade.php:78`).
  - Attempts `reg.pushManager.subscribe()` (`lines 87-90`) using a hardcoded fabricated string:
    `const dummyVapidKey = 'BEl62iUYgUivxIkv69yViEuiBIa1F9dF8Z0x-7x0-w2q3e4r5t6y7u8i9o0p';` (`line 84` — note the literal keyboard sequence `w2q3e4r5t6y7u8i9o0p` at the end).
  - **Fake FCM Endpoint Fallback (`lines 90-96`)**: When `pushManager.subscribe()` rejects due to the invalid P-256 public key, the `.catch()` handler returns a fabricated object with a random non-existent FCM URL:
    `endpoint: 'https://fcm.googleapis.com/fcm/send/carmel-' + Math.random().toString(36).substring(2), getKey: () => null` (`lines 92-95`) and POSTs it to `/api/notifications/subscribe` (`lines 113-125`).
- **Service Worker (`public/sw.js:1-74`)**:
  - Listens for `'push'` events (`public/sw.js:18-50`), parses `event.data.json()` (`line 23`), and calls `self.registration.showNotification(title, options)` (`line 49`).
  - Handles `'notificationclick'` (`public/sw.js:53-73`) to focus or open `event.notification.data.url`.
- **Broken Server-Side Push Dispatcher (`app/Services/PushNotificationService.php:1-96`)**:
  - `subscribe()` (`lines 13-27`) stores `endpoint`, `p256dh_key`, and `auth_key` in `push_subscriptions` (`database/migrations/2026_03_29_051302_create_push_subscriptions_table.php:14-24`).
  - `dispatchPayload()` (`lines 32-68`) reads matching rows from `push_subscriptions` (`line 34`) and sends raw JSON (`json_encode(['title' => $title, 'body' => $body, 'icon' => '/images/carmel-logo.png', 'url' => $actionUrl])`, `lines 38-43`) via raw `curl_exec()` (`line 59`) with `Content-Type: application/json` (`line 53`).
  - It performs **zero RFC 8291 payload encryption** (completely ignoring `$sub->p256dh_key` and `$sub->auth_key`) and **zero RFC 8292 VAPID JWT signing** (no `Authorization` or `Crypto-Key` headers), and unconditionally increments `$sentCount++` (`line 60`) whenever `curl_errno($ch)` is `0` regardless of HTTP 400/401/403/404 response codes from FCM/WebPush endpoints.
- **Push Dispatch Call Sites**:
  - `app/Http/Controllers/PushNotificationController.php:14-75`: `POST /api/notifications/subscribe` (`line 14`) and `POST /api/notifications/broadcast` (`line 42`).
  - `app/Http/Controllers/ExecutiveFlashNoticeController.php:74-86`: Broadcasts to all, role-specific, or user-specific subscribers when an instant flash notice is published.
  - `app/Http/Controllers/StaffBirthdayController.php:159-169`: Sends a birthday wish notification to the celebrant's `mobile_no`.
  - `app/Http/Controllers/TestEngineController.php:521-531`: Broadcasts to all `'Student'` subscribers when an online test is published.

---

## 7.4 AI Providers & Integrations

### Configuration & System Toggles
- **API Key Configuration**:
  - `config/services.php:38-40` defines `'gemini' => ['key' => env('GEMINI_API_KEY')]`.
  - `.env.example:27` defines `GEMINI_API_KEY=`.
  - Controllers retrieve the key using `config('services.gemini.key') ?: env('GEMINI_API_KEY')` (e.g., `app/Http/Controllers/ClassroomController.php:300`, `app/Http/Controllers/CarmieAssistantController.php:154`) or `env('GEMINI_API_KEY')` directly (`app/Http/Controllers/AcademicCalendarController.php:110`, `app/Http/Controllers/R26VirtualClassroomPracticumController.php:2855`).
- **Conflicting Database Kill-Switches (`system_settings`)**:
  - `app/Http/Controllers/SystemSettingController.php:15-24, 52-55` checks and updates `DB::table('system_settings')->where('key', 'ai_generation_enabled')->value('value')` (created in `database/migrations/2026_03_20_165656_create_system_settings_table.php`).
  - `app/Http/Controllers/CarmieAssistantController.php:50-56` instead queries `\DB::table('system_settings')->where('setting_key', 'gemini_ai_active')->first()` and checks `$aiSetting->setting_value` — referencing non-existent column names `setting_key` and `setting_value`, which throws a SQL exception caught and ignored by `catch (\Exception $e) {}` (`line 55`), leaving the kill-switch ineffective in `CarmieAssistantController`.

### Complete Inventory of Google Gemini API Integrations (10 Call Sites Across 6 Controllers)
All 10 call sites invoke Google's Generative Language REST API v1beta using model **`gemini-2.5-flash`** at endpoint `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={$apiKey}`:

| # | Controller & Method | Citation (`file:line`) | HTTP Client Options & Generation Config | Purpose & Fallback Behavior |
|---|---|---|---|---|
| 1 | `CarmieAssistantController::queryGemini` (invoked by `ask`) | `app/Http/Controllers/CarmieAssistantController.php:59-65, 152-228` | `Http::timeout(8)` (`line 205`), `temperature: 0.2`, `maxOutputTokens: 800` (`line 209`) | Answers user help queries ("Carmie Assistant") using top-3 scored playbook entries from `CarmiePlaybookService` (`lines 157-189`). Falls back to local deterministic playbook synthesis (`lines 68-70`) and logs queries to `storage/app/carmie_query_model.json` (`app/Services/CarmiePlaybookService.php:283`). |
| 2 | `AcademicCalendarController::parsePdf` | `app/Http/Controllers/AcademicCalendarController.php:94-240` | `Http::timeout(55)` (`line 174`), `temperature: 0.1`, `maxOutputTokens: 4096` (`lines 180-183`) | Parses raw text (truncated to 12,000 chars, `line 137`) extracted by `Smalot\PdfParser\Parser` from SITTTR Academic Calendar PDFs into structured JSON events (`semester_start_odd`, `series_1_exam`, `vacation_dates`, etc., `lines 141-170`). Note: docblocks at `lines 91, 139` say "Gemini 1.5 Flash", but `line 175` calls `gemini-2.5-flash`. |
| 3 | `ClassroomController::uploadSyllabus` | `app/Http/Controllers/ClassroomController.php:261-354` | `Http::post(...)` (default 30s timeout, `line 305`), `responseMimeType: 'application/json'` (`lines 310-312`) | Parses R2021 syllabus PDF text (truncated to 18,000 chars, `line 303`) into JSON containing `course_outcomes`, `co_po_mapping`, `modules`, `textbooks`, and `lesson_plans`. Note: `lines 399-410` explicitly overwrite Gemini's `co_po_mapping` using deterministic regex (`extractCoPoMapping`, `lines 537-656`) with comment `"ALWAYS override co_po_mapping with our deterministic PHP Regex parser to avoid Gemini hallucinations"` (`line 400`). If `GEMINI_API_KEY` is missing or fails, falls back to hardcoded subject `3043` data or generic placeholders (`lines 190-259, 344-353`). |
| 4 | `ClassroomController::generateAssignmentQuestions` | `app/Http/Controllers/ClassroomController.php:1938-2069` | `set_time_limit(300)` (`line 1940`), `Http::timeout(60)` (`line 2010`), `responseMimeType: 'application/json'` (`line 2015`) | Loops through target Course Outcomes (`CO1`–`CO4`), prompting `gemini-2.5-flash` to generate 3 descriptive 5-mark assignment questions with answer keys per CO (`lines 1986-2007`), and upserts them into `question_bank` (`lines 2039-2059`). Falls back to `question_bank` DB records or template strings (`lines 1966-1970, 2029-2035`). |
| 5 | `ClassroomController::generateSummativePaper` | `app/Http/Controllers/ClassroomController.php:2261-2418` | `Http::timeout(60)` (`line 2364`), `responseMimeType: 'application/json'` (`line 2369`) | Generates a 40-mark or 30-mark Series Exam question paper (`part_a` 1-mark, `part_b` 3-mark, `part_c` 7-mark) with `answer_key` and `scheme` (`lines 2331-2361`). Falls back to pulling random questions from `question_bank` or generating placeholder text (`lines 2281-2323, 2386-2412`). |
| 6 | `ClassroomController::seedAiQuestionBank` | `app/Http/Controllers/ClassroomController.php:4744-4835` | `Http::post(...)` (default timeout, `line 4777`), `responseMimeType: 'application/json'` (`line 4781`) | Loops across `['CO1', 'CO2', 'CO3', 'CO4']` (`line 4760`), calling `gemini-2.5-flash` 4 times in sequence to generate 2 MCQs and 2 Descriptive questions per CO and insert them into `question_bank` (`lines 4800-4821`). |
| 7 | `ClassroomController::generateAnswerKeyForScheme` | `app/Http/Controllers/ClassroomController.php:4909-4982` | `set_time_limit(180)` (`line 4914`), `Http::withoutVerifying()->timeout(60)` (`line 4963`) | Generates a concise answer key (`answer_key`) and mark split-up (`scheme_key`) for a single question (`lines 4946-4960`) and saves it back to `summative_tests.questions_json` or `question_bank` (`lines 4985-5035`). Disables TLS certificate verification via `withoutVerifying()` (`line 4963`). |
| 8 | `R26VirtualClassroomPracticumController::generateSeriesQp` | `app/Http/Controllers/R26VirtualClassroomPracticumController.php:2838-2970` | `Http::timeout(60)` (`line 2924`), `temperature: 0.4`, `responseMimeType: 'application/json'` (`lines 2928-2931`) | Generates R2026 Practicum Series Exam papers for 3 modes (`practical_series`, `table_4_2_design`, `table_4_1_standard`, `lines 2873-2920`) and stores them in `r26_practicum_series_qps` (`lines 2956-2963`). |
| 9 | `StudentMockTestController::startMockTest` | `app/Http/Controllers/StudentMockTestController.php:147-231` | `Http::timeout(45)` (`line 201`), `responseMimeType: 'application/json'` (`line 206`) | Generates up to 10 on-the-fly practice MCQs when `question_bank` has fewer than `$neededCount` questions (`lines 125-146`), and caches generated questions back into `question_bank` (`lines 213-225`). |
| 10 | `TestEngineController::generateQuestionsPayload` | `app/Http/Controllers/TestEngineController.php:317-368` | `Http::timeout(30)` (`line 339`), `responseMimeType: 'application/json'` (`line 342`) | Generates MCQs per Course Outcome for scheduled/instant online tests when `$sourceMode === 'ai'` or when `question_bank` lacks questions (`lines 296-315`), saving new items into `question_bank` (`lines 352-363`). |

> **Note on Other Controllers Mentioned in Architecture**: `DataController.php`, `R26DataController.php`, `SbteSubjectLogImportController.php`, and `CourseFileController.php` do **not** make external AI API calls; `R26ClassroomController.php` and the other R26 controllers rely on local Python `pypdf` scripts (`app/Services/r26_*_parser.py`) instead of Gemini.

---

## 7.5 Google Drive Cloud Backup Integration (`BackupController.php`)

- **OAuth2 Refresh Token Flow (`app/Http/Controllers/BackupController.php:173-229`)**:
  - Reads `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `GOOGLE_DRIVE_REFRESH_TOKEN`, and optional `GOOGLE_DRIVE_FOLDER_ID` directly via `env()` (`app/Http/Controllers/BackupController.php:175-178`; declared in `.env.example:23-26`, not mapped in `config/services.php`).
  - POSTs to `https://oauth2.googleapis.com/token` with `grant_type=refresh_token` (`app/Http/Controllers/BackupController.php:185-190`) to obtain a short-lived `$accessToken` (`line 199`).
  - Uploads the SQL dump via `multipart/related` POST to `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart` (`app/Http/Controllers/BackupController.php:203-222`).

---

## 7.6 Server-Side & Client-Side Libraries

### Server-Side Composer Packages (`composer.json:8-24`)
| Package | Version | Key Usage Locations (`file:line`) |
|---|---|---|
| `laravel/framework` | `^11.31` (`composer.json:10`) | Core framework (`bootstrap/app.php:1-24`). |
| `barryvdh/laravel-dompdf` | `^3.1` (`composer.json:9`) | Server-side A4 PDF generation via `\PDF::loadView()` or `\Barryvdh\DomPDF\Facade\Pdf::loadView()` in `app/Http/Controllers/CourseFileController.php:205`, `app/Http/Controllers/MentoringController.php:1282, 1299, 2010`, `app/Http/Controllers/R26ClassroomController.php:3379`, `app/Http/Controllers/ExecutiveControlDeskController.php:399`, `app/Http/Controllers/StaffLeaveController.php:335`. |
| `smalot/pdfparser` | `^2.12` (`composer.json:13`) | Pure-PHP PDF text extraction in `app/Http/Controllers/AcademicCalendarController.php:122`, `app/Http/Controllers/ClassroomController.php:8, 50`, `app/Http/Controllers/SbteSubjectLogImportController.php:17, 90`, and `app/Http/Controllers/TutorSpecialAttendanceController.php:13, 466`. |
| `phpoffice/phpspreadsheet` | `^5.10` (`composer.json:12`) | Spreadsheet/HTML table parsing via `IOFactory::load()` in `app/Http/Controllers/SbteSubjectLogImportController.php:18-19, 199`. (**Not** used in `app/Http/Controllers/BatchStudentUploadController.php:84-93, 210-213`, which parses `.xls` HTML files via regex `preg_match_all` and CSVs via `fgetcsv`). |
| `laravel/tinker` | `^2.9` (`composer.json:11`) | Interactive REPL. |

### Server-Side Python Subprocess Scripts (`app/Services/*.py`)
Because `smalot/pdfparser` struggled with R2026 multi-column syllabus tables, five R26 controllers shell out via `shell_exec()` to Python 3 scripts using `pypdf` (`PdfReader`):
1. `app/Services/r26_syllabus_parser.py:1-511` — Invoked by:
   - `app/Http/Controllers/R26ClassroomController.php:538-543` (passes `python3 -c "import sys; sys.path.append('$sitePkg'); ..."`).
   - `app/Http/Controllers/R26VirtualClassroomPracticalController.php:424-428` (tries `['python', 'python3', 'py']`).
   - `app/Http/Controllers/R26VirtualClassroomPracticumController.php:873-884`.
2. `app/Services/r26_drawing_syllabus_parser.py:1-263` — Invoked by `app/Http/Controllers/R26VirtualClassroomDrawingController.php:484-491`.
3. `app/Services/r26_health_physical_syllabus_parser.py:1-182` — Invoked by `app/Http/Controllers/R26VirtualClassroomHealthPhysicalController.php:575-582`.
4. `app/Services/parse_sbte_subject_log.py:1-105` — Standalone Python `pypdf` parser for SBTE attendance & subject log PDFs.
5. **Runtime-Generated Python Script (`storage/app/scratch_r26_dump.py`)**: `app/Http/Controllers/R26VirtualClassroomPracticalController.php:450-459` dynamically writes a Python script to `storage_path('app/scratch_r26_dump.py')` using `file_put_contents()` and executes it via `shell_exec("$py " . escapeshellarg($dumpPy) . " " . escapeshellarg($fullPath))` when the primary parser finds no lab experiments.

### Client-Side NPM (`package.json:1-17`) & CDN Libraries in Blade Views
- **NPM (`package.json:9-16`)**: Declares `@tailwindcss/vite` (`^4.0.0`), `tailwindcss` (`^4.0.0`), `axios` (`^1.11.0`), `concurrently` (`^9.0.1`), `laravel-vite-plugin` (`^2.0.0`), and `vite` (`^7.0.7`).
- **CDN Script & Stylesheet Sprawl Across Blade Views** (most views bypass Vite completely and load libraries from CDNs):
  - **Three Competing CSS Frameworks**:
    - Tailwind CSS v4 Browser JIT CDN (`https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4`) in `resources/views/lecturer_dashboard.blade.php:10`, `resources/views/hod_dashboard.blade.php:13`, `resources/views/student_dashboard.blade.php:10`, `resources/views/tutor_dashboard.blade.php:10`, `resources/views/admin_control_desk.blade.php:10`.
    - Tailwind CSS v2.2.19 static stylesheet (`https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css`) in `resources/views/academic_coordinator_dashboard.blade.php:17` and `resources/views/partials/carmie_widget.blade.php:6`.
    - Bootstrap 5.3.0 CSS & JS Bundle (`https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css` and `bootstrap.bundle.min.js`) loaded **on the exact same page as Tailwind v2** in `resources/views/academic_coordinator_dashboard.blade.php:14, 17, 745`.
  - **SheetJS / `xlsx` (`0.18.5`)**: Loaded from `https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js` in `resources/views/tutor_dashboard.blade.php:12` (used at `lines 3035-3066`) and dynamically injected in `resources/views/lecturer_dashboard.blade.php:9397-9422` for client-side `.xlsx` template generation and mark sheet parsing.
  - **Chart.js**: Loaded from `https://cdn.jsdelivr.net/npm/chart.js` in `resources/views/student_dashboard.blade.php:1331`, `resources/views/student_mobile_dashboard.blade.php:21`, `resources/views/student_mentoring_diary_full.blade.php:9, 867`, `resources/views/tutor_student_diary_full.blade.php:9, 861`, and `resources/views/lecturer_dashboard.blade.php:9743`.
  - **SweetAlert2 (`@11`)**: Loaded from `https://cdn.jsdelivr.net/npm/sweetalert2@11` in `resources/views/r26_practicum/virtual_classroom_practicum.blade.php:17`, `resources/views/r21_project/virtual_classroom_project.blade.php:17`, `resources/views/r21_seminar/virtual_classroom_seminar.blade.php:16`, `resources/views/r26/course_file_preparation.blade.php:11`.
  - **KaTeX (`0.16.8` & `0.16.9`)**: Loaded from `https://cdn.jsdelivr.net/npm/katex@0.16.9/...` in `resources/views/classroom_assignment_print.blade.php:8-10`, `resources/views/classroom_summative_print.blade.php:8-10`, `resources/views/r26/assignment_qp_print.blade.php:8-10`, and version `0.16.8` in `resources/views/r26/series_qp_print.blade.php:161-163` for LaTeX math rendering on question papers.
  - **Flatpickr**: Loaded from `https://cdn.jsdelivr.net/npm/flatpickr` in `resources/views/attendance_log.blade.php:18-20` and `resources/views/r26_practicum/virtual_classroom_practicum.blade.php:19-21`.
  - **FontAwesome (`6.4.0` & `6.5.1`) & Google Fonts**: Loaded across views (e.g., `6.4.0` in `resources/views/lecturer_dashboard.blade.php:12`, `6.5.1` in `resources/views/hod_nba_audit.blade.php:9`, plus `Material Symbols Rounded`, `Plus Jakarta Sans`, `Outfit`, `Inter`, `JetBrains Mono`).
  - **Custom Biometrics & WebAuthn (No `face-api.js`)**: Instead of a neural face recognition library like `face-api.js`, `resources/views/sf_staff_face_punch.blade.php:871-953, 1120-1201` implements a custom HTML5 `<canvas>` RGB skin-pixel heuristic (`detectFacePresence`, `line 871`) and a 128-element luminance/Sobel-gradient/histogram feature extractor (`extractFaceDescriptor`, `line 1120`). WebAuthn uses native `navigator.credentials.create` / `navigator.credentials.get` (`resources/views/login.blade.php:753`, `resources/views/staff_mobile_dashboard.blade.php:5093`).

---

## 7.7 File Storage Locations & Disks

### Disk Configuration (`config/filesystems.php:1-80`)
- Default disk: `'default' => env('FILESYSTEM_DISK', 'local')` (`config/filesystems.php:16`).
- `'local'` disk root: `storage_path('app/private')` (`config/filesystems.php:34`).
- `'public'` disk root: `storage_path('app/public')`, exposed at `/storage` via `public_path('storage') => storage_path('app/public')` (`config/filesystems.php:43-45, 75-77`).
- `'s3'` disk configured (`config/filesystems.php:50-64`) but unused.

### Four Competing Storage Paradigms Across the Codebase

#### 1. `storage/app/public/*` (via `Storage::disk('public')` or `$file->store(..., 'public')`)
| Directory (`storage/app/public/...`) | Purpose | Code Citations (`file:line`) |
|---|---|---|
| `avatars/` | Staff & student profile photos uploaded during registration or profile edits | `app/Http/Controllers/AuthController.php:274, 376, 700-702`, `app/Http/Controllers/DataController.php:296, 3859-3862, 3930-3933` |
| `academic_calendars/` | Uploaded SITTTR Academic Calendar PDFs | `app/Http/Controllers/AcademicCalendarController.php:48, 115` |
| `syllabi/` | R2021 Theory, Drawing, Major Project, Seminar & Workshop syllabus PDFs | `app/Http/Controllers/ClassroomController.php:48, 51, 520-528`, `app/Http/Controllers/R21VirtualClassroomDrawingController.php:728`, `app/Http/Controllers/R21VirtualClassroomMajorProjectController.php:237`, `app/Http/Controllers/R21VirtualClassroomSeminarController.php:356`, `app/Http/Controllers/R21VirtualClassroomWorkshopController.php:724` |
| `r26_syllabi/` | R2026 Theory syllabus PDFs | `app/Http/Controllers/R26ClassroomController.php:535, 541` |
| `r26_drawing_syllabi/` | R2026 Engineering Drawing syllabus PDFs | `app/Http/Controllers/R26VirtualClassroomDrawingController.php:481, 485` |
| `r26_english_syllabi/` | R2026 Communication Skills in English syllabus PDFs | `app/Http/Controllers/R26VirtualClassroomEnglishController.php:640` |
| `r26_health_physical_syllabi/` | R2026 Health & Physical Education syllabus PDFs | `app/Http/Controllers/R26VirtualClassroomHealthPhysicalController.php:541-542, 573, 576` |
| `r26_practical_syllabi/` | R2026 Practical Lab syllabus PDFs | `app/Http/Controllers/R26VirtualClassroomPracticalController.php:417, 421` |
| `r26_practicum_syllabi/` | R2026 Practicum syllabus PDFs | `app/Http/Controllers/R26VirtualClassroomPracticumController.php:868, 874` |
| `assignment_images/` | Question paper diagrams (multipart file or base64 data URI) | `app/Http/Controllers/ClassroomController.php:2135, 2158-2159` |
| `flash_notices/` | Executive Flash Notice image/PDF attachments | `app/Http/Controllers/ExecutiveFlashNoticeController.php:41, 135-136` |
| `principal_events/` | Principal Scheduled Event banner/attachment files | `app/Http/Controllers/PrincipalScheduledEventController.php:47, 204-205` |
| `learning_materials/` & `learning_materials/videos/` | Virtual classroom study notes (PDF/PPT/DOC) & video files | `app/Http/Controllers/VirtualLearningMaterialController.php:52, 63, 215` |
| `sf_faces/` & `sf_punches/` | Self-Financing staff base64 JPEG face enrollment & attendance punch photos | `app/Http/Controllers/StaffAttendanceMobileController.php:120-121, 258-259` |

#### 2. Misrouted Writes to `storage/app/private/*` Due to Laravel 11 `'local'` Disk Root (`storage_path('app/private')`)
- **Broken Google Drive Backup Path (`app/Http/Controllers/BackupController.php:52-53`)**:
  - `line 52` calls `Storage::disk('local')->put('backups/' . $fileName, $sqlContent);`, which writes to `storage/app/private/backups/{$fileName}` (`config/filesystems.php:34`).
  - `line 53` immediately computes `$filePath = storage_path('app/backups/' . $fileName);` (missing `/private/`) and passes `$filePath` to `uploadFileToGoogleDrive()` (`line 56`), where `file_get_contents($filePath)` (`line 208`) fails because the file was written under `storage/app/private/backups/`!
- **Misrouted Course File Uploads & PDFs**:
  - `app/Http/Controllers/CourseFileController.php:210-216` writes `\Storage::put('public/course_files/' . $fileName, $pdf->output())` (which uses the default `'local'` disk and saves to `storage/app/private/public/course_files/...`), then saves `'storage/course_files/' . $fileName` in the DB (`line 216`), resulting in a 404 URL (`line 75`).
  - Identical bug in `app/Http/Controllers/R26ClassroomController.php:3339, 3385` (`$file->storeAs('public/r26_course_files', $fileName)` and `\Storage::put('public/r26_course_files_generated/' . $pdfFileName, ...)`) and `app/Http/Controllers/R26VirtualClassroomPracticalController.php:1146` (`$file->storeAs('public/r26_practical_course_docs', $fileName)`).

#### 3. Direct Writes to `public/uploads/*` via `$file->move(public_path(...))`
- **Student First-Login Profile Photos (`public/uploads/students/`)**: `app/Http/Controllers/BatchStudentUploadController.php:401-405` and `app/Http/Controllers/DataController.php:4038-4042` move student photos directly to `public_path('uploads/students')` (whereas `AuthController.php:274` stores student photos in `storage/app/public/avatars/`).
- **Course Information Sheet PDFs (`public/uploads/cis/`)**: `app/Http/Controllers/CourseFileController.php:428` moves uploaded CIS PDFs to `public_path('uploads/cis')`.
- **NBA Accreditation Evidence (`public/uploads/nba_audit/`)**: `routes/web.php:2276` moves uploaded NBA criteria files to `public_path('uploads/nba_audit')`.
- **Committed Broken Linux Symlinks**: In the repository, `public/storage` and `public/uploads` are committed as dangling symlinks (referencing `/var/www/uploads` per `DEPLOYMENT.md:13, 83`).

#### 4. Flat JSON State Files in `storage/app/` Used Instead of Database Tables
- **Classroom Timetables (`storage/app/timetables/{classroomId}.json`)**: Read and written directly via `file_get_contents()` / `file_put_contents()` across `routes/web.php:1083, 1571, 1866, 1879`, `app/Http/Controllers/MentoringController.php:2247`, `app/Http/Controllers/StudentAttendanceController.php:254`, `app/Http/Controllers/PrincipalDashboardController.php:112`, `app/Http/Controllers/HodMobileController.php:315`, and `app/Http/Controllers/R26VirtualClassroomPracticumController.php:1377`.
- **Active Day Order State (`storage/app/active_day_order.json`)**: Read and written by `app/Services/DayOrderService.php:92, 104`.
- **Carmie Playbook & Query Log (`storage/app/carmie_playbook.json` & `storage/app/carmie_query_model.json`)**: Read and written by `app/Services/CarmiePlaybookService.php:18, 283`.

---
---

# SECTION 8: PAIN POINTS

---

## 8.1 Giant Controllers & "God Files"

### All 50 Controller Files Ranked by Line Count (`app/Http/Controllers/`)
The 50 controllers total **56,996 lines of PHP**, with the top 17 controllers each exceeding 1,000 lines:

| Rank | Controller (`app/Http/Controllers/...`) | Lines | Primary Responsibilities Packed Into Single File |
|---|---|---|---|
| 1 | `ClassroomController.php:1-7505` | **7,505** | R2021 Theory virtual classroom, syllabus PDF upload + Gemini parsing + regex CO-PO extraction, lesson plans, attendance logging, homework/assignments, summative tests, AI question bank seeding, answer key generation, CIA calculation, CO/PO attainment, and print views. |
| 2 | `R26VirtualClassroomPracticumController.php:1-4908` | **4,908** | R2026 Practicum + Basic Science Practicum (Physics & Chemistry) dual-track classroom, Python syllabus parsing, theory + lab lesson plans, dual attendance matrices, lab batching, Gemini series QP generation, evaluations, course files, and printouts. |
| 3 | `DataController.php:1-4130` | **4,130** | Monolithic catch-all API controller for HOD, Lecturer, Student, Admin, and Coordinator dashboards: batch creation, subject CRUD, staff assignment, student roster management, profile updates, marks entry, and department analytics. |
| 4 | `R26ClassroomController.php:1-3504` | **3,504** | R2026 Theory virtual classroom clone of `ClassroomController`, Python syllabus invocation, series exams, self-learning evaluations, CIA register, CO/PO attainment, and R26 course file generation. |
| 5 | `MentoringController.php:1-2757` | **2,757** | Student mentoring diary (22+ sections), tutor review workflows, parent visit logs, staff punch log PDF generation, lecturer dashboard "To-Do" aggregation (`lines 2475-2750`), and timetable JSON file writes. |
| 6 | `R26VirtualClassroomDrawingController.php:1-2093` | **2,093** | R2026 Engineering Drawing classroom, Python drawing syllabus parser call, drawing exercise tracking, series tests, CIA calculation, and print views. |
| 7 | `SbteSubjectLogImportController.php:1-2058` | **2,058** | SBTE/TEAMS Attendance Statement & Subject Log importer supporting `.xlsx`, `.xls`, `.csv`, `.html`, and `.pdf` with dual persistence pipelines. |
| 8 | `VirtualClassroomPracticalController.php:1-1894` | **1,894** | R2021 Practical Lab classroom, lab batch splits (`A`/`B`), experiment evaluations, practical series exams, CIA calculation, and print reports. |
| 9 | `AttendanceController.php:1-1617` | **1,617** | Period-wise attendance marking, attendance logs, late comers, hourly locks, condonation summaries, and department attendance reports. |
| 10 | `R21VirtualClassroomWorkshopController.php:1-1507` | **1,507** | R2021 Workshop classroom, 3-section trade rotation matrices (Fitting/Smithy/Welding/Carpentry/Sheet Metal/Foundry), dual-batch attendance, trade instructor evaluations, and CIA printouts. |
| 11 | `R21VirtualClassroomMajorProjectController.php:1-1435` | **1,435** | R2021 Major Project classroom, project group formation, guide allocation, 3-phase rubrics evaluation, CO-PO attainment, and project report printouts. |
| 12 | `R26VirtualClassroomEnglishController.php:1-1365` | **1,365** | R2026 Communication Skills in English classroom, module-wise continuous evaluation, self-learning marks, CIA register, and attainment. |
| 13 | `R26VirtualClassroomPracticalController.php:1-1315` | **1,315** | R2026 Practical Lab classroom, Python syllabus parser + dynamic `scratch_r26_dump.py` fallback, experiment evaluations, series tests, and course file uploads. |
| 14 | `R21VirtualClassroomSeminarController.php:1-1248` | **1,248** | R2021 Seminar classroom, student topic registration, guide assignment, presentation rubric scoring, survey links, and seminar reports. |
| 15 | `ConsolidatedCiaReportController.php:1-1166` | **1,166** | Cross-regulation (R21 + R26) consolidated CIA mark calculation, attendance percentage synthesis across 5 attendance tables, and print views. |
| 16 | `TestEngineController.php:1-1135` | **1,135** | Online MCQ test engine, Gemini AI question generation, student test attempts, auto-grading, and test result analytics. |
| 17 | `R21VirtualClassroomDrawingController.php:1-1067` | **1,067** | R2021 Engineering Drawing classroom, sheet evaluations, series tests, and attainment reports. |
| 18 | `StudentAttendanceController.php:1-1031` | **1,031** | Student desktop & mobile dashboard data aggregation, subject-wise attendance synthesis, fee status, no-due slip, and attendance certificate printouts. |
| 19 | `SfOfficeController.php:1-981` | **981** | Self-Financing office dashboard: fee structures, student fee collection, receipts, scholarships, and defaulters. |
| 20 | `TutorController.php:1-968` | **968** | Class tutor dashboard, student progress report cards, consolidated mark matrices, and parent communication data. |
| 21 | `CourseFileController.php:1-958` | **958** | NBA/SBTE 18-document Course File preparation, HTML document previews, CIS PDF upload, and DomPDF export. |
| 22 | `TutorSpecialAttendanceController.php:1-883` | **883** | Tutor daily attendance overrides, duty leave/medical leave adjustments, condonation register, and PDF import. |
| 23 | `R26VirtualClassroomHealthPhysicalController.php:1-856` | **856** | R2026 Health & Physical Education classroom, Python parser invocation, fitness/yoga/sports criteria grading, and CIA printouts. |
| 24 | `StaffAttendanceMobileController.php:1-849` | **849** | Self-Financing staff biometric face enrollment, cosine-similarity face punch verification, Haversine GPS geofencing, and monthly attendance reports. |
| 25 | `AuthController.php:1-815` | **815** | Multi-table login (`students` + `staff_profiles`), registration, token auto-login, profile updates, and password management. |
| 26–50 | Remaining 25 Controllers (`ParentDashboardController.php` at 658 lines down to `Controller.php` at 8 lines) | **6,891** | Includes `ParentDashboardController.php` (658), `RemedialController.php` (602), `HodMobileController.php` (510), `ExecutiveControlDeskController.php` (508), `MidSemSurveyController.php` (478), `StaffLeaveController.php` (473), `CourseExitSurveyController.php` (464), `BatchStudentUploadController.php` (442), `WebAuthnController.php` (373), `StaffMobileVirtualLabController.php` (360), `PrincipalScheduledEventController.php` (308), `StudentMockTestController.php` (275), `ProgramAttainmentController.php` (254), `PrincipalDashboardController.php` (250), `CarmieAssistantController.php` (246), `AcademicCalendarController.php` (241), `R26DataController.php` (237), `VirtualLearningMaterialController.php` (236), `BackupController.php` (230), `StaffBirthdayController.php` (215), `ExecutiveFlashNoticeController.php` (200), `SupportDeskController.php` (194), `ActivityPointsController.php` (150), `PushNotificationController.php` (76), `SystemSettingController.php` (76), `Controller.php` (8). |

### Monolithic Route File (`routes/web.php:1-2464`)
- `routes/web.php:1-2464` is **2,464 lines long**, mixing route declarations with dozens of multi-hundred-line inline closures that execute raw `DB::table()` queries, file uploads, and business calculations directly in the router (e.g., `/api/auth/recover-account` at `lines 166-240`, `/api/hod/consolidated-timetable` at `lines 1044-1145`, `/api/hod/sbte-audit` at `lines 2070-2203`, `/hod/nba-audit` at `lines 2207-2305`).

### Largest Blade Views Ranked by Line Count (`resources/views/`)
38 Blade templates exceed 1,000 lines because entire single-page applications (HTML + CSS + thousands of lines of inline `<script>` and `@php` logic) are embedded into single files:

| Rank | Blade View (`resources/views/...`) | Lines |
|---|---|---|
| 1 | `resources/views/lecturer_dashboard.blade.php:1-15013` | **15,013** |
| 2 | `resources/views/r26_practicum/virtual_classroom_basic_science_practicum.blade.php:1-8538` | **8,538** |
| 3 | `resources/views/staff_mobile_dashboard.blade.php:1-6289` | **6,289** |
| 4 | `resources/views/r26/virtual_classroom_theory.blade.php:1-5848` | **5,848** |
| 5 | `resources/views/hod_dashboard.blade.php:1-5455` | **5,455** |
| 6 | `resources/views/tutor_dashboard.blade.php:1-4494` | **4,494** |
| 7 | `resources/views/admin_control_desk.blade.php:1-4015` | **4,015** |
| 8 | `resources/views/r26_practicum/virtual_classroom_practicum.blade.php:1-3668` | **3,668** |
| 9 | `resources/views/r21_drawing/virtual_classroom_drawing.blade.php:1-3280` | **3,280** |
| 10 | `resources/views/r21_seminar/virtual_classroom_seminar.blade.php:1-3249` | **3,249** |
| 11 | `resources/views/virtual_classroom_practical.blade.php:1-3114` | **3,114** |
| 12 | `resources/views/chairman_dashboard.blade.php:1-3056` | **3,056** |
| 13 | `resources/views/r26_practical/virtual_classroom_practical.blade.php:1-3031` | **3,031** |
| 14 | `resources/views/student_mobile_dashboard.blade.php:1-2912` | **2,912** |
| 15 | `resources/views/r26_english/virtual_classroom_english.blade.php:1-2784` | **2,784** |
| 16 | `resources/views/r21_workshop/virtual_classroom_workshop.blade.php:1-2740` | **2,740** |
| 17 | `resources/views/student_dashboard.blade.php:1-2648` | **2,648** |
| 18 | `resources/views/r21_project/virtual_classroom_project.blade.php:1-2632` | **2,632** |
| 19 | `resources/views/sf_office_dashboard.blade.php:1-2607` | **2,607** |
| 20 | `resources/views/r26_drawing/virtual_classroom_drawing.blade.php:1-2097` | **2,097** |
| 21–38 | `sf_staff_attendance_report.blade.php` (1,992), `r21_workshop/mobile_workshop.blade.php` (1,919), `attendance_log.blade.php` (1,879), `tutor_student_diary_full.blade.php` (1,663), `student_mentoring_diary_full.blade.php` (1,605), `hod_mobile_dashboard.blade.php` (1,475), `sf_staff_face_punch.blade.php` (1,436), `academic_coordinator_dashboard.blade.php` (1,397), `r26_health_physical/virtual_classroom_health_physical.blade.php` (1,241), `staff_mobile_virtual_lab.blade.php` (1,238), `mentoring_diary_modal.blade.php` (1,174), `login.blade.php` (1,164), `r21_seminar/seminar_report_print.blade.php` (1,109), `workshop_superintendent_dashboard.blade.php` (1,085), `student_mentoring_scripts.blade.php` (1,078), `remedial_dashboard.blade.php` (1,076), `r21_project/project_report_print.blade.php` (1,025), `hod_sbte_audit.blade.php` (1,015) | **25,601** |

---

## 8.2 Massive Copy-Paste Duplication

### 1. Parallel R2021 vs R2026 Architecture & 12 Separate Virtual Classroom Controllers
Instead of abstracting regulation rules (mark weightages, CO count, assessment components) into strategy classes or configuration tables, the codebase forks entire controllers, models, tables, and 3,000+ line Blade views for each regulation and course type:
- **Class & Subject Management Duplication**:
  - `app/Http/Controllers/DataController.php:1-4130` (`class_management` table) vs `app/Http/Controllers/R26DataController.php:1-237` (`r26_class_management` table).
- **12 Virtual Classroom Controllers Totalling 28,697 Lines**:
  1. R21 Theory: `app/Http/Controllers/ClassroomController.php:1-7505`
  2. R26 Theory: `app/Http/Controllers/R26ClassroomController.php:1-3504`
  3. R21 Practical: `app/Http/Controllers/VirtualClassroomPracticalController.php:1-1894`
  4. R26 Practical: `app/Http/Controllers/R26VirtualClassroomPracticalController.php:1-1315`
  5. R21 Drawing: `app/Http/Controllers/R21VirtualClassroomDrawingController.php:1-1067`
  6. R26 Drawing: `app/Http/Controllers/R26VirtualClassroomDrawingController.php:1-2093`
  7. R21 Workshop: `app/Http/Controllers/R21VirtualClassroomWorkshopController.php:1-1507`
  8. R21 Seminar: `app/Http/Controllers/R21VirtualClassroomSeminarController.php:1-1248`
  9. R21 Major Project: `app/Http/Controllers/R21VirtualClassroomMajorProjectController.php:1-1435`
  10. R26 Practicum (Standard + Basic Science): `app/Http/Controllers/R26VirtualClassroomPracticumController.php:1-4908`
  11. R26 English: `app/Http/Controllers/R26VirtualClassroomEnglishController.php:1-1365`
  12. R26 Health & Physical: `app/Http/Controllers/R26VirtualClassroomHealthPhysicalController.php:1-856`
- **Duplicated Basic Science Practicum View**: `resources/views/r26_practicum/virtual_classroom_basic_science_practicum.blade.php:1-8538` (8,538 lines) and `resources/views/r26_practicum/virtual_classroom_practicum.blade.php:1-3668` (3,668 lines) duplicate thousands of lines of HTML/JS for Practicum management.

### 2. Duplicated Attendance Percentage Synthesis Across 8+ Files
Because student attendance can live in 5 different tables (`subject_official_attendances`, `student_attendance`, `tutor_class_attendances`, `class_logs_attendance` with JSON arrays, and `tutor_special_attendances`), the multi-table fallback calculation is copy-pasted with subtle variations across:
- `app/Http/Controllers/ClassroomController.php:1564-1605, 3249-3290, 5717-5755, 6682-6720`
- `app/Http/Controllers/ConsolidatedCiaReportController.php:189-230, 314-322`
- `app/Http/Controllers/StudentAttendanceController.php:451-535`
- `app/Http/Controllers/TutorController.php:278-304`
- `app/Http/Controllers/ParentDashboardController.php:225-255`
- `app/Http/Controllers/R21VirtualClassroomWorkshopController.php:1017-1055, 1099-1130`

### 3. Duplicated Manual Session Auth & Role Checks (Zero Custom Middleware or Policies)
- There is **no** `app/Http/Middleware/` directory and **no** `app/Policies/` directory.
- Every protected route closure in `routes/web.php:91-113, 254-350, 2170-2366` and nearly every controller method manually calls `Session::get('userId')` and `Session::get('userRole')` with inconsistent role arrays:
  - Example 1: `routes/web.php:101` checks `in_array($role, ['Academic_Coordinator', 'Academic Coordinator', 'Academic_Coordinator_SF'])`.
  - Example 2: `routes/web.php:109` checks `in_array($role, ['SF_Office', 'Self_Office', 'Office_SF', 'Office'])`.
  - Example 3: `app/Http/Controllers/BatchStudentUploadController.php:21-24` checks `in_array($role, ['HOD', 'Super_Admin', 'Principal', 'Admin', 'Academic_Coordinator', 'Gen_Dept_Coordinator_Aided', 'Gen_Dept_Coordinator_Self_Finance', 'SF_Office', 'Self_Office', 'Office_SF', 'Office'])`.

### 4. Duplicated Helper Logic & Timetable File Readers
- `getFullBranchName($code)` is defined globally inside `routes/web.php:22-42` instead of a service/helper class, and branch-code mapping arrays are re-declared inline in `app/Http/Controllers/ParentDashboardController.php:213-220`, `app/Http/Controllers/R26ClassroomController.php:3360-3370`, and `app/Http/Controllers/StaffAttendanceMobileController.php:580-595`.
- Timetable JSON path sanitization (`storage_path("app/timetables/{$cleanId}.json")`) is duplicated across 9 places (`routes/web.php:1083, 1571, 1866, 1879`, `HodMobileController.php:315`, `MentoringController.php:2247`, `PrincipalDashboardController.php:112`, `R26VirtualClassroomPracticumController.php:1377`, `StudentAttendanceController.php:254`).

---

## 8.3 Logic, Eloquent Models & Raw DB Queries Inside Blade Views

There are **471 occurrences** of `@php`, `\DB::`, or `\App\Models\` across **88 Blade view files** (`resources/views/`). Views routinely query the database directly during rendering:

### Direct Database & Eloquent Queries Executed Inside Blade Views
1. **Duplicate Tutor/Mentor Role Queries in 6 Staff Dashboards**:
   - The exact same 20-line `@php` block querying `\App\Models\ClassManagement::where(...)` and `\DB::table('r26_class_management')->where(...)` to compute `$isTutor` and `$isMentor` is copy-pasted into 6 different dashboard views:
     - `resources/views/lecturer_dashboard.blade.php:951-968`
     - `resources/views/demonstrator_dashboard.blade.php:300-317`
     - `resources/views/general_coordinator_aided_dashboard.blade.php:257-274`
     - `resources/views/general_coordinator_sf_dashboard.blade.php:257-274`
     - `resources/views/trade_instructor_dashboard.blade.php:245-262`
     - `resources/views/workshop_superintendent_dashboard.blade.php:254-271`
2. **N+1 Queries Inside Loops in Print Views**:
   - `resources/views/hod_consolidated_timetable_print.blade.php:320-325, 354-359`: Executes `DB::table('subject_staff_assignments')->join('staff_profiles', ...)->where('batch_subject_id', $sub->id)->get()` inside nested `@foreach` loops over classrooms and subjects.
   - `resources/views/r26_practicum/timetable_print.blade.php:343-348`: Identical `DB::table('subject_staff_assignments')` query inside a `@foreach` loop in the Blade template.
3. **Model & Controller Static Calls in Blade Templates**:
   - `resources/views/academic_coordinator_dashboard.blade.php:428, 488` and `resources/views/hod_dashboard.blade.php:4`: Call `\App\Models\StaffProfile::isSfAcademicCoordinator(session('userId'))` directly in the view.
   - `resources/views/staff_leave_reports.blade.php:198-220`: Builds and executes `\App\Models\StaffLeaveRequest::query()` directly inside the Blade view to fetch pending leave requests.
   - `resources/views/student_dashboard.blade.php:216-225`: Queries `\App\Models\PrincipalScheduledEvent::where('is_published', true)->...->first()` inside the Blade view.
   - `resources/views/r26/virtual_classroom_theory.blade.php:349`: Calls `\App\Http\Controllers\SystemSettingController::isAiEnabled()` directly from the view.
   - `resources/views/r26/cia_register_print.blade.php:230` and `resources/views/r26_english/cia_register_print.blade.php:217, 516`: Call `\App\Models\R26TheoryEvaluation::calculateAttendanceMarks()` and `\App\Models\R26EnglishEvaluation::calculateAttendanceMarks()` inside `@foreach` student rows.

---

## 8.4 Database & Schema Pain Points

### 1. Intentional Removal of Foreign Key Constraints (`drop_classroom_foreign_keys`)
- `database/migrations/2026_07_19_000003_drop_classroom_foreign_keys.php:9-26` explicitly drops foreign keys on `batch_subjects.classroom_id`, `students.classroom_id`, `academic_calendars.classroom_id`, `tutor_class_attendances.classroom_id`, and `tutor_special_attendances.classroom_id`:
  - Comment at `line 11`: `"Why: R2026 batches live in r26_class_management, while R2021 batches live in class_management. Having a strict FK to only class_management blocks R2026 classes from using shared tables."`
- As a result, `classroom_id` across 5 core tables is an untyped polymorphic integer with **zero referential integrity**—an ID of `5` could match row `5` in `class_management`, row `5` in `r26_class_management`, or both simultaneously!

### 2. Joining on Mutable Strings Instead of Immutable Primary Keys
- **Staff Identity (`mobile_no`)**: Staff relationships (`subject_staff_assignments.staff_mobile_no`, `class_management.tutor_mobile`, `class_management.mentor_1_mobile`, `staff_professional_activities.lecturer_mobile_no`, `staff_leave_requests.staff_mobile`) join on `staff_profiles.mobile_no` (a mutable phone string that sometimes includes spaces or `+91`, forcing controllers and views to strip characters via `preg_replace('/[^0-9]/', '', $mobileNo)` and run `LIKE "%{$cleanMobile}%"` queries, e.g., `resources/views/lecturer_dashboard.blade.php:952-966`).
- **Student Identity (`reg_no`)**: Marks, attendance, mentoring diaries, and surveys join on `students.reg_no` (which can contain slashes like `25EL4460/25`, `routes/web.php:19-20`, or be `NULL` for newly admitted 1st-year students before permanent registration numbers are issued, forcing fallback checks against `adm_no` or `roll_no` in `ConsolidatedCiaReportController.php:150-175`).
- **Branch & Subject Code Joins**: Tables join on mutable string codes (`branch` with inconsistent aliases `'EE'` vs `'EEE'` and `'CT'` vs `'CS'` in `routes/web.php:29-32`; `subject_code` in `CourseFileController.php:320, 433`).

### 3. Relational Data Stored as JSON Columns Requiring Full-Table Scans in PHP
- `class_logs_attendance` stores `present_students` and `absent_students` as JSON arrays of registration numbers rather than normalized rows.
- Consequently, `app/Http/Controllers/ParentDashboardController.php:233-250` executes `\DB::table('class_logs_attendance')->get()` — loading **every attendance log across the entire institution into PHP memory** — and loops over them with `json_decode()` and `in_array($student->reg_no, $present)` just to display a single student's attendance on the parent portal!

### 4. 115+ Runtime `Schema::hasTable()` / `Schema::hasColumn()` Queries Inside HTTP Requests
Because production and local schemas drifted out of sync with migrations, controllers execute over **115 `Schema::hasTable()` / `Schema::hasColumn()` (`INFORMATION_SCHEMA`) queries** at runtime during normal user HTTP requests:
- `app/Http/Controllers/ConsolidatedCiaReportController.php:28-324, 1022` (19 `Schema::hasTable` / `hasColumn` calls in a single request).
- `app/Http/Controllers/TutorController.php:65-340` (19 `Schema::hasTable` / `hasColumn` calls in a single request).
- `app/Http/Controllers/StudentAttendanceController.php:390-986` (13 calls).
- `app/Http/Controllers/ClassroomController.php:1564-6910` (13 calls).
- `app/Http/Controllers/ParentDashboardController.php:258-377` (10 calls).
- `app/Http/Controllers/MentoringController.php:2147-2704` (9 calls).
- `app/Http/Controllers/R21VirtualClassroomWorkshopController.php:140-1479` (7 calls).
- `app/Http/Controllers/TutorSpecialAttendanceController.php:47-702` (7 calls).
- `app/Http/Controllers/AttendanceController.php:658, 901, 1438` (3 calls).
- `app/Http/Controllers/SbteSubjectLogImportController.php:1069, 1527, 1878` (3 calls).
- `routes/web.php:1156, 1164, 1283` (3 calls).

### 5. Destructive Raw DDL Execution in `BackupController::restoreDatabase`
- `app/Http/Controllers/BackupController.php:133-167` accepts an uploaded `.sql` or `.txt` file (`line 136`), disables foreign key constraints (`DB::statement('SET FOREIGN_KEY_CHECKS = 0;')`, `line 150`), and executes arbitrary raw SQL/DDL statements via `DB::unprepared($sqlContent)` (`line 151`).

---

## 8.5 Security & Architectural Vulnerabilities

### 1. Custom Session State Instead of Laravel Authentication Guards
- `AuthController::login()` (`app/Http/Controllers/AuthController.php:23-241`) does **not** use `Auth::attempt()` or Laravel guards. It manually writes session keys (`Session::put('userId', ...)`, `Session::put('userRole', ...)`, `Session::put('userName', ...)`, `Session::put('userBranch', ...)`, `lines 76-82, 165-175`).
- Because there is no auth middleware, any route inside `Route::middleware(['web'])` (`routes/web.php:243`) that forgets to check `Session::get('userId')` or `Session::get('userRole')` is publicly accessible.

### 2. Plaintext Passwords, Predictable Defaults & SuperAdmin Password Exposure
- **Plaintext Storage & Comparison (`app/Http/Controllers/AuthController.php:283, 388, 481, 694, 773, 795-814`)**:
  - `checkPassword()` (`lines 795-814`) accepts either a bcrypt hash or a direct plaintext string match (`return $inputPassword === $storedPassword;`, `line 813`).
  - New registrations (`registerStudent` at `line 283`, `registerStaff` at `line 388`), password changes (`changePassword` at `line 481`, `updateProfile` at `line 694`, `changeStudentPassword` at `line 773`), and account recovery (`routes/web.php:200, 202`) all write **plaintext passwords** directly to `students.password` and `staff_profiles.password`, with comments like `// Store as plain text for Super Admin visibility` (`AuthController.php:481`).
- **Hardcoded Universal Default Password (`carmel2026`)**:
  - `app/Http/Controllers/BatchStudentUploadController.php:39, 134, 244` sets `$defaultPasswordPlain = 'carmel2026'` for all batch-imported students.
  - `app/Http/Controllers/AuthController.php:48-54` even allows a student whose DB password is `NULL` or empty to log in using `'carmel2026'` (`$password === 'carmel2026'`).
- **Plaintext Password Dump View (`routes/web.php:287-303`)**:
  - `GET /superadmin/show-users` selects the `password` column from both `staff_profiles` and `students` (`lines 291, 297`) and renders every user's password in `resources/views/admin_show_users_table.blade.php`.

### 3. Global CSRF Exemption on `login` and All `api/*` Routes (`bootstrap/app.php:14-17`)
- `bootstrap/app.php:14-17` configures:
  ```php
  $middleware->validateCsrfTokens(except: [
      'login',
      'api/*',
  ]);
  ```
- Because all `/api/*` endpoints are defined in `routes/web.php` using cookie-based sessions (`Session::get('userId')`), disabling CSRF protection on `api/*` exposes every state-changing `/api/*` endpoint (grade modifications, notice broadcasts, user deletions, database settings) to Cross-Site Request Forgery.

### 4. Unauthenticated / Missing-Authorization Endpoints
- **Unauthenticated Push Broadcast (`routes/web.php:153`, `app/Http/Controllers/PushNotificationController.php:42-75`)**: `POST /api/notifications/broadcast` is registered outside any auth check and `sendBroadcast()` never checks `Session::get('userId')` or `Session::get('userRole')`—allowing any unauthenticated caller to broadcast push notifications to all users.
- **Unauthenticated Course File Read/Write (`app/Http/Controllers/CourseFileController.php:103-226, 305-358`)**: While `getStaffSubjects()` checks `Session::get('userId')` (`line 23`), `getCourseFile($id)` (`line 103`), `saveCourseFile($request, $id)` (`line 130`), `generatePdf($id)` (`line 196`), and `saveDocumentPayload($request, $id, $docNo)` (which writes directly to `student_board_grades` at `lines 319-332`) perform **zero authentication or ownership checks**.
- **Unauthenticated User Online Status Enumeration (`routes/web.php:73-87`)**: `GET /api/users/online-status?ids=...` requires no session and reveals online presence for arbitrary user IDs.

### 5. Cryptographically Broken WebAuthn Implementation (`app/Http/Controllers/WebAuthnController.php:1-373`)
- **Syntax Error at Top of File (`lines 1-5`)**: Contains a duplicate opening tag and namespace declaration:
  ```php
  <?php

  namespace App\Http\Controllers;
  <?php

  namespace App\Http\Controllers;
  ```
- **Zero Cryptographic Signature or Challenge Verification (`lines 210-311`)**:
  - `getAuthOptions()` stores a random challenge in `Session::put('webauthn_auth_challenge', $challenge)` (`line 191`).
  - However, `authenticate()` (`lines 210-311`) **never reads `webauthn_auth_challenge`**, **never inspects `authenticatorData` or `clientDataJSON`**, and **never verifies the public-key signature** against `$cred->public_key`! It simply looks up `where('credential_id', $credentialId)->first()` in `webauthn_credentials` (`lines 222-229`) and immediately logs the user in (`lines 256-291`). Anyone who knows or guesses a `credentialId` string can log in as that user via a single JSON POST to `/api/webauthn/authenticate`.

### 6. Spoofable Biometric Face Attendance & IDOR (`StaffAttendanceMobileController.php` & `sf_staff_face_punch.blade.php`)
- **Not Real Facial Recognition (`resources/views/sf_staff_face_punch.blade.php:871-953, 1120-1201`)**:
  - Client-side `detectFacePresence()` (`lines 871-953`) only checks whether pixels in an oval region match an RGB skin-tone heuristic (`r > 60 && g > 40 && b > 20 && r > b && (r - g) > 5`, `line 889`).
  - Client-side `extractFaceDescriptor()` (`lines 1120-1201`) downsamples the crop to a 64×64 canvas and returns 128 numbers consisting of an 8×8 average luminance grid, 4×4 Sobel gradients, and 16-bin histograms—which matches any photo or similarly lit face.
- **Server-Side Verification Bypass & IDOR (`app/Http/Controllers/StaffAttendanceMobileController.php:100-290`)**:
  - In `verifyAndPunch()` (`line 214`), the cosine similarity check (`lines 214-242`) only runs `if ($liveDescriptorJson && $registration->face_descriptor)`—if the client omits `face_descriptor` from the POST payload, face matching is skipped completely!
  - Both `saveFaceRegistration()` (`line 108`) and `verifyAndPunch()` (`line 163`) accept `staff_id` directly from `$request->input('staff_id')` instead of deriving it from the logged-in session (`Session::get('userId')`), allowing any authenticated SF staff member to overwrite another staff member's face registration or punch attendance on their behalf.

### 7. Passwordless Parent Portal Takeover Vulnerability (`app/Http/Controllers/ParentDashboardController.php:35-100`)
- `verifyLogin()` (`lines 35-100`) authenticates parents using `reg_no` + `guardian_mobile`.
- **Auto-Binding Takeover Bug (`lines 62-72`)**: If a student record has an empty `guardian_mobile` and empty `phone` (common for newly imported students), `lines 65-71` accept **any arbitrary 10-digit number** submitted by the caller and permanently save it to the database (`$student->guardian_mobile = $mobileInput; $student->save();`), granting full access to the student's dashboard.
- Furthermore, `showDashboard()` (`lines 105-120`) accepts a deterministic 12-character MD5 URL token (`substr(md5($student->reg_no . ($student->guardian_mobile ?: $student->phone) . 'CarmelR26ParentSecret'), 0, 12)`, `line 112`) with a hardcoded static salt `'CarmelR26ParentSecret'` that never expires.

### 8. ~170 Ad-Hoc Patch/Debug Scripts & Full SQL Database Dumps in Project Root
The root directory `carmel-linx-laravel/` is polluted with **168 non-framework files** that should never reside in an application repository:
- **96 Python (`.py`) scripts** in the project root (e.g., `fix_*.py`, `patch_*.py`, `update_*.py`, `inject_*.py`, `dump_*.py`, `test_*.py`, `verify_*.py`).
- **55 ad-hoc PHP (`.php`) scripts** in the project root (excluding `artisan`), such as `fix_*.php`, `debug_*.php`, `check_*.php`, `migrate_*.php`, `seed_*.php`, `restore_*.php`, plus `clean_campus_db.php` in the parent directory (`i:\CampusLynk Next\carmel-linx-legacy\academic-platform\clean_campus_db.php`).
- **10 ad-hoc Node.js (`.js`) patch scripts** in the project root (excluding `vite.config.js`), such as `patch_modal.js`, `fix_Alpine.js`, `check_braces.js`.
- **2 full SQL database dumps** sitting in the project root: `database_backup_june_28_2026.sql` and `database_backup_utf8.sql`.

---

## 8.6 Known Bugs, Hardcoded Fallbacks & Fragile Workarounds

| Issue / Bug Summary | Exact Citation (`file:line`) | Technical Details |
|---|---|---|
| Duplicate `<?php namespace` declaration in `WebAuthnController` | `app/Http/Controllers/WebAuthnController.php:1-5` | Lines 1–3 (`<?php \n namespace App\Http\Controllers;`) are immediately repeated on lines 4–5 (`<?php \n namespace App\Http\Controllers;`), causing a fatal PHP parse error whenever `WebAuthnController` is autoloaded. |
| Google Drive backup fails due to `app/private` vs `app/` path mismatch | `app/Http/Controllers/BackupController.php:52-53, 208` | `Storage::disk('local')->put('backups/' . $fileName, $sqlContent)` (`line 52`) writes to `storage/app/private/backups/` (`config/filesystems.php:34`), but `line 53` passes `storage_path('app/backups/' . $fileName)` to `uploadFileToGoogleDrive()`, where `file_get_contents($filePath)` (`line 208`) fails on the non-existent path. |
| Scheduled Executive Flash Notices never publish or notify | `app/Http/Controllers/ExecutiveFlashNoticeController.php:55, 74, 163-171` | Scheduling sets `is_published = false` (`line 55`), and `getActiveNotices()` filters `where('is_published', true)` (`line 163`) with no background job to flip `is_published` to `true`. |
| Carmie AI kill-switch queries wrong column names | `app/Http/Controllers/CarmieAssistantController.php:51-55` vs `app/Http/Controllers/SystemSettingController.php:18-20` | `SystemSettingController` uses columns `key` and `value` (`key = 'ai_generation_enabled'`), whereas `CarmieAssistantController` queries `where('setting_key', 'gemini_ai_active')` and reads `->setting_value` inside a silenced `try/catch`. |
| Fake random FCM endpoint on Web Push error + unencrypted cURL POST | `resources/views/partials/push_notification_prompt.blade.php:84, 90-95` & `app/Services/PushNotificationService.php:45-65` | Uses invalid dummy VAPID key ending in `w2q3e4r5t6y7u8i9o0p` (`line 84`), falls back to `https://fcm.googleapis.com/fcm/send/carmel-<random>` (`line 93`), and `PushNotificationService` posts unencrypted, unsigned JSON via raw cURL. |
| Commented-out password reset email returns fake success | `app/Http/Controllers/AuthController.php:446-448` | `// Mail::to($email)->send(new ResetPasswordMail($token));` is commented out, but the endpoint still returns HTTP 200 `'A password reset link has been securely sent to your email address!'`. |
| Hardcoded subject `3043` ("Control Systems") syllabus fallback | `app/Http/Controllers/ClassroomController.php:190-259` | Inside `uploadSyllabus()`, if `GEMINI_API_KEY` is empty (`line 189`) and `strpos($rawText, '3043') !== false || $subjectId == 5` (`line 191`), the controller returns a 65-line hardcoded syllabus payload for Subject `3043` ("Control Systems")! |
| Fabricated `rand()` audit metrics when DB records are zero | `routes/web.php:2154-2161, 2193-2194` | In `/api/hod/sbte-audit/*`, when `$registered == 0` or `$totalSubjectsCount == 0`, the API fabricates random numbers via `rand(45, 60)`, `rand(35, 45)`, `rand(5, 12)`, and `rand(18, 22)` so audit tables look populated! |
| Runtime creation of `scratch_r26_dump.py` inside HTTP controller | `app/Http/Controllers/R26VirtualClassroomPracticalController.php:450-459` | Writes a Python script to `storage/app/scratch_r26_dump.py` on the fly during syllabus upload and executes it via `shell_exec()`. |
| Unescaped `$sitePkg` interpolation in `shell_exec` Python command | `app/Http/Controllers/R26ClassroomController.php:542-543` | Interpolates `$sitePkg` (`getenv('APPDATA') . '\\Python\\Python314\\site-packages'`, `line 539`) directly into a double-quoted `python3 -c "..."` string passed to `shell_exec()` (`line 543`), with a hardcoded Python 3.14 Windows path. |
| TLS verification disabled on Gemini API call | `app/Http/Controllers/ClassroomController.php:4963` | Calls `Http::withoutVerifying()->timeout(60)->post(...)` when sending prompts and API key to Google's Gemini endpoint. |
