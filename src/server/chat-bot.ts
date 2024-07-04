import express, { Express, NextFunction, Request, Response } from 'express';
import * as dotenv from 'dotenv';
import TelegramBot from 'node-telegram-bot-api';
import { SvitloData } from 'src/interfaces/svitlo-data';
import { format, isToday, parse, subHours, toDate } from 'date-fns';
import { db, findClosest, findClosestOff, getDtekMessage, nextState, setDtekMessage } from './utils';
import jwt, { Secret } from 'jsonwebtoken';

dotenv.config({ path: '.env' });

const app: Express = express();

app.use(express.json());

const TOKEN = process.env.TELEGRAM_TOKEN || '';
const url = process.env.PUBLIC_URL;

const chatBot = new TelegramBot(TOKEN);

// Middleware to authenticate the user's token.
const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) {
    return res.sendStatus(401);
  }

  jwt.verify(token, process.env.TOKEN_SECRET as Secret, (err, data) => {
    if (err) {
      return res.sendStatus(403);
    }

    req.body.user = (data as { user: string }).user;

    next();
  });
};

// This informs the Telegram servers of the new webhook.
chatBot.setWebHook(`${url}/bot${TOKEN}`);

chatBot.clearReplyListeners();
chatBot.clearTextListeners();

app.post(`/light/bot/bot${TOKEN}`, (req, res) => {
  chatBot.processUpdate(req.body);
  res.sendStatus(200);
});

app.post(`/light/bot/message`, authenticateToken, async (req, res) => {
  const { chatId, message, photoId, getChat, dtekMessage, updateChatIds } = req.body;
  console.log('SEND', req.body);

  if (message) {
    chatBot.sendMessage(chatId, message);
  }
  if (photoId) {
    chatBot.sendPhoto(chatId, photoId);
  }
  if (getChat) {
    chatBot.getChat(getChat).then((chat) => {
      console.log('GET CHAT', chat);
    });
  }
  if (dtekMessage) {
    await setDtekMessage(dtekMessage);
    if (updateChatIds?.length) {
      updateChatIds.forEach((chatId: number) => {
        sendLightData(chatId);
      });
    }
  }

  res.sendStatus(200);
});

const triggerWords = JSON.parse(process.env.TRIGGER_WORDS || '');
const triggerShortWords = JSON.parse(process.env.TRIGGER_SHORT_WORDS || '');
const triggerSchedule = JSON.parse(process.env.TRIGGER_SCHEDULE || '');
/**
 * Event listener for incoming messages.
 * Sends light data to the chat users based on trigger words.
 * @param msg - The incoming message object.
 */
chatBot.on('message', (msg) => {
  const {
    message_id: originalMessageId,
    text,
    chat: { id: chatId },
  } = msg;

  if (triggerWords.some((words: string[]) => words.every((word) => text?.toLowerCase().includes(word)))) {
    sendLightData(chatId, originalMessageId);
    return;
  }
  if (triggerShortWords.some((words: string[]) => words.every((word) => text?.toLowerCase().includes(word)))) {
    sendLightData(chatId, originalMessageId, true);
  }
  if (triggerSchedule.some((words: string[]) => words.every((word) => text?.toLowerCase().includes(word)))) {
    // vidklychennya.jpg
    chatBot.sendPhoto(chatId, 'AgACAgIAAxkBAAIKPGZ9S6ay77iCY_OjDPUDoYHZLR-hAAJv4TEbNWzpS8llsuioxqa-AQADAgADeQADNQQ', {
      reply_to_message_id: originalMessageId,
    });
  }
});

chatBot.onText(/^\/light/, (msg) => {
  const {
    chat: { id: chatId },
    message_id: originalMessageId,
  } = msg;
  sendLightData(chatId, originalMessageId);
});

chatBot.onText(/^\/schedule/, (msg) => {
  const {
    chat: { id: chatId },
    message_id: originalMessageId,
  } = msg;
  chatBot.sendPhoto(chatId, 'AgACAgIAAxkBAAIKPGZ9S6ay77iCY_OjDPUDoYHZLR-hAAJv4TEbNWzpS8llsuioxqa-AQADAgADeQADNQQ', {
    reply_to_message_id: originalMessageId,
  });
});

