// FIXED Manage Positions Module - manage_positions.js
// Fixed authentication, error handling, and API response parsing

const MANAGE_POSITIONS_CONFIG = {
    backendUrl: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? 'http://localhost:5000' 
        : 'https://shark-app-hyd9r.ondigitalocean.app'
};

// State management
const positionsState = {
    userId: null,
    selectedPosition: null,
    autoTrailInterval: null
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    positionsState.userId = sessionStorage.getItem('user_id');
    
    // Debug: Log user_id
    console.log('Manage Positions - User ID:', positionsState.userId);
    console.log('Session Storage:', {
        user_id: sessionStorage.getItem('user_id'),
        access_token: sessionStorage.getItem('access_token')
    });
    
    if (!positionsState.userId) {
        console.error('No user_id found in sessionStorage');
        const positionsList = document.getElementById('positionsList');
        if (positionsList) {
            positionsList.innerHTML = `
                <div class="text-center text-red-500 py-8">
                    <div class="mb-2">⚠️ Not logged in</div>
                    <div class="text-sm">Please log in first</div>
                    <button onclick="window.location.reload()" class="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm">
                        Go to Login
                    </button>
                </div>
            `;
        }
        return;
    }
    
    setupManagePositionsListeners();
});

// ===========================================
// MANAGE POSITIONS PAGE
// ===========================================

function setupManagePositionsListeners() {
    const refreshBtn = document.getElementById('refreshPositionsBtn');
    const trailBtn = document.getElementById('trailSlBtn');
    const exitBtn = document.getElementById('exitImmediatelyBtn');
    
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadPositions);
        console.log('✓ Refresh button listener attached');
    }
    if (trailBtn) {
        trailBtn.addEventListener('click', showTrailSlConfig);
        console.log('✓ Trail SL button listener attached');
    }
    if (exitBtn) {
        exitBtn.addEventListener('click', exitPositionImmediately);
        console.log('✓ Exit button listener attached');
    }
}

