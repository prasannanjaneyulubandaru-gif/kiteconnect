"""
Chart Monitor Module
Contains chart monitoring routes and related functions
"""
from flask import Blueprint, request, jsonify
from datetime import date, timedelta
import threading
import time
from shared_utils import (
    sessions, monitor_threads, monitor_stop_events, send_alert_email
)

chart_bp = Blueprint('chart', __name__)


# ===========================================
# CHART MONITORING FUNCTIONS
# ===========================================

def check_candle_strength(kite, instrument_token=256265, interval="15minute", 
                         lookback_days=2, threshold_percent=75):
    """Check last candle for strong trend"""
    try:
        to_date = date.today()
        from_date = to_date - timedelta(days=lookback_days)
        
        # Fetch historical data
        data = kite.historical_data(
            instrument_token=instrument_token,
            interval=interval,
            from_date=from_date,
            to_date=to_date,
            continuous=False
        )
        
        if not data or len(data) == 0:
            return {'error': 'No data received'}
        
        # Get last candle
        last_candle = data[-1]
        open_price = last_candle['open']
        close_price = last_candle['close']
        high_price = last_candle['high']
        low_price = last_candle['low']
        
        # Calculate body and range
        body_size = abs(close_price - open_price)
        candle_range = high_price - low_price
        
        if candle_range == 0:
            return {'error': 'Invalid candle range (zero)'}
        
        # Calculate body percentage
        body_percent = (body_size / candle_range) * 100
        
        # Determine trend direction
        is_bullish = close_price > open_price
        trend_direction = "Bullish" if is_bullish else "Bearish"
        
        alert_sent = False
        message = f"Body: {body_percent:.2f}% - Below threshold"
        
        # Check if threshold is met
        if body_percent >= threshold_percent:
            message = f"🚨 Strong {trend_direction} Trend Detected! Body: {body_percent:.2f}%"
            
            # Send email alert
            email_body = f"""Strong {trend_direction.upper()} Trend Detected!

Instrument Token: {instrument_token}
Interval: {interval}

Candle Details:
- Body Percentage: {body_percent:.2f}%
- Open: ₹{open_price:.2f}
- Close: ₹{close_price:.2f}
- High: ₹{high_price:.2f}
- Low: ₹{low_price:.2f}
- Body Size: ₹{body_size:.2f}
- Total Range: ₹{candle_range:.2f}

Trend: {trend_direction}
Timestamp: {last_candle.get('date', 'N/A')}

This alert was triggered because the candle body is {body_percent:.2f}% of the total candle range, which exceeds your threshold of {threshold_percent}%.
"""
            alert_sent = send_alert_email(
                subject=f"BVR Funds - Strong {trend_direction} Trend Alert",
                body=email_body
            )
        
        return {
            'body_percent': body_percent,
            'message': message,
            'alert_sent': alert_sent,
            'candle_data': {
                'open': open_price,
                'close': close_price,
                'high': high_price,
                'low': low_price
            },
            'trend': trend_direction
        }
        
    except Exception as e:
        print(f"Check candle error: {e}")
        return {'error': str(e)}


def monitor_loop(user_id, instrument_token, interval, threshold, frequency):
    """Background monitoring loop"""
    stop_event = monitor_stop_events.get(user_id)
    if not stop_event:
        print(f"No stop event found for {user_id}")
        return
    
    kite = sessions.get(user_id, {}).get('kite')
    if not kite:
        print(f"No kite instance found for {user_id}")
        return
    
    print(f"Monitor loop started for {user_id}")
    
    while not stop_event.is_set():
        try:
            result = check_candle_strength(kite, instrument_token, interval, 2, threshold)
            print(f"Monitor check for {user_id}: {result.get('message', 'No message')}")
        except Exception as e:
            print(f"Monitor error for {user_id}: {e}")
        
        # Sleep in small intervals to allow quick stop
        for _ in range(frequency):
            if stop_event.is_set():
                break
            time.sleep(1)
    
    print(f"Monitor loop stopped for {user_id}")


def stop_user_monitor(user_id, timeout=5):
    """Helper function to stop a user's monitor"""
    try:
        # Set stop event
        if user_id in monitor_stop_events:
            monitor_stop_events[user_id].set()
        
        # Wait for thread to stop (with timeout)
        if user_id in monitor_threads and monitor_threads[user_id].is_alive():
            monitor_threads[user_id].join(timeout=timeout)
        
        # Clean up
        if user_id in monitor_threads:
            del monitor_threads[user_id]
        if user_id in monitor_stop_events:
            del monitor_stop_events[user_id]
        
        return True
    except Exception as e:
        print(f"Error stopping monitor for {user_id}: {e}")
        return False


