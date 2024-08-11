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
ADMIN_ROLE_ID = 1264925548908642304
MOD_ROLE_ID = 1264925741842174066

# Время мута в секундах (2 часа)
MUTE_DURATION = 2 * 60 * 60

# Проверка на наличие роли админа
def is_admin(ctx):
    return any(role.id == ADMIN_ROLE_ID for role in ctx.author.roles)

# Проверка на наличие роли модератора
def is_mod(ctx):
    return any(role.id == MOD_ROLE_ID for role in ctx.author.roles)

# Команда help, которая использует tree
@bot.tree.command(name="help")
async def help_command(interaction: discord.Interaction):
    help_text = """
    Доступные команды:
    !мут <пользователь> <причина> - Мутит пользователя
    !бан <пользователь> <причина> - Банит пользователя (только админы)
    !кик <пользователь> <причина> - Кикает пользователя
    !мод - Проверка по банвордам
    !размут <пользователь> - Размутить пользователя
    !разбан <пользователь> - Разбанить пользователя
    !очистить <количество> - Очистить сообщения (только админы)
    """
    await interaction.response.send_message(help_text)

# Команда мут
@bot.command(name="мут")
async def mute(ctx, member: discord.Member, *, reason=None):
    if not is_mod(ctx):
        await ctx.send("У вас нет прав для выполнения этой команды.")
        return
    
    mute_role = discord.utils.get(ctx.guild.roles, name="Muted")
    await member.add_roles(mute_role, reason=reason)
    await ctx.send(f"{member.mention} был замучен. Причина: {reason}")

    # Автоматическое размутирование через 2 часа
    await discord.utils.sleep_until(datetime.now() + timedelta(seconds=MUTE_DURATION))
    await member.remove_roles(mute_role)
    await ctx.send(f"{member.mention} был автоматически размучен.")

# Команда бан
@bot.command(name="бан")
async def ban(ctx, member: discord.Member, *, reason=None):
    if not is_admin(ctx):
        await ctx.send("У вас нет прав для выполнения этой команды.")
        return
    
    await member.ban(reason=reason)
    await ctx.send(f"{member.mention} был забанен. Причина: {reason}")

# Команда кик
@bot.command(name="кик")
async def kick(ctx, member: discord.Member, *, reason=None):
    if not is_mod(ctx):
        await ctx.send("У вас нет прав для выполнения этой команды.")
        return
    
    await member.kick(reason=reason)
    await ctx.send(f"{member.mention} был кикнут. Причина: {reason}")

# Команда мод
@bot.command(name="мод")
async def mod_check(ctx, *, message_content: str):
    if not is_mod(ctx):
        await ctx.send("У вас нет прав для выполнения этой команды.")
        return

    for word in banwords['tier1']:
        if word in message_content:
            await ctx.message.delete()
            mute_role = discord.utils.get(ctx.guild.roles, name="Muted")
            await ctx.author.add_roles(mute_role)
            await ctx.send(f"Сообщение от {ctx.author.mention} было удалено. Причина: банворд '{word}'. Пользователь замучен на 2 часа.")
            return

    for word in banwords['tier2']:
        if word in message_content:
            await ctx.message.delete()
            await ctx.send(f"Сообщение от {ctx.author.mention} было удалено. Причина: банворд '{word}'.")
            return

# Команда размут
@bot.command(name="размут")
async def unmute(ctx, member: discord.Member):
    if not is_mod(ctx):
        await ctx.send("У вас нет прав для выполнения этой команды.")
        return
    
    mute_role = discord.utils.get(ctx.guild.roles, name="Muted")
    await member.remove_roles(mute_role)
    await ctx.send(f"{member.mention} был размучен.")

# Команда разбан
@bot.command(name="разбан")
async def unban(ctx, user: discord.User):
    if not is_mod(ctx):
        await ctx.send("У вас нет прав для выполнения этой команды.")
        return
    
    banned_users = await ctx.guild.bans()
    for ban_entry in banned_users:
        if ban_entry.user == user:
            await ctx.guild.unban(user)
            await ctx.send(f"{user.mention} был разбанен.")
            return

    await ctx.send("Пользователь не найден в списке забаненных.")

# Команда очистить
@bot.command(name="очистить")
async def clear(ctx, amount: int):
    if not is_admin(ctx):
        await ctx.send("У вас нет прав для выполнения этой команды.")
        return
    
    await ctx.channel.purge(limit=amount + 1)
    await ctx.send(f"Удалено {amount} сообщений.", delete_after=5)

# Запуск бота
bot.run('ВАШ ТОКЕН БОТА')