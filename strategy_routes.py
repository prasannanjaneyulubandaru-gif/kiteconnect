"""
Trading Strategies Module  
Contains all trading strategy routes and algorithms
"""
from flask import Blueprint, request, jsonify
import datetime
from shared_utils import sessions, get_instruments

strategy_bp = Blueprint('strategy', __name__)


# ===========================================
# STRATEGY ALGORITHMS
# ===========================================

def bullish_future_spread(kite, instruments, lower_premium=40, upper_premium=60, days=1):
    """Bullish Future Spread Strategy"""
    print("Calculating Bull put spread...")
    
    nifty_fut_list = [
        inst for inst in instruments
        if inst.get('instrument_type') == 'FUT'
        and inst.get('tradingsymbol', '').startswith("NIFTY")
        and inst.get('name') == 'NIFTY'
        and inst.get('expiry') is not None
    ]

    if not nifty_fut_list:
        return None, None

    # Pick nearest FUT
    nifty_fut_list = sorted(nifty_fut_list, key=lambda x: x['expiry'])
    selected_future = nifty_fut_list[0]

    # Fetch LTP
    fut_key = f"{selected_future['exchange']}:{selected_future['tradingsymbol']}"
    future_ltp_data = kite.ltp([fut_key])
    future_price = future_ltp_data[fut_key]['last_price']
    future_symbol = selected_future['tradingsymbol']
    future_token = selected_future['instrument_token']
    
    print(f"Selected FUT: {future_symbol} at ₹{future_price}")

    # PUT HEDGE SELECTION
    today = datetime.date.today()
    min_expiry = today + datetime.timedelta(days=days)

    nifty_pe_list = [
        inst for inst in instruments
        if inst.get('instrument_type') == 'PE'
        and inst.get('tradingsymbol', '').startswith("NIFTY")
        and inst.get('name') == 'NIFTY'
        and inst.get('expiry') is not None
        and inst.get('expiry') > min_expiry
    ]

    if not nifty_pe_list:
        return (future_symbol, future_token), None

    candidate_puts = nifty_pe_list[:200]
    pe_keys = [f"{opt['exchange']}:{opt['tradingsymbol']}" for opt in candidate_puts]
    pe_ltp_data = kite.ltp(pe_keys)

    put_symbol = None
    put_token = None

    for opt in candidate_puts:
        key = f"{opt['exchange']}:{opt['tradingsymbol']}"
        price = pe_ltp_data[key]['last_price']
        if lower_premium < price < upper_premium:
            put_symbol = opt['tradingsymbol']
            put_token = opt['instrument_token']
            print(f"Selected PUT hedge: {put_symbol} at ₹{price}")
            break

    if put_symbol is None:
        return (future_symbol, future_token), None

    return (future_symbol, future_token), (put_symbol, put_token)


def bearish_future_spread(kite, instruments, lower_premium=40, upper_premium=60, days=1):
    """Bearish Future Spread Strategy"""
    print("Calculating Bear call spread...")
    
    nifty_fut_list = [
        inst for inst in instruments
        if inst.get('instrument_type') == 'FUT'
        and inst.get('tradingsymbol', '').startswith("NIFTY")
        and inst.get('name') == 'NIFTY'
        and inst.get('expiry') is not None
    ]

    if not nifty_fut_list:
        return None, None

    nifty_fut_list = sorted(nifty_fut_list, key=lambda x: x['expiry'])
    selected_future = nifty_fut_list[0]

    fut_key = f"{selected_future['exchange']}:{selected_future['tradingsymbol']}"
    future_ltp_data = kite.ltp([fut_key])
    future_price = future_ltp_data[fut_key]['last_price']
    future_symbol = selected_future['tradingsymbol']
    future_token = selected_future['instrument_token']
    
    print(f"Selected FUT: {future_symbol} at ₹{future_price}")

    # CALL HEDGE SELECTION
    today = datetime.date.today()
    min_expiry = today + datetime.timedelta(days=days)

    nifty_ce_list = [
        inst for inst in instruments
        if inst.get('instrument_type') == 'CE'
        and inst.get('tradingsymbol', '').startswith("NIFTY")
        and inst.get('name') == 'NIFTY'
        and inst.get('expiry') is not None
        and inst.get('expiry') > min_expiry
    ]

    if not nifty_ce_list:
        return (future_symbol, future_token), None

    candidate_calls = nifty_ce_list[:200]
    ce_keys = [f"{opt['exchange']}:{opt['tradingsymbol']}" for opt in candidate_calls]
    ce_ltp_data = kite.ltp(ce_keys)

    call_symbol = None
    call_token = None

    for opt in candidate_calls:
        key = f"{opt['exchange']}:{opt['tradingsymbol']}"
        price = ce_ltp_data[key]['last_price']
        if lower_premium < price < upper_premium:
            call_symbol = opt['tradingsymbol']
            call_token = opt['instrument_token']
            print(f"Selected CALL hedge: {call_symbol} at ₹{price}")
            break

    if call_symbol is None:
        return (future_symbol, future_token), None

    return (future_symbol, future_token), (call_symbol, call_token)


