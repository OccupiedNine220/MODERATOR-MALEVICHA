const { Client, GatewayIntentBits, Events, Collection, EmbedBuilder, ActivityType } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { connectDatabase } = require('./utils/database');
const { logMessageEdit, logMessageDelete, logAction } = require('./utils/logger');
const {
    logUserMessage,
    logMessageEdit: advLogMessageEdit,
    logMessageDelete: advLogMessageDelete,
    logCommand,
    logModeration,
    logSystemEvent,
    logError
} = require('./utils/advancedLogger');
const ticketSystem = require('./features/ticketSystem');
const levelSystem = require('./features/levelSystem');
const tempRoleSystem = require('./features/tempRoleSystem');
const moderationReports = require('./features/moderationReports');
const antiRaidSystem = require('./features/antiRaidSystem');
const automod = require('./features/autoModeration');
const aimod = require('./features/aiModeration');
const cron = require('node-cron');
const { Mute } = require('./models/schema');

// Инициализация клиента с необходимыми интентами
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildModeration
    ] 
});

// Создаем коллекцию для хранения команд
client.commands = new Collection();

// Статистика бота
client.stats = {
    deletedMessages: 0,
    editedMessages: 0,
    bans: 0,
    mutes: 0
};

// Функция загрузки команд
async function loadCommands() {
    const commandsPath = path.join(__dirname, 'commands');
    const commandFolders = fs.readdirSync(commandsPath);
    
    for (const folder of commandFolders) {
        const folderPath = path.join(commandsPath, folder);
        const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));
        
        for (const file of commandFiles) {
            const filePath = path.join(folderPath, file);
            const command = require(filePath);
            
            // Проверяем наличие необходимых свойств
            if ('data' in command && 'execute' in command) {
                client.commands.set(command.data.name, command);
                console.log(`Загружена команда: ${command.data.name}`);
            } else {
                console.warn(`Команда по пути ${filePath} пропущена. Отсутствуют необходимые свойства 'data' или 'execute'.`);
            }
        }
    }
}

// Обработка события ready
client.once(Events.ClientReady, async () => {
    console.log(`${client.user.tag} запущен!`);
    
    // Логируем запуск бота
    const guild = client.guilds.cache.first();
    if (guild) {
        await logSystemEvent(guild, 'bot_start', {
            version: config.version,
            build: config.build,
            uptime: 0,
            servers: client.guilds.cache.size,
            users: client.users.cache.size
        });
    }
    
    // Устанавливаем статус бота
    client.user.setPresence({
        activities: [{ 
            name: 'за порядком', 
            type: ActivityType.Watching 
        }],
        status: 'online'
    });
    
    // Инициализируем систему временных ролей
    await tempRoleSystem.initTempRoleSystem(client);
    
    // Инициализируем систему анти-рейда
    antiRaidSystem.init(client);
    
    // Создаем панель для тикетов в указанном канале
    const ticketChannel = await client.channels.fetch('1301124585483403264').catch(console.error);
    if (ticketChannel) {
        // Получаем все сообщения в канале
        const messages = await ticketChannel.messages.fetch({ limit: 10 }).catch(console.error);
        
        // Если нет сообщений с панелью тикетов, создаем новую
        const hasTicketPanel = messages?.some(msg => 
            msg.embeds?.some(embed => embed.title === '📝 Система тикетов')
        );
        
        if (!hasTicketPanel) {
            await ticketSystem.createTicketPanel(ticketChannel);
            console.log('Создана новая панель тикетов');
        } else {
            console.log('Панель тикетов уже существует');
        }
    }
    
    // Проверяем и снимаем истекшие муты
    await checkMutes();
    
    // Планируем регулярную проверку мутов каждую минуту
    cron.schedule('* * * * *', async () => {
        await checkMutes();
    });
    
    // Планируем отправку ежедневного отчета в 23:00
    cron.schedule('0 23 * * *', async () => {
        await moderationReports.generateDailyReport(client);
    });
    
    // Планируем отправку еженедельного отчета в воскресенье в 23:30
    cron.schedule('30 23 * * 0', async () => {
        await moderationReports.generateWeeklyReport(client);
    });
});

