import {
  startOfDay,
  min,
  max,
  addDays,
  format,
  setHours,
  startOfHour,
  isEqual,
  addHours,
  isWithinInterval,
  subDays,
  isAfter,
} from 'date-fns';
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

    const header = chart.createTHead().insertRow();

    // Empty cell for row headers
    header.appendChild(document.createElement('th'));

    // Create header row with hours
    for (let i = 0; i < 24; i++) {
      const th = document.createElement('th');
      th.textContent = i.toString();
      header.appendChild(th);
    }

    // Add Total header
    const totalHeader = document.createElement('th');
    totalHeader.textContent = 'Σ'; // Using Sigma symbol for sum
    header.appendChild(totalHeader);

    const currentTime = new Date();

    // Sort data by timestamp in descending order
    data.sort((a, b) => b.timestamp - a.timestamp);

    // Find the earliest and latest dates
    const dates = data.map((item) => startOfDay(new Date(item.timestamp)));
    const minDate = min(dates);
    const maxDate = max(dates);

    // Create rows for each day
    for (let d = maxDate; d >= minDate; d = subDays(d, 1)) {
      const row = chart.insertRow();
      const dateCell = row.insertCell();
      dateCell.textContent = format(d, 'EEE, dd/MM');

      let isEventActive = false;
      let filledCellCount = 0;

      for (let h = 0; h < 24; h++) {
        const cell = row.insertCell();
        const cellStartTime = setHours(d, h);
        const cellEndTime = addHours(cellStartTime, 1);

        // Check if we've reached the current time
        if (isAfter(cellStartTime, currentTime)) {
          break; // Stop filling cells after current time
        }

        // Check for events in this hour
        data.forEach((item) => {
          const itemTime = new Date(item.timestamp);
          if (isWithinInterval(itemTime, { start: cellStartTime, end: cellEndTime })) {
            if (!item.light) {
              isEventActive = true;
            } else {
              isEventActive = false;
            }
          }
        });

        if (isEventActive) {
          cell.classList.add('filled');
          filledCellCount++;
        }
      }

      // Fill remaining cells in the row up to 24 hours
      while (row.cells.length < 25) {
        // 25 because we have a date cell at the start
        row.insertCell();
      }

      // Add Total cell
      const totalCell = row.insertCell();
      totalCell.textContent = filledCellCount.toString();
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new Chart();
});
