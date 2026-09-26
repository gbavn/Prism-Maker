#===============================================================================
# Prism Test 3D - o caminhao no mapa, em malha de verdade
#
# Desenha o mesmo modelo que o editor assa, so que como geometria viva dentro
# do jogo, plantada na grade do mapa e rolando junto com ele.
#
# Ha duas cameras aqui, e a escolha e a constante PERSPECTIVA.
#
# A paralela e a original: nao e camera girada, e cisalhamento. O mapa do RPG
# Maker nao tem fuga de ponto e nao comprime nada, um tile e um quadrado de 32
# por 32 venha ele do topo ou do rodape. Ela esta medida e provada, com o ponto
# do mundo caindo a menos de meio pixel de onde o motor poe o sprite.
#
# A de perspectiva veio depois, porque com a paralela o objeto 3D le como
# adesivo colado na tela: nada nele muda de tamanho com a distancia. Nela o
# chao tambem entra na conta. O elemento fica entre o tile de chao e o resto,
# copia o mapa ja composto e redesenha ele como um plano inclinado, e o objeto
# passa a usar a mesma camera. E o que os Pokemon de DS fazem, terreno em 3D
# com personagem em cartao, e o laboratorio daqui veio de um deles.
#
# Enquanto os sprites nao entrarem na camera, casa e personagem continuam no
# lugar antigo e vao discordar do chao. E esperado, e e o passo seguinte.
#
# O giro merece explicacao. O editor gira o modelo inteiro em volta do centro
# da area no chao, e o motor gira cada caixa no proprio centro. Dao no mesmo
# desde que a posicao de cada caixa seja girada em volta do pivo antes, que e o
# que rotate_around faz aqui. Sem isso o caminhao viraria uma pilha de caixas
# giradas no lugar, cada uma para um lado.
#
# Os objetos vem do mapa, e nao mais de constante chumbada aqui. Quem coloca e
# o modo Objects do editor, quem grava e o ctrl+S, na ivar `@prism_objects` do
# RPG::Map, e quem le e o `objetos_do_mapa` logo abaixo. As caixas do caminhao
# continuam embutidas porque elas sao a regua antiga, e ficam desligadas.
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
    # A borda mais ao sul entre os objetos do mapa: com um elemento so, quem
    # manda na ordem e o que esta mais para baixo. Mapa sem objeto cai na
    # celula padrao, que e o caso do ensaio antes de qualquer colocacao.
    sul = objetos_do_mapa.map { |obj| obj[:y] }.max || CELULA_PADRAO[1]
    ((sul + 1 - $game_map.display_y / 128.0) * 32 + 32).round
  end

  # Perspectiva de verdade, em vez da projecao paralela do mapa.
  #
  # PITCH e a inclinacao da camera a partir do horizonte, em graus. FOV e o
  # campo de visao: ele e o botao da intensidade, porque a distancia da camera
  # e derivada dele para a fileira do meio encostar nas duas bordas da tela.
  # Com FOV 2 a tela fica quase igual a de hoje, com 35 o trapezio e claro.
  #
  # CHAO liga a captura do mapa ja composto e o redesenho como plano. Ela so
  # funciona com o elemento entre o tile de chao e o resto, que e o CHAO_Z.
  # Os numeros sao os do proprio DS, da decompilacao do Platinum, em
  # `src/overlay005/field_camera.c`, array `sCameraTypes`, entrada padrao:
  #
  #   fovY       8.0914306640625 graus, que la e MEIO-angulo
  #   angulo    -59.051513671875 graus, a partir do horizonte
  #   distancia  666.922119140625, com 16 unidades por tile, logo 41,68 tiles
  #
  # Duas conferencias que validam a leitura. O fovY ser meio-angulo sai de
  # 666,92 x tan(8,09) x 2 = 189,7 unidades, ou 11,86 tiles, contra os 12 que
  # cabem nos 192 pixels da tela do DS. E o angulo ser a partir do horizonte
  # sai do HALL_OF_ORIGIN, que e uma plataforma vista quase de cima e tem 78,4.
  #
  # E nas 17 cameras do jogo `distancia x tan(fovY)` da sempre 96 unidades, que
  # sao 6 tiles, meia tela. Ou seja eles mantem a altura visivel fixa e usam o
  # campo de visao so para variar a forca da perspectiva. E a mesma regra que o
  # `mapViewProjection` daqui ja usava, entao so faltava o numero.
  PERSPECTIVA = true
  PITCH = 59.05
  FOV = 16.18
  CHAO = true

  # Os sprites 2D posicionados pela camera 3D.
  #
  # Com 59 graus o chao comprime na vertical em sin(59), que da 0,858, e a arte
  # do Essentials nao e desenhada comprimida. Nenhum ajuste de camera faz as
  # duas casarem: ou os sprites entram na camera, ou nao fecha.
  SPRITES_NA_CAMERA = true

  # O z do elemento quando o chao esta ligado.
  #
  # O TilemapRenderer do Essentials da z zero ao tile de prioridade zero, que e
  # o chao, e z crescente ao resto. Em z 1 o elemento desenha num instante em
  # que so o chao foi pintado, e e isso que permite capturar so ele.
  CHAO_Z = 1

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
  LINHAS = true

  # Um pilar fino e alto na celula do jogador, so para responder uma pergunta.
  #
  # Toda regua ate aqui era simetrica em torno do centro da tela: a placa sob o
  # jogador, as linhas de emenda, a grade. E o centro e exatamente onde um
  # espelhamento vertical nao muda nada, entao nenhuma delas poderia detectar
  # um. O pilar e assimetrico por construcao: ou ele sobe, e nao ha
  # espelhamento, ou ele desce, e ha.
  #
  # O que motiva a pergunta: com a distancia travada em 14, o modelo da 90,0 px
  # no topo da tela e 102,9 na base, e o jogo mostrou 103,5 e 90,5. O meio bate
  # e as pontas saem trocadas. Isso tambem explicaria o laboratorio parecer de
  # ponta-cabeca, que ate agora ficou sem resposta.
  PROVA_ALTURA = true
  LINHAS_RAIO = 4
  LINHAS_COMPRIMENTO = 20

  # Print e regua em numero, gravados pelo proprio jogo.
  #
  # O Essentials ja tem F8, que grava o PNG na pasta de saves do motor. Este e
  # outro proposito: cai dentro do projeto, em Prism/Shots, e ao lado do PNG vai
  # um .txt com a regua em numero. Print responde "parece certo", numero
  # responde "esta certo", e e a segunda pergunta que ficou meses sem resposta
  # aqui: toda regua anterior era simetrica em volta do centro da tela, que e
  # exatamente onde um espelhamento vertical nao muda nada.
  #
  # F7 porque F8 ja e do kit e F9 abre o menu de debug do mapa.
  PRINT = true
  PRINT_TECLA = Input::F7
  PRINT_PASTA = "Prism/Shots"
  PRINT_RAIO = 6

  # Quadros ate o print automatico, lidos do ambiente. Serve para abrir o jogo
  # e ir embora: PRISM_SHOT_FRAMES=180 grava tres segundos depois do mapa.
  PRINT_AUTOMATICO = (ENV["PRISM_SHOT_FRAMES"] || "0").to_i

  # Quanto o plano de chao passa do quadro capturado, em fracao da tela.
  #
  # A sobra existe porque o chao inclinado encurta na projecao e deixa faixa
  # vazia no horizonte. O preco e que fora do quadro a textura fica grampeada
  # na borda (`GL_CLAMP_TO_EDGE`), entao a ultima fileira de pixels se repete
  # para fora, e sobre agua isso le como reflexo, que foi o que apareceu no
  # jogo.
  #
  # A lateral vai a zero: a faixa vazia que a sobra conserta e em cima e
  # embaixo, entao o valor em X pagava o defeito sem comprar nada. O que sobra
  # em X sao cunhas vazias nos cantos de baixo, e o conserto de verdade delas e
  # desenhar o mapa mais largo que a tela, que e outro passo.
  SOBRA_X = 0.0
  SOBRA_Z = 0.15

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

  # Quantas unidades do arquivo valem uma celula. Modelo de jogo de DS costuma
  # vir com 16, e as medidas deste batem: 116 por 80 por 70 unidades viram
  # 7,3 por 5 por 4,4 celulas, que e tamanho de predio de mapa.
  UNIDADES_POR_CELULA = 16.0

  # A grade de ensaio precisa de uma celula de referencia, e ela e a do
  # primeiro objeto do mapa, ou a padrao quando nao ha nenhum.

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

  def start(viewport = nil)
    return unless running?
    @viewport = viewport
    # O viewport importa, e muito. No mkxp-z um Viewport e ao mesmo tempo uma
    # cena, com lista propria de z, e um elemento na cena de cima. Os tiles e
    # os personagens vivem dentro do viewport do mapa, entao elemento na cena
    # da tela nunca disputa z com eles: disputa com o viewport inteiro, que
    # desenha de uma vez. Por isso o objeto ficava por cima de tudo, desse
    # jeito que parece adesivo colado.
    Prism3D.start(CHAO_Z, @viewport)

    if PERSPECTIVA
      # O terceiro argumento e a distancia da camera, e o negativo pede a
      # automatica, que e `tilesWide / (2 tan(fov/2) x proporcao)`.
      #
      # O padrao do binding era 14.0, e chamar com dois argumentos travava a
      # camera a 14 tiles em vez dos 42,2 que a regra pede, o que deixava tudo
      # tres vezes maior. Medido: as linhas verticais sairam com 97 px por tile
      # no meio da tela, contra 32, e 42,2 dividido por 14 da 3,01. O padrao ja
      # foi para zero no motor, e o valor continua explicito aqui porque a
      # armadilha so some de verdade quando o jogo roda com o motor novo.
      Prism3D.perspective(PITCH, FOV, -1.0)
      Prism3D.ground = CHAO
      # So no motor novo: com o executavel antigo o metodo nao existe, e sem a
      # pergunta o erro derrubaria o resto do `start`, que e onde o 3D liga.
      if Prism3D.respond_to?(:ground_overshoot)
        Prism3D.ground_overshoot(SOBRA_X, SOBRA_Z)
      end
    else
      Prism3D.perspective_off
      Prism3D.ground = false
    end

    # A partir daqui o elemento existe, e `project` pode ser chamado.
    @iniciado = true

    # Os modelos sao carregados sob demanda, por `modelo_de`, conforme o mapa
    # pede. Carregar aqui exigiria saber de antemao o que cada mapa usa, e o
    # mapa e quem sabe isso.
    @modelos = {}
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

  # Os objetos gravados no mapa que tem modelo 3D.
  #
  # Este e o fim do caminho que comecou no editor: quem coloca e o modo
  # Objects, quem grava e o ctrl+S, e quem le e isto aqui. Antes a celula do
  # laboratorio vinha chumbada numa constante, o que servia para provar que a
  # malha desenha, e nada mais.
  #
  # Objeto sem `model` e ignorado de proposito: ele e a imagem assada, e quem
  # desenha essa e o plugin 2D, `Plugins/Prism/001_Objects.rb`. Desenhar os
  # dois daria o mesmo predio duas vezes.
  def objetos_do_mapa
    mapa = $game_map.instance_variable_get(:@map)
    gravados = mapa ? mapa.instance_variable_get(:@prism_objects) : nil
    return [] unless gravados.is_a?(Array)

    gravados.map do |obj|
      caminho = obj[:model] || obj["model"]
      next nil if caminho.nil? || caminho.empty?

      {
        :model => caminho,
        :x => (obj[:x] || obj["x"]).to_i,
        :y => (obj[:y] || obj["y"]).to_i,
        :yaw => ((obj[:yaw] || obj["yaw"]) || 0).to_f,
      }
    end.compact
  rescue StandardError
    []
  end

  # Carrega um modelo uma vez so e guarda o indice.
  #
  # O motor mantem a malha enquanto o jogo viver, entao recarregar a cada
  # quadro seria desperdicio puro. O cache e por caminho, porque o mesmo
  # modelo pode estar plantado em varias celulas.
  def modelo_de(caminho)
    @modelos ||= {}
    return @modelos[caminho] if @modelos.key?(caminho)

    @modelos[caminho] = Prism3D.load_model(caminho, UNIDADES_POR_CELULA)
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

  # A regua da camera em numero, uma linha por fileira do mapa.
  #
  # `px_por_tile` e o passo em Y tem que CRESCER de cima para baixo: o rodape
  # da tela esta mais perto da camera que o topo. Se encolherem, a projecao
  # esta espelhada na vertical, e e isso que explicaria o laboratorio de ponta
  # cabeca. A medida sai da mesma `fileira` que posiciona os sprites, entao ela
  # nao e uma segunda implementacao que poderia estar certa sozinha.
  def regua_em_numero
    linhas = [format("# pitch %.2f  fov %.2f  display %.3f,%.3f  mapa %d",
                     PITCH, FOV,
                     $game_map.display_x / 128.0, $game_map.display_y / 128.0,
                     $game_map.map_id),
              "# fileira   y_na_tela   px_por_tile   passo_y"]

    centro = $game_player ? $game_player.y : 0
    anterior = nil
    (-PRINT_RAIO..PRINT_RAIO).each do |i|
      z = centro + i + 1.0
      d = fileira(z)
      next if d.nil?

      passo = anterior.nil? ? 0.0 : d[2] - anterior
      anterior = d[2]
      linhas << format("%9.1f %11.2f %13.3f %9.2f", z, d[2], d[1], passo)
    end

    linhas.join("\r\n") + "\r\n"
  end

  # Grava o print e a regua lado a lado, com o mesmo carimbo de hora.
  #
  # Dentro do projeto de proposito, e nao na pasta de saves do motor: assim o
  # arquivo cai na arvore do repositorio, que e onde quem esta desenvolvendo
  # consegue ler sem procurar.
  def gravar_print
    Dir.create(PRINT_PASTA)
    base = File.join(PRINT_PASTA, Time.now.strftime("%Y-%m-%d_%H-%M-%S"))
    Graphics.screenshot(base + ".png")
    File.open(base + ".txt", "wb") { |f| f.write(regua_em_numero) }
  rescue StandardError
    # Print nunca pode derrubar o jogo.
  end

  def update
    return unless running?
    return unless $game_map

    # A camera e o z saem do `sincronizar`, que roda uma vez por quadro e pode
    # ter sido chamado antes daqui, por um sprite. Se os sprites estiverem fora
    # da camera, ninguem chamou ainda, e entao e aqui que ela e posta.
    #
    # display_x conta em quartos de pixel: 32 pixels por tile vezes 4 da 128.
    if camera_ativa?
      sincronizar
    else
      Prism3D.map_camera($game_map.display_x / 128.0,
                         $game_map.display_y / 128.0,
                         32.0, ALTURA_NA_TELA)
      # Com o chao ligado o z fica preso no CHAO_Z: a captura precisa acontecer
      # logo depois do tile de chao, e nao na altura do objeto. Sem chao, o z
      # acompanha a rolagem, como o dos personagens.
      Prism3D.z = (PERSPECTIVA && CHAO) ? CHAO_Z : element_z
    end

    medir if MEDIR

    if PRINT
      @quadros_vividos = (@quadros_vividos || 0) + 1
      if Input.trigger?(PRINT_TECLA)
        gravar_print
      elsif PRINT_AUTOMATICO > 0 && @quadros_vividos == PRINT_AUTOMATICO
        gravar_print
      end
    end

    radianos = YAW * Math::PI / 180.0
    Prism3D.clear

    if GRADE
      (-GRADE_RAIO..GRADE_RAIO).each do |dx|
        (-GRADE_RAIO..GRADE_RAIO).each do |dz|
          # Placa de um tile, quase rente ao chao, no centro da celula. Serve
          # de regua: se ficarem grudadas nos tiles enquanto o mapa rola, a
          # camera esta certa.
          tom = ((dx + dz) % 2 == 0) ? 0.85 : 0.35
          centro = objetos_do_mapa.first
          alvo_x = centro ? centro[:x] : CELULA_PADRAO[0]
          alvo_z = centro ? centro[:y] : CELULA_PADRAO[1]
          Prism3D.add_box(alvo_x + dx + 0.5, 0.02,
                          alvo_z + dz + 0.5,
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

    if PROVA_ALTURA && $game_player
      # Duas celulas a leste do jogador, e nao em cima dele: os tres cubos de
      # 0,3 celula que estavam aqui ficavam atras do sprite e nao apareciam no
      # print, que e o motivo de a pergunta ter passado um ensaio inteiro sem
      # resposta. Grosso, alto e fora do caminho.
      base_x = $game_player.real_x / 128.0 + 2.5
      base_z = $game_player.real_y / 128.0 + 1.0

      # Do chao para cima, vermelho embaixo e azul em cima. Se o azul sair
      # embaixo no print, o espelhamento vertical esta confirmado em uma olhada.
      [[0.5, 1.0, 0.15, 0.15],
       [1.5, 1.0, 0.65, 0.15],
       [2.5, 0.2, 0.9, 0.3],
       [3.5, 0.15, 0.35, 1.0]].each do |altura, r, g, b|
        Prism3D.add_box(base_x, altura, base_z, 0.8, 1.0, 0.8, 0.0, r, g, b)
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

    # Os objetos que o editor gravou no mapa.
    #
    # O modelo ja sai assentado do carregador do motor, entao nao ha sobra de
    # altura para descontar aqui: isso era conta do tempo em que a celula vinha
    # chumbada e o Y do arquivo comecava em 1.
    objetos_do_mapa.each do |obj|
      indice = modelo_de(obj[:model])
      next if indice.nil?

      Prism3D.add_model(indice, obj[:x], 0.0, obj[:y],
                        obj[:yaw] * Math::PI / 180.0)
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
  proc { |_spriteset, viewport|
    PrismTest3D.protegido("start") { PrismTest3D.start(viewport) }
  }
)