// Проверка и снятие истекших мутов
async function checkMutes() {
    try {
        const now = new Date();
        const expiredMutes = await Mute.find({ endTime: { $lte: now } });
        
        for (const mute of expiredMutes) {
            const guild = client.guilds.cache.get(mute.guildId);
            if (!guild) continue;
            
            const member = await guild.members.fetch(mute.userId).catch(() => null);
            if (member && member.isCommunicationDisabled()) {
                await member.timeout(null, 'Автоматическое снятие мута по истечении времени');
                console.log(`Снят мут с пользователя ${member.user.tag} на сервере ${guild.name}`);
                
                // Логируем снятие мута
                await logSystemEvent(guild, 'auto_unmute', {
                    userId: member.user.id,
                    username: member.user.tag,
                    reason: 'Автоматическое снятие мута по истечении времени',
                    muteDuration: Math.floor((now - mute.addedAt) / (1000 * 60 * 60)) + ' часов'
                });
            }
            
            // Удаляем запись о муте из базы данных
            await Mute.findByIdAndDelete(mute._id);
        }
    } catch (error) {
        console.error('Ошибка при проверке истекших мутов:', error);
        
        // Логируем ошибку
        const guild = client.guilds.cache.first();
        if (guild) {
            await logError(guild, error, 'checkMutes');
        }
    }
}

// Обработка команд
client.on(Events.InteractionCreate, async interaction => {
    // Обработка тикетов
    if (interaction.isButton()) {
        // Логируем нажатие кнопки
        if (interaction.guild) {
            await logSystemEvent(interaction.guild, 'button_click', {
                customId: interaction.customId,
                userId: interaction.user.id,
                channelId: interaction.channelId
            });
        }
        
        await ticketSystem.handleTicketInteraction(interaction, '1301121896758382612'); // ID категории для тикетов
        return;
    }
    
    if (!interaction.isChatInputCommand()) return;
    
    const command = client.commands.get(interaction.commandName);
    
    if (!command) {
        console.error(`Команда ${interaction.commandName} не найдена.`);
        if (interaction.guild) {
            await logError(interaction.guild, new Error(`Команда ${interaction.commandName} не найдена`), 'command_not_found');
        }
        return;
    }
    
    try {
        // Логируем начало выполнения команды
        await logCommand(interaction, true);
        
        // Выполняем команду
        await command.execute(interaction);
    } catch (error) {
        console.error(`Ошибка при выполнении команды ${interaction.commandName}:`, error);
        
        // Логируем ошибку
        if (interaction.guild) {
            await logCommand(interaction, false, error);
        }
        
        const errorReply = {
            content: '❌ Произошла ошибка при выполнении этой команды!',
            ephemeral: true
        };
        
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorReply);
        } else {
            await interaction.reply(errorReply);
        }
    }
});

