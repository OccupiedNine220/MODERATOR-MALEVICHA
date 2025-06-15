const mongoose = require('mongoose');
const config = require('../config');

// Подключение к MongoDB
const connectDatabase = async () => {
    try {
        await mongoose.connect(config.mongodb);
        console.log('База данных MongoDB подключена');
    } catch (error) {
        console.error('Ошибка подключения к базе данных:', error);
        process.exit(1);
    }
};

module.exports = { connectDatabase }; 