"""
Position & Order Management Module
Contains all position management, order placement, and trailing stop loss logic
FIXED: Route paths to match frontend expectations
"""
from flask import Blueprint, request, jsonify
from kiteconnect import KiteTicker
import time
from shared_utils import (
    sessions, get_instruments, instruments_cache, round_to_tick_size,
    trailing_positions, trailing_logs, ticker_instances, ticker_connected
)

position_order_bp = Blueprint('position_order', __name__)


# ===========================================
# WEBSOCKET TICKER FUNCTIONS
# ===========================================

def setup_ticker_for_user(user_id, api_key, kite):
    """Setup WebSocket ticker for a user"""
    try:
        ticker = KiteTicker(api_key, kite.access_token)
        
        def on_ticks(ws, ticks):
            for tick in ticks:
                instrument_token = tick['instrument_token']
                last_price = tick['last_price']
                
                if user_id in trailing_positions:
                    positions_snapshot = list(trailing_positions[user_id].items())
                    for pos_key, details in positions_snapshot:
                        if details['instrument_token'] == instrument_token:
                            if user_id in trailing_positions and pos_key in trailing_positions[user_id]:
                                check_and_trail(user_id, pos_key, last_price, details, kite)
        
        def on_connect(ws, response):
            ticker_connected[user_id] = True
            print(f"WebSocket connected for user {user_id}")
        
        def on_close(ws, code, reason):
            ticker_connected[user_id] = False
            print(f"WebSocket closed for user {user_id}")
        
        def on_error(ws, code, reason):
            print(f"WebSocket error for user {user_id}: {reason}")
        
        ticker.on_ticks = on_ticks
        ticker.on_connect = on_connect
        ticker.on_close = on_close
        ticker.on_error = on_error
        
        ticker.connect(threaded=True)
        ticker_instances[user_id] = ticker
        time.sleep(1)
        
    except Exception as e:
        print(f"Error setting up ticker for user {user_id}: {e}")