async function loadPositions() {
    const positionsList = document.getElementById('positionsList');
    positionsList.innerHTML = '<div class="text-center text-gray-500 py-8">Loading positions...</div>';
    
    // Check user_id
    if (!positionsState.userId) {
        positionsState.userId = sessionStorage.getItem('user_id');
        if (!positionsState.userId) {
            positionsList.innerHTML = `
                <div class="text-center text-red-500 py-8">
                    <div class="mb-2">⚠️ Authentication Error</div>
                    <div class="text-sm">User ID not found. Please log in again.</div>
                    <button onclick="handleLogout()" class="mt-4 px-4 py-2 bg-red-500 text-white rounded-lg text-sm">
                        Logout & Re-login
                    </button>
                </div>
            `;
            return;
        }
    }
    
    console.log('Loading positions for user:', positionsState.userId);
    
    try {
        const url = `${MANAGE_POSITIONS_CONFIG.backendUrl}/api/positions`;
        console.log('Fetching from:', url);
        console.log('With headers:', { 'X-User-ID': positionsState.userId });
        
        const response = await fetch(url, {
            method: 'GET',
            headers: { 
                'X-User-ID': positionsState.userId
            }
        });
        
        console.log('Response status:', response.status);
        console.log('Response headers:', Object.fromEntries(response.headers.entries()));
        
        if (response.status === 401) {
            // Session expired or invalid
            positionsList.innerHTML = `
                <div class="text-center text-red-500 py-8">
                    <div class="mb-2">🔒 Session Expired</div>
                    <div class="text-sm mb-4">Your session has expired or is invalid.</div>
                    <div class="text-xs text-gray-600 mb-4">This usually happens after the server restarts or your session times out.</div>
                    <button onclick="handleLogout()" class="px-6 py-2 bg-red-500 text-white rounded-lg font-semibold">
                        Logout & Re-login
                    </button>
                </div>
            `;
            return;
        }
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('API Error:', response.status, errorText);
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const data = await response.json();
        console.log('Positions data received:', data);
        
        if (data.success) {
            // Fix key names from backend response
            const positions = data.positions.map(p => ({
                exchange: p.exchange,
                tradingsymbol: p.tradingsymbol,
                quantity: p.quantity,
                average_price: p.averageprice || p.average_price, // Handle both key formats
                product: p.product,
                pnl: p.pnl
            }));
            
            displayPositions(positions);
        } else {
            positionsList.innerHTML = `
                <div class="text-center text-red-500 py-8">
                    <div class="mb-2">❌ Error</div>
                    <div class="text-sm">${data.error || 'Failed to load positions'}</div>
                    <button onclick="loadPositions()" class="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm">
                        Retry
                    </button>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error loading positions:', error);
        positionsList.innerHTML = `
            <div class="text-center text-red-500 py-8">
                <div class="mb-2">❌ Connection Error</div>
                <div class="text-sm mb-2">${error.message}</div>
                <div class="text-xs text-gray-600 mb-4">
                    Make sure the backend server is running and accessible.
                </div>
                <button onclick="loadPositions()" class="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm">
                    Retry
                </button>
            </div>
        `;
    }
}

function displayPositions(positions) {
    const positionsList = document.getElementById('positionsList');
    
    console.log('Displaying positions:', positions);
    
    if (!positions || positions.length === 0) {
        positionsList.innerHTML = `
            <div class="text-center text-gray-500 py-8">
                <div class="text-4xl mb-2">📊</div>
                <div class="font-semibold mb-1">No Open Positions</div>
                <div class="text-sm">You don't have any open positions right now</div>
            </div>
        `;
        return;
    }
    
    positionsList.innerHTML = '';
    
    positions.forEach((position, index) => {
        console.log(`Position ${index}:`, position);
        
        const positionCard = document.createElement('div');
        positionCard.className = 'position-card';
        
        const isLong = position.quantity > 0;
        const sideColor = isLong ? 'text-green-600' : 'text-red-600';
        const side = isLong ? 'LONG' : 'SHORT';
        
        positionCard.innerHTML = `
            <div class="flex items-center justify-between">
                <div>
                    <div class="font-bold text-lg">
                        <span class="mono">${position.exchange}:${position.tradingsymbol}</span>
                    </div>
                    <div class="text-sm text-gray-600 mt-1">
                        <span class="${sideColor} font-semibold">${side} ${Math.abs(position.quantity)}</span>
                        <span class="mx-2">@</span>
                        <span>₹${position.average_price.toFixed(2)}</span>
                        <span class="ml-3 badge badge-info">${position.product}</span>
                    </div>
                </div>
                <div class="text-right">
                    <div class="text-sm text-gray-600">P&L</div>
                    <div class="font-bold text-lg ${position.pnl >= 0 ? 'text-green-600' : 'text-red-600'}">
                        ${position.pnl >= 0 ? '+' : ''}₹${position.pnl.toFixed(2)}
                    </div>
                </div>
            </div>
        `;
        
        positionCard.addEventListener('click', () => selectPosition(position, positionCard));
        
        positionsList.appendChild(positionCard);
    });
}

function selectPosition(position, cardElement) {
    positionsState.selectedPosition = position;
    
    console.log('Position selected:', position);
    
    // Update UI
    document.querySelectorAll('.position-card').forEach(card => {
        card.classList.remove('selected');
    });
    cardElement.classList.add('selected');
    
    // Show actions panel
    const actionsPanel = document.getElementById('positionActionsPanel');
    actionsPanel.classList.remove('hidden');
    
    // Hide no selection message
    const noSelectionMsg = document.getElementById('noSelectionMessage');
    if (noSelectionMsg) {
        noSelectionMsg.classList.add('hidden');
    }
    
    const isLong = position.quantity > 0;
    const sideColor = isLong ? 'text-green-600' : 'text-red-600';
    const side = isLong ? 'LONG' : 'SHORT';
    
    const selectedInfo = document.getElementById('selectedPositionInfo');
    selectedInfo.innerHTML = `
        <div class="p-4 bg-yellow-50 rounded-lg">
            <div class="font-bold text-lg">
                ${position.exchange}:${position.tradingsymbol}
            </div>
            <div class="mt-2 text-sm">
                <span class="${sideColor} font-semibold">${side} ${Math.abs(position.quantity)}</span>
                <span class="mx-2">@</span>
                <span>₹${position.average_price.toFixed(2)}</span>
                <span class="ml-3 badge badge-info">${position.product}</span>
            </div>
        </div>
    `;
    
    // Hide trailing config and status
    document.getElementById('trailSlConfig').classList.add('hidden');
    document.getElementById('trailStatus').classList.add('hidden');
    document.getElementById('positionMessages').innerHTML = '';
}

function showTrailSlConfig() {
    if (!positionsState.selectedPosition) {
        alert('Please select a position first');
        return;
    }
    
    const configDiv = document.getElementById('trailSlConfig');
    const contentDiv = document.getElementById('trailConfigContent');
    
    const isLong = positionsState.selectedPosition.quantity > 0;
    const avgPrice = positionsState.selectedPosition.average_price;
    
    contentDiv.innerHTML = `
        <div class="mb-4">
            <p class="text-sm text-gray-600 mb-2">
                Set trailing stop loss from average price (₹${avgPrice.toFixed(2)})
            </p>
            <div class="mb-4">
                <label class="block text-sm font-semibold text-gray-900 mb-2">Trail Points</label>
                <input
                    type="number"
                    id="trailPoints"
                    value="10"
                    step="0.5"
                    class="w-full px-4 py-3 border-2 border-gray-200 rounded-lg text-gray-900 text-sm"
                    placeholder="Enter points"
                />
            </div>
            <div class="mb-4">
                <label class="block text-sm font-semibold text-gray-900 mb-2">
                    Limit Price Buffer (%)
                    <span class="text-xs font-normal text-gray-500 ml-1">- Distance from trigger to limit price</span>
                </label>
                <input
                    type="number"
                    id="bufferPercent"
                    value="0.5"
                    min="0.2"
                    max="5"
                    step="0.1"
                    class="w-full px-4 py-3 border-2 border-gray-200 rounded-lg text-gray-900 text-sm"
                    placeholder="0.2 to 5"
                />
                <p class="text-xs text-gray-500 mt-1">
                    Recommended: 0.2% - 1% for stocks, 0.5% - 2% for F&O. Lower values = tighter spread.
                </p>
            </div>
            <div class="grid grid-cols-2 gap-4">
                <button id="startTrailBtn" class="btn-success text-white font-semibold px-6 py-3 rounded-lg">
                    🎯 Manual Trail
                </button>
                <button id="startAutoTrailBtn" class="btn-primary text-white font-semibold px-8 py-3 rounded-lg">
                    🤖 Auto Trail
                </button>
            </div>
        </div>
        <div class="p-3 bg-blue-50 rounded-lg text-sm text-blue-800">
            <strong>ℹ️ Choose Trailing Mode:</strong>
            <ul class="mt-2 space-y-1 ml-4">
                <li><strong>Manual Trail:</strong> Place SL and use +/- buttons to adjust manually</li>
                <li><strong>Auto Trail:</strong> Automatically moves SL in real-time as price moves in your favor (WebSocket)</li>
            </ul>
            <p class="mt-2 text-xs">
                Both use SL (Stop Loss Limit) orders ${isLong ? 'below' : 'above'} your average price. Buffer % controls the difference between trigger and limit price.
            </p>
        </div>
    `;
    
    configDiv.classList.remove('hidden');
    
    // Add event listeners
    setTimeout(() => {
        const startBtn = document.getElementById('startTrailBtn');
        const autoBtn = document.getElementById('startAutoTrailBtn');
        if (startBtn) startBtn.addEventListener('click', startTrailing);
        if (autoBtn) autoBtn.addEventListener('click', startAutoTrailing);
    }, 100);
}

async function startTrailing() {
    if (!positionsState.selectedPosition) return;
    
    const trailPoints = parseFloat(document.getElementById('trailPoints').value);
    const bufferPercentInput = parseFloat(document.getElementById('bufferPercent').value);
    
    if (isNaN(trailPoints) || trailPoints <= 0) {
        alert('Please enter a valid trail points value');
        return;
    }
    
    if (isNaN(bufferPercentInput) || bufferPercentInput < 0.2 || bufferPercentInput > 5) {
        alert('Buffer percent must be between 0.2% and 5%');
        return;
    }
    
    const bufferPercent = bufferPercentInput / 100;  // Convert to decimal
    
    const position = positionsState.selectedPosition;
    const isLong = position.quantity > 0;
    
    let triggerPrice;
    if (isLong) {
        triggerPrice = position.average_price - trailPoints;
    } else {
        triggerPrice = position.average_price + trailPoints;
    }
    
    triggerPrice = Math.round(triggerPrice / 0.05) * 0.05;
    
    let limitPrice;
    if (isLong) {
        limitPrice = triggerPrice * (1 - bufferPercent);
    } else {
        limitPrice = triggerPrice * (1 + bufferPercent);
    }
    limitPrice = Math.round(limitPrice / 0.05) * 0.05;
    
    const transactionType = isLong ? 'SELL' : 'BUY';
    
    try {
        const response = await fetch(`${MANAGE_POSITIONS_CONFIG.backendUrl}/api/place-order`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-ID': positionsState.userId
            },
            body: JSON.stringify({
                exchange: position.exchange,
                tradingsymbol: position.tradingsymbol,
                transaction_type: transactionType,
                quantity: Math.abs(position.quantity),
                product: position.product,
                order_type: 'SL',
                trigger_price: triggerPrice,
                price: limitPrice,
                variety: 'regular'
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('trailSlConfig').classList.add('hidden');
            showManualTrailControls(data.order_id, triggerPrice, limitPrice, trailPoints);
            
            const messagesDiv = document.getElementById('positionMessages');
            messagesDiv.innerHTML = `
                <div class="p-4 bg-green-50 border-2 border-green-200 rounded-lg">
                    <div class="font-bold text-green-800 mb-2">✅ Manual Trail SL Placed</div>
                    <div class="text-sm space-y-1">
                        <div>Order ID: ${data.order_id}</div>
                        <div>Trigger: ₹${triggerPrice.toFixed(2)}</div>
                        <div>Limit: ₹${limitPrice.toFixed(2)}</div>
                        <div>Trail Points: ${trailPoints}</div>
                    </div>
                </div>
            `;
        } else {
            alert('Error placing order: ' + data.error);
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error: ' + error.message);
    }
}

async function startAutoTrailing() {
    if (!positionsState.selectedPosition) return;
    
    const trailPoints = parseFloat(document.getElementById('trailPoints').value);
    const bufferPercentInput = parseFloat(document.getElementById('bufferPercent').value);
    
    if (isNaN(trailPoints) || trailPoints <= 0) {
        alert('Please enter a valid trail points value');
        return;
    }
    
    if (isNaN(bufferPercentInput) || bufferPercentInput < 0.2 || bufferPercentInput > 5) {
        alert('Buffer percent must be between 0.2% and 5%');
        return;
    }
    
    const bufferPercent = bufferPercentInput / 100;  // Convert to decimal
    
    const position = positionsState.selectedPosition;
    
    try {
        const response = await fetch(`${MANAGE_POSITIONS_CONFIG.backendUrl}/api/start-auto-trail`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-ID': positionsState.userId
            },
            body: JSON.stringify({
                exchange: position.exchange,
                tradingsymbol: position.tradingsymbol,
                quantity: position.quantity,
                average_price: position.average_price,
                product: position.product,
                trail_points: trailPoints,
                buffer_percent: bufferPercent
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('trailSlConfig').classList.add('hidden');
            showAutoTrailControls(data.position_key, data.trigger_price, data.limit_price);
        } else {
            alert('Error starting auto trail: ' + data.error);
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error: ' + error.message);
    }
}

function showAutoTrailControls(positionKey, trigger, limit) {
    const statusDiv = document.getElementById('trailStatus');
    const contentDiv = document.getElementById('trailStatusContent');
    
    contentDiv.innerHTML = `
        <div class="space-y-4">
            <!-- Top: Status Header and Stop Button -->
            <div class="flex items-center justify-between gap-4">
                <div class="flex-1 p-4 bg-green-50 rounded-lg border-2 border-green-500">
                    <div class="font-bold text-green-800 mb-2 flex items-center gap-2">
                        <div class="animate-pulse w-3 h-3 bg-green-600 rounded-full"></div>
                        Real-Time Automated Trailing Active
                    </div>
                    <div class="text-sm text-green-700">
                        <div>Initial Trigger: ₹${trigger.toFixed(2)} | Initial Limit: ₹${limit.toFixed(2)}</div>
                        <div class="mt-1 text-xs">System will automatically move SL as price moves in your favor</div>
                    </div>
                </div>
                <button onclick="stopAutoTrailing('${positionKey}')" class="btn-danger text-white font-semibold px-8 py-4 rounded-lg whitespace-nowrap">
                    ⏹️ Stop Auto Trail
                </button>
            </div>
            
            <!-- Real-time status updates panel - Full Width -->
            <div class="p-6 bg-gray-900 rounded-lg text-green-400 font-mono text-sm" style="min-height: 400px; max-height: 600px; overflow-y: auto;">
                <div class="font-bold text-green-300 mb-4 text-base">📊 Real-Time Trail Status & Logs</div>
                <div id="autoTrailLog" class="space-y-2">
                    <div class="text-gray-500">Waiting for updates...</div>
                </div>
            </div>
        </div>
    `;
    
    statusDiv.classList.remove('hidden');
    
    // Start polling for status updates every 2 seconds
    if (positionsState.autoTrailInterval) {
        clearInterval(positionsState.autoTrailInterval);
    }
    
    positionsState.autoTrailInterval = setInterval(() => {
        fetchAutoTrailStatus();
    }, 2000); // Update every 2 seconds
}

async function fetchAutoTrailStatus() {
    try {
        const response = await fetch(`${MANAGE_POSITIONS_CONFIG.backendUrl}/api/get-trail-status`, {
            method: 'GET',
            headers: {
                'X-User-ID': positionsState.userId
            }
        });
        
        const data = await response.json();
        
        if (data.success && data.positions) {
            updateAutoTrailLog(data.positions, data.logs || []);
        }
    } catch (error) {
        console.error('Error fetching trail status:', error);
    }
}

function updateAutoTrailLog(positions, logs) {
    const logDiv = document.getElementById('autoTrailLog');
    if (!logDiv) return;
    
    let html = '';
    
    // Show position summaries first
    for (const [posKey, details] of Object.entries(positions)) {
        const currentPrice = details.current_price || 0;
        const trigger = details.trigger_price;
        const limit = details.limit_price;
        const pnl = details.pnl || 0;
        const updateCount = details.update_count || 0;
        const distance = Math.abs(currentPrice - trigger);
        const side = details.exit_type === 'SELL' ? 'LONG' : 'SHORT';
        
        const pnlColor = pnl >= 0 ? 'text-green-400' : 'text-red-400';
        const sideColor = side === 'LONG' ? 'text-blue-400' : 'text-orange-400';
        
        html += `
            <div class="border-l-2 border-green-600 pl-2 py-1 mb-2">
                <div class="flex items-center gap-2">
                    <span class="${sideColor} font-bold">${side}</span>
                    <span class="text-white">${details.symbol}</span>
                    <span class="text-gray-500">#${updateCount}</span>
                </div>
                <div class="text-xs">
                    LTP: <span class="text-white">₹${currentPrice.toFixed(2)}</span> | 
                    SL: <span class="text-yellow-400">₹${trigger.toFixed(2)}</span> | 
                    Limit: <span class="text-blue-400">₹${limit.toFixed(2)}</span>
                </div>
                <div class="text-xs">
                    Distance: <span class="text-white">${distance.toFixed(2)}</span> | 
                    P&L: <span class="${pnlColor}">${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}</span> pts
                </div>
            </div>
        `;
    }
    
    // Show recent log entries
    if (logs && logs.length > 0) {
        html += '<div class="border-t border-gray-700 my-2 pt-2">';
        html += '<div class="text-gray-400 text-xs mb-1">Recent Updates:</div>';
        
        // Show last 10 logs
        const recentLogs = logs.slice(-10);
        for (const log of recentLogs) {
            const time = new Date(log.time * 1000).toLocaleTimeString();
            html += `<div class="text-xs text-gray-300">[${time}] ${log.msg}</div>`;
        }
        
        html += '</div>';
    }
    
    if (html === '') {
        html = '<div class="text-gray-500">No active trailing positions</div>';
    }
    
    logDiv.innerHTML = html;
    
    // Auto-scroll to bottom
    logDiv.parentElement.scrollTop = logDiv.parentElement.scrollHeight;
}

async function stopAutoTrailing(positionKey) {
    if (!confirm('Stop automated trailing for this position?')) return;
    
    try {
        if (positionsState.autoTrailInterval) {
            clearInterval(positionsState.autoTrailInterval);
            positionsState.autoTrailInterval = null;
        }
        
        const response = await fetch(`${MANAGE_POSITIONS_CONFIG.backendUrl}/api/stop-auto-trail`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-ID': positionsState.userId
            },
            body: JSON.stringify({
                position_key: positionKey
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('trailStatus').classList.add('hidden');
            const messagesDiv = document.getElementById('positionMessages');
            messagesDiv.innerHTML = `
                <div class="p-4 bg-yellow-50 border-2 border-yellow-200 rounded-lg">
                    <div class="font-bold text-yellow-800 mb-1">⏹️ Trailing Stopped</div>
                    <div class="text-sm">Automated trailing stopped. Remember to cancel the SL order manually if needed.</div>
                </div>
            `;
            
            // Fetch status one more time to update the log display
            setTimeout(() => fetchAutoTrailStatus(), 500);
        } else {
            alert('Error stopping auto trail: ' + data.error);
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error: ' + error.message);
    }
}

function showManualTrailControls(orderId, currentTrigger, currentLimit, trailPoints) {
    const statusDiv = document.getElementById('trailStatus');
    const contentDiv = document.getElementById('trailStatusContent');
    
    // Calculate buffer percent from trigger and limit
    const position = positionsState.selectedPosition;
    const isLong = position.quantity > 0;
    let bufferPercent;
    if (isLong) {
        bufferPercent = (currentTrigger - currentLimit) / currentTrigger;
    } else {
        bufferPercent = (currentLimit - currentTrigger) / currentTrigger;
    }
    const bufferPercentDisplay = (bufferPercent * 100).toFixed(2);
    
    contentDiv.innerHTML = `
        <div class="space-y-4">
            <div class="flex items-center gap-4">
                <!-- Price Display -->
                <div class="flex-1 grid grid-cols-2 gap-4">
                    <div class="p-6 bg-green-50 rounded-lg border-2 border-green-200">
                        <div class="text-sm text-gray-600 mb-1">Trigger Price</div>
                        <div class="text-3xl font-bold text-green-600">₹<span id="currentTrigger">${currentTrigger.toFixed(2)}</span></div>
                    </div>
                    <div class="p-6 bg-blue-50 rounded-lg border-2 border-blue-200">
                        <div class="text-sm text-gray-600 mb-1">Limit Price (${bufferPercentDisplay}% buffer)</div>
                        <div class="text-3xl font-bold text-blue-600">₹<span id="currentLimit">${currentLimit.toFixed(2)}</span></div>
                    </div>
                </div>
                
                <!-- Stop Button -->
                <button onclick="stopTrailing('${orderId}')" class="btn-danger text-white font-semibold px-8 py-6 rounded-lg whitespace-nowrap h-full">
                    ⏹️ Stop & Cancel SL
                </button>
            </div>
            
            <!-- Adjustment Controls -->
            <div class="p-6 bg-gray-50 rounded-lg border-2 border-gray-200">
                <label class="block text-base font-bold text-gray-900 mb-3">Manual Trigger Adjustment</label>
                <div class="grid grid-cols-4 gap-3">
                    <button onclick="adjustTrigger(-2)" class="border-2 border-gray-300 bg-white text-gray-700 font-semibold px-6 py-4 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition text-base">
                        -2 pts
                    </button>
                    <button onclick="adjustTrigger(-1)" class="border-2 border-gray-300 bg-white text-gray-700 font-semibold px-6 py-4 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition text-base">
                        -1 pt
                    </button>
                    <button onclick="adjustTrigger(1)" class="border-2 border-gray-300 bg-white text-gray-700 font-semibold px-6 py-4 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition text-base">
                        +1 pt
                    </button>
                    <button onclick="adjustTrigger(2)" class="border-2 border-gray-300 bg-white text-gray-700 font-semibold px-6 py-4 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition text-base">
                        +2 pts
                    </button>
                </div>
                <p class="text-xs text-gray-500 mt-2">Click buttons to manually adjust the trigger price. Limit price will be automatically recalculated.</p>
            </div>
        </div>
    `;
    
    statusDiv.classList.remove('hidden');
    statusDiv.dataset.orderId = orderId;
    statusDiv.dataset.currentTrigger = currentTrigger;
    statusDiv.dataset.currentLimit = currentLimit;
    statusDiv.dataset.bufferPercent = bufferPercent;  // Store for adjustTrigger to use
}

async function adjustTrigger(points) {
    const statusDiv = document.getElementById('trailStatus');
    const orderId = statusDiv.dataset.orderId;
    let currentTrigger = parseFloat(statusDiv.dataset.currentTrigger);
    const bufferPercent = parseFloat(statusDiv.dataset.bufferPercent) || 0.005;  // Use stored or default to 0.5%
    
    const oldTrigger = currentTrigger;
    currentTrigger += points;
    currentTrigger = Math.round(currentTrigger / 0.05) * 0.05;
    
    const position = positionsState.selectedPosition;
    const isLong = position.quantity > 0;
    
    let limitPrice;
    if (isLong) {
        limitPrice = currentTrigger * (1 - bufferPercent);
    } else {
        limitPrice = currentTrigger * (1 + bufferPercent);
    }
    limitPrice = Math.round(limitPrice / 0.05) * 0.05;
    
    try {
        const response = await fetch(`${MANAGE_POSITIONS_CONFIG.backendUrl}/api/modify-order`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-ID': positionsState.userId
            },
            body: JSON.stringify({
                order_id: orderId,
                variety: 'regular',
                trigger_price: currentTrigger,
                price: limitPrice,
                order_type: 'SL',
                quantity: Math.abs(positionsState.selectedPosition.quantity)
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            statusDiv.dataset.orderId = data.order_id;
            statusDiv.dataset.currentTrigger = currentTrigger;
            statusDiv.dataset.currentLimit = limitPrice;
            statusDiv.dataset.bufferPercent = bufferPercent;  // Update buffer percent
            document.getElementById('currentTrigger').textContent = currentTrigger.toFixed(2);
            document.getElementById('currentLimit').textContent = limitPrice.toFixed(2);
            
            const messagesDiv = document.getElementById('positionMessages');
            const timestamp = new Date().toLocaleTimeString();
            const direction = points > 0 ? '⬆️ RAISED' : '⬇️ LOWERED';
            const symbol = positionsState.selectedPosition.tradingsymbol;
            const exchange = positionsState.selectedPosition.exchange;
            
            messagesDiv.innerHTML = `
                <div class="p-3 bg-green-50 border-2 border-green-200 rounded-lg text-sm">
                    <div class="font-bold text-green-800 mb-1">✅ Manual Adjustment</div>
                    <div class="font-mono text-xs space-y-1">
                        <div>[${timestamp}] ${direction} ${exchange}:${symbol}</div>
                        <div>Old Trigger: ₹${oldTrigger.toFixed(2)} → New: ₹${currentTrigger.toFixed(2)} (${points > 0 ? '+' : ''}${points} pts)</div>
                        <div>New Limit: ₹${limitPrice.toFixed(2)}</div>
                        <div>New Order ID: ${data.order_id}</div>
                    </div>
                </div>
            `;
        } else {
            alert('Error modifying order: ' + data.error);
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error: ' + error.message);
    }
}

async function stopTrailing(orderId) {
    if (!confirm('Cancel the stop loss order?')) return;
    
    try {
        const response = await fetch(`${MANAGE_POSITIONS_CONFIG.backendUrl}/api/cancel-order`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-ID': positionsState.userId
            },
            body: JSON.stringify({
                order_id: orderId,
                variety: 'regular'
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('trailStatus').classList.add('hidden');
            document.getElementById('positionMessages').innerHTML = `
                <div class="p-4 bg-yellow-50 border-2 border-yellow-200 rounded-lg">
                    <div class="font-bold text-yellow-800 mb-1">⏹️ SL Cancelled</div>
                    <div class="text-sm">Stop loss order cancelled successfully</div>
                </div>
            `;
        } else {
            alert('Error cancelling order: ' + data.error);
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error: ' + error.message);
    }
}

async function exitPositionImmediately() {
    if (!positionsState.selectedPosition) {
        alert('Please select a position first');
        return;
    }
    
    const position = positionsState.selectedPosition;
    const confirmation = confirm(`Exit ${position.tradingsymbol} immediately at market price?`);
    
    if (!confirmation) return;
    
    const transactionType = position.quantity > 0 ? 'SELL' : 'BUY';
    
    try {
        const response = await fetch(`${MANAGE_POSITIONS_CONFIG.backendUrl}/api/place-order`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-ID': positionsState.userId
            },
            body: JSON.stringify({
                exchange: position.exchange,
                tradingsymbol: position.tradingsymbol,
                transaction_type: transactionType,
                quantity: Math.abs(position.quantity),
                product: position.product,
                order_type: 'MARKET',
                variety: 'regular'
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('positionMessages').innerHTML = `
                <div class="p-4 bg-green-50 border-2 border-green-200 rounded-lg">
                    <div class="font-bold text-green-800 mb-2">✅ Position Exited</div>
                    <div class="text-sm">
                        Order ID: ${data.order_id}<br>
                        ${position.tradingsymbol} exited at market price
                    </div>
                </div>
            `;
            
            // Refresh positions after 2 seconds
            setTimeout(() => {
                loadPositions();
                // Reset selection
                positionsState.selectedPosition = null;
                document.getElementById('positionActionsPanel').classList.add('hidden');
                const noSelectionMsg = document.getElementById('noSelectionMessage');
                if (noSelectionMsg) noSelectionMsg.classList.remove('hidden');
            }, 2000);
        } else {
            alert('Error exiting position: ' + data.error);
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error: ' + error.message);
    }
}

// Make functions globally available for onclick handlers
window.adjustTrigger = adjustTrigger;
window.stopTrailing = stopTrailing;
window.stopAutoTrailing = stopAutoTrailing;
window.loadPositions = loadPositions;

console.log('✓ Manage Positions module loaded successfully');
