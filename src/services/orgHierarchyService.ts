/**
 * KwakoPos SaaS — Organizational Hierarchy & Scoping Engine
 * 
 * Implements 4-tier organizational scoping:
 * Global HQ -> Region -> Branch -> POS Terminal
 * 
 * Supports:
 * - Aggregated rollup analytics for Global HQ & Regional managers
 * - Strict downward isolation (Terminals & Branches cannot query lateral/higher entities)
 * - Row-Level Security (RLS) query token generation
 */

export type OrgHierarchyLevel = 'GLOBAL_HQ' | 'REGION' | 'BRANCH' | 'POS_TERMINAL';

export interface OrgNode {
  id: string;
  tenantId: string;
  level: OrgHierarchyLevel;
  name: string;
  code: string;
  parentId?: string;
  regionCode?: string;
  metadata?: Record<string, any>;
}

export interface HierarchyScopeContext {
  tenantId: string;
  branchId: string;
  terminalId?: string;
  regionCode?: string;
  level: OrgHierarchyLevel;
  accessibleBranchIds: string[];
  isGlobalHq: boolean;
}

export class OrgHierarchyService {
  private static instance: OrgHierarchyService;

  private constructor() {}

  public static getInstance(): OrgHierarchyService {
    if (!OrgHierarchyService.instance) {
      OrgHierarchyService.instance = new OrgHierarchyService();
    }
    return OrgHierarchyService.instance;
  }

  /**
   * Resolves hierarchical scope based on user role, assigned branch, and headquarters flag
   */
  public resolveScope(params: {
    tenantId: string;
    branchId: string;
    terminalId?: string;
    role: string;
    allBranches: Array<{ id: string; is_headquarters?: boolean; region?: string }>;
  }): HierarchyScopeContext {
    const { tenantId, branchId, terminalId, role, allBranches } = params;
    const isOwnerOrSuperAdmin = role === 'Super Admin' || role === 'Tenant Owner' || role === 'General Manager';
    const currentBranch = allBranches.find(b => b.id === branchId);
    const isHqBranch = currentBranch?.is_headquarters || false;

    // Global HQ Scope
    if (isOwnerOrSuperAdmin || (isHqBranch && (role === 'Admin' || role === 'Manager'))) {
      return {
        tenantId,
        branchId,
        terminalId,
        regionCode: currentBranch?.region || 'GLOBAL',
        level: 'GLOBAL_HQ',
        accessibleBranchIds: allBranches.map(b => b.id),
        isGlobalHq: true
      };
    }

    // Regional Manager Scope
    if (role === 'Regional Manager' && currentBranch?.region) {
      const regionalBranches = allBranches.filter(b => b.region === currentBranch.region).map(b => b.id);
      return {
        tenantId,
        branchId,
        terminalId,
        regionCode: currentBranch.region,
        level: 'REGION',
        accessibleBranchIds: regionalBranches.length > 0 ? regionalBranches : [branchId],
        isGlobalHq: false
      };
    }

    // Branch Scope
    if (role === 'Branch Manager' || role === 'Supervisor' || !terminalId) {
      return {
        tenantId,
        branchId,
        terminalId,
        regionCode: currentBranch?.region,
        level: 'BRANCH',
        accessibleBranchIds: [branchId],
        isGlobalHq: false
      };
    }

    // POS Terminal Scope (Cashier / POS Kiosk)
    return {
      tenantId,
      branchId,
      terminalId,
      regionCode: currentBranch?.region,
      level: 'POS_TERMINAL',
      accessibleBranchIds: [branchId],
      isGlobalHq: false
    };
  }

  /**
   * Generates RLS filter clause parameters for database queries
   */
  public getRlsFilter(scope: HierarchyScopeContext): { tenantId: string; branchFilter: string[] | null } {
    return {
      tenantId: scope.tenantId,
      branchFilter: scope.isGlobalHq ? null : scope.accessibleBranchIds
    };
  }

  /**
   * Validates whether a target entity in a given branch can be read/written by current scope
   */
  public canAccessBranch(scope: HierarchyScopeContext, targetBranchId: string): boolean {
    if (scope.isGlobalHq) return true;
    return scope.accessibleBranchIds.includes(targetBranchId);
  }
}

export const orgHierarchyService = OrgHierarchyService.getInstance();