def put_option_spread(kite, instruments, skip_strikes=5, expiry=1):
    """Put Option Spread Strategy"""
    print("Calculating put option spread...")
    
    # GET NIFTY INDEX PRICE
    nifty_index = None
    for inst in instruments:
        if (inst.get('segment') == 'INDICES'
                and inst.get('exchange') == 'NSE'
                and inst.get('tradingsymbol') == 'NIFTY 50'):
            nifty_index = inst
            break

    if not nifty_index:
        return None, None

    index_key = f"{nifty_index['exchange']}:{nifty_index['tradingsymbol']}"
    index_ltp_data = kite.ltp([index_key])
    spot_price = index_ltp_data[index_key]['last_price']
    print(f"NIFTY 50: ₹{spot_price}")

    # ATM PUT SELECTION
    today = datetime.date.today()
    min_expiry = today + datetime.timedelta(days=expiry)

    nifty_pe_list = [
        inst for inst in instruments
        if inst.get('instrument_type') == 'PE'
        and inst.get('tradingsymbol', '').startswith("NIFTY")
        and inst.get('name') == 'NIFTY'
        and inst.get('expiry') is not None
        and inst.get('expiry') > min_expiry
    ]

    if not nifty_pe_list:
        return None, None

    strike_interval = 50
    put_atm_strike = round(spot_price / strike_interval) * strike_interval
    put_hedge_strike = put_atm_strike - (skip_strikes * strike_interval)

    atm_put = None
    for inst in nifty_pe_list:
        if inst.get('strike') == put_atm_strike:
            atm_put = inst
            break

    if not atm_put:
        return None, None

    atm_key = f"{atm_put['exchange']}:{atm_put['tradingsymbol']}"
    atm_ltp_data = kite.ltp([atm_key])
    put_atm_price = atm_ltp_data[atm_key]['last_price']
    put_atm_symbol = atm_put['tradingsymbol']
    put_atm_token = atm_put['instrument_token']

    # HEDGE PUT SELECTION
    put_hedge = None
    for inst in nifty_pe_list:
        if inst.get('strike') == put_hedge_strike:
            put_hedge = inst
            break

    if not put_hedge:
        return None, None

    hedge_key = f"{put_hedge['exchange']}:{put_hedge['tradingsymbol']}"
    hedge_ltp_data = kite.ltp([hedge_key])
    put_hedge_price = hedge_ltp_data[hedge_key]['last_price']
    put_hedge_symbol = put_hedge['tradingsymbol']
    put_hedge_token = put_hedge['instrument_token']

    print(f"ATM PUT: {put_atm_symbol} at ₹{put_atm_price}")
    print(f"Hedge PUT: {put_hedge_symbol} at ₹{put_hedge_price}")

    return (put_atm_symbol, put_atm_token), (put_hedge_symbol, put_hedge_token)


