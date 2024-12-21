import difflib
import discord
from discord.ext import commands
import json
from datetime import datetime, timedelta
import asyncio
from discord.ui import Modal, TextInput, Button, View
import discord.ui
from discord import app_commands
import psutil
import time
from datetime import datetime
from discord import SelectOption, Embed
from discord import ui 

# Загрузка правил из JSON файла
with open('rules.json', 'r', encoding='utf-8') as f:
    rules = json.load(f)

# Загрузка банвордов из JSON файла
with open('banwords.json', 'r', encoding='utf-8') as f:
    banwords = json.load(f)

intents = discord.Intents.default()
intents.members = True  # Включаем отслеживание участников
intents.message_content = True  # Включаем отслеживание сообщений
intents.guilds = True  # Включаем отслеживание серверов
intents.presences = True  # Включаем отслеживание присутствия участ

# Префикс для команд
bot = commands.Bot(command_prefix="!", intents=discord.Intents.all())

# Роль админа и модератора
ADMIN_ROLE_ID = 1284949456374202480
MOD_ROLE_ID = 1284949659864928419

# Проверка на наличие роли админа
def is_admin(ctx):
    return any(role.id == ADMIN_ROLE_ID for role in ctx.author.roles)

# Проверка на наличие роли модератора
def is_mod(ctx):
    return any(role.id == MOD_ROLE_ID for role in ctx.author.roles)

MUTE_DATA_FILE = 'mute_data.json'

def load_mute_data():
    try:
        with open(MUTE_DATA_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        return {}

# Функция для сохранения данных о муте
def save_mute_data(data):
    with open(MUTE_DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=4)

mute_data = load_mute_data()


# Проверка сообщений на банворды первой очереди
@bot.event
async def on_message(message):

    if message.author == bot.user:
        return

    await bot.process_commands(message)
    await check_invites_and_links(message)


class HelpView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=60)

        self.select = discord.ui.Select(
            placeholder="Выберите категорию",
            options=[
                SelectOption(
                    label="Модерация",
                    description="Команды модерации",
                    emoji="🛡️",
                    value="mod"
                ),
                SelectOption(
                    label="Тикеты",
                    description="Система тикетов",
                    emoji="🎫",
                    value="ticket"
                ),
                SelectOption(
                    label="Статистика",
                    description="Команды статистики",
                    emoji="📊",
                    value="stats"
                ),
                SelectOption(
                    label="Верификация",
                    description="Система верификации",
                    emoji="✅",
                    value="verify"
                ),
                SelectOption(
                    label="Документы",
                    description="Система документов",
                    emoji="📋",
                    value="docs"
                ),
                SelectOption(
                    label="Автомодерация",
                    description="Система автомодерации",
                    emoji="🤖",
                    value="automod"
                ),
                SelectOption(
                    label="Утилиты",
                    description="Полезные команды",
                    emoji="🔧",
                    value="utils"
                ),
                SelectOption(
                    label="Развлечения",
                    description="Игровые и развлекательные команды",
                    emoji="🎲",
                    value="fun"
                ),
                SelectOption(
                    label="Экономика",
                    description="Команды для работы с валютами",
                    emoji="💰",
                    value="economy"
                ),
                SelectOption(
                    label="Кланы",
                    description="Система кланов",
                    emoji="🏰",
                    value="clans"
                )
            ]
        )
        self.select.callback = self.select_callback
        self.add_item(self.select)

    async def select_callback(self, interaction: discord.Interaction):
        category = self.select.values[0]

        help_categories = {
            "mod": {
                "title": "🛡️ Модерация",
                "description": """
                Команды для управления сервером:
                🔇 `!мут <@user> <время> <причина>` - Замутить пользователя
                🔊 `!размут <@user>` - Размутить пользователя
                🔨 `!бан <@user> <причина>` - Забанить пользователя
                👢 `!кик <@user> <причина>` - Кикнуть пользователя
                🧹 `!очистить <количество>` - Удалить сообщения
                ⚠️ `!варн <@user> <rule>` - Выдать предупреждение
                🔰 `!мод <@user> <rule>` - Наказание по правилу
                """
            },
            "ticket": {
                "title": "🎫 Система тикетов",
                "description": """
                Управление тикетами:
                📩 `!тикет создать` - Создать новый тикет
                🔒 `!тикет закрыть` - Закрыть текущий тикет
                📋 `!тикеты список` - Список активных тикетов
                """
            },
            "stats": {
                "title": "📊 Статистика",
                "description": """
                Команды для просмотра статистики:
                📈 `!статистика [@user]` - Статистика модератора
                🤖 `!стат` - Статистика бота
                📋 `!рейтинг` - Рейтинг активности
                """
            },
            "utils": {
                "title": "🔧 Утилиты",
                "description": """
                Полезные команды:
                🌦️ `!погода <город>` - Прогноз погоды
                💱 `!курсы_валют` - Курсы валют
                💰 `!convert <сумма> <валюта1> <валюта2>` - Конвертация валют
                """
            },
            "clans": {
                "title": "🏰 Кланы",
                "description": """
                Система кланов:
                🆕 `!клан создать` - Создать клан
                📋 `!клан список` - Список кланов
                ℹ️ `!клан инфо` - Информация о клане
                ⚔️ `!клан битва` - Битва кланов
                """
            }
        }

        category_info = help_categories.get(category, {
            "title": "❓ Неизвестная категория",
            "description": "Извините, информация недоступна."
        })

        embed = discord.Embed(
            title=category_info["title"],
            description=category_info["description"],
            color=discord.Color.blue()
        )

        await interaction.response.edit_message(embed=embed)

@bot.command(name="помощь")
async def help_command(ctx):
    """Интерактивное меню помощи"""
    embed = discord.Embed(
        title="📚 Система помощи",
        description="Выберите категорию в меню ниже для получения подробной информации",
        color=discord.Color.blue()
    )
    
    view = HelpView()
    await ctx.send(embed=embed, view=view)

# Команда мут
@bot.command(name="мут")
async def mute(ctx, *args):
    # Проверка прав
    if not is_mod(ctx):
        await ctx.message.add_reaction("🚫")
        embed = discord.Embed(
            title="Ошибка доступа",
            description="У вас недостаточно прав для выполнения этой команды.",
            color=discord.Color.red()
        )
        await ctx.send(embed=embed)
        return

    # Проверка количества аргументов
    if len(args) < 3:
        await ctx.message.add_reaction("❓")
        embed = discord.Embed(
            title="Справка по команде мут",
            description="**Использование:** `!мут @пользователь <время> <причина>`\n\n"
                        "**Примеры:**\n"
                        "`!мут @User 30м Спам в чате`\n"
                        "`!мут @User 2ч Оскорбления`\n"
                        "`!мут @User 1д Систематическое нарушение правил`\n\n"
                        "**Форматы времени:**\n"
                        "• `м` - минуты\n"
                        "• `ч` - часы\n"
                        "• `д` - дни\n\n"
                        "**Ограничения:**\n"
                        "• Максимальный мут: 28 дней\n"
                        "• Минимальный мут: 1 минута",
            color=discord.Color.blue()
        )
        await ctx.send(embed=embed)
        return

    # Поиск упоминания пользователя
    member = None
    for mention in ctx.message.mentions:
        member = mention
        break

    if member is None:
        await ctx.message.add_reaction("❌")
        embed = discord.Embed(
            title="Ошибка",
            description="Пользователь не найден. Используйте корректное упоминание (@Имя).",
            color=discord.Color.red()
        )
        await ctx.send(embed=embed)
        return

    # Проверка на самомут или мут бота
    if member == ctx.author:
        await ctx.message.add_reaction("❌")
        embed = discord.Embed(
            title="Ошибка",
            description="Вы не можете замутить себя!",
            color=discord.Color.red()
        )
        await ctx.send(embed=embed)
        return

    if member.bot:
        await ctx.message.add_reaction("❌")
        embed = discord.Embed(
            title="Ошибка",
            description="Нельзя замутить бота!",
            color=discord.Color.red()
        )
        await ctx.send(embed=embed)
        return

    # Парсинг времени
    time_str = args[1].lower()
    try:
        if time_str.endswith('м'):
            duration = int(time_str[:-1])
            timeout_duration = timedelta(minutes=duration)
        elif time_str.endswith('ч'):
            duration = int(time_str[:-1])
            timeout_duration = timedelta(hours=duration)
        elif time_str.endswith('д'):
            duration = int(time_str[:-1])
            timeout_duration = timedelta(days=duration)
        else:
            raise ValueError("Неверный формат времени")

        # Проверка диапазона времени
        if duration < 1:
            await ctx.message.add_reaction("❌")
            embed = discord.Embed(
                title="Ошибка",
                description="Время мута должно быть больше 1 минуты.",
                color=discord.Color.red()
            )
            await ctx.send(embed=embed)
            return

        if timeout_duration > timedelta(days=28):
            await ctx.message.add_reaction("❌")
            embed = discord.Embed(
                title="Ошибка",
                description="Максимальная длительность мута - 28 дней.",
                color=discord.Color.red()
            )
            await ctx.send(embed=embed)
            return

    except ValueError:
        await ctx.message.add_reaction("❌")
        embed = discord.Embed(
            title="Ошибка",
            description="Неверный формат времени. Используйте:\n"
                        "• `30м` для минут\n"
                        "• `2ч` для часов\n"
                        "• `1д` для дней",
            color=discord.Color.red()
        )
        await ctx.send(embed=embed)
        return

    # Собираем причину
    reason = " ".join(args[2:])

    # Проверка длины причины
    if len(reason) > 500:
        await ctx.message.add_reaction("❌")
        embed = discord.Embed(
            title="Ошибка",
            description="Причина слишком длинная. Максимум 500 символов.",
            color=discord.Color.red()
        )
        await ctx.send(embed=embed)
        return

    try:
        # Таймаут
        await member.timeout(timeout_duration, reason=reason)
        await ctx.message.add_reaction("✅")

        # Эмбед
        embed = discord.Embed(
            title="Мут участника",
            description=f"{member.mention} был лишен возможности общаться.",
            color=discord.Color.orange()
        )
        embed.add_field(name="Причина", value=reason, inline=False)
        embed.add_field(name="Длительность", value=f"{time_str}", inline=False)
        embed.set_thumbnail(url=member.display_avatar.url)
        embed.set_footer(text=f"Выдал: {ctx.author.name}", icon_url=ctx.author.display_avatar.url)

        await ctx.send(embed=embed)

    except discord.Forbidden:
        await ctx.message.add_reaction("❌")
        embed = discord.Embed(
            title="Ошибка",
            description="Не удалось выдать тайм-аут. Возможно, у бота недостаточно прав или роль участника выше.",
            color=discord.Color.red()
        )
        await ctx.send(embed=embed)
    except Exception as e:
        await ctx.message.add_reaction("❌")
        embed = discord.Embed(
            title="Неизвестная ошибка",
            description=f"Произошла ошибка: {str(e)}",
            color=discord.Color.red()
        )
        await ctx.send(embed=embed)

# Проверяем муты при запуске
@bot.event
async def on_ready():
    current_time = datetime.now()
    to_unmute = []

    for member_id, end_time_str in mute_data.items():
        end_time = datetime.fromisoformat(end_time_str)
        if current_time >= end_time:
            guild = bot.guilds[0]  # Предположим, что бот находится на одном сервере
            member = guild.get_member(int(member_id))
            mute_role = discord.utils.get(guild.roles, name="психопатыч")
            if member and mute_role in member.roles:
                await member.remove_roles(mute_role)
                to_unmute.append(member_id)

    # Удаляем из JSON всех, кого размутил
    for member_id in to_unmute:
        mute_data.pop(member_id, None)
    save_mute_data(mute_data)

