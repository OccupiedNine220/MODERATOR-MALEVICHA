import discord
from discord.ext import commands
import json
from datetime import datetime, timedelta
import asyncio

# Загрузка правил из JSON файла
with open('rules.json', 'r', encoding='utf-8') as f:
    rules = json.load(f)

# Загрузка банвордов из JSON файла
with open('banwords.json', 'r', encoding='utf-8') as f:
    banwords = json.load(f)


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

# Команда help, которая использует tree
@bot.tree.command(name="help")
async def help_command(interaction: discord.Interaction):
    help_text = """
    Доступные команды:
    !мут <пункт_правила> - Мутит пользователя
    !бан <пункт_правила> - Банит пользователя (только админы)
    !кик <пункт_правила> - Кикает пользователя
    !мод - Проверка по банвордам
    !размут - Размутить пользователя
    !разбан - Разбанить пользователя
    !очистить <количество> - Очистить сообщения (только админы)
    """
    await interaction.response.send_message(help_text)

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
        if len(before.roles) != len(after.roles):  # Дополнительная проверка
            await log_action(after.guild, f"Роли участника {after.name} были изменены в {datetime.now()}.\nНовые роли: {[role.name for role in after.roles]}")



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

# Запуск бота
bot.run('MTI3MjAzMzQ5Njc0NzIxNjkyMA.Gkkqc2.fFRP_GoFVvo1ZYdQE1m6Ujymx0rlVuQYOH_3_E')