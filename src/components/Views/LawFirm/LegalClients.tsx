import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type LegalClient } from '../../../db/dexie';
import { useAuth } from '../../../context/AuthContext';
import { Users, Plus, Search, Building, User as UserIcon } from 'lucide-react';
import { Badge } from '../../UI/custom-ui';

export const LegalClients: React.FC = () => {
  const { currentTenant } = useAuth();
  const tenantId = currentTenant?.id || '';

  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Client Form state
  const [clientType, setClientType] = useState<'INDIVIDUAL' | 'CORPORATE'>('INDIVIDUAL');
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [regNumber, setRegNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [taxId, setTaxId] = useState('');
  const [notes, setNotes] = useState('');

  const clients = useLiveQuery(async () => {
    if (!tenantId) return [];
    const all = await db.legalClients.where('tenant_id').equals(tenantId).toArray();
    return all.filter(c => !c.is_deleted);
  }, [tenantId]) || [];

  const filteredClients = useMemo(() => {
    if (!searchTerm.trim()) return clients;
    const q = searchTerm.toLowerCase();
    return clients.filter(c => 
      c.name.toLowerCase().includes(q) || 
      (c.company_name && c.company_name.toLowerCase().includes(q)) ||
      (c.phone && c.phone.includes(q))
    );
  }, [clients, searchTerm]);

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('Client Name is required.');
      return;
    }

    const newClient: LegalClient = {
      id: `lc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      tenant_id: tenantId,
      type: clientType,
      name,
      company_name: clientType === 'CORPORATE' ? companyName : undefined,
      reg_number: clientType === 'CORPORATE' ? regNumber : undefined,
      phone,
      email,
      address,
      tax_id: taxId,
      status: 'Active',
      notes,
      created_at: Date.now(),
      updated_at: Date.now()
    };

    await db.legalClients.add(newClient);
    setIsModalOpen(false);
    // Reset form
    setName('');
    setCompanyName('');
    setRegNumber('');
    setPhone('');
    setEmail('');
    setAddress('');
    setTaxId('');
    setNotes('');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="h-5 w-5 text-indigo-600" />
            Legal Client Directory
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Individual litigants and corporate client entities registered under firm practice.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md transition shrink-0"
        >
          <Plus size={15} />
          <span>Register New Client</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search by client name, company, or phone..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full rounded-xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg-card pl-9 pr-4 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
        />
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg/40 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="p-3.5 pl-6">Client Name</th>
                <th className="p-3.5">Type</th>
                <th className="p-3.5">Company / Reg #</th>
                <th className="p-3.5">Contact Details</th>
                <th className="p-3.5">TIN / Tax ID</th>
                <th className="p-3.5 pr-6 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/30">
              {filteredClients.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400 italic">
                    No legal clients registered yet.
                  </td>
                </tr>
              ) : (
                filteredClients.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">
                    <td className="p-3.5 pl-6 font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      {c.type === 'CORPORATE' ? <Building size={15} className="text-purple-600" /> : <UserIcon size={15} className="text-blue-600" />}
                      <span>{c.name}</span>
                    </td>
                    <td className="p-3.5">
                      <Badge variant="outline" className="text-[10px] uppercase font-mono">
                        {c.type}
                      </Badge>
                    </td>
                    <td className="p-3.5 text-slate-600 dark:text-slate-300">
                      {c.company_name || '—'} {c.reg_number && <span className="text-[10px] text-slate-400 block font-mono">#{c.reg_number}</span>}
                    </td>
                    <td className="p-3.5 text-slate-600 dark:text-slate-300">
                      <div>{c.phone || 'No phone'}</div>
                      <div className="text-[10px] text-slate-400">{c.email || 'No email'}</div>
                    </td>
                    <td className="p-3.5 font-mono text-slate-500">{c.tax_id || '—'}</td>
                    <td className="p-3.5 pr-6 text-right">
                      <Badge variant="success" className="text-[10px]">
                        {c.status}
                      </Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Form */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border max-w-lg w-full p-6 shadow-2xl space-y-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Register Legal Client</h2>
            
            <form onSubmit={handleCreateClient} className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-500 block mb-1">Client Type</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setClientType('INDIVIDUAL')}
                    className={`flex-1 py-1.5 rounded-xl text-xs font-bold border ${clientType === 'INDIVIDUAL' ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-200 text-slate-600'}`}
                  >
                    Individual Client
                  </button>
                  <button
                    type="button"
                    onClick={() => setClientType('CORPORATE')}
                    className={`flex-1 py-1.5 rounded-xl text-xs font-bold border ${clientType === 'CORPORATE' ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-200 text-slate-600'}`}
                  >
                    Corporate Entity
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-500 block mb-1">Client Name *</label>
                <input
                  type="text"
                  required
                  placeholder={clientType === 'CORPORATE' ? 'Representative Name' : 'Full Legal Name'}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-darkbg-border p-2 text-xs"
                />
              </div>

              {clientType === 'CORPORATE' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 block mb-1">Company Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Acme Ltd"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 dark:border-darkbg-border p-2 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 block mb-1">Registration #</label>
                    <input
                      type="text"
                      placeholder="BRELA Reg #"
                      value={regNumber}
                      onChange={(e) => setRegNumber(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 dark:border-darkbg-border p-2 text-xs"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">Phone</label>
                  <input
                    type="text"
                    placeholder="+255..."
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-darkbg-border p-2 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">Email</label>
                  <input
                    type="email"
                    placeholder="client@law.co.tz"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-darkbg-border p-2 text-xs"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white"
                >
                  Save Client
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
