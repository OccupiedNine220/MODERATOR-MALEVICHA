const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const config = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('погода')
        .setDescription('Показывает погоду в указанном городе')
        .addStringOption(option =>
            option.setName('город')
                .setDescription('Название города')
                .setRequired(true)),
    
    async execute(interaction) {
        await interaction.deferReply();
        
        const city = interaction.options.getString('город');
        
        try {
            const response = await axios.get(`https://api.openweathermap.org/data/2.5/weather`, {
                params: {
                    q: city,
                    appid: config.weatherApiKey,
                    units: 'metric',
                    lang: 'ru'
                }
            });
            
            const weatherData = response.data;
            const temperature = Math.round(weatherData.main.temp);
            const feelsLike = Math.round(weatherData.main.feels_like);
            const description = weatherData.weather[0].description;
            const icon = weatherData.weather[0].icon;
            const humidity = weatherData.main.humidity;
            const windSpeed = weatherData.wind.speed;
            const pressure = Math.round(weatherData.main.pressure * 0.75); // конвертация из гПа в мм рт.ст.
            
            const weatherEmbed = new EmbedBuilder()
                .setTitle(`🌡️ Погода: ${weatherData.name}, ${weatherData.sys.country}`)
                .setColor(0x3498DB)
                .setThumbnail(`http://openweathermap.org/img/wn/${icon}@2x.png`)
                .addFields(
                    { name: 'Температура', value: `${temperature}°C (ощущается как ${feelsLike}°C)`, inline: true },
                    { name: 'Состояние', value: description, inline: true },
                    { name: '\u200B', value: '\u200B', inline: true },
                    { name: 'Влажность', value: `${humidity}%`, inline: true },
                    { name: 'Скорость ветра', value: `${windSpeed} м/с`, inline: true },
                    { name: 'Давление', value: `${pressure} мм рт.ст.`, inline: true }
                )
                .setFooter({ text: 'Данные OpenWeatherMap' })
                .setTimestamp();
                
            await interaction.editReply({ embeds: [weatherEmbed] });
            
        } catch (error) {
            console.error('Ошибка при получении данных о погоде:', error);
            
            let errorMessage = 'Произошла ошибка при получении данных о погоде.';
            
            if (error.response && error.response.status === 404) {
                errorMessage = `Город "${city}" не найден. Проверьте правильность написания.`;
            } else if (error.response && error.response.status === 401) {
                errorMessage = 'Ошибка API ключа. Обратитесь к администратору бота.';
            }
            
            await interaction.editReply({ content: errorMessage, ephemeral: true });
        }
    }
}; 