def call_option_spread(kite, instruments, skip_strikes=5, expiry=1):
    """Call Option Spread Strategy"""
    print("Calculating call option spread...")
    
    # GET NIFTY INDEX PRICE
    nifty_index = None
    for inst in instruments:
        if (inst.get('segment') == 'INDICES' 
            and inst.get('exchange') == 'NSE' 
            and inst.get('tradingsymbol') == 'NIFTY 50'):
            nifty_index = inst
            break
    
    if not nifty_index:
        return None, None
    
    index_key = f"{nifty_index['exchange']}:{nifty_index['tradingsymbol']}"
    index_ltp_data = kite.ltp([index_key])
    spot_price = index_ltp_data[index_key]['last_price']
    print(f"NIFTY 50: ₹{spot_price}")
    
    # ATM CALL SELECTION
    today = datetime.date.today()
    min_expiry = today + datetime.timedelta(days=expiry)
    
    nifty_ce_list = [
        inst for inst in instruments
        if inst.get('instrument_type') == 'CE'
        and inst.get('tradingsymbol', '').startswith("NIFTY")
        and inst.get('name') == 'NIFTY'
        and inst.get('expiry') is not None
        and inst.get('expiry') > min_expiry
    ]
    
    if not nifty_ce_list:
        return None, None
    
    strike_interval = 50
    call_atm_strike = round(spot_price / strike_interval) * strike_interval
    call_hedge_strike = (skip_strikes * strike_interval) + call_atm_strike
    
    atm_call = None
    for inst in nifty_ce_list:
        if inst.get('strike') == call_atm_strike:
            atm_call = inst
            break
    
    if not atm_call:
        return None, None
    
    atm_key = f"{atm_call['exchange']}:{atm_call['tradingsymbol']}"
    atm_ltp_data = kite.ltp([atm_key])
    call_atm_price = atm_ltp_data[atm_key]['last_price']
    call_atm_symbol = atm_call['tradingsymbol']
    call_atm_token = atm_call['instrument_token']
    
    # HEDGE CALL SELECTION
    hedge_call = None
    for inst in nifty_ce_list:
        if inst.get('strike') == call_hedge_strike:
            hedge_call = inst
            break
    
    if not hedge_call:
        return None, None

    hedge_key = f"{hedge_call['exchange']}:{hedge_call['tradingsymbol']}"
    hedge_ltp_data = kite.ltp([hedge_key])
    call_hedge_price = hedge_ltp_data[hedge_key]['last_price']
    call_hedge_symbol = hedge_call['tradingsymbol']
    call_hedge_token = hedge_call['instrument_token']
    
    print(f"ATM CALL: {call_atm_symbol} at ₹{call_atm_price}")
    print(f"Hedge CALL: {call_hedge_symbol} at ₹{call_hedge_price}")
    
    return (call_atm_symbol, call_atm_token), (call_hedge_symbol, call_hedge_token)


# ===========================================
# STRATEGY ROUTES
# ===========================================

@strategy_bp.route('/bullish-future-spread', methods=['POST', 'OPTIONS'])
def get_bullish_future_spread():
    """Get bullish future spread strategy"""
    if request.method == 'OPTIONS':
        return '', 204
    
    try:
        user_id = request.headers.get('X-User-ID')
        if not user_id or user_id not in sessions:
            return jsonify({'success': False, 'error': 'Invalid session'}), 401
        
        kite = sessions[user_id]['kite']
        data = request.json or {}
        lower_premium = float(data.get('lower_premium', 40))
        upper_premium = float(data.get('upper_premium', 60))
        days = int(data.get('days', 1))
        
        instruments = get_instruments(user_id, 'NFO')
        result = bullish_future_spread(kite, instruments, lower_premium, upper_premium, days)
        
        if not result or result[0] is None:
            return jsonify({'success': False, 'error': 'No suitable instruments found'}), 404
        
        future_data, put_data = result
        
        if not future_data or not future_data[0]:
            return jsonify({'success': False, 'error': 'Future data incomplete'}), 404
        
        # Fetch current prices
        future_price = 0
        hedge_price = 0
        
        try:
            fut_key = f"NFO:{future_data[0]}"
            fut_ltp = kite.ltp([fut_key])
            future_price = fut_ltp[fut_key]['last_price']
        except Exception as e:
            print(f"Error fetching future price: {e}")
        
        if put_data and put_data[0]:
            try:
                put_key = f"NFO:{put_data[0]}"
                put_ltp = kite.ltp([put_key])
                hedge_price = put_ltp[put_key]['last_price']
            except Exception as e:
                print(f"Error fetching hedge price: {e}")
        
        return jsonify({
            'success': True,
            'strategy': 'Bullish Future Spread',
            'future': {
                'symbol': future_data[0],
                'token': future_data[1],
                'last_price': future_price
            },
            'hedge': {
                'symbol': put_data[0] if put_data else None,
                'token': put_data[1] if put_data else None,
                'last_price': hedge_price
            } if put_data else None
        })
        
    except Exception as e:
        print(f"Bullish future spread error: {e}")
        return jsonify({'error': str(e), 'success': False}), 400