def check_and_trail(user_id, position_key, current_price, details, kite):
    """Check and trail stop loss based on real-time price"""
    try:
        if user_id not in trailing_positions or position_key not in trailing_positions[user_id]:
            return
        
        if user_id not in trailing_logs:
            trailing_logs[user_id] = []
        
        details['current_price'] = current_price
        current_time = time.time()
        details['update_count'] += 1
        
        trigger_price = details['trigger_price']
        limit_price = details['limit_price']
        trail_points = details['trail_points']
        exit_type = details['exit_type']
        order_id = details['order_id']
        avg_price = details.get('avg_price', 0)
        symbol = details['symbol']
        exchange = details['exchange']
        
        trail_step = trail_points * 0.5

        # Calculate P&L
        if exit_type == 'SELL':
            pnl = current_price - avg_price
        else:
            pnl = avg_price - current_price
        
        details['pnl'] = pnl
        
        should_update = current_time - details['last_update'] >= 2
        
        if should_update:
            details['last_update'] = current_time
            
            should_trail = False
            new_trigger = trigger_price
            new_limit = limit_price
            
            if exit_type == 'SELL':
                # LONG position - trail UP when price moves UP
                distance = current_price - trigger_price
                if distance >= (trail_points + trail_step):
                    new_trigger = current_price - trail_points
                    new_trigger = round_to_tick_size(new_trigger)
                    
                    buffer_percent = details.get('buffer_percent', 0.05)
                    new_limit = new_trigger * (1 - buffer_percent)
                    new_limit = round_to_tick_size(new_limit)
                    should_trail = True
                    
                    log_msg = f"🔼 LONG Trail #{details['update_count']}: {exchange}:{symbol} | LTP=₹{current_price:.2f} | Old=₹{trigger_price:.2f} → New=₹{new_trigger:.2f} | P&L={pnl:+.2f}"
                    print(f"[{user_id}] {log_msg}")
                    trailing_logs[user_id].append({'time': current_time, 'msg': log_msg})
                
                # Check if SL hit
                if current_price <= trigger_price:
                    log_msg = f"⚠️ STOP LOSS HIT! {exchange}:{symbol} | Price=₹{current_price:.2f} <= Trigger=₹{trigger_price:.2f}"
                    print(f"[{user_id}] {log_msg}")
                    trailing_logs[user_id].append({'time': current_time, 'msg': log_msg})
                    if user_id in trailing_positions and position_key in trailing_positions[user_id]:
                        del trailing_positions[user_id][position_key]
                    return
            else:
                # SHORT position - trail DOWN when price moves DOWN
                distance = trigger_price - current_price
                if distance >= (trail_points + trail_step):
                    new_trigger = current_price + trail_points
                    new_trigger = round_to_tick_size(new_trigger)
                    
                    buffer_percent = details.get('buffer_percent', 0.05)
                    new_limit = new_trigger * (1 + buffer_percent)
                    new_limit = round_to_tick_size(new_limit)
                    should_trail = True
                    
                    log_msg = f"🔽 SHORT Trail #{details['update_count']}: {exchange}:{symbol} | LTP=₹{current_price:.2f} | Old=₹{trigger_price:.2f} → New=₹{new_trigger:.2f} | P&L={pnl:+.2f}"
                    print(f"[{user_id}] {log_msg}")
                    trailing_logs[user_id].append({'time': current_time, 'msg': log_msg})
                
                # Check if SL hit
                if current_price >= trigger_price:
                    log_msg = f"⚠️ STOP LOSS HIT! {exchange}:{symbol} | Price=₹{current_price:.2f} >= Trigger=₹{trigger_price:.2f}"
                    print(f"[{user_id}] {log_msg}")
                    trailing_logs[user_id].append({'time': current_time, 'msg': log_msg})
                    if user_id in trailing_positions and position_key in trailing_positions[user_id]:
                        del trailing_positions[user_id][position_key]
                    return
            
            # Trail the stop loss
            if should_trail:
                try:
                    new_order_id = kite.modify_order(
                        variety=details['variety'],
                        order_id=order_id,
                        quantity=details['quantity'],
                        order_type="SL",
                        trigger_price=new_trigger,
                        price=new_limit
                    )
                    
                    details['trigger_price'] = new_trigger
                    details['limit_price'] = new_limit
                    details['order_id'] = new_order_id
                    trailing_positions[user_id][position_key] = details
                    
                    log_msg = f"✅ Order Modified: {order_id} → {new_order_id} | New Trigger: ₹{new_trigger:.2f}, New Limit: ₹{new_limit:.2f}"
                    print(f"[{user_id}] {log_msg}")
                    trailing_logs[user_id].append({'time': current_time, 'msg': log_msg})
                    
                except Exception as e:
                    log_msg = f"❌ Failed to modify order: {e}"
                    print(f"[{user_id}] {log_msg}")
                    trailing_logs[user_id].append({'time': current_time, 'msg': log_msg})
            else:
                distance = abs(current_price - trigger_price)
                log_msg = f"[{details['update_count']}] {exchange}:{symbol} - LTP: ₹{current_price:.2f} | SL: ₹{trigger_price:.2f} | Dist: {distance:.2f} | P&L: {pnl:+.2f}"
                print(f"[{user_id}] {log_msg}")
                trailing_logs[user_id].append({'time': current_time, 'msg': log_msg})
        
        if len(trailing_logs[user_id]) > 100:
            trailing_logs[user_id] = trailing_logs[user_id][-100:]
        
    except Exception as e:
        error_msg = f"Error in check_and_trail: {e}"
        print(f"[{user_id}] {error_msg}")
        if user_id in trailing_logs:
            trailing_logs[user_id].append({'time': time.time(), 'msg': error_msg})


# ===========================================
# POSITION ROUTES
# ===========================================

