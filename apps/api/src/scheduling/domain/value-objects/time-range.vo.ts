export class TimeRange {
  readonly startMinutes: number;
  readonly endMinutes: number;

  constructor(
    readonly startTime: string,
    readonly endTime: string,
  ) {
    this.startMinutes = TimeRange.parseToMinutes(startTime);
    this.endMinutes = TimeRange.parseToMinutes(endTime);
  }

  static parseToMinutes(timeStr: string): number {
    if (!timeStr) return 0;
    const parts = timeStr.split(':');
    const hours = parseInt(parts[0], 10) || 0;
    const minutes = parseInt(parts[1], 10) || 0;
    return hours * 60 + minutes;
  }

  static fromMinutes(startMinutes: number, endMinutes: number): TimeRange {
    const format = (m: number) => {
      const hrs = Math.floor(m / 60)
        .toString()
        .padStart(2, '0');
      const mins = (m % 60).toString().padStart(2, '0');
      return `${hrs}:${mins}`;
    };
    return new TimeRange(format(startMinutes), format(endMinutes));
  }

  isValid(): boolean {
    return this.startMinutes < this.endMinutes;
  }

  durationMinutes(): number {
    return Math.max(0, this.endMinutes - this.startMinutes);
  }

  overlaps(other: TimeRange): boolean {
    // Two intervals [A, B) and [C, D) overlap if max(A, C) < min(B, D)
    return Math.max(this.startMinutes, other.startMinutes) < Math.min(this.endMinutes, other.endMinutes);
  }

  isContainedIn(other: TimeRange): boolean {
    return this.startMinutes >= other.startMinutes && this.endMinutes <= other.endMinutes;
  }

  toString(): string {
    return `${this.startTime}-${this.endTime}`;
  }
}
