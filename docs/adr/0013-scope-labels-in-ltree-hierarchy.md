# ADR-0013: Scope Labels and Deterministic Hierarchy in PostgreSQL LTree

**Status:** Decided  
**Date:** 2026-11-02  
**Deciders:** Core Architecture Team  
**Consulted:** ADR-0005, ADR-0004, ADR-0010  

---

## Context

ADR-0005 established that the institution's organizational structure requires dual scope hierarchies to resolve split academic governance (specifically, first-year polytechnic students managed by the General Department while permanently belonging to their engineering parent department).

PostgreSQL's native `ltree` extension allows hierarchical path structures to be queried with high performance using GiST indexing. However:
1. `ltree` labels must conform to strict PostgreSQL syntax rules: words consisting of alphanumeric characters and underscores (`[A-Za-z0-9_]`), limited to 256 bytes per label.
2. Unstandardized or ad-hoc labels across different models (e.g. using raw IDs, strings with hyphens, spaces, or raw department codes) create collisions or syntax errors in `lquery` expressions.
3. In Scoped RBAC, a user's role assignment carries a `scope_label` (e.g. `d_ce` for HOD of Civil Engineering). The system must deterministically match this `scope_label` against the ancestor path of any target resource.

---

## Decision

1. **Standardized Scope Label Format:**
   Every structural node in the tenant database carries an immutable or deterministic `scope_label` column matching the regex:
   ```regex
   ^[a-zA-Z0-9_]{1,63}$
   ```
   Labels use standardized type prefixes followed by lowercase normalized codes or slugs:
   - **Institution:** `i_{code}` (e.g. `i_carmel`)
   - **Stream:** `s_{code}` (e.g. `s_aided`, `s_sf`, `s_shared`)
   - **Department:** `d_{code}` (e.g. `d_ce`, `d_me`, `d_gen_aided`, `d_gen_sf`)
   - **Program:** `p_{code}` (e.g. `p_dce`, `p_dme`, `p_dct`)
   - **Batch:** `b_{slug}` (e.g. `b_civil_2026_2029`)
   - **Sub-Batch:** `sb_{slug}` (e.g. `sb_civil_2026_2029_lab_1`)
   - **Workshop Section:** `ws_{code}` (e.g. `ws_fitting`, `ws_smithy`)
   - **Own / Personal Scope:** `u_{ulid}`

2. **Dual Scope Paths on Batches (ADR-0005 Implementation):**
   Batches maintain two native PostgreSQL `ltree` columns:
   - `home_path`: Permanent affiliation path:
     `{institution}.{stream}.{home_department}.{program}.{batch}`
     *(e.g. `i_carmel.s_aided.d_ce.p_dce.b_civil_2026_2029`)*
   - `managing_path`: Dynamic governance path:
     `{institution}.{stream}.{managing_department}.{program}.{batch}`
     *(e.g. in S1/S2: `i_carmel.s_aided.d_gen_aided.p_dce.b_civil_2026_2029`)*
     *(e.g. in S3+: `i_carmel.s_aided.d_ce.p_dce.b_civil_2026_2029`)*

3. **Dual-Path Authorization Rules:**
   - **Governance / Write Permissions:** Evaluated strictly against `managing_path`. HOD of CE (`d_ce`) is blocked from modifying, entering marks, or promoting a batch when `current_semester <= 2` because `d_ce` is not in `managing_path`.
   - **Read / Analytics Permissions:** Evaluated against `managing_path` OR `home_path`. HOD of CE can always view students, records, and progress of CE batches in S1/S2.

4. **LTree GiST Indexing & Parameterized Queries:**
   - Indexes:
     ```sql
     CREATE INDEX batches_home_path_gist ON batches USING gist (home_path);
     CREATE INDEX batches_managing_path_gist ON batches USING gist (managing_path);
     ```
   - In `visibleTo` query scoping (`ScopeAuthorizer::scopeQuery`), labels are validated against `^[a-zA-Z0-9_]{1,63}$` and bound via parameter binding (`?::lquery`), never concatenated into raw SQL:
     ```php
     $query->whereRaw("{$managingPathCol} ~ ?::lquery", [$lquery]);
     ```

5. **Exclusion Constraints on Governance Ranges:**
   To guarantee that no home department can have overlapping semester governance rules, `department_semester_governance` enforces:
   ```sql
   ALTER TABLE department_semester_governance
   ADD CONSTRAINT dept_sem_gov_no_overlap
   EXCLUDE USING gist (
       home_department_id WITH =,
       int4range(semester_from, semester_to, '[]') WITH &&
   );
   ```

---

## Consequences

- Absolute database-level integrity for hierarchical ancestry checks.
- Rapid pagination and filtering of scoped resources without N+1 query loops.
- Clear, deterministic mapping between RBAC role assignment scopes and resource positions in the institution.