@strategy_bp.route('/bearish-future-spread', methods=['POST', 'OPTIONS'])
def get_bearish_future_spread():
    """Get bearish future spread strategy"""
    if request.method == 'OPTIONS':
        return '', 204
    
    try:
        user_id = request.headers.get('X-User-ID')
        if not user_id or user_id not in sessions:
            return jsonify({'success': False, 'error': 'Invalid session'}), 401
        
        kite = sessions[user_id]['kite']
        data = request.json or {}
        lower_premium = float(data.get('lower_premium', 40))
        upper_premium = float(data.get('upper_premium', 60))
        days = int(data.get('days', 1))
        
        instruments = get_instruments(user_id, 'NFO')
        result = bearish_future_spread(kite, instruments, lower_premium, upper_premium, days)
        
        if not result or result[0] is None:
            return jsonify({'success': False, 'error': 'No suitable instruments found'}), 404
        
        future_data, call_data = result
        
        if not future_data or not future_data[0]:
            return jsonify({'success': False, 'error': 'Future data incomplete'}), 404
        
        # Fetch current prices
        future_price = 0
        hedge_price = 0
        
        try:
            fut_key = f"NFO:{future_data[0]}"
            fut_ltp = kite.ltp([fut_key])
            future_price = fut_ltp[fut_key]['last_price']
        except Exception as e:
            print(f"Error fetching future price: {e}")
        
        if call_data and call_data[0]:
            try:
                call_key = f"NFO:{call_data[0]}"
                call_ltp = kite.ltp([call_key])
                hedge_price = call_ltp[call_key]['last_price']
            except Exception as e:
                print(f"Error fetching hedge price: {e}")
        
        return jsonify({
            'success': True,
            'strategy': 'Bearish Future Spread',
            'future': {
                'symbol': future_data[0],
                'token': future_data[1],
                'last_price': future_price
            },
            'hedge': {
                'symbol': call_data[0] if call_data else None,
                'token': call_data[1] if call_data else None,
                'last_price': hedge_price
            } if call_data else None
        })
        
    except Exception as e:
        print(f"Bearish future spread error: {e}")
        return jsonify({'error': str(e), 'success': False}), 400


@strategy_bp.route('/put-option-spread', methods=['POST', 'OPTIONS'])
def get_put_option_spread():
    """Get put option spread strategy"""
    if request.method == 'OPTIONS':
        return '', 204
    
    try:
        user_id = request.headers.get('X-User-ID')
        if not user_id or user_id not in sessions:
            return jsonify({'success': False, 'error': 'Invalid session'}), 401
        
        kite = sessions[user_id]['kite']
        data = request.json or {}
        skip_strikes = int(data.get('skip_strikes', 5))
        expiry = int(data.get('expiry', 1))
        
        nse_instruments = get_instruments(user_id, 'NSE')
        nfo_instruments = get_instruments(user_id, 'NFO')
        all_instruments = nse_instruments + nfo_instruments
        
        result = put_option_spread(kite, all_instruments, skip_strikes, expiry)
        
        if result[0] is None:
            return jsonify({'success': False, 'error': 'No suitable instruments found'}), 404
        
        atm_data, hedge_data = result
        
        # Fetch current prices
        atm_price = 0
        hedge_price = 0
        
        if atm_data:
            try:
                atm_key = f"NFO:{atm_data[0]}"
                atm_ltp = kite.ltp([atm_key])
                atm_price = atm_ltp[atm_key]['last_price']
            except:
                pass
        
        if hedge_data:
            try:
                hedge_key = f"NFO:{hedge_data[0]}"
                hedge_ltp = kite.ltp([hedge_key])
                hedge_price = hedge_ltp[hedge_key]['last_price']
            except:
                pass
        
        return jsonify({
            'success': True,
            'strategy': 'Put Option Spread',
            'atm': {
                'symbol': atm_data[0],
                'token': atm_data[1],
                'last_price': atm_price
            } if atm_data else None,
            'hedge': {
                'symbol': hedge_data[0],
                'token': hedge_data[1],
                'last_price': hedge_price
            } if hedge_data else None
        })
        
    except Exception as e:
        print(f"Put option spread error: {e}")
        return jsonify({'error': str(e), 'success': False}), 400


