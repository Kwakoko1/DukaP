import React, { useState, useMemo } from 'react';
import { useModule } from '../../context/ModuleContext';
import { useAuth } from '../../context/AuthContext';
import { useSyncState } from '../../context/SyncContext';
import { db, type Customer } from '../../db/dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import { Card, CardContent, Button, Input, Dialog, Badge } from '../UI/custom-ui';
import { useToast } from '../UI/Toast';

import { 
  User, Phone, Mail, Award, DollarSign, Search, Coins, Edit2, Trash2, 
  UserPlus, Sparkles 
} from 'lucide-react';

export const Customers: React.FC = () => {
  const { activeModule } = useModule();
  const { hasPermission, currentTenant, currentBranch, user } = useAuth();
  const { queueOperation } = useSyncState();
  const toast = useToast();

  // --- Industry specific configuration ---
  const typeMap: Record<string, string> = useMemo(() => ({
    Retail: 'Customer',
    Restaurant: 'Customer',
    Pharmacy: 'Patient',
    SACCO: 'Member',
    Law: 'Client',
    RealEstate: 'Tenant',
    School: 'Student',
    Hotel: 'Guest',
    BusinessConsultant: 'Client',
  }), [activeModule]);

  const targetType = typeMap[activeModule] || 'Customer';

  // --- IndexedDB Live Query ---
  const customers = useLiveQuery(() => {
    return db.customers.where('tenant_id').equals(currentTenant.id)
      .and(c => c.branch_id === currentBranch.id && c.type === targetType)
      .toArray();
  }, [currentTenant.id, currentBranch.id, targetType]) || [];

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCust, setSelectedCust] = useState<Customer | null>(null);
  
  // Dialog visibility states
  const [isPayOpen, setIsPayOpen] = useState(false);
  const [paymentVal, setPaymentVal] = useState<number>(0);
  const [isWalletOpen, setIsWalletOpen] = useState(false);
  const [walletVal, setWalletVal] = useState<number>(0);
  const [payUsingWallet, setPayUsingWallet] = useState(false);
  
  // CRUD state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'CREATE' | 'EDIT'>('CREATE');
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formCreditLimit, setFormCreditLimit] = useState<number>(0);
  const [formLoyaltyPoints, setFormLoyaltyPoints] = useState<number>(0);
  const [formWalletBalance, setFormWalletBalance] = useState<number>(0);

  const canManagePayments = hasPermission('payment.manage');
  const canEditCustomers = hasPermission('inventory.product.create') || roleIsAdminOrOwner(user?.role);

  function roleIsAdminOrOwner(roleName?: string) {
    if (!roleName) return false;
    return ['Super Admin', 'Business Owner', 'Tenant Owner', 'Branch Manager'].includes(roleName);
  }

  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => 
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.includes(searchQuery) ||
      c.email.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [customers, searchQuery]);

  // Aggregate stats
  const stats = useMemo(() => {
    const total = customers.length;
    const totalDebt = customers.reduce((sum, c) => sum + (c.outstandingBalance || 0), 0);
    const totalWallet = customers.reduce((sum, c) => sum + (c.walletBalance || 0), 0);
    const totalLoyalty = customers.reduce((sum, c) => sum + (c.loyaltyPoints || 0), 0);
    return { total, totalDebt, totalWallet, totalLoyalty };
  }, [customers]);

  // Determine Loyalty Tier
  const getLoyaltyTier = (pts: number) => {
    if (pts >= 2000) return { label: 'Platinum VIP', color: 'bg-indigo-500 text-white border-indigo-600' };
    if (pts >= 800) return { label: 'Gold Member', color: 'bg-amber-500 text-white border-amber-600' };
    if (pts >= 250) return { label: 'Silver Tier', color: 'bg-slate-300 text-slate-800 border-slate-400' };
    return { label: 'Bronze Partner', color: 'bg-orange-100 text-orange-800 border-orange-200' };
  };

  // Submit new or updated customer profile
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formPhone.trim()) {
      alert('Name and Phone Number are required.');
      return;
    }

    if (formMode === 'CREATE') {
      const isDuplicate = customers.some(c => c.phone === formPhone.trim());
      if (isDuplicate) {
        alert('A customer with this phone number already exists.');
        return;
      }

      const newCust: Customer = {
        id: `cust-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: formName.trim(),
        phone: formPhone.trim(),
        email: formEmail.trim(),
        loyaltyPoints: formLoyaltyPoints || 0,
        outstandingBalance: 0,
        creditLimit: formCreditLimit || 0,
        walletBalance: formWalletBalance || 0,
        tenant_id: currentTenant.id,
        branch_id: currentBranch.id,
        type: targetType,
        origin: 'PRODUCTION'
      };

      await queueOperation('INSERT', 'customers', newCust);
      alert(`Successfully registered new ${targetType.toLowerCase()}: ${newCust.name}`);
    } else {
      if (!selectedCust) return;
      
      const updatedCust: Customer = {
        ...selectedCust,
        name: formName.trim(),
        phone: formPhone.trim(),
        email: formEmail.trim(),
        loyaltyPoints: formLoyaltyPoints || 0,
        creditLimit: formCreditLimit || 0,
        walletBalance: formWalletBalance || 0
      };

      await queueOperation('UPDATE', 'customers', updatedCust);
      alert(`Successfully updated profile details for ${updatedCust.name}`);
    }

    setIsFormOpen(false);
    resetForm();
  };

  // Populate form for editing
  const openEditForm = (c: Customer) => {
    setSelectedCust(c);
    setFormMode('EDIT');
    setFormName(c.name);
    setFormPhone(c.phone);
    setFormEmail(c.email || '');
    setFormCreditLimit(c.creditLimit || 0);
    setFormLoyaltyPoints(c.loyaltyPoints || 0);
    setFormWalletBalance(c.walletBalance || 0);
    setIsFormOpen(true);
  };

  const openCreateForm = () => {
    setSelectedCust(null);
    setFormMode('CREATE');
    resetForm();
    setIsFormOpen(true);
  };

  const resetForm = () => {
    setFormName('');
    setFormPhone('');
    setFormEmail('');
    setFormCreditLimit(0);
    setFormLoyaltyPoints(0);
    setFormWalletBalance(0);
  };

  // Delete customer profile
  const handleDeleteCustomer = async (c: Customer) => {
    if (c.outstandingBalance > 0) {
      toast.error(
        'Cannot delete',
        `This ${targetType.toLowerCase()} has an outstanding debt of ${fmtCcy(c.outstandingBalance)}.`
      );
      return;
    }
    const confirmed = await toast.confirm({
      title: `Delete ${targetType}?`,
      message: `Permanently delete the profile for "${c.name}"? This action is irreversible.`,
      confirmLabel: 'Delete',
      variant: 'danger'
    });
    if (!confirmed) return;

    await queueOperation('DELETE', 'customers', c);
    toast.success('Profile removed', `${c.name}'s profile has been deleted.`);
  };

  // Record payment against outstanding balance
  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCust || paymentVal <= 0) return;

    let updatedWallet = selectedCust.walletBalance || 0;
    if (payUsingWallet) {
      if (updatedWallet < paymentVal) {
        alert('Insufficient wallet balance to perform this repayment.');
        return;
      }
      updatedWallet -= paymentVal;
    }

    const newBalance = Math.max(0, selectedCust.outstandingBalance - paymentVal);
    const updatedCust: Customer = {
      ...selectedCust,
      outstandingBalance: newBalance,
      walletBalance: updatedWallet
    };

    await queueOperation('UPDATE', 'customers', updatedCust);

    setIsPayOpen(false);
    setSelectedCust(null);
    setPaymentVal(0);
    setPayUsingWallet(false);
    alert(`Payment of Tsh. ${paymentVal.toLocaleString()} recorded for ${selectedCust.name}.${payUsingWallet ? ' Deducted from Wallet.' : ''} Remaining Balance: Tsh. ${newBalance.toLocaleString()}`);
  };

  const handleWalletDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCust || walletVal <= 0) return;

    const newBalance = (selectedCust.walletBalance || 0) + walletVal;
    const updatedCust: Customer = {
      ...selectedCust,
      walletBalance: newBalance
    };

    await queueOperation('UPDATE', 'customers', updatedCust);

    setIsWalletOpen(false);
    setSelectedCust(null);
    setWalletVal(0);
    alert(`Successfully deposited Tsh. ${walletVal.toLocaleString()} into ${selectedCust.name}'s wallet. New Wallet Balance: Tsh. ${newBalance.toLocaleString()}`);
  };

  function fmtCcy(n: number): string {
    return `Tsh ${n.toLocaleString('en-TZ')}`;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col space-y-2 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            {activeModule === 'Pharmacy' ? 'Patient Database' : activeModule === 'SACCO' ? 'SACCO Membership Registry' : activeModule === 'BusinessConsultant' ? 'Client Directory' : 'Customer Registry'}
            <Sparkles size={16} className="text-primary animate-pulse" />
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Configure customer records, membership levels, wallet deposits, and store credits.
          </p>
        </div>
        {canEditCustomers && (
          <Button variant="primary" size="sm" onClick={openCreateForm} className="flex items-center gap-1.5 shadow-sm">
            <UserPlus size={15} /> Add {targetType}
          </Button>
        )}
      </div>

      {/* KPI Stats Grid */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card className="hover:shadow-sm transition">
          <CardContent className="p-4 flex items-center space-x-3">
            <div className="p-2.5 rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/20 dark:text-indigo-400"><User size={18} /></div>
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Registered</div>
              <div className="text-lg font-black text-slate-800 dark:text-white mt-0.5">{stats.total}</div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-sm transition">
          <CardContent className="p-4 flex items-center space-x-3">
            <div className="p-2.5 rounded-lg bg-red-50 text-red-600 dark:bg-red-950/20 dark:text-red-400"><DollarSign size={18} /></div>
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{activeModule === 'SACCO' ? 'Loan Book Outstanding' : 'Total Outstanding Credit'}</div>
              <div className="text-lg font-black text-red-600 mt-0.5">{fmtCcy(stats.totalDebt)}</div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-sm transition">
          <CardContent className="p-4 flex items-center space-x-3">
            <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400"><Coins size={18} /></div>
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Prepaid Wallet</div>
              <div className="text-lg font-black text-emerald-600 mt-0.5">{fmtCcy(stats.totalWallet)}</div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-sm transition">
          <CardContent className="p-4 flex items-center space-x-3">
            <div className="p-2.5 rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/20 dark:text-amber-400"><Award size={18} /></div>
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Accumulated Loyalty</div>
              <div className="text-lg font-black text-slate-800 dark:text-white mt-0.5">{stats.totalLoyalty.toLocaleString()} pts</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search toolbar */}
      <div className="flex items-center space-x-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder={`Search ${targetType.toLowerCase()}s by name, email or phone...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-10 w-full rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:border-darkbg-border dark:bg-darkbg-card dark:text-white"
          />
        </div>
      </div>

      {/* Main Registry List */}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {filteredCustomers.length === 0 ? (
          <div className="col-span-full py-16 text-center text-slate-400 italic bg-white dark:bg-darkbg-card rounded-xl border border-dashed border-slate-200 dark:border-darkbg-border/60">
            No customer profiles found matching filters.
          </div>
        ) : (
          filteredCustomers.map((c) => {
            const tier = getLoyaltyTier(c.loyaltyPoints || 0);
            return (
              <Card key={c.id} className="hover:shadow-lg transition duration-200 border border-slate-100 dark:border-darkbg-border relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-1.5 h-full bg-primary" />
                <CardContent className="p-5 space-y-4">
                  {/* Profile Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-darkbg dark:text-slate-300">
                        <User className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate pr-2" title={c.name}>{c.name}</h4>
                        <span className="text-[9px] text-slate-400 font-mono font-semibold uppercase">{c.id.slice(-8)}</span>
                      </div>
                    </div>
                    <Badge variant={c.outstandingBalance > 0 ? 'danger' : 'success'} className="shrink-0 text-[10px]">
                      {c.outstandingBalance > 0 ? 'Debt Due' : 'Zero Balance'}
                    </Badge>
                  </div>

                  {/* Loyalty level tier */}
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[9px] font-bold px-2 py-0.5 border rounded-full ${tier.color}`}>
                      {tier.label}
                    </span>
                    {c.creditLimit && c.creditLimit > 0 ? (
                      <span className="text-[9px] font-bold bg-slate-100 text-slate-600 dark:bg-darkbg dark:text-slate-400 px-2 py-0.5 rounded-full">
                        Limit: {fmtCcy(c.creditLimit)}
                      </span>
                    ) : null}
                  </div>

                  {/* Details Contact */}
                  <div className="space-y-1.5 text-xs text-slate-500 dark:text-slate-400 pt-1">
                    <div className="flex items-center space-x-2">
                      <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span>{c.phone}</span>
                    </div>
                    {c.email && (
                      <div className="flex items-center space-x-2">
                        <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{c.email}</span>
                      </div>
                    )}
                  </div>

                  {/* Account Math Indicators */}
                  <div className={`grid ${activeModule === 'Retail' ? 'grid-cols-3' : 'grid-cols-2'} gap-2 border-t border-slate-100 pt-3 dark:border-darkbg-border/30`}>
                    {activeModule !== 'SACCO' ? (
                      <div className="bg-slate-50 p-2 rounded dark:bg-darkbg">
                        <div className="flex items-center space-x-1 text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                          <Award className="h-3 w-3 text-amber-500" />
                          <span>Loyalty</span>
                        </div>
                        <span className="text-xs font-black text-slate-900 dark:text-white">{(c.loyaltyPoints || 0).toLocaleString()} pts</span>
                      </div>
                    ) : (
                      <div className="bg-slate-50 p-2 rounded dark:bg-darkbg">
                        <div className="flex items-center space-x-1 text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                          <Coins className="h-3 w-3 text-indigo-400" />
                          <span>Shares</span>
                        </div>
                        <span className="text-xs font-black text-slate-900 dark:text-white">Tsh. 2,400,000</span>
                      </div>
                    )}

                    {activeModule === 'Retail' && (
                      <div className="bg-slate-50 p-2 rounded dark:bg-darkbg">
                        <div className="flex items-center space-x-1 text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                          <Coins className="h-3 w-3 text-emerald-500" />
                          <span>Wallet</span>
                        </div>
                        <span className="text-xs font-black text-emerald-600">
                          {(c.walletBalance || 0).toLocaleString()}
                        </span>
                      </div>
                    )}

                    <div className="bg-slate-50 p-2 rounded dark:bg-darkbg">
                      <div className="flex items-center space-x-1 text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                        <DollarSign className="h-3 w-3 text-red-500" />
                        <span>{activeModule === 'SACCO' ? 'Loan Due' : 'Credit Due'}</span>
                      </div>
                      <span className={`text-xs font-black ${c.outstandingBalance > 0 ? 'text-red-500' : 'text-slate-900 dark:text-white'}`}>
                        {c.outstandingBalance.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Actions Drawer */}
                  <div className="flex gap-1.5 pt-1.5">
                    {c.outstandingBalance > 0 && canManagePayments && (
                      <button
                        onClick={() => {
                          setSelectedCust(c);
                          setIsPayOpen(true);
                        }}
                        className="flex-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 py-1.5 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 transition"
                      >
                        Repay
                      </button>
                    )}
                    {activeModule === 'Retail' && canManagePayments && (
                      <button
                        onClick={() => {
                          setSelectedCust(c);
                          setIsWalletOpen(true);
                        }}
                        className="flex-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 py-1.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 transition"
                      >
                        Wallet +
                      </button>
                    )}
                    {canEditCustomers && (
                      <button
                        onClick={() => openEditForm(c)}
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-darkbg-border hover:bg-slate-50 dark:hover:bg-darkbg hover:text-slate-800 text-slate-400"
                        title="Edit Profile"
                      >
                        <Edit2 size={12} />
                      </button>
                    )}
                    {canEditCustomers && (
                      <button
                        onClick={() => handleDeleteCustomer(c)}
                        className="p-1.5 rounded-lg border border-red-200 hover:bg-red-50 dark:border-red-950/20 dark:hover:bg-red-950/20 text-red-500"
                        title="Delete Profile"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* --- ADD / EDIT Profile Dialog --- */}
      <Dialog
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          resetForm();
        }}
        title={formMode === 'CREATE' ? `Register New ${targetType}` : `Modify Profile: ${formName}`}
        size="md"
      >
        <form onSubmit={handleFormSubmit} className="space-y-4">
          <Input 
            label={`${targetType} Full Name *`} 
            placeholder="e.g. Amani Mwakalundwa" 
            value={formName}
            onChange={e => setFormName(e.target.value)}
            required
          />
          <Input 
            label="Phone Number * (Must be unique)" 
            placeholder="e.g. 0712345678" 
            value={formPhone}
            onChange={e => setFormPhone(e.target.value)}
            required
          />
          <Input 
            label="Email Address" 
            placeholder="e.g. amani@example.com" 
            value={formEmail}
            onChange={e => setFormEmail(e.target.value)}
            type="email"
          />
          <div className="grid grid-cols-2 gap-4">
            <Input 
              label="Store Credit Limit (Tsh.)" 
              placeholder="e.g. 50000" 
              value={formCreditLimit === 0 ? '' : formCreditLimit}
              onChange={e => setFormCreditLimit(Number(e.target.value) || 0)}
              type="number"
            />
            <Input 
              label="Opening Loyalty Points" 
              placeholder="e.g. 50" 
              value={formLoyaltyPoints === 0 ? '' : formLoyaltyPoints}
              onChange={e => setFormLoyaltyPoints(Number(e.target.value) || 0)}
              type="number"
            />
          </div>
          {formMode === 'CREATE' && activeModule === 'Retail' && (
            <Input 
              label="Initial Prepaid Wallet Balance (Tsh.)" 
              placeholder="e.g. 10000" 
              value={formWalletBalance === 0 ? '' : formWalletBalance}
              onChange={e => setFormWalletBalance(Number(e.target.value) || 0)}
              type="number"
            />
          )}

          <div className="flex justify-end gap-2 border-t border-slate-100 dark:border-darkbg-border/30 pt-3 mt-4">
            <Button variant="outline" type="button" onClick={() => { setIsFormOpen(false); resetForm(); }}>Cancel</Button>
            <Button variant="primary" type="submit">
              {formMode === 'CREATE' ? 'Register Profile' : 'Save Modifications'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* --- Repayment Modal Dialog --- */}
      <Dialog
        isOpen={isPayOpen}
        onClose={() => {
          setIsPayOpen(false);
          setSelectedCust(null);
          setPayUsingWallet(false);
        }}
        title="Record Repayment / Credit Liquidation"
        description="Reduces the customer's outstanding store debt/loan balance."
      >
        {selectedCust && (
          <form onSubmit={handlePaymentSubmit} className="space-y-4">
            <div className="text-xs">
              <span className="text-slate-400">Account: </span>
              <strong className="text-slate-800 dark:text-white">{selectedCust.name} ({selectedCust.type})</strong>
            </div>
            <div className="text-xs text-red-500">
              <span>Outstanding Debt: </span>
              <strong className="font-extrabold">{fmtCcy(selectedCust.outstandingBalance)}</strong>
            </div>

            {activeModule === 'Retail' && (selectedCust.walletBalance || 0) > 0 && (
              <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 rounded-lg p-3 text-xs flex justify-between items-center">
                <div>
                  <span className="text-slate-500 block">Available Wallet Balance:</span>
                  <strong className="text-emerald-700 dark:text-emerald-400 font-extrabold">{fmtCcy(selectedCust.walletBalance || 0)}</strong>
                </div>
                <label className="flex items-center space-x-2 font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={payUsingWallet}
                    onChange={(e) => {
                      setPayUsingWallet(e.target.checked);
                      if (e.target.checked) {
                        setPaymentVal(Math.min(selectedCust.outstandingBalance, selectedCust.walletBalance || 0));
                      } else {
                        setPaymentVal(0);
                      }
                    }}
                  />
                  <span>Pay from Wallet</span>
                </label>
              </div>
            )}
            
            <Input
              type="number"
              label="Amount Received (Tsh.) *"
              value={paymentVal === 0 ? '' : paymentVal}
              onChange={(e) => setPaymentVal(Number(e.target.value))}
              placeholder="Enter amount paid"
              disabled={payUsingWallet}
              required
            />

            <div className="flex justify-end gap-2 border-t border-slate-100 dark:border-darkbg-border/30 pt-3 mt-4">
              <Button variant="outline" type="button" onClick={() => { setIsPayOpen(false); setSelectedCust(null); setPayUsingWallet(false); }}>Cancel</Button>
              <Button variant="primary" type="submit">Submit Payment</Button>
            </div>
          </form>
        )}
      </Dialog>

      {/* --- Wallet Deposit Modal Dialog --- */}
      <Dialog
        isOpen={isWalletOpen}
        onClose={() => {
          setIsWalletOpen(false);
          setSelectedCust(null);
        }}
        title="Deposit Cash into Customer Wallet"
        description="Increases the customer's prepaid balance for rapid checkout."
      >
        {selectedCust && (
          <form onSubmit={handleWalletDeposit} className="space-y-4">
            <div className="text-xs">
              <span className="text-slate-400">Account: </span>
              <strong className="text-slate-800 dark:text-white">{selectedCust.name} (Wallet: {fmtCcy(selectedCust.walletBalance || 0)})</strong>
            </div>
            
            <Input
              type="number"
              label="Amount to Deposit (Tsh.) *"
              value={walletVal === 0 ? '' : walletVal}
              onChange={(e) => setWalletVal(Number(e.target.value))}
              placeholder="Enter deposit amount"
              required
            />

            <div className="flex justify-end gap-2 border-t border-slate-100 dark:border-darkbg-border/30 pt-3 mt-4">
              <Button variant="outline" type="button" onClick={() => { setIsWalletOpen(false); setSelectedCust(null); }}>Cancel</Button>
              <Button variant="primary" type="submit">Deposit Funds</Button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
};
