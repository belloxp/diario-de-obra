<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="apps/web/public/brand/logo-white.png" />
  <img src="apps/web/public/brand/logo-black.png" alt="JBSC Engenharia" width="300" />
</picture>

# Diário de Obra

**Relatório fotográfico, diário de obra e controle pluviométrico — tudo em um só lugar.**

Sistema web para supervisão e acompanhamento de obras, pensado para uso direto do celular em campo.

<p>
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-22-5FA04E?logo=nodedotjs&logoColor=white" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" />
  <img alt="Fastify" src="https://img.shields.io/badge/Fastify-5-000000?logo=fastify&logoColor=white" />
  <img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" />
  <img alt="Vite" src="https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white" />
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white" />
</p>

</div>

---

## Visão geral

O sistema organiza o dia a dia da obra em quatro eixos, com login por perfis (administrador e funcionário) e registro de todas as ações (autor, data e hora).

| Módulo | O que faz |
| --- | --- |
| 📸 **Relatório fotográfico** | Fotos enviadas direto do navegador/celular para o Cloudflare R2, organizadas por categoria (equipe), com data/hora e observação. |
| 📓 **Diário de obra** | Registro diário em texto, com autoria e histórico de edição. |
| 🌧️ **Controle pluviométrico** | Marcação de chuva por dia (mm), calendário mensal, heatmap anual no painel e exportação para planilha `.xlsx`. |
| 📄 **Relatórios em PDF** | Geração do relatório fotográfico (capa + fotos por categoria) com numeração automática e **assinatura digital via ZapSign**. |

Ainda inclui tela de **Atividades** (último acesso, última ação e histórico de cada usuário), **tema claro/escuro** e correção de ortografia/acentuação **sem IA** (LanguageTool), apenas como sugestão.

## 🧱 Stack

- **API:** Node.js 22 · Fastify · TypeScript · PostgreSQL (`pg`) · Zod
- **Front:** React 19 · Vite · TypeScript · TanStack Query · React Router
- **Arquivos:** Cloudflare R2 (upload por URL assinada, direto do navegador)
- **PDF & Assinatura:** PDFKit + ZapSign
- **Planilhas:** ExcelJS

## 📁 Estrutura

```
diario-de-obra/
├─ apps/
│  ├─ api/            # Fastify + PostgreSQL (autenticação, fotos, diário, chuva, relatórios)
│  │  └─ src/
│  │     ├─ routes/   # auth, users, projects, photos, diary, rain, reports, ...
│  │     ├─ pdf.ts    # geração do relatório em PDF
│  │     └─ zapsign.ts# integração de assinatura digital
│  └─ web/            # React + Vite (painel, galeria, calendário, relatórios)
│     └─ src/
│        ├─ pages/
│        └─ components/
└─ package.json       # workspaces (npm)
```

## 🚀 Rodando localmente

```bash
npm install                                 # na raiz (instala API e front)
cp apps/api/.env.example apps/api/.env       # preencha DATABASE_URL, JWT_SECRET, R2_* e SEED_ADMIN_*
npm run dev:api                              # http://localhost:3333  (cria as tabelas e o admin inicial sozinho)
npm run dev:web                              # http://localhost:5173  (proxy de /api para a API)
```

> Precisa de um PostgreSQL acessível. Em desenvolvimento, o Vite faz proxy de `/api` para a API, sem CORS.

## 🔧 Variáveis de ambiente (API)

| Variável | Descrição |
| --- | --- |
| `DATABASE_URL` | String de conexão do PostgreSQL. |
| `JWT_SECRET` | Chave para assinar os tokens (mín. 16 caracteres). |
| `CORS_ORIGIN` | Origem(ns) do front, separadas por vírgula. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Credenciais do Cloudflare R2. |
| `LANGUAGETOOL_URL` | Endpoint do LanguageTool (padrão: API pública gratuita). |
| `ZAPSIGN_API_TOKEN` | Token do ZapSign (sem ele, o PDF é gerado mas não é enviado para assinatura). |
| `ZAPSIGN_SIGNER_NAME`, `ZAPSIGN_SIGNER_EMAIL` | Signatário padrão dos relatórios. |
| `SEED_ADMIN_NAME`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | Administrador criado no primeiro boot. |

## ☁️ Cloudflare R2

1. Crie o bucket e um token de API (Object Read & Write) no painel do R2.
2. Preencha as variáveis `R2_*`.
3. **CORS do bucket** (necessário para o upload direto do navegador): permita `PUT` e `GET` a partir das origens do front, com o cabeçalho `Content-Type`:

```json
[
  {
    "AllowedOrigins": ["http://localhost:5173", "https://SEU-FRONT.com.br"],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedHeaders": ["Content-Type"],
    "MaxAgeSeconds": 3600
  }
]
```

O bucket permanece privado: as fotos são exibidas por URLs assinadas temporárias.

## 📄 Relatórios em PDF e assinatura (ZapSign)

Na aba **Relatórios**, cada relatório recebe numeração automática (001, 002…) por obra e é gerado em PDF com:

- **Capa** com brasão do estado (opção "SC" marcada por padrão), logo da empresa, objeto do contrato (escrito pelo usuário), período, empresa contratada e nº do relatório.
- **Páginas de fotos** do período agrupadas por categoria — "Geral" aparece sem título; as demais com o título em cima, 2 por linha com data/hora e observação.
- Botão **Assinar** → envia o PDF para o ZapSign e abre o link de assinatura; o status é atualizado por webhook (`POST /api/reports/zapsign/webhook`) ou pelo botão **Status**.

> As logos (`estado-sc.png` e `logo-black.png`) ficam em `apps/web/public/brand/` — basta substituir pelos arquivos oficiais.

## 📝 Correção de texto (LanguageTool)

Por padrão usa a API pública gratuita (`LANGUAGETOOL_URL`), com limite de uso. Para uso sem limite, suba o LanguageTool em um servidor próprio (ex.: imagem Docker no Railway) e aponte `LANGUAGETOOL_URL` para `https://SEU-SERVICO/v2/check`. O sistema só mostra sugestões; nada é alterado sem o usuário clicar em "Aplicar".

## 🔐 Regras de permissão

- **Administrador:** tudo, incluindo usuários, obras, categorias e a tela de Atividades.
- **Funcionário:** envia fotos, escreve no diário e marca chuva; edita/exclui apenas o que ele mesmo criou. A marcação de chuva de um dia pode ser corrigida por qualquer usuário (fica registrado quem alterou).
- Toda ação relevante (criar, editar, excluir, login) fica registrada com autor, data e hora.

## 🚢 Deploy

- **API** (Railway ou similar): `npm run build -w apps/api` e `npm run start -w apps/api`. Variáveis conforme `apps/api/.env.example`; `CORS_ORIGIN` = URL do front.
- **Front** (Vercel ou similar): diretório `apps/web`, build `npm run build`, saída `dist`. Defina `VITE_API_URL` com a URL da API. Como é uma SPA, redirecione todas as rotas para `index.html`.

---

<div align="center">
  Desenvolvido por <strong>Guilherme Bello</strong> · JBSC Engenharia
</div>
