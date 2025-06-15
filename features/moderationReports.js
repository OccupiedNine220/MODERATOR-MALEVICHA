const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { createCanvas } = require('canvas');
const moment = require('moment');

// Предполагаем, что у нас есть модели для отслеживания модерации
const { User, Mute, Warn, Ban } = require('../models/schema');

// ID канала для отчетов
const REPORT_CHANNEL_ID = '1285152506061525042';

/**
 * Генерирует и отправляет ежедневный отчет о модерации
 * @param {Client} client - Клиент Discord.js
 */
async function generateDailyReport(client) {
    try {
        // Получаем канал для отчетов
        const reportChannel = await client.channels.fetch(REPORT_CHANNEL_ID).catch(console.error);
        if (!reportChannel) {
            console.error(`Канал для отчетов ${REPORT_CHANNEL_ID} не найден`);
            return;
        }
        
        // Получаем данные за последние 24 часа
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
        
        // Получаем статистику модерации
        const mutesCount = await Mute.countDocuments({ addedAt: { $gte: yesterday } });
        const warnsCount = await Warn.countDocuments({ createdAt: { $gte: yesterday } });
        const bansCount = await Ban.countDocuments({ createdAt: { $gte: yesterday } });
        
        // Получаем общее количество действий
        const totalActions = mutesCount + warnsCount + bansCount;
        
        // Получаем статистику по модераторам
        const moderatorStats = await getModeratorsStats(yesterday);
        
        // Получаем статистику нарушений по часам
        const hourlyStats = await getHourlyStats(yesterday);
        
        // Создаем вложение с графиком
        const chartAttachment = await createHourlyChart(hourlyStats);
        
        // Создаем эмбед с отчетом
        const embed = new EmbedBuilder()
            .setTitle('📊 Ежедневный отчет модерации')
            .setDescription(`Отчет за период: **${moment(yesterday).format('DD.MM.YYYY HH:mm')}** - **${moment().format('DD.MM.YYYY HH:mm')}**`)
            .addFields(
                { name: '🔄 Всего действий', value: totalActions.toString(), inline: true },
                { name: '🔇 Муты', value: mutesCount.toString(), inline: true },
                { name: '⚠️ Предупреждения', value: warnsCount.toString(), inline: true },
                { name: '🔨 Баны', value: bansCount.toString(), inline: true }
            )
            .setColor('#3498db')
            .setTimestamp()
            .setFooter({ text: 'Система отчетов модерации' });
        
        // Добавляем информацию о модераторах
        if (moderatorStats.length > 0) {
            let moderatorsField = '';
            moderatorStats.slice(0, 5).forEach((mod, index) => {
                moderatorsField += `${index + 1}. <@${mod.moderatorId}>: **${mod.actions}** действий\n`;
            });
            
            embed.addFields({ name: '👮 Топ модераторы', value: moderatorsField });
        } else {
            embed.addFields({ name: '👮 Модераторы', value: 'Нет данных за этот период' });
        }
        
        // Отправляем отчет с графиком
        await reportChannel.send({ 
            embeds: [embed],
            files: [chartAttachment]
        });
        
        console.log('Ежедневный отчет модерации успешно отправлен');
    } catch (error) {
        console.error('Ошибка при создании ежедневного отчета:', error);
    }
}

/**
 * Генерирует и отправляет еженедельный отчет о модерации
 * @param {Client} client - Клиент Discord.js
 */
