const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const axios = require('axios');
const Canvas = require('canvas');
const fs = require('fs');
const path = require('path');

// Файл для хранения истории статусов
const STATUS_HISTORY_FILE = path.join(__dirname, '../../data/server_status_history.json');

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
        const response = await axios.get('https://api.groq.com/health', { 
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
                'Authorization': `Bot ${process.env.TOKEN || require('../../config').token}`
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

// Создает график истории доступности
async function createUptimeChart(history) {
    const canvas = Canvas.createCanvas(800, 400);
    const ctx = canvas.getContext('2d');
    
    // Заполняем фон
    ctx.fillStyle = '#2b2d31';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Добавляем заголовок
    ctx.font = 'bold 24px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText('История доступности серверов (последние 50 проверок)', canvas.width / 2, 30);
    
    // Рисуем легенду
    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#55FF55'; // Зеленый для Groq
    ctx.textAlign = 'left';
    ctx.fillText('● Groq API', 50, 60);
    
    ctx.fillStyle = '#5555FF'; // Синий для бота
    ctx.fillText('● Discord Bot', 200, 60);
    
    // Параметры графика
    const margin = { top: 80, right: 50, bottom: 50, left: 50 };
    const graphWidth = canvas.width - margin.left - margin.right;
    const graphHeight = canvas.height - margin.top - margin.bottom;
    
    // Рисуем оси
    ctx.beginPath();
    ctx.strokeStyle = '#888888';
    ctx.lineWidth = 2;
    ctx.moveTo(margin.left, margin.top);
    ctx.lineTo(margin.left, canvas.height - margin.bottom);
    ctx.lineTo(canvas.width - margin.right, canvas.height - margin.bottom);
    ctx.stroke();
    
    // Если нет истории, выходим
    if (history.groq.length === 0 && history.bot.length === 0) {
        ctx.font = '20px sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText('Нет данных для отображения', canvas.width / 2, canvas.height / 2);
        return canvas;
    }
    
    // Рисуем график для Groq API
    if (history.groq.length > 0) {
        ctx.beginPath();
        ctx.strokeStyle = '#55FF55'; // Зеленый
        ctx.lineWidth = 3;
        
        history.groq.forEach((record, index) => {
            const x = margin.left + (index / (history.groq.length - 1 || 1)) * graphWidth;
            const y = (canvas.height - margin.bottom) - (record.isUp ? graphHeight / 3 : 0);
            
            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        
        ctx.stroke();
    }
    
    // Рисуем график для бота
    if (history.bot.length > 0) {
        ctx.beginPath();
        ctx.strokeStyle = '#5555FF'; // Синий
        ctx.lineWidth = 3;
        
        history.bot.forEach((record, index) => {
            const x = margin.left + (index / (history.bot.length - 1 || 1)) * graphWidth;
            const y = (canvas.height - margin.bottom) - (record.isUp ? graphHeight * 2/3 : 0);
            
            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        
        ctx.stroke();
    }
    
    // Добавляем подписи осей
    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText('Время', canvas.width / 2, canvas.height - 10);
    
    ctx.save();
    ctx.translate(15, canvas.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('Состояние', 0, 0);
    ctx.restore();
    
    return canvas;
}

// Создает график времени отклика
async function createResponseTimeChart(history) {
    const canvas = Canvas.createCanvas(800, 400);
    const ctx = canvas.getContext('2d');
    
    // Заполняем фон
    ctx.fillStyle = '#2b2d31';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Добавляем заголовок
    ctx.font = 'bold 24px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText('Время отклика (мс)', canvas.width / 2, 30);
    
    // Рисуем легенду
    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#FF5555'; // Красный для Groq
    ctx.textAlign = 'left';
    ctx.fillText('● Groq API', 50, 60);
    
    ctx.fillStyle = '#FFFF55'; // Желтый для бота
    ctx.fillText('● Discord Bot', 200, 60);
    
    // Параметры графика
    const margin = { top: 80, right: 50, bottom: 50, left: 50 };
    const graphWidth = canvas.width - margin.left - margin.right;
    const graphHeight = canvas.height - margin.top - margin.bottom;
    
    // Фильтруем записи с временем отклика
    const groqData = history.groq.filter(record => record.responseTime !== null);
    const botData = history.bot.filter(record => record.responseTime !== null);
    
    // Если нет данных, выходим
    if (groqData.length === 0 && botData.length === 0) {
        ctx.font = '20px sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText('Нет данных о времени отклика', canvas.width / 2, canvas.height / 2);
        return canvas;
    }
    
    // Находим максимальное время отклика для масштабирования
    const maxGroqTime = groqData.length > 0 ? Math.max(...groqData.map(record => record.responseTime)) : 0;
    const maxBotTime = botData.length > 0 ? Math.max(...botData.map(record => record.responseTime)) : 0;
    const maxResponseTime = Math.max(maxGroqTime, maxBotTime, 500); // Минимум 500мс для графика
    
    // Рисуем оси
    ctx.beginPath();
    ctx.strokeStyle = '#888888';
    ctx.lineWidth = 2;
    ctx.moveTo(margin.left, margin.top);
    ctx.lineTo(margin.left, canvas.height - margin.bottom);
    ctx.lineTo(canvas.width - margin.right, canvas.height - margin.bottom);
    ctx.stroke();
    
    // Рисуем линии сетки и метки для оси Y
    const yLabels = 5;
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#444444';
    ctx.lineWidth = 1;
    
    for (let i = 0; i <= yLabels; i++) {
        const y = margin.top + (graphHeight / yLabels) * i;
        const value = Math.round((maxResponseTime / yLabels) * (yLabels - i));
        
        ctx.beginPath();
        ctx.moveTo(margin.left - 5, y);
        ctx.lineTo(margin.left + graphWidth, y);
        ctx.stroke();
        
        ctx.fillText(value.toString() + 'мс', margin.left - 10, y + 5);
    }
    
    // Рисуем график для Groq API
    if (groqData.length > 0) {
        ctx.beginPath();
        ctx.strokeStyle = '#FF5555'; // Красный
        ctx.lineWidth = 3;
        
        groqData.forEach((record, index) => {
            const x = margin.left + (index / (groqData.length - 1 || 1)) * graphWidth;
            const y = margin.top + (1 - record.responseTime / maxResponseTime) * graphHeight;
            
            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
            
            // Добавляем точки на график
            ctx.fillStyle = '#FF5555';
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fill();
        });
        
        ctx.stroke();
    }
    
    // Рисуем график для бота
    if (botData.length > 0) {
        ctx.beginPath();
        ctx.strokeStyle = '#FFFF55'; // Желтый
        ctx.lineWidth = 3;
        
        botData.forEach((record, index) => {
            const x = margin.left + (index / (botData.length - 1 || 1)) * graphWidth;
            const y = margin.top + (1 - record.responseTime / maxResponseTime) * graphHeight;
            
            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
            
            // Добавляем точки на график
            ctx.fillStyle = '#FFFF55';
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fill();
        });
        
        ctx.stroke();
    }
    
    // Добавляем подписи осей
    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText('Последние проверки', canvas.width / 2, canvas.height - 10);
    
    ctx.save();
    ctx.translate(15, canvas.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('Время отклика (мс)', 0, 0);
    ctx.restore();
    
    return canvas;
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

module.exports = {
    data: new SlashCommandBuilder()
        .setName('serverstatus')
        .setDescription('Показать статус серверов')
        .addSubcommand(subcommand =>
            subcommand
                .setName('check')
                .setDescription('Проверить текущий статус серверов'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('history')
                .setDescription('Показать историю статусов в виде графика')),
                
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        
        switch (subcommand) {
            case 'check':
                await checkStatus(interaction);
                break;
            case 'history':
                await showHistory(interaction);
                break;
        }
    }
};

async function checkStatus(interaction) {
    await interaction.deferReply();
    
    const BOT_ID = '1263608448931729511';
    
    try {
        // Проверяем статусы сервисов
        const groqStatus = await checkGroqStatus();
        const botStatus = await checkBotStatus(BOT_ID);
        
        // Загружаем историю для статистики
        const history = loadStatusHistory();
        const groqUptime = calculateUptime(history, 'groq');
        const botUptime = calculateUptime(history, 'bot');
        const groqAvgResponseTime = calculateAverageResponseTime(history, 'groq');
        const botAvgResponseTime = calculateAverageResponseTime(history, 'bot');
        
        // Создаем эмбед
        const embed = new EmbedBuilder()
            .setTitle('📊 Статус серверов')
            .setDescription('Текущее состояние отслеживаемых серверов')
            .addFields(
                {
                    name: `${groqStatus.isUp ? '🟢' : '🔴'} Groq API`,
                    value: `Статус: ${groqStatus.isUp ? 'Онлайн' : 'Оффлайн'}\nКод: ${groqStatus.statusCode}\n${groqStatus.responseTime ? `Время отклика: ${groqStatus.responseTime}мс` : ''}\nСообщение: ${groqStatus.message}`
                },
                {
                    name: `${botStatus.isUp ? '🟢' : '🔴'} Discord Bot (${botStatus.botName})`,
                    value: `Статус: ${botStatus.isUp ? 'Онлайн' : 'Оффлайн'}\nКод: ${botStatus.statusCode}\n${botStatus.responseTime ? `Время отклика: ${botStatus.responseTime}мс` : ''}\nСообщение: ${botStatus.message}`
                },
                {
                    name: '📈 Статистика доступности',
                    value: `Groq API: ${groqUptime.toFixed(2)}%\nDiscord Bot: ${botUptime.toFixed(2)}%`
                },
                {
                    name: '⏱️ Среднее время отклика',
                    value: `Groq API: ${groqAvgResponseTime.toFixed(2)}мс\nDiscord Bot: ${botAvgResponseTime.toFixed(2)}мс`
                }
            )
            .setColor(groqStatus.isUp && botStatus.isUp ? '#00FF00' : (groqStatus.isUp || botStatus.isUp ? '#FFA500' : '#FF0000'))
            .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Ошибка при проверке статуса серверов:', error);
        await interaction.editReply({ content: `❌ Произошла ошибка при проверке статуса серверов: ${error.message}` });
    }
}

async function showHistory(interaction) {
    await interaction.deferReply();
    
    try {
        // Загружаем историю
        const history = loadStatusHistory();
        
        // Если нет истории, сообщаем об этом
        if (history.groq.length === 0 && history.bot.length === 0) {
            return interaction.editReply({ content: 'История статусов пуста. Используйте `/serverstatus check` для первой проверки.' });
        }
        
        // Создаем графики
        const uptimeChart = await createUptimeChart(history);
        const responseTimeChart = await createResponseTimeChart(history);
        
        // Создаем вложения
        const uptimeAttachment = new AttachmentBuilder(uptimeChart.toBuffer(), { name: 'uptime-chart.png' });
        const responseTimeAttachment = new AttachmentBuilder(responseTimeChart.toBuffer(), { name: 'response-time-chart.png' });
        
        // Создаем эмбеды
        const uptimeEmbed = new EmbedBuilder()
            .setTitle('📊 История доступности серверов')
            .setDescription('График истории доступности серверов')
            .setImage('attachment://uptime-chart.png')
            .setColor('#2b2d31')
            .setTimestamp();
        
        const responseTimeEmbed = new EmbedBuilder()
            .setTitle('⏱️ История времени отклика')
            .setDescription('График истории времени отклика серверов')
            .setImage('attachment://response-time-chart.png')
            .setColor('#2b2d31')
            .setTimestamp();
        
        // Отправляем ответ
        await interaction.editReply({
            embeds: [uptimeEmbed, responseTimeEmbed],
            files: [uptimeAttachment, responseTimeAttachment]
        });
    } catch (error) {
        console.error('Ошибка при отображении истории статусов:', error);
        await interaction.editReply({ content: `❌ Произошла ошибка при отображении истории статусов: ${error.message}` });
    }
} 