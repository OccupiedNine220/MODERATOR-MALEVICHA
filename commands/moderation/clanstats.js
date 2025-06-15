const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { Clan } = require('../../models/schema');
const Canvas = require('canvas');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clanstats')
        .setDescription('Показать статистику кланов')
        .addSubcommand(subcommand =>
            subcommand
                .setName('top')
                .setDescription('Показать топ кланов по уровню и силе'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('chart')
                .setDescription('Показать график распределения кланов')),
                
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        
        switch (subcommand) {
            case 'top':
                await showTopClans(interaction);
                break;
            case 'chart':
                await showClanChart(interaction);
                break;
        }
    }
};

async function showTopClans(interaction) {
    await interaction.deferReply();
    
    // Получаем все кланы, сортируем по уровню и силе
    const clans = await Clan.find().sort({ level: -1, power: -1, exp: -1 });
    
    if (clans.length === 0) {
        return interaction.editReply('На сервере пока нет кланов!');
    }
    
    const embed = new EmbedBuilder()
        .setTitle('🏆 Топ кланов')
        .setDescription('Рейтинг кланов сервера по уровню и силе')
        .setColor('#FFD700')
        .setTimestamp();
    
    // Определяем специальные эмодзи для топ-3
    const rankEmojis = ['🥇', '🥈', '🥉'];
    
    // Добавляем поля для каждого клана в топ-10
    clans.slice(0, 10).forEach((clan, index) => {
        const rankDisplay = index < 3 ? rankEmojis[index] : `${index + 1}.`;
        
        embed.addFields({
            name: `${rankDisplay} ${clan.emoji} ${clan.name}`,
            value: `Уровень: ${clan.level} | Сила: ${clan.power} | Участников: ${clan.members.length}\nВладелец: <@${clan.owner}>`
        });
    });
    
    // Добавляем общую статистику
    const totalMembers = clans.reduce((sum, clan) => sum + clan.members.length, 0);
    const avgLevel = (clans.reduce((sum, clan) => sum + clan.level, 0) / clans.length).toFixed(1);
    const avgPower = (clans.reduce((sum, clan) => sum + clan.power, 0) / clans.length).toFixed(1);
    
    embed.addFields({
        name: '📊 Общая статистика',
        value: `Всего кланов: ${clans.length}\nВсего участников в кланах: ${totalMembers}\nСредний уровень клана: ${avgLevel}\nСредняя сила клана: ${avgPower}`
    });
    
    await interaction.editReply({ embeds: [embed] });
}

async function showClanChart(interaction) {
    await interaction.deferReply();
    
    // Получаем все кланы
    const clans = await Clan.find();
    
    if (clans.length === 0) {
        return interaction.editReply('На сервере пока нет кланов!');
    }
    
    // Создаем canvas для диаграммы
    const canvas = Canvas.createCanvas(800, 600);
    const ctx = canvas.getContext('2d');
    
    // Заполняем фон
    ctx.fillStyle = '#2b2d31';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Добавляем заголовок
    ctx.font = 'bold 36px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText('Статистика кланов', canvas.width / 2, 50);
    
    // Сортируем кланы по количеству участников
    clans.sort((a, b) => b.members.length - a.members.length);
    
    // Ограничиваем до 8 кланов для диаграммы
    const topClans = clans.slice(0, 8);
    
    // Рисуем столбчатую диаграмму количества участников
    const barWidth = 60;
    const spacing = 40;
    const startX = (canvas.width - (topClans.length * (barWidth + spacing) - spacing)) / 2;
    const maxHeight = 300;
    const maxMembers = Math.max(...topClans.map(clan => clan.members.length));
    
    // Рисуем оси
    ctx.beginPath();
    ctx.strokeStyle = '#888888';
    ctx.lineWidth = 2;
    ctx.moveTo(50, 100);
    ctx.lineTo(50, 500);
    ctx.lineTo(750, 500);
    ctx.stroke();
    
    // Рисуем столбцы для каждого клана
    topClans.forEach((clan, index) => {
        const x = startX + index * (barWidth + spacing);
        const height = (clan.members.length / maxMembers) * maxHeight;
        const y = 500 - height;
        
        // Рисуем столбец
        ctx.fillStyle = getRandomColor(index);
        ctx.fillRect(x, y, barWidth, height);
        
        // Добавляем название клана
        ctx.font = 'bold 16px sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(clan.name.substring(0, 10), x + barWidth / 2, 525);
        
        // Добавляем количество участников
        ctx.fillText(clan.members.length.toString(), x + barWidth / 2, y - 10);
    });
    
    // Добавляем подписи осей
    ctx.font = 'bold 20px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText('Количество участников', canvas.width / 2, 550);
    
    // Добавляем линии сетки для оси Y
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'right';
    ctx.strokeStyle = '#444444';
    ctx.lineWidth = 1;
    
    for (let i = 0; i <= 5; i++) {
        const y = 500 - (i * maxHeight / 5);
        const value = Math.round(i * maxMembers / 5);
        
        ctx.beginPath();
        ctx.moveTo(45, y);
        ctx.lineTo(750, y);
        ctx.stroke();
        
        ctx.fillText(value.toString(), 40, y + 5);
    }
    
    // Создаем изображение и отправляем в Discord
    const attachment = new AttachmentBuilder(canvas.toBuffer(), { name: 'clan-stats.png' });
    
    const embed = new EmbedBuilder()
        .setTitle('📊 Статистика кланов')
        .setDescription('График распределения участников по кланам')
        .setImage('attachment://clan-stats.png')
        .setColor('#2b2d31')
        .setTimestamp();
    
    await interaction.editReply({ embeds: [embed], files: [attachment] });
}

// Функция для получения случайного цвета в зависимости от индекса
function getRandomColor(index) {
    const colors = [
        '#FF5555', // красный
        '#55FF55', // зеленый
        '#5555FF', // синий
        '#FFFF55', // желтый
        '#FF55FF', // пурпурный
        '#55FFFF', // голубой
        '#FF9955', // оранжевый
        '#AA55FF'  // фиолетовый
    ];
    
    return colors[index % colors.length];
} 