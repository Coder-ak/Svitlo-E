import { format, formatDuration, intervalToDuration, isToday, parse, subHours, toDate } from 'date-fns';
import { uk } from 'date-fns/locale';

export class SvitloUtils {
  static getStatus(status: boolean) {
    return status ? 'світло є!' : 'світла нема :(';
  }

  static formatDate(timestamp: number, dateFormat: string): string {
    return format(timestamp, dateFormat, { locale: uk });
  }

  static isToday(timestamp: number): boolean {
    return isToday(timestamp);
  }

  /**
   * Calculates and formats the duration between a start and end time.
   *
   * @param {number} start - The start time in milliseconds since the Unix epoch.
   * @param {number} end - The end time in milliseconds since the Unix epoch.
   * @returns {string} - A string representation of the duration in a human-readable format.
   *
   * @example
   * const start = new Date(2021, 0, 1).getTime();
   * const end = new Date(2021, 0, 2).getTime();
   * console.log(formatDuration(start, end));
   * // Output: '1д 0:0:0'
   */
  static formatDuration(start: number, end: number): string {
    const duration = intervalToDuration({ start, end });
    return formatDuration(duration, {
      delimiter: '',
      format: ['days', 'hours', 'minutes', 'seconds'],
      zero: true,
      locale: {
        formatDistance: (_token, count) => {
          if (_token === 'xDays') {
            return count ? count + 'д ' : '';
          }
          return `${SvitloUtils.zeroPad(count)}${_token !== 'xSeconds' ? ':' : ''}`;
        },
      },
    });
  }

  /**
   * Adds leading zeros to a number until it reaches a certain length.
   *
   * @param {string} num - The number to pad with zeros.
   * @returns {string} The padded number.
   */
  static zeroPad(num: string): string {
    return String(num).padStart(2, '0');
  }

  static getState(light: boolean): string {
    return light ? 'on' : 'off';
  }

  static debounce_leading<F extends (...args: Parameters<F>) => ReturnType<F>>(func: F, timeout = 500) {
    let timer: number | undefined;
    return (...args: any) => {
      if (!timer) {
        func.apply(this, args);
      }
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = undefined;
      }, timeout);
    };
  }

  static nextState(light: boolean, nextStateTime: string | undefined) {
    return light
      ? `o ${nextStateTime}`
      : `з ${format(subHours(toDate(parse(nextStateTime || '00:00', 'HH:mm', new Date())), 3), 'H:mm')} до ${nextStateTime}`;
  }
}