@position_order_bp.route('/positions', methods=['GET'])
def get_positions():
    """Get current positions"""
    try:
        user_id = request.headers.get('X-User-ID')
        if not user_id or user_id not in sessions:
            return jsonify({'error': 'Invalid session'}), 401
        
        kite = sessions[user_id]['kite']
        positions = kite.positions()
        
        all_positions = []
        if positions.get('net'):
            all_positions.extend(positions['net'])
        if positions.get('day'):
            net_symbols = {(p['tradingsymbol'], p['product']) for p in positions.get('net', [])}
            for day_pos in positions['day']:
                if (day_pos['tradingsymbol'], day_pos['product']) not in net_symbols:
                    all_positions.append(day_pos)
        
        open_positions = [p for p in all_positions if p['quantity'] != 0]
        
        return jsonify({
            'success': True,
            'positions': open_positions
        })
        
    except Exception as e:
        return jsonify({'error': str(e), 'success': False}), 400


@position_order_bp.route('/positions/exit-all', methods=['POST', 'OPTIONS'])
def exit_all_positions():
    """Exit all open positions at market price"""
    if request.method == 'OPTIONS':
        return '', 204
    
    try:
        user_id = request.headers.get('X-User-ID')
        if not user_id or user_id not in sessions:
            return jsonify({'success': False, 'error': 'Invalid session'}), 401
        
        kite = sessions[user_id]['kite']
        positions_data = kite.positions()
        
        closed_positions = []
        failed_positions = []
        total_attempted = 0
        
        if 'net' in positions_data:
            for position in positions_data['net']:
                if position['quantity'] == 0:
                    continue
                
                total_attempted += 1
                
                try:
                    transaction_type = 'SELL' if position['quantity'] > 0 else 'BUY'
                    
                    order_id = kite.place_order(
                        variety='regular',
                        exchange=position['exchange'],
                        tradingsymbol=position['tradingsymbol'],
                        transaction_type=transaction_type,
                        quantity=abs(position['quantity']),
                        product=position['product'],
                        order_type='MARKET'
                    )
                    
                    closed_positions.append({
                        'tradingsymbol': position['tradingsymbol'],
                        'quantity': position['quantity'],
                        'pnl': position['pnl'],
                        'order_id': order_id
                    })
                    
                except Exception as e:
                    failed_positions.append({
                        'tradingsymbol': position['tradingsymbol'],
                        'quantity': position['quantity'],
                        'error': str(e)
                    })
        
        return jsonify({
            'success': True,
            'total_attempted': total_attempted,
            'closed_positions': closed_positions,
            'failed_positions': failed_positions
        })
        
    except Exception as e:
        print(f'Error exiting all positions: {e}')
        return jsonify({'success': False, 'error': str(e)}), 400


