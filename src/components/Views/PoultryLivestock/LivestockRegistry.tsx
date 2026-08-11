import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../db/dexie';
import type { LivestockAnimal } from '../../../db/dexie';
import { useAuth } from '../../../context/AuthContext';
import { Plus, Search, X } from 'lucide-react';
import { DocumentAttachmentManager } from '../../UI/DocumentAttachmentManager';

export const LivestockRegistry: React.FC = () => {
  const { user, currentBranch } = useAuth();
  const tenantId = user?.tenant_id || '';
  const branchId = currentBranch?.id || 'branch-main';

  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selectedAnimal, setSelectedAnimal] = useState<LivestockAnimal | null>(null);

  const [form, setForm] = useState({
    farm_id: '',
    animal_id: '',
    tag_number: '',
    species: 'Cattle' as LivestockAnimal['species'],
    breed: 'Friesian',
    gender: 'Female' as LivestockAnimal['gender'],
    weight_kg: 350,
    status: 'Healthy' as LivestockAnimal['status'],
  });

  const farms = useLiveQuery(() => db.farms.where('tenant_id').equals(tenantId).toArray(), [tenantId]) || [];
  const animals = useLiveQuery(() => db.livestockAnimals.where('tenant_id').equals(tenantId).toArray(), [tenantId]) || [];

  const handleCreateAnimal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.animal_id || !form.tag_number || !form.farm_id) return;

    const newAnimal: LivestockAnimal = {
      id: `anim-${Date.now()}`,
      tenant_id: tenantId,
      branch_id: branchId,
      farm_id: form.farm_id,
      animal_id: form.animal_id,
      tag_number: form.tag_number,
      species: form.species,
      breed: form.breed,
      gender: form.gender,
      weight_kg: Number(form.weight_kg),
      status: form.status,
      created_at: Date.now(),
    };

    await db.livestockAnimals.put(newAnimal);
    setShowModal(false);
  };

  const filtered = animals.filter(a =>
    a.animal_id.toLowerCase().includes(search.toLowerCase()) ||
    a.tag_number.toLowerCase().includes(search.toLowerCase()) ||
    a.breed.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-darkbg-border">
        <div>
          <h2 className="text-lg font-black text-slate-900 dark:text-white">Individual Livestock Registry</h2>
          <p className="text-xs text-slate-500">Track cattle, goats, sheep, and pigs with ear tags, QR badges, lineage dam/sire genealogy, and medical logs.</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              className="h-9 pl-9 pr-3 rounded-xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg-card text-xs font-medium text-slate-900 dark:text-white"
              placeholder="Search Tag, Animal ID, Breed..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <button
            onClick={() => setShowModal(true)}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm shrink-0"
          >
            <Plus className="h-4 w-4" /> Register Animal
          </button>
        </div>
      </div>

      {/* Animal Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.length === 0 ? (
          <div className="col-span-full py-12 text-center text-xs text-slate-400 bg-white dark:bg-darkbg-card rounded-2xl border border-dashed border-slate-200 dark:border-darkbg-border">
            No livestock animals registered. Click "+ Register Animal" to add individual cattle, goats, sheep, or pigs.
          </div>
        ) : (
          filtered.map((animal) => {
            const farmObj = farms.find(f => f.id === animal.farm_id);
            return (
              <div
                key={animal.id}
                onClick={() => setSelectedAnimal(animal)}
                className={`p-5 rounded-2xl border bg-white dark:bg-darkbg-card hover:border-emerald-500 transition cursor-pointer shadow-xs ${selectedAnimal?.id === animal.id ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-slate-200 dark:border-darkbg-border'}`}
              >
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-mono text-[10px] font-black">
                    {animal.tag_number}
                  </span>
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                    {animal.status}
                  </span>
                </div>

                <div className="mt-3">
                  <h3 className="text-base font-black text-slate-900 dark:text-white">{animal.animal_id}</h3>
                  <p className="text-xs text-slate-500 font-semibold">{animal.species} · {animal.breed} ({animal.gender})</p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-darkbg-border/40 flex items-center justify-between text-xs text-slate-400">
                  <span>Farm: <strong className="text-slate-700 dark:text-slate-200">{farmObj?.farm_name || 'Main HQ'}</strong></span>
                  <span className="font-mono font-bold text-slate-800 dark:text-white">{animal.weight_kg} kg</span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Selected Animal Document Attachments */}
      {selectedAnimal && (
        <div className="mt-6 pt-6 border-t border-slate-200 dark:border-darkbg-border">
          <DocumentAttachmentManager
            tenantId={tenantId}
            branchId={branchId}
            module="PoultryLivestock"
            entityType="Animal"
            entityId={selectedAnimal.id}
            title={`Medical History & Passport Documents — ${selectedAnimal.animal_id}`}
          />
        </div>
      )}

      {/* Register Animal Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <form onSubmit={handleCreateAnimal} className="w-full max-w-md bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-darkbg-border/40">
              <h3 className="text-sm font-black text-slate-900 dark:text-white">Register Individual Animal</h3>
              <button type="button" onClick={() => setShowModal(false)}><X className="h-4 w-4 text-slate-400" /></button>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Target Farm *</label>
              <select
                required
                className="w-full h-9 mt-1 px-2 rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg text-xs font-semibold"
                value={form.farm_id}
                onChange={e => setForm({ ...form, farm_id: e.target.value })}
              >
                <option value="">Select Farm...</option>
                {farms.map(f => <option key={f.id} value={f.id}>{f.farm_name}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Animal ID *</label>
                <input
                  required
                  className="w-full h-9 mt-1 px-3 rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg text-xs font-semibold font-mono"
                  value={form.animal_id}
                  onChange={e => setForm({ ...form, animal_id: e.target.value.toUpperCase() })}
                  placeholder="COW-0042"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Ear Tag Number *</label>
                <input
                  required
                  className="w-full h-9 mt-1 px-3 rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg text-xs font-semibold font-mono"
                  value={form.tag_number}
                  onChange={e => setForm({ ...form, tag_number: e.target.value.toUpperCase() })}
                  placeholder="TAG-9901"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Species</label>
                <select
                  className="w-full h-9 mt-1 px-2 rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg text-xs font-semibold"
                  value={form.species}
                  onChange={e => setForm({ ...form, species: e.target.value as any })}
                >
                  <option value="Cattle">Cattle</option>
                  <option value="Goat">Goat</option>
                  <option value="Sheep">Sheep</option>
                  <option value="Pig">Pig</option>
                  <option value="Horse">Horse</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Breed</label>
                <input
                  className="w-full h-9 mt-1 px-3 rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg text-xs font-semibold"
                  value={form.breed}
                  onChange={e => setForm({ ...form, breed: e.target.value })}
                  placeholder="e.g. Friesian"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-darkbg-border/40">
              <button type="button" onClick={() => setShowModal(false)} className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-darkbg-border text-xs font-bold">Cancel</button>
              <button type="submit" className="px-4 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700">Save Animal</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
