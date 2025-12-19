"""
Shared Utilities and State Management
All helper functions and global state in one place
"""
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from config import Config

# ===========================================
# GLOBAL STATE (In production, use Redis/Database)
# ===========================================

# Store active sessions
sessions = {}

# Instruments cache
instruments_cache = {}

# Monitor state
monitor_threads = {}
monitor_stop_events = {}

# Position management state
trailing_positions = {}      # {user_id: {position_key: {details}}}
trailing_logs = {}           # {user_id: [log entries]}
ticker_instances = {}        # {user_id: KiteTicker instance}
ticker_connected = {}        # {user_id: bool}


# ===========================================
# HELPER FUNCTIONS
# ===========================================

def round_to_tick_size(price, tick_size=0.05):
    """Round price to nearest tick size"""
    return round(price / tick_size) * tick_size


def get_kite(user_id):
    """Get KiteConnect instance for user"""
    if user_id not in sessions:
        return None
    return sessions[user_id]['kite']


def load_instruments_for_user(user_id):
    """Load and cache instruments for NSE and NFO exchanges"""
    try:
        if user_id not in sessions:
            return False
        
        kite = sessions[user_id]['kite']
        
        # Initialize cache for user
        instruments_cache[user_id] = {'NSE': [], 'NFO': []}
        
        # Load NSE instruments
        print(f"Loading NSE instruments for {user_id}...")
        nse_instruments = kite.instruments('NSE')
        instruments_cache[user_id]['NSE'] = nse_instruments
        
        # Load NFO instruments
        print(f"Loading NFO instruments for {user_id}...")
        nfo_instruments = kite.instruments('NFO')
        instruments_cache[user_id]['NFO'] = nfo_instruments
        
        print(f"Loaded {len(instruments_cache[user_id]['NSE'])} NSE and {len(instruments_cache[user_id]['NFO'])} NFO instruments")
        return True
        
    except Exception as e:
        print(f"Error loading instruments: {e}")
        return False


def get_instruments(user_id, exchange='NFO'):
    """Get cached instruments or fetch if not cached"""
    if user_id not in instruments_cache:
        load_instruments_for_user(user_id)
    
    if user_id in instruments_cache and exchange in instruments_cache[user_id]:
        return instruments_cache[user_id][exchange]
    
    # Fallback: fetch directly
    if user_id in sessions:
        kite = sessions[user_id]['kite']
        return kite.instruments(exchange)
    
    return []


def send_alert_email(subject="Strong Trend Alert", body="Strong Trend Alert"):
    """Send email alert"""
    try:
        msg = MIMEMultipart()
        msg['From'] = Config.EMAIL_SENDER
        msg['To'] = Config.EMAIL_RECEIVER
        msg['Subject'] = subject
        msg.attach(MIMEText(body, 'plain'))
        
        server = smtplib.SMTP(Config.EMAIL_SMTP_SERVER, Config.EMAIL_SMTP_PORT)
        server.starttls()
        server.login(Config.EMAIL_SENDER, Config.EMAIL_PASSWORD)
        server.sendmail(Config.EMAIL_SENDER, Config.EMAIL_RECEIVER, msg.as_string())
        server.quit()
        print(f"✓ Email sent: {subject}")
        return True
    except Exception as e:
        print(f"✗ Email error: {e}")
        return False


def format_symbol(symbol):
    """Format trading symbol for display"""
    if not symbol or len(symbol) < 15:
        return symbol
    try:
        return (symbol[0:5] + " " + symbol[7:10] + " " +
               symbol[10:15] + " " + symbol[-2:])
    except:
        return symbol
