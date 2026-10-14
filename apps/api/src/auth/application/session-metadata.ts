/**
 * Bounded, validated client metadata recorded with a session and in security audit events.
 *
 * Policy (matches the `sessions` column sizes; no schema change):
 *  - IP address: must be a syntactically valid IPv4/IPv6 address no longer than 64 characters.
 *    Anything else is stored as `null` - it is NEVER truncated, because a cut-off address is a
 *    different (misleading) address. The value comes from the framework-resolved `req.ip`, which
 *    only honours `X-Forwarded-For` when Express `trust proxy` allows it (see main.ts).
 *  - User-Agent: informational only. Control characters are removed; values longer than 255
 *    characters are cut to 252 characters plus a literal "..." so the record visibly shows that it
 *    was shortened. Empty values become `null`.
 * The same sanitised values are used for the session row and for audit metadata.
 */
import { isIP } from 'node:net';

export const MAX_USER_AGENT_LENGTH = 255; // sessions.user_agent varchar(255)
export const MAX_IP_ADDRESS_LENGTH = 64; // sessions.ip_address varchar(64)
const TRUNCATION_MARKER = '...';

export interface ClientInfoInput {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface SessionClientInfo {
  ipAddress: string | null;
  userAgent: string | null;
}

export function sanitizeIpAddress(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const ip = value.trim();
  if (ip.length === 0 || ip.length > MAX_IP_ADDRESS_LENGTH) return null;
  return isIP(ip) !== 0 ? ip : null;
}

export function sanitizeUserAgent(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const ua = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (ua.length === 0) return null;
  if (ua.length <= MAX_USER_AGENT_LENGTH) return ua;
  let cut = ua.slice(0, MAX_USER_AGENT_LENGTH - TRUNCATION_MARKER.length);
  // Do not leave half of a surrogate pair at the cut.
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
  return cut + TRUNCATION_MARKER;
}

export function sanitizeClientInfo(info: ClientInfoInput = {}): SessionClientInfo {
  return {
    ipAddress: sanitizeIpAddress(info.ipAddress),
    userAgent: sanitizeUserAgent(info.userAgent),
  };
}
