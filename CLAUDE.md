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
  CC BY-NC-SA 4.0. Não editar.

Monorepo com pnpm. Da raiz: `pnpm install`, depois `pnpm -r test`,
`pnpm -r typecheck` e `pnpm -r build`.

Para abrir o editor: `pnpm --filter @prism/editor start`. Ele já abre o
Essentials de referência do próprio repositório, sem configuração.

O editor abre em **2D**, que é o modo certo para desenhar: o dado de um mapa
do RPG Maker é 2D, e o 3D existe para conferir relevo. O botão 2D/3D troca.

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

Elevação: clique sobe, shift mais clique desce, teclas 1 2 3 trocam o pincel,
L nivela o bloco, ctrl+Z desfaz, ctrl+S grava o `.scene.json`.

Para provar que o editor renderiza sem ter tela, existe um smoke test com
imagem: `PRISM_SMOKE_SHOT=/caminho/saida.png` faz o app subir, esperar a
primeira cena e salvar um PNG antes de sair. Em máquina sem monitor, rodar
com `xvfb-run`. Com `PRISM_SMOKE_EDIT=1` junto, o próprio Electron injeta
mouse e teclado e levanta terreno antes do print, o que exercita seleção,
pincel e reconstrução da cena.

Armadilhas já pagas na viewport, todas descobertas rodando o app:

- textura de tileset precisa de `colorSpace = SRGBColorSpace`, senão o Three
  a trata como linear e clareia o mapa inteiro;
- `magFilter` e `minFilter` em `NearestFilter`, senão o pixel art borra e puxa
  cor do tile vizinho no atlas;
- texturas ficam em cache vivo enquanto a viewport existir. Recarregar a cada
  redesenho cria corrida: a pincelada seguinte descarta a textura que o
  redesenho anterior ainda usava;
- tile é plano, então levantar uma célula deixa buraco. As paredes de degrau
  (`skirts`) fecham o vão, e saem escurecidas porque material sem iluminação
  não dá nenhuma pista de profundidade;
- autotile **não** se resolve olhando vizinhos: o RPG Maker já grava a forma
  no próprio tile id, e basta `tileId % 48`. A montagem dos quatro quartos vem
  da tabela `AUTOTILE_PATTERNS` do Essentials, dentro do `Scripts.rxdata`.
  Autotile com 32 pixels de altura não tem forma, só quadros de animação.

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
