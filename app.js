require('dotenv').config();
const express = require('express');
const cors = require('cors');
const logger = require('./src/logger');
const WhatsAppService = require('./src/whatsappService');
const AlternativeWhatsAppService = require('./src/alternativeWhatsAppService');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Global variables
let whatsappService = null;
let isUsingAlternative = false;

// Initialize WhatsApp with fallback
async function initializeWhatsApp() {
    try {
        logger.info('Initializing primary WhatsApp service...');
        whatsappService = new WhatsAppService();
        await whatsappService.initialize();
        logger.info('Primary WhatsApp service initialized');
    } catch (error) {
        logger.error('Primary service failed, switching to alternative:', error.message);
        try {
            whatsappService = new AlternativeWhatsAppService();
            await whatsappService.initialize();
            isUsingAlternative = true;
            logger.info('Alternative WhatsApp service initialized');
        } catch (altError) {
            logger.error('Alternative service also failed:', altError.message);
            whatsappService = {
                isReady: false,
                getStatus: () => ({ isReady: false, error: 'All services failed' }),
                getQRCode: () => ({ data: 'Service unavailable', image: null })
            };
        }
    }
}

// Routes
app.get('/', (req, res) => {
    res.send(`
        <html>
        <head><title>WhatsApp Automation</title></head>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h1>Ì¥ñ WhatsApp Automation System</h1>
            <p>Service Type: ${isUsingAlternative ? 'Alternative' : 'Primary'}</p>
            <div>
                <a href="/status" style="margin: 10px; padding: 10px; background: #007cba; color: white; text-decoration: none;">Status</a>
                <a href="/qr" style="margin: 10px; padding: 10px; background: #25d366; color: white; text-decoration: none;">QR Code</a>
            </div>
        </body>
        </html>
    `);
});

app.get('/status', async (req, res) => {
    try {
        const status = whatsappService ? whatsappService.getStatus() : { error: 'Not initialized' };
        res.json({
            service: isUsingAlternative ? 'alternative' : 'primary',
            whatsapp: status,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/qr', (req, res) => {
    try {
        if (!whatsappService) {
            return res.send(`
                <html>
                <head><title>Service Not Available</title></head>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h1>Service Not Available</h1>
                    <p><a href="/status">Check Status</a></p>
                </body>
                </html>
            `);
        }

        const qrData = whatsappService.getQRCode();
        
        if (isUsingAlternative) {
            return res.send(`
                <html>
                <head><title>Alternative Service</title></head>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h1>Ì¥Ñ Alternative WhatsApp Service</h1>
                    <p>Status: ${qrData.data}</p>
                    <p>Primary Puppeteer service not available in this environment.</p>
                    <p><a href="/status">Check Status</a></p>
                </body>
                </html>
            `);
        }

        if (!qrData.data || !qrData.image) {
            return res.send(`
                <html>
                <head><title>QR Code Not Available</title></head>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h1>QR Code Not Available</h1>
                    <p>WhatsApp may already be authenticated or initializing.</p>
                    <p><a href="/status">Check Status</a></p>
                </body>
                </html>
            `);
        }

        res.send(`
            <html>
            <head><title>WhatsApp QR Code</title><meta http-equiv="refresh" content="10"></head>
            <body style="font-family: Arial; text-align: center; padding: 50px;">
                <h1>Ì≥± WhatsApp QR Code</h1>
                <img src="${qrData.image}" style="max-width: 300px; border: 2px solid #ccc;">
                <p>Scan with WhatsApp on your phone</p>
                <p><a href="/status">Check Status</a></p>
            </body>
            </html>
        `);
    } catch (error) {
        res.status(500).send(`
            <html>
            <head><title>Error</title></head>
            <body style="font-family: Arial; text-align: center; padding: 50px;">
                <h1>Error</h1>
                <p>${error.message}</p>
            </body>
            </html>
        `);
    }
});

// Start server
async function start() {
    try {
        logger.info('Starting WhatsApp Automation System...');
        
        // Initialize WhatsApp service with fallback
        await initializeWhatsApp();
        
        // Start Express server
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`Ìºê Server running on port ${PORT}`);
            console.log(`Ì≥± QR Code: http://localhost:${PORT}/qr`);
            console.log(`Ì≥ä Status: http://localhost:${PORT}/status`);
            logger.info(`Server started on port ${PORT}`);
        });
        
    } catch (error) {
        console.error('Failed to start:', error);
        process.exit(1);
    }
}

start();
