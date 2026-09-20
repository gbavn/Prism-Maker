#===============================================================================
# Prism Test 3D - o ensaio do marco 1
#
# Dois cubos de verdade, malha com OpenGL, desenhados pelo motor dentro do
# mesmo quadro que o mapa 2D. Existe para provar tres coisas de uma vez:
#
#   1. o Essentials abre e roda como antes, com o motor remendado;
#   2. a profundidade funciona entre objetos 3D, por pixel: o cubo da frente
#      tapa o de tras, e a ordem em que eles sao desenhados nao importa;
#   3. o giro e real, nao imagem: as faces mudam de proporcao e a lateral
#      aparece conforme o cubo roda.
#
# Isto e codigo de ensaio e sai quando o marco 1 fechar. Nao e a API final.
#
# Nenhum script do kit e alterado: tudo entra pelos ganchos :on_new_spriteset_map
# e :on_frame_update, que o proprio Essentials oferece.
#
# Sem o motor remendado, a constante Prism3D nao existe, e o plugin apenas se
# cala. O jogo continua funcionando com o Game.exe original.
#===============================================================================

module PrismTest3D
  module_function

  # z alto de proposito: no marco 1 queremos os cubos por cima de tudo, para
  # nao haver duvida sobre o que se esta vendo. Baixar este numero e o teste
  # de ordenacao contra os sprites do RGSS.
  ELEMENT_Z = 5000

  # O cubo da direita fica mais longe da camera. Com profundidade ligada o da
  # esquerda o tapa; sem ela, quem pinta por ultimo vence e o resultado sai
  # errado. A ordem de insercao abaixo e deliberadamente a errada.
  def running?
    defined?(Prism3D) ? true : false
  end

  def start
    return unless running?
    Prism3D.start(ELEMENT_Z)
    Prism3D.camera(0.0, 3.0, 8.0, 0.0, 0.0, 0.0, 45.0)
    @angle = 0.0
  end

  def update
    return unless running?
    @angle = (@angle || 0.0) + 0.02
    Prism3D.clear
    # O de tras entra primeiro, o da frente depois: se a profundidade nao
    # estivesse funcionando, o de tras apareceria por cima.
    Prism3D.add_box( 0.6, 0.0, -1.5, 2.0, 2.0, 2.0, -@angle, 0.3, 0.5, 0.9)
    Prism3D.add_box(-0.6, 0.0,  0.0, 2.0, 2.0, 2.0,  @angle, 0.9, 0.3, 0.3)
  end
end

EventHandlers.add(:on_new_spriteset_map, :prism_test_3d,
  proc { |_spriteset, _viewport|
    PrismTest3D.start
  }
)

EventHandlers.add(:on_frame_update, :prism_test_3d,
  proc {
    PrismTest3D.update
  }
)
