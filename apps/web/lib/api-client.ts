/**
 * API Client for EduTech Web
 * Talks to the backend via Next.js proxy route /api/v1
 */

export interface ApiResponse<T = any> {
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
    statusCode?: number;
  };
}

export interface UserAccount {
  id: string;
  personnelCode: string;
  isActive: boolean;
  roles: string[];
  teacherId?: string | null;
}

export interface AcademicTerm {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: 'PLANNED' | 'ACTIVE' | 'CLOSED';
  createdAt?: string;
  updatedAt?: string;
}

export interface BookItem {
  id: string;
  name: string;
  level: string;
  sequenceOrder: number;
  sessionCount: number;
  isTerminal: boolean;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface BookPartItem {
  id: string;
  bookId: string;
  name: string;
  sequenceOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface BookSegmentItem {
  id: string;
  bookPartId: string;
  name: string;
  sequenceOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface StudentItem {
  id: string;
  firstName: string;
  lastName: string;
  shahvarCode: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Teacher {
  id: string;
  accountId: string | null;
  firstName: string;
  lastName: string;
  baseRate?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface TeacherSkillItem {
  id: string;
  teacherId: string;
  bookId: string;
  createdAt?: string;
  book?: {
    id: string;
    name: string;
    level: string;
  };
}

export interface ClassItem {
  id: string;
  academicTermId: string;
  bookId: string;
  bookSegmentId: string | null;
  teacherId: string | null;
  className: string | null;
  classType: 'REGULAR' | 'PRIVATE';
  status: 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  capacity: number;
  color?: string | null;
  enrolledCount?: number;
  schedules?: Schedule[];
  book?: {
    id: string;
    name: string;
    level: string;
  };
  bookSegment?: {
    id: string;
    name: string;
  };
  teacher?: {
    id: string;
    firstName: string;
    lastName: string;
  };
  academicTerm?: {
    id: string;
    name: string;
    status: string;
  };
}

export interface EnrollmentItem {
  id: string;
  classId: string;
  studentId: string;
  status: 'ACTIVE' | 'COMPLETED' | 'WITHDRAWN';
  joinedAt: string;
  leftAt: string | null;
  student?: {
    id: string;
    firstName: string;
    lastName: string;
    shahvarCode?: string | null;
  };
  class?: {
    id: string;
    className: string | null;
  };
}

export interface Schedule {
  id: string;
  classId: string;
  dayOfWeek: number; // 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  startsOn: string | null;
  endsOn: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProposedClassSlot {
  classId: string;
  teacherId?: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isValid: boolean;
  score?: number;
  hardConstraintReports?: any[];
  preferenceReports?: any[];
  conflicts: Array<{
    code: string;
    message?: string;
    explanation?: string;
    severity?: string;
    classId?: string;
    teacherId?: string | null;
    studentId?: string | null;
    dayOfWeek?: number;
    startTime?: string;
    endTime?: string;
    conflictingEntityId?: string;
    details?: Record<string, any>;
  }>;
}

export interface ProposalData {
  classes: ProposedClassSlot[];
  conflicts: Array<{
    code: string;
    message?: string;
    explanation?: string;
    severity?: string;
    classId?: string;
    teacherId?: string | null;
    studentId?: string | null;
    dayOfWeek?: number;
    startTime?: string;
    endTime?: string;
    conflictingEntityId?: string;
    details?: Record<string, any>;
  }>;
  preferences?: Array<{
    preferenceName: string;
    applied: boolean;
    scoreContribution: number;
    reason?: string;
  }>;
  explanations?: string[];
  evaluatedClassCount: number;
  validClassCount: number;
  // Optional / backward-compatible properties
  academicTermId?: string;
  allowFriday?: boolean;
  generatedAt?: string;
  totalClasses?: number;
  validClassesCount?: number;
  invalidClassesCount?: number;
}

export interface SchedulingProposal {
  id: string;
  academicTermId: string | null;
  createdBy?: string | null;
  status: 'DRAFT' | 'PENDING_REVIEW' | 'ACCEPTED' | 'MODIFIED' | 'REJECTED';
  data: ProposalData;
  rejectionReason?: string | null;
  createdAt: string;
  updatedAt: string;
  acceptedAt?: string | null;
  rejectedAt?: string | null;
}

/**
 * Distinguishes generic transport envelopes (e.g. ApiSuccessResponse<{ account: ... }>
 * which wrap payloads solely inside `{ data: T }`) from domain entities/DTOs that
 * legitimately carry their own `data` property (e.g. SchedulingProposalDto with id, status, data).
 */
export function isGenericApiEnvelope<T = unknown>(value: unknown): value is { data: T } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (!('data' in record) || record.data === undefined) {
    return false;
  }
  // If the object carries domain entity properties such as an 'id', 'status', or 'proposalId',
  // it is a domain entity or DTO with legitimate attributes, NOT a transport wrapper.
  if ('id' in record || 'status' in record || 'proposalId' in record) {
    return false;
  }
  // Standard generic envelopes only wrap data (with optional meta/message/pagination keys)
  const allowedEnvelopeKeys = new Set(['data', 'meta', 'message']);
  return Object.keys(record).every((key) => allowedEnvelopeKeys.has(key));
}

class ApiClient {
  private customToken: string | null = null;

  setAuthToken(token: string | null) {
    this.customToken = token;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = endpoint.startsWith('http') ? endpoint : `/api/v1${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (this.customToken) {
      headers['Authorization'] = `Bearer ${this.customToken}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include', // for HttpOnly session cookie
    });

    const text = await response.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { message: text };
    }

    if (!response.ok) {
      const err = new Error(body?.message || body?.error?.message || `Request failed with status ${response.status}`);
      (err as any).statusCode = response.status;
      (err as any).code = body?.code || body?.error?.code || 'API_ERROR';
      (err as any).details = body?.details || body?.error?.details || body;
      throw err;
    }

    // Only unwrap generic transport envelopes ({ data: T }), preserving domain entities that have a `data` attribute
    if (isGenericApiEnvelope<T>(body)) {
      return body.data;
    }

    return body;
  }

  // Auth APIs
  async login(personnelCode: string, password: string):Promise<{ account: UserAccount; rawToken?: string }> {
    const res = await this.request<any>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ personnelCode, password }),
    });
    return res;
  }

  async getMe(): Promise<UserAccount> {
    return this.request<UserAccount>('/auth/me');
  }

  async logout(): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>('/auth/logout', {
      method: 'POST',
    });
  }

  // Academic Terms
  async getAcademicTerms(query: { status?: string; search?: string; page?: number; pageSize?: number } = {}): Promise<AcademicTerm[]> {
    const params = new URLSearchParams();
    if (query.status) params.set('status', query.status);
    if (query.search) params.set('search', query.search);
    if (query.page) params.set('page', query.page.toString());
    params.set('pageSize', (query.pageSize || 50).toString());

    const res = await this.request<any>(`/academic-terms?${params.toString()}`);
    return Array.isArray(res) ? res : res?.items || [];
  }

  async getAcademicTermById(id: string): Promise<AcademicTerm> {
    return this.request<AcademicTerm>(`/academic-terms/${id}`);
  }

  async createAcademicTerm(data: { name: string; startDate: string; endDate: string; status?: 'PLANNED' | 'ACTIVE' | 'CLOSED' }): Promise<AcademicTerm> {
    return this.request<AcademicTerm>('/academic-terms', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateAcademicTerm(id: string, data: { name?: string; startDate?: string; endDate?: string }): Promise<AcademicTerm> {
    return this.request<AcademicTerm>(`/academic-terms/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async activateAcademicTerm(id: string): Promise<AcademicTerm> {
    return this.request<AcademicTerm>(`/academic-terms/${id}/activate`, {
      method: 'POST',
    });
  }

  async closeAcademicTerm(id: string): Promise<AcademicTerm> {
    return this.request<AcademicTerm>(`/academic-terms/${id}/close`, {
      method: 'POST',
    });
  }

  // Books, Parts and Segments
  async getBooks(query: { search?: string; page?: number; pageSize?: number } = {}): Promise<BookItem[]> {
    const params = new URLSearchParams();
    if (query.search) params.set('search', query.search);
    if (query.page) params.set('page', query.page.toString());
    params.set('pageSize', (query.pageSize || 100).toString());

    const res = await this.request<any>(`/books?${params.toString()}`);
    return Array.isArray(res) ? res : res?.items || [];
  }

  async getBookById(id: string): Promise<BookItem> {
    return this.request<BookItem>(`/books/${id}`);
  }

  async createBook(data: { name: string; level: string; sequenceOrder: number; sessionCount: number; isTerminal?: boolean; isActive?: boolean }): Promise<BookItem> {
    return this.request<BookItem>('/books', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateBook(id: string, data: { name?: string; level?: string; sequenceOrder?: number; sessionCount?: number; isTerminal?: boolean; isActive?: boolean }): Promise<BookItem> {
    return this.request<BookItem>(`/books/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async getBookParts(bookId: string): Promise<BookPartItem[]> {
    const res = await this.request<any>(`/books/${bookId}/parts`);
    return Array.isArray(res) ? res : res?.items || [];
  }

  async createBookPart(bookId: string, data: { name: string; sequenceOrder: number }): Promise<BookPartItem> {
    return this.request<BookPartItem>(`/books/${bookId}/parts`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateBookPart(partId: string, data: { name?: string; sequenceOrder?: number }): Promise<BookPartItem> {
    return this.request<BookPartItem>(`/book-parts/${partId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async getBookSegments(partId: string): Promise<BookSegmentItem[]> {
    const res = await this.request<any>(`/book-parts/${partId}/segments`);
    return Array.isArray(res) ? res : res?.items || [];
  }

  async createBookSegment(partId: string, data: { name: string; sequenceOrder: number }): Promise<BookSegmentItem> {
    return this.request<BookSegmentItem>(`/book-parts/${partId}/segments`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateBookSegment(segmentId: string, data: { name?: string; sequenceOrder?: number }): Promise<BookSegmentItem> {
    return this.request<BookSegmentItem>(`/book-segments/${segmentId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  // Students
  async getStudents(query: { search?: string; isActive?: boolean; page?: number; pageSize?: number } = {}): Promise<{ items: StudentItem[]; total: number }> {
    const params = new URLSearchParams();
    if (query.search) params.set('search', query.search);
    if (query.isActive !== undefined) params.set('isActive', String(query.isActive));
    if (query.page) params.set('page', query.page.toString());
    params.set('pageSize', (query.pageSize || 50).toString());

    const res = await this.request<any>(`/students?${params.toString()}`);
    if (Array.isArray(res)) {
      return { items: res, total: res.length };
    }
    return { items: res?.items || [], total: res?.total || 0 };
  }

  async getStudentById(id: string): Promise<StudentItem> {
    return this.request<StudentItem>(`/students/${id}`);
  }

  async createStudent(data: { firstName: string; lastName: string; shahvarCode?: string | null; isActive?: boolean }): Promise<StudentItem> {
    return this.request<StudentItem>('/students', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateStudent(id: string, data: { firstName?: string; lastName?: string; shahvarCode?: string | null; isActive?: boolean }): Promise<StudentItem> {
    return this.request<StudentItem>(`/students/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async getStudentEnrollments(studentId: string): Promise<EnrollmentItem[]> {
    const res = await this.request<any>(`/students/${studentId}/enrollments`);
    return Array.isArray(res) ? res : res?.items || [];
  }

  // Teachers
  async getTeachers(query: { search?: string; isActive?: boolean; page?: number; pageSize?: number } = {}): Promise<{ items: Teacher[]; total: number }> {
    const params = new URLSearchParams();
    if (query.search) params.set('search', query.search);
    if (query.isActive !== undefined) params.set('isActive', String(query.isActive));
    if (query.page) params.set('page', query.page.toString());
    params.set('pageSize', (query.pageSize || 100).toString());

    const res = await this.request<any>(`/teachers?${params.toString()}`);
    if (Array.isArray(res)) {
      return { items: res, total: res.length };
    }
    return { items: res?.items || [], total: res?.total || 0 };
  }

  async getTeacherById(id: string): Promise<Teacher> {
    return this.request<Teacher>(`/teachers/${id}`);
  }

  async createTeacher(data: { firstName: string; lastName: string; baseRate?: string; isActive?: boolean; accountId?: string | null }): Promise<Teacher> {
    return this.request<Teacher>('/teachers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateTeacher(id: string, data: { firstName?: string; lastName?: string; baseRate?: string; isActive?: boolean }): Promise<Teacher> {
    return this.request<Teacher>(`/teachers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async getTeacherSkills(teacherId: string): Promise<TeacherSkillItem[]> {
    const res = await this.request<any>(`/teachers/${teacherId}/skills`);
    return Array.isArray(res) ? res : res?.items || [];
  }

  async addTeacherSkill(teacherId: string, data: { bookId: string }): Promise<TeacherSkillItem> {
    return this.request<TeacherSkillItem>(`/teachers/${teacherId}/skills`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteTeacherSkill(teacherId: string, skillId: string): Promise<void> {
    return this.request<void>(`/teachers/${teacherId}/skills/${skillId}`, {
      method: 'DELETE',
    });
  }

  // Classes
  async getClasses(filter: { academicTermId?: string; teacherId?: string; bookId?: string; status?: string; page?: number; pageSize?: number } = {}): Promise<ClassItem[]> {
    const params = new URLSearchParams();
    if (filter.academicTermId) params.set('academicTermId', filter.academicTermId);
    if (filter.teacherId) params.set('teacherId', filter.teacherId);
    if (filter.bookId) params.set('bookId', filter.bookId);
    if (filter.status) params.set('status', filter.status);
    if (filter.page) params.set('page', filter.page.toString());
    params.set('pageSize', (filter.pageSize || 100).toString());

    const res = await this.request<any>(`/classes?${params.toString()}`);
    return Array.isArray(res) ? res : res?.items || [];
  }

  async getClassById(id: string): Promise<ClassItem> {
    return this.request<ClassItem>(`/classes/${id}`);
  }

  async createClass(data: {
    academicTermId: string;
    bookId: string;
    bookSegmentId?: string | null;
    teacherId?: string | null;
    className?: string | null;
    classType?: 'REGULAR' | 'PRIVATE';
    status?: 'DRAFT' | 'ACTIVE';
    capacity?: number;
    color?: string | null;
  }): Promise<ClassItem> {
    return this.request<ClassItem>('/classes', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateClass(
    id: string,
    data: {
      bookSegmentId?: string | null;
      teacherId?: string | null;
      className?: string | null;
      classType?: 'REGULAR' | 'PRIVATE';
      status?: 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
      capacity?: number;
      color?: string | null;
    },
  ): Promise<ClassItem> {
    return this.request<ClassItem>(`/classes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async activateClass(id: string): Promise<ClassItem> {
    return this.request<ClassItem>(`/classes/${id}/activate`, {
      method: 'POST',
    });
  }

  async completeClass(id: string): Promise<ClassItem> {
    return this.request<ClassItem>(`/classes/${id}/complete`, {
      method: 'POST',
    });
  }

  async cancelClass(id: string): Promise<ClassItem> {
    return this.request<ClassItem>(`/classes/${id}/cancel`, {
      method: 'POST',
    });
  }

  // Class Enrollments
  async getClassEnrollments(classId: string, query: { status?: string; page?: number; pageSize?: number } = {}): Promise<{ items: EnrollmentItem[]; total: number }> {
    const params = new URLSearchParams();
    if (query.status) params.set('status', query.status);
    if (query.page) params.set('page', query.page.toString());
    params.set('pageSize', (query.pageSize || 50).toString());

    const res = await this.request<any>(`/classes/${classId}/enrollments?${params.toString()}`);
    if (Array.isArray(res)) {
      return { items: res, total: res.length };
    }
    return { items: res?.items || [], total: res?.total || 0 };
  }

  async createEnrollment(classId: string, data: { studentId: string; status?: 'ACTIVE' }): Promise<EnrollmentItem> {
    return this.request<EnrollmentItem>(`/classes/${classId}/enrollments`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async withdrawEnrollment(enrollmentId: string): Promise<EnrollmentItem> {
    return this.request<EnrollmentItem>(`/enrollments/${enrollmentId}/withdraw`, {
      method: 'POST',
    });
  }

  async completeEnrollment(enrollmentId: string): Promise<EnrollmentItem> {
    return this.request<EnrollmentItem>(`/enrollments/${enrollmentId}/complete`, {
      method: 'POST',
    });
  }

  // Schedules
  async getSchedules(filter: { classId?: string; teacherId?: string; dayOfWeek?: number } = {}): Promise<Schedule[]> {
    const params = new URLSearchParams();
    if (filter.classId) params.set('classId', filter.classId);
    if (filter.teacherId) params.set('teacherId', filter.teacherId);
    if (filter.dayOfWeek !== undefined) params.set('dayOfWeek', filter.dayOfWeek.toString());

    return this.request<Schedule[]>(`/schedules?${params.toString()}`);
  }

  async createSchedule(data: {
    classId: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    startsOn?: string | null;
    endsOn?: string | null;
  }): Promise<Schedule> {
    return this.request<Schedule>('/schedules', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateSchedule(
    id: string,
    data: {
      dayOfWeek?: number;
      startTime?: string;
      endTime?: string;
      startsOn?: string | null;
      endsOn?: string | null;
    },
  ): Promise<Schedule> {
    return this.request<Schedule>(`/schedules/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteSchedule(id: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/schedules/${id}`, {
      method: 'DELETE',
    });
  }

  // Scheduling Proposals
  async getProposals(filter: { academicTermId?: string; status?: string } = {}): Promise<SchedulingProposal[]> {
    const params = new URLSearchParams();
    if (filter.academicTermId) params.set('academicTermId', filter.academicTermId);
    if (filter.status) params.set('status', filter.status);
    params.set('pageSize', '20');

    const res = await this.request<any>(`/scheduling/proposals?${params.toString()}`);
    return Array.isArray(res) ? res : res?.items || [];
  }

  async getProposalById(id: string): Promise<SchedulingProposal> {
    return this.request<SchedulingProposal>(`/scheduling/proposals/${id}`);
  }

  async generateProposal(data: {
    academicTermId?: string;
    classIds?: string[];
    allowFriday?: boolean;
  }): Promise<SchedulingProposal> {
    return this.request<SchedulingProposal>('/scheduling/proposals', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async validateProposal(id: string): Promise<{
    proposalId: string;
    status: string;
    isStillValid: boolean;
    conflicts: any[];
    data: ProposalData;
  }> {
    return this.request(`/scheduling/proposals/${id}/validate`, {
      method: 'POST',
    });
  }

  async acceptProposal(id: string): Promise<{
    proposalId: string;
    status: string;
    committedSchedulesCount: number;
    scheduleIds: string[];
    acceptedAt: string;
  }> {
    return this.request(`/scheduling/proposals/${id}/accept`, {
      method: 'POST',
    });
  }

  async rejectProposal(id: string): Promise<SchedulingProposal> {
    return this.request<SchedulingProposal>(`/scheduling/proposals/${id}/reject`, {
      method: 'POST',
    });
  }

  async modifyProposal(
    id: string,
    data: {
      classId?: string;
      dayOfWeek?: number;
      startTime?: string;
      endTime?: string;
      classes?: ProposedClassSlot[];
    },
  ): Promise<SchedulingProposal> {
    return this.request<SchedulingProposal>(`/scheduling/proposals/${id}/modify`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
}

export const apiClient = new ApiClient();
