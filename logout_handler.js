// ===========================================
// LOGOUT FUNCTION
// Add this to your auth.js or main JavaScript file
// ===========================================

/**
 * Logout function with proper cleanup
 * This will stop any running monitors and clear the session
 */
async function logout() {
    try {
        const userId = sessionStorage.getItem('user_id');
        
        // Show logout message
        console.log('Logging out...');
        
        if (userId) {
            // Determine backend URL
            const backendUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
                ? 'http://localhost:5000'
                : 'https://shark-app-hyd9r.ondigitalocean.app';
            
            try {
                // Call backend logout to cleanup monitors and session
                const response = await fetch(`${backendUrl}/api/logout`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-User-ID': userId
                    }
                });
                
                const data = await response.json();
                
                if (response.ok && data.success) {
                    console.log('Logout successful:', data.message);
                } else {
                    console.warn('Logout warning:', data.error);
                }
            } catch (error) {
                console.error('Logout API error:', error);
                // Continue with logout even if API call fails
            }
        }
        
        // Clear all session storage
        sessionStorage.clear();
        
        // Clear any local storage if used
        // localStorage.clear(); // Uncomment if you use localStorage
        
        console.log('Session cleared');
        
        // Redirect to login page
        window.location.href = 'index.html';
        
    } catch (error) {
        console.error('Logout error:', error);
        
        // Force logout even if there's an error
        sessionStorage.clear();
        window.location.href = 'index.html';
    }
}

// ===========================================
// ATTACH LOGOUT TO BUTTONS
// ===========================================

/**
 * Setup logout button listeners
 * Call this function after DOM is loaded
 */
function setupLogoutListeners() {
    // Find all logout buttons (adjust selectors based on your HTML)
    const logoutButtons = document.querySelectorAll('[id*="logout"], [class*="logout-btn"]');
    
    logoutButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
    });
    
    console.log(`Attached logout listeners to ${logoutButtons.length} buttons`);
}

// Auto-setup on page load
document.addEventListener('DOMContentLoaded', () => {
    setupLogoutListeners();
});

// ===========================================
// AUTO LOGOUT ON SESSION EXPIRY
// ===========================================

/**
 * Check session validity periodically
 * Optional: Add this if you want auto-logout on session expiry
 */
function startSessionValidation() {
    const backendUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? 'http://localhost:5000'
        : 'https://shark-app-hyd9r.ondigitalocean.app';
    
    setInterval(async () => {
        const userId = sessionStorage.getItem('user_id');
        
        if (!userId) return;
        
        try {
            const response = await fetch(`${backendUrl}/api/check-session`, {
                headers: { 'X-User-ID': userId }
            });
            
            const data = await response.json();
            
            if (!response.ok || !data.valid) {
                console.warn('Session invalid, logging out...');
                await logout();
            }
        } catch (error) {
            console.error('Session validation error:', error);
        }
    }, 60000); // Check every minute
}

// Optionally start session validation
// Uncomment the line below if you want automatic session validation
// startSessionValidation();
