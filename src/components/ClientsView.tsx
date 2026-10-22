import React, { useState, useEffect } from 'react';
import {
  Users,
  Plus,
  MessageSquare,
  Send,
  Phone,
  Edit3,
  Bell,
} from 'lucide-react';
import { api, formatBRL, formatDateBR, formatPhoneMask } from '../api';
import type { Client, CompanySettings, NotificationLog } from '../../shared/types';

interface ClientsViewProps {
  clients: Client[];
  settings: CompanySettings;
  onRefresh: () => Promise<void>;
  notifyToast: (msg: string) => void;
}

export const ClientsView: React.FC<ClientsViewProps> = ({
  clients,
  settings,
  onRefresh,
  notifyToast,
}) => {
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState({ fullName: '', phone: '', notes: '' });

  // Notification Logs & Quick Message Modal
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [msgTarget, setMsgTarget] = useState<{
    client: Client;
    channel: 'whatsapp' | 'sms';
    message: string;
  } | null>(null);

  const loadLogs = async () => {
    try {
      const data = await api.getNotifications();
      setLogs(data);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ fullName: '', phone: '', notes: '' });
    setShowModal(true);
  };

  const openEdit = (c: Client) => {
    setEditing(c);
    setForm({ fullName: c.fullName, phone: c.phone, notes: c.notes || '' });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) {
      await api.updateClient(editing.id, form);
      notifyToast('Cadastro do cliente atualizado!');
    } else {
      await api.createClient(form);
      notifyToast('Cliente cadastrado com sucesso!');
    }
    setShowModal(false);
    await onRefresh();
  };

  const openDirectMessage = (c: Client, channel: 'whatsapp' | 'sms') => {
    const firstName = c.fullName.split(' ')[0];
    const defaultMsg =
      channel === 'whatsapp'
        ? `Olá, ${firstName}! Tudo bem? Aqui é do *${settings.name}*. Gostaria de agendar seu próximo horário conosco esta semana?`
        : `${settings.name}: Olá ${firstName}, que tal agendar seu horário conosco? Responda ou chame no WhatsApp ${settings.phone}.`;
    setMsgTarget({ client: c, channel, message: defaultMsg });
  };

  const handleSendDirect = async () => {
    if (!msgTarget) return;
    const res = await api.sendNotification({
      clientId: msgTarget.client.id,
      channel: msgTarget.channel,
      customMessage: msgTarget.message,
    });
    if (msgTarget.channel === 'whatsapp') {
      window.open(res.whatsappUrl, '_blank', 'noopener,noreferrer');
      notifyToast('WhatsApp iniciado e registrado no histórico!');
    } else {
      window.open(res.smsUrl, '_self');
      notifyToast('SMS registrado e pronto para envio!');
    }
    setMsgTarget(null);
    await loadLogs();
  };

  const filtered = clients.filter(
    (c) =>
      c.fullName.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search)
  );

  return (
    <div>
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">
            <span>Base de Clientes</span>
            <Users size={15} />
          </div>
          <div className="kpi-value">{clients.length}</div>
          <div className="kpi-sub">Nome completo e contato ativo</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">
            <span>Avisos WhatsApp & SMS</span>
            <Bell size={15} />
          </div>
          <div className="kpi-value">{logs.length}</div>
          <div className="kpi-sub">Disparos registrados no histórico</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 22 }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            marginBottom: 18,
          }}
        >
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700 }}>
              Clientes Cadastrados & Disparo de Avisos (WhatsApp / SMS)
            </h2>
            <p style={{ fontSize: 12.5, color: 'var(--ink-secondary)' }}>
              Gerencie o cadastro completo e envie lembretes ou avisos rápidos em 1 clique.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <input
              type="text"
              placeholder="Buscar por nome ou telefone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                padding: '8px 12px',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)',
                minWidth: 230,
              }}
            />
            <button className="btn btn-primary" onClick={openCreate}>
              <Plus size={16} /> Novo Cliente
            </button>
          </div>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nome Completo</th>
                <th>Telefone de Contato</th>
                <th>Atendimentos Concluídos</th>
                <th>Total Investido</th>
                <th>Última Visita</th>
                <th style={{ textAlign: 'right' }}>Avisos & Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{c.fullName}</div>
                    {c.notes && (
                      <div style={{ fontSize: 12, color: 'var(--ink-secondary)' }}>{c.notes}</div>
                    )}
                  </td>
                  <td className="mono">
                    <Phone size={12} style={{ marginRight: 5, verticalAlign: '-1px' }} />
                    {c.phone}
                  </td>
                  <td className="mono">{c.totalVisits || 0}</td>
                  <td className="mono" style={{ fontWeight: 600 }}>
                    {formatBRL(c.totalSpent || 0)}
                  </td>
                  <td className="mono">{formatDateBR(c.lastVisit)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      <button
                        className="btn btn-sm btn-whatsapp"
                        onClick={() => openDirectMessage(c, 'whatsapp')}
                      >
                        <MessageSquare size={13} /> WhatsApp
                      </button>
                      <button
                        className="btn btn-sm"
                        onClick={() => openDirectMessage(c, 'sms')}
                      >
                        <Send size={13} /> SMS
                      </button>
                      <button className="btn btn-sm" onClick={() => openEdit(c)}>
                        <Edit3 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Notification History */}
      {logs.length > 0 && (
        <div className="card">
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>
            Histórico Recente de Avisos Enviados (WhatsApp & SMS)
          </h3>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Data/Hora</th>
                  <th>Cliente</th>
                  <th>Canal</th>
                  <th>Mensagem</th>
                </tr>
              </thead>
              <tbody>
                {logs.slice(0, 8).map((l) => (
                  <tr key={l.id}>
                    <td className="mono" style={{ fontSize: 12 }}>
                      {l.createdAt}
                    </td>
                    <td>
                      <strong>{l.clientName}</strong> ({l.clientPhone})
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          l.channel === 'whatsapp' ? 'badge-completed' : 'badge-scheduled'
                        }`}
                      >
                        {l.channel.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ fontSize: 12.5, color: 'var(--ink-secondary)' }}>{l.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Client Create/Edit Modal */}
      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editing ? 'Editar Cliente' : 'Cadastrar Novo Cliente'}</h2>
              <button className="btn btn-sm" onClick={() => setShowModal(false)}>
                Fechar
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="field">
                  <label>Nome Completo</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Mariana Vasconcelos"
                    value={form.fullName}
                    onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Telefone de Contato (Celular / WhatsApp)</label>
                  <input
                    type="text"
                    required
                    placeholder="(11) 99999-9999"
                    value={form.phone}
                    onChange={(e) =>
                      setForm({ ...form, phone: formatPhoneMask(e.target.value) })
                    }
                  />
                </div>
                <div className="field">
                  <label>Observações / Preferências Capilares (Opcional)</label>
                  <textarea
                    rows={3}
                    placeholder="Histórico químico, alergias, bebida preferida..."
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn" onClick={() => setShowModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Salvar Cliente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Direct Message Modal */}
      {msgTarget && (
        <div className="modal-backdrop" onClick={() => setMsgTarget(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                Enviar Aviso via {msgTarget.channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}
              </h2>
              <button className="btn btn-sm" onClick={() => setMsgTarget(null)}>
                Fechar
              </button>
            </div>
            <div className="modal-body">
              <div>
                Para: <strong>{msgTarget.client.fullName}</strong> ({msgTarget.client.phone})
              </div>
              <div className="field">
                <label>Texto da Mensagem</label>
                <textarea
                  rows={4}
                  value={msgTarget.message}
                  onChange={(e) => setMsgTarget({ ...msgTarget, message: e.target.value })}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setMsgTarget(null)}>
                Cancelar
              </button>
              <button
                className={`btn ${
                  msgTarget.channel === 'whatsapp' ? 'btn-whatsapp' : 'btn-primary'
                }`}
                onClick={handleSendDirect}
              >
                <Send size={15} /> Enviar Agora
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
