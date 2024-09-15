import discord
from discord.ext import commands
import json
from datetime import datetime, timedelta

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

# Проверка сообщений на банворды первой очереди
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
            await message.add_reaction("✅")
            # Автоматическое размутирование через 2 часа
            await discord.utils.sleep_until(datetime.now() + timedelta(hours=2))
            await message.author.remove_roles(mute_role)
            return
    
    await bot.process_commands(message)

# Команда help, которая использует tree
@bot.tree.command(name="help")
async def help_command(interaction: discord.Interaction):
    help_text = """
    Доступные команды:
    !мут <время> - Мутит пользователя
    !бан <время> - Банит пользователя (только админы)
    !кик - Кикает пользователя
    !мод - Проверка по банвордам
    !размут - Размутить пользователя
    !разбан - Разбанить пользователя
    !очистить <количество> - Очистить сообщения (только админы)
    """
    await interaction.response.send_message(help_text)

# Команда мут
@bot.command(name="мут")
async def mute(ctx, member: discord.Member, time: int, *, reason=None):
    if not is_mod(ctx):
        await ctx.message.add_reaction("❌")
        await ctx.send("У вас нет прав для выполнения этой команды.")
        return
    
    mute_role = discord.utils.get(ctx.guild.roles, name="Muted")
    await member.add_roles(mute_role, reason=reason)
    await ctx.send(f"{member.mention} был замучен на {time} минут. Причина: {reason}")
    await ctx.message.add_reaction("✅")

    # Автоматическое размутирование через указанное время
    await discord.utils.sleep_until(datetime.now() + timedelta(minutes=time))
    await member.remove_roles(mute_role)
    await ctx.send(f"{member.mention} был автоматически размучен.")

# Команда бан
@bot.command(name="бан")
async def ban(ctx, member: discord.Member, time: int, *, reason=None):
    if not is_admin(ctx):
        await ctx.message.add_reaction("❌")
        await ctx.send("У вас нет прав для выполнения этой команды.")
        return
    
    await member.ban(reason=reason)
    await ctx.send(f"{member.mention} был забанен на {time} дней. Причина: {reason}")
    await ctx.message.add_reaction("✅")
    
    # Автоматическое разбанивание через указанное время
    await discord.utils.sleep_until(datetime.now() + timedelta(days=time))
    await ctx.guild.unban(member)
    await ctx.send(f"{member.mention} был автоматически разбанен после {time} дней.")

# Команда кик
@bot.command(name="кик")
async def kick(ctx, member: discord.Member, *, reason=None):
    if not is_mod(ctx):
        await ctx.message.add_reaction("❌")
        await ctx.send("У вас нет прав для выполнения этой команды.")
        return
    
    await member.kick(reason=reason)
    await ctx.send(f"{member.mention} был кикнут. Причина: {reason}")
    await ctx.message.add_reaction("✅")

# Команда мод
@bot.command(name="мод")
async def mod_check(ctx):
    if not is_mod(ctx):
        await ctx.message.add_reaction("❌")
        await ctx.send("У вас нет прав для выполнения этой команды.")
        return

    async for message in ctx.channel.history(limit=100):
        for word in banwords['tier2']:
            if word in message.content.lower():
                await message.delete()
                await ctx.send(f"Сообщение от {message.author.mention} было удалено. Причина: банворд '{word}'.")
                await ctx.message.add_reaction("✅")
                break

# Команда размут
@bot.command(name="размут")
async def unmute(ctx, member: discord.Member):
    if not is_mod(ctx):
        await ctx.message.add_reaction("❌")
        await ctx.send("У вас нет прав для выполнения этой команды.")
        return
    
    mute_role = discord.utils.get(ctx.guild.roles, name="Muted")
    await member.remove_roles(mute_role)
    await ctx.send(f"{member.mention} был размучен.")
    await ctx.message.add_reaction("✅")

# Команда разбан
@bot.command(name="разбан")
async def unban(ctx, user: discord.User):
    if not is_mod(ctx):
        await ctx.message.add_reaction("❌")
        await ctx.send("У вас нет прав для выполнения этой команды.")
        return
    
    banned_users = await ctx.guild.bans()
    for ban_entry in banned_users:
        if ban_entry.user == user:
            await ctx.guild.unban(user)
            await ctx.send(f"{user.mention} был разбанен.")
            await ctx.message.add_reaction("✅")
            return

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

# Запуск бота
bot.run('MTI3MjAzMzQ5Njc0NzIxNjkyMA.Gkkqc2.fFRP_GoFVvo1ZYdQE1m6Ujymx0rlVuQYOH_3_E')