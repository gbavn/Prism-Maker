# 3D de verdade dentro do jogo

Documento de continuidade. Ele existe para que a próxima sessão comece a
escrever código na primeira mensagem, sem repetir nenhuma investigação.

**Objetivo:** malha 3D real desenhada por OpenGL dentro do Pokémon Essentials
rodando, com o Ruby, os eventos, as batalhas e os menus funcionando como hoje.

**Não é objetivo, e foi descartado explicitamente:** converter modelo em
bitmap, sprite, spritesheet ou imagem pré-renderizada. Isso já existe no
editor e está descrito no `CLAUDE.md`, seção "Objetos 3D". É outro caminho,
serve para outra coisa, e não substitui malha.

---

## 1. Onde paramos

Feito e no `main`:

- investigação completa do runtime (este documento);
- protótipo do renderizador funcionando, em `tools/prism3d-prototype/`:
  malha real com VAO, VBO e EBO, shader próprio, câmera com `lookAt`,
  projeção em perspectiva e buffer de profundidade. Compila limpo com
  `-Wall -Wextra` e roda sem tela com `xvfb-run`;
- prova de que não é imagem: três giros mostram faces mudando de proporção e a
  lateral aparecendo, e um quarto quadro repete um giro com o teste de
  profundidade desligado. Nos dois casos a ordem de desenho é
  **deliberadamente errada** (o cubo de perto entra primeiro). Com
  profundidade, o resultado sai certo mesmo assim; sem ela, o cubo de longe
  pinta por cima. Ver o README do protótipo.

Não feito, e é o próximo passo:

- o patch no mkxp-z;
- o fork no GitHub e o build pela CI deles;
- rodar dentro do jogo.

O que o protótipo **não** prova, e onde mora o risco: ele rodou no contexto
dele, com framebuffer pedido com 24 bits de profundidade. Dentro do mkxp-z o
alvo é um FBO **sem profundidade nenhuma**. Ligar `GL_DEPTH_TEST` num alvo sem
anexo de profundidade não dá erro: simplesmente não faz nada. É o risco
número um do próximo passo.

---

## 2. Mapa do mkxp-z, com arquivo e linha

Fonte lido: `https://github.com/mkxp-z/mkxp-z`, clone raso. Linhas conferidas
no clone de setembro de 2026. Se o upstream andar, confira antes de confiar.

### Contexto OpenGL

- criado em `initGL()`, `src/main.cpp:533`, via `SDL_GL_CreateContext`;
- **fica corrente na mesma thread que roda o Ruby**: `rgssThreadFun`
  (`src/main.cpp:119-130`) chama `SDL_GL_MakeCurrent` e só então
  `scriptBinding->execute()` (`src/main.cpp:165`), que é o interpretador.

Consequência, e é a pedra fundamental de tudo: **uma função nativa chamada do
Ruby pode emitir comandos OpenGL direto, sem thread nem sincronização**.

- sem perfil core pedido, sem `SDL_GL_SetAttribute` de versão. Contexto de
  compatibilidade no desktop, e há caminho GLES (`GLES2_HEADER` em
  `src/display/gl/gl-fun.cpp`). No macOS com Apple Silicon o padrão é Metal
  por ANGLE, ou seja, GLES. **Shader tem que valer nos dois**, e o projeto já
  trata isso em `shader/common.h`.

### Ciclo do quadro

```
Ruby: Graphics.update
  └─ Graphics::update                      src/display/graphics.cpp:1188
      └─ redrawScreen                      graphics.cpp:1045
          └─ ScreenScene::composite         graphics.cpp:507
              ├─ shState->prepareDraw       sinal, src/sharedstate.h:84
              ├─ pp.startRender             liga rt[dstInd]
              ├─ glState.viewport.set
              ├─ FBO::clear                 (só cor)
              └─ Scene::composite           src/display/gl/scene.cpp:91-102
                  └─ para cada SceneElement visível, na ordem de z: draw()
          ├─ blit do front buffer para o framebuffer da janela  (só cor)
          └─ swapGLBuffer → SDL_GL_SwapWindow                   graphics.cpp:1004-1006
```

