const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const { Clan } = require('../../models/schema');
const { addClanExp } = require('../../features/clanSystem');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clanwar')
        .setDescription('Система клановых войн')
        .addSubcommand(subcommand =>
            subcommand
                .setName('challenge')
                .setDescription('Вызвать другой клан на войну')
                .addStringOption(option => 
                    option.setName('target')
                        .setDescription('Название клана-соперника')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('result')
                .setDescription('Объявить результат клановой войны (только для админов)')
                .addStringOption(option => 
                    option.setName('winner')
                        .setDescription('Название клана-победителя')
                        .setRequired(true))
                .addStringOption(option => 
                    option.setName('loser')
                        .setDescription('Название клана-проигравшего')
                        .setRequired(true))
                .addIntegerOption(option => 
                    option.setName('exp')
                        .setDescription('Количество опыта для победителя (по умолчанию 300)')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('cancel')
                .setDescription('Отменить вызов на клановую войну')
                .addStringOption(option => 
                    option.setName('target')
                        .setDescription('Название клана-соперника')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Показать статус войны между кланами')
                .addStringOption(option => 
                    option.setName('clan1')
                        .setDescription('Название первого клана')
                        .setRequired(true))
                .addStringOption(option => 
                    option.setName('clan2')
                        .setDescription('Название второго клана')
                        .setRequired(true))),
        
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        
        switch (subcommand) {
            case 'challenge':
                await challengeClan(interaction);
                break;
            case 'result':
                await setWarResult(interaction);
                break;
            case 'cancel':
                await cancelChallenge(interaction);
                break;
            case 'status':
                await warStatus(interaction);
                break;
        }
    }
};

// Хранилище активных войн
const activeWars = new Map();
// Хранилище запросов на войну
const warRequests = new Map();

async function challengeClan(interaction) {
    const userId = interaction.user.id;
    const targetClanName = interaction.options.getString('target');
    
    // Находим клан пользователя
    const userClan = await Clan.findOne({ $or: [{ owner: userId }, { members: userId }] });
    
    if (!userClan) {
        return interaction.reply({ content: '❌ Вы не состоите в клане!', ephemeral: true });
    }
    
    // Проверяем, является ли пользователь владельцем клана
    if (userClan.owner !== userId) {
        return interaction.reply({ 
            content: '❌ Только владелец клана может вызывать другие кланы на войну!',
            ephemeral: true 
        });
    }
    
    // Находим целевой клан
    const targetClan = await Clan.findOne({ name: targetClanName });
    
    if (!targetClan) {
        return interaction.reply({ content: '❌ Клан с таким названием не найден!', ephemeral: true });
    }
    
    // Проверяем, не вызывает ли клан сам себя
    if (userClan.name === targetClan.name) {
        return interaction.reply({ content: '❌ Вы не можете вызвать на войну свой собственный клан!', ephemeral: true });
    }
    
    // Проверяем, нет ли уже активной войны
    const warKey = getWarKey(userClan.name, targetClan.name);
    
    if (activeWars.has(warKey)) {
        return interaction.reply({ 
            content: '❌ Война между этими кланами уже идет!',
            ephemeral: true 
        });
    }
    
    // Проверяем, нет ли уже запроса на войну
    if (warRequests.has(warKey)) {
        return interaction.reply({ 
            content: '❌ Запрос на войну между этими кланами уже отправлен!',
            ephemeral: true 
        });
    }
    
    // Создаем запрос на войну
    warRequests.set(warKey, {
        challenger: userClan.name,
        target: targetClan.name,
        timestamp: Date.now(),
        challengerId: userId
    });
    
    // Создаем эмбед с запросом
    const embed = new EmbedBuilder()
        .setTitle('⚔️ Вызов на клановую войну')
        .setDescription(`Клан ${userClan.emoji} ${userClan.name} вызывает клан ${targetClan.emoji} ${targetClan.name} на войну!`)
        .addFields(
            { name: 'Вызывающий клан', value: `${userClan.emoji} ${userClan.name} (Уровень ${userClan.level})`, inline: true },
            { name: 'Клан-соперник', value: `${targetClan.emoji} ${targetClan.name} (Уровень ${targetClan.level})`, inline: true },
            { name: 'Инициатор', value: `<@${userId}>`, inline: true }
        )
        .setColor('#ff0000')
        .setTimestamp();
    
    // Создаем кнопки для принятия/отклонения вызова
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`accept_war_${warKey}`)
                .setLabel('Принять вызов')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`decline_war_${warKey}`)
                .setLabel('Отклонить вызов')
                .setStyle(ButtonStyle.Secondary)
        );
    
    const reply = await interaction.reply({ 
        content: `<@${targetClan.owner}>, ваш клан вызывают на войну!`, 
        embeds: [embed], 
        components: [row],
        fetchReply: true
    });
    
    // Создаем коллектор для кнопок
    const filter = i => {
        return (i.customId === `accept_war_${warKey}` || i.customId === `decline_war_${warKey}`) &&
               i.user.id === targetClan.owner;
    };
    
    const collector = reply.createMessageComponentCollector({ filter, time: 3600000 }); // 1 час
    
    collector.on('collect', async i => {
        if (i.customId === `accept_war_${warKey}`) {
            // Принимаем вызов
            const warInfo = warRequests.get(warKey);
            
            if (!warInfo) {
                return i.update({ 
                    content: '❌ Этот вызов уже неактивен!', 
                    embeds: [], 
                    components: [] 
                });
            }
            
            // Создаем активную войну
            activeWars.set(warKey, {
                clan1: warInfo.challenger,
                clan2: warInfo.target,
                startTime: Date.now(),
                status: 'active'
            });
            
            // Удаляем запрос
            warRequests.delete(warKey);
            
            const acceptEmbed = new EmbedBuilder()
                .setTitle('⚔️ Клановая война началась!')
                .setDescription(`Клан ${targetClan.emoji} ${targetClan.name} принял вызов от клана ${userClan.emoji} ${userClan.name}!`)
                .addFields(
                    { name: 'Статус', value: 'Идет война', inline: true },
                    { name: 'Начало', value: new Date().toLocaleString(), inline: true }
                )
                .setColor('#ff0000')
                .setTimestamp();
            
            await i.update({ content: '', embeds: [acceptEmbed], components: [] });
        } else {
            // Отклоняем вызов
            const warInfo = warRequests.get(warKey);
            
            if (!warInfo) {
                return i.update({ 
                    content: '❌ Этот вызов уже неактивен!', 
                    embeds: [], 
                    components: [] 
                });
            }
            
            // Удаляем запрос
            warRequests.delete(warKey);
            
            const declineEmbed = new EmbedBuilder()
                .setTitle('❌ Вызов на клановую войну отклонен')
                .setDescription(`Клан ${targetClan.emoji} ${targetClan.name} отклонил вызов от клана ${userClan.emoji} ${userClan.name}!`)
                .setColor('#2b2d31')
                .setTimestamp();
            
            await i.update({ content: '', embeds: [declineEmbed], components: [] });
        }
    });
    
    collector.on('end', async (collected, reason) => {
        if (reason === 'time' && warRequests.has(warKey)) {
            // Если время истекло и запрос все еще активен
            warRequests.delete(warKey);
            
            const timeoutEmbed = new EmbedBuilder()
                .setTitle('⏰ Время ожидания истекло')
                .setDescription(`Клан ${targetClan.emoji} ${targetClan.name} не ответил на вызов от клана ${userClan.emoji} ${userClan.name}!`)
                .setColor('#2b2d31')
                .setTimestamp();
            
            await interaction.editReply({ content: '', embeds: [timeoutEmbed], components: [] });
        }
    });
}

