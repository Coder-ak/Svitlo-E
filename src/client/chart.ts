import { startOfDay, min, max, addDays, format, setHours, startOfHour, isEqual, addHours, isWithinInterval, subDays } from 'date-fns';
import { SvitloData } from 'src/interfaces/svitlo-data';

export class Chart {
  constructor() {
    this.onInit();
  }

  private async onInit(): Promise<void> {
    const response = await fetch('/light/all?limit=132');
    const data = await response.json();
    this.createChart(data);
  }

  private createChart(data: SvitloData[]) {
    const chart = document.getElementById('chart') as HTMLTableElement;
    if (!chart) return;

    const header = chart.insertRow();
    header.insertCell(); // Empty cell for row headers

    // Create header row with hours
    for (let i = 0; i < 24; i++) {
      const cell = header.insertCell();
      cell.textContent = i.toString();
    }

    // Sort data by timestamp
    data.sort((a, b) => b.timestamp - a.timestamp);

    // Find the earliest and latest dates
    const dates = data.map((item) => startOfDay(item.timestamp));
    const minDate = min(dates);
    const maxDate = max(dates);

    // Create rows for each day
    for (let d = maxDate; d >= minDate; d = subDays(d, 1)) {
      const row = chart.insertRow();
      const dateCell = row.insertCell();
      dateCell.textContent = format(d, 'EEE, dd/MM');

      let isEventActive = false;

      for (let h = 0; h < 24; h++) {
        const cell = row.insertCell();
        const cellStartTime = setHours(d, h);
        const cellEndTime = addHours(cellStartTime, 1);

        // Check for events in this hour
        data.forEach((item) => {
          const itemTime = new Date(item.timestamp);
          if (isWithinInterval(itemTime, { start: cellStartTime, end: cellEndTime })) {
            if (!item.light) {
              isEventActive = true;
            } else if (item.light && isEventActive) {
              isEventActive = false;
            }
          }
        });

        if (isEventActive) {
          cell.classList.add('filled');
        }
      }
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new Chart();
});
