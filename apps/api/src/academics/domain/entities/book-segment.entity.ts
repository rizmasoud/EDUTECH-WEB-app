export class BookSegment {
  constructor(
    public readonly id: string,
    public readonly bookPartId: string,
    public readonly name: string,
    public readonly sequenceOrder: number,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  static validateInvariants(sequenceOrder: number): void {
    if (sequenceOrder < 0) {
      throw new Error('sequenceOrder must be non-negative');
    }
  }
}
