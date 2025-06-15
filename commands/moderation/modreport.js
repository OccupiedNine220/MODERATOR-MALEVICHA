const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { generateDailyReport, generateWeeklyReport, generateUserReport } = require('../../features/moderationReports');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('modreport')
        .setDescription('Генерация отчетов о модерации')
        .addSubcommand(subcommand =>
            subcommand
                .setName('daily')
                .setDescription('Сгенерировать ежедневный отчет о модерации')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('weekly')
                .setDescription('Сгенерировать еженедельный отчет о модерации')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('user')
                .setDescription('Сгенерировать отчет о пользователе')
                .addUserOption(option =>
                    option
                        .setName('пользователь')
                        .setDescription('Пользователь, о котором нужен отчет')
                        .setRequired(true)
                )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
    
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        
        // Отправляем сообщение о начале выполнения
        await interaction.deferReply();
        
        try {
            switch (subcommand) {
                case 'daily':
                    await this.generateDaily(interaction);
                    break;
                case 'weekly':
                    await this.generateWeekly(interaction);
                    break;
                case 'user':
                    await this.generateUser(interaction);
                    break;
            }
        } catch (error) {
            console.error(`Ошибка при выполнении команды modreport ${subcommand}:`, error);
            await interaction.followUp({
                content: 'Произошла ошибка при генерации отчета.',
                ephemeral: true
            });
        }
    },
    
    async generateDaily(interaction) {
        try {
            // Отправляем уведомление пользователю
            await interaction.followUp({
                content: '✅ Отчет о модерации за последние 24 часа был отправлен в канал отчетов.',
                ephemeral: true
            });
            
            // Генерируем и отправляем отчет
            await generateDailyReport(interaction.client);
        } catch (error) {
            console.error('Ошибка при генерации ежедневного отчета:', error);
            await interaction.followUp({
                content: 'Произошла ошибка при генерации ежедневного отчета.',
                ephemeral: true
            });
        }
    },
    
    async generateWeekly(interaction) {
        try {
            // Отправляем уведомление пользователю
            await interaction.followUp({
                content: '✅ Отчет о модерации за последнюю неделю был отправлен в канал отчетов.',
                ephemeral: true
            });
            
            // Генерируем и отправляем отчет
            await generateWeeklyReport(interaction.client);
        } catch (error) {
            console.error('Ошибка при генерации еженедельного отчета:', error);
            await interaction.followUp({
                content: 'Произошла ошибка при генерации еженедельного отчета.',
                ephemeral: true
            });
        }
    },
    
    async generateUser(interaction) {
        try {
            const targetUser = interaction.options.getUser('пользователь');
            const { guild } = interaction;
            
            // Отправляем уведомление пользователю
            await interaction.followUp({
                content: `✅ Отчет о пользователе ${targetUser.tag} был отправлен в канал отчетов.`,
                ephemeral: true
            });
            
            // Генерируем и отправляем отчет
            await generateUserReport(interaction.client, targetUser.id, guild.id, interaction.user.tag);
        } catch (error) {
            console.error('Ошибка при генерации отчета о пользователе:', error);
            await interaction.followUp({
                content: 'Произошла ошибка при генерации отчета о пользователе.',
                ephemeral: true
            });
        }
    }
}; 