## 1. Erro 500 ao clicar "Gerar carrossel com IA"

Causa confirmada nos logs da edge function `auto-generate-carousel` (é essa que o botão do card chama, em `src/components/TaskCard.tsx`): todos os slides falham com `Slide N error: Chave OpenAI ausente.`

Motivo no código: a função busca as duas chaves (`GOOGLE_API_KEY` e `OPENAI_API_KEY`, ambas existentes na tabela `api_keys`), mas ao chamar `generateCarouselSlideImages` passa apenas `googleApiKey` — sem `openaiApiKey` e sem `aiModel`. O runner então usa o modelo padrão (`gpt-image-2`, provider OpenAI) e aborta por falta da chave, resultando em 0 imagens e resposta 500.

Correção em `supabase/functions/auto-generate-carousel/index.ts`:

- Passar `openaiApiKey: OPENAI_API_KEY` e `aiModel: DEFAULT_IMAGE_MODEL` (gpt2, conforme padrão do projeto) na chamada de `generateCarouselSlideImages`.
- Importar `DEFAULT_IMAGE_MODEL` de `../_shared/models.ts`.
- Deploy da função e teste real de geração em um card de carrossel, verificando os logs para confirmar que os slides geram sem o erro de chave.

Também vou conferir se `auto-generate-post` / demais chamadores do runner sofrem do mesmo esquecimento e aplicar o mesmo ajuste onde faltar.

## 2. Evolução das Demandas: "Publicar agendado" mais discreto

Arquivo: `src/pages/ClientEvolution.tsx` (componente da linha da tabela).

- Aplicar a mesma atenuação usada em concluídas: `isDone || isScheduledPublish → opacity-70`.
- Não aplicar o realce vermelho de atraso (`bg-destructive/5`) quando `isScheduledPublish` for verdadeiro — hoje uma linha agendada aparece em vermelho no print, competindo visualmente.
- Suavizar o texto da etapa: "Publicar agendado" passa de `text-sky-600 font-medium` para um tom mais discreto (sky com menor peso/saturação), próximo do visual de "Concluída".
- Coluna "Próxima": exibir "—" também quando agendado (hoje mostra "Revisar publicação"), igual às concluídas.
- Chips de produção (Ini/Fim) das linhas agendadas ficam no estilo neutro, sem vermelho de atraso.

Sem mudanças de dados ou de fluxo — apenas apresentação.

## Verificação

- Build passa.
- Card de carrossel: "Gerar carrossel com IA" conclui e anexa as imagens; logs sem "Chave OpenAI ausente".
- Evolução: linhas "Publicar agendado" com aparência atenuada como as concluídas, sem fundo vermelho.
