import React, { useState } from 'react';
import {
  Package,
  Plus,
  AlertCircle,
  Edit3,
  Trash2,
  ArrowUpCircle,
  DollarSign,
} from 'lucide-react';
import { api, formatBRL } from '../api';
import type { Product } from '../../shared/types';

interface ProductsViewProps {
  products: Product[];
  onRefresh: () => Promise<void>;
  notifyToast: (msg: string) => void;
}

export const ProductsView: React.FC<ProductsViewProps> = ({
  products,
  onRefresh,
  notifyToast,
}) => {
  const [editing, setEditing] = useState<Product | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Restock modal state
  const [restockTarget, setRestockTarget] = useState<Product | null>(null);
  const [restockQty, setRestockQty] = useState<number>(5);
  const [restockExpense, setRestockExpense] = useState<boolean>(true);

  const [form, setForm] = useState({
    name: '',
    category: 'Shampoo',
    sku: '',
    price: 65,
    costPrice: 30,
    stockQuantity: 10,
    minStock: 4,
    unit: 'un',
  });

  const openCreate = () => {
    setEditing(null);
    setForm({
      name: '',
      category: 'Shampoo',
      sku: `PRD-00${products.length + 1}`,
      price: 68,
      costPrice: 30,
      stockQuantity: 12,
      minStock: 4,
      unit: 'un',
    });
    setShowModal(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      name: p.name,
      category: p.category,
      sku: p.sku,
      price: p.price,
      costPrice: p.costPrice,
      stockQuantity: p.stockQuantity,
      minStock: p.minStock,
      unit: p.unit,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) {
      await api.updateProduct(editing.id, form);
      notifyToast('Produto atualizado com sucesso!');
    } else {
      await api.createProduct(form);
      notifyToast('Produto de beleza cadastrado no estoque!');
    }
    setShowModal(false);
    await onRefresh();
  };

  const handleRestockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restockTarget) return;
    await api.restockProduct(restockTarget.id, restockQty, restockExpense);
    setRestockTarget(null);
    await onRefresh();
    notifyToast('Estoque abastecido com sucesso!');
  };

  const totalUnits = products.reduce((acc, p) => acc + p.stockQuantity, 0);
  const stockSaleValue = products.reduce((acc, p) => acc + p.stockQuantity * p.price, 0);
  const lowStockProducts = products.filter((p) => p.stockQuantity <= p.minStock);

  return (
    <div>
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">
            <span>Itens no Catálogo</span>
            <Package size={15} />
          </div>
          <div className="kpi-value">{products.length}</div>
          <div className="kpi-sub">{totalUnits} unidades totais em prateleira</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">
            <span>Valor de Venda em Estoque</span>
            <DollarSign size={15} />
          </div>
          <div className="kpi-value">{formatBRL(stockSaleValue)}</div>
          <div className="kpi-sub">Potencial de receita em produtos</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">
            <span>Alerta de Estoque Baixo</span>
            <AlertCircle size={15} />
          </div>
          <div
            className="kpi-value"
            style={{
              color:
                lowStockProducts.length > 0 ? 'var(--status-danger)' : 'var(--status-ok)',
            }}
          >
            {lowStockProducts.length}
          </div>
          <div className="kpi-sub">
            {lowStockProducts.length > 0
              ? 'Produtos que precisam de reposição'
              : 'Todos os estoques saudáveis'}
          </div>
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
              Produtos de Beleza & Controle de Estoque
            </h2>
            <p style={{ fontSize: 12.5, color: 'var(--ink-secondary)' }}>
              Shampoos, Máscaras, Condicionadores, Kits e Pomadas. A baixa de estoque ocorre
              automaticamente ao finalizar o agendamento.
            </p>
          </div>
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={16} /> Novo Produto
          </button>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Categoria</th>
                <th>Preço Venda</th>
                <th>Custo Unit.</th>
                <th>Estoque Atual</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const isLow = p.stockQuantity <= p.minStock;
                return (
                  <tr key={p.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.name}</div>
                      <div className="mono" style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>
                        SKU: {p.sku || `PRD-${p.id}`}
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-scheduled">{p.category}</span>
                    </td>
                    <td className="mono" style={{ fontWeight: 600 }}>
                      {formatBRL(p.price)}
                    </td>
                    <td className="mono" style={{ color: 'var(--ink-secondary)' }}>
                      {formatBRL(p.costPrice)}
                    </td>
                    <td className="mono" style={{ fontWeight: 700 }}>
                      {p.stockQuantity} {p.unit}
                    </td>
                    <td>
                      {p.stockQuantity === 0 ? (
                        <span className="badge badge-danger">Esgotado</span>
                      ) : isLow ? (
                        <span className="badge badge-progress">
                          Repor (Mín: {p.minStock})
                        </span>
                      ) : (
                        <span className="badge badge-completed">Em Estoque</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <button
                          className="btn btn-sm"
                          onClick={() => {
                            setRestockTarget(p);
                            setRestockQty(5);
                            setRestockExpense(true);
                          }}
                          title="Entrada de mercadoria"
                        >
                          <ArrowUpCircle size={13} /> Repor Estoque
                        </button>
                        <button className="btn btn-sm" onClick={() => openEdit(p)}>
                          <Edit3 size={13} />
                        </button>
                        <button
                          className="btn btn-sm"
                          style={{ color: 'var(--status-danger)' }}
                          onClick={async () => {
                            if (confirm(`Remover produto "${p.name}"?`)) {
                              await api.deleteProduct(p.id);
                              await onRefresh();
                              notifyToast('Produto removido.');
                            }
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
      </div>

      {/* Create / Edit Product Modal */}
      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editing ? 'Editar Produto' : 'Cadastrar Produto de Beleza'}</h2>
              <button className="btn btn-sm" onClick={() => setShowModal(false)}>
                Fechar
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-grid">
                  <div className="field" style={{ gridColumn: 'span 2' }}>
                    <label>Nome do Produto</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Shampoo Reconstrutor 300ml / Kit Pós-Progressiva"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Categoria</label>
                    <select
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                    >
                      <option value="Shampoo">Shampoo</option>
                      <option value="Máscara">Máscara de Cabelo</option>
                      <option value="Condicionador">Condicionador</option>
                      <option value="Kits">Kits Home Care</option>
                      <option value="Finalizadores">Óleos & Finalizadores</option>
                      <option value="Barbearia">Linha Barbearia (Pomada/Óleo)</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Código / SKU</label>
                    <input
                      type="text"
                      value={form.sku}
                      onChange={(e) => setForm({ ...form, sku: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-grid">
                  <div className="field">
                    <label>Valor de Venda ao Cliente (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      required
                      value={form.price}
                      onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                    />
                  </div>
                  <div className="field">
                    <label>Custo de Aquisição Unitário (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={form.costPrice}
                      onChange={(e) => setForm({ ...form, costPrice: Number(e.target.value) })}
                    />
                  </div>
                  <div className="field">
                    <label>Quantidade em Estoque</label>
                    <input
                      type="number"
                      min={0}
                      required
                      value={form.stockQuantity}
                      onChange={(e) =>
                        setForm({ ...form, stockQuantity: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div className="field">
                    <label>Alerta de Estoque Mínimo</label>
                    <input
                      type="number"
                      min={0}
                      value={form.minStock}
                      onChange={(e) => setForm({ ...form, minStock: Number(e.target.value) })}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn" onClick={() => setShowModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Salvar Produto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Restock Modal */}
      {restockTarget && (
        <div className="modal-backdrop" onClick={() => setRestockTarget(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Abastecer Estoque — {restockTarget.name}</h2>
              <button className="btn btn-sm" onClick={() => setRestockTarget(null)}>
                Fechar
              </button>
            </div>
            <form onSubmit={handleRestockSubmit}>
              <div className="modal-body">
                <p style={{ fontSize: 13 }}>
                  Estoque atual: <strong>{restockTarget.stockQuantity} unidades</strong>
                </p>
                <div className="field">
                  <label>Quantidade a Adicionar na Entrada</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={restockQty}
                    onChange={(e) => setRestockQty(Number(e.target.value))}
                  />
                </div>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    background: 'var(--bg-subtle)',
                    padding: 12,
                    borderRadius: 6,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={restockExpense}
                    onChange={(e) => setRestockExpense(e.target.checked)}
                  />
                  <span>
                    Lançar automaticamente o custo de compra (
                    <strong>{formatBRL(restockQty * restockTarget.costPrice)}</strong>) como saída
                    no Módulo Financeiro
                  </span>
                </label>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn" onClick={() => setRestockTarget(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Confirmar Entrada de Estoque
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