# ===========================================
# CHART MONITORING ROUTES
# ===========================================

@chart_bp.route('/check-candle', methods=['POST', 'OPTIONS'])
def check_candle():
    """Check candle strength once"""
    if request.method == 'OPTIONS':
        return '', 204
    
    try:
        user_id = request.headers.get('X-User-ID')
        if not user_id or user_id not in sessions:
            return jsonify({'success': False, 'error': 'Invalid session'}), 400
        
        kite = sessions[user_id]['kite']
        
        data = request.json
        instrument_token = data.get('instrument_token', 256265)
        interval = data.get('interval', '15minute')
        threshold = data.get('threshold', 75)
        
        result = check_candle_strength(kite, instrument_token, interval, 2, threshold)
        
        if 'error' in result:
            return jsonify({'success': False, 'error': result['error']}), 500
        
        return jsonify({
            'success': True,
            'result': result
        })
        
    except Exception as e:
        print(f"Check candle error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@chart_bp.route('/start-monitor', methods=['POST', 'OPTIONS'])
def start_monitor():
    """Start background monitoring"""
    if request.method == 'OPTIONS':
        return '', 204
    
    try:
        user_id = request.headers.get('X-User-ID')
        if not user_id or user_id not in sessions:
            return jsonify({'success': False, 'error': 'Invalid session'}), 400
        
        # If already running, stop it first
        if user_id in monitor_threads and monitor_threads[user_id].is_alive():
            print(f"Stopping existing monitor for {user_id} before starting new one")
            stop_user_monitor(user_id, timeout=3)
        
        data = request.json
        instrument_token = data.get('instrument_token', 256265)
        interval = data.get('interval', '15minute')
        threshold = data.get('threshold', 75)
        frequency = data.get('frequency', 300)  # seconds
        
        # Create stop event
        stop_event = threading.Event()
        monitor_stop_events[user_id] = stop_event
        
        # Start monitor thread
        thread = threading.Thread(
            target=monitor_loop,
            args=(user_id, instrument_token, interval, threshold, frequency),
            daemon=True
        )
        monitor_threads[user_id] = thread
        thread.start()
        
        print(f"Monitor started for {user_id}")
        
        return jsonify({
            'success': True,
            'message': 'Monitor started'
        })
        
    except Exception as e:
        print(f"Start monitor error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@chart_bp.route('/stop-monitor', methods=['POST', 'OPTIONS'])
def stop_monitor():
    """Stop background monitoring"""
    if request.method == 'OPTIONS':
        return '', 204
    
    try:
        user_id = request.headers.get('X-User-ID')
        if not user_id:
            return jsonify({'success': False, 'error': 'User ID required'}), 400
        
        # Check if monitor exists
        if user_id not in monitor_threads:
            return jsonify({'success': False, 'error': 'Monitor not running'}), 400
        
        # Stop the monitor
        success = stop_user_monitor(user_id)
        
        if success:
            print(f"Monitor stopped for {user_id}")
            return jsonify({
                'success': True,
                'message': 'Monitor stopped'
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to stop monitor'
            }), 500
        
    except Exception as e:
        print(f"Stop monitor error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@chart_bp.route('/monitor-status', methods=['GET', 'OPTIONS'])
def monitor_status():
    """Check if monitor is running"""
    if request.method == 'OPTIONS':
        return '', 204
    
    try:
        user_id = request.headers.get('X-User-ID')
        if not user_id:
            return jsonify({'success': False, 'error': 'User ID required'}), 400
        
        is_running = user_id in monitor_threads and monitor_threads[user_id].is_alive()
        
        return jsonify({
            'success': True,
            'running': is_running
        })
        
    except Exception as e:
        print(f"Monitor status error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@chart_bp.route('/test-email', methods=['POST', 'OPTIONS'])
def test_email():
    """Send test email"""
    if request.method == 'OPTIONS':
        return '', 204
    
    try:
        result = send_alert_email(
            subject="BVR Funds - Test Email",
            body="This is a test email from BVR Funds Chart Monitor.\n\nIf you received this, email alerts are working correctly!"
        )
        
        if result:
            return jsonify({
                'success': True,
                'message': 'Test email sent'
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to send email'
            }), 500
        
    except Exception as e:
        print(f"Test email error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
