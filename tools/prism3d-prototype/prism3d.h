/*
** prism3d.h
**
** O renderizador 3D do Prism.
**
** Este arquivo e a peca que vai para dentro do mkxp-z. Aqui ele roda num
** programa de teste com SDL e OpenGL; la ele vira o corpo de um SceneElement,
** desenhando no mesmo contexto e no mesmo framebuffer que o renderizador 2D do
** RGSS ja usa.
**
** Por isso duas regras que parecem exagero num teste e nao sao:
**
** 1. `draw()` nao cria nem destroi nada. Tudo que e caro nasce em `init()`.
** 2. `draw()` devolve o estado de OpenGL exatamente como encontrou. O motor 2D
**    assume profundidade desligada, mistura ligada e nenhum VAO preso, e o
**    cache de estado dele (GLState) nem sequer conhece profundidade.
*/

#ifndef PRISM3D_H
#define PRISM3D_H

#include <vector>

#include "prism3d-math.h"

namespace Prism3D {

/** Uma caixa no mundo. E o unico tipo de malha do primeiro marco. */
struct Box {
    Vec3 at;
    Vec3 size;
    /** Giro em volta do eixo vertical, em radianos. */
    float yaw;
    float red, green, blue;
};

class Renderer {
public:
    Renderer();
    ~Renderer();

    /** Compila o shader e sobe a malha do cubo. Uma vez, fora do desenho. */
    bool init();
    void fini();

    void clear() { boxes.clear(); }
    void add(const Box &box) { boxes.push_back(box); }
    size_t count() const { return boxes.size(); }
    Box &at(size_t index) { return boxes[index]; }

    void setCamera(const Vec3 &eye, const Vec3 &target, float fovDegrees);

    /**
     * Desenha, dentro do ciclo de desenho do motor.
     *
     * `width` e `height` sao os do alvo corrente, so para a proporcao da
     * camera. O viewport em si nao e tocado: no mkxp-z mexer nele e proibido
     * durante o desenho.
     *
     * `clearDepth` diz se limpamos o buffer de profundidade antes. No motor
     * isso acontece uma vez por quadro, e com o teste de tesoura desligado,
     * porque glClear respeita tesoura e o ciclo de desenho deixa ela ligada.
     */
    void draw(int width, int height, bool clearDepth = true);

    /** So para o teste: desenhar sem profundidade prova que ela e quem ordena. */
    bool depthEnabled = true;

private:
    unsigned int program = 0;
    unsigned int vao = 0, vbo = 0, ebo = 0;
    int indexCount = 0;

    int uniformModel = -1;
    int uniformViewProjection = -1;
    int uniformColor = -1;

    Mat4 view = Mat4::identity();
    float fov = 45.0f;
    Vec3 eye = Vec3(0, 0, 5);
    Vec3 target = Vec3(0, 0, 0);

    std::vector<Box> boxes;
};

} // namespace Prism3D

#endif // PRISM3D_H
