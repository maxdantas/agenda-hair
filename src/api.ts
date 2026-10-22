import type {
  Appointment,
  AuthUser,
  Client,
  CompanySettings,
  ConflictCheckResult,
  FinancialPeriod,
  FinancialReport,
  LoginResponse,
  NotificationLog,
  PayableAccount,
  PayableRecurrence,
  Product,
  Professional,
  SaasAdminOverview,
  ServiceItem,
} from '../shared/types';

const TOKEN_STORAGE_KEY = 'agenda_hair_auth_token';
const INSPECT_TENANT_KEY = 'agenda_hair_inspect_tenant_id';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setStoredToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(INSPECT_TENANT_KEY);
  }
}

export function getInspectedTenantId(): number | null {
  const val = localStorage.getItem(INSPECT_TENANT_KEY);
  return val ? Number(val) : null;
}

export function setInspectedTenantId(tenantId: number | null): void {
  if (tenantId && tenantId > 0) {
    localStorage.setItem(INSPECT_TENANT_KEY, String(tenantId));
  } else {
    localStorage.removeItem(INSPECT_TENANT_KEY);
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const inspectedTenant = getInspectedTenantId();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options?.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (inspectedTenant) {
    headers['x-tenant-id'] = String(inspectedTenant);
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });
  if (!res.ok) {
    let errMsg = `Erro HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data?.error) errMsg = data.error;
    } catch {
      // ignore
    }
    throw new Error(errMsg);
  }
  return res.json();
}

export const api = {
  // Authentication
  login: (email: string, password: string) =>
    request<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  getMe: () => request<{ user: AuthUser }>('/api/auth/me'),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: boolean }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  // Admin SaaS Panel (SuperAdmin)
  getAdminOverview: () => request<SaasAdminOverview>('/api/admin/overview'),
  createTenant: (data: {
    name: string;
    ownerName: string;
    email: string;
    password: string;
    phone: string;
    document: string;
    businessType: string;
    planName: string;
    monthlyFee: number;
    dueDay: number;
    status: string;
    notes?: string;
  }) =>
    request<{ id: number }>('/api/admin/tenants', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateTenant: (
    id: number,
    data: {
      name?: string;
      ownerName?: string;
      email?: string;
      newPassword?: string;
      phone?: string;
      document?: string;
      businessType?: string;
      planName?: string;
      monthlyFee?: number;
      dueDay?: number;
      status?: string;
      notes?: string;
    }
  ) =>
    request<{ ok: boolean }>(`/api/admin/tenants/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteTenant: (id: number) =>
    request<{ ok: boolean }>(`/api/admin/tenants/${id}`, { method: 'DELETE' }),

  createSaasPayment: (data: {
    tenantId: number;
    referenceMonth: string;
    amount: number;
    dueDate: string;
    status: 'paid' | 'pending';
    paymentMethod: string;
    notes?: string;
  }) =>
    request<{ id: number }>('/api/admin/payments', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateSaasPayment: (
    id: number,
    data: {
      status?: 'paid' | 'pending' | 'overdue';
      paymentMethod?: string;
      paidAt?: string | null;
      amount?: number;
      dueDate?: string;
      notes?: string;
    }
  ) =>
    request<{ ok: boolean }>(`/api/admin/payments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteSaasPayment: (id: number) =>
    request<{ ok: boolean }>(`/api/admin/payments/${id}`, { method: 'DELETE' }),

  createAdminStaff: (data: { name: string; email: string; password: string }) =>
    request<{ id: number }>('/api/admin/staff', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  deleteAdminStaff: (id: number) =>
    request<{ ok: boolean }>(`/api/admin/staff/${id}`, { method: 'DELETE' }),

  // Settings
  getSettings: () => request<CompanySettings>('/api/settings'),
  updateSettings: (data: Partial<CompanySettings>) =>
    request<CompanySettings>('/api/settings', { method: 'PUT', body: JSON.stringify(data) }),

  // Professionals
  getProfessionals: () => request<Professional[]>('/api/professionals'),
  createProfessional: (data: { name: string; role: string; color: string }) =>
    request<Professional>('/api/professionals', { method: 'POST', body: JSON.stringify(data) }),
  deleteProfessional: (id: number) =>
    request<{ ok: boolean }>(`/api/professionals/${id}`, { method: 'DELETE' }),

  // Services
  getServices: () => request<ServiceItem[]>('/api/services'),
  createService: (data: Partial<ServiceItem>) =>
    request<{ id: number }>('/api/services', { method: 'POST', body: JSON.stringify(data) }),
  updateService: (id: number, data: Partial<ServiceItem>) =>
    request<{ ok: boolean }>(`/api/services/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteService: (id: number) =>
    request<{ ok: boolean }>(`/api/services/${id}`, { method: 'DELETE' }),

  // Clients
  getClients: () => request<Client[]>('/api/clients'),
  createClient: (data: { fullName: string; phone: string; notes?: string }) =>
    request<Client>('/api/clients', { method: 'POST', body: JSON.stringify(data) }),
  updateClient: (id: number, data: { fullName: string; phone: string; notes?: string }) =>
    request<{ ok: boolean }>(`/api/clients/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  // Products
  getProducts: () => request<Product[]>('/api/products'),
  createProduct: (data: Partial<Product>) =>
    request<{ id: number }>('/api/products', { method: 'POST', body: JSON.stringify(data) }),
  updateProduct: (id: number, data: Partial<Product>) =>
    request<{ ok: boolean }>(`/api/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  restockProduct: (id: number, quantity: number, registerExpense: boolean) =>
    request<{ ok: boolean }>(`/api/products/${id}/restock`, {
      method: 'POST',
      body: JSON.stringify({ quantity, registerExpense }),
    }),
  deleteProduct: (id: number) =>
    request<{ ok: boolean }>(`/api/products/${id}`, { method: 'DELETE' }),

  // Appointments & Encaixe
  getAppointments: (date?: string, professionalId?: number) => {
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (professionalId) params.set('professionalId', String(professionalId));
    return request<Appointment[]>(`/api/appointments?${params.toString()}`);
  },
  checkConflict: (params: {
    date: string;
    professionalId: number;
    startTime: string;
    durationMinutes: number;
    excludeId?: number;
  }) => {
    const q = new URLSearchParams({
      date: params.date,
      professionalId: String(params.professionalId),
      startTime: params.startTime,
      durationMinutes: String(params.durationMinutes),
    });
    if (params.excludeId) q.set('excludeId', String(params.excludeId));
    return request<ConflictCheckResult>(`/api/appointments/check-conflict?${q.toString()}`);
  },
  createAppointment: (data: any) =>
    request<{ id: number }>('/api/appointments', { method: 'POST', body: JSON.stringify(data) }),
  updateAppointment: (id: number, data: any) =>
    request<{ ok: boolean }>(`/api/appointments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  updateAppointmentStatus: (id: number, status: string) =>
    request<{ ok: boolean }>(`/api/appointments/${id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    }),
  finalizeAppointment: (
    id: number,
    data: {
      servicePrice: number;
      products: { productId: number; quantity: number; unitPrice?: number }[];
      discount: number;
      paymentMethod: string;
      notes?: string;
    }
  ) =>
    request<{ ok: boolean }>(`/api/appointments/${id}/finalize`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  refundAppointment: (id: number, reason: string) =>
    request<{ ok: boolean }>(`/api/appointments/${id}/refund`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  deleteAppointment: (id: number) =>
    request<{ ok: boolean }>(`/api/appointments/${id}`, { method: 'DELETE' }),

  // Notifications
  getNotifications: () => request<NotificationLog[]>('/api/notifications'),
  sendNotification: (data: {
    appointmentId?: number;
    clientId: number;
    channel: 'whatsapp' | 'sms';
    customMessage?: string;
  }) =>
    request<{
      id: number;
      channel: 'whatsapp' | 'sms';
      message: string;
      status: string;
      whatsappUrl: string;
      smsUrl: string;
    }>('/api/notifications/send', { method: 'POST', body: JSON.stringify(data) }),

  // Financial
  getFinancialReport: (period: FinancialPeriod, date: string) =>
    request<FinancialReport>(`/api/financial/report?period=${period}&date=${date}`),
  createManualTransaction: (data: {
    date: string;
    type: 'income' | 'expense';
    category: string;
    description: string;
    amount: number;
    paymentMethod: string;
  }) =>
    request<{ id: number }>('/api/financial/transactions', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  refundManualTransaction: (id: number, reason: string) =>
    request<{ ok: boolean }>(`/api/financial/transactions/${id}/refund`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  deleteManualTransaction: (id: number) =>
    request<{ ok: boolean }>(`/api/financial/transactions/${id}`, { method: 'DELETE' }),

  // Payable Accounts (Contas a Pagar)
  getPayables: () => request<PayableAccount[]>('/api/financial/payables'),
  createPayable: (data: {
    description: string;
    category: string;
    amount: number;
    dueDate: string;
    recurrenceType: PayableRecurrence;
    totalInstallments?: number;
    monthsCount?: number;
    paymentMethod: string;
  }) =>
    request<{ ids: number[]; count: number }>('/api/financial/payables', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  payPayable: (id: number, paymentMethod: string, paymentDate?: string) =>
    request<{ ok: boolean }>(`/api/financial/payables/${id}/pay`, {
      method: 'POST',
      body: JSON.stringify({ paymentMethod, paymentDate }),
    }),
  updatePayable: (
    id: number,
    data: {
      description: string;
      category: string;
      amount: number;
      dueDate: string;
      paymentMethod: string;
      updateSubsequent: boolean;
    }
  ) =>
    request<{ ok: boolean }>(`/api/financial/payables/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  refundPayable: (id: number, reason: string) =>
    request<{ ok: boolean }>(`/api/financial/payables/${id}/refund`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  deletePayable: (id: number, deleteSubsequent = false) =>
    request<{ ok: boolean }>(
      `/api/financial/payables/${id}${deleteSubsequent ? '?deleteSubsequent=true' : ''}`,
      { method: 'DELETE' }
    ),
};

export function formatBRL(val: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(val || 0);
}

export function formatPhoneMask(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function formatDateBR(dateStr?: string | null): string {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.slice(0, 10).split('-');
  if (!y || !m || !d) return dateStr;
  return `${d}/${m}/${y}`;
}
