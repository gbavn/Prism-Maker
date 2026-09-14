# Prism — Editor de Mundo 2.5D para Pokémon Essentials

> Documento de arquitetura e guia de trabalho.
> Serve como referência técnica para humanos **e** como instruções para o Claude Code.
> "Prism" é um nome de trabalho; troque livremente se decidir por outro.

---

## Para o Claude Code: como usar este documento

Você (Claude Code) vai ajudar a construir esta ferramenta. Antes de escrever qualquer código, leia este arquivo inteiro. Ele descreve o objetivo, a arquitetura pretendida e a ordem de construção.

Regras de trabalho:

1. **Proponha antes de gerar.** Para qualquer tarefa não trivial, explique primeiro o que pretende fazer e espere confirmação. Só então escreva o código.
2. **Você pode discordar da arquitetura.** Se enxergar um caminho tecnicamente melhor do que o descrito aqui, diga isso claramente, explique o trade-off, e proponha a alternativa. Este documento é um ponto de partida bem pensado, não uma ordem imutável. O objetivo final (um editor de mundo 2.5D para Essentials) é o que importa; os meios podem melhorar.
3. **Respeite o contrato central.** Uma coisa não é negociável sem discussão explícita: editor e runtime **têm que renderizar a mesma cena do mesmo jeito**. Qualquer decisão que quebre a paridade visual entre os dois precisa ser sinalizada em voz alta.
4. **Prefira marcos pequenos e visíveis.** Um cubo colorido aparecendo numa cena 3D navegável vale mais, no início, do que um parser perfeito sem nada na tela.
5. **Não invente detalhes de formato binário.** O `.rxdata` é Ruby Marshal 4.8. Quando estiver incerto sobre a estrutura, verifique contra um arquivo real em vez de assumir.

---

## O que é este projeto

Um editor de mapas/mundo para projetos **Pokémon Essentials** (RPG Maker XP) que substitui o editor de mapa por uma experiência **2.5D**: o cenário é geometria 3D real, com câmera ajustável (orbitar, zoom, pan), relevo com elevação por célula, e personagens como sprites 2D posicionados no espaço 3D (billboards). O estilo alvo é o dos jogos de Nintendo DS (HGSS): mundo tridimensional, navegação em grade, interface 2D por cima.

O jogo final roda num **mkxp-z modificado** capaz de desenhar essa geometria 3D, mantendo o projeto compatível com o ecossistema Essentials.

Referências que inspiram o projeto (não copiar, apenas mesma categoria de solução):
- **Maker Studio** (Toskan4134): editor moderno que lê/escreve `.rxdata` direto e tem sistema de mods. Prova que substituir o editor de mapa do XP é viável.
- **MV3D** (Cutievirus): plugin que interpreta tiles como 3D via Babylon.js no RPG Maker MV. Prova o conceito tile→3D.
- **Kyanite Editor**: editor próprio com mapas estilo 3DS/HGSS. É o alvo espiritual deste projeto.

---

## Versões-alvo

- **Pokémon Essentials v21.1** (a mais recente da linha v21).
- **Runtime:** mkxp-z (o motor que o Essentials moderno já usa; backend OpenGL / Metal no macOS).
- Confirmar a versão exata do Essentials do projeto do usuário no boot e avisar se houver divergência de formato de PBS/dados.

---

## Princípio central: três produtos, um contrato

O sistema tem três peças acopladas por **um contrato de dados**. Entender isso evita o erro clássico de travar no meio.

1. **Runtime 3D** — o mkxp-z modificado que roda o jogo em 2.5D.
2. **Formato de cena** — a descrição de como cada tile/objeto vira geometria. É a "cola" e o coração do projeto.
3. **Editor** — onde o mundo é montado, vendo o 2.5D em tempo real.

**Regra de ouro:** editor e runtime nunca devem ter lógica de renderização divergente. O formato de cena é o que garante isso. Por isso ele é a primeira coisa a ser especificada.

---

## Camada 1 — Runtime (mkxp-z modificado)

Fork do mkxp-z com uma extensão de renderização 3D.

O que precisa existir (C++):

- Um módulo de renderização 3D paralelo ao pipeline 2D existente, pendurado no contexto OpenGL que o mkxp-z já mantém vivo.
- Novas classes expostas ao Ruby via os bindings do mkxp-z:
  - **Câmera** — posição, ângulo, projeção (orto/perspectiva), FOV, limites.
  - **Modelo / malha** — carregar um modelo, posição, rotação, escala.
  - **Luz** — ao menos uma direcional + ambiente, para dar o sombreamento estilo DS.
- Um **loader de modelos glTF 2.0** (usar `tinygltf` ou `cgltf`; não reinventar). glTF é o padrão moderno, suporta animação e tem ferramentas prontas dos dois lados (C++ e Babylon.js).
- Integração correta com o loop de tela do RGSS: a cena 3D é desenhada **por baixo** da UI 2D. Menus, caixas de diálogo, batalha e HUD continuam 2D e são desenhados por cima, respeitando os `Viewport` existentes.

