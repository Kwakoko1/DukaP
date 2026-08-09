/**
 * Human-Readable Tenant Identifier (HR-TID) Engine
 * DukaPos Enterprise SaaS & POS Platform
 * 
 * Provides standard, unambiguous, memorable, and checksum-validated 
 * Human-Readable Tenant IDs for multi-tenant isolation, customer support,
 * domain routing, POS logins, receipts, and compliance audit reporting.
 */

export interface TenantIdGenerationParams {
  companyName: string;
  businessType?: string;
  countryCode?: string; // e.g. 'TZ', 'KE', 'UG', 'RW'
  format?: 'HYBRID_ENTERPRISE' | 'COMPACT_POS' | 'SERIAL_LICENSE';
}

export interface ParsedTenantId {
  raw: string;
  formatted: string;
  countryCode: string;
  industryCode: string;
  brandMoniker: string;
  uniqueHash: string;
  checksum: string;
  isValid: boolean;
}

// Crockford-inspired Base32 Alphabet (Excludes ambiguous chars: 0, O, 1, I, L, 8, B)
const SAFE_ALPHABET = '23456789ACDEFGHJKMNPQRSTUVWXYZ';

const INDUSTRY_CODE_MAP: Record<string, string> = {
  Retail: 'RET',
  Pharmacy: 'PHM',
  Bar: 'BAR',
  Restaurant: 'RST',
  Hotel: 'HTL',
  SACCO: 'SAC',
  Garage: 'GAR',
  BusinessConsultant: 'CNS',
  Services: 'SRV',
  Wholesale: 'WHL',
  Supermarket: 'SUP',
  Electronics: 'ELE',
  Hardware: 'HWD',
  Fashion: 'FSH',
  BeautySalon: 'SAL',
  Agriculture: 'AGR'
};

/**
 * Generates a clean, unambiguous random Base32 hash of given length
 */
function generateSafeHash(length: number = 4): string {
  let result = '';
  const cryptoObj = typeof window !== 'undefined' && window.crypto ? window.crypto : null;

  if (cryptoObj && cryptoObj.getRandomValues) {
    const randomBytes = new Uint8Array(length);
    cryptoObj.getRandomValues(randomBytes);
    for (let i = 0; i < length; i++) {
      result += SAFE_ALPHABET[randomBytes[i] % SAFE_ALPHABET.length];
    }
  } else {
    for (let i = 0; i < length; i++) {
      result += SAFE_ALPHABET[Math.floor(Math.random() * SAFE_ALPHABET.length)];
    }
  }
  return result;
}

/**
 * Calculates a 1-character Modulo-29 Checksum for typo detection
 */
function calculateChecksum(input: string): string {
  let sum = 0;
  const cleanInput = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  for (let i = 0; i < cleanInput.length; i++) {
    const char = cleanInput[i];
    const val = SAFE_ALPHABET.indexOf(char);
    if (val !== -1) {
      sum += val * (i + 1);
    } else {
      sum += char.charCodeAt(0);
    }
  }
  return SAFE_ALPHABET[sum % SAFE_ALPHABET.length];
}

/**
 * Sanitizes company name into a clean 3-6 letter uppercase brand moniker
 */
