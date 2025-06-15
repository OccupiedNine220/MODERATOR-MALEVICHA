const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { isMod } = require('../../utils/permissions');
const { logModeration } = require('../../utils/logger');
const { Mute } = require('../../models/schema');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('размут')
        .setDescription('Снять заглушение с пользователя')
        .addUserOption(option => 
            option.setName('пользователь')
                .setDescription('Пользователь, с которого нужно снять заглушение')
                .setRequired(true)),
    
    async execute(interaction) {
        // Проверка прав
        if (!isMod(interaction.member)) {
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

        // Проверка, находится ли пользователь в муте
        if (!targetMember.isCommunicationDisabled()) {
            return interaction.reply({
                content: `${targetUser} не находится в муте.`,
                ephemeral: true
            });
        }

        try {
            // Снимаем таймаут
            await targetMember.timeout(null);
            
            // Удаляем запись о муте из базы данных
            await Mute.findOneAndDelete({ 
                userId: targetUser.id,
                guildId: interaction.guild.id 
            });
            
            // Создаем и отправляем эмбед
            const embed = new EmbedBuilder()
                .setTitle('Размут участника')
                .setDescription(`${targetUser} был возвращен к общению.`)
                .setColor(0x00FF00)
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                .setFooter({ text: `Размутил: ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed] });
            
            // Логируем действие
            await logModeration(
                interaction.guild,
                interaction.user,
                targetUser,
                'unmute',
                'Ручное снятие мута'
            );
            
        } catch (error) {
            console.error('Ошибка при снятии мута:', error);
            return interaction.reply({
                content: `❌ Произошла ошибка: ${error.message}`,
                ephemeral: true
            });
        }
    }
}; 