const mongoose = require('mongoose');

// Схема для мутов
const muteSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    guildId: { type: String, required: true },
    endTime: { type: Date, required: true },
    reason: { type: String, default: 'Не указана' },
    addedAt: { type: Date, default: Date.now },
    addedBy: { type: String }
});

// Схема для банов
const banSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    guildId: { type: String, required: true },
    reason: { type: String, default: 'Не указана' },
    moderatorId: { type: String },
    createdAt: { type: Date, default: Date.now }
});

// Схема для предупреждений
const warningSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    guildId: { type: String, required: true },
    warnings: [{
        ruleId: { type: String, required: true },
        reason: { type: String, required: true },
        moderatorId: { type: String, required: true },
        timestamp: { type: Date, default: Date.now }
    }]
});

// Схема для одиночных предупреждений (для статистики)
const warnSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    guildId: { type: String, required: true },
    reason: { type: String, required: true },
    moderatorId: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

// Схема для пользователей (система уровней)
const userSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    guildId: { type: String, required: true },
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 0 },
    messages: { type: Number, default: 0 },
    voiceTime: { type: Number, default: 0 },  // в минутах
    lastMessageDate: { type: Date, default: Date.now }
});

// Схема для временных ролей
const tempRoleSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    guildId: { type: String, required: true },
    roleId: { type: String, required: true },
    roleName: { type: String, required: true },
    reason: { type: String, default: 'Временная роль' },
    addedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    addedBy: { type: String }
});

// Схема для кланов
const clanSchema = new mongoose.Schema({
    name: { type: String, required: true },
    owner: { type: String, required: true },
    description: { type: String, default: '' },
    emoji: { type: String, default: '🏰' },
    members: [{ type: String }],
    level: { type: Number, default: 1 },
    exp: { type: Number, default: 0 },
    power: { type: Number, default: 100 },
    channelId: { type: String },
    roleId: { type: String }
});

// Схема для статистики модераторов
const modStatsSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    guildId: { type: String, required: true },
    actions: {
        mutes: { type: Number, default: 0 },
        bans: { type: Number, default: 0 },
        kicks: { type: Number, default: 0 },
        warns: { type: Number, default: 0 }
    }
});

// Схема для показателей риска пользователей
const riskPointsSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    guildId: { type: String, required: true },
    totalPoints: { type: Number, default: 0 },
    history: [{
        points: { type: Number, required: true },
        reason: { type: String, required: true },
        timestamp: { type: Date, default: Date.now }
    }]
});

// Схема для тикетов
const ticketSchema = new mongoose.Schema({
    channelId: { type: String, required: true },
    userId: { type: String, required: true }, 
    guildId: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    closed: { type: Boolean, default: false }
});

// Схема для логирования всех действий
const actionLogSchema = new mongoose.Schema({
    // Основная информация о действии
    actionType: { type: String, required: true }, // Тип действия (message, command, moderation, etc.)
    actionSubtype: { type: String }, // Подтип действия (ban, mute, etc.)
    
    // Информация о пользователях
    userId: { type: String }, // ID пользователя, совершившего действие
    targetId: { type: String }, // ID цели действия (если есть)
    
    // Контекст
    guildId: { type: String, required: true },
    channelId: { type: String },
    messageId: { type: String },
    
    // Содержимое
    content: { type: String }, // Содержимое сообщения или другая текстовая информация
    
    // Метаданные
    timestamp: { type: Date, default: Date.now },
    successful: { type: Boolean, default: true },
    
    // Дополнительные данные
    metadata: { type: Object },
    
    // Ссылки на связанные логи
    relatedLogs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ActionLog' }]
});

// Индексы для быстрого поиска
actionLogSchema.index({ guildId: 1, actionType: 1, timestamp: -1 });
actionLogSchema.index({ userId: 1, timestamp: -1 });
actionLogSchema.index({ channelId: 1, timestamp: -1 });

// Модели на основе схем
const Mute = mongoose.model('Mute', muteSchema);
const Ban = mongoose.model('Ban', banSchema);
const Warning = mongoose.model('Warning', warningSchema);
const Warn = mongoose.model('Warn', warnSchema);
const User = mongoose.model('User', userSchema);
const TempRole = mongoose.model('TempRole', tempRoleSchema);
const Clan = mongoose.model('Clan', clanSchema);
const ModStats = mongoose.model('ModStats', modStatsSchema);
const RiskPoints = mongoose.model('RiskPoints', riskPointsSchema);
const Ticket = mongoose.model('Ticket', ticketSchema);
const ActionLog = mongoose.model('ActionLog', actionLogSchema);

module.exports = {
    Mute,
    Ban,
    Warning,
    Warn,
    User,
    TempRole,
    Clan,
    ModStats,
    RiskPoints,
    Ticket,
    ActionLog
}; 