async function setWarResult(interaction) {
    // Проверяем права администратора
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ 
            content: '❌ Только администраторы могут устанавливать результаты клановых войн!',
            ephemeral: true 
        });
    }
    
    const winnerName = interaction.options.getString('winner');
    const loserName = interaction.options.getString('loser');
    const expReward = interaction.options.getInteger('exp') || 300;
    
    // Находим кланы
    const winnerClan = await Clan.findOne({ name: winnerName });
    const loserClan = await Clan.findOne({ name: loserName });
    
    if (!winnerClan) {
        return interaction.reply({ content: `❌ Клан-победитель "${winnerName}" не найден!`, ephemeral: true });
    }
    
    if (!loserClan) {
        return interaction.reply({ content: `❌ Клан-проигравший "${loserName}" не найден!`, ephemeral: true });
    }
    
    // Проверяем, есть ли активная война между этими кланами
    const warKey = getWarKey(winnerClan.name, loserClan.name);
    
    if (!activeWars.has(warKey)) {
        return interaction.reply({ 
            content: '❌ Между этими кланами нет активной войны!',
            ephemeral: true 
        });
    }
    
    // Удаляем активную войну
    activeWars.delete(warKey);
    
    // Выдаем награду победителю
    try {
        const expResult = await addClanExp(winnerClan.name, expReward);
        
        // Добавляем силу и обновляем информацию
        winnerClan.power += 30;
        loserClan.power = Math.max(0, loserClan.power - 15); // Уменьшаем силу проигравшего, но не ниже нуля
        
        await winnerClan.save();
        await loserClan.save();
        
        // Создаем эмбед с результатами
        const embed = new EmbedBuilder()
            .setTitle('🏆 Результаты клановой войны')
            .setDescription(`Клан ${winnerClan.emoji} ${winnerClan.name} одержал победу над кланом ${loserClan.emoji} ${loserClan.name}!`)
            .addFields(
                { name: 'Победитель', value: `${winnerClan.emoji} ${winnerClan.name}`, inline: true },
                { name: 'Проигравший', value: `${loserClan.emoji} ${loserClan.name}`, inline: true },
                { name: 'Награда', value: `+${expReward} XP, +30 силы`, inline: true },
                { name: 'Изменения для проигравшего', value: '-15 силы', inline: true }
            )
            .setColor('#FFD700')
            .setTimestamp();
        
        if (expResult.levelUp) {
            embed.addFields({
                name: '🎉 Повышение уровня!',
                value: `Поздравляем! Клан ${winnerClan.emoji} ${winnerClan.name} достиг **${expResult.newLevel}** уровня!`
            });
        }
        
        await interaction.reply({ 
            content: `<@${winnerClan.owner}> <@${loserClan.owner}>`,
            embeds: [embed] 
        });
    } catch (error) {
        console.error(`Ошибка при установке результатов войны: ${error.message}`);
        return interaction.reply({ 
            content: `❌ Произошла ошибка: ${error.message}`,
            ephemeral: true 
        });
    }
}

