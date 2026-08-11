import React, { useState } from 'react';
import { useModule } from '../../../context/ModuleContext';
import { LawFirmDashboard } from './LawFirmDashboard';
import { LegalClients } from './LegalClients';
import { LegalCases } from './LegalCases';
import { LegalCalendar } from './LegalCalendar';
import { LegalTasks } from './LegalTasks';
import { LegalDocuments } from './LegalDocuments';
import { LegalBilling } from './LegalBilling';
import { LegalReports } from './LegalReports';
import { LegalSettings } from './LegalSettings';

export const LawFirmModule: React.FC = () => {
  const { activeTab, setActiveTab } = useModule();
  const [internalTab, setInternalTab] = useState<string>('Legal Dashboard');

  // Active tab priority: global layout tab if it matches legal sub-items, else internal tab
  const currentTab = activeTab || internalTab;

  const handleNavigate = (tab: string) => {
    setInternalTab(tab);
    if (setActiveTab) setActiveTab(tab);
  };

  switch (currentTab) {
    case 'Legal Dashboard':
    case 'Dashboard':
      return <LawFirmDashboard onNavigateTab={handleNavigate} />;
    case 'Clients':
    case 'Legal Clients':
      return <LegalClients />;
    case 'Cases':
    case 'Legal Cases':
    case 'Matters':
      return <LegalCases />;
    case 'Court Calendar':
    case 'Calendar':
      return <LegalCalendar />;
    case 'Legal Tasks':
    case 'Tasks':
      return <LegalTasks />;
    case 'Legal Documents':
    case 'Case Documents':
    case 'Documents':
      return <LegalDocuments />;
    case 'Billing & Retainers':
    case 'Billing':
    case 'Invoices':
    case 'Retainers':
      return <LegalBilling />;
    case 'Legal Reports':
    case 'Reports':
      return <LegalReports />;
    case 'Legal Settings':
    case 'Settings':
      return <LegalSettings />;
    default:
      return <LawFirmDashboard onNavigateTab={handleNavigate} />;
  }
};
