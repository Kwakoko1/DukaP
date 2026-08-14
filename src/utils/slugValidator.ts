/**
 * Reserved system identifiers that cannot be claimed by tenants
 */
const RESERVED_SLUGS = new Set([
  'admin',
  'administrator',
  'api',
  'app',
  'auth',
  'billing',
  'blog',
  'cdn',
  'dashboard',
  'dev',
  'developer',
  'docs',
  'domain',
  'help',
  'kwakopos',
  'login',
  'mail',
  'marketing',
  'metrics',
  'oauth',
  'portal',
  'root',
  'sales',
  'security',
  'signup',
  'staging',
  'status',
  'superadmin',
  'support',
  'system',
  'test',
  'webhook',
  'www'
]);

export interface SlugValidationResult {
  valid: boolean;
  slug: string;
  reason?: string;
}

/**
 * Validates a proposed tenant slug for URL-safety and system reservation rules.
 */
export function validateTenantSlug(rawSlug: string): SlugValidationResult {
  if (!rawSlug || typeof rawSlug !== 'string') {
    return { valid: false, slug: '', reason: 'Tenant slug is required.' };
  }

  // Sanitize to lowercase, replace spaces and special characters with hyphens
  const clean = rawSlug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (clean.length < 3) {
    return { valid: false, slug: clean, reason: 'Tenant slug must be at least 3 characters long.' };
  }

  if (clean.length > 63) {
    return { valid: false, slug: clean, reason: 'Tenant slug cannot exceed 63 characters.' };
  }

  if (RESERVED_SLUGS.has(clean)) {
    return { valid: false, slug: clean, reason: `The workspace name "${clean}" is a reserved system identifier.` };
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(clean)) {
    return { valid: false, slug: clean, reason: 'Slug must contain only alphanumeric characters and hyphens.' };
  }

  return { valid: true, slug: clean };
}