**Decisão de escopo:** o mundo é 3D; a interface é 2D. Só o mapa vira tridimensional. Isso reduz drasticamente o trabalho e é fiel ao que os jogos de DS faziam.

Esta é a camada de **maior risco técnico** (C++, build cross-platform, mexer no core de um motor). Por isso é a **última** a ser construída — só depois que o editor já provar o conceito visualmente.

---

## Camada 2 — Formato de cena (o contrato)

A inteligência do projeto mora aqui. Um mapa do XP é uma grade de IDs de tile em 3 camadas; este formato traduz isso em mundo 3D.

Conceitos que o formato precisa cobrir:

- **Mapeamento tile → modelo.** Cada ID de tile do tileset aponta para um modelo 3D, ou para "plano texturizado" (chão), ou para "bloco" (parede). Uma tabela de tradução por tileset.
- **Elevação por célula (o "0.5" de 2.5D).** Cada célula da grade tem uma altura. É isso que cria rampas, escadas e penhascos estilo HGSS. O RPG Maker **não** tem esse dado; é informação nova que o editor adiciona.
- **Objetos / eventos no espaço 3D.** Cada evento (NPC, item, porta…) precisa de: âncora no chão, altura seguindo o relevo, e modo de render (billboard 2D — padrão — ou modelo 3D).
- **Metadados de câmera por mapa.** Ângulo padrão, limites de zoom, rotação livre ou travada.
- **Autotiles em 3D.** Regras de como bordas (água, caminhos) se conectam em 3D. **Adiar** para depois do MVP; é uma das partes mais chatas.

**Onde guardar:** NÃO dentro do `.rxdata` (rígido, serializado em Marshal). Guardar em arquivo paralelo por mapa — ex.: `Map001.scene.json` — ao lado do `.rxdata`.

- O `.rxdata` continua com a lógica de jogo (eventos, colisão, IDs de tile) → mantém compatibilidade com o Essentials.
- O `.scene.json` guarda a camada 3D (elevação, mapeamentos, câmera, modo de render dos eventos).

**Consequência boa:** aberto no Essentials padrão, o projeto volta a ser 2D e continua rodando. O visual 2.5D só aparece no runtime modificado. Nada é corrompido; o projeto continua um projeto Essentials válido.

---

## Camada 3 — Editor

App desktop. Escolha de stack recomendada:

- **Recomendado: Tauri ou Electron + Babylon.js.** Babylon.js carrega glTF nativamente — o editor renderiza os **mesmos** modelos que o runtime, o que protege a paridade visual. UI rápida com HTML/CSS. É o mesmo tipo de stack do Maker Studio.
  - Tauri (backend Rust): binário menor e mais leve, curva um pouco maior.
  - Electron (backend Node): mais familiar, mais pesado.
- **Alternativa não recomendada para começar:** editor nativo em C++ usando o mesmo renderer do mkxp-z. Fidelidade máxima, mas desenvolvimento de UI muito mais lento.

> Claude Code: se você conhece uma combinação que dá paridade glTF ainda melhor (ex.: usar three.js em vez de Babylon.js por algum motivo concreto, ou um runtime web compartilhado entre editor e jogo), proponha com trade-offs antes de assumir a recomendação acima.

Funcionalidades, em ordem de prioridade:

1. Abrir uma pasta de projeto Essentials e ler os `.rxdata` (parser de Marshal em JS/TS).
2. Renderizar o mapa em 3D a partir do `.scene.json` (ou gerar um default se não existir).
3. **Câmera ajustável** (orbitar, zoom, pan) — requisito explícito do usuário.
4. Pintar tiles e ver o modelo 3D aparecer na hora.
5. Ferramenta de **elevação** (editar a altura das células → o relevo).
6. Ver e posicionar **eventos/NPCs** no mundo (ver seção Eventos).
7. Salvar de volta em `.rxdata` + `.scene.json`.

---

## Eventos e NPCs

No RPG Maker, **NPCs não são uma entidade separada — são eventos**, e eventos vivem dentro do `.rxdata` do mapa. Logo, ler o mapa já traz os eventos junto. Cada `RPG::Event` tem posição (x, y), uma ou mais páginas (com condições), e cada página tem gráfico (o charset), trigger, rota de movimento e uma lista de comandos.

Profundidade de edição, por fase:

- **Fase 1 (essencial):** exibir cada evento na posição certa do mundo 3D, com o sprite correto; criar, mover, apagar; ajustar a altura junto do relevo.
- **Fase 2 (médio):** editar propriedades básicas — gráfico, rota de movimento, condições de trigger — via formulário.
- **Fase 3 (trabalhoso, adiar):** editor completo da lista de comandos (os ~100 tipos: Show Text, Conditional Branch, Control Switches…). É um subprojeto por si só. No começo, apenas **exibir** os comandos em leitura.

