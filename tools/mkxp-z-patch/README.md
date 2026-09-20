# Patch do Prism3D para o mkxp-z

`prism3d.patch` é o marco 1 do 3D de verdade dentro do jogo: malha, câmera de
perspectiva e buffer de profundidade desenhados pelo próprio motor, no mesmo
contexto de OpenGL e no mesmo framebuffer que o compositor 2D do RGSS já usa.
Nada aqui é sprite, bitmap ou pré-renderização.

O porquê de cada decisão, o mapa do runtime com arquivo e linha, e as duas
armadilhas que custaram investigação estão em `docs/runtime-3d.md`. Este
arquivo é só o que fazer com o patch.

## Base

O patch se aplica em `mkxp-z/mkxp-z` no commit

    826929eeb3ebc4b887c011604919217a790770f4

Ele vive aqui, e não num fork, porque o repositório do Prism não pode conter o
mkxp-z: o motor é GPL v2 ou posterior, e com HTTPS ligado o binário sai GPL v3.
Distribuir o executável obriga a publicar o fonte do fork, então o fork é um
repositório à parte e este arquivo é a receita.

## Aplicar

```bash
git clone https://github.com/mkxp-z/mkxp-z.git
cd mkxp-z
git checkout 826929eeb3ebc4b887c011604919217a790770f4
git checkout -b autobuild
git apply /caminho/para/tools/mkxp-z-patch/prism3d.patch
```

**O ramo chama `autobuild`, e não `prism3d`, de propósito.** O
`.github/workflows/autobuild.yml` deles dispara em push só nos ramos `dev` e
`autobuild`. Num ramo com outro nome a CI não roda, e o erro é silencioso: não
aparece build nenhum e parece que o push falhou. A alternativa é o
`workflow_dispatch`, que também está ligado e roda em qualquer ramo, mas aí é
preciso acionar na mão pela aba Actions.

Duas coisas do fork que custam tempo se ninguém avisar:

- **num fork, a aba Actions vem desligada.** Abrir a aba e confirmar que sim,
  os workflows devem rodar, antes de esperar build;
- o job de Windows constrói todas as dependências do zero na primeira vez, com
  cache para as próximas. A primeira rodada é longa.

## O que ele muda

Arquivos novos:

| Arquivo | Conteúdo |
|---|---|
| `src/display/gl/prism3d-math.h` | matriz 4x4 e vetor. O motor é um compositor 2D e não tem tipo de matriz. |
| `src/display/gl/prism3d.h` | `Box`, `Renderer` e `Element : SceneElement`. |
| `src/display/gl/prism3d.cpp` | o renderizador, com os dois shaders embutidos. |
| `binding/prism3d-binding.cpp` | o módulo Ruby `Prism3D`. |

Arquivos alterados, todos com pouca coisa:

| Arquivo | Mudança |
|---|---|
| `src/display/gl/gl-fun.h` | as catorze entradas que faltavam no carregador: profundidade, face traseira, consulta de estado e renderbuffer. |
| `src/display/gl/gl-util.h` | `namespace RBO` e `FBO::setDepthTarget`. |
| `src/display/graphics.cpp` | renderbuffer de profundidade anexado aos **dois** alvos do `PingPong`, e realocado no resize. |
| `binding/binding-mri.cpp` | declara e chama `prism3DBindingInit()`. |
| `binding/meson.build`, `src/meson.build` | uma linha cada. |

Duas escolhas que fogem do plano original de `docs/runtime-3d.md`, e por quê:

- **os shaders são embutidos em `prism3d.cpp`**, e não arquivos em `shader/`.
  Os shaders do motor passam por um gerador que vira array de bytes no build;
  entrar nele significaria mexer no gerador e em `shader/meson.build` por causa
  de trinta linhas de GLSL;
- **`sharedstate.h` e `.cpp` ficam intactos.** `Graphics::getScreen()`
  (`graphics.cpp:1764`) já devolve a `Scene` da tela, então o binding alcança a
  cena sem estado global novo. O elemento é um ponteiro estático do próprio
  binding.

`glstate.h` também fica de fora: profundidade e face traseira são salvas e
restauradas na mão dentro do `draw()`, em vez de virarem propriedade do cache
do motor. É menos invasivo e some quando decidirmos formalizar.

## O que este patch contém, além do 3D

Ele carrega três coisas que não são 3D e que o trabalho exigiu:

- **o conserto de um bug do mkxp-z** em `src/util/encoding.h`: `iconv_open`
  tinha o retorno usado sem checagem, e o `(iconv_t)-1` de falha seguia para
  `iconv()`, que o dereferencia. **Sem isso nenhum build do 2.4.2 abre o
  Pokémon Essentials v21.1**, com ou sem Prism3D. Vale mandar de volta para o
  projeto original;