async function generateWeeklyReport(client) {
    try {
        // Получаем канал для отчетов
        const reportChannel = await client.channels.fetch(REPORT_CHANNEL_ID).catch(console.error);
        if (!reportChannel) {
            console.error(`Канал для отчетов ${REPORT_CHANNEL_ID} не найден`);
            return;
        }
        
        // Получаем данные за последнюю неделю
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        
        // Получаем статистику модерации
        const mutesCount = await Mute.countDocuments({ addedAt: { $gte: weekAgo } });
        const warnsCount = await Warn.countDocuments({ createdAt: { $gte: weekAgo } });
        const bansCount = await Ban.countDocuments({ createdAt: { $gte: weekAgo } });
        
        // Получаем общее количество действий
        const totalActions = mutesCount + warnsCount + bansCount;
        
        // Получаем статистику по модераторам
        const moderatorStats = await getModeratorsStats(weekAgo);
        
        // Получаем статистику по дням недели
        const dailyStats = await getDailyStats(weekAgo);
        
        // Создаем вложение с графиком
        const chartAttachment = await createDailyChart(dailyStats);
        
        // Создаем эмбед с отчетом
        const embed = new EmbedBuilder()
            .setTitle('📈 Еженедельный отчет модерации')
            .setDescription(`Отчет за период: **${moment(weekAgo).format('DD.MM.YYYY')}** - **${moment().format('DD.MM.YYYY')}**`)
            .addFields(
                { name: '🔄 Всего действий', value: totalActions.toString(), inline: true },
                { name: '🔇 Муты', value: mutesCount.toString(), inline: true },
                { name: '⚠️ Предупреждения', value: warnsCount.toString(), inline: true },
                { name: '🔨 Баны', value: bansCount.toString(), inline: true }
            )
            .setColor('#9b59b6')
            .setTimestamp()
            .setFooter({ text: 'Система отчетов модерации' });
        
        // Добавляем информацию о модераторах
        if (moderatorStats.length > 0) {
            let moderatorsField = '';
            moderatorStats.slice(0, 5).forEach((mod, index) => {
                moderatorsField += `${index + 1}. <@${mod.moderatorId}>: **${mod.actions}** действий\n`;
            });
            
            embed.addFields({ name: '👮 Топ модераторы недели', value: moderatorsField });
        } else {
            embed.addFields({ name: '👮 Модераторы', value: 'Нет данных за этот период' });
        }
        
        // Добавляем информацию о самых активных днях
        const mostActiveDay = [...dailyStats].sort((a, b) => b.total - a.total)[0];
        if (mostActiveDay) {
            embed.addFields({ 
                name: '📅 Самый активный день', 
                value: `**${getDayName(mostActiveDay.day)}**: ${mostActiveDay.total} действий` 
            });
        }
        
        // Отправляем отчет с графиком
        await reportChannel.send({ 
            embeds: [embed],
            files: [chartAttachment] 
        });
        
        console.log('Еженедельный отчет модерации успешно отправлен');
    } catch (error) {
        console.error('Ошибка при создании еженедельного отчета:', error);
    }
}

/**
 * Генерирует и отправляет отчет о модерации по пользователю
 * @param {Client} client - Клиент Discord.js
 * @param {string} userId - ID пользователя
 * @param {string} guildId - ID сервера
 * @param {string} requestedBy - ID пользователя, запросившего отчет
 */
async function generateUserReport(client, userId, guildId, requestedBy) {
    try {
        // Получаем канал для отчетов
        const reportChannel = await client.channels.fetch(REPORT_CHANNEL_ID).catch(console.error);
        if (!reportChannel) {
            console.error(`Канал для отчетов ${REPORT_CHANNEL_ID} не найден`);
            return;
        }
        
        // Получаем данные пользователя
        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            console.error(`Сервер ${guildId} не найден`);
            return;
        }
        
        // Пытаемся получить участника (может отсутствовать, если пользователь покинул сервер)
        const member = await guild.members.fetch(userId).catch(() => null);
        const user = member ? member.user : await client.users.fetch(userId).catch(() => null);
        
        if (!user) {
            console.error(`Пользователь ${userId} не найден`);
            return;
        }
        
        // Получаем историю модерации
        const warnings = await Warn.find({ userId, guildId }).sort({ createdAt: -1 }).limit(10);
        const mutes = await Mute.find({ userId, guildId }).sort({ addedAt: -1 }).limit(10);
        const bans = await Ban.find({ userId, guildId }).sort({ createdAt: -1 }).limit(5);
        
        // Создаем эмбед с отчетом
        const embed = new EmbedBuilder()
            .setTitle(`👤 Отчет модерации: ${user.tag}`)
            .setDescription(`Отчет о действиях модерации для пользователя <@${userId}>`)
            .setThumbnail(user.displayAvatarURL({ dynamic: true }))
            .setColor('#e74c3c')
            .setTimestamp()
            .setFooter({ text: `Запрошено: ${requestedBy}` });
        
        // Добавляем информацию о предупреждениях
        if (warnings.length > 0) {
            let warningsField = '';
            warnings.forEach((warn, index) => {
                const date = moment(warn.createdAt).format('DD.MM.YYYY');
                warningsField += `${index + 1}. **${date}**: ${warn.reason || 'Нет причины'}\n`;
            });
            
            embed.addFields({ name: `⚠️ Предупреждения (${warnings.length})`, value: warningsField });
        } else {
            embed.addFields({ name: '⚠️ Предупреждения', value: 'Нет предупреждений' });
        }
        
        // Добавляем информацию о мутах
        if (mutes.length > 0) {
            let mutesField = '';
            mutes.forEach((mute, index) => {
                const date = moment(mute.addedAt).format('DD.MM.YYYY');
                const duration = moment.duration(new Date(mute.expiresAt) - new Date(mute.addedAt)).humanize();
                mutesField += `${index + 1}. **${date}** (${duration}): ${mute.reason || 'Нет причины'}\n`;
            });
            
            embed.addFields({ name: `🔇 Муты (${mutes.length})`, value: mutesField });
        } else {
            embed.addFields({ name: '🔇 Муты', value: 'Нет мутов' });
        }
        
        // Добавляем информацию о банах
        if (bans.length > 0) {
            let bansField = '';
            bans.forEach((ban, index) => {
                const date = moment(ban.createdAt).format('DD.MM.YYYY');
                bansField += `${index + 1}. **${date}**: ${ban.reason || 'Нет причины'}\n`;
            });
            
            embed.addFields({ name: `🔨 Баны (${bans.length})`, value: bansField });
        } else {
            embed.addFields({ name: '🔨 Баны', value: 'Нет банов' });
        }
        
        // Отправляем отчет
        await reportChannel.send({ embeds: [embed] });
        
        console.log(`Отчет модерации для пользователя ${user.tag} успешно отправлен`);
    } catch (error) {
        console.error('Ошибка при создании отчета по пользователю:', error);
    }
}

