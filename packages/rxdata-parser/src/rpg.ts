import { load } from "./marshal/load.js";
import {
  RubyObject,
  RubyString,
  Table,
  type RubyValue,
} from "./marshal/values.js";

/**
 * Camada tipada sobre os objetos crus do Marshal.
 *
 * Os nomes dos campos abaixo foram lidos dos arquivos reais em
 * `Game/essentials-v21.1/Data/`, nao de documentacao. Campos que o Prism ainda
 * nao usa (audio de fundo, lista de encontros) ficam de fora de proposito:
 * quando forem necessarios, entram junto com o teste que os exercita.
 */

export class RxdataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RxdataError";
  }
}

function ivar(object: RubyObject, name: string): RubyValue {
  const value = object.get(name);
  if (value === undefined) {
    throw new RxdataError(
      `${object.className} nao tem a variavel @${name}; ` +
        `presentes: ${[...object.ivars.keys()].join(", ")}`,
    );
  }
  return value;
}

function asInteger(object: RubyObject, name: string): number {
  const value = ivar(object, name);
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new RxdataError(`${object.className}#${name} nao e inteiro`);
  }
  return value;
}

function asBoolean(object: RubyObject, name: string): boolean {
  const value = ivar(object, name);
  if (typeof value !== "boolean") {
    throw new RxdataError(`${object.className}#${name} nao e booleano`);
  }
  return value;
}

function asText(object: RubyObject, name: string): string {
  const value = ivar(object, name);
  if (!(value instanceof RubyString)) {
    throw new RxdataError(`${object.className}#${name} nao e string`);
  }
  return value.text;
}

function asTable(object: RubyObject, name: string): Table {
  const value = ivar(object, name);
  if (!(value instanceof Table)) {
    throw new RxdataError(`${object.className}#${name} nao e Table`);
  }
  return value;
}

function asObject(value: RubyValue, expected: string): RubyObject {
  if (!(value instanceof RubyObject) || value.className !== expected) {
    throw new RxdataError(`esperava ${expected}`);
  }
  return value;
}

export interface RPGEventGraphic {
  tileId: number;
  characterName: string;
  characterHue: number;
  direction: number;
  pattern: number;
  opacity: number;
  blendType: number;
}

export interface RPGEventCommand {
  code: number;
  indent: number;
  parameters: RubyValue[];
}

export interface RPGEventPage {
  graphic: RPGEventGraphic;
  /** 0 acao, 1 contato com o jogador, 2 contato com evento, 3 automatico, 4 processo paralelo. */
  trigger: number;
  moveType: number;
  moveSpeed: number;
  moveFrequency: number;
  walkAnime: boolean;
  stepAnime: boolean;
  directionFix: boolean;
  through: boolean;
  alwaysOnTop: boolean;
  /** Lista de comandos, ainda sem interpretacao. Ver ARCHITECTURE.md, fase 3. */
  commands: RPGEventCommand[];
}

export interface RPGEvent {
  id: number;
  name: string;
  x: number;
  y: number;
  pages: RPGEventPage[];
}

export interface RPGMap {
  tilesetId: number;
  width: number;
  height: number;
  /** Grade de tiles: largura x altura x 3 camadas. */
  data: Table;
  events: Map<number, RPGEvent>;
}

export interface RPGTileset {
  id: number;
  name: string;
  tilesetName: string;
  autotileNames: string[];
  passages: Table;
  priorities: Table;
  terrainTags: Table;
}

export interface RPGMapInfo {
  name: string;
  parentId: number;
  order: number;
  expanded: boolean;
  scrollX: number;
  scrollY: number;
}

function toGraphic(value: RubyValue): RPGEventGraphic {
  const g = asObject(value, "RPG::Event::Page::Graphic");
  return {
    tileId: asInteger(g, "tile_id"),
    characterName: asText(g, "character_name"),
    characterHue: asInteger(g, "character_hue"),
    direction: asInteger(g, "direction"),
    pattern: asInteger(g, "pattern"),
    opacity: asInteger(g, "opacity"),
    blendType: asInteger(g, "blend_type"),
  };
}

function toCommands(value: RubyValue): RPGEventCommand[] {
  if (!Array.isArray(value)) {
    throw new RxdataError("a lista de comandos nao e um array");
  }
  return value.map((entry) => {
    const command = asObject(entry, "RPG::EventCommand");
    const parameters = ivar(command, "parameters");
    if (!Array.isArray(parameters)) {
      throw new RxdataError("parametros de comando nao sao um array");
    }
    return {
      code: asInteger(command, "code"),
      indent: asInteger(command, "indent"),
      parameters,
    };
  });
}

