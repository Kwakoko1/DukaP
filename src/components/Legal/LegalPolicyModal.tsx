import React, { useState } from 'react';
import { ShieldCheck, FileText, Lock, Copyright, CheckCircle, X, Scale } from 'lucide-react';

export type LegalTab = 'privacy' | 'copyright' | 'terms';

interface LegalPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: LegalTab;
}

export const LegalPolicyModal: React.FC<LegalPolicyModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'privacy'
}) => {
  const [activeTab, setActiveTab] = useState<LegalTab>(initialTab);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-md p-4 sm:p-6 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-darkbg-card border border-slate-200 dark:border-darkbg-border rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 sm:p-6 border-b border-indigo-500/20 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="p-2.5 bg-indigo-600/30 rounded-2xl border border-indigo-400/30 text-indigo-300">
              <Scale className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black tracking-widest uppercase text-indigo-400">Legal & Governance</span>
                <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border border-emerald-500/30">v2026.1 Compliance</span>
              </div>
              <h2 className="text-base sm:text-lg font-extrabold text-white mt-0.5">Kwakoko Business Operating System</h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
            title="Close Legal Window"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 px-6 pt-4 bg-slate-50/80 dark:bg-darkbg/50 border-b border-slate-200 dark:border-darkbg-border overflow-x-auto shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('privacy')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl font-bold text-xs transition border-b-2 ${
              activeTab === 'privacy'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-white dark:bg-darkbg-card border-x border-t border-slate-200 dark:border-darkbg-border'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Lock className="w-4 h-4" />
            <span>Privacy Policy</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('copyright')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl font-bold text-xs transition border-b-2 ${
              activeTab === 'copyright'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-white dark:bg-darkbg-card border-x border-t border-slate-200 dark:border-darkbg-border'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Copyright className="w-4 h-4" />
            <span>Copyright & IP Policy</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('terms')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl font-bold text-xs transition border-b-2 ${
              activeTab === 'terms'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-white dark:bg-darkbg-card border-x border-t border-slate-200 dark:border-darkbg-border'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Terms of Service & SLA</span>
          </button>
        </div>

        {/* Policy Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-slate-700 dark:text-slate-300 text-xs leading-relaxed scrollbar-thin">
          
          {activeTab === 'privacy' && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/50 flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-extrabold text-indigo-950 dark:text-indigo-200 text-xs">Data Privacy & Security Guarantee</h3>
                  <p className="text-[11px] text-indigo-800/80 dark:text-indigo-300 mt-0.5">
                    Kwakoko Business Operating System enforces strict multi-tenant schema isolation, local-first browser sandboxing (Same-Origin Policy), and AES-256 cloud database encryption powered by KwakoPos.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <span>1. Information Collection & Storage Architecture</span>
                </h4>
                <p>
                  Kwakoko collects only essential business operational data required to provide Point of Sale (POS), inventory management, and financial reporting services. All transactional data (sales receipts, inventory ledgers, customer profiles, staff activity) is initially persisted locally inside your browser's IndexedDB storage using client-side sandboxing.
                </p>
                <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-400">
                  <li><strong>Local Persistence:</strong> Data created in KwakoPos resides on your device first, guaranteeing 100% operational availability during network outages.</li>
                  <li><strong>2-Way Delta Sync:</strong> When online, modified entities push to central Neon PostgreSQL server database via TLS 1.3 encrypted HTTPS requests.</li>
                  <li><strong>Zero Data Selling:</strong> Kwakoko never sells, monetizes, or shares business transaction records or customer details with third-party aggregators.</li>
                </ul>
              </div>

              <div className="space-y-3">
                <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">2. Multi-Tenant Data Isolation</h4>
                <p>
                  Every database table in Kwakoko is protected by mandatory tenant scoping (`tenant_id` and `branch_id`). Strict Row-Level Security (RLS) policies prevent unauthorized access across accounts. Devices associated with Tenant A cannot inspect or retrieve records belonging to Tenant B.
                </p>
              </div>

              <div className="space-y-3">
                <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">3. Data Ownership & Export Rights</h4>
                <p>
                  You retain 100% ownership of all business data uploaded or created within Kwakoko. Tenant administrators can export full JSON backups, Excel reports, or CSV ledgers at any time from the Settings & Backup Console.
                </p>
              </div>

              <div className="space-y-3">
                <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">4. Regulatory Compliance & Local Laws</h4>
                <p>
                  Kwakoko complies with the Tanzania Personal Data Protection Act (PDPA) and international privacy frameworks (GDPR). Audit trails record all user mutations to support financial transparency and compliance audits.
                </p>
              </div>

              <div className="space-y-3 p-4 rounded-2xl bg-slate-100 dark:bg-darkbg border border-slate-200 dark:border-darkbg-border">
                <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">5. Technical Support & Compliance Contact</h4>
                <p className="text-xs">
                  For technical assistance, billing inquiries, or legal compliance support, contact our central team at <a href="mailto:info@kwakoko.co.tz" className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline">info@kwakoko.co.tz</a> or access the <strong>Help & Manuals Console</strong> within the application.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'copyright' && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 flex items-start gap-3">
                <Copyright className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-extrabold text-amber-950 dark:text-amber-200 text-xs">Official Intellectual Property Notice</h3>
                  <p className="text-[11px] text-amber-800/80 dark:text-amber-300 mt-0.5">
                    Copyright © 2026 Kwakoko Technical Company. All Rights Reserved. KwakoPos, Kwakoko, and associated interface visual assets are registered intellectual property.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">1. Copyright Ownership</h4>
                <p>
                  The software code, database structure, UI/UX designs, micro-animations, 3D brand logos, icons, and operational documentation comprising <strong>Kwakoko Business Operating System</strong> and <strong>KwakoPos</strong> are protected by copyright laws and international intellectual property treaties.
                </p>
              </div>

              <div className="space-y-3">
                <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">2. Trademarks & Brand Emblems</h4>
                <p>
                  The titles <strong>Kwakoko</strong>, <strong>KwakoPos</strong>, the "Sell Smart. Grow More." tagline, the stylized 3D POS emblem, and the DukaPos heritage assets are trademarks of Kwakoko Technical Company. You may not use these trademarks without prior express written authorization.
                </p>
              </div>

              <div className="space-y-3">
                <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">3. License Restrictions</h4>
                <p>
                  Kwakoko grants licensed tenant businesses a limited, non-exclusive, non-transferable subscription right to use the web application for internal business operations. Users shall not:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-400">
                  <li>Decompile, reverse-engineer, dissemble, or extract source code from the KwakoPos application.</li>
                  <li>Sublicense, re-sell, or rent access to third parties outside authorized user seat licenses.</li>
                  <li>Remove copyright notices, watermark emblems, or legal declarations from receipts or reports.</li>
                </ul>
              </div>

              <div className="space-y-3">
                <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">4. Customer Content Ownership</h4>
                <p>
                  While Kwakoko retains exclusive rights to the platform software, customers retain exclusive ownership of all original trade logos, custom product photos, business descriptions, and customer databases uploaded to their workspace.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'terms' && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-extrabold text-emerald-950 dark:text-emerald-200 text-xs">Terms of Service & Service Level Agreement</h3>
                  <p className="text-[11px] text-emerald-800/80 dark:text-emerald-300 mt-0.5">
                    Kwakoko guarantees high-availability multi-branch performance, role-gated operational controls, and transparent subscription management across all 30 industry verticals.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">1. Service Availability & Offline Resilience</h4>
                <p>
                  Kwakoko targets 99.9% platform availability. Because KwakoPos utilizes a local-first engine, POS registers and inventory lookups remain fully functional even when local internet connectivity is completely lost. Changes sync automatically when internet connectivity resumes.
                </p>
              </div>

              <div className="space-y-3">
                <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">2. User Account Responsibilities & RBAC</h4>
                <p>
                  Tenant administrators are responsible for managing access permissions for their employees. Role boundaries (`Owner`, `Manager`, `Accountant`, `Cashier`) must be maintained to safeguard financial ledgers and prevent internal discrepancies.
                </p>
              </div>

              <div className="space-y-3">
                <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">3. Subscriptions & Renewal Lock Policy</h4>
                <p>
                  Subscriptions renew on a monthly or annual basis depending on your active plan tier (`BASIC`, `GROWTH`, `ENTERPRISE`). If a subscription expires, Kwakoko activates a non-destructive read-only lock: register checkouts are paused until renewal, but your business data remains completely safe and preserved.
                </p>
              </div>

              <div className="space-y-3">
                <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">4. Support & Contact</h4>
                <p>
                  For technical assistance, billing inquiries, or legal compliance support, contact our central team at <span className="font-mono text-indigo-600 dark:text-indigo-400 font-bold">support@kwakopos.com</span> or access the Help & Manuals Console within the application.
                </p>
              </div>
            </div>
          )}

        </div>

        {/* Footer Bar */}
        <div className="bg-slate-50 dark:bg-darkbg border-t border-slate-200 dark:border-darkbg-border p-4 px-6 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-[11px] text-slate-500 font-medium flex items-center gap-2">
            <span>© 2026 Kwakoko Technical Company</span>
            <span>•</span>
            <span className="font-bold text-slate-700 dark:text-slate-300">KwakoPos Engine</span>
          </div>

          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition shadow-sm cursor-pointer"
          >
            I Understand & Agree
          </button>
        </div>

      </div>
    </div>
  );
};
