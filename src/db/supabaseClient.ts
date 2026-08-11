import {
  cloudDb,
  logCloudTransaction,
  logCloudAudit,
  verifyRowLevelSecurity
} from './supabaseMock';
import { getSyncRealClientIp } from '../services/clientIpService';

let mockAuthOverride: { tenant_id: string; user_id: string; user_name: string } | null = null;

export function setMockAuthOverride(context: { tenant_id: string; user_id: string; user_name: string } | null) {
  mockAuthOverride = context;
}

function getAuthContext() {
  if (mockAuthOverride) {
    return mockAuthOverride;
  }
  const sessionStr = localStorage.getItem('dukapos_session');
  if (sessionStr) {
    try {
      const session = JSON.parse(sessionStr);
      if (session && session.user) {
        return {
          tenant_id: session.user.tenant_id || session.user.tenantId,
          user_id: session.user.id,
          user_name: session.user.name
        };
      }
    } catch (e) { }
  }
  // No valid session — return empty strings so RLS/header checks reject the request
  // rather than silently scoping data to the wrong tenant.
  return {
    tenant_id: '',
    user_id: 'usr-system',
    user_name: 'System',
  };
}

export interface SupabaseQueryBuilder {
  action: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'UPSERT';
  insertData: any;
  updateData: any;
  filters: Record<string, any>;
  select(fields?: string): this;
  insert(data: any | any[]): this;
  update(data: any): this;
  delete(): this;
  upsert(data: any | any[], options?: any): this;
  eq(column: string, value: any): this;
  match(filterMap: Record<string, any>): this;
  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2>;
  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null
  ): Promise<any>;
  execute(): Promise<any>;
}

export interface SupabaseClient {
  from(tableName: string): SupabaseQueryBuilder;
}

