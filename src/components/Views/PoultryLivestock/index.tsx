import React, { useState } from 'react';
import { useModule } from '../../../context/ModuleContext';
import { LivestockDashboard } from './LivestockDashboard';
import { FarmManagement } from './FarmManagement';
import { PoultryBatches } from './PoultryBatches';
import { LivestockRegistry } from './LivestockRegistry';
import { FeedWaterManagement } from './FeedWaterManagement';
import { HealthVeterinary } from './HealthVeterinary';
import { BreedingHatchery } from './BreedingHatchery';
import { ProductionLedger } from './ProductionLedger';
import { FarmTasks } from './FarmTasks';
import { LivestockReports } from './LivestockReports';
import { LivestockSettings } from './LivestockSettings';

export const PoultryLivestockModule: React.FC = () => {
  const { activeTab, setActiveTab } = useModule();
  const [internalTab, setInternalTab] = useState<string>('Poultry Dashboard');

  const currentTab = activeTab || internalTab;

  const handleNavigate = (tab: string) => {
    setInternalTab(tab);
    if (setActiveTab) setActiveTab(tab);
  };

  switch (currentTab) {
    case 'Poultry Dashboard':
    case 'Dashboard':
      return <LivestockDashboard onNavigateTab={handleNavigate} />;

    case 'Farm Management':
    case 'Farms':
    case 'Houses':
      return <FarmManagement />;

    case 'Poultry Flocks':
    case 'Batch Management':
    case 'Flock Timeline':
    case 'Mortality & Culling':
    case 'FCR Analytics':
      return <PoultryBatches />;

    case 'Livestock Registry':
    case 'Animal Register':
    case 'Tagging & QR':
    case 'Genealogy Tree':
    case 'Weight ADG Curves':
      return <LivestockRegistry />;

    case 'Feed & Water':
    case 'Feed Inventory':
    case 'Recipe Formulation':
    case 'Water Meter Logs':
    case 'Feed Cost Analysis':
      return <FeedWaterManagement />;

    case 'Health & Veterinary':
    case 'Vaccination Schedule':
    case 'Disease Diagnosis':
    case 'Vet Portal':
    case 'Quarantine Records':
      return <HealthVeterinary />;

    case 'Breeding & Hatchery':
    case 'Mating & AI':
    case 'Pregnancy Check':
    case 'Incubator Settings':
    case 'Hatch Cycles':
      return <BreedingHatchery />;

    case 'Production Ledger':
    case 'Daily Egg Collection':
    case 'Milk Sessions':
    case 'Weight Gain Logs':
    case 'Production Trends':
      return <ProductionLedger />;

    case 'Farm Tasks':
      return <FarmTasks />;

    case 'Reports':
    case 'Production Report':
    case 'Mortality Report':
    case 'FCR Efficiency':
    case 'Cost per Unit':
    case 'Farm Profit & Loss':
      return <LivestockReports />;

    case 'Poultry Settings':
    case 'Settings':
      return <LivestockSettings />;

    default:
      return <LivestockDashboard onNavigateTab={handleNavigate} />;
  }
};
