const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require('discord.js');
const moment = require('moment');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('сервер')
        .setDescription('Показывает информацию о сервере'),
    
    async execute(interaction) {
        const { guild } = interaction;
        
        // Получаем информацию о владельце сервера
        const owner = await guild.members.fetch(guild.ownerId);
        
        // Считаем количество каналов по типам
        const textChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildText).size;
        const voiceChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice).size;
        const categoryChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).size;
        
        // Устанавливаем уровень проверки
        const verificationLevels = {
            0: 'Нет',
            1: 'Низкий',
            2: 'Средний',
            3: 'Высокий',
            4: 'Очень высокий'
        };
        
        // Получаем количество пользователей по типам
        const humans = guild.members.cache.filter(member => !member.user.bot).size;
        const bots = guild.members.cache.filter(member => member.user.bot).size;
        
        // Считаем количество ролей (минус роль everyone)
        const roles = guild.roles.cache.size - 1;
        
        // Форматирование даты создания сервера
        moment.locale('ru');
        const createdAt = moment(guild.createdAt).format('DD.MM.YYYY [в] HH:mm');
        const daysAgo = moment().diff(guild.createdAt, 'days');
        
        // Создаем эмбед
        const serverEmbed = new EmbedBuilder()
            .setTitle('📊 Информация о сервере')
            .setColor(0x5865F2)
            .setThumbnail(guild.iconURL({ dynamic: true, size: 512 }))
            .addFields(
                { name: '🏷️ Название', value: guild.name, inline: true },
                { name: '👑 Владелец', value: `${owner.user.tag}`, inline: true },
                { name: '🆔 ID сервера', value: guild.id, inline: true },
                { name: '👥 Участники', value: `Всего: ${guild.memberCount}\nЛюди: ${humans}\nБоты: ${bots}`, inline: true },
                { name: '📁 Каналы', value: `Всего: ${guild.channels.cache.size}\nТекстовые: ${textChannels}\nГолосовые: ${voiceChannels}\nКатегории: ${categoryChannels}`, inline: true },
                { name: '🛡️ Роли', value: `${roles}`, inline: true },
                { name: '🔒 Уровень проверки', value: verificationLevels[guild.verificationLevel], inline: true },
                { name: '🚀 Буст', value: `Уровень: ${guild.premiumTier}\nКоличество: ${guild.premiumSubscriptionCount || 0}`, inline: true },
                { name: '📅 Создан', value: `${createdAt} (${daysAgo} дней назад)`, inline: true }
            )
            .setFooter({ text: `Запрошено ${interaction.user.tag}` })
            .setTimestamp();
            
        // Отправляем ответ
        await interaction.reply({ embeds: [serverEmbed] });
    }
}; 