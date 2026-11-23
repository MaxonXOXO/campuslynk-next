const ROLE_AUTHORITY_RANKS: Record<string, number> = {
  super_admin: 100,
  principal: 90,
  chairman: 85,
  admin: 80,
  hod: 70,
  academic_coordinator: 60,
  gen_dept_coordinator: 60,
  workshop_superintendent: 60,
  sf_office: 60,
  tutor: 50,
  mentor: 45,
  lecturer: 40,
  demonstrator: 40,
  workshop_instructor: 40,
  trade_instructor: 40,
  tradesman: 40,
  laboratory_assistant: 40,
  physical_instructor: 40,
  course_teacher: 40,
  student: 10,
  parent: 10,
};

export function getHighestActiveRoleRank(
  assignments: ReadonlyArray<{ role_key: string }> | undefined
): number {
  if (!assignments || assignments.length === 0) return 0;
  let max = 0;
  for (const a of assignments) {
    const rank = ROLE_AUTHORITY_RANKS[a.role_key] ?? 0;
    if (rank > max) {
      max = rank;
    }
  }
  return max;
}

export function isLowerAuthorityTarget(
  actor: { id?: string; assignments?: ReadonlyArray<{ role_key: string }> } | null,
  target: { id: string; assignments?: ReadonlyArray<{ role_key: string }> }
): { allowed: boolean; reason?: string } {
  if (!actor) {
    return { allowed: false, reason: "Sign in required." };
  }
  if (actor.id && actor.id === target.id) {
    return {
      allowed: false,
      reason: "You cannot perform this action on your own account.",
    };
  }

  const actorRank = getHighestActiveRoleRank(actor.assignments);
  const targetRank = getHighestActiveRoleRank(target.assignments);
  if (actorRank <= targetRank) {
    return {
      allowed: false,
      reason: "Cannot act on a user with an equal or higher authority role.",
    };
  }

  return { allowed: true };
}

export function canResetTargetPassword(
  actor: { id?: string; assignments?: ReadonlyArray<{ role_key: string }> } | null,
  target: { id: string; assignments?: ReadonlyArray<{ role_key: string }> }
): { allowed: boolean; reason?: string } {
  if (!actor) {
    return { allowed: false, reason: "Sign in required." };
  }
  if (actor.id && actor.id === target.id) {
    return {
      allowed: false,
      reason: "You cannot reset your own password via administrative reset.",
    };
  }

  const check = isLowerAuthorityTarget(actor, target);
  if (!check.allowed) {
    return {
      allowed: false,
      reason: "Cannot reset password for a user with an equal or higher authority role.",
    };
  }

  return { allowed: true };
}