async function cancelChallenge(interaction) {
    const userId = interaction.user.id;
    const targetClanName = interaction.options.getString('target');
    
    // Находим клан пользователя
    const userClan = await Clan.findOne({ owner: userId });
    
    if (!userClan) {
        return interaction.reply({ 
            content: '❌ Вы не являетесь владельцем клана!',
            ephemeral: true 
        });
    }
    
    // Находим целевой клан
    const targetClan = await Clan.findOne({ name: targetClanName });
    
    if (!targetClan) {
        return interaction.reply({ content: '❌ Клан с таким названием не найден!', ephemeral: true });
    }
    
    // Проверяем, есть ли запрос на войну
    const warKey = getWarKey(userClan.name, targetClan.name);
    
    if (!warRequests.has(warKey)) {
        return interaction.reply({ 
            content: '❌ Между этими кланами нет активного запроса на войну!',
            ephemeral: true 
        });
    }
    
    // Проверяем, является ли пользователь инициатором
    const request = warRequests.get(warKey);
    
    if (request.challengerId !== userId) {
        return interaction.reply({ 
            content: '❌ Вы не можете отменить этот запрос, так как не являетесь его инициатором!',
            ephemeral: true 
        });
    }
    
    // Удаляем запрос
    warRequests.delete(warKey);
    
    const embed = new EmbedBuilder()
        .setTitle('❌ Вызов на клановую войну отменен')
        .setDescription(`Клан ${userClan.emoji} ${userClan.name} отменил вызов клана ${targetClan.emoji} ${targetClan.name} на войну!`)
        .setColor('#2b2d31')
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
}

