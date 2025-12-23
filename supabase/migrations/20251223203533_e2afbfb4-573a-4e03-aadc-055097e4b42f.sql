-- Atualizar os nomes das colunas nos cards existentes
UPDATE public.cards SET column_name = 'Pendente' WHERE column_name = 'A Fazer';
UPDATE public.cards SET column_name = 'Em Produção' WHERE column_name = 'Em Andamento';
UPDATE public.cards SET column_name = 'Revisão' WHERE column_name = 'Conteúdo Programado';

-- Atualizar os status antigos para os novos valores
UPDATE public.cards SET status = 'pendente' WHERE status = 'a_fazer';
UPDATE public.cards SET status = 'em_producao' WHERE status = 'em_andamento';
UPDATE public.cards SET status = 'revisao' WHERE status = 'conteudo_programado';