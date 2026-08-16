import React, { useState, useEffect, useMemo } from 'react';
import {
  Database, Terminal, Server, ShieldAlert, Cpu, Activity,
  RefreshCw, Play, Download, Trash2, CheckCircle2,
  AlertTriangle, Clock, Layers, Search,
  HardDrive, Zap, ArrowUpDown, Copy, FileCode, ArrowUp, ArrowDown,
  Smartphone, Sparkles
} from 'lucide-react';
import {
  SuperAdminBackendService,
  type TableSummary,
  type QueryExecutionResult,
  type SystemMetrics,
  type SystemLogEntry,
  type MaintenanceReport
} from '../../../services/superAdminBackendService';
import {
  getStorageDiagnostics,
  syncStatePostUpdate,
  type StorageDiagnostics,
  CURRENT_PWA_BUILD_VER
} from '../../../services/pwaRehydrationService';
import { PWADiagnostic } from '../../PWA/PWADiagnostic';
import { useToast } from '../../UI/Toast';

type BackendSubTab = 'sql-studio' | 'db-explorer' | 'telemetry' | 'logs-audit' | 'maintenance' | 'pwa-diagnostics';

const PRESET_QUERIES = [
  {
    name: '📊 Active Tenants Summary',
    query: `SELECT id, name, plan, status, business_code, created_at FROM tenants WHERE deleted_at IS NULL ORDER BY name ASC;`
  },
  {
    name: '💾 Database Table Sizes & Rows',
    query: `SELECT 
  relname as table_name, 
  n_live_tup as row_count, 
  pg_size_pretty(pg_total_relation_size(relid)) as total_size,
  pg_size_pretty(pg_relation_size(relid)) as data_size,
  pg_size_pretty(pg_indexes_size(relid)) as index_size
FROM pg_stat_user_tables 
ORDER BY pg_total_relation_size(relid) DESC;`
  },
  {
    name: '🏷️ Taxonomy: Products by Category',
    query: `SELECT 
  COALESCE(c.name, p.category, 'Unassigned') as category_name,
  count(p.id) as product_count,
  sum(p.stock) as total_stock
FROM products p
LEFT JOIN categories c ON p.category_id = c.id
WHERE (p.deleted IS NULL OR p.deleted = false)
GROUP BY 1
ORDER BY product_count DESC;`
  },
  {
    name: '🔗 Foreign Key Constraints Inspection',
    query: `SELECT
  tc.table_name, 
  kcu.column_name, 
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name,
  rc.delete_rule
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints AS rc
  ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
ORDER BY tc.table_name;`
  },
  {
    name: '⚡ Sync Queue Health & Dead-Letter Items',
    query: `SELECT 
  tenant_id, 
  count(*) as total_records, 
  max(created_at) as latest_record_time 
FROM stock_ledger 
GROUP BY tenant_id;`
  },
  {
    name: '🔒 Active Client Connections & Locks',
    query: `SELECT 
  pid, usename, datname, client_addr, state, query_start,
  substring(query from 1 for 80) as current_query
FROM pg_stat_activity 
WHERE datname = current_database() AND pid <> pg_backend_pid();`
  }
];

