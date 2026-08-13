import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../db/dexie';
import { useAuth } from '../../../context/AuthContext';
import {
  Pill, Plus, Search, Download, Edit2, Trash2, Tag,
  Package, AlertTriangle,
  XCircle, QrCode, Printer
} from 'lucide-react';

type MedTab = 'Medicines Master' | 'Medicine Categories' | 'Price Lists' | 'Barcode & Labels';

interface MedicineForm {
  name: string;
  generic_name: string;
  manufacturer: string;
  category: string;
  dosage_form: string;
  strength: string;
  unit: string;
  purchase_price: number;
  selling_price: number;
  reorder_level: number;
  is_controlled: boolean;
  requires_prescription: boolean;
  storage_conditions: string;
  description: string;
}

const DOSAGE_FORMS = ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Cream/Ointment', 'Drops', 'Inhaler', 'Patch', 'Suppository', 'Powder', 'Solution'];
const STORAGE_CONDITIONS = ['Room Temperature', 'Refrigerate (2–8°C)', 'Freeze (≤ -15°C)', 'Dark & Dry', 'Below 25°C'];

const emptyForm = (): MedicineForm => ({
  name: '', generic_name: '', manufacturer: '', category: '', dosage_form: 'Tablet',
  strength: '', unit: 'Tablets', purchase_price: 0, selling_price: 0,
  reorder_level: 10, is_controlled: false, requires_prescription: false,
  storage_conditions: 'Room Temperature', description: ''
});

