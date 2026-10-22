import express from 'express';
import cors from 'cors';
import {
  db,
  initDatabase,
  runInTransaction,
  getTodayStr,
  hashPassword,
  verifyPassword,
  generateSessionToken,
  ensureTenantWorkspace,
} from './db.ts';
import type {
  Appointment,
  AppointmentProductItem,
  AppointmentServiceItem,
  AuthUser,
  Client,
  CompanySettings,
  ConflictCheckResult,
  FinancialPeriod,
  FinancialReport,
  ManualTransaction,
  NotificationLog,
  PayableAccount,
  PayableDueAlertStatus,
  PayableRecurrence,
  Product,
  Professional,
  SaasAdminOverview,
  SaasPayment,
  SaasTenant,
  ServiceItem,
} from '../shared/types.ts';

initDatabase();

const app = express();
app.use(cors());
app.use(express.json());

// ==========================================
// 0. AUTHENTICATION & MULTI-TENANT CONTEXT
// ==========================================
function getAuthUserFromRequest(req: express.Request): AuthUser | null {
  const authHeader = String(req.headers.authorization || '');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return null;

  const row = db
    .prepare(`
      SELECT
        u.id, u.name, u.email, u.role, u.tenant_id, u.active,
        t.name as tenant_name, t.status as tenant_status
      FROM auth_sessions s
      JOIN users u ON u.id = s.user_id
      LEFT JOIN saas_tenants t ON t.id = u.tenant_id
      WHERE s.token = ?
    `)
    .get(token) as any;

  if (!row || !row.active) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    tenantId: row.tenant_id ?? null,
    tenantName: row.tenant_name ?? null,
    tenantStatus: row.tenant_status ?? null,
  };
}

function getTenantId(req: express.Request): number {
  const user = getAuthUserFromRequest(req);
  if (user) {
    // Allow SuperAdmin to inspect/support a specific tenant's panel via x-tenant-id header
    if (user.role === 'superadmin') {
      const imp = Number(req.headers['x-tenant-id']);
      return imp > 0 ? imp : 1;
    }
    if (user.tenantId) return user.tenantId;
  }
  return 1;
}

app.post('/api/auth/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  if (!email || !password) {
    return res.status(400).json({ error: 'Informe seu e-mail e senha de acesso.' });
  }

  const row = db
    .prepare(`
      SELECT
        u.*,
        t.name as tenant_name,
        t.status as tenant_status
      FROM users u
      LEFT JOIN saas_tenants t ON t.id = u.tenant_id
      WHERE LOWER(u.email) = ?
    `)
    .get(email) as any;

  if (!row || !verifyPassword(password, row.password_hash)) {
    return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
  }

  if (!row.active) {
    return res.status(403).json({ error: 'Este usuário está desativado. Contate o administrador.' });
  }

  if (row.role === 'tenant' && row.tenant_status === 'suspended') {
    return res.status(403).json({
      error:
        'O acesso deste estabelecimento está temporariamente suspenso. Entre em contato com a administração para regularizar sua assinatura.',
    });
  }

  const token = generateSessionToken();
  runInTransaction(() => {
    db.prepare('INSERT INTO auth_sessions (token, user_id) VALUES (?, ?)').run(token, row.id);
    db.prepare("UPDATE users SET last_login_at = datetime('now', 'localtime') WHERE id = ?").run(
      row.id
    );
    if (row.tenant_id) {
      db.prepare(
        "UPDATE saas_tenants SET last_login_at = datetime('now', 'localtime') WHERE id = ?"
      ).run(row.tenant_id);
    }
  });

  const user: AuthUser = {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    tenantId: row.tenant_id ?? null,
    tenantName: row.tenant_name ?? null,
    tenantStatus: row.tenant_status ?? null,
  };

  res.json({ token, user });
});

app.get('/api/auth/me', (req, res) => {
  const user = getAuthUserFromRequest(req);
  if (!user) return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
  if (user.role === 'tenant' && user.tenantStatus === 'suspended') {
    return res.status(403).json({ error: 'Estabelecimento com assinatura suspensa.' });
  }
  res.json({ user });
});

app.post('/api/auth/logout', (req, res) => {
  const authHeader = String(req.headers.authorization || '');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (token) {
    db.prepare('DELETE FROM auth_sessions WHERE token = ?').run(token);
  }
  res.json({ ok: true });
});

app.post('/api/auth/change-password', (req, res) => {
  const user = getAuthUserFromRequest(req);
  if (!user) return res.status(401).json({ error: 'Não autenticado.' });

  const { currentPassword, newPassword } = req.body;
  if (!newPassword || String(newPassword).length < 4) {
    return res.status(400).json({ error: 'A nova senha deve ter pelo menos 4 caracteres.' });
  }

  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id) as any;
  if (currentPassword && !verifyPassword(String(currentPassword), row.password_hash)) {
    return res.status(400).json({ error: 'A senha atual informada está incorreta.' });
  }

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
    hashPassword(String(newPassword)),
    user.id
  );
  res.json({ ok: true });
});

// Helpers for time math
function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(totalMin: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, totalMin));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function getCardFeeRates(tenantId = 1): { debitPercent: number; creditPercent: number } {
  const row = db
    .prepare(
      'SELECT debit_card_fee_percent, credit_card_fee_percent FROM company_settings WHERE tenant_id = ? LIMIT 1'
    )
    .get(tenantId) as any;
  return {
    debitPercent: Number(row?.debit_card_fee_percent ?? 1.49),
    creditPercent: Number(row?.credit_card_fee_percent ?? 3.99),
  };
}

function computeCardFeeForPayment(
  amount: number,
  paymentMethod: string,
  rates: { debitPercent: number; creditPercent: number }
): { feePercent: number; feeAmount: number; netAmount: number } {
  const feePercent =
    paymentMethod === 'debit_card'
      ? rates.debitPercent
      : paymentMethod === 'credit_card'
      ? rates.creditPercent
      : 0;
  const feeAmount = Number(((amount * feePercent) / 100).toFixed(2));
  const netAmount = Number(Math.max(0, amount - feeAmount).toFixed(2));
  return { feePercent, feeAmount, netAmount };
}

function hydrateAppointments(rows: any[], tenantId = 1): Appointment[] {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const placeholders = ids.map(() => '?').join(',');
  const rates = getCardFeeRates(tenantId);

  const srvRows = db
    .prepare(
      `SELECT id, appointment_id, service_id, service_name, service_category, price_type, duration_minutes, price
       FROM appointment_services
       WHERE appointment_id IN (${placeholders})
       ORDER BY id ASC`
    )
    .all(...ids) as any[];

  const srvMap = new Map<number, AppointmentServiceItem[]>();
  for (const sr of srvRows) {
    const list = srvMap.get(sr.appointment_id) || [];
    list.push({
      id: sr.id,
      appointmentId: sr.appointment_id,
      serviceId: sr.service_id,
      serviceName: sr.service_name,
      serviceCategory: sr.service_category,
      priceType: sr.price_type,
      durationMinutes: sr.duration_minutes,
      price: sr.price,
    });
    srvMap.set(sr.appointment_id, list);
  }

  const prodRows = db
    .prepare(
      `SELECT id, appointment_id, product_id, product_name, quantity, unit_price, subtotal
       FROM appointment_products
       WHERE appointment_id IN (${placeholders})
       ORDER BY id ASC`
    )
    .all(...ids) as any[];

  const prodMap = new Map<number, AppointmentProductItem[]>();
  for (const pr of prodRows) {
    const list = prodMap.get(pr.appointment_id) || [];
    list.push({
      id: pr.id,
      appointmentId: pr.appointment_id,
      productId: pr.product_id,
      productName: pr.product_name,
      quantity: pr.quantity,
      unitPrice: pr.unit_price,
      subtotal: pr.subtotal,
    });
    prodMap.set(pr.appointment_id, list);
  }

  return rows.map((r) => {
    const srvList = srvMap.get(r.id) || [
      {
        serviceId: r.service_id,
        serviceName: r.service_name,
        serviceCategory: r.service_category,
        priceType: r.service_price_type,
        durationMinutes: r.duration_minutes,
        price: r.service_price,
      },
    ];
    const combinedServiceName = srvList.map((s) => s.serviceName).join(' + ');
    const hasVariable = srvList.some((s) => s.priceType === 'variable');
    const { feePercent, feeAmount, netAmount } = computeCardFeeForPayment(
      Number(r.total_amount) || 0,
      r.payment_method,
      rates
    );

    return {
      id: r.id,
      date: r.date,
      startTime: r.start_time,
      endTime: r.end_time,
      durationMinutes: r.duration_minutes,
      clientId: r.client_id,
      clientName: r.client_name,
      clientPhone: r.client_phone,
      professionalId: r.professional_id,
      professionalName: r.professional_name,
      professionalColor: r.professional_color,
      serviceId: srvList[0]?.serviceId || r.service_id,
      serviceName: combinedServiceName || r.service_name,
      serviceCategory: srvList[0]?.serviceCategory || r.service_category,
      servicePriceType: hasVariable ? 'variable' : 'fixed',
      servicePrice: r.service_price,
      productsTotal: r.products_total,
      discount: r.discount,
      totalAmount: r.total_amount,
      isFitIn: Boolean(r.is_fit_in),
      parentAppointmentId: r.parent_appointment_id,
      status: r.status,
      paymentMethod: r.payment_method,
      paidAt: r.paid_at,
      isRefunded: Boolean(r.is_refunded),
      refundReason: r.refund_reason || null,
      refundedAt: r.refunded_at || null,
      cardFeePercent: feePercent,
      cardFeeAmount: feeAmount,
      netAmountReceived: netAmount,
      notes: r.notes,
      services: srvList,
      products: prodMap.get(r.id) || [],
    };
  });
}

// ==========================================
// 1. COMPANY SETTINGS & CUSTOMIZATION
// ==========================================
app.get('/api/settings', (req, res) => {
  const tenantId = getTenantId(req);
  let row = db
    .prepare('SELECT * FROM company_settings WHERE tenant_id = ? LIMIT 1')
    .get(tenantId) as any;
  if (!row) {
    ensureTenantWorkspace(tenantId, 'Meu Salão & Barbearia', 'salon', '', 'Profissional');
    row = db
      .prepare('SELECT * FROM company_settings WHERE tenant_id = ? LIMIT 1')
      .get(tenantId) as any;
  }
  const settings: CompanySettings = {
    id: row.id,
    name: row.name,
    subtitle: row.subtitle,
    businessType: row.business_type,
    phone: row.phone,
    address: row.address,
    accentColor: row.accent_color,
    openTime: row.open_time,
    closeTime: row.close_time,
    slotIntervalMinutes: row.slot_interval_minutes,
    completedDisplayMode: row.completed_display_mode || 'dimmed_strikethrough',
    debitCardFeePercent: Number(row.debit_card_fee_percent ?? 1.49),
    creditCardFeePercent: Number(row.credit_card_fee_percent ?? 3.99),
    whatsappTemplateReminder: row.whatsapp_template_reminder,
    whatsappTemplateReceipt: row.whatsapp_template_receipt,
    smsTemplateReminder: row.sms_template_reminder,
    webhookUrl: row.webhook_url,
  };
  res.json(settings);
});