// Обработка сообщений для автомодерации
client.on(Events.MessageCreate, async message => {
    // Если сообщение от бота или в публичном канале, пропускаем
    if (message.author.bot) return;

    // Логируем каждое сообщение
    if (message.guild) {
        await logUserMessage(message);
    }

    // Проверяем канал для отладки
    if (message.channel.type === 'DM' || message.channel.type === 1) {
        console.log(`Получено личное сообщение от ${message.author.tag}: ${message.content}`);
    }

    // Если сообщение в публичном канале, проверяем модерацию
    if (message.guild) {
        // Начисляем XP за сообщение
        const levelUpInfo = await levelSystem.addMessageXP(message);
        
        // Если пользователь повысил уровень, отправляем уведомление
        if (levelUpInfo) {
            const channel = message.guild.channels.cache.get('1381912160552357969') || message.channel;
            const embed = new EmbedBuilder()
                .setTitle('🎉 Повышение уровня!')
                .setDescription(`${levelUpInfo.member} повысил свой уровень до **${levelUpInfo.newLevel}**!`)
                .setColor('#00ff00')
                .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
                .setTimestamp();
            
            await channel.send({ embeds: [embed] });
            
            // Логируем повышение уровня
            await logSystemEvent(message.guild, 'level_up', {
                userId: message.author.id,
                oldLevel: levelUpInfo.oldLevel,
                newLevel: levelUpInfo.newLevel,
                xp: levelUpInfo.xp
            });
        }
        
        // Сначала проверяем сообщение через ИИ модерацию
        const aiModResult = await aimod.moderateMessage(message);
        if (aiModResult) {
            // Логируем действие ИИ модерации
            await logSystemEvent(message.guild, 'ai_moderation', {
                userId: message.author.id,
                messageId: message.id,
                result: aiModResult,
                action: 'delete'
            });
            return;
        }
        
        // Если ИИ модерация не сработала, используем обычную автомодерацию
        // Проверяем сообщение на запрещенные слова
        const bannedWordsResult = await automod.checkBannedWords(message);
        if (bannedWordsResult) {
            // Логируем действие автомодерации
            await logSystemEvent(message.guild, 'automod', {
                userId: message.author.id,
                messageId: message.id,
                type: 'banned_words',
                action: 'delete'
            });
            return;
        }
        
        // Проверяем на спам и массовые упоминания
        const spamResult = await automod.checkSpamAndMentions(message);
        if (spamResult) {
            // Логируем действие автомодерации
            await logSystemEvent(message.guild, 'automod', {
                userId: message.author.id,
                messageId: message.id,
                type: 'spam_mentions',
                action: 'delete'
            });
            return;
        }
        
        // Проверяем на приглашения и ссылки
        const invitesResult = await automod.checkInvitesAndLinks(message);
        if (invitesResult) {
            // Логируем действие автомодерации
            await logSystemEvent(message.guild, 'automod', {
                userId: message.author.id,
                messageId: message.id,
                type: 'invites_links',
                action: 'delete'
            });
            return;
        }
    }
});

// Логгирование изменений сообщений
client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
    if (oldMessage.author.bot) return;
    
    // Логируем изменение в обычный лог
    await logMessageEdit(oldMessage, newMessage);
    
    // Логируем изменение в расширенный лог
    await advLogMessageEdit(oldMessage, newMessage);
    
    // Обновляем статистику
    client.stats.editedMessages++;
    
    // Проверяем новое содержимое на нарушения через ИИ
    const aiModResult = await aimod.moderateMessage(newMessage);
    if (aiModResult) {
        // Логируем действие ИИ модерации
        await logSystemEvent(newMessage.guild, 'ai_moderation_edit', {
            userId: newMessage.author.id,
            messageId: newMessage.id,
            result: aiModResult,
            action: 'delete'
        });
        return;
    }
    
    // Если ИИ не обнаружил нарушений, используем стандартные проверки
    const bannedWordsResult = await automod.checkBannedWords(newMessage);
    if (bannedWordsResult) {
        // Логируем действие автомодерации
        await logSystemEvent(newMessage.guild, 'automod_edit', {
            userId: newMessage.author.id,
            messageId: newMessage.id,
            type: 'banned_words',
            action: 'delete'
        });
        return;
    }
    
    const invitesResult = await automod.checkInvitesAndLinks(newMessage);
    if (invitesResult) {
        // Логируем действие автомодерации
        await logSystemEvent(newMessage.guild, 'automod_edit', {
            userId: newMessage.author.id,
            messageId: newMessage.id,
            type: 'invites_links',
            action: 'delete'
        });
        return;
    }
});

