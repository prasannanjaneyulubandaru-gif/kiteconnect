"""
Authentication Module
Contains authentication routes and related functions
"""
from flask import Blueprint, request, jsonify
from kiteconnect import KiteConnect
import threading
from shared_utils import (
    sessions, load_instruments_for_user, 
    monitor_threads, monitor_stop_events
)

auth_bp = Blueprint('auth', __name__)


# ===========================================
# HELPER FUNCTIONS
# ===========================================

def cleanup_user_monitor(user_id):
    """Clean up monitor for a user"""
    try:
        # Stop monitor if running
        if user_id in monitor_stop_events:
            monitor_stop_events[user_id].set()
        
        if user_id in monitor_threads and monitor_threads[user_id].is_alive():
            monitor_threads[user_id].join(timeout=3)
        
        # Clean up monitor resources
        if user_id in monitor_threads:
            del monitor_threads[user_id]
        if user_id in monitor_stop_events:
            del monitor_stop_events[user_id]
        
        print(f"Cleaned up monitor for {user_id}")
        return True
    except Exception as e:
        print(f"Error cleaning up monitor for {user_id}: {e}")
        return False


# ===========================================
# AUTHENTICATION ROUTES
# ===========================================

@auth_bp.route('/generate-session', methods=['POST', 'OPTIONS'])
def generate_session():
    """Generate session using request token"""
    if request.method == 'OPTIONS':
        return '', 204
    
    try:
        data = request.json
        api_key = data.get('api_key')
        api_secret = data.get('api_secret')
        request_token = data.get('request_token')
        
        if not all([api_key, api_secret, request_token]):
            return jsonify({'success': False, 'error': 'Missing parameters'}), 400
        
        # Initialize KiteConnect
        kite = KiteConnect(api_key=api_key)
        
        # Generate session
        session_data = kite.generate_session(request_token, api_secret=api_secret)
        access_token = session_data['access_token']
        user_id = session_data['user_id']
        
        # Set access token
        kite.set_access_token(access_token)
        
        # Clean up any existing session and monitors for this user
        if user_id in sessions:
            print(f"Cleaning up existing session for {user_id}")
            cleanup_user_monitor(user_id)
        
        # Store new session
        sessions[user_id] = {
            'kite': kite,
            'access_token': access_token,
            'api_key': api_key
        }
        
        # Load instruments in background
        thread = threading.Thread(target=load_instruments_for_user, args=(user_id,))
        thread.daemon = True
        thread.start()
        
        print(f"Session created for {user_id}")
        
        return jsonify({
            'success': True,
            'access_token': access_token,
            'user_id': user_id
        })
        
    except Exception as e:
        print(f"Session generation error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@auth_bp.route('/profile', methods=['GET', 'OPTIONS'])
def get_profile():
    """Get user profile"""
    if request.method == 'OPTIONS':
        return '', 204
    
    try:
        user_id = request.headers.get('X-User-ID')
        if not user_id:
            return jsonify({'success': False, 'error': 'User ID required'}), 400
        
        if user_id not in sessions:
            return jsonify({'success': False, 'error': 'Session not found'}), 404
        
        kite = sessions[user_id]['kite']
        
        # Fetch profile
        profile = kite.profile()
        
        return jsonify({
            'success': True,
            'profile': {
                'user_id': profile['user_id'],
                'user_name': profile['user_name'],
                'email': profile['email'],
                'user_type': profile.get('user_type', 'individual'),
                'broker': profile.get('broker', 'Zerodha'),
                'products': profile.get('products', [])
            }
        })
        
    except Exception as e:
        print(f"Profile fetch error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@auth_bp.route('/logout', methods=['POST', 'OPTIONS'])
def logout():
    """Logout and cleanup user session"""
    if request.method == 'OPTIONS':
        return '', 204
    
    try:
        user_id = request.headers.get('X-User-ID')
        if not user_id:
            return jsonify({'success': False, 'error': 'User ID required'}), 400
        
        print(f"Logging out user: {user_id}")
        
        # Clean up monitor
        cleanup_user_monitor(user_id)
        
        # Clean up session
        if user_id in sessions:
            del sessions[user_id]
            print(f"Session deleted for {user_id}")
        
        return jsonify({
            'success': True,
            'message': 'Logged out successfully'
        })
        
    except Exception as e:
        print(f"Logout error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@auth_bp.route('/check-session', methods=['GET', 'OPTIONS'])
def check_session():
    """Check if user session is valid"""
    if request.method == 'OPTIONS':
        return '', 204
    
    try:
        user_id = request.headers.get('X-User-ID')
        if not user_id:
            return jsonify({'success': False, 'error': 'User ID required'}), 400
        
        is_valid = user_id in sessions
        
        return jsonify({
            'success': True,
            'valid': is_valid
        })
        
    except Exception as e:
        print(f"Check session error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
