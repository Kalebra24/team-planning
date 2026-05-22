# Planeamento de Recursos · Equipa Processos

Aplicação web de planeamento de recursos humanos para a Equipa de Processos do INEGI.
Gere alocações mensais por pessoa e projeto, deteta sobrealocações, arquiva planos mensais
e regista todas as alterações com identificação do autor.

**URL da aplicação:** https://gitpages.inegi.up.pt/planeamento-d9a840/

---

## Funcionalidades

| Vista | O que faz |
|---|---|
| **Dashboard** | Utilização média, pessoas em risco, próximo mês, sobrealocações |
| **Alocações** | Tabela CRUD — pessoa, projeto, WP, tarefa, datas, horas |
| **Heatmap** | Mapa de calor utilização × mês (5 níveis de cor) |
| **Timeline** | Gantt arrastável e redimensionável por pessoa |
| **Por Projeto** | Resumo de horas e PM por projeto e mês |
| **Equipa** | Edição de capacidades mensais por pessoa |
| **Arquivo** | Snapshots mensais do plano para consulta histórica |

---

## Arquitectura

```
index.html  (aplicação completa — HTML + CSS + JS num único ficheiro)
data/
  state.json  (base de dados da aplicação — lida/escrita via GitLab API)
.gitlab-ci.yml  (deploy automático para GitLab Pages)
```

### Stack

| Componente | Tecnologia |
|---|---|
| Frontend | HTML / CSS / JavaScript vanilla |
| Persistência | GitLab Repository Files API (`data/state.json`) |
| Autenticação | GitLab OAuth 2.0 com PKCE |
| Hosting | GitLab Pages (`gitpages.inegi.up.pt`) |
| CI/CD | GitLab Runner (shell, Windows) |

Não existe servidor de aplicação. O `index.html` é um ficheiro estático; os dados são
lidos e escritos directamente no repositório através da GitLab API, usando um
*project access token* para leitura/escrita e OAuth para identificar o utilizador.

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
- **Dados → Exportar JSON / Excel** — exporta o estado actual
- **Submeter Plano** — guarda um snapshot do mês no Arquivo

---

## Estrutura do `data/state.json`

```json
{
  "workers":   ["Nome Apelido", ...],
  "projects":  [{ "name": "...", "active": true }, ...],
  "records":   [{ "id": "rec_...", "worker": "...", "project": "...",
                  "start": "YYYY-MM", "end": "YYYY-MM",
                  "totalHours": 0, "monthsHours": {"YYYY-MM": 0} }],
  "capacity":  { "Nome Apelido": { "YYYY-MM": 140 } },
  "config":    { "editorInitials": "...", "plan_snapshots": [...] },
  "changelog": [{ "user_initials": "jsilva", "action": "update", ... }],
  "sessions":  [{ "user_initials": "jsilva", "checked_in_at": "...", ... }]
}
```

---

## CI/CD — Deploy automático

O ficheiro `.gitlab-ci.yml` configura um pipeline com um único job (`pages`) que:
1. Copia `index.html` para `public/`
2. Faz upload do artefacto para o GitLab Pages

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
não pode ser forjada.

---

## Acesso à API GitLab

A leitura e escrita do `data/state.json` usa um **Project Access Token** com scope `api`,
hardcoded no `index.html` (equivalente à *anon key* do Supabase — visível no source,
mas com acesso limitado a este projecto).

Para regenerar o token: **Settings → Access Tokens → app-token**.

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
