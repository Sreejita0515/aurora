/**
 * Aurora AI Decision Agent
 * Analyzes real database data and generates actionable business recommendations.
 */

const { getDb, getDbSync } = require('./database');

class AIDecisionAgent {
  constructor(dbInstance) {
    this.db = dbInstance || getDbSync();
  }

  /**
   * Main analysis method - runs all analysis modules and returns comprehensive insights.
   */
  analyze() {
    return {
      timestamp: new Date().toISOString(),
      overview: this.getOverview(),
      salesAnalysis: this.getSalesAnalysis(),
      productPerformance: this.getProductPerformance(),
      customerInsights: this.getCustomerInsights(),
      inventoryHealth: this.getInventoryHealth(),
      revenueMetrics: this.getRevenueMetrics(),
      recommendations: this.generateRecommendations(),
    };
  }

  // ───────────────── Overview KPIs ─────────────────
  getOverview() {
    const totalRevenue = this.db.prepare(`
      SELECT COALESCE(SUM(total), 0) as value FROM orders WHERE status != 'cancelled'
    `).get().value;

    const totalOrders = this.db.prepare(`
      SELECT COUNT(*) as value FROM orders WHERE status != 'cancelled'
    `).get().value;

    const totalCustomers = this.db.prepare(`
      SELECT COUNT(DISTINCT user_id) as value FROM orders
    `).get().value;

    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Last 30 days vs previous 30 days
    const last30Revenue = this.db.prepare(`
      SELECT COALESCE(SUM(total), 0) as value FROM orders
      WHERE status != 'cancelled' AND created_at >= datetime('now', '-30 days')
    `).get().value;

    const prev30Revenue = this.db.prepare(`
      SELECT COALESCE(SUM(total), 0) as value FROM orders
      WHERE status != 'cancelled' AND created_at >= datetime('now', '-60 days') AND created_at < datetime('now', '-30 days')
    `).get().value;

    const revenueGrowth = prev30Revenue > 0 ? ((last30Revenue - prev30Revenue) / prev30Revenue * 100) : 0;

    const pendingOrders = this.db.prepare(`
      SELECT COUNT(*) as value FROM orders WHERE status IN ('pending', 'processing')
    `).get().value;

    const cancelRate = this.db.prepare(`
      SELECT
        CAST(SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS REAL) /
        NULLIF(COUNT(*), 0) * 100 as value
      FROM orders
    `).get().value || 0;

    return {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalOrders,
      totalCustomers,
      avgOrderValue: Math.round(avgOrderValue * 100) / 100,
      revenueGrowth: Math.round(revenueGrowth * 10) / 10,
      pendingOrders,
      cancelRate: Math.round(cancelRate * 10) / 10,
      last30Revenue: Math.round(last30Revenue * 100) / 100,
    };
  }

  // ───────────────── Sales Analysis ─────────────────
  getSalesAnalysis() {
    // Daily revenue for last 30 days
    const dailyRevenue = this.db.prepare(`
      SELECT DATE(created_at) as date, SUM(total) as revenue, COUNT(*) as orders
      FROM orders
      WHERE status != 'cancelled' AND created_at >= datetime('now', '-30 days')
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `).all();

    // Revenue by category
    const categoryRevenue = this.db.prepare(`
      SELECT c.name as category, c.icon,
        SUM(oi.price * oi.quantity) as revenue,
        COUNT(DISTINCT o.id) as orders
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      JOIN categories c ON p.category_id = c.id
      JOIN orders o ON oi.order_id = o.id
      WHERE o.status != 'cancelled'
      GROUP BY c.id
      ORDER BY revenue DESC
    `).all();

    // Weekly trends
    const weeklyTrends = this.db.prepare(`
      SELECT
        CASE strftime('%w', created_at)
          WHEN '0' THEN 'Sun'
          WHEN '1' THEN 'Mon'
          WHEN '2' THEN 'Tue'
          WHEN '3' THEN 'Wed'
          WHEN '4' THEN 'Thu'
          WHEN '5' THEN 'Fri'
          WHEN '6' THEN 'Sat'
        END as day,
        COUNT(*) as orders,
        SUM(total) as revenue
      FROM orders
      WHERE status != 'cancelled'
      GROUP BY strftime('%w', created_at)
      ORDER BY CAST(strftime('%w', created_at) AS INTEGER)
    `).all();

    // Order status distribution
    const statusDistribution = this.db.prepare(`
      SELECT status, COUNT(*) as count FROM orders GROUP BY status
    `).all();

    return { dailyRevenue, categoryRevenue, weeklyTrends, statusDistribution };
  }

