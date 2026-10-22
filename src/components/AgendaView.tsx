import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  Plus,
  CheckCircle2,
  Sparkles,
  MessageSquare,
  Phone,
  ShoppingBag,
  UserPlus,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Edit3,
  Send,
  Layers,
  Scissors,
} from 'lucide-react';
import { api, formatBRL, formatDateBR, formatPhoneMask } from '../api';
import type {
  Appointment,
  Client,
  CompanySettings,
  CompletedDisplayMode,
  ConflictCheckResult,
  PriceType,
  Product,
  Professional,
  ServiceItem,
} from '../../shared/types';

interface AgendaViewProps {
  settings: CompanySettings;
  professionals: Professional[];
  services: ServiceItem[];
  clients: Client[];
  products: Product[];
  selectedDate: string;
  onDateChange: (d: string) => void;
  onRefreshAll: () => Promise<void>;
  notifyToast: (msg: string) => void;
}

interface BookingServiceEntry {
  serviceId: number;
  serviceName: string;
  priceType: PriceType;
  durationMinutes: number;
  price: number;
}

export const AgendaView: React.FC<AgendaViewProps> = ({
  settings,
  professionals,
  services,
  clients,
  products,
  selectedDate,
  onDateChange,
  onRefreshAll,
  notifyToast,
}) => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selectedProfId, setSelectedProfId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [completedMode, setCompletedMode] = useState<CompletedDisplayMode>(
    settings.completedDisplayMode || 'dimmed_strikethrough'
  );

  useEffect(() => {
    if (settings.completedDisplayMode) {
      setCompletedMode(settings.completedDisplayMode);
    }
  }, [settings.completedDisplayMode]);

  const handleChangeCompletedMode = async (newMode: CompletedDisplayMode) => {
    setCompletedMode(newMode);
    try {
      await api.updateSettings({ completedDisplayMode: newMode });
      await onRefreshAll();
    } catch {
      // ignore
    }
  };

  // New / Edit Appointment Modal State
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [editingAppointmentId, setEditingAppointmentId] = useState<number | null>(null);
  const [selectedBookingServiceId, setSelectedBookingServiceId] = useState<number>(0);
  const [selectedBookingProductId, setSelectedBookingProductId] = useState<number>(0);

  const [bookingForm, setBookingForm] = useState<{
    date: string;
    startTime: string;
    professionalId: number;
    services: BookingServiceEntry[];
    durationMinutes: number;
    servicePrice: number;
    clientId: number;
    isNewClient: boolean;
    newClientName: string;
    newClientPhone: string;
    allowFitIn: boolean;
    notes: string;
    products: { productId: number; quantity: number }[];
  }>({
    date: selectedDate,
    startTime: '14:00',
    professionalId: professionals[0]?.id || 1,
    services: [],
    durationMinutes: 0,
    servicePrice: 0,
    clientId: clients[0]?.id || 1,
    isNewClient: false,
    newClientName: '',
    newClientPhone: '',
    allowFitIn: false,
    notes: '',
    products: [],
  });

  const [conflictInfo, setConflictInfo] = useState<ConflictCheckResult>({
    hasOverlap: false,
    overlappingAppointments: [],
  });

  // Checkout / Finalize Modal State
  const [checkoutAppt, setCheckoutAppt] = useState<Appointment | null>(null);
  const [checkoutServicePrice, setCheckoutServicePrice] = useState<number>(0);
  const [checkoutDiscount, setCheckoutDiscount] = useState<number>(0);
  const [checkoutPaymentMethod, setCheckoutPaymentMethod] = useState<string>('pix');
  const [checkoutNotes, setCheckoutNotes] = useState<string>('');
  const [checkoutProducts, setCheckoutProducts] = useState<
    { productId: number; productName: string; quantity: number; unitPrice: number }[]
  >([]);
  const [selectedAddProductId, setSelectedAddProductId] = useState<number>(0);

  // Notification Modal (WhatsApp / SMS)
  const [notifyModal, setNotifyModal] = useState<{
    appt: Appointment;
    channel: 'whatsapp' | 'sms';
    message: string;
  } | null>(null);

  const loadAppointments = async () => {
    setLoading(true);
    try {
      const data = await api.getAppointments(selectedDate, selectedProfId || undefined);
      setAppointments(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAppointments();
  }, [selectedDate, selectedProfId]);

  // Live overlap check when booking form changes
  useEffect(() => {
    if (!showBookingModal) return;
    let active = true;
    const effectiveDuration = bookingForm.durationMinutes || 30;
    api
      .checkConflict({
        date: bookingForm.date,
        professionalId: bookingForm.professionalId,
        startTime: bookingForm.startTime,
        durationMinutes: effectiveDuration,
        excludeId: editingAppointmentId || undefined,
      })
      .then((res) => {
        if (active) {
          setConflictInfo(res);
          if (res.hasOverlap) {
            setBookingForm((prev) => ({ ...prev, allowFitIn: true }));
          }
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [
    showBookingModal,
    editingAppointmentId,
    bookingForm.date,
    bookingForm.professionalId,
    bookingForm.startTime,
    bookingForm.durationMinutes,
  ]);

  const shiftDate = (days: number) => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + days);
    const ny = dt.getFullYear();
    const nm = String(dt.getMonth() + 1).padStart(2, '0');
    const nd = String(dt.getDate()).padStart(2, '0');
    onDateChange(`${ny}-${nm}-${nd}`);
  };

  // Open modal for creating a NEW appointment
  const openNewBooking = (preset?: {
    startTime?: string;
    professionalId?: number;
    serviceId?: number;
    allowFitIn?: boolean;
    notes?: string;
  }) => {
    setEditingAppointmentId(null);
    setSelectedBookingServiceId(0);
    setSelectedBookingProductId(0);

    const initialServices: BookingServiceEntry[] = [];
    if (preset?.serviceId) {
      const srv = services.find((s) => s.id === preset.serviceId);
      if (srv) {
        initialServices.push({
          serviceId: srv.id,
          serviceName: srv.name,
          priceType: srv.priceType,
          durationMinutes: srv.durationMinutes,
          price: srv.basePrice,
        });
      }
    }

    const totalDur = initialServices.reduce((acc, s) => acc + s.durationMinutes, 0);
    const totalPrc = initialServices.reduce((acc, s) => acc + s.price, 0);

    setBookingForm({
      date: selectedDate,
      startTime: preset?.startTime || '15:00',
      professionalId: preset?.professionalId || selectedProfId || professionals[0]?.id || 1,
      services: initialServices,
      durationMinutes: totalDur,
      servicePrice: totalPrc,
      clientId: clients[0]?.id || 1,
      isNewClient: clients.length === 0,
      newClientName: '',
      newClientPhone: '',
      allowFitIn: Boolean(preset?.allowFitIn),
      notes: preset?.notes || '',
      products: [],
    });
    setShowBookingModal(true);
  };

  // Open modal for EDITING an existing appointment
  const openEditBooking = (appt: Appointment) => {
    setEditingAppointmentId(appt.id);
    setSelectedBookingServiceId(0);
    setSelectedBookingProductId(0);

    const existingServices: BookingServiceEntry[] =
      appt.services && appt.services.length > 0
        ? appt.services.map((s) => ({
            serviceId: s.serviceId,
            serviceName: s.serviceName,
            priceType: s.priceType,
            durationMinutes: s.durationMinutes,
            price: s.price,
          }))
        : [
            {
              serviceId: appt.serviceId,
              serviceName: appt.serviceName,
              priceType: appt.servicePriceType,
              durationMinutes: appt.durationMinutes,
              price: appt.servicePrice,
            },
          ];

    setBookingForm({
      date: appt.date,
      startTime: appt.startTime,
      professionalId: appt.professionalId,
      services: existingServices,
      durationMinutes: appt.durationMinutes,
      servicePrice: appt.servicePrice,
      clientId: appt.clientId,
      isNewClient: false,
      newClientName: '',
      newClientPhone: '',
      allowFitIn: appt.isFitIn,
      notes: appt.notes || '',
      products: appt.products.map((p) => ({
        productId: p.productId,
        quantity: p.quantity,
      })),
    });
    setShowBookingModal(true);
  };

  // Helper to add a service to the booking form and sum duration + price
  const addServiceToBooking = (serviceIdToAdd: number) => {
    const srv = services.find((s) => s.id === Number(serviceIdToAdd));
    if (!srv) return;

    setBookingForm((prev) => {
      const updatedServices: BookingServiceEntry[] = [
        ...prev.services,
        {
          serviceId: srv.id,
          serviceName: srv.name,
          priceType: srv.priceType,
          durationMinutes: srv.durationMinutes,
          price: srv.basePrice,
        },
      ];
      const newDuration = updatedServices.reduce((acc, s) => acc + s.durationMinutes, 0);
      const newPrice = updatedServices.reduce((acc, s) => acc + s.price, 0);
      return {
        ...prev,
        services: updatedServices,
        durationMinutes: newDuration,
        servicePrice: newPrice,
      };
    });
    setSelectedBookingServiceId(0);
  };

  const updateServiceEntryInBooking = (
    index: number,
    field: 'durationMinutes' | 'price',
    value: number
  ) => {
    setBookingForm((prev) => {
      const updatedServices = prev.services.map((item, idx) =>
        idx === index ? { ...item, [field]: value } : item
      );
      const newDuration = updatedServices.reduce((acc, s) => acc + Number(s.durationMinutes || 0), 0);
      const newPrice = updatedServices.reduce((acc, s) => acc + Number(s.price || 0), 0);
      return {
        ...prev,
        services: updatedServices,
        durationMinutes: newDuration,
        servicePrice: newPrice,
      };
    });
  };

  const removeServiceFromBooking = (index: number) => {
    setBookingForm((prev) => {
      const updatedServices = prev.services.filter((_, idx) => idx !== index);
      const newDuration = updatedServices.reduce((acc, s) => acc + Number(s.durationMinutes || 0), 0);
      const newPrice = updatedServices.reduce((acc, s) => acc + Number(s.price || 0), 0);
      return {
        ...prev,
        services: updatedServices,
        durationMinutes: newDuration,
        servicePrice: newPrice,
      };
    });
  };

  const handleSaveBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // If user selected a service in the dropdown but didn't click "+ Adicionar Serviço", include it automatically
      let finalServices = [...bookingForm.services];
      if (selectedBookingServiceId > 0) {
        const pendingSrv = services.find((s) => s.id === Number(selectedBookingServiceId));
        if (pendingSrv) {
          finalServices.push({
            serviceId: pendingSrv.id,
            serviceName: pendingSrv.name,
            priceType: pendingSrv.priceType,
            durationMinutes: pendingSrv.durationMinutes,
            price: pendingSrv.basePrice,
          });
        }
      }

      if (finalServices.length === 0) {
        alert('Por favor, selecione e adicione pelo menos 1 serviço ao agendamento.');
        return;
      }

      const finalDuration =
        bookingForm.durationMinutes > 0
          ? bookingForm.durationMinutes
          : finalServices.reduce((acc, s) => acc + s.durationMinutes, 0);
      const finalServicePrice =
        bookingForm.servicePrice > 0
          ? bookingForm.servicePrice
          : finalServices.reduce((acc, s) => acc + s.price, 0);

      let targetClientId = bookingForm.clientId;
      if (bookingForm.isNewClient) {
        if (!bookingForm.newClientName.trim() || !bookingForm.newClientPhone.trim()) {
          alert('Informe o nome completo e telefone do novo cliente.');
          return;
        }
        const createdClient = await api.createClient({
          fullName: bookingForm.newClientName,
          phone: bookingForm.newClientPhone,
        });
        targetClientId = createdClient.id;
      }

      const payload = {
        date: bookingForm.date,
        startTime: bookingForm.startTime,
        durationMinutes: finalDuration,
        professionalId: bookingForm.professionalId,
        serviceId: finalServices[0].serviceId,
        services: finalServices.map((s) => ({
          serviceId: s.serviceId,
          durationMinutes: s.durationMinutes,
          price: s.price,
        })),
        servicePrice: finalServicePrice,
        clientId: targetClientId,
        allowFitIn: bookingForm.allowFitIn,
        isFitIn: conflictInfo.hasOverlap && bookingForm.allowFitIn,
        notes: bookingForm.notes,
        products: bookingForm.products,
      };

      if (editingAppointmentId) {
        await api.updateAppointment(editingAppointmentId, payload);
        notifyToast('Agendamento atualizado com sucesso!');
      } else {
        await api.createAppointment(payload);
        notifyToast(
          conflictInfo.hasOverlap
            ? 'Encaixe agendado com sucesso!'
            : 'Agendamento registrado com sucesso!'
        );
      }

      setShowBookingModal(false);
      setEditingAppointmentId(null);
      await onRefreshAll();
      await loadAppointments();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const openCheckoutModal = (appt: Appointment) => {
    setCheckoutAppt(appt);
    setCheckoutServicePrice(appt.servicePrice);
    setCheckoutDiscount(appt.discount || 0);
    setCheckoutPaymentMethod(appt.paymentMethod === 'pending' ? 'pix' : appt.paymentMethod);
    setCheckoutNotes(appt.notes || '');
    setCheckoutProducts(
      appt.products.map((p) => ({
        productId: p.productId,
        productName: p.productName,
        quantity: p.quantity,
        unitPrice: p.unitPrice,
      }))
    );
    setSelectedAddProductId(0);
  };

  const handleAddProductToCheckout = () => {
    const prod = products.find((p) => p.id === Number(selectedAddProductId));
    if (!prod) return;
    setCheckoutProducts((prev) => {
      const existing = prev.find((i) => i.productId === prod.id);
      if (existing) {
        return prev.map((i) =>
          i.productId === prod.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [
        ...prev,
        {
          productId: prod.id,
          productName: prod.name,
          quantity: 1,
          unitPrice: prod.price,
        },
      ];
    });
    setSelectedAddProductId(0);
  };

  const handleFinalizeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkoutAppt) return;
    try {
      await api.finalizeAppointment(checkoutAppt.id, {
        servicePrice: checkoutServicePrice,
        discount: checkoutDiscount,
        paymentMethod: checkoutPaymentMethod,
        notes: checkoutNotes,
        products: checkoutProducts.map((p) => ({
          productId: p.productId,
          quantity: p.quantity,
          unitPrice: p.unitPrice,
        })),
      });
      setCheckoutAppt(null);
      await onRefreshAll();
      await loadAppointments();
      notifyToast('Atendimento finalizado, pago e estoque atualizado!');
    } catch (err: any) {
      alert(err.message);
    }
  };

  const openNotificationPreview = (appt: Appointment, channel: 'whatsapp' | 'sms') => {
    const [y, m, d] = appt.date.split('-');
    const formattedDate = `${d}/${m}/${y}`;
    const tpl =
      channel === 'sms'
        ? settings.smsTemplateReminder
        : appt.status === 'completed'
        ? settings.whatsappTemplateReceipt
        : settings.whatsappTemplateReminder;

    const msg = tpl
      .replace(/\{cliente\}/g, appt.clientName.split(' ')[0])
      .replace(/\{nome_completo\}/g, appt.clientName)
      .replace(/\{servico\}/g, appt.serviceName)
      .replace(/\{profissional\}/g, appt.professionalName)
      .replace(/\{empresa\}/g, settings.name)
      .replace(/\{data\}/g, formattedDate)
      .replace(/\{hora\}/g, appt.startTime)
      .replace(/\{valor\}/g, formatBRL(appt.totalAmount));

    setNotifyModal({ appt, channel, message: msg });
  };

  const handleConfirmSendNotification = async () => {
    if (!notifyModal) return;
    try {
      const res = await api.sendNotification({
        appointmentId: notifyModal.appt.id,
        clientId: notifyModal.appt.clientId,
        channel: notifyModal.channel,
        customMessage: notifyModal.message,
      });

      if (notifyModal.channel === 'whatsapp') {
        window.open(res.whatsappUrl, '_blank', 'noopener,noreferrer');
        notifyToast('WhatsApp aberto com mensagem personalizada e registrado no histórico!');
      } else {
        window.open(res.smsUrl, '_self');
        notifyToast('Aviso SMS preparado e registrado no histórico de envios!');
      }
      setNotifyModal(null);
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Group overlapping appointments together visually so Main + Encaixe appear side-by-side
  const groupedClusters = useMemo(() => {
    const sorted = [...appointments].sort((a, b) => a.startTime.localeCompare(b.startTime));
    const clusters: { startTime: string; endTime: string; items: Appointment[] }[] = [];

    const toMin = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };

    for (const appt of sorted) {
      const lastCluster = clusters[clusters.length - 1];
      if (
        lastCluster &&
        toMin(appt.startTime) < toMin(lastCluster.endTime) &&
        (appt.isFitIn ||
          lastCluster.items.some((i) => i.professionalId === appt.professionalId))
      ) {
        lastCluster.items.push(appt);
        if (toMin(appt.endTime) > toMin(lastCluster.endTime)) {
          lastCluster.endTime = appt.endTime;
        }
      } else {
        clusters.push({
          startTime: appt.startTime,
          endTime: appt.endTime,
          items: [appt],
        });
      }
    }
    return clusters;
  }, [appointments, completedMode]);

  // Day summary stats
  const dayStats = useMemo(() => {
    const active = appointments.filter((a) => a.status !== 'cancelled');
    const completed = active.filter((a) => a.status === 'completed');
    const fitIns = active.filter((a) => a.isFitIn);
    const expectedTotal = active.reduce((acc, a) => acc + a.totalAmount, 0);
    const paidTotal = completed.reduce((acc, a) => acc + a.totalAmount, 0);
    return {
      totalCount: active.length,
      completedCount: completed.length,
      fitInsCount: fitIns.length,
      expectedTotal,
      paidTotal,
    };
  }, [appointments]);

  const checkoutProductsTotal = checkoutProducts.reduce(
    (acc, item) => acc + item.quantity * item.unitPrice,
    0
  );
  const checkoutFinalTotal = Math.max(
    0,
    Number(checkoutServicePrice || 0) + checkoutProductsTotal - Number(checkoutDiscount || 0)
  );

  const bookingProductsTotal = bookingForm.products.reduce((acc, item) => {
    const p = products.find((pr) => pr.id === item.productId);
    return acc + (p ? p.price * item.quantity : 0);
  }, 0);

  const hasVariableInBooking = bookingForm.services.some((s) => s.priceType === 'variable');

  return (
    <div>
      {/* KPI Strip for the selected Day */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">
            <span>Agendamentos do Dia</span>
            <Calendar size={15} />
          </div>
          <div className="kpi-value">{dayStats.totalCount}</div>
          <div className="kpi-sub">
            {dayStats.completedCount} finalizados · {dayStats.totalCount - dayStats.completedCount} pendentes
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">
            <span>Encaixes Inteligentes</span>
            <Layers size={15} />
          </div>
          <div className="kpi-value">{dayStats.fitInsCount}</div>
          <div className="kpi-sub">Aproveitamento de pausas químicas</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">
            <span>Recebido Hoje (Caixa)</span>
            <CheckCircle2 size={15} />
          </div>
          <div className="kpi-value" style={{ color: 'var(--status-ok)' }}>
            {formatBRL(dayStats.paidTotal)}
          </div>
          <div className="kpi-sub">Comandas finalizadas e pagas</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">
            <span>Previsão Total do Dia</span>
            <Sparkles size={15} />
          </div>
          <div className="kpi-value">{formatBRL(dayStats.expectedTotal)}</div>
          <div className="kpi-sub">Serviços + produtos nas comandas</div>
        </div>
      </div>

      {/* Agenda Toolbar */}
      <div className="agenda-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn btn-sm" onClick={() => shiftDate(-1)} title="Dia anterior">
            <ChevronLeft size={16} />
          </button>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => onDateChange(e.target.value)}
            className="mono"
            style={{
              padding: '6px 10px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-color)',
              fontWeight: 600,
            }}
          />
          <button className="btn btn-sm" onClick={() => shiftDate(1)} title="Próximo dia">
            <ChevronRight size={16} />
          </button>
          <button
            className="btn btn-sm"
            onClick={() => {
              const now = new Date();
              const y = now.getFullYear();
              const m = String(now.getMonth() + 1).padStart(2, '0');
              const d = String(now.getDate()).padStart(2, '0');
              onDateChange(`${y}-${m}-${d}`);
            }}
          >
            Hoje
          </button>
        </div>

        <div className="prof-filter-Group">
          <button
            className={`prof-chip ${selectedProfId === null ? 'active' : ''}`}
            onClick={() => setSelectedProfId(null)}
          >
            Todos os Profissionais
          </button>
          {professionals.map((prof) => (
            <button
              key={prof.id}
              className={`prof-chip ${selectedProfId === prof.id ? 'active' : ''}`}
              onClick={() => setSelectedProfId(prof.id)}
            >
              <span className="prof-dot" style={{ background: prof.color }} />
              {prof.name}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <button
            className="btn"
            style={{ borderColor: '#CDB4DB', color: 'var(--status-fitin)', background: 'var(--status-fitin-bg)' }}
            onClick={() => openNewBooking({ startTime: '15:00', allowFitIn: true })}
          >
            <Layers size={15} />
            Novo Encaixe
          </button>
          <button className="btn btn-primary" onClick={() => openNewBooking()}>
            <Plus size={16} />
            Novo Agendamento
          </button>
        </div>
      </div>

      {/* Appointments Timeline */}
      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--ink-muted)' }}>
          Carregando agenda...
        </div>
      ) : groupedClusters.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
            Nenhum atendimento agendado para {formatDateBR(selectedDate)}
          </p>
          <p style={{ color: 'var(--ink-secondary)', marginBottom: 18 }}>
            Crie um novo agendamento ou encaixe um horário para começar.
          </p>
          <button className="btn btn-primary" onClick={() => openNewBooking()}>
            <Plus size={16} /> Agendar Cliente
          </button>
        </div>
      ) : (
        <div className="agenda-columns">
          {groupedClusters.map((cluster, idx) => {
            const allCompletedInCluster = cluster.items.every((i) => i.status === 'completed');

            return (
              <div key={idx} className="appt-group-row">
                <div
                  className={`appt-time-pillar ${
                    allCompletedInCluster ? 'is-all-completed strike-time' : ''
                  }`}
                >
                  <span className="appt-time-start">{cluster.startTime}</span>
                  <span className="appt-time-end">até {cluster.endTime}</span>
                  {cluster.items.length > 1 && (
                    <span className="badge badge-fitin" style={{ marginTop: 6, fontSize: 10 }}>
                      Simultâneo
                    </span>
                  )}
                </div>

                <div className="appt-cards-stack">
                  {cluster.items.map((appt) => {
                    const isLongService = appt.durationMinutes >= 90 && !appt.isFitIn;
                    const [sh, sm] = appt.startTime.split(':').map(Number);
                    const suggestedFitInHour = `${String(Math.min(22, sh + 1)).padStart(2, '0')}:${String(sm).padStart(2, '0')}`;

                    return (
                      <div
                        key={appt.id}
                        className={`appt-card ${appt.isFitIn ? 'is-fit-in' : ''} ${
                          appt.status === 'completed' ? 'is-completed mode-dimmed_strikethrough' : ''
                        }`}
                        style={
                          !appt.isFitIn && appt.status !== 'completed'
                            ? { borderLeftColor: appt.professionalColor }
                            : undefined
                        }
                      >
                        <div>
                          {/* Card Top Header */}
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 8,
                              marginBottom: 8,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span
                                className="mono appt-strike-target"
                                style={{ fontWeight: 600, fontSize: 12.5 }}
                              >
                                {appt.startTime} – {appt.endTime} ({appt.durationMinutes} min)
                              </span>
                              {appt.isFitIn && (
                                <span className="badge badge-fitin">
                                  <Layers size={11} /> ENCAIXE NA PAUSA
                                </span>
                              )}
                              {appt.status === 'completed' && (
                                <span className="badge badge-completed">
                                  <CheckCircle2 size={11} /> FINALIZADO E PAGO
                                </span>
                              )}
                              {appt.status === 'in_progress' && (
                                <span className="badge badge-progress">EM ATENDIMENTO</span>
                              )}
                              {appt.status === 'scheduled' && (
                                <span className="badge badge-scheduled">AGENDADO</span>
                              )}
                            </div>

                            <span
                              style={{
                                fontSize: 12,
                                fontWeight: 600,
                                color: appt.professionalColor,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 5,
                              }}
                            >
                              <span className="prof-dot" style={{ background: appt.professionalColor }} />
                              {appt.professionalName}
                            </span>
                          </div>

                          {/* Client & Service Info */}
                          <div style={{ marginBottom: 10 }}>
                            <div
                              className="appt-strike-target"
                              style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink-primary)' }}
                            >
                              {appt.clientName}
                            </div>
                            <div
                              style={{
                                fontSize: 12.5,
                                color: 'var(--ink-secondary)',
                                display: 'flex',
                                flexWrap: 'wrap',
                                alignItems: 'center',
                                gap: 8,
                                marginTop: 2,
                              }}
                            >
                              <span>
                                <Phone size={12} style={{ marginRight: 4, verticalAlign: '-1px' }} />
                                {appt.clientPhone}
                              </span>
                              <span>•</span>
                              <strong className="appt-strike-target" style={{ color: 'var(--ink-primary)' }}>
                                {appt.serviceName}
                              </strong>
                              {appt.servicePriceType === 'variable' && (
                                <span className="badge badge-scheduled" style={{ fontSize: 10 }}>
                                  Valor Variável
                                </span>
                              )}
                            </div>

                            {/* Always show the Services box starting from 1 service */}
                            {appt.services && appt.services.length >= 1 && (
                              <div
                                style={{
                                  marginTop: 8,
                                  background: 'var(--bg-subtle)',
                                  padding: '8px 10px',
                                  borderRadius: 'var(--radius-sm)',
                                  fontSize: 12,
                                }}
                              >
                                <div
                                  style={{
                                    fontWeight: 600,
                                    color: 'var(--ink-secondary)',
                                    marginBottom: 4,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 5,
                                  }}
                                >
                                  <Scissors size={12} />{' '}
                                  {appt.services.length === 1
                                    ? '1 Serviço no Agendamento:'
                                    : `${appt.services.length} Serviços no Agendamento:`}
                                </div>
                                {appt.services.map((s, idx) => (
                                  <div
                                    key={idx}
                                    className="appt-strike-target"
                                    style={{
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      color: 'var(--ink-primary)',
                                    }}
                                  >
                                    <span>
                                      • {s.serviceName} ({s.durationMinutes} min)
                                    </span>
                                    <span className="mono">{formatBRL(s.price)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Products Included in Appointment */}
                          {appt.products.length > 0 && (
                            <div
                              style={{
                                background: 'var(--bg-subtle)',
                                padding: '8px 10px',
                                borderRadius: 'var(--radius-sm)',
                                marginBottom: 10,
                                fontSize: 12,
                              }}
                            >
                              <div
                                style={{
                                  fontWeight: 600,
                                  marginBottom: 4,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 5,
                                  color: 'var(--ink-secondary)',
                                }}
                              >
                                <ShoppingBag size={12} /> Produtos Incluídos na Comanda:
                              </div>
                              {appt.products.map((p, i) => (
                                <div
                                  key={i}
                                  className="appt-strike-target"
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    color: 'var(--ink-primary)',
                                  }}
                                >
                                  <span>
                                    {p.quantity}x {p.productName}
                                  </span>
                                  <span className="mono">{formatBRL(p.subtotal)}</span>
                                </div>
                              ))}
                            </div>
                          )}

                        {appt.notes && (
                          <div
                            style={{
                              fontSize: 12,
                              color: 'var(--ink-secondary)',
                              fontStyle: 'italic',
                              marginBottom: 8,
                            }}
                          >
                            “{appt.notes}”
                          </div>
                        )}
                      </div>

                      {/* Footer Price + Actions */}
                      <div
                        style={{
                          paddingTop: 10,
                          borderTop: '1px solid var(--border-color)',
                          display: 'flex',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
                            Serviços: {formatBRL(appt.servicePrice)}
                            {appt.productsTotal > 0 ? ` + Prod: ${formatBRL(appt.productsTotal)}` : ''}
                          </div>
                          <div className="mono appt-strike-target" style={{ fontSize: 16, fontWeight: 700 }}>
                            Total: {formatBRL(appt.totalAmount)}
                          </div>
                        </div>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {/* EDIT APPOINTMENT BUTTON */}
                          <button
                            className="btn btn-sm"
                            onClick={() => openEditBooking(appt)}
                            title="Editar horário, profissional, adicionar mais serviços ou produtos"
                          >
                            <Edit3 size={13} /> Editar
                          </button>

                          {/* WhatsApp & SMS Notification triggers */}
                          <button
                            className="btn btn-sm btn-whatsapp"
                            onClick={() => openNotificationPreview(appt, 'whatsapp')}
                            title="Enviar lembrete ou recibo via WhatsApp"
                          >
                            <MessageSquare size={13} /> WhatsApp
                          </button>
                          <button
                            className="btn btn-sm"
                            onClick={() => openNotificationPreview(appt, 'sms')}
                            title="Enviar aviso via SMS"
                          >
                            <Send size={13} /> SMS
                          </button>

                          {/* Quick Fit-In trigger if this is a long service (e.g. 14h-17h Progressiva) */}
                          {isLongService && appt.status !== 'completed' && (
                            <button
                              className="btn btn-sm"
                              style={{
                                borderColor: '#CDB4DB',
                                color: 'var(--status-fitin)',
                                background: 'var(--status-fitin-bg)',
                              }}
                              onClick={() =>
                                openNewBooking({
                                  startTime: suggestedFitInHour,
                                  professionalId: appt.professionalId,
                                  allowFitIn: true,
                                  notes: `Encaixe durante pausa de ${appt.serviceName} (${appt.clientName})`,
                                })
                              }
                              title="Encaixar outro cliente no meio deste atendimento"
                            >
                              <Layers size={13} /> Encaixar às {suggestedFitInHour}
                            </button>
                          )}

                          {/* Finalize / Checkout or View Comanda */}
                          {appt.status !== 'completed' ? (
                            <button
                              className="btn btn-sm btn-success"
                              onClick={() => openCheckoutModal(appt)}
                            >
                              <CheckCircle2 size={13} /> Finalizar & Receber
                            </button>
                          ) : (
                            <button
                              className="btn btn-sm"
                              onClick={() => openCheckoutModal(appt)}
                              title="Revisar pagamento ou comanda"
                            >
                              <CheckCircle2 size={13} /> Comanda Paga
                            </button>
                          )}

                          <button
                            className="btn btn-sm btn-ghost"
                            style={{ color: 'var(--status-danger)' }}
                            onClick={async () => {
                              if (confirm(`Deseja excluir o agendamento de ${appt.clientName}?`)) {
                                await api.deleteAppointment(appt.id);
                                await onRefreshAll();
                                await loadAppointments();
                                notifyToast('Agendamento removido.');
                              }
                            }}
                            title="Excluir agendamento"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
          })}
        </div>
      )}

      {/* =========================================================
          MODAL 1: NOVO OU EDITAR AGENDAMENTO / MÚLTIPLOS SERVIÇOS
      ========================================================= */}
      {showBookingModal && (
        <div className="modal-backdrop" onClick={() => setShowBookingModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                {editingAppointmentId
                  ? `Editar Agendamento #${editingAppointmentId}`
                  : 'Novo Agendamento / Encaixe de Horário'}
              </h2>
              <button className="btn btn-sm" onClick={() => setShowBookingModal(false)}>
                Fechar
              </button>
            </div>

            <form onSubmit={handleSaveBooking}>
              <div className="modal-body">
                {/* Date, Time & Professional */}
                <div className="form-grid">
                  <div className="field">
                    <label>Data do Atendimento</label>
                    <input
                      type="date"
                      required
                      value={bookingForm.date}
                      onChange={(e) => setBookingForm({ ...bookingForm, date: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Horário de Início</label>
                    <input
                      type="time"
                      required
                      value={bookingForm.startTime}
                      onChange={(e) => setBookingForm({ ...bookingForm, startTime: e.target.value })}
                    />
                  </div>
                  <div className="field" style={{ gridColumn: 'span 2' }}>
                    <label>Profissional Responsável</label>
                    <select
                      value={bookingForm.professionalId}
                      onChange={(e) =>
                        setBookingForm({ ...bookingForm, professionalId: Number(e.target.value) })
                      }
                    >
                      {professionals.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} — {p.role}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Live Overlap / Encaixe Detection Banner */}
                {conflictInfo.hasOverlap && (
                  <div className="fitin-banner">
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontWeight: 700,
                        marginBottom: 6,
                      }}
                    >
                      <AlertTriangle size={16} />
                      <span>
                        Horário simultâneo detectado — Modo de Encaixe Inteligente
                      </span>
                    </div>
                    <p style={{ fontSize: 12.5, marginBottom: 8 }}>
                      Este profissional já possui atendimento neste intervalo:
                    </p>
                    {conflictInfo.overlappingAppointments.map((ov) => (
                      <div
                        key={ov.id}
                        style={{
                          background: 'rgba(255,255,255,0.65)',
                          padding: '6px 10px',
                          borderRadius: 6,
                          fontSize: 12.5,
                          marginBottom: 6,
                        }}
                      >
                        <strong>
                          {ov.startTime} às {ov.endTime}
                        </strong>{' '}
                        — {ov.serviceName} ({ov.clientName})
                        {ov.allowsFitInWindow && (
                          <span className="badge badge-fitin" style={{ marginLeft: 8 }}>
                            Possui Pausa p/ Encaixe
                          </span>
                        )}
                      </div>
                    ))}
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginTop: 8,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={bookingForm.allowFitIn}
                        onChange={(e) =>
                          setBookingForm({ ...bookingForm, allowFitIn: e.target.checked })
                        }
                      />
                      Confirmar como ENCAIXE (atendimento paralelo durante o horário)
                    </label>
                  </div>
                )}

                {/* Multiple Services Selector + Auto Duration & Price Calculation */}
                <div
                  style={{
                    background: 'var(--bg-subtle)',
                    padding: 14,
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <div className="field">
                    <label>
                      Serviços a Executar (Adicione 1 ou mais serviços — o tempo e valor são somados)
                    </label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%' }}>
                      <select
                        style={{ flex: 1, minWidth: 0 }}
                        value={selectedBookingServiceId}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          if (val > 0) {
                            addServiceToBooking(val);
                          } else {
                            setSelectedBookingServiceId(0);
                          }
                        }}
                      >
                        <option value={0}>Selecionar / Escolher serviço para adicionar...</option>
                        {services.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.durationMinutes} min) —{' '}
                            {s.priceType === 'variable'
                              ? `Variável: a partir de ${formatBRL(s.basePrice)}`
                              : `Fixo: ${formatBRL(s.basePrice)}`}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="btn"
                        style={{ flexShrink: 0 }}
                        onClick={() => {
                          if (selectedBookingServiceId > 0) {
                            addServiceToBooking(selectedBookingServiceId);
                          }
                        }}
                      >
                        <Plus size={14} /> Adicionar Serviço
                      </button>
                    </div>
                  </div>

                  {/* List of Added Services */}
                  {bookingForm.services.length === 0 ? (
                    <div
                      style={{
                        fontSize: 12.5,
                        color: 'var(--ink-muted)',
                        padding: '6px 2px',
                      }}
                    >
                      Nenhum serviço selecionado ainda. Escolha um ou mais serviços acima.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {bookingForm.services.map((item, idx) => (
                        <div
                          key={`${item.serviceId}-${idx}`}
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 8,
                            background: '#FFFFFF',
                            padding: '8px 10px',
                            borderRadius: 6,
                            border: '1px solid var(--border-color)',
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 160 }}>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>
                              {idx + 1}. {item.serviceName}
                            </div>
                            <span
                              className={`badge ${
                                item.priceType === 'variable' ? 'badge-progress' : 'badge-scheduled'
                              }`}
                              style={{ fontSize: 10 }}
                            >
                              {item.priceType === 'variable' ? 'Valor Variável' : 'Valor Fixo'}
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <input
                                type="number"
                                min={5}
                                step={5}
                                value={item.durationMinutes}
                                onChange={(e) =>
                                  updateServiceEntryInBooking(
                                    idx,
                                    'durationMinutes',
                                    Number(e.target.value)
                                  )
                                }
                                style={{
                                  width: 64,
                                  padding: '4px 6px',
                                  border: '1px solid var(--border-color)',
                                  borderRadius: 4,
                                }}
                                title="Tempo deste serviço (min)"
                              />
                              <span style={{ fontSize: 11.5, color: 'var(--ink-secondary)' }}>min</span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ fontSize: 11.5, color: 'var(--ink-secondary)' }}>R$</span>
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={item.price}
                                onChange={(e) =>
                                  updateServiceEntryInBooking(idx, 'price', Number(e.target.value))
                                }
                                style={{
                                  width: 82,
                                  padding: '4px 6px',
                                  border: '1px solid var(--border-color)',
                                  borderRadius: 4,
                                }}
                                title="Valor deste serviço (R$)"
                              />
                            </div>

                            <button
                              type="button"
                              className="btn btn-sm"
                              style={{ color: 'var(--status-danger)' }}
                              onClick={() => removeServiceFromBooking(idx)}
                              title="Remover serviço"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Total Duration & Total Service Value (Auto-summed, also editable) */}
                  <div className="form-grid" style={{ marginTop: 4 }}>
                    <div className="field">
                      <label>Tempo Total Estimado (Soma em min)</label>
                      <input
                        type="number"
                        min={0}
                        step={5}
                        placeholder="0"
                        value={bookingForm.durationMinutes || ''}
                        onChange={(e) =>
                          setBookingForm({
                            ...bookingForm,
                            durationMinutes: Number(e.target.value),
                          })
                        }
                      />
                    </div>

                    <div className="field">
                      <label>
                        Valor Total dos Serviços (R$){' '}
                        {hasVariableInBooking && (
                          <span style={{ color: 'var(--accent)' }}>(Inclui Variável)</span>
                        )}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        placeholder="0.00"
                        value={bookingForm.servicePrice || ''}
                        onChange={(e) =>
                          setBookingForm({
                            ...bookingForm,
                            servicePrice: Number(e.target.value),
                          })
                        }
                      />
                    </div>
                  </div>
                </div>

                {/* Client Selection or Quick New Client */}
                <div
                  style={{
                    background: 'var(--bg-subtle)',
                    padding: 14,
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 10,
                    }}
                  >
                    <label style={{ fontWeight: 700, fontSize: 13 }}>Cliente</label>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() =>
                        setBookingForm({ ...bookingForm, isNewClient: !bookingForm.isNewClient })
                      }
                    >
                      <UserPlus size={13} />
                      {bookingForm.isNewClient
                        ? 'Selecionar Cliente Existente'
                        : 'Cadastrar Novo Cliente Rápido'}
                    </button>
                  </div>

                  {!bookingForm.isNewClient ? (
                    <div className="field">
                      <select
                        value={bookingForm.clientId}
                        onChange={(e) =>
                          setBookingForm({ ...bookingForm, clientId: Number(e.target.value) })
                        }
                      >
                        {clients.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.fullName} — {c.phone}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="form-grid">
                      <div className="field">
                        <label>Nome Completo do Cliente</label>
                        <input
                          type="text"
                          placeholder="Ex: Carolina Mendes"
                          value={bookingForm.newClientName}
                          onChange={(e) =>
                            setBookingForm({ ...bookingForm, newClientName: e.target.value })
                          }
                        />
                      </div>
                      <div className="field">
                        <label>Telefone / WhatsApp</label>
                        <input
                          type="text"
                          placeholder="(11) 99999-9999"
                          value={bookingForm.newClientPhone}
                          onChange={(e) =>
                            setBookingForm({
                              ...bookingForm,
                              newClientPhone: formatPhoneMask(e.target.value),
                            })
                          }
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Optional Beauty Products already requested in the booking */}
                <div className="field">
                  <label>Incluir Produtos de Beleza no Agendamento (Opcional)</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%' }}>
                    <select
                      style={{ flex: 1, minWidth: 0 }}
                      value={selectedBookingProductId}
                      onChange={(e) => setSelectedBookingProductId(Number(e.target.value))}
                    >
                      <option value={0}>Selecionar / Escolher produto...</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} — {formatBRL(p.price)} (Estoque: {p.stockQuantity})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn"
                      style={{ flexShrink: 0 }}
                      onClick={() => {
                        const pid = Number(selectedBookingProductId);
                        if (!pid) return;
                        setBookingForm((prev) => {
                          const exists = prev.products.find((x) => x.productId === pid);
                          if (exists) {
                            return {
                              ...prev,
                              products: prev.products.map((x) =>
                                x.productId === pid ? { ...x, quantity: x.quantity + 1 } : x
                              ),
                            };
                          }
                          return {
                            ...prev,
                            products: [...prev.products, { productId: pid, quantity: 1 }],
                          };
                        });
                        setSelectedBookingProductId(0);
                      }}
                    >
                      <Plus size={14} /> Adicionar Produto
                    </button>
                  </div>

                  {bookingForm.products.length > 0 && (
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {bookingForm.products.map((item) => {
                        const prod = products.find((p) => p.id === item.productId);
                        if (!prod) return null;
                        return (
                          <div
                            key={item.productId}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              background: 'var(--bg-subtle)',
                              padding: '6px 10px',
                              borderRadius: 6,
                            }}
                          >
                            <span>
                              {item.quantity}x {prod.name}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span className="mono">{formatBRL(prod.price * item.quantity)}</span>
                              <button
                                type="button"
                                className="btn btn-sm"
                                onClick={() =>
                                  setBookingForm((prev) => ({
                                    ...prev,
                                    products: prev.products.filter(
                                      (x) => x.productId !== item.productId
                                    ),
                                  }))
                                }
                              >
                                Remover
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="field">
                  <label>Observações do Atendimento</label>
                  <input
                    type="text"
                    placeholder="Ex: Cliente quer encaixe na pausa da progressiva / trazer kit home care"
                    value={bookingForm.notes}
                    onChange={(e) => setBookingForm({ ...bookingForm, notes: e.target.value })}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <div style={{ marginRight: 'auto' }}>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-secondary)' }}>
                    {bookingForm.services.length} serviço(s) · {bookingForm.durationMinutes} min totais
                  </div>
                  <div style={{ fontWeight: 700 }} className="mono">
                    Total Previsto: {formatBRL(Number(bookingForm.servicePrice) + bookingProductsTotal)}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setShowBookingModal(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingAppointmentId
                    ? 'Salvar Alterações'
                    : conflictInfo.hasOverlap
                    ? 'Confirmar Encaixe na Agenda'
                    : 'Salvar Agendamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL 2: FINALIZAR ATENDIMENTO & COMANDA (PRODUTOS + PAGAMENTO)
      ========================================================= */}
      {checkoutAppt && (
        <div className="modal-backdrop" onClick={() => setCheckoutAppt(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>Finalizar Atendimento & Fechar Comanda</h2>
                <p style={{ fontSize: 12.5, color: 'var(--ink-secondary)' }}>
                  {checkoutAppt.clientName} • {checkoutAppt.serviceName} ({checkoutAppt.startTime})
                </p>
              </div>
              <button className="btn btn-sm" onClick={() => setCheckoutAppt(null)}>
                Fechar
              </button>
            </div>

            <form onSubmit={handleFinalizeSubmit}>
              <div className="modal-body">
                {/* 1. Service Value (Fixed or Variable Adjustment) */}
                <div className="form-grid">
                  <div className="field">
                    <label>
                      Valor Cobrado pelos Serviços (R$){' '}
                      {checkoutAppt.servicePriceType === 'variable' && (
                        <span className="badge badge-progress">Serviço de Valor Variável</span>
                      )}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      required
                      value={checkoutServicePrice}
                      onChange={(e) => setCheckoutServicePrice(Number(e.target.value))}
                    />
                  </div>

                  <div className="field">
                    <label>Desconto Concedido (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={checkoutDiscount}
                      onChange={(e) => setCheckoutDiscount(Number(e.target.value))}
                    />
                  </div>
                </div>

                {/* 2. Include Beauty Products from Stock */}
                <div
                  style={{
                    background: 'var(--bg-subtle)',
                    padding: 16,
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontWeight: 700,
                      marginBottom: 10,
                    }}
                  >
                    <ShoppingBag size={15} />
                    Produtos de Beleza Levados pelo Cliente (Soma junto ao Serviço)
                  </label>

                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      alignItems: 'center',
                      width: '100%',
                      marginBottom: 12,
                    }}
                  >
                    <select
                      style={{ flex: 1, minWidth: 0 }}
                      value={selectedAddProductId}
                      onChange={(e) => setSelectedAddProductId(Number(e.target.value))}
                    >
                      <option value={0}>Selecionar / Escolher produto...</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} — {formatBRL(p.price)} (Estoque: {p.stockQuantity} {p.unit})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ flexShrink: 0 }}
                      onClick={handleAddProductToCheckout}
                    >
                      <Plus size={15} /> Incluir Produto
                    </button>
                  </div>

                  {checkoutProducts.length === 0 ? (
                    <div style={{ fontSize: 12.5, color: 'var(--ink-muted)' }}>
                      Nenhum produto adicionado a este agendamento.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {checkoutProducts.map((item) => (
                        <div
                          key={item.productId}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            background: '#FFFFFF',
                            padding: '8px 12px',
                            borderRadius: 6,
                            border: '1px solid var(--border-color)',
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 600 }}>{item.productName}</div>
                            <div style={{ fontSize: 11.5, color: 'var(--ink-secondary)' }}>
                              Unitário: {formatBRL(item.unitPrice)}
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <input
                              type="number"
                              min={1}
                              style={{ width: 64, padding: '4px 8px' }}
                              value={item.quantity}
                              onChange={(e) => {
                                const q = Math.max(1, Number(e.target.value));
                                setCheckoutProducts((prev) =>
                                  prev.map((x) =>
                                    x.productId === item.productId ? { ...x, quantity: q } : x
                                  )
                                );
                              }}
                            />
                            <span
                              className="mono"
                              style={{ fontWeight: 600, minWidth: 80, textAlign: 'right' }}
                            >
                              {formatBRL(item.quantity * item.unitPrice)}
                            </span>
                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={() =>
                                setCheckoutProducts((prev) =>
                                  prev.filter((x) => x.productId !== item.productId)
                                )
                              }
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 3. Payment Method & Notes */}
                <div className="form-grid">
                  <div className="field">
                    <label>Forma de Pagamento</label>
                    <select
                      value={checkoutPaymentMethod}
                      onChange={(e) => setCheckoutPaymentMethod(e.target.value)}
                    >
                      <option value="pix">PIX Instantâneo</option>
                      <option value="credit_card">Cartão de Crédito</option>
                      <option value="debit_card">Cartão de Débito</option>
                      <option value="cash">Dinheiro / Espécie</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Observações da Comanda</label>
                    <input
                      type="text"
                      value={checkoutNotes}
                      onChange={(e) => setCheckoutNotes(e.target.value)}
                      placeholder="Anotações de fórmula, produtos ou pagamento..."
                    />
                  </div>
                </div>

                {/* Summary Box */}
                <div
                  style={{
                    background: '#F4F8F5',
                    border: '1px solid #BBDAC6',
                    borderRadius: 'var(--radius-md)',
                    padding: 16,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--ink-secondary)' }}>
                      Serviços ({formatBRL(checkoutServicePrice)}) + Produtos (
                      {formatBRL(checkoutProductsTotal)})
                      {checkoutDiscount > 0 ? ` - Desconto (${formatBRL(checkoutDiscount)})` : ''}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--status-ok)' }}>
                      Baixa automática de estoque e lançamento no Balanço Financeiro
                    </div>
                  </div>
                  <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: 'var(--status-ok)' }}>
                    {formatBRL(checkoutFinalTotal)}
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn" onClick={() => setCheckoutAppt(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-success">
                  <CheckCircle2 size={16} /> Confirmar Pagamento & Finalizar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL 3: AVISO WHATSAPP / SMS PERSONALIZADO
      ========================================================= */}
      {notifyModal && (
        <div className="modal-backdrop" onClick={() => setNotifyModal(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                Enviar Aviso via {notifyModal.channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}
              </h2>
              <button className="btn btn-sm" onClick={() => setNotifyModal(null)}>
                Fechar
              </button>
            </div>
            <div className="modal-body">
              <div style={{ fontSize: 13 }}>
                Destinatário: <strong>{notifyModal.appt.clientName}</strong> (
                {notifyModal.appt.clientPhone})
              </div>
              <div className="field">
                <label>Mensagem que será enviada (você pode editar antes do disparo):</label>
                <textarea
                  rows={4}
                  value={notifyModal.message}
                  onChange={(e) => setNotifyModal({ ...notifyModal, message: e.target.value })}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setNotifyModal(null)}>
                Cancelar
              </button>
              <button
                className={`btn ${
                  notifyModal.channel === 'whatsapp' ? 'btn-whatsapp' : 'btn-primary'
                }`}
                onClick={handleConfirmSendNotification}
              >
                <Send size={15} /> Disparar {notifyModal.channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
