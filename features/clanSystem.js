const { Clan } = require('../models/schema');
const { EmbedBuilder } = require('discord.js');

// Список доступных заданий для кланов
const clanTasks = [
    {
        id: 'activity',
        name: 'Активность',
        description: 'Поддерживайте активность в чате и голосовых каналах',
        reward: { exp: 50, power: 5 },
        difficulty: 'Легкое'
    },
    {
        id: 'members',
        name: 'Набор участников',
        description: 'Пригласите больше участников в свой клан',
        reward: { exp: 100, power: 10 },
        difficulty: 'Среднее'
    },
    {
        id: 'events',
        name: 'Участие в событиях',
        description: 'Участие в серверных мероприятиях и конкурсах',
        reward: { exp: 200, power: 15 },
        difficulty: 'Сложное'
    },
    {
        id: 'cooperation',
        name: 'Сотрудничество',
        description: 'Сотрудничество с другими кланами',
        reward: { exp: 150, power: 20 },
        difficulty: 'Сложное'
    }
];

/**
 * Добавляет опыт клану
 * @param {string} clanName - Название клана
 * @param {number} exp - Количество опыта
 * @returns {Promise<Object>} - Объект с информацией о клане и повышении уровня
 */
async function addClanExp(clanName, exp) {
    const clan = await Clan.findOne({ name: clanName });
    
    if (!clan) {
        throw new Error(`Клан "${clanName}" не найден!`);
    }
    
    // Добавляем опыт
    clan.exp += exp;
    
    // Проверяем, достиг ли клан нового уровня
    const levelUpExp = clan.level * 1000;
    let levelUp = false;
    
    while (clan.exp >= levelUpExp) {
        clan.exp -= levelUpExp;
        clan.level += 1;
        clan.power += 25; // Бонус силы за новый уровень
        levelUp = true;
    }
    
    // Сохраняем изменения
    await clan.save();
    
    return {
        clan,
        levelUp,
        newLevel: clan.level,
        remainingExp: clan.exp,
        nextLevelExp: clan.level * 1000
    };
}

/**
 * Выдает награду клану за выполнение задания
 * @param {string} clanName - Название клана
 * @param {string} taskId - ID задания
 * @returns {Promise<Object>} - Объект с информацией о награде
 */
async function rewardClanForTask(clanName, taskId) {
    const task = clanTasks.find(t => t.id === taskId);
    
    if (!task) {
        throw new Error(`Задание с ID "${taskId}" не найдено!`);
    }
    
    const clan = await Clan.findOne({ name: clanName });
    
    if (!clan) {
        throw new Error(`Клан "${clanName}" не найден!`);
    }
    
    // Добавляем награды клану
    const expResult = await addClanExp(clanName, task.reward.exp);
    
    // Добавляем силу
    clan.power += task.reward.power;
    await clan.save();
    
    return {
        task,
        reward: task.reward,
        clan: expResult.clan,
        levelUp: expResult.levelUp,
        newLevel: expResult.newLevel
    };
}

/**
 * Генерирует случайное задание для клана
 * @returns {Object} - Случайное задание
 */
function getRandomTask() {
    const randomIndex = Math.floor(Math.random() * clanTasks.length);
    return clanTasks[randomIndex];
}

/**
 * Создает эмбед с топом кланов
 * @param {Array} clans - Массив кланов
 * @returns {EmbedBuilder} - Эмбед с топом кланов
 */
function createClanTopEmbed(clans) {
    const embed = new EmbedBuilder()
        .setTitle('🏆 Топ кланов')
        .setDescription('Рейтинг кланов сервера по уровню и силе')
        .setColor('#FFD700')
        .setTimestamp();
    
    // Определяем специальные эмодзи для топ-3
    const rankEmojis = ['🥇', '🥈', '🥉'];
    
    // Добавляем поля для каждого клана в топ-10
    clans.slice(0, 10).forEach((clan, index) => {
        const rankDisplay = index < 3 ? rankEmojis[index] : `${index + 1}.`;
        
        embed.addFields({
            name: `${rankDisplay} ${clan.emoji} ${clan.name}`,
            value: `Уровень: ${clan.level} | Сила: ${clan.power} | Участников: ${clan.members.length}\nВладелец: <@${clan.owner}>`
        });
    });
    
    return embed;
}

