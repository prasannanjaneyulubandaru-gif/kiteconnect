// Chart Monitor Module
// This file handles all chart monitoring functionality

// Configuration (reuse from login.js if available, otherwise define)
const CHART_CONFIG = {
    backendUrl: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? 'http://localhost:5000'
        : 'https://shark-app-hyd9r.ondigitalocean.app'
};

// Monitor state
let monitorState = {
    isRunning: false,
    intervalId: null,
    lastCheckTime: null
};

// Initialize chart monitor - will be called from login.js when needed
let chartMonitorInitialized = false;

function initializeChartMonitor() {
    if (chartMonitorInitialized) return;
    
    console.log('Initializing Chart Monitor...');
    setupChartMonitorListeners();
    chartMonitorInitialized = true;
}

// Check monitor status on page load
async function checkInitialMonitorStatus() {
    try {
        const userId = sessionStorage.getItem('user_id');
        if (!userId) return;
        
        console.log('Checking initial monitor status...');
        
        const response = await fetch(`${CHART_CONFIG.backendUrl}/api/monitor-status`, {
            headers: { 'X-User-ID': userId }
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            monitorState.isRunning = data.running;
            updateMonitorUI(data.running);
            
            if (data.running) {
                addLog('Monitor was already running', 'info');
                startStatusPolling();
            } else {
                addLog('Monitor is not running', 'info');
            }
        }
    } catch (error) {
        console.error('Initial status check error:', error);
        addLog('Failed to check monitor status', 'error');
    }
}

// Auto-initialize on page load if elements exist
window.addEventListener('load', () => {
    setTimeout(() => {
        if (document.getElementById('chartMonitorPage')) {
            initializeChartMonitor();
            checkInitialMonitorStatus();
        }
    }, 500);
});

// ===========================================
// SETUP EVENT LISTENERS
// ===========================================

function setupChartMonitorListeners() {
    console.log('Setting up Chart Monitor listeners...');
    
    const startBtn = document.getElementById('startMonitorBtn');
    const stopBtn = document.getElementById('stopMonitorBtn');
    const checkNowBtn = document.getElementById('checkNowBtn');
    const testEmailBtn = document.getElementById('testEmailBtn');
    
    console.log('Found buttons:', {
        startBtn: !!startBtn,
        stopBtn: !!stopBtn,
        checkNowBtn: !!checkNowBtn,
        testEmailBtn: !!testEmailBtn
    });
    
    if (startBtn) {
        startBtn.addEventListener('click', startMonitor);
        console.log('Start button listener attached');
    }
    
    if (stopBtn) {
        stopBtn.addEventListener('click', stopMonitor);
        console.log('Stop button listener attached');
    }
    
    if (checkNowBtn) {
        checkNowBtn.addEventListener('click', checkNow);
        console.log('Check Now button listener attached');
    }
    
    if (testEmailBtn) {
        testEmailBtn.addEventListener('click', testEmail);
        console.log('Test Email button listener attached');
    }
    
    console.log('Chart Monitor listeners setup complete');
}

// ===========================================
// MONITOR FUNCTIONS
// ===========================================

async function startMonitor() {
    const instrumentToken = document.getElementById('instrumentToken').value;
    const interval = document.getElementById('intervalSelect').value;
    const threshold = document.getElementById('thresholdPercent').value;
    const frequency = parseInt(document.getElementById('checkFrequency').value);
    
    // Validate inputs
    if (!instrumentToken || !interval || !threshold) {
        addLog('Please fill all fields', 'error');
        return;
    }
    
    try {
        const userId = sessionStorage.getItem('user_id');
        
        addLog('Starting monitor...', 'info');
        
        const response = await fetch(`${CHART_CONFIG.backendUrl}/api/start-monitor`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-ID': userId
            },
            body: JSON.stringify({
                instrument_token: parseInt(instrumentToken),
                interval: interval,
                threshold: parseFloat(threshold),
                frequency: frequency
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            monitorState.isRunning = true;
            updateMonitorUI(true);
            addLog('Monitor started successfully', 'success');
            
            // Start client-side status polling
            startStatusPolling();
        } else {
            throw new Error(data.error || 'Failed to start monitor');
        }
    } catch (error) {
        console.error('Start monitor error:', error);
        addLog('Failed to start monitor: ' + error.message, 'error');
    }
}

async function stopMonitor() {
    if (!monitorState.isRunning) {
        addLog('Monitor is not running', 'info');
        return;
    }
    
    try {
        const userId = sessionStorage.getItem('user_id');
        
        addLog('Stopping monitor...', 'info');
        
        const response = await fetch(`${CHART_CONFIG.backendUrl}/api/stop-monitor`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-ID': userId
            }
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            monitorState.isRunning = false;
            updateMonitorUI(false);
            stopStatusPolling();
            addLog('Monitor stopped successfully', 'success');
        } else {
            throw new Error(data.error || 'Failed to stop monitor');
        }
    } catch (error) {
        console.error('Stop monitor error:', error);
        addLog('Failed to stop monitor: ' + error.message, 'error');
    }
}

async function checkNow() {
    const instrumentToken = document.getElementById('instrumentToken').value;
    const interval = document.getElementById('intervalSelect').value;
    const threshold = document.getElementById('thresholdPercent').value;
    
    if (!instrumentToken || !interval || !threshold) {
        addLog('Please fill all fields', 'error');
        return;
    }
    
    addLog('Checking candle strength...', 'info');
    
    try {
        const userId = sessionStorage.getItem('user_id');
        
        const response = await fetch(`${CHART_CONFIG.backendUrl}/api/check-candle`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-ID': userId
            },
            body: JSON.stringify({
                instrument_token: parseInt(instrumentToken),
                interval: interval,
                threshold: parseFloat(threshold)
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            const result = data.result;
            const bodyPercent = result.body_percent.toFixed(2);
            const candle = result.candle_data;
            
            let message = `Body: ${bodyPercent}% | Open: ₹${candle.open.toFixed(2)} | Close: ₹${candle.close.toFixed(2)} | High: ₹${candle.high.toFixed(2)} | Low: ₹${candle.low.toFixed(2)}`;
            
            if (result.alert_sent) {
                addLog(`✅ ${result.message} - Email sent!`, 'success');
            } else if (bodyPercent >= threshold) {
                addLog(`⚠️ Strong candle detected (${bodyPercent}%) but no email sent`, 'info');
            } else {
                addLog(`ℹ️ ${result.message} (${bodyPercent}%)`, 'info');
            }
            
            addLog(message, 'info');
        } else {
            throw new Error(data.error || 'Check failed');
        }
    } catch (error) {
        console.error('Check now error:', error);
        addLog('Check failed: ' + error.message, 'error');
    }
}

async function testEmail() {
    addLog('Sending test email...', 'info');
    
    try {
        const userId = sessionStorage.getItem('user_id');
        
        const response = await fetch(`${CHART_CONFIG.backendUrl}/api/test-email`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-ID': userId
            }
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            addLog('✅ Test email sent successfully!', 'success');
        } else {
            throw new Error(data.error || 'Failed to send test email');
        }
    } catch (error) {
        console.error('Test email error:', error);
        addLog('Failed to send test email: ' + error.message, 'error');
    }
}

// ===========================================
// STATUS POLLING
// ===========================================

function startStatusPolling() {
    // Clear any existing interval
    stopStatusPolling();
    
    // Poll every 10 seconds to check if monitor is still running
    monitorState.intervalId = setInterval(async () => {
        try {
            const userId = sessionStorage.getItem('user_id');
            if (!userId) {
                stopStatusPolling();
                return;
            }
            
            const response = await fetch(`${CHART_CONFIG.backendUrl}/api/monitor-status`, {
                headers: { 'X-User-ID': userId }
            });
            
            const data = await response.json();
            
            if (response.ok && data.success) {
                if (!data.running && monitorState.isRunning) {
                    // Monitor stopped on backend
                    monitorState.isRunning = false;
                    updateMonitorUI(false);
                    addLog('Monitor stopped on server', 'info');
                    stopStatusPolling();
                }
            }
        } catch (error) {
            console.error('Status poll error:', error);
        }
    }, 10000);
}

function stopStatusPolling() {
    if (monitorState.intervalId) {
        clearInterval(monitorState.intervalId);
        monitorState.intervalId = null;
    }
}

// ===========================================
// UI UPDATES
// ===========================================

function updateMonitorUI(isRunning) {
    const statusDiv = document.getElementById('monitorStatus');
    const startBtn = document.getElementById('startMonitorBtn');
    const stopBtn = document.getElementById('stopMonitorBtn');
    
    if (!statusDiv || !startBtn || !stopBtn) {
        console.error('UI elements not found');
        return;
    }
    
    if (isRunning) {
        // Update status indicator
        statusDiv.classList.remove('inactive');
        statusDiv.classList.add('active');
        statusDiv.querySelector('span').textContent = 'Running';
        statusDiv.querySelector('.pulse').classList.remove('bg-red-600');
        statusDiv.querySelector('.pulse').classList.add('bg-green-600');
        
        // Update buttons
        startBtn.classList.add('hidden');
        stopBtn.classList.remove('hidden');
        
        // Disable inputs
        document.getElementById('instrumentToken').disabled = true;
        document.getElementById('intervalSelect').disabled = true;
        document.getElementById('thresholdPercent').disabled = true;
        document.getElementById('checkFrequency').disabled = true;
    } else {
        // Update status indicator
        statusDiv.classList.remove('active');
        statusDiv.classList.add('inactive');
        statusDiv.querySelector('span').textContent = 'Stopped';
        statusDiv.querySelector('.pulse').classList.remove('bg-green-600');
        statusDiv.querySelector('.pulse').classList.add('bg-red-600');
        
        // Update buttons
        startBtn.classList.remove('hidden');
        stopBtn.classList.add('hidden');
        
        // Enable inputs
        document.getElementById('instrumentToken').disabled = false;
        document.getElementById('intervalSelect').disabled = false;
        document.getElementById('thresholdPercent').disabled = false;
        document.getElementById('checkFrequency').disabled = false;
    }
}

function addLog(message, type = 'info') {
    const logContainer = document.getElementById('activityLog');
    if (!logContainer) return;
    
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    logEntry.innerHTML = `
        <div class="flex justify-between items-start">
            <span class="text-sm">${message}</span>
            <span class="text-xs text-gray-500 ml-4">${timestamp}</span>
        </div>
    `;
    
    // Add to top of log
    logContainer.insertBefore(logEntry, logContainer.firstChild);
    
    // Keep only last 50 entries
    while (logContainer.children.length > 50) {
        logContainer.removeChild(logContainer.lastChild);
    }
}

// ===========================================
// CLEANUP ON PAGE UNLOAD
// ===========================================

window.addEventListener('beforeunload', () => {
    stopStatusPolling();
});
