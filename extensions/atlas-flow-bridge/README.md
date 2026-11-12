# Atlas Flow Bridge

Extensão Chrome (Manifest V3) usada pelo Atlas Studio para criar e vincular projetos no Google Flow.

## Instalação (somente Google Chrome)

Não use Microsoft Edge. A ponte do Atlas abre o Flow no Chrome.

1. Abra o **Google Chrome** em `chrome://extensions`
2. Ative **Modo do desenvolvedor**
3. Clique em **Carregar sem compactação**
4. Selecione esta pasta (`atlas-flow-bridge`)

## Uso

1. Deixe o **Google Chrome** aberto com esta extensão carregada
2. Abra o Atlas Studio
3. Em **Flow → Criar projeto**, mantenha “Criar também no Google Flow” ativo
4. A extensão cria/reutiliza **uma única aba Flow inativa** (segundo plano) — o Atlas **não** abre abas novas
5. Login só ativa essa mesma aba se a autenticação Google for necessária
6. Use **Ver no Flow** no Atlas para revelar a aba worker existente
7. **Excluir** no Atlas também exclui no Google Flow; se o projeto sumir no Flow, o Atlas remove o card
8. O Atlas **não** pede nem armazena senha. A pasta local **não** é apagada.

## Domínios suportados

- `https://flow.google.com/project/{uuid}` — **URL canônica do projeto**
- `https://flow.google.com/` — home; criação via botão **New project** / **Novo projeto**
- `https://labs.google/fx/tools/flow*` — legado (ainda lido)
- `http://127.0.0.1/*` — ponte com o Atlas Studio

`flow.google.com/project/new` e `404?reason=project` **não** criam projeto — a extensão evita essas URLs.

## Referências e geração (1.0.43)

- **Enviar referências ao Flow** primeiro localiza o arquivo no seletor (Envios/Uploads e **Tudo**).
- Só marca **Enviada** quando o item correspondente está pronto e **Incluir no comando** habilita. Na preparação do card, confirma a miniatura na caixa do Flow depois de clicar em **Incluir no comando**.
- Se o item ainda carrega, fica **Confirmando…** — novo clique só vincula, sem reenviar bytes.
- Cards usam `Preparar` (valida texto+anexos sem Generate) e `Gerar` (um por vez).
- Se o Flow mostrar **atividade incomum**, a extensão emite `generation_blocked` e o Atlas **pausa** novos Generate até **Retomar geração**.

Checklist se aparecer “atividade incomum”:
1. Desative a Atlas Flow Bridge e outras extensões que alteram a página
2. Recarregue o mesmo projeto e faça **um** teste manual com o mesmo modelo
3. Se o manual falhar, registre e mantenha o automático pausado
4. Se o manual passar, compare com o Atlas e anote: `ref_located` → `ref_attached` → `text_verified` → `generate_requested` → `flow_result`

## Limitações reais

- O Chrome precisa estar em execução (ou a extensão não recebe comandos)
- MV3 não permite automação com o navegador completamente fechado
- Em login/captcha, o foco é necessário por segurança do Google
- **Abrir aba do Flow** no popup apenas mostra a aba existente. Para revisão manual, use **Preparar** no Atlas, confira texto e anexos na caixa do Flow e use a seta de criação do Flow. Se o controle de criação não puder ser identificado com segurança, o card fica preparado para revisão.

## Segurança

- Comunicação apenas com `127.0.0.1`
- Sem cookies exportados, sem APIs privadas, sem tokens Google no SQLite do Atlas
- Fase 1: criação, vínculo, rename e exclusão bidirecional de projeto
- Extensão **1.0.10**: aba worker pré-aquecida + waits menores (criação mais rápida)
