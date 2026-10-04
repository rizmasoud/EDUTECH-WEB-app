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
}

export interface Teacher {
  id: string;
  accountId: string | null;
  firstName: string;
  lastName: string;
  baseRate?: string;
  isActive: boolean;
}

export interface ClassItem {
  id: string;
  academicTermId: string;
  bookId: string;
  bookSegmentId: string | null;
  teacherId: string | null;
  className: string;
  classType: 'REGULAR' | 'PRIVATE';
  status: 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  capacity: number;
  enrolledCount?: number;
  schedules?: Schedule[];
  book?: {
    id: string;
    name: string;
    level: string;
  };
  teacher?: {
    id: string;
    firstName: string;
    lastName: string;
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
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isValid: boolean;
  conflicts: Array<{
    code: string;
    explanation: string;
    conflictingEntityId?: string;
  }>;
  score?: number;
}

export interface ProposalData {
  academicTermId?: string;
  allowFriday: boolean;
  generatedAt: string;
  totalClasses: number;
  validClassesCount: number;
  invalidClassesCount: number;
  classes: ProposedClassSlot[];
}

export interface SchedulingProposal {
  id: string;
  academicTermId: string | null;
  status: 'DRAFT' | 'PENDING_REVIEW' | 'ACCEPTED' | 'MODIFIED' | 'REJECTED';
  data: ProposalData;
  rejectionReason?: string | null;
  createdAt: string;
  updatedAt: string;
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

    return body?.data !== undefined ? body.data : body;
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
  async getAcademicTerms(): Promise<AcademicTerm[]> {
    const res = await this.request<any>('/academic-terms?pageSize=50');
    return Array.isArray(res) ? res : res?.items || [];
  }

  // Teachers
  async getTeachers(): Promise<Teacher[]> {
    const res = await this.request<any>('/teachers?pageSize=100');
    return Array.isArray(res) ? res : res?.items || [];
  }

  // Classes
  async getClasses(filter: { academicTermId?: string; teacherId?: string } = {}): Promise<ClassItem[]> {
    const params = new URLSearchParams();
    if (filter.academicTermId) params.set('academicTermId', filter.academicTermId);
    if (filter.teacherId) params.set('teacherId', filter.teacherId);
    params.set('pageSize', '100');

    const res = await this.request<any>(`/classes?${params.toString()}`);
    return Array.isArray(res) ? res : res?.items || [];
  }

  async getClassById(id: string): Promise<ClassItem> {
    return this.request<ClassItem>(`/classes/${id}`);
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
    isValid: boolean;
    conflicts: any[];
    classes: ProposedClassSlot[];
    validatedAt: string;
  }> {
    return this.request(`/scheduling/proposals/${id}/validate`, {
      method: 'POST',
    });
  }

  async acceptProposal(id: string): Promise<{
    proposalId: string;
    status: string;
    acceptedAt: string;
    acceptedBy: string;
    createdSchedulesCount: number;
    deletedSchedulesCount?: number;
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
