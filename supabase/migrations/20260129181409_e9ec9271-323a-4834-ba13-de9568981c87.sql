-- ============================================
-- CALENDÁRIO BRASILEIRO 2026
-- ============================================

-- Limpar eventos de 2026 se existirem (evita duplicação)
DELETE FROM public.br_calendar_events WHERE EXTRACT(YEAR FROM event_date) = 2026;

-- Inserir eventos de 2026 (usando apenas: holiday, marketing, awareness, seasonal)
INSERT INTO public.br_calendar_events (event_date, name, event_type, priority, description, marketing_tips) VALUES
-- JANEIRO 2026
('2026-01-01', 'Ano Novo', 'holiday', 95, 'Feriado nacional - Confraternização Universal', 'Mensagens de boas festas, metas do ano, novos começos'),
('2026-01-04', 'Dia Mundial do Braille', 'awareness', 40, 'Conscientização sobre acessibilidade', 'Conteúdo sobre inclusão e acessibilidade'),
('2026-01-25', 'Aniversário de São Paulo', 'holiday', 50, 'Feriado municipal em São Paulo', 'Para empresas paulistas: posts sobre a cidade'),

-- FEVEREIRO 2026
('2026-02-14', 'Valentine''s Day (EUA)', 'marketing', 60, 'Dia dos Namorados internacional', 'Para marcas internacionais ou nichos específicos'),
('2026-02-15', 'Carnaval - Domingo', 'holiday', 95, 'Carnaval 2026', 'Conteúdo festivo, pausar vendas pesadas, engajamento leve'),
('2026-02-16', 'Carnaval - Segunda', 'holiday', 95, 'Carnaval 2026', 'Conteúdo festivo, humor, bastidores'),
('2026-02-17', 'Carnaval - Terça (Mardi Gras)', 'holiday', 95, 'Terça-feira de Carnaval', 'Último dia de festa, posts de encerramento'),
('2026-02-18', 'Quarta-feira de Cinzas', 'holiday', 80, 'Início da Quaresma', 'Retomada pós-carnaval, detox, volta à rotina'),

-- MARÇO 2026
('2026-03-08', 'Dia Internacional da Mulher', 'marketing', 90, 'Celebração das mulheres', 'Homenagens, histórias de mulheres inspiradoras, promoções'),
('2026-03-15', 'Dia do Consumidor', 'marketing', 85, 'Dia mundial do consumidor', 'Promoções, ofertas especiais, valorização do cliente'),
('2026-03-20', 'Início do Outono', 'seasonal', 50, 'Equinócio de outono', 'Mudança de estação, novidades de outono'),
('2026-03-22', 'Dia Mundial da Água', 'awareness', 55, 'Conscientização ambiental', 'Sustentabilidade, responsabilidade ambiental'),

-- ABRIL 2026
('2026-04-03', 'Sexta-feira Santa', 'holiday', 90, 'Feriado religioso - Paixão de Cristo', 'Respeito ao feriado, mensagens de reflexão'),
('2026-04-05', 'Páscoa', 'holiday', 90, 'Domingo de Páscoa', 'Renovação, família, chocolates (para nichos relevantes)'),
('2026-04-21', 'Tiradentes', 'holiday', 75, 'Feriado nacional', 'Posts sobre história, feriado prolongado'),
('2026-04-22', 'Dia da Terra', 'awareness', 60, 'Conscientização ambiental', 'Sustentabilidade, ESG, meio ambiente'),
('2026-04-23', 'Dia Mundial do Livro', 'awareness', 50, 'Celebração da leitura', 'Recomendações, conhecimento, aprendizado'),

-- MAIO 2026
('2026-05-01', 'Dia do Trabalho', 'holiday', 85, 'Feriado nacional', 'Valorização do trabalho, equipe, conquistas'),
('2026-05-10', 'Dia das Mães', 'marketing', 98, 'Segundo domingo de maio', 'Homenagens, presentes, promoções, conteúdo emocional'),
('2026-05-25', 'Dia do Orgulho Nerd', 'marketing', 45, 'Cultura geek', 'Para nichos tech, games, cultura pop'),

-- JUNHO 2026
('2026-06-04', 'Corpus Christi', 'holiday', 75, 'Feriado religioso (ponto facultativo em muitas cidades)', 'Feriado prolongado, viagens'),
('2026-06-12', 'Dia dos Namorados', 'marketing', 98, 'Dia dos namorados no Brasil', 'Promoções românticas, presentes, casais'),
('2026-06-13', 'Dia de Santo Antônio - Festas Juninas', 'marketing', 50, 'Festas juninas', 'Início das festas juninas'),
('2026-06-21', 'Início do Inverno', 'seasonal', 50, 'Solstício de inverno', 'Produtos de inverno, aconchego'),
('2026-06-24', 'São João - Festas Juninas', 'marketing', 70, 'Festas juninas', 'Festas, arraial, comidas típicas'),
('2026-06-29', 'São Pedro - Festas Juninas', 'marketing', 60, 'Festas juninas', 'Encerramento das festas juninas'),

