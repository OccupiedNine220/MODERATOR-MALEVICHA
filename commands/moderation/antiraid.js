const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const antiRaidSystem = require('../../features/antiRaidSystem');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('antiraid')
        .setDescription('Управление защитой от рейда')
        .addSubcommand(subcommand =>
            subcommand
                .setName('enable')
                .setDescription('Включить защиту от рейда вручную')
                .addStringOption(option =>
                    option
                        .setName('action')
                        .setDescription('Действие при обнаружении подозрительной активности')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Кик новых пользователей', value: 'kick' },
                            { name: 'Бан новых пользователей', value: 'ban' }
                        )
                )
                .addIntegerOption(option =>
                    option
                        .setName('duration')
                        .setDescription('Продолжительность защиты в минутах')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(1440) // 24 часа
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('disable')
                .setDescription('Отключить защиту от рейда')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Показать текущий статус защиты от рейда')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'enable') {
            await this.enableProtection(interaction);
        } else if (subcommand === 'disable') {
            await this.disableProtection(interaction);
        } else if (subcommand === 'status') {
            await this.checkStatus(interaction);
        }
    },
    
    async enableProtection(interaction) {
        const action = interaction.options.getString('action');
        const duration = interaction.options.getInteger('duration') || 30; // По умолчанию 30 минут
        
        // Отправляем сообщение о начале выполнения
        await interaction.deferReply();
        
        // Включаем защиту
        const result = await antiRaidSystem.enableManualProtection(interaction.guild, action, duration);
        
        if (result.success) {
            const embed = new EmbedBuilder()
                .setTitle('🛡️ Защита от рейда активирована')
                .setDescription(`Защита от рейда была включена вручную модератором`)
                .addFields(
                    { name: '🚫 Действие', value: antiRaidSystem.getActionName(action), inline: true },
                    { name: '⏱️ Продолжительность', value: `${duration} мин.`, inline: true },
                    { name: '👮 Активировал', value: `${interaction.user}`, inline: true }
                )
                .setColor('#ff0000')
                .setTimestamp();
            
            await interaction.followUp({ embeds: [embed] });
        } else {
            await interaction.followUp({
                content: `❌ Ошибка при включении защиты от рейда: ${result.message}`,
                ephemeral: true
            });
        }
    },
    
    async disableProtection(interaction) {
        // Отправляем сообщение о начале выполнения
        await interaction.deferReply();
        
        // Отключаем защиту
        const result = await antiRaidSystem.disableManualProtection(interaction.guild.id);
        
        if (result.success) {
            const embed = new EmbedBuilder()
                .setTitle('✅ Защита от рейда отключена')
                .setDescription(`Защита от рейда была отключена вручную модератором`)
                .addFields(
                    { name: '👮 Отключил', value: `${interaction.user}`, inline: true }
                )
                .setColor('#00ff00')
                .setTimestamp();
            
            await interaction.followUp({ embeds: [embed] });
        } else {
            await interaction.followUp({
                content: `⚠️ ${result.message}`,
                ephemeral: true
            });
        }
    },
    
    async checkStatus(interaction) {
        // Отправляем сообщение о начале выполнения
        await interaction.deferReply();
        
        // Получаем текущий статус
        const status = antiRaidSystem.getProtectionStatus(interaction.guild.id);
        
        if (!status || !status.enabled) {
            await interaction.followUp({
                content: '🛑 Защита от рейда в данный момент **не активна**',
                ephemeral: true
            });
            return;
        }
        
        // Вычисляем оставшееся время
        const timeLeftMinutes = Math.ceil(status.timeLeft / 60000);
        
        const embed = new EmbedBuilder()
            .setTitle('🔍 Статус защиты от рейда')
            .setDescription(`Защита от рейда в данный момент **активна**`)
            .addFields(
                { name: '🚫 Тип защиты', value: status.actionName, inline: true },
                { name: '⏱️ Оставшееся время', value: `${timeLeftMinutes} мин.`, inline: true },
                { name: '🔢 Порог срабатывания', value: `${status.threshold} присоединений`, inline: true }
            )
            .setColor('#ffcc00')
            .setTimestamp();
        
        await interaction.followUp({ embeds: [embed] });
    }
}; 