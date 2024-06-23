import { addDays, format, isAfter, min, parse, subHours, toDate } from 'date-fns';
import * as dotenv from 'dotenv';
import Nedb from 'nedb';
import { SvitloData } from 'src/interfaces/svitlo-data';

dotenv.config({ path: '.env' });

const shutdown = require('db/shutdown.json');
const db = new Nedb<SvitloData>({ filename: process.env.DB_PATH, autoload: true });

const findClosest = (light: boolean): string | null => {
  const currentDate = new Date();
  const futureEvents = shutdown[light ? 'off' : 'on']
    .map((event: string) => {
      const [day, hour] = event.split(' ');
      let eventDate = parse(`${day} ${hour}`, 'EEE H', currentDate);

      if (
        (day === format(currentDate, 'EEE') && parseInt(hour) <= parseInt(format(currentDate, 'H'), 10)) ||
        isAfter(currentDate, eventDate)
      ) {
        eventDate = addDays(eventDate, 7);
      }

      return eventDate;
    })
    .filter((eventDate: Date) => isAfter(eventDate, currentDate));

  return futureEvents.length === 0 ? null : format(min(futureEvents), 'H:mm');
};

const nextState = (light: boolean, nextStateTime: string | undefined) => {
  return light
    ? `o <b>${nextStateTime}</b>`
    : `з <b>${format(subHours(toDate(parse(nextStateTime || '00:00', 'HH:mm', new Date())), 3), 'H:mm')}</b> до <b>${nextStateTime}</b>`;
};

export { findClosest, db, nextState };
