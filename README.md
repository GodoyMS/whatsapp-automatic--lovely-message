# WhatsApp Automatic Message System

A Node.js application that automatically sends personalized WhatsApp messages using OpenAI's GPT model and whatsapp-web.js.

## Features

- 🤖 **AI-Powered Messages**: Generate unique, contextual messages using OpenAI GPT
- ⏰ **Scheduled Messaging**: Automatically send messages at configurable intervals
- 💬 **Conversation History**: Maintain context with conversation history tracking
- 🔐 **Secure Authentication**: Session management with QR code authentication
- 📊 **RESTful API**: Full REST API for management and monitoring
- 🐳 **Docker Ready**: Complete Docker and Docker Compose setup
- 📱 **Cloud Deployment**: Optimized for cloud services (AWS, Google Cloud, etc.)
- 🛡️ **Security Features**: Helmet, CORS, input validation, and more

## Installation

### Prerequisites

- Node.js 16+ 
- OpenAI API Key
- WhatsApp account

### Local Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd whatsapp-automatic-message
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your settings:
   ```env
   OPENAI_API_KEY=your_openai_api_key_here
   TARGET_PHONE_NUMBER=1234567890
   MESSAGE_INTERVAL_HOURS=4
   MESSAGE_STYLE=friendly
   MESSAGE_LANGUAGE=english
   NODE_ENV=production
   PORT=3000
   ```

4. **Start the application**
   ```bash
   npm start
   ```

5. **Scan QR Code**
   - The application will display a QR code in the terminal
   - Scan it with your WhatsApp to authenticate
   - Once authenticated, automatic messaging will begin

## Docker Deployment

### Using Docker Compose (Recommended)

1. **Create environment file**
   ```bash
   cp .env.example .env
   # Edit .env with your configurations
   ```

2. **Start with Docker Compose**
   ```bash
   docker-compose up -d
   ```

3. **Check logs and scan QR code**
   ```bash
   docker-compose logs -f whatsapp-automation
   ```

### Using Docker only

```bash
# Build the image
docker build -t whatsapp-automation .

# Run the container
docker run -d \
  --name whatsapp-auto-message \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/logs:/app/logs \
  -v $(pwd)/session:/app/session \
  --env-file .env \
  whatsapp-automation
```

## Cloud Deployment

### AWS EC2 / Google Cloud VM

1. **Setup server**
   ```bash
   # Install Docker and Docker Compose
   sudo apt update
   sudo apt install docker.io docker-compose
   sudo usermod -aG docker $USER
   ```

2. **Deploy application**
   ```bash
   git clone <repository-url>
   cd whatsapp-automatic-message
   cp .env.example .env
   # Edit .env with your settings
   docker-compose up -d
   ```

3. **Setup firewall**
   ```bash
   # Allow port 3000
   sudo ufw allow 3000
   ```

### Heroku Deployment

1. **Install Heroku CLI and login**
   ```bash
   heroku login
   ```

2. **Create Heroku app**
   ```bash
   heroku create your-app-name
   heroku config:set NODE_ENV=production
   heroku config:set OPENAI_API_KEY=your_key
   heroku config:set TARGET_PHONE_NUMBER=your_number
   # Add other environment variables
   ```

3. **Deploy**
   ```bash
   git push heroku main
   ```

### Railway / Render Deployment

Both platforms support direct GitHub deployment:

1. Connect your GitHub repository
2. Set environment variables in the dashboard
3. Deploy automatically on git push

## API Endpoints

### Health & Status
- `GET /health` - Health check
- `GET /status` - Detailed application status
- `GET /` - API documentation

### Messaging
- `POST /send-message` - Send manual message
- `POST /send-auto-message` - Trigger automatic message

### History & Data
- `GET /history/:phoneNumber?` - Get conversation history
- `GET /export/:phoneNumber?` - Export conversation history

