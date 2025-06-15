const { EmbedBuilder } = require('discord.js');
const banwords = require('../models/banwords');
const { RiskPoints } = require('../models/schema');

// Глобальная переменная для включения/отключения автомодерации
let autoModerationEnabled = true;

/**
 * Включает или отключает систему автомодерации
 * @param {boolean} enabled - Включить (true) или отключить (false) автомодерацию
 * @returns {boolean} - Новое состояние автомодерации
 */
function toggleAutoModeration(enabled) {
    if (enabled !== undefined) {
        autoModerationEnabled = !!enabled;
    } else {
        autoModerationEnabled = !autoModerationEnabled;
    }
    return autoModerationEnabled;
}

/**
 * Проверяет, включена ли автомодерация
 * @returns {boolean} - Текущее состояние автомодерации
 */
function isAutoModerationEnabled() {
    return autoModerationEnabled;
}

/**
 * Проверка сообщения на запрещенные слова
 * @param {Object} message - Объект сообщения Discord
 * @returns {boolean} - Было ли сообщение обработано модерацией
 */
async function checkBannedWords(message) {
    // Проверяем, включена ли автомодерация
    if (!autoModerationEnabled) return false;
    
    // Игнорируем сообщения от ботов
    if (message.author.bot) return false;
    
    // Приводим сообщение к нижнему регистру для проверки
    const messageContent = message.content.toLowerCase();
    
    // Проверка на банворды первой очереди (сильные нарушения)
    for (const word of banwords.tier1) {
        if (messageContent.includes(word)) {
            try {
                // Удаляем сообщение
                await message.delete();
                
                // Выдаем мут на 2 часа
                const targetMember = message.member;
                await targetMember.timeout(2 * 60 * 60 * 1000, `Автоматический мут за запрещенное слово: ${word}`);
                
                // Уведомление в канал
                await message.channel.send(
                    `${message.author}, ваше сообщение было удалено за использование запрещенного слова '${word}'. ` +
                    `Вы замучены на 2 часа.`
                );
                
                // Добавляем риск-очки
                await addRiskPoints(message.author.id, message.guild.id, 10, 
                    `Использование запрещенного слова (Tier 1): ${word}`);
                
                return true;
            } catch (error) {
                console.error('Ошибка при модерации запрещенных слов Tier 1:', error);
            }
        }
    }
    
    // Проверка на банворды второй очереди (менее серьезные нарушения)
    for (const word of banwords.tier2) {
        if (messageContent.includes(word)) {
            try {
                // Удаляем сообщение
                await message.delete();
                
                // Уведомление в канал
                await message.channel.send(
                    `${message.author}, ваше сообщение было удалено за использование запрещенного слова '${word}'.`
                );
                
                // Добавляем риск-очки
                await addRiskPoints(message.author.id, message.guild.id, 5, 
                    `Использование запрещенного слова (Tier 2): ${word}`);
                
                return true;
            } catch (error) {
                console.error('Ошибка при модерации запрещенных слов Tier 2:', error);
            }
        }
    }
    
    return false;
}

/**
 * Проверка сообщения на спам, флуд и массовые упоминания
 * @param {Object} message - Объект сообщения Discord
 * @returns {boolean} - Было ли сообщение обработано модерацией
 */
async function checkSpamAndMentions(message) {
    // Проверяем, включена ли автомодерация
    if (!autoModerationEnabled) return false;
    
    // Игнорируем сообщения от ботов
    if (message.author.bot) return false;
    
    // Проверка на массовые упоминания
    if (message.mentions.users.size > 5) {
        try {
            // Удаляем сообщение
            await message.delete();
            
            // Выдаем мут на 30 минут
            const targetMember = message.member;
            await targetMember.timeout(30 * 60 * 1000, 'Автоматический мут за массовые упоминания');
            
            // Уведомление в канал
            await message.channel.send(
                `${message.author}, ваше сообщение было удалено за массовые упоминания. ` +
                `Вы замучены на 30 минут.`
            );
            
            // Добавляем риск-очки
            await addRiskPoints(message.author.id, message.guild.id, 7, 
                'Массовые упоминания пользователей');
            
            return true;
        } catch (error) {
            console.error('Ошибка при модерации массовых упоминаний:', error);
        }
    }
    
    // Проверка на спам (будет отдельная логика)
    
    return false;
}

/**
 * Проверка сообщения на наличие приглашений и ссылок
 * @param {Object} message - Объект сообщения Discord
 * @returns {boolean} - Было ли сообщение обработано модерацией
 */
async function checkInvitesAndLinks(message) {
    // Проверяем, включена ли автомодерация
    if (!autoModerationEnabled) return false;
    
    // Игнорируем сообщения от ботов и сообщения от модераторов
    if (message.author.bot) return false;
    
    // Регулярные выражения для проверки
    const invitePattern = /(discord\.gg\/|discordapp\.com\/invite\/|discord\.com\/invite\/)[a-zA-Z0-9]+/i;
    const linkPattern = /(https?:\/\/[^\s]+)/g;
    
    // Проверка на приглашения Discord
    if (invitePattern.test(message.content)) {
        try {
            // Удаляем сообщение
            await message.delete();
            
            // Выдаем мут на 1 час
            const targetMember = message.member;
            await targetMember.timeout(60 * 60 * 1000, 'Автоматический мут за ссылку-приглашение');
            
            // Уведомление в канал
            await message.channel.send(
                `${message.author}, ваше сообщение было удалено за использование приглашения на другой сервер. ` +
                `Вы замучены на 1 час.`
            );
            
            // Добавляем риск-очки
            await addRiskPoints(message.author.id, message.guild.id, 8, 
                'Отправка приглашения на другой сервер');
            
            return true;
        } catch (error) {
            console.error('Ошибка при модерации приглашений:', error);
        }
    }
    
    // Вы можете включить или отключить проверку ссылок, по умолчанию отключена
    // Логика для проверки ссылок:
    /*
    const links = message.content.match(linkPattern);
    if (links) {
        try {
            // Удаляем сообщение
            await message.delete();
            
            // Уведомление в канал
            await message.channel.send(
                `${message.author}, ваше сообщение было удалено за использование ссылок. ` +
                `Ссылки запрещены.`
            );
            
            // Добавляем риск-очки
            await addRiskPoints(message.author.id, message.guild.id, 3, 
                'Отправка внешних ссылок');
            
            return true;
        } catch (error) {
            console.error('Ошибка при модерации ссылок:', error);
        }
    }
    */
    
    return false;
}

/**
 * Добавление риск-очков пользователю
 * @param {string} userId - ID пользователя
 * @param {string} guildId - ID сервера
 * @param {number} points - Количество риск-очков
 * @param {string} reason - Причина
 */
async function addRiskPoints(userId, guildId, points, reason) {
    try {
        // Добавляем баллы риска в базу данных
        await RiskPoints.findOneAndUpdate(
            { userId, guildId },
            { 
                $inc: { totalPoints: points },
                $push: { 
                    history: {
                        points,
                        reason,
                        timestamp: new Date()
                    }
                }
            },
            { upsert: true }
        );
    } catch (error) {
        console.error('Ошибка при добавлении риск-очков:', error);
    }
}

module.exports = {
    checkBannedWords,
    checkSpamAndMentions,
    checkInvitesAndLinks,
    addRiskPoints,
    toggleAutoModeration,
    isAutoModerationEnabled
}; 