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

  # O z do elemento sai da borda de baixo da area do objeto no chao, que e a
  # mesma regra do `screen_z` dos personagens.
  #
  # O mundo 2D do Essentials cabe todo numa faixa estreita: o tilemap calcula
  # `tile.z = y * 32 + prioridade * 32 + 33`, o personagem usa o
  # `screen_y_ground` dele, e `always_on_top` vale 999. Com o elemento fixo em
  # 5000, como estava, o objeto 3D ficava acima de tudo para sempre, e coisa
  # que nunca passa atras de nada nao le como objeto na cena, le como adesivo
  # colado na tela.
  #
  # Ha um elemento so, entao todos os objetos 3D dividem esse z. Para um
  # laboratorio serve. Varios objetos vao pedir um elemento por objeto.
  def element_z
    borda_sul = CELULA_DO_LAB[1] + (LAB_Z_MAX / UNIDADES_POR_CELULA)
    ((borda_sul - $game_map.display_y / 128.0) * 32 + 32).round
  end

  # Quanto um tile de altura sobe na tela. 1 e a convencao do RPG Maker.
  ALTURA_NA_TELA = 1.0

  # Giro do modelo, em graus, e o centro da area no chao em volta do qual ele
  # gira. Os dois vem de scene/model.ts.
  YAW = 24.0
  PIVO_X = 1.615
  PIVO_Z = 1.215

  # Onde plantar, em celulas, quando o mapa nao tiver objeto nenhum gravado.
  CELULA_PADRAO = [8, 8]

  # Placas finas no chao, uma por celula, ao redor do objeto.
  #
  # Servem de regua: se elas ficarem grudadas nos tiles enquanto o mapa rola,
  # a camera esta certa. Se deslizarem, a conversao de rolagem esta errada. E
  # um teste que responde sozinho, sem depender de olhar o objeto inteiro e
  # achar que parece certo.
  GRADE = false
  GRADE_RAIO = 3

  # Placa desenhada na celula do proprio jogador, todo quadro.
  #
  # E a regua mais direta que existe para a camera: se ela ficar nos pes dele
  # ande para onde andar, a conversao de rolagem esta certa. O jeito como ela
  # erra e o diagnostico. Andar mais que o jogador por um fator acusa a escala,
  # e o fator diz quanto. Atrasar so enquanto anda e encaixar ao parar acusa a
  # fase. Errar por um valor fixo acusa a origem.
  PLACA_DO_JOGADOR = false

  # Linhas finas assentadas nas emendas entre tiles.
  #
  # Placa quadrada em cima de mapa desenhado e ruim de julgar: a placa e o
  # desenho mexem juntos e o desvio fica escondido no meio do quadradinho.
  # Emenda nao tem meio termo. A linha vai em Z inteiro, que e exatamente onde
  # uma fileira de tiles acaba e a outra comeca, entao ou ela cai em cima do
  # corte do desenho, e a camera esta certa, ou ela invade o meio da fileira, e
  # o quanto invadiu e a medida do erro.
  LINHAS = false
  LINHAS_RAIO = 4
  LINHAS_COMPRIMENTO = 20

  # Numeros em disco, uma linha a cada tantos quadros.
  #
  # Com eles a conferencia e aritmetica em vez de olho em pixel: da para
  # calcular onde a placa deveria cair e comparar com o `screen_x` que o proprio
  # Essentials usa para posicionar o sprite do jogador.
  MEDIR = false
  MEDIR_A_CADA = 6

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

  # O laboratorio, carregado de arquivo. Caminho relativo a pasta do jogo.
  MODELO = "Plugins/PrismTest3D/model/lab.obj"

  # Quantas unidades do arquivo valem uma celula. Modelo de jogo de DS costuma
  # vir com 16, e as medidas deste batem: 116 por 80 por 70 unidades viram
  # 7,3 por 5 por 4,4 celulas, que e tamanho de predio de mapa.
  UNIDADES_POR_CELULA = 16.0

  # A caixa do modelo, medida no proprio lab.obj, em unidades do arquivo.
  #
  # O Y comeca em 1 e nao em 0, entao plantar o modelo em y zero deixava o
  # predio 1 unidade no ar, que sao 2 pixels na tela. O LAB_Y_MIN existe para
  # descontar isso. O LAB_Z_MAX e a borda sul da area que ele ocupa no chao,
  # e e dela que sai o z do elemento.
  LAB_Y_MIN = 1.0
  LAB_Z_MAX = 36.0

  # Onde plantar o laboratorio, e quanto gira.
  CELULA_DO_LAB = [12, 6]
  LAB_YAW = 0.0

  # Desliga as caixas do caminhao, para olhar so o laboratorio.
  DESENHAR_CAMINHAO = false

  # Erro aqui nao pode derrubar o jogo, e precisa deixar rastro.
  #
  # O Essentials mostra excecao de plugin numa caixa e fecha, o que numa
  # sessao de teste vira "o jogo fechou e nao sei por que". Gravar em arquivo
  # resolve: o motivo fica em disco mesmo quando a janela ja sumiu.
  def protegido(onde)
    yield
  rescue StandardError => e
    return if @ja_avisei
    @ja_avisei = true
    begin
      File.open("prism3d-erro.txt", "wb") do |f|
        f.write("erro em #{onde}: #{e.class}: #{e.message}\r\n")
        f.write(e.backtrace[0, 8].join("\r\n")) if e.backtrace
      end
    rescue StandardError
      # Se nem gravar der, nao ha mais o que fazer aqui.
    end
  end

  def running?
    defined?(Prism3D) ? true : false
  end

  def start
    return unless running?
    # Um z qualquer aqui: o `update` corrige todo quadro, pela borda sul do
    # objeto no chao. O mapa ainda pode nem existir quando isto roda.
    Prism3D.start(0)

    # Carregar uma vez so: o modelo vive no motor enquanto o jogo viver.
    if @modelo.nil?
      @modelo = Prism3D.load_model(MODELO, UNIDADES_POR_CELULA)
      if @modelo.nil?
        echoln "Prism3D: nao consegui carregar #{MODELO}" if defined?(echoln)
      end
    end
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

  # Grava os numeros que a camera usa, para a conferencia ser aritmetica.
  #
  # O `screen_x` do jogador e a verdade do motor: e ele que posiciona o sprite.
  # Se a conta daqui discordar dele, o erro esta na conversao, e nao na matriz.
  def medir
    @quadro = (@quadro || 0) + 1
    return unless (@quadro % MEDIR_A_CADA) == 1

    linha = format(
      "display %.3f,%.3f | celula %d,%d | real %.3f,%.3f | " \
      "screen %d,%d | esperado %.1f,%.1f",
      $game_map.display_x / 128.0, $game_map.display_y / 128.0,
      $game_player.x, $game_player.y,
      $game_player.real_x / 128.0, $game_player.real_y / 128.0,
      $game_player.screen_x, $game_player.screen_y,
      ($game_player.real_x / 128.0 - $game_map.display_x / 128.0) * 32.0 + 16.0,
      ($game_player.real_y / 128.0 - $game_map.display_y / 128.0) * 32.0 + 32.0)

    File.open("prism3d-camera.txt", "ab") { |f| f.write(linha + "\r\n") }
  rescue StandardError
    # Medir nunca pode derrubar o ensaio.
  end

  def update
    return unless running?
    return unless $game_map

    # display_x conta em quartos de pixel: 32 pixels por tile vezes 4 da 128.
    Prism3D.map_camera($game_map.display_x / 128.0,
                       $game_map.display_y / 128.0,
                       32.0, ALTURA_NA_TELA)

    # Acompanha a rolagem: o z sai da posicao do objeto na tela, entao ele muda
    # a cada quadro, do mesmo jeito que o dos personagens muda.
    Prism3D.z = element_z

    medir if MEDIR

    radianos = YAW * Math::PI / 180.0
    Prism3D.clear

    if GRADE
      (-GRADE_RAIO..GRADE_RAIO).each do |dx|
        (-GRADE_RAIO..GRADE_RAIO).each do |dz|
          # Placa de um tile, quase rente ao chao, no centro da celula. Serve
          # de regua: se ficarem grudadas nos tiles enquanto o mapa rola, a
          # camera esta certa.
          tom = ((dx + dz) % 2 == 0) ? 0.85 : 0.35
          Prism3D.add_box(CELULA_DO_LAB[0] + dx + 0.5, 0.02,
                          CELULA_DO_LAB[1] + dz + 0.5,
                          0.92, 0.04, 0.92, 0.0,
                          tom, tom * 0.4, tom * 0.9)
        end
      end
    end

    if LINHAS && $game_player
      centro_x = $game_player.x
      centro_z = $game_player.y

      (-LINHAS_RAIO..LINHAS_RAIO).each do |i|
        # Horizontal: assentada na emenda de baixo da fileira centro_z + i,
        # que em coordenada de mundo e o inteiro centro_z + i + 1.
        Prism3D.add_box(centro_x + 0.5, 0.06, centro_z + i + 1.0,
                        LINHAS_COMPRIMENTO, 0.04, 0.08, 0.0,
                        0.2, 1.0, 0.4)

        # Vertical, na emenda da direita da coluna centro_x + i.
        Prism3D.add_box(centro_x + i + 1.0, 0.06, centro_z + 0.5,
                        0.08, 0.04, LINHAS_COMPRIMENTO, 0.0,
                        1.0, 0.3, 0.9)
      end
    end

    if PLACA_DO_JOGADOR && $game_player
      # `real_x`, nao `x`.
      #
      # O `x` e a celula logica, e no RPG Maker ela salta para o destino assim
      # que o passo comeca: quem anda liso e o `real_x`, e e ele que posiciona
      # o sprite (`Game_Character#screen_x`). Com `x` a placa saltava um tile
      # inteiro na frente do jogador e esperava ele chegar.
      #
      # Rente ao chao e um pouco mais alta que a grade, para nao brigar com ela
      # por profundidade quando as duas caem na mesma celula.
      Prism3D.add_box($game_player.real_x / 128.0 + 0.5, 0.05,
                      $game_player.real_y / 128.0 + 0.5,
                      0.9, 0.06, 0.9, 0.0,
                      1.0, 0.95, 0.2)
    end

    if @modelo
      # O y negativo assenta o predio: o Y do arquivo comeca em LAB_Y_MIN e
      # nao em zero, entao sem isso ele fica flutuando essa sobra.
      Prism3D.add_model(@modelo, CELULA_DO_LAB[0],
                        -LAB_Y_MIN / UNIDADES_POR_CELULA,
                        CELULA_DO_LAB[1],
                        LAB_YAW * Math::PI / 180.0)
    end

    celulas.each do |celula|
      next unless DESENHAR_CAMINHAO
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
    PrismTest3D.protegido("start") { PrismTest3D.start }
  }
)

EventHandlers.add(:on_frame_update, :prism_test_3d,
  proc {
    PrismTest3D.protegido("update") { PrismTest3D.update }
  }
)
