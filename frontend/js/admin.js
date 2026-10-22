/**
 * Aurora Admin Dashboard — JavaScript Logic with Firebase Authentication
 * Auth is handled by redirecting non-admin users back to the storefront.
 */

const API = window.location.protocol.startsWith('http')
  ? `${window.location.origin}/api`
  : 'http://localhost:3000/api';
let dashboardData = null;
let currentAdminUser = null;
let firebaseAdminUserObj = null;

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
    // Redirect to login portal with access denied flag
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
        showAdminAuthGate('Administrator authorization expired or denied. Please sign in again.');
        return;
      }
      throw new Error(`Server returned ${res.status}`);
    }
    dashboardData = await res.json();

    document.getElementById('lastUpdated').textContent =
      new Date(dashboardData.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    if (loader) loader.style.display = 'none';
    showSection('overview');
  } catch (err) {
    if (loader) {
      loader.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⚠️</div>
          <h3>Connection Failed</h3>
          <p>Make sure the backend server is running on port 3000</p>
          <button class="btn btn-primary" style="margin-top: 1rem;" onclick="loadDashboard()">Retry</button>
        </div>
      `;
    }
    console.error('Dashboard load failed:', err);
  }
}

// ═══ SECTION NAVIGATION ═══
function showSection(sectionId) {
  // Update sidebar
  document.querySelectorAll('.sidebar-link').forEach(link => {
    link.classList.toggle('active', link.dataset.section === sectionId);
  });

  // Show/hide sections
  document.querySelectorAll('.admin-section').forEach(section => {
    section.style.display = 'none';
  });
  const targetSection = document.getElementById(`section-${sectionId}`);
  if (targetSection) {
    targetSection.style.display = 'block';
    targetSection.style.animation = 'fadeInUp 0.4s ease';
  }

  // Render section content
  if (!dashboardData) return;

  switch (sectionId) {
    case 'overview': renderOverview(); break;
    case 'sales': renderSales(); break;
    case 'products': renderProducts(); break;
    case 'customers': renderCustomers(); break;
    case 'inventory': renderInventory(); break;
    case 'ai': renderAIRecommendations(); break;
    case 'orders': loadRecentOrders(); break;
  }
}

// ═══ RENDER OVERVIEW ═══
function renderOverview() {
  const o = dashboardData.overview;

  // KPI Cards
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
    <div class="kpi-card">
      <div class="kpi-icon">📈</div>
      <div class="kpi-label">Last 30 Days</div>
      <div class="kpi-value">₹${formatNumber(o.last30Revenue)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon">❌</div>
      <div class="kpi-label">Cancel Rate</div>
      <div class="kpi-value">${o.cancelRate}%</div>
      <span class="kpi-change ${o.cancelRate > 5 ? 'negative' : 'positive'}">${o.cancelRate > 5 ? '⚠ High' : '✓ Normal'}</span>
    </div>
  `;

  // Revenue Chart
  renderBarChart('revenueChart', dashboardData.salesAnalysis.dailyRevenue, 'revenue', 'date');

  // Category Donut
  renderCategoryDonut();

  // Quick AI Insights (top 3)
  const quickInsights = document.getElementById('quickInsights');
  const topRecs = dashboardData.recommendations.slice(0, 3);
  quickInsights.innerHTML = topRecs.map(rec => `
    <div style="display: flex; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--border-color);">
      <span style="font-size: 1.3rem;">${rec.icon}</span>
      <div style="flex: 1;">
        <div style="font-weight: 600; font-size: 0.9rem; margin-bottom: 2px;">${rec.title}</div>
        <div style="color: var(--text-secondary); font-size: 0.8rem; line-height: 1.5;">${rec.description.substring(0, 120)}...</div>
      </div>
      <span class="rec-priority ${rec.priority}">${rec.priority}</span>
    </div>
  `).join('');
}

// ═══ RENDER SALES ═══
function renderSales() {
  const sales = dashboardData.salesAnalysis;

  // Weekly chart
  renderWeeklyChart(sales.weeklyTrends);

  // Status distribution
  renderStatusDistribution(sales.statusDistribution);

  // Category revenue table
  const tbody = document.querySelector('#categoryRevenueTable tbody');
  const totalRevenue = sales.categoryRevenue.reduce((s, c) => s + c.revenue, 0);

  tbody.innerHTML = sales.categoryRevenue.map(cat => {
    const share = totalRevenue > 0 ? (cat.revenue / totalRevenue * 100).toFixed(1) : 0;
    return `
      <tr>
        <td class="product-name-cell">${cat.icon} ${cat.category}</td>
        <td class="revenue-cell">₹${formatNumber(cat.revenue)}</td>
        <td class="number-cell">${cat.orders}</td>
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <div class="progress-bar" style="width: 80px;">
              <div class="progress-fill" style="width: ${share}%;"></div>
            </div>
            <span style="font-size: 0.8rem; color: var(--text-muted);">${share}%</span>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// ═══ RENDER PRODUCTS ═══
function renderProducts() {
  const perf = dashboardData.productPerformance;

  // Top products
  const topTbody = document.querySelector('#topProductsTable tbody');
  topTbody.innerHTML = perf.topProducts.map((p, i) => `
    <tr>
      <td class="product-name-cell">
        <span style="color: var(--text-muted); margin-right: 8px;">#${i + 1}</span>
        ${p.name}
      </td>
      <td class="number-cell">${p.total_sold}</td>
      <td class="revenue-cell">₹${formatNumber(p.total_revenue)}</td>
      <td><span class="stars" style="font-size: 0.75rem; color: #fbbf24;">${'★'.repeat(Math.floor(p.rating))}</span> ${p.rating}</td>
    </tr>
  `).join('');

  // Underperformers
  const underTbody = document.querySelector('#underperformersTable tbody');
  underTbody.innerHTML = perf.underperformers.map(p => {
    const stockClass = p.stock < 10 ? 'critical' : p.stock < 20 ? 'low' : 'in-stock';
    return `
      <tr>
        <td class="product-name-cell">${p.name}</td>
        <td class="number-cell">${p.total_sold}</td>
        <td class="revenue-cell">₹${formatNumber(p.total_revenue)}</td>
        <td><span class="status-badge ${stockClass}">${p.stock}</span></td>
      </tr>
    `;
  }).join('');

  // Best reviewed
  const reviewTbody = document.querySelector('#bestReviewedTable tbody');
  reviewTbody.innerHTML = perf.bestReviewed.map(p => `
    <tr>
      <td class="product-name-cell">${p.name}</td>
      <td><span class="stars" style="font-size: 0.75rem; color: #fbbf24;">${'★'.repeat(Math.floor(p.rating))}</span> ${p.rating}</td>
      <td class="number-cell">${p.reviews_count}</td>
      <td class="number-cell">${formatPrice(p.price)}</td>
    </tr>
  `).join('');
}

// ═══ RENDER CUSTOMERS ═══
function renderCustomers() {
  const cust = dashboardData.customerInsights;

  // Customer KPIs
  document.getElementById('customerKpis').innerHTML = `
    <div class="kpi-card">
      <div class="kpi-icon">👥</div>
      <div class="kpi-label">Total Buyers</div>
      <div class="kpi-value">${cust.totalBuyers}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon">🔄</div>
      <div class="kpi-label">Repeat Rate</div>
      <div class="kpi-value">${cust.repeatRate}%</div>
      <span class="kpi-change ${cust.repeatRate >= 50 ? 'positive' : 'negative'}">${cust.repeatRate >= 50 ? '✓ Healthy' : '⚠ Below target'}</span>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon">🆕</div>
      <div class="kpi-label">New (30 days)</div>
      <div class="kpi-value">${cust.newCustomers30d}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon">👑</div>
      <div class="kpi-label">VIP Customers</div>
      <div class="kpi-value">${cust.segments.vip}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon">⭐</div>
      <div class="kpi-label">Regular</div>
      <div class="kpi-value">${cust.segments.regular}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon">🌱</div>
      <div class="kpi-label">Occasional</div>
      <div class="kpi-value">${cust.segments.occasional}</div>
    </div>
  `;

  // Customer table
  const tbody = document.querySelector('#customerTable tbody');
  tbody.innerHTML = cust.customerSpending.map((c, i) => `
    <tr>
      <td class="product-name-cell">
        <span style="color: var(--text-muted); margin-right: 8px;">#${i + 1}</span>
        ${c.name}
        <div style="font-size: 0.75rem; color: var(--text-muted);">${c.email}</div>
      </td>
      <td class="number-cell">${c.total_orders}</td>
      <td class="revenue-cell">₹${formatNumber(c.total_spent)}</td>
      <td class="number-cell">${formatPrice(c.avg_order)}</td>
      <td style="color: var(--text-muted); font-size: 0.8rem;">
        ${new Date(c.last_order).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
      </td>
    </tr>
  `).join('');
}

// ═══ RENDER INVENTORY ═══
function renderInventory() {
  const inv = dashboardData.inventoryHealth;

  document.getElementById('inventoryKpis').innerHTML = `
    <div class="kpi-card">
      <div class="kpi-icon">💎</div>
      <div class="kpi-label">Inventory Value</div>
      <div class="kpi-value">₹${formatNumber(inv.inventoryValue)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon">🚨</div>
      <div class="kpi-label">Low Stock Items</div>
      <div class="kpi-value">${inv.lowStock.length}</div>
      <span class="kpi-change ${inv.lowStock.length > 3 ? 'negative' : 'neutral'}">${inv.lowStock.length > 3 ? '⚠ Action needed' : '✓ OK'}</span>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon">📦</div>
      <div class="kpi-label">Overstocked Items</div>
      <div class="kpi-value">${inv.overstock.length}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon">🏷️</div>
      <div class="kpi-label">Categories</div>
      <div class="kpi-value">${inv.stockByCategory.length}</div>
    </div>
  `;

  // Low stock table
  const lowTbody = document.querySelector('#lowStockTable tbody');
  if (inv.lowStock.length === 0) {
    lowTbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 2rem;">No low stock items 🎉</td></tr>';
  } else {
    lowTbody.innerHTML = inv.lowStock.map(item => {
      const statusClass = item.stock < 10 ? 'critical' : 'low';
      const statusText = item.stock < 10 ? 'Critical' : 'Low';
      return `
        <tr>
          <td class="product-name-cell">${item.name}</td>
          <td class="number-cell">${item.stock}</td>
          <td class="number-cell">${item.monthly_sales}</td>
          <td><span class="status-badge ${statusClass}">${statusText}</span></td>
        </tr>
      `;
    }).join('');
  }

  // Stock by category
  const catTbody = document.querySelector('#stockCategoryTable tbody');
  catTbody.innerHTML = inv.stockByCategory.map(cat => `
    <tr>
      <td class="product-name-cell">${cat.icon} ${cat.category}</td>
      <td class="number-cell">${cat.product_count}</td>
      <td class="number-cell">${cat.total_stock}</td>
      <td class="revenue-cell">₹${formatNumber(cat.inventory_value)}</td>
    </tr>
  `).join('');
}

// ═══ RENDER AI RECOMMENDATIONS ═══
function renderAIRecommendations() {
  const container = document.getElementById('aiRecommendations');
  const recs = dashboardData.recommendations;

  if (recs.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🎉</div>
        <h3>All clear!</h3>
        <p>No urgent recommendations at this time.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = recs.map(rec => `
    <div class="recommendation-card ${rec.priority}">
      <div class="rec-header">
        <div class="rec-title">
          <span class="rec-icon">${rec.icon}</span>
          ${rec.title}
        </div>
        <span class="rec-priority ${rec.priority}">${rec.priority}</span>
      </div>
      <p class="rec-description">${rec.description}</p>
      <div class="rec-details">
        <div class="rec-detail-box">
          <div class="detail-label">Recommended Action</div>
          <div class="detail-value">${rec.action}</div>
        </div>
        <div class="rec-detail-box">
          <div class="detail-label">Expected Impact</div>
          <div class="detail-value" style="color: var(--success);">${rec.impact}</div>
        </div>
      </div>
    </div>
  `).join('');
}

// ═══ LOAD RECENT ORDERS ═══
async function loadRecentOrders() {
  try {
    const headers = await getAdminAuthHeaders();
    const res = await fetch(`${API}/admin/orders`, { headers });
    const data = await res.json();

    const tbody = document.querySelector('#ordersTable tbody');
    tbody.innerHTML = data.orders.map(order => `
      <tr>
        <td class="product-name-cell" style="font-family: monospace; font-size: 0.8rem;">#${order.id.split('-')[0].toUpperCase()}</td>
        <td>
          <div style="font-weight: 600; font-size: 0.85rem;">${order.customer_name}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${order.customer_email}</div>
        </td>
        <td class="revenue-cell">${formatPrice(order.total)}</td>
        <td><span class="order-status ${order.status}">${order.status}</span></td>
        <td style="color: var(--text-muted); font-size: 0.8rem;">
          ${new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </td>
        <td>
          <select class="sort-select" style="padding: 4px 8px; font-size: 0.75rem;"
                  onchange="updateOrderStatus('${order.id}', this.value)">
            <option value="pending" ${order.status === 'pending' ? 'selected' : ''}>Pending</option>
            <option value="processing" ${order.status === 'processing' ? 'selected' : ''}>Processing</option>
            <option value="shipped" ${order.status === 'shipped' ? 'selected' : ''}>Shipped</option>
            <option value="delivered" ${order.status === 'delivered' ? 'selected' : ''}>Delivered</option>
            <option value="cancelled" ${order.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
          </select>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Failed to load orders:', err);
  }
}

async function updateOrderStatus(orderId, status) {
  try {
    const headers = await getAdminAuthHeaders();
    await fetch(`${API}/admin/orders/${orderId}/status`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ status }),
    });
    showToast(`Order status updated to "${status}"`, 'success');
  } catch (err) {
    showToast('Failed to update order status', 'error');
  }
}

// ═══ CHART RENDERING ═══
function renderBarChart(containerId, data, valueKey, labelKey) {
  const container = document.getElementById(containerId);
  if (!data || data.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 2rem;">No data available</p>';
    return;
  }

  const maxValue = Math.max(...data.map(d => d[valueKey]));

  // Show at most 14 bars for readability
  const displayData = data.length > 14 ? data.slice(-14) : data;

  container.innerHTML = displayData.map(d => {
    const height = maxValue > 0 ? (d[valueKey] / maxValue * 100) : 0;
    const label = d[labelKey].length > 5 ? d[labelKey].substring(5) : d[labelKey]; // trim year from date
    return `
      <div class="bar-wrapper">
        <div class="bar-value">₹${Math.round(d[valueKey]).toLocaleString('en-IN')}</div>
        <div class="bar" style="height: ${Math.max(height, 2)}%;" title="${formatPrice(d[valueKey])}"></div>
        <div class="bar-label">${label}</div>
      </div>
    `;
  }).join('');
}

function renderWeeklyChart(data) {
  const container = document.getElementById('weeklyChart');
  if (!data || data.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: var(--text-muted);">No data</p>';
    return;
  }

  const maxRevenue = Math.max(...data.map(d => d.revenue));

  container.innerHTML = data.map(d => {
    const height = maxRevenue > 0 ? (d.revenue / maxRevenue * 100) : 0;
    return `
      <div class="bar-wrapper">
        <div class="bar-value">₹${Math.round(d.revenue).toLocaleString('en-IN')}</div>
        <div class="bar" style="height: ${Math.max(height, 2)}%;" title="${d.orders} orders (${formatPrice(d.revenue)})"></div>
        <div class="bar-label">${d.day}</div>
      </div>
    `;
  }).join('');
}

function renderCategoryDonut() {
  const container = document.getElementById('categoryChart');
  const data = dashboardData.salesAnalysis.categoryRevenue;
  if (!data || data.length === 0) return;

  const total = data.reduce((s, c) => s + c.revenue, 0);
  const colors = ['#7c3aed', '#a855f7', '#c084fc', '#22c55e', '#3b82f6', '#f59e0b'];

  // Build conic gradient
  let gradientParts = [];
  let cumPct = 0;
  data.forEach((cat, i) => {
    const pct = total > 0 ? (cat.revenue / total * 100) : 0;
    gradientParts.push(`${colors[i % colors.length]} ${cumPct}% ${cumPct + pct}%`);
    cumPct += pct;
  });

  container.innerHTML = `
    <div class="donut-chart" style="background: conic-gradient(${gradientParts.join(', ')});">
      <div class="donut-center">
        <div class="donut-value">₹${formatNumber(total)}</div>
        <div class="donut-label">Total Revenue</div>
      </div>
    </div>
    <div class="donut-legend">
      ${data.map((cat, i) => {
        const pct = total > 0 ? (cat.revenue / total * 100).toFixed(1) : 0;
        return `
          <div class="donut-legend-item">
            <div class="legend-dot" style="background: ${colors[i % colors.length]};"></div>
            <span>${cat.icon} ${cat.category}</span>
            <span style="margin-left: auto; color: var(--text-muted); font-size: 0.8rem;">${pct}%</span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderStatusDistribution(data) {
  const container = document.getElementById('statusDistribution');
  if (!data || data.length === 0) return;

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
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type]}</span>
    <span class="toast-message">${message}</span>
  `;

  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}
