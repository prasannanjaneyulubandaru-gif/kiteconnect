// Emergency Actions Module - emergency_actions.js

const EMERGENCY_CONFIG = {
    backendUrl: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? 'http://localhost:5000' 
        : 'https://shark-app-hyd9r.ondigitalocean.app'
};

// ===========================================
// EXIT ALL POSITIONS
// ===========================================

async function exitAllPositions() {
    if (!confirm('⚠️ WARNING: This will EXIT ALL open positions immediately at MARKET price!\n\nAre you sure you want to continue?')) {
        return;
    }

    const modal = document.getElementById('emergencyModal');
    const title = document.getElementById('emergencyModalTitle');
    const content = document.getElementById('emergencyModalContent');
    const results = document.getElementById('emergencyResults');

    title.textContent = '⚠️ Exiting All Positions';
    content.innerHTML = '<p class="text-center py-8">Processing... Please wait...</p>';
    results.classList.add('hidden');
    modal.classList.add('show');

    try {
        // Get user ID from sessionStorage
        const userId = sessionStorage.getItem('user_id') || sessionStorage.getItem('userId') || sessionStorage.getItem('userid');
        
        if (!userId) {
            throw new Error('User ID not found. Please login again.');
        }

        console.log('🚀 Calling exit-all endpoint:', `${EMERGENCY_CONFIG.backendUrl}/api/positions/exit-all`);
        console.log('👤 User ID:', userId);

        const response = await fetch(`${EMERGENCY_CONFIG.backendUrl}/api/positions/exit-all`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-ID': userId
            }
        });

        console.log('📡 Response status:', response.status);
        console.log('✅ Response ok:', response.ok);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Error response:', errorText);
            throw new Error(`HTTP error! status: ${response.status} - ${errorText.substring(0, 100)}`);
        }

        const data = await response.json();
        console.log('📦 Response data:', data);

        if (data.success) {
            let html = `
                <div class="bg-green-50 border-2 border-green-200 rounded-lg p-4 mb-4">
                    <h3 class="font-bold text-lg text-green-800 mb-2">✓ Exit Complete</h3>
                    <div class="grid grid-cols-3 gap-4 text-center mb-4">
                        <div>
                            <div class="text-2xl font-bold text-gray-900">${data.total_attempted}</div>
                            <div class="text-xs text-gray-600">Total</div>
                        </div>
                        <div>
                            <div class="text-2xl font-bold text-green-600">${data.closed_positions.length}</div>
                            <div class="text-xs text-gray-600">Closed</div>
                        </div>
                        <div>
                            <div class="text-2xl font-bold text-red-600">${data.failed_positions.length}</div>
                            <div class="text-xs text-gray-600">Failed</div>
                        </div>
                    </div>
                </div>
                <div class="space-y-2 max-h-96 overflow-y-auto">
            `;

            // Show closed positions
            data.closed_positions.forEach(pos => {
                const pnlColor = pos.pnl >= 0 ? 'text-green-600' : 'text-red-600';
                html += `
                    <div class="bg-green-50 border-2 border-green-200 rounded-lg p-3">
                        <div class="flex items-center justify-between mb-1">
                            <span class="font-mono font-semibold text-sm">${pos.tradingsymbol}</span>
                            <span class="text-xs font-bold ${pnlColor}">P&L: ₹${pos.pnl.toFixed(2)}</span>
                        </div>
                        <div class="text-xs text-gray-600">
                            Qty: ${pos.quantity} • Order ID: ${pos.order_id}
                        </div>
                    </div>
                `;
            });

            // Show failed positions
            data.failed_positions.forEach(pos => {
                html += `
                    <div class="bg-red-50 border-2 border-red-200 rounded-lg p-3">
                        <div class="flex items-center justify-between mb-1">
                            <span class="font-mono font-semibold text-sm text-red-700">${pos.tradingsymbol}</span>
                            <span class="text-xs font-bold text-red-700">FAILED</span>
                        </div>
                        <div class="text-xs text-red-600">${pos.error}</div>
                    </div>
                `;
            });

            html += `
                </div>
                <div class="mt-6">
                    <button onclick="closeEmergencyModal()" class="w-full btn-primary text-white font-semibold py-3 rounded-lg">
                        Close
                    </button>
                </div>
            `;
            results.innerHTML = html;
        } else {
            results.innerHTML = `
                <div class="bg-red-50 border-2 border-red-200 rounded-lg p-4 mb-4">
                    <h3 class="font-bold text-lg text-red-800 mb-2">✗ Error</h3>
                    <p class="text-red-700">${data.error || 'Unknown error occurred'}</p>
                </div>
                <div class="mt-6">
                    <button onclick="closeEmergencyModal()" class="w-full btn-primary text-white font-semibold py-3 rounded-lg">
                        Close
                    </button>
                </div>
            `;
        }

        content.classList.add('hidden');
        results.classList.remove('hidden');

    } catch (error) {
        console.error('❌ Exit all positions error:', error);
        content.classList.add('hidden');
        results.innerHTML = `
            <div class="bg-red-50 border-2 border-red-200 rounded-lg p-4 mb-4">
                <h3 class="font-bold text-lg text-red-800 mb-2">✗ Error</h3>
                <p class="text-red-700">${error.message}</p>
            </div>
            <div class="mt-6">
                <button onclick="closeEmergencyModal()" class="w-full btn-primary text-white font-semibold py-3 rounded-lg">
                    Close
                </button>
            </div>
        `;
        results.classList.remove('hidden');
    }
}

// ===========================================
// CANCEL ALL ORDERS
// ===========================================

