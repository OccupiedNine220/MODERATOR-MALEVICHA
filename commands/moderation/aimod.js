const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { testModeration } = require('../../features/aiModeration');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('аи-тест')
        .setDescription('Тестирует ИИ модерацию на указанном тексте')
        .addStringOption(option =>
            option.setName('текст')
                .setDescription('Текст для проверки')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    
    async execute(interaction) {
        await interaction.deferReply();
        
        const testText = interaction.options.getString('текст');
        
        try {
            // Анализируем текст через ИИ
            const analysis = await testModeration(testText);
            
            // Определяем цвет на основе серьезности нарушения
            let color = 0x2ECC71; // Зеленый (нет нарушений)
            if (analysis.violation_detected) {
                if (analysis.severity >= 7) {
                    color = 0xFF0000; // Красный (серьезное нарушение)
                } else if (analysis.severity >= 4) {
                    color = 0xFFCC00; // Желтый (среднее нарушение)
                } else if (analysis.severity >= 2) {
                    color = 0x3498DB; // Синий (легкое нарушение)
                }
            }
            
            // Создаем типы нарушений на русском
            const violationTypes = {
                HATE: 'Ненавистническое высказывание',
                HARASSMENT: 'Домогательство/Травля',
                SEXUAL: 'Сексуальный контент',
                VIOLENCE: 'Насилие/Жестокость',
                SELF_HARM: 'Самоповреждение',
                ILLEGAL: 'Незаконная деятельность',
                SPAM: 'Спам/Нежелательный контент',
                NONE: 'Нет нарушений'
            };
            
            // Получаем действие, которое было бы предпринято
            let actionTaken = 'Нет действий';
            if (analysis.violation_detected) {
                if (analysis.severity >= 7) {
                    actionTaken = 'Удаление сообщения + таймаут пользователя';
                } else if (analysis.severity >= 4) {
                    actionTaken = 'Удаление сообщения';
                } else if (analysis.severity >= 2) {
                    actionTaken = 'Предупреждение без удаления';
                }
            }
            
            // Создаем эмбед с результатами анализа
            const resultEmbed = new EmbedBuilder()
                .setTitle('🤖 Результат AI анализа')
                .setColor(color)
                .setDescription(`**Текст**: ${testText.length > 100 ? testText.substring(0, 100) + '...' : testText}`)
                .addFields(
                    { name: 'Обнаружено нарушение', value: analysis.violation_detected ? 'Да ⚠️' : 'Нет ✅', inline: true },
                    { name: 'Тип нарушения', value: violationTypes[analysis.primary_violation_type], inline: true },
                    { name: 'Уверенность', value: `${(analysis.confidence * 100).toFixed(1)}%`, inline: true },
                    { name: 'Серьезность', value: `${analysis.severity}/10`, inline: true },
                    { name: 'Действие', value: actionTaken, inline: true },
                    { name: 'Объяснение', value: analysis.explanation || 'Не предоставлено', inline: false }
                )
                .setFooter({ text: 'GROQ • Llama Guard AI Модерация' })
                .setTimestamp();
            
            await interaction.editReply({ embeds: [resultEmbed] });
            
        } catch (error) {
            console.error('Ошибка при тестировании AI модерации:', error);
            await interaction.editReply('Произошла ошибка при тестировании AI модерации. Проверьте консоль для получения дополнительной информации.');
        }
    }
}; 