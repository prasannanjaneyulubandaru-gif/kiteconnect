"""
Configuration Module
All application settings in one place
"""
import os

class Config:
    """Base configuration"""
    
    # Flask settings
    SECRET_KEY = os.environ.get('SECRET_KEY', 'your-secret-key-change-in-production')
    DEBUG = os.environ.get('DEBUG', 'True') == 'True'
    
    # CORS settings
    CORS_ORIGINS = "*"
    CORS_METHODS = ["GET", "POST", "OPTIONS"]
    CORS_ALLOW_HEADERS = ["Content-Type", "X-User-ID"]
    
    # Email configuration
    EMAIL_SENDER = os.environ.get('EMAIL_SENDER', 'prasannanjaneyulu.bandaru@gmail.com')
    EMAIL_RECEIVER = os.environ.get('EMAIL_RECEIVER', 'prasannanjaneyulu.bandaru@gmail.com')
    EMAIL_PASSWORD = os.environ.get('EMAIL_PASSWORD', 'bqmt gtld cecs zmcq')
    EMAIL_SMTP_SERVER = 'smtp.gmail.com'
    EMAIL_SMTP_PORT = 587
    
    # Application settings
    PORT = int(os.environ.get('PORT', 5000))
    HOST = '0.0.0.0'


class DevelopmentConfig(Config):
    """Development configuration"""
    DEBUG = True


class ProductionConfig(Config):
    """Production configuration"""
    DEBUG = False


# Configuration dictionary
config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}
