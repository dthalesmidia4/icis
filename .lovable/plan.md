

## Plano: Exigências de Conteúdo por Cliente

Sua ideia é excelente. Cada cliente tem um tom e estilo diferente, e hoje o prompt é genérico. Criar um campo de "Exigências de Conteúdo" por cliente resolve isso de forma simples e eficaz.

### O que será feito

1. **Novo campo no banco de dados**: Adicionar coluna `content_requirements` (text, nullable) na tabela `tenant_companies` para armazenar as exigências de conteúdo de cada cliente.

2. **Botão "Exigências de Conteúdo" no Hub do Cliente**: Um novo botão no ClientHub que abre um modal com um campo de texto para escrever/editar as exigências. Salva direto na `tenant_companies`.

3. **Injetar exigências na geração de período**: Na edge function `generate-period-plans`, buscar o `content_requirements` do cliente e incluir no contexto enviado à IA, algo como:
   ```
   Exigências do cliente: [texto das exigências]
   ```

4. **Injetar exigências na geração de posts/carrosséis**: Nas functions `auto-generate-post`, `auto-generate-carousel`, e `generate-standalone-post`, também incluir as exigências no prompt para que o conteúdo individual siga as regras do cliente.

### Fluxo do usuário

- Acessa o Hub do cliente (ex: DThales Veículos)
- Clica em "Exigências de Conteúdo"
- Escreve: "Posts devem ser super explicativos, com linguagem acessível e detalhamento técnico dos veículos"
- Salva
- Nas próximas gerações de período e conteúdo, a IA seguirá essas instruções

### Detalhes técnicos

- **Migration**: `ALTER TABLE tenant_companies ADD COLUMN content_requirements text;`
- **Edge Functions modificadas**: `generate-period-plans`, `auto-generate-post`, `auto-generate-carousel`, `generate-standalone-post`, `generate-carousel-content`
- **Contexto adicionado ao prompt**: Inserido como linha no bloco de contexto compacto, com prioridade alta para a IA respeitar