# Команда бан
@bot.command(name="бан")
async def ban(ctx, *args):
    # Проверка прав
    if not is_admin(ctx):
        await ctx.message.add_reaction("🚫")
        embed = discord.Embed(
            title="Ошибка доступа",
            description="У вас недостаточно прав для выполнения этой команды.",
            color=discord.Color.red()
        )
        await ctx.send(embed=embed)
        return

    # Проверка количества аргументов
    if len(args) < 2:
        await ctx.message.add_reaction("❓")
        embed = discord.Embed(
            title="Справка по команде бан",
            description="**Использование:** `!бан @пользователь <причина>`\n\n"
                        "**Пример:**\n"
                        "`!бан @User Серьезное нарушение правил`\n\n"
                        "**Требования:**\n"
                        "• Обязательно упоминание пользователя\n"
                        "• Указание причины бана",
            color=discord.Color.blue()
        )
        await ctx.send(embed=embed)
        return

    # Поиск упоминания пользователя
    member = None
    for mention in ctx.message.mentions:
        member = mention
        break

    if member is None:
        await ctx.message.add_reaction("🤷")
        embed = discord.Embed(
            title="Ошибка",
            description="Пользователь не найден. Используйте корректное упоминание (@Имя).",
            color=discord.Color.red()
        )
        await ctx.send(embed=embed)
        return

    # Проверка на самобан или бан бота
    if member == ctx.author:
        await ctx.message.add_reaction("🙅")
        embed = discord.Embed(
            title="Ошибка",
            description="Вы не можете забанить себя!",
            color=discord.Color.red()
        )
        await ctx.send(embed=embed)
        return

    if member.bot:
        await ctx.message.add_reaction("🤖")
        embed = discord.Embed(
            title="Ошибка",
            description="Нельзя забанить бота!",
            color=discord.Color.red()
        )
        await ctx.send(embed=embed)
        return

    # Собираем причину
    reason = " ".join(args[1:])

    # Проверка длины причины
    if len(reason) > 500:
        await ctx.message.add_reaction("📝")
        embed = discord.Embed(
            title="Ошибка",
            description="Причина слишком длинная. Максимум 500 символов.",
            color=discord.Color.red()
        )
        await ctx.send(embed=embed)
        return

    try:
        # Бан пользователя
        await member.ban(reason=reason)
        await ctx.message.add_reaction("✅")

        # Эмбед
        embed = discord.Embed(
            title="Бан участника",
            description=f"{member.mention} был забанен.",
            color=discord.Color.red()
        )
        embed.add_field(name="Причина", value=reason, inline=False)
        embed.set_thumbnail(url=member.display_avatar.url)
        embed.set_footer(text=f"Забанил: {ctx.author.name}", icon_url=ctx.author.display_avatar.url)

        await ctx.send(embed=embed)

        # Опциональное логирование
        log_channel = ctx.guild.get_channel(LOG_CHANNEL_ID)  # Замените на ID вашего канала логов
        if log_channel:
            log_embed = discord.Embed(
                title="Бан участника",
                description=f"Пользователь {member.mention} был забанен.",
                color=discord.Color.red()
            )
            log_embed.add_field(name="Модератор", value=ctx.author.mention, inline=False)
            log_embed.add_field(name="Причина", value=reason, inline=False)
            await log_channel.send(embed=log_embed)

    except discord.Forbidden:
        await ctx.message.add_reaction("🚫")
        embed = discord.Embed(
            title="Ошибка",
            description="Не удалось забанить пользователя. Возможно, у бота недостаточно прав.",
            color=discord.Color.red()
        )
        await ctx.send(embed=embed)
    except Exception as e:
        await ctx.message.add_reaction("🆘")
        embed = discord.Embed(
            title="Непредвиденная ошибка",
            description=f"Произошла ошибка: {str(e)}",
            color=discord.Color.red()
        )
        await ctx.send(embed=embed)

# Команда кик
# Команда кик
@bot.command(name="кик")
async def kick(ctx, *args):
    # Проверка прав
    if not is_admin(ctx):
        await ctx.message.add_reaction("🚫")
        embed = discord.Embed(
            title="Ошибка доступа",
            description="У вас недостаточно прав для выполнения этой команды.",
            color=discord.Color.red()
        )
        await ctx.send(embed=embed)
        return

    # Проверка количества аргументов
    if len(args) < 2:
        await ctx.message.add_reaction("❓")
        embed = discord.Embed(
            title="Справка по команде кик",
            description="**Использование:** `!кик @пользователь <причина>`\n\n"
                        "**Пример:**\n"
                        "`!кик @User  Серьезное нарушение правил`\n\n"
                        "**Требования:**\n"
                        "• Обязательно упоминание пользователя\n"
                        "• Указание причины кика",
            color=discord.Color.blue()
        )
        await ctx.send(embed=embed)
        return

    # Поиск упоминания пользователя
    member = None
    for mention in ctx.message.mentions:
        member = mention
        break

    if member is None:
        await ctx.message.add_reaction("🤷")
        embed = discord.Embed(
            title="Ошибка",
            description="Пользователь не найден. Используйте корректное упоминание (@Имя).",
            color=discord.Color.red()
        )
        await ctx.send(embed=embed)
        return

    # Проверка на самокик или кик бота
    if member == ctx.author:
        await ctx.message.add_reaction("🙅")
        embed = discord.Embed(
            title="Ошибка",
            description="Вы не можете кикнуть себя!",
            color=discord.Color.red()
        )
        await ctx.send(embed=embed)
        return

    if member.bot:
        await ctx.message.add_reaction("🤖")
        embed = discord.Embed(
            title="Ошибка",
            description="Нельзя кикнуть бота!",
            color=discord.Color.red()
        )
        await ctx.send(embed=embed)
        return

    # Собираем причину
    reason = " ".join(args[1:])

    # Проверка длины причины
    if len(reason) > 500:
        await ctx.message.add_reaction("📝")
        embed = discord.Embed(
            title="Ошибка",
            description="Причина слишком длинная. Максимум 500 символов.",
            color=discord.Color.red()
        )
        await ctx.send(embed=embed)
        return

    try:
        # Кик пользователя
        await member.kick(reason=reason)
        await ctx.message.add_reaction("✅")

        # Эмбед
        embed = discord.Embed(
            title="Кик участника",
            description=f"{member.mention} был кикнут.",
            color=discord.Color.red()
        )
        embed.add_field(name="Причина", value=reason, inline=False)
        embed.set_thumbnail(url=member.display_avatar.url)
        embed.set_footer(text=f"Кикнул: {ctx.author.name}", icon_url=ctx.author.display_avatar.url)

        await ctx.send(embed=embed)

        # Опциональное логирование
        log_channel = ctx.guild.get_channel(LOG_CHANNEL_ID)  # Замените на ID вашего канала логов
        if log_channel:
            log_embed = discord.Embed(
                title="Кик участника",
                description=f"Пользователь {member.mention} был кикнут.",
                color=discord.Color.red()
            )
            log_embed.add_field(name="Модератор", value=ctx.author.mention, inline=False)
            log_embed.add_field(name="Причина", value=reason, inline=False)
            await log_channel.send(embed=log_embed)

    except discord.Forbidden:
        await ctx.message.add_reaction("🚫")
        embed = discord.Embed(
            title="Ошибка",
            description="Не удалось кикнуть пользователя. Возможно, у бота недостаточно прав.",
            color=discord.Color.red()
        )
        await ctx.send(embed=embed)
    except Exception as e:
        await ctx.message.add_reaction("🆘")
        embed = discord.Embed(
            title="Непредвиденная ошибка",
            description=f"Произошла ошибка: {str(e)}",
            color=discord.Color.red()
            )
        await ctx.send(embed=embed)

# Команда размут
@bot.command(name="размут")
async def unmute(ctx, *args):
    # Проверка прав
    if not is_mod(ctx):
        await ctx.message.add_reaction("❌")
        embed = discord.Embed(
            title="Ошибка доступа",
            description="У вас недостаточно прав для выполнения этой команды.",
            color=discord.Color.red()
        )
        await ctx.send(embed=embed)
        return

    # Проверка количества аргументов
    if len(args) < 1:
        embed = discord.Embed(
            title="Справка по команде размут",
            description="**Использование:** `!размут @пользователь`\n\n"
                        "**Примеры:**\n"
                        "`!размут @User`\n\n"
                        "**Форматы:**\n"
                        "• Обязательно упоминание пользователя\n"
                        "• Пользователь должен быть в муте",
            color=discord.Color.blue()
        )
        await ctx.send(embed=embed)
        return

    # Поиск упоминания пользователя
    member = None
    for mention in ctx.message.mentions:
        member = mention
        break

    if member is None:
        await ctx.message.add_reaction("❌")
        embed = discord.Embed(
            title="Ошибка",
            description="Пользователь не найден. Используйте корректное упоминание (@Имя).",
            color=discord.Color.red()
        )
        await ctx.send(embed=embed)
        return

    # Проверка, есть ли у пользователя тайм-аут
    if member.timed_out is False:
        await ctx.message.add_reaction("❌")
        embed = discord.Embed(
            title="Информация",
            description=f"{member.mention} не находится в муте.",
            color=discord.Color.orange()
        )
        await ctx.send(embed=embed)
        return

    try:
        # Снятие тайм-аута
        await member.edit(timeout=None)
        await ctx.message.add_reaction("✅")

        # Эмбед
        embed = discord.Embed(
            title="Размут участника",
            description=f"{member.mention} был возвращен к общению.",
            color=discord.Color.green()
        )
        embed.set_thumbnail(url=member.display_avatar.url)
        embed.set_footer(text=f"Размутил: {ctx.author.name}", icon_url=ctx.author.display_avatar.url)

        await ctx.send(embed=embed)

    except discord.Forbidden:
        await ctx.message.add_reaction("❌")
        embed = discord.Embed(
            title="Ошибка",
            description="Не удалось снять мут. Возможно, у бота недостаточно прав.",
            color=discord.Color.red()
        )
        await ctx.send(embed=embed)
    except Exception as e:
        await ctx.message.add_reaction("❌")
        embed = discord.Embed(
            title="Непредвиденная ошибка",
            description=f"Произошла ошибка: {str(e)}",
            color=discord.Color.red()
        )
        await ctx.send(embed=embed)

        # Эмбед
        embed = discord.Embed(
            title="Размут участника",
            description=f"{member.mention} был возвращен к общению.",
            color=discord.Color.green()
        )
        embed.set_thumbnail(url=member.display_avatar.url)
        embed.set_footer(text=f"Размутил: {ctx.author.name}", icon_url=ctx.author.display_avatar.url)

        await ctx.send(embed=embed)

    except discord.Forbidden:
        await ctx.message.add_reaction("❌")
        embed = discord.Embed(
            title="Ошибка",
            description="Не удалось снять мут. Возможно, у бота недостаточно прав.",
            color=discord.Color.red()
        )
        await ctx.send(embed=embed)
    except Exception as e:
        await ctx.message.add_reaction("❌")
        embed = discord.Embed(
            title="Непредвиденная ошибка",
            description=f"Произошла ошибка: {str(e)}",
            color=discord.Color.red()
        )
        await ctx.send(embed=embed)

@bot.command(name="разбан")
async def unban(ctx, user: discord.User):
    if not is_mod(ctx):
        await ctx.message.add_reaction("❌")
        await ctx.send("У вас нет прав для выполнения этой команды.")
        return

    # Получение списка забаненных пользователей
    banned_users = await ctx.guild.bans()

    # Поиск пользователя среди забаненных
    for ban_entry in banned_users:
        if ban_entry.user == user:
            await ctx.guild.unban(user)
            await ctx.send(f"{user.mention} был разбанен.")
            await ctx.message.add_reaction("✅")
            return

    # Если пользователь не найден в списке забаненных
    await ctx.send("Пользователь не найден в списке забаненных.")
    await ctx.message.add_reaction("❌")

