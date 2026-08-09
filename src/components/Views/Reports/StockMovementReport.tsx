import React, { useMemo } from 'react';
import { Package, TrendingDown, AlertTriangle, ArrowLeftRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { KpiCard, SectionCard, EmptyRows, CustomTooltip, CHART_COLORS } from './types';
import type { ReportProps } from './types';

const MOVEMENT_COLORS: Record<string, string> = {
  SALE: '#EF4444', PURCHASE_RECEIVE: '#10B981', CUSTOMER_RETURN: '#3B82F6',
  TRANSFER_IN: '#6366F1', TRANSFER_OUT: '#F97316', DAMAGE: '#DC2626',
  EXPIRY: '#7C3AED', ADJUSTMENT_GAIN: '#059669', ADJUSTMENT_LOSS: '#B45309',
  OPENING_STOCK: '#0EA5E9', PRODUCTION_OUTPUT: '#14B8A6', SUPPLIER_RETURN: '#F43F5E',
  PRODUCTION_USAGE: '#8B5CF6',
};
const IN_TYPES = ['PURCHASE_RECEIVE', 'CUSTOMER_RETURN', 'TRANSFER_IN', 'PRODUCTION_OUTPUT', 'ADJUSTMENT_GAIN', 'OPENING_STOCK'];
const LOSS_TYPES = ['DAMAGE', 'EXPIRY', 'ADJUSTMENT_LOSS'];

export const StockMovementReport: React.FC<ReportProps> = ({ stockLedger, products, productVariants, searchTerm, fmtCcy }) => {
  const productMap = useMemo(() => {
    const m: Record<string, string> = {};
    products.forEach(p => { m[p.id] = p.name; });
    productVariants.forEach(v => {
      const parent = products.find(p => p.id === v.productId);
      m[v.id] = parent ? `${parent.name} (${Object.values(v.attributes || {}).join('/')})` : v.id;
    });
    return m;
  }, [products, productVariants]);

  const totalIn = useMemo(() => stockLedger.filter(e => IN_TYPES.includes(e.movement_type)).reduce((s, e) => s + Math.abs(e.quantity_change || 0), 0), [stockLedger]);
  const totalOut = useMemo(() => stockLedger.filter(e => !IN_TYPES.includes(e.movement_type)).reduce((s, e) => s + Math.abs(e.quantity_change || 0), 0), [stockLedger]);
  const lossValue = useMemo(() => stockLedger.filter(e => LOSS_TYPES.includes(e.movement_type)).reduce((s, e) => s + Math.abs(e.total_cost || 0), 0), [stockLedger]);

  const byType = useMemo(() => {
    const buckets: Record<string, { count: number; qty: number; value: number }> = {};
    stockLedger.forEach(e => {
      if (!buckets[e.movement_type]) buckets[e.movement_type] = { count: 0, qty: 0, value: 0 };
      buckets[e.movement_type].count += 1;
      buckets[e.movement_type].qty += Math.abs(e.quantity_change || 0);
      buckets[e.movement_type].value += Math.abs(e.total_cost || 0);
    });
    return Object.entries(buckets).map(([type, v]) => ({ type, ...v })).sort((a, b) => b.qty - a.qty);
  }, [stockLedger]);

  const chartData = byType.map(e => ({ name: e.type.replace(/_/g, ' '), Qty: e.qty }));

  const filtered = useMemo(() => {
    let data = stockLedger.map(e => ({ ...e, productName: productMap[e.product_id] || e.product_id }));
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      data = data.filter(e => e.productName.toLowerCase().includes(q) || e.movement_type.toLowerCase().includes(q));
    }
    return data.sort((a, b) => b.created_at - a.created_at).slice(0, 200);
  }, [stockLedger, productMap, searchTerm]);

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Stock In (units)" value={`${totalIn.toLocaleString()} units`} icon={<Package className="h-4 w-4" />} color="text-emerald-600" bg="bg-emerald-50 dark:bg-emerald-950/20" />
        <KpiCard label="Total Stock Out (units)" value={`${totalOut.toLocaleString()} units`} icon={<TrendingDown className="h-4 w-4" />} color="text-red-500" bg="bg-red-50 dark:bg-red-950/20" />
        <KpiCard label="Loss Value (Damage/Expiry)" value={fmtCcy(lossValue)} icon={<AlertTriangle className="h-4 w-4" />} color="text-amber-500" bg="bg-amber-50 dark:bg-amber-950/20" />
        <KpiCard label="Total Movement Events" value={`${stockLedger.length} entries`} icon={<ArrowLeftRight className="h-4 w-4" />} color="text-indigo-600" bg="bg-indigo-50 dark:bg-indigo-950/20" />
      </div>

      <SectionCard title="Movement by Type" description="Quantity moved per movement category">
        <div className="p-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 30 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="name" fontSize={8} stroke="#94A3B8" angle={-30} textAnchor="end" />
              <YAxis fontSize={10} stroke="#94A3B8" />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="Qty" fill={CHART_COLORS.indigo} radius={[3, 3, 0, 0]} name="Quantity" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      <SectionCard title="Stock Movement Audit Trail" description="Full history of all stock movements (latest 200 entries)">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-100 dark:border-darkbg-border/30 bg-slate-50/50 dark:bg-darkbg/10 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <th className="p-3.5 pl-6">Date</th><th className="p-3.5">Product</th>
                <th className="p-3.5">Movement Type</th><th className="p-3.5 text-center">Before</th>
                <th className="p-3.5 text-center">Change</th><th className="p-3.5 text-center">After</th><th className="p-3.5 pr-6">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/20">
              {filtered.length === 0 ? <EmptyRows cols={7} message="No stock movements found." /> :
                filtered.map((e: any, idx) => {
                  const color = MOVEMENT_COLORS[e.movement_type] || '#94A3B8';
                  const isIn = IN_TYPES.includes(e.movement_type);
                  return (
                    <tr key={idx} className="hover:bg-slate-50/40 dark:hover:bg-slate-800/10 transition-colors">
                      <td className="p-3.5 pl-6 text-slate-500">{new Date(e.created_at).toLocaleDateString()}</td>
                      <td className="p-3.5 font-semibold text-slate-900 dark:text-white">{e.productName}</td>
                      <td className="p-3.5">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ backgroundColor: color + '22', color }}>{e.movement_type.replace(/_/g, ' ')}</span>
                      </td>
                      <td className="p-3.5 text-center text-slate-500">{e.quantity_before}</td>
                      <td className={`p-3.5 text-center font-black ${isIn ? 'text-emerald-600' : 'text-red-500'}`}>{isIn ? '+' : ''}{e.quantity_change}</td>
                      <td className="p-3.5 text-center font-bold text-slate-800 dark:text-white">{e.quantity_after}</td>
                      <td className="p-3.5 pr-6 font-bold text-slate-700 dark:text-slate-300">{fmtCcy(e.total_cost || 0)}</td>
                    </tr>
                  );
                })
              }
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
};
