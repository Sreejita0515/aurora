/**
 * Aurora Admin Dashboard — E-Commerce Decision Agent Platform
 * Client-Side JavaScript Logic with Firebase Authentication
 * 
 * Features 5 Specialized Decision Agents:
 * 1. Predictive Inventory Agent
 * 2. Smart Pricing Agent
 * 3. Customer Behaviour Agent
 * 4. Bundle and Cross-Selling Agent
 * 5. Business Strategy Agent
 * 
 * Access Control: Strictly verified for administrator role. Non-admins redirected to login.
 */

const API = window.location.protocol.startsWith('http')
  ? `${window.location.origin}/api`
  : 'http://localhost:3000/api';

let dashboardData = null;
let currentAdminUser = null;
let firebaseAdminUserObj = null;
let currentActiveSection = 'decision-hub';

// ═══ FIREBASE ADMIN AUTH ═══
async function getAdminAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (firebaseAdminUserObj) {
    try {
      const token = await firebaseAdminUserObj.getIdToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
    } catch (e) {
      console.warn('Could not retrieve admin token', e);
    }
  }
  return headers;
}

// ═══ INITIALIZATION ═══
document.addEventListener('DOMContentLoaded', () => {
  initAdminAuth();
});

function initAdminAuth() {
  firebase.auth().onAuthStateChanged(async (fbUser) => {
    if (fbUser) {
      firebaseAdminUserObj = fbUser;
      await verifyAndLoadAdmin(fbUser);
    } else {
      // Not signed in — redirect to unified login portal
      window.location.href = '/login?redirect=/admin&requireAdmin=1';
    }
  });
}

