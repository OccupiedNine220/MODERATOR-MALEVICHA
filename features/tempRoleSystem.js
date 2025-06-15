const { EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
const cron = require('node-cron');

// Предполагаем, что у нас есть модель TempRole
const { TempRole } = require('../models/schema');

// Создаем коллекцию таймеров для отслеживания окончания срока ролей
const roleTimers = new Map();

/**
 * Инициализирует систему временных ролей, загружает все существующие
 * @param {Client} client - Клиент Discord.js
 */
async function initTempRoleSystem(client) {
    try {
        // Загружаем все временные роли из БД
        const tempRoles = await TempRole.find({});
        
        for (const roleData of tempRoles) {
            const { guildId, userId, roleId, expiresAt } = roleData;
            
            // Проверяем, не истек ли уже срок
            if (new Date(expiresAt) <= new Date()) {
                await removeExpiredRole(client, roleData);
                continue;
            }
            
            // Устанавливаем таймер для роли
            setRoleTimer(client, roleData);
        }
        
        // Устанавливаем ежечасную проверку ролей
        cron.schedule('0 * * * *', async () => {
            await checkExpiredRoles(client);
        });
        
        console.log('Система временных ролей инициализирована');
    } catch (error) {
        console.error('Ошибка при инициализации системы временных ролей:', error);
    }
}

/**
 * Устанавливает таймер для удаления временной роли
 * @param {Client} client - Клиент Discord.js
 * @param {Object} roleData - Данные временной роли
 */
function setRoleTimer(client, roleData) {
    const { _id, guildId, userId, roleId, expiresAt } = roleData;
    
    // Вычисляем оставшееся время в миллисекундах
    const now = new Date();
    const expiry = new Date(expiresAt);
    const timeLeft = expiry - now;
    
    // Если срок уже истек, удаляем роль немедленно
    if (timeLeft <= 0) {
        removeExpiredRole(client, roleData);
        return;
    }
    
    // Устанавливаем таймер (максимум 24 часа - ограничение setTimeout)
    const timer = setTimeout(async () => {
        await removeExpiredRole(client, roleData);
    }, Math.min(timeLeft, 86400000)); // 24 часа в миллисекундах
    
    // Сохраняем таймер в карту
    roleTimers.set(_id.toString(), timer);
}

/**
 * Проверяет и удаляет истекшие временные роли
 * @param {Client} client - Клиент Discord.js
 */
async function checkExpiredRoles(client) {
    try {
        const now = new Date();
        
        // Находим все истекшие роли
        const expiredRoles = await TempRole.find({ expiresAt: { $lte: now } });
        
        for (const roleData of expiredRoles) {
            await removeExpiredRole(client, roleData);
        }
    } catch (error) {
        console.error('Ошибка при проверке истекших ролей:', error);
    }
}

/**
 * Удаляет истекшую временную роль
 * @param {Client} client - Клиент Discord.js
 * @param {Object} roleData - Данные временной роли
 */
async function removeExpiredRole(client, roleData) {
    const { _id, guildId, userId, roleId, expiresAt } = roleData;
    
    try {
        // Очищаем таймер, если он существует
        const timerId = _id.toString();
        if (roleTimers.has(timerId)) {
            clearTimeout(roleTimers.get(timerId));
            roleTimers.delete(timerId);
        }
        
        // Получаем сервер и участника
        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            console.warn(`Сервер ${guildId} не найден для удаления временной роли`);
            await TempRole.findByIdAndDelete(_id);
            return;
        }
        
        // Получаем участника
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) {
            console.warn(`Участник ${userId} не найден на сервере ${guild.name} для удаления временной роли`);
            await TempRole.findByIdAndDelete(_id);
            return;
        }
        
        // Получаем роль
        const role = guild.roles.cache.get(roleId);
        if (!role) {
            console.warn(`Роль ${roleId} не найдена на сервере ${guild.name} для удаления`);
            await TempRole.findByIdAndDelete(_id);
            return;
        }
        
        // Удаляем роль у участника
        await member.roles.remove(role, 'Срок временной роли истек');
        
        // Удаляем запись из БД
        await TempRole.findByIdAndDelete(_id);
        
        // Отправляем уведомление в логи
        await logRoleRemoval(guild, member, role);
        
        console.log(`Временная роль ${role.name} удалена у ${member.user.tag} на сервере ${guild.name}`);
    } catch (error) {
        console.error('Ошибка при удалении временной роли:', error);
    }
}

/**
 * Логирует удаление временной роли
 * @param {Guild} guild - Сервер Discord
 * @param {GuildMember} member - Участник Discord
 * @param {Role} role - Роль Discord
 */
async function logRoleRemoval(guild, member, role) {
    try {
        // Можно использовать уже существующую функцию логирования, если она есть
        const logChannel = guild.systemChannel;
        if (!logChannel) return;
        
        const embed = new EmbedBuilder()
            .setTitle('🕒 Временная роль удалена')
            .setDescription(`У участника ${member} была автоматически удалена роль ${role} по истечении срока`)
            .setColor('#ff9900')
            .setTimestamp();
        
        await logChannel.send({ embeds: [embed] });
    } catch (error) {
        console.error('Ошибка при логировании удаления временной роли:', error);
    }
}

/**
 * Добавляет временную роль участнику
 * @param {GuildMember} member - Участник Discord
 * @param {Role} role - Роль Discord
 * @param {number} duration - Продолжительность в миллисекундах
 * @param {string} reason - Причина выдачи роли
 * @returns {Object} - Результат операции
 */
