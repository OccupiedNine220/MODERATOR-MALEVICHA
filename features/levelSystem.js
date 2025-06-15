const { EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
const { User } = require('../models/schema');

// Константы для системы уровней
const XP_PER_MESSAGE = 15; // Базовое количество XP за сообщение
const XP_COOLDOWN = 60000; // Кулдаун между начислениями XP (1 минута)
const VOICE_XP_INTERVAL = 5 * 60000; // Интервал начисления XP за голосовой канал (5 минут)
const VOICE_XP_AMOUNT = 25; // Количество XP за каждый интервал в голосовом канале

// Карта для отслеживания кулдаунов XP пользователей
const xpCooldowns = new Map();
// Карта для отслеживания пользователей в голосовых каналах
const voiceUsers = new Map();

/**
 * Рассчитывает необходимое количество XP для уровня
 * @param {number} level - Текущий уровень
 * @returns {number} - Необходимое количество XP
 */
function calculateRequiredXP(level) {
    return 5 * (level ** 2) + 50 * level + 100;
}

/**
 * Рассчитывает уровень на основе общего XP
 * @param {number} xp - Общий опыт пользователя
 * @returns {object} - Текущий уровень и процент до следующего
 */
function calculateLevel(xp) {
    let level = 0;
    let xpForNextLevel = calculateRequiredXP(level);
    
    while (xp >= xpForNextLevel) {
        xp -= xpForNextLevel;
        level++;
        xpForNextLevel = calculateRequiredXP(level);
    }
    
    const percentage = Math.floor((xp / xpForNextLevel) * 100);
    
    return {
        level,
        currentXP: xp,
        requiredXP: xpForNextLevel,
        percentage
    };
}

/**
 * Начисляет XP пользователю за сообщение
 * @param {Object} message - Объект сообщения
 * @returns {Object|null} - Объект с информацией о повышении уровня или null
 */
async function addMessageXP(message) {
    const { author, guild } = message;
    
    // Проверяем, не бот ли это и на кулдаун
    if (author.bot || !guild) return null;
    
    const userId = author.id;
    const guildId = guild.id;
    
    // Проверка кулдауна
    const userCooldownKey = `${userId}-${guildId}`;
    if (xpCooldowns.has(userCooldownKey)) {
        const expirationTime = xpCooldowns.get(userCooldownKey);
        if (Date.now() < expirationTime) return null;
    }
    
    // Устанавливаем кулдаун
    xpCooldowns.set(userCooldownKey, Date.now() + XP_COOLDOWN);
    
    try {
        // Получаем или создаем запись пользователя
        let userRecord = await User.findOne({ userId, guildId });
        
        if (!userRecord) {
            userRecord = new User({
                userId,
                guildId,
                xp: 0,
                level: 0,
                messages: 0,
                voiceTime: 0
            });
        }
        
        // Начисляем XP и обновляем количество сообщений
        const oldLevel = userRecord.level;
        userRecord.xp += XP_PER_MESSAGE;
        userRecord.messages += 1;
        
        // Рассчитываем новый уровень
        const levelInfo = calculateLevel(userRecord.xp);
        userRecord.level = levelInfo.level;
        
        // Сохраняем изменения
        await userRecord.save();
        
        // Если уровень повысился, возвращаем информацию
        if (levelInfo.level > oldLevel) {
            try {
                await sendLevelUpNotification(guild, await guild.members.fetch(userId), levelInfo.level);
            } catch (error) {
                console.error('Ошибка при отправке уведомления о повышении уровня:', error);
            }
            
            return {
                member: await guild.members.fetch(userId),
                newLevel: levelInfo.level,
                oldLevel
            };
        }
        
        return null;
    } catch (error) {
        console.error('Ошибка при начислении XP за сообщение:', error);
        return null;
    }
}

/**
 * Начинает отслеживание пользователя в голосовом канале
 * @param {Object} member - Объект участника
 * @param {Object} state - Объект состояния голосового канала
 */
function trackVoiceChannel(member, state) {
    if (member.user.bot) return;
    
    const userId = member.id;
    const guildId = member.guild.id;
    const userKey = `${userId}-${guildId}`;
    
    // Если пользователь присоединился к каналу и не отслеживается
    if (state.channel && !state.deaf && !state.mute && !voiceUsers.has(userKey)) {
        // Начинаем отслеживание и заносим таймер в карту
        voiceUsers.set(userKey, {
            startTime: Date.now(),
            interval: setInterval(async () => {
                await addVoiceXP(member);
            }, VOICE_XP_INTERVAL)
        });
    } 
    // Если пользователь покинул канал и отслеживается
    else if ((!state.channel || state.deaf || state.mute) && voiceUsers.has(userKey)) {
        const userData = voiceUsers.get(userKey);
        
        // Останавливаем интервал и удаляем из карты
        clearInterval(userData.interval);
        voiceUsers.delete(userKey);
        
        // Записываем общее время в голосовом канале
        const voiceTime = Math.floor((Date.now() - userData.startTime) / 60000); // в минутах
        updateVoiceTime(member, voiceTime);
    }
}

/**
 * Обновляет время, проведенное в голосовом канале
 * @param {Object} member - Объект участника
 * @param {number} minutes - Количество минут
 */
async function updateVoiceTime(member, minutes) {
    try {
        const userId = member.id;
        const guildId = member.guild.id;
        
        let userRecord = await User.findOne({ userId, guildId });
        
        if (!userRecord) {
            userRecord = new User({
                userId,
                guildId,
                xp: 0,
                level: 0,
                messages: 0,
                voiceTime: minutes
            });
        } else {
            userRecord.voiceTime += minutes;
        }
        
        await userRecord.save();
    } catch (error) {
        console.error('Ошибка при обновлении времени в голосовом канале:', error);
    }
}

/**
 * Начисляет XP за время в голосовом канале
 * @param {Object} member - Объект участника
 */
async function addVoiceXP(member) {
    try {
        const userId = member.id;
        const guildId = member.guild.id;
        
        let userRecord = await User.findOne({ userId, guildId });
        
        if (!userRecord) {
            userRecord = new User({
                userId,
                guildId,
                xp: VOICE_XP_AMOUNT,
                level: 0,
                messages: 0,
                voiceTime: 0
            });
        } else {
            userRecord.xp += VOICE_XP_AMOUNT;
        }
        
        // Рассчитываем новый уровень
        const levelInfo = calculateLevel(userRecord.xp);
        const oldLevel = userRecord.level;
        userRecord.level = levelInfo.level;
        
        await userRecord.save();
        
        // Если уровень повысился, отправляем уведомление
        if (levelInfo.level > oldLevel) {
            try {
                await sendLevelUpNotification(member.guild, member, levelInfo.level);
            } catch (error) {
                console.error('Ошибка при отправке уведомления о повышении уровня:', error);
            }
        }
    } catch (error) {
        console.error('Ошибка при начислении XP за голосовой канал:', error);
    }
}

/**
 * Получает информацию о пользователе
 * @param {string} userId - ID пользователя
 * @param {string} guildId - ID сервера
 * @returns {Object|null} - Информация о пользователе или null
 */
async function getUserInfo(userId, guildId) {
    try {
        const userRecord = await User.findOne({ userId, guildId });
        
        if (!userRecord) return null;
        
        const levelInfo = calculateLevel(userRecord.xp);
        
        return {
            xp: userRecord.xp,
            level: levelInfo.level,
            currentXP: levelInfo.currentXP,
            requiredXP: levelInfo.requiredXP,
            percentage: levelInfo.percentage,
            messages: userRecord.messages,
            voiceTime: userRecord.voiceTime
        };
    } catch (error) {
        console.error('Ошибка при получении информации о пользователе:', error);
        return null;
    }
}

/**
 * Получает таблицу лидеров сервера
 * @param {string} guildId - ID сервера
 * @param {number} limit - Лимит записей (по умолчанию 10)
 * @returns {Array|null} - Массив пользователей или null
 */
async function getLeaderboard(guildId, limit = 10) {
    try {
        const users = await User.find({ guildId })
            .sort({ xp: -1 })
            .limit(limit);
        
        return users.map(user => ({
            userId: user.userId,
            xp: user.xp,
            level: calculateLevel(user.xp).level,
            messages: user.messages,
            voiceTime: user.voiceTime
        }));
    } catch (error) {
        console.error('Ошибка при получении таблицы лидеров:', error);
        return null;
    }
}

/**
 * Отправляет уведомление о повышении уровня
 * @param {Object} guild - Объект сервера
 * @param {Object} member - Объект участника
 * @param {number} level - Новый уровень
 */
async function sendLevelUpNotification(guild, member, level) {
    try {
        const levelChannel = guild.channels.cache.get('1381912160552357969');
        if (levelChannel) {
            const embed = new EmbedBuilder()
                .setTitle('🎉 Повышение уровня!')
                .setDescription(`${member} повысил свой уровень до **${level}**!`)
                .setColor('#00ff00')
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                .setTimestamp();
            
            await levelChannel.send({ embeds: [embed] });
        }
    } catch (error) {
        console.error('Ошибка при отправке уведомления о повышении уровня:', error);
    }
}

module.exports = {
    addMessageXP,
    trackVoiceChannel,
    getUserInfo,
    getLeaderboard,
    calculateLevel
}; 