"""
Claudius — Telegram Personal Training Agent
Run: python telegram-bot/bot.py
"""
import os
import httpx
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes
from dotenv import load_dotenv

load_dotenv()

TOKEN         = os.getenv("TELEGRAM_BOT_TOKEN")
ALLOWED_USERS = [int(u) for u in os.getenv("TELEGRAM_ALLOWED_USERS", "").split(",") if u]
BACKEND_URL   = os.getenv("BACKEND_URL", "http://localhost:8000")


def is_allowed(update: Update) -> bool:
    return not ALLOWED_USERS or update.effective_user.id in ALLOWED_USERS


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not is_allowed(update):
        return
    await update.message.reply_text(
        "Olá! Sou o Claudius, o teu agente de treino pessoal.\n\n"
        "Comandos disponíveis:\n"
        "/sync — sincronizar treinos agora\n"
        "/summary — resumo dos últimos 7 dias\n"
        "/today — análise do treino de hoje\n\n"
        "Ou faz-me qualquer pergunta sobre o teu treino!"
    )


async def sync_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not is_allowed(update):
        return
    await update.message.reply_text("A sincronizar treinos...")
    async with httpx.AsyncClient() as client:
        await client.post(f"{BACKEND_URL}/api/sync/trigger")
    await update.message.reply_text("Sincronização iniciada em background!")


async def summary(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not is_allowed(update):
        return
    await update.message.reply_text("A gerar resumo...")
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{BACKEND_URL}/api/agent/chat",
            json={"message": "Dá-me um resumo do meu treino dos últimos 7 dias."},
        )
    data = resp.json()
    await update.message.reply_text(data.get("reply", "Erro ao gerar resumo."))


async def today(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not is_allowed(update):
        return
    await update.message.reply_text("A analisar o treino de hoje...")
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{BACKEND_URL}/api/agent/chat",
            json={"message": "Analisa o meu treino de hoje e diz-me como foi."},
        )
    data = resp.json()
    await update.message.reply_text(data.get("reply", "Sem treino encontrado para hoje."))


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not is_allowed(update):
        return
    await update.message.reply_text("A pensar...")
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{BACKEND_URL}/api/agent/chat",
            json={"message": update.message.text},
        )
    data = resp.json()
    await update.message.reply_text(data.get("reply", "Não consegui processar a pergunta."))


def main():
    app = Application.builder().token(TOKEN).build()
    app.add_handler(CommandHandler("start",   start))
    app.add_handler(CommandHandler("sync",    sync_cmd))
    app.add_handler(CommandHandler("summary", summary))
    app.add_handler(CommandHandler("today",   today))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    print("Claudius bot a correr...")
    app.run_polling()


if __name__ == "__main__":
    main()
