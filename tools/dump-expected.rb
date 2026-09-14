#!/usr/bin/env ruby
# frozen_string_literal: true

# Gera o arquivo de referencia usado pelos testes do @prism/rxdata-parser.
#
# A ideia e simples: o Ruby le os .rxdata com o proprio Marshal, que e a
# implementacao correta por definicao, e despeja um resumo em JSON. O leitor
# em TypeScript e entao comparado contra esse resumo. Sem isso, os testes
# estariam apenas confirmando que o leitor concorda consigo mesmo.
#
# Uso, a partir da raiz do repositorio:
#
#   ruby tools/dump-expected.rb > packages/rxdata-parser/fixtures/essentials-v21.1.json
#
# Precisa de Ruby instalado, e por isso roda fora do CI: o resultado fica
# versionado e os testes leem o arquivo pronto.

require 'json'
require 'digest'

DATA_DIR = File.join(__dir__, '..', 'Game', 'essentials-v21.1', 'Data')

# O Marshal exige que as constantes existam. Nao precisa de comportamento.
module RPG
  %w[
    Map MapInfo Event EventCommand MoveRoute MoveCommand Tileset CommonEvent
    System Actor Class Skill Item Weapon Armor Enemy Troop State Animation
    Area AudioFile Sprite Weather
  ].each { |n| const_set(n, ::Class.new) }

  Event::Page            = ::Class.new
  Event::Page::Condition = ::Class.new
  Event::Page::Graphic   = ::Class.new
  RPG::Class::Learning   = ::Class.new
  Enemy::Action          = ::Class.new
  Troop::Member          = ::Class.new
  Troop::Page            = ::Class.new
  Troop::Page::Condition = ::Class.new
  Animation::Frame       = ::Class.new
  Animation::Timing      = ::Class.new
  System::Words          = ::Class.new
  System::TestBattler    = ::Class.new
end

class Table
  def self._load(bytes)
    t = allocate
    dims, x, y, z, size = bytes[0, 20].unpack('l<5')
    t.instance_variable_set(:@dims, dims)
    t.instance_variable_set(:@xsize, x)
    t.instance_variable_set(:@ysize, y)
    t.instance_variable_set(:@zsize, z)
    t.instance_variable_set(:@data, bytes[20, size * 2].unpack("v#{size}"))
    t
  end

  def dims  = @dims
  def xsize = @xsize
  def ysize = @ysize
  def zsize = @zsize
  def data  = @data

  # Impressao digital estavel: os valores em little endian, 16 bits, com
  # SHA-256 por cima. O leitor em TypeScript calcula exatamente o mesmo.
  def fingerprint = Digest::SHA256.hexdigest(@data.pack("v#{@data.size}"))

  def summary
    { 'dims' => dims, 'xSize' => xsize, 'ySize' => ysize, 'zSize' => zsize,
      'length' => data.size, 'sha256' => fingerprint }
  end
end
class Color; def self._load(b) = allocate; end
class Tone;  def self._load(b) = allocate; end

def iv(object, name) = object.instance_variable_get(:"@#{name}")
def text(object, name) = iv(object, name).to_s.dup.force_encoding('UTF-8')

def load_rxdata(name) = Marshal.load(File.binread(File.join(DATA_DIR, name)))

def graphic_summary(graphic)
  {
    'tileId' => iv(graphic, 'tile_id'),
    'characterName' => text(graphic, 'character_name'),
    'characterHue' => iv(graphic, 'character_hue'),
    'direction' => iv(graphic, 'direction'),
    'pattern' => iv(graphic, 'pattern'),
    'opacity' => iv(graphic, 'opacity'),
    'blendType' => iv(graphic, 'blend_type')
  }
end

def event_summary(event)
  pages = iv(event, 'pages')
  {
    'id' => iv(event, 'id'),
    'name' => text(event, 'name'),
    'x' => iv(event, 'x'),
    'y' => iv(event, 'y'),
    'pageCount' => pages.size,
    'firstPage' => {
      'trigger' => iv(pages[0], 'trigger'),
      'moveType' => iv(pages[0], 'move_type'),
      'moveSpeed' => iv(pages[0], 'move_speed'),
      'moveFrequency' => iv(pages[0], 'move_frequency'),
      'walkAnime' => iv(pages[0], 'walk_anime'),
      'alwaysOnTop' => iv(pages[0], 'always_on_top'),
      'commandCount' => iv(pages[0], 'list').size,
      'firstCommandCode' => iv(iv(pages[0], 'list')[0], 'code'),
      'graphic' => graphic_summary(iv(pages[0], 'graphic'))
    }
  }
end

def map_summary(file)
  map = load_rxdata(file)
  {
    'tilesetId' => iv(map, 'tileset_id'),
    'width' => iv(map, 'width'),
    'height' => iv(map, 'height'),
    'data' => iv(map, 'data').summary,
    'events' => iv(map, 'events').sort.map { |_id, e| event_summary(e) }
  }
end

def tileset_summary(tileset)
  {
    'id' => iv(tileset, 'id'),
    'name' => text(tileset, 'name'),
    'tilesetName' => text(tileset, 'tileset_name'),
    'autotileNames' => iv(tileset, 'autotile_names')
                       .map { |n| n.to_s.dup.force_encoding('UTF-8') },
    'passages' => iv(tileset, 'passages').summary,
    'priorities' => iv(tileset, 'priorities').summary,
    'terrainTags' => iv(tileset, 'terrain_tags').summary
  }
end

tilesets = load_rxdata('Tilesets.rxdata')
map_infos = load_rxdata('MapInfos.rxdata')

output = {
  'generatedBy' => 'tools/dump-expected.rb',
  'source' => 'Game/essentials-v21.1/Data',
  'rubyVersion' => RUBY_VERSION,
  'maps' => {
    'Map001.rxdata' => map_summary('Map001.rxdata'),
    'Map002.rxdata' => map_summary('Map002.rxdata'),
    'Map007.rxdata' => map_summary('Map007.rxdata')
  },
  'tilesetCount' => tilesets.compact.size,
  'tilesets' => tilesets.compact.select { |t| [1, 4].include?(iv(t, 'id')) }
                        .map { |t| tileset_summary(t) },
  'mapInfoCount' => map_infos.size,
  'mapInfos' => map_infos.sort.first(10).to_h do |id, info|
    [id.to_s, {
      'name' => text(info, 'name'),
      'parentId' => iv(info, 'parent_id'),
      'order' => iv(info, 'order'),
      'expanded' => iv(info, 'expanded'),
      'scrollX' => iv(info, 'scroll_x'),
      'scrollY' => iv(info, 'scroll_y')
    }]
  end
}

puts JSON.pretty_generate(output)