Não existe laço de jogo em C++: quem chama `Graphics.update` é o Ruby. A
thread principal cuida só de eventos SDL (`src/eventthread.cpp`).

### Alvos de render

- `PingPong` em `graphics.cpp:441-455`: dois `TEXFBO`, criados com
  `TEXFBO::init` + `allocEmpty` + `linkFBO`. **Só cor. Sem profundidade.**
- `PingPong::resize` em `graphics.cpp:467-473` realoca as duas texturas.
- `TEXFBO` em `src/display/gl/gl-util.h:211-250`.
- **Nada é multisampled.** Procurado no projeto inteiro: nenhuma ocorrência.
- os blits usam só `GL_COLOR_BUFFER_BIT` (`src/display/gl/gl-meta.cpp:378-380`),
  com um caminho alternativo por shader quando o blit nativo está desligado.
  Nenhum deles toca profundidade.

### Armadilha: o alvo troca no meio do quadro

`requestViewportRender` chama `pp.swapRender()` quando uma viewport tem tom de
cinza (`graphics.cpp:539-541`). O FBO ligado durante `Scene::composite` pode,
portanto, mudar no meio do quadro.

**Conclusão: profundidade precisa ser anexada aos dois alvos do PingPong.** Se
anexar só a um, o 3D funciona na maioria dos mapas e morre sem erro nenhum
quando algum efeito de tela cinza acontecer antes do nosso elemento.

### Armadilha: tesoura ligada durante o desenho

`glClear` respeita o teste de tesoura, e o ciclo de desenho deixa a tesoura
ligada na viewport corrente. Limpar o buffer de profundidade sem desligar a
tesoura limparia só um retângulo. O próprio motor mostra o precedente em
`graphics.cpp:546-547`, onde empilha `scissorTest(false)` antes de um blit.

### Contrato de estado de OpenGL

Está escrito no fonte, em `src/display/gl/scene.h:88-104`. Em resumo, durante
o `draw()`:

- **não** mexer no viewport;
- **não** mexer no `FBO::Draw`;
- o que é do `GLState` vai por push e pop;
- binding de textura e de shader pode ficar sujo, o motor espera isso.

`GLState` (`src/display/gl/glstate.h:114-121`) conhece apenas: `clearColor`,
`scissorBox`, `scissorTest`, `blendMode`, `blend`, `viewport`, `program`.
**Profundidade, face traseira e VAO não estão lá**, então esses a gente salva e
restaura na mão.

### Bindings Ruby

- um arquivo por classe em `binding/`, cada um com `xBindingInit()`;
- todas chamadas em `mriBindingInit()` (`binding/binding-mri.cpp:160-191`),
  com as declarações logo acima (`:82-108`);
- idioma de módulo: `binding/graphics-binding.cpp:416-441`
  (`rb_define_module` + `_rb_define_module_function`);
- arquivos entram na compilação por `binding/meson.build`.

### Funções de OpenGL que faltam no carregador

O mkxp-z carrega ponteiros de função numa tabela (`gl.Foo`), declarada em
`src/display/gl/gl-fun.h`. **Estas catorze não existem** e precisam ser
acrescentadas (macro `GL_FUN(nome, tipo)` mais o `typedef` correspondente, no
padrão do próprio arquivo):

```
Uniform3f            IsEnabled            GetBooleanv
ClearDepth           DepthFunc            DepthMask
CullFace             FrontFace
GenRenderbuffers     BindRenderbuffer     RenderbufferStorage
FramebufferRenderbuffer  DeleteRenderbuffers  CheckFramebufferStatus
```

