# Prism

Editor de mundo 2.5D para projetos Pokémon Essentials (RPG Maker XP).

A arquitetura, o escopo e a ordem de construção estão em `ARCHITECTURE.md`.
Leia esse arquivo inteiro antes de qualquer trabalho não trivial.

## Regra de trabalho

Propor antes de gerar. Explique o que pretende fazer e espere confirmação
antes de escrever código. Vale também para refatorações grandes e para
mudanças de estrutura do repositório.

Não usar travessão em texto voltado ao usuário.

Commits vão direto para `main`. Não criar branch de trabalho, não abrir
pull request e não pedir merge manual, a menos que seja pedido.

## Layout do repositório

- `ARCHITECTURE.md` documento de arquitetura, fonte da verdade do projeto.
- `docs/scene-format.md` especificação do contrato entre editor e runtime.
- `packages/scene-format/` schema, validação e tipos compartilhados.
- `packages/rxdata-parser/` leitura e escrita de `.rxdata` (Ruby Marshal 4.8).
- `packages/editor/` editor em Electron, React, Tailwind e Three.js.
- `tools/` scripts auxiliares que rodam fora do CI, como o gerador da
  referência de teste em Ruby.
- `examples/` cena e manifesto de exemplo, validados por teste.
- `Game/essentials-v21.1/` projeto Pokémon Essentials v21.1 completo, usado
  como referência e fixture de teste. Código de terceiro, licença
  CC BY-NC-SA 4.0. **Não editar os scripts do kit.** O que o Prism acrescenta
  entra por fora: `Plugins/Prism/` (nosso, carregado pelo `PluginManager` do
  próprio Essentials) e `Graphics/Objects/` (imagens que o editor assa).

Monorepo com pnpm. Da raiz: `pnpm install`, depois `pnpm -r test`,
`pnpm -r typecheck` e `pnpm -r build`.

Para abrir o editor: `pnpm --filter @prism/editor start`. Ele já abre o
Essentials de referência do próprio repositório, sem configuração.

O editor abre em **2D**, que é o modo certo para desenhar: o dado de um mapa
do RPG Maker é 2D, e o 3D existe para conferir relevo. O botão 2D/3D troca.

O **zoom do 2D é em escala fixa**, e 100 por cento quer dizer um tile de 32
pixels ocupando 32 pixels de tela. O mapa rola com o botão direito ou o do
meio, e a roda troca o degrau. Encaixar o mapa inteiro na janela, que é o
"fit", deforma o pixel art, porque uma célula sai com 17 pixels e a vizinha
com 18: por isso fit é uma escolha e não o padrão. A escala também é presa ao
pixel real do dispositivo, senão monitor com escala do Windows em 125 por
cento borra tudo de novo.

A **grade de células** vem ligada e o botão Grid desliga. Ela é plana e fica
por cima de tudo, o que basta em 2D: a câmera olha reto para baixo, então
elevação muda a altura e não a posição no plano. Em 3D ela some, porque grade
plana cortando relevo não ajuda a ler nada.

**A interface do editor é em inglês**, e só ela: comentários de código,
mensagens de commit e documentação seguem em português. O público de
Pokémon Essentials é majoritariamente anglófono.

A interface segue a forma de um editor de mapas completo (trilha de modos,
painel de mapas, viewport, paleta de tiles, barra de status), mas a maior
parte ainda não faz nada. Controle sem função aparece com **ponto âmbar** e
avisa "Coming soon" ao ser clicado, via o componente `Soon`. A regra é mostrar
o que falta, não esconder: esconder daria uma impressão de completude que o
projeto não tem. Ao implementar algo, troque o `Soon` pelo controle real.

Ícones vêm de `lucide-react`, importados um a um para o bundler descartar o
resto. Não desenhe SVG à mão.

A identidade visual é deliberadamente própria: trilha vertical de modos em vez
de abas horizontais, painéis flutuantes arredondados em vez de painéis colados
por divisórias, e acento violeta. Layout de editor de mapa é convenção do
gênero e não há problema em segui-la, mas a aparência não deve lembrar nenhuma
ferramenta específica.

