import express, { Express } from 'express';
import * as dotenv from 'dotenv';
import TelegramBot from 'node-telegram-bot-api';
import { SvitloData } from 'src/interfaces/svitlo-data';
import { format } from 'date-fns';
import { db, findClosest } from './utils';

dotenv.config({ path: '.env' });

const app: Express = express();

const TOKEN = process.env.TELEGRAM_TOKEN || '';
const url = process.env.PUBLIC_URL;

const chatBot = new TelegramBot(TOKEN);

// This informs the Telegram servers of the new webhook.
chatBot.setWebHook(`${url}/bot${TOKEN}`);

app.use(express.json());


app.post(`/light/bot/bot${TOKEN}`, (req, res) => {
  chatBot.processUpdate(req.body);
  res.sendStatus(200);
});

/**
 * Event listener for incoming messages.
 * Sends light data to the chat users based on trigger words.
 * @param msg - The incoming message object.
 */
chatBot.on('message', msg => {
  const { message_id: originalMessageId, text, chat: { id: chatId } } = msg;
  const triggerWords = JSON.parse(process.env.TRIGGER_WORDS || '');

  if (triggerWords.some((words: string[]) => words.every(word => text?.toLowerCase().includes(word)))) {
    sendLightData(chatId, originalMessageId);
  }
});

/**
 * Sends a message to the specified chat ID with the provided light data.
 * @param chatId - The ID of the chat to send the message to.
 * @param data - The light data to include in the message.
 * @param reply_to_message_id - (Optional) The ID of the message to reply to.
 */
const sendMessage = (chatId: number | undefined, data: SvitloData, reply_to_message_id?: number) => {
  if (chatId == null) {
    console.error('chatId not found');
    return;
  }
  const { timestamp, light, nextStateTime } = data;
  const activeLink = '<a href="https://svitloe.coderak.net/">Графік та статистика відключень</a>';

  if (data.timestamp == null) {
    chatBot.sendMessage(
      chatId, 
      `❗ Виникла помилка!\n\n${activeLink}`,
      { 
        parse_mode: 'HTML',
        ...(reply_to_message_id && {reply_to_message_id})
      } 
    );
    return;
  }

  chatBot.sendMessage(
    chatId, 
    `${light ? '💡' : '🔋'} З <b>${format(timestamp, 'HH:mm')}</b> ${light ? 'світло є!' : 'світла нема :('}\nНаступне ${light ? 'відключення' : 'включення'} можливо o <b>${nextStateTime}</b>\n\n${activeLink}`,
    { 
      parse_mode: 'HTML',
      ...(reply_to_message_id && {reply_to_message_id})
    } 
  );
}

/**
 * Sends light data to the specified chat ID.
 * Retrieves the latest light data from the database and sends it as a message.
 * @param chatId - The ID of the chat to send the light data to.
 * @param reply_to_message_id - The ID of the message to reply to.
 */
const sendLightData = (chatId: number, reply_to_message_id: number) => {
  (db as any)
    .findOne({ area: 'rad0' }, { light: 1, timestamp: 1, _id: 0 })
    .sort({ timestamp: -1 })
    .exec((err: Error, data: SvitloData) => {
      if (err) {
        return null;
      }
      const closestTime = findClosest(data.light, data.timestamp);
      sendMessage(
        chatId, 
        {
          ...data,
          ...(closestTime && { nextStateTime: format(closestTime, 'HH:mm') }),
        },
        reply_to_message_id);
    });
}

export { app as botApp, chatBot, sendMessage };