  // ───────────────── Product Performance ─────────────────
  getProductPerformance() {
    // Top selling products
    const topProducts = this.db.prepare(`
      SELECT p.name, p.price, p.stock, p.rating,
        SUM(oi.quantity) as total_sold,
        SUM(oi.price * oi.quantity) as total_revenue
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      JOIN orders o ON oi.order_id = o.id
      WHERE o.status != 'cancelled'
      GROUP BY p.id
      ORDER BY total_revenue DESC
      LIMIT 10
    `).all();

    // Underperforming products (lowest revenue)
    const underperformers = this.db.prepare(`
      SELECT p.name, p.price, p.stock, p.rating,
        COALESCE(SUM(oi.quantity), 0) as total_sold,
        COALESCE(SUM(oi.price * oi.quantity), 0) as total_revenue
      FROM products p
      LEFT JOIN order_items oi ON p.id = oi.product_id
      LEFT JOIN orders o ON oi.order_id = o.id AND o.status != 'cancelled'
      GROUP BY p.id
      ORDER BY total_revenue ASC
      LIMIT 10
    `).all();

    // Products with best reviews
    const bestReviewed = this.db.prepare(`
      SELECT p.name, p.rating, p.reviews_count, p.price
      FROM products p
      WHERE p.reviews_count > 0
      ORDER BY p.rating DESC, p.reviews_count DESC
      LIMIT 5
    `).all();

    return { topProducts, underperformers, bestReviewed };
  }

  // ───────────────── Customer Insights ─────────────────
  getCustomerInsights() {
    // Customer spending distribution
    const customerSpending = this.db.prepare(`
      SELECT u.name, u.email,
        COUNT(o.id) as total_orders,
        SUM(o.total) as total_spent,
        AVG(o.total) as avg_order,
        MAX(o.created_at) as last_order
      FROM users u
      JOIN orders o ON u.id = o.user_id
      WHERE o.status != 'cancelled' AND u.role = 'customer'
      GROUP BY u.id
      ORDER BY total_spent DESC
    `).all();

    // Repeat purchase rate
    const repeatBuyers = this.db.prepare(`
      SELECT COUNT(*) as value FROM (
        SELECT user_id FROM orders WHERE status != 'cancelled'
        GROUP BY user_id HAVING COUNT(*) > 1
      )
    `).get().value;

    const totalBuyers = this.db.prepare(`
      SELECT COUNT(DISTINCT user_id) as value FROM orders WHERE status != 'cancelled'
    `).get().value;

    const repeatRate = totalBuyers > 0 ? (repeatBuyers / totalBuyers * 100) : 0;

    // New vs returning customers (last 30 days)
    const newCustomers30d = this.db.prepare(`
      SELECT COUNT(DISTINCT user_id) as value FROM orders
      WHERE created_at >= datetime('now', '-30 days')
      AND user_id NOT IN (
        SELECT DISTINCT user_id FROM orders WHERE created_at < datetime('now', '-30 days')
      )
    `).get().value;

    // Customer lifetime segments
    const segments = {
      vip: customerSpending.filter(c => c.total_spent > 2000).length,
      regular: customerSpending.filter(c => c.total_spent >= 500 && c.total_spent <= 2000).length,
      occasional: customerSpending.filter(c => c.total_spent < 500).length,
    };

    return {
      customerSpending: customerSpending.map(c => ({
        ...c,
        total_spent: Math.round(c.total_spent * 100) / 100,
        avg_order: Math.round(c.avg_order * 100) / 100,
      })),
      repeatRate: Math.round(repeatRate * 10) / 10,
      totalBuyers,
      repeatBuyers,
      newCustomers30d,
      segments,
    };
  }

