#===============================================================================
# Prism - objetos 3D no mapa
#
# O editor modela o objeto em 3D, renderiza a imagem no angulo da camera do
# jogo e grava duas coisas: o PNG em Graphics/Objects e a colocacao dentro do
# proprio Map###.rxdata, numa variavel de instancia `@prism_objects`.
#
# O RPG Maker XP ignora ivar que nao conhece, e o Marshal do Ruby preserva
# qualquer uma, entao o projeto continua abrindo no editor original e no jogo
# sem este plugin. Rodando com ele, os objetos aparecem.
#
# Nao ha 3D em tempo real aqui: o RGSS desenha sprites 2D, e e isso que o
# plugin usa. O 3D acontece no editor, uma vez, e o resultado e a imagem. Com
# a camera do jogo parada, um render no angulo certo e indistinguivel de
# geometria desenhada a cada quadro, que e como os jogos de DS resolviam
# cenario.
#
# Nenhum script do kit e alterado: tudo entra pelo gancho
# :on_new_spriteset_map, que o proprio Essentials oferece, e os sprites sao
# entregues ao Spriteset_Map, que passa a atualizar e descartar cada um.
#===============================================================================

module Prism
  module_function

  # De onde o RPG::Cache carrega a imagem assada.
  OBJECT_FOLDER = "Graphics/Objects/"

  # Le a lista de objetos de um mapa. Mapa sem objeto nenhum e o caso comum e
  # nao e erro: nenhum mapa do Essentials tem objeto do Prism.
  def objects_for(game_map)
    return [] unless game_map
    rpg_map = game_map.instance_variable_get(:@map)
    return [] unless rpg_map
    list = rpg_map.instance_variable_get(:@prism_objects)
    list.is_a?(Array) ? list : []
  end

  # Os mapas visiveis agora. Com mapas conectados sao varios, e cada um tem a
  # propria rolagem, entao o sprite guarda de qual mapa ele e.
  def visible_maps
    return [] unless $game_map
    return $map_factory.maps if $map_factory
    [$game_map]
  end
end

#===============================================================================
# Um sprite de objeto, presa a uma celula do mapa.
#===============================================================================
class Prism_ObjectSprite < Sprite
  def initialize(viewport, map, data)
    super(viewport)
    @map      = map
    @cell_x   = data[:x].to_i
    @cell_y   = data[:y].to_i
    @depth    = [data[:depth].to_i, 1].max
    # Onde, dentro da imagem, fica o canto sudoeste da area no chao. E o
    # editor quem calcula: a imagem tem margem para a sombra caber, e o objeto
    # girado nao encosta nas bordas dela, entao apoiar pelo rodape da imagem
    # erraria a posicao.
    @anchor_x = data[:anchor_x].to_i
    @anchor_y = data[:anchor_y].to_i

    self.bitmap = RPG::Cache.load_bitmap(Prism::OBJECT_FOLDER, data[:name].to_s)
    update
  end

  def update
    return if disposed? || bitmap.nil? || bitmap.disposed?
    super

    # Posicao na tela: a celula em pixels menos o quanto o mapa ja rolou. O
    # display_x do RGSS vem em quartos de pixel, dai a divisao por
    # X_SUBPIXELS, que e a mesma conta que o Spriteset_Map faz.
    # Canto oeste da area, em pixels de tela.
    left = (@cell_x * Game_Map::TILE_WIDTH) -
           (@map.display_x / Game_Map::X_SUBPIXELS).round
    # A borda de baixo da area no chao, onde a imagem se apoia. Imagem mais
    # alta que a area sobra para cima, como qualquer construcao alta.
    foot = ((@cell_y + @depth) * Game_Map::TILE_HEIGHT) -
           (@map.display_y / Game_Map::Y_SUBPIXELS).round

    # A ancora da imagem cai exatamente no canto sudoeste da area no chao.
    self.x = left - @anchor_x
    self.y = foot - @anchor_y

    # Mesma regra de profundidade dos personagens: quem esta mais ao sul
    # desenha por cima. E o que faz o jogador passar atras do objeto ao andar
    # por tras dele, e na frente ao passar pela frente.
    self.z = foot
  end
end

#===============================================================================
# Entrega os sprites ao spriteset, que cuida de update e dispose.
#===============================================================================
EventHandlers.add(:on_new_spriteset_map, :prism_objects,
  proc { |spriteset, viewport|
    Prism.visible_maps.each do |map|
      Prism.objects_for(map).each do |data|
        next unless data.is_a?(Hash) && data[:name]
        begin
          spriteset.addUserSprite(Prism_ObjectSprite.new(viewport, map, data))
        rescue => e
          # Imagem faltando nao pode derrubar o jogo: o mapa continua jogavel
          # sem o objeto, e a mensagem diz o que faltou.
          echoln("Prism: nao consegui desenhar #{data[:name]}: #{e.message}")
        end
      end
    end
  }
)
