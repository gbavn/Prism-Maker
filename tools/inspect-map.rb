#!/usr/bin/env ruby
# frozen_string_literal: true

# Le um Map###.rxdata com o Marshal do proprio Ruby e despeja o essencial em
# JSON.
#
# Serve para responder a pergunta que nenhum teste nosso responde sozinho: o
# arquivo que o Prism gravou continua sendo um arquivo que o motor consegue
# abrir? O RGSS e o mkxp-z carregam o mapa com Marshal, entao se o Ruby le e
# encontra o que era esperado, o jogo le tambem.
#
# Uso:
#
#   ruby tools/inspect-map.rb caminho/Map002.rxdata
#
# Roda fora do CI, como o dump-expected.rb, porque depende de Ruby instalado.

require 'json'

# O Marshal exige que as constantes existam. Nao precisa de comportamento.
module RPG
  %w[Map Event EventCommand MoveRoute MoveCommand AudioFile].each do |name|
    const_set(name, ::Class.new)
  end
  Event::Page            = ::Class.new
  Event::Page::Condition = ::Class.new
  Event::Page::Graphic   = ::Class.new
end

class Color; def self._load(bytes) = allocate; end
class Tone;  def self._load(bytes) = allocate; end

class Table
  def self._load(bytes)
    table = allocate
    dims, x, y, z, size = bytes[0, 20].unpack('l<5')
    table.instance_variable_set(:@dims, dims)
    table.instance_variable_set(:@xsize, x)
    table.instance_variable_set(:@ysize, y)
    table.instance_variable_set(:@zsize, z)
    table.instance_variable_set(:@data, bytes[20, size * 2].unpack("v#{size}"))
    table
  end

  def at(x, y, z)
    @data[x + (y * @xsize) + (z * @xsize * @ysize)]
  end

  def summary
    { 'xSize' => @xsize, 'ySize' => @ysize, 'zSize' => @zsize,
      'length' => @data.size }
  end
end

def iv(object, name) = object.instance_variable_get(:"@#{name}")

path = ARGV[0] or abort 'uso: ruby tools/inspect-map.rb caminho/Map002.rxdata'
map = Marshal.load(File.binread(path))

abort "a raiz nao e um RPG::Map, e #{map.class}" unless map.is_a?(RPG::Map)

data = iv(map, 'data')
events = iv(map, 'events')

# As celulas pedidas na linha de comando, no formato x,y,z.
probes = ARGV[1..].to_a.map do |spec|
  x, y, z = spec.split(',').map(&:to_i)
  { 'cell' => spec, 'tileId' => data.at(x, y, z) }
end

puts JSON.pretty_generate(
  'class' => map.class.name,
  'tilesetId' => iv(map, 'tileset_id'),
  'width' => iv(map, 'width'),
  'height' => iv(map, 'height'),
  'autoplayBgm' => iv(map, 'autoplay_bgm'),
  'table' => data.summary,
  'events' => events.map { |id, event|
    { 'id' => id,
      'name' => iv(event, 'name').to_s.dup.force_encoding('UTF-8'),
      'x' => iv(event, 'x'), 'y' => iv(event, 'y'),
      'pages' => iv(event, 'pages').size }
  },
  'probes' => probes
)