- **o rastro de diagnóstico** (`src/util/prism-trace.*`), que grava com
  `WriteFile` direto e instala um gravador de minidump. Existe porque nenhum
  método normal de log funciona num executável do subsistema gráfico;
- **uma mudança no workflow** para a CI guardar um `mkxp-z-symbols.exe` antes
  do `strip`, sem o qual endereço de crash não resolve para função.

## Duas armadilhas de plataforma, já pagas

As duas apareceram na primeira rodada de CI e estão consertadas no patch. Ficam
registradas porque nenhuma das duas aparece compilando no Linux.

**No Windows, `near` e `far` são macros.** O `windef.h` as define, vazias,
herança dos ponteiros segmentados de 16 bits. Uma função de projeção com
parâmetros chamados `near` e `far` vira `( + ) / ( - )` depois do
pré-processador, e o compilador para ali. Por isso os planos se chamam
`nearPlane` e `farPlane`.

**O build do macOS não usa o meson.** Ele usa `macos/mkxp-z.xcodeproj`, com a
lista de fontes escrita à mão no `project.pbxproj`. Acrescentar arquivo ao
`meson.build` não basta: o Mac compila sem eles e quebra no link, com
`Undefined symbols: prism3DBindingInit()`. O patch registra os arquivos novos
nas quatro fases de Sources do projeto.

## Compilar

**Não compilar localmente.** O `linux/Makefile` deles constrói as dependências
a partir do fonte, Ruby incluso: dezenas de minutos e alguns gigabytes, e o
contêiner tem cota fixa de disco. Usar a CI do próprio projeto:
`.github/workflows/autobuild.yml` já gera artefato de Windows (mingw64, com
cache) e de Ubuntu. O artefato de Windows traz o `x64-msvcrt-ruby310.dll`, que
é o mesmo que o kit do Essentials usa.

O que foi verificado aqui, sem build completo: `prism3d.cpp` e
`prism3d-binding.cpp` passam em `g++ -fsyntax-only` contra os cabeçalhos reais
do motor, do SDL2 e do Ruby, sem aviso. `graphics.cpp` não passa por falta dos
cabeçalhos do OpenAL, que nada têm a ver com a mudança.

## Testar

Trocar o `Game.exe` de `Game/essentials-v21.1/` pelo artefato e rodar um evento
com o Ruby abaixo. O marco 1 está pronto quando:

- o Essentials abre normalmente, com tudo funcionando como antes;
- os dois cubos aparecem, com oclusão correta entre eles;
- girar por Ruby muda a proporção das faces e revela face nova;
- mudar o z do elemento põe o cubo atrás de um sprite e na frente de outro.

## A API Ruby

```ruby
Prism3D.start(z = 0)                          # cria o elemento e insere na cena
Prism3D.camera(ex, ey, ez, ax, ay, az, fov)   # olho, alvo, campo de visão
Prism3D.add_box(x, y, z, larg, alt, prof, yaw, r, g, b)
Prism3D.clear
Prism3D.count
Prism3D.z / Prism3D.z=                        # ordem contra o 2D do RGSS
Prism3D.visible / Prism3D.visible=
Prism3D.depth_test = false                    # só para provar que é ela quem ordena
Prism3D.stop
```

Exemplo do ensaio, dois cubos que se ocluem e giram:

```ruby
Prism3D.start(5000)
Prism3D.camera(0, 3, 8, 0, 0, 0, 45)
angle = 0.0
loop do
  Prism3D.clear
  Prism3D.add_box(-0.6, 0, 0.0, 2, 2, 2, angle, 0.9, 0.3, 0.3)
  Prism3D.add_box( 0.6, 0, -1.5, 2, 2, 2, -angle, 0.3, 0.5, 0.9)
  angle += 0.02
  Graphics.update
  Input.update
  break if Input.trigger?(Input::B)
end
Prism3D.stop
```

O giro é do objeto, não da câmera, pelo mesmo motivo do 2.5D do editor: a
câmera é a da cena.

## Se der errado

A tabela de diagnóstico está na seção 7 de `docs/runtime-3d.md`. Os dois casos
que mais custam tempo:

- **cubo aparece mas não oclui**: o anexo de profundidade não chegou ao alvo
  corrente. Lembrar que o alvo troca no meio do quadro quando uma viewport tem
  tom de cinza, e por isso os dois `rt[]` recebem anexo;
- **profundidade limpa só num pedaço da tela**: tesoura ligada no `glClear`. O
  `draw()` desliga com push e devolve com pop.
