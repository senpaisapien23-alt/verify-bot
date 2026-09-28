@echo off
cd /d C:\Users\pogop\.cline\data\workspaces\chat\verify-bot
node src\index.js > bot.log 2>&1
echo BOT_EXIT=%ERRORLEVEL% >> bot.log
