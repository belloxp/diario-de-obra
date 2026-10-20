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

## 📄 Relatórios em PDF e assinatura (ZapSign)

Na aba **Relatórios**, cada relatório recebe numeração automática (001, 002…) por obra e é gerado em PDF com:

- **Capa** com brasão do estado (opção "SC" marcada por padrão), logo da empresa, objeto do contrato (escrito pelo usuário), período, empresa contratada e nº do relatório.
- **Páginas de fotos** do período agrupadas por categoria — "Geral" aparece sem título; as demais com o título em cima, 2 por linha com data/hora e observação.
- Botão **Assinar** → envia o PDF para o ZapSign e abre o link de assinatura; o status é atualizado por webhook (`POST /api/reports/zapsign/webhook`) ou pelo botão **Status**.

## 📝 Correção de texto (LanguageTool)

Por padrão usa a API pública gratuita (`LANGUAGETOOL_URL`), com limite de uso. Para uso sem limite, suba o LanguageTool em um servidor próprio (ex.: imagem Docker no Railway) e aponte `LANGUAGETOOL_URL` para `https://SEU-SERVICO/v2/check`. O sistema só mostra sugestões; nada é alterado sem o usuário clicar em "Aplicar".


<div align="center">
  Desenvolvido por <strong>Guilherme Bello</strong> · para JBSC Engenharia
</div>