EventHandlers.add(:on_frame_update, :prism_test_3d,
  proc {
    PrismTest3D.protegido("update") { PrismTest3D.update }
  }
)

#===============================================================================
# Os sprites 2D entram na camera 3D
#
# Isto e o lado Ruby do 2.5D: o personagem e o tile alto continuam sendo os
# mesmos sprites do Essentials, so que posicionados e escalados pela camera em
# perspectiva, em vez de pela conversao 2D do motor.
#
# Reabrir classe a partir de um plugin e o caminho normal do Essentials, e nao
# toca nos scripts do kit.
#
# Duas coisas que a conta obriga e que nao sao obvias:
#
# A escala do sprite vem da LARGURA da fileira, nunca da altura. Um cartao em
# pe e virado para a camera, entao a altura dele na tela segue a mesma escala
# isotropica da largura. Ja uma unidade de altura do MUNDO projeta k x cos(59),
# ou seja 51 por cento do que uma unidade de largura projeta, porque o eixo
# vertical do mundo esta inclinado em relacao a visao. Usar essa escala
# deitaria o personagem. E por isso que o DS usa billboard com matriz de
# rotacao em vez de so posicionar um quadrado no mundo.
#
# A camera e sincronizada sob demanda, e nao no `on_frame_update`. O Essentials
# dispara esse evento no FIM do `updateSpritesets`, ou seja depois de os
# sprites ja terem se posicionado. Quem sincronizasse la entregaria a eles a
# camera do quadro anterior, e o mapa inteiro andaria um quadro atrasado.
#===============================================================================