Já existem e podem ser usadas direto: `Enable`, `Disable`, `Clear`,
`GenBuffers`, `BindBuffer`, `BufferData`, `DeleteBuffers`, `GenVertexArrays`,
`BindVertexArray`, `DeleteVertexArrays`, `EnableVertexAttribArray`,
`VertexAttribPointer`, `DrawElements`, `CreateShader`, `ShaderSource`,
`CompileShader`, `GetShaderiv`, `GetShaderInfoLog`, `CreateProgram`,
`AttachShader`, `LinkProgram`, `GetProgramiv`, `GetProgramInfoLog`,
`DeleteShader`, `DeleteProgram`, `UseProgram`, `BindAttribLocation`,
`GetUniformLocation`, `UniformMatrix4fv`, `GetIntegerv`, `Uniform1f`,
`Uniform2f`, `Uniform4f`, `Uniform1i`.

Atalho possível para encurtar o patch: usar `Uniform4f` no lugar de
`Uniform3f` (passando 1.0 no quarto componente) e evitar `IsEnabled` e
`GetBooleanv` guardando o estado do nosso lado em vez de perguntar ao driver.
Isso tira quatro das catorze.

### Licença

`COPYING` é GPL v2 ou posterior. O `README.md:23` avisa que, com a opção de
HTTPS ligada (padrão), o binário resultante fica sob GPL v3. **Distribuir o
executável obriga a publicar o fonte do fork.**

---

## 3. A arquitetura decidida

```
Ruby (Essentials)
   │  Prism3D.start / camera / add_box / clear
   ▼
binding/prism3d-binding.cpp
   ▼
Prism3D::Renderer            (malhas, câmera, shader)
   ▼
Prism3DElement : SceneElement  ← entra na MESMA lista de z do motor
   ▼
Scene::composite() → FBO da tela (com profundidade) → SDL_GL_SwapWindow
```

**Por que como SceneElement, e não remendando `Graphics::update`:**

1. vale em todos os caminhos que compõem tela, inclusive transição e fade,
   que também chamam `composite`;
2. respeita o contrato de estado que o motor documenta;
3. a ordem entre 2D e 3D cai de graça no mecanismo de z que o RGSS já tem, e
   o Ruby escolhe se o mundo 3D fica abaixo dos sprites, no meio ou acima.

**Limite honesto do marco 1:** entre 3D e 2D a ordenação é por z de elemento,
porque os sprites do motor não escrevem profundidade. Entre objetos 3D a
profundidade é real, por pixel. É o mesmo limite que o MV3D tem, e é
aceitável; resolver isso depois significa fazer os sprites do mapa
participarem do buffer de profundidade, que é um projeto à parte.

---

## 4. O patch mínimo

### Arquivos novos (6)

| Arquivo | Conteúdo |
|---|---|
| `src/display/gl/prism3d-math.h` | matriz 4x4, perspectiva, ortográfica, `lookAt`. **Copiar de `tools/prism3d-prototype/prism3d-math.h`, já pronto e testado.** O motor não tem tipo de matriz. |
| `src/display/gl/prism3d.h` | `Box`, `Renderer`. Copiar do protótipo. |
| `src/display/gl/prism3d.cpp` | implementação. Copiar do protótipo e trocar as chamadas `glFoo(...)` por `gl.Foo(...)`, que é a tabela do motor. |
| `src/display/gl/prism3d-element.h/.cpp` | `Prism3DElement : SceneElement`, com `draw()` chamando o renderer, e `aboutToAccess()` vazio (`ABOUT_TO_ACCESS_NOOP`). |
| `binding/prism3d-binding.cpp` | módulo Ruby. |
| `shader/prism3d.vert` e `.frag` | os dois shaders do protótipo, com `#include "common.h"` no padrão dos outros. |

### Arquivos alterados (6, todos com pouca coisa)

| Arquivo | Mudança |
|---|---|
| `src/display/gl/gl-fun.h` | as catorze entradas da seção 2. |
| `src/display/graphics.cpp` | anexar renderbuffer de profundidade aos **dois** `rt[]` do `PingPong` (construtor, `:441-455`) e realocar em `resize` (`:467-473`). |
| `src/sharedstate.h` e `.cpp` | o `Prism3D::Renderer` vira propriedade do estado global, ao lado de `shaders()` e `texPool()`, para o binding alcançar por `shState`. |
| `binding/binding-mri.cpp` | declarar `prism3DBindingInit()` (junto das outras, `:82-108`) e chamar em `mriBindingInit()` (`:160-191`). |
| `binding/meson.build`, `src/meson.build`, `shader/meson.build` | uma linha cada, listando os arquivos novos. |

