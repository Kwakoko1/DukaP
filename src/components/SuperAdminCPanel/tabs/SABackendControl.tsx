import React, { useState, useEffect, useMemo } from 'react';
import {
  Database, Terminal, Server, ShieldAlert, Cpu, Activity,
  RefreshCw, Play, Download, Trash2, CheckCircle2,
  AlertTriangle, Clock, Layers, Search,
  HardDrive, Zap, ArrowUpDown
} from 'lucide-react';
import {
  SuperAdminBackendService,
  type TableSummary,
  type QueryExecutionResult,
  type SystemMetrics,
  type SystemLogEntry,
  type MaintenanceReport
} from '../../../services/superAdminBackendService';
import { useToast } from '../../UI/Toast';

type BackendSubTab = 'sql-studio' | 'db-explorer' | 'telemetry' | 'logs-audit' | 'maintenance';

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
  const [loadingTableData, setLoadingTableData] = useState<boolean>(false);

  // ── Logs State ──
  const [logs, setLogs] = useState<SystemLogEntry[]>([]);
  const [logLevel, setLogLevel] = useState<string>('ALL');
  const [logSearch, setLogSearch] = useState<string>('');
  const [loadingLogs, setLoadingLogs] = useState<boolean>(false);
  const [autoRefreshLogs, setAutoRefreshLogs] = useState<boolean>(true);

  // ── Maintenance State ──
  const [maintenanceRunning, setMaintenanceRunning] = useState<string | null>(null);
  const [maintenanceReports, setMaintenanceReports] = useState<MaintenanceReport[]>([]);

  // ── Initial load & periodic telemetry refresh ──
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
    setLoadingTables(false);
  };

  const fetchTableRecords = async (tableName: string, page: number = 0) => {
    if (!tableName) return;
    setLoadingTableData(true);
    const limit = 30;
    const offset = page * limit;
    const res = await SuperAdminBackendService.getTableData(tableName, limit, offset);
    if (res.success) {
      setTableData(res.rows || []);
      setTableFields(res.fields || []);
      setTableTotalRows(res.totalCount || 0);
      setTablePage(page);
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
      fetchTableRecords(selectedTable, 0);
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
  };

  // ── Maintenance Actions ──
  const handleRunMaintenance = async (action: 'VACUUM' | 'ANALYZE' | 'REINDEX' | 'AUDIT_INTEGRITY', table?: string) => {
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
          { id: 'sql-studio',  label: 'SQL Studio',          icon: <Terminal className="h-3.5 w-3.5" /> },
          { id: 'db-explorer', label: 'Database Explorer',   icon: <Database className="h-3.5 w-3.5" /> },
          { id: 'telemetry',   label: 'System Telemetry',    icon: <Activity className="h-3.5 w-3.5" /> },
          { id: 'logs-audit',  label: 'System Logs Stream',  icon: <Clock className="h-3.5 w-3.5" /> },
          { id: 'maintenance', label: 'Maintenance Ops',     icon: <Zap className="h-3.5 w-3.5" /> },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id as BackendSubTab)}
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
                  <button
                    onClick={exportQueryResultCsv}
                    className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-bold transition"
                  >
                    <Download className="h-3 w-3" /> Export CSV
                  </button>
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
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-black text-white font-mono">{selectedTableMeta.name}</h2>
                    <span className="px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 text-[10px] font-bold">
                      {selectedTableMeta.columnCount} columns
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 text-[10px] font-bold">
                      ~{selectedTableMeta.estimatedRows} rows
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 text-[10px] font-bold">
                      Size: {selectedTableMeta.totalSize}
                    </span>
                  </div>
                </div>

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
                            <th key={field} className="px-3 py-2 text-slate-300 font-mono">
                              {field}
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
                                {row[f] === null ? (
                                  <span className="text-slate-600 italic">NULL</span>
                                ) : typeof row[f] === 'object' ? (
                                  JSON.stringify(row[f])
                                ) : (
                                  String(row[f])
                                )}
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
                      onClick={() => fetchTableRecords(selectedTable, tablePage - 1)}
                      className="px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 font-bold disabled:opacity-40 transition"
                    >
                      Previous
                    </button>
                    <button
                      disabled={(tablePage + 1) * 30 >= tableTotalRows || loadingTableData}
                      onClick={() => fetchTableRecords(selectedTable, tablePage + 1)}
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
                  <h3 className="text-sm font-bold text-white">Integrity & Orphan Scan</h3>
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
          </div>

          {/* Maintenance Output Log */}
          {maintenanceReports.length > 0 && (
            <div className="rounded-2xl border border-white/8 bg-slate-900/80 p-5 space-y-3">
              <h3 className="text-xs font-black text-white uppercase tracking-wider">Operation Reports</h3>
              <div className="space-y-2">
                {maintenanceReports.map((report, idx) => (
                  <div key={idx} className="p-3 rounded-xl bg-slate-950 border border-white/5 text-xs flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                      <div>
                        <span className="font-bold text-white font-mono">{report.action}</span>
                        {report.scope && <span className="text-slate-400 ml-2">Scope: {report.scope}</span>}
                        {report.table && <span className="text-slate-400 ml-2">Table: {report.table}</span>}
                        {report.healthy !== undefined && (
                          <span className={`ml-2 font-bold ${report.healthy ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {report.healthy ? '• All 13 tables 100% healthy' : '• Orphan records detected'}
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
    </div>
  );
};