function toPage(value: RubyValue): RPGEventPage {
  const page = asObject(value, "RPG::Event::Page");
  return {
    graphic: toGraphic(ivar(page, "graphic")),
    trigger: asInteger(page, "trigger"),
    moveType: asInteger(page, "move_type"),
    moveSpeed: asInteger(page, "move_speed"),
    moveFrequency: asInteger(page, "move_frequency"),
    walkAnime: asBoolean(page, "walk_anime"),
    stepAnime: asBoolean(page, "step_anime"),
    directionFix: asBoolean(page, "direction_fix"),
    through: asBoolean(page, "through"),
    alwaysOnTop: asBoolean(page, "always_on_top"),
    commands: toCommands(ivar(page, "list")),
  };
}

function toEvent(value: RubyValue): RPGEvent {
  const event = asObject(value, "RPG::Event");
  const pages = ivar(event, "pages");
  if (!Array.isArray(pages)) {
    throw new RxdataError("as paginas do evento nao sao um array");
  }
  return {
    id: asInteger(event, "id"),
    name: asText(event, "name"),
    x: asInteger(event, "x"),
    y: asInteger(event, "y"),
    pages: pages.map(toPage),
  };
}

/** Le um MapNNN.rxdata. */
export function loadMap(bytes: Uint8Array): RPGMap {
  const map = asObject(load(bytes), "RPG::Map");
  const rawEvents = ivar(map, "events");
  if (!(rawEvents instanceof Map)) {
    throw new RxdataError("RPG::Map#events nao e um Hash");
  }

  const events = new Map<number, RPGEvent>();
  for (const [key, value] of rawEvents) {
    if (typeof key !== "number") {
      throw new RxdataError("id de evento nao e inteiro");
    }
    events.set(key, toEvent(value));
  }

  return {
    tilesetId: asInteger(map, "tileset_id"),
    width: asInteger(map, "width"),
    height: asInteger(map, "height"),
    data: asTable(map, "data"),
    events,
  };
}

/**
 * Le o Tilesets.rxdata.
 *
 * O arquivo e um array indexado por id, e a posicao 0 e sempre nil. O retorno
 * e um Map por id para nao propagar esse buraco.
 */
export function loadTilesets(bytes: Uint8Array): Map<number, RPGTileset> {
  const list = load(bytes);
  if (!Array.isArray(list)) {
    throw new RxdataError("Tilesets.rxdata nao e um array");
  }

  const tilesets = new Map<number, RPGTileset>();
  for (const entry of list) {
    if (entry === null) continue;
    const tileset = asObject(entry, "RPG::Tileset");
    const autotiles = ivar(tileset, "autotile_names");
    if (!Array.isArray(autotiles)) {
      throw new RxdataError("autotile_names nao e um array");
    }
    const id = asInteger(tileset, "id");
    tilesets.set(id, {
      id,
      name: asText(tileset, "name"),
      tilesetName: asText(tileset, "tileset_name"),
      autotileNames: autotiles.map((value) =>
        value instanceof RubyString ? value.text : "",
      ),
      passages: asTable(tileset, "passages"),
      priorities: asTable(tileset, "priorities"),
      terrainTags: asTable(tileset, "terrain_tags"),
    });
  }
  return tilesets;
}

/** Le o MapInfos.rxdata, um Hash de id do mapa para metadados. */
export function loadMapInfos(bytes: Uint8Array): Map<number, RPGMapInfo> {
  const raw = load(bytes);
  if (!(raw instanceof Map)) {
    throw new RxdataError("MapInfos.rxdata nao e um Hash");
  }

  const infos = new Map<number, RPGMapInfo>();
  for (const [key, value] of raw) {
    if (typeof key !== "number") {
      throw new RxdataError("id de mapa nao e inteiro");
    }
    const info = asObject(value, "RPG::MapInfo");
    infos.set(key, {
      name: asText(info, "name"),
      parentId: asInteger(info, "parent_id"),
      order: asInteger(info, "order"),
      expanded: asBoolean(info, "expanded"),
      scrollX: asInteger(info, "scroll_x"),
      scrollY: asInteger(info, "scroll_y"),
    });
  }
  return infos;
}
