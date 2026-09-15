# Protótipo do renderizador 3D

Teste isolado do `Prism3D::Renderer`, o pedaço de C++ que vai para dentro do
fork do mkxp-z. Ele não depende do mkxp-z: sobe uma janela SDL com contexto
OpenGL, que é exatamente o que o mkxp-z faz em `src/main.cpp`, e desenha pelo
mesmo código que virará o corpo de um `SceneElement`.

Existe para provar a lógica de GL (matriz, shader, VAO, VBO, EBO e buffer de
profundidade) **antes** de pagar o custo de compilar o motor inteiro, que
constrói as dependências a partir do fonte, incluindo o próprio Ruby.

## Rodar

```bash
make
xvfb-run -a ./prism3d-test saida        # em máquina sem tela
```

Precisa de `libsdl2-dev` e `libgl1-mesa-dev`. As imagens saem em PPM, que não
exige biblioteca nenhuma para gravar.

## O que as quatro imagens provam

`01-frente`, `02-girado-25` e `03-girado-55` são o mesmo par de cubos em giros
diferentes. As faces mudam de proporção e a lateral aparece conforme o giro,
que é coisa que imagem girada não faz: sprite girado gira a imagem inteira e
nunca revela face nova.

`04-sem-depth` é o quadro de 25 graus com o teste de profundidade desligado, e
é a prova principal. Nos dois casos a ordem de desenho é deliberadamente
errada, o cubo de perto primeiro e o de longe depois. Com profundidade ligada
o resultado sai certo assim mesmo, porque quem decide é o buffer. Desligada, o
cubo de longe pinta por cima do de perto.

## O que este código já respeita do mkxp-z

`draw()` não cria nem destrói recurso nenhum: tudo que é caro nasce em
`init()`. E ele devolve o estado de OpenGL como encontrou, porque o renderizador
2D do RGSS assume profundidade desligada e o cache de estado do motor
(`GLState`) nem conhece profundidade. A limpeza do buffer de profundidade
desliga o teste de tesoura antes, porque `glClear` respeita tesoura e o ciclo
de desenho do motor deixa ela ligada.
