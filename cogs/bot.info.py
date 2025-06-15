import discord
from discord.ext import commands
import platform
import psutil
import time

@bot.command(name='ботинфо')
async def bot_info(ctx):
    # Расчет аптайма
    current_time = time.time()
    uptime = current_time - start_time  # Убедитесь, что start_time определен глобально
    days, remainder = divmod(int(uptime), 86400)
    hours, remainder = divmod(remainder, 3600)
    minutes, seconds = divmod(remainder, 60)

    # Создание embed
    embed = discord.Embed(
        title="🤖 Информация о боте",
        color=discord.Color.blue()
    )

    # Общая информация
    embed.add_field(
        name="📊 Статистика",
        value=f"**Серверов:** {len(bot.guilds)}\n"
              f"**Пользователей:** {len(set(bot.users))}\n"
              f"**Пинг:** {round(bot.latency * 1000)}мс",
        inline=False
    )

    # Системная информация
    embed.add_field(
        name="💻 Система",
        value=f"**ОС:** {platform.system()} {platform.release()}\n"
              f"**Python:** {platform.python_version()}\n"
              f"**discord.py:** {discord.__version__}",
        inline=False
    )

    # Аптайм
    embed.add_field(
        name="⏰ Аптайм",
        value=f"**{days}** д. **{hours}** ч. **{minutes}** мин. **{seconds}** сек.",
        inline=False
    )

    # Использование ресурсов
    embed.add_field(
        name="🖥️ Ресурсы",
        value=f"**CPU:** {psutil.cpu_percent()}%\n"
              f"**RAM:** {psutil.virtual_memory().percent}%",
        inline=False
    )

    # Футер
    embed.set_footer(
        text=f"ID Бота: {bot.user.id}",
        icon_url=bot.user.avatar.url
    )

    # Отправка embed
    await ctx.send(embed=embed)