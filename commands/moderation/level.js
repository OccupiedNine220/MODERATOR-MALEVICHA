const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { getUserInfo, getLeaderboard } = require('../../features/levelSystem');
const { createCanvas, loadImage } = require('canvas');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('level')
        .setDescription('Управление системой уровней')
        .addSubcommand(subcommand =>
            subcommand
                .setName('info')
                .setDescription('Показывает информацию о вашем уровне или уровне другого пользователя')
                .addUserOption(option =>
                    option
                        .setName('пользователь')
                        .setDescription('Пользователь, чей уровень вы хотите проверить')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('leaderboard')
                .setDescription('Показывает таблицу лидеров по уровням')
                .addIntegerOption(option =>
                    option
                        .setName('количество')
                        .setDescription('Количество пользователей в таблице лидеров (по умолчанию 10)')
                        .setRequired(false)
                        .setMinValue(5)
                        .setMaxValue(25)
                )
        ),
    
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'info') {
            await this.showLevelInfo(interaction);
        } else if (subcommand === 'leaderboard') {
            await this.showLeaderboard(interaction);
        }
    },
    
    async showLevelInfo(interaction) {
        await interaction.deferReply();
        
        const targetUser = interaction.options.getUser('пользователь') || interaction.user;
        const { guild } = interaction;
        
        try {
            const userInfo = await getUserInfo(targetUser.id, guild.id);
            
            if (!userInfo) {
                return interaction.followUp({
                    content: `У пользователя ${targetUser} еще нет опыта на этом сервере.`,
                    ephemeral: true
                });
            }
            
            // Создаем карточку с уровнем
            const levelCard = await this.createLevelCard(targetUser, userInfo);
            
            const embed = new EmbedBuilder()
                .setTitle(`Уровень | ${targetUser.tag}`)
                .setColor('#3498db')
                .addFields(
                    { name: '📊 Уровень', value: userInfo.level.toString(), inline: true },
                    { name: '⭐ Опыт', value: `${userInfo.currentXP}/${userInfo.requiredXP} XP`, inline: true },
                    { name: '🔄 Прогресс', value: `${userInfo.percentage}%`, inline: true },
                    { name: '💬 Сообщений', value: userInfo.messages.toString(), inline: true },
                    { name: '🎙️ Время в голосовых каналах', value: `${userInfo.voiceTime} мин.`, inline: true }
                )
                .setTimestamp();
            
            await interaction.followUp({
                embeds: [embed],
                files: [levelCard]
            });
        } catch (error) {
            console.error('Ошибка при получении информации об уровне:', error);
            await interaction.followUp({
                content: 'Произошла ошибка при получении информации об уровне.',
                ephemeral: true
            });
        }
    },
    
    async showLeaderboard(interaction) {
        await interaction.deferReply();
        
        const { guild } = interaction;
        const limit = interaction.options.getInteger('количество') || 10;
        
        try {
            const leaderboard = await getLeaderboard(guild.id, limit);
            
            if (!leaderboard || leaderboard.length === 0) {
                return interaction.followUp({
                    content: 'На этом сервере еще нет данных о уровнях пользователей.',
                    ephemeral: true
                });
            }
            
            const embed = new EmbedBuilder()
                .setTitle(`🏆 Таблица лидеров | ${guild.name}`)
                .setColor('#e74c3c')
                .setDescription('Пользователи с наивысшим уровнем на сервере')
                .setThumbnail(guild.iconURL({ dynamic: true }))
                .setTimestamp();
            
            // Добавляем пользователей в таблицу лидеров
            let leaderboardText = '';
            for (let i = 0; i < leaderboard.length; i++) {
                const user = leaderboard[i];
                const member = await guild.members.fetch(user.userId).catch(() => null);
                const username = member ? member.user.tag : 'Неизвестный пользователь';
                
                leaderboardText += `**${i + 1}.** ${member ? member : 'Пользователь покинул сервер'}\n`;
                leaderboardText += `Уровень: **${user.level}** | XP: **${user.xp}** | Сообщения: **${user.messages}**\n\n`;
            }
            
            embed.setDescription(leaderboardText);
            
            await interaction.followUp({ embeds: [embed] });
        } catch (error) {
            console.error('Ошибка при получении таблицы лидеров:', error);
            await interaction.followUp({
                content: 'Произошла ошибка при получении таблицы лидеров.',
                ephemeral: true
            });
        }
    },
    
    async createLevelCard(user, userInfo) {
        // Создаем холст для карточки
        const canvas = createCanvas(800, 250);
        const ctx = canvas.getContext('2d');
        
        // Заполняем фон
        ctx.fillStyle = '#2f3136';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Отрисовываем границу
        ctx.strokeStyle = '#5865f2';
        ctx.lineWidth = 5;
        ctx.strokeRect(0, 0, canvas.width, canvas.height);
        
        // Загружаем и отрисовываем аватар пользователя
        try {
            const avatar = await loadImage(user.displayAvatarURL({ extension: 'png', size: 128 }));
            
            // Создаем круглый аватар
            ctx.save();
            ctx.beginPath();
            ctx.arc(125, 125, 80, 0, Math.PI * 2, true);
            ctx.closePath();
            ctx.clip();
            
            ctx.drawImage(avatar, 45, 45, 160, 160);
            ctx.restore();
        } catch (error) {
            console.error('Ошибка при загрузке аватара:', error);
        }
        
        // Добавляем имя пользователя
        ctx.font = '36px Arial';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(user.username, 240, 80);
        
        // Добавляем уровень
        ctx.font = '28px Arial';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`Уровень: ${userInfo.level}`, 240, 130);
        
        // Добавляем XP
        ctx.font = '24px Arial';
        ctx.fillStyle = '#cccccc';
        ctx.fillText(`XP: ${userInfo.currentXP}/${userInfo.requiredXP}`, 240, 170);
        
        // Рисуем полосу прогресса
        const barWidth = 500;
        const barHeight = 30;
        const barX = 240;
        const barY = 190;
        
        // Задний фон полосы
        ctx.fillStyle = '#434b5a';
        ctx.fillRect(barX, barY, barWidth, barHeight);
        
        // Прогресс
        const progressWidth = (userInfo.currentXP / userInfo.requiredXP) * barWidth;
        ctx.fillStyle = '#5865f2';
        ctx.fillRect(barX, barY, progressWidth, barHeight);
        
        // Добавляем процент
        ctx.font = '18px Arial';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`${userInfo.percentage}%`, barX + barWidth / 2 - 15, barY + 20);
        
        // Создаем буфер изображения
        const buffer = canvas.toBuffer('image/png');
        
        // Возвращаем вложение
        return new AttachmentBuilder(buffer, { name: 'level-card.png' });
    }
}; 