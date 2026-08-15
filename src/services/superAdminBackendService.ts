export interface TableColumnMetadata {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
}

export interface TableSummary {
  name: string;
  estimatedRows: number;
  deadRows: number;
  totalBytes: number;
  tableBytes: number;
  indexBytes: number;
  totalSize: string;
  columnCount: number;
  columns: TableColumnMetadata[];
}

export interface QueryExecutionResult {
  success: boolean;
  command?: string;
  rowCount?: number;
  fields?: { name: string; dataTypeID: number }[];
  rows?: any[];
  durationMs?: number;
  error?: string;
  position?: string;
  detail?: string;
  hint?: string;
}

export interface SystemMetrics {
  success: boolean;
  timestamp: number;
  process: {
    uptimeSeconds: number;
    pid: number;
    nodeVersion: string;
    platform: string;
    arch: string;
    memory: {
      rssBytes: number;
      heapTotalBytes: number;
      heapUsedBytes: number;
      externalBytes: number;
      rssFormatted: string;
      heapUsedFormatted: string;
      heapTotalFormatted: string;
      heapUsagePercent: number;
    };
    cpu: {
      userMicros: number;
      systemMicros: number;
    };
  };
  database: {
    name: string;
    sizeFormatted: string;
    sizeBytes: number;
    activeBackends: number;
    pool: {
      totalCount: number;
      idleCount: number;
      waitingCount: number;
    };
    cacheHitRate: string;
    commits: number;
    rollbacks: number;
  };
  counts: {
    tenants: number;
    users: number;
    products: number;
    orders: number;
  };
}

export interface SystemLogEntry {
  id: string;
  timestamp: number;
  level: 'INFO' | 'WARN' | 'ERROR' | 'SECURITY' | 'SYNC' | 'SQL' | 'MAINTENANCE';
  message: string;
  metadata?: Record<string, any>;
}

export interface MaintenanceReport {
  action: string;
  table?: string;
  scope?: string;
  status: string;
  durationMs?: number;
  orphanProducts?: number;
  orphanVariants?: number;
  orphanCategories?: number;
  orphanBrands?: number;
  healthy?: boolean;
}

export const SuperAdminBackendService = {
  /**
   * Execute an SQL query directly against PostgreSQL backend
   */
  async executeQuery(query: string, params: any[] = [], readOnly: boolean = true): Promise<QueryExecutionResult> {
    try {
      const response = await fetch('/api/admin/db/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, params, readOnly })
      });
      return await response.json();
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Network error communicating with backend SQL executor'
      };
    }
  },

  /**
   * List all database tables with row counts, disk sizes, and column metadata
   */
  async getTables(): Promise<{ success: boolean; tables?: TableSummary[]; error?: string }> {
    try {
      const response = await fetch('/api/admin/db/tables');
      return await response.json();
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to fetch database tables' };
    }
  },

  /**
   * Fetch paginated table records
   */
  async getTableData(
    table: string,
    limit: number = 50,
    offset: number = 0,
    sortCol?: string,
    sortOrder: 'asc' | 'desc' = 'asc',
    search?: string
  ): Promise<{
    success: boolean;
    table?: string;
    totalCount?: number;
    limit?: number;
    offset?: number;
    rows?: any[];
    fields?: string[];
    error?: string;
  }> {
    try {
      const params = new URLSearchParams({
        table,
        limit: String(limit),
        offset: String(offset),
        ...(sortCol ? { sort: sortCol, order: sortOrder } : {}),
        ...(search ? { search } : {})
      });
      const response = await fetch(`/api/admin/db/table-data?${params.toString()}`);
      return await response.json();
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to load table records' };
    }
  },

  /**
   * Fetch live platform & Node vitals
   */
  async getSystemMetrics(): Promise<SystemMetrics | null> {
    try {
      const response = await fetch('/api/admin/system/metrics');
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  },

  /**
   * Fetch live system and security audit logs
   */
  async getSystemLogs(level: string = 'ALL', limit: number = 100): Promise<{ success: boolean; logs?: SystemLogEntry[]; error?: string }> {
    try {
      const params = new URLSearchParams({ level, limit: String(limit) });
      const response = await fetch(`/api/admin/system/logs?${params.toString()}`);
      return await response.json();
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to load system logs' };
    }
  },

  /**
   * Run maintenance operations (VACUUM, ANALYZE, REINDEX, AUDIT_INTEGRITY)
   */
  async runMaintenance(action: 'VACUUM' | 'ANALYZE' | 'REINDEX' | 'AUDIT_INTEGRITY', table?: string): Promise<{ success: boolean; report?: MaintenanceReport; error?: string }> {
    try {
      const response = await fetch('/api/admin/system/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, table })
      });
      return await response.json();
    } catch (err: any) {
      return { success: false, error: err.message || 'Maintenance execution failed' };
    }
  }
};
