# Deployment Guide - WhatsApp Automatic Message System

## 🔒 SECURITY FIRST
**⚠️ BEFORE DEPLOYING:**
1. Go to OpenAI Dashboard → API Keys
2. **REVOKE** the exposed key: `sk-proj-x0akck8glrmEOAO7nevh...`
3. Generate a **NEW API KEY**
4. Update your `.env` file with the new key

## 💰 Cheap Deployment Options

### Option 1: DigitalOcean Droplet ($4/month)
1. Create DigitalOcean account
2. Create new Droplet:
   - **Image:** Ubuntu 22.04 LTS
   - **Plan:** Basic - $4/month (512MB RAM, 1 CPU)
   - **Region:** Choose closest to Peru
   
3. Connect via SSH and run:
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 for process management
sudo npm install -g pm2

# Create app directory
mkdir ~/whatsapp-bot
cd ~/whatsapp-bot
```

4. Upload your project files (except node_modules)
5. Install dependencies:
```bash
npm install
```

6. Create production .env:
```bash
nano .env
# Add your NEW OpenAI API key
```

7. Start with PM2:
```bash
pm2 start app.js --name "whatsapp-bot"
pm2 startup
pm2 save
```

### Option 2: Railway (Free tier)
1. Connect your GitHub account
2. Push code to GitHub (ensure .env is in .gitignore)
3. Deploy from GitHub
4. Add environment variables in Railway dashboard

### Option 3: Local Development (FREE)
```bash
# Just run locally
npm start
```

## 📱 WhatsApp QR Code Access
For VPS deployment, you'll need to:
1. SSH with port forwarding: `ssh -L 3000:localhost:3000 user@your-server`
2. Open browser: `http://localhost:3000`
3. Scan QR code with WhatsApp

## 💵 Cost Comparison
- **Local:** $0/month
- **Raspberry Pi:** ~$10/month (electricity)
- **DigitalOcean:** $4/month
- **Railway:** $0-5/month
- **Vultr:** $2.50/month

## 🎯 Recommendation
**Start with local testing, then move to DigitalOcean $4/month droplet for production.**