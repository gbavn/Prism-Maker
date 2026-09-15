/*
** Teste isolado do renderizador 3D do Prism.
**
** Nao depende do mkxp-z: sobe uma janela SDL com contexto OpenGL, que e
** exatamente o que o mkxp-z faz em src/main.cpp, e desenha pelo mesmo codigo
** que vai virar o SceneElement do fork.
**
** O que ele prova, e por isso as imagens sao o resultado:
**
**  1. o cubo e malha de verdade: girar muda a proporcao das faces e revela
**     face nova, coisa que imagem girada nao faz;
**  2. a profundidade e quem ordena: dois cubos se recortam pela silhueta, e
**     desligando o teste de profundidade a ordem de desenho passa a mandar,
**     o que deixa o resultado visivelmente errado.
**
** Uso: ./prism3d-test <pasta-de-saida>
*/

#define GL_GLEXT_PROTOTYPES 1
#include <SDL2/SDL.h>
#include <SDL2/SDL_opengl.h>

#include <cstdio>
#include <string>
#include <vector>

#include "prism3d.h"

static const int WIDTH = 512;
static const int HEIGHT = 384;

/** Grava o quadro como PPM, que nao precisa de biblioteca nenhuma. */
static bool savePPM(const std::string &path, int width, int height) {
    std::vector<unsigned char> pixels(width * height * 3);
    glPixelStorei(GL_PACK_ALIGNMENT, 1);
    glReadPixels(0, 0, width, height, GL_RGB, GL_UNSIGNED_BYTE, pixels.data());

    FILE *file = std::fopen(path.c_str(), "wb");
    if (!file) return false;

    std::fprintf(file, "P6\n%d %d\n255\n", width, height);
    // O OpenGL le de baixo para cima; a imagem se escreve de cima para baixo.
    for (int y = height - 1; y >= 0; --y)
        std::fwrite(&pixels[y * width * 3], 1, width * 3, file);

    std::fclose(file);
    return true;
}

int main(int argc, char *argv[]) {
    const std::string out = argc > 1 ? argv[1] : ".";

    if (SDL_Init(SDL_INIT_VIDEO) != 0) {
        std::fprintf(stderr, "SDL nao subiu: %s\n", SDL_GetError());
        return 1;
    }

    SDL_GL_SetAttribute(SDL_GL_DOUBLEBUFFER, 1);
    SDL_GL_SetAttribute(SDL_GL_DEPTH_SIZE, 24);

    SDL_Window *window = SDL_CreateWindow("Prism3D", SDL_WINDOWPOS_CENTERED,
                                          SDL_WINDOWPOS_CENTERED, WIDTH, HEIGHT,
                                          SDL_WINDOW_OPENGL);
    if (!window) {
        std::fprintf(stderr, "janela nao abriu: %s\n", SDL_GetError());
        return 1;
    }

    SDL_GLContext context = SDL_GL_CreateContext(window);
    if (!context) {
        std::fprintf(stderr, "contexto nao subiu: %s\n", SDL_GetError());
        return 1;
    }

    std::printf("GL Renderer: %s\n", glGetString(GL_RENDERER));
    std::printf("GL Version : %s\n", glGetString(GL_VERSION));

    Prism3D::Renderer renderer;
    if (!renderer.init()) return 1;

    // Dois cubos que se cruzam na tela e estao em profundidades diferentes.
    // O laranja fica mais longe da camera; o azul, mais perto, cobrindo um
    // pedaco do laranja. A sobreposicao e o ponto: sem ela nao ha nada para a
    // profundidade resolver, e o teste nao provaria nada.
    Prism3D::Box far_ = {};
    far_.at = Prism3D::Vec3(-0.30f, 0.15f, -1.4f);
    far_.size = Prism3D::Vec3(1.5f, 1.5f, 1.5f);
    far_.red = 0.90f; far_.green = 0.45f; far_.blue = 0.20f;

    Prism3D::Box near_ = {};
    near_.at = Prism3D::Vec3(0.30f, -0.35f, 0.9f);
    near_.size = Prism3D::Vec3(1.1f, 1.1f, 1.1f);
    near_.red = 0.30f; near_.green = 0.55f; near_.blue = 0.95f;

    renderer.setCamera(Prism3D::Vec3(0, 1.9f, 4.6f), Prism3D::Vec3(0, 0, 0), 45.0f);

    glViewport(0, 0, WIDTH, HEIGHT);

    struct Shot { const char *name; float yaw; bool depth; };
    const Shot shots[] = {
        {"01-frente.ppm",     0.0f,  true},
        {"02-girado-25.ppm",  0.44f, true},
        {"03-girado-55.ppm",  0.96f, true},
        {"04-sem-depth.ppm",  0.44f, false},
    };

    for (const Shot &shot : shots) {
        // O cubo de tras gira; o da frente fica parado, para a comparacao
        // entre as imagens isolar o efeito do giro.
        far_.yaw = shot.yaw;
        near_.yaw = shot.yaw * 0.5f;

        renderer.clear();
        // Ordem de desenho deliberadamente errada: o cubo de perto entra
        // primeiro e o de longe depois. Com profundidade ligada o resultado
        // sai certo assim mesmo, porque quem decide e o buffer. Desligada, o
        // de longe pinta por cima do de perto, e o erro fica gritante. E essa
        // diferenca entre as duas imagens que prova que ha profundidade.
        renderer.add(near_);
        renderer.add(far_);
        renderer.depthEnabled = shot.depth;

        glClearColor(0.10f, 0.11f, 0.14f, 1.0f);
        glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);

        renderer.draw(WIDTH, HEIGHT, true);

        SDL_GL_SwapWindow(window);
        if (!savePPM(out + "/" + shot.name, WIDTH, HEIGHT)) {
            std::fprintf(stderr, "nao consegui gravar %s\n", shot.name);
            return 1;
        }
        std::printf("gravado %s\n", shot.name);
    }

    renderer.fini();
    SDL_GL_DeleteContext(context);
    SDL_DestroyWindow(window);
    SDL_Quit();
    return 0;
}
