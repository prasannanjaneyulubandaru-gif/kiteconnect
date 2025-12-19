// Dashboard Module - dashboard.js (Compact Version)

const DASHBOARD_CONFIG = {
    backendUrl: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? 'http://localhost:5000' 
        : 'https://shark-app-hyd9r.ondigitalocean.app',
    positionsRefreshInterval: 10000, // 10 seconds
    ordersRefreshInterval: 15000,    // 15 seconds
    pnlRefreshInterval: 3000         // 3 seconds
};

let dashboardState = {
    positionsInterval: null,
    ordersInterval: null,
    pnlInterval: null,
    isInitialized: false
};

function initializeDashboard() {
    console.log('✅ Initializing Dashboard module');
    
    const userId = sessionStorage.getItem('userid') || sessionStorage.getItem('userId') || sessionStorage.getItem('user_id');
    console.log('User ID:', userId);
    
    if (!userId) {
        console.warn('⚠️ User ID not found in sessionStorage!');
        showDashboardError('Please login to view dashboard');
        return;
    }
    
    // Initial load
    loadPnlSummary();
    loadDashboardPositions();
    loadDashboardOrders();
    
    // Start auto-refresh intervals
    startAutoRefresh();
    
    dashboardState.isInitialized = true;
}

function startAutoRefresh() {
    // Clear existing intervals if any
    if (dashboardState.positionsInterval) clearInterval(dashboardState.positionsInterval);
    if (dashboardState.ordersInterval) clearInterval(dashboardState.ordersInterval);
    if (dashboardState.pnlInterval) clearInterval(dashboardState.pnlInterval);
    
    // Start P&L refresh (every 3 seconds)
    dashboardState.pnlInterval = setInterval(() => {
        loadPnlSummary();
    }, DASHBOARD_CONFIG.pnlRefreshInterval);
    
    // Start positions refresh (every 10 seconds)
    dashboardState.positionsInterval = setInterval(() => {
        loadDashboardPositions();
    }, DASHBOARD_CONFIG.positionsRefreshInterval);
    
    // Start orders refresh (every 15 seconds)
    dashboardState.ordersInterval = setInterval(() => {
        loadDashboardOrders();
    }, DASHBOARD_CONFIG.ordersRefreshInterval);
    
    console.log('🔄 Auto-refresh started: P&L (3s), Positions (10s), Orders (15s)');
}

function stopAutoRefresh() {
    if (dashboardState.positionsInterval) {
        clearInterval(dashboardState.positionsInterval);
        dashboardState.positionsInterval = null;
    }
    if (dashboardState.ordersInterval) {
        clearInterval(dashboardState.ordersInterval);
        dashboardState.ordersInterval = null;
    }
    if (dashboardState.pnlInterval) {
        clearInterval(dashboardState.pnlInterval);
        dashboardState.pnlInterval = null;
    }
    console.log('⏹️ Auto-refresh stopped');
}

