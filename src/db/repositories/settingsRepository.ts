/**
 * KwakoPos — Canonical Settings Repository
 */

import { db } from '../dexie';
import type { TenantSetting } from '../dexie';
import { localWriteCoordinator } from '../persistence/localWriteCoordinator';

export const settingsRepository = {
  async findByTenant(tenantId: string): Promise<TenantSetting[]> {
    if (!db.isOpen()) await db.open();
    return db.tenantSettings.where('tenant_id').equals(tenantId).toArray();
  },

  async saveSetting(setting: TenantSetting): Promise<TenantSetting> {
    const id = setting.id || `set_${setting.tenant_id}_${setting.setting_key || 'config'}`;
    const rec: TenantSetting = { ...setting, id };
    return localWriteCoordinator.executeAtomicMutation('tenantSettings', rec, setting.id ? 'UPDATE' : 'CREATE', setting.tenant_id);
  }
};
