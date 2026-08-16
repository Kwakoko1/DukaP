/**
 * KwakoPos SaaS — Multi-Industry Custom Rules & Polymorphic Workflow Engine
 * 
 * Provides runtime validation, polymorphic JSONB schema validation,
 * and customizable business rule triggers across all 27+ industry verticals.
 */

export interface BusinessRule {
  id: string;
  tenantId: string;
  name: string;
  category: 'POS' | 'INVENTORY' | 'BAR' | 'PHARMACY' | 'LIVESTOCK' | 'LEGAL' | 'FLEET';
  triggerEvent: string; // e.g. 'pos.cart.discount', 'inventory.stock.decrement', 'bar.pour.dispense'
  enabled: boolean;
  conditionExpr: string; // e.g. 'discountPercent > 15', 'stock < 0', 'requiresDoctorRx == true'
  actionType: 'WARN' | 'BLOCK' | 'REQUIRE_PIN' | 'ALERT_HQ';
  actionMessage: string;
}

export class CustomRulesEngine {
  private static instance: CustomRulesEngine;
  private memoryRules: Map<string, BusinessRule[]> = new Map(); // tenantId -> rules

  private constructor() {}

  public static getInstance(): CustomRulesEngine {
    if (!CustomRulesEngine.instance) {
      CustomRulesEngine.instance = new CustomRulesEngine();
    }
    return CustomRulesEngine.instance;
  }

  /**
   * Evaluates rules for a given trigger event and execution context
   */
  public evaluate(params: {
    tenantId: string;
    event: string;
    context: Record<string, any>;
  }): { allowed: boolean; actionType?: 'WARN' | 'BLOCK' | 'REQUIRE_PIN' | 'ALERT_HQ'; message?: string } {
    const { tenantId, event, context } = params;
    const rules = this.memoryRules.get(tenantId) || this.getDefaultRules(tenantId);

    for (const rule of rules) {
      if (rule.enabled && rule.triggerEvent === event) {
        const isTriggered = this.evaluateCondition(rule.conditionExpr, context);
        if (isTriggered) {
          if (rule.actionType === 'BLOCK') {
            return { allowed: false, actionType: 'BLOCK', message: rule.actionMessage };
          }
          if (rule.actionType === 'REQUIRE_PIN') {
            return { allowed: false, actionType: 'REQUIRE_PIN', message: rule.actionMessage };
          }
          return { allowed: true, actionType: rule.actionType, message: rule.actionMessage };
        }
      }
    }

    return { allowed: true };
  }

  /**
   * Polymorphic JSONB Schema Validator for Industry Specific Fields
   */
  public validateIndustryPayload(module: string, payload: Record<string, any>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (module === 'bar' || module === 'beverage') {
      if (payload.standard_pour_ml && typeof payload.standard_pour_ml !== 'number') {
        errors.push('Standard pour size must be a valid numeric milliliters value.');
      }
    }

    if (module === 'pharmacy') {
      if (payload.is_controlled && !payload.schedule_category) {
        errors.push('Controlled substance category is required for scheduled pharmaceutical items.');
      }
    }

    if (module === 'poultry_livestock' || module === 'farming') {
      if (payload.mortality_count && payload.mortality_count < 0) {
        errors.push('Mortality count cannot be negative.');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  public registerRulesForTenant(tenantId: string, rules: BusinessRule[]): void {
    this.memoryRules.set(tenantId, rules);
  }

  private evaluateCondition(expr: string, context: Record<string, any>): boolean {
    try {
      // Safe declarative field matcher
      if (expr.includes('>')) {
        const [field, valStr] = expr.split('>').map(s => s.trim());
        const fieldVal = context[field];
        return typeof fieldVal === 'number' && fieldVal > Number(valStr);
      }
      if (expr.includes('<')) {
        const [field, valStr] = expr.split('<').map(s => s.trim());
        const fieldVal = context[field];
        return typeof fieldVal === 'number' && fieldVal < Number(valStr);
      }
      if (expr.includes('==')) {
        const [field, valStr] = expr.split('==').map(s => s.trim());
        const expected = valStr === 'true' ? true : valStr === 'false' ? false : valStr.replace(/['"]/g, '');
        return context[field] === expected;
      }
    } catch (_) {}
    return false;
  }

  private getDefaultRules(tenantId: string): BusinessRule[] {
    return [
      {
        id: 'rule-disc-max',
        tenantId,
        name: 'Manager Approval for High Discounts',
        category: 'POS',
        triggerEvent: 'pos.cart.discount',
        enabled: true,
        conditionExpr: 'discountPercent > 15',
        actionType: 'REQUIRE_PIN',
        actionMessage: 'Discounts exceeding 15% require Manager or Supervisor PIN approval.'
      },
      {
        id: 'rule-neg-stock',
        tenantId,
        name: 'Prevent Negative Stock Checkout',
        category: 'INVENTORY',
        triggerEvent: 'inventory.stock.decrement',
        enabled: false,
        conditionExpr: 'stockRemaining < 0',
        actionType: 'WARN',
        actionMessage: 'Warning: This transaction will result in negative stock balance.'
      }
    ];
  }
}

export const customRulesEngine = CustomRulesEngine.getInstance();
