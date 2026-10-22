/**
 * Aurora Shopping Platform — Main Application Logic
 * Firebase Authentication Integration
 */

const API = window.location.protocol.startsWith('http')
  ? `${window.location.origin}/api`
  : 'http://localhost:3000/api';

// ═══ STATE ═══
let currentUser = null;       // Local DB user object { id, name, email, role }
let firebaseUserObj = null;   // Firebase auth user object
let cart = { items: [], total: 0, count: 0 };
let allProducts = [];
let categories = [];
let currentCategory = 'all';
let searchTimeout = null;
let pendingAdminCode = '';    // Set during registration to grant admin role

// Indian Rupee currency formatter
function formatPrice(val) {
  if (val === null || val === undefined || isNaN(val)) return '₹0';
  return '₹' + Math.round(Number(val)).toLocaleString('en-IN');
}

// ═══ FIREBASE AUTH HELPER ═══
// Get a fresh ID token for API requests
async function getIdToken() {
  if (!firebaseUserObj) return null;
  try {
    return await firebaseUserObj.getIdToken(/* forceRefresh */ false);
  } catch {
    return null;
  }
}

// Build headers with Firebase token
async function authHeaders() {
  const token = await getIdToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

// Sync the Firebase user with the backend (creates/links local DB user)
// adminCode is passed only during first-time registration with the admin secret
async function syncFirebaseUser(fbUser) {
  const code = pendingAdminCode;
  pendingAdminCode = ''; // consume once
  try {
    const token = await fbUser.getIdToken(true);
    const res = await fetch(`${API}/auth/firebase`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ adminCode: code }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data.user;
  } catch (err) {
    console.error('Failed to sync Firebase user:', err);
    if (err.message && err.message.includes('admin access code')) {
      setAuthAlert(err.message);
    }
    return null;
  }
}

// ═══ INITIALIZATION ═══
document.addEventListener('DOMContentLoaded', () => {
  // ── Handle redirects from /admin or legacy queries ──
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('requireAdmin') === '1') {
    window.location.href = '/login?redirect=/admin&requireAdmin=1';
    return;
  } else if (urlParams.get('adminDenied') === '1') {
    window.location.href = '/login?redirect=/admin&adminDenied=1';
    return;
  }

  // Listen for Firebase auth state changes
  firebase.auth().onAuthStateChanged(async (fbUser) => {
    if (fbUser) {
      firebaseUserObj = fbUser;
      // Sync with backend to get local user object
      const localUser = await syncFirebaseUser(fbUser);
      if (localUser) {
        currentUser = localUser;
      } else {
        currentUser = {
          id: fbUser.uid,
          name: fbUser.displayName || (fbUser.email ? fbUser.email.split('@')[0] : 'User'),
          email: fbUser.email || '',
          role: (fbUser.email && fbUser.email.toLowerCase() === 'admin@aurora.com') ? 'admin' : 'customer',
          firebase_uid: fbUser.uid
        };
      }
      localStorage.setItem('aurora_user', JSON.stringify(currentUser));
      updateUserUI();
      loadCart();
    } else {
      firebaseUserObj = null;
      currentUser = null;
      cart = { items: [], total: 0, count: 0 };
      localStorage.removeItem('aurora_user');
      updateUserUI();
      updateCartUI();
    }
  });

  loadCategories();
  loadProducts();
  initScrollEffects();
});

// ═══ SCROLL EFFECTS ═══
function initScrollEffects() {
  window.addEventListener('scroll', () => {
    const navbar = document.getElementById('navbar');
    if (window.scrollY > 20) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  });
}

// ═══ AUTH UI & DROPDOWN ═══
function handleUserMenuClick() {
  if (currentUser) {
    toggleUserDropdown();
  } else {
    window.location.href = '/login';
  }
}

function toggleUserDropdown() {
  const dropdown = document.getElementById('userDropdown');
  if (dropdown) {
    dropdown.classList.toggle('open');
  }
}

function closeUserDropdown() {
  const dropdown = document.getElementById('userDropdown');
  if (dropdown) {
    dropdown.classList.remove('open');
  }
}