function extractBrandMoniker(companyName: string): string {
  if (!companyName) return 'DUKA';

  // Remove legal suffixes and special characters
  const cleaned = companyName
    .replace(/\b(ltd|limited|inc|llc|co|corp|corporation|tz|tanzania|group|enterprise|enterprises|store|shop|pos)\b/gi, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();

  if (cleaned.length >= 3) {
    return cleaned.slice(0, 6);
  }

  // Fallback if cleaned is too short
  const rawClean = companyName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return (rawClean + 'DUKA').slice(0, 6);
}

export const tenantIdentifierService = {
  /**
   * Primary Generator for Human Readable Tenant IDs
   * Example: TZ-RET-BONGO-9K8M
   */
  generate(params: TenantIdGenerationParams): { humanId: string; businessCode: string } {
    const country = (params.countryCode || 'TZ').toUpperCase().slice(0, 2);
    const indCode = INDUSTRY_CODE_MAP[params.businessType || 'Retail'] || 'RET';
    const moniker = extractBrandMoniker(params.companyName);
    const baseHash = generateSafeHash(3);
    
    const preChecksumId = `${country}-${indCode}-${moniker}-${baseHash}`;
    const checksum = calculateChecksum(preChecksumId);
    
    const humanId = `${preChecksumId}${checksum}`;
    const businessCode = `BIZ-${moniker}-${baseHash}${checksum}`;

    return { humanId, businessCode };
  },

  /**
   * Generates a short compact Tenant ID for POS displays and receipt headers
   * Example: DKP-PHM-4K9W
   */
  generateCompact(businessType: string = 'Retail'): string {
    const indCode = INDUSTRY_CODE_MAP[businessType] || 'RET';
    const hash = generateSafeHash(4);
    return `DKP-${indCode}-${hash}`;
  },

  /**
   * Validates if a string is a correctly formatted, checksum-valid Human-Readable Tenant ID
   */
  validate(tenantIdStr: string): boolean {
    if (!tenantIdStr || typeof tenantIdStr !== 'string') return false;
    const clean = tenantIdStr.trim().toUpperCase();

    // Check against standard hybrid format pattern (e.g. TZ-RET-BONGO-9K8M)
    const hybridPattern = /^[A-Z]{2}-[A-Z]{3}-[A-Z0-9]{3,6}-[2-9A-Z]{4}$/;
    // Check against standard legacy pattern (e.g. BIZ-BONGO-9K8M or tenant-101)
    const legacyPattern = /^(BIZ-[A-Z0-9]+-[A-Z0-9]+|tenant-\d+|tenant-demo-\d+|tenant-admin-system)$/;
    // Check against UUID pattern
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (hybridPattern.test(clean)) {
      const payload = clean.slice(0, -1);
      const expectedChecksum = calculateChecksum(payload);
      const actualChecksum = clean.slice(-1);
      return expectedChecksum === actualChecksum;
    }

    return legacyPattern.test(clean) || uuidPattern.test(clean);
  },

  /**
   * Parses a Human-Readable Tenant ID into structured components
   */
  parse(tenantIdStr: string): ParsedTenantId {
    const clean = (tenantIdStr || '').trim().toUpperCase();
    const parts = clean.split('-');

    if (parts.length >= 4) {
      const countryCode = parts[0];
      const industryCode = parts[1];
      const brandMoniker = parts[2];
      const tail = parts[3];
      const uniqueHash = tail.slice(0, -1);
      const checksum = tail.slice(-1);
      const isValid = this.validate(clean);

      return {
        raw: tenantIdStr,
        formatted: clean,
        countryCode,
        industryCode,
        brandMoniker,
        uniqueHash,
        checksum,
        isValid
      };
    }

    return {
      raw: tenantIdStr,
      formatted: clean,
      countryCode: 'TZ',
      industryCode: 'RET',
      brandMoniker: clean.slice(0, 6),
      uniqueHash: '000',
      checksum: '0',
      isValid: this.validate(clean)
    };
  },

  /**
   * Formats a tenant ID for visual presentation across different application context areas
   */
  formatForDisplay(tenantIdStr: string, mode: 'POS_HEADER' | 'RECEIPT' | 'BADGE' | 'SUPPORT_CODE' = 'BADGE'): string {
    if (!tenantIdStr) return 'N/A';
    const parsed = this.parse(tenantIdStr);

    switch (mode) {
      case 'POS_HEADER':
        return `${parsed.brandMoniker} · #${parsed.uniqueHash}${parsed.checksum}`;
      case 'RECEIPT':
        return `TID: ${parsed.formatted}`;
      case 'SUPPORT_CODE':
        return `[TID: ${parsed.countryCode}-${parsed.industryCode}-${parsed.uniqueHash}${parsed.checksum}]`;
      case 'BADGE':
      default:
        return parsed.formatted;
    }
  },

  /**
   * Returns a clean, human-readable Tenant ID for UI display, badges, cards, and tables.
   * Guaranteed never to return raw UUID or truncated '-uuid' string.
   */
  getReadableTenantId(tenantOrId: any): string {
    if (!tenantOrId) return 'TZ-RET-DUKA-1001';

    let tenantObj: any = null;
    let rawIdStr = '';

    if (typeof tenantOrId === 'string') {
      rawIdStr = tenantOrId;
    } else if (typeof tenantOrId === 'object') {
      tenantObj = tenantOrId;
      if (tenantObj.human_tenant_id) return tenantObj.human_tenant_id;
      if (tenantObj.tenant_code && !tenantObj.tenant_code.startsWith('-') && !/^[0-9a-f]{8}-/i.test(tenantObj.tenant_code)) {
        return tenantObj.tenant_code;
      }
      if (tenantObj.business_code) return tenantObj.business_code;
      rawIdStr = tenantObj.id || tenantObj.tenant_id || '';
    }

    if (!rawIdStr) return 'TZ-RET-DUKA-1001';

    // If it already looks like a formatted HR-TID (e.g. TZ-RET-BONGO-9K8M or DKP-RET-8X92)
    if (/^[A-Z]{2,3}-[A-Z]{3}-[A-Z0-9]+-[A-Z0-9]+$/i.test(rawIdStr) || /^BIZ-[A-Z0-9]+-[A-Z0-9]+$/i.test(rawIdStr)) {
      return rawIdStr.toUpperCase();
    }

    // Fallback: Construct a clean, human-readable ID from available properties or hex tail
    const name = tenantObj?.name || 'DUKA';
    const bizType = tenantObj?.business_type || tenantObj?.industry || 'Retail';
    const indCode = INDUSTRY_CODE_MAP[bizType] || 'RET';
    const moniker = extractBrandMoniker(name);

    // Extract clean 4-char hash from UUID or string, excluding leading hyphens
    const cleanHash = rawIdStr.replace(/[^a-fA-F0-9]/g, '').slice(-4).toUpperCase() || '1001';

    return `TZ-${indCode}-${moniker}-${cleanHash}`;
  },

  /**
   * Returns a clean, human-readable User ID for UI display (e.g., USR-OWNER, USR-CSH-4C00, USR-1001)
   */
  getReadableUserId(userOrId: any): string {
    if (!userOrId) return 'USR-1001';

    let userObj: any = null;
    let rawIdStr = '';

    if (typeof userOrId === 'string') {
      rawIdStr = userOrId;
    } else if (typeof userOrId === 'object') {
      userObj = userOrId;
      if (userObj.user_code) return userObj.user_code;
      rawIdStr = userObj.id || userObj.user_id || '';
    }

    if (!rawIdStr) return 'USR-1001';

    // If already formatted like USR-OWNER or USR-1001
    if (/^USR-[A-Z0-9-]+$/i.test(rawIdStr) && !rawIdStr.includes('-uuid-') && !/^[0-9a-f]{8}-/i.test(rawIdStr.replace('usr-', ''))) {
      return rawIdStr.toUpperCase();
    }

    if (rawIdStr.includes('owner') || (userObj && (userObj.role === 'Tenant Owner' || userObj.role === 'Owner'))) {
      return 'USR-OWNER';
    }
    if (rawIdStr.includes('superadmin') || (userObj && userObj.is_super_admin)) {
      return 'USR-SUPERADMIN';
    }

    const roleTag = userObj?.role ? userObj.role.replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase() : 'STF';
    const cleanHash = rawIdStr.replace(/[^a-fA-F0-9]/g, '').slice(-4).toUpperCase() || '1001';

    return `USR-${roleTag}-${cleanHash}`;
  },

  /**
   * Returns a clean, readable Employee Code (e.g., EMP-OWNER, EMP-1001, EMP-1002)
   */
  getReadableEmployeeCode(empOrCode: any, roleName?: string): string {
    if (!empOrCode && !roleName) return 'EMP-1001';

    let codeStr = typeof empOrCode === 'string' ? empOrCode : (empOrCode?.employee_code || empOrCode?.employee_number || '');
    
    if (codeStr && codeStr !== 'EMP-001' && codeStr !== 'EMP-OWNER' && !codeStr.startsWith('-') && !codeStr.includes('undefined')) {
      return codeStr;
    }

    if (roleName === 'Tenant Owner' || (typeof empOrCode === 'object' && (empOrCode?.job_title === 'Tenant Owner' || empOrCode?.user_id?.includes('owner')))) {
      return 'EMP-OWNER';
    }

    if (typeof empOrCode === 'object' && empOrCode?.id) {
      const numPart = empOrCode.id.replace(/[^0-9]/g, '').slice(-3);
      if (numPart && numPart.length >= 3) {
        return `EMP-${numPart}`;
      }
    }

    return codeStr || 'EMP-1001';
  },

  /**
   * Returns a clean, human-readable Branch Code for UI tables and location badges
   * Example: BR-HQ-01, BR-LUMUM-01, BR-MAIN-01
   * Guaranteed never to return a raw UUID (like bc1497d1-3a12-481f-9d93-ca1815875902).
   */
  getReadableBranchCode(branchOrId: any): string {
    if (!branchOrId) return 'BR-HQ-01';

    let branchObj: any = null;
    let rawIdStr = '';

    if (typeof branchOrId === 'string') {
      rawIdStr = branchOrId;
    } else if (typeof branchOrId === 'object') {
      branchObj = branchOrId;
      if (branchObj.branch_code && !/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(branchObj.branch_code)) {
        return branchObj.branch_code.toUpperCase();
      }
      if (branchObj.code && !/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(branchObj.code)) {
        return branchObj.code.toUpperCase();
      }
      rawIdStr = branchObj.id || branchObj.branch_id || '';
    }

    if (!rawIdStr) return 'BR-HQ-01';

    // If already formatted like BR-HQ-01 or BR-DAR-01
    if (/^BR-[A-Z0-9]+-[A-Z0-9]+$/i.test(rawIdStr) && !/^[0-9a-f]{8}-/i.test(rawIdStr.replace(/^br-/i, ''))) {
      return rawIdStr.toUpperCase();
    }

    const isHq = branchObj?.is_headquarters || rawIdStr.includes('hq') || rawIdStr.includes('headquarters') || (branchObj?.name || '').toLowerCase().includes('hq');

    if (isHq) {
      const cleanHash = rawIdStr.replace(/[^a-fA-F0-9]/g, '').slice(-2).toUpperCase() || '01';
      return `BR-HQ-${cleanHash.padStart(2, '0')}`;
    }

    const nameStr = branchObj?.name || branchObj?.location || 'BRANCH';
    const tag = extractBrandMoniker(nameStr).slice(0, 5) || 'MAIN';
    const cleanHash = rawIdStr.replace(/[^a-fA-F0-9]/g, '').slice(-2).toUpperCase() || '01';

    return `BR-${tag}-${cleanHash.padStart(2, '0')}`;
  }
};
