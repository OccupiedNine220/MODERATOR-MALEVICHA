const axios = require('axios');
const { EmbedBuilder } = require('discord.js');
const { addRiskPoints } = require('./autoModeration');
const { addTempRole } = require('./tempRoleSystem');
const config = require('../config');

// Глобальная переменная для включения/отключения модерации
let moderationEnabled = true;

/**
 * Включает или отключает систему ИИ модерации
 * @param {boolean} enabled - Включить (true) или отключить (false) модерацию
 * @returns {boolean} - Новое состояние модерации
 */
function toggleModeration(enabled) {
    if (enabled !== undefined) {
        moderationEnabled = !!enabled;
    } else {
        moderationEnabled = !moderationEnabled;
    }
    return moderationEnabled;
}

/**
 * Проверяет, включена ли модерация
 * @returns {boolean} - Текущее состояние модерации
 */
function isModerationEnabled() {
    return moderationEnabled;
}

// Типы нарушений
const VIOLATION_TYPES = {
    HATE: 'Ненавистническое высказывание',
    HARASSMENT: 'Домогательство/Травля',
    SEXUAL: 'Сексуальный контент',
    VIOLENCE: 'Насилие/Жестокость',
    SELF_HARM: 'Самоповреждение',
    ILLEGAL: 'Незаконная деятельность',
    SPAM: 'Спам/Нежелательный контент',
    NONE: 'Нет нарушений'
};

// Система штрафов за разные типы нарушений
const VIOLATION_POINTS = {
    HATE: 15,
    HARASSMENT: 10,
    SEXUAL: 12,
    VIOLENCE: 8,
    SELF_HARM: 5,
    ILLEGAL: 20,
    SPAM: 3
};

// ID душевного канала, где нужно выдавать роль локера
const SPECIAL_CHANNEL_ID = '1376584907903733850';

/**
 * Анализирует сообщение с использованием локальной проверки
 * @param {string} content - Содержимое сообщения для анализа
 * @returns {Object} - Результат анализа
 */
async function analyzeLocally(content) {
    console.log('Используем локальную проверку сообщения: ' + content.substring(0, 30) + '...');
    
    // Проверка на запрещенные слова
    const lowerContent = content.toLowerCase();
    
    // Список запрещенных слов по категориям
    const badWordsByCategory = {
        HATE: ["сука", "блять", "хуй", "пизда", "нахуй", "ебать", "говно", "нигг", "пидор", "пидар", "шлюха", "долбоеб"],
        HARASSMENT: ["убейся", "подохни", "заткнись", "урод", "дебил", "даун", "деградант"],
        SEXUAL: ["секс", "порно", "трах", "интим", "хентай"],
        VIOLENCE: ["убью", "зарежу", "расстрел", "убийство", "насилие"],
        SELF_HARM: ["суицид", "выпилиться", "вены", "петля", "самоубийство"],
        ILLEGAL: ["наркотик", "героин", "кокаин", "спайс", "грабеж", "взлом", "хакнуть", "скачать бесплатно"],
        SPAM: ["реклама", "подпишись", "скидки", "акция", "распродажа", "заходи"]
    };
    
    // Проверяем каждую категорию
    for (const [category, words] of Object.entries(badWordsByCategory)) {
        if (words.some(word => lowerContent.includes(word))) {
            // Определяем уровень серьезности в зависимости от категории
            let severity = 5; // По умолчанию средняя серьезность
            
            switch (category) {
                case "HATE":
                    severity = 7;
                    break;
                case "HARASSMENT":
                    severity = 6;
                    break;
                case "SEXUAL":
                    severity = 6;
                    break;
                case "VIOLENCE":
                    severity = 8;
                    break;
                case "SELF_HARM":
                    severity = 9;
                    break;
                case "ILLEGAL":
                    severity = 7;
                    break;
                case "SPAM":
                    severity = 3;
                    break;
            }
            
            return {
                violation_detected: true,
                primary_violation_type: category,
                confidence: 0.9,
                explanation: `Сообщение содержит запрещенный контент категории ${VIOLATION_TYPES[category]}.`,
                severity: severity
            };
        }
    }
    
    // Проверка на капс (если более 70% заглавных букв в сообщении длиннее 5 символов)
    if (content.length > 5) {
        const upperCaseChars = content.replace(/[^A-ZА-ЯЁ]/g, '').length;
        const totalChars = content.replace(/[^A-Za-zА-Яа-яЁё]/g, '').length;
        
        if (totalChars > 0 && (upperCaseChars / totalChars) > 0.7) {
            return {
                violation_detected: true,
                primary_violation_type: "SPAM",
                confidence: 0.75,
                explanation: "Сообщение содержит слишком много заглавных букв (капс).",
                severity: 2
            };
        }
    }
    
    // Проверка на повторяющиеся символы (спам)
    const repeatedChars = /(.)\1{5,}/;
    if (repeatedChars.test(content)) {
        return {
            violation_detected: true,
            primary_violation_type: "SPAM",
            confidence: 0.8,
            explanation: "Сообщение содержит слишком много повторяющихся символов.",
            severity: 2
        };
    }
    
    // Если нарушений не обнаружено
    return {
        violation_detected: false,
        primary_violation_type: "NONE",
        confidence: 0.9,
        explanation: "Сообщение не содержит запрещенного контента.",
        severity: 0
    };
}

