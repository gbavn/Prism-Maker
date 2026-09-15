#define GL_GLEXT_PROTOTYPES 1
#include <SDL2/SDL_opengl.h>

#include <cstdio>
#include <cstring>

#include "prism3d.h"

namespace Prism3D {

/*
** Os dois shaders.
**
** No fork eles viram arquivos em shader/ e entram no binario pelo mesmo
** mecanismo dos shaders do motor. Aqui ficam embutidos para o teste nao
** depender de caminho de arquivo.
**
** A versao pedida e a 100 do GLSL ES, que e o minimo que roda tanto no
** OpenGL de desktop quanto no GLES por ANGLE, que e o caminho do macOS com
** Apple Silicon. Nada aqui usa recurso mais novo que isso.
*/
static const char *vertexSource = R"(
attribute vec3 position;
attribute vec3 normal;

uniform mat4 model;
uniform mat4 viewProjection;

varying vec3 vNormal;

void main() {
    vNormal = mat3(model[0].xyz, model[1].xyz, model[2].xyz) * normal;
    gl_Position = viewProjection * model * vec4(position, 1.0);
}
)";

static const char *fragmentSource = R"(
#ifdef GL_ES
precision mediump float;
#endif

uniform vec3 color;
varying vec3 vNormal;

void main() {
    /* Iluminacao de uma luz so, fixa. Serve para as faces se distinguirem:
       sem isso o cubo vira uma silhueta chapada e ninguem consegue dizer se
       ele girou. */
    vec3 light = normalize(vec3(-0.4, 0.9, 0.55));
    float lambert = max(dot(normalize(vNormal), light), 0.0);
    gl_FragColor = vec4(color * (0.45 + 0.55 * lambert), 1.0);
}
)";

static unsigned int compile(unsigned int type, const char *source) {
    const unsigned int shader = glCreateShader(type);
    glShaderSource(shader, 1, &source, nullptr);
    glCompileShader(shader);

    int ok = 0;
    glGetShaderiv(shader, GL_COMPILE_STATUS, &ok);
    if (!ok) {
        char log[1024] = {};
        glGetShaderInfoLog(shader, sizeof(log) - 1, nullptr, log);
        std::fprintf(stderr, "Prism3D: shader nao compilou: %s\n", log);
        glDeleteShader(shader);
        return 0;
    }
    return shader;
}

Renderer::Renderer() {}
Renderer::~Renderer() { fini(); }

bool Renderer::init() {
    const unsigned int vertex = compile(GL_VERTEX_SHADER, vertexSource);
    const unsigned int fragment = compile(GL_FRAGMENT_SHADER, fragmentSource);
    if (!vertex || !fragment) return false;

    program = glCreateProgram();
    glAttachShader(program, vertex);
    glAttachShader(program, fragment);
    // Posicao e normal em lugares fixos, do mesmo jeito que o mkxp-z prende
    // os atributos dele em Shader::Attribute.
    glBindAttribLocation(program, 0, "position");
    glBindAttribLocation(program, 1, "normal");
    glLinkProgram(program);

    int linked = 0;
    glGetProgramiv(program, GL_LINK_STATUS, &linked);
    if (!linked) {
        char log[1024] = {};
        glGetProgramInfoLog(program, sizeof(log) - 1, nullptr, log);
        std::fprintf(stderr, "Prism3D: programa nao ligou: %s\n", log);
        return false;
    }
    glDeleteShader(vertex);
    glDeleteShader(fragment);

    uniformModel = glGetUniformLocation(program, "model");
    uniformViewProjection = glGetUniformLocation(program, "viewProjection");
    uniformColor = glGetUniformLocation(program, "color");

    /* O cubo: 24 vertices, quatro por face, porque cada face tem a propria
       normal. Compartilhar os oito cantos daria normal media e o cubo sairia
       com aparencia de bola mal feita. */
    struct Vertex { float x, y, z, nx, ny, nz; };
    const Vertex vertices[24] = {
        // frente (+z)
        {-0.5f, -0.5f,  0.5f,  0, 0, 1}, { 0.5f, -0.5f,  0.5f,  0, 0, 1},
        { 0.5f,  0.5f,  0.5f,  0, 0, 1}, {-0.5f,  0.5f,  0.5f,  0, 0, 1},
        // tras (-z)
        { 0.5f, -0.5f, -0.5f,  0, 0, -1}, {-0.5f, -0.5f, -0.5f,  0, 0, -1},
        {-0.5f,  0.5f, -0.5f,  0, 0, -1}, { 0.5f,  0.5f, -0.5f,  0, 0, -1},
        // direita (+x)
        { 0.5f, -0.5f,  0.5f,  1, 0, 0}, { 0.5f, -0.5f, -0.5f,  1, 0, 0},
        { 0.5f,  0.5f, -0.5f,  1, 0, 0}, { 0.5f,  0.5f,  0.5f,  1, 0, 0},
        // esquerda (-x)
        {-0.5f, -0.5f, -0.5f, -1, 0, 0}, {-0.5f, -0.5f,  0.5f, -1, 0, 0},
        {-0.5f,  0.5f,  0.5f, -1, 0, 0}, {-0.5f,  0.5f, -0.5f, -1, 0, 0},
        // topo (+y)
        {-0.5f,  0.5f,  0.5f,  0, 1, 0}, { 0.5f,  0.5f,  0.5f,  0, 1, 0},
        { 0.5f,  0.5f, -0.5f,  0, 1, 0}, {-0.5f,  0.5f, -0.5f,  0, 1, 0},
        // base (-y)
        {-0.5f, -0.5f, -0.5f,  0, -1, 0}, { 0.5f, -0.5f, -0.5f,  0, -1, 0},
        { 0.5f, -0.5f,  0.5f,  0, -1, 0}, {-0.5f, -0.5f,  0.5f,  0, -1, 0},
    };

    unsigned short indices[36];
    for (int face = 0; face < 6; ++face) {
        const unsigned short base = static_cast<unsigned short>(face * 4);
        const int at = face * 6;
        indices[at + 0] = base;
        indices[at + 1] = base + 1;
        indices[at + 2] = base + 2;
        indices[at + 3] = base;
        indices[at + 4] = base + 2;
        indices[at + 5] = base + 3;
    }
    indexCount = 36;

    glGenVertexArrays(1, &vao);
    glBindVertexArray(vao);

    glGenBuffers(1, &vbo);
    glBindBuffer(GL_ARRAY_BUFFER, vbo);
    glBufferData(GL_ARRAY_BUFFER, sizeof(vertices), vertices, GL_STATIC_DRAW);

    glGenBuffers(1, &ebo);
    glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, ebo);
    glBufferData(GL_ELEMENT_ARRAY_BUFFER, sizeof(indices), indices, GL_STATIC_DRAW);

    glEnableVertexAttribArray(0);
    glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, sizeof(Vertex), (void *)0);
    glEnableVertexAttribArray(1);
    glVertexAttribPointer(1, 3, GL_FLOAT, GL_FALSE, sizeof(Vertex),
                          (void *)(sizeof(float) * 3));

    glBindVertexArray(0);
    glBindBuffer(GL_ARRAY_BUFFER, 0);
    glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, 0);

    return true;
}