// Close user dropdown when clicking outside
document.addEventListener('click', (e) => {
  const wrapper = document.getElementById('userMenuWrapper');
  if (wrapper && !wrapper.contains(e.target)) {
    closeUserDropdown();
  }
});

function toggleAuthModal() {
  if (currentUser) {
    toggleUserDropdown();
    return;
  }
  window.location.href = '/login';
}

function closeAuthModal() {
  document.getElementById('authModal').classList.remove('open');
  clearAuthAlert();
}

function setAuthAlert(msg, type = 'error') {
  const el = document.getElementById('authAlert');
  if (!el) return;
  if (!msg) {
    el.style.display = 'none';
    el.textContent = '';
    return;
  }
  el.className = `auth-alert ${type}`;
  el.textContent = msg;
  el.style.display = 'block';
}

function clearAuthAlert() {
  setAuthAlert('');
}

function showLogin() {
  clearAuthAlert();
  document.getElementById('loginForm').style.display = 'block';
  document.getElementById('registerForm').style.display = 'none';
  const forgot = document.getElementById('forgotPasswordForm');
  if (forgot) forgot.style.display = 'none';
  document.getElementById('authTitle').textContent = 'Sign In';
  document.getElementById('authSubtitle').textContent = 'Welcome back! Sign in to continue shopping.';
}

function showRegister() {
  clearAuthAlert();
  document.getElementById('loginForm').style.display = 'none';
  document.getElementById('registerForm').style.display = 'block';
  const forgot = document.getElementById('forgotPasswordForm');
  if (forgot) forgot.style.display = 'none';
  document.getElementById('authTitle').textContent = 'Create Account';
  document.getElementById('authSubtitle').textContent = 'Join Aurora for a premium shopping experience.';
}

function showForgotPassword() {
  clearAuthAlert();
  document.getElementById('loginForm').style.display = 'none';
  document.getElementById('registerForm').style.display = 'none';
  const forgot = document.getElementById('forgotPasswordForm');
  if (forgot) forgot.style.display = 'block';
  document.getElementById('authTitle').textContent = 'Reset Password';
  document.getElementById('authSubtitle').textContent = 'Enter your email address and we will send you a password reset link.';
}

// Toggle the admin code section in the register form
function toggleAdminCodeSection() {
  const section = document.getElementById('adminCodeSection');
  const toggle = document.getElementById('adminCodeToggle');
  const isOpen = section && section.style.display !== 'none';

  if (section) section.style.display = isOpen ? 'none' : 'block';
  if (toggle) toggle.classList.toggle('open', !isOpen);

  // Clear the code field when hiding
  if (isOpen) {
    const codeInput = document.getElementById('regAdminCode');
    if (codeInput) codeInput.value = '';
  }
}


// Helper to translate Firebase Auth errors
function getFirebaseAuthErrorMessage(code, defaultMsg) {
  const map = {
    'auth/user-not-found': 'No account exists with this email address. Please register first.',
    'auth/wrong-password': 'Incorrect password. Please verify and try again.',
    'auth/invalid-credential': 'Invalid email or password. Please try again.',
    'auth/email-already-in-use': 'This email is already in use. Please sign in instead.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/weak-password': 'Password should be at least 6 characters long.',
    'auth/user-disabled': 'This account has been disabled. Please contact support.',
    'auth/too-many-requests': 'Too many unsuccessful attempts. Please try again later.',
    'auth/network-request-failed': 'Network connection issue. Please check your internet.',
    'auth/popup-blocked': 'Sign-in popup was blocked by the browser. Please allow popups.',
  };
  return map[code] || defaultMsg || 'Authentication error. Please try again.';
}

// ─── Firebase Sign In ───
async function handleLogin() {
  const email = (document.getElementById('loginEmail').value || '').trim();
  const password = document.getElementById('loginPassword').value;
  const btn = document.getElementById('loginBtn');

  if (!email || !password) {
    setAuthAlert('Please enter both email and password.');
    return;
  }

  try {
    clearAuthAlert();
    if (btn) { btn.disabled = true; btn.textContent = 'Signing In...'; }
    await firebase.auth().signInWithEmailAndPassword(email, password);
    closeAuthModal();
    showToast(`Welcome back! 🎉`, 'success');
  } catch (err) {
    console.error('Firebase login error:', err);
    const msg = getFirebaseAuthErrorMessage(err.code, err.message);
    setAuthAlert(msg);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Sign In'; }
  }
}

