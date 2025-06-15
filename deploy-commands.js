const { REST, Routes } = require('discord.js');
const { token } = require('./config');
const fs = require('fs');
const path = require('path');

// Создаем массив для хранения команд
const commands = [];

// Функция для рекурсивного сбора команд из папок
function loadCommands(dir) {
    const commandsPath = path.join(__dirname, dir);
    const items = fs.readdirSync(commandsPath);
    
    for (const item of items) {
        const itemPath = path.join(commandsPath, item);
        const stat = fs.statSync(itemPath);
        
        if (stat.isDirectory()) {
            // Если это директория, рекурсивно загружаем команды из нее
            loadCommands(path.join(dir, item));
        } else if (item.endsWith('.js')) {
            // Загружаем команду
            const command = require(itemPath);
            
            // Проверяем наличие необходимых свойств
            if ('data' in command && 'execute' in command) {
                commands.push(command.data.toJSON());
                console.log(`Команда ${command.data.name} добавлена в список для регистрации.`);
            } else {
                console.warn(`Команда по пути ${itemPath} пропущена. Отсутствуют необходимые свойства 'data' или 'execute'.`);
            }
        }
    }
}

// Загружаем команды из директории commands
loadCommands('commands');

// Регистрация команд в Discord API
(async () => {
    try {
        console.log(`Начинаем обновление ${commands.length} / команд.`);
        
        // Проверяем, есть ли ID гильдии и токен для локального обновления команд
        if (process.env.GUILD_ID && process.env.TOKEN) {
            // Локальное обновление команд на одном сервере (быстрее для разработки)
            const guildId = process.env.GUILD_ID;
            const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
            
            const data = await rest.put(
                Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
                { body: commands },
            );
            
            console.log(`Успешно обновлено ${data.length} команд для гильдии ${guildId}.`);
        } else {
            // Глобальное обновление команд (занимает до 1 часа)
            const rest = new REST({ version: '10' }).setToken(token);
            
            const data = await rest.put(
                Routes.applicationCommands(process.env.CLIENT_ID || client.user.id),
                { body: commands },
            );
            
            console.log(`Успешно обновлено ${data.length} глобальных команд.`);
        }
    } catch (error) {
        console.error('Произошла ошибка при обновлении команд:', error);
    }
})(); 