import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../db/dexie';
import type { Farm, FarmHouse } from '../../../db/dexie';
import { useAuth } from '../../../context/AuthContext';
import { Plus, MapPin, X } from 'lucide-react';
import { DocumentAttachmentManager } from '../../UI/DocumentAttachmentManager';

export const FarmManagement: React.FC = () => {
  const { user, currentBranch } = useAuth();
  const tenantId = user?.tenant_id || '';
  const branchId = currentBranch?.id || 'branch-main';

  const [activeTab, setActiveTab] = useState<'farms' | 'houses'>('farms');
  const [showFarmModal, setShowFarmModal] = useState(false);
  const [showHouseModal, setShowHouseModal] = useState(false);

  const [selectedFarm, setSelectedFarm] = useState<Farm | null>(null);

  // Form states
  const [farmForm, setFarmForm] = useState({
    farm_name: '',
    farm_code: '',
    farm_type: 'Poultry' as Farm['farm_type'],
    manager_name: '',
    address: '',
    capacity_units: 5000,
    status: 'Active' as Farm['status'],
  });

  const [houseForm, setHouseForm] = useState({
    farm_id: '',
    house_name: '',
    house_type: 'Poultry House' as FarmHouse['house_type'],
    capacity: 2500,
    temperature_celsius: 26,
    humidity_percent: 60,
  });

  const farms = useLiveQuery(() => db.farms.where('tenant_id').equals(tenantId).toArray(), [tenantId]) || [];
  const houses = useLiveQuery(() => db.farmHouses.where('tenant_id').equals(tenantId).toArray(), [tenantId]) || [];

  const handleCreateFarm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!farmForm.farm_name || !farmForm.farm_code) return;

    const newFarm: Farm = {
      id: `farm-${Date.now()}`,
      tenant_id: tenantId,
      branch_id: branchId,
      farm_name: farmForm.farm_name,
      farm_code: farmForm.farm_code,
      farm_type: farmForm.farm_type,
      manager_name: farmForm.manager_name,
      address: farmForm.address,
      capacity_units: farmForm.capacity_units,
      status: farmForm.status,
      created_at: Date.now(),
    };

    await db.farms.put(newFarm);
    setShowFarmModal(false);
    setFarmForm({ farm_name: '', farm_code: '', farm_type: 'Poultry', manager_name: '', address: '', capacity_units: 5000, status: 'Active' });
  };

  const handleCreateHouse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!houseForm.house_name || !houseForm.farm_id) return;

    const newHouse: FarmHouse = {
      id: `house-${Date.now()}`,
      tenant_id: tenantId,
      farm_id: houseForm.farm_id,
      house_name: houseForm.house_name,
      house_type: houseForm.house_type,
      capacity: houseForm.capacity,
      current_occupancy: 0,
      temperature_celsius: houseForm.temperature_celsius,
      humidity_percent: houseForm.humidity_percent,
      status: 'Active',
      created_at: Date.now(),
    };

    await db.farmHouses.put(newHouse);
    setShowHouseModal(false);
    setHouseForm({ farm_id: '', house_name: '', house_type: 'Poultry House', capacity: 2500, temperature_celsius: 26, humidity_percent: 60 });
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-darkbg-border">
        <div>
          <h2 className="text-lg font-black text-slate-900 dark:text-white">Farm & Facility Management</h2>
          <p className="text-xs text-slate-500">Configure physical farm units, poultry houses, dairy pens, paddocks, and incubators.</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex p-1 rounded-xl bg-slate-100 dark:bg-darkbg border border-slate-200 dark:border-darkbg-border">
            <button
              onClick={() => setActiveTab('farms')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${activeTab === 'farms' ? 'bg-white dark:bg-darkbg-card text-emerald-600 shadow-xs' : 'text-slate-500'}`}
            >
              Farms ({farms.length})
            </button>
            <button
              onClick={() => setActiveTab('houses')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${activeTab === 'houses' ? 'bg-white dark:bg-darkbg-card text-emerald-600 shadow-xs' : 'text-slate-500'}`}
            >
              Houses & Sheds ({houses.length})
            </button>
          </div>

          <button
            onClick={() => activeTab === 'farms' ? setShowFarmModal(true) : setShowHouseModal(true)}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="h-4 w-4" /> {activeTab === 'farms' ? 'New Farm Location' : 'New House / Pen'}
          </button>
        </div>
      </div>

      {/* Farms List */}
      {activeTab === 'farms' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {farms.length === 0 ? (
            <div className="col-span-full py-12 text-center text-xs text-slate-400 bg-white dark:bg-darkbg-card rounded-2xl border border-dashed border-slate-200 dark:border-darkbg-border">
              No farms configured. Click "+ New Farm Location" to add your first commercial farm.
            </div>
          ) : (
            farms.map((farm) => {
              const farmHouseCount = houses.filter(h => h.farm_id === farm.id).length;
              return (
                <div
                  key={farm.id}
                  onClick={() => setSelectedFarm(farm)}
                  className={`p-5 rounded-2xl border bg-white dark:bg-darkbg-card hover:border-emerald-500 transition cursor-pointer shadow-xs ${selectedFarm?.id === farm.id ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-slate-200 dark:border-darkbg-border'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-mono text-[10px] font-black uppercase">
                      {farm.farm_code}
                    </span>
                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-slate-100 dark:bg-darkbg text-slate-600 dark:text-slate-300">
                      {farm.farm_type}
                    </span>
                  </div>

                  <h3 className="text-base font-black text-slate-900 dark:text-white mt-2">{farm.farm_name}</h3>
                  <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                    <MapPin className="h-3 w-3 text-slate-400" /> {farm.address || 'Main HQ Location'}
                  </p>

                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-darkbg-border/40 flex items-center justify-between text-xs text-slate-400">
                    <span>Manager: <strong>{farm.manager_name || 'Unassigned'}</strong></span>
                    <span>{farmHouseCount} Structures</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Houses & Pens View */}
      {activeTab === 'houses' && (
        <div className="bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border overflow-hidden shadow-xs">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-100 dark:border-darkbg-border/40 bg-slate-50 dark:bg-darkbg/50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <th className="p-3.5 pl-6">House Name</th>
                <th className="p-3.5">Type</th>
                <th className="p-3.5">Farm</th>
                <th className="p-3.5 text-center">Capacity</th>
                <th className="p-3.5 text-center">Occupancy</th>
                <th className="p-3.5 text-center">Temp / Humidity</th>
                <th className="p-3.5 pr-6">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/20">
              {houses.length === 0 ? (
                <tr><td colSpan={7} className="p-6 text-center text-slate-400 italic">No houses or pens added yet.</td></tr>
              ) : (
                houses.map((house) => {
                  const farmObj = farms.find(f => f.id === house.farm_id);
                  return (
                    <tr key={house.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10">
                      <td className="p-3.5 pl-6 font-bold text-slate-900 dark:text-white">{house.house_name}</td>
                      <td className="p-3.5 text-slate-500">{house.house_type}</td>
                      <td className="p-3.5 text-emerald-600 font-bold">{farmObj?.farm_name || '—'}</td>
                      <td className="p-3.5 text-center font-semibold">{house.capacity.toLocaleString()}</td>
                      <td className="p-3.5 text-center font-bold text-slate-700 dark:text-slate-200">{house.current_occupancy}</td>
                      <td className="p-3.5 text-center font-mono text-slate-400">{house.temperature_celsius}°C / {house.humidity_percent}%</td>
                      <td className="p-3.5 pr-6">
                        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 text-[10px] font-bold">
                          {house.status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Selected Farm Document Attachments & Details */}
      {selectedFarm && (
        <div className="mt-6 pt-6 border-t border-slate-200 dark:border-darkbg-border">
          <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-3">Farm Documents & Compliance ( {selectedFarm.farm_name} )</h3>
          <DocumentAttachmentManager
            tenantId={tenantId}
            branchId={branchId}
            module="PoultryLivestock"
            entityType="Farm"
            entityId={selectedFarm.id}
            title={`Compliance & Inspection Documents — ${selectedFarm.farm_name}`}
          />
        </div>
      )}

      {/* Create Farm Modal */}
      {showFarmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <form onSubmit={handleCreateFarm} className="w-full max-w-md bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-darkbg-border/40">
              <h3 className="text-sm font-black text-slate-900 dark:text-white">Add New Commercial Farm</h3>
              <button type="button" onClick={() => setShowFarmModal(false)}><X className="h-4 w-4 text-slate-400" /></button>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Farm Name *</label>
              <input
                required
                className="w-full h-9 mt-1 px-3 rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg text-xs font-semibold text-slate-900 dark:text-white focus:outline-emerald-500"
                value={farmForm.farm_name}
                onChange={e => setFarmForm({ ...farmForm, farm_name: e.target.value })}
                placeholder="e.g. Green Valley Poultry Farm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Farm Code *</label>
                <input
                  required
                  className="w-full h-9 mt-1 px-3 rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg text-xs font-semibold text-slate-900 dark:text-white"
                  value={farmForm.farm_code}
                  onChange={e => setFarmForm({ ...farmForm, farm_code: e.target.value.toUpperCase() })}
                  placeholder="FARM-01"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Farm Type</label>
                <select
                  className="w-full h-9 mt-1 px-2 rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg text-xs font-semibold"
                  value={farmForm.farm_type}
                  onChange={e => setFarmForm({ ...farmForm, farm_type: e.target.value as any })}
                >
                  <option value="Poultry">Poultry</option>
                  <option value="Dairy">Dairy</option>
                  <option value="Beef Cattle">Beef Cattle</option>
                  <option value="Goat">Goat</option>
                  <option value="Sheep">Sheep</option>
                  <option value="Piggery">Piggery</option>
                  <option value="Hatchery">Hatchery</option>
                  <option value="Mixed">Mixed</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Farm Manager</label>
              <input
                className="w-full h-9 mt-1 px-3 rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg text-xs font-semibold text-slate-900 dark:text-white"
                value={farmForm.manager_name}
                onChange={e => setFarmForm({ ...farmForm, manager_name: e.target.value })}
                placeholder="Manager Name"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-darkbg-border/40">
              <button type="button" onClick={() => setShowFarmModal(false)} className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-darkbg-border text-xs font-bold">Cancel</button>
              <button type="submit" className="px-4 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700">Save Farm</button>
            </div>
          </form>
        </div>
      )}

      {/* Create House Modal */}
      {showHouseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <form onSubmit={handleCreateHouse} className="w-full max-w-md bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-darkbg-border/40">
              <h3 className="text-sm font-black text-slate-900 dark:text-white">Add House / Structure</h3>
              <button type="button" onClick={() => setShowHouseModal(false)}><X className="h-4 w-4 text-slate-400" /></button>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Target Farm *</label>
              <select
                required
                className="w-full h-9 mt-1 px-2 rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg text-xs font-semibold"
                value={houseForm.farm_id}
                onChange={e => setHouseForm({ ...houseForm, farm_id: e.target.value })}
              >
                <option value="">Select Farm...</option>
                {farms.map(f => <option key={f.id} value={f.id}>{f.farm_name}</option>)}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">House / Pen Name *</label>
              <input
                required
                className="w-full h-9 mt-1 px-3 rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg text-xs font-semibold"
                value={houseForm.house_name}
                onChange={e => setHouseForm({ ...houseForm, house_name: e.target.value })}
                placeholder="e.g. Broiler House #1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">House Type</label>
                <select
                  className="w-full h-9 mt-1 px-2 rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg text-xs font-semibold"
                  value={houseForm.house_type}
                  onChange={e => setHouseForm({ ...houseForm, house_type: e.target.value as any })}
                >
                  <option value="Poultry House">Poultry House</option>
                  <option value="Dairy Unit">Dairy Unit</option>
                  <option value="Pig Pen">Pig Pen</option>
                  <option value="Goat House">Goat House</option>
                  <option value="Hatchery">Hatchery</option>
                  <option value="Paddock">Paddock</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Capacity</label>
                <input
                  type="number"
                  className="w-full h-9 mt-1 px-3 rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg text-xs font-semibold"
                  value={houseForm.capacity}
                  onChange={e => setHouseForm({ ...houseForm, capacity: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-darkbg-border/40">
              <button type="button" onClick={() => setShowHouseModal(false)} className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-darkbg-border text-xs font-bold">Cancel</button>
              <button type="submit" className="px-4 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700">Save House</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
