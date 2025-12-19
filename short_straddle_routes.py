"""
Short Straddle Strategy Module
Automated strategy with ATM call/put selling and intelligent trailing stop loss
"""
from flask import Blueprint, request, jsonify
from datetime import datetime, timedelta
import time
from kiteconnect import KiteTicker
from shared_utils import (
    sessions, get_instruments, round_to_tick_size,
    trailing_positions, trailing_logs, ticker_instances, ticker_connected
)

short_straddle_bp = Blueprint('short_straddle', __name__)


# ===========================================
# STRADDLE STATE MANAGEMENT
# ===========================================

# Store active straddle strategies: {user_id: {straddle_id: {details}}}
active_straddles = {}
straddle_counter = 0


def get_atm_strike(nifty_price, base=50):
    """Get ATM strike (rounded to nearest 50)"""
    return round(nifty_price / base) * base


def find_option_instrument(instruments, strike, option_type, expiry_days_min=2):
    """Find option instrument by strike, type (CE/PE), and expiry"""
    today = datetime.now().date()
    target_expiry = today + timedelta(days=expiry_days_min)
    
    candidates = []
    
    for inst in instruments:
        if inst['name'] != 'NIFTY' or inst['instrument_type'] != option_type:
            continue
        
        if inst['strike'] != strike:
            continue
        
        expiry_date = inst['expiry']
        if isinstance(expiry_date, str):
            expiry_date = datetime.strptime(expiry_date, '%Y-%m-%d').date()
        
        if expiry_date >= target_expiry:
            candidates.append({
                'instrument_token': inst['instrument_token'],
                'tradingsymbol': inst['tradingsymbol'],
                'strike': inst['strike'],
                'expiry': expiry_date,
                'lot_size': inst['lot_size']
            })
    
    if not candidates:
        return None
    
    # Return nearest expiry
    candidates.sort(key=lambda x: x['expiry'])
    return candidates[0]


# ===========================================
# STRADDLE STRATEGY ROUTES
# ===========================================

