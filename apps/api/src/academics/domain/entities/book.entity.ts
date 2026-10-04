export class Book {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly level: string,
    public readonly sequenceOrder: number,
    public readonly sessionCount: number,
    public readonly isTerminal: boolean,
    public readonly isActive: boolean,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  static validateInvariants(sequenceOrder: number, sessionCount: number): void {
    if (sequenceOrder < 0) {
      throw new Error('sequenceOrder must be non-negative');
    }
    if (sessionCount <= 0) {
      throw new Error('sessionCount must be greater than zero');
    }
  }
}
