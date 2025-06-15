const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { toggleModeration, isModerationEnabled } = require('../../features/aiModeration');
const { toggleAutoModeration, isAutoModerationEnabled } = require('../../features/autoModeration');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('модерация')
        .setDescription('Управление системами модерации')
        .addSubcommand(subcommand =>
            subcommand
                .setName('аи')
                .setDescription('Включить/выключить ИИ модерацию')
                .addBooleanOption(option =>
                    option.setName('статус')
                        .setDescription('Включить (true) или выключить (false) ИИ модерацию')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('авто')
                .setDescription('Включить/выключить автомодерацию')
                .addBooleanOption(option =>
                    option.setName('статус')
                        .setDescription('Включить (true) или выключить (false) автомодерацию')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('статус')
                .setDescription('Показать текущий статус систем модерации'))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'аи') {
            const status = interaction.options.getBoolean('статус');
            const newStatus = toggleModeration(status);
            
            const embed = new EmbedBuilder()
                .setTitle('🤖 Управление ИИ модерацией')
                .setColor(newStatus ? 0x2ECC71 : 0xE74C3C)
                .setDescription(`ИИ модерация была **${newStatus ? 'включена' : 'отключена'}**.`)
                .setFooter({ text: 'Изменения вступили в силу немедленно' })
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed] });
        }
        else if (subcommand === 'авто') {
            const status = interaction.options.getBoolean('статус');
            const newStatus = toggleAutoModeration(status);
            
            const embed = new EmbedBuilder()
                .setTitle('🛡️ Управление автомодерацией')
                .setColor(newStatus ? 0x2ECC71 : 0xE74C3C)
                .setDescription(`Автомодерация была **${newStatus ? 'включена' : 'отключена'}**.`)
                .setFooter({ text: 'Изменения вступили в силу немедленно' })
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed] });
        }
        else if (subcommand === 'статус') {
            const aiStatus = isModerationEnabled();
            const autoStatus = isAutoModerationEnabled();
            
            const embed = new EmbedBuilder()
                .setTitle('📊 Статус систем модерации')
                .setColor(0x3498DB)
                .addFields(
                    { name: '🤖 ИИ модерация', value: aiStatus ? '✅ Включена' : '❌ Отключена', inline: true },
                    { name: '🛡️ Автомодерация', value: autoStatus ? '✅ Включена' : '❌ Отключена', inline: true }
                )
                .setFooter({ text: 'Используйте /модерация аи или /модерация авто для изменения статуса' })
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed] });
        }
    }
}; 