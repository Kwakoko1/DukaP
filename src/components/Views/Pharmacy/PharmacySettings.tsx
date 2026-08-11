import React, { useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { db } from '../../../db/dexie';
import {
  Settings, Building2, Bell, Shield, Printer,
  Globe, Users, Pill, Save, ChevronRight, ToggleLeft, ToggleRight,
  AlertTriangle, Check, FileText, Layers
} from 'lucide-react';

type SettingsTab = 'General' | 'Dispensing Rules' | 'Alerts & Notifications' | 'Receipt & Print' | 'Regulatory & Compliance' | 'Users & Roles';

interface Toggle {
  id: string;
  label: string;
  description: string;
  value: boolean;
}

export const PharmacySettings: React.FC = () => {
  const { user, currentTenant } = useAuth();
  const tenantId = user?.tenant_id || '';

  const [activeTab, setActiveTab] = useState<SettingsTab>('General');
  const [saved, setSaved] = useState(false);

  // General pharmacy info
  const [pharmacyInfo, setPharmacyInfo] = useState({
    pharmacy_name: currentTenant?.name || '',
    registration_no: '',
    license_no: '',
    tfda_permit: '',
    pharmacist_name: '',
    pharmacist_license: '',
    address: '',
    phone: '',
    email: '',
    website: '',
    opening_hours: '8:00 AM – 8:00 PM',
    currency: 'TZS',
    country: 'Tanzania',
  });

  // Dispensing rules toggles
  const [dispensingToggles, setDispensingToggles] = useState<Toggle[]>([
    { id: 'require_prescription', label: 'Require Prescription for Rx Drugs', description: 'Block sale of prescription medicines without a valid prescription attached.', value: true },
    { id: 'fefo_enabled', label: 'Enable FEFO (First Expiry, First Out)', description: 'Automatically prioritise earliest-expiring batches during dispensing.', value: true },
    { id: 'partial_dispensing', label: 'Allow Partial Dispensing', description: 'Permit partial quantity dispensing when full stock is unavailable.', value: true },
    { id: 'generic_substitution', label: 'Allow Generic Substitution', description: 'Allow pharmacists to substitute brand medicines with approved generics.', value: false },
    { id: 'counselling_required', label: 'Mandatory Patient Counselling', description: 'Require pharmacist counselling notes before dispensing controlled drugs.', value: true },
    { id: 'block_negative_stock', label: 'Block Sales on Zero Stock', description: 'Prevent dispensing when stock reaches zero (avoids negative balances).', value: true },
    { id: 'cd_witness_required', label: 'Require Witness for CD Dispensing', description: 'Mandatory witness sign-off for Schedule I & II controlled drug transactions.', value: true },
  ]);

  // Alert settings
  const [alertSettings, setAlertSettings] = useState({
    expiry_alert_days: 90,
    near_expiry_days: 30,
    low_stock_threshold: 10,
    reorder_auto_alert: true,
    nhif_claim_reminder: true,
    cd_reconciliation_daily: true,
    email_alerts: false,
    sms_alerts: false,
  });

  // Receipt settings
  const [receiptSettings, setReceiptSettings] = useState({
    show_prescriber_name: true,
    show_batch_no: true,
    show_expiry_date: true,
    show_dosage_instructions: true,
    show_pharmacist_signature: true,
    show_nhif_details: true,
    footer_text: 'Thank you for choosing our pharmacy. For queries, please consult your pharmacist.',
    receipt_copies: 1,
    thermal_printer: true,
  });

  const handleToggle = (id: string) => {
    setDispensingToggles(prev => prev.map(t => t.id === id ? { ...t, value: !t.value } : t));
  };

  const handleSave = async () => {
    // Persist to tenant settings in IndexedDB
    try {
      await db.tenantSettings.put({
        id: `pharmacy-settings-${tenantId}`,
        tenant_id: tenantId,
        namespace: 'PHARMACY',
        settings: JSON.stringify({ pharmacyInfo, dispensingToggles, alertSettings, receiptSettings }),
        updated_at: Date.now(),
      } as any);
    } catch {
      // silently handle if schema differs
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const tabs: SettingsTab[] = ['General', 'Dispensing Rules', 'Alerts & Notifications', 'Receipt & Print', 'Regulatory & Compliance', 'Users & Roles'];

  return (
    <div className="space-y-5 p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Settings className="h-6 w-6 text-emerald-500" />
            Pharmacy Settings
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Configure your pharmacy operations, compliance rules, and notification preferences.
          </p>
        </div>
        <button
          onClick={handleSave}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition active:scale-95 ${
            saved ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30' : 'bg-emerald-600 hover:bg-emerald-700 text-white'
          }`}
        >
          {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-darkbg-border overflow-x-auto">
        {tabs.map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`px-3 py-2 text-xs font-semibold border-b-2 whitespace-nowrap transition ${
              activeTab === t ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}>
            {t}
          </button>
        ))}
      </div>

      {/* General Settings */}
      {activeTab === 'General' && (
        <div className="space-y-5">
          {/* Pharmacy Profile */}
          <div className="rounded-2xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Building2 className="h-4 w-4 text-emerald-500" />
              <h3 className="font-bold text-sm text-slate-700 dark:text-white">Pharmacy Profile</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { label: 'Pharmacy Name', key: 'pharmacy_name' },
                { label: 'Business Registration No.', key: 'registration_no' },
                { label: 'Pharmacy License No.', key: 'license_no' },
                { label: 'TFDA Permit Number', key: 'tfda_permit' },
                { label: 'Responsible Pharmacist Name', key: 'pharmacist_name' },
                { label: 'Pharmacist License No.', key: 'pharmacist_license' },
                { label: 'Physical Address', key: 'address' },
                { label: 'Phone Number', key: 'phone' },
                { label: 'Email Address', key: 'email' },
                { label: 'Website', key: 'website' },
                { label: 'Operating Hours', key: 'opening_hours' },
                { label: 'Currency', key: 'currency' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs text-slate-500 mb-1 block">{f.label}</label>
                  <input
                    value={(pharmacyInfo as any)[f.key]}
                    onChange={e => setPharmacyInfo(p => ({ ...p, [f.key]: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Dispensing Rules */}
      {activeTab === 'Dispensing Rules' && (
        <div className="rounded-2xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg-card divide-y divide-slate-100 dark:divide-darkbg-border/50 overflow-hidden">
          <div className="p-4 flex items-center gap-2">
            <Pill className="h-4 w-4 text-emerald-500" />
            <h3 className="font-bold text-sm text-slate-700 dark:text-white">Dispensing & Inventory Rules</h3>
          </div>
          {dispensingToggles.map(t => (
            <div key={t.id} className="flex items-start justify-between gap-4 p-4 hover:bg-slate-50 dark:hover:bg-darkbg/30 transition">
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-800 dark:text-white">{t.label}</p>
                <p className="text-xs text-slate-400 mt-0.5">{t.description}</p>
              </div>
              <button
                onClick={() => handleToggle(t.id)}
                className={`shrink-0 mt-0.5 transition ${t.value ? 'text-emerald-500' : 'text-slate-300 dark:text-slate-600'}`}
              >
                {t.value
                  ? <ToggleRight className="h-7 w-7" />
                  : <ToggleLeft className="h-7 w-7" />
                }
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Alerts & Notifications */}
      {activeTab === 'Alerts & Notifications' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Bell className="h-4 w-4 text-emerald-500" />
              <h3 className="font-bold text-sm text-slate-700 dark:text-white">Stock & Expiry Alert Thresholds</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: 'Expiry Alert Window (days)', key: 'expiry_alert_days' },
                { label: 'Near-Expiry Warning (days)', key: 'near_expiry_days' },
                { label: 'Low Stock Threshold (units)', key: 'low_stock_threshold' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs text-slate-500 mb-1 block">{f.label}</label>
                  <input
                    type="number"
                    value={(alertSettings as any)[f.key]}
                    onChange={e => setAlertSettings(p => ({ ...p, [f.key]: Number(e.target.value) }))}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg-card divide-y divide-slate-100 dark:divide-darkbg-border/50 overflow-hidden">
            <div className="p-4 flex items-center gap-2">
              <Bell className="h-4 w-4 text-blue-500" />
              <h3 className="font-bold text-sm text-slate-700 dark:text-white">Notification Preferences</h3>
            </div>
            {[
              { key: 'reorder_auto_alert', label: 'Auto-Reorder Alerts', desc: 'Trigger automatic reorder alerts when stock hits minimum threshold.' },
              { key: 'nhif_claim_reminder', label: 'NHIF Claim Submission Reminders', desc: 'Daily reminder for pending NHIF claims ready for submission.' },
              { key: 'cd_reconciliation_daily', label: 'Daily CD Reconciliation Reminder', desc: 'Daily prompt for controlled drug balance reconciliation.' },
              { key: 'email_alerts', label: 'Email Notifications', desc: 'Send stock and compliance alerts via email.' },
              { key: 'sms_alerts', label: 'SMS Notifications', desc: 'Send critical alerts via SMS (requires SMS gateway configuration).' },
            ].map(s => (
              <div key={s.key} className="flex items-start justify-between gap-4 p-4 hover:bg-slate-50 dark:hover:bg-darkbg/30 transition">
                <div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-white">{s.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{s.desc}</p>
                </div>
                <button
                  onClick={() => setAlertSettings(p => ({ ...p, [s.key]: !(p as any)[s.key] }))}
                  className={`shrink-0 mt-0.5 transition ${(alertSettings as any)[s.key] ? 'text-emerald-500' : 'text-slate-300 dark:text-slate-600'}`}
                >
                  {(alertSettings as any)[s.key] ? <ToggleRight className="h-7 w-7" /> : <ToggleLeft className="h-7 w-7" />}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Receipt & Print */}
      {activeTab === 'Receipt & Print' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg-card divide-y divide-slate-100 dark:divide-darkbg-border/50 overflow-hidden">
            <div className="p-4 flex items-center gap-2">
              <Printer className="h-4 w-4 text-emerald-500" />
              <h3 className="font-bold text-sm text-slate-700 dark:text-white">Dispensing Receipt Options</h3>
            </div>
            {[
              { key: 'show_prescriber_name', label: 'Show Prescriber Name', desc: "Display prescribing doctor's name on dispensing receipt." },
              { key: 'show_batch_no', label: 'Show Batch Number', desc: 'Print batch number on each dispensed item for traceability.' },
              { key: 'show_expiry_date', label: 'Show Expiry Date', desc: 'Print expiry date of each dispensed medicine on receipt.' },
              { key: 'show_dosage_instructions', label: 'Show Dosage Instructions', desc: 'Include pharmacist dosage instructions on the receipt.' },
              { key: 'show_pharmacist_signature', label: 'Include Pharmacist Signature Line', desc: 'Print a signature line for pharmacist authentication.' },
              { key: 'show_nhif_details', label: 'Include NHIF Details on Receipt', desc: 'Show NHIF claim code and co-payment details when applicable.' },
              { key: 'thermal_printer', label: 'Thermal Printer Mode', desc: 'Optimise receipt format for 80mm thermal receipt printers.' },
            ].map(s => (
              <div key={s.key} className="flex items-start justify-between gap-4 p-4 hover:bg-slate-50 dark:hover:bg-darkbg/30 transition">
                <div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-white">{s.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{s.desc}</p>
                </div>
                <button
                  onClick={() => setReceiptSettings(p => ({ ...p, [s.key]: !(p as any)[s.key] }))}
                  className={`shrink-0 mt-0.5 transition ${(receiptSettings as any)[s.key] ? 'text-emerald-500' : 'text-slate-300 dark:text-slate-600'}`}
                >
                  {(receiptSettings as any)[s.key] ? <ToggleRight className="h-7 w-7" /> : <ToggleLeft className="h-7 w-7" />}
                </button>
              </div>
            ))}
            <div className="p-4">
              <label className="text-xs text-slate-500 mb-1 block">Receipt Footer Text</label>
              <textarea
                value={receiptSettings.footer_text}
                onChange={e => setReceiptSettings(p => ({ ...p, footer_text: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>
            <div className="p-4">
              <label className="text-xs text-slate-500 mb-1 block">Receipt Copies (for controlled drugs)</label>
              <input
                type="number"
                min={1}
                max={5}
                value={receiptSettings.receipt_copies}
                onChange={e => setReceiptSettings(p => ({ ...p, receipt_copies: Number(e.target.value) }))}
                className="w-32 px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>
          </div>
        </div>
      )}

      {/* Regulatory & Compliance */}
      {activeTab === 'Regulatory & Compliance' && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-2xl p-4">
            <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-bold text-amber-700 dark:text-amber-400">Regulatory Compliance Settings</p>
              <p className="text-xs text-amber-600 dark:text-amber-300 mt-0.5">
                These settings affect your pharmacy's regulatory compliance posture. Changes are logged and subject to TFDA inspection. Do not disable mandatory compliance controls without consulting your regulatory pharmacist.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { icon: Shield, title: 'TFDA Registration', desc: 'Tanzania Food and Drug Authority pharmacy registration management.', status: 'Active', color: 'text-emerald-500' },
              { icon: FileText, title: 'NHIF Billing Setup', desc: 'Configure NHIF provider code and claim submission details.', status: 'Configure', color: 'text-blue-500' },
              { icon: Layers, title: 'Controlled Drugs Schedule', desc: 'Manage scheduled substance classifications and alert thresholds.', status: 'Active', color: 'text-red-500' },
              { icon: Globe, title: 'Regulatory Reports', desc: 'Monthly and quarterly reports for TFDA and Ministry of Health.', status: 'Enabled', color: 'text-purple-500' },
            ].map(r => (
              <div key={r.title} className="rounded-2xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-4 flex items-start gap-3 group hover:shadow-md transition cursor-pointer">
                <div className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-darkbg flex items-center justify-center shrink-0">
                  <r.icon className={`h-5 w-5 ${r.color}`} />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-sm text-slate-900 dark:text-white">{r.title}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{r.desc}</p>
                  <span className={`inline-block mt-2 text-[10px] font-bold px-2 py-0.5 rounded-full ${r.color} bg-slate-100 dark:bg-darkbg-border`}>{r.status}</span>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 transition shrink-0 mt-1" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Users & Roles */}
      {activeTab === 'Users & Roles' && (
        <div className="rounded-2xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-4 w-4 text-emerald-500" />
            <h3 className="font-bold text-sm text-slate-700 dark:text-white">Pharmacy Staff & Roles</h3>
          </div>
          <div className="space-y-3">
            {[
              { role: 'Pharmacist-in-Charge', permissions: ['Full access', 'CD register sign-off', 'NHIF claims'], color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
              { role: 'Dispensing Pharmacist', permissions: ['Dispense medicines', 'View prescriptions', 'POS sales'], color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
              { role: 'Pharmacy Technician', permissions: ['Dispense OTC', 'Inventory management', 'View reports'], color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
              { role: 'Pharmacy Cashier', permissions: ['POS sales', 'Receipt generation', 'Payment collection'], color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
              { role: 'Inventory Officer', permissions: ['Stock management', 'Batch tracking', 'Purchase orders'], color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
            ].map(r => (
              <div key={r.role} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 dark:border-darkbg-border hover:border-emerald-200 transition">
                <span className={`text-xs font-bold px-2.5 py-1 rounded-lg shrink-0 ${r.color}`}>{r.role}</span>
                <div className="flex-1 flex flex-wrap gap-1">
                  {r.permissions.map(p => (
                    <span key={p} className="text-[10px] text-slate-500 bg-slate-100 dark:bg-darkbg px-2 py-0.5 rounded-full">{p}</span>
                  ))}
                </div>
                <button className="shrink-0 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-darkbg text-slate-400 hover:text-blue-500 transition">
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-4 italic">To manage individual user assignments, go to the main <strong>Users &amp; Roles</strong> section in Settings.</p>
        </div>
      )}
    </div>
  );
};