async function verifyAndLoadAdmin(fbUser) {
  const loader = document.getElementById('dashboardLoader');
  if (loader) loader.style.display = 'flex';

  try {
    const token = await fbUser.getIdToken(true);
    const res = await fetch(`${API}/admin/verify`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    const data = await res.json();

    if (!res.ok || !data.verified) {
      throw new Error(data.error || 'Access denied');
    }

    currentAdminUser = data.user;
    updateAdminNavbarUI();
    await loadDashboard();
  } catch (err) {
    console.error('Admin verification failed:', err);
    window.location.href = '/login?redirect=/admin&adminDenied=1';
  }
}

function updateAdminNavbarUI() {
  const pill = document.getElementById('adminUserPill');
  const avatar = document.getElementById('adminAvatar');
  const emailEl = document.getElementById('adminEmail');

  if (currentAdminUser && pill) {
    pill.style.display = 'flex';
    const initial = (currentAdminUser.name || currentAdminUser.email || 'A').charAt(0).toUpperCase();
    if (avatar) avatar.textContent = initial;
    if (emailEl) emailEl.textContent = currentAdminUser.email || 'admin@aurora.com';
  }
}

async function handleAdminSignOut() {
  try {
    await firebase.auth().signOut();
    window.location.href = '/';
  } catch (err) {
    console.error('Admin sign out error:', err);
    showToast('Failed to sign out', 'error');
  }
}

// ═══ LOAD DASHBOARD DATA ═══
async function loadDashboard() {
  const loader = document.getElementById('dashboardLoader');
  if (loader) loader.style.display = 'flex';

  try {
    const headers = await getAdminAuthHeaders();
    const res = await fetch(`${API}/admin/analytics`, { headers });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        showToast('Administrator authorization denied. Please sign in again.', 'error');
        window.location.href = '/login?redirect=/admin&adminDenied=1';
        return;
      }
      throw new Error(`Server returned ${res.status}`);
    }
    dashboardData = await res.json();

    document.getElementById('lastUpdated').textContent =
      new Date(dashboardData.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    if (loader) loader.style.display = 'none';
    showSection(currentActiveSection || 'decision-hub');
  } catch (err) {
    if (loader) {
      loader.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⚠️</div>
          <h3>Decision Engine Offline</h3>
          <p>Make sure the backend server is running on port 3000</p>
          <button class="btn btn-primary" style="margin-top: 1rem;" onclick="loadDashboard()">Retry Connection</button>
        </div>
      `;
    }
    console.error('Dashboard load failed:', err);
  }
}

// ═══ SECTION NAVIGATION ═══
function showSection(sectionId) {
  currentActiveSection = sectionId;

  // Update sidebar active link
  document.querySelectorAll('.sidebar-link').forEach(link => {
    link.classList.toggle('active', link.dataset.section === sectionId);
  });

  // Hide all sections
  document.querySelectorAll('.admin-section').forEach(section => {
    section.style.display = 'none';
  });

  // Show active section
  const targetSection = document.getElementById(`section-${sectionId}`);
  if (targetSection) {
    targetSection.style.display = 'block';
    targetSection.style.animation = 'fadeInUp 0.35s ease';
  }

  if (!dashboardData) return;

  switch (sectionId) {
    case 'decision-hub': renderDecisionHub(); break;
    case 'predictive-inventory': renderPredictiveInventory(); break;
    case 'smart-pricing': renderSmartPricing(); break;
    case 'customer-behaviour': renderCustomerBehaviour(); break;
    case 'bundle-cross-selling': renderBundleCrossSelling(); break;
    case 'business-strategy': renderBusinessStrategy(); break;
    case 'overview': renderOverview(); break;
    case 'sales': renderSales(); break;
    case 'orders': loadRecentOrders(); break;
  }
}

// ═════════════════════════════════════════════════════════════════════════
// SECTION: DECISION HUB (EXECUTIVE SUMMARY)
// ═════════════════════════════════════════════════════════════════════════
function renderDecisionHub() {
  const agents = dashboardData.agents;
  if (!agents) return;

  const kpis = document.getElementById('decisionHubKpis');
  kpis.innerHTML = `
    <div class="kpi-card">
      <div class="kpi-icon">♟️</div>
      <div class="kpi-label">Business Health Score</div>
      <div class="kpi-value">${agents.businessStrategy.healthScore}/100</div>
      <span class="kpi-change positive">Grade ${agents.businessStrategy.ratingGrade} • ${agents.businessStrategy.ratingTitle.split('&')[0]}</span>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon">🏷️</div>
      <div class="kpi-label">Smart Pricing Potential</div>
      <div class="kpi-value">+₹${formatNumber(agents.smartPricing.totalProjectedMonthlyUplift)}</div>
      <span class="kpi-change positive">Available Monthly Profit Uplift</span>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon">🚨</div>
      <div class="kpi-label">Critical Stockouts</div>
      <div class="kpi-value">${agents.predictiveInventory.criticalCount} SKUs</div>
      <span class="kpi-change negative">&lt; 7 Days Festive Runway</span>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon">📦</div>
      <div class="kpi-label">Trapped Dead Capital</div>
      <div class="kpi-value">₹${formatNumber(agents.predictiveInventory.deadCapitalTied)}</div>
      <span class="kpi-change neutral">Overstocked Slow-Movers</span>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon">👥</div>
      <div class="kpi-label">12M Predicted CLV</div>
      <div class="kpi-value">₹${formatNumber(agents.customerBehaviour.totalPredicted12mCLV)}</div>
      <span class="kpi-change positive">${agents.customerBehaviour.championsCount} Royal VIPs Active</span>
    </div>
  `;

  // Render prioritized action recommendations
  const recContainer = document.getElementById('decisionHubRecommendations');
  recContainer.innerHTML = (dashboardData.recommendations || []).map(r => `
    <div class="playbook-card">
      <div class="playbook-info">
        <div class="playbook-category">${r.icon} ${r.agent || 'AI Decision Agent'} • ${r.priority.toUpperCase()}</div>
        <div class="playbook-title">${r.title}</div>
        <div class="playbook-desc">${r.description}</div>
        <div style="margin-top: 8px; font-size: 0.85rem; color: #a78bfa;"><strong>Recommended Action:</strong> ${r.action}</div>
      </div>
      <div class="playbook-impact">
        <div class="impact-val">${r.impact.split('in')[0]}</div>
        <div class="impact-label">Projected Impact</div>
        <button class="btn btn-secondary btn-sm" style="margin-top: 8px;" onclick="handleHubRecAction('${r.category}')">Inspect Agent →</button>
      </div>
    </div>
  `).join('');

  // Hub charts
  renderRevenueChart(dashboardData.salesAnalysis.dailyRevenue, 'hubRevenueChart');
  renderCategoryDonut(dashboardData.salesAnalysis.categoryRevenue, 'hubCategoryChart');
}

function handleHubRecAction(category) {
  if (category === 'inventory') showSection('predictive-inventory');
  else if (category === 'pricing') showSection('smart-pricing');
  else if (category === 'bundling') showSection('bundle-cross-selling');
  else if (category === 'customers') showSection('customer-behaviour');
  else showSection('business-strategy');
}

// ═════════════════════════════════════════════════════════════════════════
// SECTION: 1. PREDICTIVE INVENTORY AGENT
// ═════════════════════════════════════════════════════════════════════════
function renderPredictiveInventory() {
  const inv = dashboardData.agents?.predictiveInventory;
  if (!inv) return;

  const kpis = document.getElementById('inventoryAgentKpis');
  kpis.innerHTML = `
    <div class="kpi-card">
      <div class="kpi-icon">🏭</div>
      <div class="kpi-label">Inventory Health</div>
      <div class="kpi-value">${inv.healthScore}/100</div>
      <span class="kpi-change ${inv.healthScore > 70 ? 'positive' : 'negative'}">Stock Turnover Index</span>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon">💰</div>
      <div class="kpi-label">Total Inventory Valuation</div>
      <div class="kpi-value">₹${formatNumber(inv.totalInventoryValue)}</div>
      <span class="kpi-change neutral">Wholesale Asset Value</span>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon">🚨</div>
      <div class="kpi-label">Critical Stockouts</div>
      <div class="kpi-value">${inv.criticalCount} SKUs</div>
      <span class="kpi-change negative">Reorder Urgently</span>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon">⚠️</div>
      <div class="kpi-label">Reorder Soon</div>
      <div class="kpi-value">${inv.warningCount} SKUs</div>
      <span class="kpi-change neutral">Runway &lt; 21 Days</span>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon">📦</div>
      <div class="kpi-label">Dead Capital Locked</div>
      <div class="kpi-value">₹${formatNumber(inv.deadCapitalTied)}</div>
      <span class="kpi-change negative">${inv.overstockCount} Overstocked SKUs</span>
    </div>
  `;

  // Forecast table
  const tbody = document.querySelector('#inventoryForecastTable tbody');
  tbody.innerHTML = inv.forecast.map(p => {
    let badgeClass = 'badge-success';
    let statusLabel = 'Optimal';
    if (p.status === 'CRITICAL_STOCKOUT') { badgeClass = 'badge-danger'; statusLabel = '🚨 Critical Stockout'; }
    else if (p.status === 'REORDER_NOW') { badgeClass = 'badge-warning'; statusLabel = '⚠️ Reorder Now'; }
    else if (p.status === 'OVERSTOCK_TRAP') { badgeClass = 'badge-info'; statusLabel = '📦 Overstocked'; }

    return `
      <tr>
        <td>
          <div style="font-weight: 700; color: var(--text-primary);">${p.name}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">Craft: ${p.craftOrigin}</div>
        </td>
        <td><span class="badge-neutral">${p.category}</span></td>
        <td><strong>${p.stock}</strong></td>
        <td>${p.dailyVelocity.toFixed(2)}/day</td>
        <td><strong style="color: ${p.daysUntilStockout <= 7 ? '#f87171' : 'inherit'};">${p.daysUntilStockout}d</strong></td>
        <td><strong style="color: #f59e0b;">${p.festivalStockoutDays}d</strong> <span style="font-size: 0.7rem; color: #f59e0b;">(${p.festivalSurgeMultiplier}x)</span></td>
        <td>${p.reorderPoint} units</td>
        <td><span class="${badgeClass}">${p.recommendedReorderQty > 0 ? `+${p.recommendedReorderQty} units` : 'Adequate'}</span></td>
        <td>${p.leadTimeDays} days</td>
        <td>${p.reorderCost > 0 ? '₹' + formatNumber(p.reorderCost) : '—'}</td>
        <td>
          ${p.recommendedReorderQty > 0 ? `
            <button class="btn-action-restock" onclick="quickRestockProduct('${p.id}', ${p.recommendedReorderQty})">
              + Restock ${p.recommendedReorderQty}
            </button>
          ` : '<span style="color: #10b981; font-size: 0.8rem;">✓ Healthy</span>'}
        </td>
      </tr>
    `;
  }).join('');

  // Overstock table
  const overstockTbody = document.querySelector('#inventoryOverstockTable tbody');
  overstockTbody.innerHTML = inv.overstockClearance.map(p => `
    <tr>
      <td><strong>${p.name}</strong></td>
      <td>${p.stock} units</td>
      <td>${p.sold30d} sold</td>
      <td style="color: #f87171; font-weight: 700;">₹${formatNumber((p.stock - Math.ceil(p.dailyVelocity * 45)) * p.estimatedCostPrice)}</td>
      <td><span class="badge-warning">Flash Sale / Bundle (-15%)</span></td>
    </tr>
  `).join('');

  // Category breakdown table
  const catTbody = document.querySelector('#inventoryCategoryTable tbody');
  catTbody.innerHTML = inv.categoryRollup.map(c => `
    <tr>
      <td>
        <strong>${c.categoryName}</strong>
        <div style="font-size: 0.75rem; color: var(--text-muted);">${c.craftOrigin}</div>
      </td>
      <td>${c.totalStock}</td>
      <td>₹${formatNumber(c.inventoryValue)}</td>
      <td>${c.avgVelocity.toFixed(2)}/day</td>
      <td><span class="badge-gold">${c.festivalSurgeRate}</span></td>
    </tr>
  `).join('');
}

async function quickRestockProduct(productId, qty) {
  const enteredQty = prompt(`Enter restock batch size for this product:`, qty);
  if (!enteredQty) return;
  const quantity = parseInt(enteredQty, 10);
  if (isNaN(quantity) || quantity <= 0) {
    showToast('Please enter a valid positive quantity', 'warning');
    return;
  }

  try {
    const headers = await getAdminAuthHeaders();
    const res = await fetch(`${API}/admin/decision-agents/inventory/restock`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ productId, quantity })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Restock failed');

    showToast(`✅ Successfully restocked ${quantity} units for ${data.product.name}`, 'success');
    await loadDashboard();
    showSection('predictive-inventory');
  } catch (err) {
    showToast(`Error restocking: ${err.message}`, 'error');
  }
}

// ═════════════════════════════════════════════════════════════════════════
// SECTION: 2. SMART PRICING AGENT
// ═════════════════════════════════════════════════════════════════════════
function renderSmartPricing() {
  const pricing = dashboardData.agents?.smartPricing;
  if (!pricing) return;

  const kpis = document.getElementById('pricingAgentKpis');
  kpis.innerHTML = `
    <div class="kpi-card">
      <div class="kpi-icon">💰</div>
      <div class="kpi-label">Projected Monthly Profit Uplift</div>
      <div class="kpi-value" style="color: #34d399;">+₹${formatNumber(pricing.totalProjectedMonthlyUplift)}</div>
      <span class="kpi-change positive">Net Bottom-Line Margin Lift</span>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon">🚀</div>
      <div class="kpi-label">Surge Pricing Opportunities</div>
      <div class="kpi-value">${pricing.surgeOpportunities.length} SKUs</div>
      <span class="kpi-change positive">Scarcity + 4.6★ Rating</span>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon">🏷️</div>
      <div class="kpi-label">Markdown Clearances</div>
      <div class="kpi-value">${pricing.markdownOpportunities.length} SKUs</div>
      <span class="kpi-change neutral">Unlocks Trapped Capital</span>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon">⚡</div>
      <div class="kpi-label">Actionable Recommendations</div>
      <div class="kpi-value">${pricing.actionableCount} SKUs</div>
      <span class="kpi-change positive">1-Click Apply Ready</span>
    </div>
  `;

  // Populate simulator select
  const simSelect = document.getElementById('simPricingProduct');
  simSelect.innerHTML = pricing.recommendations.map(p => `
    <option value="${p.id}" data-current="${p.currentPrice}" data-rec="${p.recommendedPrice}">
      ${p.name} (Current: ₹${p.currentPrice.toLocaleString('en-IN')})
    </option>
  `).join('');
  updatePricingSimDefault();

  // Recommendations table
  const tbody = document.querySelector('#smartPricingTable tbody');
  tbody.innerHTML = pricing.recommendations.map(p => `
    <tr>
      <td>
        <div style="font-weight: 700; color: var(--text-primary);">${p.name}</div>
        <div style="font-size: 0.75rem; color: var(--text-muted);">${p.rationale}</div>
      </td>
      <td><strong>${formatPrice(p.currentPrice)}</strong></td>
      <td><strong style="color: #34d399; font-size: 1.05rem;">${formatPrice(p.recommendedPrice)}</strong></td>
      <td>
        <span class="${p.priceDelta > 0 ? 'badge-success' : p.priceDelta < 0 ? 'badge-warning' : 'badge-neutral'}">
          ${p.priceDelta > 0 ? `+${p.priceDeltaPercent}%` : p.priceDelta < 0 ? `${p.priceDeltaPercent}%` : '0%'}
        </span>
      </td>
      <td><span class="${p.strategyBadge}">${p.strategyLabel}</span></td>
      <td>${p.elasticity}</td>
      <td><span class="badge-gold">${p.confidence}%</span></td>
      <td style="font-weight: 700; color: ${p.monthlyRevenueDelta >= 0 ? '#34d399' : '#f87171'};">
        ${p.monthlyRevenueDelta > 0 ? '+₹' + formatNumber(p.monthlyRevenueDelta) : '₹' + formatNumber(p.monthlyRevenueDelta)}
      </td>
      <td>
        ${p.priceDelta !== 0 ? `
          <button class="btn-action-apply" onclick="applySmartPrice('${p.id}', ${p.recommendedPrice})">
            Apply ₹${p.recommendedPrice.toLocaleString('en-IN')}
          </button>
        ` : '<span style="color: #94a3b8; font-size: 0.8rem;">Optimal</span>'}
      </td>
    </tr>
  `).join('');
}

function updatePricingSimDefault() {
  const sel = document.getElementById('simPricingProduct');
  const opt = sel.options[sel.selectedIndex];
  if (opt) {
    document.getElementById('simTargetPrice').value = opt.dataset.rec || opt.dataset.current;
  }
}

async function runPricingSimulation() {
  const sel = document.getElementById('simPricingProduct');
  const productId = sel.value;
  const targetPrice = parseFloat(document.getElementById('simTargetPrice').value);

  if (isNaN(targetPrice) || targetPrice <= 0) {
    showToast('Please enter a valid target price', 'warning');
    return;
  }

  try {
    const headers = await getAdminAuthHeaders();
    const res = await fetch(`${API}/admin/decision-agents/pricing/simulate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ productId, targetPrice })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Simulation failed');

    const resultBox = document.getElementById('pricingSimResult');
    resultBox.style.display = 'flex';
    resultBox.innerHTML = `
      <div class="sim-stat">
        <div class="stat-label">Price Shift</div>
        <div class="stat-val ${data.priceChangePercent >= 0 ? 'positive' : 'negative'}">
          ${data.priceChangePercent > 0 ? '+' : ''}${data.priceChangePercent}%
        </div>
      </div>
      <div class="sim-stat">
        <div class="stat-label">Projected Monthly Units</div>
        <div class="stat-val">${data.projectedMonthlyUnits} units</div>
      </div>
      <div class="sim-stat">
        <div class="stat-label">Monthly Revenue Delta</div>
        <div class="stat-val ${data.revenueDelta >= 0 ? 'positive' : 'negative'}">
          ${data.revenueDelta >= 0 ? '+₹' : '-₹'}${Math.abs(data.revenueDelta).toLocaleString('en-IN')}
        </div>
      </div>
      <div class="sim-stat">
        <div class="stat-label">Gross Margin Impact</div>
        <div class="stat-val ${data.grossProfitDelta >= 0 ? 'positive' : 'negative'}">
          ${data.grossProfitDelta >= 0 ? '+₹' : '-₹'}${Math.abs(data.grossProfitDelta).toLocaleString('en-IN')}
        </div>
      </div>
      <div class="sim-stat">
        <div class="stat-label">Model Verdict</div>
        <div class="stat-val"><span class="${data.grossProfitDelta >= 0 ? 'badge-success' : 'badge-danger'}">${data.verdict}</span></div>
      </div>
    `;
  } catch (err) {
    showToast(`Simulation error: ${err.message}`, 'error');
  }
}

