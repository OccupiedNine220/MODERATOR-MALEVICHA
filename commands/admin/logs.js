const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { ActionLog } = require('../../models/schema');
const { searchLogs } = require('../../utils/advancedLogger');
const config = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('logs')
        .setDescription('Управление системой логирования')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('search')
                .setDescription('Поиск логов по фильтрам')
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('Тип действия')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Сообщения', value: 'message' },
                            { name: 'Команды', value: 'command' },
                            { name: 'Модерация', value: 'moderation' },
                            { name: 'Система', value: 'system' },
                            { name: 'Ошибки', value: 'error' },
                            { name: 'Безопасность', value: 'security' }
                        ))
                .addStringOption(option =>
                    option.setName('user')
                        .setDescription('ID пользователя')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('channel')
                        .setDescription('ID канала')
                        .setRequired(false))
                .addIntegerOption(option =>
                    option.setName('limit')
                        .setDescription('Максимальное количество результатов')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(25)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('stats')
                .setDescription('Статистика логирования'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('Просмотр конкретного лога по ID')
                .addStringOption(option =>
                    option.setName('id')
                        .setDescription('ID лога')
                        .setRequired(true))),
    
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        
        const subcommand = interaction.options.getSubcommand();
        
        try {
            switch (subcommand) {
                case 'search':
                    await handleSearch(interaction);
                    break;
                case 'stats':
                    await handleStats(interaction);
                    break;
                case 'view':
                    await handleView(interaction);
                    break;
                default:
                    await interaction.editReply('Неизвестная подкоманда');
            }
        } catch (error) {
            console.error('Ошибка при выполнении команды logs:', error);
            await interaction.editReply({
                content: `Произошла ошибка: ${error.message}`,
                ephemeral: true
            });
        }
    }
};

/**
 * Обработка поиска логов
 * @param {Object} interaction - Объект взаимодействия Discord
 */
async function handleSearch(interaction) {
    const type = interaction.options.getString('type');
    const userId = interaction.options.getString('user');
    const channelId = interaction.options.getString('channel');
    const limit = interaction.options.getInteger('limit') || 10;
    
    // Создаем фильтр
    const filter = { guildId: interaction.guild.id };
    if (type) filter.actionType = type;
    if (userId) filter.userId = userId;
    if (channelId) filter.channelId = channelId;
    
    // Выполняем поиск
    const logs = await searchLogs(filter, limit);
    
    if (logs.length === 0) {
        await interaction.editReply('Логи не найдены');
        return;
    }
    
    // Создаем эмбед с результатами
    const embed = new EmbedBuilder()
        .setTitle('📋 Результаты поиска логов')
        .setColor('#0099ff')
        .setDescription(`Найдено ${logs.length} записей`)
        .setTimestamp();
    
    // Добавляем каждый лог в эмбед
    for (let i = 0; i < Math.min(logs.length, 10); i++) {
        const log = logs[i];
        const timestamp = new Date(log.timestamp).toLocaleString('ru-RU');
        
        // Форматируем содержимое
        let content = log.content;
        if (content && content.length > 100) {
            content = content.substring(0, 97) + '...';
        }
        
        // Получаем имя пользователя
        let userInfo = log.userId ? `ID: ${log.userId}` : 'Нет';
        try {
            if (log.userId) {
                const user = await interaction.client.users.fetch(log.userId);
                userInfo = user.tag;
            }
        } catch (e) {}
        
        embed.addFields({
            name: `${timestamp} - ${log.actionType}${log.actionSubtype ? ` (${log.actionSubtype})` : ''}`,
            value: `**ID:** \`${log._id}\`\n**Пользователь:** ${userInfo}\n**Канал:** ${log.channelId ? `<#${log.channelId}>` : 'Нет'}\n**Содержимое:** ${content || 'Нет'}`
        });
    }
    
    // Если есть еще логи, добавляем информацию об этом
    if (logs.length > 10) {
        embed.addFields({
            name: 'И еще...',
            value: `Показано 10 из ${logs.length} записей. Используйте более точные фильтры для уточнения результатов.`
        });
    }
    
    await interaction.editReply({ embeds: [embed] });
}

/**
 * Обработка просмотра статистики логирования
 * @param {Object} interaction - Объект взаимодействия Discord
 */
