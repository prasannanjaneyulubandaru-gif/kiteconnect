// Basket Manager Module
// Reusable basket management for all strategies

const BASKET_CONFIG = {
    backendUrl: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? 'http://localhost:5000'
        : 'https://shark-app-hyd9r.ondigitalocean.app'
};

// Global basket state
let basketState = {
    orders: [],
    marginRequired: 0,
    availableBalance: 0,
    deploymentResults: [],
    isDeploying: false
};

// ===========================================
// BASKET MANAGEMENT
// ===========================================

function addOrderToBasket(order) {
    console.log('Adding order to basket:', order);
    
    // Validate order
    if (!order.tradingsymbol || !order.transaction_type || !order.lots) {
        console.error('Invalid order:', order);
        return false;
    }
    
    // Check if order already exists
    const existingIndex = basketState.orders.findIndex(
        o => o.tradingsymbol === order.tradingsymbol && o.transaction_type === order.transaction_type
    );
    
    if (existingIndex >= 0) {
        // Update existing order
        basketState.orders[existingIndex] = order;
        console.log('Updated existing order in basket');
    } else {
        // Add new order
        basketState.orders.push(order);
        console.log('Added new order to basket');
    }
    
    return true;
}

function removeOrderFromBasket(tradingsymbol, transactionType) {
    const initialLength = basketState.orders.length;
    basketState.orders = basketState.orders.filter(
        o => !(o.tradingsymbol === tradingsymbol && o.transaction_type === transactionType)
    );
    
    const removed = basketState.orders.length < initialLength;
    if (removed) {
        console.log('Removed order from basket:', tradingsymbol, transactionType);
    }
    return removed;
}

function clearBasket() {
    basketState.orders = [];
    basketState.marginRequired = 0;
    basketState.deploymentResults = [];
    console.log('Basket cleared');
}

function getBasketOrders() {
    return [...basketState.orders];
}

function getBasketCount() {
    return basketState.orders.length;
}

// ===========================================
// DEPLOY MODAL (NEW)
// ===========================================

function showDeployModal(orders, strategyName) {
    const modal = document.getElementById('deployModal') || createDeployModal();
    const content = document.getElementById('deployModalContent');
    
    let html = `
        <div class="p-6 border-b-2 border-gray-200">
            <div class="flex items-center justify-between">
                <h2 class="text-2xl font-bold text-gray-900">${strategyName || 'Deploy Strategy'}</h2>
                <button onclick="closeDeployModal()" class="text-gray-500 hover:text-gray-700 text-2xl">×</button>
            </div>
        </div>
        
        <div class="p-6">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
    `;
    
    orders.forEach((order, index) => {
        const bgColor = order.transaction_type === 'BUY' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200';
        const badgeColor = order.transaction_type === 'BUY' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700';
        
        html += `
            <div class="border-2 ${bgColor} rounded-lg p-4">
                <div class="flex items-center justify-between mb-3">
                    <h4 class="font-bold text-gray-900">${order.label || order.symbol}</h4>
                    <span class="px-2 py-1 ${badgeColor} text-xs font-semibold rounded">${order.transaction_type}</span>
                </div>
                
                <div class="space-y-3 text-sm">
                    <div>
                        <label class="block text-gray-600 mb-1">Symbol</label>
                        <div class="font-mono font-semibold">${order.symbol}</div>
                    </div>
                    
                    <div>
                        <label class="block text-gray-600 mb-1">Transaction Type</label>
                        <input type="text" 
                               id="txnType_${index}" 
                               value="${order.transaction_type}"
                               readonly
                               class="w-full px-3 py-2 border border-gray-300 rounded bg-gray-50 text-sm font-semibold"
                        />
                    </div>
                    
                    <div>
                        <label class="block text-gray-600 mb-1">Lots</label>
                        <input type="number" 
                               id="lots_${index}" 
                               value="${order.lots}"
                               min="1"
                               data-symbol="${order.symbol}"
                               class="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                        />
                        <p class="text-xs text-gray-500 mt-1">Lot size will be auto-calculated</p>
                    </div>
                    
                    <div>
                        <label class="block text-gray-600 mb-1">Order Type</label>
                        <select id="orderType_${index}" 
                                class="w-full px-3 py-2 border border-gray-300 rounded text-sm">
                            <option value="MARKET" selected>MARKET</option>
                            <option value="LIMIT">LIMIT</option>
                        </select>
                    </div>
                    
                    <div>
                        <label class="block text-gray-600 mb-1">Product</label>
                        <select id="product_${index}" 
                                class="w-full px-3 py-2 border border-gray-300 rounded text-sm">
                            <option value="MIS" selected>MIS</option>
                            <option value="NRML">NRML</option>
                            <option value="CNC">CNC</option>
                        </select>
                    </div>
                </div>
            </div>
        `;
    });
    
    html += `
            </div>
            
            <div class="space-y-3">
    `;
    
    // Add individual "Add to Basket" button for each order
    orders.forEach((order, index) => {
        const buttonColor = order.transaction_type === 'BUY' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700';
        html += `
                <button onclick="addSingleToBasketFromModal(${index})" 
                        class="${buttonColor} text-white font-semibold py-3 rounded-lg w-full transition-all">
                    + Add ${order.label || order.symbol} to Basket
                </button>
        `;
    });
    
    html += `
                <button onclick="closeDeployModal()" 
                        class="border-2 border-gray-300 text-gray-700 font-semibold py-3 rounded-lg hover:bg-gray-50 w-full">
                    Cancel
                </button>
            </div>
        </div>
    `;
    
    content.innerHTML = html;
    modal.classList.add('show');
}

