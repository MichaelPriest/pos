# Baseline de migrations do ReVeste

## Estado atual

O projeto Supabase de produção foi criado por SQL direto e **não possui**
`supabase_migrations.schema_migrations`. Por isso, os arquivos existentes em
`supabase/migrations/` representam a evolução do esquema no Git, mas não estão
registrados no histórico remoto do Supabase.

Isso significa que **não é seguro executar `supabase db push` em produção**
enquanto o baseline não for adotado. O CLI interpretaria migrations antigas
como não aplicadas e poderia tentar recriar objetos que já existem.

## Regra até a adoção do baseline

- mudanças novas continuam sendo versionadas em `supabase/migrations/`;
- mudanças devem ser testadas e revisadas na PR antes de qualquer aplicação;
- não executar `supabase db push` no projeto de produção;
- não usar `migration repair --status applied` por aproximação;
- não preencher manualmente a tabela de histórico sem comparar o esquema real.

## Procedimento de adoção

1. Em um ambiente local com Supabase CLI atualizado, vincular explicitamente ao
   projeto correto.
2. Executar `supabase db pull` para capturar o estado remoto real.
3. Comparar o dump remoto com `supabase/schema.sql` e com as migrations
   existentes.
4. Corrigir qualquer divergência no Git antes de registrar histórico.
5. Somente depois de confirmar que cada mudança histórica já existe no banco,
   usar `supabase migration repair --status applied <versão>` para alinhar o
   histórico, ou adotar uma migration-baseline única conforme a estratégia
   escolhida pela equipe.
6. Executar `supabase migration list` e confirmar que local e remoto estão
   alinhados antes do primeiro `db push`.
7. A partir daí, toda mudança de schema deve ocorrer por migration versionada.

## Produção

Em 07/10/2026, após validação transacional com `BEGIN/ROLLBACK`, foram
aplicadas diretamente ao projeto Supabase real as migrations `026` a `042`
necessárias para alinhar o banco ao código atual. Elas **continuam sem registro**
em `supabase_migrations.schema_migrations`, porque o projeto remoto não possui
histórico de migrations inicializado.

Portanto, o banco já contém essas alterações, mas a regra permanece: **não usar
`supabase db push` ainda**. A adoção do baseline deve primeiro reconciliar o
estado remoto completo (001–042) com o Git e só então registrar o histórico como
aplicado.