// ─── Firebase Register ───
async function handleRegister() {
  const name = (document.getElementById('regName').value || '').trim();
  const email = (document.getElementById('regEmail').value || '').trim();
  const password = document.getElementById('regPassword').value;
  const adminCode = (document.getElementById('regAdminCode')?.value || '').trim();
  const btn = document.getElementById('registerBtn');

  if (!name || !email || !password) {
    setAuthAlert('Please fill in all fields.');
    return;
  }

  if (password.length < 6) {
    setAuthAlert('Password must be at least 6 characters long.');
    return;
  }

  try {
    clearAuthAlert();
    if (btn) { btn.disabled = true; btn.textContent = 'Creating Account...'; }

    // Store admin code so syncFirebaseUser can forward it to the backend
    pendingAdminCode = adminCode;

    const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);

    // Update the Firebase user's display name
    await userCredential.user.updateProfile({ displayName: name });
    // Force token refresh to include the new displayName
    await userCredential.user.getIdToken(true);

    closeAuthModal();
    const roleLabel = adminCode ? 'Admin account' : 'Account';
    showToast(`${roleLabel} created! Welcome, ${name}! 🎉`, 'success');
  } catch (err) {
    pendingAdminCode = ''; // clear on error
    console.error('Firebase register error:', err);
    const msg = getFirebaseAuthErrorMessage(err.code, err.message);
    setAuthAlert(msg);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Create Account'; }
  }
}

// ─── Firebase Password Reset ───
async function handleForgotPassword() {
  const email = (document.getElementById('resetEmail').value || '').trim();
  const btn = document.getElementById('resetBtn');

  if (!email) {
    setAuthAlert('Please enter your email address.');
    return;
  }

  try {
    clearAuthAlert();
    if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }
    await firebase.auth().sendPasswordResetEmail(email);
    setAuthAlert(`Password reset link sent to ${email}! Check your inbox.`, 'success');
    showToast('Password reset link sent!', 'success');
  } catch (err) {
    console.error('Password reset error:', err);
    const msg = getFirebaseAuthErrorMessage(err.code, err.message);
    setAuthAlert(msg);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Send Reset Link'; }
  }
}

// ─── Firebase Sign Out ───
async function logout() {
  try {
    closeUserDropdown();
    await firebase.auth().signOut();
    showToast('Signed out successfully', 'info');
  } catch (err) {
    console.error('Logout error:', err);
    showToast('Failed to sign out', 'error');
  }
}

// ─── Google Sign In ───
async function handleGoogleSignIn() {
  try {
    clearAuthAlert();
    showToast('Opening Google sign-in...', 'info');
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await firebase.auth().signInWithPopup(provider);
    closeAuthModal();
    showToast('Signed in with Google! 🎉', 'success');
  } catch (err) {
    console.error('Google sign-in error:', err);
    if (err.code !== 'auth/popup-closed-by-user') {
      const msg = getFirebaseAuthErrorMessage(err.code, err.message);
      setAuthAlert(msg);
      showToast(msg, 'error');
    }
  }
}

