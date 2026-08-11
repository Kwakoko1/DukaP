import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../db/dexie';
import { useAuth } from '../../../context/AuthContext';
import {
  ShoppingCart, Search, Pill, AlertTriangle,
  Plus, Minus, X, CheckCircle
} from 'lucide-react';

interface CartItem {
  product_id: string;
  product_name: string;
  batch_id: string;
  batch_number: string;
  expiry_date: string;
  unit_price: number;
  qty: number;
  requires_prescription: boolean;
  is_controlled: boolean;
}

const PAYMENT_METHODS = ['Cash', 'M-Pesa', 'Card', 'NHIF', 'Insurance', 'Credit'];

export const PharmacyPOS: React.FC = () => {
  const { user, currentBranch } = useAuth();
  const tenantId = user?.tenant_id || '';
  const branchId  = currentBranch?.id || '';

  const [search, setSearch]   = useState('');
  const [cart, setCart]       = useState<CartItem[]>([]);
  const [payMethod, setPayMethod] = useState('Cash');
  const [patientName, setPatientName] = useState('');
  const [rxNumber, setRxNumber]   = useState('');
  const [discount, setDiscount]   = useState(0);
  const [showAlert, setShowAlert] = useState<string | null>(null);
  const [success, setSuccess]     = useState(false);
  const [processing, setProcessing] = useState(false);

  const products = useLiveQuery(() =>
    db.products.where('tenant_id').equals(tenantId).toArray(), [tenantId], []
  );
  const batches = useLiveQuery(() =>
    db.medicineBatches.where('tenant_id').equals(tenantId).toArray(), [tenantId], []
  );

  const pharmacyProducts = useMemo(() =>
    (products || []).filter(p => (p as any).module === 'Pharmacy' || (p as any).category === 'Medicine'),
    [products]
  );

  const searchResults = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return pharmacyProducts.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.sku || '').toLowerCase().includes(q) ||
      (p.barcode || '').toLowerCase().includes(q)
    ).slice(0, 12);
  }, [pharmacyProducts, search, batches]);

  const getActiveBatch = (productId: string) => {
    const todayStr = new Date().toISOString().split('T')[0];
    return (batches || [])
      .filter(b => b.product_id === productId && b.status === 'Active' && b.quantity_remaining > 0 && b.expiry_date >= todayStr)
      .sort((a, b) => a.expiry_date.localeCompare(b.expiry_date))[0]; // FEFO
  };

  const addToCart = (product: any) => {
    const existing = cart.find(c => c.product_id === product.id);
    if (existing) {
      setCart(prev => prev.map(c => c.product_id === product.id ? { ...c, qty: c.qty + 1 } : c));
      return;
    }
    const batch = getActiveBatch(product.id);
    const isControlled = (product as any).is_controlled || false;
    const rxRequired   = (product as any).prescription_required || isControlled;

    if (isControlled) {
      setShowAlert(`⚠️ Controlled Drug: "${product.name}" requires a valid prescription and pharmacist authorization.`);
    } else if (rxRequired && !rxNumber) {
      setShowAlert(`⚠️ Prescription Required: "${product.name}" cannot be dispensed without a valid prescription number.`);
    }

    // Check batch expiry
    if (!batch) {
      setShowAlert(`❌ No active stock: "${product.name}" has no available batches (check Batch & Expiry).`);
      return;
    }

    setCart(prev => [...prev, {
      product_id: product.id,
      product_name: product.name,
      batch_id: batch.id,
      batch_number: batch.batch_number,
      expiry_date: batch.expiry_date,
      unit_price: product.sellingPrice || product.price || 0,
      qty: 1,
      requires_prescription: rxRequired,
      is_controlled: isControlled,
    }]);
    setSearch('');
  };

  const updateQty = (id: string, delta: number) => {
    setCart(prev => prev.map(c => c.product_id === id
      ? { ...c, qty: Math.max(1, c.qty + delta) }
      : c
    ));
  };

  const removeItem = (id: string) => setCart(prev => prev.filter(c => c.product_id !== id));

  const subtotal = cart.reduce((s, c) => s + c.unit_price * c.qty, 0);
  const discountAmt = Math.round(subtotal * (discount / 100));
  const total = subtotal - discountAmt;

  const handleCompleteSale = async () => {
    if (cart.length === 0) return;
    setProcessing(true);
    const now = Date.now();
    try {
      // Deduct batch quantities
      for (const item of cart) {
        const batch = await db.medicineBatches.get(item.batch_id);
        if (batch) {
          const newQty = Math.max(0, batch.quantity_remaining - item.qty);
          await db.medicineBatches.update(item.batch_id, {
            quantity_remaining: newQty,
            status: newQty === 0 ? 'Disposed' : newQty <= 10 ? 'Low' : 'Active',
            updated_at: now,
          });
        }
      }

      // Record a sale / dispensing entry
      const dispensingId = `disp-${now}`;
      await db.dispensings.add({
        id: dispensingId,
        tenant_id: tenantId,
        branch_id: branchId,
        patient_name: patientName || undefined,
        pharmacist_id: user?.id,
        pharmacist_name: user?.name,
        is_otc: !rxNumber,
        total_amount: total,
        payment_method: payMethod,
        status: 'Completed',
        created_at: now,
        updated_at: now,
      });

      for (const item of cart) {
        await db.dispensingItems.add({
          id: `di-${now}-${item.product_id}`,
          dispensing_id: dispensingId,
          tenant_id: tenantId,
          product_id: item.product_id,
          product_name: item.product_name,
          batch_id: item.batch_id,
          batch_number: item.batch_number,
          expiry_date: item.expiry_date,
          quantity: item.qty,
          unit_price: item.unit_price,
          total_price: item.unit_price * item.qty,
          created_at: now,
        });
      }

      setCart([]);
      setPatientName('');
      setRxNumber('');
      setDiscount(0);
      setPayMethod('Cash');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="flex gap-4 h-[calc(100vh-12rem)]">
      {/* Left — Product Search */}
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search medicine by name, SKU, barcode…"
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500" />
        </div>

        {/* Alert */}
        {showAlert && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-amber-300 text-xs flex-1">{showAlert}</p>
            <button onClick={() => setShowAlert(null)} className="text-slate-500 hover:text-slate-300"><X className="h-4 w-4" /></button>
          </div>
        )}

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden">
            {searchResults.map(p => {
              const batch = getActiveBatch(p.id);
              const noStock = !batch;
              return (
                <button key={p.id} onClick={() => addToCart(p)} disabled={noStock}
                  className={`w-full flex items-center justify-between px-4 py-3 text-left border-b border-slate-800 last:border-0 transition-colors ${
                    noStock ? 'opacity-40 cursor-not-allowed' : 'hover:bg-slate-800/60'
                  }`}>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-teal-500/10 rounded-lg">
                      <Pill className="h-4 w-4 text-teal-400" />
                    </div>
                    <div>
                      <p className="text-slate-200 text-sm font-medium">{p.name}</p>
                      <p className="text-slate-500 text-xs">
                        {batch ? `Batch: ${batch.batch_number} · Exp: ${batch.expiry_date} · Qty: ${batch.quantity_remaining}` : 'No Active Stock'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-emerald-400 font-bold text-sm">TZS {(p.sellingPrice || p.price || 0).toLocaleString()}</p>
                    {(p as any).is_controlled && <span className="text-[10px] text-rose-400 font-bold">CONTROLLED</span>}
                    {(p as any).prescription_required && !((p as any).is_controlled) && <span className="text-[10px] text-amber-400">RX REQUIRED</span>}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {searchResults.length === 0 && search.trim() && (
          <div className="text-center py-8 text-slate-500 text-sm bg-slate-900/40 border border-slate-800 rounded-2xl">
            No medicines found for "{search}"
          </div>
        )}

        {/* Patient & Prescription info */}
        <div className="grid grid-cols-2 gap-3 mt-auto">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Patient Name</label>
            <input value={patientName} onChange={e => setPatientName(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
              placeholder="Patient / Walk-in" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Prescription # (if applicable)</label>
            <input value={rxNumber} onChange={e => setRxNumber(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
              placeholder="RX-XXXXXXXX" />
          </div>
        </div>
      </div>

      {/* Right — Cart */}
      <div className="w-80 flex flex-col bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-slate-200 font-semibold flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-emerald-400" /> Cart
          </h3>
          <span className="text-xs text-slate-500">{cart.length} items</span>
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {cart.length === 0 ? (
            <div className="text-center py-12 text-slate-600">
              <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Cart is empty</p>
              <p className="text-xs mt-1">Search and add medicines</p>
            </div>
          ) : cart.map(item => (
            <div key={item.product_id} className="bg-slate-800/60 rounded-xl p-3">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <p className="text-slate-200 text-xs font-semibold truncate">{item.product_name}</p>
                  <p className="text-slate-500 text-[10px]">Batch: {item.batch_number} · Exp: {item.expiry_date}</p>
                  {item.is_controlled && <span className="text-[10px] text-rose-400 font-bold">⚠ CONTROLLED</span>}
                </div>
                <button onClick={() => removeItem(item.product_id)} className="text-slate-600 hover:text-red-400">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button onClick={() => updateQty(item.product_id, -1)}
                    className="w-6 h-6 rounded-lg bg-slate-700 hover:bg-slate-600 flex items-center justify-center text-slate-300">
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="text-slate-200 text-sm font-bold w-6 text-center">{item.qty}</span>
                  <button onClick={() => updateQty(item.product_id, 1)}
                    className="w-6 h-6 rounded-lg bg-slate-700 hover:bg-slate-600 flex items-center justify-center text-slate-300">
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
                <span className="text-emerald-400 font-bold text-sm">
                  TZS {(item.unit_price * item.qty).toLocaleString()}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Totals & Payment */}
        <div className="p-4 border-t border-slate-800 space-y-3">
          {/* Discount */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">Discount %</span>
            <input type="number" value={discount} onChange={e => setDiscount(Math.min(100, Math.max(0, Number(e.target.value))))}
              className="w-16 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-slate-200 text-center text-xs" min={0} max={100} />
          </div>
          <div className="flex justify-between text-xs text-slate-500">
            <span>Subtotal</span><span>TZS {subtotal.toLocaleString()}</span>
          </div>
          {discountAmt > 0 && (
            <div className="flex justify-between text-xs text-rose-400">
              <span>Discount (-{discount}%)</span><span>-TZS {discountAmt.toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between text-slate-200 font-bold">
            <span>Total</span><span className="text-emerald-400">TZS {total.toLocaleString()}</span>
          </div>

          {/* Payment Method */}
          <div className="grid grid-cols-3 gap-1.5">
            {PAYMENT_METHODS.map(m => (
              <button key={m} onClick={() => setPayMethod(m)}
                className={`py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  payMethod === m ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}>{m}</button>
            ))}
          </div>

          {success && (
            <div className="flex items-center gap-2 text-emerald-400 bg-emerald-500/10 rounded-xl p-2.5">
              <CheckCircle className="h-4 w-4" />
              <span className="text-xs font-semibold">Sale completed successfully!</span>
            </div>
          )}

          <button onClick={handleCompleteSale}
            disabled={cart.length === 0 || processing}
            className={`w-full py-3 rounded-xl font-bold text-sm transition-all ${
              cart.length === 0 || processing
                ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white'
            }`}>
            {processing ? '⏳ Processing…' : `Complete Sale · TZS ${total.toLocaleString()}`}
          </button>
        </div>
      </div>
    </div>
  );
};
