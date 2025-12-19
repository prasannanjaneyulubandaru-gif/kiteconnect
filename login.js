// Configuration
const CONFIG = {
    redirectUrl: window.location.origin + window.location.pathname.replace(/\/+$/, ''),
    backendUrl: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? 'http://localhost:5000'
        : 'https://shark-app-hyd9r.ondigitalocean.app'
};


// State management
let state = {
    apiKey: '',
    apiSecret: '',
    accessToken: '',
    userId: '',
    profile: null,
    currentPage: 'dashboard'
};

// Initialize on page load
window.addEventListener('load', () => {
    console.log('Page loaded - initializing app');
    checkAuthStatus();
    setupEventListeners();
});

// ===========================================
// EVENT LISTENERS SETUP
// ===========================================

function setupEventListeners() {
    // Login form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    // Menu items
    document.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', () => {
            const page = item.dataset.page;
            showPage(page);
        });
    });
    
    // Logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
}

// ===========================================
// VIEW MANAGEMENT
// ===========================================

function showView(view) {
    // Hide all main views
    document.getElementById('loginPage').classList.add('hidden');
    document.getElementById('tokenPage').classList.add('hidden');
    document.getElementById('mainApp').classList.add('hidden');
    
    // Show requested view
    switch(view) {
        case 'login':
            document.getElementById('loginPage').classList.remove('hidden');
            break;
        case 'token':
            document.getElementById('tokenPage').classList.remove('hidden');
            break;
        case 'app':
            document.getElementById('mainApp').classList.remove('hidden');
            break;
    }
}

function showPage(page) {
    console.log('Showing page:', page);
    
    // Convert page name to camelCase for element ID
    // 'chart-monitor' -> 'chartMonitor'
    const pageId = page.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase());
    console.log('Converted to pageId:', pageId);
    
    // Hide all pages inside mainApp
    const pages = ['dashboardPage', 'chartMonitorPage'];
    pages.forEach(p => {
        const element = document.getElementById(p);
        if (element) {
            element.classList.add('hidden');
            console.log('Hiding:', p);
        }
    });
    
    // Show requested page
    const pageElement = document.getElementById(pageId + 'Page');
    console.log('Looking for element:', pageId + 'Page', 'Found:', !!pageElement);
    
    if (pageElement) {
        pageElement.classList.remove('hidden');
        console.log('Showing:', pageId + 'Page');
    } else {
        console.error('Page element not found:', pageId + 'Page');
    }
    
    // Initialize chart monitor if navigating to it
    if (page === 'chart-monitor' && typeof initializeChartMonitor === 'function') {
        console.log('Initializing chart monitor');
        initializeChartMonitor();
    }
    
    // Update active menu item
    updateActiveMenuItem(page);
    
    // Update state
    state.currentPage = page;
}

function updateActiveMenuItem(page) {
    document.querySelectorAll('.menu-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.page === page) {
            item.classList.add('active');
        }
    });
}

// Helper function for navigation
window.navigateToPage = function(page) {
    showPage(page);
};

// ===========================================
// AUTHENTICATION & SESSION MANAGEMENT
// ===========================================

function checkAuthStatus() {
    console.log('Checking auth status...');
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('request_token');
    const status = urlParams.get('status');
    const action = urlParams.get('action');

    // Check if returning from Kite login
    if (token && status === 'success' && action === 'login') {
        const storedApiKey = sessionStorage.getItem('api_key');
        const storedApiSecret = sessionStorage.getItem('api_secret');

        if (storedApiKey && storedApiSecret) {
            state.apiKey = storedApiKey;
            state.apiSecret = storedApiSecret;
            
            // Show token page
            showView('token');
            document.getElementById('displayToken').textContent = token.substring(0, 20) + '...';
            
            // Complete login
            setTimeout(() => completeLogin(token), 1000);
        } else {
            showError('Session expired. Please login again.');
            showView('login');
        }
    } else {
        // Check if already logged in
        const accessToken = sessionStorage.getItem('access_token');
        if (accessToken) {
            // Load dashboard
            state.accessToken = accessToken;
            state.userId = sessionStorage.getItem('user_id');
            loadProfile();
            showView('app');
            showPage('dashboard');
        } else {
            // Show login
            showView('login');
        }
    }
}