async function applySmartPrice(productId, newPrice) {
  if (!confirm(`Apply recommended price of ₹${newPrice.toLocaleString('en-IN')} to this product?`)) return;

  try {
    const headers = await getAdminAuthHeaders();
    const res = await fetch(`${API}/admin/decision-agents/pricing/apply`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ productId, newPrice })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update price');

    showToast(`✅ ${data.message}`, 'success');
    await loadDashboard();
    showSection('smart-pricing');
  } catch (err) {
    showToast(`Error updating price: ${err.message}`, 'error');
  }
}

// ═════════════════════════════════════════════════════════════════════════
// SECTION: 3. CUSTOMER BEHAVIOUR AGENT
// ═════════════════════════════════════════════════════════════════════════
function renderCustomerBehaviour() {
  const cust = dashboardData.agents?.customerBehaviour;
  if (!cust) return;

  const kpis = document.getElementById('customerAgentKpis');
  kpis.innerHTML = `
    <div class="kpi-card">
      <div class="kpi-icon">👑</div>
      <div class="kpi-label">Royal Champions (VIP)</div>
      <div class="kpi-value">${cust.championsCount}</div>
      <span class="kpi-change positive">Spend &gt; ₹12,000 • Low Churn</span>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon">💎</div>
      <div class="kpi-label">Loyal Regulars</div>
      <div class="kpi-value">${cust.loyalistsCount}</div>
      <span class="kpi-change positive">Consistent Order Cadence</span>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon">🎯</div>
      <div class="kpi-label">High-Value First-Timers</div>
      <div class="kpi-value">${cust.newcomersCount}</div>
      <span class="kpi-change neutral">Nurture for 2nd Purchase</span>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon">⚠️</div>
      <div class="kpi-label">At-Risk Churn</div>
      <div class="kpi-value">${cust.atRiskCount}</div>
      <span class="kpi-change negative">&gt; 45 Days Inactive</span>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon">💰</div>
      <div class="kpi-label">Avg Predicted 12M CLV</div>
      <div class="kpi-value">₹${formatNumber(cust.averageCustomerCLV)}</div>
      <span class="kpi-change positive">Customer Lifetime Value</span>
    </div>
  `;

  // Regional breakdown
  const regTbody = document.querySelector('#regionalTrendsTable tbody');
  regTbody.innerHTML = cust.regionalSummary.map(r => `
    <tr>
      <td><strong>${r.name}</strong></td>
      <td>${r.orders} orders</td>
      <td style="font-weight: 700; color: #34d399;">₹${formatNumber(r.revenue)}</td>
      <td>₹${formatNumber(r.avgBasket)}</td>
      <td><span class="badge-neutral">${r.topCategory}</span></td>
    </tr>
  `).join('');

  // Cancellations & Churn Alert Table
  const cancelledCountEl = document.getElementById('cancelledOrdersCount');
  const cancellTbody = document.querySelector('#cancellationsTable tbody');
  const allCancellations = cust.allCancellations || [];
  if (cancelledCountEl) cancelledCountEl.textContent = allCancellations.length;

  if (cancellTbody) {
    if (allCancellations.length === 0) {
      cancellTbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">🎉 Zero order cancellations recorded. Customer retention is optimal.</td></tr>';
    } else {
      cancellTbody.innerHTML = allCancellations.map(c => `
        <tr>
          <td>
            <div class="clickable-customer" onclick="openCustomerModal('${c.user_id}')" title="Click to view all orders by ${c.customer_name}">
              <span>👤 ${c.customer_name}</span>
            </div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${c.customer_email}</div>
          </td>
          <td>
            <span style="font-family: monospace; font-weight: 700; color: #f87171;">#${c.id.substring(0, 8)}</span>
          </td>
          <td style="font-weight: 700; color: #f87171;">₹${formatNumber(c.total)}</td>
          <td><span class="badge-neutral">${c.items_count || 1} item(s)</span></td>
          <td style="font-size: 0.85rem; color: var(--text-muted);">${new Date(c.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
          <td>
            <button class="btn-action-apply" style="padding: 4px 10px; font-size: 0.75rem; background: rgba(239, 68, 68, 0.2); border-color: rgba(239, 68, 68, 0.4); color: #fca5a5;" onclick="openCustomerModal('${c.user_id}')">
              View Profile & Orders 🔍
            </button>
          </td>
        </tr>
      `).join('');
    }
  }

  // Customer RFM segmentation table
  const custTbody = document.querySelector('#customerSegmentTable tbody');
  custTbody.innerHTML = cust.customers.map(c => `
    <tr>
      <td>
        <div class="clickable-customer" onclick="openCustomerModal('${c.id}')" title="Click to view ${c.name}'s complete profile & orders">
          <span>👤 ${c.name}</span>
        </div>
        <div style="font-size: 0.75rem; color: var(--text-muted);">${c.email}</div>
      </td>
      <td><span class="${c.segmentBadge}">${c.segmentLabel}</span></td>
      <td><strong>${c.totalOrders}</strong></td>
      <td style="font-weight: 700;">₹${c.totalSpent.toLocaleString('en-IN')}</td>
      <td>
        ${c.cancelledCount > 0 ? `
          <span class="badge-danger" style="font-weight: 700; cursor: pointer;" onclick="openCustomerModal('${c.id}')" title="Customer has cancelled orders">
            ⚠️ ${c.cancelledCount} Cancelled
          </span>
        ` : `
          <span style="color: var(--text-muted); font-size: 0.8rem;">0</span>
        `}
      </td>
      <td>${c.daysSinceLastOrder < 999 ? `${c.daysSinceLastOrder}d ago` : 'Never'}</td>
      <td>
        <span class="${c.churnRiskPercent < 30 ? 'badge-success' : c.churnRiskPercent < 65 ? 'badge-warning' : 'badge-danger'}">
          ${c.churnRiskPercent}%
        </span>
      </td>
      <td style="font-weight: 700; color: #34d399;">₹${c.predictedCLV.toLocaleString('en-IN')}</td>
      <td>
        <button class="btn-action-apply" style="padding: 4px 10px; font-size: 0.75rem;" onclick="openCustomerModal('${c.id}')">
          View Orders 🔍
        </button>
      </td>
    </tr>
  `).join('');

  // Cart funnel panel
  const funnel = cust.funnelAnalysis;
  const funnelPanel = document.getElementById('cartFunnelPanel');
  funnelPanel.innerHTML = `
    <div class="panel-header">
      <div class="panel-title">🛒 E-Commerce Cart Drop-Off & Abandonment Recovery</div>
      <span class="badge-warning">${funnel.cartAbandonmentRate}% Abandonment Rate</span>
    </div>
    <div class="sim-result-card" style="margin-top: 1rem;">
      <div class="sim-stat">
        <div class="stat-label">Estimated Cart Sessions</div>
        <div class="stat-val">${funnel.estimatedCartSessions}</div>
      </div>
      <div class="sim-stat">
        <div class="stat-label">Target Recoverable Orders</div>
        <div class="stat-val positive">+${funnel.recoveredTargetOrders} Orders</div>
      </div>
      <div class="sim-stat">
        <div class="stat-label">Potential Recovered GMV</div>
        <div class="stat-val positive">+₹${formatNumber(funnel.potentialRecoveredRevenue)}</div>
      </div>
      <div class="sim-stat">
        <div class="stat-label">Optimal Remarketing Trigger</div>
        <div class="stat-val" style="font-size: 0.95rem; color: #facc15;">${funnel.recommendedRemarketingWindow}</div>
      </div>
    </div>
  `;
}

