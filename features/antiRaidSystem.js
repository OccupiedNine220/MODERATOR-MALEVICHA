const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

/**
 * Класс для отслеживания потенциальных рейд-атак на сервер
 */
class AntiRaidSystem {
    constructor() {
        // Карта для отслеживания новых участников {guildId: {userId: joinTimestamp}}
        this.newMembers = new Map();
        
        // Карта для отслеживания серверов с активированной защитой {guildId: {enabled, threshold, timeWindow, action, endTime}}
        this.protectedGuilds = new Map();
        
        // Константы по умолчанию
        this.DEFAULT_THRESHOLD = 5; // Количество новых пользователей для срабатывания
        this.DEFAULT_TIME_WINDOW = 10 * 1000; // Временное окно в миллисекундах (10 секунд)
        this.DEFAULT_DURATION = 30 * 60 * 1000; // Продолжительность защиты (30 минут)
        this.CLEANUP_INTERVAL = 60 * 60 * 1000; // Интервал очистки (1 час)
        
        // Запускаем регулярную очистку данных
        setInterval(this.cleanup.bind(this), this.CLEANUP_INTERVAL);
    }
    
    /**
     * Инициализирует систему анти-рейда для всех серверов
     * @param {Client} client - Клиент Discord.js
     */
    init(client) {
        console.log('Система анти-рейда инициализирована');
    }
    
    /**
     * Обрабатывает присоединение нового участника
     * @param {GuildMember} member - Объект участника Discord
     * @returns {boolean} - True, если участник был обработан как потенциальный рейдер
     */
    async handleMemberJoin(member) {
        const { guild, user } = member;
        const guildId = guild.id;
        
        // Проверяем, включена ли защита для этого сервера
        if (this.isProtectionActive(guildId)) {
            // Если защита активна, применяем выбранное действие к новому участнику
            await this.applyProtection(member);
            return true;
        }
        
        // Получаем или создаем карту для сервера
        if (!this.newMembers.has(guildId)) {
            this.newMembers.set(guildId, new Map());
        }
        
        // Получаем текущее время
        const now = Date.now();
        
        // Добавляем нового участника в карту
        this.newMembers.get(guildId).set(user.id, now);
        
        // Проверяем, не является ли это рейдом
        const result = this.checkForRaid(guildId);
        
        if (result.isRaid) {
            // Активируем защиту от рейда
            await this.activateRaidProtection(guild, result.members.length);
            return true;
        }
        
        return false;
    }
    
    /**
     * Проверяет, не является ли активность на сервере рейдом
     * @param {string} guildId - ID сервера
     * @returns {Object} - Результат проверки {isRaid, members}
     */
    checkForRaid(guildId) {
        if (!this.newMembers.has(guildId)) {
            return { isRaid: false, members: [] };
        }
        
        const guildMembers = this.newMembers.get(guildId);
        const now = Date.now();
        const threshold = this.DEFAULT_THRESHOLD;
        const timeWindow = this.DEFAULT_TIME_WINDOW;
        
        // Получаем всех участников, присоединившихся в указанное временное окно
        const recentMembers = [];
        for (const [userId, joinTime] of guildMembers.entries()) {
            if (now - joinTime <= timeWindow) {
                recentMembers.push(userId);
            }
        }
        
        // Проверяем, превышено ли пороговое значение
        return {
            isRaid: recentMembers.length >= threshold,
            members: recentMembers
        };
    }
    
