import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useModule } from '../../context/ModuleContext';
import { useAuth } from '../../context/AuthContext';
import { useSyncState } from '../../context/SyncContext';
import { 
  db, safeGet, type Product, type ProductVariant, recordStockMovement, 
  type PosShift, type HeldCart, type HeldCartItem, type Tab,
  getEffectiveVariantSellingPrice
} from '../../db/dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button, Input, Dialog, Badge } from '../UI/custom-ui';
import { barService } from '../../services/barService';
import { 
  Search, ShoppingCart, Plus, Minus, Trash2, UserPlus, ShieldAlert,
  HelpCircle, Calculator, ArrowLeftRight, X
} from 'lucide-react';
import './POS.css';
import { decreaseInventoryForSale } from '../../services/inventoryService';
import { sessionService } from '../../services/sessionService';
import { DEFAULT_SECURITY_CONFIG, type SecurityConfig } from '../../services/settingsService';
import { cashDrawerService } from '../../services/cashDrawerService';
import { getShortBranchName } from '../../utils/mobileFormatters';
import { createReceipt } from '../../services/receiptEngine';

// Local POS Cart item interface
interface CartItem {
  product: Product;
  variant?: ProductVariant;
  quantity: number;
}

export const POS: React.FC = () => {
  const { activeModule, activeTab, setActiveTab } = useModule();
  const { currentBranch, currentTenant, user, isOfflineLocked, setIsOfflineLocked, hasBranchAccess } = useAuth();
  const [bypassPasscode, setBypassPasscode] = useState('');
  const { queueOperation } = useSyncState();
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);

  const securitySetting = useLiveQuery(() =>
    db.appSettings.where('[tenantId+namespace]').equals([currentTenant.id, 'SECURITY']).first()
  , [currentTenant.id]);

  // --- Input Refs for Shortcuts ---
  const searchInputRef = useRef<HTMLInputElement>(null);

  // --- IndexedDB Live Queries ---
  const products = useLiveQuery(() => 
    db.products.where('tenant_id').equals(currentTenant?.id || '')
      .and(p => !p.deletedAt && !(p as any).deleted_at && p.status !== 'Inactive')
      .toArray()
  , [currentTenant?.id]) || [];

  const productVariants = useLiveQuery(() =>
    db.productVariants.where('tenant_id').equals(currentTenant?.id || '')
      .and(v => v.status !== 'Inactive')
      .toArray()
  , [currentTenant?.id]) || [];

  const customers = useLiveQuery(() => {
    const typeMap: Record<string, string> = {
      Retail: 'Customer',
      Restaurant: 'Customer',
      Pharmacy: 'Patient',
      SACCO: 'Member',
      Law: 'Client',
      RealEstate: 'Tenant',
      School: 'Student',
      Hotel: 'Guest',
    };
    const targetType = typeMap[activeModule] || 'Customer';
    return db.customers.where('tenant_id').equals(currentTenant?.id || '')
      .and(c => c.branch_id === currentBranch?.id && c.type === targetType)
      .toArray();
  }, [currentTenant?.id, currentBranch?.id, activeModule]) || [];

  // Active cashier shift live query
  const activeShift = useLiveQuery(async () => {
    if (!user || !currentTenant?.id || !currentBranch?.id) return undefined;

    // 1. Check cashDrawerSessions first
    const drawerSession = await db.cashDrawerSessions
      .where('tenant_id').equals(currentTenant.id)
      .and(s => s.branch_id === currentBranch.id && s.status === 'OPEN')
      .first();

    if (drawerSession) {
      return {
        id: drawerSession.id,
        tenant_id: drawerSession.tenant_id,
        branch_id: drawerSession.branch_id,
        cashier_id: drawerSession.cashier_id,
        cashier_name: drawerSession.cashier_name,
        status: 'OPEN' as const,
        opening_time: drawerSession.opening_time,
        opening_float: drawerSession.opening_float,
        cash_sales: 0,
        mpesa_sales: 0,
        bank_sales: 0,
        cash_in: 0,
        cash_out: 0
      };
    }

    // 2. Fall back to posShifts
    return await db.posShifts
      .where('cashier_id').equals(user.id)
      .and(s => s.status === 'OPEN' && s.tenant_id === currentTenant.id && s.branch_id === currentBranch.id)
      .first();
  }, [user, currentTenant?.id, currentBranch?.id]);

  // Held carts live query
  const heldCarts = useLiveQuery(() =>
    db.heldCarts.where('tenant_id').equals(currentTenant?.id || '')
      .and(h => h.branch_id === currentBranch?.id)
      .toArray()
  , [currentTenant?.id, currentBranch?.id]) || [];

  // Past completed orders for Returns panel
  const pastOrders = useLiveQuery(async () => {
    if (!currentTenant?.id || !currentBranch?.id) return [];
    const arr = await db.orders.where('tenant_id').equals(currentTenant.id)
      .and(o => o.branch_id === currentBranch.id && o.module === activeModule)
      .toArray();
    return arr.sort((a,b) => b.timestamp - a.timestamp).slice(0, 10);
  }, [currentTenant?.id, currentBranch?.id, activeModule]) || [];

  // Bar module specific live queries
  const pricingRules = useLiveQuery(() => 
    db.pricingRules.where('tenant_id').equals(currentTenant?.id || '').toArray()
  , [currentTenant?.id]) || [];

  const barTables = useLiveQuery(() =>
    db.barTables.where('tenant_id').equals(currentTenant?.id || '')
      .and(t => t.branch_id === currentBranch?.id)
      .toArray()
  , [currentTenant?.id, currentBranch?.id]) || [];

  const openTabs = useLiveQuery(() =>
    db.tabs.where('tenant_id').equals(currentTenant?.id || '')
      .and(t => t.status !== 'CLOSED')
      .toArray()
  , [currentTenant?.id]) || [];

  // --- POS Local UI State ---
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  // Tax rate options (rate stored as decimal, e.g. 0.16 = 16%)
  const TAX_OPTIONS = [
    { label: 'Tax Exempt (0%)',  rate: 0    },
    { label: 'VAT (8%)',         rate: 0.08 },
    { label: 'VAT (10%)',        rate: 0.10 },
    { label: 'VAT (16%)',        rate: 0.16 },
    { label: 'VAT (18%)',        rate: 0.18 },
  ];
  const [selectedTaxRate, setSelectedTaxRate] = useState<number>(0); // default: 0% Tax Exempt
  const [isTaxDropdownOpen, setIsTaxDropdownOpen] = useState(false);

  const [paymentMethod, setPaymentMethod] = useState<string>('Cash');
  const [splitAmounts, setSplitAmounts] = useState<Record<string, number>>({
    Cash: 0,
    MobileMoney: 0,
    Card: 0,
    Bank: 0,
    StoreCredit: 0
  });
  const [cashReceived, setCashReceived] = useState<number>(0);

  // Restaurant Mode states
  const [selectedTable, setSelectedTable] = useState<string>('');
  const restaurantTables = ['Table 1', 'Table 2', 'Table 3', 'Table 4', 'Table 5', 'Table 6', 'Table 7', 'Table 8'];

  // Bar & Lounge Module States
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [barSubView, setBarSubView] = useState<'FLOOR' | 'TABS' | 'POS'>('FLOOR');
  const [selectedZone, setSelectedZone] = useState<string>('Main Area');
  
  // Split bill states
  const [isSplitBillModalOpen, setIsSplitBillModalOpen] = useState(false);
  const [splitBillMethod, setSplitBillMethod] = useState<'EQUALLY' | 'BY_ITEM'>('EQUALLY');
  const [splitCount, setSplitCount] = useState<number>(2);
  const [splitBillParts, setSplitBillParts] = useState<Array<{ index: number; amount: number; desc: string }>>([]);
  const [selectedSplitIndex, setSelectedSplitIndex] = useState<number | null>(null);
  const [selectedItemsForSplit, setSelectedItemsForSplit] = useState<Record<string, number>>({});

  // New Tab Form states
  const [isNewTabModalOpen, setIsNewTabModalOpen] = useState(false);
  const [tabNameInput, setTabNameInput] = useState('');
  const [tabTypeInput, setTabTypeInput] = useState<'TABLE' | 'CUSTOMER' | 'VIP' | 'CREDIT' | 'MOBILE'>('TABLE');

  // Modals state
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [backdatedTransactionDate, setBackdatedTransactionDate] = useState<string>('');
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  const [isShiftOpenModalOpen, setIsShiftOpenModalOpen] = useState(false);
  const [isShiftCloseModalOpen, setIsShiftCloseModalOpen] = useState(false);
  const [isCashInOutModalOpen, setIsCashInOutModalOpen] = useState(false);
  const [isHoldModalOpen, setIsHoldModalOpen] = useState(false);
  const [isResumeModalOpen, setIsResumeModalOpen] = useState(false);
  const [isSupervisorModalOpen, setIsSupervisorModalOpen] = useState(false);
  const [isReturnsModalOpen, setIsReturnsModalOpen] = useState(false);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [isShortcutsHelpOpen, setIsShortcutsHelpOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isShiftHistoryDashboardOpen, setIsShiftHistoryDashboardOpen] = useState(false);

  const shiftList = useLiveQuery(() => 
    db.posShifts.where('tenant_id').equals(currentTenant.id)
      .and(s => s.branch_id === currentBranch.id)
      .toArray()
  ) || [];

  // Form states
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerEmail, setNewCustomerEmail] = useState('');
  
  const [openingFloat, setOpeningFloat] = useState<number>(50000);
  const [cashInOutType, setCashInOutType] = useState<'IN' | 'OUT'>('IN');
  const [cashInOutAmount, setCashInOutAmount] = useState<number>(0);
  const [cashInOutNotes, setCashInOutNotes] = useState<string>('');
  const [closeCashActual, setCloseCashActual] = useState<number>(0);

  const [holdCartName, setHoldCartName] = useState('');
  const [supervisorPin, setSupervisorPin] = useState('');
  const [supervisorReason, setSupervisorReason] = useState('');
  const [supervisorSuccessCallback, setSupervisorSuccessCallback] = useState<(() => void) | null>(null);

  // Returns panel state
  const [returnOrderId, setReturnOrderId] = useState('');
  const [selectedOrderToReturn, setSelectedOrderToReturn] = useState<any | null>(null);
  const [returnItems, setReturnItems] = useState<Record<string, number>>({});

  // Receipt details state
  const [lastCompletedOrder, setLastCompletedOrder] = useState<any | null>(null);

  // Prescription verification for pharmacy
  const [prescriptionApproved, setPrescriptionApproved] = useState(false);

  // Variant Selection popup states
  const [selectedParentForVariants, setSelectedParentForVariants] = useState<Product | null>(null);
  const [variantsList, setVariantsList] = useState<ProductVariant[]>([]);
  const [variantQuantities, setVariantQuantities] = useState<Record<string, number>>({});

  // --- Dynamic calculations ---
  const categories = useMemo(() => {
    const cats = new Set(products.map((p) => p.category));
    return ['All', ...Array.from(cats)];
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesCat = selectedCategory === 'All' || p.category === selectedCategory;
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            p.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (p.sku && p.sku.toLowerCase().includes(searchQuery.toLowerCase())) ||
                            (p.barcode && p.barcode.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesCat && matchesSearch;
    });
  }, [products, selectedCategory, searchQuery]);

  const getProductPrice = (product: Product) => {
    const originalPrice = product.sellingPrice || product.price || 0;
    if (activeModule !== 'Bar') return originalPrice;
    
    if (product.is_happy_hour_eligible) {
      const now = new Date();
      const currentDay = now.toLocaleString('en-US', { weekday: 'long' });
      const currentHour = now.getHours();
      const currentMin = now.getMinutes();
      const currentMinutes = currentHour * 60 + currentMin;

      for (const rule of pricingRules) {
        if (rule.days && rule.days.length > 0 && !rule.days.includes(currentDay)) continue;
        if (rule.start_time && rule.end_time) {
          const [sh, sm] = rule.start_time.split(':').map(Number);
          const [eh, em] = rule.end_time.split(':').map(Number);
          const startMinutes = sh * 60 + sm;
          const endMinutes = eh * 60 + em;

          if (currentMinutes >= startMinutes && currentMinutes <= endMinutes) {
            if (!rule.applicable_product_ids || rule.applicable_product_ids.length === 0 || rule.applicable_product_ids.includes(product.id)) {
              if (rule.discount_percent > 0) {
                return originalPrice * (1 - rule.discount_percent / 100);
              }
            }
          }
        }
      }

      if (currentHour >= 17 && currentHour < 20 && product.happy_hour_price) {
        return product.happy_hour_price;
      }
    }
    return originalPrice;
  };

  const getItemSellingPrice = (product: Product, variant?: ProductVariant): number => {
    if (activeModule === 'Bar' && product.is_happy_hour_eligible) {
      return getProductPrice(product);
    }
    return getEffectiveVariantSellingPrice(variant, product) || getProductPrice(product);
  };

  const validateCartStock = (): boolean => {
    if (activeModule === 'SACCO') return true;
    for (const item of cart) {
      const stock = item.variant ? item.variant.stock : item.product.stock;
      if (stock <= 0) {
        alert(`Cannot proceed to checkout. "${item.product.name}" is out of stock.`);
        return false;
      }
      if (item.quantity > stock) {
        alert(`Cannot proceed to checkout. "${item.product.name}" quantity (${item.quantity}) exceeds available stock (${stock}).`);
        return false;
      }
    }
    return true;
  };

  const cartSubtotal = cart.reduce((sum, item) => sum + getItemSellingPrice(item.product, item.variant) * item.quantity, 0);
  const discountAmount = (cartSubtotal * discountPercent) / 100;
  const serviceCharge = activeModule === 'Restaurant' ? cartSubtotal * 0.05 : 0; // 5% Service Charge for restaurants
  const taxableAmount = cartSubtotal - discountAmount + serviceCharge;
  const taxAmount = taxableAmount * selectedTaxRate;
  const cartTotal = taxableAmount + taxAmount;

  // Split payment validation
  const splitTotalEntered = Object.values(splitAmounts).reduce((sum, val) => sum + val, 0);
  const isPaymentSplit = paymentMethod === 'Split';
  const changeDue = Math.max(0, (isPaymentSplit ? splitAmounts.Cash : cashReceived) - cartTotal);

  const selectedCustomer = useMemo(() => {
    return customers.find(c => c.id === selectedCustomerId);
  }, [customers, selectedCustomerId]);

  // Focus helper
  useEffect(() => {
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, []);

  // Close tax dropdown when clicking outside
  useEffect(() => {
    if (!isTaxDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      const btn = document.getElementById('tax-selector-btn');
      if (btn && !btn.closest('.relative')?.contains(e.target as Node)) {
        setIsTaxDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isTaxDropdownOpen]);


  // Listen to navigation subitem triggers (New Sale, Sales History, Returns)
  useEffect(() => {
    if (activeTab === 'New Sale') {
      setCart([]);
      setDiscountPercent(0);
      setSelectedCustomerId('');
      setSelectedTable('');
      setNotes('');
      setActiveTab('POS');
      alert('Started a new sale transaction.');
    } else if (activeTab === 'Sales History' || activeTab === 'Order History') {
      setIsHistoryModalOpen(true);
    } else if (activeTab === 'Returns') {
      setIsReturnsModalOpen(true);
    }
  }, [activeTab]);

  // Keyboard Shortcuts Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore shortcuts if inputting text unless it is function keys
      if (e.key === 'F1') {
        e.preventDefault();
        setCart([]);
        setDiscountPercent(0);
        setSelectedCustomerId('');
        setSelectedTable('');
        setNotes('');
        alert('New Sale started.');
      } else if (e.key === 'F2') {
        e.preventDefault();
        const select = document.getElementById('customer-select') as HTMLSelectElement;
        if (select) select.focus();
      } else if (e.key === 'F3') {
        e.preventDefault();
        if (searchInputRef.current) searchInputRef.current.focus();
      } else if (e.key === 'F4') {
        e.preventDefault();
        if (cart.length > 0) {
          setHoldCartName(`Cart-${Date.now().toString().slice(-4)}`);
          setIsHoldModalOpen(true);
        }
      } else if (e.key === 'F5') {
        e.preventDefault();
        setIsResumeModalOpen(true);
      } else if (e.key === 'F6') {
        e.preventDefault();
        // Cycle discount percent
        setDiscountPercent(prev => {
          if (prev === 0) return 5;
          if (prev === 5) return 10;
          if (prev === 10) return 15;
          return 0;
        });
      } else if (e.key === 'F7') {
        e.preventDefault();
        if (cart.length > 0) {
          if (!activeShift) {
            alert('Cannot proceed to checkout. No open shift found.');
            setIsShiftOpenModalOpen(true);
            return;
          }
          if (!validateCartStock()) return;
          setCashReceived(cartTotal);
          setSplitAmounts({
            Cash: cartTotal,
            MobileMoney: 0,
            Card: 0,
            Bank: 0,
            StoreCredit: 0
          });
          setIsCheckoutOpen(true);
        }
      } else if (e.key === 'F8') {
        e.preventDefault();
        if (lastCompletedOrder) {
          setIsReceiptOpen(true);
        } else {
          alert('No completed transaction available to print.');
        }
      } else if (e.key === 'Enter') {
        if (isSupervisorModalOpen) {
          e.preventDefault();
          handleVerifySupervisor({ preventDefault: () => {} } as React.FormEvent);
        } else if (isCheckoutOpen) {
          const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
          if (targetTag !== 'button') {
            e.preventDefault();
            handleCheckout();
          }
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setIsCheckoutOpen(false);
        setIsAddCustomerOpen(false);
        setIsShiftOpenModalOpen(false);
        setIsShiftCloseModalOpen(false);
        setIsCashInOutModalOpen(false);
        setIsHoldModalOpen(false);
        setIsResumeModalOpen(false);
        setIsSupervisorModalOpen(false);
        setIsReturnsModalOpen(false);
        setIsReceiptOpen(false);
        setIsShortcutsHelpOpen(false);
        setIsHistoryModalOpen(false);
        setSelectedParentForVariants(null);
        setActiveTab('POS'); // Always reset subitem tab routing on ESC
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart, cartTotal, activeShift, lastCompletedOrder, isSupervisorModalOpen, isCheckoutOpen, setActiveTab]);

  // --- Cart Helpers ---
  const handleItemAddition = (product: Product, variant?: ProductVariant) => {
    if (!activeShift) {
      alert('Must open a shift before adding items to cart.');
      setIsShiftOpenModalOpen(true);
      return;
    }

    const stockLimit = variant ? variant.stock : product.stock;
    if (stockLimit <= 0 && activeModule !== 'SACCO') {
      alert(`${product.name} is out of stock.`);
      return;
    }

    setCart((prev) => {
      const itemKey = variant ? variant.id : product.id;
      const existing = prev.find(item => (item.variant ? item.variant.id : item.product.id) === itemKey);

      if (existing) {
        if (existing.quantity >= stockLimit && activeModule !== 'SACCO') {
          alert(`Cannot add more. Only ${stockLimit} units available.`);
          return prev;
        }
        return prev.map(item => 
          (item.variant ? item.variant.id : item.product.id) === itemKey 
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }

      return [...prev, { product, variant, quantity: 1 }];
    });
    setSelectedParentForVariants(null);
  };

  const handleBulkItemsAddition = (product: Product, targetQuantities: Record<string, number>) => {
    if (!activeShift) {
      alert('Must open a shift before performing operations.');
      setIsShiftOpenModalOpen(true);
      return;
    }

    setCart((prev) => {
      // 1. Keep non-variant items or items belonging to other parent products.
      // Also keep variants of this product ONLY if targetQty > 0.
      let updatedCart = prev.filter(item => {
        if (item.product.id !== product.id || !item.variant) return true;
        const targetQty = targetQuantities[item.variant.id] || 0;
        return targetQty > 0;
      });

      // 2. Loop through all variants of this product and set/update their quantity in the cart
      for (const variant of variantsList) {
        const targetQty = targetQuantities[variant.id] || 0;
        if (targetQty <= 0) continue;

        const stockLimit = variant.stock;
        let finalQty = targetQty;
        if (targetQty > stockLimit && activeModule !== 'SACCO') {
          alert(`Cannot set quantity to ${targetQty} for ${product.name} (${Object.values(variant.attributes).join(' / ')}). Only ${stockLimit} units available.`);
          finalQty = stockLimit;
        }

        const idx = updatedCart.findIndex(item => item.variant?.id === variant.id);
        if (idx > -1) {
          updatedCart[idx] = { ...updatedCart[idx], quantity: finalQty };
        } else {
          updatedCart.push({ product, variant, quantity: finalQty });
        }
      }

      return updatedCart;
    });

    setSelectedParentForVariants(null);
    setVariantQuantities({});
  };

  const handleProductGridClick = async (product: Product) => {
    if (product.hasVariants) {
      const vars = await db.productVariants.where('productId').equals(product.id).toArray();
      setVariantsList(vars);

      const initialQuantities: Record<string, number> = {};
      vars.forEach(v => {
        const cartItem = cart.find(item => item.variant?.id === v.id);
        initialQuantities[v.id] = cartItem ? cartItem.quantity : 0;
      });
      setVariantQuantities(initialQuantities);

      setSelectedParentForVariants(product);
    } else {
      handleItemAddition(product);
    }
  };

  const performUpdateQuantity = (itemKey: string, val: number) => {
    setCart((prev) => {
      const existing = prev.find(item => (item.variant ? item.variant.id : item.product.id) === itemKey);
      if (!existing) return prev;

      const newQty = existing.quantity + val;
      if (newQty <= 0) {
        return prev.filter(item => (item.variant ? item.variant.id : item.product.id) !== itemKey);
      }

      const stockLimit = existing.variant ? existing.variant.stock : existing.product.stock;
      if (newQty > stockLimit && activeModule !== 'SACCO') {
        alert(`Cannot add more. Only ${stockLimit} units available.`);
        return prev;
      }

      return prev.map(item => 
        (item.variant ? item.variant.id : item.product.id) === itemKey 
          ? { ...item, quantity: newQty }
          : item
      );
    });
  };

  const updateQuantity = (itemKey: string, val: number) => {
    if (activeModule === 'Bar' && activeTabId && val < 0) {
      requestSupervisorApproval(`Decrease quantity for item in Tab #${activeTabId.slice(-4)}`, () => {
        performUpdateQuantity(itemKey, val);
      });
      return;
    }
    performUpdateQuantity(itemKey, val);
  };

  const performRemoveFromCart = (itemKey: string) => {
    setCart((prev) => prev.filter(item => (item.variant ? item.variant.id : item.product.id) !== itemKey));
  };

  const removeFromCart = (itemKey: string) => {
    if (activeModule === 'Bar' && activeTabId) {
      requestSupervisorApproval(`Remove item entirely from Tab #${activeTabId.slice(-4)}`, () => {
        performRemoveFromCart(itemKey);
      });
      return;
    }
    performRemoveFromCart(itemKey);
  };

  // --- Supervisor Approval Gate ---
  const requestSupervisorApproval = (reason: string, successCallback: () => void) => {
    setSupervisorReason(reason);
    setSupervisorPin('');
    setSupervisorSuccessCallback(() => successCallback);
    setIsSupervisorModalOpen(true);
  };

  const handleVerifySupervisor = (e: React.FormEvent) => {
    e.preventDefault();
    if (supervisorPin === '1234' || supervisorPin === 'admin123') {
      setIsSupervisorModalOpen(false);
      if (supervisorSuccessCallback) supervisorSuccessCallback();
    } else {
      alert('Invalid supervisor PIN. Access denied.');
    }
  };

  // Voids or Clear Cart with verification
  const handleClearCart = () => {
    if (cart.length > 5) {
      requestSupervisorApproval('Voiding cart with more than 5 items', () => {
        setCart([]);
      });
    } else {
      setCart([]);
    }
  };

  // --- Bar Persistent Tabs Management Helpers ---
  const handleSaveTab = async (tabNameStr: string, tabTypeStr: Tab['tab_type'] = 'TABLE') => {
    if (!user || cart.length === 0) return;

    const mappedItems = cart.map(item => ({
      product_id: item.product.id,
      variant_id: item.variant?.id,
      quantity: item.quantity,
      price: getItemSellingPrice(item.product, item.variant)
    }));

    const totalAmt = cart.reduce((sum, item) => sum + getItemSellingPrice(item.product, item.variant) * item.quantity, 0);

    if (activeTabId) {
      await db.tabs.update(activeTabId, {
        items: mappedItems,
        total: totalAmt,
        total_amount: totalAmt,
        status: 'ORDERING'
      });
      alert('Tab updated successfully.');
    } else {
      const tabId = `tab-${Date.now()}`;
      await db.tabs.add({
        id: tabId,
        tenant_id: currentTenant.id,
        customer_id: selectedCustomerId || undefined,
        table_id: selectedTable || undefined,
        tab_name: tabNameStr || `Tab #${tabId.slice(-4)}`,
        tab_type: tabTypeStr,
        status: 'OPEN',
        opened_by: user.name,
        opened_at: Date.now(),
        items: mappedItems,
        total: totalAmt,
        total_amount: totalAmt
      });
      if (selectedTable) {
        const matchingTable = barTables.find(t => t.name === selectedTable);
        if (matchingTable) {
          await db.barTables.update(matchingTable.id, { status: 'OCCUPIED' });
        }
      }
      alert('New Tab created successfully.');
    }

    setCart([]);
    setActiveTabId(null);
    setSelectedTable('');
    setHoldCartName('');
    setBarSubView('FLOOR');
  };

  const handleResumeTab = async (tab: Tab) => {
    const loadedCart = [];
    for (const item of tab.items) {
      const prod = item.product_id ? await safeGet(db.products, item.product_id) : null;
      if (prod) {
        let variant;
        if (item.variant_id) {
          variant = await safeGet(db.productVariants, item.variant_id);
        }
        loadedCart.push({
          product: prod,
          variant,
          quantity: item.quantity
        });
      }
    }
    setCart(loadedCart);
    setActiveTabId(tab.id);
    setSelectedTable(tab.table_id || '');
    setHoldCartName(tab.tab_name || '');
    if (tab.customer_id) setSelectedCustomerId(tab.customer_id);
    setBarSubView('POS');
  };

  const triggerSplitBill = async () => {
    if (!activeTabId) return;
    try {
      const selItems = Object.entries(selectedItemsForSplit).map(([pId, qty]) => ({
        product_id: pId,
        quantity: qty
      }));
      
      const parts = await barService.splitTab(activeTabId, splitBillMethod, splitCount, selItems);
      setSplitBillParts(parts);
      setIsSplitBillModalOpen(true);
    } catch (e: any) {
      alert('Error splitting bill: ' + e.message);
    }
  };

  // --- Shift Management Helpers ---
  const handleOpenShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const newShift: PosShift = {
      id: `shift-${Date.now()}`,
      tenant_id: currentTenant.id,
      branch_id: currentBranch.id,
      cashier_id: user.id,
      cashier_name: user.name,
      status: 'OPEN',
      opening_time: Date.now(),
      opening_float: openingFloat,
      cash_sales: 0,
      mpesa_sales: 0,
      bank_sales: 0,
      cash_in: 0,
      cash_out: 0
    };

    await db.posShifts.add(newShift);

    // Also sync CashDrawer session
    try {
      const drawer = await cashDrawerService.ensureDefaultDrawerExists(currentTenant.id, currentBranch.id);
      let session = await cashDrawerService.getActiveSession(currentTenant.id, currentBranch.id, drawer.id);
      if (!session) {
        await cashDrawerService.openDrawerSession(
          currentTenant.id,
          currentBranch.id,
          drawer.id,
          'POS-TERM-01',
          user.id,
          user.name,
          'Morning',
          openingFloat,
          []
        );
      }
    } catch (err) {
      console.warn('[POS] CashDrawer sync failed on open shift:', err);
    }

    setIsShiftOpenModalOpen(false);
    alert(`Shift successfully opened with float Tsh. ${openingFloat.toLocaleString()}`);
  };

  const handleCloseShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShift) return;

    const expectedCash = activeShift.opening_float + activeShift.cash_sales + activeShift.cash_in - activeShift.cash_out;
    const finalShift: PosShift = {
      ...activeShift,
      status: 'CLOSED',
      closing_time: Date.now(),
      closing_cash_actual: closeCashActual,
      notes: `Reconciliation: Expected Cash Tsh. ${expectedCash.toLocaleString()}, Counted Tsh. ${closeCashActual.toLocaleString()}. Variance Tsh. ${(closeCashActual - expectedCash).toLocaleString()}`
    };

    await db.posShifts.put(finalShift);

    // Also sync CashDrawer session close
    try {
      const drawer = await cashDrawerService.ensureDefaultDrawerExists(currentTenant.id, currentBranch.id);
      const session = await cashDrawerService.getActiveSession(currentTenant.id, currentBranch.id, drawer.id);
      if (session) {
        await cashDrawerService.performBlindCashClosingCount(
          currentTenant.id,
          currentBranch.id,
          drawer.id,
          session.id,
          user?.id || 'usr-cashier',
          user?.name || 'Authorized Cashier',
          [],
          500
        );
      }
    } catch (err) {
      console.warn('[POS] CashDrawer sync failed on close shift:', err);
    }

    setIsShiftCloseModalOpen(false);
    alert(`Shift reconciled & closed successfully.\nVariance: Tsh. ${(closeCashActual - expectedCash).toLocaleString()}`);
  };

  const handleCashInOutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShift) return;

    const updatedShift = { ...activeShift };
    if (cashInOutType === 'IN') {
      updatedShift.cash_in += cashInOutAmount;
    } else {
      updatedShift.cash_out += cashInOutAmount;
    }

    await db.posShifts.put(updatedShift);
    setIsCashInOutModalOpen(false);
    setCashInOutAmount(0);
    setCashInOutNotes('');
    alert(`Cash register updated: Tsh. ${cashInOutAmount.toLocaleString()} logged as ${cashInOutType}.`);
  };

  // --- Hold & Resume Helpers ---
  const handleHoldCart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || cart.length === 0) return;

    const mappedItems: HeldCartItem[] = cart.map(item => ({
      product: item.product,
      variant: item.variant,
      quantity: item.quantity,
      price: getItemSellingPrice(item.product, item.variant)
    }));

    const newHeld: HeldCart = {
      id: `held-${Date.now()}`,
      tenant_id: currentTenant.id,
      branch_id: currentBranch.id,
      cashier_id: user.id,
      name: holdCartName || `Cart-${Date.now().toString().slice(-4)}`,
      items: mappedItems,
      discountPercent,
      selectedCustomerId: selectedCustomerId || undefined,
      created_at: Date.now()
    };

    await db.heldCarts.add(newHeld);
    setCart([]);
    setDiscountPercent(0);
    setSelectedCustomerId('');
    setIsHoldModalOpen(false);
    alert('Sale suspended successfully.');
  };

  const handleResumeCart = async (heldId: string) => {
    const held = heldId ? await safeGet(db.heldCarts, heldId) : null;
    if (!held) return;

    const restoredCart: CartItem[] = held.items.map(item => ({
      product: item.product,
      variant: item.variant,
      quantity: item.quantity
    }));

    setCart(restoredCart);
    setDiscountPercent(held.discountPercent);
    setSelectedCustomerId(held.selectedCustomerId || '');
    await db.heldCarts.delete(heldId);
    setIsResumeModalOpen(false);
  };

  // --- Returns & Exchanges Helpers ---
  const handleLoadOrderToReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnOrderId) return;
    const order = returnOrderId ? await safeGet(db.orders, returnOrderId) : null;
    if (order) {
      setSelectedOrderToReturn(order);
      const initialQtys: Record<string, number> = {};
      order.items.forEach((item: any) => {
        initialQtys[item.variantId || item.productId] = 0;
      });
      setReturnItems(initialQtys);
    } else {
      alert('Order ID not found.');
    }
  };

  const executeReturn = async () => {
    if (!selectedOrderToReturn) return;

    requestSupervisorApproval('Approving return and refund transaction', async () => {
      // Post adjustment movements to restock items
      for (const item of selectedOrderToReturn.items) {
        const qtyToReturn = returnItems[item.variantId || item.productId] || 0;
        if (qtyToReturn > 0) {
          await recordStockMovement({
            tenant_id: currentTenant.id,
            branch_id: currentBranch.id,
            warehouse_id: 'warehouse-main',
            product_id: item.productId,
            variant_id: item.variantId,
            movement_type: 'CUSTOMER_RETURN',
            reference_type: 'RETURN',
            reference_id: selectedOrderToReturn.id,
            quantity_change: qtyToReturn,
            unit_cost: 0,
            total_cost: 0,
            user_id: user?.name || 'System POS',
            notes: `POS Return: Restocked ${qtyToReturn} units`
          });
        }
      }

      setIsReturnsModalOpen(false);
      setSelectedOrderToReturn(null);
      setReturnOrderId('');
      alert('Return completed successfully. Inventory restocked.');
    });
  };

  // --- Add Customer Handler ---
  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomerName.trim() || !newCustomerPhone.trim()) return;
    const typeMap: Record<string, string> = {
      Retail: 'Customer', Restaurant: 'Customer', Pharmacy: 'Patient',
      SACCO: 'Member', Law: 'Client', RealEstate: 'Tenant', School: 'Student', Hotel: 'Guest',
    };
    const newCustomer = {
      id: `cust-${Date.now()}`,
      name: newCustomerName.trim(),
      phone: newCustomerPhone.trim(),
      email: newCustomerEmail.trim() || undefined,
      type: typeMap[activeModule] || 'Customer',
      loyaltyPoints: 0,
      outstandingBalance: 0,
      creditLimit: 500000,
      tenant_id: currentTenant.id,
      branch_id: currentBranch.id,
    };
    await queueOperation('INSERT', 'customers', newCustomer);
    setSelectedCustomerId(newCustomer.id);
    setNewCustomerName('');
    setNewCustomerPhone('');
    setNewCustomerEmail('');
    setIsAddCustomerOpen(false);
    alert(`Customer "${newCustomer.name}" registered successfully.`);
  };

  // --- Checkout Execution ---
  const handleCheckout = async () => {
    if (!hasBranchAccess(currentBranch.id)) {
      alert("Permission Denied: You do not have branch-level access to checkout transactions here.");
      return;
    }
    if (cart.length === 0) return;
    if (!activeShift) return;

    if (activeModule === 'Pharmacy' && cart.some(item => item.product.category === 'Antibiotics') && !prescriptionApproved) {
      alert('WARNING: Controlled medicines in cart. Verifying doctor approval is mandatory.');
      return;
    }

    // Verify split payment sums up exactly
    if (isPaymentSplit && Math.abs(splitTotalEntered - cartTotal) > 0.01) {
      alert(`Split payment total (Tsh. ${splitTotalEntered.toLocaleString()}) does not match cart total (Tsh. ${cartTotal.toLocaleString()}).`);
      return;
    }

    // Calculate target timestamp
    const targetTime = backdatedTransactionDate ? new Date(backdatedTransactionDate).getTime() : Date.now();
    const isBackdated = Date.now() - targetTime > 60 * 60 * 1000;

    if (backdatedTransactionDate) {
      // Future validation
      if (targetTime > Date.now() + 5 * 60 * 1000) {
        alert('Transaction date cannot be in the future.');
        return;
      }
      // 2 year validation
      const twoYearsAgo = Date.now() - 2 * 365 * 24 * 60 * 60 * 1000;
      if (targetTime < twoYearsAgo) {
        alert('Transaction date cannot be older than two years.');
        return;
      }
    }

    // Settings toggle check
    const securityConfig = (securitySetting?.config || DEFAULT_SECURITY_CONFIG) as SecurityConfig;
    const allowBackdated = securityConfig.allowBackdatedSales;
    if (isBackdated && !allowBackdated) {
      alert('Backdated sales are currently disabled in settings.');
      return;
    }

    const executeCheckout = async (customTimestamp?: number) => {
      const orderTime = customTimestamp || Date.now();
      const orderId = `ord-${orderTime.toString().slice(-6)}`;
      const items = cart.map((item) => ({
        productId: item.product.id,
        variantId: item.variant?.id,
        name: item.variant 
          ? `${item.product.name} (${Object.values(item.variant.attributes).join('/')})` 
          : item.product.name,
        price: getItemSellingPrice(item.product, item.variant),
        quantity: item.quantity
      }));

      const newOrder = {
        id: orderId,
        items,
        total: cartTotal,
        discount: discountAmount,
        tax: taxAmount,
        paymentMethod: isPaymentSplit ? 'Split' : paymentMethod,
        status: (paymentMethod === 'Credit' ? 'Pending' : 'Completed') as any,
        timestamp: orderTime,
        syncStatus: 'Pending' as const,
        tenant_id: currentTenant.id,
        branch_id: currentBranch.id,
        module: activeModule
      };

      await queueOperation('INSERT', 'orders', newOrder);

      // Bar module adjustments: calculate commission and close persistent tabs
      if (activeModule === 'Bar') {
        const commission = await barService.calculateCommission(
          cart.map(item => ({
            product_id: item.product.id,
            quantity: item.quantity,
            price: item.variant?.sellingPrice || getProductPrice(item.product)
          }))
        );

        if (commission > 0) {
          await db.tips.add({
            id: `comm-${Date.now()}`,
            tenant_id: currentTenant.id,
            employee_id: user?.id || 'usr-owner',
            amount: 0,
            transaction_id: orderId,
            timestamp: orderTime,
            commission_earned: commission
          });
        }

        if (activeTabId) {
          await db.tabs.update(activeTabId, {
            status: 'CLOSED',
            closed_at: orderTime
          });

          const currentTab = activeTabId ? await safeGet(db.tabs, activeTabId) : null;
          if (currentTab && currentTab.table_id) {
            const matchingTable = barTables.find(t => t.name === currentTab.table_id);
            if (matchingTable) {
              await db.barTables.update(matchingTable.id, { status: 'AVAILABLE' });
            }
          }
          setActiveTabId(null);
        }
      }

      // Record immutable ledger changes & calculate WAC
      if (activeModule !== 'SACCO') {
        for (const item of cart) {
          await decreaseInventoryForSale(
            currentTenant.id,
            currentBranch.id,
            item.product.id,
            item.variant?.id,
            item.quantity,
            orderId,
            user?.name || 'POS Cashier',
            orderTime
          );
        }
      }

      // Accumulate shift payment totals
      const updatedShift = { ...activeShift };
      if (isPaymentSplit) {
        updatedShift.cash_sales += splitAmounts.Cash;
        updatedShift.mpesa_sales += splitAmounts.MobileMoney;
        updatedShift.bank_sales += splitAmounts.Bank + splitAmounts.Card;
      } else {
        if (paymentMethod === 'Cash') updatedShift.cash_sales += cartTotal;
        else if (paymentMethod === 'MobileMoney') updatedShift.mpesa_sales += cartTotal;
        else if (paymentMethod === 'Credit') {
          // Credit sales don't add to drawer cash directly
        } else {
          updatedShift.bank_sales += cartTotal;
        }
      }

      await db.posShifts.put(updatedShift);

      // Also log cash sale into CashDrawer ledger for real-time running balance
      const cashPortion = isPaymentSplit ? splitAmounts.Cash : (paymentMethod === 'Cash' ? cartTotal : 0);
      if (cashPortion > 0) {
        try {
          const drawer = await cashDrawerService.ensureDefaultDrawerExists(currentTenant.id, currentBranch.id);
          let session = await cashDrawerService.getActiveSession(currentTenant.id, currentBranch.id, drawer.id);
          if (!session) {
            session = await cashDrawerService.openDrawerSession(
              currentTenant.id,
              currentBranch.id,
              drawer.id,
              'POS-TERM-01',
              user?.id || 'usr-cashier',
              user?.name || 'Cashier',
              'Morning',
              activeShift.opening_float || 0,
              []
            );
          }
          if (session) {
            await cashDrawerService.recordCashSale(
              currentTenant.id,
              currentBranch.id,
              drawer.id,
              session.id,
              cashPortion,
              user?.id || 'usr-cashier',
              user?.name || 'Cashier',
              'POS-TERM-01',
              orderId
            );
          }
        } catch (err) {
          console.warn('[POS] Failed to log cash sale into CashDrawer ledger:', err);
        }
      }

      // Apply loyalty points and update outstanding balance if Credit, or wallet if Wallet
      if (selectedCustomer) {
        const points = Math.floor(cartTotal / 1000);
        let walletDeduction = 0;
        if (paymentMethod === 'Wallet') {
          walletDeduction = cartTotal;
        }
        const updatedCust = {
          ...selectedCustomer,
          loyaltyPoints: selectedCustomer.loyaltyPoints + points,
          outstandingBalance: selectedCustomer.outstandingBalance + (paymentMethod === 'Credit' ? cartTotal : 0),
          walletBalance: Math.max(0, (selectedCustomer.walletBalance || 0) - walletDeduction)
        };
        await queueOperation('UPDATE', 'customers', updatedCust);
      }

      setLastCompletedOrder(newOrder);
      setCart([]);
      setDiscountPercent(0);
      setSelectedCustomerId('');
      setPrescriptionApproved(false);
      setSelectedTable('');
      setNotes('');
      setBackdatedTransactionDate('');
      setIsCheckoutOpen(false);

      // Auto-generate canonical receipt via ReceiptEngine
      try {
        await createReceipt({
          idempotency_key: orderId,
          transaction_id: orderId,
          transaction_type: 'POS_SALE',
          tenant_id: currentTenant.id,
          branch_id: currentBranch.id,
          cashier_id: user?.id || 'usr-cashier',
          cashier_name: user?.name || 'Cashier',
          customer_id: selectedCustomer?.id,
          customer_name: selectedCustomer?.name,
          customer_phone: selectedCustomer?.phone,
          items: cart.map(item => ({
            product_id: item.product.id,
            variant_id: item.variant?.id,
            name: item.variant
              ? `${item.product.name} (${Object.values(item.variant.attributes).join('/')})`
              : item.product.name,
            sku: item.variant?.sku || item.product.sku,
            qty: item.quantity,
            unit_price: getItemSellingPrice(item.product, item.variant),
            discount: 0,
            tax_rate: 0,
          })),
          discount_amount: discountAmount,
          tax_amount: taxAmount,
          total: cartTotal,
          paid_amount: isPaymentSplit ? splitTotalEntered : cashReceived,
          change_amount: isPaymentSplit ? 0 : Math.max(0, cashReceived - cartTotal),
          payment_method: isPaymentSplit ? 'Split' : paymentMethod,
          currency: 'TZS',
        });
      } catch (receiptErr) {
        // Receipt generation failure is non-fatal — POS sale is already committed
        console.warn('[POS] Receipt auto-generation failed (non-fatal):', receiptErr);
      }

      // Auto open receipt modal
      setIsReceiptOpen(true);
    };

    const proceedToExecute = async () => {
      if (paymentMethod === 'Wallet') {
        if (!selectedCustomer) {
          alert('A customer profile must be selected to pay using a wallet.');
          return;
        }
        const balance = selectedCustomer.walletBalance || 0;
        if (balance < cartTotal) {
          alert(`Insufficient wallet balance. Total: Tsh. ${cartTotal.toLocaleString()}, Wallet Balance: Tsh. ${balance.toLocaleString()}`);
          return;
        }
      }

      if (paymentMethod === 'Credit') {
        if (!selectedCustomer) {
          alert('A registered customer must be attached for Credit Sales.');
          return;
        }
        const currentOutstanding = selectedCustomer.outstandingBalance || 0;
        const limit = selectedCustomer.creditLimit || 500000;
        if (currentOutstanding + cartTotal > limit) {
          requestSupervisorApproval(
            `Customer credit limit exceeded. Outstanding: Tsh. ${currentOutstanding.toLocaleString()}, Limit: Tsh. ${limit.toLocaleString()}, Order Total: Tsh. ${cartTotal.toLocaleString()}`,
            async () => {
              await executeCheckout(targetTime);
            }
          );
          return;
        }
      }

      await executeCheckout(targetTime);
    };

    // Role-based verification gate for backdated sale
    const isOwnerOrManager = ['Super Admin', 'Business Owner', 'Tenant Owner', 'Branch Manager'].includes(user?.role || '');
    if (isBackdated && !isOwnerOrManager) {
      requestSupervisorApproval(
        `Authorize backdated POS transaction on ${new Date(targetTime).toLocaleString()}`,
        async () => {
          await proceedToExecute();
        }
      );
    } else {
      await proceedToExecute();
    }
  };

  const handleSupervisorBypass = async () => {
    if (!user) return;
    const success = await sessionService.supervisorBypassOfflineLock(user.id, currentTenant.id, bypassPasscode);
    if (success) {
      setIsOfflineLocked(false);
      setBypassPasscode('');
      alert('Offline grace period extended by 12 hours.');
    } else {
      alert('Invalid supervisor passcode.');
    }
  };

  if (isOfflineLocked) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/90 backdrop-blur-md p-6 text-center animate-in fade-in duration-200">
        <div className="max-w-md w-full bg-white dark:bg-darkbg-card rounded-2xl shadow-xl border border-slate-200 dark:border-darkbg-border p-8 space-y-6">
          <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-full bg-red-100 dark:bg-red-950/30 text-danger shadow-sm">
            <ShieldAlert className="h-8 w-8 text-red-600 dark:text-red-500" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-black text-slate-800 dark:text-white">POS Terminal Locked</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Offline Grace Period Expired. Please connect to the internet to verify your subscription and session validity, or request a supervisor override passcode to bypass.
            </p>
          </div>
          <div className="space-y-4 pt-2">
            <Input
              type="password"
              placeholder="Enter Supervisor Passcode"
              value={bypassPasscode}
              onChange={(e) => setBypassPasscode(e.target.value)}
              className="text-center text-lg tracking-widest font-mono h-11"
            />
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  window.location.reload();
                }}
              >
                Retry Connection
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={handleSupervisorBypass}
              >
                Authorize Bypass
              </Button>
            </div>
            <div className="text-[10px] text-slate-400 leading-normal">
              💡 <strong>Hint for Testing:</strong> Enter supervisor override code <code>manager123</code> to extend offline operations by 12 hours.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pos-root space-y-4">
      {/* Header bar: status indicators, shift management */}
      <div className="pos-header-bar flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 p-3 bg-white dark:bg-darkbg-card rounded-xl border border-slate-200 dark:border-darkbg-border shadow-sm">
        <div className="flex-1 flex items-center gap-2 sm:gap-3 min-w-0">
          <h2 className="text-xs sm:text-sm font-bold text-slate-800 dark:text-white flex items-center gap-1.5 shrink-0">
            <Calculator className="h-4 w-4 text-primary shrink-0" />
            <span className="hidden sm:inline">POS TERMINAL</span>
            <span className="sm:hidden">POS</span>
            <span className="text-[10px] text-slate-400 font-semibold truncate max-w-[80px] sm:max-w-none">
              ({getShortBranchName(currentBranch?.name)})
            </span>
            <Badge variant={activeShift ? 'success' : 'danger'}>
              {activeShift ? 'Active' : 'Closed'}
            </Badge>
          </h2>

          {activeShift && (
            <div className="hidden lg:flex text-xs text-slate-500 dark:text-slate-400 gap-3 border-l pl-3 border-slate-200 dark:border-darkbg-border truncate">
              <span>Cashier: <strong>{activeShift.cashier_name}</strong></span>
              <span>Expected Cash: <strong>Tsh. {(activeShift.opening_float + activeShift.cash_sales + activeShift.cash_in - activeShift.cash_out).toLocaleString()}</strong></span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0 max-w-full">
          {activeShift ? (
            <>
              <Button size="xs" variant="secondary" onClick={() => setIsCashInOutModalOpen(true)}>
                <ArrowLeftRight className="h-3 w-3 sm:mr-1 shrink-0" /> <span className="hidden sm:inline">Cash In/Out</span>
              </Button>
              <Button size="xs" variant="secondary" onClick={() => setIsShiftCloseModalOpen(true)}>
                <span className="hidden sm:inline">Reconcile & Close Shift</span>
                <span className="sm:hidden">Close Shift</span>
              </Button>
            </>
          ) : (
            <Button size="xs" variant="primary" onClick={() => setIsShiftOpenModalOpen(true)}>
              Open Shift
            </Button>
          )}
          <Button size="xs" variant="secondary" onClick={() => setIsReturnsModalOpen(true)}>
            Refunds
          </Button>
          <Button size="xs" variant="secondary" onClick={() => setIsShiftHistoryDashboardOpen(true)}>
            Dashboard
          </Button>
          <Button size="xs" variant="secondary" onClick={() => setIsShortcutsHelpOpen(true)}>
            <HelpCircle className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Bar sub-tabs switcher */}
      {activeModule === 'Bar' && (
        <div className="flex border-b border-slate-200 dark:border-darkbg-border gap-2 pb-2">
          <Button 
            variant={barSubView === 'FLOOR' ? 'primary' : 'secondary'}
            size="xs"
            onClick={() => setBarSubView('FLOOR')}
          >
            🏨 Floor Layout
          </Button>
          <Button 
            variant={barSubView === 'TABS' ? 'primary' : 'secondary'}
            size="xs"
            onClick={() => setBarSubView('TABS')}
          >
            🍺 Open Tabs ({openTabs.length})
          </Button>
          <Button 
            variant={barSubView === 'POS' ? 'primary' : 'secondary'}
            size="xs"
            onClick={() => setBarSubView('POS')}
          >
            🍸 POS Order Terminal {activeTabId && `(Editing: #${activeTabId.slice(-4)})`}
          </Button>
        </div>
      )}

      {/* Main split dashboard view */}
      <div className="flex h-[calc(100vh-12.5rem)] flex-col lg:flex-row gap-4 overflow-hidden pb-20 lg:pb-0">
        {activeModule === 'Bar' && barSubView === 'FLOOR' ? (
          <div className="flex-1 flex flex-col space-y-4 overflow-y-auto">
            {/* Zone Selector */}
            <div className="pos-floor-zones">
              {['Main Area', 'VIP Section', 'Outdoor Rooftop'].map(zone => (
                <button
                  key={zone}
                  onClick={() => setSelectedZone(zone)}
                  className={`pos-category-btn ${selectedZone === zone ? 'active' : ''}`}
                >
                  {zone}
                </button>
              ))}
            </div>
            {/* Floor tables grid */}
            <div className="pos-floor-tables p-4 bg-slate-50 dark:bg-darkbg/40 rounded-xl min-h-[300px]">
              {barTables.filter(t => t.zone_id === selectedZone).map(t => {
                const tabForTable = openTabs.find(tab => tab.table_id === t.name);
                return (
                  <div 
                    key={t.id} 
                    className={`pos-floor-table-card ${t.status.toLowerCase()}`}
                    onClick={async () => {
                      if (t.status === 'OCCUPIED' && tabForTable) {
                        await handleResumeTab(tabForTable);
                      } else {
                        setSelectedTable(t.name);
                        setTabNameInput(`${t.name} Tab`);
                        setTabTypeInput('TABLE');
                        setIsNewTabModalOpen(true);
                      }
                    }}
                  >
                    <div className="text-sm font-bold text-slate-800 dark:text-white">{t.name}</div>
                    <div className="text-[10px] text-slate-400 mt-1">Capacity: {t.capacity} pax</div>
                    <div className="mt-3">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                        t.status === 'AVAILABLE' 
                          ? 'bg-green-100 text-green-800 dark:bg-green-950/30 dark:text-green-300' 
                          : t.status === 'OCCUPIED'
                          ? 'bg-red-100 text-red-800 dark:bg-red-950/30 dark:text-red-300'
                          : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-300'
                      }`}>
                        {t.status}
                      </span>
                    </div>
                    {tabForTable && (
                      <div className="text-[10px] font-extrabold text-primary dark:text-primary-dark mt-2">
                        Tsh. {tabForTable.total.toLocaleString()}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : activeModule === 'Bar' && barSubView === 'TABS' ? (
          <div className="flex-1 flex flex-col space-y-4 overflow-y-auto pr-1">
            <div className="flex justify-between items-center bg-white dark:bg-darkbg-card p-3 rounded-lg border dark:border-darkbg-border">
              <h3 className="text-xs font-bold text-slate-800 dark:text-white">Active Open Tabs</h3>
              <Button size="xs" onClick={() => {
                setSelectedTable('');
                setTabNameInput(`Tab #${Date.now().toString().slice(-4)}`);
                setTabTypeInput('CUSTOMER');
                setIsNewTabModalOpen(true);
              }}>+ Create Tab</Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {openTabs.length === 0 ? (
                <div className="col-span-full py-12 text-center text-slate-400 italic text-xs">No active open tabs. Open a tab on the Floor Planner or click Create Tab.</div>
              ) : (
                openTabs.map(tab => (
                  <div key={tab.id} className="pos-tab-card flex flex-col justify-between p-3 border rounded-lg bg-white dark:bg-darkbg-card dark:border-darkbg-border">
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] text-slate-400">#{tab.id.slice(-4)}</span>
                        <Badge variant="warning">{tab.tab_type || 'TABLE'}</Badge>
                      </div>
                      <h4 className="text-xs font-bold text-slate-800 dark:text-white">{tab.tab_name}</h4>
                      <p className="text-[10px] text-slate-400 mt-0.5">Opened by: {tab.opened_by}</p>
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t pt-2 border-slate-100 dark:border-darkbg-border/30">
                      <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                        Tsh. {tab.total.toLocaleString()}
                      </span>
                      <div className="flex gap-1.5">
                        <Button size="xs" variant="secondary" onClick={() => handleResumeTab(tab)}>Edit</Button>
                        <Button size="xs" variant="primary" onClick={() => {
                          setActiveTabId(tab.id);
                          handleResumeTab(tab).then(() => setIsCheckoutOpen(true));
                        }}>Pay</Button>
                        <Button size="xs" variant="outline" onClick={() => {
                          setActiveTabId(tab.id);
                          triggerSplitBill();
                        }}>Split</Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          /* Left side: Products search, Category navigation, Product grid */
          <div className="flex flex-1 flex-col space-y-3 overflow-hidden">
            {activeModule === 'Bar' && (
              <div className="pos-shift-banner open flex justify-between items-center py-2 px-3">
                {activeTabId ? (
                  <span>Editing Tab: <strong>{holdCartName || activeTabId}</strong></span>
                ) : (
                  <span>Quick order mode (no open tab)</span>
                )}
                <div className="flex gap-1.5">
                  <Button size="xs" variant="outline" onClick={() => {
                    setCart([]);
                    setActiveTabId(null);
                    setBarSubView('TABS');
                  }}>Back</Button>
                  <Button size="xs" variant="primary" onClick={() => handleSaveTab(holdCartName)}>
                    Save & Send
                  </Button>
                </div>
              </div>
            )}
          {/* Search bar with scan capability */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input 
              ref={searchInputRef}
              type="text"
              placeholder="F3: Scan barcode or search product SKU..."
              className="pl-9 h-9 w-full rounded-lg border border-slate-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-primary dark:border-darkbg-border dark:bg-darkbg dark:text-white"
              value={searchQuery}
              onChange={(e) => {
                const val = e.target.value;
                setSearchQuery(val);
                
                // Realtime scan exact match check
                const query = val.trim().toLowerCase();
                if (query.length >= 3) {
                  // Check simple products
                  const matchP = products.find(p => p.barcode?.toLowerCase() === query || p.sku?.toLowerCase() === query);
                  if (matchP && !matchP.hasVariants) {
                    handleItemAddition(matchP);
                    setSearchQuery('');
                    return;
                  }
                  // Check variants
                  const matchV = productVariants.find(v => v.barcode?.toLowerCase() === query || v.sku?.toLowerCase() === query);
                  if (matchV) {
                    const parent = products.find(p => p.id === matchV.productId);
                    if (parent) {
                      handleItemAddition(parent, matchV);
                      setSearchQuery('');
                    }
                  }
                }
              }}
            />
          </div>

          {/* Categories bar */}
          <div className="pos-category-bar scrollbar-none">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`pos-category-btn ${selectedCategory === cat ? 'active' : ''}`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Touch product cards grid */}
          <div className="flex-1 overflow-y-auto pr-1">
            {filteredProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 py-12 bg-white dark:bg-darkbg-card rounded-xl border border-dashed border-slate-200 dark:border-darkbg-border">
                <span className="text-3xl">📦</span>
                <p className="mt-2 text-xs italic">No items found matching the query.</p>
              </div>
            ) : (
              <div className="pos-product-grid">
                {filteredProducts.map(p => {
                  const isOut = p.stock <= 0 && activeModule !== 'SACCO';
                  return (
                    <div 
                      key={p.id}
                      onClick={() => !isOut && handleProductGridClick(p)}
                      className={`pos-product-card ${isOut ? 'out-of-stock' : ''}`}
                    >
                      <div>
                        <div className="flex justify-between items-center text-[9px] text-slate-400 font-semibold mb-1">
                          <span>{p.category}</span>
                          {p.hasVariants && <Badge variant="warning">Variants</Badge>}
                        </div>
                        <h4 className="text-xs font-bold text-slate-800 dark:text-white line-clamp-2">
                          {p.name}
                        </h4>
                      </div>

                      <div className="mt-3 flex items-baseline justify-between pt-2 border-t border-slate-100 dark:border-darkbg-border/30">
                        <div className="flex flex-col items-start">
                          {getProductPrice(p) < (p.sellingPrice || p.price || 0) && (
                            <span className="text-[9px] text-slate-400 line-through">
                              Tsh. {(p.sellingPrice || p.price).toLocaleString()}
                            </span>
                          )}
                          <span className="text-[11px] font-extrabold text-slate-900 dark:text-white">
                            Tsh. {getProductPrice(p).toLocaleString()}
                          </span>
                        </div>
                        <span className={`text-[9px] font-bold ${isOut ? 'text-danger' : 'text-slate-400'}`}>
                          {isOut ? 'Out of stock' : `${p.stock} units`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

        {/* Right side: Shopping Cart & checkout trigger */}
        <div className={`flex w-full flex-col border border-slate-200 bg-white rounded-xl shadow-sm dark:border-darkbg-border dark:bg-darkbg-card lg:w-[420px] xl:w-[460px] 2xl:w-[480px] shrink-0 overflow-hidden ${
          isMobileCartOpen 
            ? 'fixed inset-x-0 bottom-0 top-12 z-50 rounded-t-3xl border-t shadow-2xl flex dark:bg-darkbg-card lg:static lg:top-auto lg:z-auto lg:h-auto lg:rounded-xl lg:border lg:shadow-sm' 
            : 'hidden lg:flex'
        }`}>
          {/* Mobile Sheet Handle Bar */}
          <div className="lg:hidden w-full flex justify-center py-2 bg-slate-50 dark:bg-darkbg border-b border-slate-100 dark:border-darkbg-border/30">
            <div className="w-12 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
          </div>

          <div className="flex items-center justify-between border-b border-slate-100 p-4 dark:border-darkbg-border/30">
            <div className="flex items-center space-x-2">
              <ShoppingCart className="h-4.5 w-4.5 text-primary" />
              <span className="text-xs font-bold text-slate-800 dark:text-white">Shopping Cart</span>
              <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-black">
                {cart.reduce((sum, item) => sum + item.quantity, 0)} items
              </span>
            </div>
            <div className="flex items-center space-x-2">
              {cart.length > 0 && (
                <button onClick={handleClearCart} className="text-xs text-danger hover:underline font-semibold">
                  Clear All
                </button>
              )}
              {isMobileCartOpen && (
                <button 
                  onClick={() => setIsMobileCartOpen(false)}
                  className="lg:hidden p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>

          {/* Cart list scroll area — Maximized Vertical Height */}
          <div className="pos-cart-list p-3 space-y-2 flex-1 overflow-y-auto min-h-[180px]">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-2 py-12">
                <ShoppingCart className="h-10 w-10 text-slate-200 dark:text-slate-700 stroke-[1.5]" />
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Cart is empty</p>
                <p className="text-[10px] italic text-slate-400 text-center max-w-[200px]">Tap products from the catalog to add items to order.</p>
              </div>
            ) : (
              cart.map((item) => {
                const itemKey = item.variant ? item.variant.id : item.product.id;
                const price = item.variant?.sellingPrice || getProductPrice(item.product);
                const itemTotal = price * item.quantity;
                const label = item.variant 
                  ? `${item.product.name} (${Object.values(item.variant.attributes).join('/')})` 
                  : item.product.name;

                return (
                  <div key={itemKey} className="flex items-center justify-between rounded-xl border border-slate-100 p-2.5 bg-slate-50/70 dark:bg-darkbg/30 dark:border-darkbg-border/40 hover:border-slate-200 transition-all">
                    <div className="flex-1 min-w-0 pr-2">
                      <h5 className="text-xs font-bold text-slate-800 dark:text-white truncate">{label}</h5>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-slate-400">Tsh. {price.toLocaleString()} ea</span>
                        <span className="text-[10px] font-bold text-primary dark:text-primary-dark">Subtotal: Tsh. {itemTotal.toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1.5 shrink-0">
                      <button 
                        type="button"
                        onClick={() => updateQuantity(itemKey, -1)} 
                        className="h-7 w-7 flex items-center justify-center rounded-lg bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-darkbg-border dark:text-slate-200 dark:hover:bg-slate-700 transition"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="text-xs font-black w-6 text-center text-slate-900 dark:text-white">{item.quantity}</span>
                      <button 
                        type="button"
                        onClick={() => updateQuantity(itemKey, 1)} 
                        className="h-7 w-7 flex items-center justify-center rounded-lg bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-darkbg-border dark:text-slate-200 dark:hover:bg-slate-700 transition"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      <button 
                        type="button"
                        onClick={() => removeFromCart(itemKey)} 
                        className="h-7 w-7 flex items-center justify-center text-slate-400 hover:text-danger hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition ml-1"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Restaurant Tables Selector */}
          {activeModule === 'Restaurant' && (
            <div className="p-3 border-t border-slate-100 dark:border-darkbg-border/30">
              <label className="text-[10px] font-bold text-slate-500 uppercase">Select Table</label>
              <div className="pos-table-grid">
                {restaurantTables.map(t => (
                  <div 
                    key={t}
                    onClick={() => setSelectedTable(t === selectedTable ? '' : t)}
                    className={`pos-table-card ${t === selectedTable ? 'selected' : ''}`}
                  >
                    {t.slice(-2)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Customer Attachment Block */}
          <div className="border-t border-slate-100 p-3 space-y-2 dark:border-darkbg-border/30">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Customer Attachment
              </label>
              <button onClick={() => setIsAddCustomerOpen(true)} className="text-[10px] text-primary hover:underline font-bold flex items-center gap-1">
                <UserPlus className="h-3 w-3" /> Add
              </button>
            </div>
            <select
              id="customer-select"
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 text-xs px-2.5 dark:border-darkbg-border dark:bg-darkbg dark:text-white focus:outline-none"
            >
              <option value="">Walk-in Customer</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>
              ))}
            </select>

            {selectedCustomer && (
              <div className="p-2.5 bg-slate-50 dark:bg-darkbg/40 rounded-lg border border-slate-100 dark:border-darkbg-border/20 text-[10px] space-y-1 text-slate-500 dark:text-slate-400">
                <div className="flex justify-between">
                  <span>Loyalty Points:</span>
                  <span className="font-bold text-slate-800 dark:text-white">{selectedCustomer.loyaltyPoints} pts</span>
                </div>
                <div className="flex justify-between">
                  <span>Wallet Balance:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    Tsh. {(selectedCustomer.walletBalance || 0).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Outstanding Bal:</span>
                  <span className={`font-bold ${selectedCustomer.outstandingBalance > 0 ? 'text-amber-600' : 'text-slate-800 dark:text-white'}`}>
                    Tsh. {selectedCustomer.outstandingBalance.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Credit Limit:</span>
                  <span className="font-bold text-slate-800 dark:text-white">Tsh. {(selectedCustomer.creditLimit || 500000).toLocaleString()}</span>
                </div>
              </div>
            )}

            {/* Notes input */}
            <input 
              type="text"
              placeholder="Add order notes here..."
              className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 text-[10px] px-2.5 dark:border-darkbg-border dark:bg-darkbg dark:text-white focus:outline-none"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />

            {/* Controlled Drug Verification for Pharmacy */}
            {activeModule === 'Pharmacy' && cart.some(item => item.product.category === 'Antibiotics') && (
              <div className="flex items-center space-x-2 p-2 bg-amber-50 rounded-lg border border-amber-200/50 dark:bg-amber-950/20 dark:border-amber-900/40">
                <input 
                  type="checkbox" 
                  id="rxVerified"
                  checked={prescriptionApproved}
                  onChange={(e) => setPrescriptionApproved(e.target.checked)}
                  className="rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                />
                <label htmlFor="rxVerified" className="text-[10px] font-medium text-amber-800 dark:text-amber-400 cursor-pointer flex items-center gap-1">
                  <ShieldAlert className="h-3.5 w-3.5 animate-pulse text-amber-600" />
                  <span>Verified Prescription</span>
                </label>
              </div>
            )}
          </div>

          {/* Pricing Totals & Checkout Trigger */}
          <div className="bg-slate-50 border-t border-slate-100 p-4 space-y-3 dark:bg-darkbg-card dark:border-darkbg-border/30">
            <div className="space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="font-semibold text-slate-800 dark:text-white">Tsh. {cartSubtotal.toLocaleString()}</span>
              </div>
              
              {activeModule === 'Restaurant' && (
                <div className="flex justify-between">
                  <span>Service Charge (5%)</span>
                  <span className="font-semibold text-slate-800 dark:text-white">Tsh. {serviceCharge.toLocaleString()}</span>
                </div>
              )}

              <div className="flex justify-between">
                <span>Discount</span>
                {discountPercent > 0 ? (
                  <span className="text-success font-bold">- Tsh. {discountAmount.toLocaleString()} ({discountPercent}%)</span>
                ) : (
                  <span>Tsh. 0</span>
                )}
              </div>

              <div className="flex justify-between items-center relative">
                {/* Tax selector — clicking the label opens a dropdown */}
                <div className="relative">
                  <button
                    type="button"
                    id="tax-selector-btn"
                    onClick={() => setIsTaxDropdownOpen(o => !o)}
                    className="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-400 hover:text-primary transition-colors cursor-pointer select-none"
                  >
                    <span>
                      {selectedTaxRate === 0
                        ? 'Tax (0% — Exempt)'
                        : `Tax (${(selectedTaxRate * 100).toFixed(0)}% VAT)`}
                    </span>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 opacity-60" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.085l3.71-3.755a.75.75 0 111.08 1.04l-4.25 4.3a.75.75 0 01-1.08 0l-4.25-4.3a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                    </svg>
                  </button>

                  {isTaxDropdownOpen && (
                    <div
                      className="absolute left-0 bottom-full mb-1 z-50 bg-white dark:bg-darkbg-card border border-slate-200 dark:border-darkbg-border rounded-lg shadow-xl min-w-[180px] py-1 text-sm"
                    >
                      {TAX_OPTIONS.map(opt => (
                        <button
                          key={opt.rate}
                          type="button"
                          onClick={() => { setSelectedTaxRate(opt.rate); setIsTaxDropdownOpen(false); }}
                          className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-darkbg-hover transition-colors ${
                            selectedTaxRate === opt.rate
                              ? 'text-primary font-semibold'
                              : 'text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <span>{opt.label}</span>
                          {selectedTaxRate === opt.rate && (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-primary" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414L8.414 15l-4.121-4.121a1 1 0 111.414-1.414L8.414 12.172l7.879-7.879a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <span className="font-semibold text-slate-800 dark:text-white">
                  {selectedTaxRate === 0 ? '—' : `Tsh. ${taxAmount.toLocaleString()}`}
                </span>
              </div>

              <div className="flex justify-between border-t border-slate-100 pt-2 text-sm font-extrabold text-slate-900 dark:border-darkbg-border dark:text-white">
                <span>Total Payable</span>
                <span>Tsh. {cartTotal.toLocaleString()}</span>
              </div>
            </div>

            <div className="flex gap-2">
              <Button 
                variant="secondary" 
                className="w-1/3 h-10 text-xs font-bold" 
                disabled={cart.length === 0} 
                onClick={() => {
                  setHoldCartName(`Table-${Date.now().toString().slice(-4)}`);
                  setIsHoldModalOpen(true);
                }}
              >
                Hold
              </Button>
              <Button 
                variant="primary" 
                className="flex-1 h-10 text-xs font-black" 
                disabled={cart.length === 0} 
                onClick={() => {
                  if (!activeShift) {
                    alert('Cannot checkout. Must open shift first.');
                    setIsShiftOpenModalOpen(true);
                    return;
                  }
                  if (!validateCartStock()) return;
                  setCashReceived(cartTotal);
                  setSplitAmounts({
                    Cash: cartTotal,
                    MobileMoney: 0,
                    Card: 0,
                    Bank: 0,
                    StoreCredit: 0
                  });
                  setIsCheckoutOpen(true);
                }}
              >
                Pay (Tsh. {cartTotal.toLocaleString()})
              </Button>
            </div>
          </div>
        </div>

      </div>

      {/* Floating Mobile Cart Bar — Positioned above BottomNav (bottom-20) */}
      {cart.length > 0 && (
        <div className="lg:hidden fixed bottom-20 left-4 right-4 z-40 bg-slate-900 text-white rounded-2xl p-3 shadow-2xl flex items-center justify-between border border-slate-700 animate-in slide-in-from-bottom duration-200">
          <div className="flex items-center space-x-3">
            <div className="relative">
              <ShoppingCart className="h-6 w-6 text-primary" />
              <span className="absolute -top-2 -right-2 bg-primary text-white text-[10px] font-black h-4 w-4 rounded-full flex items-center justify-center">
                {cart.reduce((sum, item) => sum + item.quantity, 0)}
              </span>
            </div>
            <div>
              <div className="text-xs font-black text-white">Tsh. {cartTotal.toLocaleString()}</div>
              <div className="text-[10px] text-slate-400">
                {cart.reduce((sum, item) => sum + item.quantity, 0)} item(s) in cart
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setIsMobileCartOpen(!isMobileCartOpen)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold text-slate-200"
            >
              {isMobileCartOpen ? 'Hide' : 'View Cart'}
            </button>
            <button
              onClick={() => {
                if (!activeShift) {
                  alert('Cannot process sale without an active shift. Please open a shift first.');
                  setIsShiftOpenModalOpen(true);
                  return;
                }
                if (!validateCartStock()) return;
                setCashReceived(cartTotal);
                setSplitAmounts({
                  Cash: cartTotal,
                  MobileMoney: 0,
                  Card: 0,
                  Bank: 0,
                  StoreCredit: 0
                });
                setIsCheckoutOpen(true);
              }}
              className="px-4 py-1.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-xs font-black shadow-lg active:scale-95 transition"
            >
              Checkout
            </button>
          </div>
        </div>
      )}

      {/* Held Carts resuming button display */}
      {heldCarts.length > 0 && (
        <div className="flex items-center justify-between p-3 bg-indigo-50 border border-indigo-200/50 rounded-xl dark:bg-indigo-950/20 dark:border-indigo-900/40">
          <span className="text-xs font-bold text-indigo-800 dark:text-indigo-400">
            You have {heldCarts.length} suspended carts active in this shift.
          </span>
          <Button size="xs" variant="primary" onClick={() => setIsResumeModalOpen(true)}>
            Resume Cart
          </Button>
        </div>
      )}

      {/* --- Dialogs & Modals Implementation --- */}

      {/* 1. Open Shift Dialog */}
      <Dialog
        isOpen={isShiftOpenModalOpen}
        onClose={() => setIsShiftOpenModalOpen(false)}
        title="Open Daily POS Cashier Shift"
        description="Enter the starting cash drawer float to open register."
      >
        <form onSubmit={handleOpenShift} className="space-y-4">
          <Input 
            label="Opening Float Cash (Tsh.) *" 
            type="number"
            value={openingFloat}
            onChange={(e) => setOpeningFloat(Number(e.target.value))}
            required
          />
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="secondary" type="button" onClick={() => setIsShiftOpenModalOpen(false)}>Cancel</Button>
            <Button variant="primary" type="submit">Open Shift</Button>
          </div>
        </form>
      </Dialog>

      {/* 2. Reconcile & Close Shift Dialog */}
      <Dialog
        isOpen={isShiftCloseModalOpen}
        onClose={() => setIsShiftCloseModalOpen(false)}
        title="Close Register & Reconcile Shift"
        description="Enter actual cash counted in drawer to generate Z-Report."
      >
        {activeShift && (
          <form onSubmit={handleCloseShift} className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 dark:bg-darkbg rounded-lg">
              <div>Opening Float:</div>
              <div className="font-semibold text-right">Tsh. {(activeShift.opening_float || 0).toLocaleString()}</div>
              <div>Cash Sales:</div>
              <div className="font-semibold text-right text-success">Tsh. {(activeShift.cash_sales || 0).toLocaleString()}</div>
              <div>M-Pesa/Mobile Money Sales:</div>
              <div className="font-semibold text-right text-indigo-500">Tsh. {(activeShift.mpesa_sales || 0).toLocaleString()}</div>
              <div>Bank/Card Sales:</div>
              <div className="font-semibold text-right">Tsh. {(activeShift.bank_sales || 0).toLocaleString()}</div>
              <div>Cash In (Adjustments):</div>
              <div className="font-semibold text-right text-success">+ Tsh. {(activeShift.cash_in || 0).toLocaleString()}</div>
              <div>Cash Out (Vendor Payouts):</div>
              <div className="font-semibold text-right text-danger">- Tsh. {(activeShift.cash_out || 0).toLocaleString()}</div>
              <div className="border-t pt-2 font-bold text-slate-800 dark:text-white">Expected Cash in Drawer:</div>
              <div className="border-t pt-2 font-bold text-right text-slate-800 dark:text-white">
                Tsh. {((activeShift.opening_float || 0) + (activeShift.cash_sales || 0) + (activeShift.cash_in || 0) - (activeShift.cash_out || 0)).toLocaleString()}
              </div>
            </div>

            <Input 
              label="Actual Counted Cash (Tsh.) *" 
              type="number"
              value={closeCashActual}
              onChange={(e) => setCloseCashActual(Number(e.target.value))}
              required
            />

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="secondary" type="button" onClick={() => setIsShiftCloseModalOpen(false)}>Cancel</Button>
              <Button variant="primary" type="submit">Reconcile & Close</Button>
            </div>
          </form>
        )}
      </Dialog>

      {/* 3. Cash In / Out Dialog */}
      <Dialog
        isOpen={isCashInOutModalOpen}
        onClose={() => setIsCashInOutModalOpen(false)}
        title="Log Cash In / Out Transaction"
        description="Records manual cash insertions or removals from register."
      >
        <form onSubmit={handleCashInOutSubmit} className="space-y-4">
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
              <input type="radio" checked={cashInOutType === 'IN'} onChange={() => setCashInOutType('IN')} /> Cash In (Float Refill)
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
              <input type="radio" checked={cashInOutType === 'OUT'} onChange={() => setCashInOutType('OUT')} /> Cash Out (Vendor Payment / Safe Drop)
            </label>
          </div>

          <Input 
            label="Transaction Amount (Tsh.) *" 
            type="number"
            value={cashInOutAmount}
            onChange={(e) => setCashInOutAmount(Number(e.target.value))}
            required
          />

          <Input 
            label="Reason / Reference *" 
            placeholder="e.g. Buying milk supplier PO-12"
            value={cashInOutNotes}
            onChange={(e) => setCashInOutNotes(e.target.value)}
            required
          />

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="secondary" type="button" onClick={() => setIsCashInOutModalOpen(false)}>Cancel</Button>
            <Button variant="primary" type="submit">Log Transaction</Button>
          </div>
        </form>
      </Dialog>

      {/* 4. Suspend Cart Dialog */}
      <Dialog
        isOpen={isHoldModalOpen}
        onClose={() => setIsHoldModalOpen(false)}
        title="Suspend Sale Cart"
        description="Assign a table number or label to suspend this cart."
      >
        <form onSubmit={handleHoldCart} className="space-y-4">
          <Input 
            label="Cart Label / Name *" 
            value={holdCartName}
            onChange={(e) => setHoldCartName(e.target.value)}
            required
          />
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="secondary" type="button" onClick={() => setIsHoldModalOpen(false)}>Cancel</Button>
            <Button variant="primary" type="submit">Suspend Sale</Button>
          </div>
        </form>
      </Dialog>

      {/* 5. Resume Cart Dialog */}
      <Dialog
        isOpen={isResumeModalOpen}
        onClose={() => setIsResumeModalOpen(false)}
        title="Resume Suspended Sales Carts"
        description="Select a suspended cart to load it back into POS terminal."
      >
        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
          {heldCarts.length === 0 ? (
            <div className="text-xs italic text-slate-400 text-center py-6">No suspended carts found.</div>
          ) : (
            heldCarts.map(h => (
              <div key={h.id} className="flex justify-between items-center p-3 border rounded-lg hover:bg-slate-50 dark:hover:bg-darkbg bg-white dark:bg-darkbg-card dark:border-darkbg-border">
                <div className="text-xs">
                  <span className="font-bold text-slate-800 dark:text-white">{h.name}</span>
                  <span className="block text-[10px] text-slate-400">
                    {h.items.length} items • Tsh. {h.items.reduce((s,i) => s + (i.price || 0)*i.quantity, 0).toLocaleString()}
                  </span>
                </div>
                <Button size="xs" variant="primary" onClick={() => handleResumeCart(h.id)}>Resume</Button>
              </div>
            ))
          )}
        </div>
        <div className="flex justify-end pt-4 border-t mt-4">
          <Button variant="secondary" onClick={() => setIsResumeModalOpen(false)}>Cancel</Button>
        </div>
      </Dialog>

      {/* 6. Returns & Exchanges Dialog */}
      <Dialog
        isOpen={isReturnsModalOpen}
        onClose={() => {
          setIsReturnsModalOpen(false);
          setActiveTab('POS');
        }}
        title="Refunds, Returns & Exchanges Hub"
        description="Load an order to refund items or issue store credit."
      >
        <div className="space-y-4">
          <form onSubmit={handleLoadOrderToReturn} className="flex gap-2">
            <Input 
              placeholder="Scan or enter Order ID..." 
              value={returnOrderId}
              onChange={(e) => setReturnOrderId(e.target.value)}
              className="flex-1"
            />
            <Button variant="primary" type="submit">Load Order</Button>
          </form>

          {selectedOrderToReturn ? (
            <div className="space-y-4 text-xs">
              <div className="p-3 bg-slate-50 dark:bg-darkbg rounded-lg border dark:border-darkbg-border">
                <div className="flex justify-between font-bold">
                  <span>Order: {selectedOrderToReturn.id}</span>
                  <span>Total: Tsh. {selectedOrderToReturn.total.toLocaleString()}</span>
                </div>
                <span className="text-[10px] text-slate-400">Date: {new Date(selectedOrderToReturn.timestamp).toLocaleString()}</span>
              </div>

              <div className="space-y-2">
                <div className="font-bold">Select quantities to return:</div>
                {selectedOrderToReturn.items.map((item: any) => {
                  const key = item.variantId || item.productId;
                  const currentReturned = returnItems[key] || 0;
                  return (
                    <div key={key} className="flex items-center justify-between p-2 border-b dark:border-darkbg-border">
                      <div>
                        <span className="font-semibold block">{item.name}</span>
                        <span className="text-[10px] text-slate-400">Purchased Qty: {item.quantity}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => setReturnItems(prev => ({ ...prev, [key]: Math.max(0, currentReturned - 1) }))}
                          className="p-1 rounded bg-slate-200 text-slate-600 dark:bg-darkbg-border dark:text-slate-300"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="font-bold w-4 text-center">{currentReturned}</span>
                        <button 
                          onClick={() => setReturnItems(prev => ({ ...prev, [key]: Math.min(item.quantity, currentReturned + 1) }))}
                          className="p-1 rounded bg-slate-200 text-slate-600 dark:bg-darkbg-border dark:text-slate-300"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button variant="secondary" onClick={() => setSelectedOrderToReturn(null)}>Clear</Button>
                <Button variant="primary" onClick={executeReturn} disabled={Object.values(returnItems).every(q => q === 0)}>
                  Confirm Return & Restock
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-400 block mb-1">Recent Orders:</span>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {pastOrders.map(o => (
                  <div 
                    key={o.id}
                    onClick={() => {
                      setSelectedOrderToReturn(o);
                      setReturnOrderId(o.id);
                      const initialQtys: Record<string, number> = {};
                      o.items.forEach((item: any) => {
                        initialQtys[item.variantId || item.productId] = 0;
                      });
                      setReturnItems(initialQtys);
                    }}
                    className="flex justify-between items-center p-2 border rounded-md cursor-pointer hover:bg-slate-50 dark:hover:bg-darkbg bg-white dark:bg-darkbg-card dark:border-darkbg-border text-xs"
                  >
                    <span><strong>{o.id}</strong> • {o.items.length} items</span>
                    <span className="font-bold">Tsh. {o.total.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Dialog>

      {/* 12. Sales History Dialog */}
      <Dialog
        isOpen={isHistoryModalOpen}
        onClose={() => {
          setIsHistoryModalOpen(false);
          setActiveTab('POS');
        }}
        title="Completed Sales History Ledger"
        description="Browse completed transactions, receipts, and order statuses."
        size="lg"
      >
        <div className="space-y-4">
          <div className="max-h-96 overflow-y-auto space-y-2 pr-1">
            {pastOrders.length === 0 ? (
              <div className="text-xs italic text-slate-400 text-center py-8">No completed orders found in this branch.</div>
            ) : (
              pastOrders.map(o => (
                <div key={o.id} className="p-3 border rounded-xl bg-slate-50 dark:bg-darkbg-card dark:border-darkbg-border space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="font-extrabold text-slate-800 dark:text-white">{o.id}</span>
                    <span className="text-[10px] text-slate-400">{new Date(o.timestamp).toLocaleString()}</span>
                  </div>
                  
                  <div className="border-t border-slate-200/50 dark:border-darkbg-border/30 pt-1.5 space-y-1">
                    {o.items.map((item: any, idx: number) => (
                      <div key={idx} className="flex justify-between text-[11px]">
                        <span className="text-slate-600 dark:text-slate-300">{item.name} x {item.quantity}</span>
                        <span className="font-semibold text-slate-800 dark:text-white">Tsh. {(item.price * item.quantity).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-between items-center border-t border-slate-200/50 dark:border-darkbg-border/30 pt-1.5 font-bold">
                    <span>Pay Type: <span className="text-primary">{o.paymentMethod}</span></span>
                    <span className="text-slate-900 dark:text-white">Total: Tsh. {o.total.toLocaleString()}</span>
                  </div>

                  <div className="flex justify-end gap-2 pt-1 border-t mt-1">
                    <Button 
                      size="xs" 
                      variant="outline" 
                      onClick={() => {
                        setLastCompletedOrder(o);
                        setIsReceiptOpen(true);
                      }}
                    >
                      Reprint Receipt
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="flex justify-end pt-4 border-t">
            <Button variant="secondary" onClick={() => {
              setIsHistoryModalOpen(false);
              setActiveTab('POS');
            }}>Close</Button>
          </div>
        </div>
      </Dialog>

      {/* 7. Supervisor Authentication Dialog */}
      <Dialog
        isOpen={isSupervisorModalOpen}
        onClose={() => setIsSupervisorModalOpen(false)}
        title="Supervisor Credentials Verification"
        description={`This action requires supervisor override: ${supervisorReason}`}
      >
        <form onSubmit={handleVerifySupervisor} className="space-y-4">
          <Input 
            label="Supervisor PIN / Access Password *" 
            type="password"
            placeholder="••••"
            value={supervisorPin}
            onChange={(e) => setSupervisorPin(e.target.value)}
            required
          />
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="secondary" type="button" onClick={() => setIsSupervisorModalOpen(false)}>Cancel</Button>
            <Button variant="primary" type="submit">Verify & Authorize</Button>
          </div>
        </form>
      </Dialog>

      {/* 8. Checkout Payment Confirmation Dialog */}
      <Dialog
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        title="POS Payment Reconciliation"
        description="Select payment route & count change due."
      >
        <div className="space-y-4">
          {/* Order Summary */}
          <div className="p-3 bg-slate-50 dark:bg-darkbg border rounded-lg text-xs space-y-1.5 dark:border-darkbg-border">
            <div className="flex justify-between">
              <span>Total Items:</span>
              <span className="font-bold">{cart.reduce((s,i)=>s+i.quantity,0)}</span>
            </div>
            {selectedCustomer && (
              <div className="flex justify-between">
                <span>Customer:</span>
                <span className="font-bold">{selectedCustomer.name}</span>
              </div>
            )}
            {selectedTable && (
              <div className="flex justify-between text-indigo-500">
                <span>Restaurant Table:</span>
                <span className="font-bold">{selectedTable}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-extrabold text-slate-800 dark:text-white pt-2 border-t">
              <span>Grand Total:</span>
              <span className="text-primary dark:text-primary-dark">Tsh. {cartTotal.toLocaleString()}</span>
            </div>
          </div>

          {/* Backdated POS Transaction Date Selection */}
          {!((securitySetting?.config || DEFAULT_SECURITY_CONFIG) as SecurityConfig).allowBackdatedSales ? (
            <div className="p-3 bg-slate-100 dark:bg-darkbg/40 border rounded-lg text-xs text-slate-400 dark:border-darkbg-border/60 flex items-center gap-1.5">
              <ShieldAlert size={12} className="text-slate-400" />
              <span>Backdated sales are disabled by policy.</span>
            </div>
          ) : (
            <div className="p-3 bg-slate-50 dark:bg-darkbg border rounded-lg text-xs space-y-1.5 dark:border-darkbg-border">
              <div className="flex justify-between items-center">
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Transaction Date</label>
                {!['Super Admin', 'Business Owner', 'Tenant Owner', 'Branch Manager'].includes(user?.role || '') && (
                  <span className="text-[9px] bg-amber-50 dark:bg-amber-950/40 text-amber-500 px-1 py-0.5 rounded font-bold">Requires Approval</span>
                )}
              </div>
              <input
                type="datetime-local"
                className="h-9 w-full rounded-lg border border-slate-200 bg-white text-xs px-2 focus:outline-none dark:border-darkbg-border dark:bg-darkbg dark:text-white"
                value={backdatedTransactionDate}
                onChange={(e) => setBackdatedTransactionDate(e.target.value)}
              />
              <span className="text-[9px] text-slate-400">Leave blank for current system time.</span>
            </div>
          )}

          {/* Payment Method Option */}
          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5 uppercase">Payment Channel</label>
            <div className="grid grid-cols-3 gap-2">
              {(activeModule === 'Retail'
                ? ['Cash', 'MobileMoney', 'Card', 'Bank', 'Credit', 'StoreCredit', 'Wallet', 'Split']
                : ['Cash', 'MobileMoney', 'Card', 'Bank', 'Credit', 'StoreCredit', 'Split']
              ).map(m => (
                <button
                  key={m}
                  onClick={() => {
                    if (m === 'Credit' && !selectedCustomerId) {
                      alert('A registered customer must be attached for Credit Sales.');
                      return;
                    }
                    if (m === 'Wallet' && !selectedCustomerId) {
                      alert('A registered customer must be attached for Wallet checkouts.');
                      return;
                    }
                    setPaymentMethod(m);
                    if (m === 'Split') {
                      setSplitAmounts({
                        Cash: cartTotal,
                        MobileMoney: 0,
                        Card: 0,
                        Bank: 0,
                        StoreCredit: 0
                      });
                    }
                  }}
                  className={`p-2 border rounded-lg text-center text-xs font-bold transition ${
                    paymentMethod === m 
                      ? 'border-primary bg-primary/5 text-primary dark:border-primary-dark dark:bg-primary-dark/10'
                      : 'border-slate-200 text-slate-500 dark:border-darkbg-border'
                  }`}
                >
                  {m === 'MobileMoney' ? 'Mobile Money' : m === 'Credit' ? 'Credit Sale' : m === 'StoreCredit' ? 'Store Credit' : m}
                </button>
              ))}
            </div>
          </div>

          {/* Payment breakdowns depending on payment method */}
          {paymentMethod === 'Wallet' && selectedCustomer && (
            <div className="p-3 bg-emerald-50 border border-emerald-200/50 rounded-lg text-xs flex justify-between font-bold text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-900/40 dark:text-emerald-400">
              <span>Customer Wallet Balance:</span>
              <span>Tsh. {(selectedCustomer.walletBalance || 0).toLocaleString()}</span>
            </div>
          )}
          {paymentMethod === 'Wallet' && !selectedCustomer && (
            <div className="p-3 bg-red-50 border border-red-200/50 rounded-lg text-xs font-bold text-red-700 dark:bg-red-950/20 dark:border-red-900/40 dark:text-red-400">
              ⚠️ Please select a customer to pay from their wallet.
            </div>
          )}

          {paymentMethod === 'Cash' && (
            <div className="space-y-3">
              <Input 
                label="Cash Received (Tsh.) *" 
                type="number"
                value={cashReceived}
                onChange={(e) => setCashReceived(Number(e.target.value))}
                required
              />
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setCashReceived(cartTotal)}
                  className="px-2.5 py-1 bg-slate-100 dark:bg-darkbg-border text-slate-700 dark:text-slate-200 text-[10px] font-bold rounded-lg hover:bg-slate-200 transition cursor-pointer"
                >
                  Exact Amount
                </button>
                {[1000, 2000, 5000, 10000, 20000, 50000, 100000].map(amt => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setCashReceived(amt >= cartTotal ? amt : Math.ceil(cartTotal / amt) * amt)}
                    className="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-[10px] font-mono font-bold rounded-lg hover:bg-indigo-100 transition cursor-pointer"
                  >
                    Tsh {amt.toLocaleString()}
                  </button>
                ))}
              </div>
              {cashReceived >= cartTotal && cartTotal > 0 && (
                <div className="p-3 bg-emerald-50 border border-emerald-200/50 rounded-lg text-xs flex justify-between items-center font-bold text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-900/40 dark:text-emerald-400">
                  <span className="flex items-center gap-1">💰 Change Due:</span>
                  <span className="text-sm font-black">Tsh. {changeDue.toLocaleString()}</span>
                </div>
              )}
            </div>
          )}

          {paymentMethod === 'Split' && (
            <div className="pos-split-inputs space-y-2">
              <span className="text-[10px] font-bold uppercase text-slate-400">Split Breakdown (Sum must equal cart total):</span>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex flex-col gap-1">
                  <label>Cash (Tsh.)</label>
                  <input type="number" className="p-1 border rounded bg-white dark:bg-darkbg dark:border-darkbg-border dark:text-white" value={splitAmounts.Cash} onChange={(e) => setSplitAmounts(prev => ({ ...prev, Cash: Number(e.target.value) }))} />
                </div>
                <div className="flex flex-col gap-1">
                  <label>Mobile Money (Tsh.)</label>
                  <input type="number" className="p-1 border rounded bg-white dark:bg-darkbg dark:border-darkbg-border dark:text-white" value={splitAmounts.MobileMoney} onChange={(e) => setSplitAmounts(prev => ({ ...prev, MobileMoney: Number(e.target.value) }))} />
                </div>
                <div className="flex flex-col gap-1">
                  <label>Bank/Card (Tsh.)</label>
                  <input type="number" className="p-1 border rounded bg-white dark:bg-darkbg dark:border-darkbg-border dark:text-white" value={splitAmounts.Card} onChange={(e) => setSplitAmounts(prev => ({ ...prev, Card: Number(e.target.value) }))} />
                </div>
                <div className="flex flex-col gap-1">
                  <label>Store Credit (Tsh.)</label>
                  <input type="number" className="p-1 border rounded bg-white dark:bg-darkbg dark:border-darkbg-border dark:text-white" value={splitAmounts.StoreCredit} onChange={(e) => setSplitAmounts(prev => ({ ...prev, StoreCredit: Number(e.target.value) }))} />
                </div>
              </div>
              <div className="flex justify-between font-bold text-xs pt-1 border-t">
                <span>Sum Entered: Tsh. {splitTotalEntered.toLocaleString()}</span>
                <span className={Math.abs(splitTotalEntered - cartTotal) < 0.01 ? 'text-success' : 'text-danger'}>
                  {Math.abs(splitTotalEntered - cartTotal) < 0.01 ? 'Matches Total' : `Remaining: Tsh. ${(cartTotal - splitTotalEntered).toLocaleString()}`}
                </span>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="secondary" onClick={() => setIsCheckoutOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleCheckout}>Complete Sale</Button>
          </div>
        </div>
      </Dialog>

      {/* 9. Thermal Receipt Dialog */}
      <Dialog
        isOpen={isReceiptOpen}
        onClose={() => setIsReceiptOpen(false)}
        title="Electronic & Thermal Receipt Printer"
        description="Print mockup thermal slip or send SMS/email slip."
      >
        {lastCompletedOrder && (
          <div className="space-y-4">
            <div className="receipt-paper">
              <div className="receipt-header">
                <div className="flex justify-center mb-1.5">
                  <img src="/kwakopos-logo.png" alt="KwakoPos Logo" className="h-9 w-auto object-contain" />
                </div>
                <h4>{currentTenant.name.toUpperCase()}</h4>
                <p className="text-[10px] m-0">Branch: {currentBranch.name}</p>
                <p className="text-[9px] m-0">TRA TIN: 123-456-789</p>
                <p className="text-[9px] m-0">Receipt ID: {lastCompletedOrder.id}</p>
              </div>

              <div className="receipt-divider" />

              <div className="space-y-1">
                {lastCompletedOrder.items.map((item: any, idx: number) => (
                  <div key={idx} className="receipt-item">
                    <span>{item.name} x {item.quantity}</span>
                    <span>Tsh. {(item.price * item.quantity).toLocaleString()}</span>
                  </div>
                ))}
              </div>

              <div className="receipt-divider" />

              <div className="receipt-totals text-right">
                <div><span>Subtotal:</span><span>Tsh. {(lastCompletedOrder.total - lastCompletedOrder.tax).toLocaleString()}</span></div>
                {lastCompletedOrder.tax > 0 && (
                  <div><span>VAT Tax ({(selectedTaxRate * 100).toFixed(0)}%):</span><span>Tsh. {lastCompletedOrder.tax.toLocaleString()}</span></div>
                )}
                <div className="grand-total font-bold text-base"><span>TOTAL PAID:</span><span>Tsh. {lastCompletedOrder.total.toLocaleString()}</span></div>
              </div>

              <div className="receipt-divider" />

              <div className="text-center text-[8px] space-y-1">
                <p>CUSTOMER RECEIPT</p>
                <p>Powered by DukaPos Business Operating System</p>
                <p className="font-semibold">{new Date(lastCompletedOrder.timestamp).toLocaleString()}</p>
              </div>
            </div>

            <div className="flex justify-center gap-2 pt-2 border-t">
              <Button variant="secondary" onClick={() => {
                alert('Receipt print request sent.');
                setIsReceiptOpen(false);
              }}>Print 80mm</Button>
              <Button variant="secondary" onClick={() => {
                alert('SMS Receipt dispatched successfully.');
                setIsReceiptOpen(false);
              }}>Send SMS</Button>
              <Button variant="primary" onClick={() => setIsReceiptOpen(false)}>Done</Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* 10. Quick Add Customer Dialog */}
      <Dialog
        isOpen={isAddCustomerOpen}
        onClose={() => setIsAddCustomerOpen(false)}
        title="Register Walk-in Customer"
        description="Save profiles locally for loyalty award calculations."
      >
        <form onSubmit={handleAddCustomer} className="space-y-4">
          <Input 
            label="Customer Name *" 
            value={newCustomerName}
            onChange={(e) => setNewCustomerName(e.target.value)}
            required
          />
          <Input 
            label="Phone Number *" 
            value={newCustomerPhone}
            onChange={(e) => setNewCustomerPhone(e.target.value)}
            required
          />
          <Input 
            label="Email Address" 
            value={newCustomerEmail}
            onChange={(e) => setNewCustomerEmail(e.target.value)}
          />

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="secondary" type="button" onClick={() => setIsAddCustomerOpen(false)}>Cancel</Button>
            <Button variant="primary" type="submit">Register Customer</Button>
          </div>
        </form>
      </Dialog>

      {/* 11. Keyboard Shortcuts Help Dialog */}
      <Dialog
        isOpen={isShortcutsHelpOpen}
        onClose={() => setIsShortcutsHelpOpen(false)}
        title="POS Hotkeys Registry"
        description="Physical keyboard shortcuts mapped for rapid checkouts."
      >
        <div className="space-y-2 text-xs">
          <div className="flex justify-between border-b py-1"><span>New Sale / Clear Cart:</span><kbd className="pos-hotkey-kbd">F1</kbd></div>
          <div className="flex justify-between border-b py-1"><span>Focus Customer Search:</span><kbd className="pos-hotkey-kbd">F2</kbd></div>
          <div className="flex justify-between border-b py-1"><span>Focus Barcode/Product Input:</span><kbd className="pos-hotkey-kbd">F3</kbd></div>
          <div className="flex justify-between border-b py-1"><span>Hold / Suspend Cart:</span><kbd className="pos-hotkey-kbd">F4</kbd></div>
          <div className="flex justify-between border-b py-1"><span>Resume Held Cart:</span><kbd className="pos-hotkey-kbd">F5</kbd></div>
          <div className="flex justify-between border-b py-1"><span>Cycle Discount Levels:</span><kbd className="pos-hotkey-kbd">F6</kbd></div>
          <div className="flex justify-between border-b py-1"><span>Open Payments Dialogue:</span><kbd className="pos-hotkey-kbd">F7</kbd></div>
          <div className="flex justify-between border-b py-1"><span>Reprint Last Thermal Slip:</span><kbd className="pos-hotkey-kbd">F8</kbd></div>
          <div className="flex justify-between border-b py-1"><span>Close Dialogs / Void cart:</span><kbd className="pos-hotkey-kbd">ESC</kbd></div>
        </div>
        <div className="flex justify-end pt-4 border-t mt-4">
          <Button variant="primary" onClick={() => setIsShortcutsHelpOpen(false)}>Got it</Button>
        </div>
      </Dialog>

      {/* --- Multi-Variant Selection Dialog --- */}
      <Dialog
        isOpen={selectedParentForVariants !== null}
        onClose={() => { setSelectedParentForVariants(null); setVariantQuantities({}); }}
        title={`Add Variants: ${selectedParentForVariants?.name}`}
        description="Specify quantities for one or multiple variants to add at once:"
      >
        <div style={{ maxHeight: '60vh', overflowY: 'auto' }} className="space-y-3 pr-1">
          <table className="w-full text-xs text-left" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr className="border-b text-[10px] uppercase text-slate-400 font-bold">
                <th className="pb-2">Variant / Attribute</th>
                <th className="pb-2 text-right">Price (Tsh.)</th>
                <th className="pb-2 text-center">Stock</th>
                <th className="pb-2 text-center" style={{ width: '80px' }}>Select</th>
              </tr>
            </thead>
            <tbody>
              {variantsList.map(v => {
                const label = Object.values(v.attributes).join(' / ');
                const price = v.sellingPrice || selectedParentForVariants?.sellingPrice || selectedParentForVariants?.price || 0;
                const isOut = v.stock <= 0 && activeModule !== 'SACCO';
                const currentQty = variantQuantities[v.id] || 0;

                return (
                  <tr key={v.id} className="border-b hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 font-medium">
                      <div>{label}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{v.sku || 'No SKU'}</div>
                    </td>
                    <td className="py-2.5 text-right font-semibold">
                      {price.toLocaleString()}
                    </td>
                    <td className="py-2.5 text-center">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${v.stock > 5 ? 'bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400' : v.stock > 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400' : 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400'}`}>
                        {v.stock}
                      </span>
                    </td>
                    <td className="py-2.5 text-center">
                      {isOut ? (
                        <span className="text-[10px] text-danger font-semibold uppercase">Out of stock</span>
                      ) : (
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary dark:border-darkbg-border dark:bg-darkbg"
                          style={{ cursor: 'pointer' }}
                          checked={currentQty > 0}
                          onChange={(e) => {
                            setVariantQuantities(prev => ({
                              ...prev,
                              [v.id]: e.target.checked ? 1 : 0
                            }));
                          }}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end gap-2 pt-4 border-t mt-4">
          <Button
            variant="secondary"
            onClick={() => { setSelectedParentForVariants(null); setVariantQuantities({}); }}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              if (!selectedParentForVariants) return;
              handleBulkItemsAddition(selectedParentForVariants, variantQuantities);
            }}
          >
            Add Selected ({Object.values(variantQuantities).filter(q => q > 0).length} selected)
          </Button>
        </div>
      </Dialog>

      {/* 9. Create New Bar Tab Dialog */}
      <Dialog
        isOpen={isNewTabModalOpen}
        onClose={() => setIsNewTabModalOpen(false)}
        title="Create New Bar Tab"
        description="Initialize a persistent tab for a table or customer."
      >
        <div className="space-y-4 pt-2">
          <Input 
            label="Tab Name *" 
            value={tabNameInput}
            onChange={(e) => setTabNameInput(e.target.value)}
            placeholder="e.g. Table 5 VIP, Juma Credit"
            required
          />
          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5 uppercase">Tab Type</label>
            <div className="grid grid-cols-5 gap-2">
              {(['TABLE', 'CUSTOMER', 'VIP', 'CREDIT', 'MOBILE'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTabTypeInput(t)}
                  className={`p-1.5 border rounded-lg text-center text-[10px] font-bold transition ${
                    tabTypeInput === t 
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-slate-200 text-slate-500'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="secondary" onClick={() => setIsNewTabModalOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={async () => {
              if (!tabNameInput.trim()) {
                alert('Please enter a tab name.');
                return;
              }
              setIsNewTabModalOpen(false);
              if (cart.length > 0) {
                await handleSaveTab(tabNameInput, tabTypeInput);
              } else {
                const tabId = `tab-${Date.now()}`;
                await db.tabs.add({
                  id: tabId,
                  tenant_id: currentTenant.id,
                  customer_id: selectedCustomerId || undefined,
                  table_id: selectedTable || undefined,
                  tab_name: tabNameInput,
                  tab_type: tabTypeInput,
                  status: 'OPEN',
                  opened_by: user?.name || 'Bartender',
                  opened_at: Date.now(),
                  items: [],
                  total: 0,
                  total_amount: 0
                });
                if (selectedTable) {
                  const matchingTable = barTables.find(tb => tb.name === selectedTable);
                  if (matchingTable) {
                    await db.barTables.update(matchingTable.id, { status: 'OCCUPIED' });
                  }
                }
                setActiveTabId(tabId);
                setHoldCartName(tabNameInput);
                setCart([]);
                setBarSubView('POS');
              }
            }}>
              Open Tab
            </Button>
          </div>
        </div>
      </Dialog>

      {/* 10. Split Tab Bill Dialog */}
      <Dialog
        isOpen={isSplitBillModalOpen}
        onClose={() => setIsSplitBillModalOpen(false)}
        title="Split Tab Bill"
        description="Configure how you want to split this tab's payment."
      >
        <div className="space-y-4 pt-2 text-xs">
          <div className="flex gap-4 border-b pb-3">
            <button
              type="button"
              onClick={() => setSplitBillMethod('EQUALLY')}
              className={`flex-1 py-2 text-center rounded-lg border font-bold ${
                splitBillMethod === 'EQUALLY' ? 'border-primary bg-primary/5 text-primary' : 'border-slate-200 text-slate-500'
              }`}
            >
              🧮 Split Equally
            </button>
            <button
              type="button"
              onClick={() => {
                setSplitBillMethod('BY_ITEM');
                setSelectedItemsForSplit({});
              }}
              className={`flex-1 py-2 text-center rounded-lg border font-bold ${
                splitBillMethod === 'BY_ITEM' ? 'border-primary bg-primary/5 text-primary' : 'border-slate-200 text-slate-500'
              }`}
            >
              🍹 Split By Item
            </button>
          </div>

          {splitBillMethod === 'EQUALLY' ? (
            <div className="space-y-3">
              <Input 
                label="Number of Splits *" 
                type="number"
                min="2"
                value={splitCount}
                onChange={(e) => {
                  const val = Math.max(2, Number(e.target.value));
                  setSplitCount(val);
                }}
              />
              <Button size="xs" variant="outline" onClick={triggerSplitBill}>Calculate Splits</Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[11px] text-slate-400">Select items from the tab to split into the first checkout part.</p>
              {(() => {
                const activeTabObj = openTabs.find(t => t.id === activeTabId);
                if (!activeTabObj) return null;
                return (
                  <div className="space-y-2 border rounded-lg p-2 max-h-48 overflow-y-auto">
                    {activeTabObj.items.map(item => {
                      const pId = item.product_id;
                      const qtySelected = selectedItemsForSplit[pId] || 0;
                      return (
                        <div key={pId} className="flex justify-between items-center py-1 border-b last:border-0">
                          <span className="font-semibold truncate max-w-xs">Product ID: {pId.slice(-6)} (Tsh. {item.price.toLocaleString()})</span>
                          <div className="flex items-center gap-1.5">
                            <button 
                              type="button"
                              className="w-5 h-5 bg-slate-100 dark:bg-slate-800 rounded flex items-center justify-center font-bold"
                              onClick={() => setSelectedItemsForSplit(prev => ({
                                ...prev,
                                  [pId]: Math.max(0, qtySelected - 1)
                              }))}
                            >-</button>
                            <span className="w-4 text-center font-bold">{qtySelected} / {item.quantity}</span>
                            <button 
                              type="button"
                              className="w-5 h-5 bg-slate-100 dark:bg-slate-800 rounded flex items-center justify-center font-bold"
                              onClick={() => setSelectedItemsForSplit(prev => ({
                                ...prev,
                                  [pId]: Math.min(item.quantity, qtySelected + 1)
                              }))}
                            >+</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              <Button size="xs" variant="outline" onClick={triggerSplitBill}>Calculate Splits</Button>
            </div>
          )}

          {splitBillParts.length > 0 && (
            <div className="space-y-2 pt-3 border-t">
              <h4 className="font-bold text-slate-800 dark:text-white">Generated Split Payments:</h4>
              <div className="space-y-1.5">
                {splitBillParts.map((part) => (
                  <div 
                    key={part.index}
                    onClick={() => setSelectedSplitIndex(part.index)}
                    className={`flex justify-between items-center p-2 rounded-lg border cursor-pointer ${
                      selectedSplitIndex === part.index ? 'border-primary bg-primary/5' : 'border-slate-200'
                    }`}
                  >
                    <span className="font-semibold">{part.desc}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 dark:text-white">Tsh. {part.amount.toLocaleString()}</span>
                      <Button size="xs" onClick={async (e) => {
                        e.stopPropagation();
                        setCart([{
                          product: {
                            id: `split-${part.index}`,
                            name: part.desc,
                            sellingPrice: part.amount,
                            price: part.amount,
                            stock: 9999,
                            hasVariants: false,
                            category: 'Split Payment',
                            tenant_id: currentTenant.id
                          } as any,
                          quantity: 1
                        }]);
                        setIsSplitBillModalOpen(false);
                        setIsCheckoutOpen(true);
                      }}>Pay</Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t mt-4">
            <Button variant="secondary" onClick={() => setIsSplitBillModalOpen(false)}>Close</Button>
          </div>
        </div>
      </Dialog>

      {/* 13. Interactive Cash Register & Shift Reconciliation Dashboard */}
      <Dialog
        isOpen={isShiftHistoryDashboardOpen}
        onClose={() => setIsShiftHistoryDashboardOpen(false)}
        title="Interactive Cash Register & Shift Reconciliation Dashboard"
        description="Monitor active drawer registers, cash adjustments, and historical shift logs."
        size="lg"
      >
        <div className="space-y-6 max-h-[75vh] overflow-y-auto pr-1 text-xs">
          {/* Active Shift Card */}
          {activeShift ? (
            <div className="bg-slate-50 dark:bg-darkbg p-4 rounded-xl border border-slate-200 dark:border-darkbg-border space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h4 className="font-bold text-slate-800 dark:text-white text-sm">Active Cash Register Drawer</h4>
                  <p className="text-[10px] text-slate-400">Cashier: {activeShift.cashier_name} • Opened: {new Date(activeShift.opening_time).toLocaleString()}</p>
                </div>
                <Badge variant="success">Active Register</Badge>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="bg-white dark:bg-darkbg-card p-2.5 rounded border dark:border-darkbg-border">
                  <span className="text-[9px] text-slate-400 font-bold block uppercase">Opening Float</span>
                  <span className="text-sm font-extrabold text-slate-800 dark:text-white">Tsh. {(activeShift.opening_float || 0).toLocaleString()}</span>
                </div>
                <div className="bg-white dark:bg-darkbg-card p-2.5 rounded border dark:border-darkbg-border">
                  <span className="text-[9px] text-slate-400 font-bold block uppercase">Cash Sales</span>
                  <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">Tsh. {(activeShift.cash_sales || 0).toLocaleString()}</span>
                </div>
                <div className="bg-white dark:bg-darkbg-card p-2.5 rounded border dark:border-darkbg-border">
                  <span className="text-[9px] text-slate-400 font-bold block uppercase">Mobile Money</span>
                  <span className="text-sm font-extrabold text-indigo-500">Tsh. {(activeShift.mpesa_sales || 0).toLocaleString()}</span>
                </div>
                <div className="bg-white dark:bg-darkbg-card p-2.5 rounded border dark:border-darkbg-border">
                  <span className="text-[9px] text-slate-400 font-bold block uppercase">Bank/Card Sales</span>
                  <span className="text-sm font-extrabold text-slate-800 dark:text-white">Tsh. {(activeShift.bank_sales || 0).toLocaleString()}</span>
                </div>
                <div className="bg-white dark:bg-darkbg-card p-2.5 rounded border dark:border-darkbg-border">
                  <span className="text-[9px] text-slate-400 font-bold block uppercase">Cash In (Float Refills)</span>
                  <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">+ Tsh. {(activeShift.cash_in || 0).toLocaleString()}</span>
                </div>
                <div className="bg-white dark:bg-darkbg-card p-2.5 rounded border dark:border-darkbg-border">
                  <span className="text-[9px] text-slate-400 font-bold block uppercase">Cash Out (Payouts)</span>
                  <span className="text-sm font-extrabold text-danger">- Tsh. {(activeShift.cash_out || 0).toLocaleString()}</span>
                </div>
              </div>

              <div className="flex justify-between items-center p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 rounded-lg">
                <div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-bold">EXPECTED CASH IN DRAWER:</span>
                  <strong className="text-lg font-black text-emerald-800 dark:text-emerald-400">
                    Tsh. {((activeShift.opening_float || 0) + (activeShift.cash_sales || 0) + (activeShift.cash_in || 0) - (activeShift.cash_out || 0)).toLocaleString()}
                  </strong>
                </div>
                <div className="flex gap-2">
                  <Button size="xs" variant="secondary" onClick={() => { setIsShiftHistoryDashboardOpen(false); setIsCashInOutModalOpen(true); }}>
                    Log Float / Payout
                  </Button>
                  <Button size="xs" variant="primary" onClick={() => { setIsShiftHistoryDashboardOpen(false); setIsShiftCloseModalOpen(true); }}>
                    Close Drawer
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6 bg-slate-50 dark:bg-darkbg text-center rounded-xl border border-dashed dark:border-darkbg-border">
              <span className="text-slate-400 block mb-2 italic">Cash register register is currently closed.</span>
              <Button size="xs" variant="primary" onClick={() => { setIsShiftHistoryDashboardOpen(false); setIsShiftOpenModalOpen(true); }}>
                Open Drawer Register
              </Button>
            </div>
          )}

          {/* Historical Shifts List */}
          <div className="space-y-2">
            <h4 className="font-bold text-slate-800 dark:text-white text-sm">Shift Reconciliation & Audit Ledger</h4>
            <div className="border dark:border-darkbg-border rounded-xl overflow-hidden">
              <table className="w-full text-left" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr className="bg-slate-100 dark:bg-darkbg text-[10px] uppercase text-slate-400 font-bold border-b dark:border-darkbg-border">
                    <th className="p-3">Shift Date & Cashier</th>
                    <th className="p-3 text-right">Expected Drawer</th>
                    <th className="p-3 text-right">Actual Drawer</th>
                    <th className="p-3 text-right">Difference</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {shiftList.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center italic text-slate-400">No shift records found.</td>
                    </tr>
                  ) : (
                    [...shiftList].sort((a,b) => b.opening_time - a.opening_time).map(s => {
                      const expCash = s.opening_float + s.cash_sales + s.cash_in - s.cash_out;
                      const diff = s.status === 'CLOSED' ? (s.closing_cash_actual || 0) - expCash : 0;
                      return (
                        <tr key={s.id} className="border-b dark:border-darkbg-border hover:bg-slate-50 dark:hover:bg-darkbg">
                          <td className="p-3">
                            <span className="font-bold block text-slate-800 dark:text-white">{s.cashier_name}</span>
                            <span className="text-[10px] text-slate-400">{new Date(s.opening_time).toLocaleDateString()} {new Date(s.opening_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                          </td>
                          <td className="p-3 text-right font-semibold">Tsh. {expCash.toLocaleString()}</td>
                          <td className="p-3 text-right font-semibold">
                            {s.status === 'CLOSED' ? `Tsh. ${(s.closing_cash_actual || 0).toLocaleString()}` : '—'}
                          </td>
                          <td className="p-3 text-right font-bold">
                            {s.status === 'CLOSED' ? (
                              diff === 0 ? (
                                <span className="text-success">Perfect (Tsh. 0)</span>
                              ) : diff > 0 ? (
                                <span className="text-success">+{diff.toLocaleString()} (Surplus)</span>
                              ) : (
                                <span className="text-danger">{diff.toLocaleString()} (Deficit)</span>
                              )
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <Badge variant={s.status === 'OPEN' ? 'success' : 'outline'}>{s.status}</Badge>
                          </td>
                          <td className="p-3 text-center">
                            <Button size="xs" variant="outline" onClick={() => {
                              alert(`Z-Report / Summary for Shift #${s.id.slice(-8)}\n\nCashier: ${s.cashier_name}\nOpening Float: Tsh. ${s.opening_float.toLocaleString()}\nCash Sales: Tsh. ${s.cash_sales.toLocaleString()}\nMobile Money: Tsh. ${s.mpesa_sales.toLocaleString()}\nBank Sales: Tsh. ${s.bank_sales.toLocaleString()}\nExpected: Tsh. ${expCash.toLocaleString()}\nActual Counted: ${s.status === 'CLOSED' ? 'Tsh. ' + (s.closing_cash_actual || 0).toLocaleString() : 'Register Open'}\nDiscrepancy: Tsh. ${diff.toLocaleString()}`);
                            }}>
                              Z-Report
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t mt-4">
            <Button variant="secondary" onClick={() => setIsShiftHistoryDashboardOpen(false)}>Close Dashboard</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};