// Логгирование удаления сообщений
client.on(Events.MessageDelete, async message => {
    if (message.author.bot) return;
    
    // Логируем удаление в обычный лог
    await logMessageDelete(message);
    
    // Логируем удаление в расширенный лог
    await advLogMessageDelete(message);
    
    // Обновляем статистику
    client.stats.deletedMessages++;
});

// Логгирование действий с пользователями (бан, разбан, кик)
client.on(Events.GuildBanAdd, async (ban) => {
    // Логируем в обычный лог
    await logAction(ban.guild, `Пользователь ${ban.user.tag} был забанен.`);
    
    // Логируем в расширенный лог с красивым эмбедом
    await logSystemEvent(ban.guild, 'user_banned', {
        userId: ban.user.id,
        username: ban.user.tag,
        reason: ban.reason || 'Причина не указана'
    });
    
    client.stats.bans++;
});

client.on(Events.GuildBanRemove, async (ban) => {
    // Логируем в обычный лог
    await logAction(ban.guild, `Пользователь ${ban.user.tag} был разбанен.`);
    
    // Логируем в расширенный лог с красивым эмбедом
    await logSystemEvent(ban.guild, 'user_unbanned', {
        userId: ban.user.id,
        username: ban.user.tag
    });
});

client.on(Events.GuildMemberRemove, async (member) => {
    // Логируем в обычный лог
    await logAction(member.guild, `Пользователь ${member.user.tag} покинул сервер.`);
    
    // Логируем в расширенный лог с красивым эмбедом
    await logSystemEvent(member.guild, 'user_leave', {
        userId: member.user.id,
        username: member.user.tag,
        roles: member.roles.cache.map(role => role.name),
        joinedAt: member.joinedAt
    });
});

// Обработка входа новых пользователей на сервер
client.on(Events.GuildMemberAdd, async (member) => {
    // Логируем в обычный лог
    await logAction(member.guild, `Новый участник ${member.user.tag} присоединился к серверу.`);
    
    // Логируем в расширенный лог с красивым эмбедом
    await logSystemEvent(member.guild, 'user_join', {
        userId: member.user.id,
        username: member.user.tag,
        createdAt: member.user.createdAt,
        accountAge: Math.floor((Date.now() - member.user.createdAt) / (1000 * 60 * 60 * 24)) // в днях
    });
    
    // Проверяем через систему анти-рейда
    await antiRaidSystem.handleMemberJoin(member);
});

// Логгирование голосовых каналов и система уровней
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    // Пользователь присоединился к голосовому каналу
    if (!oldState.channelId && newState.channelId) {
        // Логируем в обычный лог
        await logAction(newState.guild, 
            `${newState.member.user.tag} зашел в голосовой канал ${newState.channel.name}.`);
        
        // Логируем в расширенный лог с красивым эмбедом
        await logSystemEvent(newState.guild, 'voice_join', {
            userId: newState.member.user.id,
            username: newState.member.user.tag,
            channelId: newState.channelId,
            channelName: newState.channel.name
        });
    }
    // Пользователь покинул голосовой канал
    else if (oldState.channelId && !newState.channelId) {
        // Логируем в обычный лог
        await logAction(oldState.guild, 
            `${oldState.member.user.tag} вышел из голосового канала ${oldState.channel.name}.`);
        
        // Логируем в расширенный лог с красивым эмбедом
        await logSystemEvent(oldState.guild, 'voice_leave', {
            userId: oldState.member.user.id,
            username: oldState.member.user.tag,
            channelId: oldState.channelId,
            channelName: oldState.channel.name
        });
    }
    // Пользователь перешел в другой голосовой канал
    else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
        // Логируем в обычный лог
        await logAction(newState.guild, 
            `${newState.member.user.tag} перешел из канала ${oldState.channel.name} в канал ${newState.channel.name}.`);
        
        // Логируем в расширенный лог с красивым эмбедом
        await logSystemEvent(newState.guild, 'voice_move', {
            userId: newState.member.user.id,
            username: newState.member.user.tag,
            oldChannelId: oldState.channelId,
            oldChannelName: oldState.channel.name,
            newChannelId: newState.channelId,
            newChannelName: newState.channel.name
        });
    }
    
    // Обрабатываем изменение для системы уровней
    levelSystem.trackVoiceChannel(newState.member, newState);
});

