// Short Straddle Module
// Automated straddle strategy with intelligent trailing stop loss

const STRADDLE_CONFIG = {
    backendUrl: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? 'http://localhost:5000'
        : 'https://shark-app-hyd9r.ondigitalocean.app'
};

// State management
let currentStraddleStrategy = null;
let straddleStatusInterval = null;

// ===========================================
// FETCH STRADDLE STRATEGY
// ===========================================

async function fetchShortStraddle() {
    const skipStrikes = parseInt(document.getElementById('straddleSkipStrikes').value);
    const expiry = parseInt(document.getElementById('straddleExpiry').value);
    const lots = parseInt(document.getElementById('straddleLots').value);
    const initialSlPercent = parseFloat(document.getElementById('straddleInitialSL').value);
    
    const resultDiv = document.getElementById('straddleResult');
    resultDiv.innerHTML = '<div class="text-center py-4 text-gray-600">Loading straddle strategy...</div>';
    
    try {
        const userId = sessionStorage.getItem('user_id');
        
        const response = await fetch(`${STRADDLE_CONFIG.backendUrl}/api/straddle/fetch-short-straddle`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-ID': userId
            },
            body: JSON.stringify({
                skip_strikes: skipStrikes,
                expiry_days: expiry
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            currentStraddleStrategy = { 
                ...data, 
                lots,
                initialSlPercent,
                trailPoints: 6,  // Default
                stepSize: 0.5    // Default
            };
            displayStraddleResult(data, lots, initialSlPercent);
        } else {
            resultDiv.innerHTML = `<div class="text-center py-4 text-red-600">Error: ${data.error || 'Failed to fetch strategy'}</div>`;
        }
    } catch (error) {
        console.error('Straddle fetch error:', error);
        resultDiv.innerHTML = `<div class="text-center py-4 text-red-600">Error: ${error.message}</div>`;
    }
}

function displayStraddleResult(data, lots, initialSlPercent) {
    const resultDiv = document.getElementById('straddleResult');
    
    const atmCall = data.atm_call;
    const atmPut = data.atm_put;
    const hedgeCall = data.hedge_call;
    const hedgePut = data.hedge_put;
    
    // Calculate total premium received
    const totalPremium = (atmCall.last_price + atmPut.last_price) * lots * atmCall.lot_size;
    
    // Calculate initial SL levels
    const ceSlPrice = atmCall.last_price * (1 + initialSlPercent / 100);
    const peSlPrice = atmPut.last_price * (1 + initialSlPercent / 100);
    
    let html = `
        <!-- NIFTY Info -->
        <div class="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg p-4 mb-4">
            <div class="text-center">
                <div class="text-sm text-gray-600 mb-1">NIFTY 50</div>
                <div class="text-3xl font-bold text-gray-900">₹${data.nifty_price.toFixed(2)}</div>
                <div class="text-xs text-gray-500 mt-1">ATM Strike: ${data.atm_strike}</div>
            </div>
        </div>
        
        <!-- Strategy Summary -->
        <div class="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-4 mb-4">
            <div class="flex items-center justify-between mb-2">
                <h4 class="font-bold text-gray-900">Strategy Summary</h4>
                <span class="px-3 py-1 bg-yellow-100 text-yellow-800 text-xs font-semibold rounded-full">SHORT STRADDLE</span>
            </div>
            <div class="grid grid-cols-2 gap-4 text-sm">
                <div>
                    <span class="text-gray-600">Total Premium:</span>
                    <span class="font-bold text-green-600 ml-2">₹${totalPremium.toFixed(2)}</span>
                </div>
                <div>
                    <span class="text-gray-600">Initial SL:</span>
                    <span class="font-bold text-red-600 ml-2">${initialSlPercent}%</span>
                </div>
            </div>
        </div>
        
        <!-- ATM Options (Sell) -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <!-- ATM CALL -->
            <div class="border-2 border-red-200 rounded-lg p-4 bg-red-50">
                <div class="flex items-center justify-between mb-2">
                    <h4 class="font-bold text-gray-900">ATM CALL (Sell)</h4>
                    <span class="px-2 py-1 bg-red-100 text-red-700 text-xs font-semibold rounded">SELL</span>
                </div>
                <div class="space-y-2 text-sm">
                    <div><span class="text-gray-600">Symbol:</span> <span class="font-mono font-semibold">${atmCall.symbol}</span></div>
                    <div><span class="text-gray-600">Strike:</span> <span class="font-bold">${atmCall.strike}</span></div>
                    <div><span class="text-gray-600">LTP:</span> <span class="font-bold text-green-600">₹${atmCall.last_price.toFixed(2)}</span></div>
                    <div><span class="text-gray-600">Initial SL:</span> <span class="font-bold text-red-600">₹${ceSlPrice.toFixed(2)}</span></div>
                    <div><span class="text-gray-600">Lots:</span> <span class="font-bold">${lots}</span></div>
                </div>
            </div>
            
            <!-- ATM PUT -->
            <div class="border-2 border-red-200 rounded-lg p-4 bg-red-50">
                <div class="flex items-center justify-between mb-2">
                    <h4 class="font-bold text-gray-900">ATM PUT (Sell)</h4>
                    <span class="px-2 py-1 bg-red-100 text-red-700 text-xs font-semibold rounded">SELL</span>
                </div>
                <div class="space-y-2 text-sm">
                    <div><span class="text-gray-600">Symbol:</span> <span class="font-mono font-semibold">${atmPut.symbol}</span></div>
                    <div><span class="text-gray-600">Strike:</span> <span class="font-bold">${atmPut.strike}</span></div>
                    <div><span class="text-gray-600">LTP:</span> <span class="font-bold text-green-600">₹${atmPut.last_price.toFixed(2)}</span></div>
                    <div><span class="text-gray-600">Initial SL:</span> <span class="font-bold text-red-600">₹${peSlPrice.toFixed(2)}</span></div>
                    <div><span class="text-gray-600">Lots:</span> <span class="font-bold">${lots}</span></div>
                </div>
            </div>
        </div>
        
        <!-- Hedge Options (Buy) -->
        <div class="mb-4">
            <h4 class="font-bold text-gray-700 mb-2 text-sm">Hedge Positions</h4>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <!-- HEDGE CALL -->
                <div class="border border-green-200 rounded-lg p-3 bg-green-50">
                    <div class="flex items-center justify-between mb-1">
                        <span class="text-xs font-semibold text-gray-700">Hedge CALL (Buy)</span>
                        <span class="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-semibold rounded">BUY</span>
                    </div>
                    <div class="text-xs space-y-1">
                        <div><span class="text-gray-600">Strike:</span> <span class="font-bold">${hedgeCall.strike}</span></div>
                        <div><span class="text-gray-600">LTP:</span> <span class="font-bold text-green-600">₹${hedgeCall.last_price.toFixed(2)}</span></div>
                    </div>
                </div>
                
                <!-- HEDGE PUT -->
                <div class="border border-green-200 rounded-lg p-3 bg-green-50">
                    <div class="flex items-center justify-between mb-1">
                        <span class="text-xs font-semibold text-gray-700">Hedge PUT (Buy)</span>
                        <span class="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-semibold rounded">BUY</span>
                    </div>
                    <div class="text-xs space-y-1">
                        <div><span class="text-gray-600">Strike:</span> <span class="font-bold">${hedgePut.strike}</span></div>
                        <div><span class="text-gray-600">LTP:</span> <span class="font-bold text-green-600">₹${hedgePut.last_price.toFixed(2)}</span></div>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Action Buttons -->
        <div class="flex flex-wrap gap-3 justify-center">
            <button onclick="checkStraddleMargin()" 
                    class="border-2 border-blue-500 text-blue-600 font-semibold px-6 py-3 rounded-lg hover:bg-blue-50 transition-all">
                Check Margin
            </button>
            <button onclick="deployStraddle()" 
                    class="btn-primary text-white font-semibold px-8 py-3 rounded-lg">
                Deploy Straddle
            </button>
        </div>
        
        <!-- Margin Check Result -->
        <div id="straddleMarginResult" class="hidden mt-4"></div>
    `;
    
    resultDiv.innerHTML = html;
}

// ===========================================
// MARGIN CHECK
// ===========================================

async function checkStraddleMargin() {
    if (!currentStraddleStrategy) return;
    
    const marginDiv = document.getElementById('straddleMarginResult');
    marginDiv.innerHTML = '<p class="text-center py-4 text-gray-600">Checking margin...</p>';
    marginDiv.classList.remove('hidden');
    
    try {
        const userId = sessionStorage.getItem('user_id');
        
        // Prepare orders for margin check
        // IMPORTANT: Hedges must be placed first to reduce margin requirement
        const orders = [
            {
                exchange: 'NFO',
                tradingsymbol: currentStraddleStrategy.hedge_call.symbol,
                transaction_type: 'BUY',
                lots: currentStraddleStrategy.lots,
                product: 'MIS',
                order_type: 'MARKET',
                price: 0
            },
            {
                exchange: 'NFO',
                tradingsymbol: currentStraddleStrategy.hedge_put.symbol,
                transaction_type: 'BUY',
                lots: currentStraddleStrategy.lots,
                product: 'MIS',
                order_type: 'MARKET',
                price: 0
            },
            {
                exchange: 'NFO',
                tradingsymbol: currentStraddleStrategy.atm_call.symbol,
                transaction_type: 'SELL',
                lots: currentStraddleStrategy.lots,
                product: 'MIS',
                order_type: 'MARKET',
                price: 0
            },
            {
                exchange: 'NFO',
                tradingsymbol: currentStraddleStrategy.atm_put.symbol,
                transaction_type: 'SELL',
                lots: currentStraddleStrategy.lots,
                product: 'MIS',
                order_type: 'MARKET',
                price: 0
            }
        ];
        
        const response = await fetch(`${STRADDLE_CONFIG.backendUrl}/api/strategy/check-basket-margin`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-ID': userId
            },
            body: JSON.stringify({ orders })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            const html = `
                <div class="bg-white border-2 border-gray-200 rounded-lg p-4">
                    <h4 class="font-bold text-gray-900 mb-3">Margin Requirement</h4>
                    <div class="space-y-2">
                        <div class="flex justify-between text-sm">
                            <span class="font-semibold">Available Balance:</span>
                            <span class="font-bold text-green-600">₹${data.available_balance.toFixed(2)}</span>
                        </div>
                        <div class="flex justify-between text-sm">
                            <span class="font-semibold">Required Margin:</span>
                            <span class="font-bold text-blue-600">₹${data.total_required.toFixed(2)}</span>
                        </div>
                        <div class="flex justify-between text-sm pt-2 border-t-2 border-gray-300">
                            <span class="font-semibold">Status:</span>
                            <span class="font-bold ${data.sufficient ? 'text-green-600' : 'text-red-600'}">
                                ${data.sufficient ? '✓ Sufficient' : '✗ Insufficient'}
                            </span>
                        </div>
                    </div>
                </div>
            `;
            marginDiv.innerHTML = html;
        } else {
            marginDiv.innerHTML = `<div class="text-center py-4 text-red-600">Error: ${data.error || 'Failed to check margin'}</div>`;
        }
    } catch (error) {
        console.error('Margin check error:', error);
        marginDiv.innerHTML = `<div class="text-center py-4 text-red-600">Error: ${error.message}</div>`;
    }
}