async function handleStats(interaction) {
    // Получаем статистику по типам логов
    const stats = await ActionLog.aggregate([
        { $match: { guildId: interaction.guild.id } },
        { $group: { _id: '$actionType', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
    ]);
    
    // Получаем общее количество логов
    const totalLogs = await ActionLog.countDocuments({ guildId: interaction.guild.id });
    
    // Получаем количество логов за последние 24 часа
    const last24Hours = await ActionLog.countDocuments({
        guildId: interaction.guild.id,
        timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });
    
    // Создаем эмбед со статистикой
    const embed = new EmbedBuilder()
        .setTitle('📊 Статистика логирования')
        .setColor('#00ff00')
        .setDescription(`Всего записей: **${totalLogs}**\nЗа последние 24 часа: **${last24Hours}**`)
        .setTimestamp();
    
    // Добавляем статистику по типам
    if (stats.length > 0) {
        const statsText = stats.map(stat => `**${stat._id}**: ${stat.count}`).join('\n');
        embed.addFields({ name: 'По типам', value: statsText });
    }
    
    // Добавляем информацию о версии
    embed.setFooter({ 
        text: `${config.version} • ${config.build}`,
        iconURL: interaction.client.user.displayAvatarURL()
    });
    
    await interaction.editReply({ embeds: [embed] });
}

/**
 * Обработка просмотра конкретного лога
 * @param {Object} interaction - Объект взаимодействия Discord
 */
async function handleView(interaction) {
    const logId = interaction.options.getString('id');
    
    try {
        // Находим лог по ID
        const log = await ActionLog.findById(logId);
        
        if (!log || log.guildId !== interaction.guild.id) {
            await interaction.editReply('Лог не найден или у вас нет доступа к нему');
            return;
        }
        
        // Создаем эмбед с информацией о логе
        const embed = new EmbedBuilder()
            .setTitle(`📝 Лог: ${log.actionType}${log.actionSubtype ? ` (${log.actionSubtype})` : ''}`)
            .setColor(log.successful ? '#00ff00' : '#ff0000')
            .setTimestamp(log.timestamp);
        
        // Добавляем информацию о пользователе
        if (log.userId) {
            try {
                const user = await interaction.client.users.fetch(log.userId);
                embed.setAuthor({ 
                    name: user.tag, 
                    iconURL: user.displayAvatarURL({ dynamic: true }) 
                });
                embed.addFields({ name: 'Пользователь', value: `${user.tag} (${user.id})`, inline: true });
            } catch (e) {
                embed.addFields({ name: 'Пользователь', value: `ID: ${log.userId}`, inline: true });
            }
        }
        
        // Добавляем информацию о цели
        if (log.targetId) {
            try {
                const target = await interaction.client.users.fetch(log.targetId);
                embed.addFields({ name: 'Цель', value: `${target.tag} (${target.id})`, inline: true });
            } catch (e) {
                embed.addFields({ name: 'Цель', value: `ID: ${log.targetId}`, inline: true });
            }
        }
        
        // Добавляем канал
        if (log.channelId) {
            embed.addFields({ name: 'Канал', value: `<#${log.channelId}>`, inline: true });
        }
        
        // Добавляем содержимое, если оно есть
        if (log.content) {
            embed.addFields({ 
                name: 'Содержимое', 
                value: log.content.length > 1024 
                    ? log.content.substring(0, 1021) + '...' 
                    : log.content,
                inline: false 
            });
        }
        
        // Добавляем метаданные, если они есть
        if (log.metadata && Object.keys(log.metadata).length > 0) {
            const metadataString = JSON.stringify(log.metadata, null, 2);
            if (metadataString.length <= 1024) {
                embed.addFields({ name: 'Метаданные', value: '```json\n' + metadataString + '\n```', inline: false });
            } else {
                embed.addFields({ name: 'Метаданные', value: '```json\n' + metadataString.substring(0, 1000) + '...\n```', inline: false });
            }
        }
        
        // Добавляем ID записи
        embed.setFooter({ 
            text: `Log ID: ${log._id}`,
            iconURL: interaction.client.user.displayAvatarURL()
        });
        
        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Ошибка при просмотре лога:', error);
        await interaction.editReply(`Ошибка при просмотре лога: ${error.message}`);
    }
} 