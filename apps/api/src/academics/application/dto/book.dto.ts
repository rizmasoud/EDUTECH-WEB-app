export interface CreateBookInput {
  name: string;
  level: string;
  sequenceOrder: number;
  sessionCount: number;
  isTerminal?: boolean;
  isActive?: boolean;
}

export interface UpdateBookInput {
  name?: string;
  level?: string;
  sequenceOrder?: number;
  sessionCount?: number;
  isTerminal?: boolean;
  isActive?: boolean;
}

export interface QueryBooksInput {
  isActive?: boolean | string;
  level?: string;
  search?: string;
  page?: number | string;
  pageSize?: number | string;
}

export interface BookResponseDto {
  id: string;
  name: string;
  level: string;
  sequenceOrder: number;
  sessionCount: number;
  isTerminal: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
