import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Mínimo de 6 caracteres")
});

export const signupSchema = z.object({
  // Dados da Empresa
  companyName: z.string()
    .min(3, "Nome muito curto")
    .max(100, "Nome muito longo"),
  fantasyName: z.string().optional(),
  cnpjCpf: z.string()
    .min(11, "CNPJ/CPF inválido")
    .max(18, "CNPJ/CPF inválido"),
  razaoSocial: z.string().optional(),
  
  // Contato e Localização
  corporateEmail: z.string().email("Email corporativo inválido"),
  phone: z.string().min(10, "Telefone inválido"),
  street: z.string().min(5, "Endereço incompleto"),
  city: z.string().min(3, "Cidade inválida"),
  state: z.string()
    .length(2, "Use a sigla do estado (ex: SP)")
    .toUpperCase(),
  zipCode: z.string().min(8, "CEP inválido"),
  country: z.string().default("Brasil"),
  website: z.string().url("URL inválida").optional().or(z.literal("")),
  
  // Perfil da Empresa
  sector: z.enum([
    "Serviços",
    "Comércio",
    "Indústria",
    "Saúde",
    "Educação",
    "Tecnologia",
    "Alimentação",
    "Moda e Beleza",
    "Construção",
    "Consultoria",
    "Outros"
  ], { errorMap: () => ({ message: "Selecione um setor válido" }) }),
  size: z.enum([
    "MEI",
    "Micro (até 9 funcionários)",
    "Pequena (10-49 funcionários)",
    "Média (50-249 funcionários)",
    "Grande (250+ funcionários)"
  ], { errorMap: () => ({ message: "Selecione um tamanho válido" }) }),
  productsServices: z.string()
    .min(10, "Descreva melhor seus produtos/serviços")
    .max(500, "Descrição muito longa"),
  
  // Dados do Administrador
  adminEmail: z.string().email("Email do administrador inválido"),
  adminName: z.string().min(3, "Nome muito curto"),
  adminPassword: z.string()
    .min(6, "A senha deve ter no mínimo 6 caracteres"),
  confirmPassword: z.string()
}).refine(data => data.adminPassword === data.confirmPassword, {
  message: "As senhas não coincidem",
  path: ["confirmPassword"]
});

export type LoginFormData = z.infer<typeof loginSchema>;
export type SignupFormData = z.infer<typeof signupSchema>;
