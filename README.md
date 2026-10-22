# ✂️ Agenda Hair — Plataforma SaaS para Salões de Beleza e Barbearias

> **Versão Atual:** `v0.1.0-alpha.1` *(Versão Alpha — Em Desenvolvimento Ativo)*

O **Agenda Hair** é uma plataforma web multi-tenant completa para gestão operacional, agendamento inteligente com encaixe na pausa química, controle de estoque e módulo financeiro para **Salões de Beleza e Barbearias**, contando também com um **Painel de Administração SaaS** para gestão de clientes assinantes, mensalidades e métricas de uso.

---

## 🔐 Credenciais de Demonstração (Prontas para Teste)

Na tela de login do sistema você também encontrará botões de preenchimento automático para testar cada perfil:

| Perfil | E-mail | Senha | O que acessa |
| :--- | :--- | :--- | :--- |
| **Administrador SaaS (Dono / Equipe)** | `admin@agendahair.com` | `123456` | Painel Administrador (Clientes, Pagamentos, Métricas de Uso e Equipe) |
| **Cabeleireiro / Salão #1** | `contato@ateliernobre.com` | `123456` | Painel do Cabeleireiro (*Atelier Nobre Hair & Barber*) |
| **Barbearia / Cliente #2** | `contato@barbeariadompedro.com` | `123456` | Painel do Cabeleireiro (*Barbearia Dom Pedro*) |

---

## 🚀 Como Baixar e Testar Localmente

### Pré-requisitos
- **Node.js LTS (v22.5+ ou superior)** instalado no computador ([https://nodejs.org](https://nodejs.org)) — utiliza o banco nativo `node:sqlite`.

### Opção 1: Inicialização Rápida no Windows
1. Extraia o arquivo `.zip` da Release em uma pasta.
2. Dê dois cliques no arquivo **`INICIAR_SISTEMA.bat`**.
3. O script instalará as dependências automaticamente (na primeira vez) e abrirá o sistema em `http://localhost:5173`.

### Opção 2: Via Terminal
```bash
npm install
npm run dev
```
- **Aplicação Web (Frontend Vite + React 19):** `http://localhost:5173`
- **API Backend (Express + SQLite WAL):** `http://localhost:3333`

---

## ✨ O que já está incluído nesta versão (`v0.1.0-alpha.1`)

### 1. Segurança, Login e Arquitetura Multi-Tenant (SaaS)
- **Autenticação por E-mail e Senha** com criptografia `scrypt` (`node:crypto`) e sessões por token `Bearer`.
- **Isolamento Multi-Tenant (`tenant_id`)**: Cada salão ou barbearia possui sua própria agenda, carteira de clientes, serviços, profissionais, produtos, balanço financeiro e contas a pagar totalmente isolados.
- **Bloqueio Automático por Inadimplência**: Estabelecimentos marcados como `Suspenso` no painel administrativo têm o login bloqueado automaticamente.

### 2. Painel de Administrador do SaaS (`role: superadmin`)
- **Gestão de Clientes (Salões e Barbearias)**: Cadastro de novos clientes com provisionamento automático do ambiente, definição de e-mail/senha, plano contratado, valor de mensalidade, dia de vencimento e suspensão/reativação com 1 clique.
- **Modo Inspeção / Suporte**: Botão **"Acessar Painel do Salão"** que permite ao administrador visualizar e dar suporte diretamente dentro do painel de qualquer cliente e retornar ao Painel Admin a qualquer momento.
- **Controle de Mensalidades e Pagamentos SaaS**: Lançamento de cobranças, baixa rápida de recebimentos, filtro por cliente e indicadores de **MRR (Receita Recorrente Mensal)**, total recebido no mês e pendências.
- **Métricas de Uso por Cliente**: Acompanhamento em tempo real do total de agendamentos, atendimentos concluídos, clientes finais na carteira, profissionais, serviços, produtos, volume financeiro movimentado e data do último login.
- **Gestão de Equipe Interna**: Cadastro de funcionários administradores para operar o painel SaaS.

### 3. Painel do Cabeleireiro / Barbearia (`role: tenant`)
- **Agenda & Encaixes Inteligentes**:
  - Suporte a **atendimentos simultâneos (Encaixe)** durante janelas de pausa química (ex.: coloração, progressiva, mechas).
  - Seleção de **múltiplos serviços** no mesmo agendamento com soma automática de duração e preço.
  - Comandas finalizadas e pagas exibidas com destaque visual personalizável (riscadas/esmaecidas) para facilitar a leitura da fila do dia.
- **Catálogo de Serviços (Fixos e Variáveis)**:
  - Serviços com preço fixo ou variável (definido no fechamento da comanda conforme tamanho do cabelo/química utilizada).
- **Produtos & Controle de Estoque**:
  - Cadastro com preço de custo, preço de venda e alerta de estoque mínimo.
  - Baixa automática de estoque ao vender produtos na comanda do cliente e opção de lançar despesa automática na reposição de estoque.
- **Clientes & Notificações (WhatsApp / SMS)**:
  - Histórico completo do cliente, disparo de lembretes de agendamento e comprovantes de pagamento via WhatsApp (`wa.me` ou Webhook API) e SMS.
- **Módulo Financeiro Completo**:
  - **Balanço Financeiro (Diário, Semanal, Mensal e Anual)** com gráficos de evolução, lucro líquido real e detalhamento por método de pagamento.
  - **Desconto Automático de Taxas de Maquininha (Débito e Crédito %)** configuráveis na tela de Configurações.
  - **Estorno de Entradas e Comandas** com obrigatoriedade de informar o motivo por escrito para auditoria e devolução automática de produtos ao estoque.
  - **Contas a Pagar & Vencimentos**: Agendamento de contas únicas, despesas fixas mensais (ex.: aluguel) e compras parceladas com fornecedores, alertas automáticos no topo do sistema para contas prestes a vencer ou vencidas, edição/exclusão em lote de parcelas subsequentes, filtro mensal, lançamento automático como despesa no balanço ao pagar e opção de estornar conta paga.
- **Design Responsivo (Desktop & Mobile)**:
  - Menu lateral completo no computador e barra de navegação inferior estilo aplicativo no celular.
