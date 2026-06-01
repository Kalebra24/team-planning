# Guia de Utilização — Planeamento de Recursos

**URL:** https://gitpages.inegi.up.pt/planeamento-d9a840/

---

## Índice

1. [Acesso e sessão](#1-acesso-e-sessão)
2. [Cabeçalho e navegação](#2-cabeçalho-e-navegação)
3. [Dashboard](#3-dashboard)
4. [Alocações](#4-alocações)
5. [Heatmap](#5-heatmap)
6. [Timeline](#6-timeline-gantt)
7. [Por Projeto](#7-por-projeto)
8. [Equipa](#8-equipa)
9. [Arquivo](#9-arquivo)
10. [Dados — Importar e Exportar](#10-dados--importar-e-exportar)

---

## 1. Acesso e Sessão

### Abrir a aplicação
Acede ao URL acima num browser. A aplicação carrega em modo de **leitura** — podes consultar tudo sem fazer login.

### Iniciar sessão para editar
Para fazer qualquer alteração é necessário ter sessão activa.

1. Clica **Entrar** (canto superior direito)
2. Serás redireccionado para o login do GitLab (`git.inegi.up.pt`)
3. Autentica com as tuas credenciais da empresa
4. Volta à aplicação automaticamente com sessão iniciada

> O teu username GitLab aparece no cabeçalho. Na próxima visita o login é automático — não precisas de repetir este passo.

### Terminar sessão
Clica **Sair** no canto superior direito. O teu checkout fica registado no histórico de alterações.

### Modo de leitura
Enquanto não tiveres sessão activa, aparece uma barra amarela no topo:
> 🔒 **Modo de leitura** — inicia sessão para fazer alterações.

Qualquer tentativa de edição redireccionará automaticamente para o login.

---

## 2. Cabeçalho e Navegação

```
[Planeamento de Recursos]  [● jsilva  Sair]  [Dados ▾]  [↑ Submeter Plano]  [+ Nova Alocação]
─────────────────────────────────────────────────────────────────────────────────────────────
[Dashboard] [Alocações] [Heatmap] [Timeline] [Por Projeto] [Equipa] [Arquivo]
```

| Elemento | Função |
|---|---|
| **Entrar / Sair** | Login com conta GitLab / terminar sessão |
| **Dados ▾** | Menu de importação, exportação e diário de alterações |
| **↑ Submeter Plano** | Guardar snapshot do estado actual no Arquivo |
| **+ Nova Alocação** | Criar um novo registo de alocação |
| **Tabs** | Navegar entre as diferentes vistas |

---

## 3. Dashboard

Vista de resumo executivo do estado actual do planeamento.

### Indicadores de topo (4 cartões)

| Cartão | Significado |
|---|---|
| **Utilização média** | % média de utilização de toda a equipa no mês actual |
| **Em risco** | Pessoas sem alocação nos próximos 3 meses (lacuna de trabalho) |
| **Sobrealocações >110%** | Pessoas e meses com carga superior a 110% da capacidade |
| *(4.º cartão)* | Número de pessoas com capacidade definida |

### Próximo mês
Painel com a carga planeada por pessoa para o mês seguinte.

| Cor | Significado |
|---|---|
| 🟢 Verde | ≤ 95% da capacidade — bem |
| 🟡 Âmbar | 96–110% — atenção |
| 🔴 Vermelho | > 110% — sobrealocado |
| ⬜ Cinzento | 0% — sem alocação |

### Capacidade vs Alocação
Gráfico de barras por pessoa. Selecciona o **ano** e o **mês** (ou "Média anual") nos selectores do canto superior direito do cartão.

---

## 4. Alocações

Tabela principal com todos os registos de alocação.

### Filtros e pesquisa
- **Caixa de pesquisa** — filtra por pessoa, projecto ou texto da tarefa
- **Dropdown Pessoa** — mostra só registos de uma pessoa
- **Dropdown Projecto** — mostra só registos de um projecto

### Criar uma alocação
1. Clica **+ Nova Alocação** (canto superior direito)
2. Preenche o formulário:

| Campo | Obrigatório | Notas |
|---|---|---|
| **Pessoa** | ✅ | Lista das pessoas em Equipa |
| **Projecto** | ✅ | Lista dos projectos activos |
| **WP** | — | Work Package (ex: WP3) |
| **Atividade** | — | Referência da tarefa (ex: T3.2) |
| **Início / Fim** | ✅ | Mês de início e mês de fim |
| **Horas totais** | ✅ | Total de horas no período |
| **Distribuição** | — | Automática (uniforme) por omissão |

3. Clica **Guardar**

> Para distribuir horas de forma desigual pelos meses, usa a secção **Distribuição mês a mês** no formulário.

### Editar uma alocação
Clica no botão **Editar** na linha da tabela.

### Eliminar uma alocação
Abre a alocação para edição e clica **Eliminar** (botão vermelho no fundo do formulário). Pede confirmação.

### Limpar todas as alocações
Botão **Limpar Tudo** (vermelho, canto superior direito da tabela). Remove todos os registos mas mantém pessoas, projectos e capacidades. Pede confirmação.

---

## 5. Heatmap

Mapa de calor de utilização — **pessoa × mês**.

### Escala de cores

| Cor | Intervalo | Significado |
|---|---|---|
| ⬜ Neutro | 0–25% | Subutilizado |
| 🟢 Verde claro | 26–75% | Utilização normal |
| 🟢 Verde escuro | 76–95% | Bem alocado |
| 🟡 Âmbar | 96–110% | Quase no limite |
| 🔴 Vermelho | > 110% | Sobrealocado |

### Seleccionar período
- Usa os campos **De** e **Até** para definir o intervalo
- Ou usa os **atalhos rápidos**: Próximos 12 meses / Próximos 6 meses / Ano actual

### Detalhe de uma célula
Clica em qualquer célula do heatmap para ver o detalhe das alocações daquela pessoa naquele mês (projectos, horas, % utilização).

---

## 6. Timeline (Gantt)

Vista de Gantt das alocações por pessoa.

### Navegar no tempo
- Campos **De / Até** ou atalhos rápidos (igual ao Heatmap)

### Filtrar
- **Pessoas** — selecciona uma ou mais pessoas
- **Projectos** — selecciona um ou mais projectos
- **Limpar filtros** — repõe todos

### Unidade de visualização
- **PM** — Person-Month (fracção de mês)
- **Horas** — horas absolutas

### Mover uma alocação (drag)
Arrasta a barra horizontalmente para alterar as datas de início/fim.
> Ao largar, aparece uma caixa de diálogo a perguntar se queres redistribuir as horas automaticamente ou editar mês-a-mês.

### Redimensionar uma alocação
Arrasta a pega no extremo direito da barra para alterar o mês de fim.

### Editar uma alocação
Clica sobre a barra para abrir o formulário de edição.

### Mostrar mensais
Activa o toggle **Mostrar mensais** para ver e editar o valor de cada mês directamente na barra do Gantt.

---

## 7. Por Projeto

Vista de distribuição de horas e pessoas por projecto.

### Donut chart
Mostra a proporção de horas planeadas por projecto no ano seleccionado.

### Matriz pessoa × projecto
Tabela cruzada com as horas planeadas de cada pessoa em cada projecto, no período.

### Catálogo de projectos
Lista de todos os projectos.

- **Activar/desactivar projecto** — clica no nome. Projectos inactivos não aparecem nos dropdowns de nova alocação.
- **Ocultar/mostrar projecto** — botão **🙈 Ocultar / 👁 Mostrar** em cada linha. As alocações ficam guardadas mas são excluídas de todas as vistas e métricas enquanto o projecto estiver oculto.
- **Adicionar projecto** — escreve o nome no campo e clica **+ Adicionar**
- **Eliminar projecto** — ícone 🗑️ (pede confirmação extra se o projecto tiver alocações associadas)

> **Diferença entre inativo e oculto**
>
> | Estado | Aparece nos dropdowns | Alocações contam nas métricas |
> |---|---|---|
> | Ativo | ✅ | ✅ |
> | Inativo | ❌ | ✅ |
> | Oculto | ✅ | ❌ |
>
> Usa **oculto** para projectos em planeamento provisório — as alocações ficam registadas mas não distorcem as métricas da equipa. Quando o projecto for confirmado, clica **👁 Mostrar** para as incluir novamente.

Quando há projectos ocultos, aparece um aviso amarelo no **Dashboard** e no **Heatmap** com um atalho para gerir os projectos.

---

## 8. Equipa

Gestão das pessoas da equipa e das suas capacidades mensais.

### Membros da equipa
- **Adicionar pessoa** — escreve o nome, define a capacidade mensal por omissão (padrão: 140h) e clica **+ Adicionar**
- **Eliminar pessoa** — ícone 🗑️ (só pessoas sem alocações activas)

### Capacidade mensal
Tabela editável com as horas disponíveis por pessoa × mês.

- Selecciona o **ano** no selector do canto superior direito
- Clica numa célula e edita directamente
- Célula vazia = 140h (valor por omissão)
- Guarda automaticamente ao sair da célula

> As capacidades são usadas para calcular as percentagens de utilização no Heatmap e Dashboard.

---

## 9. Arquivo

Histórico de snapshots mensais do plano.

### Submeter um plano
1. Quando o plano do mês estiver finalizado, clica **↑ Submeter Plano** (cabeçalho ou tab Arquivo)
2. Selecciona o **mês do plano**
3. Adiciona uma **nota** opcional (ex: "após revisão dos chefes de equipa")
4. Clica **Guardar no arquivo**

O snapshot guarda o estado completo: pessoas, projectos, capacidades e todas as alocações.

### Consultar um plano arquivado
Clica **Ver** na linha do plano pretendido. Abre uma vista de leitura do estado nessa data.

### Restaurar um plano arquivado
Na vista de detalhe do plano, clica **Restaurar estado**. O estado actual é substituído pelo snapshot. Pede confirmação.

> ⚠️ Restaurar substitui permanentemente os dados actuais. Faz um backup (Dados → Descarregar JSON) antes se necessário.

### Eliminar um plano arquivado
Na vista de detalhe, clica **Eliminar do arquivo**.

---

## 10. Dados — Importar e Exportar

Acessível pelo menu **Dados ▾** no cabeçalho.

### Backup / Restauro JSON

| Opção | Uso |
|---|---|
| **↓ Descarregar JSON** | Backup completo do estado actual num ficheiro `.json` |
| **↑ Carregar JSON** | Repõe ou mescla dados a partir de um ficheiro `.json` |

Ao carregar um JSON tens duas opções:
- **Substituir tudo** — apaga os dados actuais e usa os do ficheiro
- **Mesclar inteligente** — mantém os registos mais recentes em caso de conflito

### Excel (formato Assignment)

| Opção | Uso |
|---|---|
| **↑ Importar Excel** | Carrega o ficheiro `.xlsx` de planeamento original |
| **↓ Exportar Excel** | Gera um `.xlsx` com todas as alocações actuais |

### Férias e Ausências

| Opção | Uso |
|---|---|
| **📅 Importar Mapa de Férias** | Carrega o ficheiro HTML exportado do SIGEI; actualiza automaticamente as capacidades mensais (ausências reduzem a capacidade a 8h/dia) |
| **📂 Importar CSV de Alocações** | Importa alocações a partir de um ficheiro CSV com colunas de PM por mês |

### Relatório Visual

**📊 Relatório Visual** — gera um relatório de 3 páginas (resumo executivo, heatmap, matriz pessoa × projecto) optimizado para impressão em PDF.

### Diário de Alterações
**⧗ Diário de alterações** — mostra todas as modificações registadas, com o autor (username GitLab), o tipo de operação (criado / editado / eliminado) e a data/hora.

Quando inicias sessão, o diário abre automaticamente a mostrar apenas o que mudou **desde a tua última sessão**.

---

## Atalhos de Teclado

| Tecla | Ação |
|---|---|
| `Esc` | Fechar modal/diálogo aberto |
| `Enter` | Confirmar formulário activo |
| `Ctrl+Z` | Desfazer a última ação |

---

## Perguntas Frequentes

**As minhas alterações são guardadas automaticamente?**
Sim. Cada operação (criar, editar, eliminar) guarda imediatamente no servidor. Não há botão "Guardar".

**Posso usar em simultâneo com colegas?**
Sim. A aplicação mostra no cabeçalho quem mais está activo (indicador de presença). Se abrires uma alocação para edição e outro utilizador a alterar entretanto, recebes um aviso antes de guardar — podes confirmar a sobreposição ou cancelar para reveres as mudanças remotas.

**O que acontece se fechar o browser sem fazer Sair?**
Os dados ficam guardados. A tua sessão fica marcada como activa até fazeres Sair explicitamente ou o token expirar (~2h).

**Perdi dados / fiz algo errado. Como reverter?**
Antes de cada acção destrutiva (Restaurar, Limpar Tudo, Substituir JSON), a aplicação cria automaticamente um backup local. Usa **Dados → Recuperar backup automático** para repor o estado imediatamente anterior. Para perdas mais antigas, usa o **Arquivo** se tinhas um snapshot, ou **Dados → Carregar JSON** se tens um backup manual.
