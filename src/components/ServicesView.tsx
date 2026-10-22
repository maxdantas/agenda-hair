import React, { useState } from 'react';
import { Scissors, Plus, Clock, Edit3, Trash2, Layers } from 'lucide-react';
import { api, formatBRL } from '../api';
import type { PriceType, ServiceItem } from '../../shared/types';

interface ServicesViewProps {
  services: ServiceItem[];
  onRefresh: () => Promise<void>;
  notifyToast: (msg: string) => void;
}

export const ServicesView: React.FC<ServicesViewProps> = ({
  services,
  onRefresh,
  notifyToast,
}) => {
  const [editing, setEditing] = useState<ServiceItem | null>(null);
  const [showModal, setShowModal] = useState(false);

  const [form, setForm] = useState<{
    name: string;
    category: string;
    durationMinutes: number;
    priceType: PriceType;
    basePrice: number;
    maxPrice: string;
    allowsFitInWindow: boolean;
    description: string;
  }>({
    name: '',
    category: 'Cabelo',
    durationMinutes: 45,
    priceType: 'fixed',
    basePrice: 90,
    maxPrice: '',
    allowsFitInWindow: false,
    description: '',
  });

  const openCreate = () => {
    setEditing(null);
    setForm({
      name: '',
      category: 'Cabelo',
      durationMinutes: 45,
      priceType: 'fixed',
      basePrice: 90,
      maxPrice: '',
      allowsFitInWindow: false,
      description: '',
    });
    setShowModal(true);
  };

  const openEdit = (srv: ServiceItem) => {
    setEditing(srv);
    setForm({
      name: srv.name,
      category: srv.category,
      durationMinutes: srv.durationMinutes,
      priceType: srv.priceType,
      basePrice: srv.basePrice,
      maxPrice: srv.maxPrice ? String(srv.maxPrice) : '',
      allowsFitInWindow: srv.allowsFitInWindow,
      description: srv.description,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: form.name,
      category: form.category,
      durationMinutes: Number(form.durationMinutes),
      priceType: form.priceType,
      basePrice: Number(form.basePrice),
      maxPrice:
        form.priceType === 'variable' && form.maxPrice ? Number(form.maxPrice) : null,
      allowsFitInWindow: form.allowsFitInWindow,
      description: form.description,
    };

    if (editing) {
      await api.updateService(editing.id, payload);
      notifyToast('Serviço atualizado com sucesso!');
    } else {
      await api.createService(payload);
      notifyToast('Novo serviço cadastrado!');
    }
    setShowModal(false);
    await onRefresh();
  };

  const fixedCount = services.filter((s) => s.priceType === 'fixed').length;
  const variableCount = services.filter((s) => s.priceType === 'variable').length;

  return (
    <div>
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">
            <span>Catálogo de Serviços</span>
            <Scissors size={15} />
          </div>
          <div className="kpi-value">{services.length}</div>
          <div className="kpi-sub">Ativos para agendamento</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">
            <span>Valor Fixo</span>
            <Clock size={15} />
          </div>
          <div className="kpi-value">{fixedCount}</div>
          <div className="kpi-sub">Preço tabelado fechado</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">
            <span>Valor Variável</span>
            <Layers size={15} />
          </div>
          <div className="kpi-value">{variableCount}</div>
          <div className="kpi-sub">Ajustável por tamanho/densidade na comanda</div>
        </div>
      </div>

      <div className="card">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 18,
          }}
        >
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700 }}>
              Serviços Cadastrados (Tempo & Valor Fixo ou Variável)
            </h2>
            <p style={{ fontSize: 12.5, color: 'var(--ink-secondary)' }}>
              Configure a duração em minutos e defina se o serviço tem valor fixo ou variável.
            </p>
          </div>
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={16} /> Novo Serviço
          </button>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Serviço</th>
                <th>Categoria</th>
                <th>Tempo Estimado</th>
                <th>Modalidade de Preço</th>
                <th>Valor Base / Faixa</th>
                <th>Janela p/ Encaixe</th>
                <th style={{ textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {services.map((srv) => (
                <tr key={srv.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{srv.name}</div>
                    {srv.description && (
                      <div style={{ fontSize: 12, color: 'var(--ink-secondary)' }}>
                        {srv.description}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className="badge badge-scheduled">{srv.category}</span>
                  </td>
                  <td className="mono">{srv.durationMinutes} min</td>
                  <td>
                    {srv.priceType === 'fixed' ? (
                      <span className="badge badge-completed">Valor Fixo</span>
                    ) : (
                      <span className="badge badge-progress">Valor Variável</span>
                    )}
                  </td>
                  <td className="mono" style={{ fontWeight: 600 }}>
                    {srv.priceType === 'fixed'
                      ? formatBRL(srv.basePrice)
                      : srv.maxPrice
                      ? `${formatBRL(srv.basePrice)} a ${formatBRL(srv.maxPrice)}`
                      : `A partir de ${formatBRL(srv.basePrice)}`}
                  </td>
                  <td>
                    {srv.allowsFitInWindow ? (
                      <span className="badge badge-fitin">Permite Encaixe na Pausa</span>
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>Direto</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      <button className="btn btn-sm" onClick={() => openEdit(srv)}>
                        <Edit3 size={13} /> Editar
                      </button>
                      <button
                        className="btn btn-sm"
                        style={{ color: 'var(--status-danger)' }}
                        onClick={async () => {
                          if (confirm(`Remover serviço "${srv.name}"?`)) {
                            await api.deleteService(srv.id);
                            await onRefresh();
                            notifyToast('Serviço removido.');
                          }
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editing ? 'Editar Serviço' : 'Cadastrar Novo Serviço'}</h2>
              <button className="btn btn-sm" onClick={() => setShowModal(false)}>
                Fechar
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-grid">
                  <div className="field" style={{ gridColumn: 'span 2' }}>
                    <label>Nome do Serviço</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Progressiva sem Formol / Corte Degradê"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Categoria</label>
                    <input
                      type="text"
                      required
                      placeholder="Cabelo, Química, Barbearia..."
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Tempo de Execução (minutos)</label>
                    <input
                      type="number"
                      required
                      min={5}
                      step={5}
                      value={form.durationMinutes}
                      onChange={(e) =>
                        setForm({ ...form, durationMinutes: Number(e.target.value) })
                      }
                    />
                  </div>
                </div>

                <div className="form-grid">
                  <div className="field">
                    <label>Tipo de Valor</label>
                    <select
                      value={form.priceType}
                      onChange={(e) =>
                        setForm({ ...form, priceType: e.target.value as PriceType })
                      }
                    >
                      <option value="fixed">Valor Fixo (Tabelado)</option>
                      <option value="variable">
                        Valor Variável (Definido conforme avaliação/comanda)
                      </option>
                    </select>
                  </div>

                  <div className="field">
                    <label>
                      {form.priceType === 'fixed' ? 'Valor Fixo (R$)' : 'Valor Base / Inicial (R$)'}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      required
                      value={form.basePrice}
                      onChange={(e) => setForm({ ...form, basePrice: Number(e.target.value) })}
                    />
                  </div>

                  {form.priceType === 'variable' && (
                    <div className="field">
                      <label>Teto de Referência Opcional (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        placeholder="Ex: 380.00"
                        value={form.maxPrice}
                        onChange={(e) => setForm({ ...form, maxPrice: e.target.value })}
                      />
                    </div>
                  )}
                </div>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    background: 'var(--bg-subtle)',
                    padding: '10px 12px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontWeight: 500,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={form.allowsFitInWindow}
                    onChange={(e) =>
                      setForm({ ...form, allowsFitInWindow: e.target.checked })
                    }
                  />
                  Este serviço possui tempo de pausa (ex: Progressiva / Química) ideal para encaixar
                  outro cliente no meio do horário
                </label>

                <div className="field">
                  <label>Descrição / Observações Técnicas</label>
                  <textarea
                    rows={2}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Detalhes do procedimento..."
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn" onClick={() => setShowModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Salvar Serviço
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
