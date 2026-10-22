/**
 * Maps login failures to Persian messages by the API's stable error `code`
 * (see apps/api auth.service.ts and the Next proxy route), never by English message text.
 */
export function describeLoginError(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  switch (code) {
    case 'INVALID_CREDENTIALS':
      return 'کد پرسنلی یا رمز عبور اشتباه است.';
    case 'ACCOUNT_INACTIVE':
      return 'این حساب کاربری غیرفعال است. با سرپرست تماس بگیرید.';
    case 'RATE_LIMIT_EXCEEDED':
      return 'تعداد تلاش‌های ناموفق زیاد بوده است. کمی بعد دوباره تلاش کنید.';
    case 'BACKEND_UNAVAILABLE':
      return 'اتصال به سرور برقرار نشد. کمی بعد دوباره تلاش کنید.';
    default:
      return 'ورود انجام نشد. لطفاً دوباره تلاش کنید.';
  }
}