Modo **Draw**: escolha o tile na paleta da direita, arraste na paleta para
pegar um bloco em vez de um tile só, e o seletor de camada escolhe entre as
três do XP. Ferramentas: lápis, retângulo, balde e borracha. Arrastar pinta
contínuo e o arrasto inteiro é um passo só de desfazer. Shift apaga, seja
qual for a ferramenta. Grava no `.rxdata`.

A camada selecionada sai com a cor cheia e as outras saem apagadas, as de cima
mais que as de baixo, porque são elas que tapam o que está sendo desenhado.
Apagar e não esconder: sumir com as outras faria pintar por cima sem saber o
que já existe ali.

O cursor cobre exatamente a área que a ferramenta pintaria, vinda da mesma
função que decide o que a pincelada escreve. Bloco escolhido na paleta manda
no tamanho do pincel, e o cursor mostra isso.

Editar é coisa da visão 2D. Em 3D o botão esquerdo gira a câmera: em 2D se
edita, em 3D se olha.

Modo **Terrain**: clique sobe, shift mais clique desce, L nivela o bloco.
Grava no `.scene.json`.

Modo **Events**: lista os eventos do mapa, clicar na lista ou na célula
seleciona, e o painel mostra a página um como ela está no `.rxdata`. Ainda é
só leitura: criar, mover e editar evento vêm depois. Evento é desenhado com o
frame certo do charset, deitado no chão em 2D e em pé no 3D. Toda célula com
evento ganha um contorno violeta, porque porta e aviso usam charset quase
transparente de propósito e sem a marca ficariam invisíveis para quem edita.

Comum aos dois: teclas 1 2 3 trocam o pincel, ctrl+Z desfaz, ctrl+S grava. O
desfazer é um só para os dois modos, porque quem aperta ctrl+Z espera voltar a
última coisa que fez, não a última coisa que fez naquela ferramenta.

Alteração pendente nunca é jogada fora em silêncio. Trocar de mapa ou abrir o
Playtest com edição não gravada pergunta antes, numa caixa do sistema com
Save, Discard e Cancel. **Playtest** grava o que você mandar gravar e abre o
`Game.exe` do projeto com o argumento `debug`. Verificado no fonte do mkxp-z,
`src/config.cpp`: `debug` ou `test` como primeiro argumento liga o modo do
editor, que é o que faz `$DEBUG` valer true. Sem isso o Essentials não compila
plugin novo, e o plugin do Prism nem seria carregado. O kit do v21.1 vem com mkxp-z, e só o
executável do Windows: em outro sistema o botão diz isso em vez de falhar
calado.

`PRISM_PROJECT` aponta o editor para outro projeto, em vez do Essentials do
repositório.

Para checar que o arquivo gravado continua abrindo no motor, sem depender de
abrir o jogo, existe `node tools/verify-write.mjs`: ele pinta, grava, e manda
o Ruby de verdade abrir o resultado com `Marshal`, que é o mesmo caminho do
RGSS e do mkxp-z. Precisa de Ruby instalado e roda fora do CI, como o
`dump-expected.rb`.

Para provar que o editor renderiza sem ter tela, existe um smoke test com
imagem: `PRISM_SMOKE_SHOT=/caminho/saida.png` faz o app subir, esperar a
primeira cena e salvar um PNG antes de sair. Em máquina sem monitor, rodar
com `xvfb-run`. Com `PRISM_SMOKE_EDIT=1` junto, o próprio Electron injeta
mouse e teclado e desenha antes do print, o que exercita seleção, as
ferramentas, a escolha de bloco na paleta e a reconstrução da cena. Com
`PRISM_SMOKE_EVENTS=1`, entra no modo Events e seleciona um evento pela
célula. Com `PRISM_SMOKE_LAYER=<n>`, troca a camada em foco. Com
`PRISM_SMOKE_3D=1`, troca para 3D antes do print. Com
`PRISM_SMOKE_PLACE=<mapa>:<dx>,<dy>`, abre o mapa e coloca um objeto 3D. Com `PRISM_SMOKE_SWITCH=1`
troca de mapa, e `PRISM_SMOKE_ANSWER=save|discard|cancel` responde pela caixa
de alteração pendente, que sem tela ninguém consegue clicar. **Ao rodar com
`save`, use `PRISM_PROJECT` apontando para uma cópia**: senão o ensaio grava
no Essentials versionado do repositório.

