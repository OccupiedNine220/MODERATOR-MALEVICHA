const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { Clan } = require('../../models/schema');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clanrole')
        .setDescription('Управление ролями кланов')
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Создать роль для клана')
                .addStringOption(option => 
                    option.setName('name')
                        .setDescription('Название клана')
                        .setRequired(true))
                .addStringOption(option => 
                    option.setName('color')
                        .setDescription('Цвет роли (HEX, например #FF0000)')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('Удалить роль клана')
                .addStringOption(option => 
                    option.setName('name')
                        .setDescription('Название клана')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('update')
                .setDescription('Обновить роли участникам клана')
                .addStringOption(option => 
                    option.setName('name')
                        .setDescription('Название клана')
                        .setRequired(true)))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
        
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        
        switch (subcommand) {
            case 'create':
                await createClanRole(interaction);
                break;
            case 'delete':
                await deleteClanRole(interaction);
                break;
            case 'update':
                await updateClanRoles(interaction);
                break;
        }
    }
};

async function createClanRole(interaction) {
    const guildId = interaction.guild.id;
    const clanName = interaction.options.getString('name');
    const color = interaction.options.getString('color') || '#2b2d31';
    
    // Проверяем существование клана
    const clan = await Clan.findOne({ name: clanName });
    if (!clan) {
        return interaction.reply({ content: '❌ Клан с таким названием не найден!', ephemeral: true });
    }
    
    // Проверяем, есть ли уже роль у клана
    const existingRoleId = clan.roleId;
    if (existingRoleId) {
        try {
            const existingRole = await interaction.guild.roles.fetch(existingRoleId);
            if (existingRole) {
                return interaction.reply({ 
                    content: `❌ У клана ${clan.emoji} ${clan.name} уже есть роль (${existingRole.name})!`,
                    ephemeral: true 
                });
            }
        } catch (error) {
            // Если роль не найдена, продолжаем создание новой
            console.log(`Роль клана не найдена: ${error.message}`);
        }
    }
    
    // Создаем новую роль
    try {
        const roleColor = /^#[0-9A-F]{6}$/i.test(color) ? color : '#2b2d31';
        const role = await interaction.guild.roles.create({
            name: `Клан ${clan.emoji} ${clan.name}`,
            color: roleColor,
            mentionable: true,
            reason: `Роль для клана ${clan.name}`
        });
        
        // Обновляем информацию о клане
        clan.roleId = role.id;
        await clan.save();
        
        // Добавляем роль всем участникам клана
        let updatedMembers = 0;
        for (const memberId of clan.members) {
            try {
                const member = await interaction.guild.members.fetch(memberId);
                if (member) {
                    await member.roles.add(role);
                    updatedMembers++;
                }
            } catch (error) {
                console.log(`Не удалось добавить роль участнику ${memberId}: ${error.message}`);
            }
        }
        
        const embed = new EmbedBuilder()
            .setTitle(`Роль клана создана`)
            .setDescription(`Создана роль для клана ${clan.emoji} ${clan.name}`)
            .addFields(
                { name: 'Название роли', value: role.name, inline: true },
                { name: 'Цвет', value: roleColor, inline: true },
                { name: 'Участников с ролью', value: updatedMembers.toString(), inline: true }
            )
            .setColor(roleColor)
            .setTimestamp();
            
        interaction.reply({ embeds: [embed] });
    } catch (error) {
        console.error(`Ошибка при создании роли клана: ${error.message}`);
        interaction.reply({ 
            content: `❌ Произошла ошибка при создании роли: ${error.message}`,
            ephemeral: true 
        });
    }
}

