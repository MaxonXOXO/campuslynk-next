# ADR-0007: Configurable approval chains, notifications, and external AI boundary

**Status:** Decided

## Context
1. **Leave & Administrative Workflows:** Carmel Polytechnic operates two distinct management streams (`AIDED` and `SF`). Staff leave, Comp-Off (CCL), and late-punch approvals follow different routing chains per stream, and applicants who hold leadership roles (`HOD`, `Academic Coordinator SF`, `General Dept Coordinator`) have shorter chains than regular teaching/technical staff.
2. **Notifications:** The legacy app had no unified notification center, relied on synchronous mail/external calls inside HTTP requests, and had an incomplete SMS/WhatsApp setup. The product owner wants a built-in Web Notification Center immediately, with Firebase Cloud Messaging (FCM) ready for web push and the upcoming React Native mobile app.
3. **AI Assistant ("Carmie"):** The legacy app embedded a 4,072-line `AiAssistantController` with 27 database tools directly inside the monolith. The product owner decided to make the AI Assistant a **separate RAG-based project**.

## Decision

### 1. Data-Driven Stream Approval Chains (`workflow_definitions`)
Approval workflows are configured per `(tenant, workflow_type, funding_stream, applicant_role_category)` rather than hard-coded in controllers:
- **Aided Staff Leave (`stream = AIDED`):**
  - Regular Staff (`lecturer`, `demonstrator`, `trade_instructor`, `tradesman`, `workshop_instructor`, `lab_assistant`, `physical_instructor`) → **Step 1:** Managing `hod` / `gen_dept_coordinator` / `workshop_superintendent` → **Step 2:** `principal` (Final).
  - HOD / Coordinator (`hod`, `gen_dept_coordinator`, `workshop_superintendent`) → **Step 1:** `principal` (Final).
- **Self-Financing Staff Leave & CCL (`stream = SF`):**
  - Regular SF Staff → **Step 1:** `sf_office` (Verification & leave-balance/CCL check) → **Step 2:** Managing `hod` / `gen_dept_coordinator` (Recommendation) → **Step 3:** `academic_coordinator` (Final Approval).
  - SF HOD / `gen_dept_coordinator` → **Step 1:** `sf_office` (Verification) → **Step 2:** `academic_coordinator` (Final Approval).
  - `academic_coordinator` → **Step 1:** `principal` (Final Approval).
- **Student Leave (`student_leave`):**
  - Single-step approval by the batch's assigned **Tutor** or the student's assigned **Mentor** (`attendance.student_leave.approve` scoped to `batch` / `sub_batch(mentoring)`).
- **CIA Consolidation (`cia_consolidation`):**
  - **Step 1 (`draft` → `submitted_by_tutor`):** Course teachers lock component marks; Batch **Tutor** reviews batch-wide CIA summary and submits.
  - **Step 2 (`submitted_by_tutor` → `locked_by_hod`):** Managing **HOD** (or **General Dept Coordinator** for S1/S2) locks the semester CIA.
  - **Unlock / Override:** Only Managing **HOD** or **Principal** can reopen a locked consolidation, requiring a mandatory audit reason.

### 2. Notification Architecture (In-App + FCM + Pluggable Channels)
- **First-class Web Notification Center (MVP):**
  - Backed by a tenant `notifications` table (`id`, `recipient_user_id`, `category`, `severity`, `title`, `body`, `action_url`, `data_json`, `read_at`, `created_at`) and `user_notification_preferences`.
  - Delivered in real time to the Next.js top-bar bell & `/notifications` inbox via **Laravel Reverb** (WebSockets) with automatic SWR/TanStack Query polling fallback.
- **Firebase Cloud Messaging (FCM):**
  - `user_push_tokens` stores device tokens (`platform ∈ ('web', 'ios', 'android')`, `fcm_token`, `device_name`, `last_seen_at`).
  - `FcmPushChannel` dispatches asynchronous queue jobs via Redis/Horizon so the exact same backend notification events automatically push to the React Native (Expo) app once built.
- **SMS / WhatsApp / Email Isolation:**
  - All external delivery runs strictly on queued background jobs (`notifications` queue) behind `NotificationChannelContract` (`InAppChannel`, `MailChannel`, `FcmPushChannel`, `SmsChannel`, `WhatsAppChannel`).
  - No HTTP request ever blocks on an external SMTP, Firebase, or SMS gateway call.

### 3. External AI Assistant ("Carmie" RAG Service) Integration Boundary
- The AI Assistant lives in a **separate repository and service** (e.g., Python/FastAPI or TypeScript RAG pipeline).
- The core Academic Suite exposes only a dedicated, read-only `/api/v1/ai-bridge/*` surface (and/or MCP server) that:
  1. Authenticates requests using the asking user's short-lived, capability-scoped bearer token + `X-Tenant-ID`.
  2. Enforces the exact same `ScopeAuthorizer` policies as the web UI — **the AI assistant can never retrieve records the asking user is not authorized to view**.
  3. Logs every AI tool invocation and query metadata to `audit_logs` with `source = 'ai_assistant'`.
- WebRTC Remote Support (`SupportDeskController`) is permanently dropped from the platform.

### 4. Gaps to close before seeding
- Who approves leave for the **Principal**, `admin`, `sf_office` and `super_admin` applicants is not defined yet.
- Role keys: one `gen_dept_coordinator` (scoped to `GEN_AIDED` / `GEN_SF`) and one `academic_coordinator` (scoped to stream `SF`); the chain depends on the applicant's stream, not on a stream-specific role key.

## Consequences
- Stream-specific office operations (`AIDED` vs `SF`) work cleanly out of the box and can be customized per college tenant via seed/settings.
- The web app gets an immediate, responsive Notification Center, while mobile push for React Native requires zero backend re-engineering later.
- Separating the RAG AI assistant keeps the core transactional monolith lean, fast, and auditable.