app.put('/api/settings', (req, res) => {
  const tenantId = getTenantId(req);
  const b = req.body as Partial<CompanySettings>;
  db.prepare(`
    UPDATE company_settings SET
      name = COALESCE(?, name),
      subtitle = COALESCE(?, subtitle),
      business_type = COALESCE(?, business_type),
      phone = COALESCE(?, phone),
      address = COALESCE(?, address),
      accent_color = COALESCE(?, accent_color),
      open_time = COALESCE(?, open_time),
      close_time = COALESCE(?, close_time),
      slot_interval_minutes = COALESCE(?, slot_interval_minutes),
      completed_display_mode = COALESCE(?, completed_display_mode),
      debit_card_fee_percent = COALESCE(?, debit_card_fee_percent),
      credit_card_fee_percent = COALESCE(?, credit_card_fee_percent),
      whatsapp_template_reminder = COALESCE(?, whatsapp_template_reminder),
      whatsapp_template_receipt = COALESCE(?, whatsapp_template_receipt),
      sms_template_reminder = COALESCE(?, sms_template_reminder),
      webhook_url = COALESCE(?, webhook_url)
    WHERE tenant_id = ?
  `).run(
    b.name ?? null,
    b.subtitle ?? null,
    b.businessType ?? null,
    b.phone ?? null,
    b.address ?? null,
    b.accentColor ?? null,
    b.openTime ?? null,
    b.closeTime ?? null,
    b.slotIntervalMinutes ?? null,
    b.completedDisplayMode ?? null,
    b.debitCardFeePercent !== undefined ? Number(b.debitCardFeePercent) : null,
    b.creditCardFeePercent !== undefined ? Number(b.creditCardFeePercent) : null,
    b.whatsappTemplateReminder ?? null,
    b.whatsappTemplateReceipt ?? null,
    b.smsTemplateReminder ?? null,
    b.webhookUrl ?? null,
    tenantId
  );

  if (b.name) {
    db.prepare('UPDATE saas_tenants SET name = ?, business_type = COALESCE(?, business_type), phone = COALESCE(?, phone) WHERE id = ?').run(
      b.name,
      b.businessType ?? null,
      b.phone ?? null,
      tenantId
    );
  }

  const updated = db
    .prepare('SELECT * FROM company_settings WHERE tenant_id = ? LIMIT 1')
    .get(tenantId) as any;
  res.json({
    id: updated.id,
    name: updated.name,
    subtitle: updated.subtitle,
    businessType: updated.business_type,
    phone: updated.phone,
    address: updated.address,
    accentColor: updated.accent_color,
    openTime: updated.open_time,
    closeTime: updated.close_time,
    slotIntervalMinutes: updated.slot_interval_minutes,
    completedDisplayMode: updated.completed_display_mode || 'dimmed_strikethrough',
    debitCardFeePercent: Number(updated.debit_card_fee_percent ?? 1.49),
    creditCardFeePercent: Number(updated.credit_card_fee_percent ?? 3.99),
    whatsappTemplateReminder: updated.whatsapp_template_reminder,
    whatsappTemplateReceipt: updated.whatsapp_template_receipt,
    smsTemplateReminder: updated.sms_template_reminder,
    webhookUrl: updated.webhook_url,
  });
});

// ==========================================
// 2. PROFESSIONALS
// ==========================================
app.get('/api/professionals', (req, res) => {
  const tenantId = getTenantId(req);
  const rows = db
    .prepare('SELECT * FROM professionals WHERE tenant_id = ? AND active = 1 ORDER BY id ASC')
    .all(tenantId) as any[];
  const list: Professional[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    role: r.role,
    color: r.color,
    active: Boolean(r.active),
  }));
  res.json(list);
});

app.post('/api/professionals', (req, res) => {
  const tenantId = getTenantId(req);
  const { name, role, color } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Nome do profissional é obrigatório.' });
  const result = db
    .prepare(
      'INSERT INTO professionals (tenant_id, name, role, color, active) VALUES (?, ?, ?, ?, 1)'
    )
    .run(tenantId, name.trim(), (role || 'Especialista').trim(), color || '#9E5A3C');
  res.status(201).json({
    id: Number(result.lastInsertRowid),
    name: name.trim(),
    role: (role || 'Especialista').trim(),
    color: color || '#9E5A3C',
    active: true,
  });
});

app.put('/api/professionals/:id', (req, res) => {
  const tenantId = getTenantId(req);
  const id = Number(req.params.id);
  const { name, role, color, active } = req.body;
  db.prepare(`
    UPDATE professionals SET
      name = COALESCE(?, name),
      role = COALESCE(?, role),
      color = COALESCE(?, color),
      active = COALESCE(?, active)
    WHERE id = ? AND tenant_id = ?
  `).run(
    name ?? null,
    role ?? null,
    color ?? null,
    active !== undefined ? (active ? 1 : 0) : null,
    id,
    tenantId
  );
  res.json({ ok: true });
});

app.delete('/api/professionals/:id', (req, res) => {
  const tenantId = getTenantId(req);
  const id = Number(req.params.id);
  db.prepare('UPDATE professionals SET active = 0 WHERE id = ? AND tenant_id = ?').run(
    id,
    tenantId
  );
  res.json({ ok: true });
});

// ==========================================
// 3. SERVICES (FIXED & VARIABLE PRICE + DURATION)
// ==========================================
app.get('/api/services', (req, res) => {
  const tenantId = getTenantId(req);
  const rows = db
    .prepare(
      'SELECT * FROM services WHERE tenant_id = ? AND active = 1 ORDER BY category ASC, name ASC'
    )
    .all(tenantId) as any[];
  const list: ServiceItem[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    durationMinutes: r.duration_minutes,
    priceType: r.price_type,
    basePrice: r.base_price,
    maxPrice: r.max_price,
    allowsFitInWindow: Boolean(r.allows_fit_in_window),
    description: r.description,
    active: Boolean(r.active),
  }));
  res.json(list);
});

app.post('/api/services', (req, res) => {
  const tenantId = getTenantId(req);
  const b = req.body;
  if (!b.name?.trim()) return res.status(400).json({ error: 'Nome do serviço é obrigatório.' });
  const result = db
    .prepare(`
      INSERT INTO services (tenant_id, name, category, duration_minutes, price_type, base_price, max_price, allows_fit_in_window, description, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `)
    .run(
      tenantId,
      b.name.trim(),
      (b.category || 'Geral').trim(),
      Number(b.durationMinutes) || 30,
      b.priceType === 'variable' ? 'variable' : 'fixed',
      Number(b.basePrice) || 0,
      b.maxPrice ? Number(b.maxPrice) : null,
      b.allowsFitInWindow ? 1 : 0,
      (b.description || '').trim()
    );

  res.status(201).json({ id: Number(result.lastInsertRowid) });
});

app.put('/api/services/:id', (req, res) => {
  const tenantId = getTenantId(req);
  const id = Number(req.params.id);
  const b = req.body;
  db.prepare(`
    UPDATE services SET
      name = ?,
      category = ?,
      duration_minutes = ?,
      price_type = ?,
      base_price = ?,
      max_price = ?,
      allows_fit_in_window = ?,
      description = ?
    WHERE id = ? AND tenant_id = ?
  `).run(
    b.name.trim(),
    (b.category || 'Geral').trim(),
    Number(b.durationMinutes) || 30,
    b.priceType === 'variable' ? 'variable' : 'fixed',
    Number(b.basePrice) || 0,
    b.maxPrice ? Number(b.maxPrice) : null,
    b.allowsFitInWindow ? 1 : 0,
    (b.description || '').trim(),
    id,
    tenantId
  );
  res.json({ ok: true });
});

app.delete('/api/services/:id', (req, res) => {
  const tenantId = getTenantId(req);
  const id = Number(req.params.id);
  db.prepare('UPDATE services SET active = 0 WHERE id = ? AND tenant_id = ?').run(id, tenantId);
  res.json({ ok: true });
});

// ==========================================
// 4. CLIENTS
// ==========================================
app.get('/api/clients', (req, res) => {
  const tenantId = getTenantId(req);
  const rows = db
    .prepare(`
      SELECT
        c.*,
        COUNT(CASE WHEN a.status = 'completed' AND COALESCE(a.is_refunded, 0) = 0 THEN 1 END) as total_visits,
        COALESCE(SUM(CASE WHEN a.status = 'completed' AND COALESCE(a.is_refunded, 0) = 0 THEN a.total_amount ELSE 0 END), 0) as total_spent,
        MAX(CASE WHEN a.status = 'completed' AND COALESCE(a.is_refunded, 0) = 0 THEN a.date END) as last_visit
      FROM clients c
      LEFT JOIN appointments a ON a.client_id = c.id
      WHERE c.tenant_id = ?
      GROUP BY c.id
      ORDER BY c.full_name ASC
    `)
    .all(tenantId) as any[];

  const list: Client[] = rows.map((r) => ({
    id: r.id,
    fullName: r.full_name,
    phone: r.phone,
    notes: r.notes,
    createdAt: r.created_at,
    totalVisits: r.total_visits,
    totalSpent: r.total_spent,
    lastVisit: r.last_visit,
  }));
  res.json(list);
});

app.post('/api/clients', (req, res) => {
  const tenantId = getTenantId(req);
  const { fullName, phone, notes } = req.body;
  if (!fullName?.trim() || !phone?.trim()) {
    return res.status(400).json({ error: 'Nome completo e telefone são obrigatórios.' });
  }
  const result = db
    .prepare('INSERT INTO clients (tenant_id, full_name, phone, notes) VALUES (?, ?, ?, ?)')
    .run(tenantId, fullName.trim(), phone.trim(), (notes || '').trim());

  res.status(201).json({
    id: Number(result.lastInsertRowid),
    fullName: fullName.trim(),
    phone: phone.trim(),
    notes: (notes || '').trim(),
  });
});

app.put('/api/clients/:id', (req, res) => {
  const tenantId = getTenantId(req);
  const id = Number(req.params.id);
  const { fullName, phone, notes } = req.body;
  db.prepare(
    'UPDATE clients SET full_name = ?, phone = ?, notes = ? WHERE id = ? AND tenant_id = ?'
  ).run(fullName.trim(), phone.trim(), (notes || '').trim(), id, tenantId);
  res.json({ ok: true });
});

// ==========================================
// 5. PRODUCTS & INVENTORY
// ==========================================
app.get('/api/products', (req, res) => {
  const tenantId = getTenantId(req);
  const rows = db
    .prepare(
      'SELECT * FROM products WHERE tenant_id = ? AND active = 1 ORDER BY category ASC, name ASC'
    )
    .all(tenantId) as any[];
  const list: Product[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    sku: r.sku,
    price: r.price,
    costPrice: r.cost_price,
    stockQuantity: r.stock_quantity,
    minStock: r.min_stock,
    unit: r.unit,
    active: Boolean(r.active),
  }));
  res.json(list);
});

app.post('/api/products', (req, res) => {
  const tenantId = getTenantId(req);
  const b = req.body;
  if (!b.name?.trim()) return res.status(400).json({ error: 'Nome do produto é obrigatório.' });
  const result = db
    .prepare(`
      INSERT INTO products (tenant_id, name, category, sku, price, cost_price, stock_quantity, min_stock, unit, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `)
    .run(
      tenantId,
      b.name.trim(),
      (b.category || 'Home Care').trim(),
      (b.sku || '').trim(),
      Number(b.price) || 0,
      Number(b.costPrice) || 0,
      Number(b.stockQuantity) || 0,
      Number(b.minStock) || 3,
      (b.unit || 'un').trim()
    );
  res.status(201).json({ id: Number(result.lastInsertRowid) });
});

app.put('/api/products/:id', (req, res) => {
  const tenantId = getTenantId(req);
  const id = Number(req.params.id);
  const b = req.body;
  db.prepare(`
    UPDATE products SET
      name = ?,
      category = ?,
      sku = ?,
      price = ?,
      cost_price = ?,
      stock_quantity = ?,
      min_stock = ?,
      unit = ?
    WHERE id = ? AND tenant_id = ?
  `).run(
    b.name.trim(),
    (b.category || 'Home Care').trim(),
    (b.sku || '').trim(),
    Number(b.price) || 0,
    Number(b.costPrice) || 0,
    Number(b.stockQuantity) || 0,
    Number(b.minStock) || 3,
    (b.unit || 'un').trim(),
    id,
    tenantId
  );
  res.json({ ok: true });
});

