import discord
from discord.ext import commands
import json
from datetime import datetime, timedelta
import asyncio
from discord.ui import Button, View, Modal, TextInput
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

class HelpView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=60)
        
        # Создаем Select меню
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
                )
            ]
        )
        self.select.callback = self.select_callback
        self.add_item(self.select)

    async def select_callback(self, interaction: discord.Interaction):
        if self.select.values[0] == "mod":
            embed = discord.Embed(title="🛡️ Модерация", color=discord.Color.red())
            embed.description = """
            🔇 `!мут <@пользователь> <время> <причина>` - Замутить пользователя
            🔊 `!размут <@пользователь>` - Размутить пользователя
            🔨 `!бан <@пользователь> <причина>` - Забанить пользователя
            👢 `!кик <@пользователь> <причина>` - Кикнуть пользователя
            🧹 `!очистить <количество>` - Удалить сообщения
            ⚠️ `!варн <@пользователь> <причина>` - Выдать предупреждение
            🔰  `!мод <@пользователь> <причина>` - Дать наказание по пункту правила
            """
            
        elif self.select.values[0] == "ticket":
            embed = discord.Embed(title="🎫 Система тикетов", color=discord.Color.green())
            embed.description = """
            📩 Используйте кнопку "Создать тикет" в специальном канале
            ❓ При создании тикета укажите тему и описание проблемы
            🔒 Для закрытия тикета используйте кнопку "Закрыть тикет"
            """
            
        elif self.select.values[0] == "stats":
            embed = discord.Embed(title="📊 Статистика", color=discord.Color.blue())
            embed.description = """
            📈 `!статистика [@пользователь]` - Показать статистику модератора
            📊 `!ботинфо` - Показать общую статистику бота
            """
            
        elif self.select.values[0] == "verify":
            embed = discord.Embed(title="✅ Верификация", color=discord.Color.green())
            embed.description = """
            🤖 Верификация происходит автоматически при входе на сервер
            🖼️ Вам будет предложено ввести код с капчи
            🔓 После успешной верификации вы получите доступ к серверу
            """
            
        elif self.select.values[0] == "docs":
            embed = discord.Embed(title="📋 Система документов", color=discord.Color.gold())
            embed.description = """
            📝 Используйте кнопку "Подать документ" в специальном канале
            👤 Укажите нарушителя и пункт правил
            🖼️ Приложите доказательства (изображение)
            👮 Доступно только для модераторов (роль "одмен")
            """
            
        elif self.select.values[0] == "automod":
            embed = discord.Embed(title="🤖 Автомодерация", color=discord.Color.orange())
            embed.description = """
            🛑 Автоматическая защита от спама
            🖼️ Проверка изображений (расширения .jpg, .png, .gif)
            ⏱️ Временные ограничения на отправку сообщений при спаме
            """

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
async def mute(ctx, member: discord.Member, rule_id: str):
    if not is_mod(ctx):
        await ctx.send("У вас нет прав для выполнения этой команды.")
        return
    
    # Получаем правило и проверяем, существует ли оно
    rule = rules['rules'].get(rule_id)
    if rule is None:
        await ctx.send(f"Правило с идентификатором '{rule_id}' не найдено.")
        return

    punishment_type = rule['punishment']['type']
    duration = rule['punishment'].get('duration', 0)

    if punishment_type == 'timeout':
        mute_role = discord.utils.get(ctx.guild.roles, name="психопатыч")
        if mute_role is None:
            await ctx.send("Роль 'Muted' не найдена. Пожалуйста, создайте её.")
            return

        await member.add_roles(mute_role)
        end_time = datetime.now() + timedelta(minutes=duration)

        # Сохраняем информацию о муте
        mute_data[str(member.id)] = end_time.isoformat()
        save_mute_data(mute_data)

        await ctx.send(f"{member.mention} был замучен на {duration} минут за нарушение правила '{rule_id}'. Причина: {rule['description']}")

        # Автоматическое снятие мута
        await asyncio.sleep(duration * 60)
        await member.remove_roles(mute_role)
        await ctx.send(f"{member.mention} больше не замучен.")
        mute_data.pop(str(member.id), None)  # Удаляем из JSON после размута
        save_mute_data(mute_data)
    else:
        await ctx.send(f"Правило '{rule_id}' не предусматривает мут.")