/**
 * Получает статистику по модераторам за указанный период
 * @param {Date} startDate - Начальная дата периода
 * @returns {Array} - Массив с данными по модераторам
 */
async function getModeratorsStats(startDate) {
    try {
        // Создаем объект для хранения статистики
        const moderators = new Map();
        
        // Получаем данные о мутах
        const mutes = await Mute.find({ addedAt: { $gte: startDate } });
        mutes.forEach(mute => {
            if (!mute.addedBy || mute.addedBy === 'SYSTEM') return;
            
            const modId = mute.addedBy;
            if (!moderators.has(modId)) {
                moderators.set(modId, { 
                    moderatorId: modId, 
                    actions: 0, 
                    mutes: 0, 
                    warns: 0, 
                    bans: 0 
                });
            }
            
            const modStats = moderators.get(modId);
            modStats.actions++;
            modStats.mutes++;
        });
        
        // Получаем данные о предупреждениях
        const warns = await Warn.find({ createdAt: { $gte: startDate } });
        warns.forEach(warn => {
            if (!warn.moderatorId) return;
            
            const modId = warn.moderatorId;
            if (!moderators.has(modId)) {
                moderators.set(modId, { 
                    moderatorId: modId, 
                    actions: 0, 
                    mutes: 0, 
                    warns: 0, 
                    bans: 0 
                });
            }
            
            const modStats = moderators.get(modId);
            modStats.actions++;
            modStats.warns++;
        });
        
        // Получаем данные о банах
        const bans = await Ban.find({ createdAt: { $gte: startDate } });
        bans.forEach(ban => {
            if (!ban.moderatorId) return;
            
            const modId = ban.moderatorId;
            if (!moderators.has(modId)) {
                moderators.set(modId, { 
                    moderatorId: modId, 
                    actions: 0, 
                    mutes: 0, 
                    warns: 0, 
                    bans: 0 
                });
            }
            
            const modStats = moderators.get(modId);
            modStats.actions++;
            modStats.bans++;
        });
        
        // Преобразуем Map в массив и сортируем по количеству действий
        return Array.from(moderators.values())
            .sort((a, b) => b.actions - a.actions);
    } catch (error) {
        console.error('Ошибка при получении статистики модераторов:', error);
        return [];
    }
}

/**
 * Получает статистику нарушений по часам за указанный период
 * @param {Date} startDate - Начальная дата периода
 * @returns {Array} - Массив с данными по часам
 */