@strategy_bp.route('/call-option-spread', methods=['POST', 'OPTIONS'])
def get_call_option_spread():
    """Get call option spread strategy"""
    if request.method == 'OPTIONS':
        return '', 204
    
    try:
        user_id = request.headers.get('X-User-ID')
        if not user_id or user_id not in sessions:
            return jsonify({'success': False, 'error': 'Invalid session'}), 401
        
        kite = sessions[user_id]['kite']
        data = request.json or {}
        skip_strikes = int(data.get('skip_strikes', 5))
        expiry = int(data.get('expiry', 1))
        
        nse_instruments = get_instruments(user_id, 'NSE')
        nfo_instruments = get_instruments(user_id, 'NFO')
        all_instruments = nse_instruments + nfo_instruments
        
        result = call_option_spread(kite, all_instruments, skip_strikes, expiry)
        
        if result[0] is None:
            return jsonify({'success': False, 'error': 'No suitable instruments found'}), 404
        
        atm_data, hedge_data = result
        
        # Fetch current prices
        atm_price = 0
        hedge_price = 0
        
        if atm_data:
            try:
                atm_key = f"NFO:{atm_data[0]}"
                atm_ltp = kite.ltp([atm_key])
                atm_price = atm_ltp[atm_key]['last_price']
            except:
                pass
        
        if hedge_data:
            try:
                hedge_key = f"NFO:{hedge_data[0]}"
                hedge_ltp = kite.ltp([hedge_key])
                hedge_price = hedge_ltp[hedge_key]['last_price']
            except:
                pass
        
        return jsonify({
            'success': True,
            'strategy': 'Call Option Spread',
            'atm': {
                'symbol': atm_data[0],
                'token': atm_data[1],
                'last_price': atm_price
            } if atm_data else None,
            'hedge': {
                'symbol': hedge_data[0],
                'token': hedge_data[1],
                'last_price': hedge_price
            } if hedge_data else None
        })
        
    except Exception as e:
        print(f"Call option spread error: {e}")
        return jsonify({'error': str(e), 'success': False}), 400