# Команда очистить
@bot.command(name="очистить")
async def clear(ctx, amount: int):
    if not is_admin(ctx):
        await ctx.message.add_reaction("❌")
        await ctx.send("У вас нет прав для выполнения этой команды.")
        return

    await ctx.channel.purge(limit=amount + 1)
    await ctx.send(f"Удалено {amount} сообщений.", delete_after=5)
    await ctx.message.add_reaction("✅")

# ID канала для логов
LOG_CHANNEL_ID = 1285152306064658535  # Замените на реальный ID канала

# Логирование действий
async def log_action(guild, message):
    log_channel = guild.get_channel(LOG_CHANNEL_ID)
    if log_channel:
        await log_channel.send(message)

# Логирование захода/выхода из голосового канала и перемещения между каналами
@bot.event
async def on_voice_state_update(member, before, after):
    guild = member.guild
    if before.channel is None and after.channel is not None:
        await log_action(guild, f"{member.name} зашел в голосовой канал {after.channel.name} в {datetime.now()}.")
    elif before.channel is not None and after.channel is None:
        await log_action(guild, f"{member.name} вышел из голосового канала {before.channel.name} в {datetime.now()}.")
    elif before.channel != after.channel and after.channel is not None:
        await log_action(guild, f"{member.name} перешел в другой голосовой канал: {after.channel.name} в {datetime.now()}.")

# Логирование бана
@bot.event
async def on_member_ban(guild, user):
    await log_action(guild, f"{user.name} был забанен в {datetime.now()}.")

# Логирование разбана
@bot.event
async def on_member_unban(guild, user):
    await log_action(guild, f"{user.name} был разбанен в {datetime.now()}.")

# Логирование выхода участника с сервера
@bot.event
async def on_member_remove(member):
    await log_action(member.guild, f"{member.name} покинул сервер в {datetime.now()}.")

# Логирование присоединения нового участника
@bot.event
async def on_member_join(member):
    await log_action(member.guild, f"Новый участник {member.name} присоединился к серверу в {datetime.now()}.")

# Логирование изменения ролей участника
@bot.event
async def on_member_update(before, after):
    if before.roles != after.roles:
        added_roles = [role for role in after.roles if role not in before.roles]
        removed_roles = [role for role in before.roles if role not in after.roles]
        role_changes = []

        # Проверяем роли, чтобы исключить @everyone
        for role in added_roles:
            if role.name != "@everyone":
                role_changes.append(f"Добавлена роль: {role.name}")

        for role in removed_roles:
            if role.name != "@everyone":
                role_changes.append(f"Удалена роль: {role.name}")

        if role_changes:
            await log_action(after.guild, f"Роли участника {after.name} изменены: " + ", ".join(role_changes))

# Логирование изменения ника пользователя
@bot.event
async def on_user_update(before, after):
    if before.name != after.name:
        await log_action(before.guild, f"Ник пользователя был изменен с {before.name} на {after.name} в {datetime.now()}.")

# Логирование редактирования сообщений с указанием старого и нового содержания и ссылкой на сообщение
@bot.event
async def on_message_edit(before, after):
    if before.content != after.content:
        # Формирование ссылки на сообщение
        message_url = f"https://discord.com/channels/{before.guild.id}/{before.channel.id}/{before.id}"

        log_message = (f"Сообщение от {before.author.name} было отредактировано в {datetime.now()}.\n"
                       f"**Старое сообщение:** {before.content}\n"
                       f"**Новое сообщение:** {after.content}\n"
                       f"Ссылка на сообщение: {message_url}")

        await log_action(before.guild, log_message)

# Логирование удаления сообщений
@bot.event
async def on_message_delete(message):
    log_message = (f"Сообщение от {message.author.name} было удалено в {datetime.now()}.\n"
                   f"**Удаленное сообщение:** {message.content}")

    await log_action(message.guild, log_message)

    for word in banwords['tier1']:
        if word in message.content.lower():
            await message.delete()
            mute_role = discord.utils.get(message.guild.roles, name="Muted")
            await message.author.add_roles(mute_role)
            await message.channel.send(f"Сообщение от {message.author.mention} было удалено за использование запрещенного слова '{word}'. Пользователь замучен на 2 часа.")
            await message.add_reaction("✅")
            # Автоматическое размутирование через 2 часа
            await discord.utils.sleep_until(datetime.now() + timedelta(hours=2))
            await message.author.remove_roles(mute_role)
            return
    
    await bot.process_commands(message)

@bot.command(name="инфо")
async def userinfo(ctx, member: discord.Member = None):
    member = member or ctx.author
    
    embed = discord.Embed(title="Информация о пользователе", color=member.color)
    embed.set_thumbnail(url=member.avatar.url)
    embed.add_field(name="Имя", value=member.name, inline=True)
    embed.add_field(name="ID", value=member.id, inline=True)
    embed.add_field(name="Статус", value=str(member.status), inline=True)
    embed.add_field(name="Присоединился", value=member.joined_at.strftime("%d.%m.%Y"), inline=True)
    embed.add_field(name="Аккаунт создан", value=member.created_at.strftime("%d.%m.%Y"), inline=True)
    embed.add_field(name="Роли", value=" ".join([role.mention for role in member.roles[1:]]), inline=False)
    
    await ctx.send(embed=embed)

@bot.command(name="роль")
async def temprole(ctx, member: discord.Member, role: discord.Role, duration: int):
    if not is_admin(ctx):
        await ctx.send("У вас нет прав для выполнения этой команды.")
        return
    
    await member.add_roles(role)
    await ctx.send(f"{member.mention} получил роль {role.name} на {duration} минут.")
    
    await asyncio.sleep(duration * 60)
    await member.remove_roles(role)
    await ctx.send(f"У {member.mention} была удалена временная роль {role.name}.")

import json

# Файл для хранения предупреждений
WARNINGS_FILE = 'warnings.json'