app.post('/api/products/:id/restock', (req, res) => {
  const tenantId = getTenantId(req);
  const id = Number(req.params.id);
  const delta = Number(req.body.quantity) || 0;
  const registerExpense = Boolean(req.body.registerExpense);

  runInTransaction(() => {
    const prod = db
      .prepare('SELECT * FROM products WHERE id = ? AND tenant_id = ?')
      .get(id, tenantId) as any;
    if (!prod) throw new Error('Produto não encontrado');

    const newStock = Math.max(0, prod.stock_quantity + delta);
    db.prepare('UPDATE products SET stock_quantity = ? WHERE id = ? AND tenant_id = ?').run(
      newStock,
      id,
      tenantId
    );

    if (registerExpense && delta > 0 && prod.cost_price > 0) {
      const totalCost = delta * prod.cost_price;
      db.prepare(`
        INSERT INTO manual_transactions (tenant_id, date, type, category, description, amount, payment_method)
        VALUES (?, ?, 'expense', 'Reposição de Estoque', ?, ?, 'pix')
      `).run(tenantId, getTodayStr(), `Compra de Estoque: ${delta}x ${prod.name}`, totalCost);
    }
  });

  res.json({ ok: true });
});

app.delete('/api/products/:id', (req, res) => {
  const tenantId = getTenantId(req);
  const id = Number(req.params.id);
  db.prepare('UPDATE products SET active = 0 WHERE id = ? AND tenant_id = ?').run(id, tenantId);
  res.json({ ok: true });
});

// ==========================================
// 6. APPOINTMENTS & ENCAIXE (OVERLAP ENGINE)
// ==========================================
app.get('/api/appointments/check-conflict', (req, res) => {
  const tenantId = getTenantId(req);
  const date = String(req.query.date || '');
  const professionalId = Number(req.query.professionalId);
  const startTime = String(req.query.startTime || '');
  const durationMinutes = Number(req.query.durationMinutes || 30);
  const excludeId = req.query.excludeId ? Number(req.query.excludeId) : null;

  if (!date || !professionalId || !startTime) {
    return res.json({ hasOverlap: false, overlappingAppointments: [] } satisfies ConflictCheckResult);
  }

  const newStart = timeToMinutes(startTime);
  const newEnd = newStart + durationMinutes;

  const existing = db
    .prepare(`
      SELECT
        a.id, a.start_time, a.end_time, a.is_fit_in,
        c.full_name as client_name,
        s.name as service_name, s.allows_fit_in_window
      FROM appointments a
      JOIN clients c ON c.id = a.client_id
      JOIN services s ON s.id = a.service_id
      WHERE a.tenant_id = ?
        AND a.date = ?
        AND a.professional_id = ?
        AND a.status != 'cancelled'
        ${excludeId ? 'AND a.id != ?' : ''}
      ORDER BY a.start_time ASC
    `)
    .all(...(excludeId ? [tenantId, date, professionalId, excludeId] : [tenantId, date, professionalId])) as any[];

  const overlapping = existing.filter((row) => {
    const start = timeToMinutes(row.start_time);
    const end = timeToMinutes(row.end_time);
    return newStart < end && newEnd > start;
  });

  const result: ConflictCheckResult = {
    hasOverlap: overlapping.length > 0,
    overlappingAppointments: overlapping.map((o) => ({
      id: o.id,
      clientName: o.client_name,
      serviceName: o.service_name,
      startTime: o.start_time,
      endTime: o.end_time,
      allowsFitInWindow: Boolean(o.allows_fit_in_window),
      isFitIn: Boolean(o.is_fit_in),
    })),
  };

  res.json(result);
});

app.get('/api/appointments', (req, res) => {
  const tenantId = getTenantId(req);
  const date = req.query.date ? String(req.query.date) : null;
  const professionalId = req.query.professionalId ? Number(req.query.professionalId) : null;

  let sql = `
    SELECT
      a.*,
      c.full_name as client_name,
      c.phone as client_phone,
      p.name as professional_name,
      p.color as professional_color,
      s.name as service_name,
      s.category as service_category,
      s.price_type as service_price_type
    FROM appointments a
    JOIN clients c ON c.id = a.client_id
    JOIN professionals p ON p.id = a.professional_id
    JOIN services s ON s.id = a.service_id
    WHERE a.tenant_id = ?
  `;
  const params: any[] = [tenantId];

  if (date) {
    sql += ' AND a.date = ?';
    params.push(date);
  }
  if (professionalId) {
    sql += ' AND a.professional_id = ?';
    params.push(professionalId);
  }

  sql += ' ORDER BY a.date DESC, a.start_time ASC, a.is_fit_in ASC';

  const rows = db.prepare(sql).all(...params) as any[];
  res.json(hydrateAppointments(rows, tenantId));
});

