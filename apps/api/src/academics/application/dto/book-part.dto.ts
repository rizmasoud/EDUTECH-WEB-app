export interface CreateBookPartInput {
  name: string;
  sequenceOrder: number;
}

export interface UpdateBookPartInput {
  name?: string;
  sequenceOrder?: number;
}

export interface BookPartResponseDto {
  id: string;
  bookId: string;
  name: string;
  sequenceOrder: number;
  createdAt: Date;
  updatedAt: Date;
}
