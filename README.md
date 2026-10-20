# Diário de Obra

Sistema web para registro de obras em três eixos:

1. **Relatório fotográfico** — fotos enviadas direto do navegador/celular para o Cloudflare R2, organizadas por categoria (equipe), com data/hora e observação.
2. **Diário de obra** — registro diário em texto, com autoria e histórico de edição.
3. **Controle pluviométrico** — marcação de chuva por dia (mm), calendário mensal e exportação para planilha (.xlsx).

Além disso: login com perfis (administrador e funcionário), tela de **Atividades** para o administrador acompanhar último acesso, última ação e todo o histórico de cada usuário, e correção de ortografia/acentuação **sem IA** (LanguageTool), apenas como sugestão.

## Stack

- API: Node.js 22 + Fastify + TypeScript + PostgreSQL (`pg`)
- Front: React + Vite + TypeScript
- Arquivos: Cloudflare R2 (upload por URL assinada, direto do navegador)

## Rodando localmente

```bash
npm install                       # na raiz (instala API e front)
cp apps/api/.env.example apps/api/.env   # preencha DATABASE_URL, JWT_SECRET, R2_* e SEED_ADMIN_*
npm run dev:api                   # http://localhost:3333  (cria as tabelas e o admin inicial sozinho)
npm run dev:web                   # http://localhost:5173  (proxy de /api para a API)
```

## Cloudflare R2

1. Crie o bucket e um token de API (Object Read & Write) no painel do R2.
2. Preencha `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` e `R2_BUCKET`.
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

## Correção de texto (LanguageTool)

Por padrão usa a API pública gratuita (`LANGUAGETOOL_URL`), que tem limite de uso. Para uso sem limite e sem custo por token, suba o LanguageTool em um servidor próprio (ex.: serviço no Railway com a imagem Docker do LanguageTool) e aponte `LANGUAGETOOL_URL` para `https://SEU-SERVICO/v2/check`. O sistema só mostra sugestões de ortografia, acentuação, pontuação e maiúsculas; nada é alterado sem o usuário clicar em "Aplicar".

## Deploy

- **API** (Railway ou similar): `npm run build -w apps/api` e `npm run start -w apps/api`. Variáveis conforme `apps/api/.env.example`. `CORS_ORIGIN` = URL do front.
- **Front** (Vercel ou similar): diretório `apps/web`, build `npm run build`, saída `dist`. Defina `VITE_API_URL` com a URL da API e, opcionalmente, `VITE_DEVELOPER_GITHUB` (link do GitHub exibido na assinatura do rodapé). Como é uma SPA, configure o redirecionamento de todas as rotas para `index.html`.

## Regras de permissão

- **Administrador**: tudo, incluindo usuários, obras, categorias e a tela de Atividades.
- **Funcionário**: envia fotos, escreve no diário e marca chuva; edita/exclui apenas o que ele mesmo criou. A marcação de chuva de um dia pode ser corrigida por qualquer usuário (fica registrado quem alterou).
- Toda ação relevante (criar, editar, excluir, login) fica registrada com autor, data e hora.

---

Desenvolvido por Guilherme Bello.