Armadilhas já pagas na viewport, todas descobertas rodando o app:

- escala quebrada deforma pixel art: com o mapa encolhido para caber, uma
  célula sai com 17 pixels e a vizinha com 18. Daí a escala fixa em número
  inteiro de pixels por pixel de textura, e a câmera presa à grade de pixels,
  senão meio pixel de deslocamento traz a deformação de volta;
- textura de tileset precisa de `colorSpace = SRGBColorSpace`, senão o Three
  a trata como linear e clareia o mapa inteiro;
- `magFilter` e `minFilter` em `NearestFilter`, senão o pixel art borra e puxa
  cor do tile vizinho no atlas;
- texturas ficam em cache vivo enquanto a viewport existir. Recarregar a cada
  redesenho cria corrida: a pincelada seguinte descarta a textura que o
  redesenho anterior ainda usava. O preço é que o cache assume arquivo imóvel:
  ao reassar um objeto, é preciso esquecer aquela URL, senão a viewport segue
  mostrando a imagem velha;
- tile é plano, então levantar uma célula deixa buraco. As paredes de degrau
  (`skirts`) fecham o vão, e saem escurecidas porque material sem iluminação
  não dá nenhuma pista de profundidade;
- autotile **não** se resolve olhando vizinhos para **desenhar**: o RPG Maker
  já grava a forma no próprio tile id, e basta `tileId % 48`. A montagem dos
  quatro quartos vem da tabela `AUTOTILE_PATTERNS` do Essentials, dentro do
  `Scripts.rxdata`. Autotile com 32 pixels de altura não tem forma, só quadros
  de animação;
- charset de evento é a imagem dividida em quatro por quatro, a coluna vem do
  `pattern` e a linha de `(direction - 2) / 2`, com os pés do sprite no rodapé
  da célula. Verificado no `Sprite_Character` do `Scripts.rxdata`, não deduzido;
- marca de evento é contorno, não preenchimento: o sprite de uma porta é opaco
  e do tamanho da célula, e retângulo cheio esconde justamente o que a marca
  aponta. Tapete por baixo também não serve, pelo mesmo motivo;
- ao **pintar**, aí sim a vizinhança importa: a forma é recalculada pela
  tabela `NEIGHBORS_TO_AUTOTILE_INDEX`, também do Essentials. A comparação é
  por família de autotile, não por tile id exato, senão cada célula se acharia
  sozinha. Fora do mapa conta como igual, que é o que evita borda desenhada no
  limite do mapa.

## Objetos 3D

O jogo não tem 3D. O mkxp-z expõe ao Ruby a API do RGSS, que é 2D inteira:
`Bitmap`, `Sprite`, `Viewport`, `Plane`. Não há malha, câmera nem shader para
script nenhum, e o `ARCHITECTURE.md` já previa isso ao deixar o fork do motor
como último passo.

O que existe hoje é o caminho que funciona sem tocar no motor:

1. O editor modela o objeto em 3D (`scene/model.ts`, descrição pura em caixas).
2. Assa uma imagem com Three, fora da tela, em câmera **ortográfica** a 45
   graus (`ui/viewport/bake.ts`). Ortográfica porque o chão do mapa é desenhado
   assim: o tileset do Essentials não tem fuga de ponto, e um objeto assado em
   outra projeção discorda do chão em que pisa. Perspectiva de verdade exigiria
   desenhar o chão junto, em perspectiva, que é o que só o fork do mkxp-z
   resolve.
3. O que dá volume, já que a projeção é fixa, são três coisas: o objeto
   **girado no próprio eixo** (`yaw`), que mostra a lateral além da frente;
   ambiente baixo com sol forte, senão todas as faces saem com o mesmo brilho;
   e a **sombra projetada no chão**, que prende o objeto ao terreno. Gira o
   objeto, nunca a câmera: a câmera é a do mapa, e girá-la faria a projeção do
   objeto brigar com a do chão. Caminhão estacionado de lado é natural, chão de
   lado não é.
