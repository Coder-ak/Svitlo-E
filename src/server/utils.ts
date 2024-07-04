import { addDays, addHours, format, isAfter, isBefore, min, parse, setDay, startOfWeek, subHours, toDate } from 'date-fns';
import * as dotenv from 'dotenv';
import Nedb from 'nedb';
import { SvitloData } from 'src/interfaces/svitlo-data';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import path from 'path';

dotenv.config({ path: '.env' });

const shutdown = require('db/shutdown.json');
const db = new Nedb<SvitloData>({ filename: process.env.DB_PATH, autoload: true });
const filePath = process.env.DTEK_MESSAGE_PATH || 'filename';

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

const findClosestOff = (): ClosestTime => {
  const currentDate = new Date();
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 }); // Monday as week start

  const parseEvent = (event: string): Date => {
    const [day, hour] = event.split(' ');
    const dayIndex = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(day);
    let eventDate = setDay(weekStart, dayIndex);
    eventDate = parse(hour, 'H', eventDate);

    if (isBefore(eventDate, currentDate)) {
      eventDate = addDays(eventDate, 7);
    }
    return eventDate;
  };

  const sortedEvents = shutdown['off'].map(parseEvent).sort((a: Date, b: Date) => a.getTime() - b.getTime());

  let previousEvent = sortedEvents[sortedEvents.length - 1];
  for (let i = 0; i < sortedEvents.length; i++) {
    const event = sortedEvents[i];
    if (isAfter(event, currentDate) || i === sortedEvents.length - 1) {
      const threeHoursAfterPrevious = addHours(previousEvent, 3);

      if (isBefore(currentDate, threeHoursAfterPrevious)) {
        return {
          isInterval: true,
          closestTime: format(threeHoursAfterPrevious, 'HH:mm'),
        };
      } else {
        return {
          isInterval: false,
          closestTime: format(event, 'HH:mm'),
        };
      }
    }
    previousEvent = event;
  }

  return {
    isInterval: false,
    closestTime: null,
  };
};

const nextState = (light: boolean, nextStateTime: string | undefined) => {
  return light
    ? `o <b>${nextStateTime}</b>`
    : `з <b>${format(subHours(toDate(parse(nextStateTime || '00:00', 'HH:mm', new Date())), 3), 'H:mm')}</b> до <b>${nextStateTime}</b>`;
};

const setDtekMessage = async (message: string) => {
  try {
    // Check if file exists, create it if it doesn't
    // Ensure the directory exists
    const directory = path.dirname(filePath);
    await fsPromises.mkdir(directory, { recursive: true });

    await fsPromises.writeFile(filePath, message);
    console.log('File written successfully');
  } catch (err) {
    console.error('Error writing to file:', err);
  }
};

const getDtekMessage = () => {
  try {
    if (!fs.existsSync(filePath)) {
      return '';
    }
    return fs.readFileSync(process.env.DTEK_MESSAGE_PATH || 'filename', 'utf8');
  } catch (err) {
    console.error('Error reading file:', err);
    return '';
  }
};

const resetDtekMessage = async () => {
  try {
    // Ensure the directory exists
    const directory = path.dirname(filePath);
    await fsPromises.mkdir(directory, { recursive: true });

    // Write an empty string to the file, creating it if it doesn't exist
    await fsPromises.writeFile(filePath, '');
    console.log('File reset successfully');
  } catch (err) {
    console.error('Error resetting file:', err);
  }
};

export { findClosest, findClosestOff, db, nextState, setDtekMessage, getDtekMessage, resetDtekMessage };