app.post('/api/appointments', (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const b = req.body;

    // Support multiple services or single serviceId fallback
    const rawServices: { serviceId: number; durationMinutes?: number; price?: number }[] =
      Array.isArray(b.services) && b.services.length > 0
        ? b.services
        : b.serviceId
        ? [{ serviceId: Number(b.serviceId), durationMinutes: b.durationMinutes, price: b.servicePrice }]
        : [];

    if (rawServices.length === 0) {
      return res.status(400).json({ error: 'Selecione pelo menos 1 serviço para o agendamento.' });
    }

    const resolvedServices: {
      serviceId: number;
      name: string;
      category: string;
      priceType: string;
      durationMinutes: number;
      price: number;
    }[] = [];

    let summedDuration = 0;
    let summedServicePrice = 0;

    for (const item of rawServices) {
      const srv = db
        .prepare('SELECT * FROM services WHERE id = ? AND tenant_id = ?')
        .get(Number(item.serviceId), tenantId) as any;
      if (!srv) continue;
      const dur = item.durationMinutes !== undefined && Number(item.durationMinutes) > 0
        ? Number(item.durationMinutes)
        : Number(srv.duration_minutes);
      const prc = item.price !== undefined ? Number(item.price) : Number(srv.base_price);
      summedDuration += dur;
      summedServicePrice += prc;
      resolvedServices.push({
        serviceId: srv.id,
        name: srv.name,
        category: srv.category,
        priceType: srv.price_type,
        durationMinutes: dur,
        price: prc,
      });
    }

    if (resolvedServices.length === 0) {
      return res.status(400).json({ error: 'Serviço inválido.' });
    }

    const durationMinutes =
      b.durationMinutes !== undefined && Number(b.durationMinutes) > 0
        ? Number(b.durationMinutes)
        : summedDuration;
    const servicePrice =
      b.servicePrice !== undefined ? Number(b.servicePrice) : summedServicePrice;

    const startMin = timeToMinutes(b.startTime);
    const endTime = minutesToTime(startMin + durationMinutes);

    // Check overlap to automatically tag or validate Fit-In (Encaixe)
    const existingRows = db
      .prepare(`
        SELECT id, start_time, end_time FROM appointments
        WHERE tenant_id = ? AND date = ? AND professional_id = ? AND status != 'cancelled'
      `)
      .all(tenantId, b.date, Number(b.professionalId)) as any[];

    const overlaps = existingRows.filter((r) => {
      const s = timeToMinutes(r.start_time);
      const e = timeToMinutes(r.end_time);
      return startMin < e && startMin + durationMinutes > s;
    });

    if (overlaps.length > 0 && !b.allowFitIn) {
      return res.status(409).json({
        error: 'Horário já ocupado para este profissional. Marque a opção de Encaixe para agendar simultaneamente.',
        overlaps,
      });
    }

    const isFitIn = overlaps.length > 0 || Boolean(b.isFitIn);
    const parentAppointmentId = overlaps.length > 0 ? overlaps[0].id : null;

    const discount = Number(b.discount) || 0;
    const productItems: { productId: number; quantity: number }[] = Array.isArray(b.products) ? b.products : [];

    const createdId = runInTransaction(() => {
      let productsTotal = 0;
      const resolvedProducts: {
        productId: number;
        name: string;
        quantity: number;
        unitPrice: number;
        costPrice: number;
        subtotal: number;
      }[] = [];

      for (const item of productItems) {
        if (!item.productId || item.quantity <= 0) continue;
        const prod = db
          .prepare('SELECT * FROM products WHERE id = ? AND tenant_id = ?')
          .get(Number(item.productId), tenantId) as any;
        if (!prod) continue;
        const qty = Number(item.quantity);
        const subtotal = prod.price * qty;
        productsTotal += subtotal;
        resolvedProducts.push({
          productId: prod.id,
          name: prod.name,
          quantity: qty,
          unitPrice: prod.price,
          costPrice: prod.cost_price,
          subtotal,
        });
      }

      const totalAmount = Math.max(0, servicePrice + productsTotal - discount);
      const primaryServiceId = resolvedServices[0].serviceId;

      const apptResult = db
        .prepare(`
          INSERT INTO appointments (
            tenant_id, date, start_time, end_time, duration_minutes,
            client_id, professional_id, service_id,
            service_price, products_total, discount, total_amount,
            is_fit_in, parent_appointment_id, status, payment_method, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', 'pending', ?)
        `)
        .run(
          tenantId,
          b.date,
          b.startTime,
          endTime,
          durationMinutes,
          Number(b.clientId),
          Number(b.professionalId),
          primaryServiceId,
          servicePrice,
          productsTotal,
          discount,
          totalAmount,
          isFitIn ? 1 : 0,
          parentAppointmentId,
          (b.notes || '').trim()
        );

      const appointmentId = Number(apptResult.lastInsertRowid);

      const insertSrv = db.prepare(`
        INSERT INTO appointment_services (
          appointment_id, service_id, service_name, service_category, price_type, duration_minutes, price
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const rs of resolvedServices) {
        insertSrv.run(
          appointmentId,
          rs.serviceId,
          rs.name,
          rs.category,
          rs.priceType,
          rs.durationMinutes,
          rs.price
        );
      }

      const insertProd = db.prepare(`
        INSERT INTO appointment_products (
          appointment_id, product_id, product_name, quantity, unit_price, cost_price, subtotal
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (const rp of resolvedProducts) {
        insertProd.run(appointmentId, rp.productId, rp.name, rp.quantity, rp.unitPrice, rp.costPrice, rp.subtotal);
      }

      return appointmentId;
    });

    res.status(201).json({ id: createdId });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Erro ao criar agendamento.' });
  }
});

// Update appointment details + multiple services + products (before or during service)
app.put('/api/appointments/:id', (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const id = Number(req.params.id);
    const b = req.body;

    runInTransaction(() => {
      const existing = db
        .prepare('SELECT * FROM appointments WHERE id = ? AND tenant_id = ?')
        .get(id, tenantId) as any;
      if (!existing) throw new Error('Agendamento não encontrado.');

      let primaryServiceId = b.serviceId ? Number(b.serviceId) : existing.service_id;
      let summedDuration = existing.duration_minutes;
      let summedServicePrice = existing.service_price;

      if (Array.isArray(b.services) && b.services.length > 0) {
        db.prepare('DELETE FROM appointment_services WHERE appointment_id = ?').run(id);
        const insertSrv = db.prepare(`
          INSERT INTO appointment_services (
            appointment_id, service_id, service_name, service_category, price_type, duration_minutes, price
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        summedDuration = 0;
        summedServicePrice = 0;
        let firstId = 0;

        for (const item of b.services) {
          const srv = db
            .prepare('SELECT * FROM services WHERE id = ? AND tenant_id = ?')
            .get(Number(item.serviceId), tenantId) as any;
          if (!srv) continue;
          if (!firstId) firstId = srv.id;
          const dur =
            item.durationMinutes !== undefined && Number(item.durationMinutes) > 0
              ? Number(item.durationMinutes)
              : Number(srv.duration_minutes);
          const prc = item.price !== undefined ? Number(item.price) : Number(srv.base_price);
          summedDuration += dur;
          summedServicePrice += prc;
          insertSrv.run(id, srv.id, srv.name, srv.category, srv.price_type, dur, prc);
        }

        if (firstId) primaryServiceId = firstId;
      }

      const durationMinutes =
        b.durationMinutes !== undefined && Number(b.durationMinutes) > 0
          ? Number(b.durationMinutes)
          : summedDuration;
      const startTime = b.startTime || existing.start_time;
      const endTime = minutesToTime(timeToMinutes(startTime) + durationMinutes);
      const servicePrice =
        b.servicePrice !== undefined ? Number(b.servicePrice) : summedServicePrice;
      const discount = b.discount !== undefined ? Number(b.discount) : existing.discount;

      let productsTotal = existing.products_total;

      if (Array.isArray(b.products)) {
        // If already completed, revert previous stock before applying new product list
        if (existing.status === 'completed') {
          const oldProds = db
            .prepare('SELECT product_id, quantity FROM appointment_products WHERE appointment_id = ?')
            .all(id) as any[];
          for (const op of oldProds) {
            db.prepare('UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ? AND tenant_id = ?').run(
              op.quantity,
              op.product_id,
              tenantId
            );
          }
        }

        db.prepare('DELETE FROM appointment_products WHERE appointment_id = ?').run(id);
        productsTotal = 0;

        const insertProd = db.prepare(`
          INSERT INTO appointment_products (
            appointment_id, product_id, product_name, quantity, unit_price, cost_price, subtotal
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        for (const item of b.products) {
          if (!item.productId || item.quantity <= 0) continue;
          const prod = db
            .prepare('SELECT * FROM products WHERE id = ? AND tenant_id = ?')
            .get(Number(item.productId), tenantId) as any;
          if (!prod) continue;
          const qty = Number(item.quantity);
          const unitPrice = item.unitPrice !== undefined ? Number(item.unitPrice) : prod.price;
          const subtotal = unitPrice * qty;
          productsTotal += subtotal;
          insertProd.run(id, prod.id, prod.name, qty, unitPrice, prod.cost_price, subtotal);

          if (existing.status === 'completed') {
            db.prepare('UPDATE products SET stock_quantity = MAX(0, stock_quantity - ?) WHERE id = ? AND tenant_id = ?').run(
              qty,
              prod.id,
              tenantId
            );
          }
        }
      }

      const totalAmount = Math.max(0, servicePrice + productsTotal - discount);

      db.prepare(`
        UPDATE appointments SET
          date = COALESCE(?, date),
          start_time = ?,
          end_time = ?,
          duration_minutes = ?,
          client_id = COALESCE(?, client_id),
          professional_id = COALESCE(?, professional_id),
          service_id = ?,
          service_price = ?,
          products_total = ?,
          discount = ?,
          total_amount = ?,
          is_fit_in = COALESCE(?, is_fit_in),
          notes = COALESCE(?, notes)
        WHERE id = ? AND tenant_id = ?
      `).run(
        b.date ?? null,
        startTime,
        endTime,
        durationMinutes,
        b.clientId ? Number(b.clientId) : null,
        b.professionalId ? Number(b.professionalId) : null,
        primaryServiceId,
        servicePrice,
        productsTotal,
        discount,
        totalAmount,
        b.isFitIn !== undefined ? (b.isFitIn ? 1 : 0) : null,
        b.notes ?? null,
        id,
        tenantId
      );
    });

    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Erro ao atualizar agendamento.' });
  }
});

// Change quick status (in_progress, cancelled, scheduled)
app.post('/api/appointments/:id/status', (req, res) => {
  const tenantId = getTenantId(req);
  const id = Number(req.params.id);
  const { status } = req.body;

  runInTransaction(() => {
    const appt = db
      .prepare('SELECT * FROM appointments WHERE id = ? AND tenant_id = ?')
      .get(id, tenantId) as any;
    if (!appt) throw new Error('Agendamento não encontrado');

    // If reverting from completed, restore stock
    if (appt.status === 'completed' && status !== 'completed') {
      const items = db
        .prepare('SELECT product_id, quantity FROM appointment_products WHERE appointment_id = ?')
        .all(id) as any[];
      for (const item of items) {
        db.prepare('UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ? AND tenant_id = ?').run(
          item.quantity,
          item.product_id,
          tenantId
        );
      }
    }

    db.prepare('UPDATE appointments SET status = ? WHERE id = ? AND tenant_id = ?').run(status, id, tenantId);
  });

  res.json({ ok: true });
});

// FINALIZE APPOINTMENT (Service Completed & Paid + Product Add-ons + Stock Deduction)
app.post('/api/appointments/:id/finalize', (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const id = Number(req.params.id);
    const { servicePrice, products, discount, paymentMethod, notes } = req.body;

    runInTransaction(() => {
      const appt = db
        .prepare('SELECT * FROM appointments WHERE id = ? AND tenant_id = ?')
        .get(id, tenantId) as any;
      if (!appt) throw new Error('Agendamento não encontrado.');

      // If already completed previously, restore previous product stock first before recalculating
      if (appt.status === 'completed') {
        const prevItems = db
          .prepare('SELECT product_id, quantity FROM appointment_products WHERE appointment_id = ?')
          .all(id) as any[];
        for (const pi of prevItems) {
          db.prepare('UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ? AND tenant_id = ?').run(
            pi.quantity,
            pi.product_id,
            tenantId
          );
        }
      }

      let productsTotal = 0;

      if (Array.isArray(products)) {
        db.prepare('DELETE FROM appointment_products WHERE appointment_id = ?').run(id);
        const insertProd = db.prepare(`
          INSERT INTO appointment_products (
            appointment_id, product_id, product_name, quantity, unit_price, cost_price, subtotal
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        for (const item of products) {
          if (!item.productId || item.quantity <= 0) continue;
          const prod = db
            .prepare('SELECT * FROM products WHERE id = ? AND tenant_id = ?')
            .get(Number(item.productId), tenantId) as any;
          if (!prod) throw new Error(`Produto #${item.productId} não encontrado.`);

          const qty = Number(item.quantity);
          if (prod.stock_quantity < qty) {
            throw new Error(
              `Estoque insuficiente para "${prod.name}" (Disponível: ${prod.stock_quantity}, Solicitado: ${qty}).`
            );
          }

          const unitPrice = item.unitPrice !== undefined ? Number(item.unitPrice) : prod.price;
          const subtotal = unitPrice * qty;
          productsTotal += subtotal;

          insertProd.run(id, prod.id, prod.name, qty, unitPrice, prod.cost_price, subtotal);
          db.prepare('UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ? AND tenant_id = ?').run(
            qty,
            prod.id,
            tenantId
          );
        }
      } else {
        // Deduct existing attached products
        const existingItems = db
          .prepare('SELECT * FROM appointment_products WHERE appointment_id = ?')
          .all(id) as any[];
        productsTotal = 0;
        for (const item of existingItems) {
          const prod = db
            .prepare('SELECT * FROM products WHERE id = ? AND tenant_id = ?')
            .get(item.product_id, tenantId) as any;
          if (prod && prod.stock_quantity < item.quantity) {
            throw new Error(
              `Estoque insuficiente para "${prod.name}" (Disponível: ${prod.stock_quantity}, Solicitado: ${item.quantity}).`
            );
          }
          productsTotal += item.subtotal;
          db.prepare('UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ? AND tenant_id = ?').run(
            item.quantity,
            item.product_id,
            tenantId
          );
        }
      }

      const finalServicePrice = servicePrice !== undefined ? Number(servicePrice) : appt.service_price;
      const finalDiscount = discount !== undefined ? Number(discount) : appt.discount;
      const totalAmount = Math.max(0, finalServicePrice + productsTotal - finalDiscount);

      db.prepare(`
        UPDATE appointments SET
          service_price = ?,
          products_total = ?,
          discount = ?,
          total_amount = ?,
          status = 'completed',
          payment_method = ?,
          paid_at = datetime('now', 'localtime'),
          is_refunded = 0,
          refund_reason = '',
          refunded_at = NULL,
          notes = COALESCE(?, notes)
        WHERE id = ? AND tenant_id = ?
      `).run(
        finalServicePrice,
        productsTotal,
        finalDiscount,
        totalAmount,
        paymentMethod || 'pix',
        notes ?? null,
        id,
        tenantId
      );
    });

    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Erro ao finalizar atendimento.' });
  }
});

// REFUND APPOINTMENT INCOME (Estorno de Comanda Finalizada com motivo obrigatório por escrito)
app.post('/api/appointments/:id/refund', (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const id = Number(req.params.id);
    const reason = String(req.body.reason || '').trim();
    if (!reason || reason.length < 3) {
      return res.status(400).json({ error: 'É obrigatório informar por escrito o motivo do estorno.' });
    }

    runInTransaction(() => {
      const appt = db
        .prepare('SELECT * FROM appointments WHERE id = ? AND tenant_id = ?')
        .get(id, tenantId) as any;
      if (!appt) throw new Error('Comanda / agendamento não encontrado.');
      if (appt.is_refunded) throw new Error('Esta comanda já foi estornada anteriormente.');

      // Restore product stock if it was completed
      if (appt.status === 'completed') {
        const items = db
          .prepare('SELECT product_id, quantity FROM appointment_products WHERE appointment_id = ?')
          .all(id) as any[];
        for (const item of items) {
          db.prepare('UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ? AND tenant_id = ?').run(
            item.quantity,
            item.product_id,
            tenantId
          );
        }
      }

      db.prepare(`
        UPDATE appointments SET
          is_refunded = 1,
          refund_reason = ?,
          refunded_at = datetime('now', 'localtime'),
          status = 'cancelled'
        WHERE id = ? AND tenant_id = ?
      `).run(reason, id, tenantId);
    });

    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Erro ao estornar comanda.' });
  }
});

app.delete('/api/appointments/:id', (req, res) => {
  const tenantId = getTenantId(req);
  const id = Number(req.params.id);
  runInTransaction(() => {
    const appt = db
      .prepare('SELECT * FROM appointments WHERE id = ? AND tenant_id = ?')
      .get(id, tenantId) as any;
    if (appt && appt.status === 'completed') {
      const prevItems = db
        .prepare('SELECT product_id, quantity FROM appointment_products WHERE appointment_id = ?')
        .all(id) as any[];
      for (const pi of prevItems) {
        db.prepare('UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ? AND tenant_id = ?').run(
          pi.quantity,
          pi.product_id,
          tenantId
        );
      }
    }
    db.prepare('DELETE FROM appointments WHERE id = ? AND tenant_id = ?').run(id, tenantId);
  });
  res.json({ ok: true });
});

// ==========================================
// 7. WHATSAPP & SMS NOTIFICATIONS
// ==========================================
app.get('/api/notifications', (req, res) => {
  const tenantId = getTenantId(req);
  const rows = db
    .prepare('SELECT * FROM notification_logs WHERE tenant_id = ? ORDER BY id DESC LIMIT 50')
    .all(tenantId) as any[];
  const list: NotificationLog[] = rows.map((r) => ({
    id: r.id,
    appointmentId: r.appointment_id,
    clientId: r.client_id,
    clientName: r.client_name,
    clientPhone: r.client_phone,
    channel: r.channel,
    message: r.message,
    status: r.status,
    createdAt: r.created_at,
  }));
  res.json(list);
});

