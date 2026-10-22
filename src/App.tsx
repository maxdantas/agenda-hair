import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  Scissors,
  Users,
  Package,
  BarChart3,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  BellRing,
  CalendarClock,
  LogOut,
  ShieldCheck,
  ArrowLeft,
} from 'lucide-react';
import {
  api,
  formatDateBR,
  getStoredToken,
  setStoredToken,
  setInspectedTenantId,
} from './api';
import type {
  AuthUser,
  Client,
  CompanySettings,
  PayableAccount,
  Product,
  Professional,
  SaasTenant,
  ServiceItem,
} from '../shared/types';
import { AgendaView } from './components/AgendaView';
import { ServicesView } from './components/ServicesView';
import { ProductsView } from './components/ProductsView';
import { ClientsView } from './components/ClientsView';
import { FinancialView, type FinancialSubTab } from './components/FinancialView';
import { SettingsView } from './components/SettingsView';
import { LoginView } from './components/LoginView';
import { AdminDashboardView } from './components/AdminDashboardView';

type ActiveTab = 'agenda' | 'services' | 'clients' | 'products' | 'financial' | 'settings';

function getLocalToday(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function App() {
  const [authChecking, setAuthChecking] = useState<boolean>(true);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [inspectedTenant, setInspectedTenant] = useState<SaasTenant | null>(null);

  const [activeTab, setActiveTab] = useState<ActiveTab>('agenda');
  const [financialSubTab, setFinancialSubTab] = useState<FinancialSubTab>('balance');
  const [selectedDate, setSelectedDate] = useState<string>(getLocalToday());

  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [payables, setPayables] = useState<PayableAccount[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  const notifyToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((prev) => (prev === msg ? null : prev));
    }, 3800);
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // ignore
    }
    setStoredToken(null);
    setInspectedTenantId(null);
    setInspectedTenant(null);
    setCurrentUser(null);
    setSettings(null);
  }, []);

  // Verify existing session token on mount
  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setAuthChecking(false);
      return;
    }
    api
      .getMe()
      .then((res) => {
        setCurrentUser(res.user);
      })
      .catch(() => {
        setStoredToken(null);
        setCurrentUser(null);
      })
      .finally(() => {
        setAuthChecking(false);
      });
  }, []);

  const loadAll = useCallback(async () => {
    const [stg, profs, srvs, clis, prods, pays] = await Promise.all([
      api.getSettings(),
      api.getProfessionals(),
      api.getServices(),
      api.getClients(),
      api.getProducts(),
      api.getPayables(),
    ]);
    setSettings(stg);
    setProfessionals(profs);
    setServices(srvs);
    setClients(clis);
    setProducts(prods);
    setPayables(pays);
    document.documentElement.style.setProperty('--accent', stg.accentColor || '#9E5A3C');
    document.title = `${stg.name} — Gestão & Agenda`;
  }, []);

  const shouldShowSalonDashboard =
    currentUser && (currentUser.role === 'tenant' || Boolean(inspectedTenant));

  useEffect(() => {
    if (shouldShowSalonDashboard) {
      loadAll();
    }
  }, [shouldShowSalonDashboard, inspectedTenant, loadAll]);

  if (authChecking) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0c0a09',
          color: '#a8a29e',
          fontSize: 14,
        }}
      >
        Verificando credenciais de acesso...
      </div>
    );
  }

  // 1. Not authenticated -> Render Login Screen
  if (!currentUser) {
    return (
      <LoginView
        onLoginSuccess={(user) => {
          setInspectedTenantId(null);
          setInspectedTenant(null);
          setCurrentUser(user);
        }}
      />
    );
  }

  // 2. Authenticated as SuperAdmin (and not inspecting a specific salon) -> Render Admin Panel
  if (currentUser.role === 'superadmin' && !inspectedTenant) {
    return (
      <AdminDashboardView
        currentUser={currentUser}
        onLogout={handleLogout}
        onInspectTenant={(tenant) => {
          setInspectedTenantId(tenant.id);
          setSettings(null);
          setInspectedTenant(tenant);
          setActiveTab('agenda');
        }}
      />
    );
  }

  // 3. Hairdresser / Salon Dashboard (or SuperAdmin inspecting a client's salon)
  if (!settings) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--ink-secondary)',
        }}
      >
        Carregando painel do estabelecimento...
      </div>
    );
  }

  const lowStockCount = products.filter((p) => p.stockQuantity <= p.minStock).length;
  const overduePayablesCount = payables.filter((p) => p.alertStatus === 'overdue').length;
  const dueSoonPayablesCount = payables.filter(
    (p) => p.alertStatus === 'due_today' || p.alertStatus === 'due_soon'
  ).length;
  const totalPayableAlerts = overduePayablesCount + dueSoonPayablesCount;

  const headerMeta: Record<ActiveTab, { title: string; subtitle: string }> = {
    agenda: {
      title: 'Agenda & Encaixes Inteligentes',
      subtitle: `Programação de ${formatDateBR(selectedDate)} · Suporte a atendimentos simultâneos na pausa química`,
    },
    services: {
      title: 'Catálogo de Serviços',
      subtitle: 'Configuração de tempo de execução, valores fixos, valores variáveis e janelas de encaixe',
    },
    clients: {
      title: 'Clientes & Avisos (WhatsApp / SMS)',
      subtitle: 'Histórico de visitas, contatos e disparo de lembretes e recibos',
    },
    products: {
      title: 'Produtos de Beleza & Estoque',
      subtitle: 'Shampoos, máscaras, condicionadores e kits com baixa automática nas comandas',
    },
    financial:
      financialSubTab === 'payables'
        ? {
            title: 'Contas a Pagar & Vencimentos',
            subtitle:
              'Agendamento mensal (aluguel, despesas fixas) e compras parceladas com fornecedores',
          }
        : {
            title: 'Balanço Financeiro & Extrato',
            subtitle:
              'Relatórios diário, semanal, mensal e anual de serviços executados, produtos vendidos e estornos',
          },
    settings: {
      title: 'Personalização & Configurações da Empresa',
      subtitle:
        'Identidade visual, taxas operacionais de maquininha (débito/crédito), equipe e mensagens',
    },
  };

  return (
    <div className="app-layout">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="brand-header">
          <div className="brand-badge">
            <span className="brand-dot" />
            <span>
              {settings.businessType === 'barbershop'
                ? 'Gestão Barbearia'
                : settings.businessType === 'salon'
                ? 'Gestão Salão'
                : 'Salão & Barbearia'}
            </span>
          </div>
          <div className="brand-title">{settings.name}</div>
          <div className="brand-subtitle">{settings.subtitle}</div>
        </div>

        <nav className="nav-menu">
          <div className="nav-section-label">Operação Diária</div>

          <button
            className={`nav-btn ${activeTab === 'agenda' ? 'active' : ''}`}
            onClick={() => setActiveTab('agenda')}
          >
            <span className="nav-btn-left">
              <Calendar size={17} />
              <span>Agenda & Encaixes</span>
            </span>
          </button>

          <button
            className={`nav-btn ${activeTab === 'clients' ? 'active' : ''}`}
            onClick={() => setActiveTab('clients')}
          >
            <span className="nav-btn-left">
              <Users size={17} />
              <span>Clientes & Avisos</span>
            </span>
            <span className="nav-pill">{clients.length}</span>
          </button>

          <div className="nav-section-label">Catálogo & Estoque</div>

          <button
            className={`nav-btn ${activeTab === 'services' ? 'active' : ''}`}
            onClick={() => setActiveTab('services')}
          >
            <span className="nav-btn-left">
              <Scissors size={17} />
              <span>Serviços (Fixo/Var)</span>
            </span>
            <span className="nav-pill">{services.length}</span>
          </button>

          <button
            className={`nav-btn ${activeTab === 'products' ? 'active' : ''}`}
            onClick={() => setActiveTab('products')}
          >
            <span className="nav-btn-left">
              <Package size={17} />
              <span>Produtos & Estoque</span>
            </span>
            {lowStockCount > 0 ? (
              <span
                className="nav-pill"
                style={{ background: '#9E2A2B', color: '#FFF' }}
                title="Produtos com estoque baixo"
              >
                ! {lowStockCount}
              </span>
            ) : (
              <span className="nav-pill">{products.length}</span>
            )}
          </button>

          <div className="nav-section-label">Gestão & Unidade</div>

          <button
            className={`nav-btn ${activeTab === 'financial' && financialSubTab !== 'payables' ? 'active' : ''}`}
            onClick={() => {
              setFinancialSubTab('balance');
              setActiveTab('financial');
            }}
          >
            <span className="nav-btn-left">
              <BarChart3 size={17} />
              <span>Balanço Financeiro</span>
            </span>
          </button>

          <button
            className={`nav-btn ${activeTab === 'financial' && financialSubTab === 'payables' ? 'active' : ''}`}
            onClick={() => {
              setFinancialSubTab('payables');
              setActiveTab('financial');
            }}
          >
            <span className="nav-btn-left">
              <CalendarClock size={17} />
              <span>Contas a Pagar</span>
            </span>
            {overduePayablesCount > 0 ? (
              <span
                className="nav-pill"
                style={{ background: '#9E2A2B', color: '#FFF' }}
                title="Contas a pagar vencidas!"
              >
                ! {overduePayablesCount}
              </span>
            ) : dueSoonPayablesCount > 0 ? (
              <span
                className="nav-pill"
                style={{ background: '#C87D28', color: '#FFF' }}
                title="Contas a pagar próximas do vencimento"
              >
                {dueSoonPayablesCount}
              </span>
            ) : null}
          </button>

          <button
            className={`nav-btn ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <span className="nav-btn-left">
              <Sliders size={17} />
              <span>Personalizar Empresa</span>
            </span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <div style={{ fontWeight: 600, color: '#D6CFC5' }}>
            Expediente: {settings.openTime} às {settings.closeTime}
          </div>
          <div style={{ marginTop: 2 }}>{settings.phone}</div>
          <div
            style={{
              marginTop: 10,
              paddingTop: 10,
              borderTop: '1px solid rgba(255,255,255,0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <span
              style={{
                fontSize: 11,
                color: '#A59E94',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={currentUser.email}
            >
              {currentUser.email}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              style={{
                background: 'rgba(239, 68, 68, 0.14)',
                color: '#FCA5A5',
                border: '1px solid rgba(239, 68, 68, 0.28)',
                borderRadius: 6,
                padding: '4px 8px',
                fontSize: 11,
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                cursor: 'pointer',
              }}
              title="Sair da conta"
            >
              <LogOut size={12} /> Sair
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="main-area">
        {/* SuperAdmin Inspection Banner */}
        {inspectedTenant && (
          <div
            style={{
              background: '#312E81',
              color: '#E0E7FF',
              padding: '8px 16px',
              fontSize: 12.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShieldCheck size={16} />
              <span>
                <strong>Modo Administrador:</strong> Visualizando o painel do cliente{' '}
                <strong>{inspectedTenant.name}</strong> ({inspectedTenant.email})
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setInspectedTenantId(null);
                setInspectedTenant(null);
              }}
              style={{
                background: '#EEF2FF',
                color: '#1E1B4B',
                border: 'none',
                borderRadius: 6,
                padding: '4px 10px',
                fontSize: 12,
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                cursor: 'pointer',
              }}
            >
              <ArrowLeft size={13} /> Voltar ao Painel Admin
            </button>
          </div>
        )}

        {/* Compact Brand Header visible on mobile/tablet */}
        <div className="mobile-brand-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span className="brand-dot" />
            <span className="mobile-brand-name">{settings.name}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="mobile-brand-hours mono">
              {settings.openTime}–{settings.closeTime}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              style={{
                background: 'rgba(239, 68, 68, 0.16)',
                color: '#FCA5A5',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: 6,
                padding: '3px 7px',
                fontSize: 11,
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <LogOut size={12} /> Sair
            </button>
          </div>
        </div>

        <header className="topbar">
          <div className="topbar-inner">
            <div className="topbar-title">
              <h1>{headerMeta[activeTab].title}</h1>
              <p>{headerMeta[activeTab].subtitle}</p>
            </div>

            <div className="topbar-actions">
              {activeTab !== 'financial' && overduePayablesCount > 0 && (
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{
                    background: '#FDF2F2',
                    borderColor: '#EABDBD',
                    color: '#9E2A2B',
                    fontWeight: 700,
                  }}
                  onClick={() => {
                    setFinancialSubTab('payables');
                    setActiveTab('financial');
                  }}
                  title="Clique para ver as contas vencidas no módulo financeiro"
                >
                  <AlertTriangle size={14} /> {overduePayablesCount}{' '}
                  {overduePayablesCount === 1 ? 'Conta Vencida!' : 'Contas Vencidas!'}
                </button>
              )}

              {activeTab !== 'financial' && dueSoonPayablesCount > 0 && (
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{
                    background: '#FEF9EC',
                    borderColor: '#F3D9A4',
                    color: '#8A500D',
                    fontWeight: 600,
                  }}
                  onClick={() => {
                    setFinancialSubTab('payables');
                    setActiveTab('financial');
                  }}
                  title="Clique para ver as contas prestes a vencer"
                >
                  <BellRing size={14} /> {dueSoonPayablesCount}{' '}
                  {dueSoonPayablesCount === 1 ? 'Conta a Vencer' : 'Contas a Vencer'}
                </button>
              )}

              {toast && (
                <div
                  style={{
                    background: '#161514',
                    color: '#FFF',
                    padding: '7px 14px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 12.5,
                    fontWeight: 500,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                  }}
                >
                  <CheckCircle2 size={14} style={{ color: '#68D391' }} />
                  {toast}
                </div>
              )}

              <button
                className="btn btn-sm desktop-only-btn"
                onClick={() => setActiveTab('settings')}
                title="Trocar tema ou personalizar dados do salão/barbearia"
              >
                <Sliders size={14} /> Personalizar Unidade
              </button>

              <button
                className="btn btn-sm desktop-only-btn"
                onClick={handleLogout}
                title="Encerrar sessão e voltar ao login"
              >
                <LogOut size={14} /> Sair
              </button>
            </div>
          </div>
        </header>

        <main className="page-content">
          {activeTab === 'agenda' && (
            <AgendaView
              settings={settings}
              professionals={professionals}
              services={services}
              clients={clients}
              products={products}
              selectedDate={selectedDate}
              onDateChange={setSelectedDate}
              onRefreshAll={loadAll}
              notifyToast={notifyToast}
            />
          )}

          {activeTab === 'services' && (
            <ServicesView
              services={services}
              onRefresh={loadAll}
              notifyToast={notifyToast}
            />
          )}

          {activeTab === 'products' && (
            <ProductsView
              products={products}
              onRefresh={loadAll}
              notifyToast={notifyToast}
            />
          )}

          {activeTab === 'clients' && (
            <ClientsView
              clients={clients}
              settings={settings}
              onRefresh={loadAll}
              notifyToast={notifyToast}
            />
          )}

          {activeTab === 'financial' && (
            <FinancialView
              mode={financialSubTab}
              onChangeMode={setFinancialSubTab}
              onOpenSettings={() => setActiveTab('settings')}
              referenceDate={selectedDate}
              onDateChange={setSelectedDate}
              settings={settings}
              onRefreshAll={loadAll}
              notifyToast={notifyToast}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              settings={settings}
              professionals={professionals}
              onRefresh={loadAll}
              notifyToast={notifyToast}
            />
          )}
        </main>

        {/* WhatsApp-style Bottom Navigation Bar for Mobile/Tablet */}
        <nav className="mobile-bottom-nav" aria-label="Navegação Mobile">
          <button
            type="button"
            className={`bottom-nav-item ${activeTab === 'agenda' ? 'active' : ''}`}
            onClick={() => setActiveTab('agenda')}
          >
            <span className="bottom-nav-pill">
              <Calendar size={20} />
            </span>
            <span className="bottom-nav-label">Agenda</span>
          </button>

          <button
            type="button"
            className={`bottom-nav-item ${activeTab === 'clients' ? 'active' : ''}`}
            onClick={() => setActiveTab('clients')}
          >
            <span className="bottom-nav-pill">
              <Users size={20} />
            </span>
            <span className="bottom-nav-label">Clientes</span>
          </button>

          <button
            type="button"
            className={`bottom-nav-item ${activeTab === 'services' ? 'active' : ''}`}
            onClick={() => setActiveTab('services')}
          >
            <span className="bottom-nav-pill">
              <Scissors size={20} />
            </span>
            <span className="bottom-nav-label">Serviços</span>
          </button>

          <button
            type="button"
            className={`bottom-nav-item ${activeTab === 'products' ? 'active' : ''}`}
            onClick={() => setActiveTab('products')}
          >
            <span className="bottom-nav-pill" style={{ position: 'relative' }}>
              <Package size={20} />
              {lowStockCount > 0 && <span className="bottom-nav-badge">{lowStockCount}</span>}
            </span>
            <span className="bottom-nav-label">Estoque</span>
          </button>

          <button
            type="button"
            className={`bottom-nav-item ${activeTab === 'financial' ? 'active' : ''}`}
            onClick={() => setActiveTab('financial')}
          >
            <span className="bottom-nav-pill" style={{ position: 'relative' }}>
              <BarChart3 size={20} />
              {totalPayableAlerts > 0 && (
                <span className="bottom-nav-badge">{totalPayableAlerts}</span>
              )}
            </span>
            <span className="bottom-nav-label">Financeiro</span>
          </button>

          <button
            type="button"
            className={`bottom-nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <span className="bottom-nav-pill">
              <Sliders size={20} />
            </span>
            <span className="bottom-nav-label">Unidade</span>
          </button>
        </nav>
      </div>
    </div>
  );
}