export const MedicinesMaster: React.FC = () => {
  const { user, currentBranch } = useAuth();
  const tenantId = user?.tenant_id || '';
  const branchId = currentBranch?.id || '';

  const [activeTab, setActiveTab] = useState<MedTab>('Medicines Master');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterForm, setFilterForm] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<MedicineForm>(emptyForm());
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [selectedForLabels, setSelectedForLabels] = useState<Set<string>>(new Set());

  // Live medicine products (tagged as medicine)
  const medicines = useLiveQuery(async () => {
    if (!tenantId) return [];
    const prods = await db.products
      .where('tenant_id').equals(tenantId)
      .and(p => !p.deletedAt && (p.branch_id === branchId || !p.branch_id))
      .toArray();
    // Filter by pharmacy-style category or medicine flag
    return prods.filter(p => (p as any).is_medicine !== false);
  }, [tenantId, branchId]) || [];

  const categories = useMemo(() => {
    const cats = new Set(medicines.map(m => (m as any).category || 'General').filter(Boolean));
    return ['all', ...Array.from(cats).sort((a, b) => a.localeCompare(b))];
  }, [medicines]);

  const filtered = useMemo(() => {
    return medicines.filter(m => {
      const matchSearch = !searchTerm ||
        m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ((m as any).generic_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        ((m as any).manufacturer || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchCat = filterCategory === 'all' || (m as any).category === filterCategory;
      const matchForm = filterForm === 'all' || (m as any).dosage_form === filterForm;
      return matchSearch && matchCat && matchForm;
    });
  }, [medicines, searchTerm, filterCategory, filterForm]);

  const stats = useMemo(() => ({
    total: medicines.length,
    controlled: medicines.filter(m => (m as any).is_controlled).length,
    prescriptionOnly: medicines.filter(m => (m as any).requires_prescription).length,
    lowStock: medicines.filter(m => m.stock <= (m.reorderLevel ?? 10)).length,
  }), [medicines]);

  const handleSave = async () => {
    const now = Date.now();
    const id = editingId || `med-${tenantId}-${now}`;
    const product: any = {
      id,
      tenant_id: tenantId,
      branch_id: branchId,
      name: form.name,
      generic_name: form.generic_name,
      manufacturer: form.manufacturer,
      category: form.category || 'General',
      dosage_form: form.dosage_form,
      strength: form.strength,
      unit: form.unit,
      purchase_price: form.purchase_price,
      cost: form.purchase_price,
      price: form.selling_price,
      reorderLevel: form.reorder_level,
      is_controlled: form.is_controlled,
      requires_prescription: form.requires_prescription,
      storage_conditions: form.storage_conditions,
      description: form.description,
      is_medicine: true,
      status: 'Active',
      stock: 0,
      hasVariants: false,
      created_at: editingId ? undefined : now,
      updated_at: now,
    };
    if (editingId) delete product.created_at;
    await db.products.put(product);
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm());
  };

  const handleEdit = (med: any) => {
    setEditingId(med.id);
    setForm({
      name: med.name || '',
      generic_name: med.generic_name || '',
      manufacturer: med.manufacturer || '',
      category: med.category || '',
      dosage_form: med.dosage_form || 'Tablet',
      strength: med.strength || '',
      unit: med.unit || 'Tablets',
      purchase_price: med.purchase_price || med.cost || 0,
      selling_price: med.price || med.selling_price || 0,
      reorder_level: med.reorderLevel || 10,
      is_controlled: med.is_controlled || false,
      requires_prescription: med.requires_prescription || false,
      storage_conditions: med.storage_conditions || 'Room Temperature',
      description: med.description || '',
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this medicine? This cannot be undone.')) return;
    await db.products.update(id, { deletedAt: Date.now(), status: 'Inactive' });
  };

  const toggleLabel = (id: string) => {
    setSelectedForLabels(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const fmtCcy = (n: number) => `Tsh ${n.toLocaleString()}`;

  const tabs: MedTab[] = ['Medicines Master', 'Medicine Categories', 'Price Lists', 'Barcode & Labels'];

  return (
    <div className="space-y-5 p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Pill className="h-6 w-6 text-emerald-500" />
            Medicines Master
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Manage your medicine catalogue, categories, pricing, and barcode labels.
          </p>
        </div>
        <button
          onClick={() => { setShowForm(true); setEditingId(null); setForm(emptyForm()); }}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-xl text-xs font-semibold transition active:scale-95"
        >
          <Plus className="h-4 w-4" /> Add Medicine
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Medicines', value: stats.total, icon: Pill, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
          { label: 'Controlled Drugs', value: stats.controlled, icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-900/20' },
          { label: 'Prescription Only', value: stats.prescriptionOnly, icon: Tag, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20' },
          { label: 'Low Stock', value: stats.lowStock, icon: Package, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20' },
        ].map(kpi => (
          <div key={kpi.label} className={`rounded-2xl border border-slate-200 dark:border-darkbg-border p-4 ${kpi.bg}`}>
            <div className="flex items-center gap-2 mb-1">
              <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
              <span className="text-xs text-slate-500 dark:text-slate-400">{kpi.label}</span>
            </div>
            <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-darkbg-border">
        {tabs.map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-3 py-2 text-xs font-semibold border-b-2 transition ${
              activeTab === t
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Medicines Master Tab */}
      {activeTab === 'Medicines Master' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search medicines..."
                className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>
            <select
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg"
            >
              {categories.map(c => <option key={c} value={c}>{c === 'all' ? 'All Categories' : c}</option>)}
            </select>
            <select
              value={filterForm}
              onChange={e => setFilterForm(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg"
            >
              <option value="all">All Forms</option>
              {DOSAGE_FORMS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>

          {/* Table */}
          <div className="rounded-2xl border border-slate-200 dark:border-darkbg-border overflow-hidden bg-white dark:bg-darkbg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-darkbg-border/40 text-slate-500">
                    <th className="text-left px-4 py-3 font-semibold">Medicine Name</th>
                    <th className="text-left px-4 py-3 font-semibold hidden md:table-cell">Generic Name</th>
                    <th className="text-left px-4 py-3 font-semibold hidden lg:table-cell">Category</th>
                    <th className="text-left px-4 py-3 font-semibold hidden lg:table-cell">Form / Strength</th>
                    <th className="text-right px-4 py-3 font-semibold">Price</th>
                    <th className="text-center px-4 py-3 font-semibold">Stock</th>
                    <th className="text-center px-4 py-3 font-semibold">Flags</th>
                    <th className="text-right px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/50">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-slate-400">
                        <Pill className="h-8 w-8 mx-auto mb-2 opacity-30" />
                        <p>No medicines found. Add your first medicine.</p>
                      </td>
                    </tr>
                  ) : filtered.map(med => (
                    <React.Fragment key={med.id}>
                      <tr
                        className="hover:bg-slate-50 dark:hover:bg-darkbg/50 cursor-pointer"
                        onClick={() => setExpandedRow(expandedRow === med.id ? null : med.id)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                              <Pill className="h-4 w-4 text-emerald-600" />
                            </div>
                            <div>
                              <p className="font-semibold text-slate-900 dark:text-white">{med.name}</p>
                              <p className="text-slate-400">{(med as any).manufacturer || '—'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300 hidden md:table-cell">
                          {(med as any).generic_name || '—'}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <span className="bg-slate-100 dark:bg-darkbg-border text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full text-[10px] font-medium">
                            {(med as any).category || 'General'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300 hidden lg:table-cell">
                          {(med as any).dosage_form || '—'} {(med as any).strength ? `· ${(med as any).strength}` : ''}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-white">
                          {fmtCcy(med.price || 0)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`font-bold ${med.stock <= (med.reorderLevel ?? 10) ? 'text-red-500' : 'text-emerald-600'}`}>
                            {med.stock}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex gap-1 justify-center">
                            {(med as any).is_controlled && (
                              <span className="bg-red-100 text-red-600 px-1.5 py-0.5 rounded text-[9px] font-bold">CD</span>
                            )}
                            {(med as any).requires_prescription && (
                              <span className="bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded text-[9px] font-bold">Rx</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex gap-1 justify-end" onClick={e => e.stopPropagation()}>
                            <button onClick={() => handleEdit(med)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-darkbg text-slate-500">
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => handleDelete(med.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expandedRow === med.id && (
                        <tr className="bg-emerald-50/40 dark:bg-emerald-900/10">
                          <td colSpan={8} className="px-6 py-4">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                              <div><p className="text-slate-400 mb-0.5">Storage</p><p className="font-medium text-slate-700 dark:text-slate-200">{(med as any).storage_conditions || '—'}</p></div>
                              <div><p className="text-slate-400 mb-0.5">Purchase Price</p><p className="font-medium text-slate-700 dark:text-slate-200">{fmtCcy((med as any).purchase_price || (med as any).buyingPrice || 0)}</p></div>
                              <div><p className="text-slate-400 mb-0.5">Reorder Level</p><p className="font-medium text-slate-700 dark:text-slate-200">{med.reorderLevel ?? 10} units</p></div>
                              <div><p className="text-slate-400 mb-0.5">Description</p><p className="font-medium text-slate-700 dark:text-slate-200">{(med as any).description || '—'}</p></div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Medicine Categories Tab */}
      {activeTab === 'Medicine Categories' && (
        <div className="rounded-2xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-6">
          <h3 className="font-bold text-sm text-slate-700 dark:text-white mb-4">Medicine Categories</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {['Antibiotics', 'Analgesics', 'Antidiabetics', 'Antihistamines', 'Antihypertensives',
              'Antiparasitics', 'Vitamins & Supplements', 'GI Medicines', 'Respiratory', 'Dermatological',
              'Ophthalmic', 'Controlled Substances', 'OTC', 'Vaccines', 'Herbal & Traditional'
            ].map(cat => {
              const count = medicines.filter(m => (m as any).category === cat).length;
              return (
                <div key={cat} className="rounded-xl border border-slate-200 dark:border-darkbg-border p-3 hover:border-emerald-300 transition cursor-pointer">
                  <p className="font-semibold text-xs text-slate-800 dark:text-white">{cat}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{count} medicines</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Price Lists Tab */}
      {activeTab === 'Price Lists' && (
        <div className="rounded-2xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg-card overflow-hidden">
          <div className="p-4 border-b border-slate-100 dark:border-darkbg-border flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-700 dark:text-white">Medicine Price Lists</h3>
            <button className="flex items-center gap-1.5 text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700 transition">
              <Download className="h-3 w-3" /> Export
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-darkbg-border/40 text-slate-500">
                  <th className="text-left px-4 py-3 font-semibold">Medicine</th>
                  <th className="text-left px-4 py-3 font-semibold">Category</th>
                  <th className="text-right px-4 py-3 font-semibold">Cost Price</th>
                  <th className="text-right px-4 py-3 font-semibold">Selling Price</th>
                  <th className="text-right px-4 py-3 font-semibold">Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/50">
                {medicines.map(med => {
                  const cost = (med as any).purchase_price || (med as any).buyingPrice || 0;
                  const sell = med.price || 0;
                  const margin = cost > 0 ? Math.round(((sell - cost) / cost) * 100) : 0;
                  return (
                    <tr key={med.id} className="hover:bg-slate-50 dark:hover:bg-darkbg/50">
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{med.name}</td>
                      <td className="px-4 py-3 text-slate-500">{(med as any).category || 'General'}</td>
                      <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{fmtCcy(cost)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-white">{fmtCcy(sell)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-semibold ${margin >= 20 ? 'text-emerald-600' : margin >= 10 ? 'text-amber-500' : 'text-red-500'}`}>
                          {margin}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {medicines.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-10 text-slate-400">No medicines in price list yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Barcode & Labels Tab */}
      {activeTab === 'Barcode & Labels' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-sm text-slate-700 dark:text-white">Select Medicines for Label Printing</h3>
              <button
                disabled={selectedForLabels.size === 0}
                className="flex items-center gap-1.5 text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700 disabled:opacity-40 transition"
              >
                <Printer className="h-3 w-3" /> Print {selectedForLabels.size > 0 ? `(${selectedForLabels.size})` : ''} Labels
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {medicines.map(med => (
                <label key={med.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition ${
                  selectedForLabels.has(med.id)
                    ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20'
                    : 'border-slate-200 dark:border-darkbg-border hover:border-emerald-200'
                }`}>
                  <input
                    type="checkbox"
                    checked={selectedForLabels.has(med.id)}
                    onChange={() => toggleLabel(med.id)}
                    className="accent-emerald-600"
                  />
                  <QrCode className="h-5 w-5 text-slate-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-800 dark:text-white truncate">{med.name}</p>
                    <p className="text-[10px] text-slate-400">{fmtCcy(med.price || 0)} · {(med as any).dosage_form || ''}</p>
                  </div>
                </label>
              ))}
              {medicines.length === 0 && (
                <div className="col-span-3 text-center py-10 text-slate-400 text-xs">
                  Add medicines first to generate barcode labels.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Medicine Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-darkbg-card shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-darkbg-card border-b border-slate-200 dark:border-darkbg-border px-6 py-4 flex items-center justify-between">
              <h2 className="font-bold text-slate-900 dark:text-white">
                {editingId ? 'Edit Medicine' : 'Add New Medicine'}
              </h2>
              <button onClick={() => setShowForm(false)} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-darkbg">
                <XCircle className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { label: 'Brand Name *', key: 'name', type: 'text', placeholder: 'e.g., Amoxil' },
                  { label: 'Generic Name', key: 'generic_name', type: 'text', placeholder: 'e.g., Amoxicillin' },
                  { label: 'Manufacturer', key: 'manufacturer', type: 'text', placeholder: 'Manufacturer name' },
                  { label: 'Category', key: 'category', type: 'text', placeholder: 'e.g., Antibiotics' },
                  { label: 'Strength', key: 'strength', type: 'text', placeholder: 'e.g., 500mg' },
                  { label: 'Unit', key: 'unit', type: 'text', placeholder: 'e.g., Tablets, ml' },
                  { label: 'Purchase Price (Tsh)', key: 'purchase_price', type: 'number', placeholder: '0' },
                  { label: 'Selling Price (Tsh)', key: 'selling_price', type: 'number', placeholder: '0' },
                  { label: 'Reorder Level', key: 'reorder_level', type: 'number', placeholder: '10' },
                ].map(field => (
                  <div key={field.key}>
                    <label className="text-xs text-slate-500 mb-1 block">{field.label}</label>
                    <input
                      type={field.type}
                      value={(form as any)[field.key]}
                      onChange={e => setForm(prev => ({ ...prev, [field.key]: field.type === 'number' ? Number(e.target.value) : e.target.value }))}
                      placeholder={field.placeholder}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    />
                  </div>
                ))}
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Dosage Form</label>
                  <select
                    value={form.dosage_form}
                    onChange={e => setForm(prev => ({ ...prev, dosage_form: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg"
                  >
                    {DOSAGE_FORMS.map(f => <option key={f}>{f}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Storage Conditions</label>
                  <select
                    value={form.storage_conditions}
                    onChange={e => setForm(prev => ({ ...prev, storage_conditions: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg"
                  >
                    {STORAGE_CONDITIONS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex gap-6 pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={form.is_controlled}
                    onChange={e => setForm(prev => ({ ...prev, is_controlled: e.target.checked }))}
                    className="accent-red-500"
                  />
                  <span className="text-slate-700 dark:text-slate-300">Controlled Drug</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={form.requires_prescription}
                    onChange={e => setForm(prev => ({ ...prev, requires_prescription: e.target.checked }))}
                    className="accent-blue-500"
                  />
                  <span className="text-slate-700 dark:text-slate-300">Prescription Required</span>
                </label>
              </div>

              <div>
                <label className="text-xs text-slate-500 mb-1 block">Description / Notes</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-darkbg-border text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-darkbg transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={!form.name}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-40 transition"
                >
                  {editingId ? 'Update Medicine' : 'Add Medicine'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