app.post('/api/notifications/send', async (req, res) => {
  const tenantId = getTenantId(req);
  const { appointmentId, clientId, channel, customMessage } = req.body;
  const settings = db
    .prepare('SELECT * FROM company_settings WHERE tenant_id = ? LIMIT 1')
    .get(tenantId) as any;
  const client = db
    .prepare('SELECT * FROM clients WHERE id = ? AND tenant_id = ?')
    .get(Number(clientId), tenantId) as any;
  if (!client) return res.status(400).json({ error: 'Cliente não encontrado.' });

  let message = customMessage || '';
  if (!message && appointmentId) {
    const appt = db
      .prepare(`
        SELECT a.*, s.name as service_name, p.name as professional_name
        FROM appointments a
        JOIN services s ON s.id = a.service_id
        JOIN professionals p ON p.id = a.professional_id
        WHERE a.id = ? AND a.tenant_id = ?
      `)
      .get(Number(appointmentId), tenantId) as any;

    if (appt && settings) {
      const [y, m, d] = appt.date.split('-');
      const formattedDate = `${d}/${m}/${y}`;
      const formattedCurrency = `R$ ${Number(appt.total_amount).toFixed(2).replace('.', ',')}`;
      const tpl =
        channel === 'sms'
          ? settings.sms_template_reminder
          : appt.status === 'completed'
          ? settings.whatsapp_template_receipt
          : settings.whatsapp_template_reminder;

      message = tpl
        .replace(/\{cliente\}/g, client.full_name.split(' ')[0])
        .replace(/\{nome_completo\}/g, client.full_name)
        .replace(/\{servico\}/g, appt.service_name)
        .replace(/\{profissional\}/g, appt.professional_name)
        .replace(/\{empresa\}/g, settings.name)
        .replace(/\{data\}/g, formattedDate)
        .replace(/\{hora\}/g, appt.start_time)
        .replace(/\{valor\}/g, formattedCurrency);
    }
  }

  if (!message) {
    message = `Olá ${client.full_name}, mensagem de ${settings?.name || 'Estabelecimento'}.`;
  }

  const digits = String(client.phone).replace(/\D/g, '');
  const fullPhone = digits.startsWith('55') ? digits : `55${digits}`;

  let status: 'sent_link' | 'sent_webhook' | 'simulated' = channel === 'whatsapp' ? 'sent_link' : 'simulated';

  // If a Webhook (Z-API / Evolution API / Twilio) is configured, fire it asynchronously
  if (settings?.webhook_url && settings.webhook_url.startsWith('http')) {
    try {
      await fetch(settings.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel,
          phone: fullPhone,
          clientName: client.full_name,
          message,
          appointmentId: appointmentId || null,
        }),
      });
      status = 'sent_webhook';
    } catch {
      // Fallback to direct link if webhook unreachable
    }
  }

  const logResult = db
    .prepare(`
      INSERT INTO notification_logs (tenant_id, appointment_id, client_id, client_name, client_phone, channel, message, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(tenantId, appointmentId || null, client.id, client.full_name, client.phone, channel, message, status);

  const whatsappUrl = `https://wa.me/${fullPhone}?text=${encodeURIComponent(message)}`;
  const smsUrl = `sms:+${fullPhone}?body=${encodeURIComponent(message)}`;

  res.json({
    id: Number(logResult.lastInsertRowid),
    channel,
    message,
    status,
    whatsappUrl,
    smsUrl,
  });
});

// ==========================================
// 8. FINANCIAL MODULE (DAILY, WEEKLY, MONTHLY, ANNUAL)
// ==========================================
function computeDateRange(period: FinancialPeriod, refDateStr: string): {
  startDate: string;
  endDate: string;
  label: string;
} {
  const [y, m, d] = refDateStr.split('-').map(Number);
  const ref = new Date(y, m - 1, d);

  const fmt = (dt: Date) => {
    const yy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  };

  const ptMonths = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
  ];

  if (period === 'daily') {
    const s = fmt(ref);
    return {
      startDate: s,
      endDate: s,
      label: `Relatório Diário — ${String(d).padStart(2, '0')} de ${ptMonths[m - 1]} de ${y}`,
    };
  }

  if (period === 'weekly') {
    const dayOfWeek = ref.getDay(); // 0 = Sun, 1 = Mon
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const start = new Date(ref);
    start.setDate(ref.getDate() + diffToMonday);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const s = fmt(start);
    const e = fmt(end);
    return {
      startDate: s,
      endDate: e,
      label: `Relatório Semanal (${s.split('-').reverse().join('/')} a ${e.split('-').reverse().join('/')})`,
    };
  }

  if (period === 'monthly') {
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0);
    return {
      startDate: fmt(start),
      endDate: fmt(end),
      label: `Relatório Mensal — ${ptMonths[m - 1]} de ${y}`,
    };
  }

  // annual
  return {
    startDate: `${y}-01-01`,
    endDate: `${y}-12-31`,
    label: `Relatório Anual — Exercício ${y}`,
  };
}

app.get('/api/financial/report', (req, res) => {
  const tenantId = getTenantId(req);
  const period = (req.query.period as FinancialPeriod) || 'monthly';
  const referenceDate = (req.query.date as string) || getTodayStr();
  const { startDate, endDate, label } = computeDateRange(period, referenceDate);
  const rates = getCardFeeRates(tenantId);

  // Completed appointments in range (excluding refunded)
  const apptRows = db
    .prepare(`
      SELECT
        a.*,
        c.full_name as client_name,
        c.phone as client_phone,
        p.name as professional_name,
        p.color as professional_color,
        s.name as service_name,
        s.category as service_category,
        s.price_type as service_price_type
      FROM appointments a
      JOIN clients c ON c.id = a.client_id
      JOIN professionals p ON p.id = a.professional_id
      JOIN services s ON s.id = a.service_id
      WHERE a.tenant_id = ?
        AND a.status = 'completed'
        AND COALESCE(a.is_refunded, 0) = 0
        AND a.date >= ? AND a.date <= ?
      ORDER BY a.date DESC, a.start_time DESC
    `)
    .all(tenantId, startDate, endDate) as any[];

  const completedAppointments = hydrateAppointments(apptRows, tenantId);

  // Refunded appointments in range (for audit & display in ledger)
  const refundedApptRows = db
    .prepare(`
      SELECT
        a.*,
        c.full_name as client_name,
        c.phone as client_phone,
        p.name as professional_name,
        p.color as professional_color,
        s.name as service_name,
        s.category as service_category,
        s.price_type as service_price_type
      FROM appointments a
      JOIN clients c ON c.id = a.client_id
      JOIN professionals p ON p.id = a.professional_id
      JOIN services s ON s.id = a.service_id
      WHERE a.tenant_id = ?
        AND COALESCE(a.is_refunded, 0) = 1
        AND a.date >= ? AND a.date <= ?
      ORDER BY a.date DESC, a.start_time DESC
    `)
    .all(tenantId, startDate, endDate) as any[];

  const refundedAppointments = hydrateAppointments(refundedApptRows, tenantId);

  // Products sold in completed (non-refunded) appointments in range
  const soldProductRows = db
    .prepare(`
      SELECT
        ap.product_id,
        ap.product_name,
        ap.quantity,
        ap.unit_price,
        ap.cost_price,
        ap.subtotal,
        a.date
      FROM appointment_products ap
      JOIN appointments a ON a.id = ap.appointment_id
      WHERE a.tenant_id = ?
        AND a.status = 'completed'
        AND COALESCE(a.is_refunded, 0) = 0
        AND a.date >= ? AND a.date <= ?
    `)
    .all(tenantId, startDate, endDate) as any[];

  // Manual transactions in range
  const manualRows = db
    .prepare(`
      SELECT * FROM manual_transactions
      WHERE tenant_id = ? AND date >= ? AND date <= ?
      ORDER BY date DESC, id DESC
    `)
    .all(tenantId, startDate, endDate) as any[];

  const manualTransactions: ManualTransaction[] = manualRows.map((m) => {
    const isRef = Boolean(m.is_refunded);
    const feeData =
      m.type === 'income' && !isRef
        ? computeCardFeeForPayment(Number(m.amount) || 0, m.payment_method, rates)
        : { feePercent: 0, feeAmount: 0, netAmount: Number(m.amount) || 0 };

    return {
      id: m.id,
      date: m.date,
      type: m.type,
      category: m.category,
      description: m.description,
      amount: m.amount,
      paymentMethod: m.payment_method,
      isRefunded: isRef,
      refundReason: m.refund_reason || null,
      refundedAt: m.refunded_at || null,
      cardFeePercent: feeData.feePercent,
      cardFeeAmount: feeData.feeAmount,
      netAmountReceived: feeData.netAmount,
      createdAt: m.created_at,
    };
  });

  let servicesRevenue = 0;
  let fitInServicesCount = 0;
  let cardFeesTotal = 0;

  for (const a of completedAppointments) {
    servicesRevenue += Math.max(0, a.servicePrice - a.discount);
    if (a.isFitIn) fitInServicesCount++;
    cardFeesTotal += a.cardFeeAmount || 0;
  }

  let productsSoldCount = 0;
  let productsRevenue = 0;
  let productsCost = 0;
  for (const sp of soldProductRows) {
    productsSoldCount += sp.quantity;
    productsRevenue += sp.subtotal;
    productsCost += sp.cost_price * sp.quantity;
  }

  let otherIncome = 0;
  let expensesTotal = 0;
  for (const mt of manualTransactions) {
    if (mt.isRefunded) continue; // Refunded entries do not add to active income/expenses
    if (mt.type === 'income') {
      otherIncome += mt.amount;
      cardFeesTotal += mt.cardFeeAmount || 0;
    } else {
      expensesTotal += mt.amount;
    }
  }

  cardFeesTotal = Number(cardFeesTotal.toFixed(2));
  const grossRevenue = servicesRevenue + productsRevenue + otherIncome;
  const productsProfit = productsRevenue - productsCost;
  const netBalance = Number((grossRevenue - cardFeesTotal - productsCost - expensesTotal).toFixed(2));
  const servicesCount = completedAppointments.length;
  const averageTicket = servicesCount > 0 ? (servicesRevenue + productsRevenue) / servicesCount : 0;

  // Payment methods breakdown (including operational card machine fees)
  const methodLabels: Record<string, string> = {
    pix: 'PIX Instantâneo',
    credit_card: 'Cartão de Crédito',
    debit_card: 'Cartão de Débito',
    cash: 'Dinheiro / Espécie',
  };
  const paymentMap = new Map<string, { total: number; feeTotal: number; count: number }>();
  for (const key of Object.keys(methodLabels)) {
    paymentMap.set(key, { total: 0, feeTotal: 0, count: 0 });
  }
  for (const a of completedAppointments) {
    const key = methodLabels[a.paymentMethod] ? a.paymentMethod : 'pix';
    const curr = paymentMap.get(key)!;
    curr.total += a.totalAmount;
    curr.feeTotal += a.cardFeeAmount || 0;
    curr.count += 1;
  }
  for (const mt of manualTransactions) {
    if (mt.isRefunded || mt.type !== 'income') continue;
    const key = methodLabels[mt.paymentMethod] ? mt.paymentMethod : 'pix';
    const curr = paymentMap.get(key)!;
    curr.total += mt.amount;
    curr.feeTotal += mt.cardFeeAmount || 0;
    curr.count += 1;
  }

  const byPaymentMethod = Object.entries(methodLabels).map(([method, lbl]) => {
    const item = paymentMap.get(method) || { total: 0, feeTotal: 0, count: 0 };
    const feePercent =
      method === 'debit_card'
        ? rates.debitPercent
        : method === 'credit_card'
        ? rates.creditPercent
        : 0;
    const feeTotal = Number(item.feeTotal.toFixed(2));
    const netTotal = Number(Math.max(0, item.total - feeTotal).toFixed(2));
    return {
      method,
      label: lbl,
      total: item.total,
      feePercent,
      feeTotal,
      netTotal,
      count: item.count,
    };
  });

  // Top services (supports multiple services per appointment)
  const serviceMap = new Map<number, { serviceId: number; serviceName: string; count: number; revenue: number }>();
  for (const a of completedAppointments) {
    if (a.services && a.services.length > 0) {
      for (const s of a.services) {
        const curr = serviceMap.get(s.serviceId) || {
          serviceId: s.serviceId,
          serviceName: s.serviceName,
          count: 0,
          revenue: 0,
        };
        curr.count += 1;
        curr.revenue += s.price;
        serviceMap.set(s.serviceId, curr);
      }
    } else {
      const curr = serviceMap.get(a.serviceId) || {
        serviceId: a.serviceId,
        serviceName: a.serviceName,
        count: 0,
        revenue: 0,
      };
      curr.count += 1;
      curr.revenue += Math.max(0, a.servicePrice - a.discount);
      serviceMap.set(a.serviceId, curr);
    }
  }
  const topServices = Array.from(serviceMap.values()).sort((a, b) => b.revenue - a.revenue);

  // Top products
  const prodAggMap = new Map<
    number,
    { productId: number; productName: string; quantitySold: number; revenue: number; profit: number }
  >();
  for (const sp of soldProductRows) {
    const curr = prodAggMap.get(sp.product_id) || {
      productId: sp.product_id,
      productName: sp.product_name,
      quantitySold: 0,
      revenue: 0,
      profit: 0,
    };
    curr.quantitySold += sp.quantity;
    curr.revenue += sp.subtotal;
    curr.profit += sp.subtotal - sp.cost_price * sp.quantity;
    prodAggMap.set(sp.product_id, curr);
  }
  const topProducts = Array.from(prodAggMap.values()).sort((a, b) => b.revenue - a.revenue);

  // Timeline series for visual chart
  const timelineMap = new Map<
    string,
    { label: string; dateKey: string; servicesRevenue: number; productsRevenue: number; expenses: number }
  >();

  if (period === 'annual') {
    const shortMonths = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const yearStr = startDate.slice(0, 4);
    for (let i = 0; i < 12; i++) {
      const mKey = `${yearStr}-${String(i + 1).padStart(2, '0')}`;
      timelineMap.set(mKey, {
        label: shortMonths[i],
        dateKey: mKey,
        servicesRevenue: 0,
        productsRevenue: 0,
        expenses: 0,
      });
    }
    for (const a of completedAppointments) {
      const mKey = a.date.slice(0, 7);
      const bucket = timelineMap.get(mKey);
      if (bucket) {
        bucket.servicesRevenue += Math.max(0, a.servicePrice - a.discount);
        bucket.productsRevenue += a.productsTotal;
      }
    }
    for (const mt of manualTransactions) {
      if (mt.isRefunded) continue;
      const mKey = mt.date.slice(0, 7);
      const bucket = timelineMap.get(mKey);
      if (bucket && mt.type === 'expense') {
        bucket.expenses += mt.amount;
      }
    }
  } else {
    // Group by date
    const [sy, sm, sd] = startDate.split('-').map(Number);
    const [ey, em, ed] = endDate.split('-').map(Number);
    const cur = new Date(sy, sm - 1, sd);
    const last = new Date(ey, em - 1, ed);
    while (cur <= last) {
      const yy = cur.getFullYear();
      const mm = String(cur.getMonth() + 1).padStart(2, '0');
      const dd = String(cur.getDate()).padStart(2, '0');
      const key = `${yy}-${mm}-${dd}`;
      timelineMap.set(key, {
        label: `${dd}/${mm}`,
        dateKey: key,
        servicesRevenue: 0,
        productsRevenue: 0,
        expenses: 0,
      });
      cur.setDate(cur.getDate() + 1);
    }

    for (const a of completedAppointments) {
      const bucket = timelineMap.get(a.date);
      if (bucket) {
        bucket.servicesRevenue += Math.max(0, a.servicePrice - a.discount);
        bucket.productsRevenue += a.productsTotal;
      }
    }
    for (const mt of manualTransactions) {
      if (mt.isRefunded) continue;
      const bucket = timelineMap.get(mt.date);
      if (bucket && mt.type === 'expense') {
        bucket.expenses += mt.amount;
      }
    }
  }

  const report: FinancialReport = {
    period,
    referenceDate,
    startDate,
    endDate,
    label,
    summary: {
      servicesCount,
      servicesRevenue,
      fitInServicesCount,
      productsSoldCount,
      productsRevenue,
      productsCost,
      productsProfit,
      otherIncome,
      expensesTotal,
      cardFeesTotal,
      grossRevenue,
      netBalance,
      averageTicket,
    },
    byPaymentMethod,
    topServices,
    topProducts,
    timelineSeries: Array.from(timelineMap.values()),
    completedAppointments,
    refundedAppointments,
    manualTransactions,
  };

  res.json(report);
});