function updateUserUI() {
  const avatar = document.getElementById('userAvatar');
  const name = document.getElementById('userName');
  const adminLink = document.getElementById('admin-link');
  const dropdownAvatar = document.getElementById('dropdownAvatar');
  const dropdownName = document.getElementById('dropdownName');
  const dropdownEmail = document.getElementById('dropdownEmail');
  const dropdownRole = document.getElementById('dropdownRole');
  const dropdownAdminLink = document.getElementById('dropdownAdminLink');

  if (currentUser) {
    const initial = (currentUser.name || currentUser.email || 'U').charAt(0).toUpperCase();
    const shortName = (currentUser.name || currentUser.email.split('@')[0]);

    if (avatar) avatar.textContent = initial;
    if (name) name.textContent = shortName;

    // Dropdown fields
    if (dropdownAvatar) dropdownAvatar.textContent = initial;
    if (dropdownName) dropdownName.textContent = currentUser.name || shortName;
    if (dropdownEmail) dropdownEmail.textContent = currentUser.email || '';
    if (dropdownRole) {
      const isAdmin = currentUser.role === 'admin';
      dropdownRole.textContent = isAdmin ? 'Administrator' : 'Customer';
      dropdownRole.className = `role-badge ${isAdmin ? 'admin' : ''}`;
    }

    if (adminLink) adminLink.style.display = currentUser.role === 'admin' ? 'flex' : 'none';
    if (dropdownAdminLink) dropdownAdminLink.style.display = currentUser.role === 'admin' ? 'flex' : 'none';
  } else {
    if (avatar) avatar.textContent = '?';
    if (name) name.textContent = 'Sign In';
    if (adminLink) adminLink.style.display = 'none';
    if (dropdownAdminLink) dropdownAdminLink.style.display = 'none';
    closeUserDropdown();
  }
}

// ═══ CATEGORIES ═══
async function loadCategories() {
  try {
    const res = await fetch(`${API}/categories`);
    const data = await res.json();
    categories = data.categories;

    const bar = document.getElementById('categoriesBar');
    // Keep the "All" chip
    categories.forEach(cat => {
      const chip = document.createElement('button');
      chip.className = 'category-chip';
      chip.dataset.category = cat.id;
      chip.onclick = () => filterCategory(cat.id, chip);
      chip.innerHTML = `
        <span class="cat-icon">${cat.icon}</span>
        ${cat.name}
        <span class="cat-count">${cat.product_count}</span>
      `;
      bar.appendChild(chip);
    });
  } catch (err) {
    console.error('Failed to load categories:', err);
  }
}