async function warStatus(interaction) {
    const clan1Name = interaction.options.getString('clan1');
    const clan2Name = interaction.options.getString('clan2');
    
    // Находим кланы
    const clan1 = await Clan.findOne({ name: clan1Name });
    const clan2 = await Clan.findOne({ name: clan2Name });
    
    if (!clan1) {
        return interaction.reply({ content: `❌ Клан "${clan1Name}" не найден!`, ephemeral: true });
    }
    
    if (!clan2) {
        return interaction.reply({ content: `❌ Клан "${clan2Name}" не найден!`, ephemeral: true });
    }
    
    // Проверяем статус войны между кланами
    const warKey = getWarKey(clan1.name, clan2.name);
    
    if (activeWars.has(warKey)) {
        // Есть активная война
        const war = activeWars.get(warKey);
        const duration = Math.floor((Date.now() - war.startTime) / (1000 * 60 * 60)); // Длительность в часах
        
        const embed = new EmbedBuilder()
            .setTitle('⚔️ Статус клановой войны')
            .setDescription(`Между кланами ${clan1.emoji} ${clan1.name} и ${clan2.emoji} ${clan2.name} идет война!`)
            .addFields(
                { name: 'Начало войны', value: new Date(war.startTime).toLocaleString(), inline: true },
                { name: 'Длительность', value: `${duration} час(ов)`, inline: true },
                { name: 'Статус', value: 'Активная', inline: true }
            )
            .setColor('#ff0000')
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
    } else if (warRequests.has(warKey)) {
        // Есть запрос на войну
        const request = warRequests.get(warKey);
        const timeAgo = Math.floor((Date.now() - request.timestamp) / (1000 * 60)); // Время в минутах
        
        const embed = new EmbedBuilder()
            .setTitle('🔄 Ожидание ответа на вызов')
            .setDescription(`Клан ${request.challenger} вызвал клан ${request.target} на войну!`)
            .addFields(
                { name: 'Время запроса', value: new Date(request.timestamp).toLocaleString(), inline: true },
                { name: 'Ожидание', value: `${timeAgo} минут(ы)`, inline: true },
                { name: 'Инициатор', value: `<@${request.challengerId}>`, inline: true }
            )
            .setColor('#ffa500')
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
    } else {
        // Нет активной войны или запроса
        const embed = new EmbedBuilder()
            .setTitle('🕊️ Мирное состояние')
            .setDescription(`Между кланами ${clan1.emoji} ${clan1.name} и ${clan2.emoji} ${clan2.name} нет активной войны или запроса на войну.`)
            .addFields(
                { name: 'Сила первого клана', value: clan1.power.toString(), inline: true },
                { name: 'Сила второго клана', value: clan2.power.toString(), inline: true },
                { name: 'Разница в силе', value: Math.abs(clan1.power - clan2.power).toString(), inline: true }
            )
            .setColor('#00ff00')
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
    }
}

// Вспомогательная функция для получения уникального ключа войны
function getWarKey(clan1, clan2) {
    // Сортируем названия, чтобы ключ был одинаковым независимо от порядка
    return [clan1, clan2].sort().join('_vs_');
} 