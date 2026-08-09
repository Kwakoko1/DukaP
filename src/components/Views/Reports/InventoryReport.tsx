import React, { useMemo } from 'react';
import { Layers, TrendingUp, AlertTriangle, Activity } from 'lucide-react';
import { KpiCard, SectionCard, EmptyRows } from './types';
import type { ReportProps } from './types';

export const InventoryReport: React.FC<ReportProps> = ({
  products, productVariants, searchTerm, fmtCcy
}) => {
  const inventoryData = useMemo(() => {
    const data: any[] = [];
    products.filter(p => !p.hasVariants).forEach(p => {
      data.push({
        sku: p.sku || '—', name: p.name, details: 'Simple Product',
        stock: p.stock, reorderLevel: p.reorderLevel ?? 5,
        buyingPrice: p.buyingPrice, sellingPrice: p.sellingPrice || p.price,
        stockValue: p.stock * p.buyingPrice,
        potentialProfit: p.stock * ((p.sellingPrice || p.price) - p.buyingPrice)
      });
    });
    productVariants.forEach(v => {
      const parent = products.find(p => p.id === v.productId);
      if (!parent) return;
      const bp = v.buyingPrice !== undefined ? v.buyingPrice : parent.buyingPrice;
      const sp = v.sellingPrice !== undefined ? v.sellingPrice : (parent.sellingPrice || parent.price);
      data.push({
        sku: v.sku || '—', name: parent.name,
        details: Object.entries(v.attributes || {}).map(([k, val]) => `${k}: ${val}`).join(' / '),
        stock: v.stock, reorderLevel: v.reorderLevel ?? 5,
        buyingPrice: bp, sellingPrice: sp,
        stockValue: v.stock * bp, potentialProfit: v.stock * (sp - bp)
      });
    });
    return data;
  }, [products, productVariants]);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return inventoryData;
    const q = searchTerm.toLowerCase();
    return inventoryData.filter(i => i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q));
  }, [inventoryData, searchTerm]);

  const totalValue = inventoryData.reduce((s, i) => s + i.stockValue, 0);
  const potentialProfit = inventoryData.reduce((s, i) => s + i.potentialProfit, 0);
  const lowStock = inventoryData.filter(i => i.stock < i.reorderLevel).length;
  const totalUnits = inventoryData.reduce((s, i) => s + i.stock, 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Catalog Value" value={fmtCcy(totalValue)} icon={<Layers className="h-4 w-4" />} color="text-indigo-600" bg="bg-indigo-50 dark:bg-indigo-950/20" />
        <KpiCard label="Est. Potential Profit" value={fmtCcy(potentialProfit)} icon={<TrendingUp className="h-4 w-4" />} color="text-emerald-600" bg="bg-emerald-50 dark:bg-emerald-950/20" />
        <KpiCard label="Low Stock Alerts" value={`${lowStock} Items`} icon={<AlertTriangle className="h-4 w-4" />} color="text-amber-500" bg="bg-amber-50 dark:bg-amber-950/20" />
        <KpiCard label="Total Units Stocked" value={`${totalUnits} Units`} icon={<Activity className="h-4 w-4" />} color="text-blue-600" bg="bg-blue-50 dark:bg-blue-950/20" />
      </div>
      <SectionCard title="Unified Stock Valuation" description="Detailed breakdown of simple products and variant valuation costs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-100 dark:border-darkbg-border/30 bg-slate-50/50 dark:bg-darkbg/10 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <th className="p-3.5 pl-6">SKU</th><th className="p-3.5">Product Name</th><th className="p-3.5">Details</th>
                <th className="p-3.5 text-center">Stock</th><th className="p-3.5">Cost Price</th>
                <th className="p-3.5">Selling Price</th><th className="p-3.5">Stock Value</th><th className="p-3.5 pr-6">Pot. Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/20">
              {filtered.length === 0 ? <EmptyRows cols={8} message="No products found." /> :
                filtered.map((item, idx) => (
                  <tr key={idx} className={`hover:bg-slate-50/40 dark:hover:bg-slate-800/10 transition-colors ${item.stock < item.reorderLevel ? 'bg-amber-50/30 dark:bg-amber-950/10' : ''}`}>
                    <td className="p-3.5 pl-6 font-mono font-bold text-slate-700 dark:text-slate-300">{item.sku}</td>
                    <td className="p-3.5 font-semibold text-slate-900 dark:text-white">{item.name}</td>
                    <td className="p-3.5 text-slate-400">{item.details}</td>
                    <td className="p-3.5 text-center font-bold">
                      <span className={item.stock < item.reorderLevel ? 'text-red-500' : ''}>{item.stock} units</span>
                    </td>
                    <td className="p-3.5 text-slate-500">{fmtCcy(item.buyingPrice)}</td>
                    <td className="p-3.5 text-slate-500">{fmtCcy(item.sellingPrice)}</td>
                    <td className="p-3.5 font-bold text-indigo-600">{fmtCcy(item.stockValue)}</td>
                    <td className="p-3.5 pr-6 font-bold text-emerald-600">{fmtCcy(item.potentialProfit)}</td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
};
