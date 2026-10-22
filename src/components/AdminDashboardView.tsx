import React, { useEffect, useState } from 'react';
import {
  Store,
  Plus,
  DollarSign,
  BarChart3,
  Users,
  CheckCircle2,
  AlertCircle,
  Clock,
  LogOut,
  ExternalLink,
  Pencil,
  Trash2,
  KeyRound,
  Lock,
  Unlock,
  Calendar,
  Scissors,
  UserCheck,
  Search,
  X,
} from 'lucide-react';
import { api, formatBRL, formatDateBR, formatPhoneMask } from '../api';
import type {
  AuthUser,
  SaasAdminOverview,
  SaasTenant,
  TenantSubscriptionStatus,
} from '../../shared/types';

interface AdminDashboardViewProps {
  currentUser: AuthUser;
  onLogout: () => void;
  onInspectTenant: (tenant: SaasTenant) => void;
}

type AdminTab = 'tenants' | 'payments' | 'metrics' | 'staff';

export const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({
  currentUser,
  onLogout,
  onInspectTenant,
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('tenants');
  const [overview, setOverview] = useState<SaasAdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentFilterTenant, setPaymentFilterTenant] = useState<string>('all');

  // Create / Edit Tenant Modal
  const [showTenantModal, setShowTenantModal] = useState(false);
  const [editingTenant, setEditingTenant] = useState<SaasTenant | null>(null);
  const [tName, setTName] = useState('');
  const [tOwnerName, setTOwnerName] = useState('');
  const [tEmail, setTEmail] = useState('');
  const [tPassword, setTPassword] = useState('');
  const [tPhone, setTPhone] = useState('');
  const [tDocument, setTDocument] = useState('');
  const [tBusinessType, setTBusinessType] = useState('Cabelo & Barba');
  const [tPlanName, setTPlanName] = useState('Plano Profissional');
  const [tMonthlyFee, setTMonthlyFee] = useState('99.90');
  const [tDueDay, setTDueDay] = useState('10');
  const [tStatus, setTStatus] = useState<TenantSubscriptionStatus>('active');
  const [tNotes, setTNotes] = useState('');
  const [savingTenant, setSavingTenant] = useState(false);

  // Launch Payment Modal
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [pTenantId, setPTenantId] = useState<number>(0);
  const [pRefMonth, setPRefMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [pAmount, setPAmount] = useState('99.90');
  const [pDueDate, setPDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [pStatus, setPStatus] = useState<'paid' | 'pending'>('paid');
  const [pMethod, setPMethod] = useState('pix');
  const [pNotes, setPNotes] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);

  // Staff Form
  const [staffName, setStaffName] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [savingStaff, setSavingStaff] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await api.getAdminOverview();
      setOverview(data);
      if (data.tenants.length > 0 && !pTenantId) {
        setPTenantId(data.tenants[0].id);
        setPAmount(String(data.tenants[0].monthlyFee.toFixed(2)));
      }
    } catch (err: any) {
      alert(err.message || 'Erro ao carregar dados do Painel Admin.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', '#5E3B73');
    document.title = 'Agenda Hair — Painel Administrador';
    loadData();
  }, []);

  const openNewTenantModal = () => {
    setEditingTenant(null);
    setTName('');
    setTOwnerName('');
    setTEmail('');
    setTPassword('123456');
    setTPhone('');
    setTDocument('');
    setTBusinessType('Cabelo & Barba');
    setTPlanName('Plano Profissional');
    setTMonthlyFee('99.90');
    setTDueDay('10');
    setTStatus('active');
    setTNotes('');
    setShowTenantModal(true);
  };

  const openEditTenantModal = (tenant: SaasTenant) => {
    setEditingTenant(tenant);
    setTName(tenant.name);
    setTOwnerName(tenant.ownerName);
    setTEmail(tenant.email);
    setTPassword('');
    setTPhone(tenant.phone);
    setTDocument(tenant.document);
    setTBusinessType(tenant.businessType);
    setTPlanName(tenant.planName);
    setTMonthlyFee(String(tenant.monthlyFee));
    setTDueDay(String(tenant.dueDay));
    setTStatus(tenant.status);
    setTNotes(tenant.notes || '');
    setShowTenantModal(true);
  };

  const handleSaveTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingTenant(true);
    try {
      if (editingTenant) {
        await api.updateTenant(editingTenant.id, {
          name: tName,
          ownerName: tOwnerName,
          email: tEmail,
          newPassword: tPassword.trim() ? tPassword.trim() : undefined,
          phone: tPhone,
          document: tDocument,
          businessType: tBusinessType,
          planName: tPlanName,
          monthlyFee: Number(tMonthlyFee) || 0,
          dueDay: Number(tDueDay) || 10,
          status: tStatus,
          notes: tNotes,
        });
      } else {
        await api.createTenant({
          name: tName,
          ownerName: tOwnerName,
          email: tEmail,
          password: tPassword,
          phone: tPhone,
          document: tDocument,
          businessType: tBusinessType,
          planName: tPlanName,
          monthlyFee: Number(tMonthlyFee) || 99.9,
          dueDay: Number(tDueDay) || 10,
          status: tStatus,
          notes: tNotes,
        });
      }
      setShowTenantModal(false);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Erro ao salvar cliente.');
    } finally {
      setSavingTenant(false);
    }
  };

  const handleToggleTenantStatus = async (tenant: SaasTenant) => {
    const nextStatus: TenantSubscriptionStatus =
      tenant.status === 'suspended' ? 'active' : 'suspended';
    const confirmMsg =
      nextStatus === 'suspended'
        ? `Deseja suspender temporariamente o acesso de "${tenant.name}"? O cliente não conseguirá fazer login até ser reativado.`
        : `Deseja reativar o acesso de "${tenant.name}"?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      await api.updateTenant(tenant.id, { status: nextStatus });
      await loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteTenant = async (tenant: SaasTenant) => {
    if (
      !window.confirm(
        `Tem certeza que deseja excluir o cliente "${tenant.name}" e revogar suas credenciais de acesso?`
      )
    ) {
      return;
    }
    try {
      await api.deleteTenant(tenant.id);
      await loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const openLaunchPaymentForTenant = (tenant?: SaasTenant) => {
    const chosen = tenant || overview?.tenants[0];
    if (chosen) {
      setPTenantId(chosen.id);
      setPAmount(String(chosen.monthlyFee.toFixed(2)));
    }
    const nowStr = new Date().toISOString().slice(0, 10);
    setPRefMonth(nowStr.slice(0, 7));
    setPDueDate(nowStr);
    setPStatus('paid');
    setPMethod('pix');
    setPNotes('Mensalidade Agenda Hair');
    setShowPaymentModal(true);
  };

  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pTenantId) return;
    setSavingPayment(true);
    try {
      await api.createSaasPayment({
        tenantId: Number(pTenantId),
        referenceMonth: pRefMonth,
        amount: Number(pAmount) || 0,
        dueDate: pDueDate,
        status: pStatus,
        paymentMethod: pMethod,
        notes: pNotes,
      });
      setShowPaymentModal(false);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Erro ao lançar pagamento.');
    } finally {
      setSavingPayment(false);
    }
  };

  const handleMarkPaymentPaid = async (id: number, currentStatus: string) => {
    const newStatus = currentStatus === 'paid' ? 'pending' : 'paid';
    try {
      await api.updateSaasPayment(id, { status: newStatus });
      await loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeletePayment = async (id: number) => {
    if (!window.confirm('Deseja excluir este registro de pagamento?')) return;
    try {
      await api.deleteSaasPayment(id);
      await loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingStaff(true);
    try {
      await api.createAdminStaff({
        name: staffName,
        email: staffEmail,
        password: staffPassword,
      });
      setStaffName('');
      setStaffEmail('');
      setStaffPassword('');
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Erro ao cadastrar funcionário.');
    } finally {
      setSavingStaff(false);
    }
  };

  const handleDeleteStaff = async (id: number, name: string) => {
    if (!window.confirm(`Deseja remover o acesso administrativo de "${name}"?`)) return;
    try {
      await api.deleteAdminStaff(id);
      await loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const filteredTenants = (overview?.tenants || []).filter((t) => {
    const q = searchQuery.toLowerCase();
    return (
      t.name.toLowerCase().includes(q) ||
      t.ownerName.toLowerCase().includes(q) ||
      t.email.toLowerCase().includes(q) ||
      t.phone.toLowerCase().includes(q)
    );
  });

  const filteredPayments = (overview?.payments || []).filter((p) => {
    if (paymentFilterTenant !== 'all' && String(p.tenantId) !== paymentFilterTenant) {
      return false;
    }
    return true;
  });

  const statusBadge = (status: TenantSubscriptionStatus) => {
    if (status === 'active') {
      return (
        <span className="badge badge-completed">
          <CheckCircle2 size={12} /> Ativo
        </span>
      );
    }
    if (status === 'trial') {
      return (
        <span className="badge badge-progress">
          <Clock size={12} /> Período de Teste
        </span>
      );
    }
    return (
      <span className="badge badge-danger">
        <AlertCircle size={12} /> Suspenso
      </span>
    );
  };

  const headerMeta: Record<AdminTab, { title: string; subtitle: string }> = {
    tenants: {
      title: 'Clientes Cadastrados (Salões & Barbearias)',
      subtitle: 'Cadastre estabelecimentos, defina credenciais de acesso (e-mail/senha) e acesse o painel de cada cliente',
    },
    payments: {
      title: 'Controle de Pagamentos & Mensalidades SaaS',
      subtitle: 'Lance cobranças de assinatura, registre recebimentos e acompanhe inadimplências',
    },
    metrics: {
      title: 'Métricas de Uso por Cliente',
      subtitle: 'Monitore o volume de agendamentos, clientes finais, comandas pagas e último login de cada unidade',
    },
    staff: {
      title: 'Equipe Interna (Administradores)',
      subtitle: 'Gerencie os logins da sua equipe autorizados a acessar este Painel de Administração',
    },
  };

  return (
    <div className="app-layout">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="brand-header">
          <div className="brand-badge">
            <span className="brand-dot" style={{ background: '#9B6B9E' }} />
            <span>Administração SaaS</span>
          </div>
          <div className="brand-title">Agenda Hair</div>
          <div className="brand-subtitle">Painel de Controle & Clientes</div>
        </div>

        <nav className="nav-menu">
          <div className="nav-section-label">Gestão da Plataforma</div>

          <button
            className={`nav-btn ${activeTab === 'tenants' ? 'active' : ''}`}
            onClick={() => setActiveTab('tenants')}
          >
            <span className="nav-btn-left">
              <Store size={17} />
              <span>Clientes (Salões)</span>
            </span>
            {overview && <span className="nav-pill">{overview.tenants.length}</span>}
          </button>

          <button
            className={`nav-btn ${activeTab === 'payments' ? 'active' : ''}`}
            onClick={() => setActiveTab('payments')}
          >
            <span className="nav-btn-left">
              <DollarSign size={17} />
              <span>Mensalidades & Caixa</span>
            </span>
            {overview && <span className="nav-pill">{overview.payments.length}</span>}
          </button>

          <button
            className={`nav-btn ${activeTab === 'metrics' ? 'active' : ''}`}
            onClick={() => setActiveTab('metrics')}
          >
            <span className="nav-btn-left">
              <BarChart3 size={17} />
              <span>Métricas de Uso</span>
            </span>
          </button>

          <div className="nav-section-label">Acesso Interno</div>

          <button
            className={`nav-btn ${activeTab === 'staff' ? 'active' : ''}`}
            onClick={() => setActiveTab('staff')}
          >
            <span className="nav-btn-left">
              <Users size={17} />
              <span>Equipe Admin</span>
            </span>
            {overview && <span className="nav-pill">{overview.adminStaff.length}</span>}
          </button>
        </nav>

        <div className="sidebar-footer">
          <div style={{ fontWeight: 600, color: '#D6CFC5' }}>{currentUser.name}</div>
          <div style={{ marginTop: 2, fontSize: 11 }}>{currentUser.email}</div>
          <button
            type="button"
            onClick={onLogout}
            style={{
              marginTop: 10,
              width: '100%',
              background: 'rgba(239, 68, 68, 0.14)',
              color: '#FCA5A5',
              border: '1px solid rgba(239, 68, 68, 0.28)',
              borderRadius: 6,
              padding: '6px 10px',
              fontSize: 12,
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              cursor: 'pointer',
            }}
          >
            <LogOut size={13} /> Sair do Painel Admin
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="main-area">
        {/* Compact Brand Header visible on mobile/tablet */}
        <div className="mobile-brand-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span className="brand-dot" />
            <span className="mobile-brand-name">Agenda Hair • Admin</span>
          </div>
          <button
            type="button"
            onClick={onLogout}
            style={{
              background: 'rgba(239, 68, 68, 0.16)',
              color: '#FCA5A5',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 6,
              padding: '3px 8px',
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

        <header className="topbar">
          <div className="topbar-inner">
            <div className="topbar-title">
              <h1>{headerMeta[activeTab].title}</h1>
              <p>{headerMeta[activeTab].subtitle}</p>
            </div>

            <div className="topbar-actions">
              <button className="btn btn-primary" onClick={openNewTenantModal}>
                <Plus size={15} /> Novo Cliente (Salão/Barbearia)
              </button>

              <button className="btn btn-success" onClick={() => openLaunchPaymentForTenant()}>
                <DollarSign size={15} /> Lançar Pagamento
              </button>
            </div>
          </div>
        </header>

        <main className="page-content">
          {/* KPI Cards */}
          {overview && (
            <div className="kpi-grid">
              <div className="kpi-card">
                <div className="kpi-label">
                  <span>Clientes Cadastrados</span>
                  <Store size={15} style={{ color: 'var(--accent)' }} />
                </div>
                <div className="kpi-value">{overview.summary.totalTenants}</div>
                <div className="kpi-sub">
                  <strong style={{ color: 'var(--status-ok)' }}>
                    {overview.summary.activeTenants} ativos
                  </strong>
                  {overview.summary.suspendedTenants > 0 && (
                    <span style={{ color: 'var(--status-danger)', marginLeft: 8 }}>
                      • {overview.summary.suspendedTenants} suspensos
                    </span>
                  )}
                </div>
              </div>

              <div className="kpi-card">
                <div className="kpi-label">
                  <span>Receita Recorrente (MRR)</span>
                  <DollarSign size={15} style={{ color: 'var(--status-ok)' }} />
                </div>
                <div className="kpi-value" style={{ color: 'var(--status-ok)' }}>
                  {formatBRL(overview.summary.mrr)}
                </div>
                <div className="kpi-sub">
                  Recebido no mês: <strong>{formatBRL(overview.summary.receivedThisMonth)}</strong>
                </div>
              </div>

              <div className="kpi-card">
                <div className="kpi-label">
                  <span>Mensalidades em Aberto</span>
                  <Clock size={15} style={{ color: 'var(--status-warn)' }} />
                </div>
                <div className="kpi-value" style={{ color: 'var(--status-warn)' }}>
                  {formatBRL(overview.summary.pendingPaymentsTotal)}
                </div>
                <div className="kpi-sub">Aguardando baixa de pagamento</div>
              </div>

              <div className="kpi-card">
                <div className="kpi-label">
                  <span>Uso Total da Plataforma</span>
                  <BarChart3 size={15} style={{ color: 'var(--accent)' }} />
                </div>
                <div className="kpi-value">{overview.summary.totalPlatformAppointments}</div>
                <div className="kpi-sub">
                  agendamentos • {overview.summary.totalPlatformClients} clientes finais
                </div>
              </div>
            </div>
          )}

          {loading && !overview && (
            <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--ink-secondary)' }}>
              Carregando informações do Painel Administrativo...
            </div>
          )}

          {/* TAB 1: TENANTS (CLIENTS) */}
          {activeTab === 'tenants' && overview && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="agenda-toolbar" style={{ marginBottom: 4 }}>
                <div style={{ position: 'relative', flex: '1 1 280px', maxWidth: 440 }}>
                  <Search
                    size={15}
                    style={{
                      position: 'absolute',
                      left: 11,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--ink-muted)',
                    }}
                  />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar salão, proprietário, e-mail ou WhatsApp..."
                    style={{
                      width: '100%',
                      padding: '8px 12px 8px 34px',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  />
                </div>

                <button className="btn btn-primary" onClick={openNewTenantModal}>
                  <Plus size={15} /> Cadastrar Novo Cliente
                </button>
              </div>

              {filteredTenants.map((tenant) => (
                <div
                  key={tenant.id}
                  className="card"
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 18,
                    borderLeft:
                      tenant.status === 'suspended'
                        ? '4px solid var(--status-danger)'
                        : '4px solid var(--accent)',
                  }}
                >
                  <div style={{ flex: '1 1 420px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                      <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink-primary)' }}>
                        {tenant.name}
                      </h3>
                      {statusBadge(tenant.status)}
                      <span className="badge badge-scheduled">{tenant.businessType}</span>
                      <span className="badge badge-fitin">
                        {tenant.planName} • {formatBRL(tenant.monthlyFee)}/mês (Venc. dia {tenant.dueDay})
                      </span>
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
                        gap: 8,
                        fontSize: 13,
                        color: 'var(--ink-secondary)',
                      }}
                    >
                      <div>
                        <span style={{ color: 'var(--ink-muted)' }}>Responsável: </span>
                        <strong style={{ color: 'var(--ink-primary)' }}>{tenant.ownerName}</strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--ink-muted)' }}>Login (E-mail): </span>
                        <strong className="mono" style={{ color: 'var(--accent)', fontSize: 12.5 }}>
                          {tenant.email}
                        </strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--ink-muted)' }}>WhatsApp: </span>
                        <strong style={{ color: 'var(--ink-primary)' }}>{tenant.phone || '—'}</strong>
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: 16,
                        paddingTop: 6,
                        borderTop: '1px solid var(--border-color)',
                        fontSize: 12.5,
                        color: 'var(--ink-secondary)',
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <Calendar size={14} style={{ color: 'var(--accent)' }} />
                        <strong>{tenant.metrics.appointmentsTotal}</strong> agendamentos (
                        {tenant.metrics.completedAppointments} concluídos)
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <UserCheck size={14} style={{ color: 'var(--status-ok)' }} />
                        <strong>{tenant.metrics.clientsCount}</strong> clientes na carteira
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <Scissors size={14} />
                        <strong>{tenant.metrics.professionalsCount}</strong> profissionais
                      </span>
                      <span>
                        Último login:{' '}
                        <strong>
                          {tenant.lastLoginAt ? formatDateBR(tenant.lastLoginAt) : 'Ainda não acessou'}
                        </strong>
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => onInspectTenant(tenant)}
                      title="Abrir o Painel deste Cabeleireiro/Salão"
                    >
                      <ExternalLink size={14} /> Acessar Painel do Salão
                    </button>

                    <button
                      type="button"
                      className="btn btn-success btn-sm"
                      onClick={() => openLaunchPaymentForTenant(tenant)}
                    >
                      <DollarSign size={14} /> Lançar Pagamento
                    </button>

                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => openEditTenantModal(tenant)}
                    >
                      <Pencil size={14} /> Editar / Senha
                    </button>

                    <button
                      type="button"
                      className="btn btn-sm"
                      style={{
                        color:
                          tenant.status === 'suspended' ? 'var(--status-ok)' : 'var(--status-warn)',
                      }}
                      onClick={() => handleToggleTenantStatus(tenant)}
                      title={
                        tenant.status === 'suspended'
                          ? 'Reativar acesso do cliente'
                          : 'Suspender acesso temporariamente'
                      }
                    >
                      {tenant.status === 'suspended' ? (
                        <>
                          <Unlock size={14} /> Reativar
                        </>
                      ) : (
                        <>
                          <Lock size={14} /> Suspender
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      className="btn btn-sm"
                      style={{ color: 'var(--status-danger)' }}
                      onClick={() => handleDeleteTenant(tenant)}
                      title="Excluir Cliente"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}

              {filteredTenants.length === 0 && (
                <div className="card" style={{ textAlign: 'center', padding: 36, color: 'var(--ink-secondary)' }}>
                  Nenhum cliente encontrado para a busca informada.
                </div>
              )}
            </div>
          )}

          {/* TAB 2: PAYMENTS (MENSALIDADES SAAS) */}
          {activeTab === 'payments' && overview && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="agenda-toolbar" style={{ marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-secondary)' }}>
                    Filtrar por Cliente:
                  </span>
                  <select
                    value={paymentFilterTenant}
                    onChange={(e) => setPaymentFilterTenant(e.target.value)}
                    style={{
                      padding: '7px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-color)',
                      background: '#FFF',
                    }}
                  >
                    <option value="all">Todos os Clientes ({overview.payments.length})</option>
                    {overview.tenants.map((t) => (
                      <option key={t.id} value={String(t.id)}>
                        {t.name} ({t.ownerName})
                      </option>
                    ))}
                  </select>
                </div>

                <button className="btn btn-success" onClick={() => openLaunchPaymentForTenant()}>
                  <Plus size={15} /> Lançar Novo Pagamento / Mensalidade
                </button>
              </div>

              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Cliente / Estabelecimento</th>
                        <th>Mês Ref.</th>
                        <th>Vencimento</th>
                        <th>Valor</th>
                        <th>Método</th>
                        <th>Status</th>
                        <th style={{ textAlign: 'right' }}>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPayments.map((p) => (
                        <tr key={p.id}>
                          <td>
                            <div style={{ fontWeight: 700, color: 'var(--ink-primary)' }}>
                              {p.tenantName}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--ink-secondary)' }}>
                              {p.ownerName} {p.notes ? `• ${p.notes}` : ''}
                            </div>
                          </td>
                          <td className="mono">{p.referenceMonth}</td>
                          <td className="mono">{formatDateBR(p.dueDate)}</td>
                          <td className="mono" style={{ fontWeight: 700 }}>
                            {formatBRL(p.amount)}
                          </td>
                          <td style={{ textTransform: 'uppercase', fontSize: 12, fontWeight: 600 }}>
                            {p.paymentMethod}
                          </td>
                          <td>
                            {p.status === 'paid' ? (
                              <span className="badge badge-completed">
                                <CheckCircle2 size={12} /> Pago em {formatDateBR(p.paidAt)}
                              </span>
                            ) : p.status === 'overdue' ? (
                              <span className="badge badge-danger">
                                <AlertCircle size={12} /> Vencido
                              </span>
                            ) : (
                              <span className="badge badge-progress">
                                <Clock size={12} /> Aguardando
                              </span>
                            )}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <button
                                type="button"
                                className={`btn btn-sm ${p.status === 'paid' ? '' : 'btn-success'}`}
                                onClick={() => handleMarkPaymentPaid(p.id, p.status)}
                              >
                                {p.status === 'paid' ? 'Reabrir Cobrança' : 'Confirmar Recebimento'}
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm"
                                style={{ color: 'var(--status-danger)' }}
                                onClick={() => handleDeletePayment(p.id)}
                                title="Excluir lançamento"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filteredPayments.length === 0 && (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'var(--ink-muted)' }}>
                            Nenhum pagamento registrado para este filtro.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: USAGE METRICS PER CLIENT */}
          {activeTab === 'metrics' && overview && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 18 }}>
              {overview.tenants.map((t) => (
                <div key={t.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <h3 style={{ fontSize: 16, fontWeight: 700 }}>{t.name}</h3>
                        {statusBadge(t.status)}
                      </div>
                      <p style={{ fontSize: 12.5, color: 'var(--ink-secondary)', marginTop: 2 }}>
                        Responsável: {t.ownerName} • {t.email}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => onInspectTenant(t)}
                    >
                      <ExternalLink size={13} /> Abrir Painel
                    </button>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                      gap: 10,
                    }}
                  >
                    <div className="payment-method-item">
                      <div style={{ fontSize: 11, color: 'var(--ink-secondary)' }}>Agendamentos</div>
                      <div className="mono" style={{ fontSize: 19, fontWeight: 700 }}>
                        {t.metrics.appointmentsTotal}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--status-ok)', fontWeight: 600 }}>
                        {t.metrics.completedAppointments} concluídos
                      </div>
                    </div>

                    <div className="payment-method-item">
                      <div style={{ fontSize: 11, color: 'var(--ink-secondary)' }}>Clientes Finais</div>
                      <div className="mono" style={{ fontSize: 19, fontWeight: 700 }}>
                        {t.metrics.clientsCount}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>cadastrados</div>
                    </div>

                    <div className="payment-method-item">
                      <div style={{ fontSize: 11, color: 'var(--ink-secondary)' }}>Movimentado</div>
                      <div className="mono" style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>
                        {formatBRL(t.metrics.grossRevenueProcessed)}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>em comandas</div>
                    </div>

                    <div className="payment-method-item">
                      <div style={{ fontSize: 11, color: 'var(--ink-secondary)' }}>Profissionais</div>
                      <div className="mono" style={{ fontSize: 16, fontWeight: 700 }}>
                        {t.metrics.professionalsCount}
                      </div>
                    </div>

                    <div className="payment-method-item">
                      <div style={{ fontSize: 11, color: 'var(--ink-secondary)' }}>Serviços</div>
                      <div className="mono" style={{ fontSize: 16, fontWeight: 700 }}>
                        {t.metrics.servicesCount}
                      </div>
                    </div>

                    <div className="payment-method-item">
                      <div style={{ fontSize: 11, color: 'var(--ink-secondary)' }}>Produtos</div>
                      <div className="mono" style={{ fontSize: 16, fontWeight: 700 }}>
                        {t.metrics.productsCount}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      paddingTop: 10,
                      borderTop: '1px solid var(--border-color)',
                      fontSize: 12,
                      color: 'var(--ink-secondary)',
                    }}
                  >
                    <span>
                      Último acesso: <strong>{t.lastLoginAt ? formatDateBR(t.lastLoginAt) : 'Nunca acessou'}</strong>
                    </span>
                    <span>
                      Último agendamento:{' '}
                      <strong>
                        {t.metrics.lastAppointmentDate ? formatDateBR(t.metrics.lastAppointmentDate) : '—'}
                      </strong>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* TAB 4: INTERNAL ADMIN STAFF */}
          {activeTab === 'staff' && overview && (
            <div className="fin-chart-grid">
              <div className="card">
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
                  Cadastrar Funcionário / Administrador
                </h3>
                <p style={{ fontSize: 12.5, color: 'var(--ink-secondary)', marginBottom: 16 }}>
                  Crie um login para você ou um funcionário da sua equipe gerenciar clientes e mensalidades.
                </p>

                <form onSubmit={handleCreateStaff} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div className="field">
                    <label>Nome Completo</label>
                    <input
                      type="text"
                      required
                      value={staffName}
                      onChange={(e) => setStaffName(e.target.value)}
                      placeholder="Ex: Lucas Suporte"
                    />
                  </div>
                  <div className="field">
                    <label>E-mail de Acesso</label>
                    <input
                      type="email"
                      required
                      value={staffEmail}
                      onChange={(e) => setStaffEmail(e.target.value)}
                      placeholder="lucas@agendahair.com"
                    />
                  </div>
                  <div className="field">
                    <label>Senha de Acesso</label>
                    <input
                      type="text"
                      required
                      value={staffPassword}
                      onChange={(e) => setStaffPassword(e.target.value)}
                      placeholder="Mínimo 4 caracteres"
                    />
                  </div>
                  <button type="submit" disabled={savingStaff} className="btn btn-primary" style={{ marginTop: 4 }}>
                    <Plus size={15} /> {savingStaff ? 'Salvando...' : 'Adicionar Administrador'}
                  </button>
                </form>
              </div>

              <div className="card">
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>
                  Administradores com Acesso ({overview.adminStaff.length})
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {overview.adminStaff.map((staff) => (
                    <div
                      key={staff.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 14px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-subtle)',
                        border: '1px solid var(--border-color)',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span>{staff.name}</span>
                          {staff.id === currentUser.id && (
                            <span className="badge badge-fitin">Você</span>
                          )}
                        </div>
                        <div className="mono" style={{ fontSize: 12, color: 'var(--ink-secondary)' }}>
                          {staff.email}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                          Último acesso: {staff.lastLoginAt ? formatDateBR(staff.lastLoginAt) : '—'}
                        </span>
                        {staff.id !== currentUser.id && (
                          <button
                            type="button"
                            className="btn btn-sm"
                            style={{ color: 'var(--status-danger)' }}
                            onClick={() => handleDeleteStaff(staff.id, staff.name)}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </main>

        {/* Bottom Navigation Bar for Mobile/Tablet */}
        <nav className="mobile-bottom-nav" aria-label="Navegação Admin Mobile">
          <button
            type="button"
            className={`bottom-nav-item ${activeTab === 'tenants' ? 'active' : ''}`}
            onClick={() => setActiveTab('tenants')}
          >
            <span className="bottom-nav-pill">
              <Store size={20} />
            </span>
            <span className="bottom-nav-label">Clientes</span>
          </button>

          <button
            type="button"
            className={`bottom-nav-item ${activeTab === 'payments' ? 'active' : ''}`}
            onClick={() => setActiveTab('payments')}
          >
            <span className="bottom-nav-pill">
              <DollarSign size={20} />
            </span>
            <span className="bottom-nav-label">Pagamentos</span>
          </button>

          <button
            type="button"
            className={`bottom-nav-item ${activeTab === 'metrics' ? 'active' : ''}`}
            onClick={() => setActiveTab('metrics')}
          >
            <span className="bottom-nav-pill">
              <BarChart3 size={20} />
            </span>
            <span className="bottom-nav-label">Métricas</span>
          </button>

          <button
            type="button"
            className={`bottom-nav-item ${activeTab === 'staff' ? 'active' : ''}`}
            onClick={() => setActiveTab('staff')}
          >
            <span className="bottom-nav-pill">
              <Users size={20} />
            </span>
            <span className="bottom-nav-label">Equipe</span>
          </button>
        </nav>
      </div>

      {/* MODAL: CREATE / EDIT TENANT CLIENT */}
      {showTenantModal && (
        <div className="modal-backdrop" onClick={() => setShowTenantModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>
                  {editingTenant
                    ? `Editar Cliente: ${editingTenant.name}`
                    : 'Cadastrar Novo Cliente (Cabeleireiro / Salão)'}
                </h2>
                <p style={{ fontSize: 12.5, color: 'var(--ink-secondary)' }}>
                  Configure os dados do estabelecimento, plano mensal e credenciais de login.
                </p>
              </div>
              <button className="btn btn-sm" onClick={() => setShowTenantModal(false)}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveTenant}>
              <div className="modal-body">
                <div className="form-grid">
                  <div className="field">
                    <label>Nome do Salão / Barbearia *</label>
                    <input
                      type="text"
                      required
                      value={tName}
                      onChange={(e) => setTName(e.target.value)}
                      placeholder="Ex: Studio Hair Elegance"
                    />
                  </div>
                  <div className="field">
                    <label>Nome do Cabeleireiro / Proprietário *</label>
                    <input
                      type="text"
                      required
                      value={tOwnerName}
                      onChange={(e) => setTOwnerName(e.target.value)}
                      placeholder="Ex: Marcos Oliveira"
                    />
                  </div>
                </div>

                <div className="fitin-banner">
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontWeight: 700,
                      fontSize: 13,
                      marginBottom: 10,
                    }}
                  >
                    <KeyRound size={15} />
                    <span>Credenciais de Acesso do Cliente ao Aplicativo</span>
                  </div>
                  <div className="form-grid">
                    <div className="field">
                      <label>E-mail de Login *</label>
                      <input
                        type="email"
                        required
                        value={tEmail}
                        onChange={(e) => setTEmail(e.target.value)}
                        placeholder="cliente@salao.com"
                      />
                    </div>
                    <div className="field">
                      <label>
                        {editingTenant ? 'Nova Senha (deixe vazio p/ manter)' : 'Senha Inicial *'}
                      </label>
                      <input
                        type="text"
                        required={!editingTenant}
                        value={tPassword}
                        onChange={(e) => setTPassword(e.target.value)}
                        placeholder={editingTenant ? '••••••••' : 'Ex: 123456'}
                      />
                    </div>
                  </div>
                </div>

                <div className="form-grid">
                  <div className="field">
                    <label>WhatsApp / Telefone</label>
                    <input
                      type="text"
                      value={tPhone}
                      onChange={(e) => setTPhone(formatPhoneMask(e.target.value))}
                      placeholder="(11) 99999-9999"
                    />
                  </div>
                  <div className="field">
                    <label>CPF / CNPJ</label>
                    <input
                      type="text"
                      value={tDocument}
                      onChange={(e) => setTDocument(e.target.value)}
                      placeholder="00.000.000/0001-00"
                    />
                  </div>
                </div>

                <div className="form-grid">
                  <div className="field">
                    <label>Segmento</label>
                    <select value={tBusinessType} onChange={(e) => setTBusinessType(e.target.value)}>
                      <option value="Salão de Beleza">Salão de Beleza</option>
                      <option value="Barbearia">Barbearia</option>
                      <option value="Cabelo & Barba">Cabelo & Barba</option>
                      <option value="Estética & Spa">Estética & Spa</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Plano Contratado</label>
                    <input
                      type="text"
                      value={tPlanName}
                      onChange={(e) => setTPlanName(e.target.value)}
                      placeholder="Plano Profissional"
                    />
                  </div>
                </div>

                <div className="form-grid">
                  <div className="field">
                    <label>Valor da Mensalidade (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={tMonthlyFee}
                      onChange={(e) => setTMonthlyFee(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label>Dia de Vencimento</label>
                    <input
                      type="number"
                      min="1"
                      max="28"
                      value={tDueDay}
                      onChange={(e) => setTDueDay(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-grid">
                  <div className="field">
                    <label>Status da Assinatura</label>
                    <select
                      value={tStatus}
                      onChange={(e) => setTStatus(e.target.value as TenantSubscriptionStatus)}
                    >
                      <option value="active">Ativo (Acesso Liberado)</option>
                      <option value="trial">Período de Teste (Trial)</option>
                      <option value="suspended">Suspenso (Bloqueia Login)</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Observações Internas</label>
                    <input
                      type="text"
                      value={tNotes}
                      onChange={(e) => setTNotes(e.target.value)}
                      placeholder="Ex: Indicado por parceiro..."
                    />
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn" onClick={() => setShowTenantModal(false)}>
                  Cancelar
                </button>
                <button type="submit" disabled={savingTenant} className="btn btn-primary">
                  {savingTenant
                    ? 'Salvando...'
                    : editingTenant
                    ? 'Salvar Alterações'
                    : 'Criar Cliente e Liberar Acesso'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: LAUNCH PAYMENT */}
      {showPaymentModal && overview && (
        <div className="modal-backdrop" onClick={() => setShowPaymentModal(false)}>
          <div className="modal-box" style={{ maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>Lançar Pagamento de Mensalidade</h2>
                <p style={{ fontSize: 12.5, color: 'var(--ink-secondary)' }}>
                  Registre um pagamento recebido ou gere uma cobrança para o cliente.
                </p>
              </div>
              <button className="btn btn-sm" onClick={() => setShowPaymentModal(false)}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSavePayment}>
              <div className="modal-body">
                <div className="field">
                  <label>Cliente (Salão / Barbearia) *</label>
                  <select
                    value={pTenantId}
                    onChange={(e) => {
                      const id = Number(e.target.value);
                      setPTenantId(id);
                      const found = overview.tenants.find((t) => t.id === id);
                      if (found) setPAmount(String(found.monthlyFee.toFixed(2)));
                    }}
                  >
                    {overview.tenants.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.ownerName})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-grid">
                  <div className="field">
                    <label>Mês de Referência</label>
                    <input
                      type="month"
                      required
                      value={pRefMonth}
                      onChange={(e) => setPRefMonth(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label>Data de Vencimento</label>
                    <input
                      type="date"
                      required
                      value={pDueDate}
                      onChange={(e) => setPDueDate(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-grid">
                  <div className="field">
                    <label>Valor (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={pAmount}
                      onChange={(e) => setPAmount(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label>Forma de Pagamento</label>
                    <select value={pMethod} onChange={(e) => setPMethod(e.target.value)}>
                      <option value="pix">PIX</option>
                      <option value="credit_card">Cartão de Crédito</option>
                      <option value="boleto">Boleto</option>
                      <option value="cash">Dinheiro / Transferência</option>
                    </select>
                  </div>
                </div>

                <div className="field">
                  <label>Situação do Lançamento</label>
                  <select
                    value={pStatus}
                    onChange={(e) => setPStatus(e.target.value as 'paid' | 'pending')}
                  >
                    <option value="paid">Já Pago (Confirmar Recebimento Hoje)</option>
                    <option value="pending">Em Aberto (Cobrança Pendente)</option>
                  </select>
                </div>

                <div className="field">
                  <label>Observações</label>
                  <input
                    type="text"
                    value={pNotes}
                    onChange={(e) => setPNotes(e.target.value)}
                    placeholder="Ex: Mensalidade Plano Profissional"
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn" onClick={() => setShowPaymentModal(false)}>
                  Cancelar
                </button>
                <button type="submit" disabled={savingPayment} className="btn btn-success">
                  {savingPayment ? 'Lançando...' : 'Salvar Lançamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
