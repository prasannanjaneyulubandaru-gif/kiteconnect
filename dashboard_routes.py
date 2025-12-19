"""
Dashboard Module
Contains dashboard data endpoints for positions and orders with comprehensive P&L metrics
"""
from flask import Blueprint, request, jsonify
import datetime
from shared_utils import sessions, format_symbol

dashboard_bp = Blueprint('dashboard', __name__)


@dashboard_bp.route('/pnl-summary', methods=['GET', 'OPTIONS'])
def get_pnl_summary():
    """Get comprehensive P&L summary including opening balance, brokerage, charges, and ROI"""
    if request.method == 'OPTIONS':
        return '', 204
    
    try:
        user_id = request.headers.get('X-User-ID')
        if not user_id or user_id not in sessions:
            return jsonify({'success': False, 'error': 'Invalid session'}), 400
        
        kite = sessions[user_id]['kite']
        
        # Get all completed orders for brokerage calculation
        all_orders = kite.orders()
        clean_orders = []
        
        for order in all_orders:
            if order.get("status") == "COMPLETE":
                clean_orders.append({
                    "exchange": order.get("exchange"),
                    "tradingsymbol": order.get("tradingsymbol"),
                    "transaction_type": order.get("transaction_type"),
                    "order_type": order.get("order_type"),
                    "quantity": order.get("filled_quantity", 0),
                    "product": order.get("product"),
                    "price": order.get("average_price", 0)
                })
        
        # Calculate brokerage and charges
        total_brokerage = 0
        total_charges = 0
        
        if clean_orders:
            try:
                order_margins = kite.order_margins(clean_orders)
                total_brokerage = sum(
                    item.get("charges", {}).get("brokerage", 0) for item in order_margins
                )
                total_charges = sum(
                    item.get("charges", {}).get("total", 0) for item in order_margins
                )
            except Exception as e:
                print(f"Error calculating margins: {e}")
                # If margin calculation fails, continue with zero values
        
        other_charges = total_charges - total_brokerage
        
        # Get margins data
        margins = kite.margins()
        opening_balance = margins.get("equity", {}).get("available", {}).get("opening_balance", 0)
        gross_profit = margins.get("equity", {}).get("utilised", {}).get("m2m_realised", 0)
        unrealised_pnl = margins.get("equity", {}).get("utilised", {}).get("m2m_unrealised", 0)
        
        # Calculate net P&L
        net_pnl = gross_profit - total_charges
        
        # Calculate Day's ROI (Net P&L / Opening Balance) * 100
        days_roi = 0
        if opening_balance > 0:
            days_roi = (net_pnl / opening_balance) * 100
        
        return jsonify({
            'success': True,
            'opening_balance': opening_balance,
            'gross_profit': gross_profit,
            'unrealised_pnl': unrealised_pnl,
            'total_brokerage': total_brokerage,
            'other_charges': other_charges,
            'total_charges': total_charges,
            'net_pnl': net_pnl,
            'days_roi': days_roi
        })
        
    except Exception as e:
        print(f"P&L summary error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@dashboard_bp.route('/positions', methods=['GET', 'OPTIONS'])
def get_dashboard_positions():
    """Get detailed positions for dashboard with all relevant information"""
    if request.method == 'OPTIONS':
        return '', 204
    
    try:
        user_id = request.headers.get('X-User-ID')
        if not user_id or user_id not in sessions:
            return jsonify({'success': False, 'error': 'Invalid session'}), 400
        
        kite = sessions[user_id]['kite']
        positions_data = kite.positions()
        
        net_positions = []
        day_positions = []
        
        # Process NET positions (active)
        if 'net' in positions_data:
            for pos in positions_data['net']:
                if pos['quantity'] != 0:
                    net_positions.append({
                        'tradingsymbol': pos['tradingsymbol'],
                        'display_symbol': format_symbol(pos['tradingsymbol']),
                        'exchange': pos.get('exchange', ''),
                        'product': pos['product'],
                        'quantity': pos['quantity'],
                        'buy_quantity': pos.get('buy_quantity', 0),
                        'sell_quantity': pos.get('sell_quantity', 0),
                        'average_price': pos.get('average_price', 0),
                        'last_price': pos.get('last_price', 0),
                        'buy_price': pos.get('buy_price', 0),
                        'sell_price': pos.get('sell_price', 0),
                        'pnl': pos['pnl'],
                        'day_buy_quantity': pos.get('day_buy_quantity', 0),
                        'day_sell_quantity': pos.get('day_sell_quantity', 0),
                        'buy_value': pos.get('buy_value', 0),
                        'sell_value': pos.get('sell_value', 0)
                    })
        
        # Process DAY positions (closed today)
        if 'day' in positions_data:
            net_symbols = {p['tradingsymbol'] for p in positions_data.get('net', [])}
            for pos in positions_data['day']:
                if pos['tradingsymbol'] not in net_symbols and pos['quantity'] == 0:
                    day_positions.append({
                        'tradingsymbol': pos['tradingsymbol'],
                        'display_symbol': format_symbol(pos['tradingsymbol']),
                        'exchange': pos.get('exchange', ''),
                        'product': pos['product'],
                        'quantity': pos.get('day_buy_quantity', 0) + pos.get('day_sell_quantity', 0),
                        'buy_quantity': pos.get('buy_quantity', 0),
                        'sell_quantity': pos.get('sell_quantity', 0),
                        'average_price': pos.get('average_price', 0),
                        'last_price': pos.get('last_price', 0),
                        'pnl': pos['pnl'],
                        'buy_value': pos.get('buy_value', 0),
                        'sell_value': pos.get('sell_value', 0)
                    })
        
        return jsonify({
            'success': True,
            'net_positions': net_positions,
            'day_positions': day_positions
        })
        
    except Exception as e:
        print(f"Dashboard positions error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@dashboard_bp.route('/orders', methods=['GET', 'OPTIONS'])
def get_dashboard_orders():
    """Get orders for dashboard"""
    if request.method == 'OPTIONS':
        return '', 204
    
    try:
        user_id = request.headers.get('X-User-ID')
        if not user_id or user_id not in sessions:
            return jsonify({'success': False, 'error': 'Invalid session'}), 400
        
        kite = sessions[user_id]['kite']
        orders = kite.orders()
        
        if not orders or len(orders) == 0:
            return jsonify({
                'success': True,
                'orders': []
            })
        
        # Process orders
        processed_orders = []
        for order in orders:
            processed_order = {
                'display_symbol': format_symbol(order.get('tradingsymbol', '')),
                'product': order.get('product', ''),
                'variety': order.get('variety', ''),
                'trigger_price': order.get('trigger_price'),
                'price': order.get('price'),
                'order_timestamp': order.get('order_timestamp'),
                'status': order.get('status', ''),
                'transaction_type': order.get('transaction_type', ''),
                'quantity': order.get('quantity', 0),
                'filled_quantity': order.get('filled_quantity', 0),
                'pending_quantity': order.get('pending_quantity', 0),
                'average_price': order.get('average_price'),
                'order_type': order.get('order_type', ''),
                'order_id': order.get('order_id', '')
            }
            processed_orders.append(processed_order)
        
        # Sort by order_timestamp (descending)
        try:
            processed_orders.sort(
                key=lambda x: x.get('order_timestamp') or datetime.datetime.min, 
                reverse=True
            )
        except:
            pass
        
        # Convert datetime objects to strings
        for order in processed_orders:
            if order.get('order_timestamp'):
                try:
                    order['order_timestamp'] = str(order['order_timestamp'])
                except:
                    pass
        
        return jsonify({
            'success': True,
            'orders': processed_orders
        })
        
    except Exception as e:
        print(f"Dashboard orders error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
