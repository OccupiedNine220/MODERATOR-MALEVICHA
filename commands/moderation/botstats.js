const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { ModStats } = require('../../models/schema');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('статистика')
        .setDescription('Показывает статистику модерации бота'),
    
    async execute(interaction) {
        const { client, guild } = interaction;
        
        await interaction.deferReply();
        
        try {
            // Получаем статистику из базы данных для всех модераторов сервера
            const allModStats = await ModStats.find({ guildId: guild.id });
            
            // Общая статистика
            let totalBans = 0;
            let totalMutes = 0;
            let totalKicks = 0;
            let totalWarns = 0;
            
            // Подсчет общей статистики
            allModStats.forEach(mod => {
                totalBans += mod.actions.bans;
                totalMutes += mod.actions.mutes;
                totalKicks += mod.actions.kicks;
                totalWarns += mod.actions.warns;
            });
            
            // Добавляем статистику удаленных сообщений из кэша клиента
            const deletedMessages = client.stats?.deletedMessages || 0;
            const editedMessages = client.stats?.editedMessages || 0;
            
            // Рассчитываем дополнительную информацию
            const totalActions = totalBans + totalMutes + totalKicks + totalWarns;
            const actionsPerMod = allModStats.length > 0 ? (totalActions / allModStats.length).toFixed(2) : 0;
            
            // Создаем эмбед
            const statsEmbed = new EmbedBuilder()
                .setTitle('📊 Статистика модерации')
                .setColor(0xE67E22)
                .addFields(
                    { name: '⚒️ Модерационные действия', value: `Баны: ${totalBans}\nМуты: ${totalMutes}\nКики: ${totalKicks}\nПредупреждения: ${totalWarns}`, inline: true },
                    { name: '📝 Сообщения', value: `Удалено: ${deletedMessages}\nОтредактировано: ${editedMessages}`, inline: true },
                    { name: '👮 Информация', value: `Всего действий: ${totalActions}\nКоличество модераторов: ${allModStats.length}\nДействий на модератора: ${actionsPerMod}`, inline: true }
                )
                .setFooter({ text: `Запрошено ${interaction.user.tag}` })
                .setTimestamp();
                
            // Если есть активные модераторы, добавляем список топ-3
            if (allModStats.length > 0) {
                // Сортируем модераторов по общему количеству действий
                const sortedMods = allModStats.sort((a, b) => {
                    const totalA = a.actions.bans + a.actions.mutes + a.actions.kicks + a.actions.warns;
                    const totalB = b.actions.bans + b.actions.mutes + b.actions.kicks + b.actions.warns;
                    return totalB - totalA;
                });
                
                // Получаем топ-3 модераторов
                const topMods = sortedMods.slice(0, 3);
                
                // Получаем информацию о пользователях
                let topModsField = '';
                
                for (let i = 0; i < topMods.length; i++) {
                    const mod = topMods[i];
                    const user = await client.users.fetch(mod.userId).catch(() => null);
                    
                    if (user) {
                        const totalModActions = mod.actions.bans + mod.actions.mutes + mod.actions.kicks + mod.actions.warns;
                        topModsField += `${i + 1}. ${user.tag}: ${totalModActions} действий\n`;
                    }
                }
                
                if (topModsField) {
                    statsEmbed.addFields({ name: '🏆 Лучшие модераторы', value: topModsField, inline: false });
                }
            }
            
            await interaction.editReply({ embeds: [statsEmbed] });
            
        } catch (error) {
            console.error('Ошибка при получении статистики модерации:', error);
            await interaction.editReply('Произошла ошибка при получении статистики.');
        }
    }
}; 