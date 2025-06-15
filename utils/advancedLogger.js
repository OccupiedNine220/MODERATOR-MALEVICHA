const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const { ActionLog } = require('../models/schema');

/**
 * Логирует любое действие в системе с сохранением в базу данных
 * @param {Object} options - Параметры действия
 * @returns {Promise<Object>} - Созданная запись лога
 */
async function logAdvancedAction(options) {
    try {
        const {
            actionType,          // Обязательное поле: тип действия
            actionSubtype = '',  // Подтип действия
            userId = null,       // ID пользователя
            targetId = null,     // ID цели действия
            guildId,             // Обязательное поле: ID сервера
            channelId = null,    // ID канала
            messageId = null,    // ID сообщения
            content = '',        // Содержимое
            metadata = {},       // Дополнительные данные
            successful = true,   // Успешность действия
            relatedLogs = []     // Связанные логи
        } = options;

        // Проверяем обязательные поля
        if (!actionType || !guildId) {
            throw new Error('Отсутствуют обязательные поля: actionType или guildId');
        }

        // Создаем запись в базе данных (без эмбедов от ИИ)
        const logEntry = new ActionLog({
            actionType,
            actionSubtype,
            userId,
            targetId,
            guildId,
            channelId,
            messageId,
            content,
            metadata,
            successful,
            relatedLogs
        });

        // Сохраняем запись
        await logEntry.save();
        
        // Отправляем красивый эмбед в канал логов
        await sendEnhancedLogToChannel(logEntry, options.guild);
        
        return logEntry;
    } catch (error) {
        console.error('Ошибка при создании записи лога:', error);
        return null;
    }
}

/**
 * Отправляет красивый эмбед в канал логов
 * @param {Object} logEntry - Запись лога
 * @param {Object} guild - Объект сервера
 */
async function sendEnhancedLogToChannel(logEntry, guild) {
    try {
        if (!guild) return;
        
        const logChannel = guild.channels.cache.get(config.logChannelId);
        if (!logChannel) return;
        
        // Определяем настройки эмбеда в зависимости от типа действия
        const embedSettings = getEmbedSettings(logEntry.actionType, logEntry.actionSubtype, logEntry.successful);
        
        // Создаем основу эмбеда
        const embed = new EmbedBuilder()
            .setTitle(embedSettings.title)
            .setColor(embedSettings.color)
            .setTimestamp(logEntry.timestamp);
        
        // Добавляем иконку в зависимости от типа действия
        if (embedSettings.thumbnail) {
            embed.setThumbnail(embedSettings.thumbnail);
        }
        
        // Добавляем информацию о пользователе
        if (logEntry.userId) {
            try {
                const user = await guild.client.users.fetch(logEntry.userId);
                embed.setAuthor({ 
                    name: user.tag, 
                    iconURL: user.displayAvatarURL({ dynamic: true }) 
                });
                
                // Добавляем аватар пользователя как изображение для определенных действий
                if (['moderation', 'level_up', 'user_join', 'user_leave'].includes(logEntry.actionType)) {
                    embed.setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }));
                }
            } catch (e) {
                embed.addFields({ name: 'Пользователь', value: `ID: ${logEntry.userId}`, inline: true });
            }
        }
        
        // Добавляем информацию о цели
        if (logEntry.targetId) {
            try {
                const target = await guild.client.users.fetch(logEntry.targetId);
                embed.addFields({ 
                    name: embedSettings.targetLabel || 'Цель', 
                    value: `${target.tag} (${target.id})`, 
                    inline: true 
                });
                
                // Для модерационных действий добавляем аватар цели
                if (logEntry.actionType === 'moderation') {
                    embed.setThumbnail(target.displayAvatarURL({ dynamic: true, size: 256 }));
                }
            } catch (e) {
                embed.addFields({ name: embedSettings.targetLabel || 'Цель', value: `ID: ${logEntry.targetId}`, inline: true });
            }
        }
        
        // Добавляем канал
        if (logEntry.channelId) {
            embed.addFields({ name: 'Канал', value: `<#${logEntry.channelId}>`, inline: true });
        }
        
        // Добавляем содержимое, если оно есть
        if (logEntry.content) {
            // Форматируем содержимое в зависимости от типа действия
            let formattedContent = logEntry.content;
            
            // Для сообщений добавляем блок кода
            if (logEntry.actionType === 'message') {
                formattedContent = '```\n' + (logEntry.content.length > 1000 
                    ? logEntry.content.substring(0, 997) + '...' 
                    : logEntry.content) + '\n```';
            }
            
            embed.addFields({ 
                name: embedSettings.contentLabel || 'Содержимое', 
                value: formattedContent.length > 1024 
                    ? formattedContent.substring(0, 1021) + '...' 
                    : formattedContent,
                inline: false 
            });
        }
        
        // Добавляем метаданные, если они есть
        if (logEntry.metadata && Object.keys(logEntry.metadata).length > 0) {
            // Форматируем метаданные в зависимости от типа действия
            const formattedMetadata = formatMetadata(logEntry.metadata, logEntry.actionType, logEntry.actionSubtype);
            
            // Добавляем форматированные метаданные
            for (const [key, value] of Object.entries(formattedMetadata)) {
                if (value && value.toString().trim()) {
                    embed.addFields({ name: key, value: value.toString(), inline: key !== 'Детали' });
                }
            }
        }
        
        // Добавляем footer с ID записи и версией бота
        embed.setFooter({ 
            text: `${config.version} • ID: ${logEntry._id}`,
            iconURL: guild.client.user.displayAvatarURL({ dynamic: true })
        });
        
        // Отправляем эмбед
        await logChannel.send({ embeds: [embed] });
    } catch (error) {
        console.error('Ошибка при отправке лога в канал:', error);
    }
}

