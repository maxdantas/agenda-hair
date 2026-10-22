export type BusinessType = 'salon' | 'barbershop' | 'hybrid';
export type CompletedDisplayMode =
  | 'dimmed_strikethrough'
  | 'dimmed'
  | 'strikethrough'
  | 'hidden';

export interface CompanySettings {
  id: number;
  name: string;
  subtitle: string;
  businessType: BusinessType;
  phone: string;
  address: string;
  accentColor: string;
  openTime: string; // e.g. "08:00"
  closeTime: string; // e.g. "20:00"
  slotIntervalMinutes: number; // 15 or 30
  completedDisplayMode: CompletedDisplayMode;
  debitCardFeePercent: number; // Taxa maquininha Débito (%)
  creditCardFeePercent: number; // Taxa maquininha Crédito (%)
  whatsappTemplateReminder: string;
  whatsappTemplateReceipt: string;
  smsTemplateReminder: string;
  webhookUrl: string; // Optional Evolution API / Z-API / Twilio webhook
}

export interface Professional {
  id: number;
  name: string;
  role: string;
  color: string;
  active: boolean;
}

export type PriceType = 'fixed' | 'variable';

export interface ServiceItem {
  id: number;
  name: string;
  category: string;
  durationMinutes: number;
  priceType: PriceType;
  basePrice: number;
  maxPrice?: number | null;
  allowsFitInWindow: boolean;
  description: string;
  active: boolean;
}

export interface Client {
  id: number;
  fullName: string;
  phone: string;
  notes: string;
  createdAt: string;
  totalVisits?: number;
  totalSpent?: number;
  lastVisit?: string | null;
}

export interface Product {
  id: number;
  name: string;
  category: string;
  sku: string;
  price: number;
  costPrice: number;
  stockQuantity: number;
  minStock: number;
  unit: string;
  active: boolean;
}

export interface AppointmentServiceItem {
  id?: number;
  appointmentId?: number;
  serviceId: number;
  serviceName: string;
  serviceCategory: string;
  priceType: PriceType;
  durationMinutes: number;
  price: number;
}