# Команда мутвремя
@bot.command(name="мутвремя")
async def mute_time(ctx, member: discord.Member):
    mute_role = discord.utils.get(ctx.guild.roles, name="психопатыч")
    if mute_role in member.roles:
        end_time_str = mute_data.get(str(member.id))
        if end_time_str:
            end_time = datetime.fromisoformat(end_time_str)
            time_left = end_time - datetime.now()
            if time_left.total_seconds() > 0:
                hours, remainder = divmod(time_left.seconds, 3600)
                minutes, seconds = divmod(remainder, 60)
                await ctx.send(f"У {member.mention} осталось {hours} часов, {minutes} минут и {seconds} секунд до окончания мута.")
            else:
                await ctx.send(f"У {member.mention} мут должен был закончиться, но он все еще замучен.")
        else:
            await ctx.send(f"Информация о времени мута для {member.mention} не найдена.")
    else:
        await ctx.send(f"Участник {member.mention} не замучен.")

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
async def ban(ctx, member: discord.Member, rule_id: str):
    if not is_admin(ctx):
        await ctx.message.add_reaction("❌")
        await ctx.send("У вас нет прав для выполнения этой команды.")
        return

    # Получаем правило и проверяем, существует ли оно
    rule = rules['rules'].get(rule_id)
    if rule is None:
        await ctx.message.add_reaction("❌")
        await ctx.send(f"Правило с идентификатором '{rule_id}' не найдено.")
        return

    # Применяем наказание в соответствии с правилом
    punishment_type = rule['punishment']['type']
    if punishment_type == 'ban':
        duration = rule['punishment'].get('duration', 0)
        await member.ban(reason=f"Нарушение правила '{rule_id}'")
        if duration == 0:
            await ctx.send(f"{member.mention} был забанен на неопределенный срок за нарушение правила '{rule_id}'. Причина: {rule['description']}")
        else:
            await ctx.send(f"{member.mention} был забанен на {duration} дней за нарушение правила '{rule_id}'. Причина: {rule['description']}")
            # Автоматическое разбанивание через указанное время
            await discord.utils.sleep_until(datetime.now() + timedelta(days=duration))
            await ctx.guild.unban(member)
    else:
        await ctx.message.add_reaction("❌")
        await ctx.send(f"Правило с идентификатором '{rule_id}' не предусматривает бан.")
        return

    await ctx.message.add_reaction("✅")

# Команда кик
@bot.command(name="кик")
async def kick(ctx, member: discord.Member, rule_id: str):
    if not is_mod(ctx):
        await ctx.message.add_reaction("❌")
        await ctx.send("У вас нет прав для выполнения этой команды.")
        return

    # Получаем правило и проверяем, существует ли оно
    rule = rules['rules'].get(rule_id)
    if rule is None:
        await ctx.message.add_reaction("❌")
        await ctx.send(f"Правило с идентификатором '{rule_id}' не найдено.")
        return

    # Применяем наказание в соответствии с правилом
    punishment_type = rule['punishment']['type']
    if punishment_type == 'kick':
        await member.kick(reason=f"Нарушение правила '{rule_id}'")
        await ctx.send(f"{member.mention} был кикнут за нарушение правила '{rule_id}'. Причина: {rule['description']}")
    else:
        await ctx.message.add_reaction("❌")
        await ctx.send(f"Правило с идентификатором '{rule_id}' не предусматривает кик.")
        return

    await ctx.message.add_reaction("✅")

