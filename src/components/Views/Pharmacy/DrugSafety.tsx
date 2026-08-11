import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../db/dexie';
import type { DrugInteraction } from '../../../db/dexie';
import { useAuth } from '../../../context/AuthContext';
import {
  Shield, AlertTriangle, Plus, X, CheckCircle,
  Zap, Baby, User, Activity, Info
} from 'lucide-react';

type SeverityLevel = 'Mild' | 'Moderate' | 'Severe' | 'Contraindicated';

function severityColor(s: SeverityLevel) {
  switch (s) {
    case 'Mild':            return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    case 'Moderate':        return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    case 'Severe':          return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    case 'Contraindicated': return 'bg-red-500/20 text-red-400 border-red-500/30';
  }
}

const KNOWN_INTERACTIONS: Omit<DrugInteraction, 'id' | 'tenant_id'>[] = [
  { drug_a_name: 'Warfarin', drug_b_name: 'Aspirin', severity: 'Severe', description: 'Increased risk of bleeding when warfarin and aspirin are combined.', clinical_effect: 'Hemorrhage', management: 'Avoid combination. Use paracetamol if analgesic needed.', drug_a_id: '', drug_b_id: '', created_at: 0 },
  { drug_a_name: 'Metformin', drug_b_name: 'Contrast Dye', severity: 'Severe', description: 'Risk of lactic acidosis.', clinical_effect: 'Lactic acidosis', management: 'Withhold metformin 48h before and after IV contrast.', drug_a_id: '', drug_b_id: '', created_at: 0 },
  { drug_a_name: 'Simvastatin', drug_b_name: 'Erythromycin', severity: 'Severe', description: 'CYP3A4 inhibition increases simvastatin levels.', clinical_effect: 'Myopathy / Rhabdomyolysis', management: 'Use azithromycin or reduce statin dose.', drug_a_id: '', drug_b_id: '', created_at: 0 },
  { drug_a_name: 'Fluoxetine', drug_b_name: 'Tramadol', severity: 'Moderate', description: 'Serotonin syndrome risk.', clinical_effect: 'Agitation, tremors, hyperthermia', management: 'Monitor closely; prefer alternative analgesic.', drug_a_id: '', drug_b_id: '', created_at: 0 },
  { drug_a_name: 'Ciprofloxacin', drug_b_name: 'Antacids', severity: 'Moderate', description: 'Reduced ciprofloxacin absorption.', clinical_effect: 'Treatment failure', management: 'Separate doses by at least 2 hours.', drug_a_id: '', drug_b_id: '', created_at: 0 },
  { drug_a_name: 'ACE Inhibitor', drug_b_name: 'Potassium Supplement', severity: 'Moderate', description: 'Hyperkalemia risk.', clinical_effect: 'Cardiac arrhythmia', management: 'Monitor serum potassium closely.', drug_a_id: '', drug_b_id: '', created_at: 0 },
  { drug_a_name: 'Methotrexate', drug_b_name: 'NSAIDs', severity: 'Contraindicated', description: 'NSAIDs reduce methotrexate clearance.', clinical_effect: 'Severe methotrexate toxicity', management: 'Avoid combination. Use paracetamol.', drug_a_id: '', drug_b_id: '', created_at: 0 },
  { drug_a_name: 'MAO Inhibitor', drug_b_name: 'Tyramine Foods', severity: 'Contraindicated', description: 'Hypertensive crisis.', clinical_effect: 'Severe hypertension', management: 'Strict dietary restriction required.', drug_a_id: '', drug_b_id: '', created_at: 0 },
];

