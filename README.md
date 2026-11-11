# PRESA

Protótipo mobile de sobrevivência — visceral, minimalista, touch-first.

Sob a marca **Minha Aposentadoria**, sem parecer dashboard de aposentadoria: você é a presa. Arraste. Fuja. Aguente.

## Como rodar

Qualquer servidor estático na raiz do repo:

```bash
python3 -m http.server 8080
```

Abra `http://localhost:8080` no celular (rede local) ou no desktop para testar.

Também funciona abrindo `index.html` direto no navegador, mas preferível via servidor (áudio/haptics e PWA-ish behavior).

## Como jogar

1. Toque em **Jogar**.
2. **Arraste** o círculo claro com o dedo para escapar dos fragmentos vermelhos.
3. Sobreviva o máximo possível — a pressão sobe com o tempo.
4. Colisão = fim. Toque **De novo** para outra run.

Desktop: arraste com o mouse; `Espaço` / `Enter` inicia ou reinicia.

Recorde (melhor tempo) fica salvo no `localStorage` do navegador.

## Stack

HTML + CSS + Canvas 2D + Web Audio. Sem frameworks.
