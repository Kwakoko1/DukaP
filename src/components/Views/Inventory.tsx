import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useModule } from '../../context/ModuleContext';
import { useAuth } from '../../context/AuthContext';
import { useSyncState } from '../../context/SyncContext';
import {
  db, type Product, type ProductVariant, type StockLedgerEntry,
  type BatchLot, type StockTransfer,
  type PhysicalCount,
  recordStockMovement,
  syncParentStock,
} from '../../db/dexie';
import {
  ProductService, cleanDuplicateVariants, getVariantAttrSig,
  createCategory, deleteCategory, createBrand, isParentProduct
} from '../../services/productService';
import { Html5Qrcode } from 'html5-qrcode';
import {
  getDashboardKPIs, get7DayMovements, generateValuationReport,
  refreshExpiryAlerts, evaluateReorderRules, receiveBatchLot,
  addSerialNumbers, createStockTransfer, submitTransfer, receiveTransfer,
  createPhysicalCount, updateCountItem, submitCountForApproval, approvePhysicalCount,
  saveReorderRule, getReorderReport, getSlowMovingReport, getNegativeStockReport,
  logWastage, getBranchValuationSummary, getProductValuationMetrics, getHistoricalValuation,
  type InventoryKPIs, type DailyMovement, type ReorderAlert,
  type ProductValuationMetric, type BranchValuationSummary, type HistoricalValuationSnapshot,
} from '../../services/inventoryService';
import { useLiveQuery } from 'dexie-react-hooks';
import { SyncDashboard } from './SyncDashboard';
import { CatalogManager } from './CatalogManager';
import { DEFAULT_SECURITY_CONFIG, type SecurityConfig } from '../../services/settingsService';
import { Dialog, Badge, Input, Button } from '../UI/custom-ui';
import {
  Plus, Search, Edit, Trash2, Sliders,
  AlertTriangle, Package, Layers, BarChart3, Tag, Clock,
  X, CheckCircle2, ArrowLeftRight, ClipboardList, FileText,
  RefreshCw, TrendingUp, TrendingDown, Archive, AlertCircle, Zap,
  ChevronRight, Barcode, Hash, Calendar, Target,
  Send, Check, Eye,
  ShoppingCart, Activity, DollarSign, Shield, Camera, Upload, Truck,
} from 'lucide-react';
import './Inventory.css';