// Логирование изменений участников
client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    // Если участник был изменен ботом, пропускаем
    if (newMember.user.bot) return;
    
    // Проверяем изменения в никнейме
    if (oldMember.nickname !== newMember.nickname) {
        await logSystemEvent(newMember.guild, 'member_nickname_change', {
            userId: newMember.user.id,
            username: newMember.user.tag,
            oldNickname: oldMember.nickname || 'Не установлен',
            newNickname: newMember.nickname || 'Не установлен'
        });
    }
    
    // Проверяем изменения в ролях
    const addedRoles = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));
    const removedRoles = oldMember.roles.cache.filter(role => !newMember.roles.cache.has(role.id));
    
    if (addedRoles.size > 0) {
        await logSystemEvent(newMember.guild, 'member_roles_add', {
            userId: newMember.user.id,
            username: newMember.user.tag,
            roles: addedRoles.map(role => ({ id: role.id, name: role.name, color: role.hexColor }))
        });
    }
    
    if (removedRoles.size > 0) {
        await logSystemEvent(newMember.guild, 'member_roles_remove', {
            userId: newMember.user.id,
            username: newMember.user.tag,
            roles: removedRoles.map(role => ({ id: role.id, name: role.name, color: role.hexColor }))
        });
    }
    
    // Проверяем изменения в таймауте
    if (!oldMember.communicationDisabledUntil && newMember.communicationDisabledUntil) {
        await logSystemEvent(newMember.guild, 'member_timeout_add', {
            userId: newMember.user.id,
            username: newMember.user.tag,
            until: newMember.communicationDisabledUntil
        });
    } else if (oldMember.communicationDisabledUntil && !newMember.communicationDisabledUntil) {
        await logSystemEvent(newMember.guild, 'member_timeout_remove', {
            userId: newMember.user.id,
            username: newMember.user.tag
        });
    }
});

// Логирование изменений ролей
client.on(Events.GuildRoleCreate, async (role) => {
    await logSystemEvent(role.guild, 'role_create', {
        roleId: role.id,
        name: role.name,
        color: role.hexColor,
        hoist: role.hoist,
        mentionable: role.mentionable,
        position: role.position,
        permissions: role.permissions.toArray()
    });
});

client.on(Events.GuildRoleDelete, async (role) => {
    await logSystemEvent(role.guild, 'role_delete', {
        roleId: role.id,
        name: role.name,
        color: role.hexColor,
        position: role.position
    });
});

client.on(Events.GuildRoleUpdate, async (oldRole, newRole) => {
    const changes = {};
    
    if (oldRole.name !== newRole.name) {
        changes.name = { old: oldRole.name, new: newRole.name };
    }
    
    if (oldRole.hexColor !== newRole.hexColor) {
        changes.color = { old: oldRole.hexColor, new: newRole.hexColor };
    }
    
    if (oldRole.hoist !== newRole.hoist) {
        changes.hoist = { old: oldRole.hoist, new: newRole.hoist };
    }
    
    if (oldRole.mentionable !== newRole.mentionable) {
        changes.mentionable = { old: oldRole.mentionable, new: newRole.mentionable };
    }
    
    if (oldRole.position !== newRole.position) {
        changes.position = { old: oldRole.position, new: newRole.position };
    }
    
    if (!oldRole.permissions.equals(newRole.permissions)) {
        changes.permissions = {
            old: oldRole.permissions.toArray(),
            new: newRole.permissions.toArray(),
            added: newRole.permissions.toArray().filter(p => !oldRole.permissions.has(p)),
            removed: oldRole.permissions.toArray().filter(p => !newRole.permissions.has(p))
        };
    }
    
    if (Object.keys(changes).length > 0) {
        await logSystemEvent(newRole.guild, 'role_update', {
            roleId: newRole.id,
            name: newRole.name,
            changes: changes
        });
    }
});

