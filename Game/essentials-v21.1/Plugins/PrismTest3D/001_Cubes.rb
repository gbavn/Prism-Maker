#===============================================================================
# Prism Test 3D - o caminhao no mapa, em malha de verdade
#
# Desenha o mesmo modelo que o editor assa, so que como geometria viva dentro
# do jogo, plantada na grade do mapa e rolando junto com ele.
#
# A camera nao e uma camera girada, e cisalhamento. O mapa do RPG Maker nao tem
# fuga de ponto e nao comprime nada: um tile e um quadrado de 32 por 32 venha
# ele do topo ou do rodape. Camera de verdade a 45 graus comprimiria a
# profundidade, e o objeto iria subindo em relacao ao tile em que pisa conforme
# andasse para o sul. Por isso o chao vai 1 para 1 com a tela e a altura sobe
# reto, que e a convencao dos tiles altos do RPG Maker.
#
# O giro merece explicacao. O editor gira o modelo inteiro em volta do centro
# da area no chao, e o motor gira cada caixa no proprio centro. Dao no mesmo
# desde que a posicao de cada caixa seja girada em volta do pivo antes, que e o
# que rotate_around faz aqui. Sem isso o caminhao viraria uma pilha de caixas
# giradas no lugar, cada uma para um lado.
#
# Codigo de ensaio: as caixas estao embutidas aqui porque o editor ainda nao
# grava geometria no .rxdata, so a imagem assada e a ancora. Quando gravar,
# isto vira leitura de dado.
#===============================================================================

