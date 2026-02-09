

## Renomear pagina CentralKanban para Scheduled e URL para /scheduled

### Resumo
Renomear o componente da pagina `/content-schedule` (que exibe demandas agendadas) de `CentralKanban.tsx` para `Scheduled.tsx`, e atualizar a URL de `/content-schedule` para `/scheduled` em todos os lugares do sistema.

### Alteracoes

**1. Renomear o arquivo do componente**
- `src/components/CentralKanban.tsx` -> `src/components/Scheduled.tsx`
- Renomear o componente interno de `CentralKanban` para `Scheduled`
- Manter export default

**2. Atualizar `src/pages/Kanban.tsx`**
- Trocar o import de `CentralKanban` para `Scheduled` (de `@/components/Scheduled`)
- Trocar `<CentralKanban />` para `<Scheduled />`

**3. Atualizar `src/App.tsx`**
- Trocar a rota de `/content-schedule` para `/scheduled`
- (O import de `Kanban` da pagina nao muda, pois `Kanban.tsx` continua como wrapper)

**4. Atualizar `src/pages/Home.tsx`**
- Trocar `route: "/content-schedule"` para `route: "/scheduled"` no card de Agendamento

**5. Atualizar `src/pages/Schedule.tsx`**
- Trocar `href="/content-schedule"` para `href="/scheduled"`
- Trocar `navigate("/content-schedule")` para `navigate("/scheduled")`

### Arquivos que NAO precisam mudar
- `src/pages/KanbanCentralPage.tsx` - usa sua propria interface `CentralKanbanCard` independente (nao importa de `CentralKanban.tsx`)
- `src/components/AppSidebar.tsx` - nao referencia `/content-schedule`

### Resultado
- URL `/scheduled` funcional
- Componente com nome `Scheduled.tsx` mais descritivo
- Nenhum fluxo quebrado