# Загрузка предупреждений из JSON файла
def load_warnings():
    try:
        with open(WARNINGS_FILE, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        return {}

# Сохранение предупреждений в JSON файл
def save_warnings(warnings):
    with open(WARNINGS_FILE, 'w') as f:
        json.dump(warnings, f, indent=4)

warnings = load_warnings()

@bot.command(name="варн")
async def warn(ctx, member: discord.Member, rule_id: str):
    if not is_mod(ctx):
        await ctx.send("У вас нет прав для выполнения этой команды.")
        return
    
    # Получаем правило и проверяем, существует ли оно
    rule = rules['rules'].get(rule_id)
    if rule is None:
        await ctx.send(f"Правило с идентификатором '{rule_id}' не найдено.")
        return

    member_id = str(member.id)
    if member_id not in warnings:
        warnings[member_id] = []
    
    warnings[member_id].append({
        'rule_id': rule_id,
        'reason': rule['description'],
        'moderator': ctx.author.id,
        'timestamp': datetime.now().isoformat()
    })
    
    warn_count = len(warnings[member_id])
    
    await ctx.send(f"{member.mention} получил предупреждение ({warn_count}). Причина: {rule['description']}")
    
    # Действия в зависимости от количества предупреждений
    if warn_count == 3:
        mute_role = discord.utils.get(ctx.guild.roles, name="психопатыч")
        await member.add_roles(mute_role)
        await ctx.send(f"{member.mention} получил мут за 3 предупреждения на 1 час.")
        await asyncio.sleep(3600)  # 1 час
        await member.remove_roles(mute_role)
    elif warn_count == 5:
        await member.kick(reason="5 предупреждений")
        await ctx.send(f"{member.mention} был кикнут за 5 предупреждений.")
    elif warn_count >= 7:
        await member.ban(reason="7 или более предупреждений")
        await ctx.send(f"{member.mention} был забанен за 7 или более предупреждений.")
        warnings[member_id] = []  # Очищаем предупреждения после бана
    
    save_warnings(warnings)

@bot.command(name="снять_варн")
async def remove_warn(ctx, member: discord.Member):
    if not is_admin(ctx):
        await ctx.send("У вас нет прав для выполнения этой команды.")
        return
    
    member_id = str(member.id)
    if member_id in warnings and warnings[member_id]:
        warnings[member_id].pop()
        save_warnings(warnings)
        await ctx.send(f"Последнее предупреждение для {member.mention} было снято.")
    else:
        await ctx.send(f"У {member.mention} нет предупреждений.")

@bot.command(name="варны")
async def list_warns(ctx, member: discord.Member):
    member_id = str(member.id)
    if member_id in warnings and warnings[member_id]:
        embed = discord.Embed(title=f"Предупреждения {member.name}", color=discord.Color.orange())
        for i, warn in enumerate(warnings[member_id], 1):
            moderator = ctx.guild.get_member(warn['moderator'])
            mod_name = moderator.name if moderator else "Неизвестный модератор"
            embed.add_field(name=f"Предупреждение {i}", 
                            value=f"Причина: {warn['reason']}\nМодератор: {mod_name}\nДата: {warn['timestamp']}", 
                            inline=False)
        await ctx.send(embed=embed)
    else:
        await ctx.send(f"У {member.mention} нет предупреждений.")

@bot.command(name="очистить_варны")
async def clear_warns(ctx, member: discord.Member):
    if not is_admin(ctx):
        await ctx.send("У вас нет прав для выполнения этой команды.")
        return
    
    member_id = str(member.id)
    if member_id in warnings:
        warnings[member_id] = []
        save_warnings(warnings)
        await ctx.send(f"Все предупреждения для {member.mention} были очищены.")
    else:
        await ctx.send(f"У {member.mention} нет предупреждений.")

# Анти-спам система
@bot.event
async def on_message(message):
    if message.author.bot:
        return

    # Проверка на спам
    user_id = str(message.author.id)
    current_time = datetime.now()
    
    if user_id not in spam_counter:
        spam_counter[user_id] = {'messages': [], 'warnings': 0}
    
    # Добавляем время сообщения
    spam_counter[user_id]['messages'].append(current_time)
    
    # Удаляем старые сообщения (старше 5 секунд)
    spam_counter[user_id]['messages'] = [msg_time for msg_time in spam_counter[user_id]['messages'] 
                                       if (current_time - msg_time).seconds < 5]
    
    # Если больше 5 сообщений за 5 секунд
    if len(spam_counter[user_id]['messages']) > 5:
        spam_counter[user_id]['warnings'] += 1
        await message.channel.purge(limit=5, check=lambda m: m.author == message.author)
        
        if spam_counter[user_id]['warnings'] >= 3:
            # Мут на 1 час
            mute_role = discord.utils.get(message.guild.roles, name="психопатыч")
            await message.author.add_roles(mute_role)
            await message.channel.send(f"{message.author.mention} получил мут на 1 час за спам.")
            await asyncio.sleep(3600)
            await message.author.remove_roles(mute_role)
        else:
            await message.channel.send(f"{message.author.mention}, прекратите спамить! Предупреждение {spam_counter[user_id]['warnings']}/3")

    await bot.process_commands(message)

# Система тикетов
# Система тикетов
class TicketView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(label="Создать тикет", style=discord.ButtonStyle.green, custom_id="create_ticket")
    async def create_ticket(self, interaction: discord.Interaction, button: discord.ui.Button):
        # Проверяем, есть ли у пользователя уже открытый тикет
        existing_ticket = discord.utils.get(interaction.guild.channels, 
                                          name=f"ticket-{interaction.user.name.lower()}")
        if existing_ticket:
            await interaction.response.send_message(
                "У вас уже есть открытый тикет!", ephemeral=True)
            return

        # Создаем категорию для тикетов, если её нет
        category = discord.utils.get(interaction.guild.categories, name="Тикеты")
        if not category:
            category = await interaction.guild.create_category("Тикеты")

        # Настройка прав доступа
        overwrites = {
            interaction.guild.default_role: discord.PermissionOverwrite(read_messages=False),
            interaction.user: discord.PermissionOverwrite(read_messages=True, send_messages=True),
            interaction.guild.me: discord.PermissionOverwrite(read_messages=True, send_messages=True)
        }

        # Добавляем права для роли модератора
        mod_role = discord.utils.get(interaction.guild.roles, name="одмен")
        if mod_role:
            overwrites[mod_role] = discord.PermissionOverwrite(read_messages=True, send_messages=True)

        # Создаем канал тикета
        channel = await interaction.guild.create_text_channel(
            f"ticket-{interaction.user.name.lower()}",
            category=category,
            overwrites=overwrites
        )

        # Создаем эмбед для тикета
        embed = discord.Embed(
            title="Тикет создан",
            description=f"Тикет создан пользователем {interaction.user.mention}",
            color=discord.Color.green()
        )
        embed.add_field(name="Статус", value="🟢 Открыт", inline=False)
        
        # Создаем view с кнопками управления тикетом
        class TicketActionsView(discord.ui.View):
            def __init__(self):
                super().__init__(timeout=None)

            @discord.ui.button(label="Закрыть тикет", style=discord.ButtonStyle.red, custom_id="close_ticket")
            async def close_ticket(self, button_interaction: discord.Interaction, button: discord.ui.Button):
                if button_interaction.user == interaction.user or any(role.name == "одмен" for role in button_interaction.user.roles):
                    await button_interaction.response.send_message("Тикет будет закрыт через 5 секунд...")
                    await asyncio.sleep(5)
                    await channel.delete()
                else:
                    await button_interaction.response.send_message(
                        "Только создатель тикета или модератор может закрыть тикет!", 
                        ephemeral=True
                    )

        await channel.send(embed=embed, view=TicketActionsView())
        await interaction.response.send_message(
            f"Ваш тикет создан: {channel.mention}", ephemeral=True)

@bot.event
async def on_ready():
    print("Бот запущен!")
    # Находим канал для создания тикетов
    channel = bot.get_channel(1301124585483403264)  # Замените на ID вашего канала
    if channel:
        # Проверяем, нет ли уже сообщения с кнопкой создания тикета
        async for message in channel.history(limit=100):
            if message.author == bot.user and message.embeds:
                return

        # Если сообщения нет, создаем новое
        embed = discord.Embed(
            title="Система тикетов",
            description="Нажмите на кнопку ниже, чтобы создать тикет",
            color=discord.Color.blue()
        )
        await channel.send(embed=embed, view=TicketView())

    # Регистрируем view для обработки кнопок
    bot.add_view(TicketView())

# Удаляем команду setup_tickets, так как теперь сообщение создается автоматически при запуске бота
# Система статистики и отчетов
class ModStats:
    def __init__(self):
        self.stats = {}
        
    def add_action(self, mod_id, action_type):
        if mod_id not in self.stats:
            self.stats[mod_id] = {'mutes': 0, 'bans': 0, 'kicks': 0, 'warns': 0}
        self.stats[mod_id][action_type] += 1
        
    def get_mod_stats(self, mod_id):
        return self.stats.get(mod_id, {'mutes': 0, 'bans': 0, 'kicks': 0, 'warns': 0})

mod_stats = ModStats()

@bot.command(name="статистика")
async def show_stats(ctx, member: discord.Member = None):
    if not is_mod(ctx):
        await ctx.send("У вас нет прав для просмотра статистики.")
        return
        
    member = member or ctx.author
    stats = mod_stats.get_mod_stats(member.id)
    
    embed = discord.Embed(title=f"Статистика модератора {member.name}", color=discord.Color.blue())
    embed.add_field(name="Муты", value=stats['mutes'])
    embed.add_field(name="Баны", value=stats['bans'])
    embed.add_field(name="Кики", value=stats['kicks'])
    embed.add_field(name="Предупреждения", value=stats['warns'])
    
    await ctx.send(embed=embed)

spam_counter = {}

# Система верификации
from captcha.image import ImageCaptcha
import random
import string
import io

# Автомодерация изображений
@bot.event
async def on_message(message):
    if message.attachments:
        for attachment in message.attachments:
            # Проверяем расширение файла
            if any(attachment.filename.lower().endswith(ext) for ext in ['.jpg', '.png', '.gif']):
                # Здесь можно добавить проверку изображения через API для определения неприемлемого контента
                pass


BOT_VERSION = "REALESE 1.7.0"

start_time = time.time()

# Глобальные счетчики
deleted_messages = 0
bans = 0
mutes = 0
edited_messages = 0

# Остальной код остается без изменений

@bot.command(name="стат")
async def stats(ctx):
    global deleted_messages, bans, mutes, edited_messages, start_time, BOT_VERSION
    current_time = time.time()
    uptime = timedelta(seconds=int(current_time - start_time))
    cpu_usage = psutil.cpu_percent()
    ram_usage = round(psutil.virtual_memory().percent)

    # Создание эмбеда
    embed = discord.Embed(title="📊 Статистика бота", color=discord.Color.blue())
    embed.add_field(name="Удаленные сообщения", value=deleted_messages, inline=False)
    embed.add_field(name="Баны", value=bans, inline=False)
    embed.add_field(name="Муты", value=mutes, inline=False)
    embed.add_field(name="Отредактированные сообщения", value=edited_messages, inline=False)
    embed.add_field(name="Нагрузка на ЦП", value=f"{cpu_usage}%", inline=False)
    embed.add_field(name="Нагрузка на ОЗУ", value=f"{ram_usage}%", inline=False)
    embed.add_field(name="Время с запуска", value=str(uptime), inline=False)
    embed.add_field(name="Версия бота", value=BOT_VERSION, inline=False)

    # Отправка эмбеда
    await ctx.send(embed=embed)

class DocModal(discord.ui.Modal):
    def __init__(self):
        super().__init__(title="Подача документа о наказании")
        
        self.violator = TextInput(
            label="Нарушитель",
            placeholder="Укажите ник нарушителя или ID",
            required=True
        )
        
        self.rule = TextInput(
            label="Пункт правил",
            placeholder="Укажите номер пункта правил",
            required=True
        )

        self.add_item(self.violator)
        self.add_item(self.rule)

    async def on_submit(self, interaction: discord.Interaction):
        embed = discord.Embed(
            title="Документ о наказании",
            color=discord.Color.red(),
            timestamp=datetime.now()  # Исправленное использование datetime
        )
        
        embed.add_field(name="Модератор", value=interaction.user.mention, inline=False)
        embed.add_field(name="Нарушитель", value=self.violator.value, inline=False)
        embed.add_field(name="Пункт правил", value=self.rule.value, inline=False)

        await interaction.response.send_message("Теперь отправьте доказательства (изображение/файл)", ephemeral=True)
        
        def check(m):
            return m.author == interaction.user and m.channel == interaction.channel and m.attachments

        try:
            evidence_msg = await interaction.client.wait_for('message', timeout=60.0, check=check)
            embed.set_image(url=evidence_msg.attachments[0].url)
            await evidence_msg.delete()
            await interaction.channel.send(embed=embed)
        except asyncio.TimeoutError:
            await interaction.followup.send("Время ожидания истекло.", ephemeral=True)

class DocView(View):
    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(label="Подать документ", style=discord.ButtonStyle.green, custom_id="submit_doc")
    async def submit_doc(self, interaction: discord.Interaction, button: Button):
        if not any(role.name == "одмен" for role in interaction.user.roles):
            await interaction.response.send_message("У вас нет прав для подачи документов", ephemeral=True)
            return
        
        await interaction.response.send_modal(DocModal())

@bot.event
async def on_ready():
    channel = bot.get_channel(1285152506061525042)  # ID канала для документов
    if channel:
        # Удалим очистку канала
        # await channel.purge()  # Эта строка удалена

        embed = discord.Embed(
            title="Система подачи документов",
            description="Нажмите на кнопку ниже, чтобы подать документ о наказании",
            color=discord.Color.blue()
        )
        await channel.send(embed=embed, view=DocView())

    bot.add_view(DocView())

BANNED_WORDS = ["запрещенное_слово1", "запрещенное_слово2"]  # Добавьте свои слова

# Хранение информации о новых участниках
new_member_data = {}

@bot.event
async def on_member_join(member):
    # Добавление временной роли для новых участников
    temp_role = discord.utils.get(member.guild.roles, name="Временный участник")
    if temp_role:
        await member.add_roles(temp_role)

@bot.event
async def on_message(message):
    if message.author.bot:
        return

    # Проверяем, является ли автор новым участником с временной ролью
    if "Временный участник" in [role.name for role in message.author.roles]:
        # Проверка на запрещенные слова
        if any(word in message.content.lower() for word in BANNED_WORDS):
            await message.delete()
            mute_role = discord.utils.get(message.guild.roles, name="Muted")  # Роль для мута
            await message.author.add_roles(mute_role)
            await message.channel.send(f"{message.author.mention}, ваше сообщение было удалено за использование запрещенного слова. Вы замучены на 1 час.")
            await asyncio.sleep(3600)  # Мут на 1 час
            await message.author.remove_roles(mute_role)
            return

        # Отслеживание количества сообщений
        if message.author.id not in new_member_data:
            new_member_data[message.author.id] = {'messages': [], 'warnings': 0}

        new_member_data[message.author.id]['messages'].append(datetime.now())

        # Удаляем старые сообщения (старше 10 секунд)
        new_member_data[message.author.id]['messages'] = [msg_time for msg_time in new_member_data[message.author.id]['messages']
                                                          if (datetime.now() - msg_time).total_seconds() < 10]

        # Если больше 5 сообщений за 10 секунд
        if len(new_member_data[message.author.id]['messages']) > 5:
            new_member_data[message.author.id]['warnings'] += 1
            await message.delete()
            await message.channel.send(f"{message.author.mention}, вы отправили слишком много сообщений за короткий промежуток времени. Вы замучены на 1 час.")
            mute_role = discord.utils.get(message.guild.roles, name="Muted")  # Роль для мута
            await message.author.add_roles(mute_role)
            await asyncio.sleep(3600)  # Мут на 1 час
            await message.author.remove_roles(mute_role)

    await bot.process_commands(message)

import os
@bot.command()
async def poll(ctx, question, *options):
    if len(options) > 10:
        await ctx.send("Максимальное количество вариантов - 10")
        return
    
    embed = discord.Embed(title="Голосование", description=question)
    reactions = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟']
    
    for i, option in enumerate(options):
        embed.add_field(name=f"Вариант {i+1}", value=option, inline=False)
    
    poll_msg = await ctx.send(embed=embed)
    for i in range(len(options)):
        await poll_msg.add_reaction(reactions[i])

def save_backup(data, filename):
    backup_dir = "backups"
    if not os.path.exists(backup_dir):
        os.makedirs(backup_dir)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_file = f"{backup_dir}/{filename}_{timestamp}.json"
    
    with open(backup_file, 'w') as f:
        json.dump(data, f, indent=4)
    
    print(f"Backup saved to {backup_file}")

@bot.command()
@commands.has_permissions(administrator=True)
async def backup(ctx):
    # Пример сохранения данных
    server_data = {
        "server_id": ctx.guild.id,
        "server_name": ctx.guild.name,
        "member_count": ctx.guild.member_count,
        "channels": [channel.name for channel in ctx.guild.channels],
        "roles": [role.name for role in ctx.guild.roles]
    }
    
    save_backup(server_data, "server_backup")
    await ctx.send("Бэкап сервера создан успешно!")

CHANNEL_ID = 1301579000992366652  # ID канала, где должна работать команда


class ModelSubmissionModal(ui.Modal, title='Отправка 3D модели'):
    model_name = ui.TextInput(label='Название модели', placeholder='Введите название модели')
    
    def __init__(self):
        super().__init__()

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.send_message(f"Модель '{self.model_name.value}' получена! Пожалуйста, отправьте файлы в следующем сообщении.", ephemeral=True)
        
        def check(m):
            return m.author.id == interaction.user.id and m.channel.id == interaction.channel.id and m.attachments
        
        try:
            message = await bot.wait_for('message', timeout=300.0, check=check)
        except asyncio.TimeoutError:
            await interaction.followup.send("Время ожидания файлов истекло.", ephemeral=True)
        else:
            attachments = message.attachments
            valid_files = [att for att in attachments if att.filename.endswith(('.png', '.jpg', '.jpeg', '.blend', '.glb'))]
            
            if len(valid_files) < 4:
                await interaction.followup.send("Пожалуйста, убедитесь, что вы отправили 2 скриншота, .blend и .glb файлы.", ephemeral=True)
            else:
                await interaction.followup.send("Спасибо! Ваша модель и файлы успешно получены.", ephemeral=True)
                # Здесь можно добавить код для сохранения файлов или отправки их куда-либо

class SubmitModelView(ui.View):
    def __init__(self):
        super().__init__()
        self.add_item(ui.Button(label="Отправить 3D модель", style=discord.ButtonStyle.primary, custom_id="submit_model"))

    async def interaction_check(self, interaction: discord.Interaction) -> bool:
        if interaction.data["custom_id"] == "submit_model":
            await interaction.response.send_modal(ModelSubmissionModal())
        return True

@bot.tree.command(name="3d_happiness", description="Отправить 3D модель")
async def three_d_happiness(interaction: discord.Interaction):
    if interaction.channel_id != CHANNEL_ID:
        await interaction.response.send_message("Эта команда может быть использована только в специальном канале.", ephemeral=True)
        return

    view = SubmitModelView()
    await interaction.response.send_message("Нажмите кнопку ниже, чтобы отправить 3D модель:", view=view)

@bot.command(name="мод")
@commands.has_permissions(kick_members=True)
async def mod_action(ctx, member: discord.Member, rule_id: str):
    if not is_mod(ctx):
        await ctx.send("У вас нет прав для выполнения этой команды.")
        return

    # Получаем правило из существующего файла правил
    rule = rules['rules'].get(rule_id)
    if rule is None:
        await ctx.send(f"Правило с идентификатором '{rule_id}' не найдено.")
        return

    # Создаем эмбед
    embed = discord.Embed(title="Модерационное действие", color=discord.Color.red())
    embed.add_field(name="Модератор", value=ctx.author.mention, inline=False)
    embed.add_field(name="Нарушитель", value=member.mention, inline=False)
    embed.add_field(name="Наказание", value=rule['punishment']['type'], inline=True)
    embed.add_field(name="Правило", value=f"{rule_id}: {rule['description']}", inline=True)
    embed.timestamp = datetime.now()

    await ctx.send(embed=embed)
    await ctx.message.add_reaction("✅")

@bot.command(name="рейтинг")
async def rating(ctx):
    # Создаем словарь для хранения количества сообщений пользователей
    user_messages = {}
    async for message in ctx.channel.history(limit=1000):
        if not message.author.bot:
            user_id = message.author.id
            user_messages[user_id] = user_messages.get(user_id, 0) + 1
    
    # Сортируем пользователей по количеству сообщений
    sorted_users = sorted(user_messages.items(), key=lambda x: x[1], reverse=True)
    
    embed = discord.Embed(title="Рейтинг активности", color=discord.Color.gold())
    for i, (user_id, messages) in enumerate(sorted_users[:10], 1):
        user = ctx.guild.get_member(user_id)
        if user:
            embed.add_field(name=f"#{i} {user.name}", value=f"Сообщений: {messages}", inline=False)
    
    await ctx.send(embed=embed)

@bot.command(name="опрос")
async def poll(ctx, question, *options):
    if len(options) > 10:
        await ctx.send("Максимальное количество вариантов - 10")
        return

    reactions = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟']
    description = []
    for i, option in enumerate(options):
        description.append(f"{reactions[i]} {option}")

    embed = discord.Embed(title=question, description="\n".join(description))
    poll_msg = await ctx.send(embed=embed)

    for i in range(len(options)):
        await poll_msg.add_reaction(reactions[i])

@bot.command(name="напомни")
async def remind(ctx, time: int, *, message):
    await ctx.send(f"Хорошо, я напомню вам через {time} минут: {message}")
    await asyncio.sleep(time * 60)
    await ctx.author.send(f"Напоминание: {message}")

import re

import re

# Добавьте список запрещенных слов и ссылок
BANNED_RICKROLL_LINKS = [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",  # Ссылка на рикролл
    "http://www.youtube.com/watch?v=dQw4w9WgXcQ",  # Ссылка на рикролл
    "rickroll",  # Ключевое слово
]

@bot.event
async def on_message(message):
    if message.author.bot:
        return

    # Проверка на рикролл
    if any(link in message.content.lower() for link in BANNED_RICKROLL_LINKS):
        await message.delete()  # Удаляем сообщение
        mute_role = discord.utils.get(message.guild.roles, name="Muted")  # Роль для мута
        await message.author.add_roles(mute_role)  # Замучиваем пользователя
        await message.channel.send(f"{message.author.mention}, ваше сообщение было удалено за использование рикролла. Вы замучены на 1 час.")
        await asyncio.sleep(3600)  # Мут на 1 час
        await message.author.remove_roles(mute_role)  # Снимаем мут
        return

    await bot.process_commands(message)  # Обрабатываем другие команды


@bot.command(name="рандом")
async def random_number(ctx, min: int = 1, max: int = 100):
    """Генерирует случайное число в заданном диапазоне."""
    if min > max:
        await ctx.send("Минимальное значение не может быть больше максимального.")
        return

    number = random.randint(min, max)
    await ctx.send(f"Случайное число между {min} и {max}: {number}")


@bot.command(name="добавить_банворд")
@commands.has_permissions(manage_messages=True)
async def add_banword(ctx, *, word: str):
    if word in banwords['tier1'] or word in banwords['tier2']:
        await ctx.send("Это слово уже в списке запрещенных.")
        return

    banwords['tier1'].append(word)  # Или 'tier2' в зависимости от вашей логики
    with open('banwords.json', 'w', encoding='utf-8') as f:
        json.dump(banwords, f, ensure_ascii=False, indent=4)

    await ctx.send(f"Слово '{word}' добавлено в список запрещенных.")

@bot.event
async def on_message(message):
    if message.author == bot.user:
        return

    # Проверка на банворды первой очереди
    for word in banwords['tier1']:
        if word in message.content.lower():
            await message.delete()
            mute_role = discord.utils.get(message.guild.roles, name="Muted")
            await message.author.add_roles(mute_role)
            await message.channel.send(f"Сообщение от {message.author.mention} было удалено за использование запрещенного слова '{word}'. Пользователь замучен на 2 часа.")
            await asyncio.sleep(7200)  # Мут на 2 часа
            await message.author.remove_roles(mute_role)
            return

    # Проверка на банворды второй очереди
    for word in banwords['tier2']:
        if word in message.content.lower():
            await message.delete()
            await message.channel.send(f"Сообщение от {message.author.mention} было удалено за использование запрещенного слова '{word}'.")
            return

    await bot.process_commands(message)

@bot.event
async def on_message(message):
    if message.author == bot.user:
        return

    # Приводим сообщение к нижнему регистру для проверки
    message_content = message.content.lower()

    # Проверка на банворды первой очереди
    for word in banwords['tier1']:
        if word in message_content:
            await message.delete()  # Удаляем сообщение
            mute_role = discord.utils.get(message.guild.roles, name="Muted")  # Роль для мута
            if mute_role:
                await message.author.add_roles(mute_role)  # Замучиваем пользователя
                await message.channel.send(f"{message.author.mention}, ваше сообщение было удалено за использование запрещенного слова '{word}'. Вы замучены на 2 часа.")
                await asyncio.sleep(7200)  # Мут на 2 часа
                await message.author.remove_roles(mute_role)  # Снимаем мут
            return  # Выходим из функции после удаления сообщения

    # Обработка других команд
    await bot.process_commands(message)

BOT_BUILD = "000 21.12.2024"

@bot.command(name='ботинфо')
async def bot_info(ctx):
    current_time = time.time()
    uptime = current_time - start_time
    days, remainder = divmod(int(uptime), 86400)
    hours, remainder = divmod(remainder, 3600)
    minutes, seconds = divmod(remainder, 60)

    embed = discord.Embed(
        title="🤖 Информация о боте",
        color=discord.Color.blue()
    )

    embed.add_field(
        name="📊 Статистика",
        value=f"**Серверов:** {len(bot.guilds)}\n"
              f"**Пользователей:** {len(set(bot.users))}\n"
              f"**Пинг:** {round(bot.latency * 1000)}мс\n"
              f"Версия бота: {BOT_VERSION}\n"
              f"Сборка бота: {BOT_BUILD}",
        inline=False
    )

    embed.add_field(
        name="💻 Система",
        value=f"**ОС:** {platform.system()} {platform.release()}\n"
              f"**Python:** {platform.python_version()}\n"
              f"**discord.py:** {discord.__version__}",
        inline=False
    )

    embed.add_field(
        name="⏰ Аптайм",
        value=f"**{days}** д. **{hours}** ч. **{minutes}** мин. **{seconds}** сек.",
        inline=False
    )

    embed.add_field(
        name="🖥️ Ресурсы",
        value=f"**CPU:** {psutil.cpu_percent()}%\n"
              f"**RAM:** {psutil.virtual_memory().percent}%",
        inline=False
    )

    embed.set_footer(
        text=f"ID Бота: {bot.user.id}",
        icon_url=bot.user.avatar.url
    )

    await ctx.send(embed=embed)

import platform

import discord
from discord.ext import commands
import json
import asyncio
import random

# Файл для хранения информации о кланах
CLANS_FILE = 'clans.json'


def load_clans():
    try:
        with open(CLANS_FILE, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        return {}


def save_clans(clans):
    with open(CLANS_FILE, 'w') as f:
        json.dump(clans, f, indent=4)


class ClansSystem:
    def __init__(self, bot):
        self.bot = bot
        self.clans = load_clans()


class ClansView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(label="Создать клан", style=discord.ButtonStyle.green, custom_id="create_clan")
    async def create_clan(self, interaction: discord.Interaction, button: discord.ui.Button):
        # Модальное окно для создания клана
        class CreateClanModal(discord.ui.Modal, title="Создание клана"):
            clan_name = discord.ui.TextInput(
                label="Название клана",
                placeholder="Введите уникальное название",
                max_length=30
            )
            clan_description = discord.ui.TextInput(
                label="Описание клана",
                placeholder="Расскажите о вашем клане",
                style=discord.TextStyle.paragraph,
                max_length=200
            )
            clan_emoji = discord.ui.TextInput(
                label="Эмоджи клана",
                placeholder="Выберите эмоджи для клана",
                max_length=2
            )

            async def on_submit(self, interaction: discord.Interaction):
                clans = load_clans()

                # Проверки
                if self.clan_name.value in clans:
                    await interaction.response.send_message(
                        "Клан с таким названием уже существует!",
                        ephemeral=True
                    )
                    return

                # Создаем категорию для клана
                guild = interaction.guild
                clan_category = discord.utils.get(guild.categories, name="🏰 Кланы")
                if not clan_category:
                    clan_category = await guild.create_category("🏰 Кланы")

                # Создаем канал клана
                clan_channel = await guild.create_text_channel(
                    f"{self.clan_name.value.lower()}-clan",
                    category=clan_category
                )

                # Сохраняем информацию о клане
                clans[self.clan_name.value] = {
                    "owner": interaction.user.id,
                    "description": self.clan_description.value,
                    "emoji": self.clan_emoji.value,
                    "members": [interaction.user.id],
                    "level": 1,
                    "exp": 0,
                    "power": 100,
                    "channel_id": clan_channel.id
                }
                save_clans(clans)

                # Создаем embed о клане
                embed = discord.Embed(
                    title=f"{self.clan_emoji.value} Клан {self.clan_name.value}",
                    description=self.clan_description.value,
                    color=discord.Color.gold()
                )
                embed.add_field(name="Основатель", value=interaction.user.mention, inline=True)
                embed.add_field(name="Уровень", value="1", inline=True)
                embed.add_field(name="Сила клана", value="100", inline=True)

                await clan_channel.send(embed=embed)

                await interaction.response.send_message(
                    f"Клан {self.clan_name.value} успешно создан!",
                    ephemeral=True
                )

        await interaction.response.send_modal(CreateClanModal())

    @discord.ui.button(label="Список кланов", style=discord.ButtonStyle.blurple, custom_id="list_clans")
    async def list_clans(self, interaction: discord.Interaction, button: discord.ui.Button):
        clans = load_clans()
        if not clans:
            await interaction.response.send_message("Пока нет созданных кланов.", ephemeral=True)
            return

        embeds = []
        for name, data in clans.items():
            embed = discord.Embed(
                title=f"{data.get('emoji', '🏰')} {name}",
                description=data.get('description', 'Без описания'),
                color=discord.Color.blue()
            )
            embed.add_field(name="Уровень", value=data.get('level', 1), inline=True)
            embed.add_field(name="Сила", value=data.get('power', 100), inline=True)
            embed.add_field(name="Участников", value=len(data.get('members', [])), inline=True)
            embeds.append(embed)

        await interaction.response.send_message(embeds=embeds, ephemeral=True)

    @discord.ui.button(label="Битва кланов", style=discord.ButtonStyle.red, custom_id="clan_battle")
    async def clan_battle(self, interaction: discord.Interaction, button: discord.ui.Button):
        clans = load_clans()
        if len(clans) < 2:
            await interaction.response.send_message("Недостаточно кланов для битвы.", ephemeral=True)
            return

        # Выбираем два случайных клана
        clan_names = list(clans.keys())
        clan1, clan2 = random.sample(clan_names, 2)

        # Расчет результата битвы
        power1 = clans[clan1]['power']
        power2 = clans[clan2]['power']

        winner = clan1 if power1 > power2 else clan2
        loser = clan2 if winner == clan1 else clan1

        # Создаем embed битвы
        embed = discord.Embed(
            title="🏆 Битва кланов",
            description=f"**{clan1}** сразился с **{clan2}**!",
            color=discord.Color.red()
        )
        embed.add_field(name=f"🥇 Победитель: {winner}", value=f"Сила: {clans[winner]['power']}", inline=False)
        embed.add_field(name=f"🥈 Проигравший: {loser}", value=f"Сила: {clans[loser]['power']}", inline=False)

        # Обновляем статистику
        clans[winner]['exp'] += 50
        clans[loser]['exp'] -= 20
        clans[winner]['power'] += 10
        clans[loser]['power'] -= 10

        # Повышение уровня
        if clans[winner]['exp'] >= 100:
            clans[winner]['level'] += 1
            clans[winner]['exp'] = 0

        save_clans(clans)

        await interaction.response.send_message(embed=embed)


@bot.command(name="клан")
async def clan_command(ctx, action: str = None, *args):
    """Основная команда управления кланом"""

    # Загружаем актуальные данные о кланах
    clans = load_clans()

    # Проверяем, в каком клане состоит пользователь
    user_clan = None
    for clan_name, clan_data in clans.items():
        if ctx.author.id in clan_data.get('members', []):
            user_clan = clan_name
            break

    # Если действие не указано - показываем справку
    if not action:
        embed = discord.Embed(
            title="🏰 Система кланов",
            description=(
                "**Доступные команды:**\n"
                "• `!клан создать` - Создать новый клан\n"
                "• `!клан список` - Список всех кланов\n"
                "• `!клан инфо` - Информация о вашем клане\n"
                "• `!клан пригласить @user` - Пригласить участника\n"
                "• `!клан покинуть` - Покинуть клан\n"
                "• `!клан битва` - Начать битву кланов"
            ),
            color=discord.Color.blue()
        )
        await ctx.send(embed=embed)
        return

    # Обработка различных действий
    if action.lower() == 'создать':
        # Проверяем, не состоит ли уже в клане
        if user_clan:
            await ctx.send(f"Вы уже состоите в клане {user_clan}!")
            return

        # Запускаем процесс создания клана
        await create_clan_process(ctx)

    elif action.lower() == 'список':
        # Показываем список кланов
        async def show_clan_list(ctx):
            """Показывает список всех кланов"""
            clans = load_clans()

            if not clans:
                await ctx.send("Пока нет созданных кланов.")
                return

            # Создаем embed для списка кланов
            embed = discord.Embed(
                title="📋 Список кланов",
                color=discord.Color.blue()
            )

            for name, data in clans.items():
                embed.add_field(
                    name=f"{data.get('emoji', '🏰')} {name}",
                    value=(
                        f"**Участников:** {len(data.get('members', []))}\n"
                        f"**Уровень:** {data.get('level', 1)}\n"
                        f"**Сила:** {data.get('power', 100)}"
                    ),
                    inline=False
                )

            await ctx.send(embed=embed)

    elif action.lower() == 'инфо':
        # Показываем информацию о клане пользователя
        if not user_clan:
            await ctx.send("Вы не состоите ни в одном клане.")
            return

        await show_clan_info(ctx, user_clan)

    elif action.lower() == 'пригласить':
        # Проверяем, есть ли клан у пользователя
        if not user_clan:
            await ctx.send("Вы должны быть участником клана, чтобы приглашать.")
            return

        # Проверяем, упомянут ли пользователь
        if not ctx.message.mentions:
            await ctx.send("Укажите пользователя, которого хотите пригласить.")
            return

        await invite_to_clan(ctx, user_clan, ctx.message.mentions[0])

    elif action.lower() == 'покинуть':
        # Проверяем, есть ли клан у пользователя
        if not user_clan:
            await ctx.send("Вы не состоите ни в одном клане.")
            return

        await leave_clan(ctx, user_clan)

    elif action.lower() == 'битва':
        # Проверяем, есть ли клан у пользователя
        if not user_clan:
            await ctx.send("Вы должны быть участником клана для битвы.")
            return

        await clan_battle(ctx, user_clan)


async def create_clan_process(ctx):
    """Процесс создания клана"""

    # Здесь будет модальное окно для создания клана
    def check(m):
        return m.author == ctx.author and m.channel == ctx.channel

    await ctx.send("Введите название клана:")
    clan_name = await bot.wait_for('message', check=check)

    await ctx.send("Введите описание клана:")
    clan_description = await bot.wait_for('message', check=check)

    await ctx.send("Выберите эмоджи для клана:")
    clan_emoji = await bot.wait_for('message', check=check)

    # Здесь будет логика сохранения клана
    clans = load_clans()

    # Проверка уникальности названия
    if clan_name.content in clans:
        await ctx.send("Клан с таким названием уже существует!")
        return

    # Создаем категорию для кланов
    clan_category = discord.utils.get(ctx.guild.categories, name="🏰 Кланы")
    if not clan_category:
        clan_category = await ctx.guild.create_category("🏰 Кланы")

    # Создаем канал клана
    clan_channel = await ctx.guild.create_text_channel(
        f"{clan_name.content.lower()}-clan",
        category=clan_category
    )

    # Сохраняем информацию о клане
    clans[clan_name.content] = {
        "owner": ctx.author.id,
        "description": clan_description.content,
        "emoji": clan_emoji.content or "🏰",
        "members": [ctx.author.id],
        "level": 1,
        "exp": 0,
        "power": 100,
        "channel_id": clan_channel.id
    }

    save_clans(clans)

    # Создаем embed о клане
    embed = discord.Embed(
        title=f"{clans[clan_name.content]['emoji']} Клан {clan_name.content}",
        description=clan_description.content,
        color=discord.Color.gold()
    )
    embed.add_field(name="Основатель", value=ctx.author.mention, inline=True)
    embed.add_field(name="Уровень", value="1", inline=True)
    embed.add_field(name="Сила клана", value="100", inline=True)

    await clan_channel.send(embed=embed)
    await ctx.send(f"Клан {clan_name.content} успешно создан!")

    if not clans:
        await ctx.send("Пока нет созданных кланов.")
        return

    # Создаем embed для списка кланов
    embed = discord.Embed(
        title="📋 Список кланов",
        color=discord.Color.blue()
    )

    for name, data in clans.items():
        embed.add_field(
            name=f"{data.get('emoji', '🏰')} {name}",
            value=(
                f"**Участников:** {len(data.get('members', []))}\n"
                f"**Уровень:** {data.get('level', 1)}\n"
                f"**Сила:** {data.get('power', 100)}"
            ),
            inline=False
        )

    await ctx.send(embed=embed)


async def show_clan_info(ctx, clan_name):
    """Показывает подробную информацию о клане"""
    clans = load_clans()
    clan_data = clans.get(clan_name)

    if not clan_data:
        await ctx.send("Клан не найден.")
        return

    # Получаем участников клана
    members_mentions = []
    for member_id in clan_data.get('members', []):
        member = ctx.guild.get_member(member_id)
        if member:
            members_mentions.append(member.mention)

    embed = discord.Embed(
        title=f"{clan_data.get('emoji', '🏰')} {clan_name}",
        description=clan_data.get('description', 'Без описания'),
        color=discord.Color.gold()
    )
    embed.add_field(name="Основатель", value=f"<@{clan_data['owner']}>", inline=True)
    embed.add_field(name="Уровень", value=clan_data.get('level', 1), inline=True)
    embed.add_field(name="Сила клана", value=clan_data.get('power', 100), inline=True)
    embed.add_field(name="Опыт", value=f"{clan_data.get('exp', 0)}/100", inline=True)
    embed.add_field(name="Участники", value="\n".join(members_mentions), inline=False)

    await ctx.send(embed=embed)


async def invite_to_clan(ctx, clan_name, member):
    """Приглашение участника в клан"""
    clans = load_clans()
    clan_data = clans.get(clan_name)

    # Проверки
    if member.id in clan_data.get('members', []):
        await ctx.send(f"{member.mention} уже состоит в этом клане.")
        return

    # Проверка прав (только владелец или с особыми правами)
    if ctx.author.id != clan_data['owner']:
        await ctx.send("Приглашать в клан может только его основатель.")
        return

    # Отправляем приглашение
    invite_embed = discord.Embed(
        title="Приглашение в клан",
        description=f"Вы приглашены в клан **{clan_name}**",
        color=discord.Color.green()
    )

    # Создаем кнопки для ответа
    class InviteView(discord.ui.View):
        def __init__(self, clan_name, inviter, invited):
            super().__init__()
            self.clan_name = clan_name
            self.inviter = inviter
            self.invited = invited

        @discord.ui.button(label="Принять", style=discord.ButtonStyle.green)
        async def accept(self, interaction: discord.Interaction, button: discord.ui.Button):
            clans = load_clans()
            clan_data = clans.get(self.clan_name)

            clan_data['members'].append(self.invited.id)
            save_clans(clans)

            await interaction.response.send_message(f"Вы присоединились к клану **{self.clan_name}**!")

            # Оповещаем в канале клана
            clan_channel = interaction.guild.get_channel(clan_data['channel_id'])
            await clan_channel.send(f"{self.invited.mention} присоединился к клану!")

        @discord.ui.button(label="Отклонить", style=discord.ButtonStyle.red)
        async def decline(self, interaction: discord.Interaction, button: discord.ui.Button):
            await interaction.response.send_message("Приглашение отклонено.")

    await member.send(embed=invite_embed, view=InviteView(clan_name, ctx.author, member))
    await ctx.send(f"Приглашение отправлено {member.mention}")


async def leave_clan(ctx, clan_name):
    """Покинуть клан"""
    clans = load_clans()
    clan_data = clans.get(clan_name)

    # Удаляем участника
    clan_data['members'].remove(ctx.author.id)

    # Если участников не осталось - удаляем клан
    if not clan_data['members']:
        del clans[clan_name]
        await ctx.send(f"Клан {clan_name} распущен из-за отсутствия участников.")
    else:
        # Если покинул владелец - назначаем нового
        if ctx.author.id == clan_data['owner']:
            clan_data['owner'] = clan_data['members'][0]
            await ctx.send(f"Новый владелец клана: <@{clan_data['owner']}>")

    save_clans(clans)
    await ctx.send(f"Вы покинули клан {clan_name}")


async def clan_battle(ctx, clan_name):
    """Битва кланов"""
    clans = load_clans()

    # Выбираем случайный клан для битвы
    enemy_clan = random.choice(list(clans.keys()))

    while enemy_clan == clan_name:
        enemy_clan = random.choice(list(clans.keys()))

    # Расчет результатов битвы
    clan_power = clans[clan_name]['power']
    enemy_power = clans[enemy_clan]['power']

    # Определяем победителя
    winner = clan_name if clan_power > enemy_power else enemy_clan
    loser = enemy_clan if winner == clan_name else clan_name

    # Обновляем статистику
    clans[winner]['exp'] += 50
    clans[loser]['exp'] -= 20
    clans[winner]['power'] += 10
    clans[loser]['power'] -= 10

    # Повышение уровня
    if clans[winner]['exp'] >= 100:
        clans[winner]['level'] += 1
        clans[winner]['exp'] = 0

    save_clans(clans)

    # Создаем embed битвы
    embed = discord.Embed(
        title="⚔️ Битва кланов",
        description=f"**{clan_name}** сразился с **{enemy_clan}**!",
        color=discord.Color.red()
    )
    embed.add_field(name="Победитель", value=winner, inline=False)
    embed.add_field(name="Проигравший", value=loser, inline=False)
    embed.add_field(name="Изменение опыта", value=f"{winner}: +50\n{loser}: -20", inline=True)
    embed.add_field(name="Изменение силы", value=f"{winner}: +10\n{loser}: -10", inline=True)

    # Отправляем результаты битвы
    await ctx.send(embed=embed)

    # Оповещаем в каналах кланов
    winner_channel_id = clans[winner]['channel_id']
    loser_channel_id = clans[loser]['channel_id']

    winner_channel = ctx.guild.get_channel(winner_channel_id)
    loser_channel = ctx.guild.get_channel(loser_channel_id)

    if winner_channel:
        await winner_channel.send(f"🏆 Клан одержал победу в битве против клана {loser}!")

    if loser_channel:
        await loser_channel.send(f"😔 Клан потерпел поражение в битве против клана {winner}.")


import requests
import discord
from discord.ext import commands

WEATHER_API_KEY = "c7f9c89e8c344e219b6133731240911"

@bot.command(name="погода")
async def weather(ctx, *, city):
    """Команда для получения погоды"""
    base_url = "http://api.weatherapi.com/v1/current.json"

    params = {
        'key': WEATHER_API_KEY,
        'q': city,
        'lang': 'ru'
    }

    try:
        response = requests.get(base_url, params=params)
        data = response.json()

        # Извлечение данных
        location = data['location']
        current = data['current']

        # Выбор иконки в зависимости от погоды
        weather_condition = current['condition']['text'].lower()
        weather_icons = {
            'солнечно': '☀️',
            'облачно': '☁️',
            'дождь': '🌧️',
            'снег': '❄️',
            'гроза': '🌩️',
            'морось': '🌦️'
        }

        # Подбор иконки
        icon = next((icon for condition, icon in weather_icons.items() if condition in weather_condition), '🌈')

        # Создание красивого embed
        embed = discord.Embed(
            title=f"{icon} Погода в {location['name']}, {location['country']}",
            color=discord.Color.blue()
        )

        # Добавление полей
        embed.add_field(
            name="🌡️ Температура",
            value=f"{current['temp_c']}°C (ощущается как {current['feelslike_c']}°C)",
            inline=False
        )

        embed.add_field(
            name="☁️ Состояние",
            value=current['condition']['text'],
            inline=False
        )

        embed.add_field(
            name="💧 Влажность",
            value=f"{current['humidity']}%",
            inline=True
        )

        embed.add_field(
            name="💨 Ветер",
            value=f"{current['wind_kph']} км/ч, {current['wind_dir']}",
            inline=True
        )

        # Добавляем изображение погоды
        embed.set_thumbnail(url=f"https:{current['condition']['icon']}")

        await ctx.send(embed=embed)

    except requests.RequestException:
        await ctx.send("Ошибка подключения к сервису погоды.")
    except KeyError as e:
        await ctx.send(f"Не удалось обработать данные о погоде. Ошибка: {e}")
    except Exception as e:
        await ctx.send(f"Произошла неизвестная ошибка: {e}")

EXCHANGERATE_API_KEY = '882aea59171eeea2eff38ac4'

import datetime


@bot.command(name="курсы_валют")
async def currency(ctx, base_currency='USD'):
    """Команда для получения курсов валют"""
    base_currency = base_currency.upper()

    try:
        # URL API для получения курсов
        url = f'https://v6.exchangerate-api.com/v6/{EXCHANGERATE_API_KEY}/latest/{base_currency}'

        response = requests.get(url)
        data = response.json()

        # Проверка успешности запроса
        if data['result'] == 'success':
            # Выбираем несколько популярных валют
            interesting_currencies = {
                'RUB': 'Российский рубль',
                'EUR': 'Евро',
                'USD': 'Доллар США',
                'GBP': 'Британский фунт',
                'CNY': 'Китайский юань',
                'JPY': 'Японская иена'
            }

            # Создаем embed
            embed = discord.Embed(
                title=f"💱 Курсы валют для {base_currency}",
                description=f"Актуальный курс на {datetime.datetime.now().strftime('%d.%m.%Y %H:%M')}",
                color=discord.Color.green()
            )

            # Добавляем курсы выбранных валют
            for code, name in interesting_currencies.items():
                if code != base_currency and code in data['conversion_rates']:
                    rate = data['conversion_rates'][code]
                    embed.add_field(
                        name=f"{code} - {name}",
                        value=f"1 {base_currency} = {rate:.2f} {code}",
                        inline=False
                    )

            # Добавляем иконку
            embed.set_thumbnail(url="https://i.imgur.com/X7SkUU5.png")

            await ctx.send(embed=embed)

        else:
            await ctx.send(f"Ошибка получения курсов: {data.get('error-type', 'Неизвестная ошибка')}")

    except requests.RequestException:
        await ctx.send("Ошибка подключения к сервису курсов валют.")
    except KeyError as e:
        await ctx.send(f"Не удалось обработать данные о курсах. Ошибка: {e}")
    except Exception as e:
        await ctx.send(f"Произошла неизвестная ошибка: {e}")


@bot.command()
async def convert(ctx, amount: float, from_currency: str, to_currency: str):
    """Команда для конвертации валют"""
    from_currency = from_currency.upper()
    to_currency = to_currency.upper()

    try:
        # URL API для конвертации
        url = f'https://v6.exchangerate-api.com/v6/{EXCHANGERATE_API_KEY}/pair/{from_currency}/{to_currency}/{amount}'

        response = requests.get(url)
        data = response.json()

        # Проверка успешности запроса
        if data['result'] == 'success':
            converted_amount = data['conversion_result']

            # Создаем embed
            embed = discord.Embed(
                title="💱 Конвертация валют",
                color=discord.Color.blue()
            )

            embed.add_field(
                name="Конвертация",
                value=f"{amount} {from_currency} = {converted_amount:.2f} {to_currency}",
                inline=False
            )

            embed.set_footer(text=f"Курс: 1 {from_currency} = {data['conversion_rate']:.4f} {to_currency}")

            await ctx.send(embed=embed)

        else:
            await ctx.send(f"Ошибка конвертации: {data.get('error-type', 'Неизвестная ошибка')}")

    except requests.RequestException:
        await ctx.send("Ошибка подключения к сервису курсов валют.")
    except Exception as e:
        await ctx.send(f"Произошла ошибка: {e}")




@bot.event
async def on_ready():
    print(f'Бот подключен: {bot.user.name}')


@bot.command(name="шар")
async def magic_ball(ctx):
    """Команда для получения ответа от магического шара"""
    answers = [
        'Да',
        'Нет',
        'Возможно',
        'Скорее всего',
        'Вероятно',
        'Не знаю',
        'Спроси позже',
        'Лучше не рассказывать',
        'Не могу сказать',
        'Спроси меня позже',
        'Не рассчитывай на это',
        'Не надейся на это',
        'Определенно нет',
        'Определенно да'
    ]
    answer = random.choice(answers)
    await ctx.send(answer)

import discord
from discord.ext import commands
from discord.ui import Select, View

class RiskProtectionSystem:
    def __init__(self):
        self.risk_points = {
            "account_age": 0,
            "join_frequency": 0,
            "message_spam": 0,
            "suspicious_nicknames": 0,
            "invite_links": 0,
            "mass_mentions": 0
        }
        self.risk_thresholds = {
            "low": 10,
            "medium": 20,
            "high": 30,
            "critical": 40
        }

    def check_account_age(self, member):
        """Проверка возраста аккаунта"""
        days_since_creation = (datetime.now() - member.created_at).days
        if days_since_creation < 7:
            self.risk_points["account_age"] += 5
        elif days_since_creation < 30:
            self.risk_points["account_age"] += 3

    def check_join_frequency(self, guild):
        """Проверка частоты входов в гильдию"""
        recent_joins = [member for member in guild.members 
                        if (datetime.now() - member.joined_at).minutes < 10]
        if len(recent_joins) > 5:
            self.risk_points["join_frequency"] += 7

    def check_message_spam(self, messages):
        """Проверка спама сообщениями"""
        message_count = len(messages)
        if message_count > 10 in 60:
            self.risk_points["message_spam"] += 6

    def check_suspicious_nicknames(self, member):
        """Проверка подозрительных никнеймов"""
        suspicious_patterns = [
            "admin", "moder", "hack", "bot", 
            "support", "system", "test"
        ]
        if any(pattern in member.display_name.lower() 
               for pattern in suspicious_patterns):
            self.risk_points["suspicious_nicknames"] += 4

    def check_invite_links(self, message):
        """Проверка приглашений в другие discord сервера"""
        invite_patterns = ["discord.gg", "discordapp.com/invite"]
        if any(pattern in message.content for pattern in invite_patterns):
            self.risk_points["invite_links"] += 5

    def check_mass_mentions(self, message):
        """Проверка массовых упоминаний"""
        if len(message.mentions) > 5:
            self.risk_points["mass_mentions"] += 6

    def get_risk_level(self):
        """Определение уровня риска"""
        total_risk = sum(self.risk_points.values())
        
        if total_risk >= self.risk_thresholds["critical"]:
            return "CRITICAL"
        elif total_risk >= self.risk_thresholds["high"]:
            return "HIGH"
        elif total_risk >= self.risk_thresholds["medium"]:
            return "MEDIUM"
        elif total_risk >= self.risk_thresholds["low"]:
            return "LOW"
        else:
            return "SAFE"

    def apply_protection(self, member, risk_level):
        """Применение защитных мер"""
        protection_actions = {
            "CRITICAL": self.critical_protection,
            "HIGH": self.high_protection,
            "MEDIUM": self.medium_protection,
            "LOW": self.low_protection,
            "SAFE": lambda x: None
        }
        protection_actions[risk_level](member)

    def low_protection(self, member):
        """Легкая защита"""
        role = discord.utils.get(member.guild.roles, name="Новичок")
        member.add_roles(role)

    def medium_protection(self, member):
        """Средняя защита"""
        member.timeout(timedelta(minutes=10))

    def high_protection(self, member):
        """Строгая защита"""
        member.timeout(timedelta(hours=1))
        # Отправка уведомления администратору

    def critical_protection(self, member):
        """Максимальная защита"""
        member.ban(reason="Критический уровень риска")

class AutoModMenu(View):
    def __init__(self, ctx):
        super().__init__()
        self.ctx = ctx

    @discord.ui.select(
        placeholder="Выберите функцию автомодерации",
        options=[
            discord.SelectOption(
                label="Проверка возраста аккаунта", 
                value="account_age"
            ),
            discord.SelectOption(
                label="Частота входов", 
                value="join_frequency"
            ),
            # Другие опции...
        ]
    )
    async def select_callback(self, interaction: discord.Interaction, select: Select):
        selected = select.values[0]
        # Логика обработки выбранной функции
        await interaction.response.send_message(f"Выбрана функция: {selected}")

@bot.command(name="автомод")
async def auto_mod_settings(ctx):
    view = AutoModMenu(ctx)
    await ctx.send("Настройки автомодерации:", view=view)

class RiskPointsTracker:
    def __init__(self):
        self.user_risk_points = {}

    def add_risk_points(self, user_id, points, reason):
        """Добавление баллов риска пользователю"""
        if user_id not in self.user_risk_points:
            self.user_risk_points[user_id] = {
                "total_points": 0,
                "history": []
            }
        
        self.user_risk_points[user_id]["total_points"] += points
        self.user_risk_points[user_id]["history"].append({
            "points": points,
            "reason": reason,
            "timestamp": datetime.now()
        })

    def get_user_risk_info(self, user_id):
        """Получение информации о рисках пользователя"""
        return self.user_risk_points.get(user_id, {
            "total_points": 0,
            "history": []
        })

class RiskPointsView(discord.ui.View):
    def __init__(self, user_id, risk_info):
        super().__init__()
        self.user_id = user_id
        self.risk_info = risk_info

    @discord.ui.button(label="История баллов", style=discord.ButtonStyle.primary)
    async def show_history(self, interaction: discord.Interaction, button: discord.ui.Button):
        """Показать подробную историю баллов риска"""
        embed = discord.Embed(
            title=f"🚨 История баллов риска",
            color=discord.Color.red()
        )
        
        history = self.risk_info.get("history", [])
        if not history:
            embed.description = "История баллов пуста"
        else:
            for entry in history[-5:]:  # Последние 5 записей
                embed.add_field(
                    name=f"+ {entry['points']} баллов",
                    value=f"Причина: {entry['reason']}\n"
                          f"Время: {entry['timestamp'].strftime('%d.%m.%Y %H:%M')}",
                    inline=False
                )
        
        await interaction.response.send_message(embed=embed, ephemeral=True)

@bot.command(name="авторейд_балы")
async def check_risk_points(ctx):
    """Команда для просмотра собственных баллов риска"""
    # Создаем или получаем трекер баллов риска
    if not hasattr(bot, 'risk_points_tracker'):
        bot.risk_points_tracker = RiskPointsTracker()
    
    # Получаем информацию о баллах риска текущего пользователя
    user_id = ctx.author.id
    risk_info = bot.risk_points_tracker.get_user_risk_info(user_id)
    
    # Создаем embed с информацией о баллах
    embed = discord.Embed(
        title="🛡️ Ваши баллы риска",
        color=discord.Color.from_rgb(255, 100, 0)
    )
    
    # Определяем цвет и статус в зависимости от баллов
    total_points = risk_info.get("total_points", 0)
    
    if total_points < 10:
        status = "✅ Безопасный"
        color = discord.Color.green()
    elif total_points < 20:
        status = "🟡 Низкий риск"
        color = discord.Color.yellow()
    elif total_points < 30:
        status = "🟠 Средний риск"
        color = discord.Color.orange()
    else:
        status = "🔴 Высокий риск"
        color = discord.Color.red()
    
    embed.description = f"**Всего баллов риска:** {total_points}\n**Статус:** {status}"
    
    # Добавляем информативные поля
    embed.add_field(
        name="📊 Уровни риска",
        value="0-10: Безопасно\n"
              "10-20: Низкий риск\n"
              "20-30: Средний риск\n"
              "30+: Высокий риск",
        inline=False
    )
    
    # Создаем View с кнопкой истории
    view = RiskPointsView(user_id, risk_info)
    
    # Отправляем сообщение
    await ctx.send(embed=embed, view=view)

# Пример добавления баллов риска
def add_risk_points_example(user_id, points, reason):
    """Пример добавления баллов риска"""
    if not hasattr(bot, 'risk_points_tracker'):
        bot.risk_points_tracker = RiskPointsTracker()
    
    bot.risk_points_tracker.add_risk_points(user_id, points, reason)

# Примеры использования в различных событиях
@bot.event
async def on_message(message):
    # Пример начисления баллов за спам
    if len(message.mentions) > 5:
        add_risk_points_example(
            message.author.id, 
            5, 
            "Массовое упоминание пользователей"
        )

@bot.event
async def on_member_join(member):
    # Пример начисления баллов за подозрительный аккаунт
    account_age = (datetime.now() - member.created_at).days
    if account_age < 7:
        add_risk_points_example(
            member.id, 
            3, 
            "Новый аккаунт (< 7 дней)"
        )

CATEGORY_ID = 1319984453455712276  # Замените на ваш ID категории
ROLE_CONFIRMED_ID = 1314170127456927774  # Замените на ID роли "Потвержден"
ROLE_UNCONFIRMED_ID = 1319989158961479720  # Замените на ID роли "Непотвержден"


    
    

import aiohttp
import re

class BotSecurityCheck:
    def __init__(self, bot):
        self.bot = bot
        self.suspicious_bot_patterns = [
            r"hack", r"spam", r"raid", r"flood", 
            r"admin", r"cheat", r"exploit"
        ]
        self.whitelist_bots = [
            # ID официальных ботов
            123456789, 987654321
        ]
        self.bot_risk_checks = {
            "name_check": self.check_bot_name,
            "permissions_check": self.check_bot_permissions,
            "external_links_check": self.check_external_links
        }

    async def comprehensive_bot_check(self, bot_member):
        """Комплексная проверка бота"""
        risk_score = 0
        risk_reasons = []

        # Проверка по каждому параметру
        for check_name, check_func in self.bot_risk_checks.items():
            check_result = await check_func(bot_member)
            if check_result:
                risk_score += check_result['score']
                risk_reasons.append(check_result['reason'])

        # Проверка репутации через внешние базы
        reputation_check = await self.check_bot_reputation(bot_member)
        if reputation_check:
            risk_score += reputation_check['score']
            risk_reasons.append(reputation_check['reason'])

        return {
            "risk_score": risk_score,
            "risk_reasons": risk_reasons
        }

    def check_bot_name(self, bot_member):
        """Проверка имени бота"""
        bot_name = bot_member.name.lower()
        
        for pattern in self.suspicious_bot_patterns:
            if re.search(pattern, bot_name):
                return {
                    "score": 5,
                    "reason": f"Подозрительное имя бота: {bot_name}"
                }
        return None

    def check_bot_permissions(self, bot_member):
        """Проверка подозрительных прав бота"""
        dangerous_permissions = [
            "administrator",
            "manage_guild", 
            "manage_channels", 
            "manage_roles"
        ]

        bot_perms = bot_member.guild_permissions
        suspicious_perms = [
            perm for perm in dangerous_permissions 
            if getattr(bot_perms, perm)
        ]

        if suspicious_perms:
            return {
                "score": 7,
                "reason": f"Опасные права: {', '.join(suspicious_perms)}"
            }
        return None

    def check_external_links(self, bot_member):
        """Проверка внешних ссылок в описании"""
        description = bot_member.activity.name if bot_member.activity else ""
        
        url_pattern = r'https?://\S+'
        links = re.findall(url_pattern, description)
        
        if links:
            return {
                "score": 4,
                "reason": f"Найдены внешние ссылки: {links}"
            }
        return None

    async def check_bot_reputation(self, bot_member):
        """Проверка репутации бота через внешние источники"""
            async with aiohttp.ClientSession() as session:
                # Пример проверки (замените на реальный API)
                async with session.get(f"https://bot-reputation-api.com/check/{bot_member.id}") as response:
                    if response.status == 200:
                        data = await response.json()
                        if data.get('reputation', 0) < 50:
                            return {
                                "score": 6,
                                "reason": "Низкий рейтинг репутации бота"
                            }
        except Exception:
            pass
        return None

@bot.event
async def on_guild_bot_add(member):
    """Событие при добавлении бота на сервер"""
    if member.bot and member.id not in bot_security_check.whitelist_bots:
        bot_security = BotSecurityCheck(bot)
        check_result = await bot_security.comprehensive_bot_check(member)

        if check_result['risk_score'] > 10:
            # Логирование и действия при высоком риске
            log_channel = member.guild.system_channel
            
            embed = discord.Embed(
                title="🚨 Обнаружен подозрительный бот",
                color=discord.Color.red()
            )
            embed.add_field(
                name="Бот", 
                value=member.mention, 
                inline=False
            )
            embed.add_field(
                name="Причины риска", 
                value="\n".join(check_result['risk_reasons']), 
                inline=False
            )
            embed.add_field(
                name="Риск-score", 
                value=check_result['risk_score'], 
                inline=False
            )

            await log_channel.send(embed=embed)
            
            # Варианты действий
            if check_result['risk_score'] > 15:
                await member.kick(reason="Высокий риск безопасности")
            else:
                # Ограничение прав
                await member.edit(roles=[])

# Глобальный объект для проверок
bot_security_check = BotSecurityCheck(bot)

# Команда для ручной проверки бота
@bot.command(name="проверка_бота")
@commands.has_permissions(administrator=True)
async def check_bot_manually(ctx, bot: discord.Member):
    """Ручная проверка бота администратором"""
    if not bot.bot:
        await ctx.send("Это не бот!")
        return

    check_result = await bot_security_check.comprehensive_bot_check(bot)
    
    embed = discord.Embed(
        title=f"🤖 Проверка бота {bot.name}",
        color=discord.Color.orange()
    )
    embed.add_field(
        name="Риск-score", 
        value=check_result['risk_score'], 
        inline=False
    )
    embed.add_field(
        name="Причины риска", 
        value="\n".join(check_result['risk_reasons']) 
        if check_result['risk_reasons'] 
        else "Риски не обнаружены", 
        inline=False
    )

    await ctx.send(embed=embed)

async def check_invites_and_links(message):
    """Проверка на наличие приглашений и гиперссылок в сообщении."""
    invite_pattern = r"(https?://(www\.)?discord\.gg/\S+|discord\.gg/\S+|discordapp\.com/invite/\S+)"
    link_pattern = r"https?://\S+"

    # Проверка на наличие приглашений
    if re.search(invite_pattern, message.content):
        await message.delete()  # Удаляем сообщение
        await message.author.timeout(duration=datetime.timedelta(hours=1), reason="Приглашение на другой сервер")
        await message.author.send(f"Ваше сообщение было удалено за использование приглашения к другому серверу. Вы получаете тайм-аут на 1 час.")

    # Проверка на наличие гиперссылок
    elif re.search(link_pattern, message.content):
        await message.delete()  # Удаляем сообщение
        await message.author.send(f"Ваше сообщение было удалено за использование гиперссылки.")

# Запуск бота