4. Grava o PNG em `Graphics/Objects/` e a colocação **dentro do próprio
   `.rxdata`**, na ivar `@prism_objects` do `RPG::Map`. O Marshal preserva
   qualquer ivar e o RPG Maker XP ignora o que não conhece, então o projeto
   continua abrindo no editor original e no jogo sem o plugin.

   Junto vai a **âncora**: em que pixel da imagem cai o canto sudoeste da área
   no chão. Sem ela o encaixe seria adivinhação, porque a imagem tem margem
   para a sombra caber e o objeto girado não encosta nas bordas dela. Com ela,
   posicionar é uma subtração, e vale para qualquer modelo, giro ou tamanho.
5. `Plugins/Prism/` lê essa ivar e cria um `Sprite` por objeto, entregue ao
   `Spriteset_Map` pelo gancho oficial `:on_new_spriteset_map`. O spriteset
   passa a atualizar e descartar cada um, então não há alias em script do kit.

A técnica de guardar dado extra em ivar dentro do `.rxdata` veio da
integração do **Maker Studio**, que faz o mesmo com `@extended_layers`. A
diferença: eles gravam uma string JSON e trazem um parser próprio, porque o
mkxp-z não tem a biblioteca `json`; aqui vai um `Array` de `Hash` de verdade,
com chaves em símbolo, que o jogo lê sem parser nenhum. É o que o nosso
escritor de Marshal permite fazer e o editor deles não.

Profundidade segue a regra dos personagens: `z` igual à borda de baixo da área
no chão, então o jogador passa atrás ou na frente conforme anda.

## Escrita no projeto do usuário

Gravar no `.rxdata` é a operação de maior risco do editor, e tem três
proteções que não podem ser removidas por conveniência:

1. **Backup na primeira escrita da sessão**, em `.prism/backups/<data-hora>/`.
2. **Escrita atômica**: arquivo temporário mais rename, para que uma queda no
   meio não deixe um `.rxdata` pela metade.
3. **Recusa se o arquivo mudou em disco** depois de aberto aqui, para não
   apagar edição feita no RPG Maker com o editor aberto.

O documento inteiro é lido, só a `Table` é alterada e o resto sai como entrou.
Nunca reconstrua o documento a partir dos tipos do parser: isso descartaria em
silêncio qualquer campo que ele não conheça.

Versão alvo fixada: Essentials v21.1 (30/07/2023), a última estável.
A v22 segue em desenvolvimento, sem data de lançamento.

## Custo de contexto

O projeto Essentials tem centenas de MB de assets. Abrir qualquer um deles
queima contexto sem retorno algum.

**Nunca ler** (bloqueado por `permissions.deny` em `.claude/settings.json`):
`Audio/`, `Graphics/`, `Fonts/`, `*.exe`, `*.dll`, `*.sf2`, e todo arquivo
binário de imagem ou som.

**O que realmente importa:**

| Caminho | Formato | Para quê |
|---|---|---|
| `Data/*.rxdata` | binário, Ruby Marshal 4.8 | mapas, tilesets, eventos |
| `PBS/*.txt` | texto | dados do jogo; `map_metadata.txt` e `map_connections.txt` descrevem o mundo |
| `Data/Scripts/` | Ruby | semântica do Essentials: terrain tags, movimento em grade, conexões |

## Como inspecionar binário

Os `.rxdata` são o dado central do projeto, mas abrir com a ferramenta de
leitura despeja lixo binário. Use Bash com saída limitada:

```bash
file Data/Map001.rxdata
ls -la Data/*.rxdata
xxd -l 256 Data/Map001.rxdata
```

Para imagens, tirar dimensões com `file` ou `identify`, nunca abrir o PNG.

Quando o parser existir, usar o parser. Nunca assumir a estrutura do
Marshal 4.8 de cabeça: verificar contra o arquivo real.

O código Ruby do Essentials vive comprimido dentro de `Data/Scripts.rxdata`.
Para consultar a semântica real do motor (colisão, terrain tags, conexões de
mapa), extraia com Zlib e leia o fonte, em vez de deduzir dos dados.