export function generateAutoSku(name?: string, category?: string, idOrSeed?: string): string {
  const cleanName = (name || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'PROD';
  const cleanCat  = (category || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 3).toUpperCase() || 'GEN';
  const seed = idOrSeed ? idOrSeed.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase() : Math.floor(1000 + Math.random() * 9000).toString();
  return `SKU-${cleanName}-${cleanCat}-${seed}`;
}

// ─── Types ─────────────────────────────────────────────────────────────────
type InventoryTab = 'dashboard' | 'products' | 'categories' | 'stockSync' | 'ledger' | 'adjustments' | 'transfers' | 'alerts' | 'count' | 'reports' | 'recipes' | 'wastage';
export type ProductTab = 'general' | 'pricing' | 'inventory' | 'variants' | 'images' | 'suppliers' | 'batch' | 'serials' | 'reorder' | 'history';
type ReportType = 'balance' | 'movements' | 'valuation' | 'batch' | 'expiry' | 'reorder' | 'slow' | 'negative';

const PRODUCT_TABS: { id: ProductTab; label: string; icon: React.ReactNode }[] = [
  { id: 'general',   label: 'General',   icon: <Package className="h-3.5 w-3.5" /> },
  { id: 'pricing',   label: 'Pricing',   icon: <Tag className="h-3.5 w-3.5" /> },
  { id: 'inventory', label: 'Inventory', icon: <BarChart3 className="h-3.5 w-3.5" /> },
  { id: 'variants',  label: 'Variants',  icon: <Layers className="h-3.5 w-3.5" /> },
  { id: 'images',    label: 'Images',    icon: <Camera className="h-3.5 w-3.5" /> },
  { id: 'suppliers', label: 'Suppliers', icon: <Truck className="h-3.5 w-3.5" /> },
  { id: 'batch',     label: 'Batch/Lot', icon: <Archive className="h-3.5 w-3.5" /> },
  { id: 'serials',   label: 'Serials',   icon: <Hash className="h-3.5 w-3.5" /> },
  { id: 'reorder',   label: 'Reorder',   icon: <Target className="h-3.5 w-3.5" /> },
  { id: 'history',   label: 'History',   icon: <Clock className="h-3.5 w-3.5" /> },
];

const INBOUND_TYPES = new Set(['OPENING_STOCK','PURCHASE_RECEIVE','CUSTOMER_RETURN','TRANSFER_IN','PRODUCTION_OUTPUT','ADJUSTMENT_GAIN']);

const blankVariant = (productId: string, tenantId: string, branchId: string): ProductVariant => ({
  id: `var-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  productId, sku: '', barcode: '', stock: 0, reservedStock: 0,
  reorderLevel: 5, status: 'Active', attributes: {},
  tenant_id: tenantId, branch_id: branchId,
  inheritBuyingPrice: true, inheritSellingPrice: true,
});

function parseTs(val: any): Date | null {
  if (!val) return null;
  if (typeof val === 'number') {
    return new Date(val < 1e11 ? val * 1000 : val);
  }
  if (typeof val === 'string') {
    const parsedNum = Number(val);
    if (!isNaN(parsedNum) && parsedNum > 0) {
      return new Date(parsedNum < 1e11 ? parsedNum * 1000 : parsedNum);
    }
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d;
  }
  if (val instanceof Date && !isNaN(val.getTime())) return val;
  return null;
}

function fmtNum(n: number | string): string {
  const num = typeof n === 'number' ? n : parseFloat(String(n || 0)) || 0;
  return (isNaN(num) ? 0 : num).toLocaleString('en-US', { maximumFractionDigits: 0 });
}
function fmtCcy(n: any): string {
  const num = typeof n === 'number' ? n : parseFloat(String(n || 0)) || 0;
  if (isNaN(num) || !isFinite(num)) return 'Tsh 0';
  return `Tsh ${num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
function fmtDate(ms: any): string {
  const d = parseTs(ms);
  if (!d) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
}
function fmtDateTime(ms: any): string {
  const d = parseTs(ms);
  if (!d) return '—';
  const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
  const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  return `${dateStr}, ${timeStr}`;
}

// ─── Main Component ─────────────────────────────────────────────────────────
export const Inventory: React.FC = () => {
  const { activeModule, activeTab } = useModule();
  const { currentBranch, currentTenant, hasPermission, user, isSuperAdminView } = useAuth();
  const { queueOperation, isOnline, syncFromServer, syncData } = useSyncState();

  // ── Top-level tab ──────────────────────────────────────────────────────────
  const [invTab, setInvTab] = useState<InventoryTab>('dashboard');

  // ── Map sidebar activeTab → internal invTab on every navigation ─────────
  useEffect(() => {
    if (!activeTab) return;
    const norm = activeTab.toLowerCase().trim();
    if (norm === 'products' || norm === 'medicines' || norm === 'stock register') {
      setInvTab('products');
    } else if (norm.includes('categor') || norm.includes('brand')) {
      setInvTab('categories');
    } else if (norm.includes('bundle') || norm.includes('kit') || norm.includes('recipe')) {
      setInvTab('recipes' as any);
    } else if (norm.includes('adjustment')) {
      setInvTab('adjustments');
    } else if (norm.includes('transfer')) {
      setInvTab('transfers');
    } else if (norm.includes('sync')) {
      setInvTab('stockSync');
    } else if (norm.includes('alert')) {
      setInvTab('alerts');
    } else if (norm.includes('count')) {
      setInvTab('count');
    } else if (norm.includes('ledger') || norm.includes('drilldown')) {
      setInvTab('ledger');
    } else if (norm.includes('report')) {
      setInvTab('reports');
    } else if (norm.includes('overview') || norm === 'inventory' || norm === 'beverage inventory' || norm === 'dashboard' || norm === 'inventory dashboard') {
      setInvTab('dashboard');
    }
  }, [activeTab]);

  // ── Barcode Printer States ────────────────────────────────────────────────
  const [isBarcodePrinterOpen, setIsBarcodePrinterOpen] = useState(false);
  const [bcProductId, setBcProductId] = useState('');
  const [bcVariantId, setBcVariantId] = useState('');
  const [bcQty, setBcQty] = useState(12);
  const [bcLayout, setBcLayout] = useState<'single' | 'sheet'>('single');

  // ── Bulk CSV Importer States ─────────────────────────────────────────────
  const [isCsvImportOpen, setIsCsvImportOpen] = useState(false);
  const [csvData, setCsvData] = useState('');
  const [csvLoading, setCsvLoading] = useState(false);
  const [csvParsedRows, setCsvParsedRows] = useState<any[]>([]);
  const [csvHasParsed, setCsvHasParsed] = useState(false);
  const [csvDragActive, setCsvDragActive] = useState(false);
  const csvFileInputRef = useRef<HTMLInputElement>(null);

  // ── Categories & Brands Management States ──────────────────────────────────
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categorySearch, setCategorySearch] = useState('');

  // ── Camera Barcode Scanner States ──────────────────────────────────────────
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState(false);
  const [scannerTargetField, setScannerTargetField] = useState<'product' | 'variant'>('product');
  const [activeVariantIndexForScan, setActiveVariantIndexForScan] = useState<number | null>(null);
  const [scannerError, setScannerError] = useState('');

  // Start & Stop Html5Qrcode Barcode Scanner Effect
  useEffect(() => {
    let html5Qrcode: Html5Qrcode | null = null;
    if (isCameraScannerOpen) {
      const timer = setTimeout(() => {
        const qrElem = document.getElementById('barcode-camera-reader');
        if (qrElem) {
          html5Qrcode = new Html5Qrcode('barcode-camera-reader');
          html5Qrcode.start(
            { facingMode: 'environment' },
            {
              fps: 15,
              qrbox: { width: 260, height: 180 }
            },
            async (scannedText) => {
              try {
                const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(880, audioCtx.currentTime);
                gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start();
                osc.stop(audioCtx.currentTime + 0.15);
              } catch (e) {}

              if (html5Qrcode && html5Qrcode.isScanning) {
                try { await html5Qrcode.stop(); } catch (e) {}
              }

              const trimmed = scannedText.trim();
              if (scannerTargetField === 'product') {
                setPBarcode(trimmed);
              }

              setIsCameraScannerOpen(false);
            },
            () => {}
          ).catch(err => {
            console.warn('Camera scanner fallback:', err);
            if (html5Qrcode) {
              html5Qrcode.start(
                { facingMode: 'user' },
                { fps: 15, qrbox: { width: 260, height: 180 } },
                async (scannedText) => {
                  const trimmed = scannedText.trim();
                  if (scannerTargetField === 'product') {
                    setPBarcode(trimmed);
                  }
                  if (html5Qrcode && html5Qrcode.isScanning) {
                    try { await html5Qrcode.stop(); } catch (e) {}
                  }
                  setIsCameraScannerOpen(false);
                },
                () => {}
              ).catch(() => {
                setScannerError('Camera access denied or device has no camera.');
              });
            }
          });
        }
      }, 300);

      return () => {
        clearTimeout(timer);
        if (html5Qrcode && html5Qrcode.isScanning) {
          html5Qrcode.stop().catch(e => console.error(e));
        }
      };
    }
  }, [isCameraScannerOpen, scannerTargetField, activeVariantIndexForScan]);

  // ── Permissions ────────────────────────────────────────────────────────────
  const canEdit        = hasPermission('inventory.product.create');
  const canAdjust      = hasPermission('inventory.stock.adjust');
  const canTransfer    = hasPermission('inventory.stock.transfer');

  // Toggle state for optional/advanced pricing fields (Wholesale, VIP, Online, Tax Rate) defaulting to false (OFF)
  const [showAdvancedPricing, setShowAdvancedPricing] = useState<boolean>(() => {
    try {
      return localStorage.getItem('dukapos_show_advanced_pricing') === 'true';
    } catch {
      return false;
    }
  });

  // Background Server Hydration Hook (guarantees local Dexie is never empty)
  useEffect(() => {
    const tid = currentTenant?.id;
    (async () => {
      try {
        const queryTid = tid || '';
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
                hasVariants: Boolean(sp.hasVariants ?? sp.has_variants ?? false),
                has_variants: Boolean(sp.hasVariants ?? sp.has_variants ?? false),
                syncStatus: 'SYNCED'
              });
            }
          }
        }
      } catch (_) {}
    })();
  }, [currentTenant?.id, isSuperAdminView]);

  // Load ALL products for this tenant — branch filtering happens in the UI.
  const products = useLiveQuery(async () => {
    if (isSuperAdminView) {
      return await db.products
        .filter(p => !p.deletedAt && !(p as any).deleted_at && p.status !== 'Inactive')
        .toArray();
    }
    if (!currentTenant?.id) {
      return await db.products
        .filter(p => !p.deletedAt && !(p as any).deleted_at && p.status !== 'Inactive')
        .toArray();
    }
    const local = await db.products
      .where('tenant_id').equals(currentTenant.id)
      .and(p => !p.deletedAt && !(p as any).deleted_at && p.status !== 'Inactive')
      .toArray();
    if (local.length === 0) {
      return await db.products
        .filter(p => !p.deletedAt && !(p as any).deleted_at && p.status !== 'Inactive')
        .toArray();
    }
    return local;
  }, [currentTenant?.id, isSuperAdminView]) || [];

  const productVariants = useLiveQuery(async () => {
    const validProds = (isSuperAdminView || !currentTenant?.id)
      ? await db.products.filter(p => !p.deletedAt && !(p as any).deleted_at && p.status !== 'Inactive').toArray()
      : await db.products.where('tenant_id').equals(currentTenant.id).and(p => !p.deletedAt && !(p as any).deleted_at && p.status !== 'Inactive').toArray();
    const validIds = new Set(validProds.map(p => p.id));
    const vars = (isSuperAdminView || !currentTenant?.id)
      ? await db.productVariants.toArray()
      : await db.productVariants.where('tenant_id').equals(currentTenant.id).toArray();
    return vars.filter(v => validIds.has(v.productId));
  }, [currentTenant?.id, isSuperAdminView]) || [];

  const allBranches = useLiveQuery(() => db.branches.where('tenant_id').equals(currentTenant?.id || '').toArray(), [currentTenant?.id]) || [];

  const securitySetting = useLiveQuery(() =>
    db.appSettings.where('[tenantId+namespace]').equals([currentTenant?.id || '', 'SECURITY']).first()
  , [currentTenant?.id]);

  // Live query for brands (Multi-Tenant, Multi-Branch & Multi-Module Scoped)
  const allBrands = useLiveQuery(async () => {
    const prods = (isSuperAdminView || !currentTenant?.id)
      ? await db.products.filter(p => !p.deletedAt && !(p as any).deleted_at && p.status !== 'Inactive').toArray()
      : await db.products.where('tenant_id').equals(currentTenant.id).filter(p => {
          if (p.deletedAt || (p as any).deleted_at || p.status === 'Inactive') return false;
          const pMod = (p.module || 'Retail').toLowerCase();
          const aMod = (activeModule || 'Retail').toLowerCase();
          const matchMod = pMod === aMod || pMod === 'all' || !p.module;
          const br = p.branch_id || p.branchId;
          return matchMod && (!br || br === currentBranch.id || br === 'all' || br.includes('hq'));
        }).toArray();

    const brandSet = new Map<string, number>();
    prods.forEach(p => {
      if (p.brand && p.brand.trim()) {
        const b = p.brand.trim();
        brandSet.set(b, (brandSet.get(b) || 0) + 1);
      }
    });

    try {
      const dbBrands = (isSuperAdminView || !currentTenant?.id)
        ? await db.brands.toArray()
        : await db.brands.where('tenant_id').equals(currentTenant.id).toArray();
      dbBrands.forEach(b => {
        if (b.name && b.name.trim() && !brandSet.has(b.name.trim())) {
          brandSet.set(b.name.trim(), 0);
        }
      });
    } catch {}
    return Array.from(brandSet.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
  }, [currentTenant?.id, currentBranch?.id, activeModule, isSuperAdminView]) || [];

  // Live query for categories (Multi-Tenant, Multi-Branch & Multi-Module Scoped)
  const allCategories = useLiveQuery(async () => {
    const prods = (isSuperAdminView || !currentTenant?.id)
      ? await db.products.filter(p => !p.deletedAt && !(p as any).deleted_at && p.status !== 'Inactive').toArray()
      : await db.products.where('tenant_id').equals(currentTenant.id).filter(p => {
          if (p.deletedAt || (p as any).deleted_at || p.status === 'Inactive') return false;
          const pMod = (p.module || 'Retail').toLowerCase();
          const aMod = (activeModule || 'Retail').toLowerCase();
          const matchMod = pMod === aMod || pMod === 'all' || !p.module;
          const br = p.branch_id || p.branchId;
          return matchMod && (!br || br === currentBranch.id || br === 'all' || br.includes('hq'));
        }).toArray();

    const catSet = new Map<string, number>();
    prods.forEach(p => {
      if (p.category && p.category.trim()) {
        const c = p.category.trim();
        catSet.set(c, (catSet.get(c) || 0) + 1);
      }
    });

    try {
      const dbCats = (isSuperAdminView || !currentTenant?.id)
        ? await db.categories.toArray()
        : await db.categories.where('tenant_id').equals(currentTenant.id).toArray();
      dbCats.forEach(c => {
        if (c.name && c.name.trim() && !catSet.has(c.name.trim())) {
          catSet.set(c.name.trim(), 0);
        }
      });
    } catch {}
    return Array.from(catSet.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
  }, [currentTenant?.id, currentBranch?.id, activeModule, isSuperAdminView]) || [];

  // Live query for real suppliers from the Purchasing module
  const allSuppliers = useLiveQuery(
    () => db.suppliers.where('tenant_id').equals(currentTenant.id).filter(s => s.status === 'Active').toArray(),
    [currentTenant.id]
  ) || [];

  // Recipe sub-tab states
  const [selectedRecipeProduct, setSelectedRecipeProduct] = useState('');
  const [recipeName, setRecipeName] = useState('');
  const [recipeYield, setRecipeYield] = useState(1);
  const [recipeLines, setRecipeLines] = useState<Array<{ ingredientId: string; qty: number; unit: string }>>([
    { ingredientId: '', qty: 1, unit: 'ml' }
  ]);
  const [isRecipeModalOpen, setIsRecipeModalOpen] = useState(false);

  // Wastage sub-tab states
  const [wastageProductId, setWastageProductId] = useState('');
  const [wastageQty, setWastageQty] = useState(1);
  const [wastageUnit, setWastageUnit] = useState('ml');
  const [wastageReason, setWastageReason] = useState<'SPILL' | 'BAD POUR' | 'EXPIRED' | 'FREE TASTING' | 'DAMAGED' | 'STAFF DRINK' | 'OTHER'>('SPILL');
  const [wastageNotes, setWastageNotes] = useState('');

  // Live Queries for Recipes and Wastages
  const liveRecipes = useLiveQuery(async () => {
    if (!db.recipes) return [];
    const recs = await db.recipes.where('tenant_id').equals(currentTenant.id).toArray();
    const withDetails = [];
    for (const r of recs) {
      const prod = await db.products.get(r.product_id);
      const items = await db.recipeItems.where('recipe_id').equals(r.id).toArray();
      const itemsWithProd = [];
      for (const item of items) {
        const ingProd = await db.products.get(item.ingredient_product_id);
        itemsWithProd.push({ ...item, ingredientName: ingProd?.name || 'Unknown Ingredient' });
      }
      withDetails.push({ ...r, productName: prod?.name || 'Unknown Product', items: itemsWithProd });
    }
    return withDetails;
  }, [currentTenant.id]);

  const liveWastages = useLiveQuery(async () => {
    if (!db.wastageLogs) return [];
    const logs = await db.wastageLogs.where('tenant_id').equals(currentTenant.id).toArray();
    const sorted = logs.sort((a, b) => b.timestamp - a.timestamp);
    const withDetails = [];
    for (const l of sorted) {
      const prod = await db.products.get(l.product_id);
      const buyingPrice = prod?.buyingPrice || prod?.price || 0;
      withDetails.push({ ...l, productName: prod?.name || 'Unknown Product', buyingPrice });
    }
    return withDetails;
  }, [currentTenant.id]);

  const handleSaveRecipe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecipeProduct) {
      alert('Please select a product for the recipe.');
      return;
    }

    const recipeId = `rec-${Date.now()}`;
    await db.recipes.add({
      id: recipeId,
      tenant_id: currentTenant.id,
      product_id: selectedRecipeProduct,
      name: recipeName || 'Standard Recipe',
      yield_quantity: recipeYield
    });

    for (const line of recipeLines) {
      if (line.ingredientId) {
        await db.recipeItems.add({
          id: `ri-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          tenant_id: currentTenant.id,
          recipe_id: recipeId,
          ingredient_product_id: line.ingredientId,
          quantity: line.qty,
          unit: line.unit
        });
      }
    }

    // Set product's tracking mode to composite
    await db.products.update(selectedRecipeProduct, {
      inventory_tracking_mode: 'COMPOSITE_RECIPE'
    } as any);

    setIsRecipeModalOpen(false);
    setSelectedRecipeProduct('');
    setRecipeName('');
    setRecipeLines([{ ingredientId: '', qty: 1, unit: 'ml' }]);
    alert('Recipe saved successfully.');
  };

  const handleSaveWastage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wastageProductId) {
      alert('Please select a product.');
      return;
    }

    await logWastage({
      tenant_id: currentTenant.id,
      product_id: wastageProductId,
      quantity: wastageQty,
      unit: wastageUnit,
      reason: wastageReason,
      employee_id: user?.name || 'System POS',
      approved_by: 'Supervisor'
    });

    setWastageProductId('');
    setWastageQty(1);
    setWastageNotes('');
    alert('Wastage logged and stock ledger updated.');
  };

  // ── Barcode & CSV Importer Helpers ──────────────────────────────────────────
  const selectableItems = useMemo(() => {
    const list: Array<{ id: string; name: string; sku: string; price: number; variantId?: string }> = [];
    products.forEach(p => {
      if (p.hasVariants) {
        const vars = productVariants.filter(v => v.productId === p.id);
        vars.forEach(v => {
          const varLabel = Object.entries(v.attributes).map(([k, val]) => `${k}: ${val}`).join(' / ');
          list.push({
            id: p.id,
            name: `${p.name} (${varLabel})`,
            sku: v.sku || `SKU-VAR-${v.id.slice(-4).toUpperCase()}`,
            price: v.sellingPrice || p.sellingPrice || p.price || 0,
            variantId: v.id
          });
        });
      } else {
        list.push({
          id: p.id,
          name: p.name,
          sku: p.sku || p.id.slice(-8).toUpperCase(),
          price: p.sellingPrice || p.price || 0
        });
      }
    });
    return list;
  }, [products, productVariants]);

  const selectedBcItem = useMemo(() => {
    return selectableItems.find(i => i.id === bcProductId && (bcVariantId ? i.variantId === bcVariantId : !i.variantId));
  }, [selectableItems, bcProductId, bcVariantId]);

  const handlePrintLabels = () => {
    if (!selectedBcItem) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to print barcode labels.');
      return;
    }
    
    const labelHtml = `
      <div style="border: 1.5px solid #000; padding: 10px; border-radius: 4px; width: 180px; text-align: center; font-family: 'Courier New', monospace; background: #fff; margin: 10px; display: inline-block; box-sizing: border-box;">
        <div style="font-size: 8px; font-weight: bold; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 2px;">* DukaPos Retail *</div>
        <div style="font-size: 11px; font-weight: bold; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-bottom: 4px;">${selectedBcItem.name}</div>
        <div style="font-size: 12px; font-weight: bold; margin-bottom: 6px;">Tsh ${selectedBcItem.price.toLocaleString()}</div>
        <div style="display: flex; justify-content: center; align-items: stretch; height: 35px; margin-bottom: 3px; gap: 1.5px; background: #fff; padding: 2px 0;">
          ${(selectedBcItem.sku || '').split('').map((char) => {
            const code = char.charCodeAt(0);
            const w1 = (code & 1) ? '3px' : '1px';
            const w2 = (code & 2) ? '2px' : '1px';
            return `<div style="background:#000; width:${w1};"></div><div style="background:#fff; width:1px;"></div><div style="background:#000; width:${w2};"></div><div style="background:#fff; width:1px;"></div>`;
          }).join('')}
        </div>
        <div style="font-size: 9px; letter-spacing: 0.2em; font-weight: bold; text-transform: uppercase;">* ${selectedBcItem.sku} *</div>
      </div>
    `;

    let sheetContent = '';
    const totalLabels = bcLayout === 'single' ? 1 : bcQty;
    for (let i = 0; i < totalLabels; i++) {
      sheetContent += labelHtml;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>Print Barcode Labels - ${selectedBcItem.sku}</title>
          <style>
            body { margin: 0; padding: 20px; background: white; }
            @media print {
              body { padding: 0; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="no-print" style="background:#f1f5f9; padding: 12px; border-bottom: 1px solid #cbd5e1; margin-bottom: 20px; font-family: sans-serif; display: flex; justify-content: space-between; align-items: center; border-radius:6px;">
            <span style="font-size:12px; color:#334155;">Ready to print <strong>${totalLabels} label(s)</strong> for ${selectedBcItem.name}.</span>
            <button onclick="window.print();" style="background:#4f46e5; color:white; border:none; padding:6px 12px; border-radius:4px; font-size:12px; font-weight:bold; cursor:pointer;">Print Now</button>
          </div>
          <div style="display: flex; flex-wrap: wrap; justify-content: flex-start;">
            ${sheetContent}
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // ── CSV File Drag & Drop Handlers ──────────────────────────────────────────
  const loadCsvFromFile = (file: File) => {
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
      alert('Please upload a valid .csv file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setCsvData(text || '');
    };
    reader.readAsText(file);
  };

  const handleCsvFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setCsvDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) loadCsvFromFile(file);
  };

  const handleCsvFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadCsvFromFile(file);
    e.target.value = ''; // reset so same file can be re-selected
  };

  const handleParseAndValidateCsv = () => {
    if (!csvData.trim()) {
      alert('Please paste or upload some CSV data first.');
      return;
    }
    const lines = csvData.split('\n').map(r => r.trim()).filter(Boolean);
    if (lines.length < 2) {
      alert('CSV must contain a header row and at least one data row.');
      return;
    }

    // Parse header and match aliases
    const headerCols = lines[0].split(',').map(h => h.trim().toLowerCase());
    
    // Helper to find column index by aliases
    const findColIdx = (aliases: string[]) => {
      for (const alias of aliases) {
        const idx = headerCols.indexOf(alias);
        if (idx !== -1) return idx;
      }
      return -1;
    };

    const nameIdx = findColIdx(['name', 'product name', 'product', 'title', 'item']);
    const categoryIdx = findColIdx(['category', 'category name', 'type', 'group']);
    const buyingPriceIdx = findColIdx(['buyingprice', 'buying price', 'cost', 'purchase price', 'cost price', 'buying_price']);
    const sellingPriceIdx = findColIdx(['sellingprice', 'selling price', 'price', 'retail price', 'retail_price', 'price_value']);
    const skuIdx = findColIdx(['sku', 'code', 'item code', 'item_code', 'sku_code']);
    const barcodeIdx = findColIdx(['barcode', 'bar code', 'upc', 'ean', 'bar_code']);
    const brandIdx = findColIdx(['brand', 'make', 'manufacturer', 'brand_name']);
    const stockIdx = findColIdx(['stock', 'qty', 'quantity', 'opening stock', 'opening_stock', 'initial stock']);

    if (nameIdx === -1) {
      alert('CSV must contain a "Name" column (aliases: Product Name, Title, Item).');
      return;
    }
    if (categoryIdx === -1) {
      alert('CSV must contain a "Category" column (aliases: Type, Group).');
      return;
    }

    const parsedRows: any[] = [];
    for (let i = 1; i < lines.length; i++) {
      const rowStr = lines[i];
      const cols: string[] = [];
      let inQuotes = false;
      let current = '';
      for (let c = 0; c < rowStr.length; c++) {
        const char = rowStr[c];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          cols.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      cols.push(current.trim());

      const rowErrors: string[] = [];
      const rawName = cols[nameIdx] || '';
      const rawCategory = cols[categoryIdx] || '';
      const rawBuyingPrice = buyingPriceIdx !== -1 ? cols[buyingPriceIdx] : '';
      const rawSellingPrice = sellingPriceIdx !== -1 ? cols[sellingPriceIdx] : '';
      const rawStock = stockIdx !== -1 ? cols[stockIdx] : '';
      const sku = skuIdx !== -1 ? cols[skuIdx] : '';
      const barcode = barcodeIdx !== -1 ? cols[barcodeIdx] : '';
      const brand = brandIdx !== -1 ? cols[brandIdx] : '';

      if (!rawName.trim()) {
        rowErrors.push('Name is required.');
      }
      if (!rawCategory.trim()) {
        rowErrors.push('Category is required.');
      }

      let buyingPrice = 0;
      if (rawBuyingPrice !== undefined && rawBuyingPrice !== '') {
        buyingPrice = Number(rawBuyingPrice);
        if (isNaN(buyingPrice) || buyingPrice < 0) {
          rowErrors.push('Buying price must be a non-negative number.');
        }
      }

      let sellingPrice = 0;
      if (rawSellingPrice !== undefined && rawSellingPrice !== '') {
        sellingPrice = Number(rawSellingPrice);
        if (isNaN(sellingPrice) || sellingPrice < 0) {
          rowErrors.push('Selling price must be a non-negative number.');
        }
      }

      let stock = 0;
      if (rawStock !== undefined && rawStock !== '') {
        stock = Number(rawStock);
        if (isNaN(stock) || stock < 0) {
          rowErrors.push('Stock quantity must be a non-negative number.');
        }
      }

      parsedRows.push({
        lineNum: i + 1,
        name: rawName,
        category: rawCategory,
        buyingPrice,
        sellingPrice,
        sku,
        barcode,
        brand,
        stock,
        isValid: rowErrors.length === 0,
        errors: rowErrors
      });
    }

    setCsvParsedRows(parsedRows);
    setCsvHasParsed(true);
  };

  const handleCsvImport = async (e: React.FormEvent) => {
    e.preventDefault();
    const validRows = csvParsedRows.filter(r => r.isValid);
    if (validRows.length === 0) {
      alert('There are no valid rows to import.');
      return;
    }

    setCsvLoading(true);
    try {
      let importCount = 0;

      // Wrap import in a single atomic Dexie transaction with UPSERT logic
      await db.transaction('rw', db.products, db.productVariants, db.stockLedger, db.stockBalance, db.syncQueue, async () => {
        const existingProducts = await db.products.where('tenant_id').equals(currentTenant.id).toArray();

        for (const row of validRows) {
          const rowSku = (row.sku || '').trim().toLowerCase();
          const rowName = (row.name || '').trim().toLowerCase();
          const rowCat = (row.category || '').trim().toLowerCase();

          // Check if product already exists by SKU or Name+Category
          const existing = existingProducts.find(p => 
            (rowSku && p.sku && p.sku.trim().toLowerCase() === rowSku) ||
            (p.name.trim().toLowerCase() === rowName && p.category.trim().toLowerCase() === rowCat)
          );

          let prodId: string;
          if (existing) {
            // UPSERT: Update existing product
            prodId = existing.id;
            const updatedProd: Product = {
              ...existing,
              buyingPrice: row.buyingPrice || existing.buyingPrice,
              sellingPrice: row.sellingPrice || existing.sellingPrice,
              price: row.sellingPrice || existing.price,
              brand: row.brand || existing.brand,
              sku: row.sku || existing.sku,
              barcode: row.barcode || existing.barcode,
              syncStatus: 'PENDING',
              updatedAt: Date.now(),
            };
            await db.products.put(updatedProd);
          } else {
            // INSERT: Create new product
            prodId = typeof crypto !== 'undefined' && crypto.randomUUID
              ? crypto.randomUUID()
              : `prod-import-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

            const newProd: Product = {
              id: prodId,
              name: row.name.trim(),
              category: row.category.trim(),
              buyingPrice: row.buyingPrice,
              sellingPrice: row.sellingPrice,
              price: row.sellingPrice,
              stock: 0,
              tenant_id: currentTenant.id,
              branch_id: currentBranch.id,
              module: activeModule,
              hasVariants: false,
              brand: row.brand || undefined,
              sku: row.sku || `SKU-${row.name.replace(/\s+/g, '').toUpperCase().slice(0, 4)}-${Math.floor(1000 + Math.random() * 9000)}`,
              barcode: row.barcode || undefined,
              syncStatus: 'PENDING',
              createdAt: Date.now(),
              updatedAt: Date.now(),
            };
            await db.products.put(newProd);
            existingProducts.push(newProd);
          }

          if (row.stock > 0) {
            await recordStockMovement({
              tenant_id: currentTenant.id,
              branch_id: currentBranch.id,
              warehouse_id: 'warehouse-main',
              product_id: prodId,
              movement_type: existing ? 'ADJUSTMENT_GAIN' : 'OPENING_STOCK',
              reference_type: existing ? 'CSV_UPDATE' : 'OPENING',
              quantity_change: row.stock,
              unit_cost: row.buyingPrice,
              total_cost: row.buyingPrice * row.stock,
              user_id: user?.name || 'System Importer',
              notes: existing ? 'CSV import stock update' : 'Imported initial stock via CSV'
            });
            await syncParentStock(prodId);
          }
          importCount++;
        }
      });

      alert(`🎉 Successfully imported ${importCount} product(s).`);
      setIsCsvImportOpen(false);
      setCsvData('');
      setCsvParsedRows([]);
      setCsvHasParsed(false);
    } catch (err: any) {
      alert('Error importing products: ' + err.message);
    } finally {
      setCsvLoading(false);
    }
  };

  const allWarehouses = useLiveQuery(() => db.warehouses.where('tenant_id').equals(currentTenant?.id || '').toArray(), [currentTenant?.id]) || [];

  // ── Alerts & Valuation State ───────────────────────────────────────────────
  const [kpis, setKpis] = useState<InventoryKPIs | null>(null);
  const [movements7d, setMovements7d] = useState<DailyMovement[]>([]);
  const [reorderAlerts, setReorderAlerts] = useState<ReorderAlert[]>([]);
  const [branchSummaryData, setBranchSummaryData] = useState<{
    branches: BranchValuationSummary[];
    tenantTotals: {
      buyingValue: number;
      sellingValue: number;
      potentialProfit: number;
      marginPercent: number;
      itemCount: number;
      totalUnits: number;
    };
  } | null>(null);
  const [productValuationList, setProductValuationList] = useState<ProductValuationMetric[]>([]);
  const [ledgerDrilldownProduct, setLedgerDrilldownProduct] = useState<ProductValuationMetric | null>(null);
  const [ledgerDrilldownEntries, setLedgerDrilldownEntries] = useState<StockLedgerEntry[]>([]);
  const [isDrilldownOpen, setIsDrilldownOpen] = useState(false);
  const [selectedLedgerProductId, setSelectedLedgerProductId] = useState<string>('');
  const [ledgerSearchQuery, setLedgerSearchQuery] = useState<string>('');
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState<string>('ALL');

  // Historical Valuation Filter States
  const [historicalSnapshot, setHistoricalSnapshot] = useState<HistoricalValuationSnapshot | null>(null);
  const [snapshotPreset, setSnapshotPreset] = useState<'today' | 'yesterday' | '7d' | '30d' | 'month_end' | 'year_end'>('today');
  const [valuationPriceTier, setValuationPriceTier] = useState<'retail' | 'wholesale' | 'vip' | 'online'>('retail');

  useEffect(() => {
    const load = async () => {
      await cleanDuplicateVariants(currentTenant.id);
      const [k, m, r, bSummary, pMetrics] = await Promise.all([
        getDashboardKPIs(currentTenant.id, currentBranch.id),
        get7DayMovements(currentTenant.id),
        evaluateReorderRules(currentTenant.id, currentBranch.id),
        getBranchValuationSummary(currentTenant.id),
        getProductValuationMetrics(currentTenant.id, currentBranch.id),
      ]);
      setKpis(k);
      setMovements7d(m);
      setReorderAlerts(r);
      setBranchSummaryData(bSummary);
      setProductValuationList(pMetrics);
    };
    load();
  }, [currentTenant.id, currentBranch.id, products, productVariants]);

  // Load historical snapshot on change
  useEffect(() => {
    const loadSnapshot = async () => {
      const now = Date.now();
      const dayMs = 86_400_000;
      let targetTime = now;
      if (snapshotPreset === 'yesterday') targetTime = now - dayMs;
      else if (snapshotPreset === '7d') targetTime = now - 7 * dayMs;
      else if (snapshotPreset === '30d') targetTime = now - 30 * dayMs;
      else if (snapshotPreset === 'month_end') {
        const d = new Date();
        targetTime = new Date(d.getFullYear(), d.getMonth(), 1).getTime() - 1;
      } else if (snapshotPreset === 'year_end') {
        const d = new Date();
        targetTime = new Date(d.getFullYear(), 0, 1).getTime() - 1;
      }

      const snap = await getHistoricalValuation(currentTenant.id, currentBranch.id, targetTime, valuationPriceTier);
      setHistoricalSnapshot(snap);
    };
    loadSnapshot();
  }, [currentTenant.id, currentBranch.id, snapshotPreset, valuationPriceTier, products, productVariants]);

  // Drilldown handler for stock ledger
  const openLedgerDrilldown = async (pItem: ProductValuationMetric | Product) => {
    let pMetric: ProductValuationMetric;
    if ('productId' in pItem && pItem.productId) {
      pMetric = pItem as ProductValuationMetric;
    } else {
      const p = pItem as Product;
      const foundMetric = productValuationList.find(m => m.productId === p.id && !m.variantId);
      if (foundMetric) {
        pMetric = foundMetric;
      } else {
        const qty = Math.max(0, p.stock || 0);
        const buyPrice = p.buyingPrice || 0;
        const sellPrice = p.sellingPrice || p.price || 0;
        const buyVal = qty * buyPrice;
        const sellVal = qty * sellPrice;
        const profit = sellVal - buyVal;
        const margin = sellVal > 0 ? Math.round((profit / sellVal) * 1000) / 10 : 0;
        const status = qty <= 0 ? 'Out of Stock' : qty < 10 ? 'Low Stock' : 'In Stock';
        pMetric = {
          productId: p.id,
          name: p.name,
          category: p.category,
          sku: p.sku || '—',
          currentQuantity: qty,
          averageCostPrice: buyPrice,
          lastPurchaseCost: buyPrice,
          sellingPrice: sellPrice,
          wholesalePrice: (p as any).wholesalePrice || 0,
          vipPrice: (p as any).vipPrice || 0,
          onlinePrice: (p as any).onlinePrice || 0,
          buyingValue: buyVal,
          sellingValue: sellVal,
          expectedProfit: profit,
          profitPercent: margin,
          stockStatus: status,
          lastMovementDate: null,
          lastMovementType: null,
          stockAgeDays: 0,
        };
      }
    }
    setLedgerDrilldownProduct(pMetric);
    const query = db.stockLedger.where('product_id').equals(pMetric.productId);
    let entries = await query.toArray();
    if (pMetric.variantId) {
      entries = entries.filter(e => e.variant_id === pMetric.variantId);
    }
    entries.sort((a, b) => b.created_at - a.created_at);
    setLedgerDrilldownEntries(entries);
    setSelectedLedgerProductId(pMetric.productId);
    setIsDrilldownOpen(true);
  };

  // Product Editor States & Open Handler (accessible by all tabs)
  const [pId, setPId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'simple' | 'variant'>('all');
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [deleteHasSalesHistory, setDeleteHasSalesHistory] = useState(false);
  const [deleteSalesCount, setDeleteSalesCount] = useState(0);
  const [deleteModeChoice, setDeleteModeChoice] = useState<'archive' | 'permanent'>('archive');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteToastMessage, setDeleteToastMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [editorTab, setEditorTab] = useState<ProductTab>('general');

  // Editor Form fields
  const [pName, setPName] = useState('');
  const [productCreatedAtDate, setProductCreatedAtDate] = useState('');

  // --- Supervisor PIN Approval ---
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [pinReason, setPinReason] = useState('');
  const [enteredPin, setEnteredPin] = useState('');
  const [pinSuccessCallback, setPinSuccessCallback] = useState<(() => void) | null>(null);

  const requestPinApproval = (reason: string, callback: () => void) => {
    setPinReason(reason);
    setEnteredPin('');
    setPinSuccessCallback(() => callback);
    setIsPinModalOpen(true);
  };

  const handleVerifyPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (enteredPin === '1234' || enteredPin === '1911') {
      setIsPinModalOpen(false);
      if (pinSuccessCallback) pinSuccessCallback();
    } else {
      alert('Invalid supervisor PIN. Access denied.');
    }
  };
  const [pCategory, setPCategory] = useState('');
  const [pBrand, setPBrand] = useState('');
  const [pDescription, setPDescription] = useState('');
  const [pSupplier, setPSupplier] = useState('');   // supplier display name (free-text fallback)
  const [pSupplierId, setPSupplierId] = useState(''); // linked supplier ID from db.suppliers
  const [pTaxRate, setPTaxRate] = useState(0);
  const [pHasVariants, setPHasVariants] = useState(false);
  const [pImageUrl, setPImageUrl] = useState('');
  const [pImagePreview, setPImagePreview] = useState('');
  const [pExpiry, setPExpiry] = useState('');
  const [pModule, setPModule] = useState(activeModule);
  const [pBuyingPrice, setPBuyingPrice] = useState(0);
  const [pSellingPrice, setPSellingPrice] = useState(0);
  const [pWholesalePrice, setPWholesalePrice] = useState(0);
  const [pVipPrice, setPVipPrice] = useState(0);
  const [pOnlinePrice, setPOnlinePrice] = useState(0);
  const [pStock, setPStock] = useState(0);
  const [pReorderLevel, setPReorderLevel] = useState(5);
  const [pSku, setPSku] = useState('');
  const [pBarcode, setPBarcode] = useState('');

  // Product photo camera state
  const [isPhotoCameraOpen, setIsPhotoCameraOpen] = useState(false);
  const [photoCameraStream, setPhotoCameraStream] = useState<MediaStream | null>(null);
  const photoVideoRef = useRef<HTMLVideoElement | null>(null);

  const startImageCamera = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        (document.getElementById('product-camera-file-input') as HTMLInputElement)?.click();
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      setPhotoCameraStream(stream);
      setIsPhotoCameraOpen(true);
    } catch (err) {
      console.warn('Camera stream error, launching camera file input fallback:', err);
      (document.getElementById('product-camera-file-input') as HTMLInputElement)?.click();
    }
  };

  const stopPhotoCamera = useCallback(() => {
    if (photoCameraStream) {
      photoCameraStream.getTracks().forEach(track => track.stop());
      setPhotoCameraStream(null);
    }
    setIsPhotoCameraOpen(false);
  }, [photoCameraStream]);

  const capturePhoto = () => {
    if (photoVideoRef.current) {
      const video = photoVideoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setPImageUrl(dataUrl);
        setPImagePreview(dataUrl);
        stopPhotoCamera();
      }
    }
  };

  useEffect(() => {
    if (isPhotoCameraOpen && photoCameraStream && photoVideoRef.current) {
      photoVideoRef.current.srcObject = photoCameraStream;
    }
  }, [isPhotoCameraOpen, photoCameraStream]);

  // Variants state
  const [localVariants, setLocalVariants] = useState<ProductVariant[]>([]);
  const [originalVariants, setOriginalVariants] = useState<ProductVariant[]>([]);
  const [selectedVariantIds, setSelectedVariantIds] = useState<Set<string>>(new Set());
  const [customAttributes, setCustomAttributes] = useState<Record<string, string[]>>({});
  const [newAttrName, setNewAttrName] = useState('');
  const [newAttrValues, setNewAttrValues] = useState('');
  const [editingVariantIdx, setEditingVariantIdx] = useState<number | null>(null);

  // Variant Hub Search & Filter & Supplier Specs States
  const [variantSearch, setVariantSearch] = useState('');
  const [variantStatusFilter, setVariantStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [supplierSku, setSupplierSku] = useState('');
  const [supplierLeadTimeDays, setSupplierLeadTimeDays] = useState(7);
  const [supplierPurchaseCost, setSupplierPurchaseCost] = useState(0);

  // Batch/Lot form
  const [batchNum, setBatchNum] = useState('');
  const [batchQty, setBatchQty] = useState(0);
  const [batchCost, setBatchCost] = useState(0);
  const [batchExpiry, setBatchExpiry] = useState('');
  const [batchSupplier, setBatchSupplier] = useState('');   // supplier display name
  const [batchSupplierId, setBatchSupplierId] = useState(''); // linked supplier ID
  const [batchSaving, setBatchSaving] = useState(false);

  // Serial form
  const [serialInput, setSerialInput] = useState('');

  // Reorder rule form
  const [rrMinQty, setRrMinQty] = useState(10);
  const [rrMaxQty, setRrMaxQty] = useState(200);
  const [rrReorderQty, setRrReorderQty] = useState(50);
  const [rrLeadTime, setRrLeadTime] = useState(7);
  const [rrSupplier, setRrSupplier] = useState('');
  const [rrSaving, setRrSaving] = useState(false);

  // Product batches and serials for the selected product
  const productBatches = useLiveQuery(async () => {
    if (!pId) return [];
    return db.batchLots.where('product_id').equals(pId).toArray();
  }, [pId]) || [];

  const productSerials = useLiveQuery(async () => {
    if (!pId) return [];
    return db.serialNumbers.where('product_id').equals(pId).toArray();
  }, [pId]) || [];

  const productHistory = useLiveQuery(async () => {
    if (!pId) return [];
    const entries = await db.stockLedger.where('product_id').equals(pId).toArray();
    return entries.sort((a, b) => b.created_at - a.created_at);
  }, [pId]) || [];

  const productReorderRule = useLiveQuery(async () => {
    if (!pId) return null;
    return db.reorderRules.where('product_id').equals(pId).and(r => !r.variant_id).first();
  }, [pId]);

  useEffect(() => {
    if (productReorderRule) {
      setRrMinQty(productReorderRule.min_quantity);
      setRrMaxQty(productReorderRule.max_quantity);
      setRrReorderQty(productReorderRule.reorder_quantity);
      setRrLeadTime(productReorderRule.lead_time_days);
      setRrSupplier(productReorderRule.preferred_supplier_name ?? '');
    }
  }, [productReorderRule?.id]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q && filterType === 'all') return products;
    return products.filter((p) => {
      const matchSearch = !q || (
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        (p.brand || '').toLowerCase().includes(q) ||
        (p.sku || '').toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q)
      );
      const isParent = isParentProduct(p, productVariants);
      const matchType = filterType === 'all' || (filterType === 'simple' && !isParent) || (filterType === 'variant' && isParent);
      return matchSearch && matchType;
    });
  }, [products, productVariants, searchQuery, filterType]);

  // Stable O(1) product lookup map — supports ID, SKU, barcode, and variant resolution
  const productMap = useMemo(() => {
    const map = new Map<string, typeof products[0]>();
    for (const p of products) {
      map.set(p.id, p);
      if (p.sku) map.set(p.sku, p);
      if (p.barcode) map.set(p.barcode, p);
    }
    for (const v of productVariants) {
      const parent = products.find(p => p.id === v.productId);
      if (parent) {
        const vObj = { 
          ...parent, 
          name: `${parent.name} (${Object.values(v.attributes || {}).join('/') || 'Variant'})`, 
          buyingPrice: v.buyingPrice ?? parent.buyingPrice 
        };
        map.set(v.id, vObj as any);
        if (v.sku) map.set(v.sku, vObj as any);
        if (v.barcode) map.set(v.barcode, vObj as any);
      }
    }
    return map;
  }, [products, productVariants]);

  const getProductName = useCallback((productIdOrCode: string): string => {
    if (!productIdOrCode) return '—';
    const found = productMap.get(productIdOrCode);
    if (found?.name) return found.name;
    const p = products.find(prod => prod.id === productIdOrCode || prod.sku === productIdOrCode || prod.barcode === productIdOrCode);
    if (p) return p.name;
    const v = productVariants.find(varItem => varItem.id === productIdOrCode || varItem.sku === productIdOrCode || varItem.barcode === productIdOrCode);
    if (v) {
      const parent = products.find(prod => prod.id === v.productId);
      if (parent) return `${parent.name} (${Object.values(v.attributes || {}).join('/') || 'Variant'})`;
    }
    if (productIdOrCode.includes('-') && productIdOrCode.length > 20) {
      return `Unmapped Item (${productIdOrCode.slice(0, 8)})`;
    }
    return productIdOrCode;
  }, [productMap, products, productVariants]);


  const stats = useMemo(() => {
    const validIds = new Set(products.map(p => p.id));
    const activeProductVariants = products.length === 0 ? [] : productVariants.filter(v => validIds.has(v.productId));

    const total = products.length;
    const variantProducts = products.filter(p => isParentProduct(p, productVariants)).length;
    
    // Low stock: simple products with stock < 10 + variants with stock < (reorderLevel || 5)
    const simpleLow = products.filter(p => !isParentProduct(p, productVariants) && p.stock < 10 && p.stock > 0).length;
    const variantLow = activeProductVariants.filter(v => v.stock < (v.reorderLevel ?? 5) && v.stock > 0).length;
    const lowStock = products.length === 0 ? 0 : (simpleLow + variantLow);

    // Out of stock: simple products with stock <= 0 + variants with stock <= 0
    const simpleOut = products.filter(p => !isParentProduct(p, productVariants) && p.stock <= 0).length;
    const variantOut = activeProductVariants.filter(v => v.stock <= 0).length;
    const outOfStock = products.length === 0 ? 0 : (simpleOut + variantOut);

    return { total, variantProducts, lowStock, outOfStock };
  }, [products, productVariants]);

  const lowStockAlerts = useMemo(() => {
    const simpleLowStock = products.filter(p => !isParentProduct(p, productVariants) && p.stock < 10 && p.stock > 0).map(p => ({
      id: p.id,
      name: p.name,
      category: p.category,
      sku: p.sku || '—',
      brand: p.brand || '—',
      stock: p.stock,
      buyingPrice: p.buyingPrice,
      sellingPrice: p.sellingPrice || p.price,
      isVariant: false,
      variantId: undefined as string | undefined,
      productRef: p
    }));

    const variantLowStock = productVariants.filter(v => v.stock < (v.reorderLevel ?? 5) && v.stock > 0).map(v => {
      const parent = productMap.get(v.productId);
      const attrLabel = v.attributes ? Object.entries(v.attributes).map(([k, val]) => `${k}: ${val}`).join(' / ') : '';
      return {
        id: v.id,
        name: parent ? `${parent.name} — ${attrLabel}` : `Variant (${v.sku})`,
        category: parent?.category || 'General',
        sku: v.sku || '—',
        brand: parent?.brand || '—',
        stock: v.stock,
        buyingPrice: v.buyingPrice || parent?.buyingPrice || 0,
        sellingPrice: v.sellingPrice || parent?.sellingPrice || parent?.price || 0,
        isVariant: true,
        variantId: v.id,
        productRef: parent
      };
    });

    return [...simpleLowStock, ...variantLowStock];
  }, [products, productVariants, productMap]);

  const outOfStockAlerts = useMemo(() => {
    const simpleOutOfStock = products.filter(p => !isParentProduct(p, productVariants) && p.stock <= 0).map(p => ({
      id: p.id,
      name: p.name,
      category: p.category,
      sku: p.sku || '—',
      brand: p.brand || '—',
      stock: p.stock,
      buyingPrice: p.buyingPrice,
      sellingPrice: p.sellingPrice || p.price,
      isVariant: false,
      variantId: undefined as string | undefined,
      productRef: p
    }));

    const variantOutOfStock = productVariants.filter(v => v.stock <= 0).map(v => {
      const parent = productMap.get(v.productId);
      const attrLabel = v.attributes ? Object.entries(v.attributes).map(([k, val]) => `${k}: ${val}`).join(' / ') : '';
      return {
        id: v.id,
        name: parent ? `${parent.name} — ${attrLabel}` : `Variant (${v.sku})`,
        category: parent?.category || 'General',
        sku: v.sku || '—',
        brand: parent?.brand || '—',
        stock: v.stock,
        buyingPrice: v.buyingPrice || parent?.buyingPrice || 0,
        sellingPrice: v.sellingPrice || parent?.sellingPrice || parent?.price || 0,
        isVariant: true,
        variantId: v.id,
        productRef: parent
      };
    });

    return [...simpleOutOfStock, ...variantOutOfStock];
  }, [products, productVariants, productMap]);

  const openEditor = useCallback(async (product: Product | null, initialValues?: Partial<Product>) => {
    setSelectedProduct(product);
    setEditorTab('general');
    setEditingVariantIdx(null);
    setCustomAttributes({});
    setNewAttrName(''); setNewAttrValues('');
    setBatchNum(''); setBatchQty(0); setBatchCost(0); setBatchExpiry('');
    setBatchSupplier(''); setBatchSupplierId('');
    setSerialInput('');
    setProductCreatedAtDate('');

    if (product) {
      setPId(product.id);
      setPName(product.name);
      setPCategory(product.category);
      setPBrand(product.brand || '');
      setPDescription(product.description || '');
      setPSupplier(product.supplier || '');
      setPSupplierId((product as any).supplier_id || '');
      setPBuyingPrice(product.buyingPrice || 0);
      setPSellingPrice(product.sellingPrice || product.price || 0);
      setPWholesalePrice((product as any).wholesalePrice || 0);
      setPVipPrice((product as any).vipPrice || 0);
      setPOnlinePrice((product as any).onlinePrice || 0);
      setPStock(product.stock || 0);

      const existingDbVars = await db.productVariants.where('productId').equals(product.id).toArray();
      const hasChildVars = existingDbVars.length > 0;
      const isParent = isParentProduct(product, existingDbVars) || hasChildVars;

      setPHasVariants(isParent);
      setPExpiry(product.expiryDate || '');
      setPTaxRate((product as any).taxRate !== undefined ? (product as any).taxRate : 0);
      setPReorderLevel(5);
      const effectiveSku = (product.sku && product.sku !== '—' && product.sku.trim()) ? product.sku : generateAutoSku(product.name, product.category, product.id);
      setPSku(effectiveSku);
      setPBarcode(product.barcode || '');
      setPImageUrl((product as any).image_url || '');
      setPImagePreview((product as any).image_url || '');

      if (isParent) {
        await cleanDuplicateVariants(currentTenant.id);

        const vars = existingDbVars;

        // In-memory deduplication pass for any residual duplicate variants
        const uniqueMap = new Map<string, ProductVariant>();
        for (const v of vars) {
          const sig = getVariantAttrSig(v.attributes) || (v.sku ? `sku:${v.sku.toLowerCase()}` : v.id);
          if (!uniqueMap.has(sig)) {
            uniqueMap.set(sig, v);
          } else {
            const existing = uniqueMap.get(sig)!;
            const vStock = v.stock || 0;
            const exStock = existing.stock || 0;
            if (vStock > exStock) {
              await db.productVariants.delete(existing.id).catch(() => {});
              uniqueMap.set(sig, v);
            } else {
              await db.productVariants.delete(v.id).catch(() => {});
            }
          }
        }
        const cleanVars = Array.from(uniqueMap.values());

        const activeVars = cleanVars.filter(v => (v.status as any) !== 'Inactive' && !(v as any).deletedAt);
        const computedStock = activeVars.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
        setPStock(computedStock);
        if (product.stock !== computedStock) {
          await syncParentStock(product.id);
        }
        setOriginalVariants(cleanVars);
        setLocalVariants(cleanVars.map(v => ({
          ...v,
          inheritBuyingPrice:  v.inheritBuyingPrice  !== undefined ? v.inheritBuyingPrice  : (v.buyingPrice  === undefined || v.buyingPrice  === null || v.buyingPrice  === 0 || (v as any).buying_price  === undefined || (v as any).buying_price  === null || (v as any).buying_price  === 0),
          inheritSellingPrice: v.inheritSellingPrice !== undefined ? v.inheritSellingPrice : (v.sellingPrice === undefined || v.sellingPrice === null || v.sellingPrice === 0 || (v as any).selling_price === undefined || (v as any).selling_price === null || (v as any).selling_price === 0),
        })));
        const attrs: Record<string, Set<string>> = {};
        cleanVars.forEach(v => Object.entries(v.attributes).forEach(([key, val]) => {
          if (!attrs[key]) attrs[key] = new Set();
          attrs[key].add(val);
        }));
        setCustomAttributes(Object.fromEntries(Object.entries(attrs).map(([k, v]) => [k, Array.from(v)])));
      } else {
        setOriginalVariants([]);
        setLocalVariants([]);
        setPStock(product.stock || 0);
      }
    } else {
      const newId = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `prod-${Date.now().toString().slice(-7)}`;
      setPId(newId);
      setOriginalVariants([]);
      setPName(initialValues?.name || '');
      setPCategory(initialValues?.category || '');
      setPBrand(initialValues?.brand || '');
      setPDescription(initialValues?.description || '');
      setPSupplier(initialValues?.supplier || '');
      setPSupplierId('');
      setPBuyingPrice(initialValues?.buyingPrice || 0);
      setPSellingPrice(initialValues?.sellingPrice || initialValues?.price || 0);
      setPStock(initialValues?.stock || 0);
      setPHasVariants(initialValues?.hasVariants || false);
      setPExpiry(initialValues?.expiryDate || '');
      setPTaxRate(0);
      setPReorderLevel(5);
      const initSku = initialValues?.sku || generateAutoSku(initialValues?.name, initialValues?.category, newId);
      setPSku(initSku);
      setPBarcode(initialValues?.barcode || '');
      setPImageUrl('');
      setPImagePreview('');
      setPModule(activeModule);
      setLocalVariants([]);
    }
    setIsEditorOpen(true);
    setInvTab('products');
  }, [activeModule]);

  // Live SKU Generation Effect when product name/category changes in editor
  useEffect(() => {
    if (isEditorOpen && pName && (!pSku || pSku === '—' || !pSku.trim())) {
      setPSku(generateAutoSku(pName, pCategory, pId));
    }
  }, [pName, pCategory, isEditorOpen, pSku, pId]);

  // ──────────────────────────────────────────────────────────────────────────
  // TAB 1 — DASHBOARD
  // ──────────────────────────────────────────────────────────────────────────
  const renderDashboardTab = () => {
    const total = kpis?.totalStockItems ?? kpis?.totalProducts ?? 0;
    const outOfStock = kpis?.outOfStockCount ?? 0;
    const lowStock = kpis?.lowStockCount ?? 0;
    const overstock = kpis?.overstockCount ?? 0;
    const inStock = Math.max(0, total - outOfStock - lowStock);

    const healthScore = kpis?.inventoryHealthScore ?? 100;
    const healthColor = healthScore >= 80 ? '#10b981' : healthScore >= 60 ? '#f59e0b' : '#ef4444';
    const healthLabel = healthScore >= 80 ? 'Excellent' : healthScore >= 60 ? 'Fair' : 'Critical';

    // Production 11 KPI Cards
    const kpiCards = [
      { label: 'Total Stock Items',    value: fmtNum(total),                                icon: <Package />,        color: '#6366f1', sub: `${fmtNum(kpis?.totalVariants ?? 0)} variants` },
      { label: 'Total Units in Stock',  value: fmtNum(kpis?.totalUnitsInStock ?? 0),         icon: <Layers />,         color: '#3b82f6', sub: 'Sum of all quantities' },
      { label: 'Inventory Buying Value',value: fmtCcy(kpis?.inventoryBuyingValue ?? 0),    icon: <DollarSign />,     color: '#059669', sub: 'Cost basis (WAC)' },
      { label: 'Inventory Selling Value',value: fmtCcy(kpis?.inventorySellingValue ?? 0),  icon: <TrendingUp />,     color: '#10b981', sub: 'Retail value' },
      { label: 'Potential Gross Profit',value: fmtCcy(kpis?.potentialGrossProfit ?? 0),    icon: <Activity />,       color: '#8b5cf6', sub: 'Selling − Buying Value' },
      { label: 'Average Margin %',      value: `${kpis?.averageMarginPercent ?? 0}%`,        icon: <BarChart3 />,      color: '#06b6d4', sub: 'Gross profit margin' },
      { label: 'Low Stock Items',       value: fmtNum(lowStock),                             icon: <AlertTriangle />,  color: '#f59e0b', sub: 'Below reorder level' },
      { label: 'Out of Stock',          value: fmtNum(outOfStock),                           icon: <AlertCircle />,    color: '#ef4444', sub: 'Zero qty products' },
      { label: 'Overstock Items',       value: fmtNum(overstock),                            icon: <Archive />,        color: '#a855f7', sub: 'Exceeding max capacity' },
      { label: 'Expired Products',      value: fmtNum(kpis?.expiredCount ?? 0),              icon: <Clock />,          color: '#f97316', sub: `${fmtNum(kpis?.expiringThisMonth ?? 0)} expiring soon` },
      { label: 'Inventory Health Score',value: `${healthScore} / 100`,                       icon: <Zap />,            color: healthColor, sub: healthLabel },
    ];

    const maxBar = Math.max(...movements7d.map(m => Math.max(m.inbound, m.outbound)), 1);

    // Stock composition for bar
    const compTotal = inStock + lowStock + outOfStock || 1;
    const compInPct   = Math.round((inStock / compTotal) * 100);
    const compLowPct  = Math.round((lowStock / compTotal) * 100);
    const compOutPct  = 100 - compInPct - compLowPct;

    return (
      <div className="inventory-dashboard">
        {/* Alert Banner */}
        {(kpis?.expiringThisMonth ?? 0) + (kpis?.lowStockCount ?? 0) + (kpis?.reorderAlertCount ?? 0) > 0 && (
          <div className="inv-alert-bar">
            {(kpis?.expiredCount ?? 0) > 0 && (
              <span className="inv-alert-chip expired"><AlertCircle size={13}/> {kpis!.expiredCount} items expired</span>
            )}
            {(kpis?.expiringThisMonth ?? 0) > 0 && (
              <span className="inv-alert-chip warning"><Calendar size={13}/> {kpis!.expiringThisMonth} expiring in 30 days</span>
            )}
            {(kpis?.lowStockCount ?? 0) > 0 && (
              <span className="inv-alert-chip info"><TrendingDown size={13}/> {kpis!.lowStockCount} below reorder level</span>
            )}
            {(kpis?.reorderAlertCount ?? 0) > 0 && (
              <span className="inv-alert-chip purple"><Zap size={13}/> {kpis!.reorderAlertCount} reorder alerts</span>
            )}
          </div>
        )}

        {/* KPI Cards */}
        <div className="inv-kpi-grid">
          {kpiCards.map((c) => (
            <div key={c.label} className="inv-kpi-card" style={{ '--accent': c.color } as React.CSSProperties}>
              <div className="inv-kpi-icon" style={{ background: c.color + '22', color: c.color }}>
                {React.cloneElement(c.icon as React.ReactElement<{ size?: number }>, { size: 20 })}
              </div>
              <div className="inv-kpi-body">
                <div className="inv-kpi-value">{c.value}</div>
                <div className="inv-kpi-label">{c.label}</div>
                <div className="inv-kpi-sub">{c.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Charts Row */}
        <div className="inv-charts-row">
          {/* 7-Day Bar Chart */}
          <div className="inv-chart-card">
            <div className="inv-chart-header">
              <h3>Stock Movements — Last 7 Days</h3>
              <div className="inv-chart-legend">
                <span className="legend-dot" style={{background:'#10b981'}}/> Inbound
                <span className="legend-dot" style={{background:'#ef4444'}}/> Outbound
              </div>
            </div>
            <div className="inv-bar-chart">
              {movements7d.map((d) => (
                <div key={d.date} className="inv-bar-col">
                  <div className="inv-bar-pair">
                    <div className="inv-bar inbound"
                      style={{ height: `${(d.inbound / maxBar) * 100}%` }}
                      title={`Inbound: ${d.inbound}`}
                    />
                    <div className="inv-bar outbound"
                      style={{ height: `${(d.outbound / maxBar) * 100}%` }}
                      title={`Outbound: ${d.outbound}`}
                    />
                  </div>
                  <div className="inv-bar-label">{d.date}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Inventory Health Score + Composition */}
          <div className="inv-chart-card">
            <div className="inv-chart-header"><h3>Inventory Health Score</h3></div>
            {/* Score Gauge */}
            <div style={{display:'flex', alignItems:'center', gap:'20px', padding:'8px 0 12px'}}>
              <div style={{
                width: '80px', height: '80px', borderRadius: '50%',
                background: `conic-gradient(${healthColor} ${healthScore * 3.6}deg, #e2e8f0 0deg)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, position: 'relative',
              }}>
                <div style={{
                  width: '60px', height: '60px', borderRadius: '50%',
                  background: 'var(--bg-card, #fff)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
                }}>
                  <span style={{fontSize:'1.1rem', fontWeight:800, color: healthColor, lineHeight:1}}>{healthScore}</span>
                  <span style={{fontSize:'0.55rem', color:'#94a3b8', fontWeight:600}}>/ 100</span>
                </div>
              </div>
              <div>
                <div style={{fontSize:'1rem', fontWeight:700, color: healthColor}}>{healthLabel}</div>
                <div style={{fontSize:'0.72rem', color:'#64748b', marginTop:'2px'}}>Inventory health rating based on stock level, expiry, and reorder compliance.</div>
              </div>
            </div>
            {/* Stock Composition Bar */}
            <div style={{marginBottom:'6px'}}>
              <div style={{fontSize:'0.7rem', fontWeight:600, color:'#64748b', marginBottom:'4px', textTransform:'uppercase', letterSpacing:'0.06em'}}>Stock Composition</div>
              <div style={{display:'flex', height:'10px', borderRadius:'6px', overflow:'hidden', gap:'2px'}}>
                <div style={{flex: compInPct, background:'#10b981', minWidth: compInPct > 0 ? '4px' : '0'}} title={`In Stock: ${inStock}`}/>
                <div style={{flex: compLowPct, background:'#f59e0b', minWidth: compLowPct > 0 ? '4px' : '0'}} title={`Low: ${lowStock}`}/>
                <div style={{flex: compOutPct, background:'#ef4444', minWidth: compOutPct > 0 ? '4px' : '0'}} title={`Out: ${outOfStock}`}/>
              </div>
              <div style={{display:'flex', gap:'12px', marginTop:'6px', fontSize:'0.7rem', color:'#64748b'}}>
                <span><span style={{background:'#10b981', borderRadius:'2px', display:'inline-block', width:'8px', height:'8px', marginRight:'4px'}}/>{compInPct}% In Stock</span>
                <span><span style={{background:'#f59e0b', borderRadius:'2px', display:'inline-block', width:'8px', height:'8px', marginRight:'4px'}}/>{compLowPct}% Low</span>
                <span><span style={{background:'#ef4444', borderRadius:'2px', display:'inline-block', width:'8px', height:'8px', marginRight:'4px'}}/>{compOutPct}% Out</span>
              </div>
            </div>
            <div className="inv-health-list" style={{marginTop:'8px'}}>
              <div className="inv-health-row">
                <TrendingUp size={16} color="#10b981"/>
                <span>Fast Moving Items</span>
                <strong style={{color:'#10b981'}}>{kpis?.fastMovingCount ?? 0}</strong>
              </div>
              <div className="inv-health-row">
                <TrendingDown size={16} color="#f59e0b"/>
                <span>Slow Moving Items</span>
                <strong style={{color:'#f59e0b'}}>{kpis?.slowMovingCount ?? 0}</strong>
              </div>
              <div className="inv-health-row">
                <ClipboardList size={16} color="#06b6d4"/>
                <span>Pending Stock Counts</span>
                <strong style={{color:'#06b6d4'}}>{kpis?.pendingCounts ?? 0}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions Row */}
        <div style={{display:'flex', gap:'10px', flexWrap:'wrap'}}>
          {[
            { label: 'New Adjustment', icon: <Sliders size={14}/>, color: '#6366f1', action: () => { const first = products[0]; if (first) openAdjustment(first); } },
            { label: 'New Transfer',   icon: <ArrowLeftRight size={14}/>, color: '#06b6d4', action: () => setInvTab('transfers') },
            { label: 'Stock Sync Engine', icon: <RefreshCw size={14}/>, color: '#ec4899', action: () => setInvTab('stockSync') },
            { label: 'Stock Count',    icon: <ClipboardList size={14}/>, color: '#10b981', action: () => setInvTab('count') },
            { label: 'View Reports',   icon: <BarChart3 size={14}/>, color: '#8b5cf6', action: () => setInvTab('reports') },
            { label: 'Alerts',         icon: <AlertTriangle size={14}/>, color: '#f59e0b', action: () => setInvTab('alerts') },
          ].map(qa => (
            <button key={qa.label}
              onClick={qa.action}
              style={{
                display:'flex', alignItems:'center', gap:'6px',
                padding:'8px 14px', borderRadius:'8px', border:`1px solid ${qa.color}33`,
                background: qa.color + '11', color: qa.color, fontWeight:600, fontSize:'0.8rem',
                cursor:'pointer', transition:'all 0.15s',
              }}
            >
              {qa.icon} {qa.label}
            </button>
          ))}
        </div>

        {/* Reorder Alerts Table */}
        {reorderAlerts.length > 0 && (
          <div className="inv-table-card">
            <div className="inv-table-header">
              <h3><Zap size={15}/> Reorder Alerts</h3>
              <button className="inv-view-all-btn" onClick={() => setInvTab('reports')}>View Full Report →</button>
            </div>
            <table className="inv-table">
              <thead><tr><th>Product</th><th>Current Qty</th><th>Min Level</th><th>Deficit</th><th>To Reorder</th><th>Supplier</th><th>Lead Time</th></tr></thead>
              <tbody>
                {reorderAlerts.slice(0, 8).map(a => (
                  <tr key={a.rule.id} className="inv-row-alert">
                    <td style={{fontWeight:600}}>{a.productName}</td>
                    <td><span style={{color:'#ef4444',fontWeight:700}}>{a.currentStock}</span></td>
                    <td>{a.rule.min_quantity}</td>
                    <td><span style={{color:'#f59e0b',fontWeight:600}}>-{a.deficit}</span></td>
                    <td><span style={{color:'#10b981',fontWeight:600}}>{a.rule.reorder_quantity}</span></td>
                    <td>{a.rule.preferred_supplier_name ?? '—'}</td>
                    <td>{a.rule.lead_time_days}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Recent Ledger Activity */}
        {recentAdjustments.length > 0 && (
          <div className="inv-table-card">
            <div className="inv-table-header">
              <h3><Activity size={15}/> Recent Stock Movements</h3>
              <button className="inv-view-all-btn" onClick={() => setInvTab('adjustments')}>View Full Ledger →</button>
            </div>
            <table className="inv-table">
              <thead><tr><th>Date & Time</th><th>Product</th><th>Type</th><th>Change</th><th>After</th><th>By</th></tr></thead>
              <tbody>
                {recentAdjustments.slice(0, 6).map(e => {
                  const prod = productMap.get(e.product_id);
                  return (
                    <tr key={e.id} className={INBOUND_TYPES.has(e.movement_type) ? 'inv-row-inbound' : 'inv-row-outbound'}>
                      <td style={{whiteSpace:'nowrap',fontSize:'0.75rem'}}>{fmtDateTime(e.created_at)}</td>
                      <td style={{fontWeight:600}}>{prod?.name ?? e.product_id.slice(-8)}</td>
                      <td><span className={`inv-move-chip ${INBOUND_TYPES.has(e.movement_type) ? 'inbound' : 'outbound'}`}>{e.movement_type.replace(/_/g,' ')}</span></td>
                      <td><strong style={{color: e.quantity_change > 0 ? '#10b981' : '#ef4444'}}>{e.quantity_change > 0 ? '+' : ''}{e.quantity_change}</strong></td>
                      <td>{e.quantity_after}</td>
                      <td style={{fontSize:'0.75rem', opacity:0.7}}>{e.user_id}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* AI Forecasting CTA */}
        <div className="inv-ai-cta" onClick={() => window.dispatchEvent(new CustomEvent('dukapos:open-ai'))}>
          <div className="inv-ai-cta-icon">✨</div>
          <div className="inv-ai-cta-text">
            <strong>AI Inventory Co-Pilot</strong>
            <span>Ask the AI to forecast demand, detect slow movers, or recommend reorder quantities for this branch.</span>
          </div>
          <div className="inv-ai-cta-arrow">→</div>
        </div>

        {/* ── Inventory Valuation Summary Panel ─── */}
        <div className="inv-table-card" style={{marginTop:'16px'}}>
          <div className="inv-table-header" style={{display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'8px'}}>
            <h3><DollarSign size={15}/> Inventory Valuation Summary</h3>
            <div style={{display:'flex', gap:'6px', flexWrap:'wrap'}}>
              {(['today','yesterday','7d','30d','month_end','year_end'] as const).map(p => (
                <button key={p}
                  onClick={() => setSnapshotPreset(p)}
                  style={{
                    padding:'4px 10px', borderRadius:'20px', fontSize:'0.72rem', fontWeight:600, cursor:'pointer',
                    border:`1.5px solid ${snapshotPreset === p ? '#6366f1' : '#e2e8f0'}`,
                    background: snapshotPreset === p ? '#6366f1' : 'transparent',
                    color: snapshotPreset === p ? '#fff' : '#64748b',
                    transition: 'all 0.15s'
                  }}
                >
                  {p === 'today' ? 'Today' : p === 'yesterday' ? 'Yesterday' : p === '7d' ? '7 Days' : p === '30d' ? '30 Days' : p === 'month_end' ? 'Month Start' : 'Year Start'}
                </button>
              ))}
              <select
                value={valuationPriceTier}
                onChange={e => setValuationPriceTier(e.target.value as any)}
                style={{padding:'4px 8px', borderRadius:'6px', fontSize:'0.72rem', border:'1.5px solid #e2e8f0', color:'#334155', fontWeight:600, cursor:'pointer'}}
              >
                <option value="retail">Retail Price</option>
                <option value="wholesale">Wholesale Price</option>
                <option value="vip">VIP Price</option>
                <option value="online">Online Price</option>
              </select>
            </div>
          </div>
          {historicalSnapshot && (
            <>
              {/* Snapshot KPI Row */}
              <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))', gap:'12px', padding:'12px 0 16px'}}>
                {[
                  { label: 'Snapshot Date', value: historicalSnapshot.snapshotDate, color: '#6366f1' },
                  { label: 'Total Items', value: fmtNum(historicalSnapshot.totalItems), color: '#3b82f6' },
                  { label: 'Total Quantity', value: fmtNum(historicalSnapshot.totalQuantity), color: '#06b6d4' },
                  { label: 'Buying Value', value: fmtCcy(historicalSnapshot.buyingValue), color: '#059669' },
                  { label: 'Selling Value', value: fmtCcy(historicalSnapshot.sellingValue), color: '#10b981' },
                  { label: 'Potential Profit', value: fmtCcy(historicalSnapshot.potentialProfit), color: '#8b5cf6' },
                  { label: 'Margin %', value: `${historicalSnapshot.marginPercent}%`, color: '#06b6d4' },
                ].map(c => (
                  <div key={c.label} style={{background:'var(--bg-card,#f8fafc)', borderRadius:'10px', padding:'12px', border:`1px solid ${c.color}22`}}>
                    <div style={{fontSize:'0.68rem', color:'#94a3b8', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'4px'}}>{c.label}</div>
                    <div style={{fontSize:'1rem', fontWeight:800, color: c.color}}>{c.value}</div>
                  </div>
                ))}
              </div>

              {/* Top items by buying value */}
              {historicalSnapshot.items.length > 0 && (
                <div style={{overflowX:'auto'}}>
                  <table className="inv-table" style={{minWidth:'700px'}}>
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th style={{textAlign:'right'}}>Qty</th>
                        <th style={{textAlign:'right'}}>Avg Cost</th>
                        <th style={{textAlign:'right'}}>Unit Price</th>
                        <th style={{textAlign:'right'}}>Buying Value</th>
                        <th style={{textAlign:'right'}}>Selling Value</th>
                        <th style={{textAlign:'right'}}>Profit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...historicalSnapshot.items].sort((a,b) => b.buyingValue - a.buyingValue).slice(0, 10).map((item, i) => (
                        <tr key={i}>
                          <td style={{fontWeight:600}}>{item.productName}</td>
                          <td style={{textAlign:'right'}}>{fmtNum(item.quantity)}</td>
                          <td style={{textAlign:'right', color:'#64748b'}}>{fmtCcy(item.unitCost)}</td>
                          <td style={{textAlign:'right', color:'#64748b'}}>{fmtCcy(item.unitPrice)}</td>
                          <td style={{textAlign:'right', fontWeight:600, color:'#059669'}}>{fmtCcy(item.buyingValue)}</td>
                          <td style={{textAlign:'right', fontWeight:600, color:'#10b981'}}>{fmtCcy(item.sellingValue)}</td>
                          <td style={{textAlign:'right', fontWeight:700, color: item.profit >= 0 ? '#8b5cf6' : '#ef4444'}}>{fmtCcy(item.profit)}</td>
                          <td style={{textAlign:'right'}}>
                            <button
                              title="View Stock Ledger"
                              onClick={() => {
                                const prod = products.find(p => p.id === item.productId || p.name === item.productName);
                                if (prod) openLedgerDrilldown(prod);
                              }}
                              style={{
                                padding:'3px 7px', borderRadius:'5px', fontSize:'0.7rem',
                                border:'1px solid rgba(99, 102, 241, 0.3)', background:'rgba(99, 102, 241, 0.12)',
                                color:'#6366f1', cursor:'pointer', fontWeight:600, display:'inline-flex', alignItems:'center'
                              }}
                            >
                              <Eye size={12}/>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Branch-Level Valuation Summary ─── */}
        {branchSummaryData && branchSummaryData.branches.length > 0 && (
          <div className="inv-table-card" style={{marginTop:'16px'}}>
            <div className="inv-table-header">
              <h3><ArrowLeftRight size={15}/> Branch-Level Valuation Breakdown</h3>
            </div>
            <div style={{overflowX:'auto'}}>
              <table className="inv-table" style={{minWidth:'650px'}}>
                <thead>
                  <tr>
                    <th>Branch</th>
                    <th style={{textAlign:'right'}}>Items</th>
                    <th style={{textAlign:'right'}}>Total Units</th>
                    <th style={{textAlign:'right'}}>Buying Value</th>
                    <th style={{textAlign:'right'}}>Selling Value</th>
                    <th style={{textAlign:'right'}}>Potential Profit</th>
                    <th style={{textAlign:'right'}}>Margin %</th>
                  </tr>
                </thead>
                <tbody>
                  {branchSummaryData.branches.map(b => (
                    <tr key={b.branchId}>
                      <td style={{fontWeight:600}}>
                        {b.branchName}
                        {b.isHeadquarters && (
                          <span style={{marginLeft:'6px', fontSize:'0.65rem', background:'#6366f111', color:'#6366f1', padding:'2px 6px', borderRadius:'10px', fontWeight:700}}>HQ</span>
                        )}
                      </td>
                      <td style={{textAlign:'right'}}>{fmtNum(b.itemCount)}</td>
                      <td style={{textAlign:'right'}}>{fmtNum(b.totalUnits)}</td>
                      <td style={{textAlign:'right', fontWeight:600, color:'#059669'}}>{fmtCcy(b.buyingValue)}</td>
                      <td style={{textAlign:'right', fontWeight:600, color:'#10b981'}}>{fmtCcy(b.sellingValue)}</td>
                      <td style={{textAlign:'right', fontWeight:700, color: b.potentialProfit >= 0 ? '#8b5cf6' : '#ef4444'}}>{fmtCcy(b.potentialProfit)}</td>
                      <td style={{textAlign:'right'}}>
                        <span style={{
                          display:'inline-block', padding:'2px 8px', borderRadius:'12px', fontSize:'0.75rem', fontWeight:700,
                          background: b.marginPercent >= 20 ? '#10b98122' : b.marginPercent >= 10 ? '#f59e0b22' : '#ef444422',
                          color: b.marginPercent >= 20 ? '#059669' : b.marginPercent >= 10 ? '#d97706' : '#dc2626'
                        }}>{b.marginPercent}%</span>
                      </td>
                    </tr>
                  ))}
                  {/* Tenant Totals Footer */}
                  <tr style={{background:'var(--bg-hover,#f1f5f9)', fontWeight:700, borderTop:'2px solid #e2e8f0'}}>
                    <td>🏢 Tenant Total</td>
                    <td style={{textAlign:'right'}}>{fmtNum(branchSummaryData.tenantTotals.itemCount)}</td>
                    <td style={{textAlign:'right'}}>{fmtNum(branchSummaryData.tenantTotals.totalUnits)}</td>
                    <td style={{textAlign:'right', color:'#059669'}}>{fmtCcy(branchSummaryData.tenantTotals.buyingValue)}</td>
                    <td style={{textAlign:'right', color:'#10b981'}}>{fmtCcy(branchSummaryData.tenantTotals.sellingValue)}</td>
                    <td style={{textAlign:'right', color:'#8b5cf6'}}>{fmtCcy(branchSummaryData.tenantTotals.potentialProfit)}</td>
                    <td style={{textAlign:'right'}}>
                      <span style={{
                        display:'inline-block', padding:'2px 8px', borderRadius:'12px', fontSize:'0.75rem', fontWeight:800,
                        background: '#6366f122', color: '#6366f1'
                      }}>{branchSummaryData.tenantTotals.marginPercent}%</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ──────────────────────────────────────────────────────────────────────────
  // DEDICATED TAB 1C — STOCK LEDGER & DRILLDOWN
  // ──────────────────────────────────────────────────────────────────────────
  const renderLedgerTab = () => {
    const selectedProd = productMap.get(selectedLedgerProductId) || products[0] || null;
    const metric = selectedProd
      ? (productValuationList.find(m => m.productId === selectedProd.id && !m.variantId) || {
          productId: selectedProd.id,
          name: selectedProd.name,
          category: selectedProd.category,
          sku: selectedProd.sku || '—',
          currentQuantity: Math.max(0, selectedProd.stock || 0),
          averageCostPrice: selectedProd.buyingPrice || 0,
          lastPurchaseCost: selectedProd.buyingPrice || 0,
          sellingPrice: selectedProd.sellingPrice || selectedProd.price || 0,
          wholesalePrice: (selectedProd as any).wholesalePrice || 0,
          vipPrice: (selectedProd as any).vipPrice || 0,
          onlinePrice: (selectedProd as any).onlinePrice || 0,
          buyingValue: Math.max(0, selectedProd.stock || 0) * (selectedProd.buyingPrice || 0),
          sellingValue: Math.max(0, selectedProd.stock || 0) * (selectedProd.sellingPrice || selectedProd.price || 0),
          expectedProfit: (Math.max(0, selectedProd.stock || 0) * (selectedProd.sellingPrice || selectedProd.price || 0)) - (Math.max(0, selectedProd.stock || 0) * (selectedProd.buyingPrice || 0)),
          profitPercent: (selectedProd.sellingPrice || selectedProd.price || 0) > 0 ? Math.round((((selectedProd.sellingPrice || selectedProd.price || 0) - (selectedProd.buyingPrice || 0)) / (selectedProd.sellingPrice || selectedProd.price || 0)) * 1000) / 10 : 0,
          stockStatus: (selectedProd.stock || 0) <= 0 ? 'Out of Stock' : (selectedProd.stock || 0) < 10 ? 'Low Stock' : 'In Stock',
          lastMovementDate: null,
          lastMovementType: null,
          stockAgeDays: 0,
        })
      : null;

    const displayEntries = ledgerDrilldownEntries.length > 0 && ledgerDrilldownProduct?.productId === selectedProd?.id
      ? ledgerDrilldownEntries
      : (productHistory || []);

    const filteredEntries = displayEntries.filter(e => {
      const q = ledgerSearchQuery.toLowerCase();
      const matchesSearch = !q || (e.notes || '').toLowerCase().includes(q) || (e.user_id || '').toLowerCase().includes(q) || (e.reference_id || '').toLowerCase().includes(q) || (e.movement_type || '').toLowerCase().includes(q);
      const matchesType = ledgerTypeFilter === 'ALL' || e.movement_type === ledgerTypeFilter;
      return matchesSearch && matchesType;
    });

    return (
      <div className="space-y-6">
        {/* Header Toolbar */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-darkbg-card p-4 rounded-xl border dark:border-darkbg-border shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <Activity size={22} />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white m-0 flex items-center gap-2">
                Stock Ledger &amp; Financial Drilldown
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 m-0">
                Immutable double-entry stock movements audit trail &amp; valuation metrics
              </p>
            </div>
          </div>

          {/* Product Selector & Filters */}
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <div className="flex-1 min-w-[220px]">
              <select
                value={selectedLedgerProductId || selectedProd?.id || ''}
                onChange={e => {
                  const targetId = e.target.value;
                  const p = products.find(prod => prod.id === targetId);
                  if (p) openLedgerDrilldown(p);
                }}
                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 text-xs px-2.5 dark:border-darkbg-border dark:bg-darkbg dark:text-white font-semibold focus:outline-none"
              >
                <option value="">— Select Product for Drilldown —</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.stock} in stock)</option>
                ))}
              </select>
            </div>

            <select
              value={ledgerTypeFilter}
              onChange={e => setLedgerTypeFilter(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-slate-50 text-xs px-2 dark:border-darkbg-border dark:bg-darkbg dark:text-white focus:outline-none"
            >
              <option value="ALL">All Movement Types</option>
              <optgroup label="Inbound (+)">
                {(['OPENING_STOCK','PURCHASE_RECEIVE','CUSTOMER_RETURN','TRANSFER_IN','PRODUCTION_OUTPUT','ADJUSTMENT_GAIN'] as const).map(t =>
                  <option key={t} value={t}>{t.replace(/_/g,' ')}</option>
                )}
              </optgroup>
              <optgroup label="Outbound (−)">
                {(['SALE','SUPPLIER_RETURN','TRANSFER_OUT','DAMAGE','EXPIRY','ADJUSTMENT_LOSS','PRODUCTION_USAGE'] as const).map(t =>
                  <option key={t} value={t}>{t.replace(/_/g,' ')}</option>
                )}
              </optgroup>
            </select>

            <div className="relative flex-1 md:w-48">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="h-9 w-full pl-8 pr-3 text-xs rounded-lg border border-slate-200 bg-slate-50 dark:border-darkbg-border dark:bg-darkbg dark:text-white focus:outline-none"
                placeholder="Search notes, ref, user…"
                value={ledgerSearchQuery}
                onChange={e => setLedgerSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Products Valuation Overview Table (Moved to Ledger Drilldown) */}
        <div className="inv-table-card">
          <div className="inv-table-header">
            <h3>Products Valuation &amp; Stock Summary Overview</h3>
            <span className="text-xs text-slate-400 font-normal">Click &quot;Ledger&quot; on any product to view its detailed movement history below</span>
          </div>
          <div style={{padding: '12px', overflowX: 'auto'}}>
            <table className="inv-table" style={{minWidth:'900px'}}>
              <thead>
                <tr>
                  <th>Product Name</th>
                  <th>Category</th>
                  <th>SKU</th>
                  <th style={{textAlign: 'right'}}>Qty</th>
                  <th style={{textAlign: 'right'}}>Avg Cost</th>
                  <th style={{textAlign: 'right'}}>Selling Price</th>
                  <th style={{textAlign: 'right'}}>Buying Value</th>
                  <th style={{textAlign: 'right'}}>Selling Value</th>
                  <th style={{textAlign: 'right'}}>Profit</th>
                  <th style={{textAlign: 'right'}}>Margin</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map(p => {
                  const metric = productValuationList.find(m => m.productId === p.id && !m.variantId);
                  const qty = Math.max(0, p.stock || 0);
                  const avgCost = metric?.averageCostPrice ?? p.buyingPrice ?? 0;
                  const sellPrice = metric?.sellingPrice ?? p.sellingPrice ?? p.price ?? 0;
                  const buyVal = metric?.buyingValue ?? (qty * avgCost);
                  const sellVal = metric?.sellingValue ?? (qty * sellPrice);
                  const profit = metric?.expectedProfit ?? (sellVal - buyVal);
                  const margin = metric?.profitPercent ?? (sellVal > 0 ? Math.round((profit / sellVal) * 1000) / 10 : 0);
                  const status = metric?.stockStatus ?? (qty <= 0 ? 'Out of Stock' : qty < 10 ? 'Low Stock' : 'In Stock');
                  const statusColor = status === 'Out of Stock' ? '#ef4444' : status === 'Low Stock' ? '#f59e0b' : status === 'Overstock' ? '#a855f7' : '#10b981';

                  const isSelected = selectedProd?.id === p.id;

                  return (
                    <tr key={p.id} className={isSelected ? 'bg-indigo-50/50 dark:bg-indigo-950/30' : undefined}>
                      <td style={{fontWeight: 600}}>
                        {p.name}
                        {p.hasVariants && <span style={{marginLeft:'4px', fontSize:'0.65rem', opacity:0.5}}>(variants)</span>}
                      </td>
                      <td><span className="inv-badge">{p.category}</span></td>
                      <td><code style={{fontSize:'0.7rem'}}>{(p.sku && p.sku !== '—' && p.sku.trim()) ? p.sku : generateAutoSku(p.name, p.category, p.id)}</code></td>
                      <td style={{textAlign:'right', fontWeight:700, color: qty <= 0 ? '#ef4444' : qty < 10 ? '#f59e0b' : undefined}}>{fmtNum(qty)}</td>
                      <td style={{textAlign:'right', color:'#64748b', fontSize:'0.8rem'}}>{fmtCcy(avgCost)}</td>
                      <td style={{textAlign:'right'}}>{fmtCcy(sellPrice)}</td>
                      <td style={{textAlign:'right', fontWeight:600, color:'#059669'}}>{fmtCcy(buyVal)}</td>
                      <td style={{textAlign:'right', fontWeight:600, color:'#10b981'}}>{fmtCcy(sellVal)}</td>
                      <td style={{textAlign:'right', fontWeight:700, color: profit >= 0 ? '#8b5cf6' : '#ef4444'}}>{fmtCcy(profit)}</td>
                      <td style={{textAlign:'right'}}>
                        <span style={{
                          display:'inline-block', padding:'2px 6px', borderRadius:'10px', fontSize:'0.72rem', fontWeight:700,
                          background: margin >= 20 ? '#10b98122' : margin >= 10 ? '#f59e0b22' : '#ef444422',
                          color: margin >= 20 ? '#059669' : margin >= 10 ? '#d97706' : '#dc2626'
                        }}>{margin}%</span>
                      </td>
                      <td>
                        <span style={{
                          display:'inline-block', padding:'2px 8px', borderRadius:'10px', fontSize:'0.7rem', fontWeight:600,
                          background: statusColor + '18', color: statusColor, whiteSpace:'nowrap'
                        }}>{status}</span>
                      </td>
                      <td>
                        <div style={{display:'flex', gap:'6px', alignItems:'center'}}>
                          <button
                            title="View Stock Ledger Drilldown"
                            onClick={() => openLedgerDrilldown(metric || p)}
                            className={`px-2.5 py-1 text-xs font-bold rounded-lg transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
                              isSelected
                                ? 'bg-indigo-600 text-white shadow-xs'
                                : 'bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/80 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800'
                            }`}
                          >
                            <Eye size={13}/> Ledger
                          </button>
                          <button className="inv-view-all-btn" onClick={() => openEditor(p)}>Edit</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              {products.length === 0 && (
                <tr>
                  <td colSpan={12} style={{textAlign: 'center', padding: '32px', opacity: 0.5}}>
                    No products found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
        {metric && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-3">
              {[
                { label: 'Current Qty', value: fmtNum(metric.currentQuantity), color:'#3b82f6' },
                { label: 'Avg Cost', value: fmtCcy(metric.averageCostPrice), color:'#059669' },
                { label: 'Selling Price', value: fmtCcy(metric.sellingPrice), color:'#10b981' },
                { label: 'Buying Value', value: fmtCcy(metric.buyingValue), color:'#059669' },
                { label: 'Selling Value', value: fmtCcy(metric.sellingValue), color:'#10b981' },
                { label: 'Expected Profit', value: fmtCcy(metric.expectedProfit), color:'#8b5cf6' },
                { label: 'Margin %', value: `${metric.profitPercent}%`, color:'#06b6d4' },
                { label: 'Status', value: metric.stockStatus, color: metric.stockStatus === 'Out of Stock' ? '#ef4444' : metric.stockStatus === 'Low Stock' ? '#f59e0b' : '#10b981' },
              ].map(c => (
                <div key={c.label} className="p-3 bg-white dark:bg-darkbg-card border dark:border-darkbg-border rounded-xl shadow-sm">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{c.label}</div>
                  <div className="text-sm font-extrabold" style={{ color: c.color }}>{c.value}</div>
                </div>
              ))}
            </div>

            {/* Price Tiers & Stock Meta */}
            <div className="flex flex-wrap items-center gap-4 p-3 bg-slate-50 dark:bg-darkbg/40 border dark:border-darkbg-border rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300">
              <span>💰 Retail: <strong className="text-slate-900 dark:text-white">{metric.sellingPrice > 0 ? fmtCcy(metric.sellingPrice) : 'Not Set'}</strong></span>
              <span>🏪 Wholesale: <strong className="text-slate-900 dark:text-white">{metric.wholesalePrice > 0 ? fmtCcy(metric.wholesalePrice) : 'Not Set'}</strong></span>
              <span>⭐ VIP: <strong className="text-slate-900 dark:text-white">{metric.vipPrice > 0 ? fmtCcy(metric.vipPrice) : 'Not Set'}</strong></span>
              <span>🌐 Online: <strong className="text-slate-900 dark:text-white">{metric.onlinePrice > 0 ? fmtCcy(metric.onlinePrice) : 'Not Set'}</strong></span>
              <span className="ml-auto text-slate-400">SKU: <code className="font-mono bg-white dark:bg-darkbg px-1.5 py-0.5 rounded border border-slate-200 dark:border-darkbg-border text-slate-700 dark:text-slate-200">{(metric.sku && metric.sku !== '—' && metric.sku.trim()) ? metric.sku : generateAutoSku(metric.name, metric.category, metric.productId)}</code></span>
            </div>
          </div>
        )}

        {/* Stock Movement Audit Log Table */}
        <div className="p-4 bg-white dark:bg-darkbg-card border dark:border-darkbg-border rounded-xl shadow-sm space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-slate-800 dark:text-white m-0">
              Stock Movement Audit Log ({filteredEntries.length} entries)
            </h3>
            <span className="text-xs text-slate-400">Showing full transaction history</span>
          </div>

          <div className="overflow-x-auto">
            <table className="inv-table min-w-[750px]">
              <thead>
                <tr>
                  <th>Date &amp; Time</th>
                  <th>Movement Type</th>
                  <th style={{textAlign:'right'}}>Change</th>
                  <th style={{textAlign:'right'}}>After</th>
                  <th style={{textAlign:'right'}}>Unit Cost</th>
                  <th style={{textAlign:'right'}}>Total Cost</th>
                  <th>Reference</th>
                  <th>User</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map(e => (
                  <tr key={e.id} className={INBOUND_TYPES.has(e.movement_type) ? 'inv-row-inbound' : 'inv-row-outbound'}>
                    <td style={{whiteSpace:'nowrap', fontSize:'0.75rem'}}>{fmtDateTime(e.created_at)}</td>
                    <td>
                      <span className={`inv-move-chip ${INBOUND_TYPES.has(e.movement_type) ? 'inbound' : 'outbound'}`}>
                        {e.movement_type.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td style={{textAlign:'right', fontWeight:700, color: e.quantity_change > 0 ? '#10b981' : '#ef4444'}}>
                      {e.quantity_change > 0 ? '+' : ''}{fmtNum(e.quantity_change)}
                    </td>
                    <td style={{textAlign:'right', fontWeight:600}}>{fmtNum(e.quantity_after)}</td>
                    <td style={{textAlign:'right', color:'#64748b', fontSize:'0.8rem'}}>{e.unit_cost ? fmtCcy(e.unit_cost) : '—'}</td>
                    <td style={{textAlign:'right', color:'#64748b', fontSize:'0.8rem'}}>{e.total_cost ? fmtCcy(e.total_cost) : '—'}</td>
                    <td style={{fontSize:'0.75rem', opacity:0.8}}><code className="text-[11px]">{e.reference_type || '—'}</code></td>
                    <td style={{fontSize:'0.75rem', opacity:0.8}}>{e.user_id}</td>
                    <td style={{fontSize:'0.75rem', opacity:0.8}}>{e.notes || '—'}</td>
                  </tr>
                ))}

                {filteredEntries.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-center py-10 text-slate-400 italic text-xs">
                      No stock movements found matching current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // ──────────────────────────────────────────────────────────────────────────
  // DEDICATED TAB 1D — ALERTS
  // ──────────────────────────────────────────────────────────────────────────
  const renderAlertsTab = () => {
    // Use memoized alert lists computed at component level

    return (
      <div className="inv-alerts-view">
        <div className="inv-toolbar">
          <h2 style={{margin:0}}>Stock Alerts &amp; Critical Levels</h2>
        </div>

        <div className="inv-kpi-grid" style={{marginTop: '16px'}}>
          <div className="inv-kpi-card" style={{ '--accent': '#ef4444' } as React.CSSProperties}>
            <div className="inv-kpi-icon" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}><AlertCircle size={20}/></div>
            <div className="inv-kpi-body">
              <div className="inv-kpi-value">{outOfStockAlerts.length}</div>
              <div className="inv-kpi-label">Out of Stock</div>
              <div className="inv-kpi-sub">Critical attention needed</div>
            </div>
          </div>
          <div className="inv-kpi-card" style={{ '--accent': '#f59e0b' } as React.CSSProperties}>
            <div className="inv-kpi-icon" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}><AlertTriangle size={20}/></div>
            <div className="inv-kpi-body">
              <div className="inv-kpi-value">{lowStockAlerts.length}</div>
              <div className="inv-kpi-label">Low Stock Items</div>
              <div className="inv-kpi-sub">Below safety thresholds</div>
            </div>
          </div>
          <div className="inv-kpi-card" style={{ '--accent': '#6366f1' } as React.CSSProperties}>
            <div className="inv-kpi-icon" style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1' }}><Zap size={20}/></div>
            <div className="inv-kpi-body">
              <div className="inv-kpi-value">{reorderAlerts.length}</div>
              <div className="inv-kpi-label">Reorder Alerts</div>
              <div className="inv-kpi-sub">Rules triggered</div>
            </div>
          </div>
          <div className="inv-kpi-card" style={{ '--accent': '#10b981' } as React.CSSProperties}>
            <div className="inv-kpi-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}><DollarSign size={20}/></div>
            <div className="inv-kpi-body">
              <div className="inv-kpi-value">{fmtCcy(reorderAlerts.reduce((s,a) => s + (a.deficit * (productMap.get(a.rule.product_id)?.buyingPrice ?? 0)), 0))}</div>
              <div className="inv-kpi-label">Est. Restock Cost</div>
              <div className="inv-kpi-sub">Deficit × buying price</div>
            </div>
          </div>
        </div>

        {/* Reorder Alerts Table */}
        {reorderAlerts.length > 0 && (
          <div className="inv-table-card" style={{marginTop: '20px'}}>
            <div className="inv-table-header" style={{background: 'rgba(99,102,241,0.05)'}}>
              <h3 style={{color:'#6366f1'}}><Zap size={15}/> Reorder Rule Alerts ({reorderAlerts.length})</h3>
              <span style={{fontSize:'0.75rem',color:'#64748b'}}>Products that have triggered automatic reorder rules</span>
            </div>
            <div style={{overflowX:'auto'}}>
              <table className="inv-table">
                <thead>
                  <tr>
                    <th>Product</th><th>Current Stock</th><th>Min Level</th><th>Deficit</th><th>Reorder Qty</th><th>Supplier</th><th>Lead Time</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reorderAlerts.map(a => (
                    <tr key={a.rule.id} className="inv-row-alert">
                      <td style={{fontWeight:600}}>{a.productName}</td>
                      <td><span style={{color:'#ef4444',fontWeight:700}}>{a.currentStock}</span></td>
                      <td>{a.rule.min_quantity}</td>
                      <td><span style={{color:'#f59e0b',fontWeight:600}}>-{a.deficit}</span></td>
                      <td><span style={{color:'#10b981',fontWeight:600}}>{a.rule.reorder_quantity}</span></td>
                      <td>{a.rule.preferred_supplier_name ?? '—'}</td>
                      <td>{a.rule.lead_time_days}d</td>
                      <td>
                        <button className="inv-view-all-btn" onClick={() => {
                          const prod = productMap.get(a.rule.product_id);
                          if (prod) openAdjustment(prod);
                        }}>Quick Adjust</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Out of Stock Table */}
        <div className="inv-table-card" style={{marginTop: '20px'}}>
          <div className="inv-table-header" style={{background: 'rgba(239, 68, 68, 0.05)'}}>
            <h3 style={{color: '#ef4444'}}><AlertCircle size={15}/> Out of Stock Items ({outOfStockAlerts.length})</h3>
          </div>
          <div style={{overflowX: 'auto'}}>
            <table className="inv-table">
              <thead>
                <tr>
                  <th>Product Name / Variant</th>
                  <th>Category</th>
                  <th>SKU</th>
                  <th>Brand</th>
                  <th style={{textAlign: 'right'}}>Buying Price</th>
                  <th style={{textAlign: 'right'}}>Selling Price</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {outOfStockAlerts.map(item => (
                  <tr key={item.id} className="inv-row-danger">
                    <td style={{fontWeight: 600}}>
                      {item.name}
                      {item.isVariant && <span style={{fontSize:'10px', background:'rgba(239,68,68,0.15)', color:'#ef4444', padding:'2px 6px', borderRadius:'4px', marginLeft:'6px'}}>Variant</span>}
                    </td>
                    <td>{item.category}</td>
                    <td><code>{item.sku}</code></td>
                    <td>{item.brand}</td>
                    <td style={{textAlign: 'right'}}>{fmtCcy(item.buyingPrice)}</td>
                    <td style={{textAlign: 'right'}}>{fmtCcy(item.sellingPrice)}</td>
                    <td>
                      <div style={{display:'flex',gap:'4px'}}>
                        {item.productRef && <button className="inv-view-all-btn" onClick={() => openAdjustment(item.productRef!, item.isVariant ? item.variantId : undefined)}>Adjust Stock</button>}
                        {item.productRef && <button className="inv-view-all-btn" onClick={() => openEditor(item.productRef!)} style={{background:'transparent'}}>Edit</button>}
                      </div>
                    </td>
                  </tr>
                ))}
                {outOfStockAlerts.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{textAlign: 'center', padding: '24px', opacity: 0.5, color: '#10b981', fontWeight: 600}}>
                      🎉 Outstanding! No items are out of stock.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Low Stock Table */}
        <div className="inv-table-card" style={{marginTop: '20px'}}>
          <div className="inv-table-header" style={{background: 'rgba(245, 158, 11, 0.05)'}}>
            <h3 style={{color: '#b45309'}}><AlertTriangle size={15}/> Low Stock Items ({lowStockAlerts.length})</h3>
          </div>
          <div style={{overflowX: 'auto'}}>
            <table className="inv-table">
              <thead>
                <tr>
                  <th>Product Name / Variant</th>
                  <th>Category</th>
                  <th>SKU</th>
                  <th style={{textAlign: 'right'}}>Current Stock</th>
                  <th style={{textAlign: 'right'}}>Buying Price</th>
                  <th style={{textAlign: 'right'}}>Selling Price</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {lowStockAlerts.map(item => (
                  <tr key={item.id} className="inv-row-warning">
                    <td style={{fontWeight: 600}}>
                      {item.name}
                      {item.isVariant && <span style={{fontSize:'10px', background:'rgba(245,158,11,0.15)', color:'#b45309', padding:'2px 6px', borderRadius:'4px', marginLeft:'6px'}}>Variant</span>}
                    </td>
                    <td>{item.category}</td>
                    <td><code>{item.sku}</code></td>
                    <td style={{textAlign: 'right', fontWeight: 'bold', color: '#b45309'}}>{item.stock}</td>
                    <td style={{textAlign: 'right'}}>{fmtCcy(item.buyingPrice)}</td>
                    <td style={{textAlign: 'right'}}>{fmtCcy(item.sellingPrice)}</td>
                    <td>
                      <div style={{display:'flex', gap:'4px', alignItems:'center'}}>
                        {item.productRef && (
                          <button
                            title="View Stock Ledger"
                            onClick={() => openLedgerDrilldown(item.productRef!)}
                            style={{
                              padding:'3px 7px', borderRadius:'5px', fontSize:'0.7rem',
                              border:'1px solid rgba(99, 102, 241, 0.3)', background:'rgba(99, 102, 241, 0.12)',
                              color:'#6366f1', cursor:'pointer', fontWeight:600, display:'inline-flex', alignItems:'center'
                            }}
                          ><Eye size={13}/></button>
                        )}
                        {item.productRef && <button className="inv-view-all-btn" onClick={() => openAdjustment(item.productRef!, item.isVariant ? item.variantId : undefined)}>Adjust Stock</button>}
                        {item.productRef && <button className="inv-view-all-btn" onClick={() => openEditor(item.productRef!)} style={{background:'transparent'}}>Edit / Restock</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              {lowStockAlerts.length === 0 && (
                <tr>
                  <td colSpan={7} style={{textAlign: 'center', padding: '24px', opacity: 0.5, color: '#10b981', fontWeight: 600}}>
                    🎉 Fantastic! No items are below low-stock limits.
                  </td>
                </tr>
              )}
            </table>
          </div>
        </div>
      </div>
    );
  };


  // ──────────────────────────────────────────────────────────────────────────
  // TAB 2 — PRODUCTS (Full editor preserved + enhanced with Batch/Serial/Reorder tabs)
  // ──────────────────────────────────────────────────────────────────────────

  const attrsKey = (attrs: Record<string, string>) =>
    JSON.stringify(Object.fromEntries(Object.entries(attrs).sort(([a], [b]) => a.localeCompare(b))));

  const generateCombinations = (attributes: Record<string, string[]>): Record<string, string>[] => {
    const keys = Object.keys(attributes);
    if (keys.length === 0) return [];
    let results: Record<string, string>[] = [{}];
    for (const key of keys) {
      const next: Record<string, string>[] = [];
      for (const res of results) for (const val of attributes[key]) next.push({ ...res, [key]: val });
      results = next;
    }
    return results;
  };

  const handleGenerateVariants = () => {
    const combos = generateCombinations(customAttributes);
    if (combos.length === 0) { alert('Add at least one attribute with values first.'); return; }
    const parentShort = pName ? pName.replace(/\s+/g, '').slice(0, 4).toUpperCase() : 'PROD';
    const generated: ProductVariant[] = combos.map((combo, idx) => {
      const skuSuffix = Object.values(combo).map(v => v.replace(/\s+/g, '').toUpperCase().slice(0, 4)).join('-');
      const existingMatch = localVariants.find(v => attrsKey(v.attributes) === attrsKey(combo));
      if (existingMatch) return existingMatch;
      return {
        id: `var-${pId}-${idx}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        productId: pId, sku: `${parentShort}-${skuSuffix}`, barcode: '',
        stock: 0, reservedStock: 0, reorderLevel: 5, status: 'Active' as const,
        attributes: combo, buyingPrice: undefined, sellingPrice: undefined,
        inheritBuyingPrice: true, inheritSellingPrice: true,
        tenant_id: currentTenant.id, branch_id: currentBranch.id,
      };
    });
    setLocalVariants(prev => {
      const merged = [...prev];
      generated.forEach(g => {
        const index = merged.findIndex(m => attrsKey(m.attributes) === attrsKey(g.attributes));
        if (index >= 0) merged[index] = g; else merged.push(g);
      });
      return merged;
    });
  };

  const handleDeleteVariant = async (variantId: string) => {
    if (!window.confirm('Are you sure you want to delete this variant?')) return;
    try {
      const ledgerCount = await db.stockLedger.where('variant_id').equals(variantId).count();
      if (ledgerCount > 0) {
        const choice = window.confirm(`⚠️ This variant has ${ledgerCount} stock transaction record(s).\n\nClick OK to deactivate/archive this variant, or Cancel to abort.`);
        if (choice) {
          setLocalVariants(prev => prev.map(v => v.id === variantId ? { ...v, status: 'Inactive' } : v));
          setDeleteToastMessage('Variant deactivated successfully.');
          setTimeout(() => setDeleteToastMessage(''), 4000);
        }
        return;
      }

      setLocalVariants(prev => prev.filter(v => v.id !== variantId));
      setSelectedVariantIds(prev => { const n = new Set(prev); n.delete(variantId); return n; });
      if (editingVariantIdx !== null) setEditingVariantIdx(null);

      await db.productVariants.delete(variantId);
      await db.stockBalance.where('variant_id').equals(variantId).delete();

      if (pId) {
        await syncParentStock(pId);
      }

      await db.syncQueue.add({
        actionType: 'DELETE',
        entityName: 'productVariants',
        payload: { id: variantId, tenant_id: currentTenant.id, productId: pId },
        timestamp: Date.now(),
        status: 'Pending',
      });

      setDeleteToastMessage('Variant deleted successfully.');
      setTimeout(() => setDeleteToastMessage(''), 4000);
    } catch (err: any) {
      alert('Error deleting variant: ' + err.message);
    }
  };

  const handleUpdateVariant = (idx: number, updates: Partial<ProductVariant>) => {
    setLocalVariants(prev => prev.map((v, i) => {
      if (i !== idx) return v;
      const merged = { ...v, ...updates };
      // When toggling BACK to inherit, clear the manual override price so
      // it doesn't linger as a stale value and block the inherit logic.
      if (updates.inheritBuyingPrice === true)  merged.buyingPrice  = undefined;
      if (updates.inheritSellingPrice === true)  merged.sellingPrice = undefined;
      return merged;
    }));
  };

  const handleSaveProduct = async () => {
    if (isSaving) return;
    if (!pName.trim() || !pCategory.trim()) { alert('Product Name and Category are required.'); setEditorTab('general'); return; }
    if (pHasVariants && localVariants.length === 0) { alert('Add at least one variant or disable Has Variants.'); setEditorTab('variants'); return; }
    if (pHasVariants && localVariants.find(v => !v.sku.trim())) { alert('All variants must have a SKU.'); setEditorTab('variants'); return; }

    // Front-end Validation: Prevent duplicate attribute combinations or duplicate SKUs
    if (pHasVariants) {
      const seenAttrSigs = new Map<string, string>();
      const seenSkus = new Map<string, string>();

      for (let i = 0; i < localVariants.length; i++) {
        const v = localVariants[i];
        const attrLabel = Object.entries(v.attributes || {}).map(([k, val]) => `${k}: ${val}`).join(', ') || `Variant #${i + 1}`;
        const attrSig = Object.values(v.attributes || {}).map(val => String(val).trim().toLowerCase()).sort().join('|');
        const skuVal = (v.sku || '').trim().toLowerCase();

        if (attrSig && seenAttrSigs.has(attrSig)) {
          alert(`⚠️ Validation Error: Duplicate variant combination detected ("${attrLabel}"). Each variant must have unique attribute values.`);
          setEditorTab('variants');
          return;
        }
        if (attrSig) seenAttrSigs.set(attrSig, attrLabel);

        if (skuVal && seenSkus.has(skuVal)) {
          alert(`⚠️ Validation Error: Duplicate SKU "${v.sku}" detected on variant "${attrLabel}". Each variant must have a distinct SKU.`);
          setEditorTab('variants');
          return;
        }
        if (skuVal) seenSkus.set(skuVal, attrLabel);
      }
    }

    // Validate that any variant NOT inheriting a price has an explicit non-zero value
    if (pHasVariants) {
      for (const v of localVariants) {
        const label = Object.values(v.attributes).join('/') || v.sku;
        if (!v.inheritBuyingPrice && (!v.buyingPrice || v.buyingPrice <= 0)) {
          alert(`Variant "${label}" has "Override Buying Price" selected but no price entered. Enter a buying price or check Inherit.`);
          setEditorTab('variants');
          return;
        }
        if (!v.inheritSellingPrice && (!v.sellingPrice || v.sellingPrice <= 0)) {
          alert(`Variant "${label}" has "Override Selling Price" selected but no price entered. Enter a selling price or check Inherit.`);
          setEditorTab('variants');
          return;
        }
      }
    }

    const targetTime = (!selectedProduct && productCreatedAtDate) ? new Date(productCreatedAtDate).getTime() : Date.now();
    const isBackdated = Date.now() - targetTime > 60 * 60 * 1000;

    if (!selectedProduct && productCreatedAtDate) {
      if (targetTime > Date.now() + 5 * 60 * 1000) {
        alert('Creation date cannot be in the future.');
        return;
      }
      const twoYearsAgo = Date.now() - 2 * 365 * 24 * 60 * 60 * 1000;
      if (targetTime < twoYearsAgo) {
        alert('Creation date cannot be older than two years.');
        return;
      }
    }

    const securityConfig = (securitySetting?.config || DEFAULT_SECURITY_CONFIG) as SecurityConfig;
    const allowBackdated = securityConfig.allowBackdatedProducts;
    if (isBackdated && !allowBackdated) {
      alert('Backdated product creation is currently disabled in settings.');
      return;
    }

    const proceedToSave = async () => {
      setIsSaving(true);
      try {
        const finalHasVariants = Boolean(pHasVariants || localVariants.length > 0);

        const savedProd: Product = {
          id: pId, name: pName.trim(), category: pCategory.trim(),
          buyingPrice: pBuyingPrice, sellingPrice: pSellingPrice, price: pSellingPrice,
          stock: 0, expiryDate: pExpiry || undefined,
          tenant_id: currentTenant.id, branch_id: currentBranch.id,
          module: pModule || activeModule,
          hasVariants: finalHasVariants,
          has_variants: finalHasVariants,
          brand: pBrand.trim() || undefined, description: pDescription.trim() || undefined,
          supplier: pSupplier.trim() || undefined,
          supplier_id: pSupplierId || undefined,
          attributes: finalHasVariants ? Object.keys(customAttributes) : undefined,
          sku: pSku.trim() || undefined, barcode: pBarcode.trim() || undefined,
          createdAt: targetTime,
          ...(pImageUrl.trim() && { image_url: pImageUrl.trim() }),
          ...(pTaxRate > 0 && { taxRate: pTaxRate }),
          ...(pWholesalePrice > 0 && { wholesalePrice: pWholesalePrice }),
          ...(pVipPrice > 0 && { vipPrice: pVipPrice }),
          ...(pOnlinePrice > 0 && { onlinePrice: pOnlinePrice }),
        } as any;

        const ctx = { id: user?.id || 'usr-anon', tenant_id: currentTenant.id, branch_id: currentBranch.id, role: user?.role || 'Business Owner', name: user?.name || 'User' };

        let finalProduct: Product;
        if (selectedProduct) {
          savedProd.stock = finalHasVariants ? localVariants.reduce((sum, lv) => sum + (Number(lv.stock) || 0), 0) : (Number(pStock) || 0);
          finalProduct = await ProductService.updateProduct(pId, savedProd, ctx, isOnline);
        } else {
          finalProduct = await ProductService.createProduct(savedProd, ctx, isOnline);
        }
        const finalProductId = finalProduct.id;

        const preSnapshotVars = await db.productVariants.where('productId').equals(finalProductId).toArray();

        for (const ev of preSnapshotVars) {
          if (!finalHasVariants || !localVariants.find(lv => lv.id === ev.id)) {
            await queueOperation('DELETE', 'productVariants' as any, ev);
            await db.productVariants.delete(ev.id);
          }
        }

        if (finalHasVariants) {
          for (const lv of localVariants) {
            const isNew = !preSnapshotVars.find(ev => ev.id === lv.id);
            const freshVar = { 
              ...lv, 
              productId: finalProductId,
              tenant_id: currentTenant.id,
              branch_id: currentBranch.id,
              buyingPrice:  lv.inheritBuyingPrice  ? undefined : (lv.buyingPrice  ?? pBuyingPrice),
              sellingPrice: lv.inheritSellingPrice ? undefined : (lv.sellingPrice ?? pSellingPrice),
            };
            const stockVal = isNew ? (lv.stock || 0) : (preSnapshotVars.find(ev => ev.id === lv.id)?.stock ?? 0);
            freshVar.stock = stockVal;
            await db.productVariants.put(freshVar);
            await queueOperation(isNew ? 'INSERT' : 'UPDATE', 'productVariants' as any, freshVar);

            if (isNew && stockVal > 0) {
              await recordStockMovement({
                tenant_id: currentTenant.id, branch_id: currentBranch.id, warehouse_id: allWarehouses[0]?.id || 'warehouse-main',
                product_id: finalProductId, variant_id: lv.id, movement_type: 'OPENING_STOCK', reference_type: 'OPENING',
                quantity_change: stockVal, unit_cost: freshVar.buyingPrice || pBuyingPrice,
                total_cost: (freshVar.buyingPrice || pBuyingPrice) * stockVal,
                user_id: user?.name || 'System', notes: `Opening stock: ${Object.values(lv.attributes).join(' / ')}`,
                created_at: targetTime,
              });
            }
          }
        }

        await syncParentStock(finalProductId);

        // Opening stock ledger entries for new simple products
        if (!selectedProduct && !pHasVariants && pStock > 0) {
          await recordStockMovement({
            tenant_id: currentTenant.id, branch_id: currentBranch.id, warehouse_id: allWarehouses[0]?.id || 'warehouse-main',
            product_id: finalProductId, movement_type: 'OPENING_STOCK', reference_type: 'OPENING',
            quantity_change: pStock, unit_cost: pBuyingPrice, total_cost: pBuyingPrice * pStock,
            user_id: user?.name || 'System', notes: 'Initial opening stock',
            created_at: targetTime,
          });
        }

        setIsEditorOpen(false);
        setSelectedProduct(null);
      } catch (err: any) {
        alert('Error saving product: ' + err.message);
      } finally {
        setIsSaving(false);
      }
    };

    const isOwnerOrManager = ['Super Admin', 'Business Owner', 'Tenant Owner', 'Branch Manager'].includes(user?.role || '');
    if (isBackdated && !isOwnerOrManager) {
      requestPinApproval(
        `Authorize backdated product creation on ${new Date(targetTime).toLocaleString()}`,
        async () => {
          await proceedToSave();
        }
      );
    } else {
      await proceedToSave();
    }
  };

  useEffect(() => {
    if (!isEditorOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSaveProduct();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditorOpen, handleSaveProduct]);

  const openDeleteConfirmation = async (product: Product) => {
    setProductToDelete(product);
    try {
      const historyInfo = await ProductService.checkSalesHistory(product.id);
      setDeleteHasSalesHistory(historyInfo.hasSales);
      setDeleteSalesCount(historyInfo.salesCount);
      setDeleteModeChoice(historyInfo.hasSales ? 'archive' : 'permanent');
    } catch {
      setDeleteHasSalesHistory(false);
      setDeleteSalesCount(0);
      setDeleteModeChoice('permanent');
    }
    setIsDeleteConfirmOpen(true);
  };

  const handleDeleteProduct = async () => {
    if (!productToDelete) return;
    setIsDeleting(true);
    try {
      const ctx = { id: user?.id || 'usr-anon', tenant_id: currentTenant.id, branch_id: currentBranch.id, role: user?.role || 'Business Owner', name: user?.name || 'User' };
      const isPermanent = deleteModeChoice === 'permanent';
      const isArchive = deleteModeChoice === 'archive';

      await ProductService.deleteProduct(productToDelete.id, ctx, isOnline, {
        permanent: isPermanent,
        archive: isArchive
      });

      // Trigger sync push immediately to propagate deletion to server
      syncData(true).catch(() => {});

      const msg = isArchive
        ? `Product archived successfully. ${productToDelete.name} has been set to inactive.`
        : `Product deleted successfully. ${productToDelete.name} has been permanently removed.`;

      setDeleteToastMessage(msg);
      setTimeout(() => setDeleteToastMessage(''), 5000);
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setIsDeleting(false);
      setIsDeleteConfirmOpen(false);
      setProductToDelete(null);
    }
  };

  const handleSaveBatch = async () => {
    if (!batchNum.trim() || batchQty <= 0) { alert('Batch number and quantity are required.'); return; }
    setBatchSaving(true);
    try {
      await receiveBatchLot({
        tenantId: currentTenant.id, branchId: currentBranch.id,
        productId: pId, batchNumber: batchNum,
        supplierName: batchSupplier || undefined,
        expiryDate: batchExpiry ? new Date(batchExpiry).getTime() : undefined,
        quantityReceived: batchQty, unitCost: batchCost || pBuyingPrice,
        createdBy: user?.name || 'System',
      });
      setBatchNum(''); setBatchQty(0); setBatchCost(0); setBatchExpiry(''); setBatchSupplier('');
    } catch (e: any) { alert('Failed to save batch: ' + e.message); }
    setBatchSaving(false);
  };

  const handleSaveReorderRule = async () => {
    setRrSaving(true);
    try {
      await saveReorderRule({
        id: productReorderRule?.id,
        tenant_id: currentTenant.id, branch_id: currentBranch.id,
        product_id: pId, min_quantity: rrMinQty, max_quantity: rrMaxQty,
        reorder_quantity: rrReorderQty, preferred_supplier_name: rrSupplier || undefined,
        lead_time_days: rrLeadTime, auto_reorder: false, is_active: true,
      });
      alert('✅ Reorder rule saved.');
    } catch (e: any) { alert('Error: ' + e.message); }
    setRrSaving(false);
  };

  const handleAddSerials = async () => {
    const lines = serialInput.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return;
    await addSerialNumbers({
      tenantId: currentTenant.id, branchId: currentBranch.id,
      productId: pId,
      serials: lines.map(s => ({ serial_number: s })),
    });
    setSerialInput('');
  };

  const renderProductsTab = () => (
    <div className="inv-products-view">
      {/* Toolbar */}
      <div className="inv-toolbar">
        <div className="inv-search-wrap">
          <Search size={14} className="inv-search-icon"/>
          <input className="inv-search" placeholder="Search by name, category, brand…"
            value={searchQuery} onChange={e => setSearchQuery(e.target.value)}/>
        </div>
        <div className="inv-filter-btns">
          {(['all','simple','variant'] as const).map(f => (
            <button key={f} className={`inv-filter-btn ${filterType === f ? 'active' : ''}`}
              onClick={() => setFilterType(f)}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div className="inv-stats-mini">
          <span className="stat-chip total"><Package size={12}/> {stats.total}</span>
          <span className="stat-chip warning"><AlertTriangle size={12}/> {stats.lowStock} low</span>
          <span className="stat-chip danger"><AlertCircle size={12}/> {stats.outOfStock} out</span>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <button
              className="inv-add-btn outline"
              title="Pull latest products from server"
              onClick={async () => {
                const n = await syncFromServer(currentTenant.id);
                if (n > 0) alert(`✅ Synced ${n} product(s) from server.`);
                else alert('✅ Already up to date.');
              }}
            >
              <RefreshCw size={14}/> Sync
            </button>
            <button className="inv-add-btn outline" onClick={() => setIsCsvImportOpen(true)}>
              <FileText size={14}/> Import CSV
            </button>
            <button className="inv-add-btn outline" onClick={() => setIsBarcodePrinterOpen(true)}>
              <Barcode size={14}/> Print Barcodes
            </button>
            <button className="inv-add-btn" onClick={() => openEditor(null)}>
              <Plus size={15}/> Add Product
            </button>
          </div>
        )}
      </div>

      {/* Product Grid */}
      <div className="inv-product-grid">
        {filteredProducts.length === 0 ? (
          <div className="inv-empty-state">
            <Package size={48} opacity={0.3}/>
            <p>No products found</p>
            {canEdit && <button className="inv-add-btn" onClick={() => openEditor(null)}><Plus size={14}/> Add First Product</button>}
          </div>
        ) : filteredProducts.map(p => {
          const effectiveStock = p.hasVariants
            ? productVariants.filter(v => v.productId === p.id && v.status !== 'Inactive').reduce((sum, v) => sum + (Number(v.stock) || 0), 0)
            : (Number(p.stock) || 0);

          return (
            <div key={p.id} className={`inv-product-card ${effectiveStock <= 0 ? 'out-of-stock' : effectiveStock < 10 ? 'low-stock' : ''}`}>
              <div className="inv-product-header">
                <div className="inv-product-icon" style={{ padding: 0, overflow: 'hidden', borderRadius: '8px' }}>
                  {(p as any).image_url ? (
                    <img
                      src={(p as any).image_url}
                      alt={p.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px' }}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    p.hasVariants ? <Layers size={18}/> : <Package size={18}/>
                  )}
                </div>
                <div className="inv-product-info">
                  <div className="inv-product-name">{p.name}</div>
                  <div className="inv-product-cat">{p.category} {p.brand && `· ${p.brand}`}</div>
                </div>
                {effectiveStock <= 0 ? <Badge variant="danger">Out</Badge> : effectiveStock < 10 ? <Badge variant="warning">Low</Badge> : <Badge variant="success">In Stock</Badge>}
              </div>
              <div className="inv-product-meta">
                <span>Stock: <strong>{fmtNum(effectiveStock)}</strong></span>
                <span>Buy: <strong>{fmtCcy(p.buyingPrice)}</strong></span>
                <span>Sell: <strong>{fmtCcy(p.sellingPrice || p.price)}</strong></span>
              </div>
              <div className="inv-product-actions">
                <button onClick={() => openEditor(p)} title="Edit Product" className="inv-icon-btn edit"><Edit size={14}/></button>
                <button onClick={() => openLedgerDrilldown(p)} title="View Stock Ledger" className="inv-icon-btn view" style={{ color: '#6366f1' }}><Eye size={14}/></button>
                <button onClick={() => openAdjustment(p)} title="Adjust Stock" className="inv-icon-btn adjust"><Sliders size={14}/></button>
                {canEdit && (
                  <button onClick={() => openDeleteConfirmation(p)} title="Delete" className="inv-icon-btn delete"><Trash2 size={14}/></button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Product Editor Dialog */}
      <Dialog
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        title={selectedProduct ? `Edit Product: ${pName}` : 'Add New Product'}
        size="xl"
        subHeader={
          <div className="inv-editor-tabs flex items-center gap-1 overflow-x-auto border-b-0 bg-transparent">
            {PRODUCT_TABS.map(t => (
              <button key={t.id} className={`inv-editor-tab ${editorTab === t.id ? 'active' : ''}`}
                onClick={() => setEditorTab(t.id)}>
                {t.icon} <span>{t.label}</span>
                {t.id === 'variants' && pHasVariants && localVariants.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 text-[10px] font-extrabold bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 rounded-full">
                    {localVariants.length}
                  </span>
                )}
              </button>
            ))}
          </div>
        }
        footer={
          <div className="flex items-center justify-between w-full">
            <span className="text-[11px] text-slate-400 font-medium hidden sm:inline-block">
              Press <kbd className="px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 bg-slate-100 border border-slate-300 rounded-md dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">Ctrl+S</kbd> to save
            </span>
            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                className="px-3.5 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all"
                onClick={() => setIsEditorOpen(false)}
              >
                Cancel
              </button>
              {editorTab !== 'history' && editorTab !== 'batch' && editorTab !== 'serials' && editorTab !== 'reorder' && (
                <button
                  type="button"
                  className="px-4 py-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-xs flex items-center gap-1.5 transition-all disabled:opacity-50"
                  onClick={handleSaveProduct}
                  disabled={isSaving}
                >
                  {isSaving ? <RefreshCw size={13} className="spin animate-spin" /> : <Check size={13} />}
                  <span>{selectedProduct ? 'Update Product' : 'Create Product'}</span>
                </button>
              )}
            </div>
          </div>
        }
      >
        <div className="inv-editor-body">
            {/* General Tab */}
            {editorTab === 'general' && (
              <div className="space-y-2">
                {/* Row 1: Product Name + Compact Image Upload Widget */}
                <div className="flex flex-col sm:flex-row gap-2.5 items-center pb-2 border-b border-slate-100 dark:border-darkbg-border/40">
                  {/* Product Name Input */}
                  <div className="flex-1 w-full space-y-0.5">
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-200">Product Name *</label>
                    <input
                      className="inv-input w-full font-semibold text-xs h-8"
                      value={pName}
                      onChange={e => setPName(e.target.value)}
                      placeholder="e.g. Serengeti Premium Lager 500ml"
                    />
                  </div>

                  {/* Compact Image Widget */}
                  <div className="shrink-0 flex items-center gap-1.5 p-1 bg-slate-50 dark:bg-darkbg/90 border border-slate-200 dark:border-darkbg-border rounded-lg">
                    <div
                      className="relative h-9 w-9 rounded border border-dashed border-indigo-300 dark:border-indigo-700/50 bg-white dark:bg-darkbg overflow-hidden flex items-center justify-center cursor-pointer hover:border-indigo-500 transition-all group shrink-0"
                      onClick={() => (document.getElementById('product-image-file-input') as HTMLInputElement)?.click()}
                      title="Click to upload image"
                    >
                      {pImagePreview ? (
                        <>
                          <img src={pImagePreview} alt="Product" className="h-full w-full object-contain" />
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <span className="text-white text-[7px] font-bold">Edit</span>
                          </div>
                        </>
                      ) : (
                        <Upload className="h-3.5 w-3.5 text-indigo-500" />
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <input
                        id="product-image-file-input"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (file.size > 5 * 1024 * 1024) { alert('Image must be under 5 MB.'); return; }
                          const reader = new FileReader();
                          reader.onload = (ev) => {
                            const dataUrl = ev.target?.result as string;
                            setPImageUrl(dataUrl);
                            setPImagePreview(dataUrl);
                          };
                          reader.readAsDataURL(file);
                        }}
                      />
                      <button
                        type="button"
                        className="text-[10px] px-1.5 py-0.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-darkbg-border text-slate-700 dark:text-slate-100 rounded font-bold hover:bg-slate-100 flex items-center gap-0.5"
                        onClick={() => (document.getElementById('product-image-file-input') as HTMLInputElement)?.click()}
                      >
                        <Upload className="h-2.5 w-2.5 text-indigo-600" />
                        <span>Photo</span>
                      </button>
                      <button
                        type="button"
                        className="text-[10px] px-1.5 py-0.5 bg-indigo-600 text-white rounded font-bold hover:bg-indigo-700 flex items-center gap-0.5"
                        onClick={startImageCamera}
                      >
                        <Camera className="h-2.5 w-2.5" />
                        <span>Camera</span>
                      </button>
                      {pImagePreview && (
                        <button
                          type="button"
                          className="text-[9px] text-red-500 hover:text-red-700 p-0.5"
                          onClick={() => { setPImageUrl(''); setPImagePreview(''); }}
                          title="Remove image"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Row 2: Category, Brand & Supplier (3 Columns) */}
                <div className="inv-form-grid-3">
                  <div className="inv-field">
                    <label className="flex items-center justify-between text-[11px] font-bold">
                      <span>Category *</span>
                      <button
                        type="button"
                        className="text-[9px] font-bold text-indigo-600 hover:underline"
                        onClick={async () => {
                          const name = prompt('Enter new Category name:');
                          if (name && name.trim()) {
                            const catName = name.trim();
                            await createCategory({ name: catName, tenant_id: currentTenant.id });
                            setPCategory(catName);
                          }
                        }}
                      >
                        + New
                      </button>
                    </label>
                    <select
                      className="inv-input h-8 rounded-md border border-slate-200 bg-slate-50 text-[11px] px-2 dark:border-darkbg-border dark:bg-darkbg dark:text-white"
                      value={pCategory}
                      onChange={e => {
                        if (e.target.value === '__ADD_NEW__') {
                          const name = prompt('Enter new Category name:');
                          if (name && name.trim()) {
                            const catName = name.trim();
                            createCategory({ name: catName, tenant_id: currentTenant.id });
                            setPCategory(catName);
                          }
                        } else {
                          setPCategory(e.target.value);
                        }
                      }}
                    >
                      <option value="">Select Category...</option>
                      {allCategories.map(c => (
                        <option key={c.name} value={c.name}>
                          {c.name} {c.count > 0 ? `(${c.count})` : ''}
                        </option>
                      ))}
                      <option value="__ADD_NEW__">➕ New Category...</option>
                    </select>
                  </div>

                  <div className="inv-field">
                    <label className="flex items-center justify-between text-[11px] font-bold">
                      <span>Brand</span>
                      <button
                        type="button"
                        className="text-[9px] font-bold text-indigo-600 hover:underline"
                        onClick={async () => {
                          const name = prompt('Enter new Brand name:');
                          if (name && name.trim()) {
                            const bName = name.trim();
                            await createBrand({ name: bName, tenant_id: currentTenant.id });
                            setPBrand(bName);
                          }
                        }}
                      >
                        + New
                      </button>
                    </label>
                    <select
                      className="inv-input h-8 rounded-md border border-slate-200 bg-slate-50 text-[11px] px-2 dark:border-darkbg-border dark:bg-darkbg dark:text-white"
                      value={pBrand}
                      onChange={async e => {
                        if (e.target.value === '__ADD_NEW__') {
                          const name = prompt('Enter new Brand name:');
                          if (name && name.trim()) {
                            const bName = name.trim();
                            await createBrand({ name: bName, tenant_id: currentTenant.id });
                            setPBrand(bName);
                          }
                        } else {
                          setPBrand(e.target.value);
                        }
                      }}
                    >
                      <option value="">Select Brand...</option>
                      {allBrands.map(b => (
                        <option key={b.name} value={b.name}>
                          {b.name} {b.count > 0 ? `(${b.count})` : ''}
                        </option>
                      ))}
                      <option value="__ADD_NEW__">➕ New Brand...</option>
                    </select>
                  </div>

                  <div className="inv-field">
                    <label className="text-[11px] font-bold">Supplier</label>
                    {allSuppliers.length > 0 ? (
                      <select
                        className="inv-input h-8 rounded-md border border-slate-200 bg-slate-50 text-[11px] px-2 dark:border-darkbg-border dark:bg-darkbg dark:text-white"
                        value={pSupplierId}
                        onChange={e => {
                          const val = e.target.value;
                          if (val === '__MANUAL__') {
                            setPSupplierId('');
                            setPSupplier('');
                          } else {
                            const sup = allSuppliers.find(s => s.id === val);
                            setPSupplierId(val);
                            setPSupplier(sup?.name || '');
                          }
                        }}
                      >
                        <option value="">Optional Supplier...</option>
                        {allSuppliers.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                        <option value="__MANUAL__">✏️ Manual name...</option>
                      </select>
                    ) : (
                      <input
                        className="inv-input h-8 text-[11px]"
                        value={pSupplier}
                        onChange={e => setPSupplier(e.target.value)}
                        placeholder="Supplier name"
                      />
                    )}
                  </div>
                </div>

                {/* Row 3: SKU, Barcode & Has Variants Option (3 Columns) */}
                <div className="inv-form-grid-3">
                  <div className="inv-field">
                    <label className="text-[11px] font-bold flex items-center justify-between">
                      <span>SKU</span>
                      <span className="text-[9px] text-indigo-600 font-semibold">Auto-Generated</span>
                    </label>
                    <input
                      className="inv-input h-8 bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-mono font-bold cursor-not-allowed text-[11px] select-all"
                      value={pSku}
                      readOnly
                    />
                  </div>

                  <div className="inv-field">
                    <label className="text-[11px] font-bold block">Barcode</label>
                    <div className="flex gap-1 items-center">
                      <input
                        className="inv-input flex-1 h-8 text-[11px] font-mono"
                        value={pBarcode}
                        onChange={e => setPBarcode(e.target.value)}
                        placeholder="Scan/type barcode"
                      />
                      <Button
                        type="button"
                        variant="primary"
                        className="h-8 px-2 shrink-0 text-[10px] font-bold flex items-center gap-0.5"
                        onClick={() => {
                          setScannerTargetField('product');
                          setActiveVariantIndexForScan(null);
                          setScannerError('');
                          setIsCameraScannerOpen(true);
                        }}
                        title="Camera Scanner"
                      >
                        <Barcode className="h-3 w-3" />
                        <span>Scan</span>
                      </Button>
                    </div>
                  </div>

                  <div className="inv-field justify-center">
                    <label className="text-[11px] font-bold mb-1">Product Options</label>
                    <label className="inv-checkbox-label text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer flex items-center gap-1.5 h-8">
                      <input
                        type="checkbox"
                        className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                        checked={pHasVariants}
                        onChange={e => {
                          const checked = e.target.checked;
                          if (!checked && localVariants.length > 0) {
                            const confirmDisable = window.confirm('⚠️ Warning: Unchecking "Has Variants" will remove all existing variants for this product upon saving. Are you sure you want to disable variants?');
                            if (!confirmDisable) return;
                          }
                          setPHasVariants(checked);
                        }}
                      />
                      <span className="text-[11px]">Has Variants (Size/Color)</span>
                    </label>
                  </div>
                </div>

                {/* Row 4: Description + Optional Backdated Date */}
                <div className="inv-field full">
                  <div className="flex items-center justify-between mb-0.5">
                    <label className="text-[11px] font-bold">Description</label>
                    {!selectedProduct && ((securitySetting?.config || DEFAULT_SECURITY_CONFIG) as SecurityConfig).allowBackdatedProducts && (
                      <div className="flex items-center gap-1.5">
                        <label className="text-[10px] font-bold text-slate-400">Backdated Date:</label>
                        <input
                          className="inv-input h-6 text-[10px] px-1"
                          type="datetime-local"
                          value={productCreatedAtDate}
                          onChange={(e) => setProductCreatedAtDate(e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                  <input
                    className="inv-input h-8 text-[11px]"
                    value={pDescription}
                    onChange={e => setPDescription(e.target.value)}
                    placeholder="Optional product description..."
                  />
                </div>
              </div>
            )}

            {/* Pricing Tab */}
            {editorTab === 'pricing' && (
              <div className="inv-form-grid">
                <div className="inv-field">
                  <label>Buying Price / Cost (Tsh)</label>
                  <input className="inv-input" type="number" min="0" value={pBuyingPrice} onChange={e => setPBuyingPrice(Number(e.target.value))}/>
                </div>
                <div className="inv-field">
                  <label>Retail Selling Price (Tsh)</label>
                  <input className="inv-input" type="number" min="0" value={pSellingPrice} onChange={e => setPSellingPrice(Number(e.target.value))}/>
                </div>

                {/* Advanced Pricing Fields Toggle */}
                <div className="inv-field full" style={{ marginTop: '4px', marginBottom: '4px' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    background: 'var(--bg-slate-50, #f8fafc)',
                    borderRadius: '10px',
                    border: '1px solid var(--border-color, #e2e8f0)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        width: '32px', height: '32px', borderRadius: '8px',
                        background: showAdvancedPricing ? 'rgba(99, 102, 241, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: showAdvancedPricing ? '#6366f1' : '#94a3b8',
                        transition: 'all 0.2s'
                      }}>
                        <Sliders size={16} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-main, #1e293b)' }}>
                          Enable Advanced Pricing Fields
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          Show Wholesale Price, VIP/Member Price, Online Price & Tax Rate
                        </div>
                      </div>
                    </div>
                    <label style={{ position: 'relative', display: 'inline-block', width: '42px', height: '24px', margin: 0, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={showAdvancedPricing}
                        onChange={(e) => {
                          const val = e.target.checked;
                          setShowAdvancedPricing(val);
                          try { localStorage.setItem('dukapos_show_advanced_pricing', val ? 'true' : 'false'); } catch (_) {}
                        }}
                        style={{ opacity: 0, width: 0, height: 0 }}
                      />
                      <span style={{
                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: showAdvancedPricing ? '#6366f1' : '#cbd5e1',
                        borderRadius: '24px', transition: '0.2s'
                      }}>
                        <span style={{
                          position: 'absolute', content: '""', height: '18px', width: '18px',
                          left: showAdvancedPricing ? '21px' : '3px', bottom: '3px',
                          backgroundColor: 'white', borderRadius: '50%', transition: '0.2s',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                        }} />
                      </span>
                    </label>
                  </div>
                </div>

                {/* Optional / Advanced pricing fields (Wholesale, VIP, Online, Tax Rate) */}
                {showAdvancedPricing && (
                  <>
                    <div className="inv-field">
                      <label>Wholesale Price (Tsh) <span style={{opacity:0.5, fontSize:'0.7rem'}}>optional</span></label>
                      <input className="inv-input" type="number" min="0" value={pWholesalePrice} onChange={e => setPWholesalePrice(Number(e.target.value))} placeholder={pSellingPrice > 0 ? `Est. ${fmtCcy(Math.round(pSellingPrice*0.85))}` : 'Optional'}/>
                    </div>
                    <div className="inv-field">
                      <label>VIP / Member Price (Tsh) <span style={{opacity:0.5, fontSize:'0.7rem'}}>optional</span></label>
                      <input className="inv-input" type="number" min="0" value={pVipPrice} onChange={e => setPVipPrice(Number(e.target.value))} placeholder={pSellingPrice > 0 ? `Est. ${fmtCcy(Math.round(pSellingPrice*0.90))}` : 'Optional'}/>
                    </div>
                    <div className="inv-field">
                      <label>Online Price (Tsh) <span style={{opacity:0.5, fontSize:'0.7rem'}}>optional</span></label>
                      <input className="inv-input" type="number" min="0" value={pOnlinePrice} onChange={e => setPOnlinePrice(Number(e.target.value))} placeholder="Same as retail if not set"/>
                    </div>
                    <div className="inv-field">
                      <label>Tax Rate (%)</label>
                      <input className="inv-input" type="number" min="0" max="100" value={pTaxRate} onChange={e => setPTaxRate(Number(e.target.value))}/>
                    </div>
                  </>
                )}

                {pBuyingPrice > 0 && pSellingPrice > 0 && (
                  <div className="inv-field full">
                    <div className="inv-pricing-summary">
                      <div><span>Retail Margin:</span><strong style={{color:'#10b981'}}>{(((pSellingPrice - pBuyingPrice) / pSellingPrice) * 100).toFixed(1)}%</strong></div>
                      <div><span>Markup:</span><strong style={{color:'#6366f1'}}>{(((pSellingPrice - pBuyingPrice) / pBuyingPrice) * 100).toFixed(1)}%</strong></div>
                      <div><span>Unit Profit:</span><strong style={{color:'#f59e0b'}}>{fmtCcy(pSellingPrice - pBuyingPrice)}</strong></div>
                      {showAdvancedPricing && pWholesalePrice > 0 && <div><span>Wholesale Margin:</span><strong style={{color:'#06b6d4'}}>{(((pWholesalePrice - pBuyingPrice) / pWholesalePrice) * 100).toFixed(1)}%</strong></div>}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Inventory Tab */}
            {editorTab === 'inventory' && (
              <div className="space-y-4">
                {/* KPI Summary Banner */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
                  <div className="p-3 bg-slate-50 dark:bg-darkbg/80 border border-slate-200 dark:border-darkbg-border rounded-xl">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Total Stock</span>
                    <p className="text-lg font-black text-slate-900 dark:text-white font-mono">{fmtNum(pStock)}</p>
                    <span className="text-[10px] text-slate-500">Physical units</span>
                  </div>
                  <div className="p-3 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 rounded-xl">
                    <span className="text-[10px] uppercase font-bold text-amber-600 block mb-0.5">Reserved</span>
                    <p className="text-lg font-black text-amber-700 dark:text-amber-400 font-mono">
                      {fmtNum(localVariants.reduce((s, v) => s + (v.reservedStock || 0), 0))}
                    </p>
                    <span className="text-[10px] text-amber-600/80">Pending orders</span>
                  </div>
                  <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/40 rounded-xl">
                    <span className="text-[10px] uppercase font-bold text-emerald-600 block mb-0.5">Available</span>
                    <p className="text-lg font-black text-emerald-700 dark:text-emerald-400 font-mono">
                      {fmtNum(Math.max(0, pStock - localVariants.reduce((s, v) => s + (v.reservedStock || 0), 0)))}
                    </p>
                    <span className="text-[10px] text-emerald-600/80">Available to sell</span>
                  </div>
                  <div className="p-3 bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-200/60 dark:border-indigo-900/40 rounded-xl">
                    <span className="text-[10px] uppercase font-bold text-indigo-600 block mb-0.5">Total Variants</span>
                    <p className="text-lg font-black text-indigo-700 dark:text-indigo-400 font-mono">{localVariants.length}</p>
                    <span className="text-[10px] text-indigo-600/80">SKUs configured</span>
                  </div>
                  <div className="p-3 bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-900/40 rounded-xl">
                    <span className="text-[10px] uppercase font-bold text-rose-600 block mb-0.5">Low Stock</span>
                    <p className="text-lg font-black text-rose-700 dark:text-rose-400 font-mono">
                      {localVariants.filter(v => (v.stock || 0) <= (v.reorderLevel ?? 5)).length}
                    </p>
                    <span className="text-[10px] text-rose-600/80">Below reorder limit</span>
                  </div>
                </div>

                <div className="inv-form-grid">
                  {pHasVariants ? (
                    <div className="inv-field">
                      <label className="font-bold">Current Stock (Computed from Variants)</label>
                      <input className="inv-input font-bold" type="number" value={pStock} disabled />
                      <small style={{ color: '#6366f1', fontWeight: 600 }}>
                        Stock is automatically calculated as the sum of all variant quantities.
                      </small>
                    </div>
                  ) : (
                    <div className="inv-field">
                      <label className="font-bold">{selectedProduct ? 'Current Stock (ledger-managed)' : 'Opening Stock'}</label>
                      <input className="inv-input font-bold" type="number" min="0" value={pStock} onChange={e => setPStock(Number(e.target.value))} disabled={!!selectedProduct} />
                      {selectedProduct && <small style={{opacity:0.6}}>Use the Adjustments tab to change stock levels.</small>}
                    </div>
                  )}
                  <div className="inv-field">
                    <label className="font-bold">Reorder Threshold Level</label>
                    <input className="inv-input" type="number" min="0" value={pReorderLevel} onChange={e => setPReorderLevel(Number(e.target.value))}/>
                  </div>
                </div>

                {/* Variant Inventory Breakdown Table */}
                {pHasVariants && localVariants.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-darkbg-border">
                    <h4 className="text-xs font-bold uppercase text-slate-700 dark:text-slate-200">Variant Inventory Breakdown</h4>
                    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-darkbg-border">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50 dark:bg-darkbg text-slate-500 font-bold uppercase">
                          <tr>
                            <th className="p-2.5">Variant Specs</th>
                            <th className="p-2.5">SKU</th>
                            <th className="p-2.5">In Stock</th>
                            <th className="p-2.5">Reserved</th>
                            <th className="p-2.5">Available</th>
                            <th className="p-2.5">Reorder Level</th>
                            <th className="p-2.5">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border">
                          {localVariants.map(v => {
                            const avail = Math.max(0, (v.stock || 0) - (v.reservedStock || 0));
                            return (
                              <tr key={v.id} className="hover:bg-slate-50/50 dark:hover:bg-darkbg/50">
                                <td className="p-2.5 font-medium">
                                  {Object.entries(v.attributes).map(([k, val]) => `${k}: ${val}`).join(' · ') || v.sku}
                                </td>
                                <td className="p-2.5 font-mono text-[11px]">{v.sku}</td>
                                <td className="p-2.5 font-bold font-mono text-slate-900 dark:text-white">{v.stock}</td>
                                <td className="p-2.5 font-bold font-mono text-amber-600">{v.reservedStock || 0}</td>
                                <td className="p-2.5 font-bold font-mono text-emerald-600">{avail}</td>
                                <td className="p-2.5 font-mono">{v.reorderLevel ?? 5}</td>
                                <td className="p-2.5">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${v.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                                    {v.status}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Variants Tab */}
            {editorTab === 'variants' && (
              <div className="inv-variants-tab space-y-3">
                {!pHasVariants ? (
                  <div className="inv-variants-disabled">
                    <Layers size={32} opacity={0.3}/>
                    <p>Enable "Has Variants" in the General tab to manage variants.</p>
                  </div>
                ) : (
                  <>
                    <div className="inv-attr-builder">
                      <h4>Attribute Builder & Generator</h4>
                      <div className="inv-attr-row">
                        <input className="inv-input" placeholder="Attribute name (e.g. Size)" value={newAttrName} onChange={e => setNewAttrName(e.target.value)}/>
                        <input className="inv-input" placeholder="Values, comma separated (e.g. S, M, L, XL)" value={newAttrValues} onChange={e => setNewAttrValues(e.target.value)}/>
                        <button className="inv-add-btn" onClick={() => {
                          if (!newAttrName.trim() || !newAttrValues.trim()) return;
                          const values = newAttrValues.split(',').map(v => v.trim()).filter(Boolean);
                          setCustomAttributes(prev => ({ ...prev, [newAttrName.trim()]: values }));
                          setNewAttrName(''); setNewAttrValues('');
                        }}>Add Attribute</button>
                      </div>
                      {Object.keys(customAttributes).length > 0 && (
                        <div className="inv-attr-chips">
                          {Object.entries(customAttributes).map(([name, values]) => (
                            <span key={name} className="inv-attr-chip">
                              <strong>{name}</strong>: {values.join(', ')}
                              <button onClick={() => {
                                const next = { ...customAttributes }; delete next[name]; setCustomAttributes(next);
                              }}><X size={12}/></button>
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="inv-attr-actions">
                        <button className="inv-generate-btn" onClick={handleGenerateVariants}>
                          <Zap size={14}/> Generate Combinations ({generateCombinations(customAttributes).length})
                        </button>
                        <button className="inv-add-btn outline" onClick={() => {
                          const v = blankVariant(pId, currentTenant.id, currentBranch.id);
                          setLocalVariants(prev => { setEditingVariantIdx(prev.length); return [...prev, v]; });
                        }}><Plus size={14}/> Manual Variant</button>
                      </div>
                    </div>

                    {/* Search, Filter & Bulk Operations Bar */}
                    <div className="p-3 bg-slate-50 dark:bg-darkbg/80 border border-slate-200 dark:border-darkbg-border rounded-xl space-y-2">
                      <div className="flex flex-col md:flex-row gap-2 items-center justify-between">
                        {/* Search & Filter Inputs */}
                        <div className="flex items-center gap-2 w-full md:w-auto flex-1">
                          <div className="relative flex-1">
                            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                            <input
                              className="inv-input pl-8 h-9 text-xs w-full"
                              placeholder="Search variants by SKU, barcode, size, color..."
                              value={variantSearch}
                              onChange={e => setVariantSearch(e.target.value)}
                            />
                          </div>
                          <select
                            className="inv-input h-9 text-xs w-36"
                            value={variantStatusFilter}
                            onChange={e => setVariantStatusFilter(e.target.value as any)}
                          >
                            <option value="all">All Statuses</option>
                            <option value="active">Active Only</option>
                            <option value="inactive">Inactive Only</option>
                          </select>
                        </div>

                        {/* Bulk Action Controls */}
                        {selectedVariantIds.size > 0 && (
                          <div className="flex items-center gap-1.5 shrink-0 bg-indigo-50 dark:bg-indigo-950/60 p-1 rounded-lg border border-indigo-200/60 dark:border-indigo-900/40">
                            <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300 px-2">
                              {selectedVariantIds.size} Selected
                            </span>

                            <button
                              type="button"
                              className="text-xs px-2.5 py-1 bg-white dark:bg-slate-800 text-slate-800 dark:text-white rounded font-bold hover:bg-slate-100 border border-slate-200 flex items-center gap-1"
                              onClick={() => {
                                const newSelling = prompt('Enter new Selling Price (Tsh) for selected variants:');
                                if (newSelling !== null && !isNaN(Number(newSelling))) {
                                  const val = Number(newSelling);
                                  setLocalVariants(prev => prev.map(v => selectedVariantIds.has(v.id) ? { ...v, inheritSellingPrice: false, sellingPrice: val } : v));
                                }
                              }}
                            >
                              <DollarSign className="h-3 w-3" /> Bulk Sell Price
                            </button>

                            <button
                              type="button"
                              className="text-xs px-2.5 py-1 bg-white dark:bg-slate-800 text-slate-800 dark:text-white rounded font-bold hover:bg-slate-100 border border-slate-200 flex items-center gap-1"
                              onClick={() => {
                                const newStock = prompt('Enter Stock Quantity for selected variants:');
                                if (newStock !== null && !isNaN(Number(newStock))) {
                                  const val = Number(newStock);
                                  setLocalVariants(prev => prev.map(v => selectedVariantIds.has(v.id) ? { ...v, stock: val } : v));
                                }
                              }}
                            >
                              <Package className="h-3 w-3" /> Bulk Stock
                            </button>

                            <button
                              type="button"
                              className="text-xs px-2 py-1 bg-emerald-600 text-white rounded font-bold hover:bg-emerald-700"
                              onClick={() => {
                                setLocalVariants(prev => prev.map(v => selectedVariantIds.has(v.id) ? { ...v, status: 'Active' } : v));
                              }}
                            >
                              Enable
                            </button>
                            <button
                              type="button"
                              className="text-xs px-2 py-1 bg-rose-600 text-white rounded font-bold hover:bg-rose-700"
                              onClick={() => {
                                setLocalVariants(prev => prev.map(v => selectedVariantIds.has(v.id) ? { ...v, status: 'Inactive' } : v));
                              }}
                            >
                              Disable
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="inv-variants-table-wrap">
                      <table className="inv-variants-table">
                        <thead>
                          <tr>
                            <th><input type="checkbox" onChange={(e) => {
                              if (e.target.checked) setSelectedVariantIds(new Set(localVariants.map(v => v.id)));
                              else setSelectedVariantIds(new Set());
                            }} checked={selectedVariantIds.size === localVariants.length && localVariants.length > 0}/></th>
                            <th>Attributes</th><th>SKU</th><th>Barcode</th>
                            <th>Buy (Tsh)</th><th>Sell (Tsh)</th><th>Stock</th><th>Status</th><th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {localVariants
                            .filter(v => {
                              if (variantStatusFilter === 'active' && v.status !== 'Active') return false;
                              if (variantStatusFilter === 'inactive' && v.status === 'Active') return false;
                              if (variantSearch.trim()) {
                                const q = variantSearch.toLowerCase().trim();
                                const attrStr = Object.entries(v.attributes).map(([k, val]) => `${k}:${val}`).join(' ').toLowerCase();
                                return (
                                  v.sku.toLowerCase().includes(q) ||
                                  (v.barcode && v.barcode.toLowerCase().includes(q)) ||
                                  attrStr.includes(q)
                                );
                              }
                              return true;
                            })
                            .map((v, idx) => (
                            <React.Fragment key={v.id}>
                              <tr className={`inv-var-row ${editingVariantIdx === idx ? 'editing' : ''}`} onClick={() => setEditingVariantIdx(editingVariantIdx === idx ? null : idx)}>
                                <td onClick={e => e.stopPropagation()}>
                                  <input type="checkbox" checked={selectedVariantIds.has(v.id)} onChange={() => {
                                    setSelectedVariantIds(prev => { const n = new Set(prev); if (n.has(v.id)) n.delete(v.id); else n.add(v.id); return n; });
                                  }}/>
                                </td>
                                <td>
                                  <div className="flex flex-wrap gap-1 items-center">
                                    {Object.entries(v.attributes).map(([k, val]) => {
                                      const cleanKey = k.includes(',') ? k.split(',').join(' / ') : k;
                                      return (
                                        <span key={k} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60">
                                          <Tag className="h-3 w-3 text-indigo-500 shrink-0" />
                                          <span>{cleanKey}:</span>
                                          <span className="font-extrabold text-indigo-900 dark:text-indigo-100">{val}</span>
                                        </span>
                                      );
                                    })}
                                    {Object.keys(v.attributes).length === 0 && <span className="text-slate-400 italic text-xs">No attributes</span>}
                                  </div>
                                </td>
                                <td><code className="font-mono text-xs bg-slate-100 dark:bg-darkbg px-1.5 py-0.5 rounded border border-slate-200 dark:border-darkbg-border">{v.sku}</code></td>
                                <td><span className="font-mono text-xs text-slate-500">{v.barcode || '—'}</span></td>
                                <td><span className="font-semibold text-slate-700 dark:text-slate-300">{v.inheritBuyingPrice ? `↑${fmtCcy(pBuyingPrice)}` : fmtCcy(v.buyingPrice ?? 0)}</span></td>
                                <td><span className="font-semibold text-slate-700 dark:text-slate-300">{v.inheritSellingPrice ? `↑${fmtCcy(pSellingPrice)}` : fmtCcy(v.sellingPrice ?? 0)}</span></td>
                                <td><span className="font-extrabold font-mono" style={{color: v.stock <= 0 ? '#ef4444' : v.stock < 5 ? '#f59e0b' : '#10b981'}}>{v.stock}</span></td>
                                <td><span className={`inv-status-pill ${v.status.toLowerCase()}`}>{v.status}</span></td>
                                <td onClick={e => e.stopPropagation()}>
                                  <button onClick={() => handleDeleteVariant(v.id)} className="inv-icon-btn delete" title="Delete variant"><Trash2 size={13}/></button>
                                </td>
                              </tr>
                              {editingVariantIdx === idx && (
                                <tr className="inv-var-expand">
                                  <td colSpan={9} className="p-0 border-b border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/30 dark:bg-indigo-950/20">
                                    <div className="p-4 bg-white dark:bg-darkbg-card border border-indigo-100 dark:border-indigo-900/40 rounded-xl m-2 shadow-xs space-y-4">
                                      {/* Header Bar */}
                                      <div className="flex items-center justify-between border-b border-slate-100 dark:border-darkbg-border/40 pb-2.5">
                                        <div className="flex items-center gap-2">
                                          <span className="h-2 w-2 rounded-full bg-indigo-600 animate-pulse" />
                                          <span className="text-xs font-bold text-slate-800 dark:text-white uppercase tracking-wider">
                                            Editing Variant Configuration
                                          </span>
                                          <span className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-100 dark:border-indigo-900/40">
                                            {Object.entries(v.attributes).map(([k, val]) => `${k.includes(',') ? k.split(',').join(' / ') : k}: ${val}`).join(' · ') || v.sku}
                                          </span>
                                        </div>
                                        <button
                                          type="button"
                                          className="text-xs text-slate-400 hover:text-slate-700 dark:hover:text-white font-bold flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-darkbg dark:hover:bg-darkbg/80 transition-all border border-slate-200/80 dark:border-darkbg-border"
                                          onClick={(e) => { e.stopPropagation(); setEditingVariantIdx(null); }}
                                        >
                                          <X className="h-3.5 w-3.5" /> Close Editor
                                        </button>
                                      </div>

                                      {/* Section 1: Identifiers */}
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div className="inv-field">
                                          <label className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center justify-between">
                                            <span>SKU *</span>
                                            <span className="text-[10px] text-slate-400 font-normal">Unique Stock Keeping Unit</span>
                                          </label>
                                          <input
                                            className="inv-input h-9 font-mono text-xs font-semibold"
                                            value={v.sku}
                                            onChange={e => handleUpdateVariant(idx, { sku: e.target.value })}
                                            placeholder="e.g. SERE-S"
                                          />
                                        </div>

                                        <div className="inv-field">
                                          <label className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center justify-between">
                                            <span>Barcode</span>
                                            <span className="text-[10px] text-slate-400 font-normal">Optional EAN/UPC Code</span>
                                          </label>
                                          <div className="flex gap-1.5 items-center">
                                            <input
                                              className="inv-input h-9 font-mono text-xs flex-1"
                                              value={v.barcode || ''}
                                              onChange={e => handleUpdateVariant(idx, { barcode: e.target.value })}
                                              placeholder="Scan or enter barcode"
                                            />
                                            <Button
                                              type="button"
                                              variant="outline"
                                              className="h-9 px-2.5 text-xs font-bold flex items-center gap-1 shrink-0"
                                              onClick={() => {
                                                setScannerTargetField('variant');
                                                setActiveVariantIndexForScan(idx);
                                                setIsCameraScannerOpen(true);
                                              }}
                                              title="Scan barcode with camera"
                                            >
                                              <Barcode className="h-3.5 w-3.5" />
                                              <span>Scan</span>
                                            </Button>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Section 2: Pricing Strategy Cards */}
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {/* Buying Price Card */}
                                        <div className="p-3 bg-slate-50/80 dark:bg-darkbg/60 border border-slate-200/80 dark:border-darkbg-border rounded-xl space-y-2">
                                          <label className="flex items-center gap-2 cursor-pointer select-none">
                                            <input
                                              type="checkbox"
                                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                                              checked={!!v.inheritBuyingPrice}
                                              onChange={e => handleUpdateVariant(idx, { inheritBuyingPrice: e.target.checked })}
                                            />
                                            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                                              Inherit Parent Buy Price ({fmtCcy(pBuyingPrice)})
                                            </span>
                                          </label>
                                          {v.inheritBuyingPrice ? (
                                            <div className="p-2 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/40 rounded-lg text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1.5">
                                              <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                              <span>Inheriting Base Cost: <strong>{fmtCcy(pBuyingPrice)}</strong></span>
                                            </div>
                                          ) : (
                                            <div className="inv-field mt-1">
                                              <label className="text-[11px] font-bold text-slate-500">Custom Buying Price Override (Tsh)</label>
                                              <input
                                                className="inv-input h-9 text-xs font-mono font-semibold"
                                                type="number"
                                                min="0"
                                                value={v.buyingPrice ?? 0}
                                                onChange={e => handleUpdateVariant(idx, { buyingPrice: Number(e.target.value) })}
                                                placeholder="Enter custom buy price"
                                              />
                                            </div>
                                          )}
                                        </div>

                                        {/* Selling Price Card */}
                                        <div className="p-3 bg-slate-50/80 dark:bg-darkbg/60 border border-slate-200/80 dark:border-darkbg-border rounded-xl space-y-2">
                                          <label className="flex items-center gap-2 cursor-pointer select-none">
                                            <input
                                              type="checkbox"
                                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                                              checked={!!v.inheritSellingPrice}
                                              onChange={e => handleUpdateVariant(idx, { inheritSellingPrice: e.target.checked })}
                                            />
                                            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                                              Inherit Parent Sell Price ({fmtCcy(pSellingPrice)})
                                            </span>
                                          </label>
                                          {v.inheritSellingPrice ? (
                                            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-200/60 dark:border-indigo-900/40 rounded-lg text-[11px] text-indigo-700 dark:text-indigo-400 font-semibold flex items-center gap-1.5">
                                              <Check className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                                              <span>Inheriting Base Retail: <strong>{fmtCcy(pSellingPrice)}</strong></span>
                                            </div>
                                          ) : (
                                            <div className="inv-field mt-1">
                                              <label className="text-[11px] font-bold text-slate-500">Custom Selling Price Override (Tsh)</label>
                                              <input
                                                className="inv-input h-9 text-xs font-mono font-semibold"
                                                type="number"
                                                min="0"
                                                value={v.sellingPrice ?? 0}
                                                onChange={e => handleUpdateVariant(idx, { sellingPrice: Number(e.target.value) })}
                                                placeholder="Enter custom sell price"
                                              />
                                            </div>
                                          )}
                                        </div>
                                      </div>

                                      {/* Section 3: Status & Stock */}
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div className="inv-field">
                                          <label className="text-xs font-bold text-slate-700 dark:text-slate-200">Operational Status</label>
                                          <select
                                            className="inv-input h-9 text-xs rounded-lg border border-slate-200 bg-slate-50 dark:border-darkbg-border dark:bg-darkbg dark:text-white font-medium"
                                            value={v.status}
                                            onChange={e => handleUpdateVariant(idx, { status: e.target.value as any })}
                                          >
                                            <option value="Active">Active (Available for POS & Sales)</option>
                                            <option value="Inactive">Inactive (Hidden from POS)</option>
                                          </select>
                                        </div>

                                        <div className="inv-field">
                                          <label className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center justify-between">
                                            <span>{selectedProduct && originalVariants.some(ov => ov.id === v.id) ? 'Current Stock (Ledger-Managed)' : 'Opening Stock'}</span>
                                            {selectedProduct && originalVariants.some(ov => ov.id === v.id) && (
                                              <span className="text-[10px] text-amber-600 font-normal">Use Stock Adjustments tab to change</span>
                                            )}
                                          </label>
                                          <input
                                            className="inv-input h-9 text-xs font-mono font-bold"
                                            type="number"
                                            min="0"
                                            value={v.stock || 0}
                                            onChange={e => handleUpdateVariant(idx, { stock: Number(e.target.value) })}
                                            disabled={!!selectedProduct && originalVariants.some(ov => ov.id === v.id)}
                                            title={selectedProduct && originalVariants.some(ov => ov.id === v.id) ? 'Stock is managed via ledger. Use Adjustments tab.' : ''}
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                      {localVariants.length === 0 && (
                        <div className="inv-empty-state small">
                          <Layers size={24} opacity={0.3}/>
                          <p>No variants yet. Use the Attribute Builder above.</p>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Images Tab */}
            {editorTab === 'images' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-800 dark:text-white">Product & Variant Photo Gallery</h4>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-xs hover:bg-indigo-700"
                      onClick={() => (document.getElementById('product-image-file-input') as HTMLInputElement)?.click()}
                    >
                      <Upload className="h-3.5 w-3.5" /> Upload Photo
                    </button>
                    <button
                      type="button"
                      className="px-3 py-1.5 bg-slate-800 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-xs hover:bg-slate-900"
                      onClick={startImageCamera}
                    >
                      <Camera className="h-3.5 w-3.5" /> Camera Snap 📸
                    </button>
                  </div>
                </div>

                {/* Primary Photo Preview Card */}
                <div className="p-4 bg-slate-50 dark:bg-darkbg/80 border border-slate-200 dark:border-darkbg-border rounded-xl flex flex-col md:flex-row gap-4 items-center">
                  <div className="h-32 w-32 rounded-xl bg-white dark:bg-darkbg border border-slate-200 dark:border-darkbg-border overflow-hidden flex items-center justify-center shrink-0">
                    {pImagePreview ? (
                      <img src={pImagePreview} alt="Main Product Thumbnail" className="h-full w-full object-contain" />
                    ) : (
                      <div className="flex flex-col items-center text-slate-400">
                        <Camera className="h-8 w-8 text-indigo-500 mb-1" />
                        <span className="text-[10px] font-bold">No Image</span>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2 flex-1">
                    <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-extrabold rounded">PRIMARY THUMBNAIL</span>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      This thumbnail image is displayed in POS product catalog cards, online catalog, and receipt printouts.
                    </p>
                    {pImagePreview && (
                      <button
                        type="button"
                        className="text-xs text-rose-600 hover:underline font-bold flex items-center gap-1"
                        onClick={() => { setPImageUrl(''); setPImagePreview(''); }}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Remove Primary Image
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Suppliers Tab */}
            {editorTab === 'suppliers' && (
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-slate-800 dark:text-white">Supplier & Procurement Information</h4>
                <div className="inv-form-grid">
                  <div className="inv-field full">
                    <label className="text-xs font-bold mb-1 block">Preferred Primary Supplier</label>
                    {allSuppliers.length > 0 ? (
                      <select
                        className="inv-input h-10 text-xs rounded-lg border border-slate-200 bg-slate-50 dark:border-darkbg-border dark:bg-darkbg dark:text-white font-semibold"
                        value={pSupplierId}
                        onChange={e => {
                          const sup = allSuppliers.find(s => s.id === e.target.value);
                          setPSupplierId(e.target.value);
                          setPSupplier(sup?.name || '');
                        }}
                      >
                        <option value="">— Select Preferred Supplier —</option>
                        {allSuppliers.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.name} · Code: {s.supplier_code || s.id}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="inv-input"
                        value={pSupplier}
                        onChange={e => setPSupplier(e.target.value)}
                        placeholder="Enter supplier name"
                      />
                    )}
                  </div>

                  <div className="inv-field">
                    <label className="text-xs font-bold mb-1 block">Supplier Item SKU / Part Number</label>
                    <input
                      className="inv-input font-mono text-xs"
                      value={supplierSku}
                      onChange={e => setSupplierSku(e.target.value)}
                      placeholder="e.g. SUP-ITEM-9988"
                    />
                  </div>

                  <div className="inv-field">
                    <label className="text-xs font-bold mb-1 block">Procurement Lead Time (Days)</label>
                    <input
                      className="inv-input font-mono text-xs"
                      type="number"
                      min="1"
                      value={supplierLeadTimeDays}
                      onChange={e => setSupplierLeadTimeDays(Number(e.target.value))}
                    />
                  </div>

                  <div className="inv-field">
                    <label className="text-xs font-bold mb-1 block">Contracted Unit Cost (Tsh)</label>
                    <input
                      className="inv-input font-mono text-xs"
                      type="number"
                      min="0"
                      value={supplierPurchaseCost || pBuyingPrice}
                      onChange={e => setSupplierPurchaseCost(Number(e.target.value))}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Batch/Lot Tab */}
            {editorTab === 'batch' && (
              <div className="inv-batch-tab">
                {!selectedProduct ? (
                  <div className="inv-empty-state small"><Archive size={24} opacity={0.3}/><p>Save the product first to manage batches.</p></div>
                ) : (
                  <>
                    <div className="inv-batch-form">
                      <h4>Receive New Batch / Lot</h4>
                      <div className="inv-form-grid">
                        <div className="inv-field"><label>Batch Number *</label><input className="inv-input" value={batchNum} onChange={e => setBatchNum(e.target.value)} placeholder="e.g. BATCH-2024-001"/></div>
                        <div className="inv-field"><label>Quantity *</label><input className="inv-input" type="number" min="1" value={batchQty} onChange={e => setBatchQty(Number(e.target.value))}/></div>
                        <div className="inv-field"><label>Unit Cost (Tsh)</label><input className="inv-input" type="number" min="0" value={batchCost} onChange={e => setBatchCost(Number(e.target.value))}/></div>
                        <div className="inv-field"><label>Expiry Date</label><input className="inv-input" type="date" value={batchExpiry} onChange={e => setBatchExpiry(e.target.value)}/></div>
                        <div className="inv-field">
                          <label className="text-xs font-bold mb-1 block">Supplier</label>
                          {allSuppliers.length > 0 ? (
                            <select
                              className="inv-input h-9 text-xs rounded-lg border border-slate-200 bg-slate-50 dark:border-darkbg-border dark:bg-darkbg dark:text-white"
                              value={batchSupplierId}
                              onChange={e => {
                                const val = e.target.value;
                                const sup = allSuppliers.find(s => s.id === val);
                                setBatchSupplierId(val);
                                setBatchSupplier(sup?.name || '');
                              }}
                            >
                              <option value="">— Select Supplier —</option>
                              {allSuppliers.map(s => (
                                <option key={s.id} value={s.id}>
                                  {s.name} · {s.supplier_code}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              className="inv-input"
                              value={batchSupplier}
                              onChange={e => setBatchSupplier(e.target.value)}
                              placeholder="Supplier name"
                            />
                          )}
                        </div>
                        <div className="inv-field" style={{display:'flex',alignItems:'flex-end'}}>
                          <button className="inv-add-btn" onClick={handleSaveBatch} disabled={batchSaving}>{batchSaving ? <RefreshCw size={14} className="spin"/> : <Plus size={14}/>} Receive Batch</button>
                        </div>
                      </div>
                    </div>
                    <div className="inv-batches-list">
                      <h4>Batch History ({productBatches.length})</h4>
                      {productBatches.length === 0 ? (
                        <div className="inv-empty-state small"><Archive size={20} opacity={0.3}/><p>No batches recorded yet.</p></div>
                      ) : (
                        <table className="inv-table">
                          <thead><tr><th>Batch #</th><th>Received</th><th>Expiry</th><th>Received Qty</th><th>Remaining</th><th>Unit Cost</th><th>Status</th></tr></thead>
                          <tbody>
                            {productBatches.map(b => {
                              const isExpired = b.expiry_date && b.expiry_date < Date.now();
                              const isExpiringSoon = b.expiry_date && !isExpired && b.expiry_date < Date.now() + 30 * 86_400_000;
                              return (
                                <tr key={b.id} className={isExpired ? 'inv-row-danger' : isExpiringSoon ? 'inv-row-warning' : ''}>
                                  <td><strong>{b.batch_number}</strong></td>
                                  <td>{fmtDate(b.received_date)}</td>
                                  <td>{b.expiry_date ? fmtDate(b.expiry_date) : '—'}</td>
                                  <td>{b.quantity_received}</td>
                                  <td><strong style={{color: b.quantity_remaining === 0 ? '#ef4444' : '#10b981'}}>{b.quantity_remaining}</strong></td>
                                  <td>{fmtCcy(b.unit_cost)}</td>
                                  <td><span className={`inv-status-pill ${b.status.toLowerCase()}`}>{isExpired ? 'Expired' : b.status}</span></td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Serials Tab */}
            {editorTab === 'serials' && (
              <div className="inv-serials-tab">
                {!selectedProduct ? (
                  <div className="inv-empty-state small"><Hash size={24} opacity={0.3}/><p>Save the product first to manage serial numbers.</p></div>
                ) : (
                  <>
                    <div className="inv-serial-form">
                      <h4>Add Serial Numbers</h4>
                      <p style={{fontSize:'0.8rem',opacity:0.7}}>Enter one serial number per line. Scan barcodes or type IMEI numbers.</p>
                      <textarea className="inv-input" rows={5} value={serialInput} onChange={e => setSerialInput(e.target.value)}
                        placeholder="SN12345678&#10;SN12345679&#10;SN12345680"/>
                      <button className="inv-add-btn" onClick={handleAddSerials}><Plus size={14}/> Add Serials ({serialInput.split('\n').filter(l => l.trim()).length})</button>
                    </div>
                    <div className="inv-serials-list">
                      <h4>Serial Register ({productSerials.length})</h4>
                      <table className="inv-table">
                        <thead><tr><th>Serial Number</th><th>IMEI</th><th>Status</th><th>Warranty Expires</th></tr></thead>
                        <tbody>
                          {productSerials.map(s => (
                            <tr key={s.id}>
                              <td><code>{s.serial_number}</code></td>
                              <td>{s.imei ?? '—'}</td>
                              <td><span className={`inv-status-pill ${s.status.toLowerCase()}`}>{s.status}</span></td>
                              <td>{s.warranty_expires ? fmtDate(s.warranty_expires) : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {productSerials.length === 0 && <div className="inv-empty-state small"><Hash size={20} opacity={0.3}/><p>No serial numbers recorded.</p></div>}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Reorder Tab */}
            {editorTab === 'reorder' && (
              <div className="inv-reorder-tab">
                {!selectedProduct ? (
                  <div className="inv-empty-state small"><Target size={24} opacity={0.3}/><p>Save the product first to configure reorder rules.</p></div>
                ) : (
                  <div className="inv-form-grid">
                    <div className="inv-field"><label>Minimum Quantity (Reorder Trigger)</label><input className="inv-input" type="number" min="0" value={rrMinQty} onChange={e => setRrMinQty(Number(e.target.value))}/></div>
                    <div className="inv-field"><label>Maximum Quantity (Target Level)</label><input className="inv-input" type="number" min="0" value={rrMaxQty} onChange={e => setRrMaxQty(Number(e.target.value))}/></div>
                    <div className="inv-field"><label>Reorder Quantity (How much to order)</label><input className="inv-input" type="number" min="1" value={rrReorderQty} onChange={e => setRrReorderQty(Number(e.target.value))}/></div>
                    <div className="inv-field"><label>Supplier Lead Time (days)</label><input className="inv-input" type="number" min="1" value={rrLeadTime} onChange={e => setRrLeadTime(Number(e.target.value))}/></div>
                    <div className="inv-field full">
                      <label className="text-xs font-bold mb-1 block">Preferred Supplier</label>
                      {allSuppliers.length > 0 ? (
                        <select
                          className="inv-input h-10 text-xs rounded-lg border border-slate-200 bg-slate-50 dark:border-darkbg-border dark:bg-darkbg dark:text-white"
                          value={allSuppliers.find(s => s.name === rrSupplier)?.id || ''}
                          onChange={e => {
                            const sup = allSuppliers.find(s => s.id === e.target.value);
                            setRrSupplier(sup?.name || '');
                          }}
                        >
                          <option value="">— No preferred supplier —</option>
                          {allSuppliers.map(s => (
                            <option key={s.id} value={s.id}>
                              {s.name} · {s.supplier_code}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          className="inv-input"
                          value={rrSupplier}
                          onChange={e => setRrSupplier(e.target.value)}
                          placeholder="Supplier name or code"
                        />
                      )}
                    </div>
                    <div className="inv-field full">
                      <div className="inv-reorder-preview">
                        <div><Target size={14}/> <span>Current Stock:</span><strong style={{color: (products.find(p=>p.id===pId)?.stock??0) < rrMinQty ? '#ef4444' : '#10b981'}}>{products.find(p=>p.id===pId)?.stock ?? 0}</strong></div>
                        <div><AlertTriangle size={14}/> <span>Reorder when below:</span><strong>{rrMinQty}</strong></div>
                        <div><ShoppingCart size={14}/> <span>Order quantity:</span><strong>{rrReorderQty}</strong></div>
                        <div><Clock size={14}/> <span>Lead time:</span><strong>{rrLeadTime} days</strong></div>
                      </div>
                      <button className="inv-add-btn" style={{marginTop:'12px'}} onClick={handleSaveReorderRule} disabled={rrSaving}>
                        {rrSaving ? <RefreshCw size={14} className="spin"/> : <Check size={14}/>} Save Reorder Rule
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* History Tab */}
            {editorTab === 'history' && (
              <div className="inv-history-tab">
                {productHistory.length === 0 ? (
                  <div className="inv-empty-state small"><Clock size={24} opacity={0.3}/><p>No stock movements yet for this product.</p></div>
                ) : (
                  <table className="inv-table">
                    <thead><tr><th>Date</th><th>Type</th><th>Change</th><th>Before</th><th>After</th><th>Reference</th><th>By</th><th>Notes</th></tr></thead>
                    <tbody>
                      {productHistory.map(e => (
                        <tr key={e.id} className={INBOUND_TYPES.has(e.movement_type) ? 'inv-row-inbound' : 'inv-row-outbound'}>
                          <td>{fmtDate(e.created_at)}</td>
                          <td><span className="inv-move-type">{e.movement_type.replace(/_/g,' ')}</span></td>
                          <td><strong style={{color: e.quantity_change > 0 ? '#10b981' : '#ef4444'}}>{e.quantity_change > 0 ? '+' : ''}{e.quantity_change}</strong></td>
                          <td>{e.quantity_before}</td>
                          <td>{e.quantity_after}</td>
                          <td><code style={{fontSize:'0.75rem'}}>{e.reference_id ?? '—'}</code></td>
                          <td>{e.user_id}</td>
                          <td>{e.notes ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
        </div>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog isOpen={isDeleteConfirmOpen} onClose={() => setIsDeleteConfirmOpen(false)} title="Delete Product" size="sm">
        <div className="inv-confirm-dialog">
          <AlertTriangle size={40} color="#ef4444"/>
          <p>Permanently delete <strong>{productToDelete?.name}</strong>? This cannot be undone.</p>
          <div className="inv-confirm-actions">
            <button className="inv-cancel-btn" onClick={() => setIsDeleteConfirmOpen(false)}>Cancel</button>
            <button className="inv-delete-btn" onClick={handleDeleteProduct}><Trash2 size={14}/> Delete</button>
          </div>
        </div>
      </Dialog>
    </div>
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TAB 3 — ADJUSTMENTS
  // ──────────────────────────────────────────────────────────────────────────
  // ── Multi-line bulk adjustment state ────────────────────────────────────────
  interface AdjustLine {
    id: string;
    productId: string;
    variantId: string;
    movementType: StockLedgerEntry['movement_type'];
    qty: number;
    notes: string;
  }
  const makeBlankLine = (productId = ''): AdjustLine => ({
    id: `line-${Date.now()}-${Math.random()}`,
    productId, variantId: '', movementType: 'ADJUSTMENT_GAIN', qty: 1, notes: '',
  });

  const getLocalIsoString = () => {
    const tzoffset = (new Date()).getTimezoneOffset() * 60000;
    return (new Date(Date.now() - tzoffset)).toISOString().slice(0, 16);
  };

  const [isAdjustmentOpen, setIsAdjustmentOpen] = useState(false);
  const [adjustmentDate, setAdjustmentDate] = useState('');
  const [adjustLines, setAdjustLines] = useState<AdjustLine[]>([makeBlankLine()]);
  const [variantCache, setVariantCache] = useState<Record<string, ProductVariant[]>>({});
  const [adjSearch, setAdjSearch] = useState('');
  const [adjFilterType, setAdjFilterType] = useState<StockLedgerEntry['movement_type'] | 'ALL'>('ALL');
  const [adjSubmitting, setAdjSubmitting] = useState(false);

  const loadVariantsForProduct = async (productId: string) => {
    if (!productId || variantCache[productId]) return;
    const vars = await db.productVariants.where('productId').equals(productId).toArray();
    setVariantCache(prev => ({ ...prev, [productId]: vars }));
  };

  const openAdjustment = async (product: Product, targetVariantId?: string) => {
    const line = makeBlankLine(product.id);
    if (targetVariantId) {
      line.variantId = targetVariantId;
    }
    setAdjustLines([line]);
    await loadVariantsForProduct(product.id);

    if (isParentProduct(product, productVariants) && !targetVariantId) {
      const vars = await db.productVariants.where('productId').equals(product.id).toArray();
      if (vars.length > 0) {
        line.variantId = vars[0].id;
        setAdjustLines([{ ...line }]);
      }
    }

    setAdjustmentDate(getLocalIsoString());
    setIsAdjustmentOpen(true);
  };

  const updateLine = (id: string, patch: Partial<AdjustLine>) => {
    setAdjustLines(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l));
    if (patch.productId) loadVariantsForProduct(patch.productId);
  };

  const addLine = () => setAdjustLines(prev => [...prev, makeBlankLine()]);
  const removeLine = (id: string) => setAdjustLines(prev => prev.filter(l => l.id !== id));

  const recentAdjustments = useLiveQuery(async () => {
    if (!currentTenant?.id || !currentBranch?.id) return [];
    return db.stockLedger
      .where('tenant_id').equals(currentTenant.id)
      .and(e => e.branch_id === currentBranch.id)
      .reverse().sortBy('created_at');
  }, [currentTenant?.id, currentBranch?.id]) || [];

  const handleClearStockLedger = async () => {
    if (!currentTenant?.id) return;
    const isOwnerOrAdmin = ['Super Admin', 'Business Owner', 'Tenant Owner', 'SuperAdmin'].includes(user?.role || '');

    if (!confirm('⚠️ WARNING: Are you sure you want to PERMANENTLY CLEAR all Stock Movement Logs and Replay Stream for this workspace? This action cannot be undone.')) {
      return;
    }

    const executeClear = async () => {
      try {
        await db.stockLedger.clear();
        const pendingQueue = await db.syncQueue.where('entityName').equals('stockLedger').toArray();
        for (const q of pendingQueue) {
          if (q.id !== undefined) await db.syncQueue.delete(q.id);
        }
        alert('✅ All Stock Movement Logs and Replay Stream cleared successfully.');
      } catch (err: any) {
        alert(`Failed to clear stock movement log: ${err.message}`);
      }
    };

    if (!isOwnerOrAdmin) {
      requestPinApproval(
        'Authorize Stock Movement Log & Replay Stream Wipe',
        async () => {
          await executeClear();
        }
      );
    } else {
      await executeClear();
    }
  };

  const filteredAdjustments = useMemo(() => {
    return recentAdjustments
      .filter(e => adjFilterType === 'ALL' || e.movement_type === adjFilterType)
      .filter(e => {
        if (!adjSearch) return true;
        const q = adjSearch.toLowerCase();
        const prodName = (productMap.get(e.product_id)?.name ?? '').toLowerCase();
        return e.product_id.toLowerCase().includes(q)
          || prodName.includes(q)
          || (e.notes ?? '').toLowerCase().includes(q);
      })
      .slice(0, 100);
  }, [recentAdjustments, adjFilterType, adjSearch, products]);

  const applyAdjustment = async (
    product: Product, variantId: string, finalQty: number,
    movementType: StockLedgerEntry['movement_type'], note: string,
    customTimestamp?: number
  ) => {
    const DEFAULT_NOTES: Record<string, string> = {
      OPENING_STOCK: 'Opening stock entry', PURCHASE_RECEIVE: 'Purchase receipt',
      CUSTOMER_RETURN: 'Customer return', TRANSFER_IN: 'Transfer in',
      PRODUCTION_OUTPUT: 'Production output', ADJUSTMENT_GAIN: 'Manual gain adjustment',
      SALE: 'Manual sale deduction', SUPPLIER_RETURN: 'Supplier return',
      TRANSFER_OUT: 'Transfer out', DAMAGE: 'Goods damaged', EXPIRY: 'Goods expired',
      ADJUSTMENT_LOSS: 'Manual loss adjustment', PRODUCTION_USAGE: 'Production consumption',
    };
    const refTime = customTimestamp || Date.now();
    await recordStockMovement({
      tenant_id: currentTenant.id, branch_id: currentBranch.id,
      warehouse_id: allWarehouses[0]?.id || 'warehouse-main',
      product_id: product.id, variant_id: variantId || undefined,
      movement_type: movementType, reference_type: movementType,
      reference_id: `adj-${refTime.toString().slice(-6)}`,
      quantity_change: finalQty,
      unit_cost: product.buyingPrice || 0,
      total_cost: (product.buyingPrice || 0) * Math.abs(finalQty),
      user_id: user?.name || 'System Operator',
      notes: note.trim() || DEFAULT_NOTES[movementType],
      created_at: refTime,
    });
  };

  const handleBulkAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    for (const line of adjustLines) {
      if (!line.productId) { alert('Every row needs a product selected.'); return; }
      const prod = productMap.get(line.productId);
      if (prod?.hasVariants && !line.variantId) { alert(`Select a variant for "${prod.name}".`); return; }
      if (!line.qty || line.qty <= 0) { alert('All quantities must be greater than 0.'); return; }
    }

    const targetTime = adjustmentDate ? new Date(adjustmentDate).getTime() : Date.now();
    const isBackdated = Date.now() - targetTime > 60 * 60 * 1000;

    if (adjustmentDate) {
      if (targetTime > Date.now() + 5 * 60 * 1000) {
        alert('Adjustment date cannot be in the future.');
        return;
      }
      const twoYearsAgo = Date.now() - 2 * 365 * 24 * 60 * 60 * 1000;
      if (targetTime < twoYearsAgo) {
        alert('Adjustment date cannot be older than two years.');
        return;
      }
    }

    const securityConfig = (securitySetting?.config || DEFAULT_SECURITY_CONFIG) as SecurityConfig;
    const allowBackdated = securityConfig.allowBackdatedInventory;
    if (isBackdated && !allowBackdated) {
      alert('Backdated stock adjustments are currently disabled in settings.');
      return;
    }

    const proceedToAdjust = async () => {
      setAdjSubmitting(true);
      let successCount = 0;
      const errors: string[] = [];
      for (const line of adjustLines) {
        const prod = productMap.get(line.productId);
        if (!prod) continue;
        const isOutbound = !INBOUND_TYPES.has(line.movementType);
        const finalQty = isOutbound ? -Math.abs(line.qty) : Math.abs(line.qty);
        try {
          await applyAdjustment(prod, line.variantId, finalQty, line.movementType, line.notes, targetTime);
          successCount++;
        } catch (err: any) {
          errors.push(`${prod.name}: ${err.message}`);
        }
      }
      setAdjSubmitting(false);
      if (errors.length) {
        alert(`${successCount} recorded, ${errors.length} failed:\n${errors.join('\n')}`);
      } else {
        alert(`✅ ${successCount} movement${successCount !== 1 ? 's' : ''} recorded successfully.`);
        setIsAdjustmentOpen(false);
        setAdjustLines([makeBlankLine()]);
      }
    };

    const isOwnerOrManager = ['Super Admin', 'Business Owner', 'Tenant Owner', 'Branch Manager'].includes(user?.role || '');
    if (isBackdated && !isOwnerOrManager) {
      requestPinApproval(
        `Authorize backdated stock adjustments on ${new Date(targetTime).toLocaleString()}`,
        async () => {
          await proceedToAdjust();
        }
      );
    } else {
      await proceedToAdjust();
    }
  };

  const renderAdjustmentsTab = () => {
    const totalMovements = recentAdjustments.length;
    const inboundCount = recentAdjustments.filter(e => INBOUND_TYPES.has(e.movement_type)).length;
    const outboundCount = recentAdjustments.filter(e => !INBOUND_TYPES.has(e.movement_type)).length;
    const totalCostIn  = recentAdjustments.filter(e => INBOUND_TYPES.has(e.movement_type)).reduce((s,e) => s + (Number(e.total_cost) || (Number(e.unit_cost || 0) * Math.abs(e.quantity_change || 0)) || 0), 0);
    const totalCostOut = recentAdjustments.filter(e => !INBOUND_TYPES.has(e.movement_type)).reduce((s,e) => s + (Number(e.total_cost) || (Number(e.unit_cost || 0) * Math.abs(e.quantity_change || 0)) || 0), 0);

    return (
    <div className="inv-adjustments-view">
      {/* KPI summary */}
      <div className="adj-kpi-row">
        <div className="adj-kpi-card">
          <div className="adj-kpi-icon" style={{background:'rgba(99,102,241,0.1)',color:'#6366f1'}}><Activity size={18}/></div>
          <div><div className="adj-kpi-num">{totalMovements}</div><div className="adj-kpi-lbl">Total Ledger Entries</div></div>
        </div>
        <div className="adj-kpi-card">
          <div className="adj-kpi-icon" style={{background:'rgba(16,185,129,0.1)',color:'#10b981'}}><TrendingUp size={18}/></div>
          <div>
            <div className="adj-kpi-num" style={{color:'#10b981'}}>{inboundCount}</div>
            <div className="adj-kpi-lbl">Inbound (+)</div>
            <div style={{fontSize:'0.7rem', color:'#10b981', fontWeight:600, marginTop:'2px'}}>{fmtCcy(totalCostIn)}</div>
          </div>
        </div>
        <div className="adj-kpi-card">
          <div className="adj-kpi-icon" style={{background:'rgba(239,68,68,0.1)',color:'#ef4444'}}><TrendingDown size={18}/></div>
          <div>
            <div className="adj-kpi-num" style={{color:'#ef4444'}}>{outboundCount}</div>
            <div className="adj-kpi-lbl">Outbound (−)</div>
            <div style={{fontSize:'0.7rem', color:'#ef4444', fontWeight:600, marginTop:'2px'}}>{fmtCcy(totalCostOut)}</div>
          </div>
        </div>
        <div className="adj-kpi-card">
          <div className="adj-kpi-icon" style={{background:'rgba(139,92,246,0.1)',color:'#8b5cf6'}}><DollarSign size={18}/></div>
          <div>
            <div className="adj-kpi-num" style={{color:'#8b5cf6', fontSize:'0.95rem'}}>{fmtCcy(Math.abs(totalCostIn - totalCostOut))}</div>
            <div className="adj-kpi-lbl">Net Cost Movement</div>
            <div style={{fontSize:'0.7rem', color: totalCostIn >= totalCostOut ? '#10b981' : '#ef4444', fontWeight:600, marginTop:'2px'}}>{totalCostIn >= totalCostOut ? '▲ Net positive' : '▼ Net negative'}</div>
          </div>
        </div>
      </div>

      <div className="inv-toolbar">
        <div className="flex items-center gap-2">
          <h2 style={{margin:0}}>Stock Movement Log</h2>
          <span className="text-[10px] font-mono font-bold bg-slate-100 dark:bg-darkbg px-2 py-0.5 rounded text-slate-500">
            Replay Stream Active
          </span>
        </div>
        <div className="flex items-center gap-2">
          {canAdjust && (
            <button 
              className="px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 hover:bg-red-100 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
              onClick={handleClearStockLedger}
              title="Clear/Delete Stock Movement Logs and Replay Stream"
            >
              <Trash2 size={13}/> Clear Log Stream
            </button>
          )}
          {canAdjust && (
            <button className="inv-add-btn" onClick={() => {
              const first = products[0];
              if (!first) { alert('Add a product first.'); return; }
              openAdjustment(first);
            }}><Sliders size={14}/> New Adjustment</button>
          )}
        </div>
      </div>
      <div className="inv-toolbar" style={{marginTop:'8px'}}>
        <div className="inv-search-wrap">
          <Search size={14} className="inv-search-icon"/>
          <input className="inv-search" placeholder="Search by product name or notes…"
            value={adjSearch} onChange={e => setAdjSearch(e.target.value)}/>
        </div>
        <select className="inv-select" value={adjFilterType} onChange={e => setAdjFilterType(e.target.value as any)}>
          <option value="ALL">All Types</option>
          <optgroup label="— Inbound —">
            {(['OPENING_STOCK','PURCHASE_RECEIVE','CUSTOMER_RETURN','TRANSFER_IN','PRODUCTION_OUTPUT','ADJUSTMENT_GAIN'] as const).map(t =>
              <option key={t} value={t}>{t.replace(/_/g,' ')}</option>
            )}
          </optgroup>
          <optgroup label="— Outbound —">
            {(['SALE','SUPPLIER_RETURN','TRANSFER_OUT','DAMAGE','EXPIRY','ADJUSTMENT_LOSS','PRODUCTION_USAGE'] as const).map(t =>
              <option key={t} value={t}>{t.replace(/_/g,' ')}</option>
            )}
          </optgroup>
        </select>
      </div>

      <div className="inv-table-card" style={{marginTop:'16px'}}>
        <table className="inv-table">
          <thead><tr><th>Date & Time</th><th>Product</th><th>Movement Type</th><th>Change</th><th>Before</th><th>After</th><th>By</th><th>Notes</th></tr></thead>
          <tbody>
            {filteredAdjustments.length === 0 ? (
              <tr><td colSpan={8} style={{textAlign:'center',padding:'32px',opacity:0.5}}>No stock movements yet.</td></tr>
            ) : filteredAdjustments.map(e => {
              const prodName = getProductName(e.product_id);
              return (
                <tr key={e.id} className={INBOUND_TYPES.has(e.movement_type) ? 'inv-row-inbound' : 'inv-row-outbound'}>
                  <td style={{whiteSpace:'nowrap'}}>{fmtDateTime(e.created_at)}</td>
                  <td style={{fontWeight:600}}>{prodName}</td>
                  <td><span className={`inv-move-chip ${INBOUND_TYPES.has(e.movement_type) ? 'inbound' : 'outbound'}`}>{e.movement_type.replace(/_/g,' ')}</span></td>
                  <td><strong style={{color: e.quantity_change > 0 ? '#10b981' : '#ef4444'}}>{e.quantity_change > 0 ? '+' : ''}{e.quantity_change}</strong></td>
                  <td>{e.quantity_before}</td>
                  <td>{e.quantity_after}</td>
                  <td>{e.user_id}</td>
                  <td>{e.notes ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

    </div>
    );
  };

  // ──────────────────────────────────────────────────────────────────────────
  // TAB 4 — TRANSFERS
  // ──────────────────────────────────────────────────────────────────────────
  const [isNewTransferOpen, setIsNewTransferOpen] = useState(false);
  const [isReceiveTransferOpen, setIsReceiveTransferOpen] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState<StockTransfer | null>(null);
  const [transferItems, setTransferItems] = useState<{ productId: string; productName: string; sku: string; qty: number; cost: number }[]>([]);
  const [tFromBranch, setTFromBranch] = useState(currentBranch.id);
  const [tToBranch, setTToBranch] = useState('');
  const [tNotes, setTNotes] = useState('');
  const [tSaving, setTSaving] = useState(false);
  const [receivedQtys, setReceivedQtys] = useState<Record<string, number>>({});

  const transfers = useLiveQuery(() => db.stockTransfers.where('tenant_id').equals(currentTenant?.id || '').reverse().sortBy('created_at'), [currentTenant?.id]) || [];
  const selectedTransferItems = useLiveQuery(async () => {
    if (!selectedTransfer) return [];
    return db.stockTransferItems.where('transfer_id').equals(selectedTransfer.id).toArray();
  }, [selectedTransfer?.id]) || [];

  const handleCreateTransfer = async () => {
    if (!tToBranch || tFromBranch === tToBranch) { alert('Select a valid destination branch.'); return; }
    if (transferItems.length === 0) { alert('Add at least one item to transfer.'); return; }
    setTSaving(true);
    try {
      await createStockTransfer({
        tenantId: currentTenant.id, fromBranchId: tFromBranch, toBranchId: tToBranch,
        items: transferItems.map(i => ({ productId: i.productId, productName: i.productName, sku: i.sku, qtyRequested: i.qty, unitCost: i.cost })),
        notes: tNotes, requestedBy: user?.name || 'System',
      });
      setIsNewTransferOpen(false); setTransferItems([]); setTNotes(''); setTToBranch('');
      alert('✅ Transfer created as Draft. Submit it to deduct stock from source branch.');
    } catch (e: any) { alert('Error: ' + e.message); }
    setTSaving(false);
  };

  const handleSubmitTransfer = async (t: StockTransfer) => {
    if (!window.confirm(`Submit transfer ${t.transfer_number}? This will deduct stock from ${t.from_branch_id}.`)) return;
    try {
      await submitTransfer(t.id, user?.name || 'System');
      alert('✅ Transfer submitted. Stock deducted from source branch.');
    } catch (e: any) { alert('Error: ' + e.message); }
  };

  const handleReceiveTransfer = async () => {
    if (!selectedTransfer) return;
    const entries = Object.entries(receivedQtys).map(([itemId, qtyReceived]) => ({ itemId, qtyReceived }));
    if (entries.length === 0) { alert('Enter received quantities.'); return; }
    try {
      await receiveTransfer(selectedTransfer.id, user?.name || 'System', entries);
      setIsReceiveTransferOpen(false); setSelectedTransfer(null); setReceivedQtys({});
      alert('✅ Transfer received. Stock credited to destination branch.');
    } catch (e: any) { alert('Error: ' + e.message); }
  };

  const STATUS_COLOR: Record<string, string> = {
    Draft: '#6b7280', Pending: '#f59e0b', 'In Transit': '#6366f1',
    Received: '#10b981', Cancelled: '#ef4444', Partial: '#f97316',
  };

  const renderTransfersTab = () => (
    <div className="inv-transfers-view">
      <div className="inv-toolbar">
        <h2 style={{margin:0}}>Stock Transfers</h2>
        {canTransfer && (
          <button className="inv-add-btn" onClick={() => setIsNewTransferOpen(true)}>
            <ArrowLeftRight size={14}/> New Transfer
          </button>
        )}
      </div>

      <div className="inv-table-card" style={{marginTop:'16px'}}>
        <table className="inv-table">
          <thead><tr><th>Transfer #</th><th>From</th><th>To</th><th>Status</th><th>Date</th><th>Requested By</th><th>Actions</th></tr></thead>
          <tbody>
            {transfers.length === 0 ? (
              <tr><td colSpan={7} style={{textAlign:'center',padding:'32px',opacity:0.5}}>No transfers yet.</td></tr>
            ) : transfers.map(t => (
              <tr key={t.id}>
                <td><strong>{t.transfer_number}</strong></td>
                <td>{allBranches.find(b => b.id === t.from_branch_id)?.name ?? t.from_branch_id.slice(-6)}</td>
                <td>{allBranches.find(b => b.id === t.to_branch_id)?.name ?? t.to_branch_id.slice(-6)}</td>
                <td><span className="inv-status-pill" style={{background: STATUS_COLOR[t.status] + '22', color: STATUS_COLOR[t.status]}}>{t.status}</span></td>
                <td>{fmtDate(t.created_at)}</td>
                <td>{t.requested_by}</td>
                <td>
                  {t.status === 'Draft' && <button className="inv-icon-btn edit" onClick={() => handleSubmitTransfer(t)} title="Submit Transfer"><Send size={14}/></button>}
                  {t.status === 'In Transit' && (
                    <button className="inv-icon-btn adjust" onClick={() => { setSelectedTransfer(t); setIsReceiveTransferOpen(true); }} title="Receive Transfer"><Check size={14}/></button>
                  )}
                  <button className="inv-icon-btn" onClick={() => { setSelectedTransfer(t); }} title="View Details"><Eye size={14}/></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* New Transfer Dialog */}
      <Dialog isOpen={isNewTransferOpen} onClose={() => setIsNewTransferOpen(false)} title="Create Stock Transfer" size="xl">
        <div className="inv-transfer-form">
          <div className="inv-form-grid">
            <div className="inv-field">
              <label>From Branch</label>
              <select className="inv-input" value={tFromBranch} onChange={e => setTFromBranch(e.target.value)}>
                {allBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="inv-field">
              <label>To Branch</label>
              <select className="inv-input" value={tToBranch} onChange={e => setTToBranch(e.target.value)}>
                <option value="">— Select Destination —</option>
                {allBranches.filter(b => b.id !== tFromBranch).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="inv-field full">
              <label>Notes</label>
              <input className="inv-input" value={tNotes} onChange={e => setTNotes(e.target.value)} placeholder="Transfer notes…"/>
            </div>
          </div>

          <div className="inv-transfer-items">
            <h4>Transfer Items</h4>
            {transferItems.map((item, idx) => (
              <div key={idx} className="inv-transfer-item-row">
                <select className="inv-input" value={item.productId} onChange={e => {
                  const p = products.find(x => x.id === e.target.value);
                  if (!p) return;
                  setTransferItems(prev => prev.map((ti, i) => i === idx ? {...ti, productId: p.id, productName: p.name, sku: p.sku??p.id.slice(-8), cost: p.buyingPrice} : ti));
                }}>
                  <option value="">— Select Product —</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <input className="inv-input" type="number" min="1" placeholder="Qty" value={item.qty}
                  onChange={e => setTransferItems(prev => prev.map((ti, i) => i === idx ? {...ti, qty: Number(e.target.value)} : ti))}
                  style={{width:'80px'}}/>
                <button className="inv-icon-btn delete" onClick={() => setTransferItems(prev => prev.filter((_,i) => i !== idx))}><X size={13}/></button>
              </div>
            ))}
            <button className="inv-add-btn outline" onClick={() => setTransferItems(prev => [...prev, {productId:'',productName:'',sku:'',qty:1,cost:0}])}>
              <Plus size={13}/> Add Item
            </button>
          </div>

          <div className="inv-confirm-actions" style={{marginTop:'16px'}}>
            <button className="inv-cancel-btn" onClick={() => setIsNewTransferOpen(false)}>Cancel</button>
            <button className="inv-save-btn" onClick={handleCreateTransfer} disabled={tSaving}>
              {tSaving ? <RefreshCw size={14} className="spin"/> : <ArrowLeftRight size={14}/>} Create Transfer
            </button>
          </div>
        </div>
      </Dialog>

      {/* Receive Transfer Dialog */}
      <Dialog isOpen={isReceiveTransferOpen} onClose={() => setIsReceiveTransferOpen(false)} title={`Receive: ${selectedTransfer?.transfer_number}`} size="lg">
        <div className="inv-receive-form">
          <p style={{opacity:0.7,marginTop:0}}>Enter the actual quantities received. Leave blank to match requested quantity.</p>
          <table className="inv-table">
            <thead><tr><th>Product</th><th>SKU</th><th>Requested</th><th>Received Qty</th></tr></thead>
            <tbody>
              {selectedTransferItems.map(item => (
                <tr key={item.id}>
                  <td>{item.product_name}</td>
                  <td><code>{item.sku}</code></td>
                  <td>{item.qty_requested}</td>
                  <td>
                    <input className="inv-input" type="number" min="0" max={item.qty_requested}
                      placeholder={String(item.qty_requested)}
                      value={receivedQtys[item.id] ?? ''}
                      onChange={e => setReceivedQtys(prev => ({...prev, [item.id]: Number(e.target.value)}))}
                      style={{width:'100px'}}/>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="inv-confirm-actions">
            <button className="inv-cancel-btn" onClick={() => setIsReceiveTransferOpen(false)}>Cancel</button>
            <button className="inv-save-btn" onClick={handleReceiveTransfer}><Check size={14}/> Confirm Receipt</button>
          </div>
        </div>
      </Dialog>
    </div>
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TAB 5 — PHYSICAL COUNT
  // ──────────────────────────────────────────────────────────────────────────
  const [isNewCountOpen, setIsNewCountOpen] = useState(false);
  const [selectedCount, setSelectedCount] = useState<PhysicalCount | null>(null);
  const [isCountDetailOpen, setIsCountDetailOpen] = useState(false);
  const [countNotes, setCountNotes] = useState('');
  const [countCreating, setCountCreating] = useState(false);
  const [countBarcodeInput, setCountBarcodeInput] = useState('');
  const countInputRef = useRef<HTMLInputElement>(null);

  const physicalCounts = useLiveQuery(() =>
    db.physicalCounts.where('tenant_id').equals(currentTenant?.id || '').reverse().sortBy('created_at')
  , [currentTenant?.id]) || [];

  const countItems = useLiveQuery(async () => {
    if (!selectedCount) return [];
    return db.physicalCountItems.where('count_id').equals(selectedCount.id).toArray();
  }, [selectedCount?.id]) || [];

  const handleCreateCount = async () => {
    setCountCreating(true);
    try {
      const count = await createPhysicalCount({
        tenantId: currentTenant.id, branchId: currentBranch.id,
        notes: countNotes, createdBy: user?.name || 'System',
        module: activeModule,
      });
      setSelectedCount(count); setIsNewCountOpen(false); setIsCountDetailOpen(true);
    } catch (e: any) { alert('Error: ' + e.message); }
    setCountCreating(false);
  };

  const handleCountItemQty = async (itemId: string, qty: number) => {
    await updateCountItem(itemId, qty);
  };

  const handleApproveCount = async () => {
    if (!selectedCount) return;
    if (!window.confirm('Approve this stock count? This will automatically create ledger adjustment entries for all variances.')) return;
    try {
      await approvePhysicalCount(selectedCount.id, user?.name || 'System');
      alert('✅ Stock count approved. Ledger adjustments created.');
      setIsCountDetailOpen(false); setSelectedCount(null);
    } catch (e: any) { alert('Error: ' + e.message); }
  };

  const COUNT_STATUS_COLOR: Record<string, string> = {
    Draft: '#6b7280', Counting: '#6366f1', 'Pending Approval': '#f59e0b', Approved: '#10b981', Cancelled: '#ef4444',
  };

  const renderStockCountTab = () => (
    <div className="inv-count-view">
      <div className="inv-toolbar">
        <h2 style={{margin:0}}>Physical Stock Counts</h2>
        <button className="inv-add-btn" onClick={() => setIsNewCountOpen(true)}>
          <ClipboardList size={14}/> New Count Session
        </button>
      </div>

      <div className="inv-table-card" style={{marginTop:'16px'}}>
        <table className="inv-table">
          <thead>
            <tr>
              <th>Count #</th>
              <th>Date</th>
              <th>Status</th>
              <th>Total Items</th>
              <th>Variances</th>
              <th>Variance Value</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {physicalCounts.length === 0 ? (
              <tr><td colSpan={7} style={{textAlign:'center',padding:'32px',opacity:0.5}}>No stock counts yet.</td></tr>
            ) : physicalCounts.map(c => (
              <tr key={c.id}>
                <td><strong>{c.count_number}</strong></td>
                <td>{fmtDate(c.created_at)}</td>
                <td>
                  <span className="inv-status-pill" style={{background:COUNT_STATUS_COLOR[c.status]+'22',color:COUNT_STATUS_COLOR[c.status]}}>
                    {c.status}
                  </span>
                </td>
                <td>{c.total_items}</td>
                <td>{c.variance_items}</td>
                <td>{fmtCcy(c.variance_value)}</td>
                <td>
                  <button className="inv-icon-btn edit" onClick={() => { setSelectedCount(c); setIsCountDetailOpen(true); }} title="Open Count">
                    <ChevronRight size={14}/>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* New Count Dialog */}
      <Dialog isOpen={isNewCountOpen} onClose={() => setIsNewCountOpen(false)} title="Start Physical Stock Count" size="sm">
        <div className="inv-form-grid">
          <div className="inv-field full">
            <label>Notes (optional)</label>
            <textarea className="inv-input" rows={3} value={countNotes} onChange={e => setCountNotes(e.target.value)} placeholder="Reason for count, area covered, etc."/>
          </div>
          <div className="inv-confirm-actions">
            <button className="inv-cancel-btn" onClick={() => setIsNewCountOpen(false)}>Cancel</button>
            <button className="inv-save-btn" onClick={handleCreateCount} disabled={countCreating}>
              {countCreating ? <RefreshCw size={14} className="spin"/> : <ClipboardList size={14}/>} Start Count
            </button>
          </div>
        </div>
      </Dialog>

      {/* Count Detail Dialog */}
      <Dialog isOpen={isCountDetailOpen} onClose={() => setIsCountDetailOpen(false)} title={`Count: ${selectedCount?.count_number ?? ''}`} size="xl">
        <div className="inv-count-detail">
          {selectedCount && (() => {
            const liveVarianceItems = countItems.filter(i => i.counted_quantity >= 0 && (i.counted_quantity - i.system_quantity) !== 0);
            const liveVarianceCount = liveVarianceItems.length;
            const liveVarianceValue = liveVarianceItems.reduce((s, i) => s + Math.abs((i.counted_quantity - i.system_quantity) * i.unit_cost), 0);

            const displayVarianceItems = ['Approved', 'Cancelled'].includes(selectedCount.status)
              ? selectedCount.variance_items
              : liveVarianceCount;

            const displayVarianceValue = ['Approved', 'Cancelled'].includes(selectedCount.status)
              ? selectedCount.variance_value
              : liveVarianceValue;

            return (
              <>
                <div className="inv-count-status-bar">
                  <span>Status: <strong style={{color:COUNT_STATUS_COLOR[selectedCount.status]}}>{selectedCount.status}</strong></span>
                  <span>Total Items: <strong>{selectedCount.total_items}</strong></span>
                  <span>Variances: <strong style={{color:displayVarianceItems>0?'#f59e0b':'#10b981'}}>{displayVarianceItems}</strong></span>
                  <span>Variance Value: <strong style={{color:'#ef4444'}}>{fmtCcy(displayVarianceValue)}</strong></span>
                </div>

                {['Draft','Counting'].includes(selectedCount.status) && (
                  <div className="inv-scanner-bar">
                    <Barcode size={14}/>
                    <input ref={countInputRef} className="inv-input" placeholder="Scan barcode or search SKU…"
                      value={countBarcodeInput} onChange={e => setCountBarcodeInput(e.target.value)}
                      onKeyDown={async e => {
                        if (e.key === 'Enter') {
                          const val = countBarcodeInput.trim();
                          const match = countItems.find(i => i.sku === val || i.product_name.toLowerCase().includes(val.toLowerCase()));
                          if (match) {
                            const newQty = (match.counted_quantity >= 0 ? match.counted_quantity : 0) + 1;
                            await handleCountItemQty(match.id, newQty);
                            setCountBarcodeInput('');
                          } else {
                            alert(`No match for: "${val}"`);
                            setCountBarcodeInput('');
                          }
                        }
                      }}/>
                    <span style={{opacity:0.6,fontSize:'0.8rem'}}>Press Enter to auto-increment count</span>
                  </div>
                )}

                <div style={{overflowX:'auto'}}>
                  <table className="inv-table">
                    <thead>
                      <tr>
                        <th>Product</th><th>SKU</th><th>System Qty</th><th>Counted Qty</th>
                        <th>Variance</th><th>Unit Cost</th><th>Variance Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {countItems.map(item => {
                        const counted = item.counted_quantity;
                        const variance = counted >= 0 ? counted - item.system_quantity : 0;
                        const varValue = Math.abs(variance * item.unit_cost);
                        return (
                          <tr key={item.id} className={variance > 0 ? 'inv-row-inbound' : variance < 0 ? 'inv-row-outbound' : ''}>
                            <td>{item.product_name}</td>
                            <td><code style={{fontSize:'0.75rem'}}>{item.sku}</code></td>
                            <td>{item.system_quantity}</td>
                            <td>
                              {['Approved','Cancelled'].includes(selectedCount.status) ? (
                                <span>{counted >= 0 ? counted : '—'}</span>
                              ) : (
                                <CountInput
                                  initialValue={counted}
                                  onSave={val => handleCountItemQty(item.id, val)}
                                />
                              )}
                            </td>
                            <td>
                              {variance === 0 ? <span style={{color:'#10b981'}}>✓</span> :
                                <strong style={{color: variance > 0 ? '#10b981' : '#ef4444'}}>{variance > 0 ? '+' : ''}{variance}</strong>
                              }
                            </td>
                            <td>{fmtCcy(item.unit_cost)}</td>
                            <td>{variance !== 0 ? <span style={{color:'#f59e0b'}}>{fmtCcy(varValue)}</span> : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="inv-count-footer">
                  {selectedCount.status === 'Counting' && (
                    <button className="inv-save-btn" onClick={async () => { await submitCountForApproval(selectedCount.id); const updated = await db.physicalCounts.get(selectedCount.id); if (updated) setSelectedCount(updated); }}>
                      <Send size={14}/> Submit for Approval
                    </button>
                  )}
                  {selectedCount.status === 'Draft' && (
                    <button className="inv-save-btn" onClick={async () => { await db.physicalCounts.update(selectedCount.id, {status:'Counting'}); const updated = await db.physicalCounts.get(selectedCount.id); if (updated) setSelectedCount(updated); }}>
                      <CheckCircle2 size={14}/> Start Counting
                    </button>
                  )}
                  {selectedCount.status === 'Pending Approval' && (
                    <button className="inv-save-btn" style={{background:'#10b981'}} onClick={handleApproveCount}>
                      <Shield size={14}/> Approve & Apply Adjustments
                    </button>
                  )}
                  <button className="inv-cancel-btn" onClick={() => setIsCountDetailOpen(false)}>Close</button>
                </div>
              </>
            );
          })()}
        </div>
      </Dialog>
    </div>
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TAB 6 — REPORTS
  // ──────────────────────────────────────────────────────────────────────────
  const [activeReport, setActiveReport] = useState<ReportType>('balance');
  const [reportData, setReportData] = useState<any[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [valMethod, setValMethod] = useState<'FIFO' | 'WAC'>('FIFO');
  const [slowDays, setSlowDays] = useState(30);

  const REPORTS: { id: ReportType; label: string; icon: React.ReactNode }[] = [
    { id: 'balance',   label: 'Stock Balance',     icon: <BarChart3 size={14}/> },
    { id: 'movements', label: 'Stock Movements',   icon: <Activity size={14}/> },
    { id: 'valuation', label: 'Valuation',          icon: <DollarSign size={14}/> },
    { id: 'batch',     label: 'Batch / Lot',        icon: <Archive size={14}/> },
    { id: 'expiry',    label: 'Expiry',             icon: <Calendar size={14}/> },
    { id: 'reorder',   label: 'Reorder',            icon: <Target size={14}/> },
    { id: 'slow',      label: 'Slow Moving',        icon: <TrendingDown size={14}/> },
    { id: 'negative',  label: 'Negative Stock',     icon: <AlertCircle size={14}/> },
  ];

  const runReport = useCallback(async () => {
    setReportLoading(true);
    setReportData([]);
    try {
      let data: any[] = [];
      if (activeReport === 'balance') {
        data = await db.products.where('tenant_id').equals(currentTenant.id).toArray();
      } else if (activeReport === 'movements') {
        const all = await db.stockLedger.where('tenant_id').equals(currentTenant.id).toArray();
        data = all.sort((a, b) => b.created_at - a.created_at).slice(0, 200);
      } else if (activeReport === 'valuation') {
        data = await generateValuationReport(currentTenant.id, currentBranch.id, valMethod);
      } else if (activeReport === 'batch') {
        data = await db.batchLots.where('tenant_id').equals(currentTenant.id).toArray();
      } else if (activeReport === 'expiry') {
        data = await refreshExpiryAlerts(currentTenant.id, currentBranch.id);
      } else if (activeReport === 'reorder') {
        data = await getReorderReport(currentTenant.id, currentBranch.id);
      } else if (activeReport === 'slow') {
        data = await getSlowMovingReport(currentTenant.id, currentBranch.id, slowDays);
      } else if (activeReport === 'negative') {
        data = await getNegativeStockReport(currentTenant.id, currentBranch.id);
      }
      setReportData(data);
    } catch (e: any) { alert('Report error: ' + e.message); }
    setReportLoading(false);
  }, [activeReport, currentTenant.id, currentBranch.id, valMethod, slowDays]);

  useEffect(() => { runReport(); }, [activeReport]);

  const renderReportsTab = () => (
    <div className="inv-reports-view">
      <div className="inv-reports-sidebar">
        {REPORTS.map(r => (
          <button key={r.id} className={`inv-report-btn ${activeReport === r.id ? 'active' : ''}`}
            onClick={() => setActiveReport(r.id)}>
            {r.icon} {r.label}
          </button>
        ))}
      </div>
      <div className="inv-reports-main">
        <div className="inv-reports-header">
          <h2 style={{margin:0}}>{REPORTS.find(r => r.id === activeReport)?.label}</h2>
          <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
            {activeReport === 'valuation' && (
              <select className="inv-select" value={valMethod} onChange={e => setValMethod(e.target.value as any)}>
                <option value="FIFO">FIFO</option><option value="WAC">Weighted Average</option>
              </select>
            )}
            {activeReport === 'slow' && (
              <select className="inv-select" value={slowDays} onChange={e => setSlowDays(Number(e.target.value))}>
                <option value="30">30 days</option><option value="60">60 days</option><option value="90">90 days</option>
              </select>
            )}
            <button className="inv-refresh-btn" onClick={runReport} disabled={reportLoading}>
              <RefreshCw size={14} className={reportLoading ? 'spin' : ''}/> {reportLoading ? 'Loading…' : 'Run Report'}
            </button>
          </div>
        </div>

        {reportLoading ? (
          <div className="inv-loading"><RefreshCw size={24} className="spin"/><p>Running report…</p></div>
        ) : (
          <div className="inv-report-table-wrap">
            {activeReport === 'balance' && (
              <table className="inv-table">
                <thead><tr><th>Product</th><th>Category</th><th>Stock</th><th>Buy Price</th><th>Sell Price</th><th>Stock Value</th><th>Module</th></tr></thead>
                <tbody>{(reportData as Product[]).map(p => (
                  <tr key={p.id} className={p.stock <= 0 ? 'inv-row-danger' : p.stock < 10 ? 'inv-row-warning' : ''}>
                    <td><strong>{p.name}</strong>{p.hasVariants && <span className="inv-badge ml-2">+vars</span>}</td>
                    <td>{p.category}</td>
                    <td><strong style={{color: p.stock <= 0 ? '#ef4444' : p.stock < 10 ? '#f59e0b' : '#10b981'}}>{fmtNum(p.stock)}</strong></td>
                    <td>{fmtCcy(p.buyingPrice)}</td>
                    <td>{fmtCcy(p.sellingPrice || p.price)}</td>
                    <td>{fmtCcy(p.stock * p.buyingPrice)}</td>
                    <td>{p.module}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
            {activeReport === 'movements' && (
              <table className="inv-table">
                <thead><tr><th>Date</th><th>Product</th><th>Type</th><th>Change</th><th>Before</th><th>After</th><th>Cost</th><th>User</th><th>Notes</th></tr></thead>
                <tbody>{(reportData as StockLedgerEntry[]).map(e => (
                  <tr key={e.id} className={INBOUND_TYPES.has(e.movement_type)?'inv-row-inbound':'inv-row-outbound'}>
                    <td style={{whiteSpace:'nowrap'}}>{fmtDateTime(e.created_at)}</td>
                    <td>{products.find(p=>p.id===e.product_id)?.name ?? e.product_id.slice(-8)}</td>
                    <td><span className="inv-move-type">{e.movement_type.replace(/_/g,' ')}</span></td>
                    <td><strong style={{color:e.quantity_change>0?'#10b981':'#ef4444'}}>{e.quantity_change>0?'+':''}{e.quantity_change}</strong></td>
                    <td>{e.quantity_before}</td><td>{e.quantity_after}</td>
                    <td>{fmtCcy(e.total_cost)}</td><td>{e.user_id}</td><td>{e.notes??'—'}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
            {activeReport === 'valuation' && (
              <>
                <div className="inv-report-summary">
                  Total Inventory Value ({valMethod}): <strong>{fmtCcy((reportData as any[]).reduce((s,v)=>s+v.total_value,0))}</strong>
                </div>
                <table className="inv-table">
                  <thead><tr><th>Product</th><th>Method</th><th>Qty</th><th>Unit Value</th><th>Total Value</th></tr></thead>
                  <tbody>{(reportData as any[]).filter(v=>v.quantity>0).map((v,i) => (
                    <tr key={i}><td><strong>{v.product_name}</strong></td><td>{v.method}</td>
                    <td>{fmtNum(v.quantity)}</td><td>{fmtCcy(v.unit_value)}</td>
                    <td><strong>{fmtCcy(v.total_value)}</strong></td></tr>
                  ))}</tbody>
                </table>
              </>
            )}
            {activeReport === 'batch' && (
              <table className="inv-table">
                <thead><tr><th>Batch #</th><th>Product</th><th>Received</th><th>Expiry</th><th>Remaining</th><th>Unit Cost</th><th>Status</th></tr></thead>
                <tbody>{(reportData as BatchLot[]).map(b => {
                  const prod = products.find(p=>p.id===b.product_id);
                  const isExpired = b.expiry_date && b.expiry_date < Date.now();
                  return (
                    <tr key={b.id} className={isExpired?'inv-row-danger':''}>
                      <td><strong>{b.batch_number}</strong></td>
                      <td>{prod?.name ?? b.product_id.slice(-8)}</td>
                      <td>{fmtDate(b.received_date)}</td>
                      <td>{b.expiry_date ? fmtDate(b.expiry_date) : '—'}</td>
                      <td><strong style={{color:b.quantity_remaining===0?'#ef4444':'#10b981'}}>{b.quantity_remaining}</strong></td>
                      <td>{fmtCcy(b.unit_cost)}</td>
                      <td><span className={`inv-status-pill ${isExpired?'expired':b.status.toLowerCase()}`}>{isExpired?'Expired':b.status}</span></td>
                    </tr>
                  );
                })}</tbody>
              </table>
            )}
            {activeReport === 'expiry' && (
              <table className="inv-table">
                <thead><tr><th>Product</th><th>Batch #</th><th>Expiry Date</th><th>Remaining Qty</th><th>Alert Level</th></tr></thead>
                <tbody>{(reportData as any[]).map((a,i) => (
                  <tr key={i} className={a.alert_level==='EXPIRED'?'inv-row-danger':a.alert_level==='TODAY'?'inv-row-danger':a.alert_level==='WEEK'?'inv-row-warning':'inv-row-inbound'}>
                    <td><strong>{a.product_name}</strong></td>
                    <td>{a.batch_number}</td>
                    <td>{fmtDate(a.expiry_date)}</td>
                    <td>{a.quantity_remaining}</td>
                    <td><span className={`inv-status-pill ${a.alert_level.toLowerCase()}`}>{a.alert_level}</span></td>
                  </tr>
                ))}</tbody>
              </table>
            )}
            {activeReport === 'reorder' && (
              <table className="inv-table">
                <thead><tr><th>Product</th><th>Current Stock</th><th>Min Level</th><th>Deficit</th><th>To Reorder</th><th>Supplier</th><th>Lead Time</th></tr></thead>
                <tbody>{(reportData as any[]).map((a,i) => (
                  <tr key={i} className="inv-row-warning">
                    <td><strong>{a.product?.name}</strong></td>
                    <td><strong style={{color:'#ef4444'}}>{a.currentStock}</strong></td>
                    <td>{a.rule?.min_quantity}</td>
                    <td><strong style={{color:'#f59e0b'}}>{a.deficit}</strong></td>
                    <td>{a.toReorder}</td>
                    <td>{a.rule?.preferred_supplier_name ?? '—'}</td>
                    <td>{a.rule?.lead_time_days}d</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
            {activeReport === 'slow' && (
              <table className="inv-table">
                <thead><tr><th>Product</th><th>Category</th><th>Stock</th><th>Days Since Last Sale</th><th>Stock Value</th></tr></thead>
                <tbody>{(reportData as any[]).map((a,i) => (
                  <tr key={i} className="inv-row-warning">
                    <td><strong>{a.product?.name}</strong></td>
                    <td>{a.product?.category}</td>
                    <td>{a.product?.stock}</td>
                    <td>{a.daysSinceLastSale !== null ? `${a.daysSinceLastSale} days` : 'Never sold'}</td>
                    <td>{fmtCcy((a.product?.stock??0)*(a.product?.buyingPrice??0))}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
            {activeReport === 'negative' && (
              <table className="inv-table">
                <thead><tr><th>Product</th><th>Category</th><th>Stock (Negative)</th><th>Buy Price</th><th>Module</th></tr></thead>
                <tbody>{(reportData as Product[]).map(p => (
                  <tr key={p.id} className="inv-row-danger">
                    <td><strong>{p.name}</strong></td>
                    <td>{p.category}</td>
                    <td><strong style={{color:'#ef4444'}}>{p.stock}</strong></td>
                    <td>{fmtCcy(p.buyingPrice)}</td>
                    <td>{p.module}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
            {reportData.length === 0 && !reportLoading && (
              <div className="inv-empty-state"><FileText size={40} opacity={0.3}/><p>No data for this report.</p></div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const renderRecipesTab = () => {
    const isRetail = activeModule === 'Retail';
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-base font-bold text-slate-800 dark:text-white">
              {isRetail ? 'Product Bundles & Kits' : 'Cocktail & Drink Recipes'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isRetail 
                ? 'Configure constituent items for gift hampers, product packs, or bundle deals' 
                : 'Configure ingredient components for custom cocktails or blended beverages'}
            </p>
          </div>
          <button onClick={() => setIsRecipeModalOpen(true)} className="px-3 py-1.5 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary-dark flex items-center gap-1.5">
            <Plus size={14} /> {isRetail ? 'Create Product Bundle' : 'Create Recipe'}
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {liveRecipes && liveRecipes.map((r: any) => (
            <div key={r.id} className="p-4 bg-white dark:bg-darkbg-card border dark:border-darkbg-border rounded-xl space-y-3 shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-bold text-slate-800 dark:text-white text-sm">{r.productName}</h4>
                  <p className="text-[10px] text-slate-400">
                    {isRetail ? 'Pack Contents' : `Recipe: ${r.name} (Yields: ${r.yield_quantity} Unit)`}
                  </p>
                </div>
                <button 
                  onClick={async () => {
                    if (confirm(isRetail ? 'Delete this product bundle configuration?' : 'Delete this recipe?')) {
                      await db.recipes.delete(r.id);
                      const items = await db.recipeItems.where('recipe_id').equals(r.id).toArray();
                      for (const item of items) {
                        await db.recipeItems.delete(item.id);
                      }
                      alert(isRetail ? 'Product bundle configuration deleted.' : 'Recipe deleted.');
                    }
                  }}
                  className="text-slate-400 hover:text-danger p-1"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="border-t border-slate-100 dark:border-darkbg-border/40 pt-2.5 space-y-1.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  {isRetail ? 'Constituent Items' : 'Ingredients'}
                </span>
                {r.items.map((item: any) => (
                  <div key={item.id} className="flex justify-between text-xs text-slate-600 dark:text-slate-300">
                    <span>{item.ingredientName}</span>
                    <span className="font-semibold">{item.quantity} {item.unit}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {(!liveRecipes || liveRecipes.length === 0) && (
            <div className="sm:col-span-2 text-center py-8 text-slate-400 italic text-xs bg-slate-50 dark:bg-darkbg/20 border border-dashed rounded-xl">
              {isRetail 
                ? 'No product bundles configured yet. Click "Create Product Bundle" above to package multiple items.' 
                : 'No recipes configured. Click "Create Recipe" above to configure ingredients.'}
            </div>
          )}
        </div>

        {/* Recipe / Bundle Builder Dialog */}
        <Dialog
          isOpen={isRecipeModalOpen}
          onClose={() => setIsRecipeModalOpen(false)}
          title={isRetail ? 'Create Product Bundle / Kit' : 'Create Beverage Recipe'}
          description={isRetail ? 'Link a composite bundle to its constituent individual stock items' : 'Link a menu cocktail/drink to its raw ingredient stocks'}
          size="lg"
        >
          <form onSubmit={handleSaveRecipe} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                {isRetail ? 'Target Bundle Product *' : 'Target Beverage Product *'}
              </label>
              <select
                value={selectedRecipeProduct}
                onChange={(e) => setSelectedRecipeProduct(e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 text-xs px-2.5 dark:border-darkbg-border dark:bg-darkbg dark:text-white focus:outline-none"
                required
              >
                <option value="">
                  {isRetail ? '— Select Target Product Bundle —' : '— Select Target Drink (e.g. Mojito) —'}
                </option>
                {products.filter(p => p.module === activeModule).map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Input 
                label={isRetail ? 'Bundle Pack Title *' : 'Recipe Title *'} 
                placeholder={isRetail ? 'e.g. Gift Pack 2026' : 'e.g. Standard 1-Shot Mix'} 
                value={recipeName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRecipeName(e.target.value)}
                required
              />
              <Input 
                label="Yield Qty *" 
                type="number" 
                placeholder="1" 
                value={recipeYield}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRecipeYield(parseInt(e.target.value) || 1)}
                required
              />
            </div>

            <div className="space-y-2 border-t border-slate-100 dark:border-darkbg-border/30 pt-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isRetail ? 'Constituent Items & Quantities' : 'Ingredient Quantities'}
                </span>
                <button 
                  type="button" 
                  onClick={() => setRecipeLines([...recipeLines, { ingredientId: '', qty: 1, unit: isRetail ? 'Unit' : 'ml' }])}
                  className="text-[10px] text-primary hover:underline font-bold"
                >
                  + Add Line
                </button>
              </div>

              {recipeLines.map((line, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <select
                    value={line.ingredientId}
                    onChange={(e) => {
                      const newLines = [...recipeLines];
                      newLines[idx].ingredientId = e.target.value;
                      setRecipeLines(newLines);
                    }}
                    className="h-9 flex-1 rounded-lg border border-slate-200 bg-slate-50 text-xs px-2 dark:border-darkbg-border dark:bg-darkbg dark:text-white focus:outline-none"
                    required
                  >
                    <option value="">
                      {isRetail ? '— Select Constituent Product —' : '— Select Ingredient Stock —'}
                    </option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.stock} units left)</option>
                    ))}
                  </select>

                  <input
                    type="number"
                    placeholder="Qty"
                    value={line.qty}
                    onChange={(e) => {
                      const newLines = [...recipeLines];
                      newLines[idx].qty = parseFloat(e.target.value) || 0;
                      setRecipeLines(newLines);
                    }}
                    className="h-9 w-20 rounded-lg border border-slate-200 bg-slate-50 text-xs text-center dark:border-darkbg-border dark:bg-darkbg dark:text-white focus:outline-none"
                    required
                  />

                  <select
                    value={line.unit}
                    onChange={(e) => {
                      const newLines = [...recipeLines];
                      newLines[idx].unit = e.target.value;
                      setRecipeLines(newLines);
                    }}
                    className="h-9 w-24 rounded-lg border border-slate-200 bg-slate-50 text-xs px-1 dark:border-darkbg-border dark:bg-darkbg dark:text-white focus:outline-none"
                  >
                    {isRetail ? (
                      <>
                        <option value="Unit">Unit(s)</option>
                        <option value="Pcs">Piece(s)</option>
                        <option value="Box">Box(es)</option>
                        <option value="Kg">kg</option>
                      </>
                    ) : (
                      <>
                        <option value="ml">ml</option>
                        <option value="Bottle">Bottle</option>
                        <option value="Can">Can</option>
                        <option value="g">grams</option>
                      </>
                    )}
                  </select>

                  {recipeLines.length > 1 && (
                    <button 
                      type="button" 
                      onClick={() => setRecipeLines(recipeLines.filter((_, i) => i !== idx))}
                      className="text-slate-400 hover:text-danger p-1"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 dark:border-darkbg-border/30 pt-3">
              <Button variant="outline" type="button" onClick={() => setIsRecipeModalOpen(false)}>Cancel</Button>
              <Button variant="primary" type="submit">
                {isRetail ? 'Save Product Bundle' : 'Save Recipe'}
              </Button>
            </div>
          </form>
        </Dialog>
      </div>
    );
  };

  const renderWastageTab = () => {
    const totalLeakageCost = (liveWastages || []).reduce((sum, item) => {
      let multiplier = 1;
      if (item.unit === 'ml') {
        multiplier = 1 / 750;
      } else if (item.unit === 'Shot') {
        multiplier = 30 / 750;
      }
      return sum + (item.quantity * item.buyingPrice * multiplier);
    }, 0);

    const reasonStats: Record<string, number> = {};
    (liveWastages || []).forEach(l => {
      reasonStats[l.reason] = (reasonStats[l.reason] || 0) + 1;
    });

    const aiInsightsList = [
      "Friday 7PM-10PM is your highest demand period. Schedule extra bartender capacity.",
      "Vodka/Spirit consumption increased 30% but sales increased only 10%. Check for unauthorized spillage.",
      "Safari Lager stock levels forecast to deplete in 3 days based on current run rates."
    ];

    return (
      <div className="space-y-6">
        {/* Analytics Header Grid */}
        <div className="grid gap-4 md:grid-cols-3">
          <div className="p-4 bg-white dark:bg-darkbg-card border dark:border-darkbg-border rounded-xl shadow-sm flex flex-col justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Financial Leakage (Cost)</span>
            <div className="mt-2">
              <span className="text-xl font-extrabold text-danger">Tsh. {Math.round(totalLeakageCost).toLocaleString()}</span>
              <p className="text-[9px] text-slate-400 mt-1">Based on bottle cost ratio allocations</p>
            </div>
          </div>

          <div className="p-4 bg-white dark:bg-darkbg-card border dark:border-darkbg-border rounded-xl shadow-sm flex flex-col justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Top Spillage Reasons</span>
            <div className="mt-2 text-xs space-y-1">
              {Object.keys(reasonStats).length === 0 ? (
                <span className="text-slate-400 italic">No spillage logged</span>
              ) : (
                Object.entries(reasonStats).slice(0, 3).map(([r, count]) => (
                  <div key={r} className="flex justify-between font-semibold">
                    <span className="text-slate-600 dark:text-slate-400">{r}</span>
                    <span className="text-slate-900 dark:text-white">{count} logs</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="p-4 bg-gradient-to-r from-violet-500/10 to-indigo-500/10 border border-violet-500/20 rounded-xl flex flex-col justify-between">
            <span className="text-[10px] font-extrabold text-violet-600 dark:text-violet-400 uppercase tracking-wider flex items-center gap-1.5">
              <span>✨ AI Smart Insights</span>
            </span>
            <div className="mt-2 text-[10px] text-slate-600 dark:text-slate-300 space-y-1.5 font-medium">
              {aiInsightsList.map((ins, i) => (
                <div key={i} className="flex gap-1">
                  <span>💡</span>
                  <span>{ins}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
        {/* Log Wastage Form */}
        <div className="p-4 bg-white dark:bg-darkbg-card border dark:border-darkbg-border rounded-xl shadow-sm space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-white">Record Beverage Spillage</h3>
            <p className="text-[10px] text-slate-500">Instantly deduct lost pour or broke bottle stocks from inventory ledger</p>
          </div>

          <form onSubmit={handleSaveWastage} className="space-y-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Damaged / Spilt Drink *</label>
              <select
                value={wastageProductId}
                onChange={(e) => setWastageProductId(e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 text-xs px-2.5 dark:border-darkbg-border dark:bg-darkbg dark:text-white focus:outline-none"
                required
              >
                <option value="">— Select Beverage Product —</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.stock} units left)</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Input 
                label="Lost Quantity *" 
                type="number" 
                placeholder="60" 
                value={wastageQty}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWastageQty(parseFloat(e.target.value) || 0)}
                required
              />
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Unit *</label>
                <select 
                  value={wastageUnit}
                  onChange={(e) => setWastageUnit(e.target.value)}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 text-xs px-2 dark:border-darkbg-border dark:bg-darkbg dark:text-white focus:outline-none"
                >
                  <option value="ml">ml</option>
                  <option value="Bottle">Bottle</option>
                  <option value="Can">Can</option>
                  <option value="Shot">Shot</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Loss Reason *</label>
              <select 
                value={wastageReason}
                onChange={(e) => setWastageReason(e.target.value as any)}
                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 text-xs px-2 dark:border-darkbg-border dark:bg-darkbg dark:text-white focus:outline-none"
              >
                <option value="SPILL">SPILL (Spillage on Floor)</option>
                <option value="BAD POUR">BAD POUR (Foamy Head / Overflow)</option>
                <option value="EXPIRED">EXPIRED (Past shelf date)</option>
                <option value="FREE TASTING">FREE TASTING (Customer promo sampling)</option>
                <option value="DAMAGED">DAMAGED (Broken glass/bottle)</option>
                <option value="STAFF DRINK">STAFF DRINK (Authorized shift drink)</option>
                <option value="OTHER">OTHER / UNACCOUNTED SHRINKAGE</option>
              </select>
            </div>

            <Input 
              label="Audit Notes" 
              placeholder="e.g. Customer bumped bartender arm" 
              value={wastageNotes}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWastageNotes(e.target.value)}
            />

            <Button variant="danger" type="submit" className="w-full flex items-center justify-center gap-1.5">
              <AlertTriangle size={14} /> Commit Wastage Adjustment
            </Button>
          </form>
        </div>

        {/* Wastage Logs List */}
        <div className="md:col-span-2 p-4 bg-white dark:bg-darkbg-card border dark:border-darkbg-border rounded-xl shadow-sm space-y-3">
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-white">Recent Wastage Audit Ledger</h3>
            <p className="text-[10px] text-slate-500">Immutable log of authorized shrinkage and pouring variances</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-darkbg-border/30 bg-slate-50 dark:bg-darkbg/50 font-bold uppercase tracking-wider text-slate-500">
                  <th className="p-2">Timestamp</th>
                  <th className="p-2">Drink</th>
                  <th className="p-2">Lost Qty</th>
                  <th className="p-2">Reason</th>
                  <th className="p-2">Logged By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/20">
                {liveWastages && liveWastages.map((l: any) => (
                  <tr key={l.id}>
                    <td className="p-2 text-slate-400 font-mono">{new Date(l.timestamp).toLocaleTimeString()}</td>
                    <td className="p-2 font-bold">{l.productName}</td>
                    <td className="p-2 text-danger font-semibold">-{l.quantity} {l.unit}</td>
                    <td className="p-2">
                      <Badge variant="danger">{l.reason}</Badge>
                    </td>
                    <td className="p-2 text-slate-500">{l.employee_id}</td>
                  </tr>
                ))}

                {(!liveWastages || liveWastages.length === 0) && (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-slate-400 italic text-xs">No spillage or wastage logged today.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      </div>
    );
  };

  // ─── TAB: STOCK SYNC ENGINE ────────────────────────────────────────────────
  const renderStockSyncTab = () => {
    return <SyncDashboard />;
  };

  // ──────────────────────────────────────────────────────────────────────────
  // RENDER
  // ──────────────────────────────────────────────────────────────────────────
  const TOP_TABS: { id: InventoryTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'dashboard',   label: 'Inventory Overview',  icon: <BarChart3 size={15}/> },
    { id: 'products',    label: 'Products',            icon: <Package size={15}/>, badge: stats.total },
    { id: 'categories',  label: 'Categories & Brands', icon: <Tag size={15}/> },
    { id: 'adjustments', label: 'Adjustments',         icon: <Sliders size={15}/> },
    { id: 'transfers',   label: 'Transfers',           icon: <ArrowLeftRight size={15}/>, badge: kpis?.pendingTransfers },
    { id: 'alerts',      label: 'Stock Alerts',        icon: <AlertTriangle size={15}/>, badge: kpis?.lowStockCount },
    { id: 'stockSync' as any, label: 'Stock Sync Engine', icon: <RefreshCw size={15}/> },
    { id: 'recipes' as any,   label: activeModule === 'Bar' ? 'Recipes & Pour Control' : 'Bundles & Kits', icon: <Layers size={15}/> },
    { id: 'count',       label: 'Stock Count',         icon: <ClipboardList size={15}/>, badge: kpis?.pendingCounts },
    { id: 'ledger',      label: 'Ledger Drilldown',    icon: <Activity size={15}/> },
    { id: 'reports',     label: 'Reports',             icon: <FileText size={15}/> },
    ...(activeModule === 'Bar' ? [
      { id: 'wastage' as any, label: 'Wastage & Spillage', icon: <AlertTriangle size={15}/> }
    ] : [])
  ];

  return (
    <div className="inventory-root">


      {/* Top navigation tabs */}
      <div className="inv-top-tabs">
        {TOP_TABS.map(t => (
          <button key={t.id} className={`inv-top-tab ${invTab === t.id ? 'active' : ''}`}
            onClick={() => setInvTab(t.id)}>
            {t.icon} {t.label}
            {!!t.badge && t.badge > 0 && <span className="inv-tab-badge">{t.badge}</span>}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="inv-tab-body">
        {invTab === 'dashboard'   && renderDashboardTab()}
        {invTab === 'products'    && renderProductsTab()}
        {invTab === 'categories'  && <CatalogManager onOpenProductEditor={openEditor} />}
        {invTab === 'stockSync'   && renderStockSyncTab()}
        {invTab === 'ledger'      && renderLedgerTab()}
        {invTab === 'adjustments' && renderAdjustmentsTab()}
        {invTab === 'transfers'   && renderTransfersTab()}
        {invTab === 'alerts'      && renderAlertsTab()}
        {invTab === 'count'       && renderStockCountTab()}
        {invTab === 'reports'     && renderReportsTab()}
        {invTab === 'recipes'     && renderRecipesTab()}
        {invTab === 'wastage'     && renderWastageTab()}
      </div>

      {/* ── Global Stock Adjustment Dialog ─────────────────────────────────────
           Rendered at root level so it works when triggered from ANY tab
           (e.g. the Sliders button on product cards in the Products tab).    */}
      {/* ── Global Bulk Stock Adjustment Dialog ────────────────────────────────
           Multi-line: add as many product/variant rows as needed, submit all. */}
      <Dialog
        isOpen={isAdjustmentOpen}
        onClose={() => { setIsAdjustmentOpen(false); setAdjustLines([makeBlankLine()]); }}
        title="Bulk Stock Adjustment"
        size="xl"
      >
        <form onSubmit={handleBulkAdjustment}>
          {/* Transaction Date/Time field */}
          <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', alignItems: 'center', width: '100%' }}>
            {!((securitySetting?.config || DEFAULT_SECURITY_CONFIG) as SecurityConfig).allowBackdatedInventory ? (
              <div style={{ width: '100%' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', marginBottom: '4px' }}>
                  Adjustment Date & Time (Disabled by Policy)
                </label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    className="inv-input"
                    type="datetime-local"
                    value={adjustmentDate}
                    disabled
                    required
                    style={{ width: '250px', opacity: 0.6, cursor: 'not-allowed' }}
                  />
                  <span style={{ fontSize: '11px', color: '#e11d48', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Shield size={14} /> Backdated inventory adjustments are disabled.
                  </span>
                </div>
              </div>
            ) : (
              <div style={{ width: '280px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', margin: 0 }}>
                    Adjustment Date & Time
                  </label>
                  {!['Super Admin', 'Business Owner', 'Tenant Owner', 'Branch Manager'].includes(user?.role || '') && (
                    <span style={{ fontSize: '9px', background: '#fef3c7', color: '#d97706', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>Requires Approval</span>
                  )}
                </div>
                <input
                  className="inv-input"
                  type="datetime-local"
                  value={adjustmentDate}
                  onChange={e => setAdjustmentDate(e.target.value)}
                  required
                  style={{ width: '100%' }}
                />
              </div>
            )}
          </div>

          {/* Scrollable line table */}
          <div style={{overflowX:'auto', maxHeight:'60vh', overflowY:'auto'}}>
            <table className="inv-table" style={{minWidth:'820px', fontSize:'12px'}}>
              <thead>
                <tr>
                  <th style={{width:'20%'}}>Product</th>
                  <th style={{width:'15%'}}>Variant</th>
                  <th style={{width:'20%'}}>Movement Type</th>
                  <th style={{width:'14%', minWidth:'90px'}}>Qty</th>
                  <th style={{width:'25%'}}>Notes</th>
                  <th style={{width:'6%'}}></th>
                </tr>
              </thead>
              <tbody>
                {adjustLines.map((line) => {
                  const prod = productMap.get(line.productId);
                  const variants = variantCache[line.productId] || [];
                  return (
                    <tr key={line.id}>
                      {/* Product */}
                      <td>
                        <select
                          className="inv-input" style={{width:'100%'}}
                          value={line.productId}
                          onChange={e => updateLine(line.id, { productId: e.target.value, variantId: '' })}
                        >
                          <option value="">— Select —</option>
                          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </td>
                      {/* Variant */}
                      <td>
                        {prod?.hasVariants ? (
                          <select
                            className="inv-input" style={{width:'100%'}}
                            value={line.variantId}
                            onChange={e => updateLine(line.id, { variantId: e.target.value })}
                          >
                            <option value="">— Variant —</option>
                            {variants.map(v => (
                              <option key={v.id} value={v.id}>
                                {Object.values(v.attributes).join(' / ')}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span style={{opacity:0.4, fontSize:'11px', paddingLeft:'4px'}}>N/A</span>
                        )}
                      </td>
                      {/* Movement Type */}
                      <td>
                        <select
                          className="inv-input" style={{width:'100%'}}
                          value={line.movementType}
                          onChange={e => updateLine(line.id, { movementType: e.target.value as StockLedgerEntry['movement_type'] })}
                        >
                          <optgroup label="Inbound (+)">
                            {(['OPENING_STOCK','PURCHASE_RECEIVE','CUSTOMER_RETURN','TRANSFER_IN','PRODUCTION_OUTPUT','ADJUSTMENT_GAIN'] as const).map(t =>
                              <option key={t} value={t}>{t.replace(/_/g,' ')}</option>
                            )}
                          </optgroup>
                          <optgroup label="Outbound (−)">
                            {(['SALE','SUPPLIER_RETURN','TRANSFER_OUT','DAMAGE','EXPIRY','ADJUSTMENT_LOSS','PRODUCTION_USAGE'] as const).map(t =>
                              <option key={t} value={t}>{t.replace(/_/g,' ')}</option>
                            )}
                          </optgroup>
                        </select>
                      </td>
                      {/* Qty with custom - / + stepper buttons */}
                      <td style={{ minWidth: '110px' }}>
                        <div className="inv-stepper">
                          <button
                            type="button"
                            className="inv-stepper-btn"
                            onClick={() => updateLine(line.id, { qty: Math.max(1, (line.qty || 1) - 1) })}
                            title="Decrease quantity"
                          >
                            −
                          </button>
                          <input
                            className="inv-stepper-input"
                            type="number"
                            min="1"
                            value={line.qty || ''}
                            onChange={e => updateLine(line.id, { qty: Math.max(1, Number(e.target.value) || 1) })}
                            required
                          />
                          <button
                            type="button"
                            className="inv-stepper-btn"
                            onClick={() => updateLine(line.id, { qty: (line.qty || 0) + 1 })}
                            title="Increase quantity"
                          >
                            +
                          </button>
                        </div>
                      </td>
                      {/* Notes */}
                      <td>
                        <input
                          className="inv-input" style={{width:'100%'}}
                          value={line.notes}
                          placeholder="Optional reason…"
                          onChange={e => updateLine(line.id, { notes: e.target.value })}
                        />
                      </td>
                      {/* Remove */}
                      <td style={{textAlign:'center'}}>
                        {adjustLines.length > 1 && (
                          <button
                            type="button"
                            title="Remove row"
                            onClick={() => removeLine(line.id)}
                            style={{background:'none',border:'none',cursor:'pointer',color:'#ef4444',padding:'2px 4px'}}
                          >✕</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Add row + summary */}
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:'12px', gap:'12px'}}>
            <button
              type="button"
              className="inv-add-btn"
              onClick={addLine}
              style={{flexShrink:0}}
            >
              + Add Another Product / Variant
            </button>
            <span style={{fontSize:'11px', opacity:0.6}}>
              {adjustLines.length} line{adjustLines.length !== 1 ? 's' : ''} • All will be recorded together
            </span>
            <div className="inv-confirm-actions" style={{margin:0}}>
              <button
                type="button"
                className="inv-cancel-btn"
                onClick={() => { setIsAdjustmentOpen(false); setAdjustLines([makeBlankLine()]); }}
              >Cancel</button>
              <button
                type="submit"
                className="inv-save-btn"
                disabled={adjSubmitting}
              >
                <Check size={14}/> {adjSubmitting ? 'Saving…' : `Record ${adjustLines.length} Movement${adjustLines.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </form>
      </Dialog>

      {/* Delete confirmation */}

      {/* ── Barcode Labels Printer Dialog ───────────────────────────────────── */}
      <Dialog
        isOpen={isBarcodePrinterOpen}
        onClose={() => { setIsBarcodePrinterOpen(false); setBcProductId(''); setBcVariantId(''); }}
        title="Print Product Barcode Labels"
        size="lg"
      >
        <div className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-4">
            <div className="inv-field">
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Select Product / Variant</label>
              <select
                value={bcProductId + (bcVariantId ? `|${bcVariantId}` : '')}
                onChange={e => {
                  const parts = e.target.value.split('|');
                  setBcProductId(parts[0]);
                  setBcVariantId(parts[1] || '');
                }}
                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 text-xs px-2.5 dark:border-darkbg-border dark:bg-darkbg dark:text-white focus:outline-none"
              >
                <option value="">— Select Product or Variant —</option>
                {selectableItems.map((item, idx) => (
                  <option key={idx} value={item.id + (item.variantId ? `|${item.variantId}` : '')}>
                    {item.name} (SKU: {item.sku})
                  </option>
                ))}
              </select>
            </div>

            <div className="inv-field">
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Layout Template</label>
              <select
                value={bcLayout}
                onChange={e => setBcLayout(e.target.value as any)}
                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 text-xs px-2 dark:border-darkbg-border dark:bg-darkbg dark:text-white focus:outline-none"
              >
                <option value="single">Single Label Sticker</option>
                <option value="sheet">Sheet of Labels (Grid)</option>
              </select>
            </div>

            {bcLayout === 'sheet' && (
              <div className="inv-field col-span-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Number of Labels to Print</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={bcQty}
                  onChange={e => setBcQty(Math.max(1, Number(e.target.value)))}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 text-xs px-2.5 dark:border-darkbg-border dark:bg-darkbg dark:text-white focus:outline-none"
                />
              </div>
            )}
          </div>

          {selectedBcItem ? (
            <div className="border border-slate-100 dark:border-darkbg-border/30 rounded-xl p-4 bg-slate-50 dark:bg-darkbg/40 space-y-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Live Label Tag Preview</span>
              <div className="flex justify-center">
                {/* Visual Label sticker */}
                <div className="border border-slate-300 dark:border-slate-700 bg-white p-3 rounded shadow-sm text-center w-[180px] font-mono text-black">
                  <div className="text-[8px] font-bold tracking-wider text-slate-500 uppercase mb-1">DukaPos Store</div>
                  <div className="text-[10px] font-bold text-slate-800 truncate mb-1">{selectedBcItem.name}</div>
                  <div className="text-[12px] font-extrabold text-slate-950 mb-1.5">{fmtCcy(selectedBcItem.price)}</div>
                  
                  {/* CSS barcode columns */}
                  <div className="flex justify-center items-stretch h-9 bg-white px-2 py-1 gap-[1.5px] border-y border-dashed border-slate-200">
                    {(selectedBcItem.sku || '').split('').map((char, idx) => {
                      const code = char.charCodeAt(0);
                      const w1 = (code & 1) ? '3px' : '1px';
                      const w2 = (code & 2) ? '2px' : '1px';
                      return (
                        <React.Fragment key={idx}>
                          <div className="bg-black" style={{ width: w1 }} />
                          <div className="bg-white" style={{ width: '1px' }} />
                          <div className="bg-black" style={{ width: w2 }} />
                          <div className="bg-white" style={{ width: '1px' }} />
                        </React.Fragment>
                      );
                    })}
                  </div>
                  <div className="text-[9px] font-bold tracking-widest text-slate-700 mt-1 uppercase">* {selectedBcItem.sku} *</div>
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-200/50 dark:border-darkbg-border/30 pt-3">
                <Button variant="outline" onClick={() => setIsBarcodePrinterOpen(false)}>Cancel</Button>
                <Button variant="primary" onClick={handlePrintLabels} className="flex items-center gap-1.5">
                  <Barcode size={14} /> Print {bcLayout === 'single' ? 'Single Sticker' : `${bcQty} Label Sheet`}
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-6 text-slate-400 italic">Select a product to view the printable barcode sticker preview.</div>
          )}
        </div>
      </Dialog>

      {/* ── Bulk CSV Product Importer Dialog ────────────────────────────────── */}
      <Dialog
        isOpen={isCsvImportOpen}
        onClose={() => { setIsCsvImportOpen(false); setCsvData(''); setCsvParsedRows([]); setCsvHasParsed(false); }}
        title="Bulk Product Import (CSV)"
        size="lg"
      >
        <form onSubmit={handleCsvImport} className="space-y-4 text-xs">
          {/* Hidden file input */}
          <input
            ref={csvFileInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={handleCsvFileInput}
          />

          {!csvHasParsed ? (
            <>
              {/* Template instructions */}
              <div className="bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 rounded-xl p-4 text-[11px] text-slate-600 dark:text-slate-300 space-y-1">
                <span className="font-bold text-blue-600 dark:text-blue-400 block text-xs mb-1">📋 CSV Template Instructions</span>
                <p>Required columns: <strong>Name, Category</strong>. Optional: <strong>Buying Price, Selling Price, SKU, Barcode, Brand, Stock</strong>.</p>
                <p className="text-[10px] text-slate-400 italic">Aliases supported (e.g. Product Name, Buying_price, Qty, Cost).</p>
                <div className="bg-white dark:bg-darkbg p-2 rounded border border-slate-200 dark:border-darkbg-border/50 font-mono mt-2 text-[10px] text-slate-800 dark:text-slate-200 select-all overflow-x-auto">
                  Name,Category,Buying Price,Selling Price,SKU,Barcode,Brand,Stock<br/>
                  Premium Rice 5kg,Grains,15000,18500,PR-GOLD-01,600123456,Tanzania Gold,50<br/>
                  Cooking Oil 1L,Oils,4500,5800,OIL-KOR-1L,,Kori Oil,120
                </div>
              </div>

              {/* Drag & Drop Zone */}
              <div
                className={`csv-dropzone ${csvDragActive ? 'active' : ''} ${csvData ? 'has-file' : ''}`}
                onDragEnter={e => { e.preventDefault(); setCsvDragActive(true); }}
                onDragOver={e => { e.preventDefault(); setCsvDragActive(true); }}
                onDragLeave={() => setCsvDragActive(false)}
                onDrop={handleCsvFileDrop}
                onClick={() => !csvData && csvFileInputRef.current?.click()}
                style={{ cursor: csvData ? 'default' : 'pointer' }}
              >
                {csvData ? (
                  <div className="csv-dropzone-hasfile">
                    <div className="csv-dropzone-fileinfo">
                      <span className="csv-file-icon">📄</span>
                      <div>
                        <div style={{fontWeight:700, fontSize:'0.85rem', color:'#0f172a'}} className="dark:text-white">CSV data loaded</div>
                        <div style={{fontSize:'0.75rem', color:'#64748b'}}>{csvData.split('\n').filter(Boolean).length} lines detected</div>
                      </div>
                      <button
                        type="button"
                        className="csv-clear-btn"
                        onClick={e => { e.stopPropagation(); setCsvData(''); }}
                        title="Clear and upload new file"
                      >✕ Clear</button>
                    </div>
                  </div>
                ) : (
                  <div className="csv-dropzone-empty">
                    <div className="csv-drop-icon">☁️</div>
                    <div className="csv-drop-title">Drag & Drop your CSV file here</div>
                    <div className="csv-drop-sub">or</div>
                    <button
                      type="button"
                      className="csv-browse-btn"
                      onClick={e => { e.stopPropagation(); csvFileInputRef.current?.click(); }}
                    >
                      📂 Browse Files
                    </button>
                    <div className="csv-drop-formats">Supports: .csv files</div>
                  </div>
                )}
              </div>

              {/* Paste fallback */}
              <div className="inv-field">
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                  — or Paste CSV Data Directly —
                </label>
                <textarea
                  rows={5}
                  value={csvData}
                  onChange={e => setCsvData(e.target.value)}
                  placeholder={"Name,Category,Buying Price,Selling Price,SKU,Barcode,Brand,Stock\nProduct Name,Category Name,1000,1500,SKU-001,,Brand Name,10"}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 text-[11px] font-mono p-3 dark:border-darkbg-border dark:bg-darkbg dark:text-white focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="flex justify-between items-center border-t border-slate-100 dark:border-darkbg-border/30 pt-3">
                <div className="text-[11px] text-slate-400">
                  {csvData ? `✅ ${csvData.split('\n').filter(l => l.trim()).length - 1} data rows detected` : 'No data yet'}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" type="button" onClick={() => { setIsCsvImportOpen(false); setCsvData(''); }}>Cancel</Button>
                  <Button variant="primary" type="button" onClick={handleParseAndValidateCsv} disabled={!csvData.trim()}>
                    <CheckCircle2 size={13}/> Validate &amp; Preview
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-4">
                {/* Validation summary header */}
                <div className="csv-validation-header">
                  <div className="csv-val-stats">
                    <div className="csv-val-stat total">
                      <span className="csv-val-num">{csvParsedRows.length}</span>
                      <span className="csv-val-label">Total Rows</span>
                    </div>
                    <div className="csv-val-stat ready">
                      <span className="csv-val-num">{csvParsedRows.filter(r => r.isValid).length}</span>
                      <span className="csv-val-label">Ready</span>
                    </div>
                    <div className="csv-val-stat error">
                      <span className="csv-val-num">{csvParsedRows.filter(r => !r.isValid).length}</span>
                      <span className="csv-val-label">Invalid</span>
                    </div>
                  </div>
                  <Button size="xs" variant="outline" type="button" onClick={() => setCsvHasParsed(false)}>
                    ← Back / Edit
                  </Button>
                </div>

                <div className="border dark:border-darkbg-border rounded-lg overflow-hidden max-h-[40vh] overflow-y-auto">
                  <table className="w-full text-left" style={{ borderCollapse: 'collapse' }}>
                    <thead>
                      <tr className="bg-slate-100 dark:bg-darkbg text-[10px] uppercase text-slate-400 font-bold border-b dark:border-darkbg-border">
                        <th className="p-2 text-center">Line</th>
                        <th className="p-2">Name</th>
                        <th className="p-2">Category</th>
                        <th className="p-2 text-right">Buying</th>
                        <th className="p-2 text-right">Selling</th>
                        <th className="p-2 text-right">Stock</th>
                        <th className="p-2">SKU</th>
                        <th className="p-2">Status / Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {csvParsedRows.slice(0, 50).map((row, idx) => (
                        <tr key={idx} className={`border-b dark:border-darkbg-border text-[11px] ${row.isValid ? 'hover:bg-slate-50 dark:hover:bg-darkbg/35' : 'bg-red-50/20 dark:bg-red-950/10'}`}>
                          <td className="p-2 text-center text-slate-400 font-mono">{row.lineNum}</td>
                          <td className="p-2 font-bold text-slate-800 dark:text-white truncate max-w-[120px]">{row.name}</td>
                          <td className="p-2 text-slate-500">{row.category}</td>
                          <td className="p-2 text-right font-mono">{row.buyingPrice > 0 ? fmtCcy(row.buyingPrice) : '—'}</td>
                          <td className="p-2 text-right font-mono">{row.sellingPrice > 0 ? fmtCcy(row.sellingPrice) : '—'}</td>
                          <td className="p-2 text-right font-mono font-bold">{row.stock > 0 ? row.stock : '—'}</td>
                          <td className="p-2 font-mono text-slate-500 truncate max-w-[80px]">{row.sku || '—'}</td>
                          <td className="p-2">
                            {row.isValid ? (
                              <Badge variant="success">Ready</Badge>
                            ) : (
                              <div className="text-danger font-semibold flex flex-col gap-0.5 max-w-[150px] leading-tight">
                                {row.errors.map((err: string, eIdx: number) => (
                                  <span key={eIdx}>• {err}</span>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                      {csvParsedRows.length > 50 && (
                        <tr>
                          <td colSpan={8} className="p-3 text-center text-slate-400 italic bg-slate-50 dark:bg-darkbg">
                            ... and {csvParsedRows.length - 50} more rows (not showing in preview)
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 dark:border-darkbg-border/30 pt-3">
                <Button variant="outline" type="button" onClick={() => { setIsCsvImportOpen(false); setCsvData(''); setCsvParsedRows([]); setCsvHasParsed(false); }}>Cancel</Button>
                <Button
                  variant="primary"
                  type="submit"
                  disabled={csvLoading || csvParsedRows.filter(r => r.isValid).length === 0}
                >
                  {csvLoading ? <RefreshCw size={14} className="spin" /> : <Check size={14} />}
                  {csvLoading ? 'Importing…' : `Confirm & Import ${csvParsedRows.filter(r => r.isValid).length} Products`}
                </Button>
              </div>
            </>
          )}
        </form>
      </Dialog>

      {/* ── Category Manager Dialog ────────────────────────────────────────── */}
      <Dialog
        isOpen={isCategoryManagerOpen}
        onClose={() => setIsCategoryManagerOpen(false)}
        title="Category Management"
        size="md"
      >
        <div className="space-y-4 text-sm">
          {/* Add new category */}
          <div className="cat-add-bar">
            <div style={{flex:1}}>
              <label style={{fontSize:'0.73rem',fontWeight:600,color:'#64748b',display:'block',marginBottom:'4px',textTransform:'uppercase'}}>New Category Name</label>
              <input
                className="inv-input"
                style={{width:'100%'}}
                value={newCategoryName}
                onChange={e => setNewCategoryName(e.target.value)}
                placeholder="e.g. Beverages, Electronics, Grains…"
                onKeyDown={e => {
                  if (e.key === 'Enter' && newCategoryName.trim()) {
                    void openEditor(null, { category: newCategoryName.trim() });
                    setNewCategoryName('');
                    setIsCategoryManagerOpen(false);
                  }
                }}
              />
            </div>
            <button
              className="inv-add-btn"
              style={{alignSelf:'flex-end', whiteSpace:'nowrap'}}
              onClick={() => {
                if (!newCategoryName.trim()) return;
                void openEditor(null, { category: newCategoryName.trim() });
                setNewCategoryName('');
                setIsCategoryManagerOpen(false);
              }}
            >
              <Plus size={14}/> Add &amp; Create Product
            </button>
          </div>

          {/* Search */}
          <div className="inv-search-wrap" style={{minWidth:'unset'}}>
            <Search size={14} className="inv-search-icon"/>
            <input className="inv-search" placeholder="Search categories…" value={categorySearch} onChange={e => setCategorySearch(e.target.value)}/>
          </div>

          {/* Category list */}
          <div className="cat-list">
            {allCategories
              .filter(c => c.name.toLowerCase().includes(categorySearch.toLowerCase()))
              .map(c => (
                <div key={c.name} className="cat-list-row">
                  <div className="cat-list-dot" style={{background: `hsl(${(c.name.charCodeAt(0) * 37) % 360}, 60%, 55%)`}}/>
                  <div className="cat-list-info">
                    <span className="cat-list-name">{c.name}</span>
                    <span className="cat-list-count">{c.count} product{c.count !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <button
                      title="Filter Products by Category"
                      className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-500 hover:text-indigo-600 transition cursor-pointer"
                      onClick={() => { setSearchQuery(c.name); setIsCategoryManagerOpen(false); setInvTab('products'); }}
                    >
                      <Edit size={12} />
                    </button>
                    <button
                      title={c.count > 0 ? `Cannot delete: ${c.count} products assigned` : "Delete Category"}
                      disabled={c.count > 0}
                      className={`p-1 rounded transition ${
                        c.count > 0 ? 'text-slate-300 dark:text-slate-700 cursor-not-allowed opacity-40' : 'text-slate-500 hover:text-red-600 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer'
                      }`}
                      onClick={async () => {
                        if (confirm(`Delete category "${c.name}"?`)) {
                          await deleteCategory(c.name, currentTenant.id, 'General');
                        }
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                    <button
                      className="inv-add-btn outline"
                      style={{padding:'4px 10px',fontSize:'0.75rem', marginLeft: '4px'}}
                      onClick={() => {
                        void openEditor(null, { category: c.name });
                        setIsCategoryManagerOpen(false);
                      }}
                    >
                      + Add Product
                    </button>
                  </div>
                </div>
              ))}
            {allCategories.length === 0 && (
              <div style={{textAlign:'center',padding:'24px',opacity:0.5}}>
                <Tag size={28} style={{marginBottom:'8px', display:'block', margin:'0 auto'}}/>
                <p>No categories yet. Add products to create categories.</p>
              </div>
            )}
          </div>

          <div style={{borderTop:'1px solid #e2e8f0',paddingTop:'12px',display:'flex',justifyContent:'flex-end'}}>
            <button className="inv-cancel-btn" onClick={() => setIsCategoryManagerOpen(false)}>Close</button>
          </div>
        </div>
      </Dialog>

      {/* Supervisor PIN Approval Modal */}
      <Dialog
        isOpen={isPinModalOpen}
        onClose={() => setIsPinModalOpen(false)}
        title="Supervisor Authorization Required"
        description={pinReason}
      >
        <form onSubmit={handleVerifyPin} className="space-y-4 font-sans">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Supervisor PIN</label>
            <input
              type="password"
              placeholder="••••"
              value={enteredPin}
              onChange={e => setEnteredPin(e.target.value)}
              className="h-10 w-full text-center text-lg font-bold tracking-widest rounded-lg border border-slate-200 focus:outline-none dark:border-darkbg-border dark:bg-darkbg dark:text-white"
              required
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setIsPinModalOpen(false)}>Cancel</Button>
            <Button variant="primary" type="submit">Verify PIN</Button>
          </div>
        </form>
      </Dialog>

      {/* ── Real Camera Barcode & QR Scanner Dialog ─────────────────────────────── */}
      <Dialog
        isOpen={isCameraScannerOpen}
        onClose={() => setIsCameraScannerOpen(false)}
        title="📷 Real Camera Barcode & QR Scanner"
        description="Point device camera at the product barcode to scan automatically"
        size="md"
      >
        <div className="space-y-4 text-center">
          <div
            id="barcode-camera-reader"
            className="w-full max-w-sm mx-auto overflow-hidden rounded-2xl border-2 border-dashed border-indigo-500 bg-slate-900 shadow-inner min-h-[260px] flex items-center justify-center relative"
          >
            {scannerError && (
              <div className="p-4 text-xs font-semibold text-red-400">
                ⚠️ {scannerError}
              </div>
            )}
          </div>

          <p className="text-xs text-slate-500 font-medium">
            Supports EAN-13, EAN-8, Code 128, UPC-A, UPC-E, &amp; QR Barcodes
          </p>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-darkbg-border/30">
            <Button variant="outline" size="sm" type="button" onClick={() => setIsCameraScannerOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Dialog>

      {/* ── Product Photo Camera Stream Dialog ───────────────────────────── */}
      <Dialog
        isOpen={isPhotoCameraOpen}
        onClose={stopPhotoCamera}
        title="📷 Take Product Photo"
        description="Align product in frame and click Snap Photo to capture"
        size="md"
      >
        <div className="space-y-4 text-center">
          <div className="w-full max-w-sm mx-auto overflow-hidden rounded-2xl border-2 border-slate-700 bg-slate-950 shadow-xl aspect-video flex items-center justify-center relative">
            <video
              ref={photoVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
          </div>

          <div className="flex justify-between items-center pt-2 border-t border-slate-100 dark:border-darkbg-border/30">
            <Button variant="outline" size="sm" type="button" onClick={stopPhotoCamera}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="button" onClick={capturePhoto} className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700">
              <Camera size={14} /> Snap Photo 📸
            </Button>
          </div>
        </div>
      </Dialog>

      {/* ── Stock Ledger Drilldown Modal ─── */}
      {isDrilldownOpen && ledgerDrilldownProduct && (
        <div className="fixed inset-0 bg-black/65 z-[9999] flex items-center justify-center p-3 md:p-6 backdrop-blur-xs" onClick={() => setIsDrilldownOpen(false)}>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] overflow-hidden flex flex-col text-slate-900 dark:text-slate-100" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="p-5 px-6 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between shrink-0 bg-slate-50/50 dark:bg-slate-900/50">
              <div>
                <h2 className="m-0 text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <Activity className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                  {ledgerDrilldownProduct.name}
                </h2>
                <div className="flex gap-2.5 marginTop-1.5 flex-wrap items-center mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <span>SKU: <code className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono text-slate-700 dark:text-slate-300 font-bold">{(ledgerDrilldownProduct.sku && ledgerDrilldownProduct.sku !== '—' && ledgerDrilldownProduct.sku.trim()) ? ledgerDrilldownProduct.sku : generateAutoSku(ledgerDrilldownProduct.name, ledgerDrilldownProduct.category, ledgerDrilldownProduct.productId)}</code></span>
                  <span>·</span>
                  <span className="font-medium text-slate-700 dark:text-slate-300">{ledgerDrilldownProduct.category}</span>
                  {ledgerDrilldownProduct.variantId && (
                    <span className="text-[11px] bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 px-2 py-0.5 rounded-full font-bold">
                      Variant
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setIsDrilldownOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer text-xl leading-none"
                title="Close"
              >
                &times;
              </button>
            </div>

            {/* Financial Summary Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2.5 p-4 px-6 bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 shrink-0">
              {[
                { label: 'Current Qty', value: fmtNum(ledgerDrilldownProduct.currentQuantity), color:'#3b82f6' },
                { label: 'Avg Cost', value: fmtCcy(ledgerDrilldownProduct.averageCostPrice), color:'#059669' },
                { label: 'Selling Price', value: fmtCcy(ledgerDrilldownProduct.sellingPrice), color:'#10b981' },
                { label: 'Buying Value', value: fmtCcy(ledgerDrilldownProduct.buyingValue), color:'#059669' },
                { label: 'Selling Value', value: fmtCcy(ledgerDrilldownProduct.sellingValue), color:'#10b981' },
                { label: 'Expected Profit', value: fmtCcy(ledgerDrilldownProduct.expectedProfit), color:'#8b5cf6' },
                { label: 'Margin %', value: `${ledgerDrilldownProduct.profitPercent}%`, color:'#06b6d4' },
                { label: 'Status', value: ledgerDrilldownProduct.stockStatus, color: ledgerDrilldownProduct.stockStatus === 'Out of Stock' ? '#ef4444' : ledgerDrilldownProduct.stockStatus === 'Low Stock' ? '#f59e0b' : '#10b981' },
              ].map(c => (
                <div key={c.label} className="rounded-xl p-2.5 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{c.label}</div>
                  <div className="text-xs sm:text-sm font-extrabold" style={{ color: c.color }}>{c.value}</div>
                </div>
              ))}
            </div>

            {/* Tier Prices */}
            <div className="py-2.5 px-6 border-b border-slate-200 dark:border-slate-800 flex gap-4 shrink-0 flex-wrap text-xs text-slate-600 dark:text-slate-400 font-medium bg-white dark:bg-slate-900">
              <span>💰 Retail: <strong className="text-slate-900 dark:text-white">{ledgerDrilldownProduct.sellingPrice > 0 ? fmtCcy(ledgerDrilldownProduct.sellingPrice) : 'Not Set'}</strong></span>
              <span>🏪 Wholesale: <strong className="text-slate-900 dark:text-white">{ledgerDrilldownProduct.wholesalePrice > 0 ? fmtCcy(ledgerDrilldownProduct.wholesalePrice) : 'Not Set'}</strong></span>
              <span>⭐ VIP: <strong className="text-slate-900 dark:text-white">{ledgerDrilldownProduct.vipPrice > 0 ? fmtCcy(ledgerDrilldownProduct.vipPrice) : 'Not Set'}</strong></span>
              <span>🌐 Online: <strong className="text-slate-900 dark:text-white">{ledgerDrilldownProduct.onlinePrice > 0 ? fmtCcy(ledgerDrilldownProduct.onlinePrice) : 'Not Set'}</strong></span>
              <span className="ml-auto text-slate-400">Stock Age: <strong className="text-slate-700 dark:text-slate-300">{ledgerDrilldownProduct.stockAgeDays}d</strong></span>
            </div>

            {/* Ledger Table */}
            <div className="flex-1 overflow-y-auto p-4 px-6 bg-white dark:bg-slate-900">
              <h4 className="m-0 mb-3 text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center justify-between">
                <span>Stock Movement History ({ledgerDrilldownEntries.length} entries)</span>
              </h4>
              {ledgerDrilldownEntries.length === 0 ? (
                <div className="text-center py-12 text-slate-400 dark:text-slate-500">
                  <Activity size={32} className="mb-2 mx-auto opacity-40" />
                  <p className="text-xs font-medium">No stock movements recorded yet for this product.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="inv-table min-w-[700px]">
                    <thead>
                      <tr>
                        <th>Date & Time</th>
                        <th>Movement</th>
                        <th style={{textAlign:'right'}}>Change</th>
                        <th style={{textAlign:'right'}}>After</th>
                        <th style={{textAlign:'right'}}>Unit Cost</th>
                        <th style={{textAlign:'right'}}>Total Cost</th>
                        <th>Reference</th>
                        <th>By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledgerDrilldownEntries.map(e => (
                        <tr key={e.id} className={INBOUND_TYPES.has(e.movement_type) ? 'inv-row-inbound' : 'inv-row-outbound'}>
                          <td style={{whiteSpace:'nowrap', fontSize:'0.72rem'}}>{fmtDateTime(e.created_at)}</td>
                          <td>
                            <span className={`inv-move-chip ${INBOUND_TYPES.has(e.movement_type) ? 'inbound' : 'outbound'}`} style={{fontSize:'0.68rem'}}>
                              {e.movement_type.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td style={{textAlign:'right', fontWeight:700, color: e.quantity_change > 0 ? '#10b981' : '#ef4444'}}>
                            {e.quantity_change > 0 ? '+' : ''}{fmtNum(e.quantity_change)}
                          </td>
                          <td style={{textAlign:'right'}}>{fmtNum(e.quantity_after)}</td>
                          <td style={{textAlign:'right', color:'#64748b', fontSize:'0.8rem'}}>{e.unit_cost ? fmtCcy(e.unit_cost) : '—'}</td>
                          <td style={{textAlign:'right', color:'#64748b', fontSize:'0.8rem'}}>{e.total_cost ? fmtCcy(e.total_cost) : '—'}</td>
                          <td style={{fontSize:'0.72rem', opacity:0.7}}>{e.reference_type || '—'}</td>
                          <td style={{fontSize:'0.72rem', opacity:0.7}}>{e.user_id}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Toast Notification */}
      {deleteToastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4">
          <CheckCircle2 className="h-5 w-5 text-emerald-400 dark:text-emerald-600 flex-shrink-0" />
          <span className="text-xs font-semibold">{deleteToastMessage}</span>
        </div>
      )}

      {/* Production-Grade Delete Confirmation Dialog */}
      <Dialog isOpen={isDeleteConfirmOpen} onClose={() => !isDeleting && setIsDeleteConfirmOpen(false)} title="Delete Product" size="lg">
        <div className="p-4 space-y-4">
          <div className="border-b pb-3 dark:border-slate-700">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-500 flex-shrink-0" /> {productToDelete?.name}
            </h3>
            <p className="text-xs text-red-600 dark:text-red-400 font-semibold mt-1">This action cannot be undone.</p>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-lg border border-slate-200 dark:border-slate-700">
            <p className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-2">The following will be removed:</p>
            <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300">
              <div className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-500" /> Product Information</div>
              <div className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-500" /> Variants</div>
              <div className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-500" /> Stock Records</div>
              <div className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-500" /> Price History</div>
              <div className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-500" /> Images & Barcodes</div>
              <div className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-500" /> Supplier Links</div>
              <div className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-500" /> Inventory Ledger</div>
              <div className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-500" /> Sync Queue</div>
              <div className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-500" /> Search Index</div>
              <div className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-500" /> Offline Cache</div>
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-lg border border-slate-200 dark:border-slate-700 space-y-3">
            <div>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">Select Deletion Mode:</p>
              {deleteHasSalesHistory ? (
                <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 p-2 rounded border border-amber-200 dark:border-amber-800 flex items-center gap-1.5 font-semibold">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                  This product has {deleteSalesCount} historical sales record(s). Archiving is recommended to preserve tax and accounting integrity.
                </p>
              ) : (
                <p className="text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 p-2 rounded border border-emerald-200 dark:border-emerald-800 flex items-center gap-1.5 font-semibold">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  No sales history found for this product.
                </p>
              )}
            </div>

            <div className="space-y-2.5 pl-1 pt-1">
              <label className="flex items-start gap-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                <input
                  type="radio"
                  name="deleteChoice"
                  value="archive"
                  checked={deleteModeChoice === 'archive'}
                  onChange={() => setDeleteModeChoice('archive')}
                  className="mt-0.5"
                />
                <div>
                  <div className="font-bold text-indigo-700 dark:text-indigo-400">Archive Product (Recommended)</div>
                  <div className="text-[11px] text-slate-500 font-normal">Hides product from POS, Search & Product list while preserving sales history for audit reports.</div>
                </div>
              </label>

              <label className="flex items-start gap-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                <input
                  type="radio"
                  name="deleteChoice"
                  value="permanent"
                  checked={deleteModeChoice === 'permanent'}
                  onChange={() => setDeleteModeChoice('permanent')}
                  className="mt-0.5"
                />
                <div>
                  <div className="font-bold text-red-600 dark:text-red-400">Permanently Delete Product & Historical References</div>
                  <div className="text-[11px] text-slate-500 font-normal">Completely wipes product, variants, stock ledger, barcodes, and images from database and cloud.</div>
                </div>
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t dark:border-slate-700">
            <Button variant="outline" onClick={() => setIsDeleteConfirmOpen(false)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDeleteProduct}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : deleteModeChoice === 'archive' ? 'Archive Product' : 'Delete Forever'}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};

// Helper component to manage counted quantity input state locally without focus loss
interface CountInputProps {
  initialValue: number;
  onSave: (val: number) => void;
}
const CountInput: React.FC<CountInputProps> = ({ initialValue, onSave }) => {
  const [val, setVal] = React.useState(initialValue >= 0 ? String(initialValue) : '');

  React.useEffect(() => {
    setVal(initialValue >= 0 ? String(initialValue) : '');
  }, [initialValue]);

  return (
    <input
      className="inv-input"
      type="number"
      min="0"
      placeholder="Count…"
      value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={() => {
        const num = val === '' ? -1 : Number(val);
        if (num !== initialValue) {
          onSave(num);
        }
      }}
      onKeyDown={e => {
        if (e.key === 'Enter') {
          const num = val === '' ? -1 : Number(val);
          if (num !== initialValue) {
            onSave(num);
          }
          (e.target as HTMLInputElement).blur();
        }
      }}
      style={{ width: '80px' }}
    />
  );
};