### Scheduler Management
- `POST /schedule/update` - Update message interval
- `POST /schedule/start` - Start scheduler
- `POST /schedule/stop` - Stop scheduler

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key | Required |
| `TARGET_PHONE_NUMBER` | Phone number to send messages to | Required |
| `MESSAGE_INTERVAL_HOURS` | Hours between messages | 4 |
| `MESSAGE_STYLE` | Message style (friendly, professional, casual, romantic, humorous) | friendly |
| `MESSAGE_LANGUAGE` | Language for messages | english |
| `OPENAI_MODEL` | OpenAI model to use | gpt-4 |
| `MAX_TOKENS` | Maximum tokens per message | 150 |
| `TEMPERATURE` | OpenAI temperature setting | 0.8 |
| `PORT` | Server port | 3000 |
| `NODE_ENV` | Environment mode | production |
| `LOG_LEVEL` | Logging level | info |

### Message Styles

- **friendly**: Warm, caring friend messages
- **professional**: Respectful, courteous tone
- **casual**: Laid-back, relaxed conversation
- **romantic**: Sweet, loving messages
- **humorous**: Light-hearted, funny messages

## Usage Examples

### Send Manual Message
```bash
curl -X POST http://localhost:3000/send-message \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello! How are you today?"}'
```

### Update Schedule
```bash
curl -X POST http://localhost:3000/schedule/update \
  -H "Content-Type: application/json" \
  -d '{"intervalHours": 6}'
```

### Get Status
```bash
curl http://localhost:3000/status
```

## Security Features

- **Helmet.js**: Security headers
- **CORS**: Cross-origin resource sharing protection
- **Input Validation**: Request validation and sanitization
- **Rate Limiting**: API rate limiting (configurable)
- **Session Security**: Secure session management
- **Environment Variables**: Sensitive data protection

## Monitoring & Logging

### Logs
- Application logs: `./logs/combined.log`
- Error logs: `./logs/error.log`
- Console output in development mode

### Health Monitoring
- Health check endpoint: `/health`
- Detailed status: `/status`
- Conversation statistics
- Scheduler status
- WhatsApp connection status

## Troubleshooting

### Common Issues

1. **QR Code not appearing**
   - Check if port 3000 is accessible
   - Ensure no firewall blocking
   - Check logs: `docker-compose logs whatsapp-automation`

2. **WhatsApp authentication failed**
   - Delete session folder and restart
   - Ensure WhatsApp Web is not open elsewhere
   - Check phone connection

3. **OpenAI API errors**
   - Verify API key is correct
   - Check API quota and billing
   - Ensure internet connectivity

4. **Messages not sending**
   - Verify target phone number format (no + sign)
   - Check WhatsApp connection status via `/status`
   - Ensure target has WhatsApp account

### Debug Mode

```bash
# Enable debug logging
export LOG_LEVEL=debug
npm start

# Or with Docker
docker-compose up -d
docker-compose logs -f whatsapp-automation
```

## Development

### Project Structure
```
whatsapp-automatic-message/
├── app.js                 # Main application
├── src/
│   ├── whatsappService.js # WhatsApp integration
│   ├── messageGenerator.js # OpenAI message generation
│   ├── conversationHistory.js # History management
│   ├── cronScheduler.js   # Task scheduling
│   └── logger.js          # Logging configuration
├── data/                  # Conversation history storage
├── logs/                  # Application logs
├── session/               # WhatsApp session data
├── Dockerfile
├── docker-compose.yml
└── package.json
```

### Adding New Features

1. **Custom message generators**: Extend `MessageGenerator` class
2. **New scheduling patterns**: Add methods to `CronScheduler`
3. **Additional APIs**: Add routes in `app.js`
4. **New integrations**: Create new service classes

## Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/new-feature`
3. Commit changes: `git commit -am 'Add new feature'`
4. Push to branch: `git push origin feature/new-feature`
5. Submit pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support and questions:
- Create an issue on GitHub
- Check the troubleshooting section
- Review logs for error details

## Disclaimer

This tool is for educational and personal use. Ensure compliance with WhatsApp's Terms of Service and your local regulations regarding automated messaging.