async function cancelAllOrders() {
    if (!confirm('🚫 WARNING: This will CANCEL ALL pending orders immediately!\n\nAre you sure you want to continue?')) {
        return;
    }

    const modal = document.getElementById('emergencyModal');
    const title = document.getElementById('emergencyModalTitle');
    const content = document.getElementById('emergencyModalContent');
    const results = document.getElementById('emergencyResults');

    title.textContent = '🚫 Cancelling All Orders';
    content.innerHTML = '<p class="text-center py-8">Processing... Please wait...</p>';
    results.classList.add('hidden');
    modal.classList.add('show');

    try {
        // Get user ID from sessionStorage
        const userId = sessionStorage.getItem('user_id') || sessionStorage.getItem('userId') || sessionStorage.getItem('userid');
        
        if (!userId) {
            throw new Error('User ID not found. Please login again.');
        }

        console.log('🚀 Calling cancel-all endpoint:', `${EMERGENCY_CONFIG.backendUrl}/api/orders/cancel-all`);
        console.log('👤 User ID:', userId);

        const response = await fetch(`${EMERGENCY_CONFIG.backendUrl}/api/orders/cancel-all`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-ID': userId
            }
        });

        console.log('📡 Response status:', response.status);
        console.log('✅ Response ok:', response.ok);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Error response:', errorText);
            throw new Error(`HTTP error! status: ${response.status} - ${errorText.substring(0, 100)}`);
        }

        const data = await response.json();
        console.log('📦 Response data:', data);

        if (data.success) {
            let html = `
                <div class="bg-amber-50 border-2 border-amber-200 rounded-lg p-4 mb-4">
                    <h3 class="font-bold text-lg text-amber-800 mb-2">✓ Cancellation Complete</h3>
                    <div class="grid grid-cols-3 gap-4 text-center mb-4">
                        <div>
                            <div class="text-2xl font-bold text-gray-900">${data.total_attempted}</div>
                            <div class="text-xs text-gray-600">Total</div>
                        </div>
                        <div>
                            <div class="text-2xl font-bold text-green-600">${data.cancelled_orders.length}</div>
                            <div class="text-xs text-gray-600">Cancelled</div>
                        </div>
                        <div>
                            <div class="text-2xl font-bold text-red-600">${data.failed_orders.length}</div>
                            <div class="text-xs text-gray-600">Failed</div>
                        </div>
                    </div>
                </div>
                <div class="space-y-2 max-h-96 overflow-y-auto">
            `;

            // Show cancelled orders
            data.cancelled_orders.forEach(order => {
                html += `
                    <div class="bg-green-50 border-2 border-green-200 rounded-lg p-3">
                        <div class="flex items-center justify-between mb-1">
                            <span class="font-mono font-semibold text-sm">${order.tradingsymbol}</span>
                            <span class="text-xs font-bold text-green-700">CANCELLED</span>
                        </div>
                        <div class="text-xs text-gray-600">
                            Order ID: ${order.order_id} • Qty: ${order.quantity} • ${order.order_type}
                        </div>
                    </div>
                `;
            });

            // Show failed cancellations
            data.failed_orders.forEach(order => {
                html += `
                    <div class="bg-red-50 border-2 border-red-200 rounded-lg p-3">
                        <div class="flex items-center justify-between mb-1">
                            <span class="font-mono font-semibold text-sm text-red-700">${order.tradingsymbol}</span>
                            <span class="text-xs font-bold text-red-700">FAILED</span>
                        </div>
                        <div class="text-xs text-red-600">${order.error}</div>
                    </div>
                `;
            });

            html += `
                </div>
                <div class="mt-6">
                    <button onclick="closeEmergencyModal()" class="w-full btn-primary text-white font-semibold py-3 rounded-lg">
                        Close
                    </button>
                </div>
            `;
            results.innerHTML = html;
        } else {
            results.innerHTML = `
                <div class="bg-red-50 border-2 border-red-200 rounded-lg p-4 mb-4">
                    <h3 class="font-bold text-lg text-red-800 mb-2">✗ Error</h3>
                    <p class="text-red-700">${data.error || 'Unknown error occurred'}</p>
                </div>
                <div class="mt-6">
                    <button onclick="closeEmergencyModal()" class="w-full btn-primary text-white font-semibold py-3 rounded-lg">
                        Close
                    </button>
                </div>
            `;
        }

        content.classList.add('hidden');
        results.classList.remove('hidden');

    } catch (error) {
        console.error('❌ Cancel all orders error:', error);
        content.classList.add('hidden');
        results.innerHTML = `
            <div class="bg-red-50 border-2 border-red-200 rounded-lg p-4 mb-4">
                <h3 class="font-bold text-lg text-red-800 mb-2">✗ Error</h3>
                <p class="text-red-700">${error.message}</p>
            </div>
            <div class="mt-6">
                <button onclick="closeEmergencyModal()" class="w-full btn-primary text-white font-semibold py-3 rounded-lg">
                    Close
                </button>
            </div>
        `;
        results.classList.remove('hidden');
    }
}

// ===========================================
// MODAL CONTROL
// ===========================================

function closeEmergencyModal() {
    const modal = document.getElementById('emergencyModal');
    if (modal) {
        modal.classList.remove('show');
        
        // Clear content after animation
        setTimeout(() => {
            const content = document.getElementById('emergencyModalContent');
            const results = document.getElementById('emergencyResults');
            if (content) content.innerHTML = '';
            if (results) {
                results.innerHTML = '';
                results.classList.add('hidden');
            }
        }, 300);
    }
}

// Make functions globally available
window.exitAllPositions = exitAllPositions;
window.cancelAllOrders = cancelAllOrders;
window.closeEmergencyModal = closeEmergencyModal;

console.log('✅ Emergency Actions module loaded');