function createDeployModal() {
    const modal = document.createElement('div');
    modal.id = 'deployModal';
    modal.className = 'modal';
    modal.innerHTML = `
        <div id="deployModalContent" class="modal-content"></div>
    `;
    document.body.appendChild(modal);
    
    // Close on outside click
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeDeployModal();
        }
    });
    
    return modal;
}

function closeDeployModal() {
    const modal = document.getElementById('deployModal');
    if (modal) {
        modal.classList.remove('show');
    }
}

function addSingleToBasketFromModal(orderIndex) {
    const modal = document.getElementById('deployModal');
    if (!modal) return;
    
    // Get the current modal data
    const lotsInput = document.getElementById(`lots_${orderIndex}`);
    const orderTypeInput = document.getElementById(`orderType_${orderIndex}`);
    const productInput = document.getElementById(`product_${orderIndex}`);
    const txnTypeInput = document.getElementById(`txnType_${orderIndex}`);
    
    if (!lotsInput || !orderTypeInput || !productInput || !txnTypeInput) {
        showToast('Error reading order details', 'error');
        return;
    }
    
    const lots = parseInt(lotsInput.value);
    const orderType = orderTypeInput.value;
    const product = productInput.value;
    const txnType = txnTypeInput.value;
    
    // Get symbol from the modal (stored as data attribute)
    const symbol = lotsInput.getAttribute('data-symbol');
    
    if (!symbol) {
        showToast('Error: Symbol not found', 'error');
        return;
    }
    
    addOrderToBasket({
        exchange: 'NFO',
        tradingsymbol: symbol,
        transaction_type: txnType,
        lots: lots,
        product: product,
        order_type: orderType,
        variety: 'regular'
    });
    
    updateBasketCountDisplay();
    showToast(`${symbol} (${txnType}) added to basket`, 'success');
}

function addToBasketFromModal(orders) {
    orders.forEach((order, index) => {
        const lots = parseInt(document.getElementById(`lots_${index}`).value);
        const orderType = document.getElementById(`orderType_${index}`).value;
        const product = document.getElementById(`product_${index}`).value;
        
        addOrderToBasket({
            exchange: 'NFO',
            tradingsymbol: order.symbol,
            transaction_type: order.transaction_type,
            lots: lots,
            product: product,
            order_type: orderType,
            variety: 'regular'
        });
    });
    
    updateBasketCountDisplay();
    closeDeployModal();
    
    // Show success feedback (non-intrusive)
    showToast(`${orders.length} order(s) added to basket`, 'success');
}

// ===========================================
// TOAST NOTIFICATION (NEW)
// ===========================================

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `fixed bottom-6 right-6 px-6 py-3 rounded-lg shadow-lg text-white font-semibold z-50 animate-slide-up`;
    
    const bgColors = {
        success: 'bg-green-600',
        error: 'bg-red-600',
        info: 'bg-blue-600'
    };
    
    toast.classList.add(bgColors[type] || bgColors.info);
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

// ===========================================
// MARGIN CHECKING
// ===========================================