module PrismTest3D
  module_function

  def camera_ativa?
    return false unless SPRITES_NA_CAMERA && PERSPECTIVA
    return false unless running? && @iniciado && $game_map
    true
  end

  # Poe a camera do quadro corrente, uma vez so por quadro.
  def sincronizar
    return unless camera_ativa?
    return if @quadro == Graphics.frame_count

    @quadro = Graphics.frame_count
    @fileiras = {}

    Prism3D.map_camera($game_map.display_x / 128.0,
                       $game_map.display_y / 128.0,
                       32.0, ALTURA_NA_TELA)
    Prism3D.z = (PERSPECTIVA && CHAO) ? CHAO_Z : element_z
  rescue StandardError
    @fileiras = {}
  end

  # A fileira `mundo_z` do chao, projetada uma vez e reaproveitada.
  #
  # A camera so inclina, nunca gira de lado, entao todo ponto de uma mesma
  # fileira tem a mesma profundidade: a fileira sai de duas projecoes e o resto
  # dela e aritmetica, sem aproximacao. Sao dezenas de chamadas por quadro em
  # vez de uma por sprite, e o TilemapRenderer tem 663 sprites.
  #
  # Devolve [x_em_zero, pixels_por_tile, y_da_fileira].
  def fileira(mundo_z)
    @fileiras ||= {}
    achado = @fileiras[mundo_z]
    return achado if achado

    a = Prism3D.project(0.0, 0.0, mundo_z)
    return nil if a.nil?
    b = Prism3D.project(1.0, 0.0, mundo_z)
    return nil if b.nil?

    largura = b[0] - a[0]
    return nil if largura <= 0.01

    @fileiras[mundo_z] = [a[0], largura, a[1]]
  end

  # Onde um ponto do chao cai na tela, e qual a escala do sprite ali.
  # Devolve [x, y, zoom] com o zoom ja relativo aos 32 pixels de um tile.
  def no_chao(mundo_x, mundo_z)
    d = fileira(mundo_z)
    return nil if d.nil?

    [d[0] + (mundo_x * d[1]), d[2], d[1] / 32.0]
  end