export interface AppointmentProductItem {
  id?: number;
  appointmentId?: number;
  productId: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export type AppointmentStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
export type PaymentMethod = 'pix' | 'credit_card' | 'debit_card' | 'cash' | 'pending';

export interface Appointment {
  id: number;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  durationMinutes: number;
  clientId: number;
  clientName: string;
  clientPhone: string;
  professionalId: number;
  professionalName: string;
  professionalColor: string;
  serviceId: number;
  serviceName: string;
  serviceCategory: string;
  servicePriceType: PriceType;
  servicePrice: number;
  productsTotal: number;
  discount: number;
  totalAmount: number;
  isFitIn: boolean;
  parentAppointmentId?: number | null;
  status: AppointmentStatus;
  paymentMethod: PaymentMethod;
  paidAt?: string | null;
  isRefunded?: boolean;
  refundReason?: string | null;
  refundedAt?: string | null;
  cardFeePercent?: number;
  cardFeeAmount?: number;
  netAmountReceived?: number;
  notes: string;
  services: AppointmentServiceItem[];
  products: AppointmentProductItem[];
}

export interface ConflictCheckResult {
  hasOverlap: boolean;
  overlappingAppointments: {
    id: number;
    clientName: string;
    serviceName: string;
    startTime: string;
    endTime: string;
    allowsFitInWindow: boolean;
    isFitIn: boolean;
  }[];
}

export interface NotificationLog {
  id: number;
  appointmentId?: number | null;
  clientId: number;
  clientName: string;
  clientPhone: string;
  channel: 'whatsapp' | 'sms';
  message: string;
  status: 'sent_link' | 'sent_webhook' | 'simulated';
  createdAt: string;
}

export interface ManualTransaction {
  id: number;
  date: string; // YYYY-MM-DD
  type: 'income' | 'expense';
  category: string;
  description: string;
  amount: number;
  paymentMethod: string;
  isRefunded?: boolean;
  refundReason?: string | null;
  refundedAt?: string | null;
  cardFeePercent?: number;
  cardFeeAmount?: number;
  netAmountReceived?: number;
  createdAt: string;
}

export type PayableRecurrence = 'once' | 'monthly' | 'installments';
export type PayableDueAlertStatus = 'paid' | 'overdue' | 'due_today' | 'due_soon' | 'upcoming';

export interface PayableAccount {
  id: number;
  description: string;
  category: string;
  amount: number;
  dueDate: string; // YYYY-MM-DD
  recurrenceType: PayableRecurrence;
  installmentNumber?: number | null;
  totalInstallments?: number | null;
  recurrenceGroupId?: string | null;
  status: 'pending' | 'paid';
  paidAt?: string | null;
  paymentMethod: string;
  manualTransactionId?: number | null;
  refundReason?: string | null;
  refundedAt?: string | null;
  alertStatus: PayableDueAlertStatus;
  daysUntilDue: number;
}

export type FinancialPeriod = 'daily' | 'weekly' | 'monthly' | 'annual';

export interface FinancialReport {
  period: FinancialPeriod;
  referenceDate: string;
  startDate: string;
  endDate: string;
  label: string;
  summary: {
    servicesCount: number;
    servicesRevenue: number;
    fitInServicesCount: number;
    productsSoldCount: number;
    productsRevenue: number;
    productsCost: number;
    productsProfit: number;
    otherIncome: number;
    expensesTotal: number;
    cardFeesTotal: number; // Total descontado pelas maquininhas (débito + crédito)
    grossRevenue: number; // servicesRevenue + productsRevenue + otherIncome
    netBalance: number; // grossRevenue - cardFeesTotal - productsCost - expensesTotal
    averageTicket: number;
  };
  byPaymentMethod: {
    method: string;
    label: string;
    total: number;
    feePercent: number;
    feeTotal: number;
    netTotal: number;
    count: number;
  }[];
  topServices: {
    serviceId: number;
    serviceName: string;
    count: number;
    revenue: number;
  }[];
  topProducts: {
    productId: number;
    productName: string;
    quantitySold: number;
    revenue: number;
    profit: number;
  }[];
  timelineSeries: {
    label: string;
    dateKey: string;
    servicesRevenue: number;
    productsRevenue: number;
    expenses: number;
  }[];
  completedAppointments: Appointment[];
  refundedAppointments: Appointment[];
  manualTransactions: ManualTransaction[];
}

// ==========================================
// SAAS AUTHENTICATION & ADMIN PANEL TYPES
// ==========================================
export type UserRole = 'superadmin' | 'tenant';
export type TenantSubscriptionStatus = 'active' | 'trial' | 'suspended';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  tenantId: number | null;
  tenantName?: string | null;
  tenantStatus?: TenantSubscriptionStatus | null;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export interface SaasTenantMetrics {
  appointmentsTotal: number;
  completedAppointments: number;
  clientsCount: number;
  professionalsCount: number;
  servicesCount: number;
  productsCount: number;
  grossRevenueProcessed: number;
  lastAppointmentDate: string | null;
}

export interface SaasTenant {
  id: number;
  name: string;
  ownerName: string;
  email: string;
  phone: string;
  document: string;
  businessType: string;
  planName: string;
  monthlyFee: number;
  dueDay: number;
  status: TenantSubscriptionStatus;
  notes: string;
  createdAt: string;
  lastLoginAt: string | null;
  metrics: SaasTenantMetrics;
}

export interface SaasPayment {
  id: number;
  tenantId: number;
  tenantName: string;
  ownerName: string;
  referenceMonth: string; // YYYY-MM
  amount: number;
  dueDate: string; // YYYY-MM-DD
  paidAt: string | null; // YYYY-MM-DD
  status: 'paid' | 'pending' | 'overdue';
  paymentMethod: string;
  notes: string;
  createdAt: string;
}

export interface SaasAdminOverview {
  summary: {
    totalTenants: number;
    activeTenants: number;
    suspendedTenants: number;
    mrr: number;
    receivedThisMonth: number;
    pendingPaymentsTotal: number;
    totalPlatformAppointments: number;
    totalPlatformClients: number;
  };
  tenants: SaasTenant[];
  payments: SaasPayment[];
  adminStaff: {
    id: number;
    name: string;
    email: string;
    role: string;
    active: boolean;
    createdAt: string;
    lastLoginAt: string | null;
  }[];
}