# FIXED: Changed route path from '/positions/start-auto-trail' to '/start-auto-trail'
@position_order_bp.route('/start-auto-trail', methods=['POST'])
def start_auto_trail():
    """Start automated trailing stop loss"""
    try:
        user_id = request.headers.get('X-User-ID')
        if not user_id or user_id not in sessions:
            return jsonify({'error': 'Invalid session'}), 401
        
        kite = sessions[user_id]['kite']
        api_key = sessions[user_id]['api_key']
        data = request.json
        
        tradingsymbol = data.get('tradingsymbol')
        exchange = data.get('exchange')
        quantity = int(data.get('quantity'))
        avg_price = float(data.get('average_price'))
        product = data.get('product', 'MIS')
        trail_points = float(data.get('trail_points'))
        buffer_percent = float(data.get('buffer_percent', 0.05))
        variety = 'regular'
        
        # Get instrument token
        instruments = get_instruments(user_id, exchange)
        instrument_token = None
        for inst in instruments:
            if inst['tradingsymbol'] == tradingsymbol:
                instrument_token = inst['instrument_token']
                break
        
        if not instrument_token:
            return jsonify({'error': f'Instrument token not found for {tradingsymbol}', 'success': False}), 400
        
        # Calculate trigger and limit prices
        isLong = quantity > 0
        trigger_price = avg_price - trail_points if isLong else avg_price + trail_points
        trigger_price = round_to_tick_size(trigger_price)
        
        if isLong:
            limit_price = trigger_price * (1 - buffer_percent)
        else:
            limit_price = trigger_price * (1 + buffer_percent)
        
        limit_price = round_to_tick_size(limit_price)
        
        transaction_type = 'SELL' if isLong else 'BUY'
        position_key = f"{exchange}:{tradingsymbol}"
        exit_type = 'SELL' if isLong else 'BUY'
        
        # Check for existing SL orders
        try:
            existing_orders = kite.orders()
            for order in existing_orders:
                if (order['status'] in ['OPEN', 'TRIGGER PENDING'] and
                    order['tradingsymbol'] == tradingsymbol and
                    order['exchange'] == exchange and
                    order['transaction_type'] == transaction_type and
                    order['order_type'] == 'SL' and
                    order['product'] == product and
                    order['quantity'] == abs(quantity) and
                    abs(float(order['trigger_price']) - trigger_price) < 0.1 and
                    abs(float(order['price']) - limit_price) < 0.1):
                    
                    return jsonify({
                        'error': f'Already trailing this position with order ID: {order["order_id"]}',
                        'success': False,
                        'existing_order_id': order['order_id']
                    }), 400
        except Exception as e:
            print(f"Warning: Could not check existing orders: {e}")
        
        # Place the SL order
        order_id = kite.place_order(
            variety=variety,
            exchange=exchange,
            tradingsymbol=tradingsymbol,
            transaction_type=transaction_type,
            quantity=abs(quantity),
            product=product,
            order_type='SL',
            trigger_price=trigger_price,
            price=limit_price
        )
        
        if user_id not in trailing_positions:
            trailing_positions[user_id] = {}
        
        if position_key in trailing_positions[user_id]:
            del trailing_positions[user_id][position_key]
        
        trailing_positions[user_id][position_key] = {
            'instrument_token': instrument_token,
            'order_id': order_id,
            'trigger_price': trigger_price,
            'limit_price': limit_price,
            'trail_points': trail_points,
            'buffer_percent': buffer_percent,
            'exit_type': exit_type,
            'quantity': abs(quantity),
            'product': product,
            'variety': variety,
            'symbol': tradingsymbol,
            'exchange': exchange,
            'avg_price': avg_price,
            'last_update': time.time(),
            'update_count': 0,
            'current_price': avg_price,
            'pnl': 0
        }
        
        if user_id not in ticker_instances or not ticker_connected.get(user_id, False):
            setup_ticker_for_user(user_id, api_key, kite)
        
        if user_id in ticker_instances and ticker_connected.get(user_id, False):
            ticker_instances[user_id].subscribe([instrument_token])
            ticker_instances[user_id].set_mode(ticker_instances[user_id].MODE_LTP, [instrument_token])
        
        return jsonify({
            'success': True,
            'message': 'Automated trailing started',
            'position_key': position_key,
            'order_id': order_id,
            'trigger_price': trigger_price,
            'limit_price': limit_price
        })
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e), 'success': False}), 400


# FIXED: Changed route path from '/positions/stop-auto-trail' to '/stop-auto-trail'
@position_order_bp.route('/stop-auto-trail', methods=['POST'])
def stop_auto_trail():
    """Stop automated trailing for a position"""
    try:
        user_id = request.headers.get('X-User-ID')
        data = request.json
        position_key = data.get('position_key')
        
        if user_id in trailing_positions and position_key in trailing_positions[user_id]:
            instrument_token = trailing_positions[user_id][position_key]['instrument_token']
            del trailing_positions[user_id][position_key]
            
            if user_id in ticker_instances and ticker_connected.get(user_id, False):
                try:
                    still_needed = False
                    if user_id in trailing_positions:
                        for pos in trailing_positions[user_id].values():
                            if pos['instrument_token'] == instrument_token:
                                still_needed = True
                                break
                    
                    if not still_needed:
                        ticker_instances[user_id].unsubscribe([instrument_token])
                        print(f"[{user_id}] Unsubscribed from instrument token: {instrument_token}")
                except Exception as e:
                    print(f"Error unsubscribing from ticker: {e}")
            
            if user_id not in trailing_logs:
                trailing_logs[user_id] = []
            trailing_logs[user_id].append({
                'time': time.time(),
                'msg': f'⏹️ Auto trailing stopped for {position_key}'
            })
            
            return jsonify({
                'success': True,
                'message': 'Automated trailing stopped'
            })
        else:
            return jsonify({
                'error': 'No active trailing for this position',
                'success': False
            }), 400
        
    except Exception as e:
        return jsonify({'error': str(e), 'success': False}), 400