app.post('/api/financial/transactions', (req, res) => {
  const tenantId = getTenantId(req);
  const { date, type, category, description, amount, paymentMethod } = req.body;
  if (!description?.trim() || !amount) {
    return res.status(400).json({ error: 'Descrição e valor são obrigatórios.' });
  }
  const result = db
    .prepare(`
      INSERT INTO manual_transactions (tenant_id, date, type, category, description, amount, payment_method)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      tenantId,
      date || getTodayStr(),
      type === 'income' ? 'income' : 'expense',
      (category || 'Operacional').trim(),
      description.trim(),
      Number(amount),
      paymentMethod || 'pix'
    );
  res.status(201).json({ id: Number(result.lastInsertRowid) });
});

// REFUND MANUAL INCOME TRANSACTION (Estorno de Entrada Extra com motivo obrigatório por escrito)
app.post('/api/financial/transactions/:id/refund', (req, res) => {
  const tenantId = getTenantId(req);
  const id = Number(req.params.id);
  const reason = String(req.body.reason || '').trim();
  if (!reason || reason.length < 3) {
    return res.status(400).json({ error: 'É obrigatório informar por escrito o motivo do estorno.' });
  }
  const tx = db
    .prepare('SELECT * FROM manual_transactions WHERE id = ? AND tenant_id = ?')
    .get(id, tenantId) as any;
  if (!tx) return res.status(404).json({ error: 'Lançamento não encontrado.' });
  if (tx.type !== 'income') {
    return res.status(400).json({ error: 'Apenas valores de entrada podem ser estornados.' });
  }
  if (tx.is_refunded) {
    return res.status(400).json({ error: 'Esta entrada já foi estornada anteriormente.' });
  }

  db.prepare(`
    UPDATE manual_transactions SET
      is_refunded = 1,
      refund_reason = ?,
      refunded_at = datetime('now', 'localtime')
    WHERE id = ? AND tenant_id = ?
  `).run(reason, id, tenantId);

  res.json({ ok: true });
});

app.delete('/api/financial/transactions/:id', (req, res) => {
  const tenantId = getTenantId(req);
  const id = Number(req.params.id);
  db.prepare('DELETE FROM manual_transactions WHERE id = ? AND tenant_id = ?').run(id, tenantId);
  res.json({ ok: true });
});

// ==========================================
// 9. PAYABLE ACCOUNTS (CONTAS A PAGAR + RECORRÊNCIA MENSAL + ALERTAS DE VENCIMENTO)
// ==========================================
function computeDaysDiff(fromDateStr: string, toDateStr: string): number {
  const [fy, fm, fd] = fromDateStr.split('-').map(Number);
  const [ty, tm, td] = toDateStr.split('-').map(Number);
  const fromUtc = Date.UTC(fy, fm - 1, fd);
  const toUtc = Date.UTC(ty, tm - 1, td);
  return Math.round((toUtc - fromUtc) / (1000 * 60 * 60 * 24));
}

function addMonthsToDateStr(dateStr: string, monthsToAdd: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const targetYear = y + Math.floor((m - 1 + monthsToAdd) / 12);
  const targetMonthIndex = (((m - 1 + monthsToAdd) % 12) + 12) % 12;
  const maxDayInTargetMonth = new Date(targetYear, targetMonthIndex + 1, 0).getDate();
  const clampedDay = Math.min(d, maxDayInTargetMonth);
  return `${targetYear}-${String(targetMonthIndex + 1).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
}

app.get('/api/financial/payables', (req, res) => {
  const tenantId = getTenantId(req);
  const today = getTodayStr();
  const rows = db
    .prepare('SELECT * FROM payable_accounts WHERE tenant_id = ? ORDER BY status ASC, due_date ASC, id ASC')
    .all(tenantId) as any[];

  const list: PayableAccount[] = rows.map((r) => {
    const daysUntilDue = computeDaysDiff(today, r.due_date);
    let alertStatus: PayableDueAlertStatus = 'upcoming';
    if (r.status === 'paid') {
      alertStatus = 'paid';
    } else if (daysUntilDue < 0) {
      // 1 day or more after due date and not marked as paid -> Overdue (Vencida!)
      alertStatus = 'overdue';
    } else if (daysUntilDue === 0) {
      alertStatus = 'due_today';
    } else if (daysUntilDue <= 5) {
      // System notification when about to expire (up to 5 days before)
      alertStatus = 'due_soon';
    }

    return {
      id: r.id,
      description: r.description,
      category: r.category,
      amount: r.amount,
      dueDate: r.due_date,
      recurrenceType: r.recurrence_type as PayableRecurrence,
      installmentNumber: r.installment_number,
      totalInstallments: r.total_installments,
      recurrenceGroupId: r.recurrence_group_id,
      status: r.status,
      paidAt: r.paid_at,
      paymentMethod: r.payment_method,
      manualTransactionId: r.manual_transaction_id,
      refundReason: r.refund_reason || null,
      refundedAt: r.refunded_at || null,
      alertStatus,
      daysUntilDue,
    };
  });

  res.json(list);
});

app.post('/api/financial/payables', (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const {
      description,
      category,
      amount,
      dueDate,
      recurrenceType,
      totalInstallments,
      monthsCount,
      paymentMethod,
    } = req.body;

    if (!description?.trim() || !amount || !dueDate) {
      return res.status(400).json({ error: 'Descrição, valor e data de vencimento são obrigatórios.' });
    }

    const recType: PayableRecurrence =
      recurrenceType === 'monthly' || recurrenceType === 'installments' ? recurrenceType : 'once';
    const baseAmount = Number(amount);
    const cat = (category || 'Despesa Fixa').trim();
    const pm = paymentMethod || 'pix';
    const groupId = `${recType}-${Date.now()}`;

    const insertStmt = db.prepare(`
      INSERT INTO payable_accounts (
        tenant_id, description, category, amount, due_date, recurrence_type,
        installment_number, total_installments, recurrence_group_id, status, payment_method
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `);

    const createdIds: number[] = [];

    runInTransaction(() => {
      if (recType === 'once') {
        const resInsert = insertStmt.run(
          tenantId,
          description.trim(),
          cat,
          baseAmount,
          dueDate,
          'once',
          1,
          1,
          null,
          pm
        );
        createdIds.push(Number(resInsert.lastInsertRowid));
      } else if (recType === 'monthly') {
        // Schedule for all months (default 12 months ahead, e.g. Aluguel, Internet, Contabilidade)
        const count = Math.min(36, Math.max(2, Number(monthsCount) || 12));
        for (let i = 0; i < count; i++) {
          const targetDue = addMonthsToDateStr(dueDate, i);
          const resInsert = insertStmt.run(
            tenantId,
            description.trim(),
            cat,
            baseAmount,
            targetDue,
            'monthly',
            i + 1,
            count,
            groupId,
            pm
          );
          createdIds.push(Number(resInsert.lastInsertRowid));
        }
      } else if (recType === 'installments') {
        // Parcelado com fornecedor (e.g. 3x, 6x, 10x)
        const count = Math.min(48, Math.max(2, Number(totalInstallments) || 3));
        for (let i = 0; i < count; i++) {
          const targetDue = addMonthsToDateStr(dueDate, i);
          const resInsert = insertStmt.run(
            tenantId,
            `${description.trim()} (Parcela ${i + 1}/${count})`,
            cat,
            baseAmount,
            targetDue,
            'installments',
            i + 1,
            count,
            groupId,
            pm
          );
          createdIds.push(Number(resInsert.lastInsertRowid));
        }
      }
    });

    res.status(201).json({ ids: createdIds, count: createdIds.length });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Erro ao agendar conta a pagar.' });
  }
});

// MARK PAYABLE ACCOUNT AS PAID -> Automatically launches as Expense on the day in the financial balance
app.post('/api/financial/payables/:id/pay', (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const id = Number(req.params.id);
    const paymentMethod = req.body.paymentMethod || 'pix';
    const paymentDate = req.body.paymentDate || getTodayStr();

    runInTransaction(() => {
      const acc = db
        .prepare('SELECT * FROM payable_accounts WHERE id = ? AND tenant_id = ?')
        .get(id, tenantId) as any;
      if (!acc) throw new Error('Conta a pagar não encontrada.');
      if (acc.status === 'paid') throw new Error('Esta conta já está marcada como paga.');

      // Launch as an expense on the day in manual_transactions so it enters the financial balance
      const txRes = db
        .prepare(`
          INSERT INTO manual_transactions (tenant_id, date, type, category, description, amount, payment_method)
          VALUES (?, ?, 'expense', ?, ?, ?, ?)
        `)
        .run(
          tenantId,
          paymentDate,
          acc.category || 'Contas a Pagar',
          `[Conta Paga] ${acc.description}`,
          acc.amount,
          paymentMethod || acc.payment_method || 'pix'
        );

      const txId = Number(txRes.lastInsertRowid);

      db.prepare(`
        UPDATE payable_accounts SET
          status = 'paid',
          paid_at = ?,
          payment_method = ?,
          manual_transaction_id = ?,
          refund_reason = NULL,
          refunded_at = NULL
        WHERE id = ? AND tenant_id = ?
      `).run(paymentDate, paymentMethod || acc.payment_method || 'pix', txId, id, tenantId);
    });

    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Erro ao baixar conta a pagar.' });
  }
});

// UPDATE PAYABLE ACCOUNT (Edição com opção de atualizar todas as parcelas/meses subsequentes)
app.put('/api/financial/payables/:id', (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const id = Number(req.params.id);
    const { description, category, amount, dueDate, paymentMethod, updateSubsequent } = req.body;

    if (!description?.trim() || !amount || !dueDate) {
      return res.status(400).json({ error: 'Descrição, valor e data de vencimento são obrigatórios.' });
    }

    runInTransaction(() => {
      const acc = db
        .prepare('SELECT * FROM payable_accounts WHERE id = ? AND tenant_id = ?')
        .get(id, tenantId) as any;
      if (!acc) throw new Error('Conta a pagar não encontrada.');

      const newDesc = description.trim();
      const newCat = (category || acc.category || 'Operacional').trim();
      const newAmount = Number(amount);
      const newDueDate = dueDate;
      const newPm = paymentMethod || acc.payment_method || 'pix';

      db.prepare(`
        UPDATE payable_accounts SET
          description = ?,
          category = ?,
          amount = ?,
          due_date = ?,
          payment_method = ?
        WHERE id = ? AND tenant_id = ?
      `).run(newDesc, newCat, newAmount, newDueDate, newPm, id, tenantId);

      if (acc.status === 'paid' && acc.manual_transaction_id) {
        db.prepare(`
          UPDATE manual_transactions SET
            category = ?,
            description = ?,
            amount = ?,
            payment_method = ?
          WHERE id = ? AND tenant_id = ?
        `).run(newCat, `[Conta Paga] ${newDesc}`, newAmount, newPm, acc.manual_transaction_id, tenantId);
      }

      if (updateSubsequent && acc.recurrence_group_id) {
        // Strip "(Parcela X/Y)" suffix if present so we can rebuild clean labels for subsequent installments
        const baseDescription = newDesc.replace(/\s*\(Parcela\s+\d+\/\d+\)\s*$/i, '').trim();

        const subsequentRows = db
          .prepare(`
            SELECT * FROM payable_accounts
            WHERE tenant_id = ?
              AND recurrence_group_id = ?
              AND id != ?
              AND (
                (installment_number IS NOT NULL AND ? IS NOT NULL AND installment_number > ?)
                OR due_date > ?
              )
            ORDER BY installment_number ASC, due_date ASC
          `)
          .all(
            tenantId,
            acc.recurrence_group_id,
            id,
            acc.installment_number,
            acc.installment_number,
            acc.due_date
          ) as any[];

        for (let idx = 0; idx < subsequentRows.length; idx++) {
          const sub = subsequentRows[idx];
          const monthOffset =
            sub.installment_number && acc.installment_number
              ? sub.installment_number - acc.installment_number
              : idx + 1;
          const targetDue = addMonthsToDateStr(newDueDate, monthOffset);
          const subDesc =
            sub.recurrence_type === 'installments' && sub.installment_number && sub.total_installments
              ? `${baseDescription} (Parcela ${sub.installment_number}/${sub.total_installments})`
              : baseDescription;

          db.prepare(`
            UPDATE payable_accounts SET
              description = ?,
              category = ?,
              amount = ?,
              due_date = ?,
              payment_method = ?
            WHERE id = ? AND tenant_id = ?
          `).run(subDesc, newCat, newAmount, targetDue, newPm, sub.id, tenantId);

          if (sub.status === 'paid' && sub.manual_transaction_id) {
            db.prepare(`
              UPDATE manual_transactions SET
                category = ?,
                description = ?,
                amount = ?,
                payment_method = ?
              WHERE id = ? AND tenant_id = ?
            `).run(newCat, `[Conta Paga] ${subDesc}`, newAmount, newPm, sub.manual_transaction_id, tenantId);
          }
        }
      }
    });

    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Erro ao editar conta a pagar.' });
  }
});