@strategy_bp.route('/check-basket-margin', methods=['POST', 'OPTIONS'])
def check_strategy_basket_margin():
    """Check margin for strategy basket"""
    if request.method == 'OPTIONS':
        return '', 204
    
    try:
        user_id = request.headers.get('X-User-ID')
        if not user_id or user_id not in sessions:
            return jsonify({'success': False, 'error': 'Invalid session'}), 401
        
        kite = sessions[user_id]['kite']
        data = request.json
        orders = data.get('orders', [])
        
        if not orders:
            return jsonify({'success': False, 'error': 'No orders provided'}), 400
        
        instruments = kite.instruments('NFO')
        inst_dict = {inst['tradingsymbol']: inst for inst in instruments}
        
        margin_orders = []
        for order in orders:
            lot_size = inst_dict.get(order['tradingsymbol'], {}).get('lot_size', 1)
            actual_quantity = order['lots'] * lot_size
            
            margin_order = {
                'exchange': order['exchange'],
                'tradingsymbol': order['tradingsymbol'],
                'transaction_type': order['transaction_type'],
                'quantity': actual_quantity,
                'product': order['product'],
                'order_type': order['order_type']
            }
            
            if 'price' in order and order['price']:
                margin_order['price'] = order['price']
            if 'trigger_price' in order and order['trigger_price']:
                margin_order['trigger_price'] = order['trigger_price']
            
            margin_orders.append(margin_order)
        
        margins = kite.margins()
        available_balance = margins['equity']['net']
        
        margin_info = kite.basket_order_margins(margin_orders, consider_positions=True, mode="compact")
        total_required = sum(order.get('total', 0) for order in margin_info.get('orders', []))
        
        return jsonify({
            'success': True,
            'available_balance': available_balance,
            'total_required': total_required,
            'sufficient': total_required <= available_balance,
            'margin_details': margin_info
        })
        
    except Exception as e:
        print(f"Margin check error: {e}")
        return jsonify({'error': str(e), 'success': False}), 400


@strategy_bp.route('/deploy-basket', methods=['POST', 'OPTIONS'])
def deploy_strategy_basket():
    """Deploy strategy basket"""
    if request.method == 'OPTIONS':
        return '', 204
    
    try:
        user_id = request.headers.get('X-User-ID')
        if not user_id or user_id not in sessions:
            return jsonify({'success': False, 'error': 'Invalid session'}), 401
        
        kite = sessions[user_id]['kite']
        data = request.json
        orders = data.get('orders', [])
        
        if not orders:
            return jsonify({'success': False, 'error': 'No orders provided'}), 400
        
        instruments = kite.instruments('NFO')
        inst_dict = {inst['tradingsymbol']: inst for inst in instruments}
        
        results = []
        
        for order in orders:
            try:
                lot_size = inst_dict.get(order['tradingsymbol'], {}).get('lot_size', 1)
                actual_quantity = order['lots'] * lot_size
                
                order_params = {
                    'variety': order.get('variety', 'regular'),
                    'exchange': order['exchange'],
                    'tradingsymbol': order['tradingsymbol'],
                    'transaction_type': order['transaction_type'],
                    'quantity': actual_quantity,
                    'product': order['product'],
                    'order_type': order['order_type']
                }
                
                if 'price' in order and order['price']:
                    order_params['price'] = order['price']
                if 'trigger_price' in order and order['trigger_price']:
                    order_params['trigger_price'] = order['trigger_price']
                
                order_id = kite.place_order(**order_params)
                
                try:
                    order_status = kite.order_history(order_id)
                    latest_status = order_status[-1] if order_status else None
                    
                    if latest_status:
                        result = {
                            'success': True,
                            'order_id': order_id,
                            'symbol': order['tradingsymbol'],
                            'lots': order['lots'],
                            'quantity': actual_quantity,
                            'lot_size': lot_size,
                            'status': latest_status.get('status'),
                            'status_message': latest_status.get('status_message', ''),
                            'average_price': latest_status.get('average_price', 0),
                            'filled_quantity': latest_status.get('filled_quantity', 0)
                        }
                    else:
                        result = {
                            'success': True,
                            'order_id': order_id,
                            'symbol': order['tradingsymbol'],
                            'lots': order['lots'],
                            'quantity': actual_quantity,
                            'status': 'PENDING'
                        }
                except:
                    result = {
                        'success': True,
                        'order_id': order_id,
                        'symbol': order['tradingsymbol'],
                        'status': 'UNKNOWN'
                    }
                
                results.append(result)
                
            except Exception as e:
                results.append({
                    'success': False,
                    'error': str(e),
                    'symbol': order.get('tradingsymbol', 'Unknown'),
                    'status': 'FAILED'
                })
        
        return jsonify({
            'success': True,
            'results': results,
            'total_orders': len(results),
            'successful': len([r for r in results if r['success']]),
            'failed': len([r for r in results if not r['success']])
        })
        
    except Exception as e:
        print(f"Deploy basket error: {e}")
        return jsonify({'error': str(e), 'success': False}), 400