// ===========================================
// DEPLOY STRADDLE
// ===========================================

async function deployStraddle() {
    if (!currentStraddleStrategy) return;
    
    if (!confirm('Deploy Short Straddle with automated trailing stop loss?')) return;
    
    const resultDiv = document.getElementById('straddleResult');
    resultDiv.innerHTML = '<div class="text-center py-4 text-gray-600">Deploying straddle strategy...</div>';
    
    try {
        const userId = sessionStorage.getItem('user_id');
        const lots = currentStraddleStrategy.lots;
        const lotSize = currentStraddleStrategy.atm_call.lot_size;
        
        // Prepare orders
        // IMPORTANT: Hedges must be placed first to reduce margin requirement
        const orders = [
            {
                tradingsymbol: currentStraddleStrategy.hedge_call.symbol,
                token: currentStraddleStrategy.hedge_call.token,
                transaction_type: 'BUY',
                quantity: lots * lotSize,
                product: 'MIS',
                label: 'Hedge CE (Buy)'
            },
            {
                tradingsymbol: currentStraddleStrategy.hedge_put.symbol,
                token: currentStraddleStrategy.hedge_put.token,
                transaction_type: 'BUY',
                quantity: lots * lotSize,
                product: 'MIS',
                label: 'Hedge PE (Buy)'
            },
            {
                tradingsymbol: currentStraddleStrategy.atm_call.symbol,
                token: currentStraddleStrategy.atm_call.token,
                transaction_type: 'SELL',
                quantity: lots * lotSize,
                product: 'MIS',
                label: 'ATM CE (Sell)'
            },
            {
                tradingsymbol: currentStraddleStrategy.atm_put.symbol,
                token: currentStraddleStrategy.atm_put.token,
                transaction_type: 'SELL',
                quantity: lots * lotSize,
                product: 'MIS',
                label: 'ATM PE (Sell)'
            }
        ];
        
        const response = await fetch(`${STRADDLE_CONFIG.backendUrl}/api/straddle/deploy-straddle`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-ID': userId
            },
            body: JSON.stringify({
                orders: orders,
                initial_sl_percent: currentStraddleStrategy.initialSlPercent,
                trail_points: 6,
                step_size: 0.5
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            displayDeploymentResult(data);
            
            // Start monitoring straddle status
            startStraddleMonitoring();
        } else {
            resultDiv.innerHTML = `<div class="text-center py-4 text-red-600">Error: ${data.error || 'Failed to deploy strategy'}
                ${data.debug_info ? `<div class="mt-4 text-xs text-left bg-gray-100 p-3 rounded"><strong>Debug Info:</strong><pre>${JSON.stringify(data.debug_info, null, 2)}</pre></div>` : ''}
            </div>`;
        }
    } catch (error) {
        console.error('Deploy error:', error);
        resultDiv.innerHTML = `<div class="text-center py-4 text-red-600">Error: ${error.message}</div>`;
    }
}

function displayDeploymentResult(data) {
    const resultDiv = document.getElementById('straddleResult');
    
    // Check if orders are completed or pending (AMO)
    const ordersCompleted = data.orders_completed === true;
    const marketClosed = data.market_status === 'closed';
    
    let statusIcon, statusColor, statusTitle, statusMessage;
    
    if (ordersCompleted) {
        statusIcon = `
            <svg class="w-12 h-12 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
        `;
        statusColor = 'green';
        statusTitle = '✅ Straddle Deployed!';
        statusMessage = data.message;
    } else if (marketClosed) {
        statusIcon = `
            <svg class="w-12 h-12 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
        `;
        statusColor = 'blue';
        statusTitle = '🕐 AMO Orders Placed';
        statusMessage = data.message;
    } else {
        statusIcon = `
            <svg class="w-12 h-12 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
            </svg>
        `;
        statusColor = 'orange';
        statusTitle = '⚠️ Orders Pending';
        statusMessage = data.message || 'Orders placed but not yet completed';
    }
    
    let html = `
        <div class="bg-white border-2 border-gray-200 rounded-lg p-6">
            <div class="text-center mb-6">
                <div class="inline-block p-4 bg-${statusColor}-100 rounded-full mb-3">
                    ${statusIcon}
                </div>
                <h3 class="text-2xl font-bold text-gray-900 mb-2">${statusTitle}</h3>
                <p class="text-gray-600">${statusMessage}</p>
            </div>
    `;
    
    // Show straddle ID and status if available
    if (data.straddle_id) {
        html += `
            <div class="bg-${statusColor}-50 border-2 border-${statusColor}-200 rounded-lg p-4 mb-4">
                <div class="grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <span class="text-gray-600">Straddle ID:</span>
                        <span class="font-mono font-bold text-${statusColor}-700 ml-2">${data.straddle_id}</span>
                    </div>
                    <div>
                        <span class="text-gray-600">Status:</span>
                        <span class="font-bold text-${statusColor}-600 ml-2">${ordersCompleted ? 'ACTIVE' : 'PENDING'}</span>
                    </div>
                </div>
            </div>
        `;
    }
    
    // Show average prices if orders are completed
    if (ordersCompleted && data.atm_call_avg_price && data.atm_put_avg_price) {
        html += `
            <div class="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
                <h4 class="font-bold text-gray-700 mb-3">Average Prices</h4>
                <div class="grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <span class="text-gray-600">ATM Call:</span>
                        <span class="font-bold ml-2">₹${data.atm_call_avg_price.toFixed(2)}</span>
                    </div>
                    <div>
                        <span class="text-gray-600">ATM Put:</span>
                        <span class="font-bold ml-2">₹${data.atm_put_avg_price.toFixed(2)}</span>
                    </div>
                </div>
            </div>
        `;
    }
    
    // Show order status details if available
    if (data.order_status_details && data.order_status_details.length > 0) {
        html += `
            <div class="space-y-2 mb-4">
                <h4 class="font-bold text-gray-700 mb-2">Order Status Details</h4>
        `;
        
        data.order_status_details.forEach(detail => {
            const statusColorMap = {
                'COMPLETE': 'green',
                'OPEN': 'blue',
                'TRIGGER PENDING': 'blue',
                'AMO REQ RECEIVED': 'blue',
                'REJECTED': 'red',
                'CANCELLED': 'gray'
            };
            const statusBgColor = statusColorMap[detail.status] || 'gray';
            
            html += `
                <div class="border-2 border-${statusBgColor}-200 bg-${statusBgColor}-50 rounded-lg p-3">
                    <div class="flex items-center justify-between mb-2">
                        <span class="font-semibold text-sm">${detail.label}</span>
                        <span class="px-2 py-1 bg-${statusBgColor}-100 text-${statusBgColor}-700 text-xs font-bold rounded">${detail.status}</span>
                    </div>
                    <div class="text-xs space-y-1">
                        <div>Symbol: <span class="font-mono">${detail.symbol}</span></div>
                        <div>Order ID: <span class="font-mono">${detail.order_id}</span></div>
                        ${detail.average_price > 0 ? `<div>Avg Price: ₹${detail.average_price.toFixed(2)}</div>` : ''}
                        ${detail.filled_quantity > 0 ? `<div>Filled: ${detail.filled_quantity} / ${detail.filled_quantity + detail.pending_quantity}</div>` : ''}
                    </div>
                </div>
            `;
        });
        
        html += `</div>`;
    } else {
        // Show basic order results
        html += `
            <div class="space-y-2 max-h-64 overflow-y-auto mb-4">
                <h4 class="font-bold text-gray-700 mb-2">Order Results</h4>
        `;
        
        data.order_results.forEach(result => {
            const statusClass = result.success 
                ? 'bg-green-50 border-green-200 text-green-700' 
                : 'bg-red-50 border-red-200 text-red-700';
            
            html += `
                <div class="border-2 ${statusClass} rounded-lg p-3">
                    <div class="flex items-center justify-between mb-1">
                        <span class="font-semibold text-sm">${result.label}</span>
                        <span class="text-xs font-bold">${result.success ? '✓ PLACED' : '✗ FAILED'}</span>
                    </div>
                    ${result.success ? `
                        <div class="text-xs">
                            <div>Symbol: ${result.symbol}</div>
                            <div>Order ID: ${result.order_id}</div>
                            <div>Type: ${result.transaction_type}</div>
                        </div>
                    ` : `
                        <div class="text-xs">${result.error}</div>
                    `}
                </div>
            `;
        });
        
        html += `</div>`;
    }
    
    // Show appropriate info box
    if (ordersCompleted) {
        html += `
            <div class="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div class="flex items-start">
                    <svg class="w-5 h-5 text-yellow-600 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path>
                    </svg>
                    <div class="text-sm text-yellow-800">
                        <strong>Automated Trailing Active:</strong>
                        <p class="mt-1">Trailing stop loss is now running automatically. Check the "Straddle Monitor" section below for real-time updates.</p>
                    </div>
                </div>
            </div>
        `;
    } else if (marketClosed) {
        html += `
            <div class="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div class="flex items-start">
                    <svg class="w-5 h-5 text-blue-600 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path>
                    </svg>
                    <div class="text-sm text-blue-800">
                        <strong>Market Closed - AMO Orders:</strong>
                        <p class="mt-1">${data.note || 'Your orders have been placed as AMO (After Market Orders) and will be executed when the market opens. The automated trailing stop loss will be activated automatically once the orders are filled and execution prices are available.'}</p>
                    </div>
                </div>
            </div>
        `;
    } else {
        html += `
            <div class="mt-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                <div class="flex items-start">
                    <svg class="w-5 h-5 text-orange-600 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path>
                    </svg>
                    <div class="text-sm text-orange-800">
                        <strong>Orders Pending:</strong>
                        <p class="mt-1">${data.note || 'Some orders have been placed but are not yet completed. Please check your trading terminal for current status. Automated trailing will not start until all orders are executed.'}</p>
                    </div>
                </div>
            </div>
        `;
    }
    
    html += `</div>`;
    
    resultDiv.innerHTML = html;
}

// ===========================================
// STRADDLE MONITORING
// ===========================================

function startStraddleMonitoring() {
    // Clear any existing interval
    if (straddleStatusInterval) {
        clearInterval(straddleStatusInterval);
    }
    
    // Show monitor section
    document.getElementById('straddleMonitor').classList.remove('hidden');
    
    // Update immediately
    updateStraddleStatus();
    
    // Update every 3 seconds
    straddleStatusInterval = setInterval(updateStraddleStatus, 3000);
}

async function updateStraddleStatus() {
    try {
        const userId = sessionStorage.getItem('user_id');
        
        const response = await fetch(`${STRADDLE_CONFIG.backendUrl}/api/straddle/straddle-status`, {
            headers: { 'X-User-ID': userId }
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            displayStraddleStatus(data);
        }
    } catch (error) {
        console.error('Status update error:', error);
    }
}

function displayStraddleStatus(data) {
    const statusDiv = document.getElementById('straddleStatusContent');
    const logsDiv = document.getElementById('straddleLogsContent');
    
    // Display active straddles
    if (data.active_straddles && data.active_straddles.length > 0) {
        let html = '<div class="space-y-3">';
        
        data.active_straddles.forEach(straddle => {
            const statusColor = straddle.status === 'active' ? 'green' : 
                                straddle.status === 'completed' ? 'gray' : 'orange';
            
            html += `
                <div class="border-2 border-${statusColor}-200 bg-${statusColor}-50 rounded-lg p-4">
                    <div class="flex items-center justify-between mb-3">
                        <span class="font-mono text-sm font-bold">${straddle.straddle_id}</span>
                        <span class="px-3 py-1 bg-${statusColor}-100 text-${statusColor}-700 text-xs font-semibold rounded-full">
                            ${straddle.status.toUpperCase()}
                        </span>
                    </div>
                    <div class="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <div class="text-gray-600 text-xs mb-1">CE Status</div>
                            <div class="font-bold ${straddle.ce_sl_hit ? 'text-red-600' : 'text-green-600'}">
                                ${straddle.ce_sl_hit ? '✗ SL Hit' : '✓ Active'}
                            </div>
                            ${straddle.ce_current_sl ? `
                                <div class="text-xs text-gray-600 mt-1">SL: ₹${straddle.ce_current_sl.toFixed(2)}</div>
                            ` : ''}
                        </div>
                        <div>
                            <div class="text-gray-600 text-xs mb-1">PE Status</div>
                            <div class="font-bold ${straddle.pe_sl_hit ? 'text-red-600' : 'text-green-600'}">
                                ${straddle.pe_sl_hit ? '✗ SL Hit' : '✓ Active'}
                            </div>
                            ${straddle.pe_current_sl ? `
                                <div class="text-xs text-gray-600 mt-1">SL: ₹${straddle.pe_current_sl.toFixed(2)}</div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        statusDiv.innerHTML = html;
    } else {
        statusDiv.innerHTML = '<div class="text-center text-gray-500 py-8">No active straddles</div>';
    }
    
    // Display logs
    if (data.logs && data.logs.length > 0) {
        let logsHtml = '<div class="space-y-2">';
        
        // Reverse to show newest first
        data.logs.reverse().forEach(log => {
            let logClass = 'log-entry info';
            
            if (log.message.includes('✅') || log.message.includes('✓')) {
                logClass = 'log-entry success';
            } else if (log.message.includes('❌') || log.message.includes('⚠️') || log.message.includes('✗')) {
                logClass = 'log-entry error';
            } else if (log.message.includes('🔽') || log.message.includes('🔼') || log.message.includes('🎯')) {
                logClass = 'log-entry info';
            }
            
            logsHtml += `
                <div class="${logClass}">
                    <div class="flex items-start justify-between">
                        <span class="text-xs flex-1">${log.message}</span>
                        <span class="text-xs text-gray-500 ml-2 whitespace-nowrap">${log.timestamp}</span>
                    </div>
                </div>
            `;
        });
        
        logsHtml += '</div>';
        logsDiv.innerHTML = logsHtml;
    } else {
        logsDiv.innerHTML = '<div class="text-center text-gray-500 py-4 text-sm">No logs yet</div>';
    }
}

function stopStraddleMonitoring() {
    if (straddleStatusInterval) {
        clearInterval(straddleStatusInterval);
        straddleStatusInterval = null;
    }
    
    document.getElementById('straddleMonitor').classList.add('hidden');
}

// ===========================================
// EVENT LISTENERS
// ===========================================

document.addEventListener('DOMContentLoaded', function() {
    const fetchBtn = document.getElementById('fetchStraddleBtn');
    if (fetchBtn) {
        fetchBtn.addEventListener('click', fetchShortStraddle);
    }
});

console.log('Short Straddle module initialized');