# FIXED: Changed route path from '/positions/get-trail-status' to '/get-trail-status'
@position_order_bp.route('/get-trail-status', methods=['GET'])
def get_trail_status():
    """Get real-time status of all trailing positions"""
    try:
        user_id = request.headers.get('X-User-ID')
        
        if user_id not in trailing_positions:
            return jsonify({
                'success': True,
                'positions': [],
                'logs': [],
                'ticker_status': 'disconnected'
            })
        
        positions_list = []
        for pos_key, details in trailing_positions[user_id].items():
            positions_list.append({
                'position_key': pos_key,
                **details,
                'last_update': time.time() - details['last_update']
            })
        
        logs_list = trailing_logs.get(user_id, [])[-20:]
        ticker_status = 'connected' if ticker_connected.get(user_id, False) else 'disconnected'
        
        return jsonify({
            'success': True,
            'positions': positions_list,
            'logs': logs_list,
            'ticker_status': ticker_status
        })
        
    except Exception as e:
        return jsonify({'error': str(e), 'success': False}), 400


# FIXED: Changed route path from '/positions/get-instrument-token' to '/get-instrument-token'
@position_order_bp.route('/get-instrument-token', methods=['POST'])
def get_instrument_token():
    """Get instrument token for a trading symbol"""
    try:
        user_id = request.headers.get('X-User-ID')
        if not user_id or user_id not in sessions:
            return jsonify({'error': 'Invalid session'}), 401
        
        data = request.json
        exchange = data.get('exchange')
        tradingsymbol = data.get('tradingsymbol')
        
        if user_id in instruments_cache and exchange in instruments_cache[user_id]:
            for inst in instruments_cache[user_id][exchange]:
                if inst['tradingsymbol'] == tradingsymbol:
                    return jsonify({
                        'success': True,
                        'instrument_token': inst['instrument_token']
                    })
        
        kite = sessions[user_id]['kite']
        instruments = kite.instruments(exchange)
        
        for inst in instruments:
            if inst['tradingsymbol'] == tradingsymbol:
                return jsonify({
                    'success': True,
                    'instrument_token': inst['instrument_token']
                })
        
        return jsonify({'error': 'Instrument not found', 'success': False}), 404
        
    except Exception as e:
        return jsonify({'error': str(e), 'success': False}), 400


# ===========================================
# ORDER ROUTES
# ===========================================

@position_order_bp.route('/place-order', methods=['POST', 'OPTIONS'])
def place_order():
    """Place an order"""
    if request.method == 'OPTIONS':
        return '', 204
    
    try:
        user_id = request.headers.get('X-User-ID')
        if not user_id or user_id not in sessions:
            return jsonify({'success': False, 'error': 'Invalid session'}), 401
        
        kite = sessions[user_id]['kite']
        data = request.json
        
        order_params = {
            'variety': data.get('variety', 'regular'),
            'exchange': data.get('exchange'),
            'tradingsymbol': data.get('tradingsymbol'),
            'transaction_type': data.get('transaction_type'),
            'quantity': int(data.get('quantity')),
            'product': data.get('product'),
            'order_type': data.get('order_type')
        }
        
        if 'price' in data and data['price']:
            order_params['price'] = float(data['price'])
        
        if 'trigger_price' in data and data['trigger_price']:
            order_params['trigger_price'] = float(data['trigger_price'])
        
        order_id = kite.place_order(**order_params)
        
        return jsonify({'success': True, 'order_id': order_id})
    
    except Exception as e:
        print(f'Error placing order: {e}')
        return jsonify({'success': False, 'error': str(e)}), 400