@short_straddle_bp.route('/fetch-short-straddle', methods=['POST', 'OPTIONS'])
def fetch_short_straddle():
    """Fetch ATM call and put options for straddle"""
    if request.method == 'OPTIONS':
        return '', 204
    
    try:
        user_id = request.headers.get('X-User-ID')
        if not user_id or user_id not in sessions:
            return jsonify({'success': False, 'error': 'Invalid session'}), 401
        
        data = request.json
        skip_strikes = data.get('skip_strikes', 9)
        expiry_days = data.get('expiry_days', 2)
        
        kite = sessions[user_id]['kite']
        instruments = get_instruments(user_id, 'NFO')
        
        if not instruments:
            return jsonify({
                'success': False,
                'error': 'Failed to load instruments'
            }), 400
        
        # Get NIFTY 50 LTP
        nifty_ltp_data = kite.ltp(['NSE:NIFTY 50'])
        nifty_price = nifty_ltp_data['NSE:NIFTY 50']['last_price']
        
        # Get ATM strike
        atm_strike = get_atm_strike(nifty_price)
        hedge_strike_ce = atm_strike + (skip_strikes * 50)
        hedge_strike_pe = atm_strike - (skip_strikes * 50)
        
        # Find instruments
        atm_call = find_option_instrument(instruments, atm_strike, 'CE', expiry_days)
        atm_put = find_option_instrument(instruments, atm_strike, 'PE', expiry_days)
        hedge_call = find_option_instrument(instruments, hedge_strike_ce, 'CE', expiry_days)
        hedge_put = find_option_instrument(instruments, hedge_strike_pe, 'PE', expiry_days)
        
        if not all([atm_call, atm_put, hedge_call, hedge_put]):
            return jsonify({
                'success': False,
                'error': 'Could not find all required option contracts'
            }), 400
        
        # Get LTPs
        tokens = [
            f"NFO:{atm_call['tradingsymbol']}",
            f"NFO:{atm_put['tradingsymbol']}",
            f"NFO:{hedge_call['tradingsymbol']}",
            f"NFO:{hedge_put['tradingsymbol']}"
        ]
        
        ltp_data = kite.ltp(tokens)
        
        atm_call['last_price'] = ltp_data[f"NFO:{atm_call['tradingsymbol']}"]['last_price']
        atm_put['last_price'] = ltp_data[f"NFO:{atm_put['tradingsymbol']}"]['last_price']
        hedge_call['last_price'] = ltp_data[f"NFO:{hedge_call['tradingsymbol']}"]['last_price']
        hedge_put['last_price'] = ltp_data[f"NFO:{hedge_put['tradingsymbol']}"]['last_price']
        
        return jsonify({
            'success': True,
            'nifty_price': nifty_price,
            'atm_strike': atm_strike,
            'atm_call': {
                'symbol': atm_call['tradingsymbol'],
                'token': atm_call['instrument_token'],
                'strike': atm_call['strike'],
                'expiry': str(atm_call['expiry']),
                'last_price': atm_call['last_price'],
                'lot_size': atm_call['lot_size']
            },
            'atm_put': {
                'symbol': atm_put['tradingsymbol'],
                'token': atm_put['instrument_token'],
                'strike': atm_put['strike'],
                'expiry': str(atm_put['expiry']),
                'last_price': atm_put['last_price'],
                'lot_size': atm_put['lot_size']
            },
            'hedge_call': {
                'symbol': hedge_call['tradingsymbol'],
                'token': hedge_call['instrument_token'],
                'strike': hedge_call['strike'],
                'expiry': str(hedge_call['expiry']),
                'last_price': hedge_call['last_price'],
                'lot_size': hedge_call['lot_size']
            },
            'hedge_put': {
                'symbol': hedge_put['tradingsymbol'],
                'token': hedge_put['instrument_token'],
                'strike': hedge_put['strike'],
                'expiry': str(hedge_put['expiry']),
                'last_price': hedge_put['last_price'],
                'lot_size': hedge_put['lot_size']
            }
        })
        
    except Exception as e:
        print(f"Fetch straddle error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@short_straddle_bp.route('/deploy-straddle', methods=['POST', 'OPTIONS'])
def deploy_straddle():
    """Deploy short straddle with automatic trailing stop loss"""
    if request.method == 'OPTIONS':
        return '', 204
    
    try:
        global straddle_counter
        
        user_id = request.headers.get('X-User-ID')
        if not user_id or user_id not in sessions:
            return jsonify({'success': False, 'error': 'Invalid session'}), 401
        
        data = request.json
        orders = data.get('orders', [])
        initial_sl_percent = data.get('initial_sl_percent', 25)
        trail_points = data.get('trail_points', 6)
        step_size = data.get('step_size', 0.5)
        
        if not orders or len(orders) != 4:
            return jsonify({
                'success': False,
                'error': 'Expected 4 orders (ATM CE, ATM PE, Hedge CE, Hedge PE)'
            }), 400
        
        kite = sessions[user_id]['kite']
        
        # Get instruments for lot size lookup
        instruments = kite.instruments('NFO')
        inst_dict = {inst['tradingsymbol']: inst for inst in instruments}
        
        # Place all orders and track them with immediate status check
        order_results = []
        placed_orders = {}  # Track all placed orders by label
        
        for order in orders:
            try:
                tradingsymbol = order.get('tradingsymbol') or order.get('symbol')  # Support both field names
                if not tradingsymbol:
                    raise ValueError('Missing tradingsymbol or symbol field')
                
                lot_size = inst_dict.get(tradingsymbol, {}).get('lot_size', 25)  # Default NIFTY lot size
                
                order_id = kite.place_order(
                    variety='regular',
                    exchange='NFO',
                    tradingsymbol=tradingsymbol,
                    transaction_type=order['transaction_type'],
                    quantity=order['quantity'],
                    product=order['product'],
                    order_type='MARKET'
                )
                
                # Immediately get order status using order_history
                try:
                    order_history = kite.order_history(order_id)
                    latest_status = order_history[-1] if order_history else None
                    
                    if latest_status:
                        order_results.append({
                            'success': True,
                            'symbol': tradingsymbol,
                            'transaction_type': order['transaction_type'],
                            'order_id': order_id,
                            'label': order.get('label', ''),
                            'status': latest_status.get('status'),
                            'status_message': latest_status.get('status_message', ''),
                            'average_price': latest_status.get('average_price', 0),
                            'filled_quantity': latest_status.get('filled_quantity', 0),
                            'pending_quantity': latest_status.get('pending_quantity', 0)
                        })
                        
                        # Track all orders by their label with full status
                        label = order.get('label', '')
                        placed_orders[label] = {
                            'order_id': order_id,
                            'symbol': tradingsymbol,
                            'token': order['token'],
                            'quantity': order['quantity'],
                            'product': order['product'],
                            'transaction_type': order['transaction_type'],
                            'status': latest_status.get('status'),
                            'average_price': latest_status.get('average_price', 0)
                        }
                    else:
                        order_results.append({
                            'success': True,
                            'symbol': tradingsymbol,
                            'transaction_type': order['transaction_type'],
                            'order_id': order_id,
                            'label': order.get('label', ''),
                            'status': 'PENDING'
                        })
                        
                        placed_orders[order.get('label', '')] = {
                            'order_id': order_id,
                            'symbol': tradingsymbol,
                            'token': order['token'],
                            'quantity': order['quantity'],
                            'product': order['product'],
                            'transaction_type': order['transaction_type'],
                            'status': 'PENDING',
                            'average_price': 0
                        }
                        
                except Exception as status_error:
                    print(f"Error getting order status for {order_id}: {status_error}")
                    order_results.append({
                        'success': True,
                        'symbol': tradingsymbol,
                        'transaction_type': order['transaction_type'],
                        'order_id': order_id,
                        'label': order.get('label', ''),
                        'status': 'UNKNOWN'
                    })
                    
                    placed_orders[order.get('label', '')] = {
                        'order_id': order_id,
                        'symbol': tradingsymbol,
                        'token': order['token'],
                        'quantity': order['quantity'],
                        'product': order['product'],
                        'transaction_type': order['transaction_type'],
                        'status': 'UNKNOWN',
                        'average_price': 0
                    }
                
            except Exception as e:
                symbol_name = order.get('tradingsymbol') or order.get('symbol', 'Unknown')
                print(f"Error placing order {symbol_name}: {e}")
                order_results.append({
                    'success': False,
                    'symbol': symbol_name,
                    'error': str(e),
                    'label': order.get('label', '')
                })
        
        # Check status for ATM orders
        atm_call_order = placed_orders.get('ATM CE (Sell)')
        atm_put_order = placed_orders.get('ATM PE (Sell)')
        
        atm_call_avg_price = None
        atm_put_avg_price = None
        atm_call_status = 'NOT_PLACED' if not atm_call_order else atm_call_order.get('status', 'UNKNOWN')
        atm_put_status = 'NOT_PLACED' if not atm_put_order else atm_put_order.get('status', 'UNKNOWN')
        
        # Get average prices if orders are complete
        if atm_call_order and atm_call_order.get('status') == 'COMPLETE':
            atm_call_avg_price = atm_call_order.get('average_price')
        if atm_put_order and atm_put_order.get('status') == 'COMPLETE':
            atm_put_avg_price = atm_put_order.get('average_price')
        
        # Build detailed status for all orders
        order_status_details = []
        for label, order_info in placed_orders.items():
            order_status_details.append({
                'label': label,
                'symbol': order_info['symbol'],
                'status': order_info.get('status', 'UNKNOWN'),
                'order_id': order_info['order_id'],
                'average_price': order_info.get('average_price', 0),
                'filled_quantity': order_info.get('quantity', 0) if order_info.get('status') == 'COMPLETE' else 0,
                'pending_quantity': order_info.get('quantity', 0) if order_info.get('status') != 'COMPLETE' else 0,
                'status_message': order_info.get('status_message', '')
            })
        
        # Check if orders are complete
        if atm_call_avg_price is None or atm_put_avg_price is None:
            # Orders not completed - check if market is closed or orders pending
            market_closed_statuses = ['TRIGGER PENDING', 'OPEN', 'AMO REQ RECEIVED', 'TRIGGER PENDING']
            
            # Log for debugging
            print(f"ATM CE Status: {atm_call_status}, ATM PE Status: {atm_put_status}")
            print(f"Order status details: {order_status_details}")
            
            if atm_call_status in market_closed_statuses or atm_put_status in market_closed_statuses:
                return jsonify({
                    'success': True,
                    'orders_placed': True,
                    'orders_completed': False,
                    'market_status': 'closed',
                    'message': 'Orders placed successfully as AMO (After Market Orders). They will be executed when market opens.',
                    'order_results': order_results,
                    'order_status_details': order_status_details,
                    'note': 'Automated trailing stop loss will be activated once orders are executed and average prices are available.',
                    'debug_info': {
                        'ce_status': atm_call_status,
                        'pe_status': atm_put_status,
                        'placed_orders_count': len(placed_orders),
                        'fetched_orders_count': len(all_orders)
                    }
                })
            elif atm_call_status == 'NOT_PLACED' or atm_put_status == 'NOT_PLACED':
                # Orders were not placed at all
                return jsonify({
                    'success': False,
                    'orders_placed': False,
                    'orders_completed': False,
                    'error': 'Some orders were not placed successfully',
                    'order_results': order_results,
                    'order_status_details': order_status_details,
                    'note': 'Please check the order results above for details.',
                    'debug_info': {
                        'ce_status': atm_call_status,
                        'pe_status': atm_put_status
                    }
                }), 400
            else:
                # Orders failed or rejected
                return jsonify({
                    'success': False,
                    'orders_placed': True,
                    'orders_completed': False,
                    'error': f'Orders placed but not completed. CE Status: {atm_call_status}, PE Status: {atm_put_status}',
                    'order_results': order_results,
                    'order_status_details': order_status_details,
                    'note': 'Please check order status in your trading terminal. Automated trailing will not start until orders are completed.',
                    'debug_info': {
                        'ce_status': atm_call_status,
                        'pe_status': atm_put_status,
                        'all_order_statuses': [detail.get('status') for detail in order_status_details]
                    }
                }), 400
        
        # Orders completed successfully - proceed with trailing SL setup
        # Initialize straddle state
        straddle_counter += 1
        straddle_id = f"straddle_{user_id}_{straddle_counter}"
        
        if user_id not in active_straddles:
            active_straddles[user_id] = {}
        
        active_straddles[user_id][straddle_id] = {
            'straddle_id': straddle_id,
            'atm_call': atm_call_order,
            'atm_put': atm_put_order,
            'atm_call_avg_price': atm_call_avg_price,
            'atm_put_avg_price': atm_put_avg_price,
            'initial_sl_percent': initial_sl_percent,
            'trail_points': trail_points,
            'step_size': step_size,
            'ce_sl_hit': False,
            'pe_sl_hit': False,
            'status': 'active',
            'created_at': time.time()
        }
        
        # Start automated trailing stop loss
        start_straddle_trailing(user_id, straddle_id)
        
        return jsonify({
            'success': True,
            'orders_placed': True,
            'orders_completed': True,
            'straddle_id': straddle_id,
            'order_results': order_results,
            'order_status_details': order_status_details,
            'atm_call_avg_price': atm_call_avg_price,
            'atm_put_avg_price': atm_put_avg_price,
            'message': 'Straddle deployed successfully with automated trailing SL'
        })
        
    except Exception as e:
        print(f"Deploy straddle error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


def start_straddle_trailing(user_id, straddle_id):
    """Start automated trailing stop loss for straddle"""
    try:
        if user_id not in sessions:
            return
        
        kite = sessions[user_id]['kite']
        api_key = sessions[user_id]['api_key']
        
        straddle = active_straddles[user_id][straddle_id]
        
        # Calculate initial stop loss prices
        initial_sl_percent = straddle['initial_sl_percent'] / 100
        
        ce_initial_sl = straddle['atm_call_avg_price'] * (1 + initial_sl_percent)
        pe_initial_sl = straddle['atm_put_avg_price'] * (1 + initial_sl_percent)
        
        ce_initial_sl = round_to_tick_size(ce_initial_sl)
        pe_initial_sl = round_to_tick_size(pe_initial_sl)
        
        # Place initial SL orders
        ce_sl_order_id = kite.place_order(
            variety='regular',
            exchange='NFO',
            tradingsymbol=straddle['atm_call']['symbol'],
            transaction_type='BUY',
            quantity=straddle['atm_call']['quantity'],
            product=straddle['atm_call']['product'],
            order_type='SL',
            trigger_price=ce_initial_sl,
            price=ce_initial_sl * 1.005  # 0.5% buffer
        )
        
        pe_sl_order_id = kite.place_order(
            variety='regular',
            exchange='NFO',
            tradingsymbol=straddle['atm_put']['symbol'],
            transaction_type='BUY',
            quantity=straddle['atm_put']['quantity'],
            product=straddle['atm_put']['product'],
            order_type='SL',
            trigger_price=pe_initial_sl,
            price=pe_initial_sl * 1.005  # 0.5% buffer
        )
        
        # Update straddle state with SL order IDs
        straddle['ce_sl_order_id'] = ce_sl_order_id
        straddle['pe_sl_order_id'] = pe_sl_order_id
        straddle['ce_current_sl'] = ce_initial_sl
        straddle['pe_current_sl'] = pe_initial_sl
        
        # Setup WebSocket for real-time monitoring
        if user_id not in ticker_instances:
            setup_straddle_ticker(user_id, api_key, kite)
        
        # Subscribe to tokens
        ticker = ticker_instances.get(user_id)
        if ticker:
            tokens = [
                int(straddle['atm_call']['token']),
                int(straddle['atm_put']['token'])
            ]
            ticker.subscribe(tokens)
            ticker.set_mode(ticker.MODE_LTP, tokens)
        
        # Initialize trailing logs
        if user_id not in trailing_logs:
            trailing_logs[user_id] = []
        
        log_msg = f"🎯 Straddle {straddle_id} deployed | CE SL: ₹{ce_initial_sl:.2f} | PE SL: ₹{pe_initial_sl:.2f}"
        print(f"[{user_id}] {log_msg}")
        trailing_logs[user_id].append({'time': time.time(), 'msg': log_msg})
        
    except Exception as e:
        error_msg = f"Error starting straddle trailing: {e}"
        print(f"[{user_id}] {error_msg}")
        if user_id in trailing_logs:
            trailing_logs[user_id].append({'time': time.time(), 'msg': error_msg})


def setup_straddle_ticker(user_id, api_key, kite):
    """Setup WebSocket ticker for straddle monitoring"""
    try:
        ticker = KiteTicker(api_key, kite.access_token)
        
        def on_ticks(ws, ticks):
            for tick in ticks:
                instrument_token = tick['instrument_token']
                last_price = tick['last_price']
                
                if user_id in active_straddles:
                    for straddle_id, straddle in list(active_straddles[user_id].items()):
                        if straddle['status'] != 'active':
                            continue
                        
                        # Check if tick is for CE or PE
                        if int(straddle['atm_call']['token']) == instrument_token:
                            check_and_trail_straddle(user_id, straddle_id, last_price, 'CE', kite)
                        elif int(straddle['atm_put']['token']) == instrument_token:
                            check_and_trail_straddle(user_id, straddle_id, last_price, 'PE', kite)
        
        def on_connect(ws, response):
            ticker_connected[user_id] = True
            print(f"Straddle WebSocket connected for user {user_id}")
        
        def on_close(ws, code, reason):
            ticker_connected[user_id] = False
            print(f"Straddle WebSocket closed for user {user_id}")
        
        def on_error(ws, code, reason):
            print(f"Straddle WebSocket error for user {user_id}: {reason}")
        
        ticker.on_ticks = on_ticks
        ticker.on_connect = on_connect
        ticker.on_close = on_close
        ticker.on_error = on_error
        
        ticker.connect(threaded=True)
        ticker_instances[user_id] = ticker
        time.sleep(1)
        
    except Exception as e:
        print(f"Error setting up straddle ticker for user {user_id}: {e}")


def check_and_trail_straddle(user_id, straddle_id, current_price, option_type, kite):
    """Check and trail stop loss for straddle position"""
    try:
        if user_id not in active_straddles or straddle_id not in active_straddles[user_id]:
            return
        
        straddle = active_straddles[user_id][straddle_id]
        
        if straddle['status'] != 'active':
            return
        
        current_time = time.time()
        
        if user_id not in trailing_logs:
            trailing_logs[user_id] = []
        
        # Check which leg we're monitoring
        if option_type == 'CE':
            avg_price = straddle['atm_call_avg_price']
            current_sl = straddle['ce_current_sl']
            sl_order_id = straddle['ce_sl_order_id']
            symbol = straddle['atm_call']['symbol']
            sl_hit_key = 'ce_sl_hit'
            other_sl_hit_key = 'pe_sl_hit'
            other_avg_price = straddle['atm_put_avg_price']
            other_sl_order_id = straddle['pe_sl_order_id']
            other_symbol = straddle['atm_put']['symbol']
            other_quantity = straddle['atm_put']['quantity']
            other_product = straddle['atm_put']['product']
        else:  # PE
            avg_price = straddle['atm_put_avg_price']
            current_sl = straddle['pe_current_sl']
            sl_order_id = straddle['pe_sl_order_id']
            symbol = straddle['atm_put']['symbol']
            sl_hit_key = 'pe_sl_hit'
            other_sl_hit_key = 'ce_sl_hit'
            other_avg_price = straddle['atm_call_avg_price']
            other_sl_order_id = straddle['ce_sl_order_id']
            other_symbol = straddle['atm_call']['symbol']
            other_quantity = straddle['atm_call']['quantity']
            other_product = straddle['atm_call']['product']
        
        # Check if SL hit
        if current_price >= current_sl:
            log_msg = f"⚠️ {option_type} SL HIT! {symbol} | Price=₹{current_price:.2f} >= SL=₹{current_sl:.2f}"
            print(f"[{user_id}] {log_msg}")
            trailing_logs[user_id].append({'time': current_time, 'msg': log_msg})
            
            straddle[sl_hit_key] = True
            
            # Check if other leg already hit
            if straddle[other_sl_hit_key]:
                # Both legs hit - close straddle
                straddle['status'] = 'completed'
                log_msg = f"✅ Straddle {straddle_id} completed - both legs hit SL"
                print(f"[{user_id}] {log_msg}")
                trailing_logs[user_id].append({'time': current_time, 'msg': log_msg})
                return
            
            # First leg hit - revise other leg SL to its buy price and start trailing
            try:
                # Cancel current SL order for other leg
                kite.cancel_order(variety='regular', order_id=other_sl_order_id)
                
                # Place new SL at buy price
                new_sl_trigger = round_to_tick_size(other_avg_price)
                new_sl_limit = round_to_tick_size(other_avg_price * 1.005)
                
                new_sl_order_id = kite.place_order(
                    variety='regular',
                    exchange='NFO',
                    tradingsymbol=other_symbol,
                    transaction_type='BUY',
                    quantity=other_quantity,
                    product=other_product,
                    order_type='SL',
                    trigger_price=new_sl_trigger,
                    price=new_sl_limit
                )
                
                # Update straddle state
                if option_type == 'CE':
                    straddle['pe_sl_order_id'] = new_sl_order_id
                    straddle['pe_current_sl'] = new_sl_trigger
                    straddle['pe_trailing_mode'] = True
                else:
                    straddle['ce_sl_order_id'] = new_sl_order_id
                    straddle['ce_current_sl'] = new_sl_trigger
                    straddle['ce_trailing_mode'] = True
                
                log_msg = f"📌 Revised {'PE' if option_type == 'CE' else 'CE'} SL to buy price: ₹{new_sl_trigger:.2f} | Starting trailing mode"
                print(f"[{user_id}] {log_msg}")
                trailing_logs[user_id].append({'time': current_time, 'msg': log_msg})
                
            except Exception as e:
                log_msg = f"❌ Failed to revise other leg SL: {e}"
                print(f"[{user_id}] {log_msg}")
                trailing_logs[user_id].append({'time': current_time, 'msg': log_msg})
            
            return
        
        # Trail the stop loss if in trailing mode
        trailing_mode_key = f"{option_type.lower()}_trailing_mode"
        
        if straddle.get(trailing_mode_key, False):
            trail_points = straddle['trail_points']
            step_size = straddle['step_size']
            
            # For sold options, trail DOWN as price moves DOWN (we want to lock profits)
            distance = current_sl - current_price
            
            if distance >= (trail_points + (trail_points * step_size)):
                new_sl = current_price + (trail_points * step_size)
                new_sl = round_to_tick_size(new_sl)
                
                if new_sl < current_sl:  # Only trail down
                    try:
                        new_limit = round_to_tick_size(new_sl * 1.005)
                        
                        new_sl_order_id = kite.modify_order(
                            variety='regular',
                            order_id=sl_order_id,
                            quantity=straddle['atm_call']['quantity'] if option_type == 'CE' else straddle['atm_put']['quantity'],
                            order_type='SL',
                            trigger_price=new_sl,
                            price=new_limit
                        )
                        
                        # Update state
                        if option_type == 'CE':
                            straddle['ce_current_sl'] = new_sl
                            straddle['ce_sl_order_id'] = new_sl_order_id
                        else:
                            straddle['pe_current_sl'] = new_sl
                            straddle['pe_sl_order_id'] = new_sl_order_id
                        
                        log_msg = f"🔽 {option_type} Trailed | {symbol} | LTP=₹{current_price:.2f} | Old SL=₹{current_sl:.2f} → New SL=₹{new_sl:.2f}"
                        print(f"[{user_id}] {log_msg}")
                        trailing_logs[user_id].append({'time': current_time, 'msg': log_msg})
                        
                    except Exception as e:
                        log_msg = f"❌ Failed to trail {option_type} SL: {e}"
                        print(f"[{user_id}] {log_msg}")
                        trailing_logs[user_id].append({'time': current_time, 'msg': log_msg})
        
        # Limit log size
        if len(trailing_logs[user_id]) > 100:
            trailing_logs[user_id] = trailing_logs[user_id][-100:]
        
    except Exception as e:
        error_msg = f"Error in check_and_trail_straddle: {e}"
        print(f"[{user_id}] {error_msg}")
        if user_id in trailing_logs:
            trailing_logs[user_id].append({'time': time.time(), 'msg': error_msg})


@short_straddle_bp.route('/straddle-status', methods=['GET'])
def get_straddle_status():
    """Get status of active straddles"""
    try:
        user_id = request.headers.get('X-User-ID')
        if not user_id:
            return jsonify({'success': False, 'error': 'User ID required'}), 400
        
        straddles = active_straddles.get(user_id, {})
        
        # Get trailing logs
        logs = []
        if user_id in trailing_logs:
            logs = [
                {
                    'time': log['time'],
                    'timestamp': time.strftime('%H:%M:%S', time.localtime(log['time'])),
                    'message': log['msg']
                }
                for log in trailing_logs[user_id][-50:]  # Last 50 logs
            ]
        
        return jsonify({
            'success': True,
            'active_straddles': list(straddles.values()),
            'logs': logs
        })
        
    except Exception as e:
        print(f"Straddle status error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@short_straddle_bp.route('/stop-straddle', methods=['POST'])
def stop_straddle():
    """Stop monitoring a straddle"""
    try:
        user_id = request.headers.get('X-User-ID')
        if not user_id:
            return jsonify({'success': False, 'error': 'User ID required'}), 400
        
        data = request.json
        straddle_id = data.get('straddle_id')
        
        if user_id in active_straddles and straddle_id in active_straddles[user_id]:
            active_straddles[user_id][straddle_id]['status'] = 'stopped'
            
            return jsonify({
                'success': True,
                'message': f'Straddle {straddle_id} stopped'
            })
        
        return jsonify({
            'success': False,
            'error': 'Straddle not found'
        }), 404
        
    except Exception as e:
        print(f"Stop straddle error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
