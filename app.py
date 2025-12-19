"""
BVR Funds Trading Platform - Main Application
Modular Flask application for algorithmic trading with Zerodha Kite Connect
"""
from flask import Flask, jsonify
from flask_cors import CORS
import os
from config import config

# Import all blueprints
from auth_routes import auth_bp
from chart_routes import chart_bp
from strategy_routes import strategy_bp
from position_order_routes import position_order_bp
from dashboard_routes import dashboard_bp
from short_straddle_routes import short_straddle_bp


def create_app(config_name='default'):
    """Application factory"""
    app = Flask(__name__)
    
    # Load configuration
    app.config.from_object(config[config_name])
    
    # Enable CORS
    CORS(app, resources={
        r"/*": {
            "origins": "*",
            "methods": ["GET", "POST", "OPTIONS"],
            "allow_headers": ["Content-Type", "X-User-ID"]
        }
    })
    
    # Register blueprints
    app.register_blueprint(auth_bp, url_prefix='/api')
    app.register_blueprint(chart_bp, url_prefix='/api')
    app.register_blueprint(strategy_bp, url_prefix='/api/strategy')
    app.register_blueprint(position_order_bp, url_prefix='/api')
    app.register_blueprint(dashboard_bp, url_prefix='/api/dashboard')
    app.register_blueprint(short_straddle_bp, url_prefix='/api/straddle')
    
    # Health check endpoints
    @app.route('/health', methods=['GET'])
    def health():
        """Health check"""
        return jsonify({'status': 'ok', 'service': 'BVR Funds API'})

    @app.route('/', methods=['GET'])
    def index():
        """API documentation"""
        return jsonify({
            'service': 'BVR Funds Trading API',
            'version': '2.0',
            'status': 'running',
            'description': 'Modular algorithmic trading platform with Zerodha Kite Connect',
            'endpoints': {
                'authentication': [
                    'POST /api/generate-session',
                    'GET /api/profile'
                ],
                'chart_monitor': [
                    'POST /api/check-candle',
                    'POST /api/start-monitor',
                    'POST /api/stop-monitor',
                    'GET /api/monitor-status',
                    'POST /api/test-email'
                ],
                'strategies': [
                    'POST /api/strategy/bullish-future-spread',
                    'POST /api/strategy/bearish-future-spread',
                    'POST /api/strategy/put-option-spread',
                    'POST /api/strategy/call-option-spread',
                    'POST /api/strategy/check-basket-margin',
                    'POST /api/strategy/deploy-basket'
                ],
                'straddle': [
                    'POST /api/straddle/fetch-short-straddle',
                    'POST /api/straddle/deploy-straddle',
                    'GET /api/straddle/straddle-status',
                    'POST /api/straddle/stop-straddle'
                ],
                'positions': [
                    'GET /api/positions',
                    'POST /api/positions/exit-all',
                    'POST /api/positions/start-auto-trail',
                    'POST /api/positions/stop-auto-trail',
                    'GET /api/positions/get-trail-status',
                    'POST /api/positions/get-instrument-token'
                ],
                'orders': [
                    'POST /api/orders/place-order',
                    'POST /api/orders/cancel-all'
                ],
                'dashboard': [
                    'GET /api/dashboard/positions',
                    'GET /api/dashboard/orders'
                ]
            }
        })
    
    return app


# Create app instance
app = create_app(os.environ.get('FLASK_ENV', 'default'))


if __name__ == '__main__':
    # Get port from environment or use default
    port = int(os.environ.get('PORT', 5000))
    
    print("="*60)
    print("🚀 BVR Funds Trading Platform")
    print("="*60)
    print(f"📊 Environment: {os.environ.get('FLASK_ENV', 'development')}")
    print(f"🌐 Server: http://localhost:{port}")
    print(f"📚 API Docs: http://localhost:{port}/")
    print(f"💚 Health: http://localhost:{port}/health")
    print("="*60)
    
    app.run(
        host='0.0.0.0',
        port=port,
        debug=app.config['DEBUG']
    )
