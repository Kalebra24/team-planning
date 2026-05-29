# Planeamento de Recursos · Equipa Processos

Aplicação web de planeamento de recursos humanos para a Equipa de Processos do INEGI.
Gere alocações mensais por pessoa e projeto, deteta sobrealocações, arquiva planos mensais
e regista todas as alterações com identificação do autor.

**URL da aplicação:** https://gitpages.inegi.up.pt/planeamento-d9a840/

---

## Funcionalidades

| Vista / Função | O que faz |
|---|---|
| **Dashboard** | Utilização média, pessoas em risco, próximo mês, sobrealocações |
| **Alocações** | Tabela CRUD — pessoa, projeto, WP, tarefa, datas, horas |
| **Heatmap** | Mapa de calor utilização × mês (5 níveis de cor) |
| **Timeline** | Gantt arrastável e redimensionável por pessoa |
| **Por Projeto** | Resumo de horas e PM por projeto e mês |
| **Equipa** | Edição de capacidades mensais por pessoa |
| **Arquivo** | Snapshots mensais do plano para consulta histórica |
| **Ausências / Férias** | Importa mapa de férias SIGEI (HTML); actualiza capacidades automaticamente |
| **Relatório Visual** | Relatório de 3 páginas imprimível: resumo, heatmap, matriz pessoa × projecto |

---

## Arquitectura

```
index.html              (shell HTML — estrutura, modais, tags <link> e <script>)
css/
  app.css               (todos os estilos)
js/
  utils.js              (helpers de datas, cores, uuid, formatação)
  state.js              (objecto state, cliente Supabase SB, loadState/saveState)
  auth.js               (OAuth GitLab PKCE, sessões, logChange, SEED_DATA)
  views.js              (Dashboard, Alocações, Heatmap, Projetos, Equipa, Arquivo)
  gantt.js              (Timeline — Gantt arrastável e redimensionável)
  import-export.js      (Excel, JSON 3-way merge, CSV, Férias, relatório visual)
  app.js                (routing, toast, sync, wiring de eventos, init)
supabase_migration.sql  (schema da base de dados)
.gitlab-ci.yml          (deploy automático para GitLab Pages)
```

### Stack

| Componente | Tecnologia |
|---|---|
| Frontend | HTML / CSS / JavaScript vanilla |
| Persistência | Supabase (PostgreSQL) via REST API |
| Autenticação | GitLab OAuth 2.0 com PKCE |
| Hosting | GitLab Pages (`gitpages.inegi.up.pt`) |
| CI/CD | GitLab Runner (shell, Windows) |

Não existe servidor de aplicação. Os ficheiros são estáticos; os dados são lidos e
escritos directamente na base de dados Supabase através da sua REST API, usando a
*anon key* para leitura/escrita e OAuth do GitLab para identificar o utilizador.

### Multi-projeto

A tabela `app_state` tem uma coluna `project_id` que isola os dados de diferentes
aplicações na mesma base de dados Supabase. Para reutilizar a base de dados noutro
projecto basta alterar o valor de `SB.projectId` no `js/state.js`.

---

## Como usar

### Primeira visita
1. Abre https://gitpages.inegi.up.pt/planeamento-d9a840/
2. Clica **Entrar** — redireciona para o login do GitLab (`git.inegi.up.pt`)
3. Autentica com as credenciais da empresa
4. A página abre com sessão iniciada no teu nome

Nas visitas seguintes o login é automático (token guardado no browser).

### Editar dados
- Qualquer alteração (nova alocação, edição, eliminação) requer sessão activa
- Clica **Sair** para terminar a sessão e registar o checkout no histórico
- O diário de alterações (**Changelog**) mostra o que mudou desde a tua última sessão

### Importar / Exportar
- **Dados → Importar Excel** — carrega um ficheiro `.xlsx` com a estrutura esperada
- **Dados → Descarregar / Carregar JSON** — backup e restauro completo do estado
- **Dados → 📅 Importar Mapa de Férias** — carrega o ficheiro HTML exportado do SIGEI e actualiza automaticamente as capacidades mensais (ausências reduzem a capacidade disponível a 8h/dia)
- **Dados → 📊 Relatório Visual** — gera relatório de 3 páginas imprimível como PDF
- **Submeter Plano** — guarda um snapshot do mês no Arquivo

---

## Ausências e Férias

A capacidade efectiva de cada pessoa é calculada subtraindo as horas de ausência à
capacidade base. As férias importadas do SIGEI ficam registadas em `state.absences` e
o valor líquido é guardado directamente em `state.capacity[pessoa][YYYY-MM]`.

- Células com férias mostram **🏖 −Xh** na tabela de capacidades
- Células com ausências manuais mostram a capacidade efectiva reduzida
- A importação é **idempotente**: reimportar com dados actualizados substitui sem duplicar

---

## Estrutura de dados (Supabase)