async function getHourlyStats(startDate) {
    try {
        // Инициализируем массив для часов (0-23)
        const hours = Array(24).fill().map((_, hour) => ({
            hour,
            mutes: 0,
            warns: 0,
            bans: 0,
            total: 0
        }));
        
        // Получаем данные о мутах
        const mutes = await Mute.find({ addedAt: { $gte: startDate } });
        mutes.forEach(mute => {
            const hour = new Date(mute.addedAt).getHours();
            hours[hour].mutes++;
            hours[hour].total++;
        });
        
        // Получаем данные о предупреждениях
        const warns = await Warn.find({ createdAt: { $gte: startDate } });
        warns.forEach(warn => {
            const hour = new Date(warn.createdAt).getHours();
            hours[hour].warns++;
            hours[hour].total++;
        });
        
        // Получаем данные о банах
        const bans = await Ban.find({ createdAt: { $gte: startDate } });
        bans.forEach(ban => {
            const hour = new Date(ban.createdAt).getHours();
            hours[hour].bans++;
            hours[hour].total++;
        });
        
        return hours;
    } catch (error) {
        console.error('Ошибка при получении почасовой статистики:', error);
        return Array(24).fill().map((_, hour) => ({
            hour,
            mutes: 0,
            warns: 0,
            bans: 0,
            total: 0
        }));
    }
}

/**
 * Получает статистику по дням недели за указанный период
 * @param {Date} startDate - Начальная дата периода
 * @returns {Array} - Массив с данными по дням недели
 */
async function getDailyStats(startDate) {
    try {
        // Инициализируем массив для дней недели (0-6, где 0 - воскресенье)
        const days = Array(7).fill().map((_, day) => ({
            day,
            mutes: 0,
            warns: 0,
            bans: 0,
            total: 0
        }));
        
        // Получаем данные о мутах
        const mutes = await Mute.find({ addedAt: { $gte: startDate } });
        mutes.forEach(mute => {
            const day = new Date(mute.addedAt).getDay();
            days[day].mutes++;
            days[day].total++;
        });
        
        // Получаем данные о предупреждениях
        const warns = await Warn.find({ createdAt: { $gte: startDate } });
        warns.forEach(warn => {
            const day = new Date(warn.createdAt).getDay();
            days[day].warns++;
            days[day].total++;
        });
        
        // Получаем данные о банах
        const bans = await Ban.find({ createdAt: { $gte: startDate } });
        bans.forEach(ban => {
            const day = new Date(ban.createdAt).getDay();
            days[day].bans++;
            days[day].total++;
        });
        
        return days;
    } catch (error) {
        console.error('Ошибка при получении статистики по дням недели:', error);
        return Array(7).fill().map((_, day) => ({
            day,
            mutes: 0,
            warns: 0,
            bans: 0,
            total: 0
        }));
    }
}

/**
 * Создает график по часам
 * @param {Array} hourlyStats - Данные по часам
 * @returns {AttachmentBuilder} - Вложение с графиком
 */
async function createHourlyChart(hourlyStats) {
    // Создаем холст для графика
    const canvas = createCanvas(800, 400);
    const ctx = canvas.getContext('2d');
    
    // Заполняем фон
    ctx.fillStyle = '#2f3136';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Настраиваем стили
    ctx.font = '14px Arial';
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#4f545c';
    
    // Находим максимальное значение для масштабирования
    const maxValue = Math.max(...hourlyStats.map(hour => hour.total));
    const scale = maxValue === 0 ? 1 : (canvas.height - 100) / maxValue;
    
    // Рисуем оси
    ctx.beginPath();
    ctx.moveTo(50, 50);
    ctx.lineTo(50, canvas.height - 50);
    ctx.lineTo(canvas.width - 50, canvas.height - 50);
    ctx.stroke();
    
    // Рисуем подписи часов
    const barWidth = (canvas.width - 100) / 24;
    hourlyStats.forEach((hour, index) => {
        ctx.fillText(index.toString(), 50 + index * barWidth + barWidth / 2 - 5, canvas.height - 30);
    });
    
    // Рисуем баны
    ctx.fillStyle = '#e74c3c';
    hourlyStats.forEach((hour, index) => {
        if (hour.bans > 0) {
            const height = hour.bans * scale;
            ctx.fillRect(
                50 + index * barWidth + 2,
                canvas.height - 50 - height,
                barWidth - 4,
                height
            );
        }
    });
    
    // Рисуем предупреждения
    ctx.fillStyle = '#f1c40f';
    hourlyStats.forEach((hour, index) => {
        if (hour.warns > 0) {
            const height = hour.warns * scale;
            ctx.fillRect(
                50 + index * barWidth + 2,
                canvas.height - 50 - height - (hour.bans * scale),
                barWidth - 4,
                height
            );
        }
    });
    
    // Рисуем муты
    ctx.fillStyle = '#3498db';
    hourlyStats.forEach((hour, index) => {
        if (hour.mutes > 0) {
            const height = hour.mutes * scale;
            ctx.fillRect(
                50 + index * barWidth + 2,
                canvas.height - 50 - height - (hour.bans * scale) - (hour.warns * scale),
                barWidth - 4,
                height
            );
        }
    });
    
    // Рисуем легенду
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Модерация по часам (UTC+3)', canvas.width / 2 - 100, 30);
    
    // Легенда цветов
    ctx.fillStyle = '#3498db';
    ctx.fillRect(canvas.width - 150, 70, 20, 20);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Муты', canvas.width - 120, 85);
    
    ctx.fillStyle = '#f1c40f';
    ctx.fillRect(canvas.width - 150, 100, 20, 20);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Предупреждения', canvas.width - 120, 115);
    
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(canvas.width - 150, 130, 20, 20);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Баны', canvas.width - 120, 145);
    
    // Создаем буфер изображения
    const buffer = canvas.toBuffer('image/png');
    
    // Возвращаем вложение
    return new AttachmentBuilder(buffer, { name: 'hourly-moderation.png' });
}