async function loadPnlSummary() {
    try {
        const userId = sessionStorage.getItem('userid') || sessionStorage.getItem('userId') || sessionStorage.getItem('user_id');
        
        if (!userId) {
            console.error('❌ userId is null/undefined');
            return;
        }
        
        const response = await fetch(`${DASHBOARD_CONFIG.backendUrl}/api/dashboard/pnl-summary`, {
            method: 'GET',
            headers: {
                'X-User-ID': userId,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            displayPnlSummary(data);
        } else {
            console.error('❌ API Error:', data.error);
        }
    } catch (error) {
        console.error('❌ Fetch Error:', error);
    }
}

function displayPnlSummary(data) {
    const pnlContainer = document.getElementById('dashboardPnlCards');
    
    if (!pnlContainer) return;
    
    const netPnlColor = data.net_pnl >= 0 ? 'text-green-600' : 'text-red-600';
    const netPnlSign = data.net_pnl >= 0 ? '+' : '';
    const grossPnlColor = data.gross_profit >= 0 ? 'text-green-600' : 'text-red-600';
    const unrealisedColor = data.unrealised_pnl >= 0 ? 'text-blue-600' : 'text-orange-600';
    const roiColor = data.days_roi >= 0 ? 'text-green-600' : 'text-red-600';
    const roiSign = data.days_roi >= 0 ? '+' : '';
    
    pnlContainer.innerHTML = `
        <!-- Net P&L Card -->
        <div class="bg-white border-2 ${data.net_pnl >= 0 ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'} rounded-lg p-3">
            <div class="text-xs text-gray-600 mb-1">Net P&L</div>
            <div class="text-2xl font-bold ${netPnlColor}">${netPnlSign}₹${data.net_pnl.toFixed(2)}</div>
        </div>
        
        <!-- Day's ROI Card -->
        <div class="bg-white border-2 ${data.days_roi >= 0 ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'} rounded-lg p-3">
            <div class="text-xs text-gray-600 mb-1">Day's ROI</div>
            <div class="text-2xl font-bold ${roiColor}">${roiSign}${data.days_roi.toFixed(2)}%</div>
        </div>
        
        <!-- Opening Balance Card -->
        <div class="bg-white border-2 border-gray-200 rounded-lg p-3">
            <div class="text-xs text-gray-600 mb-1">Opening Balance</div>
            <div class="text-xl font-bold text-gray-900">₹${data.opening_balance.toFixed(2)}</div>
        </div>
        
        <!-- Gross P&L Card -->
        <div class="bg-white border-2 border-gray-200 rounded-lg p-3">
            <div class="text-xs text-gray-600 mb-1">Gross P&L</div>
            <div class="text-xl font-bold ${grossPnlColor}">₹${data.gross_profit.toFixed(2)}</div>
        </div>
        
        <!-- Unrealised P&L Card -->
        <div class="bg-white border-2 border-gray-200 rounded-lg p-3">
            <div class="text-xs text-gray-600 mb-1">Unrealised P&L</div>
            <div class="text-xl font-bold ${unrealisedColor}">₹${data.unrealised_pnl.toFixed(2)}</div>
        </div>
        
        <!-- Brokerage Card -->
        <div class="bg-white border-2 border-gray-200 rounded-lg p-3">
            <div class="text-xs text-gray-600 mb-1">Brokerage</div>
            <div class="text-xl font-bold text-red-600">₹${data.total_brokerage.toFixed(2)}</div>
        </div>
        
        <!-- Other Charges Card -->
        <div class="bg-white border-2 border-gray-200 rounded-lg p-3">
            <div class="text-xs text-gray-600 mb-1">Other Charges</div>
            <div class="text-xl font-bold text-red-600">₹${data.other_charges.toFixed(2)}</div>
        </div>
        
        <!-- Total Charges Card -->
        <div class="bg-white border-2 border-red-200 rounded-lg p-3">
            <div class="text-xs text-gray-600 mb-1">Total Charges</div>
            <div class="text-xl font-bold text-red-700">₹${data.total_charges.toFixed(2)}</div>
        </div>
    `;
}

async function loadDashboardPositions() {
    try {
        const userId = sessionStorage.getItem('userid') || sessionStorage.getItem('userId') || sessionStorage.getItem('user_id');
        
        if (!userId) {
            console.error('❌ userId is null/undefined');
            return;
        }
        
        const response = await fetch(`${DASHBOARD_CONFIG.backendUrl}/api/dashboard/positions`, {
            method: 'GET',
            headers: {
                'X-User-ID': userId,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            displayDashboardPositions(data.net_positions, data.day_positions);
        } else {
            console.error('❌ API Error:', data.error);
            showPositionsError(data.error);
        }
    } catch (error) {
        console.error('❌ Fetch Error:', error);
        showPositionsError(error.message);
    }
}

function displayDashboardPositions(netPositions, dayPositions) {
    const positionsContainer = document.getElementById('dashboardPositionsContainer');
    
    if (!positionsContainer) return;
    
    let html = '';
    
    // Display NET positions (active) - COMPACT
    if (netPositions && netPositions.length > 0) {
        html += '<div class="mb-4"><h3 class="text-xs font-bold text-gray-700 mb-2 flex items-center gap-1"><span class="inline-block w-1.5 h-1.5 bg-green-500 rounded-full"></span>Active Positions</h3>';
        
        netPositions.forEach(position => {
            const pnlColor = position.pnl >= 0 ? 'text-green-600' : 'text-red-600';
            const pnlBg = position.pnl >= 0 ? 'bg-green-50' : 'bg-red-50';
            const pnlBorder = position.pnl >= 0 ? 'border-green-200' : 'border-red-200';
            const qtyType = position.quantity > 0 ? 'LONG' : 'SHORT';
            const qtyBadge = position.quantity > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700';
            
            html += `
                <div class="border ${pnlBorder} ${pnlBg} rounded-lg p-2 mb-1.5 hover:shadow-sm transition-all">
                    <div class="flex items-center justify-between mb-1">
                        <div class="flex items-center gap-1.5 flex-1 min-w-0">
                            <span class="px-1.5 py-0.5 ${qtyBadge} text-xs font-bold rounded">${qtyType}</span>
                            <span class="font-mono text-xs font-semibold text-gray-900 truncate">${position.tradingsymbol}</span>
                        </div>
                        <div class="font-bold text-sm ${pnlColor}">₹${position.pnl.toFixed(2)}</div>
                    </div>
                    <div class="flex items-center justify-between text-xs text-gray-600">
                        <div class="flex items-center gap-2">
                            <span><span class="text-gray-500">Qty:</span> <span class="font-semibold">${Math.abs(position.quantity)}</span></span>
                            <span class="text-gray-400">•</span>
                            <span>${position.product}</span>
                        </div>
                        <div class="font-mono text-gray-700">₹${position.last_price.toFixed(2)}</div>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
    }
    
    // Display DAY positions (closed today) - COMPACT
    if (dayPositions && dayPositions.length > 0) {
        html += '<div><h3 class="text-xs font-bold text-gray-400 mb-2 flex items-center gap-1"><span class="inline-block w-1.5 h-1.5 bg-gray-400 rounded-full"></span>Closed Today</h3>';
        
        dayPositions.forEach(position => {
            const pnlColor = position.pnl >= 0 ? 'text-gray-600' : 'text-gray-700';
            
            html += `
                <div class="border border-gray-200 bg-gray-50 rounded-lg p-2 mb-1.5 opacity-60">
                    <div class="flex items-center justify-between">
                        <div class="flex-1">
                            <div class="font-mono text-xs font-semibold text-gray-600">${position.tradingsymbol}</div>
                            <div class="text-xs text-gray-500">${position.product}</div>
                        </div>
                        <div class="text-right">
                            <div class="font-bold text-sm ${pnlColor}">₹${position.pnl.toFixed(2)}</div>
                        </div>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
    }
    
    if (netPositions.length === 0 && dayPositions.length === 0) {
        html = '<p class="text-center text-gray-500 py-6 text-sm">No positions found</p>';
    }
    
    positionsContainer.innerHTML = html;
}

function showPositionsError(error) {
    const positionsContainer = document.getElementById('dashboardPositionsContainer');
    if (positionsContainer) {
        positionsContainer.innerHTML = `<p class="text-center text-red-600 py-6 text-sm">Error: ${error}</p>`;
    }
}

async function loadDashboardOrders() {
    try {
        const userId = sessionStorage.getItem('userid') || sessionStorage.getItem('userId') || sessionStorage.getItem('user_id');
        
        if (!userId) {
            console.error('❌ userId is null/undefined');
            return;
        }
        
        const response = await fetch(`${DASHBOARD_CONFIG.backendUrl}/api/dashboard/orders`, {
            method: 'GET',
            headers: {
                'X-User-ID': userId,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            displayDashboardOrders(data.orders);
        } else {
            console.error('❌ API Error:', data.error);
            showOrdersError(data.error);
        }
    } catch (error) {
        console.error('❌ Fetch Error:', error);
        showOrdersError(error.message);
    }
}

function displayDashboardOrders(orders) {
    const ordersContainer = document.getElementById('dashboardOrdersContainer');
    
    if (!ordersContainer) return;
    
    if (!orders || orders.length === 0) {
        ordersContainer.innerHTML = '<p class="text-center text-gray-500 py-6 text-sm">No orders found</p>';
        return;
    }
    
    let html = '';
    
    orders.forEach(order => {
        const statusColor = getOrderStatusColor(order.status);
        const typeColor = order.transaction_type === 'BUY' ? 'text-green-600' : 'text-red-600';
        const typeBg = order.transaction_type === 'BUY' ? 'bg-green-50' : 'bg-red-50';
        
        // Format timestamp
        let timeStr = 'N/A';
        if (order.order_timestamp) {
            try {
                const date = new Date(order.order_timestamp);
                timeStr = date.toLocaleTimeString('en-US', { 
                    hour: '2-digit', 
                    minute: '2-digit'
                });
            } catch (e) {
                timeStr = order.order_timestamp;
            }
        }
        
        html += `
            <div class="border border-gray-200 rounded-lg p-2 mb-1.5 hover:shadow-sm transition-all">
                <div class="flex items-center justify-between gap-2 mb-1">
                    <div class="flex items-center gap-1.5 flex-1 min-w-0">
                        <span class="px-1.5 py-0.5 ${typeBg} ${typeColor} text-xs font-bold rounded">${order.transaction_type === 'BUY' ? 'B' : 'S'}</span>
                        <span class="font-mono text-xs font-bold text-gray-900 truncate">${order.display_symbol}</span>
                    </div>
                    <span class="px-1.5 py-0.5 text-xs font-bold rounded ${statusColor}">${order.status}</span>
                </div>
                
                <div class="flex items-center justify-between text-xs text-gray-600 mb-1">
                    <div class="flex items-center gap-2">
                        <span><span class="text-gray-500">Qty:</span> <span class="font-semibold">${order.quantity || 0}</span></span>
                        <span class="text-gray-400">•</span>
                        <span class="text-green-600 font-semibold">${order.filled_quantity || 0}</span>
                        ${order.pending_quantity > 0 ? `<span class="text-orange-600 font-semibold">(${order.pending_quantity})</span>` : ''}
                    </div>
                    <div class="font-mono text-gray-700">
                        ${order.average_price ? `₹${order.average_price}` : order.price ? `₹${order.price}` : '-'}
                    </div>
                </div>
                
                <div class="flex items-center justify-between text-xs text-gray-500">
                    <span>${order.product} • ${order.order_type}</span>
                    <span>🕐 ${timeStr}</span>
                </div>
            </div>
        `;
    });
    
    ordersContainer.innerHTML = html;
}

function getOrderStatusColor(status) {
    const statusColors = {
        'COMPLETE': 'bg-green-100 text-green-700',
        'OPEN': 'bg-blue-100 text-blue-700',
        'PENDING': 'bg-yellow-100 text-yellow-700',
        'CANCELLED': 'bg-gray-100 text-gray-700',
        'REJECTED': 'bg-red-100 text-red-700',
        'TRIGGER PENDING': 'bg-orange-100 text-orange-700'
    };
    
    return statusColors[status] || 'bg-gray-100 text-gray-700';
}

function showOrdersError(error) {
    const ordersContainer = document.getElementById('dashboardOrdersContainer');
    if (ordersContainer) {
        ordersContainer.innerHTML = `<p class="text-center text-red-600 py-6 text-sm">Error: ${error}</p>`;
    }
}

function showDashboardError(message) {
    const positionsContainer = document.getElementById('dashboardPositionsContainer');
    const ordersContainer = document.getElementById('dashboardOrdersContainer');
    
    const errorHtml = `<p class="text-center text-red-600 py-6 text-sm">${message}</p>`;
    
    if (positionsContainer) positionsContainer.innerHTML = errorHtml;
    if (ordersContainer) ordersContainer.innerHTML = errorHtml;
}

// Initialize when dashboard page becomes visible
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 DOM Content Loaded');
    
    // Check if dashboard page exists
    if (document.getElementById('dashboardPage')) {
        console.log('✅ Dashboard page detected');
        
        // Initialize immediately if already on dashboard
        const isDashboardVisible = !document.getElementById('dashboardPage').classList.contains('hidden');
        if (isDashboardVisible) {
            initializeDashboard();
        }
    }
});

// Listen for page navigation to dashboard
document.addEventListener('click', function(e) {
    const menuItem = e.target.closest('[data-page="dashboard"]');
    if (menuItem) {
        // Small delay to ensure page is visible
        setTimeout(() => {
            if (!dashboardState.isInitialized) {
                initializeDashboard();
            }
        }, 100);
    }
});

// Clean up intervals when leaving dashboard
function cleanupDashboard() {
    stopAutoRefresh();
    dashboardState.isInitialized = false;
    console.log('🧹 Dashboard cleaned up');
}

// Export for external use if needed
window.DashboardModule = {
    initialize: initializeDashboard,
    cleanup: cleanupDashboard,
    refresh: {
        pnl: loadPnlSummary,
        positions: loadDashboardPositions,
        orders: loadDashboardOrders
    }
};
