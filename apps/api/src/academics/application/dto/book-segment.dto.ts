export interface CreateBookSegmentInput {
  name: string;
  sequenceOrder: number;
}

export interface UpdateBookSegmentInput {
  name?: string;
  sequenceOrder?: number;
}

export interface BookSegmentResponseDto {
  id: string;
  bookPartId: string;
  name: string;
  sequenceOrder: number;
  createdAt: Date;
  updatedAt: Date;
}
