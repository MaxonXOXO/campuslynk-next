import type { SignupPolicyFormValues } from './validation';

export type RegistrationPreferences = Readonly<SignupPolicyFormValues>;

/** Preview only: successful completion persists these defaults on the backend. */
export const DEFAULT_REGISTRATION_PREFERENCES: RegistrationPreferences = Object.freeze<SignupPolicyFormValues>({
  student_self_registration_enabled: false,
  parent_self_registration_enabled: false,
  approval_mode: 'manual',
});
