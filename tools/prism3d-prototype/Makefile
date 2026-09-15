# Teste isolado do renderizador 3D. Nao faz parte do build do editor.
#
#   make && ./prism3d-test saida
#
# Em maquina sem tela, rodar com xvfb-run.

CXXFLAGS := -std=c++17 -O2 -Wall -Wextra $(shell pkg-config --cflags sdl2)
LDFLAGS := $(shell pkg-config --libs sdl2) -lGL

prism3d-test: main.cpp prism3d.cpp prism3d.h prism3d-math.h
	$(CXX) $(CXXFLAGS) main.cpp prism3d.cpp -o $@ $(LDFLAGS)

clean:
	rm -f prism3d-test