**Personagens em 2.5D — usar billboard.** Sprites 2D existentes do Essentials ficam "em pé" no mundo 3D, sempre virados para a câmera (estilo Paper Mario / muitos jogos de DS). Isso reaproveita todos os charsets atuais e evita ter que modelar personagens em 3D. Cenário = 3D; personagens = sprites 2D no espaço 3D. Modelo 3D por personagem fica como opção futura, não como padrão.

---

## O que o editor abre (e o que não abre)

Um projeto Essentials é mais que mapas. Escopo realista do editor:

- **Lê e edita:** mapas, tilesets e suas propriedades, eventos dentro dos mapas, e a pasta `Graphics` (para saber quais imagens/modelos usar). Este é o núcleo.
- **Lê, e edita só em módulo dedicado (pós-MVP):** PBS (Pokémon, moves, items, trainers, encounters). Viável (o Maker Studio tem um mod de PBS Editor), mas é um módulo à parte — não vem de graça só por abrir o projeto.
- **Não mexe:** `Scripts.rxdata` (o código Ruby do jogo), batalhas, menus, lógica de gameplay. Isso continua sendo editado no código, por fora.

Em uma frase: o editor abre o projeto para **editar o mundo em 2.5D**; ele é uma peça do fluxo, não um substituto de todo o Essentials.

---

## Estrutura de repositório sugerida

Monorepo, porque as três peças são acopladas por um contrato:

```
prism/
├── packages/
│   ├── scene-format/      # Camada 2: schema JSON, validação, tipos compartilhados
│   ├── rxdata-parser/     # Leitura/escrita de .rxdata (Ruby Marshal) em JS/TS
│   ├── editor/            # Camada 3: Tauri/Electron + Babylon.js
│   └── runtime-mkxpz/     # Camada 1: fork do mkxp-z em C++ (submódulo git)
├── docs/
│   ├── ARCHITECTURE.md    # este documento
│   └── scene-format.md    # a especificação do contrato (documento vivo)
├── examples/
│   └── test-project/      # projeto Essentials mínimo para testes
└── README.md
```

`scene-format` é o centro; os outros importam dele. Comece por ele.

---

## Ordem de construção (para não travar)

1. **Especificar o formato de cena** (`scene-format`): só o schema e um exemplo escrito à mão. Sem renderização ainda.
2. **Parser de rxdata** isolado: provar que lê um mapa real e extrai a grade de tiles + eventos.
3. **Editor em modo visualização:** carrega um mapa e mostra em 3D com câmera orbitável, usando **blocos placeholder** (cubos coloridos por tipo de tile). Marco grande e motivador.
4. **Mapeamento tile → modelo real** + ferramenta de elevação + exibição de eventos como billboards.
5. **Edição** (pintar tiles, mover eventos, salvar de volta).
6. **Só então:** fork do mkxp-z, para rodar o jogo com os mesmos dados e a mesma aparência.

A ordem é proposital: ver resultado em 3D (passo 3) **antes** de encarar C++ (passo 6), que é a parte mais dura.

---

## Riscos conhecidos

- **Arte 3D é o gargalo real, não o código.** Serão dezenas a centenas de modelos low-poly para cobrir os tiles. Começar com blocos genéricos e substituir aos poucos. Não deixar isso travar o início.
- **A modificação do mkxp-z é o maior risco técnico.** C++, compilação cross-platform, core de motor. Factível (o Kyanite fez), mas é onde mais se precisa de foco. Deixado para o fim de propósito.
- **Paridade editor/runtime.** O maior risco silencioso. Se o editor e o jogo divergirem no jeito de desenhar a cena, o projeto perde confiança. glTF nos dois lados + o mesmo `.scene.json` é o que segura isso.
- **Compatibilidade de versão do Essentials.** Formatos de PBS mudaram entre versões. Fixar em v21.1 e validar no boot.

---

## Glossário rápido

- **rxdata** — arquivos do RPG Maker XP; objetos Ruby serializados via Marshal 4.8.
- **PBS** — arquivos texto do Essentials (Pokémon, moves, trainers…).
- **mkxp-z** — reimplementação open-source do RGSS (motor do XP), backend OpenGL/Metal; o Essentials moderno já roda nele.
- **RGSS** — Ruby Game Scripting System, a camada de script/render do RPG Maker.
- **billboard** — sprite 2D que sempre encara a câmera dentro de uma cena 3D.
- **glTF** — formato padrão de modelos 3D; suporta malha, textura e animação.
- **2.5D** — cenário 3D real com navegação/lógica em grade e interface 2D por cima.

---

## Decisões em aberto (para decidir com o time / Claude Code)

- Tauri vs Electron para o editor.
- Babylon.js vs three.js no editor (o que der melhor paridade com o loader C++ do runtime).
- Formato de modelo definitivo (glTF é a recomendação forte; confirmar).
- Se o `.scene.json` é um arquivo por mapa ou um manifesto único do projeto.
- Estratégia de billboards com iluminação (o sprite recebe sombra do relevo? projeta sombra?).
