import express, { Express, NextFunction, Request, Response } from 'express';
import * as dotenv from 'dotenv';
import TelegramBot from 'node-telegram-bot-api';
import { SvitloData } from 'src/interfaces/svitlo-data';
import { format, isToday } from 'date-fns';
import { db, findClosest, nextState } from './utils';
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

app.post(`/light/bot/message`, authenticateToken, (req, res) => {
  const { chatId, message, photoId, getChat } = req.body;
  console.log('SEND', req.body);

  // 143862747 - chatBot
  // -1001769448668 - rad0

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

  // chatBot.sendMessage(chatId, message);
  // chatBot.sendPhoto(chatId, 'AgACAgIAAxkBAAPLZmXRJQW-CC8YNRoYVeBmkrrwbtsAAnrmMRs2OzFLK_pTWqtQYHYBAAMCAAN5AAM1BA');

  res.sendStatus(200);
});

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
  const triggerWords = JSON.parse(process.env.TRIGGER_WORDS || '');

  if (msg.chat?.id === 143862747) {
    console.log('MESSAGE', msg);
  }

  if (triggerWords.some((words: string[]) => words.every((word) => text?.toLowerCase().includes(word)))) {
    sendLightData(chatId, originalMessageId);
  }
});

// chatBot.on('callback_query', (callbackQuery) => {
//     if(!didWeRemoveHisKeyboard(callbackQuery.from.id))
//         removeHisKeyboard(callbackQuery)
//     //then handle the user response
// })

// removeHisKeyboard = function(callbackQuery){
//     chatBot.editMessageText(callbackQuery.message.text,
//     {message_id:callbackQuery.message.message_id , chat_id:callbackQuery.from.id,
//     reply_markup: {
//         remove_keyboard: true
//     }}).catch((err) => {
//         //some error handling
//     }).then(function(res){
//          if(res)
//              addThisChatToHandledList(callbackQuery.from.id)
//     })

// }

// chatBot.on('photo', (msg) => {
//   const { chat: { id: chatId } } = msg;
//   chatBot.sendMessage(chatId, 'Photo received. Provide chatId to send the photo to.', {
//     reply_markup: {
//       force_reply: true,
//       keyboard: [[{text: "-1002185759419"}, {text: "143862747"}]]
//     }
//   })
//   .then((res) => {
//     console.log('REPLY', res);
//   });
// });

// chatBot.sendMessage(-1002185759419, 'Завтра в Україні відключатимуть світло з 15:00 до 23:00.', {
//     parse_mode: 'HTML',
//     reply_markup: { remove_keyboard: true },
// });

chatBot.onText(/^\/forward/, (msg) => {
  const {
    chat: { id: chatId },
  } = msg;

  chatBot.sendMessage(chatId, 'Enter chatId', {
    reply_markup: {
      remove_keyboard: true,
      // force_reply: true,
      // keyboard: [[{text: "-1002185759419"}, {text: "143862747"}]]
    },
  });
});

chatBot.onText(/^Cards|^Progress/, (msg) => {
  const {
    chat: { id: chatId },
  } = msg;

  chatBot
    .sendMessage(chatId, 'Enter chatId', {
      reply_markup: {
        remove_keyboard: true,
      },
    })
    .then((res) => {
      console.log('REPLY', res);
      const {
        chat: { id: chatId },
      } = res;
      chatBot.deleteMessage(chatId, res.message_id);
    });
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

  chatBot.sendMessage(
    chatId,
    `${light ? '💡' : '❌'} З <b>${format(timestamp, 'HH:mm')}</b>${isToday(timestamp) ? '' : ' ' + format(timestamp, 'd/MM')} ${light ? 'світло є!' : 'світла нема :('}\nНаступне ${light ? 'відключення' : 'включення'} можливо ${nextState(light, nextStateTime)}\n\n${activeLink}`,
    {
      parse_mode: 'HTML',
      ...(reply_to_message_id && { reply_to_message_id }),
    }
  );
};

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
          ...(closestTime && { nextStateTime: format(closestTime, 'H:mm') }),
        },
        reply_to_message_id
      );
    });
};

export { app as botApp, chatBot, sendMessage };
