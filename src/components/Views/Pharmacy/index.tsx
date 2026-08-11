import React, { useState } from 'react';
import { useModule } from '../../../context/ModuleContext';
import { PharmacyDashboard } from './PharmacyDashboard';
import { MedicinesMaster } from './MedicinesMaster';
import { BatchExpiry } from './BatchExpiry';
import { Prescriptions } from './Prescriptions';
import { Patients } from './Patients';
import { Doctors } from './Doctors';
import { PharmacyPOS } from './PharmacyPOS';
import { DrugSafety } from './DrugSafety';
import { PharmacyInventory } from './PharmacyInventory';
import { Insurance } from './Insurance';
import { ControlledDrugs } from './ControlledDrugs';
import { PharmacyReports } from './PharmacyReports';
import { PharmacySettings } from './PharmacySettings';

export const PharmacyModule: React.FC = () => {
  const { activeTab, setActiveTab } = useModule();
  const [internalTab, setInternalTab] = useState<string>('Pharmacy Dashboard');

  const currentTab = activeTab || internalTab;

  const handleNavigate = (tab: string) => {
    setInternalTab(tab);
    if (setActiveTab) setActiveTab(tab);
  };

  switch (currentTab) {
    case 'Pharmacy Dashboard':
    case 'Dashboard':
      return <PharmacyDashboard onNavigateTab={handleNavigate} />;

    case 'Pharmacy POS':
    case 'POS':
      return <PharmacyPOS />;

    case 'Patients':
      return <Patients />;

    case 'Medicines':
    case 'Medicines Master':
    case 'Medicine Categories':
    case 'Price Lists':
    case 'Barcode & Labels':
      return <MedicinesMaster />;

    case 'Batch & Expiry':
    case 'Batch Management':
    case 'Expiry Tracking':
    case 'Near Expiry':
    case 'Batch Recalls':
    case 'Expired Disposal':
      return <BatchExpiry />;

    case 'Prescriptions':
      return <Prescriptions />;

    case 'Doctors':
      return <Doctors />;

    case 'Drug Safety':
      return <DrugSafety />;

    case 'Pharmacy Inventory':
    case 'Stock Overview':
    case 'Stock Transfer':
    case 'Stock Count':
    case 'Dead Stock':
    case 'Auto-Reorder':
      return <PharmacyInventory />;

    case 'Insurance & NHIF':
    case 'Insurance Providers':
    case 'Claims Management':
    case 'NHIF Claims':
    case 'Corporate Accounts':
    case 'Claim Reports':
    case 'Insurance':
      return <Insurance />;

    case 'Controlled Drugs':
      return <ControlledDrugs />;

    case 'Pharmacy Reports':
    case 'Sales Report':
    case 'Prescription Report':
    case 'Expiry Report':
    case 'Batch History':
    case 'Insurance Claims Report':
    case 'Controlled Drugs Report':
    case 'Supplier Performance':
    case 'Patient History Report':
    case 'Reports':
      return <PharmacyReports />;

    case 'Settings':
    case 'Pharmacy Settings':
      return <PharmacySettings />;

    default:
      return <PharmacyDashboard onNavigateTab={handleNavigate} />;
  }
};