// ═════════════════════════════════════════════════════════════════════════
// SECTION: 4. BUNDLE & CROSS-SELLING AGENT
// ═════════════════════════════════════════════════════════════════════════
function renderBundleCrossSelling() {
  const bundle = dashboardData.agents?.bundleCrossSelling;
  if (!bundle) return;

  const kpis = document.getElementById('bundleAgentKpis');
  kpis.innerHTML = `
    <div class="kpi-card">
      <div class="kpi-icon">🎁</div>
      <div class="kpi-label">Active Smart Bundles</div>
      <div class="kpi-value">${bundle.smartBundles.length} Bundles</div>
      <span class="kpi-change positive">Curated Festive Sets</span>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon">📈</div>
      <div class="kpi-label">Projected Store AOV Lift</div>
      <div class="kpi-value" style="color: #34d399;">${bundle.projectedAovImpact}</div>
      <span class="kpi-change positive">Basket Size Expansion</span>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon">🏷️</div>
      <div class="kpi-label">Average Bundle Discount</div>
      <div class="kpi-value">${bundle.averageBundleDiscount}</div>
      <span class="kpi-change neutral">Compelling Incentive</span>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon">🛒</div>
      <div class="kpi-label">Mined Basket Pairs</div>
      <div class="kpi-value">${bundle.coPurchases.length} Pairs</div>
      <span class="kpi-change positive">Order Item Mining</span>
    </div>
  `;

  // Smart Bundles Grid
  const grid = document.getElementById('smartBundlesGrid');
  grid.innerHTML = bundle.smartBundles.map(b => `
    <div class="bundle-card">
      <div>
        <span class="bundle-badge badge-gold">${b.badge}</span>
        <div class="bundle-name">${b.name}</div>
        <div class="bundle-tagline">${b.tagline}</div>
        <div class="bundle-items-list">
          ${b.items.map(item => `
            <div class="bundle-item-row">
              <span>• ${item.name}</span>
              <span>₹${item.price.toLocaleString('en-IN')}</span>
            </div>
          `).join('')}
        </div>
      </div>
      <div>
        <div class="bundle-pricing-row">
          <div>
            <div class="bundle-mrp">Combined MRP: ₹${b.individualTotal.toLocaleString('en-IN')}</div>
            <div class="bundle-savings">Save ${b.discountPercent}% (₹${b.customerSavings.toLocaleString('en-IN')} Off)</div>
          </div>
          <div class="bundle-smart-price">₹${b.bundlePrice.toLocaleString('en-IN')}</div>
        </div>
        <button class="btn-bundle-action" id="btn-deploy-${b.id}" onclick="deploySmartBundle('${b.id}', '${b.name}')">
          🚀 Deploy Bundle to Storefront
        </button>
      </div>
    </div>
  `).join('');

  // Co-purchases table
  const coTbody = document.querySelector('#coPurchasesTable tbody');
  coTbody.innerHTML = bundle.coPurchases.map(cp => `
    <tr>
      <td><strong>${cp.item1}</strong></td>
      <td><strong>${cp.item2}</strong></td>
      <td><span class="badge-gold">${cp.frequency} co-orders</span></td>
    </tr>
  `).join('');

  // Cross-selling rules
  const csTbody = document.querySelector('#crossSellingTable tbody');
  csTbody.innerHTML = bundle.crossSellingRules.map(r => `
    <tr>
      <td><strong>${r.source}</strong></td>
      <td style="color: #34d399; font-weight: 700;">${r.recommended}</td>
      <td><span class="badge-success">${r.attachmentRate}</span></td>
    </tr>
  `).join('');
}

