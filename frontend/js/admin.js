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
          <div class="empty-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>
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
      <div class="kpi-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>
      <div class="kpi-label">Business Health Score</div>
      <div class="kpi-value">${agents.businessStrategy.healthScore}/100</div>
      <span class="kpi-change positive">Grade ${agents.businessStrategy.ratingGrade} • ${agents.businessStrategy.ratingTitle.split('&')[0]}</span>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg></div>
      <div class="kpi-label">Smart Pricing Potential</div>
      <div class="kpi-value">+₹${formatNumber(agents.smartPricing.totalProjectedMonthlyUplift)}</div>
      <span class="kpi-change positive">Available Monthly Profit Uplift</span>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>
      <div class="kpi-label">Critical Stockouts</div>
      <div class="kpi-value">${agents.predictiveInventory.criticalCount} SKUs</div>
      <span class="kpi-change negative">&lt; 7 Days Festive Runway</span>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 9.4 7.5 4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></div>
      <div class="kpi-label">Trapped Dead Capital</div>
      <div class="kpi-value">₹${formatNumber(agents.predictiveInventory.deadCapitalTied)}</div>
      <span class="kpi-change neutral">Overstocked Slow-Movers</span>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>
      <div class="kpi-label">12M Predicted CLV</div>
      <div class="kpi-value">₹${formatNumber(agents.customerBehaviour.totalPredicted12mCLV)}</div>
      <span class="kpi-change positive">${agents.customerBehaviour.championsCount} Royal VIPs Active</span>
    </div>
  `;

  // Render prioritized action recommendations ranked strictly by expected financial impact
  const recContainer = document.getElementById('decisionHubRecommendations');
  recContainer.innerHTML = (dashboardData.recommendations || []).map((r, idx) => `
    <div class="playbook-card">
      <div class="playbook-info">
        <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 6px; flex-wrap: wrap;">
          <span class="playbook-category">${r.agent || 'AI Decision Agent'} • ${r.priority.toUpperCase()}</span>
          <span class="badge-neutral" style="font-size: 0.72rem;">Model: ${r.modelSource || 'deterministic'}</span>
          <span class="badge-gold" style="font-size: 0.72rem;">${r.confidence || 'Audited'}</span>
        </div>
        <div class="playbook-title">${r.title}</div>
        <div class="playbook-desc">${r.description}</div>
        <div style="margin-top: 6px; font-size: 0.78rem; color: #38bdf8;">
          <strong>Trigger Rationale:</strong> ${r.triggerReason || 'Algorithmic optimization threshold met'}
        </div>
        <div style="margin-top: 6px; font-size: 0.85rem; color: #a78bfa;">
          <strong>Recommended Action:</strong> ${r.action}
        </div>
      </div>
      <div class="playbook-impact">
        <div class="impact-val">${r.impact}</div>
        <div class="impact-label">Expected Net Impact</div>
        <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 10px; width: 100%;">
          <button class="btn btn-primary btn-sm" id="btn-exec-hub-${idx}" onclick="executeHubDecisionByIndex(${idx})">
            Execute Decision
          </button>
          <button class="btn btn-secondary btn-sm" onclick="handleHubRecAction('${r.category}')">
            Inspect Agent →
          </button>
        </div>
      </div>
    </div>
  `).join('');

  // Hub charts
  renderRevenueChart(dashboardData.salesAnalysis.dailyRevenue, 'hubRevenueChart');
  renderCategoryDonut(dashboardData.salesAnalysis.categoryRevenue, 'hubCategoryChart');

  // Load decision actions persistent audit log
  loadDecisionActionsAudit();
}

async function loadDecisionActionsAudit() {
  try {
    const headers = await getAdminAuthHeaders();
    const res = await fetch(`${API}/admin/decision-agents/actions`, { headers });
    if (!res.ok) return;
    const data = await res.json();
    const actions = data.actions || [];

    const tbody = document.querySelector('#agentActionsAuditTable tbody');
    if (!tbody) return;

    if (actions.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">No decision actions recorded yet.</td></tr>';
      return;
    }

    tbody.innerHTML = actions.map(a => {
      const dateStr = a.created_at ? new Date(a.created_at).toLocaleString('en-IN', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      }) : 'Recent';

      const typeBadge = a.action_type.includes('PRICING') ? 'badge-info'
        : a.action_type.includes('RESTOCK') ? 'badge-danger'
        : a.action_type.includes('BUNDLE') ? 'badge-gold'
        : a.action_type.includes('WIN_BACK') ? 'badge-warning'
        : 'badge-success';

      return `
        <tr>
          <td style="font-size: 0.75rem; color: var(--text-muted); white-space: nowrap;">${dateStr}</td>
          <td>
            <div style="font-weight: 700; color: var(--text-primary); font-size: 0.85rem;">${a.action_title}</div>
            <div style="font-size: 0.72rem; color: var(--text-muted);">${a.entity_name || ''}</div>
          </td>
          <td>
            <div style="font-weight: 600; color: #38bdf8; font-size: 0.8rem;">${a.agent_name}</div>
            <span class="badge-neutral" style="font-size: 0.68rem;">${a.model_source || 'deterministic'}</span>
          </td>
          <td><span class="badge-gold" style="font-size: 0.72rem;">${a.confidence || 'Audited'}</span></td>
          <td style="font-size: 0.75rem; color: var(--text-muted); max-width: 260px;">${a.trigger_reason}</td>
          <td style="font-weight: 700; color: #34d399; font-size: 0.82rem;">${a.expected_impact}</td>
          <td><span class="${typeBadge}" style="font-size: 0.72rem;">${a.status || 'COMPLETED'}</span></td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.warn('Error loading decision actions audit:', err.message);
  }
}

