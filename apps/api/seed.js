// Seed de demonstração — preenche todas as abas do sistema com dados realistas.
// Uso:  node apps/api/seed.js        (ou:  npm run seed -w apps/api)
//
// Idempotente: apaga os dados de demonstração anteriores (fotos, diário, chuva,
// atividades, obras e funcionários) e recria tudo. O administrador inicial e as
// categorias padrão são preservados.
//
// Observação: como não há Cloudflare R2 configurado localmente, as fotos entram
// apenas como registros (a aba Fotos mostra os cards, datas, categorias e notas),
// mas a imagem em si não é exibida. Tudo o mais funciona normalmente.

import { config as loadEnv } from 'dotenv';
import pg from 'pg';
import bcrypt from 'bcryptjs';

loadEnv({ path: new URL('./.env', import.meta.url) });

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// --- helpers de data ---
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function at(daysAgo, hour = 9, min = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, min, 0, 0);
  return d;
}
const iso = (d) => d.toISOString();

async function q(text, params = []) {
  const res = await pool.query(text, params);
  return res.rows;
}
async function one(text, params = []) {
  return (await q(text, params))[0] ?? null;
}

async function main() {
  console.log('→ Conectando ao banco…');

  const admin = await one(`SELECT id, name FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1`);
  if (!admin) {
    console.error('✗ Nenhum administrador encontrado. Suba a API uma vez para criar o admin inicial e rode o seed de novo.');
    process.exit(1);
  }
  console.log(`  admin: ${admin.name} (${admin.id})`);

  // --- limpa dados de demonstração anteriores (mantém admin + categorias) ---
  console.log('→ Limpando dados de demonstração anteriores…');
  await q('DELETE FROM activity_log');
  await q('DELETE FROM photos');
  await q('DELETE FROM diary_entries');
  await q('DELETE FROM rain_records');
  await q('DELETE FROM projects');
  await q(`DELETE FROM users WHERE role <> 'admin'`);

  // --- categorias (criadas no boot da API) ---
  const categories = await q('SELECT id, name FROM photo_categories ORDER BY sort_order');
  const cat = (name) => categories.find((c) => c.name === name)?.id ?? categories[0].id;
  if (!categories.length) {
    console.error('✗ Sem categorias. Suba a API uma vez (ela cria as categorias padrão).');
    process.exit(1);
  }

  // --- funcionários ---
  console.log('→ Criando funcionários…');
  const hash = await bcrypt.hash('func12345', 10);
  const carlos = await one(
    `INSERT INTO users (name, email, password_hash, role, active, last_login_at)
     VALUES ($1, $2, $3, 'member', true, $4) RETURNING id, name`,
    ['Carlos Andrade', 'carlos@local.test', hash, iso(at(0, 7, 42))],
  );
  // >>> o "mais um usuário" pedido, com várias ações atribuídas a ele <<<
  const fernanda = await one(
    `INSERT INTO users (name, email, password_hash, role, active, last_login_at)
     VALUES ($1, $2, $3, 'member', true, $4) RETURNING id, name`,
    ['Fernanda Lima', 'fernanda@local.test', hash, iso(at(0, 8, 15))],
  );
  console.log(`  ${carlos.name}, ${fernanda.name}`);

  // --- obras ---
  console.log('→ Criando obras…');
  const obra1 = await one(
    `INSERT INTO projects (name, contract_number, location, active, created_at)
     VALUES ($1,$2,$3,true,$4) RETURNING id, name`,
    ['Duplicação Rodovia BR-101 — Lote 3', '2024/045-DER', 'Palhoça/SC', iso(at(40, 8))],
  );
  const obra2 = await one(
    `INSERT INTO projects (name, contract_number, location, active, created_at)
     VALUES ($1,$2,$3,true,$4) RETURNING id, name`,
    ['Ponte sobre o Rio Tubarão', '2023/112-DNIT', 'Tubarão/SC', iso(at(30, 8))],
  );
  const obra3 = await one(
    `INSERT INTO projects (name, contract_number, location, active, created_at)
     VALUES ($1,$2,$3,false,$4) RETURNING id, name`,
    ['Pavimentação Acesso ao Porto', '2022/078-SIE', 'Imbituba/SC', iso(at(120, 8))],
  );

  // registra atividade manualmente (mesma forma que as rotas fazem)
  const acts = [];
  const log = (userId, action, entityType, entityId, summary, when, meta = {}) =>
    acts.push({ userId, action, entityType, entityId, summary, when, meta });

  log(admin.id, 'project.create', 'project', obra1.id, `Criou a obra "${obra1.name}"`, at(40, 8, 5));
  log(admin.id, 'project.create', 'project', obra2.id, `Criou a obra "${obra2.name}"`, at(30, 8, 10));
  log(admin.id, 'project.create', 'project', obra3.id, `Criou a obra "${obra3.name}"`, at(120, 8, 3));
  log(admin.id, 'user.create', 'user', carlos.id, 'Criou o usuário Carlos Andrade (funcionário)', at(38, 9));
  log(admin.id, 'user.create', 'user', fernanda.id, 'Criou o usuário Fernanda Lima (funcionário)', at(38, 9, 5));
  log(admin.id, 'project.update', 'project', obra3.id, `Alterou a obra "${obra3.name}"`, at(10, 16, 20));

  // --- fotos (registros; imagem não é exibida sem R2) ---
  console.log('→ Criando fotos…');
  const fotos = [
    [0, 'Engenharia Interna e de Campo', carlos, 'Concretagem do pilar P12 concluída pela manhã.'],
    [0, 'Topografia (Campo)', fernanda, 'Locação do estaqueamento do km 42+300.'],
    [1, 'Equipamentos', carlos, 'Escavadeira hidráulica em operação no corte 8.'],
    [1, 'Meio Ambiente (Campo/Interno)', fernanda, 'Instalação de bacia de contenção provisória.'],
    [2, 'Seção Técnica', carlos, 'Conferência da armadura antes da concretagem.'],
    [3, 'Geral', fernanda, 'Vista geral da frente de serviço no fim do dia.'],
    [4, 'Engenharia Interna e de Campo', carlos, 'Compactação da camada de sub-base.'],
    [5, 'Topografia (Campo)', fernanda, 'Nivelamento geométrico do trecho norte.'],
    [6, 'Administrativo', carlos, 'Entrega de EPIs para a nova equipe.'],
    [7, 'Equipamentos', fernanda, 'Manutenção preventiva do rolo compactador.'],
    [8, 'Geral', carlos, 'Sinalização de desvio reorganizada.'],
    [9, 'Meio Ambiente (Campo/Interno)', fernanda, 'Umectação da via para controle de poeira.'],
  ];
  let fi = 0;
  for (const [daysAgo, catName, user, note] of fotos) {
    fi++;
    const key = `projects/${obra1.id}/demo/${String(fi).padStart(3, '0')}.jpg`;
    const takenAt = at(daysAgo, 8 + (fi % 8), (fi * 7) % 60);
    const row = await one(
      `INSERT INTO photos (project_id, category_id, r2_key, original_name, mime_type, size_bytes, taken_at, note, created_by, created_at)
       VALUES ($1,$2,$3,$4,'image/jpeg',$5,$6,$7,$8,$6) RETURNING id`,
      [obra1.id, cat(catName), key, `IMG_${1000 + fi}.jpg`, 1_800_000 + fi * 1000, iso(takenAt), note, user.id],
    );
    log(user.id, 'photo.create', 'photo', row.id, `Enviou uma foto em "${catName}": "${note}"`, takenAt, {
      projectId: obra1.id,
    });
  }

  // --- diário de obra ---
  console.log('→ Criando registros de diário…');
  const diarios = [
    [0, fernanda, 'Equipe concentrada na concretagem dos pilares P11 e P12. Clima firme, sem intercorrências. Recebimento de 18 m³ de concreto usinado FCK 30.'],
    [1, carlos, 'Avanço da terraplanagem no corte 8. Mobilização de mais uma escavadeira. Pequena parada à tarde por chuva rápida.'],
    [2, fernanda, 'Serviços de topografia para locação do km 42. Conferência do greide com o projeto executivo aprovada.'],
    [3, carlos, 'Compactação da sub-base no trecho sul. Ensaio de densidade in situ dentro do especificado.'],
    [5, fernanda, 'Montagem de formas e armação da viga V3. Reunião de segurança (DDS) com toda a equipe pela manhã.'],
    [7, carlos, 'Dia improdutivo para terraplanagem devido à chuva forte durante toda a manhã. Equipe remanejada para serviços internos.'],
    [9, fernanda, 'Retomada dos serviços de drenagem. Assentamento de tubos de concreto no bueiro BSTC 3.'],
    [12, carlos, 'Início da pavimentação asfáltica no segmento experimental. Usina operando normalmente.'],
  ];
  for (const [daysAgo, user, text] of diarios) {
    const when = at(daysAgo, 17, 30);
    const row = await one(
      `INSERT INTO diary_entries (project_id, entry_date, text, created_by, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$5) RETURNING id`,
      [obra1.id, ymd(when), text, user.id, iso(when)],
    );
    log(user.id, 'diary.create', 'diary', row.id, `Registrou o diário de ${ymd(when).split('-').reverse().join('/')}`, when, {
      projectId: obra1.id,
    });
  }
  // uma edição de diário (pra mostrar histórico de edição / ação "update")
  {
    const target = await one(`SELECT id, entry_date FROM diary_entries WHERE project_id = $1 ORDER BY entry_date DESC LIMIT 1`, [obra1.id]);
    const when = at(0, 18, 10);
    await q(`UPDATE diary_entries SET text = text || E'\\n\\nComplemento: liberada a frente de serviço para amanhã.', updated_by = $1, updated_at = $2 WHERE id = $3`, [
      fernanda.id,
      iso(when),
      target.id,
    ]);
    log(fernanda.id, 'diary.update', 'diary', target.id, `Editou o diário de ${ymd(new Date(target.entry_date)).split('-').reverse().join('/')}`, when, {
      projectId: obra1.id,
    });
  }

  // --- controle pluviométrico (ano inteiro, do 1º de janeiro até hoje) ---
  // Espalha chuva pelo ano com níveis variados, pra o heatmap (estilo GitHub)
  // mostrar todos os tons de azul. Mais úmido no verão do Sul (jan–mar, out–dez).
  console.log('→ Criando registros de chuva…');
  const today = new Date();
  const DAY_MS = 86_400_000;
  // PRNG determinístico (mesmo resultado a cada seed)
  let prng = 987654321;
  const rand = () => {
    prng = (prng * 1103515245 + 12345) & 0x7fffffff;
    return prng / 0x7fffffff;
  };
  // probabilidade de chuva e intensidade por mês (0 = jan)
  const wet = [0.5, 0.55, 0.45, 0.3, 0.22, 0.18, 0.2, 0.22, 0.3, 0.42, 0.48, 0.5];
  const yearStart = new Date(today.getFullYear(), 0, 1).getTime();
  const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const daysAgoFrom = (t) => Math.round((todayEnd - t) / DAY_MS);

  for (let t = yearStart; t <= todayEnd; t += DAY_MS) {
    const base = new Date(t);
    const m = base.getMonth();
    if (rand() > wet[m]) continue; // dia sem chuva
    const roll = rand();
    // distribui entre leve/moderada/forte/muito forte para cobrir os 4 níveis
    let mm;
    if (roll < 0.45) mm = 0.5 + rand() * 4.5; // 0,5–5  (nível 1)
    else if (roll < 0.75) mm = 5 + rand() * 10; // 5–15  (nível 2)
    else if (roll < 0.92) mm = 15 + rand() * 15; // 15–30 (nível 3)
    else mm = 30 + rand() * 35; // 30–65 (nível 4)
    mm = Math.round(mm * 10) / 10;
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 18, 0, 0);
    const user = base.getDate() % 2 === 0 ? carlos : fernanda;
    const note = mm >= 30 ? 'Chuva forte, obra paralisada parte do dia.' : mm >= 10 ? 'Chuva moderada.' : 'Chuva leve.';
    const row = await one(
      `INSERT INTO rain_records (project_id, record_date, mm, note, created_by, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$6) RETURNING id`,
      [obra1.id, ymd(d), mm, note, user.id, iso(d)],
    );
    // registra atividade só nos últimos 14 dias, pra não inundar o feed
    if (daysAgoFrom(t) <= 14) {
      log(user.id, 'rain.create', 'rain', row.id, `Marcou ${mm} mm de chuva em ${ymd(d).split('-').reverse().join('/')}`, d, {
        projectId: obra1.id,
      });
    }
  }

  // alguns registros de chuva na segunda obra também (mês corrente)
  for (const [day, mm] of [[5, 8.0], [6, 15.0], [13, 22.0]]) {
    if (day > today.getDate()) continue;
    const d = new Date(today.getFullYear(), today.getMonth(), day, 18, 0, 0);
    await q(
      `INSERT INTO rain_records (project_id, record_date, mm, note, created_by, created_at, updated_at)
       VALUES ($1,$2,$3,'',$4,$5,$5) ON CONFLICT DO NOTHING`,
      [obra2.id, ymd(d), mm, carlos.id, iso(d)],
    );
  }

  // --- grava todas as atividades coletadas ---
  console.log('→ Gravando histórico de atividades…');
  acts.sort((a, b) => a.when - b.when);
  for (const a of acts) {
    await q(
      `INSERT INTO activity_log (user_id, action, entity_type, entity_id, summary, meta, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [a.userId, a.action, a.entityType, a.entityId, a.summary, JSON.stringify(a.meta), iso(a.when)],
    );
  }
  // registros de login (não aparecem no feed, mas alimentam "último acesso")
  for (const u of [admin, carlos, fernanda]) {
    await q(
      `INSERT INTO activity_log (user_id, action, entity_type, entity_id, summary, meta, created_at)
       VALUES ($1,'auth.login','user',$2,'Entrou no sistema','{}',now())`,
      [u.id, u.id],
    );
  }

  // --- resumo ---
  const counts = await one(`
    SELECT
      (SELECT count(*) FROM users)         AS usuarios,
      (SELECT count(*) FROM projects)      AS obras,
      (SELECT count(*) FROM photos)        AS fotos,
      (SELECT count(*) FROM diary_entries) AS diario,
      (SELECT count(*) FROM rain_records)  AS chuva,
      (SELECT count(*) FROM activity_log)  AS atividades
  `);

  console.log('\n✓ Seed concluído.');
  console.table(counts);
  console.log('\nLogins (senha dos funcionários: func12345):');
  console.log('  admin    → admin@local.test / admin12345');
  console.log('  Carlos   → carlos@local.test / func12345');
  console.log('  Fernanda → fernanda@local.test / func12345   (usuário extra com ações atribuídas)');

  await pool.end();
}

main().catch(async (err) => {
  console.error('✗ Erro no seed:', err);
  await pool.end();
  process.exit(1);
});
