const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { createTicketPanel } = require('../../features/ticketSystem');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('тикет')
        .setDescription('Управление системой тикетов')
        .addSubcommand(subcommand =>
            subcommand
                .setName('создать-панель')
                .setDescription('Создать панель для создания тикетов в текущем канале'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'создать-панель') {
            await interaction.deferReply({ ephemeral: true });
            
            try {
                // Проверяем, что канал существует и бот имеет права на отправку сообщений
                if (!interaction.channel) {
                    return await interaction.editReply({ 
                        content: '❌ Не удалось получить информацию о канале. Пожалуйста, попробуйте снова.', 
                        ephemeral: true 
                    });
                }
                
                // Создаем панель тикетов
                await createTicketPanel(interaction.channel);
                await interaction.editReply({ 
                    content: '✅ Панель для создания тикетов успешно создана!', 
                    ephemeral: true 
                });
            } catch (error) {
                console.error('Ошибка при создании панели тикетов:', error);
                await interaction.editReply({ 
                    content: '❌ Произошла ошибка при создании панели для тикетов: ' + error.message, 
                    ephemeral: true 
                });
            }
        }
    }
}; 