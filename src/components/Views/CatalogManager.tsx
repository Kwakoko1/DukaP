import React, { useState, useMemo, useEffect } from 'react';
import { db } from '../../db/dexie';
import { useAuth } from '../../context/AuthContext';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  createCategory, updateCategory, deleteCategory,
  createBrand, updateBrand, deleteBrand,
  mergeDuplicateCategories, mergeDuplicateBrands
} from '../../services/productService';
import {
  Layers, Tag, Package, Search, Plus, Edit, Trash2,
  ChevronRight, Download, Sparkles
} from 'lucide-react';

interface CatalogManagerProps {
  onOpenProductEditor?: (product?: any, prefill?: { category?: string; brand?: string }) => void;
}

export const CatalogManager: React.FC<CatalogManagerProps> = ({ onOpenProductEditor }) => {
  const { currentTenant, currentBranch, currentIndustry, isSuperAdminView } = useAuth();

  // ── Form States ───────────────────────────────────────────────────────────
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [editingCategory, setEditingCategory] = useState<{ id: string; name: string } | null>(null);

  const [brandName, setBrandName] = useState('');
  const [brandDesc, setBrandDesc] = useState('');
  const [editingBrand, setEditingBrand] = useState<{ id: string; name: string } | null>(null);

  // ── Search, Sort, Filter States ───────────────────────────────────────────
  const [categorySearch, setCategorySearch] = useState('');
  const [catFilter, setCatFilter] = useState<'all' | 'active' | 'empty'>('all');
  const [catSort, setCatSort] = useState<'count' | 'name'>('count');
  const [expandedCatAccordion, setExpandedCatAccordion] = useState<string | null>(null);

  const [brandSearch, setBrandSearch] = useState('');
  const [brandFilter, setBrandFilter] = useState<'all' | 'active' | 'empty'>('all');
  const [brandSort, setBrandSort] = useState<'count' | 'name'>('count');
  const [expandedBrandAccordion, setExpandedBrandAccordion] = useState<string | null>(null);

  // ── Multi-Industry Dynamism Strategy ──────────────────────────────────────
  const industryType = (currentIndustry?.name || currentTenant?.plan || 'retail').toLowerCase();

  const taxPlaceholders = useMemo(() => {
    if (industryType.includes('pharm') || industryType.includes('med') || industryType.includes('health')) {
      return {
        catPlaceholder: 'e.g. Antibiotics, Pain Relievers, First Aid, Supplements',
        catDescPlaceholder: 'Prescription medicines, OTC drugs, healthcare supplies',
        brandPlaceholder: 'e.g. Pfizer, GSK, Bayer, Sanofi, Novartis',
        brandDescPlaceholder: 'Pharmaceutical manufacturer, certified lab, or distributor',
        industryLabel: 'Pharmacy / Healthcare'
      };
    }
    if (industryType.includes('bar') || industryType.includes('rest') || industryType.includes('hotel') || industryType.includes('bev')) {
      return {
        catPlaceholder: 'e.g. Beers, Spirits & Whiskeys, Cocktails, Soft Drinks, Wines',
        catDescPlaceholder: 'Beverages, bar mixers, wine cellar stock, spirits',
        brandPlaceholder: 'e.g. Heineken, Serengeti, Diageo, AB InBev, Castle, Smirnoff',
        brandDescPlaceholder: 'Brewery, distillery, or licensed beverage distributor',
        industryLabel: 'Bar & Hospitality'
      };
    }
    if (industryType.includes('hard') || industryType.includes('build') || industryType.includes('const')) {
      return {
        catPlaceholder: 'e.g. Power Tools, Fasteners, Electrical, Plumbing, Cement, Paint',
        catDescPlaceholder: 'Construction materials, workshop tools, fixings & fittings',
        brandPlaceholder: 'e.g. Bosch, Makita, Stanley, DeWalt, Total, Simba Cement',
        brandDescPlaceholder: 'Hardware brand or certified equipment manufacturer',
        industryLabel: 'Hardware & Construction'
      };
    }
    if (industryType.includes('poultry') || industryType.includes('farm') || industryType.includes('agri')) {
      return {
        catPlaceholder: 'e.g. Starter Feeds, Vaccines, Supplements, Farm Equipment, Broilers',
        catDescPlaceholder: 'Livestock nutrition, veterinary supplies, farm gear',
        brandPlaceholder: 'e.g. Kibo Feeds, Twiga Chemical, Farmchem, Tanfeed',
        brandDescPlaceholder: 'Agricultural feed mill or certified veterinary supplier',
        industryLabel: 'Agri & Livestock'
      };
    }
    return {
      catPlaceholder: 'e.g. Smart Phones, Local Beer, Electronics, Apparel, Groceries',
      catDescPlaceholder: 'Electronics, consumer devices, fashion, and retail supplies',
      brandPlaceholder: 'e.g. Apple, Samsung, Nike, Heineken, Safari, Sony, Coca-Cola',
      brandDescPlaceholder: 'Manufacturer, corporate line, or brand origin details',
      industryLabel: 'Retail & General Merchandise'
    };
  }, [industryType]);

  // ── Auto-Hydrate from Server on Load ─────────────────────────────────────
  useEffect(() => {
    const tid = currentTenant?.id;
    (async () => {
      try {
        const queryTid = tid || '';
        // 1. Fetch Categories
        const catRes = await fetch(`/api/categories?tenantId=${encodeURIComponent(queryTid)}&_t=${Date.now()}`);
        if (catRes.ok) {
          const serverCats = await catRes.json();
          if (Array.isArray(serverCats) && serverCats.length > 0) {
            await db.categories.bulkPut(serverCats);
          }
        }

        // 2. Fetch Brands
        const brandRes = await fetch(`/api/brands?tenantId=${encodeURIComponent(queryTid)}&_t=${Date.now()}`);
        if (brandRes.ok) {
          const serverBrands = await brandRes.json();
          if (Array.isArray(serverBrands) && serverBrands.length > 0) {
            await db.brands.bulkPut(serverBrands);
          }
        }

        // 3. Fetch Products
        const prodRes = await fetch(`/api/products?tenantId=${encodeURIComponent(queryTid)}&_t=${Date.now()}`);
        if (prodRes.ok) {
          const serverProds = await prodRes.json();
          if (Array.isArray(serverProds) && serverProds.length > 0) {
            for (const sp of serverProds) {
              await db.products.put({
                ...sp,
                buyingPrice: Number(sp.buying_price || sp.buyingPrice || 0),
                sellingPrice: Number(sp.selling_price || sp.sellingPrice || sp.price || 0),
                price: Number(sp.price || sp.selling_price || 0),
                stock: Number(sp.stock || 0),
                syncStatus: 'SYNCED'
              });
            }
          }
        }
      } catch (e) {
        console.warn('[CatalogManager] Background sync warning:', e);
      }
    })();
  }, [currentTenant?.id, isSuperAdminView]);

  // ── Live Queries for Products, Categories, Brands ────────────────────────
  const products = useLiveQuery(
    async () => {
      if (isSuperAdminView) {
        return await db.products.toArray();
      }
      if (!currentTenant?.id) return await db.products.toArray();
      const local = await db.products.where('tenant_id').equals(currentTenant.id).toArray();
      if (local.length === 0) {
        return await db.products.toArray();
      }
      return local;
    },
    [currentTenant?.id, isSuperAdminView]
  ) || [];

  const allCategories = useLiveQuery(async () => {
    const catMap = new Map<string, number>();

    // Load registered categories
    const registered = (isSuperAdminView || !currentTenant?.id)
      ? await db.categories.toArray()
      : await db.categories.where('tenant_id').equals(currentTenant.id).toArray();
    registered.forEach(c => catMap.set(c.name, 0));

    // Count product associations
    const prods = (isSuperAdminView || !currentTenant?.id)
      ? await db.products.toArray()
      : await db.products.where('tenant_id').equals(currentTenant.id).toArray();
    prods.forEach(p => {
      const cName = (p.category || 'General').trim();
      catMap.set(cName, (catMap.get(cName) || 0) + 1);
    });

    return Array.from(catMap.entries()).map(([name, count]) => ({
      name,
      count,
      record: registered.find(r => r.name.toLowerCase() === name.toLowerCase())
    }));
  }, [currentTenant?.id, isSuperAdminView]) || [];

  const allBrands = useLiveQuery(async () => {
    const brandMap = new Map<string, number>();

    // Load registered brands
    const registered = (isSuperAdminView || !currentTenant?.id)
      ? await db.brands.toArray()
      : await db.brands.where('tenant_id').equals(currentTenant.id).toArray();
    registered.forEach(b => brandMap.set(b.name, 0));

    // Count product associations
    const prods = (isSuperAdminView || !currentTenant?.id)
      ? await db.products.toArray()
      : await db.products.where('tenant_id').equals(currentTenant.id).toArray();
    prods.forEach(p => {
      if (p.brand && p.brand.trim()) {
        const bName = p.brand.trim();
        brandMap.set(bName, (brandMap.get(bName) || 0) + 1);
      }
    });

    return Array.from(brandMap.entries()).map(([name, count]) => ({
      name,
      count,
      record: registered.find(r => r.name.toLowerCase() === name.toLowerCase())
    }));
  }, [currentTenant?.id, isSuperAdminView]) || [];

  // ── Insights Metrics ──────────────────────────────────────────────────────
  const totalCatalogProducts = products.length;
  const uncategorizedCount = products.filter(p => !p.category || p.category === 'General').length;
  const categorizedPercent = totalCatalogProducts > 0
    ? Math.round(((totalCatalogProducts - uncategorizedCount) / totalCatalogProducts) * 100)
    : 100;

  const topCategory = allCategories.length > 0
    ? [...allCategories].sort((a, b) => b.count - a.count)[0]
    : null;

  const topBrand = allBrands.length > 0
    ? [...allBrands].sort((a, b) => b.count - a.count)[0]
    : null;

  // ── Filtered & Sorted Lists ───────────────────────────────────────────────
  const filteredCategories = useMemo(() => {
    return allCategories
      .filter(c => {
        const matchQ = c.name.toLowerCase().includes(categorySearch.toLowerCase());
        const matchF = catFilter === 'all' || (catFilter === 'active' && c.count > 0) || (catFilter === 'empty' && c.count === 0);
        return matchQ && matchF;
      })
      .sort((a, b) => (catSort === 'count' ? b.count - a.count : a.name.localeCompare(b.name)));
  }, [allCategories, categorySearch, catFilter, catSort]);

  const filteredBrands = useMemo(() => {
    return allBrands
      .filter(b => {
        const matchQ = b.name.toLowerCase().includes(brandSearch.toLowerCase());
        const matchF = brandFilter === 'all' || (brandFilter === 'active' && b.count > 0) || (brandFilter === 'empty' && b.count === 0);
        return matchQ && matchF;
      })
      .sort((a, b) => (brandSort === 'count' ? b.count - a.count : a.name.localeCompare(b.name)));
  }, [allBrands, brandSearch, brandFilter, brandSort]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim() || !currentTenant?.id) return;
    const trimmed = catName.trim();

    try {
      if (editingCategory) {
        const oldName = editingCategory.name;
        const catRec = await db.categories.where('tenant_id').equals(currentTenant.id).filter(c => c.name === oldName).first();
        if (catRec) {
          await updateCategory(catRec.id, { name: trimmed, description: catDesc.trim(), industry_type: industryType });
        }

        if (oldName !== trimmed) {
          const prods = await db.products.where('tenant_id').equals(currentTenant.id).toArray();
          const categoryProds = prods.filter(p => p.category === oldName);
          await db.transaction('rw', db.products, async () => {
            for (const p of categoryProds) {
              p.category = trimmed;
              p.syncStatus = 'PENDING';
              await db.products.put(p);
            }
          });
        }
        setEditingCategory(null);
      } else {
        await createCategory({
          name: trimmed,
          description: catDesc.trim(),
          tenant_id: currentTenant.id,
          branch_id: currentBranch?.id || null,
          industry_type: industryType
        });
      }
      setCatName('');
      setCatDesc('');
    } catch (err: any) {
      alert(`Error saving category: ${err?.message || err}`);
    }
  };

  const handleSaveBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!brandName.trim() || !currentTenant?.id) return;
    const trimmed = brandName.trim();

    try {
      if (editingBrand) {
        const oldName = editingBrand.name;
        const brandRec = await db.brands.where('tenant_id').equals(currentTenant.id).filter(b => b.name === oldName).first();
        if (brandRec) {
          await updateBrand(brandRec.id, { name: trimmed, description: brandDesc.trim(), description_corporate_line: brandDesc.trim() });
        }

        if (oldName !== trimmed) {
          const prods = await db.products.where('tenant_id').equals(currentTenant.id).toArray();
          const brandProds = prods.filter(p => p.brand === oldName);
          await db.transaction('rw', db.products, async () => {
            for (const p of brandProds) {
              p.brand = trimmed;
              p.syncStatus = 'PENDING';
              await db.products.put(p);
            }
          });
        }
        setEditingBrand(null);
      } else {
        await createBrand({
          name: trimmed,
          description: brandDesc.trim(),
          description_corporate_line: brandDesc.trim(),
          tenant_id: currentTenant.id,
          branch_id: currentBranch?.id || null
        });
      }
      setBrandName('');
      setBrandDesc('');
    } catch (err: any) {
      alert(`Error saving brand: ${err?.message || err}`);
    }
  };

  const handleDeleteCategoryPrompt = async (name: string, _count?: number) => {
    if (!currentTenant?.id) return;
    const prods = await db.products.where('tenant_id').equals(currentTenant.id).toArray();
    const categoryProds = prods.filter(p => p.category === name || p.category?.toLowerCase() === name.toLowerCase());

    let targetCat = 'General';
    if (categoryProds.length > 0) {
      const otherCats = allCategories.map(c => c.name).filter(cName => cName.toLowerCase() !== name.toLowerCase());
      const promptText = `⚠️ Category "${name}" has ${categoryProds.length} assigned product(s).\n\nSpecify the target category to reassign products to (or press OK for "General"):\n\nAvailable: ${otherCats.join(', ') || 'General'}`;
      const inputVal = prompt(promptText, 'General');
      if (inputVal === null) return;
      targetCat = inputVal.trim() || 'General';
    } else {
      if (!confirm(`Are you sure you want to delete category "${name}"?`)) return;
    }

    try {
      await deleteCategory(name, currentTenant.id, targetCat);
    } catch (err: any) {
      alert(`❌ Failed to delete category: ${err?.message || err}`);
    }
  };

  const handleDeleteBrandPrompt = async (name: string, _count?: number) => {
    if (!currentTenant?.id) return;
    const prods = await db.products.where('tenant_id').equals(currentTenant.id).toArray();
    const brandProds = prods.filter(p => p.brand === name || p.brand?.toLowerCase() === name.toLowerCase());

    let targetBrand = '';
    if (brandProds.length > 0) {
      const otherBrands = allBrands.map(b => b.name).filter(bName => bName.toLowerCase() !== name.toLowerCase());
      const promptText = `⚠️ Brand "${name}" has ${brandProds.length} assigned product(s).\n\nSpecify target brand to reassign (or leave blank to unassign):\n\nAvailable: ${otherBrands.join(', ') || 'Unbranded'}`;
      const inputVal = prompt(promptText, '');
      if (inputVal === null) return;
      targetBrand = inputVal.trim();
    } else {
      if (!confirm(`Are you sure you want to delete brand "${name}"?`)) return;
    }

    try {
      await deleteBrand(name, currentTenant.id, targetBrand);
    } catch (err: any) {
      alert(`❌ Failed to delete brand: ${err?.message || err}`);
    }
  };

  const handleExportCSV = () => {
    let csv = 'Type,Name,Product_Count\n';
    allCategories.forEach(c => {
      csv += `Category,"${c.name.replace(/"/g, '""')}",${c.count}\n`;
    });
    allBrands.forEach(b => {
      csv += `Brand,"${b.name.replace(/"/g, '""')}",${b.count}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `kwakopos_taxonomy_${currentTenant?.id || 'export'}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCleanDuplicates = async () => {
    if (!currentTenant?.id) return;
    if (!confirm('🧹 Scan catalog and automatically merge case-insensitive duplicate Categories and Brands (e.g. "LOCAL BEER" ➔ "Local Beer")? Associated product records will be updated automatically.')) {
      return;
    }
    const catRes = await mergeDuplicateCategories(currentTenant.id);
    const brandRes = await mergeDuplicateBrands(currentTenant.id);
    const totalMerged = catRes.mergedCount + brandRes.mergedCount;
    const totalProductsUpdated = catRes.updatedProductsCount + brandRes.updatedProductsCount;

    if (totalMerged > 0) {
      alert(`✅ Merged ${totalMerged} duplicate category/brand entries and updated ${totalProductsUpdated} product record(s).`);
    } else {
      alert('✨ Catalog hygiene check complete! No duplicate categories or brands found.');
    }
  };

  return (
    <div className="p-6 bg-slate-50/70 dark:bg-darkbg min-h-screen text-slate-700 dark:text-slate-200 font-sans space-y-6">
      
      {/* ── Top Header & Actions ────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-darkbg-card p-5 rounded-2xl border dark:border-darkbg-border shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-extrabold text-slate-900 dark:text-white m-0 flex items-center gap-2">
              <Layers className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
              Categories &amp; Brands Manager
            </h1>
            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
              {taxPlaceholders.industryLabel}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 m-0 mt-1">
            Isolate multi-tenant taxonomies, organize multi-branch catalogs, and manage dynamic brand distribution
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleCleanDuplicates}
            className="px-3.5 py-2 text-xs font-bold rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/50 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 transition flex items-center gap-1.5 cursor-pointer shadow-xs"
            title="Merge case-insensitive duplicate categories and brands"
          >
            <Sparkles className="h-3.5 w-3.5" /> Clean &amp; Merge Duplicates
          </button>
          <button
            onClick={handleExportCSV}
            className="px-3.5 py-2 text-xs font-bold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-darkbg-border transition flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      {/* ── Top Insights Metrics Bar ────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Top Category Card */}
        <div className="bg-white dark:bg-darkbg-card p-4 rounded-xl border dark:border-darkbg-border shadow-xs flex items-center space-x-3.5">
          <div className="p-3 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-xl shrink-0">
            <Layers size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Top Category</p>
            <p className="text-sm font-black text-slate-800 dark:text-white truncate">
              {topCategory ? topCategory.name : 'None'}
            </p>
            <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">
              {topCategory ? `${topCategory.count} products (${totalCatalogProducts > 0 ? Math.round((topCategory.count / totalCatalogProducts) * 100) : 0}% share)` : '0 products'}
            </p>
          </div>
        </div>

        {/* Top Brand Card */}
        <div className="bg-white dark:bg-darkbg-card p-4 rounded-xl border dark:border-darkbg-border shadow-xs flex items-center space-x-3.5">
          <div className="p-3 bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 rounded-xl shrink-0">
            <Tag size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Top Brand</p>
            <p className="text-sm font-black text-slate-800 dark:text-white truncate">
              {topBrand ? topBrand.name : 'None'}
            </p>
            <p className="text-xs text-purple-600 dark:text-purple-400 font-medium">
              {topBrand ? `${topBrand.count} products (${totalCatalogProducts > 0 ? Math.round((topBrand.count / totalCatalogProducts) * 100) : 0}% share)` : '0 products'}
            </p>
          </div>
        </div>

        {/* Catalog Coverage Card */}
        <div className="bg-white dark:bg-darkbg-card p-4 rounded-xl border dark:border-darkbg-border shadow-xs flex items-center space-x-3.5">
          <div className="p-3 bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 rounded-xl shrink-0">
            <Package size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Catalog Coverage</p>
            <p className="text-sm font-black text-slate-800 dark:text-white">
              {totalCatalogProducts} Total Items
            </p>
            <p className={`text-xs font-semibold ${uncategorizedCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {uncategorizedCount > 0 ? `⚠️ ${uncategorizedCount} Uncategorized (${categorizedPercent}% done)` : '✓ 100% Categorized'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Two-Column Management Panels ────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* ── LEFT PANEL: Categories Manager ───────────────────────────── */}
        <div className="bg-white dark:bg-darkbg-card p-6 rounded-2xl border dark:border-darkbg-border shadow-xs space-y-5">
          <div className="flex justify-between items-center pb-3 border-b dark:border-darkbg-border">
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2 m-0">
              <span className="p-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">📁</span>
              Categories Manager
            </h2>
            <span className="text-xs text-slate-400 font-medium">{filteredCategories.length} Categories</span>
          </div>

          {/* Inline Create / Edit Category Form */}
          <form onSubmit={handleSaveCategory} className="space-y-3.5 bg-slate-50 dark:bg-darkbg/50 p-4 rounded-xl border dark:border-darkbg-border">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                {editingCategory ? `Edit Category Name (currently "${editingCategory.name}")` : 'Category Name *'}
              </label>
              <input
                type="text"
                required
                placeholder={taxPlaceholders.catPlaceholder}
                value={catName}
                onChange={e => setCatName(e.target.value)}
                className="w-full h-9 border border-slate-200 dark:border-darkbg-border px-3 rounded-lg text-xs bg-white dark:bg-darkbg dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Description / Scope</label>
              <input
                type="text"
                placeholder={taxPlaceholders.catDescPlaceholder}
                value={catDesc}
                onChange={e => setCatDesc(e.target.value)}
                className="w-full h-9 border border-slate-200 dark:border-darkbg-border px-3 rounded-lg text-xs bg-white dark:bg-darkbg dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                className="flex-1 h-9 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Plus size={14} /> {editingCategory ? 'Update Category' : '+ Save Category'}
              </button>
              {editingCategory && (
                <button
                  type="button"
                  onClick={() => { setEditingCategory(null); setCatName(''); setCatDesc(''); }}
                  className="h-9 px-3 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs rounded-lg transition cursor-pointer"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>

          {/* Search, Filter Pills & Sort */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2 items-center justify-between">
              <div className="relative flex-1 w-full">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search categories…"
                  value={categorySearch}
                  onChange={e => setCategorySearch(e.target.value)}
                  className="h-8 w-full pl-9 pr-3 text-xs rounded-lg border border-slate-200 bg-slate-50 dark:border-darkbg-border dark:bg-darkbg dark:text-white focus:outline-none"
                />
              </div>
              <select
                value={catSort}
                onChange={e => setCatSort(e.target.value as any)}
                className="h-8 text-xs font-semibold rounded-lg border border-slate-200 bg-white px-2 dark:border-darkbg-border dark:bg-darkbg dark:text-white focus:outline-none shrink-0"
              >
                <option value="count">Sort: Most Items</option>
                <option value="name">Sort: A - Z</option>
              </select>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-darkbg/70 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setCatFilter('all')}
                className={`flex-1 py-1 text-[11px] font-bold rounded-lg transition cursor-pointer ${catFilter === 'all' ? 'bg-white dark:bg-darkbg-card text-indigo-600 shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'}`}
              >
                All ({allCategories.length})
              </button>
              <button
                type="button"
                onClick={() => setCatFilter('active')}
                className={`flex-1 py-1 text-[11px] font-bold rounded-lg transition cursor-pointer ${catFilter === 'active' ? 'bg-white dark:bg-darkbg-card text-indigo-600 shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'}`}
              >
                With Items ({allCategories.filter(c => c.count > 0).length})
              </button>
              <button
                type="button"
                onClick={() => setCatFilter('empty')}
                className={`flex-1 py-1 text-[11px] font-bold rounded-lg transition cursor-pointer ${catFilter === 'empty' ? 'bg-white dark:bg-darkbg-card text-indigo-600 shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'}`}
              >
                Empty ({allCategories.filter(c => c.count === 0).length})
              </button>
            </div>

            {/* Category Items List with Product Drawer */}
            <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
              {filteredCategories.map(c => {
                const isExpanded = expandedCatAccordion === c.name;
                const catProducts = products.filter(p => p.category === c.name);

                return (
                  <div
                    key={c.name}
                    className="border dark:border-darkbg-border rounded-xl bg-slate-50/70 dark:bg-darkbg/40 p-2.5 transition space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div
                        className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer select-none"
                        onClick={() => setExpandedCatAccordion(isExpanded ? null : c.name)}
                      >
                        <ChevronRight
                          size={14}
                          className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-90 text-indigo-600' : ''}`}
                        />
                        <div
                          className="h-8 w-8 rounded-lg shrink-0 flex items-center justify-center text-white font-bold text-xs shadow-xs"
                          style={{ background: `hsl(${(c.name.charCodeAt(0) * 37) % 360}, 60%, 48%)` }}
                        >
                          {c.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-xs text-slate-800 dark:text-slate-100 truncate">{c.name}</div>
                          <div className="text-[11px] text-slate-400 font-medium">{c.count} product{c.count !== 1 ? 's' : ''}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          title="Edit Category"
                          onClick={() => { setEditingCategory({ id: c.name, name: c.name }); setCatName(c.name); setCatDesc(''); }}
                          className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition cursor-pointer"
                        >
                          <Edit size={14} />
                        </button>
                        <button
                          title={`Delete Category "${c.name}"`}
                          onClick={() => handleDeleteCategoryPrompt(c.name, c.count)}
                          className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition cursor-pointer"
                        >
                          <Trash2 size={14} />
                        </button>
                        {onOpenProductEditor && (
                          <button
                            onClick={() => onOpenProductEditor(null, { category: c.name })}
                            className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 transition cursor-pointer"
                          >
                            + Add Product
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Expandable Product Inspector Drawer */}
                    {isExpanded && (
                      <div className="p-3 bg-white dark:bg-darkbg rounded-xl border border-indigo-100 dark:border-indigo-900/40 space-y-2 text-xs">
                        <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 pb-1 border-b border-slate-100 dark:border-darkbg-border">
                          <span>Products in "{c.name}"</span>
                          <span>{catProducts.length} Item(s)</span>
                        </div>
                        <div className="max-h-48 overflow-y-auto space-y-1">
                          {catProducts.map(p => (
                            <div
                              key={p.id}
                              className="flex items-center justify-between py-1 px-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded text-[11px]"
                            >
                              <span className="font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[200px]">{p.name}</span>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-slate-400 text-[10px]">{p.sku || 'No SKU'}</span>
                                <span className="font-bold text-indigo-600 dark:text-indigo-400">{Number(p.sellingPrice || p.price || 0).toLocaleString()}</span>
                                {onOpenProductEditor && (
                                  <button
                                    onClick={() => onOpenProductEditor(p)}
                                    className="text-indigo-600 hover:underline text-[10px] font-bold cursor-pointer"
                                  >
                                    Edit
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                          {catProducts.length === 0 && (
                            <div className="text-center py-2 text-slate-400 italic text-[11px]">
                              No products in this category yet.
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {filteredCategories.length === 0 && (
                <div className="text-center py-10 text-slate-400 italic text-xs">
                  No categories found.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── RIGHT PANEL: Brands Manager ─────────────────────────────── */}
        <div className="bg-white dark:bg-darkbg-card p-6 rounded-2xl border dark:border-darkbg-border shadow-xs space-y-5">
          <div className="flex justify-between items-center pb-3 border-b dark:border-darkbg-border">
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2 m-0">
              <span className="p-1 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400">🏷️</span>
              Brands Manager
            </h2>
            <span className="text-xs text-slate-400 font-medium">{filteredBrands.length} Brands</span>
          </div>

          {/* Inline Create / Edit Brand Form */}
          <form onSubmit={handleSaveBrand} className="space-y-3.5 bg-slate-50 dark:bg-darkbg/50 p-4 rounded-xl border dark:border-darkbg-border">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                {editingBrand ? `Edit Brand Name (currently "${editingBrand.name}")` : 'Brand Name *'}
              </label>
              <input
                type="text"
                required
                placeholder={taxPlaceholders.brandPlaceholder}
                value={brandName}
                onChange={e => setBrandName(e.target.value)}
                className="w-full h-9 border border-slate-200 dark:border-darkbg-border px-3 rounded-lg text-xs bg-white dark:bg-darkbg dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Description / Corporate Line</label>
              <input
                type="text"
                placeholder={taxPlaceholders.brandDescPlaceholder}
                value={brandDesc}
                onChange={e => setBrandDesc(e.target.value)}
                className="w-full h-9 border border-slate-200 dark:border-darkbg-border px-3 rounded-lg text-xs bg-white dark:bg-darkbg dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                className="flex-1 h-9 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-lg transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Plus size={14} /> {editingBrand ? 'Update Brand' : '+ Save Brand'}
              </button>
              {editingBrand && (
                <button
                  type="button"
                  onClick={() => { setEditingBrand(null); setBrandName(''); setBrandDesc(''); }}
                  className="h-9 px-3 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs rounded-lg transition cursor-pointer"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>

          {/* Search, Filter Pills & Sort */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2 items-center justify-between">
              <div className="relative flex-1 w-full">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search brands…"
                  value={brandSearch}
                  onChange={e => setBrandSearch(e.target.value)}
                  className="h-8 w-full pl-9 pr-3 text-xs rounded-lg border border-slate-200 bg-slate-50 dark:border-darkbg-border dark:bg-darkbg dark:text-white focus:outline-none"
                />
              </div>
              <select
                value={brandSort}
                onChange={e => setBrandSort(e.target.value as any)}
                className="h-8 text-xs font-semibold rounded-lg border border-slate-200 bg-white px-2 dark:border-darkbg-border dark:bg-darkbg dark:text-white focus:outline-none shrink-0"
              >
                <option value="count">Sort: Most Items</option>
                <option value="name">Sort: A - Z</option>
              </select>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-darkbg/70 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setBrandFilter('all')}
                className={`flex-1 py-1 text-[11px] font-bold rounded-lg transition cursor-pointer ${brandFilter === 'all' ? 'bg-white dark:bg-darkbg-card text-purple-600 shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'}`}
              >
                All ({allBrands.length})
              </button>
              <button
                type="button"
                onClick={() => setBrandFilter('active')}
                className={`flex-1 py-1 text-[11px] font-bold rounded-lg transition cursor-pointer ${brandFilter === 'active' ? 'bg-white dark:bg-darkbg-card text-purple-600 shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'}`}
              >
                With Items ({allBrands.filter(b => b.count > 0).length})
              </button>
              <button
                type="button"
                onClick={() => setBrandFilter('empty')}
                className={`flex-1 py-1 text-[11px] font-bold rounded-lg transition cursor-pointer ${brandFilter === 'empty' ? 'bg-white dark:bg-darkbg-card text-purple-600 shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'}`}
              >
                Empty ({allBrands.filter(b => b.count === 0).length})
              </button>
            </div>

            {/* Brand Items List with Product Drawer */}
            <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
              {filteredBrands.map(b => {
                const isExpanded = expandedBrandAccordion === b.name;
                const brandProducts = products.filter(p => p.brand === b.name);

                return (
                  <div
                    key={b.name}
                    className="border dark:border-darkbg-border rounded-xl bg-slate-50/70 dark:bg-darkbg/40 p-2.5 transition space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div
                        className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer select-none"
                        onClick={() => setExpandedBrandAccordion(isExpanded ? null : b.name)}
                      >
                        <ChevronRight
                          size={14}
                          className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-90 text-purple-600' : ''}`}
                        />
                        <div
                          className="h-8 w-8 rounded-lg shrink-0 flex items-center justify-center text-white font-bold text-xs shadow-xs"
                          style={{ background: `hsl(${(b.name.charCodeAt(0) * 83) % 360}, 60%, 48%)` }}
                        >
                          {b.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-xs text-slate-800 dark:text-slate-100 truncate">{b.name}</div>
                          <div className="text-[11px] text-slate-400 font-medium">{b.count} product{b.count !== 1 ? 's' : ''}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          title="Edit Brand"
                          onClick={() => { setEditingBrand({ id: b.name, name: b.name }); setBrandName(b.name); setBrandDesc(''); }}
                          className="p-1.5 text-slate-500 hover:text-purple-600 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition cursor-pointer"
                        >
                          <Edit size={14} />
                        </button>
                        <button
                          title={`Delete Brand "${b.name}"`}
                          onClick={() => handleDeleteBrandPrompt(b.name, b.count)}
                          className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition cursor-pointer"
                        >
                          <Trash2 size={14} />
                        </button>
                        {onOpenProductEditor && (
                          <button
                            onClick={() => onOpenProductEditor(null, { brand: b.name })}
                            className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800 transition cursor-pointer"
                          >
                            + Add Product
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Expandable Product Inspector Drawer */}
                    {isExpanded && (
                      <div className="p-3 bg-white dark:bg-darkbg rounded-xl border border-purple-100 dark:border-purple-900/40 space-y-2 text-xs">
                        <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 pb-1 border-b border-slate-100 dark:border-darkbg-border">
                          <span>Products under "{b.name}"</span>
                          <span>{brandProducts.length} Item(s)</span>
                        </div>
                        <div className="max-h-48 overflow-y-auto space-y-1">
                          {brandProducts.map(p => (
                            <div
                              key={p.id}
                              className="flex items-center justify-between py-1 px-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded text-[11px]"
                            >
                              <span className="font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[200px]">{p.name}</span>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-slate-400 text-[10px]">{p.sku || 'No SKU'}</span>
                                <span className="font-bold text-purple-600 dark:text-purple-400">{Number(p.sellingPrice || p.price || 0).toLocaleString()}</span>
                                {onOpenProductEditor && (
                                  <button
                                    onClick={() => onOpenProductEditor(p)}
                                    className="text-purple-600 hover:underline text-[10px] font-bold cursor-pointer"
                                  >
                                    Edit
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                          {brandProducts.length === 0 && (
                            <div className="text-center py-2 text-slate-400 italic text-[11px]">
                              No products under this brand yet.
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {filteredBrands.length === 0 && (
                <div className="text-center py-10 text-slate-400 italic text-xs">
                  No brands found.
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
