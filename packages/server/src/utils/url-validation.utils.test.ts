import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as dns from 'node:dns/promises';

import { validateUrlSafety } from './url-validation.utils.js';

vi.mock('node:dns/promises', () => ({
  default: { lookup: vi.fn() },
  lookup: vi.fn(),
}));

const mockLookup = vi.mocked(dns.lookup);

describe('validateUrlSafety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows a public URL that resolves to a public IP', async () => {
    mockLookup.mockResolvedValue({ address: '93.184.216.34', family: 4 });
    await expect(validateUrlSafety('https://example.com')).resolves.toBeUndefined();
  });

  it('rejects a URL with file:// protocol', async () => {
    await expect(validateUrlSafety('file:///etc/passwd'))
      .rejects.toThrow('URL must use http or https protocol');
  });

  it('rejects a URL with ftp:// protocol', async () => {
    await expect(validateUrlSafety('ftp://files.example.com/data'))
      .rejects.toThrow('URL must use http or https protocol');
  });

  it('rejects localhost by hostname', async () => {
    mockLookup.mockResolvedValue({ address: '127.0.0.1', family: 4 });
    await expect(validateUrlSafety('http://localhost:3000'))
      .rejects.toThrow('private or internal');
  });

  it('rejects 127.0.0.1 as literal IP', async () => {
    mockLookup.mockResolvedValue({ address: '127.0.0.1', family: 4 });
    await expect(validateUrlSafety('http://127.0.0.1:3000'))
      .rejects.toThrow('private or internal');
  });

  it('rejects 10.x.x.x private range', async () => {
    mockLookup.mockResolvedValue({ address: '10.0.0.1', family: 4 });
    await expect(validateUrlSafety('http://internal.corp'))
      .rejects.toThrow('private or internal');
  });

  it('rejects 172.16.x.x private range', async () => {
    mockLookup.mockResolvedValue({ address: '172.16.0.1', family: 4 });
    await expect(validateUrlSafety('http://internal.corp'))
      .rejects.toThrow('private or internal');
  });

  it('rejects 192.168.x.x private range', async () => {
    mockLookup.mockResolvedValue({ address: '192.168.1.1', family: 4 });
    await expect(validateUrlSafety('http://home.local'))
      .rejects.toThrow('private or internal');
  });

  it('rejects 169.254.169.254 (cloud metadata endpoint)', async () => {
    mockLookup.mockResolvedValue({ address: '169.254.169.254', family: 4 });
    await expect(validateUrlSafety('http://169.254.169.254/latest/meta-data/'))
      .rejects.toThrow('private or internal');
  });

  it('rejects 0.0.0.0', async () => {
    mockLookup.mockResolvedValue({ address: '0.0.0.0', family: 4 });
    await expect(validateUrlSafety('http://0.0.0.0'))
      .rejects.toThrow('private or internal');
  });

  it('rejects IPv6 loopback ::1', async () => {
    mockLookup.mockResolvedValue({ address: '::1', family: 6 });
    await expect(validateUrlSafety('http://[::1]'))
      .rejects.toThrow('private or internal');
  });

  it('rejects DNS rebinding (hostname resolves to private IP)', async () => {
    mockLookup.mockResolvedValue({ address: '127.0.0.1', family: 4 });
    await expect(validateUrlSafety('https://evil-rebind.attacker.com'))
      .rejects.toThrow('private or internal');
  });

  it('rejects unresolvable hostnames', async () => {
    mockLookup.mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));
    await expect(validateUrlSafety('http://definitely-not-real.invalid'))
      .rejects.toThrow('Could not resolve URL hostname');
  });

  it('rejects malformed URLs', async () => {
    await expect(validateUrlSafety('not-a-url'))
      .rejects.toThrow('Invalid URL format');
  });

  it('allows 172.15.x.x (not in private range)', async () => {
    mockLookup.mockResolvedValue({ address: '172.15.0.1', family: 4 });
    await expect(validateUrlSafety('https://example.com')).resolves.toBeUndefined();
  });

  it('allows 172.32.x.x (not in private range)', async () => {
    mockLookup.mockResolvedValue({ address: '172.32.0.1', family: 4 });
    await expect(validateUrlSafety('https://example.com')).resolves.toBeUndefined();
  });

  it('rejects 100.64.x.x CGNAT range', async () => {
    mockLookup.mockResolvedValue({ address: '100.64.0.1', family: 4 });
    await expect(validateUrlSafety('http://internal.cloud'))
      .rejects.toThrow('private or internal');
  });

  it('rejects 100.127.x.x (upper end of CGNAT)', async () => {
    mockLookup.mockResolvedValue({ address: '100.127.255.254', family: 4 });
    await expect(validateUrlSafety('http://internal.cloud'))
      .rejects.toThrow('private or internal');
  });

  it('allows 100.63.x.x (below CGNAT range)', async () => {
    mockLookup.mockResolvedValue({ address: '100.63.255.1', family: 4 });
    await expect(validateUrlSafety('https://example.com')).resolves.toBeUndefined();
  });

  it('rejects IPv6 link-local fe80::', async () => {
    mockLookup.mockResolvedValue({ address: 'fe80::1', family: 6 });
    await expect(validateUrlSafety('http://[fe80::1]'))
      .rejects.toThrow('private or internal');
  });
});
