/**
 * URL Validator Utility
 * Responsibility: Validates public HTTP/HTTPS URLs and blocks SSRF vectors,
 * including localhost, private RFC 1918 ranges, link-local addresses, and cloud metadata endpoints.
 */
import net from 'net'

const DISALLOWED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.google',
  'instance-data',
])

/**
 * Checks if an IPv4 address belongs to a private, loopback, link-local, or reserved range.
 *
 * @param {string} ip
 * @returns {boolean} True if the IP is restricted / non-public
 */
function isRestrictedIPv4(ip) {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true
  }

  const [a, b] = parts

  // 0.0.0.0/8 (Current network)
  if (a === 0) return true

  // 10.0.0.0/8 (Private)
  if (a === 10) return true

  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true

  // 169.254.0.0/16 (Link-local / Cloud metadata)
  if (a === 169 && b === 254) return true

  // 172.16.0.0/12 (Private: 172.16.x.x - 172.31.x.x)
  if (a === 172 && b >= 16 && b <= 31) return true

  // 192.168.0.0/16 (Private)
  if (a === 192 && b === 168) return true

  // 100.64.0.0/10 (Shared Address Space / CGNAT)
  if (a === 100 && b >= 64 && b <= 127) return true

  // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved)
  if (a >= 224) return true

  return false
}

/**
 * Checks if an IPv6 address belongs to a loopback, private, link-local, or IPv4-mapped restricted range.
 *
 * @param {string} ip
 * @returns {boolean} True if the IP is restricted
 */
function isRestrictedIPv6(ip) {
  const lower = ip.toLowerCase()

  // Loopback ::1
  if (lower === '::1' || lower === '0:0:0:0:0:0:0:1') return true

  // Unspecified ::
  if (lower === '::' || lower === '0:0:0:0:0:0:0:0') return true

  // Link-local fe80::/10
  if (lower.startsWith('fe80:') || lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) {
    return true
  }

  // Unique local fc00::/7 (fc00:: and fd00::)
  if (lower.startsWith('fc') || lower.startsWith('fd')) {
    return true
  }

  // IPv4-mapped IPv6 (::ffff:192.168.1.1)
  if (lower.startsWith('::ffff:')) {
    const ipv4Part = lower.substring(7)
    if (net.isIPv4(ipv4Part)) {
      return isRestrictedIPv4(ipv4Part)
    }
  }

  return false
}

/**
 * Validates a single URL string for protocol and public accessibility.
 *
 * @param {string} urlString
 * @returns {{ valid: boolean, error?: string, sanitizedUrl?: string }}
 */
export function validateFetchUrl(urlString) {
  if (typeof urlString !== 'string' || !urlString.trim()) {
    return { valid: false, error: 'URL must be a non-empty string.' }
  }

  const trimmed = urlString.trim()

  let parsed
  try {
    parsed = new URL(trimmed)
  } catch {
    return { valid: false, error: `Invalid URL format: "${trimmed}"` }
  }

  // Only allow http and https
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      valid: false,
      error: `Invalid protocol "${parsed.protocol}" for URL: "${trimmed}". Only HTTP and HTTPS are permitted.`,
    }
  }

  let hostname = parsed.hostname.toLowerCase()

  // Strip IPv6 square brackets if present
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    hostname = hostname.slice(1, -1)
  }

  if (!hostname) {
    return { valid: false, error: `URL has an empty hostname: "${trimmed}"` }
  }

  // Check known restricted hostnames
  if (DISALLOWED_HOSTNAMES.has(hostname)) {
    return {
      valid: false,
      error: `Access to restricted or private destination "${hostname}" is prohibited.`,
    }
  }

  // Block local domains
  if (
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.lan') ||
    hostname.endsWith('.home') ||
    hostname.endsWith('.corp')
  ) {
    return {
      valid: false,
      error: `Local and internal network domains like "${hostname}" are not permitted.`,
    }
  }

  // Block numeric IP representations (e.g. integer IP 2130706433 or octal)
  if (/^\d+$/.test(hostname)) {
    return {
      valid: false,
      error: `Numeric IP representation "${hostname}" is not permitted.`,
    }
  }

  // Validate IP addresses directly
  const ipFamily = net.isIP(hostname)
  if (ipFamily === 4) {
    if (isRestrictedIPv4(hostname)) {
      return {
        valid: false,
        error: `Private or loopback IP destination "${hostname}" is prohibited.`,
      }
    }
  } else if (ipFamily === 6) {
    if (isRestrictedIPv6(hostname)) {
      return {
        valid: false,
        error: `Private, loopback, or link-local IPv6 destination "${hostname}" is prohibited.`,
      }
    }
  }

  return { valid: true, sanitizedUrl: parsed.toString() }
}