/**
 * Возвращает настройки эмбеда для разных типов действий
 * @param {string} actionType - Тип действия
 * @param {string} actionSubtype - Подтип действия
 * @param {boolean} successful - Успешность действия
 * @returns {Object} - Настройки эмбеда
 */
function getEmbedSettings(actionType, actionSubtype, successful) {
    // Базовые настройки
    const settings = {
        title: '📝 Лог',
        color: 0x0099FF,
        thumbnail: null,
        targetLabel: 'Цель',
        contentLabel: 'Содержимое'
    };
    
    // Если действие неуспешно, всегда красный цвет
    if (!successful) {
        settings.color = 0xFF0000;
        settings.title = '❌ Ошибка';
        return settings;
    }
    
    // Настройки в зависимости от типа действия
    switch (actionType) {
        case 'message':
            settings.color = 0x00FF00; // Зеленый
            
            switch (actionSubtype) {
                case 'create':
                    settings.title = '💬 Новое сообщение';
                    settings.contentLabel = 'Текст сообщения';
                    break;
                case 'edit':
                    settings.title = '✏️ Изменение сообщения';
                    settings.color = 0xFFAA00; // Оранжевый
                    settings.contentLabel = 'Изменения';
                    break;
                case 'delete':
                    settings.title = '🗑️ Удаление сообщения';
                    settings.color = 0xFF5555; // Красно-розовый
                    settings.contentLabel = 'Удаленный текст';
                    break;
                default:
                    settings.title = '💬 Сообщение';
            }
            break;
            
        case 'command':
            settings.title = `🤖 Команда /${actionSubtype || ''}`;
            settings.color = 0x00CCFF; // Голубой
            settings.contentLabel = 'Параметры';
            break;
            
        case 'moderation':
            settings.color = 0xFF9900; // Оранжевый
            settings.contentLabel = 'Причина';
            
            switch (actionSubtype) {
                case 'ban':
                    settings.title = '🔨 Бан пользователя';
                    settings.color = 0xFF0000; // Красный
                    break;
                case 'kick':
                    settings.title = '👢 Кик пользователя';
                    settings.color = 0xFF9900; // Оранжевый
                    break;
                case 'mute':
                    settings.title = '🔇 Мут пользователя';
                    settings.color = 0xFFCC00; // Желтый
                    break;
                case 'warn':
                    settings.title = '⚠️ Предупреждение';
                    settings.color = 0xFFFF00; // Желтый
                    break;
                case 'unmute':
                    settings.title = '🔊 Размут пользователя';
                    settings.color = 0x00FF00; // Зеленый
                    break;
                case 'unban':
                    settings.title = '🔓 Разбан пользователя';
                    settings.color = 0x00FF00; // Зеленый
                    break;
                default:
                    settings.title = '🛡️ Модерация';
            }
            break;
            
        case 'system':
            settings.color = 0xFFFF00; // Желтый
            settings.title = '⚙️ Системное событие';
            settings.contentLabel = 'Информация';
            
            switch (actionSubtype) {
                case 'bot_start':
                    settings.title = '🚀 Запуск бота';
                    settings.color = 0x00FF00; // Зеленый
                    break;
                case 'level_up':
                    settings.title = '🎉 Повышение уровня';
                    settings.color = 0x00FFAA; // Бирюзовый
                    break;
                case 'button_click':
                    settings.title = '🖱️ Нажатие кнопки';
                    settings.color = 0xAA00FF; // Фиолетовый
                    break;
                case 'auto_unmute':
                    settings.title = '🔊 Автоматическое снятие мута';
                    settings.color = 0x00FF00; // Зеленый
                    break;
                    
                // События пользователей
                case 'user_join':
                    settings.title = '👋 Новый участник <:URA:1380225089387102358>';
                    settings.color = 0x00FF00; // Зеленый
                    break;
                case 'user_leave':
                    settings.title = '👋 Участник покинул сервер, пидор блять'; // крах скоро
                    settings.color = 0xFF5555; // Красно-розовый
                    break;
                case 'user_banned':
                    settings.title = '🔨 Участник забанен';
                    settings.color = 0xFF0000; // Красный
                    break;
                case 'user_unbanned':
                    settings.title = '🔓 Участник разбанен';
                    settings.color = 0x00FF00; // Зеленый
                    break;
                    
                // События изменения участников
                case 'member_nickname_change':
                    settings.title = '📝 Изменение никнейма';
                    settings.color = 0x00AAFF; // Голубой
                    break;
                case 'member_roles_add':
                    settings.title = '➕ Добавление ролей'; 
                    settings.color = 0x00FF00; // Зеленый
                    break;
                case 'member_roles_remove':
                    settings.title = '➖ Удаление ролей';
                    settings.color = 0xFF5555; // Красно-розовый
                    break;
                case 'member_timeout_add':
                    settings.title = '⏰ Таймаут добавлен';
                    settings.color = 0xFFAA00; // Оранжевый
                    break;
                case 'member_timeout_remove':
                    settings.title = '⏰ Таймаут снят';
                    settings.color = 0x00FF00; // Зеленый
                    break;
                    
                // События ролей
                case 'role_create':
                    settings.title = '🏷️ Создана новая роль';
                    settings.color = 0x00FF00; // Зеленый
                    break;
                case 'role_delete':
                    settings.title = '🏷️ Удалена роль';
                    settings.color = 0xFF5555; // Красно-розовый
                    break;
                case 'role_update':
                    settings.title = '🏷️ Изменена роль';
                    settings.color = 0xFFAA00; // Оранжевый
                    break;
                    
                // События каналов
                case 'channel_create':
                    settings.title = '📝 Создан новый канал';
                    settings.color = 0x00FF00; // Зеленый
                    break;
                case 'channel_delete':
                    settings.title = '📝 Удален канал';
                    settings.color = 0xFF5555; // Красно-розовый
                    break;
                case 'channel_update':
                    settings.title = '📝 Изменен канал';
                    settings.color = 0xFFAA00; // Оранжевый
                    break;
                    
                // События эмодзи и стикеров
                case 'emoji_create':
                    settings.title = '😀 Добавлен новый эмодзи';
                    settings.color = 0x00FF00; // Зеленый
                    break;
                case 'emoji_delete':
                    settings.title = '😀 Удален эмодзи';
                    settings.color = 0xFF5555; // Красно-розовый
                    break;
                case 'emoji_update':
                    settings.title = '😀 Изменен эмодзи';
                    settings.color = 0xFFAA00; // Оранжевый
                    break;
                case 'sticker_create':
                    settings.title = '🏷️ Добавлен новый стикер';
                    settings.color = 0x00FF00; // Зеленый
                    break;
                case 'sticker_delete':
                    settings.title = '🏷️ Удален стикер';
                    settings.color = 0xFF5555; // Красно-розовый
                    break;
                case 'sticker_update':
                    settings.title = '🏷️ Изменен стикер';
                    settings.color = 0xFFAA00; // Оранжевый
                    break;
                    
                // События гильдии
                case 'guild_update':
                    settings.title = '🏰 Изменения сервера';
                    settings.color = 0xFFAA00; // Оранжевый
                    break;
                    
                // События голосовых каналов
                case 'voice_join':
                    settings.title = '🎤 Подключение к голосовому каналу';
                    settings.color = 0x00FF00; // Зеленый
                    break;
                case 'voice_leave':
                    settings.title = '🎤 Отключение от голосового канала';
                    settings.color = 0xFF5555; // Красно-розовый
                    break;
                case 'voice_move':
                    settings.title = '🎤 Переход между голосовыми каналами';
                    settings.color = 0xFFAA00; // Оранжевый
                    break;
                    
                default:
                    // Оставляем значения по умолчанию
            }
            break;
            
        case 'error':
            settings.title = '❌ Ошибка: ' + actionSubtype;
            settings.color = 0xFF0000; // Красный
            settings.contentLabel = 'Сообщение об ошибке';
            break;
            
        case 'security':
            settings.title = '🔒 Безопасность';
            settings.color = 0xFF00FF; // Пурпурный
            settings.contentLabel = 'Детали';
            
            switch (actionSubtype) {
                case 'raid_detected':
                    settings.title = '⚠️ Обнаружен рейд';
                    settings.color = 0xFF0000; // Красный
                    break;
                case 'spam_detected':
                    settings.title = '🔍 Обнаружен спам';
                    settings.color = 0xFF9900; // Оранжевый
                    break;
                default:
                    // Оставляем значения по умолчанию
            }
            break;
            
        case 'ai_moderation':
            settings.title = '🤖 ИИ Модерация';
            settings.color = 0x9900FF; // Фиолетовый
            settings.contentLabel = 'Результат проверки';
            break;
            
        default:
            // Оставляем базовые настройки
    }
    
    return settings;
}

