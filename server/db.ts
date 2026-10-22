import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, key] = (storedHash || '').split(':');
  if (!salt || !key) return false;
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(key, 'hex'), Buffer.from(derived, 'hex'));
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'agenda_hair.sqlite');
export const db = new DatabaseSync(dbPath);

// Configure SQLite for high concurrency, zero corruption, and relational integrity
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
`);

export function runInTransaction<T>(fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function getTodayStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysStr(baseDateStr: string, offsetDays: number): string {
  const [y, m, d] = baseDateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + offsetDays);
  const ny = dt.getFullYear();
  const nm = String(dt.getMonth() + 1).padStart(2, '0');
  const nd = String(dt.getDate()).padStart(2, '0');
  return `${ny}-${nm}-${nd}`;
}

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS company_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      name TEXT NOT NULL,
      subtitle TEXT NOT NULL DEFAULT '',
      business_type TEXT NOT NULL DEFAULT 'hybrid',
      phone TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      accent_color TEXT NOT NULL DEFAULT '#9E5A3C',
      open_time TEXT NOT NULL DEFAULT '08:00',
      close_time TEXT NOT NULL DEFAULT '20:00',
      slot_interval_minutes INTEGER NOT NULL DEFAULT 30,
      whatsapp_template_reminder TEXT NOT NULL,
      whatsapp_template_receipt TEXT NOT NULL,
      sms_template_reminder TEXT NOT NULL,
      webhook_url TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS professionals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#9E5A3C',
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      price_type TEXT NOT NULL CHECK (price_type IN ('fixed', 'variable')),
      base_price REAL NOT NULL,
      max_price REAL,
      allows_fit_in_window INTEGER NOT NULL DEFAULT 0,
      description TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      sku TEXT NOT NULL DEFAULT '',
      price REAL NOT NULL,
      cost_price REAL NOT NULL DEFAULT 0,
      stock_quantity INTEGER NOT NULL DEFAULT 0,
      min_stock INTEGER NOT NULL DEFAULT 3,
      unit TEXT NOT NULL DEFAULT 'un',
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      client_id INTEGER NOT NULL,
      professional_id INTEGER NOT NULL,
      service_id INTEGER NOT NULL,
      service_price REAL NOT NULL,
      products_total REAL NOT NULL DEFAULT 0,
      discount REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL,
      is_fit_in INTEGER NOT NULL DEFAULT 0,
      parent_appointment_id INTEGER,
      status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
      payment_method TEXT NOT NULL DEFAULT 'pending',
      paid_at TEXT,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (client_id) REFERENCES clients(id),
      FOREIGN KEY (professional_id) REFERENCES professionals(id),
      FOREIGN KEY (service_id) REFERENCES services(id)
    );

    CREATE INDEX IF NOT EXISTS idx_appointments_date_prof ON appointments(date, professional_id);
    CREATE INDEX IF NOT EXISTS idx_appointments_status_date ON appointments(status, date);

    CREATE TABLE IF NOT EXISTS appointment_services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      appointment_id INTEGER NOT NULL,
      service_id INTEGER NOT NULL,
      service_name TEXT NOT NULL,
      service_category TEXT NOT NULL DEFAULT '',
      price_type TEXT NOT NULL DEFAULT 'fixed',
      duration_minutes INTEGER NOT NULL,
      price REAL NOT NULL,
      FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
      FOREIGN KEY (service_id) REFERENCES services(id)
    );

    CREATE TABLE IF NOT EXISTS appointment_products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      appointment_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      cost_price REAL NOT NULL DEFAULT 0,
      subtotal REAL NOT NULL,
      FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS notification_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      appointment_id INTEGER,
      client_id INTEGER NOT NULL,
      client_name TEXT NOT NULL,
      client_phone TEXT NOT NULL,
      channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'sms')),
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'sent_link',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS manual_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'pix',
      is_refunded INTEGER NOT NULL DEFAULT 0,
      refund_reason TEXT,
      refunded_at TEXT,
      card_fee_percent REAL NOT NULL DEFAULT 0,
      card_fee_amount REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS payable_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Operacional',
      amount REAL NOT NULL,
      due_date TEXT NOT NULL,
      recurrence_type TEXT NOT NULL DEFAULT 'once' CHECK (recurrence_type IN ('once', 'monthly', 'installments')),
      installment_number INTEGER,
      total_installments INTEGER,
      recurrence_group_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
      paid_at TEXT,
      payment_method TEXT NOT NULL DEFAULT 'pix',
      manual_transaction_id INTEGER,
      refund_reason TEXT,
      refunded_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
  `);

  const settingsCount = db.prepare('SELECT COUNT(*) as cnt FROM company_settings').get() as { cnt: number };
  if (settingsCount.cnt === 0) {
    seedInitialData();
  }

  // Safe migrations for company_settings
  const stgCols = db.prepare("PRAGMA table_info('company_settings')").all() as any[];
  if (!stgCols.some((c) => c.name === 'completed_display_mode')) {
    db.exec(
      "ALTER TABLE company_settings ADD COLUMN completed_display_mode TEXT NOT NULL DEFAULT 'dimmed_strikethrough'"
    );
  }
  if (!stgCols.some((c) => c.name === 'debit_card_fee_percent')) {
    db.exec("ALTER TABLE company_settings ADD COLUMN debit_card_fee_percent REAL NOT NULL DEFAULT 1.49");
  }
  if (!stgCols.some((c) => c.name === 'credit_card_fee_percent')) {
    db.exec("ALTER TABLE company_settings ADD COLUMN credit_card_fee_percent REAL NOT NULL DEFAULT 3.99");
  }

  // Safe migrations for appointments (refund & card fee columns)
  const apptCols = db.prepare("PRAGMA table_info('appointments')").all() as any[];
  if (!apptCols.some((c) => c.name === 'is_refunded')) {
    db.exec("ALTER TABLE appointments ADD COLUMN is_refunded INTEGER NOT NULL DEFAULT 0");
  }
  if (!apptCols.some((c) => c.name === 'refund_reason')) {
    db.exec("ALTER TABLE appointments ADD COLUMN refund_reason TEXT");
  }
  if (!apptCols.some((c) => c.name === 'refunded_at')) {
    db.exec("ALTER TABLE appointments ADD COLUMN refunded_at TEXT");
  }
  if (!apptCols.some((c) => c.name === 'card_fee_percent')) {
    db.exec("ALTER TABLE appointments ADD COLUMN card_fee_percent REAL NOT NULL DEFAULT 0");
  }
  if (!apptCols.some((c) => c.name === 'card_fee_amount')) {
    db.exec("ALTER TABLE appointments ADD COLUMN card_fee_amount REAL NOT NULL DEFAULT 0");
  }

  // Safe migrations for manual_transactions (refund & card fee columns)
  const txCols = db.prepare("PRAGMA table_info('manual_transactions')").all() as any[];
  if (!txCols.some((c) => c.name === 'is_refunded')) {
    db.exec("ALTER TABLE manual_transactions ADD COLUMN is_refunded INTEGER NOT NULL DEFAULT 0");
  }
  if (!txCols.some((c) => c.name === 'refund_reason')) {
    db.exec("ALTER TABLE manual_transactions ADD COLUMN refund_reason TEXT");
  }
  if (!txCols.some((c) => c.name === 'refunded_at')) {
    db.exec("ALTER TABLE manual_transactions ADD COLUMN refunded_at TEXT");
  }
  if (!txCols.some((c) => c.name === 'card_fee_percent')) {
    db.exec("ALTER TABLE manual_transactions ADD COLUMN card_fee_percent REAL NOT NULL DEFAULT 0");
  }
  if (!txCols.some((c) => c.name === 'card_fee_amount')) {
    db.exec("ALTER TABLE manual_transactions ADD COLUMN card_fee_amount REAL NOT NULL DEFAULT 0");
  }

  // Safe migrations for payable_accounts (refund reason & timestamp)
  const payCols = db.prepare("PRAGMA table_info('payable_accounts')").all() as any[];
  if (!payCols.some((c) => c.name === 'refund_reason')) {
    db.exec("ALTER TABLE payable_accounts ADD COLUMN refund_reason TEXT");
  }
  if (!payCols.some((c) => c.name === 'refunded_at')) {
    db.exec("ALTER TABLE payable_accounts ADD COLUMN refunded_at TEXT");
  }

  // ==========================================
  // MULTI-TENANT SAAS & AUTHENTICATION MIGRATIONS
  // ==========================================
  // 1. Remove CHECK (id = 1) from company_settings if present so multiple tenants can have settings
  const csMeta = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='company_settings'")
    .get() as { sql?: string } | undefined;
  if (csMeta?.sql && csMeta.sql.includes('CHECK (id = 1)')) {
    db.exec(`
      CREATE TABLE company_settings_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL DEFAULT 1,
        name TEXT NOT NULL,
        subtitle TEXT NOT NULL DEFAULT '',
        business_type TEXT NOT NULL DEFAULT 'hybrid',
        phone TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        accent_color TEXT NOT NULL DEFAULT '#9E5A3C',
        open_time TEXT NOT NULL DEFAULT '08:00',
        close_time TEXT NOT NULL DEFAULT '20:00',
        slot_interval_minutes INTEGER NOT NULL DEFAULT 30,
        completed_display_mode TEXT NOT NULL DEFAULT 'dimmed_strikethrough',
        debit_card_fee_percent REAL NOT NULL DEFAULT 1.49,
        credit_card_fee_percent REAL NOT NULL DEFAULT 3.99,
        whatsapp_template_reminder TEXT NOT NULL,
        whatsapp_template_receipt TEXT NOT NULL,
        sms_template_reminder TEXT NOT NULL,
        webhook_url TEXT NOT NULL DEFAULT ''
      );
      INSERT INTO company_settings_new (
        id, tenant_id, name, subtitle, business_type, phone, address, accent_color,
        open_time, close_time, slot_interval_minutes, completed_display_mode,
        debit_card_fee_percent, credit_card_fee_percent,
        whatsapp_template_reminder, whatsapp_template_receipt, sms_template_reminder, webhook_url
      )
      SELECT
        id, 1, name, subtitle, business_type, phone, address, accent_color,
        open_time, close_time, slot_interval_minutes,
        COALESCE(completed_display_mode, 'dimmed_strikethrough'),
        COALESCE(debit_card_fee_percent, 1.49),
        COALESCE(credit_card_fee_percent, 3.99),
        whatsapp_template_reminder, whatsapp_template_receipt, sms_template_reminder, webhook_url
      FROM company_settings;
      DROP TABLE company_settings;
      ALTER TABLE company_settings_new RENAME TO company_settings;
    `);
  } else {
    const csColsNow = db.prepare("PRAGMA table_info('company_settings')").all() as any[];
    if (!csColsNow.some((c) => c.name === 'tenant_id')) {
      db.exec("ALTER TABLE company_settings ADD COLUMN tenant_id INTEGER NOT NULL DEFAULT 1");
    }
  }

  // 2. Add tenant_id column to all operational tables so each salon/barbershop is isolated
  const tenantScopedTables = [
    'professionals',
    'services',
    'clients',
    'products',
    'appointments',
    'notification_logs',
    'manual_transactions',
    'payable_accounts',
  ];
  for (const tbl of tenantScopedTables) {
    const cols = db.prepare(`PRAGMA table_info('${tbl}')`).all() as any[];
    if (!cols.some((c) => c.name === 'tenant_id')) {
      db.exec(`ALTER TABLE ${tbl} ADD COLUMN tenant_id INTEGER NOT NULL DEFAULT 1`);
    }
  }

  // 3. Create SaaS Tenants, Users, Auth Sessions, and SaaS Subscription Payments tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS saas_tenants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      owner_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT NOT NULL DEFAULT '',
      document TEXT NOT NULL DEFAULT '',
      business_type TEXT NOT NULL DEFAULT 'salon',
      plan_name TEXT NOT NULL DEFAULT 'Plano Profissional',
      monthly_fee REAL NOT NULL DEFAULT 99.90,
      due_day INTEGER NOT NULL DEFAULT 10,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trial', 'suspended')),
      notes TEXT NOT NULL DEFAULT '',
      last_login_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('superadmin', 'tenant')),
      tenant_id INTEGER,
      active INTEGER NOT NULL DEFAULT 1,
      last_login_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS saas_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      reference_month TEXT NOT NULL,
      due_date TEXT NOT NULL,
      paid_at TEXT,
      payment_method TEXT NOT NULL DEFAULT 'pix',
      status TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'pending', 'overdue')),
      notes TEXT NOT NULL DEFAULT '',
      recorded_by_name TEXT NOT NULL DEFAULT 'Administrador',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (tenant_id) REFERENCES saas_tenants(id) ON DELETE CASCADE
    );
  `);

  const stCols = db.prepare("PRAGMA table_info('saas_tenants')").all() as any[];
  if (!stCols.some((c) => c.name === 'document')) {
    db.exec("ALTER TABLE saas_tenants ADD COLUMN document TEXT NOT NULL DEFAULT ''");
  }

  // Seed initial sample payable accounts if empty so user can test overdue & upcoming alerts immediately
  const payablesCount = db.prepare('SELECT COUNT(*) as cnt FROM payable_accounts').get() as { cnt: number };
  if (payablesCount.cnt === 0) {
    const today = getTodayStr();
    const yesterday = addDaysStr(today, -1); // 1 day overdue!
    const inTwoDays = addDaysStr(today, 2); // Due soon!
    const nextMonth = addDaysStr(today, 32);

    const insertPayable = db.prepare(`
      INSERT INTO payable_accounts (
        description, category, amount, due_date, recurrence_type,
        installment_number, total_installments, recurrence_group_id, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `);

    insertPayable.run(
      'Fornecedor L’Oréal Professionnel (Repos. Químicas)',
      'Fornecedores',
      480.0,
      yesterday,
      'installments',
      1,
      3,
      'grp-seed-loreal'
    );
    insertPayable.run(
      'Aluguel do Imóvel / Salão',
      'Infraestrutura Fixa',
      2200.0,
      inTwoDays,
      'monthly',
      1,
      12,
      'grp-seed-aluguel'
    );
    insertPayable.run(
      'Aluguel do Imóvel / Salão',
      'Infraestrutura Fixa',
      2200.0,
      nextMonth,
      'monthly',
      2,
      12,
      'grp-seed-aluguel'
    );
  }

  // Ensure all existing appointments have their services represented in appointment_services
  db.exec(`
    INSERT INTO appointment_services (appointment_id, service_id, service_name, service_category, price_type, duration_minutes, price)
    SELECT a.id, a.service_id, s.name, s.category, s.price_type, a.duration_minutes, a.service_price
    FROM appointments a
    JOIN services s ON s.id = a.service_id
    WHERE NOT EXISTS (
      SELECT 1 FROM appointment_services aps WHERE aps.appointment_id = a.id
    );
  `);

  // Seed default SaaS Admin & Salon/Barbershop Tenant Accounts if empty
  const usersCount = db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number };
  if (usersCount.cnt === 0) {
    const defaultPwdHash = hashPassword('123456');
    const today = getTodayStr();
    const curMonth = today.slice(0, 7);

    // 1. Ensure Tenant #1 exists in saas_tenants matching existing company_settings #1
    const stg1 = db.prepare('SELECT * FROM company_settings WHERE tenant_id = 1 OR id = 1 LIMIT 1').get() as any;
    const t1Name = stg1?.name || 'Atelier Nobre — Salão & Barbearia';
    const t1Type = stg1?.business_type || 'hybrid';
    const t1Phone = stg1?.phone || '(11) 99876-5432';

    db.prepare(`
      INSERT INTO saas_tenants (
        id, name, owner_name, email, phone, business_type, plan_name, monthly_fee, due_day, status, notes, last_login_at
      ) VALUES (1, ?, 'Camila Fontes', 'contato@ateliernobre.com', ?, ?, 'Plano Pro Ilimitado', 149.90, 10, 'active', 'Cliente fundador · Unidade Jardins', datetime('now', 'localtime'))
    `).run(t1Name, t1Phone, t1Type);

    // 2. Create a second sample Tenant #2 (Barbearia) so Admin Panel shows multi-client metrics
    db.prepare(`
      INSERT INTO saas_tenants (
        id, name, owner_name, email, phone, business_type, plan_name, monthly_fee, due_day, status, notes, last_login_at
      ) VALUES (2, 'Barbearia Dom Pedro — Club & Navalha', 'Rafael Mendes', 'contato@barbeariadompedro.com', '(11) 98811-2233', 'barbershop', 'Plano Essencial', 99.90, 15, 'active', 'Barbearia com 3 cadeiras', datetime('now', '-1 day', 'localtime'))
    `).run();

    ensureTenantWorkspace(2, 'Barbearia Dom Pedro — Club & Navalha', 'barbershop', '(11) 98811-2233', 'Rafael Mendes');

    // 3. Create Super Admin + Tenant Users
    db.prepare(`
      INSERT INTO users (name, email, password_hash, role, tenant_id, active)
      VALUES
        ('Max (Administrador SaaS)', 'admin@agendahair.com', ?, 'superadmin', NULL, 1),
        ('Camila Fontes (Salão)', 'contato@ateliernobre.com', ?, 'tenant', 1, 1),
        ('Rafael Mendes (Barbearia)', 'contato@barbeariadompedro.com', ?, 'tenant', 2, 1)
    `).run(defaultPwdHash, defaultPwdHash, defaultPwdHash);

    // 4. Seed sample SaaS subscription payments
    db.prepare(`
      INSERT INTO saas_payments (
        tenant_id, amount, reference_month, due_date, paid_at, payment_method, status, notes, recorded_by_name
      ) VALUES
        (1, 149.90, ?, ?, ?, 'pix', 'paid', 'Mensalidade paga via PIX', 'Max (Administrador SaaS)'),
        (2, 99.90, ?, ?, ?, 'pix', 'paid', 'Mensalidade em dia', 'Max (Administrador SaaS)')
    `).run(
      curMonth,
      `${curMonth}-10`,
      today,
      curMonth,
      `${curMonth}-15`,
      today
    );
  }
}

export function ensureTenantWorkspace(
  tenantId: number,
  name: string,
  businessType: string,
  phone: string,
  ownerName: string
) {
  const existingStg = db
    .prepare('SELECT id FROM company_settings WHERE tenant_id = ?')
    .get(tenantId) as any;

  if (!existingStg) {
    const isBarber = businessType === 'barbershop';
    db.prepare(`
      INSERT INTO company_settings (
        tenant_id, name, subtitle, business_type, phone, address, accent_color,
        open_time, close_time, slot_interval_minutes, completed_display_mode,
        debit_card_fee_percent, credit_card_fee_percent,
        whatsapp_template_reminder, whatsapp_template_receipt, sms_template_reminder, webhook_url
      ) VALUES (?, ?, ?, ?, ?, '', ?, '08:00', '20:00', 30, 'dimmed_strikethrough', 1.49, 3.99, ?, ?, ?, '')
    `).run(
      tenantId,
      name,
      isBarber ? 'Cortes Clássicos, Barba & Navalha' : 'Alta Coiffure, Química & Tratamentos',
      businessType || 'salon',
      phone || '',
      isBarber ? '#234B36' : '#9E5A3C',
      'Olá {cliente}! Confirmamos seu horário de *{servico}* com {profissional} no *{empresa}* em *{data} às {hora}*. Até breve!',
      'Olá {cliente}! Agradecemos sua visita ao *{empresa}*. Atendimento finalizado ({servico}) — Total pago: *{valor}*. Volte sempre!',
      '{empresa}: Lembrete de agendamento ({servico}) em {data} as {hora}.'
    );
  }

  const profCount = db
    .prepare('SELECT COUNT(*) as cnt FROM professionals WHERE tenant_id = ?')
    .get(tenantId) as { cnt: number };
  if (profCount.cnt === 0) {
    db.prepare(
      'INSERT INTO professionals (tenant_id, name, role, color, active) VALUES (?, ?, ?, ?, 1)'
    ).run(
      tenantId,
      ownerName || 'Profissional Principal',
      businessType === 'barbershop' ? 'Master Barber' : 'Hair Stylist & Colorista',
      businessType === 'barbershop' ? '#234B36' : '#9E5A3C'
    );
  }

  const srvCount = db
    .prepare('SELECT COUNT(*) as cnt FROM services WHERE tenant_id = ?')
    .get(tenantId) as { cnt: number };
  if (srvCount.cnt === 0) {
    const insertSrv = db.prepare(`
      INSERT INTO services (
        tenant_id, name, category, duration_minutes, price_type, base_price, max_price, allows_fit_in_window, description, active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    if (businessType === 'barbershop') {
      insertSrv.run(tenantId, 'Corte Degradê / Tesoura', 'Barbearia', 45, 'fixed', 55, null, 0, 'Corte masculino completo');
      insertSrv.run(tenantId, 'Barba Terapia com Toalha Quente', 'Barbearia', 30, 'fixed', 40, null, 0, 'Modelagem com navalha');
      insertSrv.run(tenantId, 'Progressiva / Alisamento Masculino', 'Química', 90, 'variable', 90, 140, 1, 'Permite encaixe na pausa');
    } else {
      insertSrv.run(tenantId, 'Corte Feminino & Visagismo', 'Cabelo', 45, 'fixed', 95, null, 0, 'Lavagem + corte + finalização');
      insertSrv.run(tenantId, 'Escova Progressiva Orgânica', 'Química & Alisamento', 180, 'variable', 240, 420, 1, 'Pausa de 50 min permite encaixar corte');
      insertSrv.run(tenantId, 'Mechas & Iluminação', 'Coloração', 210, 'variable', 320, 580, 1, 'Permite encaixe durante pausa');
    }
  }
}

