const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { Clan } = require('../../models/schema');
const { clanTasks, rewardClanForTask, getRandomTask, createTasksEmbed, createRewardEmbed } = require('../../features/clanSystem');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clantask')
        .setDescription('Управление заданиями для кланов')
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Показать список доступных заданий'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('reward')
                .setDescription('Выдать награду клану за выполнение задания')
                .addStringOption(option => 
                    option.setName('clan')
                        .setDescription('Название клана')
                        .setRequired(true))
                .addStringOption(option => 
                    option.setName('task')
                        .setDescription('ID задания')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Активность', value: 'activity' },
                            { name: 'Набор участников', value: 'members' },
                            { name: 'Участие в событиях', value: 'events' },
                            { name: 'Сотрудничество', value: 'cooperation' }
                        )))
        .addSubcommand(subcommand =>
            subcommand
                .setName('random')
                .setDescription('Получить случайное задание для своего клана'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        
        switch (subcommand) {
            case 'list':
                await listTasks(interaction);
                break;
            case 'reward':
                await rewardClan(interaction);
                break;
            case 'random':
                await getRandomClanTask(interaction);
                break;
        }
    }
};

async function listTasks(interaction) {
    const embed = createTasksEmbed();
    await interaction.reply({ embeds: [embed] });
}

async function rewardClan(interaction) {
    const clanName = interaction.options.getString('clan');
    const taskId = interaction.options.getString('task');
    
    try {
        // Проверяем существование клана
        const clan = await Clan.findOne({ name: clanName });
        
        if (!clan) {
            return interaction.reply({ content: '❌ Клан с таким названием не найден!', ephemeral: true });
        }
        
        // Проверяем существование задания
        const task = clanTasks.find(t => t.id === taskId);
        
        if (!task) {
            return interaction.reply({ content: '❌ Задание с таким ID не найдено!', ephemeral: true });
        }
        
        // Выдаем награду
        const rewardInfo = await rewardClanForTask(clanName, taskId);
        
        // Создаем эмбед с информацией о награде
        const embed = createRewardEmbed(rewardInfo);
        
        await interaction.reply({ embeds: [embed] });
    } catch (error) {
        console.error(`Ошибка при выдаче награды клану: ${error.message}`);
        await interaction.reply({ 
            content: `❌ Произошла ошибка при выдаче награды: ${error.message}`,
            ephemeral: true 
        });
    }
}

async function getRandomClanTask(interaction) {
    const userId = interaction.user.id;
    
    // Находим клан пользователя
    const clan = await Clan.findOne({ $or: [{ owner: userId }, { members: userId }] });
    
    if (!clan) {
        return interaction.reply({ content: '❌ Вы не состоите в клане!', ephemeral: true });
    }
    
    // Получаем случайное задание
    const task = getRandomTask();
    
    const embed = new EmbedBuilder()
        .setTitle(`📋 Задание для клана ${clan.emoji} ${clan.name}`)
        .setDescription(`Вашему клану выпало задание: **${task.name}**`)
        .addFields(
            { name: 'Описание', value: task.description },
            { name: 'Сложность', value: task.difficulty, inline: true },
            { name: 'ID задания', value: `\`${task.id}\``, inline: true },
            { name: 'Награда', value: `${task.reward.exp} XP, ${task.reward.power} силы`, inline: true }
        )
        .addFields({
            name: 'Как выполнить',
            value: 'После выполнения задания, администратор сервера может выдать вам награду через команду `/clantask reward`.'
        })
        .setColor('#4B0082')
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
} 