/**
 * Форматирует метаданные в зависимости от типа действия
 * @param {Object} metadata - Метаданные
 * @param {string} actionType - Тип действия
 * @param {string} actionSubtype - Подтип действия
 * @returns {Object} - Форматированные метаданные
 */
function formatMetadata(metadata, actionType, actionSubtype) {
    const formatted = {};
    
    // Форматирование в зависимости от типа действия
    switch (actionType) {
        case 'message':
            // Форматируем данные о вложениях
            if (metadata.attachments > 0) {
                formatted['Вложения'] = `${metadata.attachments} файл(ов)`;
                
                // Если есть детальная информация о вложениях
                if (Array.isArray(metadata.attachments)) {
                    const attachmentsList = metadata.attachments.map(a => 
                        `[${a.name}](${a.url}) (${formatBytes(a.size)})`
                    ).join('\n');
                    
                    if (attachmentsList) {
                        formatted['Список вложений'] = attachmentsList.substring(0, 1024);
                    }
                }
            }
            
            // Форматируем данные о упоминаниях
            if (metadata.mentions && (metadata.mentions.users > 0 || metadata.mentions.roles > 0 || metadata.mentions.everyone)) {
                const mentionParts = [];
                
                if (metadata.mentions.users > 0) mentionParts.push(`${metadata.mentions.users} пользователей`);
                if (metadata.mentions.roles > 0) mentionParts.push(`${metadata.mentions.roles} ролей`);
                if (metadata.mentions.everyone) mentionParts.push(`@everyone/@here`);
                
                formatted['Упоминания'] = mentionParts.join(', ');
            }
            
            // Для редактирования сообщений
            if (actionSubtype === 'edit' && metadata.oldContent && metadata.newContent) {
                // Показываем только если содержимое действительно изменилось
                if (metadata.oldContent !== metadata.newContent) {
                    formatted['Было'] = '```\n' + (metadata.oldContent.substring(0, 500) || '*пусто*') + '\n```';
                    formatted['Стало'] = '```\n' + (metadata.newContent.substring(0, 500) || '*пусто*') + '\n```';
                }
            }
            break;
            
        case 'command':
            // Форматируем опции команды
            if (metadata.options && Array.isArray(metadata.options) && metadata.options.length > 0) {
                const optionsFormatted = metadata.options.map(opt => {
                    if (opt.options) {
                        return `${opt.name}: ${opt.options.map(subOpt => `${subOpt.name}=${subOpt.value}`).join(', ')}`;
                    }
                    return `${opt.name}=${opt.value}`;
                }).join('\n');
                
                if (optionsFormatted) {
                    formatted['Параметры'] = '```\n' + optionsFormatted + '\n```';
                }
            }
            
            // Если команда завершилась с ошибкой
            if (metadata.error) {
                formatted['Ошибка'] = metadata.error.message || 'Неизвестная ошибка';
            }
            break;
            
        case 'moderation':
            // Добавляем длительность для временных наказаний
            if (metadata.duration) {
                formatted['Длительность'] = metadata.duration;
            }
            break;
            
        case 'system':
            // Для системных событий просто показываем все данные
            if (actionSubtype === 'level_up') {
                formatted['Старый уровень'] = metadata.oldLevel;
                formatted['Новый уровень'] = metadata.newLevel;
                formatted['Опыт'] = metadata.xp;
            } else if (actionSubtype === 'bot_start') {
                formatted['Версия'] = metadata.version;
                formatted['Сборка'] = metadata.build;
                formatted['Серверов'] = metadata.servers;
                formatted['Пользователей'] = metadata.users;
            } else if (actionSubtype === 'user_join') {
                formatted['Дата создания аккаунта'] = new Date(metadata.createdAt).toLocaleString('ru-RU');
                formatted['Возраст аккаунта'] = `${metadata.accountAge} дней`;
            } else if (actionSubtype === 'user_leave') {
                if (metadata.roles && metadata.roles.length > 0) {
                    formatted['Роли'] = metadata.roles.join(', ');
                }
                if (metadata.joinedAt) {
                    formatted['Присоединился'] = new Date(metadata.joinedAt).toLocaleString('ru-RU');
                }
            } else if (actionSubtype === 'user_banned' || actionSubtype === 'user_unbanned') {
                if (metadata.reason) {
                    formatted['Причина'] = metadata.reason;
                }
            } else if (actionSubtype === 'member_nickname_change') {
                formatted['Старый никнейм'] = metadata.oldNickname;
                formatted['Новый никнейм'] = metadata.newNickname;
            } else if (actionSubtype === 'member_roles_add' || actionSubtype === 'member_roles_remove') {
                if (metadata.roles && metadata.roles.length > 0) {
                    const rolesList = metadata.roles.map(role => 
                        `<@&${role.id}> (${role.name})`
                    ).join('\n');
                    
                    formatted['Роли'] = rolesList;
                }
            } else if (actionSubtype === 'member_timeout_add') {
                formatted['До'] = new Date(metadata.until).toLocaleString('ru-RU');
                formatted['Длительность'] = formatTimeUntil(metadata.until);
            } else if (actionSubtype === 'role_create') {
                formatted['Название'] = metadata.name;
                formatted['Цвет'] = metadata.color;
                formatted['Отображается отдельно'] = metadata.hoist ? 'Да' : 'Нет';
                formatted['Упоминаемая'] = metadata.mentionable ? 'Да' : 'Нет';
                formatted['Позиция'] = metadata.position;
                
                if (metadata.permissions && metadata.permissions.length > 0) {
                    formatted['Права'] = '```\n' + metadata.permissions.join(', ') + '\n```';
                }
            } else if (actionSubtype === 'role_delete') {
                formatted['Название'] = metadata.name;
                formatted['Цвет'] = metadata.color;
                formatted['Позиция'] = metadata.position;
            } else if (actionSubtype === 'role_update') {
                if (metadata.changes) {
                    if (metadata.changes.name) {
                        formatted['Название изменено'] = `${metadata.changes.name.old} → ${metadata.changes.name.new}`;
                    }
                    
                    if (metadata.changes.color) {
                        formatted['Цвет изменен'] = `${metadata.changes.color.old} → ${metadata.changes.color.new}`;
                    }
                    
                    if (metadata.changes.hoist !== undefined) {
                        formatted['Отображение отдельно'] = `${metadata.changes.hoist.old ? 'Да' : 'Нет'} → ${metadata.changes.hoist.new ? 'Да' : 'Нет'}`;
                    }
                    
                    if (metadata.changes.mentionable !== undefined) {
                        formatted['Упоминаемость'] = `${metadata.changes.mentionable.old ? 'Да' : 'Нет'} → ${metadata.changes.mentionable.new ? 'Да' : 'Нет'}`;
                    }
                    
                    if (metadata.changes.position) {
                        formatted['Позиция изменена'] = `${metadata.changes.position.old} → ${metadata.changes.position.new}`;
                    }
                    
                    if (metadata.changes.permissions) {
                        if (metadata.changes.permissions.added && metadata.changes.permissions.added.length > 0) {
                            formatted['Добавлены права'] = '```\n' + metadata.changes.permissions.added.join(', ') + '\n```';
                        }
                        
                        if (metadata.changes.permissions.removed && metadata.changes.permissions.removed.length > 0) {
                            formatted['Удалены права'] = '```\n' + metadata.changes.permissions.removed.join(', ') + '\n```';
                        }
                    }
                }
            } else if (actionSubtype === 'channel_create' || actionSubtype === 'channel_delete') {
                formatted['Название'] = metadata.name;
                formatted['Тип'] = formatChannelType(metadata.type);
                
                if (metadata.parentId) {
                    formatted['Категория'] = `<#${metadata.parentId}>`;
                }
                
                formatted['Позиция'] = metadata.position;
            } else if (actionSubtype === 'channel_update') {
                if (metadata.changes) {
                    if (metadata.changes.name) {
                        formatted['Название изменено'] = `${metadata.changes.name.old} → ${metadata.changes.name.new}`;
                    }
                    
                    if (metadata.changes.parentId) {
                        const oldParent = metadata.changes.parentId.oldParentName ? metadata.changes.parentId.oldParentName : 'Нет';
                        const newParent = metadata.changes.parentId.newParentName ? metadata.changes.parentId.newParentName : 'Нет';
                        
                        formatted['Категория изменена'] = `${oldParent} → ${newParent}`;
                    }
                    
                    if (metadata.changes.position) {
                        formatted['Позиция изменена'] = `${metadata.changes.position.old} → ${metadata.changes.position.new}`;
                    }
                    
                    if (metadata.changes.topic) {
                        formatted['Тема изменена'] = `${metadata.changes.topic.old} → ${metadata.changes.topic.new}`;
                    }
                    
                    if (metadata.changes.nsfw !== undefined) {
                        formatted['NSFW'] = `${metadata.changes.nsfw.old ? 'Да' : 'Нет'} → ${metadata.changes.nsfw.new ? 'Да' : 'Нет'}`;
                    }
                    
                    if (metadata.changes.slowmode !== undefined) {
                        formatted['Медленный режим'] = `${formatSlowmode(metadata.changes.slowmode.old)} → ${formatSlowmode(metadata.changes.slowmode.new)}`;
                    }
                }
            } else if (actionSubtype === 'emoji_create') {
                formatted['Название'] = metadata.name;
                formatted['Анимированный'] = metadata.animated ? 'Да' : 'Нет';
                formatted['URL'] = metadata.url;
            } else if (actionSubtype === 'emoji_delete') {
                formatted['Название'] = metadata.name;
            } else if (actionSubtype === 'emoji_update') {
                formatted['Старое название'] = metadata.oldName;
                formatted['Новое название'] = metadata.newName;
                formatted['URL'] = metadata.url;
            } else if (actionSubtype === 'sticker_create') {
                formatted['Название'] = metadata.name;
                formatted['Описание'] = metadata.description || 'Нет';
                formatted['Теги'] = metadata.tags || 'Нет';
                formatted['URL'] = metadata.url;
            } else if (actionSubtype === 'sticker_delete') {
                formatted['Название'] = metadata.name;
            } else if (actionSubtype === 'sticker_update') {
                if (metadata.changes) {
                    if (metadata.changes.name) {
                        formatted['Название изменено'] = `${metadata.changes.name.old} → ${metadata.changes.name.new}`;
                    }
                    
                    if (metadata.changes.description) {
                        formatted['Описание изменено'] = `${metadata.changes.description.old || 'Нет'} → ${metadata.changes.description.new || 'Нет'}`;
                    }
                    
                    if (metadata.changes.tags) {
                        formatted['Теги изменены'] = `${metadata.changes.tags.old || 'Нет'} → ${metadata.changes.tags.new || 'Нет'}`;
                    }
                }
            } else if (actionSubtype === 'guild_update') {
                if (metadata.changes) {
                    if (metadata.changes.name) {
                        formatted['Название изменено'] = `${metadata.changes.name.old} → ${metadata.changes.name.new}`;
                    }
                    
                    if (metadata.changes.description) {
                        formatted['Описание изменено'] = `${metadata.changes.description.old} → ${metadata.changes.description.new}`;
                    }
                    
                    if (metadata.changes.vanityURL) {
                        formatted['Персональная ссылка изменена'] = `${metadata.changes.vanityURL.old} → ${metadata.changes.vanityURL.new}`;
                    }
                    
                    if (metadata.changes.owner) {
                        formatted['Владелец изменен'] = `${metadata.changes.owner.old.tag} (${metadata.changes.owner.old.id}) → ${metadata.changes.owner.new.tag} (${metadata.changes.owner.new.id})`;
                    }
                    
                    if (metadata.changes.icon) {
                        formatted['Иконка изменена'] = 'Иконка сервера была обновлена';
                    }
                    
                    if (metadata.changes.banner) {
                        formatted['Баннер изменен'] = 'Баннер сервера был обновлен';
                    }
                }
            } else if (actionSubtype === 'voice_join' || actionSubtype === 'voice_leave') {
                formatted['Канал'] = `<#${metadata.channelId}> (${metadata.channelName})`;
            } else if (actionSubtype === 'voice_move') {
                formatted['Из канала'] = `<#${metadata.oldChannelId}> (${metadata.oldChannelName})`;
                formatted['В канал'] = `<#${metadata.newChannelId}> (${metadata.newChannelName})`;
            } else if (actionSubtype === 'auto_unmute') {
                formatted['Длительность мута'] = metadata.muteDuration;
            } else {
                // Для других системных событий - показываем JSON
                formatted['Детали'] = '```json\n' + JSON.stringify(metadata, null, 2).substring(0, 1000) + '\n```';
            }
            break;
            
        case 'error':
            // Для ошибок показываем стек вызовов
            if (metadata.stack) {
                formatted['Стек вызовов'] = '```\n' + metadata.stack.substring(0, 1000) + '\n```';
            }
            if (metadata.context) {
                formatted['Контекст'] = metadata.context;
            }
            break;
            
        default:
            // Для всех остальных типов - просто выводим JSON
            formatted['Детали'] = '```json\n' + JSON.stringify(metadata, null, 2).substring(0, 1000) + '\n```';
    }
    
    return formatted;
}

