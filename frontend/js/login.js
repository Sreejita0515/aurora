/**
 * Aurora Unified Login & Registration Portal
 * Handles authentication for both regular shoppers and administrators with secret code validation.
 */

const API = window.location.protocol.startsWith('http')
  ? `${window.location.origin}/api`
  : 'http://localhost:3000/api';

let selectedRole = 'customer'; // 'customer' or 'admin'
let isSubmitting = false;

// ═══ INITIALIZATION ═══
document.addEventListener('DOMContentLoaded', () => {
  initURLParams();
  checkExistingAuth();
});

// Check if user is already authenticated
function checkExistingAuth() {
  firebase.auth().onAuthStateChanged(async (fbUser) => {
    if (fbUser && !isSubmitting) {
      try {
        const token = await fbUser.getIdToken();
        const res = await fetch(`${API}/auth/firebase`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });
        const data = await res.json();
        if (data && data.user) {
          // If already logged in, redirect appropriately if redirect param is set
          const params = new URLSearchParams(window.location.search);
          const redirect = params.get('redirect');
          if (redirect) {
            if (redirect.includes('admin') && data.user.role !== 'admin') {
              showPortalAlert('You are logged in as a customer, but administrator privileges are required for the admin console.', 'admin-notice');
              return;
            }
            window.location.href = redirect;
          }
        }
      } catch (e) {
        console.warn('Silent session check error:', e);
      }
    }
  });
}

// Read URL parameters on load for intelligent routing & feedback
function initURLParams() {
  const params = new URLSearchParams(window.location.search);

  // Tab mode
  const mode = params.get('mode');
  if (mode === 'register') {
    switchAuthTab('register');
  } else if (mode === 'admin') {
    switchAuthTab('register');
    selectRole('admin');
  }

  // Pre-alerts
  if (params.get('requireAdmin') === '1') {
    showPortalAlert('🛡️ Administrator privileges required. Please sign in with an authorized admin account to access the dashboard.', 'admin-notice');
  } else if (params.get('adminDenied') === '1') {
    showPortalAlert('⚠️ Access Denied: The account you are signed into does not have administrator privileges.', 'error');
  } else if (params.get('registered') === '1') {
    showPortalAlert('🎉 Account created successfully! Please sign in to continue.', 'success');
  }
}

// ═══ TAB SWITCHING ═══
function switchAuthTab(tab) {
  clearPortalAlert();
  const signinBtn = document.getElementById('tabSignIn');
  const registerBtn = document.getElementById('tabRegister');
  const signinCard = document.getElementById('signinCard');
  const registerCard = document.getElementById('registerCard');
  const forgotCard = document.getElementById('forgotPasswordCard');

  if (forgotCard) forgotCard.style.display = 'none';

  if (tab === 'signin') {
    signinBtn.classList.add('active');
    registerBtn.classList.remove('active');
    signinCard.style.display = 'block';
    registerCard.style.display = 'none';
    document.getElementById('portalSubtitle').textContent = 'Sign in to access your orders, cart, or the admin dashboard';
  } else {
    registerBtn.classList.add('active');
    signinBtn.classList.remove('active');
    signinCard.style.display = 'none';
    registerCard.style.display = 'block';
    document.getElementById('portalSubtitle').textContent = 'Create your Aurora account as a customer or administrator';
  }
}

// ═══ ROLE SELECTION (CUSTOMER VS ADMIN) ═══
function selectRole(role) {
  selectedRole = role;
  const customerCard = document.getElementById('roleCardCustomer');
  const adminCard = document.getElementById('roleCardAdmin');
  const adminPanel = document.getElementById('adminCodePanel');
  const regBtn = document.getElementById('registerSubmitBtn');

  if (role === 'admin') {
    customerCard.classList.remove('selected');
    adminCard.classList.add('selected');
    adminPanel.style.display = 'block';
    if (regBtn) regBtn.innerHTML = '<span>🛡️ Register as Administrator</span>';
    setTimeout(() => {
      const codeInput = document.getElementById('regAdminCode');
      if (codeInput) codeInput.focus();
    }, 150);
  } else {
    adminCard.classList.remove('selected');
    customerCard.classList.add('selected');
    adminPanel.style.display = 'none';
    if (regBtn) regBtn.innerHTML = '<span>🛍️ Create Customer Account</span>';
    const codeInput = document.getElementById('regAdminCode');
    if (codeInput) codeInput.value = '';
  }
}

// ═══ SHOW / HIDE PASSWORD TOGGLES ═══
function togglePasswordVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = '🙈';
    btn.title = 'Hide password';
  } else {
    input.type = 'password';
    btn.textContent = '👁️';
    btn.title = 'Show password';
  }
}