// Логирование изменений каналов
client.on(Events.ChannelCreate, async (channel) => {
    if (!channel.guild) return; // Пропускаем DM каналы
    
    await logSystemEvent(channel.guild, 'channel_create', {
        channelId: channel.id,
        name: channel.name,
        type: channel.type,
        parentId: channel.parentId,
        position: channel.position
    });
});

client.on(Events.ChannelDelete, async (channel) => {
    if (!channel.guild) return; // Пропускаем DM каналы
    
    await logSystemEvent(channel.guild, 'channel_delete', {
        channelId: channel.id,
        name: channel.name,
        type: channel.type,
        parentId: channel.parentId,
        position: channel.position
    });
});

client.on(Events.ChannelUpdate, async (oldChannel, newChannel) => {
    if (!newChannel.guild) return; // Пропускаем DM каналы
    
    const changes = {};
    
    if (oldChannel.name !== newChannel.name) {
        changes.name = { old: oldChannel.name, new: newChannel.name };
    }
    
    if (oldChannel.parentId !== newChannel.parentId) {
        changes.parentId = { 
            old: oldChannel.parentId, 
            new: newChannel.parentId,
            oldParentName: oldChannel.parentId ? oldChannel.client.channels.cache.get(oldChannel.parentId)?.name : null,
            newParentName: newChannel.parentId ? newChannel.client.channels.cache.get(newChannel.parentId)?.name : null
        };
    }
    
    if (oldChannel.position !== newChannel.position) {
        changes.position = { old: oldChannel.position, new: newChannel.position };
    }
    
    if (oldChannel.type === 0 && newChannel.type === 0) { // Только для текстовых каналов
        if (oldChannel.topic !== newChannel.topic) {
            changes.topic = { old: oldChannel.topic || 'Нет', new: newChannel.topic || 'Нет' };
        }
        
        if (oldChannel.nsfw !== newChannel.nsfw) {
            changes.nsfw = { old: oldChannel.nsfw, new: newChannel.nsfw };
        }
        
        if (oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser) {
            changes.slowmode = { old: oldChannel.rateLimitPerUser, new: newChannel.rateLimitPerUser };
        }
    }
    
    if (Object.keys(changes).length > 0) {
        await logSystemEvent(newChannel.guild, 'channel_update', {
            channelId: newChannel.id,
            name: newChannel.name,
            type: newChannel.type,
            changes: changes
        });
    }
});

// Логирование изменений эмодзи и стикеров
client.on(Events.GuildEmojiCreate, async (emoji) => {
    await logSystemEvent(emoji.guild, 'emoji_create', {
        emojiId: emoji.id,
        name: emoji.name,
        animated: emoji.animated,
        url: emoji.url
    });
});

client.on(Events.GuildEmojiDelete, async (emoji) => {
    await logSystemEvent(emoji.guild, 'emoji_delete', {
        emojiId: emoji.id,
        name: emoji.name
    });
});

client.on(Events.GuildEmojiUpdate, async (oldEmoji, newEmoji) => {
    if (oldEmoji.name !== newEmoji.name) {
        await logSystemEvent(newEmoji.guild, 'emoji_update', {
            emojiId: newEmoji.id,
            oldName: oldEmoji.name,
            newName: newEmoji.name,
            url: newEmoji.url
        });
    }
});

client.on(Events.GuildStickerCreate, async (sticker) => {
    await logSystemEvent(sticker.guild, 'sticker_create', {
        stickerId: sticker.id,
        name: sticker.name,
        description: sticker.description,
        tags: sticker.tags,
        url: sticker.url
    });
});

