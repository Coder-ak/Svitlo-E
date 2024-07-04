import { SvitloData } from '../interfaces/svitlo-data';
import PullToRefresh from 'pulltorefreshjs';
import { SvitloUtils } from './utils';

export class Svitlo {
  private static readonly diffUpdateInterval = 1000; // 1 sec

  private svitloData: SvitloData;
  private prevState: boolean;
  private timerId: ReturnType<typeof setInterval> | undefined;
  private getCurrentStateDebounced = SvitloUtils.debounce_leading(async () => await this.getCurrentState());
  private startDiffTimerDebounced = SvitloUtils.debounce_leading(() => this.startDiffTimer());

  constructor() {
    this.onInit();
    this.pullToRefresh();
  }

  private async onInit(): Promise<void> {
    await this.getCurrentState();

    this.addEventListeners();
    this.displayDiffTimer();
    this.startDiffTimerDebounced();
  }

  private addEventListeners(): void {
    window.addEventListener('blur', () => {
      this.stopDiffTimer();
    });
    window.addEventListener('focus', () => {
      this.getCurrentStateDebounced();
      this.startDiffTimerDebounced();
    });
  }

  private async getCurrentState(): Promise<void> {
    const response = await this.getLightData('/light/rad0');

    try {
      this.svitloData = await response.json();
      this.displayStatus();
      this.displaySchedule();
    } catch {
      this.errorHandler('Дані відсутні');
    }
  }

  private startDiffTimer() {
    this.stopDiffTimer();
    this.timerId = setInterval(this.displayDiffTimer.bind(this), Svitlo.diffUpdateInterval);
  }

  private stopDiffTimer(): void {
    clearInterval(this.timerId);
  }

  private displayDiffTimer() {
    const { light, timestamp }: SvitloData = this.svitloData;
    const textDiff = `Світло ${light ? 'є' : 'відсутнє'} ${SvitloUtils.formatDuration(timestamp, new Date().getTime())}`;
    document.getElementById('vidkl')!.innerText = textDiff;
  }

  private displayStatus(): void {
    const { light, timestamp } = this.svitloData;

    if (this.prevState !== light) {
      this.prevState = light;

      const textShort = SvitloUtils.getStatus(light).charAt(0).toUpperCase() + SvitloUtils.getStatus(light).slice(1);
      const supDate = SvitloUtils.isToday(timestamp) ? '' : `<sup>(${SvitloUtils.formatDate(timestamp, 'd/MM')})</sup>`;
      const textFull = `З ${SvitloUtils.formatDate(timestamp, 'HH:mm')}${supDate} ${SvitloUtils.getStatus(light)}`;

      document.getElementById('status')!.innerHTML = textFull;
      // eslint-disable-next-line no-undef
      (<HTMLImageElement>document.getElementById('lamp-logo')).src = `assets/lamp_${SvitloUtils.getState(light)}.svg`;

      document.title = textShort;

      // get statistics on status change
      this.stats();
    }
  }

  private displaySchedule(): void {
    const { light, nextStateTime } = this.svitloData;

    document.getElementById('schedule')!.innerHTML =
      `Наступне ${light ? 'відключення' : 'включення'} можливо ${SvitloUtils.nextState(light, nextStateTime)}`;
  }

  private pullToRefresh(): void {
    PullToRefresh.init({
      mainElement: 'body',
      distMax: 114,
      distThreshold: 80,
      distReload: 94,
      instructionsPullToRefresh: 'Потягніть вниз, щоб оновити',
      instructionsReleaseToRefresh: 'Відпустіть, щоб оновити',
      instructionsRefreshing: 'Оновлюється',
      onRefresh() {
        window.location.reload();
      },
    });
  }

  private async getLightData(endpoint: string): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(endpoint);
    } catch {
      this.errorHandler();
    }
    if (!response.ok) {
      this.errorHandler();
    }

    return response;
  }

  private errorHandler(message?: string): never {
    const errorEl = document.getElementById('error');
    errorEl!.style.display = 'flex';
    errorEl!.innerHTML = `<div class="error-message"><b>!</b>${message || 'Виникла помилка. Спробуйте оновити сторінку.'}</div>`;
    throw new Error('Something went badly wrong!');
  }

  private async stats() {
    const response = await this.getLightData('/light/all/rad0?limit=10');
    const data: SvitloData[] = await response.json();

    const table = data.map((item, index) => {
      // don't show last entry to display correct duration for previous entry
      if (index === data.length - 1) {
        return;
      }
      return `<div class="row ${SvitloUtils.getState(item.light)}">
        <img src="assets/lamp_${SvitloUtils.getState(item.light)}.svg" title="${item.light ? 'Увімкнено' : 'Вимкнено'}" class="icon"/> 
        <div class="time">${SvitloUtils.formatDate(item.timestamp, 'EEE, dd MMM, HH:mm')}</div> 
        <div class="diff ${SvitloUtils.getState(!item.light)}">${SvitloUtils.formatDuration(item.timestamp, data[index + 1]?.timestamp || item.timestamp)}</div></div>`;
    });

    document.getElementById('stats')!.innerHTML = table.join('\n');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new Svitlo();
});
