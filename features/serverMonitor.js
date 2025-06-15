const axios = require('axios');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { EmbedBuilder } = require('discord.js');

// Файл для хранения истории статусов
const STATUS_HISTORY_FILE = path.join(__dirname, '../data/server_status_history.json');
// ID бота для мониторинга
const MONITORED_BOT_ID = '1263608448931729511';
// ID канала для уведомлений о проблемах
let NOTIFICATION_CHANNEL_ID = null;
// Предыдущие статусы для отслеживания изменений
let previousStatus = {
    groq: true,
    bot: true
};

// Создаем директорию для данных, если она не существует
function ensureDirectoryExists(dirPath) {
    const dirname = path.dirname(dirPath);
    if (!fs.existsSync(dirname)) {
        fs.mkdirSync(dirname, { recursive: true });
    }
}

// Загружаем историю статусов
function loadStatusHistory() {
    ensureDirectoryExists(STATUS_HISTORY_FILE);
    if (!fs.existsSync(STATUS_HISTORY_FILE)) {
        return {
            groq: [],
            bot: []
        };
    }
    
    try {
        const data = fs.readFileSync(STATUS_HISTORY_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Ошибка при загрузке истории статусов:', error);
        return {
            groq: [],
            bot: []
        };
    }
}

// Сохраняем историю статусов
function saveStatusHistory(history) {
    ensureDirectoryExists(STATUS_HISTORY_FILE);
    fs.writeFileSync(STATUS_HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
}

// Добавляем запись о статусе
function addStatusRecord(service, isUp, responseTime = null) {
    const history = loadStatusHistory();
    
    // Ограничиваем историю до 50 записей для каждого сервиса
    if (history[service].length >= 50) {
        history[service].shift();
    }
    
    history[service].push({
        timestamp: Date.now(),
        isUp,
        responseTime
    });
    
    saveStatusHistory(history);
    return history;
}

// Проверка статуса Groq API
async function checkGroqStatus() {
    try {
        const startTime = Date.now();
        const response = await axios.get('https://api.groq.com/', { // балять оно может не рабить
            timeout: 5000,
            validateStatus: () => true
        });
        const responseTime = Date.now() - startTime;
        
        const isUp = response.status === 200;
        addStatusRecord('groq', isUp, responseTime);
        
        return {
            isUp,
            responseTime,
            statusCode: response.status,
            message: isUp ? 'API работает нормально' : `Ошибка: ${response.status} ${response.statusText}`
        };
    } catch (error) {
        console.error('Ошибка при проверке Groq API:', error.message);
        addStatusRecord('groq', false);
        
        return {
            isUp: false,
            responseTime: null,
            statusCode: error.response?.status || 0,
            message: `Ошибка соединения: ${error.message}`
        };
    }
}

// Проверка статуса Discord бота
async function checkBotStatus(botId) {
    try {
        // Используем Discord API для получения информации о боте
        const startTime = Date.now();
        const response = await axios.get(`https://discord.com/api/v10/users/${botId}`, {
            timeout: 5000,
            headers: {
                'Authorization': `Bot ${process.env.TOKEN || require('../config').token}`
            },
            validateStatus: () => true
        });
        const responseTime = Date.now() - startTime;
        
        const isUp = response.status === 200;
        addStatusRecord('bot', isUp, responseTime);
        
        return {
            isUp,
            responseTime,
            statusCode: response.status,
            botName: response.data?.username || 'Неизвестно',
            message: isUp ? 'Бот онлайн' : `Ошибка: ${response.status} ${response.statusText}`
        };
    } catch (error) {
        console.error('Ошибка при проверке статуса бота:', error.message);
        addStatusRecord('bot', false);
        
        return {
            isUp: false,
            responseTime: null,
            statusCode: error.response?.status || 0,
            botName: 'Неизвестно',
            message: `Ошибка соединения: ${error.message}`
        };
    }
}

// Вычисляем процент доступности
function calculateUptime(history, service) {
    if (!history[service] || history[service].length === 0) {
        return 0;
    }
    
    const upCount = history[service].filter(record => record.isUp).length;
    return (upCount / history[service].length) * 100;
}

// Вычисляем среднее время отклика
function calculateAverageResponseTime(history, service) {
    const records = history[service].filter(record => record.responseTime !== null);
    
    if (records.length === 0) {
        return 0;
    }
    
    const sum = records.reduce((total, record) => total + record.responseTime, 0);
    return sum / records.length;
}

// Инициализация мониторинга
function initMonitoring(client, notificationChannelId) {
    NOTIFICATION_CHANNEL_ID = notificationChannelId;
    
    // Запуск планировщика - проверка каждые 5 минут
    cron.schedule('*/5 * * * *', async () => {
        await performHealthCheck(client);
    });
    
    console.log('Мониторинг серверов запущен. Проверка каждые 5 минут.');
}

// Проведение проверки состояния серверов
async function performHealthCheck(client) {
    try {
        console.log('Выполняется проверка состояния серверов...');
        
        // Проверяем статусы сервисов
        const groqStatus = await checkGroqStatus();
        const botStatus = await checkBotStatus(MONITORED_BOT_ID);
        
        // Проверяем, изменилось ли состояние серверов
        if (previousStatus.groq !== groqStatus.isUp) {
            // Статус Groq API изменился
            sendStatusChangeNotification(client, 'groq', groqStatus);
            previousStatus.groq = groqStatus.isUp;
        }
        
        if (previousStatus.bot !== botStatus.isUp) {
            // Статус бота изменился
            sendStatusChangeNotification(client, 'bot', botStatus);
            previousStatus.bot = botStatus.isUp;
        }
        
        console.log(`Проверка завершена: Groq API - ${groqStatus.isUp ? 'Онлайн' : 'Оффлайн'}, Бот - ${botStatus.isUp ? 'Онлайн' : 'Оффлайн'}`);
    } catch (error) {
        console.error('Ошибка при выполнении проверки состояния серверов:', error);
    }
}

// Отправка уведомления об изменении статуса
async function sendStatusChangeNotification(client, service, status) {
    if (!NOTIFICATION_CHANNEL_ID) return;
    
    try {
        const channel = await client.channels.fetch(NOTIFICATION_CHANNEL_ID);
        if (!channel) return;
        
        let serviceName = service === 'groq' ? 'Groq API' : 'Discord Бот';
        let statusText = status.isUp ? 'восстановлен' : 'недоступен';
        let statusEmoji = status.isUp ? '🟢' : '🔴';
        let color = status.isUp ? '#00FF00' : '#FF0000';
        
        const embed = new EmbedBuilder()
            .setTitle(`${statusEmoji} Изменение статуса сервиса`)
            .setDescription(`Сервис **${serviceName}** сейчас ${statusText}!`)
            .addFields({
                name: 'Подробности',
                value: `Статус: ${status.isUp ? 'Онлайн' : 'Оффлайн'}\nКод: ${status.statusCode}\n${status.responseTime ? `Время отклика: ${status.responseTime}мс` : ''}\nСообщение: ${status.message}`
            })
            .setColor(color)
            .setTimestamp();
        
        await channel.send({ embeds: [embed] });
    } catch (error) {
        console.error('Ошибка при отправке уведомления:', error);
    }
}

// Ручная проверка статуса серверов
async function checkServersStatus() {
    const groqStatus = await checkGroqStatus();
    const botStatus = await checkBotStatus(MONITORED_BOT_ID);
    
    // Загружаем историю для статистики
    const history = loadStatusHistory();
    const groqUptime = calculateUptime(history, 'groq');
    const botUptime = calculateUptime(history, 'bot');
    const groqAvgResponseTime = calculateAverageResponseTime(history, 'groq');
    const botAvgResponseTime = calculateAverageResponseTime(history, 'bot');
    
    return {
        groqStatus,
        botStatus,
        groqUptime,
        botUptime,
        groqAvgResponseTime,
        botAvgResponseTime
    };
}

module.exports = {
    initMonitoring,
    checkServersStatus,
    loadStatusHistory
}; 