// ═══ FORGOT PASSWORD VIEW ═══
function showForgotPasswordView() {
  clearPortalAlert();
  document.getElementById('signinCard').style.display = 'none';
  document.getElementById('registerCard').style.display = 'none';
  document.getElementById('forgotPasswordCard').style.display = 'block';
  document.getElementById('portalSubtitle').textContent = 'Enter your email to receive a secure password reset link';
}

function hideForgotPasswordView() {
  clearPortalAlert();
  document.getElementById('forgotPasswordCard').style.display = 'none';
  switchAuthTab('signin');
}

// ═══ QUICK DEMO FILLER ═══
function fillDemo(type) {
  switchAuthTab('signin');
  const emailInput = document.getElementById('signinEmail');
  const passInput = document.getElementById('signinPassword');

  if (type === 'admin') {
    emailInput.value = 'admin@aurora.com';
    passInput.value = 'admin123';
    showToast('Filled admin demo credentials: admin@aurora.com', 'info');
  } else {
    emailInput.value = 'sarah@example.com';
    passInput.value = 'user123';
    showToast('Filled customer demo credentials: sarah@example.com', 'info');
  }
}

// ═══ SIGN IN FLOW ═══
async function handleSignIn() {
  const email = (document.getElementById('signinEmail').value || '').trim();
  const password = document.getElementById('signinPassword').value;
  const btn = document.getElementById('signinSubmitBtn');

  if (!email || !password) {
    showPortalAlert('Please enter both your email address and password.', 'error');
    return;
  }

  try {
    clearPortalAlert();
    isSubmitting = true;
    btn.disabled = true;
    btn.innerHTML = '<span>Authenticating...</span>';

    // 1. Authenticate with Firebase
    const userCredential = await firebase.auth().signInWithEmailAndPassword(email, password);
    const fbUser = userCredential.user;

    // 2. Fetch fresh token & sync with backend
    const token = await fbUser.getIdToken(true);
    const syncRes = await fetch(`${API}/auth/firebase`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const syncData = await syncRes.json();
    if (!syncRes.ok) throw new Error(syncData.error || 'Server sync failed');

    const user = syncData.user;
    localStorage.setItem('aurora_user', JSON.stringify(user));

    // 3. Smart routing based on role
    completeAuthNavigation(user);
  } catch (err) {
    console.error('Sign-in error:', err);
    isSubmitting = false;
    btn.disabled = false;
    btn.innerHTML = '<span>Sign In to Aurora →</span>';

    const msg = getFirebaseAuthErrorMessage(err.code, err.message);
    showPortalAlert(msg, 'error');
  }
}

// ═══ GOOGLE SIGN IN FLOW ═══
async function handleGoogleSignIn() {
  try {
    clearPortalAlert();
    isSubmitting = true;
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    const result = await firebase.auth().signInWithPopup(provider);
    const fbUser = result.user;

    const token = await fbUser.getIdToken(true);
    const syncRes = await fetch(`${API}/auth/firebase`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const syncData = await syncRes.json();
    if (!syncRes.ok) throw new Error(syncData.error || 'Server sync failed');

    const user = syncData.user;
    localStorage.setItem('aurora_user', JSON.stringify(user));

    completeAuthNavigation(user);
  } catch (err) {
    console.error('Google sign-in error:', err);
    isSubmitting = false;
    if (err.code !== 'auth/popup-closed-by-user') {
      showPortalAlert(err.message, 'error');
    }
  }
}

// ═══ REGISTRATION FLOW (CUSTOMER / ADMIN WITH CODE) ═══
async function handleRegister() {
  const name = (document.getElementById('regName').value || '').trim();
  const email = (document.getElementById('regEmail').value || '').trim();
  const password = document.getElementById('regPassword').value;
  const adminCode = (document.getElementById('regAdminCode')?.value || '').trim();
  const btn = document.getElementById('registerSubmitBtn');

  if (!name || !email || !password) {
    showPortalAlert('Please complete all required fields.', 'error');
    return;
  }

  if (password.length < 6) {
    showPortalAlert('Password must be at least 6 characters long.', 'error');
    return;
  }

  // If Administrator role is selected, validate unique admin code
  if (selectedRole === 'admin') {
    if (!adminCode) {
      showPortalAlert('An Admin Access Code is required to create an administrator account.', 'error');
      document.getElementById('regAdminCode').focus();
      return;
    }
  }

  try {
    clearPortalAlert();
    isSubmitting = true;
    btn.disabled = true;
    btn.innerHTML = '<span>Creating Account...</span>';

    // 1. Create account in Firebase
    const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);
    const fbUser = userCredential.user;

    // 2. Set display name
    await fbUser.updateProfile({ displayName: name });
    const token = await fbUser.getIdToken(true);

    // 3. Sync with backend forwarding adminCode if selected
    const syncRes = await fetch(`${API}/auth/firebase`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ adminCode: selectedRole === 'admin' ? adminCode : '' })
    });

    const syncData = await syncRes.json();
    if (!syncRes.ok) {
      // If code was invalid, remove or warn
      throw new Error(syncData.error || 'Registration failed on server');
    }

    const user = syncData.user;
    localStorage.setItem('aurora_user', JSON.stringify(user));

    if (user.role === 'admin') {
      showToast('🎉 Administrator account created successfully!', 'success');
    } else {
      showToast(`🎉 Welcome to Aurora, ${name}!`, 'success');
    }

    completeAuthNavigation(user);
  } catch (err) {
    console.error('Registration error:', err);
    isSubmitting = false;
    btn.disabled = false;
    if (selectedRole === 'admin') {
      btn.innerHTML = '<span>🛡️ Register as Administrator</span>';
    } else {
      btn.innerHTML = '<span>🛍️ Create Customer Account</span>';
    }

    const msg = getFirebaseAuthErrorMessage(err.code, err.message);
    showPortalAlert(msg, 'error');
  }
}

