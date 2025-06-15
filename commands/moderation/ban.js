const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { isAdmin } = require('../../utils/permissions');
const { logModeration } = require('../../utils/logger');
const { ModStats } = require('../../models/schema');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('бан')
        .setDescription('Забанить пользователя на сервере')
        .addUserOption(option => 
            option.setName('пользователь')
                .setDescription('Пользователь, которого нужно забанить')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('причина')
                .setDescription('Причина бана')
                .setRequired(true)),
    
    async execute(interaction) {
        // Проверка прав
        if (!isAdmin(interaction.member)) {
            return interaction.reply({
                content: '🚫 У вас недостаточно прав для выполнения этой команды.',
                ephemeral: true
            });
        }

        const targetUser = interaction.options.getUser('пользователь');
        const reason = interaction.options.getString('причина');
        
        // Проверки пользователя
        if (targetUser.id === interaction.user.id) {
            return interaction.reply({
                content: '🙅 Вы не можете забанить себя!',
                ephemeral: true
            });
        }

        if (targetUser.bot) {
            return interaction.reply({
                content: '🤖 Нельзя забанить бота!',
                ephemeral: true
            });
        }

        // Получаем объект участника для дополнительных проверок
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        
        // Если участник на сервере, проверяем его роли
        if (targetMember) {
            // Проверка, можем ли мы банить этого пользователя (на случай если он администратор или с высокой ролью)
            if (!targetMember.bannable) {
                return interaction.reply({
                    content: '❌ Я не могу забанить этого пользователя. Проверьте права ролей.',
                    ephemeral: true
                });
            }
        }

        // Проверка длины причины
        if (reason.length > 500) {
            return interaction.reply({
                content: '📝 Причина слишком длинная. Максимум 500 символов.',
                ephemeral: true
            });
        }

        try {
            // Баним пользователя
            await interaction.guild.members.ban(targetUser, { reason });
            
            // Обновляем статистику модератора
            await ModStats.findOneAndUpdate(
                { userId: interaction.user.id, guildId: interaction.guild.id },
                { $inc: { 'actions.bans': 1 } },
                { upsert: true }
            );
            
            // Создаем и отправляем эмбед
            const embed = new EmbedBuilder()
                .setTitle('Бан участника')
                .setDescription(`${targetUser} был забанен.`)
                .setColor(0xFF0000)
                .addFields(
                    { name: 'Причина', value: reason, inline: false }
                )
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                .setFooter({ text: `Забанил: ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed] });
            
            // Логируем действие
            await logModeration(
                interaction.guild,
                interaction.user,
                targetUser,
                'ban',
                reason
            );
            
        } catch (error) {
            console.error('Ошибка при бане:', error);
            return interaction.reply({
                content: `🆘 Произошла ошибка: ${error.message}`,
                ephemeral: true
            });
        }
    }
}; 