chatBot.onText(/^\/statistics/, (msg) => {
  const {
    chat: { id: chatId },
    message_id: originalMessageId,
  } = msg;
  chatBot.sendMessage(chatId, 'https://svitloe.coderak.net/chart', { reply_to_message_id: originalMessageId });
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
    chatBot.sendMessage(chatId, `❗ Виникла помилка!\n\n${activeLink}`, {
      parse_mode: 'HTML',
      ...(reply_to_message_id && { reply_to_message_id }),
    });
    return;
  }

  const dtekMessage = getDtekMessage();
  const closestTime = findClosest(data.light);
  const closestTimeOff = findClosestOff();

  let message = `${light ? '💡' : '❌'} З <b>${format(timestamp, 'HH:mm')}</b>${isToday(timestamp) ? '' : ' ' + format(timestamp, 'd/MM')} ${light ? 'світло є!' : 'світла нема :('}\n`;
  message += `Наступне ${light ? 'відключення' : 'включення'} можливо ${nextState(light, nextStateTime)}\n\n`;
  // message += data.light
  //   ? `Наступне відключення можливо ${closestTimeOff.isInterval ? 'до ' + closestTimeOff.closestTime : 'о ' + closestTimeOff.closestTime}\n\n`
  //   : `Наступне включення можливо ${format(subHours(toDate(parse(closestTime || '00:00', 'HH:mm', new Date())), 3), 'H:mm')} – ${closestTime}\n\n`;
  message += dtekMessage ? `⚡ ${dtekMessage}\n\n` : '';
  message += activeLink;

  chatBot.sendMessage(chatId, message, {
    parse_mode: 'HTML',
    ...(reply_to_message_id && { reply_to_message_id }),
  });
};

const sendShortReply = (chatId: number, message: string, reply_to_message_id?: number) => {
  chatBot.sendMessage(chatId, message, {
    parse_mode: 'HTML',
    ...(reply_to_message_id && { reply_to_message_id }),
  });
};

/**
 * Sends light data to the specified chat ID.
 * Retrieves the latest light data from the database and sends it as a message.
 * @param chatId - The ID of the chat to send the light data to.
 * @param reply_to_message_id - The ID of the message to reply to.
 */
const sendLightData = (chatId: number, reply_to_message_id?: number, short?: boolean) => {
  (db as any)
    .findOne({ area: 'rad0' }, { light: 1, timestamp: 1, _id: 0 })
    .sort({ timestamp: -1 })
    .exec((err: Error, data: SvitloData) => {
      if (err) {
        return null;
      }

      const closestTime = findClosest(data.light);
      const closestTimeOff = findClosestOff();

      if (short) {
        const dtekMessage = getDtekMessage();
        const timeOn = dtekMessage.match(/\d{1,2}:\d{2}/)?.[0];
        let message = `${data.light ? '💡 Так' : '❌ Ні'}`;
        message += data.light
          ? `, до ${closestTime}`
          : `, до ${timeOn ? timeOn + ', чи до ' : ''}${format(subHours(toDate(parse(closestTime || '00:00', 'HH:mm', new Date())), 3), 'H:mm')} – ${closestTime} за графіком`;
        // message += data.light
        //   ? `, ${closestTimeOff.isInterval ? 'відключення можливо до ' + closestTimeOff.closestTime : 'до ' + closestTimeOff.closestTime}`
        //   : `, до ${format(subHours(toDate(parse(closestTime || '00:00', 'HH:mm', new Date())), 3), 'H:mm')} – ${closestTime}`;
        message += '\n\n<a href="https://svitloe.coderak.net/">Графік та можливі відключення</a>';
        sendShortReply(chatId, message, reply_to_message_id);
        return;
      }

      sendMessage(
        chatId,
        {
          ...data,
          ...(closestTime && { nextStateTime: closestTime }),
        },
        reply_to_message_id
      );
    });
};

export { app as botApp, chatBot, sendMessage };
