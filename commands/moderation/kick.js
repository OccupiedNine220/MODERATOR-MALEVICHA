const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { isAdmin } = require('../../utils/permissions');
const { logModeration } = require('../../utils/logger');
const { ModStats } = require('../../models/schema');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('кик')
        .setDescription('Выгнать пользователя с сервера')
        .addUserOption(option => 
            option.setName('пользователь')
                .setDescription('Пользователь, которого нужно выгнать')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('причина')
                .setDescription('Причина кика')
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
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        
        if (!targetMember) {
            return interaction.reply({
                content: '❌ Пользователь не найден на сервере.',
                ephemeral: true
            });
        }

        // Проверки пользователя
        if (targetUser.id === interaction.user.id) {
            return interaction.reply({
                content: '🙅 Вы не можете кикнуть себя!',
                ephemeral: true
            });
        }

        if (targetUser.bot) {
            return interaction.reply({
                content: '🤖 Нельзя кикнуть бота!',
                ephemeral: true
            });
        }

        // Проверка, можем ли мы кикнуть этого пользователя
        if (!targetMember.kickable) {
            return interaction.reply({
                content: '❌ Я не могу выгнать этого пользователя. Проверьте права ролей.',
                ephemeral: true
            });
        }

        const reason = interaction.options.getString('причина');
        
        // Проверка длины причины
        if (reason.length > 500) {
            return interaction.reply({
                content: '📝 Причина слишком длинная. Максимум 500 символов.',
                ephemeral: true
            });
        }

        try {
            // Кикаем пользователя
            await targetMember.kick(reason);
            
            // Обновляем статистику модератора
            await ModStats.findOneAndUpdate(
                { userId: interaction.user.id, guildId: interaction.guild.id },
                { $inc: { 'actions.kicks': 1 } },
                { upsert: true }
            );
            
            // Создаем и отправляем эмбед
            const embed = new EmbedBuilder()
                .setTitle('Кик участника')
                .setDescription(`${targetUser} был выгнан с сервера.`)
                .setColor(0xFF9900)
                .addFields(
                    { name: 'Причина', value: reason, inline: false }
                )
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                .setFooter({ text: `Кикнул: ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed] });
            
            // Логируем действие
            await logModeration(
                interaction.guild,
                interaction.user,
                targetUser,
                'kick',
                reason
            );
            
        } catch (error) {
            console.error('Ошибка при кике:', error);
            return interaction.reply({
                content: `🆘 Произошла ошибка: ${error.message}`,
                ephemeral: true
            });
        }
    }
}; 