async function handleLogin(e) {
    e.preventDefault();
    
    const apiKey = document.getElementById('apiKey').value.trim();
    const apiSecret = document.getElementById('apiSecret').value.trim();
    
    if (!apiKey || !apiSecret) {
        showError('Please enter both API Key and Secret');
        return;
    }
    
    // Store credentials
    sessionStorage.setItem('api_key', apiKey);
    sessionStorage.setItem('api_secret', apiSecret);
    state.apiKey = apiKey;
    state.apiSecret = apiSecret;
    
    // Redirect to Kite login
    const loginUrl = `https://kite.zerodha.com/connect/login?api_key=${apiKey}&v=3`;
    window.location.href = loginUrl;
}

async function completeLogin(requestToken) {
    try {
        const response = await fetch(`${CONFIG.backendUrl}/api/generate-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                api_key: state.apiKey,
                api_secret: state.apiSecret,
                request_token: requestToken
            })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            // Store session
            sessionStorage.setItem('access_token', data.access_token);
            sessionStorage.setItem('user_id', data.user_id);
            state.accessToken = data.access_token;
            state.userId = data.user_id;
            
            // Load profile and show dashboard
            await loadProfile();
            window.history.replaceState({}, document.title, window.location.pathname);
            showView('app');
            showPage('dashboard');
        } else {
            throw new Error(data.error || 'Failed to generate session');
        }
    } catch (error) {
        console.error('Login error:', error);
        showError('Login failed: ' + error.message);
        
        // Show login page again
        setTimeout(() => {
            showView('login');
        }, 2000);
    }
}

function handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
        sessionStorage.clear();
        window.location.reload();
    }
}

function showError(message) {
    const errorElement = document.getElementById('errorMessage');
    if (errorElement) {
        errorElement.querySelector('p').textContent = message;
        errorElement.classList.remove('hidden');
        
        setTimeout(() => {
            errorElement.classList.add('hidden');
        }, 5000);
    }
}

// ===========================================
// PROFILE MANAGEMENT
// ===========================================

async function loadProfile() {
    try {
        const response = await fetch(`${CONFIG.backendUrl}/api/profile`, {
            headers: { 'X-User-ID': state.userId }
        });

        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                updateProfile(data.profile);
            }
        }
    } catch (error) {
        console.error('Profile fetch error:', error);
        // Use fallback profile
        updateProfile({
            user_id: state.userId,
            user_name: 'User',
            email: 'user@bvrfunds.com',
            user_type: 'individual',
            broker: 'Zerodha',
            products: ['CNC', 'MIS']
        });
    }
}

function updateProfile(profile) {
    state.profile = profile;
    
    // Generate initials
    const nameParts = profile.user_name.split(' ');
    const initials = nameParts.map(n => n[0]).join('').toUpperCase().substring(0, 2);
    
    // Update profile section
    const profileName = document.getElementById('profileName');
    const profileEmail = document.getElementById('profileEmail');
    const profileInitials = document.getElementById('profileInitials');
    
    if (profileName) profileName.textContent = profile.user_name;
    if (profileEmail) profileEmail.textContent = profile.email;
    if (profileInitials) profileInitials.textContent = initials;
    
    // Update sidebar info
    const menuUserName = document.getElementById('menuUserName');
    const menuUserId = document.getElementById('menuUserId');
    const menuEmail = document.getElementById('menuEmail');
    
    if (menuUserName) menuUserName.textContent = profile.user_name;
    if (menuUserId) menuUserId.textContent = profile.user_id;
    if (menuEmail) menuEmail.textContent = profile.email;
    
    // Update dashboard user ID
    const dashboardUserId = document.getElementById('dashboardUserId');
    if (dashboardUserId) dashboardUserId.textContent = `User ID: ${profile.user_id}`;
    
    // Update products
    const productsContainer = document.getElementById('menuProducts');
    if (productsContainer) {
        productsContainer.innerHTML = '';
        if (profile.products && profile.products.length > 0) {
            profile.products.forEach(product => {
                const badge = document.createElement('span');
                badge.className = 'px-2 py-1 bg-[#FE4A03] bg-opacity-10 text-[#FE4A03] text-xs font-semibold rounded';
                badge.textContent = product.toUpperCase();
                productsContainer.appendChild(badge);
            });
        }
    }
}