async function addTempRole(member, role, duration, reason = 'Временная роль') {
    try {
        if (!member || !role) {
            return { success: false, message: 'Участник или роль не указаны' };
        }
        
        // Проверяем, может ли бот выдать эту роль
        if (!member.guild.members.me.permissions.has('ManageRoles') || 
            role.position >= member.guild.members.me.roles.highest.position) {
            return { 
                success: false, 
                message: 'У бота недостаточно прав для выдачи этой роли' 
            };
        }
        
        // Добавляем роль участнику
        await member.roles.add(role, reason);
        
        // Вычисляем время окончания
        const expiresAt = new Date(Date.now() + duration);
        
        // Создаем запись в БД
        const tempRole = new TempRole({
            guildId: member.guild.id,
            userId: member.id,
            roleId: role.id,
            roleName: role.name,
            reason,
            addedAt: new Date(),
            expiresAt,
            addedBy: reason.includes('Автоматически') ? 'SYSTEM' : null
        });
        
        await tempRole.save();
        
        // Устанавливаем таймер для роли
        setRoleTimer(member.client, tempRole);
        
        return { 
            success: true, 
            message: `Роль ${role.name} добавлена пользователю ${member.user.tag} до ${expiresAt.toLocaleString()}` 
        };
    } catch (error) {
        console.error('Ошибка при добавлении временной роли:', error);
        return { success: false, message: `Ошибка: ${error.message}` };
    }
}

/**
 * Удаляет временную роль вручную
 * @param {GuildMember} member - Участник Discord
 * @param {Role} role - Роль Discord
 * @param {string} reason - Причина удаления роли
 * @returns {Object} - Результат операции
 */
async function removeTempRole(member, role, reason = 'Удалено вручную') {
    try {
        if (!member || !role) {
            return { success: false, message: 'Участник или роль не указаны' };
        }
        
        // Проверяем, может ли бот удалить эту роль
        if (!member.guild.members.me.permissions.has('ManageRoles') || 
            role.position >= member.guild.members.me.roles.highest.position) {
            return { 
                success: false, 
                message: 'У бота недостаточно прав для удаления этой роли' 
            };
        }
        
        // Находим запись в БД
        const tempRole = await TempRole.findOne({ 
            guildId: member.guild.id,
            userId: member.id,
            roleId: role.id
        });
        
        if (!tempRole) {
            return { success: false, message: 'Временная роль не найдена в базе данных' };
        }
        
        // Очищаем таймер
        const timerId = tempRole._id.toString();
        if (roleTimers.has(timerId)) {
            clearTimeout(roleTimers.get(timerId));
            roleTimers.delete(timerId);
        }
        
        // Удаляем роль у участника
        await member.roles.remove(role, reason);
        
        // Удаляем запись из БД
        await TempRole.findByIdAndDelete(tempRole._id);
        
        return { 
            success: true, 
            message: `Временная роль ${role.name} удалена у пользователя ${member.user.tag}` 
        };
    } catch (error) {
        console.error('Ошибка при удалении временной роли:', error);
        return { success: false, message: `Ошибка: ${error.message}` };
    }
}

/**
 * Получает список всех временных ролей участника
 * @param {GuildMember} member - Участник Discord
 * @returns {Array} - Список временных ролей
 */
async function getMemberTempRoles(member) {
    try {
        const tempRoles = await TempRole.find({
            guildId: member.guild.id,
            userId: member.id
        });
        
        return tempRoles.map(role => ({
            roleId: role.roleId,
            roleName: role.roleName,
            expiresAt: role.expiresAt,
            reason: role.reason,
            addedAt: role.addedAt,
            timeLeft: new Date(role.expiresAt) - new Date()
        }));
    } catch (error) {
        console.error('Ошибка при получении временных ролей участника:', error);
        return [];
    }
}

/**
 * Обновляет время действия временной роли
 * @param {GuildMember} member - Участник Discord
 * @param {Role} role - Роль Discord
 * @param {number} newDuration - Новая продолжительность в миллисекундах
 * @returns {Object} - Результат операции
 */
async function updateTempRoleDuration(member, role, newDuration) {
    try {
        if (!member || !role) {
            return { success: false, message: 'Участник или роль не указаны' };
        }
        
        // Находим запись в БД
        const tempRole = await TempRole.findOne({ 
            guildId: member.guild.id,
            userId: member.id,
            roleId: role.id
        });
        
        if (!tempRole) {
            return { success: false, message: 'Временная роль не найдена в базе данных' };
        }
        
        // Очищаем существующий таймер
        const timerId = tempRole._id.toString();
        if (roleTimers.has(timerId)) {
            clearTimeout(roleTimers.get(timerId));
            roleTimers.delete(timerId);
        }
        
        // Обновляем время истечения
        const newExpiresAt = new Date(Date.now() + newDuration);
        tempRole.expiresAt = newExpiresAt;
        await tempRole.save();
        
        // Устанавливаем новый таймер
        setRoleTimer(member.client, tempRole);
        
        return { 
            success: true, 
            message: `Время действия роли ${role.name} обновлено до ${newExpiresAt.toLocaleString()}` 
        };
    } catch (error) {
        console.error('Ошибка при обновлении времени действия временной роли:', error);
        return { success: false, message: `Ошибка: ${error.message}` };
    }
}

module.exports = {
    initTempRoleSystem,
    addTempRole,
    removeTempRole,
    getMemberTempRoles,
    updateTempRoleDuration
}; 