function filterCategory(categoryId, element) {
  currentCategory = categoryId;

  // Update active state
  document.querySelectorAll('.category-chip').forEach(chip => chip.classList.remove('active'));
  if (element) {
    element.classList.add('active');
  } else {
    const chip = document.querySelector(`.category-chip[data-category="${categoryId}"]`);
    if (chip) chip.classList.add('active');
  }

  loadProducts();
  // Scroll to products
  document.querySelector('.sort-bar').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ═══ PRODUCTS ═══
async function loadProducts() {
  const grid = document.getElementById('productsGrid');
  grid.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';

  try {
    const params = new URLSearchParams();
    if (currentCategory !== 'all') params.append('category', currentCategory);
    const sort = document.getElementById('sortSelect').value;
    if (sort !== 'default') params.append('sort', sort);
    const search = document.getElementById('searchInput').value;
    if (search) params.append('search', search);

    const res = await fetch(`${API}/products?${params}`);
    const data = await res.json();
    allProducts = data.products;

    document.getElementById('resultCount').innerHTML = `Showing <strong>${allProducts.length}</strong> products`;

    if (allProducts.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <div class="empty-icon">🔍</div>
          <h3>No products found</h3>
          <p>Try adjusting your search or filters</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = allProducts.map(product => createProductCard(product)).join('');
  } catch (err) {
    grid.innerHTML = `<div class="empty-state" style="grid-column: 1/-1;"><div class="empty-icon">⚠️</div><h3>Failed to load products</h3><p>Make sure the backend server is running on port 3000</p></div>`;
    console.error('Failed to load products:', err);
  }
}

function createProductCard(product) {
  const stars = '★'.repeat(Math.floor(product.rating)) + '☆'.repeat(5 - Math.floor(product.rating));
  const hasDiscount = product.original_price && product.original_price > product.price;
  const discountPct = hasDiscount ? Math.round((1 - product.price / product.original_price) * 100) : 0;

  let badge = '';
  if (product.stock < 10) badge = '<span class="product-badge low-stock">Low Stock</span>';
  else if (hasDiscount) badge = `<span class="product-badge sale">${discountPct}% OFF</span>`;
  else if (product.is_featured) badge = '<span class="product-badge featured">Featured</span>';

  return `
    <div class="product-card" onclick="openProductDetail('${product.id}')">
      <div class="product-image">
        <img src="${product.image_url}" alt="${product.name}" loading="lazy"
             onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 400 400%22><rect fill=%22%231a1a2e%22 width=%22400%22 height=%22400%22/><text x=%22200%22 y=%22200%22 text-anchor=%22middle%22 fill=%22%235a5a7a%22 font-size=%2240%22>📦</text></svg>'">
        ${badge}
        <div class="product-actions-overlay">
          <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); addToCart('${product.id}')">Add to Cart</button>
        </div>
      </div>
      <div class="product-info">
        <div class="product-category">${product.category_icon} ${product.category_name}</div>
        <div class="product-name">${product.name}</div>
        <div class="product-rating">
          <span class="stars">${stars}</span>
          <span class="rating-text">${product.rating} (${product.reviews_count})</span>
        </div>
        <div class="product-price-row">
          <div>
            <span class="price">${formatPrice(product.price)}</span>
            ${hasDiscount ? `<span class="original-price">${formatPrice(product.original_price)}</span>` : ''}
          </div>
          ${hasDiscount ? `<span class="discount-pct">Save ${discountPct}%</span>` : ''}
        </div>
      </div>
    </div>
  `;
}

function debounceSearch() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(loadProducts, 300);
}

// ═══ PRODUCT DETAIL ═══
async function openProductDetail(productId) {
  const modal = document.getElementById('productDetailModal');
  const body = document.getElementById('productDetailBody');

  try {
    const res = await fetch(`${API}/products/${productId}`);
    const data = await res.json();
    const p = data.product;
    const reviews = data.reviews;

    const hasDiscount = p.original_price && p.original_price > p.price;
    const stars = '★'.repeat(Math.floor(p.rating)) + '☆'.repeat(5 - Math.floor(p.rating));
    let stockClass = 'in-stock';
    let stockText = `✓ In Stock (${p.stock} available)`;
    if (p.stock === 0) { stockClass = 'out-of-stock'; stockText = '✕ Out of Stock'; }
    else if (p.stock < 20) { stockClass = 'low-stock'; stockText = `⚠ Low Stock (${p.stock} left)`; }

    body.innerHTML = `
      <div class="product-detail-content">
        <div class="product-detail-image">
          <img src="${p.image_url}" alt="${p.name}"
               onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 400 400%22><rect fill=%22%231a1a2e%22 width=%22400%22 height=%22400%22/><text x=%22200%22 y=%22200%22 text-anchor=%22middle%22 fill=%22%235a5a7a%22 font-size=%2240%22>📦</text></svg>'">
        </div>
        <div class="product-detail-info">
          <div class="category-label">${p.category_icon} ${p.category_name}</div>
          <h3>${p.name}</h3>
          <div class="product-rating" style="margin: 8px 0;">
            <span class="stars">${stars}</span>
            <span class="rating-text">${p.rating} · ${p.reviews_count} reviews</span>
          </div>
          <p class="description">${p.description}</p>
          <div class="price-section">
            <span class="current-price">${formatPrice(p.price)}</span>
            ${hasDiscount ? `<span class="old-price">${formatPrice(p.original_price)}</span>` : ''}
          </div>
          <div class="stock-info ${stockClass}">${stockText}</div>
          <button class="btn btn-primary btn-lg" style="width: 100%;" onclick="addToCart('${p.id}'); closeProductDetail();"
                  ${p.stock === 0 ? 'disabled style="opacity: 0.5; width: 100%;"' : ''}>
            ${p.stock === 0 ? 'Out of Stock' : '🛒 Add to Cart'}
          </button>
        </div>
      </div>
      ${reviews.length > 0 ? `
        <div style="margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid var(--border-color);">
          <h4 style="margin-bottom: 1rem; font-size: 1rem;">Recent Reviews</h4>
          ${reviews.slice(0, 5).map(r => `
            <div style="padding: 0.75rem 0; border-bottom: 1px solid var(--border-color);">
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <strong style="font-size: 0.85rem;">${r.user_name}</strong>
                <span class="stars" style="font-size: 0.75rem;">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</span>
              </div>
              <p style="color: var(--text-secondary); font-size: 0.85rem;">${r.comment}</p>
            </div>
          `).join('')}
        </div>
      ` : ''}
    `;

    modal.classList.add('open');
  } catch (err) {
    showToast('Failed to load product details', 'error');
  }
}

function closeProductDetail() {
  document.getElementById('productDetailModal').classList.remove('open');
}

// ═══ CART ═══
function toggleCart() {
  const overlay = document.getElementById('cartOverlay');
  const sidebar = document.getElementById('cartSidebar');
  const isOpen = overlay.classList.contains('open');

  if (isOpen) {
    overlay.classList.remove('open');
    sidebar.classList.remove('open');
  } else {
    overlay.classList.add('open');
    sidebar.classList.add('open');
  }
}

async function loadCart() {
  if (!currentUser) return;

  try {
    const headers = await authHeaders();
    const res = await fetch(`${API}/cart/${currentUser.id}`, { headers });
    cart = await res.json();
    updateCartUI();
  } catch (err) {
    console.error('Failed to load cart:', err);
  }
}

async function addToCart(productId) {
  if (!currentUser) {
    toggleAuthModal();
    showToast('Please sign in to add items to cart', 'info');
    return;
  }

  try {
    const headers = await authHeaders();
    const res = await fetch(`${API}/cart`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ userId: currentUser.id, productId, quantity: 1 }),
    });
    cart = await res.json();
    updateCartUI();
    showToast('Added to cart! 🛒', 'success');
  } catch (err) {
    showToast('Failed to add to cart', 'error');
  }
}

