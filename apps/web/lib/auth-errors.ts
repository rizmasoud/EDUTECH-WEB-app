/**
 * Maps login failures to user-facing messages by the API's stable error `code`
 * (see apps/api auth.service.ts and the Next proxy route), never by English message text.
 */
export function describeLoginError(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  switch (code) {
    case 'INVALID_CREDENTIALS':
      return 'Incorrect personnel code or password.';
    case 'ACCOUNT_INACTIVE':
      return 'This account is inactive. Contact your supervisor.';
    case 'RATE_LIMIT_EXCEEDED':
      return 'Too many failed attempts. Please try again later.';
    case 'BACKEND_UNAVAILABLE':
      return 'Could not reach the server. Please try again later.';
    default:
      return 'Sign-in failed. Please try again.';
  }
}