  // ───────────────── Inventory Health ─────────────────
  getInventoryHealth() {
    // Low stock items (< 20 units)
    const lowStock = this.db.prepare(`
      SELECT p.name, p.stock, p.price, c.name as category,
        COALESCE(
          (SELECT SUM(oi.quantity) FROM order_items oi
           JOIN orders o ON oi.order_id = o.id
           WHERE oi.product_id = p.id AND o.status != 'cancelled'
           AND o.created_at >= datetime('now', '-30 days')), 0
        ) as monthly_sales
      FROM products p
      JOIN categories c ON p.category_id = c.id
      WHERE p.stock < 20
      ORDER BY p.stock ASC
    `).all();

    // Overstocked items (high stock, low sales)
    const overstock = this.db.prepare(`
      SELECT p.name, p.stock, p.price, c.name as category,
        COALESCE(
          (SELECT SUM(oi.quantity) FROM order_items oi
           JOIN orders o ON oi.order_id = o.id
           WHERE oi.product_id = p.id AND o.status != 'cancelled'
           AND o.created_at >= datetime('now', '-30 days')), 0
        ) as monthly_sales
      FROM products p
      JOIN categories c ON p.category_id = c.id
      WHERE p.stock > 100
      ORDER BY p.stock DESC
    `).all();

    // Total inventory value
    const inventoryValue = this.db.prepare(`
      SELECT SUM(price * stock) as value FROM products
    `).get().value;

    // Stock distribution by category
    const stockByCategory = this.db.prepare(`
      SELECT c.name as category, c.icon, SUM(p.stock) as total_stock,
        COUNT(p.id) as product_count,
        SUM(p.price * p.stock) as inventory_value
      FROM products p
      JOIN categories c ON p.category_id = c.id
      GROUP BY c.id
      ORDER BY inventory_value DESC
    `).all();

    return {
      lowStock,
      overstock,
      inventoryValue: Math.round(inventoryValue * 100) / 100,
      stockByCategory: stockByCategory.map(s => ({
        ...s,
        inventory_value: Math.round(s.inventory_value * 100) / 100,
      })),
    };
  }

  // ───────────────── Revenue Metrics ─────────────────
  getRevenueMetrics() {
    // Monthly revenue breakdown
    const monthlyRevenue = this.db.prepare(`
      SELECT
        strftime('%Y-%m', created_at) as month,
        SUM(total) as revenue,
        COUNT(*) as orders,
        AVG(total) as avg_order
      FROM orders
      WHERE status != 'cancelled'
      GROUP BY strftime('%Y-%m', created_at)
      ORDER BY month ASC
    `).all();

    // Revenue per customer
    const revenuePerCustomer = this.db.prepare(`
      SELECT AVG(customer_total) as value FROM (
        SELECT SUM(total) as customer_total FROM orders
        WHERE status != 'cancelled'
        GROUP BY user_id
      )
    `).get().value || 0;

    // Projected monthly revenue (based on current trend)
    const currentMonthRevenue = this.db.prepare(`
      SELECT COALESCE(SUM(total), 0) as value FROM orders
      WHERE status != 'cancelled' AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')
    `).get().value;

    const dayOfMonth = new Date().getDate();
    const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const projectedRevenue = dayOfMonth > 0 ? (currentMonthRevenue / dayOfMonth) * daysInMonth : 0;

    return {
      monthlyRevenue: monthlyRevenue.map(m => ({
        ...m,
        revenue: Math.round(m.revenue * 100) / 100,
        avg_order: Math.round(m.avg_order * 100) / 100,
      })),
      revenuePerCustomer: Math.round(revenuePerCustomer * 100) / 100,
      currentMonthRevenue: Math.round(currentMonthRevenue * 100) / 100,
      projectedRevenue: Math.round(projectedRevenue * 100) / 100,
    };
  }

