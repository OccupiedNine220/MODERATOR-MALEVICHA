const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    ChannelType,
    PermissionFlagsBits
} = require('discord.js');
const config = require('../config');

/**
 * Создает панель для создания тикетов
 * @param {Object} channel - Канал, в котором будет создана панель
 */
async function createTicketPanel(channel) {
    if (!channel) throw new Error('Канал не указан');

    const embed = new EmbedBuilder()
        .setTitle('📝 Система тикетов')
        .setDescription('Нажмите на кнопку ниже, чтобы создать тикет. Наши модераторы рассмотрят ваш запрос как можно скорее.')
        .setColor(0x3498DB)
        .setFooter({ text: 'Система тикетов' })
        .setTimestamp();

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('create_ticket')
                .setLabel('Создать тикет')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🎫')
        );

    return await channel.send({ embeds: [embed], components: [row] });
}

/**
 * Создает новый тикет
 * @param {Object} interaction - Объект взаимодействия Discord
 * @param {String} categoryId - ID категории для тикетов
 */
async function createTicket(interaction, categoryId) {
    await interaction.deferReply({ ephemeral: true });
    
    if (!interaction.guild) {
        return await interaction.editReply({ 
            content: 'Эта команда может быть использована только на сервере.',
            ephemeral: true 
        });
    }
    
    // Проверяем, есть ли у пользователя уже открытый тикет
    const existingTicket = interaction.guild.channels.cache.find(
        c => c.name === `ticket-${interaction.user.username.toLowerCase().replace(/\s+/g, '-')}` && 
        c.parentId === categoryId
    );
    
    if (existingTicket) {
        return await interaction.editReply({ 
            content: `У вас уже есть открытый тикет: ${existingTicket}. Пожалуйста, используйте его или закройте перед созданием нового.`,
            ephemeral: true 
        });
    }
    
    try {
        // Проверяем наличие категории
        const category = interaction.guild.channels.cache.get(categoryId);
        if (!category) {
            throw new Error(`Категория для тикетов не найдена (ID: ${categoryId})`);
        }
        
        // Создаем новый канал тикета
        const ticketChannel = await interaction.guild.channels.create({
            name: `ticket-${interaction.user.username.toLowerCase().replace(/\s+/g, '-')}`,
            type: ChannelType.GuildText,
            parent: categoryId,
            permissionOverwrites: [
                {
                    id: interaction.guild.id, // @everyone
                    deny: [PermissionFlagsBits.ViewChannel]
                },
                {
                    id: interaction.user.id, // автор тикета
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory
                    ]
                },
                {
                    id: config.adminRoleId, // роль администраторов
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.ManageChannels
                    ]
                },
                {
                    id: config.modRoleId, // роль модераторов
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory
                    ]
                }
            ]
        });
        
        // Создаем приветственное сообщение в тикете
        const embed = new EmbedBuilder()
            .setTitle('🎫 Новый тикет')
            .setDescription(`Здравствуйте, ${interaction.user}! Опишите вашу проблему или запрос, и команда поддержки ответит вам как можно скорее.`)
            .setColor(0x3498DB)
            .setFooter({ text: 'Система тикетов' })
            .setTimestamp();
        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('close_ticket')
                    .setLabel('Закрыть тикет')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🔒')
            );
        
        await ticketChannel.send({ 
            content: `${interaction.user} ${interaction.guild.roles.cache.get(config.modRoleId)}`,
            embeds: [embed], 
            components: [row] 
        });
        
        // Отвечаем пользователю об успешном создании тикета
        await interaction.editReply({ 
            content: `✅ Ваш тикет создан: ${ticketChannel}`,
            ephemeral: true 
        });
        
    } catch (error) {
        console.error('Ошибка при создании тикета:', error);
        
        await interaction.editReply({ 
            content: `❌ Произошла ошибка при создании тикета: ${error.message}. Пожалуйста, попробуйте позже или обратитесь к администрации.`,
            ephemeral: true 
        });
    }
}

/**
 * Закрывает тикет
 * @param {Object} interaction - Объект взаимодействия Discord
 */
async function closeTicket(interaction) {
    await interaction.deferReply();
    
    const channel = interaction.channel;
    
    if (!channel.name.startsWith('ticket-')) {
        return interaction.editReply('❌ Эта команда может быть использована только в каналах тикетов.');
    }
    
    try {
        // Создаем сообщение о закрытии тикета
        const embed = new EmbedBuilder()
            .setTitle('🔒 Тикет закрывается')
            .setDescription('Этот тикет будет закрыт через 5 секунд.')
            .setColor(0xE74C3C)
            .setFooter({ text: 'Система тикетов' })
            .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
        
        // Ждем 5 секунд и удаляем канал
        setTimeout(() => {
            channel.delete().catch(error => {
                console.error('Ошибка при удалении канала тикета:', error);
            });
        }, 5000);
        
    } catch (error) {
        console.error('Ошибка при закрытии тикета:', error);
        
        await interaction.editReply({ 
            content: `❌ Произошла ошибка при закрытии тикета: ${error.message}. Пожалуйста, попробуйте позже или обратитесь к администрации.`
        });
    }
}

/**
 * Обрабатывает все взаимодействия, связанные с тикетами
 * @param {Object} interaction - Объект взаимодействия Discord
 * @param {String} ticketCategoryId - ID категории для тикетов
 */
async function handleTicketInteraction(interaction, ticketCategoryId) {
    if (!interaction.isButton()) return;
    
    const { customId } = interaction;
    
    if (customId === 'create_ticket') {
        await createTicket(interaction, ticketCategoryId);
    } else if (customId === 'close_ticket') {
        await closeTicket(interaction);
    }
}

module.exports = {
    createTicketPanel,
    handleTicketInteraction
}; 