function seedInitialData() {
  runInTransaction(() => {
    db.prepare(`
      INSERT INTO company_settings (
        id, name, subtitle, business_type, phone, address, accent_color,
        open_time, close_time, slot_interval_minutes,
        whatsapp_template_reminder, whatsapp_template_receipt, sms_template_reminder, webhook_url
      ) VALUES (
        1,
        'Atelier Nobre — Salão & Barbearia',
        'Alta Coiffure, Química & Barbearia Clássica',
        'hybrid',
        '(11) 99876-5432',
        'Rua Oscar Freire, 840 — Jardins, São Paulo',
        '#9E5A3C',
        '08:00',
        '20:00',
        30,
        'Olá, {cliente}! Passando para confirmar seu horário de *{servico}* com {profissional} no *{empresa}* dia *{data}* às *{hora}*. Podemos confirmar?',
        'Olá, {cliente}! Obrigado pela visita ao *{empresa}*. Seu atendimento de *{servico}* foi concluído (Total: *{valor}*). Até a próxima!',
        '{empresa}: Olá {cliente}, lembrete do seu agendamento de {servico} dia {data} as {hora} com {profissional}.',
        ''
      )
    `).run();

    // Professionals
    const insertProf = db.prepare('INSERT INTO professionals (name, role, color, active) VALUES (?, ?, ?, 1)');
    insertProf.run('Mariana Costa', 'Especialista em Química & Corte', '#9E5A3C');
    insertProf.run('Rafael Mendes', 'Master Barber & Visagista', '#2C5E43');
    insertProf.run('Camila Rocha', 'Colorista & Terapia Capilar', '#6B4E71');

    // Services (Fixed & Variable, with fit-in window flags)
    const insertService = db.prepare(`
      INSERT INTO services (name, category, duration_minutes, price_type, base_price, max_price, allows_fit_in_window, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertService.run(
      'Progressiva Orgânica Realinhamento',
      'Química & Alisamento',
      180,
      'variable',
      240.0,
      380.0,
      1,
      'Valor varia conforme comprimento e densidade dos fios. Possui janela de pausa ideal para encaixe de cortes.'
    );
    insertService.run(
      'Corte de Cabelo Visagista',
      'Cabelo',
      45,
      'fixed',
      110.0,
      null,
      0,
      'Lavagem especial, corte personalizado e finalização com escova.'
    );
    insertService.run(
      'Corte Masculino & Acabamento',
      'Barbearia',
      35,
      'fixed',
      70.0,
      null,
      0,
      'Corte clássico ou degradê na tesoura e máquina com acabamento na navalha.'
    );
    insertService.run(
      'Mechas & Iluminação Criativa',
      'Coloração',
      210,
      'variable',
      340.0,
      580.0,
      1,
      'Valor variável de acordo com o diagnóstico capilar e tonalizante utilizado. Permite encaixe durante matização/pausa.'
    );
    insertService.run(
      'Barba Terapia com Toalha Quente',
      'Barbearia',
      30,
      'fixed',
      55.0,
      null,
      0,
      'Modelagem de barba com óleos essenciais, vapor de ozônio e toalha quente.'
    );
    insertService.run(
      'Cronograma Hidratação & Reconstrução',
      'Tratamento',
      50,
      'variable',
      120.0,
      180.0,
      1,
      'Tratamento profundo com ampola reconstrutora. Valor varia conforme linha aplicada.'
    );

    // Products (Shampoo, Mascara, Condicionador, Kits, etc.)
    const insertProduct = db.prepare(`
      INSERT INTO products (name, category, sku, price, cost_price, stock_quantity, min_stock, unit)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertProduct.run('Shampoo Reconstrutor Pós-Química 300ml', 'Shampoo', 'SH-001', 68.0, 32.0, 18, 5, 'un');
    insertProduct.run('Máscara de Cabelo Nutrição Absoluta 500g', 'Máscara', 'MC-002', 95.0, 44.0, 14, 4, 'un');
    insertProduct.run('Condicionador Selante Cuticular 300ml', 'Condicionador', 'CD-003', 64.0, 30.0, 15, 5, 'un');
    insertProduct.run('Kit Home Care Manutenção Progressiva (3 Itens)', 'Kits', 'KT-004', 189.0, 88.0, 9, 3, 'kit');
    insertProduct.run('Óleo Reparador de Pontas Argan Puro 60ml', 'Finalizadores', 'OL-005', 54.0, 22.0, 11, 4, 'un');
    insertProduct.run('Pomada Modeladora Matte Efeito Seco 90g', 'Barbearia', 'PM-006', 48.0, 19.0, 4, 5, 'un');

    // Clients
    const insertClient = db.prepare('INSERT INTO clients (full_name, phone, notes) VALUES (?, ?, ?)');
    insertClient.run('Beatriz Albuquerque', '(11) 99123-4567', 'Cabelo longo ondulado, prefere produtos sem sulfato.');
    insertClient.run('Juliana Martins', '(11) 98765-4321', 'Cliente fiel de corte a cada 45 dias.');
    insertClient.run('Henrique Vasconcelos', '(11) 99444-8822', 'Corte na tesoura + pomada matte.');
    insertClient.run('Fernanda Oliveira', '(11) 97654-3210', 'Faz mechas e compra Kit Home Care.');
    insertClient.run('Lucas Andrade', '(11) 98222-1199', 'Combo Corte + Barba quinzenal.');
    insertClient.run('Patrícia Siqueira', '(11) 99333-7766', 'Gosta de atendimento no início da tarde.');

    const today = getTodayStr();
    const yesterday = addDaysStr(today, -1);
    const threeDaysAgo = addDaysStr(today, -3);
    const twelveDaysAgo = addDaysStr(today, -12);

    const insertAppt = db.prepare(`
      INSERT INTO appointments (
        date, start_time, end_time, duration_minutes,
        client_id, professional_id, service_id,
        service_price, products_total, discount, total_amount,
        is_fit_in, parent_appointment_id, status, payment_method, paid_at, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertApptProd = db.prepare(`
      INSERT INTO appointment_products (
        appointment_id, product_id, product_name, quantity, unit_price, cost_price, subtotal
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    // 1. TODAY 10:00 - Completed appointment with Product included (Fernanda Oliveira - Cronograma + Kit)
    const appt1 = insertAppt.run(
      today, '10:00', '10:50', 50,
      4, 3, 6,
      150.0, 189.0, 0, 339.0,
      0, null, 'completed', 'pix', `${today} 10:55:00`,
      'Fios responderam super bem. Levou o Kit Home Care para manutenção.'
    );
    insertApptProd.run(appt1.lastInsertRowid, 4, 'Kit Home Care Manutenção Progressiva (3 Itens)', 1, 189.0, 88.0, 189.0);

    // 2. TODAY 11:00 - Completed Barbershop appointment (Henrique - Corte Masculino + Pomada)
    const appt2 = insertAppt.run(
      today, '11:00', '11:35', 35,
      3, 2, 3,
      70.0, 48.0, 0, 118.0,
      0, null, 'completed', 'credit_card', `${today} 11:40:00`,
      'Levou 1 Pomada Matte.'
    );
    insertApptProd.run(appt2.lastInsertRowid, 6, 'Pomada Modeladora Matte Efeito Seco 90g', 1, 48.0, 19.0, 48.0);

    // 3. TODAY 14:00 to 17:00 - Mariana Costa: Progressiva Orgânica (14h-17h)
    const apptProgressiva = insertAppt.run(
      today, '14:00', '17:00', 180,
      1, 1, 1,
      290.0, 95.0, 0, 385.0,
      0, null, 'in_progress', 'pending', null,
      'Cabelo longo (valor variável ajustado para R$ 290). Pausa de absorção entre 14h50 e 15h45. Vai levar Máscara Nutrição.'
    );
    insertApptProd.run(apptProgressiva.lastInsertRowid, 2, 'Máscara de Cabelo Nutrição Absoluta 500g', 1, 95.0, 44.0, 95.0);

    // 4. TODAY 15:00 to 15:45 - ENCAIXE! Mariana Costa: Corte de Cabelo at 15h inside the 14h-17h Progressiva!
    insertAppt.run(
      today, '15:00', '15:45', 45,
      2, 1, 2,
      110.0, 0, 0, 110.0,
      1, apptProgressiva.lastInsertRowid, 'scheduled', 'pending', null,
      'Encaixe confirmado durante o tempo de pausa da progressiva das 14h.'
    );

    // 5. TODAY 16:00 - Rafael Mendes: Barba Terapia
    insertAppt.run(
      today, '16:00', '16:30', 30,
      5, 2, 5,
      55.0, 0, 0, 55.0,
      0, null, 'scheduled', 'pending', null,
      'Cliente pediu toalha extra quente.'
    );

    // 6. YESTERDAY - Completed Mechas + Shampoo + Condicionador
    const apptYest = insertAppt.run(
      yesterday, '13:00', '16:30', 210,
      6, 3, 4,
      420.0, 132.0, 0, 552.0,
      0, null, 'completed', 'credit_card', `${yesterday} 16:35:00`,
      'Mechas loiro mel + Shampoo e Condicionador.'
    );
    insertApptProd.run(apptYest.lastInsertRowid, 1, 'Shampoo Reconstrutor Pós-Química 300ml', 1, 68.0, 32.0, 68.0);
    insertApptProd.run(apptYest.lastInsertRowid, 3, 'Condicionador Selante Cuticular 300ml', 1, 64.0, 30.0, 64.0);

    // 7. THREE DAYS AGO - Completed Progressiva + Encaixe Corte
    const appt3d = insertAppt.run(
      threeDaysAgo, '09:00', '12:00', 180,
      1, 1, 1,
      260.0, 54.0, 0, 314.0,
      0, null, 'completed', 'pix', `${threeDaysAgo} 12:05:00`,
      'Progressiva + Óleo Argan.'
    );
    insertApptProd.run(appt3d.lastInsertRowid, 5, 'Óleo Reparador de Pontas Argan Puro 60ml', 1, 54.0, 22.0, 54.0);

    insertAppt.run(
      threeDaysAgo, '10:00', '10:45', 45,
      2, 1, 2,
      110.0, 0, 0, 110.0,
      1, appt3d.lastInsertRowid, 'completed', 'debit_card', `${threeDaysAgo} 10:50:00`,
      'Encaixe na pausa da progressiva.'
    );

    // 8. TWELVE DAYS AGO - Completed Combo
    insertAppt.run(
      twelveDaysAgo, '15:00', '15:35', 35,
      5, 2, 3,
      70.0, 0, 0, 70.0,
      0, null, 'completed', 'cash', `${twelveDaysAgo} 15:40:00`,
      'Pagamento em dinheiro.'
    );

    // Manual expenses for realistic financial balance report
    const insertManual = db.prepare(`
      INSERT INTO manual_transactions (date, type, category, description, amount, payment_method)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertManual.run(threeDaysAgo, 'expense', 'Insumos & Uso Lavatório', 'Reposição de oxidantes, luvas e toalhas descartáveis', 145.0, 'pix');
    insertManual.run(twelveDaysAgo, 'expense', 'Infraestrutura', 'Conta de Energia & Internet do Salão', 380.0, 'pix');
  });
}