-- JULHO 2026
('2026-07-09', 'Revolução Constitucionalista (SP)', 'holiday', 50, 'Feriado em SP', 'Para empresas paulistas'),
('2026-07-20', 'Dia do Amigo', 'marketing', 70, 'Celebração da amizade', 'Indicações, parcerias, networking'),
('2026-07-26', 'Dia dos Avós', 'marketing', 65, 'Homenagem aos avós', 'Família, gerações, histórias'),

-- AGOSTO 2026
('2026-08-09', 'Dia dos Pais', 'marketing', 95, 'Segundo domingo de agosto', 'Promoções, presentes, homenagens'),
('2026-08-11', 'Dia do Estudante', 'awareness', 55, 'Celebração dos estudantes', 'Educação, aprendizado, jovens'),
('2026-08-22', 'Dia do Folclore', 'awareness', 45, 'Cultura brasileira', 'Tradições, lendas, cultura popular'),
('2026-08-25', 'Dia do Soldado', 'awareness', 40, 'Homenagem às forças armadas', 'Patriotismo, serviço'),

-- SETEMBRO 2026
('2026-09-07', 'Independência do Brasil', 'holiday', 85, 'Feriado nacional', 'Patriotismo, verde-amarelo, história'),
('2026-09-15', 'Dia do Cliente', 'marketing', 85, 'Celebração do cliente', 'Promoções, agradecimentos, fidelização'),
('2026-09-21', 'Dia da Árvore', 'awareness', 50, 'Consciência ambiental', 'Sustentabilidade, plantio, ESG'),
('2026-09-22', 'Início da Primavera', 'seasonal', 55, 'Equinócio de primavera', 'Renovação, flores, novidades'),

-- OUTUBRO 2026
('2026-10-12', 'Dia das Crianças e Nossa Senhora Aparecida', 'holiday', 95, 'Feriado + dia comercial', 'Promoções infantis, família, diversão, fé'),
('2026-10-15', 'Dia do Professor', 'awareness', 65, 'Homenagem aos educadores', 'Educação, gratidão, aprendizado'),
('2026-10-31', 'Halloween', 'marketing', 60, 'Dia das Bruxas', 'Para nichos relevantes: terror, fantasia, doces'),

-- NOVEMBRO 2026
('2026-11-02', 'Finados', 'holiday', 70, 'Feriado religioso', 'Respeito, memória, reflexão'),
('2026-11-15', 'Proclamação da República', 'holiday', 75, 'Feriado nacional', 'História, civismo'),
('2026-11-20', 'Consciência Negra', 'holiday', 80, 'Feriado em diversos estados', 'Diversidade, inclusão, história afro-brasileira'),
('2026-11-27', 'Black Friday', 'marketing', 99, 'Maior evento de vendas do ano', 'MÁXIMAS promoções, urgência, descontos agressivos'),
('2026-11-30', 'Cyber Monday', 'marketing', 85, 'Extensão da Black Friday online', 'Promoções digitais, tech, e-commerce'),

-- DEZEMBRO 2026
('2026-12-08', 'Nossa Senhora da Conceição', 'holiday', 50, 'Feriado em alguns estados', 'Para regiões específicas'),
('2026-12-24', 'Véspera de Natal', 'marketing', 90, 'Preparação para o Natal', 'Últimas compras, mensagens natalinas'),
('2026-12-25', 'Natal', 'holiday', 98, 'Feriado nacional', 'Família, presentes, gratidão, encerramento do ano'),
('2026-12-31', 'Réveillon', 'holiday', 95, 'Último dia do ano', 'Retrospectiva, agradecimentos, expectativas para 2027');

-- ============================================
-- TRIGGER PARA CALCULAR FINGERPRINT AUTOMATICAMENTE
-- ============================================

-- Criar função para o trigger
CREATE OR REPLACE FUNCTION public.auto_generate_fingerprint()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Se o fingerprint está vazio ou é nulo, calcular automaticamente
  IF NEW.fingerprint IS NULL OR NEW.fingerprint = '' THEN
    NEW.fingerprint := generate_demand_fingerprint(
      NEW.title,
      NEW.demand_type,
      NEW.channel
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Criar o trigger na tabela demand_fingerprints
DROP TRIGGER IF EXISTS trigger_auto_fingerprint ON public.demand_fingerprints;
CREATE TRIGGER trigger_auto_fingerprint
  BEFORE INSERT OR UPDATE ON public.demand_fingerprints
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_generate_fingerprint();

-- Atualizar fingerprints existentes que estão vazios
UPDATE public.demand_fingerprints
SET fingerprint = generate_demand_fingerprint(title, demand_type, channel)
WHERE fingerprint IS NULL OR fingerprint = '';