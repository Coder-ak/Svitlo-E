import { closestTo, format, isAfter, parse, subHours, toDate } from 'date-fns';
import * as dotenv from 'dotenv';
import Nedb from 'nedb';
import { SvitloData } from 'src/interfaces/svitlo-data';

dotenv.config({ path: '.env' });

const shutdown = require('db/shutdown.json');
const db = new Nedb<SvitloData>({ filename: process.env.DB_PATH, autoload: true });

const findClosest = (light: boolean, currentTime: number) => {
  const schedule = shutdown[light ? 'off' : 'on'];
  // Filter out past times
  const futureTimes = schedule
    .map((time: string) => toDate(parse(time, 'iii HH', new Date())))
    .filter((time: Date) => isAfter(time, currentTime) && isAfter(time, new Date()));

  // Find the closest future time
  return closestTo(currentTime, futureTimes);
};

const nextState = (light: boolean, nextStateTime: string | undefined) => {
  return light
    ? `o <b>${nextStateTime}</b>`
    : `з <b>${format(subHours(toDate(parse(nextStateTime || '00:00', 'HH:mm', new Date())), 3), 'H:mm')}</b> до <b>${nextStateTime}</b>`;
};

export { findClosest, db, nextState };