client.on(Events.GuildStickerDelete, async (sticker) => {
    await logSystemEvent(sticker.guild, 'sticker_delete', {
        stickerId: sticker.id,
        name: sticker.name
    });
});

client.on(Events.GuildStickerUpdate, async (oldSticker, newSticker) => {
    const changes = {};
    
    if (oldSticker.name !== newSticker.name) {
        changes.name = { old: oldSticker.name, new: newSticker.name };
    }
    
    if (oldSticker.description !== newSticker.description) {
        changes.description = { old: oldSticker.description, new: newSticker.description };
    }
    
    if (oldSticker.tags !== newSticker.tags) {
        changes.tags = { old: oldSticker.tags, new: newSticker.tags };
    }
    
    if (Object.keys(changes).length > 0) {
        await logSystemEvent(newSticker.guild, 'sticker_update', {
            stickerId: newSticker.id,
            name: newSticker.name,
            changes: changes
        });
    }
});

// Логирование изменений гильдии
client.on(Events.GuildUpdate, async (oldGuild, newGuild) => {
    const changes = {};
    
    if (oldGuild.name !== newGuild.name) {
        changes.name = { old: oldGuild.name, new: newGuild.name };
    }
    
    if (oldGuild.iconURL() !== newGuild.iconURL()) {
        changes.icon = { 
            old: oldGuild.iconURL(), 
            new: newGuild.iconURL() 
        };
    }
    
    if (oldGuild.bannerURL() !== newGuild.bannerURL()) {
        changes.banner = { 
            old: oldGuild.bannerURL(), 
            new: newGuild.bannerURL() 
        };
    }
    
    if (oldGuild.description !== newGuild.description) {
        changes.description = { 
            old: oldGuild.description || 'Нет', 
            new: newGuild.description || 'Нет' 
        };
    }
    
    if (oldGuild.vanityURLCode !== newGuild.vanityURLCode) {
        changes.vanityURL = { 
            old: oldGuild.vanityURLCode || 'Нет', 
            new: newGuild.vanityURLCode || 'Нет' 
        };
    }
    
    if (oldGuild.ownerId !== newGuild.ownerId) {
        let oldOwnerTag = 'Неизвестно';
        let newOwnerTag = 'Неизвестно';
        
        try {
            const oldOwner = await oldGuild.client.users.fetch(oldGuild.ownerId);
            oldOwnerTag = oldOwner.tag;
        } catch (e) {}
        
        try {
            const newOwner = await newGuild.client.users.fetch(newGuild.ownerId);
            newOwnerTag = newOwner.tag;
        } catch (e) {}
        
        changes.owner = { 
            old: { id: oldGuild.ownerId, tag: oldOwnerTag },
            new: { id: newGuild.ownerId, tag: newOwnerTag }
        };
    }
    
    if (Object.keys(changes).length > 0) {
        await logSystemEvent(newGuild, 'guild_update', {
            changes: changes
        });
    }
});

// Обработчик ошибок для предотвращения крашей
process.on('unhandledRejection', async error => {
    console.error('Необработанное отклонение промиса:', error);
    
    // Логируем ошибку в расширенный лог
    const guild = client.guilds.cache.first();
    if (guild) {
        await logError(guild, error, 'unhandledRejection');
    }
});

process.on('uncaughtException', async error => {
    console.error('Необработанное исключение:', error);
    
    // Логируем ошибку в расширенный лог
    const guild = client.guilds.cache.first();
    if (guild) {
        await logError(guild, error, 'uncaughtException');
    }
});

// Главная функция запуска бота
async function main() {
    try {
        // Подключаемся к базе данных
        await connectDatabase();
        
        // Загружаем команды
        await loadCommands();
        
        // Входим в Discord
        await client.login(config.token);
    } catch (error) {
        console.error('Ошибка при запуске бота:', error);
        process.exit(1);
    }
}

main();