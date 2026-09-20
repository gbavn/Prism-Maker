#===============================================================================
# Prism Font Probe - mede a fonte e grava num arquivo
#
# Existe para comparar dois executaveis sem recompilar nada: rodando o mesmo
# plugin com o Game.exe original do kit e com o nosso, a diferenca nos numeros
# diz de quem e o texto cortado.
#
# O Essentials desenha texto pedindo a altura ao motor e usando esse numero
# como area de recorte:
#
#   height = text_size(text).height
#   mkxp_draw_text(x, y, width, height, text, align)
#
# Entao se text_size devolver altura menor que a do glifo, o texto corta. Esta
# sonda mede exatamente isso: a altura que o motor promete contra a altura que
# ele realmente pinta, contada em pixels que sairam do preto.
#
# Codigo de investigacao, sai quando o assunto fechar.
#===============================================================================

module PrismFontProbe
  module_function

  ARQUIVO = "prism-font-probe.txt"

  TEXTOS = [
    "Agjpqy",
    "gjpqy",
    "ABCDEF",
    "Welcome to the world of Pokemon",
    "Pokemon"
  ]

  # Pinta o texto num bitmap bem mais alto que o necessario e conta a primeira
  # e a ultima linha com pixel opaco. Isso da a altura que o motor de fato
  # desenhou, sem depender de olhar a tela.
  def altura_pintada(bitmap, texto)
    bitmap.clear
    bitmap.draw_text(0, 0, bitmap.width, bitmap.height, texto)

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
        x += 4
      end
      if achou
        primeira = y if primeira.nil?
        ultima = y
      end
      y += 1
    end

    return [0, 0, 0] if primeira.nil?
    [primeira, ultima, ultima - primeira + 1]
  end

  def rodar
    linhas = []
    linhas << "== Prism Font Probe =="
    begin
      linhas << "motor: #{System::VERSION}"
    rescue StandardError
      linhas << "motor: nao informado"
    end

    fontes = []
    fontes << ["padrao", Font.default_name, Font.default_size]
    begin
      fontes << ["mensagem", MessageConfig.pbGetSystemFontName,
                 MessageConfig.pbGetSystemFontSize]
    rescue StandardError
      # Essentials pode nao expor isso; a fonte padrao ja basta.
    end

    fontes.each do |rotulo, nome, tamanho|
      bitmap = Bitmap.new(640, 96)
      bitmap.font.name = nome if nome
      bitmap.font.size = tamanho if tamanho

      linhas << ""
      linhas << "-- fonte #{rotulo}: #{nome.inspect} tamanho #{bitmap.font.size}"

      TEXTOS.each do |texto|
        medida = bitmap.text_size(texto)
        topo, base, alto = altura_pintada(bitmap, texto)
        veredito = (alto > medida.height) ? "CORTA" : "cabe"
        linhas << format("  %-34s promete %2d x %2d | pinta de y=%2d a y=%2d, altura %2d | %s",
                         texto.inspect, medida.width, medida.height,
                         topo, base, alto, veredito)
      end

      bitmap.dispose
    end

    File.open(ARQUIVO, "wb") { |f| f.write(linhas.join("\r\n")) }
  rescue StandardError => e
    File.open(ARQUIVO, "wb") { |f| f.write("ERRO: #{e.class}: #{e.message}") }
  end
end

# Roda uma vez, no primeiro quadro em que ja existe mapa, para garantir que o
# Graphics esteja de pe.
EventHandlers.add(:on_frame_update, :prism_font_probe,
  proc {
    next if $prism_font_probe_feito
    $prism_font_probe_feito = true
    PrismFontProbe.rodar
  }
)