`glstate.h` fica **de fora** do marco 1: em vez de acrescentar propriedades ao
cache do motor, salvar e restaurar profundidade na mão dentro do `draw()`. É
menos invasivo e some quando decidirmos formalizar.

### O corpo do `draw()`, na ordem

1. salvar: `GL_DEPTH_TEST`, `GL_DEPTH_WRITEMASK`, `GL_CULL_FACE`, `GL_BLEND`,
   `GL_CURRENT_PROGRAM` (ou guardar do nosso lado, ver atalho na seção 2);
2. limpar profundidade **com a tesoura desligada** (push, clear, pop);
3. `Enable(GL_DEPTH_TEST)`, `DepthFunc(GL_LESS)`, `DepthMask(GL_TRUE)`;
4. `Enable(GL_CULL_FACE)`, `CullFace(GL_BACK)`, `FrontFace(GL_CCW)`;
5. `glState.blend.pushSet(false)`;
6. bind do shader, do VAO, uniformes de projeção, visão e modelo;
7. `DrawElements` por caixa;
8. desfazer tudo na ordem inversa, **VAO por último**, senão um bind de buffer
   do motor cairia dentro do nosso VAO.

O protótipo em `tools/prism3d-prototype/prism3d.cpp` já faz exatamente isso.

---

## 5. API Ruby do marco 1

```ruby
Prism3D.start(z)                              # cria o elemento e insere na cena
Prism3D.camera(x, y, z, alvo_x, alvo_y, alvo_z, fov)
Prism3D.add_box(x, y, z, larg, alt, prof, yaw, r, g, b)
Prism3D.clear
Prism3D.z = n                                 # move o passo 3D na ordem do RGSS
```

Nada de arquivo, material, luz ou colisão. O caminhão entra como as 28 caixas
que já existem em `packages/editor/src/scene/model.ts`, exportadas para essas
chamadas. Sem inventar formato de arquivo antes da hora.

---

## 6. Passo a passo da próxima sessão

1. **Fork.** Forkar `mkxp-z/mkxp-z` na conta do usuário. Decisão pendente: o
   usuário forka em dois cliques, ou o Claude cria pelo acesso do GitHub.
2. **Branch** `prism3d` no fork.
3. **Escrever o patch** da seção 4. Estimativa: 400 a 600 linhas somando tudo.
4. **Compilar.** Não compilar localmente: o `linux/Makefile` deles constrói as
   dependências a partir do fonte, Ruby incluso, o que leva dezenas de minutos
   e alguns gigabytes, e o contêiner tem cota fixa de disco. Usar a CI:
   `.github/workflows/autobuild.yml` já gera artefato de Windows (mingw64,
   com cache) e de Ubuntu. O artefato de Windows traz o
   `x64-msvcrt-ruby310.dll`, que é o mesmo que o kit do Essentials usa.
5. **Testar.** Baixar o artefato, trocar o `Game.exe` do
   `Game/essentials-v21.1/` por ele, e rodar. Um evento de mapa com as três
   linhas de Ruby do marco.
6. **Critério de pronto do marco 1:**
   - o Essentials abre normalmente, com tudo funcionando como antes;
   - dois cubos aparecem, com profundidade correta entre eles;
   - girar por Ruby muda a proporção das faces e revela face nova;
   - mudar o z do elemento põe o cubo atrás de um sprite e na frente de outro.

---

## 7. Diagnóstico, para não gastar rodada à toa