// ═══ PASSWORD RESET FLOW ═══
async function handleSendPasswordReset() {
  const email = (document.getElementById('forgotEmail').value || '').trim();
  const btn = document.getElementById('forgotSubmitBtn');

  if (!email) {
    showPortalAlert('Please enter your email address.', 'error');
    return;
  }

  try {
    btn.disabled = true;
    btn.innerHTML = '<span>Sending Link...</span>';
    await firebase.auth().sendPasswordResetEmail(email);
    showPortalAlert(`A password reset link has been dispatched to ${email}. Please check your inbox.`, 'success');
  } catch (err) {
    console.error('Password reset error:', err);
    const msg = getFirebaseAuthErrorMessage(err.code, err.message);
    showPortalAlert(msg, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>Send Password Reset Link →</span>';
  }
}

// ═══ INTELLIGENT POST-AUTH NAVIGATION ═══
function completeAuthNavigation(user) {
  const params = new URLSearchParams(window.location.search);
  const redirect = params.get('redirect');

  if (user.role === 'admin') {
    showPortalAlert('🛡️ Administrator verified. Launching Admin Dashboard...', 'success');
    setTimeout(() => {
      window.location.href = redirect && redirect.startsWith('/admin') ? redirect : '/admin';
    }, 700);
  } else {
    showPortalAlert(`✨ Authenticated as ${user.name}. Entering Aurora...`, 'success');
    setTimeout(() => {
      window.location.href = redirect && !redirect.startsWith('/admin') ? redirect : '/';
    }, 700);
  }
}

// ═══ ALERT HELPERS ═══
function showPortalAlert(message, type = 'error') {
  const alertEl = document.getElementById('portalAlert');
  if (!alertEl) return;
  alertEl.className = `portal-alert ${type}`;

  const iconMap = {
    error: '⚠️',
    success: '✅',
    info: 'ℹ️',
    'admin-notice': '🛡️'
  };

  alertEl.innerHTML = `
    <span style="font-size: 1.1rem; flex-shrink: 0;">${iconMap[type] || 'ℹ️'}</span>
    <div>${message}</div>
  `;
  alertEl.style.display = 'flex';
}

function clearPortalAlert() {
  const alertEl = document.getElementById('portalAlert');
  if (alertEl) {
    alertEl.style.display = 'none';
    alertEl.textContent = '';
  }
}

// Helper: Firebase Auth friendly error messages
function getFirebaseAuthErrorMessage(code, defaultMsg) {
  const map = {
    'auth/user-not-found': 'No account exists with this email address.',
    'auth/wrong-password': 'Incorrect password. Please verify and try again.',
    'auth/invalid-credential': 'Invalid credentials. Please verify your email and password.',
    'auth/email-already-in-use': 'An account is already registered with this email.',
    'auth/weak-password': 'Password should be at least 6 characters.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/too-many-requests': 'Too many unsuccessful attempts. Please wait a moment and try again.'
  };
  return map[code] || defaultMsg;
}

// ═══ TOAST HELPER ═══
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span style="font-size: 1.1rem;">${icons[type]}</span>
    <span>${message}</span>
  `;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}
