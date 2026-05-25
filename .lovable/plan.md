## Objetivo
Gerar um arquivo `.zip` com **todos os anexos** do bucket `card-attachments`, organizados por cliente e card, disponível para download.

## Passos

1. **Listar metadados** na tabela `public.demands` (colunas `attachments` e `rejected_attachments`) para mapear `storagePath → {clienteNome, cardId, cardTitulo, nomeArquivo}`.
   - Buscar nome do cliente em `tenant_companies` via `client_id`.
   - Usar essa lista para nomear pastas de forma legível.

2. **Listar bucket** `card-attachments` recursivamente via Storage API (com `SERVICE_ROLE_KEY`) para capturar inclusive arquivos órfãos (não referenciados em `demands`).

3. **Baixar todos os arquivos** em paralelo (com limite de concorrência ~10) via signed URL ou download direto.

4. **Montar ZIP** com a estrutura:
   ```text
   {cliente-slug}/
     {cardTitulo-ou-cardId}/
       arquivo.ext
   _orfaos/
     {caminho-original-do-bucket}
   ```

5. **Salvar** em `/mnt/documents/card-attachments-YYYYMMDD.zip` e entregar via `<presentation-artifact>`.

## Notas técnicas
- Script Python único em `/tmp/`, usando `requests` + `zipfile` (streaming para evitar estouro de memória).
- Variáveis `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já disponíveis no sandbox.
- Sem alterações no código do app, sem migrações, sem novas edge functions.
- Se o ZIP final passar de ~1.5 GB, dividir em partes `_part1.zip`, `_part2.zip`.

## Riscos
- Volume pode ser grande (vídeos Veo). Mostro tamanho total antes de zipar e aviso se precisar dividir.
- Tempo de execução: rodo em background com timeout estendido se necessário.