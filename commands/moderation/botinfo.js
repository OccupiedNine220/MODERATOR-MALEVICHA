const { SlashCommandBuilder, EmbedBuilder, version: djsVersion } = require('discord.js');
const { version, build } = require('../../config');
const moment = require('moment');
const os = require('os');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('бот')
        .setDescription('Показывает информацию о боте'),
    
    async execute(interaction) {
        const { client } = interaction;
        
        // Форматируем время работы бота
        const uptime = moment.duration(client.uptime);
        let uptimeString = '';
        
        if (uptime.days() > 0) uptimeString += `${uptime.days()} дн. `;
        if (uptime.hours() > 0) uptimeString += `${uptime.hours()} ч. `;
        if (uptime.minutes() > 0) uptimeString += `${uptime.minutes()} мин. `;
        uptimeString += `${uptime.seconds()} сек.`;
        
        // Получаем информацию о системе
        const totalMemory = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2); // в ГБ
        const usedMemory = ((os.totalmem() - os.freemem()) / 1024 / 1024 / 1024).toFixed(2); // в ГБ
        const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024; // в МБ
        const cpuModel = os.cpus()[0].model;
        const cpuCores = os.cpus().length;
        
        // Подсчёт статистики
        const servers = client.guilds.cache.size;
        const channels = client.channels.cache.size;
        const users = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
        
        // Создаем эмбед
        const botEmbed = new EmbedBuilder()
            .setTitle('🤖 Информация о боте')
            .setColor(0x7289DA)
            .setThumbnail(client.user.displayAvatarURL({ dynamic: true, size: 512 }))
            .addFields(
                { name: '🏷️ Имя', value: client.user.tag, inline: true },
                { name: '🆔 ID', value: client.user.id, inline: true },
                { name: '📅 Создан', value: moment(client.user.createdAt).format('DD.MM.YYYY [в] HH:mm'), inline: true },
                { name: '⚙️ Версия', value: version, inline: true },
                { name: '🏗️ Сборка', value: build, inline: true },
                { name: '⏱️ Аптайм', value: uptimeString, inline: true },
                { name: '📊 Статистика', value: `Серверов: ${servers}\nКаналов: ${channels}\nПользователей: ${users}`, inline: true },
                { name: '🛠️ Технические данные', value: `Node.js: ${process.version}\nDiscord.js: v${djsVersion}`, inline: true },
                { name: '💾 Память', value: `Использовано: ${usedMemory} ГБ из ${totalMemory} ГБ\nБот: ${memoryUsage.toFixed(2)} МБ`, inline: true },
                { name: '🖥️ Процессор', value: `${cpuModel}\nЯдер: ${cpuCores}`, inline: true },
                { name: '🚀 Инициализация', value: `<t:${Math.floor(client.readyTimestamp / 1000)}:R>`, inline: true }
            )
            .setFooter({ text: `Запрошено ${interaction.user.tag}` })
            .setTimestamp();
            
        // Отправляем ответ
        await interaction.reply({ embeds: [botEmbed] });
    }
}; 