| Sintoma | Causa mais provável |
|---|---|
| Cubo não aparece de jeito nenhum | elemento não foi inserido na cena, ou `visible` falso, ou z fora da faixa. Testar com z alto, tipo 10000. |
| Cubo aparece, mas sem oclusão entre eles | anexo de profundidade não chegou ao alvo corrente. Lembrar do `swapRender` do tom de cinza: **os dois** `rt[]` precisam de anexo. |
| Cubo aparece e o 2D quebra depois | estado não restaurado. Suspeitos, nesta ordem: `DepthMask` deixado em `TRUE`, `GL_CULL_FACE` deixado ligado, VAO ainda preso. |
| Oclusão some só em alguns mapas | é o caso do tom de cinza acima. |
| Profundidade limpa só num pedaço da tela | tesoura ligada no `glClear`. |
| Tela preta ao abrir | FBO ficou incompleto. Chamar `CheckFramebufferStatus` logo após anexar e imprimir o resultado. |
| Quebra ao redimensionar a janela | profundidade não realocada no `PingPong::resize`. |
| Compila no Linux e falha no macOS | shader usando recurso que o GLES não tem. Conferir contra `shader/common.h`. |

---

## 8. Investigação de referência, já feita

**Maker Studio** (Toskan4134), integração pública em
`https://github.com/Toskan4134/maker-studio`, pasta `Integrations/`. O editor
é fechado, a integração do lado do jogo é aberta. Apurado lendo o código:

- guarda dado extra **dentro do `.rxdata`**, em ivar (`@extended_layers` como
  string JSON no `RPG::Map`, `@expanded_autotiles` no `RPG::Tileset`). A doc
  deles confirma em `docs/layers.md:16`. É a técnica que o Prism adotou, com a
  diferença de gravarmos `Array` de `Hash` de verdade em vez de JSON;
- camadas extras são **sprites do RGSS num pool**, com bitmap montado por
  `blt` e z por banda. Composição 2D pura;
- **zero** ocorrências de `Win32API`, `MiniFFI`, `Fiddle`, `.dll`, `OpenGL`,
  `shader`, `socket` ou `TCP` no pacote inteiro. Não há componente nativo;
- o único "3D" deles é **sombra em modo 3D**: uma segunda cópia da silhueta
  ancorada no topo do sprite, com cisalhamento nas diagonais
  (`docs/shadows.md:21`). É truque 2D, não renderização;
- comunicação editor para jogo é um **arquivo sentinela** cujo `mtime` o jogo
  lê uma vez por segundo (`011_LiveReload.rb`).

Conclusão: o Maker Studio prova o caminho de dados, e prova que o lado do jogo
**não** faz 3D. Para 3D real não há precedente a copiar dele.

**MV3D** (Cutievirus), para RPG Maker MV: Babylon.js num canvas separado do
canvas do PIXI, com o RPG Maker continuando dono de evento e movimento. A
lição que importa é a divisão de responsabilidade, não a técnica: o motor web
permite dois canvases, e no mkxp-z temos algo melhor, um contexto único onde os
dois passos convivem e a ordem é resolvida pelo z que o motor já mantém.
MZ3D, PNDK 3D e Mantis3D são da mesma família, mas **não foram verificados**.

**Neo Mode 7** (MGCaladtogel), RMXP dos anos 2000: fazia chão em perspectiva
com rotação de mapa. A versão rápida **depende de uma DLL em C++** carregada
pelo Ruby. Como aquelas DLLs mexem nas estruturas internas do player original
da Enterbrain, que no mkxp-z não existem, o script não se transplanta. Serve
como prova histórica de que perspectiva em RGSS é possível, não como código
reaproveitável.

---

## 9. O que não fazer

- não aceitar bitmap, sprite ou pré-renderização como substituto de malha
  neste trilho. O caminho de imagem já existe e está documentado à parte;
- não criar um segundo contexto OpenGL. O contexto é um só, e é o do motor;
- não mexer no viewport nem no `FBO::Draw` dentro do `draw()`;
- não editar scripts do kit do Essentials. O que o Prism acrescenta entra por
  `Plugins/Prism/`;
- não compilar o mkxp-z inteiro no contêiner sem necessidade: a cota de disco
  é fixa e o build das dependências é grande.