// REFUND A PAID PAYABLE ACCOUNT (Estornar conta paga -> exige motivo e remove a despesa do Balanço)
app.post('/api/financial/payables/:id/refund', (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const id = Number(req.params.id);
    const reason = String(req.body.reason || '').trim();
    if (!reason || reason.length < 3) {
      return res.status(400).json({ error: 'É obrigatório informar por escrito o motivo do estorno.' });
    }

    runInTransaction(() => {
      const acc = db
        .prepare('SELECT * FROM payable_accounts WHERE id = ? AND tenant_id = ?')
        .get(id, tenantId) as any;
      if (!acc) throw new Error('Conta a pagar não encontrada.');
      if (acc.status !== 'paid') {
        throw new Error('Apenas contas já pagas podem ter o pagamento estornado.');
      }

      // Remove the expense from manual_transactions so it is removed from the Financial Balance
      if (acc.manual_transaction_id) {
        db.prepare('DELETE FROM manual_transactions WHERE id = ? AND tenant_id = ?').run(
          acc.manual_transaction_id,
          tenantId
        );
      } else {
        // Fallback if manual_transaction_id wasn't linked
        db.prepare(`
          DELETE FROM manual_transactions
          WHERE tenant_id = ?
            AND type = 'expense'
            AND date = ?
            AND amount = ?
            AND description = ?
        `).run(tenantId, acc.paid_at || acc.due_date, acc.amount, `[Conta Paga] ${acc.description}`);
      }

      db.prepare(`
        UPDATE payable_accounts SET
          status = 'pending',
          paid_at = NULL,
          manual_transaction_id = NULL,
          refund_reason = ?,
          refunded_at = datetime('now', 'localtime')
        WHERE id = ? AND tenant_id = ?
      `).run(reason, id, tenantId);
    });

    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Erro ao estornar pagamento da conta.' });
  }
});

app.delete('/api/financial/payables/:id', (req, res) => {
  const tenantId = getTenantId(req);
  const id = Number(req.params.id);
  const deleteSubsequent =
    req.query.deleteSubsequent === 'true' || req.query.deleteAllGroup === 'true';

  runInTransaction(() => {
    const acc = db
      .prepare('SELECT * FROM payable_accounts WHERE id = ? AND tenant_id = ?')
      .get(id, tenantId) as any;
    if (!acc) return;

    if (deleteSubsequent && acc.recurrence_group_id) {
      const toDelete = db
        .prepare(`
          SELECT id, manual_transaction_id FROM payable_accounts
          WHERE tenant_id = ?
            AND recurrence_group_id = ?
            AND (
              id = ?
              OR (installment_number IS NOT NULL AND ? IS NOT NULL AND installment_number >= ?)
              OR due_date >= ?
            )
        `)
        .all(
          tenantId,
          acc.recurrence_group_id,
          id,
          acc.installment_number,
          acc.installment_number,
          acc.due_date
        ) as any[];

      for (const row of toDelete) {
        if (row.manual_transaction_id) {
          db.prepare('DELETE FROM manual_transactions WHERE id = ? AND tenant_id = ?').run(
            row.manual_transaction_id,
            tenantId
          );
        }
        db.prepare('DELETE FROM payable_accounts WHERE id = ? AND tenant_id = ?').run(row.id, tenantId);
      }
    } else {
      if (acc.manual_transaction_id) {
        db.prepare('DELETE FROM manual_transactions WHERE id = ? AND tenant_id = ?').run(
          acc.manual_transaction_id,
          tenantId
        );
      }
      db.prepare('DELETE FROM payable_accounts WHERE id = ? AND tenant_id = ?').run(id, tenantId);
    }
  });

  res.json({ ok: true });
});

// ==========================================
// 10. PAINEL ADMINISTRATIVO DO SAAS (SUPERADMIN)
// ==========================================
function requireSuperAdmin(req: express.Request, res: express.Response): AuthUser | null {
  const user = getAuthUserFromRequest(req);
  if (!user || user.role !== 'superadmin') {
    res.status(403).json({ error: 'Acesso restrito ao Painel Administrador.' });
    return null;
  }
  return user;
}

app.get('/api/admin/overview', (req, res) => {
  if (!requireSuperAdmin(req, res)) return;

  const tenantRows = db
    .prepare('SELECT * FROM saas_tenants ORDER BY id DESC')
    .all() as any[];

  const tenants: SaasTenant[] = tenantRows.map((t) => {
    const tid = t.id;
    const apptStats = db
      .prepare(`
        SELECT
          COUNT(*) as total_appointments,
          SUM(CASE WHEN status = 'completed' AND COALESCE(is_refunded, 0) = 0 THEN 1 ELSE 0 END) as completed_appointments,
          SUM(CASE WHEN status = 'completed' AND COALESCE(is_refunded, 0) = 0 THEN total_amount ELSE 0 END) as gross_revenue,
          MAX(date) as last_appointment_date
        FROM appointments
        WHERE tenant_id = ?
      `)
      .get(tid) as any;

    const clientsCount =
      (db.prepare('SELECT COUNT(*) as c FROM clients WHERE tenant_id = ?').get(tid) as any)?.c || 0;
    const profsCount =
      (
        db
          .prepare('SELECT COUNT(*) as c FROM professionals WHERE tenant_id = ? AND active = 1')
          .get(tid) as any
      )?.c || 0;
    const servicesCount =
      (
        db
          .prepare('SELECT COUNT(*) as c FROM services WHERE tenant_id = ? AND active = 1')
          .get(tid) as any
      )?.c || 0;
    const productsCount =
      (
        db
          .prepare('SELECT COUNT(*) as c FROM products WHERE tenant_id = ? AND active = 1')
          .get(tid) as any
      )?.c || 0;

    return {
      id: t.id,
      name: t.name,
      ownerName: t.owner_name,
      email: t.email,
      phone: t.phone,
      document: t.document,
      businessType: t.business_type,
      planName: t.plan_name,
      monthlyFee: Number(t.monthly_fee) || 0,
      dueDay: Number(t.due_day) || 10,
      status: t.status,
      notes: t.notes || '',
      createdAt: t.created_at,
      lastLoginAt: t.last_login_at || null,
      metrics: {
        appointmentsTotal: Number(apptStats?.total_appointments) || 0,
        completedAppointments: Number(apptStats?.completed_appointments) || 0,
        clientsCount: Number(clientsCount) || 0,
        professionalsCount: Number(profsCount) || 0,
        servicesCount: Number(servicesCount) || 0,
        productsCount: Number(productsCount) || 0,
        grossRevenueProcessed: Number(apptStats?.gross_revenue) || 0,
        lastAppointmentDate: apptStats?.last_appointment_date || null,
      },
    };
  });

  const paymentRows = db
    .prepare(`
      SELECT
        p.*,
        t.name as tenant_name,
        t.owner_name
      FROM saas_payments p
      JOIN saas_tenants t ON t.id = p.tenant_id
      ORDER BY p.due_date DESC, p.id DESC
    `)
    .all() as any[];

  const todayStr = getTodayStr();
  const payments: SaasPayment[] = paymentRows.map((p) => {
    let status = p.status as 'paid' | 'pending' | 'overdue';
    if (status === 'pending' && p.due_date < todayStr) {
      status = 'overdue';
    }
    return {
      id: p.id,
      tenantId: p.tenant_id,
      tenantName: p.tenant_name,
      ownerName: p.owner_name,
      referenceMonth: p.reference_month,
      amount: Number(p.amount) || 0,
      dueDate: p.due_date,
      paidAt: p.paid_at || null,
      status,
      paymentMethod: p.payment_method || 'pix',
      notes: p.notes || '',
      createdAt: p.created_at,
    };
  });

  const staffRows = db
    .prepare(
      "SELECT id, name, email, role, active, created_at, last_login_at FROM users WHERE role = 'superadmin' ORDER BY id ASC"
    )
    .all() as any[];

  const currentMonthPrefix = todayStr.slice(0, 7);
  const activeTenants = tenants.filter((t) => t.status === 'active' || t.status === 'trial').length;
  const suspendedTenants = tenants.filter((t) => t.status === 'suspended').length;
  const mrr = tenants
    .filter((t) => t.status === 'active')
    .reduce((acc, t) => acc + t.monthlyFee, 0);

  const receivedThisMonth = payments
    .filter(
      (p) =>
        p.status === 'paid' &&
        ((p.paidAt && p.paidAt.startsWith(currentMonthPrefix)) ||
          p.referenceMonth === currentMonthPrefix)
    )
    .reduce((acc, p) => acc + p.amount, 0);

  const pendingPaymentsTotal = payments
    .filter((p) => p.status !== 'paid')
    .reduce((acc, p) => acc + p.amount, 0);

  const totalPlatformAppointments = tenants.reduce(
    (acc, t) => acc + t.metrics.appointmentsTotal,
    0
  );
  const totalPlatformClients = tenants.reduce((acc, t) => acc + t.metrics.clientsCount, 0);

  const overview: SaasAdminOverview = {
    summary: {
      totalTenants: tenants.length,
      activeTenants,
      suspendedTenants,
      mrr,
      receivedThisMonth,
      pendingPaymentsTotal,
      totalPlatformAppointments,
      totalPlatformClients,
    },
    tenants,
    payments,
    adminStaff: staffRows.map((s) => ({
      id: s.id,
      name: s.name,
      email: s.email,
      role: s.role,
      active: Boolean(s.active),
      createdAt: s.created_at,
      lastLoginAt: s.last_login_at || null,
    })),
  };

  res.json(overview);
});

