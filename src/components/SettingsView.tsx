import React, { useState } from 'react';
import {
  Sliders,
  Plus,
  Trash2,
  Check,
  Palette,
  MessageSquare,
  Users,
  CreditCard,
} from 'lucide-react';
import { api, formatBRL, formatPhoneMask } from '../api';
import type {
  BusinessType,
  CompanySettings,
  CompletedDisplayMode,
  Professional,
} from '../../shared/types';

interface SettingsViewProps {
  settings: CompanySettings;
  professionals: Professional[];
  onRefresh: () => Promise<void>;
  notifyToast: (msg: string) => void;
}

const BRAND_PRESETS = [
  {
    label: 'Salão & Alta Coiffure (Terracotta)',
    name: 'Atelier Nobre — Salão & Estética',
    subtitle: 'Alta Coiffure, Química & Tratamentos',
    businessType: 'salon' as BusinessType,
    accentColor: '#9E5A3C',
  },
  {
    label: 'Barbearia Clássica (Verde Britânico)',
    name: 'Barbearia Dom Pedro — Club & Navalha',
    subtitle: 'Cortes Clássicos, Barba Terapia & Cerveja Artesanal',
    businessType: 'barbershop' as BusinessType,
    accentColor: '#234B36',
  },
  {
    label: 'Studio Urbano (Obsidian Slate)',
    name: 'Studio Vértice Hair & Barber',
    subtitle: 'Visagismo, Coloração & Barbearia Moderna',
    businessType: 'hybrid' as BusinessType,
    accentColor: '#273444',
  },
  {
    label: 'Espaço Beleza & Spa (Rosewood)',
    name: 'Maison Lumière — Beauty & Care',
    subtitle: 'Mechas Criativas, Alisamentos & Terapia Capilar',
    businessType: 'salon' as BusinessType,
    accentColor: '#85394E',
  },
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  professionals,
  onRefresh,
  notifyToast,
}) => {
  const [form, setForm] = useState<CompanySettings>({ ...settings });
  const [newProf, setNewProf] = useState({
    name: '',
    role: 'Especialista Capilar',
    color: '#9E5A3C',
  });

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.updateSettings(form);
    await onRefresh();
    notifyToast('Personalização da empresa salva e aplicada!');
  };

  const applyPreset = async (preset: (typeof BRAND_PRESETS)[0]) => {
    const updated = {
      ...form,
      name: preset.name,
      subtitle: preset.subtitle,
      businessType: preset.businessType,
      accentColor: preset.accentColor,
    };
    setForm(updated);
    await api.updateSettings(updated);
    await onRefresh();
    notifyToast(`Tema "${preset.label}" aplicado com sucesso!`);
  };

  const handleAddProfessional = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProf.name.trim()) return;
    await api.createProfessional(newProf);
    setNewProf({ name: '', role: 'Especialista', color: '#2C5E43' });
    await onRefresh();
    notifyToast('Profissional adicionado à equipe!');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {/* Quick White-Label Presets */}
      <div className="card">
        <div style={{ marginBottom: 14 }}>
          <h2
            style={{
              fontSize: 16,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Palette size={17} /> Presets Rápidos de Personalização por Cliente (Salão ou
            Barbearia)
          </h2>
          <p style={{ fontSize: 12.5, color: 'var(--ink-secondary)' }}>
            Experimente trocar o perfil da empresa com 1 clique para ver como o sistema se adapta a
            cada cliente.
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 12,
          }}
        >
          {BRAND_PRESETS.map((p, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => applyPreset(p)}
              style={{
                textAlign: 'left',
                padding: 14,
                borderRadius: 'var(--radius-md)',
                border:
                  form.accentColor === p.accentColor
                    ? `2px solid ${p.accentColor}`
                    : '1px solid var(--border-color)',
                background: 'var(--bg-surface)',
                cursor: 'pointer',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 6,
                }}
              >
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    background: p.accentColor,
                  }}
                />
                <strong style={{ fontSize: 13 }}>{p.label}</strong>
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-secondary)' }}>{p.name}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Main Company Form */}
      <form onSubmit={handleSaveSettings} className="card">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 18,
          }}
        >
          <div>
            <h2
              style={{
                fontSize: 16,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Sliders size={17} /> Identidade Visual, Expediente & Mensagens Automáticas
            </h2>
            <p style={{ fontSize: 12.5, color: 'var(--ink-secondary)' }}>
              Personalize nome, cores, horários e templates de WhatsApp e SMS.
            </p>
          </div>
          <button type="submit" className="btn btn-primary">
            <Check size={16} /> Salvar Alterações
          </button>
        </div>

        <div className="form-grid" style={{ marginBottom: 16 }}>
          <div className="field">
            <label>Nome do Estabelecimento (Salão / Barbearia)</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Subtítulo / Especialidade</label>
            <input
              type="text"
              value={form.subtitle}
              onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Segmento</label>
            <select
              value={form.businessType}
              onChange={(e) =>
                setForm({ ...form, businessType: e.target.value as BusinessType })
              }
            >
              <option value="salon">Salão de Beleza & Estética</option>
              <option value="barbershop">Barbearia</option>
              <option value="hybrid">Salão & Barbearia Integrados</option>
            </select>
          </div>
          <div className="field">
            <label>Cor Principal da Marca</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="color"
                value={form.accentColor}
                onChange={(e) => setForm({ ...form, accentColor: e.target.value })}
                style={{ width: 46, height: 38, padding: 2, cursor: 'pointer' }}
              />
              <input
                type="text"
                className="mono"
                value={form.accentColor}
                onChange={(e) => setForm({ ...form, accentColor: e.target.value })}
              />
            </div>
          </div>
        </div>

        <div className="form-grid" style={{ marginBottom: 20 }}>
          <div className="field">
            <label>Telefone / WhatsApp da Recepção</label>
            <input
              type="text"
              value={form.phone}
              onChange={(e) =>
                setForm({ ...form, phone: formatPhoneMask(e.target.value) })
              }
            />
          </div>
          <div className="field">
            <label>Endereço Completo</label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Abertura do Expediente</label>
            <input
              type="time"
              value={form.openTime}
              onChange={(e) => setForm({ ...form, openTime: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Fechamento do Expediente</label>
            <input
              type="time"
              value={form.closeTime}
              onChange={(e) => setForm({ ...form, closeTime: e.target.value })}
            />
          </div>
        </div>

        {/* Taxas Operacionais das Maquininhas de Cartão (Débito e Crédito) */}
        <div
          style={{
            borderTop: '1px solid var(--border-color)',
            paddingTop: 18,
            marginBottom: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div>
            <h3
              style={{
                fontSize: 14.5,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 7,
              }}
            >
              <CreditCard size={15} /> Taxas Operacionais das Maquininhas de Cartão (Débito e
              Crédito)
            </h3>
            <p style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 }}>
              Configure a taxa percentual (%) cobrada pela operadora da maquininha. O desconto será
              calculado automaticamente em cada entrada no Balanço Financeiro.
            </p>
          </div>

          <div className="form-grid">
            <div className="field">
              <label>Taxa Função Débito (%)</label>
              <input
                type="number"
                step="0.01"
                min={0}
                max={50}
                required
                className="mono"
                value={form.debitCardFeePercent ?? 1.49}
                onChange={(e) =>
                  setForm({ ...form, debitCardFeePercent: Number(e.target.value) })
                }
              />
              <span style={{ fontSize: 11.5, color: 'var(--ink-muted)', marginTop: 4 }}>
                Ex.: Em R$ 100,00 no Débito → desconta{' '}
                <strong>
                  {formatBRL((100 * (Number(form.debitCardFeePercent) || 0)) / 100)}
                </strong>{' '}
                (Líquido:{' '}
                <strong>
                  {formatBRL(100 - (100 * (Number(form.debitCardFeePercent) || 0)) / 100)}
                </strong>
                )
              </span>
            </div>

            <div className="field">
              <label>Taxa Função Crédito (%)</label>
              <input
                type="number"
                step="0.01"
                min={0}
                max={50}
                required
                className="mono"
                value={form.creditCardFeePercent ?? 3.99}
                onChange={(e) =>
                  setForm({ ...form, creditCardFeePercent: Number(e.target.value) })
                }
              />
              <span style={{ fontSize: 11.5, color: 'var(--ink-muted)', marginTop: 4 }}>
                Ex.: Em R$ 100,00 no Crédito → desconta{' '}
                <strong>
                  {formatBRL((100 * (Number(form.creditCardFeePercent) || 0)) / 100)}
                </strong>{' '}
                (Líquido:{' '}
                <strong>
                  {formatBRL(100 - (100 * (Number(form.creditCardFeePercent) || 0)) / 100)}
                </strong>
                )
              </span>
            </div>
          </div>
        </div>

        <div
          style={{
            borderTop: '1px solid var(--border-color)',
            paddingTop: 18,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <h3
            style={{
              fontSize: 14.5,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 7,
            }}
          >
            <MessageSquare size={15} /> Templates de Avisos (WhatsApp & SMS)
          </h3>
          <p style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
            Variáveis disponíveis: <code>{'{cliente}'}</code>, <code>{'{servico}'}</code>,{' '}
            <code>{'{profissional}'}</code>, <code>{'{data}'}</code>, <code>{'{hora}'}</code>,{' '}
            <code>{'{empresa}'}</code>, <code>{'{valor}'}</code>
          </p>

          <div className="form-grid">
            <div className="field">
              <label>Mensagem WhatsApp — Confirmação / Lembrete</label>
              <textarea
                rows={3}
                value={form.whatsappTemplateReminder}
                onChange={(e) =>
                  setForm({ ...form, whatsappTemplateReminder: e.target.value })
                }
              />
            </div>
            <div className="field">
              <label>Mensagem WhatsApp — Recibo Pós-Atendimento</label>
              <textarea
                rows={3}
                value={form.whatsappTemplateReceipt}
                onChange={(e) =>
                  setForm({ ...form, whatsappTemplateReceipt: e.target.value })
                }
              />
            </div>
          </div>

          <div className="form-grid">
            <div className="field">
              <label>Mensagem Curta SMS — Lembrete</label>
              <input
                type="text"
                value={form.smsTemplateReminder}
                onChange={(e) =>
                  setForm({ ...form, smsTemplateReminder: e.target.value })
                }
              />
            </div>
            <div className="field">
              <label>Webhook API URL (Opcional — Evolution API / Z-API / Twilio)</label>
              <input
                type="url"
                placeholder="https://sua-api-whatsapp.com/webhook/send"
                value={form.webhookUrl}
                onChange={(e) => setForm({ ...form, webhookUrl: e.target.value })}
              />
            </div>
          </div>
        </div>
      </form>

      {/* Professionals Management */}
      <div className="card">
        <h2
          style={{
            fontSize: 16,
            fontWeight: 700,
            marginBottom: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Users size={17} /> Equipe de Profissionais (Cabeleireiros, Barbeiros, Especialistas)
        </h2>

        <form
          onSubmit={handleAddProfessional}
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            marginBottom: 18,
            background: 'var(--bg-subtle)',
            padding: 14,
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <input
            type="text"
            required
            placeholder="Nome do Profissional"
            value={newProf.name}
            onChange={(e) => setNewProf({ ...newProf, name: e.target.value })}
            style={{
              flex: 1,
              minWidth: 180,
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid var(--border-color)',
            }}
          />
          <input
            type="text"
            placeholder="Especialidade (Ex: Master Barber, Colorista)"
            value={newProf.role}
            onChange={(e) => setNewProf({ ...newProf, role: e.target.value })}
            style={{
              flex: 1,
              minWidth: 180,
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid var(--border-color)',
            }}
          />
          <input
            type="color"
            value={newProf.color}
            onChange={(e) => setNewProf({ ...newProf, color: e.target.value })}
            style={{ width: 44, height: 38, padding: 2 }}
          />
          <button type="submit" className="btn btn-primary">
            <Plus size={15} /> Adicionar Profissional
          </button>
        </form>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Cor</th>
                <th>Profissional</th>
                <th>Especialidade</th>
                <th style={{ textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {professionals.map((p) => (
                <tr key={p.id}>
                  <td style={{ width: 40 }}>
                    <span
                      style={{
                        display: 'inline-block',
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        background: p.color,
                      }}
                    />
                  </td>
                  <td style={{ fontWeight: 600 }}>{p.name}</td>
                  <td>{p.role}</td>
                  <td style={{ textAlign: 'right' }}>
                    {professionals.length > 1 && (
                      <button
                        className="btn btn-sm"
                        style={{ color: 'var(--status-danger)' }}
                        onClick={async () => {
                          if (confirm(`Desativar profissional "${p.name}"?`)) {
                            await api.deleteProfessional(p.id);
                            await onRefresh();
                            notifyToast('Profissional removido.');
                          }
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