/**
 * Форматирует размер файла в байтах в человекочитаемый формат
 * @param {number} bytes - Размер в байтах
 * @returns {string} - Форматированный размер
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 Байт';
    
    const sizes = ['Байт', 'КБ', 'МБ', 'ГБ', 'ТБ'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Поиск логов по фильтрам
 * @param {Object} filters - Фильтры для поиска
 * @param {number} limit - Максимальное количество результатов
 * @returns {Promise<Array>} - Массив найденных логов
 */
async function searchLogs(filters = {}, limit = 10) {
    try {
        return await ActionLog.find(filters).sort({ timestamp: -1 }).limit(limit);
    } catch (error) {
        console.error('Ошибка при поиске логов:', error);
        return [];
    }
}

/**
 * Логирует сообщение пользователя
 * @param {Object} message - Объект сообщения Discord
 */
async function logUserMessage(message) {
    if (message.author.bot) return;
    
    await logAdvancedAction({
        actionType: 'message',
        actionSubtype: 'create',
        userId: message.author.id,
        guildId: message.guild.id,
        channelId: message.channel.id,
        messageId: message.id,
        content: message.content,
        metadata: {
            attachments: message.attachments.size,
            embeds: message.embeds.length,
            mentions: {
                users: message.mentions.users.size,
                roles: message.mentions.roles.size,
                everyone: message.mentions.everyone
            }
        },
        guild: message.guild
    });
}

