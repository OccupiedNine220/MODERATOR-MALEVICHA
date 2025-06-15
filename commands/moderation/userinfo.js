const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { Warning, RiskPoints } = require('../../models/schema');
const moment = require('moment');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('участник')
        .setDescription('Показывает информацию об участнике')
        .addUserOption(option => 
            option.setName('пользователь')
                .setDescription('Пользователь, о котором нужна информация')
                .setRequired(false)),
    
    async execute(interaction) {
        await interaction.deferReply();
        
        // Получаем пользователя (если не указан, берем автора команды)
        const targetUser = interaction.options.getUser('пользователь') || interaction.user;
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        
        if (!targetMember) {
            return interaction.editReply(`Не удалось получить информацию о пользователе ${targetUser.tag}.`);
        }
        
        // Форматирование дат
        moment.locale('ru');
        const joinedAt = moment(targetMember.joinedAt).format('DD.MM.YYYY [в] HH:mm');
        const createdAt = moment(targetUser.createdAt).format('DD.MM.YYYY [в] HH:mm');
        const joinDaysAgo = moment().diff(targetMember.joinedAt, 'days');
        const accountDaysAgo = moment().diff(targetUser.createdAt, 'days');
        
        // Получаем список ролей (исключая @everyone)
        const roles = targetMember.roles.cache
            .filter(role => role.id !== interaction.guild.id)
            .sort((a, b) => b.position - a.position)
            .map(role => role.toString())
            .join(', ') || 'Нет ролей';
        
        // Получаем предупреждения из базы данных
        const warningsData = await Warning.findOne({ 
            userId: targetUser.id, 
            guildId: interaction.guild.id 
        });
        
        const warnings = warningsData?.warnings?.length || 0;
        
        // Получаем риск-очки из базы данных
        const riskData = await RiskPoints.findOne({ 
            userId: targetUser.id, 
            guildId: interaction.guild.id 
        });
        
        const riskPoints = riskData?.totalPoints || 0;
        
        // Получаем разрешения пользователя
        let permissionsText = '';
        const permissions = targetMember.permissions.toArray();
        
        const keyPermissions = [
            { name: 'Администратор', value: PermissionFlagsBits.Administrator },
            { name: 'Управление сервером', value: PermissionFlagsBits.ManageGuild },
            { name: 'Модерация участников', value: PermissionFlagsBits.ModerateMembers },
            { name: 'Бан участников', value: PermissionFlagsBits.BanMembers },
            { name: 'Кик участников', value: PermissionFlagsBits.KickMembers },
            { name: 'Управление сообщениями', value: PermissionFlagsBits.ManageMessages },
            { name: 'Управление никнеймами', value: PermissionFlagsBits.ManageNicknames },
            { name: 'Управление ролями', value: PermissionFlagsBits.ManageRoles }
        ];
        
        for (const perm of keyPermissions) {
            if (targetMember.permissions.has(perm.value)) {
                permissionsText += `${perm.name}, `;
            }
        }
        
        permissionsText = permissionsText.slice(0, -2) || 'Нет ключевых разрешений';
        
        // Создаем эмбед
        const userEmbed = new EmbedBuilder()
            .setTitle(`👤 Информация о пользователе ${targetUser.tag}`)
            .setColor(targetMember.displayHexColor || 0x2F3136)
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 512 }))
            .addFields(
                { name: '🏷️ Имя', value: targetUser.tag, inline: true },
                { name: '🆔 ID', value: targetUser.id, inline: true },
                { name: '🤖 Бот', value: targetUser.bot ? 'Да' : 'Нет', inline: true },
                { name: '📅 Присоединился', value: `${joinedAt} (${joinDaysAgo} дней назад)`, inline: true },
                { name: '🐣 Создан', value: `${createdAt} (${accountDaysAgo} дней назад)`, inline: true },
                { name: '🛑 Предупреждения', value: `${warnings}`, inline: true },
                { name: '⚠️ Риск-очки', value: `${riskPoints}`, inline: true },
                { name: '🎭 Никнейм', value: targetMember.nickname || 'Нет никнейма', inline: true }
            )
            .setFooter({ text: `Запрошено ${interaction.user.tag}` })
            .setTimestamp();
        
        // Добавляем поля с ролями и разрешениями, если их не слишком много
        if (roles.length < 1024) {
            userEmbed.addFields({ name: '🛡️ Роли', value: roles.toString(), inline: false });
        } else {
            userEmbed.addFields({ name: '🛡️ Роли', value: `Слишком много ролей для отображения (${targetMember.roles.cache.size - 1})`, inline: false });
        }
        
        userEmbed.addFields({ name: '🔑 Ключевые разрешения', value: permissionsText, inline: false });
        
        // Отображаем информацию о таймауте, если есть
        if (targetMember.communicationDisabledUntil) {
            const timeoutUntil = moment(targetMember.communicationDisabledUntil).format('DD.MM.YYYY [в] HH:mm');
            userEmbed.addFields({ name: '🔇 Таймаут до', value: timeoutUntil, inline: false });
        }
        
        await interaction.editReply({ embeds: [userEmbed] });
    }
}; 