  // ───────────────── AI Recommendations ─────────────────
  generateRecommendations() {
    const recommendations = [];
    const overview = this.getOverview();
    const inventory = this.getInventoryHealth();
    const customers = this.getCustomerInsights();
    const products = this.getProductPerformance();

    // ── Inventory Recommendations ──
    if (inventory.lowStock.length > 0) {
      const criticalItems = inventory.lowStock.filter(i => i.stock < 10);
      const urgentItems = inventory.lowStock.filter(i => i.stock >= 10 && i.stock < 20);

      if (criticalItems.length > 0) {
        recommendations.push({
          id: 'inv-critical',
          category: 'inventory',
          priority: 'critical',
          icon: '🚨',
          title: 'Critical Stock Alert',
          description: `${criticalItems.length} product(s) have critically low stock (< 10 units): ${criticalItems.map(i => `"${i.name}" (${i.stock} left)`).join(', ')}. Immediate reorder required to prevent stockouts and lost revenue.`,
          action: 'Place emergency restock orders for these items within 24 hours.',
          impact: 'Prevents an estimated $' + Math.round(criticalItems.reduce((s, i) => s + i.price * 20, 0)) + ' in potential lost sales.',
          metrics: { affected_products: criticalItems.length, risk_level: 'high' },
        });
      }

      if (urgentItems.length > 0) {
        recommendations.push({
          id: 'inv-low',
          category: 'inventory',
          priority: 'high',
          icon: '📦',
          title: 'Low Stock Warning',
          description: `${urgentItems.length} product(s) are running low (10-20 units). Based on current sales velocity, these may run out within 2-3 weeks.`,
          action: 'Schedule restocking for these items in the next purchase order.',
          impact: 'Maintains product availability and customer satisfaction.',
          metrics: { affected_products: urgentItems.length, risk_level: 'medium' },
        });
      }
    }

    // ── Overstock Recommendations ──
    const slowMovers = inventory.overstock.filter(i => i.monthly_sales < 5 && i.stock > 100);
    if (slowMovers.length > 0) {
      const tiedUpCapital = slowMovers.reduce((s, i) => s + i.price * i.stock, 0);
      recommendations.push({
        id: 'inv-overstock',
        category: 'inventory',
        priority: 'medium',
        icon: '📊',
        title: 'Overstock Optimization',
        description: `${slowMovers.length} product(s) have excess inventory with low sales velocity. Approximately $${Math.round(tiedUpCapital).toLocaleString()} in capital is tied up in slow-moving stock.`,
        action: 'Consider running flash sales, bundle deals, or promotional pricing to move excess inventory.',
        impact: `Could free up ~$${Math.round(tiedUpCapital * 0.6).toLocaleString()} in working capital.`,
        metrics: { tied_capital: Math.round(tiedUpCapital), products_affected: slowMovers.length },
      });
    }

    // ── Revenue Recommendations ──
    if (overview.revenueGrowth < 0) {
      recommendations.push({
        id: 'rev-decline',
        category: 'revenue',
        priority: 'high',
        icon: '📉',
        title: 'Revenue Decline Detected',
        description: `Revenue has declined by ${Math.abs(overview.revenueGrowth)}% compared to the previous period. This trend requires immediate attention.`,
        action: 'Launch targeted marketing campaigns, introduce limited-time offers, and analyze which categories are underperforming.',
        impact: 'Reversing this trend could recover significant monthly revenue.',
        metrics: { decline_percent: overview.revenueGrowth },
      });
    } else if (overview.revenueGrowth > 10) {
      recommendations.push({
        id: 'rev-growth',
        category: 'revenue',
        priority: 'info',
        icon: '🚀',
        title: 'Strong Revenue Growth',
        description: `Revenue is up ${overview.revenueGrowth}% vs. last period. Capitalize on this momentum.`,
        action: 'Scale up marketing spend on top-performing channels. Increase inventory for best-selling products.',
        impact: 'Could amplify growth to 15-20% with proper investment.',
        metrics: { growth_percent: overview.revenueGrowth },
      });
    }

    // ── Average Order Value ──
    if (overview.avgOrderValue < 200) {
      recommendations.push({
        id: 'rev-aov',
        category: 'revenue',
        priority: 'medium',
        icon: '💰',
        title: 'Increase Average Order Value',
        description: `Current AOV is $${overview.avgOrderValue}. Industry benchmark suggests targeting $250+. Upselling and cross-selling can boost this metric.`,
        action: 'Implement "Frequently Bought Together" suggestions, offer free shipping above $150, and create product bundles.',
        impact: 'A 25% AOV increase could add ~$' + Math.round(overview.totalOrders * 50) + ' in total revenue.',
        metrics: { current_aov: overview.avgOrderValue, target_aov: 250 },
      });
    }

    // ── Customer Retention ──
    if (customers.repeatRate < 50) {
      recommendations.push({
        id: 'cust-retention',
        category: 'customers',
        priority: 'high',
        icon: '🔄',
        title: 'Improve Customer Retention',
        description: `Repeat purchase rate is ${customers.repeatRate}%, which is below the 50% threshold for healthy e-commerce. ${customers.totalBuyers - customers.repeatBuyers} customers made only a single purchase.`,
        action: 'Launch a loyalty rewards program, send personalized product recommendations via email, and offer "comeback" discount codes to one-time buyers.',
        impact: 'Improving retention by 10% could increase lifetime value by 25-30%.',
        metrics: { current_rate: customers.repeatRate, target_rate: 50, one_time_buyers: customers.totalBuyers - customers.repeatBuyers },
      });
    }

    // ── VIP Customer Strategy ──
    if (customers.segments.vip > 0) {
      recommendations.push({
        id: 'cust-vip',
        category: 'customers',
        priority: 'medium',
        icon: '👑',
        title: 'VIP Customer Program',
        description: `You have ${customers.segments.vip} VIP customer(s) (spending $2000+). These high-value customers drive disproportionate revenue and deserve special attention.`,
        action: 'Create an exclusive VIP tier with early access to new products, dedicated support, and personalized offers.',
        impact: 'VIP customers typically spend 3-5x more than regular customers when properly nurtured.',
        metrics: { vip_count: customers.segments.vip, segments: customers.segments },
      });
    }

    // ── Cancellation Rate ──
    if (overview.cancelRate > 5) {
      recommendations.push({
        id: 'ops-cancel',
        category: 'operations',
        priority: 'high',
        icon: '⚠️',
        title: 'High Cancellation Rate',
        description: `Order cancellation rate is ${overview.cancelRate}%, above the 5% healthy threshold. This indicates potential issues with product descriptions, pricing, or checkout experience.`,
        action: 'Audit cancelled orders for patterns, improve product descriptions and images, streamline the checkout process, and add order confirmation notifications.',
        impact: 'Reducing cancellations by half could save ~$' + Math.round(overview.totalRevenue * overview.cancelRate / 200) + '/month.',
        metrics: { cancel_rate: overview.cancelRate },
      });
    }

    // ── Product Strategy ──
    if (products.topProducts.length > 0) {
      const topProduct = products.topProducts[0];
      recommendations.push({
        id: 'prod-top',
        category: 'products',
        priority: 'info',
        icon: '⭐',
        title: 'Best Seller Spotlight',
        description: `"${topProduct.name}" is your top performer with $${Math.round(topProduct.total_revenue)} in revenue (${topProduct.total_sold} units sold). Consider expanding this product line.`,
        action: 'Source complementary products, create bundle offers with this item, and feature it prominently in marketing.',
        impact: 'Expanding top-seller categories typically yields 15-20% incremental revenue.',
        metrics: { product: topProduct.name, revenue: topProduct.total_revenue, sold: topProduct.total_sold },
      });
    }

    // ── Underperformer Strategy ──
    const zeroSalesProducts = products.underperformers.filter(p => p.total_sold === 0);
    if (zeroSalesProducts.length > 0) {
      recommendations.push({
        id: 'prod-zero',
        category: 'products',
        priority: 'medium',
        icon: '🔍',
        title: 'Zero-Sales Products Need Attention',
        description: `${zeroSalesProducts.length} product(s) have zero sales: ${zeroSalesProducts.slice(0, 3).map(p => `"${p.name}"`).join(', ')}${zeroSalesProducts.length > 3 ? '...' : ''}. These may need better positioning or pricing.`,
        action: 'Review pricing competitiveness, improve product images and descriptions, or consider discontinuing if demand doesn\'t materialize.',
        impact: 'Optimizing product catalog improves browsing experience and reduces inventory costs.',
        metrics: { zero_sales_count: zeroSalesProducts.length },
      });
    }

    // ── Pending Orders ──
    if (overview.pendingOrders > 5) {
      recommendations.push({
        id: 'ops-pending',
        category: 'operations',
        priority: 'high',
        icon: '⏳',
        title: 'Process Pending Orders',
        description: `${overview.pendingOrders} orders are pending/processing. Faster fulfillment improves customer satisfaction and review scores.`,
        action: 'Prioritize order processing, consider same-day dispatch for orders received before noon.',
        impact: 'Reducing fulfillment time by 1 day can improve customer satisfaction scores by 10-15%.',
        metrics: { pending_count: overview.pendingOrders },
      });
    }

    // Sort by priority
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return recommendations;
  }
}

module.exports = AIDecisionAgent;
