const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { isMod } = require('../../utils/permissions');
const { logModeration } = require('../../utils/logger');
const { Mute } = require('../../models/schema');
const { ModStats } = require('../../models/schema');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('мут')
        .setDescription('Заглушить пользователя на определенное время')
        .addUserOption(option => 
            option.setName('пользователь')
                .setDescription('Пользователь, которого нужно заглушить')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('время')
                .setDescription('Длительность мута (пример: 30м, 2ч, 1д)')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('причина')
                .setDescription('Причина заглушения')
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

        // Проверка, не пытается ли модератор замутить себя или бота
        if (targetUser.id === interaction.user.id) {
            return interaction.reply({
                content: '❌ Вы не можете замутить себя!',
                ephemeral: true
            });
        }

        if (targetUser.bot) {
            return interaction.reply({
                content: '❌ Нельзя замутить бота!',
                ephemeral: true
            });
        }

        // Проверка времени
        const timeArg = interaction.options.getString('время');
        let duration;
        let timeoutDuration;
        
        try {
            if (timeArg.endsWith('м')) {
                const minutes = parseInt(timeArg.slice(0, -1));
                if (minutes < 1) throw new Error('Минимальное время мута - 1 минута');
                duration = `${minutes} минут`;
                timeoutDuration = minutes * 60 * 1000;
            } else if (timeArg.endsWith('ч')) {
                const hours = parseInt(timeArg.slice(0, -1));
                if (hours < 1) throw new Error('Минимальное время мута - 1 час');
                duration = `${hours} часов`;
                timeoutDuration = hours * 60 * 60 * 1000;
            } else if (timeArg.endsWith('д')) {
                const days = parseInt(timeArg.slice(0, -1));
                if (days < 1) throw new Error('Минимальное время мута - 1 день');
                if (days > 28) throw new Error('Максимальное время мута - 28 дней');
                duration = `${days} дней`;
                timeoutDuration = days * 24 * 60 * 60 * 1000;
            } else {
                throw new Error('Неверный формат времени');
            }
        } catch (error) {
            return interaction.reply({
                content: `❌ ${error.message}. Используйте формат: 30м (минуты), 2ч (часы), 1д (дни).`,
                ephemeral: true
            });
        }

        const reason = interaction.options.getString('причина');
        
        // Ограничение длины причины
        if (reason.length > 500) {
            return interaction.reply({
                content: '❌ Причина слишком длинная. Максимум 500 символов.',
                ephemeral: true
            });
        }

        try {
            // Применяем таймаут
            await targetMember.timeout(timeoutDuration, reason);
            
            // Сохраняем информацию о муте в базу данных
            const endTime = new Date(Date.now() + timeoutDuration);
            
            await Mute.findOneAndUpdate(
                { userId: targetUser.id, guildId: interaction.guild.id },
                { 
                    userId: targetUser.id,
                    guildId: interaction.guild.id,
                    endTime: endTime,
                    reason: reason
                },
                { upsert: true, new: true }
            );
            
            // Обновляем статистику модератора
            await ModStats.findOneAndUpdate(
                { userId: interaction.user.id, guildId: interaction.guild.id },
                { $inc: { 'actions.mutes': 1 } },
                { upsert: true }
            );
            
            // Создаем и отправляем эмбед
            const embed = new EmbedBuilder()
                .setTitle('Мут участника')
                .setDescription(`${targetUser} был лишен возможности общаться.`)
                .setColor(0xFFCC00)
                .addFields(
                    { name: 'Причина', value: reason, inline: false },
                    { name: 'Длительность', value: duration, inline: false }
                )
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                .setFooter({ text: `Выдал: ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed] });
            
            // Логируем действие
            await logModeration(
                interaction.guild,
                interaction.user,
                targetUser,
                'mute',
                reason,
                duration
            );
            
        } catch (error) {
            console.error('Ошибка при муте:', error);
            return interaction.reply({
                content: `❌ Произошла ошибка: ${error.message}`,
                ephemeral: true
            });
        }
    }
}; 