import { format, setHours, isWithinInterval, roundToNearestMinutes, addMinutes, endOfHour } from 'date-fns';
import { SvitloData } from 'src/interfaces/svitlo-data';

interface IntervalData {
  startTime: Date;
  endTime: Date;
  light: boolean;
}

export class Chart {
  constructor() {
    this.onInit();
  }

  private async onInit(): Promise<void> {
    const response = await fetch('/light/all?limit=132');
    const data = await response.json();
    this.createChart(this.createIntervals(data));
  }

  private createChart(data: IntervalData[]) {
    const chart = document.getElementById('chart') as HTMLTableElement;
    if (!chart) return;

    // Clear existing content
    chart.innerHTML = '';

    // Create header row with hours and 'Σ' for total
    const header = chart.createTHead().insertRow();
    header.appendChild(document.createElement('th')); // Empty cell for row headers

    for (let i = 0; i < 24; i++) {
      const th = document.createElement('th');
      th.textContent = i.toString();
      header.appendChild(th);
    }

    const totalHeader = document.createElement('th');
    totalHeader.textContent = 'Σ'; // Using Sigma symbol for sum
    header.appendChild(totalHeader);

    // Group intervals by day
    const groupedData: Record<string, IntervalData[]> = {};
    data.forEach((item) => {
      const dayKey = format(item.startTime, 'EEE, dd/MM');
      const dataKeyEnd = format(item.endTime, 'EEE, dd/MM');
      if (!groupedData[dayKey]) {
        groupedData[dayKey] = [];
      }

      if (dataKeyEnd !== dayKey) {
        if (!groupedData[dataKeyEnd]) {
          groupedData[dataKeyEnd] = [];
        }
        groupedData[dataKeyEnd].push(item);
      }

      groupedData[dayKey].push(item);
    });

    // Sort and process each day
    Object.keys(groupedData).forEach((dayKey) => {
      const dayData = groupedData[dayKey];

      // Create a row for the day
      const row = chart.insertRow();
      const dateCell = row.insertCell();
      dateCell.textContent = dayKey;

      // Track total hours with light: false
      let totalFalseHours = 0;

      // Fill cells for each hour
      for (let hour = 0; hour < 24; hour++) {
        const currentHour = setHours(dayData[0].startTime, hour);

        // Check for events within the current hour
        const isLightOff = dayData.some((item) => {
          return isWithinInterval(currentHour, { start: item.startTime, end: item.endTime }) && !item.light;
        });

        if (isLightOff) {
          totalFalseHours++;
        }

        const cell = row.insertCell();
        isLightOff && cell.classList.add('filled');
      }

      // Fill in the total column
      const totalCell = row.insertCell();
      totalCell.textContent = totalFalseHours.toString();
    });
  }

  private createIntervals(data: SvitloData[]): IntervalData[] {
    const intervals: IntervalData[] = [];

    // Sort data by timestamp in ascending order
    data.sort((a, b) => a.timestamp - b.timestamp);

    for (let i = 0; i < data.length; i++) {
      const current = data[i];
      const startTime = new Date(current.timestamp);
      const endTime = i < data.length - 1 ? new Date(data[i + 1].timestamp) : endOfHour(new Date());

      intervals.push({
        startTime: addMinutes(roundToNearestMinutes(startTime, { nearestTo: 20 }), 1),
        endTime: addMinutes(roundToNearestMinutes(endTime, { nearestTo: 20 }), -1),
        light: current.light,
      });
    }

    return intervals;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new Chart();
});