function deploySmartBundle(bundleId, bundleName) {
  const btn = document.getElementById(`btn-deploy-${bundleId}`);
  if (btn) {
    btn.innerHTML = '✅ Active on Storefront';
    btn.style.background = '#10b981';
  }
  showToast(`🎉 "${bundleName}" deployed to storefront!`, 'success');
}

// ═════════════════════════════════════════════════════════════════════════
// SECTION: 5. BUSINESS STRATEGY AGENT
// ═════════════════════════════════════════════════════════════════════════
function renderBusinessStrategy() {
  const strat = dashboardData.agents?.businessStrategy;
  if (!strat) return;

  // Health score panel
  const healthPanel = document.getElementById('strategyHealthPanel');
  healthPanel.innerHTML = `
    <div class="panel-header">
      <div class="panel-title">♟️ Composite Business Health Score & Unit Economics</div>
      <span class="badge-gold">Grade ${strat.ratingGrade}</span>
    </div>
    <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 2rem; margin-top: 1rem;">
      <div style="text-align: center; min-width: 160px;">
        <div style="font-size: 3.5rem; font-weight: 900; color: #34d399; line-height: 1;">${strat.healthScore}</div>
        <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 6px;">Out of 100 Index</div>
        <div style="font-size: 1rem; font-weight: 700; color: var(--text-primary); margin-top: 4px;">${strat.ratingTitle}</div>
      </div>
      <div style="flex: 1; display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 1rem;">
        <div class="sim-stat">
          <div class="stat-label">Sales Growth</div>
          <div class="stat-val positive">${strat.scoreBreakdown.growth}</div>
        </div>
        <div class="sim-stat">
          <div class="stat-label">Gross Margin</div>
          <div class="stat-val positive">${strat.scoreBreakdown.margin}</div>
        </div>
        <div class="sim-stat">
          <div class="stat-label">Inventory Turn</div>
          <div class="stat-val">${strat.scoreBreakdown.inventory}</div>
        </div>
        <div class="sim-stat">
          <div class="stat-label">Customer Loyalty</div>
          <div class="stat-val">${strat.scoreBreakdown.loyalty}</div>
        </div>
        <div class="sim-stat">
          <div class="stat-label">Fulfillment Care</div>
          <div class="stat-val positive">${strat.scoreBreakdown.operations}</div>
        </div>
      </div>
    </div>
  `;

  // GMV Trajectory Table
  const gmvTbody = document.querySelector('#gmvTrajectoryTable tbody');
  gmvTbody.innerHTML = strat.gmvTrajectory.map(g => `
    <tr>
      <td><strong>${g.month}</strong></td>
      <td style="color: #94a3b8;">₹${formatNumber(g.conservative)}</td>
      <td style="font-weight: 700; color: #34d399;">₹${formatNumber(g.expected)}</td>
      <td style="font-weight: 800; color: #f59e0b;">₹${formatNumber(g.aggressive)}</td>
    </tr>
  `).join('');

  // Strategic Playbook
  const pbContainer = document.getElementById('strategicPlaybookContainer');
  pbContainer.innerHTML = strat.strategicPlaybook.map(p => `
    <div class="playbook-card">
      <div class="playbook-info">
        <div class="playbook-category">${p.category}</div>
        <div class="playbook-title">${p.title}</div>
        <div class="playbook-desc">${p.detail}</div>
      </div>
      <div class="playbook-impact">
        <div class="impact-val">${p.potentialRevenue}</div>
        <div class="impact-label">Expected Net Lift</div>
      </div>
    </div>
  `).join('');
}