/**
 * Анализирует сообщение с использованием GROQ API 
 * @param {string} content - Содержимое сообщения для анализа
 * @returns {Object} - Результат анализа
 */
async function analyzeWithGroq(content) {
    try {
        console.log('Используем GROQ API для проверки сообщения');
        
        // Экранируем специальные символы в тексте сообщения
        const safeContent = content.replace(/[\\"\n\r\t]/g, char => {
            switch (char) {
                case '\\': return '\\\\';
                case '"': return '\\"';
                case '\n': return '\\n';
                case '\r': return '\\r';
                case '\t': return '\\t';
                default: return char;
            }
        });
        
        const prompt = `
Рассмотри следующее сообщение из чата Discord:
"${safeContent}"

Твоя задача - определить, нарушает ли это сообщение правила сообщества:
1. Ненавистнические высказывания (расизм, сексизм, гомофобия)
2. Домогательство или травля
3. Сексуальный контент # Начинается с 6 баллов.
4. Насилие или жестокость # Начинается с 9 баллов.
5. Самоповреждение
6. Незаконная деятельность # Есть нарушение - сразу ставь 10.
7. Спам или нежелательный контент

Пожалуйста, не будь душнилой.
Оцени содержимое по шкале от 0 до 10 по уровню серьезности нарушения и верни JSON в следующем формате:
{
  "violation_detected": true/false,
  "primary_violation_type": "HATE"/"HARASSMENT"/"SEXUAL"/"VIOLENCE"/"SELF_HARM"/"ILLEGAL"/"SPAM"/"NONE",
  "confidence": <число от 0 до 1>,
  "explanation": "<объяснение>",
  "severity": <число от 0 до 10>
}
        `;

        // ВАЖНО: Правильный URL для GROQ API - /openai/v1/chat/completions
        const response = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
            model: "meta-llama/llama-4-scout-17b-16e-instruct",
            messages: [
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.1,
            response_format: { type: "json_object" },
            max_tokens: 1024
        }, {
            headers: {
                "Authorization": `Bearer ${config.groqApiKey}`,
                "Content-Type": "application/json"
            }
        });

        if (response.data && response.data.choices && response.data.choices[0] && response.data.choices[0].message) {
            try {
                const content = response.data.choices[0].message.content;
                // Удаляем все, что не является JSON
                const jsonMatch = content.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const parsedJson = JSON.parse(jsonMatch[0]);
                    return parsedJson;
                }
                throw new Error("Не удалось извлечь JSON из ответа");
            } catch (parseError) {
                console.error("Ошибка при разборе JSON ответа:", parseError);
                // Возвращаемся к локальной проверке
                return await analyzeLocally(content);
            }
        }

        throw new Error("Неправильный формат ответа API");
    } catch (error) {
        console.error('Ошибка при запросе к GROQ API:', error.message);
        if (error.response) {
            console.error('Статус ответа:', error.response.status);
            console.error('Данные ответа:', error.response.data);
        } else if (error.request) {
            console.error('Запрос был отправлен, но ответ не получен');
        }
        // В случае ошибки, используем локальную проверку
        return await analyzeLocally(content);
    }
}

