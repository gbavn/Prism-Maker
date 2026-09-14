# Formato de cena

> Especificação do contrato entre editor e runtime. Documento vivo.
> Versão do formato: **1**.

Este documento descreve como um mapa do RPG Maker XP vira geometria 3D. É a
peça central do Prism: enquanto editor e runtime lerem estes arquivos e
resolverem as regras na mesma ordem, os dois desenham a mesma cena.

A implementação de referência é o pacote `@prism/scene-format`. Quando este
texto e o código divergirem, o código é a verdade e este texto é o bug.

## Onde os dados moram

O formato não toca no `.rxdata`. Ele vive em arquivos paralelos:

```
projeto/
├── prism.project.json          manifesto: unidades, câmera padrão, tilesets
├── Data/
│   ├── Map002.rxdata           intocado, continua um projeto Essentials válido
│   └── Map002.scene.json       a camada 3D deste mapa
```

Consequência desejada: aberto no Essentials padrão, o projeto volta a ser 2D e
roda normalmente. O 2.5D só aparece no runtime modificado.

São dois arquivos e não um por um motivo concreto: o mapeamento de tile para
modelo é por **tileset**, e um tileset é compartilhado por dezenas de mapas.
Duplicá-lo por mapa garantiria divergência na primeira edição.

## O que o formato herda do RPG Maker XP

Tudo abaixo foi conferido contra `Game/essentials-v21.1/`, não contra
documentação.

### Tile ids

| Faixa | Significado |
|---|---|
| `0` | célula vazia naquela camada |
| `1` a `383` | autotile |
| `384` em diante | tile do bitmap do tileset |

Os autotiles ocupam 8 slots de 48 formas. O slot 0 (ids `0` a `47`) não
corresponde a nenhum autotile, então o índice em `RPG::Tileset#autotile_names`
é `floor(id / 48) - 1` e a forma é `id % 48`.

Um mapa tem exatamente três camadas. O Essentials as varre de cima para baixo,
na ordem `[2, 1, 0]`.

### Tabela `passages`

Bitmask, uma entrada por tile id. A semântica foi lida de `Game_Map.rb`, dentro
de `Data/Scripts.rxdata`:

| Bit | Significado |
|---|---|
| `0x01` `0x02` `0x04` `0x08` | bloqueia entrar pela borda de baixo, esquerda, direita, cima |
| `0x0f` inteiro | intransponível |
| `0x40` | mato alto (o personagem aparece pela metade) |
| `0x80` | balcão (dá para interagir por cima) |

Não existe bit de "estrela" aqui. Quem decide se um tile é desenhado acima do
personagem é a tabela `priorities`.

### Tabela `priorities`

Zero é nível do chão. Acima de zero o tile é desenhado por cima do personagem,
o que na prática marca geometria alta: copa de árvore, telhado, beiral. Em 2.5D
isso é um bom palpite inicial de altura, e é exatamente como o formato usa.

### Onde ler isso tudo

O pacote `@prism/rxdata-parser` le e escreve `.rxdata` sem depender de Ruby
instalado. A escrita e verificada por ida e volta byte a byte nos 110 arquivos
de `Game/essentials-v21.1/Data`, o que importa porque o editor vai reescrever
mapas dentro de um projeto que a pessoa continua abrindo no RPG Maker.

### Tabela `terrain_tags`

O Essentials estende os terrain tags do XP e liga cada um a comportamentos
(`ignore_passability`, `bridge`, `deep_bush`). O formato **ainda não** consome
essa informação. Entra depois do MVP, junto com autotiles em 3D.

## `prism.project.json`

```json
{
  "formatVersion": 1,
  "essentialsVersion": "21.1",
  "units": { "tileSize": 1, "elevationStep": 0.5 },
  "camera": { "yaw": 0, "pitch": 55, "distance": 12, "rotation": "steps" },
  "tilesets": {
    "1": {
      "name": "Outside",
      "derive": {
        "passable":   { "kind": "ground" },
        "impassable": { "kind": "block", "height": 1 },
        "overhead":   { "kind": "block", "height": 2 }
      },
      "autotiles": { "0": { "kind": "model", "model": { "path": "water/sea.glb" } } },
      "tiles":     { "401": { "kind": "ground" } }
    }
  }
}
```

### `units`

Fixa a escala em um lugar só, que é o que impede editor e runtime de
divergirem. `tileSize` é quanto vale um tile de 32 pixels em unidades de mundo;
`elevationStep` é quanto vale um degrau de elevação.

