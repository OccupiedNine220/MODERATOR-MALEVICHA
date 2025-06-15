const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { isMod } = require('../../utils/permissions');
const { logModeration } = require('../../utils/logger');
const { Warning, ModStats } = require('../../models/schema');
const rules = require('../../models/rules');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('варн')
        .setDescription('Выдать предупреждение пользователю')
        .addUserOption(option => 
            option.setName('пользователь')
                .setDescription('Пользователь, которому нужно выдать предупреждение')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('правило')
                .setDescription('ID нарушенного правила (например, 1.1, 2.3)')
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

        // Проверки пользователя
        if (targetUser.id === interaction.user.id) {
            return interaction.reply({
                content: '❓ Вы не можете выдать предупреждение себе!',
                ephemeral: true
            });
        }

        if (targetUser.bot) {
            return interaction.reply({
                content: '❌ Нельзя выдать предупреждение боту!',
                ephemeral: true
            });
        }

        // Получаем правило из id
        const ruleId = interaction.options.getString('правило');
        const rule = rules.rules[ruleId];
        
        if (!rule) {
            return interaction.reply({
                content: `❌ Правило с ID "${ruleId}" не найдено.`,
                ephemeral: true
            });
        }

        try {
            // Добавляем предупреждение в базу данных
            const warningDoc = await Warning.findOne({
                userId: targetUser.id, 
                guildId: interaction.guild.id
            });
            
            if (warningDoc) {
                // Уже есть запись, добавляем новое предупреждение
                warningDoc.warnings.push({
                    ruleId: ruleId,
                    reason: rule.description,
                    moderatorId: interaction.user.id,
                    timestamp: new Date()
                });
                await warningDoc.save();
            } else {
                // Создаем новую запись
                await Warning.create({
                    userId: targetUser.id,
                    guildId: interaction.guild.id,
                    warnings: [{
                        ruleId: ruleId,
                        reason: rule.description,
                        moderatorId: interaction.user.id,
                        timestamp: new Date()
                    }]
                });
            }
            
            // Обновляем статистику модератора
            await ModStats.findOneAndUpdate(
                { userId: interaction.user.id, guildId: interaction.guild.id },
                { $inc: { 'actions.warns': 1 } },
                { upsert: true }
            );
            
            // Получаем обновленное количество предупреждений
            const updatedWarningDoc = await Warning.findOne({
                userId: targetUser.id, 
                guildId: interaction.guild.id
            });
            
            const warnCount = updatedWarningDoc.warnings.length;
            
            // Создаем и отправляем эмбед
            const embed = new EmbedBuilder()
                .setTitle('Предупреждение выдано')
                .setDescription(`${targetUser} получил предупреждение (${warnCount}).`)
                .setColor(0x00CCFF)
                .addFields(
                    { name: 'Правило', value: `${ruleId}: ${rule.description}`, inline: false }
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
                'warn',
                `Правило ${ruleId}: ${rule.description}`
            );
            
            // Автоматические действия в зависимости от количества предупреждений
            if (warnCount === 3) {
                await targetMember.timeout(60 * 60 * 1000, 'Автоматический мут за 3 предупреждения');
                await interaction.channel.send(
                    `${targetUser} был автоматически замучен на 1 час за накопление 3 предупреждений.`
                );
            } else if (warnCount === 5) {
                await targetMember.kick('Автоматический кик за 5 предупреждений');
                await interaction.channel.send(
                    `${targetUser} был автоматически кикнут за накопление 5 предупреждений.`
                );
            } else if (warnCount >= 7) {
                await interaction.guild.members.ban(targetUser, { reason: 'Автоматический бан за 7 или более предупреждений' });
                await Warning.findOneAndDelete({ userId: targetUser.id, guildId: interaction.guild.id });
                await interaction.channel.send(
                    `${targetUser} был автоматически забанен за накопление 7 или более предупреждений.`
                );
            }
            
        } catch (error) {
            console.error('Ошибка при выдаче предупреждения:', error);
            return interaction.reply({
                content: `❌ Произошла ошибка: ${error.message}`,
                ephemeral: true
            });
        }
    }
}; 