### Tabela `app_state`

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | UUID | Chave primária |
| `project_id` | TEXT UNIQUE | Identificador da aplicação (ex: `team-planning-processos`) |
| `data` | JSONB | Estado completo da aplicação |
| `version` | BIGINT | Incrementado em cada escrita — usado para detecção de conflitos |
| `updated_at` | TIMESTAMPTZ | Data/hora da última escrita |

### Estrutura do campo `data`

```json
{
  "workers":   ["Nome Apelido", ...],
  "projects":  [{ "name": "...", "active": true }, ...],
  "records":   [{ "id": "rec_...", "worker": "...", "project": "...",
                  "start": "YYYY-MM", "end": "YYYY-MM",
                  "totalHours": 0, "monthsHours": {"YYYY-MM": 0} }],
  "capacity":  { "Nome Apelido": { "YYYY-MM": 140 } },
  "absences":  { "Nome Apelido": { "YYYY-MM": { "hours": 16, "reason": "Férias" } } },
  "config":    { "editorInitials": "...", "plan_snapshots": [...] },
  "changelog": [{ "user_initials": "jsilva", "action": "update", ... }],
  "sessions":  [{ "user_initials": "jsilva", "checked_in_at": "...", ... }]
}
```

> **Nota:** `capacity[pessoa][YYYY-MM]` guarda sempre o valor **líquido** (após dedução de férias).
> O campo `absences` é referência — a capacidade efectiva já está em `capacity`.

---

## Supabase

### Credenciais

| Parâmetro | Valor |
|---|---|
| Project URL | `https://milzbgsbxshfhkyxkpvt.supabase.co` |
| Anon Key | ver `SB.anonKey` em `js/state.js` |
| Tabela | `app_state` |
| project_id | `team-planning-processos` |

### Criar a tabela (primeira vez)

Corre o ficheiro `supabase_migration.sql` no **SQL Editor** do Supabase Dashboard.

### Detecção de conflitos

A escrita usa `PATCH` para actualizar a linha existente. Antes de cada escrita é verificado
se a `version` remota coincide com a que foi lida — se não coincidir, é mostrado um diálogo
de conflito (outro utilizador guardou entretanto).

---

## CI/CD — Deploy automático

O ficheiro `.gitlab-ci.yml` configura um pipeline com um único job (`pages`) que:
1. Copia `index.html` para `public/`
2. Copia `manifest.json` se existir
3. Copia `css/` e `js/` para `public/`
4. Faz upload do artefacto para o GitLab Pages

O deploy corre automaticamente em cada push para `main`.

### Runner

O runner é um **shell executor Windows** a correr na máquina `jsilva@inegi.up.pt`.
Inicia automaticamente ao login via `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\gitlab-runner.vbs`.

Se o runner não estiver activo (ex: após reinício sem login):
```powershell
Start-Process -FilePath "C:\gitlab-runner\gitlab-runner.exe" `
  -ArgumentList "run --config `"C:\gitlab-runner\config.toml`"" `
  -WindowStyle Hidden
```

### Git remotes

O repositório tem dois remotes:
- **`gitlab`** — `git.inegi.up.pt` (fonte do deploy — pushing aqui actualiza o Pages)
- **`origin`** — GitHub (mirror)

Para publicar alterações: `git push gitlab main` (e opcionalmente `git push origin main`).

---

## Autenticação OAuth

A aplicação usa **GitLab OAuth 2.0 com PKCE** (sem segredo de cliente, adequado para SPAs).

| Parâmetro | Valor |
|---|---|
| Provider | `git.inegi.up.pt` |
| Application ID | `33a3f19adc5d27b42cafb6c3369766acc8c9d6602820a9f85af429781226767e` |
| Redirect URI | `https://gitpages.inegi.up.pt/planeamento-d9a840/` |
| Scope | `read_user` |

O token OAuth é guardado no `localStorage` do browser e refrescado automaticamente.
A identidade do utilizador (username GitLab) é verificada via `/api/v4/user` —
não pode ser forjada. O OAuth serve **apenas para identificação** — as escritas na
base de dados usam a anon key do Supabase.

---

## Desenvolvimento local

```bash
# Clonar
git clone https://git.inegi.up.pt/umec/manufacturing_processes/planeamento.git
cd planeamento

# Abrir directamente no browser (OAuth não funciona em file://)
# Usar um servidor local, ex:
python -m http.server 8080
# e aceder a http://localhost:8080
```

> **Nota:** Para o OAuth funcionar em desenvolvimento é necessário adicionar
> `http://localhost:8080/` como Redirect URI na OAuth Application
> (`git.inegi.up.pt` → Preferences → Applications → editar a app).

---

## Projecto GitLab

- **Repositório:** https://git.inegi.up.pt/umec/manufacturing_processes/planeamento
- **Project ID:** 192
- **Namespace:** `umec/manufacturing_processes`