    /**
     * Активирует защиту от рейда на сервере
     * @param {Guild} guild - Объект сервера Discord
     * @param {number} count - Количество обнаруженных подозрительных участников
     */
    async activateRaidProtection(guild, count) {
        try {
            const guildId = guild.id;
            const duration = this.DEFAULT_DURATION;
            const action = 'none'; // По умолчанию: kick, ban
            
            // Устанавливаем защиту
            this.protectedGuilds.set(guildId, {
                enabled: true,
                threshold: this.DEFAULT_THRESHOLD,
                timeWindow: this.DEFAULT_TIME_WINDOW,
                action,
                endTime: Date.now() + duration
            });
            
            // Отправляем уведомление администраторам
            await this.notifyAdmins(guild, count, action, duration);
            
            console.log(`Защита от рейда активирована на сервере ${guild.name}`);
            
            // Устанавливаем таймер для автоматического отключения защиты
            setTimeout(() => {
                this.deactivateRaidProtection(guildId);
            }, duration);
        } catch (error) {
            console.error('Ошибка при активации защиты от рейда:', error);
        }
    }
    
    /**
     * Деактивирует защиту от рейда на сервере
     * @param {string} guildId - ID сервера
     */
    async deactivateRaidProtection(guildId) {
        if (this.protectedGuilds.has(guildId)) {
            this.protectedGuilds.delete(guildId);
            console.log(`Защита от рейда деактивирована на сервере ${guildId}`);
        }
    }
    
    /**
     * Применяет защиту к новому участнику
     * @param {GuildMember} member - Объект участника Discord
     */
    async applyProtection(member) {
        const { guild, user } = member;
        const guildId = guild.id;
        
        if (!this.protectedGuilds.has(guildId)) return;
        
        const { action } = this.protectedGuilds.get(guildId);
        
        try {
            switch (action) {
                case 'kick':
                    if (member.kickable) {
                        await member.kick('Защита от рейда: подозрительная активность');
                        console.log(`Участник ${user.tag} был кикнут из-за защиты от рейда`);
                    }
                    break;
                    
                case 'ban':
                    if (member.bannable) {
                        await member.ban({ 
                            reason: 'Защита от рейда: подозрительная активность',
                            deleteMessageSeconds: 60 * 60 // Удаляем сообщения за последний час
                        });
                        console.log(`Участник ${user.tag} был забанен из-за защиты от рейда`);
                    }
                    break;
                    
                default:
                    // По умолчанию просто логируем
                    console.log(`Участник ${user.tag} присоединился во время активной защиты от рейда`);
                    break;
            }
        } catch (error) {
            console.error(`Ошибка при применении защиты к участнику ${user.tag}:`, error);
        }
    }
    
    /**
     * Уведомляет администраторов о рейде
     * @param {Guild} guild - Объект сервера Discord
     * @param {number} count - Количество обнаруженных подозрительных участников
     * @param {string} action - Тип защиты (kick, ban)
     * @param {number} duration - Продолжительность защиты в миллисекундах
     */
    async notifyAdmins(guild, count, action, duration) {
        try {
            // Находим системный канал или канал для модерации
            const systemChannel = guild.systemChannel;
            if (!systemChannel) return;
            
            // Создаем эмбед для уведомления
            const embed = new EmbedBuilder()
                .setTitle('🚨 Обнаружена рейд-атака!')
                .setDescription(`Система анти-рейда обнаружила подозрительную активность: **${count}** новых участников за короткий промежуток времени`)
                .addFields(
                    { name: '🛡️ Активирована защита', value: `Тип: **${this.getActionName(action)}**`, inline: true },
                    { name: '⏱️ Продолжительность', value: `${Math.floor(duration / 60000)} минут`, inline: true }
                )
                .setColor('#ff0000')
                .setTimestamp()
                .setFooter({ text: 'Система защиты от рейда' });
            
            // Отправляем уведомление
            await systemChannel.send({ 
                content: '@here', 
                embeds: [embed] 
            });
        } catch (error) {
            console.error('Ошибка при отправке уведомления администраторам:', error);
        }
    }
    
    /**
     * Проверяет, активна ли защита для сервера
     * @param {string} guildId - ID сервера
     * @returns {boolean} - True, если защита активна
     */
    isProtectionActive(guildId) {
        if (!this.protectedGuilds.has(guildId)) {
            return false;
        }
        
        const { enabled, endTime } = this.protectedGuilds.get(guildId);
        
        // Проверяем, не истек ли срок защиты
        if (enabled && Date.now() > endTime) {
            this.deactivateRaidProtection(guildId);
            return false;
        }
        
        return enabled;
    }
    