async function updateCartItem(itemId, quantity) {
  try {
    const headers = await authHeaders();
    await fetch(`${API}/cart/${itemId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ quantity }),
    });
    await loadCart();
  } catch (err) {
    showToast('Failed to update cart', 'error');
  }
}

async function removeCartItem(itemId) {
  try {
    const headers = await authHeaders();
    await fetch(`${API}/cart/${itemId}`, { method: 'DELETE', headers });
    await loadCart();
    showToast('Item removed from cart', 'info');
  } catch (err) {
    showToast('Failed to remove item', 'error');
  }
}

function updateCartUI() {
  const badge = document.getElementById('cartBadge');
  const itemsContainer = document.getElementById('cartItems');
  const footer = document.getElementById('cartFooter');

  badge.textContent = cart.count > 0 ? cart.count : '';

  if (!cart.items || cart.items.length === 0) {
    itemsContainer.innerHTML = `
      <div class="cart-empty">
        <div class="empty-icon">🛒</div>
        <p>Your cart is empty</p>
        <p style="font-size: 0.85rem; color: var(--text-muted);">Add items to get started!</p>
      </div>
    `;
    footer.style.display = 'none';
    return;
  }

  footer.style.display = 'block';
  document.getElementById('cartSubtotal').textContent = formatPrice(cart.total);
  document.getElementById('cartTotal').textContent = formatPrice(cart.total);

  itemsContainer.innerHTML = cart.items.map(item => `
    <div class="cart-item">
      <img src="${item.image_url}" alt="${item.name}"
           onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 72 72%22><rect fill=%22%231a1a2e%22 width=%2272%22 height=%2272%22/><text x=%2236%22 y=%2236%22 text-anchor=%22middle%22 fill=%22%235a5a7a%22 font-size=%2220%22>📦</text></svg>'">
      <div class="cart-item-info">
        <div class="item-name">${item.name}</div>
        <div class="item-price">${formatPrice(item.price * item.quantity)}</div>
      </div>
      <div class="cart-item-controls">
        <div class="quantity-controls">
          <button onclick="updateCartItem('${item.id}', ${item.quantity - 1})">−</button>
          <span class="qty-value">${item.quantity}</span>
          <button onclick="updateCartItem('${item.id}', ${item.quantity + 1})">+</button>
        </div>
        <button class="cart-item-remove" onclick="removeCartItem('${item.id}')">Remove</button>
      </div>
    </div>
  `).join('');
}

// ═══ ORDERS ═══
async function placeOrder() {
  if (!currentUser) {
    showToast('Please sign in to place an order', 'error');
    return;
  }

  if (!cart.items || cart.items.length === 0) {
    showToast('Your cart is empty', 'error');
    return;
  }

  try {
    const headers = await authHeaders();
    const res = await fetch(`${API}/orders`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        userId: currentUser.id,
        shippingAddress: '42 Park Street, Flat 4A, Kolkata, West Bengal 700016',
        paymentMethod: 'card',
      }),
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error);

    cart = { items: [], total: 0, count: 0 };
    updateCartUI();
    toggleCart();
    showToast('Order placed successfully! 🎉', 'success');

    // Switch to orders tab
    setTimeout(() => switchTab('orders'), 500);
  } catch (err) {
    showToast(err.message || 'Failed to place order', 'error');
  }
}

async function loadOrders() {
  if (!currentUser) {
    document.getElementById('ordersContainer').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔐</div>
        <h3>Sign in to view orders</h3>
        <p>You need to be signed in to see your order history</p>
        <button class="btn btn-primary" style="margin-top: 1rem;" onclick="toggleAuthModal()">Sign In</button>
      </div>
    `;
    return;
  }

  try {
    const headers = await authHeaders();
    const res = await fetch(`${API}/orders/${currentUser.id}`, { headers });
    const data = await res.json();

    if (data.orders.length === 0) {
      document.getElementById('ordersContainer').innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📋</div>
          <h3>No orders yet</h3>
          <p>Start shopping to see your orders here!</p>
          <button class="btn btn-primary" style="margin-top: 1rem;" onclick="switchTab('shop')">Browse Products</button>
        </div>
      `;
      return;
    }

    document.getElementById('ordersContainer').innerHTML = data.orders.map(order => `
      <div class="order-card">
        <div class="order-header">
          <div>
            <div class="order-id">Order #${order.id.split('-')[0].toUpperCase()}</div>
            <div class="order-date">${new Date(order.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
          </div>
          <span class="order-status ${order.status}">${order.status}</span>
        </div>
        <div class="order-items-list">
          ${order.items.map(item => `
            <div class="order-item-row">
              <img src="${item.image_url}" alt="${item.product_name}"
                   onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 48 48%22><rect fill=%22%231a1a2e%22 width=%2248%22 height=%2248%22/><text x=%2224%22 y=%2228%22 text-anchor=%22middle%22 fill=%22%235a5a7a%22 font-size=%2216%22>📦</text></svg>'">
              <div class="item-details">
                <div class="name">${item.product_name}</div>
                <div class="qty">Qty: ${item.quantity} × ${formatPrice(item.price)}</div>
              </div>
              <div class="item-total">${formatPrice(item.price * item.quantity)}</div>
            </div>
          `).join('')}
        </div>
        <div class="order-total">
          Total: <span style="margin-left: 8px; color: var(--accent-secondary);">${formatPrice(order.total)}</span>
        </div>
      </div>
    `).join('');
  } catch (err) {
    document.getElementById('ordersContainer').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <h3>Failed to load orders</h3>
        <p>Please try again later</p>
      </div>
    `;
  }
}

// ═══ TAB NAVIGATION ═══
function switchTab(tabName) {
  // Update nav
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.toggle('active', link.dataset.tab === tabName);
  });

  // Update content
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.toggle('active', tab.id === `tab-${tabName}`);
  });

  // Load data for specific tabs
  if (tabName === 'orders') loadOrders();

  // Show/hide footer on shop tab
  const footer = document.getElementById('main-footer');
  footer.style.display = tabName === 'shop' ? 'block' : 'block';

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ═══ TOAST NOTIFICATIONS ═══
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

// ═══ KEYBOARD SHORTCUTS ═══
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeAuthModal();
    closeProductDetail();
    const overlay = document.getElementById('cartOverlay');
    if (overlay.classList.contains('open')) toggleCart();
  }
});
