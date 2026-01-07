-- Migrar cards com status "pendente" para "agendar_publicacao"
UPDATE public.cards 
SET status = 'agendar_publicacao', column_name = 'Agendar Publicação'
WHERE status = 'pendente' OR column_name = 'Pendente';

-- Atualizar cards que tinham status legados mapeados para "pendente"
UPDATE public.cards 
SET status = 'agendar_publicacao', column_name = 'Agendar Publicação'
WHERE status IN ('desenvolvimento_pausado', 'implantacao_pausada', 'a_fazer', 'conteudo_programado');