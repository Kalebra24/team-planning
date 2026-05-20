# Planeamento de Recursos · Equipa Processos

Aplicação web de planeamento de recursos humanos para a Equipa Processos. Permite gerir alocações mensais por pessoa e projeto, detetar sobrealocações, arquivar planos mensais e colaborar em equipa através de sessões de edição com registo de alterações.

Funciona inteiramente num único ficheiro `index.html`, sem servidor de aplicação — os dados são persistidos no **Supabase**.

---

## Funcionalidades

### Dashboard
- Utilização média da equipa no mês atual
- Deteção de pessoas em risco de lacuna nos próximos 3 meses
- Painel "Próximo mês" com carga planeada por pessoa (verde / âmbar / vermelho)
- Alertas de sobrealocação >110%
- Gráfico de barras de capacidade vs alocação por pessoa — seleção de ano e mês

### Alocações
- Tabela CRUD de registos de alocação (pessoa, projeto, WP, atividade, datas, horas)
- Filtros por pessoa e projeto
- Pesquisa por texto livre

### Heatmap
- Mapa de calor de utilização por pessoa × mês
- Escala a 5 níveis: 0–25% / 26–75% / 76–95% / 96–110% / >110%
- Atalhos de período (próx. 12 meses, próx. 6 meses, ano corrente)

### Timeline (Gantt)
- Vista Gantt por pessoa com barras de alocação arrastáveis e redimensionáveis
- Modo mensal: edição inline de horas por mês diretamente na barra
- Filtro multi-seleção por pessoa e projeto
- Alternância de unidade PM / horas

### Por Projeto
- Gráfico donut de distribuição de horas por projeto
- Matriz pessoa × projeto com totais
- Catálogo de projetos: adicionar, remover e ativar/desativar

### Equipa
- Adicionar e remover membros
- Edição de capacidade mensal por pessoa (default: 140 h)

### Arquivo
- Submissão de snapshot mensal do plano (após revisão dos chefes de equipa)
- Histórico de planos com data, autor, nota e estatísticas
- Consulta detalhada de cada plano
- Restauro de estado a partir de um plano arquivado

---

## Colaboração e sessões

- **Check-in / check-out** — cada utilizador inicia uma sessão com as suas iniciais; todas as alterações ficam registadas com autoria e timestamp
- **Diário de alterações** — visível no menu Dados, mostra as modificações desde a última sessão do utilizador atual
- **Mesclar inteligente (3-way diff)** — ao importar um ficheiro JSON, o sistema deteta automaticamente registos novos, alterados, em conflito (vence o mais recente) e eliminados

---

## Importação / Exportação

| Formato | Importar | Exportar |
|---------|----------|----------|
| JSON | Substituir tudo, mesclar simples ou mesclar inteligente | Backup completo com baseline de sincronização |
| Excel | Formato Assignment (sheet original) | Folha de output + matriz de percentagem de alocação |

---

## Stack técnica

| Componente | Tecnologia |
|------------|------------|
| Frontend | HTML + CSS + JavaScript (vanilla) |
| Persistência | [Supabase](https://supabase.com) (PostgreSQL) |
| Excel | [SheetJS / xlsx](https://sheetjs.com) |
| Tipografia | Fraunces · Inter Tight · JetBrains Mono (Google Fonts) |
| Deploy | GitHub Pages |

---

## Configuração do Supabase

A aplicação requer as seguintes tabelas no Supabase:

```sql
-- Membros da equipa
create table workers (
  app_id text not null,
  name   text not null,
  primary key (app_id, name)
);

-- Catálogo de projetos
create table projects (
  app_id text    not null,
  name   text    not null,
  active boolean default true,
  primary key (app_id, name)
);

-- Registos de alocação
create table records (
  id           text primary key,
  app_id       text,
  team         text,
  worker       text,
  project      text,
  wp           text,
  task         text,
  start_date   text,
  end_date     text,
  total_hours  numeric default 0,
  months_hours jsonb   default '{}',
  updated_at   timestamptz
);

-- Capacidade mensal por pessoa
create table capacity (
  app_id text    not null,
  worker text    not null,
  ym     text    not null,  -- formato YYYY-MM
  hours  numeric default 140,
  primary key (app_id, worker, ym)
);

-- Configuração geral e arquivo de planos
create table app_config (
  app_id text not null,
  key    text not null,
  value  text,
  primary key (app_id, key)
);

-- Sessões de edição
create table sessions (
  id             uuid primary key default gen_random_uuid(),
  app_id         text,
  user_initials  text,
  checked_in_at  timestamptz default now(),
  checked_out_at timestamptz,
  is_active      boolean default true
);

-- Diário de alterações
create table changelog (
  id            uuid primary key default gen_random_uuid(),
  app_id        text,
  session_id    uuid,
  user_initials text,
  action        text,   -- create | update | delete
  entity_type   text,
  entity_id     text,
  entity_name   text,
  summary       text,
  changed_at    timestamptz default now()
);
```

Configurar as políticas de Row Level Security (RLS) conforme necessário. Para uso interno sem autenticação, pode-se permitir acesso anónimo com a anon key.

---

## Configuração da aplicação

No ficheiro `index.html`, substituir as constantes no topo do bloco `<script>`:

```js
const SUPABASE_URL      = 'https://SEU-PROJETO.supabase.co';
const SUPABASE_ANON_KEY = 'SUA-ANON-KEY';
const APP_ID            = 'team-planning'; // identificador da instância
```

O `APP_ID` permite usar o mesmo projeto Supabase para múltiplas instâncias da aplicação.

---

## Deploy

A aplicação é um ficheiro estático — basta servir `index.html` a partir de qualquer host estático.

**GitHub Pages** (configuração atual):  
Ativar em *Settings → Pages → Source: Deploy from branch → main*.  
URL: `https://<utilizador>.github.io/<repositório>/`

---

## Estrutura de dados

Cada registo de alocação contém:

```json
{
  "id": "rec_1234567890_abc123",
  "worker": "Maria Silva",
  "project": "POCTEP-SMARTFLOW",
  "wp": "WP3",
  "task": "Modelação hidrológica",
  "start": "2026-01",
  "end": "2026-06",
  "totalHours": 280,
  "monthsHours": {
    "2026-01": 40,
    "2026-02": 50,
    "2026-03": 60,
    "2026-04": 50,
    "2026-05": 40,
    "2026-06": 40
  }
}
```
