/** When tomorrow starts, local time (ms). Anything dated from then on is "after today". */
export function startOfTomorrow(today: Date): number {
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).getTime();
}

/** Whether an ISO date falls after today: tomorrow or later, local time. */
export function isAfterToday(date: string, today: Date): boolean {
  return new Date(date).getTime() >= startOfTomorrow(today);
}
