const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { addTempRole, removeTempRole, getMemberTempRoles, updateTempRoleDuration } = require('../../features/tempRoleSystem');
const moment = require('moment');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('temprole')
        .setDescription('Управление временными ролями')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Выдать пользователю временную роль')
                .addUserOption(option =>
                    option
                        .setName('пользователь')
                        .setDescription('Пользователь, которому нужно выдать роль')
                        .setRequired(true)
                )
                .addRoleOption(option =>
                    option
                        .setName('роль')
                        .setDescription('Роль, которую нужно выдать')
                        .setRequired(true)
                )
                .addStringOption(option => 
                    option
                        .setName('время')
                        .setDescription('Продолжительность роли (например: 1h, 2d, 1w)')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('причина')
                        .setDescription('Причина выдачи временной роли')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Удалить временную роль у пользователя')
                .addUserOption(option =>
                    option
                        .setName('пользователь')
                        .setDescription('Пользователь, у которого нужно удалить роль')
                        .setRequired(true)
                )
                .addRoleOption(option =>
                    option
                        .setName('роль')
                        .setDescription('Роль, которую нужно удалить')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('причина')
                        .setDescription('Причина удаления временной роли')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Показать список временных ролей пользователя')
                .addUserOption(option =>
                    option
                        .setName('пользователь')
                        .setDescription('Пользователь, чьи временные роли нужно посмотреть')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('update')
                .setDescription('Обновить продолжительность временной роли')
                .addUserOption(option =>
                    option
                        .setName('пользователь')
                        .setDescription('Пользователь с временной ролью')
                        .setRequired(true)
                )
                .addRoleOption(option =>
                    option
                        .setName('роль')
                        .setDescription('Временная роль для обновления')
                        .setRequired(true)
                )
                .addStringOption(option => 
                    option
                        .setName('время')
                        .setDescription('Новая продолжительность роли (например: 1h, 2d, 1w)')
                        .setRequired(true)
                )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
    
    async execute(interaction) {
        // Проверяем, есть ли у бота право на управление ролями
        if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return interaction.reply({
                content: '❌ У меня нет прав на управление ролями на этом сервере!',
                ephemeral: true
            });
        }
        
        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'add') {
            await this.addTempRole(interaction);
        } else if (subcommand === 'remove') {
            await this.removeTempRole(interaction);
        } else if (subcommand === 'list') {
            await this.listTempRoles(interaction);
        } else if (subcommand === 'update') {
            await this.updateTempRole(interaction);
        }
    },
    
    async addTempRole(interaction) {
        const member = interaction.options.getMember('пользователь');
        const role = interaction.options.getRole('роль');
        const timeString = interaction.options.getString('время');
        const reason = interaction.options.getString('причина') || 'Не указана';
        
        // Проверяем положение роли относительно бота
        if (role.position >= interaction.guild.members.me.roles.highest.position) {
            return interaction.reply({
                content: '❌ Эта роль находится выше или на одном уровне с моей высшей ролью. Я не могу ее выдавать.',
                ephemeral: true
            });
        }
        
        // Парсим строку времени
        const duration = this.parseDuration(timeString);
        if (!duration) {
            return interaction.reply({
                content: '❌ Неверный формат времени. Используйте формат Xw (недели), Xd (дни), Xh (часы), Xm (минуты).',
                ephemeral: true
            });
        }
        
        // Преобразуем в миллисекунды
        const durationMs = duration.value;
        
        // Отправляем сообщение о начале выполнения
        await interaction.deferReply();
        
        // Добавляем временную роль
        const result = await addTempRole(member, role, durationMs, `${reason} (выдано ${interaction.user.tag})`);
        
        if (result.success) {
            const embed = new EmbedBuilder()
                .setTitle('✅ Временная роль добавлена')
                .setColor('#00ff00')
                .setDescription(`Роль ${role} была временно добавлена пользователю ${member}`)
                .addFields(
                    { name: '⏱️ Продолжительность', value: duration.text, inline: true },
                    { name: '📝 Причина', value: reason, inline: true },
                    { name: '👮 Модератор', value: `${interaction.user}`, inline: true }
                )
                .setTimestamp();
            
            await interaction.followUp({ embeds: [embed] });
        } else {
            await interaction.followUp({
                content: `❌ Ошибка при добавлении временной роли: ${result.message}`,
                ephemeral: true
            });
        }
    },
    
    async removeTempRole(interaction) {
        const member = interaction.options.getMember('пользователь');
        const role = interaction.options.getRole('роль');
        const reason = interaction.options.getString('причина') || 'Не указана';
        
        // Отправляем сообщение о начале выполнения
        await interaction.deferReply();
        
        // Удаляем временную роль
        const result = await removeTempRole(member, role, `${reason} (удалено ${interaction.user.tag})`);
        
        if (result.success) {
            const embed = new EmbedBuilder()
                .setTitle('✅ Временная роль удалена')
                .setColor('#ff9900')
                .setDescription(`Роль ${role} была удалена у пользователя ${member}`)
                .addFields(
                    { name: '📝 Причина', value: reason, inline: true },
                    { name: '👮 Модератор', value: `${interaction.user}`, inline: true }
                )
                .setTimestamp();
            
            await interaction.followUp({ embeds: [embed] });
        } else {
            await interaction.followUp({
                content: `❌ Ошибка при удалении временной роли: ${result.message}`,
                ephemeral: true
            });
        }
    },
    
    async listTempRoles(interaction) {
        const member = interaction.options.getMember('пользователь');
        
        // Отправляем сообщение о начале выполнения
        await interaction.deferReply();
        
        // Получаем список временных ролей
        const tempRoles = await getMemberTempRoles(member);
        
        if (tempRoles.length === 0) {
            return interaction.followUp({
                content: `У пользователя ${member} нет временных ролей.`,
                ephemeral: true
            });
        }
        
        const embed = new EmbedBuilder()
            .setTitle(`🕒 Временные роли | ${member.user.tag}`)
            .setColor('#3498db')
            .setDescription(`Список временных ролей пользователя ${member}`)
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
            .setTimestamp();
        
        for (const roleData of tempRoles) {
            const role = interaction.guild.roles.cache.get(roleData.roleId);
            if (!role) continue;
            
            const timeLeft = roleData.timeLeft;
            const timeLeftStr = this.formatDuration(timeLeft);
            
            embed.addFields({
                name: role.name,
                value: `📝 Причина: ${roleData.reason}\n⏱️ Истекает: ${moment(roleData.expiresAt).format('DD.MM.YYYY HH:mm')}\n⌛ Осталось: ${timeLeftStr}`
            });
        }
        
        await interaction.followUp({ embeds: [embed] });
    },
    
    async updateTempRole(interaction) {
        const member = interaction.options.getMember('пользователь');
        const role = interaction.options.getRole('роль');
        const timeString = interaction.options.getString('время');
        
        // Парсим строку времени
        const duration = this.parseDuration(timeString);
        if (!duration) {
            return interaction.reply({
                content: '❌ Неверный формат времени. Используйте формат Xw (недели), Xd (дни), Xh (часы), Xm (минуты).',
                ephemeral: true
            });
        }
        
        // Преобразуем в миллисекунды
        const durationMs = duration.value;
        
        // Отправляем сообщение о начале выполнения
        await interaction.deferReply();
        
        // Обновляем продолжительность временной роли
        const result = await updateTempRoleDuration(member, role, durationMs);
        
        if (result.success) {
            const embed = new EmbedBuilder()
                .setTitle('✅ Продолжительность обновлена')
                .setColor('#00ff00')
                .setDescription(`Продолжительность роли ${role} у пользователя ${member} обновлена`)
                .addFields(
                    { name: '⏱️ Новая продолжительность', value: duration.text, inline: true },
                    { name: '👮 Модератор', value: `${interaction.user}`, inline: true }
                )
                .setTimestamp();
            
            await interaction.followUp({ embeds: [embed] });
        } else {
            await interaction.followUp({
                content: `❌ Ошибка при обновлении продолжительности: ${result.message}`,
                ephemeral: true
            });
        }
    },
    
    parseDuration(input) {
        // Регулярное выражение для парсинга формата (число + единица измерения)
        const regex = /^(\d+)([wdhm])$/;
        const match = input.match(regex);
        
        if (!match) return null;
        
        const value = parseInt(match[1]);
        const unit = match[2];
        
        // Вычисляем миллисекунды
        let ms = 0;
        let text = '';
        
        switch (unit) {
            case 'w': // недели
                ms = value * 7 * 24 * 60 * 60 * 1000;
                text = `${value} ${this.pluralize(value, 'неделя', 'недели', 'недель')}`;
                break;
            case 'd': // дни
                ms = value * 24 * 60 * 60 * 1000;
                text = `${value} ${this.pluralize(value, 'день', 'дня', 'дней')}`;
                break;
            case 'h': // часы
                ms = value * 60 * 60 * 1000;
                text = `${value} ${this.pluralize(value, 'час', 'часа', 'часов')}`;
                break;
            case 'm': // минуты
                ms = value * 60 * 1000;
                text = `${value} ${this.pluralize(value, 'минута', 'минуты', 'минут')}`;
                break;
            default:
                return null;
        }
        
        return { value: ms, text };
    },
    
    formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 0) {
            return `${days} ${this.pluralize(days, 'день', 'дня', 'дней')}`;
        } else if (hours > 0) {
            return `${hours} ${this.pluralize(hours, 'час', 'часа', 'часов')}`;
        } else if (minutes > 0) {
            return `${minutes} ${this.pluralize(minutes, 'минута', 'минуты', 'минут')}`;
        } else {
            return 'менее минуты';
        }
    },
    
    pluralize(count, one, few, many) {
        if (count % 10 === 1 && count % 100 !== 11) {
            return one;
        } else if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) {
            return few;
        } else {
            return many;
        }
    }
}; 