    /**
     * Возвращает текстовое описание действия
     * @param {string} action - Тип действия (kick, ban)
     * @returns {string} - Описание действия
     */
    getActionName(action) {
        switch (action) {
            case 'kick':
                return 'Кик';
            case 'ban':
                return 'Бан';
            default:
                return 'Мониторинг';
        }
    }
    
    /**
     * Включает ручную защиту от рейда
     * @param {Guild} guild - Объект сервера Discord
     * @param {string} action - Тип защиты (kick, ban)
     * @param {number} duration - Продолжительность защиты в минутах
     * @returns {Object} - Информация о включенной защите
     */
    async enableManualProtection(guild, action = 'kick', duration = 30) {
        try {
            const guildId = guild.id;
            const durationMs = duration * 60 * 1000;
            
            // Устанавливаем защиту
            this.protectedGuilds.set(guildId, {
                enabled: true,
                threshold: this.DEFAULT_THRESHOLD,
                timeWindow: this.DEFAULT_TIME_WINDOW,
                action,
                endTime: Date.now() + durationMs
            });
            
            // Уведомляем администраторов
            await this.notifyAdmins(guild, 0, action, durationMs);
            
            // Устанавливаем таймер для автоматического отключения защиты
            setTimeout(() => {
                this.deactivateRaidProtection(guildId);
            }, durationMs);
            
            return { 
                success: true, 
                message: `Защита от рейда (${this.getActionName(action)}) активирована на ${duration} минут` 
            };
        } catch (error) {
            console.error('Ошибка при включении защиты от рейда:', error);
            return { success: false, message: `Ошибка: ${error.message}` };
        }
    }
    
    /**
     * Отключает ручной режим защиты от рейда
     * @param {string} guildId - ID сервера
     * @returns {Object} - Результат операции
     */
    async disableManualProtection(guildId) {
        try {
            if (!this.protectedGuilds.has(guildId)) {
                return { 
                    success: false, 
                    message: 'Защита от рейда не была активирована' 
                };
            }
            
            await this.deactivateRaidProtection(guildId);
            
            return { 
                success: true, 
                message: 'Защита от рейда успешно деактивирована' 
            };
        } catch (error) {
            console.error('Ошибка при отключении защиты от рейда:', error);
            return { success: false, message: `Ошибка: ${error.message}` };
        }
    }
    
    /**
     * Получает текущее состояние защиты для сервера
     * @param {string} guildId - ID сервера
     * @returns {Object|null} - Информация о состоянии защиты или null
     */
    getProtectionStatus(guildId) {
        if (!this.protectedGuilds.has(guildId)) {
            return null;
        }
        
        const protection = this.protectedGuilds.get(guildId);
        
        return {
            enabled: protection.enabled,
            action: protection.action,
            actionName: this.getActionName(protection.action),
            timeLeft: Math.max(0, protection.endTime - Date.now()),
            threshold: protection.threshold
        };
    }
    
    /**
     * Очищает старые данные
     */
    cleanup() {
        const now = Date.now();
        
        // Очищаем неактивные серверы
        for (const [guildId, protection] of this.protectedGuilds.entries()) {
            if (now > protection.endTime) {
                this.deactivateRaidProtection(guildId);
            }
        }
        
        // Очищаем данные о новых участниках старше одного часа
        for (const [guildId, members] of this.newMembers.entries()) {
            const hourAgo = now - 60 * 60 * 1000;
            
            for (const [userId, joinTime] of members.entries()) {
                if (joinTime < hourAgo) {
                    members.delete(userId);
                }
            }
            
            // Если карта пустая, удаляем ее
            if (members.size === 0) {
                this.newMembers.delete(guildId);
            }
        }
    }
}

// Создаем и экспортируем экземпляр класса
const antiRaidSystem = new AntiRaidSystem();

module.exports = antiRaidSystem; 