/**
 * Логирует изменение сообщения
 * @param {Object} oldMessage - Старое сообщение
 * @param {Object} newMessage - Новое сообщение
 */
async function logMessageEdit(oldMessage, newMessage) {
    if (oldMessage.author.bot) return;
    
    await logAdvancedAction({
        actionType: 'message',
        actionSubtype: 'edit',
        userId: oldMessage.author.id,
        guildId: oldMessage.guild.id,
        channelId: oldMessage.channel.id,
        messageId: oldMessage.id,
        content: `**До:** ${oldMessage.content}\n**После:** ${newMessage.content}`,
        metadata: {
            oldContent: oldMessage.content,
            newContent: newMessage.content,
            attachments: newMessage.attachments.size,
            embeds: newMessage.embeds.length
        },
        guild: oldMessage.guild
    });
}

/**
 * Логирует удаление сообщения
 * @param {Object} message - Удаленное сообщение
 */
async function logMessageDelete(message) {
    if (message.author.bot) return;
    
    await logAdvancedAction({
        actionType: 'message',
        actionSubtype: 'delete',
        userId: message.author.id,
        guildId: message.guild.id,
        channelId: message.channel.id,
        messageId: message.id,
        content: message.content,
        metadata: {
            attachments: Array.from(message.attachments.values()).map(a => ({
                name: a.name,
                url: a.url,
                size: a.size
            })),
            embeds: message.embeds.length
        },
        guild: message.guild
    });
}