export const DrugSafety: React.FC = () => {
  const { user } = useAuth();
  const tenantId = user?.tenant_id || '';

  const [drugs, setDrugs]       = useState<string[]>(['', '']);
  const [patientAllergies, setAllergies] = useState('');
  const [isPregnant, setPregnant] = useState(false);
  const [isChild, setIsChild]   = useState(false);
  const [isElderly, setElderly] = useState(false);

  const [showAddInteraction, setShowAdd] = useState(false);
  const [newInt, setNewInt] = useState({
    drug_a_name: '', drug_b_name: '',
    severity: 'Moderate' as SeverityLevel,
    description: '', clinical_effect: '', management: '',
  });

  const savedInteractions = useLiveQuery(() =>
    db.drugInteractions.where('tenant_id').equals(tenantId).toArray(),
    [tenantId], []
  );

  // Check for interactions among entered drug names
  const detectedInteractions = useMemo(() => {
    const entered = drugs.filter(d => d.trim().length > 0).map(d => d.toLowerCase().trim());
    if (entered.length < 2) return [];
    const results: typeof KNOWN_INTERACTIONS = [];
    const allInteractions = [...KNOWN_INTERACTIONS, ...(savedInteractions || [])];
    for (const interaction of allInteractions) {
      const a = (interaction.drug_a_name || '').toLowerCase();
      const b = (interaction.drug_b_name || '').toLowerCase();
      for (let i = 0; i < entered.length; i++) {
        for (let j = i + 1; j < entered.length; j++) {
          const d1 = entered[i];
          const d2 = entered[j];
          if ((d1.includes(a) || a.includes(d1)) && (d2.includes(b) || b.includes(d2))) results.push(interaction);
          else if ((d1.includes(b) || b.includes(d1)) && (d2.includes(a) || a.includes(d2))) results.push(interaction);
        }
      }
    }
    return results;
  }, [drugs, savedInteractions]);

  // Allergy check
  const allergyAlerts = useMemo(() => {
    const allergyList = patientAllergies.split(',').map(a => a.trim().toLowerCase()).filter(Boolean);
    return drugs.filter(d => d.trim() && allergyList.some(a => d.toLowerCase().includes(a) || a.includes(d.toLowerCase())));
  }, [drugs, patientAllergies]);

  const handleAddInteraction = async () => {
    if (!newInt.drug_a_name || !newInt.drug_b_name) return;
    await db.drugInteractions.add({
      id: `di-${Date.now()}`,
      tenant_id: tenantId,
      drug_a_id: '', drug_b_id: '',
      drug_a_name: newInt.drug_a_name,
      drug_b_name: newInt.drug_b_name,
      severity: newInt.severity,
      description: newInt.description,
      clinical_effect: newInt.clinical_effect || undefined,
      management: newInt.management || undefined,
      created_at: Date.now(),
    });
    setShowAdd(false);
    setNewInt({ drug_a_name: '', drug_b_name: '', severity: 'Moderate', description: '', clinical_effect: '', management: '' });
  };

  const safetyStatus = detectedInteractions.length > 0 || allergyAlerts.length > 0 ? 'ALERT' : drugs.some(d => d.trim()) ? 'SAFE' : 'IDLE';

  const inp = 'w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-emerald-500';
  const lbl = 'block text-xs text-slate-400 mb-1 font-medium';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Shield className="h-5 w-5 text-violet-400" /> Clinical Drug Safety Engine
          </h2>
          <p className="text-slate-500 text-sm mt-0.5">Drug interaction checker · Allergy screening · Patient risk flags</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-sm font-semibold flex items-center gap-2">
          <Plus className="h-4 w-4" /> Add Interaction Rule
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Drug Interaction Checker */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
          <h3 className="text-slate-200 font-semibold flex items-center gap-2">
            <Zap className="h-4 w-4 text-yellow-400" /> Drug Interaction Checker
          </h3>

          {/* Drug inputs */}
          <div className="space-y-2">
            {drugs.map((d, i) => (
              <div key={i} className="flex gap-2 items-center">
                <div className="relative flex-1">
                  <Zap className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                  <input value={d} onChange={e => setDrugs(prev => prev.map((x, idx) => idx === i ? e.target.value : x))}
                    placeholder={`Drug ${i + 1} name…`}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-violet-500" />
                </div>
                {drugs.length > 2 && (
                  <button onClick={() => setDrugs(prev => prev.filter((_, idx) => idx !== i))}
                    className="p-2 text-slate-500 hover:text-red-400"><X className="h-4 w-4" /></button>
                )}
              </div>
            ))}
            <button onClick={() => setDrugs(prev => [...prev, ''])}
              className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1 mt-1">
              <Plus className="h-3 w-3" /> Add another drug
            </button>
          </div>

          {/* Patient Flags */}
          <div className="space-y-3 pt-2 border-t border-slate-800">
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Patient Risk Flags</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Pregnant', icon: User, active: isPregnant, toggle: () => setPregnant(p => !p) },
                { label: 'Child (< 12)', icon: Baby, active: isChild, toggle: () => setIsChild(p => !p) },
                { label: 'Elderly (> 65)', icon: Activity, active: isElderly, toggle: () => setElderly(p => !p) },
              ].map(({ label, icon: Icon, active, toggle }) => (
                <button key={label} onClick={toggle}
                  className={`flex flex-col items-center gap-1 p-3 rounded-xl border text-xs font-semibold transition-colors ${
                    active ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' : 'bg-slate-800 border-slate-700 text-slate-500 hover:border-slate-600'
                  }`}>
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
            </div>
            <div>
              <label className={lbl}>Patient Known Allergies (comma-separated)</label>
              <input value={patientAllergies} onChange={e => setAllergies(e.target.value)}
                className={inp} placeholder="e.g. Penicillin, Sulfa, Aspirin" />
            </div>
          </div>

          {/* Safety Status */}
          <div className={`p-4 rounded-2xl border flex items-center gap-3 ${
            safetyStatus === 'ALERT' ? 'bg-red-500/10 border-red-500/30' :
            safetyStatus === 'SAFE' ? 'bg-emerald-500/10 border-emerald-500/30' :
            'bg-slate-800 border-slate-700'
          }`}>
            {safetyStatus === 'ALERT' && <AlertTriangle className="h-6 w-6 text-red-400 shrink-0" />}
            {safetyStatus === 'SAFE'  && <CheckCircle className="h-6 w-6 text-emerald-400 shrink-0" />}
            {safetyStatus === 'IDLE'  && <Shield className="h-6 w-6 text-slate-500 shrink-0" />}
            <div>
              <p className={`font-bold text-sm ${safetyStatus === 'ALERT' ? 'text-red-400' : safetyStatus === 'SAFE' ? 'text-emerald-400' : 'text-slate-500'}`}>
                {safetyStatus === 'ALERT' ? `${detectedInteractions.length + allergyAlerts.length} Alerts Detected` :
                 safetyStatus === 'SAFE' ? 'No Known Interactions Found' : 'Enter 2+ drugs to check'}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {safetyStatus === 'ALERT' ? 'Review alerts before dispensing' : safetyStatus === 'SAFE' ? 'Always verify with clinical judgment' : 'Drug safety engine ready'}
              </p>
            </div>
          </div>
        </div>

        {/* Alerts Panel */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
          <h3 className="text-slate-200 font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-400" /> Detected Alerts
          </h3>

          {/* Allergy Alerts */}
          {allergyAlerts.map(drug => (
            <div key={drug} className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
              <p className="text-red-400 font-bold text-xs flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> ALLERGY ALERT</p>
              <p className="text-red-300 text-xs mt-1">
                <strong>{drug}</strong> matches a known patient allergy. Do NOT dispense without physician override.
              </p>
            </div>
          ))}

          {/* Patient Risk Flags */}
          {isPregnant && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
              <p className="text-amber-400 font-bold text-xs">🤰 PREGNANCY FLAG</p>
              <p className="text-amber-300 text-xs mt-1">Verify all drugs are pregnancy category A or B. Avoid category D/X.</p>
            </div>
          )}
          {isChild && (
            <div className="p-3 bg-sky-500/10 border border-sky-500/30 rounded-xl">
              <p className="text-sky-400 font-bold text-xs">👶 PEDIATRIC FLAG</p>
              <p className="text-sky-300 text-xs mt-1">Confirm weight-based dosing. Avoid adult formulations without adjustment.</p>
            </div>
          )}
          {isElderly && (
            <div className="p-3 bg-violet-500/10 border border-violet-500/30 rounded-xl">
              <p className="text-violet-400 font-bold text-xs">👴 ELDERLY FLAG</p>
              <p className="text-violet-300 text-xs mt-1">Consider Beers Criteria. Reduce doses for renally-cleared drugs.</p>
            </div>
          )}

          {/* Drug Interactions */}
          {detectedInteractions.length === 0 && allergyAlerts.length === 0 && !isPregnant && !isChild && !isElderly ? (
            <div className="text-center py-8 text-slate-500">
              <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No alerts — enter drugs to check</p>
            </div>
          ) : detectedInteractions.map((int, i) => (
            <div key={i} className={`p-3 rounded-xl border ${severityColor(int.severity as SeverityLevel)}`}>
              <div className="flex items-center justify-between mb-1">
                <p className="font-bold text-xs">{int.severity.toUpperCase()} INTERACTION</p>
                <span className="text-[10px] opacity-70">{int.drug_a_name} ↔ {int.drug_b_name}</span>
              </div>
              <p className="text-xs mt-1">{int.description}</p>
              {int.clinical_effect && <p className="text-[10px] opacity-80 mt-1">Effect: {int.clinical_effect}</p>}
              {int.management && <p className="text-[10px] font-semibold mt-1 opacity-90">⚕ {int.management}</p>}
            </div>
          ))}
        </div>
      </div>

      {/* Saved Interaction Rules Table */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-slate-200 font-semibold">Custom Interaction Rules</h3>
          <span className="text-xs text-slate-500">{(savedInteractions || []).length} saved rules</span>
        </div>
        {(savedInteractions || []).length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-sm">
            <Info className="h-6 w-6 mx-auto mb-2 opacity-30" />
            No custom rules yet. Using {KNOWN_INTERACTIONS.length} built-in interaction rules.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                {['Drug A', 'Drug B', 'Severity', 'Description', 'Management'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(savedInteractions || []).map(r => (
                <tr key={r.id} className="border-b border-slate-800/50">
                  <td className="px-4 py-3 text-slate-200 font-medium">{r.drug_a_name}</td>
                  <td className="px-4 py-3 text-slate-200 font-medium">{r.drug_b_name}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${severityColor(r.severity as SeverityLevel)}`}>{r.severity}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs max-w-xs truncate">{r.description}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs max-w-xs truncate">{r.management || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Interaction Modal */}
      {showAddInteraction && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h3 className="text-slate-100 font-semibold">Add Custom Interaction Rule</h3>
              <button onClick={() => setShowAdd(false)} className="text-slate-500 hover:text-slate-300"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className={lbl}>Drug A *</label><input value={newInt.drug_a_name} onChange={e => setNewInt(f => ({ ...f, drug_a_name: e.target.value }))} className={inp} /></div>
                <div><label className={lbl}>Drug B *</label><input value={newInt.drug_b_name} onChange={e => setNewInt(f => ({ ...f, drug_b_name: e.target.value }))} className={inp} /></div>
              </div>
              <div>
                <label className={lbl}>Severity *</label>
                <select value={newInt.severity} onChange={e => setNewInt(f => ({ ...f, severity: e.target.value as SeverityLevel }))} className={inp}>
                  <option>Mild</option><option>Moderate</option><option>Severe</option><option>Contraindicated</option>
                </select>
              </div>
              <div><label className={lbl}>Description *</label><textarea value={newInt.description} onChange={e => setNewInt(f => ({ ...f, description: e.target.value }))} className={`${inp} resize-none`} rows={2} /></div>
              <div><label className={lbl}>Clinical Effect</label><input value={newInt.clinical_effect} onChange={e => setNewInt(f => ({ ...f, clinical_effect: e.target.value }))} className={inp} /></div>
              <div><label className={lbl}>Management</label><input value={newInt.management} onChange={e => setNewInt(f => ({ ...f, management: e.target.value }))} className={inp} /></div>
              <div className="flex gap-3">
                <button onClick={handleAddInteraction} className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl font-semibold text-sm">Save Rule</button>
                <button onClick={() => setShowAdd(false)} className="flex-1 py-2.5 bg-slate-800 text-slate-300 rounded-xl font-semibold text-sm">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