/**
 * Создает график по дням недели
 * @param {Array} dailyStats - Данные по дням недели
 * @returns {AttachmentBuilder} - Вложение с графиком
 */
async function createDailyChart(dailyStats) {
    // Создаем холст для графика
    const canvas = createCanvas(800, 400);
    const ctx = canvas.getContext('2d');
    
    // Заполняем фон
    ctx.fillStyle = '#2f3136';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Настраиваем стили
    ctx.font = '14px Arial';
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#4f545c';
    
    // Находим максимальное значение для масштабирования
    const maxValue = Math.max(...dailyStats.map(day => day.total));
    const scale = maxValue === 0 ? 1 : (canvas.height - 100) / maxValue;
    
    // Рисуем оси
    ctx.beginPath();
    ctx.moveTo(50, 50);
    ctx.lineTo(50, canvas.height - 50);
    ctx.lineTo(canvas.width - 50, canvas.height - 50);
    ctx.stroke();
    
    // Рисуем подписи дней недели
    const barWidth = (canvas.width - 100) / 7;
    const dayNames = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'];
    dailyStats.forEach((day, index) => {
        ctx.fillText(dayNames[index], 50 + index * barWidth + barWidth / 2 - 10, canvas.height - 30);
    });
    
    // Рисуем баны
    ctx.fillStyle = '#e74c3c';
    dailyStats.forEach((day, index) => {
        if (day.bans > 0) {
            const height = day.bans * scale;
            ctx.fillRect(
                50 + index * barWidth + 5,
                canvas.height - 50 - height,
                barWidth - 10,
                height
            );
        }
    });
    
    // Рисуем предупреждения
    ctx.fillStyle = '#f1c40f';
    dailyStats.forEach((day, index) => {
        if (day.warns > 0) {
            const height = day.warns * scale;
            ctx.fillRect(
                50 + index * barWidth + 5,
                canvas.height - 50 - height - (day.bans * scale),
                barWidth - 10,
                height
            );
        }
    });
    
    // Рисуем муты
    ctx.fillStyle = '#3498db';
    dailyStats.forEach((day, index) => {
        if (day.mutes > 0) {
            const height = day.mutes * scale;
            ctx.fillRect(
                50 + index * barWidth + 5,
                canvas.height - 50 - height - (day.bans * scale) - (day.warns * scale),
                barWidth - 10,
                height
            );
        }
    });
    
    // Рисуем легенду
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Модерация по дням недели', canvas.width / 2 - 100, 30);
    
    // Легенда цветов
    ctx.fillStyle = '#3498db';
    ctx.fillRect(canvas.width - 150, 70, 20, 20);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Муты', canvas.width - 120, 85);
    
    ctx.fillStyle = '#f1c40f';
    ctx.fillRect(canvas.width - 150, 100, 20, 20);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Предупреждения', canvas.width - 120, 115);
    
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(canvas.width - 150, 130, 20, 20);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Баны', canvas.width - 120, 145);
    
    // Создаем буфер изображения
    const buffer = canvas.toBuffer('image/png');
    
    // Возвращаем вложение
    return new AttachmentBuilder(buffer, { name: 'daily-moderation.png' });
}

/**
 * Получает название дня недели
 * @param {number} day - Номер дня недели (0-6)
 * @returns {string} - Название дня недели
 */
function getDayName(day) {
    const days = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
    return days[day] || 'Неизвестно';
}

module.exports = {
    generateDailyReport,
    generateWeeklyReport,
    generateUserReport
}; 