### `derive`

Um tileset do Essentials tem milhares de tiles: o "Outside" tem 4400. Mapear
cada um à mão não é viável nem necessário, porque o próprio XP já registra o
que é chão e o que é parede. Estas três regras traduzem `passages` e
`priorities` em geometria, e o mapeamento manual fica só para as exceções.

## `MapNNN.scene.json`

```json
{
  "formatVersion": 1,
  "map": { "id": 2, "width": 32, "height": 21, "tilesetId": 1 },
  "elevation": { "encoding": "rle", "data": [[100, 0], [6, 2], [566, 0]] },
  "cells": { "9,3": { "ramp": { "direction": "east", "to": 2 } } },
  "camera": { "pitch": 58, "rotation": "steps" },
  "events": { "2": { "render": "billboard", "elevationOffset": 2 } }
}
```

### `map`

Espelho dos dados que vivem no `.rxdata`. **Nunca é a fonte da verdade.** Está
aqui só para detectar que alguém abriu o mapa no RPG Maker, redimensionou ou
trocou o tileset, e a cena ao lado ficou descrevendo outro mapa.
`validateSceneAgainstMap` faz essa checagem.

### `elevation`

Uma altura inteira por célula, em degraus, na mesma ordem de varredura do
`Table` do XP: x varia primeiro. Alturas negativas são válidas, para buracos e
água rebaixada.

Duas codificações, porque mapas reais são quase todos planos. Lappet Town tem
672 células e, no exemplo deste repositório, cabe em 9 pares:

- `{ "encoding": "flat", "data": [0, 0, 1, ...] }`
- `{ "encoding": "rle",  "data": [[100, 0], [6, 2], ...] }`

O resto do código só lida com o resultado decodificado. O comprimento
decodificado tem que bater com `width * height`, e o schema recusa se não bater.

### `cells`

Exceções por célula, esparso. A chave é `"x,y"`.

- `render` ignora o mapeamento do tileset só naquela célula
- `ramp` liga o nível da célula ao nível vizinho
- `collision` é `auto` por padrão, o que deixa a colisão vir de `passages` e
  mantém o jogo andando igual ao Essentials padrão

### `events`

Por id de evento, como em `RPG::Map#events`. O padrão é `billboard`: o sprite 2D
em pé encarando a câmera. Isso reaproveita todos os charsets que o projeto já
tem e evita modelar personagens em 3D. `model` exige o campo `model`.

## Como um tile vira geometria

A ordem de precedência é **sempre** esta, do mais específico para o mais geral:

1. `cells["x,y"].render`, se existir
2. `tilesets[id].tiles[tileId]`, se existir
3. `tilesets[id].autotiles[índice]`, se o tile for autotile e existir
4. `derive.impassable`, se `passages[tileId] & 0x0f == 0x0f`
5. `derive.overhead`, se `priorities[tileId] > 0`
6. `derive.passable`

Editor e runtime **precisam** resolver nessa mesma ordem. É aqui que a paridade
visual se ganha ou se perde.

## Variantes de geometria

| `kind` | Significado |
|---|---|
| `ground` | plano texturizado no nível do chão |
| `block` | bloco maciço ocupando a célula, com `height` em degraus |
| `model` | modelo glTF binário (`.glb`) |
| `hidden` | não desenha nada |

Modelos são sempre `.glb`. O schema recusa outras extensões, de propósito: o
loader do runtime (`tinygltf` ou `cgltf`) e o do editor (Babylon.js) precisam
falar o mesmo formato, ou a paridade cai.

## Versionamento

Todo arquivo carrega `formatVersion`. O gancho de migração existe desde a
versão 1 de propósito: adicionar depois, com arquivos já escritos em disco, é
muito mais caro. Ler um arquivo de versão desconhecida falha alto, nunca
silenciosamente.

## O que ainda não está no formato

Registrado aqui para não virar dívida esquecida:

- **Autotiles em 3D.** Como bordas de água e caminho se conectam. Adiado de
  propósito; é uma das partes mais chatas.
- **Terrain tags.** Ligar `ignore_passability`, `bridge` e `deep_bush` à
  geometria.
- **Iluminação de billboard.** Se o sprite recebe sombra do relevo e se projeta
  sombra. A decisão atual é sombra circular por baixo, depois do MVP.
- **Conexões entre mapas.** `map_connections` do Essentials, para o mundo
  contínuo.