/**
 * Обработка сообщения через ИИ модерацию
 * @param {Object} message - Объект сообщения Discord
 * @returns {boolean} - Было ли обнаружено нарушение
 */
async function moderateMessage(message) {
    // Проверяем, включена ли модерация
    if (!moderationEnabled) return false;
    
    // Игнорируем сообщения от ботов
    if (message.author.bot) return false;
    
    // Проверяем, что сообщение имеет текстовое содержимое
    if (!message.content || message.content.trim().length < 3) {
        return false;
    }
    
    try {
        // Выбираем метод анализа в зависимости от наличия ключа GROQ
        let analysis;
        if (config.groqApiKey) {
            // Если есть ключ GROQ, используем их API
            analysis = await analyzeWithGroq(message.content);
        } else {
            // Иначе используем локальную проверку
            analysis = await analyzeLocally(message.content);
        }
        
        // Если нарушение не обнаружено или уровень уверенности низкий, пропускаем
        if (!analysis.violation_detected || analysis.confidence < 0.65) {
            return false;
        }
        
        // Логируем результат анализа
        console.log(`AI Модерация: ${message.author.tag} - ${analysis.primary_violation_type} (${analysis.confidence.toFixed(2)})`);
        
        // Проверяем, находится ли сообщение в специальном канале
        if (message.channel.id === SPECIAL_CHANNEL_ID) {
            // В душевном канале выдаем роль локера вместо других наказаний
            try {
                // Получаем роль локера
                const lockerRole = message.guild.roles.cache.get(config.lockerRoleId);
                if (!lockerRole) {
                    console.error('Роль локера не найдена!');
                    return false;
                }
                
                // Выдаем роль локера на 30 минут
                const duration = 30 * 60 * 1000; // 30 минут в миллисекундах
                const result = await addTempRole(
                    message.member, 
                    lockerRole, 
                    duration, 
                    `[AI Модерация] ${VIOLATION_TYPES[analysis.primary_violation_type]} в душевном канале`
                );
                
                if (result.success) {
                    // Отправляем предупреждение в канал
                    const warnEmbed = new EmbedBuilder()
                        .setTitle('🤖 AI Модерация - Душевный канал')
                        .setColor(0xFF0000)
                        .setDescription(`${message.author}, вы нарушили правила душевного канала и получили роль локера на 30 минут.`)
                        .addFields(
                            { name: 'Тип нарушения', value: VIOLATION_TYPES[analysis.primary_violation_type], inline: true },
                            { name: 'Серьезность', value: `${analysis.severity}/10`, inline: true }
                        )
                        .setFooter({ text: 'GROQ • AI Модерация' })
                        .setTimestamp();
                    
                    await message.channel.send({ embeds: [warnEmbed] });
                    
                    // Добавляем риск-очки
                    const points = VIOLATION_POINTS[analysis.primary_violation_type] || 5;
                    await addRiskPoints(message.author.id, message.guild.id, points, 
                        `[AI] ${VIOLATION_TYPES[analysis.primary_violation_type]} в душевном канале`);
                    
                    return true;
                }
            } catch (error) {
                console.error('Ошибка при выдаче роли локера:', error);
            }
        } else {
            // Стандартная модерация для других каналов
            if (analysis.severity >= 7) {
                // Сильное нарушение - удаляем сообщение и выдаем временный мут
                await message.delete();
                
                const muteDuration = analysis.severity >= 9 ? 24 * 60 * 60 * 1000 : 2 * 60 * 60 * 1000; // 24 часа или 2 часа
                const targetMember = message.member;
                await targetMember.timeout(muteDuration, `[AI Модерация] ${VIOLATION_TYPES[analysis.primary_violation_type]}`);
                
                // Отправляем предупреждение в канал
                const warnEmbed = new EmbedBuilder()
                    .setTitle('🤖 AI Модерация - Серьезное нарушение')
                    .setColor(0xFF0000)
                    .setDescription(`Сообщение пользователя ${message.author} было удалено, выдан таймаут.`)
                    .addFields(
                        { name: 'Тип нарушения', value: VIOLATION_TYPES[analysis.primary_violation_type], inline: true },
                        { name: 'Серьезность', value: `${analysis.severity}/10`, inline: true }
                    )
                    .setFooter({ text: 'GROQ • AI Модерация' })
                    .setTimestamp();
                
                await message.channel.send({ embeds: [warnEmbed] });
                
                // Добавляем риск-очки
                const points = VIOLATION_POINTS[analysis.primary_violation_type] || 5;
                await addRiskPoints(message.author.id, message.guild.id, points, 
                    `[AI] ${VIOLATION_TYPES[analysis.primary_violation_type]}`);
                
                return true;
            } else if (analysis.severity >= 4) {
                // Среднее нарушение - удаляем сообщение
                await message.delete();
                
                // Отправляем предупреждение в канал
                const warnEmbed = new EmbedBuilder()
                    .setTitle('🤖 AI Модерация - Нарушение')
                    .setColor(0xFFCC00)
                    .setDescription(`Сообщение пользователя ${message.author} было удалено.`)
                    .addFields(
                        { name: 'Тип нарушения', value: VIOLATION_TYPES[analysis.primary_violation_type], inline: true },
                        { name: 'Серьезность', value: `${analysis.severity}/10`, inline: true }
                    )
                    .setFooter({ text: 'GROQ • AI Модерация' })
                    .setTimestamp();
                
                await message.channel.send({ embeds: [warnEmbed] });
                
                // Добавляем риск-очки
                const points = Math.floor(VIOLATION_POINTS[analysis.primary_violation_type] / 2) || 3;
                await addRiskPoints(message.author.id, message.guild.id, points, 
                    `[AI] ${VIOLATION_TYPES[analysis.primary_violation_type]}`);
                
                return true;
            } else if (analysis.severity >= 2) {
                // Легкое нарушение - предупреждение без удаления
                const warnEmbed = new EmbedBuilder()
                    .setTitle('🤖 AI Модерация - Предупреждение (тебе пиздец)')
                    .setColor(0x3498DB)
                    .setDescription(`${message.author}, ваше сообщение может нарушать правила сервера.`)
                    .addFields(
                        { name: 'Тип потенциального нарушения', value: VIOLATION_TYPES[analysis.primary_violation_type], inline: true },
                        { name: 'Серьезность', value: `${analysis.severity}/10`, inline: true }
                    )
                    .setFooter({ text: 'GROQ • AI Модерация' })
                    .setTimestamp();
                
                await message.channel.send({ embeds: [warnEmbed] });
                
                // Добавляем риск-очки (минимальное количество)
                await addRiskPoints(message.author.id, message.guild.id, 1, 
                    `[AI] Предупреждение: ${VIOLATION_TYPES[analysis.primary_violation_type]}`);
                
                return true;
            }
        }
        
        return false;
        
    } catch (error) {
        console.error('Ошибка при ИИ модерации:', error);
        return false;
    }
}

/**
 * Тестирование сообщения через ИИ модерацию - для отладки
 * @param {string} content - Текст для анализа
 * @returns {Object} - Результат анализа
 */
async function testModeration(content) {
    if (config.groqApiKey) {
        return await analyzeWithGroq(content);
    } else {
        return await analyzeLocally(content);
    }
}

module.exports = {
    moderateMessage,
    testModeration,
    toggleModeration,
    isModerationEnabled
}; 