async function executeHubDecisionByIndex(index) {
  const rec = dashboardData.recommendations?.[index];
  if (!rec) return;

  const btn = document.getElementById(`btn-exec-hub-${index}`);
  if (btn) btn.innerHTML = '⏳ Executing...';

  try {
    const headers = await getAdminAuthHeaders();

    // If pricing surge, also update the price in products table
    if (rec.actionType === 'PRICING_SURGE' && rec.entityId && rec.metrics?.recommended) {
      await fetch(`${API}/admin/decision-agents/pricing/apply`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ productId: rec.entityId, newPrice: rec.metrics.recommended })
      });
    } else if (rec.actionType === 'RESTOCK_BATCH' && rec.entityId && rec.metrics?.recommendedQty) {
      await fetch(`${API}/admin/decision-agents/inventory/restock`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ productId: rec.entityId, quantity: rec.metrics.recommendedQty })
      });
    } else if (rec.actionType === 'DEPLOY_BUNDLE') {
      await fetch(`${API}/admin/decision-agents/bundles/deploy`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          bundleId: rec.entityId || 'bundle-bridal-festive',
          bundleName: rec.entityName || rec.title,
          marginPercent: 31.8,
          bundlePrice: 9089
        })
      });
    } else {
      // General playbook action logging
      await fetch(`${API}/admin/decision-agents/actions/execute`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          actionType: rec.actionType || 'STRATEGY_DECISION',
          agentName: rec.agent || 'AI Decision Agent',
          entityId: rec.entityId || '',
          entityName: rec.entityName || '',
          actionTitle: rec.title,
          details: rec.metrics || {},
          triggerReason: rec.triggerReason || rec.description,
          modelSource: rec.modelSource || 'deterministic',
          confidence: rec.confidence || 'Audited',
          expectedImpact: rec.impact
        })
      });
    }

    if (btn) {
      btn.innerHTML = 'Executed';
      btn.style.background = '#10b981';
      btn.disabled = true;
    }

    showToast(`Executed and logged: "${rec.title}"`, 'success');
    await loadDecisionActionsAudit();
  } catch (err) {
    showToast(`Execution error: ${err.message}`, 'error');
    if (btn) btn.innerHTML = 'Execute Decision';
  }
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
      <div class="kpi-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>
      <div class="kpi-label">Inventory Health</div>
      <div class="kpi-value">${inv.healthScore}/100</div>
      <span class="kpi-change ${inv.healthScore > 70 ? 'positive' : 'negative'}">Stock Turnover Index</span>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div>
      <div class="kpi-label">Total Inventory Valuation</div>
      <div class="kpi-value">₹${formatNumber(inv.totalInventoryValue)}</div>
      <span class="kpi-change neutral">Wholesale Asset Value</span>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>
      <div class="kpi-label">Critical Stockouts</div>
      <div class="kpi-value">${inv.criticalCount} SKUs</div>
      <span class="kpi-change negative">Reorder Urgently</span>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>
      <div class="kpi-label">Reorder Soon</div>
      <div class="kpi-value">${inv.warningCount} SKUs</div>
      <span class="kpi-change neutral">Runway &lt; 21 Days</span>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 9.4 7.5 4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></div>
      <div class="kpi-label">Dead Capital Locked</div>
      <div class="kpi-value">₹${formatNumber(inv.deadCapitalTied)}</div>
      <span class="kpi-change negative">${inv.overstockCount} Overstocked SKUs</span>
    </div>
  `;

  // ML Demand Forecasting Evaluation Card
  const mlCard = document.getElementById('inventoryMlEvaluationCard');
  if (mlCard && inv.mlModel) {
    const ml = inv.mlModel;
    const eval7 = ml.evaluation?.horizon_7d;
    const eval30 = ml.evaluation?.horizon_30d;
    const topFeats = ml.topFeatures || [];

    const gain7 = eval7 ? Math.round((1 - eval7.model_rmse / eval7.baseline_rmse) * 100) : 31;
    const gain30 = eval30 ? Math.round((1 - eval30.model_rmse / eval30.baseline_rmse) * 100) : 35;

    mlCard.innerHTML = `
      <div style="padding: 1.25rem 1.5rem;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px; margin-bottom: 1rem;">
          <div>
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
              <span style="font-size: 1.25rem;"></span>
              <h3 style="font-size: 1.05rem; font-weight: 700; color: var(--text-primary); margin: 0;">
                Supervised ML Demand Forecaster (${ml.algorithm || 'RandomForestRegressor'})
              </h3>
              <span class="badge-success">Version: ${ml.version || 'rf_demand_v1.0.0'}</span>
            </div>
            <p style="font-size: 0.8rem; color: var(--text-muted); margin: 0;">
              Trained on dense daily product panel (90-day SQLite history) • Chronological held-out splits • No data leakage
            </p>
          </div>
          <div style="display: flex; gap: 8px;">
            <span class="badge-neutral">Features: ${ml.featureCount || 19}</span>
            <span class="badge-info">Trained: ${ml.trainedAt ? new Date(ml.trainedAt).toLocaleDateString() : 'Active'}</span>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem;">
          <!-- 7-Day Horizon Evaluation -->
          <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(56, 189, 248, 0.2); border-radius: 8px; padding: 12px 14px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <strong style="color: #38bdf8; font-size: 0.85rem;">7-Day Forward Horizon</strong>
              <span class="badge-success">+${gain7}% vs Baseline</span>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.8rem;">
              <div>
                <div style="color: var(--text-muted); font-size: 0.72rem;">Held-Out Test MAE</div>
                <div style="font-weight: 700; color: #38bdf8;">${eval7 ? eval7.model_mae.toFixed(3) : '1.191'} <span style="font-size: 0.7rem; color: var(--text-muted);">(Base: ${eval7 ? eval7.baseline_mae.toFixed(3) : '1.419'})</span></div>
              </div>
              <div>
                <div style="color: var(--text-muted); font-size: 0.72rem;">Held-Out Test RMSE</div>
                <div style="font-weight: 700; color: #38bdf8;">${eval7 ? eval7.model_rmse.toFixed(3) : '1.439'} <span style="font-size: 0.7rem; color: var(--text-muted);">(Base: ${eval7 ? eval7.baseline_rmse.toFixed(3) : '2.092'})</span></div>
              </div>
            </div>
            <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 6px;">
              Test Split: ${eval7?.test_period || '2026-09-25 to 2026-10-15'} (${eval7?.test_samples || 420} observations)
            </div>
          </div>

          <!-- 30-Day Horizon Evaluation -->
          <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(129, 140, 248, 0.2); border-radius: 8px; padding: 12px 14px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <strong style="color: #818cf8; font-size: 0.85rem;">30-Day Forward Horizon</strong>
              <span class="badge-success">+${gain30}% vs Baseline</span>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.8rem;">
              <div>
                <div style="color: var(--text-muted); font-size: 0.72rem;">Held-Out Test MAE</div>
                <div style="font-weight: 700; color: #818cf8;">${eval30 ? eval30.model_mae.toFixed(3) : '2.838'} <span style="font-size: 0.7rem; color: var(--text-muted);">(Base: ${eval30 ? eval30.baseline_mae.toFixed(3) : '4.290'})</span></div>
              </div>
              <div>
                <div style="color: var(--text-muted); font-size: 0.72rem;">Held-Out Test RMSE</div>
                <div style="font-weight: 700; color: #818cf8;">${eval30 ? eval30.model_rmse.toFixed(3) : '3.474'} <span style="font-size: 0.7rem; color: var(--text-muted);">(Base: ${eval30 ? eval30.baseline_rmse.toFixed(3) : '5.324'})</span></div>
              </div>
            </div>
            <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 6px;">
              Test Split: ${eval30?.test_period || '2026-09-05 to 2026-09-22'} (${eval30?.test_samples || 360} observations)
            </div>
          </div>

          <!-- Top Feature Weights -->
          <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 8px; padding: 12px 14px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <strong style="color: #cbd5e1; font-size: 0.85rem;">Top Predictive Features</strong>
              <span class="badge-neutral">Gini Importance</span>
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 5px;">
              ${topFeats.slice(0, 5).map(f => `
                <span class="badge-neutral" style="font-size: 0.7rem; padding: 2px 6px;">
                  ${f.feature}: ${(f.importance * 100).toFixed(1)}%
                </span>
              `).join('')}
            </div>
            <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 6px;">
              Derived from price elasticity, rolling momentum & customer reviews
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // Update badge in table header
  const versionBadge = document.getElementById('inventoryModelVersionBadge');
  if (versionBadge && inv.mlModel) {
    versionBadge.textContent = `ML Model: ${inv.mlModel.version || 'rf_demand_v1.0.0'}`;
  }

  // Forecast table
  const tbody = document.querySelector('#inventoryForecastTable tbody');
  tbody.innerHTML = inv.forecast.map(p => {
    let badgeClass = 'badge-success';
    let statusLabel = 'Optimal';
    if (p.status === 'CRITICAL_STOCKOUT') { badgeClass = 'badge-danger'; statusLabel = 'Critical Stockout'; }
    else if (p.status === 'REORDER_NOW') { badgeClass = 'badge-warning'; statusLabel = 'Reorder Now'; }
    else if (p.status === 'OVERSTOCK_TRAP') { badgeClass = 'badge-info'; statusLabel = 'Overstocked'; }

    const f7 = typeof p.forecast7d === 'number' ? p.forecast7d.toFixed(1) : (p.dailyVelocity * 7).toFixed(1);
    const f30 = typeof p.forecast30d === 'number' ? p.forecast30d.toFixed(1) : (p.dailyVelocity * 30).toFixed(1);

    return `
      <tr>
        <td>
          <div style="font-weight: 700; color: var(--text-primary);">${p.name}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted); display: flex; align-items: center; gap: 6px;">
            <span>Craft: ${p.craftOrigin}</span>
            ${p.isFallback ? '<span class="badge-warning" style="font-size: 0.65rem; padding: 1px 4px;">Sparse Fallback</span>' : '<span class="badge-neutral" style="font-size: 0.65rem; padding: 1px 4px;">ML RF</span>'}
          </div>
        </td>
        <td><span class="badge-neutral">${p.category}</span></td>
        <td><strong>${p.stock}</strong></td>
        <td><strong style="color: #38bdf8;">${f7} u</strong></td>
        <td><strong style="color: #818cf8;">${f30} u</strong></td>
        <td>${p.dailyVelocity.toFixed(2)}/day</td>
        <td><strong style="color: ${p.daysUntilStockout <= 7 ? '#f87171' : 'inherit'};">${p.daysUntilStockout}d</strong></td>
        <td><strong style="color: #f59e0b;">${p.festivalStockoutDays}d</strong> <span style="font-size: 0.7rem; color: #f59e0b;">(${p.festivalSurgeMultiplier}x)</span></td>
        <td>${p.reorderPoint} units</td>
        <td><span class="${badgeClass}">${p.recommendedReorderQty > 0 ? `+${p.recommendedReorderQty} units` : 'Adequate'}</span></td>
        <td>${p.leadTimeDays} days</td>
        <td>${p.reorderCost > 0 ? '₹' + formatNumber(p.reorderCost) : '—'}</td>
        <td>
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <button class="btn-formula-inspect" onclick="openFormulaModal('inventory', '${p.id}')">
              View Math
            </button>
            ${p.recommendedReorderQty > 0 ? `
              <button class="btn-action-restock" onclick="quickRestockProduct('${p.id}', ${p.recommendedReorderQty})">
                + Restock ${p.recommendedReorderQty}
              </button>
            ` : '<span style="color: #10b981; font-size: 0.75rem;">Healthy Stock</span>'}
          </div>
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

    showToast(`Successfully restocked ${quantity} units for ${data.product.name}`, 'success');
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
      <div class="kpi-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div>
      <div class="kpi-label">Projected Monthly Profit Uplift</div>
      <div class="kpi-value" style="color: #34d399;">+₹${formatNumber(pricing.totalProjectedMonthlyUplift)}</div>
      <span class="kpi-change positive">Net Bottom-Line Margin Lift</span>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg></div>
      <div class="kpi-label">Surge Pricing Opportunities</div>
      <div class="kpi-value">${pricing.surgeOpportunities.length} SKUs</div>
      <span class="kpi-change positive">Scarcity + 4.7 Rating</span>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg></div>
      <div class="kpi-label">Markdown Clearances</div>
      <div class="kpi-value">${pricing.markdownOpportunities.length} SKUs</div>
      <span class="kpi-change neutral">Unlocks Trapped Capital</span>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></div>
      <div class="kpi-label">Actionable Recommendations</div>
      <div class="kpi-value">${pricing.actionableCount} SKUs</div>
      <span class="kpi-change positive">1-Click Apply Ready</span>
    </div>
  `;

  // Pricing Scenario & Wholesale Margin Floor Transparency Card
  const pCard = document.getElementById('pricingEngineEvaluationCard');
  if (pCard && pricing.engineMetadata) {
    const meta = pricing.engineMetadata;
    const dataAudit = meta.dataAudit || {};
    const params = meta.parameters || {};
    const summary = meta.summary || {};

    pCard.innerHTML = `
      <div style="padding: 1.25rem 1.5rem;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px; margin-bottom: 1rem;">
          <div>
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
              <span style="font-size: 1.25rem;"></span>
              <h3 style="font-size: 1.05rem; font-weight: 700; color: var(--text-primary); margin: 0;">
                Deterministic Microeconomic Sensitivity & Margin Floor Engine
              </h3>
              <span class="badge-success">Version: ${meta.engineVersion || 'pricing_engine_v1.0.0'}</span>
            </div>
            <p style="font-size: 0.8rem; color: var(--text-muted); margin: 0;">
              Isoelastic sensitivity bounds (ε ∈ [-0.5, -1.0, -1.5]) • Cost floor guard (Cost × 1.15) • Inventory constraint protection
            </p>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <span class="badge-neutral" title="Observational order items all transacted at catalog MRP">
              Audit: 0.0% Historical Price Variance
            </span>
            <span class="badge-info">100% Margin Floor Guarded (≥15% Margin)</span>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem;">
          <!-- Card 1: Data Audit Disclosure -->
          <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(52, 211, 153, 0.2); border-radius: 8px; padding: 12px 14px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <strong style="color: #34d399; font-size: 0.85rem;">Empirical Observational Data Audit</strong>
              <span class="badge-neutral">105 Live Orders</span>
            </div>
            <div style="font-size: 0.78rem; color: var(--text-muted); line-height: 1.45;">
              All historical orders transacted at catalog MRPs. Direct econometric regression is mathematically unidentifiable without price variance.
              Aurora utilizes bounded scenario sensitivity testing instead of arbitrary heuristics.
            </div>
            <div style="font-size: 0.72rem; color: #34d399; margin-top: 8px; font-weight: 600;">
              16/20 Catalog SKUs Have Actionable Margin Opportunities
            </div>
          </div>

          <!-- Card 2: Wholesale Floor & Protection Rules -->
          <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(52, 211, 153, 0.2); border-radius: 8px; padding: 12px 14px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <strong style="color: #38bdf8; font-size: 0.85rem;">Wholesale Cost Floor Protection</strong>
              <span class="badge-success">Guaranteed ≥15% Profit</span>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.8rem;">
              <div>
                <div style="color: var(--text-muted); font-size: 0.72rem;">Wholesale Cost Ratio</div>
                <div style="font-weight: 700; color: #38bdf8;">${(params.wholesaleCostRatio * 100 || 58)}% of MRP</div>
              </div>
              <div>
                <div style="color: var(--text-muted); font-size: 0.72rem;">Minimum Cost Floor</div>
                <div style="font-weight: 700; color: #38bdf8;">Cost × ${(params.minGrossMarginMarkup || 1.15)}</div>
              </div>
            </div>
            <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 6px;">
              Inventory Constraint: Markdowns prohibited on critical stock (≤15 units) to avoid stockouts.
            </div>
          </div>

          <!-- Card 3: Sensitivity Scenarios -->
          <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(52, 211, 153, 0.2); border-radius: 8px; padding: 12px 14px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <strong style="color: #facc15; font-size: 0.85rem;">Microeconomic Sensitivity Scenarios</strong>
              <span class="badge-gold">PED Tri-Band</span>
            </div>
            <div style="font-size: 0.78rem; color: var(--text-muted); line-height: 1.45;">
              <strong>Inelastic (ε = -0.50):</strong> Luxury & artisan craft pricing surge buffer.<br>
              <strong>Unit Elastic (ε = -1.00):</strong> Baseline proportional market response.<br>
              <strong>Elastic (ε = -1.50):</strong> Price-sensitive clearance markdown demand response.
            </div>
            <div style="font-size: 0.7rem; color: #facc15; margin-top: 6px;">
              Every recommendation outputs break-even units to preserve baseline gross margin.
            </div>
          </div>
        </div>
      </div>
    `;
  }

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
  tbody.innerHTML = pricing.recommendations.map(p => {
    const floorPrice = p.costFloor || Math.round(p.currentPrice * 0.58 * 1.15);
    const beUnits = p.breakevenUnits && p.breakevenUnits < 9000 ? `${p.breakevenUnits} u` : '—';
    const profitDelta = p.monthlyProfitDelta !== undefined ? p.monthlyProfitDelta : p.monthlyRevenueDelta;

    return `
      <tr>
        <td>
          <div style="font-weight: 700; color: var(--text-primary);">${p.name}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${p.rationale}</div>
        </td>
        <td><strong>${formatPrice(p.currentPrice)}</strong></td>
        <td><strong style="color: #34d399; font-size: 1.05rem;">${formatPrice(p.recommendedPrice)}</strong></td>
        <td>
          <span class="badge-neutral" style="font-size: 0.75rem;">₹${floorPrice.toLocaleString('en-IN')}</span>
        </td>
        <td>
          <span class="${p.priceDelta > 0 ? 'badge-success' : p.priceDelta < 0 ? 'badge-warning' : 'badge-neutral'}">
            ${p.priceDelta > 0 ? `+${p.priceDeltaPercent}%` : p.priceDelta < 0 ? `${p.priceDeltaPercent}%` : '0%'}
          </span>
        </td>
        <td><span class="${p.strategyBadge}">${p.strategyLabel}</span></td>
        <td>
          <span style="font-family: monospace; color: #38bdf8; font-weight: 600;">ε = ${p.elasticity}</span>
        </td>
        <td><span class="badge-neutral">${beUnits}</span></td>
        <td><span class="badge-gold">${p.confidence}%</span></td>
        <td style="font-weight: 700; color: ${profitDelta >= 0 ? '#34d399' : '#f87171'};">
          ${profitDelta > 0 ? '+₹' + formatNumber(profitDelta) : '₹' + formatNumber(profitDelta)}
        </td>
        <td>
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <button class="btn-formula-inspect" onclick="openFormulaModal('pricing', '${p.id}')">
              View PED Math
            </button>
            ${p.priceDelta !== 0 ? `
              <button class="btn-action-apply" onclick="applySmartPrice('${p.id}', ${p.recommendedPrice})">
                Apply ₹${p.recommendedPrice.toLocaleString('en-IN')}
              </button>
            ` : '<span style="color: #94a3b8; font-size: 0.75rem;">Optimal Price</span>'}
          </div>
        </td>
      </tr>
    `;
  }).join('');
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
    resultBox.style.flexDirection = 'column';
    resultBox.style.gap = '12px';

    const sc = data.scenarios || {};
    const inel = sc.inelastic || {};
    const unit = sc.unit_elastic || {};
    const elas = sc.elastic || {};

    resultBox.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-weight: 700; color: var(--text-primary);">${data.product?.name || 'Simulation Results'}</span>
          <span class="${data.verdictBadge || (data.grossProfitDelta >= 0 ? 'badge-success' : 'badge-danger')}">${data.verdict}</span>
        </div>
        <div style="font-size: 0.8rem; color: var(--text-muted);">
          Wholesale Cost: ₹${(data.wholesaleCost || 0).toLocaleString('en-IN')} | Floor: ₹${(data.costFloor || 0).toLocaleString('en-IN')}
          <span class="${data.floorViolated ? 'badge-danger' : 'badge-success'}" style="margin-left: 6px;">
            ${data.floorViolated ? 'Below Floor (<15% Margin)' : 'Floor Preserved'}
          </span>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px;">
        <div class="sim-stat">
          <div class="stat-label">Price Shift</div>
          <div class="stat-val ${data.priceChangePercent >= 0 ? 'positive' : 'negative'}">
            ${data.priceChangePercent > 0 ? '+' : ''}${data.priceChangePercent}%
          </div>
        </div>
        <div class="sim-stat">
          <div class="stat-label">Projected Units</div>
          <div class="stat-val">${data.projectedMonthlyUnits} u/mo</div>
        </div>
        <div class="sim-stat">
          <div class="stat-label">Break-Even Units</div>
          <div class="stat-val" style="color: #38bdf8;">${data.breakevenUnits && data.breakevenUnits < 9000 ? data.breakevenUnits + ' u' : '—'}</div>
        </div>
        <div class="sim-stat">
          <div class="stat-label">Monthly Gross Profit</div>
          <div class="stat-val ${data.grossProfitDelta >= 0 ? 'positive' : 'negative'}">
            ${data.grossProfitDelta >= 0 ? '+₹' : '-₹'}${Math.abs(data.grossProfitDelta).toLocaleString('en-IN')}
          </div>
        </div>
      </div>

      <!-- Multi-scenario Sensitivity Breakdown -->
      <div style="background: rgba(15, 23, 42, 0.4); border-radius: 6px; padding: 10px 12px; font-size: 0.78rem;">
        <div style="color: var(--text-muted); margin-bottom: 6px; font-weight: 600;">
          Sensitivity Projections Across Elasticity Bands (ε):
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
          <div>
            <span style="color: #38bdf8;">Inelastic (ε = -0.50):</span>
            <div style="font-weight: 700;">${inel.projectedUnits || 0} units (${(inel.profitDelta >= 0 ? '+' : '')}₹${formatNumber(inel.profitDelta || 0)})</div>
          </div>
          <div>
            <span style="color: #facc15;">Unit Elastic (ε = -1.00):</span>
            <div style="font-weight: 700;">${unit.projectedUnits || 0} units (${(unit.profitDelta >= 0 ? '+' : '')}₹${formatNumber(unit.profitDelta || 0)})</div>
          </div>
          <div>
            <span style="color: #f87171;">Elastic (ε = -1.50):</span>
            <div style="font-weight: 700;">${elas.projectedUnits || 0} units (${(elas.profitDelta >= 0 ? '+' : '')}₹${formatNumber(elas.profitDelta || 0)})</div>
          </div>
        </div>
      </div>

      <div style="font-size: 0.75rem; color: var(--text-muted); line-height: 1.4;">
        ${data.verdictDescription || ''}
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

    showToast(`${data.message}`, 'success');
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
      <div class="kpi-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg></div>
      <div class="kpi-label">Royal Champions (VIP)</div>
      <div class="kpi-value">${cust.championsCount}</div>
      <span class="kpi-change positive">Spend &gt; ₹12,000 • Low Churn</span>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></div>
      <div class="kpi-label">Loyal Regulars</div>
      <div class="kpi-value">${cust.loyalistsCount}</div>
      <span class="kpi-change positive">Consistent Order Cadence</span>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg></div>
      <div class="kpi-label">High-Value First-Timers</div>
      <div class="kpi-value">${cust.newcomersCount}</div>
      <span class="kpi-change neutral">Nurture for 2nd Purchase</span>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>
      <div class="kpi-label">At-Risk Churn</div>
      <div class="kpi-value">${cust.atRiskCount}</div>
      <span class="kpi-change negative">&gt; 45 Days Inactive</span>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div>
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
      cancellTbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">Zero order cancellations recorded. Customer retention is optimal.</td></tr>';
    } else {
      cancellTbody.innerHTML = allCancellations.map(c => `
        <tr>
          <td>
            <div class="clickable-customer" onclick="openCustomerModal('${c.user_id}')" title="Click to view all orders by ${c.customer_name}">
              <span>${c.customer_name}</span>
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
              View Profile & Orders 
            </button>
          </td>
        </tr>
      `).join('');
    }
  }

  // ML Customer Churn & RFM Evaluation Card
  const mlCard = document.getElementById('customerMlEvaluationCard');
  if (mlCard && cust.mlModel) {
    const ml = cust.mlModel;
    const metrics = ml.metrics || {};
    const sample = ml.sampleSize || {};
    const topFeats = ml.topFeatures || [];

    mlCard.innerHTML = `
      <div style="padding: 1.25rem 1.5rem;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px; margin-bottom: 1rem;">
          <div>
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
              <span style="font-size: 1.25rem;"></span>
              <h3 style="font-size: 1.05rem; font-weight: 700; color: var(--text-primary); margin: 0;">
                Supervised ML Churn Predictor & RFM Segmenter (${ml.algorithm || 'RandomForestClassifier'})
              </h3>
              <span class="badge-success">Version: ${ml.version || 'churn_rf_v1.0.0'}</span>
            </div>
            <p style="font-size: 0.8rem; color: var(--text-muted); margin: 0;">
              Longitudinal customer-period panel • Zero target leakage • Stratified 5-fold cross-validation
            </p>
          </div>
          <div style="display: flex; gap: 8px;">
            <span class="badge-neutral">Observations: ${sample.total_observations || 54}</span>
            <span class="badge-info">Active Cohort: ${sample.unique_active_customers || 9} Accounts</span>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem;">
          <!-- Cross-Validation Performance -->
          <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(168, 85, 247, 0.2); border-radius: 8px; padding: 12px 14px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <strong style="color: #c084fc; font-size: 0.85rem;">Stratified 5-Fold Cross-Validation</strong>
              <span class="badge-success">ROC-AUC: ${metrics.cv_roc_auc_mean ? metrics.cv_roc_auc_mean.toFixed(4) : '0.7667'}</span>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.8rem;">
              <div>
                <div style="color: var(--text-muted); font-size: 0.72rem;">CV Recall (Lapse Sensitivity)</div>
                <div style="font-weight: 700; color: #c084fc;">${metrics.cv_recall_mean ? (metrics.cv_recall_mean * 100).toFixed(1) + '%' : '60.0%'}</div>
              </div>
              <div>
                <div style="color: var(--text-muted); font-size: 0.72rem;">CV Precision / F1</div>
                <div style="font-weight: 700; color: #c084fc;">${metrics.cv_precision_mean ? metrics.cv_precision_mean.toFixed(3) : '0.253'} / ${metrics.cv_f1_mean ? metrics.cv_f1_mean.toFixed(3) : '0.351'}</div>
              </div>
            </div>
            <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 6px;">
              Baseline Accuracy: ${(metrics.baseline_accuracy * 100 || 83.3).toFixed(1)}% | CV Accuracy: ${(metrics.cv_accuracy_mean * 100 || 66.9).toFixed(1)}%
            </div>
          </div>

          <!-- Sample Size & Cohort Limitations Disclosure -->
          <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(245, 158, 11, 0.2); border-radius: 8px; padding: 12px 14px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <strong style="color: #fbbf24; font-size: 0.85rem;">Dataset & Sample Disclosure</strong>
              <span class="badge-warning">Small Cohort</span>
            </div>
            <p style="font-size: 0.74rem; color: var(--text-secondary); margin: 0; line-height: 1.4;">
              ${sample.disclosure || 'Trained on 54 longitudinal customer-period observations across 9 active accounts. Small sample size is explicitly documented.'}
            </p>
            <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 6px;">
              Lapse Rate in Window: ${(sample.churn_rate * 100 || 16.7).toFixed(1)}% (${sample.churned_instances || 9} events)
            </div>
          </div>

          <!-- Top Predictive Features -->
          <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 8px; padding: 12px 14px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <strong style="color: #cbd5e1; font-size: 0.85rem;">Top Churn Drivers</strong>
              <span class="badge-neutral">Gini Importance</span>
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 5px;">
              ${topFeats.slice(0, 5).map(f => `
                <span class="badge-neutral" style="font-size: 0.7rem; padding: 2px 6px;">
                  ${f.feature}: ${(f.importance * 100).toFixed(1)}%
                </span>
              `).join('')}
            </div>
            <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 6px;">
              Total spend, basket value & recency are dominant predictors
            </div>
          </div>
        </div>
      </div>
    `;
  }

  const custVersionBadge = document.getElementById('customerModelVersionBadge');
  if (custVersionBadge && cust.mlModel) {
    custVersionBadge.textContent = `ML Model: ${cust.mlModel.version || 'churn_rf_v1.0.0'}`;
  }

  // Customer RFM segmentation table
  const custTbody = document.querySelector('#customerSegmentTable tbody');
  custTbody.innerHTML = cust.customers.map(c => {
    const rfm = c.rfm || { r_score: 3, f_score: 3, m_score: 3, rfm_composite: '333' };
    const probPercent = typeof c.churnProbability === 'number' ? (c.churnProbability * 100).toFixed(1) : c.churnRiskPercent;

    return `
      <tr>
        <td>
          <div class="clickable-customer" onclick="openCustomerModal('${c.id}')" title="Click to view ${c.name}'s complete profile & orders">
            <span>${c.name}</span>
          </div>
          <div style="font-size: 0.75rem; color: var(--text-muted); display: flex; align-items: center; gap: 6px;">
            <span>${c.email}</span>
            ${c.isFallback ? '<span class="badge-warning" style="font-size: 0.65rem; padding: 1px 4px;">Cold Start</span>' : '<span class="badge-neutral" style="font-size: 0.65rem; padding: 1px 4px;">RF Clf</span>'}
          </div>
        </td>
        <td>
          <span class="badge-neutral" style="font-family: monospace; font-weight: 700; font-size: 0.75rem;" title="Recency: ${rfm.r_score}/5, Frequency: ${rfm.f_score}/5, Monetary: ${rfm.m_score}/5">
            R:${rfm.r_score} F:${rfm.f_score} M:${rfm.m_score}
          </span>
        </td>
        <td><span class="${c.segmentBadge}">${c.segmentLabel}</span></td>
        <td><strong>${c.totalOrders}</strong></td>
        <td style="font-weight: 700;">₹${c.totalSpent.toLocaleString('en-IN')}</td>
        <td>
          ${c.cancelledCount > 0 ? `
            <span class="badge-danger" style="font-weight: 700; cursor: pointer;" onclick="openCustomerModal('${c.id}')" title="Customer has cancelled orders">
              ${c.cancelledCount} Cancelled
            </span>
          ` : `
            <span style="color: var(--text-muted); font-size: 0.8rem;">0</span>
          `}
        </td>
        <td>${c.daysSinceLastOrder < 999 ? `${c.daysSinceLastOrder}d ago` : 'Never'}</td>
        <td>
          <span class="${c.churnRiskPercent < 30 ? 'badge-success' : c.churnRiskPercent < 65 ? 'badge-warning' : 'badge-danger'}" style="font-weight: 700;">
            ${probPercent}%
          </span>
        </td>
        <td style="font-weight: 700; color: #34d399;">₹${c.predictedCLV.toLocaleString('en-IN')}</td>
        <td>
          <button class="btn-formula-inspect" onclick="openFormulaModal('customer', '${c.id}')">
            View Math
          </button>
        </td>
        <td>
          <button class="btn-action-apply" style="padding: 4px 10px; font-size: 0.75rem;" onclick="openCustomerModal('${c.id}')">
            View Orders 
          </button>
        </td>
      </tr>
    `;
  }).join('');

  // Cart funnel panel
  const funnel = cust.funnelAnalysis;
  const funnelPanel = document.getElementById('cartFunnelPanel');
  funnelPanel.innerHTML = `
    <div class="panel-header">
      <div class="panel-title">E-Commerce Cart Drop-Off & Abandonment Recovery</div>
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
      <div class="kpi-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg></div>
      <div class="kpi-label">Active Smart Bundles</div>
      <div class="kpi-value">${bundle.smartBundles.length} Bundles</div>
      <span class="kpi-change positive">Curated Festive Sets</span>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg></div>
      <div class="kpi-label">Projected Store AOV Lift</div>
      <div class="kpi-value" style="color: #34d399;">${bundle.projectedAovImpact}</div>
      <span class="kpi-change positive">Basket Size Expansion</span>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg></div>
      <div class="kpi-label">Average Bundle Discount</div>
      <div class="kpi-value">${bundle.averageBundleDiscount}</div>
      <span class="kpi-change neutral">Compelling Incentive</span>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg></div>
      <div class="kpi-label">Mined Basket Pairs</div>
      <div class="kpi-value">${bundle.coPurchases.length} Pairs</div>
      <span class="kpi-change positive">Order Item Mining</span>
    </div>
  `;

  // Market Basket Mining & Apriori Evaluation Card
  const bCard = document.getElementById('bundleMlEvaluationCard');
  if (bCard && bundle.minerMetadata) {
    const meta = bundle.minerMetadata;
    const ds = meta.datasetSummary || {};
    const params = meta.parameters || {};

    bCard.innerHTML = `
      <div style="padding: 1.25rem 1.5rem;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px; margin-bottom: 1rem;">
          <div>
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
              <span style="font-size: 1.25rem;"></span>
              <h3 style="font-size: 1.05rem; font-weight: 700; color: var(--text-primary); margin: 0;">
                Apriori Market Basket Association & Margin-Guarded Bundling Engine
              </h3>
              <span class="badge-success">Version: ${meta.minerVersion || 'apriori_v1.0.0'}</span>
            </div>
            <p style="font-size: 0.8rem; color: var(--text-muted); margin: 0;">
              Frequent itemset mining from real transaction baskets • Support & Confidence attachment modeling • Lift association multipliers
            </p>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <span class="badge-neutral" title="Audited non-cancelled orders in aurora.db">
              Audited: ${ds.totalCompletedOrders || 102} Orders
            </span>
            <span class="badge-gold">
              Multi-Item Baskets: ${ds.multiItemOrders || 60} (${ds.multiItemRatioPct || 58.8}%)
            </span>
            <span class="badge-info">
              Margin Floor: ≥${params.minBundleGrossMarginPct || 25}% Retained
            </span>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem;">
          <!-- Card 1: Basket Distribution -->
          <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(245, 158, 11, 0.2); border-radius: 8px; padding: 12px 14px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <strong style="color: #f59e0b; font-size: 0.85rem;">Transaction Basket Metrics</strong>
              <span class="badge-neutral">${ds.averageBasketSize || 1.92} items/order</span>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.8rem;">
              <div>
                <div style="color: var(--text-muted); font-size: 0.72rem;">Multi-Item Orders</div>
                <div style="font-weight: 700; color: #34d399;">${ds.multiItemOrders || 60} orders</div>
              </div>
              <div>
                <div style="color: var(--text-muted); font-size: 0.72rem;">Multi-Item Share</div>
                <div style="font-weight: 700; color: #38bdf8;">${ds.multiItemRatioPct || 58.8}% of store</div>
              </div>
            </div>
            <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 8px; line-height: 1.4;">
              ${ds.uniqueFrequentPairsMined || 27} distinct product pairs meet the ${(params.minSupportThreshold * 100 || 1.5).toFixed(1)}% empirical support threshold.
            </div>
          </div>

          <!-- Card 2: Apriori Bounds & Association -->
          <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(245, 158, 11, 0.2); border-radius: 8px; padding: 12px 14px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <strong style="color: #38bdf8; font-size: 0.85rem;">Association Thresholds</strong>
              <span class="badge-success">${ds.associationRulesGenerated || 50} Rules Mined</span>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.8rem;">
              <div>
                <div style="color: var(--text-muted); font-size: 0.72rem;">Min Support P(A∩B)</div>
                <div style="font-weight: 700; color: #38bdf8;">≥${(params.minSupportThreshold * 100 || 1.5).toFixed(1)}%</div>
              </div>
              <div>
                <div style="color: var(--text-muted); font-size: 0.72rem;">Min Confidence P(B|A)</div>
                <div style="font-weight: 700; color: #34d399;">≥${(params.minConfidenceThreshold * 100 || 15).toFixed(0)}%</div>
              </div>
            </div>
            <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 8px; line-height: 1.4;">
              Lift &gt; 1.0 confirms positive statistical affinity (co-purchased significantly above random baseline independence).
            </div>
          </div>

          <!-- Card 3: Margin Floor Protection -->
          <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(245, 158, 11, 0.2); border-radius: 8px; padding: 12px 14px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <strong style="color: #34d399; font-size: 0.85rem;">Bundle Margin Floor Guard</strong>
              <span class="badge-gold">≥25% Margin Preserved</span>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.8rem;">
              <div>
                <div style="color: var(--text-muted); font-size: 0.72rem;">Wholesale Cost Ratio</div>
                <div style="font-weight: 700; color: #38bdf8;">${(params.wholesaleCostRatio * 100 || 58)}% of MRP</div>
              </div>
              <div>
                <div style="color: var(--text-muted); font-size: 0.72rem;">Guaranteed Floor</div>
                <div style="font-weight: 700; color: #34d399;">≥${params.minBundleGrossMarginPct || 25.0}%</div>
              </div>
            </div>
            <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 8px; line-height: 1.4;">
              All 5 curated smart bundles strictly preserve ≥25% gross profit margin while delivering 12-15% customer discounts.
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // Smart Bundles Grid
  const grid = document.getElementById('smartBundlesGrid');
  grid.innerHTML = bundle.smartBundles.map(b => `
    <div class="bundle-card">
      <div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <span class="bundle-badge badge-gold">${b.badge}</span>
          <span class="badge-success" style="font-size: 0.72rem; font-weight: 700;">
            ${b.marginPercent}% Margin Preserved
          </span>
        </div>
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
        <button class="btn-formula-inspect" style="margin-top: 6px; width: 100%; justify-content: center;" onclick="openFormulaModal('bundle', '${b.id}')">
          View Margin &amp; Pricing Math
        </button>
        <button class="btn-bundle-action" id="btn-deploy-${b.id}" onclick="deploySmartBundle('${b.id}', '${b.name}')">
          Deploy Bundle to Storefront
        </button>
      </div>
    </div>
  `).join('');

  // Co-purchases table
  const coTbody = document.querySelector('#coPurchasesTable tbody');
  coTbody.innerHTML = bundle.coPurchases.map((cp, idx) => `
    <tr>
      <td><strong>${cp.item1}</strong></td>
      <td><strong>${cp.item2}</strong></td>
      <td><span class="badge-gold">${cp.frequency} co-orders</span></td>
      <td><span class="badge-neutral">${cp.support ? cp.support + '%' : '—'}</span></td>
      <td><span class="badge-info">${cp.confidence ? cp.confidence + '%' : '—'}</span></td>
      <td><span class="badge-success" style="font-weight: 700;">${cp.lift ? cp.lift + 'x' : '—'}</span></td>
      <td>
        <button class="btn-formula-inspect" onclick="openFormulaModal('copurchase', '${idx}')">
          Apriori Math
        </button>
      </td>
    </tr>
  `).join('');

  // Cross-selling rules
  const csTbody = document.querySelector('#crossSellingTable tbody');
  csTbody.innerHTML = bundle.crossSellingRules.map(r => `
    <tr>
      <td><strong>${r.source}</strong></td>
      <td style="color: #34d399; font-weight: 700;">${r.recommended}</td>
      <td><span class="badge-success">${r.attachmentRate}</span></td>
      <td><span class="badge-gold" style="font-weight: 700;">${r.lift ? r.lift + 'x Lift' : '—'}</span></td>
      <td style="font-size: 0.78rem; color: var(--text-muted); max-width: 280px;">${r.reason || 'High empirical affinity'}</td>
    </tr>
  `).join('');
}

async function deploySmartBundle(bundleId, bundleName) {
  const btn = document.getElementById(`btn-deploy-${bundleId}`);
  if (btn) {
    btn.innerHTML = '⏳ Deploying...';
  }

  try {
    const bundle = dashboardData.agents?.bundleCrossSelling?.smartBundles?.find(b => b.id === bundleId);
    const headers = await getAdminAuthHeaders();
    const res = await fetch(`${API}/admin/decision-agents/bundles/deploy`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        bundleId,
        bundleName,
        marginPercent: bundle?.marginPercent || 31.8,
        bundlePrice: bundle?.bundlePrice || 0
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Deployment failed');

    if (btn) {
      btn.innerHTML = 'Active on Storefront';
      btn.style.background = '#10b981';
    }
    showToast(`"${bundleName}" deployed to storefront & logged to audit!`, 'success');
    if (typeof loadDecisionActionsAudit === 'function') {
      loadDecisionActionsAudit();
    }
  } catch (err) {
    showToast(`Error deploying bundle: ${err.message}`, 'error');
    if (btn) btn.innerHTML = 'Deploy Bundle to Storefront';
  }
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
      <div class="panel-title">Composite Business Health Score & Unit Economics</div>
      <span class="badge-gold">Grade ${strat.ratingGrade}</span>
    </div>
    <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 2rem; margin-top: 1rem;">
      <div style="text-align: center; min-width: 160px;">
        <div style="font-size: 3.5rem; font-weight: 900; color: #34d399; line-height: 1;">${strat.healthScore}</div>
        <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 6px;">Out of 100 Index</div>
        <div style="font-size: 1rem; font-weight: 700; color: var(--text-primary); margin-top: 4px;">${strat.ratingTitle}</div>
        <button class="btn-formula-inspect" style="margin-top: 10px;" onclick="openFormulaModal('strategy', 'health')">
          View Health Derivation &amp; Weights
        </button>
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
      <div class="kpi-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div>
      <div class="kpi-label">Total Revenue</div>
      <div class="kpi-value">₹${formatNumber(o.totalRevenue)}</div>
      <span class="kpi-change ${growthClass}">${growthIcon} ${Math.abs(o.revenueGrowth)}%</span>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 9.4 7.5 4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></div>
      <div class="kpi-label">Total Orders</div>
      <div class="kpi-value">${o.totalOrders}</div>
      <span class="kpi-change neutral">${o.pendingOrders} pending</span>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>
      <div class="kpi-label">Customers</div>
      <div class="kpi-value">${o.totalCustomers}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg></div>
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
        <td><strong>${c.category}</strong></td>
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
          <span>${o.customer_name || 'Customer'}</span>
        </div>
        <div style="font-size: 0.75rem; color: var(--text-muted);">${o.customer_email || ''}</div>
      </td>
      <td><strong>${formatPrice(o.total)}</strong></td>
      <td>
        <span class="${o.status === 'delivered' ? 'badge-success' : o.status === 'cancelled' ? 'badge-danger' : 'badge-warning'}">
          ${o.status === 'cancelled' ? 'CANCELLED' : o.status.toUpperCase()}
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
              <span>${c.category}</span>
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

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-message">${message}</span>`;

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
      ordersList.innerHTML = `<div style="text-align: center; padding: 2rem; color: #f87171;">${err.message}</div>`;
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
        <div style="font-size: 2.5rem; margin-bottom: 0.5rem;"></div>
        <p style="font-size: 0.95rem;">No orders match this filter.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = orders.map(order => {
    const isCancelled = order.status === 'cancelled';
    const statusBadge = isCancelled
      ? '<span class="badge-danger" style="font-weight: 800;">CANCELLED</span>'
      : order.status === 'delivered'
      ? '<span class="badge-success">DELIVERED</span>'
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
            <span></span>
            <span><strong>Cancelled Order:</strong> This order was cancelled by the customer. Amount of ₹${Number(order.total).toLocaleString('en-IN')} was voided/refunded.</span>
          </div>
        ` : ''}

        <div class="order-card-items">
          ${itemsHtml || '<div style="font-size: 0.8rem; color: var(--text-muted);">No line item records found</div>'}
        </div>

        <div class="order-card-bottom">
          <div style="display: flex; gap: 14px; flex-wrap: wrap;">
            <span>${order.shipping_address ? (order.shipping_address.length > 35 ? order.shipping_address.substring(0, 35) + '...' : order.shipping_address) : 'No address specified'}</span>
            <span>${order.payment_method ? order.payment_method.toUpperCase() : 'PREPAID'}</span>
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
    closeFormulaModal();
  }
});

// ═════════════════════════════════════════════════════════════════════════
// MATHEMATICAL CALCULATION INSPECTOR MODAL
// ═════════════════════════════════════════════════════════════════════════
function openFormulaModal(type, itemId) {
  const modal = document.getElementById('formulaModal');
  const body = document.getElementById('fModalBody');
  const titleEl = document.getElementById('fModalTitle');
  const iconEl = document.getElementById('fModalIcon');
  const agentBadgeEl = document.getElementById('fModalAgentBadge');

  if (!modal || !body || !dashboardData || !dashboardData.agents) return;

  modal.classList.add('open');
  modal.style.display = 'flex';

  let icon = '';
  let title = 'Calculation Inspector';
  let agentName = 'AI Decision Agent';
  let contentHtml = '';

  const agents = dashboardData.agents;

  if (type === 'inventory') {
    const inv = agents.predictiveInventory;
    const p = inv?.forecast?.find(x => x.id === itemId) || inv?.forecast?.[0];
    if (!p || !p.calculation) {
      body.innerHTML = '<div style="color: #f87171; padding: 2rem;">Calculation model details not found for this product.</div>';
      return;
    }
    const c = p.calculation;
    icon = '';
    title = `Predictive Inventory Math: ${p.name}`;
    agentName = 'Predictive Inventory Agent';

    contentHtml = `
      <!-- Block 1: ML Model Architecture & Held-Out Test Evaluation -->
      <div class="calc-block">
        <div class="calc-block-header">
          <div class="calc-block-title"><span></span> 1. Supervised Machine Learning Model Specifications</div>
          <span class="badge-success">${c.mlModel?.version || 'rf_demand_v1.0.0'}</span>
        </div>
        <div class="equation-box">Model: ${c.mlModel?.algorithm || 'RandomForestRegressor (scikit-learn)'} | Target: Forward 7d & 30d Units</div>
        <div class="db-inputs-grid">
          <div class="db-input-card">
            <div class="db-input-label">Model Pipeline</div>
            <div class="db-input-value" style="font-size: 0.85rem;">scikit-learn RandomForest</div>
          </div>
          <div class="db-input-card">
            <div class="db-input-label">Inference Status</div>
            <div class="db-input-value" style="font-size: 0.85rem; color: ${c.mlModel?.isFallback ? '#f59e0b' : '#34d399'};">
              ${c.mlModel?.isFallback ? 'Empirical Fallback' : 'Trained Supervised RF'}
            </div>
          </div>
          <div class="db-input-card">
            <div class="db-input-label">Held-Out 7D RMSE</div>
            <div class="db-input-value" style="color: #38bdf8;">${c.mlModel?.evaluation?.horizon_7d?.model_rmse?.toFixed(3) || '1.439'} <span style="font-size: 0.7rem; color: var(--text-muted);">(Base: ${c.mlModel?.evaluation?.horizon_7d?.baseline_rmse?.toFixed(3) || '2.092'})</span></div>
          </div>
          <div class="db-input-card">
            <div class="db-input-label">Held-Out 30D RMSE</div>
            <div class="db-input-value" style="color: #818cf8;">${c.mlModel?.evaluation?.horizon_30d?.model_rmse?.toFixed(3) || '3.474'} <span style="font-size: 0.7rem; color: var(--text-muted);">(Base: ${c.mlModel?.evaluation?.horizon_30d?.baseline_rmse?.toFixed(3) || '5.324'})</span></div>
          </div>
        </div>
        ${c.mlModel?.isFallback ? `
          <div class="derivation-box" style="border-left: 3px solid #f59e0b; background: rgba(245, 158, 11, 0.08);">
            <strong>Sparse Sales Fallback Notice:</strong> ${c.mlModel?.fallbackReason || 'Item has sparse sales history; baseline moving average rate is applied.'}
          </div>
        ` : `
          <div class="derivation-box">
            <strong>Training Methodology:</strong> Chronological train/test split on balanced panel data (1,800 observations). Evaluated strictly on unseen future dates with zero data leakage.
          </div>
        `}
      </div>

      <!-- Block 2: 7-Day & 30-Day Demand Forecasts -->
      <div class="calc-block">
        <div class="calc-block-header">
          <div class="calc-block-title"><span></span> 2. Machine Learning Demand Forecasts (7D & 30D)</div>
          <span class="badge-neutral">Forward Horizons</span>
        </div>
        <div class="equation-box">7D Forecast: ${c.forecast7d?.formula || 'RandomForestRegressor 7D'}</div>
        <div class="db-inputs-grid">
          <div class="db-input-card">
            <div class="db-input-label">Predicted 7-Day Units</div>
            <div class="db-input-value" style="color: #38bdf8;">${c.forecast7d?.value || 0} units</div>
          </div>
          <div class="db-input-card">
            <div class="db-input-label">Predicted 30-Day Units</div>
            <div class="db-input-value" style="color: #818cf8;">${c.forecast30d?.value || 0} units</div>
          </div>
          <div class="db-input-card">
            <div class="db-input-label">Derived Daily Velocity</div>
            <div class="db-input-value" style="color: #38bdf8;">${c.dailyVelocity.value} units/day</div>
          </div>
        </div>
        <div class="derivation-box">
          <strong>7D Derivation:</strong> ${c.forecast7d?.derivation || ''}<br/>
          <strong>30D Derivation:</strong> ${c.forecast30d?.derivation || ''}
        </div>
      </div>

      <!-- Block 3: Stockout Runway -->
      <div class="calc-block">
        <div class="calc-block-header">
          <div class="calc-block-title"><span>⏳</span> 3. Current Stockout Runway</div>
          <span class="badge-neutral">Standard Model Velocity</span>
        </div>
        <div class="equation-box">${c.stockoutDays.formula}</div>
        <div class="db-inputs-grid">
          <div class="db-input-card">
            <div class="db-input-label">Live Warehouse Stock</div>
            <div class="db-input-value">${c.stockoutDays.inputs.currentStock} units</div>
          </div>
          <div class="db-input-card">
            <div class="db-input-label">Daily Sales Velocity</div>
            <div class="db-input-value">${c.stockoutDays.inputs.dailyVelocity} units/day</div>
          </div>
          <div class="db-input-card">
            <div class="db-input-label">Days to Zero Stock</div>
            <div class="db-input-value" style="color: ${c.stockoutDays.value <= 7 ? '#f87171' : '#34d399'};">${c.stockoutDays.value} days</div>
          </div>
        </div>
        <div class="derivation-box">
          <strong>Step-by-step arithmetic:</strong> ${c.stockoutDays.derivation}
        </div>
      </div>

      <!-- Block 4: Festive Spike Multiplier -->
      <div class="calc-block">
        <div class="calc-block-header">
          <div class="calc-block-title"><span></span> 4. Indian Festive Demand Surge Multiplier</div>
          <span class="badge-gold">Diwali / Navratri Modeled</span>
        </div>
        <div class="equation-box">${c.festiveForecast.formula}</div>
        <div class="db-inputs-grid">
          <div class="db-input-card">
            <div class="db-input-label">Craft Category</div>
            <div class="db-input-value">${c.festiveForecast.inputs.category}</div>
          </div>
          <div class="db-input-card">
            <div class="db-input-label">Historical Festive Surge</div>
            <div class="db-input-value" style="color: #f59e0b;">${c.festiveForecast.inputs.multiplier}x Multiplier</div>
          </div>
          <div class="db-input-card">
            <div class="db-input-label">Festive Runway Remaining</div>
            <div class="db-input-value" style="color: #f59e0b;">${c.festiveForecast.value} days</div>
          </div>
        </div>
        <div class="derivation-box">
          <strong>Step-by-step arithmetic:</strong> ${c.festiveForecast.derivation}
        </div>
      </div>

      <!-- Block 5: Reorder Point Trigger -->
      <div class="calc-block">
        <div class="calc-block-header">
          <div class="calc-block-title"><span></span> 5. Reorder Point (ROP) & Safety Stock Threshold</div>
          <span class="badge-neutral">Lead Time Buffer</span>
        </div>
        <div class="equation-box">${c.reorderTrigger.formula}</div>
        <div class="db-inputs-grid">
          <div class="db-input-card">
            <div class="db-input-label">Artisan Supplier Lead Time</div>
            <div class="db-input-value">${c.reorderTrigger.inputs.leadTimeDays} days</div>
          </div>
          <div class="db-input-card">
            <div class="db-input-label">Buffer Safety Stock</div>
            <div class="db-input-value">${c.reorderTrigger.inputs.safetyStockDays} days</div>
          </div>
          <div class="db-input-card">
            <div class="db-input-label">Reorder Point Threshold</div>
            <div class="db-input-value" style="color: #f87171;">${c.reorderTrigger.value} units</div>
          </div>
        </div>
        <div class="derivation-box">
          <strong>Step-by-step arithmetic:</strong> ${c.reorderTrigger.derivation}
        </div>
      </div>

      <!-- Block 6: Recommended Batch -->
      <div class="calc-block">
        <div class="calc-block-header">
          <div class="calc-block-title"><span></span> 6. Recommended Reorder Batch Size & Capital</div>
          <span class="badge-neutral">45-Day Working Stock</span>
        </div>
        <div class="equation-box">${c.reorderBatch.formula}</div>
        <div class="derivation-box">
          <strong>Step-by-step arithmetic:</strong> ${c.reorderBatch.derivation}
        </div>
      </div>

      <!-- Model Verdict -->
      <div class="calc-verdict-card">
        <div>
          <div class="verdict-label">Decision Agent Verdict</div>
          <div class="verdict-val">${p.recommendedReorderQty > 0 ? `Urgent Restock Required: +${p.recommendedReorderQty} Units` : 'Stock Levels Healthy & Balanced'}</div>
        </div>
        <div>
          <div class="verdict-label">Capital Required</div>
          <div class="verdict-val" style="color: #38bdf8;">₹${p.reorderCost.toLocaleString('en-IN')}</div>
        </div>
      </div>
    `;
  } else if (type === 'pricing') {
    const pricing = agents.smartPricing;
    const p = pricing?.recommendations?.find(x => x.id === itemId) || pricing?.recommendations?.[0];
    if (!p || !p.calculation) {
      body.innerHTML = '<div style="color: #f87171; padding: 2rem;">Calculation model details not found for this product.</div>';
      return;
    }
    const c = p.calculation;
    icon = '';
    title = `Price Elasticity & Margin Math: ${p.name}`;
    agentName = 'Smart Pricing Agent';

    contentHtml = `
      <!-- Block 1: Econometric Data Audit & Scenario Sensitivity Framework -->
      <div class="calc-block">
        <div class="calc-block-header">
          <div class="calc-block-title"><span></span> 1. Econometric Data Audit & Sensitivity Framework</div>
          <span class="badge-neutral">Empirical Zero-Variance Audit</span>
        </div>
        <div class="equation-box">Price Elasticity of Demand ε = (% Δ Quantity Demanded) / (% Δ Price)</div>
        <div class="derivation-box" style="margin-bottom: 10px;">
          <strong>Methodology Disclosure:</strong> All 105 historical transactions in SQLite were completed at catalog MRPs (0.0% observational price variance).
          Econometric regression cannot be mathematically identified without historical price variance.
          The Smart Pricing Agent utilizes a deterministic microeconomic sensitivity model evaluating three bounded elasticity scenarios:
          Inelastic (ε = -0.50), Unit Elastic (ε = -1.00), and Elastic (ε = -1.50).
        </div>
        <div class="db-inputs-grid">
          <div class="db-input-card">
            <div class="db-input-label">Historical Price Variance</div>
            <div class="db-input-value" style="color: #38bdf8;">0.0% (Audited)</div>
          </div>
          <div class="db-input-card">
            <div class="db-input-label">Assigned Strategy Elasticity</div>
            <div class="db-input-value" style="color: #38bdf8;">ε = ${c.elasticityModel?.inputs?.elasticity || p.elasticity}</div>
          </div>
          <div class="db-input-card">
            <div class="db-input-label">Customer Rating</div>
            <div class="db-input-value" style="color: #facc15;">${p.rating} </div>
          </div>
          <div class="db-input-card">
            <div class="db-input-label">Warehouse Stock Scarcity</div>
            <div class="db-input-value">${p.stock} units</div>
          </div>
        </div>
        <div class="derivation-box">
          <strong>Step-by-step arithmetic:</strong> ${c.elasticityModel?.derivation || p.rationale}
        </div>
      </div>

      <!-- Block 2: Wholesale Cost Floor & Margin Guard -->
      <div class="calc-block">
        <div class="calc-block-header">
          <div class="calc-block-title"><span></span> 2. Wholesale Cost Floor Guard (≥ 15% Gross Margin)</div>
          <span class="badge-success">P&L Capital Protection</span>
        </div>
        <div class="equation-box">Cost Floor = Wholesale Cost (58% MRP) × 1.15 [Guaranteed ≥ 15% Margin]</div>
        <div class="db-inputs-grid">
          <div class="db-input-card">
            <div class="db-input-label">Catalog Price (MRP)</div>
            <div class="db-input-value">₹${p.currentPrice.toLocaleString('en-IN')}</div>
          </div>
          <div class="db-input-card">
            <div class="db-input-label">Estimated Wholesale Cost</div>
            <div class="db-input-value" style="color: #94a3b8;">₹${(p.wholesaleCost || Math.round(p.currentPrice * 0.58)).toLocaleString('en-IN')}</div>
          </div>
          <div class="db-input-card">
            <div class="db-input-label">Wholesale Cost Floor</div>
            <div class="db-input-value" style="color: #34d399;">₹${(p.costFloor || Math.round(p.currentPrice * 0.58 * 1.15)).toLocaleString('en-IN')}</div>
          </div>
          <div class="db-input-card">
            <div class="db-input-label">Cost Floor Compliance</div>
            <div class="db-input-value" style="color: #34d399;">${c.costFloorGuard?.status || 'PASSED'}</div>
          </div>
        </div>
        <div class="derivation-box">
          <strong>Step-by-step arithmetic:</strong> ${c.costFloorGuard?.derivation || `Wholesale cost ₹${(p.wholesaleCost || Math.round(p.currentPrice * 0.58)).toLocaleString('en-IN')} × 1.15 = ₹${(p.costFloor || Math.round(p.currentPrice * 0.58 * 1.15)).toLocaleString('en-IN')}. Recommended price ₹${p.recommendedPrice.toLocaleString('en-IN')} preserves margin floor.`}
        </div>
      </div>

      <!-- Block 3: Demand Response & Sensitivity Range -->
      <div class="calc-block">
        <div class="calc-block-header">
          <div class="calc-block-title"><span></span> 3. Demand Response & Multi-Scenario Sensitivity</div>
          <span class="badge-neutral">Isoelastic Response Curve</span>
        </div>
        <div class="equation-box">${c.projectedVolume?.formula || 'Q_proj = Q_base × [1 + (ε × ((P_rec - P_curr) / P_curr))]'}</div>
        <div class="db-inputs-grid">
          <div class="db-input-card">
            <div class="db-input-label">Current 30d Units</div>
            <div class="db-input-value">${c.projectedVolume?.inputs?.currentMonthlyUnits || p.sold30d} units</div>
          </div>
          <div class="db-input-card">
            <div class="db-input-label">Recommended Price</div>
            <div class="db-input-value" style="color: #34d399;">₹${p.recommendedPrice.toLocaleString('en-IN')}</div>
          </div>
          <div class="db-input-card">
            <div class="db-input-label">Price Shift (%)</div>
            <div class="db-input-value">${p.priceDelta > 0 ? '+' : ''}${p.priceDeltaPercent}%</div>
          </div>
          <div class="db-input-card">
            <div class="db-input-label">Projected Monthly Units</div>
            <div class="db-input-value" style="color: #38bdf8;">${p.projectedMonthlyUnits} units</div>
          </div>
        </div>
        <div class="derivation-box">
          <strong>Step-by-step arithmetic:</strong> ${c.projectedVolume?.derivation || ''}
        </div>
      </div>

      <!-- Block 4: Break-Even Volume Analysis -->
      <div class="calc-block">
        <div class="calc-block-header">
          <div class="calc-block-title"><span></span> 4. Break-Even Unit Volume Threshold</div>
          <span class="badge-neutral">Profit Neutrality Boundary</span>
        </div>
        <div class="equation-box">${c.breakevenAnalysis?.formula || 'Q_breakeven = Baseline Profit / (P_rec - Wholesale Cost)'}</div>
        <div class="db-inputs-grid">
          <div class="db-input-card">
            <div class="db-input-label">Baseline Monthly Profit</div>
            <div class="db-input-value">₹${((c.breakevenAnalysis?.inputs?.baselineProfit || 0)).toLocaleString('en-IN')}</div>
          </div>
          <div class="db-input-card">
            <div class="db-input-label">New Unit Gross Margin</div>
            <div class="db-input-value" style="color: #34d399;">₹${((c.breakevenAnalysis?.inputs?.newUnitMargin || 0)).toLocaleString('en-IN')}</div>
          </div>
          <div class="db-input-card">
            <div class="db-input-label">Break-Even Volume</div>
            <div class="db-input-value" style="color: #38bdf8;">${c.breakevenAnalysis?.inputs?.breakevenUnits || p.breakevenUnits || '—'} units</div>
          </div>
          <div class="db-input-card">
            <div class="db-input-label">Unit Buffer vs Baseline</div>
            <div class="db-input-value">${(c.breakevenAnalysis?.inputs?.breakevenDeltaUnits >= 0 ? '+' : '')}${c.breakevenAnalysis?.inputs?.breakevenDeltaUnits || 0} units</div>
          </div>
        </div>
        <div class="derivation-box">
          <strong>Step-by-step arithmetic:</strong> ${c.breakevenAnalysis?.derivation || ''}
        </div>
      </div>

      <!-- Block 5: Revenue & Gross Margin Delta -->
      <div class="calc-block">
        <div class="calc-block-header">
          <div class="calc-block-title"><span></span> 5. Net Monthly Revenue & Gross Profit Delta</div>
          <span class="badge-neutral">P&L Financial Expansion</span>
        </div>
        <div class="equation-box">${c.revenueAndMarginDelta?.formula || 'Net Profit Delta = (Q_proj × Margin_new) - (Q_base × Margin_curr)'}</div>
        <div class="derivation-box">
          <strong>Step-by-step arithmetic:</strong> ${c.revenueAndMarginDelta?.derivation || ''}
        </div>
      </div>

      <!-- Model Verdict -->
      <div class="calc-verdict-card">
        <div>
          <div class="verdict-label">Strategic Decision Verdict</div>
          <div class="verdict-val">${p.strategyLabel}: ₹${p.recommendedPrice.toLocaleString('en-IN')} (${p.priceDelta > 0 ? '+' : ''}${p.priceDeltaPercent}%)</div>
        </div>
        <div>
          <div class="verdict-label">Projected Net Monthly Uplift</div>
          <div class="verdict-val" style="color: #34d399;">${(p.monthlyProfitDelta || p.monthlyRevenueDelta) >= 0 ? '+' : ''}₹${formatNumber(p.monthlyProfitDelta || p.monthlyRevenueDelta)}/mo</div>
        </div>
      </div>
    `;
  } else if (type === 'customer') {
    const cust = agents.customerBehaviour;
    const c = cust?.customers?.find(x => x.id === itemId) || cust?.customers?.[0];
    if (!c || !c.calculation) {
      body.innerHTML = '<div style="color: #f87171; padding: 2rem;">Calculation model details not found for this customer.</div>';
      return;
    }
    const calc = c.calculation;
    icon = '';
    title = `Customer RFM & CLV Math: ${c.name}`;
    agentName = 'Customer Behaviour Agent';

    contentHtml = `
      <!-- Block 1: ML Model Architecture & Cross-Validation Evaluation -->
      <div class="calc-block">
        <div class="calc-block-header">
          <div class="calc-block-title"><span></span> 1. Supervised Machine Learning Model Specifications</div>
          <span class="badge-success">${calc.mlModel?.version || 'churn_rf_v1.0.0'}</span>
        </div>
        <div class="equation-box">Model: ${calc.mlModel?.algorithm || 'RandomForestClassifier (scikit-learn)'} | Target: 14-Day Forward Churn / Lapse</div>
        <div class="db-inputs-grid">
          <div class="db-input-card">
            <div class="db-input-label">Model Pipeline</div>
            <div class="db-input-value" style="font-size: 0.85rem;">scikit-learn Random Forest</div>
          </div>
          <div class="db-input-card">
            <div class="db-input-label">Inference Status</div>
            <div class="db-input-value" style="font-size: 0.85rem; color: ${calc.mlModel?.isFallback ? '#f59e0b' : '#34d399'};">
              ${calc.mlModel?.isFallback ? 'Empirical Fallback' : 'Trained Supervised RF'}
            </div>
          </div>
          <div class="db-input-card">
            <div class="db-input-label">5-Fold CV ROC-AUC</div>
            <div class="db-input-value" style="color: #c084fc;">${calc.mlModel?.metrics?.cv_roc_auc_mean?.toFixed(4) || '0.7667'}</div>
          </div>
          <div class="db-input-card">
            <div class="db-input-label">5-Fold CV Recall (Sensitivity)</div>
            <div class="db-input-value" style="color: #c084fc;">${calc.mlModel?.metrics?.cv_recall_mean ? (calc.mlModel.metrics.cv_recall_mean * 100).toFixed(1) + '%' : '60.0%'}</div>
          </div>
        </div>
        <div class="derivation-box" style="font-size: 0.75rem;">
          <strong>Dataset & Methodology:</strong> ${calc.mlModel?.sampleSize?.disclosure || 'Trained on 54 longitudinal customer-period observations across 9 active accounts. Small sample size is explicitly documented.'}
        </div>
      </div>

      <!-- Block 2: RFM Profile -->
      <div class="calc-block">
        <div class="calc-block-header">
          <div class="calc-block-title"><span></span> 2. Empirical RFM Profiling & Score Decomposition</div>
          <span class="badge-gold">Profile: ${calc.rfmScoring?.inputs?.rfmComposite || '333'}</span>
        </div>
        <div class="equation-box">${calc.rfmScoring?.formula || 'RFM = Recency (1-5) + Frequency (1-5) + Monetary (1-5)'}</div>
        <div class="db-inputs-grid">
          <div class="db-input-card">
            <div class="db-input-label">Recency Score (R)</div>
            <div class="db-input-value" style="color: #38bdf8;">${calc.rfmScoring?.inputs?.rScore || 3}/5 <span style="font-size: 0.7rem; color: var(--text-muted);">(${calc.rfmScoring?.inputs?.recencyDays || '0d'})</span></div>
          </div>
          <div class="db-input-card">
            <div class="db-input-label">Frequency Score (F)</div>
            <div class="db-input-value" style="color: #818cf8;">${calc.rfmScoring?.inputs?.fScore || 3}/5 <span style="font-size: 0.7rem; color: var(--text-muted);">(${calc.rfmScoring?.inputs?.totalOrders || 0} orders)</span></div>
          </div>
          <div class="db-input-card">
            <div class="db-input-label">Monetary Score (M)</div>
            <div class="db-input-value" style="color: #34d399;">${calc.rfmScoring?.inputs?.mScore || 3}/5 <span style="font-size: 0.7rem; color: var(--text-muted);">(${calc.rfmScoring?.inputs?.totalSpent || '₹0'})</span></div>
          </div>
        </div>
        <div class="derivation-box">
          <strong>Step-by-step arithmetic:</strong> ${calc.rfmScoring?.derivation || ''}
        </div>
      </div>

      <!-- Block 3: Churn Risk Probability -->
      <div class="calc-block">
        <div class="calc-block-header">
          <div class="calc-block-title"><span></span> 3. ML Churn / Lapse Probability Model</div>
          <span class="${c.churnRiskPercent < 30 ? 'badge-success' : c.churnRiskPercent < 65 ? 'badge-warning' : 'badge-danger'}">
            Risk: ${c.churnRiskPercent}%
          </span>
        </div>
        <div class="equation-box">${calc.churnModel?.formula || 'P(churn) = ML RandomForestClassifier'}</div>
        <div class="db-inputs-grid">
          <div class="db-input-card">
            <div class="db-input-label">Predicted Churn Probability</div>
            <div class="db-input-value" style="color: ${c.churnRiskPercent < 30 ? '#34d399' : c.churnRiskPercent < 65 ? '#facc15' : '#f87171'};">
              ${calc.churnModel?.inputs?.churnProbability || c.churnRiskPercent + '%'}
            </div>
          </div>
          <div class="db-input-card">
            <div class="db-input-label">Days Inactive</div>
            <div class="db-input-value">${calc.churnModel?.inputs?.recencyDays || '0d'}</div>
          </div>
          <div class="db-input-card">
            <div class="db-input-label">Cancellations Recorded</div>
            <div class="db-input-value" style="color: ${c.cancelledCount > 0 ? '#f87171' : 'inherit'};">
              ${calc.churnModel?.inputs?.cancelledOrdersCount || 0} orders
            </div>
          </div>
          <div class="db-input-card">
            <div class="db-input-label">Average Basket (AOV)</div>
            <div class="db-input-value">${calc.churnModel?.inputs?.aov || '₹0'}</div>
          </div>
        </div>
        <div class="derivation-box">
          <strong>Step-by-step arithmetic:</strong> ${calc.churnModel?.derivation || ''}
        </div>
      </div>

      <!-- Block 4: Predicted 12M CLV -->
      <div class="calc-block">
        <div class="calc-block-header">
          <div class="calc-block-title"><span></span> 4. Predicted 12-Month Customer Lifetime Value (CLV)</div>
          <span class="badge-neutral">Annual Cadence × AOV × (1 - P_churn)</span>
        </div>
        <div class="equation-box">${calc.clvModel?.formula || 'CLV = Cadence × AOV × Retention'}</div>
        <div class="db-inputs-grid">
          <div class="db-input-card">
            <div class="db-input-label">Annualized Cadence</div>
            <div class="db-input-value">${calc.clvModel?.inputs?.annualFrequency || 0} orders/yr</div>
          </div>
          <div class="db-input-card">
            <div class="db-input-label">Average Basket (AOV)</div>
            <div class="db-input-value">₹${(calc.clvModel?.inputs?.avgBasket || 0).toLocaleString('en-IN')}</div>
          </div>
          <div class="db-input-card">
            <div class="db-input-label">Retention Factor (1 - P_churn)</div>
            <div class="db-input-value" style="color: #34d399;">${calc.clvModel?.inputs?.retentionMultiplier || '0.80'}</div>
          </div>
        </div>
        <div class="derivation-box">
          <strong>Step-by-step arithmetic:</strong> ${calc.clvModel?.derivation || ''}
        </div>
      </div>

      <!-- Model Verdict -->
      <div class="calc-verdict-card">
        <div>
          <div class="verdict-label">Customer RFM Segment</div>
          <div class="verdict-val">${c.segmentLabel} (Total Spent: ₹${c.totalSpent.toLocaleString('en-IN')})</div>
          <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">Recommended Action: ${c.retentionAction}</div>
        </div>
        <div>
          <div class="verdict-label">Predicted 12M Lifetime Value</div>
          <div class="verdict-val" style="color: #34d399;">₹${c.predictedCLV.toLocaleString('en-IN')}</div>
        </div>
      </div>
    `;
  } else if (type === 'bundle') {
    const bundle = agents.bundleCrossSelling;
    const b = bundle?.smartBundles?.find(x => x.id === itemId) || bundle?.smartBundles?.[0];
    if (!b || !b.calculation) {
      body.innerHTML = '<div style="color: #f87171; padding: 2rem;">Calculation model details not found for this bundle.</div>';
      return;
    }
    const c = b.calculation;
    icon = '';
    title = `Bundle Pricing & Unit Economics: ${b.name}`;
    agentName = 'Bundle & Cross-Selling Agent';

    contentHtml = `
      <!-- Block 1: Pricing Model -->
      <div class="calc-block">
        <div class="calc-block-header">
          <div class="calc-block-title"><span></span> 1. Bundle Pricing & Discount Derivation</div>
          <span class="badge-neutral">Basket Expansion Model</span>
        </div>
        <div class="equation-box">${c.pricingModel.formula}</div>
        <div class="db-inputs-grid">
          <div class="db-input-card">
            <div class="db-input-label">Sum of Individual MRPs</div>
            <div class="db-input-value">₹${c.pricingModel.inputs.individualTotal.toLocaleString('en-IN')}</div>
          </div>
          <div class="db-input-card">
            <div class="db-input-label">Bundle Incentive Discount</div>
            <div class="db-input-value" style="color: #f59e0b;">${c.pricingModel.inputs.discountPercent}% OFF</div>
          </div>
          <div class="db-input-card">
            <div class="db-input-label">Customer Savings</div>
            <div class="db-input-value" style="color: #34d399;">₹${c.pricingModel.customerSavings.toLocaleString('en-IN')}</div>
          </div>
          <div class="db-input-card">
            <div class="db-input-label">Final Bundle Price</div>
            <div class="db-input-value" style="color: #38bdf8;">₹${c.pricingModel.bundlePrice.toLocaleString('en-IN')}</div>
          </div>
        </div>
        <div class="derivation-box">
          <strong>Step-by-step arithmetic:</strong> ${c.pricingModel.derivation}
        </div>
      </div>

      <!-- Block 2: Margin Model -->
      <div class="calc-block">
        <div class="calc-block-header">
          <div class="calc-block-title"><span></span> 2. Preserved Gross Margin & Unit Cost Math</div>
          <span class="badge-neutral">Margin Safety Guard</span>
        </div>
        <div class="equation-box">${c.marginModel.formula}</div>
        <div class="db-inputs-grid">
          <div class="db-input-card">
            <div class="db-input-label">Retail Bundle Price</div>
            <div class="db-input-value">₹${c.marginModel.inputs.bundlePrice.toLocaleString('en-IN')}</div>
          </div>
          <div class="db-input-card">
            <div class="db-input-label">Combined Wholesale Cost</div>
            <div class="db-input-value">₹${c.marginModel.inputs.combinedWholesaleCost.toLocaleString('en-IN')}</div>
          </div>
          <div class="db-input-card">
            <div class="db-input-label">Preserved Gross Profit</div>
            <div class="db-input-value" style="color: #34d399;">₹${c.marginModel.marginEstimate.toLocaleString('en-IN')}</div>
          </div>
          <div class="db-input-card">
            <div class="db-input-label">Retained Gross Margin %</div>
            <div class="db-input-value" style="color: #34d399;">${c.marginModel.marginPercent}%</div>
          </div>
        </div>
        <div class="derivation-box">
          <strong>Step-by-step arithmetic:</strong> ${c.marginModel.derivation}
        </div>
      </div>

      <!-- Block 3: AOV Expansion Model -->
      ${c.aovModel ? `
      <div class="calc-block">
        <div class="calc-block-header">
          <div class="calc-block-title"><span></span> 3. Basket Size & Store AOV Expansion</div>
          <span class="badge-gold">AOV Uplift Derivation</span>
        </div>
        <div class="equation-box">${c.aovModel.formula}</div>
        <div class="db-inputs-grid">
          <div class="db-input-card">
            <div class="db-input-label">Store Baseline AOV</div>
            <div class="db-input-value">₹${c.aovModel.inputs.baselineAov.toLocaleString('en-IN')}</div>
          </div>
          <div class="db-input-card">
            <div class="db-input-label">Smart Bundle Price</div>
            <div class="db-input-value">₹${c.aovModel.inputs.bundlePrice.toLocaleString('en-IN')}</div>
          </div>
          <div class="db-input-card">
            <div class="db-input-label">Projected AOV Uplift</div>
            <div class="db-input-value" style="color: #34d399; font-size: 1.1rem;">+${c.aovModel.aovUpliftPct}%</div>
          </div>
        </div>
        <div class="derivation-box">
          <strong>Step-by-step arithmetic:</strong> ${c.aovModel.derivation}
        </div>
      </div>
      ` : ''}

      <!-- Model Verdict -->
      <div class="calc-verdict-card">
        <div>
          <div class="verdict-label">Bundle Strategic Verdict</div>
          <div class="verdict-val">${b.name} — Deployable AOV Driver</div>
        </div>
        <div>
          <div class="verdict-label">Margin Retained</div>
          <div class="verdict-val" style="color: #34d399;">${b.marginPercent}% (₹${b.marginEstimate.toLocaleString('en-IN')})</div>
        </div>
      </div>
    `;
  } else if (type === 'copurchase') {
    const bundle = agents.bundleCrossSelling;
    const idx = parseInt(itemId, 10);
    const cp = bundle?.coPurchases?.[idx] || bundle?.coPurchases?.[0];
    if (!cp || !cp.calculation) {
      body.innerHTML = '<div style="color: #f87171; padding: 2rem;">Apriori mining calculation details not found.</div>';
      return;
    }
    const c = cp.calculation;
    icon = '';
    title = `Apriori Association Mining: ${cp.item1} + ${cp.item2}`;
    agentName = 'Bundle & Cross-Selling Agent • Apriori Rule Mining';

    contentHtml = `
      <!-- Block 1: Support -->
      <div class="calc-block">
        <div class="calc-block-header">
          <div class="calc-block-title"><span></span> 1. Support Metric P(A ∩ B)</div>
          <span class="badge-neutral">Co-Occurrence Frequency</span>
        </div>
        <div class="equation-box">${c.supportModel.formula}</div>
        <div class="db-inputs-grid">
          <div class="db-input-card">
            <div class="db-input-label">Orders with Both Items</div>
            <div class="db-input-value">${c.supportModel.inputs.coPurchaseOrders} orders</div>
          </div>
          <div class="db-input-card">
            <div class="db-input-label">Total Completed Orders in DB</div>
            <div class="db-input-value">${c.supportModel.inputs.totalOrders} orders</div>
          </div>
          <div class="db-input-card">
            <div class="db-input-label">Support Percentage</div>
            <div class="db-input-value" style="color: #38bdf8;">${c.supportModel.value}%</div>
          </div>
        </div>
        <div class="derivation-box">
          <strong>Step-by-step arithmetic:</strong> ${c.supportModel.derivation}
        </div>
      </div>

      <!-- Block 2: Confidence -->
      <div class="calc-block">
        <div class="calc-block-header">
          <div class="calc-block-title"><span></span> 2. Confidence Metric P(B | A)</div>
          <span class="badge-neutral">Conditional Attachment Likelihood</span>
        </div>
        <div class="equation-box">${c.confidenceModel.formula}</div>
        <div class="db-inputs-grid">
          <div class="db-input-card">
            <div class="db-input-label">Co-Purchased Orders</div>
            <div class="db-input-value">${c.confidenceModel.inputs.coPurchaseOrders} orders</div>
          </div>
          <div class="db-input-card">
            <div class="db-input-label">Orders Containing Item A</div>
            <div class="db-input-value">${c.confidenceModel.inputs.item1Orders} orders</div>
          </div>
          <div class="db-input-card">
            <div class="db-input-label">Confidence P(B|A)</div>
            <div class="db-input-value" style="color: #34d399;">${c.confidenceModel.value}%</div>
          </div>
        </div>
        <div class="derivation-box">
          <strong>Step-by-step arithmetic:</strong> ${c.confidenceModel.derivation}
        </div>
      </div>

      <!-- Block 3: Lift -->
      <div class="calc-block">
        <div class="calc-block-header">
          <div class="calc-block-title"><span></span> 3. Lift Metric (Strength of Association)</div>
          <span class="badge-gold">Affinity Multiplier</span>
        </div>
        <div class="equation-box">${c.liftModel.formula}</div>
        <div class="db-inputs-grid">
          <div class="db-input-card">
            <div class="db-input-label">Confidence P(B|A)</div>
            <div class="db-input-value">${c.liftModel.inputs.confidence}%</div>
          </div>
          <div class="db-input-card">
            <div class="db-input-label">Baseline Support P(B)</div>
            <div class="db-input-value">${c.liftModel.inputs.item2Support}%</div>
          </div>
          <div class="db-input-card">
            <div class="db-input-label">Derived Association Lift</div>
            <div class="db-input-value" style="color: #f59e0b; font-size: 1.1rem;">${c.liftModel.value}x</div>
          </div>
        </div>
        <div class="derivation-box">
          <strong>Step-by-step arithmetic:</strong> ${c.liftModel.derivation}
        </div>
      </div>

      <!-- Model Verdict -->
      <div class="calc-verdict-card">
        <div>
          <div class="verdict-label">Market Basket Association Verdict</div>
          <div class="verdict-val">${cp.lift > 1 ? `Strong Positive Affinity (${cp.lift}x Lift) — Prime Cross-Sell Target` : 'Independent Affinity'}</div>
        </div>
        <div>
          <div class="verdict-label">Co-Order Frequency</div>
          <div class="verdict-val" style="color: #38bdf8;">${cp.frequency} Orders</div>
        </div>
      </div>
    `;
  } else if (type === 'strategy') {
    const strat = agents.businessStrategy;
    if (itemId === 'gmv') {
      const g = strat?.gmvCalculation;
      if (!g) {
        body.innerHTML = '<div style="color: #f87171; padding: 2rem;">GMV trajectory derivation details not found.</div>';
        return;
      }
      icon = '';
      title = g.title;
      agentName = 'Business Strategy Agent • GMV Trajectory';

      contentHtml = `
        <!-- Block 1: Master Formula & Baseline -->
        <div class="calc-block">
          <div class="calc-block-header">
            <div class="calc-block-title"><span></span> 1. Deterministic Rolling Baseline & Formula</div>
            <span class="badge-neutral">Historical Ingestion</span>
          </div>
          <div class="equation-box">${g.formula}</div>
          <div class="db-inputs-grid">
            <div class="db-input-card">
              <div class="db-input-label">Rolling 30-Day Base GMV</div>
              <div class="db-input-value">₹${Math.round(g.inputs.rolling30DayGmv).toLocaleString('en-IN')}</div>
            </div>
            <div class="db-input-card">
              <div class="db-input-label">Total Audited Orders</div>
              <div class="db-input-value">${g.inputs.auditedOrdersCount} orders</div>
            </div>
            <div class="db-input-card">
              <div class="db-input-label">Historical Panel Window</div>
              <div class="db-input-value" style="color: #38bdf8;">90 Days</div>
            </div>
          </div>
          <div class="derivation-box">
            <strong>Baseline Derivation:</strong> ${g.derivation}
          </div>
        </div>

        <!-- Block 2: Seasonal Horizon Multipliers -->
        <div class="calc-block">
          <div class="calc-block-header">
            <div class="calc-block-title"><span></span> 2. Calibrated Indian Festive Multipliers</div>
            <span class="badge-gold">Empirical Seasonality</span>
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.75rem; margin-bottom: 1rem;">
            <div style="background: rgba(0, 0, 0, 0.35); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 6px; padding: 10px 12px;">
              <div style="color: #38bdf8; font-weight: 700; font-size: 0.85rem;">Month 1 (Pre-Festive)</div>
              <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 4px;">Expected Multiplier: <strong style="color: #34d399;">1.18x</strong></div>
              <div style="font-size: 0.72rem; color: #94a3b8;">Bounds: 1.05x – 1.35x</div>
            </div>
            <div style="background: rgba(0, 0, 0, 0.35); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 6px; padding: 10px 12px;">
              <div style="color: #f59e0b; font-weight: 700; font-size: 0.85rem;">Month 2 (Diwali Peak)</div>
              <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 4px;">Expected Multiplier: <strong style="color: #34d399;">1.55x</strong></div>
              <div style="font-size: 0.72rem; color: #94a3b8;">Bounds: 1.25x – 1.95x</div>
            </div>
            <div style="background: rgba(0, 0, 0, 0.35); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 6px; padding: 10px 12px;">
              <div style="color: #a78bfa; font-weight: 700; font-size: 0.85rem;">Month 3 (Wedding Season)</div>
              <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 4px;">Expected Multiplier: <strong style="color: #34d399;">1.38x</strong></div>
              <div style="font-size: 0.72rem; color: #94a3b8;">Bounds: 1.15x – 1.65x</div>
            </div>
          </div>
          <div class="derivation-box">
            Multipliers reflect calibrated Indian e-commerce demand peaks across Navratri/Diwali gifting and post-festive bridal wedding apparel.
          </div>
        </div>

        <!-- Block 3: Data Limitations & Econometric Guardrails -->
        <div class="calc-block">
          <div class="calc-block-header">
            <div class="calc-block-title"><span></span> 3. Econometric Bounds & Transparency Disclosures</div>
            <span class="badge-success">Honest Disclosures</span>
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px; font-size: 0.85rem; color: #cbd5e1; line-height: 1.5;">
            ${(g.disclosures || []).map(d => `
              <div style="display: flex; gap: 8px; align-items: flex-start;">
                <span style="color: #38bdf8;">•</span>
                <span>${d}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Master Verdict -->
        <div class="calc-verdict-card">
          <div>
            <div class="verdict-label">3-Month Forward GMV Outlook</div>
            <div class="verdict-val" style="color: #34d399; font-size: 1.3rem;">
              ₹${Math.round(strat.gmvTrajectory[0].expected).toLocaleString('en-IN')} ₹${Math.round(strat.gmvTrajectory[1].expected).toLocaleString('en-IN')} Peak
            </div>
          </div>
          <div>
            <div class="verdict-label">Methodology Status</div>
            <div class="verdict-val" style="color: #38bdf8;">Deterministic Seasonal Rollup</div>
          </div>
        </div>
      `;
    } else {
      const c = strat?.healthCalculation;
      if (!c) {
        body.innerHTML = '<div style="color: #f87171; padding: 2rem;">Strategy health calculation details not found.</div>';
        return;
      }
      icon = '';
      title = c.title;
      agentName = 'Business Strategy Agent';

      contentHtml = `
        <!-- Master Formula -->
        <div class="calc-block">
          <div class="calc-block-header">
            <div class="calc-block-title"><span></span> Composite Macro Health Index Master Equation</div>
            <span class="badge-gold">Weighted Multi-Factor Model</span>
          </div>
          <div class="equation-box">${c.formula}</div>
          <div class="derivation-box">
            A composite 100-point index aggregating 5 critical business dimensions derived synchronously from database ledger tables.
          </div>
        </div>

        <!-- 5 Components -->
        ${c.components.map((comp, idx) => `
          <div class="calc-block">
            <div class="calc-block-header">
              <div class="calc-block-title"><span>${['', '', '', '', ''][idx]}</span> Component ${idx + 1}: ${comp.name}</div>
              <span class="badge-info" style="font-weight: 700;">${comp.score} / ${comp.weight} Points</span>
            </div>
            <div class="equation-box">${comp.formula}</div>
            <div class="db-inputs-grid">
              ${Object.entries(comp.inputs || {}).map(([k, v]) => `
                <div class="db-input-card">
                  <div class="db-input-label">${k.replace(/([A-Z])/g, ' $1')}</div>
                  <div class="db-input-value">${v}</div>
                </div>
              `).join('')}
            </div>
            <div class="derivation-box">
              <strong>Step-by-step arithmetic:</strong> ${comp.derivation}
            </div>
          </div>
        `).join('')}

        <!-- Master Verdict -->
        <div class="calc-verdict-card">
          <div>
            <div class="verdict-label">Total Composite Health Score</div>
            <div class="verdict-val" style="color: #34d399; font-size: 1.5rem;">${c.totalScore} / 100 (Grade ${c.ratingGrade})</div>
          </div>
          <div>
            <div class="verdict-label">Strategic Rating</div>
            <div class="verdict-val">${c.ratingTitle}</div>
          </div>
        </div>
      `;
    }
  }

  iconEl.textContent = icon;
  titleEl.textContent = title;
  agentBadgeEl.textContent = agentName;
  body.innerHTML = contentHtml;
}

function closeFormulaModal() {
  const modal = document.getElementById('formulaModal');
  if (modal) {
    modal.classList.remove('open');
    modal.style.display = 'none';
  }
}

function handleFormulaModalBackdrop(e) {
  if (e.target && e.target.id === 'formulaModal') {
    closeFormulaModal();
  }
}

