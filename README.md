# MODERATOR-MALEVICHA

![Discord Bot](https://img.shields.io/badge/discord-bot-7289DA?logo=discord&logoColor=white)
![Version](https://img.shields.io/badge/version-1.8.1-blue)
![License](https://img.shields.io/badge/license-MIT-green)

Advanced Discord moderation bot built with JavaScript that helps maintain server order, automate moderation tasks, and protect your community.

## 🚀 Features

- **🛡️ Advanced Moderation** - Warn, mute, kick, and ban users with detailed logging
- **🤖 Auto-Moderation** - Filter inappropriate content and prevent spam
- **🔍 AI Moderation** - Automated content analysis and moderation
- **🎟️ Ticket System** - Allow users to create support tickets
- **⚡ Anti-Raid Protection** - Detect and prevent server raids
- **📊 Moderation Reports** - Daily and weekly moderation activity reports
- **🔄 Temporary Roles** - Assign roles for specific durations
- **📈 Level System** - User activity tracking and rewards
- **🌡️ Weather Information** - Get weather updates with API integration
- **💰 Currency Exchange** - Check real-time exchange rates
- **📝 Logging** - Comprehensive logging of server activities

## 📋 Prerequisites

- Node.js v16.9.0 or higher
- MongoDB database
- Discord Bot Token

## 🔧 Installation

1. **Clone the repository**
   ```
   git clone https://github.com/yourusername/MODERATOR-MALEVICHA.git
   cd MODERATOR-MALEVICHA
   ```

2. **Install dependencies**
   ```
   npm install
   ```

3. **Configure environment variables**
   - Copy `.env.example` to `.env`
   - Fill in required API keys and tokens

4. **Deploy commands to your Discord server**
   ```
   node deploy-commands.js
   ```

5. **Start the bot**
   ```
   npm start
   ```

## 🔑 Environment Variables

See the `.env.example` file for required environment variables.

## 🛠️ Commands

The bot includes various command categories:

- **Moderation Commands**: warn, mute, kick, ban, etc.
- **Utility Commands**: weather, exchange rates, server info, etc.
- **Administration Commands**: configure bot settings

## 🧩 Project Structure

```
MODERATOR-MALEVICHA/
├── commands/          # Bot commands organized by category
├── cogs/              # Additional command modules
├── data/              # Data storage
├── features/          # Major feature implementations
├── models/            # Database schema models
├── utils/             # Utility functions
├── index.js           # Main bot file
├── config.js          # Configuration
└── deploy-commands.js # Register slash commands
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📞 Support

For support, please open an issue on GitHub or contact the project maintainers.

---

Version: 1.8.1 | Build: 008 05.06.2025
