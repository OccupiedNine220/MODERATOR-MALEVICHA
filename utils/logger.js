const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const moment = require('moment');

/**
 * Отправка лога в канал логов
 * @param {Object} guild - Объект сервера Discord
 * @param {string} message - Сообщение для логирования
 * @param {Object} options - Дополнительные параметры
 */
async function logAction(guild, message, options = {}) {
    const logChannel = guild.channels.cache.get(config.logChannelId);
    if (!logChannel) return;

    if (options.embed) {
        await logChannel.send({ embeds: [options.embed] });
    } else {
        const timestamp = moment().format('DD.MM.YYYY HH:mm:ss');
        await logChannel.send(`[${timestamp}] ${message}`);
    }
}

/**
 * Логирование модерационных действий
 * @param {Object} guild - Сервер Discord
 * @param {Object} moderator - Модератор
 * @param {Object} target - Цель модерации
 * @param {string} action - Действие (ban, kick, mute, etc.)
 * @param {string} reason - Причина
 */
async function logModeration(guild, moderator, target, action, reason, duration = null) {
    const colors = {
        ban: 0xFF0000,      // Красный
        kick: 0xFF9900,     // Оранжевый
        mute: 0xFFCC00,     // Желтый
        warn: 0x00CCFF,     // Голубой
        unmute: 0x00FF00,   // Зеленый
        unban: 0x00FF00     // Зеленый
    };
    
    const titles = {
        ban: '🔨 Бан участника',
        kick: '👢 Кик участника',
        mute: '🔇 Мут участника',
        warn: '⚠️ Предупреждение участника',
        unmute: '🔊 Размут участника',
        unban: '🔓 Разбан участника'
    };
    
    const embed = new EmbedBuilder()
        .setTitle(titles[action] || 'Модерационное действие')
        .setColor(colors[action] || 0x0099FF)
        .addFields(
            { name: 'Модератор', value: moderator.toString(), inline: true },
            { name: 'Пользователь', value: target.toString(), inline: true }
        )
        .setTimestamp();
    
    if (reason) {
        embed.addFields({ name: 'Причина', value: reason, inline: false });
    }
    
    if (duration) {
        embed.addFields({ name: 'Длительность', value: duration, inline: false });
    }
    
    if (target.user && target.user.displayAvatarURL) {
        embed.setThumbnail(target.user.displayAvatarURL({ dynamic: true }));
    }
    
    await logAction(guild, '', { embed });
}

/**
 * Логирование изменений сообщений
 * @param {Object} oldMessage - Старое сообщение
 * @param {Object} newMessage - Новое сообщение
 */
async function logMessageEdit(oldMessage, newMessage) {
    // Пропускаем сообщения от ботов и если содержимое не изменилось
    if (oldMessage.author.bot || oldMessage.content === newMessage.content) return;
    
    const embed = new EmbedBuilder()
        .setTitle('✏️ Сообщение отредактировано')
        .setColor(0x0099FF)
        .addFields(
            { name: 'Автор', value: oldMessage.author.toString(), inline: true },
            { name: 'Канал', value: oldMessage.channel.toString(), inline: true },
            { name: 'Старое сообщение', value: oldMessage.content.substring(0, 1024) || '*Пусто*', inline: false },
            { name: 'Новое сообщение', value: newMessage.content.substring(0, 1024) || '*Пусто*', inline: false }
        )
        .setTimestamp()
        .setFooter({ text: `ID: ${oldMessage.id}` });
    
    const messageUrl = `https://discord.com/channels/${oldMessage.guild.id}/${oldMessage.channel.id}/${oldMessage.id}`;
    embed.addFields({ name: 'Ссылка', value: `[Перейти к сообщению](${messageUrl})`, inline: false });
    
    await logAction(oldMessage.guild, '', { embed });
}

/**
 * Логирование удаления сообщений
 * @param {Object} message - Удаленное сообщение
 */
async function logMessageDelete(message) {
    // Пропускаем сообщения от ботов
    if (message.author.bot) return;
    
    const embed = new EmbedBuilder()
        .setTitle('🗑️ Сообщение удалено')
        .setColor(0xFF0000)
        .addFields(
            { name: 'Автор', value: message.author.toString(), inline: true },
            { name: 'Канал', value: message.channel.toString(), inline: true },
            { name: 'Содержимое', value: message.content.substring(0, 1024) || '*Пусто*', inline: false }
        )
        .setTimestamp()
        .setFooter({ text: `ID: ${message.id}` });
    
    if (message.attachments.size > 0) {
        let attachmentsList = [];
        message.attachments.forEach(attachment => {
            attachmentsList.push(`[${attachment.name}](${attachment.url})`);
        });
        embed.addFields({ name: 'Вложения', value: attachmentsList.join('\n').substring(0, 1024) || '*Нет*', inline: false });
    }
    
    await logAction(message.guild, '', { embed });
}

module.exports = {
    logAction,
    logModeration,
    logMessageEdit,
    logMessageDelete
}; 