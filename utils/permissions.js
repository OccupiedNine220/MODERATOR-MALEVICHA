const config = require('../config');

/**
 * Проверка наличия роли администратора
 * @param {Object} member - Объект участника Discord
 * @returns {boolean} - Имеет ли пользователь роль админа
 */
function isAdmin(member) {
    return member.roles.cache.has(config.adminRoleId);
}

/**
 * Проверка наличия роли модератора или выше
 * @param {Object} member - Объект участника Discord
 * @returns {boolean} - Имеет ли пользователь роль модератора или админа
 */
function isMod(member) {
    return member.roles.cache.has(config.modRoleId) || isAdmin(member);
}

/**
 * Проверка соответствия прав для модерационных команд
 * @param {Object} interaction - Объект взаимодействия Discord
 * @returns {boolean} - Имеет ли пользователь достаточно прав
 */
function checkModPermissions(interaction) {
    if (!isMod(interaction.member)) {
        interaction.reply({ 
            content: '🚫 У вас недостаточно прав для выполнения этой команды.', 
            ephemeral: true 
        });
        return false;
    }
    return true;
}

/**
 * Проверка соответствия прав для административных команд
 * @param {Object} interaction - Объект взаимодействия Discord
 * @returns {boolean} - Имеет ли пользователь достаточно прав
 */
function checkAdminPermissions(interaction) {
    if (!isAdmin(interaction.member)) {
        interaction.reply({ 
            content: '🚫 У вас недостаточно прав для выполнения этой команды.', 
            ephemeral: true 
        });
        return false;
    }
    return true;
}

module.exports = {
    isAdmin,
    isMod,
    checkModPermissions,
    checkAdminPermissions
}; 