async function runStrategySimulation() {
  const festiveDiscountPct = parseFloat(document.getElementById('simFestiveDiscount').value) || 10;
  const freeShippingThreshold = parseFloat(document.getElementById('simShippingThreshold').value) || 1499;
  const marketingBudgetDelta = parseFloat(document.getElementById('simMarketingBudget').value) || 25000;
  const conversionLiftPct = parseFloat(document.getElementById('simConversionLift').value) || 15;

  try {
    const headers = await getAdminAuthHeaders();
    const res = await fetch(`${API}/admin/decision-agents/strategy/simulate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ festiveDiscountPct, freeShippingThreshold, marketingBudgetDelta, conversionLiftPct })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Simulation failed');

    const sim = data.simulation;
    const resultBox = document.getElementById('strategySimResult');
    resultBox.style.display = 'flex';
    resultBox.innerHTML = `
      <div class="sim-stat">
        <div class="stat-label">Projected Orders</div>
        <div class="stat-val positive">${sim.projectedOrders} orders</div>
      </div>
      <div class="sim-stat">
        <div class="stat-label">Projected GMV</div>
        <div class="stat-val positive">₹${formatNumber(sim.projectedRevenue)}</div>
      </div>
      <div class="sim-stat">
        <div class="stat-label">Revenue Delta</div>
        <div class="stat-val positive">+₹${formatNumber(sim.revenueDelta)}</div>
      </div>
      <div class="sim-stat">
        <div class="stat-label">Net Profit Impact</div>
        <div class="stat-val ${sim.netProfitDelta >= 0 ? 'positive' : 'negative'}">
          ${sim.netProfitDelta >= 0 ? '+₹' : '-₹'}${formatNumber(Math.abs(sim.netProfitDelta))}
        </div>
      </div>
      <div class="sim-stat">
        <div class="stat-label">Strategy Marketing ROI</div>
        <div class="stat-val positive">${sim.roiPercent}%</div>
      </div>
    `;
  } catch (err) {
    showToast(`Strategy simulation error: ${err.message}`, 'error');
  }
}

// ═════════════════════════════════════════════════════════════════════════
// CORE OPERATIONS: OVERVIEW, SALES, LIVE ORDERS
// ═════════════════════════════════════════════════════════════════════════
function renderOverview() {
  const o = dashboardData.overview;
  const kpiGrid = document.getElementById('kpiGrid');
  const growthClass = o.revenueGrowth > 0 ? 'positive' : o.revenueGrowth < 0 ? 'negative' : 'neutral';
  const growthIcon = o.revenueGrowth > 0 ? '↑' : o.revenueGrowth < 0 ? '↓' : '→';

  kpiGrid.innerHTML = `
    <div class="kpi-card">
      <div class="kpi-icon">💰</div>
      <div class="kpi-label">Total Revenue</div>
      <div class="kpi-value">₹${formatNumber(o.totalRevenue)}</div>
      <span class="kpi-change ${growthClass}">${growthIcon} ${Math.abs(o.revenueGrowth)}%</span>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon">📦</div>
      <div class="kpi-label">Total Orders</div>
      <div class="kpi-value">${o.totalOrders}</div>
      <span class="kpi-change neutral">${o.pendingOrders} pending</span>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon">👥</div>
      <div class="kpi-label">Customers</div>
      <div class="kpi-value">${o.totalCustomers}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon">🛒</div>
      <div class="kpi-label">Avg Order Value</div>
      <div class="kpi-value">${formatPrice(o.avgOrderValue)}</div>
    </div>
  `;

  renderRevenueChart(dashboardData.salesAnalysis.dailyRevenue, 'revenueChart');
  renderCategoryDonut(dashboardData.salesAnalysis.categoryRevenue, 'categoryChart');
}

function renderSales() {
  const s = dashboardData.salesAnalysis;
  renderWeeklyChart(s.weeklyTrends);
  renderStatusDistribution(s.statusDistribution);

  const tbody = document.querySelector('#categoryRevenueTable tbody');
  const totalRev = s.categoryRevenue.reduce((sum, c) => sum + c.revenue, 0);
  tbody.innerHTML = s.categoryRevenue.map(c => {
    const share = totalRev > 0 ? (c.revenue / totalRev * 100).toFixed(1) : '0';
    return `
      <tr>
        <td><strong>${c.icon || '🏷️'} ${c.category}</strong></td>
        <td><strong>₹${formatNumber(c.revenue)}</strong></td>
        <td>${c.orders}</td>
        <td><span class="badge-neutral">${share}%</span></td>
      </tr>
    `;
  }).join('');
}

let allLiveOrders = [];

async function loadRecentOrders() {
  try {
    const headers = await getAdminAuthHeaders();
    const res = await fetch(`${API}/admin/orders`, { headers });
    if (!res.ok) throw new Error('Failed to load orders');
    const data = await res.json();
    allLiveOrders = data.orders || [];

    // Update filter counts
    const filterAllCount = document.getElementById('filterAllCount');
    const filterCancelledCount = document.getElementById('filterCancelledCount');
    if (filterAllCount) filterAllCount.textContent = allLiveOrders.length;
    if (filterCancelledCount) {
      const cCount = allLiveOrders.filter(o => o.status === 'cancelled').length;
      filterCancelledCount.textContent = cCount;
    }

    renderOrdersTable(allLiveOrders);
  } catch (err) {
    showToast(`Failed to load orders: ${err.message}`, 'error');
  }
}

function filterLiveOrders(status) {
  document.querySelectorAll('#orderStatusFilters .c-filter-btn').forEach(btn => btn.classList.remove('active'));
  const targetBtn = document.getElementById(`filterBtn-${status}`);
  if (targetBtn) targetBtn.classList.add('active');

  if (status === 'all') {
    renderOrdersTable(allLiveOrders);
  } else if (status === 'pending') {
    renderOrdersTable(allLiveOrders.filter(o => o.status === 'pending' || o.status === 'processing'));
  } else {
    renderOrdersTable(allLiveOrders.filter(o => o.status === status));
  }
}

function renderOrdersTable(orders) {
  const tbody = document.querySelector('#ordersTable tbody');
  if (!orders || orders.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">No orders found matching this filter</td></tr>';
    return;
  }

  tbody.innerHTML = orders.map(o => `
    <tr style="${o.status === 'cancelled' ? 'background: rgba(239, 68, 68, 0.05);' : ''}">
      <td>
        <span style="font-family: monospace; font-size: 0.8rem; font-weight: 700; color: ${o.status === 'cancelled' ? '#f87171' : 'var(--accent-secondary)'};">
          #${o.id.substring(0, 8)}
        </span>
      </td>
      <td>
        <div class="clickable-customer" onclick="openCustomerModal('${o.user_id}')" title="Click to view all orders by ${o.customer_name || 'Customer'}">
          <span>👤 ${o.customer_name || 'Customer'}</span>
        </div>
        <div style="font-size: 0.75rem; color: var(--text-muted);">${o.customer_email || ''}</div>
      </td>
      <td><strong>${formatPrice(o.total)}</strong></td>
      <td>
        <span class="${o.status === 'delivered' ? 'badge-success' : o.status === 'cancelled' ? 'badge-danger' : 'badge-warning'}">
          ${o.status === 'cancelled' ? '⚠️ CANCELLED' : o.status.toUpperCase()}
        </span>
      </td>
      <td>${new Date(o.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
      <td>
        <div style="display: flex; gap: 6px; align-items: center;">
          <select onchange="updateOrderStatus('${o.id}', this.value)" style="padding: 4px 8px; border-radius: 4px; background: rgba(0,0,0,0.4); color: white; border: 1px solid var(--border-color); font-size: 0.75rem;">
            <option value="pending" ${o.status === 'pending' ? 'selected' : ''}>Pending</option>
            <option value="processing" ${o.status === 'processing' ? 'selected' : ''}>Processing</option>
            <option value="shipped" ${o.status === 'shipped' ? 'selected' : ''}>Shipped</option>
            <option value="delivered" ${o.status === 'delivered' ? 'selected' : ''}>Delivered</option>
            <option value="cancelled" ${o.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
          </select>
          <button class="btn-action-apply" style="padding: 4px 8px; font-size: 0.75rem;" onclick="openCustomerModal('${o.user_id}')" title="Inspect Customer Orders">
            🔍
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function updateOrderStatus(orderId, newStatus) {
  try {
    const headers = await getAdminAuthHeaders();
    const res = await fetch(`${API}/admin/orders/${orderId}/status`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ status: newStatus })
    });
    if (!res.ok) throw new Error('Status update failed');
    showToast(`Order status updated to ${newStatus}`, 'success');
  } catch (err) {
    showToast(`Update error: ${err.message}`, 'error');
  }
}

// ═════════════════════════════════════════════════════════════════════════
// CHART HELPERS
// ═════════════════════════════════════════════════════════════════════════
function renderRevenueChart(dailyData, containerId = 'revenueChart') {
  const container = document.getElementById(containerId);
  if (!container || !dailyData || dailyData.length === 0) return;

  const maxRev = Math.max(...dailyData.map(d => d.revenue), 1);
  const sampleData = dailyData.slice(-14);

  container.innerHTML = sampleData.map(d => {
    const heightPercent = Math.max((d.revenue / maxRev) * 100, 5);
    const dayLabel = new Date(d.date).toLocaleDateString('en-US', { weekday: 'narrow' });
    return `
      <div class="bar-wrapper">
        <span class="bar-value">₹${formatNumber(d.revenue)}</span>
        <div class="bar" style="height: ${heightPercent}%;"></div>
        <span class="bar-label">${dayLabel}</span>
      </div>
    `;
  }).join('');
}

function renderCategoryDonut(catData, containerId = 'categoryChart') {
  const container = document.getElementById(containerId);
  if (!container || !catData || catData.length === 0) return;

  const colors = ['#7c3aed', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#6366f1'];
  const total = catData.reduce((s, c) => s + c.revenue, 0);

  container.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 8px; width: 100%;">
      ${catData.map((c, i) => {
        const pct = total > 0 ? (c.revenue / total * 100).toFixed(1) : 0;
        return `
          <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.85rem;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${colors[i % colors.length]};"></span>
              <span>${c.icon || '🏷️'} ${c.category}</span>
            </div>
            <span style="font-weight: 700;">₹${formatNumber(c.revenue)} (${pct}%)</span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderWeeklyChart(weeklyData) {
  const container = document.getElementById('weeklyChart');
  if (!container || !weeklyData || weeklyData.length === 0) return;

  const maxOrders = Math.max(...weeklyData.map(d => d.orders), 1);
  container.innerHTML = weeklyData.map(d => {
    const heightPercent = Math.max((d.orders / maxOrders) * 100, 8);
    return `
      <div class="bar-wrapper">
        <span class="bar-value">${d.orders}</span>
        <div class="bar" style="height: ${heightPercent}%;"></div>
        <span class="bar-label">${d.day}</span>
      </div>
    `;
  }).join('');
}

function renderStatusDistribution(data) {
  const container = document.getElementById('statusDistribution');
  if (!container || !data || data.length === 0) return;

  const total = data.reduce((s, d) => s + d.count, 0);
  const statusColors = {
    pending: '#f59e0b',
    processing: '#3b82f6',
    shipped: '#a855f7',
    delivered: '#22c55e',
    cancelled: '#ef4444',
  };

  container.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 12px; padding: 1rem 0;">
      ${data.map(d => {
        const pct = total > 0 ? (d.count / total * 100) : 0;
        return `
          <div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
              <span style="font-size: 0.85rem; font-weight: 600; text-transform: capitalize;">${d.status}</span>
              <span style="font-size: 0.8rem; color: var(--text-muted);">${d.count} (${pct.toFixed(1)}%)</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${pct}%; background: ${statusColors[d.status] || 'var(--accent-primary)'};"></div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// ═══ UTILITIES ═══
function formatPrice(val) {
  if (val === null || val === undefined || isNaN(val)) return '₹0';
  return '₹' + Math.round(Number(val)).toLocaleString('en-IN');
}

function formatNumber(num) {
  if (num >= 10000000) return (num / 10000000).toFixed(2) + ' Cr';
  if (num >= 100000) return (num / 100000).toFixed(1) + ' L';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return Math.round(num).toLocaleString('en-IN');
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type]}</span>
    <span class="toast-message">${message}</span>
  `;

  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// ═════════════════════════════════════════════════════════════════════════
// CUSTOMER PROFILE & ORDER HISTORY MODAL
// ═════════════════════════════════════════════════════════════════════════
let currentModalCustomerData = null;
let currentModalFilter = 'all';

async function openCustomerModal(userId) {
  if (!userId) {
    showToast('Customer ID missing', 'warning');
    return;
  }

  const modal = document.getElementById('customerOrdersModal');
  const ordersList = document.getElementById('cModalOrdersList');
  if (modal) {
    modal.classList.add('open');
    modal.style.display = 'flex';
  }
  if (ordersList) {
    ordersList.innerHTML = '<div style="text-align: center; padding: 3rem; color: var(--text-muted);"><div class="spinner" style="margin: 0 auto 1rem;"></div>Loading customer profile and order history...</div>';
  }

  try {
    const headers = await getAdminAuthHeaders();
    const res = await fetch(`${API}/admin/customers/${userId}/orders`, { headers });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to fetch customer orders');
    }
    const data = await res.json();
    currentModalCustomerData = data;
    currentModalFilter = 'all';

    const { customer, orders } = data;

    // Set Header Info
    const avatar = document.getElementById('cModalAvatar');
    if (avatar) avatar.textContent = (customer.name || customer.email || 'U').charAt(0).toUpperCase();

    const nameEl = document.getElementById('cModalName');
    if (nameEl) nameEl.textContent = customer.name || 'Anonymous Customer';

    const emailEl = document.getElementById('cModalEmail');
    if (emailEl) emailEl.textContent = customer.email || '';

    // Segment & Churn data from Customer Behaviour Agent if available
    let churnRisk = '15%';
    let segmentBadgeHtml = '<span class="badge-gold">Verified Customer</span>';
    if (dashboardData && dashboardData.agents && dashboardData.agents.customerBehaviour) {
      const segmented = dashboardData.agents.customerBehaviour.customers.find(c => c.id === userId);
      if (segmented) {
        churnRisk = `${segmented.churnRiskPercent}%`;
        segmentBadgeHtml = `<span class="${segmented.segmentBadge}">${segmented.segmentLabel}</span>`;
      }
    }

    const badgeContainer = document.getElementById('cModalSegmentBadge');
    if (badgeContainer) {
      badgeContainer.outerHTML = `<span id="cModalSegmentBadge">${segmentBadgeHtml}</span>`;
    }

    // Set KPI Bar
    document.getElementById('cModalTotalOrders').textContent = customer.total_orders || orders.length;
    document.getElementById('cModalTotalSpent').textContent = `₹${Math.round(customer.total_spent || 0).toLocaleString('en-IN')}`;
    
    const cancelledCountEl = document.getElementById('cModalCancelledCount');
    const cancelledCount = customer.cancelled_orders_count || orders.filter(o => o.status === 'cancelled').length;
    cancelledCountEl.textContent = cancelledCount > 0 ? `${cancelledCount} Cancelled` : '0';
    if (cancelledCount > 0) {
      cancelledCountEl.classList.add('cancelled-alert');
    } else {
      cancelledCountEl.classList.remove('cancelled-alert');
    }

    document.getElementById('cModalChurnRisk').textContent = churnRisk;
    document.getElementById('cModalAvgOrder').textContent = `₹${Math.round(customer.avg_order || 0).toLocaleString('en-IN')}`;
    document.getElementById('cModalOrderCount').textContent = orders.length;

    // Reset filter buttons
    document.querySelectorAll('.c-order-filters .c-filter-btn').forEach(btn => btn.classList.remove('active'));
    const btnAll = document.getElementById('cFilterAll');
    if (btnAll) btnAll.classList.add('active');

    renderModalOrders(orders);
  } catch (err) {
    console.error('Error opening customer modal:', err);
    if (ordersList) {
      ordersList.innerHTML = `<div style="text-align: center; padding: 2rem; color: #f87171;">⚠️ ${err.message}</div>`;
    }
  }
}

function filterModalOrders(status) {
  currentModalFilter = status;
  document.querySelectorAll('.c-order-filters .c-filter-btn').forEach(btn => btn.classList.remove('active'));
  
  if (status === 'all') {
    const el = document.getElementById('cFilterAll');
    if (el) el.classList.add('active');
  } else if (status === 'delivered') {
    const el = document.getElementById('cFilterDelivered');
    if (el) el.classList.add('active');
  } else if (status === 'cancelled') {
    const el = document.getElementById('cFilterCancelled');
    if (el) el.classList.add('active');
  }

  if (!currentModalCustomerData || !currentModalCustomerData.orders) return;

  let filtered = currentModalCustomerData.orders;
  if (status === 'delivered') {
    filtered = filtered.filter(o => o.status === 'delivered');
  } else if (status === 'cancelled') {
    filtered = filtered.filter(o => o.status === 'cancelled');
  }

  renderModalOrders(filtered);
}

function renderModalOrders(orders) {
  const container = document.getElementById('cModalOrdersList');
  if (!container) return;

  if (!orders || orders.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
        <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">📭</div>
        <p style="font-size: 0.95rem;">No orders match this filter.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = orders.map(order => {
    const isCancelled = order.status === 'cancelled';
    const statusBadge = isCancelled
      ? '<span class="badge-danger" style="font-weight: 800;">⚠️ CANCELLED</span>'
      : order.status === 'delivered'
      ? '<span class="badge-success">✓ DELIVERED</span>'
      : `<span class="badge-warning">${order.status.toUpperCase()}</span>`;

    const itemsHtml = (order.items || []).map(item => `
      <div class="order-card-item-row">
        <div style="display: flex; align-items: center; gap: 8px;">
          ${item.image_url ? `<img src="${item.image_url}" alt="" style="width: 28px; height: 28px; border-radius: 4px; object-fit: cover;">` : ''}
          <span style="font-weight: 600; color: var(--text-primary);">${item.product_name || 'Item'}</span>
          <span style="color: var(--text-muted); font-size: 0.8rem;">× ${item.quantity}</span>
        </div>
        <div style="font-weight: 700; color: var(--text-secondary);">₹${(item.price * item.quantity).toLocaleString('en-IN')}</div>
      </div>
    `).join('');

    return `
      <div class="customer-order-card ${isCancelled ? 'is-cancelled' : ''}">
        <div class="order-card-top">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span class="order-id-badge">#${order.id.substring(0, 8)}</span>
            <span style="font-size: 0.8rem; color: var(--text-muted);">${new Date(order.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <div>${statusBadge}</div>
        </div>

        ${isCancelled ? `
          <div style="background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 6px; padding: 6px 12px; margin-bottom: 0.75rem; font-size: 0.8rem; color: #fca5a5; display: flex; align-items: center; gap: 8px;">
            <span>⚠️</span>
            <span><strong>Cancelled Order:</strong> This order was cancelled by the customer. Amount of ₹${Number(order.total).toLocaleString('en-IN')} was voided/refunded.</span>
          </div>
        ` : ''}

        <div class="order-card-items">
          ${itemsHtml || '<div style="font-size: 0.8rem; color: var(--text-muted);">No line item records found</div>'}
        </div>

        <div class="order-card-bottom">
          <div style="display: flex; gap: 14px; flex-wrap: wrap;">
            <span>📍 ${order.shipping_address ? (order.shipping_address.length > 35 ? order.shipping_address.substring(0, 35) + '...' : order.shipping_address) : 'No address specified'}</span>
            <span>💳 ${order.payment_method ? order.payment_method.toUpperCase() : 'PREPAID'}</span>
          </div>
          <div style="font-size: 1.05rem; font-weight: 800; color: ${isCancelled ? '#f87171' : 'var(--accent-secondary)'};">
            Total: ₹${Number(order.total).toLocaleString('en-IN')}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function closeCustomerModal() {
  const modal = document.getElementById('customerOrdersModal');
  if (modal) {
    modal.classList.remove('open');
    modal.style.display = 'none';
  }
}

function handleCustomerModalBackdrop(e) {
  if (e.target && e.target.id === 'customerOrdersModal') {
    closeCustomerModal();
  }
}

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeCustomerModal();
  }
});
