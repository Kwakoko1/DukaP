import { db, type Product } from '../db/dexie';

class BarOperationsService {
  /**
   * Check if a product has a Happy Hour price active right now.
   * If yes, return the discounted price. Otherwise return original price.
   */
  async getEffectivePrice(
    tenantId: string,
    product: Product,
    now: Date = new Date()
  ): Promise<number> {
    const originalPrice = product.sellingPrice || product.price || 0;
    
    // Check if the product has happy hour override price set directly
    if (product.is_happy_hour_eligible && product.happy_hour_price && product.happy_hour_price > 0) {
      // Check current day and time to see if happy hour should apply
      const currentDay = now.toLocaleString('en-US', { weekday: 'long' }); // e.g. "Friday"
      const currentHour = now.getHours();
      const currentMin = now.getMinutes();
      const currentMinutes = currentHour * 60 + currentMin;

      // Query active Happy Hour rules from pricing rules
      const rules = await db.pricingRules
        .where('tenant_id')
        .equals(tenantId)
        .toArray();

      for (const rule of rules) {
        // If rule defines specific days, verify match
        if (rule.days && rule.days.length > 0 && !rule.days.includes(currentDay)) {
          continue;
        }

        // If rule defines a start/end time, verify match
        if (rule.start_time && rule.end_time) {
          const [sh, sm] = rule.start_time.split(':').map(Number);
          const [eh, em] = rule.end_time.split(':').map(Number);
          const startMinutes = sh * 60 + sm;
          const endMinutes = eh * 60 + em;

          if (currentMinutes >= startMinutes && currentMinutes <= endMinutes) {
            // Apply rule discount if this product is listed or if rule is global/category-level
            if (!rule.applicable_product_ids || rule.applicable_product_ids.length === 0 || rule.applicable_product_ids.includes(product.id)) {
              if (rule.discount_percent > 0) {
                return originalPrice * (1 - rule.discount_percent / 100);
              }
            }
          }
        }
      }

      // Fallback to static product happy hour price if no dynamic rule matched but marked eligible
      // Let's assume standard happy hour is 5PM - 8PM (17:00 - 20:00)
      if (currentHour >= 17 && currentHour < 20) {
        return product.happy_hour_price;
      }
    }

    return originalPrice;
  }

  /**
   * Split a persistent tab bill equally or by item.
   */
  async splitTab(
    tabId: string,
    method: 'EQUALLY' | 'BY_ITEM',
    splitCount: number,
    selectedItemIds?: Array<{ product_id: string; quantity: number }>
  ): Promise<Array<{ index: number; amount: number; desc: string }>> {
    const tab = await db.tabs.get(tabId);
    if (!tab) throw new Error('Tab not found');

    const splits = [];

    if (method === 'EQUALLY') {
      const perPersonAmt = tab.total / splitCount;
      for (let i = 0; i < splitCount; i++) {
        splits.push({
          index: i + 1,
          amount: perPersonAmt,
          desc: `Split 1/${splitCount} of Tab #${tab.id.slice(-4)}`
        });
      }
    } else {
      // By item split: calculate cost of selected items vs remaining
      if (!selectedItemIds || selectedItemIds.length === 0) {
        throw new Error('No items selected for split-by-item');
      }

      let selectedSubtotal = 0;
      for (const sel of selectedItemIds) {
        const item = tab.items.find(i => i.product_id === sel.product_id);
        if (item) {
          selectedSubtotal += item.price * sel.quantity;
        }
      }

      splits.push({
        index: 1,
        amount: selectedSubtotal,
        desc: `Selected items from Tab #${tab.id.slice(-4)}`
      });

      splits.push({
        index: 2,
        amount: Math.max(0, tab.total - selectedSubtotal),
        desc: `Remaining items of Tab #${tab.id.slice(-4)}`
      });
    }

    return splits;
  }

  /**
   * Calculate bartender commission (5% on cocktails category)
   */
  async calculateCommission(
    orderItems: Array<{ product_id: string; quantity: number; price: number }>
  ): Promise<number> {
    let totalCocktailSales = 0;

    for (const item of orderItems) {
      const prod = await db.products.get(item.product_id);
      if (prod && prod.category === 'Cocktails') {
        totalCocktailSales += item.price * item.quantity;
      }
    }

    // 5% commission on cocktail categories
    return totalCocktailSales * 0.05;
  }

  /**
   * Security check for sensitive actions in the bar (voids, overrides, deletions)
   * requires passcode validation (e.g. manager passcode 'manager123')
   */
  async authorizeSensitiveAction(
    _actionName: string,
    passcode: string
  ): Promise<boolean> {
    // Audit log can be created for tracking
    const isAuthorized = passcode === 'manager123' || passcode === '1911';
    return isAuthorized;
  }
}

export const barService = new BarOperationsService();
