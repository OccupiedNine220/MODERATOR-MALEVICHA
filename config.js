require('dotenv').config();

module.exports = {
    token: process.env.TOKEN,
    prefix: '!',
    mongodb: process.env.MONGODB_URI,
    adminRoleId: process.env.ADMIN_ROLE_ID || '1284949456374202480',
    modRoleId: process.env.MOD_ROLE_ID || '1284949659864928419',
    logChannelId: process.env.LOG_CHANNEL_ID || '1285152306064658535',
    lockerRoleId: process.env.LOCKER_ROLE_ID || '1376585471664431144',
    weatherApiKey: process.env.WEATHER_API_KEY,
    exchangeRateApiKey: process.env.EXCHANGERATE_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    groqApiKey: process.env.GROQ_API_KEY,
    version: '1.8.1',
    build: '008 05.06.2025'
}; 