@position_order_bp.route('/modify-order', methods=['POST', 'OPTIONS'])
def modify_order():
    """Modify an existing order"""
    if request.method == 'OPTIONS':
        return '', 204
    
    try:
        user_id = request.headers.get('X-User-ID')
        if not user_id or user_id not in sessions:
            return jsonify({'success': False, 'error': 'Invalid session'}), 401
        
        kite = sessions[user_id]['kite']
        data = request.json
        order_id = data.get('order_id')
        variety = data.get('variety', 'regular')
        
        modify_params = {
            'variety': variety,
            'order_id': order_id
        }
        
        if 'quantity' in data:
            modify_params['quantity'] = int(data['quantity'])
        if 'price' in data and data['price']:
            modify_params['price'] = float(data['price'])
        if 'trigger_price' in data and data['trigger_price']:
            modify_params['trigger_price'] = float(data['trigger_price'])
        if 'ordertype' in data:
            modify_params['order_type'] = data['ordertype']
        
        new_order_id = kite.modify_order(**modify_params)
        
        return jsonify({'success': True, 'order_id': new_order_id})
    
    except Exception as e:
        print(f'Error modifying order: {e}')
        return jsonify({'success': False, 'error': str(e)}), 400


@position_order_bp.route('/cancel-order', methods=['POST', 'OPTIONS'])
def cancel_order():
    """Cancel an order"""
    if request.method == 'OPTIONS':
        return '', 204
    
    try:
        user_id = request.headers.get('X-User-ID')
        if not user_id or user_id not in sessions:
            return jsonify({'success': False, 'error': 'Invalid session'}), 401
        
        kite = sessions[user_id]['kite']
        data = request.json
        order_id = data.get('order_id')
        variety = data.get('variety', 'regular')
        
        kite.cancel_order(variety=variety, order_id=order_id)
        
        return jsonify({
            'success': True,
            'message': 'Order cancelled successfully'
        })
    
    except Exception as e:
        print(f'Error cancelling order: {e}')
        return jsonify({'success': False, 'error': str(e)}), 400


@position_order_bp.route('/orders/cancel-all', methods=['POST', 'OPTIONS'])
def cancel_all_orders():
    """Cancel all pending orders"""
    if request.method == 'OPTIONS':
        return '', 204
    
    try:
        user_id = request.headers.get('X-User-ID')
        if not user_id or user_id not in sessions:
            return jsonify({'success': False, 'error': 'Invalid session'}), 401
        
        kite = sessions[user_id]['kite']
        orders = kite.orders()
        
        cancelled_orders = []
        failed_orders = []
        total_attempted = 0
        
        for order in orders:
            if order['status'] in ['OPEN', 'TRIGGER PENDING']:
                total_attempted += 1
                
                try:
                    kite.cancel_order(
                        variety=order['variety'],
                        order_id=order['order_id']
                    )
                    
                    cancelled_orders.append({
                        'order_id': order['order_id'],
                        'tradingsymbol': order['tradingsymbol'],
                        'quantity': order['quantity'],
                        'order_type': order['order_type']
                    })
                    
                except Exception as e:
                    failed_orders.append({
                        'order_id': order['order_id'],
                        'tradingsymbol': order['tradingsymbol'],
                        'error': str(e)
                    })
        
        return jsonify({
            'success': True,
            'total_attempted': total_attempted,
            'cancelled_orders': cancelled_orders,
            'failed_orders': failed_orders
        })
        
    except Exception as e:
        print(f'Error cancelling all orders: {e}')
        return jsonify({'success': False, 'error': str(e)}), 400