void Renderer::fini() {
    if (ebo) { glDeleteBuffers(1, &ebo); ebo = 0; }
    if (vbo) { glDeleteBuffers(1, &vbo); vbo = 0; }
    if (vao) { glDeleteVertexArrays(1, &vao); vao = 0; }
    if (program) { glDeleteProgram(program); program = 0; }
}

void Renderer::setCamera(const Vec3 &newEye, const Vec3 &newTarget, float fovDegrees) {
    eye = newEye;
    target = newTarget;
    fov = fovDegrees;
    view = Mat4::lookAt(eye, target, Vec3(0, 1, 0));
}

void Renderer::draw(int width, int height, bool clearDepth) {
    if (!program || boxes.empty()) return;

    /* O estado que o renderizador 2D espera encontrar de volta. No fork, o
       que for do GLState do motor vai por push/pop; o que ele nao conhece,
       que e justamente profundidade e face traseira, e salvo aqui. */
    const GLboolean hadDepthTest = glIsEnabled(GL_DEPTH_TEST);
    const GLboolean hadCullFace = glIsEnabled(GL_CULL_FACE);
    const GLboolean hadBlend = glIsEnabled(GL_BLEND);
    GLboolean hadDepthMask = GL_TRUE;
    glGetBooleanv(GL_DEPTH_WRITEMASK, &hadDepthMask);
    GLint hadProgram = 0;
    glGetIntegerv(GL_CURRENT_PROGRAM, &hadProgram);

    if (clearDepth) {
        /* glClear respeita o teste de tesoura, e o ciclo de desenho do motor
           deixa a tesoura ligada na viewport corrente. Sem desligar, a limpeza
           sairia recortada. O proprio mkxp-z faz esse push em graphics.cpp
           antes de um blit, pelo mesmo motivo. */
        const GLboolean hadScissor = glIsEnabled(GL_SCISSOR_TEST);
        if (hadScissor) glDisable(GL_SCISSOR_TEST);
        glDepthMask(GL_TRUE);
        glClearDepth(1.0);
        glClear(GL_DEPTH_BUFFER_BIT);
        if (hadScissor) glEnable(GL_SCISSOR_TEST);
    }

    if (depthEnabled) {
        glEnable(GL_DEPTH_TEST);
        glDepthFunc(GL_LESS);
        glDepthMask(GL_TRUE);
    } else {
        glDisable(GL_DEPTH_TEST);
    }

    glEnable(GL_CULL_FACE);
    glCullFace(GL_BACK);
    glFrontFace(GL_CCW);
    glDisable(GL_BLEND);

    const float aspect = height > 0 ? (float)width / (float)height : 1.0f;
    const Mat4 projection =
        Mat4::perspective(fov * 3.14159265f / 180.0f, aspect, 0.1f, 200.0f);
    const Mat4 viewProjection = projection * view;

    glUseProgram(program);
    glUniformMatrix4fv(uniformViewProjection, 1, GL_FALSE, viewProjection.m);
    glBindVertexArray(vao);

    for (const Box &box : boxes) {
        const Mat4 model = Mat4::translation(box.at) *
                           Mat4::rotationY(box.yaw) *
                           Mat4::scale(box.size);
        glUniformMatrix4fv(uniformModel, 1, GL_FALSE, model.m);
        glUniform3f(uniformColor, box.red, box.green, box.blue);
        glDrawElements(GL_TRIANGLES, indexCount, GL_UNSIGNED_SHORT, nullptr);
    }

    /* Devolve tudo. A ordem importa: VAO por ultimo, senao um bind de buffer
       do motor cairia dentro do nosso VAO. */
    glBindVertexArray(0);
    glUseProgram(hadProgram);

    if (!hadCullFace) glDisable(GL_CULL_FACE);
    if (hadBlend) glEnable(GL_BLEND);
    glDepthMask(hadDepthMask);
    if (!hadDepthTest) glDisable(GL_DEPTH_TEST);
}

} // namespace Prism3D
