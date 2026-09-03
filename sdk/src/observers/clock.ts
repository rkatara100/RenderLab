
export function toWallClockMs(startTime: number): number {
  return performance.timeOrigin + startTime;
}
