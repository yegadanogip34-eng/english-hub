# ==========================================
# English Tutor - Telegram Bot Launcher
# ==========================================
# Скрипт телеграм-бота для запуска Mini App и обработки ссылок-приглашений (офферов).
#
# Для запуска бота:
# 1. Установите библиотеку: pip install pyTelegramBotAPI
# 2. Вставьте ваш токен бота от @BotFather в переменную BOT_TOKEN ниже
# 3. Укажите публичный URL вашего веб-приложения в WEBAPP_URL (например, через ngrok или ваш хостинг)
# 4. Запустите: python bot.py

import os
import telebot
from telebot.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo, MenuButtonWebApp

BOT_TOKEN = "9143645923:AAE6kKi3aIBBGzSTk0PKgE7nnP7gkDGxHaM"
# Адрес по умолчанию (будет переопределяться из current_url.txt)
DEFAULT_WEBAPP_URL = "https://d81f3d3bbdcb29.lhr.life"

def get_webapp_url():
    try:
        if os.path.exists("current_url.txt"):
            with open("current_url.txt", "r", encoding="utf-8") as f:
                url = f.read().strip()
                if url.startswith("http"):
                    return url
    except Exception:
        pass
    return DEFAULT_WEBAPP_URL

bot = telebot.TeleBot(BOT_TOKEN)

@bot.message_handler(commands=['start'])
def handle_start(message):
    args = message.text.split()[1:] if len(message.text.split()) > 1 else []
    invite_param = ""
    welcome_text = (
        f"👋 Здравствуйте, {message.from_user.first_name}!\n\n"
        "Добро пожаловать в закрытый учебный класс **English Hub** 🇬🇧\n\n"
        "Здесь вас ждут:\n"
        "📚 Интерактивные учебные материалы (теория, видео и таблицы)\n"
        "✍️ Персональные домашние задания\n"
        "📝 Быстрая обратная связь и разбор ошибок от преподавателя"
    )

    if args:
        start_arg = args[0]
        # Если передан инвайт-код через deep link (например /start invite_CODE или /start CODE)
        code = start_arg.replace('invite_', '').strip().upper()
        invite_param = f"?invite={code}"
        welcome_text += f"\n\n✨ **Обнаружено приглашение:** `{code}`\nНажмите кнопку ниже, чтобы войти в учебный класс."

    current_url = get_webapp_url()
    app_url = f"{current_url}/{invite_param}"

    markup = InlineKeyboardMarkup()
    btn = InlineKeyboardButton(
        text="🇬🇧 Открыть учебный класс",
        web_app=WebAppInfo(url=app_url)
    )
    markup.add(btn)

    bot.send_message(
        chat_id=message.chat.id,
        text=welcome_text,
        reply_markup=markup,
        parse_mode="Markdown"
    )

if __name__ == '__main__':
    try:
        current_url = get_webapp_url()
        bot.set_chat_menu_button(menu_button=MenuButtonWebApp('🇬🇧 English Hub', WebAppInfo(current_url)))
    except Exception as e:
        print(f"Menu button config warning: {e}")
    print("=" * 50)
    print("Telegram-бот EngLearn (@Englear124_bot) запущен!")
    print(f"Привязанный Mini App URL: {get_webapp_url()}")
    print("=" * 50)
    bot.infinity_polling()
