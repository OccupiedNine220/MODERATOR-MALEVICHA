const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const { Clan } = require('../../models/schema');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clan')
        .setDescription('Команды для управления кланами')
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Создать новый клан')
                .addStringOption(option => 
                    option.setName('name')
                        .setDescription('Название клана')
                        .setRequired(true))
                .addStringOption(option => 
                    option.setName('description')
                        .setDescription('Описание клана')
                        .setRequired(false))
                .addStringOption(option => 
                    option.setName('emoji')
                        .setDescription('Эмодзи клана')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('info')
                .setDescription('Информация о клане')
                .addStringOption(option => 
                    option.setName('name')
                        .setDescription('Название клана (оставьте пустым для своего клана)')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Список всех кланов'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('join')
                .setDescription('Присоединиться к клану')
                .addStringOption(option => 
                    option.setName('name')
                        .setDescription('Название клана')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('leave')
                .setDescription('Покинуть клан'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('kick')
                .setDescription('Выгнать участника из клана')
                .addUserOption(option => 
                    option.setName('user')
                        .setDescription('Участник')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('Удалить клан'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('edit')
                .setDescription('Изменить информацию о клане')
                .addStringOption(option => 
                    option.setName('description')
                        .setDescription('Новое описание')
                        .setRequired(false))
                .addStringOption(option => 
                    option.setName('emoji')
                        .setDescription('Новое эмодзи')
                        .setRequired(false))),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'create':
                await createClan(interaction);
                break;
            case 'info':
                await clanInfo(interaction);
                break;
            case 'list':
                await listClans(interaction);
                break;
            case 'join':
                await joinClan(interaction);
                break;
            case 'leave':
                await leaveClan(interaction);
                break;
            case 'kick':
                await kickMember(interaction);
                break;
            case 'delete':
                await deleteClan(interaction);
                break;
            case 'edit':
                await editClan(interaction);
                break;
        }
    }
};

async function createClan(interaction) {
    const userId = interaction.user.id;
    const name = interaction.options.getString('name');
    const description = interaction.options.getString('description') || 'Описание не указано';
    const emoji = interaction.options.getString('emoji') || '🏰';

    // Проверка на уже существующий клан с таким названием
    const existingClan = await Clan.findOne({ name });
    if (existingClan) {
        return interaction.reply({ content: '❌ Клан с таким названием уже существует!', ephemeral: true });
    }

    // Проверка, состоит ли пользователь уже в клане
    const userClan = await Clan.findOne({ $or: [{ owner: userId }, { members: userId }] });
    if (userClan) {
        return interaction.reply({ content: '❌ Вы уже состоите в клане! Сначала покиньте текущий клан.', ephemeral: true });
    }

    // Создаем новый клан
    const newClan = new Clan({
        name,
        owner: userId,
        description,
        emoji,
        members: [userId]
    });

    await newClan.save();

    const embed = new EmbedBuilder()
        .setTitle(`${emoji} Клан создан: ${name}`)
        .setDescription(description)
        .addFields(
            { name: 'Владелец', value: `<@${userId}>`, inline: true },
            { name: 'Участники', value: '1', inline: true },
            { name: 'Уровень', value: '1', inline: true }
        )
        .setColor('#2b2d31')
        .setTimestamp();

    interaction.reply({ embeds: [embed] });
}

async function clanInfo(interaction) {
    const userId = interaction.user.id;
    const clanName = interaction.options.getString('name');
    
    let clan;
    
    if (clanName) {
        clan = await Clan.findOne({ name: clanName });
        if (!clan) {
            return interaction.reply({ content: '❌ Клан с таким названием не найден!', ephemeral: true });
        }
    } else {
        clan = await Clan.findOne({ $or: [{ owner: userId }, { members: userId }] });
        if (!clan) {
            return interaction.reply({ content: '❌ Вы не состоите в клане!', ephemeral: true });
        }
    }

    const memberCount = clan.members.length;
    const ownerTag = await interaction.client.users.fetch(clan.owner).then(user => user.tag).catch(() => 'Неизвестный пользователь');
    
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

    const membersField = await getMembersField(interaction.client, clan.members);
    embed.addFields({ name: 'Список участников', value: membersField });

    interaction.reply({ embeds: [embed] });
}

async function getMembersField(client, members) {
    let membersText = '';
    
    for (const memberId of members.slice(0, 10)) {
        const user = await client.users.fetch(memberId).catch(() => null);
        if (user) {
            membersText += `<@${memberId}> (${user.tag})\n`;
        } else {
            membersText += `<@${memberId}> (Неизвестный пользователь)\n`;
        }
    }
    
    if (members.length > 10) {
        membersText += `...и еще ${members.length - 10} участников`;
    }
    
    return membersText || 'Нет участников';
}

async function listClans(interaction) {
    const clans = await Clan.find().sort({ level: -1, exp: -1 });
    
    if (clans.length === 0) {
        return interaction.reply({ content: 'На сервере пока нет кланов!', ephemeral: true });
    }
    
    const embed = new EmbedBuilder()
        .setTitle('📜 Список кланов')
        .setDescription('Список всех кланов на сервере, отсортированный по уровню и опыту')
        .setColor('#2b2d31')
        .setTimestamp();
    
    clans.forEach((clan, index) => {
        embed.addFields({ 
            name: `${index + 1}. ${clan.emoji} ${clan.name} (Уровень ${clan.level})`, 
            value: `Владелец: <@${clan.owner}>\nУчастников: ${clan.members.length}\nСила: ${clan.power}\nОпыт: ${clan.exp}/${clan.level * 1000}`
        });
    });
    
    interaction.reply({ embeds: [embed] });
}

async function joinClan(interaction) {
    const userId = interaction.user.id;
    const clanName = interaction.options.getString('name');
    
    // Проверка, состоит ли пользователь уже в клане
    const userClan = await Clan.findOne({ $or: [{ owner: userId }, { members: userId }] });
    if (userClan) {
        return interaction.reply({ content: '❌ Вы уже состоите в клане! Сначала покиньте текущий клан.', ephemeral: true });
    }
    
    // Поиск клана для вступления
    const clan = await Clan.findOne({ name: clanName });
    if (!clan) {
        return interaction.reply({ content: '❌ Клан с таким названием не найден!', ephemeral: true });
    }
    
    // Добавляем пользователя в клан
    clan.members.push(userId);
    await clan.save();
    
    interaction.reply({ content: `✅ Вы успешно вступили в клан ${clan.emoji} ${clan.name}!` });
}

async function leaveClan(interaction) {
    const userId = interaction.user.id;
    
    // Находим клан пользователя
    const clan = await Clan.findOne({ members: userId });
    
    if (!clan) {
        return interaction.reply({ content: '❌ Вы не состоите в клане!', ephemeral: true });
    }
    
    // Проверяем, не является ли пользователь владельцем
    if (clan.owner === userId) {
        return interaction.reply({ 
            content: '❌ Вы являетесь владельцем клана! Сначала передайте права другому участнику или удалите клан.',
            ephemeral: true 
        });
    }
    
    // Удаляем пользователя из клана
    clan.members = clan.members.filter(id => id !== userId);
    await clan.save();
    
    interaction.reply({ content: `✅ Вы успешно покинули клан ${clan.emoji} ${clan.name}!` });
}

async function kickMember(interaction) {
    const userId = interaction.user.id;
    const targetUser = interaction.options.getUser('user');
    const targetId = targetUser.id;
    
    // Проверка, не пытается ли пользователь кикнуть себя
    if (userId === targetId) {
        return interaction.reply({ content: '❌ Вы не можете выгнать себя из клана! Используйте команду /clan leave.', ephemeral: true });
    }
    
    // Находим клан пользователя
    const clan = await Clan.findOne({ owner: userId });
    
    // Проверяем, является ли пользователь владельцем клана
    if (!clan) {
        return interaction.reply({ content: '❌ Вы не являетесь владельцем клана!', ephemeral: true });
    }
    
    // Проверяем, состоит ли целевой пользователь в клане
    if (!clan.members.includes(targetId)) {
        return interaction.reply({ content: '❌ Этот пользователь не состоит в вашем клане!', ephemeral: true });
    }
    
    // Удаляем пользователя из клана
    clan.members = clan.members.filter(id => id !== targetId);
    await clan.save();
    
    interaction.reply({ content: `✅ Пользователь ${targetUser.tag} был исключен из клана ${clan.emoji} ${clan.name}!` });
}

async function deleteClan(interaction) {
    const userId = interaction.user.id;
    
    // Находим клан пользователя
    const clan = await Clan.findOne({ owner: userId });
    
    // Проверяем, является ли пользователь владельцем клана
    if (!clan) {
        return interaction.reply({ content: '❌ Вы не являетесь владельцем клана!', ephemeral: true });
    }
    
    // Запрашиваем подтверждение
    const confirmEmbed = new EmbedBuilder()
        .setTitle('⚠️ Подтверждение удаления клана')
        .setDescription(`Вы уверены, что хотите удалить клан ${clan.emoji} ${clan.name}?\nЭто действие необратимо!`)
        .setColor('#ff0000')
        .setTimestamp();
    
    const confirmRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('confirm_delete')
                .setLabel('Удалить')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('cancel_delete')
                .setLabel('Отмена')
                .setStyle(ButtonStyle.Secondary)
        );
    
    const response = await interaction.reply({ embeds: [confirmEmbed], components: [confirmRow], fetchReply: true });
    
    // Создаем коллектор для кнопок
    const filter = i => i.user.id === userId && ['confirm_delete', 'cancel_delete'].includes(i.customId);
    const collector = response.createMessageComponentCollector({ filter, time: 30000 });
    
    collector.on('collect', async i => {
        if (i.customId === 'confirm_delete') {
            await Clan.findByIdAndDelete(clan._id);
            await i.update({ content: `✅ Клан ${clan.emoji} ${clan.name} был успешно удален!`, embeds: [], components: [] });
        } else {
            await i.update({ content: '❌ Удаление клана отменено!', embeds: [], components: [] });
        }
        collector.stop();
    });
    
    collector.on('end', async (collected, reason) => {
        if (reason === 'time') {
            await interaction.editReply({ content: '❌ Время подтверждения истекло. Удаление клана отменено!', embeds: [], components: [] });
        }
    });
}

async function editClan(interaction) {
    const userId = interaction.user.id;
    const description = interaction.options.getString('description');
    const emoji = interaction.options.getString('emoji');
    
    // Проверяем, что хотя бы один параметр был передан
    if (!description && !emoji) {
        return interaction.reply({ content: '❌ Укажите хотя бы один параметр для изменения!', ephemeral: true });
    }
    
    // Находим клан пользователя
    const clan = await Clan.findOne({ owner: userId });
    
    // Проверяем, является ли пользователь владельцем клана
    if (!clan) {
        return interaction.reply({ content: '❌ Вы не являетесь владельцем клана!', ephemeral: true });
    }
    
    // Обновляем информацию о клане
    if (description) clan.description = description;
    if (emoji) clan.emoji = emoji;
    
    await clan.save();
    
    const embed = new EmbedBuilder()
        .setTitle(`${clan.emoji} Клан обновлен: ${clan.name}`)
        .setDescription('Информация о клане была успешно обновлена!')
        .addFields(
            { name: 'Новое описание', value: clan.description },
            { name: 'Новое эмодзи', value: clan.emoji }
        )
        .setColor('#2b2d31')
        .setTimestamp();
    
    interaction.reply({ embeds: [embed] });
}
 