/**
 * Runtime type guards and parsers for API endpoints whose generated OpenAPI schemas
 * are currently `unknown` (`content?: never`) or placeholder shapes (`Record<string, never>[]`).
 *
 * Centralised here so every narrowing helper can be deleted once `contracts/openapi.yaml`
 * is updated and `@academic-suite/api-client` is regenerated.
 */

import type { WorkspaceRoleAssignment } from "@/lib/workspaces/workspaces";

export interface UserRecord {
  id: string;
  type: "staff" | "student" | "parent" | string;
  name: string;
  email: string | null;
  mobile: string | null;
  registration_number: string | null;
  status: "active" | "suspended" | "pending" | string;
  must_change_password: boolean;
  last_login_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface RoleAssignmentUserSummary {
  id: string;
  name: string;
  email: string | null;
  mobile: string | null;
}

export interface RoleAssignmentRecord {
  id: string;
  user_id: string;
  role_key: string;
  role_name: string | null;
  scope_type: string;
  scope_label: string;
  is_singleton: boolean;
  is_active: boolean;
  valid_from: string | null;
  valid_to: string | null;
  user: RoleAssignmentUserSummary | null;
}

export interface PaginationMeta {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface TemporaryPasswordPayload {
  temporary_password: string;
  expires_at: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asPositiveInt(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

function parsePaginationMeta(raw: unknown, itemCount: number): PaginationMeta {
  if (!isRecord(raw)) {
    return {
      current_page: 1,
      last_page: 1,
      per_page: Math.max(itemCount, 25),
      total: itemCount,
    };
  }

  return {
    current_page: Math.max(1, asPositiveInt(raw.current_page, 1)),
    last_page: Math.max(1, asPositiveInt(raw.last_page, 1)),
    per_page: Math.max(1, asPositiveInt(raw.per_page, 25)),
    total: asPositiveInt(raw.total, itemCount),
  };
}

export function parseUserRecord(raw: unknown): UserRecord | null {
  if (!isRecord(raw)) return null;
  const id = asString(raw.id);
  const name = asString(raw.name);
  if (!id || !name) return null;

  return {
    id,
    type: asString(raw.type, "staff"),
    name,
    email: asNullableString(raw.email),
    mobile: asNullableString(raw.mobile),
    registration_number: asNullableString(raw.registration_number),
    status: asString(raw.status, "active"),
    must_change_password: asBoolean(raw.must_change_password, false),
    last_login_at: asNullableString(raw.last_login_at),
    created_at: asNullableString(raw.created_at),
    updated_at: asNullableString(raw.updated_at),
  };
}

export function parseUserEnvelope(raw: unknown): UserRecord | null {
  if (!isRecord(raw)) return null;
  return parseUserRecord(raw.data);
}

export function parsePaginatedUsers(raw: unknown): PaginatedResult<UserRecord> {
  if (!isRecord(raw) || !Array.isArray(raw.data)) {
    return { data: [], meta: parsePaginationMeta(null, 0) };
  }

  const data = raw.data
    .map(parseUserRecord)
    .filter((item): item is UserRecord => item !== null);

  return {
    data,
    meta: parsePaginationMeta(raw.meta, data.length),
  };
}

function parseAssignmentUserSummary(raw: unknown): RoleAssignmentUserSummary | null {
  if (!isRecord(raw)) return null;
  const id = asString(raw.id);
  const name = asString(raw.name);
  if (!id || !name) return null;

  return {
    id,
    name,
    email: asNullableString(raw.email),
    mobile: asNullableString(raw.mobile),
  };
}

export function parseRoleAssignmentRecord(raw: unknown): RoleAssignmentRecord | null {
  if (!isRecord(raw)) return null;
  const id = asString(raw.id);
  const userId = asString(raw.user_id);
  const roleKey = asString(raw.role_key);
  if (!id || !userId || !roleKey) return null;

  return {
    id,
    user_id: userId,
    role_key: roleKey,
    role_name: asNullableString(raw.role_name),
    scope_type: asString(raw.scope_type),
    scope_label: asString(raw.scope_label),
    is_singleton: asBoolean(raw.is_singleton, false),
    is_active: asBoolean(raw.is_active, true),
    valid_from: asNullableString(raw.valid_from),
    valid_to: asNullableString(raw.valid_to),
    user: parseAssignmentUserSummary(raw.user),
  };
}

export function parsePaginatedRoleAssignments(raw: unknown): PaginatedResult<RoleAssignmentRecord> {
  if (!isRecord(raw) || !Array.isArray(raw.data)) {
    return { data: [], meta: parsePaginationMeta(null, 0) };
  }

  const data = raw.data
    .map(parseRoleAssignmentRecord)
    .filter((item): item is RoleAssignmentRecord => item !== null);

  return {
    data,
    meta: parsePaginationMeta(raw.meta, data.length),
  };
}

export function parseMeAssignments(raw: unknown): WorkspaceRoleAssignment[] {
  if (!Array.isArray(raw)) return [];
  const parsed: WorkspaceRoleAssignment[] = [];

  for (const item of raw) {
    if (!isRecord(item)) continue;
    const roleKey = asString(item.role_key);
    const scopeType = asString(item.scope_type);
    if (!roleKey || !scopeType) continue;

    parsed.push({
      id: asNullableString(item.id) ?? undefined,
      role_key: roleKey,
      role_name: asNullableString(item.role_name) ?? undefined,
      scope_type: scopeType,
      scope_label: asNullableString(item.scope_label) ?? undefined,
      is_singleton: typeof item.is_singleton === "boolean" ? item.is_singleton : undefined,
      is_active: typeof item.is_active === "boolean" ? item.is_active : undefined,
      valid_from: asNullableString(item.valid_from),
      valid_to: asNullableString(item.valid_to),
    });
  }

  return parsed;
}

export function parseTemporaryPasswordPayload(raw: unknown): TemporaryPasswordPayload | null {
  if (!isRecord(raw)) return null;
  const source = isRecord(raw.data) ? raw.data : raw;
  const tempPassword = asNullableString(source.temporary_password);
  if (!tempPassword) return null;

  return {
    temporary_password: tempPassword,
    expires_at: asNullableString(source.expires_at),
  };
}

export function parseActionMessage(raw: unknown): string | null {
  if (!isRecord(raw)) return null;
  if (isRecord(raw.data) && typeof raw.data.message === "string") {
    return raw.data.message;
  }
  if (isRecord(raw.meta) && typeof raw.meta.message === "string") {
    return raw.meta.message;
  }
  return null;
}