export const SABackendControl: React.FC = () => {
  const toast = useToast();
  const [activeSubTab, setActiveSubTab] = useState<BackendSubTab>('sql-studio');
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(false);

  // ── SQL Studio State ──
  const [sqlQuery, setSqlQuery] = useState<string>(PRESET_QUERIES[0].query);
  const [allowMutation, setAllowMutation] = useState<boolean>(false);
  const [isExecutingSql, setIsExecutingSql] = useState<boolean>(false);
  const [queryResult, setQueryResult] = useState<QueryExecutionResult | null>(null);
  const [queryHistory, setQueryHistory] = useState<{ query: string; time: number; duration: number; rows: number }[]>([]);
  const [tableSearchFilter, setTableSearchFilter] = useState('');

  // ── DB Explorer State ──
  const [tables, setTables] = useState<TableSummary[]>([]);
  const [loadingTables, setLoadingTables] = useState<boolean>(false);
  const [selectedTable, setSelectedTable] = useState<string>('products');
  const [tableTab, setTableTab] = useState<'data' | 'schema'>('data');
  const [tableData, setTableData] = useState<any[]>([]);
  const [tableFields, setTableFields] = useState<string[]>([]);
  const [tableTotalRows, setTableTotalRows] = useState<number>(0);
  const [tablePage, setTablePage] = useState<number>(0);
  const [tableRecordSearch, setTableRecordSearch] = useState<string>('');
  const [tableSortCol, setTableSortCol] = useState<string>('');
  const [tableSortOrder, setTableSortOrder] = useState<'asc' | 'desc'>('asc');
  const [loadingTableData, setLoadingTableData] = useState<boolean>(false);
  const [tenantsDict, setTenantsDict] = useState<Record<string, { name: string; code: string }>>({});
  const [branchesDict, setBranchesDict] = useState<Record<string, { name: string; code: string }>>({});

  // ── Logs State ──
  const [logs, setLogs] = useState<SystemLogEntry[]>([]);
  const [logLevel, setLogLevel] = useState<string>('ALL');
  const [logSearch, setLogSearch] = useState<string>('');
  const [loadingLogs, setLoadingLogs] = useState<boolean>(false);
  const [autoRefreshLogs, setAutoRefreshLogs] = useState<boolean>(true);

  // ── Maintenance State ──
  const [maintenanceRunning, setMaintenanceRunning] = useState<string | null>(null);
  const [maintenanceReports, setMaintenanceReports] = useState<MaintenanceReport[]>([]);

  // ── PWA & Storage Diagnostics State ──
  const [storageDiagnostics, setStorageDiagnostics] = useState<StorageDiagnostics | null>(null);
  const [loadingDiagnostics, setLoadingDiagnostics] = useState<boolean>(false);
  const [isSimulatingUpdate, setIsSimulatingUpdate] = useState<boolean>(false);

  // ── Initial load & periodic telemetry refresh ──
  const fetchStorageDiagnostics = async () => {
    setLoadingDiagnostics(true);
    const diag = await getStorageDiagnostics();
    setStorageDiagnostics(diag);
    setLoadingDiagnostics(false);
  };

  const fetchMetrics = async () => {
    setLoadingMetrics(true);
    const data = await SuperAdminBackendService.getSystemMetrics();
    if (data) setMetrics(data);
    setLoadingMetrics(false);
  };

  const fetchTables = async () => {
    setLoadingTables(true);
    const res = await SuperAdminBackendService.getTables();
    if (res.success && res.tables) {
      setTables(res.tables);
      if (!selectedTable && res.tables.length > 0) {
        setSelectedTable(res.tables[0].name);
      }
    }

    // Load tenants dictionary for human-readable ID resolution
    try {
      const [tRes, tApiRes] = await Promise.all([
        SuperAdminBackendService.getTableData('tenants', 500, 0),
        fetch('/api/tenants', { headers: { 'x-tenant-id': 'tenant-admin-system' } }).then(r => r.ok ? r.json() : []).catch(() => [])
      ]);
      const dict: Record<string, { name: string; code: string }> = {
        'tenant-admin-system': { name: 'System Platform', code: 'SYS-ADMIN-0000' },
        'tenant-system-platform': { name: 'System Platform', code: 'SYS-ADMIN-0000' }
      };
      if (tRes?.success && Array.isArray(tRes.rows)) {
        tRes.rows.forEach((t: any) => {
          dict[t.id] = { name: t.name || t.company_name || 'Tenant', code: t.business_code || t.tenant_code || `BIZ-${String(t.id).slice(0, 6).toUpperCase()}` };
        });
      }
      if (Array.isArray(tApiRes)) {
        tApiRes.forEach((t: any) => {
          if (!dict[t.id] || dict[t.id].name === 'Tenant') {
            dict[t.id] = { name: t.name || t.company_name || 'Tenant', code: t.business_code || t.tenant_code || `BIZ-${String(t.id).slice(0, 6).toUpperCase()}` };
          }
        });
      }
      setTenantsDict(dict);
    } catch (_) {}

    // Load branches dictionary for human-readable branch resolution
    try {
      const bRes = await SuperAdminBackendService.getTableData('branches', 500, 0);
      if (bRes.success && bRes.rows) {
        const bdict: Record<string, { name: string; code: string }> = {
          'branch-admin-main': { name: 'Main HQ Branch', code: 'HQ-01' },
          'branch-main': { name: 'Main HQ Branch', code: 'HQ-01' }
        };
        bRes.rows.forEach((b: any) => {
          bdict[b.id] = { name: b.name || 'Branch', code: b.branch_code || `BR-${String(b.id).slice(0, 6).toUpperCase()}` };
        });
        setBranchesDict(bdict);
      }
    } catch (_) {}

    setLoadingTables(false);
  };

  const renderTableCellValue = (field: string, val: any, row: any) => {
    if (val === null || val === undefined) {
      return <span className="text-slate-600 italic">NULL</span>;
    }

    // 1. Resolve tenant_id
    if (field === 'tenant_id') {
      const strVal = String(val);
      if (strVal === 'tenant-admin-system' || strVal === 'tenant-system-platform') {
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 font-sans font-bold text-[11px]">
            <span>🛡️</span> System Platform (SYS-ADMIN-0000)
          </span>
        );
      }
      const tenantInfo = tenantsDict[strVal];
      if (tenantInfo) {
        return (
          <span
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 font-sans font-bold text-[11px]"
            title={`Tenant UUID: ${strVal}`}
          >
            <span>🏢</span>
            <span>{tenantInfo.name}</span>
            <span className="text-[10px] font-mono text-indigo-400/80">({tenantInfo.code})</span>
          </span>
        );
      }
      // Guaranteed human-readable fallback for un-indexed tenant UUIDs
      const shortCode = strVal.length >= 8 ? `BIZ-${strVal.slice(0, 6).toUpperCase()}` : strVal;
      const displayName = row.tenant_name || row.company_name || row.business_name || `Tenant • ${strVal.slice(0, 8).toUpperCase()}`;
      return (
        <span
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 font-sans font-bold text-[11px]"
          title={`Tenant UUID: ${strVal}`}
        >
          <span>🏢</span>
          <span>{displayName}</span>
          <span className="text-[10px] font-mono text-indigo-400/80">({shortCode})</span>
        </span>
      );
    }

    // 2. Resolve branch_id
    if (field === 'branch_id') {
      const strVal = String(val);
      if (strVal === 'branch-admin-main' || strVal === 'branch-main') {
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 font-sans font-bold text-[11px]">
            <span>📍</span> Main HQ Branch
          </span>
        );
      }
      const branchInfo = branchesDict[strVal];
      if (branchInfo) {
        return (
          <span
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 font-sans font-bold text-[11px]"
            title={`Branch UUID: ${strVal}`}
          >
            <span>📍</span>
            <span>{branchInfo.name}</span>
          </span>
        );
      }
      const branchLabel = row.branch_name || `Branch • ${strVal.slice(0, 6).toUpperCase()}`;
      return (
        <span
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 font-sans font-bold text-[11px]"
          title={`Branch UUID: ${strVal}`}
        >
          <span>📍</span>
          <span>{branchLabel}</span>
        </span>
      );
    }

    // 3. Resolve user id with Business Name
    if (field === 'id' && typeof val === 'string') {
      if (val === 'usr-superadmin') {
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 font-mono font-bold text-[11px]">
            🛡️ USR-SUPERADMIN
          </span>
        );
      }
      if (val.startsWith('usr-')) {
        // Resolve associated business name from row.tenant_id, tenantsDict, or row data
        const rowTenantId = row?.tenant_id;
        const tenantInfo = rowTenantId ? tenantsDict[rowTenantId] : null;
        const businessName = tenantInfo?.name || row?.business_name || row?.company_name || row?.tenant_name;
        
        const isOwner = val.endsWith('-owner') || row?.role === 'Tenant Owner';
        const roleLabel = isOwner ? 'Owner' : (row?.role || 'Staff');
        
        if (businessName && businessName !== 'Tenant') {
          return (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-500/20 text-indigo-300 font-mono font-bold text-[11px]"
              title={`Full User ID: ${val} (Tenant: ${rowTenantId || 'N/A'})`}
            >
              USR • {businessName} ({roleLabel})
            </span>
          );
        }

        const parts = val.split('-');
        const shortHex = parts[1]?.slice(0, 8).toUpperCase();
        return (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-500/20 text-indigo-300 font-mono font-bold text-[11px]"
            title={`Full User ID: ${val}`}
          >
            USR • {shortHex || 'USER'} ({roleLabel})
          </span>
        );
      }
    }

    // 4. Role Badges
    if (field === 'role') {
      const isSuper = String(val).toLowerCase().includes('super') || row?.is_super_admin;
      return (
        <span className={`px-2 py-0.5 rounded-lg font-sans font-bold text-[10px] uppercase tracking-wider ${
          isSuper 
            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
            : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
        }`}>
          {String(val)}
        </span>
      );
    }

    // 5. Status & Verification Badges
    if (field === 'status' || field === 'verification_status') {
      const isOk = String(val).toUpperCase() === 'ACTIVE' || String(val).toUpperCase() === 'VERIFIED';
      return (
        <span className={`px-2 py-0.5 rounded-lg font-sans font-bold text-[10px] uppercase tracking-wider ${
          isOk 
            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
            : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
        }`}>
          {String(val)}
        </span>
      );
    }

    // 6. Boolean Flags
    if (field === 'is_super_admin' || typeof val === 'boolean') {
      return val ? (
        <span className="px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold text-[10px]">
          TRUE
        </span>
      ) : (
        <span className="px-2 py-0.5 rounded-lg bg-slate-800 text-slate-400 font-bold text-[10px]">
          FALSE
        </span>
      );
    }

    // 7. Date & Timestamp formatting in DD/MM/YYYY HH:mm
    const isDateField = 
      field.endsWith('_at') || 
      field.endsWith('_date') || 
      field.includes('timestamp') || 
      field === 'date' || 
      field === 'trial_ends_at' || 
      field === 'created_at' || 
      field === 'updated_at' || 
      field === 'deleted_at' ||
      field === 'joined_at' ||
      field === 'assigned_at' ||
      field === 'installed_at' ||
      field === 'enabled_at';

    if (isDateField && val !== null && val !== undefined) {
      let ms: number | null = null;
      if (typeof val === 'number') {
        ms = val > 10000000000 ? val : val * 1000;
      } else if (typeof val === 'string' && /^\d+$/.test(val)) {
        const num = Number(val);
        ms = num > 10000000000 ? num : num * 1000;
      } else if (typeof val === 'string' && (val.includes('T') || val.includes('-') || val.includes('/'))) {
        const parsed = Date.parse(val);
        if (!isNaN(parsed)) ms = parsed;
      }

      if (ms && !isNaN(ms) && ms > 0) {
        const d = new Date(ms);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        const hours = String(d.getHours()).padStart(2, '0');
        const mins = String(d.getMinutes()).padStart(2, '0');
        const formattedDate = `${day}/${month}/${year}`;
        const formattedTime = `${hours}:${mins}`;

        return (
          <span
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-slate-300 font-mono text-[11px]"
            title={`Timestamp: ${val} (ISO: ${d.toISOString()})`}
          >
            <span className="text-slate-400">📅</span>
            <span className="font-bold text-slate-200">{formattedDate}</span>
            <span className="text-[10px] text-slate-400 font-normal">{formattedTime}</span>
          </span>
        );
      }
    }

    if (typeof val === 'object') {
      return JSON.stringify(val);
    }

    return String(val);
  };

  const fetchTableRecords = async (
    tableName: string,
    page: number = 0,
    sortCol: string = tableSortCol,
    sortOrder: 'asc' | 'desc' = tableSortOrder,
    search: string = tableRecordSearch
  ) => {
    if (!tableName) return;
    setLoadingTableData(true);
    const limit = 30;
    const offset = page * limit;
    const res = await SuperAdminBackendService.getTableData(tableName, limit, offset, sortCol || undefined, sortOrder, search || undefined);
    if (res.success) {
      setTableData(res.rows || []);
      setTableFields(res.fields || []);
      setTableTotalRows(res.totalCount || 0);
      setTablePage(page);

      // Lazy hydrate tenants dictionary for any newly discovered tenant_ids
      const missingTenantIds = (res.rows || [])
        .map((r: any) => r.tenant_id)
        .filter((tid: any) => tid && tid !== 'tenant-admin-system' && !tenantsDict[tid]);

      if (missingTenantIds.length > 0) {
        SuperAdminBackendService.getTableData('tenants', 500, 0).then(tRes => {
          if (tRes?.success && Array.isArray(tRes.rows)) {
            const updated = { ...tenantsDict };
            tRes.rows.forEach((t: any) => {
              updated[t.id] = { name: t.name || t.company_name || 'Tenant', code: t.business_code || t.tenant_code || `BIZ-${String(t.id).slice(0, 6).toUpperCase()}` };
            });
            setTenantsDict(updated);
          }
        }).catch(() => {});
      }
    }
    setLoadingTableData(false);
  };

  const fetchLogs = async () => {
    setLoadingLogs(true);
    const res = await SuperAdminBackendService.getSystemLogs(logLevel, 150);
    if (res.success && res.logs) {
      setLogs(res.logs);
    }
    setLoadingLogs(false);
  };

  useEffect(() => {
    fetchMetrics();
    fetchTables();
    fetchLogs();
  }, []);

  // Poll metrics every 10s
  useEffect(() => {
    const timer = setInterval(() => {
      fetchMetrics();
      if (activeSubTab === 'logs-audit' && autoRefreshLogs) {
        fetchLogs();
      }
    }, 10000);
    return () => clearInterval(timer);
  }, [activeSubTab, autoRefreshLogs, logLevel]);

  // Load table data when selected table changes
  useEffect(() => {
    if (selectedTable) {
      setTablePage(0);
      setTableRecordSearch('');
      setTableSortCol('');
      fetchTableRecords(selectedTable, 0, '', 'asc', '');
    }
  }, [selectedTable]);

  // ── SQL Execution ──
  const handleExecuteSql = async () => {
    if (!sqlQuery.trim()) return;
    setIsExecutingSql(true);
    const res = await SuperAdminBackendService.executeQuery(sqlQuery, [], !allowMutation);
    setQueryResult(res);
    setIsExecutingSql(false);

    if (res.success) {
      toast.success('Query Executed', `${res.command || 'Query'} returned ${res.rowCount ?? (res.rows?.length || 0)} rows in ${res.durationMs}ms`);
      setQueryHistory(prev => [
        { query: sqlQuery, time: Date.now(), duration: res.durationMs || 0, rows: res.rowCount ?? (res.rows?.length || 0) },
        ...prev.slice(0, 9)
      ]);
    } else {
      toast.error('Query Failed', res.error || 'SQL execution error');
    }
  };

  // ── Export Query Result to CSV ──
  const exportQueryResultCsv = () => {
    if (!queryResult?.rows || queryResult.rows.length === 0) return;
    const headers = queryResult.fields?.map(f => f.name) || Object.keys(queryResult.rows[0]);
    const csvRows = [
      headers.join(','),
      ...queryResult.rows.map(row =>
        headers.map(h => {
          const val = row[h];
          const escaped = (val === null || val === undefined ? '' : String(val)).replace(/"/g, '""');
          return `"${escaped}"`;
        }).join(',')
      )
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `kwakopos_query_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Exported', 'Query results downloaded as CSV.');
  };

  // ── Export Query Result to JSON ──
  const exportQueryResultJson = () => {
    if (!queryResult?.rows || queryResult.rows.length === 0) return;
    const blob = new Blob([JSON.stringify(queryResult.rows, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `kwakopos_query_export_${Date.now()}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Exported', 'Query results downloaded as JSON.');
  };

  // ── Copy Query Result as JSON ──
  const copyQueryResultJson = async () => {
    if (!queryResult?.rows || queryResult.rows.length === 0) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(queryResult.rows, null, 2));
      toast.success('Copied', 'Query results copied to clipboard as JSON.');
    } catch {
      toast.error('Copy Failed', 'Clipboard access denied.');
    }
  };

  // ── Export Logs as JSON ──
  const exportLogsJson = () => {
    if (logs.length === 0) return;
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `kwakopos_logs_${Date.now()}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Logs Exported', 'System logs downloaded.');
  };

  // ── Maintenance Actions ──
  const handleRunMaintenance = async (action: 'VACUUM' | 'ANALYZE' | 'REINDEX' | 'AUDIT_INTEGRITY' | 'PURGE_ORPHANS', table?: string) => {
    setMaintenanceRunning(action);
    const res = await SuperAdminBackendService.runMaintenance(action, table);
    setMaintenanceRunning(null);

    if (res.success && res.report) {
      toast.success('Operation Finished', `${action} completed in ${res.report.durationMs}ms`);
      setMaintenanceReports(prev => [res.report!, ...prev]);
      fetchMetrics();
    } else {
      toast.error('Operation Failed', res.error || 'Maintenance task failed');
    }
  };

  // ── PWA Rehydration & Cache Operations ──
  const handleSimulateUpdate = async () => {
    setIsSimulatingUpdate(true);
    try {
      localStorage.removeItem('kwakopos_build_hash'); // Trigger update state
      const res = await syncStatePostUpdate();
      toast.success('PWA Update Reconciliation Complete', `IndexedDB Catalog verified: ${res.productsCount} products preserved.`);
      await fetchStorageDiagnostics();
    } catch (err: any) {
      toast.error('Simulation Failed', err.message);
    } finally {
      setIsSimulatingUpdate(false);
    }
  };

  const handleSafeCachePurge = async () => {
    if (typeof caches === 'undefined') {
      toast.info('Not Supported', 'CacheStorage is not supported in this browser.');
      return;
    }
    try {
      const keys = await caches.keys();
      let purgedCount = 0;
      for (const key of keys) {
        if (key !== 'kwakopos-product-payloads' && (key.startsWith('kwakopos-assets-') || key.startsWith('dukapos-cache-'))) {
          await caches.delete(key);
          purgedCount++;
        }
      }
      toast.success('Safe Cache Purge Complete', `Purged ${purgedCount} deprecated asset caches. Protected data payload cache preserved.`);
      await fetchStorageDiagnostics();
    } catch (err: any) {
      toast.error('Purge Failed', err.message);
    }
  };

  // ── Handle Table Column Header Click for Sorting ──
  const handleSortCol = (colName: string) => {
    let newOrder: 'asc' | 'desc' = 'asc';
    if (tableSortCol === colName) {
      newOrder = tableSortOrder === 'asc' ? 'desc' : 'asc';
    }
    setTableSortCol(colName);
    setTableSortOrder(newOrder);
    fetchTableRecords(selectedTable, 0, colName, newOrder, tableRecordSearch);
  };

  // ── Handle Quick Query in Studio ──
  const handleQueryTableInStudio = (tableName: string) => {
    setSqlQuery(`SELECT * FROM "${tableName}" LIMIT 50;`);
    setActiveSubTab('sql-studio');
    toast.info('Table Loaded', `Loaded query for '${tableName}' in SQL Studio.`);
  };

  // Filtered table list
  const filteredTables = useMemo(() => {
    if (!tableSearchFilter.trim()) return tables;
    const q = tableSearchFilter.toLowerCase();
    return tables.filter(t => t.name.toLowerCase().includes(q));
  }, [tables, tableSearchFilter]);

  // Filtered logs
  const filteredLogs = useMemo(() => {
    if (!logSearch.trim()) return logs;
    const q = logSearch.toLowerCase();
    return logs.filter(l => l.message.toLowerCase().includes(q) || JSON.stringify(l.metadata || {}).toLowerCase().includes(q));
  }, [logs, logSearch]);

  const selectedTableMeta = useMemo(() => {
    return tables.find(t => t.name === selectedTable);
  }, [tables, selectedTable]);

  return (
    <div className="space-y-6">
      {/* ── Top Header & Global Backend Status Bar ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-500/20 shadow-xl">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              <Server className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-white tracking-tight">Backend Control & Database Studio</h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 animate-pulse">
                  POSTGRESQL LIVE
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Direct infrastructure access, interactive SQL query console, table browser, and real-time telemetry
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {metrics && (
            <div className="flex items-center gap-3 px-3.5 py-1.5 rounded-xl bg-slate-800/80 border border-white/10 text-xs">
              <div className="flex items-center gap-1.5">
                <HardDrive className="h-3.5 w-3.5 text-indigo-400" />
                <span className="text-slate-400 font-bold">DB:</span>
                <span className="font-black text-white">{metrics.database.sizeFormatted}</span>
              </div>
              <div className="h-3 w-px bg-white/10" />
              <div className="flex items-center gap-1.5">
                <Cpu className="h-3.5 w-3.5 text-blue-400" />
                <span className="text-slate-400 font-bold">RAM:</span>
                <span className="font-black text-white">{metrics.process.memory.heapUsedFormatted}</span>
              </div>
              <div className="h-3 w-px bg-white/10" />
              <div className="flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-slate-400 font-bold">Cache:</span>
                <span className="font-black text-emerald-400">{metrics.database.cacheHitRate}</span>
              </div>
            </div>
          )}

          <button
            onClick={() => { fetchMetrics(); fetchTables(); fetchLogs(); }}
            disabled={loadingMetrics}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/8 hover:bg-white/12 border border-white/10 text-xs font-bold text-slate-200 transition"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingMetrics ? 'animate-spin' : ''}`} />
            Sync
          </button>
        </div>
      </div>

      {/* ── Sub-Tab Navigation Bar ── */}
      <div className="flex gap-1 p-1 rounded-2xl bg-slate-900/80 border border-white/8 overflow-x-auto scrollbar-none">
        {[
          { id: 'sql-studio',       label: 'SQL Studio',             icon: <Terminal className="h-3.5 w-3.5" /> },
          { id: 'db-explorer',      label: 'Database Explorer',      icon: <Database className="h-3.5 w-3.5" /> },
          { id: 'telemetry',        label: 'System Telemetry',       icon: <Activity className="h-3.5 w-3.5" /> },
          { id: 'logs-audit',       label: 'System Logs Stream',     icon: <Clock className="h-3.5 w-3.5" /> },
          { id: 'maintenance',      label: 'Maintenance Ops',        icon: <Zap className="h-3.5 w-3.5" /> },
          { id: 'pwa-diagnostics',  label: 'PWA & Cache Inspector',  icon: <Smartphone className="h-3.5 w-3.5" /> },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveSubTab(tab.id as BackendSubTab);
              if (tab.id === 'pwa-diagnostics') fetchStorageDiagnostics();
            }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition shrink-0 ${
              activeSubTab === tab.id
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 border border-indigo-400/30'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* 1. SQL QUERY STUDIO                                                   */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      {activeSubTab === 'sql-studio' && (
        <div className="space-y-4">
          {/* Query Editor Box */}
          <div className="rounded-2xl border border-white/10 bg-slate-900/90 shadow-xl overflow-hidden">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-slate-950/80 border-b border-white/8">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-400">Presets:</span>
                <select
                  onChange={(e) => {
                    const preset = PRESET_QUERIES.find(p => p.name === e.target.value);
                    if (preset) setSqlQuery(preset.query);
                  }}
                  className="bg-slate-800 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-slate-200 font-medium focus:outline-none focus:border-indigo-500"
                >
                  {PRESET_QUERIES.map(p => (
                    <option key={p.name} value={p.name}>{p.name}</option>
                  ))}
                </select>

                <div className="h-4 w-px bg-white/10 mx-1" />

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={allowMutation}
                    onChange={(e) => setAllowMutation(e.target.checked)}
                    className="rounded border-slate-700 text-rose-500 focus:ring-rose-500 bg-slate-800 h-3.5 w-3.5"
                  />
                  <span className={`text-[11px] font-bold ${allowMutation ? 'text-rose-400' : 'text-slate-400'}`}>
                    {allowMutation ? '⚠️ Unrestricted Mutations Enabled' : '🛡️ Safe Read-Only Mode'}
                  </span>
                </label>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSqlQuery('')}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition"
                  title="Clear Query"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={handleExecuteSql}
                  disabled={isExecutingSql}
                  className="flex items-center gap-2 px-4 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-xs font-black shadow-lg shadow-indigo-600/30 transition disabled:opacity-50"
                >
                  <Play className={`h-3.5 w-3.5 fill-current ${isExecutingSql ? 'animate-spin' : ''}`} />
                  {isExecutingSql ? 'Running...' : 'Run Query'}
                </button>
              </div>
            </div>

            {/* SQL Code Textarea */}
            <div className="p-4 bg-slate-950 font-mono">
              <textarea
                value={sqlQuery}
                onChange={(e) => setSqlQuery(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    handleExecuteSql();
                  }
                }}
                rows={6}
                placeholder="-- Enter PostgreSQL query here (e.g., SELECT * FROM products LIMIT 50;)..."
                className="w-full bg-transparent text-emerald-400 text-xs font-mono resize-y focus:outline-none leading-relaxed placeholder:text-slate-600"
                spellCheck={false}
              />
            </div>

            {/* Footer with execution metadata */}
            {queryResult && (
              <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-t border-white/8 text-[11px]">
                <div className="flex items-center gap-3">
                  {queryResult.success ? (
                    <span className="flex items-center gap-1 text-emerald-400 font-bold">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Success ({queryResult.command})
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-rose-400 font-bold">
                      <AlertTriangle className="h-3.5 w-3.5" /> Error
                    </span>
                  )}
                  <span className="text-slate-400">
                    Rows: <strong className="text-white">{queryResult.rowCount ?? (queryResult.rows?.length || 0)}</strong>
                  </span>
                  <span className="text-slate-400">
                    Duration: <strong className="text-white">{queryResult.durationMs}ms</strong>
                  </span>
                </div>

                {queryResult.rows && queryResult.rows.length > 0 && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={copyQueryResultJson}
                      className="flex items-center gap-1 px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition font-medium text-[10px]"
                    >
                      <Copy className="h-3 w-3" /> Copy JSON
                    </button>
                    <button
                      onClick={exportQueryResultJson}
                      className="flex items-center gap-1 px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-indigo-300 hover:text-indigo-200 transition font-medium text-[10px]"
                    >
                      <FileCode className="h-3 w-3" /> JSON
                    </button>
                    <button
                      onClick={exportQueryResultCsv}
                      className="flex items-center gap-1 px-2.5 py-1 rounded bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/30 text-indigo-200 font-bold transition text-[10px]"
                    >
                      <Download className="h-3 w-3" /> CSV
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Query Error Display */}
          {queryResult && !queryResult.success && (
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs space-y-1 font-mono">
              <div className="font-bold flex items-center gap-1.5 text-rose-400">
                <AlertTriangle className="h-4 w-4" /> Query Execution Error
              </div>
              <p>{queryResult.error}</p>
              {queryResult.detail && <p className="text-slate-400 text-[10px]">Detail: {queryResult.detail}</p>}
              {queryResult.hint && <p className="text-amber-400/80 text-[10px]">Hint: {queryResult.hint}</p>}
            </div>
          )}

          {/* Query Results Table Grid */}
          {queryResult?.rows && queryResult.rows.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-slate-900/80 overflow-hidden shadow-xl">
              <div className="px-4 py-3 bg-slate-800/60 border-b border-white/8 flex items-center justify-between">
                <h3 className="text-xs font-black text-white tracking-wider uppercase">Query Results Grid</h3>
                <span className="text-[10px] text-slate-400">Showing {queryResult.rows.length} rows</span>
              </div>
              <div className="overflow-x-auto max-h-96 scrollbar-thin">
                <table className="w-full text-left text-[11px] whitespace-nowrap">
                  <thead className="bg-slate-950/80 text-slate-400 font-bold sticky top-0 border-b border-white/10">
                    <tr>
                      <th className="px-3 py-2 text-slate-500">#</th>
                      {(queryResult.fields?.map(f => f.name) || Object.keys(queryResult.rows[0])).map(col => (
                        <th key={col} className="px-3 py-2 text-slate-300 font-mono">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono text-slate-300">
                    {queryResult.rows.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-indigo-500/5 transition">
                        <td className="px-3 py-2 text-slate-600">{rIdx + 1}</td>
                        {(queryResult.fields?.map(f => f.name) || Object.keys(row)).map(col => (
                          <td key={col} className="px-3 py-2 max-w-xs truncate text-slate-300">
                            {row[col] === null ? (
                              <span className="text-slate-600 italic">NULL</span>
                            ) : typeof row[col] === 'object' ? (
                              JSON.stringify(row[col])
                            ) : (
                              String(row[col])
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Recent Query History */}
          {queryHistory.length > 0 && (
            <div className="rounded-2xl border border-white/8 bg-slate-900/50 p-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Recent Execution History</h3>
              <div className="space-y-1.5 max-h-36 overflow-y-auto scrollbar-thin">
                {queryHistory.map((h, i) => (
                  <div
                    key={i}
                    onClick={() => setSqlQuery(h.query)}
                    className="flex items-center justify-between p-2 rounded-xl bg-slate-950/60 hover:bg-white/5 cursor-pointer border border-white/5 text-xs transition"
                  >
                    <span className="font-mono text-slate-300 truncate max-w-xl">{h.query}</span>
                    <div className="flex items-center gap-2 text-[10px] text-slate-500 shrink-0">
                      <span>{h.rows} rows</span>
                      <span>•</span>
                      <span>{h.duration}ms</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* 2. DATABASE EXPLORER                                                  */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      {activeSubTab === 'db-explorer' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Column: Tables Catalog */}
          <div className="lg:col-span-1 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
              <input
                type="text"
                value={tableSearchFilter}
                onChange={(e) => setTableSearchFilter(e.target.value)}
                placeholder="Filter tables..."
                className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="rounded-2xl border border-white/8 bg-slate-900/60 p-2 space-y-1 max-h-[600px] overflow-y-auto scrollbar-thin">
              {loadingTables ? (
                <div className="p-4 text-center text-xs text-slate-500">Loading schema tables...</div>
              ) : filteredTables.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500">No tables found</div>
              ) : (
                filteredTables.map(t => (
                  <button
                    key={t.name}
                    onClick={() => setSelectedTable(t.name)}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs text-left transition ${
                      selectedTable === t.name
                        ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/30'
                        : 'text-slate-300 hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Layers className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span className="truncate font-mono">{t.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 text-[10px]">
                      <span className="px-1.5 py-0.5 rounded bg-black/30 font-semibold">{t.estimatedRows}</span>
                      <span className="text-slate-400">{t.totalSize}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Right Column: Table Viewer */}
          <div className="lg:col-span-3 space-y-4">
            {selectedTableMeta && (
              <div className="p-4 rounded-2xl bg-slate-900 border border-white/8 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-black text-white font-mono">{selectedTableMeta.name}</h2>
                      <span className="px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 text-[10px] font-bold">
                        {selectedTableMeta.columnCount} cols
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 text-[10px] font-bold">
                        ~{selectedTableMeta.estimatedRows} rows
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 text-[10px] font-bold">
                        {selectedTableMeta.totalSize}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleQueryTableInStudio(selectedTableMeta.name)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 text-xs font-bold transition"
                  >
                    <Terminal className="h-3 w-3" /> Query in Studio
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  {tableTab === 'data' && (
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2 h-3 w-3 text-slate-500" />
                      <input
                        type="text"
                        value={tableRecordSearch}
                        onChange={(e) => {
                          setTableRecordSearch(e.target.value);
                          fetchTableRecords(selectedTable, 0, tableSortCol, tableSortOrder, e.target.value);
                        }}
                        placeholder="Search rows..."
                        className="pl-8 pr-2.5 py-1 bg-slate-950 border border-white/10 rounded-lg text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 w-36"
                      />
                    </div>
                  )}

                  <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-xl border border-white/10 text-xs">
                    <button
                      onClick={() => setTableTab('data')}
                      className={`px-3 py-1 rounded-lg font-bold transition ${tableTab === 'data' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                    >
                      Data Records ({tableTotalRows})
                    </button>
                    <button
                      onClick={() => setTableTab('schema')}
                      className={`px-3 py-1 rounded-lg font-bold transition ${tableTab === 'schema' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                    >
                      Schema ({selectedTableMeta.columns.length})
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Table Schema Viewer */}
            {tableTab === 'schema' && selectedTableMeta && (
              <div className="rounded-2xl border border-white/10 bg-slate-900/80 overflow-hidden shadow-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 font-bold border-b border-white/10">
                    <tr>
                      <th className="px-4 py-3">Column Name</th>
                      <th className="px-4 py-3">Data Type</th>
                      <th className="px-4 py-3">Nullable</th>
                      <th className="px-4 py-3">Default Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono text-slate-300">
                    {selectedTableMeta.columns.map((col, idx) => (
                      <tr key={idx} className="hover:bg-white/5 transition">
                        <td className="px-4 py-2.5 font-bold text-white flex items-center gap-2">
                          <span className="text-indigo-400 font-normal">#</span>
                          {col.column_name}
                        </td>
                        <td className="px-4 py-2.5 text-emerald-400">{col.data_type}</td>
                        <td className="px-4 py-2.5">
                          {col.is_nullable === 'YES' ? (
                            <span className="text-amber-400 font-semibold">YES</span>
                          ) : (
                            <span className="text-slate-500 font-semibold">NO</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-slate-400 truncate max-w-xs">
                          {col.column_default || <span className="text-slate-600 italic">None</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Table Data Viewer */}
            {tableTab === 'data' && (
              <div className="rounded-2xl border border-white/10 bg-slate-900/80 overflow-hidden shadow-xl space-y-2">
                <div className="overflow-x-auto max-h-[500px] scrollbar-thin">
                  {loadingTableData ? (
                    <div className="p-8 text-center text-xs text-slate-400">Loading records...</div>
                  ) : tableData.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-500">No records found in this table</div>
                  ) : (
                    <table className="w-full text-left text-[11px] whitespace-nowrap">
                      <thead className="bg-slate-950 text-slate-400 font-bold sticky top-0 border-b border-white/10">
                        <tr>
                          <th className="px-3 py-2 text-slate-600">#</th>
                          {tableFields.map(field => (
                            <th
                              key={field}
                              onClick={() => handleSortCol(field)}
                              className="px-3 py-2 text-slate-300 font-mono cursor-pointer hover:bg-white/5 transition"
                            >
                              <div className="flex items-center gap-1.5">
                                <span>{field}</span>
                                {tableSortCol === field ? (
                                  tableSortOrder === 'asc' ? <ArrowUp className="h-3 w-3 text-indigo-400" /> : <ArrowDown className="h-3 w-3 text-indigo-400" />
                                ) : (
                                  <ArrowUpDown className="h-2.5 w-2.5 opacity-40" />
                                )}
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 font-mono text-slate-300">
                        {tableData.map((row, idx) => (
                          <tr key={idx} className="hover:bg-indigo-500/5 transition">
                            <td className="px-3 py-2 text-slate-600">{tablePage * 30 + idx + 1}</td>
                            {tableFields.map(f => (
                              <td key={f} className="px-3 py-2 max-w-xs truncate">
                                {renderTableCellValue(f, row[f], row)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Pagination Controls */}
                <div className="flex items-center justify-between p-3 bg-slate-950 border-t border-white/8 text-xs">
                  <span className="text-slate-400 text-[11px]">
                    Page {tablePage + 1} of {Math.max(1, Math.ceil(tableTotalRows / 30))} ({tableTotalRows} total records)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      disabled={tablePage === 0 || loadingTableData}
                      onClick={() => fetchTableRecords(selectedTable, tablePage - 1, tableSortCol, tableSortOrder, tableRecordSearch)}
                      className="px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 font-bold disabled:opacity-40 transition"
                    >
                      Previous
                    </button>
                    <button
                      disabled={(tablePage + 1) * 30 >= tableTotalRows || loadingTableData}
                      onClick={() => fetchTableRecords(selectedTable, tablePage + 1, tableSortCol, tableSortOrder, tableRecordSearch)}
                      className="px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 font-bold disabled:opacity-40 transition"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* 3. INFRASTRUCTURE & SYSTEM TELEMETRY                                  */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      {activeSubTab === 'telemetry' && metrics && (
        <div className="space-y-6">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-slate-900 border border-white/8">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Node.js Process Uptime</div>
              <div className="text-2xl font-black text-white mt-1">
                {Math.floor(metrics.process.uptimeSeconds / 3600)}h {Math.floor((metrics.process.uptimeSeconds % 3600) / 60)}m {metrics.process.uptimeSeconds % 60}s
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">PID: {metrics.process.pid} • Node {metrics.process.nodeVersion}</div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900 border border-white/8">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Heap Memory Allocated</div>
              <div className="text-2xl font-black text-indigo-400 mt-1">{metrics.process.memory.heapUsedFormatted}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                Total Heap: {metrics.process.memory.heapTotalFormatted} ({metrics.process.memory.heapUsagePercent}%)
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900 border border-white/8">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Database Size</div>
              <div className="text-2xl font-black text-emerald-400 mt-1">{metrics.database.sizeFormatted}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">PostgreSQL Database: {metrics.database.name}</div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900 border border-white/8">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Buffer Cache Hit Rate</div>
              <div className="text-2xl font-black text-cyan-400 mt-1">{metrics.database.cacheHitRate}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">{metrics.database.commits} commits registered</div>
            </div>
          </div>

          {/* Connection Pool & Activity Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-5 rounded-2xl bg-slate-900/80 border border-white/8 space-y-4">
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <Database className="h-4 w-4 text-indigo-400" /> PostgreSQL Connection Pool Status
              </h3>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center py-2 border-b border-white/5">
                  <span className="text-slate-400">Total Active Clients in Pool</span>
                  <span className="font-bold text-white">{metrics.database.pool.totalCount}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-white/5">
                  <span className="text-slate-400">Idle Connections</span>
                  <span className="font-bold text-emerald-400">{metrics.database.pool.idleCount}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-white/5">
                  <span className="text-slate-400">Waiting Queries</span>
                  <span className="font-bold text-amber-400">{metrics.database.pool.waitingCount}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-slate-400">Total Backend Sessions</span>
                  <span className="font-bold text-white">{metrics.database.activeBackends}</span>
                </div>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-slate-900/80 border border-white/8 space-y-4">
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <Layers className="h-4 w-4 text-emerald-400" /> Enterprise Entity Footprint
              </h3>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center py-2 border-b border-white/5">
                  <span className="text-slate-400">Active Tenants</span>
                  <span className="font-black text-indigo-400">{metrics.counts.tenants}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-white/5">
                  <span className="text-slate-400">Total Registered Users</span>
                  <span className="font-bold text-white">{metrics.counts.users}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-white/5">
                  <span className="text-slate-400">Catalog Inventory Items</span>
                  <span className="font-bold text-white">{metrics.counts.products}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-slate-400">Processed Transaction Orders</span>
                  <span className="font-bold text-white">{metrics.counts.orders}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* 4. SYSTEM LOGS & SECURITY AUDIT STREAM                                */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      {activeSubTab === 'logs-audit' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="p-4 rounded-2xl bg-slate-900 border border-white/8 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              {['ALL', 'SECURITY', 'SQL', 'INFO', 'WARN', 'ERROR', 'MAINTENANCE'].map(lvl => (
                <button
                  key={lvl}
                  onClick={() => setLogLevel(lvl)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                    logLevel === lvl
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
                <input
                  type="text"
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  placeholder="Search logs..."
                  className="pl-9 pr-3 py-1.5 bg-slate-950 border border-white/10 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 w-48"
                />
              </div>

              <button
                onClick={() => setAutoRefreshLogs(!autoRefreshLogs)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                  autoRefreshLogs ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300' : 'bg-slate-800 border-white/10 text-slate-400'
                }`}
              >
                {autoRefreshLogs ? '● Auto-Streaming' : 'Paused'}
              </button>

              <button
                onClick={exportLogsJson}
                disabled={logs.length === 0}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 text-xs font-bold transition disabled:opacity-40"
              >
                <Download className="h-3.5 w-3.5" /> Export
              </button>
            </div>
          </div>

          {/* Log Stream Output Box */}
          <div className="rounded-2xl border border-white/10 bg-slate-950 p-4 font-mono text-xs max-h-[550px] overflow-y-auto scrollbar-thin space-y-2">
            {loadingLogs && logs.length === 0 ? (
              <div className="text-center text-slate-500 py-8">Fetching real-time backend log events...</div>
            ) : filteredLogs.length === 0 ? (
              <div className="text-center text-slate-500 py-8">No log entries matching filter</div>
            ) : (
              filteredLogs.map(entry => {
                const badgeColor =
                  entry.level === 'ERROR' ? 'bg-rose-500/20 text-rose-400 border-rose-500/30' :
                  entry.level === 'SECURITY' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' :
                  entry.level === 'SQL' ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' :
                  entry.level === 'MAINTENANCE' ? 'bg-violet-500/20 text-violet-300 border-violet-500/30' :
                  'bg-slate-700/50 text-slate-300 border-white/10';

                return (
                  <div key={entry.id} className="p-2.5 rounded-xl bg-slate-900/60 hover:bg-slate-900 border border-white/5 transition flex flex-col gap-1">
                    <div className="flex items-center justify-between text-[10px] text-slate-500">
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded border text-[9px] font-black ${badgeColor}`}>
                          {entry.level}
                        </span>
                        <span className="text-slate-400">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <span className="text-slate-600">{new Date(entry.timestamp).toLocaleDateString()}</span>
                    </div>
                    <div className="text-slate-200 break-all leading-relaxed font-sans text-xs">{entry.message}</div>
                    {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                      <div className="text-[10px] text-slate-500 font-mono bg-black/30 p-1.5 rounded-lg">
                        {JSON.stringify(entry.metadata)}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* 5. DATABASE OPERATIONS & MAINTENANCE                                  */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      {activeSubTab === 'maintenance' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Card 1: VACUUM ANALYZE */}
            <div className="p-5 rounded-2xl bg-slate-900 border border-white/8 space-y-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                  <Zap className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">VACUUM (Reclaim Dead Space)</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Reclaims storage occupied by dead tuples and defragments table pages</p>
                </div>
              </div>
              <button
                onClick={() => handleRunMaintenance('VACUUM')}
                disabled={maintenanceRunning !== null}
                className="w-full py-2 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/20 transition disabled:opacity-50"
              >
                {maintenanceRunning === 'VACUUM' ? 'Running VACUUM...' : 'Execute Database VACUUM'}
              </button>
            </div>

            {/* Card 2: ANALYZE */}
            <div className="p-5 rounded-2xl bg-slate-900 border border-white/8 space-y-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <Activity className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">ANALYZE (Optimizer Statistics)</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Collects statistics about table contents to optimize query execution plans</p>
                </div>
              </div>
              <button
                onClick={() => handleRunMaintenance('ANALYZE')}
                disabled={maintenanceRunning !== null}
                className="w-full py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/20 transition disabled:opacity-50"
              >
                {maintenanceRunning === 'ANALYZE' ? 'Running ANALYZE...' : 'Execute Database ANALYZE'}
              </button>
            </div>

            {/* Card 3: REINDEX */}
            <div className="p-5 rounded-2xl bg-slate-900 border border-white/8 space-y-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                  <ArrowUpDown className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">REINDEX (Rebuild B-Trees)</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Rebuilds corrupted or bloated indexes for faster lookup performance</p>
                </div>
              </div>
              <button
                onClick={() => handleRunMaintenance('REINDEX')}
                disabled={maintenanceRunning !== null}
                className="w-full py-2 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-lg shadow-cyan-600/20 transition disabled:opacity-50"
              >
                {maintenanceRunning === 'REINDEX' ? 'Reindexing...' : 'Execute Schema REINDEX'}
              </button>
            </div>

            {/* Card 4: AUDIT INTEGRITY */}
            <div className="p-5 rounded-2xl bg-slate-900 border border-white/8 space-y-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Integrity &amp; Orphan Scan</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Scans all 13 tables for orphaned records violating tenant foreign key isolation</p>
                </div>
              </div>
              <button
                onClick={() => handleRunMaintenance('AUDIT_INTEGRITY')}
                disabled={maintenanceRunning !== null}
                className="w-full py-2 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-lg shadow-amber-600/20 transition disabled:opacity-50"
              >
                {maintenanceRunning === 'AUDIT_INTEGRITY' ? 'Scanning Schema...' : 'Run Foreign Key Integrity Scan'}
              </button>
            </div>

            {/* Card 5: PURGE ORPHANS */}
            <div className="p-5 rounded-2xl bg-slate-900 border border-rose-500/20 space-y-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  <Trash2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Purge Orphan Records</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Permanently removes unlinked products, variants, and categories across all deleted tenants</p>
                </div>
              </div>
              <button
                onClick={() => handleRunMaintenance('PURGE_ORPHANS')}
                disabled={maintenanceRunning !== null}
                className="w-full py-2 px-4 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-bold text-xs shadow-lg shadow-rose-600/20 transition disabled:opacity-50"
              >
                {maintenanceRunning === 'PURGE_ORPHANS' ? 'Purging Orphans...' : 'Execute 1-Click Orphan Purge'}
              </button>
            </div>
          </div>

          {/* Maintenance Output Log */}
          {maintenanceReports.length > 0 && (
            <div className="rounded-2xl border border-white/8 bg-slate-900/80 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-white uppercase tracking-wider">Operation Reports</h3>
                {maintenanceReports.some(r => r.healthy === false) && (
                  <button
                    onClick={() => handleRunMaintenance('PURGE_ORPHANS')}
                    disabled={maintenanceRunning !== null}
                    className="flex items-center gap-1 px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition shadow-md shadow-rose-600/30"
                  >
                    <Trash2 className="h-3 w-3" /> Purge All Detected Orphans
                  </button>
                )}
              </div>

              <div className="space-y-2">
                {maintenanceReports.map((report, idx) => (
                  <div key={idx} className="p-3 rounded-xl bg-slate-950 border border-white/5 text-xs flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className={`h-4 w-4 shrink-0 ${report.healthy === false ? 'text-amber-400' : 'text-emerald-400'}`} />
                      <div>
                        <span className="font-bold text-white font-mono">{report.action}</span>
                        {report.scope && <span className="text-slate-400 ml-2">Scope: {report.scope}</span>}
                        {report.table && <span className="text-slate-400 ml-2">Table: {report.table}</span>}
                        {report.totalPurged !== undefined && (
                          <span className="ml-2 font-bold text-emerald-400">
                            • Purged {report.totalPurged} orphan records (Products: {report.purgedProducts || 0}, Variants: {report.purgedVariants || 0}, Categories: {report.purgedCategories || 0}, Brands: {report.purgedBrands || 0})
                          </span>
                        )}
                        {report.healthy !== undefined && (
                          <span className={`ml-2 font-bold ${report.healthy ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {report.healthy 
                              ? '• All tables 100% healthy (0 orphans)' 
                              : `• Orphan records detected: Products: ${report.orphanProducts || 0}, Variants: ${report.orphanVariants || 0}, Categories: ${report.orphanCategories || 0}, Brands: ${report.orphanBrands || 0}`}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-slate-500 font-mono text-[10px]">{report.durationMs}ms</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* 6. PWA UPDATE & CACHE STORAGE DIAGNOSTICS                            */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      {activeSubTab === 'pwa-diagnostics' && (
        <div className="space-y-6">
          {/* Top Status Banner */}
          <div className="p-6 rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-500/20 shadow-xl flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-2xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                <Smartphone className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-black text-white">PWA Update & Storage Protection Engine</h3>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-black tracking-wider uppercase border border-emerald-500/30">
                    State Protected
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Guards IndexedDB against destructive schema upgrades & prevents ServiceWorker broad cache purge loops.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleSimulateUpdate}
                disabled={isSimulatingUpdate}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-xs font-black shadow-lg shadow-indigo-600/30 transition disabled:opacity-50"
              >
                <Sparkles className={`h-3.5 w-3.5 ${isSimulatingUpdate ? 'animate-spin' : ''}`} />
                {isSimulatingUpdate ? 'Reconciling...' : 'Simulate PWA Migration'}
              </button>

              <button
                onClick={handleSafeCachePurge}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 text-xs font-bold transition"
              >
                <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                Safe Cache Purge
              </button>

              <button
                onClick={fetchStorageDiagnostics}
                disabled={loadingDiagnostics}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 text-xs font-bold transition"
                title="Refresh Storage Diagnostics"
              >
                <RefreshCw className={`h-4 w-4 ${loadingDiagnostics ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-slate-900 border border-white/8">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">PWA Build Version</div>
              <div className="text-xl font-black text-indigo-400 mt-1 font-mono">{CURRENT_PWA_BUILD_VER}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Deployment Hash Tracked</div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900 border border-white/8">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">IndexedDB Schema Version</div>
              <div className="text-xl font-black text-emerald-400 mt-1 font-mono">v{storageDiagnostics?.indexedDB.version || 40}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Dexie Non-Destructive Migrations</div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900 border border-white/8">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Local Cached Products</div>
              <div className="text-xl font-black text-cyan-400 mt-1 font-mono">
                {storageDiagnostics?.indexedDB.stores.find(s => s.name === 'products')?.count || 0}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">Preserved Across Updates</div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900 border border-white/8">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">CacheStorage Buckets</div>
              <div className="text-xl font-black text-amber-400 mt-1 font-mono">
                {storageDiagnostics?.cacheStorage.length || 0}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">Protected Data Caches Active</div>
            </div>
          </div>

          {/* Details Split: CacheStorage vs IndexedDB Stores */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* CacheStorage Buckets */}
            <div className="p-5 rounded-2xl bg-slate-900/80 border border-white/8 space-y-4">
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <HardDrive className="h-4 w-4 text-indigo-400" /> CacheStorage Layout Inspector
              </h3>
              <p className="text-xs text-slate-400">
                Verifies that data caches (<span className="text-emerald-400 font-mono">kwakopos-product-payloads</span>) are isolated from static asset caches (<span className="text-indigo-400 font-mono">kwakopos-assets-v2.1.0</span>).
              </p>

              <div className="space-y-2">
                {(!storageDiagnostics || storageDiagnostics.cacheStorage.length === 0) ? (
                  <div className="p-4 text-center text-xs text-slate-500 bg-slate-950 rounded-xl">No CacheStorage buckets currently registered in window</div>
                ) : (
                  storageDiagnostics.cacheStorage.map((cache, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-white/5 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-emerald-400" />
                        <span className="font-mono text-white font-bold">{cache.name}</span>
                        {cache.name === 'kwakopos-product-payloads' && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                            Protected Data
                          </span>
                        )}
                      </div>
                      <span className="text-slate-400 font-mono text-[11px]">{cache.itemsCount} requests cached</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* IndexedDB Store Counts */}
            <div className="p-5 rounded-2xl bg-slate-900/80 border border-white/8 space-y-4">
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <Database className="h-4 w-4 text-emerald-400" /> IndexedDB Table Records & Health
              </h3>
              <p className="text-xs text-slate-400">
                Live count of local Dexie object stores confirming zero record loss during version increments.
              </p>

              <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-thin">
                {(!storageDiagnostics || storageDiagnostics.indexedDB.stores.length === 0) ? (
                  <div className="p-4 text-center text-xs text-slate-500 bg-slate-950 rounded-xl">Connecting to IndexedDB...</div>
                ) : (
                  storageDiagnostics.indexedDB.stores.map((st, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-white/5 text-xs">
                      <div className="flex items-center gap-2 font-mono">
                        <Layers className="h-3.5 w-3.5 text-slate-400" />
                        <span className="text-slate-200 font-bold">{st.name}</span>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono font-bold text-[11px]">
                        {st.count} records
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Interactive PWA Diagnostics Component Widget */}
          <div className="pt-4 border-t border-white/10">
            <PWADiagnostic />
          </div>
        </div>
      )}
    </div>
  );
};
