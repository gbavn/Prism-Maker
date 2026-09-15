import { describe, expect, it } from "vitest";
import {
  characterKey,
  charsetFrame,
  directionRow,
  placeSprite,
  spriteSource,
} from "./charset.js";
import type { SceneBillboard } from "./buildScene.js";

/** Um charset comum do Essentials: quatro colunas de 32 por quatro de 48. */
const image = { width: 128, height: 192 };

function event(overrides: Partial<SceneBillboard> = {}): SceneBillboard {
  return {
    id: 1,
    name: "NPC",
    cellX: 3,
    cellY: 5,
    x: 3,
    z: 5,
    base: 0,
    characterName: "trchar000",
    direction: 2,
    pattern: 0,
    tileId: 0,
    opacity: 255,
    ...overrides,
  };
}

describe("recorte do charset", () => {
  it("divide a imagem em quatro por quatro", () => {
    const frame = charsetFrame(image, 2, 0);
    expect(frame).toEqual({ x: 0, y: 0, width: 32, height: 48 });
  });

  it("a coluna vem do pattern e a linha da direção", () => {
    // Direção 6 é direita, a terceira linha.
    expect(charsetFrame(image, 6, 2)).toEqual({
      x: 64,
      y: 96,
      width: 32,
      height: 48,
    });
  });

  it("mapeia as quatro direções do XP em ordem", () => {
    expect([2, 4, 6, 8].map(directionRow)).toEqual([0, 1, 2, 3]);
  });

  it("direção estranha cai na primeira linha em vez de estourar", () => {
    // Um evento com direção inválida tem que aparecer virado errado, não
    // sumir do mapa porque a conta saiu da imagem.
    expect(directionRow(0)).toBe(0);
    expect(directionRow(99)).toBe(0);
    expect(charsetFrame(image, 99, 9).y).toBe(0);
    expect(charsetFrame(image, 2, 9).x).toBe(0);
  });

  it("a chave da imagem carrega o nome do charset", () => {
    expect(characterKey("trchar000")).toBe("character:trchar000");
  });
});

describe("colocação do sprite", () => {
  const tileSize = 1;

  it("fica do tamanho do frame, em unidades de mundo", () => {
    const flat = placeSprite(event(), charsetFrame(image, 2, 0), tileSize, "2d");
    // 32 por 48 pixels, com o tile valendo 32: um tile de largura, um e meio
    // de altura.
    expect(flat.width).toBe(1);
    expect(flat.height).toBe(1.5);
  });

  it("em pé, os pés ficam no rodapé da célula", () => {
    const up = placeSprite(event(), charsetFrame(image, 2, 0), tileSize, "3d");
    expect(up.z).toBe(5.5);
    expect(up.y).toBe(0.75);
    expect(up.x).toBe(3);
  });

  it("deitado, cresce para o norte a partir dos pés", () => {
    const flat = placeSprite(event(), charsetFrame(image, 2, 0), tileSize, "2d");
    // Pés em 5.5, um e meio de altura: o centro cai em 4.75 e o topo em 4.
    expect(flat.z).toBe(4.75);
    expect(flat.y).toBeGreaterThan(0);
    expect(flat.y).toBeLessThan(0.05);
  });

  it("sobe junto com a célula quando o terreno sobe", () => {
    const raised = placeSprite(
      event({ base: 2 }),
      charsetFrame(image, 2, 0),
      tileSize,
      "3d",
    );
    expect(raised.y).toBe(2.75);
  });
});

describe("origem do desenho do evento", () => {
  const sizes = new Map([["character:trchar000", image]]);

  it("usa o charset quando a imagem existe", () => {
    const source = spriteSource(event({ direction: 4, pattern: 1 }), sizes);
    expect(source.kind).toBe("character");
    if (source.kind !== "character") return;
    expect(source.key).toBe("character:trchar000");
    expect(source.frame).toEqual({ x: 32, y: 48, width: 32, height: 48 });
  });

  it("cai no marcador quando o charset não carregou", () => {
    expect(spriteSource(event(), new Map()).kind).toBe("marker");
  });

  it("usa o tile quando o evento tem tile no lugar de charset", () => {
    const source = spriteSource(
      event({ characterName: "", tileId: 384 + 9 }),
      sizes,
    );
    expect(source.kind).toBe("tile");
    if (source.kind !== "tile") return;
    // Nona posição: segunda linha, segunda coluna do tileset de oito colunas.
    expect(source.frame).toEqual({ x: 32, y: 32, width: 32, height: 32 });
  });

  it("evento sem gráfico nenhum vira marcador", () => {
    // Porta, aviso e transferência de mapa são assim, e precisam continuar
    // clicáveis mesmo sem nada para desenhar.
    expect(spriteSource(event({ characterName: "" }), sizes).kind).toBe("marker");
  });
});