# Команда размут
@bot.command(name="размут")
async def unmute(ctx, member: discord.Member):
    if not is_mod(ctx):
        await ctx.message.add_reaction("❌")
        await ctx.send("У вас нет прав для выполнения этой команды.")
        return

    mute_role = discord.utils.get(ctx.guild.roles, name="психопатыч")
    await member.remove_roles(mute_role)
    await ctx.send(f"{member.mention} был размучен.")
    await ctx.message.add_reaction("✅")

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

class CaptchaModal(Modal):
    def __init__(self, correct_code):
        super().__init__(title="Введите код с капчи")
        self.correct_code = correct_code
        self.captcha_input = TextInput(label="Код капчи", placeholder="Введите код здесь", max_length=6)
        self.add_item(self.captcha_input)

    async def on_submit(self, interaction: discord.Interaction):
        if self.captcha_input.value.upper() == self.correct_code:
            verified_role = discord.utils.get(interaction.guild.roles, name="Verified")
            if verified_role:
                await interaction.user.add_roles(verified_role)
                await interaction.response.send_message("Верификация успешна! Этот канал будет удален через 5 секунд.", ephemeral=True)
                await asyncio.sleep(5)
                await interaction.channel.delete()
            else:
                await interaction.response.send_message("Роль 'Verified' не найдена. Пожалуйста, создайте её.", ephemeral=True)
        else:
            await interaction.response.send_message("Неверный код! Попробуйте еще раз.", ephemeral=True)

class CaptchaView(View):
    def __init__(self, correct_code):
        super().__init__(timeout=300)
        self.correct_code = correct_code

    @discord.ui.button(label="Ввести код", style=discord.ButtonStyle.primary)
    async def enter_code(self, interaction: discord.Interaction, button: Button):
        modal = CaptchaModal(self.correct_code)
        await interaction.response.send_modal(modal)

    @discord.ui.button(label="Новая капча", style=discord.ButtonStyle.secondary)
    async def regenerate(self, interaction: discord.Interaction, button: Button):
        await send_captcha(interaction.channel, interaction.user)

# Функция для генерации кода капчи
def generate_captcha_code(length=6):
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=length))

# Функция для создания изображения капчи
def create_captcha_image(code):
    image = ImageCaptcha()
    captcha_image = image.generate(code)
    return discord.File(io.BytesIO(captcha_image.getvalue()), "captcha.png")

# Функция для отправки капчи
async def send_captcha(channel, member):
    captcha_code = generate_captcha_code()
    captcha_image = create_captcha_image(captcha_code)

    view = CaptchaView(captcha_code)
    await channel.send(
        f"{member.mention}, для верификации, пожалуйста, нажмите кнопку 'Ввести код' и введите код с картинки:",
        file=captcha_image,
        view=view
    )

@bot.event
async def on_member_join(member):
    verification_category = discord.utils.get(member.guild.categories, name="Верификация")
    if not verification_category:
        verification_category = await member.guild.create_category("Верификация")

    verification_channel = await member.guild.create_text_channel(
        f'verify-{member.name}',
        category=verification_category
    )

    await verification_channel.set_permissions(member.guild.default_role, read_messages=False)
    await verification_channel.set_permissions(member, read_messages=True, send_messages=True)

    await send_captcha(verification_channel, member)

# Автомодерация изображений
@bot.event
async def on_message(message):
    if message.attachments:
        for attachment in message.attachments:
            # Проверяем расширение файла
            if any(attachment.filename.lower().endswith(ext) for ext in ['.jpg', '.png', '.gif']):
                # Здесь можно добавить проверку изображения через API для определения неприемлемого контента
                pass


BOT_VERSION = 1.5

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
              f"Версия бота: {BOT_VERSION}",
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


# Запуск бота
bot.run('MTI3MjAzMzQ5Njc0NzIxNjkyMA.GlqNbY.ab1W1VT2Yto_Lpoy7O8GvYHHdqSfzqZu1PTGAk')