// Create a new Hairdresser / Salon Client (Tenant + User Credentials + Workspace)
app.post('/api/admin/tenants', (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  try {
    const {
      name,
      ownerName,
      email,
      password,
      phone,
      document,
      businessType,
      planName,
      monthlyFee,
      dueDay,
      status,
      notes,
    } = req.body;

    if (!name?.trim() || !email?.trim() || !password?.trim()) {
      return res.status(400).json({
        error: 'Nome do estabelecimento, e-mail de login e senha inicial são obrigatórios.',
      });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const existingUser = db
      .prepare('SELECT id FROM users WHERE LOWER(email) = ?')
      .get(cleanEmail) as any;
    if (existingUser) {
      return res.status(400).json({ error: 'Já existe um usuário cadastrado com este e-mail.' });
    }

    const createdTenantId = runInTransaction(() => {
      const tRes = db
        .prepare(`
          INSERT INTO saas_tenants (
            name, owner_name, email, phone, document, business_type,
            plan_name, monthly_fee, due_day, status, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          name.trim(),
          (ownerName || name).trim(),
          cleanEmail,
          (phone || '').trim(),
          (document || '').trim(),
          businessType || 'Cabelo & Barba',
          planName || 'Plano Profissional',
          Number(monthlyFee) || 99.9,
          Number(dueDay) || 10,
          status || 'active',
          (notes || '').trim()
        );

      const newTenantId = Number(tRes.lastInsertRowid);

      db.prepare(`
        INSERT INTO users (name, email, password_hash, role, tenant_id, active)
        VALUES (?, ?, ?, 'tenant', ?, 1)
      `).run((ownerName || name).trim(), cleanEmail, hashPassword(String(password)), newTenantId);

      // Provision initial salon workspace (company_settings, default professional, basic services)
      ensureTenantWorkspace(
        newTenantId,
        name.trim(),
        businessType || 'Cabelo & Barba',
        (phone || '').trim(),
        (ownerName || name).trim()
      );

      // Create initial current month subscription invoice
      const today = getTodayStr();
      const refMonth = today.slice(0, 7);
      const dayStr = String(Math.min(28, Math.max(1, Number(dueDay) || 10))).padStart(2, '0');
      db.prepare(`
        INSERT INTO saas_payments (tenant_id, reference_month, amount, due_date, status, payment_method, notes)
        VALUES (?, ?, ?, ?, 'pending', 'pix', 'Primeira mensalidade')
      `).run(newTenantId, refMonth, Number(monthlyFee) || 99.9, `${refMonth}-${dayStr}`);

      return newTenantId;
    });

    res.status(201).json({ id: createdTenantId });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Erro ao cadastrar cliente.' });
  }
});

// Update Tenant details, status (active/suspended) or reset credentials
app.put('/api/admin/tenants/:id', (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  try {
    const id = Number(req.params.id);
    const {
      name,
      ownerName,
      email,
      newPassword,
      phone,
      document,
      businessType,
      planName,
      monthlyFee,
      dueDay,
      status,
      notes,
    } = req.body;

    const existing = db.prepare('SELECT * FROM saas_tenants WHERE id = ?').get(id) as any;
    if (!existing) return res.status(404).json({ error: 'Cliente não encontrado.' });

    const cleanEmail = email ? String(email).trim().toLowerCase() : existing.email;

    runInTransaction(() => {
      db.prepare(`
        UPDATE saas_tenants SET
          name = ?,
          owner_name = ?,
          email = ?,
          phone = ?,
          document = ?,
          business_type = ?,
          plan_name = ?,
          monthly_fee = ?,
          due_day = ?,
          status = ?,
          notes = ?
        WHERE id = ?
      `).run(
        (name ?? existing.name).trim(),
        (ownerName ?? existing.owner_name).trim(),
        cleanEmail,
        (phone ?? existing.phone).trim(),
        (document ?? existing.document).trim(),
        businessType ?? existing.business_type,
        planName ?? existing.plan_name,
        monthlyFee !== undefined ? Number(monthlyFee) : existing.monthly_fee,
        dueDay !== undefined ? Number(dueDay) : existing.due_day,
        status ?? existing.status,
        (notes ?? existing.notes).trim(),
        id
      );

      // Sync user email / name / password if provided
      const tenantUser = db
        .prepare("SELECT * FROM users WHERE tenant_id = ? AND role = 'tenant' LIMIT 1")
        .get(id) as any;

      if (tenantUser) {
        if (newPassword && String(newPassword).trim().length >= 4) {
          db.prepare(
            'UPDATE users SET name = ?, email = ?, password_hash = ? WHERE id = ?'
          ).run(
            (ownerName ?? existing.owner_name).trim(),
            cleanEmail,
            hashPassword(String(newPassword).trim()),
            tenantUser.id
          );
        } else {
          db.prepare('UPDATE users SET name = ?, email = ? WHERE id = ?').run(
            (ownerName ?? existing.owner_name).trim(),
            cleanEmail,
            tenantUser.id
          );
        }
      } else if (newPassword) {
        db.prepare(`
          INSERT INTO users (name, email, password_hash, role, tenant_id, active)
          VALUES (?, ?, ?, 'tenant', ?, 1)
        `).run(
          (ownerName ?? existing.owner_name).trim(),
          cleanEmail,
          hashPassword(String(newPassword).trim()),
          id
        );
      }
    });

    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Erro ao atualizar cliente.' });
  }
});

app.delete('/api/admin/tenants/:id', (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const id = Number(req.params.id);
  runInTransaction(() => {
    db.prepare('DELETE FROM users WHERE tenant_id = ?').run(id);
    db.prepare('DELETE FROM saas_payments WHERE tenant_id = ?').run(id);
    db.prepare('DELETE FROM saas_tenants WHERE id = ?').run(id);
  });
  res.json({ ok: true });
});

// Launch / Create SaaS Subscription Payment for a Client
app.post('/api/admin/payments', (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  try {
    const { tenantId, referenceMonth, amount, dueDate, status, paymentMethod, notes } = req.body;
    if (!tenantId || !amount || !dueDate) {
      return res.status(400).json({ error: 'Cliente, valor e vencimento são obrigatórios.' });
    }

    const isPaid = status === 'paid';
    const paidAt = isPaid ? req.body.paidAt || getTodayStr() : null;
    const refMonth = referenceMonth || String(dueDate).slice(0, 7);

    const result = db
      .prepare(`
        INSERT INTO saas_payments (
          tenant_id, reference_month, amount, due_date, paid_at, status, payment_method, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        Number(tenantId),
        refMonth,
        Number(amount),
        dueDate,
        paidAt,
        isPaid ? 'paid' : 'pending',
        paymentMethod || 'pix',
        (notes || '').trim()
      );

    res.status(201).json({ id: Number(result.lastInsertRowid) });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Erro ao lançar pagamento.' });
  }
});

// Mark SaaS payment as paid or pending
app.put('/api/admin/payments/:id', (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const id = Number(req.params.id);
  const { status, paymentMethod, paidAt, amount, dueDate, notes } = req.body;
  const existing = db.prepare('SELECT * FROM saas_payments WHERE id = ?').get(id) as any;
  if (!existing) return res.status(404).json({ error: 'Pagamento não encontrado.' });

  const newStatus = status || existing.status;
  const newPaidAt =
    newStatus === 'paid' ? paidAt || existing.paid_at || getTodayStr() : null;

  db.prepare(`
    UPDATE saas_payments SET
      status = ?,
      paid_at = ?,
      payment_method = ?,
      amount = ?,
      due_date = ?,
      notes = ?
    WHERE id = ?
  `).run(
    newStatus,
    newPaidAt,
    paymentMethod ?? existing.payment_method,
    amount !== undefined ? Number(amount) : existing.amount,
    dueDate ?? existing.due_date,
    notes !== undefined ? String(notes).trim() : existing.notes,
    id
  );

  res.json({ ok: true });
});

app.delete('/api/admin/payments/:id', (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const id = Number(req.params.id);
  db.prepare('DELETE FROM saas_payments WHERE id = ?').run(id);
  res.json({ ok: true });
});

// Create internal Admin / Employee account for the SaaS team
app.post('/api/admin/staff', (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  try {
    const { name, email, password } = req.body;
    if (!name?.trim() || !email?.trim() || !password?.trim()) {
      return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios.' });
    }
    const cleanEmail = String(email).trim().toLowerCase();
    const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(cleanEmail);
    if (existing) {
      return res.status(400).json({ error: 'Já existe um usuário com este e-mail.' });
    }

    const r = db
      .prepare(`
        INSERT INTO users (name, email, password_hash, role, tenant_id, active)
        VALUES (?, ?, ?, 'superadmin', NULL, 1)
      `)
      .run(name.trim(), cleanEmail, hashPassword(String(password).trim()));

    res.status(201).json({ id: Number(r.lastInsertRowid) });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Erro ao cadastrar administrador.' });
  }
});

app.delete('/api/admin/staff/:id', (req, res) => {
  const currentUser = requireSuperAdmin(req, res);
  if (!currentUser) return;
  const id = Number(req.params.id);
  if (id === currentUser.id) {
    return res.status(400).json({ error: 'Você não pode excluir seu próprio usuário logado.' });
  }
  db.prepare("DELETE FROM users WHERE id = ? AND role = 'superadmin'").run(id);
  res.json({ ok: true });
});

const PORT = Number(process.env.PORT) || 3333;
app.listen(PORT, () => {
  console.log(`[Agenda Hair API] Rodando em http://localhost:${PORT}`);
});
