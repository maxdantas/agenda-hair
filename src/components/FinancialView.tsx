import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Scissors,
  ShoppingBag,
  Wallet,
  Plus,
  Download,
  Trash2,
  ArrowDownRight,
  ArrowUpRight,
  RotateCcw,
  CalendarClock,
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Percent,
  Repeat,
  Edit3,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { api, formatBRL, formatDateBR } from '../api';
import type {
  CompanySettings,
  FinancialPeriod,
  FinancialReport,
  PayableAccount,
  PayableRecurrence,
} from '../../shared/types';

export type FinancialSubTab = 'balance' | 'payables';

interface FinancialViewProps {
  mode: FinancialSubTab;
  onChangeMode: (m: FinancialSubTab) => void;
  onOpenSettings: () => void;
  referenceDate: string;
  onDateChange: (d: string) => void;
  settings: CompanySettings;
  onRefreshAll: () => Promise<void>;
  notifyToast: (msg: string) => void;
}

export const FinancialView: React.FC<FinancialViewProps> = ({
  mode,
  onChangeMode,
  onOpenSettings,
  referenceDate,
  onDateChange,
  settings,
  onRefreshAll,
  notifyToast,
}) => {
  const subTab = mode;
  const setSubTab = onChangeMode;
  const [period, setPeriod] = useState<FinancialPeriod>('monthly');
  const [report, setReport] = useState<FinancialReport | null>(null);
  const [payables, setPayables] = useState<PayableAccount[]>([]);
  const [loading, setLoading] = useState(false);

  // Modal for Manual Income / Expense
  const [showTxModal, setShowTxModal] = useState(false);
  const [txForm, setTxForm] = useState({
    date: referenceDate,
    type: 'expense' as 'income' | 'expense',
    category: 'Despesa Operacional',
    description: '',
    amount: 100,
    paymentMethod: 'pix',
  });

  // Modal for Mandatory Written Refund (Estorno de Entrada ou Estorno de Conta Paga)
  const [refundTarget, setRefundTarget] = useState<{
    kind: 'appointment' | 'manual' | 'payable';
    id: number;
    title: string;
    amount: number;
    date: string;
  } | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [refundError, setRefundError] = useState('');

  // Month Filter for Payable Accounts (Contas a Pagar)
  const [payableMonth, setPayableMonth] = useState<string>(referenceDate.slice(0, 7));
  const [showAllMonths, setShowAllMonths] = useState<boolean>(false);

  // Modal for New Payable Account (Contas a Pagar: Avulsa, Mensal Fixa, Parcelada Fornecedor)
  const [showPayableModal, setShowPayableModal] = useState(false);
  const [payableFilter, setPayableFilter] = useState<'all' | 'pending' | 'overdue' | 'paid'>('all');
  const [payableForm, setPayableForm] = useState({
    description: '',
    category: 'Aluguel / Despesa Fixa',
    amount: 500,
    dueDate: referenceDate,
    recurrenceType: 'monthly' as PayableRecurrence,
    monthsCount: 12,
    totalInstallments: 3,
    paymentMethod: 'pix',
  });

  // Modal for Editing an Existing Payable Account
  const [editPayableTarget, setEditPayableTarget] = useState<PayableAccount | null>(null);
  const [editPayableForm, setEditPayableForm] = useState({
    description: '',
    category: '',
    amount: 0,
    dueDate: '',
    paymentMethod: 'pix',
    updateSubsequent: true,
  });

  // Modal for Confirming Deletion of a Payable Account
  const [deletePayableTarget, setDeletePayableTarget] = useState<PayableAccount | null>(null);
  const [deleteSubsequent, setDeleteSubsequent] = useState<boolean>(false);

  // Modal for Confirming Payment of a Payable Account (Baixa -> Lança Despesa no Dia)
  const [payTarget, setPayTarget] = useState<PayableAccount | null>(null);
  const [payMethod, setPayMethod] = useState('pix');
  const [payDate, setPayDate] = useState(referenceDate);

  const loadData = async () => {
    setLoading(true);
    try {
      const [repData, payData] = await Promise.all([
        api.getFinancialReport(period, referenceDate),
        api.getPayables(),
      ]);
      setReport(repData);
      setPayables(payData);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [period, referenceDate]);

  const handleCreateTx = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.createManualTransaction(txForm);
    setShowTxModal(false);
    await loadData();
    notifyToast('Lançamento registrado no balanço financeiro!');
  };

  const handleConfirmRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundTarget) return;
    const trimmed = refundReason.trim();
    if (trimmed.length < 3) {
      setRefundError('Informe por escrito o motivo detalhado do estorno (mínimo de 3 caracteres).');
      return;
    }
    try {
      if (refundTarget.kind === 'appointment') {
        await api.refundAppointment(refundTarget.id, trimmed);
        notifyToast('Comanda estornada com sucesso!');
      } else if (refundTarget.kind === 'manual') {
        await api.refundManualTransaction(refundTarget.id, trimmed);
        notifyToast('Valor de entrada estornado com sucesso!');
      } else if (refundTarget.kind === 'payable') {
        await api.refundPayable(refundTarget.id, trimmed);
        notifyToast('Pagamento da conta estornado e removido do Balanço Financeiro!');
      }
      setRefundTarget(null);
      setRefundReason('');
      setRefundError('');
      await loadData();
      await onRefreshAll();
    } catch (err: any) {
      setRefundError(err.message || 'Erro ao realizar estorno.');
    }
  };

  const handleUpdatePayable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editPayableTarget) return;
    const isRecurring =
      (editPayableTarget.recurrenceType === 'monthly' ||
        editPayableTarget.recurrenceType === 'installments') &&
      Boolean(editPayableTarget.recurrenceGroupId);

    await api.updatePayable(editPayableTarget.id, {
      description: editPayableForm.description,
      category: editPayableForm.category,
      amount: Number(editPayableForm.amount),
      dueDate: editPayableForm.dueDate,
      paymentMethod: editPayableForm.paymentMethod,
      updateSubsequent: isRecurring ? editPayableForm.updateSubsequent : false,
    });

    setEditPayableTarget(null);
    await loadData();
    await onRefreshAll();
    notifyToast(
      isRecurring && editPayableForm.updateSubsequent
        ? 'Conta e todas as parcelas/meses subsequentes foram atualizados!'
        : 'Conta a pagar atualizada com sucesso!'
    );
  };

  const handleConfirmDeletePayable = async () => {
    if (!deletePayableTarget) return;
    const isRecurring =
      (deletePayableTarget.recurrenceType === 'monthly' ||
        deletePayableTarget.recurrenceType === 'installments') &&
      Boolean(deletePayableTarget.recurrenceGroupId);

    await api.deletePayable(deletePayableTarget.id, isRecurring ? deleteSubsequent : false);
    setDeletePayableTarget(null);
    await loadData();
    await onRefreshAll();
    notifyToast(
      isRecurring && deleteSubsequent
        ? 'Conta e todas as parcelas/meses subsequentes foram excluídos!'
        : 'Conta a pagar excluída com sucesso!'
    );
  };

  const handleCreatePayable = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await api.createPayable(payableForm);
    setShowPayableModal(false);
    await loadData();
    await onRefreshAll();
    if (payableForm.recurrenceType === 'monthly') {
      notifyToast(`Conta mensal agendada para ${res.count} meses consecutivos!`);
    } else if (payableForm.recurrenceType === 'installments') {
      notifyToast(`Compra parcelada agendada em ${res.count}x nos próximos meses!`);
    } else {
      notifyToast('Conta a pagar agendada com sucesso!');
    }
  };

  const handleConfirmPayPayable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payTarget) return;
    await api.payPayable(payTarget.id, payMethod, payDate);
    setPayTarget(null);
    await loadData();
    await onRefreshAll();
    notifyToast('Conta marcada como PAGA e lançada como Despesa no balanço do dia!');
  };

  const handleExportCSV = () => {
    if (!report) return;
    const rows: string[][] = [
      [
        'Data',
        'Hora',
        'Tipo',
        'Cliente / Descricao',
        'Servico / Categoria',
        'Valor Bruto',
        'Taxa Maquininha (%)',
        'Desconto Taxa (R$)',
        'Valor Liquido',
        'Pagamento',
        'Status / Motivo Estorno',
      ],
    ];
    for (const a of report.completedAppointments) {
      rows.push([
        a.date,
        a.startTime,
        a.isFitIn ? 'Atendimento (Encaixe)' : 'Atendimento',
        a.clientName,
        a.serviceName,
        String(a.totalAmount.toFixed(2)),
        String((a.cardFeePercent || 0).toFixed(2)),
        String((a.cardFeeAmount || 0).toFixed(2)),
        String((a.netAmountReceived ?? a.totalAmount).toFixed(2)),
        a.paymentMethod,
        'Concluido',
      ]);
    }
    for (const r of report.refundedAppointments) {
      rows.push([
        r.date,
        r.startTime,
        'ESTORNO DE COMANDA',
        r.clientName,
        r.serviceName,
        String(r.totalAmount.toFixed(2)),
        '0.00',
        '0.00',
        '0.00',
        r.paymentMethod,
        `ESTORNADO: ${r.refundReason || ''}`,
      ]);
    }
    for (const m of report.manualTransactions) {
      rows.push([
        m.date,
        '-',
        m.isRefunded
          ? 'ESTORNO DE ENTRADA EXTRA'
          : m.type === 'income'
          ? 'Entrada Extra'
          : 'Despesa/Saida',
        m.description,
        m.category,
        m.type === 'income' ? String(m.amount.toFixed(2)) : `-${m.amount.toFixed(2)}`,
        String((m.cardFeePercent || 0).toFixed(2)),
        String((m.cardFeeAmount || 0).toFixed(2)),
        m.isRefunded
          ? '0.00'
          : m.type === 'income'
          ? String((m.netAmountReceived ?? m.amount).toFixed(2))
          : `-${m.amount.toFixed(2)}`,
        m.paymentMethod,
        m.isRefunded ? `ESTORNADO: ${m.refundReason || ''}` : 'Ativo',
      ]);
    }
    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' + rows.map((r) => r.join(';')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `relatorio_financeiro_${period}_${referenceDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Payable alerts counts (global across all payables for alert strips)
  const overduePayables = payables.filter((p) => p.alertStatus === 'overdue');
  const dueSoonOrTodayPayables = payables.filter(
    (p) => p.alertStatus === 'due_today' || p.alertStatus === 'due_soon'
  );
  const pendingPayables = payables.filter((p) => p.status === 'pending');

  const shiftPayableMonth = (deltaMonths: number) => {
    const [y, m] = payableMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + deltaMonths, 1);
    const ny = d.getFullYear();
    const nm = String(d.getMonth() + 1).padStart(2, '0');
    setPayableMonth(`${ny}-${nm}`);
    setShowAllMonths(false);
  };

  const formatMonthLabel = (ym: string) => {
    const [y, m] = ym.split('-').map(Number);
    const months = [
      'Janeiro',
      'Fevereiro',
      'Março',
      'Abril',
      'Maio',
      'Junho',
      'Julho',
      'Agosto',
      'Setembro',
      'Outubro',
      'Novembro',
      'Dezembro',
    ];
    return `${months[(m || 1) - 1]} de ${y}`;
  };

  // Filter payables by selected month (unless showAllMonths is active)
  const monthScopedPayables = showAllMonths
    ? payables
    : payables.filter((p) => p.dueDate.startsWith(payableMonth));

  const monthPendingCount = monthScopedPayables.filter((p) => p.status === 'pending').length;
  const monthOverdueCount = monthScopedPayables.filter((p) => p.alertStatus === 'overdue').length;
  const monthPaidCount = monthScopedPayables.filter((p) => p.status === 'paid').length;
  const monthTotalAmount = monthScopedPayables.reduce((acc, p) => acc + p.amount, 0);

  const filteredPayables = monthScopedPayables.filter((p) => {
    if (payableFilter === 'pending') return p.status === 'pending';
    if (payableFilter === 'overdue') return p.alertStatus === 'overdue';
    if (payableFilter === 'paid') return p.status === 'paid';
    return true;
  });

  const maxChartVal = report
    ? Math.max(
        100,
        ...report.timelineSeries.map((s) => s.servicesRevenue + s.productsRevenue)
      )
    : 100;

  const totalPayments = report
    ? report.byPaymentMethod.reduce((acc, p) => acc + p.total, 0)
    : 0;

  const methodLabelPt = (m: string) => {
    if (m === 'pix') return 'PIX';
    if (m === 'credit_card') return 'Cartão Crédito';
    if (m === 'debit_card') return 'Cartão Débito';
    if (m === 'cash') return 'Dinheiro';
    return m;
  };

  return (
    <div>
      {/* Compact System Notifications for Overdue (1+ day past due) or Upcoming Payable Bills */}
      {(overduePayables.length > 0 || dueSoonOrTodayPayables.length > 0) && (
        <div className="fin-alert-grid">
          {overduePayables.length > 0 && (
            <div className="fin-alert-strip is-overdue">
              <div className="fin-alert-strip-left">
                <AlertTriangle
                  size={15}
                  style={{ color: 'var(--status-danger)', flexShrink: 0 }}
                />
                <div className="fin-alert-strip-text">
                  <span className="fin-alert-strip-title">
                    {overduePayables.length === 1
                      ? '1 Conta Vencida:'
                      : `${overduePayables.length} Contas Vencidas:`}
                  </span>
                  <span className="fin-alert-strip-items">
                    {overduePayables
                      .map(
                        (o) =>
                          `${o.description} (${formatBRL(o.amount)} · há ${Math.abs(
                            o.daysUntilDue
                          )}d)`
                      )
                      .join(' · ')}
                  </span>
                </div>
              </div>
              {subTab !== 'payables' && (
                <button
                  type="button"
                  className="btn btn-sm btn-danger fin-alert-strip-btn"
                  onClick={() => setSubTab('payables')}
                >
                  Dar Baixa
                </button>
              )}
            </div>
          )}

          {dueSoonOrTodayPayables.length > 0 && (
            <div className="fin-alert-strip is-duesoon">
              <div className="fin-alert-strip-left">
                <BellRing size={15} style={{ color: '#B46916', flexShrink: 0 }} />
                <div className="fin-alert-strip-text">
                  <span className="fin-alert-strip-title">
                    {dueSoonOrTodayPayables.length === 1
                      ? 'Próximo Vencimento:'
                      : `${dueSoonOrTodayPayables.length} A Vencer:`}
                  </span>
                  <span className="fin-alert-strip-items">
                    {dueSoonOrTodayPayables
                      .map(
                        (d) =>
                          `${d.description} (${formatBRL(d.amount)} · ${
                            d.daysUntilDue === 0 ? 'Hoje' : `em ${d.daysUntilDue}d`
                          })`
                      )
                      .join(' · ')}
                  </span>
                </div>
              </div>
              {subTab !== 'payables' && (
                <button
                  type="button"
                  className="btn btn-sm fin-alert-strip-btn"
                  style={{ borderColor: '#D9A557', color: '#78450A', background: '#FFF' }}
                  onClick={() => setSubTab('payables')}
                >
                  Ver Conta
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Mobile Floating Submenu docked directly above the bottom navigation bar */}
      <div className="mobile-fin-submenu" role="tablist" aria-label="Submenu Financeiro">
        <button
          type="button"
          className={`mobile-fin-subbtn ${subTab === 'balance' ? 'active' : ''}`}
          onClick={() => setSubTab('balance')}
        >
          <Wallet size={13} style={{ flexShrink: 0 }} />
          <span>Balanço Financeiro</span>
        </button>

        <button
          type="button"
          className={`mobile-fin-subbtn ${subTab === 'payables' ? 'active' : ''}`}
          onClick={() => setSubTab('payables')}
        >
          <CalendarClock size={13} style={{ flexShrink: 0 }} />
          <span>Contas a Pagar</span>
          {(overduePayables.length > 0 || pendingPayables.length > 0) && (
            <span
              className="mobile-fin-subbadge"
              style={
                overduePayables.length === 0
                  ? { background: '#C87D28', color: '#FFF' }
                  : undefined
              }
            >
              {overduePayables.length > 0 ? overduePayables.length : pendingPayables.length}
            </span>
          )}
        </button>
      </div>

      {/* =========================================================
          SUB-TAB 1: BALANÇO, EXTRATO & ESTORNOS
         ========================================================= */}
      {subTab === 'balance' && (
        <>
          {/* Period Selector Bar */}
          <div className="agenda-toolbar">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(
                [
                  { id: 'daily', label: 'Diário' },
                  { id: 'weekly', label: 'Semanal' },
                  { id: 'monthly', label: 'Mensal' },
                  { id: 'annual', label: 'Anual' },
                ] as { id: FinancialPeriod; label: string }[]
              ).map((p) => (
                <button
                  key={p.id}
                  className={`btn ${period === p.id ? 'btn-primary' : ''}`}
                  onClick={() => setPeriod(p.id)}
                >
                  Relatório {p.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12.5, color: 'var(--ink-secondary)', fontWeight: 600 }}>
                Data Base:
              </span>
              <input
                type="date"
                value={referenceDate}
                onChange={(e) => onDateChange(e.target.value)}
                className="mono"
                style={{
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-color)',
                }}
              />
              <button
                className="btn"
                onClick={() => {
                  setTxForm({
                    ...txForm,
                    date: referenceDate,
                    description: '',
                    amount: 100,
                    paymentMethod: 'pix',
                  });
                  setShowTxModal(true);
                }}
              >
                <Plus size={15} /> Lançar Despesa / Entrada
              </button>
              <button className="btn" onClick={handleExportCSV}>
                <Download size={15} /> Exportar CSV
              </button>
            </div>
          </div>

          {loading || !report ? (
            <div className="card" style={{ textAlign: 'center', padding: 40 }}>
              Calculando balanço financeiro...
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 16 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700 }}>{report.label}</h2>
                <p style={{ fontSize: 12.5, color: 'var(--ink-secondary)' }}>
                  Período apurado de {formatDateBR(report.startDate)} até{' '}
                  {formatDateBR(report.endDate)} · Desconto automático de taxas de cartão (Débito{' '}
                  {settings.debitCardFeePercent}% / Crédito {settings.creditCardFeePercent}%)
                </p>
              </div>

              {/* 4 Main Financial Balance KPIs */}
              <div className="kpi-grid">
                <div className="kpi-card">
                  <div className="kpi-label">
                    <span>Faturamento Bruto Total</span>
                    <TrendingUp size={15} />
                  </div>
                  <div className="kpi-value">{formatBRL(report.summary.grossRevenue)}</div>
                  <div className="kpi-sub">
                    Ticket Médio: {formatBRL(report.summary.averageTicket)} · Taxas Cartão:{' '}
                    <strong style={{ color: 'var(--status-danger)' }}>
                      -{formatBRL(report.summary.cardFeesTotal)}
                    </strong>
                  </div>
                </div>

                <div className="kpi-card">
                  <div className="kpi-label">
                    <span>Serviços Executados</span>
                    <Scissors size={15} />
                  </div>
                  <div className="kpi-value">{formatBRL(report.summary.servicesRevenue)}</div>
                  <div className="kpi-sub">
                    {report.summary.servicesCount} comandas concluídas (
                    {report.summary.fitInServicesCount} encaixes)
                  </div>
                </div>

                <div className="kpi-card">
                  <div className="kpi-label">
                    <span>Produtos Vendidos</span>
                    <ShoppingBag size={15} />
                  </div>
                  <div className="kpi-value">{formatBRL(report.summary.productsRevenue)}</div>
                  <div className="kpi-sub">
                    {report.summary.productsSoldCount} itens · Lucro líquido prod:{' '}
                    {formatBRL(report.summary.productsProfit)}
                  </div>
                </div>

                <div
                  className="kpi-card"
                  style={{
                    borderColor: report.summary.netBalance >= 0 ? '#BBDAC6' : '#EABDBD',
                    background: report.summary.netBalance >= 0 ? '#F7FBF8' : '#FDF7F7',
                  }}
                >
                  <div className="kpi-label">
                    <span>Balanço Líquido Real</span>
                    <Wallet size={15} />
                  </div>
                  <div
                    className="kpi-value"
                    style={{
                      color:
                        report.summary.netBalance >= 0
                          ? 'var(--status-ok)'
                          : 'var(--status-danger)',
                    }}
                  >
                    {formatBRL(report.summary.netBalance)}
                  </div>
                  <div className="kpi-sub">
                    Descontados Taxas Maquininha ({formatBRL(report.summary.cardFeesTotal)}), CMV (
                    {formatBRL(report.summary.productsCost)}) e Despesas (
                    {formatBRL(report.summary.expensesTotal)})
                  </div>
                </div>
              </div>

              {/* Chart + Payment Methods Breakdown with Card Machine Fee Discounts */}
              <div className="fin-chart-grid">
                <div
                  className="card"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 12,
                      marginBottom: 14,
                    }}
                  >
                    <div>
                      <h3 style={{ fontSize: 15, fontWeight: 700 }}>
                        Evolução de Receita (Serviços vs. Produtos)
                      </h3>
                      <p style={{ fontSize: 12, color: 'var(--ink-secondary)' }}>
                        Comparativo visual dentro do período selecionado
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 16, fontSize: 12.5, fontWeight: 500 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 2,
                            background: 'var(--accent)',
                          }}
                        />
                        Serviços
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 2,
                            background: '#C87D28',
                          }}
                        />
                        Produtos
                      </span>
                    </div>
                  </div>

                  <div className="chart-bars">
                    {report.timelineSeries.map((pt) => {
                      const srvH = Math.round((pt.servicesRevenue / maxChartVal) * 155);
                      const prdH = Math.round((pt.productsRevenue / maxChartVal) * 155);
                      const total = pt.servicesRevenue + pt.productsRevenue;
                      return (
                        <div
                          key={pt.dateKey}
                          className="chart-col"
                          title={`${pt.label}: Serviços ${formatBRL(
                            pt.servicesRevenue
                          )} + Produtos ${formatBRL(pt.productsRevenue)}`}
                        >
                          {total > 0 && (
                            <span
                              className="mono"
                              style={{
                                fontSize: 9.5,
                                color: 'var(--ink-secondary)',
                                fontWeight: 600,
                              }}
                            >
                              {Math.round(total)}
                            </span>
                          )}
                          <div
                            className="chart-bar-stack"
                            style={{ height: Math.max(4, srvH + prdH) }}
                          >
                            <div className="chart-seg-service" style={{ height: srvH }} />
                            <div className="chart-seg-product" style={{ height: prdH }} />
                          </div>
                          <span className="chart-label">{pt.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="card">
                  <div
                    style={{
                      marginBottom: 14,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: 8,
                    }}
                  >
                    <div>
                      <h3 style={{ fontSize: 15, fontWeight: 700 }}>
                        Meios de Pagamento & Taxas de Cartão
                      </h3>
                      <p style={{ fontSize: 12, color: 'var(--ink-secondary)' }}>
                        Valor bruto vs. líquido após desconto da maquininha
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={onOpenSettings}
                      title="Configurar taxas % de débito e crédito na tela de Configurações"
                    >
                      <Percent size={12} /> Configurar Taxas
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {report.byPaymentMethod.map((pm) => {
                      const pct =
                        totalPayments > 0 ? Math.round((pm.total / totalPayments) * 100) : 0;
                      return (
                        <div key={pm.method} className="payment-method-item">
                          <div className="payment-method-row">
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                                {pm.label}
                                {pm.feePercent > 0 && (
                                  <span
                                    className="mono"
                                    style={{
                                      marginLeft: 6,
                                      fontSize: 11,
                                      padding: '1px 6px',
                                      borderRadius: 4,
                                      background: '#FDF2F2',
                                      color: 'var(--status-danger)',
                                    }}
                                  >
                                    Taxa {pm.feePercent}%
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>
                                {pm.count} {pm.count === 1 ? 'entrada' : 'entradas'} ({pct}%)
                                {pm.feeTotal > 0 && (
                                  <span style={{ color: 'var(--status-danger)', marginLeft: 6 }}>
                                    · Desc. Maquininha: -{formatBRL(pm.feeTotal)}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              <div
                                className="mono"
                                style={{
                                  fontWeight: 700,
                                  fontSize: 14.5,
                                  whiteSpace: 'nowrap',
                                  color: 'var(--status-ok)',
                                }}
                              >
                                Líq: {formatBRL(pm.netTotal)}
                              </div>
                              {pm.feeTotal > 0 && (
                                <div
                                  className="mono"
                                  style={{ fontSize: 11, color: 'var(--ink-muted)' }}
                                >
                                  Bruto: {formatBRL(pm.total)}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="payment-bar-track">
                            <div className="payment-bar-fill" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Ranking Services & Products */}
              <div className="fin-two-col-grid">
                <div className="card">
                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>
                    Serviços Executados no Período
                  </h3>
                  {report.topServices.length === 0 ? (
                    <p style={{ color: 'var(--ink-muted)', fontSize: 13 }}>
                      Nenhum serviço finalizado neste período.
                    </p>
                  ) : (
                    <div className="table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Serviço</th>
                            <th>Qtd.</th>
                            <th style={{ textAlign: 'right' }}>Total Faturado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.topServices.map((s) => (
                            <tr key={s.serviceId}>
                              <td style={{ fontWeight: 600 }}>{s.serviceName}</td>
                              <td className="mono">{s.count}x</td>
                              <td
                                className="mono"
                                style={{ textAlign: 'right', fontWeight: 600 }}
                              >
                                {formatBRL(s.revenue)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="card">
                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>
                    Produtos de Beleza Vendidos no Período
                  </h3>
                  {report.topProducts.length === 0 ? (
                    <p style={{ color: 'var(--ink-muted)', fontSize: 13 }}>
                      Nenhum produto vendido neste período.
                    </p>
                  ) : (
                    <div className="table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Produto</th>
                            <th>Unid.</th>
                            <th>Faturado</th>
                            <th style={{ textAlign: 'right' }}>Margem Líquida</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.topProducts.map((p) => (
                            <tr key={p.productId}>
                              <td style={{ fontWeight: 600 }}>{p.productName}</td>
                              <td className="mono" style={{ whiteSpace: 'nowrap' }}>
                                {p.quantitySold} un
                              </td>
                              <td className="mono" style={{ whiteSpace: 'nowrap' }}>
                                {formatBRL(p.revenue)}
                              </td>
                              <td
                                className="mono"
                                style={{
                                  textAlign: 'right',
                                  fontWeight: 600,
                                  color: 'var(--status-ok)',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                +{formatBRL(p.profit)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* Complete Financial Ledger Table with Refund (Estorno) Action */}
              <div className="card">
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 10,
                    marginBottom: 12,
                  }}
                >
                  <div>
                    <h3 style={{ fontSize: 15, fontWeight: 700 }}>
                      Extrato Detalhado de Entradas, Taxas de Cartão, Despesas & Estornos
                    </h3>
                    <p style={{ fontSize: 12, color: 'var(--ink-secondary)' }}>
                      Qualquer valor de entrada pode ser estornado informando obrigatoriamente o
                      motivo por escrito
                    </p>
                  </div>
                </div>

                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Natureza</th>
                        <th>Cliente / Descrição</th>
                        <th>Detalhamento / Motivo</th>
                        <th>Meio & Taxa</th>
                        <th style={{ textAlign: 'right' }}>Valor no Balanço</th>
                        <th style={{ textAlign: 'right' }}>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Active Completed Appointments */}
                      {report.completedAppointments.map((a) => (
                        <tr key={`appt-${a.id}`}>
                          <td className="mono" style={{ whiteSpace: 'nowrap' }}>
                            {formatDateBR(a.date)} {a.startTime}
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <span className="badge badge-completed">
                              <ArrowUpRight size={11} /> Comanda #{a.id}
                            </span>
                            {a.isFitIn && (
                              <span className="badge badge-fitin" style={{ marginLeft: 4 }}>
                                Encaixe
                              </span>
                            )}
                          </td>
                          <td>
                            <strong>{a.clientName}</strong>
                            <div style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>
                              Profissional: {a.professionalName}
                            </div>
                          </td>
                          <td>
                            <div>
                              {a.serviceName} ({formatBRL(a.servicePrice)})
                            </div>
                            {a.products.length > 0 && (
                              <div style={{ fontSize: 11.5, color: 'var(--ink-secondary)' }}>
                                + Produtos:{' '}
                                {a.products
                                  .map((p) => `${p.quantity}x ${p.productName}`)
                                  .join(', ')}{' '}
                                ({formatBRL(a.productsTotal)})
                              </div>
                            )}
                          </td>
                          <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                            <div style={{ fontWeight: 600 }}>
                              {methodLabelPt(a.paymentMethod)}
                            </div>
                            {(a.cardFeeAmount || 0) > 0 && (
                              <div
                                className="mono"
                                style={{ fontSize: 11, color: 'var(--status-danger)' }}
                              >
                                Taxa {a.cardFeePercent}% (-{formatBRL(a.cardFeeAmount || 0)})
                              </div>
                            )}
                          </td>
                          <td
                            className="mono"
                            style={{
                              textAlign: 'right',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <div
                              style={{
                                fontWeight: 700,
                                color: 'var(--status-ok)',
                              }}
                            >
                              +{formatBRL(a.netAmountReceived ?? a.totalAmount)}
                            </div>
                            {(a.cardFeeAmount || 0) > 0 && (
                              <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
                                Bruto: {formatBRL(a.totalAmount)}
                              </div>
                            )}
                          </td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button
                              type="button"
                              className="btn btn-sm"
                              style={{
                                color: 'var(--status-danger)',
                                borderColor: '#EABDBD',
                                background: '#FFF',
                              }}
                              onClick={() => {
                                setRefundTarget({
                                  kind: 'appointment',
                                  id: a.id,
                                  title: `Comanda #${a.id} — ${a.clientName} (${a.serviceName})`,
                                  amount: a.totalAmount,
                                  date: a.date,
                                });
                                setRefundReason('');
                                setRefundError('');
                              }}
                            >
                              <RotateCcw size={12} /> Estornar
                            </button>
                          </td>
                        </tr>
                      ))}

                      {/* Refunded Appointments (Audit Trail) */}
                      {report.refundedAppointments.map((r) => (
                        <tr
                          key={`ref-appt-${r.id}`}
                          style={{ background: '#FAF6F6', opacity: 0.85 }}
                        >
                          <td className="mono" style={{ whiteSpace: 'nowrap' }}>
                            {formatDateBR(r.date)} {r.startTime}
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <span className="badge badge-danger">
                              <RotateCcw size={11} /> Comanda #{r.id} ESTORNADA
                            </span>
                          </td>
                          <td>
                            <strong style={{ textDecoration: 'line-through' }}>
                              {r.clientName}
                            </strong>
                            <div style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>
                              {r.serviceName}
                            </div>
                          </td>
                          <td>
                            <div
                              style={{
                                fontSize: 12,
                                color: '#7A1C1D',
                                fontWeight: 600,
                                background: '#FCE8E8',
                                padding: '4px 8px',
                                borderRadius: 4,
                                display: 'inline-block',
                              }}
                            >
                              Motivo do Estorno: &ldquo;{r.refundReason}&rdquo;
                            </div>
                          </td>
                          <td style={{ fontSize: 12 }}>{methodLabelPt(r.paymentMethod)}</td>
                          <td
                            className="mono"
                            style={{
                              textAlign: 'right',
                              textDecoration: 'line-through',
                              color: 'var(--ink-muted)',
                            }}
                          >
                            {formatBRL(r.totalAmount)}
                          </td>
                          <td
                            style={{
                              textAlign: 'right',
                              fontSize: 11.5,
                              color: 'var(--ink-muted)',
                            }}
                          >
                            Estornado
                          </td>
                        </tr>
                      ))}

                      {/* Manual Transactions (Income, Expense, or Refunded Income) */}
                      {report.manualTransactions.map((m) => (
                        <tr
                          key={`man-${m.id}`}
                          style={
                            m.isRefunded ? { background: '#FAF6F6', opacity: 0.85 } : undefined
                          }
                        >
                          <td className="mono" style={{ whiteSpace: 'nowrap' }}>
                            {formatDateBR(m.date)}
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            {m.isRefunded ? (
                              <span className="badge badge-danger">
                                <RotateCcw size={11} /> Entrada ESTORNADA
                              </span>
                            ) : m.type === 'income' ? (
                              <span className="badge badge-completed">
                                <ArrowUpRight size={11} /> Entrada Extra
                              </span>
                            ) : (
                              <span className="badge badge-danger">
                                <ArrowDownRight size={11} /> Despesa / Saída
                              </span>
                            )}
                          </td>
                          <td>
                            <strong
                              style={
                                m.isRefunded ? { textDecoration: 'line-through' } : undefined
                              }
                            >
                              {m.description}
                            </strong>
                          </td>
                          <td>
                            {m.isRefunded ? (
                              <div
                                style={{
                                  fontSize: 12,
                                  color: '#7A1C1D',
                                  fontWeight: 600,
                                  background: '#FCE8E8',
                                  padding: '4px 8px',
                                  borderRadius: 4,
                                  display: 'inline-block',
                                }}
                              >
                                Motivo do Estorno: &ldquo;{m.refundReason}&rdquo;
                              </div>
                            ) : (
                              m.category
                            )}
                          </td>
                          <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                            <div style={{ fontWeight: 600 }}>
                              {methodLabelPt(m.paymentMethod)}
                            </div>
                            {m.type === 'income' && !m.isRefunded && (m.cardFeeAmount || 0) > 0 && (
                              <div
                                className="mono"
                                style={{ fontSize: 11, color: 'var(--status-danger)' }}
                              >
                                Taxa {m.cardFeePercent}% (-{formatBRL(m.cardFeeAmount || 0)})
                              </div>
                            )}
                          </td>
                          <td
                            className="mono"
                            style={{
                              textAlign: 'right',
                              fontWeight: 700,
                              color: m.isRefunded
                                ? 'var(--ink-muted)'
                                : m.type === 'income'
                                ? 'var(--status-ok)'
                                : 'var(--status-danger)',
                              textDecoration: m.isRefunded ? 'line-through' : undefined,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {m.isRefunded ? (
                              formatBRL(m.amount)
                            ) : m.type === 'income' ? (
                              <>
                                <div>+{formatBRL(m.netAmountReceived ?? m.amount)}</div>
                                {(m.cardFeeAmount || 0) > 0 && (
                                  <div
                                    style={{
                                      fontSize: 11,
                                      color: 'var(--ink-muted)',
                                      fontWeight: 400,
                                    }}
                                  >
                                    Bruto: {formatBRL(m.amount)}
                                  </div>
                                )}
                              </>
                            ) : (
                              `-${formatBRL(m.amount)}`
                            )}
                          </td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <div
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                              }}
                            >
                              {m.type === 'income' && !m.isRefunded && (
                                <button
                                  type="button"
                                  className="btn btn-sm"
                                  style={{
                                    color: 'var(--status-danger)',
                                    borderColor: '#EABDBD',
                                    background: '#FFF',
                                  }}
                                  onClick={() => {
                                    setRefundTarget({
                                      kind: 'manual',
                                      id: m.id,
                                      title: `Entrada Extra — ${m.description}`,
                                      amount: m.amount,
                                      date: m.date,
                                    });
                                    setRefundReason('');
                                    setRefundError('');
                                  }}
                                >
                                  <RotateCcw size={12} /> Estornar
                                </button>
                              )}
                              <button
                                className="btn btn-sm btn-ghost"
                                title="Excluir registro"
                                onClick={async () => {
                                  await api.deleteManualTransaction(m.id);
                                  await loadData();
                                  notifyToast('Lançamento removido.');
                                }}
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* =========================================================
          SUB-TAB 2: CONTAS A PAGAR (RECORRÊNCIA MENSAL & FORNECEDORES)
         ========================================================= */}
      {subTab === 'payables' && (
        <div>
          {/* Month Navigator & Status Filters Bar */}
          <div className="agenda-toolbar" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                paddingBottom: 10,
                borderBottom: '1px solid var(--border-color)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => shiftPayableMonth(-1)}
                  title="Ver contas do mês anterior"
                >
                  <ChevronLeft size={15} /> Mês Anterior
                </button>

                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    background: showAllMonths ? 'var(--bg-subtle)' : '#F5EFE8',
                    border: '1px solid var(--border-color)',
                    padding: '5px 12px',
                    borderRadius: 'var(--radius-sm)',
                    fontWeight: 700,
                    fontSize: 13.5,
                  }}
                >
                  <CalendarClock size={15} style={{ color: 'var(--accent)' }} />
                  <span>
                    {showAllMonths ? 'Todos os Meses Cadastrados' : formatMonthLabel(payableMonth)}
                  </span>
                  <input
                    type="month"
                    value={payableMonth}
                    onChange={(e) => {
                      if (e.target.value) {
                        setPayableMonth(e.target.value);
                        setShowAllMonths(false);
                      }
                    }}
                    className="mono"
                    style={{
                      border: '1px solid var(--border-color)',
                      borderRadius: 4,
                      padding: '2px 6px',
                      fontSize: 12,
                      background: '#FFF',
                    }}
                    title="Escolher mês específico"
                  />
                </div>

                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => shiftPayableMonth(1)}
                  title="Ver contas do próximo mês"
                >
                  Próximo Mês <ChevronRight size={15} />
                </button>

                <button
                  type="button"
                  className={`btn btn-sm ${showAllMonths ? 'btn-primary' : ''}`}
                  onClick={() => setShowAllMonths((prev) => !prev)}
                >
                  {showAllMonths ? 'Filtrar por Mês' : `Ver Todos os Meses (${payables.length})`}
                </button>
              </div>

              <div style={{ fontSize: 12.5, color: 'var(--ink-secondary)' }}>
                Total listado:{' '}
                <strong className="mono" style={{ color: 'var(--ink-primary)' }}>
                  {formatBRL(monthTotalAmount)}
                </strong>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button
                  className={`btn ${payableFilter === 'all' ? 'btn-primary' : ''}`}
                  onClick={() => setPayableFilter('all')}
                >
                  Todas ({monthScopedPayables.length})
                </button>
                <button
                  className={`btn ${payableFilter === 'pending' ? 'btn-primary' : ''}`}
                  onClick={() => setPayableFilter('pending')}
                >
                  A Pagar / Pendentes ({monthPendingCount})
                </button>
                <button
                  className={`btn ${payableFilter === 'overdue' ? 'btn-primary' : ''}`}
                  onClick={() => setPayableFilter('overdue')}
                >
                  Vencidas ({monthOverdueCount})
                </button>
                <button
                  className={`btn ${payableFilter === 'paid' ? 'btn-primary' : ''}`}
                  onClick={() => setPayableFilter('paid')}
                >
                  Pagas ({monthPaidCount})
                </button>
              </div>

              <button
                className="btn btn-primary"
                onClick={() => {
                  setPayableForm({
                    description: '',
                    category: 'Aluguel / Despesa Fixa',
                    amount: 500,
                    dueDate: referenceDate,
                    recurrenceType: 'monthly',
                    monthsCount: 12,
                    totalInstallments: 3,
                    paymentMethod: 'pix',
                  });
                  setShowPayableModal(true);
                }}
              >
                <Plus size={15} /> Agendar Conta a Pagar (Mensal / Parcelada)
              </button>
            </div>
          </div>

          <div className="card">
            <div style={{ marginBottom: 14 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700 }}>
                Programação de Contas a Pagar —{' '}
                {showAllMonths ? 'Todos os Meses' : formatMonthLabel(payableMonth)}
              </h3>
              <p style={{ fontSize: 12.5, color: 'var(--ink-secondary)' }}>
                O sistema avisa quando uma conta está prestes a vencer, alerta 1 dia após o
                vencimento caso não seja paga, e ao marcar como paga lança automaticamente como
                Despesa no dia no Balanço Financeiro.
              </p>
            </div>

            {filteredPayables.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-muted)' }}>
                Nenhuma conta encontrada em{' '}
                <strong>{showAllMonths ? 'Todos os Meses' : formatMonthLabel(payableMonth)}</strong>{' '}
                para este filtro. Use os botões <strong>Mês Anterior / Próximo Mês</strong> ou{' '}
                <strong>Ver Todos os Meses</strong> acima para navegar.
              </div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Vencimento</th>
                      <th>Status / Alerta</th>
                      <th>Descrição da Conta</th>
                      <th>Recorrência</th>
                      <th>Valor</th>
                      <th style={{ textAlign: 'right' }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPayables.map((item) => {
                      const isOverdue = item.alertStatus === 'overdue';
                      const isDueToday = item.alertStatus === 'due_today';
                      const isDueSoon = item.alertStatus === 'due_soon';

                      return (
                        <tr
                          key={item.id}
                          style={
                            isOverdue
                              ? { background: '#FDF4F4' }
                              : isDueToday || isDueSoon
                              ? { background: '#FFFDF7' }
                              : item.status === 'paid'
                              ? { opacity: 0.82 }
                              : undefined
                          }
                        >
                          <td className="mono" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {formatDateBR(item.dueDate)}
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            {item.status === 'paid' ? (
                              <span className="badge badge-completed">
                                <CheckCircle2 size={11} /> Paga em {formatDateBR(item.paidAt)}
                              </span>
                            ) : isOverdue ? (
                              <span className="badge badge-danger">
                                <AlertTriangle size={11} /> VENCIDA há{' '}
                                {Math.abs(item.daysUntilDue)}{' '}
                                {Math.abs(item.daysUntilDue) === 1 ? 'dia' : 'dias'}
                              </span>
                            ) : isDueToday ? (
                              <span
                                className="badge"
                                style={{
                                  background: '#FDE68A',
                                  color: '#92400E',
                                  fontWeight: 700,
                                }}
                              >
                                <BellRing size={11} /> Vence HOJE!
                              </span>
                            ) : isDueSoon ? (
                              <span
                                className="badge"
                                style={{
                                  background: '#FEF3C7',
                                  color: '#92400E',
                                }}
                              >
                                <BellRing size={11} /> Vence em {item.daysUntilDue}{' '}
                                {item.daysUntilDue === 1 ? 'dia' : 'dias'}
                              </span>
                            ) : (
                              <span className="badge">
                                Agendada ({item.daysUntilDue} dias)
                              </span>
                            )}
                          </td>
                          <td>
                            <div style={{ fontWeight: 600 }}>{item.description}</div>
                            <div style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>
                              Categoria: {item.category}
                            </div>
                            {item.refundReason && (
                              <div
                                style={{
                                  fontSize: 11,
                                  color: '#7A1C1D',
                                  background: '#FCE8E8',
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                  marginTop: 4,
                                  display: 'inline-block',
                                }}
                              >
                                Pagamento estornado anteriormente: &ldquo;{item.refundReason}&rdquo;
                              </div>
                            )}
                          </td>
                          <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                            {item.recurrenceType === 'monthly' ? (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  color: 'var(--accent)',
                                  fontWeight: 600,
                                }}
                              >
                                <Repeat size={12} /> Fixa Mensal ({item.installmentNumber}/
                                {item.totalInstallments})
                              </span>
                            ) : item.recurrenceType === 'installments' ? (
                              <span style={{ fontWeight: 600, color: '#78450A' }}>
                                Parcela {item.installmentNumber}/{item.totalInstallments}
                              </span>
                            ) : (
                              'Única / Avulsa'
                            )}
                          </td>
                          <td
                            className="mono"
                            style={{
                              fontWeight: 700,
                              color:
                                item.status === 'paid'
                                  ? 'var(--ink-secondary)'
                                  : 'var(--status-danger)',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {formatBRL(item.amount)}
                          </td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <div
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                              }}
                            >
                              {item.status === 'pending' && (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-primary"
                                  onClick={() => {
                                    setPayTarget(item);
                                    setPayMethod(item.paymentMethod || 'pix');
                                    setPayDate(referenceDate);
                                  }}
                                >
                                  <CheckCircle2 size={13} /> Marcar como Paga
                                </button>
                              )}

                              {item.status === 'paid' && (
                                <button
                                  type="button"
                                  className="btn btn-sm"
                                  style={{
                                    color: 'var(--status-danger)',
                                    borderColor: '#EABDBD',
                                    background: '#FFF',
                                  }}
                                  title="Estornar pagamento desta conta e remover despesa do balanço"
                                  onClick={() => {
                                    setRefundTarget({
                                      kind: 'payable',
                                      id: item.id,
                                      title: `Conta Paga — ${item.description}`,
                                      amount: item.amount,
                                      date: item.paidAt || item.dueDate,
                                    });
                                    setRefundReason('');
                                    setRefundError('');
                                  }}
                                >
                                  <RotateCcw size={12} /> Estornar
                                </button>
                              )}

                              <button
                                type="button"
                                className="btn btn-sm"
                                title="Editar conta a pagar"
                                onClick={() => {
                                  setEditPayableTarget(item);
                                  setEditPayableForm({
                                    description: item.description,
                                    category: item.category,
                                    amount: item.amount,
                                    dueDate: item.dueDate,
                                    paymentMethod: item.paymentMethod || 'pix',
                                    updateSubsequent: true,
                                  });
                                }}
                              >
                                <Edit3 size={12} /> Editar
                              </button>

                              <button
                                type="button"
                                className="btn btn-sm btn-ghost"
                                title="Excluir conta"
                                onClick={() => {
                                  setDeletePayableTarget(item);
                                  setDeleteSubsequent(false);
                                }}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL 1: ESTORNO (ENTRADA OU CONTA PAGA - MOTIVO POR ESCRITO OBRIGATÓRIO)
         ========================================================= */}
      {refundTarget && (
        <div className="modal-backdrop" onClick={() => setRefundTarget(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                {refundTarget.kind === 'payable'
                  ? 'Estornar Pagamento de Conta'
                  : 'Estornar Valor de Entrada'}
              </h2>
              <button className="btn btn-sm" onClick={() => setRefundTarget(null)}>
                Fechar
              </button>
            </div>
            <form onSubmit={handleConfirmRefund}>
              <div className="modal-body">
                <div
                  style={{
                    background: '#FDF2F2',
                    border: '1px solid #EABDBD',
                    borderRadius: 'var(--radius-sm)',
                    padding: '12px 14px',
                    marginBottom: 14,
                  }}
                >
                  <div style={{ fontSize: 12, color: '#7A1C1D', fontWeight: 600 }}>
                    Item selecionado para estorno:
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>
                    {refundTarget.title}
                  </div>
                  <div className="mono" style={{ fontSize: 13.5, color: '#9E2A2B', marginTop: 4 }}>
                    {refundTarget.kind === 'payable'
                      ? `Valor da despesa que será removido do Balanço: ${formatBRL(
                          refundTarget.amount
                        )} (Pago em ${formatDateBR(refundTarget.date)})`
                      : `Valor a ser estornado do balanço: ${formatBRL(
                          refundTarget.amount
                        )} (Data: ${formatDateBR(refundTarget.date)})`}
                  </div>
                </div>

                <div className="field">
                  <label>Motivo do Estorno por Escrito (Obrigatório) *</label>
                  <textarea
                    rows={3}
                    required
                    autoFocus
                    placeholder={
                      refundTarget.kind === 'payable'
                        ? 'Descreva obrigatoriamente o motivo do estorno (ex: Baixa lançada por engano, valor incorreto, estorno bancário...)'
                        : 'Descreva obrigatoriamente o motivo do estorno (ex: Cobrança duplicada, devolução de produto, cancelamento solicitado pelo cliente...)'
                    }
                    value={refundReason}
                    onChange={(e) => {
                      setRefundReason(e.target.value);
                      if (refundError) setRefundError('');
                    }}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-color)',
                      fontFamily: 'inherit',
                      fontSize: 13.5,
                    }}
                  />
                </div>

                {refundError && (
                  <div
                    style={{
                      color: 'var(--status-danger)',
                      fontSize: 12.5,
                      fontWeight: 600,
                      marginTop: 6,
                    }}
                  >
                    {refundError}
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn" onClick={() => setRefundTarget(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-danger">
                  <RotateCcw size={14} />{' '}
                  {refundTarget.kind === 'payable'
                    ? 'Confirmar Estorno e Remover do Balanço'
                    : 'Confirmar Estorno da Entrada'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL 1B: EDITAR CONTA A PAGAR (COM OPÇÃO DE ATUALIZAR SUBSEQUENTES)
         ========================================================= */}
      {editPayableTarget && (
        <div className="modal-backdrop" onClick={() => setEditPayableTarget(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Editar Conta a Pagar</h2>
              <button className="btn btn-sm" onClick={() => setEditPayableTarget(null)}>
                Fechar
              </button>
            </div>
            <form onSubmit={handleUpdatePayable}>
              <div className="modal-body">
                <div className="form-grid">
                  <div className="field">
                    <label>Descrição da Conta / Fornecedor *</label>
                    <input
                      type="text"
                      required
                      value={editPayableForm.description}
                      onChange={(e) =>
                        setEditPayableForm({ ...editPayableForm, description: e.target.value })
                      }
                    />
                  </div>
                  <div className="field">
                    <label>Categoria *</label>
                    <input
                      type="text"
                      required
                      value={editPayableForm.category}
                      onChange={(e) =>
                        setEditPayableForm({ ...editPayableForm, category: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="form-grid">
                  <div className="field">
                    <label>Valor (R$) *</label>
                    <input
                      type="number"
                      step="0.01"
                      min={0.01}
                      required
                      value={editPayableForm.amount}
                      onChange={(e) =>
                        setEditPayableForm({
                          ...editPayableForm,
                          amount: Number(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div className="field">
                    <label>Data de Vencimento *</label>
                    <input
                      type="date"
                      required
                      value={editPayableForm.dueDate}
                      onChange={(e) =>
                        setEditPayableForm({ ...editPayableForm, dueDate: e.target.value })
                      }
                    />
                  </div>
                </div>

                {(editPayableTarget.recurrenceType === 'monthly' ||
                  editPayableTarget.recurrenceType === 'installments') &&
                  editPayableTarget.recurrenceGroupId && (
                    <div
                      style={{
                        background: '#FAF7F2',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '12px 14px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: 13 }}>
                        Esta é uma conta{' '}
                        {editPayableTarget.recurrenceType === 'monthly'
                          ? `Fixa Mensal (${editPayableTarget.installmentNumber}/${editPayableTarget.totalInstallments})`
                          : `Parcelada (${editPayableTarget.installmentNumber}/${editPayableTarget.totalInstallments})`}
                        . Como deseja aplicar a alteração?
                      </div>

                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          fontSize: 13,
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="radio"
                          name="updateSubsequentScope"
                          checked={!editPayableForm.updateSubsequent}
                          onChange={() =>
                            setEditPayableForm({ ...editPayableForm, updateSubsequent: false })
                          }
                        />
                        <span>
                          Alterar <strong>apenas esta parcela/mês</strong> (vencimento{' '}
                          {formatDateBR(editPayableTarget.dueDate)})
                        </span>
                      </label>

                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          fontSize: 13,
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="radio"
                          name="updateSubsequentScope"
                          checked={editPayableForm.updateSubsequent}
                          onChange={() =>
                            setEditPayableForm({ ...editPayableForm, updateSubsequent: true })
                          }
                        />
                        <span>
                          Alterar <strong>esta e todas as parcelas/meses subsequentes</strong>{' '}
                          (atualiza descrição, valor, categoria e dia de vencimento)
                        </span>
                      </label>
                    </div>
                  )}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setEditPayableTarget(null)}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  <CheckCircle2 size={14} /> Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL 1C: CONFIRMAÇÃO DE EXCLUSÃO DE CONTA A PAGAR (COM OPÇÃO DE SUBSEQUENTES)
         ========================================================= */}
      {deletePayableTarget && (
        <div className="modal-backdrop" onClick={() => setDeletePayableTarget(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Confirmar Exclusão de Conta a Pagar</h2>
              <button className="btn btn-sm" onClick={() => setDeletePayableTarget(null)}>
                Fechar
              </button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14 }}>
                Tem certeza que deseja excluir a conta{' '}
                <strong>{deletePayableTarget.description}</strong> no valor de{' '}
                <strong className="mono">{formatBRL(deletePayableTarget.amount)}</strong> (vencimento
                em <strong>{formatDateBR(deletePayableTarget.dueDate)}</strong>)?
              </p>

              {(deletePayableTarget.recurrenceType === 'monthly' ||
                deletePayableTarget.recurrenceType === 'installments') &&
                deletePayableTarget.recurrenceGroupId && (
                  <div
                    style={{
                      background: '#FDF2F2',
                      border: '1px solid #EABDBD',
                      borderRadius: 'var(--radius-sm)',
                      padding: '12px 14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#7A1C1D' }}>
                      Esta conta faz parte de uma programação{' '}
                      {deletePayableTarget.recurrenceType === 'monthly'
                        ? `Fixa Mensal (${deletePayableTarget.installmentNumber}/${deletePayableTarget.totalInstallments})`
                        : `Parcelada (${deletePayableTarget.installmentNumber}/${deletePayableTarget.totalInstallments})`}
                      . O que deseja excluir?
                    </div>

                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 13,
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="radio"
                        name="deleteSubsequentScope"
                        checked={!deleteSubsequent}
                        onChange={() => setDeleteSubsequent(false)}
                      />
                      <span>
                        Excluir <strong>apenas este vencimento</strong> (
                        {formatDateBR(deletePayableTarget.dueDate)})
                      </span>
                    </label>

                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 13,
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="radio"
                        name="deleteSubsequentScope"
                        checked={deleteSubsequent}
                        onChange={() => setDeleteSubsequent(true)}
                      />
                      <span>
                        Excluir <strong>este e todos os vencimentos/parcelas subsequentes</strong>
                      </span>
                    </label>
                  </div>
                )}
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn"
                onClick={() => setDeletePayableTarget(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleConfirmDeletePayable}
              >
                <Trash2 size={14} /> Confirmar Exclusão
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL 2: AGENDAR CONTA A PAGAR (MENSAL FIXA / PARCELADA / AVULSA)
         ========================================================= */}
      {showPayableModal && (
        <div className="modal-backdrop" onClick={() => setShowPayableModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Agendar Conta a Pagar</h2>
              <button className="btn btn-sm" onClick={() => setShowPayableModal(false)}>
                Fechar
              </button>
            </div>
            <form onSubmit={handleCreatePayable}>
              <div className="modal-body">
                <div className="field" style={{ marginBottom: 12 }}>
                  <label>Modalidade de Agendamento</label>
                  <select
                    value={payableForm.recurrenceType}
                    onChange={(e) =>
                      setPayableForm({
                        ...payableForm,
                        recurrenceType: e.target.value as PayableRecurrence,
                      })
                    }
                  >
                    <option value="monthly">
                      Repetir Todos os Meses (Ex: Aluguel, Internet, Contabilidade)
                    </option>
                    <option value="installments">
                      Compra Parcelada com Fornecedor (Ex: 3x, 6x, 12x)
                    </option>
                    <option value="once">Conta Única / Vencimento Único</option>
                  </select>
                </div>

                <div className="form-grid">
                  <div className="field">
                    <label>Descrição da Conta / Fornecedor *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Aluguel do Salão, Fornecedor L'Oréal..."
                      value={payableForm.description}
                      onChange={(e) =>
                        setPayableForm({ ...payableForm, description: e.target.value })
                      }
                    />
                  </div>
                  <div className="field">
                    <label>Categoria</label>
                    <input
                      type="text"
                      required
                      value={payableForm.category}
                      onChange={(e) =>
                        setPayableForm({ ...payableForm, category: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="form-grid">
                  <div className="field">
                    <label>
                      {payableForm.recurrenceType === 'installments'
                        ? 'Valor de Cada Parcela (R$) *'
                        : 'Valor Mensal / da Conta (R$) *'}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min={0.01}
                      required
                      value={payableForm.amount}
                      onChange={(e) =>
                        setPayableForm({ ...payableForm, amount: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div className="field">
                    <label>Data do 1º Vencimento *</label>
                    <input
                      type="date"
                      required
                      value={payableForm.dueDate}
                      onChange={(e) =>
                        setPayableForm({ ...payableForm, dueDate: e.target.value })
                      }
                    />
                  </div>
                </div>

                {payableForm.recurrenceType === 'monthly' && (
                  <div className="field">
                    <label>Programar para quantos meses consecutivos?</label>
                    <input
                      type="number"
                      min={2}
                      max={36}
                      value={payableForm.monthsCount}
                      onChange={(e) =>
                        setPayableForm({ ...payableForm, monthsCount: Number(e.target.value) })
                      }
                    />
                    <span style={{ fontSize: 11.5, color: 'var(--ink-muted)', marginTop: 4 }}>
                      O sistema criará automaticamente o vencimento no mesmo dia para todos os{' '}
                      {payableForm.monthsCount} meses.
                    </span>
                  </div>
                )}

                {payableForm.recurrenceType === 'installments' && (
                  <div className="field">
                    <label>Quantidade de Parcelas (Meses)</label>
                    <input
                      type="number"
                      min={2}
                      max={48}
                      value={payableForm.totalInstallments}
                      onChange={(e) =>
                        setPayableForm({
                          ...payableForm,
                          totalInstallments: Number(e.target.value),
                        })
                      }
                    />
                    <span style={{ fontSize: 11.5, color: 'var(--ink-muted)', marginTop: 4 }}>
                      Total da compra parcelada:{' '}
                      <strong>
                        {formatBRL(payableForm.amount * (payableForm.totalInstallments || 1))}
                      </strong>{' '}
                      dividido em {payableForm.totalInstallments}x mensais.
                    </span>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setShowPayableModal(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Confirmar Agendamento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL 3: CONFIRMAR PAGAMENTO DE CONTA (LANÇAR DESPESA NO BALANÇO DO DIA)
         ========================================================= */}
      {payTarget && (
        <div className="modal-backdrop" onClick={() => setPayTarget(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Confirmar Pagamento de Conta</h2>
              <button className="btn btn-sm" onClick={() => setPayTarget(null)}>
                Fechar
              </button>
            </div>
            <form onSubmit={handleConfirmPayPayable}>
              <div className="modal-body">
                <p style={{ fontSize: 13.5, marginBottom: 14 }}>
                  Ao marcar <strong>{payTarget.description}</strong> ({formatBRL(payTarget.amount)})
                  como paga, o sistema lançará automaticamente este valor como{' '}
                  <strong>Despesa no Balanço Financeiro</strong> na data escolhida abaixo:
                </p>
                <div className="form-grid">
                  <div className="field">
                    <label>Data do Pagamento (Lançamento no Balanço)</label>
                    <input
                      type="date"
                      required
                      value={payDate}
                      onChange={(e) => setPayDate(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label>Meio de Pagamento Utilizado</label>
                    <select
                      value={payMethod}
                      onChange={(e) => setPayMethod(e.target.value)}
                    >
                      <option value="pix">PIX / Transferência</option>
                      <option value="cash">Dinheiro do Caixa</option>
                      <option value="debit_card">Cartão de Débito</option>
                      <option value="credit_card">Cartão de Crédito</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn" onClick={() => setPayTarget(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  <CheckCircle2 size={14} /> Confirmar Baixa e Lançar no Balanço
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL 4: LANÇAMENTO AVULSO (DESPESA OU ENTRADA EXTRA)
         ========================================================= */}
      {showTxModal && (
        <div className="modal-backdrop" onClick={() => setShowTxModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Novo Lançamento Financeiro (Despesa ou Entrada)</h2>
              <button className="btn btn-sm" onClick={() => setShowTxModal(false)}>
                Fechar
              </button>
            </div>
            <form onSubmit={handleCreateTx}>
              <div className="modal-body">
                <div className="form-grid">
                  <div className="field">
                    <label>Tipo de Movimentação</label>
                    <select
                      value={txForm.type}
                      onChange={(e) =>
                        setTxForm({
                          ...txForm,
                          type: e.target.value as 'income' | 'expense',
                        })
                      }
                    >
                      <option value="expense">Saída / Despesa Operacional</option>
                      <option value="income">Entrada / Receita Extra</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Data</label>
                    <input
                      type="date"
                      required
                      value={txForm.date}
                      onChange={(e) => setTxForm({ ...txForm, date: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-grid">
                  <div className="field">
                    <label>Categoria</label>
                    <input
                      type="text"
                      required
                      value={txForm.category}
                      onChange={(e) => setTxForm({ ...txForm, category: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Valor (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      min={0.01}
                      required
                      value={txForm.amount}
                      onChange={(e) =>
                        setTxForm({ ...txForm, amount: Number(e.target.value) })
                      }
                    />
                  </div>
                </div>

                <div className="form-grid">
                  <div className="field">
                    <label>Meio de Pagamento</label>
                    <select
                      value={txForm.paymentMethod}
                      onChange={(e) =>
                        setTxForm({ ...txForm, paymentMethod: e.target.value })
                      }
                    >
                      <option value="pix">PIX Instantâneo</option>
                      <option value="debit_card">
                        Cartão de Débito (Taxa {settings.debitCardFeePercent}%)
                      </option>
                      <option value="credit_card">
                        Cartão de Crédito (Taxa {settings.creditCardFeePercent}%)
                      </option>
                      <option value="cash">Dinheiro / Espécie</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Descrição Detalhada</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Compra de Toalhas, Energia Elétrica..."
                      value={txForm.description}
                      onChange={(e) => setTxForm({ ...txForm, description: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn" onClick={() => setShowTxModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Registrar no Balanço
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