export const supabase: SupabaseClient = {
  from(tableName: string): SupabaseQueryBuilder {
    // NOTE: auth is resolved lazily inside execute() so that any setMockAuthOverride()
    // call made BEFORE awaiting the query is picked up correctly.
    const queryBuilder: SupabaseQueryBuilder = {
      action: 'SELECT' as 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'UPSERT',
      insertData: null as any,
      updateData: null as any,
      filters: {} as Record<string, any>,

      select(_fields?: string) {
        this.action = 'SELECT';
        return this;
      },

      insert(data: any | any[]) {
        this.action = 'INSERT';
        this.insertData = data;
        return this;
      },

      update(data: any) {
        this.action = 'UPDATE';
        this.updateData = data;
        return this;
      },

      delete() {
        this.action = 'DELETE';
        return this;
      },

      upsert(data: any | any[], _options?: any) {
        this.action = 'INSERT';
        this.insertData = data;
        return this;
      },

      eq(column: string, value: any) {
        this.filters[column] = value;
        return this;
      },

      match(filterMap: Record<string, any>) {
        this.filters = { ...this.filters, ...filterMap };
        return this;
      },

      // Implement then to make the builder awaitable (PromiseLike)
      async then<TResult1 = any, TResult2 = never>(
        onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
      ): Promise<TResult1 | TResult2> {
        try {
          const res = await this.execute();
          if (onfulfilled) {
            return Promise.resolve(onfulfilled(res));
          }
          return res as any;
        } catch (err) {
          if (onrejected) {
            return Promise.resolve(onrejected(err));
          }
          throw err;
        }
      },

      async catch<TResult = never>(
        onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null
      ): Promise<any> {
        return this.then(null, onrejected);
      },

      async execute() {
        // Resolve auth lazily so that mockAuthOverride set after from() is respected
        const auth = getAuthContext();

        let displayTableName = 'cloud_' + tableName;
        let apiPath = `/api/${tableName}`;
        let table = (cloudDb as any)[displayTableName];

        if (tableName === 'products') {
          displayTableName = 'cloud_products';
          apiPath = '/api/products';
          table = cloudDb.cloud_products;
        } else if (tableName === 'product_variants') {
          displayTableName = 'cloud_product_variants';
          apiPath = '/api/variants';
          table = cloudDb.cloud_product_variants;
        } else if (tableName === 'customers') {
          displayTableName = 'cloud_customers';
          apiPath = '/api/customers';
          table = cloudDb.cloud_customers;
        } else if (tableName === 'orders') {
          displayTableName = 'cloud_orders';
          apiPath = '/api/orders';
          table = cloudDb.cloud_orders;
        } else if (tableName === 'auditLogs') {
          displayTableName = 'supabase_audit_logs';
          apiPath = '/api/auditLogs';
          table = cloudDb.supabase_audit_logs;
        } else if (tableName === 'userSecurity') {
          displayTableName = 'cloud_user_security';
          apiPath = '/api/userSecurity';
          table = cloudDb.cloud_user_security;
        } else if (tableName === 'userBranchRoles') {
          displayTableName = 'cloud_user_branch_roles';
          apiPath = '/api/userBranchRoles';
          table = cloudDb.cloud_user_branch_roles;
        } else if (tableName === 'tenantModules') {
          displayTableName = 'cloud_tenant_modules';
          apiPath = '/api/tenantModules';
          table = cloudDb.cloud_tenant_modules;
        } else if (tableName === 'tenantSettings') {
          displayTableName = 'cloud_tenant_settings';
          apiPath = '/api/tenantSettings';
          table = cloudDb.cloud_tenant_settings;
        } else if (tableName === 'featureFlags') {
          displayTableName = 'cloud_feature_flags';
          apiPath = '/api/featureFlags';
          table = cloudDb.cloud_feature_flags;
        } else if (tableName === 'tenants') {
          displayTableName = 'cloud_tenants';
          apiPath = '/api/tenants';
          table = cloudDb.cloud_tenants;
        } else if (tableName === 'branches') {
          displayTableName = 'cloud_branches';
          apiPath = '/api/branches';
          table = cloudDb.cloud_branches;
        } else if (tableName === 'users') {
          displayTableName = 'cloud_users';
          apiPath = '/api/users';
          table = cloudDb.cloud_users;
        } else if (tableName === 'subscriptionPlans') {
          displayTableName = 'cloud_subscription_plans';
          apiPath = '/api/subscriptionPlans';
          table = cloudDb.cloud_subscription_plans;
        } else if (tableName === 'tenantUsers') {
          displayTableName = 'cloud_tenant_users';
          apiPath = '/api/tenantUsers';
          table = cloudDb.cloud_tenant_users;
        } else if (tableName === 'tenantUserBranches') {
          displayTableName = 'cloud_tenant_user_branches';
          apiPath = '/api/tenantUserBranches';
          table = cloudDb.cloud_tenant_user_branches;
        } else if (tableName === 'tenantSubscriptions') {
          displayTableName = 'cloud_subscriptions';
          apiPath = '/api/tenantSubscriptions';
          table = cloudDb.cloud_subscriptions;
        }

        if (!table) {
          throw new Error(`Table ${tableName} not defined in cloud mock db`);
        }

        const idKey = tableName === 'userSecurity' ? 'user_id' : 'id';

        // Prepare request headers with tenant identity context
        const headers = {
          'Content-Type': 'application/json',
          'x-tenant-id': auth.tenant_id || '',
          'x-user-id': auth.user_id || ''
        };

        try {
          // ─── SELECT ────────────────────────────────────────────────────────
          if (this.action === 'SELECT') {
            // Build URL query string from filter parameters
            const queryParams = new URLSearchParams();
            for (const [k, v] of Object.entries(this.filters)) {
              if (v !== undefined && v !== null) {
                queryParams.append(k, String(v));
              }
            }
            const queryString = queryParams.toString();
            const fetchUrl = queryString ? `${apiPath}?${queryString}` : apiPath;

            let records: any[] = [];
            let fetchedFromServer = false;

            // 1. Fetch from server API or fall back to client-side master Cloud Database
            try {
              const res = await fetch(fetchUrl, { headers });
              const contentType = res.headers.get('content-type') || '';
              if (res.ok && contentType.includes('application/json')) {
                const json = await res.json();
                const serverRecords: any[] = Array.isArray(json) ? json : (json.data || json.products || []);
                if (Array.isArray(serverRecords)) {
                  records = serverRecords;
                  fetchedFromServer = true;
                  if (serverRecords.length > 0) {
                    await table.bulkPut(serverRecords).catch(() => {});
                  }
                }
              }
            } catch (err) {
              console.warn(`[Cloud Client] Endpoint ${fetchUrl} using client-side cloud database.`);
            }

            if (!fetchedFromServer) {
              records = await table.toArray();
            }

            // Filter out soft deleted records (for products, variants, and tenants)
            if (tableName === 'products' || tableName === 'product_variants' || tableName === 'tenants') {
              records = records.filter(r => r.deletedAt === undefined || r.deletedAt === null || r.deleted_at === undefined || r.deleted_at === null);
            }

            // Apply simulated Row Level Security (RLS) policies
            records = records.filter(r => {
              const recordTenantId = r.tenantId || r.tenant_id || (tableName === 'tenants' ? r.id : undefined);
              const rls = verifyRowLevelSecurity('SELECT', displayTableName, auth.tenant_id, recordTenantId, auth.user_id);
              return rls.allowed;
            });

            // Apply filter queries (checking both camelCase and snake_case properties)
            for (const [col, val] of Object.entries(this.filters)) {
              records = records.filter((r: any) => {
                if (col === 'tenant_id' || col === 'tenantId') {
                  return (r.tenantId === val || r.tenant_id === val || (tableName === 'tenants' && r.id === val));
                }
                if (col === 'branch_id' || col === 'branchId') {
                  return (r.branchId === val || r.branch_id === val);
                }
                if (col === 'email') {
                  return r.email?.toLowerCase() === (val as string).toLowerCase();
                }
                return r[col] === val;
              });
            }

            await logCloudTransaction({
              operation: 'SELECT',
              table_name: displayTableName,
              status: 'SUCCESS',
              query_params: JSON.stringify(this.filters)
            });

            return { data: records, error: null };
          }

          // ─── INSERT ────────────────────────────────────────────────────────
          if (this.action === 'INSERT') {
            const dataToInsert = Array.isArray(this.insertData) ? this.insertData : [this.insertData];
            const processedData: any[] = [];

            for (const item of dataToInsert) {
              const recordTenantId = item.tenantId || item.tenant_id || (tableName === 'tenants' ? item.id : auth.tenant_id);
              const recordBranchId = item.branchId || item.branch_id || 'branch-dar-hq';

              // Validate schema and required properties
              if (tableName === 'products' && (!item.id || !item.name)) {
                throw new Error(`Validation Error: Missing required product fields (id, name) on table '${displayTableName}'.`);
              }
              if (tableName === 'product_variants' && !item.id) {
                throw new Error(`Validation Error: Missing required variant fields (id) on table '${displayTableName}'.`);
              }

              // Check RLS insert policies
              const rls = verifyRowLevelSecurity('INSERT', displayTableName, auth.tenant_id, recordTenantId, auth.user_id);
              if (!rls.allowed) {
                throw new Error(rls.error || `RLS policy violation on INSERT`);
              }

              // Enforce UUID identity if no ID is present
              let targetId = item[idKey];
              if (!targetId) {
                targetId = crypto.randomUUID();
              } else if (typeof targetId === 'string' && targetId.startsWith('offline-')) {
                targetId = crypto.randomUUID();
              }

              const newItem = {
                ...item,
                [idKey]: targetId,
                updatedAt: Date.now(),
                createdAt: item.createdAt || item.created_at || Date.now(),
                createdBy: item.createdBy || item.created_by || auth.user_id,
                version: item.version || 1,
                status: item.status || 'Active'
              };

              // Only assign tenantId/branchId properties for non-system/tenant entities
              if (tableName !== 'tenants' && tableName !== 'userSecurity' && tableName !== 'auditLogs') {
                newItem.tenantId = recordTenantId;
                newItem.tenant_id = recordTenantId;
                newItem.branchId = recordBranchId;
                newItem.branch_id = recordBranchId;
              }

              processedData.push(newItem);

              // 1. Post to shared Vite API server
              const postRes = await fetch(apiPath, {
                method: 'POST',
                headers,
                body: JSON.stringify(newItem)
              });
              if (!postRes.ok) {
                throw new Error(`DevServer POST error ${postRes.status}`);
              }

              // 2. Mirror to browser local cloudDb cache
              await table.put(newItem);

              await logCloudTransaction({
                operation: 'INSERT',
                table_name: displayTableName,
                record_id: newItem[idKey],
                status: 'SUCCESS'
              });

              await logCloudAudit({
                tenant_id: recordTenantId,
                user_id: auth.user_id,
                action: `${displayTableName}.insert.success`,
                ip_address: getSyncRealClientIp(),
                status: 'SUCCESS',
                details: `Successfully inserted record (ID: ${newItem[idKey]}) to cloud database.`
              });
            }

            return { data: processedData, error: null };
          }

          // ─── UPDATE ────────────────────────────────────────────────────────
          if (this.action === 'UPDATE') {
            let records: any[] = [];
            try {
              const fetchRes = await fetch(apiPath, { headers });
              const contentType = fetchRes.headers.get('content-type') || '';
              if (fetchRes.ok && contentType.includes('application/json')) {
                records = await fetchRes.json();
              }
            } catch (e) {}

            if (!records || records.length === 0) {
              records = await table.toArray();
            }

            for (const [col, val] of Object.entries(this.filters)) {
              records = records.filter((r: any) => {
                if (col === 'tenant_id' || col === 'tenantId') {
                  return (r.tenantId === val || r.tenant_id === val || (tableName === 'tenants' && r.id === val));
                }
                return r[col] === val;
              });
            }

            if (records.length === 0) {
              return { data: [], error: null };
            }

            const updatedRecords: any[] = [];
            for (const r of records) {
              // Verify RLS Update policies
              const recordTenantId = r.tenantId || r.tenant_id || (tableName === 'tenants' ? r.id : auth.tenant_id);
              const rls = verifyRowLevelSecurity('UPDATE', displayTableName, auth.tenant_id, recordTenantId, auth.user_id);
              if (!rls.allowed) {
                throw new Error(rls.error || `RLS policy violation on UPDATE`);
              }

              const updatedItem = {
                ...r,
                ...this.updateData,
                updatedAt: Date.now(),
                version: (r.version || 1) + 1
              };

              // 1. Post to shared Vite API server (if available)
              await fetch(apiPath, {
                method: 'POST',
                headers,
                body: JSON.stringify(updatedItem)
              }).catch(() => null);

              // 2. Mirror to browser local cloudDb cache
              await table.put(updatedItem);

              updatedRecords.push(updatedItem);

              await logCloudTransaction({
                operation: 'UPDATE',
                table_name: displayTableName,
                record_id: r[idKey],
                status: 'SUCCESS',
                query_params: JSON.stringify(this.filters)
              });

              await logCloudAudit({
                tenant_id: recordTenantId,
                user_id: auth.user_id,
                action: `${displayTableName}.update.success`,
                ip_address: getSyncRealClientIp(),
                status: 'SUCCESS',
                details: `Updated ID '${r[idKey]}' on cloud database.`
              });
            }

            return { data: updatedRecords, error: null };
          }

          // ─── DELETE ────────────────────────────────────────────────────────
          if (this.action === 'DELETE') {
            let records: any[] = [];
            try {
              const fetchRes = await fetch(apiPath, { headers });
              const contentType = fetchRes.headers.get('content-type') || '';
              if (fetchRes.ok && contentType.includes('application/json')) {
                records = await fetchRes.json();
              }
            } catch (e) {
              // Dev server fetch unavailable, use local cloudDb records
            }

            if (!records || records.length === 0) {
              records = await table.toArray();
            }

            for (const [col, val] of Object.entries(this.filters)) {
              records = records.filter((r: any) => {
                if (col === 'tenant_id' || col === 'tenantId') {
                  return (r.tenantId === val || r.tenant_id === val || (tableName === 'tenants' && r.id === val));
                }
                if (col === 'origin') {
                  return r.origin === val || (!r.origin && val === 'DEMO');
                }
                return r[col] === val;
              });
            }

            for (const r of records) {
              // Delete permanently from simulated cloudDb
              await table.delete(r[idKey]);

              await logCloudTransaction({
                operation: 'DELETE',
                table_name: displayTableName,
                record_id: r[idKey],
                status: 'SUCCESS',
                query_params: JSON.stringify(this.filters)
              });
            }

            return { data: records, error: null };
          }

          throw new Error('Unsupported database action.');
        } catch (err: any) {
          console.error(`[PostgreSQL/Supabase Error] Code: 42501. Message: ${err.message}`);

          await logCloudTransaction({
            operation: (this.action === 'UPSERT' ? 'INSERT' : this.action) as 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'BEGIN' | 'COMMIT',
            table_name: displayTableName,
            status: 'FAILED',
            error_message: err.message,
            query_params: JSON.stringify(this.filters)
          });

          await logCloudAudit({
            tenant_id: auth.tenant_id || 'unknown',
            user_id: auth.user_id || 'anonymous',
            action: `${displayTableName}.${this.action.toLowerCase()}.failed`,
            ip_address: getSyncRealClientIp(),
            status: 'FAILED',
            details: `Failed query on ${displayTableName}: ${err.message}`
          });

          return { data: null, error: { message: err.message, code: '42501' } };
        }
      }
    };

    return queryBuilder;
  }
};
