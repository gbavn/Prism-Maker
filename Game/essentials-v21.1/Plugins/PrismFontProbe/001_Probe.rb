#===============================================================================
# Prism Font Probe - mede a fonte e grava num arquivo
#
# Existe para comparar dois executaveis sem recompilar nada: rodando o mesmo
# plugin com o Game.exe original do kit e com o nosso, a diferenca nos numeros
# diz de quem e o texto cortado.
#
# Duas licoes da primeira versao desta sonda, que media errado:
#
# 1. medir com a fonte que o jogo usa, e nao com a Arial padrao do RGSS. A
#    fonte vem do proprio kit, por pbSetSystemFont, que e a funcao que o
#    Essentials chama antes de escrever qualquer coisa;
# 2. pintar no retangulo do tamanho que o jogo usa. A primeira versao pintava
#    num bitmap alto demais, entao nada cortava e todo caso dava "cabe". O
#    Essentials faz assim:
#
#      height = text_size(text).height
#      draw_text(x, y, width, height, text, align)
#
#    ou seja, o retangulo tem exatamente a altura prometida. Se o glifo for
#    mais alto que isso, corta, e e esse o teste.
#
# Codigo de investigacao, sai quando o assunto fechar.
#===============================================================================

module PrismFontProbe
  module_function

  # O nome do arquivo carrega a versao do motor, de proposito. Com um nome fixo,
  # uma rodada em que a sonda nao roda deixa o arquivo da rodada anterior no
  # lugar, e a copia seguinte leva conteudo velho com nome novo. Ja aconteceu
  # aqui e custou uma conclusao errada.
  def nome_do_arquivo
    versao = begin
      System::VERSION.to_s
    rescue StandardError
      "motor-desconhecido"
    end
    "prism-font-probe-" + versao.gsub(/[^0-9A-Za-z._-]/, "-") + ".txt"
  end

  TEXTOS = ["Agjpqy", "gjpqy", "ABCDEF", "Welcome to the world of Pokemon"]

  # Conta a primeira e a ultima linha com pixel opaco.
  def faixa_pintada(bitmap)
    primeira = nil
    ultima = nil
    y = 0
    while y < bitmap.height
      x = 0
      achou = false
      while x < bitmap.width
        if bitmap.get_pixel(x, y).alpha > 0
          achou = true
          break
        end
        x += 2
      end
      if achou
        primeira = y if primeira.nil?
        ultima = y
      end
      y += 1
    end
    return [nil, nil, 0] if primeira.nil?
    [primeira, ultima, ultima - primeira + 1]
  end

  def medir(linhas, rotulo, preparar)
    # Folga generosa: aqui queremos a altura real do glifo, sem recorte.
    solto = Bitmap.new(700, 120)
    preparar.call(solto)
    linhas << ""
    linhas << "-- #{rotulo}: #{solto.font.name.inspect} tamanho #{solto.font.size}"

    TEXTOS.each do |texto|
      medida = solto.text_size(texto)

      solto.clear
      solto.draw_text(0, 0, solto.width, solto.height, texto)
      _topo, _base, altura_livre = faixa_pintada(solto)

      # Agora do jeito do jogo: retangulo com a altura prometida.
      apertado = Bitmap.new(700, medida.height)
      preparar.call(apertado)
      apertado.draw_text(0, 0, apertado.width, apertado.height, texto)
      _t2, _b2, altura_apertada = faixa_pintada(apertado)
      apertado.dispose

      perdido = altura_livre - altura_apertada
      veredito = (perdido > 0) ? "CORTA #{perdido} px" : "inteiro"

      linhas << format("  %-34s promete %3d x %2d | solto pinta %2d | apertado pinta %2d | %s",
                       texto.inspect, medida.width, medida.height,
                       altura_livre, altura_apertada, veredito)
    end

    solto.dispose
  end

  def rodar
    linhas = []
    linhas << "== Prism Font Probe =="
    linhas << "rodado em: #{Time.now.strftime('%d/%m/%Y %H:%M:%S')}"
    begin
      linhas << "motor: #{System::VERSION}"
    rescue StandardError
      linhas << "motor: nao informado"
    end

    # A fonte do jogo, pela propria funcao do kit.
    begin
      linhas << "fonte de sistema do kit: #{MessageConfig.pbGetSystemFontName.inspect}"
      linhas << "tamanho: #{MessageConfig::FONT_SIZE}"
      medir(linhas, "fonte do jogo", proc { |b| pbSetSystemFont(b) })
    rescue StandardError => e
      linhas << "NAO CONSEGUI USAR A FONTE DO JOGO: #{e.class}: #{e.message}"
    end

    # A padrao, so para comparacao.
    begin
      medir(linhas, "fonte padrao do RGSS", proc { |b| })
    rescue StandardError => e
      linhas << "erro na fonte padrao: #{e.class}: #{e.message}"
    end

    File.open(nome_do_arquivo, "wb") { |f| f.write(linhas.join("\r\n")) }
  rescue StandardError => e
    File.open(nome_do_arquivo, "wb") { |f| f.write("ERRO: #{e.class}: #{e.message}\r\n#{e.backtrace[0, 6].join("\r\n")}") }
  end
end

EventHandlers.add(:on_frame_update, :prism_font_probe,
  proc {
    next if $prism_font_probe_feito
    $prism_font_probe_feito = true
    PrismFontProbe.rodar
  }
)