/**
 * Логирует выполнение команды
 * @param {Object} interaction - Объект взаимодействия Discord
 * @param {boolean} successful - Успешность выполнения команды
 * @param {Object} error - Объект ошибки (если есть)
 */
async function logCommand(interaction, successful = true, error = null) {
    const options = interaction.options?.data || [];
    const optionsString = options.map(opt => {
        if (opt.options) {
            return `${opt.name}: ${opt.options.map(subOpt => `${subOpt.name}=${subOpt.value}`).join(', ')}`;
        }
        return `${opt.name}=${opt.value}`;
    }).join(', ');
    
    await logAdvancedAction({
        actionType: 'command',
        actionSubtype: interaction.commandName,
        userId: interaction.user.id,
        guildId: interaction.guild.id,
        channelId: interaction.channel.id,
        content: `/${interaction.commandName} ${optionsString}`,
        metadata: {
            options: options,
            successful,
            error: error ? {
                message: error.message,
                stack: error.stack
            } : null
        },
        successful,
        guild: interaction.guild
    });
}

/**
 * Логирует модерационное действие
 * @param {Object} options - Параметры модерационного действия
 */
async function logModeration(options) {
    const {
        guild,
        moderator,
        target,
        action,
        reason,
        duration = null
    } = options;
    
    await logAdvancedAction({
        actionType: 'moderation',
        actionSubtype: action,
        userId: moderator.id,
        targetId: target.id,
        guildId: guild.id,
        content: reason || 'Причина не указана',
        metadata: {
            duration,
            actionType: action
        },
        guild
    });
}

