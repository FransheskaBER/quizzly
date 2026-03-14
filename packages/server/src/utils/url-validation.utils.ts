import { lookup } from 'node:dns/promises';

import { BadRequestError } from './errors.js';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/** Checks if an IPv6 address is loopback, unique-local, or link-local. */
const isPrivateIpv6 = (ip: string): boolean => {
  if (ip === '::1' || ip === '::') return true;
  const lower = ip.toLowerCase();
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  if (lower.startsWith('fe8') || lower.startsWith('fe9') ||
      lower.startsWith('fea') || lower.startsWith('feb')) return true;
  return false;
};

/** Checks if an IPv4 address falls within a private/reserved range. */
const isPrivateIpv4 = (a: number, b: number): boolean =>
  a === 127 ||                          // 127.0.0.0/8 (loopback)
  a === 10 ||                           // 10.0.0.0/8 (private)
  (a === 172 && b >= 16 && b <= 31) ||  // 172.16.0.0/12 (private)
  (a === 192 && b === 168) ||           // 192.168.0.0/16 (private)
  (a === 169 && b === 254) ||           // 169.254.0.0/16 (link-local / cloud metadata)
  (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 (CGNAT / shared address space)
  a === 0;                              // 0.0.0.0

/** Checks whether an IP address falls within a private/reserved range. */
const isPrivateIp = (ip: string): boolean => {
  if (isPrivateIpv6(ip)) return true;

  const v4Mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  const ipv4 = v4Mapped ? v4Mapped[1]! : ip;
  const parts = ipv4.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p))) return false;

  return isPrivateIpv4(parts[0]!, parts[1]!);
};

/**
 * Validates that a URL is safe to fetch server-side.
 * Defends against SSRF by resolving the hostname to an IP and checking
 * it against private/reserved ranges. Throws BadRequestError if unsafe.
 */
export const validateUrlSafety = async (url: string): Promise<void> => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new BadRequestError('Invalid URL format');
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new BadRequestError('URL must use http or https protocol');
  }

  const hostname = parsed.hostname;

  // Block literal IP addresses that are obviously private
  if (isPrivateIp(hostname)) {
    throw new BadRequestError('URLs pointing to private or internal addresses are not allowed');
  }

  // Resolve hostname to IP and check the resolved address
  try {
    const { address } = await lookup(hostname);
    if (isPrivateIp(address)) {
      throw new BadRequestError('URLs pointing to private or internal addresses are not allowed');
    }
  } catch (err) {
    if (err instanceof BadRequestError) throw err;
    throw new BadRequestError('Could not resolve URL hostname');
  }
};
