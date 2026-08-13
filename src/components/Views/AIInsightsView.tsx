import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useModule } from '../../context/ModuleContext';
import {
  aiInsightsEngine,
  type ExecutiveHealthReport,
  type InventoryInsight,
  type ProfitOpportunity,
  type CustomerInsight,
  type CashierPerformance,
  type SecurityFraudFlag,
  type BranchComparison,
  type PredictiveAlert,
  type ForecastDataPoint,
  type CopilotQueryResult
} from '../../services/aiInsightsEngine';
import { Badge, Button } from '../UI/custom-ui';
import {
  Sparkles, Activity, TrendingUp, DollarSign, Package,
  Users, AlertTriangle, Shield, RefreshCw, Search,
  CheckCircle2, Cpu, Zap, Layers, BarChart3,
  Check, Mic
} from 'lucide-react';

interface AIInsightsViewProps {
  initialTab?: 'health' | 'sales' | 'inventory' | 'profit' | 'customers' | 'cashflow' | 'cashiers' | 'branches' | 'forecast' | 'industry';
}

export const AIInsightsView: React.FC<AIInsightsViewProps> = ({ initialTab = 'health' }) => {
  const { currentTenant, currentBranch, user } = useAuth();
  const { activeModule, activeTab: moduleActiveTab } = useModule();

  // Active Main Sub-Tab
  const [activeTab, setActiveTab] = useState<
    'health' | 'sales' | 'inventory' | 'profit' | 'customers' | 'cashflow' | 'cashiers' | 'branches' | 'forecast' | 'industry'
  >(initialTab);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  useEffect(() => {
    if (moduleActiveTab === 'Business Health Score' || moduleActiveTab === 'AI Insights Engine' || moduleActiveTab === 'AI Insights') {
      setActiveTab('health');
    } else if (moduleActiveTab === 'Sales Intelligence') {
      setActiveTab('sales');
    } else if (moduleActiveTab === 'Inventory Intelligence') {
      setActiveTab('inventory');
    } else if (moduleActiveTab === 'Profit & Pricing') {
      setActiveTab('profit');
    } else if (moduleActiveTab === 'Customer CLV') {
      setActiveTab('customers');
    } else if (moduleActiveTab === 'Cash Flow & Burn') {
      setActiveTab('cashflow');
    } else if (moduleActiveTab === 'Fraud & Security') {
      setActiveTab('cashiers');
    } else if (moduleActiveTab === 'Branch Comparison') {
      setActiveTab('branches');
    } else if (moduleActiveTab === 'Demand Forecast') {
      setActiveTab('forecast');
    } else if (moduleActiveTab === 'Vertical Advisory') {
      setActiveTab('industry');
    }
  }, [moduleActiveTab]);

  // Branch Selector Filter
  const [selectedBranchId] = useState<string>('all');

  // Engine States
  const [healthReport, setHealthReport] = useState<ExecutiveHealthReport | null>(null);
  const [salesIntel, setSalesIntel] = useState<any>(null);
  const [inventoryIntel, setInventoryIntel] = useState<InventoryInsight[]>([]);
  const [profitIntel, setProfitIntel] = useState<ProfitOpportunity[]>([]);
  const [customerIntel, setCustomerIntel] = useState<CustomerInsight[]>([]);
  const [cashFlowIntel, setCashFlowIntel] = useState<any>(null);
  const [cashierData, setCashierData] = useState<{ cashiers: CashierPerformance[]; fraudFlags: SecurityFraudFlag[] }>({ cashiers: [], fraudFlags: [] });
  const [branchIntel, setBranchIntel] = useState<BranchComparison[]>([]);
  const [forecastIntel, setForecastIntel] = useState<ForecastDataPoint[]>([]);
  const [predictiveAlerts, setPredictiveAlerts] = useState<PredictiveAlert[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Copilot State
  const [copilotInput, setCopilotInput] = useState<string>('');
  const [copilotResult, setCopilotResult] = useState<CopilotQueryResult | null>(null);
  const [isCopilotSearching, setIsCopilotSearching] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);

  // Load AI Insights Engine Data with tenant fallback
  const loadEngineData = useCallback(async () => {
    const tenantId = currentTenant?.id || user?.tenant_id || 'tenant-dar-hq';
    const branchId = currentBranch?.id || selectedBranchId || 'all';
    setIsLoading(true);

    try {
      const [
        health, sales, inv, profit, cust, cash, cashier, branch, fcast, alerts
      ] = await Promise.all([
        aiInsightsEngine.generateExecutiveHealthReport(tenantId, branchId),
        aiInsightsEngine.generateSalesIntelligence(tenantId, branchId),
        aiInsightsEngine.generateInventoryIntelligence(tenantId),
        aiInsightsEngine.generateProfitOpportunities(tenantId),
        aiInsightsEngine.generateCustomerIntelligence(tenantId),
        aiInsightsEngine.generateCashFlowIntelligence(tenantId),
        aiInsightsEngine.generateCashierFraudIntelligence(tenantId),
        aiInsightsEngine.generateBranchComparison(tenantId),
        aiInsightsEngine.generateMultiHorizonForecast(tenantId),
        aiInsightsEngine.generatePredictiveAlerts(tenantId),
      ]);

      setHealthReport(health);
      setSalesIntel(sales);
      setInventoryIntel(inv);
      setProfitIntel(profit);
      setCustomerIntel(cust);
      setCashFlowIntel(cash);
      setCashierData(cashier);
      setBranchIntel(branch);
      setForecastIntel(fcast);
      setPredictiveAlerts(alerts);
    } catch (err) {
      console.error('[AI Engine Load Error]', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentTenant?.id, user?.tenant_id, currentBranch?.id, selectedBranchId]);

  useEffect(() => {
    void loadEngineData();
  }, [loadEngineData]);

  // Handle Natural Language Copilot Submit
  const handleCopilotSubmit = async (queryText: string) => {
    const tenantId = currentTenant?.id || user?.tenant_id || 'tenant-dar-hq';
    if (!queryText.trim()) return;
    setIsCopilotSearching(true);
    try {
      const res = await aiInsightsEngine.processNaturalLanguageQuery(tenantId, queryText);
      setCopilotResult(res);
    } catch (e) {
      console.error(e);
    } finally {
      setIsCopilotSearching(false);
    }
  };

  const startVoiceInput = () => {
    setIsRecording(true);
    setTimeout(() => {
      setIsRecording(false);
      const voicePrompts = [
        'Why are sales down this week?',
        'Which products made the most profit?',
        'Show slow-moving stock',
        'Compare all branches'
      ];
      const randomP = voicePrompts[Math.floor(Math.random() * voicePrompts.length)];
      setCopilotInput(randomP);
      void handleCopilotSubmit(randomP);
    }, 2000);
  };

  const industryVerticalData = aiInsightsEngine.getIndustryVerticalAdvice(activeModule);

  return (
    <div className="space-y-6 font-sans text-xs pb-10">
      
      {/* ── Top Header Banner ── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 rounded-3xl text-white shadow-xl relative overflow-hidden">
        {/* Glow Effects */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full filter blur-3xl translate-x-1/3 -translate-y-1/3 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-purple-500/15 rounded-full filter blur-3xl -translate-x-1/3 translate-y-1/3 pointer-events-none" />

        <div className="relative z-10 flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 shrink-0">
            <Sparkles className="h-7 w-7 text-amber-300 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-black text-white m-0 tracking-tight">
                DukaPos Autonomous AI Business Advisory Engine
              </h1>
              <Badge variant="warning" className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5">
                {activeModule} Industry Intelligence Active
              </Badge>
            </div>
            <p className="text-xs text-indigo-200/80 m-0 mt-1">
              Continuous multi-source data analytics for tenant <strong className="text-white">{currentTenant?.name || 'Workspace'}</strong> • Branch: {currentBranch?.name || 'All HQ'}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="relative z-10 flex items-center gap-3 flex-wrap">
          <button
            onClick={loadEngineData}
            disabled={isLoading}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs border border-white/20 backdrop-blur-md transition flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            {isLoading ? 'Aggregating...' : 'Refresh AI Analytics'}
          </button>
        </div>
      </div>

      {/* ── Executive Business Health Score Hero Dial ── */}
      {healthReport && (
        <div className="grid gap-6 lg:grid-cols-12">
          
          {/* Health Score Dial Card (Col 4) */}
          <div className="lg:col-span-4 p-6 bg-white dark:bg-darkbg-card rounded-3xl border border-slate-200 dark:border-darkbg-border shadow-xs flex flex-col justify-between items-center text-center relative overflow-hidden">
            <div className="w-full flex items-center justify-between border-b dark:border-darkbg-border/60 pb-3">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">EXECUTIVE HEALTH INDEX</span>
              <Badge variant={healthReport.overallScore >= 80 ? 'success' : healthReport.overallScore >= 60 ? 'warning' : 'danger'} className="text-[10px] font-black uppercase">
                {healthReport.status}
              </Badge>
            </div>

            {/* Circular Gauge Representation */}
            <div className="my-6 relative flex items-center justify-center">
              <div className="h-40 w-40 rounded-full border-8 border-slate-100 dark:border-darkbg/60 flex items-center justify-center relative">
                <div 
                  className={`h-36 w-36 rounded-full flex flex-col items-center justify-center border-4 shadow-inner ${
                    healthReport.overallScore >= 80 
                      ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400' 
                      : healthReport.overallScore >= 60 
                        ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400' 
                        : 'border-red-500 bg-red-50/50 dark:bg-red-950/20 text-red-600 dark:text-red-400'
                  }`}
                >
                  <span className="text-4xl font-black tracking-tight">{healthReport.overallScore}</span>
                  <span className="text-[10px] font-extrabold uppercase text-slate-400">OUT OF 100</span>
                </div>
              </div>
            </div>

            <div className="space-y-1.5 w-full text-left bg-slate-50 dark:bg-darkbg/40 p-3.5 rounded-2xl border border-slate-100 dark:border-darkbg-border">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">AI Key Takeaway</span>
              <p className="text-xs text-slate-700 dark:text-slate-200 font-medium leading-relaxed m-0">
                {healthReport.summary}
              </p>
            </div>
          </div>

          {/* Health Components Breakdown Grid (Col 8) */}
          <div className="lg:col-span-8 p-6 bg-white dark:bg-darkbg-card rounded-3xl border border-slate-200 dark:border-darkbg-border shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b dark:border-darkbg-border/60 pb-3">
              <h3 className="text-sm font-black text-slate-900 dark:text-white m-0 flex items-center gap-2">
                <Activity className="h-4.5 w-4.5 text-indigo-600" />
                Business Health Driver Metrics (8 Sub-Scores)
              </h3>
              <span className="text-[10px] font-bold text-slate-400">Weighted Composite Model</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {healthReport.components.map((comp, idx) => (
                <div key={idx} className="p-3.5 rounded-2xl bg-slate-50/70 dark:bg-darkbg/40 border border-slate-200/80 dark:border-darkbg-border space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 dark:text-white text-xs">{comp.metric}</span>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded ${
                      comp.score >= 80 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400' :
                      comp.score >= 60 ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400' :
                      'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400'
                    }`}>
                      {comp.score}/100 • {comp.status}
                    </span>
                  </div>

                  <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        comp.score >= 80 ? 'bg-emerald-500' : comp.score >= 60 ? 'bg-amber-500' : 'bg-red-500'
                      }`} 
                      style={{ width: `${comp.score}%` }} 
                    />
                  </div>

                  <p className="text-[11px] text-slate-500 dark:text-slate-400 m-0 leading-tight">
                    {comp.insight}
                  </p>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {/* ── Proactive Predictive Alerts Banner ── */}
      {predictiveAlerts.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 animate-bounce" />
              <h3 className="font-black text-sm text-amber-900 dark:text-amber-300 m-0">
                Proactive Predictive Alerts ({predictiveAlerts.length} Active System Advisories)
              </h3>
            </div>
            <span className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-400 tracking-wider">
              Autonomous Risk Monitoring
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {predictiveAlerts.map(alt => (
              <div key={alt.id} className="p-3.5 rounded-xl bg-white dark:bg-darkbg-card border border-amber-200/80 dark:border-amber-900/30 space-y-2 shadow-xs">
                <div className="flex items-center justify-between">
                  <Badge variant={alt.urgency === 'Critical' ? 'danger' : 'warning'}>{alt.urgency}</Badge>
                  <span className="text-[10px] font-mono text-slate-400">{alt.type}</span>
                </div>
                <h4 className="font-bold text-slate-800 dark:text-white text-xs m-0">{alt.title}</h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug m-0">{alt.description}</p>
                <button
                  onClick={() => alert(`Redirecting to action handler: ${alt.suggestedAction}`)}
                  className="w-full text-center py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold text-[11px] transition cursor-pointer mt-1"
                >
                  {alt.suggestedAction} →
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Interactive Natural Language AI Copilot Bar ── */}
      <div className="p-5 bg-white dark:bg-darkbg-card rounded-3xl border border-slate-200 dark:border-darkbg-border shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b dark:border-darkbg-border/60 pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-indigo-600" />
            <h3 className="text-sm font-black text-slate-900 dark:text-white m-0">
              Natural Language AI Copilot &amp; Analytics Query Interface
            </h3>
          </div>
          <span className="text-[10px] text-slate-400 font-bold">Ask anything in plain language</span>
        </div>

        {/* Input Bar */}
        <div className="flex items-center gap-2">
          <button
            onClick={startVoiceInput}
            className={`p-3 rounded-xl border transition cursor-pointer ${
              isRecording ? 'bg-red-500 text-white border-red-500 animate-pulse' : 'bg-slate-50 dark:bg-darkbg text-slate-500 border-slate-200 dark:border-darkbg-border'
            }`}
            title="Voice Assistant Input"
          >
            <Mic className="h-4.5 w-4.5" />
          </button>
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-3 h-4.5 w-4.5 text-slate-400" />
            <input
              type="text"
              placeholder={isRecording ? 'Listening to voice command...' : 'Ask e.g. "Why are sales down this week?", "Which products made most profit?", "Forecast next month"...'}
              value={copilotInput}
              onChange={e => setCopilotInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCopilotSubmit(copilotInput)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-darkbg border border-slate-200 dark:border-darkbg-border rounded-xl text-xs text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
          <Button
            onClick={() => handleCopilotSubmit(copilotInput)}
            disabled={isCopilotSearching}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2.5 rounded-xl shadow-xs"
          >
            {isCopilotSearching ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Ask AI'}
          </Button>
        </div>

        {/* Preset Prompt Chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {[
            'Why are sales down this week?',
            'Which products made the most profit?',
            'Show slow-moving stock',
            'Compare all branches',
            'Forecast next month revenue',
            'How can I increase profit?'
          ].map((promptText, idx) => (
            <button
              key={idx}
              onClick={() => {
                setCopilotInput(promptText);
                void handleCopilotSubmit(promptText);
              }}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-indigo-50 dark:bg-darkbg dark:hover:bg-indigo-950/40 border border-slate-200 dark:border-darkbg-border text-[11px] font-semibold text-slate-700 dark:text-slate-300 hover:text-indigo-600 transition shrink-0 cursor-pointer"
            >
              💡 {promptText}
            </button>
          ))}
        </div>

        {/* Copilot Search Result Output Box */}
        {copilotResult && (
          <div className="p-4 rounded-2xl bg-indigo-950 text-white space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b border-indigo-800/80 pb-2">
              <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider">Query Intent: {copilotResult.intent}</span>
              <button onClick={() => setCopilotResult(null)} className="text-xs text-indigo-400 hover:text-white font-bold">Close ✕</button>
            </div>

            <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-indigo-100 m-0">
              {copilotResult.textResponse}
            </pre>

            {/* Simple Dynamic Chart Display */}
            {copilotResult.chartData && (
              <div className="p-3 bg-indigo-900/60 rounded-xl border border-indigo-800/60 space-y-2">
                <span className="text-[10px] font-bold text-indigo-300 uppercase block">Analytics Visualization</span>
                <div className="space-y-1.5">
                  {copilotResult.chartData.map((cd, i) => (
                    <div key={i} className="flex items-center text-xs">
                      <span className="w-28 text-indigo-200 truncate">{cd.name}</span>
                      <div className="flex-1 h-3 bg-indigo-950 rounded-full overflow-hidden mx-2">
                        <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${Math.min(100, (cd.value / 2500000) * 100)}%` }} />
                      </div>
                      <span className="font-mono font-bold text-white">Tsh. {cd.value.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Recommendations */}
            {copilotResult.recommendations && (
              <div className="space-y-1.5 pt-1">
                <span className="text-[10px] font-bold uppercase text-amber-400 block">Recommended Action Steps:</span>
                {copilotResult.recommendations.map((rec, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-indigo-200">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{rec}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Sub-Tab Navigation Bar ── */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-200 dark:border-darkbg-border scrollbar-none">
        {[
          { id: 'health', label: '📊 Health Index', icon: Activity },
          { id: 'sales', label: '📈 Sales Intelligence', icon: TrendingUp },
          { id: 'inventory', label: '📦 Inventory Turn', icon: Package },
          { id: 'profit', label: '💰 Profit & Pricing', icon: DollarSign },
          { id: 'customers', label: '👥 Customer CLV', icon: Users },
          { id: 'cashflow', label: '💵 Cash Flow & Burn', icon: Zap },
          { id: 'cashiers', label: '👷 Cashiers & Security', icon: Shield },
          { id: 'branches', label: '🏬 Multi-Branch', icon: Layers },
          { id: 'forecast', label: '🔮 Demand Forecast', icon: BarChart3 },
          { id: 'industry', label: '🏢 Vertical Advisory', icon: Cpu },
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 border transition shrink-0 cursor-pointer ${
                isActive
                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                  : 'bg-white dark:bg-darkbg-card border-slate-200 dark:border-darkbg-border text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-darkbg'
              }`}
            >
              <Icon size={14} /> {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── TAB 1: EXECUTIVE HEALTH ── */}
      {activeTab === 'health' && healthReport && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="p-5 bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border space-y-3">
            <h3 className="text-sm font-black text-slate-900 dark:text-white m-0">Executive Summary &amp; Key Findings</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {healthReport.keyTakeaways.map((kt, i) => (
                <div key={i} className="p-3.5 rounded-xl bg-slate-50 dark:bg-darkbg/40 border border-slate-200 dark:border-darkbg-border flex items-start gap-2.5">
                  <CheckCircle2 className="h-4.5 w-4.5 text-indigo-600 shrink-0 mt-0.5" />
                  <span className="text-xs text-slate-700 dark:text-slate-300 font-medium leading-relaxed">{kt}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: SALES INTELLIGENCE ── */}
      {activeTab === 'sales' && salesIntel && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="p-4 bg-white dark:bg-darkbg-card rounded-2xl border dark:border-darkbg-border shadow-xs">
              <span className="text-[10px] uppercase font-bold text-slate-400">Today Revenue</span>
              <div className="text-base font-black text-slate-800 dark:text-white mt-1">
                Tsh. {salesIntel.todayRevenue.toLocaleString()}
              </div>
              <span className={`text-[11px] font-bold ${salesIntel.dayChangePercent >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {salesIntel.dayChangePercent >= 0 ? '▲ +' : '▼ '}{salesIntel.dayChangePercent.toFixed(1)}% vs Yesterday
              </span>
            </div>

            <div className="p-4 bg-white dark:bg-darkbg-card rounded-2xl border dark:border-darkbg-border shadow-xs">
              <span className="text-[10px] uppercase font-bold text-slate-400">Peak Sales Hour</span>
              <div className="text-base font-black text-indigo-600 dark:text-indigo-400 mt-1">
                {salesIntel.peakHourFormatted}
              </div>
              <span className="text-[11px] text-slate-500 font-medium">Highest foot traffic window</span>
            </div>

            <div className="p-4 bg-white dark:bg-darkbg-card rounded-2xl border dark:border-darkbg-border shadow-xs">
              <span className="text-[10px] uppercase font-bold text-slate-400">Best Sales Weekday</span>
              <div className="text-base font-black text-emerald-600 dark:text-emerald-400 mt-1">
                {salesIntel.bestDay}
              </div>
              <span className="text-[11px] text-slate-500 font-medium">Highest volume peak</span>
            </div>

            <div className="p-4 bg-white dark:bg-darkbg-card rounded-2xl border dark:border-darkbg-border shadow-xs">
              <span className="text-[10px] uppercase font-bold text-slate-400">Average Basket Spend</span>
              <div className="text-base font-black text-purple-600 dark:text-purple-400 mt-1">
                Tsh. {salesIntel.averageBasketSize.toLocaleString()}
              </div>
              <span className="text-[11px] text-slate-500 font-medium">Per checkout invoice</span>
            </div>
          </div>

          <div className="p-5 bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border space-y-3">
            <h3 className="text-sm font-black text-slate-900 dark:text-white m-0">AI Midweek Sales Takeaway</h3>
            <p className="text-xs text-indigo-600 dark:text-indigo-400 font-bold m-0">{salesIntel.aiRecommendation}</p>
          </div>
        </div>
      )}

      {/* ── TAB 3: INVENTORY INTELLIGENCE ── */}
      {activeTab === 'inventory' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="p-5 bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-xs space-y-4">
            <h3 className="text-sm font-black text-slate-900 dark:text-white m-0">
              Autonomous Inventory Velocity &amp; Reorder Diagnostics
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-darkbg-border/30 bg-slate-50/70 dark:bg-darkbg/20 text-[10px] font-bold uppercase text-slate-400">
                    <th className="p-3 pl-4">Item Name &amp; SKU</th>
                    <th className="p-3">Current Stock</th>
                    <th className="p-3">Daily Velocity</th>
                    <th className="p-3">Days Remaining</th>
                    <th className="p-3">Recommended Stock</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 pr-4">AI Actionable Recommendation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border/20">
                  {inventoryIntel.map(inv => (
                    <tr key={inv.id} className="hover:bg-slate-50/50 dark:hover:bg-darkbg/50">
                      <td className="p-3 pl-4 font-bold text-slate-800 dark:text-slate-100">
                        {inv.name}
                        <div className="text-[10px] font-mono text-slate-400 font-normal">{inv.sku}</div>
                      </td>
                      <td className="p-3 font-mono font-bold text-slate-800 dark:text-slate-200">{inv.currentStock} units</td>
                      <td className="p-3 text-slate-500 font-medium">{inv.dailyVelocity.toFixed(1)} / day</td>
                      <td className="p-3 font-mono font-bold text-slate-700 dark:text-slate-300">{inv.daysRemaining} days</td>
                      <td className="p-3 font-mono text-indigo-600 font-bold">{inv.recommendedStock} units</td>
                      <td className="p-3">
                        <Badge variant={inv.status === 'Understock' ? 'danger' : inv.status === 'Overstock' ? 'warning' : 'success'}>
                          {inv.status}
                        </Badge>
                      </td>
                      <td className="p-3 pr-4 text-slate-600 dark:text-slate-300 text-[11px] leading-relaxed">
                        {inv.actionableRecommendation}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 4: PROFIT & PRICING OPTIMIZATION ── */}
      {activeTab === 'profit' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="p-5 bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-xs space-y-4">
            <h3 className="text-sm font-black text-slate-900 dark:text-white m-0">
              Profit Intelligence &amp; Price Increase Opportunities
            </h3>

            <div className="grid gap-4 sm:grid-cols-2">
              {profitIntel.map(po => (
                <div key={po.productId} className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-slate-800 dark:text-white text-xs m-0">{po.productName}</h4>
                    <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-950 px-2 py-0.5 rounded">
                      Margin: {po.currentMarginPercent}%
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-500">Current Price: Tsh. {po.currentPrice.toLocaleString()}</span>
                    <span className="font-bold text-emerald-600">Suggested: Tsh. {po.suggestedPrice.toLocaleString()}</span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-emerald-100/60 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-bold text-xs">
                    Estimated Monthly Gain: +Tsh. {po.estimatedMonthlyGainTZS.toLocaleString()}
                  </div>

                  <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed m-0">
                    {po.rationale}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 5: CUSTOMER INTELLIGENCE ── */}
      {activeTab === 'customers' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="p-5 bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-xs space-y-4">
            <h3 className="text-sm font-black text-slate-900 dark:text-white m-0">
              Customer Lifetime Value (CLV) &amp; Churn Prevention
            </h3>

            <div className="grid gap-3 sm:grid-cols-3">
              {customerIntel.map(c => (
                <div key={c.customerId} className="p-4 rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50/50 dark:bg-darkbg/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 dark:text-white text-xs">{c.name}</span>
                    <Badge variant={c.category === 'VIP' ? 'success' : c.category === 'At-Risk / Lost' ? 'danger' : 'info'}>
                      {c.category}
                    </Badge>
                  </div>

                  <div className="text-[11px] text-slate-500 space-y-0.5">
                    <div>Total Spent: <strong className="text-slate-800 dark:text-slate-200 font-mono">Tsh. {c.totalSpent.toLocaleString()}</strong></div>
                    <div>Last Purchase: <strong className="text-slate-700 dark:text-slate-300">{c.lastPurchaseDaysAgo} days ago</strong></div>
                  </div>

                  <p className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium m-0 pt-1">
                    {c.recommendedAction}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 6: CASH FLOW & EXPENSES ── */}
      {activeTab === 'cashflow' && cashFlowIntel && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="p-4 bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-xs">
              <span className="text-[10px] uppercase font-bold text-slate-400">Current Cash Reserves</span>
              <div className="text-base font-black text-emerald-600 dark:text-emerald-400 mt-1">
                Tsh. {cashFlowIntel.currentCashBalance.toLocaleString()}
              </div>
            </div>

            <div className="p-4 bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-xs">
              <span className="text-[10px] uppercase font-bold text-slate-400">Daily Cash Burn Rate</span>
              <div className="text-base font-black text-amber-600 dark:text-amber-400 mt-1">
                Tsh. {cashFlowIntel.dailyBurnRate.toLocaleString()} / day
              </div>
            </div>

            <div className="p-4 bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-xs">
              <span className="text-[10px] uppercase font-bold text-slate-400">Cash Depletion Horizon</span>
              <div className="text-base font-black text-purple-600 dark:text-purple-400 mt-1">
                {cashFlowIntel.daysUntilDepletion > 100 ? 'Stable Liquidity' : `${cashFlowIntel.daysUntilDepletion} Days Remaining`}
              </div>
            </div>
          </div>

          <div className="p-5 bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border space-y-3">
            <h3 className="text-sm font-black text-slate-900 dark:text-white m-0">Cash Flow Predictive Advisory</h3>
            <p className="text-xs text-slate-700 dark:text-slate-300 font-medium m-0">{cashFlowIntel.alertMessage}</p>
          </div>
        </div>
      )}

      {/* ── TAB 7: CASHIER PERFORMANCE & FRAUD SECURITY ── */}
      {activeTab === 'cashiers' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          
          {/* Fraud Security Flags */}
          {cashierData.fraudFlags.length > 0 && (
            <div className="p-5 bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border space-y-3">
              <h3 className="text-sm font-black text-slate-900 dark:text-white m-0 flex items-center gap-2">
                <Shield className="h-4.5 w-4.5 text-red-600" />
                Fraud &amp; Anomaly Detection Log
              </h3>
              <div className="space-y-2">
                {cashierData.fraudFlags.map(f => (
                  <div key={f.id} className="p-3 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 flex items-start gap-3">
                    <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-red-900 dark:text-red-300">{f.type}</span>
                        <span className="text-[10px] text-slate-400 font-mono">Cashier: {f.cashierName}</span>
                      </div>
                      <p className="text-xs text-red-800 dark:text-red-400 m-0 mt-0.5 leading-snug">{f.details}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cashier Performance Table */}
          <div className="p-5 bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-xs space-y-4">
            <h3 className="text-sm font-black text-slate-900 dark:text-white m-0">
              Cashier Performance &amp; Register Audit Metrics
            </h3>

            <div className="grid gap-3 sm:grid-cols-2">
              {cashierData.cashiers.map(c => (
                <div key={c.cashierId} className="p-4 rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50/50 dark:bg-darkbg/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 dark:text-white text-xs">{c.cashierName}</span>
                    <Badge variant={c.efficiencyRating === 'Star Performer' ? 'success' : c.efficiencyRating === 'Requires Audit' ? 'danger' : 'info'}>
                      {c.efficiencyRating}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-500 font-mono">
                    <div>Sales: <strong className="text-slate-800 dark:text-slate-200">Tsh. {c.totalSales.toLocaleString()}</strong></div>
                    <div>Avg Basket: <strong className="text-slate-800 dark:text-slate-200">Tsh. {c.avgBasketValue.toLocaleString()}</strong></div>
                    <div>Refunds: <strong className="text-slate-800 dark:text-slate-200">{c.refundCount}</strong></div>
                    <div>Voids: <strong className="text-slate-800 dark:text-slate-200">{c.voidCount}</strong></div>
                  </div>

                  <p className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium m-0 pt-1">
                    {c.recommendation}
                  </p>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {/* ── TAB 8: MULTI-BRANCH BENCHMARKING ── */}
      {activeTab === 'branches' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="p-5 bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-xs space-y-4">
            <h3 className="text-sm font-black text-slate-900 dark:text-white m-0">
              Multi-Branch Cross-Benchmarking &amp; Growth Analysis
            </h3>

            <div className="space-y-3">
              {branchIntel.map(b => (
                <div key={b.branchId} className="p-4 rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50/50 dark:bg-darkbg/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="h-6 w-6 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-[10px]">
                        #{b.performanceRank}
                      </span>
                      <h4 className="font-bold text-slate-800 dark:text-white text-xs m-0">{b.branchName}</h4>
                    </div>
                    <Badge variant="success">+{b.growthPercent}% Growth</Badge>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-[11px] font-mono">
                    <div>Revenue: <strong className="text-slate-800 dark:text-slate-200">Tsh. {b.revenue.toLocaleString()}</strong></div>
                    <div>Profit: <strong className="text-emerald-600">Tsh. {b.profit.toLocaleString()}</strong></div>
                    <div>Customers: <strong className="text-purple-600">{b.customerCount}</strong></div>
                  </div>

                  <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed m-0 pt-1">
                    {b.primaryDriver}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 9: FORECASTING ── */}
      {activeTab === 'forecast' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="p-5 bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-xs space-y-4">
            <h3 className="text-sm font-black text-slate-900 dark:text-white m-0">
              Machine Learning Revenue, Profit &amp; Demand Forecast
            </h3>

            <div className="grid gap-4 sm:grid-cols-4">
              {forecastIntel.map(f => (
                <div key={f.period} className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900/40 space-y-2">
                  <span className="text-[10px] uppercase font-bold text-indigo-600 dark:text-indigo-400">{f.period} Horizon</span>
                  <div className="text-base font-black text-slate-800 dark:text-white font-mono">
                    Tsh. {f.projectedRevenue.toLocaleString()}
                  </div>
                  <div className="text-[11px] font-bold text-emerald-600">
                    Net Profit: Tsh. {f.projectedProfit.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 10: INDUSTRY VERTICAL ADVISORY ── */}
      {activeTab === 'industry' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="p-6 bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-950 text-white rounded-3xl space-y-4 shadow-xl">
            <div className="flex items-center gap-2">
              <Cpu className="h-6 w-6 text-amber-400 animate-bounce" />
              <h3 className="text-base font-black text-white m-0">{industryVerticalData.title}</h3>
            </div>

            <p className="text-xs text-indigo-200 leading-relaxed font-sans m-0">
              {industryVerticalData.advice}
            </p>

            <div className="grid gap-2 sm:grid-cols-2 pt-2">
              {industryVerticalData.metrics.map((m, i) => (
                <div key={i} className="p-3 rounded-xl bg-indigo-900/60 border border-indigo-800/60 text-xs font-bold text-indigo-100 flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-400" />
                  <span>{m}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