/**
 * Логирует системное событие
 * @param {Object} guild - Объект сервера Discord
 * @param {string} event - Название события
 * @param {Object} data - Данные события
 */
async function logSystemEvent(guild, event, data = {}) {
    await logAdvancedAction({
        actionType: 'system',
        actionSubtype: event,
        guildId: guild.id,
        content: `Системное событие: ${event}`,
        metadata: data,
        guild
    });
}

/**
 * Логирует ошибку
 * @param {Object} guild - Объект сервера Discord
 * @param {Error} error - Объект ошибки
 * @param {string} context - Контекст ошибки
 */
async function logError(guild, error, context = '') {
    await logAdvancedAction({
        actionType: 'error',
        actionSubtype: error.name,
        guildId: guild.id,
        content: `${context}: ${error.message}`,
        metadata: {
            stack: error.stack,
            context
        },
        successful: false,
        guild
    });
}

/**
 * Форматирует тип канала в человекочитаемый формат
 * @param {number} type - Тип канала
 * @returns {string} - Форматированный тип
 */
function formatChannelType(type) {
    const types = {
        0: 'Текстовый',
        2: 'Голосовой',
        4: 'Категория',
        5: 'Новости',
        13: 'Трибуна',
        15: 'Форум'
    };
    
    return types[type] || `Неизвестный (${type})`;
}

/**
 * Форматирует время медленного режима
 * @param {number} seconds - Время в секундах
 * @returns {string} - Форматированное время
 */
function formatSlowmode(seconds) {
    if (seconds === 0) return 'Выключен';
    if (seconds < 60) return `${seconds} сек.`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} мин.`;
    return `${Math.floor(seconds / 3600)} ч. ${Math.floor((seconds % 3600) / 60)} мин.`;
}

/**
 * Форматирует оставшееся время до даты
 * @param {Date|string} date - Дата
 * @returns {string} - Форматированное время
 */
function formatTimeUntil(date) {
    const now = new Date();
    const target = new Date(date);
    const diff = target - now;
    
    if (diff <= 0) return 'Истекло';
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    let result = '';
    if (days > 0) result += `${days} д. `;
    if (hours > 0 || days > 0) result += `${hours} ч. `;
    result += `${minutes} мин.`;
    
    return result;
}

module.exports = {
    logAdvancedAction,
    logUserMessage,
    logMessageEdit,
    logMessageDelete,
    logCommand,
    logModeration,
    logSystemEvent,
    logError,
    searchLogs,
    formatChannelType,
    formatSlowmode,
    formatTimeUntil
}; 