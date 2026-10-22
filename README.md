# Agenda Hair — Sistema de Gestão & Agendamento para Salões e Barbearias

Sistema completo, rápido e personalizável (White-Label) para **Salões de Beleza e Barbearias**, construído em **TypeScript Full-Stack** (**React 19 + Vite + Node.js LTS + Express + SQLite Nativo em modo WAL**).

## Funcionalidades Principais

- **Catálogo de Serviços**:
  - Cadastro por tempo de execução (minutos) e valor (**fixo** ou **variável / a partir de**).
  - Suporte a múltiplos serviços no mesmo agendamento com soma automática do tempo e valor.
- **Agenda Inteligente com Suporte a Encaixe**:
  - Permite encaixar atendimentos simultâneos durante janelas de pausa química (ex.: corte de cabelo às 15h durante uma progressiva das 14h às 17h).
  - Edição completa de agendamentos e visualização diferenciada (riscada/esmaecida) para atendimentos finalizados e pagos.
- **Clientes & Avisos (WhatsApp e SMS)**:
  - Cadastro de clientes com nome completo, telefone e histórico automático de visitas e valor gasto.
  - Disparo rápido de lembretes e recibos via WhatsApp (`wa.me` ou Webhook API) e SMS.
- **Produtos de Beleza & Controle de Estoque**:
  - Cadastro de shampoos, máscaras, condicionadores e kits com preço de venda, preço de custo (CMV) e alerta de estoque mínimo.
  - Inclusão de produtos diretamente na comanda do cliente com baixa automática de estoque ao finalizar.
- **Módulo Financeiro & Balanço Completo**:
  - Relatórios **Diário, Semanal, Mensal e Anual** de todos os serviços executados e produtos vendidos.
  - **Taxas Operacionais de Maquininha (Débito e Crédito %)**: desconto automático da taxa percentual no balanço líquido para cada entrada via cartão.
  - **Estorno de Entradas**: opção de estornar comandas ou entradas extras exigindo motivo obrigatório por escrito e devolvendo produtos ao estoque.
- **Contas a Pagar & Alertas de Vencimento**:
  - Agendamento de contas únicas, **fixas para todos os meses** (ex.: aluguel) ou **parceladas com fornecedor**.
  - Filtro mensal (meses anteriores, atual e posteriores), edição e exclusão em lote para parcelas subsequentes.
  - Notificações no sistema para contas prestes a vencer e contas vencidas (1+ dia após o vencimento).
  - Ao marcar uma conta como paga, o valor é lançado automaticamente como **Despesa no dia** no Balanço Financeiro (com opção de estorno).
- **Layout Responsivo (Desktop & Mobile)**:
  - Barra lateral no desktop e menu inferior estilo aplicativo (WhatsApp) no celular.

## Como Executar Localmente

1. Instale as dependências:
   ```bash
   npm install
   ```
2. Inicie o servidor (API + Frontend simultaneamente):
   ```bash
   npm run dev
   ```
   Ou dê dois cliques no arquivo `iniciar-sistema.bat` no Windows.
3. Acesse no navegador: `http://localhost:5173`