/**
 * Создает эмбед с информацией о клане
 * @param {Object} clan - Объект клана
 * @param {Object} client - Discord клиент
 * @returns {Promise<EmbedBuilder>} - Эмбед с информацией о клане
 */
async function createClanInfoEmbed(clan, client) {
    const memberCount = clan.members.length;
    const ownerTag = await client.users.fetch(clan.owner).then(user => user.tag).catch(() => 'Неизвестный пользователь');
    
    const embed = new EmbedBuilder()
        .setTitle(`${clan.emoji} Клан: ${clan.name}`)
        .setDescription(clan.description)
        .addFields(
            { name: 'Владелец', value: `<@${clan.owner}> (${ownerTag})`, inline: true },
            { name: 'Участники', value: memberCount.toString(), inline: true },
            { name: 'Уровень', value: clan.level.toString(), inline: true },
            { name: 'Опыт', value: `${clan.exp}/${clan.level * 1000}`, inline: true },
            { name: 'Сила', value: clan.power.toString(), inline: true }
        )
        .setColor('#2b2d31')
        .setTimestamp();
    
    let membersText = '';
    
    for (const memberId of clan.members.slice(0, 10)) {
        const user = await client.users.fetch(memberId).catch(() => null);
        if (user) {
            membersText += `<@${memberId}> (${user.tag})\n`;
        } else {
            membersText += `<@${memberId}> (Неизвестный пользователь)\n`;
        }
    }
    
    if (clan.members.length > 10) {
        membersText += `...и еще ${clan.members.length - 10} участников`;
    }
    
    embed.addFields({ name: 'Список участников', value: membersText || 'Нет участников' });
    
    return embed;
}

/**
 * Создает эмбед с наградой для клана
 * @param {Object} rewardInfo - Информация о награде
 * @returns {EmbedBuilder} - Эмбед с наградой
 */
function createRewardEmbed(rewardInfo) {
    const embed = new EmbedBuilder()
        .setTitle(`🎁 Награда для клана ${rewardInfo.clan.emoji} ${rewardInfo.clan.name}`)
        .setDescription(`Клан получил награду за задание: **${rewardInfo.task.name}**`)
        .addFields(
            { name: 'Полученный опыт', value: `+${rewardInfo.reward.exp} XP`, inline: true },
            { name: 'Полученная сила', value: `+${rewardInfo.reward.power} силы`, inline: true }
        )
        .setColor('#00FF00')
        .setTimestamp();
    
    if (rewardInfo.levelUp) {
        embed.addFields({
            name: '🎉 Повышение уровня!',
            value: `Поздравляем! Клан достиг **${rewardInfo.newLevel}** уровня!`
        });
    }
    
    return embed;
}

/**
 * Создает эмбед с заданиями для клана
 * @returns {EmbedBuilder} - Эмбед с заданиями
 */
function createTasksEmbed() {
    const embed = new EmbedBuilder()
        .setTitle('📋 Задания для кланов')
        .setDescription('Список доступных заданий для кланов')
        .setColor('#4B0082')
        .setTimestamp();
    
    clanTasks.forEach(task => {
        embed.addFields({
            name: `${task.name} (${task.difficulty})`,
            value: `ID: \`${task.id}\`\n${task.description}\nНаграда: ${task.reward.exp} XP, ${task.reward.power} силы`
        });
    });
    
    return embed;
}

module.exports = {
    clanTasks,
    addClanExp,
    rewardClanForTask,
    getRandomTask,
    createClanTopEmbed,
    createClanInfoEmbed,
    createRewardEmbed,
    createTasksEmbed
}; 