module PrismTest3D
  module_function

  # Abaixo dos sprites do mapa seria o certo, mas no marco 1 a ordenacao entre
  # 3D e 2D e por z de elemento: o objeto fica inteiro na frente ou inteiro
  # atras. Por cima e o que deixa ver que esta funcionando.
  ELEMENT_Z = 5000

  # Quanto um tile de altura sobe na tela. 1 e a convencao do RPG Maker.
  ALTURA_NA_TELA = 1.0

  # Giro do modelo, em graus, e o centro da area no chao em volta do qual ele
  # gira. Os dois vem de scene/model.ts.
  YAW = 24.0
  PIVO_X = 1.615
  PIVO_Z = 1.215

  # Onde plantar, em celulas, quando o mapa nao tiver objeto nenhum gravado.
  CELULA_PADRAO = [8, 8]

  # [centro_x, centro_y, centro_z, largura, altura, profundidade, r, g, b]
  CAIXAS = [
    [1.15, 0.28, 1, 2.05, 0.18, 1.5, 0.659, 0.220, 0.165],
    [1.15, 1, 1, 2, 1.25, 1.55, 0.851, 0.310, 0.239],
    [1.15, 1.32, 1, 2.02, 0.16, 1.57, 0.957, 0.945, 0.910],
    [1.15, 1.66, 1, 2.1, 0.08, 1.62, 0.659, 0.220, 0.165],
    [0.9, 1.78, 1, 0.5, 0.18, 0.45, 0.604, 0.627, 0.671],
    [2.5, 0.85, 1, 0.8, 0.95, 1.45, 0.914, 0.902, 0.867],
    [2.85, 0.5, 1, 0.55, 0.32, 1.4, 0.914, 0.902, 0.867],
    [3.05, 0.32, 1, 0.16, 0.16, 1.45, 0.604, 0.627, 0.671],
    [3.08, 0.52, 0.45, 0.1, 0.12, 0.22, 1.000, 0.949, 0.769],
    [3.08, 0.52, 1.55, 0.1, 0.12, 0.22, 1.000, 0.949, 0.769],
    [2.86, 1.05, 1, 0.1, 0.42, 1.2, 0.561, 0.827, 0.941],
    [2.5, 1.05, 1.73, 0.62, 0.36, 0.08, 0.373, 0.663, 0.800],
    [1.15, 1.12, 1.79, 1.5, 0.62, 0.1, 0.231, 0.247, 0.275],
    [1.15, 0.86, 1.92, 1.62, 0.12, 0.34, 0.541, 0.353, 0.200],
    [1.15, 0.94, 1.94, 1.66, 0.06, 0.38, 0.788, 0.604, 0.388],
    [1.15, 1.62, 2.02, 1.85, 0.08, 0.62, 0.949, 0.714, 0.196],
    [1.15, 1.56, 2.28, 1.85, 0.06, 0.16, 0.910, 0.886, 0.831],
    [0.3, 1.35, 2.28, 0.07, 0.5, 0.07, 0.604, 0.627, 0.671],
    [2, 1.35, 2.28, 0.07, 0.5, 0.07, 0.604, 0.627, 0.671],
    [0.45, 1.05, 1.81, 0.5, 0.42, 0.06, 0.231, 0.247, 0.275],
    [0.55, 0.22, 0.28, 0.42, 0.42, 0.42, 0.137, 0.137, 0.165],
    [0.55, 0.22, 0.28, 0.44, 0.2, 0.2, 0.725, 0.737, 0.769],
    [0.55, 0.22, 1.72, 0.42, 0.42, 0.42, 0.137, 0.137, 0.165],
    [0.55, 0.22, 1.72, 0.44, 0.2, 0.2, 0.725, 0.737, 0.769],
    [2.45, 0.22, 0.28, 0.42, 0.42, 0.42, 0.137, 0.137, 0.165],
    [2.45, 0.22, 0.28, 0.44, 0.2, 0.2, 0.725, 0.737, 0.769],
    [2.45, 0.22, 1.72, 0.42, 0.42, 0.42, 0.137, 0.137, 0.165],
    [2.45, 0.22, 1.72, 0.44, 0.2, 0.2, 0.725, 0.737, 0.769],
  ]

  def running?
    defined?(Prism3D) ? true : false
  end

  def start
    return unless running?
    Prism3D.start(ELEMENT_Z)
  end

  # Gira um ponto do chao em volta do pivo, para o modelo girar inteiro.
  #
  # Esta e a formula do editor, em scene/model.ts:62-64, que e a referencia:
  # e ela que decide como o objeto aparece na imagem assada.
  def rotate_around(x, z, radianos)
    dx = x - PIVO_X
    dz = z - PIVO_Z
    cos = Math.cos(radianos)
    sin = Math.sin(radianos)
    [PIVO_X + dx * cos - dz * sin, PIVO_Z + dx * sin + dz * cos]
  end

  # As celulas onde ha objeto gravado, ou a padrao se o mapa nao tiver nenhum.
  def celulas
    lista = []
    begin
      mapa = $game_map.instance_variable_get(:@map)
      gravados = mapa ? mapa.instance_variable_get(:@prism_objects) : nil
      if gravados.is_a?(Array)
        gravados.each do |obj|
          x = obj[:x] || obj["x"]
          y = obj[:y] || obj["y"]
          lista << [x, y] if x && y
        end
      end
    rescue StandardError
      # Mapa sem objeto nenhum e o caso comum, nao e erro.
    end
    lista.empty? ? [CELULA_PADRAO] : lista
  end

  def update
    return unless running?
    return unless $game_map

    # display_x conta em quartos de pixel: 32 pixels por tile vezes 4 da 128.
    Prism3D.map_camera($game_map.display_x / 128.0,
                       $game_map.display_y / 128.0,
                       32.0, ALTURA_NA_TELA)

    radianos = YAW * Math::PI / 180.0
    Prism3D.clear

    celulas.each do |celula|
      base_x = celula[0]
      base_z = celula[1]

      CAIXAS.each do |c|
        gx, gz = rotate_around(c[0], c[2], radianos)

        # O giro da caixa vai com o sinal trocado de proposito: o rotationY do
        # motor da x' = cos*x + sin*z, que e o giro do editor ao contrario. A
        # posicao segue o editor e a caixa segue o motor, entao um dos dois
        # precisa inverter, senao o corpo do caminhao aponta para um lado e
        # cada peca dele para o outro.
        Prism3D.add_box(base_x + gx, c[1], base_z + gz,
                        c[3], c[4], c[5], -radianos,
                        c[6], c[7], c[8])
      end
    end
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