async function checkBasketMargin(onSuccess, onError) {
    if (basketState.orders.length === 0) {
        if (onError) onError('No orders in basket');
        return null;
    }
    
    try {
        const userId = sessionStorage.getItem('user_id');
        
        const response = await fetch(`${BASKET_CONFIG.backendUrl}/api/strategy/check-basket-margin`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-ID': userId
            },
            body: JSON.stringify({
                orders: basketState.orders
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            basketState.marginRequired = data.total_required;
            basketState.availableBalance = data.available_balance;
            
            const marginInfo = {
                available: data.available_balance,
                required: data.total_required,
                sufficient: data.sufficient,
                details: data.margin_details
            };
            
            console.log('Margin check result:', marginInfo);
            
            if (onSuccess) onSuccess(marginInfo);
            return marginInfo;
        } else {
            throw new Error(data.error || 'Failed to check margin');
        }
    } catch (error) {
        console.error('Margin check error:', error);
        if (onError) onError(error.message);
        return null;
    }
}

// ===========================================
// ORDER DEPLOYMENT
// ===========================================

async function deployBasket(onProgress, onComplete, onError) {
    if (basketState.orders.length === 0) {
        if (onError) onError('No orders in basket');
        return null;
    }
    
    if (basketState.isDeploying) {
        if (onError) onError('Deployment already in progress');
        return null;
    }
    
    basketState.isDeploying = true;
    basketState.deploymentResults = [];
    
    try {
        const userId = sessionStorage.getItem('user_id');
        
        if (onProgress) onProgress('Deploying orders...', 0);
        
        const response = await fetch(`${BASKET_CONFIG.backendUrl}/api/strategy/deploy-basket`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-ID': userId
            },
            body: JSON.stringify({
                orders: basketState.orders
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            basketState.deploymentResults = data.results;
            
            const summary = {
                total: data.total_orders,
                successful: data.successful,
                failed: data.failed,
                results: data.results
            };
            
            console.log('Deployment complete:', summary);
            
            if (onComplete) onComplete(summary);
            
            // Clear basket after successful deployment
            clearBasket();
            
            return summary;
        } else {
            throw new Error(data.error || 'Failed to deploy orders');
        }
    } catch (error) {
        console.error('Deployment error:', error);
        if (onError) onError(error.message);
        return null;
    } finally {
        basketState.isDeploying = false;
    }
}

// ===========================================
// ORDER STATUS
// ===========================================

async function getOrderStatus(orderId, onSuccess, onError) {
    try {
        const userId = sessionStorage.getItem('user_id');
        
        const response = await fetch(`${BASKET_CONFIG.backendUrl}/api/order-status/${orderId}`, {
            headers: {
                'X-User-ID': userId
            }
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            if (onSuccess) onSuccess(data);
            return data;
        } else {
            throw new Error(data.error || 'Failed to get order status');
        }
    } catch (error) {
        console.error('Order status error:', error);
        if (onError) onError(error.message);
        return null;
    }
}

async function getBatchOrderStatus(orderIds, onSuccess, onError) {
    try {
        const userId = sessionStorage.getItem('user_id');
        
        const response = await fetch(`${BASKET_CONFIG.backendUrl}/api/orders-status/batch`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-ID': userId
            },
            body: JSON.stringify({
                order_ids: orderIds
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            if (onSuccess) onSuccess(data.results);
            return data.results;
        } else {
            throw new Error(data.error || 'Failed to get batch order status');
        }
    } catch (error) {
        console.error('Batch order status error:', error);
        if (onError) onError(error.message);
        return null;
    }
}

// ===========================================
// UI HELPERS
// ===========================================

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 2
    }).format(amount);
}

function formatNumber(num) {
    return new Intl.NumberFormat('en-IN').format(num);
}

function getStatusBadgeClass(status) {
    const statusMap = {
        'COMPLETE': 'bg-green-100 text-green-800 border-green-300',
        'REJECTED': 'bg-red-100 text-red-800 border-red-300',
        'CANCELLED': 'bg-gray-100 text-gray-800 border-gray-300',
        'PENDING': 'bg-yellow-100 text-yellow-800 border-yellow-300',
        'OPEN': 'bg-blue-100 text-blue-800 border-blue-300',
        'TRIGGER PENDING': 'bg-purple-100 text-purple-800 border-purple-300'
    };
    
    return statusMap[status] || 'bg-gray-100 text-gray-800 border-gray-300';
}

function getStatusIcon(status) {
    const iconMap = {
        'COMPLETE': '✓',
        'REJECTED': '✗',
        'CANCELLED': '⊘',
        'PENDING': '⏱',
        'OPEN': '◷',
        'TRIGGER PENDING': '⚡'
    };
    
    return iconMap[status] || '•';
}

// Export functions for use in other modules
window.BasketManager = {
    addOrder: addOrderToBasket,
    removeOrder: removeOrderFromBasket,
    clearBasket: clearBasket,
    getOrders: getBasketOrders,
    getCount: getBasketCount,
    checkMargin: checkBasketMargin,
    deploy: deployBasket,
    getOrderStatus: getOrderStatus,
    getBatchOrderStatus: getBatchOrderStatus,
    formatCurrency: formatCurrency,
    formatNumber: formatNumber,
    getStatusBadgeClass: getStatusBadgeClass,
    getStatusIcon: getStatusIcon,
    showDeployModal: showDeployModal,
    showToast: showToast,
    state: basketState
};

console.log('Basket Manager initialized');
