import os
import threading
import time
import telebot
from telebot.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo, MenuButtonWebApp
import server

# Telegram Bot Token
BOT_TOKEN = "9143645923:AAE6kKi3aIBBGzSTk0PKgE7nnP7gkDGxHaM"
bot = telebot.TeleBot(BOT_TOKEN)

# URL of the deployed app on Render (or local fallback)
def get_app_url():
    # Render automatically sets RENDER_EXTERNAL_URL (e.g. https://my-app.onrender.com)
    render_url = os.environ.get("RENDER_EXTERNAL_URL")
    if render_url:
        return render_url.rstrip("/")
    if os.path.exists("current_url.txt"):
        try:
            with open("current_url.txt", "r", encoding="utf-8") as f:
                url = f.read().strip()
                if url.startswith("http"):
                    return url
        except Exception:
            pass
    return "https://localhost:8000"

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
        code = start_arg.replace('invite_', '').strip().upper()
        invite_param = f"?invite={code}"
        welcome_text += f"\n\n✨ **Обнаружено приглашение:** `{code}`\nНажмите кнопку ниже, чтобы войти в учебный класс."

    app_url = f"{get_app_url()}/{invite_param}"

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

def run_bot():
    time.sleep(3)
    try:
        url = get_app_url()
        bot.set_chat_menu_button(menu_button=MenuButtonWebApp('🇬🇧 English Hub', WebAppInfo(url)))
        print(f"[BOT] Configured menu button to: {url}")
    except Exception as e:
        print(f"[BOT] Menu button config error: {e}")
    print("[BOT] Starting polling...")
    bot.infinity_polling()

if __name__ == "__main__":
    # Start Telegram bot in background thread
    t = threading.Thread(target=run_bot, daemon=True)
    t.start()

    # Start HTTP Web server on main thread (required by Render)
    print(f"[SERVER] Starting HTTP server on port {server.PORT}...")
    server.run()