end

#-------------------------------------------------------------------------------
# Personagem e evento
#
# O `Sprite_Character` ja usa `ox` na metade da largura e `oy` na altura, entao
# o `x` e o `y` dele SAO o ponto de contato com o chao. Basta trocar os dois
# pelos projetados e deixar o `zoom` cuidar do tamanho: as ancoras continuam
# valendo, porque o zoom escala em volta delas.
#-------------------------------------------------------------------------------
class Sprite_Character < RPG::Sprite
  alias prism3d_update update

  def update
    prism3d_update
    return unless PrismTest3D.camera_ativa?
    return if !self.visible || @character.nil?

    PrismTest3D.sincronizar

    # A posicao do mundo sai da conta que o MOTOR ja fez, e nao do `real_x` cru.
    #
    # `screen_x` e `screen_y_ground` medem contra `self.map.display_x`, o mapa
    # DO PROPRIO personagem (`Game_Character`, no Scripts.rxdata). Com o
    # `$map_factory` os mapas conectados ficam vivos ao mesmo tempo, cada um com
    # a sua rolagem, e casar `real_x` cru com a rolagem do mapa atual jogava os
    # nadadores da rota de baixo la para cima na tela.
    #
    # Desfazendo a rolagem do mapa atual, a conta volta para coordenada de
    # mundo. No mapa atual ela da exatamente o que estava aqui antes,
    # `real_x / 128 + 0.5` e `real_y / 128 + 1.0`, e ainda herda de graca o
    # `x_offset` e o personagem que ocupa mais de uma celula, que o calculo
    # antigo ignorava. O `screen_x` ja vem centrado e o `screen_y_ground` ja vem
    # no rodape da celula, que sao justamente o meio e o mais um de antes.
    ponto = PrismTest3D.no_chao(
      ($game_map.display_x / 128.0) + (@character.screen_x / 32.0),
      ($game_map.display_y / 128.0) + (@character.screen_y_ground / 32.0))
    return if ponto.nil?

    self.x = ponto[0].round
    self.y = ponto[1].round
    self.zoom_x = ponto[2]
    self.zoom_y = ponto[2]
  rescue StandardError
    # Sprite que falhar aqui fica onde o motor deixou, e o jogo segue.
  end
