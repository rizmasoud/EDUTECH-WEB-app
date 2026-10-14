import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_IP_ADDRESS_LENGTH,
  MAX_USER_AGENT_LENGTH,
  sanitizeClientInfo,
  sanitizeIpAddress,
  sanitizeUserAgent,
} from '../../apps/api/src/auth/application/session-metadata';

describe('sanitizeIpAddress (never truncates; invalid -> null)', () => {
  it('keeps valid IPv4, IPv6 and IPv4-mapped IPv6 unchanged', () => {
    for (const ip of ['127.0.0.1', '203.0.113.7', '::1', '2001:db8::8a2e:370:7334', '::ffff:127.0.0.1']) {
      assert.equal(sanitizeIpAddress(ip), ip);
    }
  });
  it('rejects forwarded-header style lists, garbage and over-long values instead of cutting them', () => {
    for (const bad of ['1.1.1.1, 2.2.2.2', 'not-an-ip', '1.2.3.4:80', 'x'.repeat(2000), '1.1.1.1'.padEnd(MAX_IP_ADDRESS_LENGTH + 1, '1'), '', '   ']) {
      assert.equal(sanitizeIpAddress(bad), null, bad.slice(0, 30));
    }
  });
  it('non-string input -> null', () => {
    for (const v of [undefined, null, 5, {}, ['1.1.1.1']]) assert.equal(sanitizeIpAddress(v), null);
  });
});

describe('sanitizeUserAgent (bounded, visibly marked when shortened)', () => {
  it('keeps normal and exactly-255-character values unchanged', () => {
    assert.equal(sanitizeUserAgent('Mozilla/5.0 (X11; Linux x86_64)'), 'Mozilla/5.0 (X11; Linux x86_64)');
    const exact = 'a'.repeat(MAX_USER_AGENT_LENGTH);
    assert.equal(sanitizeUserAgent(exact), exact);
  });
  it('shortens 256+ characters to exactly 255 with a literal "..." marker and keeps the prefix', () => {
    const long = 'Mozilla/' + 'b'.repeat(5000);
    const out = sanitizeUserAgent(long) as string;
    assert.equal(out.length, MAX_USER_AGENT_LENGTH);
    assert.ok(out.endsWith('...'));
    assert.ok(long.startsWith(out.slice(0, -3)));
    assert.notEqual(sanitizeUserAgent('a'.repeat(256)), 'a'.repeat(255), 'a cut value must be distinguishable from a genuine 255-char value');
  });
  it('removes control characters and maps empty to null', () => {
    assert.equal(sanitizeUserAgent('Agent\u0000/1.0\r\n'), 'Agent/1.0');
    assert.equal(sanitizeUserAgent('\u0001\u0002'), null);
    assert.equal(sanitizeUserAgent('   '), null);
    assert.equal(sanitizeUserAgent(undefined), null);
    assert.equal(sanitizeUserAgent(['a'] as unknown), null);
  });
  it('never leaves half a surrogate pair at the cut', () => {
    const s = 'a'.repeat(251) + '😀'.repeat(10); // the cut at 252 falls inside the first emoji
    const out = sanitizeUserAgent(s) as string;
    assert.ok(out.length <= MAX_USER_AGENT_LENGTH);
    assert.ok(!/[\ud800-\udbff](?![\udc00-\udfff])/.test(out));
  });
});

describe('sanitizeClientInfo', () => {
  it('returns nulls for missing input and applies both policies', () => {
    assert.deepEqual(sanitizeClientInfo(), { ipAddress: null, userAgent: null });
    assert.deepEqual(sanitizeClientInfo({ ipAddress: '10.0.0.1', userAgent: 'x' }), { ipAddress: '10.0.0.1', userAgent: 'x' });
  });
});