async function deleteClanRole(interaction) {
    const clanName = interaction.options.getString('name');
    
    // Проверяем существование клана
    const clan = await Clan.findOne({ name: clanName });
    if (!clan) {
        return interaction.reply({ content: '❌ Клан с таким названием не найден!', ephemeral: true });
    }
    
    // Проверяем наличие роли
    const roleId = clan.roleId;
    if (!roleId) {
        return interaction.reply({ content: '❌ У этого клана нет роли!', ephemeral: true });
    }
    
    // Удаляем роль
    try {
        const role = await interaction.guild.roles.fetch(roleId);
        if (role) {
            await role.delete(`Удаление роли клана ${clan.name}`);
            
            // Обновляем информацию о клане
            clan.roleId = null;
            await clan.save();
            
            interaction.reply({ content: `✅ Роль клана ${clan.emoji} ${clan.name} успешно удалена!` });
        } else {
            // Роль не найдена, обновляем информацию о клане
            clan.roleId = null;
            await clan.save();
            
            interaction.reply({ content: `⚠️ Роль клана не найдена, но информация обновлена.` });
        }
    } catch (error) {
        console.error(`Ошибка при удалении роли клана: ${error.message}`);
        interaction.reply({ 
            content: `❌ Произошла ошибка при удалении роли: ${error.message}`,
            ephemeral: true 
        });
    }
}

async function updateClanRoles(interaction) {
    const clanName = interaction.options.getString('name');
    
    // Проверяем существование клана
    const clan = await Clan.findOne({ name: clanName });
    if (!clan) {
        return interaction.reply({ content: '❌ Клан с таким названием не найден!', ephemeral: true });
    }
    
    // Проверяем наличие роли
    const roleId = clan.roleId;
    if (!roleId) {
        return interaction.reply({ 
            content: '❌ У этого клана нет роли! Сначала создайте роль через /clanrole create',
            ephemeral: true 
        });
    }
    
    try {
        // Получаем роль
        const role = await interaction.guild.roles.fetch(roleId);
        if (!role) {
            clan.roleId = null;
            await clan.save();
            return interaction.reply({ 
                content: '❌ Роль клана не найдена! Возможно, она была удалена. Создайте новую роль.',
                ephemeral: true 
            });
        }
        
        // Обновляем роли всем участникам
        let updatedMembers = 0;
        let failedMembers = 0;
        
        // Получаем всех участников клана
        for (const memberId of clan.members) {
            try {
                const member = await interaction.guild.members.fetch(memberId);
                if (member) {
                    // Проверяем, есть ли у участника уже эта роль
                    if (!member.roles.cache.has(roleId)) {
                        await member.roles.add(role);
                    }
                    updatedMembers++;
                }
            } catch (error) {
                console.log(`Не удалось обновить роль участнику ${memberId}: ${error.message}`);
                failedMembers++;
            }
        }
        
        // Проверяем всех участников с этой ролью, которые не в клане
        const membersWithRole = await interaction.guild.members.fetch();
        let removedRoles = 0;
        
        membersWithRole.forEach(async (member) => {
            if (member.roles.cache.has(roleId) && !clan.members.includes(member.id)) {
                try {
                    await member.roles.remove(role);
                    removedRoles++;
                } catch (error) {
                    console.log(`Не удалось удалить роль у участника ${member.id}: ${error.message}`);
                }
            }
        });
        
        const embed = new EmbedBuilder()
            .setTitle(`Обновление ролей клана`)
            .setDescription(`Роли клана ${clan.emoji} ${clan.name} обновлены`)
            .addFields(
                { name: 'Обновлено участников', value: updatedMembers.toString(), inline: true },
                { name: 'Не удалось обновить', value: failedMembers.toString(), inline: true },
                { name: 'Роль удалена у', value: removedRoles.toString(), inline: true }
            )
            .setColor(role.hexColor)
            .setTimestamp();
            
        interaction.reply({ embeds: [embed] });
    } catch (error) {
        console.error(`Ошибка при обновлении ролей клана: ${error.message}`);
        interaction.reply({ 
            content: `❌ Произошла ошибка при обновлении ролей: ${error.message}`,
            ephemeral: true 
        });
    }
} 