end

#-------------------------------------------------------------------------------
# Os tiles altos
#
# So os de prioridade maior que zero precisam disto. Os de prioridade zero sao
# o chao, e ja estao dentro da imagem que o plano de chao capturou: mexer neles
# seria trabalho para nada, e eles nem aparecem, porque o plano os cobre.
#
# O gancho nao recebe a celula do mundo, mas ela sai da inversa da conta que ele
# mesmo acabou de fazer: `mundo = tela / 32 + rolagem`.
#
# O `TileSprite` nao usa `ox` nem `oy`, entao o `x` e o `y` sao o canto superior
# esquerdo, e o rodape centrado precisa ser descontado na mao.
#-------------------------------------------------------------------------------
class TilemapRenderer
  alias prism3d_refresh_tile_coordinates refresh_tile_coordinates

  def refresh_tile_coordinates(tile, x, y)
    prism3d_refresh_tile_coordinates(tile, x, y)
    return unless PrismTest3D.camera_ativa?

    prioridade = tile.priority
    return if prioridade.nil? || prioridade <= 0

    PrismTest3D.sincronizar

    celula_x = (tile.x / 32.0) + ($game_map.display_x / 128.0)
    celula_z = (tile.y / 32.0) + ($game_map.display_y / 128.0)

    ponto = PrismTest3D.no_chao(celula_x.round + 0.5, celula_z.round + 1.0)
    return if ponto.nil?

    zoom = ponto[2]
    tile.zoom_x = ZOOM_X * zoom
    tile.zoom_y = ZOOM_Y * zoom
    tile.x = (ponto[0] - (DISPLAY_TILE_WIDTH * 0.5 * zoom)).round
    tile.y = (ponto[1] - (DISPLAY_TILE_HEIGHT * zoom)).round
  rescue StandardError
    # Idem: tile que falhar fica onde o motor deixou.
  end
end
